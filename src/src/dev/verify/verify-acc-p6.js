// Aspirations, Creative Careers & Chatter Overhaul
// (aspirations-and-creative-careers-overhaul-plan.md) — Phase 6: Music —
// record, release on Streamly (D22, D77, D78).
//
//   node src/src/dev/verify/verify-acc-p6.js
//
// Node coverage for everything pure in this phase: the recording_kit decor
// entry (catalog, design shape, footprint alias); recording refused
// without a PLACED kit and accepted after one is placed through the real
// Home-app path (inventory stack → placeDecorItem), refused again once it
// is picked back up — at start AND at release; a released track's reach
// fading and promoting exactly per Phase 4; the stereo-play emission
// (D78) — the record-player hobby's buildEffects appending the trusted-only
// PLAY_OWN_TRACK effect only when a released track exists, the LLM tier
// refusing it, the seeded roll firing at WORKS_TUNING.stereoPlayChance
// (±20% over 2,000 moments), deterministic per moment, and a hit moment
// applied through the REAL applyEffects pipeline landing a work opinion on
// the NPC in the room and none on one elsewhere; the Streamly releases
// screen def and the Works tab's track deep link; and the chip/modal wiring
// (start gated on music ≥ WORK_KINDS.track.minSkill, D77). The chips, the
// modal and the Streamly screen are presentation, verified on the live
// page (invariant 7).
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api, loaded } = loadEngine({
  required: ['config.js', 'defs.world.js', 'defs.actions.js', 'defs.computer.js', 'defs.design.js', 'defs.placement.js', 'defs.works.js', 'sim.js', 'world.js', 'signals.js',
    'items.js', 'inventory.js', 'effects.js', 'skills.js', 'computer.js', 'works.js', 'npc.js', 'notice.js', 'state.js'],
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed, day) => {
    const h = SIM_generateHouse(seed || 20260918, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: day || 1, minutes: 600 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.player.money = 1000;
    g.world.taxes = { quarterGross: 0, lastQuarterBilled: -1, unpaid: 0, autoReserve: false, reserve: 0 };
    return g;
  };
  __setLevel = (g, skillId, level) => { g.player.skills = g.player.skills || {}; g.player.skills[skillId] = SKILLS.xpPerLevelBase * level * level; };
  __setRep = (g, map) => { Object.assign(g.world.computer.apps.gigs.reputation, map); };
  // Buy-and-place through the real path: an inventory stack of the catalog
  // defId, then the Home app's placeDecorItem into a room bucket.
  // Phase 17 (D55): placeDecorItem now rejects a position outside the
  // room's own ROOM_LAYOUT rects, so the fixture position has to actually
  // be in bedroom_player rather than an arbitrary (10,10).
  __placeKit = (g, roomId) => {
    g.player.inventory = addStack(g.player.inventory, 'recording_kit', 1, null, {}, g.meta.clock.day);
    const rid = roomId || 'bedroom_player';
    const [rx, ry] = ROOM_LAYOUT[rid][0];
    return placeDecorItem(g, { defId: 'recording_kit', roomId: rid, pos: { x: rx + 4, y: ry + 4, w: 16, h: 9, rot: 0 } });
  };
  __record = (g, title) => {
    const s = startWork(g, { kind: 'track', title });
    if (!s.ok) return { ok: false, reason: s.reason };
    let r, clicks = 0;
    do { g.player.energy = 90; r = workBlock(g, s.wip.id, 'computer'); clicks++; } while (r.ok && !r.finished && clicks < 500);
    return { ok: r.ok && r.finished, work: r.work, clicks, blocks: s.wip.blocks };
  };
  __opinions = (npc) => (npc.memory.facts || []).filter(f => f.kind === 'opinion');
  __ctx = (g, roomId, present) => ({ gameState: g, roomId, roomObjects: g.objects['room_' + roomId] || {}, presentNpcIds: present || [] });
`);

// ---------------------------------------------------------------- 0
console.log(`\n0. Registration — the recording kit in the catalog/shapes/footprints, the effect, the tuning, the Streamly screen, the wiring. ${loaded.length} engine files loaded.`);
const reg = J(`({
  cat: DECOR_CATALOG_DEFS.recording_kit,
  inList: DECOR_CATALOG_LIST.some(d => d.id === 'recording_kit'),
  shape: DESIGN_SHAPES.recording_kit && { w: DESIGN_SHAPES.recording_kit.w, h: DESIGN_SHAPES.recording_kit.h, parts: DESIGN_SHAPES.recording_kit.parts.length },
  fp: fpFootprint('recording_kit'),
  requires: WORK_KINDS.track.requires,
  chance: WORKS_TUNING.stereoPlayChance,
  effect: EFFECT_DEFS.PLAY_OWN_TRACK && { llm: EFFECT_DEFS.PLAY_OWN_TRACK.llm, shape: EFFECT_DEFS.PLAY_OWN_TRACK.paramShape, implemented: EFFECT_DEFS.PLAY_OWN_TRACK.implemented },
  screen: APP_DEFS.stream.screens.releases,
  streamLabel: APP_DEFS.stream.label,
})`);
check("DECOR_CATALOG_DEFS.recording_kit: $180, buyQty 1, shape 'recording_kit', category study — and in DECOR_CATALOG_LIST (the Home app's browse source)", reg.cat && reg.cat.price === 180 && reg.cat.buyQty === 1 && reg.cat.shape === 'recording_kit' && reg.cat.category === 'study' && reg.inList === true, JSON.stringify(reg.cat));
check('DESIGN_SHAPES.recording_kit exists (placeDecorItem needs it) and the footprint alias resolves for the floor-plan packer', reg.shape && reg.shape.parts >= 3 && reg.fp && reg.fp.w > 0, JSON.stringify([reg.shape, reg.fp]));
check("WORK_KINDS.track.requires is 'recording_kit'; WORKS_TUNING.stereoPlayChance is set", reg.requires === 'recording_kit' && reg.chance > 0 && reg.chance < 1, JSON.stringify([reg.requires, reg.chance]));
check('EFFECT_DEFS.PLAY_OWN_TRACK is trusted-only (llm: false), takes a roomId', reg.effect && reg.effect.llm === false && JSON.stringify(reg.effect.shape) === '["roomId"]' && reg.effect.implemented === true, JSON.stringify(reg.effect));
check("the Streamly app ('stream', label Streamly — the existing brand, D22) gained a 'releases' screen on the 'streamly-releases' renderer", reg.streamLabel === 'Streamly' && reg.screen && reg.screen.renderer === 'streamly-releases', JSON.stringify(reg.screen));
const renderSrc = fs.readFileSync(path.join(SRC, 'render.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf8');
const rcSrc = fs.readFileSync(path.join(SRC, 'render.computer.js'), 'utf8');
check("render.js offers 'Record a Track' / 'Record — \"<title>\"' only with a placed recording_kit in the room AND music ≥ WORK_KINDS.track.minSkill (D77)", /o\.defId === 'recording_kit'/.test(renderSrc) && /skillLevel\(player, WORK_KINDS\.track\.skill\) >= WORK_KINDS\.track\.minSkill/.test(renderSrc) && /action: 'record-track', bucket: 'devices'/.test(renderSrc) && /record-track-start/.test(renderSrc));
check("ui.js: record-track-start → openWorkStartModal('track'), confirm-record-track → doStartWorkFromModal('track'), record-track → doWorkBlock(offline); WORK_START_COPY has a track row", /case 'record-track-start':\r?\n\s*openWorkStartModal\('track'\)/.test(uiSrc) && /case 'confirm-record-track':\r?\n\s*await doStartWorkFromModal\('track'\)/.test(uiSrc) && /case 'record-track':\r?\n\s*await doWorkBlock\(extra\?\.rowId, 'computer', \{ offline: true \}\)/.test(uiSrc) && /track: \{ heading: 'Record a track'/.test(uiSrc));
check("the Works tab's finished-track button deep-links to stream/releases; the releases screen's Release is works.release", /w\.kind === 'track'[\s\S]{0,300}data-screen', 'releases'/.test(rcSrc) && /function renderStreamlyReleases[\s\S]{0,5000}data-action', 'works\.release'/.test(rcSrc) && /'streamly-releases': renderStreamlyReleases/.test(rcSrc));

// ---------------------------------------------------------------- 1
console.log('\n1. Recording needs a PLACED kit — refused without, accepted after the real buy-and-place path, refused again once picked up (D22)');
const kit = J(`(() => {
  const g = __mk(31, 1);
  __setLevel(g, 'music', 5); __setRep(g, { music: 45 });
  const none = startWork(g, { kind: 'track', title: 'No Kit' });
  const gateNone = canRelease(g, 'track');
  // In inventory but NOT placed: still refused.
  g.player.inventory = addStack(g.player.inventory, 'recording_kit', 1, null, {}, 1);
  const inBag = startWork(g, { kind: 'track', title: 'Boxed Kit' });
  const bedroomRect = ROOM_LAYOUT.bedroom_player[0];
  const placed = placeDecorItem(g, { defId: 'recording_kit', roomId: 'bedroom_player', pos: { x: bedroomRect[0] + 4, y: bedroomRect[1] + 4, w: 16, h: 9, rot: 0 } });
  const obj = Object.values(g.objects.room_bedroom_player).find(o => o.defId === 'recording_kit');
  const withKit = startWork(g, { kind: 'track', title: 'Low Tide' });
  const gateWith = canRelease(g, 'track');
  const rec = __record(g, 'Second Session');
  // Pick the kit back up: the finished session cannot release until it is placed again.
  const up = pickUpDecorObject(g, placed.id);
  const relNoKit = releaseWork(g, rec.work.id);
  const livingRect = ROOM_LAYOUT.living_room[0];
  const again = placeDecorItem(g, { defId: 'recording_kit', roomId: 'living_room', pos: { x: livingRect[0] + 4, y: livingRect[1] + 4, w: 16, h: 9, rot: 0 } });
  const relWithKit = releaseWork(g, rec.work.id);
  return { none: [none.ok, none.reason], gateNone: gateNone.reasons, inBag: inBag.ok, placed: placed.ok, objId: obj && obj.id, objPos: obj && obj.pos, withKit: withKit.ok, gateWith: gateWith.ok, blocks: rec.blocks, quality: rec.work.quality, up: up.ok, relNoKit: [relNoKit.ok, relNoKit.reason], again: again.ok, relWithKit: [relWithKit.ok, relWithKit.reach], expectedReach: WORK_KINDS.track.releaseReach(rec.work.quality, 45) };
})()`);
check('no kit anywhere → startWork refused naming the kit, and canRelease lists it as the one unmet reason', kit.none[0] === false && /recording kit/.test(kit.none[1]) && kit.gateNone.length === 1 && /recording kit/.test(kit.gateNone[0]), JSON.stringify([kit.none, kit.gateNone]));
// Phase 17 (D55): placeDecorItem now runs the pos through normalizePlacement,
// which grid-snaps w/h too (16 → nearest multiple of 5 = 15) — a placed
// object's pos is no longer necessarily byte-identical to what was asked for.
check('a kit in the bag (bought, not placed) is still no kit; placeDecorItem makes it a real object with a pos and recording is accepted', kit.inBag === false && kit.placed === true && kit.objId && kit.objPos && kit.objPos.w === 15 && kit.withKit === true && kit.gateWith === true, JSON.stringify([kit.inBag, kit.placed, kit.objId, kit.objPos, kit.withKit]));
check(`a track rolls 8–16 blocks and finishes at craftQuality[5] = 0.76`, kit.blocks >= 8 && kit.blocks <= 16 && kit.quality === 0.76, JSON.stringify([kit.blocks, kit.quality]));
check('picking the kit back up refuses the release (the gate re-reads the world); placing it in another room releases at releaseReach(q, rep)', kit.up === true && kit.relNoKit[0] === false && /recording kit/.test(kit.relNoKit[1]) && kit.again === true && kit.relWithKit[0] === true && kit.relWithKit[1] === kit.expectedReach, JSON.stringify([kit.up, kit.relNoKit, kit.again, kit.relWithKit, kit.expectedReach]));

// ---------------------------------------------------------------- 2
console.log("\n2. A released track fades and promotes per Phase 4 (D18) — it is the same engine");
const fade = J(`(() => {
  const g = __mk(32, 1);
  __setLevel(g, 'music', 6); __setRep(g, { music: 50 });
  __placeKit(g);
  const rec = __record(g, 'Undertow');
  const rel = releaseWork(g, rec.work.id);
  const w = g.player.works.find(x => x.id === rec.work.id);
  const r0 = w.reach;
  let credited = 0; for (let i = 0; i < 14; i++) { g.meta.clock.day += 1; credited += processWorksForDay(g, g.meta.clock.day).income.credited; }
  const r14 = w.reach;
  g.player.energy = 80;
  const pr = promoteWork(g, w.id, 'computer');
  const expectedBump = Math.round(WORKS_TUNING.promoteBump * WORK_KINDS.track.releaseReach(w.quality, 50) * 100) / 100;
  return { r0, r14, half: Math.abs(r14 - r0 / 2) < 0.5, credited, money: g.player.money, bump: pr.bump, expectedBump, lastPromoted: w.lastPromotedDay, day: g.meta.clock.day, rate: WORK_KINDS.track.ratePerReach };
})()`);
check('reach halves over 14 unpromoted days and the daily trickle credited whole dollars into player.money', fade.half === true && fade.money - 1000 === fade.credited && fade.credited > 0, JSON.stringify(fade));
check('a promotion bumps by promoteBump × track.releaseReach(q, rep) and resets the clock', fade.bump === fade.expectedBump && fade.lastPromoted === fade.day, JSON.stringify([fade.bump, fade.expectedBump, fade.lastPromoted, fade.day]));

// ---------------------------------------------------------------- 3
console.log('\n3. The stereo-play emission (D78) — the record-player hobby appends PLAY_OWN_TRACK only with a released track; trusted-only; fires at the configured rate; a hit notices the room through the real pipeline');
const play = J(`(() => {
  const g = __mk(33, 1);
  __setLevel(g, 'music', 5); __setRep(g, { music: 45 });
  const ids = Object.keys(g.npcs).filter(id => id.startsWith('npc_'));
  const A = ids[0], B = ids[1];
  g.player.location = 'living_room';
  g.npcs[A].location = 'living_room'; g.npcs[A].activity = 'idle'; g.npcs[A].needs.energy = 80;
  g.npcs[B].location = 'bedroom_1'; g.npcs[B].activity = 'idle'; g.npcs[B].needs.energy = 80;
  const def = ACTION_DEFS['hobby.record_player'];
  const ctx = __ctx(g, 'living_room', [A]);
  const linesBefore = def.buildEffects(ctx, def.prepare(ctx));
  // Without a released track: no PLAY_OWN_TRACK, and the applier is a no-op.
  const noTrack = playOwnTrack(g, 'living_room');
  __placeKit(g);
  const rec = __record(g, 'Low Tide');
  const wipLines = def.buildEffects(ctx, def.prepare(ctx));   // finished but unreleased: still none
  releaseWork(g, rec.work.id);
  // The release itself noticed A (D75) — clear that so the play is what we measure.
  g.npcs[A].memory.facts = g.npcs[A].memory.facts.filter(f => f.kind !== 'opinion');
  const linesAfter = def.buildEffects(ctx, def.prepare(ctx));
  const parsed = parseEffectDSL(linesAfter.join(String.fromCharCode(10)));
  const trusted = validateEffects(parsed, ctx, 'trusted');
  const llm = validateEffects(parseEffectDSL('PLAY_OWN_TRACK living_room'), ctx, 'llm');
  const badRoom = validateEffects(parseEffectDSL('PLAY_OWN_TRACK nowhere'), ctx, 'trusted');
  // The rate, over 2,000 distinct moments (day × minute), on a state where nobody is in reach.
  const g2 = __mk(33, 1); __setLevel(g2, 'music', 5); __setRep(g2, { music: 45 }); __placeKit(g2);
  const rec2 = __record(g2, 'Low Tide'); releaseWork(g2, rec2.work.id);
  for (const id of Object.keys(g2.npcs)) if (g2.npcs[id].location) g2.npcs[id].location = 'bedroom_2';
  let hits = 0; const moments = [];
  for (let i = 0; i < 2000; i++) { g2.meta.clock.day = 1 + Math.floor(i / 48); g2.meta.clock.minutes = (i % 48) * 30; const r = playOwnTrack(g2, 'living_room'); if (r.played) { hits++; if (moments.length < 1) moments.push([g2.meta.clock.day, g2.meta.clock.minutes]); } }
  const same = (() => { g2.meta.clock.day = moments[0][0]; g2.meta.clock.minutes = moments[0][1]; return !!playOwnTrack(g2, 'living_room').played && !!playOwnTrack(g2, 'living_room').played; })();
  // Find a hit moment on g and apply the hobby's effects through applyEffects: A notices, B does not.
  let hitMoment = null;
  for (let i = 0; i < 400 && !hitMoment; i++) { const d = 1 + Math.floor(i / 48), m = (i % 48) * 30; const probe = { ...g, meta: { ...g.meta, clock: { ...g.meta.clock, day: d, minutes: m } } }; const rng = seededRng(g.meta.seed, 'own_track_' + d + '_' + m + '_living_room'); if (rng() < WORKS_TUNING.stereoPlayChance) hitMoment = [d, m]; }
  g.meta.clock.day = hitMoment[0]; g.meta.clock.minutes = hitMoment[1];
  const effCtx = buildEffectContext(g, [], [], {}, [A]);
  effCtx.roomId = 'living_room';
  applyEffects(parseEffectDSL('PLAY_OWN_TRACK living_room'), effCtx);
  const opsA = __opinions(g.npcs[A]).map(f => ({ key: f.subject.key, text: f.text, cat: f.category }));
  const opsB = __opinions(g.npcs[B]).length;
  // Twice at the same moment: one opinion (dedupe).
  applyEffects(parseEffectDSL('PLAY_OWN_TRACK living_room'), effCtx);
  const opsA2 = __opinions(g.npcs[A]).length;
  return { linesBefore, noTrack: noTrack.played, wipLines, linesAfter, trusted: [trusted.valid.length, (trusted.rejected || []).length], llmRejected: (llm.rejected || []).length, badRoom: (badRoom.rejected || []).length, hits, rate: hits / 2000, chance: WORKS_TUNING.stereoPlayChance, same, hitMoment, opsA, opsB, opsA2 };
})()`);
check('with no released track the hobby appends no PLAY_OWN_TRACK (before recording, and with a finished-but-unreleased session) and playOwnTrack is a no-op', !play.linesBefore.some(l => /PLAY_OWN_TRACK/.test(l)) && !play.wipLines.some(l => /PLAY_OWN_TRACK/.test(l)) && play.noTrack === null, JSON.stringify([play.linesBefore, play.wipLines, play.noTrack]));
check("with a released track the hobby appends 'PLAY_OWN_TRACK living_room'; the trusted tier accepts it, the LLM tier rejects it, an unknown room is rejected", play.linesAfter.includes('PLAY_OWN_TRACK living_room') && play.trusted[1] === 0 && play.trusted[0] === play.linesAfter.length && play.llmRejected === 1 && play.badRoom === 1, JSON.stringify([play.linesAfter, play.trusted, play.llmRejected, play.badRoom]));
check(`the roll fires on ${play.hits}/2000 moments — within ±20% of stereoPlayChance ${play.chance}; deterministic per moment`, play.rate >= play.chance * 0.8 && play.rate <= play.chance * 1.2 && play.same === true, JSON.stringify([play.hits, play.rate, play.same]));
check("a hit moment applied through applyEffects (the real pipeline) lands one work:<id> opinion on the NPC in the room, category 'music', naming the track; the NPC behind a door holds none; a second play is a no-op (one opinion per subject)", play.opsA.length === 1 && play.opsA[0].key === 'work:work_1' && play.opsA[0].cat === 'music' && /track "Low Tide"/.test(play.opsA[0].text) && play.opsB === 0 && play.opsA2 === 1, JSON.stringify([play.hitMoment, play.opsA, play.opsB, play.opsA2]));

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
