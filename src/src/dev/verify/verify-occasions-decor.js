// Occasions & Holidays plan (occasions-and-holidays-plan.md) — Phase 3:
// decorations.
//
//   node src/src/dev/verify/verify-occasions-decor.js
//
// Covers: registration (OCCASION_DECOR rows, the two trusted effects, the two
// verbs + their requirement checkers, the new `occasions` world save key and
// its fallback); the R1 guard over every decor string; the window arithmetic
// (player lead, npcDay, the year boundary); the chips existing ONLY in their
// window and room (resolveAvailableActions); the player decorating and taking
// down through the real verb pipeline (requirements → prepare → buildEffects
// → the real DSL parse/validate/apply — executeAction's own clock advance is
// UI-layer and not node-loadable); a festive roommate decorating on npcDay
// (and NOT when the player got there first, or nobody cares enough); the
// conscientiousness-driven takedown lag and the one-time "still up" line; the
// player's set auto-coming-down; the daily mood; and the scene reader + both
// prompt surfaces (THE HOME note; "Decorations here" in the scene prompt but
// never the IM prompt).
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.actions.js', 'defs.computer.js', 'sim.js', 'scene.js', 'effects.js', 'items.js', 'inventory.js',
    'drives.js', 'actions.js', 'computer.js', 'npc.js', 'llm.js', 'state.js', 'birthdays.js', 'occasions.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, n, day, room) => {
    const warn = console.warn; console.warn = () => {};
    const h = SIM_generateHouse(seed || 20260923, n || 3);
    console.warn = warn;
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 1, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = room || 'living_room';
    Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort()
      .forEach((id, i) => { g.npcs[id].bible.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar'][i] || ('Roomie' + i); });
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __d = (si, dom, year) => ((year || 1) - 1) * 140 + si * 35 + dom;
  __at = (g, day, room) => { g.meta.clock.day = day; if (room) g.player.location = room; return g; };
  // Keep roommates out of the player's room and pin their feelings, so a
  // test's decorator is exactly the one it sets up.
  __setFest = (g, vals) => __ids(g).forEach((id, i) => { g.npcs[id].bible.festivity = vals[i] == null ? 0.3 : vals[i]; g.npcs[id].location = 'bedroom_' + (i + 1); });
  // The verb pipeline, minus executeAction's UI-layer clock advance.
  __verb = (g, actionId) => {
    const def = ACTION_DEFS[actionId];
    const ctx = buildActionContext(g);
    const req = checkRequirements(def, ctx);
    if (!req.ok) return { ok: false, reason: req.reason };
    const prepared = def.prepare ? def.prepare(ctx) : null;
    const lines = def.buildEffects ? def.buildEffects(ctx, prepared) : (def.effects || []);
    const effCtx = buildEffectContext(g, [], [], ctx.roomObjects, g.player.inventory || []);
    const parsed = parseEffectDSL(lines.join('\\n'));
    const invalid = parsed.filter(e => EFFECT_DEFS[e.type] && EFFECT_DEFS[e.type].validate && EFFECT_DEFS[e.type].validate(e.params, effCtx) !== true);
    applyEffects(parsed, effCtx);
    return { ok: true, prepared, lines, invalid: invalid.length, line: def.narration.build(ctx, prepared) };
  };
  __chip = (g, id) => (resolveAvailableActions(g).find(a => a.actionId === id) || {}).ok === true;
  __MW = __d(3, 25);
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration');
const reg = J(`(() => {
  const bad = [];
  for (const [id, d] of Object.entries(OCCASION_DECOR)) {
    if (!OCCASION_DEFS[id]) bad.push(id + ':no occasion');
    if (!ROOMS[d.room]) bad.push(id + ':room');
    if (!d.phrase || !d.npcUp || !d.playerUp || !d.npcUp.includes('{name}')) bad.push(id + ':lines');
    if (!(d.lead >= d.npcLead && d.npcLead >= 0)) bad.push(id + ':lead');
  }
  const worldKeys = SAVE_KEYS.find(e => e.folder === 'world').keys;
  return {
    bad, n: Object.keys(OCCASION_DECOR).length,
    effects: ['DECORATE_OCCASION', 'TAKE_DOWN_DECOR'].map(t => EFFECT_DEFS[t] && EFFECT_DEFS[t].llm === false && EFFECT_DEFS[t].implemented),
    verbs: ['self.decorate', 'self.take_down_decor'].map(v => !!ACTION_DEFS[v]),
    checkers: ['decorWindowOpen', 'decorTakeDownable'].map(c => typeof ACTION_REQUIREMENT_CHECKERS[c] === 'function'),
    saveKey: worldKeys.includes('occasions'), fallback: JSON.stringify(WORLD_KEY_FALLBACKS.occasions()),
    verbRooms: ACTION_DEFS['self.decorate'].source.roomIds.slice().sort(),
    decorRooms: [...new Set(Object.values(OCCASION_DECOR).map(d => d.room))].sort(),
  };
})()`);
check(`all ${reg.n} decor rows name a real occasion, a real room, their three lines, and lead ≥ npcLead ≥ 0`, reg.bad.length === 0, reg.bad.join(' | '));
check('DECORATE_OCCASION and TAKE_DOWN_DECOR are trusted-only (llm:false) implemented effects', reg.effects.every(Boolean), JSON.stringify(reg.effects));
check('the Decorate and Take Down verbs and their requirement checkers exist', reg.verbs.every(Boolean) && reg.checkers.every(Boolean));
check('the verbs are offered in exactly the rooms decorations live in', JSON.stringify(reg.verbRooms) === JSON.stringify(reg.decorRooms), JSON.stringify([reg.verbRooms, reg.decorRooms]));
check("world.occasions is a persisted SAVE_KEYS world key with an empty-decor fallback (the castWeb scar: saved AND read back)", reg.saveKey && reg.fallback === '{"decor":{}}', JSON.stringify(reg));
const decorText = J(`Object.values(OCCASION_DECOR).flatMap(d => [d.phrase, d.npcUp, d.playerUp]).concat(Object.values(OCCASION_TUNING.decor.lines))`);
const FAITH = /\b(gods?|church|chapel|mosque|temple|synagogue|shrine|pray(er|ers|ing)?|holy|saints?|christ\w*|jesus|allah|buddh\w*|bless(ed|ing)?|sacred|divine|faith\w*|religio\w*|worship\w*|easter|christmas|xmas|hanukk?ah|chanukah|diwali|ramadan|eid|passover|lent|advent|yuletide|nativity|miracle|spirit(s|ual)?|soul(s)?|heaven|angels?|pagan|menorah|crucifix|altar)\b/i;
const hits = decorText.filter(t => FAITH.test(t));
check(`R1: none of the ${decorText.length} decor strings carries faith vocabulary`, hits.length === 0, hits.join(' | '));

// ---------------------------------------------------------------- 1
console.log('\n1. Windows');
const win = J(`({
  mw: decorWindow('midwinter', __d(3, 20)),
  lantern: decorWindow('lantern_nights', __d(3, 10)),
  valLate: decorWindow('valentines_day', 139),
  none: decorWindow('fools_day', 5),
})`);
check('Midwinter (Winter 25 = day 130): you can decorate from day 123, a roommate does on 126, it ends on 130', win.mw.start === 130 && win.mw.playerFrom === 123 && win.mw.npcDay === 126 && win.mw.end === 130 && win.mw.year === 1, JSON.stringify(win.mw));
check('Lantern Nights runs to its sixth night (days 113–118), decorated from the day before', win.lantern.start === 113 && win.lantern.end === 118 && win.lantern.playerFrom === 112, JSON.stringify(win.lantern));
check("late in the year, Valentine's window points at NEXT year's (day 154)", win.valLate.start === 154 && win.valLate.year === 2, JSON.stringify(win.valLate));
check('an occasion with no decor set has no window', win.none === null);

// ---------------------------------------------------------------- 2
console.log('\n2. The chips exist only in their window and room');
const chips = J(`(() => {
  const g = __mk(1, 2, 122); __setFest(g, [0.3, 0.3]);
  const before = __chip(g, 'self.decorate');
  __at(g, 123);
  const living = __chip(g, 'self.decorate'); const which = occasionToDecorate(g, 123, 'living_room');
  __at(g, 123, 'dining'); const dining = __chip(g, 'self.decorate');
  __at(g, 131, 'living_room'); const after = __chip(g, 'self.decorate');
  __at(g, 112, 'living_room'); const lantern = occasionToDecorate(g, 112, 'living_room');
  __at(g, 50, 'kitchen'); const kitchen = __chip(g, 'self.decorate');
  const takeDownNever = __chip(__at(g, 123, 'living_room'), 'self.take_down_decor');
  return { before, living, which, dining, after, lantern, kitchen, takeDownNever };
})()`);
check('no Decorate chip the day before the window (122), one on day 123 in the living room — for Midwinter', !chips.before && chips.living && chips.which === 'midwinter', JSON.stringify(chips));
check("not in the dining room (Midwinter's set lives in the living room), not after the day (131), never in the kitchen", !chips.dining && !chips.after && !chips.kitchen);
check("the day before Lantern Nights, the living room's Decorate is for Lantern Nights", chips.lantern === 'lantern_nights');
check('no Take Down chip when nothing is up', chips.takeDownNever === false);

// ---------------------------------------------------------------- 3
console.log('\n3. The player decorates — through the real verb pipeline');
const up = J(`(() => {
  const g = __mk(2, 2, 124); __setFest(g, [0.3, 0.3]);
  const moodEvents = (g.player.moodEvents || []).length;
  const r = __verb(g, 'self.decorate');
  const rec = g.world.occasions.decor.midwinter;
  return {
    r, rec, chipAfter: __chip(g, 'self.decorate'),
    impulse: (g.player.moodEvents || []).length - moodEvents,
    scene: decorSceneLine(g, 'living_room'), sceneDining: decorSceneLine(g, 'dining'),
    home: decorHomeNote(g, 'living_room'),
    promptScene: sceneDateLine(g, true), promptIm: sceneDateLine(g),
    composed: composeScene(g, null).decor,
  };
})()`);
check('the verb resolves Midwinter and emits DECORATE_OCCASION + a mood lift, all valid', up.r.ok && up.r.prepared.occasionId === 'midwinter' && up.r.lines.some(l => l === 'DECORATE_OCCASION midwinter player') && up.r.invalid === 0, JSON.stringify(up.r));
check("the record: put up by the player on day 124, due down 14 days after Midwinter (day 144)", up.rec.by === 'player' && up.rec.upDay === 124 && up.rec.year === 1 && up.rec.dueDownDay === 144 && up.rec.downDay === null, JSON.stringify(up.rec));
check("the narration is the set's own line (grandfather's box)", /grandfather's old box of Midwinter decorations/.test(up.r.line), up.r.line);
check('the chip is gone once it is up, and the player got a mood impulse', up.chipAfter === false && up.impulse === 1);
check('the living room now reads as decorated; the dining room does not', /The living room is decorated for Midwinter — a tree strung with lights/.test(up.scene || '') && up.sceneDining === null, up.scene);
check("composeScene carries it as the passage's decor line", up.composed === up.scene);
check("THE HOME notes it on the living room's line", /^decorated for Midwinter: a tree strung with lights/.test(up.home), up.home);
check('the scene prompt says "Decorations here"; the IM prompt never does', /\n- Decorations here: The living room is decorated for Midwinter/.test(up.promptScene) && !/Decorations here/.test(up.promptIm), JSON.stringify([up.promptScene, up.promptIm]));

// ---------------------------------------------------------------- 4
console.log('\n4. Taking it down');
const down = J(`(() => {
  const g = __mk(3, 2, 124); __setFest(g, [0.3, 0.3]);
  __verb(g, 'self.decorate');
  const onDay = decorToTakeDown(__at(g, 130), 130, 'living_room');
  const elsewhere = decorToTakeDown(__at(g, 131, 'dining'), 131, 'dining');
  __at(g, 131, 'living_room');
  const chip = __chip(g, 'self.take_down_decor');
  const r = __verb(g, 'self.take_down_decor');
  return { onDay, elsewhere, chip, r, rec: g.world.occasions.decor.midwinter, scene: decorSceneLine(g, 'living_room'), redecorate: occasionToDecorate(g, 131, 'living_room') };
})()`);
check("not while it's still Midwinter; not from another room", down.onDay === null && down.elsewhere === null);
check('the day after, the Take Down chip appears and packs it away', down.chip && down.r.ok && /pack the Midwinter decorations away/.test(down.r.line) && down.rec.downDay === 131 && down.rec.downBy === 'player', JSON.stringify(down));
check("the room stops reading as decorated, and it can't be put back up this year", down.scene === null && down.redecorate === null);

// ---------------------------------------------------------------- 5
console.log('\n5. A festive roommate decorates on npcDay — unless you did, or nobody cares enough');
const npc = J(`(() => {
  const g = __mk(4, 3, 126); __setFest(g, [0.4, 0.95, 0.7]);
  const out = processOccasionsForDay(g, 126).lines;
  const rec = g.world.occasions.decor.midwinter;
  const [a, b] = __ids(g);
  const g2 = __mk(4, 3, 124); __setFest(g2, [0.4, 0.95, 0.7]); __verb(g2, 'self.decorate');
  const out2 = processOccasionsForDay(__at(g2, 126), 126).lines;
  const g3 = __mk(4, 3, 126); __setFest(g3, [0.2, 0.3, 0.25]);
  const out3 = processOccasionsForDay(g3, 126).lines;
  const g4 = __mk(4, 3, 125); __setFest(g4, [0.4, 0.95, 0.7]);
  const early = processOccasionsForDay(g4, 125).lines;
  return { out, rec, jonah: b, out2, by2: g2.world.occasions.decor.midwinter.by, out3, none3: !(g3.world.occasions && g3.world.occasions.decor && g3.world.occasions.decor.midwinter), early };
})()`);
check('on day 126 the keenest resident (Jonah, 0.95) puts the tree up — named in the log', npc.rec && npc.rec.by === npc.jonah && npc.rec.upDay === 126 && npc.out.some(l => /^Jonah spent the evening putting up the Midwinter tree/.test(l)), JSON.stringify(npc.out));
check('not the day before its npcDay (the player gets the first chance)', !npc.early.some(l => /Midwinter tree/.test(l)), JSON.stringify(npc.early));
check('if the player already decorated, no roommate redoes it', npc.by2 === 'player' && !npc.out2.some(l => /Midwinter tree/.test(l)), JSON.stringify(npc.out2));
check('if nobody is keen enough (all under 0.62), nobody decorates', npc.none3 && !npc.out3.some(l => /Midwinter tree/.test(l)), JSON.stringify(npc.out3));

// ---------------------------------------------------------------- 6
console.log("\n6. A roommate's decorations come down on a conscientiousness lag");
const lag = J(`(() => {
  const mk = (consc) => {
    const g = __mk(5, 2, 126); __setFest(g, [0.95, 0.2]);
    g.npcs[__ids(g)[0]].bible.temperament.conscientiousness = consc;
    processOccasionsForDay(g, 126);
    return g;
  };
  const neat = mk(1); const messy = mk(-1);
  const neatDue = neat.world.occasions.decor.midwinter.dueDownDay;
  const messyDue = messy.world.occasions.decor.midwinter.dueDownDay;
  const neatDown = processOccasionsForDay(__at(neat, 131), 131).lines;
  const messyLines = [];
  for (let d = 131; d <= 137; d++) messyLines.push([d, processOccasionsForDay(__at(messy, d), d).lines.filter(l => /Midwinter decorations/.test(l))]);
  return { neatDue, messyDue, neatDown, neatRec: neat.world.occasions.decor.midwinter, messyLines, messyRec: messy.world.occasions.decor.midwinter };
})()`);
check('a meticulous decorator takes it down the day after (due 131); a messy one a week later (due 137)', lag.neatDue === 131 && lag.messyDue === 137, JSON.stringify([lag.neatDue, lag.messyDue]));
check('the neat one really does, on day 131, by name', lag.neatDown.some(l => /^Mira took down the Midwinter decorations\.$/.test(l)) && lag.neatRec.downDay === 131, JSON.stringify(lag.neatDown));
const lingerDays = lag.messyLines.filter(([, ls]) => ls.some(l => /still up/.test(l))).map(([d]) => d);
check('the messy one\'s set is remarked on exactly once (day 134, four days after), then comes down on 137', JSON.stringify(lingerDays) === '[134]' && lag.messyLines.find(([d]) => d === 137)[1].some(l => /took down the Midwinter decorations/.test(l)) && lag.messyRec.downDay === 137, JSON.stringify(lag.messyLines));

// ---------------------------------------------------------------- 7
console.log('\n7. The player\'s own set, left up, eventually comes down without them');
const auto = J(`(() => {
  const g = __mk(6, 2, 124); __setFest(g, [0.3, 0.3]); __verb(g, 'self.decorate');
  const seen = [];
  for (let d = 131; d <= 144; d++) { const ls = processOccasionsForDay(__at(g, d), d).lines.filter(l => /Midwinter decorations/.test(l)); if (ls.length) seen.push([d, ls]); }
  return { seen, rec: g.world.occasions.decor.midwinter };
})()`);
check('remarked on at day 134, then "somebody got tired of waiting" on day 144', JSON.stringify(auto.seen.map(([d]) => d)) === '[134,144]' && /got tired of waiting/.test(auto.seen[1][1][0]) && auto.rec.downBy === 'auto', JSON.stringify(auto.seen));

// ---------------------------------------------------------------- 8
console.log('\n8. The house\'s mood while it is up');
const mood = J(`(() => {
  const g = __mk(7, 2, 124); __setFest(g, [0.95, 0.05]); __verb(g, 'self.decorate');
  const [a, b] = __ids(g); g.npcs[a].mood = 0; g.npcs[b].mood = 0;
  processOccasionsForDay(__at(g, 125), 125);
  return { fan: g.npcs[a].mood, grump: g.npcs[b].mood, T: OCCASION_TUNING.decor, affA: npcOccasionAffinity(g.npcs[a], 'midwinter'), affB: npcOccasionAffinity(g.npcs[b], 'midwinter') };
})()`);
check('a roommate who loves Midwinter brightens a little each day it is up; one who hates the fuss sours a little', Math.abs(mood.fan - mood.T.moodFestive) < 1e-9 && Math.abs(mood.grump - mood.T.moodGrump) < 1e-9, JSON.stringify({ fan: mood.fan, grump: mood.grump, affA: mood.affA, affB: mood.affB }));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
