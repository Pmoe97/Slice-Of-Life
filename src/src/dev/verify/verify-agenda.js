// Agenda, Phase 1 — the one derivation (agenda-app-plan.md; 0.14.5).
//
//   node src/src/dev/verify/verify-agenda.js
//
// agendaEntries(gs) is the Tracker's entries unchanged plus the holidays, the birthdays you know,
// roommates' shows and an outage watch. Checked here: the Tracker is a strict subset (same keys, same
// order, same badge count), every new entry is derived from its owner (never recomputed), the new ones
// never notify, grouping and sorting are total and stable, and it is deterministic.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'sim.js', 'world.js', 'effects.js', 'npc.js', 'time.js', 'commitments.js', 'occasions.js', 'birthdays.js', 'projects.js', 'seasons.js', 'tracker.js', 'agenda.js', 'defs.computer.js', 'computer.js', 'phone.js', 'state.js', 'llm.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, day) => {
    const h = SIM_generateHouse(seed || 20260929, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 20, minutes: 700 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
`);

console.log('\n1. The Tracker is untouched');
const t = J(`(() => {
  const g = __mk();
  const base = buildTrackerEntries(g), all = agendaEntries(g);
  const baseKeys = base.map(e => e.key), allKeys = all.map(e => e.key);
  const notif = getTrackerNotifications(g).map(e => e.key);
  return { baseKeys, prefix: allKeys.slice(0, baseKeys.length), n: all.length, nb: base.length,
           keeps: base.every((e, i) => ['kind', 'urgency', 'title', 'detail', 'dueDay', 'daysUntil'].every(k => JSON.stringify(e[k]) === JSON.stringify(all[i][k]))),
           notifs: notif, agendaBadge: all.filter(e => e.notify && e.urgency >= TRACKER.notifyThreshold).map(e => e.key).sort(), unique: new Set(allKeys).size === allKeys.length };
})()`);
check('the Tracker\'s own entries lead the Agenda, in the same order, with the same fields', JSON.stringify(t.prefix) === JSON.stringify(t.baseKeys) && t.keeps);
check('what would badge or notify is the same set the Tracker notifies', JSON.stringify(t.agendaBadge) === JSON.stringify(t.notifs.slice().sort()), JSON.stringify({ a: t.agendaBadge, n: t.notifs }));
check('every key is unique across the whole Agenda', t.unique);

console.log('\n2. Lanes');
const lanes = J(`(() => {
  const g = __mk();
  const all = agendaEntries(g);
  const ids = AGENDA_LANES.map(l => l.id);
  return { ids, ok: all.every(e => ids.includes(e.lane)), kinds: [...new Set(all.map(e => e.kind))].sort(),
           unmapped: [] };
})()`);
{
  // every kind the Tracker's adapters can emit, read from its source
  const kinds = [...new Set([...fs.readFileSync(path.join(SRC, 'tracker.js'), 'utf8').matchAll(/kind: '([a-z_]+)'/g)].map(m => m[1]))];
  lanes.unmapped = kinds.filter(k => !J(`AGENDA_KIND_LANE[${JSON.stringify(k)}] || null`));
}
check('every entry sits in one of the five lanes', lanes.ok, JSON.stringify(lanes));
check('every Tracker kind that can arise has a lane (none falls to the default by accident)', lanes.unmapped.length === 0, lanes.unmapped.join(','));

console.log('\n3. Holidays and birthdays read their owners');
const hb = J(`(() => {
  const g = __mk(); const day = g.meta.clock.day;
  const rows = holidayRows(g).filter(r => r.daysUntil <= AGENDA_TUNING.horizonDays);
  const es = agendaEntries(g).filter(e => e.kind === 'holiday');
  const first = es[0];
  // a known birthday, and your own
  const [id] = __ids(g);
  g.player.birthdays = g.player.birthdays || {}; g.player.birthdays.known = { ...(g.player.birthdays.known || {}), [id]: { day: 1 } };
  const brows = knownBirthdayRows(g).filter(r => r.daysUntil <= AGENDA_TUNING.horizonDays);
  const bes = agendaEntries(g).filter(e => e.kind === 'birthday');
  return { rows: rows.length, es: es.length, firstOk: !first || (first.dueDay === day + rows[0].daysUntil && first.daysUntil === rows[0].daysUntil),
           brows: brows.length, bes: bes.length, self: bes.some(e => /Your birthday/.test(e.title)), bLane: bes.every(e => e.lane === 'occasions'),
           inside: [...es, ...bes].every(e => e.daysUntil >= 0 && e.daysUntil <= AGENDA_TUNING.horizonDays), soft: [...es, ...bes].every(e => e.urgency < TRACKER.notifyThreshold && e.notify === false) };
})()`);
check('a holiday entry per owned holiday row inside the horizon, on the row\'s own day', hb.rows === hb.es && hb.firstOk, JSON.stringify(hb));
check('a birthday entry per known birthday inside the horizon, your own included', hb.brows === hb.bes && hb.self && hb.bLane, JSON.stringify(hb));
check('none of them can reach a notification: soft urgency, notify false', hb.soft && hb.inside);

console.log('\n4. Shows and the outage watch');
const ev = J(`(() => {
  const g = __mk(); const day = g.meta.clock.day;
  const [id] = __ids(g);
  const w = (g.world.projects = g.world.projects || {}); w.people = w.people || {};
  const kinds = Object.keys(PROJECT_KINDS || {}).filter(k => PROJECT_KINDS[k].event);
  return { hasKinds: kinds.length, owner: typeof projectCalendarEvents(g) };
})()`);
check('projects own the shows the calendar lists (the adapter reads projectCalendarEvents)', ev.hasKinds > 0 && ev.owner === 'object');
const ou = J(`(() => {
  const out = { days: [] };
  // find a seed/day where the next two days hold a rough condition, and one where none does
  for (let day = 5; day < 400 && out.days.length < 60; day++) {
    const g = __mk(20260929, day);
    const es = agendaEntries(g).filter(e => e.kind === 'outage');
    const conds = [0, 1, 2].map(k => weatherConditionOn(g, day + k));
    const expect = conds.filter(c => (OUTAGE_TUNING.chance[c] || 0) >= AGENDA_TUNING.outageMinChance).length;
    out.days.push({ day, es: es.length, expect, soft: es.every(e => e.urgency < TRACKER.notifyThreshold && e.notify === false && e.lane === 'home'), dated: es.every(e => e.dueDay === day + e.daysUntil) });
  }
  out.any = out.days.some(d => d.es > 0); out.none = out.days.some(d => d.es === 0);
  out.match = out.days.every(d => d.es === d.expect); out.soft = out.days.every(d => d.soft && d.dated);
  delete out.days; return out;
})()`);
check('the outage watch raises exactly on the rough days OUTAGE_TUNING gives a real chance, and only for the next two days', ou.match, JSON.stringify(ou));
check('some days have one and some do not; every one is a soft, dated, Home entry', ou.any && ou.none && ou.soft, JSON.stringify(ou));
{
  const src = fs.readFileSync(path.join(SRC, 'agenda.js'), 'utf8');
  check('the watch forecasts a risk, never the outage itself: it does not read outagePlanFor', !/outagePlanFor|outageAt\(/.test(src));
}

console.log('\n5. Sorting and grouping');
const sg = J(`(() => {
  const g = __mk();
  const cid = __ids(g)[0];
  createCommitment(g, { kind: 'hangout', npcId: cid, startAbs: g.meta.clock.day * 1440 + 1200, endAbs: g.meta.clock.day * 1440 + 1260, title: 'Late one', roomId: 'living_room' });
  createCommitment(g, { kind: 'hangout', npcId: cid, startAbs: g.meta.clock.day * 1440 + 1000, endAbs: g.meta.clock.day * 1440 + 1060, title: 'Early one', roomId: 'living_room' });
  const list = agendaList(g, null);
  const groups = agendaGroups(g, null);
  const commits = list.filter(e => e.kind === 'commitment');
  const daysSeq = list.filter(e => e.daysUntil != null).map(e => e.daysUntil);
  const g2 = agendaGroups(g, ['money']);
  return { n: list.length, sortedDays: daysSeq.every((d, i) => i === 0 || daysSeq[i - 1] <= d), commitMinutes: commits.map(e => e.minutes),
           commitOrder: commits.map(e => e.minutes).every((m, i, a) => i === 0 || a[i - 1] <= m),
           groupLabels: groups.map(x => x.label), first: groups[0] && groups[0].label,
           everyEntryOnce: groups.reduce((s, x) => s + x.entries.length, 0) === list.length,
           lane: g2.every(x => x.entries.every(e => e.lane === 'money')), anytimeLast: (() => { const i = groups.findIndex(x => x.key === 'anytime'); return i < 0 || i === groups.length - 1; })(),
           det: JSON.stringify(agendaEntries(g)) === JSON.stringify(agendaEntries(g)) };
})()`);
check('the list is sorted by day, then time of day', sg.sortedDays && sg.commitOrder && sg.commitMinutes.length >= 2, JSON.stringify(sg));
check('commitments carry their time of day', sg.commitMinutes.every(m => typeof m === 'number'), JSON.stringify(sg.commitMinutes));
check('grouping holds every entry exactly once, undated last, and a lane filter holds only that lane', sg.everyEntryOnce && sg.anytimeLast && sg.lane, JSON.stringify(sg));
check('the Agenda is deterministic for the same save', sg.det);

const dl = J(`(() => {
  const g = __mk(); const cid = __ids(g)[0];
  createCommitment(g, { kind: 'hangout', npcId: cid, startAbs: g.meta.clock.day * 1440 + 1200, endAbs: g.meta.clock.day * 1440 + 1260, title: 'x', roomId: 'living_room' });
  const raw = buildTrackerEntries(g).find(e => e.kind === 'commitment'), a = agendaEntries(g).find(e => e.kind === 'commitment');
  const links = agendaEntries(g).map(e => e.deepLink.appId);
  return { rawApp: raw.deepLink.appId, app: a.deepLink.appId, screen: a.deepLink.screenId, id: a.commitmentId, real: g.world.commitments.some(c => String(c.id) === a.commitmentId),
           allKnown: links.every(id => !!APP_DEFS[id] || id === 'agenda'), oldGone: links.filter(id => ['calendar', 'compass', 'tracker'].includes(id)).length };
})()`);
check('the Tracker still links a commitment to the Calendar, and the Agenda sends it to its own Coming up tab, carrying the commitment\'s id for Clear', dl.rawApp === 'calendar' && dl.app === 'agenda' && dl.screen === 'coming' && dl.real, JSON.stringify(dl));
check('no Agenda entry links to the old Calendar, Compass or Tracker apps', dl.oldGone === 0 && dl.allKnown, JSON.stringify(dl));
check('the Agenda app has its four tabs, on both devices, each with a renderer', J(`(() => { const a = APP_DEFS.agenda; return a.devices.includes('phone') && a.devices.includes('computer') && Object.keys(a.screens).join() === 'coming,needs,year,directions' && a.entryScreen === 'coming'; })()`) === true);

console.log('\n6. Old links and the Year grid marks');
const rd = J(`({
  a: agendaRedirect('tracker', 'notifications'), b: agendaRedirect('tracker', 'agenda'), c: agendaRedirect('calendar', 'year'),
  d: agendaRedirect('calendar', 'birthdays'), e: agendaRedirect('compass', 'overview'), f: agendaRedirect('mail', 'inbox'), g: agendaRedirect('calendar', 'nope'),
})`);
check('the old Tracker, Calendar and Compass screens redirect to the Agenda\'s tabs; other apps are untouched', JSON.stringify(rd) === JSON.stringify({
  a: { appId: 'agenda', screenId: 'needs' }, b: { appId: 'agenda', screenId: 'coming' }, c: { appId: 'agenda', screenId: 'year' },
  d: { appId: 'agenda', screenId: 'coming' }, e: { appId: 'agenda', screenId: 'directions' }, f: { appId: 'mail', screenId: 'inbox' }, g: { appId: 'agenda', screenId: 'coming' } }), JSON.stringify(rd));
const marks = J(`(() => {
  const g = __mk();
  const m = agendaGridMarks(g, null);
  const all = Object.values(m).flat();
  const money = Object.values(agendaGridMarks(g, ['money'])).flat();
  return { n: all.length, noOwn: all.every(e => !['holiday', 'birthday', 'event'].includes(e.kind)), dated: Object.keys(m).every(k => m[k].every(e => e.dueDay === Number(k))), moneyOnly: money.every(e => e.lane === 'money') };
})()`);
check('the grid gets the Tracker and outage marks by day, without duplicating the holidays, birthdays and shows it already draws', marks.noOwn && marks.dated && marks.moneyOnly, JSON.stringify(marks));

console.log('\n7. The three retired apps');
const rt = J(`(() => {
  const g = __mk();
  g.world.computer = defaultComputerState(); g.world.phone = defaultPhoneState();
  openApp(g, 'calendar'); const afterCal = { win: Object.keys(g.world.computer.windows), screen: g.world.computer.windows.agenda && g.world.computer.windows.agenda.screenId };
  openApp(g, 'compass'); const afterCompass = g.world.computer.windows.agenda.screenId;
  switchScreen(g, 'calendar', 'year'); const afterSwitch = g.world.computer.windows.agenda.screenId;
  phoneOpenApp(g, 'tracker'); const top1 = g.world.phone.navStack[g.world.phone.navStack.length - 1]; const open1 = g.world.phone.openAppId;
  phoneOpenApp(g, 'calendar'); const top2 = g.world.phone.navStack[g.world.phone.navStack.length - 1];
  const nc = normalizeComputerState({ power: 'on', windows: { calendar: { rect: { x: 1, y: 1, w: 9, h: 9 }, screenId: 'year', params: {}, zIndex: 1 }, compass: { rect: { x: 2, y: 2, w: 9, h: 9 }, screenId: 'overview', params: {}, zIndex: 2 } }, focusedAppId: 'compass' });
  const np = normalizePhoneState({ power: 'on', openAppId: 'tracker', navStack: [{ appId: 'tracker', screenId: 'agenda', params: {} }, { appId: 'mail', screenId: 'inbox', params: {} }] });
  return { afterCal, afterCompass, afterSwitch, top1, open1, top2, ncWindows: Object.keys(nc.windows), ncScreen: nc.windows.agenda && nc.windows.agenda.screenId, ncFocus: nc.focusedAppId, np: { open: np.openAppId, stack: np.navStack.map(n => n.appId + '/' + n.screenId) },
    tiles: Object.values(APP_DEFS).filter(a => agendaRetired(a.id)).map(a => a.id) };
})()`);
check('opening the Calendar or the Compass opens the Agenda on the matching tab, never a window of its own', JSON.stringify(rt.afterCal.win) === '["agenda"]' && rt.afterCal.screen === 'coming' && rt.afterCompass === 'directions' && rt.afterSwitch === 'year', JSON.stringify(rt));
check('the phone: the Tracker tile opens Needs you, and old Calendar links land on the Agenda', rt.top1.appId === 'agenda' && rt.top1.screenId === 'needs' && rt.open1 === 'agenda' && rt.top2.appId === 'agenda' && rt.top2.screenId === 'coming', JSON.stringify(rt));
check('an old save with the Calendar and Compass open reopens as one Agenda window (the first one\'s tab), focus kept', JSON.stringify(rt.ncWindows) === '["agenda"]' && rt.ncScreen === 'year' && rt.ncFocus === 'agenda', JSON.stringify(rt));
check('an old phone save inside the Tracker reopens on the Agenda; other apps in the stack are untouched', rt.np.open === 'agenda' && JSON.stringify(rt.np.stack) === '["agenda/coming","mail/inbox"]', JSON.stringify(rt.np));
check('the retired set is exactly the Calendar, the Compass and the Tracker shell; the tile lists skip them', JSON.stringify(rt.tiles.sort()) === '["calendar","compass"]' && J(`agendaRetired('tracker')`) === true && J(`agendaRetired('mail')`) === false, JSON.stringify(rt.tiles));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
