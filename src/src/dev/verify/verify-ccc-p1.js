// continuous-cadence-closure-plan.md — Phase 1: Scene presence reconciliation
// & departure integrity (D1-D2).
//
//   node src/src/dev/verify/verify-ccc-p1.js
//
// Node coverage for the pure building blocks this phase's bug fix rests on:
// removeFromScene (npc.js, new) vs. demoteToAmbient's unchanged regression
// behavior, and reconcileScenePresence's (llm.js, pre-existing) filter/keep
// shape. `conversationPartnerPresent` and `doTalk`'s new presence gate both
// live in ui.js, which loadgame.js's own ORDER array deliberately excludes
// (it's not DOM-guardable at the function-body level the way image.js/
// studio.js are — too much of it assumes a real document) — that half of
// this phase, and the actual end-to-end fix (a stale cutout/chip clearing
// itself mid-idle, a stale "Talk to X" click refusing instead of opening a
// conversation), is presentation-layer and was live-verified in
// dev-harness.html per the plan's own Handoff note (invariant 7's split:
// pure logic here, presentation live).
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'npc.js', 'cognition.js', 'movement.js', 'llm.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260902, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __scene = (activeIds, ambientIds) => ({
    present: [...activeIds, ...ambientIds],
    active: [...activeIds],
    ambient: [...ambientIds],
    engagement: Object.fromEntries(activeIds.map(id => [id, 2])),
  });
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — removeFromScene exists alongside demoteToAmbient; reconcileScenePresence is real');
const reg = J(`({
  removeFromScene: typeof removeFromScene === 'function',
  demoteToAmbient: typeof demoteToAmbient === 'function',
  reconcileScenePresence: typeof reconcileScenePresence === 'function',
})`);
check('all three functions are real', Object.values(reg).every(Boolean), JSON.stringify(reg));

// ---------------------------------------------------------------- 1
console.log('\n1. removeFromScene — drops from present/active/ambient/engagement all at once');
const g1 = J(`(() => {
  const ids = __ids(__mk(1));
  const [a, b, c] = ids;
  const scene = __scene([a, b], [c]);
  const removedActive = removeFromScene(scene, a);
  const removedAmbient = removeFromScene(scene, c);
  return {
    removedActive,
    activeGoneFromPresent: !removedActive.present.includes(a),
    activeGoneFromActive: !removedActive.active.includes(a),
    activeEngagementGone: !(a in removedActive.engagement),
    otherActiveUntouched: removedActive.active.includes(b),
    removedAmbient,
    ambientGoneFromPresent: !removedAmbient.present.includes(c),
    ambientGoneFromAmbient: !removedAmbient.ambient.includes(c),
  };
})()`);
check('removing an ACTIVE npc drops them from present, active, AND engagement', g1.activeGoneFromPresent && g1.activeGoneFromActive && g1.activeEngagementGone, JSON.stringify(g1.removedActive));
check('a different active npc is untouched', g1.otherActiveUntouched);
check('removing an AMBIENT npc drops them from present and ambient too (the actual bug this phase fixes — demoteToAmbient alone never did this)', g1.ambientGoneFromPresent && g1.ambientGoneFromAmbient, JSON.stringify(g1.removedAmbient));

// ---------------------------------------------------------------- 2
console.log('\n2. demoteToAmbient — UNCHANGED regression check: still only re-tiers within active/ambient, never touches present');
const g2 = J(`(() => {
  const ids = __ids(__mk(2));
  const [a] = ids;
  const scene = __scene([a], []);
  const demoted = demoteToAmbient(scene, a);
  return {
    demoted,
    stillInPresent: demoted.present.includes(a),
    movedToAmbient: demoted.ambient.includes(a),
    goneFromActive: !demoted.active.includes(a),
  };
})()`);
check("demoteToAmbient leaves 'present' untouched (it's re-tiering, not removal) — this is the legitimate doStepAway/doConvLeave shape, unchanged by this phase", g2.stillInPresent && g2.movedToAmbient && g2.goneFromActive, JSON.stringify(g2.demoted));

// ---------------------------------------------------------------- 3
console.log('\n3. reconcileScenePresence — filters by live co-location, preserves engagement (the exact filter this phase now calls from advanceAndResolve/doTalk)');
const g3 = J(`(() => {
  const g = __mk(3);
  const ids = __ids(g);
  const [here, elsewhere] = ids;
  g.npcs[here].location = 'living_room';
  g.npcs[elsewhere].location = 'kitchen';
  const scene = __scene([here, elsewhere], []);
  const reconciled = reconcileScenePresence(scene, g);
  return {
    reconciled,
    hereKept: reconciled.active.includes(here),
    elsewhereDropped: !reconciled.active.includes(elsewhere),
    engagementForHereKept: reconciled.engagement[here] === 2,
  };
})()`);
check('an npc still co-located with the player is kept, with engagement intact', g3.hereKept && g3.engagementForHereKept, JSON.stringify(g3.reconciled));
check('an npc who relocated elsewhere is dropped from active', g3.elsewhereDropped, JSON.stringify(g3.reconciled));

// conversationPartnerPresent and doTalk's new presence gate (ui.js) are not
// testable here — ui.js isn't in loadgame.js's ORDER array at all (see the
// file header). Live-verified in dev-harness.html instead: see the plan's
// Handoff note for the exact steps (a stale "Talk to X" chip refused with
// "X isn't here." instead of opening the overlay, and a ghost cutout
// clearing itself mid-idle with no player action).

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
