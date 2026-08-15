// ===== SECTION: ACTIONS =====
// (Apartment Expansion v2 — Mirrored H)
// The action engine: data (DEFS.ACTIONS) -> resolution -> execution. This
// is the chokepoint that starts replacing the old hardcoded switch (UI's
// handleAction) and if-chain (RENDER's renderActionChips) for any verb
// registered in ACTION_DEFS. Verbs not yet ported (sleep/work/talk/move/
// pay-rent/ask-to-leave) keep their existing UI.js implementations — see
// DEFS.ACTIONS' file header for why.

// --- Availability: which registered actions can be taken right now ---
function resolveAvailableActions(gameState) {
  const ctx = buildActionContext(gameState);
  const out = [];
  for (const def of Object.values(ACTION_DEFS)) {
    if (!actionSourceMatches(def, ctx)) continue;
    const check = checkRequirements(def, ctx);
    out.push({ actionId: def.id, label: def.label, group: def.group, chipPriority: def.chipPriority || 0, ok: check.ok, reason: check.reason });
  }
  return out.sort((a, b) => (b.chipPriority || 0) - (a.chipPriority || 0));
}

function actionSourceMatches(def, ctx) {
  if (def.source.kind === 'room') return def.source.roomIds.includes(ctx.roomId);
  if (def.source.kind === 'self') return true;
  if (def.source.kind === 'object') {
    if (Array.isArray(def.source.objDefs)) return def.source.objDefs.some(d => !!findObjectInRoom(ctx, d));
    return !!findObjectInRoom(ctx, def.source.objDef);
  }
  return false; // 'npc'/'item'/'app' sources arrive in later phases
}

// Which actor is executing an action. 'player' is the default and today's
// only caller; continuous-behavior-engine Phase 3 generalizes the engine to
// an arbitrary actor id so NPCs can eventually execute the same verbs, and
// every player-specific read in this file resolves through this one lookup.
// Returns null for an unknown id, and callers that dereference it treat null
// as "no actor" rather than crashing.
function actionActor(gameState, actorId) {
  const id = actorId || 'player';
  return id === 'player' ? (gameState.player || null) : (gameState.npcs?.[id] || null);
}

// The context every availability/requirement/resolution read hangs off.
// `actorId` threads the executing actor through: the room, the room's object
// bucket, and who else is present are all answers ABOUT the actor, not about
// the player specifically. presentNpcIds excludes the actor themselves (an
// NPC executing an action is not "in it with themselves" — the same filter
// the player path gets for free because 'player' is never an NPC id).
function buildActionContext(gameState, actorId) {
  const actor = actionActor(gameState, actorId);
  const roomId = actor ? actor.location : null;
  const roomObjects = (gameState.objects && gameState.objects[`room_${roomId}`]) || {};
  const presentNpcIds = getPresentNpcIds(gameState.npcs, roomId).filter(id => id !== actorId);
  return { gameState, actorId: actorId || 'player', presentNpcIds, roomId, roomObjects };
}

// Find the (first) instance of a given OBJECT_DEFS id in the current room
// — used both for source:'object' availability and by action-specific
// prepare()/buildEffects() logic (e.g. self.cook finding the stove/fridge/
// pantry it needs). Rooms never hold two instances of the same def today,
// so "first" is unambiguous.
function findObjectInRoom(ctx, defId) {
  return Object.values(ctx.roomObjects).find(o => o.defId === defId) || null;
}

// --- Requirement checking (mirrors SIM's CAST_REQUIREMENT_CHECKERS: a
// config-declared list of requirement names against a name→predicate
// registry, so extending `requires` is a data change, not a code change). ---
function checkRequirements(def, ctx) {
  for (const rule of def.requires || []) {
    const [name, ...args] = rule.split(':');
    const checker = ACTION_REQUIREMENT_CHECKERS[name];
    if (!checker) { console.warn(`Unknown action requirement checker: ${name}`); continue; }
    const result = checker(ctx, ...args);
    if (result !== true) return { ok: false, reason: result };
  }
  return { ok: true, reason: null };
}

// --- executeAction: the single chokepoint for a registered verb.
// Decomposed into named steps to respect the 40-line-per-function
// convention. Applies effects directly via applyEffects, bypassing
// validateEffects — this is the trusted-producer path (see EFFECTS' file
// header): the effect list is config-authored (even when computed at
// runtime by buildEffects), not user input, so the LLM-facing magnitude
// caps don't apply to it.
//
// `def.prepare(ctx)` (optional) computes shared runtime data ONCE — e.g.
// self.cook picking which recipe is actually available — and passes the
// result to both `buildEffects` and a dynamic narration builder, so the
// same recipe pick can't disagree between what happened and what got
// said about it. Actions that don't need this (the four simple ones)
// leave `prepare`/`buildEffects` unset and keep using the static
// `effects`/`narration.templates` shape from P0. ---
async function executeAction(actionId, gameState, actorId) {
  const def = ACTION_DEFS[actionId];
  if (!def) return { ok: false, reason: 'Unknown action.' };
  const ctx = buildActionContext(gameState, actorId);
  const actor = actionActor(gameState, actorId);

  const check = checkRequirements(def, ctx);
  if (!check.ok) return { ok: false, reason: check.reason, ticksSpent: 0 };

  const prepared = def.prepare ? await def.prepare(ctx) : null;
  // A prepare() that presented a choice and got cancelled (self.cook's
  // recipe picker) must abort the whole action before any effects, time,
  // or ingredient consumption happens — executeAction returns a cancelled
  // result and the caller (runRegisteredAction) exits silently.
  if (prepared && prepared.cancelled) return { ok: false, reason: null, cancelled: true, ticksSpent: 0 };
  const effectLines = def.buildEffects ? def.buildEffects(ctx, prepared) : [...(def.effects || [])];
  // Skill XP is declarative (def.skill), not something buildEffects has to
  // remember to emit itself — checkRequirements already guaranteed the
  // action is actually happening by the time we get here, so awarding it
  // unconditionally is correct, not a "gained XP for nothing" risk.
  if (def.skill) effectLines.push(`ADD_SKILL_XP ${def.skill.id} ${def.skill.xp}`);
  const effects = effectLines.map(line => parseEffectDSL(line)[0]).filter(Boolean);
  const effCtx = buildEffectContext(gameState, [], ctx.presentNpcIds, ctx.roomObjects, actor ? (actor.inventory || []) : []);
  applyEffects(effects, effCtx);

  // Phase 7 (D7): an action that dirtied a room's objects (SET_OBJECT_STATE
  // on a dirtyWhen-carrying object — cooking a stove, a shared meal on the
  // dining table) must recompute the room's DERIVED cleanliness. This is
  // the refresh hook the WORLD doc planned for P2 but that was never
  // wired — without it a dirty table LOOKS cluttered but the room still
  // reads clean to the mood/cleanliness systems. Scoped to the rooms the
  // action actually touched, deduped (a meal that dirties one object is
  // one recompute, not N).
  const touchedRooms = new Set();
  for (const eff of effects) {
    if (eff.type === 'SET_OBJECT_STATE') {
      const obj = findObjectById(gameState, eff.params?.objId);
      if (obj && obj.bucket?.startsWith('room_')) touchedRooms.add(obj.bucket.slice('room_'.length));
    }
  }
  for (const roomId of touchedRooms) refreshRoomCleanliness(gameState, roomId);

  // Phase 5: meter utility usage for actions that consume utilities. The
  // `meters` field on an ACTION_DEFS entry is a list of [meterKey, amount]
  // pairs — e.g. self.shower meters water + water heating. This is the
  // player-side metering; NPC drives meter in drives.js.
  if (def.meters) {
    for (const [key, amt] of def.meters) {
      recordUtilityUsage(gameState, key, amt);
    }
  }

  // Perception plan Phase 3: the player is audible too. Same declarative
  // `emitsSignal: { signal, intensity }` field the DRIVE_DEFS entries carry,
  // so an NPC showering and the player showering produce the same sound —
  // which is what Plan 3 needs in order for an NPC to react to the player
  // being somewhere without a bespoke check for each case.
  if (def.emitsSignal) {
    emitTransient(gameState, {
      id: def.emitsSignal.signal,
      roomId: actor?.location ?? ctx.roomId,
      intensity: def.emitsSignal.intensity,
      sourceId: actorId || 'player',
    });
  }

  // Phase 9: decay facility condition for gated actions. Find which
  // facility this action requires and decay it. A tier drop is rare
  // (condition starts at 100, decays 1.5/use) but when it happens the
  // action may stop being available until the facility is repaired.
  if (def.requires) {
    for (const req of def.requires) {
      if (typeof req !== 'string') continue;
      if (req.startsWith('facilityFunctional:')) {
        // Direct facility reference: 'facilityFunctional:kitchen_stove'
        const facilityId = req.split(':')[1];
        const dropped = decayFacilityCondition(gameState, facilityId);
        if (dropped) {
          const facDef = FACILITY_DEFS[facilityId];
          addLogEntry('system', `The ${facDef?.label || facilityId} has worn out and needs repair.`);
        }
      } else if (req.startsWith('facilityFunctionalHere:')) {
        // Room-inferred facility: 'facilityFunctionalHere:self.shower'
        // Look up which facility in the actor's current room gates
        // this action, and decay that facility.
        const actionId = req.split(':')[1];
        const roomId = ctx.roomId;
        const facilityIds = (typeof ROOM_FACILITIES !== 'undefined' && ROOM_FACILITIES[roomId]) || [];
        for (const fid of facilityIds) {
          const facDef = FACILITY_DEFS[fid];
          if (!facDef?.gatesActions?.includes(actionId)) continue;
          const dropped = decayFacilityCondition(gameState, fid);
          if (dropped) {
            addLogEntry('system', `The ${facDef.label} has worn out and needs repair.`);
          }
          break; // only decay the first matching facility
        }
      }
    }
  }

  const minutes = resolveTimeCost(def, gameState, prepared, actorId);

  // Initiative plan Phase 5 (D16/D17): the same act, with somebody in it with
  // you. Declarative off `def.shared`, like `meters` and `emitsSignal` above.
  // Resolved BEFORE the clock advances, and off the `ctx` built at the top of
  // this function: the participants are the people who were here when it
  // started, not whoever wandered in while it ran.
  const shared = resolveSharedActivity(gameState, def, ctx, minutes);

  // Declaring `vulnerableState` on an action is all it takes for the NPC
  // peep system (DRIVES/STEALTH) to be able to catch the player mid-action:
  // the flag is live for exactly the ticks this action resolves, which is
  // the window during which the player is actually exposed. Cleared in a
  // finally so a throw mid-resolve can't strand the player permanently
  // "showering" — the failure mode the old location-inference version had
  // by construction.
  const ticks = await withVulnerableState(gameState, def.vulnerableState, () => advanceAndResolveMinutes(minutes));

  return { ok: true, ticksSpent: ticks, minutesSpent: minutes, shared, narration: narrateAction(def, ctx, prepared, shared) };
}

// Runs `fn` with gameState.player.flags._vulnerableState set, restoring
// whatever was there before (normally nothing) afterward. A null/undefined
// state is a no-op passthrough, so non-private actions pay nothing.
async function withVulnerableState(gameState, state, fn) {
  if (!state) return fn();
  const flags = gameState.player.flags || (gameState.player.flags = {});
  const previous = flags._vulnerableState;
  flags._vulnerableState = state;
  try {
    return await fn();
  } finally {
    // currentGameState may have been replaced by resolveBatch during fn,
    // so restore on the live player object, not the captured one.
    const liveFlags = (typeof currentGameState !== 'undefined' && currentGameState?.player?.flags) || flags;
    if (previous === undefined) delete liveFlags._vulnerableState;
    else liveFlags._vulnerableState = previous;
  }
}

// Base time cost in game-minutes. Supports:
// - `base` (number): flat minutes (legacy: if the whole timeCost is a
//   bare number, it's minutes)
// - `byItemCategory` (true): the picked item's category via
//   INVENTORY_TUNING.useTimeMinutes (Phase 3 self.eat — the item is in
//   `prepared.option.def`)
// - `skill`/`curve` (string): shrinks the base by a skill curve — e.g.
//   { base: 20, skill: 'cooking', curve: 'timeReduction', min: 15 }
//   means 20 min minus up to 50% at max cooking level, floored at 15
// - `perIngredient` (number): adds N minutes per ingredient in the recipe
//   picked by `prepare()` (the prepared result must include `recipe`)
// - `perDirtyDish` (number): adds N minutes per dirty-dish level — reads
//   the sink's dishes state ('clean'=0, 'few'=1, 'many'=2)
// - `max`/`min` (number): clamp
// `prepare()` data (prepared) is passed as the 3rd arg so perIngredient
// can read the recipe pick.
//
// `skillBonus`/`skillId` (a flat per-level delta) and `compute` (an escape
// hatch taking a function) were declared here and used by no action.
// skillBonus was a second, weaker way to say what skill/curve already says,
// and `compute` put a function in what is otherwise pure data — the thing
// this whole registry exists to avoid. Both removed; add them back if a
// real action needs them.
function resolveTimeCost(def, gameState, prepared, actorId) {
  const tc = def.timeCost;
  if (typeof tc === 'number') return Math.max(1, tc);
  let minutes = tc.base ?? 0;

  // Inventory overhaul Phase 3: self.eat's time is the eaten item's
  // category — drink 5 / snack 10 / food 10 / full meal 25 — reading
  // INVENTORY_TUNING.useTimeMinutes, the SAME table the inventory
  // panel's Use verb reads, so the Eat chip and the panel can never
  // disagree about how long eating takes.
  if (tc.byItemCategory) {
    // The eaten item's category when a pick exists (the player path); the
    // table's _default when resolving for an actor before anything has been
    // picked (the NPC commitment-resolution path, continuous-behavior-engine
    // Phase 3) — the category is only knowable at execution time, and 1
    // minute would be a lie either way.
    minutes = prepared?.option?.def
      ? (INVENTORY_TUNING.useTimeMinutes[prepared.option.def.category] ?? INVENTORY_TUNING.useTimeMinutes._default)
      : INVENTORY_TUNING.useTimeMinutes._default;
  }

  if (tc.perIngredient && prepared?.recipe) {
    minutes += (prepared.recipe.ingredients?.length || 0) * tc.perIngredient;
  }
  if (tc.perDirtyDish) {
    const sink = Object.values((gameState.objects && gameState.objects['room_kitchen']) || {})
      .find(o => o.defId === 'sink_kitchen');
    const dishLevel = sink?.state?.dishes;
    const level = dishLevel === 'many' ? 2 : dishLevel === 'few' ? 1 : 0;
    minutes += level * tc.perDirtyDish;
  }
  if (tc.skill && tc.curve) {
    // Whose skill shrinks the time is the actor's — the player for today's
    // path, whatever NPC the action engine generalizes to next.
    const actor = actionActor(gameState, actorId);
    const mod = skillMod(actor, tc.skill, tc.curve);
    minutes = minutes * mod;
  }

  if (tc.max != null) minutes = Math.min(minutes, tc.max);
  if (tc.min != null) minutes = Math.max(minutes, tc.min);
  return Math.max(1, Math.round(minutes));
}

// --- Anchor resolution (continuous-behavior-engine Phase 3, D2/C3) --------
// Where an ACTION_DEFS commitment's effects anchor. C3's answer: `source`
// resolves to a stand-point — the source OBJECT when one exists, a PLACED
// decor object the activity prefers (ACTION_ANCHOR_OBJS, defs.actions.js),
// or the room's centroid when neither exists (C5: an empty room is genuinely
// inert, and the room-centroid is the generic room-center idle it degrades
// to). A base fixture with no recorded coordinate still names the anchor
// (objId) but contributes its room's centroid as the stand-point, which is
// exactly "no couch → generic room-center idle" until a sofa is bought,
// delivered and placed — the decor-economy worked example.
//
// `point` is apartment-wide floor-plan space (ROOM_LAYOUT's space — the same
// space placeDecorItem writes pos in and roomCentre returns), so Phase 4's
// physical layer can walk to it without a coordinate conversion.
//
// Deterministic and pure: reads gameState.objects / ROOMS / config only — no
// rng, no clock, no model. Returns { roomId, objId, point } or null when no
// room can be resolved (an object-sourced action whose object does not exist
// anywhere, i.e. an action that is genuinely not available).
function objectSourceDefIds(source) {
  return source.objDefs ? [...source.objDefs] : (source.objDef ? [source.objDef] : []);
}

function roomsContainingObject(gameState, source) {
  const ids = objectSourceDefIds(source);
  const rooms = [];
  for (const [bucket, bucketMap] of Object.entries(gameState.objects || {})) {
    if (!bucket.startsWith('room_')) continue;
    if (Object.values(bucketMap).some(o => ids.includes(o.defId))) rooms.push(bucket.slice('room_'.length));
  }
  return rooms;
}

function resolveActionAnchor(gameState, actionId, actorId) {
  const def = ACTION_DEFS[actionId];
  if (!def || !gameState) return null;
  const actor = actionActor(gameState, actorId);

  // Candidate rooms the action can anchor in, from its source. 'room' names
  // them directly; 'object' derives them from wherever an instance lives; a
  // 'self' action anchors wherever the actor is standing.
  let rooms = [];
  if (def.source.kind === 'room') rooms = def.source.roomIds;
  else if (def.source.kind === 'object') rooms = roomsContainingObject(gameState, def.source);
  else if (def.source.kind === 'self' && actor?.location) rooms = [actor.location];

  // Deterministic pick: the actor's own room when it is one of the
  // candidates (that is where the action is already happening), else the
  // source's first room. Phase 4's physical layer owns which candidate is
  // NEAREST; this phase resolves the anchor, not the route.
  const actorRoom = actor?.location;
  const roomId = rooms.includes(actorRoom) ? actorRoom : rooms[0];
  if (!roomId || !ROOMS[roomId]) return null;

  const bucket = (gameState.objects && gameState.objects[`room_${roomId}`]) || {};
  // The defIds that make a good stand-point for THIS action: the source
  // object itself, then the decor/anchor preference table.
  const wanted = def.source.kind === 'object'
    ? objectSourceDefIds(def.source)
    : (ACTION_ANCHOR_OBJS[actionId] || []);

  let bestObj = null;
  if (wanted.length > 0) {
    for (const obj of Object.values(bucket)) {
      if (!wanted.includes(obj.defId)) continue;
      // Prefer a PLACED object (it has a real coordinate); a base object
      // with no pos still names the anchor but contributes its room's
      // centroid. Object values are iterated in bucket insertion order,
      // which is deterministic for a given save (seeded ids).
      if (!bestObj || (obj.pos && !bestObj.pos)) bestObj = obj;
      if (obj.pos) break;
    }
  }

  if (bestObj?.pos) {
    return {
      roomId,
      objId: bestObj.id,
      point: { x: bestObj.pos.x + bestObj.pos.w / 2, y: bestObj.pos.y + bestObj.pos.h / 2 },
    };
  }
  const [cx, cy] = roomCentre(roomId);
  return { roomId, objId: bestObj ? bestObj.id : null, point: { x: cx, y: cy } };
}

// --- Action commitment resolution (continuous-behavior-engine Phase 3) ----
// The full answer to "an NPC commits to an ACTION_DEFS id": a real duration
// (reusing resolveTimeCost, skill-aware for the actor) and a resolved anchor
// (via source, decor-extended, room-centroid fallback). This is the record
// shape the plan's Data model names a kind:'action' commitment from —
// openCommitment (cognition.js) consumes exactly this result. Pure and
// deterministic: no rng, no clock, no model.
function resolveActionCommitment(gameState, actionId, actorId) {
  const def = ACTION_DEFS[actionId];
  if (!def || !gameState) return null;
  const durationMinutes = resolveTimeCost(def, gameState, null, actorId);
  const anchor = resolveActionAnchor(gameState, actionId, actorId);
  if (!anchor) return null;
  return { id: actionId, kind: 'action', durationMinutes, anchor };
}

// --- Shared activities (initiative plan Phase 5, D16/D17) -------------------
// Everything in Plan 5 up to here is an NPC reaching for the player. This is
// the player's own verbs becoming things you can do WITH someone instead of
// next to them — and D17 makes that a `shared` field on the ten ACTION_DEFS
// entries that already exist rather than ten more entries to keep in step.
//
// Resolution lives here beside `meters` and `emitsSignal` rather than inside
// ten `buildEffects` closures, for the same reason those two do: who is in the
// room is not a question the ten entries should each answer for themselves.

// Who is actually IN it with you. Residents only — a guest or a booked escort
// standing in the room is not somebody you spent an evening with, and letting
// them count would turn a visit into an affection tap. Sleepers and showerers
// are excluded through SHARED_ACTIVITY.excludeActivities rather than an inline
// string test; the registry's comment says why.
//
// Pure. Read by resolveSharedActivity AND by DEFS.ACTIONS'
// presentResidentAffection, so the mood impulse and D16's consequences can
// never acquire two different ideas of "together".
function sharedActivityParticipants(ctx) {
  const out = [];
  for (const id of ctx?.presentNpcIds || []) {
    const npc = ctx.gameState?.npcs?.[id];
    if (!npc || npc.residency?.status !== 'resident') continue;
    if (SHARED_ACTIVITY.excludeActivities.includes(npc.activity || '')) continue;
    out.push(id);
  }
  return out;
}

// How many of this activity's minutes still buy relationship today. Past the
// cap the time is still shared — the fact is still written, the narration still
// names them — it just stops paying, which is what makes D16's "shared time
// does not dominate" structural rather than a hope about the player. Pure.
function sharedActivityCredit(npc, day, minutes) {
  const rec = (npc && npc.flags && npc.flags._sharedActivity) || null;
  const used = (rec && rec.day === day) ? (rec.minutes || 0) : 0;
  const credited = Math.max(0, Math.min(minutes, SHARED_ACTIVITY.dailyCreditMinutes - used));
  return { credited, used };
}

// The delta this activity pays for `minutes` of it, from the named rate the
// entry declares. Fails closed on an unnamed or unknown rate (D23/D29's shape):
// an entry that names a tier nobody authored pays nothing, rather than
// defaulting to the most generous one on the table. Pure.
function sharedActivityDelta(def, minutes) {
  const rate = SHARED_ACTIVITY.rates[def?.shared?.rate];
  if (!rate || !(minutes > 0)) return null;
  const out = {};
  for (const [axis, perHour] of Object.entries(rate)) out[axis] = perHour * minutes / 60;
  return out;
}

// D16, both halves, and the ONE writer of either. Mutates gameState.npcs the
// way UI's applyOvertureRefusal does — addMemoryFact and applyRelDelta both
// return new NPCs, so the assignment is the write.
//
// The fact is minted at most ONCE per activity per NPC. The first evening in
// front of the TV together is the thing that gets remembered; the thirtieth is
// what the delta is for. That bounds this source at one fact per shareable
// entry by construction, which is the property D24/D25 settled on in Phase 2 —
// bounded rather than throttled.
// `withIds` rather than `participants`, deliberately. An episode's and an
// event's `participants` are a different list under different rules — they
// include the player, and SIM's stampEventParticipants is their single writer
// (verify-i2 scans for a second one across every file). Two lists with one
// name is how a later reader passes one where the other was meant.
function resolveSharedActivity(gameState, def, ctx, minutes) {
  const result = { withIds: [], credited: {}, facts: [] };
  if (!def || !def.shared || !gameState) return result;
  const ids = sharedActivityParticipants(ctx);
  if (ids.length === 0) return result;
  const day = gameState.meta.clock.day;
  result.withIds = ids;

  for (const id of ids) {
    let npc = gameState.npcs[id];
    if (!npc) continue;
    const text = String(def.shared.fact || '').replace('{name}', npc.bible?.name || 'your roommate');
    // Exact-text dedupe is safe here where D25's repetition rule needed a tag:
    // this string is rendered deterministically from the entry's own template
    // and a name that does not change, so the same activity always produces
    // the same fact. D25's exemplar episode did not.
    if (text && !(npc.memory?.facts || []).some(f => f && f.text === text)) {
      npc = addMemoryFact(npc, {
        text, day,
        importance: MEMORY_IMPORTANCE[SHARED_ACTIVITY.factImportance],
        category: SHARED_ACTIVITY.factCategory,
        provenance: 'witnessed',
        confidence: SHARED_ACTIVITY.factConfidence,
        emotionalTag: SHARED_ACTIVITY.factEmotionalTag,
      });
      result.facts.push({ npcId: id, text });
    }

    const { credited, used } = sharedActivityCredit(npc, day, minutes);
    const delta = sharedActivityDelta(def, credited);
    if (delta) {
      npc = applyRelDelta(npc, delta, day);
      npc.flags = { ...(npc.flags || {}), _sharedActivity: { day, minutes: used + credited } };
    }
    result.credited[id] = credited;
    gameState.npcs[id] = npc;
  }
  return result;
}

// "Victor" / "Victor and Bruno" / "Victor, Bruno and Neve" — the {name} the
// shared templates substitute. A shared activity with two roommates in the room
// is one activity with two people in it, not two narrations.
function sharedActivityNames(gameState, ids) {
  const names = ids.map(id => gameState?.npcs?.[id]?.bible?.name || 'your roommate');
  if (names.length <= 1) return names[0] || 'your roommate';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function narrateAction(def, ctx, prepared, shared) {
  // D17's two-person version, and it wins over the solo line — dynamic or
  // templated — because who was in the room is the thing the narration most
  // has to reflect. Putting it in front of the dynamic branch is also what
  // keeps the ten entries uniform: a builder that had to ask would be the
  // eleventh copy of the question sharedActivityParticipants already answers.
  const withIds = shared?.withIds || [];
  if (withIds.length > 0 && def.shared?.templates?.length) {
    const lines = def.shared.templates;
    return lines[Math.floor(orbitalRandom() * lines.length)]
      .replace('{name}', sharedActivityNames(ctx.gameState, withIds));
  }
  if (def.narration?.mode === 'dynamic' && def.narration.build) return def.narration.build(ctx, prepared);
  const templates = def.narration?.templates || ['You do it.'];
  return templates[Math.floor(orbitalRandom() * templates.length)];
}

// --- UI-facing wrapper: mirrors the existing doX() convention (loading
// state, render, save-at-boundary) so a registered action is a drop-in
// replacement for a hand-written doX(). Called from UI's handleAction. ---
async function runRegisteredAction(actionId) {
  showLoading();
  // Phase 7 (D7): a set_meal that HAPPENED is the moment a scheduled meal
  // commitment in the player's room becomes 'held' — captured BEFORE the
  // action so a late dinner that ends just past the window still counts
  // (executeAction advances the clock by the action's minutes). Eating a
  // solo snack in the dining room during someone's dinner window is NOT
  // the same thing, so only set_meal marks.
  const mealCommitments = actionId === 'set_meal'
    ? activeMealCommitmentsInRoom(currentGameState, currentGameState.player.location)
    : [];
  try {
    const result = await executeAction(actionId, currentGameState);
    // A cancelled choice (e.g. closing the recipe picker) aborts silently —
    // no system-log line, no narration, no save.
    if (result.cancelled) return;
    if (!result.ok) { addLogEntry('system', result.reason || "You can't do that right now."); return; }
    addLogEntry('narration', result.narration);
    if (actionId === 'set_meal') {
      for (const c of mealCommitments) c.status = 'held';
    }
    // Phase 8: working out grows the energy ceiling (energyMax). This is
    // the exercise path to a higher daily work capacity — the other path
    // is sleep consistency (handled in doSleep).
    if (actionId === 'self.workout' && currentGameState.player.energyMax) {
      currentGameState.player.energyMax = Math.min(
        ENERGY.absoluteMax,
        currentGameState.player.energyMax + ENERGY.growthPerWorkout
      );
    }
    // Chain quest progress: check if this action type completes a step
    const def = ACTION_DEFS[actionId];
    const actionType = actionId.split('.').pop();
    if (actionType === 'cook' || actionType === 'watch_tv') {
      // Check all NPCs for chain quests with matching steps
      for (const npcId of Object.keys(currentGameState.npcs)) {
        checkChainQuestProgress(actionType, npcId);
      }
    }
    render(currentGameState, currentSceneState);
    await saveAtBoundary(actionId, currentGameState);
  } finally {
    hideLoading();
  }
}

// ===== /SECTION: ACTIONS =====
