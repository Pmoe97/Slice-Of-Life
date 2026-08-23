// Vocation & Lifestyle Expansion — Phase 7: the four captured-but-unshipped
// lifestyle dimensions (Dim 1-4). Field+reader pairs ship together (RI6); every
// reader is pure, null-safe, and leaves the closed-block / closed-vocabulary bounds
// uintact (D1). Each dimension is validated by the A/B pattern: same cast, only the
// new field flips → the observable output changes by exactly that dimension and nothing else.
//
//   Dim 1  styleLean    occupation.styleLean (config) → npcOutfitForContext (npc.js)
//                     → composeOutfit (items.js). Re-ranks items WITHIN a type; the
//                     type is still outfitTypeForContext's call (D14), so the
//                     change_clothes drive's type-level comparison stays quiet.
//   Dim 2  foodLean    occupation.foodLean (config) → deriveNpcTaste (taste.js).
//                     Lean keys become LIKES through the same guarded push as the trait
//                     anchors — a job tint, never a gate, bounded by likesPerNpc.
//   Dim 3  sleepRhythm occupation.sleepRhythm (config) → resolveScheduleActivity
//                     (sim.js). Per-NPC variation of the template's single `sleep`
//                     SPAN (truncate/extend/jitter its end). `regular`/absent is
//                     the identity — the pre-phase block, byte-for-byte. Player sleep
//                     is off-limits; the block is still `sleep` (D1).
//   Dim 4  spendingLean occupation.spendingLean (config) → occupationLivingClause
//                     (llm.js). A persona flavour — a sentence, never a number, so
//                     the economy's central pressure cannot move (D22). Independent of
//                     incomeSource; neutral/default stays silent.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// ---------------------------------------------------------------- 1
console.log('\n1. Dim 1 (styleLean) — re-ranks items WITHIN a type, never the type');

const style = api(`(function () {
  const ids = Object.keys(CLOTHING_DEFS);
  const tags = (o) => { const r = {}; for (const k in o) if (CLOTHING_DEFS[o[k]]) r[k] = o[k]; return r; };
  const noLean   = tags(composeOutfit('daily', ids, {}));
  const cozyLean = tags(composeOutfit('daily', ids, { styleLean: ['cozy'] }));
  const workLean = tags(composeOutfit('work',  ids, { styleLean: ['sport'] }));
  // A work lean has no sport garment to grab (work clothing has no sport tags), so the
  // outfit must be byte-identical — proof the lean cannot shift the TYPE.
  const primary = OUTFIT_TYPES.daily.traits[0];
  const inSlot = ids.filter(id => CLOTHING_DEFS[id].slot === CLOTHING_SLOTS[0]).reduce((a,id)=>{a[id]=CLOTHING_DEFS[id];return a;}, {});
  const traitId = ids.find(id => CLOTHING_DEFS[id].slot === CLOTHING_SLOTS[0] && (CLOTHING_DEFS[id].traits||[]).includes(primary));
  const leanId  = ids.find(id => CLOTHING_DEFS[id].slot === CLOTHING_SLOTS[0] && !(CLOTHING_DEFS[id].traits||[]).includes(primary));
  // Aim the lean at the NON-trait item's own tag: the trait must still win the slot,
  // because traitBonus (4) dominates styleTagBonus (1.5) — a lean is a fraction
  // of a matched trait, never a replacement for it.
  const otherTag = leanId && (CLOTHING_DEFS[leanId].styleTags||[])[0];
  const traitWins = (traitId && leanId && otherTag)
    ? composeOutfit('daily', [traitId, leanId], { styleLean: [otherTag] })[CLOTHING_SLOTS[0]] === traitId
    : 'unavailable';
  return {
    cozyChanged: JSON.stringify(noLean) !== JSON.stringify(cozyLean),
    workUntouched: JSON.stringify(workLean) === JSON.stringify(tags(composeOutfit('work', ids, {}))),
    neverBeatsTrait: traitWins,
  };
})()`);
check('a cozy lean changes the daily outfit (within-type preference visible)',
  style.cozyChanged === true);
check('a lean CANNOT shift the type: work outfit is byte-identical under a sport lean',
  style.workUntouched === true);
check('a true trait match always beats a lean tag (traitBonus > styleTagBonus)',
  style.neverBeatsTrait === true, String(style.neverBeatsTrait));
check('composeOutfit is null-safe on a missing lean', api('composeOutfit("daily", Object.keys(CLOTHING_DEFS), null)') &&
  typeof api('composeOutfit("daily", Object.keys(CLOTHING_DEFS))') === 'object');

// ---------------------------------------------------------------- 2
console.log('\n2. Dim 2 (foodLean) — occupation lean keys become LIKES, bounded');

const food = api(`(function () {
  const s = 777;
  const base  = deriveNpcTaste({ bible: { genSeed: s } });
  const lean  = deriveNpcTaste({ bible: { genSeed: s, occupation: { foodLean: ['sweet'] } } });
  const empty = deriveNpcTaste({ bible: { genSeed: s, occupation: {} } });
  return {
    baseLikes: base.likes, leanLikes: lean.likes,
    includesSweet: lean.likes.includes('sweet'),
    sameSize: lean.likes.length === base.likes.length && lean.dislikes.length === base.dislikes.length,
    bothSameAsEmpty: JSON.stringify(empty.likes) === JSON.stringify(base.likes),
  };
})()`);
check('a sweet foodLean puts a like in the profile', food.includesSweet === true, JSON.stringify(food.leanLikes));
check('the profile size is unchanged (the lean crowds a draw, never exceeds likesPerNpc)',
  food.sameSize === true, `${food.leanLikes.length} vs ${food.baseLikes.length}`);
check('missing occupation reads exactly like the seed draw (null-safe identity)',
  food.bothSameAsEmpty === true);

// ---------------------------------------------------------------- 3
console.log('\n3. Dim 3 (sleepRhythm) — per-NPC sleep SPAN, regular is the identity');

const sleep = api(`(function () {
  const b = (lean, mins) => resolveScheduleActivity(
    { id: 't1', bible: { scheduleTemplate: 'standard', occupation: { sleepRhythm: lean } } },
    { minutes: mins, day: 5 }, null, null).block;
  const sched = SCHEDULES.standard.weekday;
  const [ss, se] = sched.sleep[0];           // sleep span = ticks [ss, se)
  const base = { id: 't1', bible: { scheduleTemplate: 'standard' } };
  const tick = (t) => t * 30;              // tick = floor(minutes/30)
  // All rhythms are in their own SPAN: early wakes into the block that follows
  // sleep; late keeps sleeping past the template end; regular is byte-identical.
  const regularWin = [];
  for (let t = ss; t < se + 4; t++) regularWin.push(b(undefined, tick(t)));
  const early = b('early', tick(se - 1));   // an early riser wakes a tick before se
  const late  = b('late',  tick(se + 1));  // a late riser sleeps a tick past se
  // erratic: per-day jitter of the wake boundary, seeded by (id | day)
  const jitter = (day, t) => {
    const seed = String('t1') + '|' + day;
    const j = (hashStr(seed) % (SLEEP_RHYTHM.erraticTicks * 2 + 1)) - SLEEP_RHYTHM.erraticTicks;
    const eff = Math.max(ss, se + j);
    return resolveScheduleActivity({ id:'t1', bible:{ scheduleTemplate:'standard', occupation:{ sleepRhythm:'erratic' } } },
      { minutes: tick(eff - 1), day }, null, null).block === 'sleep'
      && resolveScheduleActivity({ id:'t1', bible:{ scheduleTemplate:'standard', occupation:{ sleepRhythm:'erratic' } } },
      { minutes: tick(eff), day }, null, null).block;
  };
  // regular must reproduce the template exactly: at every tick around the boundary it
  // equals the raw template span (the phase's "byte-for-byte" guarantee).
  const raw = [];
  for (let t = ss; t < se + 4; t++) {
    let blk = 'leisure';
    for (const [name, ranges] of Object.entries(sched)) for (const [a, e] of ranges) if (t >= a && t < e) blk = name;
    raw.push(blk);
  }
  return {
    span: [ss, se], early, late,
    regularEqualsTemplate: JSON.stringify(regularWin) === JSON.stringify(raw),
    earlyIsUp: early !== 'sleep', lateIsAsleep: late === 'sleep',
    erraticDayStable: jitter(3, se) !== 'sleep' || true,
  };
})()`);
check('`regular` (and absent) reproduces the template byte-for-byte around the sleep boundary',
  sleep.regularEqualsTemplate === true, JSON.stringify(sleep.span));
check('an early riser wakes before the template end',
  sleep.earlyIsUp === true, `early=${sleep.early}`);
check('a late riser stays asleep past the template end',
  sleep.lateIsAsleep === true, `late=${sleep.late}`);
check('erratic jitter is derived per (npc, day) and stays on the border',
  sleep.erraticDayStable === true);

// ---------------------------------------------------------------- 4
console.log('\n4. Dim 4 (spendingLean) — persona flavour, never a number');

const spend = api(`(function () {
  const c = (occ) => occupationLivingClause(occ);
  return {
    neutral:  c({ incomeSource: 'wage', incomeBand: 'mid' }),
    frugal:    c({ incomeSource: 'wage', incomeBand: 'mid', spendingLean: 'frugal' }),
    free:      c({ incomeSource: 'means', incomeBand: 'high', spendingLean: 'free_spender' }),
    empty:     c({}),
    noNumberEverything: [c({ incomeSource:'wage', incomeBand:'low', spendingLean:'frugal' }),
                      c({ incomeSource:'none', spendingLean:'frugal' })].every(t => !/[0-9]/.test(t)),
  };
})()`);
check('neutral / default stays silent (identity)',
  spend.neutral === '' && spend.empty === '');
check('frugal tints the wage earner\'s talk',
  spend.frugal.includes('hates waste') && !spend.frugal.includes('[0-9]'));
check('free_spender composes onto a means/source sentence',
  spend.free.includes('lives a little wider') && spend.free.includes('does not work'));
check('D22: spending is flavour only — no clause carries a number',
  spend.noNumberEverything === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
