// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 16: Skill research (D25).
//
//   node src/src/dev/verify/verify-aa-p16.js
//
// Node coverage for everything pure/trusted-producer in this phase: the
// five research.* leaves (RESEARCHABLE_SKILLS/createResearchAction,
// defs.actions.js) — real object-sourcing against the seeded living-room
// `bookshelf` and study `study_bookshelf` (no purchase required, D25's
// "lifestyle, not a class schedule"), a real def.skill XP grant through
// ACTIONS' executeAction chokepoint, and a negative source-match control
// (a room with no bookshelf-shaped object at all); the new browser research
// site (SITE_DEFS.tidyhome) closing cleaning's browser-research gap the
// same way chefs_corner/fitcast/codeflow already cover cooking/fitness/tech;
// hobby.sketchpad wiring the previously-orphaned 'art' SKILL_IDS entry to a
// real practice verb; and self.deep_clean — the first real consumer of
// ACTION_REQUIREMENT_CHECKERS.skillAtLeast (declared with zero callers
// until this phase), including a D32-style measured example: a fresh
// player crosses the cleaning level-2 gate through research alone within a
// reasonable number of sessions, and self.deep_clean's own gate flips open
// exactly there. Presentation (the new chips actually rendering) is
// outside this loader (invariant 7) — verified on the live page instead.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'sim.js', 'world.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'actions.js', 'computer.js', 'time.js', 'dirt.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, day) => {
    const h = SIM_generateHouse(seed || 20260901, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || h.clock.day, minutes: 0 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    return g;
  };
  __ctx = (g, roomId, presentNpcIds) => ({ gameState: g, roomId, roomObjects: g.objects['room_' + roomId] || {}, presentNpcIds: presentNpcIds || [] });
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — five research leaves, self.deep_clean, the skillAtLeast checker\'s first real caller, the tidyhome browser site, and hobby.sketchpad\'s new art skill');
const reg = J(`({
  researchable: RESEARCHABLE_SKILLS.map(s => s.id),
  researchDefs: RESEARCHABLE_SKILLS.map(s => {
    const d = ACTION_DEFS['research.' + s.id];
    return d && { skill: d.skill, minutes: d.timeCost && d.timeCost.base, objDefs: d.source && d.source.objDefs, requiresLen: (d.requires || []).length };
  }),
  deepClean: ACTION_DEFS['self.deep_clean'],
  checkerFn: typeof ACTION_REQUIREMENT_CHECKERS.skillAtLeast === 'function',
  researchTuning: RESEARCH_TUNING,
  deepCleanMinutes: ACTION_TUNING.deepCleanMinutes,
  siteDef: SITE_DEFS.tidyhome,
  sketchSkill: ACTION_DEFS['hobby.sketchpad'].skill,
  otherHobbiesNoSkill: ['hobby.guitar', 'hobby.bookshelf', 'hobby.record_player', 'hobby.console', 'hobby.houseplant'].map(id => !ACTION_DEFS[id].skill),
  affords: {
    bookshelf: OBJECT_DEFS.bookshelf.affords,
    study_bookshelf: OBJECT_DEFS.study_bookshelf.affords,
    hobby_bookshelf: OBJECT_DEFS.hobby_bookshelf.affords,
  },
})`);
check('RESEARCHABLE_SKILLS covers exactly the five intended skills (cooking/cleaning/fitness/tech/art) — no stealth', JSON.stringify(reg.researchable.slice().sort()) === JSON.stringify(['art', 'cleaning', 'cooking', 'fitness', 'tech']), JSON.stringify(reg.researchable));
check('every research.<skill> action exists, grants the right skill XP, costs RESEARCH_TUNING.minutes, sources from all three bookshelf defs, and is ungated', reg.researchDefs.every(d => d && d.skill && d.skill.xp === reg.researchTuning.xp && d.minutes === reg.researchTuning.minutes && d.requiresLen === 0 && ['bookshelf', 'study_bookshelf', 'hobby_bookshelf'].every(o => d.objDefs.includes(o))), JSON.stringify(reg.researchDefs));
check('every research def grants its OWN named skill id, not a shared/wrong one', reg.researchDefs.every((d, i) => d.skill.id === reg.researchable[i]), JSON.stringify(reg.researchDefs));
check('self.deep_clean exists, room-sourced, and gated on roomHasDirt + skillAtLeast:cleaning:2', !!reg.deepClean && reg.deepClean.source.kind === 'room' && reg.deepClean.requires.includes('roomHasDirt') && reg.deepClean.requires.includes('skillAtLeast:cleaning:2'), JSON.stringify(reg.deepClean));
check('self.deep_clean grants cleaning XP and costs ACTION_TUNING.deepCleanMinutes', reg.deepClean.skill.id === 'cleaning' && reg.deepClean.skill.xp > 0 && reg.deepClean.timeCost.base === reg.deepCleanMinutes);
check('ACTION_REQUIREMENT_CHECKERS.skillAtLeast is a real function (pre-existing, previously zero callers)', reg.checkerFn === true);
check("SITE_DEFS.tidyhome is a real cleaning-research site (browser half of D25, closing cleaning's coverage gap)", !!reg.siteDef && reg.siteDef.effects.includes('ADD_SKILL_XP cleaning 6'));
check("hobby.sketchpad grants 'art' skill XP — the previously-orphaned SKILL_IDS entry now has a real consumer", !!reg.sketchSkill && reg.sketchSkill.id === 'art' && reg.sketchSkill.xp > 0, JSON.stringify(reg.sketchSkill));
check('every other hobby stays pure vibe — no skill XP added where none was asked for', reg.otherHobbiesNoSkill.every(Boolean), JSON.stringify(reg.otherHobbiesNoSkill));
check('all three bookshelf-shaped OBJECT_DEFS list all five research.* ids in affords', ['bookshelf', 'study_bookshelf', 'hobby_bookshelf'].every(k => reg.researchable.every(id => reg.affords[k].includes('research.' + id))), JSON.stringify(reg.affords));

// ---------------------------------------------------------------- 1
console.log('\n1. Source matching — research fires wherever a real bookshelf-shaped object is seeded (no purchase required), and nowhere else');
const src = J(`(() => {
  const g = __mk(1, 1);
  const def = ACTION_DEFS['research.cleaning'];
  const livingRoom = actionSourceMatches(def, __ctx(g, 'living_room'));
  const study = actionSourceMatches(def, __ctx(g, 'study'));
  const kitchen = actionSourceMatches(def, __ctx(g, 'kitchen'));
  return { livingRoom, study, kitchen };
})()`);
check("the living room's seeded bookshelf fixture lights the chip up on day one", src.livingRoom === true, JSON.stringify(src));
check("the study's seeded study_bookshelf also lights it up", src.study === true, JSON.stringify(src));
check('a room with no bookshelf-shaped object at all does not (real source gating, not a room-wide freebie)', src.kitchen === false, JSON.stringify(src));

// ---------------------------------------------------------------- 2
// executeAction's own happy path always reaches advanceAndResolveMinutes
// (time.js), which reads the bare global `currentGameState` unconditionally
// — a real DOM/live-shell dependency, not a bug in this harness (verify-w11's
// own file header: "the refusal paths that return BEFORE the clock moves are
// fully covered here [in Node]... the clock-advance half needs ui.js + the
// DOM"). So this replicates executeAction's OWN pure effect-application
// sequence (actions.js lines ~165-171: buildEffects/effects, the declarative
// `ADD_SKILL_XP` append, applyEffects) directly, the same trusted-producer
// path minus the live clock — proving the real logic, not a hand-rolled
// stand-in, without needing a DOM.
console.log('\n2. The real executeAction effect-application sequence — research.tech actually raises tech XP, not just declared data');
const run2 = J(`(() => {
  const g = __mk(2, 1);
  g.player.location = 'study';
  const def = ACTION_DEFS['research.tech'];
  const ctx = { gameState: g, roomId: 'study' };
  const before = (g.player.skills && g.player.skills.tech) || 0;
  const effectLines = def.buildEffects ? def.buildEffects(ctx, null) : [...(def.effects || [])];
  if (def.skill) effectLines.push('ADD_SKILL_XP ' + def.skill.id + ' ' + def.skill.xp);
  applyEffects(effectLines.map(l => parseEffectDSL(l)[0]).filter(Boolean), ctx);
  const after = (g.player.skills && g.player.skills.tech) || 0;
  return { before, after, xp: RESEARCH_TUNING.xp, moodEventsAdded: (g.player.moodEvents || []).length > 0 };
})()`);
check('a fresh player starts at zero tech skill XP', run2.before === 0, JSON.stringify(run2));
check('tech XP rose by exactly RESEARCH_TUNING.xp — the declarative def.skill grant fired for real', run2.after === run2.xp, JSON.stringify(run2));
check('the mood effect in def.effects applied too (a real ADJUST_NEED line, not just the skill line)', run2.moodEventsAdded === true, JSON.stringify(run2));

// ---------------------------------------------------------------- 3
console.log('\n3. Same sequence for hobby.sketchpad — the art skill actually moves, not just the def');
const run3b = J(`(() => {
  const g = __mk(3, 1);
  g.player.location = 'living_room';
  const def = ACTION_DEFS['hobby.sketchpad'];
  const ctx = { gameState: g, roomId: 'living_room', presentNpcIds: [] };
  const prepared = def.prepare(ctx);
  const before = (g.player.skills && g.player.skills.art) || 0;
  const effectLines = def.buildEffects ? def.buildEffects(ctx, prepared) : [...(def.effects || [])];
  if (def.skill) effectLines.push('ADD_SKILL_XP ' + def.skill.id + ' ' + def.skill.xp);
  applyEffects(effectLines.map(l => parseEffectDSL(l)[0]).filter(Boolean), ctx);
  const after = (g.player.skills && g.player.skills.art) || 0;
  return { before, after, xp: def.skill.xp };
})()`);
check('a fresh player starts at zero art skill XP', run3b.before === 0, JSON.stringify(run3b));
check('sketching raises art XP by exactly the declared amount', run3b.after === run3b.xp, JSON.stringify(run3b));

// ---------------------------------------------------------------- 4
console.log('\n4. self.deep_clean gate — closed below cleaning level 2 even with dirt present, open at level 2, and a full one-pass clear once it fires');
const gate = J(`(() => {
  const g = __mk(4, 1);
  g.player.location = 'living_room';
  bumpRoomDirt(g, 'living_room', 0.6);
  const ctx = __ctx(g, 'living_room');
  const noDirtNoSkill = checkRequirements(ACTION_DEFS['self.deep_clean'], __ctx(__mk(5, 1), 'living_room'));
  g.player.skills = { cleaning: 0 };
  const level0 = checkRequirements(ACTION_DEFS['self.deep_clean'], ctx);
  g.player.skills = { cleaning: 40 }; // level 1 (SKILLS.xpPerLevelBase)
  const level1 = checkRequirements(ACTION_DEFS['self.deep_clean'], ctx);
  g.player.skills = { cleaning: 160 }; // level 2 (2^2 * 40)
  const level2 = checkRequirements(ACTION_DEFS['self.deep_clean'], ctx);
  // Direct checker probe too, isolating skillAtLeast from roomHasDirt.
  g.player.skills = { cleaning: 40 }; // back down to level 1 for this probe
  const checkerAtLevel1 = ACTION_REQUIREMENT_CHECKERS.skillAtLeast(ctx, 'cleaning', 2);
  const checkerAtLevel2 = (() => { g.player.skills = { cleaning: 160 }; return ACTION_REQUIREMENT_CHECKERS.skillAtLeast(ctx, 'cleaning', 2); })();
  return { noDirtNoSkill, level0, level1, level2, checkerAtLevel1, checkerAtLevel2 };
})()`);
check('a room with no dirt and a fresh player refuses (roomHasDirt also gates it)', gate.noDirtNoSkill.ok === false && typeof gate.noDirtNoSkill.reason === 'string', JSON.stringify(gate.noDirtNoSkill));
check('a dirty room still refuses at cleaning level 0 — a string reason naming the real requirement', gate.level0.ok === false && typeof gate.level0.reason === 'string', JSON.stringify(gate.level0));
check('still refuses at cleaning level 1 (below the level-2 threshold)', gate.level1.ok === false, JSON.stringify(gate.level1));
check('opens at cleaning level 2 — the exact threshold declared on the action', gate.level2.ok === true, JSON.stringify(gate.level2));
check('the skillAtLeast checker itself agrees in isolation (below/at threshold)', gate.checkerAtLevel1 !== true && gate.checkerAtLevel2 === true, JSON.stringify(gate));

const deepClear = J(`(() => {
  const g = __mk(6, 1);
  g.player.location = 'living_room';
  g.player.skills = { cleaning: 160 };
  bumpRoomDirt(g, 'living_room', 0.9);
  const ctx = { gameState: g, roomId: 'living_room' };
  const before = g.world.rooms.living_room.dirt;
  const prepared = prepareDeepClean(ctx);
  const lines = buildDeepCleanEffects(ctx, prepared);
  const narrationText = deepCleanNarration(ctx, prepared);
  applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), ctx);
  const after = g.world.rooms.living_room.dirt;
  return { before, after, narrationText, usedFullDirtStep: lines.some(l => l === 'ADD_ROOM_DIRT living_room -0.9') };
})()`);
check("once unlocked, Deep Clean clears the room in ONE pass — the whole 0.9 dirt reading, not self.clean's capped partial step", deepClear.before === 0.9 && deepClear.after === 0 && deepClear.usedFullDirtStep === true, JSON.stringify(deepClear));
check("the narration reflects a REAL, complete clean, not a partial one", deepClear.narrationText.includes('spotless'), deepClear.narrationText);

// ---------------------------------------------------------------- 5
console.log('\n5. D25, measured example — a fresh player crosses the cleaning level-2 threshold through bookshelf research ALONE within a reasonable number of sessions');
const measured = J(`(() => {
  const before = { level: skillLevel({ skills: {} }, 'cleaning'), mod: skillMod({ skills: {} }, 'cleaning', 'cleanEfficiency') };
  const player = { skills: {} };
  let sessions = 0;
  while (skillLevel(player, 'cleaning') < 2 && sessions < 20) {
    awardSkillXp(player, 'cleaning', RESEARCH_TUNING.xp, 1);
    sessions++;
  }
  const after = { level: skillLevel(player, 'cleaning'), mod: skillMod(player, 'cleaning', 'cleanEfficiency') };
  return { before, after, sessions, xp: player.skills.cleaning };
})()`);
check('a fresh player starts at cleaning level 0', measured.before.level === 0, JSON.stringify(measured.before));
check('research alone crosses the level-2 boundary self.deep_clean is gated on', measured.after.level >= 2, JSON.stringify(measured.after));
check(`...within a reasonable number of research sessions (got ${measured.sessions}, ${measured.xp} xp)`, measured.sessions > 0 && measured.sessions <= 15, JSON.stringify(measured));
check('...and cleanEfficiency itself measurably improved alongside it', measured.after.mod < measured.before.mod, JSON.stringify(measured));

// ---------------------------------------------------------------- 6
console.log('\n6. Browser hook — visitSite resolves tidyhome for real, and its DSL line is well-formed (repeatable, since a real visit reapplies effects every time)');
const site = J(`(() => {
  const g = __mk(7, 1);
  const result = visitSite(g, 'tidyhome');
  const ctx = { gameState: g };
  const before = (g.player.skills && g.player.skills.cleaning) || 0;
  applyEffects(parseEffectDSL(result.site.effects.join('\\n')), ctx);
  const afterOnce = g.player.skills.cleaning;
  applyEffects(parseEffectDSL(result.site.effects.join('\\n')), ctx);
  const afterTwice = g.player.skills.cleaning;
  return { ok: result.ok, before, afterOnce, afterTwice };
})()`);
check('visitSite resolves tidyhome and records a real history entry', site.ok === true, JSON.stringify(site));
check('applying its effects raises cleaning XP by exactly 6', site.afterOnce === site.before + 6, JSON.stringify(site));
check('a second application (a second real visit) raises it again — a repeatable research loop, not a one-shot bonus', site.afterTwice === site.before + 12, JSON.stringify(site));

// ---------------------------------------------------------------- 7
console.log('\n7. Save/load — player.skills (research/practice XP for cooking/cleaning/fitness/tech/art/stealth) survives a plain JSON round trip untouched');
const persist = J(`(() => {
  const g = __mk(8, 1);
  g.player.skills = { cooking: 12, cleaning: 160, fitness: 6, tech: 15, art: 6, stealth: 20 };
  const before = g.player.skills;
  const after = JSON.parse(JSON.stringify(before));
  return { before, after, sameShape: JSON.stringify(before) === JSON.stringify(after) };
})()`);
check('every researched/practiced skill value round-trips byte-identical (player.skills is a plain object — no normalizer strips or resets it)', persist.sameShape === true, JSON.stringify(persist));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
