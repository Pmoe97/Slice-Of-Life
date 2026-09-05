// night-scene-sleeping-npc-plan.md — Phase 6: integration and tuning.
//
//   node src/src/dev/verify/verify-night-p6.js
//
// Phase 6 is the phase where the Night Scene becomes reachable, becomes
// pressurable by the rest of the house, and stops being written in one
// person's pronouns. Four things land, and each has a way of going wrong that
// this harness is built around.
//
//   1. THE ENTRY CHIP (D13). The failure mode is a chip that offers something
//      the gate will refuse. render.js drops the row unless
//      resolveNightSceneGate allows it, ui.js intercepts the verb BEFORE the
//      registered-action bridge (the door.keyhole pattern), and the def
//      carries no timeCost/effects/narration because nothing about it ever
//      goes through executeAction. All three are asserted, and the verb is
//      asserted never to surface as a flat chip.
//
//   2. THE SHADOW LAYER. The failure mode is a PARALLEL CHANNEL — invariant
//      6's rule, which D25 already extended to consequences and this phase
//      extends to exogenous risk. A cue is not a delta the controller applies
//      by hand: it is a composed action id in an `ambient` region that
//      resolves through nightStepAction, so it pays the same tier multiplier,
//      the same skill scaling, the same [Stirring, 100] clamp and the same
//      monotonic Stirring a touch pays. Asserted by resolving cues and
//      diffing them, and by asserting the region is never in the tray and
//      `world` never in the instrument row.
//
//   3. THE REGISTER. The failure mode is a masculine target being called
//      "she" somewhere nobody looked. The whole bucket is authored in the
//      feminine and swapped by ONE function (nightRegister), so the assertion
//      that actually protects it is the sweep: build a whole view model and a
//      composed line for every part the palette offers against a male target,
//      and fail on a single bare she/her/hers/herself. Plus the source guard
//      — no feminine literal left in either night file, which is what stops
//      the next session reintroducing one by hand.
//
//   4. D28's LEARNING (writer AND marker, which the plan said must land
//      together or not at all). The failure mode is a marker that shows what
//      the player has not earned. Nothing is known before `learnAfter`
//      repeats; a NEUTRAL part is never learned however many times it is
//      worked, so an unmarked chip stays ambiguous; and it is written to the
//      PLAYER, never to her.
//
// Plus Q2's answer (strength is now read by the CONSEQUENCE, not only by the
// odds) and Q5's tuning, which is asserted as the design GOALS rather than as
// magnitudes — a maxed-stealth session's Stirring barely moves, an unskilled
// one against a cold sleeper does not get the same session for free, and cold
// vs warm differ by a lot rather than a little. Retuning the curves must keep
// those true; it must not have to keep any particular number true.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'state.js', 'sim.js', 'skills.js', 'npc.js', 'willingness.js',
             'relationships.js', 'effects.js', 'actions.js', 'codex.js', 'world.js',
             'boundary.js', 'nightscene.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

api(`
  var currentGameState = null;
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260906, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'bedroom_1';
    g.player.skills = { stealth: 0 };
    g.player.ledger = {};
    g.player.nightKnown = {};
    return g;
  };
  __target = (g) => Object.keys(g.npcs).find(id => g.npcs[id].residency.status === 'resident');
  __sleep = (g, id, roomId) => {
    g.npcs[id] = { ...g.npcs[id], location: roomId, activity: 'sleeping' };
    g.player.location = roomId;
  };
  // Everyone ELSE asleep and out of the way, so the shadow layer is silent
  // unless a test deliberately puts somebody somewhere.
  __hush = (g, exceptId) => {
    for (const id of Object.keys(g.npcs)) {
      if (id === exceptId) continue;
      g.npcs[id] = { ...g.npcs[id], activity: 'sleeping', location: 'bedroom_2' };
    }
  };
  __open = (g, id, over) => {
    const rec = { targetId: id, openedDay: g.meta.clock.day, openedMinute: Math.floor(g.meta.clock.minutes * 100),
      detection: 0, floor: 0, heat: 0, evidence: [], touches: [],
      pose: 'back', covers: 'off', climaxCount: 0, xp: 0, resolved: null };
    g.npcs[id] = { ...g.npcs[id], flags: { ...(g.npcs[id].flags||{}), _nightScene: { ...rec, ...(over||{}) } } };
    return g.npcs[id].flags._nightScene;
  };
  __clone = (o) => JSON.parse(JSON.stringify(o));
  __male = (g, id) => { g.npcs[id] = { ...g.npcs[id], bible: { ...g.npcs[id].bible, gender: 'male' } }; };
  __cold = (g, id) => {
    g.npcs[id] = { ...g.npcs[id], relPlayer: { trust: 0, affection: 0, tension: 0, respect: 0,
      desire: 0, comfort: 0, grievances: [], conversationPhase: 'stranger' } };
  };
  __warm = (g, id) => {
    g.npcs[id] = { ...g.npcs[id], relPlayer: { trust: 90, affection: 90, tension: 0, respect: 80,
      desire: 80, comfort: 90, grievances: [], conversationPhase: 'close' } };
  };
  __sess = (id) => ({ targetId: id, sel: null, lastResult: null, narration: '', confirming: false,
    trayOpen: false, ended: false, endOutcome: null, endResult: null, climaxBeat: false,
    cueSlot: 0, cueResult: null, onClick: null, onKey: null,
    frames: new Map(), framesInFlight: new Set(), frameKey: null, frameAxes: null, prefetchSel: null });
  // The first composable touch the palette actually offers from this state —
  // the tuning runs need a real action id, not a hand-written one a future
  // grammar change would silently invalidate.
  __firstAction = (g, id, paceId) => {
    const p = nightPalette(g, id);
    for (const r of p.regions) {
      if (r.kind !== 'touch') continue;
      for (const part of r.parts) {
        const row = part.instruments[0];
        return composeNightActionId(part.partId, part.sides[0], row.instrumentId, row.motions[0], paceId || 'steady');
      }
    }
    return null;
  };
  root.generateImage = () => new Promise(() => {});
`);

// ---------------------------------------------------------------- 1
console.log('\n1. D13: the entry chip is the front door, and it is the ONLY door');
{
  const r = J(`(() => {
    const def = ACTION_DEFS['boundary.night_scene'];
    const parent = ACTION_DEFS['bed.interact'];
    const g = __mk(1); const id = __target(g); __sleep(g, id, 'bedroom_1');
    const avail = resolveAvailableActions(g).map(a => a.actionId);
    return {
      exists: !!def,
      inSubmenu: (parent.submenu || []).indexOf('boundary.night_scene'),
      submenuLength: (parent.submenu || []).length,
      sourceKind: def && def.source && def.source.kind,
      label: def && def.label,
      pipelineFields: def ? ['timeCost', 'effects', 'narration', 'prepare', 'delegate', 'outcomeWindow']
        .filter(k => Object.prototype.hasOwnProperty.call(def, k)) : null,
      flat: avail.indexOf('boundary.night_scene') >= 0,
      siblingsKept: !!ACTION_DEFS['boundary.sleep_with'] && !!ACTION_DEFS['boundary.sleep_watch'],
    };
  })()`);
  check('boundary.night_scene is a registered action def', r.exists);
  check('...in the bed submenu, FIRST (it is the interesting verb of the three)', r.inSubmenu === 0);
  check('...alongside the two one-roll bed verbs, which are different acts and were NOT deleted',
    r.siblingsKept && r.submenuLength === 3);
  check("...with source kind 'paired', which actionSourceMatches rejects", r.sourceKind === 'paired');
  check('...so it never surfaces as a flat chip', r.flat === false);
  check('...and carries no action-pipeline fields, because it never reaches executeAction',
    Array.isArray(r.pipelineFields) && r.pipelineFields.length === 0, JSON.stringify(r.pipelineFields));
  check('the label names the sleeper', /\{name\}/.test(r.label || ''), r.label);

  const rj = strip(fs.readFileSync(path.join(SRC, 'render.js'), 'utf8'));
  const uj = strip(fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8'));
  check('render.js drops the row unless resolveNightSceneGate allows it',
    /boundary\.night_scene[\s\S]{0,400}?resolveNightSceneGate/.test(rj));
  check('ui.js intercepts the verb and hands it to startNightScene',
    /action === 'boundary\.night_scene'[\s\S]{0,600}?startNightScene\(/.test(uj));
  // The bridge is handleAction's own `if (ACTION_DEFS[action]) await
  // runRegisteredAction(action, extra)` — not the two unrelated call sites
  // elsewhere in the file — so anchor on that exact line.
  check('...BEFORE the registered-action bridge (the door.keyhole pattern)',
    uj.indexOf("action === 'boundary.night_scene'")
      < uj.indexOf('await runRegisteredAction(action, extra)'));
  check('...and never through openActionWindow, which would pause the D24 clock',
    !/boundary\.night_scene[\s\S]{0,600}?openActionWindow\(/.test(uj));
}

// ---------------------------------------------------------------- 2
console.log('\n2. D13: the chip appears exactly when the gate would allow it, and not otherwise');
{
  const r = J(`(() => {
    const g = __mk(2); const id = __target(g); __sleep(g, id, 'bedroom_1');
    const gate = (over) => {
      const before = __clone(g.npcs[id]);
      if (over) g.npcs[id] = { ...g.npcs[id], ...over };
      const out = resolveNightSceneGate(g, id, { location: 'bedroom_1' });
      g.npcs[id] = before;
      return { allowed: out.allowed, reason: out.reason };
    };
    const awake = gate({ activity: 'reading' });
    const cold = gate({ flags: { ...(g.npcs[id].flags||{}), _coldShoulder: { severity: 3, since: g.meta.clock.day, cause: 'x' } } });
    const busy = gate({ flags: { ...(g.npcs[id].flags||{}), _nightScene: { targetId: id, resolved: null } } });
    const elsewhere = (() => {
      const before = g.npcs[id].location;
      g.npcs[id] = { ...g.npcs[id], location: 'kitchen' };
      const out = resolveNightSceneGate(g, id, { location: 'bedroom_1' });
      g.npcs[id] = { ...g.npcs[id], location: before };
      return { allowed: out.allowed, reason: out.reason };
    })();
    return { ok: gate(null), awake, cold, busy, elsewhere };
  })()`);
  check('a resident asleep in this room passes', r.ok.allowed === true);
  check('an awake one does not', r.awake.allowed === false && r.awake.reason === 'not_asleep');
  check('a cold-shouldered one does not', r.cold.allowed === false && r.cold.reason === 'cold_shoulder');
  check('one already mid-session does not', r.busy.allowed === false && r.busy.reason === 'already_active');
  check('one in another room does not', r.elsewhere.allowed === false && r.elsewhere.reason === 'not_here');
}

// ---------------------------------------------------------------- 3
console.log('\n3. the shadow layer is a REGION, not a channel: never in the tray, always in the resolver');
{
  const r = J(`(() => {
    const g = __mk(3); const id = __target(g); __sleep(g, id, 'bedroom_1');
    __open(g, id);
    const p = nightPalette(g, id);
    const cfg = BOUNDARY.nightScene;
    const ambientParts = Object.keys(cfg.parts).filter(k => cfg.parts[k].region === 'ambient');
    const paletteParts = [];
    for (const reg of p.regions) for (const part of reg.parts) paletteParts.push(part.partId);
    const actionId = composeNightActionId('noise_near', '-', 'world', 'cue', 'steady');
    return {
      regionDeclared: !!cfg.regions.ambient && cfg.regions.ambient.kind === 'ambient',
      ambientParts,
      inPalette: paletteParts.filter(x => ambientParts.indexOf(x) >= 0),
      regionTabs: p.regions.map(x => x.regionId),
      instrumentRow: (p.instruments || []).map(i => i.id),
      worldResolves: !!nightInstrumentDef(g, 'world'),
      worldNotInInstruments: !cfg.instruments.world,
      valid: nightActionValid(g, id, actionId).ok,
      motionFamily: cfg.motions.cue.family,
    };
  })()`);
  check('an `ambient` region is declared and marked as such', r.regionDeclared);
  check('...with its own parts', r.ambientParts.length === 3, JSON.stringify(r.ambientParts));
  check('the tray NEVER renders it', r.regionTabs.indexOf('ambient') < 0, JSON.stringify(r.regionTabs));
  check('...nor any of its parts', r.inPalette.length === 0, JSON.stringify(r.inPalette));
  check("the `world` instrument is NOT in the tray's instrument row",
    r.instrumentRow.indexOf('world') < 0 && r.worldNotInInstruments, JSON.stringify(r.instrumentRow));
  check('...but it resolves, which is what makes a cue a legal composed id', r.worldResolves);
  check('and a cue id passes the D31 gatekeeper unmodified', r.valid === true);
  check('the cue motion has its own family, so it is never drawn into a heat step or a preference',
    r.motionFamily === 'ambient');
}

// ---------------------------------------------------------------- 4
console.log('\n4. ...and it pays exactly what a touch pays: the same clamps, the same monotonic Stirring');
{
  const r = J(`(() => {
    const g = __mk(4); const id = __target(g); __sleep(g, id, 'bedroom_1');
    const rec = __open(g, id, { detection: 20, floor: 12, heat: 40 });
    const cue = (partId) => nightStepAction(g, id, composeNightActionId(partId, '-', 'world', 'cue', 'steady'), 0);
    const near = cue('noise_near');
    const far = cue('noise_far');
    const here = cue('noise_here');
    g.player.skills = { stealth: 4000 };   // skillLevel = floor(sqrt(xp/40)) -> 10
    const nearSkilled = cue('noise_near');
    g.player.skills = { stealth: 0 };
    __warm(g, id); const nearWarm = cue('noise_near');
    __cold(g, id); const nearCold = cue('noise_near');
    __open(g, id, { detection: 99, floor: 40, heat: 0 });
    const wake = cue('noise_here');
    return {
      order: [far.wakeDelta, near.wakeDelta, here.wakeDelta],
      heat: [far.heatDelta, near.heatDelta, here.heatDelta],
      xp: [far.xp, near.xp, here.xp],
      ambientFlag: [far.ambient, near.ambient, here.ambient],
      stirPositive: near.stirDelta > 0 && here.stirDelta > 0 && far.stirDelta > 0,
      neverBelowFloor: near.detection >= rec.floor && near.floor >= rec.floor,
      evidence: near.evidenceAdded,
      skillCuts: nearSkilled.wakeDelta < near.wakeDelta,
      tier: [nearWarm.wakeDelta, nearCold.wakeDelta],
      woke: wake.woke, outcome: wake.outcome, capped: wake.detection,
      wakeAt: BOUNDARY.nightScene.thresholds.detectionWake,
      deterministic: JSON.stringify(cue('noise_near')) === JSON.stringify(cue('noise_near')),
    };
  })()`);
  check('the three distances cost more the closer they are',
    r.order[0] < r.order[1] && r.order[1] < r.order[2], JSON.stringify(r.order));
  check('a cue carries no heat at all — it is risk, never reward',
    r.heat.every(h => h === 0), JSON.stringify(r.heat));
  check('...and no XP: D23 rewards an action COMPLETED, not a noise survived',
    r.xp.every(x => x === 0), JSON.stringify(r.xp));
  check('...and says so on the result', r.ambientFlag.every(f => f === true));
  check('Stirring still rises, permanently, exactly as it does on a touch', r.stirPositive);
  check('and Wakefulness never ducks under it', r.neverBelowFloor);
  check('a cue leaves no evidence — nobody undressed anybody', r.evidence.length === 0);
  check("the player's stealth still scales it (no bypass of skillMult)", r.skillCuts);
  check('the sleeper’s tier still scales it (no bypass of tierRiskMult)',
    r.tier[1] > r.tier[0], JSON.stringify(r.tier));
  check('a cue can force a wake like anything else, at the same cap',
    r.woke === true && r.capped === r.wakeAt);
  check('...and D29 decides willing vs hostile there, not the cue',
    r.outcome === 'wake_willing' || r.outcome === 'wake_hostile');
  check('and it is deterministic from the seed, like every other resolver here', r.deterministic);
}

// ---------------------------------------------------------------- 5
console.log('\n5. who makes the noise: awake third parties only, closest wins, a sleeping house is silent');
{
  const r = J(`(() => {
    const g = __mk(5); const id = __target(g); __sleep(g, id, 'bedroom_1'); __hush(g, id);
    __open(g, id);
    const others = Object.keys(g.npcs).filter(x => x !== id);
    const put = (who, room, act) => { g.npcs[who] = { ...g.npcs[who], location: room, activity: act || 'reading' }; };
    const prox = () => nightAmbientProximity(g, id);
    const silent = prox();
    put(others[0], 'bedroom_1'); const here = prox();
    put(others[0], 'hallway_a'); const near = prox();
    put(others[0], 'kitchen');   const far = prox();
    put(others[0], 'kitchen', 'sleeping'); const asleep = prox();
    const selfOnly = (() => { for (const o of others) put(o, 'kitchen', 'sleeping'); return prox(); })();
    put(others[0], 'kitchen'); put(others[others.length - 1], 'bedroom_1');
    const closest = prox();
    return {
      others: others.length,
      silent, here: here && here.proximity, near: near && near.proximity, far: far && far.proximity,
      asleep, selfOnly, closest: closest && closest.proximity,
      adjacency: (ROOM_ADJACENCY['bedroom_1'] || []).indexOf('hallway_a') >= 0,
    };
  })()`);
  check('the room the scene is in is adjacent to a hallway (the premise of `near`)', r.adjacency);
  check('an all-asleep house makes no noise at all', r.silent === null);
  check('somebody in the room reads as `here`', r.here === 'here');
  check('somebody one door away reads as `near`', r.near === 'near');
  check('somebody elsewhere in the flat reads as `far`', r.far === 'far');
  check('a sleeping third party makes no noise', r.asleep === null);
  check('and the sleeping target is never noise about herself', r.selfOnly === null);
  check('with several people up, the CLOSEST decides the cue', r.closest === 'here');
}

// ---------------------------------------------------------------- 6
console.log('\n6. the cue itself: rolled once per elapsed bucket, reproducible from the save');
{
  const r = J(`(() => {
    const g = __mk(6); const id = __target(g); __sleep(g, id, 'bedroom_1'); __hush(g, id);
    __open(g, id);
    const others = Object.keys(g.npcs).filter(x => x !== id);
    g.npcs[others[0]] = { ...g.npcs[others[0]], location: 'hallway_a', activity: 'reading' };
    const slots = [];
    for (let i = 1; i <= 40; i++) slots.push(nightAmbientCue(g, id, i));
    const fired = slots.filter(Boolean);
    const again = [];
    for (let i = 1; i <= 40; i++) again.push(nightAmbientCue(g, id, i));
    const resolved = g.npcs[id].flags._nightScene;
    g.npcs[id] = { ...g.npcs[id], flags: { ...g.npcs[id].flags, _nightScene: { ...resolved, resolved: 'exit' } } };
    const afterEnd = nightAmbientCue(g, id, 99);
    return {
      firedCount: fired.length, total: slots.length,
      ids: [...new Set(fired.map(c => c.actionId))],
      stable: JSON.stringify(slots) === JSON.stringify(again),
      afterEnd,
      chance: BOUNDARY.nightScene.ambient.chance,
      everyMinutes: BOUNDARY.nightScene.ambient.everyMinutes,
    };
  })()`);
  check('not every bucket fires — the house is not a metronome',
    r.firedCount > 0 && r.firedCount < r.total, `${r.firedCount}/${r.total}`);
  check('...at roughly the configured rate', Math.abs(r.firedCount / r.total - r.chance) < 0.25,
    `${r.firedCount}/${r.total} vs ${r.chance}`);
  check('the same slot always rolls the same answer (reproducible from the save)', r.stable);
  check('a `near` proximity composes the `near` cue and nothing else',
    r.ids.length === 1 && /^noise_near\./.test(r.ids[0]), JSON.stringify(r.ids));
  check('and a resolved session can never be disturbed', r.afterEnd === null);
  check('the cadence is real game-minutes, not ticks', r.everyMinutes > 0);
}

// ---------------------------------------------------------------- 7
console.log('\n7. the register: one function, and a male target is never called "she"');
{
  const r = J(`(() => {
    const g = __mk(7); const id = __target(g); __sleep(g, id, 'bedroom_1'); __hush(g, id); __male(g, id);
    __open(g, id, { pose: 'back', covers: 'off' });
    const s = __sess(id);
    const vm = nightViewModel(g, s);
    const bad = [];
    const re = /\\bher\\b|\\bshe\\b|\\bhers\\b|\\bherself\\b|\\{o\\}/i;
    const scan = (label, text) => {
      if (typeof text !== 'string') return;
      if (re.test(text)) bad.push(label + ': ' + text);
    };
    scan('stateLine', vm.stateLine); scan('selectionLine', vm.selectionLine);
    scan('narration', vm.narration);
    for (const k of Object.keys(vm.copy)) scan('copy.' + k, vm.copy[k]);
    for (const reg of vm.palette.regions) {
      scan('region', reg.label);
      for (const part of reg.parts) { scan('part', part.label); scan('standalone', part.standalone); }
    }
    for (const m of vm.motions) scan('motion', m.label);
    let lines = 0;
    for (const reg of vm.palette.regions) {
      for (const part of reg.parts) {
        for (const side of part.sides) {
          const row = part.instruments[0];
          const actionId = composeNightActionId(part.partId, side, row.instrumentId, row.motions[0], 'steady');
          const res = nightStepAction(g, id, actionId, lines);
          if (!res) continue;
          lines++;
          scan('line/' + actionId, composeNightLine(g, id, res, lines).text);
        }
      }
    }
    // every ambient cue's line too — the shadow layer has its own pools
    for (const partId of ['noise_far', 'noise_near', 'noise_here']) {
      const res = nightStepAction(g, id, composeNightActionId(partId, '-', 'world', 'cue', 'steady'), 1);
      if (res) scan('cue/' + partId, composeNightLine(g, id, res, 1).text);
    }
    return { bad, lines };
  })()`);
  check('a whole view model against a male target contains no feminine pronoun',
    r.bad.length === 0, JSON.stringify(r.bad.slice(0, 6), null, 1));
  check('...and neither does a composed line for every part the tray offers',
    r.lines > 30, `${r.lines} lines composed`);
}

// ---------------------------------------------------------------- 8
console.log('\n8. ...while a female target reads exactly as it always did, and the swap is idempotent');
{
  const r = J(`(() => {
    const f = { bible: { gender: 'female' } };
    const m = { bible: { gender: 'male' } };
    const t = { bible: { gender: 'trans_male' } };
    const fut = { bible: { gender: 'futanari' } };
    const src = 'She takes her hand off {o}, and it is hers, not herself.';
    const once = nightRegister(src, m);
    return {
      fem: nightRegister(src, f),
      masc: once,
      twice: nightRegister(once, m),
      transMale: nightRegister('She is here.', t),
      futa: nightRegister('She is here.', fut),
      noTarget: nightRegister(src, null),
      untouched: nightRegister('The other sheets gather together.', m),
    };
  })()`);
  check('the feminine is the authored register, so it only expands the token',
    r.fem === 'She takes her hand off her, and it is hers, not herself.', r.fem);
  check('the masculine swaps subject, possessive, object, possessive-pronoun and reflexive',
    r.masc === 'He takes his hand off him, and it is his, not himself.', r.masc);
  check('and the swap is idempotent, which is what lets it be applied anywhere',
    r.twice === r.masc, r.twice);
  check('trans_male reads masculine (the grouping the rest of the engine uses)',
    r.transMale === 'He is here.');
  check('futanari reads feminine (the same grouping, other side)', r.futa === 'She is here.');
  check('a missing target falls back to the authored feminine rather than throwing',
    r.noTarget === r.fem);
  check('words that merely CONTAIN "her" are left alone',
    r.untouched === 'The other sheets gather together.', r.untouched);
}

// ---------------------------------------------------------------- 9
console.log('\n9. ...and no feminine literal is left in the night files for the next session to trip on');
{
  const ns = strip(fs.readFileSync(path.join(SRC, 'nightscene.js'), 'utf8'));
  const rn = strip(fs.readFileSync(path.join(SRC, 'render.nightscene.js'), 'utf8'));
  const literals = (src) => (src.match(/'[^'\n]*'|`[^`\n]*`/g) || [])
    .filter(s => /\bher\b|\bshe\b|\bHer\b|\bShe\b/.test(s));
  const rnBad = literals(rn);
  check('render.nightscene.js holds no gendered string at all',
    rnBad.length === 0, JSON.stringify(rnBad));
  // nightscene.js keeps the end block's own copy (NIGHT_END_COPY and the
  // receipt rows nightEndSummary builds), because those are composed from the
  // consequence layer's return rather than from a config pool. They are
  // authored in the feminine like everything else and pass through
  // nightRegisterEnd — so the assertion is not "there are none", it is "every
  // one of them is inside the block that gets registered".
  const from = ns.indexOf('const NIGHT_END_COPY');
  const to = ns.indexOf('function nightRegisterConfirm');
  const outside = literals(ns.slice(0, from) + ns.slice(to));
  check('the end block is where the file’s remaining authored copy lives', from > 0 && to > from);
  check('...and nothing gendered is left ANYWHERE else in nightscene.js',
    outside.length === 0, JSON.stringify(outside));
  check('...and both composite end/confirm blocks are registered before the painter sees them',
    /nightRegisterEnd\(/.test(ns) && /nightRegisterConfirm\(/.test(ns));
  check('the view model registers what it hands the painter', /nightRegister\(/.test(ns));
  check('the painter never calls nightRegister itself — it stays dumb',
    !/nightRegister\(/.test(rn));
  check('Phase 6 did not put an await or an async into nightscene.js',
    !/\bawait\b/.test(ns) && !/\basync\b/.test(ns));
  check('nor into the painter', !/\bawait\b/.test(rn) && !/\basync\b/.test(rn));
  check('and the painter still has no hardcoded hex',
    (rn.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(h => h.toLowerCase() !== '#fff').length === 0);
}

// ---------------------------------------------------------------- 10
console.log('\n10. D28: the writer. Discovery is the game, so nothing is known until it is earned');
{
  const r = J(`(() => {
    const g = __mk(10); const id = __target(g); __sleep(g, id, 'bedroom_1'); __hush(g, id);
    __open(g, id, { pose: 'back', covers: 'off' });
    const prefs = nightPreferences(g.npcs[id]);
    const need = BOUNDARY.nightScene.prefs.learnAfter;
    const p = nightPalette(g, id);
    const flat = [];
    for (const reg of p.regions) for (const part of reg.parts) flat.push(part);
    const lovedId = Object.keys(prefs.parts).find(k => flat.some(f => f.partId === k));
    const neutralId = flat.map(f => f.partId).find(k => !prefs.parts[k]);
    const work = (partId, times) => {
      const part = flat.find(f => f.partId === partId);
      const row = part.instruments[0];
      const actionId = composeNightActionId(partId, part.sides[0], row.instrumentId, row.motions[0], 'gentle');
      const out = [];
      for (let i = 0; i < times; i++) {
        const rec = g.npcs[id].flags._nightScene;
        const res = nightStepAction(g, id, actionId, (rec.touches || []).length);
        if (!res) break;
        applyNightStep(g, id, res);
        out.push(__clone(nightKnownFor(g, id)));
      }
      return out;
    };
    const before = __clone(nightKnownFor(g, id));
    const steps = work(lovedId, need + 1);
    const npcAfter = __clone(g.npcs[id].flags);
    const neutralSteps = work(neutralId, need + 2);
    return {
      lovedId, neutralId, need,
      before,
      atNeedMinusOne: steps[need - 2] ? steps[need - 2].parts[lovedId] || null : null,
      atNeed: steps[need - 1] ? steps[need - 1].parts[lovedId] || null : null,
      band: prefs.parts[lovedId],
      neutralEverKnown: neutralSteps.some(s => !!s.parts[neutralId]),
      onPlayer: !!(g.player.nightKnown && g.player.nightKnown[id]),
      onNpc: Object.keys(npcAfter).filter(k => /known|pref/i.test(k)),
    };
  })()`);
  check('nothing is known before a single touch',
    Object.keys(r.before.parts).length === 0 && Object.keys(r.before.motions).length === 0);
  check(`still nothing after ${r.need - 1} repeats`, r.atNeedMinusOne === null);
  check(`known on the ${r.need}th`, r.atNeed === r.band && !!r.band, `${r.atNeed} / ${r.band}`);
  check('a NEUTRAL part is never learned, however many times it is worked',
    r.neutralEverKnown === false);
  check('what is learned lives on the PLAYER (it is knowledge, not a fact about her)', r.onPlayer);
  check('...and nothing at all is written onto the npc folder',
    r.onNpc.length === 0, JSON.stringify(r.onNpc));
}

// ---------------------------------------------------------------- 11
console.log('\n11. D28: the marker. It rides the palette and the motion row, and shows only what was earned');
{
  const r = J(`(() => {
    const g = __mk(11); const id = __target(g); __sleep(g, id, 'bedroom_1'); __hush(g, id);
    __open(g, id, { pose: 'back', covers: 'off' });
    const prefs = nightPreferences(g.npcs[id]);
    const p0 = nightPalette(g, id);
    const marks0 = [];
    for (const reg of p0.regions) for (const part of reg.parts) if (part.known) marks0.push(part.partId);
    const flat0 = [];
    for (const reg of p0.regions) for (const part of reg.parts) flat0.push(part.partId);
    const lovedId = Object.keys(prefs.parts).find(k => flat0.indexOf(k) >= 0);
    g.player.nightKnown = { [id]: { parts: { [lovedId]: prefs.parts[lovedId] }, motions: {} } };
    const p1 = nightPalette(g, id);
    const marks1 = [];
    for (const reg of p1.regions) for (const part of reg.parts) if (part.known) marks1.push(part.partId + ':' + part.known);
    const s = __sess(id);
    const vm = nightViewModel(g, s);
    const motionKeys = vm.motions.length ? Object.keys(vm.motions[0]) : [];
    return {
      marks0, marks1, lovedId, band: prefs.parts[lovedId],
      motionKeys,
      marksConfig: BOUNDARY.nightScene.prefs.knownMark,
      vmMarks: vm.knownMarks,
      partHasKnownKey: p0.regions.length ? Object.prototype.hasOwnProperty.call(p0.regions[0].parts[0], 'known') : false,
    };
  })()`);
  check('an untouched character shows no marker anywhere', r.marks0.length === 0, JSON.stringify(r.marks0));
  check('...though every part chip carries the field, so the painter never guesses', r.partHasKnownKey);
  check('a learned part is marked, with its band', r.marks1.indexOf(r.lovedId + ':' + r.band) >= 0,
    JSON.stringify(r.marks1));
  check('...and only that one', r.marks1.length === 1, JSON.stringify(r.marks1));
  check('motion chips carry the same field', r.motionKeys.indexOf('known') >= 0, JSON.stringify(r.motionKeys));
  check('the glyphs are config, so the painter decides nothing',
    !!r.marksConfig.loved && !!r.marksConfig.disliked
    && JSON.stringify(r.vmMarks) === JSON.stringify(r.marksConfig));

  const rn = strip(fs.readFileSync(path.join(SRC, 'render.nightscene.js'), 'utf8'));
  check('the painter marks a chip only when the view model says it is known',
    /if \(p\.known\) nightMarkKnown/.test(rn) && /if \(m\.known\) nightMarkKnown/.test(rn));
  const html = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8');
  check('...and the marker is styled in tokens, never a hex',
    /\.night-known\s*\{/.test(html) && /data-known="loved"/.test(html)
    && !/\.night-known[\s\S]{0,400}#[0-9a-fA-F]{3,6}\b/.test(html));
}

// ---------------------------------------------------------------- 12
console.log('\n12. D28: the shadow layer never contaminates the preference draw');
{
  const r = J(`(() => {
    const g = __mk(12); const id = __target(g);
    const prefs = nightPreferences(g.npcs[id]);
    const cfg = BOUNDARY.nightScene;
    const ambientParts = Object.keys(cfg.parts).filter(k => cfg.parts[k].region === 'ambient');
    const ambientMotions = Object.keys(cfg.motions).filter(k => cfg.motions[k].family === 'ambient');
    const drawn = Object.keys(prefs.parts).filter(k => ambientParts.indexOf(k) >= 0);
    const drawnM = Object.keys(prefs.motions).filter(k => ambientMotions.indexOf(k) >= 0);
    const again = nightPreferences(g.npcs[id]);
    return { drawn, drawnM, stable: JSON.stringify(prefs) === JSON.stringify(again),
             counts: [Object.keys(prefs.parts).length, Object.keys(prefs.motions).length] };
  })()`);
  check('nobody has a preference about a door closing down the hall', r.drawn.length === 0);
  check('...nor about the noise it makes', r.drawnM.length === 0);
  check('and the derivation is still a stable function of the seed', r.stable);
  check('with real preferences drawn', r.counts[0] > 0 && r.counts[1] > 0, JSON.stringify(r.counts));
}

// ---------------------------------------------------------------- 13
console.log('\n13. prose.side.both is live config again, not the dead key Phases 3b/4/5 kept flagging');
{
  const r = J(`(() => {
    const S = BOUNDARY.nightScene.prose.side;
    const authored = { standalone: 'her nipple', plural: 'her nipples', paired: true };
    const noPlural  = { standalone: 'her nipple', paired: true };
    const cfg = BOUNDARY.nightScene;
    const pairedWithoutPlural = Object.keys(cfg.parts)
      .filter(k => cfg.parts[k].paired && !cfg.parts[k].plural);
    return {
      both: S.both,
      authoredWins: nightTargetPhrase(authored, 'both'),
      fallback: nightTargetPhrase(noPlural, 'both'),
      left: nightTargetPhrase(authored, 'left'),
      pairedWithoutPlural,
    };
  })()`);
  check('the authored plural still wins where there is one', r.authoredWins === 'her nipples');
  check('...and every paired part in the table has one', r.pairedWithoutPlural.length === 0,
    JSON.stringify(r.pairedWithoutPlural));
  check('but a part without one now reads through prose.side.both instead of the bare singular',
    r.fallback === 'both her nipple' && r.fallback !== 'her nipple', r.fallback);
  check('the side splice is unchanged', r.left === 'her left nipple');
}

// ---------------------------------------------------------------- 14
console.log('\n14. Q2: leftover evidence scales what she CONCLUDES, not just whether she finds it');
{
  const r = J(`(() => {
    const e = BOUNDARY.nightScene.exit;
    const curve = [0, 1, 2, 3, 4, 5].map(n => nightEvidenceStrength(n));
    const suspicionFor = (strength) => Math.min(EFFECT_LIMITS.suspicionDeltaCap,
      STEALTH_TUNING.sneakCaughtSuspicionDelta * (strength / STEALTH_TUNING.sneakEvidenceStrength));
    return {
      curve,
      perTag: e.evidencePerTag,
      max: e.evidenceStrengthMax,
      capOk: e.evidenceStrengthMax <= EFFECT_LIMITS.evidenceStrengthCap,
      suspicion: curve.map(suspicionFor),
      sneakUnmoved: suspicionFor(STEALTH_TUNING.sneakEvidenceStrength),
      flat: STEALTH_TUNING.sneakCaughtSuspicionDelta,
      confront: STEALTH_TUNING.confrontThreshold,
    };
  })()`);
  check('a clean exit writes no strength at all', r.curve[0] === 0);
  check('strength is linear in the leftover count', Math.abs(r.curve[2] - 2 * r.perTag) < 1e-9);
  check('...and saturates at the configured max', Math.abs(r.curve[5] - r.max) < 1e-9,
    `${r.curve[5]} vs ${r.max}`);
  check('...inside the effect system’s own cap', r.capOk);
  check('the consequence is now linear in that count too — the whole of Q2’s answer',
    r.suspicion[1] < r.suspicion[2] && r.suspicion[2] < r.suspicion[5],
    JSON.stringify(r.suspicion.map(x => +x.toFixed(3))));
  check('...with a real spread between one leftover tag and five',
    r.suspicion[5] / r.suspicion[1] > 3, `${r.suspicion[1]} -> ${r.suspicion[5]}`);
  check('...and five tags gets her most of the way to a confrontation in one night',
    r.suspicion[5] > r.confront * 0.5 && r.suspicion[5] < r.confront,
    `${r.suspicion[5]} vs threshold ${r.confront}`);
  check('a sneak’s fixed strength still writes EXACTLY the old flat delta (zero regression)',
    Math.abs(r.sneakUnmoved - r.flat) < 1e-9, `${r.sneakUnmoved} vs ${r.flat}`);

  const uj = strip(fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8'));
  const sj = strip(fs.readFileSync(path.join(SRC, 'sim.js'), 'utf8'));
  check('ui.js scales the suspicion write by the record’s own strength',
    /evidence_discovered[\s\S]{0,900}?sneakEvidenceStrength/.test(uj));
  check('...clamped by the effect system’s cap', /suspicionDeltaCap/.test(uj));
  check('sim.js carries the strength on the event so ui.js has it to read',
    /evidence_discovered[\s\S]{0,300}?strength: undiscovered\.evidence\.strength/.test(sj));
  check('the discovery scan no longer fires on a SLEEPING owner',
    /awakeToNotice[\s\S]{0,200}?roomOwnerId\(location, npcs\) === id/.test(sj));
}

// ---------------------------------------------------------------- 15
console.log('\n15. Q5: the tuning goals. Asserted as goals, never as magnitudes');
{
  const r = J(`(() => {
    const run = (skill, tier) => {
      const g = __mk(15); const id = __target(g); __sleep(g, id, 'bedroom_1'); __hush(g, id);
      g.player.skills = { stealth: skill };
      if (tier === 'warm') __warm(g, id); else __cold(g, id);
      __open(g, id, { pose: 'back', covers: 'off' });
      const actionId = __firstAction(g, id, 'gentle');
      let steps = 0, woke = false;
      for (let i = 0; i < 60; i++) {
        const rec = g.npcs[id].flags._nightScene;
        const res = nightStepAction(g, id, actionId, (rec.touches || []).length);
        if (!res) break;
        applyNightStep(g, id, res);
        steps++;
        if (res.woke) { woke = true; break; }
      }
      const rec = g.npcs[id].flags._nightScene;
      return { steps, woke, floor: rec.floor, detection: rec.detection, heat: rec.heat };
    };
    return {
      maxedWarm: run(4000, 'warm'), maxedCold: run(4000, 'cold'),
      rawWarm: run(0, 'warm'), rawCold: run(0, 'cold'),
      levels: [skillLevel({ skills: { stealth: 0 } }, 'stealth'), skillLevel({ skills: { stealth: 4000 } }, 'stealth')],
      curveLen: [BOUNDARY.nightScene.skillMult.length, BOUNDARY.nightScene.stirringRate.length],
      skillSpan: BOUNDARY.nightScene.skillMult[0] / BOUNDARY.nightScene.skillMult[10],
    };
  })()`);
  check('the two skill curves cover every skill level',
    r.curveLen[0] === 11 && r.curveLen[1] === 11 && r.levels[0] === 0 && r.levels[1] === 10);
  check('D2’s goal: a maxed-stealth player plays a whole session with Stirring barely moving',
    r.maxedWarm.floor < 10 && !r.maxedWarm.woke,
    `stirring ${r.maxedWarm.floor.toFixed(2)} over ${r.maxedWarm.steps} actions`);
  check('...even against a cold-tier stranger', !r.maxedCold.woke,
    `stirring ${r.maxedCold.floor.toFixed(2)}, wake ${r.maxedCold.detection.toFixed(1)}`);
  check('an unskilled player does NOT get that session for free',
    r.rawCold.floor > r.maxedCold.floor * 5,
    `${r.rawCold.floor.toFixed(2)} vs ${r.maxedCold.floor.toFixed(2)}`);
  check('cold vs warm is a radical difference, not a rounding one (D3’s acceptance test)',
    (r.rawCold.floor / Math.max(1e-9, r.rawWarm.floor)) > 1.8,
    `cold stirring ${r.rawCold.floor.toFixed(1)} vs warm ${r.rawWarm.floor.toFixed(1)}`);
  check('and the doubled skill benefit is real: Stirring shrinks faster than raw cost does',
    (r.rawCold.floor / Math.max(1e-9, r.maxedCold.floor)) > r.skillSpan,
    `floor x${(r.rawCold.floor / r.maxedCold.floor).toFixed(1)} vs skillMult x${r.skillSpan.toFixed(1)}`);
}

// ---------------------------------------------------------------- 16
console.log('\n16. the save: what the player learned survives a load, and an old save is not broken by it');
{
  const r = J(`(() => {
    const chain = MIGRATIONS.player.map(m => m.from + '->' + m.to);
    let out = { ledger: {} };
    for (const m of MIGRATIONS.player) out = m.fn(out);
    return {
      chain, target: FOLDER_VERSIONS.player,
      last: chain[chain.length - 1],
      migrated: out.nightKnown,
      keptLedger: !!out.ledger,
      idempotent: JSON.stringify(MIGRATIONS.player[MIGRATIONS.player.length - 1]
        .fn({ nightKnown: { a: { parts: { x: 'loved' } } } }).nightKnown) === '{"a":{"parts":{"x":"loved"}}}',
      folder: SAVE_KEYS.find(k => k.folder === 'player'),
    };
  })()`);
  check('the player schema version was bumped with the migration',
    r.last === (r.target - 1) + '->' + r.target, `${r.last} vs ${r.target}`);
  check('an old save gains an empty nightKnown rather than a missing one',
    JSON.stringify(r.migrated) === '{}');
  check('...without disturbing the knowledge ledger it deliberately did not join', r.keptLedger);
  check('and a save that already has one is left alone', r.idempotent);
  check('the player folder is saved whole, so nothing else was needed',
    !!r.folder && r.folder.keys.indexOf('player') >= 0);
}

// ---------------------------------------------------------------- 17
console.log('\n17. the shadow layer is wired into the live loop, and nothing on that path waits');
{
  const ns = strip(fs.readFileSync(path.join(SRC, 'nightscene.js'), 'utf8'));
  check('nightClockTick asks the shadow layer before it repaints the clock',
    /function nightClockTick\(\)[\s\S]{0,600}?nightAmbientTick\(/.test(ns));
  check('the tick resolves through the SAME pure resolver a tap does',
    /function nightAmbientTick[\s\S]{0,1400}?nightStepAction\(/.test(ns));
  check('...commits through the SAME one mutator',
    /function nightAmbientTick[\s\S]{0,1400}?applyNightStep\(/.test(ns));
  check('...and composes through the SAME authored composer',
    /function nightAmbientTick[\s\S]{0,1400}?composeNightLine\(/.test(ns));
  check('a cue that forces a wake ends the session through the one ending call',
    /function nightAmbientTick[\s\S]{0,1600}?nightEndScene\(result\.outcome\)/.test(ns));
  check('a cue asks for NO picture — D18 frames what you are doing, not a door in the hall',
    !/function nightAmbientTick[\s\S]{0,1600}?nightRequestFrame\(/.test(ns));
  check('the cue slot is consumed whether or not the roll fires (one roll per bucket)',
    /s\.cueSlot = slot;/.test(ns));
  check('a player action clears the cue receipt, so a noise is never read as a touch',
    /s\.cueResult = null;/.test(ns));

  const r = J(`(() => {
    const g = __mk(17); const id = __target(g); __sleep(g, id, 'bedroom_1'); __hush(g, id);
    __open(g, id, { pose: 'back', covers: 'off' });
    const s = __sess(id);
    const vmQuiet = nightViewModel(g, s);
    s.cueResult = nightStepAction(g, id, composeNightActionId('noise_near', '-', 'world', 'cue', 'steady'), 0);
    const vmCue = nightViewModel(g, s);
    return {
      quiet: vmQuiet.cue,
      cueDeltas: vmCue.cue ? vmCue.cue.deltas.map(d => d.key) : null,
      lastLineUnchanged: vmCue.lastLine === vmQuiet.lastLine,
      footerDeltas: vmCue.deltas.length,
    };
  })()`);
  check('a quiet session exposes no cue at all', r.quiet === null);
  check('a cue exposes its own receipt (wake + stir, never heat)',
    JSON.stringify(r.cueDeltas) === '["wake","stir"]', JSON.stringify(r.cueDeltas));
  check("...and does NOT overwrite the footer's account of the player's own last action",
    r.lastLineUnchanged && r.footerDeltas === 0);
}

// ---------------------------------------------------------------- 18
console.log('\n18. the grammar composes to English: no part x motion collides on a preposition');
{
  // Found by the user playing it, 2026-09-05: `inside`'s standalone was the
  // PREPOSITIONAL phrase 'inside her', which reads correctly on its own and
  // composes to "You slide into inside her" / "You thrust into inside her"
  // against every motion whose verb already ends in a preposition — which is
  // to say against penetration, the single most important action in the
  // scene. The fix was one word; this is the guard, and it lives here rather
  // than in p1 because it is a PROSE property (the composer's frames), not a
  // validity property of the tables p1 owns.
  const r = J(`(() => {
    const cfg = BOUNDARY.nightScene;
    const PREP = ['into', 'inside', 'against', 'on', 'off', 'out', 'onto', 'over', 'at'];
    const bad = [];
    for (const [pid, part] of Object.entries(cfg.parts)) {
      const s = part.standalone || '';
      const first = s.split(' ')[0].toLowerCase();
      for (const [inst, list] of Object.entries(part.acc || {})) {
        for (const tok of list) {
          const ids = tok.charAt(0) === '@'
            ? Object.keys(cfg.motions).filter(m => cfg.motions[m].family === tok.slice(1))
            : [tok];
          for (const mid of ids) {
            const m = cfg.motions[mid];
            if (!m || m.phrase) continue;   // a motion with its own phrase never uses the part label
            const last = String(m.verb).split(' ').pop().toLowerCase();
            if (PREP.indexOf(last) >= 0 && PREP.indexOf(first) >= 0) {
              bad.push('You ' + m.verb + ' ' + s + '.');
            }
          }
        }
      }
    }
    const prepositional = Object.entries(cfg.parts)
      .filter(([k, v]) => PREP.indexOf(String(v.standalone || '').split(' ')[0].toLowerCase()) >= 0)
      .map(([k]) => k);
    return { bad: [...new Set(bad)], prepositional,
             insideStandalone: cfg.parts.inside ? cfg.parts.inside.standalone : null };
  })()`);
  check('no part composes a doubled preposition with any motion it accepts',
    r.bad.length === 0, JSON.stringify(r.bad, null, 1));
  check('...because no part label is a prepositional phrase in the first place',
    r.prepositional.length === 0, JSON.stringify(r.prepositional));
  check('`inside` in particular is a noun phrase (it was "inside her")',
    r.insideStandalone && !/^inside\b/i.test(r.insideStandalone), r.insideStandalone);
}

console.log('\n==============================================');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('==============================================');
process.exit(fail === 0 ? 0 : 1);
