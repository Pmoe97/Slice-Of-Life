// Intimacy & Voyeurism Plan Phase 3 — Door cues (D4).
// A door the player is standing next to can whisper: light through the
// keyhole, a door left ajar, sounds carrying through it. All three are
// derived from real state — the door object's own state, who is in the far
// room, and the SAME perceiveSignals query every other surface reads — and
// nothing is stored (RI3). PURE.
//
// Light semantics (DOOR_CUE_TUNING): during the daylit phases an occupied
// room reads as lit; at night light has to be earned — an awake occupant
// implies a lit room, a sleeping one leaves the door dark (the honest cue
// the boundary acts care about).
//
// D4: cues must be VARIED — the pool index is a rotation over the scene's
// doorCueAt counter plus a per-(kind, room, day) offset, so the prose walks
// the pool rather than repeating an entry. This harness proves the ten-
// adjacent-render uniqueness; RENDER's composeScene / the floor-plan glow
// that consume the cues are live-verified.
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

// The resident's door and the hall it opens onto (mirrors w19's setup).
api(`
  function doorSetup(h) {
    const [id] = residentsOf(h);
    const roomId = h.npcs[id].residency.room;
    const bucket = h.objects['room_' + roomId] || {};
    const door = Object.values(bucket).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
    const hall = ROOM_ADJACENCY[roomId][0];
    return { id, roomId, door, hall };
  }
  function residentsOf(h) {
    return Object.keys(h.npcs).filter(id => h.npcs[id].residency.status === 'resident');
  }
`);

// ---------------------------------------------------------------- 1
console.log('\n1. Purity — the derivation writes nothing and is deterministic');
check('deriveDoorCues is pure: repeated calls are byte-identical and state is unchanged',
      api(`(() => {
        const h = house(20260901, 3);
        const s = doorSetup(h);
        if (!s.door) return false;
        h.npcs[s.id].activity = 'awake';
        h.meta.clock.phase = 'night';
        h.player.location = s.hall;
        const before = JSON.stringify(h);
        const a = deriveDoorCues(h, s.door, s.hall);
        const b = deriveDoorCues(h, s.door, s.hall);
        return JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(h) === before;
      })()`));
check('a door the player is NOT standing at → null',
      api(`(() => {
        const h = house(20260901, 3);
        const s = doorSetup(h);
        if (!s.door) return false;
        return deriveDoorCues(h, s.door, 'living_room') === null;
      })()`));

// ---------------------------------------------------------------- 2
console.log('\n2. Light semantics (asleep → dark, awake → lit at night; daylit floods)');
check('night + a sleeping occupant → dark door (the honest cue)',
      api(`(() => {
        const h = house(20260901, 3);
        const s = doorSetup(h);
        if (!s.door) return false;
        h.npcs[s.id].activity = 'sleeping';
        h.meta.clock.phase = 'night';
        h.player.location = s.hall;
        const cues = deriveDoorCues(h, s.door, s.hall);
        return !!cues && cues.lightThroughKeyhole === false && cues.occupantIds.includes(s.id);
      })()`));
check('night + an AWAKE occupant → lit door',
      api(`(() => {
        const h = house(20260901, 3);
        const s = doorSetup(h);
        if (!s.door) return false;
        h.npcs[s.id].activity = 'watching TV';
        h.meta.clock.phase = 'night';
        h.player.location = s.hall;
        const cues = deriveDoorCues(h, s.door, s.hall);
        return !!cues && cues.lightThroughKeyhole === true;
      })()`));
check('a daylit phase → lit whenever the room is occupied, even a sleeper',
      api(`(() => {
        const h = house(20260901, 3);
        const s = doorSetup(h);
        if (!s.door) return false;
        h.npcs[s.id].activity = 'sleeping';
        h.meta.clock.phase = 'midday';
        h.player.location = s.hall;
        const cues = deriveDoorCues(h, s.door, s.hall);
        return !!cues && cues.lightThroughKeyhole === true;
      })()`));
check('an EMPTY far room → no light through the keyhole',
      api(`(() => {
        const h = house(20260901, 3);
        const s = doorSetup(h);
        if (!s.door) return false;
        h.npcs[s.id].location = null;
        h.meta.clock.phase = 'midday';
        h.player.location = s.hall;
        const cues = deriveDoorCues(h, s.door, s.hall);
        return !!cues && cues.lightThroughKeyhole === false;
      })()`));

// ---------------------------------------------------------------- 3
console.log('\n3. D4 — anti-repetition across adjacent renders');
check('ten adjacent doorCueAt renders produce ten DISTINCT light lines (pool rotation, no repeats)',
      api(`(() => {
        const h = house(20260901, 3);
        const s = doorSetup(h);
        if (!s.door) return false;
        h.npcs[s.id].activity = 'watching TV';
        h.meta.clock.phase = 'midday';
        h.meta.clock.day = 1;
        h.player.location = s.hall;
        const lines = [];
        for (let k = 0; k < 10; k++) {
          const cues = composeDoorCues(h, s.hall, { doorCueAt: k });
          const light = cues.find(c => c.kind === 'light');
          if (!light) return false;
          lines.push(light.line);
        }
        return new Set(lines).size === 10;
      })()`));
check('markDoorCuesShown advances the doorCueAt counter once per render that showed cues',
      api(`(() => {
        const h = house(20260901, 3);
        const s = doorSetup(h);
        if (!s.door) return false;
        h.npcs[s.id].activity = 'watching TV';
        h.meta.clock.phase = 'midday';
        h.player.location = s.hall;
        h.meta.scene = { doorCueAt: 0 };
        const cues = composeDoorCues(h, s.hall, h.meta.scene);
        if (cues.length === 0) return false;
        markDoorCuesShown(h, { ...h.meta.scene, doorCues: cues });
        return h.meta.scene.doorCueAt === 1;   // advanced by the render path, pure composition untouched
      })()`));

// ---------------------------------------------------------------- 4
console.log('\n4. The cue pools (scene.js)');
check('DOOR_CUE_POOLS[\'sound:music\'] exists and is keyed — pickDoorCueText routes music to it',
      api(`(() => {
        const pool = DOOR_CUE_POOLS['sound:music'];
        if (!Array.isArray(pool) || pool.length === 0 || pool.some(s => typeof s !== 'string')) return false;
        const line = pickDoorCueText('sound', 'music', 'bedroom_1', 0, 1);
        return pool.includes(line) && line.includes('{door}');
      })()`));
check('an audible signal with no pool of its own falls back to sound_fallback (never an empty line)',
      api(`(() => {
        const line = pickDoorCueText('sound', 'unpooled_signal', 'bedroom_1', 0, 1);
        return DOOR_CUE_POOLS.sound_fallback.includes(line);
      })()`));
check('light and ajar pools are present and keyed (the light pool drives the D4 rotation)',
      api(`(() => {
        const lightPool = DOOR_CUE_POOLS.light;
        return Array.isArray(lightPool) && lightPool.length >= 10
          && DOOR_CUE_POOLS.ajar.length >= 10
          && pickDoorCueText('light', null, 'bedroom_1', 3, 1).includes('{door}');
      })()`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
