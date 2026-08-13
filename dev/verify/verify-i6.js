// NPC initiative plan, Phase 6 — the rate.
//
//   node dev/verify/verify-i6.js
//
// The phase is a tuning pass and its real deliverable is a set of numbers in
// the plan's Handoff, produced by `measure-initiative.js`. What a harness can
// add is the part a number cannot: that the levers those numbers were read off
// are levers at all, and that the arithmetic underneath them still holds after
// they moved.
//
// Phase 6 found one thing while measuring, and it is the reason this file
// exists rather than being a paragraph in the Handoff. A cooldown stamp is a
// 0..47 tick index that WRAPS at midnight, and `isOnCooldown` compares a
// wrapped delta — so `cooldownTicks` is not an elapsed duration. It is a fixed
// daily clock window, `cooldownTicks` wide, anchored at whatever tick the
// entry last fired on. At or above `CLOCK.ticksPerDay` that window covers the
// whole day and the entry is on cooldown FOREVER after its first firing.
// Three entries were above it — `knock_player` (96), `propose_player` (48) and
// `gift_to_player` (96) — so all three fired exactly once per NPC per game
// while their comments said "two game days", "a full day" and "~2 game days".
//
// This is D26's finding ("a tick index wraps at midnight, so it cannot measure
// an age") in the one place D26 did not reach, and it is Plan 3's own
// documented cooldown bug half-fixed: that fix removed the negative-delta case
// and left the fixed-window semantics.
//
// So the assertions here are about the CLASS, not the three instances
// (README rule 2). The bound is derived from CLOCK.ticksPerDay and the rates
// are read from the tables that own them (README rule 5), because Phase 6's
// whole job was to move those numbers and a harness that pins them reports the
// next retune as a regression (README rule 4).
const path = require('path');
const fs = require('fs');
const { loadEngine, SRC } = require('./loadgame.js');
const { ctx, api } = loadEngine({ required: ['config.js', 'sim.js', 'drives.js', 'cognition.js', 'overture.js', 'npc.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const codeOf = (f) => srcOf(f).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '').replace(/([^:])\/\/.*$/gm, '$1');
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

const TPD = J('CLOCK.ticksPerDay');
const OV = J('OVERTURE');
const DEFS = J('OVERTURE_DEFS');
const DRIVES = J('DRIVE_DEFS');

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260811, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    g.player.location = 'living_room';
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
`);

// ---------------------------------------------------------------------------
console.log('\n(D34) a cooldown is a WRAPPED window, so every cooldown must fit inside a day');

// The premise, stated as an assertion so that a future rewrite of isOnCooldown
// to measure real elapsed time makes THIS fail rather than the bound below
// silently becoming pointless. If this one fails, delete the bound — do not
// widen it.
check(`isOnCooldown still compares a WRAPPED 0..${TPD - 1} delta`,
      /currentTick \+ CLOCK\.ticksPerDay - last/.test(codeOf('drives.js'))
      && /since < cd/.test(codeOf('drives.js')),
      'the bound below exists only because of this line; if the stamp starts carrying a day, this assertion is the one to remove first');

// The defect itself, demonstrated rather than described: a cooldown at the
// bound can never elapse, at ANY tick of the day.
check(`a cooldown of exactly ticksPerDay (${TPD}) never elapses — at any tick of the day`,
      api(`(() => {
        const npc = setCooldown({ flags: {} }, '__probe', 10);
        DRIVE_DEFS.__probe = { cooldownTicks: CLOCK.ticksPerDay, utility: {} };
        const everFree = Array.from({ length: CLOCK.ticksPerDay }, (_, t) => isOnCooldown(npc, '__probe', t))
          .some(on => on === false);
        delete DRIVE_DEFS.__probe;
        return everFree === false;
      })()`),
      'this is what "fires once per game" looks like from the inside');
check('...while one comfortably under the bound elapses on most of the day',
      api(`(() => {
        const npc = setCooldown({ flags: {} }, '__probe', 10);
        DRIVE_DEFS.__probe = { cooldownTicks: 12, utility: {} };
        const free = Array.from({ length: CLOCK.ticksPerDay }, (_, t) => isOnCooldown(npc, '__probe', t))
          .filter(on => on === false).length;
        delete DRIVE_DEFS.__probe;
        return free === CLOCK.ticksPerDay - 12;
      })()`),
      'the window is exactly ticksPerDay - cooldownTicks wide, which is the whole shape of the defect');

// THE class assertion. Both tables, because candidateDef resolves both and
// isOnCooldown reads whichever it lands on — a bound that covered only the
// overtures would have let gift_to_player stand.
const allCooldowns = Object.entries({ ...DRIVES, ...DEFS })
  .filter(([, d]) => (d && d.cooldownTicks) > 0)
  .map(([id, d]) => [id, d.cooldownTicks]);
const overBound = allCooldowns.filter(([, cd]) => cd >= TPD);
check(`EVERY cooldownTicks in both tables is under CLOCK.ticksPerDay (${allCooldowns.length} entries)`,
      overBound.length === 0,
      `${JSON.stringify(overBound)} can never elapse — they fire once per NPC per game`);

// The tighter bound, and it is a MEASURED claim rather than a provable one, so
// it is asserted only over the table this phase owns and merely reported over
// the other. Above roughly half a day the surviving window gets narrow enough
// to fall wholly inside hours the entry's own blockFilter excludes, which is
// the same failure reached gradually instead of at once. Two independent
// measurements put the knee at 24: `propose_player` left 4 of 24 residents
// unable to ever propose at 24 against 1 of 24 at 20, and `do_laundry` fires
// an identical 8 times at 24, 30 and 36 — a constant that has stopped
// responding to its own value is the signature.
const HALF = Math.floor(TPD / 2);
check(`every OVERTURE cooldown is at or under half a day (${HALF}), the measured working ceiling`,
      Object.values(DEFS).every(d => d.cooldownTicks <= HALF),
      JSON.stringify(Object.entries(DEFS).map(([k, d]) => [k, d.cooldownTicks]).filter(([, cd]) => cd > HALF)));
// Reported, not failed: these are other plans' drives and their rates are
// theirs to set. Phase 6 fixed `gift_to_player` because it was over the HARD
// bound and therefore provably fired once per game; `do_laundry` at 30 is over
// the soft one only, and re-rating housekeeping is not this plan's call.
const softOver = Object.entries(DRIVES).filter(([, d]) => (d && d.cooldownTicks) > HALF);
if (softOver.length) {
  console.log(`  NOTE  ${softOver.length} DRIVE_DEFS cooldown(s) over the soft ceiling: ` +
    JSON.stringify(softOver.map(([k, d]) => [k, d.cooldownTicks])));
  console.log(`        Measured for do_laundry: 23 firings at 12, 18 at 18, then 8 at each of`);
  console.log(`        24 / 30 / 36 — flat, so the constant is no longer the thing deciding.`);
  console.log(`        Flagged in the plan's Handoff for whoever owns housekeeping.`);
}

// ---------------------------------------------------------------------------
console.log('\n(D21) the levers Phase 6 tuned are levers — each one moves the rate it claims');

// Every cooldown constant OVERTURE publishes has to actually reach a def, or
// "how often does this cast reach for the player" stops being one decision made
// in one place. The mapping is asserted by VALUE rather than by name so that
// renaming either side breaks it.
const cdConstants = Object.entries(OV).filter(([k]) => /CooldownTicks$|^cooldownTicks$/.test(k));
check(`every OVERTURE.*cooldownTicks constant is read by a def (${cdConstants.length})`,
      cdConstants.every(([, v]) => Object.values(DEFS).some(d => d.cooldownTicks === v)),
      JSON.stringify(cdConstants) + ' vs ' + JSON.stringify(Object.values(DEFS).map(d => d.cooldownTicks)));
check('every OVERTURE_DEFS entry declares a positive cooldown',
      Object.values(DEFS).every(d => d.cooldownTicks > 0),
      JSON.stringify(Object.entries(DEFS).map(([k, d]) => [k, d.cooldownTicks])));

// The trap that made the first draft of the motiveWeight sweep print five
// identical rows: every entry COPIES OVERTURE.motiveWeight into its own
// utility.motive.weight at config load, so the published constant is a source
// and not a live lever. Asserted so the two cannot drift silently — the
// instrument sweeps the defs, and this is why.
check('every entry\'s utility.motive.weight is OVERTURE.motiveWeight, copied at load',
      Object.values(DEFS).every(d => d.utility.motive.weight === OV.motiveWeight),
      JSON.stringify(Object.entries(DEFS).map(([k, d]) => [k, d.utility.motive.weight])) + ` vs ${OV.motiveWeight}`);

// D5's ordering, as arithmetic rather than as a sentence, and derived from both
// tables so that retuning either side cannot silently invert it. A maximally
// motivated overture outranks every ordinary chore and still loses to a
// starving NPC's eat — which is what keeps self-care winning the moments
// self-care should win.
const maxOverture = Math.max(...Object.values(DEFS).map(d => d.utility.baseAppeal + d.utility.motive.weight));
const chores = Object.entries(DRIVES).filter(([, d]) => d.utility && !d.utility.need && typeof d.utility.baseAppeal === 'number');
const maxChore = Math.max(...chores.map(([, d]) => d.utility.baseAppeal));
const eat = DRIVES.eat.utility;
const COG = J('COGNITION');
check('a maxed overture outranks every needless chore, and still loses to a starving eat (D5)',
      maxOverture > maxChore && maxOverture < eat.baseAppeal + COG.needWeight,
      `overture max ${maxOverture.toFixed(2)}, chore max ${maxChore.toFixed(2)}, starving eat ${(eat.baseAppeal + COG.needWeight).toFixed(2)}`);

// ---------------------------------------------------------------------------
console.log('\n(D9) the do-not-disturb gate still answers, and still fails closed');

// Phase 6 owns the DND list and left it alone, which is a decision and needs
// the same protection as a change: every entry has to resolve, or an unknown
// key silently blocks the channel it is on for the whole game (fails closed,
// which is right, and invisible, which is why this is asserted).
const DND_KEYS = J('Object.keys(OVERTURE_DND_SOURCES)');
const declared = new Set();
for (const d of Object.values(DEFS)) {
  for (const k of d.doNotDisturb || []) declared.add(k);
  for (const k of d.requires || []) declared.add(k);
}
check(`every doNotDisturb and requires key resolves in the registry (${declared.size} used, ${DND_KEYS.length} defined)`,
      [...declared].every(k => DND_KEYS.includes(k)),
      [...declared].filter(k => !DND_KEYS.includes(k)).join(', ') + ' — an unresolved key fails closed and silently kills the channel');
check('every registry entry is used by at least one def — no source nobody reads',
      DND_KEYS.every(k => declared.has(k)),
      DND_KEYS.filter(k => !declared.has(k)).join(', '));
check('an unknown entry still fails CLOSED rather than passing vacuously',
      api(`(() => {
        const g = __mk();
        const saved = OVERTURE_DEFS.approach_player.doNotDisturb;
        OVERTURE_DEFS.approach_player.doNotDisturb = ['no_such_state'];
        const r = overtureAllowed(g, 'approach_player');
        OVERTURE_DEFS.approach_player.doNotDisturb = saved;
        return r.allowed === false && r.reason === 'unknown_source';
      })()`));
// The text channel's EMPTY list is the one deliberate hole in D9, and Phase 6
// is what made it survivable: it is the only channel with no geometric limiter
// AND no gate, so the cooldown is the entire ration. Asserted together, because
// the empty list is only defensible while something else is rationing it.
const textDef = Object.values(DEFS).find(d => d.channel === 'text');
check('the text channel has an empty do-not-disturb list AND the tightest ration on it',
      (textDef.doNotDisturb || []).length === 0
      && textDef.cooldownTicks >= Object.values(DEFS).find(d => d.channel === 'approach').cooldownTicks,
      `text dnd ${JSON.stringify(textDef.doNotDisturb)} cooldown ${textDef.cooldownTicks} vs approach ${Object.values(DEFS).find(d => d.channel === 'approach').cooldownTicks}` +
      ' — a channel that never defers has to be rationed somewhere, and the cooldown is the only place left');

// ---------------------------------------------------------------------------
console.log('\n(D10) the refusal economy still self-limits, and still costs less each time');

// Phase 6 measured this arm and changed nothing in it, which is a result and
// gets the same treatment as a change. The curve is derived from the constants
// rather than restated, so retuning refusalDiminish cannot silently invert it.
check('each refusal inside the window scales the next by refusalDiminish',
      api(`(() => {
        const npc = { flags: {} , relPlayer: {} };
        const day = 5;
        const scales = [];
        let n = npc;
        for (let i = 0; i < 3; i++) {
          scales.push(overtureRefusalScale(n, day));
          const g = { npcs: { x: n } };
          noteOvertureRefused(g, 'x', day);
          n = g.npcs.x;
        }
        const want = [1, OVERTURE.refusalDiminish, Math.pow(OVERTURE.refusalDiminish, 2)];
        return JSON.stringify(scales) === JSON.stringify(want);
      })()`),
      'the first refusal costs full price; the second half; the third a quarter');
check('...and a refusal outside the window resets rather than accumulating',
      api(`(() => {
        const g = { npcs: { x: { flags: {}, relPlayer: {} } } };
        noteOvertureRefused(g, 'x', 1);
        noteOvertureRefused(g, 'x', 1 + OVERTURE.refusalWindowDays + 1);
        return g.npcs.x.flags._overtureRefusals.count === 1;
      })()`),
      '"three refusals in a fortnight" and "three in an evening" are not the same person taking a hint');
// D10's two halves must read the SAME scale, or the relationship cost and the
// willingness to ask again get tuned apart. One function, two readers.
check('the relationship cost and the next motive read one scale, not two',
      /overtureRefusalScale\(npc, day\)/.test(codeOf('overture.js'))
      && /const scale = overtureRefusalScale\(npc, day\)/.test(codeOf('ui.js')),
      'the NPC learns to stop asking rather than learning to hate you, and one function is both');

// ---------------------------------------------------------------------------
console.log('\n(R2/D18) the tick is still synchronous, pure and model-free after the retune');

check('a week of ticks with generateText stubbed to explode never calls it',
      api(`(() => {
        const saved = root.generateText;
        root.generateText = () => { throw new Error('the tick reached the model'); };
        try {
          let g = __mk();
          for (const id of __ids(g)) Object.assign(g.npcs[id].relPlayer, { affection: 0.9, desire: 0.9, comfort: 0.4 });
          for (let t = 0; t < 48; t++) g = resolveBatch(g, 1).state;
        } finally { root.generateText = saved; }
        return true;
      })()`),
      'the DECISION is arithmetic; only the line is generated');
// D19, re-scanned. Phase 6 touched no writer, and this is what proves it rather
// than asserting it.
const overtureWrites = [];
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.js'))) {
  for (const _ of codeOf(f).matchAll(/\w+\.overture\s*=\s*\{/g)) overtureWrites.push(`${f}: builds`);
  for (const _ of codeOf(f).matchAll(/delete\s+\w+\.overture/g)) overtureWrites.push(`${f}: deletes`);
}
check('npc.overture is STILL only ever built or deleted in overture.js',
      overtureWrites.length >= 3 && overtureWrites.every(w => w.startsWith('overture.js')),
      JSON.stringify(overtureWrites));

// ---------------------------------------------------------------------------
console.log('\n(the instrument) measure-initiative.js exists and reads the tables it reports on');

const inst = fs.readFileSync(path.join(__dirname, 'measure-initiative.js'), 'utf8');
check('dev/verify/measure-initiative.js exists — Phase 6\'s deliverable',
      inst.length > 0);
check('it sweeps the DEFS\' motive weight, not the source constant that is copied at load',
      /utility\.motive\.weight = /.test(inst) && !/^\s*OVERTURE\.motiveWeight = /m.test(inst),
      'writing OVERTURE.motiveWeight after load moves nothing — the first draft printed five identical rows');
check('it derives the cooldown bound from CLOCK.ticksPerDay rather than hardcoding 48',
      /CLOCK\.ticksPerDay/.test(inst) && !/>= 48/.test(inst),
      'README rule 5 — a literal that has to agree with another file is a literal that will not');
check('it is an instrument: it prints and does not assert',
      !/\bcheck\(/.test(inst) && !/process\.exit\(1\)/.test(inst),
      'the four measure-* scripts are tuning instruments, not tests');

// ---------------------------------------------------------------------------
// Two leading spaces, because run-all.js matches /^ {2}(\d+) passed, (\d+) failed$/m
// and anything else is reported as DID NOT REPORT — which is not a harness that
// passed (README rule 6). The first draft of this line had none.
console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
