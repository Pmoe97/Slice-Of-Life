// Conversation overhaul Phase 3 (D3/D4/D5/D7/D9/D10) — the Interact composer.
//
//   node src/src/dev/verify/verify-ask-composer.js
//
// The user's reports (2026-09-27): the request menu "automatically opens to
// the 'affection' page"; money giving "doesn't feel fluid — we do not need
// the AI to read the optional text and determine how much the player
// intended to send". Picking a leaf used to paste `$GiveMoney <Optional>`
// into the text box, and the amount (and gift-vs-loan) was then regexed out
// of whatever the player typed — no amount meant a silent $40.
//
// Now the menu ("Interact") opens on its category list, and a leaf opens a
// composer strip whose ARGUMENT chips (amount, gift/loan, what kind of plans,
// who else) ride resolveAsk's structured `extra`. The invariant that matters
// most is the asks plan's D1: a chip may shape what gets written, never
// whether the leaf says yes. Section 2 asserts it across seeds and states.
//
// Also here: leafNotes speak TO the character (D9 — twenty of them told the
// NPC the player had made the NPC's decision), every literal reason code has
// its own phrase (D10), and the `remote: true` set Messages offers (D7).
//
// The DOM half lifts ui.js's real renderAskComposer / openAskMenu into the
// engine vm with a small fake document (events, classList, selectors) —
// the verify-conv-images.js approach, one step richer.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'asks.js', 'money.js', 'llm.js', 'commitments.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

function bodies(src, name) {
  const out = [];
  let from = 0;
  for (;;) {
    const re = new RegExp(`(?:async )?function ${name}\\(`, 'g');
    re.lastIndex = from;
    const m = re.exec(src);
    if (!m) break;
    // Skip the parameter list first — a default like `opts = {}` would
    // otherwise close the body at depth 0.
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
const UI = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
const ASKS = fs.readFileSync(path.join(SRC, 'asks.js'), 'utf8');

api(`
  const h = SIM_generateHouse(20260927, 3);
  __mk = () => {
    const h2 = SIM_generateHouse(20260927, 3);
    const g = { meta: { seed: h2.seed, clock: { ...h2.clock, day: 9, minutes: 1080 }, contentConfig: null, sessionLog: [] },
                player: h2.player, npcs: h2.npcs, world: h2.world, objects: h2.objects };
    g.player.location = 'living_room';
    g.player.money = 250;
    for (const id of Object.keys(g.npcs).filter(k => g.npcs[k].residency.status === 'resident')) {
      const n = g.npcs[id];
      n.bible.name = n.bible.name || ('Roomie' + id.slice(-1));
      n.location = 'living_room'; n.activity = 'idle'; n.transit = null;
      n.flags = n.flags || {};
    }
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __ctx = (g, id) => ({ activeNpcs: [{ id }], ambientNpcs: [] });
`);

// ------------------------------------------------------------------ 1
console.log('\n1. The argument registry is well formed');
const argLeaves = J(`Object.values(ASK_TYPES).filter(l => Array.isArray(l.args)).map(l => ({ id: l.id, args: l.args.map(a => ({ id: a.id, kind: a.kind, hasMax: typeof a.max === 'function', hasOpts: !!a.options })) }))`);
check('the money leaves, Invite and Throw a Party all declare arguments',
  ['GiveMoney', 'RequestLoan', 'RequestRepay', 'CollectMoney', 'Invite', 'HouseParty'].every(id => argLeaves.some(l => l.id === id)),
  argLeaves.map(l => l.id).join(','));
check('every argument is one of the three kinds the composer draws',
  argLeaves.every(l => l.args.every(a => ['amount', 'choice', 'multi'].includes(a.kind))));
check('every amount argument has a ceiling (max) — the composer never offers what can\'t be sent',
  argLeaves.every(l => l.args.filter(a => a.kind === 'amount').every(a => a.hasMax)));
check('every choice/multi argument has options',
  argLeaves.every(l => l.args.filter(a => a.kind !== 'amount').every(a => a.hasOpts)));
check('argument ids are the ones resolveAsk\'s readers look for (amount, mode, kind, guests, chore)',
  argLeaves.every(l => l.args.every(a => ['amount', 'mode', 'kind', 'guests', 'chore'].includes(a.id))));
api(`__g = __mk(); __id = __ids(__g)[0]; __n = __g.npcs[__id];`);
const presets = J(`ASK_TYPES.GiveMoney.args[0].presets(__g, __n, __id)`);
check('Give Money offers everyday amounts, not the top of the wallet', presets.join(',') === '5,10,20,50,100', presets.join(','));
api(`__g.player.money = 30;`);
check('…capped by what the player has on hand', J(`ASK_TYPES.GiveMoney.args[0].presets(__g, __n, __id)`).join(',') === '5,10,20');
const loanP = J(`(() => { __n.relPlayer = { ...__n.relPlayer, conversationPhase: 'early' }; return ASK_TYPES.RequestLoan.args[0].presets(__g, __n, __id); })()`);
check('a loan\'s presets stop at the phase cap (early: $20)',
  loanP.length > 0 && Math.max(...loanP) <= J(`ASK_TUNING.loan.maxByPhase.early`), loanP.join(','));
check('Invite\'s kinds are exactly the playerInvitable commitment kinds',
  J(`inviteKindOptions().map(o => o.id).sort().join(',')`) === J(`Object.keys(COMMITMENT_KINDS).filter(k => COMMITMENT_KINDS[k].playerInvitable).sort().join(',')`));
check('Invite\'s guests are the OTHER residents — never the partner',
  J(`(() => { const o = inviteGuestOptions(__g, __n, __id).map(x => x.id); return o.length === __ids(__g).length - 1 && !o.includes(__id); })()`));

// ------------------------------------------------------------------ 2
console.log('\n2. D1: an argument never changes whether a leaf says yes');
{
  let compared = 0, differed = [];
  const leaves = ['GiveMoney', 'RequestLoan', 'Invite', 'HouseParty'];
  const extras = {
    GiveMoney: [{ amount: 5, mode: 'gift' }, { amount: 200, mode: 'loan' }],
    RequestLoan: [{ amount: 1 }, { amount: 500 }],
    Invite: [{ kind: 'meal', guests: [] }, { kind: 'hangout', guests: ['__OTHER__'] }],
    HouseParty: [{ guests: [] }, { guests: ['__OTHER__'] }],
  };
  for (const aff of [-0.4, 0, 0.3, 0.7]) {
    for (const day of [3, 9, 17]) {
      for (const leaf of leaves) {
        const verdicts = J(`(() => {
          const out = [];
          const ex = ${JSON.stringify(extras[leaf])};
          for (const e of [null, ...ex]) {
            const g = __mk(); g.meta.clock.day = ${day};
            const id = __ids(g)[0], other = __ids(g)[1];
            g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: ${aff}, trust: ${aff}, tension: 0, conversationPhase: 'familiar' };
            const extra = e ? JSON.parse(JSON.stringify(e).replace('__OTHER__', other)) : undefined;
            const t = resolveAsk(g, id, '${leaf}', '', __ctx(g, id), extra);
            out.push(t ? [t.decision.accept, t.decision.reason] : null);
          }
          return out;
        })()`);
        compared++;
        const first = JSON.stringify(verdicts[0]);
        if (!verdicts.every(v => JSON.stringify(v) === first)) differed.push(`${leaf} aff=${aff} day=${day}: ${JSON.stringify(verdicts)}`);
      }
    }
  }
  check(`the verdict is identical with and without chips across ${compared} (leaf, relationship, day) cases`, differed.length === 0, differed.slice(0, 3).join(' | '));
  check('…and both verdicts actually occur in that sample (the check is not vacuous)',
    J(`(() => {
      const seen = new Set();
      for (const aff of [-0.4, 0.7]) { const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: aff, trust: aff, tension: 0 };
        seen.add(resolveAsk(g, id, 'Invite', '', __ctx(g, id)).decision.accept); }
      return seen.size;
    })()`) === 2);
}

// ------------------------------------------------------------------ 3
console.log('\n3. D5: the chips are what moves — not the words');
const gm = J(`(() => {
  const g = __mk(); const id = __ids(g)[0];
  const t = resolveAsk(g, id, 'GiveMoney', 'here, $90, a loan', __ctx(g, id), { amount: 35, mode: 'gift' });
  t.applyEffects();
  return { money: g.player.money, owes: moneyOwedToPlayer(g, id), note: t.directive };
})()`);
check('Give Money moves the chip amount ($35), not the $90 typed in the message', gm.money === 215, `money ${gm.money}`);
check('…as the chip\'s mode (gift), not the word "loan" in the message', gm.owes === 0, `owes ${gm.owes}`);
check('…and the writer is told the amount and that it was a gift', /gave you \$35, no strings/.test(gm.note), gm.note.split('\n').filter(l => /\$/.test(l)).join(' / '));
const gmLoan = J(`(() => {
  const g = __mk(); const id = __ids(g)[0];
  const t = resolveAsk(g, id, 'GiveMoney', '', __ctx(g, id), { amount: 60, mode: 'loan' }); t.applyEffects();
  return { money: g.player.money, owes: moneyOwedToPlayer(g, id) };
})()`);
check('a Loan chip puts the amount on the ledger as owed to the player', gmLoan.money === 190 && gmLoan.owes === 60, JSON.stringify(gmLoan));
const gmCap = J(`(() => {
  const g = __mk(); const id = __ids(g)[0]; g.player.money = 40;
  const t = resolveAsk(g, id, 'GiveMoney', '', __ctx(g, id), { amount: 900, mode: 'gift' }); t.applyEffects();
  return g.player.money;
})()`);
check('a chip amount over the wallet is clamped to the wallet (never negative money)', gmCap === 0, `money ${gmCap}`);
const typed = J(`(() => {
  const g = __mk(); const id = __ids(g)[0];
  const p = parseAskInput('$GiveMoney $15 as a loan');
  const t = resolveAsk(g, id, p.askId, p.flavor, __ctx(g, id)); t.applyEffects();
  return { money: g.player.money, owes: moneyOwedToPlayer(g, id) };
})()`);
check('typed `$GiveMoney $15 as a loan` still works (the flavor parser is the fallback)', typed.money === 235 && typed.owes === 15, JSON.stringify(typed));
const loan = J(`(() => {
  const g = __mk(); const id = __ids(g)[0];
  g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: 0.9, trust: 0.9, tension: 0, conversationPhase: 'familiar' };
  const t = resolveAsk(g, id, 'RequestLoan', 'can I get $5', __ctx(g, id), { amount: 80 });
  t.applyEffects();
  return { accept: t.decision.accept, amt: t.decision.loanAmount, money: g.player.money, owe: moneyOwedByPlayer(g, id), cap: loanCapFor(g.npcs[id].relPlayer) };
})()`);
check('a Loan Request borrows the chip amount (familiar cap $100)', loan.accept ? (loan.money === 330 && loan.owe === 80) : loan.amt === 80, JSON.stringify(loan));
const loanCap = J(`(() => {
  const g = __mk(); const id = __ids(g)[0];
  g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, conversationPhase: 'early' };
  return resolveAsk(g, id, 'RequestLoan', '', __ctx(g, id), { amount: 400 }).decision.loanAmount;
})()`);
check('…clamped to the relationship-phase cap however large the chip', loanCap === J(`ASK_TUNING.loan.maxByPhase.early`), `amount ${loanCap}`);
const repay = J(`(() => {
  const g = __mk(); const id = __ids(g)[0];
  adjustMoneyLedger(g, id, 'playerOwes', 70);
  const t = resolveAsk(g, id, 'RequestRepay', 'all of it', __ctx(g, id), { amount: 30 }); t.applyEffects();
  return { money: g.player.money, owe: moneyOwedByPlayer(g, id) };
})()`);
check('Repay a Loan pays back the chip amount, and the ledger shrinks by exactly that', repay.money === 220 && repay.owe === 40, JSON.stringify(repay));
const collect = J(`(() => {
  const g = __mk(); const id = __ids(g)[0];
  adjustMoneyLedger(g, id, 'npcOwes', 50);
  const t = resolveAsk(g, id, 'CollectMoney', '', __ctx(g, id), { amount: 500 }); t.applyEffects();
  return { money: g.player.money, owes: moneyOwedToPlayer(g, id), reason: t.decision.reason };
})()`);
check('Collect a Debt never collects more than is owed', collect.money === 300 && collect.owes === 0, JSON.stringify(collect));
check('…under its own reason code (D10), not Repay\'s', collect.reason === 'collect');
const inv = J(`(() => {
  const g = __mk(); const [id, other] = __ids(g);
  g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: 0.9, tension: 0 };
  const d = resolveAsk(g, id, 'Invite', 'dinner with nobody', __ctx(g, id), { kind: 'pool_party', guests: [other, id, 'npc_nobody'] }).decision;
  return { kind: d.inviteKind, extra: d.inviteExtraIds, other };
})()`);
check('Invite\'s kind chip beats the word "dinner" in the message', inv.kind === 'pool_party', JSON.stringify(inv));
check('…and its guests are only real other residents (the partner and a bogus id are dropped)',
  inv.extra.length === 1 && inv.extra[0] === inv.other, JSON.stringify(inv.extra));

// ------------------------------------------------------------------ 4
console.log('\n4. The composer\'s ready check and summary');
api(`__g = __mk(); __id = __ids(__g)[0]; __n = __g.npcs[__id];`);
check('ready with a valid amount', J(`askArgsReady(ASK_TYPES.GiveMoney, { amount: 20, mode: 'gift' }, __g, __n, __id).ok`) === true);
check('blocked with no amount', J(`askArgsReady(ASK_TYPES.GiveMoney, { amount: null }, __g, __n, __id)`).ok === false);
check('blocked over the wallet, and it says the ceiling', J(`askArgsReady(ASK_TYPES.GiveMoney, { amount: 999 }, __g, __n, __id).reason`) === 'Up to $250.');
check('blocked with an empty wallet', J(`(() => { __g.player.money = 0; const r = askArgsReady(ASK_TYPES.GiveMoney, { amount: 20 }, __g, __n, __id); __g.player.money = 250; return r.ok; })()`) === false);
check('a leaf with no arguments is always ready', J(`askArgsReady(ASK_TYPES.RequestHangout, {}, __g, __n, __id).ok`) === true);
check('defaults: Give Money starts at $20 as a gift', J(`JSON.stringify(askArgDefaults(ASK_TYPES.GiveMoney, __g, __n, __id))`) === '{"amount":20,"mode":"gift"}');
check('defaults: Repay starts at everything owed (wallet-capped)',
  J(`(() => { adjustMoneyLedger(__g, __id, 'playerOwes', 45); return askArgDefaults(ASK_TYPES.RequestRepay, __g, __n, __id).amount; })()`) === 45);
check('the bubble summary reads the picks back', J(`askArgSummary(ASK_TYPES.GiveMoney, { amount: 20, mode: 'loan' }, __g, __n, __id)`) === '$20 · Loan');
check('…including who else was invited',
  /^Dinner · with /.test(J(`askArgSummary(ASK_TYPES.Invite, { kind: 'meal', guests: [__ids(__g)[1]] }, __g, __n, __id)`)));

// ------------------------------------------------------------------ 5
console.log('\n5. D9/D10: the writer is spoken to from the right side of the table');
const notes = J(`(() => {
  const out = [];
  const decisions = [
    { accept: true, reason: 'accept' }, { accept: false, reason: 'cool' }, { accept: false, reason: 'below' },
    { accept: false, reason: 'floor_hostile' }, { accept: false, reason: 'below_photo' },
    { accept: true, reason: 'sleep_wake_receptive' }, { accept: false, reason: 'sleep_wake_hostile' }, { accept: true, reason: 'sleep_undisturbed' },
    { accept: true, reason: 'give_money', giveAmount: 20, giveMode: 'gift' }, { accept: true, reason: 'give_money', giveMode: 'loan' },
    { accept: false, reason: 'feature_refused' }, { accept: true, reason: 'accept', level: 'intimate' },
  ];
  for (const leaf of Object.values(ASK_TYPES)) {
    if (!leaf.leafNote) continue;
    for (const d of decisions) { try { out.push([leaf.id, leaf.leafNote(d)]); } catch (e) {} }
  }
  return out;
})()`);
// The NPC is "you" in a leafNote (buildAskDirective: "Reply ONLY as {npc}").
// These are the shapes that told the NPC the PLAYER had made the NPC's call.
const WRONG_SIDE = /\bThey (said yes|welcomed|consented|agreed to let you|are fast asleep|are not receptive|'re not willing|'re not comfortable|'re fine with you posting|already said no to posting|'d rather that photo)|You just handed them|Your touch (just )?woke them|You're paying back money you borrowed/;
check('the check can fail: it flags the notes this overhaul rewrote',
  ["- They said yes to spending time together.", "- You just handed them money, no ask involved.",
    "- Your touch just woke them, and they are shocked", "- They consented, freely and in their own voice."].every(n => WRONG_SIDE.test(n)));
const wrong = notes.filter(([, n]) => WRONG_SIDE.test(n || ''));
check(`no leafNote (of ${notes.length} leaf × decision variants) hands the NPC's decision to the player`, wrong.length === 0,
  wrong.slice(0, 3).map(([id, n]) => `${id}: ${n}`).join(' | '));
const reasonLits = [...new Set((ASKS.match(/reason: [^,}\n]*/g) || []).flatMap(s => s.match(/'([a-z_]+)'/g) || []).map(s => s.slice(1, -1)))];
const unphrased = J(`${JSON.stringify(reasonLits)}.filter(r => !ASK_REASON_PHRASES[r])`);
check(`every literal reason code in asks.js (${reasonLits.length}) has its own phrase — none falls through to "not the right time"`,
  unphrased.length === 0, unphrased.join(','));
check('the three that used to fall through read as what they are',
  J(`[askReasonPhrase('give_money'), askReasonPhrase('return'), askReasonPhrase('collect')].every(p => p !== "it's not the right time")`));
check('the directive tells the writer who "they" means in the reason line',
  /Why, in one plain line \("they" here means Mira\)/.test(J(`buildAskDirective({ askLabel: 'x', askId: 'x', flavorText: '', accept: true, reasonPhrase: 'r', stance: 's', npcName: 'Mira' })`)));

// ------------------------------------------------------------------ 6
console.log('\n6. D7: what a phone can carry');
const remote = J(`askRemoteCategories().flatMap(c => c.children.map(l => l.id))`);
// 2026-09-28 (user): chores joined the texting set once an agreed chore
// actually got done (verify-chores.js) — "can you take the bins out?" is a
// normal text. Everything else here still needs you in the room.
const physicalIds = J(`Object.values(ASK_TYPES).filter(l => ['affection', 'gifts', 'follow'].includes(l.category)).map(l => l.id)`);
check('the plan\'s texting set is offered: plans, invites, all four money leaves, photos, apology, space, ask about them',
  ['RequestInfo', 'RequestHangout', 'RequestMeal', 'Invite', 'HouseParty', 'RequestLoan', 'RequestRepay', 'GiveMoney', 'CollectMoney',
    'RequestPhoto', 'SharePhoto', 'Feature', 'Apologize', 'AskForSpace', 'SubscriptionTalk'].every(id => remote.includes(id)),
  remote.join(','));
check('nothing physical is offered over text (hugs, gifts in hand, borrowing, follow-me)',
  physicalIds.length >= 7 && physicalIds.every(id => !remote.includes(id)), physicalIds.filter(id => remote.includes(id)).join(','));
check('a chore request is offered by text', remote.includes('RequestChore'));
check('every remote leaf resolves through the same registry as in person',
  remote.every(id => J(`!!(ASK_TYPES['${id}'] || ASK_SHARE_TYPES['${id}'])`)));

// ------------------------------------------------------------------ 7
console.log('\n7. D3/D4 in ui.js: the menu opens at the top, a leaf opens the composer');
const { FAKE_DOM_SRC } = require('./fakedom.js');
api(FAKE_DOM_SRC);
const LIFT = ['renderAskComposer', 'askToneVar', 'openAskMenu', 'askMenuRender', 'openConvComposer', 'closeConvComposer', 'convComposerReady'];
const lifted = Object.fromEntries(LIFT.map((n) => [n, bodies(UI, n)]));
for (const [name, list] of Object.entries(lifted)) {
  check(`${name} is declared exactly once in ui.js`, list.length === 1, `found ${list.length}`);
  if (list[0]) api(list[0]);
}
api(`
  var askMenuPath = ['affection'];
  var convComposer = null;
  var currentSceneState = {};
  var convState = { npcId: null, sending: false };
  var assembleContext = () => ({ activeNpcs: [], ambientNpcs: [] });
  var updateAskHint = () => {};
  var convScrollToBottom = () => {};
  var __submitted = 0;
  var handleAction = () => { __submitted += 1; };
  for (const id of ['conv-ask-body', 'conv-ask-title', 'conv-ask-back-btn', 'conv-ask-menu', 'conv-composer', 'conv-input', 'conv-send-btn']) __byId[id] = __el(id === 'conv-input' ? 'input' : 'div');
  __byId['conv-ask-menu'].hidden = true;
  currentGameState = __mk();
  convState.npcId = __ids(currentGameState)[0];
  openAskMenu();
`);
check('the Interact menu opens on its category list, not Affection (D3)', J(`askMenuPath.length`) === 0, J(`JSON.stringify(askMenuPath)`));
check('…titled "Interact"', J(`__byId['conv-ask-title'].textContent`) === 'Interact');
check('…showing every category, each carrying its tone',
  J(`__byId['conv-ask-body'].querySelectorAll('[data-ask-cat]').length`) === J(`ASK_CATEGORIES.length`)
  && J(`__byId['conv-ask-body'].querySelectorAll('[data-ask-cat]').every(r => /^var\\(--color-/.test(r.style.getPropertyValue('--ask-tone')))`));
check('ui.js no longer pre-expands a category anywhere', !/askMenuPath = \[\s*'[a-z]+'\s*\]/.test(UI));
check('picking an ordinary leaf opens the composer — it no longer pastes the $template into the input',
  /closeAskMenu\(\);\s*openConvComposer\(askId\);\s*\}/.test(bodies(UI, 'askMenuInsertLeaf')[0] || '')
  && !/input\.value = leaf\.template/.test(UI));

api(`
  __changes = [];
  openConvComposer('GiveMoney');
  __host = __byId['conv-composer'];
  __chip = (arg, text) => __host.querySelectorAll('.ask-chip').find(c => c.closest('[data-arg="' + arg + '"]') && c.textContent.startsWith(text));
`);
check('the composer shows, tinted with the Money category\'s tone',
  J(`!__host.hidden && __host.style.getPropertyValue('--ask-tone') === 'var(--color-positive)'`));
check('…labelled with the leaf', J(`__host.querySelector('.ask-composer-pill').textContent`).includes('Give Money'));
check('…with the default amount ($20) and Gift pre-selected',
  J(`__chip('amount', '$20').getAttribute('aria-checked') === 'true' && __chip('mode', 'Gift').getAttribute('aria-checked') === 'true'`));
check('the input becomes the optional message and the button says Send',
  J(`__byId['conv-input'].placeholder`) === 'Add a message (optional)' && J(`__byId['conv-send-btn'].textContent`) === 'Send');
check('focus lands on the selected chip (Tab/arrows from there)', J(`__doc.activeElement === __chip('amount', '$20')`));
api(`__chip('amount', '$50').click(); __chip('mode', 'Loan').click();`);
check('tapping $50 and Loan updates the composer state', J(`JSON.stringify(convComposer.values)`) === '{"amount":50,"mode":"loan"}');
check('…and exactly one chip per group is checked',
  J(`['amount', 'mode'].every(arg => __host.querySelectorAll('.ask-chip[aria-checked="true"]').filter(c => c.closest('[data-arg="' + arg + '"]')).length === 1)`));
// Re-open the composer a few times on the SAME host first: the arrow-key
// handler must not stack (one press, one step).
api(`for (let i = 0; i < 3; i++) { openConvComposer('GiveMoney'); } __host = __byId['conv-composer']; __chip('amount', '$50').click(); __chip('mode', 'Loan').click();`);
api(`__chip('mode', 'Loan').dispatch('keydown', { key: 'ArrowLeft' });`);
check('re-opening the composer on the same host does not pile up key handlers',
  J(`(__host._listeners().keydown || []).length === 0 && typeof __host.onkeydown === 'function'`));
check('an arrow key moves along a radio group and picks (keyboard-only use)',
  J(`convComposer.values.mode === 'gift' && __doc.activeElement === __chip('mode', 'Gift')`));
api(`__custom = __host.querySelector('.ask-chip-custom').children[0]; __custom.value = '999'; __custom.dispatch('input');`);
check('a custom amount over the wallet blocks Send and says why',
  J(`__byId['conv-send-btn'].disabled === true && __host.querySelector('.ask-composer-status').textContent === 'Up to $250.'`));
api(`__custom.value = '12'; __custom.dispatch('input');`);
check('a valid custom amount re-enables Send', J(`__byId['conv-send-btn'].disabled === false && convComposer.values.amount === 12`));
api(`__custom.dispatch('keydown', { key: 'Enter' });`);
check('Enter in the amount box sends', J(`__submitted`) === 1);
api(`__host.querySelector('.ask-composer-cancel').click();`);
check('✕ cancels: composer hidden, state cleared, the input and button restored',
  J(`__host.hidden && convComposer === null && __byId['conv-input'].placeholder === 'Say or do something...' && __byId['conv-send-btn'].textContent === 'Say'`));
api(`openConvComposer('RequestHangout');`);
check('a leaf with no arguments still opens a composer (label + message), ready to send',
  J(`!__host.hidden && __host.querySelectorAll('.ask-chip').length === 0 && convComposerReady().ok`));
const sendBody = bodies(UI, 'doConvSend')[0] || '';
check('doConvSend passes the composed chip values as resolveAsk\'s structured extra (never the flavor)',
  /composed \? composed\.values : undefined/.test(sendBody) && /composed \? composed\.flavor : parsedAsk\.flavor/.test(sendBody));
check('doConvSend refuses a composer that isn\'t ready', /if \(!convComposerReady\(\)\.ok\) return;/.test(sendBody));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
