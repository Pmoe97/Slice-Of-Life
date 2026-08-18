// Intimacy & Voyeurism Plan Phase 11 — Player intimacy verbs + Make a Move
// (D3/D13).
// The five INTIMACY_ACT_DEFS as ACTION_DEFS rows: masturbate is the solo
// chip (self-sourced, private-room gated); the four paired acts surface ONLY
// through the Make-a-Move flow (their `source.kind: 'paired'` is rejected by
// actionSourceMatches, so they never render as flat chips), and every paired
// act passes the SAME Phase 9 willingness gate an NPC-initiated overture
// passes (design invariant 2 — symmetric initiation, one door). The two-party
// half (resolvePairedAct) is ONE writer applying both parties' effects,
// relDeltas, final clothing, intimacy history, the player's ledger entry and
// the unmade bed — deterministically, no LLM call decides any of it (D15).
//
// Nothing here reimplements the math: the engine loads into a bare vm and the
// assertions read what the real functions return. The helpers (house/warmNpc/
// coldNpc/makeCtx) are injected INTO the vm context first, so every `api`
// expression resolves them the same way the page globals do. The clock-
// advance half of executeAction (advanceAndResolveMinutes) needs ui.js +
// the DOM and is verified live (browser_eval); the refusal paths that return
// BEFORE the clock moves are fully covered here. The mandatory per-session
// gate check (a negative-willingness act never fires) is check 10.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

let pass = 0, fail = 0;
// Async-aware: executeAction's refusal paths (check 7) return promises, and a
// bare `if (promise)` would always pass. `await` normalizes both shapes.
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

// A warm, NON-stranger NPC: axes moved, phase derived, needs set. `tension`
// defaults low so the hostile floor never trips it.
api(`
  function warmNpc(npc, opts) {
    opts = opts || {};
    const rel = npc.relPlayer;
    rel.trust = opts.trust ?? 0.5;
    rel.affection = opts.affection ?? 0.6;
    rel.comfort = opts.comfort ?? 0.9;
    rel.desire = opts.relDesire ?? 0.7;
    rel.tension = opts.tension ?? 0;
    rel.respect = opts.respect ?? 0.3;
    rel.grievances = [];
    const d = deriveConversationPhase(rel);
    rel.intimacyLevel = d.intimacyLevel;
    rel.conversationPhase = d.conversationPhase;
    npc.needs.desire = opts.desire ?? 70;
    npc.mood = opts.mood ?? 0.3;
    npc.location = opts.room || 'bedroom_1';
    return npc;
  }
`);

// The neutral-acquaintance case from the Phase 9 harness: NOT a stranger
// (a couple of axes moved + a grievance), but far below the quickie/sex bars.
api(`
  function coldNpc(npc) {
    const rel = npc.relPlayer;
    rel.tension = 0.2; rel.trust = 0.2;
    rel.grievances = [{ severity: 0.3, text: 'x', resolved: false }];
    const d = deriveConversationPhase(rel);
    rel.intimacyLevel = d.intimacyLevel; rel.conversationPhase = d.conversationPhase;
    npc.needs.desire = 30; npc.mood = 0; npc.location = 'living_room';
    return npc;
  }
`);

// A requirement-checker ctx (the shape checkRequirements expects).
api(`
  function makeCtx(h, roomId, targetId) {
    return { gameState: h, roomId, presentNpcIds: targetId ? [targetId] : [],
             actTargetNpcId: targetId || null, actTargetId: targetId || null };
  }
`);

// ---------------------------------------------------------------- 1
(async () => {

console.log('\n1. INTIMACY tuning table (config.js)');
await check('every act the plan names has a duration; two-sided tables exist for each',
      api(`(() => {
        const I = INTIMACY;
        const acts = ['masturbate', 'quickie', 'sex', 'cuddle', 'share_shower'];
        return acts.every(a => typeof I.durationMinutes[a] === 'number' && I.durationMinutes[a] > 0)
          && ['masturbate', 'quickie', 'sex', 'cuddle', 'share_shower'].every(a => typeof I.playerMoodGain[a] === 'number')
          && typeof I.playerEnergyCost.quickie === 'number' && typeof I.playerEnergyCost.sex === 'number'
          && typeof I.npcMoodGain.sex === 'number' && typeof I.npcHygieneCost.sex === 'number'
          && I.shareShowerRestore > 0 && I.npcDesireRelease.sex >= I.npcDesireRelease.quickie;
      })()`));
await check('relDeltas exist for every paired act and are positive warmth / negative sated desire + tension release',
      api(`(() => {
        const R = INTIMACY.relDeltas;
        for (const act of ['quickie', 'sex', 'cuddle', 'share_shower']) {
          const d = R[act];
          if (!d) return false;
          if (d.affection <= 0 || d.comfort <= 0 || d.trust <= 0) return false;
          if (d.desire >= 0 || d.tension > 0) return false;
        }
        return true;
      })()`));
await check('only the bed acts unmake the bed (invariant 7 trace), and their values are sane',
      api(`(() => {
        const L = INTIMACY.leavesBedUnmade;
        return Array.isArray(L) && L.length === 2 && L.includes('quickie') && L.includes('sex') && !L.includes('cuddle') && !L.includes('share_shower');
      })()`));
await check('player release amounts are positive (the effect strings carry the minus — no sign-carrying interpolation)',
      api(`(() => DESIRE.release.masturbate > 0 && DESIRE.release.quickie > 0 && DESIRE.release.sex > 0)()`));

// ---------------------------------------------------------------- 2
console.log('\n2. The five ACTION_DEFS rows');
await check('all five intimacy acts are registered ACTION_DEFS rows',
      api(`(() => ['intimacy.masturbate', 'intimacy.quickie', 'intimacy.sex', 'intimacy.cuddle', 'intimacy.share_shower']
             .every(id => !!ACTION_DEFS[id]))()`));
await check('the four paired acts declare source.kind paired and their willingness:<act> gate; masturbate is self',
      api(`(() => {
        for (const id of ['intimacy.quickie', 'intimacy.sex', 'intimacy.cuddle', 'intimacy.share_shower']) {
          const d = ACTION_DEFS[id];
          if (d.source.kind !== 'paired') return false;
          if (!d.requires.some(r => r === 'willingness:' + id.split('.')[1])) return false;
          if (!d.paired || !d.paired.ledgerAct || !Array.isArray(d.paired.npcEffects) || !d.paired.relDeltas) return false;
        }
        const m = ACTION_DEFS['intimacy.masturbate'];
        return m.source.kind === 'self' && m.requires.some(r => r === 'privateRoom')
          && !m.requires.some(r => r.startsWith('willingness'));
      })()`));
await check('every paired block carries explicit clothing semantics; cuddle is the exception that proves it (none at all)',
      api(`(() => {
        const defs = ACTION_DEFS;
        return defs['intimacy.quickie'].paired.npcClothing === 'undressed'
          && defs['intimacy.quickie'].paired.npcClothingAfter === 'undressed'
          && defs['intimacy.sex'].paired.npcClothing === 'undressed'
          && defs['intimacy.sex'].paired.npcClothingAfter === 'undressed'
          && defs['intimacy.share_shower'].paired.npcClothing === 'undressed'
          && defs['intimacy.share_shower'].paired.npcClothingAfter === 'towel'
          && !('npcClothing' in defs['intimacy.cuddle'].paired)
          && !('npcClothingAfter' in defs['intimacy.cuddle'].paired);
      })()`));
await check('vulnerableState: only masturbate peeps as \'masturbating\'; the four paired acts hold \'intimacy\'; cuddle is NOT vulnerable (the open-room act)',
      api(`(() => {
        const defs = ACTION_DEFS;
        return defs['intimacy.masturbate'].vulnerableState === 'masturbating'
          && defs['intimacy.quickie'].vulnerableState === 'intimacy'
          && defs['intimacy.sex'].vulnerableState === 'intimacy'
          && defs['intimacy.share_shower'].vulnerableState === 'intimacy'
          && !('vulnerableState' in defs['intimacy.cuddle']);
      })()`));
await check('the paired acts\' player effects include the sated desire release (a completed act drops player desire)',
      api(`(() => {
        const j = (s) => ACTION_DEFS[s].effects.join('\\n');
        return /desire -\\d+/.test(j('intimacy.quickie')) && /desire -\\d+/.test(j('intimacy.sex')) && /desire -\\d+/.test(j('intimacy.masturbate'));
      })()`));

// ---------------------------------------------------------------- 3
console.log('\n3. The paired acts surface ONLY through Make a Move — never as flat chips');
await check('actionSourceMatches rejects every paired act and accepts self-sourced masturbate',
      api(`(() => {
        const ctx = makeCtx(house(20261011, 1), 'bedroom_1', null);
        return !actionSourceMatches(ACTION_DEFS['intimacy.quickie'], ctx)
          && !actionSourceMatches(ACTION_DEFS['intimacy.sex'], ctx)
          && !actionSourceMatches(ACTION_DEFS['intimacy.cuddle'], ctx)
          && !actionSourceMatches(ACTION_DEFS['intimacy.share_shower'], ctx)
          && actionSourceMatches(ACTION_DEFS['intimacy.masturbate'], ctx);
      })()`));

// ---------------------------------------------------------------- 4
console.log('\n4. Room gates — privateRoom / privacy / afterSexOrClose / masturbate availability');
await check('isPrivateRoom: bedrooms and bathrooms yes; common rooms no',
      api(`(() => isPrivateRoom('bedroom_1') && isPrivateRoom('bathroom_a')
             && !isPrivateRoom('living_room') && !isPrivateRoom('kitchen'))()`));
await check('masturbate is available in a private room and refused in a common room',
      api(`(() => {
        const h = house(20261011, 1);
        const id = Object.keys(h.npcs)[0];
        h.npcs[id].location = 'bedroom_1';
        const priv = checkRequirements(ACTION_DEFS['intimacy.masturbate'], makeCtx(h, 'bedroom_1', null));
        const shared = checkRequirements(ACTION_DEFS['intimacy.masturbate'], makeCtx(h, 'living_room', null));
        return priv.ok && !shared.ok && /private room/.test(shared.reason);
      })()`));
await check('privacy: a locked door passes; a third person in the room fails even unlocked; the chosen partner does not count as an onlooker',
      api(`(() => {
        const h = house(20261011, 2);
        const [a, b] = Object.keys(h.npcs);
        const roomId = 'bedroom_1';
        h.npcs[a].location = roomId; h.npcs[b].location = roomId;
        const door = Object.values(h.objects['room_bedroom_1'] || {}).find(o => o.defId === 'bedroom_door');
        const base = { gameState: h, roomId, presentNpcIds: [a, b], actTargetNpcId: a };
        const open = ACTION_REQUIREMENT_CHECKERS.privacy(base);
        if (door) { door.state = { ...(door.state || {}), lock: 'locked' }; }
        const locked = ACTION_REQUIREMENT_CHECKERS.privacy(base);
        const alone = ACTION_REQUIREMENT_CHECKERS.privacy({ ...base, presentNpcIds: [a] });
        return open === true ? alone === true && locked === true
          : (door ? locked === true && alone === true : alone === true);
      })()`));
await check('afterSexOrClose: close phase passes, early fails, a same-day completed act passes',
      api(`(() => {
        const h = house(20261011, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        npc.relPlayer.conversationPhase = 'early';
        const early = ACTION_REQUIREMENT_CHECKERS.afterSexOrClose(makeCtx(h, 'living_room', id));
        npc.relPlayer.conversationPhase = 'close';
        const close = ACTION_REQUIREMENT_CHECKERS.afterSexOrClose(makeCtx(h, 'living_room', id));
        npc.flags = { _intimacyHistory: { lastIntimateDay: h.meta.clock.day, lastWith: 'player' } };
        npc.relPlayer.conversationPhase = 'early';
        const today = ACTION_REQUIREMENT_CHECKERS.afterSexOrClose(makeCtx(h, 'living_room', id));
        return typeof early === 'string' && close === true && today === true;
      })()`));

// ---------------------------------------------------------------- 5
console.log('\n5. The willingness requirement checker + the refusal marker');
await check('the checker passes a willing target and returns prose for a soft no, marking below_threshold',
      api(`(() => {
        const h = house(20261011, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        warmNpc(npc, { room: 'bedroom_1' });
        const open = ACTION_REQUIREMENT_CHECKERS.willingness(makeCtx(h, 'bedroom_1', id), 'sex');
        if (open !== true) return false;
        coldNpc(npc);
        const ctx = makeCtx(h, 'living_room', id);
        const soft = ACTION_REQUIREMENT_CHECKERS.willingness(ctx, 'sex');
        return typeof soft === 'string' && ctx._willingnessRefused === 'below_threshold';
      })()`));
await check('a floored target refuses with prose and marks the floor reason — EXCEPT the already-refusing floor, which marks nothing',
      api(`(() => {
        const h = house(20261011, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        warmNpc(npc, { room: 'bedroom_1' });
        npc.relPlayer.tension = REL_CONSEQUENCES.tensionHigh;
        const ctx = makeCtx(h, 'bedroom_1', id);
        const hostile = ACTION_REQUIREMENT_CHECKERS.willingness(ctx, 'sex');
        const hostileMarker = ctx._willingnessRefused;
        noteIntimacyRefusal(npc, h.meta.clock.day, { lockoutDays: 1 });
        const ctx2 = makeCtx(h, 'bedroom_1', id);
        const already = ACTION_REQUIREMENT_CHECKERS.willingness(ctx2, 'sex');
        return typeof hostile === 'string' && hostileMarker === 'floor'
          && /no mood/.test(hostile) && typeof already === 'string' && ctx2._willingnessRefused === undefined;
      })()`));
await check('skipWillingness lets an unwilling target through the non-willingness gates (the Make-a-Move act list) and the full check closes it',
      api(`(() => {
        const h = house(20261011, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        coldNpc(npc);
        npc.location = 'bedroom_1';   // private + alone, so ONLY the willingness gate is left to fail
        const ctx = makeCtx(h, 'bedroom_1', id);
        const def = ACTION_DEFS['intimacy.sex'];
        const listed = checkRequirements(def, ctx, { skipWillingness: true });
        const gated = checkRequirements(def, ctx);
        return listed.ok && !gated.ok && /Not now/.test(gated.reason);
      })()`));

// ---------------------------------------------------------------- 6
console.log('\n6. resolvePairedAct — the single two-party writer');
await check('a completed sex act applies BOTH parties: partner needs/mood, relDeltas + re-derived phase, final clothing, history, ledger, unmade bed — and never destroys the NPC',
      api(`(() => {
        const h = house(20261011, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        warmNpc(npc, { room: 'bedroom_1', desire: 100, relDesire: 1 });
        npc.clothing = 'dressed';
        npc.mood = 0.5;
        const bed = Object.values(h.objects['room_bedroom_1'] || {}).find(o => o.defId === 'bed');
        const pre = { affection: npc.relPlayer.affection, comfort: npc.relPlayer.comfort,
                      trust: npc.relPlayer.trust, desire: npc.relPlayer.desire, tension: npc.relPlayer.tension,
                      energy: npc.needs.energy, hygiene: npc.needs.hygiene, desireNeed: npc.needs.desire, mood: npc.mood };
        const def = ACTION_DEFS['intimacy.sex'];
        const out = resolvePairedAct(h, def, { actTargetNpcId: id, roomId: 'bedroom_1' }, 40);
        const post = h.npcs[id];
        const stillNpc = !!post.bible && typeof post.bible.name === 'string';
        const relOK = post.relPlayer.affection > pre.affection && post.relPlayer.comfort > pre.comfort
          && post.relPlayer.trust > pre.trust && post.relPlayer.desire < pre.desire && post.relPlayer.tension < pre.tension;
        const needsOK = post.needs.energy < pre.energy && post.needs.hygiene < pre.hygiene
          && post.needs.desire < pre.desireNeed && post.mood > pre.mood;
        const histOK = post.flags && post.flags._intimacyHistory && post.flags._intimacyHistory.lastWith === 'player';
        const ledgerOK = Array.isArray(h.player.ledger[id])
          && h.player.ledger[id].length === 1
          && h.player.ledger[id][0].kind === 'participated'
          && h.player.ledger[id][0].act === 'sex'
          && h.player.ledger[id][0].day === h.meta.clock.day
          && h.player.ledger[id][0].roomId === 'bedroom_1'
          && h.player.ledger[id][0].spent === false;
        const clothingOK = post.clothing === 'undressed';
        const bedOK = !bed || bed.state.made === 'unmade';
        return out === id && stillNpc && relOK && needsOK && histOK && ledgerOK && clothingOK && bedOK;
      })()`));
await check('the quickie/cuddle/shared_shower rows apply the same single-writer path with their own deltas and ledger acts',
      api(`(() => {
        const h = house(20261011, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        warmNpc(npc, { room: 'bedroom_1', desire: 100, relDesire: 1 });
        resolvePairedAct(h, ACTION_DEFS['intimacy.quickie'], { actTargetNpcId: id, roomId: 'bedroom_1' }, 10);
        const led = h.player.ledger[id][0];
        return led.act === 'quickie' && h.npcs[id].flags._intimacyHistory.lastWith === 'player'
          && h.npcs[id].relPlayer.affection > 0.6;
      })()`));
await check('share_shower leaves a towel behind (npcClothingAfter), and cuddle changes no clothing at all',
      api(`(() => {
        const h = house(20261011, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        warmNpc(npc, { room: 'bathroom_a', desire: 60, relDesire: 0.5 });
        npc.clothing = 'dressed';
        resolvePairedAct(h, ACTION_DEFS['intimacy.share_shower'], { actTargetNpcId: id, roomId: 'bathroom_a' }, 15);
        const towel = h.npcs[id].clothing === 'towel';
        const h2 = house(20261012, 1);
        const id2 = Object.keys(h2.npcs)[0];
        const n2 = h2.npcs[id2];
        warmNpc(n2, { room: 'living_room', desire: 60, relDesire: 0.5 });
        n2.clothing = 'dressed';
        resolvePairedAct(h2, ACTION_DEFS['intimacy.cuddle'], { actTargetNpcId: id2, roomId: 'living_room' }, 25);
        return towel && h2.npcs[id2].clothing === 'dressed' && h2.player.ledger[id2][0].act === 'cuddle';
      })()`));
await check('a bathroom act never crashes on the bed-unmake guard (no bed to unmake)',
      api(`(() => {
        const h = house(20261011, 1);
        const id = Object.keys(h.npcs)[0];
        warmNpc(h.npcs[id], { room: 'bathroom_a', desire: 100, relDesire: 1 });
        const out = resolvePairedAct(h, ACTION_DEFS['intimacy.quickie'], { actTargetNpcId: id, roomId: 'bathroom_a' }, 10);
        return out === id;
      })()`));
await check('resolvePairedAct is deterministic: two identical states produce identical results',
      api(`(() => {
        const build = (seed) => {
          const h = house(seed, 1);
          const id = Object.keys(h.npcs)[0];
          warmNpc(h.npcs[id], { room: 'bedroom_1', desire: 100, relDesire: 1 });
          return h;
        };
        const a = build(20261013);
        const b = build(20261013);
        const idA = Object.keys(a.npcs)[0];
        const idB = Object.keys(b.npcs)[0];
        resolvePairedAct(a, ACTION_DEFS['intimacy.sex'], { actTargetNpcId: idA, roomId: 'bedroom_1' }, 40);
        resolvePairedAct(b, ACTION_DEFS['intimacy.sex'], { actTargetNpcId: idB, roomId: 'bedroom_1' }, 40);
        return JSON.stringify(a.npcs[idA]) === JSON.stringify(b.npcs[idB])
          && JSON.stringify(a.player.ledger) === JSON.stringify(b.player.ledger);
      })()`));

// ---------------------------------------------------------------- 7
console.log('\n7. executeAction refusal paths (these return before the clock advances, so they run offline)');
await check('a floored (hostile) target: ok:false, refusal:false, no effects, no ledger, no clothing, no lockout, clock untouched',
      api(`(async () => {
        const h = house(20261011, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        warmNpc(npc, { room: 'bedroom_1', desire: 100, relDesire: 1 });
        npc.relPlayer.tension = REL_CONSEQUENCES.tensionHigh;
        const minutesBefore = h.meta.clock.minutes;
        const before = JSON.stringify(npc);
        const r = await executeAction('intimacy.sex', h, undefined, { targetNpcId: id });
        return !r.ok && r.refusal === false && r.ticksSpent === 0
          && JSON.stringify(npc) === before
          && !h.player.ledger && !npc.flags?._intimacyRefusals
          && h.meta.clock.minutes === minutesBefore;
      })()`));
await check('a soft no: ok:false, refusal:true (the lockout IS a real state change), lockout written, no effects, clock untouched',
      api(`(async () => {
        const h = house(20261011, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        coldNpc(npc);
        const minutesBefore = h.meta.clock.minutes;
        const desireBefore = npc.needs.desire;
        const r = await executeAction('intimacy.sex', h, undefined, { targetNpcId: id });
        const refs = npc.flags._intimacyRefusals;
        return !r.ok && r.refusal === true && refs && refs.count === 1
          && refs.lastDay === h.meta.clock.day && typeof refs.lockUntilDay === 'number'
          && npc.needs.desire === desireBefore && !h.player.ledger
          && h.meta.clock.minutes === minutesBefore;
      })()`));
await check('a second attempt during the lockout hits the actively-refusing floor: refused, no double write',
      api(`(async () => {
        const h = house(20261011, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        coldNpc(npc);
        await executeAction('intimacy.sex', h, undefined, { targetNpcId: id });
        const countAfterFirst = npc.flags._intimacyRefusals.count;
        const r2 = await executeAction('intimacy.sex', h, undefined, { targetNpcId: id });
        return !r2.ok && r2.refusal === false && npc.flags._intimacyRefusals.count === countAfterFirst
          && /already said no/.test(r2.reason);
      })()`));

// ---------------------------------------------------------------- 8
console.log('\n8. The willingness gates the acts declare line up with the Phase 9 bars');
await check('thresholds: sex 0.6 > quickie 0.5 > share_shower 0.45 > cuddle 0.35; masturbate 0',
      api(`(() => {
        const t = WILLINGNESS.thresholds;
        return willingnessThreshold('masturbate') === 0
          && willingnessThreshold('cuddle') === 0.35
          && willingnessThreshold('share_shower') === 0.45
          && willingnessThreshold('quickie') === 0.5
          && willingnessThreshold('sex') === 0.6
          && t.sex > t.quickie && t.quickie > t.share_shower && t.share_shower > t.cuddle;
      })()`));

// ---------------------------------------------------------------- 9
console.log('\n9. The paired defs emit sound declaratively (moaning low/med/high by act)');
await check('masturbate/quickie/sex emit moaning at increasing intensity; share_shower emits running_water, cuddle nothing',
      api(`(() => {
        const e = (id) => ACTION_DEFS[id].emitsSignal || null;
        return e('intimacy.masturbate').signal === 'moaning'
          && e('intimacy.masturbate').intensity === SIGNALS_EMIT.moaningLow
          && e('intimacy.quickie').intensity === SIGNALS_EMIT.moaningMed
          && e('intimacy.sex').intensity === SIGNALS_EMIT.moaningHigh
          && e('intimacy.sex').intensity > e('intimacy.quickie').intensity
          && e('intimacy.share_shower').signal === 'running_water'
          && !e('intimacy.cuddle');
      })()`));

// ---------------------------------------------------------------- 10
console.log('\n10. THE MANDATORY GATE CHECK — a negative-willingness act never fires (regression)');
await check('the floors still return exactly -1 (asleep / hostile / stranger / refusing)',
      api(`(() => {
        const h = house(20261011, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, {});
        npc.activity = 'sleeping';
        const asleep = willingness(h, npc, 'player', 'sex', {}) === -1;
        npc.activity = '';
        npc.relPlayer.tension = REL_CONSEQUENCES.tensionHigh;
        const hostile = willingness(h, npc, 'player', 'sex', {}) === -1;
        const h2 = house(20261011, 2);
        const stranger = willingness(h2, Object.values(h2.npcs)[0], 'player', 'sex', {}) === -1;
        const refusing = willingness(h, npc, 'player', 'sex', { refusing: true }) === -1;
        return asleep && hostile && stranger && refusing;
      })()`));
await check('resolveWillingnessGate aborts with reason floor below the abort floor and never lets a negative score fire',
      api(`(() => {
        const h = house(20261011, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        warmNpc(npc, {});
        const open = resolveWillingnessGate(h, id, 'player', 'sex', {});
        npc.relPlayer.tension = REL_CONSEQUENCES.tensionHigh;
        const floor = resolveWillingnessGate(h, id, 'player', 'sex', {});
        const allNegative = [0, 1, 2, 3, 4, 5].map(i => resolveWillingnessGate(h, id, 'player', 'sex', { refusing: true }))
          .every(g => g.reason === 'floor' && !g.allowed);
        return open.allowed && open.willingness >= WILLINGNESS.thresholds.sex
          && floor.reason === 'floor' && floor.willingness === -1 && !floor.allowed && allNegative;
      })()`));
await check('Phase 11 introduces no bypass: the only door into an act is the willingness requirement',
      (() => {
        const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', 'srcfiles', 'defs.actions.js'), 'utf8');
        const pairedSection = src.slice(src.indexOf('intimacy.masturbate'));
        return ['intimacy.quickie', 'intimacy.sex', 'intimacy.cuddle', 'intimacy.share_shower']
          .every(id => /requires: \[[^\]]*willingness:/.test(pairedSection.slice(pairedSection.indexOf(id), pairedSection.indexOf(id) + 260)));
      })());

// ---------------------------------------------------------------- 11
console.log('\n11. Regression — the sim still runs');
await check('a full day of real resolveBatch ticks runs cleanly with the intimacy acts registered',
      api(`(() => {
        const h = house(20261011, 3);
        let gs = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                     player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
        for (let t = 0; t < 48; t++) {
          gs.meta.clock = advanceClock(gs.meta.clock, 1);
          const rb = resolveBatch(gs, 1, { advanceClock: false });
          gs = rb.state;
        }
        return typeof gs.meta.clock.day === 'number';
      })()`));
await check('every intimacy NPC effect string parses to a real effect (no silent NaN/lost lines)',
      api(`(() => {
        const ids = ['intimacy.masturbate', 'intimacy.quickie', 'intimacy.sex', 'intimacy.cuddle', 'intimacy.share_shower'];
        for (const id of ids) {
          const d = ACTION_DEFS[id];
          for (const line of [...(d.effects || []), ...(d.paired ? d.paired.npcEffects : [])]) {
            const eff = parseEffectDSL(line.replace('{target}', 'x'))[0];
            if (!eff) return false;
            if (eff.type === 'ADJUST_NEED' && isNaN(Number(eff.params.delta))) return false;
          }
        }
        return true;
      })()`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exitCode = fail ? 1 : 0;
})();
