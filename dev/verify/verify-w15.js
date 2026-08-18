// Intimacy & Voyeurism Plan Phase 15 — Knowledge codex + Confront / Spread /
// Matchmake (D8).
// The per-character ledger (player.ledger[npcId], written by Phase 11's
// notePlayerLedgerEntry, Phase 14's infidelity pass and this phase's
// 'witnessed' writes from the peek flow and in-room event surfacing), the
// codex readers (codexEntries/codexKnownNpcIds/codexNextUnspentIndex), the
// spend flag (spendCodexEntry — spent entries stay in history), and the three
// spendable verbs:
//   - applyConfrontNpc  — "I saw you with X"; outcomes per dynamic tier
//     (stranger/cold → shame: tension spike + gossip; familiar/close → tease;
//     intimate → engage), the willingness gate read as a tier MODULATOR
//     (never a door — these verbs are not intimacy acts), and a cheating
//     confrontation's news injected into the EXISTING transmission system
//     (receiveTransmittedFact carrying the canonical infidelityCheatingFact,
//     with maybeJealousUponFact landing the jealousy on a wronged hearer
//     immediately).
//   - applySpreadSecret  — tells one NPC a secret; wronged-party receivers
//     get the jealousy to their face, others hold the fact for the gossip
//     machinery to raise.
//   - applyMatchmakeNpc — requires knowledge of BOTH people AND an existing
//     relationship record; injects progress (the Phase 12 pass's exact fuel),
//     warms castWeb both ways, stamps a 'matched' history entry, and re-checks
//     the pair's status transition through tryAdvanceRelationshipStatus (the
//     single-pair core extracted from updateRelationshipsForDay so both paths
//     share one implementation).
//
// Section 5 is the MANDATORY per-session gate check: a negative-willingness
// target never participates through any codex verb, the verbs leave zero
// intimacy footprint, and codex.js's only willingness interaction is the
// read inside resolveConfrontTier. Section 7 is the save/load round-trip
// through the REAL writeGeneratedGameState/loadGameState against an in-memory
// kv adapter.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['codex.js'] });
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
async function check(name, cond, detail) {
  const c = await cond;
  if (c) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
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
    }
    return h;
  }
`);

api(`
  function residentsOf(h) {
    return Object.keys(h.npcs).filter(id => h.npcs[id].residency.status === 'resident');
  }
`);

// Warm a resident toward the player (moves conversationPhase via the same
// applyRelDelta every real write uses).
api(`
  function warmTowardPlayer(h, npcId, deltas) {
    h.npcs[npcId] = applyRelDelta(h.npcs[npcId], deltas, h.meta.clock.day);
  }
`);

// A cheating fixture: r1 committed to r2; the player witnessed r1 with r3;
// r2 stands in the player's room (the hearer of a confrontation).
api(`
  function cheatFixture(seed, n) {
    const h = house(seed, n);
    const ids = residentsOf(h);
    const [r1, r2, r3] = ids;
    const day = h.meta.clock.day;
    getRelationship(h, r1, r2, true).status = 'committed';
    getRelationship(h, r1, r2, false).lastTransitionDay = day;
    h.player.location = h.npcs[r1].residency.room;
    notePlayerWitnessedEntry(h, r1, 'saw_with_X', day, h.npcs[r1].residency.room, { otherNpcId: r3 });
    return { h, ids, r1, r2, r3, day };
  }
`);

// --- In-memory kv adapter for the save/load round-trip (mirrors kv-plugin's
// folder surface: get/set/update/keys/delete; structuredClone like IDB). ---
api(`
  function makeMemKv() {
    const stores = {};
    const wrap = (name) => {
      const m = {};
      m.get = async (k) => { const s = stores[name] || (stores[name] = {}); const v = s[k]; return v === undefined ? undefined : structuredClone(v); };
      m.set = async (k, v) => { const s = stores[name] || (stores[name] = {}); s[k] = structuredClone(v); };
      m.update = async (k, fn) => { const cur = await m.get(k); const nv = fn(cur); await m.set(k, nv); return nv; };
      m.keys = async () => Object.keys(stores[name] || {});
      m.delete = async (k) => { if (stores[name]) delete stores[name][k]; };
      return m;
    };
    const kv = {};
    for (const f of ['meta', 'player', 'world', 'npcs', 'objects', 'images', 'snapshots', 'saves', 'saveIndex']) kv[f] = wrap(f);
    return kv;
  }
`);

// Everything below needs `await`, which can't sit at this file's top level
// alongside the `require()` above (Node treats that combination as
// ambiguous module syntax and refuses to guess CJS vs ESM) — wrapped in
// one async function and invoked immediately instead.
async function main() {

console.log('\n1. Ledger writers + readers (witnessed shape, spend, history retention)');

await check('notePlayerWitnessedEntry writes a day-stamped kind:witnessed entry with otherNpcId and outcome',
  api(`(() => {
    const h = house(20260815, 2);
    const [r1, r2] = residentsOf(h);
    notePlayerWitnessedEntry(h, r1, 'saw_with_X', 3, 'living_room', { otherNpcId: r2, outcome: 'caught' });
    const e = h.player.ledger[r1][0];
    return e.kind === 'witnessed' && e.act === 'saw_with_X' && e.day === 3
      && e.roomId === 'living_room' && e.otherNpcId === r2 && e.outcome === 'caught' && e.spent === false;
  })()`));

await check('notePlayerLedgerEntry (Phase 11 writer) still defaults to kind:participated with otherNpcId null',
  api(`(() => {
    const h = house(20260815, 2);
    const [r1] = residentsOf(h);
    notePlayerLedgerEntry(h, r1, 'sex', 1, 'bedroom_1');
    const e = h.player.ledger[r1][0];
    return e.kind === 'participated' && e.otherNpcId === null && e.spent === false;
  })()`));

await check('codexEntries sorts newest-first by day',
  api(`(() => {
    const h = house(20260815, 2);
    const [r1] = residentsOf(h);
    notePlayerWitnessedEntry(h, r1, 'saw_with_X', 1, 'bedroom_1', { otherNpcId: null });
    notePlayerWitnessedEntry(h, r1, 'peeked_masturbation', 5, 'bedroom_1', {});
    const days = codexEntries(h, r1).map(e => e.day);
    return days[0] === 5 && days[1] === 1;
  })()`));

await check('spendCodexEntry flips spent and the entry STAYS in history; a second spend is a no-op',
  api(`(() => {
    const h = house(20260815, 2);
    const [r1] = residentsOf(h);
    notePlayerWitnessedEntry(h, r1, 'saw_with_X', 1, 'bedroom_1', { otherNpcId: null });
    const ok1 = spendCodexEntry(h, r1, 0);
    const ok2 = spendCodexEntry(h, r1, 0);
    return ok1 === true && ok2 === false
      && h.player.ledger[r1].length === 1 && h.player.ledger[r1][0].spent === true;
  })()`));

await check('codexNextUnspentIndex returns the most recent unspent entry, null when all spent',
  api(`(() => {
    const h = house(20260815, 2);
    const [r1] = residentsOf(h);
    notePlayerWitnessedEntry(h, r1, 'saw_with_X', 1, 'bedroom_1', { otherNpcId: null });
    notePlayerWitnessedEntry(h, r1, 'peeked_masturbation', 5, 'bedroom_1', {});
    const first = codexNextUnspentIndex(h, r1);
    spendCodexEntry(h, r1, first);
    const second = codexNextUnspentIndex(h, r1);
    spendCodexEntry(h, r1, second);
    return first === 1 && second === 0 && codexNextUnspentIndex(h, r1) === null;
  })()`));

console.log('\n2. Activity → ledger-act mapping');

await check('codexActForActivity: pair acts → saw_with_X (paired), masturbation → peeked_masturbation, mundane → null',
  api(`(() => {
    const pair = codexActForActivity('having sex');
    const solo = codexActForActivity('masturbating in bed');
    return pair && pair.act === 'saw_with_X' && pair.paired === true
      && solo && solo.act === 'peeked_masturbation' && solo.paired === false
      && codexActForActivity('watching tv') === null;
  })()`));

await check('every INTIMACY_ACTIVITIES value maps to saw_with_X and every CODEX_MASTURBATION_ACTIVITIES value to peeked_masturbation',
  api(`(() => {
    return INTIMACY_ACTIVITIES.every(a => codexActForActivity(a)?.act === 'saw_with_X')
      && ['masturbating', 'masturbating in bed'].every(a => codexActForActivity(a)?.act === 'peeked_masturbation');
  })()`));

console.log('\n3. Confront — tier resolution, outcomes, gossip, spend');

await check('a stranger targets tier 0 → shame (the plan\'s "confronting a stranger ... tension spike + gossip")',
  api(`(() => {
    const { h, r1 } = cheatFixture(20260816, 3);
    const tier = resolveConfrontTier(h, r1, {});
    const outcome = resolveConfrontOutcome(h, r1, h.player.ledger[r1][0], {});
    return tier === 0 && outcome.key === 'shame' && outcome.gossip === true && outcome.otherName !== null;
  })()`));

await check('a warmed-to-close target resolves tease; a willing intimate target engages (the willingness shift pushes UP)',
  api(`(() => {
    const { h, r1 } = cheatFixture(20260816, 3);
    warmTowardPlayer(h, r1, { trust: 0.5, affection: 0.6, comfort: 0.7, tension: 0.1, desire: 0.5 });
    const close = resolveConfrontTier(h, r1, {});          // phase 'close' (60) → tier 2
    warmTowardPlayer(h, r1, { affection: 0.2, desire: 0.25, comfort: 0.3 }); // phase 'intimate' (80)
    const gate = resolveWillingnessGate(h, r1, 'player', 'sex', {});
    const engaged = resolveConfrontTier(h, r1, {});
    const outcome = resolveConfrontOutcome(h, r1, h.player.ledger[r1][0], {});
    return close === 2 && gate.allowed === true && engaged === 3 && outcome.key === 'engage';
  })()`));

await check('a HOSTILE (floored) warm target is pushed DOWN — the willingness gate is read, never bypassed',
  api(`(() => {
    const { h, r1 } = cheatFixture(20260816, 3);
    warmTowardPlayer(h, r1, { trust: 0.5, affection: 0.6, comfort: 0.7, tension: 0.1, desire: 0.5 });
    warmTowardPlayer(h, r1, { affection: 0.2, desire: 0.25, comfort: 0.3 }); // 'intimate'
    const before = resolveConfrontTier(h, r1, {});         // 3
    warmTowardPlayer(h, r1, { tension: 0.9 });             // tension >= tensionHigh → floor
    const gate = resolveWillingnessGate(h, r1, 'player', 'sex', {});
    const tier = resolveConfrontTier(h, r1, {});
    // Tension BOTH floors the gate AND (it subtracts) drops the derived phase
    // close (57) — so the tier falls below the pre-floor intimate tier, never
    // above it. A floored target never reads as MORE engaged.
    return before === 3 && gate.reason === 'floor' && tier === 1 && tier < before;
  })()`));

await check('applyConfrontNpc on a stranger with a cheating entry: tension spike, gossip to the hearer (the WRONGED party), jealousy lands, suspicion bump, spent',
  api(`(() => {
    const { h, ids, r1, r2, r3, day } = cheatFixture(20260816, 3);
    h.npcs[r2].location = h.player.location; // the wronged party is in the room
    const before = h.npcs[r1].relPlayer.tension || 0;
    const res = applyConfrontNpc(h, r1, 0, { location: h.player.location });
    const tensionDelta = Math.round(((h.npcs[r1].relPlayer.tension || 0) - before) * 1000) / 1000;
    const wrongedFact = (h.npcs[r2].memory.facts || []).some(f => f.text.includes('slept with'));
    const jealousKey = h.npcs[r2].flags?._jealousy ? h.npcs[r2].flags._jealousy[r1 + '|' + r3 + '|' + day] : false;
    const spent = h.player.ledger[r1][0].spent === true;
    const suspicion = h.npcs[r1].suspicion?.boundary_violation || 0;
    return res.ok === true && res.outcome === 'shame' && tensionDelta === 0.12
      && res.gossipIds.length === 1 && wrongedFact && jealousKey === true
      && spent && suspicion > 0 && h.player.ledger[r1].length === 1;
  })()`));

await check('the gossiped fact is the CANONICAL infidelityCheatingFact string (transmission dedupe + maybeJealousUponFact compatibility)',
  api(`(() => {
    const { h, r1, r2, r3, day } = cheatFixture(20260816, 3);
    h.npcs[r2].location = h.player.location;
    applyConfrontNpc(h, r1, 0, { location: h.player.location });
    const expected = infidelityCheatingFact(h, r1, r3, day);
    const landed = (h.npcs[r2].memory.facts || []).find(f => f.text === expected.text);
    return !!landed && JSON.stringify(landed.cheating) === JSON.stringify(expected.cheating);
  })()`));

await check('a confrontation with NO hearer present leaks nothing (D10 — nobody is omniscient)',
  api(`(() => {
    const { h, r1 } = cheatFixture(20260816, 3);
    const res = applyConfrontNpc(h, r1, 0, { location: h.player.location });
    return res.ok === true && res.gossipIds.length === 0;
  })()`));

await check('confront outcome is deterministic (same state, same result) and cannot double-spend',
  api(`(() => {
    const a = cheatFixture(20260816, 3); const b = cheatFixture(20260816, 3);
    const ra = applyConfrontNpc(a.h, a.r1, 0, { location: a.h.player.location });
    const rb = applyConfrontNpc(b.h, b.r1, 0, { location: b.h.player.location });
    const again = applyConfrontNpc(b.h, b.r1, 0, { location: b.h.player.location });
    return ra.ok === rb.ok && ra.outcome === rb.outcome && ra.tier === rb.tier
      && JSON.stringify(a.h.player.ledger) === JSON.stringify(b.h.player.ledger) && again.ok === false;
  })()`));

console.log('\n4. Spread — fact injection into the transmission system');

await check('spreadEligible requires an unspent entry naming a third party',
  api(`(() => {
    const h = house(20260815, 3);
    const [r1, r2] = residentsOf(h);
    notePlayerWitnessedEntry(h, r1, 'saw_with_X', 1, 'bedroom_1', { otherNpcId: r2 });
    notePlayerWitnessedEntry(h, r1, 'peeked_masturbation', 1, 'bedroom_1', {});
    return spreadEligible(h.player.ledger[r1][0]) === true
      && spreadEligible(h.player.ledger[r1][1]) === false
      && spreadEligible({ spent: true, otherNpcId: r2 }) === false;
  })()`));

await check('spread to the WRONGED party: fact lands with cheating metadata + jealousy NOW + entry spent and kept',
  api(`(() => {
    const { h, ids, r1, r2, r3, day } = cheatFixture(20260816, 3);
    const beforeFacts = (h.npcs[r2].memory.facts || []).length;
    const res = applySpreadSecret(h, r1, 0, r2);
    const landed = (h.npcs[r2].memory.facts || []).find(f => f.text.includes('slept with'));
    const jealous = !!h.npcs[r2].flags?._jealousy?.[r1 + '|' + r3 + '|' + day];
    return res.ok === true && (h.npcs[r2].memory.facts || []).length === beforeFacts + 1
      && landed && landed.category === 'cheating' && landed.cheating?.cheaterId === r1
      && jealous === true && h.player.ledger[r1][0].spent === true && h.player.ledger[r1].length === 1;
  })()`));

await check('spread to an UNINVOLVED receiver: fact lands (raiseable by the gossip drive), no jealousy (they are not the wronged party)',
  api(`(() => {
    const { h, ids, r1, r2, r3 } = cheatFixture(20260816, 4);
    const r4 = ids[3];
    const res = applySpreadSecret(h, r1, 0, r4);
    const fact = (h.npcs[r4].memory.facts || []).find(f => f.text.includes('slept with'));
    return res.ok === true && !!fact
      && (fact.confidence ?? 1) > 0.3 && fact.category === 'cheating'
      && !h.npcs[r4].flags?._jealousy;
  })()`));

await check('a spread receiver who already holds the fact just gets it refreshed — one copy, no double write',
  api(`(() => {
    const { h, r1, r2 } = cheatFixture(20260816, 4);
    // The receiver already heard it first-hand: write the fact, then spread again.
    const f = codexGossipFact(h, r1, h.player.ledger[r1][0]);
    h.npcs[r2] = receiveTransmittedFact(h.npcs[r2], f, { kind: 'overheard', provenance: 'overheard', day: h.meta.clock.day });
    const count = (h.npcs[r2].memory.facts || []).filter(x => x.text === f.text).length;
    return count === 1;
  })()`));

console.log('\n5. MANDATORY gate check — no codex verb is a door into intimacy');

await check('a floored target is never a participant and the verbs leave ZERO intimacy footprint',
  api(`(() => {
    const { h, ids, r1, r2, r3, day } = cheatFixture(20260816, 3);
    warmTowardPlayer(h, r1, { tension: 1.0 });   // hostile → willingness exactly -1
    const floor = willingness(h, h.npcs[r1], 'player', 'sex', {});
    const clothingBefore = h.npcs[r1].clothing;
    const lastIntimateBefore = getRelationship(h, r1, r2, false).lastIntimateDay;
    const conf = applyConfrontNpc(h, r1, 0, { location: h.player.location });
    const spread = applySpreadSecret(h, r1, 0, r3);
    notePlayerWitnessedEntry(h, r3, 'peeked_masturbation', day, h.npcs[r3].residency.room, {});
    notePlayerWitnessedEntry(h, ids.find(id => id !== r1 && id !== r3), 'peeked_masturbation', day, h.npcs[r1].residency.room, {});
    const others = ids.filter(id => id !== r1 && id !== r3);
    const match = applyMatchmakeNpc(h, others[0], r3);
    const intimacyHist = Object.values(h.npcs).some(n => n.flags?._intimacyHistory);
    const refusals = Object.values(h.npcs).some(n => n.flags?._intimacyRefusals);
    const lastIntimateAfter = getRelationship(h, r1, r2, false).lastIntimateDay;
    const clothingChanged = Object.values(h.npcs).some(n => n.clothing !== clothingBefore && n.residency.status === 'resident');
    return floor === -1 && conf.ok === true && spread.ok === true
      && !intimacyHist && !refusals && lastIntimateAfter === lastIntimateBefore
      && !clothingChanged && !getRelationship(h, r1, r2, false).history.some(x => x.kind === 'sex');
  })()`));

await check('the willingness floor itself is byte-unchanged by a full pass of all three verbs',
  api(`(() => {
    const { h, ids, r1, r2, r3 } = cheatFixture(20260816, 3);
    const before = willingness(h, h.npcs[r1], 'player', 'sex', {});
    applyConfrontNpc(h, r1, 0, { location: h.player.location });
    applySpreadSecret(h, r1, 0, r3);
    const after = willingness(h, h.npcs[r1], 'player', 'sex', {});
    return before === after;
  })()`));

await check('codex.js has exactly ONE willingness interaction and it is the read in resolveConfrontTier',
  new Promise((resolve) => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', 'codex.js'), 'utf8');
    const gateCalls = (src.match(/resolveWillingnessGate\(/g) || []).length;
    const resolveFnBody = src.split('function resolveConfrontTier')[1].split('\nfunction ')[0];
    const inTier = (resolveFnBody.match(/resolveWillingnessGate\(/g) || []).length;
    const elsewhere = (src.replace(resolveFnBody, '').match(/resolveWillingnessGate\(/g) || []).length;
    const noWillingnessElsewhere = (src.replace(resolveFnBody, '').match(/willingness\(/g) || []).length === 0;
    resolve(gateCalls === 1 && inTier === 1 && elsewhere === 0 && noWillingnessElsewhere);
  }), 'gateCalls must be exactly 1, inside resolveConfrontTier, and no other willingness() call may exist outside it');

console.log('\n6. Matchmake — knowledge + relationships gate, progress boost, formation acceleration');

await check('matchmakeEligible requires knowledge of BOTH people, a relationship record, both residents, and not already committed',
  api(`(() => {
    const h = house(20260815, 4);
    const [r1, r2, r3, r4] = residentsOf(h);
    const day = h.meta.clock.day;
    // No knowledge yet → ineligible.
    const noKnowledge = matchmakeEligible(h, r2, r3);
    notePlayerWitnessedEntry(h, r2, 'peeked_masturbation', day, h.npcs[r2].residency.room, {});
    notePlayerWitnessedEntry(h, r3, 'peeked_masturbation', day, h.npcs[r3].residency.room, {});
    // Still no relationship record → ineligible.
    const noRecord = matchmakeEligible(h, r2, r3);
    getRelationship(h, r2, r3, true);
    const eligible = matchmakeEligible(h, r2, r3);
    // Same-sex pair? no — just symmetry + committed refusal:
    const rec = getRelationship(h, r2, r3, false);
    rec.status = 'committed';
    const committed = matchmakeEligible(h, r2, r3);
    return noKnowledge === false && noRecord === false && eligible === true && committed === false;
  })()`));

await check('applyMatchmakeNpc injects progress, warms castWeb BOTH ways, stamps matched history, and transitions single → seeing when thresholds + cooldown clear',
  api(`(() => {
    const h = house(20260815, 4);
    const [r1, r2, r3] = residentsOf(h);
    const day = h.meta.clock.day;
    notePlayerWitnessedEntry(h, r2, 'peeked_masturbation', day, h.npcs[r2].residency.room, {});
    notePlayerWitnessedEntry(h, r3, 'peeked_masturbation', day, h.npcs[r3].residency.room, {});
    const rec = getRelationship(h, r2, r3, true);
    rec.progress = 0.3;                      // below seeingThreshold 0.5
    rec.lastTransitionDay = day - 5;         // cooldown elapsed
    // A generated pair's static compat sits at ~0.43-0.49, just under the
    // 0.5 formation bar (measured for seed 20260815). Warm the pair the way
    // co-location would have (castWeb axes) so compat clears the bar — the
    // match is an ACCELERANT, not a from-nothing spark.
    h.world.castWeb = applyNpcToNpcDelta(h.world.castWeb, r2, r3, { affection: 0.5 });
    h.world.castWeb = applyNpcToNpcDelta(h.world.castWeb, r3, r2, { affection: 0.5 });
    const key = pairKey(r2, r3);
    const axBefore = h.world.castWeb[key].axes;
    const beforeAff = axBefore[r2 + '→' + r3].affection || 0;
    const res = applyMatchmakeNpc(h, r2, r3);
    const axAfter = h.world.castWeb[key].axes;
    return res.ok === true && res.compat >= 0.5
      && rec.progress >= 0.5 && rec.status === 'seeing'
      && rec.history.some(x => x.kind === 'matched')
      && res.events.length === 1 && res.events[0].kind === 'seeing'
      && Math.round(((axAfter[r2 + '→' + r3].affection || 0) - beforeAff) * 1000) / 1000 === MATCHMAKE.warmDeltas.affection
      && Math.round(((axAfter[r3 + '→' + r2].affection || 0) - axBefore[r3 + '→' + r2].affection) * 1000) / 1000 === MATCHMAKE.warmDeltas.affection;
  })()`));

await check('matchmake respects the transition cooldown — progress crosses but the status does not move',
  api(`(() => {
    const h = house(20260815, 4);
    const [r2, r3] = residentsOf(h);
    const day = h.meta.clock.day;
    notePlayerWitnessedEntry(h, r2, 'peeked_masturbation', day, h.npcs[r2].residency.room, {});
    notePlayerWitnessedEntry(h, r3, 'peeked_masturbation', day, h.npcs[r3].residency.room, {});
    const rec = getRelationship(h, r2, r3, true);
    rec.progress = 0.49;
    rec.lastTransitionDay = day;             // cooldown just started
    const res = applyMatchmakeNpc(h, r2, r3);
    return res.ok === true && res.events.length === 0 && rec.status === 'single'
      && rec.progress >= 0.5;                // the boost still landed, the door is the cooldown
  })()`));

await check('an incompatible pair (below MATCHMAKE.minCompatibilityForMatch) refuses — no progress, no history, no castWeb change',
  api(`(() => {
    const h = house(20260815, 4);
    const [r1, r2, r3] = residentsOf(h);
    const day = h.meta.clock.day;
    notePlayerWitnessedEntry(h, r2, 'peeked_masturbation', day, h.npcs[r2].residency.room, {});
    notePlayerWitnessedEntry(h, r3, 'peeked_masturbation', day, h.npcs[r3].residency.room, {});
    const rec = getRelationship(h, r2, r3, true);
    rec.progress = 0.1;
    rec.lastTransitionDay = day - 5;
    // Force ALL THREE compatibility terms down — hostile castWeb axes AND
    // incompatible temperament. Axes alone can't do it: the static floor
    // (base 0.2 + shared-interest 0.15 + values 0.15 + personality 0.2) keeps
    // generated pairs at ~0.43-0.49 even with every axis hostile (measured),
    // so the refusal branch is reachable here only with an authored mismatch.
    h.npcs[r2].bible.interests = [{ name: 'i1', tags: ['x'] }];
    h.npcs[r3].bible.interests = [{ name: 'i2', tags: ['y'] }];
    h.npcs[r2].bible.values = [{ name: 'va', opposition: 'vb' }];
    h.npcs[r3].bible.values = [{ name: 'vb', opposition: 'va' }];
    h.npcs[r2].bible.temperament = { warmth: -1, volatility: -1, openness: -1 };
    h.npcs[r3].bible.temperament = { warmth: 1, volatility: 1, openness: 1 };
    const key = pairKey(r2, r3);
    const pair = h.world.castWeb[key];
    for (const dir of [r2 + '→' + r3, r3 + '→' + r2]) {
      pair.axes[dir].affection = -1; pair.axes[dir].desire = -1; pair.axes[dir].comfort = 0; pair.axes[dir].tension = 1;
    }
    const compat = pairCompatibility(h, r2, r3);
    const castBefore = JSON.stringify(h.world.castWeb[key]);
    const res = applyMatchmakeNpc(h, r2, r3);
    return compat < MATCHMAKE.minCompatibilityForMatch
      && res.ok === false && res.reason === 'incompatible'
      && rec.progress === 0.1 && !rec.history.some(x => x.kind === 'matched')
      && JSON.stringify(h.world.castWeb[key]) === castBefore;
  })()`));

await check('the daily pass still transitions through tryAdvanceRelationshipStatus (the refactored core)',
  api(`(() => {
    const h = house(20260815, 3);
    const [r1, r2, r3] = residentsOf(h);
    const day = h.meta.clock.day;
    const rec = getRelationship(h, r1, r2, true);
    rec.status = 'single';
    rec.progress = 0.49;
    rec.coLocTicks = 2;                      // ~2 weighted 30-min ticks tomorrow
    rec.lastTransitionDay = day - 5;
    // Same generated-pair compat floor (see the matchmake check): warm the
    // axes as prior co-located days would have, so the pair reads ≥ the 0.5
    // minCompatibilityForStart bar and the transition can fire.
    h.world.castWeb = applyNpcToNpcDelta(h.world.castWeb, r1, r2, { affection: 0.8, desire: 0.6, comfort: 0.5 });
    h.world.castWeb = applyNpcToNpcDelta(h.world.castWeb, r2, r1, { affection: 0.8, desire: 0.6, comfort: 0.5 });
    const events = updateRelationshipsForDay(h, day + 1);
    const evt = events.find(e => (e.a === r1 && e.b === r2) || (e.a === r2 && e.b === r1));
    return !!evt && evt.kind === 'seeing' && rec.status === 'seeing'
      && rec.history.some(x => x.kind === 'became_seeing');
  })()`));

console.log('\n7. Save/load round-trip through the REAL writeGeneratedGameState/loadGameState (in-memory kv)');

await check('G.1 — ledger entries (participated + witnessed, spent flags) survive the round-trip',
  api(`(async () => {
    root.kv = makeMemKv();
    const h = house(20260816, 3);
    const [r1, r2, r3] = residentsOf(h);
    const day = h.meta.clock.day;
    notePlayerLedgerEntry(h, r1, 'sex', day - 1, h.npcs[r1].residency.room);
    notePlayerWitnessedEntry(h, r1, 'saw_with_X', day, h.npcs[r1].residency.room, { otherNpcId: r3 });
    notePlayerWitnessedEntry(h, r2, 'peeked_masturbation', day, h.npcs[r2].residency.room, { outcome: 'caught' });
    spendCodexEntry(h, r1, 1);               // spend the witnessed one
    getRelationship(h, r1, r2, true).status = 'committed';
    await writeGeneratedGameState(h);
    const loaded = await loadGameState();
    const entries1 = loaded.player.ledger?.[r1] || [];
    const entries2 = loaded.player.ledger?.[r2] || [];
    return Array.isArray(entries1) && entries1.length === 2
      && entries1[0].kind === 'participated' && entries1[0].spent === false
      && entries1[1].kind === 'witnessed' && entries1[1].spent === true
      && entries1[1].otherNpcId === r3
      && entries2.length === 1 && entries2[0].outcome === 'caught'
      && loaded.world.relationships[pairKey(r1, r2)]?.status === 'committed';
  })()`));

await check('G.2 — the round trip is deterministic (identical output for identical input)',
  api(`(async () => {
    async function trip(seed) {
      root.kv = makeMemKv();
      const h = house(seed, 3);
      const [r1, r2, r3] = residentsOf(h);
      const day = h.meta.clock.day;
      notePlayerWitnessedEntry(h, r1, 'saw_with_X', day, h.npcs[r1].residency.room, { otherNpcId: r3 });
      spendCodexEntry(h, r1, 0);
      await writeGeneratedGameState(h);
      return await loadGameState();
    }
    const a = await trip(20260816); const b = await trip(20260816);
    return JSON.stringify(a.player.ledger) === JSON.stringify(b.player.ledger)
      && JSON.stringify(a.world.relationships) === JSON.stringify(b.world.relationships);
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
