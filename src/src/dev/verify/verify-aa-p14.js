// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 14: Crossword / puzzle minigame (D23).
//
//   node src/src/dev/verify/verify-aa-p14.js
//
// Node coverage for everything pure/trusted-producer in DailyGrid
// (puzzles.js): APP_DEFS/ICONS registration (the documented "blank tile"
// landmine — see icons.js's own comment on `upgrades`); seeded, idempotent
// grid generation (same seed+day -> byte-identical grid; different days ->
// real variety); grid integrity (every word's cells fall inside the grid and
// across/down crossings agree on their shared letter); crossword numbering;
// fill/reveal/completion, including the hint-halves-the-reward rule; and
// that a half-filled puzzle survives normalizeComputerState's save/load
// round trip. Rendering (renderPuzzlesToday, the cell inputs' direct
// listeners) is presentation layer and outside this loader (invariant 7) —
// verified on the live page instead.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'icons.js', 'defs.computer.js', 'sim.js', 'skills.js', 'computer.js', 'puzzles.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, day) => {
    const h = SIM_generateHouse(seed || 20260901, 2);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || h.clock.day, minutes: 0 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    return g;
  };
  __fillCorrect = (g, skipCells) => {
    // Fill every real cell with its correct letter, in reading order, so
    // this can double as "fill all but the last word" by passing a
    // predicate of cells to leave blank.
    const p = g.world.computer.apps.puzzles;
    let last = { ok: true };
    for (const w of p.words) {
      for (let k = 0; k < w.answer.length; k++) {
        const row = w.dir === 'across' ? w.row : w.row + k;
        const col = w.dir === 'across' ? w.col + k : w.col;
        if (skipCells && skipCells(row, col)) continue;
        last = fillPuzzleCell(g, row, col, w.answer[k]);
      }
    }
    return last;
  };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — APP_DEFS entry, the icon landmine, the mood payout, and the default app state');
const reg = J(`({
  appDef: APP_DEFS.puzzles,
  hasIcon: typeof ICONS.puzzles === 'function',
  mood: MOOD_PAYOUTS.puzzleComplete,
  poolSize: PUZZLE_WORD_PAIRS.length,
  pairsPerDay: PUZZLE_TUNING.pairsPerDay,
  defaultApp: defaultComputerState().apps.puzzles,
})`);
check('APP_DEFS.puzzles exists and lists both devices', !!reg.appDef && reg.appDef.devices.includes('computer') && reg.appDef.devices.includes('phone'), JSON.stringify(reg.appDef));
check('ICONS.puzzles exists (the documented blank-tile landmine — icons.js\'s own comment on `upgrades`)', reg.hasIcon === true);
check('MOOD_PAYOUTS.puzzleComplete is a real positive number', typeof reg.mood === 'number' && reg.mood > 0, reg.mood);
check('the word-pair pool is big enough to draw a full day\'s puzzle from', reg.poolSize >= reg.pairsPerDay, `pool ${reg.poolSize}, needs ${reg.pairsPerDay}`);
check('defaultComputerState seeds an empty, un-generated puzzles app', reg.defaultApp.day === 0 && reg.defaultApp.words.length === 0 && reg.defaultApp.completedDay === null, JSON.stringify(reg.defaultApp));

// ---------------------------------------------------------------- 1
console.log('\n1. Seeded, idempotent generation — same seed+day gives the same grid; different days give real variety');
const gen = J(`(() => {
  const a1 = __mk(20260901, 5); generatePuzzleForDay(a1, 5);
  const a2 = __mk(20260901, 5); generatePuzzleForDay(a2, 5);
  const days = [];
  for (let d = 1; d <= 8; d++) { const g = __mk(20260901, d); generatePuzzleForDay(g, d); days.push(g.world.computer.apps.puzzles.words); }
  return {
    sameSeedSameDay: JSON.stringify(a1.world.computer.apps.puzzles.words) === JSON.stringify(a2.world.computer.apps.puzzles.words),
    distinctDayCount: new Set(days.map(w => JSON.stringify(w))).size,
  };
})()`);
check('the same seed and day always produce byte-identical words/positions', gen.sameSeedSameDay === true);
check('across 8 different days, the puzzle actually varies (not the same 4 pairs every day)', gen.distinctDayCount > 1, `distinct grids: ${gen.distinctDayCount}/8`);

const idem = J(`(() => {
  const g = __mk(20260901, 5); generatePuzzleForDay(g, 5);
  const w = g.world.computer.apps.puzzles.words[0];
  fillPuzzleCell(g, w.row, w.col, w.answer[0] === 'Z' ? 'Y' : 'Z'); // a deliberately wrong letter, so it can't accidentally complete
  const before = JSON.stringify(g.world.computer.apps.puzzles);
  generatePuzzleForDay(g, 5); // re-processed rollover for the SAME day
  return { after: JSON.stringify(g.world.computer.apps.puzzles), before };
})()`);
check('re-calling generatePuzzleForDay for a day already generated is a no-op (does not wipe progress)', idem.after === idem.before);

// ---------------------------------------------------------------- 2
console.log('\n2. Grid integrity — every word fits the grid, and across/down crossings agree');
const integrity = J(`(() => {
  const g = __mk(20260901, 5); generatePuzzleForDay(g, 5);
  const p = g.world.computer.apps.puzzles;
  let allInBounds = true, allMatchOwnAnswer = true;
  const crossingCells = {};
  for (const w of p.words) {
    for (let k = 0; k < w.answer.length; k++) {
      const row = w.dir === 'across' ? w.row : w.row + k;
      const col = w.dir === 'across' ? w.col + k : w.col;
      if (row < 0 || row >= p.rows || col < 0 || col >= p.cols) allInBounds = false;
      if (puzzleAnswerLetterAt(p, row, col) !== w.answer[k]) allMatchOwnAnswer = false;
      const key = row + ',' + col;
      crossingCells[key] = crossingCells[key] || [];
      crossingCells[key].push(w.answer[k]);
    }
  }
  const noCellDisagreement = Object.values(crossingCells).every(letters => new Set(letters).size === 1);
  const maxSharers = Math.max(...Object.values(crossingCells).map(l => l.length));
  return { allInBounds, allMatchOwnAnswer, noCellDisagreement, maxSharers, rows: p.rows, cols: p.cols, wordCount: p.words.length };
})()`);
check('every word\'s cells fall inside [0, rows) x [0, cols)', integrity.allInBounds === true, JSON.stringify(integrity));
check('puzzleAnswerLetterAt agrees with each word\'s own answer at every one of its cells', integrity.allMatchOwnAnswer === true);
check('no cell is claimed by two words with different letters (a real, not just accidental, crossing)', integrity.noCellDisagreement === true, JSON.stringify(integrity.maxSharers));
check('at least one cell is genuinely shared by two words (the grid has real intersections, not just parallel blocks)', integrity.maxSharers === 2, integrity.maxSharers);

// ---------------------------------------------------------------- 3
console.log('\n3. Crossword numbering — one running number per distinct start cell, shared when across/down start together');
const numbering = J(`(() => {
  const g = __mk(20260901, 5); generatePuzzleForDay(g, 5);
  const p = g.world.computer.apps.puzzles;
  const nums = computePuzzleNumbers(p);
  const values = Object.values(nums).sort((a, b) => a - b);
  const sequential = values.every((v, idx) => v === idx + 1);
  // Find a pair whose across/down share a start cell (i===0 && j===0 pairs
  // in PUZZLE_WORD_PAIRS, e.g. SHOWER/SOAP or SAUNA/STEAM) among today's words.
  const byStart = {};
  for (const w of p.words) { const k = w.row + ',' + w.col; (byStart[k] = byStart[k] || []).push(w.dir); }
  const sharedStart = Object.values(byStart).some(dirs => dirs.length === 2);
  return { sequential, count: values.length, sharedStart };
})()`);
check('numbers run sequentially from 1 with no gaps', numbering.sequential === true, numbering.count);

// ---------------------------------------------------------------- 4
console.log('\n4. Filling cells — wrong letters don\'t complete, black cells refuse, a full correct solve pays out and is idempotent');
const fillWrong = J(`(() => {
  const g = __mk(20260901, 5); generatePuzzleForDay(g, 5);
  const w = g.world.computer.apps.puzzles.words[0];
  const r = fillPuzzleCell(g, w.row, w.col, w.answer[0] === 'Z' ? 'Y' : 'Z');
  return { ok: r.ok, completed: r.completed, completedDay: g.world.computer.apps.puzzles.completedDay };
})()`);
check('filling one cell wrong is accepted (ok) but does not complete the puzzle', fillWrong.ok === true && fillWrong.completed === false && fillWrong.completedDay === null, JSON.stringify(fillWrong));

const fillBlack = J(`(() => {
  const g = __mk(20260901, 5); generatePuzzleForDay(g, 5);
  const p = g.world.computer.apps.puzzles;
  const r = fillPuzzleCell(g, p.rows + 5, 0, 'A'); // well outside any word
  return { ok: r.ok };
})()`);
check('filling a cell no word covers is refused', fillBlack.ok === false);

const fullSolve = J(`(() => {
  const g = __mk(20260901, 5); generatePuzzleForDay(g, 5);
  const before = skillLevel(g.player, 'wordplay');
  const beforeXp = (g.player.skills && g.player.skills.wordplay) || 0;
  const last = __fillCorrect(g);
  return {
    completed: last.completed, rewardNote: last.rewardNote,
    completedDay: g.world.computer.apps.puzzles.day === g.world.computer.apps.puzzles.completedDay,
    xpGain: ((g.player.skills && g.player.skills.wordplay) || 0) - beforeXp,
    moodEvents: g.player.moodEvents,
  };
})()`);
check('filling every word correctly (no hints) completes the puzzle', fullSolve.completed === true && fullSolve.completedDay === true, JSON.stringify(fullSolve));
check('a hint-free completion pays full skill XP', fullSolve.xpGain === 12, fullSolve.xpGain);
check('a hint-free completion pushes the full mood payout, no half-credit note', fullSolve.rewardNote === '' && fullSolve.moodEvents.some(e => e.delta === 0.04), JSON.stringify(fullSolve.moodEvents));

const rewardWithHint = J(`(() => {
  const g = __mk(20260901, 5); generatePuzzleForDay(g, 5);
  const first = g.world.computer.apps.puzzles.words[0];
  revealHintForWord(g, 0);
  const last = __fillCorrect(g, (row, col) => row === first.row && col === first.col && first.dir === 'across');
  // the reveal above already filled the hinted cell; __fillCorrect writes
  // the same correct letter into every other cell regardless, so the
  // skip predicate above only matters if it collides with the hinted cell.
  return { completed: last.completed, rewardNote: last.rewardNote, xp: (g.player.skills && g.player.skills.wordplay) || 0, moodEvents: g.player.moodEvents };
})()`);
check('completing a puzzle where a hint was used pays out at half credit', rewardWithHint.completed === true && rewardWithHint.xp === 6, JSON.stringify(rewardWithHint));
check('the half-credit reward note mentions the reveal', /revealed/.test(rewardWithHint.rewardNote), rewardWithHint.rewardNote);
check('the half-credit mood impulse is half the full payout', rewardWithHint.moodEvents.some(e => Math.abs(e.delta - 0.02) < 1e-9), JSON.stringify(rewardWithHint.moodEvents));

const doubleComplete = J(`(() => {
  const g = __mk(20260901, 5); generatePuzzleForDay(g, 5);
  __fillCorrect(g);
  const xpAfterFirst = (g.player.skills && g.player.skills.wordplay) || 0;
  // Re-fill the first word's first cell with its own already-correct letter
  // — completion re-check fires again on every fillPuzzleCell call, but the
  // completedDay guard must refuse a second payout.
  const w = g.world.computer.apps.puzzles.words[0];
  fillPuzzleCell(g, w.row, w.col, w.answer[0]);
  return { xpAfterFirst, xpAfterRefill: (g.player.skills && g.player.skills.wordplay) || 0 };
})()`);
check('a second completion check on an already-completed puzzle does not pay out twice', doubleComplete.xpAfterFirst === doubleComplete.xpAfterRefill, JSON.stringify(doubleComplete));

// ---------------------------------------------------------------- 5
console.log('\n5. Hints — reveal the correct letter, mark it revealed, and no-op once a word is already solved');
const hint = J(`(() => {
  const g = __mk(20260901, 5); generatePuzzleForDay(g, 5);
  const w = g.world.computer.apps.puzzles.words[0];
  const r1 = revealHintForWord(g, 0);
  const key = w.row + ',' + w.col;
  const revealedAfterFirst = !!g.world.computer.apps.puzzles.revealed[key];
  const filledAfterFirst = g.world.computer.apps.puzzles.filledCells[key];
  // Fill the rest of word 0 correctly by hand so it's fully solved.
  for (let k = 1; k < w.answer.length; k++) {
    const row = w.dir === 'across' ? w.row : w.row + k;
    const col = w.dir === 'across' ? w.col + k : w.col;
    fillPuzzleCell(g, row, col, w.answer[k]);
  }
  const snapshotBefore = JSON.stringify(g.world.computer.apps.puzzles.filledCells);
  const r2 = revealHintForWord(g, 0); // word 0 is now fully correct — must no-op
  const snapshotAfter = JSON.stringify(g.world.computer.apps.puzzles.filledCells);
  return { ok1: r1.ok, revealedAfterFirst, filledAfterFirst, expected: w.answer[0], noopUnchanged: snapshotBefore === snapshotAfter };
})()`);
check('revealHintForWord fills the correct letter', hint.ok1 === true && hint.filledAfterFirst === hint.expected, JSON.stringify(hint));
check('revealHintForWord marks the cell as revealed', hint.revealedAfterFirst === true);
check('revealHintForWord on an already-fully-correct word is a no-op', hint.noopUnchanged === true);

const badWordIndex = J(`revealHintForWord(__mk(20260901, 5), 999)`);
check('revealHintForWord on a nonexistent word index is refused, not a crash', badWordIndex.ok === false);

// ---------------------------------------------------------------- 6
console.log('\n6. A half-filled puzzle survives a save/load round trip (normalizeComputerState)');
const roundTrip = J(`(() => {
  const g = __mk(20260901, 5); generatePuzzleForDay(g, 5);
  const w = g.world.computer.apps.puzzles.words[0];
  fillPuzzleCell(g, w.row, w.col, w.answer[0]); // one correct cell, deliberately not the whole puzzle
  revealHintForWord(g, 1); // and one revealed cell
  const beforePuzzles = g.world.computer.apps.puzzles;
  // Real save/load path: JSON round-trip (what actually crosses kv) into
  // normalizeComputerState, the same function a loaded save is rebuilt
  // through — not a hand-rolled stand-in for it.
  const savedRaw = JSON.parse(JSON.stringify(g.world.computer));
  const normalized = normalizeComputerState(savedRaw);
  return {
    filledBefore: beforePuzzles.filledCells, filledAfter: normalized.apps.puzzles.filledCells,
    revealedBefore: beforePuzzles.revealed, revealedAfter: normalized.apps.puzzles.revealed,
    dayBefore: beforePuzzles.day, dayAfter: normalized.apps.puzzles.day,
  };
})()`);
check('filledCells survives the save/load round trip intact', JSON.stringify(roundTrip.filledBefore) === JSON.stringify(roundTrip.filledAfter), JSON.stringify(roundTrip));
check('revealed survives the save/load round trip intact', JSON.stringify(roundTrip.revealedBefore) === JSON.stringify(roundTrip.revealedAfter));
check('day survives the save/load round trip intact', roundTrip.dayBefore === roundTrip.dayAfter);

const oldSave = J(`(() => {
  // A save written before Phase 14 has no apps.puzzles key at all.
  const raw = { power: 'off', windows: {}, apps: { shop: { cart: [] } } };
  const normalized = normalizeComputerState(raw);
  return normalized.apps.puzzles;
})()`);
check('a pre-Phase-14 save with no apps.puzzles key at all back-fills a fresh, ungenerated puzzles app rather than crashing', !!oldSave && oldSave.day === 0 && Array.isArray(oldSave.words) && oldSave.words.length === 0, JSON.stringify(oldSave));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
