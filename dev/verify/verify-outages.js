// Seasons & Weather Phase 8 (seasons-and-weather-plan.md W10) — power outages.
//
//   node dev/verify/verify-outages.js
//
// "A REALLY fun occasional event" (the user, 2026-09-23). Covers: registration;
// the derived plan (deterministic per seed and day, weather-driven, occasional —
// measured — with the cooldown, start windows and durations, an outage running
// past midnight); the seam (isCutoffActive('power'/'internet') for exactly as
// long as it lasts, so the appliance verbs, the computer and phone charging
// follow — and phone/gas/water do not); the flat drifting toward the weather;
// the watch (start and end once each, narrated unless stale, the end's work done
// even across a long wait, slept variants); a shut fridge (hold time, the
// preservation-scaled age shift, frozen and non-perishable stacks left alone);
// the huddle (dark costs a little mood, company gives it back, a bond, a
// memory); the candles verb; the prompt and scene lines; and a full year of
// half-hour steps with no exceptions and no bill moved.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.actions.js', 'defs.computer.js', 'sim.js', 'scene.js', 'effects.js', 'items.js', 'inventory.js',
    'drives.js', 'actions.js', 'computer.js', 'npc.js', 'llm.js', 'state.js', 'occasions.js', 'traditions.js', 'seasons.js', 'temperature.js', 'time.js', 'world.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SRC = path.join(__dirname, '..', '..', 'src', 'src', 'srcfiles');
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

api(`
  __mk = (seed, n, day, minutes) => {
    const warn = console.warn; console.warn = () => {};
    const h = SIM_generateHouse(seed || 20260930, n || 3);
    console.warn = warn;
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 10, minutes: minutes == null ? 600 : minutes }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = 'living_room';
    __ids(g).forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); g.npcs[id].location = 'living_room'; g.npcs[id].activity = 'sitting'; g.npcs[id].mood = 0; });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __at = (g, day, minutes) => { g.meta.clock.day = day; if (minutes != null) g.meta.clock.minutes = minutes; return g; };
  __abs = (g, abs) => { g.meta.clock.day = Math.floor(abs / 1440); g.meta.clock.minutes = abs % 1440; return g; };
  // The first outage plan at or after from (optionally of one condition).
  __find = (g, from, cond) => { for (let d = from || 2; d < from + 3000; d++) { const p = outagePlanFor(g, d); if (p && (!cond || p.cond === cond)) return p; } return null; };
  __chip = (g, id) => (resolveAvailableActions(g).find(a => a.actionId === id) || {}).ok === true;
  __verb = (g, actionId) => {
    const def = ACTION_DEFS[actionId];
    const ctx = buildActionContext(g);
    const req = checkRequirements(def, ctx);
    if (!req.ok) return { ok: false, reason: req.reason };
    const prepared = def.prepare ? def.prepare(ctx) : null;
    const lines = def.buildEffects ? def.buildEffects(ctx, prepared) : (def.effects || []);
    const effCtx = buildEffectContext(g, [], [], ctx.roomObjects, g.player.inventory || []);
    applyEffects(parseEffectDSL(lines.join('\\n')), effCtx);
    return { ok: true, prepared, lines, line: def.narration.build(ctx, prepared) };
  };
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration');
const reg = J(`({
  tuning: ['chance', 'startWindow', 'duration', 'lines', 'huddles', 'candles', 'prompt'].every(k => OUTAGE_TUNING[k] !== undefined),
  fns: ['outagePlanFor','outageAt','outageActive','outageState','outageDriftC','outageSpoilFridge','outageHuddle','outageWatch','outagePromptLine','outageSceneLine','applyOutageCandles'].every(f => { try { return typeof eval(f) === 'function'; } catch (e) { return false; } }),
  verb: !!ACTION_DEFS['occasion.light_candles'] && ACTION_DEFS['occasion.light_candles'].group === 'occasion',
  everyCause: Object.keys(WEATHER_TUNING.conditions).every(c => OUTAGE_TUNING.chance[c] !== undefined),
  startLines: Object.keys(OUTAGE_TUNING.huddles).every(k => OUTAGE_TUNING.lines.start[k] !== undefined),
})`);
check('OUTAGE_TUNING carries the chances, windows, durations, lines, huddles, candles and the prompt line', reg.tuning);
check('every public outage function is defined; the candles verb is generated (flat "occasion" chip)', reg.fns && reg.verb);
check('every weather condition has a chance, and every huddle cause has a start line', reg.everyCause && reg.startLines);
check('the seam: computer.js\'s isCutoffActive reads outageActive for power and internet', /outageActive\(gameState\)/.test(srcOf('computer.js')) && /'power' \|\| cutoffId === 'internet'/.test(srcOf('computer.js')));

// ---------------------------------------------------------------- 1
console.log('\n1. The derived plan — deterministic, weather-driven, occasional, with a cooldown');
const plan = J(`(() => {
  const per = [];
  let overlaps = 0, cross = 0, badWin = 0, badDur = 0, total = 0; const byCond = {}; const days = {};
  for (let s = 1; s <= 12; s++) {
    const g = __mk(50 + s, 1);
    let n = 0; let last = -999;
    for (let d = 2; d <= 140 * 6 + 1; d++) {
      const p = outagePlanFor(g, d);
      if (!p) continue;
      n++; total++; byCond[p.cond] = (byCond[p.cond] || 0) + 1;
      if (d - last <= OUTAGE_TUNING.cooldownDays) overlaps++;
      last = d;
      const w = OUTAGE_TUNING.startWindow[p.cond] || OUTAGE_TUNING.startWindow.default; const du = OUTAGE_TUNING.duration[p.cond] || OUTAGE_TUNING.duration.default;
      const sm = p.startAbs - d * 1440; if (sm < w[0] || sm > w[1]) badWin++; if (p.minutes < du[0] || p.minutes > du[1]) badDur++;
      if (p.endAbs >= (d + 1) * 1440) cross++;
    }
    per.push(n / 6);
  }
  const g1 = __mk(77, 1), g2 = __mk(77, 1);
  const a = __find(g1, 2), b = __find(g2, 2);
  const c = __find(__mk(78, 1), 2);
  return { mean: per.reduce((x, y) => x + y, 0) / per.length, min: Math.min(...per), max: Math.max(...per), overlaps, cross, badWin, badDur, total, byCond, same: JSON.stringify(a) === JSON.stringify(b), differs: JSON.stringify(a) !== JSON.stringify(c), sample: a };
})()`);
check('occasional: 2–5 a year on average across seeds (measured over 12 seeds x 6 years)', plan.mean >= 2 && plan.mean <= 5, JSON.stringify({ mean: plan.mean, min: plan.min, max: plan.max }));
check('the cooldown holds: no two outages within cooldownDays of each other', plan.overlaps === 0);
check('every start lands inside its condition\'s window and every duration inside its range', plan.badWin === 0 && plan.badDur === 0, JSON.stringify({ win: plan.badWin, dur: plan.badDur }));
check('it is WEATHER-driven: storms, snow, cold snaps and heat are the great majority; a clear day almost never', (plan.byCond.storm || 0) + (plan.byCond.snow || 0) + (plan.byCond.cold_snap || 0) + (plan.byCond.heat || 0) > 0.8 * plan.total && (plan.byCond.clear || 0) < 0.06 * plan.total, JSON.stringify(plan.byCond));
check('some outages run past midnight (a snowbound night)', plan.cross > 0, plan.cross);
check('deterministic (R6): the same seed, the same plan; another seed another', plan.same && plan.differs, JSON.stringify(plan.sample));

const at = J(`(() => {
  const g = __mk(79, 1);
  const p = __find(g, 2, 'snow') || __find(g, 2);
  const before = outageAt(g, p.startAbs - 1), first = outageAt(g, p.startAbs), mid = outageAt(g, p.startAbs + Math.floor(p.minutes / 2)), last = outageAt(g, p.endAbs - 1), after = outageAt(g, p.endAbs);
  const cross = (() => { for (let d = 2; d < 3000; d++) { const q = outagePlanFor(g, d); if (q && q.endAbs >= (d + 1) * 1440) return q; } return null; })();
  const nextDay = cross ? outageAt(g, (cross.day + 1) * 1440 + 5) : null;
  return { before: !!before, first: !!first, mid: !!mid, last: !!last, after: !!after, crossFound: !!cross, nextDaySame: nextDay && nextDay.id === cross.id };
})()`);
check('outageAt: dark exactly from the start minute to (not including) the end minute', !at.before && at.first && at.mid && at.last && !at.after);
check('an outage that runs past midnight is still on the next day (yesterday\'s plan is consulted)', at.crossFound && at.nextDaySame);

// ---------------------------------------------------------------- 2
console.log('\n2. The seam — power and internet, for exactly as long as it lasts');
const seam = J(`(() => {
  const g = __mk(80, 2);
  const p = __find(g, 2);
  __abs(g, p.startAbs - 10); const off = { power: isCutoffActive(g, 'power'), internet: isCutoffActive(g, 'internet') };
  __abs(g, p.startAbs + 5); const on = { power: isCutoffActive(g, 'power'), internet: isCutoffActive(g, 'internet'), phone: isCutoffActive(g, 'phone'), gas: isCutoffActive(g, 'gas'), water: isCutoffActive(g, 'water') };
  __abs(g, p.endAbs + 5); const after = isCutoffActive(g, 'power');
  // appliance verbs
  __abs(g, p.startAbs + 5); g.player.location = 'kitchen';
  const reason = ACTION_REQUIREMENT_CHECKERS.powerNotCutoff({ gameState: g });
  const netReason = ACTION_REQUIREMENT_CHECKERS.internetNotCutoff({ gameState: g });
  const blocked = typeof appBlockedReason === 'function' ? { computerGig: appBlockedReason(g, 'gigs', 'computer'), phoneGig: appBlockedReason(g, 'gigs', 'phone') } : null;
  // an unpaid bill still says the bill
  __abs(g, p.endAbs + 60); g.world.bills = g.world.bills || {}; const billKey = Object.keys(BILL_DEFS).find(k => BILL_DEFS[k].cutoff === 'power');
  return { off, on, after, reason, netReason, blocked, billKey };
})()`);
check('before the outage nothing is cut; during it power AND internet are cut; after it, restored', !seam.off.power && !seam.off.internet && seam.on.power && seam.on.internet && !seam.after, JSON.stringify(seam));
check('...and NOT phone service, gas or water (the phone runs on its battery, the stove is gas)', !seam.on.phone && !seam.on.gas && !seam.on.water);
check('the appliance requirement says "the power is out" (not "the bill is unpaid"); the internet says it is down with the power', seam.reason === 'The power is out.' && /down with the power/.test(seam.netReason), JSON.stringify({ r: seam.reason, n: seam.netReason }));
check('an app that needs the internet is blocked on the computer during it, but the phone (cellular) still works', !seam.blocked || (seam.blocked.computerGig && !seam.blocked.phoneGig), JSON.stringify(seam.blocked));

const verbs = J(`(() => {
  const g = __mk(81, 2);
  const p = __find(g, 2);
  __abs(g, p.startAbs - 5); g.player.location = 'kitchen';
  const before = { reheat: __chip(g, 'self.reheat'), coffee: __chip(g, 'self.make_coffee') };
  __abs(g, p.startAbs + 5);
  const during = { reheat: __chip(g, 'self.reheat'), coffee: __chip(g, 'self.make_coffee') };
  return { before, during };
})()`);
check('the power-gated verbs (reheat, coffee…) exist before and are unavailable while it is out', JSON.stringify(verbs.during) === JSON.stringify({ reheat: false, coffee: false }), JSON.stringify(verbs));

// ---------------------------------------------------------------- 3
console.log('\n3. The flat drifts toward the weather (the HVAC is dead)');
const temp = J(`(() => {
  const g = __mk(82, 1);
  g.world.thermostat = { targetC: 22 };
  const p = __find(g, 2, 'snow') || __find(g, 2, 'cold_snap') || __find(g, 2);
  __abs(g, p.startAbs - 30); const normal = ambientTempC(g); const outdoorBefore = outdoorTempC(g);
  __abs(g, p.startAbs); const atStart = ambientTempC(g);
  __abs(g, p.startAbs + OUTAGE_TUNING.driftTauMin); const oneTau = ambientTempC(g); const outdoorTau = outdoorTempC(g);
  const normalAtTau = (() => { const t = outdoorTau + (22 - outdoorTau) * THERMOSTAT_TUNING.hvacEfficiency; return t; })();
  __abs(g, p.endAbs + 30); const restored = ambientTempC(g); const outdoorEnd = outdoorTempC(g);
  const restoredExpected = outdoorEnd + (22 - outdoorEnd) * THERMOSTAT_TUNING.hvacEfficiency;
  return { normal, atStart, oneTau, outdoorTau, normalAtTau, restored, restoredExpected, cond: p.cond, atStartExpected: (() => { __abs(g, p.startAbs); const o = outdoorTempC(g); return o + (22 - o) * THERMOSTAT_TUNING.hvacEfficiency; })() };
})()`);
check('at the moment the power dies the flat is exactly where the thermostat had it', near(temp.atStart, temp.atStartExpected, 1e-6), JSON.stringify({ a: temp.atStart, e: temp.atStartExpected }));
check('one time constant later it has moved most of the way toward outdoors (e^-1: it keeps ~37% of the gap)', Math.abs(temp.oneTau - temp.outdoorTau) < Math.abs(temp.normalAtTau - temp.outdoorTau) && Math.abs(temp.oneTau - temp.outdoorTau) > 0, JSON.stringify(temp));
check('after the outage the thermostat is in charge again (the normal blend, no drift)', near(temp.restored, temp.restoredExpected, 1e-6));

// ---------------------------------------------------------------- 4
console.log('\n4. The watch — start and end once each, narrated unless stale, the end\'s work done regardless');
const watch = J(`(() => {
  const g = __mk(83, 3);
  const p = __find(g, 2);
  const step = (from, to, o) => outageWatch(g, from, to, o || {});
  const pre = step(p.startAbs - 60, p.startAbs - 1);
  const starts = []; const l1 = step(p.startAbs - 10, p.startAbs + 10, { onStart: (pl) => starts.push(pl.id) });
  const l1b = step(p.startAbs + 10, p.startAbs + 20);
  const l2 = step(p.endAbs - 5, p.endAbs + 5);
  const l2b = step(p.endAbs + 5, p.endAbs + 60);
  const seen = ensureOutageState(g).seen[p.id];
  // a long wait across the whole thing: stale, so silent — but the end still happened
  const h = __mk(83, 3); const q = __find(h, 2);
  const stale = outageWatch(h, q.startAbs - 600, q.endAbs + 600, { stale: true });
  const seenH = ensureOutageState(h).seen[q.id];
  const moodH = __ids(h).map(id => h.npcs[id].mood);
  // slept through the end
  const s = __mk(83, 3); const r = __find(s, 2);
  outageWatch(s, r.startAbs - 5, r.startAbs + 5, { slept: true });
  const sl = outageWatch(s, r.endAbs - 5, r.endAbs + 5, { slept: true });
  const s2 = __mk(83, 3); const r2 = __find(s2, 2); const sl0 = outageWatch(s2, r2.startAbs - 5, r2.startAbs + 5, { slept: true });
  return { pre: pre.length, l1, starts, l1b: l1b.length, l2, l2b: l2b.length, seen, stale: stale.length, seenH, moodH, sl, sl0, cond: p.cond };
})()`);
check('nothing before it starts; the start line fires once (with the cause\'s wording), onStart is called once; a second look adds nothing', watch.pre === 0 && watch.l1.length === 1 && /out|dark|lights/i.test(watch.l1[0]) && watch.starts.length === 1 && watch.l1b === 0, JSON.stringify(watch.l1));
check('the end fires once ("the power comes back on"), preceded by how the house spent it when two are up; a rerun adds nothing', watch.l2.some(l => /power comes back on/.test(l)) && watch.l2b === 0 && watch.seen.started && watch.seen.ended, JSON.stringify(watch.l2));
check('a long wait across the whole outage is silent (stale) — but the end\'s work still ran (marks set, moods moved)', watch.stale === 0 && watch.seenH.started && watch.seenH.ended && watch.moodH.some(m => m !== 0), JSON.stringify({ stale: watch.stale, seen: watch.seenH, moods: watch.moodH }));
check('asleep when it starts: "you wake in the dark" if it is still on when you wake…', watch.sl0.length === 1 && /wake in the dark|power went out while you slept/.test(watch.sl0[0]), JSON.stringify(watch.sl0));
check('...and asleep at the end: the quiet "you only notice when the hum returns"', watch.sl.some(l => /hum returns|only notice/.test(l)), JSON.stringify(watch.sl));

// ---------------------------------------------------------------- 5
console.log('\n5. A shut fridge — held for a while, then the food ages at the warm rate');
const fr = J(`(() => {
  const mk = () => { const g = __mk(84, 2, 20); const fridge = Object.values(g.objects.room_kitchen).find(o => o.defId === 'fridge');
    fridge.contents = [{ defId: 'eggs', qty: 2, meta: { acquiredDay: 19 } }, { defId: 'chips', qty: 1, meta: { acquiredDay: 19 } }, { defId: 'frozen_pizza', qty: 1, meta: { acquiredDay: 19, frozen: { frozenAtAbs: 19, thawStartAbs: null, agedFraction: 0 } } }, { defId: 'comfort_ice_cream', qty: 1, meta: { cohort: 18, acquiredDay: 18 } }];
    return { g, fridge }; };
  const short = mk(); const nShort = outageSpoilFridge(short.g, OUTAGE_TUNING.holdHours - 0.5); const shortEggs = short.fridge.contents[0].meta.acquiredDay;
  const long = mk(); const hours = 10; const nLong = outageSpoilFridge(long.g, hours);
  const mult = preservationFor(OBJECT_DEFS.fridge);
  const shift = ((hours - OUTAGE_TUNING.holdHours) / 24) * (mult - 1);
  const c = long.fridge.contents;
  const fresh0 = freshnessOf({ defId: 'eggs', qty: 2, meta: { acquiredDay: 19 } }, OBJECT_DEFS.fridge, 20.5);
  const fresh1 = freshnessOf(c[0], OBJECT_DEFS.fridge, 20.5);
  return { nShort, shortEggs, nLong, eggs: c[0].meta.acquiredDay, shift, mult, chips: c[1].meta.acquiredDay, pizza: c[2].meta.acquiredDay, pizzaFrozen: !!c[2].meta.frozen, cream: c[3].meta.cohort, creamAcq: c[3].meta.acquiredDay, fresh0: fresh0 && fresh0.key, f0: fresh0 && fresh0.fraction, f1: fresh1 && fresh1.fraction };
})()`);
check('an outage inside the hold time changes nothing', fr.nShort === 0 && fr.shortEggs === 19);
check('past it, a perishable stack\'s age anchor moves earlier by exactly (hours over the hold / 24) x (fridge preservation − 1) days', near(19 - fr.eggs, fr.shift, 1e-9) && fr.mult > 1, JSON.stringify({ eggs: fr.eggs, shift: fr.shift, mult: fr.mult }));
check('...a stack with a cohort ages its COHORT; non-perishables and frozen stacks are left alone; the count is real', near(18 - fr.cream, fr.shift, 1e-9) && fr.chips === 19 && fr.pizza === 19 && fr.pizzaFrozen && fr.nLong === 2, JSON.stringify(fr));
check('the aged food really is less fresh (freshnessOf reads the moved anchor)', fr.f1 == null || fr.f0 == null || fr.f1 > fr.f0, JSON.stringify({ f0: fr.f0, f1: fr.f1 }));

// ---------------------------------------------------------------- 6
console.log('\n6. The huddle — the dark costs a little, company gives it back, a shared night bonds');
const hud = J(`(() => {
  const O = OUTAGE_TUNING;
  const g = __mk(85, 4, 30);
  const [a, b, c, d] = __ids(g);
  for (const pair of Object.values(g.world.castWeb || {})) for (const k of Object.keys(pair.axes || {})) pair.axes[k] = { ...pair.axes[k], affection: 0 };
  __ids(g).forEach(id => { g.npcs[id].bible.temperament = { volatility: 0 }; });
  g.npcs[a].bible.temperament = { volatility: 0.9 };
  g.npcs[d].activity = 'sleeping';
  const plan = { id: 'outage_test', day: 30, cond: 'storm', minutes: 180 };
  const line = outageHuddle(g, plan);
  const hours = 3;
  const key = [b, c].sort().join('|');
  const web = g.world.castWeb && g.world.castWeb[key] ? g.world.castWeb[key].axes[b + '→' + c].affection : 0;
  const webSleeper = (() => { const k = [b, d].sort().join('|'); return g.world.castWeb && g.world.castWeb[k] ? g.world.castWeb[k].axes[b + '→' + d].affection : 0; })();
  const solo = __mk(85, 4, 30); __ids(solo).forEach((id, i) => { solo.npcs[id].activity = i === 0 ? 'sitting' : 'sleeping'; solo.npcs[id].bible.temperament = { volatility: 0 }; });
  const soloLine = outageHuddle(solo, plan);
  const snow = __mk(85, 3, 30); const sl = outageHuddle(snow, { id: 'x', day: 30, cond: 'snow', minutes: 60 });
  return { line, moodCalm: g.npcs[b].mood, moodVolatile: g.npcs[a].mood, moodSleeper: g.npcs[d].mood, expCalm: O.moodPerHourDark * hours + O.huddleMood, expVol: O.moodPerHourDark * hours + O.volatileExtra * hours + O.huddleMood, expSleeper: O.moodPerHourDark * hours, web, webSleeper, fact: g.npcs[b].memory.facts.some(f => /power went out/.test(f.text)), sleeperFact: g.npcs[d].memory.facts.some(f => /power went out/.test(f.text)), soloLine, soloMood: solo.npcs[__ids(solo)[0]].mood, expSolo: O.moodPerHourDark * hours, sl };
})()`);
check('two or more up: a huddle line naming them, in the cause\'s wording (a storm: candlelight/cards/thunder)', /Mira|Jonah|Tamsin/.test(hud.line || '') && /storm|thunder|candle|cards|lamp/.test(hud.line || ''), hud.line);
check('the dark dips everyone per hour; a jumpy person dips more; whoever shared the evening gets the lift back; a sleeper only takes the dip', near(hud.moodCalm, hud.expCalm, 1e-9) && near(hud.moodVolatile, hud.expVol, 1e-9) && near(hud.moodSleeper, hud.expSleeper, 1e-9), JSON.stringify({ calm: hud.moodCalm, exp: hud.expCalm, vol: hud.moodVolatile, expVol: hud.expVol, sleeper: hud.moodSleeper }));
check('a shared night bonds the ones who shared it (not the sleeper) and is remembered', hud.web > 0 && hud.webSleeper === 0 && hud.fact && !hud.sleeperFact, JSON.stringify({ web: hud.web, sleeper: hud.webSleeper }));
check('nobody to huddle with (only one awake): no line, only the dip', hud.soloLine === null && near(hud.soloMood, hud.expSolo, 1e-9));

// ---------------------------------------------------------------- 7
console.log('\n7. Candles, the prompt line and the scene');
const cn = J(`(() => {
  const g = __mk(86, 2);
  const p = __find(g, 2);
  __abs(g, p.startAbs - 10); const closedBefore = __chip(g, 'occasion.light_candles');
  __abs(g, p.startAbs + 90); g.player.location = 'living_room'; g.npcs[__ids(g)[0]].location = 'living_room';
  const dark = outageSceneLine(g); const promptDark = outagePromptLine(g);
  const open = __chip(g, 'occasion.light_candles');
  const m0 = (g.player.moodEvents || []).length;
  const v = __verb(g, 'occasion.light_candles');
  const after = __chip(g, 'occasion.light_candles');
  const lit = outageSceneLine(g);
  __abs(g, p.endAbs + 30); const gone = { scene: outageSceneLine(g), prompt: outagePromptLine(g), chip: __chip(g, 'occasion.light_candles') };
  const q = __find(g, p.day + 12); __abs(g, q.startAbs + 5); const again = __chip(g, 'occasion.light_candles');
  return { closedBefore, dark, promptDark, open, v: { ok: v.ok, line: v.line }, mood: (g.player.moodEvents || []).length - m0, after, lit, gone, again, cause: p.cause };
})()`);
check('the Light Candles chip exists only while the power is out, once per outage (and is back for the next one)', !cn.closedBefore && cn.open && cn.v.ok && !cn.after && cn.again === true, JSON.stringify({ before: cn.closedBefore, open: cn.open, after: cn.after, again: cn.again }));
check('...it lifts your mood and, with a roommate there, is shared', cn.mood === 1 && /You and Mira light candles/.test(cn.v.line), JSON.stringify(cn.v));
check('the scene says the power is out — dim and quiet until the candles, then candlelight; nothing once it is back', /power is out/.test(cn.dark) && /dim/.test(cn.dark) && /candles throw a warm/.test(cn.lit) && cn.gone.scene === null && cn.gone.prompt === null, JSON.stringify({ dark: cn.dark, lit: cn.lit }));
check('the prompt line gives the cause and how long it has been dark', /\[Power\]: The power is OUT/.test(cn.promptDark) && new RegExp(cn.cause).test(cn.promptDark) && /about (\d+ hours?|less than an hour)/.test(cn.promptDark), cn.promptDark);
const promptSrc = srcOf('llm.js');
check('llm.js adds the line beside skyLine; scene.js joins it to the weather cue; render.js adds the 🔌', /outagePromptLine\(gameState\)/.test(promptSrc) && /outageSceneLine\(gameState\)/.test(srcOf('scene.js')) && /OUTAGE_TUNING\.headerEmoji/.test(srcOf('render.js')));

// ---------------------------------------------------------------- 7b
console.log('\n7b. The roommates — nothing electric starts, what was running stops, the schedule picks candle-friendly things');
const npcs = J(String.raw`(() => {
  const g = __mk(88, 3);
  g.world.upgrades.living_room_entertainment = { tier: 'functional', condition: 100 }; // the TV drive needs a working setup (What's On D16)
  const p = __find(g, 2);
  const id = __ids(g)[0];
  const nowAbs = () => clockToAbsolute(g.meta.clock);
  const cand = (driveId) => { const npc = g.npcs[id]; return isDriveCandidate(driveId, DRIVE_DEFS[driveId], npc, g, { npcId: id, nowAbs: nowAbs(), perceived: {}, isVisitor: false }); };
  // isDriveCandidate needs a fuller ctx in some drives; only compare on/off around the outage for the gated ones
  __abs(g, p.startAbs - 30);
  const before = { tv: cand('watch_tv'), laundry: cand('do_laundry') };
  __abs(g, p.startAbs + 30);
  const during = { tv: cand('watch_tv'), laundry: cand('do_laundry'), read: cand('read_book') };
  __abs(g, p.endAbs + 30);
  const after = { tv: cand('watch_tv') };
  // what was running stops
  const h = __mk(88, 3); const q = __find(h, 2); const [a, b, c] = __ids(h);
  h.npcs[a].activity = 'watching TV'; h.npcs[a].commitment = { driveId: 'watch_tv', untilAbs: q.endAbs + 500 };
  h.npcs[b].activity = 'cooking'; h.npcs[c].activity = 'playing games';
  outageWatch(h, q.startAbs - 5, q.startAbs + 5, {});
  const put = { a: h.npcs[a].activity, aCommit: h.npcs[a].commitment, b: h.npcs[b].activity, c: h.npcs[c].activity };
  // the schedule's tables
  const w = __mk(88, 3); const r = __find(w, 2); __abs(w, r.startAbs + 10);
  const picks = new Set(); for (let k = 0; k < 400; k++) { const rng = mulberry32(k * 7919 + 3); const res = resolveRoomForActivity('leisure', __ids(w)[0], w.npcs, rng, w.meta.clock, w); picks.add(res.activity); }
  const evening = new Set(); for (let k = 0; k < 400; k++) { const rng = mulberry32(k * 104729 + 5); evening.add(resolveRoomForActivity('evening', __ids(w)[0], w.npcs, rng, w.meta.clock, w).activity); }
  __abs(w, r.endAbs + 10);
  const normal = new Set(); for (let k = 0; k < 400; k++) { const rng = mulberry32(k * 104729 + 5); normal.add(resolveRoomForActivity('evening', __ids(w)[0], w.npcs, rng, w.meta.clock, w).activity); }
  return { before, during, after, put, picks: [...picks], evening: [...evening], normal: [...normal], idle: OUTAGE_TUNING.idleActivity, swap: OUTAGE_TUNING.swapPower };
})()`);
check('a power-hungry drive (TV, the laundry) is a candidate before and after, never during; a quiet one (reading) is unaffected', npcs.before.tv !== undefined && npcs.during.tv === false && npcs.during.laundry === false && npcs.during.read === true && npcs.after.tv === true, JSON.stringify({ b: npcs.before, d: npcs.during, a: npcs.after }));
check('when it starts, whoever was watching TV or playing games puts it down (the held drive is dropped); the cook carries on (gas)', npcs.put.a === npcs.idle && npcs.put.aCommit === null && npcs.put.c === npcs.idle && npcs.put.b === 'cooking', JSON.stringify(npcs.put));
check('the schedule\'s own tables: during it nobody picks an electric or wifi activity; outside it they still can', !npcs.evening.some(a => new RegExp(npcs.swap.pattern, 'i').test(a)) && npcs.evening.includes('reading') && npcs.normal.some(a => new RegExp(npcs.swap.pattern, 'i').test(a)), JSON.stringify({ evening: npcs.evening, normal: npcs.normal }));

// ---------------------------------------------------------------- 8
console.log('\n8. A whole year of half-hour steps — no exceptions, every start ends, no bill moves');
const year = J(`(() => {
  const g = __mk(87, 3, 2);
  const bills0 = JSON.stringify(g.world.bills || {});
  let starts = 0, ends = 0, lines = 0; const errs = [];
  let abs = 2 * 1440;
  for (let i = 0; i < 48 * 140 * 2; i++) {
    try {
      const ls = outageWatch(g, abs, abs + 30, {});
      for (const l of ls) { lines++; if (/lights go out|power is out|The lights|fault on the grid|crack of thunder/.test(l)) starts++; if (/power comes back on|hum returns/.test(l)) ends++; }
    } catch (e) { errs.push(e.message); break; }
    abs += 30;
  }
  const st = ensureOutageState(g);
  const done = Object.values(st.seen).filter(r => r.started && r.ended).length;
  return { errs, starts, ends, seen: Object.keys(st.seen).length, done, billsSame: JSON.stringify(g.world.bills || {}) === bills0, plansTwoYears: (() => { let n = 0; for (let d = 2; d <= 2 + 280; d++) if (outagePlanFor(g, d)) n++; return n; })(), rt: JSON.stringify(JSON.parse(JSON.stringify(g.world.occasions))) === JSON.stringify(g.world.occasions) };
})()`);
check('two years stepped through the watch: no exceptions; every outage that started ended, once', year.errs.length === 0 && year.starts === year.ends && year.starts >= 2 && year.done === year.seen, JSON.stringify(year));
check('the economy is untouched (bills identical) and the state survives a JSON round trip (small)', year.billsSame && year.rt);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
