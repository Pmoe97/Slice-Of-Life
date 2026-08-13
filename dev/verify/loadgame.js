// Shared loader: brings the real engine up in a bare vm context, far enough
// to call resolveTick for real. Stops before render/ui (they need a DOM).
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src', 'srcfiles');

// Load order per ARCHITECTURE.md, truncated before the render/ui layer.
const ORDER = [
  'config.js', 'icons.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js',
  'defs.menu.js', 'orbital.js', 'state.js', 'sim.js', 'commitments.js', 'world.js',
  'signals.js', 'scene.js',
  'items.js', 'inventory.js', 'effects.js', 'drives.js', 'cognition.js', 'overture.js',
  'actions.js', 'intent.js',
  'skills.js', 'stealth.js', 'time.js', 'computer.js', 'tracker.js', 'phone.js',
  'npc.js', 'rumination.js', 'prompt.js', 'llm.js', 'x5.js', 'interruption.js',
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
