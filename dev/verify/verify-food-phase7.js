// Food Overhaul Phase 7 — NPCs get a taste (D23), eat like people (D24),
// and sit down at a table that knows what they like (D23).
//
// What this keeps fixed (assertions read TASTE_TUNING/COMMITMENT_TUNING/
// RECIPES rather than restating numbers, so a re-tune moves the assertions
// with it):
//   - npcTaste/deriveNpcTaste (taste.js): derived-but-stable — a pure
//     function of the bible's genSeed plus personality-trait anchors; the
//     same save always reproduces the same tastes, an explicit
//     npc.taste override wins, likes and dislikes stay disjoint, and every
//     derived key names a real TASTE_TUNING.pool entry.
//   - D23 band math: tasteBandForComponents weighs by component quantity;
//     love/hate need a clean sweep on the winning side; a mixed dish reads
//     as the winner's softer band; tasteBandForRecipe and the plate's
//     instance band agree on the same ingredients; set_meal deltas
//     (MOOD_DELTA/REL_DELTA) scale by the band's moodMult/relMult and the
//     narration says which reactions were not neutral.
//   - D24 eat drive: plates are eaten by SERVINGS off the instance ledger
//     (never the last serving), raw ingredients are the *input* to cooking
//     rather than a sad dry-pasta dinner, and a hungry NPC with a bare
//     fridge but a stocked larder auto-cooks the recipe they'd LIKE,
//     leaving real leftovers in the fridge and real dirty cookware in the
//     sink. A frozen plate is not ready food.
//   - a tasted NPC, an auto-cooked batch and a hated plate all survive the
//     real write/load round trip.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['effects.js', 'inventory.js', 'defs.actions.js', 'items.js', 'cooking.js', 'taste.js', 'drives.js', 'sim.js', 'computer.js', 'state.js'] });

let pass = 0, fail = 0;
async function check(name, cond, detail) {
  // STRICT pass: only a literal `true` counts. The failure paths below
  // return MESSAGES (truthy strings) — under the old `if (c)` a failing
  // assertion silently "passed". A truthy string is a FAILURE whose message
  // becomes the detail.
  const c = await cond;
  if (c === true) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++;
    const d = typeof c === 'string' && c ? c : detail;
    console.log(`  FAIL  ${name}${d ? `\n        ${d}` : ''}`);
  }
}

// --- Helpers injected INTO the vm context. ---
api(`
  function house(seed, n) {
    const partials = [];
    for (let i = 0; i < n; i++) partials.push({ name: 'Test' + String.fromCharCode(65 + i) });
    const h = SIM_generateHouse(seed, n, partials);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    for (const id of Object.keys(h.npcs)) {
      h.npcs[id].flags = {};
      h.npcs[id].location = h.npcs[id].residency.room;
      h.npcs[id].needs = h.npcs[id].needs || {};
    }
    h.player.flags = {};
    h.player.inventory = h.player.inventory || [];
    h.player.moodEvents = [];
    h.player.meta = h.player.meta || {};
    return h;
  }
  function objIn(h, defId) {
    for (const bucket of Object.values(h.objects || {})) {
      const o = Object.values(bucket).find(o => o.defId === defId);
      if (o) return o;
    }
    return null;
  }
  function cookCtx(h, roomId) {
    const r = roomId || 'kitchen';
    return { gameState: h, roomId: r, roomObjects: h.objects['room_' + r] || {}, presentNpcIds: [] };
  }
  function applyLines(h, lines) {
    const effCtx = buildEffectContext(h, [], [], h.objects.room_kitchen || {}, h.player.inventory);
    const effects = [];
    for (const line of lines) {
      for (const eff of parseEffectDSL(line)) if (eff) effects.push(eff);
    }
    applyEffects(effects, effCtx);
    return h;
  }
  function stockRecipe(h, recipe) {
    const byClass = { pantry: objIn(h, 'pantry'), fridge: objIn(h, 'fridge'), freezer: objIn(h, 'freezer') };
    for (const ing of recipe.ingredients || []) {
      const def = ITEM_DEFS[ing.defId];
      const cls = (def.storageClass || 'pantry');
      const target = byClass[cls] || byClass.pantry;
      const list = target.contents || (target.contents = []);
      const existing = list.find(s => s.defId === ing.defId);
      if (existing) existing.qty += ing.qty; else list.push({ defId: ing.defId, qty: ing.qty, ownerId: null, meta: { acquiredDay: 1 } });
    }
    for (const r of ['oil', 'salt', 'spices']) {
      const list = byClass.pantry.contents || (byClass.pantry.contents = []);
      if (!list.find(s => s.defId === r)) list.push({ defId: r, qty: 2, ownerId: null, meta: { acquiredDay: 1 } });
    }
    return h;
  }
  function clearStorage(h) {
    for (const defId of ['fridge', 'pantry', 'freezer']) {
      const o = objIn(h, defId);
      if (o) o.contents = [];
    }
    return h;
  }
  function plateIn(h, objId, plate, { left } = {}) {
    const obj = findObjectById(h, objId);
    const p = Object.assign({}, plate, left != null ? { servings: { total: plate.servings.total, left } } : {});
    const now = gameDaysNow(h.meta.clock);
    const meta = { plate: p, cohort: now, acquiredDay: now };
    const stack = { defId: 'cooked_meal', qty: 1, meta };
    obj.contents = (obj.contents || []).concat([stack]);
    return stack;
  }
  function plateStackIn(h, objId) {
    const obj = findObjectById(h, objId);
    return (obj ? obj.contents : []).find(s => s?.meta?.plate) || null;
  }
  function feedTaste(npc, likes, dislikes) {
    npc.taste = { likes: likes || [], dislikes: dislikes || [] };
    return npc;
  }
  function eatDrive(npc, npcId, h, seed, location) {
    return tryEatFood(npc, npcId, { location: location || 'kitchen', block: 'leisure' }, h, mulberry32(seed), DRIVE_DEFS.eat);
  }
  function makeMemKv() {
    const stores = {};
    const wrap = (name) => {
      const m = {};
      m.get = async (k) => { const s = stores[name] || (stores[name] = {}); const v = s[k]; return v === undefined ? undefined : structuredClone(v); };
      m.set = async (k, v) => { const s = stores[name] || (stores[name] = {}); s[k] = structuredClone(v); };
      m.update = async (k, fn) => { const cur = await m.get(k); const nv = fn(cur); await m.set(k, nv); return nv; };
      m.keys = async () => Object.keys(stores[name] || {});
      m.delete = async (k) => { if (stores[name]) delete stores[name][k]; };
      m.entries = async () => Object.entries(stores[name] || {}).map(([k, v]) => [k, structuredClone(v)]);
      m.values = async () => Object.values(stores[name] || {}).map(v => structuredClone(v));
      m.getMany = async (ks) => Promise.all(ks.map(k => m.get(k)));
      m.setMany = async (pairs) => { for (const [k, v] of pairs) await m.set(k, v); };
      m.deleteMany = async (ks) => { for (const k of ks) await m.delete(k); };
      return m;
    };
    const kv = {};
    for (const f of ['meta', 'player', 'world', 'npcs', 'objects', 'images', 'snapshots', 'saves', 'saveIndex', 'menu', 'pendingOp', 'kv']) kv[f] = wrap(f);
    return kv;
  }
`);

// Everything below needs `await`, which can't sit at this file's top level
// alongside the `require()` above (Node treats that combination as
// ambiguous module syntax and refuses to guess CJS vs ESM) — wrapped in
// one async function and invoked immediately instead.
async function main() {

console.log('\n1. taste.js loads and npcTaste is derived-but-stable');

await check('npcTaste and its band helpers are defined (taste.js is in ORDER)',
  api(`(() => typeof npcTaste === 'function' && typeof deriveNpcTaste === 'function'
       && typeof tasteBandForStack === 'function' && typeof tasteNoteList === 'function')()`));

await check('derived taste is stable per NPC, names real pool keys, has the right counts, and never likes and dislikes the same thing',
  api(`(() => {
    const h = house('p7-stab', 2);
    const poolKeys = new Set(TASTE_TUNING.pool.map(e => e.key));
    for (const id of Object.keys(h.npcs)) {
      const a = deriveNpcTaste(h.npcs[id]);
      const b = deriveNpcTaste(h.npcs[id]);
      if (JSON.stringify(a) !== JSON.stringify(b)) return 'not stable: ' + id;
      if (a.likes.length !== TASTE_TUNING.likesPerNpc || a.dislikes.length !== TASTE_TUNING.dislikesPerNpc) return 'wrong counts for ' + id;
      for (const k of [...a.likes, ...a.dislikes]) if (!poolKeys.has(k)) return 'key not in pool: ' + k;
      if (a.likes.some(k => a.dislikes.includes(k))) return 'liked and disliked: ' + id;
    }
    return true;
  })()`));

await check('an explicit npc.taste override wins, and derived profiles differ between NPCs',
  api(`(() => {
    const h = house('p7-var', 4);
    const first = Object.keys(h.npcs)[0];
    feedTaste(h.npcs[first], ['bacon']);
    if (JSON.stringify(npcTaste(h.npcs[first])) !== JSON.stringify({ likes: ['bacon'], dislikes: [] })) return 'override lost';
    const profiles = Object.keys(h.npcs).map(id => JSON.stringify(deriveNpcTaste(h.npcs[id])));
    return new Set(profiles).size >= 2;
  })()`));

console.log('\n2. D23 band math — quantities, clean sweeps, and mixed dishes');

await check('a two-egg omelette whose eggs+cheese are liked is LOVE (clean sweep)',
  api(`(() => tasteBandForComponents(RECIPES.omelette.ingredients, { likes: ['eggs', 'cheese'], dislikes: [] }) === 'love')()`));

await check('the same preferences leave a stir-fry NEUTRAL (nothing matches)',
  api(`(() => tasteBandForComponents(RECIPES.stirfry.ingredients, { likes: ['eggs', 'cheese'], dislikes: [] }) === 'neutral')()`));

await check('one liked part of three reads LIKE, not love (quantity-weighted)',
  api(`(() => tasteBandForComponents(RECIPES.omelette.ingredients, { likes: ['dairy'], dislikes: [] }) === 'like')()`));

await check('a stir-fry that is ALL disliked is HATE (clean sweep the other way)',
  api(`(() => tasteBandForComponents(RECIPES.stirfry.ingredients, { likes: [], dislikes: ['rice', 'chicken_raw', 'onion'] }) === 'hate')()`));

await check("a mixed omelette (likes cheese, hates eggs) lands in the winner's softer band: DISLIKE",
  api(`(() => tasteBandForComponents(RECIPES.omelette.ingredients, { likes: ['cheese'], dislikes: ['eggs'] }) === 'dislike')()`));

await check('tasteBandForRecipe agrees with the components it came from',
  api(`(() => tasteBandForRecipe(RECIPES.omelette, { likes: ['eggs'], dislikes: [] }) === 'love')()`));

await check('a def-driven stack rates its own def as a one-component meal',
  api(`(() => tasteBandForStack({ defId: 'bacon', qty: 1 }, { likes: ['bacon'], dislikes: [] }) === 'love'
       && tasteBandForStack({ defId: 'bacon', qty: 1 }, { likes: [], dislikes: ['bacon'] }) === 'hate')()`));

await check('band weights are strictly ordered love > like > neutral > dislike > hate',
  api(`(() => {
    const w = (b) => tasteBandRow(b).weight;
    return w('love') > w('like') && w('like') > w('neutral') && w('neutral') > w('dislike') && w('dislike') > w('hate');
  })()`));

await check('tasteNoteList names only the non-neutral reactions at a table',
  api(`(() => {
    const h = house('p7-notes', 2);
    const ids = Object.keys(h.npcs);
    feedTaste(h.npcs[ids[0]], ['eggs', 'cheese']);
    feedTaste(h.npcs[ids[1]], [], ['eggs', 'cheese']);
    const plate = { recipeKey: 'test', label: 'Test', kcalPerServing: 75, servings: { total: 2, left: 2 }, quality: 0.5, grade: 'C',
      components: [{ defId: 'eggs', qty: 2 }, { defId: 'cheese', qty: 1 }], method: null, cookware: null, preparedAbs: 1, wasReheated: false };
    const stack = { defId: 'cooked_meal', qty: 1, meta: { plate } };
    const notes = tasteNoteList(stack, [{ npc: h.npcs[ids[0]] }, { npc: h.npcs[ids[1]] }]);
    return notes.length === 2 && notes[0].band === 'love' && notes[1].band === 'hate'
      && notes[0].name === 'TestA' && notes[1].name === 'TestB';
  })()`));

console.log("\n3. D23 set_meal — deltas scale by the eater's band");

await check('fed lovers bond more than neutrals more than hates, at the right multipliers, and the plate drains by exactly three servings',
  api(`(() => {
    const h = house('p7-meal', 2);
    const ids = Object.keys(h.npcs);
    const A = ids[0], B = ids[1];
    h.player.location = 'dining';
    h.npcs[A].location = 'dining';
    h.npcs[B].location = 'dining';
    h.npcs[A].relPlayer = h.npcs[A].relPlayer || { affection: 0, tension: 0 };
    h.npcs[B].relPlayer = h.npcs[B].relPlayer || { affection: 0, tension: 0 };
    feedTaste(h.npcs[A], ['eggs', 'cheese']);
    feedTaste(h.npcs[B], [], ['eggs', 'cheese']);
    const fridge = objIn(h, 'fridge');
    fridge.contents = [];
    RECIPES.test_feast = { id: 'test_feast', label: 'Feast', servings: 6,
      ingredients: [{ defId: 'eggs', qty: 2 }, { defId: 'cheese', qty: 1 }], method: 'fry', cookware: 'pan' };
    const plate = makePlate(h, RECIPES.test_feast, RECIPES.test_feast.ingredients, 'fry', 'pan');
    const stack = plateIn(h, fridge.id, plate);
    delete RECIPES.test_feast;
    const option = { stack, from: fridge.id, def: ITEM_DEFS.cooked_meal };
    const spread = [option];
    const servings = allocateSpread(spread, ['player', A, B]);
    const prepared = {
      spread, servings, affection: 0, hasCommitment: false,
      attendees: [{ npcId: A, npc: h.npcs[A], committed: false }, { npcId: B, npc: h.npcs[B], committed: false }],
      fedNpcIds: servings.filter(s => s.who !== 'player').map(s => s.who),
      seats: 3, totalServings: 6,
    };
    const ctx = cookCtx(h, 'dining');
    const lines = buildSetMealEffects(ctx, prepared);
    const eats = lines.filter(l => l.startsWith('EAT_ITEM '));
    if (eats.length !== 3) return 'expected 3 EAT_ITEM lines, got ' + eats.length;
    const rels = {};
    const moods = {};
    for (const l of lines) {
      let m = l.match(/^REL_DELTA (\\S+) affection \\+(\\S+)$/);
      if (m) rels[m[1]] = Number(m[2]);
      m = l.match(/^MOOD_DELTA (\\S+) \\+(\\S+)$/);
      if (m) moods[m[1]] = Number(m[2]);
    }
    const q = spreadQuality(spread);
    const base = mealRelDelta(q, h.npcs[A], true);
    const love = tasteBandRow('love'), hate = tasteBandRow('hate');
    if (Math.abs(rels[A] - Math.round(base * love.relMult * 1000) / 1000) > 1e-9) return 'A rel not love-scaled: ' + rels[A];
    if (Math.abs(rels[B] - Math.round(base * hate.relMult * 1000) / 1000) > 1e-9) return 'B rel not hate-scaled: ' + rels[B];
    if (!(rels[A] > base && rels[B] < base)) return 'scaling direction wrong';
    if (!(moods[A] > moods[B])) return 'mood not scaled: ' + moods[A] + ' vs ' + moods[B];
    applyLines(h, lines);
    // The plate's serving ledger is rebuilt (immutably) by each EAT_ITEM —
    // read the LIVE stack from the container, never the stale plateIn
    // reference, or the drain reads as if nothing was eaten.
    const drained = stackServingsLeft(fridge.contents[0]);
    if (drained !== 3) return 'plate not drained by exactly 3 servings: ' + drained;
    if (!(h.npcs[A].relPlayer.affection > h.npcs[B].relPlayer.affection)) return 'affection order wrong';
    return true;
  })()`));

await check('setMealNarration says which reactions were not neutral',
  api(`(() => {
    const h = house('p7-narr', 1);
    const npcId = Object.keys(h.npcs)[0];
    h.player.location = 'dining';
    h.npcs[npcId].location = 'dining';
    feedTaste(h.npcs[npcId], ['eggs', 'cheese']);
    const fridge = objIn(h, 'fridge');
    fridge.contents = [];
    RECIPES.test_feast = { id: 'test_feast', label: 'Feast', servings: 6,
      ingredients: [{ defId: 'eggs', qty: 2 }, { defId: 'cheese', qty: 1 }], method: 'fry', cookware: 'pan' };
    const plate = makePlate(h, RECIPES.test_feast, RECIPES.test_feast.ingredients, 'fry', 'pan');
    const stack = plateIn(h, fridge.id, plate);
    delete RECIPES.test_feast;
    const option = { stack, from: fridge.id, def: ITEM_DEFS.cooked_meal };
    const servings = allocateSpread([option], ['player', npcId]);
    const prepared = {
      spread: [option], servings, affection: 0, hasCommitment: false,
      attendees: [{ npcId, npc: h.npcs[npcId], committed: false }],
      fedNpcIds: [npcId], seats: 2, totalServings: 6,
    };
    const narration = setMealNarration(cookCtx(h, 'dining'), prepared);
    return typeof narration === 'string' && narration.includes(tasteBandRow('love').reaction.replace('{name}', h.npcs[npcId].bible.name));
  })()`));

console.log('\n4. D24 eat drive — servings off the ledger, never the last one');

await check('a 4-serving plate feeds by SERVINGS: one serving eaten, three left, hunger restored',
  api(`(() => {
    const h = clearStorage(house('p7-eat', 1));
    const npcId = Object.keys(h.npcs)[0];
    const npc = h.npcs[npcId];
    feedTaste(npc, ['rice']);
    npc.needs.hunger = 30;
    npc.inventory = [];
    const fridge = objIn(h, 'fridge');
    const plate = { recipeKey: 'test', label: 'Test Plate', kcalPerServing: 300,
      servings: { total: 4, left: 4 }, quality: 0.5, grade: 'C', components: [{ defId: 'rice', qty: 1, stage: 'cooked' }],
      method: null, cookware: null, preparedAbs: 1, wasReheated: false };
    plateIn(h, fridge.id, plate);
    const result = eatDrive(npc, npcId, h, 1);
    return result && result.activityOverride === 'cooking'
      && plateStackIn(h, fridge.id).meta.plate.servings.left === 3
      && npc.needs.hunger === 90
      && result.events[0].data.items.toLowerCase().includes('test plate');
  })()`));

await check('a 1-serving plate is never double-eaten: one bite, plate gone, no scrounge',
  api(`(() => {
    const h = clearStorage(house('p7-eat1', 1));
    const npcId = Object.keys(h.npcs)[0];
    const npc = h.npcs[npcId];
    feedTaste(npc, ['rice']);
    npc.needs.hunger = 0;
    npc.inventory = [];
    const fridge = objIn(h, 'fridge');
    const plate = { recipeKey: 'test', label: 'Test Plate', kcalPerServing: 300,
      servings: { total: 1, left: 1 }, quality: 0.5, grade: 'C', components: [{ defId: 'rice', qty: 1, stage: 'cooked' }],
      method: null, cookware: null, preparedAbs: 1, wasReheated: false };
    plateIn(h, fridge.id, plate);
    const result = eatDrive(npc, npcId, h, 1);
    return result && result.activityOverride === 'cooking'
      && !(fridge.contents || []).some(s => s.defId === 'cooked_meal')
      && npc.needs.hunger === 60
      && result.events[0].type === 'eat';
  })()`));

await check('taste breaks ties: a loved plate beats an equal-value granola bar, the granola is untouched',
  api(`(() => {
    const h = clearStorage(house('p7-tie', 1));
    const npcId = Object.keys(h.npcs)[0];
    const npc = h.npcs[npcId];
    feedTaste(npc, ['rice']);
    npc.needs.hunger = 0;
    npc.inventory = [];
    const pantry = objIn(h, 'pantry');
    pantry.contents = [{ defId: 'granola_bar', qty: 2, ownerId: null, meta: { acquiredDay: 1 } }];
    const fridge = objIn(h, 'fridge');
    const plate = { recipeKey: 'test', label: 'Test Plate', kcalPerServing: 75,
      servings: { total: 6, left: 6 }, quality: 0.5, grade: 'C', components: [{ defId: 'rice', qty: 1, stage: 'cooked' }],
      method: null, cookware: null, preparedAbs: 1, wasReheated: false };
    plateIn(h, fridge.id, plate);
    const result = eatDrive(npc, npcId, h, 2);
    return result
      && plateStackIn(h, fridge.id).meta.plate.servings.left === 1
      && pantry.contents[0].qty === 2
      && npc.needs.hunger === 75
      && !result.events[0].data.items.includes('granola');
  })()`));

await check('a frozen plate is not ready food: the NPC scrounges and the freezer keeps its plate',
  api(`(() => {
    const h = clearStorage(house('p7-frz', 1));
    const npcId = Object.keys(h.npcs)[0];
    const npc = h.npcs[npcId];
    feedTaste(npc, ['rice']);
    npc.needs.hunger = 40;
    npc.inventory = [];
    const freezer = objIn(h, 'freezer');
    const now = gameDaysNow(h.meta.clock);
    const plate = { recipeKey: 'test', label: 'Test Plate', kcalPerServing: 300,
      servings: { total: 2, left: 2 }, quality: 0.5, grade: 'C', components: [{ defId: 'rice', qty: 1, stage: 'cooked' }],
      method: null, cookware: null, preparedAbs: 1, wasReheated: false };
    const stack = plateIn(h, freezer.id, plate);
    stack.meta.frozen = { frozenAtAbs: now, thawStartAbs: null, agedFraction: 0 };
    const result = eatDrive(npc, npcId, h, 3);
    return result && result.activityOverride === 'scrounging'
      && (freezer.contents || []).some(s => s.defId === 'cooked_meal')
      && npc.needs.hunger === 70;
  })()`));

console.log('\n5. D24 NPC auto-cook — a bare fridge with a stocked larder is an invitation');

await check('a hungry NPC auto-cooks pasta from the pantry and leaves real leftovers in the fridge',
  api(`(() => {
    const h = clearStorage(house('p7-cook', 1));
    stockRecipe(h, RECIPES.pasta);
    const npcId = Object.keys(h.npcs)[0];
    const npc = h.npcs[npcId];
    feedTaste(npc, ['pasta_dry', 'tomato_sauce']);
    npc.needs.hunger = 40;
    npc.inventory = [];
    const result = eatDrive(npc, npcId, h, 5);
    const pantry = objIn(h, 'pantry');
    const fridge = objIn(h, 'fridge');
    const sink = objIn(h, 'sink_kitchen');
    const plate = plateStackIn(h, fridge.id);
    if (!result || result.activityOverride !== 'cooking' || result.locationOverride !== 'kitchen') return 'no cooking result';
    if (!plate || plate.meta.plate.recipeKey !== 'pasta') return 'no pasta plate in fridge';
    // A 3-serving pot with a real leftover: the NPC eats UNTIL satisfied,
    // which with pasta's 90 kcal/serving (18 hunger/serving) means two
    // servings from hunger 40 — the exact leftover count is kcal-derived,
    // so assert real leftovers (≥1 and not the whole batch), not a baked-in
    // number that breaks the moment a recipe's kcal is retuned.
    const left = plate.meta.plate.servings.left;
    const total = plate.meta.plate.servings.total;
    if (!(left >= 1 && left < total)) return 'batch not left with real leftovers: ' + left + '/' + total;
    if ((pantry.contents || []).some(s => s.defId === 'pasta_dry' || s.defId === 'tomato_sauce')) return 'ingredients not consumed';
    if (sink.dishUnits < 4) return 'cookware not dirtied: ' + sink.dishUnits;
    // The eat-until contract is a FLOOR, not an exact value: a serving's
    // hunger can't be split, so the NPC overshoots 65 by up to a serving
    // (pasta's 22/serving lands at 84). Assert satisfied, not a magic 65.
    if (npc.needs.hunger < NPC_INVENTORY.eatUntilHunger) return 'hunger under target: ' + npc.needs.hunger;
    if (!result.events[0].template.includes('cooked')) return 'event is not the cook event';
    return true;
  })()`));

await check('the recipe choice is taste-weighted: a rice+chicken lover cooks stir-fry, not pasta',
  api(`(() => {
    const h = clearStorage(house('p7-wt', 1));
    stockRecipe(h, RECIPES.pasta);
    stockRecipe(h, RECIPES.stirfry);
    const npcId = Object.keys(h.npcs)[0];
    const npc = h.npcs[npcId];
    feedTaste(npc, ['rice', 'chicken_raw']);
    npc.needs.hunger = 40;
    npc.inventory = [];
    eatDrive(npc, npcId, h, 7);
    const plate = plateStackIn(h, objIn(h, 'fridge').id);
    return plate && plate.meta.plate.recipeKey === 'stirfry';
  })()`));

await check('a snack in the bag beats cooking: the NPC snacks and never fires the stove',
  api(`(() => {
    const h = clearStorage(house('p7-snack', 1));
    stockRecipe(h, RECIPES.pasta);
    const npcId = Object.keys(h.npcs)[0];
    const npc = h.npcs[npcId];
    feedTaste(npc, ['pasta_dry']);
    npc.needs.hunger = 40;
    npc.inventory = [{ defId: 'granola_bar', qty: 2, ownerId: npcId, meta: { acquiredDay: 1 } }];
    const result = eatDrive(npc, npcId, h, 11, 'bedroom_player');
    if (!result || result.activityOverride !== 'snacking') return 'not snacking: ' + result?.activityOverride;
    if (npc.inventory.length !== 0) return 'granola not eaten: ' + JSON.stringify(npc.inventory);
    if (plateStackIn(h, objIn(h, 'fridge').id)) return 'stove fired anyway';
    if (npc.needs.hunger !== 70) return 'hunger wrong: ' + npc.needs.hunger;
    return true;
  })()`));

await check('raw ingredients alone are a scrounge, not a meal — dry pasta is only eaten when nothing can be cooked',
  api(`(() => {
    const h = clearStorage(house('p7-raw', 1));
    const npcId = Object.keys(h.npcs)[0];
    const npc = h.npcs[npcId];
    feedTaste(npc, ['rice']);
    npc.needs.hunger = 40;
    npc.inventory = [];
    // Only a single raw ingredient — no recipe is coverable (needs sauce too).
    const pantry = objIn(h, 'pantry');
    pantry.contents = [{ defId: 'pasta_dry', qty: 3, ownerId: null, meta: { acquiredDay: 1 } }];
    const result = eatDrive(npc, npcId, h, 17);
    if (!result || result.activityOverride === 'scrounging') return 'no result or scrounged despite raw food';
    const left = (pantry.contents || []).reduce((s, x) => s + (x.qty || 0), 0);
    return left === 1 && npc.needs.hunger === 70 && !plateStackIn(h, objIn(h, 'fridge').id);
  })()`));

await check('with nothing ready, nothing cookable and no raw food, the NPC scrounges',
  api(`(() => {
    const h = clearStorage(house('p7-scr', 1));
    const npcId = Object.keys(h.npcs)[0];
    const npc = h.npcs[npcId];
    npc.needs.hunger = 40;
    npc.inventory = [];
    const result = eatDrive(npc, npcId, h, 13);
    return result && result.activityOverride === 'scrounging'
      && result.events[0].type === 'eat_fallback'
      && npc.needs.hunger === 70;
  })()`));

console.log('\n6. the save/load round trip');

await check('a tasted NPC, an auto-cooked batch and a hated plate survive the real write/load cycle',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-p7', clock: { day: 1, minutes: 0 } });
    const h = clearStorage(house('rt-p7', 2));
    const npcId = Object.keys(h.npcs)[0];
    feedTaste(h.npcs[npcId], ['pasta_dry', 'tomato_sauce']);
    h.npcs[npcId].needs.hunger = 40;
    h.npcs[npcId].inventory = [];
    stockRecipe(h, RECIPES.pasta);
    eatDrive(h.npcs[npcId], npcId, h, 23);
    const beforeHunger = h.npcs[npcId].needs.hunger;
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    const lNpc = loaded.npcs[npcId];
    if (lNpc.needs.hunger !== beforeHunger) return 'hunger lost: ' + lNpc.needs.hunger;
    if (JSON.stringify(lNpc.taste) !== JSON.stringify({ likes: ['pasta_dry', 'tomato_sauce'], dislikes: [] })) return 'taste lost';
    const fridge = Object.values(loaded.objects.room_kitchen).find(o => o.defId === 'fridge');
    const plate = (fridge.contents || []).find(s => s?.meta?.plate);
    if (plate?.meta?.plate?.recipeKey !== 'pasta') return 'auto-cooked plate lost';
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
