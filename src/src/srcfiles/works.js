// ===== SECTION: WORKS =====
// The works engine (aspirations-and-creative-careers-overhaul-plan Phase 4,
// D17–D20): the player's own catalog — things made, released, promoted,
// fading, earning. Books (Phase 5), tracks (Phase 6), pieces (Phase 7) and
// listed dishes (Phase 8) are all the ONE record shape below with a `kind`;
// every track-specific screen is a caller of these functions, never a
// second engine.
//
// Shape (D17), on player.works[]:
//   { id, kind, title, quality, createdDay, releasedDay, reach,
//     lastPromotedDay, lastDecayDay, earned, meta }
// and, while still being made, on player.workInProgress[] (D20):
//   { id, kind, title, blocks, done, startedDay, meta }
// Both ride the persisted `player` record with lazy defaults
// (ensurePlayerWorks) — no new SAVE_KEYS entry, no migration (D58's
// additive-default precedent).
//
// Production mirrors a gig exactly (D20/D4): workBlock is workGigBlock's
// shape — COMPUTER's computeFocusMultiplier × the burnout multiplier ×
// GIG_TUNING.progressPerClick per click, GIG_ENERGY_PER_BLOCK of energy
// through the F1 need-decay scale, the device meter, the metabolism
// impulse, and the same gigs.workBlocksToday counter that drives burnout.
// A creative career is not a way around burnout.
//
// Money flows through EARN_MONEY only (D3, invariant 5): catalogIncomeForDay
// credits the day's trickle through applyEffects exactly as deliverGig does,
// and the tax accumulator sees it the same way. No platform balance.
//
// Lumpy by construction (D2/D18, invariant 10): reach halves every
// WORKS_TUNING.decayHalfLifeDays without a promotion, and every work rolls a
// seeded daily spike. Nothing caps the sum over the catalog — prolific
// beats one-hit.
//
// Pure logic, no DOM (invariant 7) — exercisable by run-all.js. Loads after
// skills.js and computer.js (D56); the UI (ui.computer.js) and the tracker
// call in.

// Lazy defaults for the two arrays and the fractional-dollar carry. Called
// at every entry point so a save from before this phase reads as an empty
// catalog rather than a missing field every reader would have to guard.
function ensurePlayerWorks(player) {
  if (!Array.isArray(player.works)) player.works = [];
  if (!Array.isArray(player.workInProgress)) player.workInProgress = [];
  if (typeof player.catalogCarry !== 'number' || !Number.isFinite(player.catalogCarry)) player.catalogCarry = 0;
  if (typeof player.catalogPaidDay !== 'number') player.catalogPaidDay = 0;
  return player;
}

// Reputation in a kind's gig category — the D19 gate's second half. Reads
// through Phase 2's one reader so a map missing the key still reads 0.
function workCategoryRep(gameState, kind) {
  const def = WORK_KINDS[kind];
  const gigs = gameState.world?.computer?.apps?.gigs;
  return def && gigs ? gigCategoryRep(gigs, def.category) : 0;
}

// D22's `requires`: a kind that needs a placed decor object (the recording
// kit) is only startable/releasable while one is placed somewhere in the
// apartment. Searched by structural bucket KEY like WORLD's findPhoneObject
// — obj.bucket is a denormalized copy and never what logic branches on.
function workRequirementMet(gameState, kind) {
  const def = WORK_KINDS[kind];
  if (!def || !def.requires) return true;
  for (const objs of Object.values(gameState.objects || {})) {
    if (objs && Object.values(objs).some(o => o && o.defId === def.requires)) return true;
  }
  return false;
}

// D19 — can the player go independent in this kind right now? Pure:
// { ok, reasons: [] } with every unmet condition named, so a screen can
// show all of them rather than the first. Skill AND category reputation,
// plus the kind's placed-object requirement.
function canRelease(gameState, kind) {
  const def = WORK_KINDS[kind];
  if (!def) return { ok: false, reasons: [`Unknown work kind '${kind}'.`] };
  const reasons = [];
  const level = skillLevel(gameState.player, def.skill);
  if (level < def.minSkill) reasons.push(`${def.skill} skill ${level}/${def.minSkill}`);
  const rep = workCategoryRep(gameState, kind);
  if (rep < def.minRep) reasons.push(`${gigCategoryLabel(def.category)} reputation ${Math.round(rep)}/${def.minRep}`);
  if (!workRequirementMet(gameState, kind)) reasons.push(`needs a ${def.requires.replace(/_/g, ' ')} placed at home`);
  return { ok: reasons.length === 0, reasons };
}

// A stable id. The per-player counter is the same shape gigs use for
// gig_<day>_<n> — an id, never an array index, so eviction/reorder can't
// break a reference from a later phase (an item's meta.workId, a Notice
// subject ref).
function nextWorkId(player) {
  const n = (player.nextWorkSeq || 0) + 1;
  player.nextWorkSeq = n;
  return `work_${n}`;
}

// D20 — begin producing a work. Rolls the block count from the kind's
// range (seeded on the id so a reload can't reroll it) and lists it on
// player.workInProgress. Kinds with no blocksRange (a dish) skip production
// and land straight in the catalog, unreleased. `title` is the player's;
// `meta` is the track's own (an item id, a listing name). Pure over the
// player record apart from the writes named; returns { ok, work|wip }.
function startWork(gameState, { kind, title, meta } = {}) {
  const def = WORK_KINDS[kind];
  if (!def) return { ok: false, reason: `Unknown work kind '${kind}'.` };
  const player = ensurePlayerWorks(gameState.player);
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return { ok: false, reason: 'Give it a title first.' };
  if (!workRequirementMet(gameState, kind)) return { ok: false, reason: `You need a ${def.requires.replace(/_/g, ' ')} placed at home for that.` };
  const day = gameState.meta.clock.day;
  const id = nextWorkId(player);
  if (!def.blocksRange) {
    const work = finishWorkRecord(gameState, { id, kind, title: cleanTitle, startedDay: day, meta: meta || {} });
    return { ok: true, work };
  }
  const rng = seededRng(gameState.meta.seed, `work_blocks_${id}`);
  const blocks = def.blocksRange[0] + Math.floor(rng() * (def.blocksRange[1] - def.blocksRange[0] + 1));
  const wip = { id, kind, title: cleanTitle, blocks, done: 0, startedDay: day, meta: meta || {} };
  player.workInProgress.push(wip);
  return { ok: true, wip };
}

// The moment production completes: the work record is minted with its
// quality FIXED at the maker's craft skill right now (D17 — a work is what
// it was when made; skillMod's craftQuality curve, one lookup), unreleased,
// reach 0. Moves the wip entry (if any) into the catalog.
function finishWorkRecord(gameState, wip) {
  const player = ensurePlayerWorks(gameState.player);
  const def = WORK_KINDS[wip.kind];
  const day = gameState.meta.clock.day;
  const work = {
    id: wip.id, kind: wip.kind, title: wip.title,
    quality: Math.round(skillMod(player, def.skill, 'craftQuality') * 100) / 100,
    createdDay: day, releasedDay: null,
    reach: 0, lastPromotedDay: null, lastDecayDay: day,
    earned: 0,
    meta: { ...(wip.meta || {}), startedDay: wip.startedDay ?? day },
  };
  player.workInProgress = player.workInProgress.filter(w => w.id !== wip.id);
  player.works.push(work);
  // Phase 7 (D23): a finished piece is also a THING — one player_art stack
  // in the bag, keyed back to the work by meta.workId. Sell it (sellWork),
  // hang it (Phase 16), or give it away like any gift; the work record
  // stays the truth of what it is.
  if (wip.kind === 'piece') {
    player.inventory = addStack(player.inventory, 'player_art', 1, 'player', { workId: work.id, title: work.title, quality: work.quality, acquiredDay: day }, day);
    work.meta.itemDefId = 'player_art';
  }
  pushMoodImpulse(player, MOOD_PAYOUTS.workFinish, day);
  return work;
}

// Phase 7 (D23): the player_art stack that IS this piece, if it is still in
// the bag (sold, hung or given away → null).
function pieceItemStack(player, workId) {
  return (player.inventory || []).find(s => s && s.defId === 'player_art' && s.meta && s.meta.workId === workId && s.qty > 0) || null;
}

// Phase 7 (D23) — sell a finished piece, once. Art has no recurring
// listeners: selling is the piece's whole release — the D19 gate (art
// skill AND art reputation) is the same one every kind passes, and the
// price is WORK_KINDS.piece.salePrice(quality, art rep now), credited
// through EARN_MONEY like a gig payout. The item leaves the bag; the
// record stays in the catalog, released, at reach 0, so it counts as a
// work made and sold (a later phase's milestones read it) but earns
// nothing further (catalogIncomeForDay skips rate-0 kinds). The moment is
// a Notice subject like any release (D75).
function sellWork(gameState, workId) {
  const player = ensurePlayerWorks(gameState.player);
  const work = player.works.find(w => w.id === workId);
  if (!work) return { ok: false, reason: 'No such work.' };
  if (work.kind !== 'piece') return { ok: false, reason: 'Only a piece sells outright.' };
  if (work.releasedDay != null) return { ok: false, reason: "That one's already gone." };
  const stack = pieceItemStack(player, work.id);
  if (!stack) return { ok: false, reason: "You don't have it any more." };
  const gate = canRelease(gameState, 'piece');
  if (!gate.ok) return { ok: false, reason: `Not yet — ${gate.reasons.join(', ')}.`, reasons: gate.reasons };
  const def = WORK_KINDS.piece;
  const day = gameState.meta.clock.day;
  const rep = workCategoryRep(gameState, 'piece');
  const price = def.salePrice(work.quality, rep);
  player.inventory = player.inventory.filter(s => s !== stack);
  const effCtx = buildEffectContext(gameState, [], [], {}, []);
  const payoutResult = applyEffects(parseEffectDSL(`EARN_MONEY ${price} art_sale`), effCtx);
  const taxes = gameState.world.taxes || (gameState.world.taxes = { quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0 });
  taxes.quarterGross = (taxes.quarterGross || 0) + price;
  if (taxes.autoReserve) taxes.reserve = (taxes.reserve || 0) + Math.round(price * 0.27);
  work.releasedDay = day;
  work.reach = 0;
  work.lastPromotedDay = day;
  work.lastDecayDay = day;
  work.earned = Math.round((work.earned + price) * 100) / 100;
  work.meta = { ...work.meta, soldDay: day, soldFor: price };
  pushMoodImpulse(player, MOOD_PAYOUTS.workRelease, day);
  let noticed = { key: null, perceivers: [] };
  if (typeof noticeSubject === 'function') {
    noticed = noticeSubject(gameState, {
      kind: 'work', ref: work.id, roomId: player.location, day,
      quality: work.quality, category: def.category,
      meta: { title: work.title, workKind: 'piece', label: def.label.toLowerCase() },
    });
  }
  return { ok: true, work, price, noticed, applied: (payoutResult && payoutResult.applied) || [] };
}

// Phase 16 (D54) — hang a finished piece on a wall. Placement, not a
// release: no D19 gate, no money, the work stays in the catalog unreleased
// at reach 0 (it can come down and sell later). The player_art stack
// leaves the bag and becomes a REAL room object with a `pos` — exactly
// what computer.js's placeDecorItem makes of a bought sofa (the one
// player-placement store, decor-economy D4), built inline here because
// player_art is an ITEM_DEFS good, not a DECOR_CATALOG_DEFS entry, and
// placeDecorItem refuses those. `meta.workId` links it to the work,
// `meta.slot` names the wall (defs.design.js's wallSlotsFor); the
// catalog card's swatch (D80) is what the room view draws. The room is
// then a changed design: noticeRoomDesign runs so whoever is standing
// there judges it (D52), with the piece's quality in the reading.
//   → { ok, id, work, slot, noticed } | { ok: false, reason }
function hangWork(gameState, workId, roomId, slotId) {
  const player = ensurePlayerWorks(gameState.player);
  const work = player.works.find(w => w.id === workId);
  if (!work) return { ok: false, reason: 'No such work.' };
  if (work.kind !== 'piece') return { ok: false, reason: 'Only a piece hangs on a wall.' };
  if (work.releasedDay != null) return { ok: false, reason: "That one's already gone." };
  const stack = pieceItemStack(player, work.id);
  if (!stack) return { ok: false, reason: "You don't have it any more." };
  if (!ROOMS[roomId]) return { ok: false, reason: 'That room does not exist.' };
  const slot = (typeof wallSlotsFor === 'function' ? wallSlotsFor(roomId) : []).find(s => s.id === slotId);
  if (!slot) return { ok: false, reason: 'Pick a wall.' };
  if (typeof wallSlotOccupant === 'function' && wallSlotOccupant(gameState, roomId, slotId)) return { ok: false, reason: 'Something already hangs there.' };
  const day = gameState.meta.clock.day;
  player.inventory = player.inventory.filter(s => s !== stack);
  const bucketId = `room_${roomId}`;
  const bucketMap = gameState.objects[bucketId] || (gameState.objects[bucketId] = {});
  const n = uniqueObjectSlot(bucketMap, gameState.meta.seed, bucketId, 'player_art');
  const id = genObjectId(gameState.meta.seed, bucketId, n, 'player_art');
  bucketMap[id] = {
    id, defId: 'player_art', bucket: bucketId,
    pos: { x: slot.x, y: slot.y, w: slot.w, h: slot.h, rot: slot.rot || 0 },
    ownerId: 'player',
    state: {}, condition: 100, contents: [], evidence: null,
    discovered: {}, flags: {}, spawnedDay: day,
    meta: { ...(stack.meta || {}), workId: work.id, title: work.title, quality: work.quality, slot: slot.id, placedDay: day },
  };
  const noticed = typeof noticeRoomDesign === 'function' ? noticeRoomDesign(gameState, roomId, day) : { key: null, perceivers: [] };
  return { ok: true, id, work, slot, noticed };
}

// Phase 16 (D54) — take a hung piece down: the object leaves the room and
// the player_art stack comes back to the bag with the same meta (the
// workId, the title, the quality), so it can be hung elsewhere or sold.
// The mirror of computer.js's pickUpDecorObject, which refuses non-catalog
// objects. Nothing is destroyed.
function takeDownWork(gameState, objId) {
  const obj = findObjectById(gameState, objId);
  if (!obj || obj.defId !== 'player_art' || !obj.pos) return { ok: false, reason: 'That is not a hung piece.' };
  const bucketMap = gameState.objects[obj.bucket];
  if (bucketMap) delete bucketMap[obj.id];
  const day = gameState.meta.clock.day;
  const { slot, placedDay, ...meta } = obj.meta || {};
  gameState.player.inventory = addStack(gameState.player.inventory, 'player_art', 1, 'player', meta, gameDaysNow(gameState.meta.clock));
  const roomId = String(obj.bucket || '').replace(/^room_/, '');
  if (typeof noticeRoomDesign === 'function' && ROOMS[roomId]) noticeRoomDesign(gameState, roomId, day);
  return { ok: true, workId: meta.workId, roomId, title: meta.title };
}

// Phase 16 — every hung piece, with where it hangs: [{ objId, roomId,
// slot, workId, title, quality }]. The Works tab and the Home app's Hang
// screen read this; Compass's `hungArt` counts the same objects.
function hungPieces(gameState) {
  const out = [];
  for (const [bucket, objs] of Object.entries(gameState.objects || {})) {
    if (!bucket.startsWith('room_')) continue;
    for (const o of Object.values(objs || {})) {
      if (!o || o.defId !== 'player_art' || !o.pos) continue;
      out.push({ objId: o.id, roomId: bucket.slice(5), slot: o.meta?.slot || null, workId: o.meta?.workId || null, title: o.meta?.title || '', quality: o.meta?.quality ?? null });
    }
  }
  return out;
}

// D20 — one production click on a work in progress. workGigBlock's shape,
// line for line: progress = focus × burnout × progressPerClick; the same
// energy, meter, metabolism and burnout-counter writes. Completing the
// last block mints the work record (finishWorkRecord). `device` feeds the
// phone penalty exactly as it does for a gig.
function workBlock(gameState, workId, device) {
  const player = ensurePlayerWorks(gameState.player);
  const wip = player.workInProgress.find(w => w.id === workId);
  if (!wip) return { ok: false, reason: 'Nothing in progress by that name.' };
  if (wip.done >= wip.blocks) return { ok: false, reason: 'That one is finished.' };
  const def = WORK_KINDS[wip.kind];
  const focus = computeFocusMultiplier(gameState, device);
  const burnoutMult = getBurnoutWorkPayMult(player);
  const progress = Math.round(focus * burnoutMult * GIG_TUNING.progressPerClick * 100) / 100;
  wip.done = Math.min(wip.blocks, Math.round((wip.done + progress) * 100) / 100);
  player.energy = clamp(player.energy - GIG_ENERGY_PER_BLOCK * needDecayScaleFor(gameState), 0, 100);
  const gigs = gameState.world.computer?.apps?.gigs;
  if (gigs) gigs.workBlocksToday = (gigs.workBlocksToday || 0) + progress;
  if (def.usesComputer) recordUtilityUsage(gameState, 'devices', 0.5);
  const act = METABOLISM.activities.workBlock;
  notePlayerActivity(gameState, act.impulse, act.kcal, gameState.meta.clock.day);
  const finished = wip.done >= wip.blocks;
  const work = finished ? finishWorkRecord(gameState, wip) : null;
  return { ok: true, wip, progress, finished, work };
}

// D19 — release a finished, unreleased work: the gate, then the launch.
// Reach starts at the kind's releaseReach(quality, category rep) and the
// fade clock starts today. Going independent is a real milestone — the
// biggest single mood payout in the works engine.
function releaseWork(gameState, workId) {
  const player = ensurePlayerWorks(gameState.player);
  const work = player.works.find(w => w.id === workId);
  if (!work) return { ok: false, reason: 'No such work.' };
  if (work.releasedDay != null) return { ok: false, reason: 'That one is already out.' };
  if (work.kind === 'piece') return { ok: false, reason: 'A piece is sold (or hung), not released.' };
  const gate = canRelease(gameState, work.kind);
  if (!gate.ok) return { ok: false, reason: `Not yet — ${gate.reasons.join(', ')}.`, reasons: gate.reasons };
  const def = WORK_KINDS[work.kind];
  const day = gameState.meta.clock.day;
  const rep = workCategoryRep(gameState, work.kind);
  work.releasedDay = day;
  work.reach = def.releaseReach(work.quality, rep);
  work.lastPromotedDay = day;
  work.lastDecayDay = day;
  pushMoodImpulse(player, MOOD_PAYOUTS.workRelease, day);
  // Phase 5 (D9/D10): a release is the first moment a work is a Notice
  // subject — whoever is in the room when it goes out forms an opinion of
  // it, at the work's own quality. Platform perceivers (a reader, a
  // listener) arrive with Phase 10's hook; until then, in-room only.
  let noticed = { key: null, perceivers: [] };
  if (def.noticeOnRelease !== false && typeof noticeSubject === 'function') {
    noticed = noticeSubject(gameState, {
      kind: 'work', ref: work.id, roomId: player.location, day,
      quality: work.quality, category: def.category,
      meta: { title: work.title, workKind: work.kind, label: def.label.toLowerCase() },
    });
  }
  return { ok: true, work, reach: work.reach, noticed };
}

// D18 — a promotion: one block of work (energy, burnout, the lot — through
// the same writes as workBlock, minus the progress) that adds
// promoteBump × releaseReach(quality, rep now) to the live reach and resets
// the fade clock. Only a released work can be promoted; a piece or dish
// (ratePerReach 0) gains nothing from it and is refused so the click is
// never wasted.
function promoteWork(gameState, workId, device) {
  const player = ensurePlayerWorks(gameState.player);
  const work = player.works.find(w => w.id === workId);
  if (!work) return { ok: false, reason: 'No such work.' };
  if (work.releasedDay == null) return { ok: false, reason: "It isn't out yet." };
  const def = WORK_KINDS[work.kind];
  if (!(def.ratePerReach > 0)) return { ok: false, reason: `A ${def.label.toLowerCase()} has no audience to grow.` };
  const day = gameState.meta.clock.day;
  const rep = workCategoryRep(gameState, work.kind);
  const bump = Math.round(WORKS_TUNING.promoteBump * def.releaseReach(work.quality, rep) * 100) / 100;
  work.reach = Math.round((work.reach + bump) * 100) / 100;
  work.lastPromotedDay = day;
  player.energy = clamp(player.energy - GIG_ENERGY_PER_BLOCK * needDecayScaleFor(gameState), 0, 100);
  const gigs = gameState.world.computer?.apps?.gigs;
  if (gigs) gigs.workBlocksToday = (gigs.workBlocksToday || 0) + 1;
  if (def.usesComputer) recordUtilityUsage(gameState, 'devices', 0.5);
  const act = METABOLISM.activities.workBlock;
  notePlayerActivity(gameState, act.impulse, act.kcal, day);
  return { ok: true, work, bump, reach: work.reach };
}

// D18 — the fade. Each released work's reach halves every
// decayHalfLifeDays, applied once per day at rollover. Idempotent on a
// re-processed rollover: the exponent is the days since the work was LAST
// decayed, so running the same day twice multiplies by 0.5^0 = 1. Returns
// the works that moved.
function decayWorks(gameState, day) {
  const player = ensurePlayerWorks(gameState.player);
  const moved = [];
  for (const work of player.works) {
    if (work.releasedDay == null || !(work.reach > 0)) { work.lastDecayDay = day; continue; }
    const since = Math.max(0, day - (work.lastDecayDay ?? work.releasedDay));
    if (since === 0) continue;
    const before = work.reach;
    work.reach = Math.round(before * Math.pow(0.5, since / WORKS_TUNING.decayHalfLifeDays) * 100) / 100;
    work.lastDecayDay = day;
    moved.push({ id: work.id, before, after: work.reach });
  }
  return moved;
}

// D18 — the day's catalog income, per work: reach × quality × ratePerReach,
// times spikeMult on a seeded spike roll (per work per day). PURE unless
// `credit` is set: the same call previews the day (the tracker's Catalog
// line) and, at rollover, credits it. Returns { total, credited, byWork:
// [{ id, title, kind, amount, spike }] }.
//
// Crediting: whole dollars only go through EARN_MONEY (player.money is
// integer everywhere); the fractional remainder carries on
// player.catalogCarry so a $0.40/day back-catalog title still pays out
// every few days rather than never. The tax accumulator sees the credited
// amount exactly as it sees a gig payout. Idempotent per day
// (player.catalogPaidDay — generateGigsForDay's lastRefreshDay guard): a
// re-processed rollover (crash recovery, fast-forward) previews the same
// numbers but credits nothing twice.
function catalogIncomeForDay(gameState, day, { credit = false } = {}) {
  const player = ensurePlayerWorks(gameState.player);
  const byWork = [];
  let total = 0;
  const alreadyPaid = player.catalogPaidDay === day;
  for (const work of player.works) {
    const def = WORK_KINDS[work.kind];
    if (!def || work.releasedDay == null || !(def.ratePerReach > 0) || !(work.reach > 0)) continue;
    const rng = seededRng(gameState.meta.seed, `catalog_${day}_${work.id}`);
    const spike = rng() < WORKS_TUNING.spikeChance;
    const amount = work.reach * work.quality * def.ratePerReach * (spike ? WORKS_TUNING.spikeMult : 1);
    byWork.push({ id: work.id, title: work.title, kind: work.kind, amount, spike });
    total += amount;
  }
  let credited = 0;
  if (credit && total > 0 && !alreadyPaid) {
    player.catalogPaidDay = day;
    const pool = player.catalogCarry + total;
    credited = Math.floor(pool);
    player.catalogCarry = Math.round((pool - credited) * 1e6) / 1e6;
    for (const row of byWork) {
      const work = player.works.find(w => w.id === row.id);
      if (work) work.earned = Math.round((work.earned + row.amount) * 100) / 100;
    }
    if (credited > 0) {
      const effCtx = buildEffectContext(gameState, [], [], {}, []);
      applyEffects(parseEffectDSL(`EARN_MONEY ${credited} catalog`), effCtx);
      const taxes = gameState.world.taxes || (gameState.world.taxes = { quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0 });
      taxes.quarterGross = (taxes.quarterGross || 0) + credited;
      if (taxes.autoReserve) taxes.reserve = (taxes.reserve || 0) + Math.round(credited * 0.27);
    }
  }
  return { total: Math.round(total * 100) / 100, credited, byWork };
}

// The rollover's one call (UI's processDayRollover, beside
// processGigsForDay): fade first, then pay on the faded reach — yesterday's
// promotion earns at full strength for exactly the days it held.
function processWorksForDay(gameState, day) {
  // Phase 8: yesterday's unfilled orders are missed (reach loss), then the
  // fade, then the day's pay, then today's orders arrive.
  const missed = closeKitchenDay(gameState, day);
  const decayed = decayWorks(gameState, day);
  const income = catalogIncomeForDay(gameState, day, { credit: true });
  const orders = generateKitchenOrdersForDay(gameState, day);
  return { decayed, income, missed, orders };
}

// Phase 6 (D78) — the stereo-play emission. Applied by EFFECTS'
// trusted-only PLAY_OWN_TRACK, which the record-player hobby appends when
// the player has a released track: a seeded roll (per moment — day and
// minute — so two listens in a day are two rolls) decides whether one of
// the player's own tracks comes up in the stack, and if it does, the room
// hears it — NOTICE's `work` subject at the track's quality, so whoever is
// there forms (or already holds) an opinion of it. Returns { played, noticed }.
function playOwnTrack(gameState, roomId) {
  const player = ensurePlayerWorks(gameState.player);
  const tracks = player.works.filter(w => w.kind === 'track' && w.releasedDay != null);
  if (tracks.length === 0) return { played: null, noticed: null };
  const clock = gameState.meta.clock || {};
  const rng = seededRng(gameState.meta.seed, `own_track_${clock.day}_${Math.round(clock.minutes || 0)}_${roomId}`);
  if (rng() >= WORKS_TUNING.stereoPlayChance) return { played: null, noticed: null };
  const track = tracks[Math.floor(rng() * tracks.length)];
  const def = WORK_KINDS.track;
  let noticed = null;
  if (typeof noticeSubject === 'function') {
    noticed = noticeSubject(gameState, {
      kind: 'work', ref: track.id, roomId, day: clock.day,
      quality: track.quality, category: def.category,
      meta: { title: track.title, workKind: 'track', label: def.label.toLowerCase() },
    });
  }
  return { played: track, noticed };
}

// ===== The home kitchen (Phase 8, D24/D25/D81–D84) =====
// The player's own listing on DoorDrop: opened under a name of their own,
// dishes listed one `menu` work each (the recipe is the dish; the listing
// quality is craftQuality at listing time), orders arriving per day from
// each dish's reach ("regulars") × the kitchen's cleanliness, fulfilled by
// COOKING the recipe through the ordinary cook path and handing a serving
// of the resulting plate to the order — the plate's quality is the order's
// rating. Money through EARN_MONEY; the listing appears on DoorDrop at
// READ time (playerKitchenDef, never a static RESTAURANT_DEFS entry).
//
// player.kitchen = { name, listedDay|null, orders: [], lastOrdersDay,
//   ratingSum, ratingCount } (lazy default, D81). An order:
//   { id, workId, recipeId, dish, price, day, status: 'open'|'done'|'missed',
//     customerId: npcId|null, rating? }
// customerId is a housemate who ordered (a cast order, D84) or null — a
// ghost, a number, never a person (invariant 9).

function ensurePlayerKitchen(player) {
  if (!player.kitchen || typeof player.kitchen !== 'object') {
    player.kitchen = { name: '', listedDay: null, orders: [], lastOrdersDay: 0, ratingSum: 0, ratingCount: 0 };
  }
  const k = player.kitchen;
  if (typeof k.name !== 'string') k.name = '';
  if (!Array.isArray(k.orders)) k.orders = [];
  if (typeof k.lastOrdersDay !== 'number') k.lastOrdersDay = 0;
  if (typeof k.ratingSum !== 'number') k.ratingSum = 0;
  if (typeof k.ratingCount !== 'number') k.ratingCount = 0;
  return k;
}

function kitchenIsOpen(player) {
  const k = player && player.kitchen;
  return !!(k && k.listedDay != null && k.name);
}

// The listed dishes: released `menu` works. `recipeId` lives on meta.
function listedDishes(player) {
  return ensurePlayerWorks(player).works.filter(w => w.kind === 'menu' && w.releasedDay != null);
}

// D25 — the kitchen's cleanliness as a 0..1 multiplier on order volume,
// read through WORLD's refreshRoomCleanliness (object cleanliness minus
// room dirt — both existing systems; this is a reader, not a field),
// floored so a filthy kitchen still trickles rather than flatlines.
// `refresh` recomputes the score (the order generator, a write path);
// without it the cached world.rooms.kitchen.cleanliness is read — the
// renderer's path, which must not mutate state.
function kitchenCleanlinessFactor(gameState, { refresh = false } = {}) {
  const room = gameState.world?.rooms?.kitchen;
  if (!room) return 1;
  const score = (refresh && typeof refreshRoomCleanliness === 'function')
    ? refreshRoomCleanliness(gameState, 'kitchen')
    : (typeof room.cleanliness === 'number' ? room.cleanliness : 100);
  return Math.max(WORKS_TUNING.kitchen.minCleanliness, clamp(score / 100, 0, 1));
}

// Open the listing (the D19 gate for the `menu` kind — going independent
// in food — plus a name, free text, any non-empty string).
function openKitchen(gameState, name) {
  const player = gameState.player;
  const k = ensurePlayerKitchen(player);
  const clean = String(name || '').trim();
  if (!clean) return { ok: false, reason: 'Give the kitchen a name first.' };
  if (kitchenIsOpen(player)) return { ok: false, reason: `${k.name} is already listed.` };
  const gate = canRelease(gameState, 'menu');
  if (!gate.ok) return { ok: false, reason: `Not yet — ${gate.reasons.join(', ')}.`, reasons: gate.reasons };
  k.name = clean;
  k.listedDay = gameState.meta.clock.day;
  pushMoodImpulse(player, MOOD_PAYOUTS.workRelease, k.listedDay);
  return { ok: true, kitchen: k };
}

// List a dish: one `menu` work per recipe (startWork lands it straight in
// the catalog; releaseWork is "it's on the menu" — reach = the kind's
// releaseReach at the listing's quality and today's food rep). The recipe
// must be a RECIPES entry; a recipe already listed is refused.
function listDish(gameState, recipeId) {
  const player = gameState.player;
  const recipe = typeof RECIPES !== 'undefined' ? RECIPES[recipeId] : null;
  if (!recipe) return { ok: false, reason: 'No such recipe.' };
  if (!kitchenIsOpen(player)) return { ok: false, reason: 'Open the kitchen first.' };
  if (ensurePlayerWorks(player).works.some(w => w.kind === 'menu' && w.meta && w.meta.recipeId === recipeId)) return { ok: false, reason: `${recipe.label} is already on the menu.` };
  const started = startWork(gameState, { kind: 'menu', title: recipe.label, meta: { recipeId } });
  if (!started.ok) return started;
  const released = releaseWork(gameState, started.work.id);
  if (!released.ok) return released;
  return { ok: true, work: started.work, reach: released.reach };
}

// D24 — the day's orders, per listed dish: expected = reach × ordersPerReach
// × cleanliness; the count is floor(expected) plus a seeded roll on the
// fraction (lumpy), then a per-resident roll for a cast order (D84). Seeded
// on (seed, day) and idempotent through kitchen.lastOrdersDay. Returns the
// orders created.
function generateKitchenOrdersForDay(gameState, day) {
  const player = gameState.player;
  const k = ensurePlayerKitchen(player);
  if (!kitchenIsOpen(player) || k.lastOrdersDay === day) return [];
  k.lastOrdersDay = day;
  const dishes = listedDishes(player);
  if (dishes.length === 0) return [];
  const def = WORK_KINDS.menu;
  const rep = workCategoryRep(gameState, 'menu');
  const clean = kitchenCleanlinessFactor(gameState, { refresh: true });
  const rng = seededRng(gameState.meta.seed, `kitchen_orders_${day}`);
  const residents = Object.entries(gameState.npcs || {})
    .filter(([id, n]) => id.startsWith('npc_') && n && n.residency && n.residency.status === 'resident')
    .map(([id]) => id);
  const created = [];
  let n = 0;
  for (const dish of dishes) {
    const expected = dish.reach * def.ordersPerReach * clean;
    let count = Math.floor(expected);
    if (rng() < expected - count) count++;
    const price = def.orderPrice(dish.quality, rep);
    const mk = (customerId) => {
      const order = { id: `ord_${day}_${n++}`, workId: dish.id, recipeId: dish.meta.recipeId, dish: dish.title, price, day, status: 'open', customerId };
      k.orders.push(order);
      created.push(order);
    };
    for (let i = 0; i < count; i++) mk(null);
    for (const npcId of residents) {
      if (rng() < WORKS_TUNING.kitchen.residentOrderChance * clean) mk(npcId);
    }
  }
  return created;
}

// The serving that can fill this order: a cooked_meal stack whose plate is
// this recipe with a serving left, in the bag or in the kitchen's own
// containers (a real cook lands the batch in the fridge — defs.actions.js's
// kitchenSources is the same draw order the cook itself uses: bag, then
// fridge/pantry/freezer). Returns { stack, source } or null.
function plateForOrder(player, order, gameState) {
  const match = (s) => s && s.qty > 0 && s.meta && s.meta.plate && s.meta.plate.recipeKey === order.recipeId && (s.meta.plate.servings?.left ?? 0) >= 1;
  const sources = (gameState && typeof kitchenSources === 'function')
    ? kitchenSources(gameState, { roomId: 'kitchen' })
    : [{ id: 'player', contents: player.inventory }];
  for (const src of sources) {
    const stack = (src.contents || []).find(match);
    if (stack) return { stack, source: src };
  }
  return null;
}

// Fulfil an open order with a serving of a matching plate: the serving
// leaves the bag (the stack when it was the last), the price credits
// through EARN_MONEY, the plate's quality is the rating, the dish gains
// regulars (regularGain × quality, and the fade clock resets — a fulfilled
// order is the listing's promotion), and a housemate's order is noticed by
// THEM when they eat it (D83/D84). Returns { ok, order, price, quality,
// noticed, applied }.
function fulfillKitchenOrder(gameState, orderId) {
  const player = gameState.player;
  const k = ensurePlayerKitchen(player);
  const order = k.orders.find(o => o.id === orderId);
  if (!order) return { ok: false, reason: 'No such order.' };
  if (order.status !== 'open') return { ok: false, reason: `That order is already ${order.status}.` };
  const found = plateForOrder(player, order, gameState);
  if (!found) return { ok: false, reason: `Cook ${order.dish} first — there's no serving of it in the bag or the fridge.` };
  const { stack, source } = found;
  const work = ensurePlayerWorks(player).works.find(w => w.id === order.workId);
  const day = gameState.meta.clock.day;
  const quality = Number(stack.meta.plate.quality) || 0;
  stack.meta.plate.servings.left -= 1;
  if (stack.meta.plate.servings.left <= 0) {
    if (source.id === 'player') player.inventory = player.inventory.filter(s => s !== stack);
    else source.contents.splice(source.contents.indexOf(stack), 1);
  }
  const effCtx = buildEffectContext(gameState, [], [], {}, []);
  const payoutResult = applyEffects(parseEffectDSL(`EARN_MONEY ${order.price} kitchen`), effCtx);
  const taxes = gameState.world.taxes || (gameState.world.taxes = { quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0 });
  taxes.quarterGross = (taxes.quarterGross || 0) + order.price;
  if (taxes.autoReserve) taxes.reserve = (taxes.reserve || 0) + Math.round(order.price * 0.27);
  order.status = 'done';
  order.rating = Math.round(quality * 100) / 100;
  order.doneDay = day;
  k.ratingSum += order.rating;
  k.ratingCount += 1;
  if (work) {
    work.earned = Math.round((work.earned + order.price) * 100) / 100;
    work.reach = Math.round((work.reach + WORKS_TUNING.kitchen.regularGain * quality) * 100) / 100;
    work.lastPromotedDay = day;
  }
  pushMoodImpulse(player, MOOD_PAYOUTS.workFinish, day);
  let noticed = { key: null, perceivers: [] };
  if (order.customerId && work && typeof noticeSubject === 'function') {
    noticed = noticeSubject(gameState, {
      kind: 'work', ref: work.id, day, quality, category: WORK_KINDS.menu.category,
      perceiverIds: [order.customerId],
      meta: { title: work.title, workKind: 'menu', label: 'cooking' },
    });
  }
  return { ok: true, order, price: order.price, quality: order.rating, noticed, applied: (payoutResult && payoutResult.applied) || [] };
}

// End of day: every order still open from BEFORE today is missed, and its
// dish loses a slice of its regulars (D24 — "unfulfilled orders by end of
// day lose reach"). Runs at rollover before the new day's orders arrive.
function closeKitchenDay(gameState, day) {
  const player = gameState.player;
  const k = ensurePlayerKitchen(player);
  const missed = [];
  for (const order of k.orders) {
    if (order.status !== 'open' || order.day >= day) continue;
    order.status = 'missed';
    const work = ensurePlayerWorks(player).works.find(w => w.id === order.workId);
    if (work) work.reach = Math.round(work.reach * (1 - WORKS_TUNING.kitchen.unfulfilledReachLoss) * 100) / 100;
    missed.push(order);
  }
  // Keep the queue readable: only the last two weeks of closed orders.
  k.orders = k.orders.filter(o => o.status === 'open' || o.day >= day - 14);
  return missed;
}

function kitchenRating(player) {
  const k = ensurePlayerKitchen(player);
  return k.ratingCount > 0 ? Math.round((k.ratingSum / k.ratingCount) * 100) / 100 : null;
}

function openKitchenOrders(player, day) {
  return ensurePlayerKitchen(player).orders.filter(o => o.status === 'open');
}

// Display helpers for the Works tab and the tracker — pure reads.
function releasedWorks(player) { return ensurePlayerWorks(player).works.filter(w => w.releasedDay != null); }
function unreleasedWorks(player) { return ensurePlayerWorks(player).works.filter(w => w.releasedDay == null); }

// ===== /SECTION: WORKS =====
