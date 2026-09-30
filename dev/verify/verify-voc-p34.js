// Vocation & Lifestyle Expansion — Phase 3 (the at-home workday) and
// Phase 4 (unemployment and means).
//
// Phase 3's top-of-phase blocker is D15: `go_work` must never open for an
// at-home worker, because movement.js lands that commitment by setting
// pos/location to null at the front door — an at-home worker who walked out
// would be off-map for the whole shift with no return path. That assertion
// runs first and is the one that would have hurt.
//
// The rest is measurement. "Remote workers are home" is only interesting if
// the flat's daytime occupancy actually moved, and D13's interruption
// multiplier is only correct if the event's overall rate stayed in band —
// so both are measured against a legacy-behaviour control run in the same
// process, for the reason verify-voc-p1-equiv.js explains at length.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// A cast with a known work mode in every slot, built by forcing the
// occupation onto a normally-generated NPC. Everything else about them is a
// real roll, so the schedule/drive machinery sees an ordinary character.
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
    if (occ.workMode === 'hybrid') occ.officeDays = [0, 2];   // Mon + Wed, fixed for the test
    gs.npcs[id].bible.occupation = occ;
    gs.npcs[id].bible.scheduleTemplate = src.scheduleTemplate;
    return occ;
  };
  // One week, recording per-tick presence and block for every resident.
  //
  // resolveBatch, NOT a bare resolveTick loop. resolveTick RETURNS npcUpdates
  // and does not apply them — only direct mutations (a commitment writing
  // npc.location) survive a bare call, so activity and outfit read empty
  // forever and the harness silently measures half the engine. resolveBatch
  // advances the clock, merges the updates and runs the needs heartbeat,
  // which is what the real game does.
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
          outfit: (n.outfit && n.outfit.type) || '',
          mode: n.bible.occupation.workMode,
        });
      }
    }
    // The caller inspects gs afterwards in a couple of places, so hand back
    // the evolved state rather than leaving them looking at tick zero.
    Object.assign(gs, state);
    return rows;
  };
`);

// ---------------------------------------------------------------- 1
console.log('\n1. TOP-OF-PHASE BLOCKER (D15) — go_work must never open at home');

const workCommitByMode = api(`
  (() => {
    const seen = {};
    for (const title of ['QA Tester', 'Software Developer', 'Backend Engineer', 'Cam Model', 'Between Things']) {
      const gs = __house('p34-' + title);
      const ids = __residents(gs);
      for (const id of ids) __forceOcc(gs, id, title);
      const rows = __week(gs, 7);
      const mode = gs.npcs[ids[0]].bible.occupation.workMode;
      seen[title] = {
        mode,
        workCommits: rows.filter(r => r.cmt === 'work').length,
        offsiteTicks: rows.filter(r => r.loc === null).length,
        total: rows.length,
      };
    }
    return seen;
  })()
`);

for (const [title, r] of Object.entries(workCommitByMode)) {
  console.log(`        ${title} (${r.mode}): work-commitment ticks ${r.workCommits}, offsite ticks ${r.offsiteTicks}/${r.total}`);
}
check('on_site work DOES open a work commitment (the path still works)',
  workCommitByMode['QA Tester'].workCommits > 0);
check('remote work opens NO work commitment (D15)',
  workCommitByMode['Backend Engineer'].workCommits === 0);
// Self-employed is NOT "never leaves" — D2 gives them gig days (a shoot, a
// client, a venue), so some work commitments are correct. What must hold is
// that the majority of their shifts happen at home.
const cam = workCommitByMode['Cam Model'];
const camHomeShare = 1 - (cam.offsiteTicks / cam.total);
check(`self-employed work is mostly at home (${(camHomeShare * 100).toFixed(1)}% of ticks in the flat)`,
  camHomeShare > 0.9 && cam.offsiteTicks > 0,
  `offsite ${cam.offsiteTicks}/${cam.total} — some gig days are expected, all-or-nothing is not`);
check('workMode:none opens NO work commitment (D21)',
  workCommitByMode['Between Things'].workCommits === 0);

// ---------------------------------------------------------------- 2
console.log('\n2. Presence — the behaviour Phase 3 exists to create');

check('a remote NPC is NEVER off-map during a work block',
  workCommitByMode['Backend Engineer'].offsiteTicks === 0,
  `${workCommitByMode['Backend Engineer'].offsiteTicks} offsite ticks`);
check('an unemployed NPC is NEVER off-map',
  workCommitByMode['Between Things'].offsiteTicks === 0);
check('an on_site NPC still spends real time off-map (absence still exists)',
  workCommitByMode['QA Tester'].offsiteTicks > workCommitByMode['QA Tester'].total * 0.1);

const hybrid = api(`
  (() => {
    const gs = __house('p34-hybrid');
    const ids = __residents(gs);
    for (const id of ids) __forceOcc(gs, id, 'Software Developer');   // officeDays [0,2]
    const rows = __week(gs, 14).filter(r => r.block === 'work');
    const byDay = {};
    for (const r of rows) {
      const wd = getWeekday(r.day);
      byDay[wd] = byDay[wd] || { off: 0, home: 0 };
      if (r.loc === null) byDay[wd].off++; else byDay[wd].home++;
    }
    return byDay;
  })()
`);
console.log(`        hybrid work-block ticks by weekday (0=Mon): ${JSON.stringify(hybrid)}`);
const officeDays = [0, 2];
let hybridOk = true, hybridDetail = [];
for (const wd of Object.keys(hybrid)) {
  const d = hybrid[wd];
  const isOffice = officeDays.includes(Number(wd));
  const ok = isOffice ? (d.off > 0 && d.home === 0) : (d.home > 0 && d.off === 0);
  if (!ok) { hybridOk = false; hybridDetail.push(`wd${wd} office=${isOffice} off=${d.off} home=${d.home}`); }
}
check('a hybrid NPC is offsite on exactly their officeDays and home otherwise (D4)',
  hybridOk, hybridDetail.join('; '));

// ---------------------------------------------------------------- 3
console.log('\n3. Placement — where the at-home workday happens (D5)');

const placement = api(`
  (() => {
    const gs = __house('p34-place');
    const ids = __residents(gs);
    for (const id of ids) __forceOcc(gs, id, 'Backend Engineer');    // workRoom ['study','bedroom']
    const rows = __week(gs, 7).filter(r => r.block === 'work');
    const rooms = {}, acts = {};
    let studyOver = 0;
    const byTick = {};
    for (const r of rows) {
      rooms[r.loc] = (rooms[r.loc] || 0) + 1;
      acts[r.act] = (acts[r.act] || 0) + 1;
      const k = r.day + ':' + r.minutes;
      byTick[k] = byTick[k] || [];
      // Only NPCs actually WORKING in the study count against the D5 rule.
      // The ordinary wander uses SCENE.crowdAvoidanceWeight, a soft weight
      // that discourages a full room without forbidding it, so a roommate
      // who wandered in to read is not a placement bug.
      if (r.loc === 'study' && r.cmt === 'work_home') byTick[k].push(r.id);
    }
    for (const k in byTick) if (byTick[k].length > ROOMS.study.capacity) studyOver++;
    return { rooms, acts, studyOver, total: rows.length };
  })()
`);
console.log(`        rooms: ${JSON.stringify(placement.rooms)}`);
console.log(`        activities: ${JSON.stringify(placement.acts)}`);

check('at-home work never resolves to a null location', !('null' in placement.rooms) && !(null in placement.rooms));
check('the study is used as a workspace', (placement.rooms.study || 0) > 0);
check('the study NEVER exceeds its capacity of 2 (D5 displaces the third worker)',
  placement.studyOver === 0, `${placement.studyOver} over-capacity ticks`);
// The overwhelming majority of work ticks must be at a workspace — but NOT
// all of them, and that is deliberate. The at-home shift is INTERRUPTIBLE
// (unlike the off-site one, which shouldInterruptCommitment exempts because a
// worker at the office cannot answer their needs from there). Someone working
// from the study who puts a wash on mid-afternoon and goes back to their desk
// is the feature, not a leak — an assertion that forbade it would be
// asserting that remote workers are furniture.
const workspaceTicks = (placement.rooms.study || 0)
  + Object.entries(placement.rooms).filter(([r]) => r.startsWith('bedroom')).reduce((a, [, n]) => a + n, 0);
const workspaceShare = workspaceTicks / placement.total;
check(`work ticks happen at a workspace ${(workspaceShare * 100).toFixed(1)}% of the time (study or own bedroom)`,
  workspaceShare > 0.85, JSON.stringify(placement.rooms));
// Whether a break is OBSERVED in any given week is luck — it needs a real
// need to cross mid-shift. What must be true is that the shift CAN be
// interrupted, which is the deliberate asymmetry with the off-site one:
// shouldInterruptCommitment exempts kind 'work' because a worker at the
// office cannot answer their needs from there, and must NOT exempt
// 'work_home' because someone in the study obviously can.
check('the at-home shift is interruptible and the off-site one is not', api(`
  (() => {
    const starving = { needs: { hunger: 5, hygiene: 5, energy: 5, social: 5, comfort: 5, stimulation: 5 } };
    const atOpen = { hunger: 90, hygiene: 90, energy: 90, social: 90, comfort: 90, stimulation: 90 };
    const offsite = shouldInterruptCommitment(starving, { kind: 'work', id: 'go_work', needsAtOpen: atOpen });
    const athome  = shouldInterruptCommitment(starving, { kind: 'work_home', id: 'work_from_home', needsAtOpen: atOpen });
    return offsite === null && !!athome;
  })()
`));
check('the activity is never the bare off-map string "at work"',
  !placement.acts['at work'], JSON.stringify(placement.acts));
check('at-home work draws several different activity strings',
  Object.keys(placement.acts).length >= 3);

// Every at-home activity must be nameable by the peek pipeline, or a whole
// new class of visible behaviour arrives invisible.
const unnamed = api(`
  (() => {
    const missing = [];
    for (const cat in HOME_WORK_ACTIVITIES) {
      for (const a of HOME_WORK_ACTIVITIES[cat]) if (!PEEK_VIEW_ACT[a]) missing.push(a);
    }
    for (const o of OCCUPATION_POOL) {
      for (const a of (o.workActivities || [])) if (!PEEK_VIEW_ACT[a]) missing.push(a);
    }
    return [...new Set(missing)];
  })()
`);
check('every at-home work activity has a PEEK_VIEW_ACT row',
  unnamed.length === 0, unnamed.join(', '));

// ---------------------------------------------------------------- 4
console.log('\n4. D14 — an at-home worker does not wear the office fit');

const outfits = api(`
  (() => {
    const out = {};
    for (const title of ['QA Tester', 'Backend Engineer']) {
      const gs = __house('p34-fit-' + title);
      const ids = __residents(gs);
      for (const id of ids) __forceOcc(gs, id, title);
      const rows = __week(gs, 7).filter(r => r.block === 'work');
      const t = {};
      for (const r of rows) t[r.outfit] = (t[r.outfit] || 0) + 1;
      out[title] = t;
    }
    return out;
  })()
`);
console.log(`        on_site  outfits during work: ${JSON.stringify(outfits['QA Tester'])}`);
console.log(`        remote   outfits during work: ${JSON.stringify(outfits['Backend Engineer'])}`);
// This is only meaningful if outfits are actually being derived — in a bare
// harness with no wardrobe items composeOutfit yields an empty type and the
// assertion would pass vacuously. Say so rather than banking a free PASS.
const outfitsDerived = Object.keys(outfits['QA Tester']).some(k => k !== '');
if (outfitsDerived) {
  check('a remote worker never wears the "work" outfit during their shift (D14)',
    !outfits['Backend Engineer'].work, JSON.stringify(outfits['Backend Engineer']));
} else {
  console.log('        (no wardrobe in this harness — outfit types are empty; the direct');
  console.log('         outfitTypeForContext assertion below is the real D14 check)');
}

check('outfitTypeForContext resolves at-home work blocks to daily', api(`
  (() => {
    const remote = { bible: { occupation: { workMode: 'remote' }, temperament: { conscientiousness: 1 } } };
    const onsite = { bible: { occupation: { workMode: 'on_site' }, temperament: { conscientiousness: 1 } } };
    const clock = { day: 3, minutes: 600 };
    return outfitTypeForContext(remote, 'work', null, clock, 'x') === 'daily'
        && outfitTypeForContext(onsite, 'work', null, clock, 'x') === 'work';
  })()
`));

// ---------------------------------------------------------------- 5
console.log('\n5. D13 — the interruption rate stays in band');

// Measured the honest way: the same flat, the same seeds, scored under the
// real predicate and under the legacy one. `scheduleMultiplier.work` is 0, so
// before this plan an at-home worker would have scored a flat zero however
// present they were; the question is whether the replacement multiplier keeps
// the total in a sane band rather than multiplying it.
const rates = api(`
  (() => {
    const measure = () => {
      let sum = 0, n = 0, eligible = 0, ticks = 0;
      for (const seedN of [1, 2, 3]) {
        const gs = __house('p34-intr-' + seedN);
        const ids = __residents(gs);
        gs.player.location = 'bedroom_player';
        const ticksPerDay = Math.floor(1440 / CLOCK.tickMinutes);
        for (let t = 0; t < 7 * ticksPerDay; t++) {
          gs.meta.clock = advanceClock(gs.meta.clock, 1);
          resolveTick(gs);
          ticks++;
          const el = getEligibleNpcs(gs);
          eligible += el.length;
          for (const [id] of el) { sum += getInterruptionProbability(gs, id); n++; }
        }
      }
      return { meanProb: n ? sum / n : 0, eligiblePerTick: eligible / ticks, expectedPerTick: sum / ticks };
    };
    const real = measure();
    const saved = npcIsOffsite;
    npcIsOffsite = (npc, block) => block === 'work' || block === 'commute' || block === 'commute_home';
    const legacy = measure();
    npcIsOffsite = saved;
    return { real, legacy };
  })()
`);
console.log(`        legacy: ${rates.legacy.eligiblePerTick.toFixed(2)} eligible/tick, expected ${rates.legacy.expectedPerTick.toFixed(4)} interruptions/tick`);
console.log(`        real:   ${rates.real.eligiblePerTick.toFixed(2)} eligible/tick, expected ${rates.real.expectedPerTick.toFixed(4)} interruptions/tick`);

const ratio = rates.real.expectedPerTick / (rates.legacy.expectedPerTick || 1);
check(`at-home workers DO become eligible (eligible/tick ${rates.legacy.eligiblePerTick.toFixed(2)} → ${rates.real.eligiblePerTick.toFixed(2)})`,
  rates.real.eligiblePerTick > rates.legacy.eligiblePerTick);
check(`the expected event rate stays in band (${ratio.toFixed(2)}x legacy, want < 1.6x)`,
  ratio < 1.6, `if this drifts, INTERRUPTION.workingFromHomeMultiplier is the dial`);
check('the rate did move — the multiplier is not silently zeroing at-home workers',
  ratio > 1.0);

check('a remote worker mid-shift is eligible but damped, not zeroed', api(`
  (() => {
    const gs = __house('p34-damp');
    const ids = __residents(gs);
    for (const id of ids) __forceOcc(gs, id, 'Backend Engineer');
    gs.player.location = 'bedroom_player';
    const ticksPerDay = Math.floor(1440 / CLOCK.tickMinutes);
    let anyPositive = false, anyEligible = false;
    for (let t = 0; t < 2 * ticksPerDay; t++) {
      gs.meta.clock = advanceClock(gs.meta.clock, 1);
      resolveTick(gs);
      for (const [id, npc] of getEligibleNpcs(gs)) {
        const blk = resolveScheduleActivity(npc, gs.meta.clock, gs, id).block;
        if (blk !== 'work') continue;
        anyEligible = true;
        if (getInterruptionProbability(gs, id) > 0) anyPositive = true;
      }
    }
    return anyEligible && anyPositive;
  })()
`));

// ---------------------------------------------------------------- 6
console.log('\n6. Phase 4 — unemployment, means, and a fuller day');

check('the workEndTick bail fires cleanly for a no-work template', api(`
  (() => {
    const gs = __house('p34-none');
    const id = __residents(gs)[0];
    __forceOcc(gs, id, 'Between Things');
    // openWorkCommitment must return null and must not throw.
    for (let t = 0; t < 48; t++) {
      gs.meta.clock = advanceClock(gs.meta.clock, 1);
      if (openWorkCommitment(gs, id) !== null) return false;
    }
    return true;
  })()
`));

const activity = api(`
  (() => {
    const out = {};
    for (const title of ['QA Tester', 'Between Things']) {
      let drives = 0, awake = 0;
      for (const seedN of [1, 2, 3]) {
        const gs = __house('p34-act-' + seedN);
        const ids = __residents(gs);
        for (const id of ids) __forceOcc(gs, id, title);
        const rows = __week(gs, 7);
        drives += rows.filter(r => r.cmt === 'drive' || r.cmt === 'action').length;
        awake += rows.filter(r => r.block !== 'sleep').length;
      }
      out[title] = { drives, awake, perAwakeTick: drives / (awake || 1) };
    }
    return out;
  })()
`);
console.log(`        on_site     : ${activity['QA Tester'].drives} drive-ticks over ${activity['QA Tester'].awake} awake ticks (${activity['QA Tester'].perAwakeTick.toFixed(3)})`);
console.log(`        unemployed  : ${activity['Between Things'].drives} drive-ticks over ${activity['Between Things'].awake} awake ticks (${activity['Between Things'].perAwakeTick.toFixed(3)})`);
// The plan predicted an unemployed NPC would out-act an employed one, and
// MEASUREMENT SAYS OTHERWISE — recorded here rather than asserted away.
//
// Cause, measured directly (dev/verify scratch, see the plan's Handoff): on
// an idle midday tick the unemployed NPC has ~7.5 live candidates and the
// best of them scores ~0.356 against COGNITION.actionThreshold of 0.40. It
// is NOT cooldown exhaustion and NOT an empty candidate list — 124 of 135
// idle ticks are "options exist, none appeals". Someone with all day free
// gets every need met early, and the drive table has almost nothing that
// appeals WITHOUT a need behind it, so the back half of their day is empty.
//
// The fix is neither in this plan nor in actionThreshold — COGNITION's own
// header says 0.40 is load-bearing, and lowering it would make the whole
// cast twitchier, not just this one NPC. It wants low-stakes idle drives
// (read a book, put the TV on, scroll a phone), which is Phase 7's territory.
//
// So what IS asserted is what Phase 4 actually delivers: an unemployed NPC is
// PRESENT, all day, every day — which is the half the player can see.
check(`unemployed NPCs are active during hours employed ones are absent (${activity['Between Things'].drives} vs ${activity['QA Tester'].drives} drive-ticks)`,
  activity['Between Things'].drives > 0);
console.log('        NOTE  the plan expected unemployed > employed here; measured it is LOWER.');
console.log('              ~7.5 candidates/idle tick, best score ~0.356 vs threshold 0.40 -');
console.log('              nothing appeals once every need is met. Phase 7 (idle pastime');
console.log('              drives) landed; that hypothesis is asserted in verify-voc-p7.js.');

// D20 — the persona line must distinguish means from broke.
const clauses = api(`
  (() => ({
    wage:  occupationLivingClause({ incomeSource: 'wage', incomeBand: 'mid' }),
    self:  occupationLivingClause({ incomeSource: 'self', incomeBand: 'mid' }),
    meansHigh: occupationLivingClause({ incomeSource: 'means', incomeBand: 'high' }),
    meansMid:  occupationLivingClause({ incomeSource: 'means', incomeBand: 'mid' }),
    none:  occupationLivingClause({ incomeSource: 'none', incomeBand: 'low' }),
  }))()
`);
check('a waged NPC adds nothing to the prompt (the unmarked case)', clauses.wage === '');
check('self-employed is marked', clauses.self.length > 0);
check('means and none produce DIFFERENT lines (D20 — the whole point)',
  clauses.meansHigh !== clauses.none && clauses.meansHigh.length > 0 && clauses.none.length > 0,
  `means: "${clauses.meansHigh}" / none: "${clauses.none}"`);
check('high-means and mid-means differ (rent-is-not-a-worry vs will-not-last)',
  clauses.meansHigh !== clauses.meansMid);
check('the persona block actually carries the clause', api(`
  (() => {
    const gs = __house('p34-persona');
    const id = __residents(gs)[0];
    __forceOcc(gs, id, 'Family Money');
    const block = buildNpcBlockV2(gs.npcs[id], 'hello', 'scene', gs.meta.clock.day, gs);
    return block.includes('[Occupation]') && block.includes('rent is not a worry');
  })()
`));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
