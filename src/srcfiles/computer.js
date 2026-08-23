// ===== SECTION: COMPUTER =====
// Session state and domain logic for the computer as a full-viewport
// takeover — not the modal shell (see main.html's #computer-screen,
// gated by #app[data-mode="computer"], which also hides the header and
// both sidebars and collapses #app's grid to just the computer). Being
// "on the computer" means the whole screen IS the monitor; the only way
// back is the taskbar's own Power Off control (computer.close), not a
// header/sidebar affordance. The sim keeps ticking underneath regardless
// (a roommate can still walk in, needs still decay) — it's just not drawn
// anywhere while this mode is active. Time passes only on actions with a
// real cost (working a block), never on navigating between screens.
//
// Hard rule: the entire screen must be derivable from gameState.world.
// computer. No app state may live in the DOM — RENDER.COMPUTER's job is
// to read this object and draw it, nothing else.

// Default on-screen size/position for a newly opened window, cascaded a
// little further down-right each time so opening several apps in a row
// doesn't stack them in an unreadable pile — same spirit as a real OS's
// "new window" placement.
const WINDOW_DEFAULTS = { w: 640, h: 460, baseX: 80, baseY: 60, cascadeStep: 32, cascadeSlots: 6 };

function defaultComputerState() {
  return {
    power: 'off',
    // One entry per currently-open app window, keyed by appId — absence
    // from this object means closed. At most one window per app (matches
    // `apps.<id>` already being a singleton per app, so no separate
    // "instance id" concept is needed). Replaces the old single-`view`
    // shape now that several apps can be open/visible at once.
    windows: {},
    focusedAppId: null,
    nextZIndex: 1,
    apps: {
      // Phase 2 gig board: replaces the old single-job `work` shape. `board`
      // is the currently-available gigs (regenerated on day rollover);
      // `accepted` is the player's in-progress work; `reputation` is 0-100
      // gating which gigs appear. `lastRefreshDay` guards idempotent
      // same-day generation (same pattern as generateApplicantsForDay).
      gigs: { board: [], accepted: [], reputation: 0, lastRefreshDay: 0 },
      shop: { cart: [], wishlist: [] },
      // Home app (decor-economy plan Phase 1): a second cart, same shape as
      // shop's. The app's catalog is DECOR_CATALOG_DEFS (defs.computer.js),
      // so cart entries are { defId, units } in this array exactly like
      // Nile's — checkoutCart is shared, pointed here by cartPath.
      home: { cart: [] },
      // historyIndex points at `history`'s current position for real
      // Back/Forward — -1 means nothing visited yet. A save from before
      // this field existed just reads it as undefined; browserGoBack/
      // Forward/renderBrowserNav all default a missing value to -1 rather
      // than needing a migration for one optional int.
      // afterHoursCategory must be a real string here, not left undefined
      // for the `|| 'featured'` defaults scattered across the render/fetch
      // paths to fill in: fetchAfterHoursClips' staleness guard compares
      // browser.afterHoursCategory against the catId it was called with,
      // and `undefined !== 'featured'` made it bail before every first
      // fetch — the grid never populated until the player happened to
      // click a category tab (the one path that writes the field).
      browser: {
        openSiteId: null, history: [], historyIndex: -1,
        afterHoursCategory: 'featured', afterHoursClips: null,
        afterHoursClipsLoading: false, afterHoursClipsError: null,
        afterHoursClipPage: 1,
        afterHoursSearchQuery: '',    // Phase 10: free-text search
        afterHoursTotalPages: 1,       // Phase 10: pagination
        afterHoursWatching: null, afterHoursSession: null,
        afterHoursWarmupUntilMs: 0,
        // Site Expansion Phase 1: per-source page cursors so Next Page
        // advances both feeds; kept in lockstep with afterHoursClipPage
        // (the UI-facing page number). afterHoursHost is the blended
        // clip's selected embed host for the host-switch row.
        afterHoursSourcePages: { ph: 1, ep: 1 },
        afterHoursHost: 'ph',
        // Site Expansion Phase 4: the search view's active filters (sort +
        // source; the duration chips are display-only).
        // NOTE: afterHoursLiked is intentionally NOT initialized here — Phase
        // 6 moved the durable list to world.afterHours.liked, and
        // AH_ensureState migrates any legacy pre-Phase-6 value once.
        // NOTE: the row cache, the per-clip related-rows cache and the
        // watched stack/snapshots are NOT here either. They are fetch state,
        // not app state, and this whole object is written into the save
        // wholesale (state.js queueWrite('world', 'computer', ...)) — keeping
        // them here pushed hundreds of clip records into every save and
        // carried dead 'fetching' entries across reloads, where the kick
        // guards read them as in-flight and left rows stuck on skeletons.
        // They live in module-level session caches in AFTERHOURS instead.
        afterHoursFilter: { sort: 'relevance', source: 'all' },
        // Site Expansion Phase 2: the routed mini-site. afterHoursView
        // holds the current routed view + params and the site's internal
        // history stack (its own back/forward — the sim's browser
        // Back/Forward still moves between SITES). afterHoursSeed anchors
        // the deterministic site chrome; old saves lazy-init both via the
        // AH module (AH_ensureState), since normalizeComputerState
        // deep-merges per-app but the saved browser object replaces the
        // fresh defaults wholesale.
        afterHoursView: { view: 'home', params: {}, stack: [] },
        afterHoursSeed: null,
      },
      classes: { enrolled: [], completed: [] },
      services: { hired: [] },
      // Phase 1 RoomList upgrade: classifieds now generates 30 cheap stubs
      // per day (lightweight records for browsing/filtering) rather than
      // 1-3 fully-formed NPCs immediately. Full NPCs are created on-demand
      // when the player loads a profile (Phase 3 fetch queue). `stubs` is
      // keyed by day; old days are pruned. `fetchQueue` holds in-progress
      // and completed full-generation jobs. `applicants` is kept for
      // backward compat — it's derived from fetchQueue entries that
      // reached 'ready' status. `viewingApplicantId` still drives the
      // profile detail screen.
      classifieds: {
        posted: { active: false, postedDay: 0 },
        applicants: [],
        viewingApplicantId: null,
        stubs: {},           // { [day]: [stub, ...] }
        fetchQueue: [],      // [{ stubId, status: 'fetching'|'ready'|'error', npcId, startedDay, day }]
        activeDay: 0,        // which day's stubs are currently being browsed
        filters: {           // Phase 2: client-side filter state
          gender: [],        // [] = all
          incomeBand: [],    // [] = all
          ageRange: [18, 60],
          sortBy: 'recent',  // recent|age|income|name
        },
        // Phase 4 Character Studio: the in-progress draft bible built by
        // the player in the Studio screen. `draft` is a partial bible
        // object (all fields optional; undefined = "roll it"). `aiBusy`
        // flags AI generation in progress (Phase 5). `aiPrompt` holds the
        // free-text description the player typed for AI generation.
        // Phase 5 (D12/D16/D17): the same screen also hosts the per-character
        // profile. Navigation state lives HERE, never the DOM (the house
        // pattern) — `mode` is 'create' (the draft builder) | 'list' (pick a
        // character) | 'profile' (a character's tabs); `viewingNpcId` is
        // which NPC is open; `tab` is the active profile tab; `editMode`
        // gates the schema-validated Edit Mode; `editSelections` holds the
        // Edit Mode pool toggles (path -> names). These keys never touch
        // `draft` — a saved game's residents and an in-progress draft must
        // not share a struct (the top-of-phase check).
        studio: {
          draft: {},
          aiBusy: false,
          aiPrompt: '',
          preview: null,       // cached preview NPC bible (Phase 4 live preview)
          mode: 'create',
          viewingNpcId: null,
          tab: 'personal',
          editMode: false,
          editSelections: {},
        },
        // Phase 7: favorited applicant IDs — players can shortlist
        // applicants they're interested in and come back to them later.
        favorites: [],
      },
      // DoorDrop (external-world plan Phase 5). `cart` entries are
      // { restaurantId, itemId, qty } — one restaurant per cart, same as a
      // real delivery app. `openRestaurantId` is which menu the detail
      // screen is showing (the same "app state, never DOM state" pattern
      // classifieds.viewingApplicantId uses). Placed orders do NOT live
      // here: they're world.foodOrders, because a driver's visit and the
      // handover are world events that outlive the app session.
      food: { cart: [], openRestaurantId: null, tipPct: FOOD_TUNING.defaultTipPct },
      // QuickCart (grocery delivery). Cart reuses the Nile/Home
      // { defId, units } shape (one store, no restaurantId dimension to
      // carry) — placed orders live in world.groceryOrders, same reasoning
      // as food's openRestaurantId comment above.
      grocery: { cart: [], tipPct: GROCERY_TUNING.defaultTipPct },
      // Escorts (external-world plan Phase 7): which profile is open.
      // Bookings themselves live in world.escortBookings (they outlive the
      // app session — the visit does too).
      escorts: { viewingNpcId: null },
      im: { threads: {}, viewingNpcId: null },
      stream: { subscriptions: [], watchHistory: [], resumePoints: {} },
      // Phase 11: investing portfolio. `holdings` is { fundId: { shares,
      // costBasis } } — shares are the amount invested, costBasis tracks
      // the original purchase for P&L display. `realizedGains` tracks
      // profit/loss from sells (for tax purposes).
      invest: { holdings: {}, realizedGains: 0, totalInvested: 0 },
      // ChefBook (food-overhaul Phase 8, D21/D22). `unlockedIds` is every
      // RECIPES/RESTAURANT_DISH_IDS id the player has tasted (EFFECTS'
      // EAT_ITEM hook appends, forever — same one-way-unlock shape as
      // autoCookCleared). `planner` is `[{ recipeId, day }]`, one row per
      // planned meal. `viewingRecipeId` is which card the detail screen
      // shows — app state, not DOM state, same as classifieds'
      // viewingApplicantId.
      recipes: { unlockedIds: [], planner: [], viewingRecipeId: null },
    },
  };
}

// A save written before this rework has `computer.view`/`computer.stack`
// instead of `computer.windows` — reopen whatever was in `view` as one
// window in the new shape rather than silently dropping "what you were
// doing." A save with no `computer` key at all (pre-P4) still falls
// through to a pristine defaultComputerState() via the `!raw` branch.
function normalizeComputerState(raw) {
  if (!raw) return defaultComputerState();
  const fresh = defaultComputerState();
  const windowsRaw = (raw.windows && typeof raw.windows === 'object') ? raw.windows : {};
  // Strip any window that lacks a rect — a broken IM window was created
  // by an early version of the Phase 7 Interview handler that didn't go
  // through openApp, leaving a window object without the rect/zIndex the
  // renderer needs. Also drop windows for appIds not in APP_DEFS (landmine
  // L4): renderWindows skips them silently and renderTaskbar iterates
  // APP_DEFS so no button exists for them, leaving a permanently invisible,
  // uncloseable window entry if a later rename (e.g. bills→bank) orphans
  // one.
  const windows = {};
  for (const [appId, win] of Object.entries(windowsRaw)) {
    if (win && win.rect && APP_DEFS[appId]) windows[appId] = win;
  }
  if (!raw.windows && raw.view && raw.view.appId && APP_DEFS[raw.view.appId]) {
    windows[raw.view.appId] = {
      screenId: raw.view.screenId || APP_DEFS[raw.view.appId]?.entryScreen,
      params: raw.view.params || {},
      rect: { x: WINDOW_DEFAULTS.baseX, y: WINDOW_DEFAULTS.baseY, w: WINDOW_DEFAULTS.w, h: WINDOW_DEFAULTS.h },
      zIndex: 1, minimized: false, maximized: false, prevRect: null,
    };
  }
  return {
    power: raw.power || 'off',
    windows,
    // Guard focusedAppId against pointing at a window the prune just
    // dropped — a stale focus with no window under it would confuse
    // whoever next asks topVisibleWindowAppId.
    focusedAppId: (raw.focusedAppId && windows[raw.focusedAppId]) ? raw.focusedAppId : (Object.keys(windows)[0] || null),
    nextZIndex: raw.nextZIndex || (Object.keys(windows).length + 1),
    // Back-fill any app added to the roster since this save was written.
    // Deep-merge per-app: start from the fresh default, then overlay the
    // saved fields. A shallow merge would drop new sub-fields added to
    // an existing app's state (e.g. browser.afterHoursSearchQuery added
    // in Phase 10 would be lost on old saves).
    apps: (() => {
      const merged = {};
      for (const appId of Object.keys(fresh.apps)) {
        const freshApp = fresh.apps[appId];
        const savedApp = raw.apps?.[appId];
        if (savedApp && typeof savedApp === 'object') {
          merged[appId] = { ...freshApp, ...savedApp };
        } else {
          merged[appId] = freshApp;
        }
      }
      // Also carry any unknown app that existed in the save but not in
      // fresh (shouldn't happen, but defensive).
      if (raw.apps) {
        for (const appId of Object.keys(raw.apps)) {
          if (!merged[appId]) merged[appId] = raw.apps[appId];
        }
      }
      return merged;
    })(),
  };
}

// Which content-flag settings currently apply — the character-creation
// choice if one was made, else CONTENT_CONFIG's defaults (P0's tone/
// content wiring reads the same fallback in PROMPT's buildContentSection).
function activeContentFlags(gameState) {
  return (gameState.meta.contentConfig && gameState.meta.contentConfig.contentFlags) || CONTENT_CONFIG.contentFlags;
}

// Bring appId's window to the front: highest zIndex, focused, visible.
// Used both for "open a new window" and "restore/click an existing one" —
// real OS taskbars treat both the same way once the window exists.
function focusWindow(gameState, appId) {
  const win = gameState.world.computer.windows[appId];
  if (!win) return;
  win.minimized = false;
  win.zIndex = ++gameState.world.computer.nextZIndex;
  gameState.world.computer.focusedAppId = appId;
}

function openApp(gameState, appId) {
  const def = APP_DEFS[appId];
  if (!def) return;
  const computer = gameState.world.computer;
  if (!computer.windows[appId]) {
    const count = Object.keys(computer.windows).length;
    const slot = count % WINDOW_DEFAULTS.cascadeSlots;
    computer.windows[appId] = {
      screenId: def.entryScreen, params: {},
      rect: {
        x: WINDOW_DEFAULTS.baseX + slot * WINDOW_DEFAULTS.cascadeStep,
        y: WINDOW_DEFAULTS.baseY + slot * WINDOW_DEFAULTS.cascadeStep,
        w: WINDOW_DEFAULTS.w, h: WINDOW_DEFAULTS.h,
      },
      zIndex: 0, minimized: false, maximized: false, prevRect: null,
    };
  }
  focusWindow(gameState, appId);
  // Contractor tutorial (contractor doc Phase 3): the first RenoFix open
  // fires the how-to-book hint (idempotent — the flag makes it one-shot).
  if (appId === 'upgrades') fireContractorMilestone(gameState, 'renofixOpened');
}

// Device-parameterised screen navigation (BrineOS 0.2). The default
// 'computer' device navigates the desktop shell's windows exactly as
// before. A phone device (data-device="phone" emitted by the phone shell)
// navigates world.phone's own navStack instead — a phone back-press must
// never mutate a computer window (landmine L1). world.phone doesn't exist
// until Phase 3, so the phone branch is a safe no-op until then.
function switchScreen(gameState, appId, screenId, params, device = 'computer') {
  if (device !== 'computer') {
    const phone = gameState.world?.phone;
    if (!phone?.navStack) return;
    phone.openAppId = appId;
    const top = phone.navStack[phone.navStack.length - 1];
    if (top && top.appId === appId && top.screenId === screenId) {
      top.params = params || {};
    } else {
      phone.navStack.push({ appId, screenId, params: params || {} });
    }
    return;
  }
  const win = gameState.world.computer.windows[appId];
  if (!win) return;
  win.screenId = screenId;
  win.params = params || {};
}

// The appId with the highest zIndex among currently open, non-minimized
// windows — who a close/minimize should hand focus to next, same as a
// real OS falling back to "whatever's now on top" rather than picking
// arbitrarily.
function topVisibleWindowAppId(gameState, excludeAppId) {
  let best = null;
  for (const [appId, win] of Object.entries(gameState.world.computer.windows)) {
    if (appId === excludeAppId || win.minimized) continue;
    if (!best || win.zIndex > gameState.world.computer.windows[best].zIndex) best = appId;
  }
  return best;
}

function closeWindow(gameState, appId) {
  const computer = gameState.world.computer;
  if (!computer.windows[appId]) return;
  delete computer.windows[appId];
  if (computer.focusedAppId === appId) {
    computer.focusedAppId = topVisibleWindowAppId(gameState, appId);
  }
}

function minimizeWindow(gameState, appId) {
  const computer = gameState.world.computer;
  const win = computer.windows[appId];
  if (!win) return;
  win.minimized = true;
  if (computer.focusedAppId === appId) {
    computer.focusedAppId = topVisibleWindowAppId(gameState, appId);
  }
}

// Maximize fills the desktop area (RENDER.DESKTOP sizes it via CSS, not a
// stored rect); toggling back restores whatever rect it had before.
function toggleMaximizeWindow(gameState, appId) {
  const win = gameState.world.computer.windows[appId];
  if (!win) return;
  if (win.maximized) {
    win.maximized = false;
    if (win.prevRect) win.rect = win.prevRect;
    win.prevRect = null;
  } else {
    win.prevRect = win.rect;
    win.maximized = true;
  }
  focusWindow(gameState, appId);
}

function closeComputer(gameState) {
  // Powering off is "walking away from the monitor," not closing every
  // app — windows/rects survive so reopening the computer resumes exactly
  // where you left it, same as a real OS session.
  gameState.world.computer.power = 'off';

  // A masturbating session needs no force-clear here (Phase 5.5, landmine
  // L11): it is derived from { device, startedTick }, and this device's
  // "in use" condition is precisely `computer.power === 'on'` — so
  // powering off already makes isAfterHoursSessionActive return false and
  // getPlayerVulnerableState stop reporting 'masturbating'. The session
  // record survives in state (it reads as a paused session on reopen);
  // the vulnerable state and time context self-heal with no clear site to
  // forget. This is the bug-pattern fix the old sticky boolean required —
  // see the plan's Phase 5.5.
}

// --- Gig board (Phase 2 — vocation rewrite) ---
// Replaces the single-job model. The player is a freelancer: accept
// discrete gigs from a board, work them block-by-block, deliver by a
// deadline for a lump sum. Income is lumpy — dry spells happen. See
// src/ref/vocation-and-gigs-plan.md.

// How much a work block's *progress* is worth scales with rest and mood.
// Kept from the old model — energy/mood scaling is the hook burnout
// (Phase 9) needs, and it applies just as well to gig progress as to the
// old flat pay. A bad night or a foul mood costs real throughput.
//
// Phase 5 (decision F, 5.4): the `device` dimension applies WORK_TUNING's
// phoneFocusMultiplier on top of the energy/mood product, so working from
// the phone is slower — the PC is where real throughput lives.
function computeFocusMultiplier(gameState, device = 'computer') {
  const player = gameState.player;
  // Relative to the player's OWN ceiling, not a hardcoded 100. energyMax
  // starts at 70 and grows (ENERGY.growthPerWorkout/growthPerGoodSleep),
  // so dividing by 100 meant a fully-rested player scored 0.7 on this
  // factor and could never reach peak focus until the ceiling itself hit
  // 100 — every gig took ~43% more blocks than nominal even at full rest,
  // and early-game earnings ran ~30% under design. Every other consumer of
  // the ceiling (UI's need clamp and sleep restore, SIM's resolveSleepHours)
  // already reads energyMax; this was the one site left behind.
  const energyMax = player.energyMax || NEEDS.energy.max;
  const energyFactor = clamp(player.energy / energyMax, WORK_TUNING.minEnergyFocus, WORK_TUNING.maxEnergyFocus);
  // Phase 8: burnout subtracts from effective mood before the focus
  // calculation, so grinding becomes progressively less profitable —
  // the death-spiral is the feature.
  const burnoutPenalty = getBurnoutMoodPenalty(player);
  const effectiveMood = Math.max(-1, player.mood - burnoutPenalty);
  const moodFactor = clamp((effectiveMood + 1) / 2, WORK_TUNING.minMoodFocus, WORK_TUNING.maxMoodFocus);
  let focus = energyFactor * moodFactor;
  if (device === 'phone') focus *= WORK_TUNING.phoneFocusMultiplier;
  return focus;
}

// Reputation tier for a given 0-100 rep score — the lowest tier whose
// floor the rep meets. Gates which gigs appear and how they pay.
function gigTier(rep) {
  let tier = GIG_REPUTATION_TIERS[0];
  for (const t of GIG_REPUTATION_TIERS) if (rep >= t.floor) tier = t;
  return tier;
}

// Pay multiplier for a gig, interpolated within its tier from the tier's
// payMult floor (at the tier's floor rep) to its ceiling (at the next
// tier's floor). At the top tier, interpolates against GIG_REP_MAX.
function gigPayMult(rep) {
  const tier = gigTier(rep);
  const idx = GIG_REPUTATION_TIERS.indexOf(tier);
  const next = GIG_REPUTATION_TIERS[idx + 1];
  const lo = tier.floor;
  const hi = next ? next.floor : GIG_REP_MAX;
  const frac = hi === lo ? 1 : clamp((rep - lo) / (hi - lo), 0, 1);
  return tier.payMult[0] + (tier.payMult[1] - tier.payMult[0]) * frac;
}

// Reputation scale for a gig — one shared curve for gains AND penalties,
// so a big gig is a big deal in both directions. Roughly one point of rep
// per block delivered (a 5-block gig = ×1 → +5 at base), capped.
function gigRepScale(gig) {
  return clamp(gig.blocks / GIG_REP_SIZE_BLOCK, GIG_REP_SIZE_MIN, GIG_REP_SIZE_MAX);
}

// Which templates a player at `rep` is eligible for (skill-gated). A
// low-skill player still sees the entry-level gigs; a high-skill player
// sees everything. minSkill is a hard gate — a tier that's reachable but
// for a skill the player lacks just doesn't offer that gig.
function eligibleGigTemplates(gameState) {
  const rep = gameState.world.computer.apps.gigs.reputation || 0;
  const tier = gigTier(rep);
  const tierFloor = tier.floor;
  return Object.values(GIG_TEMPLATES).filter(t => {
    if (skillLevel(gameState.player, t.skill) < t.minSkill) return false;
    // A gig's "tier" is implied by its pay band — entry gigs are Novice,
    // top gigs are Elite. Keep the board feeling coherent by only
    // offering gigs whose payout band sits at or below the player's rep
    // tier, so a Novice never sees the Elite infra project. The mapping
    // is by template index over the tiers (5 templates, 5 tiers, 1:1).
    const templateTierIdx = Object.keys(GIG_TEMPLATES).indexOf(t.id);
    const templateFloor = GIG_REPUTATION_TIERS[templateTierIdx]?.floor ?? 0;
    return tierFloor >= templateFloor;
  });
}

// Seeded, idempotent gig-board generation on day rollover — mirrors
// generateApplicantsForDay's same-day guard. Board size and quality
// scale with reputation; refresh is probabilistic so dry spells happen
// (the whole point of lumpy income). A day where the board stays stale
// is a day the player either works what they have or waits.
function generateGigsForDay(gameState, day) {
  const gigs = gameState.world.computer.apps.gigs;
  // Idempotent: once generated for this day, don't regenerate on a
  // re-processed rollover (crash recovery, fast-forward).
  if (gigs.lastRefreshDay === day) return;
  const rng = seededRng(gameState.meta.seed, `gig_board_${day}`);
  // Probabilistic refresh — ~70% of days the board turns over. A dry
  // spell is the intended state sometimes, so don't smooth this away.
  // Exception: day 1 always generates so the solo-start player has
  // immediate income available.
  if (day > 1 && rng() > 0.7) { gigs.lastRefreshDay = day; return; }

  const rep = gigs.reputation || 0;
  const tier = gigTier(rep);
  const eligible = eligibleGigTemplates(gameState);
  if (eligible.length === 0) { gigs.lastRefreshDay = day; return; }

  const size = tier.boardSize[0] + Math.floor(rng() * (tier.boardSize[1] - tier.boardSize[0] + 1));
  const payMult = gigPayMult(rep);
  const board = [];
  for (let i = 0; i < size; i++) {
    const tpl = eligible[Math.floor(rng() * eligible.length)];
    const blocks = tpl.blocksRange[0] + Math.floor(rng() * (tpl.blocksRange[1] - tpl.blocksRange[0] + 1));
    const deadlineDays = tpl.deadlineRange[0] + Math.floor(rng() * (tpl.deadlineRange[1] - tpl.deadlineRange[0] + 1));
    const client = tpl.clientPool[Math.floor(rng() * tpl.clientPool.length)];
    // ~20% rush gigs: shorter deadline, ~25% premium.
    const rush = rng() < 0.2;
    const effBlocks = rush ? Math.max(1, Math.ceil(blocks * 0.7)) : blocks;
    const effDeadline = rush ? Math.max(2, Math.ceil(deadlineDays * 0.6)) : deadlineDays;
    const payout = Math.round(tpl.basePayoutPerBlock * effBlocks * payMult * (rush ? 1.25 : 1));
    board.push({
      gigId: `gig_${day}_${i}`,
      templateId: tpl.id,
      label: tpl.label,
      client,
      category: tpl.category,
      blocks: effBlocks,
      deadlineDay: day + effDeadline,
      payout,
      rush,
    });
  }
  gigs.board = board;
  gigs.lastRefreshDay = day;
}

// Accept a gig off the board onto the player's accepted list. Subject to
// the concurrent-gig cap — the deadline pressure does the limiting, but
// unbounded acceptance would let a player hoard the whole board.
function acceptGig(gameState, gigId) {
  const gigs = gameState.world.computer.apps.gigs;
  const gig = gigs.board.find(g => g.gigId === gigId);
  if (!gig) return { ok: false, reason: 'That gig is no longer available.' };
  if (gigs.accepted.length >= GIG_MAX_CONCURRENT) return { ok: false, reason: `You can only hold ${GIG_MAX_CONCURRENT} gigs at once.` };
  gigs.board = gigs.board.filter(g => g.gigId !== gigId);
  gigs.accepted.push({ ...gig, blocksDone: 0, acceptedDay: gameState.meta.clock.day });
  return { ok: true, gig };
}

// Work one block on an accepted gig. Progress (not pay) scales with
// focus — a tired player gets less done per block, so the same gig takes
// more blocks and risks the deadline. Payout is a lump sum on delivery,
// routed through EARN_MONEY (same path as the old model) so Phase 6's
// quarterGross accumulator sees it. `device` (Phase 5.4) feeds the
// work-from-phone penalty through computeFocusMultiplier.
function workGigBlock(gameState, gigId, device) {
  const gigs = gameState.world.computer.apps.gigs;
  const gig = gigs.accepted.find(g => g.gigId === gigId);
  if (!gig) return { ok: false, reason: 'You have no such gig.' };
  if (gig.blocksDone >= gig.blocks) return { ok: false, reason: 'That gig is already complete — deliver it.' };
  if (gameState.meta.clock.day > gig.deadlineDay) return { ok: false, reason: 'That gig has passed its deadline.' };
  const focus = computeFocusMultiplier(gameState, device);
  // Phase 8: burnout makes grinding progressively less profitable. The
  // work-pay penalty scales progress down at high burnout levels — the
  // death-spiral is the feature.
  const burnoutMult = getBurnoutWorkPayMult(gameState.player);
  // Each CLICK advances progress by focus × burnoutMult × progressPerClick
  // (up to 2.0 blocks fresh, down to ~0.39 tired and burnt out), so a gig
  // takes roughly half its block count of clicks at full rest and low
  // energy/mood makes it drag — the grind becomes less profitable exactly
  // as burnout needs. Rounded to 2 decimals to avoid float drift.
  const progress = Math.round(focus * burnoutMult * GIG_TUNING.progressPerClick * 100) / 100;
  gig.blocksDone = Math.min(gig.blocks, gig.blocksDone + progress);
  gameState.player.energy = clamp(gameState.player.energy - GIG_ENERGY_PER_BLOCK, 0, 100);
  // Phase 8: track work BLOCKS per day (not clicks — each click completes
  // progressPerClick blocks) for burnout. Reset at day rollover.
  gigs.workBlocksToday = (gigs.workBlocksToday || 0) + progress;
  // Phase 5: computer work meters as device usage. One work block = 0.5h
  // of computer time at $0.04/kWh — small but itemised, so the player
  // sees "Computer — $X" next to "Heat — $206" on the electric bill.
  recordUtilityUsage(gameState, 'devices', 0.5);
  // food-overhaul Phase 2 (D2/D4): a worked gig block is active work, not
  // a couch sit — a small activity impulse lifts the metabolic rate and a
  // modest kcal lands on the ledger (the block itself already cost energy
  // above; this is the burn side of the daily equation).
  const act = METABOLISM.activities.workBlock;
  notePlayerActivity(gameState, act.impulse, act.kcal, gameState.meta.clock.day);
  return { ok: true, gig, progress };
}

// Deliver a completed gig: pay the lump sum, gain reputation, remove it.
// A gig delivered late (past deadlineDay) still pays but loses reputation.
function deliverGig(gameState, gigId) {
  const gigs = gameState.world.computer.apps.gigs;
  const gig = gigs.accepted.find(g => g.gigId === gigId);
  if (!gig) return { ok: false, reason: 'You have no such gig.' };
  if (gig.blocksDone < gig.blocks) return { ok: false, reason: 'That gig is not finished yet.' };
  const late = gameState.meta.clock.day > gig.deadlineDay;
  const effCtx = buildEffectContext(gameState, [], [], {}, []);
  applyEffects(parseEffectDSL(`EARN_MONEY ${gig.payout} gig`), effCtx);
  // Track gross for the quarterly tax bill (Phase 6).
  const taxes = gameState.world.taxes || (gameState.world.taxes = { quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0 });
  taxes.quarterGross = (taxes.quarterGross || 0) + gig.payout;
  // Optional auto-reserve: skim the tax rate into a protected balance.
  if (taxes.autoReserve) {
    const skim = Math.round(gig.payout * 0.27);
    taxes.reserve = (taxes.reserve || 0) + skim;
  }
  // Reputation: on-time delivery gains (more the earlier it's delivered),
  // late delivery loses. Scaled by gig size so big gigs matter more. A
  // rep tier promotion is a celebration — a bigger mood hit than any single
  // gig, and returned so the UI can announce it.
  const sizeFactor = gigRepScale(gig);
  const daysEarly = gig.deadlineDay - gameState.meta.clock.day;
  const repBefore = gigs.reputation || 0;
  const repDelta = late
    ? Math.round(GIG_REP_MISS * sizeFactor)
    : Math.round(GIG_REP_DELIVERY * sizeFactor + (daysEarly >= 2 ? GIG_REP_EARLY_BONUS : 0));
  gigs.reputation = clamp((gigs.reputation || 0) + repDelta, 0, GIG_REP_MAX);
  const tierUp = gigTier(repBefore).name !== gigTier(gigs.reputation).name
    ? { from: gigTier(repBefore).name, to: gigTier(gigs.reputation).name }
    : null;
  gigs.accepted = gigs.accepted.filter(g => g.gigId !== gigId);
  // Phase 6 (D13): delivering a finished gig is a dopamine hit — a mood
  // impulse scaled by the payout (a big contract feels better than a small
  // one), capped so no single delivery out-earns a good day's living.
  pushMoodImpulse(
    gameState.player,
    Math.min(MOOD_PAYOUTS.workGigCap, MOOD_PAYOUTS.workGigBase + gig.payout * MOOD_PAYOUTS.workGigPerDollar),
    gameState.meta.clock.day
  );
  if (tierUp) {
    pushMoodImpulse(gameState.player, MOOD_PAYOUTS.repTierUp, gameState.meta.clock.day);
  }
  return { ok: true, gig, late, payout: gig.payout, repDelta, tierUp };
}

// Abandon a gig — a deliberate choice that costs more reputation than a
// missed deadline, since the player took the work and walked away.
function abandonGig(gameState, gigId) {
  const gigs = gameState.world.computer.apps.gigs;
  const gig = gigs.accepted.find(g => g.gigId === gigId);
  if (!gig) return { ok: false, reason: 'You have no such gig.' };
  const sizeFactor = gigRepScale(gig);
  const repDelta = Math.round(GIG_REP_ABANDON * sizeFactor);
  gigs.reputation = clamp((gigs.reputation || 0) + repDelta, 0, GIG_REP_MAX);
  gigs.accepted = gigs.accepted.filter(g => g.gigId !== gigId);
  return { ok: true, gig, repDelta };
}

// Deadline check — called from UI's processDayRollover. A gig past its
// deadline with incomplete blocks is a missed deadline: reputation hit,
// partial or no pay scaled by how much was done, gig removed. A gig that
// was *complete* but never delivered by the deadline auto-delivers (the
// player finished on time; they just didn't click "deliver").
function processGigDeadlinesForDay(gameState, day) {
  const gigs = gameState.world.computer.apps.gigs;
  const results = [];
  const stillAccepted = [];
  for (const gig of gigs.accepted) {
    if (day <= gig.deadlineDay) { stillAccepted.push(gig); continue; }
    if (gig.blocksDone >= gig.blocks) {
      // Auto-deliver a finished-but-undelivered gig at the deadline.
      const r = deliverGig(gameState, gig.gigId);
      results.push({ gigId: gig.gigId, label: gig.label, autoDelivered: true, late: true, ...r });
      continue;
    }
    // Missed deadline: partial pay for work done (pro-rated), rep hit.
    const frac = gig.blocks > 0 ? gig.blocksDone / gig.blocks : 0;
    const partialPay = frac > 0 ? Math.round(gig.payout * frac * 0.5) : 0;
    if (partialPay > 0) {
      const effCtx = buildEffectContext(gameState, [], [], {}, []);
      applyEffects(parseEffectDSL(`EARN_MONEY ${partialPay} gig_partial`), effCtx);
      const taxes = gameState.world.taxes;
      if (taxes) taxes.quarterGross = (taxes.quarterGross || 0) + partialPay;
    }
    const sizeFactor = gigRepScale(gig);
    const repDelta = Math.round(GIG_REP_MISS * sizeFactor);
    gigs.reputation = clamp((gigs.reputation || 0) + repDelta, 0, GIG_REP_MAX);
    results.push({ gigId: gig.gigId, label: gig.label, missed: true, partialPay, repDelta });
  }
  gigs.accepted = stillAccepted;
  return results;
}

// --- Nile (shop) / Home (decor) apps ---
// Cart entries are { defId, units } — one "unit" is one click of Add to
// Cart, costing <catalog>[defId].price and, on checkout, delivering
// <catalog>[defId].buyQty items. Keeping "how many times you clicked" and
// "how many items that yields" separate is what lets a $4 dozen eggs be
// one cart line instead of a quantity-12 stack the player has to type.
//
// Both apps share ONE cart implementation (decor-economy plan D2): a
// `cartPath` ('apps.shop.cart' / 'apps.home.cart') says which cart to
// read and clear, a `catalog` (ITEM_DEFS / DECOR_CATALOG_DEFS) says which
// defs table prices come from. The defaults keep plain shop calls working
// exactly as before.

// Resolves a 'apps.<app>.cart'-style path to its holder object + key + the
// cart array, so add/remove/checkout never hand-resolve the same path
// three different ways. `holder` is null only if the path is unreachable.
function resolveCart(gameState, cartPath) {
  const parts = (cartPath || 'apps.shop.cart').split('.');
  const key = parts.pop();
  const holder = parts.reduce((cur, k) => cur && cur[k], gameState.world.computer);
  return { holder, key, cart: (holder && holder[key]) || [] };
}

function addToCart(gameState, defId, opts = {}) {
  const def = (opts.catalog || ITEM_DEFS)[defId];
  if (!def || def.price == null) return { ok: false, reason: 'Not sold here.' };
  const { holder, key, cart } = resolveCart(gameState, opts.cartPath);
  const existing = cart.find(c => c.defId === defId);
  if (existing) existing.units += 1;
  else cart.push({ defId, units: 1 });
  if (holder && !holder[key]) holder[key] = cart;
  return { ok: true };
}

function removeFromCart(gameState, defId, opts = {}) {
  const { holder, key, cart } = resolveCart(gameState, opts.cartPath);
  if (holder) holder[key] = cart.filter(c => c.defId !== defId);
}

function cartSubtotal(cart, catalog) {
  return cart.reduce((sum, c) => sum + ((catalog || ITEM_DEFS)[c.defId]?.price || 0) * c.units, 0);
}

// SPEND_MONEY covers the cart total + one flat delivery fee, and each
// cart line becomes a world.deliveries entry. Nothing lands in inventory
// yet — UI's processDeliveriesForDay SPAWN_ITEMs it onto the hallway
// doormat when the ETA hits, so the player (or a quick roommate) has to
// actually go get it. `cartPath`/`catalog` let Home (decor-economy plan
// Phase 1) reuse this exact function with its own cart and catalog — one
// function owns the charge/tax/delivery logic so the two callers can
// never drift apart.
function checkoutCart(gameState, opts = {}) {
  const catalog = opts.catalog || ITEM_DEFS;
  const { holder, key, cart } = resolveCart(gameState, opts.cartPath);
  if (cart.length === 0) return { ok: false, reason: 'Your cart is empty.' };
  const total = cartSubtotal(cart, catalog) + ECONOMY.deliveryFee;
  if (gameState.player.money < total) return { ok: false, reason: `Can't afford ${total} (you have ${Math.round(gameState.player.money)}).` };

  gameState.player.money -= total;
  // Phase 6: tech/electronics/tool purchases are tax-deductible for a
  // freelancer. Record the deductible portion (item price, not delivery
  // fee — delivery is a personal expense). Decor categories are room
  // names, never in TAX_CONFIG.deductibleCategories, so furniture never
  // deducts.
  let deductible = 0;
  cart.forEach(c => {
    const def = catalog[c.defId];
    if (def && TAX_CONFIG.deductibleCategories.includes(def.category)) {
      deductible += def.price * c.units;
    }
  });
  if (deductible > 0) recordTaxDeduction(gameState, deductible);
  const etaDay = gameState.meta.clock.day + 1;
  const deliveries = gameState.world.deliveries || (gameState.world.deliveries = []);
  cart.forEach((c, i) => {
    const def = catalog[c.defId];
    deliveries.push({
      id: `del_${gameState.meta.clock.day}_${gameState.meta.clock.minutes}_${i}`,
      defId: c.defId, qty: (def.buyQty || 1) * c.units,
      status: 'ordered', etaDay, orderedDay: gameState.meta.clock.day,
    });
  });
  if (holder) holder[key] = [];
  return { ok: true, total, etaDay, deductible };
}

// --- Decor placement (decor-economy plan Phase 2) ---
// Placing is the second half of the Home app: an owned, delivered decor
// item — an inventory stack whose defId is a DECOR_CATALOG_DEFS entry (D3/D8)
// — is consumed and becomes a REAL object instance in the target room's
// bucket (D4), carrying the `pos` the in-game Studio screen wrote. Not a
// ROOM_DECOR visual entry: every later system reads it exactly like any
// other object in that bucket (anchors, cleanliness, signals all treat it
// as furniture that's simply always been there).
// The instance is built inline rather than via makeObjectInstance because
// decor defIds are deliberately NOT in OBJECT_DEFS (they are priced in the
// Home catalog, never in ITEM_DEFS or OBJECT_DEFS — D1's boundary), and
// makeObjectInstance returns null for unknown defIds. Same seeded id shape
// (genObjectId + uniqueObjectSlot), so a given save reproduces the same
// instances byte-for-byte.
function placeDecorItem(gameState, { defId, roomId, pos }) {
  const def = DECOR_CATALOG_DEFS[defId];
  if (!def) return { ok: false, reason: 'That is not a buyable furniture item.' };
  if (!ROOMS[roomId]) return { ok: false, reason: 'That room does not exist.' };
  if (!DESIGN_SHAPES[def.shape]) return { ok: false, reason: `No placement shape for ${def.label}.` };
  const p = pos || {};
  const x = Number(p.x), y = Number(p.y), w = Number(p.w), h = Number(p.h);
  const rot = Number(p.rot) || 0;
  if (![x, y, w, h].every(Number.isFinite)) return { ok: false, reason: 'Give it a position first.' };
  if (w < 2 || h < 2) return { ok: false, reason: 'It needs to be big enough to stand on.' };
  const owned = (gameState.player.inventory || []).find(s => s.defId === defId);
  if (!owned || owned.qty < 1) return { ok: false, reason: `You don't own a ${def.label} to place.` };

  const { stacks } = removeStack(gameState.player.inventory, defId, 1);
  gameState.player.inventory = stacks;

  const bucketId = `room_${roomId}`;
  const bucketMap = gameState.objects[bucketId] || (gameState.objects[bucketId] = {});
  const slot = uniqueObjectSlot(bucketMap, gameState.meta.seed, bucketId, defId);
  const id = genObjectId(gameState.meta.seed, bucketId, slot, defId);
  bucketMap[id] = {
    id, defId, bucket: bucketId,
    pos: { x, y, w, h, rot },
    ownerId: null,
    state: {}, condition: 100, contents: [], evidence: null,
    discovered: {}, flags: {}, spawnedDay: gameState.meta.clock.day,
    meta: { placedDay: gameState.meta.clock.day },
  };
  return { ok: true, id, defId };
}

// Move/resize/rotate an already-placed decor object — the editor writes the
// new pos back into the instance. Objects without a `pos` are the world's
// own furniture and are not movable (D5: the player furnishes, not reshapes).
function moveDecorObject(gameState, objId, pos) {
  const obj = findObjectById(gameState, objId);
  if (!obj || !obj.pos) return { ok: false, reason: 'That is not a placed item.' };
  const p = pos || {};
  const x = Number(p.x), y = Number(p.y), w = Number(p.w), h = Number(p.h);
  const rot = Number(p.rot) || 0;
  if (![x, y, w, h].every(Number.isFinite)) return { ok: false, reason: 'Invalid placement.' };
  if (w < 2 || h < 2) return { ok: false, reason: 'It needs to be big enough to stand on.' };
  obj.pos = { x, y, w, h, rot };
  return { ok: true };
}

// The player-safe form of the designer's Delete: a placed decor object
// returns to inventory as a normal stack (D3 again — it is a good until it
// is placed). Nothing is ever destroyed. Decor defIds are unknown to
// ITEM_DEFS, so addStack's merge path (which keys on `stackable`) appends a
// fresh stack; coalescing same-defId stacks afterwards keeps the placement
// palette reading as one row per piece rather than a growing list of
// singles.
function pickUpDecorObject(gameState, objId) {
  const obj = findObjectById(gameState, objId);
  if (!obj || !obj.pos) return { ok: false, reason: 'That is not a placed item.' };
  if (!DECOR_CATALOG_DEFS[obj.defId]) return { ok: false, reason: 'This cannot be picked up.' };
  const bucketMap = gameState.objects[obj.bucket];
  if (bucketMap) delete bucketMap[obj.id];
  let inv = addStack(
    gameState.player.inventory, obj.defId, 1, 'player', obj.meta,
    gameDaysNow(gameState.meta.clock)
  );
  const same = inv.filter(s => s.defId === obj.defId);
  if (same.length > 1) {
    inv = inv.filter(s => s.defId !== obj.defId);
    inv.push({ defId: obj.defId, qty: same.reduce((n, s) => n + (s.qty || 0), 0), ownerId: 'player', meta: same[0].meta });
  }
  gameState.player.inventory = inv;
  return { ok: true, defId: obj.defId };
}

// --- Browser app ---

// Gated by CONTENT_CONFIG's flags — the browser itself doesn't special-
// case the adult site; it just refuses to open anything whose
// requiresContentFlag isn't currently on. RENDER.COMPUTER's
// filterByContentFlags keeps a gated site from even appearing in the
// home listing in the first place; this is the second, authoritative
// check for anyone who reaches visitSite some other way.
function visitSite(gameState, siteId) {
  const site = SITE_DEFS[siteId];
  if (!site) return { ok: false, reason: 'Page not found.' };
  if (site.requiresContentFlag && !activeContentFlags(gameState)[site.requiresContentFlag]) {
    return { ok: false, reason: 'This content is disabled in your settings.' };
  }
  const browser = gameState.world.computer.apps.browser;
  browser.openSiteId = siteId;
  const idx = browser.historyIndex ?? -1;
  // A fresh visit while sitting somewhere behind the end of history (the
  // player went Back, then clicked something new) discards the stale
  // forward branch — same as a real browser's address bar.
  if (idx < browser.history.length - 1) browser.history = browser.history.slice(0, idx + 1);
  browser.history.push({
    day: gameState.meta.clock.day, tick: getTickIndex(gameState.meta.clock.minutes),
    siteId, category: site.category, private: site.category === 'adult',
  });
  browser.historyIndex = browser.history.length - 1;
  return { ok: true, site };
}

// Back/Forward move the historyIndex pointer and reopen whatever site was
// there — no time cost, no re-applied visit effects, no new history
// entry: revisiting something already in history isn't a new "visit,"
// it's just looking at it again, the same distinction the real browser
// address bar makes.
function browserGoBack(gameState) {
  const browser = gameState.world.computer.apps.browser;
  const idx = browser.historyIndex ?? -1;
  if (idx <= 0) return { ok: false, reason: 'No earlier page.' };
  browser.historyIndex = idx - 1;
  browser.openSiteId = browser.history[browser.historyIndex].siteId;
  return { ok: true, site: SITE_DEFS[browser.openSiteId] };
}

function browserGoForward(gameState) {
  const browser = gameState.world.computer.apps.browser;
  const idx = browser.historyIndex ?? -1;
  if (idx < 0 || idx >= browser.history.length - 1) return { ok: false, reason: 'No later page.' };
  browser.historyIndex = idx + 1;
  browser.openSiteId = browser.history[browser.historyIndex].siteId;
  return { ok: true, site: SITE_DEFS[browser.openSiteId] };
}

// --- Classes app ---
// Enrolling is the commitment (money, gated by skill level like a job
// application); attending lessons is the payoff, one timed lesson at a
// time, until progress reaches the course's lesson count.

function enrollInCourse(gameState, courseId) {
  const course = COURSE_DEFS[courseId];
  if (!course) return { ok: false, reason: 'No such course.' };
  const classes = gameState.world.computer.apps.classes;
  if (classes.enrolled.some(e => e.courseId === courseId) || classes.completed.includes(courseId)) {
    return { ok: false, reason: 'Already enrolled or completed.' };
  }
  if (skillLevel(gameState.player, course.skillId) < course.requiresLevel) {
    return { ok: false, reason: `Requires ${course.skillId} level ${course.requiresLevel}.` };
  }
  if (gameState.player.money < course.cost) return { ok: false, reason: `Can't afford $${course.cost}.` };
  gameState.player.money -= course.cost;
  // Phase 6: tech skill courses are tax-deductible (skill training
  // directly related to freelance work).
  if (TAX_CONFIG.deductibleSkillIds.includes(course.skillId)) {
    recordTaxDeduction(gameState, course.cost);
  }
  classes.enrolled.push({ courseId, progress: 0 });
  return { ok: true, course };
}

function attendLesson(gameState, courseId) {
  const course = COURSE_DEFS[courseId];
  const classes = gameState.world.computer.apps.classes;
  const enrollment = classes.enrolled.find(e => e.courseId === courseId);
  if (!course || !enrollment) return { ok: false, reason: 'Not enrolled in that.' };

  enrollment.progress += 1;
  // Phase 6 (D13): lesson XP routes through the single awardSkillXp site,
  // so a level-up mid-course still fires its mood impulse; each lesson
  // attended is its own small win, and finishing the course is a bigger one.
  awardSkillXp(gameState.player, course.skillId, course.xpPerLesson, gameState.meta.clock.day);
  pushMoodImpulse(gameState.player, MOOD_PAYOUTS.courseLesson, gameState.meta.clock.day);

  const completed = enrollment.progress >= course.lessons;
  if (completed) {
    pushMoodImpulse(gameState.player, MOOD_PAYOUTS.courseComplete, gameState.meta.clock.day);
    classes.enrolled = classes.enrolled.filter(e => e.courseId !== courseId);
    classes.completed.push(courseId);
  }
  return { ok: true, course, xpGain: course.xpPerLesson, completed, ticks: course.ticksPerLesson };
}

// --- Services app ---

function hireService(gameState, serviceId) {
  const service = SERVICE_DEFS[serviceId];
  if (!service) return { ok: false, reason: 'No such service.' };
  const services = gameState.world.computer.apps.services;
  if (services.hired.some(h => h.serviceId === serviceId)) return { ok: false, reason: 'Already hired.' };
  if (gameState.player.money < service.costPerVisit) return { ok: false, reason: `Can't afford $${service.costPerVisit}.` };
  gameState.player.money -= service.costPerVisit;
  services.hired.push({ serviceId, nextDay: gameState.meta.clock.day + service.cadenceDays });
  return { ok: true, service };
}

function cancelService(gameState, serviceId) {
  const services = gameState.world.computer.apps.services;
  const had = services.hired.some(h => h.serviceId === serviceId);
  services.hired = services.hired.filter(h => h.serviceId !== serviceId);
  return { ok: had, reason: had ? null : 'Not currently hired.' };
}

// Resets every dirty-capable state on an object back to its cleanest enum
// value — `def.states[key][0]` is that value by construction (every
// OBJECT_DEFS entry lists the clean value first: 'clean' before 'crusty'
// before 'filthy', 'empty' before 'full', etc.), so cleaning needs no
// second parallel "what does clean look like" table.
//
// Food-overhaul Phase 4 (D9/D11): dish dirt is a MAP now, not a state enum
// — a 'dishes' dirtyWhen key clears the object's dish map (and its derived
// ladder) instead of a single state write. And an idle, functional
// DISHWASHER in a kitchen makes the cleaner RUN IT for sink/table loads at
// or above DISHWASH_TUNING.dishwasherMinLoadUnits — the machine does the
// work (the load clears when its lazy cycle completes), whatever spills
// past its capacity gets hand-washed. This is the "NPC washing drive can
// run the dishwasher" path: the clean_common drive, the maid and the
// cleaning service all route through here.
function cleanRoomObjects(gameState, roomId) {
  const bucket = gameState.objects[`room_${roomId}`];
  if (!bucket) return 0;
  let cleanedCount = 0;

  // Preferred dishwasher for this room (only exists in the kitchen). Must
  // be functional, not mid-cycle, and have at least a real load to take —
  // a cleaner doesn't run a cycle for one stray fork.
  const dishwasher = Object.values(bucket).find(o => o.defId === 'dishwasher');
  let dwReady = false;
  if (dishwasher) {
    const now = gameDaysNow(gameState.meta.clock);
    resolveDishwasherCycle(dishwasher, now);
    const scopeUnits = Object.values(bucket)
      .filter(o => o.defId === 'sink_kitchen' || o.defId === 'kitchen_table' || o.defId === 'dining_table')
      .reduce((sum, o) => sum + dishUnitsOf(o), 0);
    dwReady = dishwasherCycleProgress(dishwasher, now) === 'idle'
      && isFacilityFunctional(gameState, 'kitchen_appliances')
      && scopeUnits >= DISHWASH_TUNING.dishwasherMinLoadUnits;
  }

  // Sink + tables in this room, so a machine can be offered their dishes.
  const dishSurfaces = Object.values(bucket).filter(o =>
    o.defId === 'sink_kitchen' || o.defId === 'kitchen_table' || o.defId === 'dining_table');

  for (const obj of Object.values(bucket)) {
    const def = OBJECT_DEFS[obj.defId];
    if (!def?.dirtyWhen) continue;
    for (const key of Object.keys(def.dirtyWhen)) {
      if (key === 'dishes') {
        if (obj.dishes && dishUnitsOf(obj) > 0) {
          if (dwReady) {
            // Route through the machine: load up to its remaining capacity,
            // start the cycle, count what's loaded as cleaned (the lazy
            // cycle resolver empties it). Whatever won't fit is hand-washed.
            const capacity = dishwasherCapacityUnits(gameState) - dishwasherLoadUnits(dishwasher);
            const { moved } = moveDishUnitsToLoad(dishwasher, obj, Math.min(dishUnitsOf(obj), Math.max(0, capacity)));
            if (moved > 0) {
              cleanedCount += moved;
              const now = gameDaysNow(gameState.meta.clock);
              const minutes = dishwasherCycleMinutes(gameState) / (CLOCK.ticksPerDay * 30);
              dishwasher.dishwasher = { ...dishwasher.dishwasher, cycleActiveUntilAbs: now + minutes };
              dishwasher.state = { ...(dishwasher.state || {}), cycle: 'running' };
              if (dishUnitsOf(obj) === 0) { obj.dishes = {}; obj.dishUnits = 0; }
              continue;
            }
          }
          obj.dishes = {};
          obj.dishUnits = 0;
          cleanedCount++;
        }
        continue;
      }
      const cleanValue = def.states[key][0];
      if (obj.state[key] !== cleanValue) { obj.state[key] = cleanValue; cleanedCount++; }
    }
  }
  refreshRoomCleanliness(gameState, roomId);
  // Perception plan Phase 2 (D10): a room-level `odor = 'none'` write used to
  // sit here. Resetting the object states above is now sufficient — the smell
  // is DERIVED from those states, so clearing the cause clears the effect and
  // there is nothing left to forget to clear.
  return cleanedCount;
}

// Returns how many individual dirty states got reset — not a room count —
// so "the housekeeper found nothing to do" and "the housekeeper reset 11
// things across 6 rooms" are distinguishable in the log.
//
// STEALTH (P6): accessScope:'all' really does enter every bedroom, which
// is exactly the kind of housekeeper-caused boundary crossing that earns a
// (small, indirect) suspicion consequence — a trusted producer, same tier
// as ACTIONS/STEALTH's own effect calls, run from processDayRollover so it
// must stay synchronous/LLM-free (templated MEMORY_EPISODE text, no live
// generateText call, same reasoning as Classifieds' fallback* generators).
function performCleaningVisit(gameState, service) {
  const scopeRooms = service.accessScope === 'all' ? ALL_ROOMS : COMMON_ROOMS;
  let itemsCleaned = 0;
  const lines = [];
  for (const roomId of scopeRooms) {
    itemsCleaned += cleanRoomObjects(gameState, roomId);
    if (service.accessScope !== 'all') continue;
    const ownerId = roomOwnerId(roomId, gameState.npcs);
    if (!ownerId || ownerId === 'player') continue;
    const rng = seededRng(gameState.meta.seed, `cleaning_${gameState.meta.clock.day}_${roomId}`);
    if (rng() < STEALTH_TUNING.baseEvidenceDiscoveryChance) {
      lines.push(`MEMORY_EPISODE ${ownerId} Someone let a cleaning service into their room again without asking.`);
      lines.push(`ADJUST_SUSPICION ${ownerId} boundary_violation +${STEALTH_TUNING.housekeeperSuspicionDelta}`);
    }
  }
  if (lines.length) {
    const effCtx = buildEffectContext(gameState, [], [], {}, []);
    applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), effCtx);
  }
  // Phase 6 (D13): a cleaning pass that actually cleans something is a
  // happiness event for the household — a mood impulse scaled by how much
  // there was to do, capped so a single deep-clean can't out-earn a good
  // day's living. Fires for the hired service AND the maid (she calls
  // performCleaningVisit too), whether or not the player is home.
  if (itemsCleaned > 0) {
    pushMoodImpulse(
      gameState.player,
      Math.min(MOOD_PAYOUTS.cleanApartmentCap, itemsCleaned * MOOD_PAYOUTS.cleanApartmentPerItem),
      gameState.meta.clock.day
    );
  }
  return itemsCleaned;
}

// Called from UI's processDayRollover. A visit that the player can't
// currently afford is postponed one full cadence rather than cancelling
// the subscription outright — "always playable, never a hard stop,"
// matching rent/quests/work-deadlines' existing pattern.
function processServiceVisitsForDay(gameState, day) {
  const services = gameState.world.computer.apps.services;
  const results = [];
  for (const hire of services.hired) {
    if (day < hire.nextDay) continue;
    const service = SERVICE_DEFS[hire.serviceId];
    if (gameState.player.money < service.costPerVisit) {
      hire.nextDay = day + service.cadenceDays;
      results.push({ serviceId: hire.serviceId, skipped: true, label: service.label });
      continue;
    }
    gameState.player.money -= service.costPerVisit;
    const itemsCleaned = performCleaningVisit(gameState, service);
    hire.nextDay = day + service.cadenceDays;
    results.push({ serviceId: hire.serviceId, skipped: false, label: service.label, itemsCleaned, cost: service.costPerVisit, accessScope: service.accessScope });
  }
  return results;
}

// --- Classifieds app ---

// Next available bed for a move-in, as { roomId, bed, shared }.
//
// Beds, not rooms. The previous version scanned three hardcoded bedrooms
// and treated any occupant as filling the whole room, which capped the
// household at 3 roommates — the apartment has four bedrooms of two beds
// each, so the real ceiling is 7 alongside the player.
//
// Ordering is deliberate: every private room is offered before anyone is
// asked to double up, and the player's own spare bed comes dead last
// (that slot is a partner moving in, not something you advertise to
// strangers). `shared` tells the caller whether this bed means sharing,
// which is what the rent discount keys off.
//
// Rooms whose habitability facility is still broken are skipped entirely —
// nobody moves into a room with no working light and a door that won't
// close. That gate is what makes "make one bedroom liveable" the opening's
// first real objective.
function findEmptyBed(gameState, opts = {}) {
  const requireHabitable = opts.requireHabitable !== false;
  // Post-overhaul each bedroom has its own habitability facility, so the
  // gate is applied per room (any liveable spare bed qualifies) instead of
  // one shared early-out.
  const isHabitable = (roomId) => !requireHabitable || isBedroomHabitable(gameState, roomId);

  const occupantsOf = (roomId) => Object.values(gameState.npcs)
    .filter(n => n.residency.room === roomId && n.residency.status === 'resident');

  const spare = ALL_ROOMS.filter(r => ROOMS[r].type === 'bedroom' && r !== 'bedroom_player');
  // The player's spare bed (a partner moving in, never advertised) stays
  // behind the same "some auxiliary bedroom is liveable" gate — otherwise
  // the opening's first objective (repair an auxiliary bedroom before
  // recruiting anyone) would be skippable from day one via the player's own
  // always-functional room.
  const anyAuxHabitable = spare.some(isHabitable);
  // Private beds first, then shared ones, then the player's spare bed.
  for (const roomId of spare) if (isHabitable(roomId) && occupantsOf(roomId).length === 0) return { roomId, bed: 'A', shared: false };
  for (const roomId of spare) {
    if (!isHabitable(roomId)) continue;
    const taken = new Set(occupantsOf(roomId).map(n => n.residency.bed));
    if (taken.size < (ROOMS[roomId].capacity || 2)) {
      return { roomId, bed: taken.has('A') ? 'B' : 'A', shared: true };
    }
  }
  if (opts.includePlayerRoom !== false && anyAuxHabitable && occupantsOf('bedroom_player').length === 0) {
    return { roomId: 'bedroom_player', bed: 'B', shared: true };
  }
  return null;
}

// Back-compat shim: callers that only need "is there room for anyone".
function findEmptyBedroom(gameState) {
  return findEmptyBed(gameState)?.roomId || null;
}

// --- Phase 1: Stub generation (RoomList upgrade) ---
// Generates STUBS_PER_DAY cheap, deterministic applicant stubs for the
// RoomList browse grid. Stubs are lightweight records — just enough to
// render a browse card and power filters (name, age, gender, occupation,
// income band, a couple of personality traits, a one-line sketch). No
// LLM, no full NPC creation, no entry into gs.npcs — that happens later
// when the player loads a profile (Phase 3 fetch queue).
//
// Stubs are keyed by day in classifieds.stubs[day]. Each day generates a
// fresh batch; old days are pruned to STUB_RETENTION_DAYS to bound
// memory. A stub carries its own seed so a full NPC can later be
// deterministically generated from it with zero ambiguity.
const STUBS_PER_DAY = 30;
const STUB_RETENTION_DAYS = 3;

function generateApplicantStubsForDay(gameState, day) {
  const classifieds = gameState.world.computer.apps.classifieds;
  if (!classifieds.posted.active) return [];

  // Idempotent guard — same pattern as generateApplicantsForDay
  if (classifieds.stubs[day] && classifieds.stubs[day].length > 0) return [];

  // Prune old stub days
  const cutoff = day - STUB_RETENTION_DAYS;
  for (const d of Object.keys(classifieds.stubs)) {
    if (Number(d) < cutoff) delete classifieds.stubs[d];
  }

  const stubs = [];
  for (let i = 0; i < STUBS_PER_DAY; i++) {
    const stubId = `stub_${day}_${i}`;
    const subRng = seededRng(gameState.meta.seed, `stub_${day}_${i}`);

    // Cheap deterministic fields — all from existing pools, no LLM
    const gender = rollGender(subRng);
    const age = rollAge(subRng);
    const occ = weightedPick(subRng, OCCUPATION_POOL);
    const numTraits = 2 + Math.floor(subRng() * 2);
    const traits = pickUnique(subRng, PERSONALITY_TRAITS_POOL, numTraits);
    const coreTrait = traits[Math.floor(subRng() * traits.length)] || 'easygoing';

    // Name from the gender-appropriate pool (same logic as fallbackName)
    const useNeutral = subRng() < 0.2;
    let namePool;
    if (useNeutral) namePool = CHAR_GEN.namePools.first_n;
    else if (gender === 'male' || gender === 'trans_male') namePool = CHAR_GEN.namePools.first_m;
    else namePool = CHAR_GEN.namePools.first_f;
    const name = namePool[Math.floor(subRng() * namePool.length)];

    // Temperament subset (just enough for filtering — the full 6-axis
    // roll happens later when the NPC is actually created)
    const warmth = rollAxis(subRng);

    // Settings & Pause Overhaul Phase 6 (D13): species — APPENDED at the end
    // of the stub's draw sequence so every pre-existing field (name/age/
    // gender/occupation/traits/warmth) stays byte-identical for a given seed
    // at default human-100%. createNpcFromStub pins it back into the full
    // NPC via partial.species, so the card and the person always match.
    const species = rollSpecies(subRng);

    // One-line sketch — templated, not LLM
    const warm = warmth > 0 ? 'warm' : 'reserved';
    const sketch = `${age}-year-old ${occ.title}, ${warm} and ${coreTrait}`;

    stubs.push({
      stubId,
      day,
      seed: gameState.meta.seed,
      slot: 2000 + day * 100 + i,  // offset clear of real cast + old applicant slots
      name,
      age,
      gender,
      species,
      occupation: { category: occ.category, title: occ.title, incomeBand: occ.incomeBand, hours: occ.hours },
      coreTrait,
      traits,
      warmth,
      sketch,
      status: 'stub',       // stub | fetching | ready | expired
      fullNpcId: null,      // filled when Tier 2 generation completes
    });
  }

  classifieds.stubs[day] = stubs;
  classifieds.activeDay = day;
  return stubs;
}

// Get the currently-visible stubs (activeDay's batch), optionally
// filtered/sorted by classifieds.filters (Phase 2 will populate filters;
// Phase 1 just returns all).
function getVisibleStubs(gameState) {
  const classifieds = gameState.world.computer.apps.classifieds;
  const day = classifieds.activeDay;
  let stubs = classifieds.stubs[day] || [];

  // Phase 2: apply filters
  const f = classifieds.filters;
  if (f) {
    if (f.gender && f.gender.length > 0) {
      stubs = stubs.filter(s => f.gender.includes(s.gender));
    }
    if (f.incomeBand && f.incomeBand.length > 0) {
      stubs = stubs.filter(s => f.incomeBand.includes(s.occupation.incomeBand));
    }
    if (f.ageRange && f.ageRange.length === 2) {
      stubs = stubs.filter(s => s.age >= f.ageRange[0] && s.age <= f.ageRange[1]);
    }
    // Phase 7: favorites-only filter — show only stubs whose fullNpcId is
    // in the favorites list
    if (f.favoritesOnly) {
      const favSet = new Set(classifieds.favorites || []);
      stubs = stubs.filter(s => s.fullNpcId && favSet.has(s.fullNpcId));
    }
    // Sort
    const sortBy = f.sortBy || 'recent';
    const sorted = [...stubs];
    if (sortBy === 'age') sorted.sort((a, b) => a.age - b.age);
    else if (sortBy === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'income') {
      const order = { high: 0, mid: 1, low: 2 };
      sorted.sort((a, b) => ((order[a.occupation.incomeBand] ?? 9)) - ((order[b.occupation.incomeBand] ?? 9)));
    }
    // 'recent' = original generation order (no sort)
    stubs = sorted;
  }

  return stubs;
}

// Turn a stub record into a full NPC. Extracted from promoteStubToNpc so the
// external-world plan's friend stubs (Phase 6) grow into real characters
// through the exact same path a RoomList applicant does — one stub shape, one
// promotion, two callers. Uses rollCastSlot with a partial pre-filled from the
// stub's deterministic fields so the full NPC matches the card the player
// already saw. `residencyStatus` is what separates the callers: an applicant
// arrives 'prospective', a roommate's friend arrives 'visitor'.
function createNpcFromStub(gameState, stub, residencyStatus, tag) {
  const npcId = genSeededNpcId(stub.seed, stub.slot);
  if (gameState.npcs[npcId]) return { ok: false, reason: 'Already generated.' };

  // Build a partial from the stub's pre-determined fields
  const partial = {
    name: stub.name,
    age: stub.age,
    gender: stub.gender,
    species: stub.species,          // Phase 6 (D13): pinned so the full NPC matches the card
    occupationCategory: stub.occupation.category,
  };
  if (typeof stub.warmth === 'number') {
    partial.temperament = { warmth: stub.warmth };
  }

  const rolled = rollCastSlot(stub.seed, stub.slot, npcId, tag, new Set([stub.occupation.category]), [], partial);
  if (!rolled) return { ok: false, reason: 'Generation failed.' };

  const structured = rolled.normalized.bible;
  // Overlay the stub's pre-determined personality fields onto the roll so
  // the full NPC matches the browse card (rollCastSlot doesn't support
  // personality in partial — it always rolls these fresh)
  if (stub.traits && stub.traits.length > 0) {
    structured.personality.traits = stub.traits;
  }
  if (stub.coreTrait) {
    structured.personality.coreTrait = stub.coreTrait;
  }
  const bible = {
    ...structured,
    name: structured.name || stub.name,
    age: stub.age,
    gender: stub.gender,
    visual: fallbackVisual({ ...structured, age: stub.age, gender: stub.gender }),
    history: fallbackHistory(structured),
    sketch: stub.sketch,
    sampleLines: fallbackSampleLines(structured),
  };
  const check = validateCharacter({ bible });
  if (!check.valid) return { ok: false, reason: 'Validation failed: ' + check.errors.join('; ') };

  gameState.npcs[npcId] = createNpcFromBible(check.normalized.bible, residencyStatus);
  stub.status = 'ready';
  stub.fullNpcId = npcId;
  return { ok: true, npcId };
}

// Promote a RoomList stub to a full applicant NPC (Phase 3 will make this
// async via the fetch queue, but the core generation is here).
function promoteStubToNpc(gameState, stubId) {
  const classifieds = gameState.world.computer.apps.classifieds;
  // Find the stub across all stub days
  let stub = null;
  for (const day of Object.keys(classifieds.stubs)) {
    stub = classifieds.stubs[day].find(s => s.stubId === stubId);
    if (stub) break;
  }
  if (!stub || stub.status === 'ready' && stub.fullNpcId) {
    return { ok: false, reason: 'Stub not found or already promoted.' };
  }
  return createNpcFromStub(gameState, stub, 'prospective', `stub_promote_${stubId}`);
}

// Phase 4: Build a full NPC from a Studio draft (partial bible). Uses
// rollCastSlot with the draft as the `partial` — whatever the player filled
// in is held fixed; everything else is rolled. Returns { ok, npcId } or
// { ok:false, reason }. The generated NPC is added to gameState.npcs as
// 'prospective' and becomes an applicant on the RoomList.
function buildStudioNpc(gameState, draft) {
  const classifieds = gameState.world.computer.apps.classifieds;
  const studioSeed = (gameState.meta.seed || 1) + 99999;
  const slotIndex = 5000 + Object.keys(gameState.npcs).length;
  const npcId = genSeededNpcId(studioSeed, slotIndex);
  if (gameState.npcs[npcId]) return { ok: false, reason: 'ID collision — try again.' };

  // Build partial from draft: only non-empty fields are passed
  const partial = {};
  if (draft.name) partial.name = draft.name;
  if (typeof draft.age === 'number') partial.age = draft.age;
  if (draft.gender) partial.gender = draft.gender;
  // Phase 6 (D13): a player-authored species pins the roll — validated
  // against RACES so a bad pin fails the partial, not every roll attempt.
  if (draft.species && RACES.some(r => r.id === draft.species)) partial.species = draft.species;
  if (draft.occupationCategory) partial.occupationCategory = draft.occupationCategory;
  if (draft.temperament) partial.temperament = draft.temperament;
  if (draft.interests && draft.interests.length > 0) partial.interests = draft.interests;
  if (draft.values && draft.values.length > 0) partial.values = draft.values;
  if (draft.baggage) partial.baggage = draft.baggage;
  if (draft.wound) partial.wound = draft.wound;
  if (draft.want) partial.want = draft.want;
  if (draft.blindSpot) partial.blindSpot = draft.blindSpot;
  if (draft.boundary) partial.boundary = draft.boundary;

  const usedCats = new Set();
  // Exclude existing residents' occupation categories for variety
  for (const npc of Object.values(gameState.npcs)) {
    if (npc.residency?.status === 'resident' && npc.bible?.occupation?.category) {
      usedCats.add(npc.bible.occupation.category);
    }
  }
  if (partial.occupationCategory) usedCats.delete(partial.occupationCategory);

  const rolled = rollCastSlot(studioSeed, slotIndex, npcId, 'studio_build', usedCats, [], partial);
  if (!rolled) return { ok: false, reason: 'Generation failed.' };

  const structured = rolled.normalized.bible;
  // Apply draft overrides on top of what rollCastSlot produced (for fields
  // rollCastSlot doesn't support via partial, e.g. personality, speech)
  if (draft.personality) {
    if (draft.personality.traits) structured.personality.traits = draft.personality.traits;
    if (draft.personality.coreTrait) structured.personality.coreTrait = draft.personality.coreTrait;
    if (draft.personality.hiddenTrait) structured.personality.hiddenTrait = draft.personality.hiddenTrait;
    if (draft.personality.quirks) structured.personality.quirks = draft.personality.quirks;
    if (draft.personality.likes) structured.personality.likes = draft.personality.likes;
    if (draft.personality.dislikes) structured.personality.dislikes = draft.personality.dislikes;
  }
  if (draft.physical) {
    structured.physical = { ...structured.physical, ...draft.physical };
  }
  if (draft.speech) {
    structured.speech = { ...structured.speech, ...draft.speech };
  }
  if (draft.history) structured.history = draft.history;
  if (draft.sketch) structured.sketch = draft.sketch;
  if (draft.sampleLines) structured.sampleLines = draft.sampleLines;

  // Fill prose via fallbacks (these can be overridden by draft)
  const bible = {
    ...structured,
    name: structured.name || draft.name || fallbackName(structured),
    age: typeof draft.age === 'number' ? draft.age : structured.age,
    gender: draft.gender || structured.gender,
    visual: fallbackVisual({ ...structured, age: typeof draft.age === 'number' ? draft.age : structured.age, gender: draft.gender || structured.gender }),
    history: draft.history || fallbackHistory(structured),
    sketch: draft.sketch || fallbackSketch(structured),
    sampleLines: draft.sampleLines || fallbackSampleLines(structured),
  };

  const check = validateCharacter({ bible });
  if (!check.valid) return { ok: false, reason: 'Validation failed: ' + check.errors.join('; ') };

  gameState.npcs[npcId] = createNpcFromBible(check.normalized.bible, 'prospective');
  // Add to applicants list so it appears in the profile/accept flow
  if (!classifieds.applicants.includes(npcId)) classifieds.applicants.push(npcId);
  return { ok: true, npcId };
}

// Phase 5: AI-assisted character generation. Takes a free-text description
// from the player, asks the LLM to produce a full bible (structured JSON),
// then validates and populates the studio draft. Returns { ok, draft } or
// { ok:false, reason }.
async function generateCharacterWithAI(gameState, prompt) {
  const aiPrompt = buildAIGenerationPrompt(prompt);
  try {
    const response = await root.generateText({
      instruction: aiPrompt,
      startWith: '{',
      stopSequences: ['}\n'],
    });

    let jsonStr = response.trim();
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start >= 0 && end > start) jsonStr = jsonStr.substring(start, end + 1);
    const parsed = JSON.parse(jsonStr);

    // Normalize LLM output into a studio draft (partial bible)
    const draft = {};
    if (parsed.name) draft.name = String(parsed.name).substring(0, 60);
    if (typeof parsed.age === 'number') draft.age = Math.max(18, Math.min(60, Math.round(parsed.age)));
    if (parsed.gender && ['male','female','futanari','trans_male','trans_female'].includes(parsed.gender)) draft.gender = parsed.gender;
    if (parsed.occupationCategory) {
      const valid = OCCUPATION_POOL.find(o => o.category === parsed.occupationCategory);
      if (valid) draft.occupationCategory = parsed.occupationCategory;
    }
    if (parsed.temperament && typeof parsed.temperament === 'object') {
      const t = {};
      for (const axis of ['warmth','volatility','openness','conscientiousness','assertiveness','selfAwareness']) {
        if (typeof parsed.temperament[axis] === 'number') {
          t[axis] = Math.max(-1, Math.min(1, parsed.temperament[axis]));
        }
      }
      if (Object.keys(t).length > 0) draft.temperament = t;
    }
    if (Array.isArray(parsed.interests)) {
      draft.interests = parsed.interests.map(i => typeof i === 'string' ? i : i.name).filter(n =>
        INTEREST_POOL.some(ip => ip.name === n)
      ).slice(0, 3);
    }
    if (Array.isArray(parsed.values)) {
      draft.values = parsed.values.map(v => typeof v === 'string' ? v : v.name).filter(n =>
        VALUES_POOL.some(vp => vp.name === n)
      ).slice(0, 2);
    }
    if (parsed.baggage) draft.baggage = String(parsed.baggage).substring(0, 300);
    if (parsed.wound) draft.wound = String(parsed.wound).substring(0, 300);
    if (parsed.want) draft.want = String(parsed.want).substring(0, 300);
    if (parsed.blindSpot) draft.blindSpot = String(parsed.blindSpot).substring(0, 300);
    if (parsed.boundary) draft.boundary = String(parsed.boundary).substring(0, 300);
    if (parsed.personality && typeof parsed.personality === 'object') {
      const p = {};
      if (Array.isArray(parsed.personality.traits)) {
        p.traits = parsed.personality.traits.filter(t => PERSONALITY_TRAITS_POOL.includes(t)).slice(0, 5);
      }
      if (parsed.personality.coreTrait && PERSONALITY_TRAITS_POOL.includes(parsed.personality.coreTrait)) p.coreTrait = parsed.personality.coreTrait;
      if (parsed.personality.hiddenTrait && PERSONALITY_TRAITS_POOL.includes(parsed.personality.hiddenTrait)) p.hiddenTrait = parsed.personality.hiddenTrait;
      if (Array.isArray(parsed.personality.quirks)) {
        p.quirks = parsed.personality.quirks.filter(q => QUIRKS_POOL.includes(q)).slice(0, 4);
      }
      if (Array.isArray(parsed.personality.likes)) {
        p.likes = parsed.personality.likes.filter(l => LIKES_POOL.includes(l)).slice(0, 5);
      }
      if (Array.isArray(parsed.personality.dislikes)) {
        p.dislikes = parsed.personality.dislikes.filter(d => DISLIKES_POOL.includes(d)).slice(0, 5);
      }
      if (Object.keys(p).length > 0) draft.personality = p;
    }
    if (parsed.history) draft.history = String(parsed.history).substring(0, 600);
    if (parsed.sketch) draft.sketch = String(parsed.sketch).substring(0, 120);
    if (Array.isArray(parsed.sampleLines)) {
      draft.sampleLines = parsed.sampleLines.map(s => String(s)).slice(0, 5);
    }

    return { ok: true, draft };
  } catch (e) {
    console.warn('AI character generation failed:', e.message);
    return { ok: false, reason: 'AI generation failed: ' + e.message };
  }
}

// Phase 5: Build the LLM prompt for AI-assisted character generation.
// Describes the full bible schema so the LLM knows what shape to produce.
function buildAIGenerationPrompt(userPrompt) {
  return `You are creating a character for a slice-of-life apartment sim. The player has described what they want. Generate a complete character "bible" as JSON.

Player's description: "${userPrompt}"

Generate a character that fits the description. Use ONLY values from the provided pools where specified. Respond with JSON only, no markdown.

{
  "name": "a believable first name (no surname)",
  "age": 18-60,
  "gender": "one of: male, female, futanari, trans_male, trans_female",
  "occupationCategory": "one of: tech, food, health, arts, service, education, finance, trades, media, legal, science",
  "temperament": {
    "warmth": -1 to 1,
    "volatility": -1 to 1,
    "openness": -1 to 1,
    "conscientiousness": -1 to 1,
    "assertiveness": -1 to 1,
    "selfAwareness": -1 to 1
  },
  "interests": ["1-3 from: gaming, cooking, music, fitness, reading, art, politics, film, gardening, hiking, writing, yoga, partying, coding, fashion, astrology, photography, comedy, volunteering, true crime, crafting, travel"],
  "values": ["1-2 from: honesty, harmony, independence, connection, ambition, contentment, order, spontaneity, loyalty, freedom, tradition, progress, privacy, transparency, kindness, justice"],
  "baggage": "1-2 sentences about their past burden",
  "wound": "1 sentence about their deepest emotional wound",
  "want": "1 sentence about what they want right now",
  "blindSpot": "1 sentence about what they believe about themselves that isn't true",
  "boundary": "1 sentence about a hard boundary they enforce",
  "personality": {
    "traits": ["3-5 from: reliable, sarcastic, anxious, ambitious, nurturing, guarded, impulsive, methodical, flirtatious, stubborn, curious, cynical, idealistic, territorial, clingy, independent, meticulous, chaotic, diplomatic, blunt, secretive, expressive, stoic, needy, competitive, lazy, perfectionist, easygoing, intense, passive-aggressive, protective, manipulative, vulnerable, confident, insecure, generous, selfish, patient, restless, nostalgic, adventurous, cautious, rebellious, conformist, creative, practical, spiritual, materialistic, sensitive, thick-skinned, loyal, fickle, honest, deceptive, warm, cold, playful, serious, dramatic, understated"],
    "coreTrait": "one trait from the list above",
    "hiddenTrait": "one trait from the list above (NOT in traits)",
    "quirks": ["2-4 from: always hums while cooking, can't sleep without socks, collects mismatched mugs, talks to plants, names their electronics, always late by exactly 7 minutes, has strong opinions about pizza toppings, saves cardboard boxes, rereads the same book annually, pees with the bathroom door open, organizes the spice rack alphabetically, keeps a journal but only writes in it at 3am, uses a vintage flip phone, always has headphones in but nothing playing, refuses to use umbrellas, sniffs food before eating it, makes lists for everything but never follows them, sleeps with a fan on even in winter, has a playlist for every mood, collects interesting rocks, always reads the terms and conditions, keeps expired condiments in the fridge, talks in their sleep, never throws away gift bags, has a lucky pen they never use, counts stairs when walking up them, always smells books before reading them, keeps a running tally of how many coffees they have had, memorizes license plates out of habit, wears mismatched socks on purpose, apologizes to inanimate objects, narrates their actions under their breath, eats cereal dry, always sits with their back to the wall, never buys matching towel sets, can quote entire movies from memory, keeps every receipt in a shoebox, has a specific alarm for every day of the week, always checks if the stove is off twice, prefers to eat standing up"],
    "likes": ["3-5 from: rainy mornings, the smell of fresh laundry, bad puns, thrift stores, loud music, quiet mornings, fermented food, horror movies, gardening, deep conversations at 2am, the sound of a kettle boiling, walking barefoot on grass, old bookstores, vinyl records, spicy food, stargazing, swimming at night, making lists, cooking for other people, the smell of rain on concrete, arranging flowers, bike rides at dusk, board games, sketching strangers, singing in the shower, the first sip of coffee, rewatching comfort shows, collecting sea glass, sleeping with the window open, lighting candles for no reason"],
    "dislikes": ["3-5 from: small talk, the sound of chewing, being touched unexpectedly, loud chewers, condescension, wasting food, being interrupted, cold coffee, sticky counters, passive-aggressive notes, when the toilet paper roll is empty, people who are late, the sound of nails on chalkboard, being asked how they are doing, crowded grocery stores, small fonts, when someone eats their food, unexpected visitors, the smell of boiled eggs, being told to calm down, when the wifi is slow, people who do not use turn signals, the word moist, overcooked pasta, being photographed, when a book adaptation gets it wrong, empty fridge shelves, loud commercials, dishonesty disguised as politeness"]
  },
  "history": "one paragraph (3-5 sentences) about how they ended up in this apartment",
  "sketch": "a one-line summary of their vibe (max 120 chars)",
  "sampleLines": ["3-5 example dialogue lines reflecting their personality"]
}

Respond with JSON only, no markdown.`;
}

function postRoommateAd(gameState) {
  const classifieds = gameState.world.computer.apps.classifieds;
  if (classifieds.posted.active) return { ok: false, reason: 'You already have an active listing.' };
  if (!findEmptyBed(gameState)) {
    // Distinguish "full" from "nothing liveable to offer" — early on it is
    // almost always the latter, and that's the nudge toward the first
    // repair rather than a dead end.
    // Post-overhaul the check is per auxiliary bedroom: any habitable room
    // with a free bed means the house isn't full, just short on space.
    const anyLiveable = ALL_ROOMS.some(r => ROOMS[r].type === 'bedroom' && r !== 'bedroom_player' && isBedroomHabitable(gameState, r));
    const reason = anyLiveable
      ? 'Every bed is taken.'
      : 'No liveable room to offer — fix up a bedroom first.';
    return { ok: false, reason };
  }
  classifieds.posted = { active: true, postedDay: gameState.meta.clock.day };
  // Generate the first batch of stubs immediately so the player can
  // browse right after posting — otherwise the grid stays empty until
  // the next day rollover fires processClassifiedsForDay.
  generateApplicantStubsForDay(gameState, gameState.meta.clock.day);
  return { ok: true };
}

// Called from day rollover. Deterministic and zero-LLM by design (this
// runs unattended, not at a player-contact point) — the applicant's
// prose comes from LLM's fallback* generators, the same seeded-templated
// path a character-creation prose expansion falls back to on failure, not
// a live LLM call. usedCats/priorTags bias the roll away from what
// current residents already are, mirroring SIM's own cast-generation
// preference for a varied household.
function generateApplicantsForDay(gameState, day) {
  const classifieds = gameState.world.computer.apps.classifieds;
  if (!classifieds.posted.active) return [];
  if (!findEmptyBedroom(gameState)) { classifieds.posted.active = false; return []; }
  if (classifieds.applicants.length >= 3) return [];

  const gate = seededRng(gameState.meta.seed, `applicant_gate_${day}`);
  if (gate() > 0.5) return [];

  const residentIds = Object.keys(gameState.npcs).filter(id => gameState.npcs[id].residency.status === 'resident');
  const usedCats = new Set(residentIds.map(id => gameState.npcs[id].bible.occupation.category));
  const priorTags = residentIds.map(id => new Set(gameState.npcs[id].bible.interests.flatMap(i => i.tags)));
  const slot = 1000 + day; // offset clear of real cast slots (0..residentCount-1)
  const npcId = genSeededNpcId(gameState.meta.seed, slot);
  if (gameState.npcs[npcId]) return []; // already rolled for this day (idempotent guard)

  const rolled = rollCastSlot(gameState.meta.seed, slot, npcId, `applicant_${day}`, usedCats, priorTags, {});
  if (!rolled) return [];
  const structured = rolled.normalized.bible;
  const bible = {
    ...structured,
    name: structured.name || fallbackName(structured),
    visual: fallbackVisual(structured),
    history: fallbackHistory(structured),
    sketch: fallbackSketch(structured),
    sampleLines: fallbackSampleLines(structured),
  };
  const check = validateCharacter({ bible });
  if (!check.valid) return [];

  gameState.npcs[npcId] = createNpcFromBible(check.normalized.bible, 'prospective');
  classifieds.applicants.push(npcId);
  return [npcId];
}

// An empty room's furniture spawns with ownerId:null (WORLD) since nobody
// lived there yet. On move-in, ALL of it becomes the new resident's — not
// just the explicitly-personal items (guitar/diary/jewelry box), but the
// desk/wardrobe/nightstand too: it's the furniture in *their* room now,
// which matters once boundary/ownership checks (P6) start asking whose
// wardrobe this is.
function claimRoomPersonalItems(gameState, roomId, npcId) {
  const bucket = gameState.objects[`room_${roomId}`];
  if (!bucket) return;
  for (const obj of Object.values(bucket)) {
    if (obj.ownerId === null) obj.ownerId = npcId;
  }
}

function acceptApplicant(gameState, npcId, roomId) {
  const npc = gameState.npcs[npcId];
  // Move-in offers (external-world plan Phase 8): the offer flow is no
  // longer Classifieds-only — any eligible external NPC (a roommate's
  // friend, an escort you've gotten close to) can move in through the same
  // assign path, gated by isMoveInEligible (locked decision 15: a strong
  // relationship with the player OR a resident). Classifieds applicants
  // ('prospective') remain eligible by virtue of the posted ad.
  if (!npc) return { ok: false, reason: 'No such person.' };
  if (npc.residency.status === 'resident') return { ok: false, reason: 'They already live here.' };
  if (npc.residency.status !== 'prospective' && !isMoveInEligible(gameState, npcId)) {
    return { ok: false, reason: `You don't know ${npc.bible?.name || 'them'} well enough to ask them to move in — it takes a close relationship (yours or a roommate's).` };
  }

  // The player must explicitly choose a room — see renderRoomListAssign.
  if (!roomId) return { ok: false, reason: 'Choose a room for them.' };
  const roomDef = ROOMS[roomId];
  if (!roomDef || roomDef.type !== 'bedroom') return { ok: false, reason: 'That is not a bedroom.' };
  // The player's own room is off-limits for assignment.
  if (roomDef.isPlayer) return { ok: false, reason: 'You can\'t assign someone to your own room.' };

  // Phase 4: a bedroom must be habitable before someone can move in. The
  // room's own habitability facility must be at least 'functional' — this
  // is the first upgrade goal, because it points the player at recruiting,
  // which is the answer to rent. See src/ref/complete/apartment-upgrades-plan.md.
  if (!isBedroomHabitable(gameState, roomId)) {
    return { ok: false, reason: 'That bedroom is uninhabitable — repair it via RenoFix first.' };
  }

  // Determine which beds are already taken in this room.
  const occupants = Object.entries(gameState.npcs)
    .filter(([id, n]) => id !== npcId && n.residency.room === roomId && n.residency.status === 'resident');
  const takenBeds = new Set(occupants.map(([, n]) => n.residency.bed));
  const capacity = roomDef.capacity || 2;

  let bed;
  if (occupants.length === 0) {
    // Empty room — take bed A.
    bed = 'A';
  } else if (occupants.length < capacity) {
    // There's a spare bed. Two strangers in one room is not allowed —
    // doubling up is only for couples (dating/married), tracked via
    // residency.partnerOf. Check whether the incoming NPC is the partner
    // of the existing resident.
    const existingNpc = occupants[0][1];
    const isPartner = npc.residency.partnerOf === occupants[0][0]
      || existingNpc.residency.partnerOf === npcId;
    if (!isPartner) {
      return { ok: false, reason: `${existingNpc.bible?.name || 'Someone'} already lives there. Only couples can share a room.` };
    }
    bed = takenBeds.has('A') ? 'B' : 'A';
  } else {
    return { ok: false, reason: `${roomDef.name} is full.` };
  }

  let updated = moveToRoom(npcId, npc, roomId, gameState.npcs, bed);
  updated = changeResidencyStatus(updated, 'resident', { since: gameState.meta.clock.day });
  gameState.npcs[npcId] = updated;
  claimRoomPersonalItems(gameState, roomId, npcId);

  for (const otherId of Object.keys(gameState.npcs)) {
    if (otherId === npcId || gameState.npcs[otherId].residency.status !== 'resident') continue;
    const pairKey = [npcId, otherId].sort().join('|');
    if (!gameState.world.castWeb[pairKey]) {
      const [a, b] = [npcId, otherId].sort();
      gameState.world.castWeb[pairKey] = createBlankPair(a, b);
    }
  }
  gameState.world.rent = computeRent(gameState.npcs, gameState);

  const classifieds = gameState.world.computer.apps.classifieds;
  classifieds.applicants = classifieds.applicants.filter(id => id !== npcId);
  classifieds.posted.active = false;

  // Phase 7: clean up favorites and fetch queue so the accepted NPC
  // doesn't linger as a stale favorite or a dead inbox entry
  classifieds.favorites = (classifieds.favorites || []).filter(id => id !== npcId);
  classifieds.fetchQueue = (classifieds.fetchQueue || []).filter(q => q.npcId !== npcId);

  // Move-in offers (external-world plan Phase 8): accepting clears any
  // pending offers for this person, and retires their visit records so
  // they stop being a visitor — a resident resolves from their schedule,
  // not from a visit window (resolveTick's visitingIds already excludes
  // residents; retiring the records keeps the queue honest).
  gameState.world.moveInOffers = (gameState.world.moveInOffers || []).filter(o => o.npcId !== npcId);
  for (const v of gameState.world.visits || []) {
    if (v.npcId === npcId && v.status !== 'done') v.status = 'done';
  }

  // Contractor tutorial (contractor doc Phase 3): first roommate in fires
  // the one-shot rent/roommate hint.
  fireContractorMilestone(gameState, 'firstRoommateMovedIn');

  return { ok: true, npc: gameState.npcs[npcId] };
}

function rejectApplicant(gameState, npcId) {
  const npc = gameState.npcs[npcId];
  if (!npc || npc.residency.status !== 'prospective') return { ok: false, reason: 'No such applicant.' };
  const classifieds = gameState.world.computer.apps.classifieds;
  classifieds.applicants = classifieds.applicants.filter(id => id !== npcId);
  classifieds.favorites = (classifieds.favorites || []).filter(id => id !== npcId);
  classifieds.fetchQueue = (classifieds.fetchQueue || []).filter(q => q.npcId !== npcId);
  delete gameState.npcs[npcId];
  return { ok: true };
}

// --- IM app ---

function ensureImThread(gameState, npcId) {
  const im = gameState.world.computer.apps.im;
  if (!im.threads[npcId]) im.threads[npcId] = { msgs: [], unread: 0 };
  return im.threads[npcId];
}

// Sends a player message and resolves the reply through the exact same
// LLM proposal contract doTalk/doPlayerAction use (NPC's validateProposal/
// applyProposal) — a text reply can move relPlayer or land a memory fact
// exactly like a scene conversation can. Player-initiated (called from a
// click, not a tick), so an async LLM call here doesn't touch the
// zero-LLM-in-ticks invariant. On failure, a system line in the thread
// says so rather than the message silently vanishing.
//
// Split into appendPlayerImMessage (synchronous, mutates the thread so a
// re-render shows the player's bubble instantly) and resolveImReply
// (async, runs the LLM and appends the NPC reply) so the UI can paint the
// player's message, show a "typing…" indicator, and then resolve the reply
// without locking anything. doImSend calls both halves.
function appendPlayerImMessage(gameState, npcId, text) {
  const npc = gameState.npcs[npcId];
  if (!npc) return { ok: false, reason: 'No such contact.' };
  const thread = ensureImThread(gameState, npcId);
  const tick = getTickIndex(gameState.meta.clock.minutes);
  thread.msgs.push({ from: 'player', text, day: gameState.meta.clock.day, tick });
  thread.unread = 0;
  return { ok: true };
}

// BrineOS Phase 8.5: share a photo into an IM thread. Reuses
// appendPlayerImMessage/resolveImReply unmodified rather than a parallel
// send path — the photo is described to the LLM as text (its caption;
// there's no vision capability here and none is needed for a plausible
// in-fiction reaction), and the resulting player bubble is tagged with
// photoId so the renderer attaches a thumbnail. Caller drives
// resolveImReply exactly like doImSend does; this only does the append
// half.
function sharePhotoToImThread(gameState, npcId, photoId) {
  const photo = gameState.world.phone?.camera?.roll?.find(p => p.id === photoId);
  if (!photo) return { ok: false, reason: 'Photo not found.' };
  const text = `[shared a photo: ${photo.caption}]`;
  const result = appendPlayerImMessage(gameState, npcId, text);
  if (!result.ok) return result;
  const thread = ensureImThread(gameState, npcId);
  thread.msgs[thread.msgs.length - 1].photoId = photoId;
  return { ok: true, text };
}

async function resolveImReply(gameState, npcId, text) {
  const npc = gameState.npcs[npcId];
  if (!npc) return { ok: false, reason: 'No such contact.' };
  const thread = ensureImThread(gameState, npcId);
  const tick = getTickIndex(gameState.meta.clock.minutes);

  const context = assembleImContext(gameState, npcId);
  const result = await callImLLM(context, text);
  if (result.valid && result.proposal) {
    const applied = await applyProposal(result.proposal, context, gameState, text);
    for (const entry of applied.logEntries) {
      if (entry.type === 'dialogue') thread.msgs.push({ from: 'npc', text: entry.text, day: gameState.meta.clock.day, tick });
    }
    return { ok: true, updatedNpcIds: applied.updatedNpcIds };
  }
  thread.msgs.push({ from: 'system', text: `${npc.bible.name} hasn't replied yet.`, day: gameState.meta.clock.day, tick });
  return { ok: true, updatedNpcIds: [] };
}

// --- Stream app ---

function watchEpisode(gameState, showId) {
  const show = STREAM_DEFS[showId];
  if (!show) return { ok: false, reason: 'No such show.' };
  const stream = gameState.world.computer.apps.stream;
  const episode = (stream.resumePoints[showId] || 0) + 1;
  stream.resumePoints[showId] = episode;
  stream.watchHistory.push({ showId, episode, day: gameState.meta.clock.day });
  return { ok: true, show, episode };
}

// --- Bills (Phase 3) ---
// Bill processing lives in COMPUTER (not SIM) because bills are a session-
// level concern: they read live resident count for the even split, post
// charges, track grace, fire cutoffs, and restore service on payment. All
// synchronous, all in-memory — called from UI's processDayRollover, same
// as processServiceVisitsForDay.

// Phase 5: record a unit of utility usage. Called from player actions
// (executeAction's effect pipeline) and NPC drives (drives.js). Each call
// adds to the appropriate meter in world.utilities. Safe to call with a
// meter key that doesn't exist (no-op) or when utilities isn't initialized
// (creates it on the fly). `amount` defaults to 1.
function recordUtilityUsage(gameState, meterKey, amount = 1) {
  if (!UTILITY_METER[meterKey]) return;
  const utils = gameState.world.utilities;
  if (!utils || !utils[meterKey]) return;
  utils[meterKey].count = (utils[meterKey].count || 0) + amount;
}

// Phase 5: accrue one day of HVAC usage. Called from processDayRollover
// (via processBillsForDayUi) once per day. HVAC is metered per-day rather
// than per-action because it's the baseline load — the heater runs all
// day, not just when someone clicks a button. Rate is seasonal.
function accrueHvacForDay(gameState, day) {
  const utils = gameState.world.utilities;
  if (!utils || !utils.hvac) return;
  const season = getSeason(day);
  const seasonIdx = CALENDAR.seasons.indexOf(season);
  const rate = UTILITY_HVAC_SEASONAL[seasonIdx] || 0;
  utils.hvac.count = (utils.hvac.count || 0) + rate * UTILITY_THERMOSTAT;
  utils.hvac.daysAccrued = (utils.hvac.daysAccrued || 0) + 1;
}

// Phase 5: reset meters for a specific bill after it posts. Called from
// processBillsForDay when a bill's charge is posted. Only resets meters
// that feed that bill.
function resetUtilityMeters(gameState, billId) {
  const utils = gameState.world.utilities;
  if (!utils) return;
  for (const [key, meter] of Object.entries(UTILITY_METER)) {
    if (meter.bill !== billId) continue;
    if (!utils[key]) continue;
    utils[key].count = 0;
    if (key === 'hvac') utils[key].daysAccrued = 0;
  }
}

// Compute a bill's per-cycle amount for the current household. Rent is
// special: amount comes from computeRent (the lease-split), not the flat
// BILL_DEFS.amount (which is 0 for rent). Even-split bills with metering
// (electric/water/gas) compute `base + Σ(counter × rate)`; internet and
// the non-metered personal bills keep their flat amount. Even-split
// bills divide by the number of residents. Personal bills are the flat
// amount, player only.
function computeBillAmount(billDef, gameState) {
  if (billDef.split === 'lease') {
    const rent = computeRent(gameState.npcs, gameState);
    return Math.max(0, rent.playerShare);
  }
  if (billDef.split === 'personal') return billDef.amount;
  // Metered even-split bills (electric/water/gas): base + Σ(meter × rate).
  if (UTILITY_BASE[billDef.id] != null) {
    const utils = gameState.world.utilities;
    let total = UTILITY_BASE[billDef.id];
    if (utils) {
      for (const [key, meter] of Object.entries(UTILITY_METER)) {
        if (meter.bill !== billDef.id) continue;
        if (!utils[key]) continue;
        total += (utils[key].count || 0) * meter.rate;
      }
    }
    const residents = Object.values(gameState.npcs || {}).filter(n => n.residency.status === 'resident').length;
    const count = Math.max(1, residents);
    return Math.round(total / count);
  }
  // Non-metered even-split bill (internet): flat amount, even split.
  const residents = Object.values(gameState.npcs || {}).filter(n => n.residency.status === 'resident').length;
  const count = Math.max(1, residents);
  return Math.round(billDef.amount / count);
}

// Process all bills for a given day. Each bill whose dueDay has arrived
// posts its charge (added to balance), reschedules, and then we check
// grace/cutoff on any bill with an outstanding balance. This is the
// Phase 1 recurring-obligation pattern (isDueToday/rescheduleDue) applied
// to every bill, replacing the bespoke rent-only processRentForDay path.
//
// Returns an array of result records for logging.
function processBillsForDay(gameState, day) {
  const bills = gameState.world.bills;
  if (!bills) return [];
  const results = [];

  // 1. Post charges for any bill due today. Rent is handled by
  // processRentForDay (its lease-split, surplus payout and eviction
  // ladder are too special for the generic path) — skip it here; its
  // bill entry is synced for display in processBillsForDayUi.
  for (const def of Object.values(BILL_DEFS)) {
    if (def.split === 'lease') continue;
    const bill = bills[def.id];
    if (!bill || !isDueToday(bill.dueDay, day)) continue;
    const amt = computeBillAmount(def, gameState);
    bill.balance += amt;
    bill.status = 'due';
    bill.overdueDays = 0;
    // BrineOS Phase 7: a fresh charge re-arms autopay for this cycle — see
    // processAutopayForDay's comment for why this is the one-shot marker's
    // reset point rather than a daily re-check.
    bill.autopayAttempted = false;
    bill.dueDay = rescheduleDue(bill.dueDay, def.cadenceDays);
    // Phase 5: reset the meters that fed this bill so the next cycle
    // starts fresh. The bill just charged for the accumulated usage; if
    // the meters kept running the next bill would double-count.
    resetUtilityMeters(gameState, def.id);
    results.push({ billId: def.id, label: def.label, posted: amt, balance: bill.balance });
  }

  // 2. Check grace / cutoff on bills with a balance. A bill past its
  // grace window (due was `graceDays` ago, measured from the just-rescheduled
  // dueDay) flips to 'overdue' and activates its cutoff.
  for (const def of Object.values(BILL_DEFS)) {
    const bill = bills[def.id];
    if (!bill || bill.balance <= 0) continue;
    if (bill.status !== 'due' && bill.status !== 'overdue') continue;
    // Days since this bill's most recent posting = (next dueDay - cadence)
    // is the posting day; overdue days = day - postingDay - graceDays.
    const postingDay = bill.dueDay - def.cadenceDays;
    const daysPastDue = Math.max(0, day - postingDay);
    if (daysPastDue > def.graceDays) {
      bill.overdueDays = daysPastDue - def.graceDays;
      bill.status = 'overdue';
      if (def.cutoff && !bill.cutoffActive) {
        bill.cutoffActive = true;
        results.push({ billId: def.id, label: def.label, cutoff: def.cutoff, activated: true });
      }
    } else {
      bill.overdueDays = 0;
    }
  }

  return results;
}

// Is a given utility cutoff currently active? Read by the requirement
// checkers, the gig/stream/browser handlers, and the bill dashboard.
function isCutoffActive(gameState, cutoffId) {
  if (!cutoffId) return false;
  for (const def of Object.values(BILL_DEFS)) {
    if (def.cutoff !== cutoffId) continue;
    const bill = gameState.world.bills?.[def.id];
    if (bill && bill.cutoffActive) return true;
  }
  return false;
}

// Phase 5 (decision F): device-aware reason why an app is currently
// blocked, or null when it's usable. This is the real wiring for
// BILL_CUTOFF_EFFECTS' blocksComputer / blocksApps / phone fields — the
// gig, stream and browser handlers call it with their device so phone and
// computer get the asymmetric connectivity the plan specifies:
//   * computer — a power cutoff kills the whole machine (blocksComputer);
//     an internet cutoff blocks the online apps (blocksApps).
//   * phone — cellular service (the phone bill's cutoff) only matters
//     when there's no home wifi either: an online app is blocked only
//     when BOTH internet AND phone cutoffs are active (decision F). Power
//     cutoffs never touch the phone (it runs on battery), and
//     connectivity never gates bank/upgrades/etc — bill payment must stay
//     reachable, the Phase 1 softlock rule.
function appBlockedReason(gameState, appId, device) {
  const eff = BILL_CUTOFF_EFFECTS;
  if (device === 'phone') {
    if (eff.internet?.blocksApps?.includes(appId)
        && isCutoffActive(gameState, 'internet')
        && isCutoffActive(gameState, 'phone')) {
      return eff.phone?.label || 'Phone service is off';
    }
    return null;
  }
  if (eff.power?.blocksComputer && isCutoffActive(gameState, 'power')) {
    return eff.power.label || 'Power is off';
  }
  if (eff.internet?.blocksApps?.includes(appId) && isCutoffActive(gameState, 'internet')) {
    return eff.internet.label || 'Internet is down';
  }
  return null;
}

// Phase 5.5 (landmine L11): is an AfterHours session *actively* running
// right now? Derived — never a stored boolean. A session { device,
// startedTick } is active only while its owning device is still in use,
// so every exit path (pocketing the phone, locking it, battery death,
// power loss, closing the computer) self-heals with no force-clear call
// to forget — see closeComputer's comment and the plan's 5.5.
//   * computer — the machine is powered on.
//   * phone — the shell is on, the phone is physically OUT in the room
//     with the player (presence 'here' — 'carried' is the pocket, and
//     L11's exact bug is being flagged masturbating *while walking
//     through the kitchen* with the phone in your pocket), unlocked, and
//     not battery-dead (the same gate doPhoneOpen uses, so a phone that
//     couldn't turn on can't host a session).
function isAfterHoursSessionActive(gameState) {
  const session = gameState?.world?.computer?.apps?.browser?.afterHoursSession;
  if (!session) return false;
  if (session.device === 'phone') {
    if (gameState?.world?.phone?.power !== 'on') return false;
    if (phonePresence(gameState) !== 'here') return false;
    const found = findPhoneObject(gameState);
    if (found?.obj?.state?.lock === 'locked') return false;
    const battery = getPhoneBattery(gameState);
    if (battery != null && battery <= 0 && !isPhoneCharging(gameState, found?.obj, found?.bucket)) return false;
    return true;
  }
  return gameState?.world?.computer?.power === 'on';
}

// Pay a single bill: clear its balance, deactivate its cutoff (service
// restored), charge the reconnection fee if the cutoff was active. The
// player must be able to afford balance + fee.
function payBill(gameState, billId) {
  const def = BILL_DEFS[billId];
  if (!def) return { ok: false, reason: 'No such bill.' };
  const bill = gameState.world.bills?.[billId];
  if (!bill) return { ok: false, reason: 'No such bill.' };
  if (bill.balance <= 0) return { ok: false, reason: 'Nothing owed on that bill.' };
  const reconnect = bill.cutoffActive ? def.reconnectionFee : 0;
  const total = bill.balance + reconnect;
  if (gameState.player.money < total) return { ok: false, reason: `Can't afford ${total} (you have ${Math.round(gameState.player.money)}).` };
  gameState.player.money -= total;
  const wasCutoff = bill.cutoffActive;
  bill.balance = 0;
  bill.status = 'paid';
  bill.overdueDays = 0;
  bill.cutoffActive = false;
  return { ok: true, billId, paid: total, balance: 0, reconnected: wasCutoff, reconnectFee: reconnect };
}

// Pay all currently-due/overdue bills in one action (the "Pay All" button).
// Pays bills with a positive balance, skipping any the player can't afford
// (partial payment of the whole stack isn't supported — pay the cheap ones
// and leave the expensive one for next time).
function payAllBills(gameState) {
  const bills = gameState.world.bills;
  if (!bills) return { ok: false, reason: 'No bills.' };
  const results = [];
  let totalPaid = 0;
  let owedCount = 0;
  // Cheapest thing the player *could* clear if they had the money. "Nothing
  // to pay" and "can't afford any of it" are opposite situations, and the
  // Phase 1 world chip only appears when a bill is cut off — so the
  // unaffordable branch is guaranteed reachable, and telling a broke player
  // with no power that there's nothing to pay is a lie at the worst moment.
  let cheapest = null;
  for (const def of Object.values(BILL_DEFS)) {
    const bill = bills[def.id];
    if (!bill || bill.balance <= 0) continue;
    owedCount++;
    const r = payBill(gameState, def.id);
    if (r.ok) { results.push(r); totalPaid += r.paid; continue; }
    const need = bill.balance + (bill.cutoffActive ? def.reconnectionFee : 0);
    if (!cheapest || need < cheapest.need) cheapest = { need, label: def.label };
  }
  const unpaidCount = owedCount - results.length;
  if (results.length === 0) {
    if (owedCount === 0) return { ok: false, reason: 'Nothing to pay right now.' };
    return {
      ok: false,
      reason: `You can't cover any of it. Cheapest is ${cheapest.label} at $${Math.round(cheapest.need)}, and you have $${Math.round(gameState.player.money)}.`,
    };
  }
  return { ok: true, results, totalPaid, unpaidCount, cheapestUnpaid: cheapest };
}

// --- Autopay (BrineOS Phase 7) ---

// Flip a bill's autopay flag. Rent (split:'lease') is not eligible — it has
// its own cap/eviction path, not this flat-balance model.
function toggleBillAutopay(gameState, billId) {
  const def = BILL_DEFS[billId];
  if (!def || def.split === 'lease') return { ok: false, reason: 'Not eligible for autopay.' };
  const bill = gameState.world.bills?.[billId];
  if (!bill) return { ok: false, reason: 'No such bill.' };
  bill.autopay = !bill.autopay;
  return { ok: true, billId, autopay: bill.autopay };
}

// BrineOS Phase 7 (plan 7.2, ordering documented at the call site in ui.js
// processDayRollover): runs AFTER processBillsForDayUi, so it acts on the
// day's already-posted charges and already-evaluated cutoffs — the true
// current balance, not a stale pre-posting one — rather than being folded
// into processBillsForDay itself (kept separate on purpose: Phase 1's bill
// -posting path stays untouched, so a regression in either is easy to
// attribute to the right phase).
//
// One attempt per posting cycle via bill.autopayAttempted, reset to false
// only when a fresh charge posts (processBillsForDay). Without that gate,
// autopay would retry — and re-bounce, re-charging the fee — every single
// day of the grace window, which is a runaway spiral the plan never asked
// for; a real bank drafts once and waits for the next cycle.
//
// A success reuses payBill() itself (same path a manual click uses, so
// reconnection fees on an already-cut-off bill are handled identically). A
// failure (insufficient funds) does NOT retry or clamp — it adds
// AUTOPAY.bounceFee straight onto the balance, compounding the debt. That
// is deliberately worse than a manual miss, which just sits at its posted
// amount until grace expires: autopay's whole design point (7.3) is that
// it's the safe choice most months and the trap in a dry spell.
function processAutopayForDay(gameState, day) {
  const bills = gameState.world.bills;
  if (!bills) return [];
  const results = [];
  for (const def of Object.values(BILL_DEFS)) {
    if (def.split === 'lease') continue;
    const bill = bills[def.id];
    if (!bill || !bill.autopay || bill.balance <= 0 || bill.autopayAttempted) continue;
    const attempt = payBill(gameState, def.id);
    bill.autopayAttempted = true;
    if (attempt.ok) {
      results.push({ billId: def.id, label: def.label, ok: true, paid: attempt.paid, reconnected: attempt.reconnected });
    } else {
      bill.balance += AUTOPAY.bounceFee;
      results.push({ billId: def.id, label: def.label, ok: false, bounceFee: AUTOPAY.bounceFee, balance: bill.balance });
    }
  }
  return results;
}

// --- Phase 6: Quarterly taxes ---

// Record a deductible expense. Called from Nile checkout (tech/electronics
// purchases) and Classes enrollment (tech skill courses). Deductions
// accumulate over the quarter and reduce the taxable gross at quarter end.
// This is what makes other systems matter: buying a better computer becomes
// a tax decision as well as a capability one.
function recordTaxDeduction(gameState, amount) {
  if (!amount || amount <= 0) return;
  const taxes = gameState.world.taxes;
  if (!taxes) return;
  taxes.quarterDeductions = (taxes.quarterDeductions || 0) + amount;
}

// Compute the tax owed for a tax period, given the period's gross and the
// accumulated deductions (including the internet share, which is added
// here). Returns { taxableGross, deductions, owed }.
function computeTaxOwed(gameState) {
  const taxes = gameState.world.taxes;
  if (!taxes) return { taxableGross: 0, deductions: 0, owed: 0 };
  const gross = taxes.quarterGross || 0;
  // Phase 11: realized investment gains are taxable. They accumulate in
  // invest.realizedGains and get added to the period's gross at tax time.
  const invest = gameState.world.computer?.apps?.invest;
  const realizedGains = invest?.realizedGains || 0;
  let deductions = taxes.quarterDeductions || 0;
  // Internet bill share: add the deductible fraction of the internet
  // bills posted this tax period. The internet bill posts every 35 days
  // (cadenceDays — D5 scaled it to a season), so a 70-day tax period sees
  // exactly ceil(70/35) = 2 postings: an exact count, not an estimate.
  // This is the whole point of D5: the cadence must divide the period. At
  // the old 30-day cadence over 70 days the formula would read
  // ceil(2.33) = 3 against 2.33 actual — a 71% over-deduction every
  // period (per-season, ceil(1.17) = 2 against 1.17, same story).
  const internetDef = BILL_DEFS.internet;
  if (internetDef) {
    const internetPerCycle = computeBillAmount(internetDef, gameState);
    const postingsPerPeriod = Math.ceil(CALENDAR.daysPerTaxPeriod / internetDef.cadenceDays);
    deductions += Math.round(internetPerCycle * postingsPerPeriod * TAX_CONFIG.internetDeductibleFraction);
  }
  const taxableGross = Math.max(0, gross + Math.max(0, realizedGains) - deductions);
  const owed = Math.round(taxableGross * TAX_CONFIG.rate);
  return { taxableGross, deductions, owed };
}

// Bill quarterly taxes at the end of each tax period. Called from
// processDayRollover (via processTaxesForDayUi) when isTaxPeriodEnd(day)
// is true.
//
// The tax is owed = rate × (quarterGross − deductions). What was already
// paid (the auto-reserve balance, plus any reserve the player set aside)
// counts toward the bill. If the player's reserve covers it, the reserve
// is drawn down. Any shortfall becomes `unpaid`, which carries forward
// with a penalty + interest each subsequent period — compounding, so
// ignoring taxes is a spiral rather than a flat fee.
//
// Returns a result record for logging, or null if no billing happened
// (already billed this quarter, or gross is zero with nothing unpaid).
function processQuarterlyTaxes(gameState, day) {
  const taxes = gameState.world.taxes;
  if (!taxes) return null;
  const taxPeriod = getTaxPeriod(day);
  // Don't rebill a tax period we've already billed. NOTE: the persisted key
  // stays `lastQuarterBilled` (its name predates the 70-day tax period and is
  // opaque anyway) — only the VALUE's meaning changed, from a 0-3 quarter
  // index to a 0-1 tax-period index.
  if (taxes.lastQuarterBilled === taxPeriod && (taxes.quarterGross || 0) === 0 && (taxes.unpaid || 0) === 0) return null;
  // Accumulate interest on carried-forward unpaid balance first.
  let unpaid = taxes.unpaid || 0;
  let interestCharge = 0;
  if (unpaid > 0) {
    interestCharge = Math.round(unpaid * TAX_CONFIG.interestRate);
    unpaid += interestCharge;
  }
  const { taxableGross, deductions, owed } = computeTaxOwed(gameState);
  // Total due this quarter = this quarter's tax + carried-forward unpaid.
  const totalDue = owed + unpaid;
  // The reserve (auto-reserve skim + any manual reserve) pays down the bill.
  const reserve = taxes.reserve || 0;
  const fromReserve = Math.min(reserve, totalDue);
  const shortfall = Math.max(0, totalDue - fromReserve);
  // Underpayment penalty on the shortfall (if the player earned income but
  // didn't reserve enough). Zero shortfall = no penalty.
  let penalty = 0;
  if (shortfall > 0 && owed > 0) {
    penalty = Math.round(shortfall * TAX_CONFIG.underpaymentPenalty);
  }
  const newUnpaid = shortfall + penalty;
  // Apply: drain the reserve by what was used, reset quarter accumulators.
  taxes.reserve = reserve - fromReserve;
  taxes.unpaid = newUnpaid;
  taxes.quarterGross = 0;
  taxes.quarterDeductions = 0;
  // Phase 11: reset realized gains after they've been taxed.
  if (gameState.world.computer?.apps?.invest) {
    gameState.world.computer.apps.invest.realizedGains = 0;
  }
  taxes.lastQuarterBilled = taxPeriod;
  taxes.lastQuarterOwed = owed;
  taxes.lastQuarterPaid = fromReserve;
  return {
    taxPeriod, gross: taxableGross + deductions, deductions, owed,
    fromReserve, shortfall, penalty, interestCharge,
    carriedForward: newUnpaid, totalDue,
  };
}

// Pay down the unpaid tax balance from the player's pocket. This is the
// "Pay Tax Bill" button — separate from the reserve, which is automatic.
// The player pays the outstanding `unpaid` (which includes any penalties
// and interest already charged). Can pay partially if they can't afford
// the full amount.
function payTaxBill(gameState, amount) {
  const taxes = gameState.world.taxes;
  if (!taxes) return { ok: false, reason: 'Tax system not initialized.' };
  const owed = taxes.unpaid || 0;
  if (owed <= 0) return { ok: false, reason: 'You don\'t owe any back taxes.' };
  const pay = Math.min(amount || owed, owed);
  if (pay <= 0) return { ok: false, reason: 'Nothing to pay.' };
  if (gameState.player.money < pay) return { ok: false, reason: `Can't afford ${pay} (you have ${Math.round(gameState.player.money)}).` };
  gameState.player.money -= pay;
  taxes.unpaid = owed - pay;
  return { ok: true, paid: pay, remaining: taxes.unpaid };
}

// Draw from the reserve into the player's pocket — the reverse of the
// auto-skim. The reserve is money the player already earned but set aside;
// pulling it back out is always free. Used when the player wants to spend
// reserved money on something other than taxes (or just misjudged).
function withdrawTaxReserve(gameState, amount) {
  const taxes = gameState.world.taxes;
  if (!taxes) return { ok: false, reason: 'Tax system not initialized.' };
  const reserve = taxes.reserve || 0;
  if (reserve <= 0) return { ok: false, reason: 'Your tax reserve is empty.' };
  const withdraw = Math.min(amount || reserve, reserve);
  if (withdraw <= 0) return { ok: false, reason: 'Nothing to withdraw.' };
  taxes.reserve = reserve - withdraw;
  gameState.player.money += withdraw;
  return { ok: true, withdrawn: withdraw, remaining: taxes.reserve };
}

// Toggle the auto-reserve. When on, each gig delivery skims 27% of the
// payout into a protected reserve the player can't accidentally spend.
function toggleAutoReserve(gameState) {
  const taxes = gameState.world.taxes;
  if (!taxes) return { ok: false, reason: 'Tax system not initialized.' };
  taxes.autoReserve = !taxes.autoReserve;
  return { ok: true, autoReserve: taxes.autoReserve };
}

// --- Phase 4: Apartment upgrades / disrepair ---

// Get the next tier up from the current one, or null if already maxed.
function getNextFacilityTier(def, currentTier) {
  const idx = def.tiers.findIndex(t => t.tier === currentTier);
  if (idx < 0 || idx >= def.tiers.length - 1) return null;
  return def.tiers[idx + 1];
}

// Is a facility at least 'functional'? Used by the action requirement
// checker and the recruitment gate.
function isFacilityFunctional(gameState, facilityId) {
  const upgrade = gameState.world.upgrades?.[facilityId];
  if (!upgrade) return true; // no upgrade state = old save, don't block
  // Renovation overhaul: a facility with an active contracted job is under
  // construction — reads as unavailable until the job completes.
  if (upgrade.activeJobId) return false;
  return upgrade.tier === 'functional' || upgrade.tier === 'upgraded';
}

// Reverse-lookup a facility's room from ROOM_FACILITIES. Post-overhaul
// every facility maps to exactly one room (the old type-wide bedroom
// facility is gone), so the first match is the answer.
function getRoomIdForFacility(facilityId) {
  for (const [roomId, fids] of Object.entries(ROOM_FACILITIES)) {
    if (fids.includes(facilityId)) return roomId;
  }
  return null;
}

// Renovation overhaul Phase 3: the active job for a room (if any) — the
// first facility in ROOM_FACILITIES[roomId] whose activeJobId points at a
// live active job record. Null when the room isn't under construction.
// Used by the floor plan (render.js) and room-entry narration (ui.js).
function getActiveJobForRoom(gameState, roomId) {
  const upgrades = gameState.world?.upgrades;
  const jobs = gameState.world?.renovationJobs || [];
  for (const fid of (ROOM_FACILITIES[roomId] || [])) {
    const jobId = upgrades?.[fid]?.activeJobId;
    if (!jobId) continue;
    return jobs.find(j => j.id === jobId && j.status === 'active') || null;
  }
  return null;
}

// --- Contractor Friend pricing (src/ref/complete/contractor-tutorial-overhaul-plan.md) ---
// The Contractor charges the facility's materials cost (the existing
// per-tier `cost` field) plus a flat labor markup — "he's intended to make
// a lot of money off the player." Kept as its own constant + function (not
// baked into FACILITY_DEFS tier costs) so the pricing model can change
// (a second contractor option, a loyalty reversal, whatever) without
// touching the facility data model.
const CONTRACTOR_LABOR_MARKUP = 0.35; // tune during playtesting — "makes real money off the player"
function getContractorJobPrice(materialsCost) {
  return Math.round(materialsCost * (1 + CONTRACTOR_LABOR_MARKUP));
}

// Tutorial free-job predicate (contractor doc Phase 3): the FIRST job on an
// auxiliary bedroom is free — the one-time guided tutorial (the original
// brainstorm: "the first auxiliary bedroom will be a free upgrade"). The
// tutorialRenoUsed flag is consumed on the booking in bookRenovationJob, so
// every subsequent bedroom job — including that bedroom's later Upgrade —
// charges full price.
function isTutorialFreeJob(gameState, facilityId) {
  if (gameState?.world?.flags?.tutorialRenoUsed) return false;
  return TUTORIAL_FREE_FACILITIES.includes(facilityId);
}

// The price a job actually books at — $0 for the tutorial free job, else
// materials + labor markup. Single source of truth so the RenoFix card, the
// booking modal, and bookRenovationJob all advertise and charge the same
// number (Phase 2's price-advertised == price-charged invariant).
function getRenovationJobCost(gameState, facilityId, jobType, opts = {}) {
  const def = FACILITY_DEFS[facilityId];
  const upgrade = gameState?.world?.upgrades?.[facilityId];
  const nextTier = def && upgrade ? getNextFacilityTier(def, upgrade.tier) : null;
  if (!nextTier) return null;
  if (isTutorialFreeJob(gameState, facilityId)) return 0;
  const base = getContractorJobPrice(nextTier.cost);
  // Weekend rush (Phase 4) is a premium on the whole job, labor included.
  return opts.rush ? Math.round(base * RENOVATION_RUSH_MULTIPLIER) : base;
}

// Contractor memory of the current job (contractor doc Phase 4 — banter
// depth). Keeps a live "what am I working on right now" fact in the
// Contractor's memory.facts so LLM-backed IM replies about a job in progress
// get grounded material to reference. Only ONE valid 'renovation_job' fact
// exists at a time — every new job fact (booking, stage refresh, or the
// completion that retires it) invalidates the previous active fact; completed
// jobs accumulate as 'renovation_done' facts so recent work stays recallable.
// No-ops when the Contractor NPC is missing (e.g. synthetic states).
function setContractorJobFact(gameState, category, text, day) {
  const npc = gameState?.npcs?.[CONTRACTOR_ID];
  if (!npc || !Array.isArray(npc.memory?.facts)) return;
  if (category === 'renovation_job' || category === 'renovation_done') {
    for (const f of npc.memory.facts) {
      if (f.category === 'renovation_job' && f.valid !== false) f.valid = false;
    }
  }
  // Knowledge-gossip Phase 1: written through the record normalizer so the
  // belief record is complete on every fact (provenance 'witnessed',
  // confidence 1.0, pinned per D3 — importance 0.9 >= significant).
  // Deliberately NOT addMemoryFact: this writer has its own eviction policy
  // (drop completed jobs before history) and addMemoryFact's pinned-exempt
  // eviction would fight it.
  npc.memory.facts.push(backfillFactRecordV2({ text, day: day || 0, importance: 0.9, category, valid: true }));
  // Respect the memory budget, preferring to drop a completed-job fact over
  // any static/seeded history fact (day 0, category 'history'). Pinned facts
  // are exempt (D3); if every fact is pinned the overflow is allowed — the
  // all-pinned precedent. In practice the tier stays ~20 facts under the 60
  // cap, so this branch is the rarely-hit backstop.
  const cap = BELIEF.maxFacts;
  if (npc.memory.facts.length > cap) {
    let dropIdx = npc.memory.facts.findIndex(f => f.pinned !== true && f.category === 'renovation_done');
    if (dropIdx < 0) dropIdx = npc.memory.facts.findIndex(f => f.pinned !== true);
    npc.memory.facts.splice(dropIdx >= 0 ? dropIdx : 0, 1);
  }
}

// Post a one-shot Contractor milestone text (contractor doc Phase 3). Each
// milestone id fires at most once ever, keyed by world.flags.tutorial_<id>,
// and posts through processNpcImMessages like any other NPC-initiated IM
// (zero-LLM-in-ticks — deterministic template pools, see
// CONTRACTOR_TUTORIAL_MILESTONES). When the IM app can't be reached
// (synthetic/test states without world.computer) it returns false WITHOUT
// setting the flag, so the text still fires once a real computer exists.
function fireContractorMilestone(gameState, milestoneId) {
  if (!gameState?.world) return false;
  const flags = gameState.world.flags || (gameState.world.flags = {});
  const key = `tutorial_${milestoneId}`;
  if (flags[key]) return false;
  const pool = CONTRACTOR_TUTORIAL_MILESTONES[milestoneId];
  if (!pool || !gameState.world.computer?.apps?.im) return false;
  flags[key] = true;
  const text = pool[Math.floor(orbitalRandom() * pool.length)];
  processNpcImMessages(gameState, [{ npcId: CONTRACTOR_ID, text }]);
  return true;
}

// --- External NPCs (src/ref/complete/external-world-npcs-overhaul-plan.md) ---
// Spawn a full, persistent external NPC deterministically from the world
// seed. Reuses the exact pools generateApplicantStubsForDay draws from, so
// an external is built the same way any other character is — they are full
// NPCs, never vendor bots (design invariant 6). Created as 'visitor':
// present only inside a visit window, never a resident, no rent.
// Phase 3 uses this for the maid; Phases 5-7 reuse it for drivers, friends
// and escorts rather than each inventing their own generator.
// AfterHours Phase 7 (Hot Singles): `opts.deviant` is an optional 0..1 skew
// that re-rolls volatility/openness toward the high end, favours the
// adult-leaning trait pool (AH_HOT_SINGLES_TUNING.adultTraits), and bakes
// `bible.deviantLevel` — a [0,1] number derived from that temperament —
// into every external NPC so later systems can consume it without
// string-matching (Phase 8 drives interruption math off it; 0 skew just
// records the temperament's natural deviantLevel).
function createExternalNpc(gameState, npcId, seedKey, occupationTitle, opts = {}) {
  if (gameState.npcs[npcId]) return gameState.npcs[npcId];
  // Same raw-vs-wrapped tolerance as generateFriendStub/ensureSocialCircles:
  // Phase 7's ensureEscortRoster calls this from writeGeneratedGameState,
  // which still holds the freshly generated, unwrapped state (top-level
  // `seed`, no `.meta` yet) — `gameState.meta.seed` threw there.
  const seed = gameState.meta?.seed ?? gameState.seed;
  const rng = seededRng(seed, seedKey);
  const gender = rollGender(rng);
  const age = rollAge(rng);
  const useNeutral = rng() < 0.2;
  const namePool = useNeutral ? CHAR_GEN.namePools.first_n
    : (gender === 'male' || gender === 'trans_male') ? CHAR_GEN.namePools.first_m
    : CHAR_GEN.namePools.first_f;
  const name = namePool[Math.floor(rng() * namePool.length)];
  // Hot Single skew: at least one trait comes from the adult-leaning pool
  // (the rest from the general pool minus the adult entries, so the trait
  // set stays unique and canonical).
  const numTraits = 2 + Math.floor(rng() * 2);
  let traits;
  if (opts.deviant > 0) {
    const adultPool = AH_HOT_SINGLES_TUNING?.adultTraits || [];
    const adultCount = Math.min(adultPool.length, 1 + Math.floor(rng() * Math.min(2, numTraits)));
    const adultPick = pickUnique(rng, adultPool, adultCount);
    const generalPool = PERSONALITY_TRAITS_POOL.filter(t => !adultPool.includes(t));
    traits = [...adultPick, ...pickUnique(rng, generalPool, numTraits - adultCount)];
  } else {
    traits = pickUnique(rng, PERSONALITY_TRAITS_POOL, numTraits);
  }
  const occ = weightedPick(rng, OCCUPATION_POOL);
  const temperament = {
    warmth: rollAxis(rng), volatility: rollAxis(rng), openness: rollAxis(rng),
    conscientiousness: rollAxis(rng), assertiveness: rollAxis(rng), selfAwareness: rollAxis(rng),
  };
  if (opts.deviant > 0) {
    // Re-roll toward the high end (Locked decision 19): the affine pull
    // `skew + v*(1-skew)` keeps the [-1,1] span but shifts the mean up.
    temperament.volatility = skewAxisTowardHigh(rng, opts.deviant);
    temperament.openness = skewAxisTowardHigh(rng, opts.deviant);
  }
  // The deviant number: a temperament-weighted [0,1] so Phase 8 can compare
  // Hot Singles against low-deviant roommates without string-matching.
  // The arithmetic moved to SIM's disinhibitionFromTemperament (initiative
  // plan D11) when the roommate cast — who have no baked deviantLevel at all —
  // needed the same model. Same weights, one definition, read from
  // AH_HOT_SINGLES_TUNING.deviantWeights; this is the only place it is BAKED.
  const deviantLevel = disinhibitionFromTemperament(temperament);
  const bible = {
    name,
    genSeed: Math.floor(rng() * 1e9),
    age,
    gender,
    history: '',
    deviantLevel,
    temperament,
    personality: { traits, coreTrait: traits[0] || 'easygoing', hiddenTrait: '', quirks: [], likes: [], dislikes: [] },
    occupation: {
      category: 'service',
      title: occupationTitle || occ.title,
      scheduleTemplate: 'day_shift',
      incomeBand: 'low',
      hours: '9-17',
    },
    interests: [], values: [],
    baggage: '', wound: '', want: '', blindSpot: '', boundary: '',
    speech: {
      verbosity: rng(), formality: rng(), humorStyle: 'dry', profanityLevel: rng() * 0.5,
      verbalTics: [], textingStyle: 'casual', vocabularyLevel: 0.5, catchphrases: [],
    },
    scheduleTemplate: 'day_shift',
    sketch: `${age}-year-old ${occupationTitle || occ.title}`,
    sampleLines: [],
  };
  // Settings & Pause Overhaul Phase 6 (D13): species, drawn AFTER the bible
  // literal above (whose own draws — genSeed, the speech fields — must stay
  // in their pre-overhaul positions). Appending at the very end keeps every
  // existing seed's external NPC byte-identical at the default human-100%.
  bible.species = rollSpecies(rng);
  const npc = createNpcFromBible(bible, 'visitor');
  gameState.npcs[npcId] = npc;
  return npc;
}

// Push a temperament axis toward its high end: `skew + v*(1-skew)` preserves
// the [-1,1] span but pulls the mean up by `skew` (skew 0 = identity; 1
// clamps everything to 1). Used by the Hot Single deviant re-roll.
function skewAxisTowardHigh(rng, skew) {
  const v = rollAxis(rng);
  return Math.max(-1, Math.min(1, skew + v * (1 - skew)));
}

// AfterHours Phase 7 (Hot Singles): a full external NPC with the deviant
// skew baked in, occupation-titled "Hot Single". The npcId doubles as the
// seedKey, so the same world seed always produces the same six people
// (hot_single_1..6). They are ordinary NPCs after generation — "Say hi"
// grants contact and they run on every existing external-world path.
function createHotSingleNpc(gameState, npcId, seedKey) {
  return createExternalNpc(gameState, npcId, seedKey || npcId, 'Hot Single', {
    deviant: AH_HOT_SINGLES_TUNING.deviantSkew,
  });
}

// --- Friends of roommates (external-world plan Phase 6) ---
// A resident's social circle is 2-4 friend STUBS, not 2-4 NPCs: the same
// cheap deterministic record generateApplicantStubsForDay builds for the
// RoomList browse grid (name/age/gender/occupation/traits/warmth/sketch,
// zero LLM), parked in world.externalStubs until someone actually comes over.
// Only then does it become a full bible, through createNpcFromStub — the
// identical promotion path a RoomList applicant takes.
//
// Slots sit at FRIEND_STUB_SLOT_BASE, far clear of the cast (0..n), of
// applicant stubs (2000 + day*100 + i, which climbs with the calendar) and of
// Studio builds (5000+), so genSeededNpcId can never collide across sources.
const FRIEND_STUB_SLOT_BASE = 900000;

function generateFriendStub(gameState, hostNpcId, index) {
  const stubs = gameState.world.externalStubs || (gameState.world.externalStubs = {});
  const stubId = `friend_${hostNpcId}_${index}`;
  if (stubs[stubId]) return stubs[stubId];
  // Tolerates both state shapes: a live gameState carries the seed on `meta`,
  // but the freshly generated state writeGeneratedGameState seeds circles into
  // still has it at the top level (buildGameState hasn't been wrapped yet).
  const seed = gameState.meta?.seed ?? gameState.seed;
  const rng = seededRng(seed, stubId);

  const gender = rollGender(rng);
  const age = rollAge(rng);
  const occ = weightedPick(rng, OCCUPATION_POOL);
  const traits = pickUnique(rng, PERSONALITY_TRAITS_POOL, 2 + Math.floor(rng() * 2));
  const coreTrait = traits[Math.floor(rng() * traits.length)] || 'easygoing';
  const useNeutral = rng() < 0.2;
  const namePool = useNeutral ? CHAR_GEN.namePools.first_n
    : (gender === 'male' || gender === 'trans_male') ? CHAR_GEN.namePools.first_m
    : CHAR_GEN.namePools.first_f;
  const name = namePool[Math.floor(rng() * namePool.length)];
  const warmth = rollAxis(rng);
  // Settings & Pause Overhaul Phase 6 (D13): species — APPENDED at the end
  // of the stub's draw sequence (same rule as the applicant stubs), so the
  // default human-100% distribution reproduces every seed's friends exactly.
  const species = rollSpecies(rng);

  const stub = {
    stubId,
    hostNpcId,
    seed,
    slot: FRIEND_STUB_SLOT_BASE + Object.keys(stubs).length,
    name,
    age,
    gender,
    species,
    occupation: { category: occ.category, title: occ.title, incomeBand: occ.incomeBand, hours: occ.hours },
    coreTrait,
    traits,
    warmth,
    sketch: `${age}-year-old ${occ.title}, ${warmth > 0 ? 'warm' : 'reserved'} and ${coreTrait}`,
    status: 'stub',        // stub | ready (mirrors the applicant stub lifecycle)
    fullNpcId: null,
    lastVisitDay: null,
  };
  stubs[stubId] = stub;
  return stub;
}

// Promote a friend stub ahead of their visit. Same contract as
// promoteStubToNpc, different source table and residency: they arrive as a
// 'visitor', which is what the visit spine resolves presence for.
function promoteFriendStub(gameState, stubId) {
  const stub = gameState.world.externalStubs?.[stubId];
  if (!stub) return { ok: false, reason: 'Stub not found.' };
  if (stub.fullNpcId && gameState.npcs[stub.fullNpcId]) return { ok: true, npcId: stub.fullNpcId, existing: true };
  return createNpcFromStub(gameState, stub, 'visitor', `friend_promote_${stubId}`);
}

// --- The maid (external-world plan Phase 3) ---
// Weekly price: every booked day's hours × the hourly rate, multiplied by
// each add-on. Charged per visit (the day's share), not weekly, so a
// contract costs exactly what it used.
function maidAddonMultiplier(addons) {
  let mult = 1;
  for (const a of addons || []) mult *= (MAID_TUNING.addonRateMultipliers[a] || 1);
  return mult;
}

function maidEntryHours(entry) {
  return Math.max(0, (entry.endTick - entry.startTick)) / 2; // 2 ticks = 1 hour
}

function getMaidVisitCost(entry, addons) {
  return Math.round(maidEntryHours(entry) * MAID_TUNING.ratePerHour * maidAddonMultiplier(addons));
}

function getMaidWeeklyCost(schedule, addons) {
  return (schedule || []).reduce((sum, e) => sum + getMaidVisitCost(e, addons), 0);
}

// Validate + normalise a submitted schedule grid: one entry per weekday,
// clamped to the daytime window, minimum length enforced.
function normaliseMaidSchedule(schedule) {
  const out = [];
  const seen = new Set();
  for (const e of schedule || []) {
    const weekday = Number(e.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || seen.has(weekday)) continue;
    let startTick = Math.max(MAID_TUNING.windowMinTick, Math.min(MAID_TUNING.windowMaxTick - MAID_TUNING.minVisitTicks, Number(e.startTick)));
    let endTick = Math.min(MAID_TUNING.windowMaxTick, Math.max(startTick + MAID_TUNING.minVisitTicks, Number(e.endTick)));
    if (!Number.isFinite(startTick) || !Number.isFinite(endTick)) continue;
    seen.add(weekday);
    out.push({ weekday, startTick, endTick });
  }
  return out.sort((a, b) => a.weekday - b.weekday);
}

function getMaidContract(gameState) {
  const services = gameState.world.computer?.apps?.services;
  return services?.hired.find(h => h.serviceId === MAID_SERVICE_ID) || null;
}

// Hire or update the maid contract. The same NPC persists across edits —
// you don't get a new stranger because you changed Tuesday's hours.
function setMaidContract(gameState, schedule, addons) {
  const services = gameState.world.computer?.apps?.services;
  if (!services) return { ok: false, reason: 'Services unavailable.' };
  const normalised = normaliseMaidSchedule(schedule);
  const validAddons = (addons || []).filter(a => MAID_ADDONS[a]);
  let contract = getMaidContract(gameState);
  if (normalised.length === 0) {
    // Empty grid = cancel. The NPC persists (everyone persists forever) —
    // you keep the relationship, you just stop paying her.
    if (contract) services.hired = services.hired.filter(h => h.serviceId !== MAID_SERVICE_ID);
    return { ok: true, cancelled: true };
  }
  if (!contract) {
    const npc = createExternalNpc(gameState, 'maid_1', 'maid_1', 'Housekeeper');
    contract = { serviceId: MAID_SERVICE_ID, schedule: normalised, addons: validAddons, npcId: 'maid_1' };
    services.hired.push(contract);
    return { ok: true, created: true, contract, npcName: npc.bible.name, weeklyCost: getMaidWeeklyCost(normalised, validAddons) };
  }
  contract.schedule = normalised;
  contract.addons = validAddons;
  return { ok: true, updated: true, contract, weeklyCost: getMaidWeeklyCost(normalised, validAddons) };
}

// Do the work for one maid visit. Cleaning always happens; add-ons layer on
// top and are gated by how long she was actually onsite that day.
function performMaidVisit(gameState, contract, entry) {
  const hours = maidEntryHours(entry);
  const scope = (contract.addons || []).includes('bedrooms') ? 'all' : 'common';
  const itemsCleaned = performCleaningVisit(gameState, { accessScope: scope });
  const result = { itemsCleaned, scope, hours, laundrySteps: 0, mealsCooked: 0 };

  // Laundry: step the hamper down (full → partial → empty), capped by hours.
  if ((contract.addons || []).includes('laundry')) {
    const steps = Math.floor(hours / MAID_TUNING.laundryHoursPerStep);
    const bucket = gameState.objects?.room_laundry || {};
    const hamper = Object.values(bucket).find(o => o.defId === 'laundry_hamper');
    if (hamper && steps > 0) {
      const ladder = ['empty', 'partial', 'full'];
      let idx = ladder.indexOf(hamper.state?.fill || 'empty');
      if (idx < 0) idx = 0;
      const newIdx = Math.max(0, idx - steps);
      result.laundrySteps = idx - newIdx;
      hamper.state = { ...(hamper.state || {}), fill: ladder[newIdx] };
    }
  }

  // Cooking: leaves real meal items in the kitchen for anyone to eat.
  if ((contract.addons || []).includes('cooking') && hours >= MAID_TUNING.cookingHoursRequired) {
    const rng = seededRng(gameState.meta.seed, `maidcook_${gameState.meta.clock.day}`);
    const fridgeBucket = gameState.objects?.room_kitchen || {};
    const fridge = Object.values(fridgeBucket).find(o => o.defId === 'fridge');
    for (let i = 0; i < MAID_TUNING.cookingMealsPerVisit; i++) {
      const itemId = MAID_TUNING.cookingMealItems[Math.floor(rng() * MAID_TUNING.cookingMealItems.length)];
      if (!ITEM_DEFS[itemId]) continue;
      if (fridge) {
        fridge.contents = addStack(fridge.contents, itemId, 1, null, {}, gameDaysNow(gameState.meta.clock));
        result.mealsCooked++;
      }
    }
  }
  return result;
}

// --- Food delivery: DoorDrop (external-world plan Phase 5) ---
// Orders reuse the shape of the Nile delivery pipeline (a world-level array
// of records with an arrival time, resolved by a processor) but not its
// mechanism: a package materialises on the doormat at day rollover, whereas
// food arrives WITH SOMEONE — the order schedules a purpose:'delivery' visit
// and the handover happens when that visit's window opens, mid-day, through
// processFoodOrdersNow (UI). That difference is the whole point of the phase.

function foodMenuEntry(restaurantId, itemId) {
  return (RESTAURANT_DEFS[restaurantId]?.menu || []).find(m => m.itemId === itemId) || null;
}

// A kitchen that's closed refuses the order outright rather than silently
// delivering at 4am. Hours are [openMinute, closeMinute) in minutes-from-
// midnight — a RECURRING daily rule, not a one-shot day-scoped window —
// possibly as an array of windows; a window with open > close wraps across
// midnight. [0, 1410] is the all-day sentinel (old tick sentinel [0, 47] × 30).
function getRestaurantWindows(def) {
  const hours = def?.hours || [0, 1410];
  return Array.isArray(hours[0]) ? hours : [hours];
}

// `minutes` is the intra-day minute (clock.minutes, 0-1439), day-independent —
// hours repeat every day, so no day-scoping or absolute-minute arithmetic
// applies (external-world-retiming D2's recurring-rule distinction).
function isRestaurantOpen(def, minutes) {
  if (!def) return false;
  return getRestaurantWindows(def).some(([open, close]) => {
    if (open === 0 && close === 1410) return true; // [0, 1410] = all day
    if (open > close) return minutes >= open || minutes < close; // wraps midnight
    return minutes >= open && minutes < close;
  });
}

// One hours string for both the browse card and the closed-refusal message,
// so the two can never disagree about what "open" means. A wrap window reads
// fine as raw 24h times ("17:00–04:00"); [0, 1410] gets its own phrasing.
function formatRestaurantHours(def) {
  const windows = getRestaurantWindows(def);
  const label = ([open, close]) => open === 0 && close === 1410
    ? 'Open 24 hours'
    : `${formatTime(open)}–${formatTime(close)}`;
  return windows.map(label).join(', ');
}

// Dev-only coverage helper: how many places are open at a given minute of the
// day (0-1439). Not wired into any UI — Phase 2's verification asserts the
// ≥2-open invariant across all 1440 minutes.
function countRestaurantsOpenAt(minutes) {
  return RESTAURANT_DEFS_LIST.filter(def => isRestaurantOpen(def, minutes)).length;
}

function getFoodApp(gameState) {
  return gameState.world.computer?.apps?.food || null;
}

// One restaurant per cart, same as every real delivery app — you can't
// combine Sal's and the sushi place into one driver's run.
function getFoodCartRestaurantId(gameState) {
  const app = getFoodApp(gameState);
  return app?.cart?.[0]?.restaurantId || null;
}

function addToFoodCart(gameState, restaurantId, itemId) {
  const app = getFoodApp(gameState);
  if (!app) return { ok: false, reason: 'DoorDrop is unavailable.' };
  const entry = foodMenuEntry(restaurantId, itemId);
  if (!entry) return { ok: false, reason: "That's not on the menu." };
  const current = getFoodCartRestaurantId(gameState);
  if (current && current !== restaurantId) {
    return { ok: false, reason: `Your cart already has ${RESTAURANT_DEFS[current]?.label || 'another restaurant'} in it — clear it first.` };
  }
  const existing = app.cart.find(c => c.itemId === itemId);
  if (existing) existing.qty += 1;
  else app.cart.push({ restaurantId, itemId, qty: 1 });
  return { ok: true };
}

function removeFromFoodCart(gameState, itemId) {
  const app = getFoodApp(gameState);
  if (!app) return;
  const existing = app.cart.find(c => c.itemId === itemId);
  if (!existing) return;
  existing.qty -= 1;
  if (existing.qty <= 0) app.cart = app.cart.filter(c => c.itemId !== itemId);
}

function clearFoodCart(gameState) {
  const app = getFoodApp(gameState);
  if (app) app.cart = [];
}

// Subtotal + the restaurant's delivery fee + the platform's cut + tip.
// Ordering in is meant to read as visibly bad value next to cooking; the
// fee stack is where that lands.
function getFoodOrderTotals(gameState, tipPctOverride) {
  const app = getFoodApp(gameState);
  const cart = app?.cart || [];
  const restaurantId = getFoodCartRestaurantId(gameState);
  const def = RESTAURANT_DEFS[restaurantId];
  const subtotal = cart.reduce((sum, c) => sum + (foodMenuEntry(c.restaurantId, c.itemId)?.price || 0) * c.qty, 0);
  const deliveryFee = cart.length > 0 ? (def?.deliveryFeeBase || 0) : 0;
  const serviceFee = Math.round(subtotal * FOOD_TUNING.serviceFeeRate);
  const tipPct = tipPctOverride != null ? tipPctOverride : (app?.tipPct ?? FOOD_TUNING.defaultTipPct);
  const tip = Math.round(subtotal * tipPct);
  return { subtotal, deliveryFee, serviceFee, tip, tipPct, total: subtotal + deliveryFee + serviceFee + tip };
}

// The soonest the food could physically arrive: the kitchen's prep time plus
// travel, rounded up to the next whole tick. Seeded on the day and the order
// number so the ETA quoted on the cart screen is exactly the ETA the order is
// placed with — a quote that shifted when you clicked would be a lie.
function getFoodTravelMinutes(gameState, seq) {
  const rng = seededRng(gameState.meta.seed, `foodtravel_${gameState.meta.clock.day}_${seq}`);
  return FOOD_TUNING.travelMinutesBase + Math.floor(rng() * FOOD_TUNING.travelMinutesVariance);
}

// The soonest the food could physically arrive, as an absolute minute
// (day*1440 + minutes): the kitchen's prep time plus travel added straight
// onto the clock — no rounding up to a half-hour boundary, so a 12:37 order
// with 45 minutes of prep+travel arrives at 13:22, not 13:30. A slow
// kitchen ordered from late at night legitimately lands on tomorrow's
// absolute range. Seeded on the day and the order number so the ETA quoted
// on the cart screen is exactly the ETA the order is placed with.
function getFoodEarliestArrival(gameState, restaurantId, seq) {
  const def = RESTAURANT_DEFS[restaurantId];
  if (!def) return null;
  const clock = gameState.meta.clock;
  return clockToAbsolute(clock) + (def.prepMinutes || 0) + getFoodTravelMinutes(gameState, seq);
}

// Drivers are a small persistent pool rather than a fresh stranger per order:
// repeat drivers are what let a delivery person become someone you know (and
// eventually ask for a number — Phase 2's ask-contact works on them
// unmodified, since contactKnown defaults false for everyone but Del).
function pickFoodDriver(gameState, seq) {
  const rng = seededRng(gameState.meta.seed, `fooddriver_${gameState.meta.clock.day}_${seq}`);
  const n = 1 + Math.floor(rng() * FOOD_TUNING.driverPoolSize);
  const npcId = `driver_${n}`;
  createExternalNpc(gameState, npcId, npcId, 'Delivery Driver');
  return npcId;
}

// Place the order: charge, pick the driver, schedule their visit at the
// entry, and record the order. Nothing enters inventory here — the handover
// is processFoodOrdersNow's job when the driver actually turns up.
// `requestedAbs` (optional) is a scheduled delivery slot — an absolute
// minute (day*1440 + minutes, e.g. "today 19:30" or "tomorrow 00:30"); the
// order still can't beat the kitchen, so the real arrival is the later of
// the two. The order keeps `day` = the day it was placed (the Orders list)
// plus `arrivalAbs` = the absolute minute the driver physically turns up,
// which lands in day+1's range for late-night orders.
function placeFoodOrder(gameState, opts = {}) {
  const app = getFoodApp(gameState);
  if (!app) return { ok: false, reason: 'DoorDrop is unavailable.' };
  if (!app.cart || app.cart.length === 0) return { ok: false, reason: 'Your cart is empty.' };
  const restaurantId = getFoodCartRestaurantId(gameState);
  const def = RESTAURANT_DEFS[restaurantId];
  if (!def) return { ok: false, reason: 'That restaurant is gone.' };

  const { day, minutes } = gameState.meta.clock;
  if (!isRestaurantOpen(def, minutes)) {
    return { ok: false, reason: `${def.label} is closed right now (${formatRestaurantHours(def)}).` };
  }

  const orders = gameState.world.foodOrders || (gameState.world.foodOrders = []);
  const seq = orders.length;
  const totals = getFoodOrderTotals(gameState, opts.tipPct);
  if (gameState.player.money < totals.total) {
    return { ok: false, reason: `Can't afford $${totals.total} (you have $${Math.round(gameState.player.money)}).` };
  }

  const earliestAbs = getFoodEarliestArrival(gameState, restaurantId, seq);
  let arrivalAbs = earliestAbs;
  const requestedAbs = Number(opts.requestedAbs);
  if (Number.isFinite(requestedAbs)) {
    const requestedDay = Math.floor(requestedAbs / 1440);
    if (requestedDay !== day && requestedDay !== day + 1) {
      return { ok: false, reason: 'Deliveries are for today or tomorrow.' };
    }
    arrivalAbs = Math.max(arrivalAbs, requestedAbs);
  }
  // Scheduled deliveries can't be pushed arbitrarily far out — the quote
  // window is earliest..earliest+maxScheduleAheadMinutes, the same bound the
  // cart select offers. A late-night order legitimately lands on tomorrow's
  // absolute range; nothing clamps it back into the day it started on.
  arrivalAbs = Math.min(arrivalAbs, earliestAbs + FOOD_TUNING.maxScheduleAheadMinutes);

  gameState.player.money -= totals.total;
  const driverNpcId = pickFoodDriver(gameState, seq);
  const order = {
    id: `food_${day}_${seq}`,
    restaurantId,
    items: app.cart.map(c => ({ itemId: c.itemId, qty: c.qty })),
    subtotal: totals.subtotal,
    deliveryFee: totals.deliveryFee,
    serviceFee: totals.serviceFee,
    tip: totals.tip,
    tipPct: totals.tipPct,
    total: totals.total,
    day,
    arrivalAbs,
    driverNpcId,
    status: 'ordered',
  };
  orders.push(order);
  // The driver's presence is a visit like any other — same queue the
  // contractor, the maid and invited guests use (locked decision 1). Short
  // window at the entry: they're handing over a bag, not moving in. The
  // visit lands on the ARRIVAL day's record — tomorrow's when the kitchen
  // was slow enough to push past midnight (scheduleVisit keys on
  // source+day, so an order's visit never collides with anything). The
  // window is the order's own arrivalAbs, in the same absolute-minute
  // shape every other visit window now carries.
  scheduleVisit(gameState, order.id, Math.floor(arrivalAbs / 1440), {
    npcId: driverNpcId,
    purpose: 'delivery',
    startAbs: arrivalAbs,
    endAbs: arrivalAbs + FOOD_TUNING.driverWindowMinutes,
    roomId: 'entry',
  });
  app.cart = [];
  app.openRestaurantId = null;
  return { ok: true, order, restaurant: def, totals };
}

// The absolute minute the food reaches the door, from whichever shape the
// order record carries: `arrivalAbs` on new orders; `arrivalDay`/`arrivalTick`
// on orders saved before the conversion (migration waived) — the fallback
// keeps the old same-day math, so an in-flight order on an old save still
// arrives.
function foodOrderArrivalAbs(order) {
  if (order.arrivalAbs != null) return order.arrivalAbs;
  const arrivalDay = order.arrivalDay != null ? order.arrivalDay : order.day;
  return arrivalDay * 1440 + (order.arrivalTick || 0) * 30;
}

// Minutes until the food is at the door, for the live ETA. Negative once the
// arrival has passed (the driver is here / has been).
function getFoodOrderEtaMinutes(order, clock) {
  return foodOrderArrivalAbs(order) - clockToAbsolute(clock);
}

function getActiveFoodOrders(gameState) {
  return (gameState.world.foodOrders || []).filter(o => o.status === 'ordered');
}

// --- Grocery delivery: QuickCart ---
// Same same-day pipeline shape as DoorDrop (own order array, own tuning,
// own NPC pool, tick-driven handover with a live ETA) but with no
// restaurant dimension — one store, always open, no schedule-ahead picker.
// The CART side, though, reuses Nile/Home's generic resolveCart/addToCart/
// removeFromCart/cartSubtotal completely unmodified (GROCERY_CATALOG_LIST
// items.js) — only checkout differs from Nile: same-day, a named shopper,
// a live countdown instead of "tomorrow."

function getGroceryApp(gameState) {
  return gameState.world.computer?.apps?.grocery || null;
}

function getGroceryOrderTotals(gameState, tipPctOverride) {
  const app = getGroceryApp(gameState);
  const cart = app?.cart || [];
  const subtotal = cartSubtotal(cart, ITEM_DEFS);
  const deliveryFee = cart.length > 0 ? GROCERY_TUNING.deliveryFee : 0;
  const serviceFee = Math.round(subtotal * GROCERY_TUNING.serviceFeeRate);
  const tipPct = tipPctOverride != null ? tipPctOverride : (app?.tipPct ?? GROCERY_TUNING.defaultTipPct);
  const tip = Math.round(subtotal * tipPct);
  return { subtotal, deliveryFee, serviceFee, tip, tipPct, total: subtotal + deliveryFee + serviceFee + tip };
}

// A shopper works a whole list across a store, not one kitchen firing one
// dish — this is deliberately its own seeded roll (not FOOD_TUNING's
// travel), so retuning restaurant delivery speed can never accidentally
// retune grocery speed.
function getGroceryShopMinutes(gameState, seq) {
  const rng = seededRng(gameState.meta.seed, `groceryshop_${gameState.meta.clock.day}_${seq}`);
  return GROCERY_TUNING.shopMinutesBase + Math.floor(rng() * GROCERY_TUNING.shopMinutesVariance);
}
function getGroceryTravelMinutes(gameState, seq) {
  const rng = seededRng(gameState.meta.seed, `grocerytravel_${gameState.meta.clock.day}_${seq}`);
  return GROCERY_TUNING.travelMinutesBase + Math.floor(rng() * GROCERY_TUNING.travelMinutesVariance);
}
// The soonest the order could physically arrive, as an absolute minute —
// same construction as DoorDrop's getFoodEarliestArrival, minus the
// per-restaurant prepMinutes lookup (one store, so shop+travel is the
// whole trip).
function getGroceryEarliestArrival(gameState, seq) {
  return clockToAbsolute(gameState.meta.clock) + getGroceryShopMinutes(gameState, seq) + getGroceryTravelMinutes(gameState, seq);
}

// Shoppers are a small persistent pool, not one throwaway NPC per order —
// same "everyone persists forever" reasoning as DoorDrop's driver pool,
// just a separate id namespace/role so the two delivery flavors don't
// share a roster.
function pickGroceryShopper(gameState, seq) {
  const rng = seededRng(gameState.meta.seed, `groceryshopper_${gameState.meta.clock.day}_${seq}`);
  const n = 1 + Math.floor(rng() * GROCERY_TUNING.shopperPoolSize);
  const npcId = `shopper_${n}`;
  createExternalNpc(gameState, npcId, npcId, 'Grocery Shopper');
  return npcId;
}

// Place the order: charge, pick the shopper, schedule their visit at the
// entry, record the order. Nothing enters inventory here — the handover is
// UI's processGroceryOrdersNow's job when the shopper actually turns up
// (mirrors placeFoodOrder exactly, minus restaurant lookup/hours).
function placeGroceryOrder(gameState, opts = {}) {
  const app = getGroceryApp(gameState);
  if (!app) return { ok: false, reason: 'QuickCart is unavailable.' };
  if (!app.cart || app.cart.length === 0) return { ok: false, reason: 'Your cart is empty.' };

  const { day } = gameState.meta.clock;
  const orders = gameState.world.groceryOrders || (gameState.world.groceryOrders = []);
  const seq = orders.length;
  const totals = getGroceryOrderTotals(gameState, opts.tipPct);
  if (gameState.player.money < totals.total) {
    return { ok: false, reason: `Can't afford $${totals.total} (you have $${Math.round(gameState.player.money)}).` };
  }

  const arrivalAbs = getGroceryEarliestArrival(gameState, seq);
  gameState.player.money -= totals.total;
  const shopperNpcId = pickGroceryShopper(gameState, seq);
  const order = {
    id: `grocery_${day}_${seq}`,
    items: app.cart.map(c => ({ defId: c.defId, qty: (ITEM_DEFS[c.defId]?.buyQty || 1) * c.units })),
    subtotal: totals.subtotal, deliveryFee: totals.deliveryFee, serviceFee: totals.serviceFee,
    tip: totals.tip, tipPct: totals.tipPct, total: totals.total,
    day, arrivalAbs, shopperNpcId, status: 'ordered',
  };
  orders.push(order);
  scheduleVisit(gameState, order.id, Math.floor(arrivalAbs / 1440), {
    npcId: shopperNpcId, purpose: 'delivery', startAbs: arrivalAbs,
    endAbs: arrivalAbs + GROCERY_TUNING.shopperWindowMinutes, roomId: 'entry',
  });
  app.cart = [];
  return { ok: true, order, totals };
}

// No legacy-shape fallback needed (unlike DoorDrop's foodOrderArrivalAbs) —
// world.groceryOrders is a brand-new array; every entry it will ever hold
// already carries arrivalAbs.
function groceryOrderArrivalAbs(order) { return order.arrivalAbs; }
function getGroceryOrderEtaMinutes(order, clock) { return groceryOrderArrivalAbs(order) - clockToAbsolute(clock); }
function getActiveGroceryOrders(gameState) { return (gameState.world.groceryOrders || []).filter(o => o.status === 'ordered'); }

// --- ChefBook: the recipe website (food-overhaul Phase 8, D21/D22) ---
// RECIPE_CARDS-shaped objects are built on demand, never cached — the app
// only ever asks for a handful (the unlocked set), and reading a card is
// cheap: a fixed per-recipe seed through COOKING's real engine (invariant
// 4 — same (state, seed) always gives the same steps/kcal/grade), or a
// flat read off a restaurant dish's own ITEM_DEFS entry.

// Whether `key` names something the website can ever have a card for — a
// cooked RECIPES template or a dish some restaurant sells. Anything else
// (a raw ingredient, a snack with no menu presence) never gets a card.
function isRecipeCardId(key) {
  return !!(key && (RECIPES[key] || RESTAURANT_DISH_IDS.has(key)));
}

// The EAT_ITEM choke point (EFFECTS' applyEatItem) calls this for every
// bite the PLAYER takes — cooked plate or ready-made dish alike — so
// tasting anything card-worthy unlocks it forever, exactly once (D21).
// NPCs eating never reaches this: only the player's own palate discovers
// recipes, same as only the player's cart can shop for them.
function maybeUnlockRecipeCard(gameState, key) {
  if (!isRecipeCardId(key)) return;
  const app = gameState?.world?.computer?.apps?.recipes;
  if (!app || app.unlockedIds.includes(key)) return;
  app.unlockedIds.push(key);
}

// A short, static tip built from the recipe's own data — never the
// engine's seeded RNG outcome, which would read as "this always burns"
// off a single unlucky roll rather than general cooking advice.
function chefNotesFor(recipe) {
  const parts = [];
  if (recipe.cookware) parts.push(`Needs a ${DISH_DEFS[recipe.cookware]?.label?.toLowerCase() || recipe.cookware}.`);
  if (recipe.mix?.length) parts.push('Needs the mixer for a step.');
  if (recipe.method && recipe.method !== 'none') parts.push('Season it — an unseasoned batch comes out bland.');
  if (recipe.betterHot) parts.push('Best served hot; reheat leftovers before eating them.');
  return parts.join(' ') || 'A simple no-cook dish.';
}

// One RECIPES entry, run through the real cooking engine (COOKING) at a
// fixed per-recipe seed (auto/natural-verb choices) so the card is stable
// across renders while still reflecting the player's current skill and
// equipment — the same invariant-4 purity autoCookPlate relies on, just
// never stamped anywhere.
function recipeCardFromEngine(gameState, recipe) {
  const seed = hashStr(recipe.id);
  const plan = planCook(recipe, gameState, { auto: true, seed });
  const outcome = resolveCookPlan(plan, gameState);
  const plate = buildPlate(gameState, recipe, recipe.ingredients, recipe.method, recipe.cookware, { plan, outcome, seed });
  const steps = plan.steps.map((step, i) => cookStepLine(step, outcome.stepResults[i]).what);
  return {
    id: recipe.id, label: recipe.label,
    ingredients: (recipe.ingredients || []).map(i => ({ defId: i.defId, qty: i.qty || 1 })),
    steps, kcalPerServing: plate.kcalPerServing, grade: plate.grade,
    chefNotes: chefNotesFor(recipe),
  };
}

// A restaurant dish's card: no ingredients/steps (it's delivered whole,
// never cooked from a shopping list), just what a menu already tells you.
function recipeCardFromDish(itemId) {
  const def = ITEM_DEFS[itemId];
  if (!def) return null;
  return {
    id: itemId, label: def.label,
    ingredients: [], steps: [],
    kcalPerServing: Math.round(perServingKcal(def)), grade: null,
    chefNotes: 'Delivered — order it again through DoorDrop.',
  };
}

// Single-card lookup, source-routed by which table `id` belongs to.
function recipeCardFor(gameState, id) {
  if (RECIPES[id]) return recipeCardFromEngine(gameState, RECIPES[id]);
  if (RESTAURANT_DISH_IDS.has(id)) return recipeCardFromDish(id);
  return null;
}

// Publishes cards for `ids` (default: every card-eligible id — RECIPES
// plus every restaurant dish). The browse screen calls this with only
// unlockedIds, so it's never asked to build the whole catalog on a normal
// render.
function recipeCardsFromEngine(gameState, ids) {
  const list = ids || [...Object.keys(RECIPES), ...RESTAURANT_DISH_IDS];
  const cards = {};
  for (const id of list) {
    const card = recipeCardFor(gameState, id);
    if (card) cards[id] = card;
  }
  return cards;
}

// Every stack currently sitting in a fridge/pantry/freezer ANYWHERE in the
// apartment, regardless of which room the player is standing in — the
// shopping list is checked from the computer, not the kitchen, so this
// can't reuse DEFS.ACTIONS' kitchenContainers (that one is deliberately
// scoped to ctx.roomId). Mirrors the whole-house object scan
// containerDefForSource/findObjectByDefIdLive already use elsewhere.
function allFoodStorageStacks(gameState) {
  const out = [];
  for (const bucket of Object.values(gameState?.objects || {})) {
    for (const obj of Object.values(bucket || {})) {
      if (obj?.defId === 'fridge' || obj?.defId === 'pantry' || obj?.defId === 'freezer') {
        out.push(...(obj.contents || []));
      }
    }
  }
  return out;
}

// D20's whole-kitchen pool (bag + every storage container) as flat stacks,
// for a shopping-list diff — not the cook path's kitchenIngredientPool
// (that one needs ctx.roomId and is scoped to the current room).
function kitchenShoppingPool(gameState) {
  return [...(gameState?.player?.inventory || []), ...allFoodStorageStacks(gameState)];
}

// Adds however many Nile cart clicks it takes to cover the recipe's
// ingredients the kitchen doesn't already have — diffed against the whole
// kitchen (D20) AND whatever's already queued in the cart, so clicking
// this twice in a row without checking out never doubles the order.
// Ingredients with no Nile price (nothing so far) are silently skipped —
// there's no cart line to add them to.
function addRecipeIngredientsToCart(gameState, recipeId) {
  const recipe = RECIPES[recipeId];
  if (!recipe) return { ok: false, reason: 'Not a recipe.' };
  const have = kitchenShoppingPool(gameState);
  const cart = resolveCart(gameState, 'apps.shop.cart').cart;
  let added = 0;
  for (const ing of recipe.ingredients || []) {
    const def = ITEM_DEFS[ing.defId];
    if (!def || def.price == null) continue;
    const buyQty = def.buyQty || 1;
    const haveQty = stackQty(have, ing.defId);
    const queuedQty = (cart.find(c => c.defId === ing.defId)?.units || 0) * buyQty;
    const missing = (ing.qty || 1) - haveQty - queuedQty;
    if (missing <= 0) continue;
    const clicks = Math.ceil(missing / buyQty);
    for (let i = 0; i < clicks; i++) addToCart(gameState, ing.defId);
    added++;
  }
  return { ok: true, added };
}

// --- Meal planner (D22) ---
function getRecipesApp(gameState) {
  return gameState?.world?.computer?.apps?.recipes || null;
}

function addToPlanner(gameState, recipeId, day) {
  if (!RECIPES[recipeId]) return { ok: false, reason: 'Not a recipe.' };
  if (!Number.isFinite(day)) return { ok: false, reason: 'Pick a day.' };
  const app = getRecipesApp(gameState);
  if (!app) return { ok: false, reason: 'The planner is unavailable.' };
  app.planner.push({ recipeId, day: Math.floor(day) });
  return { ok: true };
}

function removeFromPlanner(gameState, index) {
  const app = getRecipesApp(gameState);
  if (!app || index == null || index < 0 || index >= app.planner.length) return;
  app.planner.splice(index, 1);
}

// The whole plan's ingredient needs, summed across every planned recipe —
// the same defId from two different days' dinners collapses into one
// line, which is what "dedupes shared ingredients" means (D22).
function shoppingListForPlanner(gameState) {
  const app = getRecipesApp(gameState);
  const need = {};
  for (const entry of app?.planner || []) {
    const recipe = RECIPES[entry.recipeId];
    if (!recipe) continue;
    for (const ing of recipe.ingredients || []) {
      need[ing.defId] = (need[ing.defId] || 0) + (ing.qty || 1);
    }
  }
  return need;
}

// One click, the whole week: fills the Nile cart with exactly what the
// full plan needs beyond what the kitchen (and the cart already) has.
// Same diff shape as addRecipeIngredientsToCart, over the summed list.
function addPlannerIngredientsToCart(gameState) {
  const need = shoppingListForPlanner(gameState);
  const have = kitchenShoppingPool(gameState);
  const cart = resolveCart(gameState, 'apps.shop.cart').cart;
  let added = 0;
  for (const [defId, qty] of Object.entries(need)) {
    const def = ITEM_DEFS[defId];
    if (!def || def.price == null) continue;
    const buyQty = def.buyQty || 1;
    const haveQty = stackQty(have, defId);
    const queuedQty = (cart.find(c => c.defId === defId)?.units || 0) * buyQty;
    const missing = qty - haveQty - queuedQty;
    if (missing <= 0) continue;
    const clicks = Math.ceil(missing / buyQty);
    for (let i = 0; i < clicks; i++) addToCart(gameState, defId);
    added++;
  }
  return { ok: true, added };
}

// --- Escorts (external-world plan Phase 7) ---
// Roster read (idempotently backfills on old saves via ensureEscortRoster),
// à la carte pricing, and booking. The booking record shape matches the
// plan's data model — { escortNpcId, services, day, startTick, endTick,
// price } — plus status and bookedDay for the app's My Bookings screen and
// the day-rollover lifecycle. bookEscort is the ONE place a visit is created
// from a booking: the purchased set becomes the visit's dual enforcement
// (prompt boundaries in PROMPT/LLM, mechanical gating in DEFS.ACTIONS/RENDER).

function getEscortRoster(gameState) {
  return ensureEscortRoster(gameState);
}

function getEscortEntry(gameState, npcId) {
  return getEscortRoster(gameState).find(e => e.npcId === npcId) || null;
}

// Total for a booking: the escort's base rate plus each purchased service.
// Per-service, à la carte — exactly what the checklist computes and what the
// book button charges, so the quote on the profile IS the charge.
function getEscortVisitCost(gameState, entry, services) {
  return (entry?.rate || 0) + (services || []).reduce((sum, sid) => sum + (ESCORT_SERVICE_DEFS[sid]?.rate || 0), 0);
}

function bookEscort(gameState, opts = {}) {
  const entry = getEscortEntry(gameState, opts.npcId);
  if (!entry) return { ok: false, reason: 'No such escort.' };
  const npc = gameState.npcs[entry.npcId];
  const name = npc?.bible?.name || 'They';

  const requested = [...new Set(opts.services || [])];
  if (requested.length === 0) return { ok: false, reason: 'Pick at least one service.' };
  const offered = new Set(entry.offeredServices);
  for (const sid of requested) {
    if (!offered.has(sid)) return { ok: false, reason: `${ESCORT_SERVICE_DEFS[sid]?.label || sid} isn't on ${name}'s menu.` };
    const def = ESCORT_SERVICE_DEFS[sid];
    if (def?.requiresContentFlag && !activeContentFlags(gameState)[def.requiresContentFlag]) {
      return { ok: false, reason: `${def.label} isn't available with your current content settings.` };
    }
  }

  const { day: nowDay, minutes } = gameState.meta.clock;
  const nowTick = getTickIndex(minutes);
  const day = Number(opts.day);
  const startTick = Number(opts.startTick);
  if (day !== nowDay && day !== nowDay + 1) return { ok: false, reason: 'Bookings are for today or tomorrow.' };
  if (!Number.isFinite(startTick)) return { ok: false, reason: 'Pick a start time.' };
  if (day === nowDay) {
    if (startTick < nowTick + ESCORT_TUNING.earliestLeadTicks) return { ok: false, reason: 'Too soon — they need time to get over.' };
  } else if (startTick < ESCORT_TUNING.tomorrowStartTickMin || startTick > ESCORT_TUNING.tomorrowStartTickMax) {
    return { ok: false, reason: 'Pick a start time.' };
  }

  // No double-booking: an escort can only have one live booking (today or
  // tomorrow) at a time — the same person can't be in two places.
  const bookings = gameState.world.escortBookings || (gameState.world.escortBookings = []);
  const conflict = bookings.find(b => b.escortNpcId === entry.npcId && b.day === day && b.status === 'active');
  if (conflict) return { ok: false, reason: `${name} is already booked then.` };

  const cost = getEscortVisitCost(gameState, entry, requested);
  if (gameState.player.money < cost) {
    return { ok: false, reason: `Can't afford ${cost} (you have ${Math.round(gameState.player.money)}).` };
  }

  // The visit spans the longest purchased service's window (one session,
  // not one service glued to another); clamped so it never crosses into a
  // day-record the visit spine wouldn't see — reproduced exactly as the
  // absolute-minute window (an endTick of 48 means the end of the day).
  const duration = Math.max(ESCORT_TUNING.minVisitTicks, ...requested.map(sid => ESCORT_SERVICE_DEFS[sid]?.durationTicks || 0));
  const endTick = Math.min(48, startTick + duration);

  gameState.player.money -= cost;
  const booking = {
    id: `escort_${day}_${bookings.length}`,
    escortNpcId: entry.npcId,
    services: requested,
    day,
    startTick,
    endTick,
    price: cost,
    bookedDay: nowDay,
    status: 'active',
  };
  bookings.push(booking);
  scheduleVisit(gameState, booking.id, day, {
    npcId: entry.npcId,
    purpose: 'escort',
    startAbs: day * 1440 + startTick * 30,
    endAbs: day * 1440 + endTick * 30,
    roomId: gameState.player.location,
  });
  return { ok: true, booking, npc, cost };
}

// Active booking for an escort NPC right now. The visit spine's active visit
// for them whose SOURCE is a live booking — bookEscort schedules the visit
// with sourceId === booking.id, so this is a join, not a scan. Returns the
// booking (or null), which is what both halves of the dual enforcement read.
function getActiveEscortVisit(gameState, npcId) {
  const visit = getActiveVisits(gameState).find(v => v.purpose === 'escort' && v.npcId === npcId);
  if (!visit) return null;
  return (gameState.world.escortBookings || []).find(b => b.id === visit.sourceId && b.status === 'active') || null;
}

function isEscortServiceBooked(booking, serviceId) {
  return !!booking && (booking.services || []).includes(serviceId);
}

// Book a contracted renovation job (src/ref/complete/renovation-occupancy-overhaul-plan.md).
// Replaces the instant click of the old purchaseUpgrade: the player pays
// the FULL contracted price UP FRONT (materials + the Contractor's labor
// markup — no refund on cancel, locked decision), the job runs for
// `durationDays`, and the tier only advances when
// processRenovationJobsForDay completes it at day rollover. The job is
// always performed by the Contractor, so it records contractorId.
function bookRenovationJob(gameState, facilityId, jobType, opts = {}) {
  const def = FACILITY_DEFS[facilityId];
  if (!def) return { ok: false, reason: 'No such facility.' };
  const upgrades = gameState.world.upgrades;
  if (!upgrades) return { ok: false, reason: 'Upgrade system not initialized.' };
  const upgrade = upgrades[facilityId];
  if (!upgrade) return { ok: false, reason: 'No such facility.' };
  if (upgrade.activeJobId) return { ok: false, reason: 'A job is already running on this — wait for it to finish.' };

  const jobs = gameState.world.renovationJobs || (gameState.world.renovationJobs = []);
  const activeCount = jobs.filter(j => j.status === 'active').length;
  if (activeCount >= MAX_CONCURRENT_JOBS) return { ok: false, reason: 'Only one renovation at a time — let the crew finish first.' };

  // jobType must match the facility's actual next transition.
  const expectedType = upgrade.tier === 'broken' ? 'repair' : upgrade.tier === 'functional' ? 'upgrade' : null;
  if (!expectedType) return { ok: false, reason: 'Already fully upgraded.' };
  if (jobType !== expectedType) {
    const want = expectedType === 'repair' ? 'a repair' : 'an upgrade';
    return { ok: false, reason: `This facility needs ${want}, not a ${jobType}.` };
  }
  const nextTier = getNextFacilityTier(def, upgrade.tier);
  if (!nextTier) return { ok: false, reason: 'Already fully upgraded.' };

  // Full contracted price = materials + labor markup — except the tutorial
  // free job (contractor doc Phase 3): the first auxiliary-bedroom job
  // books at $0 so the guided flow works even for a broke player.
  const tutorialFree = isTutorialFreeJob(gameState, facilityId);
  // Weekend rush (external-world plan Phase 4): the crew works through the
  // weekend for a premium. Never charged on the free tutorial job.
  const rush = !!opts.rush && !tutorialFree;
  const cost = tutorialFree ? 0 : getRenovationJobCost(gameState, facilityId, jobType, { rush });
  if (gameState.player.money < cost) return { ok: false, reason: `Can't afford ${cost} (you have ${Math.round(gameState.player.money)}).` };

  const startDay = gameState.meta.clock.day;
  const durationDays = nextTier.durationDays || 1;
  const jobId = `job_${startDay}_${jobs.length}`;
  const job = {
    id: jobId,
    facilityId,
    roomId: getRoomIdForFacility(facilityId),
    jobType,
    fromTier: upgrade.tier,
    toTier: nextTier.tier,
    startDay,
    durationDays,
    // durationDays are WORKING days unless the rush premium was paid, in
    // which case the crew works weekends too and they're calendar days.
    etaDay: rush ? startDay + durationDays : addWorkingDays(startDay, durationDays),
    rush,
    cost,
    status: 'active',
    contractorId: CONTRACTOR_ID, // the Contractor performs every job (contractor doc)
  };

  gameState.player.money -= cost;
  jobs.push(job);
  upgrade.activeJobId = jobId;
  // Visit spine (external-world plan Phase 1): schedule the crew's onsite
  // windows for the whole job — every working day from today through the
  // day before etaDay, 09:00-16:30 in the job's room (see
  // scheduleContractorVisitsForJob). Del proves the visit mechanism.
  scheduleContractorVisitsForJob(gameState, job);
  // Tutorial flow (contractor doc Phase 3): consume the free-job flag and
  // fire the milestone hints — the free job teaches what "day N of M"
  // means; the first paid job (and first Upgrade, when that's the case)
  // each get their own one-shot nudge.
  if (tutorialFree) {
    gameState.world.flags = gameState.world.flags || {};
    gameState.world.flags.tutorialRenoUsed = true;
    fireContractorMilestone(gameState, 'tutorialJobBooked');
  } else {
    fireContractorMilestone(gameState, 'firstPaidJobBooked');
    if (jobType === 'upgrade') fireContractorMilestone(gameState, 'firstUpgradeJobBooked');
  }
  // Contractor memory (contractor doc Phase 4): record the live job so IM
  // replies about work in progress have grounded material to reference.
  setContractorJobFact(gameState, 'renovation_job',
    `I just started on ${def.label} — ${jobType === 'upgrade' ? 'an' : 'a'} ${jobType} job, due day ${job.etaDay}.`,
    startDay);
  // Tier/condition do NOT change here — only at job completion.
  return { ok: true, facilityId, jobId, jobType, fromTier: job.fromTier, toTier: job.toTier, cost, durationDays, etaDay: job.etaDay, label: nextTier.label };
}

// --- Structural jobs (floorplan plan Phase 6) ---
// A structural upgrade goes through the SAME contractor pipeline as a
// facility job — Del's crew, a real cost, real days on site, the one-job-at-
// a-time cap — because from the player's side it is the same transaction.
// What differs is only what completing it does: a facility job moves a tier,
// a structural job sets a flag that rebuilds the room graph.
//
// The job record carries `structuralId` where a facility job carries
// `facilityId`, and every downstream reader branches on which is present
// rather than on a `kind` field nobody would remember to set.
function structuralUpgradeState(gameState, upgradeId) {
  const def = STRUCTURAL_UPGRADES[upgradeId];
  if (!def) return null;
  const built = !!gameState.world?.flags?.[`structural_${upgradeId}`];
  const job = (gameState.world?.renovationJobs || [])
    .find(j => j.structuralId === upgradeId && j.status === 'active') || null;
  return { def, built, job };
}

function bookStructuralJob(gameState, upgradeId, opts = {}) {
  const state = structuralUpgradeState(gameState, upgradeId);
  if (!state) return { ok: false, reason: 'No such conversion.' };
  const { def, built, job } = state;
  if (built) return { ok: false, reason: 'Already done.' };
  if (job) return { ok: false, reason: 'The crew is already on this one.' };

  const jobs = gameState.world.renovationJobs || (gameState.world.renovationJobs = []);
  const activeCount = jobs.filter(j => j.status === 'active').length;
  if (activeCount >= MAX_CONCURRENT_JOBS) return { ok: false, reason: 'Only one renovation at a time — let the crew finish first.' };

  const rush = !!opts.rush;
  const cost = Math.round(def.cost * (rush ? RENOVATION_RUSH_MULTIPLIER : 1));
  if (gameState.player.money < cost) {
    return { ok: false, reason: `Can't afford $${cost} (you have $${Math.round(gameState.player.money)}).` };
  }

  const startDay = gameState.meta.clock.day;
  const durationDays = def.durationDays || 1;
  const newJob = {
    id: `job_${startDay}_${jobs.length}`,
    structuralId: upgradeId,
    roomId: def.room,
    jobType: 'structural',
    startDay,
    durationDays,
    etaDay: rush ? startDay + durationDays : addWorkingDays(startDay, durationDays),
    rush,
    cost,
    status: 'active',
    contractorId: CONTRACTOR_ID,
  };

  gameState.player.money -= cost;
  jobs.push(newJob);
  scheduleContractorVisitsForJob(gameState, newJob);
  setContractorJobFact(gameState, 'renovation_job',
    `I just started on ${def.label} — structural work, due day ${newJob.etaDay}.`, startDay);
  return { ok: true, structuralId: upgradeId, jobId: newJob.id, cost, durationDays, etaDay: newJob.etaDay, label: def.label };
}

// Pure stage derivation for an active job — stage label/index progress
// through RENOVATION_STAGE_TEMPLATES as a function of elapsed days. Used by
// the RenoFix dashboard (Phase 3) and narration; derived, never persisted.
function getRenovationJobStage(job, day) {
  const stages = RENOVATION_STAGE_TEMPLATES[job.jobType] || RENOVATION_STAGE_TEMPLATES.repair;
  // Progress counts WORK done, not days sat through (external-world plan
  // Phase 4): a non-rush job parked over a weekend holds its stage, because
  // nobody was on site to advance it. A rush job works every day, so its
  // elapsed time is plain calendar days.
  const elapsed = job.rush
    ? Math.max(0, day - job.startDay)
    : workingDaysBetween(job.startDay, day);
  const idx = Math.min(stages.length - 1, Math.floor(elapsed / job.durationDays * stages.length));
  return { label: stages[idx], index: idx, total: stages.length };
}

// Phase 9: repair a facility's condition without advancing the tier.
// Cheaper than a full upgrade — restores condition to 100 for a fraction
// of the tier's cost. This is the "maintenance" path that keeps the sink
// open after restoration is done.
function repairFacilityCondition(gameState, facilityId) {
  const def = FACILITY_DEFS[facilityId];
  if (!def) return { ok: false, reason: 'No such facility.' };
  const upgrades = gameState.world.upgrades;
  const upgrade = upgrades?.[facilityId];
  if (!upgrade) return { ok: false, reason: 'No such facility.' };
  if (upgrade.tier === 'broken') return { ok: false, reason: 'Facility is broken — upgrade it instead.' };
  // Guard against old saves without the condition field — default to
  // full condition so the repair is a no-op (nothing to fix).
  if (upgrade.condition === undefined) upgrade.condition = MAINTENANCE.startingCondition;
  if (upgrade.condition >= MAINTENANCE.startingCondition) return { ok: false, reason: 'Already in good condition.' };
  const pointsNeeded = MAINTENANCE.startingCondition - upgrade.condition;
  const cost = Math.round(pointsNeeded * MAINTENANCE.repairCostPerPoint);
  if (gameState.player.money < cost) return { ok: false, reason: `Can't afford ${cost} (you have ${Math.round(gameState.player.money)}).` };
  gameState.player.money -= cost;
  upgrade.condition = MAINTENANCE.startingCondition;
  return { ok: true, facilityId, cost, conditionRestored: Math.round(pointsNeeded * 10) / 10 };
}

// Phase 9: decay a facility's condition by one use. Called when a gated
// action is performed (player or NPC). If condition hits 0, the facility
// drops a tier (upgraded→functional→broken). Returns whether a tier drop
// occurred so the caller can log it.
function decayFacilityCondition(gameState, facilityId) {
  const upgrades = gameState.world.upgrades;
  const upgrade = upgrades?.[facilityId];
  if (!upgrade) return false;
  if (upgrade.tier === 'broken') return false; // nothing to decay
  // Guard against old saves without the condition field.
  if (upgrade.condition === undefined) upgrade.condition = MAINTENANCE.startingCondition;
  upgrade.condition = Math.max(0, upgrade.condition - MAINTENANCE.decayPerUse);
  if (upgrade.condition <= MAINTENANCE.tierDropThreshold) {
    // Drop a tier.
    const def = FACILITY_DEFS[facilityId];
    const tierIdx = def.tiers.findIndex(t => t.tier === upgrade.tier);
    // Locked decision #5: decay floors at 'functional'. 'upgraded' (idx 2)
    // can still decay to 'functional' (idx 1), but 'functional' never drops
    // to 'broken' — recovery from low condition is always the instant-money
    // repairFacilityCondition path, never a re-reno.
    if (tierIdx > 1) {
      upgrade.tier = def.tiers[tierIdx - 1].tier;
      upgrade.condition = MAINTENANCE.startingCondition;
      // Recompute rent — the quality may have changed.
      gameState.world.rent = computeRent(gameState.npcs, gameState);
      return true; // tier dropped
    }
  }
  return false;
}

// Phase 9: compute appeal score for an NPC given the current facility
// state. Returns a weighted sum of appeal values for facilities that are
// at least 'functional'. Higher appeal = the NPC values the apartment
// more, which should influence their willingness to pay near the rent
// ceiling. Used by the Classifieds applicant evaluation.
function computeApartmentAppeal(gameState, npc) {
  const upgrades = gameState.world.upgrades;
  if (!upgrades) return 0;
  const interests = npc.bible?.interests?.map(i => i.name) || [];
  let score = 0;
  for (const def of FACILITY_LIST) {
    const upgrade = upgrades[def.id];
    if (!upgrade || upgrade.tier === 'broken') continue;
    const tierIdx = def.tiers.findIndex(t => t.tier === upgrade.tier);
    const qualityMult = tierIdx >= 0 ? def.tiers[tierIdx].qualityValue : 0.5;
    const appeal = def.appeal || {};
    let facilityScore = 0;
    for (const interest of interests) {
      facilityScore += (appeal[interest] || 0);
    }
    facilityScore += (appeal['*'] || 0);
    score += facilityScore * qualityMult;
  }
  return score;
}

// ===== Phase 11: Investing =====
// Buy/sell fund shares, compute current value, and process daily growth
// at day-rollover. The model is simple index funds — no stock picking,
// no day trading. The skill is patience and risk tolerance.

// Buy shares of a fund. Deducts money + fee, records the holding.
function investBuy(gameState, fundId, amount) {
  const fund = INVESTING.funds.find(f => f.id === fundId);
  if (!fund) return { ok: false, reason: 'No such fund.' };
  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0)
    return { ok: false, reason: 'Invalid amount.' };
  amount = Math.round(amount);
  if (amount < fund.minInvest) return { ok: false, reason: `Minimum investment is ${fund.minInvest}.` };
  if (gameState.player.money < amount) return { ok: false, reason: `Can't afford ${amount} (you have ${Math.round(gameState.player.money)}).` };
  const fee = Math.round(amount * INVESTING.fee);
  const totalCost = amount + fee;
  if (gameState.player.money < totalCost) return { ok: false, reason: `Can't afford ${amount} + ${fee} fee.` };
  const invest = gameState.world.computer.apps.invest;
  if (!invest.holdings[fundId]) invest.holdings[fundId] = { shares: 0, costBasis: 0 };
  invest.holdings[fundId].shares += amount;
  invest.holdings[fundId].costBasis += amount;
  invest.totalInvested = (invest.totalInvested || 0) + amount;
  gameState.player.money -= totalCost;
  return { ok: true, fundId, amount, fee, totalCost };
}

// Sell shares of a fund. Returns money minus fee, tracks realized gains.
function investSell(gameState, fundId, amount) {
  const fund = INVESTING.funds.find(f => f.id === fundId);
  if (!fund) return { ok: false, reason: 'No such fund.' };
  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0)
    return { ok: false, reason: 'Invalid amount.' };
  const invest = gameState.world.computer.apps.invest;
  const holding = invest.holdings[fundId];
  if (!holding || holding.shares < amount) return { ok: false, reason: `You only have ${Math.round(holding?.shares || 0)} in ${fund.label}.` };
  // Current value = shares × (1 + cumulative growth). We track growth
  // by adjusting shares directly at day-rollover, so shares IS the
  // current value. costBasis tracks what was originally invested.
  const fee = Math.round(amount * INVESTING.fee);
  const proceeds = amount - fee;
  const portionSold = amount / holding.shares;
  const costPortion = holding.costBasis * portionSold;
  const gain = amount - costPortion;
  holding.shares -= amount;
  holding.costBasis -= costPortion;
  if (holding.shares < 0.01) { holding.shares = 0; holding.costBasis = 0; }
  invest.realizedGains = (invest.realizedGains || 0) + gain;
  gameState.player.money += proceeds;
  return { ok: true, fundId, amount, fee, proceeds, gain };
}

// Get current portfolio value (sum of all holdings' current share values).
function getPortfolioValue(gameState) {
  const invest = gameState.world.computer.apps.invest;
  if (!invest?.holdings) return 0;
  let total = 0;
  for (const holding of Object.values(invest.holdings)) {
    total += holding.shares || 0;
  }
  return total;
}

// Get portfolio cost basis (total originally invested, minus what was sold).
function getPortfolioCostBasis(gameState) {
  const invest = gameState.world.computer.apps.invest;
  if (!invest?.holdings) return 0;
  let total = 0;
  for (const holding of Object.values(invest.holdings)) {
    total += holding.costBasis || 0;
  }
  return total;
}

// Process daily growth at day-rollover. Adjusts each holding's shares
// by the day's return rate. Called from processDayRollover.
function processInvestmentGrowth(gameState, day) {
  const invest = gameState.world.computer.apps.invest;
  if (!invest?.holdings) return;
  for (const [fundId, holding] of Object.entries(invest.holdings)) {
    if (holding.shares <= 0) continue;
    const fund = INVESTING.funds.find(f => f.id === fundId);
    if (!fund) continue;
    const dailyRate = INVESTING.dailyReturn(fund.expectedReturn, fund.volatility, day, fundId);
    holding.shares *= (1 + dailyRate);
  }
}

// Check whether a bedroom is habitable enough for a roommate to move in.
// Post-overhaul each bedroom has its own habitability facility, so the
// check resolves against the per-bedroom facility id (ROOM_FACILITIES).
function isBedroomHabitable(gameState, roomId) {
  // bedroom_player doesn't need habitability for recruitment (it's the
  // player's own room — the player sleeps there regardless).
  if (roomId === 'bedroom_player') return true;
  const facilityIds = ROOM_FACILITIES[roomId] || [];
  if (facilityIds.length === 0) return true;
  return facilityIds.some(fid => isFacilityFunctional(gameState, fid));
}

// ===== /SECTION: COMPUTER =====
