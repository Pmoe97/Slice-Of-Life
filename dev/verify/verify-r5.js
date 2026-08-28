// Scene reader plan Phase 5 — the conversation pane remembers (R4, D13/D14).
// `recallSceneExchanges` is the pure half and is fully testable here; the DOM
// half (convRenderRecalled, the [data-past] styling, the separator) is
// verified in the browser, with the structural assertions at the bottom
// standing guard over the parts a browser check would not notice regressing.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const SRCDIR = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const ROOT = path.join(__dirname, '..', '..');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// A bare NPC shell — recallSceneExchanges only ever reads memory.recent, and
// building a whole house here would hide that.
api(`
  __npc = (entries) => ({ bible: { name: 'Hana' }, memory: { recent: entries } });
  __ex = (speaker, text, type, day, tick, channel) => ({ speaker, text, type, day, tick, channel });
  __texts = (rows) => rows.filter(r => r.kind !== 'time').map(r => r.text);
  __kinds = (rows) => rows.map(r => r.kind + (r.from ? ':' + r.from : ''));
`);

console.log('\nThe empty case is a real case');
check('an NPC never spoken to yields no rows', api(`recallSceneExchanges(__npc([]), 3).length`) === 0,
      'zero rows is what suppresses the separator — a separator with nothing above it announces an absence');
check('a missing memory object does not throw', api(`
  (() => { try { return recallSceneExchanges({ bible: { name: 'x' } }, 3).length === 0; } catch { return false; } })()
`));
check('a null npc does not throw', api(`
  (() => { try { return recallSceneExchanges(null, 3).length === 0; } catch { return false; } })()
`), 'openConversationOverlay guards this, but the pure function should not depend on that');
check('a buffer of nothing but IMs is the empty case too', api(`
  recallSceneExchanges(__npc([__ex('player', 'u up', 'player_input', 3, 100, 'im')]), 3).length
`) === 0, 'otherwise a texting-only relationship would open the in-person pane with a bare separator');

console.log('\nThe channel filter holds (D6, Plan 0)');
api(`
  __mixed = __npc([
    __ex('player', 'IN PERSON ONE', 'player_input', 3, 600, 'scene'),
    __ex('Hana', 'REPLY ONE', 'dialogue', 3, 600, 'scene'),
    __ex('player', 'TEXTED', 'player_input', 3, 700, 'im'),
    __ex('Hana', 'TEXTED BACK', 'dialogue', 3, 700, 'im'),
    __ex('player', 'IN PERSON TWO', 'player_input', 3, 800, 'scene'),
  ]);
  __mixedRows = recallSceneExchanges(__mixed, 3);
`);
check('an IM never reaches the in-person pane', api(`
  !__texts(__mixedRows).some(t => t.indexOf('TEXTED') >= 0)
`), JSON.stringify(api(`__texts(__mixedRows)`)));
check('the in-person lines all survive', api(`
  __texts(__mixedRows).join('|')
`) === 'IN PERSON ONE|REPLY ONE|IN PERSON TWO');
check('an IM does not even leave a timestamp behind', api(`
  !__mixedRows.some(r => r.kind === 'time' && r.label === formatTime(700))
`), 'a time row for a conversation that is not shown is a hole in the transcript');
check('entries written before the channel field read as scene', api(`
  recallSceneExchanges(__npc([__ex('player', 'legacy', 'player_input', 3, 600, undefined)]), 3)
    .some(r => r.text === 'legacy')
`), 'the IM surface was the newer of the two, so untagged bulk can only be scene');

console.log('\nOrder is preserved (Plan 0 D4 — question above answer)');
check('rows come out in buffer order', api(`
  __texts(recallSceneExchanges(__npc([
    __ex('player', 'q1', 'player_input', 3, 600, 'scene'),
    __ex('Hana', 'a1', 'dialogue', 3, 600, 'scene'),
    __ex('player', 'q2', 'player_input', 3, 610, 'scene'),
    __ex('Hana', 'a2', 'dialogue', 3, 610, 'scene'),
  ]), 3)).join('|')
`) === 'q1|a1|q2|a2', 'the buffer is stored question-then-answer and the pane must not resort it');

console.log('\nA timestamp per exchange, not per line (D14)');
api(`
  __twoTurns = recallSceneExchanges(__npc([
    __ex('player', 'q1', 'player_input', 3, 600, 'scene'),
    __ex('Hana', 'a1', 'dialogue', 3, 600, 'scene'),
    __ex('player', 'q2', 'player_input', 3, 615, 'scene'),
    __ex('Hana', 'a2', 'dialogue', 3, 615, 'scene'),
  ]), 3);
`);
check('two exchanges at two times give exactly two time rows',
      api(`__twoTurns.filter(r => r.kind === 'time').length`) === 2,
      JSON.stringify(api(`__kinds(__twoTurns)`)));
check('a time row precedes the lines it stamps',
      api(`__kinds(__twoTurns).join(',')`) === 'time,bubble:player,bubble:npc,time,bubble:player,bubble:npc');
check('four lines at ONE timestamp give one time row', api(`
  recallSceneExchanges(__npc([
    __ex('player', 'a', 'player_input', 3, 600, 'scene'),
    __ex('Hana', 'b', 'dialogue', 3, 600, 'scene'),
    __ex('Hana', 'c', 'dialogue', 3, 600, 'scene'),
    __ex('Hana', 'd', 'dialogue', 3, 600, 'scene'),
  ]), 3).filter(r => r.kind === 'time').length
`) === 1, 'repeating 10:00 four times is noise, which is the thing this plan removes');
check('the same clock time on a DIFFERENT day still breaks the group', api(`
  recallSceneExchanges(__npc([
    __ex('player', 'a', 'player_input', 2, 600, 'scene'),
    __ex('player', 'b', 'player_input', 3, 600, 'scene'),
  ]), 3).filter(r => r.kind === 'time').length
`) === 2, 'grouping on minutes alone would merge yesterday into today');

console.log('\nHow long ago, in the fewest unambiguous words');
check('today is a bare clock time', api(`recallTimeLabel(3, 1170, 3)`) === api(`formatTime(1170)`));
check('yesterday says so', api(`recallTimeLabel(2, 1170, 3)`) === api(`'Yesterday ' + formatTime(1170)`));
check('older carries the full date', api(`
  recallTimeLabel(1, 1170, 5).indexOf(formatDate(1)) === 0
`), api(`recallTimeLabel(1, 1170, 5)`));
check('an unstamped entry reads Earlier, not Day 0 00:00', api(`recallTimeLabel(0, 0, 3)`) === 'Earlier',
      'pre-Plan-0 entries have no day; sceneHistory uses the same word for the same reason');
check('and Earlier is what a pre-Plan-0 entry actually gets', api(`
  recallSceneExchanges(__npc([__ex('player', 'ancient', 'player_input', undefined, undefined, 'scene')]), 3)
    .find(r => r.kind === 'time').label
`) === 'Earlier');
check('an unknown current day degrades to the dated form rather than lying', api(`
  recallTimeLabel(3, 1170, null).indexOf(formatDate(3)) === 0
`), api(`recallTimeLabel(3, 1170, null)`));

console.log('\nA line reads the same recalled as it did live');
check('the player is a right-hand bubble', api(`recallRow(__ex('player','x','player_input')).from`) === 'player');
check('NPC dialogue is a left-hand bubble', api(`recallRow(__ex('Hana','x','dialogue')).from`) === 'npc');
check('an action is the centred action bubble, asterisked as doConvSend writes it', api(`
  recallRow(__ex('Hana','waves','action')).from === 'action' && recallRow(__ex('Hana','waves','action')).text === '*waves*'
`));
check('an internal is a parenthesised beat', api(`
  recallRow(__ex('Hana','she is tired','internal')).kind === 'beat'
  && recallRow(__ex('Hana','she is tired','internal')).text === '(she is tired)'
`));
check('narration is a plain beat', api(`recallRow(__ex('Hana','the kettle clicks','narration')).kind`) === 'beat');
check('an unknown type degrades to a beat rather than guessing a speaker', api(`
  recallRow(__ex('Hana','???','wat')).kind
`) === 'beat', 'memoryAdditions.recentExchanges is LLM-supplied and only validated as an array');
check('a typeless entry falls back on speaker', api(`
  recallRow({ speaker: 'player', text: 'x' }).from === 'player' && recallRow({ speaker: 'Hana', text: 'x' }).from === 'npc'
`));
check('an entry with no text is dropped, not rendered blank', api(`
  recallSceneExchanges(__npc([
    __ex('player', '', 'player_input', 3, 600, 'scene'),
    __ex('Hana', 'real', 'dialogue', 3, 600, 'scene'),
  ]), 3).filter(r => r.kind !== 'time').length
`) === 1);

console.log('\nPurity');
check('it never mutates the npc it reads', api(`
  (() => {
    const n = __npc([__ex('player','q','player_input',3,600,'scene'), __ex('Hana','a','dialogue',3,600,'scene')]);
    const before = JSON.stringify(n);
    recallSceneExchanges(n, 3);
    return JSON.stringify(n) === before;
  })()
`));
check('it never reaches for the model', api(`
  (() => {
    const real = root.generateText;
    let called = false;
    root.generateText = async () => { called = true; return '{}'; };
    recallSceneExchanges(__npc([__ex('player','q','player_input',3,600,'scene')]), 3);
    root.generateText = real;
    return !called;
  })()
`), 'opening a pane must not cost a network round-trip (design invariant 2)');
check('it is stable — same input, same rows', api(`
  (() => {
    const n = __npc([__ex('player','q','player_input',3,600,'scene'), __ex('Hana','a','dialogue',3,610,'scene')]);
    return JSON.stringify(recallSceneExchanges(n, 3)) === JSON.stringify(recallSceneExchanges(n, 3));
  })()
`));

console.log('\nThe buffer is the only cap');
check('a runaway conversation is bounded by MEMORY_BUDGET.maxRecent alone', api(`
  (() => {
    let n = __npc([]);
    for (let i = 0; i < 200; i++) n = addRecentExchange(n, 'player', 'line ' + i, 'player_input', 3, 600 + i, 'scene');
    const bubbles = recallSceneExchanges(n, 3).filter(r => r.kind !== 'time');
    return bubbles.length === MEMORY_BUDGET.maxRecent;
  })()
`), 'a second cap here would be a number nobody tuned');
check('and it keeps the NEWEST exchanges', api(`
  (() => {
    let n = __npc([]);
    for (let i = 0; i < 200; i++) n = addRecentExchange(n, 'player', 'line ' + i, 'player_input', 3, 600 + i, 'scene');
    const bubbles = recallSceneExchanges(n, 3).filter(r => r.kind !== 'time');
    return bubbles[bubbles.length - 1].text === 'line 199';
  })()
`));

console.log('\nThe pane is wired to it, and the markup it emits is styled');
const UI = fs.readFileSync(path.join(SRCDIR, 'ui.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const openFn = UI.slice(UI.indexOf('function openConversationOverlay'), UI.indexOf('function closeConversationOverlay'));
const recallFn = UI.slice(UI.indexOf('function convRenderRecalled'), UI.indexOf('function convShowTyping'));

check('openConversationOverlay renders history instead of stopping at empty',
      /convRenderRecalled\(npc\)/.test(openFn),
      'the one line that made R4 a missing feature was `log.innerHTML = \'\'` with nothing after it');
check('it still clears first, so re-opening cannot double the history',
      /log\.innerHTML = ''/.test(openFn) && openFn.indexOf("log.innerHTML = ''") < openFn.indexOf('convRenderRecalled'));
check('and it scrolls to the live end only AFTER the overlay is shown',
      openFn.indexOf("setAttribute('data-open'") < openFn.indexOf('convScrollToBottom'),
      'while display:none the log has no layout, so an earlier scroll silently does nothing');
check('the recalled renderer marks every node it appends as past',
      /setAttribute\('data-past'/.test(recallFn));
check('it is a projection — no filtering or timestamp logic of its own',
      !/channel/.test(recallFn) && !/formatTime|formatDate/.test(recallFn),
      'all of that belongs to recallSceneExchanges, where it is testable');
check('the separator is drawn only when there is something above it',
      recallFn.indexOf('rows.length === 0') < recallFn.indexOf('conv-separator'));
// Bound this at the Phase 5 comment block, not at `function convRenderRecalled`
// — the comment itself names [data-past], which is what the marker is for.
check('convAddBubble/convAddBeat still write the live half untouched',
      !/data-past/.test(UI.slice(UI.indexOf('function convAddBeat'), UI.indexOf('// Scene reader plan Phase 5'))),
      'Phase 5 adds a recalled half above a separator; it does not change how the live half is written');
check('[data-past] has a stylesheet rule — a marker nobody styles is R8 again',
      /\.conv-bubble\[data-past\]/.test(HTML) && /\.conv-beat\[data-past\]/.test(HTML));
check('a past player bubble drops its accent fill, not just opacity',
      /\.conv-bubble\[data-past\]\[data-from="player"\]/.test(HTML),
      'D14 asks for past to be structurally marked, and a dimmed accent still shouts');
check('.conv-separator and .conv-time are styled', /\.conv-separator\b/.test(HTML) && /\.conv-time\b/.test(HTML));
// Pinned as a floor, not an equality. This phase bumped npc.js to 19 and ui.js
// to 55, and both are the versions that carry Phase 5's changes — but a later
// plan touching either file bumps it again, and an equality here would report
// that as a Phase 5 regression. Versions only ever go up.
const vOf = (f) => {
  const m = HTML.match(new RegExp(`${f.replace('.', '\\.')}\\?v=(\\d+)`));
  return m ? +m[1] : -1;
};
check('npc.js and ui.js both got their ?v= bumped',
      vOf('npc.js') >= 19 && vOf('ui.js') >= 55,
      `npc.js=${vOf('npc.js')} (>=19), ui.js=${vOf('ui.js')} (>=55) — a partial bump is how a client ends up running half-old code`);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
