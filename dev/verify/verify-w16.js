// Intimacy & Voyeurism Plan Phase 16 — Shaming, cold-shoulder, move-out
// extension (D2/D14).
// The hurt state an NPC carries toward the player after something severe:
//   npc.flags._coldShoulder = { day, severity, reason } + `repairs`
//   (per-kind day stamps) + `healDay` (npc.js — the ONE writer,
//   noteColdShoulder). Effects: severity-scaled talk refusal + room
//   avoidance (ui.checkRelConsequences), total overture + player-directed-
//   drive suppression (overture.js / cognition.js), a willingness HARD FLOOR
//   (willingness.js — invariant 1, fail-closed), the repair ratchet
//   (noteColdShoulderRepair: gift/apology per-kind cooldowns, apology
//   blocked above severity 3, minDaysBeforeRepair), and the day-rollover
//   pass (advanceColdShoulderForDay: time heal + move-out risk for max
//   severity from moveOutEarliestDay).
// The shaming resolver (resolveShamingTier/resolveShamingReaction/
// pickShamingProse — npc.js) deterministically maps caught-perving to a
// dynamic tier (hostile/warm/cold/neutral, SHAMING config) whose deltas and
// cold-shoulder onset the peek confront path applies.
//
// Section 2 is the MANDATORY per-session gate check: a cold-shouldered NPC
// has willingness exactly -1 for BOTH initiators (symmetric initiation,
// D3), the floor reason is 'cold_shoulder', no partner is found for them,
// no suppressed drive is candid, no overture fires, and the floor lives in
// exactly one place in willingness.js. Section 8 is the save/load
// round-trip through the REAL writeGeneratedGameState/loadGameState against
// an in-memory kv adapter (meta pre-seeded so the version-check path is
// exercised as a no-op, exactly like a fresh kv swap on the live page).
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['npc.js'] });
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

api(`
  function warmTowardPlayer(h, npcId, deltas) {
    h.npcs[npcId] = applyRelDelta(h.npcs[npcId], deltas, h.meta.clock.day);
  }
`);

// --- In-memory kv adapter for the save/load round-trip (mirrors kv-plugin's
// folder surface). ---
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

console.log('\n1. Cold-shoulder state machine (flag shape, clamp, repair ratchet, cooldowns)');

await check('noteColdShoulder stamps {day, severity, reason} + repairs/healDay; severity clamped to [1,maxSeverity]; severity 0 clears',
  api(`(() => {
    const h = house(20260815, 2);
    const [r1] = residentsOf(h);
    const day = h.meta.clock.day;
    noteColdShoulder(h.npcs[r1], 99, day, 'caught_peep');
    const clamped = h.npcs[r1].flags._coldShoulder.severity === COLD_SHOULDER.maxSeverity
      && h.npcs[r1].flags._coldShoulder.reason === 'caught_peep' && h.npcs[r1].flags._coldShoulder.day === day;
    noteColdShoulder(h.npcs[r1], 0, day, null);
    return clamped && h.npcs[r1].flags._coldShoulder === null;
  })()`));

await check('coldShoulderState/coldShoulderActive are pure reads; daysSince counts from onset',
  api(`(() => {
    const h = house(20260815, 2);
    const [r1] = residentsOf(h);
    const day = h.meta.clock.day;
    noteColdShoulder(h.npcs[r1], 2, day, 'public_infidelity');
    const st = coldShoulderState(h.npcs[r1], day + 3);
    return st.active === true && st.severity === 2 && st.reason === 'public_infidelity'
      && st.daysSince === 3 && coldShoulderActive(h.npcs[r1]) === true
      && coldShoulderState({ flags: {} }, day).active === false;
  })()`));

await check('the repair ratchet: too_soon same day → gift(day+1) to 2 → apology to 1 → gift clears → apology not_active; per-kind cooldowns and won_t_listen block',
  api(`(() => {
    const h = house(20260815, 2);
    const [r1] = residentsOf(h);
    const day = h.meta.clock.day;
    noteColdShoulder(h.npcs[r1], 3, day, 'caught_peep');
    const tooSoon = noteColdShoulderRepair(h.npcs[r1], 'gift', day);
    const gift1 = noteColdShoulderRepair(h.npcs[r1], 'gift', day + 1);
    const apology = noteColdShoulderRepair(h.npcs[r1], 'apology', day + 2);
    const gift2 = noteColdShoulderRepair(h.npcs[r1], 'gift', day + 3);
    const apology2 = noteColdShoulderRepair(h.npcs[r1], 'apology', day + 4);
    const cleared = !coldShoulderActive(h.npcs[r1]);
    // separate fixture: per-kind cooldowns + won_t_listen (severity 3 hears no apology)
    const h2 = house(20260822, 2);
    const [r2] = residentsOf(h2);
    const d2 = h2.meta.clock.day;
    noteColdShoulder(h2.npcs[r2], 3, d2, 'caught_peep');
    const wonTListen = noteColdShoulderRepair(h2.npcs[r2], 'apology', d2 + 1);       // severity 3 -> won_t_listen
    const gA = noteColdShoulderRepair(h2.npcs[r2], 'gift', d2 + 1);                  // -> 2
    const gB = noteColdShoulderRepair(h2.npcs[r2], 'gift', d2 + 2);                  // 1 day after gift -> cooldown
    const apB = noteColdShoulderRepair(h2.npcs[r2], 'apology', d2 + 3);              // -> 1
    const apC = noteColdShoulderRepair(h2.npcs[r2], 'apology', d2 + 4);              // 1 day after apology -> cooldown
    return tooSoon.reason === 'too_soon' && gift1.repaired && gift1.severity === 2
      && apology.repaired && apology.severity === 1
      && gift2.repaired && gift2.severity === 0 && cleared && apology2.reason === 'not_active'
      && wonTListen.reason === 'won_t_listen' && gA.repaired && gA.severity === 2
      && gB.reason === 'cooldown' && apB.repaired && apB.severity === 1 && apC.reason === 'cooldown';
  })()`));

console.log('\n2. MANDATORY gate check — the cold-shoulder hard floor (symmetric initiation, invariant 1)');

await check('a cold-shouldered NPC has willingness exactly -1 for BOTH initiators with reason floor + reasons cold_shoulder',
  api(`(() => {
    const h = house(20260816, 2);
    const [r1, r2] = residentsOf(h);
    const day = h.meta.clock.day;
    noteColdShoulder(h.npcs[r1], 3, day, 'caught_peep');
    warmTowardPlayer(h, r1, { trust: 0.5, affection: 0.6, comfort: 0.7, tension: 0.1, desire: 0.5 });
    const gPlayer = resolveWillingnessGate(h, r1, 'player', 'sex', {});
    // warm the castWeb so ONLY the floor could block the NPC-initiated side
    h.world.castWeb = applyNpcToNpcDelta(h.world.castWeb, r2, r1, { trust: 0.5, affection: 0.6, comfort: 0.7, tension: 0.1, desire: 0.5 });
    h.world.castWeb = applyNpcToNpcDelta(h.world.castWeb, r1, r2, { trust: 0.5, affection: 0.6, comfort: 0.7, tension: 0.1, desire: 0.5 });
    const gNpc = resolveWillingnessGate(h, r1, r2, 'sex', {});
    return gPlayer.willingness === -1 && gPlayer.reason === 'floor'
      && gPlayer.reasons.includes('cold_shoulder')
      && gNpc.willingness === -1 && gNpc.reason === 'floor'
      && gNpc.reasons.includes('cold_shoulder');
  })()`));

await check('no partner, no suppressed drive, no overture — and the positive control opens the moment the flag clears',
  api(`(() => {
    const h = house(20260816, 2);
    const [r1, r2] = residentsOf(h);
    const day = h.meta.clock.day;
    noteColdShoulder(h.npcs[r1], 3, day, 'caught_peep');
    warmTowardPlayer(h, r1, { trust: 0.5, affection: 0.6, comfort: 0.7, tension: 0.1, desire: 0.5 });
    h.npcs[r2].location = h.npcs[r1].residency.room;
    const partner = findIntimatePartner(h.npcs[r2], r2, h, h.npcs[r1].residency.room, 'leisure');
    const oscore = scoreOvertures(h.npcs[r1], r1, h, { block: 'leisure', location: h.npcs[r1].location, isVisitor: false, nowAbs: 1 });
    const drivesSuppressed = COLD_SHOULDER.suppressedDrives.every(id =>
      isDriveCandidate(id, DRIVE_DEFS[id], h.npcs[r1], h, { block: 'leisure', location: h.npcs[r1].location, blockRoomId: h.npcs[r1].location, isVisitor: false, nowAbs: 1 }) === false);
    // positive control: clear the flag and the same NPC becomes a candidate again
    delete h.npcs[r1].flags._coldShoulder;
    warmTowardPlayer(h, r1, { affection: 0.2, desire: 0.25, comfort: 0.3 });
    const gateOpen = resolveWillingnessGate(h, r1, 'player', 'sex', {});
    const oscoreOpen = Object.keys(scoreOvertures(h.npcs[r1], r1, h, { block: 'leisure', location: h.npcs[r1].location, isVisitor: false, nowAbs: 1 })).length > 0;
    return partner === null && Object.keys(oscore).length === 0 && drivesSuppressed
      && gateOpen.allowed === true && oscoreOpen === true;
  })()`));

await check('the refusal prose names the cold shoulder honestly',
  api(`(() => {
    const h = house(20260816, 2);
    const [r1] = residentsOf(h);
    noteColdShoulder(h.npcs[r1], 1, 1, 'caught_peep');
    const line = willingnessRefusalProse(h.npcs[r1], { reasons: ['cold_shoulder'] });
    return line.includes('cold') && line.includes(h.npcs[r1].bible.name);
  })()`));

await check('willingness.js has EXACTLY ONE coldShoulderActive read and it sits inside willingnessFloorReasons (no second, softer door)',
  new Promise((resolve) => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', 'willingness.js'), 'utf8');
    const reads = (src.match(/coldShoulderActive\(/g) || []).length;
    const floorFnBody = src.split('function willingnessFloorReasons')[1].split('function willingnessFloor')[0];
    const inFloor = (floorFnBody.match(/coldShoulderActive\(/g) || []).length;
    resolve(reads === 1 && inFloor === 1);
  }), 'coldShoulderActive must appear exactly once, inside willingnessFloorReasons');

console.log('\n3. Overture + drive suppression (the two gates agree)');

await check('a cold-shouldering NPC scores ZERO overtures while a warm control scores some; suppression starts at severity 1',
  api(`(() => {
    const h = house(20260820, 2);
    const [r1] = residentsOf(h);
    noteColdShoulder(h.npcs[r1], 1, h.meta.clock.day, 'caught_peep');
    warmTowardPlayer(h, r1, { trust: 0.5, affection: 0.6, comfort: 0.7, tension: 0.1, desire: 0.5 });
    const cold = Object.keys(scoreOvertures(h.npcs[r1], r1, h, { block: 'leisure', location: h.npcs[r1].location, isVisitor: false, nowAbs: 1 })).length;
    delete h.npcs[r1].flags._coldShoulder;
    const warm = Object.keys(scoreOvertures(h.npcs[r1], r1, h, { block: 'leisure', location: h.npcs[r1].location, isVisitor: false, nowAbs: 1 })).length;
    return cold === 0 && warm > 0;
  })()`));

await check('the drive filter and the overture scorer read the SAME suppression (coldShoulderSuppressesOvertures)',
  api(`(() => {
    const h = house(20260820, 2);
    const [r1] = residentsOf(h);
    noteColdShoulder(h.npcs[r1], 2, h.meta.clock.day, 'caught_peep');
    return coldShoulderSuppressesOvertures(h.npcs[r1]) === true
      && coldShoulderState(h.npcs[r1]).severity === 2;
  })()`));

console.log('\n4. Shaming — deterministic per-dynamic-tier reaction (D2, invariant 8)');

await check('a near-stranger is cold/mortified (severity 3 onset), a close dynamic is warm (no onset), hostile is hostile (severity 3)',
  api(`(() => {
    const h = house(20260817, 2);
    const [r1] = residentsOf(h);
    const tierCold = resolveShamingTier(h, h.npcs[r1]);
    const reactCold = resolveShamingReaction(h, h.npcs[r1], {});
    warmTowardPlayer(h, r1, { trust: 0.5, affection: 0.6, comfort: 0.7, tension: 0.1, desire: 0.5 });
    const tierWarm = resolveShamingTier(h, h.npcs[r1]);
    const reactWarm = resolveShamingReaction(h, h.npcs[r1], {});
    warmTowardPlayer(h, r1, { tension: 0.9 });
    const tierHostile = resolveShamingTier(h, h.npcs[r1]);
    const reactHostile = resolveShamingReaction(h, h.npcs[r1], {});
    return tierCold === 'cold' && reactCold.coldShoulderSeverity === 3
      && tierWarm === 'warm' && reactWarm.coldShoulderSeverity === 0
      && tierHostile === 'hostile' && reactHostile.coldShoulderSeverity === 3;
  })()`));

await check('shaming prose is deterministic per (tier, day, npc) and every tier has authored deltas',
  api(`(() => {
    const h = house(20260817, 2);
    const [r1] = residentsOf(h);
    warmTowardPlayer(h, r1, { tension: 0.9 });
    const a = resolveShamingReaction(h, h.npcs[r1], {});
    const b = resolveShamingReaction(h, h.npcs[r1], {});
    const hostileDef = a.def;
    const allDefs = Object.values(SHAMING.tiers);
    return a.tier === 'hostile' && a.prose === b.prose && a.prose.length > 0
      && typeof hostileDef.relDeltas?.tension === 'number'
      && allDefs.every(d => d.relDeltas && typeof d.coldShoulderSeverity === 'number');
  })()`));

await check('shaming is a READ — resolveShamingReaction applies nothing to the game state',
  api(`(() => {
    const h = house(20260817, 2);
    const [r1] = residentsOf(h);
    const flagsBefore = JSON.stringify(h.npcs[r1].flags);
    const relBefore = JSON.stringify(h.npcs[r1].relPlayer);
    resolveShamingReaction(h, h.npcs[r1], {});
    resolveShamingTier(h, h.npcs[r1]);
    return JSON.stringify(h.npcs[r1].flags) === flagsBefore
      && JSON.stringify(h.npcs[r1].relPlayer) === relBefore;
  })()`));

console.log('\n5. Peek confront integration (the caught-peek shaming path)');

await check('peek.js has exactly ONE noteColdShoulder write and it sits inside the confront branch',
  new Promise((resolve) => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', 'peek.js'), 'utf8');
    const writes = (src.match(/noteColdShoulder\(/g) || []).length;
    const confrontFnBody = src.split("if (outcome === 'confront')")[1].split("} else {")[0];
    const inConfront = (confrontFnBody.match(/noteColdShoulder\(/g) || []).length;
    resolve(writes === 1 && inConfront === 1);
  }), 'noteColdShoulder must appear exactly once, inside the confront branch');

await check('the confront effect lines format signed deltas without a stray "+" (the pre-existing +- NaN bug stays dead)',
  api(`(() => {
    const h = house(20260817, 2);
    const [r1] = residentsOf(h);
    const shaming = resolveShamingReaction(h, h.npcs[r1], { day: 1, cause: 'caught_peep_sexual' });
    const lines = [];
    for (const [axis, v] of Object.entries(shaming.def.relDeltas || {})) {
      lines.push('REL_DELTA ' + r1 + ' ' + axis + ' ' + (v < 0 ? '' : '+') + v);
    }
    return lines.every(l => {
      const parsed = parseEffectDSL(l)[0];
      return parsed && typeof parsed.delta === 'number' && !Number.isNaN(parsed.delta);
    }) && lines.some(l => l.includes('-0.')) && lines.some(l => l.includes('+0.'));
  })()`));

console.log('\n6. Infidelity fallout (relationships.js — the ONE cold-shoulder cause path)');

await check('the wronged party goes cold-shoulder toward the player (severity from COLD_SHOULDER.causeSeverity, reason public_infidelity) on TOP of the jealousy deltas + grievance',
  api(`(() => {
    const h = house(20260823, 3);
    const [r1, r2] = residentsOf(h);
    const day = h.meta.clock.day;
    getRelationship(h, r1, r2, true).status = 'committed';
    const moodBefore = h.npcs[r2].mood;
    const wronged = applyInfidelityJealousy(h, r2, r1, 'player', day, 'you slept with someone', {});
    const cs = wronged.flags._coldShoulder;
    const jealous = wronged.flags._jealousy[r1 + '|player|' + day] === true;
    const grievance = (wronged.relPlayer.grievances || []).length > 0;
    const moodDropped = wronged.mood === moodBefore + INFIDELITY.wrongedMoodDelta;
    return wronged !== null && cs && cs.severity === COLD_SHOULDER.causeSeverity.public_infidelity
      && cs.reason === 'public_infidelity' && cs.day === day
      && jealous && grievance && moodDropped;
  })()`));

await check('the player-as-other path is idempotent (a repeated delivery does not re-stamp or double cold-shoulder)',
  api(`(() => {
    const h = house(20260823, 3);
    const [r1, r2] = residentsOf(h);
    const day = h.meta.clock.day;
    getRelationship(h, r1, r2, true).status = 'committed';
    applyInfidelityJealousy(h, r2, r1, 'player', day, 'you slept with someone', {});
    const before = JSON.stringify(h.npcs[r2].flags._coldShoulder);
    const again = applyInfidelityJealousy(h, r2, r1, 'player', day, 'you slept with someone', {});
    return JSON.stringify(h.npcs[r2].flags._coldShoulder) === before
      && again.flags._coldShoulder && again.flags._coldShoulder.severity === COLD_SHOULDER.causeSeverity.public_infidelity;
  })()`));

await check('an NPC↔NPC betrayal does NOT cold-shoulder the wronged party (the flag is player-facing; fallout stays in the castWeb)',
  api(`(() => {
    const h = house(20260824, 3);
    const [a, b, c] = residentsOf(h);
    const day = h.meta.clock.day;
    getRelationship(h, a, b, true).status = 'committed';
    applyInfidelityJealousy(h, b, a, c, day, 'they slept together', {});
    return !h.npcs[b].flags._coldShoulder && !!h.npcs[b].flags._jealousy;
  })()`));

console.log('\n7. Move-out risk + time rescue (advanceColdShoulderForDay)');

await check('only max-severity cold from moveOutEarliestDay onward can move an NPC out; the roll decides; time heals before the window runs out',
  api(`(() => {
    const h = house(20260819, 3);
    const [r1, r2, r3] = residentsOf(h);
    const day = h.meta.clock.day;
    // severity 2 NEVER moves out, even with 40 days of rng()=0
    noteColdShoulder(h.npcs[r1], 2, day, 'public_infidelity');
    let movedLow = false;
    for (let i = 0; i < 40; i++) { const d = advanceColdShoulderForDay(h.npcs[r1], day + 1 + i, () => 0.0); if (d.movedOut) movedLow = true; }
    // severity 3: earliest day (day+2) with a high roll does not move; the next day a low roll does
    noteColdShoulder(h.npcs[r2], 3, day, 'caught_peep');
    const notMoved = advanceColdShoulderForDay(h.npcs[r2], day + 2, () => 0.99).movedOut;
    const moved = advanceColdShoulderForDay(h.npcs[r2], day + 3, () => 0.0).movedOut;
    // time rescue: at timeRecoveryDays the time heal fires first — severity 3 becomes 2 in the same pass, so no move-out
    noteColdShoulder(h.npcs[r3], 3, day, 'caught_peep');
    const healed = advanceColdShoulderForDay(h.npcs[r3], day + COLD_SHOULDER.timeRecoveryDays, () => 0.99);
    return !movedLow && !notMoved && moved && healed.movedOut === false
      && h.npcs[r3].flags._coldShoulder && h.npcs[r3].flags._coldShoulder.severity === 2;
  })()`));

await check('no rng → the move-out roll never fires (deterministic systems stay deterministic)',
  api(`(() => {
    const h = house(20260819, 2);
    const [r1] = residentsOf(h);
    const day = h.meta.clock.day;
    noteColdShoulder(h.npcs[r1], 3, day, 'caught_peep');
    let moved = false;
    for (let i = 2; i < 40; i++) { if (advanceColdShoulderForDay(h.npcs[r1], day + i).movedOut) moved = true; }
    return moved === false;
  })()`));

await check('the day pass is a verdict, not the move-out itself (returns {movedOut, severity, counter}, resets the counter when below bar)',
  api(`(() => {
    const h = house(20260819, 2);
    const [r1] = residentsOf(h);
    const day = h.meta.clock.day;
    noteColdShoulder(h.npcs[r1], 3, day, 'caught_peep');
    const first = advanceColdShoulderForDay(h.npcs[r1], day + 3, () => 0.0);
    const second = advanceColdShoulderForDay(h.npcs[r1], day + 4, () => 0.99);
    return first.movedOut === true && typeof first.counter === 'number'
      && second.movedOut === false && h.npcs[r1].flags._coldShoulderDays >= 1;
  })()`));

console.log('\n8. Save/load round-trip through the REAL writeGeneratedGameState/loadGameState (in-memory kv, meta pre-seeded)');

await check('G.1 — _coldShoulder (severity/reason/repairs/healDay) + _coldShoulderDays survive the round-trip',
  api(`(async () => {
    root.kv = makeMemKv();
    // Pre-seed meta with the real versions so the check-and-migrate path is a
    // no-op (exactly the live-page swap trick — an EMPTY mem kv fails the
    // migration assert because meta is missing and the chain starts at 1).
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt16', clock: { day: 1, minutes: 0 } });
    const h = house(20260825, 2);
    const [r1] = residentsOf(h);
    const day = h.meta.clock.day;
    noteColdShoulder(h.npcs[r1], 3, day, 'caught_peep');
    noteColdShoulderRepair(h.npcs[r1], 'gift', day + 1);
    advanceColdShoulderForDay(h.npcs[r1], day + 3, () => 0.99);
    const expected = JSON.stringify(h.npcs[r1].flags._coldShoulder);
    const daysExpected = h.npcs[r1].flags._coldShoulderDays;
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    const cs = loaded.npcs[r1].flags._coldShoulder;
    return JSON.stringify(cs) === expected
      && loaded.npcs[r1].flags._coldShoulderDays === daysExpected
      && cs.severity === 2 && cs.reason === 'caught_peep';
  })()`));

await check('G.2 — the round trip is deterministic (identical output for identical input)',
  api(`(async () => {
    async function trip(seed) {
      root.kv = makeMemKv();
      await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt16', clock: { day: 1, minutes: 0 } });
      const h = house(seed, 2);
      const [r1] = residentsOf(h);
      const day = h.meta.clock.day;
      noteColdShoulder(h.npcs[r1], 3, day, 'caught_peep');
      await writeGeneratedGameState(h);
      return await loadGameState();
    }
    const a = await trip(20260825); const b = await trip(20260825);
    return JSON.stringify(a.npcs[Object.keys(a.npcs).find(id => a.npcs[id].flags?._coldShoulder)].flags._coldShoulder)
      === JSON.stringify(b.npcs[Object.keys(b.npcs).find(id => b.npcs[id].flags?._coldShoulder)].flags._coldShoulder);
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
