// Vocation & Lifestyle Expansion — Phase 7: lifestyle derivation (idle pastimes).
//
// D23 governs this phase absolutely: one lifestyle dimension, the field AND its
// reader shipped in the same change. The dimension shipped here is *what a
// person's job tilts them toward in free time* — which low-stakes idle drive
// (read a book, put the TV on, scroll a phone) they reach for when nothing is
// pressing. That is observable without being told: you catch them reading
// instead of watching TV.
//
// The drives are also the empty-afternoon fix the plan's Handoff says Phase 4
// was missing: measured, an idle midday tick scored its best candidate at
// ~0.356 against COGNITION.actionThreshold 0.40, and an unemployed NPC ended
// up LESS active than an employed one. So the phase has to prove both halves:
//   (a) the lean  — same NPC, occupation changed ONLY in idlePastimes, the
//       listed drive outranks its sibling, and a real need still beats both;
//   (b) the fix   — the best idle-midday candidate now clears the bar on
//       appeal, which restores the plan's original prediction that unemployment
//       shows up as a fuller day rather than an emptier one.
//
// Field:   OCCUPATION_POOL[].idlePastimes → bible occupation schema (default [])
// Reader:  idlePastimePreferred() + the `pastime` term in scoreDrive (cognition.js)
// A/B:     sections 3, 4 and 5, each a same-cast comparison with only one
//          input varied.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const SRCFILES = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const srcOf = (f) => fs.readFileSync(path.join(SRCFILES, f), 'utf8');

// A cast with a known occupation in every slot, built by forcing the title
// onto a normally-generated NPC (p34's idiom, extended to carry idlePastimes
// exactly as rollCastSlot now does).
api(`
  __house = (seed) => {
    const h = SIM_generateHouse(seed, 3);
    const gs = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                 player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(gs.world.upgrades)) gs.world.upgrades[k] = { tier: 'functional', condition: 100 };
    return gs;
  };
  __residents = (gs) => Object.keys(gs.npcs).filter(id => gs.npcs[id].residency && gs.npcs[id].residency.status === 'resident').sort();
  __forceOcc = (gs, id, title) => {
    const src = OCCUPATION_POOL.find(o => o.title === title);
    const occ = {
      category: src.category, title: src.title, scheduleTemplate: src.scheduleTemplate,
      incomeBand: src.incomeBand, hours: src.hours,
      workMode: src.workMode || 'on_site', incomeSource: src.incomeSource || 'wage',
    };
    if (src.workRoom) occ.workRoom = src.workRoom;
    if (src.workActivities) occ.workActivities = src.workActivities;
    if (src.idlePastimes) occ.idlePastimes = src.idlePastimes;
    gs.npcs[id].bible.occupation = occ;
    gs.npcs[id].bible.scheduleTemplate = src.scheduleTemplate;
    return occ;
  };
  // One week through resolveBatch (NOT a bare resolveTick loop — same reason
  // as p34: updates must merge and the clock must advance, or activity and
  // commitment read empty forever).
  __week = (gs, days) => {
    const ids = __residents(gs);
    const rows = [];
    const ticksPerDay = Math.floor(1440 / CLOCK.tickMinutes);
    let state = gs;
    for (let t = 0; t < days * ticksPerDay; t++) {
      state = resolveBatch(state, 1).state;
      for (const id of ids) {
        const n = state.npcs[id];
        rows.push({
          id, day: state.meta.clock.day, minutes: state.meta.clock.minutes,
          block: resolveScheduleActivity(n, state.meta.clock, state, id).block,
          loc: n.location || null,
          act: n.activity || '',
          cmt: n.commitment ? n.commitment.kind : '',
        });
      }
    }
    Object.assign(gs, state);
    return rows;
  };
  __weekMeasure = (title, seeds) => {
    const IDLE_ACTS = ['reading', 'watching TV', 'scrolling social media'];
    let drives = 0, awake = 0, idleTicks = 0, offsite = 0;
    for (const seedN of seeds) {
      const gs = __house('p7-' + title + '-' + seedN);
      const ids = __residents(gs);
      for (const id of ids) __forceOcc(gs, id, title);
      const rows = __week(gs, 7);
      for (const r of rows) {
        if (r.cmt === 'drive' || r.cmt === 'action') {
          drives++;
          // The metric for "the idle drives actually fired": a drive/action
          // commitment whose activity is one of the three idle strings. The
          // scheduled tables also emit 'reading'/'watching TV'/'scrolling
          // social media' (ACTIVITY_TABLES) with no commitment, so counting
          // raw activity strings would let the schedule satisfy the check.
          if (IDLE_ACTS.includes(r.act)) idleTicks++;
        }
        if (r.block !== 'sleep') awake++;
        if (r.loc === null) offsite++;
      }
    }
    return { drives, awake, perAwake: drives / (awake || 1), idleTicks, offsite };
  };
`);

// ---------------------------------------------------------------- 1
console.log('\n1. The idle drives exist and are shaped');

const IDLE_IDS = ['read_book', 'watch_tv', 'scroll_phone'];
for (const d of IDLE_IDS) {
  check(`${d} is a DRIVE_DEFS entry`, api(`!!DRIVE_DEFS[${JSON.stringify(d)}]`));
  check(`${d} is marked isIdlePastime`, api(`DRIVE_DEFS[${JSON.stringify(d)}].isIdlePastime === true`));
  // The whole fix: it clears COGNITION.actionThreshold on APPEAL alone (base
  // + pastime), with no `utility.need` curve behind it — the thing the empty
  // afternoon was missing. baseAppeal alone must sit at or above the bar.
  check(`${d} clears the bar on base appeal (>= actionThreshold)`,
    api(`DRIVE_DEFS[${JSON.stringify(d)}].utility.baseAppeal >= COGNITION.actionThreshold`),
    'base ' + api(`DRIVE_DEFS[${JSON.stringify(d)}].utility.baseAppeal`) + ', threshold ' + api('COGNITION.actionThreshold'));
  check(`${d} declares no need curve (appeal-driven, not desperation-driven)`,
    api(`!DRIVE_DEFS[${JSON.stringify(d)}].utility.need`));
  check(`${d} declares pastimeWeight (the D23 lean)`,
    api(`(DRIVE_DEFS[${JSON.stringify(d)}].utility.pastimeWeight || 0) > 0`));
  check(`${d} has holdMinutes and a positive cooldown`,
    api(`DRIVE_DEFS[${JSON.stringify(d)}].utility.holdMinutes > 0 && DRIVE_DEFS[${JSON.stringify(d)}].cooldownMinutes > 0`));
  check(`${d} names an activity the peek pipeline can read`,
    api(`PEEK_VIEW_ACT[DRIVE_DEFS[${JSON.stringify(d)}].activityOverride]`));
  // Design invariant 4 — nudity is decided in resolveTick pass 2, never by a
  // drive. An idle drive that set clothing itself would bypass the gate.
  check(`${d} does not set clothing (design invariant 4)`,
    api(`!DRIVE_DEFS[${JSON.stringify(d)}].setsClothing`));
}

check('exactly three drives are idle pastimes — no fourth sneaks in',
  api(`Object.values(DRIVE_DEFS).filter(d => d.isIdlePastime).length === 3`),
  api(`Object.values(DRIVE_DEFS).filter(d => d.isIdlePastime).map(d => Object.keys(DRIVE_DEFS).find(k => DRIVE_DEFS[k] === d)).join(', ')`));

// D1 — the schedule-block vocabulary is CLOSED. These three drives must key
// only on block names that already exist, or the union of block names the
// p1 harness pins is broken.
const badBlocks = api(`
  (() => {
    const known = Object.keys(BLOCK_TIME_OF_DAY);
    const bad = [];
    for (const d of ${JSON.stringify(IDLE_IDS)}) {
      for (const b of (DRIVE_DEFS[d].timeOfDay || [])) if (!known.includes(b)) bad.push(d + ':' + b);
    }
    return bad;
  })()
`);
check('no idle drive introduces a new block name (D1)', badBlocks.length === 0, badBlocks.join(', '));

// ---------------------------------------------------------------- 2
console.log('\n2. The pool field and the schema (D23, half 1)');

const poolBad = api(`
  (() => {
    const idle = new Set(${JSON.stringify(IDLE_IDS)});
    const bad = [];
    for (const o of OCCUPATION_POOL) {
      const list = o.idlePastimes;
      if (!Array.isArray(list) || list.length === 0 || list.length > 2) { bad.push(o.title + ':missing'); continue; }
      for (const d of list) if (!idle.has(d)) bad.push(o.title + ':' + d);
      if (new Set(list).size !== list.length) bad.push(o.title + ':dup');
    }
    return bad;
  })()
`);
check(`every pool entry names 1-2 real idle pastimes (${api('OCCUPATION_POOL.length')} entries)`,
  poolBad.length === 0, poolBad.join(', '));

check('the schema declares idlePastimes with an empty default (legacy = no lean)',
  api(`!!OCCUPATION_SCHEMA.occupation.fields.idlePastimes
      && OCCUPATION_SCHEMA.occupation.fields.idlePastimes.default !== undefined
      && OCCUPATION_SCHEMA.occupation.fields.idlePastimes.default.length === 0`));

check('rollCastSlot carries the field onto the bible',
  api(`(() => {
    const r = generateCast('p7-carry', 4, 1, null);
    for (const id of r.npcIds) {
      const o = r.npcs[id].bible.occupation;
      const src = OCCUPATION_POOL.find(x => x.title === o.title);
      if (JSON.stringify(o.idlePastimes || []) !== JSON.stringify(src.idlePastimes || [])) return false;
    }
    return true;
  })()`));

// The reader must be robust to the field being ABSENT — a legacy save, a
// hand-authored NPC. That is the schema default's other half.
check('the D23 reader is false for an absent/empty list',
  api(`idlePastimePreferred({ bible: { occupation: {} } }, 'read_book') === false
      && idlePastimePreferred({ bible: { occupation: { idlePastimes: [] } } }, 'read_book') === false`));

// ---------------------------------------------------------------- 3
console.log('\n3. THE A/B — same NPC, only idlePastimes changes');

// One NPC, comfortable needs, in the living room at 12:00 (a lazy midday
// tick). The occupation is whatever was rolled; only the idlePastimes list
// differs between the score columns.
const ab = api(`
  (() => {
    const gs = __house('p7-ab');
    const id = __residents(gs)[0];
    const n = gs.npcs[id];
    for (const k of Object.keys(n.needs || {})) n.needs[k] = 80;
    n.needs.desire = 20;
    n.location = 'living_room';
    gs.meta.clock.minutes = 720;   // 12:00 — the measured dead zone
    const ctx = { perceived: [], block: 'midday', minutesOfDay: 720,
                  location: 'living_room', activity: null, npcId: id,
                  nowAbs: clockToAbsolute(gs.meta.clock), isVisitor: false, gameState: gs };
    const score = (list) => {
      delete n.bible.occupation.idlePastimes;
      if (list !== undefined) n.bible.occupation.idlePastimes = list;
      return {
        read_book:   scoreDrive('read_book', n, ctx).score,
        watch_tv:    scoreDrive('watch_tv', n, ctx).score,
        scroll_phone: scoreDrive('scroll_phone', n, ctx).score,
      };
    };
    return {
      one:   score(['read_book']),
      two:   score(['read_book', 'watch_tv']),
      none:  score(undefined),
      threshold: COGNITION.actionThreshold,
    };
  })()
`);
console.log(`        lean[read_book]           : ${JSON.stringify(ab.one)}`);
console.log(`        lean[read_book,watch_tv]  : ${JSON.stringify(ab.two)}`);
console.log(`        no list (legacy)          : ${JSON.stringify(ab.none)}`);

const t = ab.threshold;
check('a listed drive outranks its unlisted siblings (strict, single-item list)',
  ab.one.read_book > ab.one.watch_tv && ab.one.read_book > ab.one.scroll_phone,
  'the lean must be a ranking, not a gate');
check('the unlisted siblings stay flat in each other\'s shadow',
  Math.abs(ab.one.watch_tv - ab.one.scroll_phone) < 1e-9);
check('both listed and unlisted clear the bar (a lean, never a licence to idle-exclusively)',
  Object.values(ab.one).every(v => v > t), JSON.stringify(ab.one));
check('a two-item list ties at the top and beats the third',
  Math.abs(ab.two.read_book - ab.two.watch_tv) < 1e-9 && ab.two.read_book > ab.two.scroll_phone);
check('an absent list scores every idle drive flat — a legacy NPC still idles, just without a favourite',
  Math.abs(ab.none.read_book - ab.none.watch_tv) < 1e-9 && Math.abs(ab.none.watch_tv - ab.none.scroll_phone) < 1e-9
  && ab.none.read_book > t);

// Design invariant: the idle drives fill the EMPTY afternoon, never crowd out
// self-care. A real need must still beat the strongest idle lean.
const needWin = api(`
  (() => {
    const gs = __house('p7-need');
    const id = __residents(gs)[0];
    const n = gs.npcs[id];
    for (const k of Object.keys(n.needs || {})) n.needs[k] = 80;
    n.needs.desire = 20;
    n.bible.occupation = { ...n.bible.occupation, idlePastimes: ['read_book', 'watch_tv'] };
    n.location = 'living_room';
    gs.meta.clock.minutes = 720;
    const ctx = { perceived: [], block: 'midday', minutesOfDay: 720,
                  location: 'living_room', activity: null, npcId: id,
                  nowAbs: clockToAbsolute(gs.meta.clock), isVisitor: false, gameState: gs };
    const idle = scoreDrive('read_book', n, ctx).score;
    n.needs.hunger = 20;
    const eat = scoreDrive('eat', n, ctx).score;
    n.needs.hunger = 80; n.needs.hygiene = 20;
    const shower = scoreDrive('shower', n, ctx).score;
    return { idle, eat, shower };
  })()
`);
console.log(`        idle ${needWin.idle.toFixed(3)} vs eat ${needWin.eat.toFixed(3)} (hunger 20), shower ${needWin.shower.toFixed(3)} (hygiene 20)`);
check('a genuinely hungry NPC still eats over idling', needWin.eat > needWin.idle);
check('a genuinely grubby NPC still showers over idling', needWin.shower > needWin.idle);

// The exact measurement the plan's Handoff records: an idle midday tick's
// best candidate scored ~0.356 and nothing fired. Through the REAL loop's
// function (scoreCandidates, the thing evaluateDrives calls), with a real
// NPC's occupation lean applied, the best candidate must now clear 0.40.
const idleMidday = api(`
  (() => {
    const gs = __house('p7-midday');
    const id = __residents(gs)[0];
    const n = gs.npcs[id];
    for (const k of Object.keys(n.needs || {})) n.needs[k] = 80;
    n.needs.desire = 20;
    gs.meta.clock.minutes = 720;
    n.bible.occupation = { ...n.bible.occupation, workMode: 'none', idlePastimes: ['read_book', 'watch_tv'] };
    n.location = 'living_room';
    const scored = scoreCandidates(n, id, gs, { block: 'midday', location: 'living_room', activity: null }, []);
    return {
      best: scored[0] ? { id: scored[0].driveId, score: scored[0].score } : null,
      threshold: COGNITION.actionThreshold,
    };
  })()
`);
console.log(`        best candidate on a comfortable midday tick: ${idleMidday.best ? idleMidday.best.id + ' @ ' + idleMidday.best.score.toFixed(3) : 'none'}`);
check('an idle midday tick now has a winner above the bar (was ~0.356)',
  idleMidday.best && idleMidday.best.score > idleMidday.threshold,
  'the drives must clear the bar on appeal, not by a need behind them');
check('...and that winner is an idle drive (the afternoon, not a chore)',
  idleMidday.best && IDLE_IDS.includes(idleMidday.best.id));

// ---------------------------------------------------------------- 4
console.log('\n4. A week — the empty afternoon is filled (the thesis restored)');

// p34 measured the plan's prediction FALSE: on_site 819 vs unemployed 708
// drive-ticks over the same awake ticks. Phase 7's job was to restore the
// prediction that an unemployed NPC has a fuller day, not an emptier one.
const week = api(`
  (() => ({
    on_site:     __weekMeasure('QA Tester', [1, 2, 3]),
    unemployed:  __weekMeasure('Between Things', [1, 2, 3]),
  }))()
`);
console.log(`        on_site    : ${week.on_site.drives} drive-ticks / ${week.on_site.awake} awake (${week.on_site.perAwake.toFixed(3)}), ${week.on_site.idleTicks} idle-drive ticks, ${week.on_site.offsite} offsite`);
console.log(`        unemployed : ${week.unemployed.drives} drive-ticks / ${week.unemployed.awake} awake (${week.unemployed.perAwake.toFixed(3)}), ${week.unemployed.idleTicks} idle-drive ticks, ${week.unemployed.offsite} offsite`);

check('the unemployed NPC now OUT-ACTS the on_site one per awake tick (thesis restored)',
  week.unemployed.perAwake > week.on_site.perAwake,
  `before Phase 7 the on_site NPC was ahead (0.406 vs 0.350)`);
check('idle pastimes are observable behaviour — the idle DRIVES fired as commitments in both populations',
  week.on_site.idleTicks > 0 && week.unemployed.idleTicks > 0);
check('an unemployed NPC idles more than an on_site one (all day free vs an evening)',
  week.unemployed.idleTicks > week.on_site.idleTicks,
  `unemployed ${week.unemployed.idleTicks} vs on_site ${week.on_site.idleTicks} idle-drive commitment ticks`);
check('an unemployed NPC spends their whole day in the flat (D21 presence still holds)',
  week.unemployed.offsite === 0, `${week.unemployed.offsite} offsite ticks`);
check('an on_site NPC still leaves for real (absence still exists)',
  week.on_site.offsite > 0, `${week.on_site.offsite} offsite ticks`);

// ---------------------------------------------------------------- 5
console.log('\n5. The phase\'s contribution, measured against its own absence');

// The honest A/B for the FIX: the same cast and seeds with the three idle
// drives deleted from DRIVE_DEFS mid-process. Pre-Phase-7 that is exactly
// what the engine was, and p34 measured the unemployed NPC at ~0.350
// per-awake — losing to the employed one. Deleting a drive mid-run is safe:
// its cooldown stamps become inert (isOnCooldown reads cooldownMinutes from
// candidateDef, which then returns nothing).
const toggle = api(`
  (() => {
    const measureAll = (seeds) => ({
      on_site:    __weekMeasure('QA Tester', seeds),
      unemployed: __weekMeasure('Between Things', seeds),
    });
    const withDrives = measureAll([1, 2]);
    const saved = {};
    for (const d of ['read_book', 'watch_tv', 'scroll_phone']) { saved[d] = DRIVE_DEFS[d]; delete DRIVE_DEFS[d]; }
    const withoutDrives = measureAll([1, 2]);
    for (const d of Object.keys(saved)) DRIVE_DEFS[d] = saved[d];
    return { withDrives, withoutDrives };
  })()
`);
console.log(`        with    : unemployed ${toggle.withDrives.unemployed.perAwake.toFixed(3)}/awake, on_site ${toggle.withDrives.on_site.perAwake.toFixed(3)}/awake`);
console.log(`        without : unemployed ${toggle.withoutDrives.unemployed.perAwake.toFixed(3)}/awake, on_site ${toggle.withoutDrives.on_site.perAwake.toFixed(3)}/awake`);

check('removing the idle drives drops the unemployed NPC back toward the measured ~0.35 baseline',
  toggle.withoutDrives.unemployed.perAwake < toggle.withDrives.unemployed.perAwake,
  'the idle drives are what filled the afternoon — if this is flat, the drives are not being scored');
check('the drives\' absence also suppresses the employed NPC\'s evening idle',
  toggle.withoutDrives.on_site.perAwake < toggle.withDrives.on_site.perAwake);
check('the toggle restored DRIVE_DEFS cleanly',
  api(`!!DRIVE_DEFS.read_book && !!DRIVE_DEFS.watch_tv && !!DRIVE_DEFS.scroll_phone`));

// ---------------------------------------------------------------- 6
console.log('\n6. Determinism within the version');

check('the same seed produces the same idlePastimes every time', api(`
  (() => {
    const a = generateCast('p7-det', 4, 1, null);
    const b = generateCast('p7-det', 4, 1, null);
    const key = (r) => r.npcIds.map(id => JSON.stringify(r.npcs[id].bible.occupation.idlePastimes || [])).join('|');
    return key(a) === key(b);
  })()
`));
check('two identical weeks produce identical drive totals', api(`
  (() => {
    const run = () => {
      const gs = __house('p7-det-week');
      const ids = __residents(gs);
      for (const id of ids) __forceOcc(gs, id, 'Between Things');
      let drives = 0;
      for (const r of __week(gs, 3)) if (r.cmt === 'drive' || r.cmt === 'action') drives++;
      return drives;
    };
    return run() === run();
  })()
`));

// ---------------------------------------------------------------- 7
console.log('\n7. D23 — the field has a reader, and only the planned sites touch it');

const configSrc = srcOf('config.js');
const cognitionSrc = srcOf('cognition.js');
const simSrc = srcOf('sim.js');
const p2Src = fs.readFileSync(path.join(__dirname, 'verify-voc-p2.js'), 'utf8');

check('the field is authored (schema + pool) in config.js', (configSrc.match(/idlePastimes/g) || []).length >= 4,
  'schema field, schema comment, and the pool entries must all name it');
check('the field has a reader in cognition.js (the same phase — RI6)',
  cognitionSrc.includes('function idlePastimePreferred') && cognitionSrc.includes('pastimeWeight'));
check('the reader is actually wired into the scorer',
  cognitionSrc.includes('appeal = base + need + signal + motive + desireBias + willingnessBias + pastime'));
check('rollCastSlot carries the field in sim.js',
  simSrc.includes('occ.idlePastimes'));
check('verify-voc-p2\'s pool-key allowlist admits the field (no silent drift in the D23 pin)',
  p2Src.includes("'idlePastimes'"));
// A field read by nothing is the stressProfile scar. Grep for the reader's
// call site: the pastime term must reference the D23 function.
check('the term calls the reader — no parallel copy of the lean',
  cognitionSrc.includes('idlePastimePreferred(npc, driveId)'));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
