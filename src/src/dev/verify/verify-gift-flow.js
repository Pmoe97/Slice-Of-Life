// Conversation overhaul Phase 4 (D6) — one giving pipeline — and the user's
// follow-up (2026-09-28): cooking puts the whole meal in your bag, and you
// give what you're carrying.
//
//   node src/src/dev/verify/verify-gift-flow.js
//
// The report (2026-09-27): "Gift giving at present feels non-intuitive. I am
// trying to work on goals, like giving a meal or care package to a roommate
// and it doesn't seem to make sense how to do that." Three gift paths that
// didn't know about each other:
//   - the Care Package goal ("Cook a meal → Give the meal → Check in")
//     advanced ONLY through the scene chip, which handed over the FIRST
//     matching bag item without asking and never said a word;
//   - the conversation's Give a Gift moved items but never counted for a goal;
//   - and a cooked meal landed in the FRIDGE (one serving auto-eaten), which
//     neither path could see — while a plate is one stack holding the whole
//     batch, so a hand-over gave away every serving.
// The user then chose: "When you cook a meal I do not want you to consume a
// serving right away, and I want it to go into your inventory" — and the
// gift list is the bag only.
//
// This drives the Care Package end to end on the REAL cook path
// (buildCookEffects → the whole plate in the bag), the real ask (resolveAsk →
// ASK_GIFT → giveGiftUnit), the real goal writers lifted out of ui.js
// (checkChainQuestProgress, checkQuestCompletion, convGiftFollowThrough), and
// the real hunger drive (tryEatFood) to show the given plate gets eaten.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'inventory.js', 'items.js', 'effects.js', 'asks.js', 'drives.js', 'defs.actions.js'] });

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
const RENDER = fs.readFileSync(path.join(SRC, 'render.js'), 'utf8');
const LIFT = ['checkChainQuestProgress', 'checkQuestCompletion', 'convGiftFollowThrough', 'convGoalBeat',
  'chainQuestFor', 'chainTalkStepWaiting', 'giftPickerEntries', 'giftPickerMeta'];

api(`
  var __log = [], __beats = [];
  var addLogEntry = (kind, text) => { __log.push(text); };
  var convAddBeat = (text) => { __beats.push(text); };
  var currentGameState = null;
  function __house(seed) {
    const partials = [{ name: 'Mira' }, { name: 'Jonah' }];
    const h = SIM_generateHouse(seed || 20260927, 2, partials);
    h.meta = { seed: h.seed, clock: { ...h.clock, day: 6, minutes: 1110 }, contentConfig: null, sessionLog: [] };
    for (const id of Object.keys(h.npcs)) {
      const n = h.npcs[id];
      n.flags = {}; n.location = n.residency.room; n.needs = n.needs || {}; n.inventory = [];
    }
    h.player.flags = {}; h.player.inventory = []; h.player.moodEvents = []; h.player.meta = {};
    h.player.location = 'living_room';
    h.world.quests = { active: [], completed: [] };
    return h;
  }
  function __obj(h, defId) {
    for (const bucket of Object.values(h.objects || {})) {
      const o = Object.values(bucket).find(o => o.defId === defId);
      if (o) return o;
    }
    return null;
  }
  function __ids(h) { return Object.keys(h.npcs).filter(id => h.npcs[id].residency.status === 'resident').sort(); }
  function __apply(h, lines) {
    const effCtx = buildEffectContext(h, [], [], h.objects.room_kitchen || {}, h.player.inventory);
    const effects = [];
    for (const line of lines) for (const eff of parseEffectDSL(line)) if (eff) effects.push(eff);
    applyEffects(effects, effCtx);
  }
  // The real cook: pantry stock → buildCookEffects → the whole batch in the
  // bag (2026-09-28: it used to land in the fridge minus an auto-eaten serving).
  function __cookPasta(h) {
    const pantry = __obj(h, 'pantry'), fridge = __obj(h, 'fridge');
    pantry.contents = [{ defId: 'pasta_dry', qty: 2 }, { defId: 'tomato_sauce', qty: 2 }];
    fridge.contents = [];
    const ctx = { gameState: h, roomId: 'kitchen', roomObjects: h.objects.room_kitchen || {}, presentNpcIds: [] };
    const pasta = availableRecipes(kitchenIngredientPool(h, ctx)).find(r => r.id === 'pasta');
    __lastCookLines = buildCookEffects(ctx, { recipe: pasta });
    __apply(h, __lastCookLines);
    return (h.player.inventory || []).find(s => s.meta && s.meta.plate) || null;
  }
  var __lastCookLines = [];
  function __carePackage(h, npcId) {
    const chain = QUEST_CHAINS.find(c => c.id === 'care_package');
    const name = h.npcs[npcId].bible.name;
    const steps = chain.steps.map(s => ({ ...s, desc: s.desc.replace('{name}', name), done: false }));
    const q = { id: 'chain_test', title: chain.title.replace('{name}', name), desc: steps[0].desc, npcId, type: 'chain',
      chainId: chain.id, steps, currentStep: 0, rewardMoney: chain.rewardMoney, rewardRelation: chain.rewardRelation,
      day: 6, expiresDay: 20, status: 'active' };
    h.world.quests.active.push(q);
    return q;
  }
  function __ctx(h, id) { return { activeNpcs: [{ id }], ambientNpcs: [] }; }
`);
for (const name of LIFT) {
  const list = bodies(UI, name);
  check(`${name} is declared exactly once in ui.js`, list.length === 1, `found ${list.length}`);
  if (list[0]) api(list[0]);
}

// ------------------------------------------------------------------ 1
console.log('\n1. Cooking puts the whole meal in your bag, and says so plainly');
api(`
  __h = __house(); currentGameState = __h;
  __plate = __cookPasta(__h);
`);
check('the cooked pasta is in the BAG, every serving of it (nothing eaten at the stove)',
  J(`!!__plate && __plate.meta.plate.recipeKey === 'pasta' && stackServingsLeft(__plate) === __plate.meta.plate.servings.total && __plate.meta.plate.servings.total > 1`),
  J(`JSON.stringify(__plate && __plate.meta.plate.servings)`));
check('…none of it in the fridge', J(`!(__obj(__h, 'fridge').contents || []).some(s => s.meta && s.meta.plate)`));
check('…and cooking emits no EAT_ITEM', !J(`__lastCookLines`).some(l => l.startsWith('EAT_ITEM')));
const line = J(`cookNarration({}, { recipe: RECIPES.pasta, plate: { label: 'Pasta', grade: 'B+' } })`);
check('the cook line is "You now have Pasta. (Grade B+)."', line === 'You now have Pasta. (Grade B+).', line);
check('…the same line for an auto-cook', J(`cookNarration({}, { recipe: RECIPES.pasta, plate: { label: 'Pasta', grade: 'A' }, auto: true })`) === 'You now have Pasta. (Grade A).');
check('…and without a grade, no grade', J(`cookNarration({}, { recipe: RECIPES.pasta, plate: { label: 'Pasta' } })`) === 'You now have Pasta.');

// ------------------------------------------------------------------ 2
console.log('\n2. giftSources: what you are carrying, only');
api(`
  __obj(__h, 'pantry').contents.push({ defId: 'chips', qty: 2, ownerId: null, meta: { acquiredDay: 6 } });
  __obj(__h, 'fridge').contents.push({ defId: 'meal_pasta', qty: 1, ownerId: null, meta: { acquiredDay: 6 } });
  __h.player.inventory.push(
    { defId: 'chocolate_box', qty: 1, ownerId: 'player', meta: {} },
    { defId: 'flowers', qty: 1, ownerId: __ids(__h)[1], meta: { borrowed: { from: __ids(__h)[1], dueDay: 9 } } },
  );
  __src = giftSources(__h);
`);
const src = J(`__src.map(e => ({ from: e.from, defId: e.defId, label: e.label, plate: e.isPlate, left: e.servingsLeft, category: e.category }))`);
const plate = src.find(e => e.plate);
check('the cooked pasta in your bag is a gift source, with all its servings', !!plate && plate.category === 'meal' && plate.left === J(`__plate.meta.plate.servings.total`), JSON.stringify(src));
check('an ordinary present in the bag is a source', src.some(e => e.defId === 'chocolate_box'));
check('nothing in the fridge or pantry is offered (the user\'s call: you give what you carry)',
  !src.some(e => ['chips', 'meal_pasta'].includes(e.defId)) && src.every(e => e.from === 'player'));
check('a borrowed thing isn\'t yours to give (Give It Back returns it)', !src.some(e => e.defId === 'flowers'));
check('rotten food is not a gift', J(`(() => {
  __h.player.inventory.push({ defId: 'meal_omelette', qty: 1, ownerId: 'player', meta: { acquiredDay: -40, cohort: -40 } });
  const ok = !giftSources(__h).some(e => e.defId === 'meal_omelette');
  __h.player.inventory.pop();
  return ok;
})()`));

// ------------------------------------------------------------------ 3
console.log('\n3. One serving, not the batch');
api(`
  __id = __ids(__h)[0];
  __pick = (() => { const e = giftSources(__h).find(e => e.isPlate); return { defId: e.defId, from: e.from, index: e.index, label: e.label }; })();
  __total = __plate.meta.plate.servings.total;
  __moved = giveGiftUnit(__h, __pick, __id);
  __mine = (__h.player.inventory || []).find(s => s.meta && s.meta.plate);
  __theirs = (__h.npcs[__id].inventory || []).find(s => s.meta && s.meta.plate);
`);
check('the hand-over reports what moved', J(`__moved.ok && __moved.isPlate && __moved.category === 'meal'`), J(`JSON.stringify(__moved)`));
check('the rest of the batch stays in your bag (one serving fewer)', J(`__mine && __mine.meta.plate.servings.left === __total - 1`));
check('they get exactly ONE serving of the same dish', J(`__theirs && __theirs.meta.plate.servings.left === 1 && __theirs.meta.plate.servings.total === 1 && __theirs.meta.plate.label === __mine.meta.plate.label`));
check('the serving keeps its age (cohort carried, not reset)', J(`__theirs.meta.cohort != null && __theirs.meta.cohort <= gameDaysNow(__h.meta.clock)`));
api(`for (let i = 1; i < __total; i++) giveGiftUnit(__h, __pick, __ids(__h)[1]);`);
check('giving the last serving empties your bag of that plate', J(`!(__h.player.inventory || []).some(s => s.meta && s.meta.plate)`));
check('…and a pick that is no longer there moves nothing', J(`giveGiftUnit(__h, __pick, __id).ok === false`));
const choc = J(`(() => {
  __h.player.inventory.push({ defId: 'granola_bar', qty: 3, ownerId: 'player', meta: { acquiredDay: 6 } });
  const e = giftSources(__h).find(e => e.defId === 'granola_bar');
  const r = giveGiftUnit(__h, { defId: e.defId, from: e.from, index: e.index, label: e.label }, __ids(__h)[1]);
  return { ok: r.ok, mine: __h.player.inventory.find(s => s.defId === 'granola_bar').qty, theirs: (__h.npcs[__ids(__h)[1]].inventory.find(s => s.defId === 'granola_bar') || {}).qty };
})()`);
check('a stack gives one unit (bag 3 → 2, they get 1)', choc.ok && choc.mine === 2 && choc.theirs === 1, JSON.stringify(choc));
api(`
  __h.npcs[__id].inventory = [__theirs];
  __h.npcs[__id].needs = { ...__h.npcs[__id].needs, hunger: 10 };
  for (const o of ['fridge', 'pantry', 'freezer']) { const x = __obj(__h, o); if (x) x.contents = []; }
  tryEatFood(__h.npcs[__id], __id, { location: __h.npcs[__id].location, block: 'leisure' }, __h, mulberry32(7), DRIVE_DEFS.eat);
`);
check('a hungry roommate eats the plate they were given (it\'s in THEIR things, which the hunger drive reads)',
  J(`!(__h.npcs[__id].inventory || []).some(s => s.meta && s.meta.plate)`));

// ------------------------------------------------------------------ 4
console.log('\n4. The ask: Give a Gift');
api(`
  __h = __house(); currentGameState = __h; __cookPasta(__h); __id = __ids(__h)[0];
  __e = giftSources(__h).find(e => e.isPlate);
  __t = resolveAsk(__h, __id, 'RequestGift', '', __ctx(__h, __id), { giftDefId: __e.defId, giftFrom: __e.from, giftIndex: __e.index, giftLabel: __e.label });
  __t.applyEffects();
`);
const d = J(`__t.decision`);
check('it is accepted and knows it is a plate of food', d.accept && d.giftPlate === true && d.giftFood === true && d.giftWhere === undefined, JSON.stringify(d));
check('the writer is told they were brought a plate of the player\'s cooking', /brought you a plate of their cooking \(Pasta\)/.test(J(`__t.directive`)));
check('exactly one serving moved (they hold 1, the rest is still yours)',
  J(`__h.npcs[__id].inventory.filter(s => s.meta && s.meta.plate).length === 1 && __h.player.inventory.find(s => s.meta && s.meta.plate).meta.plate.servings.left === __e.servingsLeft - 1`));
check('the memory says they were given a plate', J(`(__h.npcs[__id].memory.facts || []).some(f => /gave .* a plate of Pasta/.test(f.text))`));
check('a stale pick (the plate got eaten) is "unavailable" — nothing is written',
  J(`(() => { const t = resolveAsk(__h, __id, 'RequestGift', '', __ctx(__h, __id), { giftDefId: 'cooked_meal', giftFrom: 'player', giftIndex: 7, giftLabel: 'Nope' }); return t.decision.reason; })()`) === 'unavailable');
check('a plain present keeps its exact decision shape (the birthdays pin)', J(`(() => {
  __h.player.inventory = [{ defId: 'chocolate_box', qty: 1, ownerId: 'player', meta: {} }];
  return Object.keys(resolveAsk(__h, __id, 'RequestGift', '', __ctx(__h, __id), { giftDefId: 'chocolate_box' }).decision).sort().join(',');
})()`) === 'accept,giftLabel,giftMatch,reason');
check('ASK_GIFT no longer moves items through MOVE_ITEM (which took the first stack, whole)', !/MOVE_ITEM \$\{defId\} 1 player/.test(fs.readFileSync(path.join(SRC, 'asks.js'), 'utf8')));

// ------------------------------------------------------------------ 4b
console.log('\n4b. The Care Package, end to end');
api(`
  __h = __house(); currentGameState = __h; __id = __ids(__h)[0];
  __q = __carePackage(__h, __id);
  __money0 = __h.player.money;
  __cookPasta(__h);
  checkChainQuestProgress('cook', __id);     // what executeAction does after a cook
  __goal = giftGoalFor(__h, __id);
  __entries = giftPickerEntries(__h, __id);
`);
check('cooking advances the goal to "Give the meal"', J(`__q.currentStep === 1 && __goal && __goal.category === 'meal'`), J(`JSON.stringify(__goal)`));
check('the picker pins the plate from your bag first, marked for the goal',
  J(`__entries[0].isPlate && __entries[0].forGoal === true && __entries[0].from === 'player'`));
check('…and says how much', /^1 serving \(\d+ left\)$/.test(J(`giftPickerMeta(__entries[0])`)), J(`giftPickerMeta(__entries[0])`));
api(`
  __e = __entries[0];
  __t = resolveAsk(__h, __id, 'RequestGift', '', __ctx(__h, __id), { giftDefId: __e.defId, giftFrom: __e.from, giftIndex: __e.index, giftLabel: __e.label });
  __t.applyEffects();
  __beats.length = 0;
  convGiftFollowThrough(__id, __t.decision.giftMoved);
`);
check('giving it IN CONVERSATION advances the goal to "Check in"', J(`__q.currentStep === 2 && __q.steps[1].done === true`));
check('…and the conversation says so', J(`__beats.some(b => /Care Package .* next: Check in/.test(b))`), J(`JSON.stringify(__beats)`));
check('the talk step is now waiting on the next thing the player says', J(`chainTalkStepWaiting(__h, __id)`));
api(`checkQuestCompletion(__id); convGoalBeat(__q);`);
check('talking completes the Care Package, with its reward', J(`!__h.world.quests.active.includes(__q) && __h.player.money === __money0 + __q.rewardMoney`));
check('…announced in the conversation', J(`__beats.some(b => /Goal complete: Care Package/.test(b))`));
check('doConvSend completes a waiting talk step on the next spoken turn (not on the gift turn itself)',
  /talkStepWaiting && !forcedText && !\(askTurn && askTurn\.ask\.gift\)/.test(bodies(UI, 'doConvSend')[0] || '')
  && /const talkStepWaiting = chainTalkStepWaiting\(currentGameState, myNpcId\)/.test(bodies(UI, 'doConvSend')[0] || ''));

// ------------------------------------------------------------------ 5
console.log('\n5. Goal categories say what the goal says');
check('"Buy snacks or drinks … Share with {name}" takes a drink', J(`giftMatchesGoal('food', 'drink') && giftMatchesGoal('food', 'food')`));
check('a meal goal does not take a box of chocolates', J(`!giftMatchesGoal('meal', 'gift')`));
check('the goal step with no category takes anything', J(`giftMatchesGoal(null, 'gift')`));
check('a gift that doesn\'t satisfy the goal leaves the goal where it was', J(`(() => {
  const h = __house(); currentGameState = h; const id = __ids(h)[0];
  const q = __carePackage(h, id); q.currentStep = 1;
  h.player.inventory = [{ defId: 'chocolate_box', qty: 1, ownerId: 'player', meta: {} }];
  const t = resolveAsk(h, id, 'RequestGift', '', __ctx(h, id), { giftDefId: 'chocolate_box' }); t.applyEffects();
  convGiftFollowThrough(id, t.decision.giftMoved);
  return q.currentStep === 1;
})()`));

// ------------------------------------------------------------------ 6
console.log('\n6. A gift to someone giving you the cold shoulder is still reparation');
const cs = J(`(() => {
  const h = __house(); currentGameState = h; const id = __ids(h)[0];
  noteColdShoulder(h.npcs[id], 2, 3, 'test');   // the real writer — onset day 3, three days before day 6
  const before = coldShoulderState(h.npcs[id], 6);
  h.player.inventory = [{ defId: 'flowers', qty: 1, ownerId: 'player', meta: {} }];
  const t = resolveAsk(h, id, 'RequestGift', '', __ctx(h, id), { giftDefId: 'flowers' }); t.applyEffects();
  const res = convGiftFollowThrough(id, t.decision.giftMoved);
  return { before: before.severity, active: before.active, res, after: coldShoulderState(h.npcs[id], 6).severity };
})()`);
check('a landed gift ratchets the cold shoulder down one', cs.active && cs.res && cs.res.repaired && cs.after === cs.before - 1, JSON.stringify(cs));

// ------------------------------------------------------------------ 7
console.log('\n7. The scene chip is the same flow');
const giveBody = bodies(UI, 'doGiveItem')[0] || '';
check('doGiveItem no longer hands over the first matching bag item unasked', !/inv\.findIndex/.test(giveBody));
check('…it opens (or resumes) the conversation and the gift picker', /await doTalk\(npcId\)/.test(giveBody) && /openConvGiftPicker\(\{ npcId \}\)/.test(giveBody) && /doConvGiveGift\(pick\)/.test(giveBody));
check('…and someone who won\'t talk still gets a wordless hand-over through the same one-serving write', /giveGiftUnit\(currentGameState, pick, npcId\)/.test(giveBody));
check('the chip reads giftSources (so a meal in the fridge counts) and names what it\'s for',
  /giftSources\(gs\)\.some\(e => giftMatchesGoal\(wantCategory, e\.category\)\)/.test(RENDER) && /Give \$\{noun\} to/.test(RENDER) && !/Give Item to/.test(RENDER));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
