// QuickCart (grocery delivery, an Instacart parody, split off from Nile).
//
// What this checks:
//   - GROCERY_CATALOG_LIST/SHOP_CATALOG_LIST partition ITEM_DEFS' 108
//     priced entries with zero overlap: 54 groceries (storageClassOf's
//     ingredient/food/drink/comfort categories) + toiletry/cleaning/
//     medication, 54 everything-else left on Nile.
//   - getGroceryOrderTotals' fee math against GROCERY_TUNING, including
//     the empty-cart zero-delivery-fee edge and a custom tip override.
//   - Timing determinism: getGroceryEarliestArrival/getGroceryShopMinutes/
//     getGroceryTravelMinutes are pure functions of (seed, day, seq) — same
//     inputs, same arrival, always within the tuned min/max bounds.
//   - pickGroceryShopper: deterministic per (day, seq), names a real
//     shopper_N NPC within the pool size, and actually creates it.
//   - placeGroceryOrder: charges the real total, refuses cleanly (money
//     untouched) on an empty cart or insufficient funds, empties the cart
//     on success, pushes the right shape into world.groceryOrders, and
//     schedules a matching visit at the entry.
//   - apps.grocery.cart and an in-flight world.groceryOrders entry survive
//     the real write/load round trip.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['items.js', 'config.js', 'sim.js', 'state.js', 'computer.js'] });

let pass = 0, fail = 0;
async function check(name, cond, detail) {
  // STRICT pass: only a literal `true` counts (the 2026-08-18 Phase 7 fix —
  // a truthy failure-message string must never read as a pass).
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
    // SIM_generateHouse's own world literal already sets groceryOrders: []
    // (mirrors foodOrders), but world.computer is COMPUTER's job at real
    // new-game time, not SIM's — every check below reads/writes
    // apps.grocery, so the harness house needs the real default shape.
    h.world.computer = defaultComputerState();
    return h;
  }
  function cartLines(h) {
    return h.world.computer.apps.grocery.cart;
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

// Everything below needs \`await\`, which can't sit at this file's top level
// alongside the \`require()\` above (Node treats that combination as
// ambiguous module syntax and refuses to guess CJS vs ESM) — wrapped in
// one async function and invoked immediately instead.
async function main() {

console.log('\n1. GROCERY_CATALOG_LIST / SHOP_CATALOG_LIST partition ITEM_DEFS with zero overlap');

await check('54 groceries, 54 everything-else, exactly the full priced set, no overlap',
  api(`(() => {
    if (GROCERY_CATALOG_LIST.length !== 54) return 'wrong grocery count: ' + GROCERY_CATALOG_LIST.length;
    const priced = Object.values(ITEM_DEFS).filter(d => d.id !== '_unknown' && d.price != null);
    if (SHOP_CATALOG_LIST.length !== priced.length - 54) return 'wrong Nile count: ' + SHOP_CATALOG_LIST.length;
    const groceryIds = new Set(GROCERY_CATALOG_LIST.map(d => d.id));
    const shopIds = new Set(SHOP_CATALOG_LIST.map(d => d.id));
    for (const id of groceryIds) if (shopIds.has(id)) return 'overlap: ' + id;
    for (const d of priced) if (!groceryIds.has(d.id) && !shopIds.has(d.id)) return 'missing from both: ' + d.id;
    return true;
  })()`));

await check('every GROCERY_CATALOG_LIST entry passes isGroceryDef, every SHOP_CATALOG_LIST entry fails it',
  api(`(() => {
    if (!GROCERY_CATALOG_LIST.every(isGroceryDef)) return 'a grocery entry failed isGroceryDef';
    if (SHOP_CATALOG_LIST.some(isGroceryDef)) return 'a Nile entry passed isGroceryDef';
    return true;
  })()`));

await check('a real grocery (eggs) and a real household item (toiletry) both land in GROCERY_CATALOG_LIST, not Nile',
  api(`(() => {
    const gid = new Set(GROCERY_CATALOG_LIST.map(d => d.id));
    const toiletryId = Object.values(ITEM_DEFS).find(d => d.category === 'toiletry' && d.price != null)?.id;
    if (!gid.has('eggs')) return 'eggs missing from groceries';
    if (!toiletryId || !gid.has(toiletryId)) return 'no priced toiletry in groceries: ' + toiletryId;
    const sid = new Set(SHOP_CATALOG_LIST.map(d => d.id));
    if (sid.has('eggs') || (toiletryId && sid.has(toiletryId))) return 'grocery/household item leaked onto Nile';
    return true;
  })()`));

console.log('\n2. getGroceryOrderTotals — fee math against GROCERY_TUNING');

await check('an empty cart has zero delivery fee/service fee/tip/total',
  api(`(() => {
    const h = house('gc-totals-empty', 1);
    const totals = getGroceryOrderTotals(h);
    return (totals.subtotal === 0 && totals.deliveryFee === 0 && totals.serviceFee === 0 && totals.tip === 0 && totals.total === 0)
      || 'nonzero on empty cart: ' + JSON.stringify(totals);
  })()`));

await check('a stocked cart charges subtotal + flat delivery fee + service rate + tip, at the default tip pct',
  api(`(() => {
    const h = house('gc-totals-full', 1);
    h.world.computer.apps.grocery.cart = [{ defId: 'eggs', units: 1 }, { defId: 'milk', units: 1 }];
    const subtotal = (ITEM_DEFS.eggs.price || 0) + (ITEM_DEFS.milk.price || 0);
    const totals = getGroceryOrderTotals(h);
    if (totals.subtotal !== subtotal) return 'wrong subtotal: ' + totals.subtotal;
    if (totals.deliveryFee !== GROCERY_TUNING.deliveryFee) return 'wrong delivery fee: ' + totals.deliveryFee;
    if (totals.serviceFee !== Math.round(subtotal * GROCERY_TUNING.serviceFeeRate)) return 'wrong service fee: ' + totals.serviceFee;
    if (totals.tipPct !== GROCERY_TUNING.defaultTipPct) return 'wrong default tip pct: ' + totals.tipPct;
    if (totals.tip !== Math.round(subtotal * GROCERY_TUNING.defaultTipPct)) return 'wrong tip: ' + totals.tip;
    if (totals.total !== totals.subtotal + totals.deliveryFee + totals.serviceFee + totals.tip) return 'total does not sum: ' + JSON.stringify(totals);
    return true;
  })()`));

await check('a custom tipPctOverride is honored over the app-session tip',
  api(`(() => {
    const h = house('gc-totals-tip', 1);
    h.world.computer.apps.grocery.cart = [{ defId: 'eggs', units: 1 }];
    const totals = getGroceryOrderTotals(h, 0.20);
    return totals.tipPct === 0.20 || 'override ignored: ' + totals.tipPct;
  })()`));

console.log('\n3. Timing determinism — pure functions of (seed, day, seq)');

await check('getGroceryEarliestArrival is identical for the same (seed, day, seq), and differs across seeds',
  api(`(() => {
    const h1 = house('gc-time-a', 1);
    const h2 = house('gc-time-a', 1);
    const a1 = getGroceryEarliestArrival(h1, 0);
    const a2 = getGroceryEarliestArrival(h2, 0);
    if (a1 !== a2) return 'same seed gave different arrivals: ' + a1 + ' vs ' + a2;
    const h3 = house('gc-time-b', 1);
    const a3 = getGroceryEarliestArrival(h3, 0);
    return a1 !== a3 || 'different seeds gave the identical arrival (suspicious): ' + a1;
  })()`));

await check('the arrival delta from "now" always lands within [shop+travel base, shop+travel base+variance]',
  api(`(() => {
    const lo = GROCERY_TUNING.shopMinutesBase + GROCERY_TUNING.travelMinutesBase;
    const hi = lo + GROCERY_TUNING.shopMinutesVariance + GROCERY_TUNING.travelMinutesVariance;
    for (let seed = 0; seed < 40; seed++) {
      const h = house('gc-time-bounds-' + seed, 1);
      const delta = getGroceryEarliestArrival(h, 0) - clockToAbsolute(h.meta.clock);
      if (delta < lo || delta > hi) return 'out of bounds at seed ' + seed + ': ' + delta + ' not in [' + lo + ',' + hi + ']';
    }
    return true;
  })()`));

console.log('\n4. pickGroceryShopper');

await check('deterministic per (day, seq), names a real shopper_N NPC within the pool, and actually creates it',
  api(`(() => {
    const h1 = house('gc-shopper-a', 1);
    const h2 = house('gc-shopper-a', 1);
    const id1 = pickGroceryShopper(h1, 0);
    const id2 = pickGroceryShopper(h2, 0);
    if (id1 !== id2) return 'not deterministic: ' + id1 + ' vs ' + id2;
    const m = id1.match(/^shopper_(\\d+)$/);
    if (!m) return 'unexpected id shape: ' + id1;
    const n = Number(m[1]);
    if (!(n >= 1 && n <= GROCERY_TUNING.shopperPoolSize)) return 'n out of pool range: ' + n;
    if (!h1.npcs[id1]) return 'NPC was not actually created';
    return true;
  })()`));

console.log('\n5. placeGroceryOrder');

await check('refuses an empty cart, money untouched',
  api(`(() => {
    const h = house('gc-place-empty', 1);
    const before = h.player.money;
    const result = placeGroceryOrder(h);
    return (!result.ok && h.player.money === before) || 'expected refusal on empty cart: ' + JSON.stringify(result);
  })()`));

await check('refuses on insufficient funds, money untouched, cart not cleared',
  api(`(() => {
    const h = house('gc-place-poor', 1);
    h.world.computer.apps.grocery.cart = [{ defId: 'eggs', units: 1 }];
    h.player.money = 0;
    const before = h.player.money;
    const result = placeGroceryOrder(h);
    if (result.ok) return 'should have been refused';
    if (h.player.money !== before) return 'money changed on refusal: ' + h.player.money;
    if (h.world.computer.apps.grocery.cart.length !== 1) return 'cart was cleared on a refused order';
    return true;
  })()`));

await check('a successful order charges the total, empties the cart, pushes the right shape into world.groceryOrders, and schedules a matching visit',
  api(`(() => {
    const h = house('gc-place-ok', 1);
    h.world.computer.apps.grocery.cart = [{ defId: 'eggs', units: 2 }];
    h.player.money = 1000;
    const before = h.player.money;
    const result = placeGroceryOrder(h);
    if (!result.ok) return 'order refused: ' + result.reason;
    if (before - h.player.money !== result.totals.total) return 'wrong charge: ' + (before - h.player.money) + ' vs ' + result.totals.total;
    if (h.world.computer.apps.grocery.cart.length !== 0) return 'cart not cleared';
    const orders = h.world.groceryOrders;
    if (orders.length !== 1) return 'wrong order count: ' + orders.length;
    const order = orders[0];
    if (order.status !== 'ordered') return 'wrong status: ' + order.status;
    if (order.items.length !== 1 || order.items[0].defId !== 'eggs' || order.items[0].qty !== 2 * (ITEM_DEFS.eggs.buyQty || 1)) return 'wrong item line: ' + JSON.stringify(order.items);
    if (order.arrivalAbs == null) return 'no arrivalAbs';
    const visit = h.world.visits.find(v => v.sourceId === order.id);
    if (!visit) return 'no matching visit scheduled';
    if (visit.purpose !== 'delivery' || visit.roomId !== 'entry') return 'wrong visit shape: ' + JSON.stringify(visit);
    if (visit.startAbs !== order.arrivalAbs) return 'visit startAbs does not match order arrivalAbs';
    if (visit.endAbs !== order.arrivalAbs + GROCERY_TUNING.shopperWindowMinutes) return 'wrong visit window';
    return true;
  })()`));

console.log('\n6. the save/load round trip');

await check('apps.grocery.cart and an in-flight world.groceryOrders entry survive the real write/load cycle',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt-grocery', clock: { day: 1, minutes: 0 } });
    const h = house('rt-grocery', 1);
    h.world.computer.apps.grocery.cart = [{ defId: 'eggs', units: 1 }];
    h.player.money = 1000;
    placeGroceryOrder(h);
    h.world.computer.apps.grocery.cart = [{ defId: 'milk', units: 1 }];
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    const app = loaded.world.computer.apps.grocery;
    if (app.cart.length !== 1 || app.cart[0].defId !== 'milk') return 'cart lost: ' + JSON.stringify(app.cart);
    if (!Array.isArray(loaded.world.groceryOrders) || loaded.world.groceryOrders.length !== 1) return 'groceryOrders lost: ' + JSON.stringify(loaded.world.groceryOrders);
    if (loaded.world.groceryOrders[0].status !== 'ordered') return 'in-flight order status lost';
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
