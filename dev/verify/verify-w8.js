// Intimacy & Voyeurism Plan Phase 8 — Desire system (D9/D12).
// Desire is real: a player need (footer bar) decayed + sourced in SIM's
// decayPlayerNeeds closed form, an NPC stat on npc.needs.desire moved by the
// heartbeat (applyNeedsHeartbeat), and a `utility.desire` bias term in
// COGNITION's scoreDrive that only the intimacy-adjacent candidates declare
// — a bias, never a gate. Sources are exposure (the plan's table, strongest
// wins per tick), with the Phase 7 shared clothingResponseToWearer(...).desire
// number as the "seeing someone dressed invitingly" source.
//
// Nothing here reimplements the math: the engine loads into a bare vm and the
// assertions read what the real functions return.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const SRCDIR = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// Injected into the vm context — the checks below call house(...) from
// inside api() template strings, which only see symbols defined via api().
api(`
  function house(seed, n) {
    const h = SIM_generateHouse(seed, n);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    return h;
  }
`);

const REVEALING = { top: 'crop_top', bottom: 'skirt', underwear: 'lingerie_set', accessory: 'necklace' };

// A scoreDrive ctx that exercises no other term: no perceived signals, a
// leisure block, no cooldown/recency, and (optionally) a desire motive.
// Injected into the vm context — the checks below call scoringCtx(...) from
// inside api() template strings, which only see symbols defined via api().
api(`
  function scoringCtx(npc, motiveStrength) {
    return {
      perceived: [],
      block: 'leisure',
      minutesOfDay: 720,
      nowAbs: 1,
      motives: motiveStrength === undefined ? {} : {
        approach_player: { motive: 'desire', motiveRef: {}, strength: motiveStrength, tone: 'charged' },
      },
    };
  }
`);

// ---------------------------------------------------------------- 1
console.log('\n1. DESIRE table (config.js)');
check('player/npc tuning: positive rates, max > start, warnBelow present',
      api(`(() => {
        const d = DESIRE;
        const p = d.player, n = d.npc;
        return p.start > 0 && p.max === 100 && p.decayPerMinute > 0 && p.warnBelow > 0 && p.start <= p.max
          && n.start > 0 && n.max === 100 && n.decayPerMinute > 0 && n.start <= n.max;
      })()`));
check('every source is well-formed (signal XOR kind, positive amount) and the table is not empty',
      api(`(() => {
        const srcs = DESIRE.sources;
        return Array.isArray(srcs) && srcs.length > 0 && srcs.every(s =>
          (!!s.signal !== !!s.kind) && typeof s.amount === 'number' && s.amount > 0);
      })()`));
check('live source signals exist in SIGNAL_DEFS (no dead source references)',
      api(`(() => DESIRE.sources.every(s => !s.signal || !!SIGNAL_DEFS[s.signal]))()`));
check('release is a positive table (negated at the call sites) and clothingScale / scoring are sane',
      api(`(() => {
        const d = DESIRE;
        // Convention (config.js ~line 3545): release holds POSITIVE amounts;
        // the effect strings carry the '-' (the act SATES, desire falls by
        // this much), applied at the call sites.
        return Object.values(d.release).every(v => v > 0) && d.clothingScale > 0
          && d.scoring.above > 0 && d.scoring.above < d.npc.max && d.scoring.weight > 0 && d.scoring.weight <= 1;
      })()`));
check('representative call sites emit the minus: the drive effects and action strings negate the positive amounts',
      api(`(() => {
        const releaseDelta = (effects, need) => (effects || []).some(e => {
          if (typeof e === 'string') return e.includes('desire -' + DESIRE.release[need]);
          return e.type === 'ADJUST_NEED' && e.params.need === 'desire' && e.params.delta === -DESIRE.release[need];
        });
        return releaseDelta(DRIVE_DEFS.masturbate.effects, 'masturbate')
          && releaseDelta(DRIVE_DEFS.intimate.effects, 'sex')
          && releaseDelta(ACTION_DEFS['intimacy.masturbate'].effects, 'masturbate');
      })()`));

// ---------------------------------------------------------------- 2
console.log('\n2. Schema + construction');
check('CHARACTER_SCHEMA declares needs.desire with the NPC start default',
      api(`(() => {
        const spec = CHARACTER_SCHEMA.mutable.needs.fields.desire;
        return !!spec && spec.type === 'number' && spec.default === DESIRE.npc.start;
      })()`));
check('a generated NPC starts at DESIRE.npc.start, the player at DESIRE.player.start',
      api(`(() => {
        const h = house(20260821, 3);
        return Object.values(h.npcs).every(n => n.needs.desire === DESIRE.npc.start)
          && h.player.desire === DESIRE.player.start;
      })()`));
check('an OLD-SAVE NPC (no desire field) reads the start default through the heartbeat',
      api(`(() => {
        const h = house(20260821, 1);
        const npc = Object.values(h.npcs)[0];
        delete npc.needs.desire;
        const before = npc.needs.desire;
        const next = applyNeedsHeartbeat(h, 30, { player: false });
        return before === undefined && next.npcs[Object.keys(h.npcs)[0]].needs.desire !== undefined;
      })()`));

// ---------------------------------------------------------------- 3
console.log('\n3. Player desire — decayPlayerNeeds (the footer bar need)');
check('pure decay: 80 → 77 over a 60-minute span with no sources (0.05/min)',
      api(`(() => {
        const h = house(20260821, 1);
        const p = decayPlayerNeeds({ ...h.player, desire: 80 }, 60, h);
        return Math.abs(p.desire - 77) < 1e-9;
      })()`));
check('decay clamps at 0, and an old-save player (no desire) starts from the default',
      api(`(() => {
        const h = house(20260821, 1);
        const zero = decayPlayerNeeds({ ...h.player, desire: 0 }, 60, h);
        const oldSave = decayPlayerNeeds({ ...h.player, desire: undefined }, 60, h);
        return zero.desire === 0 && oldSave.desire < DESIRE.player.start;
      })()`));
check('a running-water signal in earshot RAISES desire over the no-source control (the verification)',
      api(`(() => {
        const h = house(20260821, 1);
        h.player.location = 'living_room';
        const withSignal = house(20260821, 1);
        withSignal.player.location = 'living_room';
        emitTransient(withSignal, { id: 'running_water', roomId: 'living_room', intensity: SIGNALS_EMIT.shower, sourceId: null });
        const control = decayPlayerNeeds({ ...h.player, desire: 50 }, 60, h);
        const exposed = decayPlayerNeeds({ ...withSignal.player, desire: 50 }, 60, withSignal);
        // exposed gains source 1.5 × (60/30) = 3.0 on top of the same decay
        return exposed.desire - control.desire > 2.9 && exposed.desire > control.desire;
      })()`));
check('the desire source is capped at max (no runaway stacking)',
      api(`(() => {
        const h = house(20260821, 1);
        h.player.location = 'living_room';
        emitTransient(h, { id: 'running_water', roomId: 'living_room', intensity: SIGNALS_EMIT.shower, sourceId: null });
        const p = decayPlayerNeeds({ ...h.player, desire: 99 }, 1000, h);
        return p.desire <= DESIRE.player.max;
      })()`));

// ---------------------------------------------------------------- 4
console.log('\n4. The clothing source — seeing someone dressed invitingly');
check('an NPC in a revealing outfit in the same room raises the player\'s desire, a covered one does not',
      api(`(() => {
        const h = house(20260821, 2);
        const id = Object.keys(h.npcs)[0];
        h.player.location = 'living_room';
        const npc = h.npcs[id];
        npc.location = 'living_room';
        const run = (outfit) => {
          npc.outfit = outfit;
          return decayPlayerNeeds({ ...h.player, desire: 30 }, 60, h).desire;
        };
        const withRevealing = run(${JSON.stringify(REVEALING)});
        const withCovered = run({ top: 'sweater', bottom: 'sweatpants' });
        return withRevealing > withCovered && withCovered <= 30; // decay only, no source
      })()`));
check('an NPC in the same room as a revealingly-dressed PLAYER gains desire through the heartbeat',
      api(`(() => {
        const h = house(20260821, 2);
        const id = Object.keys(h.npcs)[0];
        h.player.location = 'living_room';
        h.player.outfit = ${JSON.stringify(REVEALING)};
        const npc = h.npcs[id];
        // Force a deviant observer so the clothing source clears the decay rate
        npc.bible = { ...npc.bible, temperament: { ...npc.bible.temperament, openness: 1, assertiveness: 1 } };
        npc.location = 'living_room';
        npc.needs.desire = 30;
        const next = applyNeedsHeartbeat(h, 30, { player: false });
        return next.npcs[id].needs.desire > 30;
      })()`));
check('the same reveal reads as ZERO for a prude observer and MORE for a deviant (deviancy gate holds in the desire source)',
      api(`(() => {
        const h = house(20260821, 2);
        const id = Object.keys(h.npcs)[0];
        h.player.location = 'living_room';
        h.player.outfit = ${JSON.stringify(REVEALING)};
        const npc = h.npcs[id];
        npc.location = 'living_room';
        npc.needs.desire = 30;
        const run = (temperament) => {
          npc.bible = { ...npc.bible, temperament: { ...npc.bible.temperament, ...temperament } };
          return applyNeedsHeartbeat(h, 30, { player: false }).npcs[id].needs.desire;
        };
        const prude = run({ openness: -1, assertiveness: -1 });
        const deviant = run({ openness: 1, assertiveness: 1 });
        return deviant > prude && prude < 30 && deviant > 30;
      })()`));

// ---------------------------------------------------------------- 5
console.log('\n5. NPC desire — the heartbeat (applyNeedsHeartbeat)');
check('pure decay: 30 → 27.6 over a 60-minute span (0.04/min)',
      api(`(() => {
        const h = house(20260821, 2);
        const id = Object.keys(h.npcs)[0];
        h.npcs[id].needs.desire = 30;
        h.npcs[id].location = null; // off-map: no sources can reach
        const next = applyNeedsHeartbeat(h, 60, { player: false });
        return Math.abs(next.npcs[id].needs.desire - 27.6) < 1e-9;
      })()`));
check('a resident in earshot of running_water gains desire, clamped to [0, max]',
      api(`(() => {
        const h = house(20260821, 2);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        npc.location = 'living_room';
        npc.needs.desire = 40;
        emitTransient(h, { id: 'running_water', roomId: 'living_room', intensity: SIGNALS_EMIT.shower, sourceId: null });
        const next = applyNeedsHeartbeat(h, 30, { player: false });
        const d = next.npcs[id].needs.desire;
        // 40 + (source 1.5/30min → 0.05/min − 0.04 decay) × 30 = 40.3
        return Math.abs(d - 40.3) < 1e-9 && d <= DESIRE.npc.max;
      })()`));

// ---------------------------------------------------------------- 6
console.log('\n6. scoreDrive utility.desire bias term (never a gate — D12)');
check('the desire-motived approach overture scores HIGHER at high desire than at low desire',
      api(`(() => {
        const h = house(20260821, 2);
        const npc = Object.values(h.npcs)[0];
        const low = scoreDrive('approach_player', { ...npc, needs: { ...npc.needs, desire: 10 } }, scoringCtx(npc, 0.5));
        const high = scoreDrive('approach_player', { ...npc, needs: { ...npc.needs, desire: 80 } }, scoringCtx(npc, 0.5));
        const expect = DESIRE.scoring.weight * (80 - DESIRE.scoring.above) / (DESIRE.npc.max - DESIRE.scoring.above);
        return high.score > low.score && Math.abs(high.terms.desireBias - expect) < 1e-9 && low.terms.desireBias === 0;
      })()`));
check('...and a high-desire NPC\'s intimacy candidate outscores its leisure one (eat, full belly)',
      api(`(() => {
        const h = house(20260821, 2);
        const npc = Object.values(h.npcs)[0];
        const horny = { ...npc, needs: { ...npc.needs, desire: 90, hunger: 60 } };
        const intimacy = scoreDrive('approach_player', horny, scoringCtx(horny, 0.6));
        const leisure = scoreDrive('eat', horny, scoringCtx(horny));
        return intimacy.score > leisure.score;
      })()`));
check('a NON-intimacy drive scores byte-identically at any desire (no gate, no bias)',
      api(`(() => {
        const h = house(20260821, 2);
        const npc = Object.values(h.npcs)[0];
        const low = scoreDrive('eat', { ...npc, needs: { ...npc.needs, desire: 5, hunger: 60 } }, scoringCtx(npc));
        const high = scoreDrive('eat', { ...npc, needs: { ...npc.needs, desire: 95, hunger: 60 } }, scoringCtx(npc));
        return low.score === high.score && low.terms.desireBias === 0 && high.terms.desireBias === 0;
      })()`));
check('a candidate below the desire `above` threshold gets NO bias (0 at and below above)',
      api(`(() => {
        const h = house(20260821, 2);
        const npc = Object.values(h.npcs)[0];
        const atAbove = scoreDrive('approach_player', { ...npc, needs: { ...npc.needs, desire: DESIRE.scoring.above } }, scoringCtx(npc, 0.3));
        return atAbove.terms.desireBias === 0;
      })()`));

// ---------------------------------------------------------------- 7
console.log('\n7. The one-shot kind sources (flirted / peeked_at_sex)');
check('notePlayerDesireSource marks the player; decayPlayerNeeds consumes the amount once and clears the flag',
      api(`(() => {
        const h = house(20260821, 1);
        notePlayerDesireSource(h, 'flirted');
        const marked = h.player.flags._desireSource;
        const p = decayPlayerNeeds({ ...h.player, desire: 30 }, 30, h);
        return marked === 'flirted'
          && Math.abs(p.desire - (30 + desireSourceAmount('flirted') - DESIRE.player.decayPerMinute * 30)) < 1e-9
          && p.flags._desireSource === undefined;
      })()`));
check('strongest pending kind wins (peeked_at_sex beats a later flirted, and the source table prices both)',
      api(`(() => {
        const h = house(20260821, 1);
        notePlayerDesireSource(h, 'peeked_at_sex');
        notePlayerDesireSource(h, 'flirted');
        return h.player.flags._desireSource === 'peeked_at_sex'
          && desireSourceAmount('peeked_at_sex') > desireSourceAmount('flirted');
      })()`));

check('a signal YOU emitted is not a desire source (your own shower does not stir you)',
      api(`(() => {
        const h = house(20260821, 2);
        h.player.location = 'living_room';
        emitTransient(h, { id: 'running_water', roomId: 'living_room', intensity: SIGNALS_EMIT.shower, sourceId: 'player' });
        const self = desireSource(h, 'player', 'living_room').amount;
        emitTransient(h, { id: 'running_water', roomId: 'living_room', intensity: SIGNALS_EMIT.shower, sourceId: null });
        const other = desireSource(h, 'player', 'living_room').amount;
        const h2 = house(20260821, 2);
        const id2 = Object.keys(h2.npcs)[0];
        h2.npcs[id2].location = 'living_room';
        emitTransient(h2, { id: 'running_water', roomId: 'living_room', intensity: SIGNALS_EMIT.shower, sourceId: id2 });
        const npcSelf = desireSource(h2, id2, 'living_room').amount;
        return self === 0 && other > 0 && npcSelf === 0;
      })()`));
check('a transient source is bounded by its remaining life: a long span never credits a short-lived signal for the whole span',
      api(`(() => {
        const h = house(20260821, 2);
        h.player.location = 'living_room';
        emitTransient(h, { id: 'running_water', roomId: 'living_room', intensity: SIGNALS_EMIT.shower, sourceId: null });
        const src = desireSource(h, 'player', 'living_room');
        const spanContribution = desireSourceForSpan(h, 'player', 'living_room', 48); // a full day
        // life of a 0.85 shower signal at decay 0.25 to the 0.05 floor = 3.2 ticks
        const life = Math.max(0, (0.85 - SIGNAL_TUNING.floor) / SIGNAL_DEFS.running_water.decayPerTick);
        return src.amount === 1.5 && Math.abs(src.lifeTicks - life) < 1e-9
          && Math.abs(spanContribution - 1.5 * Math.min(48, life)) < 1e-9;
      })()`));

// ---------------------------------------------------------------- 8
console.log('\n8. Integrity — determinism, purity, the gate untouched');
check('desireSource is pure (no writes, no rng): repeated calls are byte-identical and state is unchanged',
      api(`(() => {
        const h = house(20260821, 2);
        h.player.location = 'living_room';
        Object.values(h.npcs)[0].location = 'living_room';
        emitTransient(h, { id: 'running_water', roomId: 'living_room', intensity: SIGNALS_EMIT.shower, sourceId: null });
        const before = JSON.stringify(h);
        const a = desireSource(h, 'player', 'living_room').amount;
        const b = desireSource(h, 'player', 'living_room').amount;
        return a === b && a > 0 && JSON.stringify(h) === before;
      })()`));
check('decayPlayerNeeds never writes the source flag back onto the player (flags are rebuilt without _desireSource)',
      api(`(() => {
        const h = house(20260821, 1);
        notePlayerDesireSource(h, 'flirted');
        const p = decayPlayerNeeds(h.player, 30, h);
        return Object.prototype.hasOwnProperty.call(p.flags, '_desireSource') === false;
      })()`));
check('the intimate gate is untouched by Phase 8: nude+intimate+mature opens, dressed never does',
      api(`(() => {
        const h = house(20260821, 2);
        const npc = Object.values(h.npcs)[0];
        const gs = { meta: { contentConfig: { contentFlags: { mature: true, romance: true } } } };
        npc.clothing = 'dressed';
        const dressed = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: gs });
        npc.clothing = 'nude';
        const nude = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: gs });
        return !(dressed.includes('nipples') || dressed.includes('breasts'))
          && (nude.includes('nipples') || nude.includes('breasts'));
      })()`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
