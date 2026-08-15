// Shared loader: brings the real engine up in a bare vm context, far enough
// to call resolveTick for real. Stops before render/ui (they need a DOM).
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src', 'srcfiles');

// Load order per ARCHITECTURE.md, truncated before the render/ui layer.
const ORDER = [
  'config.js', 'icons.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js',
  'defs.menu.js', 'defs.intro.js', 'defs.design.js',
  'orbital.js', 'state.js', 'sim.js', 'commitments.js', 'world.js', 'movement.js',
  'signals.js', 'scene.js',
  'items.js', 'inventory.js', 'effects.js', 'drives.js', 'cognition.js', 'overture.js',
  'actions.js', 'intent.js',
  'skills.js', 'stealth.js', 'time.js', 'computer.js', 'tracker.js', 'phone.js',
  'npc.js', 'rumination.js', 'prompt.js', 'llm.js', 'x5.js', 'interruption.js',
  // image.js sits BELOW llm.js in main.html but above render.js, and it was
  // missing from this list — which rule 6 says it must not be. It only needs a
  // DOM at call time (generateImage/canvas), never at load, so the pure half
  // (composeSceneKey, buildImagePrompt, sceneDetailSignature) is directly
  // testable here. That half is exactly the part with logic worth testing.
  'image.js',
  // studio.js is a UI-layer file and sits BELOW ui.js in main.html, but like
  // image.js its logic half is pure: PLAYER_STUDIO_TABS and
  // STUDIO_ROW_GROUPS are tables asserted against CHARACTER_SCHEMA, and
  // buildPlayerDraftForNewGame / introInterpolate are pure functions. It
  // touches the DOM only inside function bodies (its one top-level
  // addEventListener is guarded on `typeof document`), so it loads here
  // cleanly and the half worth testing is testable.
  'studio.js',
];

function loadEngine(opts = {}) {
  const ctx = vm.createContext({
    console, Math, JSON, Object, Array, String, Number, RegExp, Set, Map, Date,
    Promise, Infinity, isNaN, parseInt, parseFloat, structuredClone,
  });
  vm.runInContext(`
    var window = { generatorPublicId: 'test', generatorIsUnsaved: false };
    var document = undefined;
    var root = { kv: {}, generateText: async () => '{}', generateImage: async () => ({}) };
    var requestAnimationFrame = () => 0;
    var setTimeout = (fn) => 0;
    var clearTimeout = () => {};
    var performance = { now: () => 0 };
  `, ctx);

  const loaded = [];
  for (const f of ORDER) {
    try {
      vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
      loaded.push(f);
    } catch (e) {
      if (opts.verbose) console.log(`  (skipped ${f}: ${e.message})`);
      if (opts.required && opts.required.includes(f)) {
        throw new Error(`required file ${f} failed to load: ${e.message}`);
      }
    }
  }
  return { ctx, loaded, api: (e) => vm.runInContext(e, ctx) };
}

module.exports = { loadEngine, SRC };
