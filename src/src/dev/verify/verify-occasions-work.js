// Occasions & Holidays plan (occasions-and-holidays-plan.md) — Phase 2: the
// holiday work model (R4, D10–D16).
//
//   node src/src/dev/verify/verify-occasions-work.js
//
// R4 is the user's own design: whether a roommate works a holiday depends on
// whether the job closes, whether it pays a premium, their money and work
// ethic, and how festive they are — including the person who LOVES holiday
// shifts for the pay. This harness covers: registration and the one-picker
// rule (plan invariant 3 — every schedule day-type pick goes through
// scheduleDayTypeFor); the D11 policy for every occupation; D10's gating;
// the D12 decision table on crafted people (the "travel RT" who always
// works it, the festive high earner who asks off, the on-call tradesperson,
// the self-employed on a busy day); determinism by year; the schedule
// effect through the REAL resolveScheduleActivity / workBlockEndAbs /
// isGigDay; the rollover's who's-working line and D15 mood; the prompt
// reason; and a population measurement across generated houses.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.computer.js', 'sim.js', 'cognition.js', 'effects.js', 'items.js', 'inventory.js',
    'drives.js', 'computer.js', 'npc.js', 'llm.js', 'birthdays.js', 'occasions.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const SRC = path.join(__dirname, '..', '..', 'srcfiles');

api(`
  __mk = (seed, n, day) => {
    const warn = console.warn; console.warn = () => {};
    const h = SIM_generateHouse(seed || 20260922, n || 3);
    console.warn = warn;
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 1, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort()
      .forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __d = (si, dom, year) => ((year || 1) - 1) * 140 + si * 35 + dom;
  // A person with a given job and disposition. genSeed varies the seeded
  // roster/swap/callout draws; everything else is pinned.
  __person = (title, opts) => {
    const o = opts || {};
    const occ = OCCUPATION_POOL.find(x => x.title === title);
    return { id: 'p_' + title, residency: { status: 'resident' }, mood: 0, bible: {
      name: o.name || title, genSeed: o.seed == null ? 1 : o.seed, festivity: o.festivity == null ? 0.5 : o.festivity,
      occupation: { ...occ, ...(o.occupation || {}) }, scheduleTemplate: occ.scheduleTemplate,
      temperament: { warmth: 0, openness: 0, conscientiousness: o.conscientiousness == null ? 0 : o.conscientiousness },
      personality: { traits: o.traits || [] }, values: o.values || [],
    } };
  };
  __plans = (title, opts, day, seeds) => {
    const out = [];
    for (let s = 1; s <= (seeds || 60); s++) out.push(holidayWorkPlan(__person(title, { ...opts, seed: s * 7919 }), day));
    return out;
  };
  __tally = (plans) => plans.reduce((m, p) => { const k = p ? p.reason : 'null'; m[k] = (m[k] || 0) + 1; return m; }, {});
  // The weekday majors and partials (the weekend ones never move a shift).
  __MIDWINTER = __d(3, 25); __THANKS = __d(2, 26); __MIDSUMMER = __d(1, 18); __REST = __d(1, 2); __MW_EVE = __d(3, 24);
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration and the one-picker rule (plan invariant 3)');
const reg = J(`({ tuning: !!(OCCASION_TUNING.work && OCCASION_TUNING.work.categoryPolicy), picker: typeof scheduleDayTypeFor === 'function', plan: typeof holidayWorkPlan === 'function' })`);
check('OCCASION_TUNING.work exists and scheduleDayTypeFor / holidayWorkPlan are defined', reg.tuning && reg.picker && reg.plan);
const simSrc = fs.readFileSync(path.join(SRC, 'sim.js'), 'utf8');
const cogSrc = fs.readFileSync(path.join(SRC, 'cognition.js'), 'utf8');
const oldPick = /isWeekend\(clock\.day\) \? 'weekend' : 'weekday'/g;
check("no schedule site picks its day type with a bare isWeekend any more (sim.js + cognition.js)", !(simSrc.match(oldPick) || []).length && !(cogSrc.match(oldPick) || []).length);
check('the three schedule readers and isGigDay all call scheduleDayTypeFor',
  (simSrc.match(/const dayType = scheduleDayTypeFor\(npc, clock\.day\)/g) || []).length === 1
  && (cogSrc.match(/const dayType = scheduleDayTypeFor\(npc, clock\.day\)/g) || []).length === 2
  && /function isGigDay[\s\S]{0,200}scheduleDayTypeFor\(npc/.test(simSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. D11 — every occupation has a holiday policy');
const pol = J(`Object.fromEntries(OCCUPATION_POOL.map(o => [o.title, holidayPolicyFor(o)]))`);
const valid = new Set(['closed', 'staffed', 'open', 'oncall', 'self', 'none']);
check(`all ${Object.keys(pol).length} occupations map to a real policy`, Object.values(pol).every(p => valid.has(p)), JSON.stringify(pol));
const EXPECT = {
  Nurse: 'staffed', Paramedic: 'staffed', 'Night Security': 'staffed', 'Hotel Concierge': 'staffed', Journalist: 'staffed', 'Customer Support Rep': 'staffed',
  Therapist: 'closed', 'Telehealth Counsellor': 'closed', Teacher: 'closed', 'Software Developer': 'closed', Accountant: 'closed', 'Personal Trainer': 'closed',
  Barista: 'open', 'Line Cook': 'open', Bartender: 'open', 'Retail Manager': 'open', 'Exotic Dancer': 'open',
  Electrician: 'oncall', Plumber: 'oncall', Carpenter: 'oncall',
  Musician: 'self', Photographer: 'self', 'Freelance Illustrator': 'self', 'Small Business Owner': 'self',
  'Family Money': 'none', 'Between Things': 'none',
};
const polBad = Object.entries(EXPECT).filter(([t, p]) => pol[t] !== p).map(([t, p]) => `${t}: want ${p}, got ${pol[t]}`);
check('the plan\'s spot list: nurses/security/news staffed, therapists & offices closed, cafés & bars open, trades on call, freelancers self, non-workers none', polBad.length === 0, polBad.join(' | '));
check("an occupation row's own holidayPolicy wins over everything", J(`holidayPolicyFor({ ...OCCUPATION_POOL.find(o => o.title === 'Teacher'), holidayPolicy: 'staffed' })`) === 'staffed');

// ---------------------------------------------------------------- 2
console.log('\n2. D10 — only a working weekday on a major/partial holiday can change');
const gate = J(`({
  ordinary: holidayWorkPlan(__person('Nurse'), __d(3, 20)),
  valentines: holidayWorkPlan(__person('Nurse'), __d(0, 14)),
  springFestivalSunday: holidayWorkPlan(__person('Nurse'), __d(0, 29)),
  nyeSaturday: holidayWorkPlan(__person('Bartender'), 140),
  familyMoney: holidayWorkPlan(__person('Family Money'), __MIDWINTER),
  midwinter: !!holidayWorkPlan(__person('Teacher'), __MIDWINTER),
  eve: holidayWorkPlan(__person('Teacher'), __MW_EVE),
  weekdayMajors: [__REST, __MIDSUMMER, __THANKS, __MIDWINTER].map(d => !!holidayWorkPlan(__person('Teacher'), d)),
})`);
check('nothing on an ordinary day, a no-closure holiday (Valentine\'s), or a weekend major/partial (Spring Festival Sun, New Year\'s Eve Sat)', gate.ordinary === null && gate.valentines === null && gate.springFestivalSunday === null && gate.nyeSaturday === null, JSON.stringify(gate));
check('nothing for someone with no job to take off (Family Money)', gate.familyMoney === null);
check('every weekday major — Rest Day, Midsummer, Thanksgiving, Midwinter — is in play', gate.weekdayMajors.every(Boolean), JSON.stringify(gate.weekdayMajors));
check('Midwinter Eve (partial) closes the offices too', gate.eve && gate.eve.works === false && gate.eve.reason === 'closed', JSON.stringify(gate.eve));

// ---------------------------------------------------------------- 3
console.log('\n3. D12 — the decision, on the people it was designed around');
const dec = J(`({
  teacher: __tally(__plans('Teacher', {}, __MIDWINTER)),
  baristaMidwinter: __tally(__plans('Barista', {}, __MIDWINTER)),
  baristaMidsummer: __tally(__plans('Barista', { festivity: 0.5 }, __MIDSUMMER)),
  // The user's sister: loves holiday shifts for the pay.
  travelRT: __tally(__plans('Nurse', { festivity: 0.15, traits: ['materialistic', 'ambitious'], conscientiousness: 0.4 }, __MIDWINTER)),
  // A festive nurse who doesn't need the money and isn't driven.
  festiveNurse: __tally(__plans('Nurse', { festivity: 0.95, occupation: { incomeBand: 'high' }, traits: ['lazy'], conscientiousness: -0.4 }, __MIDWINTER)),
  // An ordinary nurse: festivity and pulls roughly balanced.
  middleNurse: __tally(__plans('Nurse', { festivity: 0.55 }, __MIDWINTER)),
  electricianGreedy: __tally(__plans('Electrician', { festivity: 0.1, traits: ['materialistic'], occupation: { incomeBand: 'low' } }, __THANKS, 400)),
  electricianFestive: __tally(__plans('Electrician', { festivity: 0.95 }, __THANKS, 60)),
  musicianBusy: __tally(__plans('Musician', { festivity: 0.2, occupation: { incomeBand: 'low' }, traits: ['ambitious'] }, __MIDSUMMER)),
  musicianFestive: __tally(__plans('Musician', { festivity: 0.95 }, __MIDSUMMER)),
  calloutChance: OCCASION_TUNING.work.calloutChance,
})`);
check('a teacher always has Midwinter off — school is closed', JSON.stringify(dec.teacher) === '{"closed":60}', JSON.stringify(dec.teacher));
check('the café shuts on Midwinter (one of the biggest days)…', JSON.stringify(dec.baristaMidwinter) === '{"closed":60}', JSON.stringify(dec.baristaMidwinter));
check('…but opens on Midsummer, where some baristas are rostered and some not', (dec.baristaMidsummer.rostered || 0) > 0 && ((dec.baristaMidsummer.not_rostered || 0) + (dec.baristaMidsummer.volunteered || 0)) > 0, JSON.stringify(dec.baristaMidsummer));
check('the "travel RT" — low festivity, money-driven — works Midwinter every time: rostered or VOLUNTEERED for the premium', !Object.keys(dec.travelRT).some(k => !['rostered', 'volunteered'].includes(k)) && (dec.travelRT.volunteered || 0) > 0, JSON.stringify(dec.travelRT));
check('the festive, comfortable nurse never volunteers; rostered, they ask off (and sometimes get stuck with it)', !dec.festiveNurse.volunteered && !dec.festiveNurse.rostered && (dec.festiveNurse.asked_off || 0) > 0 && (dec.festiveNurse.swap_failed || 0) > 0 && (dec.festiveNurse.not_rostered || 0) > 0, JSON.stringify(dec.festiveNurse));
check('an ordinary nurse is mostly decided by the roster (both outcomes occur)', (dec.middleNurse.rostered || 0) > 0 && (dec.middleNurse.not_rostered || 0) > 0, JSON.stringify(dec.middleNurse));
const cr = (dec.electricianGreedy.called_out || 0) / 400;
check(`a money-hungry electrician takes the emergency call-out at about the call-out rate (${cr.toFixed(2)} vs ${dec.calloutChance})`, Math.abs(cr - dec.calloutChance) < 0.07 && Object.keys(dec.electricianGreedy).every(k => ['called_out', 'closed'].includes(k)), JSON.stringify(dec.electricianGreedy));
check('a festive electrician lets the phone ring — never called out', JSON.stringify(dec.electricianFestive) === '{"closed":60}', JSON.stringify(dec.electricianFestive));
check('a hungry musician works Midsummer (a busy night for music); a festive one takes it off', JSON.stringify(dec.musicianBusy) === '{"self_working":60}' && JSON.stringify(dec.musicianFestive) === '{"self_off":60}', JSON.stringify([dec.musicianBusy, dec.musicianFestive]));

// ---------------------------------------------------------------- 4
console.log('\n4. R6 — deterministic, and re-drawn each year');
const det = J(`(() => {
  const p = __person('Nurse', { festivity: 0.55, seed: 4242 });
  const a = JSON.stringify(holidayWorkPlan(p, __MIDWINTER));
  const b = JSON.stringify(holidayWorkPlan(JSON.parse(JSON.stringify(p)), __MIDWINTER));
  const years = [];
  for (let y = 1; y <= 12; y++) years.push(holidayWorkPlan(p, __d(3, 25, y)).reason);
  return { same: a === b, years, distinct: new Set(years).size };
})()`);
check('the same person on the same holiday gets the same answer (a reload changes nothing)', det.same);
check('…and the roster is redrawn each year (a 12-year run sees more than one outcome)', det.distinct > 1, JSON.stringify(det.years));

// ---------------------------------------------------------------- 5
console.log('\n5. D14 — the schedule follows, through the real readers');
const sch = J(`(() => {
  const g = __mk(11, 2, __MIDWINTER); const [a, b] = __ids(g);
  g.npcs[a] = { ...g.npcs[a], bible: { ...__person('Teacher').bible, name: 'Mira' } };
  g.npcs[b] = { ...g.npcs[b], bible: { ...__person('Nurse', { festivity: 0.15, traits: ['materialistic', 'ambitious'], conscientiousness: 0.4, seed: 7919 }).bible, name: 'Jonah' } };
  const block = (id, day, minutes) => resolveScheduleActivity(g.npcs[id], { day, minutes }, id, g).block;
  const nursePlan = holidayWorkPlan(g.npcs[b], __MIDWINTER);
  const nurseShiftMinute = SCHEDULES[g.npcs[b].bible.scheduleTemplate].weekday.work[0][0] + 30;
  const selfOff = __person('Musician', { festivity: 0.95 });
  return {
    types: { ordinary: scheduleDayTypeFor(g.npcs[a], __d(3, 20)), weekend: scheduleDayTypeFor(g.npcs[a], __d(3, 21)), teacherHoliday: scheduleDayTypeFor(g.npcs[a], __MIDWINTER), nurseHoliday: scheduleDayTypeFor(g.npcs[b], __MIDWINTER), noNpc: scheduleDayTypeFor(null, __MIDWINTER) },
    teacherNoon: { dayBefore: block(a, __d(3, 23), 720), holiday: block(a, __MIDWINTER, 720) },
    nursePlan, nurseAtShift: block(b, __MIDWINTER, nurseShiftMinute),
    workEnd: { teacherHoliday: workBlockEndAbs(g.npcs[a], { day: __MIDWINTER, minutes: 600 }), teacherOrdinary: workBlockEndAbs(g.npcs[a], { day: __d(3, 23), minutes: 600 }) },
    gig: { selfOffHoliday: isGigDay(selfOff, { day: __MIDSUMMER }, 'x') },
  };
})()`);
check('day types: ordinary weekday → weekday; Saturday → weekend; a holiday off → weekend; a holiday worked → weekday; no npc → the old calendar-only pick', sch.types.ordinary === 'weekday' && sch.types.weekend === 'weekend' && sch.types.teacherHoliday === 'weekend' && sch.types.nurseHoliday === 'weekday' && sch.types.noNpc === 'weekday', JSON.stringify(sch.types));
check("the teacher is at work at noon the day before Midwinter, and home on Midwinter itself", sch.teacherNoon.dayBefore === 'work' && sch.teacherNoon.holiday !== 'work', JSON.stringify(sch.teacherNoon));
check('the money-driven nurse really is at work on Midwinter, mid-shift', sch.nursePlan && sch.nursePlan.works && sch.nurseAtShift === 'work', JSON.stringify({ plan: sch.nursePlan, block: sch.nurseAtShift }));
check('workBlockEndAbs: no work block to end on a holiday off; a real one the day before', sch.workEnd.teacherHoliday === null && typeof sch.workEnd.teacherOrdinary === 'number', JSON.stringify(sch.workEnd));
check('a self-employed person who takes the holiday off gets no gig day either', sch.gig.selfOffHoliday === false);

// ---------------------------------------------------------------- 6
console.log('\n6. D13/D15 — the morning line, the mood, and the prompt reason');
const roll = J(`(() => {
  const g = __mk(12, 2, __MIDWINTER); const [a, b] = __ids(g);
  g.npcs[a] = { ...g.npcs[a], mood: 0, bible: { ...__person('Teacher', { festivity: 0.9 }).bible, name: 'Mira' } };
  g.npcs[b] = { ...g.npcs[b], mood: 0, bible: { ...__person('Nurse', { festivity: 0.15, traits: ['materialistic', 'ambitious'], conscientiousness: 0.4, seed: 7919 }).bible, name: 'Jonah' } };
  const jonahPlan = holidayWorkPlan(g.npcs[b], __MIDWINTER);
  const out = processOccasionsForDay(g, __MIDWINTER);
  const moods = { mira: g.npcs[a].mood, jonah: g.npcs[b].mood };
  const prompt = { mira: occasionPromptLine(g, a), jonah: occasionPromptLine(g, b) };
  const gV = __mk(12, 2, __d(0, 14));
  const val = processOccasionsForDay(gV, __d(0, 14)).lines;
  const gSun = __mk(12, 2, __d(0, 29));
  const sun = processOccasionsForDay(gSun, __d(0, 29)).lines;
  return { lines: out.lines, moods, prompt, jonahPlan, val, sun, M: OCCASION_TUNING.work.mood, miraAff: npcOccasionAffinity(g.npcs[a], 'midwinter') };
})()`);
const workLine = roll.lines.find(l => l.startsWith('🗓️')) || '';
check("Midwinter's morning names who's working and why, workers first", /Jonah (picked up the holiday shift for the premium pay|is working it — on the holiday roster)/.test(workLine) && /Mira has the day off — work is closed/.test(workLine) && workLine.indexOf('Jonah') < workLine.indexOf('Mira'), workLine);
check('…after the Midwinter line itself', roll.lines[0].startsWith('🎁') && roll.lines.indexOf(workLine) === 1, JSON.stringify(roll.lines));
const expectJonah = roll.jonahPlan.reason === 'volunteered' ? roll.M.volunteered : 0;
check('mood: the festive teacher home for Midwinter lifts; the nurse who chose the shift is content (or neutral if merely rostered)', Math.abs(roll.moods.mira - roll.M.offFestive * roll.miraAff) < 1e-9 && Math.abs(roll.moods.jonah - expectJonah) < 1e-9, JSON.stringify({ moods: roll.moods, plan: roll.jonahPlan }));
check('the [Occasion] line carries the reason, for both', /Mira has the day off — work is closed\.$/.test(roll.prompt.mira || '') && /Jonah (picked up the holiday shift|is working it)/.test(roll.prompt.jonah || ''), JSON.stringify(roll.prompt));
check("no who's-working line on Valentine's (no closure) or on a Sunday major (Spring Festival)", !roll.val.some(l => l.startsWith('🗓️')) && !roll.sun.some(l => l.startsWith('🗓️')), JSON.stringify([roll.val, roll.sun]));

// ---------------------------------------------------------------- 7
console.log('\n7. The population — who is home on the big weekday holidays');
const pop = J(`(() => {
  const res = {};
  for (const [label, day] of [['Rest Day', __REST], ['Midsummer', __MIDSUMMER], ['Thanksgiving', __THANKS], ['Midwinter', __MIDWINTER]]) {
    let employed = 0, working = 0, volunteered = 0, byPolicy = {};
    for (let s = 1; s <= 40; s++) {
      const g = __mk(20261000 + s, 4, day);
      for (const id of __ids(g)) {
        const p = holidayWorkPlan(g.npcs[id], day);
        if (!p) continue;
        employed++;
        if (p.works) working++;
        if (p.reason === 'volunteered') volunteered++;
        byPolicy[p.policy] = byPolicy[p.policy] || { n: 0, w: 0 };
        byPolicy[p.policy].n++; if (p.works) byPolicy[p.policy].w++;
      }
    }
    res[label] = { employed, working, share: working / Math.max(1, employed), volunteered, byPolicy };
  }
  return res;
})()`);
for (const [label, r] of Object.entries(pop)) {
  const pp = Object.entries(r.byPolicy).map(([k, v]) => `${k} ${v.w}/${v.n}`).join(', ');
  console.log(`        ${label.padEnd(12)} ${r.working}/${r.employed} working (${(r.share * 100).toFixed(0)}%), ${r.volunteered} volunteered — ${pp}`);
}
check('on every weekday major, most of the house is home — but not all of it', Object.values(pop).every(r => r.employed > 50 && r.share > 0.05 && r.share < 0.5), JSON.stringify(Object.fromEntries(Object.entries(pop).map(([k, r]) => [k, r.share.toFixed(2)]))));
check('closed-policy jobs are always off; staffed jobs carry most of the holiday work', Object.values(pop).every(r => (!r.byPolicy.closed || r.byPolicy.closed.w === 0) && (!r.byPolicy.staffed || r.byPolicy.staffed.w / r.byPolicy.staffed.n > 0.3)), JSON.stringify(Object.fromEntries(Object.entries(pop).map(([k, r]) => [k, r.byPolicy]))));
check('somebody somewhere volunteers for the premium (the R4 case exists in real casts)', Object.values(pop).some(r => r.volunteered > 0));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
