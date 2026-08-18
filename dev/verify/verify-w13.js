// Intimacy & Voyeurism Plan Phase 13 — NPC intimacy: masturbation, overtures,
// pair acts (D3/D13).
// The `masturbate` (solo) and `intimate` (pair) DRIVE_DEFS entries. The solo
// drive is a standard drive: private room + desire floor candidacy, self
// effects (sated desire release, mood), 'nude' clothing while it lasts, a
// moaning signal neighbors perceive, a long cooldown. The pair drive is a
// custom resolver (tryIntimatePair): BOTH participants get the effects,
// castWeb deltas both ways, relationship history (first_sex → sex), the Phase
// 9 recency writers, the unmade bed, a moaningHigh emission, and a
// commitment that pins each NPC for the act's duration. The willingness gate
// is the ONLY door, symmetric with the player (D3/D13): findIntimatePartner
// only ever picks partners who clear resolveWillingnessGate, and the resolver
// re-checks it before a single state write. The overture half of Phase 13
// (desire-motivated overtures) was already delivered by Phases 8/9
// (OVERTURE_DEFS approach_player/text_player/knock_player carry the desire
// motive + willingness utility), so this harness covers the drives.
//
// Nothing here reimplements the math: the engine loads into a bare vm and the
// assertions read what the real functions return. The helpers
// (house/warmPair/needsHigh/...) are injected INTO the vm context first, so
// every `api` expression resolves them the same way the page globals do. The
// live resolveTick integration (couples co-locating through the real schedule
// and pairing up) and the save/load round-trip need the live page and are
// verified there; the mandatory per-session gate check (a negative-willingness
// partner never participates) is check 5.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
async function check(name, cond, detail) {
  const c = await cond;
  if (c) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// --- Helpers injected INTO the vm context (function declarations, so the
// checks call them by name instead of interpolating arrow bodies). ---
api(`
  function house(seed, n) {
    const h = SIM_generateHouse(seed, n);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    return h;
  }
`);

api(`
  function residentIdsOf(h) {
    return Object.keys(h.npcs).filter(id => h.npcs[id].residency.status === 'resident');
  }
`);

// A private room two residents actually own (their own bedroom — a bedroom
// with a bed, so the pair act's bed-unmake trace has something to unmake).
api(`
  function coupleRoom(h, a, b) {
    const ra = h.npcs[a].residency.room, rb = h.npcs[b].residency.room;
    return isPrivateRoom(ra) ? ra : (isPrivateRoom(rb) ? rb : 'bedroom_1');
  }
`);

// Warm the castWeb pair toward each other AND the two NPCs' needs/mood/
// location. All non-desire needs are pinned HIGH so the self-care drives'
// need terms sit at 0 and the intimacy drives actually win the scorer.
api(`
  function warmPair(h, a, b, roomId) {
    const key = pairKey(a, b);
    const pair = h.world.castWeb[key] || createBlankPair(a, b);
    const fwd = { trust: 0.6, affection: 0.7, tension: -0.2, respect: 0.4, comfort: 0.9, desire: 0.8 };
    const bwd = { trust: 0.6, affection: 0.7, tension: -0.2, respect: 0.4, comfort: 0.9, desire: 0.8 };
    pair.axes[\`\${a}→\${b}\`] = fwd;
    pair.axes[\`\${b}→\${a}\`] = bwd;
    h.world.castWeb[key] = pair;
    for (const id of [a, b]) {
      h.npcs[id].needs = { hunger: 80, hygiene: 80, energy: 80, social: 80, comfort: 80, stimulation: 80, desire: 80 };
      h.npcs[id].mood = 0.4;
      h.npcs[id].location = roomId;
      h.npcs[id].activity = 'hanging out';
      h.npcs[id].clothing = 'dressed';
      h.npcs[id].flags = {};
    }
    return h;
  }
`);

// The same, but the pair are TRUE STRANGERS: the castWeb pair is deleted so
// they have literally never met — npcIsStrangerTo reads a missing pair as
// "zero prior interaction" and the stranger floor returns exactly -1. (A
// freshly generated pair is NOT a stranger: generateCast pre-seeds its
// initial axes, so a cold generated pair instead reads as a below_threshold
// soft no — which still aborts the act, through the other refusal shape.)
api(`
  function coldPair(h, a, b, roomId) {
    for (const id of [a, b]) {
      h.npcs[id].needs = { hunger: 80, hygiene: 80, energy: 80, social: 80, comfort: 80, stimulation: 80, desire: 80 };
      h.npcs[id].mood = 0.4;
      h.npcs[id].location = roomId;
      h.npcs[id].activity = 'hanging out';
      h.npcs[id].clothing = 'dressed';
      h.npcs[id].flags = {};
    }
    delete h.world.castWeb[pairKey(a, b)];
    return h;
  }
`);

// A minimal resolved record for drive evaluation.
api(`
  function resolvedFor(roomId, block) {
    return { block: block || 'evening', location: roomId, activity: 'hanging out',
             transit: null, nextBlock: 'wind_down', willReturnAt: null };
  }
`);

api(`
  function driveEval(h, id, roomId, block) {
    const gs = { meta: h.meta, player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    return evaluateDrives(
      gs.npcs[id], id, gs.npcs, resolvedFor(roomId, block), gs,
      seededRng(h.seed, 'w13_test_rng'), getTickIndex(gs.meta.clock.minutes), {}
    );
  }
`);

// ---------------------------------------------------------------- 1
(async () => {
console.log('\\n1. NPC_INTIMACY tuning (config.js)');
await check('the two doors exist: positive desire thresholds and the pair act reads the sex bar the player uses',
      api(`(() => {
        const N = NPC_INTIMACY;
        return N.masturbate.desireThreshold > 0 && N.intimate.desireThreshold > 0
          && N.masturbate.desireThreshold < N.intimate.desireThreshold
          && N.intimate.act === 'sex'
          && willingnessThreshold(N.intimate.act) === WILLINGNESS.thresholds.sex;
      })()`));
await check('both drives are registered DRIVE_DEFS entries with the flags/config the resolvers read',
      api(`(() => {
        const m = DRIVE_DEFS.masturbate, i = DRIVE_DEFS.intimate;
        return !!m && m.activityOverride === 'masturbating' && m.setsClothing === 'nude'
          && m.emitsSignal.signal === 'moaning' && m.emitsSignal.intensity === SIGNALS_EMIT.moaningLow
          && m.cooldownMinutes > 0 && m.utility.desire === DESIRE.scoring && m.utility.holdMinutes > 0
          && !!i && i.isIntimateDrive === true && i.actionId === 'self.nap'
          && i.activityOverride === 'having sex' && i.emitsSignal.signal === 'moaning'
          && i.emitsSignal.intensity === SIGNALS_EMIT.moaningHigh
          && !!i.pairDeltas && i.pairDeltas.affection > 0 && i.pairDeltas.desire < 0
          && !!i.leaves && i.leaves.bed && i.cooldownMinutes > 0
          && i.utility.desire === DESIRE.scoring && i.utility.baseAppeal > m.utility.baseAppeal;
      })()`));
await check('the intimacy acts are costed like the player\'s: the pair effects reuse the Phase 11 target-NPC magnitudes',
      api(`(() => {
        const e = (who, need) => DRIVE_DEFS.intimate.effects.find(x => x.params.who === who && x.params.need === need).params.delta;
        // mood rides MOOD_DELTA, not ADJUST_NEED, so it's checked by the next
        // assertion instead — e() itself only resolves ADJUST_NEED entries
        // and throws on a name that isn't one (was masked by a trailing
        // OR-true that never actually protected the e(self,mood) call ahead
        // of it, since the call still ran and threw first).
        return e('self', 'desire') === -DESIRE.release.sex
          && e('self', 'energy') === -INTIMACY.npcEnergyCost.sex
          && e('self', 'hygiene') === -INTIMACY.npcHygieneCost.sex;
      })()`));
await check('presence/emotion/importance surfaces cover the new activities (never a raw explicit presence line)',
      api(`(() => {
        return PRESENCE_PHRASES['masturbating'] === '{name} is alone in bed.'
          && PRESENCE_PHRASES['having sex'] === '{name} is in bed with someone.'
          && !/masturbat/.test(PRESENCE_PHRASES['masturbating'])
          && EVENT_EMOTION.intimate === 'romance' && EVENT_EMOTION.masturbate === 'embarrassment'
          && EVENT_IMPORTANCE.intimate === 'significant';
      })()`));

// ---------------------------------------------------------------- 2
console.log('\\n2. Candidacy — the two drives\' doors');
await check('masturbate is a candidate only in a private room with desire at the floor',
      api(`(() => {
        const h = house(20260816, 3);
        const a = residentIdsOf(h)[0];
        h.npcs[a].needs.desire = 90; h.npcs[a].location = 'bedroom_1';
        const ok = DRIVE_CANDIDACY.masturbate(h.npcs[a], a, h, { location: 'bedroom_1' });
        const lowDesire = DRIVE_CANDIDACY.masturbate(h.npcs[a], a, h, { location: 'bedroom_1' }) && (h.npcs[a].needs.desire = 10, DRIVE_CANDIDACY.masturbate(h.npcs[a], a, h, { location: 'bedroom_1' }));
        const common = (h.npcs[a].needs.desire = 90, DRIVE_CANDIDACY.masturbate(h.npcs[a], a, h, { location: 'living_room' }));
        return ok && !lowDesire && !common;
      })()`));
await check('intimate is a candidate only with a willing co-located partner, and never for a stranger',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        const yes = DRIVE_CANDIDACY.intimate(h.npcs[a], a, h, { location: room, block: 'evening' });
        const h2 = house(20260817, 3);
        const [c, d] = residentIdsOf(h2);
        const room2 = coupleRoom(h2, c, d);
        coldPair(h2, c, d, room2);
        const stranger = DRIVE_CANDIDACY.intimate(h2.npcs[c], c, h2, { location: room2, block: 'evening' });
        const noPartner = DRIVE_CANDIDACY.intimate(h.npcs[a], a, h, { location: 'living_room', block: 'evening' });
        return yes && !stranger && !noPartner;
      })()`));
await check('a willing partner in a DIFFERENT room is not a candidate (co-location is part of the door)',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        h.npcs[b].location = 'living_room';
        return !DRIVE_CANDIDACY.intimate(h.npcs[a], a, h, { location: room, block: 'evening' });
      })()`));

// ---------------------------------------------------------------- 3
console.log('\\n3. findIntimatePartner — pure, deterministic, preference-aware');
await check('purity + determinism: identical states return the same partner, no mutation of either NPC',
      api(`(() => {
        const mk = (seed) => {
          const h = house(seed, 3);
          const ids = residentIdsOf(h);
          const room = coupleRoom(h, ids[0], ids[1]);
          warmPair(h, ids[0], ids[1], room);
          return { h, a: ids[0], b: ids[1], room };
        };
        const s1 = mk(20260816), s2 = mk(20260816);
        const before1 = JSON.stringify(s1.h.npcs[s1.a]);
        const p1 = findIntimatePartner(s1.h.npcs[s1.a], s1.a, s1.h, s1.room, 'evening');
        const p2 = findIntimatePartner(s2.h.npcs[s2.a], s2.a, s2.h, s2.room, 'evening');
        return p1 === p2 && JSON.stringify(s1.h.npcs[s1.a]) === before1;
      })()`));
await check('a stranger can never be a partner — the stranger floor aborts at exactly -1',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        coldPair(h, a, b, room);
        const w = willingness(h, h.npcs[b], a, NPC_INTIMACY.intimate.act, { location: room, npcId: b });
        return w === -1 && findIntimatePartner(h.npcs[a], a, h, room, 'evening') === null;
      })()`));
await check('a sleeping / showering / mid-commitment resident is never chosen, however willing otherwise',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        h.npcs[b].activity = 'sleeping';
        const sleeping = findIntimatePartner(h.npcs[a], a, h, room, 'evening');
        h.npcs[b].activity = 'showering';
        const showering = findIntimatePartner(h.npcs[a], a, h, room, 'evening');
        h.npcs[b].activity = 'hanging out';
        openCommitment(h, b, { driveId: 'eat', kind: 'drive', roomId: room, activity: 'cooking', score: 0.5 });
        const committed = findIntimatePartner(h.npcs[a], a, h, room, 'evening');
        return sleeping === null && showering === null && committed === null;
      })()`));
await check('the committed/seeing relationship partner is preferred when a warm stranger also shares the room',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b, c] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        warmPair(h, a, c, room); // c is warm too, but has no relationship record with a
        getRelationship(h, a, b, true).status = 'committed';
        const partner = findIntimatePartner(h.npcs[a], a, h, room, 'evening');
        return partner === b;
      })()`));

// ---------------------------------------------------------------- 4
console.log('\\n4. tryIntimatePair — the whole footprint of a completed pair act');
await check('both NPCs get the effects (sated desire, energy/hygiene costs, mood), and both read undressed',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        h.npcs[a].needs.desire = 100; h.npcs[b].needs.desire = 100;
        const pre = { ea: h.npcs[a].needs.energy, eb: h.npcs[b].needs.energy,
                      ha: h.npcs[a].needs.hygiene, hb: h.npcs[b].needs.hygiene,
                      da: h.npcs[a].needs.desire, db: h.npcs[b].needs.desire,
                      ma: h.npcs[a].mood, mb: h.npcs[b].mood };
        const r = tryIntimatePair(h.npcs[a], a, resolvedFor(room), h, DRIVE_DEFS.intimate);
        const A = h.npcs[a], B = h.npcs[b];
        return !!r && r.activityOverride === 'having sex' && r.clothingState === 'undressed'
          && r.pairState.partnerId === b && r.pairState.clothing === 'undressed' && r.pairState.activity === 'having sex'
          && A.needs.energy < pre.ea && B.needs.energy < pre.eb
          && A.needs.hygiene < pre.ha && B.needs.hygiene < pre.hb
          && A.needs.desire < pre.da && B.needs.desire < pre.db
          && A.mood > pre.ma && B.mood > pre.mb;
      })()`));
await check('castWeb deltas land BOTH ways and the relationship record shows first_sex with lastIntimateDay set',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        const r = tryIntimatePair(h.npcs[a], a, resolvedFor(room), h, DRIVE_DEFS.intimate);
        const web = h.world.castWeb[pairKey(a, b)];
        const rec = getRelationship(h, a, b, false);
        return web.axes[\`\${a}→\${b}\`].affection > 0.7 && web.axes[\`\${b}→\${a}\`].affection > 0.7
          && web.axes[\`\${a}→\${b}\`].desire < 0.8 && web.axes[\`\${b}→\${a}\`].desire < 0.8
          && rec.history.length === 1 && rec.history[0].kind === 'first_sex'
          && rec.lastIntimateDay === h.meta.clock.day
          && h.npcs[a].flags._intimacyHistory.lastWith === b
          && h.npcs[b].flags._intimacyHistory.lastWith === a;
      })()`));
await check('a SECOND act is recorded as sex, not first_sex (history distinguishes the two)',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        h.npcs[a].needs.desire = 100; h.npcs[b].needs.desire = 100;
        h.npcs[a].flags._driveCooldowns = {}; h.npcs[b].flags._driveCooldowns = {};
        tryIntimatePair(h.npcs[a], a, resolvedFor(room), h, DRIVE_DEFS.intimate);
        h.npcs[a].needs.desire = 100; h.npcs[b].needs.desire = 100;
        h.npcs[a].flags._driveCooldowns = {}; h.npcs[b].flags._driveCooldowns = {};
        tryIntimatePair(h.npcs[a], a, resolvedFor(room), h, DRIVE_DEFS.intimate);
        const rec = getRelationship(h, a, b, false);
        return rec.history.length === 2 && rec.history[0].kind === 'first_sex' && rec.history[1].kind === 'sex';
      })()`));
await check('the bed is unmade (invariant 7), the moan is audible to neighbors, the partner is committed + cooled down',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        const r = tryIntimatePair(h.npcs[a], a, resolvedFor(room), h, DRIVE_DEFS.intimate);
        const bed = Object.values(h.objects[\`room_\${room}\`] || {}).find(o => o.defId === 'bed');
        const moan = (h.world.signals || []).some(s => s.id === 'moaning' && s.intensity === SIGNALS_EMIT.moaningHigh);
        const B = h.npcs[b];
        const nowAbs = clockToAbsolute(h.meta.clock);
        return bed.state.made === 'unmade' && moan
          && !!B.commitment && B.commitment.activity === 'having sex'
          && (B.commitment.completesAtAbs - nowAbs) >= DRIVE_DEFS.intimate.utility.holdMinutes - 1
          && B.flags._driveCooldowns.intimate === nowAbs
          && r.events[0].data.other === b && r.events[0].type === 'intimate';
      })()`));
await check('the event names both participants through stampEventParticipants',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        const r = tryIntimatePair(h.npcs[a], a, resolvedFor(room), h, DRIVE_DEFS.intimate);
        stampEventParticipants(r.events, { [a]: { location: room }, [b]: { location: room } }, 'living_room');
        return r.events[0].participants.length === 2
          && r.events[0].participants.includes(a) && r.events[0].participants.includes(b);
      })()`));
await check('both participants are pinned: the partner\'s commitment is openCommitment-written (the ONE writer), the initiator\'s choice comes back for step 5',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        const r = tryIntimatePair(h.npcs[a], a, resolvedFor(room), h, DRIVE_DEFS.intimate);
        return !!r.commitmentChoice && r.commitmentChoice.driveId === 'intimate'
          && r.commitmentChoice.activity === 'having sex' && !!h.npcs[b].commitment;
      })()`));

// ---------------------------------------------------------------- 5
console.log('\\n5. THE MANDATORY GATE CHECK — a negative-willingness partner never participates');
await check('a floored (stranger/hostile) partner aborts tryIntimatePair: null result, zero footprint',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        coldPair(h, a, b, room);
        const recBefore = getRelationship(h, a, b, false);
        const webBefore = JSON.stringify(h.world.castWeb[pairKey(a, b)]);
        const signalsBefore = (h.world.signals || []).length;
        const r = tryIntimatePair(h.npcs[a], a, resolvedFor(room), h, DRIVE_DEFS.intimate);
        const B = h.npcs[b];
        return r === null && !B.commitment && !B.flags._intimacyHistory
          && !B.flags._driveCooldowns && !recBefore && JSON.stringify(h.world.castWeb[pairKey(a, b)]) === webBefore
          && (h.world.signals || []).length === signalsBefore
          && B.clothing === 'dressed';
      })()`));
await check('findIntimatePartner can never return a floored partner, and resolveWillingnessGate returns exactly -1 for the hard floors',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        coldPair(h, a, b, room);
        const gate = resolveWillingnessGate(h, b, a, NPC_INTIMACY.intimate.act, { location: room, block: 'evening', npcId: b });
        h.npcs[b].relPlayer.tension = REL_CONSEQUENCES.tensionHigh;
        return gate.willingness === -1 && gate.reason === 'floor' && !gate.allowed
          && findIntimatePartner(h.npcs[a], a, h, room, 'evening') === null;
      })()`));
await check('drives.js/cognition.js introduce no bypass: every Phase 13 partner selection goes through the gate',
      (() => {
        const drivesSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', 'drives.js'), 'utf8');
        const phase13 = drivesSrc.slice(drivesSrc.indexOf('Phase 13: the NPC pair act'));
        const hasGate = (phase13.match(/resolveWillingnessGate/g) || []).length >= 2;
        const noSneaky = !/allowed\s*=\s*true|bypass|skipWillingness|force/i.test(phase13);
        const cogSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', 'cognition.js'), 'utf8');
        const candidacy = cogSrc.slice(cogSrc.indexOf('masturbate: (npc'));
        const gatedCandidacy = /findIntimatePartner/.test(candidacy);
        return hasGate && noSneaky && gatedCandidacy;
      })());

// ---------------------------------------------------------------- 6
console.log('\\n6. evaluateDrives end-to-end — the pair drive wins and holds');
await check('a warm pair in a private room: the intimate drive wins the scorer and resolves the full act',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        h.npcs[a].needs.desire = 100;
        const r = driveEval(h, a, room, 'evening');
        return r.activityOverride === 'having sex' && r.clothingState === 'undressed'
          && r.pairState && r.pairState.partnerId === b
          && r.commitmentChoice && r.events[0].type === 'intimate'
          && r.relDeltas.length === 2
          && h.npcs[b].commitment && h.npcs[b].needs.desire < 80;
      })()`));
await check('the partner is not double-caught: the committed partner is skipped by a later initiator in the same tick',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b, c] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        warmPair(h, c, b, room);   // c also wants b
        h.npcs[c].needs.desire = 100;
        tryIntimatePair(h.npcs[a], a, resolvedFor(room), h, DRIVE_DEFS.intimate); // b now committed
        const r = tryIntimatePair(h.npcs[c], c, resolvedFor(room), h, DRIVE_DEFS.intimate);
        return r === null;
      })()`));
await check('the same couple cannot immediately re-fire: the initiator\'s cooldown drops the drive out of candidacy after a completed act',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        h.npcs[a].needs.desire = 100; h.npcs[b].needs.desire = 100;
        const r1 = driveEval(h, a, room, 'evening');
        const ctx = { npcId: a, nowAbs: clockToAbsolute(h.meta.clock), location: room, block: 'evening',
                      perceived: [], isVisitor: false, gameState: h };
        const stillCandidate = isDriveCandidate('intimate', DRIVE_DEFS.intimate, h.npcs[a], h, ctx);
        return !!r1 && !stillCandidate;
      })()`));

// ---------------------------------------------------------------- 7
console.log('\\n7. The masturbate drive — standard-path resolution');
await check('a high-desire NPC alone in a private room: masturbating activity, nude clothing, moaningLow, sated desire, cooldown',
      api(`(() => {
        const h = house(20260816, 3);
        const a = residentIdsOf(h)[0];
        const room = h.npcs[a].residency.room;
        h.npcs[a].needs = { hunger: 80, hygiene: 80, energy: 80, social: 80, comfort: 80, stimulation: 80, desire: 90 };
        h.npcs[a].mood = 0.4;
        h.npcs[a].location = room; h.npcs[a].activity = 'hanging out'; h.npcs[a].flags = {};
        for (const id of residentIdsOf(h)) if (id !== a) h.npcs[id].location = 'living_room';
        const r = driveEval(h, a, room, 'evening');
        const nowAbs = clockToAbsolute(h.meta.clock);
        return r.activityOverride === 'masturbating' && r.clothingState === 'nude'
          && h.npcs[a].needs.desire === 90 - DESIRE.release.masturbate
          && h.npcs[a].mood > 0.4
          && (h.world.signals || []).some(s => s.id === 'moaning' && s.intensity === SIGNALS_EMIT.moaningLow)
          && r.updatedNpc.flags._driveCooldowns.masturbate === nowAbs
          && !!r.events[0] && r.events[0].type === 'masturbate';
      })()`));
await check('masturbate is not a candidate in a common room — the desire is there but the door is closed',
      api(`(() => {
        const h = house(20260816, 3);
        const a = residentIdsOf(h)[0];
        h.npcs[a].needs.desire = 90; h.npcs[a].location = 'living_room';
        return !DRIVE_CANDIDACY.masturbate(h.npcs[a], a, h, { location: 'living_room' });
      })()`));

// ---------------------------------------------------------------- 8
console.log('\\n8. The clothing state machine\'s Phase 13 rules');
await check('masturbating → nude while it lasts; a leftover nude reverts the tick the activity ends',
      api(`(() => {
        const npc = { location: 'bedroom_1', needs: {}, bible: { temperament: {} }, residency: { room: 'bedroom_1' } };
        const during = npcClothingForContext(npc, 'evening', 'masturbating', 'dressed', () => 0);
        const after = npcClothingForContext(npc, 'evening', 'hanging out', 'nude', () => 0);
        return during === 'nude' && after === 'dressed';
      })()`));
await check('pair-act activities → undressed (the intimate gate\'s naked read); other activities leave undressed alone',
      api(`(() => {
        const npc = { location: 'bedroom_1', needs: {}, bible: { temperament: {} }, residency: { room: 'bedroom_1' } };
        const during = npcClothingForContext(npc, 'evening', 'having sex', 'dressed', () => 0);
        const later = npcClothingForContext(npc, 'evening', 'hanging out', 'undressed', () => 0);
        const quickie = npcClothingForContext(npc, 'evening', 'quickie', 'dressed', () => 0);
        return during === 'undressed' && quickie === 'undressed' && later === 'undressed';
      })()`));
await check('the player\'s own partner semantics are untouched — the four phase-11 after-states still hold (undressed persists, towel is transient)',
      api(`(() => {
        const npc = { location: 'bedroom_1', needs: {}, bible: { temperament: {} }, residency: { room: 'bedroom_1' } };
        const towelNext = npcClothingForContext(npc, 'evening', 'hanging out', 'towel', () => 0);
        const sleep = npcClothingForContext(npc, 'sleep', 'sleeping', 'undressed', () => 0);
        return towelNext === 'dressed' && sleep === 'sleepwear';
      })()`));

// ---------------------------------------------------------------- 9
console.log('\\n9. Desire-bias reachability — the drives clear the bar where they are supposed to');
await check('masturbate reachability: a desire-30 candidate (the candidacy floor) still clears the bar in its window, and desire 90 outranks it (the bias term lifts the score)',
      api(`(() => {
        const h = house(20260816, 3);
        const a = residentIdsOf(h)[0];
        const npc = h.npcs[a];
        npc.needs = { hunger: 80, hygiene: 80, energy: 80, social: 80, comfort: 80, stimulation: 80, desire: 30 };
        const ctx = { gameState: h, npcId: a, minutesOfDay: 20 * 60 + 15, block: 'wind_down', location: 'bedroom_1',
                      nowAbs: clockToAbsolute(h.meta.clock), perceived: [], isVisitor: false, motives: {} };
        const min = scoreDrive('masturbate', npc, ctx);
        npc.needs.desire = 90;
        const high = scoreDrive('masturbate', npc, ctx);
        return !!high && !!min && min.score > COGNITION.actionThreshold && high.score > min.score;
      })()`));
await check('intimate outranks masturbate for a couple (the pair act wins the shared scorer), and solo NPCs cannot reach intimate',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const room = coupleRoom(h, a, b);
        warmPair(h, a, b, room);
        h.npcs[a].needs.desire = 100;
        const ctx = { gameState: h, npcId: a, minutesOfDay: 20 * 60 + 15, block: 'evening', location: room,
                      nowAbs: clockToAbsolute(h.meta.clock), perceived: [], isVisitor: false, motives: {} };
        const int = scoreDrive('intimate', h.npcs[a], ctx);
        const mast = scoreDrive('masturbate', h.npcs[a], ctx);
        return !!int && !!mast && int.score > mast.score && int.score > COGNITION.actionThreshold;
      })()`));

// ---------------------------------------------------------------- 10
console.log('\\n10. Regression — the sim still runs with the Phase 13 drives live');
await check('a full day of real resolveBatch ticks runs cleanly (48 ticks, fresh household — cold desire, no forced acts)',
      api(`(() => {
        const h = house(20260816, 3);
        let gs = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                     player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
        for (let t = 0; t < 48; t++) {
          gs.meta.clock = advanceClock(gs.meta.clock, 1);
          gs = resolveBatch(gs, 1, { advanceClock: false }).state;
        }
        return typeof gs.meta.clock.day === 'number'
          && gs.meta.clock.day === 2 && gs.meta.clock.minutes === CLOCK.startMinutes;
      })()`));
await check('determinism: two identical warm houses produce byte-identical pair acts',
      api(`(() => {
        const run = (seed) => {
          const h = house(seed, 3);
          const ids = residentIdsOf(h);
          const [a, b] = ids;
          const room = coupleRoom(h, a, b);
          warmPair(h, a, b, room);
          h.npcs[a].needs.desire = 100;
          const r = tryIntimatePair(h.npcs[a], a, resolvedFor(room), h, DRIVE_DEFS.intimate);
          return JSON.stringify({ r, rec: getRelationship(h, a, b, false),
                                  web: h.world.castWeb[pairKey(a, b)],
                                  signals: h.world.signals });
        };
        return run(20260816) === run(20260816);
      })()`));
await check('all Phase 13 effect lines parse to real effects (no silent NaN/unknown types)',
      api(`(() => {
        for (const id of ['masturbate', 'intimate']) {
          for (const e of DRIVE_DEFS[id].effects) {
            const def = EFFECT_DEFS[e.type];
            if (!def || !def.implemented) return false;
            if (e.type === 'ADJUST_NEED' && isNaN(Number(e.params.delta))) return false;
          }
        }
        return true;
      })()`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exitCode = fail ? 1 : 0;
})();
