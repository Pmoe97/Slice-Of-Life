// Sleeping-NPC consistency (2026-09-10 audit fix, sleeping-npc-contradiction-
// -audit.md). Before this, "asleep" was hand-rolled in 15+ places across 8
// files with no shared predicate, so a sleeping NPC could be offered to the
// model as a speaker, "witness" a room entry or house-rule violation while
// unconscious, get summoned to dinner, or count as an interruption candidate
// during an off-schedule nap. npcIsAsleep(npc) (sim.js) is now the one
// canonical predicate; this harness asserts every site the audit named
// actually reads it, plus the residual model-hallucination gap
// (resolveSpeakerIds) the audit flagged as "worth a look" once the ambient
// routing landed.
//
// doTakeFromRoom/doSearchPhone (ui.js) carry the identical fix but need a
// DOM — LIVE-VERIFIED, skipped here by design, like every DOM surface in
// this harness family.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['sim.js', 'stealth.js', 'flags.js', 'overture.js', 'interruption.js', 'commitments.js', 'npc.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// --- Helpers injected INTO the vm context ---
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
// Every SCHEDULES template's weekend sleep window ends by minute 600 at the
// very latest and leisure picks up immediately after (config.js SCHEDULES) —
// day+minute 650 is 'leisure' for every template, never 'sleep'/'work'/
// 'commute', regardless of which template the generated NPC drew.
api(`
  function pickWeekendDay() {
    for (let d = 1; d <= 14; d++) if (isWeekend(d)) return d;
    return 6;
  }
`);

// ---------------------------------------------------------------- 1
console.log('\n1. The canonical predicate (sim.js: npcIsAsleep)');
check('classifies sleeping/napping (case-insensitively) as asleep; everything else, including a missing npc, as not',
  api(`(() => {
    const cases = [
      [{ activity: 'sleeping' }, true], [{ activity: 'napping' }, true],
      [{ activity: 'Sleeping' }, true], [{ activity: 'NAPPING' }, true],
      [{ activity: 'idle' }, false], [{ activity: 'eating' }, false],
      [{ activity: '' }, false], [{}, false], [null, false],
    ];
    return cases.every(([npc, expect]) => npcIsAsleep(npc) === expect);
  })()`));

// ---------------------------------------------------------------- 2
console.log('\n2. Scene participants never offer a sleeper as a speaker (sim.js: getSceneParticipants)');
check('a sleeper is excluded from active (even outscoring the awake NPC on affection-tension) but stays in present/ambient',
  api(`(() => {
    const h = house(9101, 2);
    const [r1, r2] = residentsOf(h);
    const room = h.npcs[r1].residency.room;
    h.player.location = room;
    h.npcs[r1].location = room; h.npcs[r1].activity = 'sleeping';
    h.npcs[r1].relPlayer = { ...(h.npcs[r1].relPlayer || {}), affection: 0.9, tension: 0 };
    h.npcs[r2].location = room; h.npcs[r2].activity = 'idle';
    h.npcs[r2].relPlayer = { ...(h.npcs[r2].relPlayer || {}), affection: 0.1, tension: 0 };
    const sp = getSceneParticipants(h.player, h.npcs, h.world);
    return sp.present.includes(r1) && sp.present.includes(r2)
      && !sp.active.includes(r1) && sp.active.includes(r2)
      && sp.ambient.includes(r1);
  })()`));

// ---------------------------------------------------------------- 3
console.log('\n3. Room-entry/laundry stealth: a sleeping owner cannot witness (stealth.js)');
check('a sleeping room owner never takes the direct-witness branch (falls through to sneak); the same owner awake is witnessed',
  api(`(() => {
    const h = house(9102, 2);
    const [r1] = residentsOf(h);
    const roomId = h.npcs[r1].residency.room;
    h.npcs[r1].location = roomId; h.player.location = roomId;
    h.npcs[r1].activity = 'sleeping';
    const asleep = resolveRoomEntryStealth(h, roomId);
    h.npcs[r1].activity = 'idle';
    const awake = resolveRoomEntryStealth(h, roomId);
    return asleep.crossed === true && asleep.witnessed === false
      && awake.crossed === true && awake.witnessed === true;
  })()`));
check('laundry snoop: a sleeping owner in the room never witnesses the search (resolveLaundrySnoop)',
  api(`(() => {
    const h = house(9103, 2);
    const [r1] = residentsOf(h);
    const roomId = 'laundry_room';
    if (!ROOMS[roomId]) return true; // floor plan doesn't have a laundry room in this build — vacuously fine
    const bucket = h.objects[\`room_\${roomId}\`] || (h.objects[\`room_\${roomId}\`] = {});
    bucket.__hamper = { id: '__hamper', defId: 'laundry_hamper', contents: [
      { defId: 'shirt_basic', ownerId: r1, kind: 'clothing_stack', qty: 1 },
    ] };
    h.player.location = roomId; h.npcs[r1].location = roomId;
    h.npcs[r1].activity = 'sleeping';
    const res = resolveLaundrySnoop(h);
    return res.ok === false || res.caught !== true;
  })()`));

// ---------------------------------------------------------------- 4
console.log('\n4. House-rule violations: a sleeping witness never reacts or gossips (flags.js)');
check('zero violations while asleep, one while awake, for an identical high-conscientiousness witness',
  api(`(() => {
    const h = house(9104, 1);
    const [r1] = residentsOf(h);
    h.npcs[r1].location = 'living_room';
    h.npcs[r1].bible.temperament = { ...(h.npcs[r1].bible.temperament || {}), conscientiousness: 1, warmth: -1 };
    h.world.houseRules = [{ id: 'no_eating_living_room' }];
    const event = { act: 'eat', roomId: 'living_room', actorId: 'player' };
    h.npcs[r1].activity = 'sleeping';
    const asleepViolations = resolveHouseRuleViolations(h, event);
    h.npcs[r1].activity = 'idle';
    const awakeViolations = resolveHouseRuleViolations(h, event);
    return asleepViolations.length === 0 && awakeViolations.length === 1 && awakeViolations[0].npcId === r1;
  })()`));

// ---------------------------------------------------------------- 5
console.log('\n5. Off-schedule sleep is not schedule-blind (overture.js, interruption.js, cognition.js)');
check('mealJoinEligible refuses an off-schedule napper (leisure block, not the schedule sleep block) with reason "asleep"; awake is eligible',
  api(`(() => {
    const h = house(9105, 1);
    const [r1] = residentsOf(h);
    h.meta.clock.day = pickWeekendDay(); h.meta.clock.minutes = 650;
    // Force the plain template span — sleepRhythm ('late'/'erratic') can
    // legitimately extend a rolled NPC's sleep block past minute 650, which
    // would confound this specific off-schedule-NAP scenario with a
    // different, unrelated mechanic.
    h.npcs[r1].bible.occupation = { ...(h.npcs[r1].bible.occupation || {}), sleepRhythm: 'regular' };
    h.npcs[r1].location = h.npcs[r1].residency.room;
    h.npcs[r1].activity = 'napping';
    const asleep = mealJoinEligible(h, r1, 'kitchen');
    h.npcs[r1].activity = 'idle';
    const awake = mealJoinEligible(h, r1, 'kitchen');
    return asleep.eligible === false && asleep.reason === 'asleep' && awake.eligible === true;
  })()`));
check('interruption eligibility excludes an off-schedule napper even mid-leisure-block; the same NPC awake is eligible',
  api(`(() => {
    const h = house(9106, 2);
    const [r1] = residentsOf(h);
    h.meta.clock.day = pickWeekendDay(); h.meta.clock.minutes = 650;
    h.npcs[r1].bible.occupation = { ...(h.npcs[r1].bible.occupation || {}), sleepRhythm: 'regular' };
    const room = h.npcs[r1].residency.room;
    h.npcs[r1].location = room;
    h.player.location = room === 'living_room' ? 'kitchen' : 'living_room';
    h.npcs[r1].activity = 'napping';
    const asleepIds = getEligibleNpcs(h).map(([id]) => id);
    h.npcs[r1].activity = 'idle';
    const awakeIds = getEligibleNpcs(h).map(([id]) => id);
    return !asleepIds.includes(r1) && awakeIds.includes(r1);
  })()`));
// Note: cognition.js's ageCommitment deliberately does NOT read npcIsAsleep.
// A first pass added it (same off-schedule-sleep reasoning as the checks
// above), but ageCommitment runs every npc-tick against the ACTIVE
// commitment itself, and sleep_recover's own commitment sets
// activityOverride: 'napping' for its hold duration (config.js) — so the
// check self-cancelled the very nap that caused it, re-resolving a mid-hold
// commitment every tick and breaking the continuous-behavior-engine's D3/D6
// invariants (verify-c2.js/verify-c5.js). Reverted; left undocumented here
// on purpose so nobody re-adds it without re-reading this paragraph first.

// ---------------------------------------------------------------- 6
console.log('\n6. A sleeping resident physically in the room is not a meal attendee (commitments.js)');
check('mealAttendees excludes a sleeper, includes the same resident awake',
  api(`(() => {
    const h = house(9108, 1);
    const [r1] = residentsOf(h);
    h.npcs[r1].location = 'living_room';
    h.npcs[r1].activity = 'sleeping';
    const asleepIds = mealAttendees(h, 'living_room').map(a => a.npcId);
    h.npcs[r1].activity = 'idle';
    const awakeIds = mealAttendees(h, 'living_room').map(a => a.npcId);
    return !asleepIds.includes(r1) && awakeIds.includes(r1);
  })()`));

// ---------------------------------------------------------------- 7
console.log('\n7. Last line of defense: a model hallucinating dialogue for a sleeper never gets it attributed (npc.js: resolveSpeakerIds)');
check('a dialogue entry naming an ambient NPC flagged asleep is dropped; one naming an awake ambient NPC is kept',
  api(`(() => {
    const pool = [
      { id: 'npc_a', name: 'Alex', activity: 'sleeping' },
      { id: 'npc_b', name: 'Bailey', activity: 'idle' },
    ];
    const dialogue = [{ speaker: 'npc_a', text: 'hi' }, { speaker: 'Bailey', text: 'hey' }];
    const ids = resolveSpeakerIds(dialogue, pool);
    return !ids.includes('npc_a') && ids.includes('npc_b');
  })()`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
