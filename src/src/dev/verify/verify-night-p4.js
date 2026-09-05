// night-scene-sleeping-npc-plan.md — Phase 4: per-action imagery + the live loop.
//
//   node src/src/dev/verify/verify-night-p4.js
//
// Phase 4 is the phase that can quietly break the plan's two hardest
// invariants, so this harness is built around them rather than around the
// pixels (which node cannot see):
//
//   - INVARIANT 3, "image generation is never on the critical path". D18 makes
//     imagery FREQUENT — one frame per (state x action), no session or day
//     budget — which is only survivable because a tap resolves against the
//     pure resolver and the picture catches up behind the shimmer. Asserted
//     three ways: nightscene.js still contains no `await` and no `async` at
//     all; nightRequestFrame hands back a key synchronously; and a real fire
//     against a generateImage that NEVER SETTLES still moves the meters, banks
//     the XP and composes the line — indeed the generator has not even been
//     ENTERED by the time the tap has fully resolved.
//   - D20's cap. generateImageTracked grew a semaphore, so at most 8
//     generations reach root.generateImage at once no matter how fast the
//     player clicks, and the surplus WAITS rather than being dropped. The
//     speculative fan-out spends only the slots nobody is waiting on.
//
// And around the three decisions that are cheap to get subtly wrong:
//
//   - D18's key drops PACE and nothing else. Two ids differing only in pace
//     are one picture; every other axis — part, side, instrument, motion,
//     pose, covers, identity, gate, style, box shape — is a different one.
//   - D19's box. The three shapes map to the three generateImage sizes, and
//     sceneOrientation() STAYS AT TWO VALUES: growing it (which D19 assumed)
//     would have handed `IMAGE_CACHE.resolutions.scene[...]` an undefined on
//     every near-square window and turned over the whole scene namespace.
//   - D37's session-local store. The night frames never touch the shared LRU,
//     and every object URL is revoked when the session closes — the loader's
//     URL stub tracks live handles, so this is directly observable.
//
// Everything below runs inside one async main(): several assertions can only
// be made after the microtask queue has drained, which is the whole point of a
// harness for a phase whose subject is what happens BEFORE it drains.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'skills.js', 'npc.js', 'time.js', 'boundary.js', 'image.js', 'nightscene.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
// The async twin. The sandbox and the host share one microtask queue, so
// awaiting a sandbox promise from here is what lets the queue drain at all.
const A = async (expr) => JSON.parse(JSON.stringify(await api(expr)));

api(`
  var currentGameState = null;
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260904, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'bedroom_1';
    g.player.skills = { stealth: 0 };
    return g;
  };
  __target = (g) => Object.keys(g.npcs).find(id => g.npcs[id].residency.status === 'resident');
  // Both genital types on both bodies plus a breasted chest, so a palette
  // sweep covers every region rather than whichever ones the house roll
  // happened to produce (verify-night-p3.js's own __bothBodies).
  __bothBodies = (g, id) => {
    const gens = [{ type: 'vagina', sensitivity: 'average' }, { type: 'penis', sensitivity: 'average' }];
    const npc = g.npcs[id];
    g.npcs[id] = { ...npc, bible: { ...npc.bible, physical: { ...npc.bible.physical,
      intimate: { ...npc.bible.physical.intimate, genitals: gens,
        breasts: { ...(npc.bible.physical.intimate.breasts||{}), size: 'full', sensitivity: 'average' } } } } };
    g.player = { ...g.player, appearance: { ...g.player.appearance, physical: { ...g.player.appearance.physical,
      intimate: { ...g.player.appearance.physical.intimate, genitals: gens } } } };
    return g;
  };
  __open = (g, id, over) => {
    const rec = { targetId: id, openedDay: g.meta.clock.day, openedMinute: Math.floor(g.meta.clock.minutes * 100),
      detection: 0, floor: 0, heat: 0, evidence: [], touches: [],
      pose: 'back', covers: 'off', climaxCount: 0, xp: 0, resolved: null };
    g.npcs[id] = { ...g.npcs[id], flags: { ...(g.npcs[id].flags||{}), _nightScene: { ...rec, ...(over||{}) } } };
    return g.npcs[id].flags._nightScene;
  };
  // Phase 7 added D34's third axis to the key. Key ORDER matters here: this
  // literal is compared byte-for-byte against nightFrameAxes' real output.
  __axes = (over) => ({ pose: 'back', covers: 'off', clothing: {}, clothingToken: 'bare',
    partId: 'nipple', side: 'both', instrumentId: 'fingers', motionId: 'roll', ...(over||{}) });
  // A session shaped exactly as startNightScene builds one, minus the DOM.
  __sess = () => ({ targetId: __ID, sel: null, lastResult: null, narration: '', confirming: false,
    trayOpen: false, ended: false, endOutcome: null, onClick: null, onKey: null,
    frames: new Map(), framesInFlight: new Set(), frameKey: null, frameAxes: null, prefetchSel: null });

  // A generateImage that NEVER SETTLES until told to, plus a counter of how
  // many calls actually got inside it. This is what makes both the cap and
  // invariant 3 observable: the semaphore's whole job is to hold callers
  // OUTSIDE this function, and invariant 3's is that a tap never waits on it.
  __gen = { entered: 0, releases: [], canvas: { width: 8, height: 8 } };
  __gen.canvas.convertToBlob = () => Promise.resolve({ size: 1, type: 'image/png' });
  __stall = () => {
    __gen.entered = 0; __gen.releases = [];
    root.generateImage = (prompt, opts) => {
      __gen.entered++;
      return new Promise((res) => __gen.releases.push(() => res({ canvas: __gen.canvas })));
    };
  };
  __releaseAll = () => { const r = __gen.releases; __gen.releases = []; r.forEach(f => f()); };
  // setTimeout is a no-op stub in this vm, so there is no macrotask to yield
  // to — draining is microtask ticks, and generously, because one release
  // walks finally -> the next waiter's resolve -> its own await -> the call.
  __drain = async (n) => { for (let i = 0; i < (n || 60); i++) await Promise.resolve(); };
  __quiesce = async () => { for (let r = 0; r < 8; r++) { __releaseAll(); await __drain(40); } };

  __G = __mk();
  __ID = __target(__G);
  __G = __bothBodies(__G, __ID);
  __G.npcs[__ID] = { ...__G.npcs[__ID], location: 'bedroom_1', activity: 'sleeping' };
  currentGameState = __G;
`);

async function main() {

console.log('\n--- 1. D19: the box, and the three sizes generateImage accepts ---');
{
  const ACCEPTED = ['512x512', '512x768', '768x512', '768x768'];
  const res = J('IMAGE_CACHE.resolutions.night');
  check('IMAGE_CACHE.resolutions.night declares exactly the three D19 shapes',
    JSON.stringify(Object.keys(res).sort()) === JSON.stringify(['landscape', 'portrait', 'square']),
    JSON.stringify(res));
  check('and every one of them is a size generateImage actually accepts',
    Object.values(res).every(v => ACCEPTED.includes(v)), JSON.stringify(res));
  check('portrait is the tall size, landscape the wide one, square the square one',
    res.portrait === '512x768' && res.landscape === '768x512' && res.square === '768x768',
    JSON.stringify(res));

  // D19's table, read straight off the band edges rather than off a viewport,
  // so the classifier is tested independently of the box reservation.
  check('an aspect below the portrait edge is portrait', api('nightFrameShapeFor(0.6)') === 'portrait');
  check('an aspect above the landscape edge is landscape', api('nightFrameShapeFor(1.9)') === 'landscape');
  check('an aspect between the two is square', api('nightFrameShapeFor(1.0)') === 'square');
  check('the edges themselves land on square, never in a gap',
    api('nightFrameShapeFor(NIGHT_FRAME_BOX.portraitBelow)') === 'square'
    && api('nightFrameShapeFor(NIGHT_FRAME_BOX.landscapeAbove)') === 'square');

  // The viewports the phase is verified at by hand, plus the one that only
  // exists because the third shape does.
  check('a 1440x900 desktop reads as a landscape box',
    api('nightFrameShapeFor(nightFrameBoxAspect(1440, 900))') === 'landscape');
  check('a 390x844 phone reads as a portrait box',
    api('nightFrameShapeFor(nightFrameBoxAspect(390, 844))') === 'portrait');
  check('a 800x1280 tablet-portrait reads as a square box (the shape scene has no equivalent for)',
    api('nightFrameShapeFor(nightFrameBoxAspect(800, 1280))') === 'square');
  check('nightFrameShape survives a headless context rather than throwing',
    typeof api('nightFrameShape()') === 'string');

  // THE DEVIATION GUARD. D19 said sceneOrientation() "must grow a third return
  // value"; it deliberately did not. Growing it would hand
  // IMAGE_CACHE.resolutions.scene[...] an undefined on a near-square window,
  // flip every `=== 'landscape'` framing branch to its portrait wording, and
  // turn over every scene/dream/outcome key composed on such a window at once.
  // If a later session "finishes the job", this is where it finds out.
  const orientations = new Set();
  for (const [w, h] of [[1440, 900], [900, 1440], [1000, 1000], [390, 844], [2560, 1080]]) {
    orientations.add(api(`(() => { innerWidth = ${w}; innerHeight = ${h}; return sceneOrientation(); })()`));
  }
  api('innerWidth = 1280; innerHeight = 800;');
  check('sceneOrientation() still returns only landscape/portrait (the night box is its own function)',
    orientations.size === 2 && orientations.has('landscape') && orientations.has('portrait'),
    [...orientations].join(', '));
  check('and resolutions.scene still has no square entry to be asked for',
    api('IMAGE_CACHE.resolutions.scene.square') === undefined);
}

console.log('\n--- 2. D18: the image key drops PACE and nothing else ---');
{
  api('__open(__G, __ID)');
  const k = (over, shape) => api(`composeNightFrameKey(__G, __ID, { ...__axes(${JSON.stringify(over || {})}), shape: '${shape || 'landscape'}' })`);
  const base = k();

  check('the key is deterministic — same axes, same string', base === k());
  check('the key names the surface', /^night_/.test(base), base);

  // Pace is not an axis of nightFrameAxes at all, which is the strongest form
  // of "dropped": there is no slot for it to leak through.
  const axes = J('__axes()');
  check('nightFrameAxes carries no pace slot (D18 drops pace from the image key)',
    !('paceId' in axes) && !('pace' in axes), JSON.stringify(axes));
  const derived = J(`nightFrameAxes(__G.npcs[__ID].flags._nightScene, 'nipple', 'both', 'fingers', 'roll')`);
  check('and the axes a gentle tap and a firm tap produce are byte-identical',
    JSON.stringify(derived) === JSON.stringify(axes), JSON.stringify(derived));

  const differs = {
    part: k({ partId: 'breast' }),
    side: k({ side: 'left' }),
    instrument: k({ instrumentId: 'tongue' }),
    motion: k({ motionId: 'pinch' }),
    pose: k({ pose: 'front' }),
    covers: k({ covers: 'covered' }),
    shape: k({}, 'portrait'),
  };
  for (const [axis, key] of Object.entries(differs)) {
    check(`a different ${axis} is a different picture`, key !== base, `${axis}: ${key}`);
  }
  check('all seven axes produce seven DISTINCT keys, not merely non-base ones',
    new Set(Object.values(differs)).size === 7);

  // The folds every key in image.js carries.
  const otherNpc = api(`(() => {
    const ids = Object.keys(__G.npcs).filter(i => i !== __ID);
    return ids.length ? composeNightFrameKey(__G, ids[0], { ...__axes(), shape: 'landscape' }) : null;
  })()`);
  check('a different character is a different picture (identity is folded)',
    otherNpc == null || otherNpc !== base, String(otherNpc));
  // Phase 7 moved the clothing half of the key OFF npc.clothing and onto the
  // session record. That is the whole point: the sim pins a sleeper to
  // 'sleepwear' and never changes it, so while npc.clothing was the source
  // every frame of an entire session keyed identically however far the scene
  // had gone, and the picture could not show what had happened.
  const simClothing = api(`(() => {
    const g = { ...__G, npcs: { ...__G.npcs, [__ID]: { ...__G.npcs[__ID], clothing: 'nude' } } };
    return composeNightFrameKey(g, __ID, { ...__axes(), shape: 'landscape' });
  })()`);
  check("the sim's own npc.clothing no longer moves the key (Phase 7)",
    simClothing === base, simClothing);
  const recordClothing = api(`composeNightFrameKey(__G, __ID, { ...__axes({ clothingToken: 'on-panties' }), shape: 'landscape' })`);
  check('...but the session RECORD clothing state does', recordClothing !== base, recordClothing);

  check('the seed is a pure function of the key',
    api(`composeNightFrameSeed('${base}')`) === api(`composeNightFrameSeed('${base}')`));
  check('and a different key seeds differently',
    api(`composeNightFrameSeed('${base}')`) !== api(`composeNightFrameSeed('${differs.motion}')`));

  // A move projects the state FORWARD: the frame for "roll her onto her back"
  // shows her on her back, which is the whole reason to look at it.
  const moved = J(`(() => {
    __open(__G, __ID, { pose: 'side_toward', covers: 'off' });
    const rec = __G.npcs[__ID].flags._nightScene;
    const partId = Object.keys(BOUNDARY.nightScene.parts).find(p => BOUNDARY.nightScene.parts[p].region === 'move');
    return { move: nightFrameAxes(rec, partId, '-', 'hand', 'roll_to_back'),
             touch: nightFrameAxes(rec, 'hair', '-', 'hand', 'stroke'), from: rec.pose };
  })()`);
  check('a Move keys on the pose it LANDS IN', moved.move.pose === 'back', JSON.stringify(moved.move));
  check('a touch keys on the pose she is already in', moved.touch.pose === moved.from, JSON.stringify(moved.touch));
  check('an unknown motion yields no axes rather than a half-formed key',
    api(`nightFrameAxes(__G.npcs[__ID].flags._nightScene, 'hair', '-', 'hand', 'no_such_motion')`) === null);
}

console.log('\n--- 3. D33: the prompt says what the mechanics say ---');
{
  api(`__open(__G, __ID, { pose: 'back', covers: 'off' })`);
  const p = api(`composeNightFramePrompt(__G, __ID, { ...__axes(), shape: 'landscape' })`);
  check('the prompt is non-empty', !!p && p.length > 80);
  check('it is deterministic (no rng anywhere in composition)',
    p === api(`composeNightFramePrompt(__G, __ID, { ...__axes(), shape: 'landscape' })`));
  check('it never renders an undefined into player-visible text', !/undefined/.test(p), p);
  // D33's two-label rule: prose (and an image prompt IS prose) takes the
  // STANDALONE label, because nothing has established the region.
  check("it uses the part's STANDALONE label, not the tray label",
    p.includes(api(`BOUNDARY.nightScene.parts.nipple.plural`)), p);
  check("it uses the motion's gerund", p.includes(api(`BOUNDARY.nightScene.motions.roll.gerund`)), p);
  check("it uses the instrument's standalone form",
    p.includes(api(`BOUNDARY.nightScene.instruments.fingers.standalone`)), p);
  check('it states the pose and the covers (D34 is the "state" half of the key)',
    p.includes('on her back') && p.includes('covers off'), p);
  check('it says she is asleep, which is the one thing the picture must not get wrong',
    /asleep/i.test(p) && /eyes closed/i.test(p), p);
  check('and the negative prompt says it a second time, where it counts most',
    /open eyes/.test(api('IMAGE_NEGATIVE.night')) && /looking at the viewer/.test(api('IMAGE_NEGATIVE.night')));
  check('the shape drives the composition clause',
    /wide composition/.test(p)
    && /tall vertical/.test(api(`composeNightFramePrompt(__G, __ID, { ...__axes(), shape: 'portrait' })`))
    && /square composition/.test(api(`composeNightFramePrompt(__G, __ID, { ...__axes(), shape: 'square' })`)));

  // A move is not a touch: running it through the instrument frame would
  // produce "your whole hand rolling her hair".
  const moveOk = J(`(() => {
    const partId = Object.keys(BOUNDARY.nightScene.parts).find(p => BOUNDARY.nightScene.parts[p].region === 'move');
    return { partId,
      p: composeNightFramePrompt(__G, __ID, { ...__axes({ partId, motionId: 'roll_to_front', instrumentId: 'hand', side: '-' }), shape: 'landscape' }),
      phrase: BOUNDARY.nightScene.motions.roll_to_front.phrase };
  })()`);
  check('a Move uses its own authored phrase rather than the instrument frame',
    moveOk.p.includes(moveOk.phrase) && !/whole hand rolling/.test(moveOk.p), moveOk.p);
  check('an unknown part composes nothing rather than a broken sentence',
    api(`composeNightFramePrompt(__G, __ID, { ...__axes({ partId: 'no_such_part' }), shape: 'landscape' })`) === '');

  // THE SWEEP: every action the tray can actually offer must compose a real
  // prompt and a real key. The image and the mechanics are composed from one
  // action id, so a frame can never depict an act the resolver would refuse.
  const sweep = J(`(() => {
    let checked = 0, badPrompt = 0, badKey = 0, undef = 0;
    const keys = new Set();
    for (const state of [{ pose: 'back', covers: 'off' }, { pose: 'side_toward', covers: 'turned_back' },
                         { pose: 'front', covers: 'covered' }, { pose: 'curled', covers: 'off' }]) {
      __open(__G, __ID, state);
      const rec = __G.npcs[__ID].flags._nightScene;
      const pal = nightPalette(__G, __ID);
      for (const region of pal.regions) {
        for (const part of region.parts) {
          for (const side of part.sides) {
            for (const row of part.instruments) {
              for (const m of row.motions) {
                const axes = nightFrameAxes(rec, part.partId, side, row.instrumentId, m);
                if (!axes) { badKey++; continue; }
                const key = composeNightFrameKey(__G, __ID, { ...axes, shape: 'landscape' });
                const prompt = composeNightFramePrompt(__G, __ID, { ...axes, shape: 'landscape' });
                checked++;
                keys.add(key);
                if (!key || key.indexOf('undefined') >= 0) badKey++;
                if (!prompt || prompt.length < 60) badPrompt++;
                if (prompt.indexOf('undefined') >= 0) undef++;
              }
            }
          }
        }
      }
    }
    return { checked, badPrompt, badKey, undef, distinct: keys.size };
  })()`);
  check(`every offerable action composes a key (${sweep.checked} swept)`, sweep.badKey === 0, JSON.stringify(sweep));
  check('every offerable action composes a prompt', sweep.badPrompt === 0, JSON.stringify(sweep));
  check('and not one of them renders "undefined"', sweep.undef === 0, JSON.stringify(sweep));
  check('the sweep is broad enough to be worth trusting', sweep.checked > 500, String(sweep.checked));
  check('distinct actions get distinct keys (no accidental collapse)',
    sweep.distinct > sweep.checked * 0.5, `${sweep.distinct} of ${sweep.checked}`);
}

console.log('\n--- 4. invariant 3: a tap resolves before any picture exists ---');
{
  // The source guard first, because it is the one that cannot be argued with.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(fs.readFileSync(path.join(SRC, 'nightscene.js'), 'utf8'));
  const rsrc = strip(fs.readFileSync(path.join(SRC, 'render.nightscene.js'), 'utf8'));
  check('Phase 4 did NOT put an await in nightscene.js', !/\bawait\b/.test(src));
  check('nor an async function', !/\basync\b/.test(src));
  check('nor either one in the painter', !/\bawait\b/.test(rsrc) && !/\basync\b/.test(rsrc));
  check('the frame request is fire-and-forget (.then, never awaited)', /\.then\(/.test(src));
  check('and the painter still has no hardcoded hex',
    (rsrc.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(h => h.toLowerCase() !== '#fff').length === 0);

  // Now the behavioural one. generateImage NEVER SETTLES for the whole of
  // this block: if any part of the tap path awaited a generation, nothing
  // below would be true.
  const fired = J(`(() => {
    __stall();
    __open(__G, __ID, { pose: 'back', covers: 'off' });
    currentGameState = __G;
    nightSession = __sess();
    nightSyncSelection(__G, nightSession);
    const before = { ...__G.npcs[__ID].flags._nightScene };
    const motions = nightMotionRow(nightPalette(__G, __ID), nightSession.sel);
    nightFire(motions[0]);
    const after = __G.npcs[__ID].flags._nightScene;
    return {
      moved: after.detection !== before.detection || after.floor !== before.floor,
      touches: after.touches.length,
      xpBanked: after.xp > 0,
      narration: nightSession.narration,
      ended: nightSession.ended,
      frameKey: nightSession.frameKey,
      hasAxes: !!nightSession.frameAxes,
      inFlight: nightSession.framesInFlight.size,
      stored: nightSession.frames.size,
      entered: __gen.entered,
    };
  })()`);
  check('the meters moved', fired.moved, JSON.stringify(fired));
  check('the action was committed to the record', fired.touches === 1, JSON.stringify(fired));
  check('the per-action XP was banked (D23)', fired.xpBanked);
  check('the authored line was composed (D30 — no model, no wait)',
    !!fired.narration && fired.narration.length > 10, fired.narration);
  check('the tableau was pointed at the new frame', !!fired.frameKey && fired.hasAxes, JSON.stringify(fired));
  check('a frame WAS requested and is marked in flight', fired.inFlight === 1, JSON.stringify(fired));
  check('nothing is stored yet, so the tableau shows the shimmer, not a stale picture',
    fired.stored === 0);
  // The sharpest form of invariant 3 there is: by the time the tap has fully
  // resolved, committed, narrated and painted, the generator has not even been
  // ENTERED — the request is a microtask behind, which is exactly where the
  // whole feature depends on it staying.
  check('and the generator has not even been entered yet — the tap did not wait a single tick',
    fired.entered === 0, String(fired.entered));

  const vm = J(`nightViewModel(__G, nightSession)`);
  check('the view model reports the frame as generating', vm.frameGenerating === true);
  check('and hands the painter no frame to show', vm.frame === null);
  check('while carrying the narration and the deltas the tap already produced',
    !!vm.narration && vm.deltas.length >= 2, JSON.stringify(vm.deltas));

  check('nightRequestFrame hands back a key synchronously, not a promise',
    api(`(() => { const k = nightRequestFrame(__G, nightSession, __axes(), 'landscape'); return typeof k === 'string'; })()`) === true);

  const landed = await A(`(async () => {
    await __quiesce();
    return { stored: nightSession.frames.size, inFlight: nightSession.framesInFlight.size,
             shown: nightSession.frames.has(nightSession.frameKey), entered: __gen.entered };
  })()`);
  check('the picture does arrive, on the key the tap pointed at', landed.shown, JSON.stringify(landed));
  check('and nothing is left marked in flight afterwards', landed.inFlight === 0, JSON.stringify(landed));
  api('nightReleaseFrames(nightSession);');
}

console.log('\n--- 5. D20: at most 8 in flight, and the surplus waits ---');
{
  check('the cap is declared as config, not as a literal', api('IMAGE_CACHE.maxInFlight') === 8);
  check('and imageFreeSlots reports the whole budget when nothing is running',
    api('imageFreeSlots()') === 8);

  const capped = await A(`(async () => {
    __stall();
    const running = [];
    for (let i = 0; i < 25; i++) running.push(generateImageTracked('p' + i, {}));
    await __drain(60);
    return { entered: __gen.entered, free: imageFreeSlots(), asked: running.length };
  })()`);
  check('25 simultaneous asks put no more than 8 into the generator',
    capped.entered <= 8, JSON.stringify(capped));
  check('and exactly 8, so the cap throttles rather than serialising',
    capped.entered === 8, JSON.stringify(capped));
  check('imageFreeSlots reports zero while the cap is full', capped.free === 0, JSON.stringify(capped));

  const drained = await A(`(async () => {
    await __quiesce();
    return { entered: __gen.entered, waiting: __gen.releases.length, free: imageFreeSlots(), busy: imageBusy() };
  })()`);
  check('the queued asks all eventually run — waiting, never dropped',
    drained.entered === 25, JSON.stringify(drained));
  check('every slot is returned once the work finishes', drained.free === 8, JSON.stringify(drained));
  check('and imageBusy goes quiet again', drained.busy === false, JSON.stringify(drained));
}

console.log('\n--- 6. D20: the speculative fan-out spends only free slots ---');
{
  const pre = J(`(() => {
    __stall();
    __open(__G, __ID, { pose: 'back', covers: 'off' });
    currentGameState = __G;
    nightSession = __sess();
    nightSyncSelection(__G, nightSession);
    const vm = nightViewModel(__G, nightSession);
    const fired = nightPrefetchFrames(__G, nightSession, vm);
    return { fired, motions: vm.motions.length, inFlight: nightSession.framesInFlight.size };
  })()`);
  check('a fresh selection warms the motion chips on screen', pre.fired > 0, JSON.stringify(pre));
  check('it never warms more chips than there are', pre.fired <= pre.motions, JSON.stringify(pre));
  check('and never more than the cap', pre.fired <= 8, JSON.stringify(pre));
  check('every warmed frame is tracked as in flight', pre.inFlight === pre.fired, JSON.stringify(pre));

  const again = J(`(() => {
    const before = nightSession.framesInFlight.size;
    const fired = nightPrefetchFrames(__G, nightSession, nightViewModel(__G, nightSession));
    return { fired, before, after: nightSession.framesInFlight.size };
  })()`);
  check('re-running the fan-out over the same selection asks for nothing twice',
    again.fired === 0 && again.after === again.before, JSON.stringify(again));

  const full = await A(`(async () => {
    await __quiesce();
    nightReleaseFrames(nightSession);
    __stall();
    // Fill the cap from elsewhere: a guess has no business queueing behind a
    // frame the player is actually waiting on.
    for (let i = 0; i < IMAGE_CACHE.maxInFlight; i++) generateImageTracked('hog' + i, {});
    await __drain(40);
    const free = imageFreeSlots();
    const fired = nightPrefetchFrames(__G, nightSession, nightViewModel(__G, nightSession));
    await __quiesce();
    return { free, fired };
  })()`);
  check('with the cap already full the fan-out fires nothing at all',
    full.free === 0 && full.fired === 0, JSON.stringify(full));

  // The signature is what stops a pace tap from re-firing the fan-out: pace is
  // not in the image key, so those frames are already held.
  const sig = J(`(() => ({
    gentle: nightPrefetchSignature({ regionKey: 'chest#0', partId: 'nipple', side: 'both', instrumentId: 'fingers', paceId: 'gentle' }),
    firm:   nightPrefetchSignature({ regionKey: 'chest#0', partId: 'nipple', side: 'both', instrumentId: 'fingers', paceId: 'firm' }),
    left:   nightPrefetchSignature({ regionKey: 'chest#0', partId: 'nipple', side: 'left', instrumentId: 'fingers', paceId: 'gentle' }),
  }))()`);
  check('a pace change does not re-fire the fan-out', sig.gentle === sig.firm, JSON.stringify(sig));
  check('a side change does', sig.gentle !== sig.left, JSON.stringify(sig));
  check('and an empty selection has no signature at all', api(`nightPrefetchSignature(null)`) === '');
  api('nightReleaseFrames(nightSession);');
}

console.log('\n--- 7. D37: the store is session-local, and it is released ---');
{
  // The shared LRU is never touched. A source scan rather than a spy, because
  // this is a rule about what the code MAY reach for, and the temptation a
  // later session will feel is to "fix" it back into the cache.
  const img = fs.readFileSync(path.join(SRC, 'image.js'), 'utf8');
  const start = img.indexOf('// --- Night-scene frames');
  const end = img.indexOf('// --- Canvas to Blob ---', start);
  // Comments are stripped first, for the reason verify-night-p3.js's own
  // async scan strips them: both files EXPLAIN this rule in prose ("do NOT
  // route these through getCachedImage/setCachedImage"), and a scan that reads
  // its own documentation as a violation punishes writing the rule down.
  const strip2 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const block = strip2(img.slice(start, end));
  check('the night-frame block exists where it says it does', start > 0 && end > start);
  check('and never reaches for the shared image LRU (D37)',
    !/getCachedImage|setCachedImage/.test(block));
  check('nor for createObjectUrl, whose registry outlives the session',
    !/createObjectUrl\(/.test(block));
  const ns = strip2(fs.readFileSync(path.join(SRC, 'nightscene.js'), 'utf8'));
  check('and neither does the decider that owns the store',
    !/getCachedImage|setCachedImage/.test(ns));

  const lifecycle = await A(`(async () => {
    __stall();
    __open(__G, __ID, { pose: 'back', covers: 'off' });
    currentGameState = __G;
    nightSession = __sess();
    nightSyncSelection(__G, nightSession);
    const urlsAtStart = __objectUrlsLive.size;
    const k1 = nightRequestFrame(__G, nightSession, __axes(), 'landscape');
    const k2 = nightRequestFrame(__G, nightSession, __axes({ motionId: 'pinch' }), 'landscape');
    const dupe = nightRequestFrame(__G, nightSession, __axes(), 'landscape');
    const inFlight = nightSession.framesInFlight.size;
    await __quiesce();
    const entry = nightSession.frames.get(k1);
    nightSession.frameKey = k1;
    nightSession.frameAxes = __axes();
    return { k1, k2, sameKey: dupe === k1, inFlight,
             stored: nightSession.frames.size,
             urls: __objectUrlsLive.size - urlsAtStart,
             hasRecipe: !!(entry && entry.prompt && entry.seed != null && entry.shape) };
  })()`);
  check('two different actions ask for two different frames', lifecycle.k1 !== lifecycle.k2);
  check('asking twice for the same one does not double-generate',
    lifecycle.sameKey && lifecycle.inFlight === 2, JSON.stringify(lifecycle));
  check('both land in the session store', lifecycle.stored === 2, JSON.stringify(lifecycle));
  check('each one holding the recipe the ⓘ modal needs (D21)', lifecycle.hasRecipe);
  check('and each one holding exactly one live object URL', lifecycle.urls === 2, JSON.stringify(lifecycle));

  const released = J(`(() => {
    const before = __objectUrlsLive.size;
    nightReleaseFrames(nightSession);
    return { before, after: __objectUrlsLive.size, stored: nightSession.frames.size, key: nightSession.frameKey };
  })()`);
  check('releasing the session revokes every URL it held',
    released.after === released.before - 2, JSON.stringify(released));
  check('and empties the store rather than leaving dangling handles',
    released.stored === 0 && released.key === null, JSON.stringify(released));

  // A frame that lands after the session is gone must not resurrect it.
  const orphan = J(`(() => {
    const dead = { targetId: __ID, frames: new Map(), framesInFlight: new Set(['k']), frameKey: 'k' };
    const took = nightAcceptFrame(dead, 'k', { blob: { size: 1 }, prompt: 'p', seed: 1, shape: 'landscape' });
    return { took, stored: dead.frames.size, inFlight: dead.framesInFlight.size };
  })()`);
  check('a frame arriving for a session that is gone is dropped, not stored',
    orphan.took === false && orphan.stored === 0, JSON.stringify(orphan));
  check('and its in-flight marker is cleared anyway', orphan.inFlight === 0);
}

console.log('\n--- 8. D21: the reroll overwrites the same key ---');
{
  const rerolled = await A(`(async () => {
    __stall();
    __open(__G, __ID, { pose: 'back', covers: 'off' });
    currentGameState = __G;
    nightSession = __sess();
    nightSyncSelection(__G, nightSession);
    const axes = __axes();
    const key = nightRequestFrame(__G, nightSession, axes, 'landscape');
    nightSession.frameKey = key; nightSession.frameAxes = axes;
    await __quiesce();
    const first = nightSession.frames.get(key);
    const liveBefore = __objectUrlsLive.size;

    const p = nightRerollFrame({ prompt: 'an edited prompt', seed: 4242, negativePrompt: 'neg' });
    await __quiesce();
    const res = await p;
    const second = nightSession.frames.get(key);
    return {
      ok: !!(res && res.ok),
      frameCount: nightSession.frames.size,
      replaced: first.url !== second.url,
      oldRevoked: !__objectUrlsLive.has(first.url),
      liveSame: __objectUrlsLive.size === liveBefore,
      prompt: second.prompt, seed: second.seed, neg: second.negativePrompt,
    };
  })()`);
  check('the reroll reports success', rerolled.ok, JSON.stringify(rerolled));
  check('it writes back to the SAME key rather than adding a second frame',
    rerolled.frameCount === 1, JSON.stringify(rerolled));
  check('the new pixels replace the old ones', rerolled.replaced, JSON.stringify(rerolled));
  check('and the rejected frame is revoked — gone, never shown again (D21)',
    rerolled.oldRevoked && rerolled.liveSame, JSON.stringify(rerolled));
  check('the edited prompt, seed and negative are what got used',
    rerolled.prompt === 'an edited prompt' && rerolled.seed === 4242 && rerolled.neg === 'neg',
    JSON.stringify(rerolled));

  const untouched = await A(`(async () => {
    // An untouched seed field must roll a FRESH one: the player opened this
    // modal because the frame was wrong, and handing back the deterministic
    // seed would hand back the same picture.
    const before = nightSession.frames.get(nightSession.frameKey).seed;
    const p = nightRerollFrame({ prompt: 'x', seed: null });
    await __quiesce();
    await p;
    return { before, after: nightSession.frames.get(nightSession.frameKey).seed };
  })()`);
  check('leaving the seed alone rolls a fresh one rather than reproducing the rejected frame',
    untouched.after !== untouched.before, JSON.stringify(untouched));

  const noFrame = await A(`(async () => { nightReleaseFrames(nightSession); return await nightRerollFrame({ prompt: 'x' }); })()`);
  check('rerolling with no frame on screen refuses instead of throwing', !!noFrame.error, JSON.stringify(noFrame));
}

console.log('\n--- 9. D24: the scene runs live, and reads the clock it never advances ---');
{
  check('there is a nightscene time context', api(`typeof TIME_DILATION.scales.nightscene`) === 'number');
  check('and its scale is 1 — one game-second per real second',
    api('TIME_DILATION.scales.nightscene') === 1);
  check('which is the same scale conversation already uses (D24 says so in as many words)',
    api('TIME_DILATION.scales.nightscene') === api('TIME_DILATION.scales.conversation'));
  check('and far slower than idle, which is what makes time in here a real cost',
    api('TIME_DILATION.scales.nightscene') < api('TIME_DILATION.scales.idle'));

  // SINGLE CLOCK OWNER. The scene reads; TIME advances. peek.js's discipline.
  const src = fs.readFileSync(path.join(SRC, 'nightscene.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  check('the scene never advances the clock itself',
    !/advanceClockMinutes|advanceAndResolve|advanceClock\b/.test(src));
  check('and pushes and pops its context exactly once each',
    (src.match(/pushTimeContext\(/g) || []).length === 1
    && (src.match(/popTimeContext\(/g) || []).length === 1);

  const elapsed = J(`(() => {
    const g = JSON.parse(JSON.stringify(__G));
    g.meta.clock = { day: 3, minutes: 100.0, phase: 'late_night' };
    const rec = { openedDay: 3, openedMinute: 10000 };
    const same = nightElapsedMinutes(g, rec);
    g.meta.clock.minutes = 102.5;
    const later = nightElapsedMinutes(g, rec);
    g.meta.clock = { day: 4, minutes: 5.0, phase: 'early_morning' };
    const overnight = nightElapsedMinutes(g, rec);
    return { same, later, overnight };
  })()`);
  check('elapsed reads zero at the instant the session opened', elapsed.same === 0, JSON.stringify(elapsed));
  check('and counts up with the clock', Math.abs(elapsed.later - 2.5) < 1e-9, JSON.stringify(elapsed));
  check('and survives a midnight rollover rather than going negative',
    Math.abs(elapsed.overnight - 1345) < 1e-9, JSON.stringify(elapsed));
  check('a missing clock reads zero instead of NaN',
    api(`nightElapsedMinutes(null, { openedDay: 1, openedMinute: 0 })`) === 0);

  check('the label is a stopwatch, not a meter',
    api(`nightElapsedLabel(0)`) === '0:00' && api(`nightElapsedLabel(1)`) === '1:00'
    && api(`nightElapsedLabel(2.5)`) === '2:30' && api(`nightElapsedLabel(0.05)`) === '0:03',
    api(`nightElapsedLabel(2.5)`));
  check('and never renders a negative time', api(`nightElapsedLabel(-9)`) === '0:00');

  const vmClock = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off' });
    nightSession = __sess();
    nightSyncSelection(__G, nightSession);
    return nightViewModel(__G, nightSession);
  })()`);
  check('the painter is handed the elapsed label, already formatted',
    /^\d+:\d\d$/.test(vmClock.elapsed), String(vmClock.elapsed));
  check('and the box shape to lock the frame to (D19)',
    ['portrait', 'square', 'landscape'].includes(vmClock.frameShape), String(vmClock.frameShape));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
}

main();
