// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 1B: Stealth, detection & covert acts (D32-D36).
//
//   node src/src/dev/verify/verify-aa-p1b.js
//
// Node coverage for everything pure in this phase: the XP wiring into the
// three already-shipped mechanics (D32), the new pickpocket resolver (D33),
// the D36 cover-tracks suspicion window, the Sneaking footstep suppression
// (D34), and the explicit phone-snoop photo branch's DECISION half (D35).
// Presentation (the Sneaking chip, the pickpocket/cover-tracks chips, the
// actual phone-photo pixels) is UI/image-generation and is verified on the
// live page per invariant 7 — see the Handoff note for what was checked
// there. This harness only proves what a Node vm can prove.
const { loadEngine } = require('./loadgame.js');
// image.js deliberately NOT in `required`: it has a real, pre-existing,
// out-of-scope-for-this-phase bug (an unconditional top-level
// window.addEventListener('resize', ...) around image.js:2574, with no
// existing harness's `required` list catching it either) that throws in
// this bare vm. That throw does not cost us anything here — function
// DECLARATIONS hoist before any top-level statement in the script runs, so
// buildPhoneSnoopPhotoPrompt/buildVisualCharacterClause are still defined in
// the context by the time this harness calls them; only code that would run
// AFTER that line at image.js's own top level would be missing, and none of
// what section 8 needs is.
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'signals.js', 'effects.js', 'skills.js', 'stealth.js', 'computer.js', 'npc.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260831, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  // Give the player a stealth skill LEVEL directly (not raw xp), reusing the
  // real curve so the harness never hardcodes a chance number by hand.
  __setStealthLevel = (g, level) => {
    g.player.skills = g.player.skills || {};
    // sqrt(xp/base) = level  =>  xp = level^2 * base, +1 to clear the floor.
    g.player.skills.stealth = level * level * SKILLS.xpPerLevelBase + 1;
  };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — tuning constants exist (nothing magic outside CONFIG)');
const reg = J(`({
  xpCleanSneak: STEALTH_TUNING.xpCleanSneak,
  xpPeepClean: PEEP_TUNING.xpClean,
  xpPhoneUnwitnessed: PHONE_SNOOP_TUNING.xpUnwitnessed,
  explicitPhotoChance: PHONE_SNOOP_TUNING.explicitPhotoChance,
  pickpocket: PICKPOCKET_TUNING,
  hasAwardSkillXp: typeof awardSkillXp === 'function',
  hasResolvePickpocket: typeof resolvePickpocket === 'function',
  hasCoverTracks: typeof resolveCoverTracks === 'function',
  hasEmitPlayerFootsteps: typeof emitPlayerFootsteps === 'function',
})`);
check('STEALTH_TUNING.xpCleanSneak is a positive number', reg.xpCleanSneak > 0);
check('PEEP_TUNING.xpClean is a positive number', reg.xpPeepClean > 0);
check('PHONE_SNOOP_TUNING.xpUnwitnessed is a positive number', reg.xpPhoneUnwitnessed > 0);
check('PHONE_SNOOP_TUNING.explicitPhotoChance is a real probability, and the SFW find stays the default (< 0.5)', reg.explicitPhotoChance > 0 && reg.explicitPhotoChance < 0.5);
check('PICKPOCKET_TUNING carries a full tuning table', reg.pickpocket.baseDetectionChance > 0 && reg.pickpocket.sneakingDetectionMultiplier < 1 && reg.pickpocket.xpClean > 0);
check('awardSkillXp / resolvePickpocket / resolveCoverTracks / emitPlayerFootsteps are all real functions', reg.hasAwardSkillXp && reg.hasResolvePickpocket && reg.hasCoverTracks && reg.hasEmitPlayerFootsteps);

// ---------------------------------------------------------------- 1
console.log('\n1. D32 — resolveRoomEntryStealth: XP on a clean sneak, never on witnessed/caught');
// One persistent house throughout — resolveRoomEntryStealth's own rng key
// folds in (day, tick, roomId), so varying gameState.meta.clock.day between
// calls gets independent draws without ever needing a second generated
// house (whose npc ids are seed-hashed and would not be this owner at all).
const g1 = J(`(() => {
  const g = __mk(11);
  const ids = __ids(g);
  const ownerId = ids[0];
  const roomId = g.npcs[ownerId].residency.room;

  // Absent + minimum skill: successChance = SKILL_CURVES.stealthSuccess[0] =
  // 0.25, so most days land CAUGHT. Scan a few days for one that does, to
  // prove the caught branch specifically awards nothing.
  g.npcs[ownerId].location = 'living_room';
  __setStealthLevel(g, 0);
  let caughtDelta = null;
  for (let day = 1; day <= 30 && caughtDelta === null; day++) {
    g.meta.clock = { ...g.meta.clock, day };
    const beforeXp = g.player.skills.stealth || 0;
    const r = resolveRoomEntryStealth(g, roomId);
    if (r.result && r.result.applied && r.result.applied.some(a => a.type === 'ADJUST_SUSPICION')) {
      caughtDelta = (g.player.skills.stealth || 0) - beforeXp;
    }
  }

  // Absent + maxed skill: successChance = stealthSuccess[10] = 0.94, so
  // almost every day is a clean sneak — find one and confirm XP landed.
  __setStealthLevel(g, 10);
  let cleanDelta = null, cleanDay = null;
  for (let day = 101; day <= 130 && cleanDelta === null; day++) {
    g.meta.clock = { ...g.meta.clock, day };
    const beforeXp = g.player.skills.stealth || 0;
    const r = resolveRoomEntryStealth(g, roomId);
    const noConsequence = !(r.result && r.result.applied && r.result.applied.length > 0);
    if (noConsequence) { cleanDelta = (g.player.skills.stealth || 0) - beforeXp; cleanDay = day; }
  }

  // Witnessed: owner physically in their own room — no roll, no XP, ever.
  // Run this LAST and re-fetch the npc fresh: WITNESS's applier
  // (addMemoryEpisode) replaces gameState.npcs[ownerId] with a new object
  // rather than mutating in place, same as effects.js's other memory
  // writers — a cached npc/owner reference from earlier in this IIFE would
  // silently desync from the live one the moment that fires.
  g.npcs[ownerId].location = roomId;
  const beforeWitness = g.player.skills.stealth || 0;
  resolveRoomEntryStealth(g, roomId);
  const witnessedDelta = (g.player.skills.stealth || 0) - beforeWitness;

  return { witnessedDelta, caughtDelta, cleanDelta, cleanDay, xpCleanSneak: STEALTH_TUNING.xpCleanSneak };
})()`);
check('a direct witness (owner present) awards no stealth XP at all — no roll, nothing to reward', g1.witnessedDelta === 0);
check('a caught sneak (owner absent, roll failed) awards no stealth XP', g1.caughtDelta === 0, `caughtDelta=${g1.caughtDelta}`);
check('a clean sneak (owner absent, roll succeeded) awards exactly STEALTH_TUNING.xpCleanSneak', g1.cleanDelta === g1.xpCleanSneak, `cleanDelta=${g1.cleanDelta} want=${g1.xpCleanSneak} day=${g1.cleanDay}`);

// ---------------------------------------------------------------- 2
console.log('\n2. D32, measured example — a fresh player crosses a real stealthSuccess level boundary within a reasonable number of clean sneaks');
const g2 = J(`(() => {
  const before = { level: skillLevel({ skills: {} }, 'stealth'), mod: skillMod({ skills: {} }, 'stealth', 'stealthSuccess') };
  const player = { skills: {} };
  let sneaks = 0;
  // Level 1 needs 40 xp (SKILLS.xpPerLevelBase). Bail out well before this
  // could ever be an infinite loop — the real point is confirming it takes
  // a SMALL, plausible number of sneaks, not that it eventually happens.
  while (skillLevel(player, 'stealth') < 1 && sneaks < 20) {
    awardSkillXp(player, 'stealth', STEALTH_TUNING.xpCleanSneak, 1);
    sneaks++;
  }
  const after = { level: skillLevel(player, 'stealth'), mod: skillMod(player, 'stealth', 'stealthSuccess') };
  return { before, after, sneaks, xp: player.skills.stealth };
})()`);
check('a fresh player starts at stealthSuccess level 0', g2.before.level === 0 && g2.before.mod === 0.25);
check('clean sneaks alone cross the level-1 boundary', g2.after.level >= 1);
check(`...within a reasonable number of sneaks (got ${g2.sneaks}, ${g2.xp} xp)`, g2.sneaks > 0 && g2.sneaks <= 10);
check('...and stealthSuccess itself measurably rose (0.25 -> higher)', g2.after.mod > g2.before.mod);

// ---------------------------------------------------------------- 3
console.log('\n3. D32 — resolvePeep: XP on the clean/unwitnessed branch, never on caught');
// Same approach as section 1: one persistent house/target, vary
// gameState.meta.clock.day (resolvePeep's rng key folds it in) rather than
// regenerating houses whose npc ids would not even be this target.
const g3 = J(`(() => {
  const g = __mk(31);
  const ids = __ids(g);
  const targetId = ids[0];
  const target = g.npcs[targetId];
  const roomId = target.residency.room;
  target.location = roomId;

  // Caught branch: awake target (detectionNpcAwake=0.6 baseline), min skill.
  target.activity = 'reading in bed';
  __setStealthLevel(g, 0);
  let caughtDelta = null;
  for (let day = 1; day <= 30 && caughtDelta === null; day++) {
    g.meta.clock = { ...g.meta.clock, day };
    const beforeXp = g.player.skills.stealth || 0;
    const r = resolvePeep(g, roomId);
    if (r.ok && r.caught) caughtDelta = (g.player.skills.stealth || 0) - beforeXp;
  }

  // Clean branch: asleep target (detectionNpcAsleep=0.1) + maxed skill.
  target.activity = 'sleeping';
  __setStealthLevel(g, 10);
  let cleanDelta = null;
  for (let day = 101; day <= 130 && cleanDelta === null; day++) {
    g.meta.clock = { ...g.meta.clock, day };
    const beforeXp = g.player.skills.stealth || 0;
    const r = resolvePeep(g, roomId);
    if (r.ok && !r.caught) cleanDelta = (g.player.skills.stealth || 0) - beforeXp;
  }

  return { caughtDelta, cleanDelta, xpClean: PEEP_TUNING.xpClean };
})()`);
check('a caught peep awards no stealth XP', g3.caughtDelta === 0, `caughtDelta=${g3.caughtDelta}`);
check('an undetected peep (clean or suspected-but-unseen) awards PEEP_TUNING.xpClean', g3.cleanDelta === g3.xpClean, `cleanDelta=${g3.cleanDelta} want=${g3.xpClean}`);

// ---------------------------------------------------------------- 4
console.log('\n4. D33 — resolvePickpocket: clean take transfers the item + awards XP, caught takes nothing');
// One persistent house/target again; resolvePickpocket's rng key folds in
// (day, tick, targetId), so varying the day gets independent draws. The
// target's inventory is replenished every attempt — a clean take really
// does consume the stack (MOVE_ITEM), so the next call needs a fresh one.
const g4 = J(`(() => {
  const g = __mk(41);
  const ids = __ids(g);
  const targetId = ids[0];
  const target = g.npcs[targetId];
  target.location = g.player.location;
  target.inventory = [];
  const noItem = resolvePickpocket(g, targetId);

  // Caught: min skill — baseDetectionChance alone (0.5) already favours it.
  __setStealthLevel(g, 0);
  let caughtResult = null;
  for (let day = 1; day <= 30 && caughtResult === null; day++) {
    g.meta.clock = { ...g.meta.clock, day };
    target.inventory = [{ defId: 'eggs', qty: 3 }];
    const beforeXp = g.player.skills.stealth || 0;
    const r = resolvePickpocket(g, targetId);
    if (r.ok && r.caught) caughtResult = { xp: (g.player.skills.stealth || 0) - beforeXp, invQty: (target.inventory[0] || {}).qty };
  }

  // Clean: maxed skill.
  __setStealthLevel(g, 10);
  g.player.inventory = [];
  let cleanResult = null;
  for (let day = 101; day <= 130 && cleanResult === null; day++) {
    g.meta.clock = { ...g.meta.clock, day };
    target.inventory = [{ defId: 'eggs', qty: 3 }];
    const beforeXp = g.player.skills.stealth || 0;
    const r = resolvePickpocket(g, targetId);
    if (r.ok && !r.caught) cleanResult = { xp: (g.player.skills.stealth || 0) - beforeXp, playerHasEggs: g.player.inventory.some(st => st.defId === 'eggs') };
  }

  return { noItemReason: noItem.reason, caughtResult, cleanResult, xpClean: PICKPOCKET_TUNING.xpClean };
})()`);
check('pickpocketing someone with nothing takeable refuses cleanly', typeof g4.noItemReason === 'string' && g4.noItemReason.length > 0);
check('caught: no stealth XP, target keeps the item', g4.caughtResult && g4.caughtResult.xp === 0 && g4.caughtResult.invQty === 3, JSON.stringify(g4.caughtResult));
check('clean: PICKPOCKET_TUNING.xpClean awarded, item actually lands in the player inventory', g4.cleanResult && g4.cleanResult.xp === g4.xpClean && g4.cleanResult.playerHasEggs, JSON.stringify(g4.cleanResult));

// ---------------------------------------------------------------- 5
console.log('\n5. D34 — Sneaking measurably lowers pickpocket detection (the connective-tissue claim)');
// One persistent house/target; each of N days gives one independent
// detection roll (the rng key folds in day+targetId), run once with
// Sneaking off and once on — same draw sequence, only the multiplier differs.
const g5 = J(`(() => {
  const g = __mk(51);
  const ids = __ids(g);
  const targetId = ids[0];
  const target = g.npcs[targetId];
  target.location = g.player.location;
  __setStealthLevel(g, 0); // level 0: widest dynamic range for the multiplier to show up in
  let caughtNormal = 0, caughtSneaking = 0;
  const N = 80;
  for (let day = 1; day <= N; day++) {
    g.meta.clock = { ...g.meta.clock, day };
    for (const sneaking of [false, true]) {
      target.inventory = [{ defId: 'eggs', qty: 3 }];
      g.player.sneaking = sneaking;
      const r = resolvePickpocket(g, targetId);
      if (r.ok && r.caught) { if (sneaking) caughtSneaking++; else caughtNormal++; }
    }
  }
  return { caughtNormal, caughtSneaking, N };
})()`);
check(`Sneaking's caught count is lower across ${g5.N} identical seeds (normal=${g5.caughtNormal}, sneaking=${g5.caughtSneaking})`, g5.caughtSneaking < g5.caughtNormal);

// ---------------------------------------------------------------- 6
console.log('\n6. D36 — the cover-tracks suspicion window: opens, expires, and resolveCoverTracks relieves + clears it');
const g6 = J(`(() => {
  const g = __mk(61);
  const ids = __ids(g);
  const npcId = ids[0];
  const npc = g.npcs[npcId];

  const noneYet = resolveCoverTracks(g, npcId);

  openSuspicionWindow(g, npc, 'pickpocket');
  const openImmediately = !!activeSuspicionWindow(g, npc);

  npc.suspicion = { boundary_violation: PICKPOCKET_TUNING.suspectedSuspicionDelta };
  const before = npc.suspicion.boundary_violation;
  const covered = resolveCoverTracks(g, npcId);
  const after = npc.suspicion.boundary_violation;
  const clearedAfterUse = !activeSuspicionWindow(g, npc);
  const secondUse = resolveCoverTracks(g, npcId);

  // Expiry: open a fresh window, then jump the clock forward past it.
  openSuspicionWindow(g, npc, 'pickpocket');
  g.meta.clock = { ...g.meta.clock, minutes: g.meta.clock.minutes + CLOCK.tickMinutes * (PICKPOCKET_TUNING.coverTracksWindowTicks + 1) };
  const expiredNaturally = !activeSuspicionWindow(g, npc);

  return { noneYetOk: noneYet.ok, openImmediately, before, after, covered, clearedAfterUse, secondUseOk: secondUse.ok, expiredNaturally };
})()`);
check('no window yet -> resolveCoverTracks refuses (nothing to cover up)', g6.noneYetOk === false);
check('openSuspicionWindow -> activeSuspicionWindow sees it immediately', g6.openImmediately === true);
check('resolveCoverTracks relieves suspicion (strictly less than before)', g6.covered.ok === true && g6.after < g6.before, `before=${g6.before} after=${g6.after}`);
check('...and clears the window so it cannot be reused', g6.clearedAfterUse === true && g6.secondUseOk === false);
check('an unused window expires on its own once the clock passes it', g6.expiredNaturally === true);

// ---------------------------------------------------------------- 7
console.log('\n7. D34 — emitPlayerFootsteps: real signal when moving normally, fully suppressed while Sneaking');
const g7 = J(`(() => {
  const g = __mk(71);
  const roomId = g.player.location;
  g.world.signals = [];
  g.player.sneaking = false;
  emitPlayerFootsteps(g, roomId, false);
  const normalCount = g.world.signals.length;
  const normalIntensity = (g.world.signals[0] || {}).intensity;

  g.world.signals = [];
  g.player.sneaking = true;
  emitPlayerFootsteps(g, roomId, false);
  const sneakingCount = g.world.signals.length;

  return { normalCount, normalIntensity, sneakingCount, expectedIntensity: SIGNALS_EMIT.footstepsArrive };
})()`);
check('moving normally emits exactly one footsteps signal', g7.normalCount === 1);
check('...at the same intensity NPC movement already uses (SIGNALS_EMIT.footstepsArrive)', g7.normalIntensity === g7.expectedIntensity);
check('moving while Sneaking emits nothing at all', g7.sneakingCount === 0);

// ---------------------------------------------------------------- 8
console.log("\n8. D35 — composePhoneFind's explicit branch: mature-gated, a real sometimes not an always, no gate bypass");
const g8 = J(`(() => {
  const g = __mk(81);
  const ids = __ids(g);
  const npc = g.npcs[ids[0]];
  npc.bible = { ...npc.bible, name: 'TestNpc' };

  // Force every OTHER finding kind already-seen, so composePhoneFind's own
  // cycle (want -> wound -> blindSpot -> boundary -> relationship -> photo)
  // lands on 'photo' every single call — otherwise every draw below would
  // just return 'want' again and again, never even reaching the branch
  // this section exists to test.
  const allButPhoto = ['want', 'wound', 'blindSpot', 'boundary', 'relationship'];

  // Mature OFF: explicit must NEVER fire, whatever the roll says.
  g.meta.contentConfig = { contentFlags: { ...CONTENT_CONFIG.contentFlags, mature: false } };
  let explicitWhileOff = false;
  for (let day = 1; day <= 30; day++) {
    npc.flags = { _phoneFindsSeen: allButPhoto };
    g.meta.clock = { ...g.meta.clock, day };
    const f = composePhoneFind(npc, g);
    if (f && f.kind === 'photo' && f.explicit) explicitWhileOff = true;
  }

  // Mature ON: across enough (npc, day) draws, both branches should appear —
  // proving this is genuinely the "sometimes" branch, not always-safe or
  // always-explicit.
  g.meta.contentConfig = { contentFlags: { ...CONTENT_CONFIG.contentFlags, mature: true } };
  let sawExplicit = false, sawSafe = false;
  for (let day = 1; day <= 60; day++) {
    npc.flags = { _phoneFindsSeen: allButPhoto };
    g.meta.clock = { ...g.meta.clock, day };
    const f = composePhoneFind(npc, g);
    if (f && f.kind === 'photo') { if (f.explicit) sawExplicit = true; else sawSafe = true; }
  }

  // buildPhoneSnoopPhotoPrompt itself re-checks the gate — passing
  // explicit:true with mature OFF must still fall back to the SFW prompt
  // (defense in depth, never trusting the caller's flag alone).
  const sfwPrompt = buildPhoneSnoopPhotoPrompt(npc, { meta: { contentConfig: { contentFlags: { mature: false } } } }, true);
  const explicitPrompt = buildPhoneSnoopPhotoPrompt(npc, { meta: { contentConfig: { contentFlags: { mature: true } } } }, true);
  const defaultPrompt = buildPhoneSnoopPhotoPrompt(npc, { meta: { contentConfig: { contentFlags: { mature: true } } } }, false);

  return {
    explicitWhileOff, sawExplicit, sawSafe,
    gateRespected: sfwPrompt === defaultPrompt || !sfwPrompt.includes('intimate'),
    explicitDiffers: explicitPrompt !== defaultPrompt,
  };
})()`);
check('with mature OFF, the photo finding is never explicit, regardless of the roll', g8.explicitWhileOff === false);
check('with mature ON, both the SFW find and the explicit find actually occur across enough draws (a real sometimes-branch)', g8.sawExplicit && g8.sawSafe);
check('buildPhoneSnoopPhotoPrompt re-checks the gate itself — explicit:true with mature OFF still renders the safe prompt', g8.gateRespected);
check('...but with mature ON, the explicit branch actually produces a different prompt than the SFW default', g8.explicitDiffers);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
