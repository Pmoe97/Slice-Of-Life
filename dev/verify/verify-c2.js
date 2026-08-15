// NPC cognition plan, Phase 2 — choice and commitment.
//
//   node dev/verify/verify-c2.js
//
// Phase 1 made scoring a computed thing. This phase makes it a decision, and
// the decision has three properties worth pinning permanently:
//
//   1. ONE action per npc-tick, by construction. The collision the roadmap
//      named (2+ drives clobbering each other's activityOverride, 1.0% of
//      npc-ticks) cannot happen any more — not because it is unlikely, because
//      there is one winner and one writer.
//   2. A commitment is HELD. It occupies its holdMinutes, it is not re-resolved
//      on each of them, and it breaks on D5's rules rather than on anything
//      else.
//   3. D15's candidacy conditions. Four drives used to be scored as
//      unconditionally available while their real precondition sat inside
//      their resolver. Each must now be a candidate exactly when it is
//      actually possible — and, per design invariant 5, must still be shown
//      firing in a state the game can produce.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'drives.js', 'cognition.js', 'sim.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260811, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');
  __res = (block, location) => ({ block, location, activity: '', transit: null });

  // A long run through the REAL resolveBatch, collecting what each npc-tick did.
  // resolveBatch returns { state, events, peepResults } and does NOT mutate its
  // argument — thread the returned state or every need reads a flat 50.
  //
  // Continuous-behavior-engine Phase 2 (D3): the drive pass no longer runs for
  // a mid-hold NPC, so the per-call rows above only cover DECISION ticks.
  // The held-tick behaviour D4 pins has moved to the queue's derived record,
  // so the trace ALSO snapshots every resident's commitment state at the
  // START of each tick (tickRows) — that is what "occupies three
  // consecutive ticks" means under event-driven cadence.
  __trace = (houses, ticks) => {
    const rows = [];
    const tickRows = [];
    const orig = evaluateDrives;
    const origTick = resolveTick;
    evaluateDrives = function (npc, npcId, npcs, resolved, gameState, rng, currentTick, opts) {
      const before = (npc.flags || {})[DRIVE_COOLDOWN_KEY] || {};
      const heldBefore = npc.commitment ? { ...npc.commitment } : null;
      const res = orig(npc, npcId, npcs, resolved, gameState, rng, currentTick, opts);
      const after = (res.updatedNpc && res.updatedNpc.flags && res.updatedNpc.flags[DRIVE_COOLDOWN_KEY]) || {};
      rows.push({
        npcId, currentTick, clockAbs: clockToAbsolute(gameState.meta.clock), heldBefore,
        fired: Object.keys(after).filter(d => after[d] === clockToAbsolute(gameState.meta.clock) && before[d] !== clockToAbsolute(gameState.meta.clock)),
        held: gameState.npcs[npcId].commitment ? { ...gameState.npcs[npcId].commitment } : null,
        activity: res.activityOverride,
        events: res.events.length,
      });
      return res;
    };
    resolveTick = function (gameState) {
      const nowAbs = clockToAbsolute(gameState.meta.clock);
      const states = [];
      for (const [id, npc] of Object.entries(gameState.npcs)) {
        if (!npc || npc.residency.status !== 'resident') continue;
        states.push({
          npcId: id,
          held: npc.commitment ? { ...npc.commitment } : null,
          activity: npc.activity || null,
          // D6 (Phase 5): a pending interrupt is a DESIGNED early-release
          // trigger, not a flat-scan violation — read pre-tick, same moment
          // held/activity are captured, so a re-decision this tick can be
          // told apart from an unexplained one.
          interrupt: npc.commitment ? shouldInterruptCommitment(npc, npc.commitment) : null,
        });
      }
      tickRows.push({ tick: getTickIndex(gameState.meta.clock.minutes), nowAbs, g: gameState, states });
      return origTick(gameState);
    };
    try {
      for (let i = 0; i < houses; i++) {
        let g = __mk(20260811 + i * 7919);
        g = resolveBatch(g, ticks).state;
      }
    } finally { evaluateDrives = orig; resolveTick = origTick; }
    return { rows, tickRows };
  };
`);

const HOUSES = 6, TICKS = 336;
api(`__tr = __trace(${HOUSES}, ${TICKS}); __rows = __tr.rows; __tickRows = __tr.tickRows;`);
const N = api(`__rows.length`);
console.log(`\n(${N} npc-ticks through the real resolveBatch, ${HOUSES} households x ${TICKS / 48} in-game days)`);

// ---------------------------------------------------------------------------
console.log('\nthe weight roll is gone and the scorer decides');
const fs = require('fs');
const srcOf = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/([^:])\/\/.*$/gm, '$1');

check('evaluateDrives no longer rolls against drive.weight',
      !/rng\(\)\s*>\s*drive\.weight/.test(srcOf('drives.js')),
      'D1 retires weight as a probability');
check('evaluateDrives selects through scoreCandidates + choosePursuit',
      /scoreCandidates\(/.test(srcOf('drives.js')) && /choosePursuit\(/.test(srcOf('drives.js')));
const SRCFILES = fs.readdirSync(path.join(__dirname, '..', '..', 'src', 'srcfiles')).filter(f => f.endsWith('.js'));
check('nothing in the game reads a DRIVE_DEFS entry\'s weight any more',
      SRCFILES.every(f => !/\bdrive\.weight\b|DRIVE_DEFS\[[^\]]+\]\.weight/.test(srcOf(f))),
      'D1: weight stays on the defs as the historical record of what each probability was, read by nothing');
check('no need gate survives in DRIVE_DEFS (D14)', api(`
  Object.values(DRIVE_DEFS).every(d => (d.gates || []).every(g => !g.need))
`), api(`JSON.stringify(Object.entries(DRIVE_DEFS).filter(([,d]) => (d.gates||[]).some(g => g.need)).map(([k]) => k))`));
check('but signal gates are untouched — they are about the action being possible', api(`
  DRIVE_DEFS.clean_common.gates.some(g => g.signal) && DRIVE_DEFS.investigate_smell.gates.some(g => g.signal)
`));

// ---------------------------------------------------------------------------
console.log('\n(D3) exactly one action per npc-tick, by construction');
check('no npc-tick ever fires two drives', api(`
  __rows.every(r => r.fired.length <= 1)
`), api(`JSON.stringify(__rows.filter(r => r.fired.length > 1).slice(0, 3))`));
check('and the collision the roadmap named is now literally impossible, not merely rare', api(`
  __rows.filter(r => r.fired.length > 1).length === 0
`), 'measured at 1.0% of npc-ticks before this phase');
// D3 is meant to be impossible-by-construction, and this is the construction: a
// commitment is only ever BUILT or DELETED in one file. sim.js forwards the
// value through npcUpdates so the tick's NPC merge cannot drop it (the same
// merge that silently threw away memory replacements before Plan 0 fixed it),
// which is a carry, not a second opinion about what the NPC is doing.
//
// Continuous-behavior-engine Phase 1 (commitment substrate): two named writers
// now, where there used to be three — ageCommitment compares `completesAtAbs`
// against the clock instead of rewriting a `ticksLeft` countdown, so it never
// rebuilds the record. Build + delete are the whole of the write surface.
const commitmentWrites = [];
for (const f of SRCFILES) {
  for (const m of srcOf(f).matchAll(/\w+\.commitment\s*=\s*\{/g)) commitmentWrites.push(`${f}: builds`);
  for (const m of srcOf(f).matchAll(/delete\s+\w+\.commitment/g)) commitmentWrites.push(`${f}: deletes`);
}
check('npc.commitment is only ever built or deleted in cognition.js',
      commitmentWrites.length >= 2 && commitmentWrites.every(w => w.startsWith('cognition.js')),
      JSON.stringify(commitmentWrites));
check('and the named writers are the ones the plan called for',
      /function openCommitment\(/.test(srcOf('cognition.js')) &&
      /function releaseCommitment\(/.test(srcOf('cognition.js')) &&
      /function ageCommitment\(/.test(srcOf('cognition.js')));
check('sim.js never builds or deletes a commitment — it only carries it through the merge',
      !/\bcommitment\s*=\s*\{/.test(srcOf('sim.js')) &&
      !/delete\s+\w+\.commitment/.test(srcOf('sim.js')) &&
      /npcUpdates\[id\]\.commitment = postDrive\.commitment/.test(srcOf('sim.js')),
      'the merge carry is the only legal touch: a stale pre-tick copy in npcUpdates must never win');

// ---------------------------------------------------------------------------
console.log('\n(D4) a commitment is held, and is not re-resolved while it is');
check('some drive with holdMinutes 90 was observed occupying three consecutive ticks', api(`
  (() => {
    // Under Phase 2 (D3) a commitment occupies holdMinutes of clock:
    // it opens during the decision tick, then is present at the START of the
    // next holdMinutes/30-1 ticks (its completion tick inclusive —
    // ageCommitment releases it mid-tick). A holdMinutes 90 drive therefore
    // shows up as 3+ consecutive start-of-tick presences of the same startedAtAbs.
    const byNpc = {};
    for (const row of __tickRows) for (const s of row.states) (byNpc[s.npcId] = byNpc[s.npcId] || []).push(s);
    for (const rows of Object.values(byNpc)) {
      for (let i = 0; i + 2 < rows.length; i++) {
        const h = rows[i].held;
        if (!h || h.kind !== 'drive' || (DRIVE_DEFS[h.id].utility.holdMinutes || 1) < 90) continue;
        const b1 = rows[i+1].held, b2 = rows[i+2].held;
        if (b1 && b2 && h.startedAtAbs === b1.startedAtAbs && h.startedAtAbs === b2.startedAtAbs) return true;
      }
    }
    return false;
  })()
`));
check('a mid-hold NPC is not re-resolved at all — the flat scan is gone (D3)', api(`
  (() => {
    // The strongest form of "a held tick fires nothing": a commitment with
    // time left to run triggers zero evaluateDrives calls, because the due
    // set (cognition.js's DECISION QUEUE) does not contain its holder. This
    // subsumes the old fired/events per-held-tick checks, which measured the
    // held branch short-circuiting the drive loop; that branch no longer
    // runs at all. A tick where shouldInterruptCommitment fires is exempt —
    // D6 (Phase 5) re-arms the decision on purpose, the same as a completion.
    // Match calls to held ticks on the ABSOLUTE minute: currentTick is the
    // within-day tick index getTickIndex(clock.minutes) and wraps at midnight,
    // so matching on it across a 7-day run would match a call at within-day
    // tick 19 on day 3 against a held tick at within-day tick 19 on day 1 —
    // phantom mid-hold resolutions. clockToAbsolute does not wrap, and the
    // clock does not move within a tick, so a call's clockAbs is always the
    // same minute as its tick's row.nowAbs.
    const callAbs = {};
    for (const r of __rows) (callAbs[r.npcId] = callAbs[r.npcId] || new Set()).add(r.clockAbs);
    for (const row of __tickRows) for (const s of row.states) {
      if (!s.held || row.nowAbs >= s.held.completesAtAbs) continue;   // completion tick re-decides on purpose
      if (s.interrupt) continue;   // D6 early release — re-decides on purpose
      if (callAbs[s.npcId] && callAbs[s.npcId].has(row.nowAbs)) return false;
    }
    return true;
  })()
`), 'evaluateDrives ran for an NPC whose commitment had time left to run and no interrupt trigger fired');
check('a mid-hold tick still wears the commitment\'s activity', api(`
  (() => {
    // The held activity now flows through the queue's derived record into
    // pass 2's npcUpdates, not through evaluateDrives' activityOverride —
    // npc.activity is what the scene reader renders, and it must be the
    // commitment's label for the whole hold. EXCEPT kind 'work' (D5/C4):
    // one long commitment spans the walk out, the off-map shift and the
    // walk back, so its displayed activity legitimately changes mid-hold
    // ("heading to work" -> "at work") while commitmentActivity(held) stays
    // the label the commitment opened with — measured, 1219 of 1219
    // mismatches over the population run were exactly this, none unexplained.
    for (const row of __tickRows) for (const s of row.states) {
      if (!s.held || row.nowAbs >= s.held.completesAtAbs) continue;
      if (s.held.kind === 'work') continue;
      if (s.activity !== commitmentActivity(s.held)) return false;
    }
    return true;
  })()
`), 'this is what the scene reader renders — the hold has to be visible');
check('a held commitment\'s completion time never moves', api(`
  (() => {
    // Phase 1 holds by absolute time — ageCommitment compares the clock, it
    // never rewrites the record. Same startedAtAbs across consecutive
    // presences must mean the same completesAtAbs, or the merge resurrected
    // a stale copy.
    const byNpc = {};
    for (const row of __tickRows) for (const s of row.states) (byNpc[s.npcId] = byNpc[s.npcId] || []).push(s);
    for (const rows of Object.values(byNpc)) {
      for (let i = 0; i + 1 < rows.length; i++) {
        const a = rows[i].held, b = rows[i+1].held;
        if (a && b && a.startedAtAbs === b.startedAtAbs && a.completesAtAbs !== b.completesAtAbs) return false;
      }
    }
    return true;
  })()
`));
check('no commitment outlives its holdMinutes', api(`
  (() => {
    for (const row of __tickRows) for (const s of row.states) {
      // Phase 5 (D5): a work commitment outlives any drive holdMinutes BY
      // DESIGN — its one duration is the whole shift. The hold contract only
      // applies to drive commitments, so those are what this pins.
      if (!s.held || s.held.kind !== 'drive') continue;
      if (s.held.completesAtAbs - s.held.startedAtAbs >
          (DRIVE_DEFS[s.held.id].utility.holdMinutes || 1)) return false;
    }
    return true;
  })()
`));
check('commitments are actually held in practice, not opened and dropped', api(`
  (() => {
    const opened = __rows.filter(r => r.fired.length === 1 && r.held).length;
    let heldTicks = 0;
    for (const row of __tickRows) for (const s of row.states) if (s.held) heldTicks++;
    return opened > 100 && heldTicks / opened > 0.4;
  })()
`), api(`
  (() => {
    const opened = __rows.filter(r => r.fired.length === 1 && r.held).length;
    let heldTicks = 0;
    for (const row of __tickRows) for (const s of row.states) if (s.held) heldTicks++;
    return 'opened ' + opened + ', held ticks ' + heldTicks + ', mean ' + (1 + heldTicks / opened).toFixed(2);
  })()
`));

// ---------------------------------------------------------------------------
console.log('\n(D5) what breaks a commitment, and what does not');
check('a merely-higher score does not break it', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openCommitment(g, id, { driveId: 'do_laundry', score: 0.50, roomId: 'laundry', activity: 'doing laundry', perceived: [] });
    const ctx = { perceived: [], block: 'morning', nowAbs: 4 };
    // Measured against what do_laundry is worth RIGHT NOW, not the 0.50 it was
    // opened with — that is the whole of the "current score" rule below.
    const now = scoreDrive('do_laundry', g.npcs[id], { ...ctx, ignoreRecency: true }).score;
    const nudge = [{ driveId: 'eat', score: now + COGNITION.breakMargin - 0.01, terms: {} }];
    return shouldBreakPursuit(g.npcs[id], nudge, ctx) === null;
  })()
`), 'hysteresis is the point — a commitment that flips on a 0.01 edge is not a commitment');
check('a challenger clearing breakMargin does break it', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openCommitment(g, id, { driveId: 'do_laundry', score: 0.50, roomId: 'laundry', activity: 'doing laundry', perceived: [] });
    const ctx = { perceived: [], block: 'morning', nowAbs: 4 };
    const big = [{ driveId: 'eat', score: 5, terms: {} }];
    return shouldBreakPursuit(g.npcs[id], big, ctx) === 'outscored';
  })()
`));
check('the margin is measured against the commitment\'s CURRENT score, not the one it won with', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = { ...g.npcs[id], needs: { ...g.npcs[id].needs, hunger: 5 } };
    g.npcs[id] = npc;
    // Opened at a fictitious 0.10 while the drive actually scores ~0.9 right now.
    openCommitment(g, id, { driveId: 'eat', score: 0.10, roomId: 'kitchen', activity: 'cooking', perceived: [] });
    const ctx = { perceived: [], block: 'morning', nowAbs: 4 };
    const rival = [{ driveId: 'shower', score: 0.10 + COGNITION.breakMargin + 0.05, terms: {} }];
    return shouldBreakPursuit(g.npcs[id], rival, ctx) === null;
  })()
`), 'a commitment whose reason has evaporated should be cheap to displace, and vice versa');
check('a NEW signal at callout salience always breaks it, whatever the scores say', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openCommitment(g, id, { driveId: 'do_laundry', score: 5, roomId: 'laundry', activity: 'doing laundry', perceived: [] });
    const loud = [{ signalId: 'breakage', intensity: 1, salience: COGNITION.alwaysBreak.calloutSalience }];
    return shouldBreakPursuit(g.npcs[id], [], { perceived: loud, block: 'morning', nowAbs: 4 }) === 'signal';
  })()
`), 'matches SCENE_READER.calloutSalience — one idea of "this stops you", not two');
check('a signal already there when it opened does NOT keep breaking it', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const loud = [{ signalId: 'rot', intensity: 1, salience: 0.95 }];
    openCommitment(g, id, { driveId: 'do_laundry', score: 5, roomId: 'laundry', activity: 'doing laundry', perceived: loud });
    return shouldBreakPursuit(g.npcs[id], [], { perceived: loud, block: 'morning', nowAbs: 4 }) === null;
  })()
`), 'without this a standing smell breaks every commitment on every tick and nobody finishes anything');
check('a quiet signal below the bar never breaks it', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openCommitment(g, id, { driveId: 'do_laundry', score: 5, roomId: 'laundry', activity: 'doing laundry', perceived: [] });
    const quiet = [{ signalId: 'clutter', intensity: 0.5, salience: COGNITION.alwaysBreak.calloutSalience - 0.01 }];
    return shouldBreakPursuit(g.npcs[id], [], { perceived: quiet, block: 'morning', nowAbs: 4 }) === null;
  })()
`));
check('the player addressing them breaks a commitment no score would have', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openCommitment(g, id, { driveId: 'do_laundry', score: 0.5, roomId: 'laundry', activity: 'doing laundry', perceived: [] });
    const ctx = { perceived: [], block: 'morning', nowAbs: 4 };
    const now = scoreDrive('do_laundry', g.npcs[id], { ...ctx, ignoreRecency: true }).score;
    const rival = [{ driveId: 'eat', score: now + COGNITION.breakMargin - 0.01, terms: {} }];
    const survivesScoring = shouldBreakPursuit(g.npcs[id], rival, ctx) === null;
    const broken = notePlayerAddressed(g, id) && !g.npcs[id].commitment;
    return survivesScoring && broken;
  })()
`));
check('and UI\'s doTalk is what calls it',
      /notePlayerAddressed\(/.test(srcOf('ui.js')),
      'the player addressing someone happens in the UI, not in the tick');
check('a mid-hold commitment survives to its completion or a DESIGNED release — never a rescoring break', api(`
  (() => {
    // Phase 2 (D3) is a HARD hold: a mid-hold NPC is never re-scored, so
    // shouldBreakPursuit is dormant until Phase 5 re-triggers it from events
    // (D6). The mid-hold releases left are ageCommitment's designed ones —
    // the schedule block flipping to sleep/work/commute, probed below with
    // the same function the tick itself uses — plus a fired
    // shouldInterruptCommitment trigger (D6), which is the OTHER designed
    // release this phase re-arms on purpose. Zero unexpected breaks over the
    // population is what the D5 unit checks above are now supported by.
    const byNpc = {};
    for (const row of __tickRows) for (const s of row.states) (byNpc[s.npcId] = byNpc[s.npcId] || []).push({ ...s, clock: row.nowAbs, g: row.g });
    let mid = 0, survived = 0, legit = 0, broken = 0;
    for (const rows of Object.values(byNpc)) {
      for (let i = 0; i + 1 < rows.length; i++) {
        const a = rows[i].held;
        if (!a || rows[i].clock >= a.completesAtAbs) continue;   // completion tick — re-deciding is the point
        mid++;
        const b = rows[i+1].held;
        if (b && b.startedAtAbs === a.startedAtAbs) { survived++; continue; }
        if (rows[i].interrupt) { legit++; continue; }   // D6 early release
        const nb = resolveScheduleActivity(rows[i].g.npcs[rows[i].npcId], absoluteToClock(rows[i].clock), rows[i].g, rows[i].npcId).block;
        if (nb === 'sleep' || nb === 'work' || nb === 'commute' || nb === 'commute_home') legit++;
        else broken++;
      }
    }
    return mid > 0 && survived > 0 && broken === 0;
  })()
`), 'zero would once have meant the break rules are dead; under Phase 2 they are deliberately dormant, and D6 (Phase 5) re-arms them from events');

// ---------------------------------------------------------------------------
console.log('\n(D15) a precondition that lived in a resolver is now a candidacy condition');
check('snoop_phone is NOT a candidate with no phone lying about', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = { ...g.npcs[id], bible: { ...g.npcs[id].bible, temperament: { ...g.npcs[id].bible.temperament, openness: 1, conscientiousness: -1 } } };
    return !scoreCandidates(npc, id, g, __res('leisure', 'living_room'), []).some(c => c.driveId === 'snoop_phone');
  })()
`), 'it was a candidate on 100% of npc-ticks at a flat 0.45 and would have won 54% of them');
check('...and IS one when an unlocked phone is in the room with them and the player is elsewhere', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = { ...g.npcs[id], bible: { ...g.npcs[id].bible, temperament: { ...g.npcs[id].bible.temperament, openness: 1, conscientiousness: -1 } } };
    g.player.location = 'kitchen';
    g.objects['room_living_room'] = g.objects['room_living_room'] || {};
    g.objects['room_living_room'].test_phone = { id: 'test_phone', defId: 'phone', state: { lock: 'unlocked' } };
    return scoreCandidates(npc, id, g, __res('leisure', 'living_room'), []).some(c => c.driveId === 'snoop_phone');
  })()
`));
check('...and a LOCKED phone is not an opportunity', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = { ...g.npcs[id], bible: { ...g.npcs[id].bible, temperament: { ...g.npcs[id].bible.temperament, openness: 1, conscientiousness: -1 } } };
    g.player.location = 'kitchen';
    g.objects['room_living_room'] = g.objects['room_living_room'] || {};
    g.objects['room_living_room'].test_phone = { id: 'test_phone', defId: 'phone', state: { lock: 'locked' } };
    return !scoreCandidates(npc, id, g, __res('leisure', 'living_room'), []).some(c => c.driveId === 'snoop_phone');
  })()
`));
check('react_to_player is a candidate only when the player is actually in the room', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    g.player.location = 'living_room';
    const here  = scoreCandidates(g.npcs[id], id, g, __res('evening', 'living_room'), []).some(c => c.driveId === 'react_to_player');
    const there = scoreCandidates(g.npcs[id], id, g, __res('evening', 'kitchen'), []).some(c => c.driveId === 'react_to_player');
    return here && !there;
  })()
`), 'its resolver checked this AFTER the fact and silently did nothing 76% of the time');
check('gift_to_player needs both affection and something worth giving', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const fond = { ...g.npcs[id], relPlayer: { ...g.npcs[id].relPlayer, affection: 1 } };
    const cold = { ...fond, relPlayer: { ...fond.relPlayer, affection: 0 } };
    const empty = { ...fond, inventory: [] };
    const has = (n) => scoreCandidates(n, id, g, __res('evening', 'living_room'), []).some(c => c.driveId === 'gift_to_player');
    return has(fond) && !has(cold) && !has(empty);
  })()
`));
check('peep_player needs a vulnerable player, adjacency, and the curiosity to try', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const nosy = { ...g.npcs[id], bible: { ...g.npcs[id].bible, temperament: { ...g.npcs[id].bible.temperament, openness: 1, conscientiousness: -1 } } };
    const dull = { ...g.npcs[id], bible: { ...g.npcs[id].bible, temperament: { warmth: 0, volatility: 0, openness: 0, conscientiousness: 1, assertiveness: 0, selfAwareness: 0 } },
                   relPlayer: { ...g.npcs[id].relPlayer, affection: 0 } };
    const has = (n, loc) => scoreCandidates(n, id, g, __res('leisure', loc), []).some(c => c.driveId === 'peep_player');
    g.player.location = 'bathroom_a';
    const notVulnerable = has(nosy, 'hallway_a');
    g.player.flags = { ...(g.player.flags || {}), _vulnerableState: 'showering' };
    return !notVulnerable && has(nosy, 'hallway_a') && !has(nosy, 'kitchen') && !has(dull, 'hallway_a');
  })()
`), 'hallway_a is adjacent to bathroom_a; the kitchen is not — you peep from outside the door');
check('chat_with_roommate is not a candidate alone in a room', api(`
  (() => {
    const g = __mk();
    const [a, b] = __ids(g);
    const lonely = { ...g.npcs[a], needs: { ...g.npcs[a].needs, social: 5 } };
    g.npcs[b].location = 'kitchen';
    const alone = scoreCandidates(lonely, a, g, __res('evening', 'living_room'), []).some(c => c.driveId === 'chat_with_roommate');
    g.npcs[b].location = 'living_room';
    const together = scoreCandidates(lonely, a, g, __res('evening', 'living_room'), []).some(c => c.driveId === 'chat_with_roommate');
    return !alone && together;
  })()
`), 'it banked the social restore and wore the activity label with nobody there');
// D10 read from the other side: the resolver and the candidacy filter must
// never disagree about when a drive is possible, so each predicate is DEFINED
// once (beside its resolver, in DRIVES) and CALLED from both places. A copy in
// cognition.js would be a second opinion that drifts.
for (const fn of ['canPeepPlayer', 'findSnoopablePhone', 'giftableStack', 'hasChatPartner']) {
  const defs = SRCFILES.filter(f => new RegExp(`function ${fn}\\(`).test(srcOf(f)));
  check(`${fn} is defined once, in drives.js, and called from cognition.js`,
        defs.length === 1 && defs[0] === 'drives.js' &&
        new RegExp(`${fn}\\(`).test(srcOf('cognition.js')) &&
        new RegExp(`${fn}\\(`).test(srcOf('drives.js')),
        `defined in ${JSON.stringify(defs)}`);
}
check('and the resolvers no longer roll their own chance (D10)',
      !/rng\(\)\s*>\s*(cfg|chance)/.test(srcOf('drives.js')),
      'the chance roll WAS the selection these drives no longer do for themselves');

// ---------------------------------------------------------------------------
console.log('\n(design invariant 5) every drive is observed firing in a state the game can reach');
// Section 2 of measure-cognition shows twelve of the sixteen firing over an
// untouched week. The other four need a player who does something; each is
// driven here in the state that makes it possible, through the REAL tick.
const fired = JSON.parse(api(`
  (() => {
    const seen = {};
    for (const r of __rows) for (const d of r.fired) seen[d] = (seen[d] || 0) + 1;
    return JSON.stringify(seen);
  })()
`));
for (const d of JSON.parse(api(`JSON.stringify(Object.keys(DRIVE_DEFS))`))) {
  const custom = api(`!!(DRIVE_DEFS['${d}'].isPeepDrive || DRIVE_DEFS['${d}'].isSnoopDrive || DRIVE_DEFS['${d}'].isGiftDrive || DRIVE_DEFS['${d}'].isInvestigateDrive || DRIVE_DEFS['${d}'].reactsToPlayer || DRIVE_DEFS['${d}'].cleansRoom)`);
  if (custom) continue;   // needs a player or a mess; driven explicitly below
  check(`${d} fires over ${HOUSES}x${TICKS / 48} days on an untouched house`, (fired[d] || 0) > 0,
        `fired ${fired[d] || 0} times — a drive nobody ever performs is dead content with a config entry`);
}
check('sleep_recover fires at all — it fired ZERO times in 84 in-game days before this plan',
      (fired.sleep_recover || 0) > 0, `fired ${fired.sleep_recover || 0}`);
check('seek_comfort fires at all — same, and it missed its gate by exactly one unit',
      (fired.seek_comfort || 0) > 0, `fired ${fired.seek_comfort || 0}`);
check('react_to_player fires when the player is standing there', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    g.player.location = 'living_room';
    // Neutralize every other need, same as every sibling check below (gift,
    // snoop, investigate, clean) — under the scorer's max-of-candidates
    // contest (not the old independent weight roll), react_to_player has to
    // actually WIN to fire. Needs alone are not enough: a freshly generated
    // house can have chores like do_laundry sitting on the object state
    // rather than a need, so every OTHER drive goes on cooldown too — the
    // point here is reachability against nothing standing in the way, the
    // same isolation gift_to_player/snoop_phone/etc. get by construction.
    let npc = { ...g.npcs[id], mood: 0.9, flags: {},
                needs: { hunger: 90, hygiene: 90, energy: 90, social: 90, comfort: 90, stimulation: 90 } };
    for (const driveId of Object.keys(DRIVE_DEFS)) {
      if (driveId !== 'react_to_player') npc = setCooldown(npc, driveId, clockToAbsolute(g.meta.clock));
    }
    const r = evaluateDrives(npc, id, g.npcs, __res('evening', 'living_room'), g, () => 0.5, 0);
    return r.updatedNpc.flags[DRIVE_COOLDOWN_KEY].react_to_player === clockToAbsolute(g.meta.clock) && r.relDeltas.length === 1;
  })()
`));
// The affection that makes this drive possible is also the strongest motive an
// OVERTURE has (the initiative plan's D4), and both bars are literally
// REL_CONSEQUENCES.affectionGiftThreshold — so at affection 1 a fond NPC would
// rather open their mouth than open their bag, and does. That is D5's ordering
// working as authored (a maximally motivated overture outranks every chore),
// not a regression: the overture cooldowns are 360–600 minutes against the
// gift's 600, so "has already said what they wanted to say" is the state a fond
// NPC spends most of their week in, and it is the state this drive lives in.
// Stamp it, or this asserts which of the two wins rather than that the gift is
// reachable at all.
check('gift_to_player fires for a fond NPC with something to give', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    let npc = { ...g.npcs[id], flags: {}, relPlayer: { ...g.npcs[id].relPlayer, affection: 1 },
                needs: { hunger: 90, hygiene: 90, energy: 90, social: 90, comfort: 90, stimulation: 90 } };
    for (const ovId of Object.keys(OVERTURE_DEFS)) npc = setCooldown(npc, ovId, clockToAbsolute(g.meta.clock));
    const r = evaluateDrives(npc, id, g.npcs, __res('evening', 'living_room'), g, () => 0.5, 0);
    return r.events.some(e => e.type === 'gift');
  })()
`));
check('snoop_phone fires when a phone is left unlocked in the room', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    g.player.location = 'kitchen';
    g.objects['room_living_room'] = g.objects['room_living_room'] || {};
    g.objects['room_living_room'].test_phone = { id: 'test_phone', defId: 'phone', state: { lock: 'unlocked' } };
    const npc = { ...g.npcs[id], flags: {},
                  bible: { ...g.npcs[id].bible, temperament: { ...g.npcs[id].bible.temperament, openness: 1, conscientiousness: -1 } },
                  needs: { hunger: 90, hygiene: 90, energy: 90, social: 90, comfort: 90, stimulation: 90 } };
    evaluateDrives(npc, id, g.npcs, __res('leisure', 'living_room'), g, () => 0.5, 0);
    return !!g.objects['room_living_room'].test_phone.evidence;
  })()
`));
check('investigate_smell fires when something is actually rotting', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    for (const o of Object.values(g.objects['room_kitchen'] || {}))
      if (OBJECT_DEFS[o.defId] && OBJECT_DEFS[o.defId].states && OBJECT_DEFS[o.defId].states.rotten_food)
        o.state = { ...o.state, rotten_food: 'rotten' };
    const npc = { ...g.npcs[id], flags: {}, needs: { hunger: 90, hygiene: 90, energy: 90, social: 90, comfort: 90, stimulation: 90 } };
    const perceived = mergePerceived(perceiveSignals(g, id, 'kitchen'));
    const r = evaluateDrives(npc, id, g.npcs, __res('leisure', 'kitchen'), g, () => 0.5, 0);
    return perceived.some(p => p.signalId === 'rot') && r.events.some(e => e.type === 'investigate_smell');
  })()
`));
check('clean_common fires when there is visible mess to clean', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    // The dirty value comes from the object's own emits table, never a literal:
    // the states are tidy|cluttered, and the measurement instrument spent its
    // whole life setting 'heavy' and quietly dirtying nothing.
    for (const o of Object.values(g.objects['room_living_room'] || {})) {
      const byValue = (OBJECT_DEFS[o.defId] || {}).emits && OBJECT_DEFS[o.defId].emits.clutter;
      if (!byValue) continue;
      const worst = Object.keys(byValue).sort((a, b) => byValue[b].intensity - byValue[a].intensity)[0];
      o.state = { ...o.state, clutter: worst };
    }
    const npc = { ...g.npcs[id], flags: {},
                  bible: { ...g.npcs[id].bible, temperament: { ...g.npcs[id].bible.temperament, conscientiousness: 1 } },
                  needs: { hunger: 90, hygiene: 90, energy: 90, social: 90, comfort: 90, stimulation: 90 } };
    const r = evaluateDrives(npc, id, g.npcs, __res('morning', 'living_room'), g, () => 0.5, 0);
    return r.events.some(e => e.type === 'clean_common');
  })()
`));

// ---------------------------------------------------------------------------
console.log('\n(D12) npc.commitment persists, and survives the tick');
// Measured over the POPULATION rather than over one sample. This originally
// took the first tick on which resident[0] held a commitment with more than
// one tick of life left and asserted it survived exactly one more tick — which
// conflates "the merge dropped it" with "the drive legitimately completed".
// The floorplan overhaul perturbed the sim enough that that one sample landed
// on a real break (an `eat` commitment ending because the NPC ate), and the
// assertion failed while the mechanism it names was working perfectly.
//
// Survival is not universal BY DESIGN — a commitment is broken by satisfaction
// and by higher-priority need, which is Plan 3's whole point. What the merge
// hazard would look like is survival collapsing toward zero, so that is what
// is asserted: survival dominates, over a sample big enough to mean it.
check('a commitment opened this tick is still there next tick', api(`
  (() => {
    let g = __mk();
    const ids = __ids(g);
    let survived = 0, outscored = 0, legitReleased = 0;
    for (let t = 0; t < 200; t++) {
      const before = {};
      for (const id of ids) before[id] = g.npcs[id].commitment;
      const nowAbs = clockToAbsolute(g.meta.clock);
      // A commitment is immune to the merge question when ageCommitment would
      // release it BY DESIGN on this tick (asleep, or off to work): a vanished
      // record there is the SIM's doing, not a dropped merge. Probe the next
      // tick's schedule block with the same function the tick itself uses.
      const nextClock = advanceClock(g.meta.clock, 1);
      const nextReleases = {};
      for (const id of ids) {
        if (!before[id]) continue;
        const b = resolveScheduleActivity(g.npcs[id], nextClock, g, id).block;
        nextReleases[id] = b === 'sleep' || b === 'work' || b === 'commute' || b === 'commute_home';
      }
      g = resolveBatch(g, 1).state;
      for (const id of ids) {
        const b = before[id];
        if (!b || b.completesAtAbs - nowAbs <= CLOCK.tickMinutes) continue;
        const a = g.npcs[id].commitment;
        if (a && a.startedAtAbs === b.startedAtAbs) { survived++; continue; }
        if (nextReleases[id]) { legitReleased++; continue; }
        outscored++;   // a D5 break — rare, and counted separately below
      }
    }
    return survived >= 5 && survived > outscored * 2;
  })()
`), 'the NPC field merge at the end of resolveTick is where Plan 0 lost memory replacements — and ' +
   'this is its SECOND recalibration: sleep/commute releases were reclassified as ' +
   'legitimate, because the first population version counted them as breaks and the ' +
   '2026 floorplan overhaul made them frequent enough to drown the signal');
check('a released commitment does not come back through the merge', api(`
  (() => {
    let g = __mk();
    const id = __ids(g)[0];
    for (let t = 0; t < 200; t++) {
      const nowAbs = clockToAbsolute(g.meta.clock);
      const had = g.npcs[id].commitment;
      g = resolveBatch(g, 1).state;
      if (had && had.completesAtAbs - nowAbs <= CLOCK.tickMinutes && g.npcs[id].commitment &&
          g.npcs[id].commitment.startedAtAbs === had.startedAtAbs) return false;
    }
    return true;
  })()
`), 'resolveBatch spreads the OLD npc under the update — a stale commitment would win');
check('a mid-flight commitment — walk and all — survives a JSON save/load round-trip, then lands', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    // Park the NPC in a different room so the drive's anchor forces a real
    // walk: the whole Phase-4 point is that a cross-room commitment does not
    // begin at commit time (arrived stays false, movement.js owns the flip).
    g.npcs[id].location = 'bedroom_1';
    openCommitment(g, id, { driveId: 'do_laundry', score: 0.5, roomId: 'laundry', activity: 'doing laundry', perceived: [] });
    const c = g.npcs[id].commitment;
    if (!c || c.arrived !== false || !g.npcs[id].walk || g.npcs[id].walk.path.length < 2) return 'no walk planned';
    const round = JSON.parse(JSON.stringify(g.npcs[id]));
    if (!round.commitment || round.commitment.id !== 'do_laundry' ||
        round.commitment.kind !== 'drive' ||
        round.commitment.startedAtAbs !== clockToAbsolute(g.meta.clock) ||
        round.commitment.completesAtAbs !== round.commitment.startedAtAbs + 3 * CLOCK.tickMinutes ||
        round.commitment.anchor.roomId !== 'laundry' ||
        round.commitment.activity !== 'doing laundry' ||
        round.commitment.arrived !== false ||
        !round.walk || round.walk.totalUnits <= 0) return 'round-trip mismatch';
    // The commitment must land: the deterministic batch settle (the same
    // settleWalks resolveTick calls every tick) snaps the walk once its
    // scheduled completion has passed, exactly as the frame path would.
    g.meta.clock = absoluteToClock(round.walk.completesAtAbs + 1);
    settleWalks(g);
    return g.npcs[id].walk === null &&
           g.npcs[id].commitment.arrived === true &&
           g.npcs[id].commitment.anchor.roomId === g.npcs[id].location;
  })()
`), 'the npcs folder persists whole records — walk, anchor point and the arrived gate included — and the batch settle lands them');
check('absent means no commitment, never an empty object', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openCommitment(g, id, { driveId: 'eat', score: 0.5, roomId: 'kitchen', activity: 'cooking', perceived: [] });
    releaseCommitment(g, id);
    return !('commitment' in g.npcs[id]) && !JSON.parse(JSON.stringify(g.npcs[id])).commitment;
  })()
`));
check('a fresh NPC starts with no commitment and makes choices from the next tick (D12: no backfill)', api(`
  (() => {
    const g = __mk();
    return __ids(g).every(id => g.npcs[id].commitment === undefined);
  })()
`));

// ---------------------------------------------------------------------------
console.log('\nchoosing and committing stay pure / a named writer (design invariant 1)');
check('choosePursuit does not write', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const c = scoreCandidates(g.npcs[id], id, g, __res('leisure', 'living_room'), []);
    const before = JSON.stringify(g);
    choosePursuit(c);
    return JSON.stringify(g) === before;
  })()
`));
check('shouldBreakPursuit does not write', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openCommitment(g, id, { driveId: 'eat', score: 0.5, roomId: 'kitchen', activity: 'cooking', perceived: [] });
    const before = JSON.stringify(g);
    shouldBreakPursuit(g.npcs[id], [{ driveId: 'shower', score: 9, terms: {} }], { perceived: [], block: 'leisure', nowAbs: 2 });
    return JSON.stringify(g) === before;
  })()
`));
check('choosePursuit takes the top candidate above the threshold and nothing else', api(`
  choosePursuit([{ driveId: 'a', score: COGNITION.actionThreshold + 0.01 }, { driveId: 'b', score: 9 }]).driveId === 'a' &&
  choosePursuit([{ driveId: 'a', score: COGNITION.actionThreshold }]) === null &&
  choosePursuit([]) === null && choosePursuit(undefined) === null
`), 'the ranking is scoreCandidates\' job; the threshold is this one\'s');
check('the whole selection path is still synchronous and model-free (R2 / D11)', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    let called = 0;
    const orig = root.generateText;
    root.generateText = () => { called++; return Promise.resolve('{}'); };
    try {
      for (let t = 0; t < 20; t++) resolveBatch(g, 1);
    } finally { root.generateText = orig; }
    return called === 0;
  })()
`), 'every autonomy feature in this game rests on the tick being callable in a loop with no network');
check('cognition.js is synchronous by construction',
      !/\basync\b|\bawait\b|generateText/.test(srcOf('cognition.js')));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
