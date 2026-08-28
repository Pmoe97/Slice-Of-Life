// Troubleshooting export log (Cheat menu, Discord feedback 2026-08-24).
//
//   node dev/verify/verify-debuglog.js
//
// Covers debuglog.js's own invariants (write/prune/query/format) against a
// real vm engine, plus the registration hazards the plan called out by
// name: the file must be listed in BOTH index.html and loadgame.js's ORDER
// (README rule 6 — this is the exact rumination.js failure mode), and
// world.debugLog must be listed in all THREE of state.js's SAVE_KEYS,
// WORLD_KEY_FALLBACKS, and loadGameState's hand-list, or it writes fine all
// session and silently reads back empty next load.
//
// What this file does NOT cover: a live resolveTick/evaluateDrives pass
// producing a real 'movement' entry for a forced sneak_into_bed scenario.
// The vm harness's root.kv = {} stub has no real storage, so it can
// exercise logDebugEvent/pruneDebugLog/queryDebugLog directly but not the
// state.js persistence wiring or a full multi-day tick loop — those are the
// dev-harness.html browser checks in the plan.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['debuglog.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

const srcOf = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', f), 'utf8');
const mainHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const loadgameSrc = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
const stateSrc = srcOf('state.js');

// ---------------------------------------------------------------------------
console.log('\nregistration: the two-place and three-place hazards the plan named');

check('debuglog.js is loaded by index.html', /debuglog\.js\?v=\d+/.test(mainHtml));
check('debuglog.js is listed in loadgame.js ORDER', /'debuglog\.js'/.test(loadgameSrc));
check('debugLog is listed in state.js SAVE_KEYS (world folder)', /'debugLog',/.test(stateSrc));
check('debugLog has a WORLD_KEY_FALLBACKS default', /debugLog: \(\) => \[\]/.test(stateSrc));
check('loadGameState reads debugLog back from kv', /getWorld\('debugLog'\)/.test(stateSrc));
check('loadGameState assembles debugLog into the world object it returns', /world: \{[^}]*\bdebugLog\b/.test(stateSrc));
check('exportSaveRecord strips debugLog before it leaves the device', /debugLog: undefined/.test(stateSrc));
check('importSaveRecord resets debugLog on a device that already had one', /record\.payload\.world\.debugLog = \[\]/.test(stateSrc));

// ---------------------------------------------------------------------------
console.log('\nwrite-site hooks: every category has an instrumented producer');

check('sim.js resolveTick logs a movement entry (Hook 1)', /logDebugEvent\(gameState, 'movement'/.test(srcOf('sim.js')));
check('drives.js evaluateDrives logs a drive-driven movement entry (Hook 2)', /logDebugEvent\(gameState, 'movement'/.test(srcOf('drives.js')));
check('npc.js applyProposal logs conversation entries (Hook 3)', /logDebugEvent\(gameState, 'conversation'/.test(srcOf('npc.js')));
check('ui.js appendWorldEvents mirrors world events (Hook 4)', /logDebugEvent\(currentGameState,/.test(srcOf('ui.js')));
check('llm.js callLLM/callImLLM gate raw-prompt capture on the opt-in flag (Hook 5)',
  (srcOf('llm.js').match(/DEBUG_LOG_TUNING\.promptCaptureEnabled/g) || []).length >= 2);

check('the cheat menu has a Debug Log tab', /id: 'log', label: 'Debug Log'/.test(srcOf('config.js')));
check('the cheat menu wires the tab to its renderer', /log: renderCheatLogPane/.test(srcOf('menu.js')));
check('renderCheatLogPane and the export modal exist', /function renderCheatLogPane\(/.test(srcOf('ui.js')) && /function showLogExportModal\(/.test(srcOf('ui.js')));

// ---------------------------------------------------------------------------
console.log('\nlogDebugEvent: the single writer');

check('is a no-op rather than throwing when gameState/world/clock is missing', api(`
  (() => {
    try {
      logDebugEvent(null, 'movement', 'x', {});
      logDebugEvent({}, 'movement', 'x', {});
      logDebugEvent({ world: {} }, 'movement', 'x', {});
      return true;
    } catch (e) { return false; }
  })()
`));

check('stamps day/minutes/tick off gameState.meta.clock and pushes one entry', api(`
  (() => {
    const gs = { world: {}, meta: { clock: { day: 5, minutes: 90 } } };
    logDebugEvent(gs, 'movement', 'npc_1', { from: 'a', to: 'b' });
    const e = gs.world.debugLog[0];
    return gs.world.debugLog.length === 1 && e.category === 'movement' && e.day === 5 &&
      e.minutes === 90 && e.tick === getTickIndex(90) &&
      Array.isArray(e.npcIds) && e.npcIds[0] === 'npc_1' && e.detail.from === 'a';
  })()
`));

check('npcIds accepts an array, a single id, or none, always normalized to an array', api(`
  (() => {
    const gs = { world: {}, meta: { clock: { day: 1, minutes: 0 } } };
    logDebugEvent(gs, 'world_event', ['a', 'b'], {});
    logDebugEvent(gs, 'world_event', 'c', {});
    logDebugEvent(gs, 'world_event', null, {});
    return JSON.stringify(gs.world.debugLog.map(e => e.npcIds)) === JSON.stringify([['a', 'b'], ['c'], []]);
  })()
`));

// ---------------------------------------------------------------------------
console.log('\npruneDebugLog: the day-window and count caps hold independently');

check('evicts entries older than today minus maxDays', api(`
  (() => {
    const gs = { world: { debugLog: [] }, meta: { clock: { day: 100, minutes: 0 } } };
    gs.world.debugLog.push({ category: 'movement', day: 100 - DEBUG_LOG_TUNING.maxDays - 1, minutes: 0, tick: 0, npcIds: [], detail: {} });
    gs.world.debugLog.push({ category: 'movement', day: 100 - DEBUG_LOG_TUNING.maxDays, minutes: 0, tick: 0, npcIds: [], detail: {} });
    pruneDebugLog(gs);
    return gs.world.debugLog.length === 1 && gs.world.debugLog[0].day === 100 - DEBUG_LOG_TUNING.maxDays;
  })()
`));

check('caps non-prompt entries at maxEntries, dropping the oldest first', api(`
  (() => {
    const gs = { world: { debugLog: [] }, meta: { clock: { day: 1, minutes: 0 } } };
    const total = DEBUG_LOG_TUNING.maxEntries + 10;
    for (let i = 0; i < total; i++) {
      gs.world.debugLog.push({ category: 'movement', day: 1, minutes: 0, tick: 0, npcIds: [], detail: { i } });
    }
    pruneDebugLog(gs);
    const kept = gs.world.debugLog;
    return kept.length === DEBUG_LOG_TUNING.maxEntries && kept[kept.length - 1].detail.i === total - 1;
  })()
`));

check('caps prompt entries at maxPromptEntries, independently of the main cap', api(`
  (() => {
    const gs = { world: { debugLog: [] }, meta: { clock: { day: 1, minutes: 0 } } };
    for (let i = 0; i < DEBUG_LOG_TUNING.maxEntries - 3; i++) {
      gs.world.debugLog.push({ category: 'movement', day: 1, minutes: 0, tick: 0, npcIds: [], detail: {} });
    }
    const totalPrompts = DEBUG_LOG_TUNING.maxPromptEntries + 7;
    for (let i = 0; i < totalPrompts; i++) {
      gs.world.debugLog.push({ category: 'prompt', day: 1, minutes: 0, tick: 0, npcIds: [], detail: { i } });
    }
    pruneDebugLog(gs);
    const kept = gs.world.debugLog;
    const nonPrompt = kept.filter(e => e.category !== 'prompt');
    const prompts = kept.filter(e => e.category === 'prompt');
    return nonPrompt.length === DEBUG_LOG_TUNING.maxEntries - 3 &&
      prompts.length === DEBUG_LOG_TUNING.maxPromptEntries &&
      prompts[prompts.length - 1].detail.i === totalPrompts - 1;
  })()
`));

// ---------------------------------------------------------------------------
console.log('\nqueryDebugLog: the three filters, independently and combined');

check('dayFrom/dayTo, npcIds, and categories each filter correctly on their own', api(`
  (() => {
    const gs = { world: { debugLog: [
      { category: 'movement', day: 1, minutes: 0, tick: 0, npcIds: ['a'], detail: {} },
      { category: 'conversation', day: 5, minutes: 0, tick: 0, npcIds: ['b'], detail: {} },
      { category: 'world_event', day: 10, minutes: 0, tick: 0, npcIds: ['a', 'b'], detail: {} },
    ] } };
    const byDay = queryDebugLog(gs, { dayFrom: 4, dayTo: 9 });
    const byNpc = queryDebugLog(gs, { npcIds: ['b'] });
    const byCat = queryDebugLog(gs, { categories: ['movement'] });
    const all = queryDebugLog(gs, {});
    return byDay.length === 1 && byDay[0].day === 5 &&
      byNpc.length === 2 &&
      byCat.length === 1 && byCat[0].category === 'movement' &&
      all.length === 3;
  })()
`));

check('filters combine as an AND, not an OR', api(`
  (() => {
    const gs = { world: { debugLog: [
      { category: 'movement', day: 1, minutes: 0, tick: 0, npcIds: ['a'], detail: {} },
      { category: 'movement', day: 20, minutes: 0, tick: 0, npcIds: ['a'], detail: {} },
      { category: 'conversation', day: 1, minutes: 0, tick: 0, npcIds: ['a'], detail: {} },
    ] } };
    const both = queryDebugLog(gs, { dayFrom: 1, dayTo: 1, categories: ['movement'] });
    return both.length === 1 && both[0].category === 'movement' && both[0].day === 1;
  })()
`));

// ---------------------------------------------------------------------------
console.log('\nexport formatting: readable, non-throwing, and stable aside from the timestamp');

check('formatDebugLogText/Json do not throw on an empty log', api(`
  (() => {
    const gs = { npcs: {}, world: { debugLog: [] } };
    const t = formatDebugLogText([], gs);
    const j = JSON.parse(formatDebugLogJson([], gs, {}));
    return typeof t === 'string' && t.length > 0 && Array.isArray(j.entries) && j.entries.length === 0;
  })()
`));

check('formatDebugLogJson is deterministic aside from exportedAt', api(`
  (() => {
    const gs = { npcs: {}, world: { debugLog: [] } };
    const entries = [{ category: 'movement', day: 1, minutes: 0, tick: 0, npcIds: [], detail: { a: 1 } }];
    const j1 = JSON.parse(formatDebugLogJson(entries, gs, { dayFrom: 1 }));
    const j2 = JSON.parse(formatDebugLogJson(entries, gs, { dayFrom: 1 }));
    delete j1.exportedAt; delete j2.exportedAt;
    return JSON.stringify(j1) === JSON.stringify(j2);
  })()
`));

check('formatDebugLogText renders every category readably, including the sneak_into_bed case', api(`
  (() => {
    const gs = { npcs: { npc_1: { bible: { name: 'Maya' } } }, world: { debugLog: [] } };
    const entries = [
      { category: 'movement', day: 2, minutes: 870, tick: getTickIndex(870), npcIds: ['npc_1'],
        detail: { from: 'bedroom_1', to: 'player_bedroom', branch: 'drive', driveId: 'sneak_into_bed',
                  score: 2.1, terms: { base: 0.4 }, runnerUp: { driveId: 'sleep', score: 1.0 } } },
      { category: 'conversation', day: 2, minutes: 600, tick: getTickIndex(600), npcIds: ['npc_1'],
        detail: { channel: 'scene', speaker: 'npc_1', text: 'Hello there' } },
      { category: 'conversation_ambient', day: 2, minutes: 600, tick: getTickIndex(600), npcIds: ['npc_1'],
        detail: { npcId: 'npc_1', template: '{name} chatted about the weather.', data: {} } },
      { category: 'world_event', day: 2, minutes: 600, tick: getTickIndex(600), npcIds: ['npc_1'],
        detail: { npcId: 'npc_1', template: '{name} felt better.', data: {} } },
      { category: 'prompt', day: 2, minutes: 600, tick: getTickIndex(600), npcIds: ['npc_1'],
        detail: { channel: 'scene', prompt: 'PROMPT TEXT HERE' } },
    ];
    const text = formatDebugLogText(entries, gs);
    return text.includes('sneak_into_bed') && text.includes('Maya') &&
      text.includes('Hello there') && text.includes('chatted about the weather') &&
      text.includes('felt better') && text.includes('PROMPT TEXT HERE');
  })()
`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
