// Intimacy & Voyeurism Plan Phase 17 — Boundary acts (D13/D14): sleeping-room
// acts (slide into bed / watch sleep), three-way acts (throuple/cuck), and
// the NPC sneak_into_bed drive.
//
// The sleeping-room acts are the plan's "separate narrow gate": the
// willingness function is ALWAYS consulted and the asleep floor (-1, reason
// 'floor', reasons ['asleep']) is RECORDED, never relaxed. The gate closes on
// a missing/absent/awake/non-resident/cold-shouldering target; an allowed
// attempt is a RISK ACT — wake/catch is a seeded roll, a cold/neutral/hostile
// wake routes through Phase 16's shaming resolver (resolveShamingReaction,
// including the cold-shoulder onset), and a warm wake NEVER shames: it re-
// reads the REAL willingness gate against the now-AWAKE target
// (resolveBoundaryAwakeGate) — a completed act only ever happens with an
// awake, willing partner (the reciprocate branch), otherwise a playful
// refusal. Three-way acts have NO exception: all three parties clear
// resolveWillingnessGate + a real desire floor, one unwilling party refuses
// the whole act; 'cuck' is the same all-willing act named by configuration
// when two of the three are a committed/seeing couple.
//
// Section 2 is the MANDATORY per-session gate check: exactly three
// resolveWillingnessGate call sites in boundary.js, all inside the gate
// helpers (no second, softer door), and a negative-willingness three-way
// (asleep partner) never fires. Section 8 is the save/load round-trip
// through the REAL writeGeneratedGameState/loadGameState against an in-memory
// kv adapter (meta pre-seeded so the version-check path is a no-op, exactly
// like a fresh kv swap on the live page). UI-flow verification (the real
// handleAction routing for boundary.sleep_with/boundary.throuple) requires a
// DOM and lives in the phase's Handoff note — this harness covers the pure
// domain half.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['boundary.js'] });
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

// Full relPlayer axes — applyRelDelta requires every axis key present (a
// missing key turns into NaN; generated NPCs always carry them all).
api(`
  function warmTowardPlayer(h, npcId, extra) {
    const wantsDesire = extra && extra.needsDesire;
    const relExtra = { ...(extra || {}) };
    delete relExtra.needsDesire;
    h.npcs[npcId].relPlayer = {
      trust: 0.5, affection: 0.5, tension: 0.1, respect: 0.4, comfort: 0.7,
      desire: 0.9, conversationPhase: 'intimate', ...relExtra,
    };
    h.npcs[npcId].needs = { ...(h.npcs[npcId].needs || {}), desire: wantsDesire || 90 };
    h.npcs[npcId].mood = (relExtra.mood !== undefined) ? relExtra.mood : 0.3;
  }
`);

// The standard sleeping-room fixture: the target asleep in their own room,
// the player beside them.
api(`
  function sleepFixture(seed, n, mode) {
    const h = house(seed, n);
    const [r1] = residentsOf(h);
    const room = h.npcs[r1].residency.room;
    h.player.location = room; h.npcs[r1].location = room; h.npcs[r1].activity = 'sleeping';
    if (mode === 'warmWilling') warmTowardPlayer(h, r1);
    if (mode === 'warmRefuse') warmTowardPlayer(h, r1, { desire: -0.4, comfort: 0.7, mood: -0.3, needsDesire: 10 });
    return h;
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

console.log('\n1. The narrow sleeping-room gate (resolveBoundaryGate)');

await check('an asleep resident clears the gate and the asleep floor is RECORDED (reason floor, reasons [asleep], willingness -1) — never relaxed',
  api(`(() => {
    const h = house(20260817, 2);
    const [r1] = residentsOf(h);
    const room = h.npcs[r1].residency.room;
    h.player.location = room; h.npcs[r1].location = room; h.npcs[r1].activity = 'sleeping';
    const g = resolveBoundaryGate(h, 'sleep_with', r1, { location: room, initiatorId: 'player' });
    return g.allowed === true && g.targetGate?.reason === 'floor'
      && g.targetGate?.reasons?.includes('asleep') && g.targetGate?.willingness === -1
      && g.tier !== undefined && g.catchRisk === 'high';
  })()`));

await check('the gate closes on: awake target, absent target, non-resident, and a cold-shouldering target',
  api(`(() => {
    const h = house(20260818, 3);
    const ids = Object.keys(h.npcs);
    const r1 = ids.find(id => h.npcs[id].residency.status === 'resident');
    const guest = ids.find(id => h.npcs[id].residency.status !== 'resident');
    const room = h.npcs[r1].residency.room;
    h.player.location = room;
    // awake
    h.npcs[r1].location = room; h.npcs[r1].activity = 'idle';
    const awake = resolveBoundaryGate(h, 'sleep_with', r1, { location: room, initiatorId: 'player' });
    // absent
    h.npcs[r1].activity = 'sleeping'; h.npcs[r1].location = 'kitchen_a';
    const absent = resolveBoundaryGate(h, 'sleep_with', r1, { location: room, initiatorId: 'player' });
    // non-resident
    h.npcs[guest].location = room; h.npcs[guest].activity = 'sleeping';
    const nonRes = resolveBoundaryGate(h, 'sleep_with', guest, { location: room, initiatorId: 'player' });
    // cold-shouldering target — Phase 16's floor closes even the attempt
    h.npcs[r1].location = room; h.npcs[r1].activity = 'sleeping';
    noteColdShoulder(h.npcs[r1], 2, h.meta.clock.day, 'caught_peep');
    const cold = resolveBoundaryGate(h, 'sleep_with', r1, { location: room, initiatorId: 'player' });
    return awake.reason === 'not_asleep' && absent.reason === 'not_here'
      && nonRes.reason === 'not_resident' && cold.reason === 'cold_shoulder'
      && awake.allowed === false && absent.allowed === false && nonRes.allowed === false && cold.allowed === false;
  })()`));

await check('sleepingOccupantInRoom finds the sleeper (prefers the room\'s owner) and returns null when nobody is asleep',
  api(`(() => {
    const h = house(20260819, 2);
    const [r1] = residentsOf(h);
    const room = h.npcs[r1].residency.room;
    h.player.location = room; h.npcs[r1].location = room; h.npcs[r1].activity = 'sleeping';
    const found = sleepingOccupantInRoom(h, room);
    const none = sleepingOccupantInRoom(h, 'kitchen_a');
    return found === r1 && none === null;
  })()`));

console.log('\n2. MANDATORY gate check — the willingness function is the only door');

await check('boundary.js has EXACTLY THREE resolveWillingnessGate call sites, all inside the gate helpers (no second, softer door)',
  new Promise((resolve) => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', 'boundary.js'), 'utf8');
    const lines = src.split('\n');
    const calls = [];
    for (const m of src.matchAll(/resolveWillingnessGate\s*\(/g)) calls.push(lines.slice(0, src.slice(0, m.index).split('\n').length).join('\n').split('\n').length);
    const fnAt = (line) => {
      const starts = [];
      for (const m of src.matchAll(/function (\w+)\s*\(/g)) starts.push([m[1], src.slice(0, m.index).split('\n').length]);
      let name = '?';
      for (const [fn, start] of starts) if (start <= line) name = fn;
      return name;
    };
    const inHelpers = calls.every(l => ['resolveBoundaryGate', 'resolveBoundaryThroupleGate', 'resolveBoundaryAwakeGate'].includes(fnAt(l)));
    resolve(calls.length === 3 && inHelpers);
  }), 'resolveWillingnessGate must appear exactly three times, all inside resolveBoundaryGate/resolveBoundaryThroupleGate/resolveBoundaryAwakeGate');

await check('the three-way gate refuses a single unwilling partner with that partner\'s voice, and a negative-willingness (asleep) partner never fires',
  api(`(() => {
    const h = house(20260820, 2);
    const [r1, r2] = residentsOf(h);
    const room = h.player.location;
    h.npcs[r1].location = room; h.npcs[r2].location = room;
    warmTowardPlayer(h, r1);
    // r2: real desire but a relational soft no (willingness between -1 and 0.6)
    h.npcs[r2].relPlayer = { trust: 0.4, affection: 0.3, tension: 0.1, respect: 0.3, comfort: 0.7, desire: -0.4, conversationPhase: 'intimate' };
    h.npcs[r2].needs = { ...(h.npcs[r2].needs || {}), desire: 70 };
    h.npcs[r2].mood = -0.3;
    const softNo = resolveBoundaryThroupleGate(h, r1, r2, { location: room });
    // positive control
    warmTowardPlayer(h, r2);
    const allowed = resolveBoundaryThroupleGate(h, r1, r2, { location: room });
    // asleep r2 -> the hard floor (willingness exactly -1)
    h.npcs[r2].activity = 'sleeping';
    const asleep = resolveBoundaryThroupleGate(h, r1, r2, { location: room });
    return softNo.allowed === false && softNo.partner === 'b' && softNo.reason === 'below_threshold'
      && softNo.gate?.willingness > -1
      && allowed.allowed === true
      && asleep.allowed === false && asleep.reason === 'floor' && asleep.gate?.willingness === -1;
  })()`));

await check('a desire below the floor is its own refusal (not_into_it) — the plan\'s "two willing partners + desire"',
  api(`(() => {
    const h = house(20260821, 2);
    const [r1, r2] = residentsOf(h);
    const room = h.player.location;
    h.npcs[r1].location = room; h.npcs[r2].location = room;
    warmTowardPlayer(h, r1);
    warmTowardPlayer(h, r2);
    h.npcs[r2].needs = { ...(h.npcs[r2].needs || {}), desire: 10 };
    const g = resolveBoundaryThroupleGate(h, r1, r2, { location: room });
    return g.allowed === false && g.reason === 'not_into_it' && g.partner === 'b';
  })()`));

console.log('\n3. Wake/catch resolution (resolveBoundaryCatch + applyBoundarySleepRoom)');

await check('a cold wake routes to the shaming path: severity 3 onset, the caught-tension spike on top, ledger outcome caught',
  api(`(() => {
    const h = sleepFixture(3000, 2, 'cold');
    const [r1] = residentsOf(h);
    const room = h.player.location;
    const c = resolveBoundaryCatch(h, 'sleep_with', r1, { location: room });
    if (c.woke !== true || c.tier !== 'cold' || c.reaction !== 'shame') return 'seed 3000 no longer wakes a cold target: ' + JSON.stringify(c);
    const before = h.npcs[r1].relPlayer?.tension ?? 0;
    const res = applyBoundarySleepRoom(h, 'sleep_with', r1, { location: room, initiatorId: 'player' });
    const cs = h.npcs[r1].flags?._coldShoulder;
    const ledger = h.player.ledger?.[r1]?.find(e => e.act === 'boundary_sleep_with');
    return res.outcome === 'caught' && cs?.severity === 3 && cs?.reason === 'caught_boundary'
      && +((h.npcs[r1].relPlayer?.tension ?? 0) - before).toFixed(3) === 0.33  // 0.25 shaming + 0.08 spike
      && ledger?.outcome === 'caught' && !!res.prose;
  })()`));

await check('an uncaught attempt settles in / watches, costs the player nothing bad, and leaves the ledger open (outcome null)',
  api(`(() => {
    const h = sleepFixture(4006, 2, 'cold');
    const [r1] = residentsOf(h);
    const room = h.player.location;
    const c = resolveBoundaryCatch(h, 'sleep_with', r1, { location: room });
    if (c.woke !== false) return 'seed 4006 no longer silent: ' + JSON.stringify(c);
    const res = applyBoundarySleepRoom(h, 'sleep_with', r1, { location: room, initiatorId: 'player' });
    const ledger = h.player.ledger?.[r1]?.find(e => e.act === 'boundary_sleep_with');
    return res.outcome === 'uncaught' && !h.npcs[r1].flags?._coldShoulder
      && (h.player.mood || 0) > 0 && (h.player.energy || 0) >= 100 - 92  // +8
      && ledger?.outcome === null;
  })()`));

await check('a warm wake never shames: the re-gate (awake proxy) decides reciprocate vs playful refusal, and ONLY an awake willing target ever completes the act',
  api(`(() => {
    // willing warm target -> reciprocate (a completed act)
    const h = sleepFixture(5001, 2, 'warmWilling');
    const [r1] = residentsOf(h);
    const room = h.player.location;
    const c = resolveBoundaryCatch(h, 'sleep_with', r1, { location: room });
    if (c.woke !== true || c.reaction !== 'reciprocate') return 'seed 5001 no longer reciprocates: ' + JSON.stringify(c);
    const res = applyBoundarySleepRoom(h, 'sleep_with', r1, { location: room, initiatorId: 'player' });
    const bed = Object.values(h.objects?.['room_' + room] || {}).find(o => o.defId === 'bed');
    const ledger = h.player.ledger?.[r1]?.find(e => e.act === 'boundary_sleep_with');
    const willingCompleted = res.outcome === 'reciprocated'
      && h.npcs[r1].clothing === 'undressed' && h.npcs[r1].activity === 'intimacy'
      && h.npcs[r1].flags?._intimacyHistory?.lastIntimateDay === h.meta.clock.day
      && bed?.state?.made === 'unmade' && ledger?.outcome === 'reciprocated';

    // unwilling warm target -> warm_refuse: playful deltas, NO cold-shoulder
    let refuse = null;
    for (let s = 6000; s < 6700 && !refuse; s++) {
      const h2 = sleepFixture(s, 2, 'warmRefuse');
      const [r2] = residentsOf(h2);
      const c2 = resolveBoundaryCatch(h2, 'sleep_with', r2, { location: h2.player.location });
      if (c2.woke === true && c2.reaction === 'warm_refuse') refuse = { s, h: h2, r: r2 };
    }
    if (!refuse) return 'no warm-refuse wake seed found in 6000..6699';
    const h3 = refuse.h; const r3 = refuse.r;
    const room3 = h3.player.location;
    const before3 = h3.npcs[r3].relPlayer;
    const res3 = applyBoundarySleepRoom(h3, 'sleep_with', r3, { location: room3, initiatorId: 'player' });
    const after3 = h3.npcs[r3].relPlayer;
    const refused = res3.outcome === 'warm_refuse'
      && !h3.npcs[r3].flags?._coldShoulder
      && +((after3.tension || 0) - (before3.tension || 0)).toFixed(3) === BOUNDARY.sleepRoom.warmRefuseDeltas.tension
      && +((after3.affection || 0) - (before3.affection || 0)).toFixed(3) === BOUNDARY.sleepRoom.warmRefuseDeltas.affection
      && !!res3.prose;
    return willingCompleted && refused;
  })()`));

await check('determinism: identical state in, identical outcome out (same seed, same state)',
  api(`(() => {
    const a = sleepFixture(3000, 2, 'cold');
    const b = sleepFixture(3000, 2, 'cold');
    const [ra] = residentsOf(a); const [rb] = residentsOf(b);
    const ca = applyBoundarySleepRoom(a, 'sleep_with', ra, { location: a.player.location, initiatorId: 'player' });
    const cb = applyBoundarySleepRoom(b, 'sleep_with', rb, { location: b.player.location, initiatorId: 'player' });
    return ca.outcome === cb.outcome && ca.prose === cb.prose
      && JSON.stringify(a.npcs[ra].flags._coldShoulder) === JSON.stringify(b.npcs[rb].flags._coldShoulder);
  })()`));

console.log('\n4. Three-way acts (throuple / cuck)');

await check('a completed throuple applies the full footprint: both partners undressed + intimacy-recorded + ledgered, castWeb warmed both ways, bed unmade',
  api(`(() => {
    const h = house(20260822, 2);
    const [r1, r2] = residentsOf(h);
    const room = h.player.location;
    warmTowardPlayer(h, r1); warmTowardPlayer(h, r2);
    h.npcs[r1].location = room; h.npcs[r2].location = room;
    const bed = Object.values(h.objects?.['room_' + room] || {}).find(o => o.defId === 'bed');
    const res = applyBoundaryThrouple(h, r1, r2, { location: room });
    const key = [r1, r2].sort().join('|');
    const dir = h.world.castWeb[key]?.axes?.[r1 + '→' + r2];
    const l1 = h.player.ledger?.[r1]?.find(e => e.act === 'throuple');
    const l2 = h.player.ledger?.[r2]?.find(e => e.act === 'throuple');
    return res.ok && res.config === 'throuple'
      && h.npcs[r1].clothing === 'undressed' && h.npcs[r2].clothing === 'undressed'
      && h.npcs[r1].flags?._intimacyHistory?.lastWith === r2 && h.npcs[r2].flags?._intimacyHistory?.lastWith === r1
      && !!l1 && !!l2 && l1.otherNpcId === r2 && l2.otherNpcId === r1
      && !!dir && dir.affection >= 0.05 && dir.comfort >= 0.04
      && bed?.state?.made === 'unmade';
  })()`));

await check('the cuck configuration is the SAME all-willing act named by a committed/seeing record between the two NPCs, with its own ledger/history labels',
  api(`(() => {
    const h = house(20260823, 2);
    const [r1, r2] = residentsOf(h);
    const room = h.player.location;
    warmTowardPlayer(h, r1); warmTowardPlayer(h, r2);
    h.npcs[r1].location = room; h.npcs[r2].location = room;
    const rec = getRelationship(h, r1, r2, true);
    rec.status = 'committed';
    const cfg = boundaryThreeWayConfig(h, r1, r2);
    const res = applyBoundaryThrouple(h, r1, r2, { location: room });
    const hist = (h.world.relationships[[r1, r2].sort().join('|')]?.history || []).filter(e => e.kind === 'throuple');
    const l1 = h.player.ledger?.[r1]?.find(e => e.act === 'cuck');
    return cfg === 'cuck' && res.config === 'cuck' && hist.length > 0 && !!l1;
  })()`));

await check('three-way infidelity: an NPC participant\'s committed record with an outsider is betrayed (cheater\'s memory fact + history \'cheat\'); the player among the others routes the wronged party\'s anger at the player (public-infidelity cold-shoulder)',
  api(`(() => {
    // absent wronged party: fact + history land, no jealousy (nothing to perceive)
    const h = house(20260824, 3);
    const [r1, r2, r3] = residentsOf(h);
    const room = h.player.location;
    warmTowardPlayer(h, r1); warmTowardPlayer(h, r2);
    h.npcs[r1].location = room; h.npcs[r2].location = room;
    const rec = getRelationship(h, r1, r3, true);
    rec.status = 'committed';
    h.npcs[r3].location = 'kitchen_a';
    applyBoundaryThrouple(h, r1, r2, { location: room });
    const cheaterMem = (h.npcs[r1].memory?.facts || []).some(m => (m.text || '').includes('slept with'));
    const hist = (h.world.relationships[[r1, r3].sort().join('|')]?.history || []).filter(e => e.kind === 'cheat');
    const absentOk = cheaterMem === true && hist.length === 1 && !h.npcs[r3].flags?._coldShoulder;

    // wronged party IN the act room: jealousy + cold-shoulder toward the player
    const h2 = house(20260825, 3);
    const [s1, s2, s3] = residentsOf(h2);
    const room2 = h2.player.location;
    warmTowardPlayer(h2, s1); warmTowardPlayer(h2, s2);
    h2.npcs[s1].location = room2; h2.npcs[s2].location = room2;
    const rec2 = getRelationship(h2, s1, s3, true);
    rec2.status = 'committed';
    h2.npcs[s3].location = room2;
    const res2 = applyBoundaryThrouple(h2, s1, s2, { location: room2 });
    const cs = h2.npcs[s3].flags?._coldShoulder;
    const perceivingOk = cs?.severity === COLD_SHOULDER.causeSeverity.public_infidelity
      && cs?.reason === 'public_infidelity' && !!h2.npcs[s3].flags?._jealousy && res2.events.length === 1;
    return absentOk && perceivingOk;
  })()`));

console.log('\n5. The NPC sneak_into_bed drive (symmetric initiation, D3/D13)');

await check('candidacy matrix: deviant + aroused + sleeping player behind an UNLOCKED adjacent door; blocked by low deviancy, awake player, locked door, or distance',
  api(`(() => {
    const deviant = (h, id, loc) => {
      h.npcs[id].bible.temperament.openness = 0.9;
      h.npcs[id].bible.temperament.assertiveness = 0.9;
      h.npcs[id].bible.temperament.conscientiousness = 0.2;
      h.npcs[id].needs = { ...(h.npcs[id].needs || {}), desire: 80 };
      h.npcs[id].location = loc;
    };
    const asleep = (h) => { h.player.flags = { ...(h.player.flags || {}), _vulnerableState: 'sleeping' }; };
    const ctxOf = (h, id) => ({ location: h.npcs[id].location, block: 'leisure', npcId: id, blockRoomId: h.npcs[id].location });
    // positive
    const h1 = house(20260901, 2);
    const [a] = residentsOf(h1); asleep(h1); deviant(h1, a, 'hallway_a');
    const pos = boundarySneakCandidacy(h1.npcs[a], a, h1, ctxOf(h1, a));
    // low deviancy
    const h2 = house(20260902, 2);
    const [b] = residentsOf(h2); asleep(h2);
    h2.npcs[b].bible.temperament.openness = 0.2; h2.npcs[b].bible.temperament.assertiveness = 0.2;
    h2.npcs[b].needs = { ...(h2.npcs[b].needs || {}), desire: 80 }; h2.npcs[b].location = 'hallway_a';
    const lowDev = boundarySneakCandidacy(h2.npcs[b], b, h2, ctxOf(h2, b));
    // player awake
    const h3 = house(20260903, 2);
    const [c] = residentsOf(h3); deviant(h3, c, 'hallway_a');
    const awake = boundarySneakCandidacy(h3.npcs[c], c, h3, ctxOf(h3, c));
    // locked door
    const h4 = house(20260904, 2);
    const [d] = residentsOf(h4); asleep(h4); deviant(h4, d, 'hallway_a');
    const pRoom = h4.player.location;
    const door = Object.values(h4.objects?.['room_' + pRoom] || {}).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
    if (door) door.state = { ...(door.state || {}), lock: 'locked' };
    const locked = boundarySneakCandidacy(h4.npcs[d], d, h4, ctxOf(h4, d));
    // non-adjacent
    const h5 = house(20260905, 2);
    const [e] = residentsOf(h5); asleep(h5); deviant(h5, e, 'kitchen_a');
    const far = boundarySneakCandidacy(h5.npcs[e], e, h5, ctxOf(h5, e));
    return pos === true && lowDev === false && awake === false && locked === false && far === false;
  })()`));

await check('cold-shouldering NPCs are excluded (COLD_SHOULDER.suppressedDrives) and the positive control opens the moment the flag clears',
  api(`(() => {
    const h = house(20260906, 2);
    const [r1] = residentsOf(h);
    h.player.flags = { ...(h.player.flags || {}), _vulnerableState: 'sleeping' };
    h.npcs[r1].bible.temperament.openness = 0.9; h.npcs[r1].bible.temperament.assertiveness = 0.9;
    h.npcs[r1].needs = { ...(h.npcs[r1].needs || {}), desire: 80 }; h.npcs[r1].location = 'hallway_a';
    const ctx = { location: 'hallway_a', block: 'leisure', npcId: r1, blockRoomId: 'hallway_a' };
    noteColdShoulder(h.npcs[r1], 2, h.meta.clock.day, 'caught_peep');
    const cold = isDriveCandidate('sneak_into_bed', DRIVE_DEFS['sneak_into_bed'], h.npcs[r1], h, ctx);
    delete h.npcs[r1].flags._coldShoulder;
    const open = isDriveCandidate('sneak_into_bed', DRIVE_DEFS['sneak_into_bed'], h.npcs[r1], h, ctx);
    return cold === false && open === true;
  })()`));

await check('the resolver: silent success leaves the NPC beside you, sated, an unmade bed, and NO event; a caught attempt lands relPlayer consequences + suspicion + a seen-by-player event; a locked/reawakened premise returns null',
  api(`(() => {
    const sneakState = (seed, cons) => {
      const h = house(seed, 2);
      const [r1] = residentsOf(h);
      h.player.flags = { ...(h.player.flags || {}), _vulnerableState: 'sleeping' };
      h.npcs[r1].bible.temperament.openness = 0.9; h.npcs[r1].bible.temperament.assertiveness = 0.9;
      h.npcs[r1].bible.temperament.conscientiousness = cons;
      h.npcs[r1].needs = { ...(h.npcs[r1].needs || {}), desire: 80 }; h.npcs[r1].location = 'hallway_a';
      return h;
    };
    let silent = null, caught = null;
    for (let s = 9000; s < 9600 && (!silent || !caught); s++) {
      const h = sneakState(s, 0.2);
      const [r1] = residentsOf(h);
      const res = trySneakIntoBed(h.npcs[r1], r1, { location: 'hallway_a' }, h);
      if (!res) continue;
      if (!silent && !res.caught) silent = { s, h };
      if (!caught && res.caught) caught = { s, h };
    }
    // silent
    const hs = silent.h; const [rs] = residentsOf(hs);
    const pRoom = hs.player.location;
    const bed = Object.values(hs.objects?.['room_' + pRoom] || {}).find(o => o.defId === 'bed');
    const before = hs.npcs[rs].relPlayer;
    const resS = trySneakIntoBed(hs.npcs[rs], rs, { location: 'hallway_a' }, hs);
    const after = hs.npcs[rs].relPlayer;
    const silentOk = resS.caught === false && resS.activityOverride === 'lying beside you'
      && resS.locationOverride === pRoom && resS.event === null
      && hs.npcs[rs].needs.desire === 80 + BOUNDARY.npcSneak.desireRelease
      && +((after.affection || 0) - (before.affection || 0)).toFixed(3) === BOUNDARY.npcSneak.relDeltas.affection
      && bed?.state?.made === 'unmade';
    // caught
    const hc = caught.h; const [rc] = residentsOf(hc);
    const beforeC = hc.npcs[rc].relPlayer;
    const resC = trySneakIntoBed(hc.npcs[rc], rc, { location: 'hallway_a' }, hc);
    const afterC = hc.npcs[rc].relPlayer;
    const caughtOk = resC.caught === true && resC.activityOverride === 'sneaking back out'
      && resC.locationOverride === hc.player.location
      && resC.event?.seenByPlayer === true && resC.event?.type === 'boundary'
      && +((afterC.tension || 0) - (beforeC.tension || 0)).toFixed(3) === BOUNDARY.npcSneak.caughtRelDeltas.tension
      && hc.npcs[rc].suspicion?.boundary_violation === BOUNDARY.npcSneak.caughtSuspicion;
    // locked premise -> null
    const hL = sneakState(9100, 0.2);
    const [rl] = residentsOf(hL);
    const pRoomL = hL.player.location;
    const doorL = Object.values(hL.objects?.['room_' + pRoomL] || {}).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
    if (doorL) doorL.state = { ...(doorL.state || {}), lock: 'locked' };
    const resL = trySneakIntoBed(hL.npcs[rl], rl, { location: 'hallway_a' }, hL);
    return silentOk && caughtOk && resL === null;
  })()`));

console.log('\n6. Codex labels (Phase 15 ledger surface)');

await check('the boundary ledger acts have codex labels',
  api(`(() => {
    return codexActLabel('boundary_sleep_with') === 'climbed into bed with'
      && codexActLabel('boundary_watch_sleeper') === 'watched while they slept'
      && codexActLabel('throuple') === 'had a threesome with'
      && codexActLabel('cuck') === 'had a threesome with';
  })()`));

console.log('\n7. Save/load round-trip through the REAL writeGeneratedGameState/loadGameState (in-memory kv, meta pre-seeded)');

await check('G.1 — a caught boundary act (cold-shoulder + ledger outcome caught) and a reciprocated act (undressed + bed unmade) survive the round-trip',
  api(`(async () => {
    root.kv = makeMemKv();
    await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt17', clock: { day: 1, minutes: 0 } });
    const h = house(20260817, 3);
    const [r1, , r3] = residentsOf(h);
    // caught cold act
    const room1 = h.npcs[r1].residency.room;
    h.player.location = room1; h.npcs[r1].location = room1; h.npcs[r1].activity = 'sleeping';
    h.meta.seed = 3000;
    applyBoundarySleepRoom(h, 'sleep_with', r1, { location: room1, initiatorId: 'player' });
    // reciprocated warm act
    const room3 = h.npcs[r3].residency.room;
    h.player.location = room3; h.npcs[r3].location = room3; h.npcs[r3].activity = 'sleeping';
    warmTowardPlayer(h, r3);
    h.meta.seed = 5000;
    const r3res = applyBoundarySleepRoom(h, 'sleep_with', r3, { location: room3, initiatorId: 'player' });
    if (r3res.outcome !== 'reciprocated') return 'seed 5000 no longer reciprocates r3 of a 3-house: ' + r3res.outcome;
    const expectedCs = JSON.stringify(h.npcs[r1].flags._coldShoulder);
    const expectedLedger = JSON.stringify(h.player.ledger);
    await writeGeneratedGameState(h);
    await forceFlush();
    const loaded = await loadGameState();
    return JSON.stringify(loaded.npcs[r1].flags?._coldShoulder) === expectedCs
      && loaded.npcs[r1].flags?._coldShoulder?.reason === 'caught_boundary'
      && JSON.stringify(loaded.player.ledger) === expectedLedger
      && loaded.player.ledger?.[r1]?.some(e => e.act === 'boundary_sleep_with' && e.outcome === 'caught')
      && loaded.player.ledger?.[r3]?.some(e => e.act === 'boundary_sleep_with' && e.outcome === 'reciprocated')
      && loaded.npcs[r3].clothing === 'undressed'
      && Object.values(loaded.objects?.['room_' + room3] || {}).find(o => o.defId === 'bed')?.state?.made === 'unmade';
  })()`));

await check('G.2 — the round trip is deterministic (identical output for identical input)',
  api(`(async () => {
    async function trip(seed) {
      root.kv = makeMemKv();
      await root.kv.meta.set('meta', { versions: { ...FOLDER_VERSIONS }, seed: 'rt17d', clock: { day: 1, minutes: 0 } });
      const h = house(seed, 2);
      const [r1] = residentsOf(h);
      const room = h.npcs[r1].residency.room;
      h.player.location = room; h.npcs[r1].location = room; h.npcs[r1].activity = 'sleeping';
      h.meta.seed = 3000;
      applyBoundarySleepRoom(h, 'sleep_with', r1, { location: room, initiatorId: 'player' });
      await writeGeneratedGameState(h);
      return await loadGameState();
    }
    const a = await trip(20260826); const b = await trip(20260826);
    const keyA = Object.keys(a.npcs).find(id => a.npcs[id].flags?._coldShoulder);
    return JSON.stringify(a.npcs[keyA].flags._coldShoulder) === JSON.stringify(b.npcs[keyA].flags._coldShoulder);
  })()`));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
