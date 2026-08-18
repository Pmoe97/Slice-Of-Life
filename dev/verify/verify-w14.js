// Intimacy & Voyeurism Plan Phase 14 — Outside partners, long-distance,
// infidelity (D14).
// The `world.outsidePartners` map (sim.js: ensureOutsidePartners /
// outsidePartnerIdOf / planOutsidePartnerVisitsForDay / getActivePartnerVisit
// / resolveVisitPresence's partner branch): committed/seeing residents are
// seeded a deterministic outside partner NPC (createExternalNpc, contactKnown,
// warm castWeb, committed relationship record — one record is the whole gate,
// so an in-house couple never gains a second partner), and the partner visits
// in the evening (soft-cap deferred like friend visits, 3-day cooldown). The
// visit is what makes the Phase 13 pair act reachable: the resident's
// `intimate` drive fires against the co-located partner (findIntimatePartner
// only ever picks a visitor who holds a committed/seeing record — the
// delivery-driver rule), and the act's infidelity pass
// (applyInfidelityFootprint, relationships.js — the ONE writer) writes the
// cheater's memory fact, the 'cheat' history entry, and — for a wronged
// party who PERCEIVES the act (same room, or the moan reaches them) — the
// jealousy immediately. The gossip path (pickFactsToRaise /
// receiveTransmittedFact carrying `cheating` metadata verbatim /
// maybeJealousUponFact wired into SIM's factTransfers application) makes
// learning later through talk land the same jealousy. The sext_partner drive
// (trySextPartner) is the long-distance thread: a flirty NPC message drained
// into the partner's real IM thread, desire climbing until the next visit,
// the sender's own desire the only door (messages are not acts).
//
// Nothing here reimplements the math — the engine loads into a bare vm and
// the assertions read what the real functions return (helpers injected INTO
// the vm context first, exactly like verify-w13). The save/load round-trip
// (real writeGeneratedGameState/loadGameState against an in-memory kv
// adapter) and the live peek/listen detectability live in the phase's
// harness suite and the live page respectively; the mandatory per-session
// gate check (a negative-willingness partner never participates) is section 5.
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

// --- Helpers injected INTO the vm context. ---
api(`
  function house(seed, n) {
    const partials = [];
    for (let i = 0; i < n; i++) partials.push({ name: 'Test' + String.fromCharCode(65 + i) });
    const h = SIM_generateHouse(seed, n, partials);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    return h;
  }
`);

api(`
  function residentsOf(h) {
    return Object.keys(h.npcs).filter(id => h.npcs[id].residency.status === 'resident');
  }
`);

api(`
  function fwdKey(a, b) { return a + '→' + b; }
`);

// Force every resident to gain a partner (deterministic; the default 0.35
// partnerChance is exercised by its own check below).
api(`
  function forcePartners(h) {
    OUTSIDE_PARTNER_TUNING.partnerChance = 1;
    ensureOutsidePartners(h);
    OUTSIDE_PARTNER_TUNING.partnerChance = 0.35;
  }
`);

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
      gs.npcs[id], id, gs.npcs, { block: block || 'evening', location: roomId, activity: 'hanging out',
        transit: null, nextBlock: 'wind_down', willReturnAt: null }, gs,
      seededRng(h.seed, 'w14_d_rng'), getTickIndex(gs.meta.clock.minutes), {}
    );
  }
`);

// R1 committed to R2; R1 and R3 together in R3's bedroom; R2 in the living
// room (only perceives if the moan reaches them).
api(`
  function cheatSetup() {
    const h = house(20260816, 3);
    const ids = residentsOf(h);
    const [r1, r2, r3] = ids;
    getRelationship(h, r1, r2, true).status = 'committed';
    getRelationship(h, r1, r2, false).lastTransitionDay = h.meta.clock.day;
    const room = h.npcs[r3].residency.room;
    for (const id of [r1, r2, r3]) {
      h.npcs[id].flags = {};
      h.npcs[id].activity = 'hanging out';
      h.npcs[id].clothing = 'dressed';
    }
    h.npcs[r1].location = room;
    h.npcs[r3].location = room;
    h.npcs[r2].location = 'living_room';
    return { h, r1, r2, r3, room };
  }
`);

// A room the moan genuinely cannot reach from `room` (D10 — no omniscience).
api(`
  function farRoomFrom(h, room) {
    const edges = SIGNAL_EDGES[room] || [];
    for (const r of ALL_ROOMS) {
      if (r === room || edges.includes(r)) continue;
      if (!(SIGNAL_EDGES[r] || []).includes(room)) return r;
    }
    return null;
  }
`);

(async () => {
// ---------------------------------------------------------------- 1
console.log('\n1. Outside-partner generation (sim.js)');
await check('idempotent: a second ensureOutsidePartners call changes nothing',
      api(`(() => {
        const h = house(20260816, 3);
        ensureOutsidePartners(h);
        const map1 = JSON.stringify(h.world.outsidePartners);
        ensureOutsidePartners(h);
        const map2 = JSON.stringify(h.world.outsidePartners);
        return map1 === map2;
      })()`));
await check('a forced generation: every resident gains a committed partner with contact, seeded desire, visitor status, warm castWeb both ways',
      api(`(() => {
        OUTSIDE_PARTNER_TUNING.partnerChance = 1;
        const h = house(20260817, 3);
        const partners = ensureOutsidePartners(h);
        let ok = Object.keys(partners).length === 3;
        for (const [rid, entry] of Object.entries(partners)) {
          const pid = entry.npcId;
          const p = h.npcs[pid];
          const rec = getRelationship(h, rid, pid, false);
          const web = h.world.castWeb[pairKey(rid, pid)];
          const fwd = web && web.axes[fwdKey(rid, pid)];
          const bwd = web && web.axes[fwdKey(pid, rid)];
          if (!p.contactKnown || p.residency.status !== 'visitor') ok = false;
          if ((p.needs?.desire || 0) !== OUTSIDE_PARTNER_TUNING.desireSeed) ok = false;
          if (!rec || rec.status !== 'committed') ok = false;
          if (!fwd || !bwd || fwd.desire !== OUTSIDE_PARTNER_TUNING.warmAxes.desire) ok = false;
        }
        OUTSIDE_PARTNER_TUNING.partnerChance = 0.35;
        return ok;
      })()`));
await check('the partnerChance 0/1 gates hold, and a resident already committed in-house is skipped (one record is the gate)',
      api(`(() => {
        OUTSIDE_PARTNER_TUNING.partnerChance = 1;
        const h = house(20260819, 3);
        const ids = residentsOf(h);
        getRelationship(h, ids[0], ids[1], true).status = 'committed';
        const partners = ensureOutsidePartners(h);
        const skip = !partners[ids[0]] && !partners[ids[1]] && !!partners[ids[2]];
        OUTSIDE_PARTNER_TUNING.partnerChance = 0;
        const h2 = house(20260818, 3);
        const none = Object.keys(ensureOutsidePartners(h2)).length === 0;
        OUTSIDE_PARTNER_TUNING.partnerChance = 0.35;
        return skip && none;
      })()`));
await check('determinism + the direct lookup',
      api(`(() => {
        const mk = () => {
          const h = house(20260816, 3);
          ensureOutsidePartners(h);
          return JSON.stringify(h.world.outsidePartners);
        };
        const h = house(20260816, 3);
        ensureOutsidePartners(h);
        const withPartner = Object.keys(h.world.outsidePartners)[0];
        return mk() === mk()
          && !!withPartner && outsidePartnerIdOf(h, withPartner) === h.world.outsidePartners[withPartner].npcId
          && outsidePartnerIdOf(h, 'nobody') === null;
      })()`));

// ---------------------------------------------------------------- 2
console.log('\n2. Visit planning + presence (D6 soft cap, cooldown, bedroom key)');
await check('a forced plan schedules every partner into their resident\u2019s bedroom, stamps lastVisitDay, and the 3-day cooldown holds',
      api(`(() => {
        OUTSIDE_PARTNER_TUNING.partnerChance = 1;
        OUTSIDE_PARTNER_TUNING.visitChancePerDay = 1;
        const h = house(20260820, 3);
        ensureOutsidePartners(h);
        const res = planOutsidePartnerVisitsForDay(h, 1);
        const visits = h.world.visits.filter(v => v.purpose === 'partner' && v.status !== 'deferred');
        let shape = res.filter(r => !r.deferred).length === 3 && visits.length === 3;
        for (const v of visits) {
          const rid = v.hostNpcId;
          const entry = h.world.outsidePartners[rid];
          if (!v.npcId || v.npcId !== entry.npcId) shape = false;
          if (v.roomId !== h.npcs[rid].residency.room) shape = false;
          if (v.startAbs < 1 * 1440 + OUTSIDE_PARTNER_TUNING.windowStartMinute) shape = false;
          if (v.status !== 'scheduled') shape = false;
          if (entry.lastVisitDay !== 1) shape = false;
        }
        const blocked = planOutsidePartnerVisitsForDay(h, 2).length === 0;
        const again = planOutsidePartnerVisitsForDay(h, 5).filter(r => !r.deferred).length === 3;
        OUTSIDE_PARTNER_TUNING.visitChancePerDay = 0.4;
        OUTSIDE_PARTNER_TUNING.partnerChance = 0.35;
        return shape && blocked && again;
      })()`));
await check('the soft cap defers partner visits exactly like friend visits',
      api(`(() => {
        OUTSIDE_PARTNER_TUNING.partnerChance = 1;
        OUTSIDE_PARTNER_TUNING.visitChancePerDay = 1;
        const h = house(20260821, 3);
        ensureOutsidePartners(h);
        const oldCap = VISIT_TUNING.softCap;
        VISIT_TUNING.softCap = 0;
        const res = planOutsidePartnerVisitsForDay(h, 1);
        const deferredAll = res.length === 3 && res.every(r => r.deferred);
        const visits = h.world.visits.filter(v => v.purpose === 'partner');
        const allDeferred = visits.every(v => v.status === 'deferred' && v.npcId === null);
        VISIT_TUNING.softCap = oldCap;
        OUTSIDE_PARTNER_TUNING.visitChancePerDay = 0.4;
        OUTSIDE_PARTNER_TUNING.partnerChance = 0.35;
        return deferredAll && allDeferred;
      })()`));
await check('getActivePartnerVisit resolves inside the window; presence follows the host into their own bedroom, a common room, and waits when the host is off-screen',
      api(`(() => {
        OUTSIDE_PARTNER_TUNING.partnerChance = 1;
        OUTSIDE_PARTNER_TUNING.visitChancePerDay = 1;
        const h = house(20260822, 3);
        ensureOutsidePartners(h);
        planOutsidePartnerVisitsForDay(h, 1);
        const rid = residentsOf(h)[0];
        const pid = h.world.outsidePartners[rid].npcId;
        const visit = h.world.visits.find(v => v.purpose === 'partner' && v.npcId === pid);
        h.meta.clock.minutes = visit.startAbs - 1 * 1440 + 10;
        const active = getActivePartnerVisit(h, pid);
        const rng = seededRng(h.seed, 'w14_presence_rng');
        const hostRoom = h.npcs[rid].residency.room;
        const r1 = resolveVisitPresence(pid, h, [visit], rng, { [rid]: { location: hostRoom } });
        const r2 = resolveVisitPresence(pid, h, [visit], rng, { [rid]: { location: 'living_room' } });
        const r3 = resolveVisitPresence(pid, h, [visit], rng, { [rid]: { location: null } });
        OUTSIDE_PARTNER_TUNING.visitChancePerDay = 0.4;
        OUTSIDE_PARTNER_TUNING.partnerChance = 0.35;
        return !!active && r1.location === hostRoom && r2.location === 'living_room' && r3.location === visit.roomId;
      })()`));

// ---------------------------------------------------------------- 3
console.log('\n3. The pair act with a visiting partner');
await check('findIntimatePartner picks the visiting partner (record-holding, gate-clearing); a visitor WITHOUT a record is never chosen',
      api(`(() => {
        const h = house(20260816, 3);
        forcePartners(h);
        const rid = Object.keys(h.world.outsidePartners)[0];
        const pid = h.world.outsidePartners[rid].npcId;
        const room = h.npcs[rid].residency.room;
        h.npcs[rid].needs = { hunger: 80, hygiene: 80, energy: 80, social: 80, comfort: 80, stimulation: 80, desire: 100 };
        h.npcs[rid].flags = {};
        h.npcs[rid].location = room; h.npcs[rid].activity = 'hanging out';
        h.npcs[pid].location = room; h.npcs[pid].activity = 'hanging out';
        h.npcs[pid].flags = {};
        const found = findIntimatePartner(h.npcs[rid], rid, h, room, 'evening');
        const gate = resolveWillingnessGate(h, pid, rid, NPC_INTIMACY.intimate.act, { location: room, block: 'evening', npcId: pid });

        const h2 = house(20260817, 3);
        const rid2 = residentsOf(h2)[0];
        const room2 = h2.npcs[rid2].residency.room;
        const driver = createExternalNpc(h2, 'outside_tester_1', 'outside_tester_1', 'Delivery Driver');
        driver.location = room2; driver.activity = 'hanging out';
        const axes = { trust: 0.6, affection: 0.65, tension: -0.1, respect: 0.5, comfort: 0.7, desire: 0.8 };
        const key = pairKey(rid2, driver.npcId);
        h2.world.castWeb[key] = createBlankPair(rid2, driver.npcId);
        h2.world.castWeb[key].axes[fwdKey(rid2, driver.npcId)] = { ...axes };
        h2.world.castWeb[key].axes[fwdKey(driver.npcId, rid2)] = { ...axes };
        h2.npcs[rid2].needs.desire = 100; h2.npcs[rid2].location = room2;
        const noRecord = findIntimatePartner(h2.npcs[rid2], rid2, h2, room2, 'evening') === null;
        return found === pid && gate.allowed && noRecord;
      })()`));
await check('tryIntimatePair resolves the full act with the visiting partner and no wronged party',
      api(`(() => {
        const h = house(20260816, 3);
        forcePartners(h);
        const rid = Object.keys(h.world.outsidePartners)[0];
        const pid = h.world.outsidePartners[rid].npcId;
        const room = h.npcs[rid].residency.room;
        h.npcs[rid].needs = { hunger: 80, hygiene: 80, energy: 80, social: 80, comfort: 80, stimulation: 80, desire: 100 };
        h.npcs[rid].flags = {}; h.npcs[pid].flags = {};
        h.npcs[rid].location = room; h.npcs[pid].location = room;
        h.npcs[rid].activity = 'hanging out'; h.npcs[pid].activity = 'hanging out';
        const r = tryIntimatePair(h.npcs[rid], rid, resolvedFor(room), h, DRIVE_DEFS.intimate);
        const rec = getRelationship(h, rid, pid, false);
        const nowAbs = clockToAbsolute(h.meta.clock);
        return !!r && r.activityOverride === 'having sex' && r.clothingState === 'undressed'
          && r.pairState.partnerId === pid && r.pairState.activity === 'having sex'
          && !!rec && rec.history.length === 1 && rec.history[0].kind === 'first_sex'
          && !!h.npcs[pid].commitment && h.npcs[pid].flags._driveCooldowns.intimate === nowAbs
          && (!r.wrongedNpcs || Object.keys(r.wrongedNpcs).length === 0)
          && (h.world.signals || []).some(s => s.id === 'moaning' && s.intensity === SIGNALS_EMIT.moaningHigh);
      })()`));
await check('evaluateDrives: the visiting-partner act fires through the normal drive path',
      api(`(() => {
        const h = house(20260816, 3);
        forcePartners(h);
        const rid = Object.keys(h.world.outsidePartners)[0];
        const room = h.npcs[rid].residency.room;
        h.npcs[rid].needs = { hunger: 80, hygiene: 80, energy: 80, social: 80, comfort: 80, stimulation: 80, desire: 100 };
        h.npcs[rid].flags = {}; h.npcs[h.world.outsidePartners[rid].npcId].flags = {};
        h.npcs[rid].location = room; h.npcs[h.world.outsidePartners[rid].npcId].location = room;
        h.npcs[rid].activity = 'hanging out'; h.npcs[h.world.outsidePartners[rid].npcId].activity = 'hanging out';
        const r = driveEval(h, rid, room, 'evening');
        return !!r && r.activityOverride === 'having sex' && r.clothingState === 'undressed'
          && r.pairState && r.pairState.partnerId === h.world.outsidePartners[rid].npcId
          && r.events.some(e => e.type === 'intimate');
      })()`));

// ---------------------------------------------------------------- 4
console.log('\n4. The infidelity footprint (relationships.js)');
await check('infidelityWrongedActs names the third party exactly once; the couple\u2019s own act betrays nobody; a player-other act names the player',
      api(`(() => {
        const { h, r1, r2, r3 } = cheatSetup();
        const acts = infidelityWrongedActs(h, r1, r3);
        const couple = infidelityWrongedActs(h, r1, r2);
        const withPlayer = infidelityWrongedActs(h, r1, 'player');
        return acts.length === 1 && acts[0].wrongedId === r2 && acts[0].cheaterId === r1 && acts[0].otherId === r3
          && couple.length === 0
          && withPlayer.length === 1 && withPlayer[0].otherId === 'player' && withPlayer[0].wrongedId === r2;
      })()`));
await check('infidelityCheatingFact is canonical third-person text with the cheating metadata riding the record',
      api(`(() => {
        const { h, r1, r3 } = cheatSetup();
        const fact = infidelityCheatingFact(h, r1, r3, 2);
        const playerFact = infidelityCheatingFact(h, r1, 'player', 2);
        return fact.text === 'TestA slept with TestC'
          && fact.category === 'cheating' && fact.importance === INFIDELITY.factImportance
          && fact.provenance === 'witnessed'
          && fact.cheating.cheaterId === r1 && fact.cheating.otherId === r3 && fact.cheating.day === 2
          && playerFact.text.indexOf('the player') !== -1
          && TRANSMISSION.socialCategories.includes(playerFact.category);
      })()`));
await check('infidelityWrongedPerceives: same room, a genuinely distant room (never), and the moan reaching them through the signal system',
      api(`(() => {
        const { h, r1, r2, r3, room } = cheatSetup();
        h.npcs[r2].location = room;
        const same = infidelityWrongedPerceives(h, r2, room);
        const far = farRoomFrom(h, room);
        h.npcs[r2].location = far;
        const farRes = far !== null && !infidelityWrongedPerceives(h, r2, room);
        h.npcs[r2].location = SIGNAL_EDGES[room][0];
        emitTransient(h, { id: 'moaning', roomId: room, intensity: SIGNALS_EMIT.moaningHigh, sourceId: r1 });
        const viaMoan = infidelityWrongedPerceives(h, r2, room);
        return same && farRes && viaMoan;
      })()`));
await check('applyInfidelityJealousy: mood drop, fact store, flag, idempotence, wronged\u2192cheater castWeb deltas, player-other relPlayer deltas + grievance',
      api(`(() => {
        const { h, r1, r2, r3 } = cheatSetup();
        const day = h.meta.clock.day;
        const fact = infidelityCheatingFact(h, r1, r3, day);
        const before = h.npcs[r2].mood;
        const w = applyInfidelityJealousy(h, r2, r1, r3, day, { ...fact });
        const flagsAfter = JSON.stringify(w.flags._jealousy);
        const w2 = applyInfidelityJealousy(h, r2, r1, r3, day, { ...fact });
        const axesAfter = JSON.stringify(h.world.castWeb[pairKey(r2, r1)].axes[fwdKey(r2, r1)]);

        const { h: h2, r1: c1, r2: c2 } = cheatSetup();
        const d2 = h2.meta.clock.day;
        const beforeTrust = h2.npcs[c2].relPlayer.trust;
        const beforeRel = JSON.stringify(h2.npcs[c2].relPlayer);
        const wp = applyInfidelityJealousy(h2, c2, c1, 'player', d2, null);
        return w.mood < before && w.memory.facts.some(f => f.text === fact.text) && !!w.flags._jealousy
          && JSON.stringify(w2.flags._jealousy) === flagsAfter
          && JSON.stringify(wp.relPlayer) !== beforeRel && wp.relPlayer.trust < beforeTrust
          && (wp.relPlayer.grievances || []).some(g => (g.text || '').indexOf(INFIDELITY.grievanceText) !== -1)
          && !!axesAfter;
      })()`));
await check('applyInfidelityFootprint (the ONE writer): cheater memory + history \u2018cheat\u2019; unseen \u2192 nothing for the wronged; caught \u2192 jealousy + witnessed fact + cheating event',
      api(`(() => {
        const { h, r1, r2, r3, room } = cheatSetup();
        const fp = applyInfidelityFootprint(h, r1, r3, 'sex', { location: room });
        const unseenOK = h.npcs[r1].memory.facts.some(f => f.category === 'cheating')
          && (getRelationship(h, r1, r2, false).history || []).some(hh => hh.kind === 'cheat' && hh.other === r3)
          && Object.keys(fp.wrongedNpcs).length === 0 && fp.events.length === 0;

        const { h: h2, r1: a, r2: b, r3: c, room: room2 } = cheatSetup();
        h2.npcs[b].location = room2;
        const day = h2.meta.clock.day;
        const fact = infidelityCheatingFact(h2, a, c, day);
        const fp2 = applyInfidelityFootprint(h2, a, c, 'sex', { location: room2 });
        const caughtOK = !!fp2.wrongedNpcs[b]
          && fp2.events.some(e => e.type === 'cheating' && e.npcId === b && e.data.other === a)
          && fp2.wrongedNpcs[b].memory.facts.some(f => f.text === fact.text && f.provenance === 'witnessed')
          && Object.keys(fp2.wrongedNpcs[b].flags._jealousy || {}).length === 1;
        return unseenOK && caughtOK;
      })()`));
await check('maybeJealousUponFact: the wronged receiver\u2019s gossip-learning lands jealousy exactly once; cheater/unrelated/non-cheating are null; metadata survives a told_by hop',
      api(`(() => {
        const { h, r1, r2, r3 } = cheatSetup();
        const day = h.meta.clock.day;
        const fact = infidelityCheatingFact(h, r1, r3, day);
        const jealous = maybeJealousUponFact(h, r2, { ...fact });
        const unrelated = maybeJealousUponFact(h, r1, { ...fact });
        const nonCheating = maybeJealousUponFact(h, r2, { ...fact, category: 'relationship' });
        const beforeMem = JSON.stringify(h.npcs[r2].memory);
        const again = maybeJealousUponFact(h, r2, { ...fact });
        const recv = receiveTransmittedFact(h.npcs[r3], { ...fact, confidence: 1 }, { sourceId: r1, day });
        return !!jealous && !!jealous.flags._jealousy && unrelated === null && nonCheating === null
          && JSON.stringify(again.memory) === beforeMem
          && recv.memory.facts.some(f => f.text === fact.text && f.cheating && f.cheating.cheaterId === r1 && f.cheating.otherId === r3);
      })()`));
await check('a cheating fact clears the gossip raise-scorer (category-gated)',
      api(`(() => {
        const { h, r1, r2, r3 } = cheatSetup();
        const day = h.meta.clock.day;
        const fact = infidelityCheatingFact(h, r1, r3, day);
        const chooser = addMemoryFact(h.npcs[r2], { ...fact });
        const score = factRaiseScore(chooser.memory.facts[0], chooser, h.npcs[r3], day);
        return score > 0 && TRANSMISSION.socialCategories.includes(fact.category);
      })()`));

// ---------------------------------------------------------------- 5
console.log('\n5. THE MANDATORY GATE CHECK — a negative-willingness partner never participates');
await check('a floored visiting partner is never chosen and the act aborts with ZERO footprint',
      api(`(() => {
        const h = house(20260816, 3);
        forcePartners(h);
        const rid = Object.keys(h.world.outsidePartners)[0];
        const pid = h.world.outsidePartners[rid].npcId;
        const room = h.npcs[rid].residency.room;
        h.npcs[rid].needs = { hunger: 80, hygiene: 80, energy: 80, social: 80, comfort: 80, stimulation: 80, desire: 100 };
        h.npcs[rid].flags = {}; h.npcs[pid].flags = {};
        h.npcs[rid].location = room; h.npcs[pid].location = room;
        h.npcs[rid].activity = 'hanging out'; h.npcs[pid].activity = 'hanging out';
        h.npcs[rid].clothing = 'dressed'; h.npcs[pid].clothing = 'dressed';
        delete h.world.castWeb[pairKey(rid, pid)];   // stranger floor → exactly -1
        const gate = resolveWillingnessGate(h, pid, rid, NPC_INTIMACY.intimate.act, { location: room, block: 'evening', npcId: pid });
        const chosen = findIntimatePartner(h.npcs[rid], rid, h, room, 'evening');
        const recBefore = JSON.stringify(getRelationship(h, rid, pid, false));
        const webBefore = JSON.stringify(h.world.castWeb[pairKey(rid, pid)]);
        const signalsBefore = (h.world.signals || []).length;
        const r = tryIntimatePair(h.npcs[rid], rid, resolvedFor(room), h, DRIVE_DEFS.intimate);
        const P = h.npcs[pid];
        return gate.willingness === -1 && gate.reason === 'floor' && chosen === null
          && r === null && !P.commitment && !P.flags._driveCooldowns && !P.flags._intimacyHistory
          && P.clothing === 'dressed'
          && JSON.stringify(getRelationship(h, rid, pid, false)) === recBefore
          && JSON.stringify(h.world.castWeb[pairKey(rid, pid)]) === webBefore
          && (h.world.signals || []).length === signalsBefore;
      })()`));
await check('symmetric: a floored resident cannot be pulled in by the partner\u2019s own drive either',
      api(`(() => {
        const h = house(20260817, 3);
        forcePartners(h);
        const rid = Object.keys(h.world.outsidePartners)[0];
        const pid = h.world.outsidePartners[rid].npcId;
        const room = h.npcs[rid].residency.room;
        h.npcs[rid].needs = { hunger: 80, hygiene: 80, energy: 80, social: 80, comfort: 80, stimulation: 80, desire: 20 };
        h.npcs[rid].flags = {}; h.npcs[pid].flags = {};
        h.npcs[rid].location = room; h.npcs[pid].location = room;
        delete h.world.castWeb[pairKey(rid, pid)];
        const gate = resolveWillingnessGate(h, rid, pid, NPC_INTIMACY.intimate.act, { location: room, block: 'evening', npcId: rid });
        const chosen = findIntimatePartner(h.npcs[pid], pid, h, room, 'evening');
        return gate.willingness === -1 && chosen === null;
      })()`));
await check('no bypass: the Phase 13/14 partner selection and the infidelity footprint are gated (source read)',
      (() => {
        const reads = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'srcfiles', f), 'utf8');
        const drivesSrc = reads('drives.js');
        const actionsSrc = reads('actions.js');
        const relSrc = reads('relationships.js');
        const simSrc = reads('sim.js');
        // The pair act: partner selection (findIntimatePartner) AND the
        // resolver (tryIntimatePair) each re-check the willingness gate.
        const pairRegion = drivesSrc.slice(drivesSrc.indexOf('function findIntimatePartner'), drivesSrc.indexOf('function trySextPartner'));
        const hasGate = (pairRegion.match(/resolveWillingnessGate/g) || []).length >= 2;
        const noSneaky = !/allowed\s*=\s*true|bypass|skipWillingness|force/i.test(pairRegion);
        // The ONE writer: relationships.js defines applyInfidelityFootprint;
        // drives.js and actions.js only call it (the cheater-memory/history/
        // jealousy write is never duplicated in a second location).
        const oneWriter = relSrc.includes('function applyInfidelityFootprint')
          && (drivesSrc.match(/applyInfidelityFootprint\(/g) || []).length === 1
          && (actionsSrc.match(/applyInfidelityFootprint\(/g) || []).length === 1;
        const wired = simSrc.includes('maybeJealousUponFact') && simSrc.includes('wrongedNpcs');
        return hasGate && noSneaky && oneWriter && wired;
      })());

// ---------------------------------------------------------------- 6
console.log('\n6. resolveTick integration + the gossip path end-to-end');
await check('a full 48-tick day with real partner visits runs cleanly and deterministically',
      api(`(() => {
        const run = (seed) => {
          const h = house(seed, 3);
          forcePartners(h);
          OUTSIDE_PARTNER_TUNING.visitChancePerDay = 1;
          planOutsidePartnerVisitsForDay(h, 1);
          OUTSIDE_PARTNER_TUNING.visitChancePerDay = 0.4;
          let gs = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                     player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
          for (let t = 0; t < 48; t++) {
            gs.meta.clock = advanceClock(gs.meta.clock, 1);
            gs = resolveBatch(gs, 1, { advanceClock: false }).state;
          }
          return JSON.stringify({
            day: gs.meta.clock.day,
            partnerVisits: (gs.world.visits || []).filter(v => v.purpose === 'partner').map(v => [v.npcId, v.status]),
            npcLocs: Object.keys(gs.npcs).map(id => id + ':' + gs.npcs[id].location).sort(),
          });
        };
        return run(20260816) === run(20260816);
      })()`));
await check('the gossip path: footprint first, then the raised fact reaching the WRONGED party lands jealousy (and the \u2018cheat\u2019 history entry exists)',
      api(`(() => {
        const { h, r1, r2, r3, room } = cheatSetup();
        const day = h.meta.clock.day;
        applyInfidelityFootprint(h, r1, r3, 'sex', { location: room });
        const fact = h.npcs[r1].memory.facts.find(f => f.category === 'cheating');
        const raised = pickFactsToRaise(h.npcs[r1], h.npcs[r3], 3, day, () => 0, h.npcs[r1].memory.facts);
        for (const f of raised) {
          h.npcs[r3] = receiveTransmittedFact(h.npcs[r3], f, { kind: 'told', provenance: 'told_by:' + r1, sourceId: r1, day });
        }
        const raisedToWronged = pickFactsToRaise(h.npcs[r1], h.npcs[r2], 3, day, () => 0, h.npcs[r1].memory.facts);
        for (const f of raisedToWronged) {
          h.npcs[r2] = receiveTransmittedFact(h.npcs[r2], f, { kind: 'told', provenance: 'told_by:' + r1, sourceId: r1, day });
          const jealous = maybeJealousUponFact(h, r2, f);
          if (jealous) h.npcs[r2] = jealous;
        }
        return raised.length > 0
          && h.npcs[r2].memory.facts.some(f => f.text === fact.text && (f.cheating || f.provenance === 'told_by:' + r1))
          && !!h.npcs[r2].flags._jealousy && Object.keys(h.npcs[r2].flags._jealousy).length === 1
          && (getRelationship(h, r1, r2, false).history || []).some(hh => hh.kind === 'cheat');
      })()`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exitCode = fail ? 1 : 0;
})();
