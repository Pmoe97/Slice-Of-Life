// NPC initiative plan, Phase 3 — the overture.
//
//   node dev/verify/verify-i3.js
//
// An NPC crosses the room and opens. Everything before this phase was the
// player initiating; this is the first act in the game an NPC directs at a
// person because they want something.
//
// The assertions that matter here are structural rather than behavioural, and
// deliberately so. Two of the four motive sources still read exactly zero on a
// generated cast — nothing writes `relPlayer.grievances` outside the
// conversation path, and every relationship axis moves only through
// conversation rel-deltas (the plan's Evidence, unchanged by Phase 2). So a
// population run alone would exercise ONE source and quietly pass while the
// other three were broken. Each source is therefore driven directly, on a cast
// whose axes are moved deliberately, and the population run is what proves the
// live one reaches the player without help.
//
// The invariants, in the order they would hurt if they broke:
//   - one committed intent per npc-tick. `npc.pursuit` and `npc.overture` can
//     never both resolve, and that is a property of there being ONE ranked list
//     and ONE chooser, not a rule somebody remembered.
//   - `npc.overture` has exactly one writing file (D19).
//   - an overture never fires inside the do-not-disturb set, and an unknown
//     entry in that set fails CLOSED (D9/D23).
//   - refusing three times running moves the relationship less each time and
//     leaves three remembered facts, and both halves self-limit (D10).
//   - the tick stayed synchronous, pure and model-free (R2/D18).
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
const SRCFILES = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));

const HOUSES = 12, DAY = 48, DAYS = 7;

// Phase 4 added three more channels to OVERTURE_DEFS, so "how many overtures
// are open to this NPC right now" stopped being a proxy for "is the approach
// open". Every candidacy assertion below asks about `approach_player` BY NAME
// instead of counting the map — which is what each of them always meant, and is
// now the only way to say it. (README rule 3: the assertions were scoped, not
// loosened; each still fails if the approach's own candidacy breaks.)
const APPROACHABLE = `((g, id, loc) => 'approach_player' in scoreOvertures(g.npcs[id], id, g, __ctx(g, id, loc)))`;

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
  __res = (block, loc) => ({ block: block || 'leisure', location: loc, activity: '', transit: null });
  __ctx = (g, id, loc) => ({ perceived: [], block: 'leisure', location: loc || 'living_room',
                             npcId: id, currentTick: getTickIndex(g.meta.clock.minutes), isVisitor: false });

  // The MEASUREMENT TRAP again (the plan's Evidence, and verify-i2's OCCUPANCY
  // section): resolveBatch does not write episodes, UI's advanceAndResolve
  // does. Without this loop the knowledge layer stays empty and CURIOSITY — the
  // one motive source measured alive — reads zero, which would look exactly
  // like a dead overture system.
  __eventImportance = (evt) => (typeof evt.importance === 'number') ? evt.importance
    : (MEMORY_IMPORTANCE[EVENT_IMPORTANCE[evt.type]] !== undefined
        ? MEMORY_IMPORTANCE[EVENT_IMPORTANCE[evt.type]] : MEMORY_IMPORTANCE.ambient);

  // Runs the real loop and watches npc.overture appear and disappear. opts.rel
  // moves every resident's relationship axes before the run — the plan's third
  // measurement trap, restated: a freshly generated cast has every axis at 0
  // and they move only through conversation, so anything relational must be
  // moved deliberately or it is being measured against nothing.
  __run = (seed, ticks, opts) => {
    opts = opts || {};
    let g = __mk(seed);
    if ('playerRoom' in opts) g.player.location = opts.playerRoom;
    if (opts.playerFlags) g.player.flags = { ...(g.player.flags || {}), ...opts.playerFlags };
    if (opts.rel) for (const id of __ids(g)) Object.assign(g.npcs[id].relPlayer, opts.rel);
    const byMotive = {}, byTone = {};
    let opened = 0, ended = 0, bothAtOnce = 0, offRoom = 0;
    let prev = new Set();
    for (let t = 0; t < ticks; t++) {
      const r = resolveBatch(g, 1);
      g = r.state;
      if ('playerRoom' in opts) g.player.location = opts.playerRoom;
      if (opts.playerFlags) g.player.flags = { ...(g.player.flags || {}), ...opts.playerFlags };
      for (const evt of r.events) {
        const npc = g.npcs[evt.npcId];
        if (!npc) continue;
        g.npcs[evt.npcId] = addMemoryEpisode(npc, evt.day, formatEventText(evt, g.npcs),
          __eventImportance(evt), eventEmotionalTag(evt), evt.participants || []);
      }
      const now = new Set();
      for (const id of __ids(g)) {
        const n = g.npcs[id];
        if (n.overture && n.pursuit) bothAtOnce++;
        if (!n.overture) continue;
        now.add(id);
        if (n.location !== g.player.location) offRoom++;
        if (!prev.has(id)) {
          opened++;
          byMotive[n.overture.motive] = (byMotive[n.overture.motive] || 0) + 1;
          byTone[n.overture.tone] = (byTone[n.overture.tone] || 0) + 1;
        }
      }
      for (const id of prev) if (!now.has(id)) ended++;
      prev = now;
    }
    return { residents: __ids(g).length, opened, ended, bothAtOnce, offRoom, byMotive, byTone };
  };

  // A bare NPC carrying only what a motive reader looks at, so a generated
  // cast's temperament cannot make a source assertion accidentally true.
  __probe = (over) => ({
    bible: { name: 'Probe', temperament: { openness: 0.5, assertiveness: 0.5 }, deviantLevel: 0.5 },
    relPlayer: { affection: 0, comfort: 0, desire: 0, tension: 0, trust: 0, respect: 0, grievances: [] },
    memory: { facts: [], episodes: [], openQuestions: [], nextFactId: 1 },
    flags: {}, needs: {}, mood: 0, ...over,
  });
`);

// ---------------------------------------------------------------------------
console.log('\n(D1/D2) the table is the sibling of DRIVE_DEFS, not a parallel universe');

const DEFS = J('OVERTURE_DEFS');
const DEF_IDS = Object.keys(DEFS);
const DRIVE_IDS = J('Object.keys(DRIVE_DEFS)');

check(`OVERTURE_DEFS ships at least one entry (${DEF_IDS.length}: ${DEF_IDS.join(', ')})`, DEF_IDS.length >= 1);
// A collision would silently make one of the two unreachable: candidateDef
// checks DRIVE_DEFS first, so a colliding overture id would resolve to a drive
// def, score against the wrong utility block, and never error.
check('no overture id collides with a drive id',
      DEF_IDS.every(id => !DRIVE_IDS.includes(id)),
      DEF_IDS.filter(id => DRIVE_IDS.includes(id)).join(', '));
check('candidateDef resolves BOTH tables, and is what the scorer and the cooldown read',
      api(`candidateDef('eat') === DRIVE_DEFS.eat && candidateDef('approach_player') === OVERTURE_DEFS.approach_player
           && candidateDef('nonsense') === undefined`)
      && /const def = candidateDef\(driveId\)/.test(codeOf('drives.js'))
      && /const drive = candidateDef\(driveId\)/.test(codeOf('cognition.js'))
      && /candidateDef\(driveId\)\?\.cooldownTicks/.test(codeOf('cognition.js')),
      'two tables, one lookup — neither may grow its own cooldown arithmetic');
// D5, and the reason it is a hard assertion rather than a convention: a
// need-scored overture would compete with self-care at exactly the moments
// self-care should win.
check('NO overture declares utility.need, and every one declares utility.motive (D5)',
      DEF_IDS.every(id => !DEFS[id].utility.need && !!DEFS[id].utility.motive),
      JSON.stringify(DEF_IDS.map(id => [id, !!DEFS[id].utility.need, !!DEFS[id].utility.motive])));
check('...and no DRIVE_DEFS entry declares utility.motive, so the two terms stay disjoint',
      api(`Object.values(DRIVE_DEFS).every(d => !d.utility || !d.utility.motive)`));
check('every entry names a channel, a motive list and a baseAppeal',
      DEF_IDS.every(id => typeof DEFS[id].channel === 'string' && DEFS[id].channel
        && Array.isArray(DEFS[id].motives) && DEFS[id].motives.length > 0
        && typeof DEFS[id].utility.baseAppeal === 'number'));
// D23's discipline applied to a second table: a name nobody can read is a
// config lie, and bestMotive skips it silently, so the table has to be checked.
check('every declared motive has a reader in OVERTURE_MOTIVES',
      api(`Object.values(OVERTURE_DEFS).every(d => d.motives.every(m => typeof OVERTURE_MOTIVES[m] === 'function'))`),
      J(`Object.values(OVERTURE_DEFS).flatMap(d => d.motives).filter(m => !OVERTURE_MOTIVES[m])`).join(', '));
check('every doNotDisturb key has a source in OVERTURE_DND_SOURCES',
      api(`Object.values(OVERTURE_DEFS).every(d => (d.doNotDisturb || []).every(k => typeof OVERTURE_DND_SOURCES[k] === 'function'))`),
      J(`Object.values(OVERTURE_DEFS).flatMap(d => d.doNotDisturb || []).filter(k => !OVERTURE_DND_SOURCES[k])`).join(', '));
// D12 — the warm and charged paths must produce different narration and
// different remembered facts, or the split never reaches the player.
const TONES = ['warm', 'charged'];
check('both tones have narration AND a refusal fact, and they differ',
      TONES.every(t => Array.isArray(J('OVERTURE_APPROACH_TEMPLATES')[t]) && J('OVERTURE_APPROACH_TEMPLATES')[t].length >= 2)
      && TONES.every(t => typeof J('OVERTURE_REFUSAL_FACTS')[t] === 'string')
      && J('OVERTURE_REFUSAL_FACTS').warm !== J('OVERTURE_REFUSAL_FACTS').charged
      && JSON.stringify(J('OVERTURE_APPROACH_TEMPLATES').warm) !== JSON.stringify(J('OVERTURE_APPROACH_TEMPLATES').charged),
      'D12: two paths that read identically are one path with two labels');
check('...and every template carries the {name} substitution it is rendered with',
      TONES.every(t => J('OVERTURE_APPROACH_TEMPLATES')[t].every(s => s.includes('{name}')))
      && TONES.every(t => J('OVERTURE_REFUSAL_FACTS')[t].includes('{name}')));
// R7 / derivePlayerModel: a refusal the NPC's model of you cannot see is a
// consequence that exists only in the fact tier's word count.
check('the refusal fact is written so derivePlayerModel picks it up as player-referencing',
      api(`(() => {
        const t = OVERTURE_REFUSAL_FACTS.warm.replace('{name}', 'Hana');
        const npc = __probe({ memory: { facts: [{ text: t, factId: 1, provenance: 'witnessed', confidence: 0.9, valid: true }], episodes: [], openQuestions: [], nextFactId: 2 } });
        return derivePlayerModel(npc).observes.length === 1;
      })()`), 'R7 — what an NPC knows about you has to include what you did to them');

// ---------------------------------------------------------------------------
console.log('\n(D5) the motive term is the need term\'s opposite number, and it adds up');

check('scoreDrive scores an overture at bare baseAppeal when nothing motivates it',
      api(`(() => {
        const s = scoreDrive('approach_player', __probe(), { perceived: [], block: 'leisure', currentTick: 0 });
        return !!s && s.terms.motive === 0 && Math.abs(s.terms.base - OVERTURE_DEFS.approach_player.utility.baseAppeal) < 1e-9;
      })()`), 'absent must mean zero, not "as if maximally motivated"');
check('...and a maximally motivated one adds exactly utility.motive.weight',
      api(`(() => {
        const ctx = { perceived: [], block: 'leisure', currentTick: 0, motives: { approach_player: { strength: 1 } } };
        const s = scoreDrive('approach_player', __probe(), ctx);
        return Math.abs(s.terms.motive - OVERTURE_DEFS.approach_player.utility.motive.weight) < 1e-9;
      })()`));
check('...and the strength is clamped, so a bad reader cannot buy an unbounded score',
      api(`(() => {
        const at = (v) => scoreDrive('approach_player', __probe(),
          { perceived: [], block: 'leisure', currentTick: 0, motives: { approach_player: { strength: v } } }).terms.motive;
        return at(5) === at(1) && at(-3) === 0;
      })()`));
check('terms still sum to the score with the motive term in them',
      api(`(() => {
        const ctx = { perceived: [], block: '__none__', currentTick: 0, motives: { approach_player: { strength: 0.6 } } };
        const s = scoreDrive('approach_player', __probe(), ctx);
        const t = s.terms;
        return t.block === 1 && t.recency === 1
          && Math.abs((t.base + t.need + t.signal + t.motive + t.temperament) - s.score) < 1e-9;
      })()`), 'terms is the surface a failing tuning run gets read through — it has to add up');
// The number that encodes D5. Derived from both tables, never restated
// (README rule 5), so Phase 6 retuning either one cannot report as a break.
const MAXOVR = J('OVERTURE_DEFS.approach_player.utility.baseAppeal + OVERTURE_DEFS.approach_player.utility.motive.weight');
const MAXEAT = J('DRIVE_DEFS.eat.utility.baseAppeal + COGNITION.needWeight');
const MAXCHORE = J(`Math.max(...Object.entries(DRIVE_DEFS).filter(([, d]) => !d.utility.need).map(([, d]) => d.utility.baseAppeal))`);
check(`a maximally motivated overture (${MAXOVR.toFixed(2)}) loses to a starving NPC's eat (${MAXEAT.toFixed(2)})`,
      MAXOVR < MAXEAT, 'D5 as a number: a hungry NPC eats, a curious one asks');
check(`...and beats every ordinary chore (best unneeded baseAppeal ${MAXCHORE.toFixed(2)})`,
      MAXOVR > MAXCHORE, 'an overture nothing can outrank is a system that never fires');
check(`and it clears COGNITION.actionThreshold at all`, MAXOVR > J('COGNITION.actionThreshold'));

// ---------------------------------------------------------------------------
console.log('\n(D4) each of the four motive sources, driven directly');
// Two of these read zero on a generated cast and will until something writes
// them. Driving them here is the difference between "wired" and "wired and
// works" — a population run would exercise curiosity alone and pass.

check('curiosity reads the open-question bridge, at the SAME bar Plan 4 raises one at',
      api(`(() => {
        const mkq = (cur) => __probe({ memory: {
          facts: [{ text: 'the broken mug', factId: 7, confidence: 0.4, valid: true, provenance: 'inferred' }],
          episodes: [], nextFactId: 8,
          openQuestions: [{ topic: 'the broken mug', factId: 7, curiosity: cur, age: 1, born: 1, targets: [] }] } });
        const hi = OVERTURE_MOTIVES.curiosity(mkq(RUMINATION.raiseThreshold + 0.2));
        const lo = OVERTURE_MOTIVES.curiosity(mkq(RUMINATION.raiseThreshold - 0.01));
        return !!hi && hi.ref.factId === 7 && hi.ref.topic === 'the broken mug' && lo === null;
      })()`), 'a question worth mentioning in conversation is a question worth crossing a room for');
check('...and a question whose premise died is not raised',
      api(`(() => {
        const npc = __probe({ memory: { facts: [], episodes: [], nextFactId: 2,
          openQuestions: [{ topic: 'x', factId: 99, curiosity: 1, age: 1, born: 1, targets: [] }] } });
        return OVERTURE_MOTIVES.curiosity(npc) === null;
      })()`), 'topOpenQuestion re-checks it against the lifecycle\'s own retire rule — one bar, not two');
check('grievance takes the worst UNRESOLVED one, above its floor',
      api(`(() => {
        const g = (list) => OVERTURE_MOTIVES.grievance(__probe({ relPlayer: { grievances: list } }));
        const hit = g([{ text: 'the dishes', severity: 0.4, resolved: false },
                       { text: 'the rent', severity: 0.8, resolved: false },
                       { text: 'the noise', severity: 0.9, resolved: true }]);
        return !!hit && hit.ref.topic === 'the rent' && Math.abs(hit.strength - 0.8) < 1e-9
          && g([{ text: 'x', severity: OVERTURE.grievanceFloor - 0.01, resolved: false }]) === null
          && g([]) === null;
      })()`));
check('affection reuses the game\'s existing "real fondness" bar rather than a second one',
      api(`(() => {
        const a = (v) => OVERTURE_MOTIVES.affection(__probe({ relPlayer: { affection: v } }));
        const floor = REL_CONSEQUENCES.affectionGiftThreshold;
        return a(floor - 0.01) === null && !!a(floor) && a(floor).strength === 0
          && Math.abs(a(1).strength - 1) < 1e-9;
      })()`), 'the same bar that gates gift_to_player — README rule 5');
check('desire is the D12 gate WHOLE, and mayInitiate is finally what decides something (D20)',
      api(`(() => {
        const d = (rel, dev, flags) => OVERTURE_MOTIVES.desire(
          __probe({ bible: { deviantLevel: dev, temperament: {} }, relPlayer: rel }),
          { meta: { contentConfig: flags ? { contentFlags: flags } : null } });
        const RC = REL_CONSEQUENCES;
        const warm = d({ desire: RC.desireHighComfortHigh, comfort: RC.comfortHigh, affection: RC.affectionHigh }, 0);
        const charged = d({ desire: 1, comfort: 0, affection: 0 }, 1);
        const below = d({ desire: RC.desireHighComfortHigh - 0.01, comfort: 1, affection: 1 }, 1);
        return !!warm && warm.tone === 'warm' && !!charged && charged.tone === 'charged' && below === null;
      })()`));
check('...and the player\'s content flags close their own path (D14)',
      api(`(() => {
        const d = (rel, dev, flags) => OVERTURE_MOTIVES.desire(
          __probe({ bible: { deviantLevel: dev, temperament: {} }, relPlayer: rel }),
          { meta: { contentConfig: { contentFlags: flags } } });
        const RC = REL_CONSEQUENCES;
        return d({ desire: RC.desireHighComfortHigh, comfort: RC.comfortHigh, affection: RC.affectionHigh }, 0, { romance: false, mature: true }) === null
            && d({ desire: 1, comfort: 0, affection: 0 }, 1, { romance: true, mature: false }) === null;
      })()`), 'D14 — the content settings sit above the whole system');
check('the strongest motive wins, and ties break on the def\'s declared order',
      api(`(() => {
        const npc = __probe({ relPlayer: { affection: 1, grievances: [{ text: 'the rent', severity: 0.5, resolved: false }] } });
        const best = bestMotive(OVERTURE_DEFS.approach_player, npc, 'n', { meta: { contentConfig: null } }, 1);
        return best.motive === 'affection';
      })()`));
// 'charged' is reachable only through the desire gate. A third tone would be a
// tone with no narration and no fact behind it.
check('only the desire path can produce a charged tone',
      api(`(() => {
        const npc = __probe({ relPlayer: { affection: 1, grievances: [{ text: 'x', severity: 1, resolved: false }] } });
        const b = bestMotive(OVERTURE_DEFS.approach_player, npc, 'n', { meta: { contentConfig: null } }, 1);
        return b.tone === 'warm';
      })()`));

// ---------------------------------------------------------------------------
console.log('\n(D9) an overture never fires inside the do-not-disturb set, and the set fails CLOSED');

const DND = J('OVERTURE_DEFS.approach_player.doNotDisturb');
for (const key of DND) {
  check(`the gate blocks on '${key}'`, api(`(() => {
    const g = __mk();
    const before = overtureAllowed(g, 'approach_player');
    if (!before.allowed) return 'baseline already blocked: ' + before.reason;
    if ('${key}' === 'in_conversation') g.player.flags = { _inConversation: true };
    else if ('${key}' === 'locked_door') {
      const bucket = g.objects['room_' + g.player.location] || (g.objects['room_' + g.player.location] = {});
      bucket.__door = { id: '__door', defId: 'bedroom_door', state: { lock: 'locked' } };
    } else g.player.flags = { _vulnerableState: '${key}' };
    const after = overtureAllowed(g, 'approach_player');
    return after.allowed === false && after.reason === '${key}';
  })() === true`), 'every entry has to actually be read, or it is decoration');
}
check('a player who is not in the flat is nobody\'s candidate',
      api(`(() => { const g = __mk(); g.player.location = null;
        const a = overtureAllowed(g, 'approach_player');
        return a.allowed === false && a.reason === 'player_away'; })()`));
// D23's direction, restated for a second registry. A silent never-fires is
// findable; a silent always-fires is a layer nobody authored going off in the
// player's face.
check('an UNKNOWN doNotDisturb entry blocks rather than passing vacuously',
      api(`(() => {
        const g = __mk();
        const def = OVERTURE_DEFS.approach_player;
        const saved = def.doNotDisturb;
        def.doNotDisturb = ['no_such_state'];
        const a = overtureAllowed(g, 'approach_player');
        def.doNotDisturb = saved;
        return a.allowed === false && a.reason === 'unknown_source';
      })()`));
check('the three vulnerable states read SIM\'s one derived answer, not a second inference',
      /getPlayerVulnerableState\(gs\)/.test(codeOf('overture.js'))
      && /getDoorState\(gs,/.test(codeOf('overture.js'))
      && !/_vulnerableState/.test(codeOf('overture.js').replace(/_inConversation/g, '')),
      'D9 names the two helpers interruption.js already consults');
check('UI sets and clears the in_conversation flag the tick reads',
      /_inConversation = true/.test(codeOf('ui.js')) && /delete currentGameState\.player\.flags\._inConversation/.test(codeOf('ui.js')),
      'the tick cannot see TIME\'s context stack, so this half has to live on gameState');
check('scoreOvertures itself consults the gate — the check is not only in the caller',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1;
        g.npcs[id].location = 'living_room';
        const open = ${APPROACHABLE}(g, id);
        g.player.flags = { _inConversation: true };
        const shut = ${APPROACHABLE}(g, id);
        return open === true && shut === false;
      })()`));

// ---------------------------------------------------------------------------
console.log('\ncandidacy: an overture is not a candidate without a reason to make it');

check('no live motive, no candidate — a zero-motive overture never reaches the scorer',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].location = 'living_room';
        return Object.keys(scoreOvertures(g.npcs[id], id, g, __ctx(g, id))).length === 0;
      })()`), 'this is snoop_phone\'s defect — a candidate on every tick whose resolver did nothing — not repeated in a new table');
check('an NPC already holding one is not shopping for a second',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1; g.npcs[id].location = 'living_room';
        const before = Object.keys(scoreOvertures(g.npcs[id], id, g, __ctx(g, id))).length;
        openOverture(g, id, { overtureId: 'approach_player', motive: 'affection', motiveRef: {}, tone: 'warm' });
        const after = Object.keys(scoreOvertures(g.npcs[id], id, g, __ctx(g, id))).length;
        return before >= 1 && after === 0;
      })()`));
// The rooms are read off ROOM_ADJACENCY rather than named from memory: the
// Mirrored H layout is sparser than it looks (the living room and the kitchen
// are TWO hops apart, through the dining room), and hardcoding a pair that
// turned out not to be adjacent is how this assertion failed on its first run.
check('same room and one step are a crossing; two rooms away is a journey (D26)',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1;
        const here = g.player.location;
        const next = ROOM_ADJACENCY[here][0];
        const far = Object.keys(ROOM_ADJACENCY).find(r => r !== here && !isRoomAdjacent(here, r));
        const at = (loc) => ${APPROACHABLE}(g, id, loc);
        return at(here) === true && at(next) === true && at(far) === false;
      })()`), 'a journey is Phase 4\'s knock, not Phase 3\'s approach');
check('the cooldown is the shared one, on the shared key',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1; g.npcs[id].location = 'living_room';
        const c = __ctx(g, id);
        const before = ${APPROACHABLE}(g, id);
        g.npcs[id] = setCooldown(g.npcs[id], 'approach_player', c.currentTick);
        const after = ${APPROACHABLE}(g, id);
        return before === true && after === false && isOnCooldown(g.npcs[id], 'approach_player', c.currentTick) === true;
      })()`), 'without candidateDef this threw — isOnCooldown read DRIVE_DEFS[id].cooldownTicks off undefined');
check('a block the def does not list is not an opening',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1; g.npcs[id].location = 'living_room';
        const at = (b) => 'approach_player' in scoreOvertures(g.npcs[id], id, g, { ...__ctx(g, id), block: b });
        const allowed = OVERTURE_DEFS.approach_player.blockFilter[0];
        const blocked = ['sleep', 'commute', 'prep'].find(b => !OVERTURE_DEFS.approach_player.blockFilter.includes(b));
        return at(allowed) === true && at(blocked) === false;
      })()`));
check('scoreOvertures is pure — it mutates neither the npc nor gameState',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1; g.npcs[id].location = 'living_room';
        const before = JSON.stringify([g, g.npcs[id]]);
        scoreOvertures(g.npcs[id], id, g, __ctx(g, id));
        return JSON.stringify([g, g.npcs[id]]) === before;
      })()`));

// ---------------------------------------------------------------------------
console.log('\n(D19) npc.overture has exactly one writing file, and the named writers are its only path');

const overtureWrites = [];
for (const f of SRCFILES) {
  for (const _ of codeOf(f).matchAll(/\w+\.overture\s*=\s*\{/g)) overtureWrites.push(`${f}: builds`);
  for (const _ of codeOf(f).matchAll(/delete\s+\w+\.overture/g)) overtureWrites.push(`${f}: deletes`);
}
check('npc.overture is only ever built or deleted in overture.js',
      overtureWrites.length >= 3 && overtureWrites.every(w => w.startsWith('overture.js')),
      JSON.stringify(overtureWrites));
check('and the named writers the plan called for all exist',
      ['openOverture', 'resolveOverture', 'lapseOverture', 'ageOverture']
        .every(fn => new RegExp(`function ${fn}\\(`).test(codeOf('overture.js'))));
// Asserted line by line rather than by an occurrence count: the point is that
// sim.js only AGES the record, CARRIES it through the merge, and HOLDS the NPC
// who has one — never builds or clears it — and a count of the word cannot say
// that. (verify-c2 makes the same claim about pursuit as a count, which is
// balanced by coincidence and would break on any edit to those lines.)
const SIM_OVERTURE_LINES = codeOf('sim.js').split('\n')
  .map(s => s.trim()).filter(s => /overture/i.test(s));
const SIM_OVERTURE_ALLOWED = [
  /^ageOverture\(gameState, id, resolved\[id\]\);$/,
  /^npcUpdates\[id\]\.overture = postDrive\.overture;$/,
  /^if \(isOverturePending\(npcs\[id\]\)\) \{$/,
  // Phase 4: WHERE a waiting NPC stands became channel-specific (a knocker
  // stays at the door), so the answer moved into OVERTURE beside the rest of
  // what a channel means. sim.js asks and writes; the claim above is unchanged.
  /^const \{ roomId: waitRoom, activity: waitActivity \} = overtureWaitRoom\(gameState, npcs\[id\]\);$/,
];
check('sim.js only ages, carries and holds — it never builds or clears the record',
      SIM_OVERTURE_LINES.length === SIM_OVERTURE_ALLOWED.length
      && SIM_OVERTURE_LINES.every(l => SIM_OVERTURE_ALLOWED.some(re => re.test(l))),
      JSON.stringify(SIM_OVERTURE_LINES));
check('the record carries exactly the fields the data model names',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        const rec = openOverture(g, id, { overtureId: 'approach_player', motive: 'curiosity', motiveRef: { factId: 3 }, tone: 'warm' });
        const keys = Object.keys(rec).sort().join(',');
        return keys === 'channel,motive,motiveRef,openedDay,overtureId,status,targetId,ticksLeft,tone'
          && rec.status === 'pending' && rec.targetId === 'player' && rec.channel === 'approach';
      })()`), 'D26 — ticksLeft + openedDay in place of the sketched openedTick, which wraps at midnight and cannot measure an age');
check('absent means absent — a resolved overture is deleted, never nulled',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        openOverture(g, id, { overtureId: 'approach_player', motive: 'curiosity', motiveRef: {}, tone: 'warm' });
        const rec = resolveOverture(g, id, 'engaged');
        return rec.status === 'engaged' && !('overture' in g.npcs[id])
          && JSON.parse(JSON.stringify(g.npcs[id])).overture === undefined
          && resolveOverture(g, id, 'engaged') === null;
      })()`), 'a save written mid-overture has to round-trip to genuinely absent');
check('isOverturePending is what the readers ask, so `status` has a reader on both sides',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        const a = isOverturePending(g.npcs[id]);
        openOverture(g, id, { overtureId: 'approach_player', motive: 'curiosity', motiveRef: {}, tone: 'warm' });
        return a === false && isOverturePending(g.npcs[id]) === true;
      })()`));
check('ageOverture lapses on the budget, on sleep, on leaving the flat, and on the player leaving',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        const open = () => openOverture(g, id, { overtureId: 'approach_player', motive: 'curiosity', motiveRef: {}, tone: 'warm' });
        const budget = OVERTURE_DEFS.approach_player.utility.holdTicks;
        open();
        for (let i = 1; i < budget; i++) if (!ageOverture(g, id, __res('leisure', 'living_room'))) return 'died early at ' + i;
        if (ageOverture(g, id, __res('leisure', 'living_room')) !== null) return 'outlived its budget';
        open(); if (ageOverture(g, id, __res('sleep', 'bedroom_2')) !== null) return 'survived sleep';
        open(); if (ageOverture(g, id, __res('leisure', null)) !== null) return 'survived leaving the flat';
        open(); g.player.location = null;
        if (ageOverture(g, id, __res('leisure', 'living_room')) !== null) return 'survived the player leaving';
        return true;
      })() === true`), 'a record left pending would hold the NPC\'s next overture hostage to a moment that is over');
// Plan 3's scar, restated as an assertion so it cannot be re-introduced by
// someone tidying ageOverture: releasing on the NPC's own room would kill most
// records on the tick after the one that walked them over, because Pass 1
// re-rolls a room preference every tick. SIM's hold branch is what keeps them
// in place instead.
check('...but NOT on the NPC\'s own room, which Pass 1 re-rolls every tick',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        openOverture(g, id, { overtureId: 'approach_player', motive: 'curiosity', motiveRef: {}, tone: 'warm' });
        const far = Object.keys(ROOM_ADJACENCY).find(r => !isRoomAdjacent(g.player.location, r));
        return ageOverture(g, id, __res('leisure', far)) !== null;
      })()`)
      && /if \(isOverturePending\(npcs\[id\]\)\)/.test(codeOf('sim.js'))
      && /npcUpdates\[id\]\.location = waitRoom/.test(codeOf('sim.js')),
      'the same mistake cancelled 233 of 485 pursuits before agePursuit stopped releasing on transit');

// ---------------------------------------------------------------------------
console.log('\n(invariant 2) one committed intent per npc-tick, by construction');

check('there is ONE ranked list and ONE chooser — the overture rides on the winner',
      /scoreOvertures\(npc, npcId, gameState, ctx\)/.test(codeOf('cognition.js'))
      && /out\.push\(scored\)/.test(codeOf('cognition.js'))
      && /const overture = chooseOverture\(choice\)/.test(codeOf('drives.js')),
      'a second selection system is what D1 exists to prevent');
check('the overture branch RETURNS before openPursuit can run',
      (() => {
        const c = codeOf('drives.js');
        const branch = c.indexOf('chooseOverture(choice)');
        const open = c.indexOf('openPursuit(gameState, npcId');
        const ret = c.indexOf('return result();', branch);
        return branch > 0 && open > branch && ret > branch && ret < open;
      })(),
      'invariant 2 is a property of the control flow, not a rule');
check('scoreCandidates ranks overtures in the same list as drives',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1;
        const ranked = scoreCandidates(g.npcs[id], id, g, __res('leisure', 'living_room'), []);
        const hit = ranked.find(c => c.driveId === 'approach_player');
        return !!hit && !!hit.overture && hit.overture.motive === 'affection'
          && ranked.some(c => c.driveId !== 'approach_player');
      })()`));
check('a strongly motivated overture can outscore an ordinary chore and win the tick',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1;
        const ranked = scoreCandidates(g.npcs[id], id, g, __res('leisure', 'living_room'), []);
        return chooseOverture(choosePursuit(ranked)) !== null;
      })()`), 'an overture nothing can win with is a table nobody reads');
check('chooseOverture is not a second chooser — it reads the winner and nothing else',
      api(`chooseOverture(null) === null && chooseOverture({ driveId: 'eat', score: 9 }) === null`));

// ---------------------------------------------------------------------------
console.log(`\nOCCUPANCY — ${HOUSES} households x 3 residents x ${DAYS} in-game days, through the real resolveBatch`);

function run(label, days, opts) {
  const tot = { residents: 0, opened: 0, ended: 0, bothAtOnce: 0, offRoom: 0, byMotive: {}, byTone: {} };
  for (let i = 0; i < HOUSES; i++) {
    const r = J(`__run(${20260811 + i * 7919}, ${days * DAY}, ${JSON.stringify(opts || {})})`);
    tot.residents += r.residents; tot.opened += r.opened; tot.ended += r.ended;
    tot.bothAtOnce += r.bothAtOnce; tot.offRoom += r.offRoom;
    for (const [k, v] of Object.entries(r.byMotive)) tot.byMotive[k] = (tot.byMotive[k] || 0) + v;
    for (const [k, v] of Object.entries(r.byTone)) tot.byTone[k] = (tot.byTone[k] || 0) + v;
  }
  tot.perNpcDay = tot.opened / (tot.residents * days);
  console.log(`        ${label.padEnd(30)} opened ${String(tot.opened).padStart(4)}  ` +
    `${tot.perNpcDay.toFixed(3)}/npc/day  motives ${JSON.stringify(tot.byMotive)} tones ${JSON.stringify(tot.byTone)}`);
  return tot;
}

const RC = J('REL_CONSEQUENCES');
const untouched = run('untouched (curiosity only)', DAYS, {});
const fond = run('affection 0.9', DAYS, { rel: { affection: 0.9 } });
const charged = run('desire 0.9, comfort/aff 0.30', DAYS, { rel: { desire: 0.9, comfort: 0.30, affection: 0.30 } });
const away = run('player never home', DAYS, { playerRoom: null });
const asleep = run('player asleep the whole week', DAYS, { playerFlags: { _vulnerableState: 'sleeping' } });

// THE invariant, measured over 36 residents x 7 days rather than argued.
check('no NPC ever held a pursuit and an overture at the same time',
      [untouched, fond, charged].every(r => r.bothAtOnce === 0),
      JSON.stringify([untouched.bothAtOnce, fond.bothAtOnce, charged.bothAtOnce]));
check('every pending overture was in the player\'s room — they actually crossed it',
      [untouched, fond, charged].every(r => r.offRoom === 0),
      JSON.stringify([untouched.offRoom, fond.offRoom, charged.offRoom]));
// Bands, never constants: Phase 6 exists to move this rate and a pinned figure
// would report the retune as a regression (README rule 4/5).
check('the one live motive source reaches the player unaided',
      untouched.opened > 0 && (untouched.byMotive.curiosity || 0) === untouched.opened,
      `${untouched.opened} overtures, ${JSON.stringify(untouched.byMotive)} — grievance/affection/desire are still 0 on a generated cast, by measurement`);
check('...and it does NOT become the flat\'s dominant behaviour on its own',
      untouched.perNpcDay < 1, `${untouched.perNpcDay.toFixed(3)}/npc/day`);
check('a fond cast opens more often than an indifferent one, on affection',
      fond.opened > untouched.opened && (fond.byMotive.affection || 0) > 0,
      `${fond.opened} vs ${untouched.opened}`);
check('the charged tone is reachable on a REAL generated cast, not only on a probe',
      (charged.byTone.charged || 0) > 0 && (charged.byMotive.desire || 0) > 0,
      `${JSON.stringify(charged.byTone)} — D12's second path has to survive contact with the measured disinhibition spread`);
check('every overture ended — none was left pending forever',
      [untouched, fond, charged].every(r => r.opened - r.ended <= r.residents),
      JSON.stringify([untouched, fond, charged].map(r => [r.opened, r.ended])));
// D9, over a population rather than one probe.
check('a player who is never home receives NOTHING, over the whole population',
      away.opened === 0, `${away.opened}`);
check('...and neither does one who is asleep for a week',
      asleep.opened === 0, `${asleep.opened} — this is what stops an 8-hour sleep batch surfacing overtures nobody saw`);

// ---------------------------------------------------------------------------
console.log('\n(D10) a refusal costs, is remembered, and BOTH halves self-limit');

const OV = J('OVERTURE');
check('the scale halves per refusal inside the window',
      api(`(() => {
        const npc = __probe();
        const at = (n) => { npc.flags = { _overtureRefusals: { count: n, lastDay: 5 } }; return overtureRefusalScale(npc, 5); };
        return at(0) === 1 && Math.abs(at(1) - OVERTURE.refusalDiminish) < 1e-9
          && Math.abs(at(2) - Math.pow(OVERTURE.refusalDiminish, 2)) < 1e-9
          && at(3) < at(2) && at(2) < at(1);
      })()`), 'the diminishing return is the half that makes the remembering safe');
check('...and resets once the window has lapsed — three in a fortnight is not three in an evening',
      api(`(() => {
        const npc = __probe({ flags: { _overtureRefusals: { count: 3, lastDay: 5 } } });
        return overtureRefusalScale(npc, 5 + OVERTURE.refusalWindowDays) < 1
          && overtureRefusalScale(npc, 5 + OVERTURE.refusalWindowDays + 1) === 1;
      })()`));
// The plan's own assertion, run as arithmetic over the real writers: refusing
// three times in a row moves the relationship less each time and leaves three
// facts. UI needs a DOM, so the economy is exercised here and the call is
// source-scanned below.
check('three refusals running move the relationship LESS each time, and leave three facts',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        const day = 5; g.meta.clock.day = day;
        g.npcs[id].relPlayer.affection = 0.9;
        const moves = [];
        for (let i = 0; i < 3; i++) {
          const npc = g.npcs[id];
          const scale = overtureRefusalScale(npc, day);
          const before = npc.relPlayer.affection;
          const deltas = {};
          for (const [k, v] of Object.entries(OVERTURE.refusalDelta)) deltas[k] = v * scale;
          g.npcs[id] = applyRelDelta(npc, deltas, day);
          g.npcs[id] = addMemoryFact(g.npcs[id], {
            text: OVERTURE_REFUSAL_FACTS.warm.replace('{name}', 'Hana'), day,
            importance: MEMORY_IMPORTANCE[OVERTURE.refusalFactImportance],
            category: 'relationship', provenance: 'witnessed',
            confidence: OVERTURE.refusalFactConfidence });
          noteOvertureRefused(g, id, day);
          moves.push(before - g.npcs[id].relPlayer.affection);
        }
        const facts = g.npcs[id].memory.facts;
        return moves[0] > moves[1] && moves[1] > moves[2] && moves[2] > 0
          && facts.length === 3
          && facts.every(f => f.provenance === 'witnessed' && f.confidence === OVERTURE.refusalFactConfidence && f.pinned === false);
      })()`), 'the NPC learns to stop asking rather than learning to hate you');
check('the remembered refusal is an ordinary belief — it decays and it is not pinned',
      OV.refusalFactConfidence < 1 && J(`MEMORY_IMPORTANCE['${OV.refusalFactImportance}']`) < J('MEMORY_IMPORTANCE.significant'),
      'importance >= significant would pin it permanently, which is the grudge D10 exists to prevent');
// The other half of "both self-limit", and the reason it is ONE function: a
// refused NPC is also a less motivated one.
check('the SAME scale suppresses the next overture, not just its cost',
      api(`(() => {
        const npc = __probe({ relPlayer: { affection: 1 } });
        const at = (n) => {
          npc.flags = { _overtureRefusals: { count: n, lastDay: 3 } };
          return bestMotive(OVERTURE_DEFS.approach_player, npc, 'n', { meta: { contentConfig: null } }, 3).strength;
        };
        return at(0) > at(1) && at(1) > at(2);
      })()`), 'D10 — the relationship cost and the willingness to ask again decay on one curve, by construction');
check('noteOvertureRefused counts inside the window and restarts outside it',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        noteOvertureRefused(g, id, 5);
        const a = g.npcs[id].flags._overtureRefusals.count;
        noteOvertureRefused(g, id, 5);
        const b = g.npcs[id].flags._overtureRefusals.count;
        noteOvertureRefused(g, id, 5 + OVERTURE.refusalWindowDays + 1);
        const c = g.npcs[id].flags._overtureRefusals.count;
        return a === 1 && b === 2 && c === 1;
      })()`));
// UI is unreachable here (it needs a DOM), so the wiring is a source scan —
// the same technique verify-i2 uses for checkRelConsequences.
const UI = codeOf('ui.js').replace(/\s+/g, ' ');
check('UI\'s refusal path applies all three consequences, in the order that makes the first one full price',
      /function applyOvertureRefusal\(npcId, record\)/.test(UI)
      && /applyRelDelta\(npc, deltas, day\)/.test(UI)
      && /addMemoryFact\(currentGameState\.npcs\[npcId\]/.test(UI)
      && UI.indexOf('noteOvertureRefused(currentGameState') > UI.indexOf('addMemoryFact(currentGameState.npcs[npcId]'),
      'counting the refusal before scaling by it would make the FIRST one already discounted');
check('...and all three endings have a call site: talk -> engaged, leave -> refused, neither -> lapsed',
      /resolveOverture\(currentGameState, npcId, 'engaged'\)/.test(UI)
      && /resolveOverture\(currentGameState, id, 'refused'\)/.test(UI)
      && /refuseOverturesInRoom\(currentGameState\.player\.location\)/.test(UI)
      && /lapseOverture\(gameState, npcId\)/.test(codeOf('overture.js')),
      'D8 — approach needs no new surface, because doTalk and doMove are already the two things a player does');
// Phase 4 put a channel lookup in front of the tone one — every channel that
// arrives in the scene has its own template table and the tone still picks the
// list inside it. The claim is unchanged; the indirection is what four channels
// cost. (`text` is deliberately absent from that table: a text arrives in a
// thread, not in the room, and narrating it here would tell the player about a
// message they have not opened.)
check('the arrival is narrated once, from the tone\'s own template list (D12)',
      /function narrateOvertureArrivals\(before\)/.test(UI)
      && /OVERTURE_ARRIVAL_TEMPLATES\[npc\.overture\.channel\]/.test(UI)
      && /approach: OVERTURE_APPROACH_TEMPLATES/.test(UI)
      && /byTone\[npc\.overture\.tone\] \|\| byTone\.warm/.test(UI)
      && /const overturesBefore = pendingOvertureIds\(currentGameState\)/.test(UI),
      'diffing before and after is what buys "exactly once" without a `surfaced` field nothing else would read');
check('the opening beat names the motive, so the NPC opens about what moved them',
      /function overtureOpeningLine\(npc, record\)/.test(UI)
      && /overtureOpeningLine\(npc, overture\)/.test(UI)
      && /case 'curiosity'/.test(UI) && /case 'grievance'/.test(UI) && /case 'desire'/.test(UI),
      'D18 — generated at the moment it surfaces, through the conversation the player opens');

// ---------------------------------------------------------------------------
console.log('\n(R2/D18) none of this reached a model, and the tick stayed pure');

check('a week of ticks runs with generateText stubbed to explode, on a cast that opens overtures',
      api(`(() => {
        const orig = root.generateText;
        root.generateText = () => { throw new Error('the tick called a model'); };
        try {
          const g = __mk();
          for (const id of __ids(g)) g.npcs[id].relPlayer.affection = 0.9;
          let s = g, opened = 0;
          for (let i = 0; i < ${DAY * 2}; i++) {
            const r = resolveBatch(s, 1); s = r.state;
            s.player.location = 'living_room';
            for (const id of __ids(s)) if (s.npcs[id].overture) opened++;
          }
          return opened > 0 ? true : 'no overture opened, so this proved nothing';
        } catch (e) { return 'threw: ' + e.message; }
        finally { root.generateText = orig; }
      })() === true`));
check('nothing in overture.js is async or reaches root.generateText',
      !/\basync\b/.test(codeOf('overture.js')) && !/generateText/.test(codeOf('overture.js')));
check('...and the two files it changed are still model-free too',
      ['cognition.js', 'drives.js'].every(f => !/generateText/.test(codeOf(f))));
check('resolveBatch is still deterministic under the same seed',
      api(`JSON.stringify(__run(20260811, 96, { rel: { affection: 0.9 } })) === JSON.stringify(__run(20260811, 96, { rel: { affection: 0.9 } }))`));
check('openOverture is the only thing in the tick that writes the record — scoring wrote nothing',
      api(`(() => {
        const g = __mk(); const id = __ids(g)[0];
        g.npcs[id].relPlayer.affection = 1;
        const before = JSON.stringify(g);
        scoreCandidates(g.npcs[id], id, g, __res('leisure', 'living_room'), []);
        return JSON.stringify(g) === before;
      })()`));

// ---------------------------------------------------------------------------
console.log('\n(house rules) the new file is loaded, ordered and versioned');

const MAIN = fs.readFileSync(path.join(SRC, '..', '..', 'main.html'), 'utf8');
// Floors, never equalities (README rule 4).
for (const [file, floor] of [['config.js', 82], ['sim.js', 43], ['drives.js', 20], ['cognition.js', 5], ['overture.js', 1], ['ui.js', 61]]) {
  const m = MAIN.match(new RegExp(`${file.replace('.', '\\.')}\\?v=(\\d+)`));
  check(`main.html loads ${file} at v>=${floor}`, !!m && Number(m[1]) >= floor, m ? `found v=${m[1]}` : 'not found');
}
check('overture.js loads AFTER cognition.js in main.html',
      MAIN.indexOf('src/srcfiles/overture.js') > MAIN.indexOf('src/srcfiles/cognition.js'),
      'scoreCandidates calls scoreOvertures; the reverse order is a load-time ReferenceError waiting to happen');
// README rule 6, and the incident it exists for: rumination.js shipped in
// main.html, never reached ORDER, and killed 175 assertions across five
// harnesses for two plans.
const ORDER_SRC = fs.readFileSync(path.join(__dirname, 'loadgame.js'), 'utf8');
check('overture.js is in loadgame.js ORDER, after cognition.js',
      ORDER_SRC.indexOf(`'overture.js'`) > ORDER_SRC.indexOf(`'cognition.js'`)
      && ORDER_SRC.indexOf(`'overture.js'`) > 0);
check('every file named in loadgame.js ORDER exists on disk',
      [...ORDER_SRC.matchAll(/'([\w.]+\.js)'/g)].map(m => m[1]).every(f => fs.existsSync(path.join(SRC, f))));
check('every file this phase touched is loadable by the harness, or deliberately is not',
      ['config.js', 'sim.js', 'drives.js', 'cognition.js', 'overture.js'].every(f => ORDER_SRC.includes(`'${f}'`))
      && !ORDER_SRC.includes(`'ui.js'`),
      'ui.js needs a DOM — which is why the gate, the scorer and the writers all live outside it');

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
