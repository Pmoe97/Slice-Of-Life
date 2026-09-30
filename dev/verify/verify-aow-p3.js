// Action Outcome Window Phase 3 — `sit`, the shared-meal mechanic.
//
// Scope note: this plan is UI-and-presentation work almost end to end, and a
// Node harness cannot exercise DOM rendering, image generation or dismissal
// timing — that half was verified live and is recorded in the plan's Handoff.
// What IS coverable here is the PURE half `sit` rests on, which is also the
// half most likely to be broken silently by a later re-tune:
//
//   - the guest list's closed-form resolution (D22): confirmed guests are
//     seated without being rolled for or asked; walk-ins are scored, rolled,
//     and asked; the roll is the caller's, never the scorer's.
//   - D23's seat cap: four AT THE TABLE counting the player, invited guests
//     seated FIRST so a walk-in can never take a confirmed guest's chair.
//   - the join scorers (overture.js): eligibility gates on the same
//     `busyBlocks` list a commitment refuses on; reach is zero for someone
//     who can neither see, smell nor hear the meal; a scheduled meal damps
//     the walk-in chance but never zeroes it (D12, explicit).
//   - resolveLaidSpread: `set_meal` records def ids and consumes nothing, so
//     `sit` re-resolves live stacks — including the case where a laid dish
//     has since been eaten or moved and is genuinely gone.
//
// Assertions read SIT_TUNING/COMMITMENT_TUNING rather than restating numbers,
// so a re-tune moves them with it.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['effects.js', 'inventory.js', 'defs.actions.js', 'items.js', 'overture.js', 'commitments.js', 'signals.js', 'drives.js', 'sim.js', 'state.js'] });

let pass = 0, fail = 0;
async function check(name, cond, detail) {
  const c = await cond;
  if (c === true) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++;
    const d = typeof c === 'string' && c ? c : detail;
    console.log(`  FAIL  ${name}${d ? `\n        ${d}` : ''}`);
  }
}

async function main() {

api(`
  function house(seed, n) {
    const partials = [];
    for (let i = 0; i < n; i++) partials.push({ name: 'Test' + String.fromCharCode(65 + i) });
    const h = SIM_generateHouse(seed, n, partials);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    for (const id of Object.keys(h.npcs)) {
      h.npcs[id].flags = {};
      h.npcs[id].location = 'dining';
      h.npcs[id].needs = Object.assign({}, h.npcs[id].needs, { hunger: 10, energy: 70 });
      h.npcs[id].relPlayer = Object.assign({}, h.npcs[id].relPlayer, { affection: 0.8, tension: 0 });
    }
    h.player.flags = {};
    h.player.location = 'dining';
    h.world = h.world || {};
    h.world.commitments = [];
    return h;
  }
  function objIn(h, defId) {
    for (const bucket of Object.values(h.objects || {})) {
      const o = Object.values(bucket).find(o => o.defId === defId);
      if (o) return o;
    }
    return null;
  }
  // Everyone free: the eligibility gate probes resolveScheduleActivity against
  // COMMITMENT_TUNING.busyBlocks, so a test that wants candidates has to pick
  // an hour nobody is asleep or at work. 19:00 is 'evening' for every
  // generated schedule.
  function atDinnerTime(h) { h.meta.clock.minutes = 1140; return h; }
  function bookMeal(h, ids) {
    const a = h.meta.clock.day * 1440 + h.meta.clock.minutes;
    h.world.commitments = [{
      id: 'c_test', kind: 'meal', startAbs: a - 30, endAbs: a + 120, roomId: 'dining',
      invitedIds: ids.slice(), acceptedIds: ids.slice(), declinedIds: [], status: 'scheduled',
    }];
    return h.world.commitments[0];
  }
`);

console.log('\n1. The join scorers (overture.js) — pure, and gated where a commitment is gated');

await check('reach is zero for an NPC who can neither see, smell nor hear the meal',
  api(`(() => {
    const h = atDinnerTime(house('p3-reach', 2));
    const id = Object.keys(h.npcs)[0];
    h.npcs[id].location = 'dining';
    const near = mealJoinReach(h, id, 'dining');
    // Somewhere with no adjacency to the dining room and no signal reaching it.
    h.npcs[id].location = 'bathroom_a';
    const far = mealJoinReach(h, id, 'dining');
    if (near.present !== true) return 'present flag not set for the same room';
    if (near.reach !== SIT_TUNING.presentBonus) return 'present reach should be exactly presentBonus with no signal, got ' + near.reach;
    if (far.present === true) return 'far NPC still reads as present';
    if (far.reach > 0 && !far.adjacent) return 'unreachable NPC scored ' + far.reach;
    return true;
  })()`));

await check('the eligibility gate refuses on the same busyBlocks list a commitment refuses on',
  api(`(() => {
    const h = atDinnerTime(house('p3-elig', 2));
    const id = Object.keys(h.npcs)[0];
    const free = mealJoinEligible(h, id, 'dining');
    if (free.eligible !== true) return 'a free NPC at dinner time was ineligible: ' + free.reason;
    // 04:00 — everyone's schedule says sleep, which is on busyBlocks.
    h.meta.clock.minutes = 240;
    const asleep = mealJoinEligible(h, id, 'dining');
    if (asleep.eligible !== false) return 'a sleeping NPC was eligible';
    if (!COMMITMENT_TUNING.busyBlocks.includes(asleep.reason)) {
      return 'refusal reason ' + asleep.reason + ' is not a busyBlocks entry';
    }
    return true;
  })()`));

await check('an offsite NPC is never a candidate',
  api(`(() => {
    const h = atDinnerTime(house('p3-offsite', 2));
    const id = Object.keys(h.npcs)[0];
    h.npcs[id].location = null;
    return mealJoinEligible(h, id, 'dining').eligible === false;
  })()`));

await check('a scheduled meal damps the walk-in chance but never zeroes it (D12)',
  api(`(() => {
    const h = atDinnerTime(house('p3-damp', 2));
    const id = Object.keys(h.npcs)[0];
    const open = mealJoinChance(h, id, 'dining', { scheduled: false }).chance;
    const booked = mealJoinChance(h, id, 'dining', { scheduled: true }).chance;
    if (!(open > 0)) return 'baseline chance was not positive: ' + open;
    if (!(booked < open)) return 'a scheduled meal did not damp the chance (' + booked + ' vs ' + open + ')';
    if (!(booked > 0)) return 'a scheduled meal ZEROED the chance, which D12 forbids';
    const expected = Math.min(SIT_TUNING.maxChance, open * SIT_TUNING.scheduledDamping);
    if (Math.abs(booked - expected) > 1e-9) return 'damping is not scheduledDamping: ' + booked + ' vs ' + expected;
    return true;
  })()`));

await check('a sated NPC contributes no hunger term; an empty one contributes the most',
  api(`(() => {
    const h = atDinnerTime(house('p3-hunger', 2));
    const id = Object.keys(h.npcs)[0];
    h.npcs[id].relPlayer.affection = 0;   // isolate the hunger term
    h.npcs[id].needs.hunger = SIT_TUNING.hungerFull;
    const full = mealJoinChance(h, id, 'dining', {});
    h.npcs[id].needs.hunger = 0;
    const starving = mealJoinChance(h, id, 'dining', {});
    if (full.terms.hungerTerm !== 0) return 'a sated NPC had a hunger term of ' + full.terms.hungerTerm;
    if (starving.terms.hungerTerm !== 1) return 'an empty NPC had a hunger term of ' + starving.terms.hungerTerm;
    if (!(starving.chance > full.chance)) return 'hunger did not raise the chance';
    return true;
  })()`));

await check('mealJoinCandidates is UNROLLED and sorted strongest-first',
  api(`(() => {
    const h = atDinnerTime(house('p3-sort', 3));
    const ids = Object.keys(h.npcs);
    h.npcs[ids[0]].relPlayer.affection = 0.1;
    h.npcs[ids[1]].relPlayer.affection = 0.9;
    h.npcs[ids[2]].relPlayer.affection = 0.5;
    const a = mealJoinCandidates(h, 'dining', {});
    const b = mealJoinCandidates(h, 'dining', {});
    if (a.length < 2) return 'expected candidates, got ' + a.length;
    // Pure: two calls with no state change must agree exactly.
    if (JSON.stringify(a.map(x => [x.npcId, x.chance])) !== JSON.stringify(b.map(x => [x.npcId, x.chance]))) {
      return 'mealJoinCandidates is not pure — two calls disagreed';
    }
    for (let i = 1; i < a.length; i++) {
      if (a[i - 1].chance < a[i].chance) return 'candidates are not sorted strongest-first';
    }
    return true;
  })()`));

await check('an excluded NPC (already a confirmed guest) is not also a walk-in candidate',
  api(`(() => {
    const h = atDinnerTime(house('p3-excl', 2));
    const ids = Object.keys(h.npcs);
    const all = mealJoinCandidates(h, 'dining', {});
    const some = mealJoinCandidates(h, 'dining', { exclude: [ids[0]] });
    if (!all.some(c => c.npcId === ids[0])) return 'setup: ' + ids[0] + ' was not a candidate to begin with';
    return some.every(c => c.npcId !== ids[0]);
  })()`));

console.log('\n2. resolveSitGuestList — closed form, confirmed first, capped (D22/D23)');

await check('a confirmed guest is seated without being rolled for and without being asked',
  api(`(() => {
    const h = atDinnerTime(house('p3-confirmed', 2));
    const ids = Object.keys(h.npcs);
    bookMeal(h, [ids[0]]);
    // A roll that ALWAYS fails: if the confirmed guest were rolled for, they
    // would not be here.
    const list = resolveSitGuestList(h, 'dining', () => 0.999);
    if (!list.confirmed.includes(ids[0])) return 'the confirmed guest was not seated';
    if (list.asked.some(a => a.npcId === ids[0])) return 'the confirmed guest was ASKED, which D22 forbids';
    if (list.scheduled !== true) return 'scheduled flag not set';
    return true;
  })()`));

await check('a roll that always passes asks every candidate up to the seats left',
  api(`(() => {
    const h = atDinnerTime(house('p3-walkins', 3));
    const list = resolveSitGuestList(h, 'dining', () => 0);
    if (list.confirmed.length !== 0) return 'unexpected confirmed guests';
    if (list.asked.length === 0) return 'nobody was asked despite an always-passing roll';
    if (list.asked.length > SIT_TUNING.maxSeats - 1) return 'asked more people than there are NPC seats';
    return true;
  })()`));

await check('D23: the table caps at maxSeats counting the player, and invited guests take their chairs first',
  api(`(() => {
    const h = atDinnerTime(house('p3-cap', 5));
    const ids = Object.keys(h.npcs);
    const npcSeats = SIT_TUNING.maxSeats - 1;
    // One confirmed guest, everyone else a willing walk-in.
    bookMeal(h, [ids[0]]);
    const list = resolveSitGuestList(h, 'dining', () => 0);
    if (!list.confirmed.includes(ids[0])) return 'the confirmed guest lost their chair';
    const total = list.confirmed.length + list.asked.length;
    if (total > npcSeats) return 'seated/asked ' + total + ' NPCs against ' + npcSeats + ' seats';
    if (list.seatsLeft !== npcSeats - list.confirmed.length) return 'seatsLeft is wrong: ' + list.seatsLeft;
    // The capped-out candidates existed — this is a real cap, not an empty pool.
    if (list.candidates.length <= list.asked.length) return 'nobody was actually capped out; the test proved nothing';
    return true;
  })()`));

await check('confirmed guests filling every seat means nobody is asked at all',
  api(`(() => {
    const h = atDinnerTime(house('p3-full', 5));
    const ids = Object.keys(h.npcs);
    bookMeal(h, ids.slice(0, SIT_TUNING.maxSeats - 1));
    const list = resolveSitGuestList(h, 'dining', () => 0);
    if (list.seatsLeft !== 0) return 'seatsLeft should be 0, got ' + list.seatsLeft;
    if (list.asked.length !== 0) return 'someone was asked at a full table';
    return true;
  })()`));

await check('the same seed and state resolve the same guest list twice (closed form, D22)',
  api(`(() => {
    const h = atDinnerTime(house('p3-det', 3));
    const rngA = seededRng(h.meta.seed, 'sit_' + h.meta.clock.day + '_' + h.meta.clock.minutes);
    const rngB = seededRng(h.meta.seed, 'sit_' + h.meta.clock.day + '_' + h.meta.clock.minutes);
    const a = resolveSitGuestList(h, 'dining', rngA);
    const b = resolveSitGuestList(h, 'dining', rngB);
    return JSON.stringify(a.asked.map(x => x.npcId)) === JSON.stringify(b.asked.map(x => x.npcId));
  })()`));

console.log('\n3. resolveLaidSpread — set_meal records, sit re-resolves (D10)');

await check('a laid table re-resolves to the live stacks the spread named',
  api(`(() => {
    const h = house('p3-spread', 1);
    h.player.location = 'kitchen';
    const fridge = objIn(h, 'fridge');
    fridge.contents = [{ defId: 'frozen_pizza', qty: 2, meta: {} }];
    const table = objIn(h, 'kitchen_table');
    table.state = Object.assign({}, table.state, { clutter: 'cluttered' });
    table.flags = Object.assign({}, table.flags, { spread: ['frozen_pizza'] });
    const ctx = { gameState: h, roomId: 'kitchen', roomObjects: h.objects.room_kitchen, presentNpcIds: [] };
    const out = resolveLaidSpread(h, ctx);
    if (out.rows.length !== 1) return 'expected 1 row, got ' + out.rows.length;
    if (out.rows[0].stack.defId !== 'frozen_pizza') return 'wrong dish resolved';
    if (out.missing.length !== 0) return 'reported missing: ' + out.missing.join(',');
    return true;
  })()`));

await check('a laid dish that has since gone is reported MISSING rather than silently served',
  api(`(() => {
    const h = house('p3-raided', 1);
    h.player.location = 'kitchen';
    // edibleStacks reads the bag AND every nearby food container, so emptying
    // the fridge alone is not enough — a starting freezer/pantry pizza would
    // be found and quietly served, which is exactly the confusion this
    // assertion exists to catch.
    h.player.inventory = [];
    for (const bucket of Object.values(h.objects || {})) {
      for (const o of Object.values(bucket)) if (Array.isArray(o.contents)) o.contents = [];
    }
    const table = objIn(h, 'kitchen_table');
    table.state = Object.assign({}, table.state, { clutter: 'cluttered' });
    table.flags = Object.assign({}, table.flags, { spread: ['frozen_pizza'] });
    const ctx = { gameState: h, roomId: 'kitchen', roomObjects: h.objects.room_kitchen, presentNpcIds: [] };
    const out = resolveLaidSpread(h, ctx);
    if (out.rows.length !== 0) return 'served a dish that is not there';
    if (out.missing.length !== 1 || out.missing[0] !== 'frozen_pizza') return 'missing not reported';
    return true;
  })()`));

await check('a bare table resolves to nothing, which is what makes sit cancel',
  api(`(() => {
    const h = house('p3-bare', 1);
    h.player.location = 'kitchen';
    const table = objIn(h, 'kitchen_table');
    table.flags = Object.assign({}, table.flags, { spread: [] });
    const ctx = { gameState: h, roomId: 'kitchen', roomObjects: h.objects.room_kitchen, presentNpcIds: [] };
    const out = resolveLaidSpread(h, ctx);
    return out.rows.length === 0 && out.laidIds.length === 0;
  })()`));

console.log('\n4. The split itself — set_meal lays, sit eats (D10)');

await check('buildSetMealEffects consumes nothing and only writes the laid-table state',
  api(`(() => {
    const h = house('p3-lay', 1);
    h.player.location = 'kitchen';
    const ctx = { gameState: h, roomId: 'kitchen', roomObjects: h.objects.room_kitchen, presentNpcIds: [] };
    const option = { stack: { defId: 'frozen_pizza', qty: 2, meta: {} }, def: ITEM_DEFS.frozen_pizza, from: 'player' };
    const lines = buildSetMealEffects(ctx, { spread: [option], attendees: [], hasCommitment: false });
    if (lines.some(l => l.startsWith('EAT_ITEM'))) return 'laying the table ate something';
    if (lines.some(l => l.startsWith('ADD_DISHES'))) return 'laying the table dirtied dishes';
    if (lines.some(l => l.startsWith('REL_DELTA') || l.startsWith('MOOD_DELTA'))) return 'laying the table moved a relationship';
    if (!lines.some(l => l.startsWith('SET_TABLE_SPREAD'))) return 'no spread was recorded';
    if (!lines.some(l => /SET_OBJECT_STATE .* clutter cluttered/.test(l))) return 'the table was not marked laid';
    return true;
  })()`));

await check('both meal verbs are registered and sit gates on a laid table',
  api(`(() => {
    if (!ACTION_DEFS.sit) return 'sit is not registered';
    if (!ACTION_DEFS.set_meal) return 'set_meal vanished';
    if (!(ACTION_DEFS.sit.requires || []).includes('tableIsLaid')) return 'sit does not gate on tableIsLaid';
    if (ACTION_DEFS.sit.timeCost.base !== SIT_TUNING.windowMinutes) return 'sit does not cost the D22 window';
    // D10: the tier is a function of the OUTCOME, not a literal.
    if (typeof ACTION_DEFS.sit.outcomeWindow.tier !== 'function') return 'sit tier is not outcome-conditional';
    const alone = ACTION_DEFS.sit.outcomeWindow.tier({ prepared: { guests: [] } });
    const together = ACTION_DEFS.sit.outcomeWindow.tier({ prepared: { guests: ['x'] } });
    if (alone !== 'C') return 'eating alone should be Tier C, got ' + alone;
    if (together !== 'D') return 'eating together should be Tier D, got ' + together;
    return true;
  })()`));

await check('the shared-meal window offers a talk choice per guest and none when alone (D6/D10)',
  api(`(() => {
    const h = house('p3-choices', 2);
    const ids = Object.keys(h.npcs);
    const alone = sitWindowChoices({ gs: h, prepared: { guests: [] } });
    if (alone !== null) return 'eating alone offered choices instead of a plain Continue';
    const together = sitWindowChoices({ gs: h, prepared: { guests: ids } });
    const talks = together.filter(c => c.id.startsWith('talk:'));
    if (talks.length !== ids.length) return 'expected one talk choice per guest, got ' + talks.length;
    if (!talks.every(c => c.handoff === true)) return 'a talk choice did not carry handoff:true';
    if (!together.some(c => c.id === 'done' && !c.handoff)) return 'no plain close option';
    return true;
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
