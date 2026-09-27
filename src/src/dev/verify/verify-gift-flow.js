// Conversation overhaul Phase 4 (D6) — one giving pipeline, and it reaches
// the fridge.
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
//   - and a cooked meal lands in the FRIDGE, which neither path could see —
//     while a plate is one stack holding the whole batch, so a hand-over gave
//     away every serving.
//
// This drives the Care Package end to end on the REAL cook path
// (buildCookEffects → the plate in the fridge), the real ask (resolveAsk →
// ASK_GIFT → giveGiftUnit), the real goal writers lifted out of ui.js
// (checkChainQuestProgress, checkQuestCompletion, convGiftFollowThrough), and
// the real hunger drive (tryEatFood) to show the saved plate gets eaten.
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
  // The real cook: pantry stock → buildCookEffects → a plate in the fridge.
  function __cookPasta(h) {
    const pantry = __obj(h, 'pantry'), fridge = __obj(h, 'fridge');
    pantry.contents = [{ defId: 'pasta_dry', qty: 2 }, { defId: 'tomato_sauce', qty: 2 }];
    fridge.contents = [];
    const ctx = { gameState: h, roomId: 'kitchen', roomObjects: h.objects.room_kitchen || {}, presentNpcIds: [] };
    const pasta = availableRecipes(kitchenIngredientPool(h, ctx)).find(r => r.id === 'pasta');
    __apply(h, buildCookEffects(ctx, { recipe: pasta }));
    return fridge;
  }
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
console.log('\n1. giftSources: the bag AND ready food in the kitchen');
api(`
  __h = __house(); currentGameState = __h;
  __fridge = __cookPasta(__h);
  __pantry = __obj(__h, 'pantry');
  __pantry.contents.push({ defId: 'chips', qty: 2, ownerId: null, meta: { acquiredDay: 6 } });
  __pantry.contents.push({ defId: 'granola_bar', qty: 1, ownerId: __ids(__h)[1], meta: { acquiredDay: 6 } });
  __h.player.inventory = [
    { defId: 'chocolate_box', qty: 1, ownerId: 'player', meta: {} },
    { defId: 'flowers', qty: 1, ownerId: __ids(__h)[1], meta: { borrowed: { from: __ids(__h)[1], dueDay: 9 } } },
  ];
  __src = giftSources(__h);
`);
const src = J(`__src.map(e => ({ where: e.where, defId: e.defId, label: e.label, plate: e.isPlate, left: e.servingsLeft, category: e.category }))`);
const plate = src.find(e => e.plate);
check('the cooked pasta (a plate in the FRIDGE) is a gift source', !!plate && plate.where === 'fridge' && plate.category === 'meal', JSON.stringify(src));
check('…with its real servings left (3 cooked, 1 auto-eaten)', plate && plate.left === 2, JSON.stringify(plate));
check('ready pantry food (chips) is a source', src.some(e => e.defId === 'chips' && e.where === 'pantry'));
check('raw ingredients are never offered (dry pasta, sauce)', !src.some(e => ['pasta_dry', 'tomato_sauce'].includes(e.defId)));
check('someone else\'s labelled food is never offered', !src.some(e => e.defId === 'granola_bar'));
check('a borrowed thing isn\'t yours to give (Give It Back returns it)', !src.some(e => e.defId === 'flowers'));
check('an ordinary present in the bag is a source', src.some(e => e.defId === 'chocolate_box' && e.where === 'bag'));
check('frozen food is not ready to give', J(`(() => {
  const f = __obj(__h, 'fridge');
  f.contents.push({ defId: 'frozen_pizza', qty: 1, ownerId: null, meta: { acquiredDay: 6, frozen: { frozenAtAbs: 5, thawStartAbs: null, agedFraction: 0.1 } } });
  const ok = !giftSources(__h).some(e => e.defId === 'frozen_pizza');
  f.contents.pop();
  return ok;
})()`));
check('rotten food is not a gift', J(`(() => {
  const f = __obj(__h, 'fridge');
  f.contents.push({ defId: 'meal_pasta', qty: 1, ownerId: null, meta: { acquiredDay: -40, cohort: -40 } });
  const ok = !giftSources(__h).some(e => e.defId === 'meal_pasta');
  f.contents.pop();
  return ok;
})()`));

// ------------------------------------------------------------------ 2
console.log('\n2. One serving, not the batch');
api(`
  __id = __ids(__h)[0];
  __pick = (() => { const e = giftSources(__h).find(e => e.isPlate); return { defId: e.defId, from: e.from, index: e.index, label: e.label }; })();
  __before = JSON.parse(JSON.stringify(__fridge.contents.find(s => s.meta && s.meta.plate)));
  __moved = giveGiftUnit(__h, __pick, __id);
  __after = __fridge.contents.find(s => s.meta && s.meta.plate);
  __theirs = (__h.npcs[__id].inventory || []).find(s => s.meta && s.meta.plate);
`);
check('the hand-over reports what moved', J(`__moved.ok && __moved.isPlate && __moved.category === 'meal' && __moved.where === 'fridge'`), J(`JSON.stringify(__moved)`));
check('the fridge keeps the rest of the batch (2 → 1 serving left)', J(`__after && __after.meta.plate.servings.left === 1`));
check('they get exactly ONE serving of the same dish', J(`__theirs && __theirs.meta.plate.servings.left === 1 && __theirs.meta.plate.servings.total === 1 && __theirs.meta.plate.label === __before.meta.plate.label`));
check('the serving keeps its age (cohort carried, not reset to today)', J(`__theirs.meta.cohort != null && __theirs.meta.cohort <= gameDaysNow(__h.meta.clock)`));
api(`__moved2 = giveGiftUnit(__h, __pick, __id);`);
check('giving the last serving empties the fridge of that plate', J(`__moved2.ok && !__fridge.contents.some(s => s.meta && s.meta.plate)`));
check('…and a pick that is no longer there moves nothing', J(`giveGiftUnit(__h, __pick, __id).ok === false`));
const chips = J(`(() => {
  const e = giftSources(__h).find(e => e.defId === 'chips');
  const r = giveGiftUnit(__h, { defId: e.defId, from: e.from, index: e.index, label: e.label }, __ids(__h)[1]);
  return { ok: r.ok, pantry: __pantry.contents.find(s => s.defId === 'chips').qty, theirs: (__h.npcs[__ids(__h)[1]].inventory.find(s => s.defId === 'chips') || {}).qty };
})()`);
check('a stack gives one unit (pantry chips 2 → 1, they get 1)', chips.ok && chips.pantry === 1 && chips.theirs === 1, JSON.stringify(chips));
api(`
  __h.npcs[__id].inventory = __h.npcs[__id].inventory.filter(s => !(s.meta && s.meta.plate));
  __h.npcs[__id].inventory.push(__theirs);
  __h.npcs[__id].needs = { ...__h.npcs[__id].needs, hunger: 10 };
  for (const o of ['fridge', 'pantry', 'freezer']) { const x = __obj(__h, o); if (x) x.contents = []; }
  tryEatFood(__h.npcs[__id], __id, { location: __h.npcs[__id].location, block: 'leisure' }, __h, mulberry32(7), DRIVE_DEFS.eat);
`);
check('a hungry roommate eats the plate they were given (it\'s in THEIR things, which the hunger drive reads)',
  J(`!(__h.npcs[__id].inventory || []).some(s => s.meta && s.meta.plate)`));

// ------------------------------------------------------------------ 3
console.log('\n3. The ask: Give a Gift from the fridge');
api(`
  __h = __house(); currentGameState = __h; __fridge = __cookPasta(__h); __id = __ids(__h)[0];
  __e = giftSources(__h).find(e => e.isPlate);
  __t = resolveAsk(__h, __id, 'RequestGift', '', __ctx(__h, __id), { giftDefId: __e.defId, giftFrom: __e.from, giftIndex: __e.index, giftLabel: __e.label });
  __t.applyEffects();
`);
const d = J(`__t.decision`);
check('it is accepted and knows it is a plate from the fridge', d.accept && d.giftPlate === true && d.giftWhere === 'fridge' && d.giftFood === true, JSON.stringify(d));
check('from the living room it\'s "saved you a plate … in the fridge", not a hand-over', d.giftHanded === false && /waiting for you in the fridge/.test(J(`__t.directive`)));
check('exactly one serving moved (fridge 2 → 1, they hold 1)',
  J(`__fridge.contents.find(s => s.meta && s.meta.plate).meta.plate.servings.left === 1 && __h.npcs[__id].inventory.filter(s => s.meta && s.meta.plate).length === 1`));
check('the memory says a plate was saved for them', J(`(__h.npcs[__id].memory.facts || []).some(f => /saved .* a plate of/.test(f.text))`));
check('in the kitchen, the same gift is handed over', J(`(() => {
  __h.player.location = 'kitchen';
  const e = giftSources(__h).find(e => e.isPlate);
  const t = resolveAsk(__h, __id, 'RequestGift', '', __ctx(__h, __id), { giftDefId: e.defId, giftFrom: e.from, giftIndex: e.index, giftLabel: e.label });
  __h.player.location = 'living_room';
  return t.decision.giftHanded === true && /brought you a plate/.test(t.directive);
})()`));
check('a stale pick (the plate got eaten) is "unavailable" — nothing is written',
  J(`(() => { const t = resolveAsk(__h, __id, 'RequestGift', '', __ctx(__h, __id), { giftDefId: 'cooked_meal', giftFrom: __fridge.id, giftIndex: 7, giftLabel: 'Nope' }); return t.decision.reason; })()`) === 'unavailable');
check('a plain present from the bag keeps its exact decision shape (the birthdays pin)', J(`(() => {
  __h.player.inventory = [{ defId: 'chocolate_box', qty: 1, ownerId: 'player', meta: {} }];
  return Object.keys(resolveAsk(__h, __id, 'RequestGift', '', __ctx(__h, __id), { giftDefId: 'chocolate_box' }).decision).sort().join(',');
})()`) === 'accept,giftLabel,giftMatch,reason');
check('ASK_GIFT no longer moves items through MOVE_ITEM (which took the first stack, whole)', !/MOVE_ITEM \$\{defId\} 1 player/.test(fs.readFileSync(path.join(SRC, 'asks.js'), 'utf8')));

// ------------------------------------------------------------------ 4
console.log('\n4. The Care Package, end to end');
api(`
  __h = __house(); currentGameState = __h; __id = __ids(__h)[0];
  __q = __carePackage(__h, __id);
  __money0 = __h.player.money;
  __fridge = __cookPasta(__h);
  checkChainQuestProgress('cook', __id);     // what executeAction does after a cook
  __goal = giftGoalFor(__h, __id);
  __entries = giftPickerEntries(__h, __id);
`);
check('cooking advances the goal to "Give the meal"', J(`__q.currentStep === 1 && __goal && __goal.category === 'meal'`), J(`JSON.stringify(__goal)`));
check('the picker pins the fridge plate first, marked for the goal',
  J(`__entries[0].isPlate && __entries[0].forGoal === true && __entries[0].where === 'fridge'`));
check('…and says where it is and how much', /^1 serving \(2 left\) · In the fridge$/.test(J(`giftPickerMeta(__entries[0])`)), J(`giftPickerMeta(__entries[0])`));
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
