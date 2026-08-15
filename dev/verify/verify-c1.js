// NPC cognition plan, Phase 1 — the scoring layer.
//
//   node dev/verify/verify-c1.js
//
// Covers the four things Phase 1 promises: the scorer is pure, it is
// deterministic, it never reaches the model, and EVERY drive can be scored
// above the action threshold in a state the game can actually reach.
//
// That last one is the point of the file. `sleep_recover` (energy < 20) and
// `seek_comfort` (comfort < 40, strict) were dead for the entire life of the
// drive system because their thresholds sat outside the range their need ever
// occupies, in a codebase that already had an instrument PRINTING "unreachable"
// next to them. Printing is not catching. Everything below marked (D9) is the
// catch.
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'drives.js', 'cognition.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// --- The attainable ranges ------------------------------------------------
// NOT the 0..100 the schema allows — what the need economy actually produces,
// measured over 12 households x 7 in-game days by
// `node dev/verify/measure-cognition.js` (its section 3). A gate or a curve
// that only bites outside these numbers is a drive that never happens, which is
// exactly the bug this file exists to make impossible.
//
// Refresh these from the instrument if the need economy is ever rebalanced. A
// stale floor here would let the defect back in silently, which is the one
// failure mode this harness cannot tolerate.
const ATTAINABLE = {
  hunger:      [0, 79],
  hygiene:     [0, 69],
  energy:      [28, 100],
  social:      [0, 100],
  comfort:     [40, 74],
  stimulation: [0, 67],
};

api(`
  __mk = () => {
    const h = SIM_generateHouse(20260811, 3);
    const g = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(g.world.upgrades)) g.world.upgrades[k] = { tier: 'functional', condition: 100 };
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident');

  // An NPC at the WORST attainable value of every need, neutral temperament,
  // nothing on cooldown. The most motivated person the game can produce.
  __needy = (g, needs) => {
    const id = __ids(g)[0];
    const n = g.npcs[id];
    return { ...n,
      needs: { ...n.needs, ...needs },
      flags: {},
      bible: { ...n.bible, temperament: { warmth: 0, volatility: 0, openness: 0,
                                          conscientiousness: 0, assertiveness: 0, selfAwareness: 0 } } };
  };

  // Every signal in the game, perceived at a modest intensity — just over the
  // 0.2/0.25 thresholds the two signal-gated drives declare, so this stands for
  // "there is some mess here", not "the flat is a biohazard".
  __sigs = (intensity) => Object.keys(SIGNAL_DEFS).map(id => ({ signalId: id, intensity, salience: intensity }));

  __blocks = ['sleep','morning','prep','commute','work','commute_home','midday','evening','leisure','wind_down','meal'];

  // Phase 2 gave five drives candidacy conditions (D15) — their real
  // precondition used to sit inside their resolver, where the scorer could not
  // see it. "Reachable in a state the game can actually produce" therefore has
  // to mean a state where those conditions CAN hold: a roommate in the room to
  // talk to, the player standing there, a phone left out, someone fond enough
  // to give something away, a player showering behind a door you are standing
  // outside. Without these the reachability assertion would silently stop
  // covering five of the sixteen drives, which is the exact failure mode it
  // exists for.
  //
  // Two arrangements, because they genuinely exclude each other: you cannot
  // acknowledge someone who just walked in AND be snooping through their phone
  // while they are elsewhere. Both are an ordinary evening; neither is rigged.
  // The NPC keeps a neutral temperament throughout — affection is a
  // relationship, not a personality, and Phase 3 is where personality starts to
  // separate who does what.
  __arrangements = () => [
    // Together: the player is in the room, so is a roommate.
    (g, npc, room) => {
      const [, b] = __ids(g);
      g.npcs[b] = { ...g.npcs[b], location: room, flags: {} };
      g.player.location = room;
      g.player.flags = {};
      return { ...npc, relPlayer: { ...npc.relPlayer, affection: 1 } };
    },
    // Apart: the player is showering behind the next door, and has left their
    // phone out here. hallway_a is adjacent to bathroom_a; you peep from
    // outside the door.
    (g, npc, room) => {
      g.player.location = 'bathroom_a';
      g.player.flags = { _vulnerableState: 'showering' };
      g.objects['room_' + room] = g.objects['room_' + room] || {};
      g.objects['room_' + room].test_phone = { id: 'test_phone', defId: 'phone', state: { lock: 'unlocked' } };
      return { ...npc, relPlayer: { ...npc.relPlayer, affection: 1 } };
    },
  ];
`);

const ALL = JSON.parse(api(`JSON.stringify(Object.keys(DRIVE_DEFS))`));
const THRESHOLD = api(`COGNITION.actionThreshold`);

// ---------------------------------------------------------------------------
console.log('\nthe utility block exists and is well formed');

check('cognition.js loaded', api(`typeof scoreCandidates === 'function' && typeof scoreDrive === 'function'`));
check('all sixteen drives declare a utility block', api(`
  Object.values(DRIVE_DEFS).every(d => d.utility && typeof d.utility === 'object')
`), JSON.stringify(ALL.filter(d => !api(`!!DRIVE_DEFS['${d}'].utility`))));
check('baseAppeal and holdMinutes are present on every one', api(`
  Object.values(DRIVE_DEFS).every(d =>
    typeof d.utility.baseAppeal === 'number' && d.utility.baseAppeal > 0 &&
    typeof d.utility.holdMinutes === 'number' && d.utility.holdMinutes >= 1)
`), JSON.stringify(ALL.filter(d => {
  const u = JSON.parse(api(`JSON.stringify(DRIVE_DEFS['${d}'].utility)`));
  return !(u.baseAppeal > 0 && typeof u.holdMinutes === 'number' && u.holdMinutes >= 1);
})));
check('every utility.need names a need the schema actually has', api(`
  Object.values(DRIVE_DEFS).every(d => !d.utility.need ||
    ['hunger','hygiene','energy','social','comfort','stimulation'].includes(d.utility.need.need))
`));

// ---------------------------------------------------------------------------
console.log('\n(D9) a need curve must reach INTO the range its need occupies');
// The structural half of the reachability invariant, and the one-line version
// of the original bug: a threshold at or below the observed floor can never
// contribute anything. `below` must be strictly above the floor, or the term is
// decorative. This is what `sleep_recover` (below 20 vs a floor of 28) and
// `seek_comfort` (below 40 vs a floor of exactly 40) each failed.
for (const d of ALL) {
  const u = JSON.parse(api(`JSON.stringify(DRIVE_DEFS['${d}'].utility)`));
  if (!u.need) continue;
  const floor = ATTAINABLE[u.need.need][0];
  check(`${d}: need '${u.need.need}' below ${u.need.below} > observed floor ${floor}`,
        u.need.below > floor,
        `the need never gets below ${floor}, so a curve starting at ${u.need.below} contributes 0 forever`);
}

// ---------------------------------------------------------------------------
console.log('\n(D9) every drive scores above actionThreshold in an ATTAINABLE state');
// The behavioural half. Not "some state" — a state built from the measured
// floors, in a block the drive allows, at a neutral temperament. A drive that
// can only clear the bar for an unusually-tempered NPC is one the harness would
// rather flag now than have Phase 5 discover.
const NEEDY = JSON.stringify(Object.fromEntries(Object.entries(ATTAINABLE).map(([k, v]) => [k, v[0]])));
const best = JSON.parse(api(`
  (() => {
    const perceived = __sigs(0.30);
    const out = {};
    for (const id of Object.keys(DRIVE_DEFS)) out[id] = { score: null, minute: null };
    // hallway_a rather than living_room: it is adjacent to bathroom_a, which is
    // what peep_player needs, and it is a room like any other for everything else.
    const ROOM = 'hallway_a';
    // D4 (continuous-behavior-engine Phase 3): the routine term is a function of
    // the current MINUTE of day, not the schedule block, so reachability is swept
    // across representative minutes — every window's midpoint (each window's
    // interior) plus overnight fallbacks, so a drive whose windows cluster late
    // still finds its reachable time of day.
    const __mins = () => [0, 240, 1430, ...Object.values(BLOCK_TIME_OF_DAY).flat().map(([s, e]) => (s + e) / 2)];
    __arrangements().forEach((arrange, ai) => {
      const g = __mk();
      const npc = arrange(g, __needy(g, ${NEEDY}), ROOM);
      for (const m of __mins()) {
        g.meta.clock.minutes = m;
        const ranked = scoreCandidates(npc, __ids(g)[0], g, { block: null, location: ROOM }, perceived);
        for (const hit of ranked) {
          const top = out[hit.driveId];
          // Initiative plan Phase 3: scoreCandidates now ranks OVERTURE_DEFS in
          // the same list (D1), and one of the arrangements below sets affection
          // high enough for gift_to_player, which is also the affection motive's
          // bar. This loop measures DRIVE_DEFS reachability and out is keyed by
          // DRIVE_DEFS alone, so an overture is skipped rather than crashing on a
          // missing key. Overture reachability is verify-i3's, against its own table.
          // (No backticks in this comment: it lives inside a template literal.)
          if (!top) continue;
          if (top.score === null || hit.score > top.score) {
            out[hit.driveId] = { score: hit.score, minute: m, arrangement: ai, terms: hit.terms };
          }
        }
      }
    });
    return JSON.stringify(out);
  })()
`));
for (const d of ALL) {
  const t = best[d];
  check(`${d} reaches ${t.score === null ? 'nothing' : t.score.toFixed(3)} (> ${THRESHOLD})`,
        t.score !== null && t.score > THRESHOLD,
        t.score === null
          ? 'never a candidate at any minute of day, in either arrangement — check timeOfDay, the hard gates and DRIVE_CANDIDACY'
          : `best minute-of-day ${t.minute} (arrangement ${t.arrangement}), terms ${JSON.stringify(t.terms)}`);
}

// ---------------------------------------------------------------------------
console.log('\n(D9) the two drives that were dead, at the exact value that killed them');
check('sleep_recover scores above threshold at energy 28 (its observed floor)', api(`
  (() => {
    const g = __mk();
    const npc = __needy(g, { energy: 28, hunger: 60, hygiene: 60, social: 60, comfort: 60, stimulation: 60 });
    const r = scoreCandidates(npc, __ids(g)[0], g, { block: 'leisure', location: 'living_room' }, []);
    const hit = r.find(c => c.driveId === 'sleep_recover');
    return !!hit && hit.score > COGNITION.actionThreshold;
  })()
`), api(`JSON.stringify(scoreDrive('sleep_recover', __needy(__mk(), { energy: 28 }), { perceived: [], block: 'leisure', nowAbs: 0 }))`));
check('seek_comfort scores above threshold at comfort 40 (its observed floor, and its old gate exactly)', api(`
  (() => {
    const g = __mk();
    const npc = __needy(g, { comfort: 40, hunger: 60, hygiene: 60, social: 60, energy: 60, stimulation: 60 });
    const r = scoreCandidates(npc, __ids(g)[0], g, { block: 'leisure', location: 'living_room' }, []);
    const hit = r.find(c => c.driveId === 'seek_comfort');
    return !!hit && hit.score > COGNITION.actionThreshold;
  })()
`), api(`JSON.stringify(scoreDrive('seek_comfort', __needy(__mk(), { comfort: 40 }), { perceived: [], block: 'leisure', nowAbs: 0 }))`));
check('a need gate no longer excludes: sleep_recover is a candidate at energy 30, where its old gate rejected it', api(`
  (() => {
    const g = __mk();
    const npc = __needy(g, { energy: 30 });
    // The gate this drive used to carry, reconstructed. Phase 2 deleted it from
    // the def (D14); the point is that the state it excluded is one the scorer
    // now sees as a candidate.
    const oldGate = checkDriveGates({ gates: [{ need: 'energy', op: 'below', threshold: 20 }] }, npc, []);
    const scored = scoreCandidates(npc, __ids(g)[0], g, { block: 'leisure', location: 'living_room' }, [])
      .some(c => c.driveId === 'sleep_recover');
    return oldGate === false && scored === true;
  })()
`), 'this is the whole of D6: the gate becomes a curve, so the scorer sees a candidate the gate did not');
check('a rested NPC still does not want a nap', api(`
  (() => {
    const g = __mk();
    const npc = __needy(g, { energy: 85 });
    const hit = scoreCandidates(npc, __ids(g)[0], g, { block: 'leisure', location: 'living_room' }, [])
      .find(c => c.driveId === 'sleep_recover');
    return !!hit && hit.score < COGNITION.actionThreshold;
  })()
`), 'reachable must not mean always — a curve that is above threshold everywhere is a gate stuck open');

// ---------------------------------------------------------------------------
console.log('\nscoring is pure (design invariant 1)');
check('scoreCandidates does not mutate gameState', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const before = JSON.stringify(g);
    scoreCandidates(g.npcs[id], id, g, { block: 'leisure', location: 'living_room' }, __sigs(0.5));
    return JSON.stringify(g) === before;
  })()
`), 'the same assertion verify-r34 makes about composeScene, for the same reason');
check('scoreCandidates does not mutate the npc it is scoring', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = g.npcs[id];
    const before = JSON.stringify(npc);
    scoreCandidates(npc, id, g, { block: 'leisure', location: 'living_room' }, __sigs(0.5));
    return JSON.stringify(npc) === before;
  })()
`));
check('scoreDrive does not mutate the npc either', api(`
  (() => {
    const g = __mk();
    const npc = g.npcs[__ids(g)[0]];
    const before = JSON.stringify(npc);
    for (const id of Object.keys(DRIVE_DEFS)) scoreDrive(id, npc, { perceived: __sigs(0.4), block: 'leisure', nowAbs: 5 });
    return JSON.stringify(npc) === before;
  })()
`));

// ---------------------------------------------------------------------------
console.log('\nscoring is synchronous and model-free (R2 / D11)');
check('scoring never reaches root.generateText', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    let called = 0;
    const orig = root.generateText;
    root.generateText = () => { called++; return Promise.resolve('{}'); };
    try {
      for (const block of __blocks) scoreCandidates(g.npcs[id], id, g, { block, location: 'living_room' }, __sigs(0.5));
      for (const d of Object.keys(DRIVE_DEFS)) scoreDrive(d, g.npcs[id], { perceived: __sigs(0.5), block: 'leisure', nowAbs: 3 });
    } finally { root.generateText = orig; }
    return called === 0;
  })()
`), 'every autonomy feature in this game rests on the tick being callable in a loop with no network');
check('scoreCandidates returns an array, not a promise', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const r = scoreCandidates(g.npcs[id], id, g, { block: 'leisure', location: 'living_room' }, []);
    return Array.isArray(r) && typeof r.then !== 'function';
  })()
`));

// ---------------------------------------------------------------------------
console.log('\nscoring is deterministic and comparable');
check('the same state scored twice gives an identical ranking', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const a = scoreCandidates(g.npcs[id], id, g, { block: 'leisure', location: 'living_room' }, __sigs(0.4));
    const b = scoreCandidates(g.npcs[id], id, g, { block: 'leisure', location: 'living_room' }, __sigs(0.4));
    return JSON.stringify(a) === JSON.stringify(b);
  })()
`), 'an rng tie-break would quietly make this false');
check('two NPCs with identical state score identically', api(`
  (() => {
    const g = __mk();
    const [a, b] = __ids(g);
    const base = __needy(g, { hunger: 30, hygiene: 30, energy: 40, social: 30, comfort: 45, stimulation: 30 });
    const ra = scoreCandidates(base, a, g, { block: 'leisure', location: 'living_room' }, __sigs(0.4));
    const rb = scoreCandidates(base, b, g, { block: 'leisure', location: 'living_room' }, __sigs(0.4));
    return JSON.stringify(ra.map(c => [c.driveId, c.score])) === JSON.stringify(rb.map(c => [c.driveId, c.score]));
  })()
`));
check('candidates come back ranked, best first', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const r = scoreCandidates(__needy(g, { hunger: 20, hygiene: 20, energy: 35, social: 20, comfort: 45, stimulation: 20 }),
                              id, g, { block: 'leisure', location: 'living_room' }, __sigs(0.5));
    for (let i = 1; i < r.length; i++) if (r[i].score > r[i-1].score) return false;
    return r.length > 1;
  })()
`));
check('terms sum to the score when block and recency are neutral', api(`
  (() => {
    const g = __mk();
    const npc = __needy(g, { hunger: 20, hygiene: 20, energy: 35, social: 20, comfort: 45, stimulation: 20 });
    for (const d of Object.keys(DRIVE_DEFS)) {
      const s = scoreDrive(d, npc, { perceived: __sigs(0.4), block: '__none__', nowAbs: 0 });
      const t = s.terms;
      if (t.block !== 1 || t.recency !== 1) return false;
      if (Math.abs((t.base + t.need + t.signal + t.temperament) - s.score) > 1e-9) return false;
    }
    return true;
  })()
`), 'terms is the debugging surface a failing tuning run gets read through — it has to add up');

// ---------------------------------------------------------------------------
console.log('\nthe individual terms do what they claim');
check('(D7) two NPCs differing only in conscientiousness score clean_common differently', api(`
  (() => {
    const g = __mk();
    const npc = __needy(g, { hunger: 60, hygiene: 60, energy: 60, social: 60, comfort: 60, stimulation: 60 });
    const tidy   = { ...npc, bible: { ...npc.bible, temperament: { ...npc.bible.temperament, conscientiousness:  0.9 } } };
    const untidy = { ...npc, bible: { ...npc.bible, temperament: { ...npc.bible.temperament, conscientiousness: -0.9 } } };
    const ctx = { perceived: __sigs(0.5), block: 'leisure', nowAbs: 0 };
    return scoreDrive('clean_common', tidy, ctx).score > scoreDrive('clean_common', untidy, ctx).score;
  })()
`));
check('(D7) it uses the INTERRUPTION idiom exactly: 1 + Σ(axis × weight)', api(`
  (() => {
    const g = __mk();
    const npc = __needy(g, { hunger: 60, hygiene: 60, energy: 60, social: 60, comfort: 60, stimulation: 60 });
    const t = { ...npc, bible: { ...npc.bible, temperament: { ...npc.bible.temperament, conscientiousness: 0.5 } } };
    const ctx = { perceived: __sigs(0.5), block: 'leisure', nowAbs: 0 };
    const s = scoreDrive('clean_common', t, ctx);
    const appeal = s.terms.base + s.terms.need + s.terms.signal;
    const expected = appeal * (1 + 0.5 * DRIVE_DEFS.clean_common.utility.temperamentWeights.conscientiousness);
    return Math.abs(s.score - expected) < 1e-9;
  })()
`));
check('a drive with no temperamentWeights is unaffected by temperament', api(`
  (() => {
    const g = __mk();
    const npc = __needy(g, { hunger: 20, hygiene: 60, energy: 60, social: 60, comfort: 60, stimulation: 60 });
    const hot  = { ...npc, bible: { ...npc.bible, temperament: { warmth: 1, volatility: 1, openness: 1, conscientiousness: 1, assertiveness: 1, selfAwareness: 1 } } };
    const cold = { ...npc, bible: { ...npc.bible, temperament: { warmth: -1, volatility: -1, openness: -1, conscientiousness: -1, assertiveness: -1, selfAwareness: -1 } } };
    const ctx = { perceived: [], block: 'leisure', nowAbs: 0 };
    return scoreDrive('eat', hot, ctx).score === scoreDrive('eat', cold, ctx).score;
  })()
`), 'a drive with no weights is one where personality genuinely should not matter');
check('(D8) a stronger perceived signal scores higher — at the PERCEIVING npc\'s intensity', api(`
  (() => {
    const g = __mk();
    const npc = __needy(g, { hunger: 60, hygiene: 60, energy: 60, social: 60, comfort: 60, stimulation: 60 });
    const near = scoreDrive('investigate_smell', npc, { perceived: [{ signalId: 'rot', intensity: 0.9 }], block: 'leisure', nowAbs: 0 });
    const far  = scoreDrive('investigate_smell', npc, { perceived: [{ signalId: 'rot', intensity: 0.3 }], block: 'leisure', nowAbs: 0 });
    return near.score > far.score && Math.abs(near.terms.signal - 0.9 * 0.9) < 1e-9;
  })()
`), 'the record perceiveSignals returns is already attenuated for distance and doors — Plan 1 producing behaviour instead of a boolean');
check('a deeper need scores higher, and a satisfied one contributes nothing', api(`
  (() => {
    const g = __mk();
    const mk = (h) => __needy(g, { hunger: h, hygiene: 60, energy: 60, social: 60, comfort: 60, stimulation: 60 });
    const ctx = { perceived: [], block: 'leisure', nowAbs: 0 };
    const starving = scoreDrive('eat', mk(5), ctx);
    const peckish  = scoreDrive('eat', mk(40), ctx);
    const full     = scoreDrive('eat', mk(90), ctx);
    return starving.score > peckish.score && peckish.score > full.score && full.terms.need === 0;
  })()
`));
check('blockAppeal multiplies inside its window, and the curve sits at routineOutOfBand outside', api(`
  (() => {
    const g = __mk();
    const npc = __needy(g, { hunger: 20, hygiene: 60, energy: 60, social: 60, comfort: 60, stimulation: 60 });
    // DERIVED, never restated. This assertion hardcoded 1.2, and Phase 5's
    // retune took eat's morning multiplier to 1.05 — so it failed against a
    // deliberate, measured config change rather than against a defect. README
    // rule 5: never hardcode a value another file owns.
    const mult = DRIVE_DEFS.eat.utility.blockAppeal.morning;
    const [ms, me] = BLOCK_TIME_OF_DAY.morning[0];
    const inW  = scoreDrive('eat', npc, { perceived: [], block: 'morning', nowAbs: 0, minutesOfDay: (ms + me) / 2 });
    const outW = scoreDrive('eat', npc, { perceived: [], block: '__none__', nowAbs: 0, minutesOfDay: 0 });
    return mult !== 1 && inW.terms.block === mult &&
           outW.terms.block === COGNITION.routineOutOfBand &&
           Math.abs(inW.score - outW.score * (mult / COGNITION.routineOutOfBand)) < 1e-9;
  })()
`), 'the invariant is that blockAppeal multiplies — not what eat\'s morning number currently is');

// ---------------------------------------------------------------------------
console.log('\nrecency, and the window it actually applies in');
// COGNITION.recencyPenalty was specified as applying "within its own cooldown",
// which is unreachable — the cooldown is a hard exclusion, so nothing inside it
// is ever scored. Same defect class as D9, caught in the plan's own new config.
check('a drive still on cooldown is not a candidate at all', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    // Stamp and "now" both read through clockToAbsolute (day*1440 + minutes),
    // so nowAbs - stamp = 0 regardless of what day __mk's generated house
    // starts on — a bare tick literal (20*30) as the stamp only agrees with
    // clockToAbsolute's nowAbs when day happens to be 0, which SIM_generateHouse
    // does not guarantee, and eat's 420-minute cooldown reads a false "elapsed"
    // the moment a day offset is in play.
    g.meta.clock.minutes = 20 * 30;
    const nowAbs = clockToAbsolute(g.meta.clock);
    const npc = { ...__needy(g, { hunger: 10 }), flags: { [DRIVE_COOLDOWN_KEY]: { eat: nowAbs } } };
    return !scoreCandidates(npc, id, g, { block: 'leisure', location: 'kitchen' }, []).some(c => c.driveId === 'eat');
  })()
`));
// Both stamps below are DERIVED from the drive's own cooldown and
// COGNITION.recencyWindow, in the absolute-minute space isOnCooldown and
// recencyMultiplier now share (npc-initiative-retiming D2). They used to be
// the literals 30 and 40, written when eat's cooldown was 8 ticks; Phase 5
// retuned it to 14 and the second one silently slid inside the penalty window
// it was asserting it was outside of. The window is a relationship between two
// config values, so the test states the relationship — the same failure mode
// as the hardcoded 1.2 above.
check('a drive done between 1x and 2x its cooldown ago is penalised', api(`
  (() => {
    const g = __mk();
    const cd = DRIVE_DEFS.eat.cooldownMinutes, lastAbs = 20 * 30;
    const npc = { ...__needy(g, { hunger: 10 }), flags: { [DRIVE_COOLDOWN_KEY]: { eat: lastAbs } } };
    // One minute past the cooldown: the earliest moment this drive is scored at all.
    const recent = scoreDrive('eat', npc, { perceived: [], block: 'leisure', nowAbs: lastAbs + cd + 1 });
    return recent.terms.recency === COGNITION.recencyPenalty;
  })()
`));
check('a drive done longer ago than that is not', api(`
  (() => {
    const g = __mk();
    const cd = DRIVE_DEFS.eat.cooldownMinutes, lastAbs = 20 * 30;
    const npc = { ...__needy(g, { hunger: 10 }), flags: { [DRIVE_COOLDOWN_KEY]: { eat: lastAbs } } };
    // Exactly recencyWindow x the cooldown — the comparison is a strict <, so
    // this is the first minute the penalty is gone. Testing the boundary rather
    // than a value beyond it is what catches an off-by-one in the window.
    const out = scoreDrive('eat', npc, { perceived: [], block: 'leisure',
                                         nowAbs: lastAbs + cd * COGNITION.recencyWindow });
    return out.terms.recency === 1;
  })()
`), 'the penalty window is 1x..2x the drive\'s OWN cooldown after it last ran');
check('a drive never done carries no penalty', api(`
  scoreDrive('eat', __needy(__mk(), { hunger: 10 }), { perceived: [], block: 'leisure', nowAbs: 40 }).terms.recency === 1
`));

// ---------------------------------------------------------------------------
console.log('\ncandidacy mirrors evaluateDrives\' hard exclusions');
check('D4: a drive outside its windows is still a candidate, weighted at routineOutOfBand', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = __needy(g, { hunger: 5 });
    const [ms, me] = BLOCK_TIME_OF_DAY.morning[0];
    g.meta.clock.minutes = (ms + me) / 2;
    const inW = scoreCandidates(npc, id, g, { block: 'morning', location: 'kitchen' }, []).find(c => c.driveId === 'eat');
    g.meta.clock.minutes = 0;
    const outW = scoreCandidates(npc, id, g, { block: null, location: 'kitchen' }, []).find(c => c.driveId === 'eat');
    return !!inW && !!outW &&
           inW.terms.block === DRIVE_DEFS.eat.utility.blockAppeal.morning &&
           outW.terms.block === COGNITION.routineOutOfBand &&
           inW.score > outW.score;
  })()
`), 'the hard gate is gone — the time-of-day weight is a score term, not an exclusion (D4)');
check('D4: every timeOfDay block name maps to a real window in BLOCK_TIME_OF_DAY', api(`
  (() => {
    const missing = Object.entries(DRIVE_DEFS)
      .filter(([, d]) => Array.isArray(d.timeOfDay))
      .flatMap(([id, d]) => d.timeOfDay.filter(b => !BLOCK_TIME_OF_DAY[b]).map(b => id + ':' + b));
    return missing.length === 0;
  })()
`), 'a name that maps to nothing would make the drive score routineOutOfBand everywhere, silently');
check('D4: every drive maps to a defined weight curve — in-window blockAppeal, out-of-window routineOutOfBand', api(`
  (() => {
    const R = COGNITION.routineRampMinutes;
    const outD = (m, [s, e]) => m < s ? s - m : (m >= e ? m - e : 0);
    const edge = (m, [s, e]) => m < s ? s - m : (m > e ? m - e : Math.min(m - s, e - m));
    const bad = [];
    for (const [id, d] of Object.entries(DRIVE_DEFS)) {
      if (!d.timeOfDay) continue;
      const windows = d.timeOfDay.map(b => BLOCK_TIME_OF_DAY[b]).flat().filter(Boolean);
      for (const b of d.timeOfDay) {
        for (const [s, e] of BLOCK_TIME_OF_DAY[b]) {
          const want = (d.utility.blockAppeal && d.utility.blockAppeal[b]) ?? 1;
          let mIn = null;
          for (let m = s + R; m <= e - R; m += 5) {
            if (edge(m, [s, e]) < R) continue;
            let clean = true;
            for (const [s2, e2] of windows) {
              if (s2 === s && e2 === e) continue;
              if (outD(m, [s2, e2]) < R) { clean = false; break; }
            }
            if (clean) { mIn = m; break; }
          }
          if (mIn !== null) {
            const w = driveTimeOfDayWeight(d, mIn);
            if (Math.abs(w - want) > 1e-9) bad.push(id + '/' + b + ' in=' + w);
          } else {
            // overlapping windows: the drive's own window still contributes
            const w = driveTimeOfDayWeight(d, (s + e) / 2);
            if (w < want - 1e-9) bad.push(id + '/' + b + ' mid=' + w);
          }
        }
      }
      const wOut = driveTimeOfDayWeight(d, 0);
      if (wOut !== COGNITION.routineOutOfBand) bad.push(id + ' out=' + wOut);
    }
    return bad.length === 0;
  })()
`), 'the former gate\'s reachability is preserved as a strong preference, never an exclusion');
check('the visitor allowlist excludes', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = __needy(g, { hunger: 5, social: 5 });
    const r = scoreCandidates(npc, id, g, { block: 'leisure', location: 'living_room' }, [], { isVisitor: true });
    return r.length > 0 && r.every(c => VISITOR_DRIVE_ALLOWLIST.includes(c.driveId));
  })()
`));
check('a signal gate stays a hard exclusion — you cannot tidy mess you cannot perceive', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = __needy(g, { hunger: 60, hygiene: 60, energy: 60, social: 60, comfort: 60, stimulation: 60 });
    const blind = scoreCandidates(npc, id, g, { block: 'leisure', location: 'living_room' }, []).some(c => c.driveId === 'clean_common');
    const sees  = scoreCandidates(npc, id, g, { block: 'leisure', location: 'living_room' },
                                  [{ signalId: 'clutter', intensity: 0.6 }]).some(c => c.driveId === 'clean_common');
    return !blind && sees;
  })()
`), 'a need gate becomes a curve (D6); a signal gate is about the action being possible at all');
check('a facility under construction excludes its drive', api(`
  (() => {
    const g = __mk();
    const id = __ids(g)[0];
    const npc = __needy(g, { hygiene: 5 });
    const fid = (MAINTENANCE.npcDecayActions.shower || [])[0];
    const ok = scoreCandidates(npc, id, g, { block: 'morning', location: 'bathroom' }, []).some(c => c.driveId === 'shower');
    g.world.upgrades[fid] = { tier: 'broken', condition: 0 };
    const broken = scoreCandidates(npc, id, g, { block: 'morning', location: 'bathroom' }, []).some(c => c.driveId === 'shower');
    return ok && !broken;
  })()
`), api(`JSON.stringify(MAINTENANCE.npcDecayActions.shower)`));

// ---------------------------------------------------------------------------
console.log('\nthe scorer is what selects');
const fs = require('fs');
// Comments stripped first. These assertions are about what the CODE does, and
// two of them failed on their first run against prose — the header of
// cognition.js names openPursuit and generateText in the course of describing
// them. Matching the comments would have made them assertions about how the
// file is documented, which is not the invariant.
const srcOf = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/([^:])\/\/.*$/gm, '$1');

// Phase 1 asserted the exact opposite of the first two of these — its whole
// promise was that behaviour stayed bit-identical while the scorer was built.
// Phase 2 is the phase that hands selection over, so these are inverted rather
// than deleted: the pair of them is the record that the handover happened once,
// deliberately, and cannot silently happen again in reverse.
check('evaluateDrives no longer selects on a weight roll',
      !/rng\(\)\s*>\s*drive\.weight/.test(srcOf('drives.js')),
      'D1 — utility scoring replaces the independent weight roll');
check('evaluateDrives calls the scorer',
      /scoreCandidates\(/.test(srcOf('drives.js')));
check('the writers exist and live beside the scorer',
      /function openCommitment\(/.test(srcOf('cognition.js')) &&
      /function releaseCommitment\(/.test(srcOf('cognition.js')),
      'verify-c2 is where their behaviour is pinned; this is where they are required to be here');
check('and the scorer itself still writes nothing',
      !/function scoreDrive[\s\S]*?\n\}/.test(srcOf('cognition.js')) ||
      !/(npc|gameState)\.\w+\s*=[^=]/.test(srcOf('cognition.js').match(/function scoreDrive[\s\S]*?\n\}/)[0]),
      'the purity snapshot above proves it at runtime; this proves it by reading');
check('cognition.js is synchronous by construction',
      !/\basync\b|\bawait\b|generateText/.test(srcOf('cognition.js')),
      'R2 / D11 — the tick must stay callable a hundred times in a loop with no network');

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
