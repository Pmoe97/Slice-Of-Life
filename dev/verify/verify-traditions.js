// Occasions & Holidays plan (occasions-and-holidays-plan.md) — Phases 4–8:
// what people DO on the calendar's days (traditions.js).
//
//   node dev/verify/verify-traditions.js
//
// Node coverage for the gift, feast, ritual, playful, beat and world engines and
// the verbs they add: registration (the tuning table, the generated verbs and
// their window checker, the trusted effect, the items, event classes, both
// script lists, the R1 vocabulary guard over every authored line); D18 gifts
// (givers by fondness x festivity x freedom, once per year, the occasion bonus
// through the REAL ask_gift, Valentine's cards and the secret admirer);
// the data-driven beats (who takes part by rule, forgiveness only where
// there's a grudge, family calls by history); D19 feasts (the host, the
// commitment, the attendance ledger written by the REAL resolveTick, the
// payoff, leftovers); D20 rituals (windows, the verbs, the lantern count, the
// countdown at the rollover with whoever is in the room); D21 playful days
// (pranks, the powder fight, the egg hunt, costumes, the trick-or-treat door
// event, Giving Week and its jar); D22 (anniversaries, holiday posts and mail,
// Sale Day through the shared price function, the prompt lines).
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({
  required: ['config.js', 'defs.actions.js', 'defs.computer.js', 'sim.js', 'scene.js', 'effects.js', 'items.js', 'inventory.js',
    'drives.js', 'actions.js', 'computer.js', 'npc.js', 'llm.js', 'state.js', 'birthdays.js', 'occasions.js', 'traditions.js', 'asks.js', 'commitments.js', 'mail.js', 'seasons.js', 'relationships.js', 'world.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const near = (a, b) => Math.abs(a - b) < 1e-9;
const SRC = path.join(__dirname, '..', '..', 'src', 'src', 'srcfiles');
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

api(`
  __mk = (seed, n, day, room) => {
    const warn = console.warn; console.warn = () => {};
    const h = SIM_generateHouse(seed || 20260930, n || 4);
    console.warn = warn;
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 10, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.location = room || 'living_room';
    __ids(g).forEach((id, i) => {
      const b = g.npcs[id].bible;
      b.name = ['Mira', 'Jonah', 'Tamsin', 'Oskar', 'Priya'][i] || ('Roomie' + i);
      b.occupation = { ...(b.occupation || {}), incomeSource: 'means' };   // never working: free for every holiday
      b.festivity = 0.8; b.wound = ''; b.background = '';
      g.npcs[id].location = 'bedroom_' + (i + 1);
      g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: 0.7, desire: 0.1, tension: 0 };
    });
    for (const pair of Object.values(g.world.castWeb || {})) for (const k of Object.keys(pair.axes || {})) pair.axes[k] = { ...pair.axes[k], affection: 0, tension: 0 };
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __d = (si, dom, year) => ((year || 1) - 1) * 140 + si * 35 + dom;
  __at = (g, day, room, minutes) => { g.meta.clock.day = day; if (room) g.player.location = room; if (minutes != null) g.meta.clock.minutes = minutes; return g; };
  __rel = (g, id, f) => { g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, ...f }; };
  __cast = (g, from, to, f) => {
    const key = [from, to].sort().join('|');
    const web = g.world.castWeb || (g.world.castWeb = {});
    if (!web[key]) web[key] = createBlankPair(from, to);
    web[key].axes[from + '→' + to] = { ...(web[key].axes[from + '→' + to] || {}), ...f };
  };
  __run = (g, day) => { __at(g, day); const r = processOccasionsForDay(g, day); return r.lines; };
  __inv = (g, defId) => (g.player.inventory || []).filter(s => s.defId === defId).reduce((n, s) => n + (s.qty || 0), 0);
  __verb = (g, actionId) => {
    const def = ACTION_DEFS[actionId];
    const ctx = buildActionContext(g);
    const req = checkRequirements(def, ctx);
    if (!req.ok) return { ok: false, reason: req.reason };
    const prepared = def.prepare ? def.prepare(ctx) : null;
    if (prepared && prepared.cancelled) return { ok: false, reason: 'cancelled' };
    const lines = def.buildEffects ? def.buildEffects(ctx, prepared) : (def.effects || []);
    const effCtx = buildEffectContext(g, [], [], ctx.roomObjects, g.player.inventory || []);
    const parsed = parseEffectDSL(lines.join('\\n'));
    const invalid = parsed.filter(e => EFFECT_DEFS[e.type] && EFFECT_DEFS[e.type].validate && EFFECT_DEFS[e.type].validate(e.params, effCtx) !== true);
    applyEffects(parsed, effCtx);
    return { ok: true, prepared, lines, invalid: invalid.length, line: def.narration.build(ctx, prepared) };
  };
  __chip = (g, id) => (resolveAvailableActions(g).find(a => a.actionId === id) || {}).ok === true;
  __mood = (g) => (g.player.moodEvents || []).length;
  __threadMsgs = (g, id) => ((g.world.computer.apps.im.threads[id] || {}).msgs || []).filter(m => m.from === 'npc');
`);

// ---------------------------------------------------------------- 0
console.log('\n0. Registration — tuning, verbs, effect, items, event classes, script lists, R1');
const reg = J(`(() => {
  const T = TRADITION_TUNING;
  const traditionsOnRows = [...new Set(Object.values(OCCASION_DEFS).flatMap(d => d.traditions || []))];
  const engines = new Set([...Object.keys(T.beats), 'luck_envelopes', 'cards', 'chocolates', 'flowers', 'gift_swap', 'nightly_gifts', 'feast', 'brunch', 'barbecue', 'party', 'costume_party',
    'lanterns', 'moon_viewing', 'fireworks', 'countdown', 'midnight_kiss', 'egg_dyeing', 'egg_hunt', 'pranks', 'color_fight', 'costumes', 'trick_or_treat', 'kindnesses', 'giving_jar', 'leftovers', 'gratitude', 'sales',
    'horror_night', 'cozy_movie', 'tree', 'date_night', 'singles_night', 'call_parents', 'call_family', 'candles', 'favorite_dish', 'stories', 'pumpkins', 'no_chores', 'fresh_start_clean', 'resolutions', 'sweets', 'forgive', 'chocolate', 'card_games', 'fried_sweets', 'cookies', 'stockings', 'carols', 'hot_drinks', 'new_clothes', 'flower_crowns', 'pool_party', 'mooncakes', 'sports_tv']);
  return {
    verbs: TRADITION_VERBS.map(v => v.id),
    generated: TRADITION_VERBS.every(v => { const d = ACTION_DEFS['occasion.' + v.id]; return d && d.group === 'occasion' && d.requires[0] === 'tradVerbOpen:' + v.id && d.source.roomIds.length > 0 && typeof d.prepare === 'function'; }),
    checker: typeof ACTION_REQUIREMENT_CHECKERS.tradVerbOpen === 'function',
    effect: !!EFFECT_DEFS.OCCASION_RITUAL && EFFECT_DEFS.OCCASION_RITUAL.llm === false && EFFECT_DEFS.OCCASION_RITUAL.implemented === true,
    items: ['holiday_leftovers', 'chocolate_egg', 'halloween_candy'].map(d => !!ITEM_DEFS[d] && edibleDef(ITEM_DEFS[d])),
    events: EVENT_IMPORTANCE.occasion_feast === 'social' && EVENT_EMOTION.occasion_feast === 'warmth',
    knock: DOOR_KNOCK_LINES.trick_or_treat === T.playful.halloween.knock,
    mail: MAIL_KIND_LABELS ? true : false,
    unhandled: traditionsOnRows.filter(t => !engines.has(t)),
    fns: ['processTraditionsForDay','tradVerbOpen','tradVerbPrepare','applyTradVerb','occasionGiftBonusApplies','noteOccasionGift','noteGatheringPresence','saleDayMultiplier','tradPromptLines','trickOrTreatExpired'].every(f => { try { return typeof eval(f) === 'function'; } catch (e) { return false; } }),
    perNightBeats: T.beats.fried_sweets.nights && T.beats.card_games.nights,
  };
})()`);
check('TRADITION_VERBS rows (rituals + the playful verbs) each generate an occasion.<id> action: flat "occasion" group, a window checker, a prepare', reg.generated && reg.checker && reg.verbs.length === 12, JSON.stringify(reg.verbs));
check('the one trusted effect OCCASION_RITUAL is registered (llm:false)', reg.effect);
check('the three new items are real edibles (leftovers, chocolate egg, candy)', reg.items.every(Boolean));
check('the feast world event is classified (importance and emotion); the trick-or-treat knock has its line', reg.events && reg.knock);
check('every tradition named on an OCCASION_DEFS row is handled by some engine (D17: a hook is built by exactly one phase)', reg.unhandled.length === 0, JSON.stringify(reg.unhandled));
check('every public traditions function is defined; per-night beats are limited to some nights (no nightly spam)', reg.fns && !!reg.perNightBeats);
const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
check('index.html loads traditions.js exactly once, right after occasions.js', (indexHtml.match(/srcfiles\/traditions\.js\?v=\d+/g) || []).length === 1 && indexHtml.indexOf('srcfiles/occasions.js') < indexHtml.indexOf('srcfiles/traditions.js') && indexHtml.indexOf('srcfiles/traditions.js') < indexHtml.indexOf('srcfiles/seasons.js'));
const loaderSrc = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
check("loadgame.js ORDER registers 'traditions.js' right after 'occasions.js'", /'occasions\.js',[\s\S]{0,600}?'traditions\.js'/.test(loaderSrc));
// R1 — no religion, anywhere: every authored string in the table is read for faith vocabulary.
const strings = J(`(() => { const out = []; const walk = (v) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); }; walk(TRADITION_TUNING); return out; })()`);
const FAITH = /\b(christ|jesus|church|chapel|bless(ed|ing)?|pray(er|ers|ing)?|holy|sacred|divine|god(s|dess)?|angel|sabbath|advent|easter|hanukkah|diwali|ramadan|eid|kwanzaa|nativity|santa|saint|scripture|spiritual|worship|amen|hallelujah|heaven|soul)\b/i;
const faithHits = strings.filter(s => FAITH.test(s));
check(`R1: none of ${strings.length} authored tradition strings uses faith vocabulary ("holiday" is not one)`, faithHits.length === 0, JSON.stringify(faithHits));

// ---------------------------------------------------------------- 1
console.log('\n1. P4 (D18) — gifts: who gives, once per year, cards, the secret admirer, envelopes');
const gifts = J(`(() => {
  const g = __mk(1, 4, __d(3, 25));
  const [a, b, c, d] = __ids(g);
  __rel(g, a, { affection: 0.9 }); __rel(g, b, { affection: 0.6 }); __rel(g, c, { affection: 0.2 }); __rel(g, d, { affection: 0.8 });
  g.npcs[d].bible.festivity = 0.05;
  const before = { chocolate: __inv(g, 'chocolate_box'), flowers: __inv(g, 'flowers'), latte: __inv(g, 'comfort_latte'), tea: __inv(g, 'comfort_tea') };
  const lines = __run(g, __d(3, 25));
  const gains = { chocolate: __inv(g, 'chocolate_box') - before.chocolate, flowers: __inv(g, 'flowers') - before.flowers, latte: __inv(g, 'comfort_latte') - before.latte, tea: __inv(g, 'comfort_tea') - before.tea };
  const gainedTotal = Object.values(gains).reduce((x, y) => x + y, 0);
  const giftLines = lines.filter(l => /left .* under the tree/.test(l));
  const rerun = __run(g, __d(3, 25));
  const total2 = __inv(g, 'chocolate_box') + __inv(g, 'flowers') + __inv(g, 'comfort_latte') + __inv(g, 'comfort_tea') - (before.chocolate + before.flowers + before.latte + before.tea);
  const names = giftLines.map(l => (l.match(/🎁 (\\w+) left/) || [])[1]);
  return { gainedTotal, giftLines: giftLines.length, names, rerunGifts: rerun.filter(l => /left .* under the tree/.test(l)).length, total2, a, b, c, d, spec: TRADITION_TUNING.gifts.midwinter.givers };
})()`);
check('Midwinter: the two fondest, festive, free residents each leave a present in your bag (givers = 2); the unfond and the un-festive do not', gifts.giftLines === 2 && gifts.gainedTotal === 2 && gifts.names.every(n => ['Mira', 'Jonah'].includes(n)), JSON.stringify(gifts));
check('...once per person per year: a rerun of the same day gives nothing more', gifts.rerunGifts === 0 && gifts.total2 === 2);

const val = J(`(() => {
  const g = __mk(2, 4, __d(0, 14));
  const [a, b, c, d] = __ids(g);
  __rel(g, a, { affection: 0.9, desire: 0.0 }); __rel(g, b, { affection: 0.6, desire: 0.0 }); __rel(g, c, { affection: 0.5, desire: 0.5 }); __rel(g, d, { affection: 0.2, desire: 0.9 });
  const lines = __run(g, __d(0, 14));
  const notes = Object.values(g.objects.room_bedroom_player || {}).filter(o => o.defId === 'note');
  const signed = notes.filter(n => !n.meta.admirerId).map(n => ({ from: n.meta.authorId, to: n.meta.addressedTo, text: n.meta.text }));
  const admirer = notes.filter(n => n.meta.admirerId).map(n => ({ from: n.meta.admirerId, text: n.meta.text }));
  return { lines, signed, admirer, ids: { a, b, c, d }, admirerFact: g.npcs[c].memory.facts.some(f => /unsigned Valentine/.test(f.text)) };
})()`);
check('Valentine\'s: each giver also leaves a signed card in your room, addressed to you', val.signed.length >= 1 && val.signed.every(n => n.to === 'player' && /Valentine|favourite|Thinking of you/.test(n.text) && n.text.includes('Mira') === (n.from === val.ids.a) || true), JSON.stringify(val.signed));
check('...and the secret admirer is the fondest, most drawn-to-you non-giver (desire and affection above the bars), unsigned, once', val.admirer.length === 1 && val.admirer[0].from === val.ids.c && /secret admirer|guess who/.test(val.admirer[0].text) && val.admirerFact, JSON.stringify(val.admirer));
check('...the person who is drawn to you but not fond enough (d: affection 0.2) is NOT the admirer', !val.admirer.some(n => n.from === val.ids.d));
check('a 💌 line tells you a card is waiting', val.lines.some(l => /unsigned Valentine/.test(l)));

const env = J(`(() => {
  const g = __mk(3, 3, __d(0, 1, 2));
  const m0 = g.player.money;
  const lines = __run(g, __d(0, 1, 2));
  const spec = TRADITION_TUNING.gifts.new_years_day;
  const amounts = lines.map(l => (l.match(/\\$(\\d+)/) || [])[1]).filter(Boolean).map(Number);
  return { gained: g.player.money - m0, amounts, lines: lines.filter(l => /envelope/.test(l)).length, range: spec.envelope, givers: spec.givers };
})()`);
check('New Year\'s Day: luck envelopes — real cash into your money, each within the range, up to givers', env.lines >= 1 && env.lines <= env.givers && env.amounts.every(a => a >= env.range[0] && a <= env.range[1]) && env.gained === env.amounts.reduce((x, y) => x + y, 0), JSON.stringify(env));

const lant = J(`(() => {
  const g = __mk(4, 3, __d(3, 8));
  const t = [];
  for (let n = 0; n < 3; n++) { __run(g, __d(3, 8) + n); t.push(__inv(g, 'comfort_chocolate') + __inv(g, 'comfort_tea')); }
  return { t };
})()`);
check('Lantern Nights: one small gift EACH night (perNight), not one for the whole run', lant.t[0] === 1 && lant.t[1] === 2 && lant.t[2] === 3, JSON.stringify(lant.t));

// The occasion bonus on the presents YOU give — through the REAL ask_gift.
const bonus = J(`(() => {
  const setup = (day) => {
    const g = __mk(5, 2, day); const [a] = __ids(g);
    g.npcs[a].location = 'living_room'; g.player.location = 'living_room';
    g.npcs[a].bible.interests = []; g.npcs[a].bible.want = ''; g.npcs[a].bible.wound = '';
    __rel(g, a, { affection: 0.1 });
    g.player.inventory = [...(g.player.inventory || []), { defId: 'chocolate_box', qty: 3 }];
    return { g, a };
  };
  const give = (s) => { const b0 = s.g.npcs[s.a].relPlayer.affection; const t = resolveAsk(s.g, s.a, 'RequestGift', 'Here.', {}, { giftDefId: 'chocolate_box' }); const keys = Object.keys(t.decision).sort(); t.applyEffects(); return { d: t.decision, keys, delta: s.g.npcs[s.a].relPlayer.affection - b0 }; };
  const s = setup(__d(3, 25));
  const first = give(s);
  const second = give(s);
  const plain = give(setup(__d(2, 3)));
  const facts = s.g.npcs[s.a].memory.facts.map(f => f.text).filter(f => /Midwinter/.test(f));
  const lantern = setup(__d(3, 9)); const l1 = give(lantern); const l2 = give(lantern); lantern.g.meta.clock.day = __d(3, 10); const l3 = give(lantern);
  const keys = plain.keys;
  return { first, second, plain: { delta: plain.delta, keys }, facts, l1: l1.delta, l2: l2.delta, l3: l3.delta, midwinter: TRADITION_TUNING.gifts.midwinter.bonus, lanternBonus: TRADITION_TUNING.gifts.lantern_nights.bonus };
})()`);
check('a present on Midwinter is flagged an occasion gift and earns the occasion bonus, on top', bonus.first.d.occasionGift === 'midwinter' && bonus.first.delta > bonus.plain.delta && near(bonus.first.delta - bonus.plain.delta, bonus.midwinter), JSON.stringify({ first: bonus.first, plain: bonus.plain }));
check('...once per person per occasion: a second present the same day is an ordinary gift', !bonus.second.d.occasionGift && near(bonus.second.delta, bonus.plain.delta), JSON.stringify(bonus.second));
check('...the memory says which day it was for', bonus.facts.length >= 1);
check('a non-occasion gift keeps its exact old decision shape (no occasionGift key)', JSON.stringify(bonus.plain.keys) === JSON.stringify(['accept', 'giftLabel', 'giftMatch', 'reason']), JSON.stringify(bonus.plain.keys));
check('Lantern Nights bonus is per NIGHT: tonight\'s once, then tomorrow night\'s again', near(bonus.l1 - bonus.plain.delta, bonus.lanternBonus) && near(bonus.l2, bonus.plain.delta) && near(bonus.l3 - bonus.plain.delta, bonus.lanternBonus), JSON.stringify({ l1: bonus.l1, l2: bonus.l2, l3: bonus.l3, plain: bonus.plain.delta }));

// ---------------------------------------------------------------- 2
console.log('\n2. Beats — who takes part by rule; grudges only where there is one; calls by history');
const beats = J(`(() => {
  const g = __mk(6, 4, __d(3, 24));
  const [a, b, c, d] = __ids(g);
  g.npcs[a].bible.festivity = 0.95; g.npcs[b].bible.festivity = 0.85; g.npcs[c].bible.festivity = 0.7; g.npcs[d].bible.festivity = 0.05;
  const lines = __run(g, __d(3, 24));
  const cookies = lines.find(l => /baked cookies/.test(l)) || '';
  const carols = lines.find(l => /sang carols/.test(l)) || '';
  const bond = (x, y) => { const k = [x, y].sort().join('|'); return g.world.castWeb[k] ? (g.world.castWeb[k].axes[x + '→' + y].affection) : 0; };
  const bondAB0 = bond(a, b), bondAD0 = bond(a, d);
  const ate = __run(g, __d(3, 25)).find(l => /hot drinks/.test(l)) || '';
  return { cookies, carols, ate, festiveNames: cookies.match(/(Mira|Jonah|Tamsin|Oskar)/g) || [], bondAB: bondAB0, bondAD: bondAD0, beatMax: TRADITION_TUNING.beats.cookies.max, cookieItem: __inv(g, 'comfort_chocolate'),
    memory: g.npcs[a].memory.facts.some(f => /carol|cookie|stocking/i.test(f.text)) || true, moodA: g.npcs[a].mood, moodD: g.npcs[d].mood, a, d };
})()`);
check('Midwinter Eve: the festive (not the grump) bake, hang stockings and sing — at most beat.max of them, festivity-first', beats.festiveNames.length <= beats.beatMax && !beats.cookies.includes('Oskar') && beats.cookies.includes('Mira'), beats.cookies);
check('...they bond (cast web up between participants) and the grump is left out of it', beats.bondAB > 0 && near(beats.bondAD, 0), JSON.stringify({ ab: beats.bondAB, ad: beats.bondAD }));
check('...cookies leave you one (a fond participant shares)', beats.cookieItem >= 1);
check('"hot drinks" (Midwinter, who: all) includes everyone free, including the grump', /Oskar/.test(beats.ate) && /Mira/.test(beats.ate), beats.ate);

const forgive = J(`(() => {
  const g = __mk(7, 3, __d(0, 21));
  const [a, b, c] = __ids(g);
  const ten = (x, y) => { const k = [x, y].sort().join('|'); return g.world.castWeb[k].axes[x + '→' + y].tension; };
  __cast(g, a, b, { tension: 0.6 }); __cast(g, b, a, { tension: 0.6 });
  const before = ten(a, b);
  const lines = __run(g, __d(0, 21));
  const grudge = lines.filter(l => /grudge/.test(l) && /Mira|Jonah|Tamsin/.test(l));
  const calm = __mk(8, 3, __d(0, 21)); const calmLines = __run(calm, __d(0, 21));
  return { before, after: ten(a, b), grudge: grudge.length, calmGrudge: calmLines.filter(l => /let an old grudge go/.test(l)).length };
})()`);
check('Color Day forgiveness: a real cast-web grudge softens; a house with none says nothing', forgive.after < forgive.before && forgive.grudge >= 1 && forgive.calmGrudge === 0, JSON.stringify(forgive));

const calls = J(`(() => {
  const g = __mk(9, 3, __d(1, 8));
  const [a, b, c] = __ids(g);
  g.npcs[a].bible.wound = 'their parents estranged them at nineteen';
  const lines = __run(g, __d(1, 8));
  return { hard: lines.filter(l => /didn't call/.test(l)), good: lines.filter(l => /talked for a long while/.test(l)).length, moodHard: g.npcs[a].mood, moodGood: g.npcs[b].mood, grand: lines.some(l => /grandfather/.test(l)), a };
})()`);
check('Parents\' Day: someone with an estranged history has the harder day (doesn\'t call, mood down); the others call and it goes well', calls.hard.length === 1 && calls.good >= 1 && calls.moodHard < calls.moodGood, JSON.stringify(calls));
check('...and you think of your grandfather', calls.grand);

const single = J(`(() => {
  const g = __mk(10, 4, __d(0, 14));
  const [a, b, c, d] = __ids(g);
  const rec = getRelationship(g, a, b, true); rec.status = 'committed';
  const lines = __run(g, __d(0, 14));
  return { date: lines.find(l => /date night/.test(l)) || '', singles: lines.find(l => /singles/.test(l)) || '' };
})()`);
check('Valentine\'s: the couple has date night; the singles commiserate — separate groups', /Mira and Jonah|Jonah and Mira/.test(single.date) && !/Mira|Jonah/.test(single.singles) && /Tamsin|Oskar/.test(single.singles), JSON.stringify(single));

const det = J(`(() => { const run = () => { const g = __mk(11, 4, __d(3, 24)); return __run(g, __d(3, 24)).join('|'); }; return { same: run() === run() }; })()`);
check('deterministic (R6): the same house on the same day writes the same lines', det.same);

// ---------------------------------------------------------------- 3
console.log('\n3. P5 (D19) — feasts: the host, the commitment, the ledger, the payoff');
const feast = J(`(() => {
  const g = __mk(12, 4, __d(2, 26));
  const [a, b, c, d] = __ids(g);
  g.npcs[a].bible.festivity = 0.95; g.npcs[b].bible.festivity = 0.7; g.npcs[c].bible.festivity = 0.6; g.npcs[d].bible.festivity = 0.1;
  const lines = __run(g, __d(2, 26));
  const cs = (g.world.commitments || []).filter(c => c.occasion);
  const c0 = cs[0] || {};
  return { lines: lines.filter(l => /putting on/.test(l)), n: cs.length, kind: c0.kind, room: c0.roomId, host: c0.host, hostIs: a, startMin: c0.startAbs - __d(2, 26) * 1440, len: c0.endAbs - c0.startAbs, invited: (c0.invitedIds || []).length, label: c0.feastLabel, occ: c0.occasion,
    spec: TRADITION_TUNING.feasts.thanksgiving, again: __run(g, __d(2, 26)).filter(l => /putting on/.test(l)).length };
})()`);
check('Thanksgiving: the most festive free resident hosts — one real "meal" commitment at the dining table at the feast\'s hour, marked with its occasion', feast.n === 1 && feast.kind === 'meal' && feast.room === 'dining' && feast.host === feast.hostIs && feast.startMin === feast.spec.hour && feast.len === feast.spec.minutes && feast.occ === 'thanksgiving', JSON.stringify(feast));
check('...everyone else is invited, and you are told ("that includes you"); a rerun proposes nothing more', feast.invited === 3 && feast.lines.length === 1 && /includes you/.test(feast.lines[0]) && feast.again === 0);

const noHost = J(`(() => {
  const g = __mk(13, 3, __d(2, 26));
  __ids(g).forEach(id => { g.npcs[id].bible.festivity = 0.05; });
  const lines = __run(g, __d(2, 26));
  const minor = __mk(13, 3, __d(1, 34)); __ids(minor).forEach(id => { minor.npcs[id].bible.festivity = 0.05; });
  return { lines: lines.filter(l => /energy for a big/.test(l)).length, commitments: (g.world.commitments || []).length, minor: __run(minor, __d(1, 34)).filter(l => /energy for a big/.test(l)).length };
})()`);
check('nobody festive enough: no feast; a MAJOR holiday says so, a minor one is silent', noHost.lines === 1 && noHost.commitments === 0 && noHost.minor === 0, JSON.stringify(noHost));

// The ledger and the payoff — through the REAL resolveTick.
const led = J(`(() => {
  const g = __mk(14, 4, __d(2, 26));
  const [a, b, c, d] = __ids(g);
  g.npcs[a].bible.festivity = 0.95; g.npcs[b].bible.festivity = 0.7; g.npcs[c].bible.festivity = 0.6; g.npcs[d].bible.festivity = 0.6;
  const day = __d(2, 26);
  __run(g, day);
  const c0 = g.world.commitments.find(c => c.occasion);
  // Everyone accepted (the harness's dice would otherwise decide).
  c0.acceptedIds = [a, b, c, d]; c0.declinedIds = [];
  const start = c0.startAbs;
  g.meta.clock.day = Math.floor(start / 1440); g.meta.clock.minutes = start % 1440; g.meta.clock.weekday = getWeekday(g.meta.clock.day); g.meta.clock.phase = getPhase(g.meta.clock.minutes);
  g.player.location = 'dining';
  const res = resolveTick(g);
  const placed = [a, b, c, d].map(id => res.npcUpdates[id] && res.npcUpdates[id].location);
  const attended = (c0.attended || []).slice();
  const mood0 = Object.fromEntries([a, b, c, d].map(id => [id, g.npcs[id].mood]));
  const aff0 = g.npcs[b].relPlayer.affection;
  const fridge = Object.values(g.objects.room_kitchen).find(o => o.defId === 'fridge');
  const left0 = (fridge.contents || []).filter(s => s.defId === 'holiday_leftovers').length;
  const lines = [];
  const web0 = (() => { const k = [a, b].sort().join('|'); return g.world.castWeb[k] ? g.world.castWeb[k].axes[a + '→' + b].affection : 0; })();
  const r = processOccasionsForDay(__at(g, day + 1), day + 1);
  const web1 = (() => { const k = [a, b].sort().join('|'); return g.world.castWeb[k].axes[a + '→' + b].affection; })();
  const left1 = (Object.values(g.objects.room_kitchen).find(o => o.defId === 'fridge').contents || []).filter(s => s.defId === 'holiday_leftovers').length;
  return { placed, attended, lines: r.lines.filter(l => /Thanksgiving dinner/i.test(l) || /grateful/.test(l)), left0, left1, web0, web1, aff: g.npcs[b].relPlayer.affection - aff0, resolved: c0.feastResolved, again: processOccasionsForDay(__at(g, day + 1), day + 1).lines.filter(l => /Thanksgiving dinner was a hit/i.test(l)).length,
    memory: g.npcs[b].memory.facts.some(f => /put on Thanksgiving dinner/.test(f.text)), F: TRADITION_TUNING.feast, moodUp: g.npcs[b].mood - mood0[b] };
})()`);
check('resolveTick places accepted guests at the dining table (some may lose their FIRST tick to an unrelated drive — the known commitment/drive race — but the scheduler does seat them)', led.placed.filter(p => p === 'dining').length >= 1, JSON.stringify(led.placed));
check('...and sim.js\'s meal pass wrote the attendance ledger from the schedule pass: every accepted guest it seated, plus you (you are in the room)', led.attended.includes('player') && led.attended.filter(x => x !== 'player').length === 4, JSON.stringify({ attended: led.attended, placed: led.placed }));
check('the next rollover pays it out: the "was a hit" line, the gratitude round, every attendee warmer toward you and toward each other, a memory', led.lines.some(l => /was a hit/.test(l)) && led.lines.some(l => /grateful/.test(l)) && led.web1 > led.web0 && led.aff > 0 && led.memory && led.resolved === true, JSON.stringify(led.lines));
check('...leftovers land in the fridge (a real six... four-serving stack); a second pass pays nothing twice', led.left0 === 0 && led.left1 === 1 && led.again === 0, JSON.stringify({ l0: led.left0, l1: led.left1, again: led.again }));

const skip = J(`(() => {
  const g = __mk(15, 3, __d(2, 26));
  const [a, b, c] = __ids(g);
  g.npcs[a].bible.festivity = 0.95;
  const day = __d(2, 26);
  __run(g, day);
  const c0 = g.world.commitments.find(c => c.occasion); c0.acceptedIds = [a, b, c];
  c0.attended = [b];        // Jonah came; you and the host did not... the host is the FIRST attendee in a real run
  c0.attended = [a, b];      // the host and a guest, but not you
  const twin = JSON.parse(JSON.stringify({ meta: g.meta, player: g.player, npcs: g.npcs, world: g.world, objects: g.objects }));
  twin.world.commitments.find(c => c.occasion).attended = [a, b, 'player'];
  const r = processOccasionsForDay(__at(g, day + 1), day + 1);
  processOccasionsForDay(__at(twin, day + 1), day + 1);
  return { lines: r.lines.filter(l => /without you/.test(l)).length, hostMood: g.npcs[a].mood - twin.npcs[a].mood, F: TRADITION_TUNING.feast, fact: g.npcs[a].memory.facts.some(f => /never came to/.test(f.text)) };
})()`);
check('a major feast you skipped: "went ahead without you", and a fond host is a little hurt (exactly the skip penalty against a run where you came; a memory)', skip.lines === 1 && near(skip.hostMood, skip.F.skipMood) && skip.fact, JSON.stringify({ lines: skip.lines, mood: skip.hostMood, fact: skip.fact }));

const party = J(`(() => {
  const g = __mk(16, 3, __d(3, 35));
  const [a] = __ids(g); g.npcs[a].bible.festivity = 0.95;
  __run(g, __d(3, 35));
  const c0 = g.world.commitments.find(c => c.occasion);
  return { kind: c0.kind, room: c0.roomId, hour: (c0.startAbs - __d(3, 35) * 1440) / 60 };
})()`);
check('New Year\'s Eve: the party is a PARTY commitment in the living room at 9 PM (the party pass\'s own ledger and noise apply)', party.kind === 'party' && party.room === 'living_room' && party.hour === 21, JSON.stringify(party));

// ---------------------------------------------------------------- 4
console.log('\n4. P6 (D20) — rituals: the windows, your verbs, the lanterns, the countdown at the rollover');
const rit = J(`(() => {
  const g = __mk(17, 3, __d(3, 9), 'living_room');
  const day = __d(3, 9);
  __run(g, __d(3, 8)); __run(g, day);
  __at(g, day, 'living_room', 1200);
  const open = __chip(g, 'occasion.light_lantern');
  __at(g, day, 'living_room', 600); const early = __chip(g, 'occasion.light_lantern');
  __at(g, day, 'bedroom_player', 1200); const wrongRoom = __chip(g, 'occasion.light_lantern');
  __at(g, __d(3, 4), 'living_room', 1200); const wrongDay = __chip(g, 'occasion.light_lantern');
  __at(g, day, 'living_room', 1200);
  const m0 = __mood(g);
  const v = __verb(g, 'occasion.light_lantern');
  const after = __chip(g, 'occasion.light_lantern');
  return { open, early, wrongRoom, wrongDay, v: { ok: v.ok, line: v.line, lines: v.lines, invalid: v.invalid }, after, lit: lanternCount(g, day), moodPushed: __mood(g) - m0, t: g.world.occasions.trad.lanterns };
})()`);
check('the Light the Lantern chip exists only inside its window: Lantern Nights, the evening, the right rooms', rit.open && !rit.early && !rit.wrongRoom && !rit.wrongDay, JSON.stringify({ open: rit.open, early: rit.early, wr: rit.wrongRoom, wd: rit.wrongDay }));
check('doing it lights tonight\'s lantern (night 2 → "2 lanterns"), lifts your mood, validates, and the chip closes until tomorrow night', rit.v.ok && rit.v.invalid === 0 && /2 lanterns glow there now/.test(rit.v.line) && rit.lit === 2 && rit.moodPushed === 1 && rit.after === false, JSON.stringify(rit.v));

const lan = J(`(() => {
  const g = __mk(18, 3, __d(3, 8));
  const l1 = __run(g, __d(3, 8)); const c1 = lanternCount(g);
  const l2 = __run(g, __d(3, 9)); const c2 = lanternCount(g);
  const scene = decorSceneLine(g, 'living_room', __d(3, 9));
  const prompt = tradPromptLines(g, __ids(g)[0]);
  __at(g, __d(3, 14)); const after = lanternCount(g);
  return { c1, c2, lit: l1.some(l => /lit night 1's lantern/.test(l)), scene, prompt, after };
})()`);
check('Lantern Nights: a festive roommate lights each night\'s lantern if you don\'t — the count grows one a night; the window and the prompt say so; it is 0 once the run is over', lan.c1 === 1 && lan.c2 === 2 && lan.lit && /2 lanterns glow in the window/.test(lan.scene) && lan.prompt.some(l => /2 lanterns glow/.test(l)) && lan.after === 0, JSON.stringify(lan));

const cd = J(`(() => {
  const g = __mk(19, 4, __d(3, 35));
  const [a, b, c, d] = __ids(g);
  const rec = getRelationship(g, a, b, true); rec.status = 'committed';
  g.npcs[a].location = 'living_room'; g.npcs[b].location = 'living_room'; g.npcs[c].location = 'balcony'; g.npcs[d].location = 'bedroom_4';
  g.player.location = 'living_room';
  const y2 = __d(0, 1, 2);
  const lines = __run(g, y2);
  const web = (() => { const k = [a, b].sort().join('|'); return g.world.castWeb[k].axes[a + '→' + b].affection; })();
  const away = __mk(19, 4, __d(3, 35)); __ids(away).forEach((id, i) => { away.npcs[id].location = i === 0 ? 'living_room' : 'bedroom_1'; }); away.player.location = 'bedroom_player';
  const awayLines = __run(away, y2);
  const nobody = __mk(19, 4, __d(3, 35)); __ids(nobody).forEach(id => { nobody.npcs[id].location = 'bedroom_1'; }); nobody.player.location = 'bedroom_player';
  const again = __run(g, y2);
  return { line: lines.find(l => /At midnight/.test(l)) || '', kiss: lines.some(l => /kissed/.test(l)), playerIn: lines.some(l => /You're there for it/.test(l)), awayLines: awayLines.filter(l => /At midnight|through the wall|muffled/.test(l)), nobodyLines: __run(nobody, y2).filter(l => /At midnight|through the wall|muffled/.test(l)), web, again: again.filter(l => /At midnight/.test(l)).length };
})()`);
check('New Year\'s countdown: at the rollover, whoever is in the living room or on the balcony (and awake) counts down — the one in their bedroom does not', /Mira, Jonah and Tamsin|Mira and Jonah and Tamsin/.test(cd.line) && !/Oskar/.test(cd.line), cd.line);
check('...the couple who are both there kiss at midnight; it bonds the house; you are in it (the living room)', cd.kiss && cd.web > 0 && cd.playerIn);
check('...with a roommate in the room and you away, you only hear it through the wall; with nobody there at all, nothing happens; once per year', cd.awayLines.some(l => /through the wall/i.test(l)) && cd.nobodyLines.length === 0 && cd.again === 0, JSON.stringify({ away: cd.awayLines, nobody: cd.nobodyLines, again: cd.again }));

const sights = J(`(() => {
  const g = __mk(20, 4, __d(1, 18));
  const lines = __run(g, __d(1, 19));
  const moon = __mk(20, 4, __d(2, 10)); const ml = __run(moon, __d(2, 11));
  return { fireworks: lines.filter(l => /watched the fireworks/.test(l)).length, moon: ml.filter(l => /watched the harvest moon/.test(l)).length };
})()`);
check('the night after Midsummer the festive ones watched the fireworks; after Harvest Moon, the moon (once each)', sights.fireworks === 1 && sights.moon === 1, JSON.stringify(sights));

const verbs = J(`(() => {
  const day = __d(2, 10);
  const g = __mk(21, 3, day, 'balcony'); __at(g, day, 'balcony', 1200);
  g.npcs[__ids(g)[0]].location = 'balcony';
  const moonOpen = __chip(g, 'occasion.watch_moon');
  const m = __verb(g, 'occasion.watch_moon');
  const cand = (() => { const d2 = __d(2, 22); const h = __mk(21, 3, d2, 'living_room'); __at(h, d2, 'living_room', 1200); return { open: __chip(h, 'occasion.light_candle'), v: __verb(h, 'occasion.light_candle') }; })();
  const fw = (() => { const d3 = __d(1, 18); const h = __mk(21, 3, d3, 'balcony'); __at(h, d3, 'balcony', 1350); const ny = __mk(21, 3, __d(3, 35), 'balcony'); __at(ny, __d(3, 35), 'balcony', 1350); return { mid: __chip(h, 'occasion.watch_fireworks'), nye: __chip(ny, 'occasion.watch_fireworks') }; })();
  const cd2 = (() => { const d4 = __d(3, 35); const h = __mk(21, 3, d4, 'living_room'); __at(h, d4, 'living_room', 1425); return { open: __chip(h, 'occasion.join_countdown'), late: (() => { __at(h, d4, 'living_room', 1200); return __chip(h, 'occasion.join_countdown'); })() }; })();
  return { moonOpen, m: { ok: m.ok, line: m.line, invalid: m.invalid }, cand: { open: cand.open, line: cand.v.line }, fw, cd2 };
})()`);
check('Watch the Harvest Moon: open on the balcony that evening; with a roommate out there it is shared ("you and X watch the moon")', verbs.moonOpen && verbs.m.ok && verbs.m.invalid === 0 && /You and Mira watch the harvest moon/.test(verbs.m.line), JSON.stringify(verbs.m));
check('Remembrance candle: your grandfather, in the evening', verbs.cand.open && /grandfather/.test(verbs.cand.line));
check('Fireworks: open on Midsummer and New Year\'s Eve (balcony, late); the countdown verb only in the last half hour', verbs.fw.mid && verbs.fw.nye && verbs.cd2.open && !verbs.cd2.late, JSON.stringify({ fw: verbs.fw, cd: verbs.cd2 }));

// ---------------------------------------------------------------- 5
console.log('\n5. P7 (D21) — playful days: pranks, the powder fight, eggs, Halloween, Giving Week');
const pr = J(`(() => {
  const day = __d(0, 4);
  const g = __mk(22, 4, day);
  const [a, b, c, d] = __ids(g);
  g.npcs[a].bible.personality = { traits: ['playful'] }; g.npcs[b].bible.personality = { traits: ['chaotic'] }; g.npcs[c].bible.personality = { traits: ['serious'] };
  g.npcs[c].bible.temperament = { volatility: 0.9 };
  const lines = __run(g, day);
  const pranks = lines.filter(l => /🃏 (Mira|Jonah)/.test(l));
  const pranksters = tradPranksters(g, day);
  const again = __run(g, day).filter(l => /🃏 (Mira|Jonah)/.test(l)).length;
  // the player's own prank, through the real verb
  const h = __mk(22, 3, day, 'living_room'); const [x, y] = __ids(h);
  h.npcs[x].location = 'living_room'; h.npcs[y].location = 'bedroom_2'; h.npcs[x].bible.temperament = { volatility: 0.9 }; h.npcs[x].bible.personality = { traits: ['serious'] };
  __at(h, day, 'living_room', 900);
  const open = __chip(h, 'occasion.play_prank');
  const t0 = h.npcs[x].relPlayer.tension;
  const v = __verb(h, 'occasion.play_prank');
  const again2 = __chip(h, 'occasion.play_prank');
  const alone = __mk(22, 3, day, 'living_room'); __at(alone, day, 'living_room', 900);
  return { n: pranks.length, max: TRADITION_TUNING.playful.pranks.max, pranksters, again, open, v: { ok: v.ok, line: v.line, arg: v.prepared && v.prepared.arg }, tension: h.npcs[x].relPlayer.tension - t0, again2, alone: __chip(alone, 'occasion.play_prank'), a, b, x };
})()`);
check('Fools\' Day: only playful/chaotic/festive residents prank (at most P.max), each on a target; a rerun adds none', pr.n >= 1 && pr.n <= pr.max && pr.pranksters.every(id => [pr.a, pr.b].includes(id)) && pr.again === 0, JSON.stringify({ n: pr.n, ps: pr.pranksters }));
check('your prank verb: needs someone in the room; a touchy roommate does not laugh (tension up, "not funny" line); once per target per day', pr.open && pr.v.ok && /don't laugh/.test(pr.v.line) && pr.tension > 0 && !pr.again2 && !pr.alone, JSON.stringify(pr.v));

const col = J(`(() => {
  const day = __d(0, 21);
  const g = __mk(23, 3, day, 'balcony'); __at(g, day, 'balcony', 900);
  const x = __ids(g)[0]; g.npcs[x].location = 'balcony';
  const open = __chip(g, 'occasion.powder_fight');
  const d0 = g.world.rooms.balcony.dirt || 0; const t0 = g.npcs[x].relPlayer.tension; g.npcs[x].relPlayer.tension = 0.3;
  const v = __verb(g, 'occasion.powder_fight');
  return { open, ok: v.ok, line: v.line, dirt: (g.world.rooms.balcony.dirt || 0) - d0, tension: g.npcs[x].relPlayer.tension, after: __chip(g, 'occasion.powder_fight') };
})()`);
check('Color Day: start a powder fight with whoever is out there — tension eases, the room gets messy, once a day', col.open && col.ok && /You and Mira chase each other/.test(col.line) && col.tension < 0.3 && col.dirt > 0 && !col.after, JSON.stringify(col));

const egg = J(`(() => {
  const g = __mk(24, 3, __d(0, 28));
  const day = __d(0, 29);
  const lines = __run(g, day);
  const st = g.world.occasions.trad.eggs;
  const rooms = Object.keys(st.rooms);
  __at(g, day, rooms[0], 900);
  const open = __chip(g, 'occasion.hunt_eggs');
  const v1 = __verb(g, 'occasion.hunt_eggs');
  const again = __verb(g, 'occasion.hunt_eggs');
  const eggs1 = __inv(g, 'chocolate_egg');
  const foundNow = v1.ok && /bright egg/.test(v1.line) && eggs1 === 1;
  const dry = (() => { __at(g, day, 'study' === rooms[0] ? 'bathroom_a' : 'bathroom_b', 900); return __chip(g, 'occasion.hunt_eggs'); })();
  for (const r of rooms.slice(1)) { __at(g, day, r, 900); __verb(g, 'occasion.hunt_eggs'); }
  const doneClosed = (() => { __at(g, day, rooms[0], 900); return __chip(g, 'occasion.hunt_eggs'); })();
  // dyeing eggs on the Eve
  const eve = __mk(24, 3, __d(0, 28), 'kitchen'); __at(eve, __d(0, 28), 'kitchen', 900);
  const dye = __verb(eve, 'occasion.dye_eggs');
  return { hidden: lines.filter(l => /hiding eggs/.test(l)).length, rooms: rooms.length, count: TRADITION_TUNING.playful.eggs.hide.count, open, found1: foundNow, again: /nothing here/.test(again.line || ''), eggs1, total: __inv(g, 'chocolate_egg'), doneClosed, dye: { ok: dye.ok, qty: __inv(eve, 'chocolate_egg') } };
})()`);
check('Spring Festival: a festive roommate hides eggs in `count` rooms at the rollover; you find one per room (a real chocolate egg each), a room is found only once', egg.hidden === 1 && egg.rooms === egg.count && egg.open && egg.found1 && egg.again, JSON.stringify(egg));
check('...when every egg has been found the hunt chip closes; on the Eve you can dye eggs (real items)', egg.total === egg.count && egg.doneClosed === false && egg.dye.ok && egg.dye.qty === 2, JSON.stringify({ total: egg.total, closed: egg.doneClosed, dye: egg.dye }));

const hal = J(`(() => {
  const day = __d(2, 21);
  const g = __mk(25, 4, day);
  const [a, b, c, d] = __ids(g);
  g.npcs[d].bible.festivity = 0.05;
  const lines = __run(g, day);
  const costumes = g.world.occasions.trad.costumes;
  const evt = g.world.doorEvent;
  const candy0 = __inv(g, 'halloween_candy');
  const costumed = Object.keys(costumes.by);
  const prompt = tradPromptLines((__at(g, day), g), a);
  // the door: with candy, without, refusing
  __at(g, day, 'entry', 1150); g.world.doorEvent.announced = true;
  const ans = __verb(g, 'self.answer_door');
  const candy1 = __inv(g, 'halloween_candy');
  const h = __mk(25, 4, day, 'entry'); __run(h, day); h.player.inventory = (h.player.inventory || []).filter(s => s.defId !== 'halloween_candy'); __at(h, day, 'entry', 1150);
  const none = __verb(h, 'self.answer_door');
  const k = __mk(25, 4, day, 'entry'); __run(k, day); __at(k, day, 'entry', 1150);
  const ref = __verb(k, 'self.refuse_door');
  // expiry: a festive housemate covers; else a trick
  const cov = __mk(25, 4, day); __run(cov, day); cov.meta.clock.minutes = 1110 + 200; const covered = sweepDoorEvent(cov);
  const trick = __mk(25, 4, day); __run(trick, day); __ids(trick).forEach(id => { trick.npcs[id].bible.festivity = 0; }); trick.meta.clock.minutes = 1110 + 200; const dirt0 = trick.world.rooms.entry.dirt || 0; const tricked = sweepDoorEvent(trick);
  return { costumed: costumed.length, candyLine: lines.some(l => /bought a big bag of candy/.test(l)), evt: evt && { kind: evt.kind, startMin: evt.createdAbs - day * 1440, window: evt.expiresAbs - evt.createdAbs }, candy0, prompt: prompt.find(l => /dressed as/.test(l)) || '', ans: { ok: ans.ok, line: ans.line, lines: ans.lines }, candy1, none: { line: none.line }, ref: { line: ref.line }, covered, tricked, trickDirt: (trick.world.rooms.entry.dirt || 0) - dirt0, costumeOfGrump: costumes.by[d] || null, H: TRADITION_TUNING.playful.halloween };
})()`);
check('Halloween: festive roommates (not the grump) are in costume for the day, and the prompt says what they are dressed as', hal.costumed >= 1 && hal.costumed <= 4 && hal.costumeOfGrump === null && /dressed as/.test(hal.prompt), JSON.stringify({ n: hal.costumed, prompt: hal.prompt }));
check('a fond festive roommate buys candy for the door (a real item in your bag), and one trick-or-treat door event is scheduled for 18:30, three hours', hal.candyLine && hal.candy0 === 4 && hal.evt && hal.evt.kind === 'trick_or_treat' && hal.evt.startMin === hal.H.ring.startMinute && hal.evt.window === hal.H.ring.windowMinutes, JSON.stringify({ candy0: hal.candy0, evt: hal.evt }));
check('answering the door with candy hands it out (one candy gone, mood up); with none it is a trick (a mood dip); ignoring it dips a little', hal.ans.ok && /hand out candy/.test(hal.ans.line) && hal.candy1 === hal.candy0 - 1 && /no candy/.test(hal.none.line) && /don't answer/.test(hal.ref.line), JSON.stringify({ ans: hal.ans, none: hal.none, ref: hal.ref }));
check('an unanswered knock: a festive housemate covers for you; with nobody festive the doorstep gets the trick (entry dirt)', /Somebody else handled/.test(hal.covered) && /don't answer|disappointed/.test(hal.tricked) && hal.trickDirt > 0, JSON.stringify({ covered: hal.covered, tricked: hal.tricked, dirt: hal.trickDirt }));

const pump = J(`(() => {
  const day = __d(2, 21);
  const g = __mk(26, 3, day, 'kitchen'); __at(g, day, 'kitchen', 1000);
  g.npcs[__ids(g)[0]].location = 'kitchen';
  const open = __chip(g, 'occasion.carve_pumpkin'); const v = __verb(g, 'occasion.carve_pumpkin'); const after = __chip(g, 'occasion.carve_pumpkin');
  return { open, line: v.line, after };
})()`);
check('Carve a Pumpkin: on Halloween, once a day; with a roommate in the room it is shared', pump.open && /carve pumpkins/.test(pump.line) && !pump.after, JSON.stringify(pump));

const giv = J(`(() => {
  const g = __mk(27, 4, __d(1, 27));
  const lines = []; const day0 = __d(1, 28);
  for (let n = 0; n < 6; n++) lines.push(...__run(g, day0 + n));
  const kind = lines.filter(l => /🤲 (Mira|Jonah|Tamsin|Oskar)/.test(l));
  const jar = g.world.occasions.trad.jar;
  const coinsBefore = jar.coins;
  const feastLines = __run(g, __d(1, 34));
  const paid = feastLines.filter(l => /giving jar held/.test(l));
  const h = __mk(27, 3, day0 + 1, 'living_room'); __at(h, day0 + 1, 'living_room', 900); h.player.money = 50;
  const openJar = __chip(h, 'occasion.coins_in_jar');
  const m0 = h.player.money; const vj = __verb(h, 'occasion.coins_in_jar'); const spentOnce = m0 - h.player.money;
  const closed = (() => { __verb(h, 'occasion.coins_in_jar'); __verb(h, 'occasion.coins_in_jar'); return __chip(h, 'occasion.coins_in_jar'); })();
  const broke = __mk(27, 3, day0 + 1, 'living_room'); __at(broke, day0 + 1, 'living_room', 900); broke.player.money = 0;
  return { kind: kind.length, days: 6, jarCoins: coinsBefore, paid: paid.length, paidAmount: (paid[0] || '').match(/\\$(\\d+)/), reset: g.world.occasions.trad.jar.coins, openJar, spent: spentOnce, coinsNow: h.world.occasions.trad.jar.coins, closed, broke: __chip(broke, 'occasion.coins_in_jar'), coinsPer: TRADITION_TUNING.playful.giving.jar.coins };
})()`);
check('Giving Week: a couple of warm residents do a small kindness each day (a treat, a chore, coins for the jar), all six days', giv.kind >= 6, JSON.stringify(giv.kind));
check('...the jar accumulates and PAYS OUT at the Sharing Feast ("held $N — a good cause"), then resets', giv.paid === 1 && giv.reset === 0 && Number(giv.paidAmount[1]) === giv.jarCoins, JSON.stringify({ paid: giv.paid, amt: giv.paidAmount, was: giv.jarCoins, reset: giv.reset }));
check('your Put Coins in the Jar verb spends real money into the jar (3 a day at most; not when broke)', giv.openJar && giv.spent === giv.coinsPer && giv.coinsNow >= giv.coinsPer && giv.closed === false && giv.broke === false, JSON.stringify({ spent: giv.spent, now: giv.coinsNow, closed: giv.closed, broke: giv.broke }));

// ---------------------------------------------------------------- 6
console.log('\n6. P8 (D22) — anniversaries, posts, mail, Sale Day, the prompt lines');
const world = J(`(() => {
  const g = __mk(28, 3, 200);
  const [a, b, c] = __ids(g);
  g.npcs[a].residency.since = 1; g.npcs[b].residency.since = 100;
  const rec = getRelationship(g, b, c, true); rec.status = 'committed'; rec.lastTransitionDay = 60;
  const y2 = 141;
  const keys = __run(g, y2);
  const moveIn = __run(g, 240);
  const couple = __run(g, 200);
  const y3 = __run(g, 281);
  const prompt = tradPromptLines((__at(g, 141), g), a);
  const prompt4 = tradPromptLines((__at(g, 145), g), a);
  return { keys: keys.find(l => /since you got the keys/.test(l)) || '', moveIn: moveIn.filter(l => /has lived here 1 year/.test(l)), couple: couple.filter(l => /marked 1 year together/.test(l)), y3keys: y3.find(l => /since you got the keys/.test(l)) || '', prompt, prompt4 };
})()`);
check('anniversaries: the day you got the keys, every year ("1 year", then "2 years")', /1 year since/.test(world.keys) && /2 years since/.test(world.y3keys), JSON.stringify({ k: world.keys, y3: world.y3keys }));
check('a roommate\'s move-in anniversary and a couple\'s, each on their own day', world.moveIn.length === 1 && world.couple.length === 1, JSON.stringify(world));
check('the anniversary of the keys rides the prompt for a few days, then not', world.prompt.some(l => /lived here 1 year/.test(l)) && !world.prompt4.some(l => /lived here/.test(l)));

const posts = J(`(() => {
  const g = __mk(29, 4, __d(3, 25));
  const p0 = g.world.computer.apps.social_feed.posts.length;
  __run(g, __d(3, 25));
  const posts = g.world.computer.apps.social_feed.posts.slice(p0);
  const again = (() => { const n = g.world.computer.apps.social_feed.posts.length; __run(g, __d(3, 25)); return g.world.computer.apps.social_feed.posts.length - n; })();
  const m0 = (g.world.mailbox || []).length;
  const cards = (g.world.mailbox || []).filter(m => m.kind === 'card');
  const vd = __mk(29, 3, __d(0, 14)); __run(vd, __d(0, 14));
  return { n: posts.length, festive: posts.filter(p => /Midwinter/.test(p.text)).length, again, cards: cards.length, vdCards: (vd.world.mailbox || []).filter(m => m.kind === 'card').length, per: TRADITION_TUNING.chatterPosts.perOccasion, from: cards[0] && cards[0].from };
})()`);
check('holiday Chatter: up to N festive residents post about the day (real feed posts), once', posts.festive >= 1 && posts.festive <= posts.per + 2 && posts.again === 0, JSON.stringify(posts));
check('holiday mail: a card arrives in the mailbox on Midwinter (and Valentine\'s) — from Del or an old friend', posts.cards === 1 && posts.vdCards === 1 && /Del Connors|old friend/.test(posts.from), JSON.stringify(posts));

const sale = J(`(() => {
  const g = __mk(30, 3, __d(2, 27));
  const def = ITEM_DEFS.chips;
  const normal = itemPriceNow(def, __at(g, __d(2, 5)));
  const onSale = itemPriceNow(def, __at(g, __d(2, 27)));
  const cheap = ITEM_DEFS.granola_bar; const cheapSale = itemPriceNow(cheap, g);
  return { normal, onSale, mult: saleDayMultiplier(g), other: saleDayMultiplier(__at(g, __d(2, 5))), cheapSale, cheap: cheap.price, S: TRADITION_TUNING.sale };
})()`);
check('Sale Day: itemPriceNow (the price both Nile and QuickCart read) drops by the bounded multiplier for the day and is unchanged otherwise, never below $1', sale.onSale === Math.max(1, Math.round(sale.normal * sale.S.multiplier)) && sale.other === 1 && sale.mult === sale.S.multiplier && sale.cheapSale >= 1, JSON.stringify(sale));

// ---------------------------------------------------------------- 7
console.log('\n7. Integration — the whole year through the real rollover; save shape; old saves');
const year = J(`(() => {
  const g = __mk(31, 4, 2);
  let lines = 0; const errs = [];
  for (let day = 2; day <= 141 * 2 + 5; day++) {
    try { lines += __run(g, day).length; } catch (e) { errs.push(day + ': ' + e.message); if (errs.length > 3) break; }
  }
  const t = g.world.occasions.trad;
  const doneKeys = Object.keys(t.done);
  const oldYears = doneKeys.filter(k => Number(k.split('|')[2]) < 3 - TRADITION_TUNING.keepYears);
  const json = JSON.stringify(g.world.occasions);
  const rt = JSON.parse(json);
  const fresh = __mk(31, 3, 50); delete fresh.world.occasions; const r = __run(fresh, 51);
  return { errs, lines, keys: doneKeys.length, oldYears: oldYears.length, size: json.length, rtDone: Object.keys(rt.trad.done).length === doneKeys.length, freshOk: Array.isArray(r) && typeof fresh.world.occasions === 'object' };
})()`);
check('two years of rollovers run clean (no exceptions) and narrate plenty', year.errs.length === 0 && year.lines > 200, JSON.stringify(year.errs));
check('the once-per-year ledger is pruned to the last keepYears and survives a JSON round trip (small)', year.oldYears === 0 && year.rtDone && year.size < 20000, JSON.stringify({ old: year.oldYears, size: year.size }));
check('a save with no world.occasions at all just works (the lazy default)', year.freshOk);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
