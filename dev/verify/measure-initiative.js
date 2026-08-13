// NPC initiative: how often the cast reaches for the player, and why.
//
// A TUNING INSTRUMENT, not a test — it prints, it does not assert. Phase 6 of
// src/ref/complete/npc-initiative-plan.md owns the rate (D21), and this is where
// every number in that phase's Handoff came from.
//
//   node dev/verify/measure-initiative.js
//
// Six readings, in the order the plan asks its questions:
//   1. THE RATE — overtures per NPC per day, by channel and by motive, across
//      the five arms Phases 3 and 4 measured. The headline D21 names.
//   2. THE GATE (D9) — how often the do-not-disturb set suppressed one, by
//      entry, and how many of those had a live motive AND satisfied proximity.
//      "Blocked" and "blocked something that was otherwise ready to fire" are
//      different numbers and only the second one is a tuning signal.
//   3. THE ENDINGS (D10/D28) — engaged / refused / lapsed under a simulated
//      player who actually answers, and what D10's diminishing curve does to
//      the rate of the ones that follow.
//   4. THE FEEDBACK LOOP — Phase 5's parked open question. `affection` is
//      `approach_player`'s strongest motive and D16's shared-activity delta is
//      its first non-conversation writer, so evenings in front of the TV now
//      feed the thing that makes an NPC cross the room. Measured against a
//      counterfactual player who does nothing.
//   5. THE LEVERS — sweeps of `OVERTURE.motiveWeight`, the per-def
//      `baseAppeal`, and `OVERTURE.textCooldownTicks`, so a retune has a curve
//      under it rather than an argument.
//   6. LONELINESS — Phase 4's parked open question. `text_player` lost
//      `utility.need: { social, below: 55 }` to D5, so this prints where
//      `needs.social` actually sits over a week: how much a loneliness motive
//      would ADD, before anyone decides whether it should exist.
//
// HOW IT WORKS. The population loop is verify-i3/i4's, which is the real
// engine through `resolveBatch` — plus the episode writer, because of the trap
// below. `overtureAllowed` and `overtureTextLine` are wrapped in the vm context
// to tally what they were asked at their real call sites; nothing here
// re-implements a candidacy rule, for the reason measure-cognition.js states
// (an instrument with its own copy of a rule is one that can disagree with the
// thing it measures).
//
// TRAP 1: resolveBatch returns { state, events, peepResults } and does NOT
// mutate its argument. Read gameState.npcs after calling it and every need
// reads a flat 50.
// TRAP 2: resolveBatch does not write episodes — ui.js's advanceAndResolve
// does, outside the tick. Without the writer loop below the knowledge layer
// stays empty and CURIOSITY, the one motive source measured alive, reads zero.
// TRAP 3: every relationship axis generates at 0 and moves only through the
// player. Anything relational is measured against nothing unless the arm moves
// it deliberately.

const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'sim.js', 'drives.js', 'cognition.js', 'overture.js', 'actions.js', 'npc.js'] });

const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
const HOUSES = 12, DAY = 48, DAYS = 7, SEED0 = 20260811, SEEDSTEP = 7919;
const pad = (s, n) => String(s).padEnd(n);
const num = (v, d = 3) => v.toFixed(d).padStart(d + 3);

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    g.player.location = 'living_room';
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  // verify-i4's, unchanged — the door defIds are 'bedroom_door'/'bathroom_door'
  // and a bucket with neither gets one. An earlier draft of this looked for
  // defId 'door', found nothing anywhere, and produced a "locked door" arm in
  // which the door was never locked: the approach fired and the knock never
  // did, which is the exact inverse of the truth.
  __lock = (g, state) => {
    const bucket = g.objects['room_' + g.player.location] || (g.objects['room_' + g.player.location] = {});
    const door = Object.values(bucket).find(o => o.defId === 'bedroom_door' || o.defId === 'bathroom_door');
    if (door) door.state = { ...door.state, lock: state };
    else bucket.__door = { id: '__door', defId: 'bedroom_door', state: { lock: state } };
    return getDoorState(g, g.player.location);
  };
  __eventImportance = (evt) => (typeof evt.importance === 'number') ? evt.importance
    : (MEMORY_IMPORTANCE[EVENT_IMPORTANCE[evt.type]] !== undefined
        ? MEMORY_IMPORTANCE[EVENT_IMPORTANCE[evt.type]] : MEMORY_IMPORTANCE.ambient);

  // --- The gate tally (reading 2) -----------------------------------------
  // Wrapped at overtureAllowed's real call site inside scoreOvertures, so the
  // reasons counted are the ones the scorer actually got. It is asked AFTER
  // the block filter and the cooldown and BEFORE proximity and motive, so a
  // raw block count over-reports; __gateReady re-asks the two later questions
  // through the engine's own functions to say how many blocks mattered.
  __gate = null;
  __origOvertureAllowed = overtureAllowed;
  overtureAllowed = function (gameState, overtureId) {
    const res = __origOvertureAllowed(gameState, overtureId);
    if (__gate) {
      __gate.asked++;
      if (!res.allowed) {
        __gate.blocked[res.reason] = (__gate.blocked[res.reason] || 0) + 1;
        // Would this one have gone anywhere if the gate had let it through?
        const npc = __gate.npc, npcId = __gate.npcId;
        const def = OVERTURE_DEFS[overtureId];
        const prox = OVERTURE_PROXIMITY[def.proximity];
        const playerRoom = gameState.player && gameState.player.location;
        const near = prox && (!prox.needsPlayerRoom || (__gate.location && playerRoom))
          && prox.test(__gate.location, playerRoom);
        const day = gameState.meta.clock.day;
        if (near && npc && bestMotive(def, npc, npcId, gameState, day)) {
          __gate.ready[res.reason] = (__gate.ready[res.reason] || 0) + 1;
        }
      }
    }
    return res;
  };
  __origScoreOvertures = scoreOvertures;
  scoreOvertures = function (npc, npcId, gameState, ctx) {
    if (__gate) { __gate.npc = npc; __gate.npcId = npcId; __gate.location = ctx.location; }
    return __origScoreOvertures(npc, npcId, gameState, ctx);
  };

  // --- The population loop --------------------------------------------------
  // opts:
  //   rel          — move every resident's axes before the run (TRAP 3)
  //   playerRoom   — pin the player's room, or null for "not in the flat"
  //   lock         — lock the door of the room the player is in
  //   playerFlags  — e.g. { _vulnerableState: 'sleeping' }
  //   answer       — { engage, refuse } probabilities for a player who ANSWERS
  //                  pending overtures (reading 3). Rolled off the run's own
  //                  seeded generator so an arm is reproducible.
  //   shareEvery   — every N ticks, the player does a shared activity with
  //                  whoever is in the room (reading 4)
  //   gate         — collect the gate tally
  __run = (seed, ticks, opts) => {
    opts = opts || {};
    let g = __mk(seed);
    const pin = () => {
      if ('playerRoom' in opts) g.player.location = opts.playerRoom;
      if (opts.playerFlags) g.player.flags = { ...(g.player.flags || {}), ...opts.playerFlags };
      if (opts.lock && g.player.location) __lock(g, 'locked');
    };
    pin();
    if (opts.rel) for (const id of __ids(g)) Object.assign(g.npcs[id].relPlayer, opts.rel);
    const rng = mulberry32(seed ^ 0x5eed);

    const byChannel = {}, byMotive = {}, byTone = {};
    let opened = 0, engaged = 0, refused = 0, lapsed = 0, refusedAfter = 0, sharedMinutes = 0;
    let prev = new Set();
    const gate = opts.gate ? { asked: 0, blocked: {}, ready: {} } : null;
    if (gate) __gate = gate;

    // A text leaves no record (awaitsAnswer: false), so it is invisible to the
    // record-diff below. verify-i4's technique: count it where its line is
    // built, which is the only moment a text exists.
    const origLine = overtureTextLine;
    overtureTextLine = function (record, rng2) {
      byChannel.text = (byChannel.text || 0) + 1;
      byMotive[record.motive] = (byMotive[record.motive] || 0) + 1;
      byTone[record.tone] = (byTone[record.tone] || 0) + 1;
      opened++;
      return origLine(record, rng2);
    };

    try {
      for (let t = 0; t < ticks; t++) {
        const r = resolveBatch(g, 1);
        g = r.state;
        pin();
        for (const evt of r.events) {
          const npc = g.npcs[evt.npcId];
          if (!npc) continue;
          g.npcs[evt.npcId] = addMemoryEpisode(npc, evt.day, formatEventText(evt, g.npcs),
            __eventImportance(evt), eventEmotionalTag(evt), evt.participants || []);
        }

        const now = new Set();
        for (const id of __ids(g)) {
          const n = g.npcs[id];
          if (!n.overture) continue;
          now.add(id);
          if (!prev.has(id)) {
            opened++;
            byChannel[n.overture.channel] = (byChannel[n.overture.channel] || 0) + 1;
            byMotive[n.overture.motive] = (byMotive[n.overture.motive] || 0) + 1;
            byTone[n.overture.tone] = (byTone[n.overture.tone] || 0) + 1;
            if ((n.flags && n.flags._overtureRefusals && n.flags._overtureRefusals.count) > 0) refusedAfter++;
          }
        }

        // The player answers (reading 3). ui.js's doOvertureRespond and
        // refuseOverturesInRoom are the real endings and the Node loader stops
        // before ui.js, so this reproduces the THREE consequences of a refusal
        // from the tables they read: the scaled delta (OVERTURE.refusalDelta x
        // overtureRefusalScale), the remembered fact, and the counter. The
        // named writers themselves — resolveOverture, noteOvertureRefused —
        // are the engine's (D19).
        if (opts.answer) {
          for (const id of Array.from(now)) {
            const npc = g.npcs[id];
            if (!isOverturePending(npc)) continue;
            const roll = rng();
            if (roll < (opts.answer.engage || 0)) {
              resolveOverture(g, id, 'engaged'); engaged++; now.delete(id);
            } else if (roll < (opts.answer.engage || 0) + (opts.answer.refuse || 0)) {
              const day = g.meta.clock.day;
              const scale = overtureRefusalScale(npc, day);
              const rec = resolveOverture(g, id, 'refused');
              const deltas = {};
              for (const [axis, v] of Object.entries(OVERTURE.refusalDelta)) deltas[axis] = v * scale;
              g.npcs[id] = applyRelDelta(g.npcs[id], deltas, day);
              const byCh = OVERTURE_DEFS[rec.overtureId] && OVERTURE_DEFS[rec.overtureId].refusalFacts;
              const tpl = (byCh && (byCh[rec.tone] || byCh.warm))
                || OVERTURE_REFUSAL_FACTS[rec.tone] || OVERTURE_REFUSAL_FACTS.warm;
              g.npcs[id] = addMemoryFact(g.npcs[id], {
                text: tpl.replace('{name}', (g.npcs[id].bible && g.npcs[id].bible.name) || 'your roommate'),
                day, importance: MEMORY_IMPORTANCE[OVERTURE.refusalFactImportance],
                category: 'relationship', provenance: 'witnessed',
                confidence: OVERTURE.refusalFactConfidence,
                emotionalTag: rec.tone === 'charged' ? 'romance' : 'warmth',
              });
              noteOvertureRefused(g, id, day);
              refused++; now.delete(id);
            }
          }
        }

        // The player spends the evening with whoever is in the room (reading
        // 4). resolveSharedActivity is D16's one writer and this calls it with
        // the ctx executeAction builds — the same predicate, the same rates,
        // the same cap.
        if (opts.shareEvery && t % opts.shareEvery === 0 && g.player.location) {
          const def = ACTION_DEFS[opts.shareAction || 'self.watch_tv'];
          const present = __ids(g).filter(id => g.npcs[id].location === g.player.location);
          if (present.length) {
            const minutes = resolveTimeCost(def, g, null);
            const out = resolveSharedActivity(g, def, { gameState: g, presentNpcIds: present }, minutes);
            if (out.withIds.length) sharedMinutes += minutes;
          }
        }

        for (const id of prev) if (!now.has(id)) lapsed++;
        prev = now;
      }
    } finally { overtureTextLine = origLine; __gate = null; }

    const ids = __ids(g);
    const rel = { affection: 0, comfort: 0, trust: 0, desire: 0 };
    for (const id of ids) for (const k of Object.keys(rel)) rel[k] += (g.npcs[id].relPlayer[k] || 0);
    for (const k of Object.keys(rel)) rel[k] /= (ids.length || 1);
    const social = [];
    for (const id of ids) social.push(g.npcs[id].needs.social);

    return { residents: ids.length, opened, engaged, refused, lapsed, refusedAfter,
             sharedMinutes, byChannel, byMotive, byTone, rel, social, gate };
  };

  // Every npc-tick's social need, for reading 6. Sampled off the same loop
  // rather than a second one so the population is identical.
  __socialCurve = (seed, ticks) => {
    let g = __mk(seed);
    const out = [];
    for (let t = 0; t < ticks; t++) {
      const r = resolveBatch(g, 1); g = r.state;
      for (const evt of r.events) {
        const npc = g.npcs[evt.npcId];
        if (!npc) continue;
        g.npcs[evt.npcId] = addMemoryEpisode(npc, evt.day, formatEventText(evt, g.npcs),
          __eventImportance(evt), eventEmotionalTag(evt), evt.participants || []);
      }
      for (const id of __ids(g)) out.push(Math.round(g.npcs[id].needs.social));
    }
    return out;
  };
`);

// ---------------------------------------------------------------------------
function runArm(opts, days = DAYS, houses = HOUSES) {
  const acc = { residents: 0, opened: 0, engaged: 0, refused: 0, lapsed: 0, refusedAfter: 0,
                sharedMinutes: 0, byChannel: {}, byMotive: {}, byTone: {},
                rel: { affection: 0, comfort: 0, trust: 0, desire: 0 }, social: [],
                gate: { asked: 0, blocked: {}, ready: {} } };
  for (let i = 0; i < houses; i++) {
    const r = J(`__run(${SEED0 + i * SEEDSTEP}, ${days * DAY}, ${JSON.stringify(opts)})`);
    acc.residents += r.residents;
    for (const k of ['opened', 'engaged', 'refused', 'lapsed', 'refusedAfter', 'sharedMinutes']) acc[k] += r[k];
    for (const t of ['byChannel', 'byMotive', 'byTone']) {
      for (const [k, v] of Object.entries(r[t])) acc[t][k] = (acc[t][k] || 0) + v;
    }
    for (const k of Object.keys(acc.rel)) acc.rel[k] += r.rel[k] / houses;
    acc.social.push(...r.social);
    if (r.gate) {
      acc.gate.asked += r.gate.asked;
      for (const [k, v] of Object.entries(r.gate.blocked)) acc.gate.blocked[k] = (acc.gate.blocked[k] || 0) + v;
      for (const [k, v] of Object.entries(r.gate.ready)) acc.gate.ready[k] = (acc.gate.ready[k] || 0) + v;
    }
  }
  acc.perNpcDay = acc.opened / (acc.residents * days);
  return acc;
}

const ARMS = [
  ['untouched', {}],
  ['fond (affection 0.9)', { rel: { affection: 0.9 } }],
  ['charged (desire 0.9)', { rel: { desire: 0.9, comfort: 0.30, affection: 0.30 } }],
  ['player out of the flat', { rel: { affection: 0.9 }, playerRoom: null }],
  ['player behind a locked door', { rel: { affection: 0.9 }, playerRoom: 'bedroom_player', lock: true }],
  ['player asleep all week', { rel: { affection: 0.9 }, playerFlags: { _vulnerableState: 'sleeping' } }],
];

console.log(`\n=== 1. THE RATE — ${HOUSES} households x 3 residents x ${DAYS} in-game days (D21) ===`);
console.log(`    ${pad('arm', 30)} ${'per NPC/day'}   channels / motives`);
const armResults = {};
for (const [name, opts] of ARMS) {
  const a = runArm({ ...opts, gate: true });
  armResults[name] = a;
  console.log(`    ${pad(name, 30)} ${num(a.perNpcDay)}     ${JSON.stringify(a.byChannel)}  ${JSON.stringify(a.byMotive)}  ${JSON.stringify(a.byTone)}`);
}

// ---------------------------------------------------------------------------
console.log(`\n=== 2. THE GATE (D9) — what the do-not-disturb set suppressed ===`);
console.log(`    Asked inside scoreOvertures, after the block filter and the cooldown and`);
console.log(`    before proximity and motive. "ready" re-asks those two: a block that`);
console.log(`    stopped an overture which had a live motive AND was in position — the`);
console.log(`    only one of the two numbers that is a tuning signal.`);
console.log(``);
console.log(`    D29's two lists are separated here because they mean opposite things. A`);
console.log(`    'not_x' is a \`requires\` miss — the knock channel asking whether the door`);
console.log(`    is shut, which is its whole reason to exist, not a suppression.\n`);
console.log(`    ${pad('arm', 30)} ${pad('asked', 8)} ${pad('DND blocks (ready)', 46)} requires misses`);
for (const [name] of ARMS) {
  const g = armResults[name].gate;
  const isReq = (k) => k.startsWith('not_');
  const dnd = Object.entries(g.blocked).filter(([k]) => !isReq(k)).sort((a, b) => b[1] - a[1]);
  const req = Object.entries(g.blocked).filter(([k]) => isReq(k)).sort((a, b) => b[1] - a[1]);
  const dndStr = dnd.map(([k, v]) => `${k} ${v} (${g.ready[k] || 0})`).join(', ') || '—';
  const reqStr = req.map(([k, v]) => `${k} ${v} (${g.ready[k] || 0})`).join(', ') || '—';
  console.log(`    ${pad(name, 30)} ${pad(g.asked, 8)} ${pad(dndStr, 46)} ${reqStr}`);
}

// ---------------------------------------------------------------------------
console.log(`\n=== 3. THE ENDINGS (D10/D28) — a player who actually answers ===`);
console.log(`    D10's curve is the second refusal costing half the first and the NPC's`);
console.log(`    NEXT motive scaling by the same number. "after a refusal" is how many`);
console.log(`    overtures opened by an NPC already carrying one inside the window.\n`);
console.log(`    ${pad('player', 30)} ${pad('per NPC/day', 12)} ${pad('engaged', 9)} ${pad('refused', 9)} ${pad('lapsed', 9)} after-refusal`);
for (const [label, answer] of [
  ['ignores everything', null],
  ['engages half', { engage: 0.5, refuse: 0 }],
  ['refuses half', { engage: 0, refuse: 0.5 }],
  ['refuses everything', { engage: 0, refuse: 1 }],
]) {
  const a = runArm({ rel: { affection: 0.9 }, ...(answer ? { answer } : {}) });
  console.log(`    ${pad(label, 30)} ${pad(num(a.perNpcDay), 12)} ${pad(a.engaged, 9)} ${pad(a.refused, 9)} ${pad(a.lapsed, 9)} ${a.refusedAfter}` +
    `   affection ${a.rel.affection.toFixed(3)}`);
}

// ---------------------------------------------------------------------------
console.log(`\n=== 4. THE FEEDBACK LOOP — Phase 5's shared-activity delta into Phase 3's motive ===`);
const SA = J('SHARED_ACTIVITY');
console.log(`    D16's delta is affection's first non-conversation writer. The affection`);
console.log(`    motive's floor is REL_CONSEQUENCES.affectionGiftThreshold = ${J('REL_CONSEQUENCES.affectionGiftThreshold')},`);
console.log(`    and the cap is ${SA.dailyCreditMinutes} credited minutes a day. Starting from 0:\n`);
console.log(`    ${pad('player', 34)} ${pad('days', 6)} ${pad('shared min', 11)} ${pad('affection', 10)} ${pad('per NPC/day', 12)} motives`);
for (const [label, opts, days] of [
  ['does nothing', {}, 7],
  ['watches TV every 4 ticks', { shareEvery: 4 }, 7],
  ['watches TV every 4 ticks', { shareEvery: 4 }, 28],
  ['watches TV every tick (at the cap)', { shareEvery: 1 }, 28],
]) {
  const a = runArm(opts, days, 6);
  console.log(`    ${pad(label, 34)} ${pad(days, 6)} ${pad(a.sharedMinutes, 11)} ${pad(a.rel.affection.toFixed(4), 10)} ${pad(num(a.perNpcDay), 12)} ${JSON.stringify(a.byMotive)}`);
}

// ---------------------------------------------------------------------------
console.log(`\n=== 5. THE LEVERS — what each constant actually buys ===`);
// The precondition isOnCooldown states in its own comment ("all cooldownTicks
// are well under ticksPerDay, so a wrapped delta is exact") and what the table
// actually holds. A stamp is a 0..47 index that wraps at midnight, so a
// cooldown at or above ticksPerDay can never elapse: the wrapped delta is
// always below it and the entry is on cooldown forever after its first firing.
// This is D26's finding in the one place D26 did not reach.
const TPD = J('CLOCK.ticksPerDay');
console.log(`    Cooldowns against CLOCK.ticksPerDay = ${TPD}. A stamp is a 0..47 index that`);
console.log(`    wraps, so a cooldown >= ${TPD} NEVER elapses — the entry fires once per game.\n`);
const cds = J(`Object.fromEntries([...Object.entries(OVERTURE_DEFS), ...Object.entries(DRIVE_DEFS)]
  .filter(([, d]) => (d.cooldownTicks || 0) > 0)
  .map(([k, d]) => [k, d.cooldownTicks]))`);
for (const [k, v] of Object.entries(cds).sort((a, b) => b[1] - a[1])) {
  if (v >= TPD) console.log(`      ${pad(k, 24)} ${pad(v, 5)} PERMANENT after the first firing`);
}
console.log(`      (${Object.values(cds).filter(v => v < TPD).length} others are under the bound and elapse normally)\n`);
console.log(`    Measured on the FOND arm (affection 0.9), 6 households x 7 days, because`);
console.log(`    the untouched arm has one live motive and moves too little to read.\n`);

function sweep(label, setter, values, opts) {
  console.log(`    ${label}`);
  const saved = api(`JSON.stringify(${setter.read})`);
  for (const v of values) {
    api(setter.write(v));
    const a = runArm(opts || { rel: { affection: 0.9 } }, DAYS, 6);
    console.log(`      ${pad(setter.name + ' = ' + JSON.stringify(v), 34)} ${num(a.perNpcDay)}/npc/day  ${JSON.stringify(a.byChannel)}`);
  }
  api(setter.write(JSON.parse(saved)));
}

// NOT `OVERTURE.motiveWeight = v`. Every entry copies the value into its own
// `utility.motive.weight` at config load, so writing the source constant after
// load moves nothing — the first version of this sweep printed five identical
// rows, which reads exactly like a lever that does not work.
sweep('OVERTURE.motiveWeight — how much a maxed motive adds to baseAppeal', {
  name: 'motiveWeight', read: 'Object.values(OVERTURE_DEFS).map(d => d.utility.motive.weight)',
  write: (v) => `Object.values(OVERTURE_DEFS).forEach((d, i) => d.utility.motive.weight = ${JSON.stringify(v)}${Array.isArray(v) ? '[i]' : ''})`,
}, [0.25, 0.35, 0.50, 0.70, 0.90]);

sweep('OVERTURE.textCooldownTicks — the lever the Phase 4 Handoff named', {
  name: 'textCooldownTicks', read: 'OVERTURE_DEFS.text_player.cooldownTicks',
  write: (v) => `OVERTURE_DEFS.text_player.cooldownTicks = ${JSON.stringify(v)}`,
}, [6, 12, 24, 48, 96]);

sweep('approach_player.utility.baseAppeal — what it has to beat a chore by', {
  name: 'approach baseAppeal', read: 'OVERTURE_DEFS.approach_player.utility.baseAppeal',
  write: (v) => `OVERTURE_DEFS.approach_player.utility.baseAppeal = ${JSON.stringify(v)}`,
}, [0.20, 0.30, 0.40, 0.50]);

sweep('text_player.utility.baseAppeal — the cheap channel', {
  name: 'text baseAppeal', read: 'OVERTURE_DEFS.text_player.utility.baseAppeal',
  write: (v) => `OVERTURE_DEFS.text_player.utility.baseAppeal = ${JSON.stringify(v)}`,
}, [0.10, 0.16, 0.22, 0.30]);

// The two channels the wrap defect pinned at once-per-game. Swept on the arms
// that can reach them at all: a proposal needs the player in the room, a knock
// needs them behind a shut door.
sweep('propose_player.cooldownTicks — how often a plan may be offered', {
  name: 'propose cooldown', read: 'OVERTURE_DEFS.propose_player.cooldownTicks',
  write: (v) => `OVERTURE_DEFS.propose_player.cooldownTicks = ${JSON.stringify(v)}`,
}, [12, 24, 36, 47, 48]);

sweep('knock_player.cooldownTicks — the most intrusive channel', {
  name: 'knock cooldown', read: 'OVERTURE_DEFS.knock_player.cooldownTicks',
  write: (v) => `OVERTURE_DEFS.knock_player.cooldownTicks = ${JSON.stringify(v)}`,
}, [12, 24, 36, 47, 96], { rel: { affection: 0.9 }, playerRoom: 'bedroom_player', lock: true });

// ---------------------------------------------------------------------------
console.log(`\n=== 6. LONELINESS — the motive Phase 4 lost to D5, as a number ===`);
console.log(`    text_player carried utility.need: { social, below: 55 } as a drive. D5`);
console.log(`    keeps utility.need off every overture, so an NPC who is simply lonely no`);
console.log(`    longer texts. What that costs, over ${HOUSES} households x ${DAYS} days:\n`);
const social = [];
for (let i = 0; i < HOUSES; i++) social.push(...J(`__socialCurve(${SEED0 + i * SEEDSTEP}, ${DAYS * DAY})`));
social.sort((a, b) => a - b);
const q = (p) => social[Math.min(social.length - 1, Math.floor(p * social.length))];
console.log(`    needs.social over ${social.length} npc-ticks:  min ${q(0)}  p10 ${q(0.10)}  p25 ${q(0.25)}  median ${q(0.5)}  p75 ${q(0.75)}  max ${social[social.length - 1]}`);
for (const bar of [25, 40, 55, 70]) {
  const below = social.filter(v => v < bar).length;
  console.log(`      below ${pad(bar, 4)} ${pad((100 * below / social.length).toFixed(1) + '%', 8)} of npc-ticks — a loneliness motive live this often`);
}
console.log(`\n    Against a measured ${armResults['untouched'].perNpcDay.toFixed(3)}/NPC/day on the untouched arm,`);
console.log(`    of which ${JSON.stringify(armResults['untouched'].byMotive)}.`);
console.log('');
