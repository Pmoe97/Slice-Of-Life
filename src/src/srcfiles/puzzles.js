// ===== SECTION: PUZZLES =====
// Domain logic for DailyGrid (actions-and-activities-overhaul-plan.md Phase
// 14, D23): a seeded daily crossword. Pure state — grid generation, cell
// fill/reveal, completion + reward — with zero DOM dependency, same
// discipline as money.js/mail.js. render.computer.js draws it; ui.computer.js
// wires clicks/keystrokes to the functions here.
//
// Grid construction is a genuine implementer's call (D59 — see Locked
// decisions): rather than solving general crossword construction (NP-hard,
// and overkill for a house minigame), each day's puzzle is N word PAIRS
// drawn from PUZZLE_WORD_PAIRS, each pair a real intersecting across/down
// crossing at their first shared letter (findCrossing), laid out in its own
// vertical block so blocks never collide with each other. The "bank" the
// plan's data model names is this pair list; "grid generation" is which
// pairs get drawn for the day, not freeform grid synthesis.

const PUZZLE_TUNING = {
  pairsPerDay: 4,
  skillId: 'wordplay',
  xpPerComplete: 12,
  hintRewardMult: 0.5,   // completing with any hint used halves the payout
};

// Across/down pairs. The only requirement on an entry is that acrossWord and
// downWord share at least one real letter — findCrossing finds it (and where
// to place it) at generation time, so adding a pair never means hand-computing
// row/col coordinates, only picking two words that actually cross.
const PUZZLE_WORD_PAIRS = [
  { acrossWord: 'SOFA', acrossClue: 'Living-room seat, often shared', downWord: 'NAP', downClue: 'A short daytime sleep' },
  { acrossWord: 'MEAL', acrossClue: 'Breakfast, lunch, or dinner', downWord: 'TIME', downClue: 'What the clock tells' },
  { acrossWord: 'LAUNDRY', acrossClue: 'Dirty clothes waiting to be washed', downWord: 'DRYER', downClue: 'Machine that tumbles clothes dry' },
  { acrossWord: 'RENT', acrossClue: 'Monthly payment to the landlord', downWord: 'DOOR', downClue: 'You knock before opening it' },
  { acrossWord: 'SHOWER', acrossClue: 'Where you rinse off', downWord: 'SOAP', downClue: 'Bar used to get clean' },
  { acrossWord: 'PHONE', acrossClue: 'Pocket device for texts and calls', downWord: 'APP', downClue: 'Something you download and open' },
  { acrossWord: 'PARTY', acrossClue: 'A gathering with guests and music', downWord: 'TRAY', downClue: 'Carries snacks and drinks around' },
  { acrossWord: 'KITCHEN', acrossClue: 'Room with the stove and fridge', downWord: 'SINK', downClue: 'Where dishes get washed' },
  { acrossWord: 'COOK', acrossClue: 'Prepare a meal', downWord: 'STOVE', downClue: 'Where you cook on burners' },
  { acrossWord: 'FRIDGE', acrossClue: 'Keeps your food cold', downWord: 'MILK', downClue: 'Pour it over cereal' },
  { acrossWord: 'HAMPER', acrossClue: 'Dirty clothes go here first', downWord: 'SHIRT', downClue: 'Top half of an outfit' },
  { acrossWord: 'MONEY', acrossClue: 'What your paycheck is made of', downWord: 'BANK', downClue: 'Where you keep your savings' },
  { acrossWord: 'GIFT', acrossClue: 'A present for someone', downWord: 'TAG', downClue: 'Says who a present is from' },
  { acrossWord: 'DATE', acrossClue: 'A romantic outing', downWord: 'DIRTY', downClue: 'Needs a wash, like laundry or dishes' },
  { acrossWord: 'BED', acrossClue: 'Where you sleep at night', downWord: 'NEED', downClue: 'Hunger, energy, and hygiene are these' },
  { acrossWord: 'YOGA', acrossClue: 'Stretchy exercise on a mat', downWord: 'GYM', downClue: 'Room with the weights and treadmill' },
  { acrossWord: 'POOL', acrossClue: 'Swim here in the East Wing', downWord: 'LOUNGE', downClue: 'Comfy chair by the water, for sunbathing' },
  { acrossWord: 'SAUNA', acrossClue: 'Hot little room for relaxing', downWord: 'STEAM', downClue: 'What fills a sauna or a hot shower' },
  { acrossWord: 'MAIL', acrossClue: 'Check the box by the front door', downWord: 'LETTER', downClue: 'Something a mail carrier delivers' },
  { acrossWord: 'CHATTER', acrossClue: 'The gossipy social app on your phone', downWord: 'POST', downClue: 'Something you share online' },
  { acrossWord: 'BILLS', acrossClue: 'Rent, power, water — pay these monthly', downWord: 'DEBT', downClue: 'Money you owe someone' },
  { acrossWord: 'WORK', acrossClue: 'What pays the rent', downWord: 'HOURS', downClue: 'How work time is measured' },
  { acrossWord: 'SLEEP', acrossClue: 'Nightly rest, hopefully in a bed', downWord: 'DREAM', downClue: 'What plays in your head at night' },
  { acrossWord: 'STUDY', acrossClue: 'Room for the computer and books', downWord: 'DESK', downClue: 'Where you sit to work or browse' },
];

// First shared letter, scanning wordA left to right and, for each of its
// letters, wordB left to right — deterministic, so the same pair always
// crosses at the same point.
function findCrossing(wordA, wordB) {
  for (let i = 0; i < wordA.length; i++) {
    for (let j = 0; j < wordB.length; j++) {
      if (wordA[i] === wordB[j]) return { i, j };
    }
  }
  return null;
}

function puzzleCellKey(row, col) { return `${row},${col}`; }

// The letter the solved grid needs at (row, col), or null off the grid
// entirely (no word covers this cell). Across and down only ever share a
// cell at their crossing, where they agree by construction.
function puzzleAnswerLetterAt(puzzle, row, col) {
  for (const w of puzzle.words) {
    if (w.dir === 'across' && w.row === row && col >= w.col && col < w.col + w.answer.length) {
      return w.answer[col - w.col];
    }
    if (w.dir === 'down' && w.col === col && row >= w.row && row < w.row + w.answer.length) {
      return w.answer[row - w.row];
    }
  }
  return null;
}

function isWordSolved(puzzle, w) {
  for (let k = 0; k < w.answer.length; k++) {
    const row = w.dir === 'across' ? w.row : w.row + k;
    const col = w.dir === 'across' ? w.col + k : w.col;
    if (puzzle.filledCells[puzzleCellKey(row, col)] !== w.answer[k]) return false;
  }
  return true;
}

function isPuzzleSolved(puzzle) {
  return puzzle.words.every(w => isWordSolved(puzzle, w));
}

// Standard crossword numbering: one running number per distinct cell that
// starts a word, in reading order. A pair whose across/down share their
// start cell (both crossing at their own first letter) shares one number —
// falls out for free since this keys off the coordinate, not the word.
function computePuzzleNumbers(puzzle) {
  const seen = new Set();
  const starts = [];
  for (const w of puzzle.words) {
    const key = puzzleCellKey(w.row, w.col);
    if (!seen.has(key)) { seen.add(key); starts.push({ row: w.row, col: w.col, key }); }
  }
  starts.sort((a, b) => a.row - b.row || a.col - b.col);
  const numByKey = {};
  starts.forEach((s, idx) => { numByKey[s.key] = idx + 1; });
  return numByKey;
}

// Seeded, idempotent daily generation — same shape/discipline as COMPUTER's
// generateGigsForDay: a day already generated is a no-op, so a re-processed
// rollover (or opening the app twice) never rerolls today's puzzle out from
// under a player mid-solve.
function generatePuzzleForDay(gameState, day) {
  const puzzle = gameState.world.computer.apps.puzzles;
  if (puzzle.day === day && puzzle.words.length > 0) return;
  const rng = seededRng(gameState.meta.seed, `puzzle_${day}`);
  const chosen = pickUnique(rng, PUZZLE_WORD_PAIRS, PUZZLE_TUNING.pairsPerDay);

  const words = [];
  let curRow = 0;
  let cols = 0;
  for (const pair of chosen) {
    const cross = findCrossing(pair.acrossWord, pair.downWord);
    if (!cross) continue;
    const { i, j } = cross;
    // Local block coordinates: the across word sits at local row j (so the
    // down word, starting at local row 0, reaches it going down); the down
    // word sits at local column i (so the across word, starting at local
    // column 0, reaches it going right). Both fit their block by
    // construction since i/j are valid indices into their own word.
    words.push({ clue: pair.acrossClue, answer: pair.acrossWord, row: curRow + j, col: 0, dir: 'across' });
    words.push({ clue: pair.downClue, answer: pair.downWord, row: curRow, col: i, dir: 'down' });
    cols = Math.max(cols, pair.acrossWord.length);
    curRow += pair.downWord.length + 1; // one blank row of padding between blocks
  }
  puzzle.day = day;
  puzzle.words = words;
  puzzle.rows = Math.max(0, curRow - 1);
  puzzle.cols = cols;
  puzzle.filledCells = {};
  puzzle.revealed = {};
  puzzle.completedDay = null;
}

// The single reward site (mirrors skills.js's own "one call site" rule for
// awardSkillXp) — completing with any letter revealed by a hint pays out at
// hintRewardMult, so hints stay useful without trivializing the puzzle.
function grantPuzzleCompletionReward(gameState, puzzle) {
  const usedHint = Object.keys(puzzle.revealed).length > 0;
  const mult = usedHint ? PUZZLE_TUNING.hintRewardMult : 1;
  awardSkillXp(gameState.player, PUZZLE_TUNING.skillId, PUZZLE_TUNING.xpPerComplete * mult, gameState.meta.clock.day);
  pushMoodImpulse(gameState.player, MOOD_PAYOUTS.puzzleComplete * mult, gameState.meta.clock.day);
  return { usedHint };
}

// Shared by fillPuzzleCell/revealHintForWord: pays out once per puzzle
// (completedDay guards a second payout from, say, blanking and refilling the
// last cell after the puzzle is already done).
function checkPuzzleCompletion(gameState, puzzle) {
  if (puzzle.completedDay === puzzle.day || !isPuzzleSolved(puzzle)) return { completed: false, rewardNote: '' };
  puzzle.completedDay = puzzle.day;
  const { usedHint } = grantPuzzleCompletionReward(gameState, puzzle);
  return { completed: true, rewardNote: usedHint ? '(half credit — a letter was revealed)' : '' };
}

// Type one letter into (row, col). Blank/black cells (no word covers them)
// refuse — the UI never renders an input there, so this only fires from a
// stray call, not real play.
function fillPuzzleCell(gameState, row, col, letter) {
  const puzzle = gameState.world.computer.apps.puzzles;
  const expected = puzzleAnswerLetterAt(puzzle, row, col);
  if (!expected) return { ok: false };
  const key = puzzleCellKey(row, col);
  const clean = (letter || '').toUpperCase().slice(0, 1);
  if (clean) puzzle.filledCells[key] = clean; else delete puzzle.filledCells[key];
  const { completed, rewardNote } = checkPuzzleCompletion(gameState, puzzle);
  return { ok: true, completed, rewardNote };
}

// Reveal one wrong/blank cell of word `wordIndex` — the first one found,
// reading the word from its start. A no-op once that word is already fully
// correct.
function revealHintForWord(gameState, wordIndex) {
  const puzzle = gameState.world.computer.apps.puzzles;
  const w = puzzle.words[wordIndex];
  if (!w) return { ok: false };
  for (let k = 0; k < w.answer.length; k++) {
    const row = w.dir === 'across' ? w.row : w.row + k;
    const col = w.dir === 'across' ? w.col + k : w.col;
    const key = puzzleCellKey(row, col);
    if (puzzle.filledCells[key] !== w.answer[k]) {
      puzzle.filledCells[key] = w.answer[k];
      puzzle.revealed[key] = true;
      const { completed, rewardNote } = checkPuzzleCompletion(gameState, puzzle);
      return { ok: true, completed, rewardNote };
    }
  }
  return { ok: true, completed: false, rewardNote: '' };
}

// ===== /SECTION: PUZZLES =====
