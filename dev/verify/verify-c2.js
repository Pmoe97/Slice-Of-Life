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
//   2. A pursuit is HELD. It occupies its holdTicks, it is not re-resolved on
//      each of them, and it breaks on D5's rules rather than on anything else.
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
  __trace = (houses, ticks) => {
    const rows = [];
    const orig = evaluateDrives;
    evaluateDrives = function (npc, npcId, npcs, resolved, gameState, rng, currentTick, opts) {
      const before = (npc.flags || {})[DRIVE_COOLDOWN_KEY] || {};
      const heldBefore = npc.pursuit ? { ...npc.pursuit } : null;
      const res = orig(npc, npcId, npcs, resolved, gameState, rng, currentTick, opts);
      const after = (res.updatedNpc && res.updatedNpc.flags && res.updatedNpc.flags[DRIVE_COOLDOWN_KEY]) || {};
      rows.push({
        npcId, currentTick, heldBefore,
        fired: Object.keys(after).filter(d => after[d] === currentTick && before[d] !== currentTick),
        held: gameState.npcs[npcId].pursuit ? { ...gameState.npcs[npcId].pursuit } : null,
        activity: res.activityOverride,
        events: res.events.length,
      });
      return res;
    };
    try {
      for (let i = 0; i < houses; i++) {
        let g = __mk(20260811 + i * 7919);
        g = resolveBatch(g, ticks).state;
      }
    } finally { evaluateDrives = orig; }
    return rows;
  };
`);

const HOUSES = 6, TICKS = 336;
api(`__rows = __trace(${HOUSES}, ${TICKS})`);
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
// pursuit is only ever BUILT or DELETED in one file. sim.js forwards the value
// through npcUpdates so the tick's NPC merge cannot drop it (the same merge that
// silently threw away memory replacements before Plan 0 fixed it), which is a
// carry, not a second opinion about what the NPC is doing.
const pursuitWrites = [];
for (const f of SRCFILES) {
  for (const m of srcOf(f).matchAll(/\w+\.pursuit\s*=\s*\{/g)) pursuitWrites.push(`${f}: builds`);
  for (const m of srcOf(f).matchAll(/delete\s+\w+\.pursuit/g)) pursuitWrites.push(`${f}: deletes`);
}
check('npc.pursuit is only ever built or deleted in cognition.js',
      pursuitWrites.length >= 3 && pursuitWrites.every(w => w.startsWith('cognition.js')),
      JSON.stringify(pursuitWrites));
check('and the three writers are the named ones the plan called for',
      /function openPursuit\(/.test(srcOf('cognition.js')) &&
      /function releasePursuit\(/.test(srcOf('cognition.js')) &&
      /function agePursuit\(/.test(srcOf('cognition.js')));
check('sim.js touches pursuit only through them, plus the merge carry',
      (srcOf('sim.js').match(/pursuit/g) || []).length ===
      (srcOf('sim.js').match(/agePursuit\(|npcUpdates\[id\]\.pursuit = postDrive\.pursuit|pursuit\.roomId|const pursuit = |!pursuit\b/g) || []).length,
      JSON.stringify((srcOf('sim.js').match(/.*pursuit.*/g) || []).map(s => s.trim())));

// ---------------------------------------------------------------------------
console.log('\n(D4) a pursuit is held, and is not re-resolved while it is');
check('some drive with holdTicks 3 was observed occupying three consecutive ticks', api(`
  (() => {
    const byNpc = {};
    for (const r of __rows) (byNpc[r.npcId] = byNpc[r.npcId] || []).push(r);
    for (const rows of Object.values(byNpc)) {
      for (let i = 0; i + 2 < rows.length; i++) {
        const d = rows[i].held && rows[i].held.driveId;
        if (!d || (DRIVE_DEFS[d].utility.holdTicks || 1) < 3) continue;
        if (rows[i].fired[0] !== d) continue;                  // the tick it opened
        if (rows[i+1].held && rows[i+1].held.driveId === d &&
            rows[i+2].held && rows[i+2].held.driveId === d) return true;
      }
    }
    return false;
  })()
`));
check('a held tick fires nothing — the action happened when the pursuit opened', api(`
  __rows.every(r => !(r.heldBefore && r.held && r.held.driveId === r.heldBefore.driveId &&
                      r.held.startedTick === r.heldBefore.startedTick) || r.fired.length === 0)
`), 'an NPC doing laundry for three ticks does one load, not three');
check('a held tick emits no events either', api(`
  __rows.every(r => !(r.heldBefore && r.held && r.held.startedTick === r.heldBefore.startedTick) || r.events === 0)
`));
check('a held tick still wears the pursuit\'s activity', api(`
  __rows.filter(r => r.heldBefore && r.held && r.held.startedTick === r.heldBefore.startedTick && r.heldBefore.activity)
        .every(r => r.activity === r.heldBefore.activity)
`), 'this is what the scene reader renders — the hold has to be visible');
check('ticksLeft counts down by exactly one per held tick', api(`
  __rows.every(r => !(r.heldBefore && r.held && r.held.startedTick === r.heldBefore.startedTick) ||
                    r.held.ticksLeft === r.heldBefore.ticksLeft)
`), 'agePursuit decrements before evaluateDrives sees it, so the two agree here');
check('no pursuit outlives its holdTicks', api(`
  __rows.every(r => !r.held || r.held.ticksLeft <= (DRIVE_DEFS[r.held.driveId].utility.holdTicks || 1))
`));
check('pursuits are actually held in practice, not opened and dropped', api(`
  (() => {
    const opened = __rows.filter(r => r.fired.length === 1 && r.held).length;
    const heldTicks = __rows.filter(r => r.heldBefore).length;
    return opened > 100 && heldTicks / opened > 0.4;
  })()
`), api(`
  (() => {
    const opened = __rows.filter(r => r.fired.length === 1 && r.held).length;
    const heldTicks = __rows.filter(r => r.heldBefore).length;
    return 'opened ' + opened + ', held ticks ' + heldTicks + ', mean ' + (1 + heldTicks / opened).toFixed(2);
  })()
`));

// ---------------------------------------------------------------------------
console.log('\n(D5) what breaks a pursuit, and what does not');
check('a merely-higher score does not break it', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openPursuit(g, id, { driveId: 'do_laundry', score: 0.50, startedTick: 3, roomId: 'laundry', activity: 'doing laundry', perceived: [] });
    const ctx = { perceived: [], block: 'morning', currentTick: 4 };
    // Measured against what do_laundry is worth RIGHT NOW, not the 0.50 it was
    // opened with — that is the whole of the "current score" rule below.
    const now = scoreDrive('do_laundry', g.npcs[id], { ...ctx, ignoreRecency: true }).score;
    const nudge = [{ driveId: 'eat', score: now + COGNITION.breakMargin - 0.01, terms: {} }];
    return shouldBreakPursuit(g.npcs[id], nudge, ctx) === null;
  })()
`), 'hysteresis is the point — a pursuit that flips on a 0.01 edge is not a commitment');
check('a challenger clearing breakMargin does break it', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openPursuit(g, id, { driveId: 'do_laundry', score: 0.50, startedTick: 3, roomId: 'laundry', activity: 'doing laundry', perceived: [] });
    const ctx = { perceived: [], block: 'morning', currentTick: 4 };
    const big = [{ driveId: 'eat', score: 5, terms: {} }];
    return shouldBreakPursuit(g.npcs[id], big, ctx) === 'outscored';
  })()
`));
check('the margin is measured against the pursuit\'s CURRENT score, not the one it won with', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = { ...g.npcs[id], needs: { ...g.npcs[id].needs, hunger: 5 } };
    g.npcs[id] = npc;
    // Opened at a fictitious 0.10 while the drive actually scores ~0.9 right now.
    openPursuit(g, id, { driveId: 'eat', score: 0.10, startedTick: 3, roomId: 'kitchen', activity: 'cooking', perceived: [] });
    const ctx = { perceived: [], block: 'morning', currentTick: 4 };
    const rival = [{ driveId: 'shower', score: 0.10 + COGNITION.breakMargin + 0.05, terms: {} }];
    return shouldBreakPursuit(g.npcs[id], rival, ctx) === null;
  })()
`), 'a commitment whose reason has evaporated should be cheap to displace, and vice versa');
check('a NEW signal at callout salience always breaks it, whatever the scores say', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openPursuit(g, id, { driveId: 'do_laundry', score: 5, startedTick: 3, roomId: 'laundry', activity: 'doing laundry', perceived: [] });
    const loud = [{ signalId: 'breakage', intensity: 1, salience: COGNITION.alwaysBreak.calloutSalience }];
    return shouldBreakPursuit(g.npcs[id], [], { perceived: loud, block: 'morning', currentTick: 4 }) === 'signal';
  })()
`), 'matches SCENE_READER.calloutSalience — one idea of "this stops you", not two');
check('a signal already there when it opened does NOT keep breaking it', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const loud = [{ signalId: 'rot', intensity: 1, salience: 0.95 }];
    openPursuit(g, id, { driveId: 'do_laundry', score: 5, startedTick: 3, roomId: 'laundry', activity: 'doing laundry', perceived: loud });
    return shouldBreakPursuit(g.npcs[id], [], { perceived: loud, block: 'morning', currentTick: 4 }) === null;
  })()
`), 'without this a standing smell breaks every pursuit on every tick and nobody finishes anything');
check('a quiet signal below the bar never breaks it', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openPursuit(g, id, { driveId: 'do_laundry', score: 5, startedTick: 3, roomId: 'laundry', activity: 'doing laundry', perceived: [] });
    const quiet = [{ signalId: 'clutter', intensity: 0.5, salience: COGNITION.alwaysBreak.calloutSalience - 0.01 }];
    return shouldBreakPursuit(g.npcs[id], [], { perceived: quiet, block: 'morning', currentTick: 4 }) === null;
  })()
`));
check('the player addressing them breaks a pursuit no score would have', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openPursuit(g, id, { driveId: 'do_laundry', score: 0.5, startedTick: 3, roomId: 'laundry', activity: 'doing laundry', perceived: [] });
    const ctx = { perceived: [], block: 'morning', currentTick: 4 };
    const now = scoreDrive('do_laundry', g.npcs[id], { ...ctx, ignoreRecency: true }).score;
    const rival = [{ driveId: 'eat', score: now + COGNITION.breakMargin - 0.01, terms: {} }];
    const survivesScoring = shouldBreakPursuit(g.npcs[id], rival, ctx) === null;
    const broken = notePlayerAddressed(g, id) && !g.npcs[id].pursuit;
    return survivesScoring && broken;
  })()
`));
check('and UI\'s doTalk is what calls it',
      /notePlayerAddressed\(/.test(srcOf('ui.js')),
      'the player addressing someone happens in the UI, not in the tick');
check('pursuits do get broken during a real run, but rarely', api(`
  (() => {
    const broke = __rows.filter(r => r.heldBefore && (!r.held || r.held.startedTick !== r.heldBefore.startedTick)).length;
    const heldTicks = __rows.filter(r => r.heldBefore).length;
    return broke > 0 && broke / heldTicks < 0.5;
  })()
`), 'zero would mean the break rules are dead; most would mean commitment is not real');

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
    const npc = { ...g.npcs[id], mood: 0.9, flags: {} };
    const r = evaluateDrives(npc, id, g.npcs, __res('evening', 'living_room'), g, () => 0.5, 0);
    return r.updatedNpc.flags[DRIVE_COOLDOWN_KEY].react_to_player === 0 && r.relDeltas.length === 1;
  })()
`));
// The affection that makes this drive possible is also the strongest motive an
// OVERTURE has (the initiative plan's D4), and both bars are literally
// REL_CONSEQUENCES.affectionGiftThreshold — so at affection 1 a fond NPC would
// rather open their mouth than open their bag, and does. That is D5's ordering
// working as authored (a maximally motivated overture outranks every chore),
// not a regression: the overture cooldowns are 12–96 ticks against the gift's
// 96, so "has already said what they wanted to say" is the state a fond NPC
// spends most of their week in, and it is the state this drive lives in. Stamp
// it, or this asserts which of the two wins rather than that the gift is
// reachable at all.
check('gift_to_player fires for a fond NPC with something to give', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    let npc = { ...g.npcs[id], flags: {}, relPlayer: { ...g.npcs[id].relPlayer, affection: 1 },
                needs: { hunger: 90, hygiene: 90, energy: 90, social: 90, comfort: 90, stimulation: 90 } };
    for (const ovId of Object.keys(OVERTURE_DEFS)) npc = setCooldown(npc, ovId, 0);
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
console.log('\n(D12) npc.pursuit persists, and survives the tick');
check('a pursuit opened this tick is still there next tick', api(`
  (() => {
    let g = __mk();
    const id = __ids(g)[0];
    for (let t = 0; t < 200; t++) {
      const next = resolveBatch(g, 1);
      const before = g.npcs[id].pursuit;
      g = next.state;
      const after = g.npcs[id].pursuit;
      if (after && after.ticksLeft > 1) {
        // resolveBatch's { ...state.npcs[id], ...update } merge threw away
        // memory replacements once; this is the same hazard for pursuit.
        const then = resolveBatch(g, 1).state.npcs[id].pursuit;
        return !!then && then.driveId === after.driveId;
      }
    }
    return false;
  })()
`), 'the NPC field merge at the end of resolveTick is where Plan 0 lost memory replacements');
check('a released pursuit does not come back through the merge', api(`
  (() => {
    let g = __mk();
    const id = __ids(g)[0];
    for (let t = 0; t < 200; t++) {
      const had = g.npcs[id].pursuit;
      g = resolveBatch(g, 1).state;
      if (had && had.ticksLeft === 1 && g.npcs[id].pursuit &&
          g.npcs[id].pursuit.startedTick === had.startedTick) return false;
    }
    return true;
  })()
`), 'resolveBatch spreads the OLD npc under the update — a stale pursuit would win');
check('a mid-flight pursuit survives a JSON save/load round-trip', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openPursuit(g, id, { driveId: 'do_laundry', score: 0.5, startedTick: 7, roomId: 'laundry', activity: 'doing laundry', perceived: [] });
    const round = JSON.parse(JSON.stringify(g.npcs[id]));
    return round.pursuit && round.pursuit.driveId === 'do_laundry' && round.pursuit.ticksLeft === 3 &&
           round.pursuit.roomId === 'laundry' && round.pursuit.activity === 'doing laundry';
  })()
`), 'the npcs folder persists whole records, so no migration is needed — but it has to round-trip');
check('absent means no pursuit, never an empty object', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    openPursuit(g, id, { driveId: 'eat', score: 0.5, startedTick: 1, roomId: 'kitchen', activity: 'cooking', perceived: [] });
    releasePursuit(g, id);
    return !('pursuit' in g.npcs[id]) && !JSON.parse(JSON.stringify(g.npcs[id])).pursuit;
  })()
`));
check('a fresh NPC starts with no pursuit and makes choices from the next tick (D12: no backfill)', api(`
  (() => {
    const g = __mk();
    return __ids(g).every(id => g.npcs[id].pursuit === undefined);
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
    openPursuit(g, id, { driveId: 'eat', score: 0.5, startedTick: 1, roomId: 'kitchen', activity: 'cooking', perceived: [] });
    const before = JSON.stringify(g);
    shouldBreakPursuit(g.npcs[id], [{ driveId: 'shower', score: 9, terms: {} }], { perceived: [], block: 'leisure', currentTick: 2 });
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
