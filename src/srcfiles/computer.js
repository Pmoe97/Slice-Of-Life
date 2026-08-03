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
        afterHoursWatching: null, afterHoursMasturbating: false,
        afterHoursSessionStart: null, afterHoursWarmupUntilMs: 0,
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
        studio: {
          draft: {},
          aiBusy: false,
          aiPrompt: '',
          preview: null,       // cached preview NPC bible (Phase 4 live preview)
        },
        // Phase 7: favorited applicant IDs — players can shortlist
        // applicants they're interested in and come back to them later.
        favorites: [],
      },
      im: { threads: {}, viewingNpcId: null },
      stream: { subscriptions: [], watchHistory: [], resumePoints: {} },
      // Phase 11: investing portfolio. `holdings` is { fundId: { shares,
      // costBasis } } — shares are the amount invested, costBasis tracks
      // the original purchase for P&L display. `realizedGains` tracks
      // profit/loss from sells (for tax purposes).
      invest: { holdings: {}, realizedGains: 0, totalInvested: 0 },
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
  // renderer needs.
  const windows = {};
  for (const [appId, win] of Object.entries(windowsRaw)) {
    if (win && win.rect) windows[appId] = win;
  }
  if (!raw.windows && raw.view && raw.view.appId) {
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
    focusedAppId: raw.focusedAppId ?? (Object.keys(windows)[0] || null),
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
}

function switchScreen(gameState, appId, screenId, params) {
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

  // The masturbating session is the one thing that does NOT survive
  // walking away: it's a player state, not an app state. Left set, it
  // desynced from the time context (doComputerClose puts that back to
  // 'idle') and, worse, kept getPlayerVulnerableState reporting
  // 'masturbating' forever — so NPCs went on peeping at a player who was
  // fully dressed in the kitchen, permanently.
  const browser = gameState.world.computer.apps?.browser;
  if (browser) {
    browser.afterHoursMasturbating = false;
    browser.afterHoursSessionStart = null;
  }
}

// --- Gig board (Phase 2 — vocation rewrite) ---
// Replaces the single-job model. The player is a freelancer: accept
// discrete gigs from a board, work them block-by-block, deliver by a
// deadline for a lump sum. Income is lumpy — dry spells happen. See
// ref/vocation-and-gigs-plan.md.

// How much a work block's *progress* is worth scales with rest and mood.
// Kept from the old model — energy/mood scaling is the hook burnout
// (Phase 9) needs, and it applies just as well to gig progress as to the
// old flat pay. A bad night or a foul mood costs real throughput.
function computeFocusMultiplier(gameState) {
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
  return energyFactor * moodFactor;
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
// quarterGross accumulator sees it.
function workGigBlock(gameState, gigId) {
  const gigs = gameState.world.computer.apps.gigs;
  const gig = gigs.accepted.find(g => g.gigId === gigId);
  if (!gig) return { ok: false, reason: 'You have no such gig.' };
  if (gig.blocksDone >= gig.blocks) return { ok: false, reason: 'That gig is already complete — deliver it.' };
  if (gameState.meta.clock.day > gig.deadlineDay) return { ok: false, reason: 'That gig has passed its deadline.' };
  const focus = computeFocusMultiplier(gameState);
  // Phase 8: burnout makes grinding progressively less profitable. The
  // work-pay penalty scales progress down at high burnout levels — the
  // death-spiral is the feature.
  const burnoutMult = getBurnoutWorkPayMult(gameState.player);
  // Each block advances progress by focus (0.4-1.0 of a block), so low
  // energy/mood makes a gig take more blocks than its `blocks` count
  // implies — the grind becomes less profitable exactly as burnout
  // needs. Rounded to 2 decimals to avoid float drift.
  const progress = Math.round(focus * burnoutMult * 100) / 100;
  gig.blocksDone = Math.min(gig.blocks, gig.blocksDone + progress);
  gameState.player.energy = clamp(gameState.player.energy - GIG_ENERGY_PER_BLOCK, 0, 100);
  // Phase 8: track work blocks per day for burnout. Resets at day rollover.
  gigs.workBlocksToday = (gigs.workBlocksToday || 0) + 1;
  // Phase 5: computer work meters as device usage. One work block = 0.5h
  // of computer time at $0.04/kWh — small but itemised, so the player
  // sees "Computer — $X" next to "Heat — $206" on the electric bill.
  recordUtilityUsage(gameState, 'devices', 0.5);
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
  // late delivery loses. Scaled by gig size so big gigs matter more.
  const sizeFactor = clamp(gig.blocks / 10, 0.5, 2);
  const repDelta = late
    ? Math.round(GIG_REP_MISS * sizeFactor)
    : Math.round(GIG_REP_DELIVERY * sizeFactor);
  gigs.reputation = clamp((gigs.reputation || 0) + repDelta, 0, GIG_REP_MAX);
  gigs.accepted = gigs.accepted.filter(g => g.gigId !== gigId);
  return { ok: true, gig, late, payout: gig.payout, repDelta };
}

// Abandon a gig — a deliberate choice that costs more reputation than a
// missed deadline, since the player took the work and walked away.
function abandonGig(gameState, gigId) {
  const gigs = gameState.world.computer.apps.gigs;
  const gig = gigs.accepted.find(g => g.gigId === gigId);
  if (!gig) return { ok: false, reason: 'You have no such gig.' };
  const sizeFactor = clamp(gig.blocks / 10, 0.5, 2);
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
    const sizeFactor = clamp(gig.blocks / 10, 0.5, 2);
    const repDelta = Math.round(GIG_REP_MISS * sizeFactor);
    gigs.reputation = clamp((gigs.reputation || 0) + repDelta, 0, GIG_REP_MAX);
    results.push({ gigId: gig.gigId, label: gig.label, missed: true, partialPay, repDelta });
  }
  gigs.accepted = stillAccepted;
  return results;
}

// --- Nile (shop) app ---
// Cart entries are { defId, units } — one "unit" is one click of Add to
// Cart, costing ITEM_DEFS[defId].price and, on checkout, delivering
// ITEM_DEFS[defId].buyQty items. Keeping "how many times you clicked" and
// "how many items that yields" separate is what lets a $4 dozen eggs be
// one cart line instead of a quantity-12 stack the player has to type.

function addToCart(gameState, defId) {
  const def = ITEM_DEFS[defId];
  if (!def || def.price == null) return { ok: false, reason: 'Not sold here.' };
  const cart = gameState.world.computer.apps.shop.cart;
  const existing = cart.find(c => c.defId === defId);
  if (existing) existing.units += 1;
  else cart.push({ defId, units: 1 });
  return { ok: true };
}

function removeFromCart(gameState, defId) {
  const shop = gameState.world.computer.apps.shop;
  shop.cart = shop.cart.filter(c => c.defId !== defId);
}

function cartSubtotal(cart) {
  return cart.reduce((sum, c) => sum + (ITEM_DEFS[c.defId]?.price || 0) * c.units, 0);
}

// SPEND_MONEY covers the cart total + one flat delivery fee, and each
// cart line becomes a world.deliveries entry. Nothing lands in inventory
// yet — UI's processDeliveriesForDay SPAWN_ITEMs it onto the hallway
// doormat when the ETA hits, so the player (or a quick roommate) has to
// actually go get it.
function checkoutCart(gameState) {
  const shop = gameState.world.computer.apps.shop;
  if (shop.cart.length === 0) return { ok: false, reason: 'Your cart is empty.' };
  const total = cartSubtotal(shop.cart) + ECONOMY.deliveryFee;
  if (gameState.player.money < total) return { ok: false, reason: `Can't afford $${total} (you have $${Math.round(gameState.player.money)}).` };

  gameState.player.money -= total;
  // Phase 6: tech/electronics/tool purchases are tax-deductible for a
  // freelancer. Record the deductible portion (item price, not delivery
  // fee — delivery is a personal expense).
  let deductible = 0;
  shop.cart.forEach(c => {
    const def = ITEM_DEFS[c.defId];
    if (def && TAX_CONFIG.deductibleCategories.includes(def.category)) {
      deductible += def.price * c.units;
    }
  });
  if (deductible > 0) recordTaxDeduction(gameState, deductible);
  const etaDay = gameState.meta.clock.day + 1;
  const deliveries = gameState.world.deliveries || (gameState.world.deliveries = []);
  shop.cart.forEach((c, i) => {
    const def = ITEM_DEFS[c.defId];
    deliveries.push({
      id: `del_${gameState.meta.clock.day}_${gameState.meta.clock.minutes}_${i}`,
      defId: c.defId, qty: (def.buyQty || 1) * c.units,
      status: 'ordered', etaDay, orderedDay: gameState.meta.clock.day,
    });
  });
  shop.cart = [];
  return { ok: true, total, etaDay, deductible };
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
  gameState.player.skills = gameState.player.skills || {};
  gameState.player.skills[course.skillId] = (gameState.player.skills[course.skillId] || 0) + course.xpPerLesson;

  const completed = enrollment.progress >= course.lessons;
  if (completed) {
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
function cleanRoomObjects(gameState, roomId) {
  const bucket = gameState.objects[`room_${roomId}`];
  if (!bucket) return 0;
  let cleanedCount = 0;
  for (const obj of Object.values(bucket)) {
    const def = OBJECT_DEFS[obj.defId];
    if (!def?.dirtyWhen) continue;
    for (const key of Object.keys(def.dirtyWhen)) {
      const cleanValue = def.states[key][0];
      if (obj.state[key] !== cleanValue) { obj.state[key] = cleanValue; cleanedCount++; }
    }
  }
  refreshRoomCleanliness(gameState, roomId);
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
  if (requireHabitable && !isFacilityFunctional(gameState, 'bedroom_habitability')) return null;

  const occupantsOf = (roomId) => Object.values(gameState.npcs)
    .filter(n => n.residency.room === roomId && n.residency.status === 'resident');

  const spare = ALL_ROOMS.filter(r => ROOMS[r].type === 'bedroom' && r !== 'bedroom_player');
  // Private beds first, then shared ones, then the player's spare bed.
  for (const roomId of spare) if (occupantsOf(roomId).length === 0) return { roomId, bed: 'A', shared: false };
  for (const roomId of spare) {
    const taken = new Set(occupantsOf(roomId).map(n => n.residency.bed));
    if (taken.size < (ROOMS[roomId].capacity || 2)) {
      return { roomId, bed: taken.has('A') ? 'B' : 'A', shared: true };
    }
  }
  if (opts.includePlayerRoom !== false && occupantsOf('bedroom_player').length === 0) {
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

// Promote a stub to a full NPC (Phase 3 will make this async via the fetch
// queue, but the core generation is here). Uses rollCastSlot with a
// partial pre-filled from the stub's deterministic fields so the full
// NPC matches the stub's identity. Returns the npcId on success.
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

  const npcId = genSeededNpcId(stub.seed, stub.slot);
  if (gameState.npcs[npcId]) return { ok: false, reason: 'Already generated.' };

  // Build a partial from the stub's pre-determined fields
  const partial = {
    name: stub.name,
    age: stub.age,
    gender: stub.gender,
    occupationCategory: stub.occupation.category,
  };
  if (typeof stub.warmth === 'number') {
    partial.temperament = { warmth: stub.warmth };
  }

  const rolled = rollCastSlot(stub.seed, stub.slot, npcId, `stub_promote_${stubId}`, new Set([stub.occupation.category]), [], partial);
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

  gameState.npcs[npcId] = createNpcFromBible(check.normalized.bible, 'prospective');
  stub.status = 'ready';
  stub.fullNpcId = npcId;
  return { ok: true, npcId };
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
    const reason = isFacilityFunctional(gameState, 'bedroom_habitability')
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
  if (!npc || npc.residency.status !== 'prospective') return { ok: false, reason: 'No such applicant.' };

  // The player must explicitly choose a room — see renderRoomListAssign.
  if (!roomId) return { ok: false, reason: 'Choose a room for them.' };
  const roomDef = ROOMS[roomId];
  if (!roomDef || roomDef.type !== 'bedroom') return { ok: false, reason: 'That is not a bedroom.' };
  // The player's own room is off-limits for assignment.
  if (roomDef.isPlayer) return { ok: false, reason: 'You can\'t assign someone to your own room.' };

  // Phase 4: a bedroom must be habitable before someone can move in. The
  // bedroom_habitability facility must be at least 'functional' — this is
  // the first upgrade goal, because it points the player at recruiting,
  // which is the answer to rent. See ref/apartment-upgrades-plan.md.
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
  for (const def of Object.values(BILL_DEFS)) {
    const bill = bills[def.id];
    if (!bill || bill.balance <= 0) continue;
    const r = payBill(gameState, def.id);
    if (r.ok) { results.push(r); totalPaid += r.paid; }
  }
  if (results.length === 0) return { ok: false, reason: 'Nothing to pay right now.' };
  return { ok: true, results, totalPaid };
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

// Compute the tax owed for a quarter, given the quarter's gross and the
// accumulated deductions (including the internet share, which is added
// here). Returns { taxableGross, deductions, owed }.
function computeTaxOwed(gameState) {
  const taxes = gameState.world.taxes;
  if (!taxes) return { taxableGross: 0, deductions: 0, owed: 0 };
  const gross = taxes.quarterGross || 0;
  // Phase 11: realized investment gains are taxable. They accumulate in
  // invest.realizedGains and get added to the quarter's gross at tax time.
  const invest = gameState.world.computer?.apps?.invest;
  const realizedGains = invest?.realizedGains || 0;
  let deductions = taxes.quarterDeductions || 0;
  // Internet bill share: add the deductible fraction of the internet
  // bills posted this quarter. The internet bill posts every 30 days
  // (3x per quarter), so we count how many times it posted by checking
  // the cadence: ~3 postings per 90-day quarter.
  const internetDef = BILL_DEFS.internet;
  if (internetDef) {
    const internetPerCycle = computeBillAmount(internetDef, gameState);
    const postingsPerQuarter = Math.ceil(CALENDAR.daysPerQuarter / internetDef.cadenceDays);
    deductions += Math.round(internetPerCycle * postingsPerQuarter * TAX_CONFIG.internetDeductibleFraction);
  }
  const taxableGross = Math.max(0, gross + Math.max(0, realizedGains) - deductions);
  const owed = Math.round(taxableGross * TAX_CONFIG.rate);
  return { taxableGross, deductions, owed };
}

// Bill quarterly taxes at quarter end. Called from processDayRollover
// (via processTaxesForDayUi) when isQuarterEnd(day) is true.
//
// The tax is owed = rate × (quarterGross − deductions). What was already
// paid (the auto-reserve balance, plus any reserve the player set aside)
// counts toward the bill. If the player's reserve covers it, the reserve
// is drawn down. Any shortfall becomes `unpaid`, which carries forward
// with a penalty + interest each subsequent quarter — compounding, so
// ignoring taxes is a spiral rather than a flat fee.
//
// Returns a result record for logging, or null if no billing happened
// (already billed this quarter, or gross is zero with nothing unpaid).
function processQuarterlyTaxes(gameState, day) {
  const taxes = gameState.world.taxes;
  if (!taxes) return null;
  const quarter = getQuarter(day);
  // Don't rebill a quarter we've already billed.
  if (taxes.lastQuarterBilled === quarter && (taxes.quarterGross || 0) === 0 && (taxes.unpaid || 0) === 0) return null;
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
  taxes.lastQuarterBilled = quarter;
  taxes.lastQuarterOwed = owed;
  taxes.lastQuarterPaid = fromReserve;
  return {
    quarter, gross: taxableGross + deductions, deductions, owed,
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
  return upgrade.tier === 'functional' || upgrade.tier === 'upgraded';
}

// Purchase the next tier of a facility. Deducts money, advances the tier,
// recomputes apartment quality + rent. Returns a result record for the UI.
function purchaseUpgrade(gameState, facilityId) {
  const def = FACILITY_DEFS[facilityId];
  if (!def) return { ok: false, reason: 'No such facility.' };
  const upgrades = gameState.world.upgrades;
  if (!upgrades) return { ok: false, reason: 'Upgrade system not initialized.' };
  const upgrade = upgrades[facilityId];
  if (!upgrade) return { ok: false, reason: 'No such facility.' };
  const nextTier = getNextFacilityTier(def, upgrade.tier);
  if (!nextTier) return { ok: false, reason: 'Already fully upgraded.' };
  if (gameState.player.money < nextTier.cost) return { ok: false, reason: `Can't afford ${nextTier.cost} (you have ${Math.round(gameState.player.money)}).` };
  gameState.player.money -= nextTier.cost;
  upgrade.tier = nextTier.tier;
  // Phase 9: advancing a tier resets condition to full.
  upgrade.condition = MAINTENANCE.startingCondition;
  // Recompute rent immediately — the ceiling may have changed.
  gameState.world.rent = computeRent(gameState.npcs, gameState);
  return { ok: true, facilityId, newTier: nextTier.tier, cost: nextTier.cost, label: nextTier.label };
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
    if (tierIdx > 0) {
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
// The bedroom_habitability facility must be at least 'functional'.
function isBedroomHabitable(gameState, roomId) {
  // bedroom_player doesn't need habitability for recruitment (it's the
  // player's own room — the player sleeps there regardless).
  if (roomId === 'bedroom_player') return true;
  return isFacilityFunctional(gameState, 'bedroom_habitability');
}

// ===== /SECTION: COMPUTER =====
