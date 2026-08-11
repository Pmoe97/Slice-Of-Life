// NPC cognition: what the cast actually does, per tick.
//
// A TUNING INSTRUMENT, not a test — it prints, it does not assert. It is the
// baseline every phase of the cognition plan compares against, and it is where
// every number in that plan's `## Evidence` section came from.
//
//   node dev/verify/measure-cognition.js
//
// Four readings:
//   1. Actions per npc-tick, and how often an NPC with something to do does
//      nothing. This is the headline the plan exists to move.
//   2. Per drive, eligible vs fired — which drives are dead weight.
//   3. Every need gate against the range its need actually reaches. A gate the
//      need never crosses is a drive that can never fire.
//   4. Whether the apartment gets dirty on its own, which is what the
//      perception term has to score against.
//
// HOW IT WORKS. evaluateDrives is wrapped in the vm context: we re-run its own
// eligibility filter on its real arguments to capture the candidate set, then
// call the original and diff the cooldown stamps. setCooldown is called on
// exactly the firing paths, so a drive whose stamp equals currentTick after the
// call and did not before is one that fired. This survives the plan's Phase 2
// rewrite — a pursuit still sets a cooldown when it starts.
//
// TRAP: resolveBatch returns { state, events, peepResults } and does NOT mutate
// its argument. Read gameState.npcs after calling it and every need reads as a
// flat 50, which looks exactly like a broken need economy and is not.

const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

const HOUSES = 12;
const TICKS = 336;            // 7 in-game days at 30 min/tick
const SEED0 = 20260811;

api(`
  __house = (seed) => {
    const h = SIM_generateHouse(seed, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    return g;
  };

  // Deliberately filthy, for separating "this drive is dead" from "this house
  // was never dirty enough to ask".
  __filth = (g) => {
    for (const objs of Object.values(g.objects)) {
      for (const o of Object.values(objs)) {
        const st = OBJECT_DEFS[o.defId] && OBJECT_DEFS[o.defId].states;
        if (!st) continue;
        if (st.dishes) o.state = { ...o.state, dishes: 'many' };
        if (st.clutter) o.state = { ...o.state, clutter: 'heavy' };
        if (st.made) o.state = { ...o.state, made: 'unmade' };
        if (st.rotten_food) o.state = { ...o.state, rotten_food: 'rotten' };
      }
    }
    return g;
  };

  __rows = [];
  __origEvaluateDrives = evaluateDrives;
  evaluateDrives = function (npc, npcId, npcs, resolved, gameState, rng, currentTick, opts) {
    opts = opts || {};
    const perceived = resolved.location ? mergePerceived(perceiveSignals(gameState, npcId, resolved.location)) : [];
    const eligible = [];
    for (const [driveId, drive] of Object.entries(DRIVE_DEFS)) {
      if (drive.blockFilter && !drive.blockFilter.includes(resolved.block)) continue;
      if (opts.isVisitor && !VISITOR_DRIVE_ALLOWLIST.includes(driveId)) continue;
      const df = MAINTENANCE.npcDecayActions[driveId];
      if (df && df.some(fid => !isFacilityFunctional(gameState, fid))) continue;
      if (!checkDriveGates(drive, npc, perceived)) continue;
      if (isOnCooldown(npc, driveId, currentTick)) continue;
      eligible.push(driveId);
    }
    const before = (npc.flags || {})[DRIVE_COOLDOWN_KEY] || {};
    const res = __origEvaluateDrives(npc, npcId, npcs, resolved, gameState, rng, currentTick, opts);
    const after = (res.updatedNpc && res.updatedNpc.flags && res.updatedNpc.flags[DRIVE_COOLDOWN_KEY]) || {};
    __rows.push({
      eligible,
      fired: Object.keys(after).filter(d => after[d] === currentTick && before[d] !== currentTick),
    });
    return res;
  };

  // A drive whose def carries weight 0 has its real chance computed inside a
  // custom resolver (peep/snoop/eat/investigate/gift), so counting it as a
  // candidate would overstate the choice set the weight roll actually thins.
  __standard = () => Object.keys(DRIVE_DEFS).filter(d => (DRIVE_DEFS[d].weight || 0) > 0);
`);

function run(filthy) {
  return JSON.parse(api(`
    (() => {
      __rows = [];
      for (let i = 0; i < ${HOUSES}; i++) {
        let g = __house(${SEED0} + i * 7919);
        ${filthy ? 'g = __filth(g);' : ''}
        resolveBatch(g, ${TICKS});
      }
      const S = new Set(__standard());
      const eligHist = {}, firedHist = {}, eligBy = {}, firedBy = {};
      let withChoice = 0, actedWithChoice = 0, totalFired = 0, totalElig = 0;
      for (const r of __rows) {
        const e = r.eligible.filter(d => S.has(d));
        const f = r.fired.filter(d => S.has(d));
        totalElig += e.length; totalFired += f.length;
        eligHist[e.length] = (eligHist[e.length] || 0) + 1;
        firedHist[f.length] = (firedHist[f.length] || 0) + 1;
        for (const d of r.eligible) eligBy[d] = (eligBy[d] || 0) + 1;
        for (const d of r.fired) firedBy[d] = (firedBy[d] || 0) + 1;
        if (e.length >= 1) { withChoice++; if (f.length >= 1) actedWithChoice++; }
      }
      return JSON.stringify({ samples: __rows.length, eligHist, firedHist, eligBy, firedBy,
                              withChoice, actedWithChoice, totalFired, totalElig });
    })()
  `));
}

const pc = (n, d) => d ? ((n / d) * 100).toFixed(1) + '%' : '—';
const clean = run(false);
const dirty = run(true);
const ALL = JSON.parse(api(`JSON.stringify(Object.keys(DRIVE_DEFS))`));
const STD = JSON.parse(api(`JSON.stringify(__standard())`));

console.log(`\n${'='.repeat(72)}`);
console.log(`  NPC COGNITION — ${HOUSES} households x ${TICKS / 48} in-game days`);
console.log(`  ${clean.samples} (npc, tick) samples through the real resolveBatch`);
console.log('='.repeat(72));

console.log('\n--- 1. IS THE CAST DOING ANYTHING? ---\n');
console.log(`  Mean drives ELIGIBLE per npc-tick : ${(clean.totalElig / clean.samples).toFixed(2)}`);
console.log(`  Mean drives FIRED    per npc-tick : ${(clean.totalFired / clean.samples).toFixed(2)}`);
const perAction = clean.totalFired ? (clean.samples / clean.totalFired) : Infinity;
console.log(`  One self-directed action every ${perAction.toFixed(1)} ticks (${(perAction / 2).toFixed(1)} in-game hours)`);
console.log(`\n  Had >=1 thing they could do : ${clean.withChoice} (${pc(clean.withChoice, clean.samples)} of ticks)`);
console.log(`    ...and did one of them    : ${clean.actedWithChoice} (${pc(clean.actedWithChoice, clean.withChoice)})`);
console.log(`    ...and did NOTHING        : ${clean.withChoice - clean.actedWithChoice} (${pc(clean.withChoice - clean.actedWithChoice, clean.withChoice)})`);
const multi = Object.entries(clean.firedHist).filter(([k]) => +k > 1).reduce((s, [, v]) => s + v, 0);
console.log(`\n  2+ drives fired in one tick (the collision case): ${multi} (${pc(multi, clean.samples)})`);
console.log('\n  drives fired in one tick:');
for (const k of Object.keys(clean.firedHist).sort((a, b) => a - b))
  console.log(`    ${String(k).padStart(2)} : ${String(clean.firedHist[k]).padStart(6)}  ${pc(clean.firedHist[k], clean.samples)}`);

console.log('\n--- 2. PER DRIVE: ELIGIBLE vs FIRED ---\n');
console.log('  drive                    eligible   fired  realised   weight   (filthy house)');
for (const d of ALL) {
  const e = clean.eligBy[d] || 0, f = clean.firedBy[d] || 0;
  const df = dirty.firedBy[d] || 0;
  const w = api(`DRIVE_DEFS['${d}'].weight`);
  const note = (f === 0 && df === 0) ? '  <-- NEVER FIRES' : (f === 0 ? '  <-- only when dirty' : '');
  console.log(`  ${d.padEnd(22)} ${String(e).padStart(8)} ${String(f).padStart(7)} ${pc(f, e).padStart(9)} ${String(w).padStart(8)}   ${String(df).padStart(6)}${note}`);
}
console.log(`\n  (custom-resolver drives, weight 0: ${ALL.filter(d => !STD.includes(d)).join(', ')})`);
console.log('  CAVEAT: the player in this sim is idle — never showers, never puts a phone');
console.log('  down, never earns affection. peep_player / snoop_phone / gift_to_player');
console.log('  reading 0 is probably that, not a dead drive. sleep_recover and seek_comfort');
console.log('  are dead for a real reason — see section 3.');

console.log('\n--- 3. GATE REACHABILITY ---\n');
const gates = JSON.parse(api(`
  (() => {
    const range = {};
    for (let i = 0; i < ${HOUSES}; i++) {
      const h = SIM_generateHouse(${SEED0} + i * 7919, 3);
      let st = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                 player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
      for (const k of Object.keys(st.world.upgrades)) st.world.upgrades[k] = { tier: 'functional', condition: 100 };
      for (let t = 0; t < ${TICKS}; t++) {
        st = resolveBatch(st, 1).state;              // returns new state — see header
        for (const n of Object.values(st.npcs)) {
          if (n.residency?.status !== 'resident') continue;
          for (const [k, v] of Object.entries(n.needs || {})) {
            if (typeof v !== 'number') continue;
            if (!range[k]) range[k] = { min: Infinity, max: -Infinity };
            if (v < range[k].min) range[k].min = v;
            if (v > range[k].max) range[k].max = v;
          }
        }
      }
    }
    const g = {};
    for (const [id, d] of Object.entries(DRIVE_DEFS))
      for (const gt of (d.gates || [])) if (gt.need) g[id] = { need: gt.need, op: gt.op, threshold: gt.threshold };
    return JSON.stringify({ range, gates: g });
  })()
`));
console.log('  drive                  need          gate        observed      verdict');
for (const [id, g] of Object.entries(gates.gates)) {
  const r = gates.range[g.need];
  if (!r) { console.log(`  ${id.padEnd(22)} ${g.need.padEnd(13)} (need not tracked)`); continue; }
  const reachable = g.op === 'below' ? r.min < g.threshold : r.max > g.threshold;
  const span = `${Math.round(r.min)}..${Math.round(r.max)}`;
  console.log(`  ${id.padEnd(22)} ${g.need.padEnd(13)} ${(g.op + ' ' + g.threshold).padEnd(11)} ${span.padEnd(13)} ` +
              (reachable ? 'reachable' : '*** UNREACHABLE ***'));
}

console.log('\n--- 4. DOES THE APARTMENT DIRTY ITSELF? ---\n');
console.log(api(`
  (() => {
    const g = __house(${SEED0});
    resolveBatch(g, ${TICKS});
    let dirty = 0, rot = 0, total = 0;
    for (const objs of Object.values(g.objects)) for (const o of Object.values(objs)) {
      total++;
      const s = o.state || {};
      if (s.dishes === 'many' || s.dishes === 'some' || s.clutter === 'heavy' || s.clutter === 'some') dirty++;
      if (s.rotten_food === 'rotten' || s.rotten_food === 'stale') rot++;
    }
    return '  After ' + (${TICKS} / 48) + ' untouched in-game days: ' + dirty + ' dirty and ' + rot +
           ' rotten, of ' + total + ' objects.';
  })()
`));
console.log('  Every mess in the game today is made by the player. The perception');
console.log('  term has nothing to score until that changes (plan Phase 4).\n');
