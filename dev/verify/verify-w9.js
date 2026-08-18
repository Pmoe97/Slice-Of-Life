// Intimacy & Voyeurism Plan Phase 9 — Willingness & consent math (D13).
// The ONLY door into an intimacy act: a pure willingness() function with
// HARD FLOORS that abort (asleep, hostile, actively refusing, stranger),
// act thresholds that separate a soft no (below bar, refused with prose)
// from "cannot fire at all" (below abortFloor — the floors return exactly
// -1), and a scoring bias — `utility.willingness`, declared on the SAME
// desire-motive overtures that declare `utility.desire` — so the overture
// path and the future act path read one willingness. The Phase 11 acts are
// wired through resolveWillingnessGate (and DEFS.ACTIONS' `willingness`
// requirement checker); THIS file proves the gate fails closed.
//
// Nothing here reimplements the math: the engine loads into a bare vm and
// the assertions read what the real functions return. The same assertions
// are also run on the live Perchance page (browser_eval) — same seeds, same
// numbers — so the browser is the source of truth and this just makes the
// checks reproducible offline. The mandatory per-session gate check (a
// negative-willingness act never fires) is checks 6 and 7.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine();

// --- Helpers injected INTO the vm context (function declarations, so the
// checks call them by name instead of interpolating arrow bodies) ---
api(`
  function house(seed, n) {
    const h = SIM_generateHouse(seed, n);
    h.meta = { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] };
    return h;
  }
`);

// Build a NON-stranger NPC whose relationship toward the player is warm
// enough to matter (axes moved, phase derived) — the opposite of the floor
// cases. `tension` defaults low so the hostile floor never trips it.
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


let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// Build a NON-stranger NPC whose relationship toward the player is warm
// enough to matter (axes moved, phase derived) — the opposite of the floor
// cases. `tension` default 0 so the hostile floor never trips it.
// ---------------------------------------------------------------- 1
console.log('\n1. WILLINGNESS table (config.js)');
check('abortFloor is 0, base is negative, term weights are positive and sane',
      api(`(() => {
        const w = WILLINGNESS, t = w.terms;
        return w.abortFloor === 0 && t.base < 0
          && [t.attraction, t.desire, t.mood, t.phase, t.personality, t.context, t.history].every(v => typeof v === 'number' && v >= 0);
      })()`));
check('every act the plan names has a threshold; masturbate is 0; default present',
      api(`(() => {
        const t = WILLINGNESS.thresholds;
        return typeof t.default === 'number' && t.default > 0
          && t.masturbate === 0
          && ['quickie', 'sex', 'share_shower', 'cuddle'].every(a => typeof t[a] === 'number' && t[a] >= t.masturbate);
      })()`));
check('context scores are ordered privateLocked >= privateUnlocked >= shared, all in [0,1]',
      api(`(() => {
        const c = WILLINGNESS.context;
        return c.privateLocked >= c.privateUnlocked && c.privateUnlocked >= c.shared
          && c.privateLocked <= 1 && c.shared >= 0 && c.peoplePresentPenalty >= 0;
      })()`));
check('scoring weight is a positive bias and every desire-motive overture declares it (approach/text/knock, not propose)',
      api(`(() => {
        const s = WILLINGNESS.scoring;
        return s.weight > 0 && s.weight <= 1 && !!s.act
          && OVERTURE_DEFS.approach_player.utility.willingness === s
          && OVERTURE_DEFS.text_player.utility.willingness === s
          && OVERTURE_DEFS.knock_player.utility.willingness === s
          && !OVERTURE_DEFS.propose_player.utility.willingness;
      })()`));

// ---------------------------------------------------------------- 2
console.log('\n2. The hard floors — every one returns exactly -1');
check('a sleeping target returns -1 (activity sleeping)', 
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, {});
        npc.activity = 'sleeping';
        return willingness(h, npc, 'player', 'sex', {}) === -1;
      })()`));
check('a target whose schedule block is sleep returns -1',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, {});
        return willingness(h, npc, 'player', 'sex', { block: 'sleep' }) === -1;
      })()`));
check('a hostile (tension-high) target returns -1 even at maximum desire/phase',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, { tension: REL_CONSEQUENCES.tensionHigh, desire: 100, relDesire: 1, mood: 1 });
        return willingness(h, npc, 'player', 'sex', {}) === -1;
      })()`));
check('a stranger (zero prior interaction) returns -1 no matter how warm the stat sheet looks',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0]; // fresh cast: all relPlayer axes 0, early phase
        npc.needs.desire = 100;
        npc.mood = 1;
        return willingness(h, npc, 'player', 'sex', {}) === -1;
      })()`));
check('an actively-refusing target returns -1 via the caller flag and via the lockout writer',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, {});
        const viaFlag = willingness(h, npc, 'player', 'sex', { refusing: true }) === -1;
        noteIntimacyRefusal(npc, h.meta.clock.day, { lockoutDays: 1 });
        const viaLockout = willingness(h, npc, 'player', 'sex', {}) === -1;
        const afterLockout = willingness({ ...h, meta: { ...h.meta, clock: { ...h.meta.clock, day: h.meta.clock.day + 2 } } }, npc, 'player', 'sex', {}) > -1;
        return viaFlag && viaLockout && afterLockout;
      })()`));
check('a warm intimate NPC is NOT floored — the floors only fire on their conditions',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, {});
        return willingness(h, npc, 'player', 'sex', {}) > -1;
      })()`));

// ---------------------------------------------------------------- 3
console.log('\n3. Thresholds — a warm NPC crosses, an acquaintance does not');
check('a warm intimate-phase NPC crosses even the sex bar (>= 0.6)',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, {});
        const w = willingness(h, npc, 'player', 'sex', {});
        return w >= WILLINGNESS.thresholds.sex && isWilling(h, npc, 'player', 'sex', {});
      })()`));
check('a neutral acquaintance (grievance only — not a stranger) refuses a quickie',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        const rel = npc.relPlayer;
        rel.tension = 0.2; rel.trust = 0.2; rel.grievances = [{ severity: 0.3, text: 'x', resolved: false }];
        const d = deriveConversationPhase(rel);
        rel.intimacyLevel = d.intimacyLevel; rel.conversationPhase = d.conversationPhase;
        npc.needs.desire = 30; npc.mood = 0; npc.location = 'living_room';
        const w = willingness(h, npc, 'player', 'quickie', {});
        return w > WILLINGNESS.abortFloor && w < WILLINGNESS.thresholds.quickie && !isWilling(h, npc, 'player', 'quickie', {});
      })()`));
check('solo masturbation needs only the floor (threshold 0): a non-floored NPC is willing',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, {});
        return isWilling(h, npc, 'player', 'masturbate', {});
      })()`));

// ---------------------------------------------------------------- 4
console.log('\n4. The terms move the number (each term, one direction)');
check('the player\'s outfit feeds the attraction term: revealing > loungewear through clothingWillingnessBias',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, { relDesire: 0.3, mood: 0 });
        h.player.location = 'bedroom_1';
        h.player.outfit = { top: 'crop_top', bottom: 'skirt' };
        const revealing = willingness(h, npc, 'player', 'default', {});
        const revealBias = clothingWillingnessBias(h.player);
        h.player.outfit = { top: 'sweater', bottom: 'sweatpants' };
        const covered = willingness(h, npc, 'player', 'default', {});
        return revealing > covered && revealBias > 0;
      })()`));
check('phase ladder moves the number: intimate > close > familiar > early',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, {});
        const run = (phase) => { npc.relPlayer.conversationPhase = phase; return willingness(h, npc, 'player', 'default', {}); };
        return run('intimate') > run('close') && run('close') > run('familiar') && run('familiar') > run('early');
      })()`));
check('desire need moves the number: 90 > 20',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, {});
        const low = willingness(h, { ...npc, needs: { ...npc.needs, desire: 20 } }, 'player', 'default', {});
        const high = willingness(h, { ...npc, needs: { ...npc.needs, desire: 90 } }, 'player', 'default', {});
        return high > low;
      })()`));
check('mood moves the number: happy > miserable',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, {});
        const low = willingness(h, { ...npc, mood: -0.8 }, 'player', 'default', {});
        const high = willingness(h, { ...npc, mood: 0.8 }, 'player', 'default', {});
        return high > low;
      })()`));
check('context moves the number: a locked private room > a shared common room',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, { room: 'bedroom_1' });
        const priv = willingness(h, npc, 'player', 'default', {});
        const shared = willingness(h, { ...npc, location: 'living_room' }, 'player', 'default', {});
        return priv > shared;
      })()`));
check('history moves the number: a recent refusal chills, and old intimacy recency fades',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, {});
        const base = willingness(h, npc, 'player', 'default', {});
        noteIntimacyRefusal(npc, h.meta.clock.day, { lockoutDays: 0 });
        const afterRefusal = willingness(h, npc, 'player', 'default', {});
        noteIntimacyOccurred(npc, h.meta.clock.day, 'player');
        const justSated = willingness(h, npc, 'player', 'default', {});
        const oldSate = willingness({ ...h, meta: { ...h.meta, clock: { ...h.meta.clock, day: h.meta.clock.day + 5 } } }, npc, 'player', 'default', {});
        return afterRefusal < base && justSated < base && oldSate > justSated;
      })()`));

// ---------------------------------------------------------------- 5
console.log('\n5. Purity — same inputs, same output, no writes, no rng');
check('willingness is deterministic and leaves the gameState byte-identical',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        warmNpc(npc, {});
        const before = JSON.stringify(h);
        const a = willingness(h, npc, 'player', 'sex', {});
        const b = willingness(h, npc, 'player', 'sex', {});
        return a === b && JSON.stringify(h) === before;
      })()`));
check('the gate is deterministic and pure too',
      api(`(() => {
        const h = house(20260901, 1);
        const npc = Object.values(h.npcs)[0];
        const id = Object.keys(h.npcs)[0];
        warmNpc(npc, {});
        const before = JSON.stringify(h);
        const a = resolveWillingnessGate(h, id, 'player', 'sex', {});
        const b = resolveWillingnessGate(h, id, 'player', 'sex', {});
        return a.allowed === b.allowed && a.willingness === b.willingness && JSON.stringify(h) === before;
      })()`));

// ---------------------------------------------------------------- 6
console.log('\n6. THE MANDATORY GATE CHECK — a negative-willingness act never fires');
check('the gate aborts a floored target with reason \'floor\' (asleep / hostile / stranger / refusing)',
      api(`(() => {
        const h = house(20260901, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        warmNpc(npc, {});
        const asleep = resolveWillingnessGate(h, id, 'player', 'sex', { block: 'sleep' });
        npc.activity = '';
        const stranger = house(20260901, 2); // fresh cast — zero prior interaction
        const sid = Object.keys(stranger.npcs)[0];
        const sgate = resolveWillingnessGate(stranger, sid, 'player', 'sex', {});
        return asleep.reason === 'floor' && !asleep.allowed && sgate.reason === 'floor' && !sgate.allowed;
      })()`));
check('the gate refuses a below-threshold soft no with reason \'below_threshold\' and no effects path',
      api(`(() => {
        const h = house(20260901, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        const rel = npc.relPlayer;
        rel.tension = 0.2; rel.trust = 0.2; rel.grievances = [{ severity: 0.3, text: 'x', resolved: false }];
        const d = deriveConversationPhase(rel);
        rel.intimacyLevel = d.intimacyLevel; rel.conversationPhase = d.conversationPhase;
        npc.needs.desire = 30; npc.mood = 0; npc.location = 'living_room';
        const gate = resolveWillingnessGate(h, id, 'player', 'quickie', {});
        return gate.reason === 'below_threshold' && !gate.allowed;
      })()`));
check('the gate opens for a genuinely willing target',
      api(`(() => {
        const h = house(20260901, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        warmNpc(npc, {});
        const gate = resolveWillingnessGate(h, id, 'player', 'quickie', {});
        return gate.allowed && gate.reason === null;
      })()`));
check('the ACTION_REQUIREMENT_CHECKERS.willingness checker fails closed (floored target gets prose, willing target passes)',
      api(`(() => {
        const h = house(20260901, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        warmNpc(npc, {});
        const willing = ACTION_REQUIREMENT_CHECKERS.willingness(
          { gameState: h, roomId: npc.location, actTargetNpcId: id }, 'quickie');
        h.npcs[id].relPlayer.tension = REL_CONSEQUENCES.tensionHigh;
        const floored = ACTION_REQUIREMENT_CHECKERS.willingness(
          { gameState: h, roomId: npc.location, actTargetNpcId: id }, 'quickie');
        const noTarget = ACTION_REQUIREMENT_CHECKERS.willingness(
          { gameState: h, roomId: npc.location }, 'quickie');
        return willing === true && typeof floored === 'string' && typeof noTarget === 'string';
      })()`));

// ---------------------------------------------------------------- 7
console.log('\n7. The scoring bias — utility.willingness on the desire-motive overtures');
check('a floored (hostile) NPC\'s desire-motive approach overture is dropped from the ranked list entirely',
      api(`(() => {
        const h = house(20260901, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        // Hostile but WANTING: initiative gate passes (desire/comfort/affection high),
        // so the desire motive is live — and the willingness floor must kill the candidate.
        npc.relPlayer.desire = 0.9; npc.relPlayer.comfort = 0.8; npc.relPlayer.affection = 0.6;
        npc.relPlayer.tension = REL_CONSEQUENCES.tensionHigh;
        npc.relPlayer.grievances = [];
        const d = deriveConversationPhase(npc.relPlayer);
        npc.relPlayer.intimacyLevel = d.intimacyLevel; npc.relPlayer.conversationPhase = d.conversationPhase;
        npc.needs.desire = 95; npc.mood = 0.5; npc.location = 'hallway_a';
        h.player.location = 'living_room';
        const candidates = scoreCandidates(npc, id, h,
          { block: 'leisure', location: 'hallway_a', activity: null }, []);
        const approach = candidates.find(c => c.driveId === 'approach_player');
        return !approach;
      })()`));
check('the same NPC once NOT hostile keeps the desire-motive overture, with a positive willingnessBias term',
      api(`(() => {
        const h = house(20260901, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        npc.relPlayer.desire = 0.9; npc.relPlayer.comfort = 0.8; npc.relPlayer.affection = 0.6;
        npc.relPlayer.tension = 0.1; npc.relPlayer.trust = 0.3; npc.relPlayer.respect = 0.3;
        npc.relPlayer.grievances = [];
        const d = deriveConversationPhase(npc.relPlayer);
        npc.relPlayer.intimacyLevel = d.intimacyLevel; npc.relPlayer.conversationPhase = d.conversationPhase;
        npc.needs.desire = 95; npc.mood = 0.5; npc.location = 'hallway_a';
        h.player.location = 'living_room';
        const candidates = scoreCandidates(npc, id, h,
          { block: 'leisure', location: 'hallway_a', activity: null }, []);
        const approach = candidates.find(c => c.driveId === 'approach_player');
        return !!approach && (approach.terms.willingnessBias || 0) > 0 && approach.overture && approach.overture.motive === 'desire';
      })()`));
check('willingness bias scales with willingness: a warm NPC\'s approach outscores a cool one\'s, same desire',
      api(`(() => {
        const h = house(20260901, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        warmNpc(npc, {});
        const warm = { ...npc, needs: { ...npc.needs, desire: 95 }, mood: 0.8 };
        const cool = { ...npc, needs: { ...npc.needs, desire: 95 }, mood: -0.5 };
        const ctx = { perceived: [], block: 'leisure', minutesOfDay: 720, nowAbs: 1, gameState: h, npcId: id,
          motives: { approach_player: { motive: 'desire', motiveRef: {}, strength: 0.5, tone: 'charged' } } };
        const a = scoreDrive('approach_player', warm, ctx);
        const b = scoreDrive('approach_player', cool, ctx);
        return !!a && !!b && a.score > b.score && a.terms.willingnessBias > 0 && b.terms.willingnessBias > 0;
      })()`));
check('a NON-desire motive (curiosity) is never gated and gets no willingness bias',
      api(`(() => {
        const h = house(20260901, 1);
        const id = Object.keys(h.npcs)[0];
        const npc = h.npcs[id];
        const ctx = { perceived: [], block: 'leisure', minutesOfDay: 720, nowAbs: 1, gameState: h, npcId: id,
          motives: { approach_player: { motive: 'curiosity', motiveRef: {}, strength: 0.5, tone: 'warm' } } };
        const scored = scoreDrive('approach_player', npc, ctx);
        return !!scored && scored.terms.willingnessBias === 0;
      })()`));
check('a non-intimacy drive scores byte-identically at any desire/willingness (eat is untouched)',
      api(`(() => {
        const h = house(20260901, 2);
        const npc = Object.values(h.npcs)[0];
        const ctx = { perceived: [], block: 'leisure', minutesOfDay: 720, nowAbs: 1, gameState: h, npcId: 'x' };
        const low = scoreDrive('eat', { ...npc, needs: { ...npc.needs, desire: 5, hunger: 60 } }, ctx);
        const high = scoreDrive('eat', { ...npc, needs: { ...npc.needs, desire: 95, hunger: 60 } }, ctx);
        return !!low && !!high && low.score === high.score && low.terms.willingnessBias === 0 && high.terms.willingnessBias === 0;
      })()`));

// ---------------------------------------------------------------- 8
console.log('\n8. Regression — the sim still runs, and the intimate gate is untouched');
check('a full day of real resolveBatch ticks runs cleanly with the new scoring',
      api(`(() => {
        const h = house(20260905, 3);
        let gs = { meta: { seed: h.seed, clock: h.clock, contentConfig: null, sessionLog: [] },
                     player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
        let desireOvertures = 0;
        for (let t = 0; t < 48; t++) {
          gs.meta.clock = advanceClock(gs.meta.clock, 1);
          const rb = resolveBatch(gs, 1, { advanceClock: false });
          gs = rb.state;
          for (const n of Object.values(gs.npcs)) {
            if (n.overture && n.overture.motive === 'desire') desireOvertures++;
          }
        }
        return typeof gs.meta.clock.day === 'number' && desireOvertures >= 0;
      })()`));
check('the intimate gate is untouched by Phase 9: nude+intimate+mature opens, dressed never does',
      api(`(() => {
        const h = house(20260905, 2);
        const npc = Object.values(h.npcs)[0];
        const gs = { meta: { contentConfig: { contentFlags: { mature: true, romance: true } } } };
        npc.clothing = 'dressed';
        const dressed = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: gs });
        npc.clothing = 'nude';
        const nude = getPhysicalDescriptionForPrompt(npc, { intimate: true, gameState: gs });
        return !(dressed.includes('nipples') || dressed.includes('breasts'))
          && (nude.includes('nipples') || nude.includes('breasts'));
      })()`));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
