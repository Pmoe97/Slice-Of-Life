// Shared loader: brings the real engine up in a bare vm context, far enough
// to call resolveTick for real. Stops before render/ui (they need a DOM).
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'srcfiles');

// Load order per ARCHITECTURE.md, truncated before the render/ui layer.
// NOTE: this ORDER intentionally diverges from index.html at three files,
// all documented below: codex.js (pure ledger/domain logic, loads after
// interruption.js), asks.js (pure decision logic, loads after pregnancy.js
// — actions-and-activities-overhaul-plan.md Phase 1 found it missing from
// this list entirely, the exact invariant-8 bug shape the plan's own header
// warns about, and added it here in the same commit as ASK_INVITE), and
// studio.js (UI-layer file whose logic half is pure, loads after asks.js).
// No load-time dependencies for any of the three, so either position is
// safe — the divergence is deliberate, not drift.
const ORDER = [
  'config.js', 'defs.settings.js', 'settings.js', 'icons.js',
  // fields.js (AI-Assisted Character Generation Phase 1) sits directly after
  // icons.js in index.html — it must load before the three surfaces that build
  // controls with it (menu.js, render.computer.js, studio.js). Every document
  // touch in it is guarded on `typeof document`, so it loads cleanly in the
  // bare vm and its pure halves (fieldsPoolHash, offPoolValues) are directly
  // testable here. Registered in BOTH lists in the same commit: shipping a
  // file to only one of the two is the rumination.js scar.
  'fields.js',
  'defs.world.js', 'defs.actions.js', 'defs.computer.js',
  'defs.menu.js', 'defs.intro.js', 'defs.design.js', 'defs.dreams.js', 'defs.patchnotes.js',
  // defs.works.js (aspirations-and-creative-careers-overhaul-plan.md Phase 4,
  // D56) sits directly after defs.patchnotes.js in index.html: WORK_KINDS /
  // WORK_TUNING, pure data. Registered in BOTH lists in the same commit.
  'defs.works.js',
  // defs.placement.js (npc-avatar-liveliness Phase 2, D8) sits directly after
  // defs.design.js in index.html, and here for the same reason the movement
  // family does: FP_FOOTPRINTS (moved out of render.js — which is NOT in this
  // list, "stops before render/ui") and the pure resolveAutoPlacements packer
  // are the half worth testing, and resolveObjectStandPoint is the anchor
  // resolver actions.js delegates to. Its only load-time inputs (ROOM_LAYOUT,
  // OBJECT_DEFS, ROOM_DECOR) are already loaded above it; roomCentre (world.js)
  // is called at runtime only. Registered in BOTH lists in the same commit
  // (invariant 6).
  'defs.placement.js',
  'orbital.js', 'state.js', 'sim.js', 'commitments.js', 'world.js', 'movement.js',
  // movement.present.js (npc-avatar-liveliness Phase 1) sits directly after
  // movement.js in index.html, and here for the same reason the rest of the
  // movement family does: its pure core (presentStepAvatar, beginPresentCatch,
  // replanPresentPath, presentInRoomUnits, coveredAlongPoint) reads only
  // ROOM_LAYOUT/findPath/sharedWallSegment/WALK/clock inputs, and its DOM half
  // (presentFrame, presentWriteRoutePaths, the D23 rAF loop) is guarded on
  // `typeof document`/function-existence checks, so the whole file loads in
  // the bare vm and the half worth testing is directly testable. Registered
  // in BOTH lists in the same commit (invariant 6).
  'movement.present.js',
  // meanwhile.js (continuous-cadence-closure Phase 8, D9) sits directly
  // after signals.js in index.html and here for the same reason: pure,
  // calls signals.js's reachMultipliers/SIGNAL_TUNING and config.js's
  // EVENT_IMPORTANCE/ROOMS at runtime (all already loaded above it), no DOM
  // dependency at load or call time. scene.js's composeScene calls its
  // composeMeanwhileTicker, so it must load before scene.js. Registered in
  // BOTH lists in the same commit (invariant 6).
  'signals.js', 'meanwhile.js', 'scene.js',
  'items.js', 'inventory.js', 'effects.js', 'cooking.js', 'taste.js', 'drives.js', 'cognition.js', 'overture.js',
  'actions.js', 'intent.js',
  'skills.js', 'stealth.js', 'time.js', 'computer.js',
  // works.js (aspirations-and-creative-careers-overhaul-plan.md Phase 4,
  // D17–D20, D56) sits between computer.js and tracker.js in index.html —
  // it reads skills.js/computer.js/sim.js only inside function bodies, and
  // tracker.js's trackerCatalog calls its catalogIncomeForDay at call time.
  // Pure logic over game state, no DOM: startWork/workBlock/releaseWork/
  // promoteWork/decayWorks/catalogIncomeForDay are all directly testable
  // here. Registered in BOTH lists in the same commit (invariant 8).
  'works.js',
  'tracker.js', 'debuglog.js', 'phone.js',
  'npc.js',
  // notice.js (aspirations-and-creative-careers-overhaul-plan.md Phase 3,
  // D9/D56) sits directly after npc.js in index.html. The Notice & Opinion
  // layer: noticeSubject / opinionValence / the in-room perceiver resolution
  // through signals.js's perceiveSignals and npc.js's addMemoryFact — pure
  // logic over game state, no DOM at load or call time, the most directly
  // testable kind of file. Registered in BOTH lists in the same commit
  // (invariant 8).
  'notice.js',
  // flags.js (actions-and-activities-overhaul-plan.md Phase 3, D15) sits
  // directly after npc.js in index.html — it calls addMemoryFact/
  // MEMORY_IMPORTANCE at runtime, plus effects.js's applyEffects/
  // buildEffectContext/parseEffectDSL and sim.js's getPresentNpcIds, all
  // already loaded above it. Pure decision function (resolveHouseRuleViolations)
  // plus a trusted-producer applier (applyHouseRuleViolations), same tier as
  // stealth.js — no DOM dependency at load or call time.
  'flags.js',
  // temperature.js (actions-and-activities-overhaul-plan.md Phase 8, D16)
  // sits directly after flags.js in index.html — it calls sim.js's
  // getSeasonIndex and mulberry32/hashStr, both already loaded above it.
  // All pure (ambientTempC/thermostatHvacMultiplier/npcComfortBandC/
  // temperatureClothingBiasWeight/thermostatSelfAdjustChance) — no DOM
  // dependency at load or call time.
  'temperature.js',
  // dirt.js (actions-and-activities-overhaul-plan.md Phase 9, D17/D49) sits
  // directly after temperature.js in index.html — it calls world.js's
  // refreshRoomCleanliness and effects.js's clamp, both already loaded above
  // it (world.js line 41, effects.js in the items/inventory/effects/... run
  // just above flags.js). All its writes are function-body calls resolved at
  // runtime, not load time, so callers loaded earlier in this list that
  // reference bumpRoomDirt/dustSignalIntensity (signals.js, effects.js,
  // defs.actions.js, computer.js, sim.js) are safe the same way — every
  // script finishes loading before any gameplay call happens.
  'dirt.js',
  'willingness.js', 'relationships.js', 'rumination.js', 'prompt.js', 'llm.js',
  // concept.js (AI-Assisted Character Generation Phase 2) sits directly after
  // llm.js in index.html. Everything in it is pure except fillFromConcept,
  // which reaches for root.generateText inside the function body only — so the
  // whole file loads in the bare vm and the half worth testing (the tolerant
  // parser, the schema-driven normalizer, the three adapters) is directly
  // testable here. Registered in BOTH lists in the same commit.
  'concept.js',
  'x5.js', 'interruption.js',
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
  // sprites.js (avatars-and-sprite-studio Phase 1) sits directly after
  // image.js in index.html, and here for the same reason: its whole surface is
  // pure logic plus kv — slot-id grammar, the index, the store's refuse-at-cap
  // writer, and resolveSprite — with no DOM touch at load OR call time, so it
  // is among the most directly testable files in the project. Registered in
  // BOTH lists in the same commit: shipping a file to only one of the two is
  // the rumination.js scar, where five harnesses and 175 assertions died
  // silently.
  'sprites.js',
  // avatar.js (avatars-and-sprite-studio Phase 2) sits directly after
  // sprites.js in index.html. It is a UI component file, but — like icons.js
  // and fields.js — its builders are pure and it touches the DOM only inside
  // function bodies, so the whole file loads in the bare vm and the halves
  // worth testing (hashToColor, avatarInitials, avatarIdentityFor,
  // avatarChipSize) are directly testable. It also OWNS hashToColor now,
  // which render.computer.js calls, so it must load before that file in both
  // lists. Registered in BOTH in the same commit.
  'avatar.js',
  // spritestudio.js (avatars-and-sprite-studio Phase 4) — the studio's verbs.
  // Its roster/readiness/upload-ingest/link-pin logic is pure over game state
  // plus the sprite store; the DOM is touched only inside the UI-handler half
  // (and its one top-level addEventListener is guarded on `typeof document`),
  // so the whole file loads in the bare vm and the half worth testing is
  // directly testable. render.spritestudio.js is NOT in this list: it is pure
  // view code that registers into COMPUTER_RENDERERS, and the render layer is
  // deliberately outside this loader. Registered in BOTH index.html and here
  // in the same commit.
  'spritestudio.js',
  // peek.js (intimacy-voyeurism Phase 10) sits between image.js and render.js
  // in index.html. Its load-time surface is module state + pure derivation
  // functions (peekRiskPerTick, peekCaughtChance, peekOutcomeWeights,
  // composePeekViewLine...); the session controller (startPeekSession /
  // _peekTick) needs the DOM and currentGameState only at call time, so the
  // whole file loads cleanly here and the logic half is directly testable.
  'peek.js',
  // dreams.js (dream-engine-plan Phase 1) sits between peek.js and
  // actionwindow.js in index.html, and here for the same reason peek.js and
  // image.js do: its load-time surface is module state plus pure functions —
  // defaultDreamState / normalizeDreamState now, and harvestResidue (Phase 3)
  // and compileDream (Phase 4) later, which are the halves actually worth
  // testing. Everything that needs a DOM, root.generateImage or
  // root.generateText (the render queue, presentDream) is called at runtime
  // only. Registered here in the SAME COMMIT as the index.html tag: shipping a
  // file to only one of the two lists is the rumination.js scar, where five
  // harnesses and 175 assertions died silently.
  'dreams.js',
  // actionwindow.js (action-outcome-window-plan Phase 1) sits between peek.js
  // and boundary.js in index.html, for the same reason peek.js sits where it
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
  // nightscene.js (night-scene-sleeping-npc-plan Phase 3b) sits directly
  // after boundary.js in index.html and here for the same reason: it is the
  // Living Tableau's DECIDER half, and every mechanic it touches is already
  // in boundary.js above it (nightPalette / nightActionValid /
  // nightStepAction / applyNightStep / composeNightLine). Its load-time
  // surface is module state plus pure functions — the selection repair, the
  // motion preview, the bar model, the labels and the whole view model, which
  // is exactly the half worth testing (verify-night-p3.js) — and its only DOM
  // touches are inside function bodies guarded on `typeof document`, so the
  // whole file loads cleanly in the bare vm. render.nightscene.js is NOT in
  // this list: it is pure view code and the render layer is deliberately
  // outside this loader, same as render.spritestudio.js. Registered in BOTH
  // index.html and here in the same commit — shipping a file to only one of
  // the two lists is the rumination.js scar.
  'nightscene.js',
  // pregnancy.js (intimacy-voyeurism Phase 18, D14/D16) sits between
  // boundary.js and render.js in index.html. Its whole surface — the
  // conception roll, the day-rollover pass, and the pure readers the scene
  // reader / prompt builders call — is domain logic with no DOM
  // dependencies, so it loads cleanly here and is directly testable against
  // real game state (relationships.js/willingness.js/npc.js are loaded
  // above it).
  'pregnancy.js',
  // birthdays.js (birthdays-and-occasions-plan.md Phase 1) sits directly
  // after pregnancy.js in index.html too — real position, not a divergence.
  // Pure domain logic (derived birthdays, the rollover pass, the prompt and
  // Calendar readers) with only runtime calls into npc.js/sim.js/drives.js,
  // so it loads cleanly here and is directly testable.
  'birthdays.js',
  // occasions.js (occasions-and-holidays-plan.md Phase 1) sits directly after
  // birthdays.js in index.html too — real position. Pure domain logic (the
  // holiday roster readers, festivity, prompt lines, the Calendar's row and
  // year-grid models) with only runtime calls out; render.calendar.js, its
  // painter, is render layer and deliberately not listed here.
  'occasions.js',
  // seasons.js (seasons-and-weather-plan.md Phase 1) sits right after
  // occasions.js in index.html too — real position. Pure and derived
  // (weather chain, temperature curve, daylight, sky line); temperature.js
  // and llm.js reach it only at runtime.
  'seasons.js',
  // housenotes.js (0.14.2) sits right after seasons.js in index.html too —
  // real position. Pure domain logic (the tick pass sim.js calls, the read
  // narration, the Write Back helpers) with only runtime calls out.
  'housenotes.js',
  // tv.js (What's On, 0.14.2) sits right after housenotes.js in index.html
  // too — real position. Pure domain logic (show calendar, taste, the
  // living-room screen's tick pass sim.js calls, the Watch TV plan and line,
  // the prompt line) with only runtime calls out.
  'tv.js',
  // projects.js (Side Projects, 0.14.2) sits right after tv.js in index.html
  // too — real position. Pure domain logic plus the work_on_project resolver
  // drives.js calls and the daily pass sim.js calls; only runtime calls out.
  'projects.js',
  // money.js (actions-and-activities-overhaul-plan.md Phase 4, D9) — the
  // bidirectional ledger. Pure reads plus a mutating adjustMoneyLedger, no
  // load-time dependencies; sits directly before asks.js here exactly as it
  // does in index.html (its only caller), so this is real position, not a
  // documented divergence like asks.js's own note just below.
  'money.js',
  // mail.js (actions-and-activities-overhaul-plan.md Phase 12, D21) — the
  // mailbox + door event. Pure reads plus mutating helpers over
  // world.mailbox/world.deliveries/world.doorEvent, no load-time
  // dependencies of its own (items.js/sim.js/time.js/config.js are already
  // loaded above it). Sits directly after money.js here exactly as it does
  // in index.html — real position, not a divergence.
  'mail.js',
  // puzzles.js (actions-and-activities-overhaul-plan.md Phase 14, D23) —
  // DailyGrid, the seeded daily crossword. Pure reads plus mutating
  // generatePuzzleForDay/fillPuzzleCell/revealHintForWord, no load-time
  // dependencies of its own (seededRng/pickUnique/pushMoodImpulse from
  // sim.js, awardSkillXp from skills.js, MOOD_PAYOUTS from config.js — all
  // already loaded above it). Sits directly after mail.js here exactly as
  // it does in index.html — real position, not a divergence.
  'puzzles.js',
  // chatter.js (actions-and-activities-overhaul-plan.md Phase 15, D24) — the
  // in-house social feed. Pure reads plus mutating generateChatterForDay/
  // postChatterAsPlayer/toggleChatterLike/addChatterComment, no load-time
  // dependencies of its own (factRecency/factEmotionalWeight/
  // factPersonalityBias/talkativeness/clamp01 from npc.js, pairKey from
  // relationships.js, seededRng/weightedPick/pushMoodImpulse from sim.js,
  // clamp from effects.js, EVENT_IMPORTANCE/MEMORY_IMPORTANCE/BELIEF/
  // MOOD_PAYOUTS from config.js — all already loaded above it). Sits
  // directly after puzzles.js here exactly as it does in index.html — real
  // position, not a divergence.
  'chatter.js',
  // platform.js (aspirations-and-creative-careers-overhaul-plan.md Phase 9,
  // D56) sits directly after chatter.js in index.html: the audience side
  // of Chatter — profile/handles/blocking/visibility/the follow decision —
  // pure logic over game state with no DOM. Registered in BOTH lists in
  // the same commit (invariant 8).
  'platform.js',
  // aspirations.js (aspirations-and-creative-careers-overhaul-plan.md Phase
  // 14, D46–D49) sits directly after platform.js in index.html: directions,
  // live milestones (pure predicates from defs.works.js's
  // ASPIRATION_DIRECTIONS) and the rollover completion pass. Registered in
  // BOTH lists in the same commit (invariant 8).
  'aspirations.js',
  // asks.js (asks-and-attachments-plan.md) sits between render.phone.js and
  // ui.js in index.html — squarely inside the render/ui block this loader
  // otherwise stops before. It was simply never added here across that
  // plan's whole run (invariant 8's exact bug shape: registered in
  // index.html only). Its whole surface — ASK_TYPES/ASK_CATEGORIES, every
  // leaf's decide()/effects()/leafNote(), resolveAsk, parseAskInput, the
  // repeat ladder — is pure decision logic with no DOM dependency at load OR
  // call time (grep confirms zero `document.`/`window.`/addEventListener),
  // so the whole file loads cleanly here, same as boundary.js/pregnancy.js
  // above it. Added in the same commit as ASK_INVITE
  // (actions-and-activities-overhaul-plan.md Phase 1) so that leaf — and
  // every leaf before it — finally gets Node coverage.
  'asks.js',
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
    // Object URLs. The sandbox had no URL at all, so any path reaching
    // image.js's createObjectUrl threw — which nothing did until
    // sprites.js's resolveSprite made blob-backed lookups directly testable.
    // Deliberately a counter stub rather than Node's real implementation:
    // a harness wants a deterministic, inspectable handle, and no file in
    // this project ever constructs a real URL (grep: only createObjectURL
    // and revokeObjectURL are used).
    var __objectUrlSeq = 0;
    var __objectUrlsLive = new Set();
    var URL = {
      createObjectURL: (blob) => {
        const u = 'blob:test/' + (++__objectUrlSeq);
        __objectUrlsLive.add(u);
        return u;
      },
      revokeObjectURL: (u) => { __objectUrlsLive.delete(u); },
    };
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
