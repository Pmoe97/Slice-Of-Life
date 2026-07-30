// ===== SECTION: COMPUTER =====
// Session state and domain logic for the computer as a diegetic screen —
// not the modal shell (see main.html's #computer-screen, gated by
// #main-content[data-mode="computer"]). Header/sidebars/footer stay
// visible while the computer is open: the clock keeps ticking, the
// Present panel keeps showing who's around, and a roommate can walk in on
// you. Time passes only on actions with a real cost (working a block),
// never on navigating between screens.
//
// Hard rule: the entire screen must be derivable from gameState.world.
// computer. No app state may live in the DOM — RENDER.COMPUTER's job is
// to read this object and draw it, nothing else.

function defaultComputerState() {
  return {
    power: 'off',
    view: { appId: null, screenId: null, params: {} },
    stack: [],
    apps: {
      work: { jobId: null, employed: false, todayBlocks: 0, todayEarned: 0, reputation: 0, backlog: [], strikes: 0, lastPayDay: 0 },
      shop: { cart: [], wishlist: [] },
    },
  };
}

function openApp(gameState, appId) {
  const def = APP_DEFS[appId];
  if (!def) return;
  gameState.world.computer.view = { appId, screenId: def.entryScreen, params: {} };
}

function switchScreen(gameState, screenId, params) {
  const view = gameState.world.computer.view;
  gameState.world.computer.view = { ...view, screenId, params: params || {} };
}

function closeComputer(gameState) {
  gameState.world.computer.power = 'off';
  gameState.world.computer.view = { appId: null, screenId: null, params: {} };
}

// --- Work app ---

// How much a work block pays scales with rest and mood, on top of the
// job's base rate and (if the job has one) the qualitySkill's
// payMultiplier curve — a bad night or a foul mood costs real money, not
// just a narration line.
function computeFocusMultiplier(gameState) {
  const player = gameState.player;
  const energyFactor = clamp(player.energy / 100, WORK_TUNING.minEnergyFocus, WORK_TUNING.maxEnergyFocus);
  const moodFactor = clamp((player.mood + 1) / 2, WORK_TUNING.minMoodFocus, WORK_TUNING.maxMoodFocus);
  return energyFactor * moodFactor;
}

// Deterministic per-day backlog, seeded off the save seed + day, matching
// SIM's off-screen event / quest-generation convention — no LLM, and
// reproducible from a seed like everything else that's supposed to be.
function generateDailyBacklog(gameState, job) {
  const tasks = [];
  for (let i = 0; i < job.blocksPerDeadline; i++) {
    tasks.push({ taskId: `task_${gameState.meta.clock.day}_${i}`, done: false });
  }
  return tasks;
}

function applyForJob(gameState, jobId) {
  const job = JOB_DEFS[jobId];
  if (!job) return { ok: false, reason: 'No such job.' };
  for (const [skillId, lvl] of Object.entries(job.requiredSkills || {})) {
    if (skillLevel(gameState.player, skillId) < lvl) return { ok: false, reason: `Requires ${skillId} level ${lvl}.` };
  }
  const work = gameState.world.computer.apps.work;
  work.jobId = jobId;
  work.employed = true;
  work.strikes = 0;
  work.reputation = work.reputation || 0;
  work.backlog = generateDailyBacklog(gameState, job);
  work.lastPayDay = gameState.meta.clock.day;
  return { ok: true, job };
}

function workOneBlock(gameState) {
  const work = gameState.world.computer.apps.work;
  const job = JOB_DEFS[work.jobId];
  if (!job) return { ok: false, reason: 'You have no job.' };
  const pending = work.backlog.find(t => !t.done);
  if (!pending) return { ok: false, reason: "Today's backlog is already done." };

  const payMod = job.qualitySkill ? skillMod(gameState.player, job.qualitySkill, 'payMultiplier') : 1;
  const focus = computeFocusMultiplier(gameState);
  const earned = Math.round(job.payPerBlock * payMod * focus);

  gameState.player.money += earned;
  gameState.player.energy = clamp(gameState.player.energy - job.energyPerBlock, 0, 100);
  work.todayBlocks = (work.todayBlocks || 0) + 1;
  work.todayEarned = (work.todayEarned || 0) + earned;
  work.reputation = Math.min(1, (work.reputation || 0) + job.repGrowth);
  pending.done = true;
  return { ok: true, earned };
}

// Deadline check — called from UI's processDayRollover, once per day
// boundary crossed. An incomplete backlog costs a strike; enough strikes
// and you're let go. A fresh backlog is generated either way (a new pay
// period has started), matching the "always playable, never a hard stop"
// principle the rest of the sim already follows.
function checkWorkDeadline(gameState, day) {
  const work = gameState.world.computer.apps.work;
  const job = JOB_DEFS[work.jobId];
  if (!job || !work.employed) return null;
  if (day - work.lastPayDay < job.deadlineEveryDays) return null;

  const incomplete = work.backlog.filter(t => !t.done).length;
  work.backlog = generateDailyBacklog(gameState, job);
  work.todayBlocks = 0;
  work.todayEarned = 0;
  work.lastPayDay = day;
  if (incomplete === 0) return null;

  work.strikes = (work.strikes || 0) + 1;
  if (work.strikes >= job.firingStrikes) {
    work.employed = false;
    const title = job.title;
    work.jobId = null;
    work.backlog = [];
    return { fired: true, title, missed: incomplete };
  }
  return { fired: false, title: job.title, strikes: work.strikes, maxStrikes: job.firingStrikes, missed: incomplete };
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
  return { ok: true, total, etaDay };
}

// ===== /SECTION: COMPUTER =====
