// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 2: the
// multi-category gig board (D14–D16, D58).
//
//   node src/src/dev/verify/verify-acc-p2.js
//
// Node coverage for everything pure in this phase: GIG_TEMPLATES rewritten
// to six categories with an explicit `tier` and an honest `skill` on every
// template (D15 — copy_edit is a writing gig; admin gates on nothing, D16),
// plus the load-time guard that refuses a half-declared template; the
// per-category reputation map (D14) — its fresh default, the ONE fold
// function a scalar-era save goes through (foldGigReputation, reached from
// both the world 5->6 MIGRATIONS entry and normalizeComputerState), and the
// re-stamping of an in-flight 'web'/'dev' gig's category; eligibility
// judged per category against that category's tier index (the old
// template-index-into-the-tier-table mapping is gone — infra_project is
// never offered below Elite tech rep, the regression test for the Evidence
// table's off-by-one); generateGigsForDay drawing per category over 200
// seeded days (Elite tech + Novice writing on one board, admin on every
// board, the ~70% refresh roll retained — D2); deliverGig/abandonGig/
// processGigDeadlinesForDay moving only the delivered gig's category, with
// player.money moved by exactly the payout through the real EARN_MONEY path
// and the tax accumulator agreeing; a promotion reported with its category
// and only upward; and a save round-trip (captureSavePayload → JSON →
// normalizeComputerState) carrying the map byte-identical. Presentation —
// the grouped board, the chip row, the rep strip — is verified on the live
// page and outside this loader (invariant 7).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'sim.js', 'world.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'state.js', 'computer.js', 'tracker.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, day) => {
    const h = SIM_generateHouse(seed || 20260918, 3);
    return { meta: { seed: h.seed, clock: { ...h.clock, day: day || h.clock.day, minutes: 0 }, contentConfig: null, sessionLog: [] },
             player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
  };
  // Level L costs xpPerLevelBase × L² (skills.js's skillLevel inverted).
  __setLevel = (g, skillId, level) => { g.player.skills = g.player.skills || {}; g.player.skills[skillId] = SKILLS.xpPerLevelBase * level * level; };
  __setRep = (g, map) => { Object.assign(g.world.computer.apps.gigs.reputation, map); };
  __gigs = (g) => g.world.computer.apps.gigs;
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration — GIG_CATEGORIES, the rewritten GIG_TEMPLATES (D15/D16), the world folder at 6. ${loaded.length} engine files loaded.`);
const reg = J(`({
  cats: GIG_CATEGORIES,
  ids: GIG_CATEGORY_IDS,
  n: GIG_TEMPLATES_LIST.length,
  perCat: Object.fromEntries(GIG_CATEGORY_IDS.map(id => [id, GIG_TEMPLATES_LIST.filter(t => t.category === id).map(t => [t.id, t.tier, t.skill, t.minSkill])])),
  copyEdit: GIG_TEMPLATES.copy_edit,
  infra: GIG_TEMPLATES.infra_project,
  dataEntry: GIG_TEMPLATES.data_entry,
  worldVer: FOLDER_VERSIONS.world,
  tiers: GIG_REPUTATION_TIERS.map(t => t.name),
  fresh: defaultComputerState().apps.gigs.reputation,
})`);
check('GIG_CATEGORIES is exactly admin/tech/writing/music/art/food, in that order, each naming its craft skill (admin: none)',
  JSON.stringify(reg.ids) === JSON.stringify(['admin', 'tech', 'writing', 'music', 'art', 'food'])
  && JSON.stringify(reg.cats.map(c => c.skill)) === JSON.stringify([null, 'tech', 'writing', 'music', 'art', 'cooking']), JSON.stringify(reg.cats));
check('24 templates: admin 3, tech 5, writing 4, music 4, art 4, food 4', reg.n === 24 && JSON.stringify(Object.fromEntries(Object.entries(reg.perCat).map(([k, v]) => [k, v.length]))) === JSON.stringify({ admin: 3, tech: 5, writing: 4, music: 4, art: 4, food: 4 }), JSON.stringify(reg.perCat));
check('every category has a tier-0 template (each craft has an entry rung) and tech/writing/music/art/food each have a tier-4 flagship',
  Object.entries(reg.perCat).every(([, v]) => v.some(t => t[1] === 0))
  && ['tech', 'writing', 'music', 'art', 'food'].every(c => reg.perCat[c].some(t => t[1] === 4)), JSON.stringify(reg.perCat));
check("every template's skill is its category's craft skill and minSkill rises with tier within a category (honest gating, D15)",
  Object.entries(reg.perCat).every(([cat, v]) => {
    const skill = reg.cats.find(c => c.id === cat).skill;
    const sorted = [...v].sort((a, b) => a[1] - b[1]);
    return v.every(t => t[2] === skill) && sorted.every((t, i) => i === 0 || t[3] >= sorted[i - 1][3]);
  }), JSON.stringify(reg.perCat));
check("copy_edit is skill 'writing', category 'writing', tier 0 — the Evidence table's all-tech gating is gone", reg.copyEdit.skill === 'writing' && reg.copyEdit.category === 'writing' && reg.copyEdit.tier === 0, JSON.stringify(reg.copyEdit));
check('infra_project declares tier 4 (Elite) explicitly — no index mapping can put it at floor 0 again', reg.infra.tier === 4 && reg.infra.category === 'tech' && reg.infra.minSkill === 5, JSON.stringify(reg.infra));
check('admin templates are skill null / minSkill 0 (D16) and data_entry keeps its old pay band', reg.perCat.admin.every(t => t[2] === null && t[3] === 0) && reg.dataEntry.basePayoutPerBlock === 35, JSON.stringify([reg.perCat.admin, reg.dataEntry.basePayoutPerBlock]));
check('a fresh computer state carries the six-key zero map, keyed from GIG_CATEGORY_IDS', JSON.stringify(reg.fresh) === JSON.stringify({ admin: 0, tech: 0, writing: 0, music: 0, art: 0, food: 0 }), JSON.stringify(reg.fresh));
check('FOLDER_VERSIONS.world is 6 (the reputation migration is versioned, D58)', reg.worldVer === 6, String(reg.worldVer));
check('the five tier names are unchanged', JSON.stringify(reg.tiers) === JSON.stringify(['Novice', 'Competent', 'Established', 'Specialist', 'Elite']), JSON.stringify(reg.tiers));

// The load-time guard: defs.computer.js re-evaluated in a bare vm with one
// template broken each way must throw at load, exactly as createHobbyAction
// does for a hobby (D6's posture).
console.log('\n0b. Load-time guard — a half-declared template is a startup error, not a gig that silently never appears');
const defsSrc = fs.readFileSync(path.join(SRC, 'defs.computer.js'), 'utf8');
function loadsWith(patch) {
  try { vm.runInContext(patch(defsSrc), vm.createContext({}), { filename: 'defs.computer.js' }); return { ok: true }; }
  catch (e) { return { ok: false, msg: e.message }; }
}
check('the unpatched file loads', loadsWith(s => s).ok === true);
// The file's line endings follow the checkout (autocrlf), so the patches
// match across a \r?\n boundary rather than assuming one; each probe also
// asserts its patch landed, so a drifted template line fails loudly.
const patched = (re, to) => (s) => { if (!re.test(s)) throw new Error(`guard probe did not match ${re}`); return s.replace(re, to); };
const badCat = loadsWith(patched(/(id: 'copy_edit', label: 'Copy Edit Pass', category: )'writing'/, "$1'editorial'"));
check("an unknown category throws at load", badCat.ok === false && /unknown category 'editorial'/.test(badCat.msg), JSON.stringify(badCat));
const badSkill = loadsWith(patched(/(id: 'copy_edit', label: 'Copy Edit Pass', category: 'writing',\r?\n\s+skill: )'writing'/, "$1'tech'"));
check("a skill that is not the category's craft throws at load (the old copy_edit-on-tech shape cannot come back)", badSkill.ok === false && /does not match category 'writing'/.test(badSkill.msg), JSON.stringify(badSkill));
const badAdmin = loadsWith(patched(/(id: 'data_entry', label: 'Data Entry Batch', category: 'admin',\r?\n\s+skill: null, minSkill: )0/, "$12"));
check('a no-skill template with minSkill > 0 throws at load (D16)', badAdmin.ok === false && /no-skill template must have minSkill 0/.test(badAdmin.msg), JSON.stringify(badAdmin));
const badTier = loadsWith(patched(/skill: 'tech', minSkill: 5, tier: 4/, "skill: 'tech', minSkill: 5, tier: 5"));
check('a tier outside GIG_REPUTATION_TIERS throws at load', badTier.ok === false && /tier must be an integer 0\.\.4/.test(badTier.msg), JSON.stringify(badTier));

// ---------------------------------------------------------------- 1
console.log('\n1. The fold — a scalar 37 becomes { tech: 37, zeros elsewhere }, from the MIGRATIONS entry AND normalizeComputerState (D58)');
const fold = J(`(() => {
  const mig = MIGRATIONS.world.find(m => m.from === 5 && m.to === 6);
  const oldComputer = { power: 'off', windows: {}, apps: { gigs: { board: [
      { gigId: 'gig_3_0', templateId: 'web_tweak', label: 'Website Tweak', client: 'Lumen Studio', category: 'web', blocks: 6, deadlineDay: 9, payout: 400, rush: false },
    ], accepted: [
      { gigId: 'gig_2_1', templateId: 'infra_project', label: 'Infrastructure Project', client: 'Mesa Cloud', category: 'dev', blocks: 20, deadlineDay: 12, payout: 9000, rush: false, blocksDone: 4, acceptedDay: 2 },
      { gigId: 'gig_2_2', templateId: 'copy_edit', label: 'Copy Edit Pass', client: 'Marlow Books', category: 'writing', blocks: 5, deadlineDay: 8, payout: 250, rush: false, blocksDone: 0, acceptedDay: 2 },
    ], reputation: 37, lastRefreshDay: 3, workBlocksToday: 2 }, shop: { cart: [], wishlist: [] } } };
  const viaMig = mig.fn(JSON.parse(JSON.stringify(oldComputer)));
  const viaNorm = normalizeComputerState(JSON.parse(JSON.stringify(oldComputer)));
  const rooms = { living_room: { capacity: 4, cleanliness: 80 }, kitchen: { capacity: 3, cleanliness: 60 } };
  return {
    migRep: viaMig.apps.gigs.reputation,
    migCats: [viaMig.apps.gigs.board[0].category, viaMig.apps.gigs.accepted[0].category, viaMig.apps.gigs.accepted[1].category],
    migKeptFields: [viaMig.apps.gigs.lastRefreshDay, viaMig.apps.gigs.workBlocksToday, viaMig.apps.gigs.accepted[0].blocksDone, viaMig.power],
    normRep: viaNorm.apps.gigs.reputation,
    normCats: [viaNorm.apps.gigs.board[0].category, viaNorm.apps.gigs.accepted[0].category],
    normHasSprites: !!viaNorm.apps.sprites,
    roomsUntouched: JSON.stringify(mig.fn(rooms)) === JSON.stringify(rooms),
    nullThrough: mig.fn(null) === null,
    idempotent: JSON.stringify(mig.fn(viaMig).apps.gigs) === JSON.stringify(viaMig.apps.gigs),
    already: foldGigReputation({ admin: 0, tech: 37, writing: 0, music: 0, art: 0, food: 0 }),
    partial: foldGigReputation({ tech: 12, writing: 8, bogus: 99 }),
    clampHi: foldGigReputation(140), clampLo: foldGigReputation(-5), nan: foldGigReputation(NaN), undef: foldGigReputation(undefined),
    fresh: foldGigReputation(0),
  };
})()`);
const EXPECT_37 = { admin: 0, tech: 37, writing: 0, music: 0, art: 0, food: 0 };
check('MIGRATIONS.world 5->6 folds reputation 37 into { admin: 0, tech: 37, writing: 0, music: 0, art: 0, food: 0 }', JSON.stringify(fold.migRep) === JSON.stringify(EXPECT_37), JSON.stringify(fold.migRep));
check("the same pass re-stamps in-flight gigs from their templates: 'web' → tech, 'dev' → tech, writing stays writing", JSON.stringify(fold.migCats) === JSON.stringify(['tech', 'tech', 'writing']), JSON.stringify(fold.migCats));
check('the migration keeps every other gigs field and the rest of the computer state (lastRefreshDay 3, workBlocksToday 2, blocksDone 4, power)', JSON.stringify(fold.migKeptFields) === JSON.stringify([3, 2, 4, 'off']), JSON.stringify(fold.migKeptFields));
check('normalizeComputerState folds the same scalar the same way (the in-memory lazy default) and still back-fills newer apps', JSON.stringify(fold.normRep) === JSON.stringify(EXPECT_37) && JSON.stringify(fold.normCats) === JSON.stringify(['tech', 'tech']) && fold.normHasSprites === true, JSON.stringify([fold.normRep, fold.normCats, fold.normHasSprites]));
check('the per-key guard: a rooms map (or null) passes through the 5->6 fn untouched — the world folder holds many keys under one pass', fold.roomsUntouched === true && fold.nullThrough === true);
check('the migration is idempotent on an already-migrated state', fold.idempotent === true);
check('foldGigReputation: an already-folded map is unchanged; a partial map is backfilled and stripped of unknown keys', JSON.stringify(fold.already) === JSON.stringify(EXPECT_37) && JSON.stringify(fold.partial) === JSON.stringify({ admin: 0, tech: 12, writing: 8, music: 0, art: 0, food: 0 }), JSON.stringify([fold.already, fold.partial]));
check('foldGigReputation clamps to 0..100 and reads NaN/undefined/0 as a fresh map', fold.clampHi.tech === 100 && fold.clampLo.tech === 0 && JSON.stringify(fold.nan) === JSON.stringify(fold.fresh) && JSON.stringify(fold.undef) === JSON.stringify(fold.fresh) && fold.fresh.tech === 0, JSON.stringify([fold.clampHi, fold.clampLo, fold.nan, fold.undef]));

// ---------------------------------------------------------------- 2
console.log('\n2. Eligibility per category — tier index vs template tier, skill gate on the category craft, admin always (D15/D16)');
const elig = J(`(() => {
  const ids = (list) => list.map(t => t.id).sort();
  const g = __mk(2, 1);
  const out = {};
  out.freshAllZero = ids(eligibleGigTemplates(g));
  // Elite tech rep, skill 5; writing rep 0, skill 3.
  __setRep(g, { tech: 90, writing: 0 }); __setLevel(g, 'tech', 5); __setLevel(g, 'writing', 3);
  out.eliteTech = ids(eligibleGigTemplates(g, 'tech'));
  out.noviceWriting = ids(eligibleGigTemplates(g, 'writing'));
  out.all = ids(eligibleGigTemplates(g));
  // Rep just under Elite: infra_project must drop out even at skill 5.
  __setRep(g, { tech: 84 });
  out.specialistTech = ids(eligibleGigTemplates(g, 'tech'));
  // Elite rep but skill 4: infra_project gated by minSkill, app_feature in.
  __setRep(g, { tech: 100 }); __setLevel(g, 'tech', 4);
  out.eliteTechSkill4 = ids(eligibleGigTemplates(g, 'tech'));
  // Writing rep at Competent floor exactly, skill 2.
  __setRep(g, { writing: 20 }); __setLevel(g, 'writing', 2);
  out.competentWriting = ids(eligibleGigTemplates(g, 'writing'));
  // Admin rep Competent opens survey_batch with no skill at all.
  __setRep(g, { admin: 20 });
  out.competentAdmin = ids(eligibleGigTemplates(g, 'admin'));
  // Cooking 5 with food rep 0 — only the tier-0 food gig.
  __setLevel(g, 'cooking', 5);
  out.noviceFoodSkill5 = ids(eligibleGigTemplates(g, 'food'));
  out.tierIdx = [gigTierIndex(0), gigTierIndex(19), gigTierIndex(20), gigTierIndex(40), gigTierIndex(65), gigTierIndex(84), gigTierIndex(85), gigTierIndex(100)];
  return out;
})()`);
check('a fresh player (all skills 0, all rep 0) is eligible for exactly the two tier-0 admin templates — same floor the old board had', JSON.stringify(elig.freshAllZero) === JSON.stringify(['data_entry', 'transcription']), JSON.stringify(elig.freshAllZero));
check('tech rep 90 / skill 5 → all five tech templates including infra_project (tier 4)', JSON.stringify(elig.eliteTech) === JSON.stringify(['app_feature', 'infra_project', 'script_automation', 'support_tickets', 'web_tweak']), JSON.stringify(elig.eliteTech));
check('the SAME player at writing rep 0 / skill 3 → only copy_edit (tier 0) — Elite tech buys nothing in writing', JSON.stringify(elig.noviceWriting) === JSON.stringify(['copy_edit']), JSON.stringify(elig.noviceWriting));
check('the unfiltered list is the union: admin ×2 + tech ×5 + writing ×1 (no music/art/food at skill 0)', JSON.stringify(elig.all) === JSON.stringify(['app_feature', 'copy_edit', 'data_entry', 'infra_project', 'script_automation', 'support_tickets', 'transcription', 'web_tweak']), JSON.stringify(elig.all));
check('tech rep 84 (Specialist) / skill 5 → infra_project is NOT eligible: the regression test for the old floor-0 bug', !elig.specialistTech.includes('infra_project') && elig.specialistTech.includes('app_feature'), JSON.stringify(elig.specialistTech));
check('tech rep 100 / skill 4 → infra_project gated out by minSkill 5 alone, app_feature in', !elig.eliteTechSkill4.includes('infra_project') && elig.eliteTechSkill4.includes('app_feature'), JSON.stringify(elig.eliteTechSkill4));
check('writing rep exactly 20 / skill 2 → copy_edit + blog_post (tier 1 opens at the Competent floor, inclusive)', JSON.stringify(elig.competentWriting) === JSON.stringify(['blog_post', 'copy_edit']), JSON.stringify(elig.competentWriting));
check('admin rep 20 opens survey_batch with no skill at all (D16 — admin gates on nothing)', JSON.stringify(elig.competentAdmin) === JSON.stringify(['data_entry', 'survey_batch', 'transcription']), JSON.stringify(elig.competentAdmin));
check('cooking 5 with food rep 0 → only meal_prep_batch: skill alone never skips a rep tier', JSON.stringify(elig.noviceFoodSkill5) === JSON.stringify(['meal_prep_batch']), JSON.stringify(elig.noviceFoodSkill5));
check('gigTierIndex maps 0/19→0, 20→1, 40→2, 65→3, 84→3, 85/100→4', JSON.stringify(elig.tierIdx) === JSON.stringify([0, 0, 1, 2, 3, 3, 4, 4]), JSON.stringify(elig.tierIdx));

// ---------------------------------------------------------------- 3
console.log('\n3. generateGigsForDay over 200 seeded days — per-category draw, Elite tech + Novice writing on one board, admin on every board, ~70% refresh (D2)');
const gen = J(`(() => {
  const g = __mk(3, 1);
  __setRep(g, { tech: 90, writing: 0 }); __setLevel(g, 'tech', 5); __setLevel(g, 'writing', 3);
  const gigs = __gigs(g);
  const stats = { days: 0, refreshed: 0, boards: 0, tier4Tech: 0, techTemplates: {}, writingTemplates: {}, otherCats: {}, adminEvery: true, sizes: [], orderOk: true, idsUnique: true, infraBelowFloor: 0 };
  let prevBoardJson = JSON.stringify(gigs.board);
  const catOrder = GIG_CATEGORY_IDS;
  for (let day = 1; day <= 200; day++) {
    g.meta.clock.day = day;
    generateGigsForDay(g, day);
    stats.days++;
    const json = JSON.stringify(gigs.board);
    const refreshed = json !== prevBoardJson;
    prevBoardJson = json;
    if (refreshed) stats.refreshed++;
    if (!refreshed) continue;
    stats.boards++;
    const board = gigs.board;
    stats.sizes.push(board.length);
    if (!board.some(b => b.category === 'admin')) stats.adminEvery = false;
    // Category order on the board must be GIG_CATEGORIES order.
    let lastIdx = -1;
    for (const b of board) {
      const idx = catOrder.indexOf(b.category);
      if (idx < lastIdx) stats.orderOk = false;
      lastIdx = idx;
      if (b.category === 'tech') { stats.techTemplates[b.templateId] = (stats.techTemplates[b.templateId] || 0) + 1; if (GIG_TEMPLATES[b.templateId].tier === 4) stats.tier4Tech++; }
      else if (b.category === 'writing') { stats.writingTemplates[b.templateId] = (stats.writingTemplates[b.templateId] || 0) + 1; }
      else if (b.category !== 'admin') { stats.otherCats[b.category] = (stats.otherCats[b.category] || 0) + 1; }
    }
    if (new Set(board.map(b => b.gigId)).size !== board.length) stats.idsUnique = false;
  }
  // The old bug's regression, over a SEPARATE player at Specialist tech
  // rep with skill 5 across the same 200 days: infra_project must never
  // be offered.
  const g2 = __mk(3, 1);
  __setRep(g2, { tech: 84 }); __setLevel(g2, 'tech', 5);
  for (let day = 1; day <= 200; day++) {
    g2.meta.clock.day = day;
    generateGigsForDay(g2, day);
    if (__gigs(g2).board.some(b => b.templateId === 'infra_project')) stats.infraBelowFloor++;
  }
  // Determinism + same-day idempotence: a second state on the same seed
  // produces the same day-7 board, and re-running day 7 does not redraw.
  const g3 = __mk(3, 1); __setRep(g3, { tech: 90, writing: 0 }); __setLevel(g3, 'tech', 5); __setLevel(g3, 'writing', 3);
  const g4 = __mk(3, 1); __setRep(g4, { tech: 90, writing: 0 }); __setLevel(g4, 'tech', 5); __setLevel(g4, 'writing', 3);
  for (let day = 1; day <= 7; day++) { g3.meta.clock.day = day; generateGigsForDay(g3, day); g4.meta.clock.day = day; generateGigsForDay(g4, day); }
  const b3 = JSON.stringify(__gigs(g3).board);
  generateGigsForDay(g3, 7);
  stats.deterministic = b3 === JSON.stringify(__gigs(g4).board);
  stats.idempotent = b3 === JSON.stringify(__gigs(g3).board);
  // A fresh player's board is the admin slice only, 3–4 gigs — the old
  // board's size, not six categories' worth.
  const g5 = __mk(3, 1);
  const freshSizes = [];
  for (let day = 1; day <= 60; day++) { g5.meta.clock.day = day; const before = JSON.stringify(__gigs(g5).board); generateGigsForDay(g5, day); if (JSON.stringify(__gigs(g5).board) !== before) freshSizes.push([__gigs(g5).board.length, __gigs(g5).board.every(b => b.category === 'admin')]); }
  stats.freshSizes = freshSizes;
  // Pay multiplier is the CATEGORY's: an Elite tech gig pays ≥ 4× its
  // template's base × blocks; a Novice writing gig pays ≤ 1.10 × base ×
  // blocks (× 1.25 if rush).
  const g6 = __mk(3, 1); __setRep(g6, { tech: 90, writing: 0 }); __setLevel(g6, 'tech', 5); __setLevel(g6, 'writing', 3);
  stats.payOk = true; stats.paySamples = [];
  for (let day = 1; day <= 40; day++) {
    g6.meta.clock.day = day; generateGigsForDay(g6, day);
    for (const b of __gigs(g6).board) {
      // Phase 15 (D104): the global payScale divides out; the tier band is what is asserted (rounding to whole dollars widens the tolerance on small payouts).
      const base = GIG_TEMPLATES[b.templateId].basePayoutPerBlock * b.blocks * (b.rush ? 1.25 : 1) * (GIG_TUNING.payScale ?? 1);
      const mult = b.payout / base; const tol = 0.5 / base + 0.01;
      const elite = GIG_REPUTATION_TIERS[4].payMult, novice = GIG_REPUTATION_TIERS[0].payMult;
      if (b.category === 'tech' && (mult < elite[0] - tol || mult > elite[1] + tol)) stats.payOk = false;
      if (b.category === 'writing' && (mult < novice[0] - tol || mult > novice[1] + tol)) stats.payOk = false;
      if (b.category === 'admin' && (mult < novice[0] - tol || mult > novice[1] + tol)) stats.payOk = false;
      if (stats.paySamples.length < 3) stats.paySamples.push([b.category, b.templateId, b.blocks, b.rush, b.payout, Math.round(mult * 100) / 100]);
    }
  }
  return stats;
})()`);
check('200 days processed; the board turned over on ~70% of them (D2 — the dry-spell roll survives per-category drawing)', gen.days === 200 && gen.refreshed / 200 >= 0.6 && gen.refreshed / 200 <= 0.8, `refreshed ${gen.refreshed}/200`);
check('every generated board carried at least one admin gig (D16)', gen.adminEvery === true, JSON.stringify(gen.sizes));
check('tier-4 tech (infra_project) was offered to the Elite-tech player, and every tech template appeared', gen.tier4Tech > 0 && Object.keys(gen.techTemplates).length === 5, JSON.stringify(gen.techTemplates));
check('the same boards carried ONLY copy_edit for writing (tier 0) — never blog_post/feature_article/ghostwrite_chapter', JSON.stringify(Object.keys(gen.writingTemplates)) === JSON.stringify(['copy_edit']) && gen.writingTemplates.copy_edit > 0, JSON.stringify(gen.writingTemplates));
check('no music/art/food gigs at skill 0 in those crafts', Object.keys(gen.otherCats).length === 0, JSON.stringify(gen.otherCats));
check('board rows are grouped in GIG_CATEGORIES order and gigIds are unique per board', gen.orderOk === true && gen.idsUnique === true);
check('board size is the sum of per-category tier sizes: Novice admin 3–4 + Elite tech 6–8 + Novice writing 3–4 = 12–16', gen.sizes.every(s => s >= 12 && s <= 16), JSON.stringify(gen.sizes.slice(0, 20)));
check('the Specialist-tech player (rep 84, skill 5) was NEVER offered infra_project across 200 days — the old floor-0 bug is gone', gen.infraBelowFloor === 0, `offered on ${gen.infraBelowFloor} days`);
check('generation is seed-deterministic and same-day idempotent', gen.deterministic === true && gen.idempotent === true);
check('a fresh player sees the admin slice only, 3–4 gigs per board — exactly the old board\'s size', gen.freshSizes.length > 0 && gen.freshSizes.every(([n, allAdmin]) => n >= 3 && n <= 4 && allAdmin), JSON.stringify(gen.freshSizes.slice(0, 10)));
check("payout uses the CATEGORY's multiplier: Elite tech gigs pay the Elite band × base × payScale, Novice writing/admin the Novice band", gen.payOk === true, JSON.stringify(gen.paySamples));

// ---------------------------------------------------------------- 4
console.log('\n4. deliverGig — a writing gig moves writing rep only, money moves by exactly the payout through EARN_MONEY, the tax accumulator and tracker agree');
const deliver = J(`(() => {
  const g = __mk(4, 1);
  __setRep(g, { tech: 55, writing: 10 }); __setLevel(g, 'tech', 3); __setLevel(g, 'writing', 2);
  g.player.money = 1000;
  g.world.taxes = { quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0 };
  generateGigsForDay(g, 1);
  const gigs = __gigs(g);
  const writingGig = gigs.board.find(b => b.category === 'writing');
  if (!writingGig) return { noWriting: true, board: gigs.board.map(b => b.category) };
  const acc = acceptGig(g, writingGig.gigId);
  const trackerBefore = trackerGigs(g).map(t => t.key);
  const before = { ...gigs.reputation };
  const moneyBefore = g.player.money;
  // Work one real block through workGigBlock, then finish it by hand (the
  // rest of the block path — focus, burnout, metabolism — is the vocation
  // plan's, verified there); deliver 2+ days early for the bonus.
  const w = workGigBlock(g, writingGig.gigId, 'computer');
  const heldGig = gigs.accepted.find(x => x.gigId === writingGig.gigId);
  heldGig.blocksDone = heldGig.blocks;
  g.meta.clock.day = Math.max(1, heldGig.deadlineDay - 3);
  const r = deliverGig(g, writingGig.gigId);
  const after = { ...gigs.reputation };
  const expectedDelta = Math.round(GIG_REP_DELIVERY * clamp(heldGig.blocks / GIG_REP_SIZE_BLOCK, GIG_REP_SIZE_MIN, GIG_REP_SIZE_MAX) + GIG_REP_EARLY_BONUS);
  return {
    accOk: acc.ok, workOk: w.ok && w.progress > 0,
    trackerBefore, trackerAfter: trackerGigs(g).map(t => t.key),
    before, after, expectedDelta, r: { ok: r.ok, late: r.late, payout: r.payout, repDelta: r.repDelta, category: r.category, tierUp: r.tierUp, appliedTypes: (r.applied || []).map(a => a.type) },
    moneyDelta: g.player.money - moneyBefore, quarterGross: g.world.taxes.quarterGross, gigPayout: writingGig.payout,
    stillHeld: gigs.accepted.length,
  };
})()`);
check('a writing gig was on the board, accepted, and one block worked through workGigBlock', !deliver.noWriting && deliver.accOk === true && deliver.workOk === true, JSON.stringify(deliver));
if (!deliver.noWriting) {
  check('the tracker listed the accepted gig before delivery and not after', deliver.trackerBefore.length === 1 && deliver.trackerBefore[0].startsWith('gig:') && deliver.trackerAfter.length === 0, JSON.stringify([deliver.trackerBefore, deliver.trackerAfter]));
  check(`writing rep moved by exactly the size-scaled delivery gain + early bonus (${deliver.expectedDelta}); tech/admin/music/art/food untouched`,
    deliver.after.writing - deliver.before.writing === deliver.expectedDelta && deliver.r.repDelta === deliver.expectedDelta
    && ['tech', 'admin', 'music', 'art', 'food'].every(k => deliver.after[k] === deliver.before[k]), JSON.stringify([deliver.before, deliver.after, deliver.r]));
  check("deliverGig reports category 'writing'", deliver.r.category === 'writing', JSON.stringify(deliver.r));
  check('player.money moved by exactly the gig payout, via EARN_MONEY (applied[] carries it), and taxes.quarterGross agrees', deliver.moneyDelta === deliver.gigPayout && deliver.quarterGross === deliver.gigPayout && deliver.r.appliedTypes.includes('EARN_MONEY') && deliver.stillHeld === 0, JSON.stringify([deliver.moneyDelta, deliver.gigPayout, deliver.quarterGross, deliver.r.appliedTypes]));
}

// ---------------------------------------------------------------- 5
console.log('\n5. Promotion is per category and upward only; abandon and missed deadlines debit the gig\'s own category');
const promo = J(`(() => {
  const out = {};
  // Writing at 18: a 5-block on-time delivery (+5, +2 early) crosses 20 → Competent in writing; tech at 90 stays Elite.
  const g = __mk(5, 1);
  __setRep(g, { tech: 90, writing: 18 }); __setLevel(g, 'tech', 5); __setLevel(g, 'writing', 1);
  const gigs = __gigs(g);
  gigs.accepted.push({ gigId: 'w1', templateId: 'copy_edit', label: 'Copy Edit Pass', client: 'Marlow Books', category: 'writing', blocks: 5, deadlineDay: 6, payout: 250, rush: false, blocksDone: 5, acceptedDay: 1 });
  g.meta.clock.day = 2;
  const r1 = deliverGig(g, 'w1');
  out.up = { tierUp: r1.tierUp, rep: { ...gigs.reputation } };
  // Late delivery from 21 (Competent, just above the floor) drops below 20: tierUp must be null, not a "promotion" to Novice.
  gigs.reputation.writing = 21;
  gigs.accepted.push({ gigId: 'w2', templateId: 'copy_edit', label: 'Copy Edit Pass', client: 'Marlow Books', category: 'writing', blocks: 5, deadlineDay: 3, payout: 250, rush: false, blocksDone: 5, acceptedDay: 1 });
  g.meta.clock.day = 5;
  const r2 = deliverGig(g, 'w2');
  out.down = { tierUp: r2.tierUp, late: r2.late, repDelta: r2.repDelta, writing: gigs.reputation.writing };
  // Abandon a tech gig: tech drops by GIG_REP_ABANDON × size, writing untouched.
  gigs.accepted.push({ gigId: 't1', templateId: 'app_feature', label: 'App Feature Build', client: 'Bramble Inc', category: 'tech', blocks: 10, deadlineDay: 20, payout: 6000, rush: false, blocksDone: 1, acceptedDay: 5 });
  const wBefore = gigs.reputation.writing, tBefore = gigs.reputation.tech;
  const r3 = abandonGig(g, 't1');
  out.abandon = { category: r3.category, repDelta: r3.repDelta, techDelta: gigs.reputation.tech - tBefore, writingDelta: gigs.reputation.writing - wBefore, expected: Math.round(GIG_REP_ABANDON * clamp(10 / GIG_REP_SIZE_BLOCK, GIG_REP_SIZE_MIN, GIG_REP_SIZE_MAX)) };
  // Missed deadline on an OLD-SHAPE accepted gig (category 'dev', template infra_project) — the rep category resolves to tech via the template.
  gigs.accepted.push({ gigId: 'old1', templateId: 'infra_project', label: 'Infrastructure Project', client: 'Mesa Cloud', category: 'dev', blocks: 20, deadlineDay: 6, payout: 9000, rush: false, blocksDone: 0, acceptedDay: 1 });
  const tBefore2 = gigs.reputation.tech, moneyBefore = g.player.money;
  g.meta.clock.day = 7;
  const res = processGigDeadlinesForDay(g, 7);
  out.missed = { results: res.map(x => ({ missed: x.missed, category: x.category, repDelta: x.repDelta, partialPay: x.partialPay })), techDelta: gigs.reputation.tech - tBefore2, moneyDelta: g.player.money - moneyBefore, expected: Math.round(GIG_REP_MISS * clamp(20 / GIG_REP_SIZE_BLOCK, GIG_REP_SIZE_MIN, GIG_REP_SIZE_MAX)), held: gigs.accepted.length };
  out.repCat = [gigRepCategory({ templateId: 'web_tweak', category: 'web' }), gigRepCategory({ templateId: 'gone_template', category: 'dev' }), gigRepCategory({ templateId: 'gone_template', category: 'food' }), gigRepCategory({ templateId: 'jingle' })];
  out.label = [gigCategoryLabel('tech'), gigCategoryLabel('food'), gigCategoryLabel('dev'), gigCategoryLabel(undefined)];
  return out;
})()`);
check("crossing 20 in writing reports tierUp { from: 'Novice', to: 'Competent', category: 'writing' } while tech stays 90/Elite", promo.up.tierUp && promo.up.tierUp.from === 'Novice' && promo.up.tierUp.to === 'Competent' && promo.up.tierUp.category === 'writing' && promo.up.rep.writing === 25 && promo.up.rep.tech === 90, JSON.stringify(promo.up));
check('a late delivery that drops writing below its floor reports NO tierUp (a demotion is not a milestone)', promo.down.tierUp === null && promo.down.late === true && promo.down.repDelta < 0 && promo.down.writing < 20, JSON.stringify(promo.down));
check(`abandoning a tech gig debits tech by GIG_REP_ABANDON × size (${promo.abandon.expected}) and leaves writing alone`, promo.abandon.category === 'tech' && promo.abandon.repDelta === promo.abandon.expected && promo.abandon.techDelta === promo.abandon.expected && promo.abandon.writingDelta === 0, JSON.stringify(promo.abandon));
check(`a missed deadline on a pre-migration 'dev' gig resolves to tech through its template and debits tech by ${promo.missed.expected}; no partial pay at 0 blocks`, promo.missed.results.length === 1 && promo.missed.results[0].missed === true && promo.missed.results[0].category === 'tech' && promo.missed.techDelta === promo.missed.expected && promo.missed.moneyDelta === 0 && promo.missed.held === 0, JSON.stringify(promo.missed));
check("gigRepCategory: template wins ('web'→tech), a gone template falls back to the instance's category if it is a real one (food) else tech", JSON.stringify(promo.repCat) === JSON.stringify(['tech', 'tech', 'food', 'music']), JSON.stringify(promo.repCat));
check("gigCategoryLabel: 'Tech', 'Food', and an unowned id/undefined echo harmlessly", JSON.stringify(promo.label) === JSON.stringify(['Tech', 'Food', 'dev', '']), JSON.stringify(promo.label));

// ---------------------------------------------------------------- 6
console.log('\n6. Save round-trip — world.computer.apps.gigs.reputation rides captureSavePayload → JSON → normalizeComputerState byte-identical (D58)');
const persist = J(`(() => {
  const g = __mk(6, 1);
  __setRep(g, { tech: 44, writing: 7, food: 3 });
  const payload = captureSavePayload(g);
  const rt = JSON.parse(JSON.stringify(payload));
  const loadedComputer = normalizeComputerState(rt.world && rt.world.computer);
  return {
    live: g.world.computer.apps.gigs.reputation,
    saved: rt.world && rt.world.computer && rt.world.computer.apps.gigs.reputation,
    loaded: loadedComputer.apps.gigs.reputation,
    same: JSON.stringify(rt.world.computer.apps.gigs.reputation) === JSON.stringify(g.world.computer.apps.gigs.reputation)
       && JSON.stringify(loadedComputer.apps.gigs.reputation) === JSON.stringify(g.world.computer.apps.gigs.reputation),
    tierAfterLoad: gigTier(gigCategoryRep(loadedComputer.apps.gigs, 'tech')).name,
    inSaveKeys: SAVE_KEYS.find(e => e.folder === 'world').keys.includes('computer'),
  };
})()`);
check('the persisted computer record carries the map { tech: 44, writing: 7, food: 3, zeros } exactly as the live state does, and reads back through normalizeComputerState unchanged', persist.same === true && persist.loaded.tech === 44 && persist.loaded.writing === 7 && persist.loaded.food === 3 && persist.loaded.admin === 0, JSON.stringify(persist));
check("gigTier over the loaded record reads tech 'Established' — no reader is left on the scalar", persist.tierAfterLoad === 'Established' && persist.inSaveKeys === true, JSON.stringify(persist));

// ---------------------------------------------------------------- 7
console.log('\n7. Source sweep — no reader of the scalar shape survives in srcfiles/');
const srcFiles = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
const scalarReads = [];
for (const f of srcFiles) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (/gigs\.reputation\s*\|\|\s*0/.test(line) || /gigs\.reputation\s*=\s*clamp/.test(line) || /gigTier\(gigs\.reputation\)/.test(line)) scalarReads.push(`${f}:${i + 1}: ${line.trim()}`);
  });
}
check(`no \`gigs.reputation || 0\` / scalar clamp-assign / gigTier(gigs.reputation) reader remains across ${srcFiles.length} source files`, scalarReads.length === 0, scalarReads.join('\n        '));
const indexHtml = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8');
check('index.html styles the new board pieces (.wh-chip, .wh-rep-strip, .wh-group-head) — the renderer has CSS to land on', /\.wh-chip\b/.test(indexHtml) && /\.wh-rep-strip\b/.test(indexHtml) && /\.wh-group-head\b/.test(indexHtml));
const uiSrc = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
check("ui.js dispatches 'gig.filter' and exempts it from the energy gate (a filter is reading a screen)", /case 'gig\.filter':/.test(uiSrc) && /'gig\.filter',/.test(uiSrc));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
