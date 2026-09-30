// Conversation overhaul Phase 5 (D7/D8) — Messages gets the phone's Interact.
//
//   node dev/verify/verify-im-asks.js
//
// The report (2026-09-27): "The 'Messages' app currently has virtually zero
// functionality. It is essentially a MVP … It has none of the things that
// would make sense like picture-exchanges, asks, money, etc. It should have
// a phone-appropriate version of the asks system." It had a text box and a
// Send button; photos could only be pushed in from the Photos app, and
// buildImPrompt had no way to carry an ask at all. The deeper pass also found
// every message rendered through innerHTML (E7) and threads that grew without
// bound in the save (E8).
//
// What this asserts:
//   1. D8 — the thread cap, on every writer.
//   2. The IM prompt carries the ask directive, worded for a text.
//   3. The in-person ask invariants hold by text: decided first (the verdict
//      is the same one a spoken ask gets), the writer's effects/mood deltas
//      stripped, the template fallback when the model fails.
//   4. The real texted-ask path (doImAskSend, lifted from ui.computer.js with
//      a stubbed model): money moves once and shows as a transfer, a plan
//      goes through the calendar and a confirming text, a photo lands IN the
//      thread with the chat-image record contract.
//   5. The bubble and the + sheet (render.computer.js, fake DOM): text is
//      text, not markup.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { FAKE_DOM_SRC } = require('./fakedom.js');
const { api } = loadEngine({ required: ['config.js', 'asks.js', 'computer.js', 'llm.js', 'npc.js', 'money.js', 'drives.js', 'commitments.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const A = async (expr) => JSON.parse(await api(`(async () => JSON.stringify(await (${expr})))()`));

function bodies(src, name) {
  const out = [];
  let from = 0;
  for (;;) {
    const re = new RegExp(`(?:async )?function ${name}\\(`, 'g');
    re.lastIndex = from;
    const m = re.exec(src);
    if (!m) break;
    let j = m.index + m[0].length, parens = 1;
    for (; j < src.length && parens > 0; j++) {
      if (src[j] === '(') parens++;
      else if (src[j] === ')') parens--;
    }
    let depth = 0, started = false;
    for (; j < src.length; j++) {
      if (src[j] === '{') { depth++; started = true; }
      else if (src[j] === '}') { depth--; if (started && depth === 0) { j++; break; } }
    }
    out.push(src.slice(m.index, j));
    from = j;
  }
  return out;
}
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const UI = read('ui.js'), UIC = read('ui.computer.js'), RC = read('render.computer.js');

api(`
  __mk = () => {
    const h = SIM_generateHouse(20260927, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 9, minutes: 1080 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    g.player.money = 250;
    for (const id of Object.keys(g.npcs).filter(k => g.npcs[k].residency.status === 'resident')) {
      const n = g.npcs[id];
      n.bible.name = n.bible.name || ('Roomie' + id.slice(-1));
      n.location = n.residency.room; n.activity = 'idle'; n.transit = null; n.flags = n.flags || {};
      n.relPlayer = { ...n.relPlayer, affection: 0.9, trust: 0.9, tension: 0, conversationPhase: 'close' };
    }
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  // The model: a queue of replies; each call records its prompt.
  var __prompts = [], __replies = [];
  root.generateText = async (arg) => {
    const instr = typeof arg === 'string' ? arg : (arg.instruction || '');
    __prompts.push(instr);
    const next = __replies.length ? __replies.shift() : null;
    if (next === 'THROW') throw new Error('model down');
    if (next) return next;
    const m = instr.match(/"speaker": "([^"]+)"/);
    return JSON.stringify({ dialogue: [{ speaker: m ? m[1] : 'Someone', text: 'sure thing' }] });
  };
`);

// Everything below awaits, which can't sit at top level beside require()
// (Node refuses to guess CJS vs ESM) — one async main, as verify-food-phase3 does.
async function main() {

// ------------------------------------------------------------------ 1
console.log('\n1. D8: a thread is capped, on every writer');
const cap = J(`IM_PROMPT.threadCap`);
check('the cap is a published constant', typeof cap === 'number' && cap >= 100, String(cap));
api(`
  __g = __mk(); __id = __ids(__g)[0];
  for (let i = 0; i < ${cap} + 25; i++) pushImMessage(__g, __id, { from: 'npc', text: 'm' + i, day: 9, tick: 1 });
`);
check('pushing past the cap keeps exactly the cap, newest last',
  J(`__g.world.computer.apps.im.threads[__id].msgs.length`) === cap && J(`__g.world.computer.apps.im.threads[__id].msgs.slice(-1)[0].text`) === `m${cap + 24}`);
check('the oldest are the ones trimmed', J(`__g.world.computer.apps.im.threads[__id].msgs[0].text`) === 'm25');
api(`appendPlayerImMessage(__g, __id, 'hi'); processNpcImMessages(__g, [{ npcId: __id, text: 'yo' }]);`);
check('the player\'s append and NPC-initiated texts go through the cap too', J(`__g.world.computer.apps.im.threads[__id].msgs.length`) === cap);
const rawPush = [['computer.js', read('computer.js')], ['drives.js', read('drives.js')]]
  .filter(([, src]) => /thread\.msgs\.push\(/.test(src.replace(/function pushImMessage[\s\S]*?\n}\n/, '')));
check('no runtime writer pushes onto a thread directly any more', rawPush.length === 0, rawPush.map(x => x[0]).join(','));

// ------------------------------------------------------------------ 2
console.log('\n2. The IM prompt carries an ask, worded for a text');
api(`__g = __mk(); __id = __ids(__g)[0];`);
const imDir = J(`resolveAsk(__g, __id, 'RequestHangout', '', assembleImContext(__g, __id)).directive`);
const spokenDir = J(`resolveAsk(__mk(), __id, 'RequestHangout', '', { activeNpcs: [{ id: __id }], ambientNpcs: [] }).directive`);
check('a texted ask\'s directive says it came by text and asks for texts, not *actions*',
  /sent this request by text/.test(imDir) && /No \*actions\*/.test(imDir) && !/One optional brief action/.test(imDir));
check('a spoken ask\'s directive is unchanged', /used the Request menu/.test(spokenDir) && /One optional brief action in \*asterisks\*/.test(spokenDir));
check('buildImPrompt appends the directive',
  J(`buildImPrompt({ ...assembleImContext(__g, __id), askDirective: '---ASK-MARKER---' }, 'hey').includes('---ASK-MARKER---')`));
check('…and adds nothing when there isn\'t one', !J(`buildImPrompt(assembleImContext(__g, __id), 'hey').includes('ASK CONTEXT')`));

// ------------------------------------------------------------------ 3
console.log('\n3. The ask invariants hold by text');
{
  const diffs = [];
  for (const askId of ['RequestHangout', 'RequestMeal', 'RequestLoan', 'RequestInfo', 'Invite', 'AskForSpace']) {
    for (const aff of [-0.5, 0.1, 0.9]) {
      const pair = J(`(() => {
        const a = __mk(), b = __mk(); const id = __ids(a)[0];
        for (const g of [a, b]) g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: ${aff}, trust: ${aff} };
        const x = resolveAsk(a, id, '${askId}', '', { activeNpcs: [{ id }], ambientNpcs: [] }).decision;
        const y = resolveAsk(b, id, '${askId}', '', assembleImContext(b, id)).decision;
        return [[x.accept, x.reason], [y.accept, y.reason]];
      })()`);
      if (JSON.stringify(pair[0]) !== JSON.stringify(pair[1])) diffs.push(`${askId}@${aff}: ${JSON.stringify(pair)}`);
    }
  }
  check('the same state gives the same verdict by text as in person (one registry, one decide())', diffs.length === 0, diffs.slice(0, 3).join(' | '));
}
check('texting a sleeping roommate for a photo hits the sleep floor', J(`(() => {
  const g = __mk(); const id = __ids(g)[0]; g.npcs[id].activity = 'sleeping';
  return resolveAsk(g, id, 'RequestPhoto', '', assembleImContext(g, id)).decision.reason;
})()`) === 'floor_asleep');
check('a photo request by text reads THEIR room\'s privacy (someone else there → unavailable)', J(`(() => {
  const g = __mk(); const [id, other] = __ids(g); g.npcs[other].location = g.npcs[id].location;
  const busy = ASK_TYPES.RequestPhoto.available(g, g.npcs[id], assembleImContext(g, id));
  g.npcs[other].location = 'kitchen';
  return [busy, ASK_TYPES.RequestPhoto.available(g, g.npcs[id], assembleImContext(g, id))];
})()`).join(',') === 'false,true');
const moodCase = await A(`(async () => {
  const out = {};
  const g = __mk(); const id = __ids(g)[0]; const name = g.npcs[id].bible.name;
  const reply = JSON.stringify({ dialogue: [{ speaker: name, text: 'ok!' }], moodDeltas: { [id]: 0.2 } });
  g.npcs[id].mood = 0;
  __replies.push(reply);
  await resolveImReply(g, id, 'hey');
  out.plain = g.npcs[id].mood;
  g.npcs[id].mood = 0;
  __replies.push(reply);
  const t = resolveAsk(g, id, 'RequestInfo', '', assembleImContext(g, id));
  await resolveImReply(g, id, 'tell me about you', { askTurn: t });
  out.ask = g.npcs[id].mood;
  return out;
})()`);
check('an ask turn strips the writer\'s mood deltas (a plain text keeps them — the control)',
  moodCase.plain !== 0 && moodCase.ask === 0, JSON.stringify(moodCase));
const fb = await A(`(async () => {
  const g = __mk(); const id = __ids(g)[0];
  __replies.push('THROW');
  const t = resolveAsk(g, id, 'RequestHangout', '', assembleImContext(g, id));
  const r = await resolveImReply(g, id, 'want to hang out?', { askTurn: t });
  const msgs = g.world.computer.apps.im.threads[id].msgs;
  return { replied: r.replied, last: msgs[msgs.length - 1], mem: (g.npcs[id].memory.recent || []).slice(-1)[0] };
})()`);
check('when the model fails, the decided ask still answers — the template line, in the thread and in memory',
  fb.replied === true && fb.last.from === 'npc' && fb.last.text && fb.mem && fb.mem.text === fb.last.text, JSON.stringify(fb));
check('a plain text with a failed model still says "hasn\'t replied yet" (unchanged)', await A(`(async () => {
  const g = __mk(); const id = __ids(g)[0]; __replies.push('THROW');
  const r = await resolveImReply(g, id, 'hey');
  return !r.replied && /hasn't replied yet/.test(g.world.computer.apps.im.threads[id].msgs.slice(-1)[0].text);
})()`));

// ------------------------------------------------------------------ 4
console.log('\n4. The texted ask, end to end (ui.computer.js doImAskSend)');
api(FAKE_DOM_SRC);
api(`
  var currentGameState = null, currentSceneState = {};
  var imSending = false;
  var IM_PENDING_REPLY = new Set();
  var IM_ASK_SHEET = null, IM_COMPOSER = null, IM_DRAFTS = {}, IM_PENDING_IMAGE = new Set();
  var __renders = 0;
  var renderComputerScreen = () => { __renders++; }, renderPhoneScreen = () => {}, render = () => {};
  var advanceAndResolve = async () => {}, assessSceneIfFull = async () => false, chronicleIfFull = async () => {};
  var saveAtBoundary = async () => {}, addLogEntry = () => {}, imScopeForDevice = () => null;
  var getAskPhotoImage = async (rec) => ({ url: 'blob:photo-' + rec.id });
  var draftAskPhotoPrompt = async () => null;
  // The calendar: the first genuinely free window from tomorrow on.
  var openAskScheduleModal = async ({ npcId }) => {
    const g = currentGameState; const now = clockToAbsolute(g.meta.clock);
    for (let d = g.meta.clock.day + 1; d < g.meta.clock.day + 5; d++) {
      const w = freeSlotsFor(g.npcs[npcId], d, now); if (w.length) return w[0];
    }
    return null;
  };
`);
const LIFT_UIC = ['imRerender', 'imAskContext', 'doImAskSend', 'imNoteTransfer', 'runImAskScheduleFlow', 'runImAskPhotoFlow', 'doImSend', 'doImAskSheet', 'doImAskCancel'];
for (const name of LIFT_UIC) {
  const list = bodies(UIC, name);
  check(`${name} is declared exactly once in ui.computer.js`, list.length === 1, `found ${list.length}`);
  if (list[0]) api(list[0]);
}
{
  const list = bodies(UI, 'askSchedulePickAndBook');
  check('askSchedulePickAndBook is declared once in ui.js — and shared by the conversation\'s schedule flow',
    list.length === 1 && /askSchedulePickAndBook\(askTurn, convNpcId, convAddBeat\)/.test(bodies(UI, 'runAskScheduleFlow')[0] || ''));
  if (list[0]) api(list[0]);
}
const money = await A(`(async () => {
  currentGameState = __mk(); const id = __ids(currentGameState)[0];
  await doImAskSend(id, 'phone', { askId: 'GiveMoney', values: { amount: 35, mode: 'loan' }, flavor: 'for the groceries' });
  const msgs = currentGameState.world.computer.apps.im.threads[id].msgs;
  return { money: currentGameState.player.money, owes: moneyOwedToPlayer(currentGameState, id), msgs, sending: imSending, pending: IM_PENDING_REPLY.has(id) };
})()`);
const mine = money.msgs.find(m => m.from === 'player');
check('Give Money by text moves the chip amount exactly once', money.money === 215 && money.owes === 35, JSON.stringify({ money: money.money, owes: money.owes }));
check('the player\'s text carries the ask\'s tag and the transfer (out, as a loan)',
  mine && mine.tag === 'Give Money · $35 · Loan' && mine.transfer && mine.transfer.amount === 35 && mine.transfer.dir === 'out' && mine.transfer.mode === 'loan', JSON.stringify(mine));
check('…and their reply follows it', money.msgs[money.msgs.length - 1].from === 'npc');
check('the next text\'s prompt knows money changed hands (a transfer is not an empty line)',
  J(`(() => { const id = __ids(currentGameState)[0]; return buildImPrompt(assembleImContext(currentGameState, id), 'did it arrive?'); })()`)
    .includes('Them: [Give Money · $35 · Loan] [sent you $35 as a loan] for the groceries'));
check('nothing is left in flight (the send guard and the typing dots are cleared)', !money.sending && !money.pending);
const loan = await A(`(async () => {
  currentGameState = __mk(); const id = __ids(currentGameState)[0];
  await doImAskSend(id, 'phone', { askId: 'RequestLoan', values: { amount: 60 }, flavor: '' });
  const msgs = currentGameState.world.computer.apps.im.threads[id].msgs;
  return { money: currentGameState.player.money, owe: moneyOwedByPlayer(currentGameState, id), last: msgs[msgs.length - 1], first: msgs[0] };
})()`);
check('a loan they agree to arrives as money IN, as its own bubble from them',
  loan.money === 310 && loan.owe === 60 && loan.last.from === 'npc' && loan.last.transfer && loan.last.transfer.dir === 'in' && loan.last.transfer.amount === 60,
  JSON.stringify(loan));
check('an empty message sends the leaf\'s own line', loan.first.text === J(`ASK_TYPES.RequestLoan.defaultFlavor`));
const plan = await A(`(async () => {
  currentGameState = __mk(); const id = __ids(currentGameState)[0];
  __prompts.length = 0;
  await doImAskSend(id, 'phone', { askId: 'RequestHangout', values: {}, flavor: 'movie night?' });
  const msgs = currentGameState.world.computer.apps.im.threads[id].msgs;
  const c = (currentGameState.world.commitments || []).find(c => (c.acceptedIds || []).includes(id));
  return { kind: c && c.kind, msgs: msgs.map(m => m.from + ':' + (m.tag || '') + ':' + m.text), confirm: __prompts.some(p => /SCHEDULING CONFIRMATION/.test(p)),
    fact: (currentGameState.npcs[id].memory.facts || []).some(f => /hang out.*agreed —/.test(f.text)) };
})()`);
check('Hang Out by text books a real commitment through the calendar', plan.kind === 'hangout', JSON.stringify(plan));
check('…then a second pass writes the confirming text', plan.confirm && plan.msgs.filter(m => m.startsWith('npc:')).length === 2, JSON.stringify(plan.msgs));
check('…and the memory names when (setSlot ran before the effects)', plan.fact);
const photo = await A(`(async () => {
  currentGameState = __mk(); const id = __ids(currentGameState)[0];
  await doImAskSend(id, 'phone', { askId: 'RequestPhoto', values: {}, flavor: 'a pic of your view' });
  const msgs = currentGameState.world.computer.apps.im.threads[id].msgs;
  return msgs[msgs.length - 1];
})()`);
check('an accepted photo request lands IN the thread as their photo', photo.from === 'npc' && photo.image && photo.image.kind === 'askphoto', JSON.stringify(photo).slice(0, 200));
check('…with the chat-image record contract (id, prompt, seed) so it re-paints and rerolls',
  photo.image && photo.image.id && photo.image.prompt && typeof photo.image.seed === 'number');
check('…and the next prompt knows a photo was sent', J(`(() => { const id = __ids(currentGameState)[0]; return buildImPrompt(assembleImContext(currentGameState, id), 'nice'); })()`).includes('You: [sent a photo: '));
const chore = await A(`(async () => {
  currentGameState = __mk(); const id = __ids(currentGameState)[0];
  const sink = Object.values(currentGameState.objects.room_kitchen).find(o => o.defId === 'sink_kitchen');
  sink.dishes = { plate: 3 }; sink.dishUnits = 3;
  await doImAskSend(id, 'phone', { askId: 'RequestChore', values: { chore: 'dishes' }, flavor: '' });
  const msgs = currentGameState.world.computer.apps.im.threads[id].msgs;
  return { req: currentGameState.npcs[id].flags._choreRequest, tag: msgs.find(m => m.from === 'player').tag };
})()`);
check('a chore asked by text is queued as a TEXT request (so they text back when it\'s done)',
  chore.req && chore.req.choreId === 'dishes' && chore.req.via === 'text' && chore.tag === 'Chore Request · Do the dishes', JSON.stringify(chore));
const composed = await A(`(async () => {
  currentGameState = __mk(); const id = __ids(currentGameState)[0];
  IM_COMPOSER = { npcId: id, askId: 'GiveMoney', values: { amount: 999, mode: 'gift' } };
  await doImSend(id, 'phone');
  const blocked = currentGameState.player.money;
  IM_COMPOSER.values.amount = 10;
  await doImSend(id, 'phone');
  return { blocked, after: currentGameState.player.money, composer: IM_COMPOSER };
})()`);
check('doImSend refuses a composer that isn\'t ready (more than the wallet) and sends one that is',
  composed.blocked === 250 && composed.after === 240 && composed.composer === null, JSON.stringify(composed));

// ------------------------------------------------------------------ 5
console.log('\n5. The bubble and the + sheet (render.computer.js)');
api(`
  var getPlaceholder = () => 'data:placeholder';
  var __chatUrlCalls = [];
  var getChatImageUrl = async (rec) => { __chatUrlCalls.push(rec); return { url: 'blob:x' }; };
  var getPhotoImage = async () => ({ url: 'blob:y' });
  var setImageMeta = () => {}, rerollChatImage = async () => ({});
  var formatTime = (m) => String(m);
`);
for (const name of ['renderImBubble', 'renderImAskSheet', 'imPreviewText', 'truncateText']) {
  const list = bodies(RC, name);
  check(`${name} is declared exactly once in render.computer.js`, list.length === 1, `found ${list.length}`);
  if (list[0]) api(list[0]);
}
api(`currentGameState = __mk(); __id = __ids(currentGameState)[0];`);
const evil = '<img src=x onerror="alert(1)"> <b>hi</b>';
const bub = J(`(() => {
  const el = renderImBubble(currentGameState, { from: 'npc', text: ${JSON.stringify(evil)}, day: 9, tick: 3 });
  const all = []; const walk = (n) => { all.push(n); n.children.forEach(walk); }; walk(el);
  return { text: el.querySelector('.im-msg-text').textContent, html: all.map(n => n.innerHTML || '').join('') };
})()`);
check('E7: message text renders as TEXT (markup stays literal, nothing goes through innerHTML)', bub.text === evil && bub.html === '', JSON.stringify(bub));
const sys = J(`renderImBubble(currentGameState, { from: 'system', text: '<i>x</i>', day: 9, tick: 1 }).innerHTML || ''`);
check('…system lines too', sys === '');
const tagged = J(`(() => {
  const el = renderImBubble(currentGameState, { from: 'player', text: 'here', tag: 'Give Money · $20 · Gift', transfer: { amount: 20, dir: 'out', mode: 'gift' }, day: 9, tick: 2 });
  return { tag: el.querySelector('.im-msg-tag').textContent, amount: el.querySelector('.im-transfer-amount').textContent, what: el.querySelector('.im-transfer-what').textContent, cls: el.className };
})()`);
check('an ask\'s bubble shows its tag and the transfer card', tagged.tag === 'Give Money · $20 · Gift' && tagged.amount === '−$20' && tagged.what === 'Sent · gift', JSON.stringify(tagged));
check('an incoming transfer reads as received', J(`renderImBubble(currentGameState, { from: 'npc', text: '', transfer: { amount: 40, dir: 'in', mode: 'loan' }, day: 9, tick: 2 }).querySelector('.im-transfer-what').textContent`) === 'Received · loan');
api(`__rec = { kind: 'askphoto', id: 'p1', prompt: 'x', seed: 7, caption: 'Selfie' }; __chatUrlCalls.length = 0; __img = renderImBubble(currentGameState, { from: 'npc', text: '', image: __rec, day: 9, tick: 4 });`);
check('a photo in the thread paints through getChatImageUrl with the stored record', J(`__chatUrlCalls.length === 1 && __chatUrlCalls[0] === __rec && !!__img.querySelector('.im-msg-photo')`));
check('previews: a transfer and a photo have readable one-liners',
  J(`imPreviewText({ transfer: { amount: 20, dir: 'out' } }, 30)`) === '💸 $20 sent' && J(`imPreviewText({ from: 'npc', text: '', image: __rec }, 30)`) === '📷 Photo');
api(`IM_ASK_SHEET = { npcId: __id, catId: null }; __sheet = renderImAskSheet(currentGameState, currentGameState.npcs[__id], __id);`);
check('the sheet lists exactly the phone\'s categories', J(`__sheet.querySelectorAll('[data-action="im.ask-cat"]').map(r => r.getAttribute('data-row-id')).join(',')`) === J(`askRemoteCategories().map(c => c.id).join(',')`));
api(`IM_ASK_SHEET = { npcId: __id, catId: 'money' }; currentGameState.player.money = 0; __sheet = renderImAskSheet(currentGameState, currentGameState.npcs[__id], __id);`);
check('…a leaf that can\'t happen right now is greyed (Give Money with an empty wallet)',
  J(`__sheet.querySelector('[data-row-id="GiveMoney"]').disabled === true && __sheet.querySelector('[data-row-id="RequestLoan"]').disabled === false`));
check('…and every row is tinted with its category\'s tone', J(`__sheet.querySelectorAll('.conv-ask-row').every(r => r.style.getPropertyValue('--ask-tone') === 'var(--color-positive)')`));
check('renderMessages draws the + button, the sheet and the shared composer',
  /data-action', 'im\.ask-sheet'/.test(RC) && /renderImAskSheet\(gs, npc, npcId\)/.test(RC) && /renderAskComposer\(host, ASK_TYPES\[IM_COMPOSER\.askId\]/.test(RC));
check('renderMessages no longer writes message text through innerHTML', !/innerHTML = m\.from === 'system'/.test(RC) && !/\$\{m\.text\}/.test(RC));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
