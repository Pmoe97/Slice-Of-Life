// Shared loader: brings the real engine up in a bare vm context, far enough
// to call resolveTick for real. Stops before render/ui (they need a DOM).
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src', 'srcfiles');

// Load order per ARCHITECTURE.md, truncated before the render/ui layer.
// NOTE: this ORDER intentionally diverges from index.html at two files, both
// documented below: codex.js (pure ledger/domain logic, loads after
// interruption.js) and studio.js (UI-layer file whose logic half is pure,
// loads after pregnancy.js). No load-time dependencies, so either position is
// safe — the divergence is deliberate, not drift.
const ORDER = [
  'config.js', 'defs.settings.js', 'settings.js', 'icons.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js',
  'defs.menu.js', 'defs.intro.js', 'defs.design.js', 'defs.dreams.js',
  'orbital.js', 'state.js', 'sim.js', 'commitments.js', 'world.js', 'movement.js',
  'signals.js', 'scene.js',
  'items.js', 'inventory.js', 'effects.js', 'cooking.js', 'taste.js', 'drives.js', 'cognition.js', 'overture.js',
  'actions.js', 'intent.js',
  'skills.js', 'stealth.js', 'time.js', 'computer.js', 'tracker.js', 'debuglog.js', 'phone.js',
  'npc.js', 'willingness.js', 'relationships.js', 'rumination.js', 'prompt.js', 'llm.js', 'x5.js', 'interruption.js',
  // codex.js (intimacy-voyeurism Phase 15, D8) sits after relationships.js
  // in index.html; its whole surface (ledger readers, the three spendable
  // verbs, the witnessed-entry writer) is pure/domain logic with no DOM
  // dependencies, so it loads cleanly here and the verbs are directly
  // testable against real game state.
  'codex.js',
  // image.js sits BELOW llm.js in index.html but above render.js, and it was
  // missing from this list — which rule 6 says it must not be. It only needs a
  // DOM at call time (generateImage/canvas), never at load, so the pure half
  // (composeSceneKey, buildImagePrompt, sceneDetailSignature) is directly
  // testable here. That half is exactly the part with logic worth testing.
  'image.js',
  // peek.js (intimacy-voyeurism Phase 10) sits between image.js and render.js
  // in index.html. Its load-time surface is module state + pure derivation
  // functions (peekRiskPerTick, peekCaughtChance, peekOutcomeWeights,
  // composePeekViewLine...); the session controller (startPeekSession /
  // _peekTick) needs the DOM and currentGameState only at call time, so the
  // whole file loads cleanly here and the logic half is directly testable.
  'peek.js',
  // dreams.js (dream-engine-plan Phase 1) sits between peek.js and
  // actionwindow.js in main.html, and here for the same reason peek.js and
  // image.js do: its load-time surface is module state plus pure functions —
  // defaultDreamState / normalizeDreamState now, and harvestResidue (Phase 3)
  // and compileDream (Phase 4) later, which are the halves actually worth
  // testing. Everything that needs a DOM, root.generateImage or
  // root.generateText (the render queue, presentDream) is called at runtime
  // only. Registered here in the SAME COMMIT as the main.html tag: shipping a
  // file to only one of the two lists is the rumination.js scar, where five
  // harnesses and 175 assertions died silently.
  'dreams.js',
  // actionwindow.js (action-outcome-window-plan Phase 1) sits between peek.js
  // and boundary.js in main.html, for the same reason peek.js sits where it
  // does: its load-time surface is module state plus pure tables and pure
  // functions (ACTION_WINDOW_ROW_BUILDERS, deriveActionDeltas,
  // resolveActionWindowSpec), so the half worth testing — the delta strip's
  // projection of applyEffects' typed effect list, and the def-to-spec
  // resolution — is directly testable here. The lifecycle half
  // (presentActionOutcome/renderActionWindow/dismissActionWindow) needs a DOM
  // and reaches for it only inside function bodies, guarded on
  // `typeof document`, so the whole file loads cleanly in the vm.
  'actionwindow.js',
  // boundary.js (intimacy-voyeurism Phase 17, D13/D14) sits between peek.js
  // and render.js in index.html. Its whole surface — BOUNDARY_ACT_DEFS, the
  // sleeping-room gate, wake/catch, the throuple gate, three-way infidelity,
  // and the sneak-into-bed drive resolver — is pure domain logic with no DOM
  // dependencies, so it loads cleanly here and is directly testable against
  // real game state (willingness.js/npc.js/relationships.js/codex.js are
  // already loaded above it).
  'boundary.js',
  // pregnancy.js (intimacy-voyeurism Phase 18, D14/D16) sits between
  // boundary.js and render.js in index.html. Its whole surface — the
  // conception roll, the day-rollover pass, and the pure readers the scene
  // reader / prompt builders call — is domain logic with no DOM
  // dependencies, so it loads cleanly here and is directly testable against
  // real game state (relationships.js/willingness.js/npc.js are loaded
  // above it).
  'pregnancy.js',
  // studio.js is a UI-layer file and sits BELOW ui.js in index.html, but like
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
    // Bare browser globals (not window.*) — image.js's sceneOrientation()
    // reads these directly. Nothing reached it until the character-cutout
    // plan's plate/cutout key composers, which is why this was missing.
    // Landscape desktop default; a harness that cares about the portrait
    // branch can override before calling in.
    var innerWidth = 1280;
    var innerHeight = 800;
  `, ctx);
  // Typed arrays: not in the vm's original exposed-globals list (nothing
  // needed them until the cutout pipeline's pure pixel-math functions,
  // image.js's cutoutDilate/cutoutErode/cutoutLabelComponents/
  // cutoutPruneSpecks). Real browsers always have these; only the sandbox
  // was missing them.
  Object.assign(ctx, { Uint8Array, Uint8ClampedArray, Int32Array });

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
