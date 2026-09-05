// night-scene-sleeping-npc-plan.md — Phase 3b, the overlay's DECIDER half.
//
//   node src/src/dev/verify/verify-night-p3.js
//
// Phase 3b is a rendering phase, but the half of it that can be wrong in a
// way nobody notices is pure and lives in nightscene.js: the selection cursor,
// the forward-looking motion preview, the bar model, the labels and the view
// model the painter reads. render.nightscene.js is deliberately not tested
// here — it is projection code with no decisions in it, and the render layer
// is outside loadgame.js's loader by design.
//
// What is asserted, in the order it would hurt if it broke:
//   - THE TRAY NEVER OFFERS AN IMPOSSIBLE ACTION (D31, at the UI level). The
//     big sweep walks every region x part x side x instrument x motion that
//     nightPalette hands the renderer, across several pose/covers states, and
//     requires nightActionValid to accept every single one. A tray chip that
//     composes an id the resolver refuses is the defining bug of this phase.
//   - the selection repair keeps that true ACROSS a state change: a Move that
//     changes her pose (D34) can pull the selected part out of reach between
//     one tap and the next, and the repair must land the cursor somewhere
//     real rather than leaving a dead chip armed.
//   - the dashed motion chip NEVER LIES. The preview runs the same code path
//     the resolver runs, so its verdict and intensity must equal what the tap
//     actually produces — asserted against real nightStepAction results.
//   - D26/D38's bars: wakefulness never reads below stirring, heat fills on
//     the within-cycle position, one pip per climax, and D29's willing tick
//     disappears after the first climax (past it the threshold reads absolute
//     heat and is already met, so a tick would mark an uncrossable line).
//   - D33's two-label rule at the one place outside prose that needs it — the
//     summary line uses the STANDALONE label, and 'both' takes the authored
//     plural rather than a guessed -s.
//   - D22's single exit: no confirmation when there is nothing to leave
//     behind, and a confirmation that NAMES what there is when there is.
//   - every evidence tag any part or motion in the tables can leave has an
//     evidenceLabels entry (the chip and the confirm both read it).
//   - invariant 3: nothing on the tap path is async. Not one function in the
//     resolve -> commit -> compose -> repaint chain returns a promise, and
//     nightscene.js contains no `await` at all.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'skills.js', 'npc.js', 'boundary.js', 'nightscene.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, stealthXp) => {
    const h = SIM_generateHouse(seed || 20260901, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'bedroom_1';
    g.player.skills = { stealth: stealthXp || 0 };
    return g;
  };
  __target = (g) => Object.keys(g.npcs).find(id => g.npcs[id].residency.status === 'resident');
  // A target and a player carrying BOTH genital types plus a breasted chest,
  // so a palette sweep covers every region rather than whichever ones the
  // house roll happened to produce. Sensitivity is pinned neutral so D35's
  // bible-first rule doesn't colour the sweep.
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
    const rec = { targetId: id, openedDay: 1, openedMinute: 100, detection: 0, floor: 0, heat: 0,
      evidence: [], touches: [], pose: 'back', covers: 'off', climaxCount: 0, xp: 0, resolved: null };
    g.npcs[id] = { ...g.npcs[id], flags: { ...(g.npcs[id].flags||{}), _nightScene: { ...rec, ...(over||{}) } } };
    return g.npcs[id].flags._nightScene;
  };
  __sess = (id, over) => ({ targetId: id, sel: null, lastResult: null, narration: '',
    confirming: false, trayOpen: false, ended: false, endOutcome: null, ...(over||{}) });
  __G = __bothBodies(__mk(), __target(__mk()));
  __ID = __target(__G);
  __G = __bothBodies(__G, __ID);
`);

const ID = api('__ID');

console.log('\n--- 1. the selection cursor (D31 across a state change) ---');
{
  api(`__open(__G, __ID)`);
  const fresh = J(`nightRepairSelection(nightPalette(__G, __ID), { paceId: 'steady' })`);
  check('a fresh selection is non-null over a live palette', !!fresh, JSON.stringify(fresh));
  check('a fresh selection defaults to steady pace', fresh && fresh.paceId === 'steady');
  check('a fresh selection names a region, a part, a side and an instrument',
    !!(fresh && fresh.regionKey && fresh.partId && fresh.side && fresh.instrumentId));

  const idem = J(`(() => {
    const p = nightPalette(__G, __ID);
    const a = nightRepairSelection(p, { paceId: 'steady' });
    const b = nightRepairSelection(p, a);
    return { a, b };
  })()`);
  check('repair is idempotent', JSON.stringify(idem.a) === JSON.stringify(idem.b),
    `${JSON.stringify(idem.a)} vs ${JSON.stringify(idem.b)}`);

  // A dead tab but a live part: the cursor follows the PART, so clearing the
  // last evidence tag (which empties the Cleanup tab) does not also throw away
  // where the player was working.
  const followPart = J(`(() => {
    const p = nightPalette(__G, __ID);
    return nightRepairSelection(p, { regionKey: 'nowhere#7', partId: 'nipple', paceId: 'firm' });
  })()`);
  check('a dead tab with a live part follows the part',
    followPart && followPart.partId === 'nipple' && followPart.regionKey === 'chest#0',
    JSON.stringify(followPart));
  check('a valid pace survives the repair', followPart && followPart.paceId === 'firm');

  const bothDead = J(`nightRepairSelection(nightPalette(__G, __ID), { regionKey: 'nowhere#7', partId: 'no_such_part', paceId: 'nonsense' })`);
  check('a dead tab AND a dead part falls back to the first region',
    bothDead && bothDead.regionKey === 'head#0', JSON.stringify(bothDead));
  check('an invalid pace falls back to steady', bothDead && bothDead.paceId === 'steady');

  const paired = J(`nightRepairSelection(nightPalette(__G, __ID), { partId: 'nipple', paceId: 'steady' })`);
  check('a paired part defaults to both (the artboard default, and the last side offered)',
    paired && paired.side === 'both', JSON.stringify(paired));

  const genital = J(`(() => {
    const p = nightPalette(__G, __ID);
    const region = p.regions.find(r => r.regionId === 'pussy');
    return nightRepairSelection(p, { regionKey: nightRegionKey('pussy', 0), partId: region.parts[0].partId, paceId: 'steady' });
  })()`);
  check('a genital-region part takes its own gN side token (D35)',
    genital && /^g\d$/.test(genital.side), JSON.stringify(genital));

  const plain = J(`nightRepairSelection(nightPalette(__G, __ID), { partId: 'hair', paceId: 'steady' })`);
  check("an unpaired, non-genital part takes '-'", plain && plain.side === '-', JSON.stringify(plain));

  const badInstrument = J(`nightRepairSelection(nightPalette(__G, __ID), { partId: 'hair', instrumentId: 'cock', paceId: 'steady' })`);
  check('an instrument the part does not accept repairs to one it does',
    badInstrument && nightRowHas(badInstrument), JSON.stringify(badInstrument));

  check('an empty palette repairs to null rather than to a fake selection',
    J(`nightRepairSelection({ regions: [], instruments: [] }, { partId: 'hair' })`) === null);
  check('a missing palette repairs to null', J(`nightRepairSelection(null, null)`) === null);

  // D34: a Move changes her pose, which can take the selected part out of
  // reach between one tap and the next. This is the case the repair exists for.
  const afterMove = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off' });
    const before = nightRepairSelection(nightPalette(__G, __ID), { partId: 'nipple', paceId: 'steady' });
    __open(__G, __ID, { pose: 'front', covers: 'off' });
    const p = nightPalette(__G, __ID);
    const after = nightRepairSelection(p, before);
    const reachable = nightPartReachable(__G.npcs[__ID].flags._nightScene, before.partId);
    const ok = nightActionValid(__G, __ID,
      composeNightActionId(after.partId, after.side, after.instrumentId, nightMotionRow(p, after)[0], after.paceId)).ok;
    return { before, after, reachable, ok };
  })()`);
  check('a pose change really does take the chest out of reach (the case under test)',
    afterMove.reachable === false);
  check('the cursor repairs onto something still reachable after a pose change',
    afterMove.after && afterMove.after.partId !== 'nipple');
  check('and the repaired cursor composes an id the resolver accepts', afterMove.ok === true);
}

function nightRowHas(sel) {
  return J(`(() => {
    const p = nightPalette(__G, __ID);
    const part = nightSelectedPart(p, ${JSON.stringify(sel)});
    return !!part && part.instruments.some(r => r.instrumentId === ${JSON.stringify(sel.instrumentId)});
  })()`);
}

console.log('\n--- 2. THE SWEEP: the tray never offers an impossible action (D31) ---');
{
  // Every chip the renderer could paint, across four pose/covers states, put
  // back through the resolver's own gate. This is the assertion the whole
  // phase stands on: nightPalette filters, the renderer paints what it
  // filtered, and nothing painted may compose an id nightActionValid refuses.
  const sweep = J(`(() => {
    const states = [
      { pose: 'back', covers: 'off' },
      { pose: 'back_parted', covers: 'turned_back' },
      { pose: 'front', covers: 'off' },
      { pose: 'curled', covers: 'covered' },
    ];
    let combos = 0, bad = [], emptyRows = 0, regions = 0, sideless = 0;
    for (const st of states) {
      __open(__G, __ID, st);
      const p = nightPalette(__G, __ID);
      for (const region of p.regions) {
        regions++;
        for (const part of region.parts) {
          if (!part.sides.length) sideless++;
          if (!part.instruments.length) emptyRows++;
          for (const side of part.sides) {
            for (const row of part.instruments) {
              if (!row.motions.length) emptyRows++;
              for (const motion of row.motions) {
                combos++;
                const id = composeNightActionId(part.partId, side, row.instrumentId, motion, 'steady');
                const v = nightActionValid(__G, __ID, id);
                if (!v.ok && bad.length < 6) bad.push(id + ' -> ' + v.reason);
              }
            }
          }
        }
      }
    }
    return { combos, bad, emptyRows, regions, sideless };
  })()`);
  check('the sweep actually covered a real palette', sweep.combos > 500, `combos=${sweep.combos}`);
  check('it reached several region instances across the four states', sweep.regions >= 20, `regions=${sweep.regions}`);
  check('EVERY offered combination resolves', sweep.bad.length === 0, sweep.bad.join('\n        '));
  check('no part is offered with an empty instrument or motion row', sweep.emptyRows === 0);
  check('no part is offered with no side at all', sweep.sideless === 0);

  // And the mirror: a combination the palette does NOT offer is refused.
  const refused = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off' });
    return [
      nightActionValid(__G, __ID, composeNightActionId('nipple', 'both', 'tongue', 'pinch', 'steady')).reason,
      nightActionValid(__G, __ID, composeNightActionId('hair', '-', 'cock', 'thrust', 'steady')).reason,
      nightActionValid(__G, __ID, composeNightActionId('nipple', '-', 'fingertip', 'brush', 'steady')).reason,
    ];
  })()`);
  check('nobody pinches a nipple with their tongue (D31)', refused[0] === 'invalid_combination', refused[0]);
  check('an instrument a part does not accept is refused', refused[1] === 'invalid_combination', refused[1]);
  check('a paired part with no side named is refused', refused[2] === 'bad_side', refused[2]);
}

console.log('\n--- 3. the dashed motion chip never lies ---');
{
  // The preview and the tap must agree, because the preview runs the same
  // nightActionValid -> nightHeatStep path the resolver runs rather than
  // re-deriving the verdict.
  const agree = J(`(() => {
    let checked = 0, mismatched = [];
    for (const heat of [0, 18, 44, 82, 140]) {
      __open(__G, __ID, { pose: 'back', covers: 'off', heat });
      const p = nightPalette(__G, __ID);
      for (const region of p.regions.slice(0, 6)) {
        for (const part of region.parts.slice(0, 3)) {
          const sel = nightRepairSelection(p, { regionKey: nightRegionKey(region.regionId, region.instance),
            partId: part.partId, paceId: 'steady' });
          for (const motion of nightMotionRow(p, sel)) {
            const pv = nightMotionPreview(__G, __ID, sel, motion);
            const r = nightStepAction(__G, __ID, pv.actionId, 'agree');
            checked++;
            if (!r) { mismatched.push(pv.actionId + ' -> preview ok but resolver refused'); continue; }
            if (r.verdict !== pv.verdict || Math.abs(r.intensity - pv.intensity) > 1e-9) {
              if (mismatched.length < 6) mismatched.push(pv.actionId + ': preview ' + pv.verdict + '/' + pv.intensity + ' vs result ' + r.verdict + '/' + r.intensity);
            }
          }
        }
      }
    }
    return { checked, mismatched };
  })()`);
  check('the preview was exercised across five heat levels', agree.checked > 200, `checked=${agree.checked}`);
  check("the preview's verdict and intensity equal the tap's", agree.mismatched.length === 0,
    agree.mismatched.join('\n        '));

  const overshoot = J(`(() => {
    // A barely-warm NPC and the most intense thing on the row: guaranteed
    // overshoot. Heat is deliberately NOT 0 here — heat has a hard floor at 0,
    // so an overshoot on a stone-cold NPC has its loss clamped away and the
    // delta reads 0 while the verdict is still (correctly) overshoot. The
    // verdict is what the dashed chip reports; this asserts the loss itself,
    // which needs somewhere to fall from.
    __open(__G, __ID, { pose: 'back_parted', covers: 'off', heat: 12 });
    const p = nightPalette(__G, __ID);
    const region = p.regions.find(r => r.regionId === 'pussy');
    const part = region.parts[region.parts.length - 1];
    const sel = nightRepairSelection(p, { regionKey: nightRegionKey('pussy', 0), partId: part.partId, paceId: 'firm' });
    const row = nightMotionRow(p, sel);
    const motion = row[row.length - 1];
    const pv = nightMotionPreview(__G, __ID, sel, motion);
    const r = nightStepAction(__G, __ID, pv.actionId, 'over');
    return { pv, heatDelta: r.heatDelta, wakeDelta: r.wakeDelta };
  })()`);
  check('the hottest verb on a cold NPC previews as an overshoot', overshoot.pv.overshoot === true,
    JSON.stringify(overshoot.pv));
  check('and the tap really does lose her heat (D27)', overshoot.heatDelta < 0, String(overshoot.heatDelta));

  const soothe = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off', detection: 50, floor: 5, heat: 20 });
    const p = nightPalette(__G, __ID);
    const sel = nightRepairSelection(p, { partId: 'hair', paceId: 'gentle' });
    const motion = nightMotionRow(p, sel).find(m => BOUNDARY.nightScene.motions[m].calming);
    const pv = nightMotionPreview(__G, __ID, sel, motion);
    const r = nightStepAction(__G, __ID, pv.actionId, 'soothe');
    return { pv, wakeDelta: r.wakeDelta, stirDelta: r.stirDelta };
  })()`);
  check('a soothing part x a calming motion x gentle previews as a soothe (D17)', soothe.pv.soothe === true,
    JSON.stringify(soothe.pv));
  check('and the tap really does drain wakefulness', soothe.wakeDelta < 0, String(soothe.wakeDelta));
  check('while stirring still rises (the anti-spam rule)', soothe.stirDelta > 0, String(soothe.stirDelta));

  const firmKillsSoothe = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off', detection: 50, floor: 5 });
    const p = nightPalette(__G, __ID);
    const sel = nightRepairSelection(p, { partId: 'hair', paceId: 'firm' });
    const motion = nightMotionRow(p, sel).find(m => BOUNDARY.nightScene.motions[m].calming);
    return nightMotionPreview(__G, __ID, sel, motion).soothe;
  })()`);
  check('the same part and motion at firm pace is NOT a soothe', firmKillsSoothe === false);

  const invalid = J(`nightMotionPreview(__G, __ID, { partId: 'nipple', side: 'both', instrumentId: 'tongue', paceId: 'steady' }, 'pinch')`);
  check('a preview of an impossible action reports invalid rather than guessing',
    invalid.valid === false && invalid.verdict === 'invalid');
  check('and it still returns the action id it was asked about', invalid.actionId === 'nipple.both.tongue.pinch.steady');
}

console.log('\n--- 4. the bars (D26, D29, D38) ---');
{
  const zero = J(`(() => { __open(__G, __ID, {}); return nightBarModel(__G, __ID); })()`);
  check('a fresh session reads 0 / 0 / 0', zero.wake === 0 && zero.stir === 0 && zero.heat === 0);
  check('a fresh session shows no climax pips', zero.climaxCount === 0);
  check("D29's willing tick is drawn inside the first cycle", zero.thresholdPct != null && zero.thresholdPct > 0,
    JSON.stringify(zero));
  check("the tick sits where the threshold is", Math.abs(zero.thresholdPct - zero.threshold) < 1.0,
    `${zero.thresholdPct} vs ${zero.threshold}`);
  check('the threshold is inside D29’s clamp',
    zero.threshold >= api('BOUNDARY.nightScene.willing.min') && zero.threshold <= api('BOUNDARY.nightScene.willing.max'),
    String(zero.threshold));

  const mid = J(`(() => { __open(__G, __ID, { detection: 58, floor: 21, heat: 44 }); return nightBarModel(__G, __ID); })()`);
  check('wakefulness fills to its own value', Math.abs(mid.wakePct - 58) < 1e-9);
  check('stirring is a band inside the SAME track, never a second bar', Math.abs(mid.stirPct - 21) < 1e-9);
  check('wakefulness never reads below stirring (D2)', mid.wakePct >= mid.stirPct);
  check('heat fills on its own value inside the first cycle', Math.abs(mid.heatPct - 44) < 1e-9);

  const past = J(`(() => { __open(__G, __ID, { heat: 250, climaxCount: 2 }); return nightBarModel(__G, __ID); })()`);
  check('D38: heat 250 fills the bar to the WITHIN-CYCLE position (50%), not 100%',
    Math.abs(past.heatPct - 50) < 1e-9, String(past.heatPct));
  check('and reads 250, so the bar stays a bar while the number stays honest', past.heat === 250);
  check('one pip per climax reached', past.climaxCount === 2);
  check('the willing tick is gone past the first climax (it marks nothing crossable)',
    past.thresholdPct === null, String(past.thresholdPct));

  const exact = J(`(() => { __open(__G, __ID, { heat: 100, climaxCount: 1 }); return nightBarModel(__G, __ID); })()`);
  check('heat exactly at a checkpoint restarts the bar at 0 with a pip banked',
    exact.heatPct === 0 && exact.climaxCount === 1, JSON.stringify(exact));

  const pinned = J(`(() => { __open(__G, __ID, { detection: 100, floor: 100, heat: 0 }); return nightBarModel(__G, __ID); })()`);
  check('a pinned session clamps both to 100', pinned.wakePct === 100 && pinned.stirPct === 100);
  check('no session at all reads null rather than zeroes',
    J(`nightBarModel(__G, 'no_such_npc')`) === null);
}

console.log('\n--- 5. labels (D33’s two-label rule) ---');
{
  const lines = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off' });
    const p = nightPalette(__G, __ID);
    const both = nightRepairSelection(p, { partId: 'nipple', paceId: 'steady' });
    const one = nightRepairSelection(p, { partId: 'nipple', side: 'left', paceId: 'gentle' });
    const hair = nightRepairSelection(p, { partId: 'hair', paceId: 'firm' });
    return {
      both: nightSelectionLine(__G, both),
      one: nightSelectionLine(__G, one),
      hair: nightSelectionLine(__G, hair),
      state: nightStateLine(__G, __ID),
      none: nightSelectionLine(__G, null),
    };
  })()`);
  check('the summary uses the STANDALONE label, not the tray label (D33)',
    /nipple/i.test(lines.one) && !/^Nipple ·/.test(lines.one), lines.one);
  check("'both' takes the authored plural rather than a guessed -s",
    /her nipples/i.test(lines.both), lines.both);
  check('a named side splices in', /left/i.test(lines.one), lines.one);
  check('the pace is named in the summary', /Gently$/.test(lines.one), lines.one);
  check('an unpaired part still reads naturally', /her hair/i.test(lines.hair), lines.hair);
  check('the line is sentence-cased', /^[A-Z]/.test(lines.hair), lines.hair);
  check('a null selection yields an empty line rather than throwing', lines.none === '');
  check('the state line names both the pose and the covers (D34)',
    /On her back/.test(lines.state) && /[Cc]overs off/.test(lines.state), lines.state);

  const noLeak = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off' });
    const p = nightPalette(__G, __ID);
    const bad = [];
    for (const region of p.regions) {
      for (const part of region.parts) {
        const sel = nightRepairSelection(p, { regionKey: nightRegionKey(region.regionId, region.instance),
          partId: part.partId, paceId: 'steady' });
        const line = nightSelectionLine(__G, sel);
        if (!line || /\\{|\\}|undefined|null/.test(line)) bad.push(part.partId + ': ' + line);
      }
    }
    return bad;
  })()`);
  check('no summary line leaks a token, an undefined or an empty string', noLeak.length === 0,
    noLeak.join('\n        '));

  const last = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off' });
    const p = nightPalette(__G, __ID);
    const sel = nightRepairSelection(p, { partId: 'nipple', paceId: 'steady' });
    const r = nightStepAction(__G, __ID, composeNightActionId(sel.partId, sel.side, sel.instrumentId, nightMotionRow(p, sel)[0], sel.paceId), 'last');
    return { line: nightLastActionLine(__G, r), motion: BOUNDARY.nightScene.motions[r.motionId].label,
             none: nightLastActionLine(__G, null) };
  })()`);
  check('the last-action line names the MOTION (it is what Again repeats)',
    last.line.toLowerCase().includes(last.motion.toLowerCase()), `${last.line} / ${last.motion}`);
  check('with no last action there is no last-action line', last.none === '');
}

console.log('\n--- 6. the receipt chips ---');
{
  const touch = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off', heat: 10 });
    const p = nightPalette(__G, __ID);
    const sel = nightRepairSelection(p, { partId: 'nipple', paceId: 'steady' });
    const r = nightStepAction(__G, __ID, composeNightActionId(sel.partId, sel.side, sel.instrumentId, nightMotionRow(p, sel)[0], sel.paceId), 'chips');
    return { chips: nightDeltaChips(r), heatDelta: r.heatDelta };
  })()`);
  check('a touch with heat shows three chips', touch.chips.length === 3, JSON.stringify(touch.chips));
  check('the chips are wake, stir and heat in that order',
    touch.chips.map(c => c.key).join(',') === 'wake,stir,heat');
  check('every chip carries a sign', touch.chips.every(c => /[+-]/.test(c.label)), JSON.stringify(touch.chips));

  const move = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'covered', heat: 10 });
    const r = nightStepAction(__G, __ID, 'the_sheet.-.hand.draw_sheet_back.steady', 'movechips');
    return { chips: nightDeltaChips(r), heatDelta: r.heatDelta };
  })()`);
  check('a Move carries no heat of its own (D36)', move.heatDelta === 0, String(move.heatDelta));
  check('so its receipt omits the heat chip rather than printing "heat +0"',
    move.chips.length === 2 && move.chips.every(c => c.key !== 'heat'), JSON.stringify(move.chips));

  const soothed = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off', detection: 50, floor: 5, heat: 20 });
    const p = nightPalette(__G, __ID);
    const sel = nightRepairSelection(p, { partId: 'hair', paceId: 'gentle' });
    const motion = nightMotionRow(p, sel).find(m => BOUNDARY.nightScene.motions[m].calming);
    const r = nightStepAction(__G, __ID, composeNightActionId(sel.partId, sel.side, sel.instrumentId, motion, 'gentle'), 'soothechips');
    return nightDeltaChips(r);
  })()`);
  check('a soothe tones its wake chip as GOOD, not as risk',
    soothed.find(c => c.key === 'wake').tone === 'good', JSON.stringify(soothed));
  check('a soothe still shows stirring rising', soothed.find(c => c.key === 'stir').label.includes('+'),
    JSON.stringify(soothed));
  check('no result yields no chips', J(`nightDeltaChips(null)`).length === 0);
}

console.log('\n--- 7. D22: one exit, and it names what it leaves ---');
{
  const clean = J(`(() => { __open(__G, __ID, { evidence: [] }); return nightLeaveConfirm(__G, __ID); })()`);
  check('leaving clean needs no confirmation at all', clean.needed === false && clean.count === 0);

  const one = J(`(() => { __open(__G, __ID, { evidence: ['shirt'] }); return nightLeaveConfirm(__G, __ID); })()`);
  check('one tag needs a confirmation', one.needed === true && one.count === 1);
  check('and it reads as a singular', /one thing behind/.test(one.text) && !/things/.test(one.text), one.text);
  check('and it NAMES the thing', one.text.includes('shirt up'), one.text);

  const two = J(`(() => { __open(__G, __ID, { evidence: ['shirt', 'sheets'] }); return nightLeaveConfirm(__G, __ID); })()`);
  check('two tags read as a plural', /two things behind/.test(two.text), two.text);
  check('and both are named, joined with "and"',
    two.text.includes('shirt up') && two.text.includes('sheets mussed') && two.text.includes(' and '), two.text);

  const three = J(`(() => { __open(__G, __ID, { evidence: ['panties', 'fluids', 'sheets'] }); return nightLeaveConfirm(__G, __ID); })()`);
  check('three tags list with commas and a final "and"',
    /three things behind/.test(three.text) && three.text.includes(', ') && three.text.includes(' and '), three.text);

  const chips = J(`(() => { __open(__G, __ID, { evidence: ['bottoms', 'fluids'] }); return nightEvidenceChips(__G, __ID); })()`);
  check('the evidence chips mirror the record in order',
    chips.map(c => c.tag).join(',') === 'bottoms,fluids', JSON.stringify(chips));
  check('and every chip carries a human label', chips.every(c => c.label && c.label !== c.tag),
    JSON.stringify(chips));

  // Coverage: every tag the TABLES can produce must have a label, or a chip
  // and a confirmation would both print a raw id at the worst possible moment.
  const coverage = J(`(() => {
    const cfg = BOUNDARY.nightScene;
    const tags = new Set();
    for (const id of Object.keys(cfg.parts)) for (const t of (cfg.parts[id].evidence || [])) tags.add(t);
    for (const id of Object.keys(cfg.motions)) for (const t of (cfg.motions[id].evidence || [])) tags.add(t);
    return [...tags].filter(t => !cfg.evidenceLabels[t]);
  })()`);
  check('every evidence tag the tables can leave has a label', coverage.length === 0, coverage.join(', '));
  check('and no label is authored for a tag nothing can leave', J(`(() => {
    const cfg = BOUNDARY.nightScene;
    const tags = new Set();
    for (const id of Object.keys(cfg.parts)) for (const t of (cfg.parts[id].evidence || [])) tags.add(t);
    for (const id of Object.keys(cfg.motions)) for (const t of (cfg.motions[id].evidence || [])) tags.add(t);
    for (const id of Object.keys(cfg.parts)) if (cfg.parts[id].clears) tags.add(cfg.parts[id].clears);
    return Object.keys(cfg.evidenceLabels).filter(t => !tags.has(t));
  })()`).length === 0);
}

console.log('\n--- 8. the view model the painter reads ---');
{
  const vm = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off', detection: 12, floor: 3, heat: 30, evidence: ['shirt'] });
    return nightViewModel(__G, __sess(__ID));
  })()`);
  const wanted = ['targetId', 'name', 'record', 'palette', 'sel', 'motions', 'bars', 'stateLine',
    'evidence', 'selectionLine', 'lastLine', 'lastMotionId', 'deltas', 'narration', 'confirm',
    'trayOpen', 'ended', 'endOutcome', 'canRepeat'];
  check('the view model carries every field the painter reads',
    wanted.every(k => Object.prototype.hasOwnProperty.call(vm, k)),
    wanted.filter(k => !Object.prototype.hasOwnProperty.call(vm, k)).join(', '));
  check('its motions carry an id, a label and a verdict',
    vm.motions.length > 0 && vm.motions.every(m => m.motionId && m.label && m.verdict),
    JSON.stringify(vm.motions.slice(0, 2)));
  check('the motion row is in ascending intensity (D33 makes the ORDER information)',
    vm.motions.every((m, i) => i === 0 || m.intensity >= vm.motions[i - 1].intensity),
    vm.motions.map(m => `${m.label}:${m.intensity}`).join(' '));
  check('nothing can be repeated before anything has happened', vm.canRepeat === false);
  check('no confirmation is showing unless one was asked for', vm.confirm === null);
  check('outstanding evidence reaches the painter', vm.evidence.length === 1 && vm.evidence[0].tag === 'shirt');

  const repeatable = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off' });
    const p = nightPalette(__G, __ID);
    const sel = nightRepairSelection(p, { partId: 'hair', paceId: 'steady' });
    const r = nightStepAction(__G, __ID, composeNightActionId(sel.partId, sel.side, sel.instrumentId, nightMotionRow(p, sel)[0], sel.paceId), 'vm');
    applyNightStep(__G, __ID, r);
    const v = nightViewModel(__G, __sess(__ID, { sel, lastResult: r, narration: 'x' }));
    return { canRepeat: v.canRepeat, lastMotionId: v.lastMotionId, lastLine: v.lastLine, deltas: v.deltas.length };
  })()`);
  check('after an action, Again is offered', repeatable.canRepeat === true);
  check('the last motion is named so the tray can mark it', !!repeatable.lastMotionId);
  check('the receipt is on the view model', repeatable.deltas >= 2);

  // A move can invalidate the last action; Again must not offer it either.
  const staleRepeat = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off' });
    const p = nightPalette(__G, __ID);
    const sel = nightRepairSelection(p, { partId: 'nipple', paceId: 'steady' });
    const r = nightStepAction(__G, __ID, composeNightActionId(sel.partId, sel.side, sel.instrumentId, nightMotionRow(p, sel)[0], sel.paceId), 'stale');
    __open(__G, __ID, { pose: 'front', covers: 'off' });
    return nightViewModel(__G, __sess(__ID, { sel, lastResult: r })).canRepeat;
  })()`);
  check('Again is withdrawn when the state moved the last action out of reach', staleRepeat === false);

  const pure = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off', detection: 12, floor: 3, heat: 30 });
    const before = JSON.stringify(__G.npcs[__ID].flags._nightScene);
    nightViewModel(__G, __sess(__ID));
    nightViewModel(__G, __sess(__ID));
    return before === JSON.stringify(__G.npcs[__ID].flags._nightScene);
  })()`);
  check('building the view model writes nothing (it is a read, twice over)', pure === true);
  check('no session yields no view model', J(`nightViewModel(__G, __sess('no_such_npc'))`) === null);

  const confirming = J(`(() => {
    __open(__G, __ID, { evidence: ['fluids'] });
    return nightViewModel(__G, __sess(__ID, { confirming: true })).confirm;
  })()`);
  check('a requested confirmation reaches the painter with its text',
    confirming && confirming.needed === true && confirming.text.includes('the mess'), JSON.stringify(confirming));
}

console.log('\n--- 9. invariant 3: nothing on the tap path is async ---');
{
  const sync = J(`(() => {
    __open(__G, __ID, { pose: 'back', covers: 'off' });
    const p = nightPalette(__G, __ID);
    const sel = nightRepairSelection(p, { partId: 'hair', paceId: 'steady' });
    const id = composeNightActionId(sel.partId, sel.side, sel.instrumentId, nightMotionRow(p, sel)[0], sel.paceId);
    const r = nightStepAction(__G, __ID, id, 0);
    const applied = applyNightStep(__G, __ID, r);
    const line = composeNightLine(__G, __ID, r, 0);
    const vm = nightViewModel(__G, __sess(__ID, { sel, lastResult: r }));
    return [r, applied, line, vm].map(x => !!(x && typeof x.then === 'function'));
  })()`);
  check('the whole resolve -> commit -> compose -> view chain returns no promise',
    sync.every(v => v === false), JSON.stringify(sync));

  // Comments are stripped first: both files EXPLAIN these rules in prose, and
  // a scan that reads its own documentation as a violation is a scan that
  // punishes writing the rule down.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(fs.readFileSync(path.join(SRC, 'nightscene.js'), 'utf8'));
  check('nightscene.js contains no `await` anywhere', !/\bawait\b/.test(src));
  check('and no async function', !/\basync\b/.test(src));
  // Design invariant 2, strengthened by D30: the LLM is not in the loop AT ALL
  // for an action, and the narration comes from composeNightLine's authored
  // pools rather than from a generator.
  check('and never reaches for generateText', !/generateText/.test(src));
  const rsrc = strip(fs.readFileSync(path.join(SRC, 'render.nightscene.js'), 'utf8'));
  check('the painter contains no await either', !/\bawait\b/.test(rsrc));
  check('and no rng, so it decides nothing', !/Math\.random|seededRng|mulberry32/.test(rsrc));
  // Every colour in the artboards was a hardcoded hex; the game ships 14
  // themes over the :root token block, so a hex in the painter would look
  // right in `midnight` and broken in the other thirteen. `#fff` is the one
  // allowance, and only as the foreground ON --color-accent, which is a
  // saturated mid tone in all 14 themes.
  const hexes = (rsrc.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(h => h.toLowerCase() !== '#fff');
  check('and no hardcoded hex colour', hexes.length === 0, hexes.join(', '));

  // Q10, resolved by this phase: the record keeps `detection` / `floor` and
  // the UI keeps Wakefulness / Stirring, and the split is safe BECAUSE
  // nightBarModel is the only place the two vocabularies meet. If a later
  // session spreads the internal names out into the view layer, that answer
  // stops being true and this is where it fails.
  const barModelBody = src.slice(src.indexOf('function nightBarModel'))
    .slice(0, src.slice(src.indexOf('function nightBarModel')).indexOf('\nfunction '));
  // `Math.` is excluded because `Math.floor` is not a record read -- a latent
  // false positive in the original pattern, which only stayed quiet while no
  // function in this file happened to need one. Phase 4's elapsed-clock label
  // and its reroll seed both do, and the assertion Q10 actually rests on is
  // about the RECORD's field names, not the substring.
  const internalNames = /(?<!Math)\.(?:detection|floor)\b/g;
  const allInSrc = (src.match(internalNames) || []).length;
  const allInBarModel = (barModelBody.match(internalNames) || []).length;
  check('the painter never reads the record’s internal meter names', !internalNames.test(rsrc));
  check('and in the decider they appear ONLY inside nightBarModel (Q10’s answer)',
    allInSrc > 0 && allInSrc === allInBarModel, `${allInBarModel} of ${allInSrc}`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
