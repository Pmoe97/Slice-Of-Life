// Phase 2 verification — relationship phase derivation (D1-D3).
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const ctx = vm.createContext({ console, Math, JSON, Object, Array, String, Number, RegExp, Set, Map, Date, Promise });

// state.js declares the real DEV and assert, and derives DEV from `window`
// — so provide window (with generatorIsUnsaved false, i.e. NOT dev, so a
// failed assert throws nothing during migration tests) rather than stubbing
// DEV ourselves, which collides with its real `const`.
vm.runInContext(`
  var window = { generatorPublicId: 'test', generatorIsUnsaved: false };
  var root = { kv: {} };
  function mulberry32(seed){ let a = seed >>> 0; return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
`, ctx);

for (const f of ['config.js', 'npc.js', 'state.js']) {
  try { vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f }); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); process.exit(1); }
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const api = (e) => vm.runInContext(e, ctx);
ctx.__t = {};

const derive = (rel) => { ctx.__t.rel = rel; return api(`deriveConversationPhase(__t.rel)`); };

console.log('\nD1 — a stranger scores zero and reads `early`');
const fresh = derive({ trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0 });
check('fresh NPC → intimacyLevel 0', fresh.intimacyLevel === 0, `got ${fresh.intimacyLevel}`);
check('fresh NPC → phase "early"', fresh.conversationPhase === 'early', `got ${fresh.conversationPhase}`);

// The scene prompt template asks for a relationshipDeltas object every turn.
// A zero-valued one is the common case and must not promote anyone.
ctx.__t.npc = {
  bible: { name: 'Hana' },
  relPlayer: { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0,
               conversationPhase: 'early', intimacyLevel: 0, grievances: [] },
  memory: { recent: [], facts: [], episodes: [], styleCounters: {} }, mood: 0,
};
api(`__t.after = applyRelDelta(__t.npc, { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0 }, 1);`);
check('a zero-delta turn leaves them at "early"', api(`__t.after.relPlayer.conversationPhase`) === 'early',
      `got ${api(`__t.after.relPlayer.conversationPhase`)}`);

// One genuinely warm exchange should not vault a stranger up the ladder.
api(`__t.warm = applyRelDelta(__t.npc, { trust: 0.1, affection: 0.1 }, 1);`);
check('one warm exchange still reads "early"', api(`__t.warm.relPlayer.conversationPhase`) === 'early',
      `got ${api(`__t.warm.relPlayer.conversationPhase`)} @ ${api(`__t.warm.relPlayer.intimacyLevel`)}`);

console.log('\nD1 — the ladder spans, and every rung is reachable');
const rungs = [
  ['early',    { trust: 0.1,  affection: 0.1,  comfort: 0.05, tension: 0 }],
  ['familiar', { trust: 0.4,  affection: 0.4,  comfort: 0.1,  tension: 0 }],
  ['close',    { trust: 0.6,  affection: 0.6,  comfort: 0.35, tension: 0 }],
  ['intimate', { trust: 0.9,  affection: 0.9,  comfort: 0.8,  tension: 0 }],
];
for (const [expected, rel] of rungs) {
  const r = derive({ respect: 0, desire: 0, ...rel });
  check(`${expected.padEnd(8)} reachable (level ${String(r.intimacyLevel).padStart(3)})`, r.conversationPhase === expected,
        `got ${r.conversationPhase}`);
}

console.log('\nD2 — tension subtracts');
const hostile = derive({ trust: 0.9, affection: 0.9, comfort: 0.8, tension: 0.9, respect: 0, desire: 0 });
const same = derive({ trust: 0.9, affection: 0.9, comfort: 0.8, tension: 0, respect: 0, desire: 0 });
check('high tension drags the level down', hostile.intimacyLevel < same.intimacyLevel,
      `${hostile.intimacyLevel} vs ${same.intimacyLevel}`);
check('someone furious with you is not "intimate"', hostile.conversationPhase !== 'intimate',
      `got ${hostile.conversationPhase}`);

console.log('\nBounds — the formula never leaves [0,100]');
const floor = derive({ trust: -1, affection: -1, comfort: 0, tension: 1, respect: 0, desire: 0 });
const ceil  = derive({ trust: 1, affection: 1, comfort: 1, tension: -1, respect: 0, desire: 0 });
check('worst case clamps to 0, not negative', floor.intimacyLevel === 0, `got ${floor.intimacyLevel}`);
check('worst case reads "early"', floor.conversationPhase === 'early');
check('best case clamps to 100, not over', ceil.intimacyLevel === 100, `got ${ceil.intimacyLevel}`);
check('missing axes are tolerated (partial rel object)', derive({ trust: 0.5 }).intimacyLevel === 13,
      `got ${derive({ trust: 0.5 }).intimacyLevel}`);

console.log('\nMove-in gates that read this ladder are still passable');
// MOVE_IN_TUNING.advocatePlayerPhaseMin='familiar', playerPhaseMin='close'.
// The audit found both silently loosened by the old formula; confirm they are
// now real gates but not impossible ones.
ctx.__t.gateNpc = { relPlayer: derive({ trust: 0.4, affection: 0.4, comfort: 0.1, tension: 0 }) };
check('a stranger fails the advocate gate',
      api(`hasPlayerPhaseAtLeast({ relPlayer: { conversationPhase: 'early' } }, MOVE_IN_TUNING.advocatePlayerPhaseMin)`) === false);
check('a genuinely familiar NPC passes the advocate gate',
      api(`hasPlayerPhaseAtLeast({ relPlayer: { conversationPhase: 'familiar' } }, MOVE_IN_TUNING.advocatePlayerPhaseMin)`) === true);
check('familiar does NOT pass the stricter move-in gate',
      api(`hasPlayerPhaseAtLeast({ relPlayer: { conversationPhase: 'familiar' } }, MOVE_IN_TUNING.playerPhaseMin)`) === false);
check('close passes the move-in gate',
      api(`hasPlayerPhaseAtLeast({ relPlayer: { conversationPhase: 'close' } }, MOVE_IN_TUNING.playerPhaseMin)`) === true);

console.log('\nD3 — the npcs 3→4 migration re-derives rather than patching');
// A FLOOR, never an equality (README rule 4). This pinned `=== 4` and Plan 4's
// belief-record migrations took the npcs folder to 6, so a later plan doing
// exactly what it should reported as a Plan 0 regression. Versions only go up;
// what this phase cares about is that the 3->4 step exists and still runs,
// which is the assertion below.
check('FOLDER_VERSIONS.npcs is at least 4', api(`FOLDER_VERSIONS.npcs`) >= 4, `got ${api(`FOLDER_VERSIONS.npcs`)}`);
const steps = api(`MIGRATIONS.npcs.map(m => m.from + '->' + m.to)`);
check('a 3->4 step is registered', steps.includes('3->4'), `got ${steps.join(', ')}`);

// A save written under the old formula: neutral axes, but stored as familiar.
ctx.__t.stale = {
  bible: { name: 'Marcus' },
  relPlayer: { trust: 0, affection: 0, tension: 0, respect: 0, comfort: 0, desire: 0,
               intimacyLevel: 25, conversationPhase: 'familiar', grievances: [] },
};
api(`__t.migrated = MIGRATIONS.npcs.find(m => m.to === 4).fn(__t.stale);`);
check('an inflated stored phase drops to "early" on load',
      api(`__t.migrated.relPlayer.conversationPhase`) === 'early',
      `got ${api(`__t.migrated.relPlayer.conversationPhase`)}`);
check('and its stored intimacyLevel is recomputed to 0',
      api(`__t.migrated.relPlayer.intimacyLevel`) === 0);
check('the migration output agrees with deriveConversationPhase exactly',
      api(`__t.migrated.relPlayer.conversationPhase`) === api(`deriveConversationPhase(__t.stale.relPlayer).conversationPhase`));
check('non-relPlayer fields survive untouched', api(`__t.migrated.bible.name`) === 'Marcus');
check('an npc with no relPlayer passes through without throwing',
      (() => { try { api(`MIGRATIONS.npcs.find(m => m.to === 4).fn({ bible: {} })`); return true; } catch { return false; } })());

// An earned relationship must NOT be flattened by the migration.
ctx.__t.earned = { relPlayer: { trust: 0.7, affection: 0.7, comfort: 0.4, tension: 0.05, respect: 0, desire: 0,
                                intimacyLevel: 99, conversationPhase: 'intimate' } };
api(`__t.earnedOut = MIGRATIONS.npcs.find(m => m.to === 4).fn(__t.earned);`);
check('a genuinely earned relationship keeps a high rung',
      ['close', 'intimate'].includes(api(`__t.earnedOut.relPlayer.conversationPhase`)),
      `got ${api(`__t.earnedOut.relPlayer.conversationPhase`)}`);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
