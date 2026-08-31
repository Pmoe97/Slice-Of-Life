// Intimacy & Voyeurism Plan Phase 2 — Fog-of-war floor plan (D10).
// The floor plan is never omniscient: every map surface is fogged by
// derivePlausibleActivity, the ONE derivation every activity caption reads.
//   same room          → full tier (the raw activity string — you can see them)
//   other room, locked → 'inside' — never the granular act
//   other room         → coarse: a signal-driven caption, or a
//                        familiarity-gated routine guess
//   otherwise          → null — the avatar alone says they are there
// PURE (RI2/RI3): reads state, writes nothing, calls no model.
//
// Nothing here reimplements the math: the engine loads into a bare vm and
// the assertions read what the real function returns. RENDER's
// renderFloorPlan / renderFloorPlanLive (the fog RASTERIZER + DOM surface)
// are LIVE-VERIFIED and skipped here by design — this harness proves the
// derivation every floor-plan caption reads.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['signals.js', 'world.js', 'scene.js', 'defs.actions.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

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
    h.world.signals = [];
    return h;
  }
`);

// ---------------------------------------------------------------- 1
console.log('\n1. Purity — the derivation writes nothing and is deterministic');
check('derivePlausibleActivity is pure: repeated calls are byte-identical and state is unchanged',
      api(`(() => {
        const h = house(20260821, 2);
        const [id] = Object.keys(h.npcs);
        h.npcs[id].relPlayer = { comfort: 0.5, affection: 0.1, conversationPhase: 'acquaintance' };
        h.npcs[id].activity = 'cooking';
        h.npcs[id].location = 'living_room';
        h.player.location = 'bedroom_1';
        const before = JSON.stringify(h);
        const a = derivePlausibleActivity(h, id, 'bedroom_1');
        const b = derivePlausibleActivity(h, id, 'bedroom_1');
        return JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(h) === before;
      })()`));

// ---------------------------------------------------------------- 2
console.log('\n2. The tiers');
check('same room → FULL tier, the raw activity string',
      api(`(() => {
        const h = house(20260821, 2);
        const [id] = Object.keys(h.npcs);
        h.npcs[id].activity = 'reading in bed';
        h.npcs[id].location = 'bedroom_1';
        h.player.location = 'bedroom_1';
        const d = derivePlausibleActivity(h, id, 'bedroom_1');
        return !!d && d.tier === 'full' && d.label === 'reading in bed';
      })()`));
check('other room + familiarity → COARSE tier via the activity map; an unknown activity → null',
      api(`(() => {
        const h = house(20260821, 2);
        const [id] = Object.keys(h.npcs);
        const npc = h.npcs[id];
        npc.relPlayer = { comfort: 0.5 };
        npc.location = 'living_room';
        h.player.location = 'bedroom_1';
        npc.activity = 'watching TV';
        const mapped = derivePlausibleActivity(h, id, 'bedroom_1');
        npc.activity = 'quantum weaving';
        const unknown = derivePlausibleActivity(h, id, 'bedroom_1');
        return !!mapped && mapped.tier === 'coarse' && mapped.label === 'watching TV' && unknown === null;
      })()`));
check('other room + a perceived signal → COARSE tier via the signal map, with no familiarity',
      api(`(() => {
        const h = house(20260821, 2);
        const [id] = Object.keys(h.npcs);
        const npc = h.npcs[id];
        const roomId = npc.residency.room;
        npc.relPlayer = { comfort: 0, affection: 0, conversationPhase: 'stranger' };
        npc.location = roomId;
        // Stand in the hall the resident's room opens onto — the same-room
        // path is proven above; this is the OTHER-room path, and the door
        // attenuation is what keeps the signal honest.
        h.player.location = ROOM_ADJACENCY[roomId][0];
        emitTransient(h, { id: 'running_water', roomId, intensity: SIGNALS_EMIT.shower, sourceId: null });
        const d = derivePlausibleActivity(h, id, h.player.location);
        return !!d && d.tier === 'coarse' && d.label === 'showering';
      })()`));
check('a LOCKED door between you → the \'inside\' tier, never the granular act, even for someone you know',
      api(`(() => {
        const h = house(20260821, 2);
        const [id] = Object.keys(h.npcs);
        const npc = h.npcs[id];
        const roomId = npc.residency.room;          // the door object lives in the bedroom's bucket
        npc.relPlayer = { comfort: 0.5 };
        npc.location = roomId;
        npc.activity = 'watching TV';
        h.player.location = 'living_room';
        const bucket = h.objects['room_' + roomId] || {};
        const door = Object.values(bucket).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
        if (!door) return false;
        door.state = { ...door.state, lock: 'locked' };
        const d = derivePlausibleActivity(h, id, 'living_room');
        return !!d && d.tier === 'inside' && d.label === 'inside';
      })()`));
check('off-map / dormant NPC (no location) → null',
      api(`(() => {
        const h = house(20260821, 1);
        const [id] = Object.keys(h.npcs);
        h.npcs[id].location = null;
        return derivePlausibleActivity(h, id, 'living_room') === null;
      })()`));

// RENDER's renderFloorPlan / renderFloorPlanLive (the fog rasterizer + the
// DOM surface) is LIVE-VERIFIED and skipped here by design.

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
