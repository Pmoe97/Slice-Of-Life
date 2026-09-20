// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 13:
// Recognition & consequences (D43–D45, D98–D100).
//
//   node src/src/dev/verify/verify-acc-p13.js
//
// Node coverage for everything pure in this phase: the tuning dials, the
// player-bound boundary def, the recognition weight; sim.js's noteRoomSeen
// (a de-duplicated capped id list written on a change of room);
// recognitionTells / recognitionChance — a room they have been in, the
// player's own room stronger, a selfie's face, an explicit self-shot for
// someone at the intimate phase, being in the photo as certainty, tells
// OR'd and scaled by affinity, capped; recognitionRoll — seeded per (npc,
// post), an NPC who has been in the player's bedroom links a private post
// shot there at a higher rate than one who hasn't (400 exposures each), the
// identity_link fact's shape and text, no second roll once linked, no roll
// without a handle or on an NPC post; the link transmitting A→B through
// receiveTransmittedFact with its structure intact (and never posted to
// Chatter); the perception pass rolling for fresh perceivers; the
// `subscription` NOTICE subject perceived only by the creator who knows
// the handle (its opinion line names the page); $SubscriptionTalk —
// registered under boundary, a strict NPC draws the line (flags
// _playerBoundaries + the memory fact, stance 'firm'), asking again
// reaffirms, an open NPC is fine (stance warm/measured), floors first,
// deterministic across seeds; the crossing — checkPlayerBoundary on the
// creator who knows and on the gossip leg (maybeBoundaryUponFact): tension
// up, a grievance the apology leaf can answer, once per subscription; and
// the infidelity spy: applyInfidelityJealousy / applyInfidelityFootprint /
// maybeJealousUponFact are never called by any of it. Save round-trip of
// identity_link + _playerBoundaries + _roomsSeen. The ask menu row and the
// fact reaching the conversation prompt are checked on the live page
// (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.works.js', 'sim.js', 'world.js', 'signals.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'computer.js', 'works.js', 'npc.js', 'notice.js', 'flags.js', 'willingness.js',
    'relationships.js', 'image.js', 'chatter.js', 'platform.js', 'asks.js', 'tracker.js', 'state.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));
api('console.warn = () => {};');

api(`
  __mk = (seed, day, mature) => {
    const h = SIM_generateHouse(seed || 20260918, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 3, minutes: 600 }, contentConfig: { contentFlags: { mature: mature !== false } }, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.world.events = g.world.events || [];
    g.world.phone = g.world.phone || {}; g.world.phone.camera = g.world.phone.camera || { roll: [] };
    setChatterHandle(g, 'nightowl');
    return g;
  };
  __residents = (g) => Object.keys(g.npcs).filter(id => id.startsWith('npc_'));
  __warm = (g, npcId, intimate) => { const r = g.npcs[npcId].relPlayer; r.affection = 0.7; r.trust = 0.7; r.tension = 0; r.intimacyLevel = intimate ? PHASE_THRESHOLDS.intimate + 5 : 30; };
  __follow = (g, npcId) => { const c = ensureNpcChatter(g.npcs[npcId], g); c.followsPlayer = true; const p = ensureChatterProfile(g); if (!p.castFollowers.includes(npcId)) p.castFollowers.push(npcId); };
  __scroll = (g, npcId, day) => g.world.events.push({ day, tick: 5, roomId: 'living_room', npcId, type: 'scroll_phone', moodDelta: 0, data: {}, template: 'x', seenByPlayer: false });
  __ctx = (g, npcId) => ({ scene: { roomId: g.npcs[npcId].location }, activeNpcs: [], ambientNpcs: [] });
  __strict = (g, npcId) => { const t = g.npcs[npcId].bible.temperament; t.conscientiousness = 0.9; t.openness = -0.8; g.npcs[npcId].bible.deviantLevel = 0.1; };
  __open = (g, npcId) => { const t = g.npcs[npcId].bible.temperament; t.conscientiousness = -0.5; t.openness = 0.9; g.npcs[npcId].bible.deviantLevel = 0.9; };
  // the infidelity spy: count every call into relationships.js's deltas
  __spy = { n: 0 };
  for (const name of ['applyInfidelityJealousy', 'applyInfidelityFootprint', 'maybeJealousUponFact']) {
    const orig = globalThis[name];
    if (typeof orig === 'function') globalThis[name] = function (...a) { __spy.n++; return orig.apply(this, a); };
  }
  // a private self-shot post in the player's bedroom
  __selfShot = (g, day) => { g.player.location = 'bedroom_player'; g.player.clothing = 'nude'; const r = postPrivateSelfShot(g, 'hey', day); return r.post; };
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration and the dials. ${loaded.length} engine files loaded.`);
const T = J('CHATTER_PLATFORM');
check('CHATTER_PLATFORM carries the recognition tells (room < bedroom, selfie, body, featured = 1), the knowledge scale and cap, and the SubscriptionTalk weights', T.recogRoom > 0 && T.recogRoom < T.recogBedroom && T.recogSelfShot > 0 && T.recogIntimateBody > 0 && T.recogFeatured === 1 && T.recogKnowledgeBase > 0 && T.recogKnowledgeAffinity > 0 && T.recogCap < 1 && T.subscriptionTalkOpenness > 0 && T.subscriptionTalkConscientiousness > 0 && T.subscriptionTalkIntimate > 0 && T.subscriptionTalkNoise > 0, JSON.stringify(T));
check("BOUNDARY_RULE_DEFS.no_private_subscriptions is player-bound on the act subscribe_private; FLAGS_TUNING has the player-boundary tension and grievance dials; EMOTIONAL_WEIGHTS.recognition exists", J(`BOUNDARY_RULE_DEFS.no_private_subscriptions && BOUNDARY_RULE_DEFS.no_private_subscriptions.playerBound === true && BOUNDARY_RULE_DEFS.no_private_subscriptions.condition.act === 'subscribe_private' && FLAGS_TUNING.playerBoundaryTensionAtFullStrength > 0 && FLAGS_TUNING.playerBoundaryGrievanceSeverity > 0 && EMOTIONAL_WEIGHTS.recognition > EMOTIONAL_WEIGHTS.default`));
const fns = J(`['noteRoomSeen','holdsIdentityLink','identityLinkFor','recognitionTells','recognitionChance','recognitionRoll','whoKnowsPlayerHandle','resolvePlayerBoundaryViolation','applyPlayerBoundaryViolation','checkPlayerBoundary','maybeBoundaryUponFact'].filter(n => typeof globalThis[n] !== 'function')`);
check('every Phase 13 function exists', fns.length === 0, `missing: ${fns.join(', ')}`);
check('$SubscriptionTalk is registered under the boundary category as an ask; NOTICE has subscription lines in five bands', J(`ASK_CATEGORIES.find(c => c.id === 'boundary').children.some(l => l.id === 'SubscriptionTalk') && !!ASK_TYPES.SubscriptionTalk && ['strong_pos','pos','neutral','neg','strong_neg'].every(b => OPINION_LINES.subscription[b].length > 0)`));
const simSrc = fs.readFileSync(path.join(SRC, 'sim.js'), 'utf8');
check('resolveBatch writes _roomsSeen on the same change-of-room test the boundary check uses; the transmission site wires maybeBoundaryUponFact beside maybeJealousUponFact', /boundaryChecks\.push\(\{ id, roomId: update\.location \}\);\r?\n\s*\/\/[^\n]*\r?\n(\s*\/\/[^\n]*\r?\n)*\s*noteRoomSeen\(merged, update\.location\)/.test(simSrc) && /maybeBoundaryUponFact\(gameState, ft\.receiverId, ft\.fact\)/.test(simSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. noteRoomSeen and the tells (D43)');
const tells = J(`(() => {
  const out = {};
  const npc = { flags: {} };
  noteRoomSeen(npc, 'living_room'); noteRoomSeen(npc, 'living_room'); noteRoomSeen(npc, 'bedroom_player'); noteRoomSeen(npc, 'nope');
  out.rooms = npc.flags._roomsSeen;
  const g = __mk(1, 3, true); openPrivatePage(g, 3); const res = __residents(g);
  for (const id of res) { __warm(g, id, false); __follow(g, id); }
  const post = __selfShot(g, 3);
  g.npcs[res[0]].flags._roomsSeen = ['living_room', 'bedroom_player'];
  g.npcs[res[1]].flags._roomsSeen = ['living_room'];
  g.npcs[res[2]].flags._roomsSeen = [];
  out.t0 = recognitionTells(g, res[0], post).map(t => t.tell); out.c0 = recognitionChance(g, res[0], post).chance;
  out.t1 = recognitionTells(g, res[1], post).map(t => t.tell); out.c1 = recognitionChance(g, res[1], post).chance;
  out.t2 = recognitionTells(g, res[2], post).map(t => t.tell); out.c2 = recognitionChance(g, res[2], post).chance;
  __warm(g, res[2], true); out.t2i = recognitionTells(g, res[2], post).map(t => t.tell);
  // a text post has no tells; a featured photo is certainty × knowledge
  out.textTells = recognitionTells(g, res[0], { id: 'p', author: 'player', text: 'hi', media: null }).length;
  g.player.location = g.npcs[res[0]].location; g.player.clothing = 'dressed'; g.npcs[res[0]].clothing = 'dressed';
  const room = takePhoto(g, ['t']); const featured = { id: 'f', author: 'player', text: 'us', media: { kind: 'image', photo: room } };
  out.featured = recognitionTells(g, res[0], featured).map(t => t.tell + ':' + t.strength); out.featuredChance = recognitionChance(g, res[0], featured).chance;
  // knowledge scales with affinity: a cold NPC with the same tells rolls lower
  const g2 = __mk(1, 3, true); openPrivatePage(g2, 3); const r2 = __residents(g2); __follow(g2, r2[0]); g2.npcs[r2[0]].flags._roomsSeen = ['bedroom_player'];
  const post2 = __selfShot(g2, 3); out.coldChance = recognitionChance(g2, r2[0], post2).chance;
  g2.npcs[r2[0]].relPlayer.affection = 0.9; g2.npcs[r2[0]].relPlayer.trust = 0.9; out.warmChance = recognitionChance(g2, r2[0], post2).chance;
  return out;
})()`);
check('noteRoomSeen de-duplicates, ignores an unknown room id', tells.rooms.join(',') === 'living_room,bedroom_player', JSON.stringify(tells));
check("a private bedroom self-shot: the NPC who has been in the player's bedroom has room + face tells and a higher chance than one who has only seen the living room (face only), who beats one who has seen nothing; the intimate phase adds the body tell", tells.t0.includes('room') && tells.t0.includes('face') && tells.c0 > tells.c1 && tells.t1.join(',') === 'face' && tells.c1 >= tells.c2 && !tells.t2.includes('room') && tells.t2i.includes('body'), JSON.stringify(tells));
check(`a text post has no tells; being IN the photo is certainty (strength 1) × knowledge, never above recogCap (${T.recogCap}) and above every partial tell; the same tells roll lower for a cold NPC than a warm one (knowledge scale)`, tells.textTells === 0 && tells.featured.some(s => s === 'featured:1') && tells.featuredChance <= T.recogCap && tells.featuredChance > tells.c0 && tells.coldChance < tells.warmChance, JSON.stringify(tells));

// ---------------------------------------------------------------- 2
console.log('\n2. recognitionRoll — the rate difference, the identity_link fact, transmission (D43)');
const roll = J(`(() => {
  const out = {};
  const g = __mk(2, 3, true); openPrivatePage(g, 3); const res = __residents(g);
  for (const id of res) { __warm(g, id, false); __follow(g, id); }
  const post = __selfShot(g, 3);
  g.npcs[res[0]].flags._roomsSeen = ['living_room', 'bedroom_player'];
  g.npcs[res[1]].flags._roomsSeen = ['living_room'];
  let hit0 = 0, hit1 = 0; const N = 400;
  for (let i = 0; i < N; i++) {
    const fake = { ...post, id: 'fake_' + i };
    for (const [id, k] of [[res[0], 0], [res[1], 1]]) {
      const rr = recognitionRoll(g, id, fake);
      if (rr.linked && !rr.already) { if (k === 0) hit0++; else hit1++; }
      g.npcs[id].memory.facts = g.npcs[id].memory.facts.filter(f => f.kind !== 'identity_link');
    }
  }
  out.rate0 = hit0 / N; out.rate1 = hit1 / N; out.c0 = recognitionChance(g, res[0], post).chance; out.c1 = recognitionChance(g, res[1], post).chance;
  // determinism: the same (npc, post) rolls the same on a fresh state
  const a = recognitionRoll(g, res[0], { ...post, id: 'det' }).linked; g.npcs[res[0]].memory.facts = g.npcs[res[0]].memory.facts.filter(f => f.kind !== 'identity_link');
  const b = recognitionRoll(g, res[0], { ...post, id: 'det' }).linked; g.npcs[res[0]].memory.facts = g.npcs[res[0]].memory.facts.filter(f => f.kind !== 'identity_link');
  out.det = a === b;
  // a real link
  let rr = null; for (let i = 0; i < 60 && !(rr && rr.linked); i++) rr = recognitionRoll(g, res[0], { ...post, id: 'real_' + i });
  const link = identityLinkFor(g.npcs[res[0]], 'nightowl');
  out.link = link && { kind: link.kind, handle: link.handle, who: link.who, source: link.source, tag: link.emotionalTag, importance: link.importance, text: link.text, category: link.category };
  out.tell = rr && rr.tell;
  out.second = recognitionRoll(g, res[0], { ...post, id: 'after' });
  out.knows = whoKnowsPlayerHandle(g);
  // transmission A→B keeps the structure; B now knows; chatter never posts it
  g.npcs[res[1]] = receiveTransmittedFact(g.npcs[res[1]], link, { sourceId: res[0], day: 4 });
  const copy = identityLinkFor(g.npcs[res[1]], 'nightowl');
  out.copy = copy && { kind: copy.kind, handle: copy.handle, who: copy.who, provenance: copy.provenance, conf: copy.confidence };
  out.knowsAfter = whoKnowsPlayerHandle(g);
  const cand = chatterBestCandidateForDay(g, g.npcs[res[0]], res[0], 3);
  out.posted = !!(cand && cand.kind === 'fact' && cand.fact.kind === 'identity_link');
  // no roll without a handle, none on an NPC post
  const p = ensureChatterProfile(g); const h = p.handle; p.handle = ''; out.noHandle = recognitionRoll(g, res[2], post); p.handle = h;
  out.npcPost = recognitionRoll(g, res[2], { ...post, author: res[1] });
  return out;
})()`);
check(`an NPC who has been in the player's bedroom links a private post shot there at a higher rate (${(roll.rate0 * 100).toFixed(0)} % over 400 exposures, chance ${roll.c0.toFixed(3)}) than one who hasn't (${(roll.rate1 * 100).toFixed(0)} %, ${roll.c1.toFixed(3)}); the roll is deterministic per (npc, post)`, roll.rate0 > roll.rate1 * 1.5 && Math.abs(roll.rate0 - roll.c0) < 0.08 && Math.abs(roll.rate1 - roll.c1) < 0.08 && roll.det === true, JSON.stringify(roll));
check("the identity_link fact: { kind, handle, who: 'player', source: postId, emotionalTag 'recognition', significant importance, social } with a voiced line naming the tell; once linked there is no second roll", roll.link && roll.link.kind === 'identity_link' && roll.link.handle === 'nightowl' && roll.link.who === 'player' && /^real_/.test(roll.link.source) && roll.link.tag === 'recognition' && roll.link.importance === J('MEMORY_IMPORTANCE.significant') && roll.link.category === 'social' && /@nightowl on Chatter is .* — /.test(roll.link.text) && roll.second.already === true && roll.knows.length === 1, JSON.stringify(roll));
check('an identity_link transmits A→B like any fact — the copy keeps kind/handle/who at told_by provenance and hop-attenuated confidence, so B now knows too; Chatter never posts it; no roll without a handle or on an NPC post', roll.copy && roll.copy.kind === 'identity_link' && roll.copy.handle === 'nightowl' && roll.copy.who === 'player' && /told_by/.test(roll.copy.provenance) && roll.copy.conf < 1 && roll.knowsAfter.length === 2 && roll.posted === false && roll.noHandle.linked === false && roll.npcPost.linked === false, JSON.stringify(roll));

// ---------------------------------------------------------------- 3
console.log('\n3. Perception rolls, the subscription subject (D43/D44)');
const per = J(`(() => {
  const out = {};
  const g = __mk(3, 10, true); openPrivatePage(g, 10); const res = __residents(g); const p = ensureChatterProfile(g);
  for (const id of res) { __warm(g, id, false); __follow(g, id); g.npcs[id].flags._roomsSeen = ['living_room', 'bedroom_player']; ensureNpcChatter(g.npcs[id], g).subscribes = 'private'; p.private.cast.push(id); }
  __selfShot(g, 10);
  let linked = 0, day = 10;
  for (let i = 0; i < 40 && linked === 0; i++) { __selfShot(g, day); for (const id of res) __scroll(g, id, day); const r = applyPlatformPerceptionForDay(g, day + 1); linked = r.reduce((n, x) => n + x.perceivers.filter(q => q.recognized).length, 0); day++; }
  out.linkedViaPerception = linked; out.knows = whoKnowsPlayerHandle(g).length;
  // the subscription subject: perceived by the creator only if they know the handle
  const creator = res[0]; g.npcs[creator].bible.creator = { active: true, kinds: ['lifestyle'], privateOpen: true, backersPrice: 4, privatePrice: 12, blocksPlayer: false };
  const knew = holdsIdentityLink(g.npcs[creator], 'nightowl');
  g.npcs[creator].memory.facts = g.npcs[creator].memory.facts.filter(f => f.kind !== 'identity_link');
  const s1 = subscribeToNpc(g, creator, 'backers', day); out.unknown = s1.noticed.perceivers.length;
  g.npcs[creator] = addMemoryFact(g.npcs[creator], { kind: 'identity_link', handle: 'nightowl', who: 'player', text: 'x', day, importance: 0.8, category: 'social' });
  const s2 = subscribeToNpc(g, creator, 'private', day);
  out.known = s2.noticed.perceivers.map(q => ({ id: q.npcId, via: q.via, text: q.text }));
  const fact = g.npcs[creator].memory.facts.find(f => f.kind === 'opinion' && f.subject && f.subject.kind === 'subscription');
  out.fact = fact && { key: fact.subject.key, text: fact.text, category: fact.category };
  out.otherHolds = holdsOpinionOn(g.npcs[res[1]], 'subscription:' + creator + ':private');
  return out;
})()`);
check('the rollover perception pass rolls recognition for each fresh perceiver (a following Private subscriber who scrolled links the bedroom self-shot within a few days)', per.linkedViaPerception >= 1 && per.knows >= 1, JSON.stringify(per));
check("a subscription is a NOTICE subject perceived only by the creator who knows the handle (via platform): an opinion fact 'the player pays for @handle's Chatter Private page' keyed subscription:<npc>:<tier>; nobody else holds it", per.unknown === 0 && per.known.length === 1 && per.known[0].via === 'platform' && per.fact && /^subscription:/.test(per.fact.key) && /Chatter Private page/.test(per.fact.text) && per.fact.category === 'social' && per.otherHolds === false, JSON.stringify(per));

// ---------------------------------------------------------------- 4
console.log('\n4. $SubscriptionTalk — a boundary, never infidelity (D45)');
const talk = J(`(() => {
  const out = {};
  const g = __mk(4, 3, true); const res = __residents(g); __spy.n = 0;
  for (const id of res) __warm(g, id, true);
  __strict(g, res[0]); __open(g, res[1]);
  const t1 = resolveAsk(g, res[0], 'SubscriptionTalk', 'is that okay?', __ctx(g, res[0])); t1.applyEffects();
  out.strict = { d: t1.decision, stance: t1.stance, phrase: t1.reasonPhrase, flags: g.npcs[res[0]].flags._playerBoundaries, fact: (g.npcs[res[0]].memory.facts || []).some(f => /asked them not to/.test(f.text)) };
  const t1b = resolveAsk(g, res[0], 'SubscriptionTalk', '', __ctx(g, res[0])); t1b.applyEffects();
  out.again = { d: t1b.decision, stance: t1b.stance, flags: g.npcs[res[0]].flags._playerBoundaries.length };
  const t2 = resolveAsk(g, res[1], 'SubscriptionTalk', '', __ctx(g, res[1])); t2.applyEffects();
  out.open = { d: t2.decision, stance: t2.stance, flags: g.npcs[res[1]].flags._playerBoundaries || null, fact: (g.npcs[res[1]].memory.facts || []).some(f => /fine with it/.test(f.text)) };
  // an intimate partner is stricter than the same person as an acquaintance
  const g2 = __mk(4, 3, true); const r2 = __residents(g2); __warm(g2, r2[1], false); __open(g2, r2[1]);
  out.acqScore = resolveAsk(g2, r2[1], 'SubscriptionTalk', '', __ctx(g2, r2[1])).decision.score; out.intimateScore = t2.decision.score;
  // floors first
  g.npcs[res[2]].asleep = true; g.npcs[res[2]].activity = 'sleeping'; out.asleep = resolveAsk(g, res[2], 'SubscriptionTalk', '', __ctx(g, res[2])).decision.reason;
  // deterministic across a fresh state
  const g3 = __mk(4, 3, true); const r3 = __residents(g3); for (const id of r3) __warm(g3, id, true); __strict(g3, r3[0]); __open(g3, r3[1]);
  out.det = resolveAsk(g3, r3[0], 'SubscriptionTalk', 'is that okay?', __ctx(g3, r3[0])).decision.reason === t1.decision.reason && resolveAsk(g3, r3[1], 'SubscriptionTalk', '', __ctx(g3, r3[1])).decision.reason === t2.decision.reason;
  out.spy = __spy.n;
  out.castWeb = JSON.stringify(g.world.castWeb || null);
  return out;
})()`);
check("a strict NPC (conscientious, closed, prim, intimate) draws the line: subscription_boundary, stance 'firm', the _playerBoundaries flag + a memory fact; asking again reaffirms (boundary_already, one flag)", talk.strict.d.reason === 'subscription_boundary' && talk.strict.d.accept === false && talk.strict.stance === 'firm' && /asking you not to/.test(talk.strict.phrase) && talk.strict.flags.length === 1 && talk.strict.flags[0].id === 'no_private_subscriptions' && talk.strict.fact === true && talk.again.d.reason === 'boundary_already' && talk.again.flags === 1, JSON.stringify(talk));
check("an open NPC is fine (subscription_fine, a warm/measured stance, a memory fact, no flag); the same open person at the intimate phase scores lower than as an acquaintance; a sleeping target hits the floor first; deterministic across a fresh state", talk.open.d.reason === 'subscription_fine' && talk.open.d.accept === true && ['warm', 'measured'].includes(talk.open.stance) && talk.open.fact === true && talk.open.flags === null && talk.intimateScore < talk.acqScore && talk.asleep === 'floor_asleep' && talk.det === true, JSON.stringify(talk));
check('none of it touched relationships.js: applyInfidelityJealousy / applyInfidelityFootprint / maybeJealousUponFact were never called (spy 0)', talk.spy === 0, `spy=${talk.spy}`);

// ---------------------------------------------------------------- 5
console.log('\n5. The crossing — through NOTICE and through gossip, once (D45)');
const cross = J(`(() => {
  const out = {};
  const g = __mk(5, 3, true); const res = __residents(g); __spy.n = 0;
  for (const id of res) __warm(g, id, true);
  // res[0] is a creator who KNOWS the handle and drew the line: subscribing to their page crosses it at once
  const creator = res[0]; g.npcs[creator].bible.creator = { active: true, kinds: ['lifestyle'], privateOpen: true, backersPrice: 4, privatePrice: 12, blocksPlayer: false };
  g.npcs[creator] = addMemoryFact(g.npcs[creator], { kind: 'identity_link', handle: 'nightowl', who: 'player', text: 'x', day: 3, importance: 0.8, category: 'social' });
  __strict(g, creator); const talk = resolveAsk(g, creator, 'SubscriptionTalk', '', __ctx(g, creator)); talk.applyEffects();
  out.line = talk.decision.reason;
  const t0 = g.npcs[creator].relPlayer.tension; const gr0 = g.npcs[creator].relPlayer.grievances.length;
  const s = subscribeToNpc(g, creator, 'private', 4);
  out.direct = { perceived: s.noticed.perceivers.length, tension: [t0, g.npcs[creator].relPlayer.tension], grievances: [gr0, g.npcs[creator].relPlayer.grievances.length], gtext: g.npcs[creator].relPlayer.grievances.slice(-1)[0] && g.npcs[creator].relPlayer.grievances.slice(-1)[0].text, reacted: g.npcs[creator].flags._playerBoundaryReacted };
  // a second learning of the same subscription is not a second crossing
  const fact = g.npcs[creator].memory.facts.find(f => f.kind === 'opinion' && f.subject && f.subject.kind === 'subscription');
  out.again = maybeBoundaryUponFact(g, creator, fact) === null && g.npcs[creator].relPlayer.grievances.length === out.direct.grievances[1];
  // res[1] drew the line too and learns by gossip
  const partner = res[1]; __strict(g, partner); const t2 = resolveAsk(g, partner, 'SubscriptionTalk', '', __ctx(g, partner)); t2.applyEffects();
  const pt0 = g.npcs[partner].relPlayer.tension;
  g.npcs[partner] = receiveTransmittedFact(g.npcs[partner], fact, { sourceId: creator, day: 5 });
  const crossed = maybeBoundaryUponFact(g, partner, fact);
  out.gossip = { line: t2.decision.reason, crossed: !!crossed, keys: crossed && Object.keys(crossed), tension: [pt0, g.npcs[partner].relPlayer.tension], grievances: g.npcs[partner].relPlayer.grievances.length, again: maybeBoundaryUponFact(g, partner, fact) === null };
  // an NPC who never drew a line is untouched by the same fact; a Backers subscription never crosses
  const other = res[2]; const ot0 = g.npcs[other].relPlayer.tension; g.npcs[other] = receiveTransmittedFact(g.npcs[other], fact, { sourceId: creator, day: 5 });
  out.noLine = maybeBoundaryUponFact(g, other, fact) === null && g.npcs[other].relPlayer.tension === ot0;
  out.backers = checkPlayerBoundary(g, partner, { act: 'subscribe_backers', subjectKey: 'subscription:x:backers' }).violation === null;
  // the apology leaf can answer the grievance
  const ap = resolveAsk(g, partner, 'Apologize', '', __ctx(g, partner)); out.apology = ap.decision.reason;
  out.spy = __spy.n;
  return out;
})()`);
check('subscribing to a creator who knows the handle AND drew the line crosses it at once: tension up, a grievance ("agreed to … and then crossed it anyway"), reacted-key recorded; learning the same subscription again is not a second crossing', cross.line === 'subscription_boundary' && cross.direct.perceived === 1 && cross.direct.tension[1] > cross.direct.tension[0] && cross.direct.grievances[1] === cross.direct.grievances[0] + 1 && /crossed it anyway/.test(cross.direct.gtext) && cross.direct.reacted.length === 1 && cross.again === true, JSON.stringify(cross));
check('the gossip leg: a partner who drew the line learns the subscription by transmitted fact → maybeBoundaryUponFact crosses it (tension up, a grievance, the merge fields returned), once; an NPC with no line is untouched; a Backers subscription never crosses; the apology leaf sees the grievance', cross.gossip.line === 'subscription_boundary' && cross.gossip.crossed === true && cross.gossip.keys.join(',') === 'relPlayer,flags,memory' && cross.gossip.tension[1] > cross.gossip.tension[0] && cross.gossip.grievances === 1 && cross.gossip.again === true && cross.noLine === true && cross.backers === true && cross.apology === 'apology_sincere', JSON.stringify(cross));
check('still no infidelity call anywhere in the crossing path (spy 0)', cross.spy === 0, `spy=${cross.spy}`);

// ---------------------------------------------------------------- 6
console.log('\n6. Save round-trip — identity_link, _playerBoundaries, _roomsSeen');
const persist = J(`(() => {
  const g = __mk(6, 3, true); const res = __residents(g);
  g.npcs[res[0]] = addMemoryFact(g.npcs[res[0]], { kind: 'identity_link', handle: 'nightowl', who: 'player', source: 'post_9', text: 'sure of it', day: 3, importance: 0.8, category: 'social', emotionalTag: 'recognition' });
  g.npcs[res[0]].flags._playerBoundaries = [{ id: 'no_private_subscriptions', setDay: 3 }];
  noteRoomSeen(g.npcs[res[0]], 'bedroom_player');
  const payload = captureSavePayload(g);
  const rt = JSON.parse(JSON.stringify(payload));
  const n = rt.npcs[res[0]];
  return { link: holdsIdentityLink(n, 'nightowl'), source: identityLinkFor(n, 'nightowl').source, bounds: n.flags._playerBoundaries, rooms: n.flags._roomsSeen };
})()`);
check('captureSavePayload → JSON keeps the identity_link (with its source), _playerBoundaries and _roomsSeen on the npc record', persist.link === true && persist.source === 'post_9' && persist.bounds.length === 1 && persist.rooms.includes('bedroom_player'), JSON.stringify(persist));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
