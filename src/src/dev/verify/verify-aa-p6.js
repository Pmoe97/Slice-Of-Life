// Actions & Activities Overhaul plan (actions-and-activities-overhaul-plan.md)
// — Phase 6: Follow (D11).
//
//   node src/src/dev/verify/verify-aa-p6.js
//
// Node coverage for everything pure/trusted-producer in this phase: the
// ASK_FOLLOW leaf's registration/decide/postEffects (asks.js), the room-by-
// room follower relocation + privacy-room release (movement.js's
// advanceFollowers), and sim.js's Pass 1 per-tick backstop + sleep/off-site
// release + Pass 3 drive-scoring skip. Presentation (doMove's room-crossing
// call into advanceFollowers, doTalk's conversation release, doStopFollowing,
// the render.js chip) is UI and is verified on the live page per invariant 7
// — see the Handoff note for what was checked there. This harness only
// proves what a Node vm can prove.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'effects.js', 'npc.js', 'movement.js', 'cognition.js', 'asks.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260901, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __warm = (npc) => { npc.relPlayer = { ...(npc.relPlayer || {}), affection: 5, tension: 0, trust: 5, mood: 0 }; return npc; };
  __cool = (npc) => { npc.relPlayer = { ...(npc.relPlayer || {}), affection: -2, tension: 0.3, trust: 1 }; npc.mood = 0; return npc; };
  // A weekday daytime/leisure minute — deliberately NOT sleep, NOT an
  // off-site work boundary — for tests that want the schedule out of the way.
  __leisureMinute = (g, npcId) => {
    for (let m = 0; m < 1440; m += CLOCK.tickMinutes) {
      const clock = { day: g.meta.clock.day, minutes: m };
      const r = resolveScheduleActivity(g.npcs[npcId], clock, g, npcId);
      if (r.block !== 'sleep' && r.block !== 'work' && r.block !== 'commute' && r.block !== 'commute_home') return m;
    }
    return null;
  };
  __sleepMinute = (g, npcId) => {
    for (let m = 0; m < 1440; m += CLOCK.tickMinutes) {
      const clock = { day: g.meta.clock.day, minutes: m };
      const r = resolveScheduleActivity(g.npcs[npcId], clock, g, npcId);
      if (r.block === 'sleep') return m;
    }
    return null;
  };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — ASK_FOLLOW is a real ASK_CATEGORIES/ASK_TYPES entry');
const reg = J(`({
  categoryIds: ASK_CATEGORIES.map(c => c.id),
  followChildren: (ASK_CATEGORIES.find(c => c.id === 'follow') || { children: [] }).children.map(l => l.id),
  hasFollow: !!ASK_TYPES.FollowMe,
  followCategory: ASK_TYPES.FollowMe && ASK_TYPES.FollowMe.category,
  hasAdvanceFollowers: typeof advanceFollowers === 'function',
})`);
// Phase 17 (D27) later extends this SAME category with its own ShowAround
// leaf (verify-aa-p17.js), so this only asserts FollowMe is still IN there,
// not that it's the category's only member.
check('a "follow" category exists holding FollowMe', reg.followChildren.includes('FollowMe'));
check('ASK_TYPES carries FollowMe', reg.hasFollow);
check("FollowMe's own category is 'follow'", reg.followCategory === 'follow');
check('advanceFollowers is a real function (movement.js)', reg.hasAdvanceFollowers);

// ---------------------------------------------------------------- 1
console.log('\n1. decide() — affection-scored accept/decline, flavor-blind (D1), byte-identical formula to ASK_HANGOUT');
const g1 = J(`(() => {
  const g = __mk(1);
  const ids = __ids(g);
  const warmId = ids[0], coolId = ids[1];
  __warm(g.npcs[warmId]);
  __cool(g.npcs[coolId]);
  const warmBare = resolveAsk(g, warmId, 'FollowMe', '', {});
  const warmWorded = resolveAsk(g, warmId, 'FollowMe', 'to the kitchen, right now', {});
  const coolResult = resolveAsk(g, coolId, 'FollowMe', '', {});
  return {
    warmAccept: warmBare.decision.accept, warmReason: warmBare.decision.reason,
    wordedAccept: warmWorded.decision.accept,
    coolAccept: coolResult.decision.accept, coolReason: coolResult.decision.reason,
  };
})()`);
check('a warm NPC accepts FollowMe', g1.warmAccept === true && g1.warmReason === 'accept');
check('flavor text never moves the verdict (D1)', g1.wordedAccept === g1.warmAccept);
check('a cool (tense) NPC declines', g1.coolAccept === false && g1.coolReason === 'cool');

// ---------------------------------------------------------------- 2
console.log('\n2. available() — blocks re-asking an already-following NPC and a sleeping/napping one');
const g2 = J(`(() => {
  const g = __mk(2);
  const ids = __ids(g);
  const alreadyId = ids[0], sleepingId = ids[1], nappingId = ids[2];
  g.npcs[alreadyId].follow = { leader: 'player', sinceDay: g.meta.clock.day };
  g.npcs[sleepingId].activity = 'sleeping';
  g.npcs[nappingId].activity = 'napping';
  return {
    already: ASK_TYPES.FollowMe.available(g, g.npcs[alreadyId]),
    sleeping: ASK_TYPES.FollowMe.available(g, g.npcs[sleepingId]),
    napping: ASK_TYPES.FollowMe.available(g, g.npcs[nappingId]),
  };
})()`);
check('already-following NPC is unavailable (no double-book)', g2.already === false);
check('a sleeping NPC is unavailable', g2.sleeping === false);
check('a napping NPC is unavailable', g2.napping === false);

// ---------------------------------------------------------------- 3
console.log('\n3. postEffects — accept CREATES npc.follow; decline writes nothing');
const g3 = J(`(() => {
  const g = __mk(3);
  const ids = __ids(g);
  const warmId = ids[0], coolId = ids[1];
  __warm(g.npcs[warmId]);
  __cool(g.npcs[coolId]);
  g.meta.clock.day = 7;
  const accepted = resolveAsk(g, warmId, 'FollowMe', '', {});
  accepted.applyEffects();
  const declined = resolveAsk(g, coolId, 'FollowMe', '', {});
  declined.applyEffects();
  return {
    acceptFollow: g.npcs[warmId].follow || null,
    declineFollow: g.npcs[coolId].follow || null,
  };
})()`);
check('accept sets npc.follow = { leader: "player", sinceDay }', g3.acceptFollow && g3.acceptFollow.leader === 'player' && g3.acceptFollow.sinceDay === 7, `got ${JSON.stringify(g3.acceptFollow)}`);
check('decline writes no follow record', g3.declineFollow === null);

// ---------------------------------------------------------------- 4
console.log('\n4. advanceFollowers — room-by-room relocation, in lockstep with the leader');
const g4 = J(`(() => {
  const g = __mk(4);
  const ids = __ids(g);
  const followerId = ids[0], bystanderId = ids[1];
  g.npcs[followerId].location = 'living_room';
  g.npcs[followerId].follow = { leader: 'player', sinceDay: 1 };
  g.npcs[bystanderId].location = 'living_room';
  const released = advanceFollowers(g, 'player', 'living_room', ['hallway_a', 'kitchen']);
  return {
    released,
    followerLocation: g.npcs[followerId].location,
    followerStillFollowing: !!g.npcs[followerId].follow,
    bystanderLocation: g.npcs[bystanderId].location,
  };
})()`);
check('the follower lands at the final room in the sequence', g4.followerLocation === 'kitchen', `got ${g4.followerLocation}`);
check('no release when nothing on the route is a privacy room', g4.released.length === 0 && g4.followerStillFollowing === true);
check('a non-follower in the same starting room is left untouched', g4.bystanderLocation === 'living_room');

// ---------------------------------------------------------------- 5
console.log('\n5. advanceFollowers — a privacy room (bathroom or the follower’s own bedroom) ends the trip and releases');
const g5 = J(`(() => {
  // Two separate houses — advanceFollowers walks EVERY follower of the
  // leader present in fromRoom in one call, so testing two followers'
  // outcomes independently needs them not to be co-present for either call.
  const gBath = __mk(50);
  const bathId = __ids(gBath)[0];
  gBath.npcs[bathId].location = 'living_room';
  gBath.npcs[bathId].follow = { leader: 'player', sinceDay: 1 };
  const bathRoute = advanceFollowers(gBath, 'player', 'living_room', ['hallway_a', 'bathroom_a', 'hallway_a']);

  const gBed = __mk(51);
  const ownBedId = __ids(gBed)[0];
  gBed.npcs[ownBedId].location = 'living_room';
  gBed.npcs[ownBedId].follow = { leader: 'player', sinceDay: 1 };
  const ownBedRoom = gBed.npcs[ownBedId].residency.room;
  const bedRoute = advanceFollowers(gBed, 'player', 'living_room', ['hallway_a', ownBedRoom]);

  return {
    bathReleased: bathRoute, bathLocation: gBath.npcs[bathId].location, bathFollowGone: !gBath.npcs[bathId].follow,
    bedReleased: bedRoute, bedLocation: gBed.npcs[ownBedId].location, bedFollowGone: !gBed.npcs[ownBedId].follow,
  };
})()`);
check('balking at a bathroom stops one room short and releases', g5.bathReleased.length === 1 && g5.bathLocation === 'hallway_a' && g5.bathFollowGone, `got ${JSON.stringify(g5)}`);
check("balking at the follower's OWN bedroom stops one room short and releases", g5.bedReleased.length === 1 && g5.bedLocation === 'hallway_a' && g5.bedFollowGone, `got ${JSON.stringify(g5)}`);

// ---------------------------------------------------------------- 6
console.log('\n6. sim.js Pass 1 — the per-tick backstop: a following NPC’s location is re-affirmed to the leader’s every checkpoint');
const g6 = J(`(() => {
  const g = __mk(6);
  const ids = __ids(g);
  const followerId = ids[0];
  const minute = __leisureMinute(g, followerId);
  g.meta.clock.minutes = minute;
  g.npcs[followerId].follow = { leader: 'player', sinceDay: g.meta.clock.day };
  // Displace the follower to a DIFFERENT room than the player's — only the
  // tick's own re-affirmation (not advanceFollowers, which is never called
  // here) can put them back at the player's side.
  g.npcs[followerId].location = 'kitchen';
  const after = resolveBatch(g, 1).state;
  return {
    location: after.npcs[followerId].location,
    playerLocation: after.player.location,
    activity: after.npcs[followerId].activity,
    stillFollowing: !!after.npcs[followerId].follow,
  };
})()`);
check("a following NPC's location snaps back to the leader's on the very next checkpoint", g6.location === g6.playerLocation, `got ${JSON.stringify(g6)}`);
check("activity reads 'following'", g6.activity === 'following');
check('the relationship survives an ordinary (non-sleep, non-work) tick', g6.stillFollowing === true);

// ---------------------------------------------------------------- 7
console.log('\n7. sim.js Pass 3 — following pre-empts drive-scoring: no new commitment opens while glued to the leader');
const g7 = J(`(() => {
  const g = __mk(7);
  const ids = __ids(g);
  const followerId = ids[0];
  const minute = __leisureMinute(g, followerId);
  g.meta.clock.minutes = minute;
  __warm(g.npcs[followerId]);
  g.npcs[followerId].follow = { leader: 'player', sinceDay: g.meta.clock.day };
  let state = g;
  let commitmentEverOpened = false;
  for (let t = 0; t < 8; t++) {
    state = resolveBatch(state, 1).state;
    if (state.npcs[followerId].commitment) commitmentEverOpened = true;
  }
  return {
    commitmentEverOpened,
    finalActivity: state.npcs[followerId].activity,
    finalLocation: state.npcs[followerId].location,
    finalPlayerLocation: state.player.location,
  };
})()`);
check('no commitment ever opens across 8 ticks of following', g7.commitmentEverOpened === false);
check('the follower is still glued to the (stationary) leader at the end', g7.finalLocation === g7.finalPlayerLocation && g7.finalActivity === 'following', `got ${JSON.stringify(g7)}`);

// ---------------------------------------------------------------- 8
console.log('\n8. sim.js Pass 1 — sleep and off-site work end the relationship instead of overriding it');
const g8 = J(`(() => {
  const g = __mk(8);
  const ids = __ids(g);
  const followerId = ids[0];
  const sleepMinute = __sleepMinute(g, followerId);
  g.meta.clock.minutes = sleepMinute;
  g.npcs[followerId].follow = { leader: 'player', sinceDay: g.meta.clock.day };
  const after = resolveBatch(g, 1).state;
  return {
    hadSleepMinute: sleepMinute !== null,
    followGone: !after.npcs[followerId].follow,
    location: after.npcs[followerId].location,
    residencyRoom: after.npcs[followerId].residency.room,
  };
})()`);
check('a sleep-block tick was actually found for this NPC (test is real, not vacuous)', g8.hadSleepMinute === true);
check("sleep releases the follow relationship rather than dragging the sleeper to the player's room", g8.followGone === true, `got ${JSON.stringify(g8)}`);
check('the NPC falls through to ordinary sleep placement (their own bed), not the leader’s room', g8.location === g8.residencyRoom, `got ${JSON.stringify(g8)}`);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
