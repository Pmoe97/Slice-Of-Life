// ===== SECTION: DEFS.ACTIONS =====
// Declarative action registry — the data half of the action engine (see
// ACTIONS for the executor). Each entry describes: where it's available
// from (source), what gates it (requires), what it costs (timeCost), what
// it does (effects — EFFECTS-vocabulary DSL strings), and how it's
// narrated. `source.kind` is 'object'|'room'|'npc'|'self'|'item'|'app' —
// 'object' targets don't exist until WORLD (P1) lands, so every entry below
// sources from 'room' (gated on the player's current location, matching
// the old if-chain it replaces) since none of these five need a specific
// fixture yet.
//
// Porting note: only the five simplest verbs (eat/cook/shower/watch_tv/
// relax) are ported here in P0 — see renderActionChips (RENDER) and
// handleAction (UI), which now resolve/dispatch these through
// resolveAvailableActions/executeAction (ACTIONS) instead of a hardcoded
// if-chain and switch case. sleep/work/talk/move/pay-rent/ask-to-leave keep
// their hand-written UI.js implementations for now — they involve
// multi-tick batching, LLM calls, or residency mutation that fit more
// naturally once the object model (P1) and the free-action pipeline (P5)
// exist. Porting them now would mean building throwaway object-less
// special cases just to retire them again in a phase or two.

const ACTION_DEFS = {
  'self.eat': {
    id: 'self.eat', label: 'Eat', verbs: ['eat', 'snack', 'grab a bite'],
    source: { kind: 'room', roomIds: ['kitchen'] },
    group: 'kitchen', chipPriority: 30,
    requires: [],
    timeCost: { base: 1 },
    effects: [`ADJUST_NEED player hunger +${NEEDS.hunger.eatRestore}`],
    narration: { mode: 'template', templates: ['You grab something to eat. Better.'] },
  },
  'self.cook': {
    id: 'self.cook', label: 'Cook', verbs: ['cook', 'make food', 'prepare a meal'],
    source: { kind: 'room', roomIds: ['kitchen'] },
    group: 'kitchen', chipPriority: 40,
    requires: [],
    timeCost: { base: 2 },
    effects: [`ADJUST_NEED player hunger +${NEEDS.hunger.eatRestore + ACTION_TUNING.cookExtraHungerRestore}`],
    narration: { mode: 'template', templates: ['You cook a proper meal. It smells good.'] },
  },
  'self.shower': {
    id: 'self.shower', label: 'Shower', verbs: ['shower', 'wash up', 'bathe'],
    source: { kind: 'room', roomIds: ['bathroom'] },
    group: 'bathroom', chipPriority: 30,
    requires: [],
    timeCost: { base: 1 },
    effects: [`ADJUST_NEED player hygiene +${NEEDS.hygiene.washRestore}`],
    narration: { mode: 'template', templates: ['You take a shower. Refreshed.'] },
  },
  'self.watch_tv': {
    id: 'self.watch_tv', label: 'Watch TV', verbs: ['watch tv', 'watch television', 'put on a show'],
    source: { kind: 'room', roomIds: ['living_room'] },
    group: 'living_room', chipPriority: 30,
    requires: [],
    timeCost: { base: 2 },
    effects: [`ADJUST_NEED player mood +${ACTION_TUNING.tvMoodGain}`],
    narration: { mode: 'template', templates: ['You watch some TV. Mindless, relaxing.'] },
  },
  'self.relax': {
    id: 'self.relax', label: 'Relax', verbs: ['relax', 'unwind', 'chill', 'take a breather'],
    source: { kind: 'room', roomIds: ['living_room'] },
    group: 'living_room', chipPriority: 20,
    requires: [],
    timeCost: { base: 1 },
    effects: [
      `ADJUST_NEED player mood +${ACTION_TUNING.relaxMoodGain}`,
      `ADJUST_NEED player energy +${ACTION_TUNING.relaxEnergyGain}`,
    ],
    narration: { mode: 'template', templates: ['You take a moment to just breathe.'] },
  },
};

// Name→predicate registry, mirroring SIM's CAST_REQUIREMENT_CHECKERS
// (config-declared requirement names, one predicate implementation per
// name). Each checker takes (ctx, ...args) and returns true, or a string
// reason the action is currently unavailable. `requires` entries on an
// ACTION_DEFS record are 'name' or 'name:arg:arg'.
const ACTION_REQUIREMENT_CHECKERS = {
  needAbove: (ctx, need, min) => (ctx.gameState.player[need] ?? 100) >= Number(min) || `Not enough ${need}.`,
  needBelow: (ctx, need, max) => (ctx.gameState.player[need] ?? 0) <= Number(max) || `${need} is too high right now.`,
  moneyAtLeast: (ctx, amt) => ctx.gameState.player.money >= Number(amt) || `Can't afford it (need $${amt}).`,
  phaseIn: (ctx, ...phases) => phases.includes(ctx.gameState.meta.clock.phase) || 'Not the right time of day.',
  alone: (ctx) => ctx.presentNpcIds.length === 0 || 'Not alone right now.',
  roomIs: (ctx, ...roomIds) => roomIds.includes(ctx.gameState.player.location) || 'Wrong room for that.',
  skillAtLeast: (ctx, skillId, lvl) => skillLevelSafe(ctx.gameState.player, skillId) >= Number(lvl) || `Requires ${skillId} level ${lvl}.`,
  hasFlag: (ctx, who, key) => !!resolveFlagBagSafe(ctx, who)[key] || 'Conditions not met.',
};

// Guard used before SKILLS (P3) exists — skillMod/skillLevel land then;
// until this phase, every skill reads as level 0 rather than throwing a
// ReferenceError the first time a requirement references one.
function skillLevelSafe(player, skillId) {
  if (typeof skillLevel === 'function') return skillLevel(player, skillId);
  return 0;
}
function resolveFlagBagSafe(ctx, who) {
  if (who === 'player') return ctx.gameState.player.flags || {};
  return ctx.gameState.npcs[who]?.flags || {};
}

// ===== /SECTION: DEFS.ACTIONS =====
