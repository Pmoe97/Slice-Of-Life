// night-scene-sleeping-npc-plan.md — Phase 7: D34's clothing axis.
//
//   node src/src/dev/verify/verify-night-p7.js
//
// D34 named THREE tracked pieces — pose, covers, and "clothing (per garment,
// the existing evidence tags)". Phase 3a built the first two and dropped the
// third, and nobody noticed for six phases, because the symptom was silence:
// a covered part was gated on pose and the bedsheet alone, and touching it
// silently displaced the garment and recorded an evidence tag. A player went
// looking for the undress control and there wasn't one.
//
// The tell, and the thing this harness exists to make impossible again, was an
// ASYMMETRY: Cleanup could put clothes back that nothing had ever taken off.
// Section 2 asserts that symmetry directly — every Cleanup part that restores
// a garment has a Move part that displaces it, and vice versa. That single
// assertion would have caught the whole gap.
//
// The rest of it:
//
//   - The gate is by ZONE, not by tag. A part's zone is DERIVED from the
//     garments its own `evidence` list names, which is what let this axis land
//     with no per-part churn — the tag a part leaves was already the record of
//     what was in its way. It also makes the towel work: `breast` names
//     `shirt`, a towel session has no shirt, and the towel covers 'top'.
//   - Layering. Panties are under bottoms, so bottoms come down first, and the
//     tray teaches that by only offering what is next.
//   - A NUDE target starts exposed (the user's ruling, 2026-09-05): no
//     garments, no Move rows for them, no Cleanup rows either, and — the half
//     that was actively wrong before — no garment evidence tags, so nothing
//     ever offers to straighten underwear she was not wearing.
//   - Cleanup RESTORES. Straightening her panties closes off what they cover,
//     which makes Cleanup a real mid-scene decision rather than free tidying.
//   - The image key's clothing half comes off the RECORD, not off npc.clothing
//     (which the sim pins to 'sleepwear' and never changes — so before this,
//     every frame of an entire session keyed identically).
//   - And the legibility fix the same player session forced: a region she HAS
//     but that is closed right now is reported with the next thing in the way
//     named, instead of vanishing from the tray. That is not a walk-back of
//     D31 — D31 says an impossible ACTION is unreachable rather than refused,
//     and a whole region silently absent is the game hiding part of her body.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'state.js', 'sim.js', 'skills.js', 'npc.js', 'willingness.js',
             'relationships.js', 'effects.js', 'actions.js', 'codex.js', 'world.js',
             'boundary.js', 'nightscene.js', 'image.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  var currentGameState = null;
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260907, 3);
    const g = { meta:{seed:h.seed, clock:h.clock, contentConfig:null, sessionLog:[]},
                player:h.player, npcs:h.npcs, world:h.world, objects:h.objects };
    g.player.location='bedroom_1'; g.player.skills={stealth:0};
    g.player.ledger={}; g.player.nightKnown={};
    return g;
  };
  // A target who definitely carries a vagina, so the pussy region exists and
  // the deepest clothing gate in the game is actually testable (D35 derives
  // the regions from her genitals array, never from gender).
  __target = (g, clothing) => {
    const id = Object.keys(g.npcs)[0];
    const b = g.npcs[id].bible;
    g.npcs[id] = { ...g.npcs[id],
      residency:{status:'resident',room:'bedroom_1',since:1},
      location:'bedroom_1', activity:'sleeping',
      clothing: clothing || 'sleepwear',
      bible: { ...b, gender:'female', physical: { ...b.physical,
        intimate: { ...(b.physical.intimate||{}),
          breasts: { ...((b.physical.intimate||{}).breasts||{}), size:'full' },
          genitals:[{type:'vagina'}] } } } };
    return id;
  };
  __open = (g, id, over) => {
    const rec = openNightScene(g, id, { location:'bedroom_1' });
    if (over) {
      g.npcs[id] = { ...g.npcs[id], flags: { ...g.npcs[id].flags,
        _nightScene: { ...g.npcs[id].flags._nightScene, ...over } } };
    }
    return g.npcs[id].flags._nightScene;
  };
  __rec = (g, id) => g.npcs[id].flags._nightScene;
  __parts = (g, id, regionId) => {
    const p = nightPalette(g, id);
    const r = p.regions.find(x => x.regionId === regionId);
    return r ? r.parts.map(x => x.partId) : [];
  };
  __do = (g, id, actionId, ctx) => {
    const res = nightStepAction(g, id, actionId, ctx || 'x');
    if (res) applyNightStep(g, id, res);
    return res;
  };
  __clone = (o) => JSON.parse(JSON.stringify(o));
  root.generateImage = () => new Promise(() => {});
`);

// ---------------------------------------------------------------- 1
console.log('\n1. the axis exists: the record carries clothing, read from the sim ONCE and frozen');
{
  const r = J(`(() => {
    const g = __mk(1); const id = __target(g, 'sleepwear');
    const rec = __open(g, id);
    const before = __clone(rec.clothing);
    // the sim keeps writing npc.clothing; the scene must not follow it
    g.npcs[id] = { ...g.npcs[id], clothing: 'nude' };
    const after = __clone(__rec(g, id).clothing);
    const g2 = __mk(2); const id2 = __target(g2, 'nude');
    const g3 = __mk(3); const id3 = __target(g3, 'towel');
    return {
      dressed: before,
      unfollowed: JSON.stringify(before) === JSON.stringify(after),
      nude: __open(g2, id2).clothing,
      towel: __open(g3, id3).clothing,
      sets: BOUNDARY.nightScene.garmentSets,
    };
  })()`);
  check('a sleepwear target starts in the default set, every garment on',
    JSON.stringify(r.dressed) === '{"shirt":"on","bottoms":"on","panties":"on"}', JSON.stringify(r.dressed));
  check('a NUDE target starts with no garments at all (the user’s ruling)',
    JSON.stringify(r.nude) === '{}', JSON.stringify(r.nude));
  check('a towel is one garment, not three', JSON.stringify(r.towel) === '{"towel":"on"}',
    JSON.stringify(r.towel));
  check('the scene never re-reads npc.clothing after opening — changing it is the scene’s job',
    r.unfollowed);
}

// ---------------------------------------------------------------- 2
console.log('\n2. THE SYMMETRY. Every garment can be taken off and put back — the assertion whose absence hid this');
{
  const r = J(`(() => {
    const cfg = BOUNDARY.nightScene;
    const garments = Object.keys(cfg.garments);
    const displacers = {}; const restorers = {};
    for (const [pid, part] of Object.entries(cfg.parts)) {
      if (part.restores) (restorers[part.restores] = restorers[part.restores] || []).push(pid);
      if (!part.garment) continue;
      for (const [inst, list] of Object.entries(part.acc || {})) {
        for (const mid of list) {
          const m = cfg.motions[mid];
          if (m && m.garment) (displacers[m.garment.id] = displacers[m.garment.id] || []).push(pid);
        }
      }
    }
    return {
      garments,
      noDisplacer: garments.filter(g => !(displacers[g] || []).length),
      noRestorer:  garments.filter(g => !(restorers[g] || []).length),
      orphanRestorers: Object.keys(restorers).filter(g => !cfg.garments[g]),
      // and the tag vocabulary is shared: a garment id IS an evidence tag
      unlabelled: garments.filter(g => !cfg.evidenceLabels[g]),
      // every displacing motion leaves the tag its garment names
      taglessMotions: Object.entries(cfg.motions)
        .filter(([k, m]) => m.garment && (m.evidence || []).indexOf(m.garment.id) < 0)
        .map(([k]) => k),
    };
  })()`);
  check('every garment has a Move part that displaces it',
    r.noDisplacer.length === 0, JSON.stringify(r.noDisplacer));
  check('...and a Cleanup part that puts it back', r.noRestorer.length === 0, JSON.stringify(r.noRestorer));
  check('...and nothing restores a garment that does not exist',
    r.orphanRestorers.length === 0, JSON.stringify(r.orphanRestorers));
  check('a garment id IS an evidence tag, so Cleanup needed no new vocabulary',
    r.unlabelled.length === 0, JSON.stringify(r.unlabelled));
  check('and displacing a garment is what LEAVES the tag (not a touch afterwards)',
    r.taglessMotions.length === 0, JSON.stringify(r.taglessMotions));
}

// ---------------------------------------------------------------- 3
console.log('\n3. the gate: a garment in the way makes the part unreachable, and moving it opens it');
{
  const r = J(`(() => {
    const g = __mk(4); const id = __target(g, 'sleepwear');
    __open(g, id, { pose:'back', covers:'off' });
    const gated = (list) => list.filter(p => (BOUNDARY.nightScene.parts[p].evidence || [])
      .some(t => BOUNDARY.nightScene.garments[t]));
    const dressed = gated(__parts(g, id, 'chest'));
    const dressedAll = __parts(g, id, 'chest');
    const move0 = __parts(g, id, 'move');
    __do(g, id, 'g_shirt.-.hand.push_shirt_up.steady', 'a');
    const afterShirt = __parts(g, id, 'chest');
    const rec = __rec(g, id);
    return {
      dressed, dressedAll, afterShirt, move0,
      shirtState: rec.clothing.shirt,
      tag: rec.evidence,
      // her legs never named a garment, so they were never clothing-gated
      legsWhenDressed: (() => { const g2=__mk(4); const i2=__target(g2,'sleepwear');
        __open(g2,i2,{pose:'back',covers:'off'}); return __parts(g2,i2,'legs').length; })(),
    };
  })()`);
  check('a fully dressed target offers nothing garment-gated on her chest',
    r.dressed.length === 0, JSON.stringify(r.dressed));
  check('...only her ribs, which name no garment and were never gated',
    r.dressedAll.length === 1 && r.dressedAll[0] === 'ribs', JSON.stringify(r.dressedAll));
  check('...though the Move tray offers the shirt itself', r.move0.indexOf('g_shirt') >= 0,
    JSON.stringify(r.move0));
  check('pushing her shirt up opens the rest of the region', r.afterShirt.length > 1,
    JSON.stringify(r.afterShirt));
  check('...and marks the garment displaced', r.shirtState === 'displaced');
  check('...and leaves the shirt tag at the moment it is moved', r.tag.indexOf('shirt') >= 0,
    JSON.stringify(r.tag));
  check('a part that names no garment was never clothing-gated', r.legsWhenDressed > 0);
}

// ---------------------------------------------------------------- 4
console.log('\n4. layering: bottoms before panties, and the tray only ever offers the next one');
{
  const r = J(`(() => {
    const g = __mk(5); const id = __target(g, 'sleepwear');
    __open(g, id, { pose:'back_parted', covers:'off' });
    const step = [];
    const snap = () => ({ move: __parts(g,id,'move').filter(p=>p.charAt(0)==='g'),
                          pussy: __parts(g,id,'pussy'),
                          ass: __parts(g,id,'ass') });
    step.push(snap());
    const refusedEarly = nightActionValid(g, id, 'g_panties.-.hand.pull_panties_aside.steady');
    __do(g, id, 'g_bottoms.-.hand.pull_bottoms_down.steady', 'b');
    step.push(snap());
    __do(g, id, 'g_panties.-.hand.pull_panties_aside.steady', 'c');
    step.push(snap());
    // Her ass is not reachable from back_parted at ALL (the region's own pose
    // reach is front/side/curled), so the "bottoms alone open the ass" claim
    // has to be made in a pose that reaches it.
    const g2 = __mk(5); const i2 = __target(g2, 'sleepwear');
    __open(g2, i2, { pose:'side_away', covers:'off' });
    const r2 = () => g2.npcs[i2].flags._nightScene;
    const assDressed = __parts(g2, i2, 'ass').length;
    __do(g2, i2, 'g_bottoms.-.hand.pull_bottoms_down.steady', 'b2');
    const assBottomsDown = __parts(g2, i2, 'ass').length;
    const assBlocker = nightPartBlocker(r2(), 'ass_cheek');
    __do(g2, i2, 'g_panties.-.hand.pull_panties_aside.steady', 'c2');
    const assBoth = __parts(g2, i2, 'ass').length;
    return { step, refusedEarly: refusedEarly.reason, ok: refusedEarly.ok,
             assDressed, assBottomsDown, assBoth, assBlocker,
             clothing: __clone(__rec(g,id).clothing) };
  })()`);
  check('with everything on, only the OUTER garments are offered',
    r.step[0].move.indexOf('g_bottoms') >= 0 && r.step[0].move.indexOf('g_panties') < 0,
    JSON.stringify(r.step[0].move));
  check('...and the resolver refuses the inner one outright, not just the tray',
    r.ok === false && r.refusedEarly === 'unreachable', r.refusedEarly);
  check('bottoms down offers the panties, and does NOT yet open her cunt',
    r.step[1].move.indexOf('g_panties') >= 0 && r.step[1].pussy.length === 0,
    JSON.stringify({ move: r.step[1].move, pussy: r.step[1].pussy }));
  // The gate is by ZONE, not by the tag a part happens to name: her ass names
  // only `bottoms`, but her panties cover the same zone, so both have to move.
  // That is the model being physical rather than bookkeeping.
  check('her ass stays closed on the bottoms alone — her panties cover the same zone',
    r.assDressed === 0 && r.assBottomsDown === 0, `${r.assDressed} -> ${r.assBottomsDown}`);
  check('...and the blocker says which garment, by name',
    r.assBlocker && r.assBlocker.kind === 'garment' && r.assBlocker.garment === 'panties',
    JSON.stringify(r.assBlocker));
  check('...and it opens once BOTH bottom-zone garments are moved', r.assBoth > 0,
    String(r.assBoth));
  check('panties aside opens her cunt, penetration included',
    r.step[2].pussy.indexOf('inside') >= 0, JSON.stringify(r.step[2].pussy));
  check('and both garments end displaced',
    r.clothing.bottoms === 'displaced' && r.clothing.panties === 'displaced');
}

// ---------------------------------------------------------------- 5
console.log('\n5. the nude ruling: exposed from the first turn, and NOTHING to redress');
{
  const r = J(`(() => {
    const g = __mk(6); const id = __target(g, 'nude');
    __open(g, id, { pose:'back_parted', covers:'off' });
    const move = __parts(g, id, 'move');
    const pussy = __parts(g, id, 'pussy');
    const chest = __parts(g, id, 'chest');
    // work her hard enough that a clothed target would have tagged every garment
    const acts = ['clit.g1.fingers.circle.steady', 'nipple.both.fingers.roll.steady',
                  'ass_cheek.both.hand.squeeze.steady'];
    for (const a of acts) __do(g, id, a, a);
    const rec = __rec(g, id);
    const cleanup = __parts(g, id, 'cleanup');
    return {
      move: move.filter(p => p.charAt(0) === 'g'),
      exposedAtOnce: pussy.indexOf('inside') >= 0 && chest.length > 0,
      evidence: rec.evidence,
      cleanup,
      clothing: __clone(rec.clothing),
    };
  })()`);
  check('a nude target is exposed from the first turn — only the sheet was ever in the way',
    r.exposedAtOnce);
  check('...with no garment rows in Move at all', r.move.length === 0, JSON.stringify(r.move));
  check('...and no garment tag is ever left on her',
    ['shirt','bottoms','panties','towel'].every(t => r.evidence.indexOf(t) < 0),
    JSON.stringify(r.evidence));
  check('...so Cleanup never offers to straighten underwear she was not wearing',
    ['shirt','bottoms','panties','towel'].every(t => r.cleanup.indexOf(t) < 0),
    JSON.stringify(r.cleanup));
  check('the mess she DID make is still tracked', r.evidence.indexOf('fluids') >= 0,
    JSON.stringify(r.evidence));
}

// ---------------------------------------------------------------- 6
console.log('\n6. the towel: one garment over both zones, so opening it opens everything');
{
  const r = J(`(() => {
    const g = __mk(7); const id = __target(g, 'towel');
    __open(g, id, { pose:'back_parted', covers:'off' });
    // Only the parts that NAME a garment are clothing-gated. Her ribs name none
    // — the authored data says touching them displaces nothing — so they
    // stay reachable through a towel, exactly as her legs stay reachable
    // through her bottoms. That is the zone derivation working, not leaking.
    const gated = (list) => list.filter(p => (BOUNDARY.nightScene.parts[p].evidence || [])
      .some(t => BOUNDARY.nightScene.garments[t]));
    const before = { chest: gated(__parts(g,id,'chest')).length,
                     pussy: gated(__parts(g,id,'pussy')).length,
                     ungatedChest: __parts(g,id,'chest'),
                     move: __parts(g,id,'move').filter(p=>p.charAt(0)==='g') };
    __do(g, id, 'g_towel.-.hand.open_towel.steady', 't');
    const after = { chest: gated(__parts(g,id,'chest')).length,
                    pussy: gated(__parts(g,id,'pussy')).length };
    const rec = __rec(g, id);
    const cleanup = __parts(g, id, 'cleanup');
    return { before, after, evidence: rec.evidence, cleanup };
  })()`);
  check('under a towel nothing garment-gated is reachable, on either half of her',
    r.before.chest === 0 && r.before.pussy === 0, JSON.stringify(r.before));
  check('...though a part that names no garment (her ribs) stays reachable, by design',
    r.before.ungatedChest.indexOf('ribs') >= 0, JSON.stringify(r.before.ungatedChest));
  check('...even though she owns no shirt for the chest parts to name',
    r.before.move.length === 1 && r.before.move[0] === 'g_towel', JSON.stringify(r.before.move));
  check('opening it opens BOTH zones at once', r.after.chest > 0 && r.after.pussy > 0,
    JSON.stringify(r.after));
  check('...and it is its own evidence tag', r.evidence.indexOf('towel') >= 0,
    JSON.stringify(r.evidence));
  check('...with its own Cleanup row', r.cleanup.indexOf('towel') >= 0, JSON.stringify(r.cleanup));
}

// ---------------------------------------------------------------- 7
console.log('\n7. Cleanup RESTORES: tidying up mid-scene closes what it covers');
{
  const r = J(`(() => {
    const g = __mk(8); const id = __target(g, 'sleepwear');
    __open(g, id, { pose:'back_parted', covers:'off' });
    __do(g, id, 'g_bottoms.-.hand.pull_bottoms_down.steady', 'b');
    __do(g, id, 'g_panties.-.hand.pull_panties_aside.steady', 'c');
    const open = __parts(g, id, 'pussy');
    const cleaned = __do(g, id, 'panties.-.hand.straighten.steady', 'd');
    const closed = __parts(g, id, 'pussy');
    const rec = __rec(g, id);
    const blocked = nightStepAction(g, id, 'clit.g1.fingers.circle.steady', 'e');
    // and it can be re-opened
    const reopen = __do(g, id, 'g_panties.-.hand.pull_panties_aside.steady', 'f');
    return {
      open: open.length, closed: closed.length,
      state: rec.clothing.panties,
      tagCleared: rec.evidence.indexOf('panties') < 0,
      blocked: blocked === null,
      reopened: __parts(g, id, 'pussy').length,
      reopenCost: reopen ? reopen.wakeDelta > 0 && reopen.stirDelta > 0 : null,
      cleanupCost: cleaned ? cleaned.wakeDelta > 0 && cleaned.stirDelta > 0 : null,
    };
  })()`);
  check('her cunt is reachable with the panties aside', r.open > 0);
  check('straightening them puts them back ON', r.state === 'on');
  check('...clears the tag', r.tagCleared);
  check('...and closes off everything they cover', r.closed === 0 && r.blocked);
  check('...at a real cost, both ways — never a free undo',
    r.cleanupCost === true && r.reopenCost === true);
  check('and pulling them aside again reopens it', r.reopened > 0);
}

// ---------------------------------------------------------------- 8
console.log('\n8. the picture: the clothing half of the key comes off the RECORD, not off the sim');
{
  const r = J(`(() => {
    const g = __mk(9); const id = __target(g, 'sleepwear');
    __open(g, id, { pose:'back', covers:'off' });
    const axes0 = nightFrameAxes(__rec(g,id), 'breast', 'both', 'hand', 'cup');
    __do(g, id, 'g_shirt.-.hand.push_shirt_up.steady', 'a');
    const axes1 = nightFrameAxes(__rec(g,id), 'breast', 'both', 'hand', 'cup');
    const key0 = composeNightFrameKey(g, id, { ...axes0, shape:'landscape' });
    const key1 = composeNightFrameKey(g, id, { ...axes1, shape:'landscape' });
    const prompt1 = composeNightFramePrompt(g, id, { ...axes1, shape:'landscape' });
    const nudeG = __mk(10); const nudeId = __target(nudeG, 'nude');
    __open(nudeG, nudeId, { pose:'back', covers:'off' });
    const nudeAxes = nightFrameAxes(nudeG.npcs[nudeId].flags._nightScene, 'breast', 'both', 'hand', 'cup');
    return {
      token0: axes0.clothingToken, token1: axes1.clothingToken,
      keyChanged: key0 !== key1,
      promptNamesIt: /pushed up/.test(prompt1),
      nudeToken: nudeAxes.clothingToken,
      nudePrompt: /naked/.test(composeNightFramePrompt(nudeG, nudeId, { ...nudeAxes, shape:'landscape' })),
      clause: nightClothingClause({ shirt:'displaced', bottoms:'on', panties:'on' }),
      intact: nightClothingClause({ shirt:'on', bottoms:'on', panties:'on' }),
    };
  })()`);
  check('a dressed session and an undressed one key differently', r.keyChanged,
    `${r.token0} -> ${r.token1}`);
  check('...because the token tracks what is still ON',
    r.token0 === 'on-bottoms-panties-shirt' && r.token1 === 'on-bottoms-panties',
    `${r.token0} / ${r.token1}`);
  check('a nude session keys as bare', r.nudeToken === 'bare', r.nudeToken);
  check('the PROMPT names what has been moved, so the picture can show it', r.promptNamesIt);
  check('...and says naked when there is nothing to move', r.nudePrompt);
  check('the staging clause lists only what has actually moved',
    r.clause === 'her shirt pushed up', r.clause);
  check('...and says so plainly when nothing has', r.intact === 'still dressed for bed', r.intact);
}

// ---------------------------------------------------------------- 9
console.log('\n9. legibility: a region she HAS but that is closed says so, and names the next thing');
{
  const r = J(`(() => {
    const g = __mk(11); const id = __target(g, 'sleepwear');
    // the state a player actually opens in: on her side, under the covers
    __open(g, id, { pose:'side_away', covers:'covered' });
    const p0 = nightPalette(g, id);
    const at = () => {
      const p = nightPalette(g, id);
      const b = (p.blockedRegions||[]).find(x => x.regionId === 'pussy');
      return b ? { reason: b.reason, text: b.text } : null;
    };
    const start = at();
    __do(g, id, 'her_body.-.hand.turn_toward.steady', '1');
    __do(g, id, 'her_body.-.hand.roll_to_back.steady', '2');
    const onBack = at();
    __do(g, id, 'the_sheet.-.hand.draw_sheet_back.steady', '3');
    __do(g, id, 'the_sheet.-.hand.pull_sheet_off.steady', '4');
    const uncovered = at();
    __do(g, id, 'g_bottoms.-.hand.pull_bottoms_down.steady', '5');
    __do(g, id, 'g_panties.-.hand.pull_panties_aside.steady', '6');
    const open = at();
    const finalPal = nightPalette(g, id);
    return {
      startsBlocked: !!start, start, onBack, uncovered, open,
      blockedNeverInRegions: (p0.regions||[]).every(x => x.regionId !== 'pussy'),
      blockedHasNoParts: (p0.blockedRegions||[]).every(x => !x.parts),
      finallyOffered: (finalPal.regions||[]).some(x => x.regionId === 'pussy'),
      andGone: (finalPal.blockedRegions||[]).every(x => x.regionId !== 'pussy'),
    };
  })()`);
  check('the Pussy region is REPORTED from the opening state instead of vanishing',
    r.startsBlocked, JSON.stringify(r.start));
  check('...naming the pose first, which is the coarsest thing in the way',
    r.start && r.start.reason === 'pose', JSON.stringify(r.start));
  check('on her back it names the covers', r.onBack && r.onBack.reason === 'covers',
    JSON.stringify(r.onBack));
  check('with the covers off it names the garment, by name',
    r.uncovered && r.uncovered.reason === 'garment' && /bottoms/i.test(r.uncovered.text),
    JSON.stringify(r.uncovered));
  check('and once it is actually open it stops being reported',
    r.open === null && r.finallyOffered && r.andGone);
  check('a blocked region is never in palette.regions — it is a hint, never a control',
    r.blockedNeverInRegions && r.blockedHasNoParts);
}

// ---------------------------------------------------------------- 10
console.log('\n10. it is still the same engine: pure, seeded, clamped, and nothing waits');
{
  const r = J(`(() => {
    const g = __mk(12); const id = __target(g, 'sleepwear');
    __open(g, id, { pose:'back', covers:'off', detection: 20, floor: 12, heat: 30 });
    const rec = __clone(__rec(g, id));
    const a = nightStepAction(g, id, 'g_shirt.-.hand.push_shirt_up.steady', 'z');
    const b = nightStepAction(g, id, 'g_shirt.-.hand.push_shirt_up.steady', 'z');
    const untouched = JSON.stringify(__rec(g, id)) === JSON.stringify(rec);
    return {
      deterministic: JSON.stringify(a) === JSON.stringify(b),
      pure: untouched,
      family: BOUNDARY.nightScene.motions.push_shirt_up.family,
      noHeat: a.heatDelta === 0,
      costsWake: a.wakeDelta > 0 && a.stirDelta > 0,
      neverBelowFloor: a.detection >= rec.floor,
      xpPaid: a.xp > 0,
      clothingChanged: a.clothingChanged === true && a.garmentId === 'shirt',
    };
  })()`);
  check('a garment edge is deterministic from the seed', r.deterministic);
  check('...and the resolver stays pure — it decides, the mutator writes', r.pure);
  check('it is a MOVE, so it takes D36’s discount and carries no heat of its own',
    r.family === 'move' && r.noHeat);
  check('...but costs wakefulness and permanent stirring like everything else', r.costsWake);
  check('...and can never duck under the stirring floor', r.neverBelowFloor);
  check('it pays XP: undressing somebody without waking them is a real feat', r.xpPaid);
  check('the result reports the clothing change for the composer to narrate', r.clothingChanged);

  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const ns = strip(fs.readFileSync(path.join(SRC, 'nightscene.js'), 'utf8'));
  const rn = strip(fs.readFileSync(path.join(SRC, 'render.nightscene.js'), 'utf8'));
  check('Phase 7 put no await or async into nightscene.js',
    !/\bawait\b/.test(ns) && !/\basync\b/.test(ns));
  check('nor into the painter', !/\bawait\b/.test(rn) && !/\basync\b/.test(rn));
  check('and the painter still has no hardcoded hex',
    (rn.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(h => h.toLowerCase() !== '#fff').length === 0);
  const html = fs.readFileSync(path.join(SRC, '..', '..', '..', 'index.html'), 'utf8');
  check('the blocked-tab style is tokens, never a hex',
    /\.night-tab-blocked\s*\{/.test(html)
    && !/\.night-tab-blocked[\s\S]{0,300}#[0-9a-fA-F]{3,6}\b/.test(html));
}

// ---------------------------------------------------------------- 11
console.log('\n11. the register still holds across the new axis');
{
  const r = J(`(() => {
    const g = __mk(13); const id = __target(g, 'sleepwear');
    g.npcs[id] = { ...g.npcs[id], bible: { ...g.npcs[id].bible, gender:'male' } };
    __open(g, id, { pose:'back', covers:'off' });
    const bad = [];
    const re = /\\bher\\b|\\bshe\\b|\\bhers\\b|\\bherself\\b|\\{o\\}/i;
    const scan = (label, t) => { if (typeof t === 'string' && re.test(t)) bad.push(label + ': ' + t); };
    const s = { targetId: id, sel:null, lastResult:null, narration:'', confirming:false,
      trayOpen:false, ended:false, endOutcome:null, endResult:null, climaxBeat:false,
      cueSlot:0, cueResult:null, frames:new Map(), framesInFlight:new Set(),
      frameKey:null, frameAxes:null, prefetchSel:null };
    const vm = nightViewModel(g, s);
    for (const b of vm.blocked || []) { scan('blocked.label', b.label); scan('blocked.text', b.text); }
    for (const reg of vm.palette.regions) for (const p of reg.parts) scan('part', p.label);
    // and the garment lines themselves
    for (const a of ['g_shirt.-.hand.push_shirt_up.steady']) {
      const res = nightStepAction(g, id, a, 'r');
      if (res) { applyNightStep(g, id, res); scan('line', composeNightLine(g, id, res, 'r').text); }
    }
    const restore = nightStepAction(g, id, 'shirt.-.hand.fix.steady', 'r2');
    if (restore) scan('restoreLine', composeNightLine(g, id, restore, 'r2').text);
    return { bad, blockedCount: (vm.blocked||[]).length };
  })()`);
  check('no feminine pronoun survives into the blocked hints or the garment lines',
    r.bad.length === 0, JSON.stringify(r.bad, null, 1));
  check('...and there were blocked regions to check', r.blockedCount > 0);
}

console.log('\n==============================================');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('==============================================');
process.exit(fail === 0 ? 0 : 1);
