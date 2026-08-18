// Intimacy & Voyeurism Plan Phase 12 — Relationship records & couple
// formation (D12/D14).
// `world.relationships[pairKey]` (the plan's data-model shape) + the
// formation machinery: the resolveTick proximity accumulator feeds each
// pair's co-located ticks into `progress` through the pure
// `pairCompatibility` temperature, and the slow-cadence daily pass
// (updateRelationshipsForDay) drifts statuses single → seeing → committed
// with cooldowns, then consolidates committed couples onto ONE upgraded
// bedroom (residentCapacity 2 — the seam renovation-occupancy reserved).
//
// Nothing here reimplements the math: the engine loads into a bare vm and
// the assertions read what the real functions return. The helpers
// (house/topCompatPair/runDays/...) are injected INTO the vm context first,
// so every `api` expression resolves them the same way the page globals do.
// The resolveTick hook itself (co-location while the schedule actually runs)
// and the save/load round-trip need the live page and are verified there;
// the mandatory per-session gate check (a committed relationship record can
// NEVER bypass the willingness floor) is check 13.
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

// The resident pair with the highest pairCompatibility on this house.
api(`
  function topCompatPair(h) {
    const ids = residentIdsOf(h);
    let best = null, bestKey = null, bestC = -1;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const c = pairCompatibility(h, ids[i], ids[j]);
        if (c > bestC) { bestC = c; bestKey = [ids[i], ids[j]]; }
      }
    }
    return { a: bestKey[0], b: bestKey[1], compat: bestC };
  }
`);

// Simulate `days` of daily life for ONE pair: co-locate them for
// ticksPerDay weighted ticks, then run the daily formation pass. Returns
// the day each transition happened (0 = never).
api(`
  function runDays(h, a, b, ticksPerDay, days) {
    const out = { seeingDay: 0, committedDay: 0, movedInDay: 0, committedEvents: 0, movedInEvents: 0 };
    for (let d = 1; d <= days; d++) {
      for (let t = 0; t < ticksPerDay; t++) notePairCoLocation(h, a, b, { weight: 1 });
      const evs = updateRelationshipsForDay(h, d);
      for (const e of evs) {
        if (e.kind === 'seeing' && !out.seeingDay) out.seeingDay = d;
        if (e.kind === 'committed') {
          out.committedEvents++;
          if (!out.committedDay) out.committedDay = d;
          if (e.moved && !out.movedInDay) out.movedInDay = d;
        }
        if (e.kind === 'moved_in') { out.movedInEvents++; if (!out.movedInDay) out.movedInDay = d; }
      }
    }
    return out;
  }
`);

// Force a pair to committed by co-locating them heavily. Returns the
// commitment day (0 = never, which itself fails the callers).
api(`
  function forceCommitment(h, a, b, maxDays) {
    return runDays(h, a, b, 12, maxDays).committedDay;
  }
`);

// Upgrade one bedroom facility to 'upgraded' (residentCapacity 2).
api(`
  function upgradeRoom(h, roomId) {
    const facilityIds = ROOM_FACILITIES[roomId] || [];
    if (facilityIds.length === 0) return false;
    h.world.upgrades[facilityIds[0]] = { tier: 'upgraded', condition: 100 };
    return true;
  }
`);

// ---------------------------------------------------------------- 1
(async () => {
console.log('\n1. RELATIONSHIP tuning (config.js)');
await check('thresholds are ordered (committed > seeing), cooldown positive, formation rates positive, bonuses sane',
      api(`(() => {
        const R = RELATIONSHIP;
        return R.committedThreshold > R.seeingThreshold
          && R.seeingThreshold > 0 && R.committedThreshold > 0
          && R.progressionCooldownDays >= 1
          && R.minCompatibilityForStart > 0 && R.minCompatibilityForStart < R.seeingThreshold + 0.2
          && R.basePerDay > 0 && R.decayPerDay >= 0
          && R.proximityPerTick > 0 && R.bedroomProximityBonus >= 1;
      })()`));
await check('pairCompatibility weights are all positive and sum to a sane total',
      api(`(() => {
        const w = RELATIONSHIP.pairCompatibility;
        const named = ['sharedInterests', 'valuesAligned', 'personality', 'dynamic'];
        return w.base > 0 && named.every(k => w[k] > 0) && w.sharedInterestPerTag > 0 && w.dynamicTension > 0
          && w.base + w.sharedInterests + w.valuesAligned + w.personality + w.dynamic <= 1.05;
      })()`));

// ---------------------------------------------------------------- 2
console.log('\n2. The store shape (the plan\'s data model)');
await check('a blank record is exactly the plan\'s shape — status/public/history/lastIntimateDay/trying plus the formation fields',
      api(`(() => {
        const r = blankRelationshipRecord();
        return r.status === 'single' && r.public === false
          && Array.isArray(r.history) && r.history.length === 0
          && r.lastIntimateDay === null && r.trying === false
          && r.progress === 0 && r.coLocTicks === 0 && r.lastTransitionDay === null;
      })()`));
await check('world.relationships exists on a fresh game state and is empty (nothing scripted at day one — D12)',
      api(`(() => {
        const h = house(20260816, 3);
        return h.world.relationships && Object.keys(h.world.relationships).length === 0;
      })()`));
await check('the store is wired into SAVE_KEYS and WORLD_KEY_FALLBACKS (state.js) so it survives save/load',
      (() => {
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', 'state.js'), 'utf8');
        const saveKeys = src.slice(src.indexOf('const SAVE_KEYS'), src.indexOf('// The in-memory source map'));
        const fallbacks = src.slice(src.indexOf('const WORLD_KEY_FALLBACKS'), src.indexOf('// --- Migration functions'));
        return /['\"]relationships['\"]/.test(saveKeys) && /relationships: \\(\\) => \\(\\{\\}\\)/.test(fallbacks);
      })());

// ---------------------------------------------------------------- 3
console.log('\n3. pairCompatibility — pure, deterministic, discriminating');
await check('always in [0,1] and byte-identical on identical inputs (pure — no rng, no mutation)',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        for (const a of ids) for (const b of ids) {
          if (a === b) continue;
          const c1 = pairCompatibility(h, a, b);
          const c2 = pairCompatibility(h, a, b);
          if (!(c1 >= 0 && c1 <= 1) || c1 !== c2) return false;
        }
        return true;
      })()`));
await check('it reads the castWeb dynamic — raising mutual affection/comfort and cutting tension raises the temperature',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        const key = pairKey(a, b);
        const pair = h.world.castWeb[key];
        pair.axes[\`\${a}→\${b}\`] = { trust: 0, affection: -0.9, tension: 0.9, respect: 0, comfort: 0, desire: -0.9 };
        pair.axes[\`\${b}→\${a}\`] = { trust: 0, affection: -0.9, tension: 0.9, respect: 0, comfort: 0, desire: -0.9 };
        const before = pairCompatibility(h, a, b);
        pair.axes[\`\${a}→\${b}\`] = { trust: 0, affection: 0.9, tension: -0.9, respect: 0, comfort: 1, desire: 0.9 };
        pair.axes[\`\${b}→\${a}\`] = { trust: 0, affection: 0.9, tension: -0.9, respect: 0, comfort: 1, desire: 0.9 };
        const after = pairCompatibility(h, a, b);
        return after > before + 0.3;
      })()`));
await check('a constructed incompatible pair scores below minCompatibilityForStart (opposed values + hostile axes + far temperaments)',
      api(`(() => {
        const h = house(20260816, 3);
        const [a, b] = residentIdsOf(h);
        const key = pairKey(a, b);
        const pair = h.world.castWeb[key];
        pair.axes[\`\${a}→\${b}\`] = { trust: -0.5, affection: -0.9, tension: 0.9, respect: -0.5, comfort: 0, desire: -0.9 };
        pair.axes[\`\${b}→\${a}\`] = { trust: -0.5, affection: -0.9, tension: 0.9, respect: -0.5, comfort: 0, desire: -0.9 };
        h.npcs[a].bible.interests = [];
        h.npcs[b].bible.interests = [];
        h.npcs[a].bible.values = [{ name: 'va', opposition: 'vb' }];
        h.npcs[b].bible.values = [{ name: 'vb', opposition: 'va' }];
        h.npcs[a].bible.temperament = { warmth: 1, volatility: 1, openness: 1 };
        h.npcs[b].bible.temperament = { warmth: -1, volatility: -1, openness: -1 };
        return pairCompatibility(h, a, b) < RELATIONSHIP.minCompatibilityForStart;
      })()`));

// ---------------------------------------------------------------- 4
console.log('\n4. The proximity accumulator (the resolveTick hook)');
await check('reading never mints a record; co-location does (lazy store — D12 no scripted couples)',
      api(`(() => {
        const h = house(20260816, 3);
        const [a, b] = residentIdsOf(h);
        if (getRelationship(h, a, b, false) !== null) return false;
        notePairCoLocation(h, a, b, { weight: 1 });
        const rec = getRelationship(h, a, b, false);
        return !!rec && rec.coLocTicks === 1;
      })()`));
await check('bedroom co-location carries the bedroomProximityBonus weight; common rooms count 1',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const [a, b] = ids;
        notePairCoLocation(h, a, b, { weight: 1 });
        notePairCoLocation(h, a, b, { weight: RELATIONSHIP.bedroomProximityBonus });
        const rec = getRelationship(h, a, b, false);
        return rec.coLocTicks === 1 + RELATIONSHIP.bedroomProximityBonus;
      })()`));

// ---------------------------------------------------------------- 5
console.log('\n5. The daily formation pass — drift single → seeing → committed');
await check('a compatible, co-located pair drifts to seeing within ~2 weeks and committed within ~3 (bounded, cooldown-respecting)',
      api(`(() => {
        const h = house(20260816, 3);
        const { a, b, compat } = topCompatPair(h);
        if (compat < RELATIONSHIP.minCompatibilityForStart) return false;
        const out = runDays(h, a, b, 5, 30);
        const rec = getRelationship(h, a, b, false);
        return out.seeingDay > 0 && out.seeingDay <= 14
          && out.committedDay > 0 && out.committedDay <= 21
          && rec.status === 'committed'
          && rec.history.some(x => x.kind === 'became_seeing')
          && rec.history.some(x => x.kind === 'became_committed')
          && rec.history.every(x => typeof x.day === 'number')
          && rec.public === true
          && rec.progress === 1;
      })()`));
await check('cooldown: statuses advance exactly once each — never two transitions in one day, never within progressionCooldownDays',
      api(`(() => {
        const h = house(20260816, 3);
        const { a, b } = topCompatPair(h);
        const out = runDays(h, a, b, 5, 30);
        return out.committedDay - out.seeingDay >= RELATIONSHIP.progressionCooldownDays
          && out.committedEvents === 1;
      })()`));
await check('an incompatible pair stays single even with the same co-location (minCompatibilityForStart is a real floor)',
      api(`(() => {
        const h = house(20260816, 3);
        const [a, b] = residentIdsOf(h);
        const key = pairKey(a, b);
        const pair = h.world.castWeb[key];
        pair.axes[\`\${a}→\${b}\`] = { trust: -0.5, affection: -0.9, tension: 0.9, respect: -0.5, comfort: 0, desire: -0.9 };
        pair.axes[\`\${b}→\${a}\`] = { trust: -0.5, affection: -0.9, tension: 0.9, respect: -0.5, comfort: 0, desire: -0.9 };
        h.npcs[a].bible.interests = [];
        h.npcs[b].bible.interests = [];
        h.npcs[a].bible.values = [{ name: 'va', opposition: 'vb' }];
        h.npcs[b].bible.values = [{ name: 'vb', opposition: 'va' }];
        h.npcs[a].bible.temperament = { warmth: 1, volatility: 1, openness: 1 };
        h.npcs[b].bible.temperament = { warmth: -1, volatility: -1, openness: -1 };
        const out = runDays(h, a, b, 12, 30);
        return out.seeingDay === 0 && out.committedDay === 0
          && getRelationship(h, a, b, false).status === 'single';
      })()`));
await check('a pair that never co-locates decays, not drifts: zero co-location across two weeks never reaches seeing',
      api(`(() => {
        const h = house(20260816, 3);
        const { a, b } = topCompatPair(h);
        for (let d = 1; d <= 14; d++) updateRelationshipsForDay(h, d);
        return getRelationship(h, a, b, false).status === 'single';
      })()`));
await check('the pass is deterministic: identical houses + identical days produce byte-identical stores',
      api(`(() => {
        const build = (seed) => {
          const h = house(seed, 3);
          const ids = residentIdsOf(h);
          for (let d = 1; d <= 12; d++) {
            for (let t = 0; t < 5; t++) notePairCoLocation(h, ids[0], ids[1], { weight: 1 });
            updateRelationshipsForDay(h, d);
          }
          return h.world.relationships;
        };
        return JSON.stringify(build(20260816)) === JSON.stringify(build(20260816));
      })()`));

// ---------------------------------------------------------------- 6
console.log('\n6. Couple residency — committed couples consolidate on an UPGRADED bedroom (residentCapacity 2)');
await check('commitment sets residency.partnerOf on BOTH partners even when no upgraded room exists',
      api(`(() => {
        const h = house(20260816, 3);
        const { a, b } = topCompatPair(h);
        const day = forceCommitment(h, a, b, 30);
        if (!day) return false;
        return h.npcs[a].residency.partnerOf === b && h.npcs[b].residency.partnerOf === a;
      })()`));
await check('with no upgraded bedroom the committed pair stays in separate rooms (no housing-system gymnastics)',
      api(`(() => {
        const h = house(20260816, 3);
        const { a, b } = topCompatPair(h);
        const ra = h.npcs[a].residency.room, rb = h.npcs[b].residency.room;
        const day = forceCommitment(h, a, b, 30);
        return !!day && h.npcs[a].residency.room === ra && h.npcs[b].residency.room === rb;
      })()`));
await check('upgrading a bedroom makes the couple move in together next rollover: both share the upgraded room, beds A+B, the other room vacated',
      api(`(() => {
        const h = house(20260816, 3);
        const { a, b } = topCompatPair(h);
        const ra = h.npcs[a].residency.room, rb = h.npcs[b].residency.room;
        const upgraded = bedroomResidentCapacity(h, ra) >= 2 ? ra : rb; // both broken at commit → rb
        const otherRoom = upgraded === rb ? ra : rb;
        const day = forceCommitment(h, a, b, 30);
        if (!day) return false;
        upgradeRoom(h, upgraded);
        const evs = updateRelationshipsForDay(h, day + 1);
        const moved = evs.some(e => e.kind === 'moved_in' || (e.kind === 'committed' && e.moved));
        const shared = h.npcs[a].residency.room === h.npcs[b].residency.room;
        if (!moved || !shared || h.npcs[a].residency.room !== upgraded) return false;
        const beds = [h.npcs[a].residency.bed, h.npcs[b].residency.bed].sort().join('');
        const roomOccupants = Object.keys(h.npcs).filter(id => h.npcs[id].residency.room === upgraded && h.npcs[id].residency.status === 'resident');
        const otherEmpty = Object.keys(h.npcs).filter(id => h.npcs[id].residency.room === otherRoom && h.npcs[id].residency.status === 'resident').length === 0;
        return beds === 'AB' && roomOccupants.length === 2 && otherEmpty && bedroomResidentCapacity(h, upgraded) === 2;
      })()`));
await check('the move-in re-derives rent (sharedRoomShareMultiplier occupancy) and never touches the player\'s room',
      api(`(() => {
        const h = house(20260816, 3);
        const { a, b } = topCompatPair(h);
        const ra = h.npcs[a].residency.room, rb = h.npcs[b].residency.room;
        const upgraded = bedroomResidentCapacity(h, ra) >= 2 ? ra : rb;
        const pre = h.world.rent;
        forceCommitment(h, a, b, 30);
        upgradeRoom(h, upgraded);
        updateRelationshipsForDay(h, 31);
        const post = h.world.rent;
        return post !== pre
          && !Object.values(h.npcs).some(n => n.residency.room === 'bedroom_player' && n.residency.status === 'resident')
          && typeof post.playerShare === 'number';
      })()`));

// ---------------------------------------------------------------- 7
console.log('\n7. The render surface — couples report status on their cards');
await check('relationshipSummaryForNpc names a partner only for seeing/committed; single NPCs report nothing',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const { a, b } = topCompatPair(h);
        const third = ids.find(id => id !== a && id !== b);
        if (relationshipSummaryForNpc(h, third) !== null) return false;
        notePairCoLocation(h, ids[0], ids[1], { weight: 1 });
        if (relationshipSummaryForNpc(h, ids[0]) !== null) return false; // single record, no label
        const day = forceCommitment(h, a, b, 30);
        if (!day) return false;
        const sa = relationshipSummaryForNpc(h, a);
        const sb = relationshipSummaryForNpc(h, b);
        return !!sa && sa.status === 'committed' && sa.partnerId === b && typeof sa.partnerName === 'string'
          && !!sb && sb.status === 'committed' && sb.partnerId === a;
      })()`));

// ---------------------------------------------------------------- 8
console.log('\n8. addRelationshipHistory — the store\'s writer for later phases (13/14/18)');
await check('history entries carry kind/day/other and lastIntimateDay updates on intimate kinds',
      api(`(() => {
        const h = house(20260816, 2);
        const [a, b] = residentIdsOf(h);
        addRelationshipHistory(h, a, b, 'first_kiss', 3);
        addRelationshipHistory(h, a, b, 'sex', 5);
        addRelationshipHistory(h, a, b, 'cheat', 9, 'npc_999');
        const rec = getRelationship(h, a, b, false);
        return rec.history.length === 3
          && rec.history[0].kind === 'first_kiss' && rec.history[0].day === 3 && !('other' in rec.history[0])
          && rec.history[2].kind === 'cheat' && rec.history[2].other === 'npc_999'
          && rec.lastIntimateDay === 5;
      })()`));

// ---------------------------------------------------------------- 9
console.log('\n9. Regression — the sim still runs with the store live');
await check('a full day of real resolveBatch ticks runs cleanly and the store stays coherent (coLocTicks reset by the daily pass)',
      api(`(() => {
        const h = house(20260816, 3);
        let gs = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                     player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
        for (let t = 0; t < 48; t++) {
          gs.meta.clock = advanceClock(gs.meta.clock, 1);
          gs = resolveBatch(gs, 1, { advanceClock: false }).state;
        }
        const store = gs.world.relationships;
        if (!store || typeof store !== 'object') return false;
        for (const rec of Object.values(store)) {
          if (!(rec.coLocTicks >= 0) || !(rec.progress >= 0 && rec.progress <= 1)) return false;
        }
        return true;
      })()`));

// ---------------------------------------------------------------- 10
console.log('\n10. THE MANDATORY GATE CHECK — relationships can never open the willingness door');
await check('a committed relationship record does not change the floors: a floored partner still returns exactly -1',
      api(`(() => {
        const h = house(20260816, 3);
        const ids = residentIdsOf(h);
        const target = ids[0], partner = ids[1];
        const rel = h.npcs[target].relPlayer;
        rel.trust = 0.4; rel.affection = 0.4; rel.comfort = 0.5; rel.tension = 0; rel.desire = 0.5;
        rel.grievances = [{ severity: 0.1, text: 'x', resolved: false }];
        const key = pairKey(target, partner);
        h.world.relationships[key] = { ...blankRelationshipRecord(), status: 'committed', public: true };
        h.npcs[target].relPlayer.tension = REL_CONSEQUENCES.tensionHigh;
        const hostile = willingness(h, h.npcs[target], 'player', 'sex', {});
        const gate = resolveWillingnessGate(h, target, 'player', 'sex', {});
        h.npcs[target].relPlayer.tension = 0;
        h.npcs[target].activity = 'sleeping';
        const asleep = willingness(h, h.npcs[target], 'player', 'sex', {});
        return hostile === -1 && asleep === -1 && gate.reason === 'floor' && !gate.allowed;
      })()`));
await check('relationships.js itself never touches the willingness function or any consent surface (formation is orthogonal to consent)',
      (() => {
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', 'relationships.js'), 'utf8');
        return !/willingness|intimateAllowed|getPhysicalDescriptionForPrompt|makeAMove|npcInitiativeGate/.test(src);
      })());

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exitCode = fail ? 1 : 0;
})();
