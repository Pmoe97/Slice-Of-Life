// Vocation & Lifestyle Expansion — Phase 5 (content-creation work) and
// Phase 6 (collaboration and couple sessions).
//
// The single most important assertion in this file is section 5's: a couple
// session must be IMPOSSIBLE against a partner who fails the willingness
// gate, tested by forcing exactly that situation rather than by hoping it
// never arises. Design invariant 5 says the gate is never bypassed, extended
// or special-cased, and an invariant with no test is a preference.
//
// Everything else is rarity and reachability. A "rare thing you might catch"
// is only rare if measured, and only a thing you can catch if the peek
// pipeline can name it.
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const SRCFILES = path.join(__dirname, '..', '..', 'src', 'srcfiles');
const srcOf = (f) => fs.readFileSync(path.join(SRCFILES, f), 'utf8');

api(`
  __house = (seed) => {
    const h = SIM_generateHouse(seed, 3);
    const gs = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                 player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    for (const k of Object.keys(gs.world.upgrades)) gs.world.upgrades[k] = { tier: 'functional', condition: 100 };
    return gs;
  };
  __residents = (gs) => Object.keys(gs.npcs).filter(id => gs.npcs[id].residency && gs.npcs[id].residency.status === 'resident').sort();
  __makeCreator = (gs, id) => {
    const src = OCCUPATION_POOL.find(o => o.title === 'Cam Model');
    gs.npcs[id].bible.occupation = {
      category: src.category, title: src.title, scheduleTemplate: src.scheduleTemplate,
      incomeBand: src.incomeBand, hours: src.hours, workMode: src.workMode,
      incomeSource: src.incomeSource, workRoom: src.workRoom, contentWork: true,
    };
    gs.npcs[id].bible.scheduleTemplate = src.scheduleTemplate;
    return gs.npcs[id];
  };
  __maxDeviant = (npc) => {
    const t = npc.bible.temperament;
    t.volatility = 1; t.openness = 1; t.assertiveness = 1;
    delete npc.bible.deviantLevel;
    return npc;
  };
`);

// ---------------------------------------------------------------- 1
console.log('\n1. The drives exist and are shaped like their siblings');

for (const d of ['content_session', 'content_pool_session', 'content_collab']) {
  check(`${d} is a DRIVE_DEFS entry`, api(`!!DRIVE_DEFS[${JSON.stringify(d)}]`));
  check(`${d} has a candidacy door`, api(`typeof DRIVE_CANDIDACY[${JSON.stringify(d)}] === 'function'`));
  check(`${d} declares baseAppeal and holdMinutes`,
    api(`!!(DRIVE_DEFS[${JSON.stringify(d)}].utility.baseAppeal && DRIVE_DEFS[${JSON.stringify(d)}].utility.holdMinutes)`));
}
check('CONTENT_WORK_TUNING exists', api(`typeof CONTENT_WORK_TUNING === 'object'`));
check('the pool session is facility-gated through npcDecayActions, like swim',
  api(`JSON.stringify(MAINTENANCE.npcDecayActions.content_pool_session) === JSON.stringify(['pool_systems'])`));

// D16: nudity is decided in exactly one place, and it is not in a drive.
check('no content drive sets clothing to nude (design invariant 4)',
  api(`['content_session','content_pool_session','content_collab']
        .every(k => DRIVE_DEFS[k].setsClothing !== 'nude')`));
check('the off-screen event lines stay ambiguous — no explicit act named',
  api(`['content_session','content_pool_session','content_collab']
        .every(k => !/\\b(sex|fucking|naked|nude|porn)\\b/i.test(DRIVE_DEFS[k].eventTemplate || ''))`),
  api(`JSON.stringify(['content_session','content_pool_session','content_collab'].map(k => DRIVE_DEFS[k].eventTemplate))`));

// ---------------------------------------------------------------- 2
console.log('\n2. The occupation flag, and who carries it');

const flagged = api(`OCCUPATION_POOL.filter(o => o.contentWork).map(o => o.title)`);
console.log(`        contentWork titles: ${flagged.join(', ')}`);
check('contentWork is set on the filmed-at-home titles only',
  flagged.length >= 3 && flagged.every(t => ['Cam Model', 'Adult Film Performer', 'Premium Content Creator'].includes(t)),
  flagged.join(', '));
check('an Exotic Dancer / Escort / boutique owner is NOT flagged (they work elsewhere)',
  api(`OCCUPATION_POOL.filter(o => ['Exotic Dancer','Escort','Adult Boutique Owner'].includes(o.title)).every(o => !o.contentWork)`));
check('the flag survives onto the generated bible', api(`
  (() => {
    for (let i = 0; i < 300; i++) {
      const r = generateCast('voc-cw-' + i, 4, 1, null);
      for (const id of r.npcIds) {
        const o = r.npcs[id].bible.occupation;
        if (o.contentWork) return true;
      }
    }
    return false;
  })()
`));

// ---------------------------------------------------------------- 3
console.log('\n3. Candidacy doors (D16/D17)');

check('content_session needs the occupation AND a private room', api(`
  (() => {
    const gs = __house('p56-cand');
    const id = __residents(gs)[0];
    const npc = __makeCreator(gs, id);
    const priv = DRIVE_CANDIDACY.content_session(npc, id, gs, { block: 'work', location: npc.residency.room });
    const common = DRIVE_CANDIDACY.content_session(npc, id, gs, { block: 'work', location: 'living_room' });
    delete npc.bible.occupation.contentWork;
    const notCreator = DRIVE_CANDIDACY.content_session(npc, id, gs, { block: 'work', location: npc.residency.room });
    return priv === true && common === false && notCreator === false;
  })()
`));

check('content_session does NOT require desire — it is work, not a mood', api(`
  (() => {
    const gs = __house('p56-desire');
    const id = __residents(gs)[0];
    const npc = __makeCreator(gs, id);
    npc.needs = { ...(npc.needs || {}), desire: 0 };
    return DRIVE_CANDIDACY.content_session(npc, id, gs, { block: 'work', location: npc.residency.room }) === true;
  })()
`));

check('the pool session needs high disinhibition, a late block, and an EMPTY pool room', api(`
  (() => {
    const gs = __house('p56-pool');
    const ids = __residents(gs);
    const npc = __maxDeviant(__makeCreator(gs, ids[0]));
    for (const i of ids) gs.npcs[i].location = 'living_room';
    const ok    = DRIVE_CANDIDACY.content_pool_session(npc, ids[0], gs, { block: 'wind_down', location: 'pool_room' });
    const early = DRIVE_CANDIDACY.content_pool_session(npc, ids[0], gs, { block: 'midday',    location: 'pool_room' });
    gs.npcs[ids[1]].location = 'pool_room';
    const busy  = DRIVE_CANDIDACY.content_pool_session(npc, ids[0], gs, { block: 'wind_down', location: 'pool_room' });
    gs.npcs[ids[1]].location = 'living_room';
    const t = npc.bible.temperament;
    t.volatility = -1; t.openness = -1; t.assertiveness = -1;
    const shy   = DRIVE_CANDIDACY.content_pool_session(npc, ids[0], gs, { block: 'wind_down', location: 'pool_room' });
    return ok === true && early === false && busy === false && shy === false;
  })()
`));

check('the pool floor sits ABOVE the adult-occupation floor (a stricter cut of an already-selected group)',
  api(`CONTENT_WORK_TUNING.poolDisinhibitionFloor > VOCATION_TUNING.adultDisinhibitionFloor`));

// ---------------------------------------------------------------- 4
console.log('\n4. Visibility — a thing you can actually catch');

const unnamed = api(`
  (() => {
    const acts = ['content_session','content_pool_session','content_collab']
      .map(k => DRIVE_DEFS[k].activityOverride).filter(Boolean);
    return acts.filter(a => !PEEK_VIEW_ACT[a]);
  })()
`);
check('every content activity has a PEEK_VIEW_ACT row', unnamed.length === 0, unnamed.join(', '));
check('the safe and explicit peek phrasings genuinely differ for content work',
  api(`['filming','filming by the pool','filming together']
        .every(a => PEEK_VIEW_ACT[a] && PEEK_VIEW_ACT[a].safe !== PEEK_VIEW_ACT[a].explicit)`));
check('content work dresses for the job, not in loungewear (D14 exception)',
  api(`ACTIVITY_OUTFIT_TYPES['filming'] === 'sexy' && ACTIVITY_OUTFIT_TYPES['filming by the pool'] === 'swim'`));
check('the sexy outfit type exists and composes from real garments', api(`
  (() => {
    if (!OUTFIT_TYPES.sexy) return false;
    const wearable = Object.values(CLOTHING_DEFS)
      .filter(d => (d.traits || []).some(t => OUTFIT_TYPES.sexy.traits.includes(t)));
    return wearable.length >= 4;
  })()
`));

// ---------------------------------------------------------------- 5
console.log('\n5. THE WILLINGNESS GATE (D19 / design invariant 5)');

check('content_collab routes through findIntimatePartner — the gate is the door',
  srcOf('cognition.js').includes('findIntimatePartner(npc, npcId, gameState, ctx.location, ctx.block)')
  && /content_collab:[\s\S]{0,900}findIntimatePartner/.test(srcOf('cognition.js')));

check('a partner who FAILS the willingness gate makes the drive non-candidate', api(`
  (() => {
    const gs = __house('p56-gate');
    const ids = __residents(gs);
    const npc = __maxDeviant(__makeCreator(gs, ids[0]));
    const room = npc.residency.room;
    // Force co-location in a private room, and make the partner maximally
    // willing-looking on every axis EXCEPT the gate itself.
    const partner = __maxDeviant(gs.npcs[ids[1]]);
    npc.location = room; partner.location = room;
    partner.residency.room = room;
    npc.needs = { ...(npc.needs || {}), desire: 100 };
    partner.needs = { ...(partner.needs || {}), desire: 100 };

    const before = DRIVE_CANDIDACY.content_collab(npc, ids[0], gs, { block: 'evening', location: room });

    // Now break ONLY the willingness gate and re-ask. Nothing else changes.
    const savedGate = resolveWillingnessGate;
    resolveWillingnessGate = () => ({ allowed: false, reason: 'forced_refusal' });
    const after = DRIVE_CANDIDACY.content_collab(npc, ids[0], gs, { block: 'evening', location: room });
    resolveWillingnessGate = savedGate;

    // 'before' may legitimately be either — co-location and disinhibition are
    // not guaranteed by this construction. What must ALWAYS hold is 'after'.
    return after === false;
  })()
`), 'a refusing partner must make this impossible, whatever else is true');

check('...and the same holds for the ordinary intimate drive (no new bypass)', api(`
  (() => {
    const gs = __house('p56-gate2');
    const ids = __residents(gs);
    const npc = gs.npcs[ids[0]];
    const room = npc.residency.room;
    gs.npcs[ids[1]].location = room; npc.location = room;
    npc.needs = { ...(npc.needs || {}), desire: 100 };
    const savedGate = resolveWillingnessGate;
    resolveWillingnessGate = () => ({ allowed: false, reason: 'forced_refusal' });
    const after = DRIVE_CANDIDACY.intimate(npc, ids[0], gs, { block: 'evening', location: room });
    resolveWillingnessGate = savedGate;
    return after === false;
  })()
`));

check('the collab drive reuses the intimate resolver rather than a second pair path',
  api(`DRIVE_DEFS.content_collab.isIntimateDrive === true`));
check('the pair commitment is labelled with the drive that opened it, not always "intimate"',
  srcOf('drives.js').includes("driveId: driveId || 'intimate'"));

// ---------------------------------------------------------------- 6
console.log('\n6. The collab ask (D18) — an overture row, not a new system');

check('collab_ask is an OVERTURE_DEFS entry on the propose channel',
  api(`!!OVERTURE_DEFS.collab_ask && OVERTURE_DEFS.collab_ask.channel === 'propose'`));
check('OVERTURE_CANDIDACY exists and gates it', api(`typeof OVERTURE_CANDIDACY.collab_ask === 'function'`));
check('it proposes a real COMMITMENT_KINDS entry',
  api(`!!COMMITMENT_KINDS[OVERTURE_DEFS.collab_ask.proposes.kind]`));
check('it is refusable and carries its own refusal facts',
  api(`!!OVERTURE_DEFS.collab_ask.respond.decline && !!OVERTURE_DEFS.collab_ask.refusalFacts`));
check('overture.js has no new code path for it — the four channels are the four channels',
  api(`Object.keys(OVERTURE_PROXIMITY).length === 3 && OVERTURE_DEFS.collab_ask.proximity === 'adjacent'`));

// The relationship threshold, swept across the full range.
const sweep = api(`
  (() => {
    const gs = __house('p56-ask');
    const id = __residents(gs)[0];
    const npc = __makeCreator(gs, id);
    const out = [];
    for (let aff = -1; aff <= 1.0001; aff += 0.1) {
      npc.relPlayer = { affection: Math.round(aff * 100) / 100, tension: 0 };
      out.push([Math.round(aff * 100) / 100, OVERTURE_CANDIDACY.collab_ask(npc, id, gs, {})]);
    }
    return out;
  })()
`);
const firesAt = sweep.filter(([, ok]) => ok).map(([a]) => a);
const threshold = api('CONTENT_WORK_TUNING.collabAskAffection');
check(`the ask never fires below affection ${threshold} (fires at ${firesAt.length ? firesAt[0] : 'never'})`,
  firesAt.length > 0 && firesAt.every(a => a >= threshold - 1e-9),
  `fired at: ${firesAt.join(', ')}`);
check('it does fire at high affection (the beat is reachable)', firesAt.includes(1) || firesAt.length > 0);

check('tension cancels it however fond they are', api(`
  (() => {
    const gs = __house('p56-tension');
    const id = __residents(gs)[0];
    const npc = __makeCreator(gs, id);
    npc.relPlayer = { affection: 1, tension: CONTENT_WORK_TUNING.collabAskMaxTension + 0.1 };
    return OVERTURE_CANDIDACY.collab_ask(npc, id, gs, {}) === false;
  })()
`));
check('a non-creator never gets the ask, however close you are', api(`
  (() => {
    const gs = __house('p56-noncreator');
    const id = __residents(gs)[0];
    const npc = gs.npcs[id];
    delete npc.bible.occupation.contentWork;
    npc.relPlayer = { affection: 1, tension: 0 };
    return OVERTURE_CANDIDACY.collab_ask(npc, id, gs, {}) === false;
  })()
`));
check('desire and grievance CANNOT produce this ask (affection only)',
  api(`JSON.stringify(OVERTURE_DEFS.collab_ask.motives) === JSON.stringify(['affection'])`));

check('accepting books a commitment in the proposer own bedroom, not a common room', api(`
  (() => {
    const gs = __house('p56-terms');
    const id = __residents(gs)[0];
    const npc = __makeCreator(gs, id);
    const terms = proposeTerms(npc, OVERTURE_DEFS.collab_ask, gs);
    if (!terms) return false;
    return terms.roomId === npc.residency.room && terms.kind === 'content_collab' && terms.startAbs > 0;
  })()
`), 'the own_bedroom sentinel must resolve — a shoot in the living room is not the beat');

// ---------------------------------------------------------------- 7
console.log('\n7. Rarity (D17) — catching it has to read as luck');

const rarity = api(`
  (() => {
    // A household of maximally-disinhibited creators with a working pool:
    // the most favourable conditions the game can produce. If it is still
    // rare HERE, it is rare everywhere.
    let sessions = 0, poolSessions = 0, npcDays = 0;
    for (let s = 0; s < 4; s++) {
      let gs = __house('p56-rare-' + s);
      const ids = __residents(gs);
      for (const id of ids) __maxDeviant(__makeCreator(gs, id));
      const DAYS = 28;
      for (let t = 0; t < DAYS * 48; t++) {
        const rb = resolveBatch(gs, 1);
        gs = rb.state;
        for (const e of rb.events) {
          if (e.type === 'content_session') sessions++;
          if (e.type === 'content_pool_session') poolSessions++;
        }
      }
      npcDays += ids.length * DAYS;
    }
    return { sessions, poolSessions, npcDays };
  })()
`);
const perNpcWeekPool = rarity.poolSessions / (rarity.npcDays / 7 || 1);
const perNpcWeekWork = rarity.sessions / (rarity.npcDays / 7 || 1);
console.log(`        ${rarity.npcDays} npc-days: ${rarity.sessions} sessions, ${rarity.poolSessions} pool sessions`);
console.log(`        per npc-week: ${perNpcWeekWork.toFixed(2)} sessions, ${perNpcWeekPool.toFixed(3)} pool sessions`);

check('an ordinary content session is a regular part of the job (it happens)',
  rarity.sessions > 0, 'if zero, the drive never wins its own work block');
check(`the pool session is RARE — ${perNpcWeekPool.toFixed(3)}/npc-week, target well under 1`,
  perNpcWeekPool < 0.75,
  'if this climbs, cooldownMinutes and weight on content_pool_session are the dials');
check('the pool session is reachable at all under ideal conditions',
  rarity.poolSessions > 0,
  'zero here means a gate is unsatisfiable, not that it is rare');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
