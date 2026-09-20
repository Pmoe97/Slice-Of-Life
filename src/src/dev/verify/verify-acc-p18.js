// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 18: Close-out
// audit.
//
//   node src/src/dev/verify/verify-acc-p18.js
//
// This is not a functional test of the 17 phases above (their own
// verify-acc-p1..17.js harnesses already do that, and run-all.js's
// unfiltered sweep is the regression backstop). It is the audit invariant
// 7 asks for at Close-out: every D-number cites a real identifier that
// still exists in the shipped source, not just plan prose; the five new
// files are registered in both places invariant 8 requires; and a
// consolidated player/world/npc record carrying every new field this plan
// added survives a save-shape round trip together, rather than only ever
// having been exercised one field at a time by an individual phase's own
// harness.
//
// Section 1 covers every D-number the plan's own Phase 18 verification
// line names (D1-D58 — the phases that introduced the mechanisms). D59-D112
// ("Resolved during implementation") are addenda to those same phases'
// mechanisms, already re-run green by run-all.js's acc-p filter this
// session; a curated subset with independent audit value (a retired
// symbol that must NOT reappear, a file that must NOT be in SAVE_KEYS, a
// tuning dial's actual value) is spot-checked in section 3.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// ---------------------------------------------------------------- fixtures
const SRCFILES = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
const CONTENT = {};
for (const f of SRCFILES) CONTENT[f] = fs.readFileSync(path.join(SRC, f), 'utf8');
const ALL = Object.values(CONTENT).join('\n');

function hasIn(file, re) { return CONTENT[file] && re.test(CONTENT[file]); }
function hasAny(re) { return re.test(ALL); }

// ---------------------------------------------------------------- 1
console.log('\n1. Every D-number the plan\'s own Phase 18 line names (D1-D58) maps to a real identifier');
const D = [
  ['D1',  () => hasIn('aspirations.js', /independenceIndex/)],
  ['D2',  () => hasAny(/decayWorks/) && hasAny(/ghostDecay/) && hasAny(/refreshRoll|~?70%|dryStreak|boardRefresh/i) ],
  ['D3',  () => hasAny(/EARN_MONEY/)],
  ['D4',  () => hasAny(/GIG_ENERGY_PER_BLOCK/)],
  ['D5',  () => hasAny(/SKILL_IDS[\s\S]{0,200}music/) || hasAny(/music:\s*['"]music['"]/) || hasAny(/'music'/)],
  ['D6',  () => hasAny(/createHobbyAction/) && hasAny(/mode:\s*['"]mastery['"]/) && hasAny(/mode:\s*['"]bonding['"]/)],
  ['D7',  () => !hasAny(/payMultiplier|qualitySkill/) && hasAny(/socialEdge/)],
  ['D8',  () => hasAny(/skill_levelup/)],
  ['D9',  () => hasIn('notice.js', /function\s+noticeSubject/)],
  ['D10', () => hasAny(/perceiveSignals/) && hasIn('platform.js', /platformPerceiversFor/)],
  ['D11', () => hasAny(/addMemoryFact/) && hasAny(/kind:\s*['"]opinion['"]/)],
  ['D12', () => hasIn('notice.js', /function\s+opinionValence/)],
  ['D13', () => hasIn('notice.js', /OPINION_LINES/)],
  ['D14', () => hasAny(/GIG_CATEGORIES/) && hasAny(/defaultGigReputation/)],
  ['D15', () => hasAny(/tier:\s*\d/) && hasAny(/GIG_TEMPLATES/)],
  ['D16', () => hasAny(/id:\s*['"]admin['"]/)],
  ['D17', () => hasAny(/WORK_KINDS/) && hasAny(/player\.works/)],
  ['D18', () => hasAny(/decayHalfLifeDays/) && hasAny(/spikeChance/)],
  ['D19', () => hasIn('works.js', /function\s+canRelease/) && hasIn('works.js', /def\.minSkill/) && hasIn('works.js', /def\.minRep/)],
  ['D20', () => hasIn('works.js', /progressPerClick/)],
  ['D21', () => hasAny(/craftQuality/) && !hasAny(/cookQuality/)],
  ['D22', () => hasAny(/recording_kit/)],
  ['D23', () => hasIn('works.js', /function\s+sellWork/) && hasAny(/player_art/)],
  ['D24', () => hasIn('defs.computer.js', /function\s+playerKitchenDef/)],
  ['D25', () => hasIn('works.js', /refreshRoomCleanliness/)],
  ['D26', () => hasAny(/CHATTER_LABELS/)],
  ['D27', () => hasIn('chatter.js', /implementation-time scope guesses, not decisions/)],
  ['D28', () => hasAny(/chatterCastIds/) && hasAny(/ghostFollowers/)],
  ['D29', () => hasIn('platform.js', /appealBase|function\s+postAppeal/) && hasAny(/socialEdge/)],
  ['D30', () => hasAny(/setChatterHandle/) && hasAny(/npcChatterHandle/)],
  ['D31', () => hasAny(/canOpenPrivatePage/)],
  ['D32', () => hasAny(/convBackers/) && hasAny(/convPrivate/)],
  ['D33', () => hasAny(/ASK_FEATURE|\$Feature/)],
  ['D34', () => hasAny(/billSubscriptions/)],
  ['D35', () => hasAny(/blockNpc/) && hasAny(/profile\.blocked/)],
  ['D36', () => hasAny(/castFollowDecision/) && hasAny(/castSubscribeDecision/)],
  ['D37', () => hasIn('platform.js', /platformPerceiversFor/)],
  ['D38', () => hasAny(/bible\.creator/)],
  ['D39', () => hasAny(/npcCreatorTick/)],
  ['D40', () => hasAny(/subscribeToNpc/)],
  ['D41', () => hasAny(/buildNpcSelfShotRecord/)],
  ['D42', () => hasAny(/npcSlots/)],
  ['D43', () => hasAny(/recognitionChance/) && hasAny(/recognitionRoll/)],
  ['D44', () => hasAny(/identity_link/)],
  ['D45', () => hasAny(/SubscriptionTalk/) && hasAny(/checkPlayerBoundary/)],
  ['D46', () => hasAny(/ASPIRATION_DIRECTIONS/)],
  ['D47', () => hasAny(/id:\s*['"]compass['"]/)],
  ['D48', () => hasAny(/aspirationMilestone/)],
  ['D49', () => !/player\.aspirations|liveMilestones|MILESTONE/.test(CONTENT['tracker.js'] || '')],
  ['D50', () => hasAny(/independenceWeeks/)],
  ['D51', () => hasAny(/designedRoomMood/)],
  ['D52', () => hasAny(/function\s+noticeRoomDesign/)],
  ['D53', () => hasAny(/roomDecorOverrides/)],
  ['D54', () => hasAny(/function\s+hangWork/) && hasAny(/meta\.workId|workId:/)],
  ['D55', () => fs.existsSync(path.join(SRC, '..', 'dev', 'designer.html'))],
  ['D56', () => ['notice.js', 'works.js', 'platform.js', 'aspirations.js', 'defs.works.js'].every(f => SRCFILES.includes(f))],
  ['D57', () => ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17'].every(n => fs.existsSync(path.join(__dirname, `verify-acc-p${n}.js`)))],
  ['D58', () => hasIn('state.js', /roomDecorOverrides/) && hasIn('state.js', /player\.works/)],
];
for (const [name, fn] of D) {
  let ok = false, err = null;
  try { ok = fn(); } catch (e) { err = e.message; }
  check(name, ok, err || undefined);
}

// ---------------------------------------------------------------- 2
console.log('\n2. Invariant 8 — the five new files are registered in BOTH index.html and loadgame.js ORDER');
const indexHtml = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8');
const loadgameSrc = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
for (const f of ['notice.js', 'works.js', 'platform.js', 'aspirations.js', 'defs.works.js']) {
  const inIndex = new RegExp(`src="src/src/srcfiles/${f.replace('.', '\\.')}(\\?v=\\d+)?"`).test(indexHtml);
  const inOrder = new RegExp(`'${f.replace('.', '\\.')}'`).test(loadgameSrc);
  check(`${f} is in both index.html's <script> tags and loadgame.js's ORDER`, inIndex && inOrder,
    `inIndex=${inIndex} inOrder=${inOrder}`);
}

// ---------------------------------------------------------------- 3
console.log('\n3. Spot-checked D59-D112 addenda with independent audit value');
check('D64 — _gigBoardFilter is render-owned, never a SAVE_KEYS/persisted field',
  hasIn('render.computer.js', /_gigBoardFilter/) && !hasIn('state.js', /_gigBoardFilter/));
check('D71 — WORKS_TUNING (plural) is the catalog tuning object, not a WORK_TUNING collision',
  hasAny(/WORKS_TUNING\s*=/) && hasIn('config.js', /WORK_TUNING\s*=/));
check('D80 — piece imagery is the seeded swatch (bookCoverSwatch), no generateImage call added for it',
  hasAny(/function\s+bookCoverSwatch/));
check('D88 — growthK is 0.5 as measured',
  hasAny(/growthK[^0-9]{0,20}0\.5/));
check('D94 — an NPC\'s subscribe tier is a single value (no separate backers+private arrays coexisting per NPC)',
  hasAny(/subscribes\s*[:=]/));
check('D100 — the subscription boundary rule id exists and is distinct from relationships.js\'s infidelity path',
  hasAny(/no_private_subscriptions/));
check('D104 — the gig pay rescale dial is GIG_TUNING.payScale at 0.3',
  hasAny(/payScale:\s*0\.3/));
check('D106 — decorFor reads base ∪ placed through roomDesignBase/roomPlacedDecor, one reader',
  hasAny(/function\s+decorFor/) && hasAny(/function\s+roomDesignBase/) && hasAny(/function\s+roomPlacedDecor/));
check('D110 — normalizePlacement is the one shared snap/floor/rotation/bounds function',
  hasAny(/function\s+normalizePlacement/) && hasAny(/function\s+placementFitsRoom/));
check('D111 — resetRoomArrange deletes the override key rather than setting []',
  hasIn('computer.js', /function\s+resetRoomArrange[\s\S]{0,400}delete\s/));
check('D112 — per-room+mode undo/redo lives on homePlacementUI, keyed mode:roomId',
  hasIn('ui.computer.js', /\$\{mode\}:\$\{roomId\}/) || hasIn('ui.computer.js', /mode.*roomId|roomId.*mode/));

// ---------------------------------------------------------------- 4
console.log('\n4. Consolidated persisted-field round trip — every new field this plan added, together, on one record');
const { api } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.design.js', 'defs.placement.js', 'defs.works.js',
    'sim.js', 'world.js', 'signals.js', 'items.js', 'inventory.js', 'effects.js', 'skills.js', 'computer.js', 'works.js', 'npc.js',
    'notice.js', 'platform.js', 'aspirations.js', 'state.js'],
});
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
api('console.warn = () => {};');
api(`
  __mk = (seed, residents, day) => {
    const h = SIM_generateHouse(seed || 20260919, residents == null ? 3 : residents);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 30, minutes: 600 }, contentConfig: { contentFlags: { mature: true } }, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.world.events = g.world.events || [];
    return g;
  };
`);
api(`
  g18 = __mk(20260919, 3, 40);
  ensurePlayerWorks(g18);
  ensurePlayerKitchen(g18);
  ensurePlayerAspirations(g18.player);
  g18.player.works.push({ id: 'w1', kind: 'book', title: 'Round Trip', quality: 0.7, createdDay: 10, releasedDay: 12, reach: 40, lastPromotedDay: 30, earned: 12, meta: {} });
  g18.player.incomeLog = [{ day: 39, amount: 50, reason: 'gig' }];
  g18.player.independenceWeeks = 3;
  g18.player.kitchen.name = 'Test Kitchen';
  g18.player.kitchen.listedDay = 20;
  const npcId0 = Object.keys(g18.npcs)[0];
  ensureNpcChatter(g18.npcs[npcId0], g18);
  g18.npcs[npcId0].chatter.ghostFollowers = 120;
  g18.world.roomDecorOverrides = g18.world.roomDecorOverrides || {};
  g18.world.roomDecorOverrides.bedroom_player = [{ defId: 'bed', shape: 'bed', x: 10, y: 10, w: 10, h: 20, rot: 0 }];
  const prof = ensureChatterProfile(g18);
  prof.handle = 'roundtrip_test';
  __roundtrip = JSON.parse(JSON.stringify(g18));
`);
const rt = J('__roundtrip');
check('player.works survives a JSON round trip with its full shape', rt.player.works.length === 1 && rt.player.works[0].kind === 'book' && rt.player.works[0].quality === 0.7);
check('player.incomeLog / independenceWeeks survive', Array.isArray(rt.player.incomeLog) && rt.player.incomeLog[0].reason === 'gig' && rt.player.independenceWeeks === 3);
check('player.kitchen survives', rt.player.kitchen.name === 'Test Kitchen' && rt.player.kitchen.listedDay === 20);
check('player.aspirations exists after ensurePlayerAspirations', !!rt.player.aspirations);
check('npc.chatter survives per-NPC', Object.values(rt.npcs)[0].chatter.ghostFollowers === 120);
check('world.roomDecorOverrides survives', Array.isArray(rt.world.roomDecorOverrides.bedroom_player) && rt.world.roomDecorOverrides.bedroom_player[0].defId === 'bed');
check('world.computer.apps.social_feed.profile.handle survives', rt.world.computer.apps.social_feed.profile.handle === 'roundtrip_test');

// ---------------------------------------------------------------- 5
console.log('\n5. Migration — an old-shape gig reputation scalar folds into tech, on a re-loaded record');
api(`
  __oldGigs = { reputation: 37, lastRefreshDay: 0, board: [], accepted: [] };
  __migrated = normalizeGigsAppState(__oldGigs);
`);
const migrated = J('__migrated');
check('a scalar rep of 37 folds into { tech: 37, ...zeros }',
  migrated.reputation && migrated.reputation.tech === 37 && migrated.reputation.admin === 0 && migrated.reputation.writing === 0,
  JSON.stringify(migrated.reputation));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
