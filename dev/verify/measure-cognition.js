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
//   3. Every need curve against the range its need actually reaches. A `below`
//      the need never gets under is a term that contributes nothing, forever.
//   4. Whether the apartment gets dirty on its own, which is what the
//      perception term has to score against.
//   5. The score distribution, and (since Phase 2) what commitments actually
//      get opened, held and broken.
//
// HOW IT WORKS. evaluateDrives is wrapped in the vm context: we re-run its own
// candidacy filter on its real arguments to capture the candidate set, then
// call the original and diff the cooldown stamps. setCooldown is called on
// exactly the firing paths, so a drive whose stamp equals currentTick after the
// call and did not before is one that fired. This survived the plan's Phase 2
// rewrite as promised — a commitment still sets a cooldown when it opens.
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
  //
  // The dirty value is DERIVED from each object def's own emits table — pick
  // whichever value of a state actually emits a signal, and take the strongest.
  // The version this replaced hardcoded them, and one was simply wrong: it set
  // clutter to 'heavy' where the state's values are tidy|cluttered, so no object
  // in the game has ever been made cluttered by this function and the "filthy
  // house" column understated clean_common for as long as it has existed. A
  // literal that has to agree with defs.world.js is a literal that will not.
  __filth = (g) => {
    for (const objs of Object.values(g.objects)) {
      for (const o of Object.values(objs)) {
        const emits = OBJECT_DEFS[o.defId] && OBJECT_DEFS[o.defId].emits;
        if (!emits) continue;
        for (const [stateKey, byValue] of Object.entries(emits)) {
          let worst = null, worstAt = -1;
          for (const [value, payload] of Object.entries(byValue)) {
            if (payload && payload.intensity > worstAt) { worst = value; worstAt = payload.intensity; }
          }
          if (worst !== null) o.state = { ...o.state, [stateKey]: worst };
        }
      }
    }
    return g;
  };

  __rows = [];
  __origEvaluateDrives = evaluateDrives;
  evaluateDrives = function (npc, npcId, npcs, resolved, gameState, rng, currentTick, opts) {
    opts = opts || {};
    const perceived = resolved.location ? mergePerceived(perceiveSignals(gameState, npcId, resolved.location)) : [];
    // Phase 2: candidacy is COGNITION's isDriveCandidate — the same one
    // scoreCandidates applies, including D15's per-drive conditions. This used
    // to re-implement evaluateDrives' inline filter; that filter no longer
    // exists, and an instrument with its own copy of a rule is an instrument
    // that can disagree with the thing it measures.
    const ranked = scoreCandidates(npc, npcId, gameState, resolved, perceived, opts);
    const eligible = ranked.map(c => c.driveId);

    // What the NPC was already in the middle of, BEFORE this tick's resolution.
    // resolveTick has already aged it, so a commitment here is one with time
    // left to run.
    const heldBefore = npc.commitment ? npc.commitment.id : null;

    const before = (npc.flags || {})[DRIVE_COOLDOWN_KEY] || {};
    const res = __origEvaluateDrives(npc, npcId, npcs, resolved, gameState, rng, currentTick, opts);
    const after = (res.updatedNpc && res.updatedNpc.flags && res.updatedNpc.flags[DRIVE_COOLDOWN_KEY]) || {};
    const heldAfter = gameState.npcs[npcId] && gameState.npcs[npcId].commitment;
    // npc-initiative-retiming Phase 2 (D2) moved cooldown stamps from a
    // within-day tick index to an absolute minute (clockToAbsolute space).
    // This instrument predates that and was still comparing against
    // currentTick — a 0..47 index a stamp in the thousands can never equal —
    // so "fired" always came back empty and every count below read 0.
    const nowAbs = clockToAbsolute(gameState.meta.clock);
    __rows.push({
      eligible,
      fired: Object.keys(after).filter(d => after[d] === nowAbs && before[d] !== nowAbs),
      scored: ranked.map(c => [c.driveId, +c.score.toFixed(4)]),
      heldBefore,
      // A commitment that was held coming in and is not the one held going out
      // was broken this tick — either by a challenger clearing breakMargin or
      // by D5's short list.
      broke: !!(heldBefore && (!heldAfter || heldAfter.id !== heldBefore)),
      opened: !!(heldAfter && heldAfter.startedAtAbs === clockToAbsolute(gameState.meta.clock) && heldAfter.id !== heldBefore),
    });
    return res;
  };

  // The twelve drives that resolve through the standard path. The other four
  // (peep/snoop/investigate/gift) route into a custom resolver. This used to be
  // derived from weight > 0, which meant the same set — but D1 retired weight,
  // so the resolver flags are now the only honest way to ask.
  __standard = () => Object.keys(DRIVE_DEFS).filter(d => {
    const x = DRIVE_DEFS[d];
    return !x.isPeepDrive && !x.isSnoopDrive && !x.isInvestigateDrive && !x.isGiftDrive;
  });
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
      // Score distribution: per drive, how often it was a candidate, what it
      // scored when it was, how often it cleared actionThreshold, and how often
      // it was the best thing on offer. A drive that is always a candidate and
      // never the winner is losing for a readable reason.
      const scoreBy = {}, topBy = {};
      let topClears = 0, anyCandidate = 0;
      // Phase 2: commitment. How many ticks are spent inside a pursuit somebody
      // already started, how many pursuits get opened, and how many get broken
      // before they run out.
      let heldTicks = 0, opened = 0, broke = 0;
      const openedBy = {};
      for (const r of __rows) {
        if (r.heldBefore) heldTicks++;
        if (r.opened) { opened++; openedBy[r.fired[0] || '?'] = (openedBy[r.fired[0] || '?'] || 0) + 1; }
        if (r.broke) broke++;
        const e = r.eligible.filter(d => S.has(d));
        const f = r.fired.filter(d => S.has(d));
        totalElig += e.length; totalFired += f.length;
        eligHist[e.length] = (eligHist[e.length] || 0) + 1;
        firedHist[f.length] = (firedHist[f.length] || 0) + 1;
        for (const d of r.eligible) eligBy[d] = (eligBy[d] || 0) + 1;
        for (const d of r.fired) firedBy[d] = (firedBy[d] || 0) + 1;
        if (e.length >= 1) { withChoice++; if (f.length >= 1) actedWithChoice++; }

        for (const [d, sc] of r.scored) {
          const a = scoreBy[d] || (scoreBy[d] = { n: 0, sum: 0, max: 0, over: 0 });
          a.n++; a.sum += sc; a.over += sc > COGNITION.actionThreshold ? 1 : 0;
          if (sc > a.max) a.max = sc;
        }
        if (r.scored.length) {
          anyCandidate++;
          const [wd, ws] = r.scored[0];
          if (ws > COGNITION.actionThreshold) { topClears++; topBy[wd] = (topBy[wd] || 0) + 1; }
        }
      }
      return JSON.stringify({ samples: __rows.length, eligHist, firedHist, eligBy, firedBy,
                              withChoice, actedWithChoice, totalFired, totalElig,
                              scoreBy, topBy, topClears, anyCandidate,
                              heldTicks, opened, broke, openedBy,
                              threshold: COGNITION.actionThreshold, target: COGNITION.targetActionsPerTick });
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
console.log('  down, never earns affection, and never leaves the room they start in.');
console.log('  peep_player / snoop_phone / gift_to_player / react_to_player reading 0 is');
console.log('  that, not a dead drive: since Phase 2 all four have candidacy conditions');
console.log('  (D15) that a stationary, propertyless, unloved player never satisfies.');
console.log('  verify-c2 is where each is shown firing in a state that does satisfy them.');

console.log('\n--- 3. NEED-CURVE REACHABILITY ---\n');
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
    // D14 deleted the last { need, op, threshold } gate from DRIVE_DEFS: a need
    // is a score term now, so what matters is whether the need ever gets under
    // the point its curve starts at. The failure mode is identical and this is
    // the same reading of it.
    const g = {};
    for (const [id, d] of Object.entries(DRIVE_DEFS)) {
      const u = d.utility && d.utility.need;
      if (u) g[id] = { need: u.need, below: u.below };
    }
    return JSON.stringify({ range, gates: g });
  })()
`));
console.log('  drive                  need          below       observed      verdict');
for (const [id, g] of Object.entries(gates.gates)) {
  const r = gates.range[g.need];
  if (!r) { console.log(`  ${id.padEnd(22)} ${g.need.padEnd(13)} (need not tracked)`); continue; }
  const span = `${Math.round(r.min)}..${Math.round(r.max)}`;
  console.log(`  ${id.padEnd(22)} ${g.need.padEnd(13)} ${String(g.below).padEnd(11)} ${span.padEnd(13)} ` +
              (r.min < g.below ? 'motivates' : '*** DEAD TERM ***'));
}
console.log('\n  The two drives this table was written for — sleep_recover (energy');
console.log('  gate 20 against a floor of 28) and seek_comfort (comfort gate 40');
console.log('  against a floor of exactly 40) — no longer have gates to be dead');
console.log('  behind. Their curves start at 50 and 70. Section 2 is where you');
console.log('  check they actually fire.');

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

console.log('--- 5. WHAT THE SCORER CHOSE (plan Phase 2) ---\n');
console.log('  No longer a shadow. As of Phase 2 evaluateDrives selects on exactly');
console.log('  these scores, so sections 1-2 above ARE this table\'s consequences.');
console.log('  "won the tick" counts ticks where this drive was the top candidate');
console.log('  above the threshold; it differs from "fired" in section 2 because a');
console.log('  tick spent inside a held pursuit never gets to choose.\n');
console.log(`  actionThreshold ${clean.threshold}   target ${clean.target} actions/npc-tick   (measured today: ${(clean.totalFired / clean.samples).toFixed(2)})\n`);
console.log('  drive                 scored    mean     max   over thr   won the tick');
for (const d of ALL) {
  const a = clean.scoreBy[d];
  if (!a) { console.log(`  ${d.padEnd(20)} ${'—'.padStart(7)}   (never a candidate)`); continue; }
  console.log(`  ${d.padEnd(20)} ${String(a.n).padStart(7)} ${(a.sum / a.n).toFixed(3).padStart(7)} ${a.max.toFixed(3).padStart(7)} ` +
              `${pc(a.over, a.n).padStart(10)} ${String(clean.topBy[d] || 0).padStart(14)}`);
}
console.log(`\n  npc-ticks with at least one candidate : ${clean.anyCandidate} (${pc(clean.anyCandidate, clean.samples)})`);
console.log(`  ...where the best one cleared the bar : ${clean.topClears} (${pc(clean.topClears, clean.anyCandidate)})`);

console.log('\n--- 6. COMMITMENT (plan Phase 2) ---\n');
console.log(`  Pursuits opened                  : ${clean.opened} (${(clean.opened / clean.samples).toFixed(3)} per npc-tick)`);
console.log(`  npc-ticks spent inside a pursuit : ${clean.heldTicks} (${pc(clean.heldTicks, clean.samples)})`);
console.log(`  Pursuits broken before they ran out: ${clean.broke} (${pc(clean.broke, clean.heldTicks)} of held ticks)`);
console.log(`  Mean ticks per pursuit           : ${clean.opened ? (1 + clean.heldTicks / clean.opened).toFixed(2) : '—'}`);
console.log('\n  A tick spent inside a pursuit is a tick that does not choose, so');
console.log('  holding LOWERS the action rate against the projection in section 5.');
console.log('  That is the point — three ticks of one chore reads as a person doing');
console.log('  something, three separate actions read as a queue of coincidences.\n');
console.log(`  Actions per npc-tick: ${(clean.totalFired / clean.samples).toFixed(3)} against a target of ${clean.target} (D2).`);
console.log('  PHASE 5 TUNES THIS, not Phase 2. The levers are actionThreshold, the');
console.log('  per-drive baseAppeal values, and holdMinutes. Read the "won the tick"');
console.log('  column beside "over thr" before moving any of them: a drive that is');
console.log('  often a candidate, often over the bar and never the winner is losing');
console.log('  to something specific, and raising its base fixes the wrong thing.\n');
