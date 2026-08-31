// Intimacy & Voyeurism Plan Phase 1 — Submenu actions (D5).
// A multi-verb object renders as ONE "X ▸" chip that expands a one-level
// popover of its verbs. The parent (door.interact / wardrobe.interact /
// bed.interact / sound.interact) is a grouping entry that never executes;
// `submenu` lists the verbs in declaration order, and every verb is a normal
// ACTION_DEFS entry inheriting the parent's room context.
//
// Nothing here reimplements the logic: the engine loads into a bare vm and
// the assertions read what the real functions return. The popover
// open/close/blur/Escape interactions (ui.js) need the real DOM — they are
// LIVE-VERIFIED and skipped here by design, like every DOM surface in this
// harness family.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['defs.actions.js', 'actions.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// --- Helpers injected INTO the vm context (function declarations, so the
// checks call them by name instead of interpolating arrow bodies) ---
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
console.log('\n1. The four submenu parents (defs.actions.js)');
check('exactly the four D5 submenu parents exist, each a flat non-empty string array, verbs resolve, and nothing nests',
      api(`(() => {
        const parents = Object.entries(ACTION_DEFS)
          .filter(([, d]) => Array.isArray(d.submenu) && d.submenu.length > 0)
          .map(([k]) => k).sort();
        const expect = ['bed.interact', 'door.interact', 'sound.interact', 'wardrobe.interact'].sort();
        if (JSON.stringify(parents) !== JSON.stringify(expect)) return false;
        for (const [k, d] of Object.entries(ACTION_DEFS)) {
          if (!d.submenu) continue;
          if (!Array.isArray(d.submenu) || d.submenu.length === 0) return false;
          for (const v of d.submenu) {
            if (typeof v !== 'string') return false;
            const child = ACTION_DEFS[v];
            if (!child) return false;                                   // every verb resolves to a real def
            if (child.submenu && child.submenu.length > 0) return false; // one level only (invariant 6)
          }
        }
        return true;
      })()`));
check('submenu parents are grouping-only: no source, so they never resolve as executable actions',
      api(`(() => ['door.interact', 'wardrobe.interact', 'bed.interact', 'sound.interact']
            .every(id => !ACTION_DEFS[id].source))()`));

// ---------------------------------------------------------------- 2
console.log('\n2. Flat-chip exclusion (actions.js: resolveAvailableActions)');
check('submenu verbs never surface as flat chips — even when their source matches the current room',
      api(`(() => {
        const h = house(20260817, 2);
        h.player.location = 'hallway_a';
        // Put the door, a wardrobe and a stereo in the hallway bucket so the
        // door.* / wardrobe.* / sound.* verbs' sources would ALL match if the
        // exclusion did not exist. boundary.* verbs use a 'paired' source the
        // matcher always rejects — structurally unfittable, checked below.
        const bucket = h.objects['room_hallway_a'] || (h.objects['room_hallway_a'] = {});
        bucket.__test_door     = { id: '__d', defId: 'bedroom_door', state: { lock: 'unlocked' } };
        bucket.__test_wardrobe = { id: '__w', defId: 'wardrobe' };
        bucket.__test_stereo   = { id: '__s', defId: 'stereo' };
        const submenuVerbs = new Set();
        for (const def of Object.values(ACTION_DEFS)) for (const v of def.submenu || []) submenuVerbs.add(v);
        const flat = resolveAvailableActions(h).map(a => a.actionId);
        const leaked = flat.filter(id => submenuVerbs.has(id));
        // Non-vacuity: a NON-submenu action must still resolve (the door
        // unlocks source matches, fails only its requirement check) — the
        // engine is running, and exclusion, not emptiness, keeps the verbs out.
        return flat.includes('self.unlock_door') && leaked.length === 0;
      })()`));
check('the bed/boundary verbs are structurally unfittable as flat chips (paired source rejected by the matcher)',
      api(`(() => {
        const h = house(20260817, 2);
        const flat = resolveAvailableActions(h).map(a => a.actionId);
        return !flat.includes('boundary.sleep_with') && !flat.includes('boundary.sleep_watch');
      })()`));

// POPOVER open/close/blur/Escape (ui.js) is LIVE-VERIFIED — it needs the
// real DOM (chip click → popover render → blur/Escape dismissal) and is
// skipped here by design.

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
