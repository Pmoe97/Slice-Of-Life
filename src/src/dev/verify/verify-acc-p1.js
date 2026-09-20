// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 1: Skill
// foundation & the hobby split (D5–D7).
//
//   node src/src/dev/verify/verify-acc-p1.js
//
// Node coverage for everything pure/trusted-producer in this phase: the
// new `music` SKILL_IDS entry (D5) validating through EFFECTS' own
// validateSkillId; SKILL_CURVES' rename of the cooking-specific quality
// curve to the general `craftQuality` (D21 — same values at every level,
// proven against the old table hard-coded here, and against cooking.js's
// resolveCookStep for real) and the retirement of the unread skill-pay
// curve (D7 — gone at runtime, not just by grep); createHobbyAction's
// required `mode` (D6 — mastery hobbies carry def.skill, bonding hobbies
// carry none, and the factory refuses every inconsistent spec at load
// time); a real def.skill XP grant through ACTIONS' executeAction effect
// sequence for guitar → music (crossing level 1 at exactly the expected
// XP, with the level-up mood impulse) and bookshelf Read → writing at a
// third of the sketchpad rate; the three bonding hobbies leaving
// player.skills untouched while still applying their mood tick; a source
// grep over src/src/srcfiles + index.html proving zero references to the
// retired identifiers remain; and a save round-trip (captureSavePayload →
// JSON) carrying `skills.music` byte-identical. No new persisted field and
// no money moves in this phase. Presentation (the hobby chips themselves)
// is unchanged and outside this loader (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'sim.js', 'world.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'actions.js', 'cooking.js', 'state.js', 'computer.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

// The curve exactly as skills.js shipped it under its old cooking-specific
// name (2026-09-18, before this phase). The rename must not move a value.
const OLD_COOK_QUALITY = [0.30, 0.40, 0.50, 0.60, 0.68, 0.76, 0.82, 0.88, 0.92, 0.96, 1.00];

api(`
  __mk = (seed, day) => {
    const h = SIM_generateHouse(seed || 20260918, 3);
    return { meta: { seed: h.seed, clock: { ...h.clock, day: day || h.clock.day, minutes: 0 }, contentConfig: null, sessionLog: [] },
             player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  };
  __ctx = (g, roomId, presentNpcIds) => ({ gameState: g, roomId, roomObjects: g.objects['room_' + roomId] || {}, presentNpcIds: presentNpcIds || [] });
  // executeAction's OWN pure effect-application sequence (actions.js: the
  // two-step prepare/buildEffects contract, the declarative ADD_SKILL_XP
  // append, applyEffects) minus the live clock, which needs the DOM shell
  // (verify-aa-p16.js section 2 documents the same split). Same trusted-
  // producer path the game runs, not a hand-rolled stand-in.
  __runHobby = (g, actionId, roomId) => {
    const def = ACTION_DEFS[actionId];
    const ctx = __ctx(g, roomId || 'living_room');
    const prepared = def.prepare ? def.prepare(ctx) : null;
    const lines = def.buildEffects ? def.buildEffects(ctx, prepared) : [...(def.effects || [])];
    if (def.skill) lines.push('ADD_SKILL_XP ' + def.skill.id + ' ' + def.skill.xp);
    applyEffects(lines.map(l => parseEffectDSL(l)[0]).filter(Boolean), ctx);
    return lines;
  };
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration — 'music' in SKILL_IDS (D5), craftQuality present, the retired curve gone (D7). ${loaded.length} engine files loaded.`);
const reg = J(`({
  skillIds: SKILL_IDS,
  curves: Object.keys(SKILL_CURVES),
  craft: SKILL_CURVES.craftQuality,
  musicValid: validateSkillId('music'),
  bogusValid: validateSkillId('bagpipes'),
  llmTierAccepts: validateEffects(parseEffectDSL('ADD_SKILL_XP music 6'), { gameState: __mk(1, 1) }, 'llm'),
})`);
check('SKILL_IDS is exactly the nine prior ids plus music, in order', JSON.stringify(reg.skillIds) === JSON.stringify(['cooking', 'cleaning', 'stealth', 'tech', 'fitness', 'social', 'art', 'writing', 'focus', 'music']), JSON.stringify(reg.skillIds));
check("EFFECTS' validateSkillId accepts 'music' (the same gate ADD_SKILL_XP runs through) and still rejects an unknown id", reg.musicValid === true && reg.bogusValid !== true, JSON.stringify([reg.musicValid, reg.bogusValid]));
check('an LLM-tier ADD_SKILL_XP music line passes validateEffects — music is a real skill to every producer, not only the trusted path', reg.llmTierAccepts && reg.llmTierAccepts.valid && reg.llmTierAccepts.valid.length === 1 && (reg.llmTierAccepts.rejected || []).length === 0, JSON.stringify(reg.llmTierAccepts));
check('SKILL_CURVES is exactly {timeReduction, craftQuality, cleanEfficiency, stealthSuccess, socialEdge} — no cooking-specific name, no pay curve', JSON.stringify(reg.curves.slice().sort()) === JSON.stringify(['cleanEfficiency', 'craftQuality', 'socialEdge', 'stealthSuccess', 'timeReduction']), JSON.stringify(reg.curves));
check('craftQuality has 11 entries (levels 0..10) and is byte-identical to the old cooking table', JSON.stringify(reg.craft) === JSON.stringify(OLD_COOK_QUALITY), JSON.stringify(reg.craft));

// ---------------------------------------------------------------- 1
console.log('\n1. The hobby split (D6) — every hobby declares a mode; mastery carries def.skill, bonding carries none');
const hob = J(`(() => {
  const defs = Object.values(ACTION_DEFS).filter(d => d.group === 'hobby');
  return {
    ids: defs.map(d => d.id).sort(),
    skills: Object.fromEntries(defs.map(d => [d.id, d.skill || null])),
    modeStored: defs.some(d => 'hobbyMode' in d || 'mode' in d),
  };
})()`);
check('exactly the six buyable hobbies exist as hobby.* actions', JSON.stringify(hob.ids) === JSON.stringify(['hobby.bookshelf', 'hobby.console', 'hobby.guitar', 'hobby.houseplant', 'hobby.record_player', 'hobby.sketchpad']), JSON.stringify(hob.ids));
check("hobby.guitar is mastery → { id: 'music', xp: 6 } — the first real award site for the new skill", JSON.stringify(hob.skills['hobby.guitar']) === JSON.stringify({ id: 'music', xp: 6 }), JSON.stringify(hob.skills['hobby.guitar']));
check("hobby.sketchpad stays mastery → { id: 'art', xp: 6 } (unchanged from Actions & Activities Phase 16)", JSON.stringify(hob.skills['hobby.sketchpad']) === JSON.stringify({ id: 'art', xp: 6 }), JSON.stringify(hob.skills['hobby.sketchpad']));
check("hobby.bookshelf is mastery → { id: 'writing', xp: 2 } — research at a third of the sketchpad rate (D21)", JSON.stringify(hob.skills['hobby.bookshelf']) === JSON.stringify({ id: 'writing', xp: 2 }) && hob.skills['hobby.bookshelf'].xp * 3 === hob.skills['hobby.sketchpad'].xp, JSON.stringify(hob.skills['hobby.bookshelf']));
check('the three bonding hobbies (records, console, houseplant) carry NO def.skill — no XP by design', ['hobby.record_player', 'hobby.console', 'hobby.houseplant'].every(id => hob.skills[id] === null), JSON.stringify(hob.skills));
check('the mode is consumed at construction and NOT stored on the def (invariant 6 — no field without a reader)', hob.modeStored === false);

// ---------------------------------------------------------------- 2
console.log('\n2. createHobbyAction refuses every inconsistent spec at load time — a hobby cannot drift in undeclared');
const bad = J(`(() => {
  const attempt = (opts) => { try { createHobbyAction('hobby_guitar', 'X', ['x'], opts); return null; } catch (e) { return e.message; } };
  return {
    none: attempt(undefined),
    empty: attempt({}),
    badMode: attempt({ mode: 'vibe' }),
    masteryNoSkill: attempt({ mode: 'mastery', xp: 6 }),
    masteryUnknownSkill: attempt({ mode: 'mastery', skill: 'bagpipes', xp: 6 }),
    masteryZeroXp: attempt({ mode: 'mastery', skill: 'music', xp: 0 }),
    bondingWithSkill: attempt({ mode: 'bonding', skill: 'music', xp: 6 }),
    bondingWithXp: attempt({ mode: 'bonding', xp: 6 }),
    okMastery: attempt({ mode: 'mastery', skill: 'music', xp: 6 }),
    okBonding: attempt({ mode: 'bonding' }),
  };
})()`);
check('no opts at all → throws naming the mode requirement', typeof bad.none === 'string' && /mode/.test(bad.none), bad.none);
check('{} → throws (mode is required, not defaulted)', typeof bad.empty === 'string' && /mode/.test(bad.empty), bad.empty);
check("mode: 'vibe' → throws (only mastery|bonding)", typeof bad.badMode === 'string' && /mastery\|bonding/.test(bad.badMode), bad.badMode);
check('mastery without a skill → throws', typeof bad.masteryNoSkill === 'string' && /SKILL_IDS/.test(bad.masteryNoSkill), bad.masteryNoSkill);
check('mastery with a skill outside SKILL_IDS → throws (the same id list EFFECTS validates)', typeof bad.masteryUnknownSkill === 'string' && /SKILL_IDS/.test(bad.masteryUnknownSkill), bad.masteryUnknownSkill);
check('mastery with xp 0 → throws (a mastery hobby that awards nothing is a lie)', typeof bad.masteryZeroXp === 'string' && /xp/.test(bad.masteryZeroXp), bad.masteryZeroXp);
check('bonding with a skill → throws citing D6', typeof bad.bondingWithSkill === 'string' && /D6/.test(bad.bondingWithSkill), bad.bondingWithSkill);
check('bonding with a bare xp → throws too', typeof bad.bondingWithXp === 'string' && /D6/.test(bad.bondingWithXp), bad.bondingWithXp);
check('a well-formed mastery spec and a well-formed bonding spec both construct', bad.okMastery === null && bad.okBonding === null, JSON.stringify([bad.okMastery, bad.okBonding]));

// ---------------------------------------------------------------- 3
console.log('\n3. Guitar practice — the real executeAction effect sequence raises music XP and crosses level 1 at exactly the expected point');
const gtr = J(`(() => {
  const g = __mk(3, 1);
  g.player.location = 'living_room';
  const perSession = ACTION_DEFS['hobby.guitar'].skill.xp;
  const needed = Math.ceil(SKILLS.xpPerLevelBase / perSession);   // 40 / 6 → 7 sessions
  const trace = [];
  const levelUpEvents = () => (g.player.moodEvents || []).filter(e => e.delta === MOOD_PAYOUTS.skillLevelUp).length;
  for (let i = 1; i <= needed; i++) {
    const lines = __runHobby(g, 'hobby.guitar');
    trace.push({ session: i, xp: g.player.skills.music, level: skillLevel(g.player, 'music'), levelUps: levelUpEvents(), lines });
  }
  return { perSession, needed, xpPerLevelBase: SKILLS.xpPerLevelBase, trace };
})()`);
const last = gtr.trace[gtr.trace.length - 1];
const beforeLast = gtr.trace[gtr.trace.length - 2];
check(`each session emits exactly one ADD_SKILL_XP music ${gtr.perSession} line alongside the mood/energy ticks`, gtr.trace.every(t => t.lines.filter(l => /^ADD_SKILL_XP/.test(l)).length === 1 && t.lines.includes(`ADD_SKILL_XP music ${gtr.perSession}`)), JSON.stringify(gtr.trace[0].lines));
check('music XP accumulates by exactly the per-session amount each time', gtr.trace.every(t => t.xp === t.session * gtr.perSession), JSON.stringify(gtr.trace.map(t => t.xp)));
check(`after ${gtr.needed - 1} sessions (${beforeLast.xp} xp) the player is still level 0`, beforeLast.level === 0 && beforeLast.xp < gtr.xpPerLevelBase, JSON.stringify(beforeLast));
check(`the ${gtr.needed}th session (${last.xp} xp ≥ ${gtr.xpPerLevelBase}) crosses to level 1`, last.level === 1 && last.xp >= gtr.xpPerLevelBase, JSON.stringify(last));
check('crossing the level pushed exactly one MOOD_PAYOUTS.skillLevelUp impulse — on the crossing session and no earlier', beforeLast.levelUps === 0 && last.levelUps === 1, JSON.stringify(gtr.trace.map(t => t.levelUps)));

// ---------------------------------------------------------------- 4
console.log('\n4. Reading — bookshelf Read feeds writing at its reduced rate and reaches level 1 in three times the guitar sessions');
const rd = J(`(() => {
  const g = __mk(4, 1);
  const per = ACTION_DEFS['hobby.bookshelf'].skill.xp;
  const needed = Math.ceil(SKILLS.xpPerLevelBase / per);   // 40 / 2 → 20 reads
  let firstLevelAt = null;
  for (let i = 1; i <= needed; i++) {
    __runHobby(g, 'hobby.bookshelf');
    if (firstLevelAt == null && skillLevel(g.player, 'writing') >= 1) firstLevelAt = i;
  }
  return { per, needed, xp: g.player.skills.writing, level: skillLevel(g.player, 'writing'), firstLevelAt, touched: Object.keys(g.player.skills) };
})()`);
check(`each Read awards exactly ${rd.per} writing XP (${rd.needed} reads → ${rd.xp} xp)`, rd.xp === rd.per * rd.needed, JSON.stringify(rd));
check('writing crosses level 1 on the last of those reads and not before', rd.level === 1 && rd.firstLevelAt === rd.needed, JSON.stringify(rd));
check('Read touches writing and nothing else', JSON.stringify(rd.touched) === JSON.stringify(['writing']), JSON.stringify(rd.touched));

// ---------------------------------------------------------------- 5
console.log('\n5. Bonding hobbies — records, console, and the plant run for real (mood tick applied) and leave player.skills untouched');
const bond = J(`(() => {
  const g = __mk(5, 1);
  const out = {};
  for (const id of ['hobby.record_player', 'hobby.console', 'hobby.houseplant']) {
    const skillsBefore = JSON.stringify(g.player.skills || {});
    const moodBefore = (g.player.moodEvents || []).length;
    for (let i = 0; i < 10; i++) __runHobby(g, id);
    out[id] = { skillsSame: JSON.stringify(g.player.skills || {}) === skillsBefore, moodGrew: (g.player.moodEvents || []).length > moodBefore };
  }
  return { out, finalSkills: g.player.skills || {} };
})()`);
check('ten sessions of each bonding hobby leave player.skills byte-identical', Object.values(bond.out).every(o => o.skillsSame) && JSON.stringify(bond.finalSkills) === '{}', JSON.stringify(bond));
check('...while each still applied its mood tick (the action ran; XP is the only thing withheld)', Object.values(bond.out).every(o => o.moodGrew), JSON.stringify(bond.out));

// ---------------------------------------------------------------- 6
console.log("\n6. craftQuality — skillMod(p, 'cooking', 'craftQuality') returns the old cooking value at every level, and cooking.js reads it for real");
const cq = J(`(() => {
  const g = __mk(6, 1);
  const byLevel = [];
  for (let lvl = 0; lvl <= SKILLS.maxLevel; lvl++) {
    g.player.skills = { cooking: lvl * lvl * SKILLS.xpPerLevelBase };
    byLevel.push({ lvl, derived: skillLevel(g.player, 'cooking'), mod: skillMod(g.player, 'cooking', 'craftQuality') });
  }
  // The real reader: resolveCookStep's skillTerm is (craftQuality − 0.5) ×
  // skillQualityWeight, so two cooks of the same seeded step differ by
  // exactly that delta between levels (a mid level, clear of the clamp).
  const stepAt = (lvl) => {
    const gg = __mk(6, 1);
    gg.player.skills = { cooking: lvl * lvl * SKILLS.xpPerLevelBase };
    const plan = planCook(RECIPES.stirfry, gg, { roomId: 'kitchen', seed: 11 });
    return resolveCookStep(plan.steps[0], plan, gg).quality;
  };
  const q0 = stepAt(0), q4 = stepAt(4);
  const gone = { cooking: skillMod(g.player, 'cooking', 'cookQuality'), pay: skillMod(g.player, 'tech', 'payMultiplier') };
  return { byLevel, q0, q4, expectedDelta: (${OLD_COOK_QUALITY[4]} - ${OLD_COOK_QUALITY[0]}) * COOK_TUNING.skillQualityWeight, gone };
})()`);
check('skillLevel derives 0..10 from the squared-xp inputs (the fixture is sound)', cq.byLevel.every(r => r.derived === r.lvl), JSON.stringify(cq.byLevel.map(r => r.derived)));
check('craftQuality at every level equals the old cooking value exactly', cq.byLevel.every(r => r.mod === OLD_COOK_QUALITY[r.lvl]), JSON.stringify(cq.byLevel.map(r => r.mod)));
check(`resolveCookStep's quality moves by exactly (craftQuality[4] − craftQuality[0]) × skillQualityWeight = ${cq.expectedDelta.toFixed(3)} between level 0 and 4 — cooking reads the renamed curve, not a fallback`, Math.abs((cq.q4 - cq.q0) - cq.expectedDelta) < 1e-9 && cq.q4 > cq.q0, JSON.stringify({ q0: cq.q0, q4: cq.q4, expectedDelta: cq.expectedDelta }));
check('the old cooking-specific curve name is gone at runtime — skillMod falls back to 1 (unknown curve), it does not silently resolve', cq.gone.cooking === 1, JSON.stringify(cq.gone));
check('the retired pay curve is gone at runtime too', cq.gone.pay === 1, JSON.stringify(cq.gone));

// ---------------------------------------------------------------- 7
console.log('\n7. Source grep — zero references to the retired identifiers remain in src/src/srcfiles/*.js or index.html');
const RETIRED = /cookQuality|payMultiplier|qualitySkill/;
const hits = [];
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.js'))) {
  const text = fs.readFileSync(path.join(SRC, f), 'utf8');
  text.split('\n').forEach((line, i) => { if (RETIRED.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`); });
}
const indexPath = path.join(SRC, '..', '..', '..', 'index.html');
if (fs.existsSync(indexPath)) {
  fs.readFileSync(indexPath, 'utf8').split('\n').forEach((line, i) => { if (RETIRED.test(line)) hits.push(`index.html:${i + 1}: ${line.trim()}`); });
}
check(`no srcfile mentions cookQuality / payMultiplier / qualitySkill (${fs.readdirSync(SRC).filter(f => f.endsWith('.js')).length} files scanned)`, hits.length === 0, hits.join('\n        '));
check('index.html was actually found and scanned (the path is right)', fs.existsSync(indexPath), indexPath);

// ---------------------------------------------------------------- 8
console.log('\n8. Save round-trip — player.skills.music rides the real persisted payload (captureSavePayload → JSON) byte-identical');
const persist = J(`(() => {
  const g = __mk(8, 1);
  for (let i = 0; i < 7; i++) __runHobby(g, 'hobby.guitar');
  for (let i = 0; i < 3; i++) __runHobby(g, 'hobby.bookshelf');
  const payload = captureSavePayload(g);
  const rt = JSON.parse(JSON.stringify(payload));
  const loaded = rt.player && rt.player.player;
  return {
    live: g.player.skills,
    saved: loaded && loaded.skills,
    same: JSON.stringify(loaded && loaded.skills) === JSON.stringify(g.player.skills),
    levelAfterLoad: loaded ? skillLevel(loaded, 'music') : null,
  };
})()`);
check('the persisted player record carries skills.music (42) and skills.writing (6) exactly as the live state does', persist.same === true && persist.saved && persist.saved.music === 42 && persist.saved.writing === 6, JSON.stringify(persist));
check('skillLevel over the loaded record still reads music level 1 — nothing in the save shape needed a migration', persist.levelAfterLoad === 1, JSON.stringify(persist));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
