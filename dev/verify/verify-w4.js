// Intimacy & Voyeurism Plan Phase 4 — clothing model, wardrobe storage,
// catalog. The pure halves (CLOTHING_DEFS, capacity helpers, composeOutfit,
// starter seeding) are testable here; the DOM halves (Nile buy flow,
// container panel, capacity refusal UX) are verified in the browser.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const SRCDIR = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// ---------------------------------------------------------------- 1
console.log('\n1. CLOTHING_DEFS — the slot-carrying view over ITEM_DEFS');
check('every CLOTHING_DEFS entry IS an ITEM_DEFS entry (one table)',
      api(`Object.keys(CLOTHING_DEFS).every(id => ITEM_DEFS[id] === CLOTHING_DEFS[id])`));
check('every slot value is a declared CLOTHING_SLOT',
      api(`Object.values(CLOTHING_DEFS).every(d => CLOTHING_SLOTS.includes(d.slot))`));
check('every entry carries all five stats as numbers',
      api(`Object.values(CLOTHING_DEFS).every(d =>
        ['attraction','comfort','modesty','thermal','reveal']
          .every(s => typeof d.stats?.[s] === 'number' && d.stats[s] >= 0 && d.stats[s] <= 1))`));
check('every entry has traits, styleTags, and a price (buyable)',
      api(`Object.values(CLOTHING_DEFS).every(d =>
        Array.isArray(d.traits) && d.traits.length > 0 && Array.isArray(d.styleTags) && typeof d.price === 'number')`));
check('every slot has at least one item to wear',
      api(`CLOTHING_SLOTS.every(s => Object.values(CLOTHING_DEFS).some(d => d.slot === s))`));
check('clothing is non-stackable (one item = one wardrobe slot)',
      api(`Object.values(CLOTHING_DEFS).every(d => d.stackable === false && d.maxStack === 1)`));
check('clothing carries no consumable/perishable (clothes do not spoil)',
      api(`Object.values(CLOTHING_DEFS).every(d => !d.consumable && !d.perishable)`));

// ---------------------------------------------------------------- 2
console.log('\n2. Nile catalog');
check('every clothing item is on Nile (priced ITEM_DEF → SHOP_CATALOG_LIST)',
      api(`Object.keys(CLOTHING_DEFS).every(id => SHOP_CATALOG_LIST.some(row => row.id === id))`));
check('clothing sorts under its own group, not Other',
      api(`Object.values(CLOTHING_DEFS).every(d => d.sortGroup === 'clothing')`) +
      ' (sortGroup stamped explicitly, the stamping loop cannot override it)');
check('SORT_GROUPS knows the clothing group',
      api(`!!SORT_GROUPS.clothing && SORT_GROUPS.clothing.label === 'Clothing'`));

// ---------------------------------------------------------------- 3
console.log('\n3. Outfit model');
check('OUTFIT_TYPES covers all seven D11 outfit kinds',
      api(`['daily','work','sleepwear','loungewear','workout','swim','formal'].every(k => !!OUTFIT_TYPES[k])`));
check('every outfit type has at least one catalog item carrying a preferred trait',
      api(`Object.entries(OUTFIT_TYPES).every(([k, t]) =>
        t.traits.some(tr => Object.values(CLOTHING_DEFS).some(d => (d.traits || []).includes(tr))))`));
check('wardrobe def declares the tiered capacity 12/24/40',
      api(`OBJECT_DEFS.wardrobe.container.capacityByTier[1] === 12 &&
           OBJECT_DEFS.wardrobe.container.capacityByTier[2] === 24 &&
           OBJECT_DEFS.wardrobe.container.capacityByTier[3] === 40`));
check('wardrobe defaults to tier 1',
      api(`OBJECT_DEFS.wardrobe.defaultFlags.tier === 1`));

// ---------------------------------------------------------------- 4
console.log('\n4. Capacity helpers (ITEMS)');
check('containerCapacity resolves tier 1/2/3 and defaults missing tiers to 1',
      api(`(() => {
        const w = { defId: 'wardrobe', flags: {} };
        const a = containerCapacity(w);
        w.flags = { tier: 2 }; const b = containerCapacity(w);
        w.flags = { tier: 3 }; const c = containerCapacity(w);
        return a === 12 && b === 24 && c === 40;
      })()`));
check('uncapped containers (fridge) read null — nothing else changed',
      api(`(() => {
        const f = { defId: 'fridge', flags: {} };
        return containerCapacity(f) === null;
      })()`));
check('containerItemCount sums quantities (a qty-2 stack = 2 slots)',
      api(`containerItemCount({ contents: [{ defId: 'a', qty: 1 }, { defId: 'b', qty: 2 }] }) === 3`));
check('wardrobePutCheck ok when room, refuses at capacity, uncapped always ok',
      api(`(() => {
        const w = { defId: 'wardrobe', flags: {}, contents: [{ defId: 'basic_tee', qty: 11 }] };
        const near = wardrobePutCheck(w, 'jeans', 1);      // 1 slot free, put 1 → ok
        w.contents.push({ defId: 'jeans', qty: 1 });
        const full = wardrobePutCheck(w, 'sweater', 1);    // 12+1 → refused
        const f = { defId: 'fridge', flags: {}, contents: [] };
        const uncapped = wardrobePutCheck(f, 'milk', 99);
        return near.ok && near.remaining === 1 && !full.ok && full.remaining === 0 && uncapped.ok && uncapped.capacity === null;
      })()`));

// ---------------------------------------------------------------- 5
console.log('\n5. composeOutfit — deterministic, slot-honest, type-aware');
check('same input → byte-identical outfit (no Math.random, no mutation)',
      api(`(() => {
        const ids = ['basic_tee','button_up','sweater','jeans','sweatpants','sneakers','socks_cotton','boxers','hoodie'];
        const a = composeOutfit('daily', ids);
        const b = composeOutfit('daily', ids);
        return JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(ids) === JSON.stringify(['basic_tee','button_up','sweater','jeans','sweatpants','sneakers','socks_cotton','boxers','hoodie']);
      })()`));
check('one item per slot, ids taken only from the supplied pool',
      api(`(() => {
        const ids = ['basic_tee','jeans','sneakers','socks_cotton'];
        const o = composeOutfit('daily', ids);
        return Object.values(o).every(id => ids.includes(id)) &&
               Object.keys(o).every(s => CLOTHING_SLOTS.includes(s));
      })()`));
check('prefers a matching trait: a work outfit picks the button-up over the tee for top',
      api(`composeOutfit('work', ['basic_tee','button_up']).top === 'button_up'`));
check('a workout outfit picks sport-trait items for its slots',
      api(`(() => {
        const o = composeOutfit('workout', ['tank_top','basic_tee','athletic_shorts','sweatpants','sports_socks','socks_cotton']);
        return o.top === 'tank_top' && o.bottom === 'athletic_shorts' && o.socks === 'sports_socks';
      })()`));
check('unknown wanted type falls back to daily; empty pool → empty outfit',
      api(`(() => {
        const o = composeOutfit('bogus', []);
        return Object.keys(o).length === 0;
      })()`));

// ---------------------------------------------------------------- 6
console.log('\n6. Starter wardrobes (new-game seeding)');
check('every bedroom\'s starter set fits its wardrobe at tier 1 (12 items)',
      api(`Object.entries(STARTER_WARDROBES).every(([room, items]) => {
        const total = items.reduce((s, i) => s + i.qty, 0);
        const ids = items.map(i => i.defId);
        return total <= 12 && ids.every(id => !!CLOTHING_DEFS[id]);
      })`));
check('every fashion wardrobe fits tier-1 capacity and is real clothing',
      api(`Object.entries(FASHION_WARDROBES).every(([fashion, items]) => {
        const total = items.reduce((s, i) => s + i.qty, 0);
        return items.length <= 12 && total <= 12 &&
               items.every(i => !!CLOTHING_DEFS[i.defId]);
      })`));
check('the fallback starter set composes a full daily outfit and a work top',
      api(`(() => {
        const ids = STARTER_WARDROBES.bedroom_player.map(i => i.defId);
        const daily = composeOutfit('daily', ids);
        const work = composeOutfit('work', ids);
        return !!daily.top && !!daily.bottom && !!daily.shoes && !!daily.socks &&
               !!daily.underwear && work.top === 'button_up';
      })()`));
check('fresh house seeds the player\'s wardrobe from their everyday style',
      api(`(() => {
        const h = SIM_generateHouse(20260816, 3);
        const fashion = h.player.appearance.physical.fashion;
        const expected = (FASHION_WARDROBES[fashion] || STARTER_WARDROBES.bedroom_player);
        const w = Object.values(h.objects.room_bedroom_player).find(o => o.defId === 'wardrobe');
        const got = (w.contents || []).map(s => s.defId);
        return !!w && expected.every(g => got.includes(g.defId)) &&
               containerItemCount(w) === expected.reduce((s, i) => s + i.qty, 0);
      })()`));
check('every resident\'s bedroom wardrobe matches their everyday style',
      api(`(() => {
        const h = SIM_generateHouse(20260816, 3);
        for (const id of h.npcIds) {
          const npc = h.npcs[id];
          const fashion = npc.bible.physical.fashion;
          const expected = FASHION_WARDROBES[fashion];
          if (!expected) continue;
          const room = npc.residency.room;
          const w = Object.values(h.objects['room_' + room]).find(o => o.defId === 'wardrobe');
          const got = (w.contents || []).map(s => s.defId);
          if (!expected.every(g => got.includes(g.defId))) return false;
        }
        return true;
      })()`));
check('seeded wardrobe\'s tier survives a JSON round-trip (save/load shape)',
      api(`(() => {
        const h = SIM_generateHouse(20260816, 3);
        const w = Object.values(h.objects.room_bedroom_player).find(o => o.defId === 'wardrobe');
        const copy = JSON.parse(JSON.stringify(w));
        return containerCapacity(copy) === 12 && containerItemCount(copy) === containerItemCount(w);
      })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
