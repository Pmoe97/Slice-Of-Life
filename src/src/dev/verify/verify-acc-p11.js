// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 11: Chatter
// Private (D31–D35, D37, D41, D92–D94).
//
//   node src/src/dev/verify/verify-acc-p11.js
//
// Node coverage for everything pure in this phase: the tuning block; the
// page's gate — with mature:false canOpenPrivatePage/openPrivatePage refuse,
// with it on they need a handle, open once, and refuse a second open; the
// private self-shot — takePhoto with the player as the only subject, the
// intimate layer in the prompt ONLY when the mature flag is on and the
// player is in a naked state (the gate closed degrades to the plain clause,
// exactly as peek does), `level` stamped on every record (a plain camera
// shot of a naked housemate is 'intimate' content); postPrivateSelfShot
// posting private with the photo; D32's convPrivate(cadence) — 0 with
// nothing posted, the floor with only old posts, the full rate at the
// target cadence, the D91 price term; the cast Private decision (page
// closed / not following / blocked / no slot / already private → 0;
// disinhibition scaling; an upgrade from Backers keeps the slot);
// derivePrivateSubscribers (ghosts = floor(followers × conv), a blocked
// subscriber lapses and the slot returns, the page closing empties the
// pools) and the bill summing both tiers; visibility — a private post
// invisible to a following-but-unsubscribed NPC, visible to a subscriber;
// perception — only the subscriber who scrolled holds the chatter_private
// opinion; the $Feature leaf — registered under photos, picker-first,
// unavailable with no photo of them, the consent fact on accept (posting
// the photo refused before, allowed after), a refusal final for that
// photo, the asleep and hostile floors refusing with ASK_INTIMACY's own
// reason strings, the intimate tier reading the willingness bar and the
// lifestyle tier the hangout score; blocked NPCs can neither follow nor
// subscribe; and a save round-trip of private.open/openedDay, the consent
// fact and a photo's level. The opt-in modal, the Private page, the
// composer's photo select and the self-shot chip are verified on the live
// page (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.works.js', 'sim.js', 'world.js', 'signals.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'computer.js', 'works.js', 'npc.js', 'notice.js', 'willingness.js', 'image.js',
    'chatter.js', 'platform.js', 'asks.js', 'tracker.js', 'state.js'],
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
    setChatterHandle(g, 'tester');
    return g;
  };
  __residents = (g) => Object.keys(g.npcs).filter(id => id.startsWith('npc_'));
  __follow = (g, npcId) => { const c = ensureNpcChatter(g.npcs[npcId], g); c.followsPlayer = true; const p = ensureChatterProfile(g); if (!p.castFollowers.includes(npcId)) p.castFollowers.push(npcId); };
  __warm = (g, npcId) => { g.npcs[npcId].relPlayer.affection = 0.9; g.npcs[npcId].relPlayer.trust = 0.9; g.npcs[npcId].relPlayer.tension = 0; };
  __scroll = (g, npcId, day) => g.world.events.push({ day, tick: 5, roomId: 'living_room', npcId, type: 'scroll_phone', moodDelta: 0, data: {}, template: '{name} scrolled through their phone for a while.', seenByPlayer: false });
  __slots = (g, npcId, n) => { g.npcs[npcId].bible.occupation = { ...(g.npcs[npcId].bible.occupation || {}), incomeBand: n >= 3 ? 'high' : n >= 1 ? 'mid' : 'low', spendingLean: n >= 4 ? 'free_spender' : n >= 2 ? 'neutral' : 'frugal' }; };
  __ctxFor = (g, npcId) => ({ scene: { roomId: g.npcs[npcId].location }, activeNpcs: [], ambientNpcs: [] });
  __intimateRx = /areolae|labia|penis|testicles|nipples/;
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration and the tuning block. ${loaded.length} engine files loaded.`);
const T = J('CHATTER_PLATFORM');
check('CHATTER_PLATFORM carries the Private dials (convPrivate, cadence window/target/floor, privateBase/AffinityFloor/Affinity/Disinhibition, featureDisinhibition)', T.convPrivate > 0 && T.privateCadenceWindowDays > 0 && T.privateCadenceTarget > 0 && T.privateCadenceFloor > 0 && T.privateCadenceFloor < 1 && T.privateBase > 0 && T.privateAffinityFloor > 0 && T.privateAffinity > 0 && T.privateDisinhibition > 0 && T.featureDisinhibition > 0, JSON.stringify(T));
const fns = J(`['canOpenPrivatePage','openPrivatePage','privatePosts','privateCadenceFactor','castPrivateDecision','derivePrivateSubscribers','featureConsentFor','hasFeatureConsent','buildFeatureConsentFact','photoSubjectsWithoutConsent','photoContentLevel','takePrivateSelfShot','postPrivateSelfShot','featurablePhotosFor'].filter(n => typeof globalThis[n] !== 'function')`);
check('every Phase 11 function exists', fns.length === 0, `missing: ${fns.join(', ')}`);
check('$Feature is registered under the photos category, picker-first (feature: true), and resolves as an ask (in ASK_TYPES, not the share map)', J(`ASK_CATEGORIES.find(c => c.id === 'photos').children.some(l => l.id === 'Feature' && l.feature === true) && !!ASK_TYPES.Feature && !ASK_SHARE_TYPES.Feature`));
check('the social_feed app has a private screen (hidden from nav) with the chatter-private renderer', J(`APP_DEFS.social_feed.screens.private && APP_DEFS.social_feed.screens.private.renderer === 'chatter-private' && APP_DEFS.social_feed.screens.private.hideFromNav === true`));
check("NOTICE has chatter_private opinion lines in all five bands", J(`['strong_pos','pos','neutral','neg','strong_neg'].every(b => Array.isArray(OPINION_LINES.chatter_private[b]) && OPINION_LINES.chatter_private[b].length > 0)`));
const imgSrc = fs.readFileSync(path.join(SRC, 'image.js'), 'utf8');
check('image.js adds no new gate function — takePhoto/buildPhotoPrompt reach the intimate layer only through buildVisualCharacterClause + intimateAllowed (D31)', !/function\s+\w*[Pp]rivate\w*[Gg]ate|function\s+privateAllowed/.test(imgSrc) && /intimate: !!opts\.intimate/.test(imgSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. The page behind the mature flag and an opt-in (D31)');
const gate = J(`(() => {
  const out = {};
  const off = __mk(1, 3, false);
  out.offCan = canOpenPrivatePage(off); out.offOpen = openPrivatePage(off, 3); out.offFlag = ensureChatterProfile(off).private.open;
  out.offSelfShot = postPrivateSelfShot(off, 'x', 3).ok;
  const on = __mk(1, 3, true);
  const p = ensureChatterProfile(on); p.handle = '';
  out.noHandle = canOpenPrivatePage(on);
  setChatterHandle(on, 'tester');
  out.can = canOpenPrivatePage(on); out.open = openPrivatePage(on, 5); out.flag = p.private.open; out.openedDay = p.private.openedDay; out.again = openPrivatePage(on, 6);
  out.privatePostOk = postChatterAsPlayer(on, 'members only', 5, { visibility: 'private' }).ok;
  return out;
})()`);
check('with mature:false the page cannot be opened (canOpenPrivatePage/openPrivatePage refuse, the flag stays false, no self-shot posts)', gate.offCan.ok === false && gate.offOpen.ok === false && gate.offFlag === false && gate.offSelfShot === false, JSON.stringify(gate));
check('with it on: a handle is required, then it opens once (openedDay stamped) and refuses a second open; a private text post is then accepted', gate.noHandle.ok === false && /handle/i.test(gate.noHandle.reason) && gate.can.ok === true && gate.open.ok === true && gate.flag === true && gate.openedDay === 5 && gate.again.ok === false && gate.privatePostOk === true, JSON.stringify(gate));

// ---------------------------------------------------------------- 2
console.log('\n2. The private self-shot — the three-condition gate, no fourth (D31); level on every record (D33)');
const shot = J(`(() => {
  const out = {};
  const g = __mk(2, 3, true); openPrivatePage(g, 3);
  const res = __residents(g);
  g.player.location = 'bedroom_player'; g.player.clothing = 'nude';
  // a housemate standing in the same room must NOT be in a self-shot (D41)
  g.npcs[res[0]].location = 'bedroom_player';
  const r1 = postPrivateSelfShot(g, 'hey', 3);
  out.ok = r1.ok; out.subjects = r1.photo.subjectNpcIds; out.level = r1.photo.level; out.intimateBits = __intimateRx.test(r1.photo.prompt); out.selfie = /self-shot/.test(r1.photo.prompt); out.vis = r1.post.visibility; out.media = r1.post.media && r1.post.media.kind; out.inRoll = g.world.phone.camera.roll.some(p => p.id === r1.photo.id); out.tags = r1.photo.tags;
  g.player.clothing = 'dressed';
  const r2 = takePrivateSelfShot(g); out.dressedLevel = r2.level; out.dressedBits = __intimateRx.test(r2.prompt);
  g.player.clothing = 'nude'; g.meta.contentConfig.contentFlags.mature = false;
  const r3 = takePhoto(g, ['t'], { selfShot: true, intimate: true }); out.closedLevel = r3.level; out.closedBits = __intimateRx.test(r3.prompt);
  // the plain clause with the gate closed is byte-identical to the non-intimate one
  const plain = buildVisualCharacterClause(g.player, { gameState: g, isPlayer: true });
  const opted = buildVisualCharacterClause(g.player, { gameState: g, isPlayer: true, intimate: true });
  out.closedIdentical = plain === opted;
  g.meta.contentConfig.contentFlags.mature = true;
  out.openDiffers = buildVisualCharacterClause(g.player, { gameState: g, isPlayer: true, intimate: true }) !== plain;
  // a plain camera shot of a naked housemate is intimate-level content even though its prompt never opted in
  g.npcs[res[0]].clothing = 'nude';
  const room = takePhoto(g, ['t']); out.roomLevel = room.level; out.roomBits = __intimateRx.test(room.prompt); out.roomSubjects = room.subjectNpcIds;
  g.npcs[res[0]].clothing = 'dressed';
  const room2 = takePhoto(g, ['t']); out.roomDressedLevel = room2.level;
  out.oldMoment = photoContentLevel({ tags: ['moment'] }); out.oldPlain = photoContentLevel({ tags: [] });
  return out;
})()`);
check('a self-shot has the player as its only subject (a housemate in the room is NOT in it), selfie framing, lands in the roll tagged private, and posts private with the image', shot.ok === true && shot.subjects.length === 0 && shot.selfie === true && shot.inRoll === true && shot.tags.includes('private') && shot.vis === 'private' && shot.media === 'image', JSON.stringify(shot));
check('mature on + naked → the intimate layer is in the prompt and level is intimate; dressed → no layer, lifestyle; mature off + naked → no layer, lifestyle (the clause byte-identical to the plain one — the gate closed degrades exactly as peek does)', shot.level === 'intimate' && shot.intimateBits === true && shot.dressedLevel === 'lifestyle' && shot.dressedBits === false && shot.closedLevel === 'lifestyle' && shot.closedBits === false && shot.closedIdentical === true && shot.openDiffers === true, JSON.stringify(shot));
check("a plain camera shot of a naked housemate is 'intimate'-level content for the $Feature tier though its prompt never opts into the layer; dressed → lifestyle; an old record reads 'moment' → intimate, else lifestyle", shot.roomLevel === 'intimate' && shot.roomBits === false && shot.roomSubjects.length === 1 && shot.roomDressedLevel === 'lifestyle' && shot.oldMoment === 'intimate' && shot.oldPlain === 'lifestyle', JSON.stringify(shot));

// ---------------------------------------------------------------- 3
console.log('\n3. convPrivate(cadence) and the cast Private decision (D32, D36, D42)');
const conv = J(`(() => {
  const out = {};
  const g = __mk(3, 30, true); const p = ensureChatterProfile(g);
  out.closed = ghostConversion(g, 'private');
  openPrivatePage(g, 30);
  out.empty = ghostConversion(g, 'private'); out.emptyCadence = privateCadenceFactor(g, 30);
  postChatterAsPlayer(g, 'old one', 10, { visibility: 'private' });
  out.stale = privateCadenceFactor(g, 30);
  postChatterAsPlayer(g, 'recent', 29, { visibility: 'private' });
  out.half = privateCadenceFactor(g, 30);
  postChatterAsPlayer(g, 'recent 2', 30, { visibility: 'private' });
  out.full = privateCadenceFactor(g, 30); out.fullConv = ghostConversion(g, 'private');
  setChatterPrice(g, 'private', CHATTER_PLATFORM.privatePriceBounds[1]); out.dearConv = ghostConversion(g, 'private');
  out.expectedDear = CHATTER_PLATFORM.convPrivate * Math.pow(CHATTER_PLATFORM.privatePriceDefault / CHATTER_PLATFORM.privatePriceBounds[1], CHATTER_PLATFORM.priceElasticity);
  return out;
})()`);
check(`convPrivate(cadence): 0 with the page closed or nothing posted; the floor (${T.privateCadenceFloor}) with only old posts; half at one recent post; the full rate (${T.convPrivate}) at ${T.privateCadenceTarget} in the window; the D91 price term applies`, conv.closed === 0 && conv.empty === 0 && conv.emptyCadence === 0 && conv.stale === T.privateCadenceFloor && conv.half === 0.5 && conv.full === 1 && Math.abs(conv.fullConv - T.convPrivate) < 1e-9 && Math.abs(conv.dearConv - conv.expectedDear) < 1e-9, JSON.stringify(conv));
const dec = J(`(() => {
  const out = {};
  const g = __mk(4, 3, true); const res = __residents(g); const p = ensureChatterProfile(g);
  for (const id of res) { __warm(g, id); __slots(g, id, 2); }
  out.closed = castPrivateDecision(g, res[0], () => 0).chance;
  openPrivatePage(g, 3);
  out.noFollow = castPrivateDecision(g, res[0], () => 0).chance;
  __follow(g, res[0]); const d = castPrivateDecision(g, res[0], () => 0); out.warm = d;
  g.npcs[res[0]].bible.deviantLevel = 0.95; out.wild = castPrivateDecision(g, res[0], () => 0).chance;
  g.npcs[res[0]].bible.deviantLevel = 0.05; out.prim = castPrivateDecision(g, res[0], () => 0).chance;
  delete g.npcs[res[0]].bible.deviantLevel;
  g.npcs[res[0]].relPlayer.affection = 0; g.npcs[res[0]].relPlayer.trust = 0; out.cool = castPrivateDecision(g, res[0], () => 0).chance; out.coolBase = CHATTER_PLATFORM.privateBase;
  __warm(g, res[0]);
  const c = ensureNpcChatter(g.npcs[res[0]], g); c.slotsUsed = 2; out.full = castPrivateDecision(g, res[0], () => 0);
  c.subscribes = 'backers'; out.upgrade = castPrivateDecision(g, res[0], () => 0);
  c.subscribes = 'private'; out.already = castPrivateDecision(g, res[0], () => 0).chance; c.subscribes = null; c.slotsUsed = 0;
  __follow(g, res[1]); blockNpc(g, res[1]); out.blocked = castPrivateDecision(g, res[1], () => 0).chance; out.blockedFollow = castFollowDecision(g, res[1], () => 0).chance; out.blockedBackers = castSubscribeDecision(g, res[1], () => 0).chance;
  return out;
})()`);
check('the Private decision is 0 with the page closed, without following, already private, or blocked; a warm follower with a slot has a real chance; disinhibition scales it (wild > warm > prim); a cool one sits at privateBase', dec.closed === 0 && dec.noFollow === 0 && dec.warm.chance > 0 && dec.warm.subscribe === true && dec.wild > dec.warm.chance && dec.prim < dec.warm.chance && dec.prim > 0 && Math.abs(dec.cool - dec.coolBase * (dec.cool / dec.coolBase)) < 1e-9 && dec.cool <= dec.coolBase * 1.5 && dec.already === 0 && dec.blocked === 0, JSON.stringify(dec));
check('no free slot → 0, but a Backer upgrades on the slot already held (upgrade: true); a blocked NPC can neither follow nor back nor go Private', dec.full.chance === 0 && /no free slot/.test(dec.full.reasons[0]) && dec.upgrade.chance > 0 && dec.upgrade.upgrade === true && dec.blockedFollow === 0 && dec.blockedBackers === 0, JSON.stringify(dec));

// ---------------------------------------------------------------- 4
console.log('\n4. derivePrivateSubscribers and the bill (D32, D34)');
const pools = J(`(() => {
  const out = {};
  const g = __mk(5, 3, true); const res = __residents(g); const p = ensureChatterProfile(g);
  openPrivatePage(g, 3); postChatterAsPlayer(g, 'a', 3, { visibility: 'private' }); postChatterAsPlayer(g, 'b', 3, { visibility: 'private' });
  p.ghostFollowers = 700;
  for (const id of res) { __warm(g, id); __slots(g, id, 4); __follow(g, id); g.npcs[id].bible.deviantLevel = 0.95; }
  // force one in as a Backer first so the upgrade path runs
  const c0 = ensureNpcChatter(g.npcs[res[0]], g); c0.subscribes = 'backers'; c0.slotsUsed = 1; p.backers.cast.push(res[0]);
  let r = null; for (let d = 10; d < 300 && (!r || r.private.cast.length === 0); d += 7) r = deriveSubscribers(g, d);
  out.ghosts = r.private.ghosts; out.expectedGhosts = Math.floor(700 * ghostConversion(g, 'private')); out.cast = r.private.cast; out.subs = res.map(id => g.npcs[id].chatter.subscribes); out.slots = res.map(id => g.npcs[id].chatter.slotsUsed);
  out.upgradedOut = !p.backers.cast.includes(res[0]) || g.npcs[res[0]].chatter.subscribes !== 'private';
  out.noDouble = p.private.cast.every(id => !p.backers.cast.includes(id));
  const m0 = g.player.money; const b = billSubscriptions(g, 999);
  out.bill = b.breakdown; out.credited = b.credited; out.expected = (p.backers.ghosts + p.backers.cast.length) * p.backersPrice + (p.private.ghosts + p.private.cast.length) * p.privatePrice; out.moneyDelta = g.player.money - m0;
  // a blocked private subscriber lapses and the slot returns
  const who = p.private.cast[0]; const used = g.npcs[who].chatter.slotsUsed; blockNpc(g, who); const r2 = deriveSubscribers(g, 1000);
  out.lapsed = !r2.private.cast.includes(who) && g.npcs[who].chatter.subscribes === null && g.npcs[who].chatter.slotsUsed === used - 1;
  // a lapse by cold affinity (not a block) goes through derivePrivateSubscribers itself
  const who2 = p.private.cast[0] || null; if (who2) { const used2 = g.npcs[who2].chatter.slotsUsed; g.npcs[who2].relPlayer.affection = -0.9; g.npcs[who2].relPlayer.trust = -0.5; g.npcs[who2].relPlayer.tension = 0.9; const r2b = deriveSubscribers(g, 1001); out.lapsedCold = !r2b.private.cast.includes(who2) && g.npcs[who2].chatter.subscribes === null && g.npcs[who2].chatter.slotsUsed === used2 - 1; } else out.lapsedCold = 'n/a';
  // the page closing empties the pools and returns every slot
  p.private.open = false; const r3 = deriveSubscribers(g, 1007);
  out.closed = r3.private.ghosts === 0 && r3.private.cast.length === 0 && res.every(id => g.npcs[id].chatter.subscribes !== 'private');
  out.tracker = trackerPlatform(g) && trackerPlatform(g).detail;
  return out;
})()`);
check('ghost Private = floor(followers × convPrivate(cadence)); cast join by decision — an upgrading Backer leaves the Backers pool and keeps one slot; nobody sits in both pools', pools.ghosts === pools.expectedGhosts && pools.ghosts > 0 && pools.cast.length > 0 && pools.upgradedOut === true && pools.noDouble === true && pools.subs.every(s => s === null || s === 'backers' || s === 'private') && pools.slots.every(n => n <= 1), JSON.stringify(pools));
check('the bill sums both tiers (Backers × backersPrice + Private × privatePrice) into money; a blocked subscriber (and a cold one) lapses with the slot returned; closing the page empties the Private pools', pools.credited === pools.expected && pools.moneyDelta === pools.expected && pools.bill.private > 0 && pools.lapsed === true && (pools.lapsedCold === true || pools.lapsedCold === 'n/a') && pools.closed === true, JSON.stringify(pools));

// ---------------------------------------------------------------- 5
console.log('\n5. Visibility and perception — subscribers only (D37)');
const vis = J(`(() => {
  const out = {};
  const g = __mk(6, 10, true); const res = __residents(g); const p = ensureChatterProfile(g);
  openPrivatePage(g, 10);
  for (const id of res) __follow(g, id);
  const priv = postChatterAsPlayer(g, 'members only, be nice', 10, { visibility: 'private' }).post;
  const pub = postChatterAsPlayer(g, 'hello everyone', 10, {}).post;
  const c1 = ensureNpcChatter(g.npcs[res[1]], g); c1.subscribes = 'private'; p.private.cast.push(res[1]);
  const c2 = ensureNpcChatter(g.npcs[res[2]], g); c2.subscribes = 'backers'; p.backers.cast.push(res[2]);
  out.follower = visiblePostsFor(g, res[0]).map(x => x.id); out.subscriber = visiblePostsFor(g, res[1]).map(x => x.id); out.backer = visiblePostsFor(g, res[2]).map(x => x.id); out.player = visiblePostsFor(g, 'player').map(x => x.id);
  for (const id of res) __scroll(g, id, 10);
  const noticed = applyPlatformPerceptionForDay(g, 11);
  const key = noticeSubjectKey({ kind: 'chatter_private', ref: priv.id }); const pubKey = noticeSubjectKey({ kind: 'chatter_post', ref: pub.id });
  out.holds = res.map(id => [holdsOpinionOn(g.npcs[id], key), holdsOpinionOn(g.npcs[id], pubKey)]);
  const fact = (g.npcs[res[1]].memory.facts || []).find(f => f.kind === 'opinion' && f.subject && f.subject.key === key);
  out.text = fact && fact.text; out.via = noticed.find(n => n.key === key)?.perceivers[0]?.via;
  out.keys = noticed.map(n => n.key);
  return { ...out, priv: priv.id, pub: pub.id };
})()`);
check('a private post is invisible to a following-but-unsubscribed NPC and to a Backer, visible to a Private subscriber and to the player; the public post is visible to all', !vis.follower.includes(vis.priv) && vis.follower.includes(vis.pub) && !vis.backer.includes(vis.priv) && vis.subscriber.includes(vis.priv) && vis.subscriber.includes(vis.pub) && vis.player.includes(vis.priv), JSON.stringify(vis));
check("only the subscriber who scrolled holds the chatter_private opinion (via platform, a 'private post' line); everyone who scrolled holds the public one", vis.holds[0][0] === false && vis.holds[1][0] === true && vis.holds[2][0] === false && vis.holds.every(h => h[1] === true) && vis.via === 'platform' && /private post/.test(vis.text), JSON.stringify(vis));

// ---------------------------------------------------------------- 6
console.log('\n6. $Feature — consent as an ask over the willingness gate (D33, D41)');
const feat = J(`(() => {
  const out = {};
  const g = __mk(7, 3, true); const res = __residents(g); const npcId = res[0]; const npc = g.npcs[npcId];
  __warm(g, npcId);
  const roomId = npc.location; g.player.location = roomId; g.player.clothing = 'dressed'; npc.clothing = 'dressed';
  const ctx = __ctxFor(g, npcId);
  out.unavailableNoPhoto = ASK_TYPES.Feature.available(g, npc, ctx);
  const photo = takePhoto(g, ['t']); out.subjects = photo.subjectNpcIds; out.level = photo.level;
  out.available = ASK_TYPES.Feature.available(g, npc, ctx); out.featurable = featurablePhotosFor(g, npcId).map(p => p.id);
  out.postBefore = postChatterAsPlayer(g, 'us', 3, { media: { kind: 'image', photoId: photo.id } });
  out.missing = photoSubjectsWithoutConsent(g, photo);
  const bare = resolveAsk(g, npcId, 'Feature', 'please?', ctx); out.bareDecision = bare.decision;
  const ask = resolveAsk(g, npcId, 'Feature', 'please?', ctx, { featurePhotoId: photo.id }); out.decision = ask.decision; out.stance = ask.stance; out.phrase = ask.reasonPhrase;
  ask.applyEffects();
  const fact = featureConsentFor(g.npcs[npcId], photo.id); out.fact = fact && { kind: fact.kind, ref: fact.ref, granted: fact.granted, level: fact.level, day: fact.day, text: fact.text };
  out.has = hasFeatureConsent(g.npcs[npcId], photo.id);
  out.postAfter = postChatterAsPlayer(g, 'us', 3, { media: { kind: 'image', photoId: photo.id } }).ok;
  out.postAfterPrivate = (() => { openPrivatePage(g, 3); return postChatterAsPlayer(g, 'us again', 3, { visibility: 'private', media: { kind: 'image', photoId: photo.id } }).ok; })();
  // a refusal is final: a cold NPC, a lifestyle photo → 'cool'; asking again → feature_refused
  const g2 = __mk(8, 3, true); const r2 = __residents(g2); const n2 = g2.npcs[r2[0]];
  n2.relPlayer.affection = -0.5; n2.relPlayer.tension = 0.6; n2.relPlayer.trust = 0; g2.player.location = n2.location; n2.clothing = 'dressed';
  const ph2 = takePhoto(g2, ['t']); const ctx2 = __ctxFor(g2, r2[0]);
  const first = resolveAsk(g2, r2[0], 'Feature', '', ctx2, { featurePhotoId: ph2.id }); first.applyEffects();
  const second = resolveAsk(g2, r2[0], 'Feature', '', ctx2, { featurePhotoId: ph2.id }); second.applyEffects();
  const f2 = featureConsentFor(g2.npcs[r2[0]], ph2.id);
  out.refused = { first: first.decision.reason, second: second.decision.reason, granted: f2 && f2.granted, phrase: second.reasonPhrase, facts: (g2.npcs[r2[0]].memory.facts || []).filter(f => f.kind === 'consent_feature').length };
  out.refusedPost = postChatterAsPlayer(g2, 'x', 3, { media: { kind: 'image', photoId: ph2.id } }).ok;
  return out;
})()`);
check('$Feature is unavailable with no photo of them, available once one exists; a bare ask (no pick) is refused; posting the photo is refused before consent (naming who)', feat.unavailableNoPhoto === false && feat.available === true && feat.featurable.length === 1 && feat.bareDecision.reason === 'unavailable' && feat.postBefore.ok === false && /ask first/.test(feat.postBefore.reason) && feat.missing.length === 1, JSON.stringify(feat));
check('a warm NPC consents to a lifestyle photo (hangout-tier score): a consent_feature fact { ref: photoId, granted: true, level } lands; the photo then posts public AND private', feat.decision.accept === true && feat.decision.level === 'lifestyle' && feat.fact && feat.fact.kind === 'consent_feature' && feat.fact.granted === true && feat.fact.level === 'lifestyle' && feat.has === true && feat.postAfter === true && feat.postAfterPrivate === true, JSON.stringify(feat));
check("a cold NPC refuses ('cool'); the refusal is final for that photo — a second ask says feature_refused (its own phrase in the table; the same-day repeat ladder may voice it instead), one fact only, the photo never posts", feat.refused.first === 'cool' && feat.refused.second === 'feature_refused' && feat.refused.granted === false && feat.refused.facts === 1 && /final/.test(J('ASK_REASON_PHRASES.feature_refused')) && feat.refusedPost === false, JSON.stringify(feat));
const tier = J(`(() => {
  const out = {};
  const g = __mk(9, 3, true); const res = __residents(g); const npcId = res[0]; const npc = g.npcs[npcId];
  __warm(g, npcId); g.player.location = npc.location; npc.clothing = 'nude'; g.player.clothing = 'dressed';
  const photo = takePhoto(g, ['t']); out.level = photo.level; npc.clothing = 'dressed';
  const ctx = __ctxFor(g, npcId);
  // asleep floor: the same reason string ASK_INTIMACY's floor path / ASK_PHOTO give
  npc.asleep = true; npc.activity = 'sleeping';
  out.asleepFeature = resolveAsk(g, npcId, 'Feature', '', ctx, { featurePhotoId: photo.id }).decision.reason;
  out.asleepPhoto = resolveAsk(g, npcId, 'RequestPhoto', '', ctx).decision.reason;
  out.asleepFloors = willingnessFloorReasons(g, npc, 'player', { location: npc.location, npcId });
  npc.asleep = false; npc.activity = 'hanging_out';
  // hostile floor: identical strings between Feature and Intimacy
  npc.relPlayer.affection = -0.9; npc.relPlayer.tension = 0.9; npc.relPlayer.trust = -0.5;
  out.hostileFeature = resolveAsk(g, npcId, 'Feature', '', ctx, { featurePhotoId: photo.id }).decision.reason;
  out.hostileIntimacy = resolveAsk(g, npcId, 'RequestIntimacy', '', ctx).decision.reason;
  // the intimate tier reads the willingness bar: warm → the gate decides; the disinhibition delta moves a near-miss, never a floor
  __warm(g, npcId);
  const gate = resolveWillingnessGate(g, npcId, 'player', 'default', { block: null, location: npc.location, npcId });
  out.gate = { allowed: gate.allowed, w: gate.willingness, t: gate.threshold, reason: gate.reason };
  const d = resolveAsk(g, npcId, 'Feature', '', ctx, { featurePhotoId: photo.id }).decision; out.warmIntimate = d;
  out.consistent = gate.reason === 'floor' ? d.reason.startsWith('floor_') : (gate.allowed ? d.accept === true : ['accept', 'below_feature'].includes(d.reason));
  return out;
})()`);
check("an intimate-level photo: the asleep floor refuses $Feature with 'floor_asleep' — the same string RequestPhoto's floor path gives (ASK_INTIMACY's own vocabulary); the hostile floor gives Feature and Intimacy the identical reason", tier.level === 'intimate' && tier.asleepFeature === 'floor_asleep' && tier.asleepPhoto === 'floor_asleep' && tier.asleepFloors.includes('asleep') && tier.hostileFeature === tier.hostileIntimacy && tier.hostileFeature.startsWith('floor_'), JSON.stringify(tier));
check("a warm NPC's intimate-tier answer follows the 'default' willingness gate (accept when allowed; below_feature when under the bar; a floor stays a floor)", tier.consistent === true && tier.warmIntimate.level === 'intimate', JSON.stringify(tier));

// ---------------------------------------------------------------- 7
console.log('\n7. Save round-trip — private.open/openedDay, the consent fact, a photo\'s level');
const persist = J(`(() => {
  const g = __mk(10, 3, true); const res = __residents(g); const p = ensureChatterProfile(g);
  openPrivatePage(g, 3); g.player.location = g.npcs[res[0]].location; g.player.clothing = 'dressed'; g.npcs[res[0]].clothing = 'dressed';
  const photo = takePhoto(g, ['t']);
  g.npcs[res[0]] = addMemoryFact(g.npcs[res[0]], buildFeatureConsentFact(photo, true, 'lifestyle', 3));
  const r = postPrivateSelfShot(g, 'kept', 3);
  const c = ensureNpcChatter(g.npcs[res[0]], g); c.subscribes = 'private'; c.slotsUsed = 1; p.private.cast.push(res[0]); p.private.ghosts = 4;
  const payload = captureSavePayload(g);
  const rt = JSON.parse(JSON.stringify(payload));
  const computer = normalizeComputerState(rt.world.computer);
  const q = computer.apps.social_feed.profile;
  const post = computer.apps.social_feed.posts.find(x => x.id === r.post.id);
  return { open: q.private.open, openedDay: q.private.openedDay, cast: q.private.cast, ghosts: q.private.ghosts, same: JSON.stringify(q) === JSON.stringify(p),
           consent: hasFeatureConsent(rt.npcs[res[0]], photo.id), subs: rt.npcs[res[0]].chatter.subscribes,
           postVis: post && post.visibility, postLevel: post && post.media && post.media.photo && post.media.photo.level, rollLevel: rt.world.phone.camera.roll.find(x => x.id === r.photo.id).level };
})()`);
check('captureSavePayload → JSON → normalizeComputerState keeps private.open/openedDay/cast/ghosts; the consent fact and subscribes ride the npc record; the private post and the roll photo keep their level', persist.open === true && persist.openedDay === 3 && persist.cast.length === 1 && persist.ghosts === 4 && persist.same === true && persist.consent === true && persist.subs === 'private' && persist.postVis === 'private' && persist.postLevel === 'lifestyle' && persist.rollLevel === 'lifestyle', JSON.stringify(persist));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
