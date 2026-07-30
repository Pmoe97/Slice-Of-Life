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
      browser: { openSiteId: null, history: [] },
      classes: { enrolled: [], completed: [] },
      services: { hired: [] },
      classifieds: { posted: { active: false, postedDay: 0 }, applicants: [], viewingApplicantId: null },
      im: { threads: {}, viewingNpcId: null },
      stream: { subscriptions: [], watchHistory: [], resumePoints: {} },
    },
  };
}

// Which content-flag settings currently apply — the character-creation
// choice if one was made, else CONTENT_CONFIG's defaults (P0's tone/
// content wiring reads the same fallback in PROMPT's buildContentSection).
function activeContentFlags(gameState) {
  return (gameState.meta.contentConfig && gameState.meta.contentConfig.contentFlags) || CONTENT_CONFIG.contentFlags;
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
  browser.history.push({
    day: gameState.meta.clock.day, tick: getTickIndex(gameState.meta.clock.minutes),
    siteId, category: site.category, private: site.category === 'adult',
  });
  return { ok: true, site };
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
function performCleaningVisit(gameState, service) {
  const scopeRooms = service.accessScope === 'all' ? ALL_ROOMS : COMMON_ROOMS;
  let itemsCleaned = 0;
  for (const roomId of scopeRooms) itemsCleaned += cleanRoomObjects(gameState, roomId);
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

function findEmptyBedroom(gameState) {
  const bedrooms = ['bedroom_1', 'bedroom_2', 'bedroom_3'];
  return bedrooms.find(roomId =>
    !Object.values(gameState.npcs).some(n => n.residency.room === roomId && n.residency.status === 'resident')
  ) || null;
}

function postRoommateAd(gameState) {
  const classifieds = gameState.world.computer.apps.classifieds;
  if (classifieds.posted.active) return { ok: false, reason: 'You already have an active listing.' };
  if (!findEmptyBedroom(gameState)) return { ok: false, reason: 'No empty room to offer.' };
  classifieds.posted = { active: true, postedDay: gameState.meta.clock.day };
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

function acceptApplicant(gameState, npcId) {
  const npc = gameState.npcs[npcId];
  if (!npc || npc.residency.status !== 'prospective') return { ok: false, reason: 'No such applicant.' };
  const roomId = findEmptyBedroom(gameState);
  if (!roomId) return { ok: false, reason: 'No empty room available.' };

  let updated = moveToRoom(npcId, npc, roomId, gameState.npcs);
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
  gameState.world.rent = computeRent(gameState.npcs);

  const classifieds = gameState.world.computer.apps.classifieds;
  classifieds.applicants = classifieds.applicants.filter(id => id !== npcId);
  classifieds.posted.active = false;

  return { ok: true, npc: gameState.npcs[npcId] };
}

function rejectApplicant(gameState, npcId) {
  const npc = gameState.npcs[npcId];
  if (!npc || npc.residency.status !== 'prospective') return { ok: false, reason: 'No such applicant.' };
  const classifieds = gameState.world.computer.apps.classifieds;
  classifieds.applicants = classifieds.applicants.filter(id => id !== npcId);
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
async function sendImMessage(gameState, npcId, text) {
  const npc = gameState.npcs[npcId];
  if (!npc) return { ok: false, reason: 'No such contact.' };
  const thread = ensureImThread(gameState, npcId);
  const tick = getTickIndex(gameState.meta.clock.minutes);
  thread.msgs.push({ from: 'player', text, day: gameState.meta.clock.day, tick });
  thread.unread = 0;

  const context = assembleImContext(gameState, npcId);
  const result = await callImLLM(context, text);
  if (result.valid && result.proposal) {
    const applied = await applyProposal(result.proposal, context, gameState);
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

// ===== /SECTION: COMPUTER =====
