// Chore requests that actually get done (2026-09-28).
//
//   node dev/verify/verify-chores.js
//
// Found while answering the user's question about texting chores: the Chore
// Request ask, on a yes, set the roommate's activity LABEL to whatever you
// typed ("take the bins out") and wrote a memory. Nothing else. The bin stayed
// full, the dishes stayed dirty. The user: "let's fix the underlying issue …
// and add the functionality you suggested" — an agreed chore really happens,
// and you can ask by text (at home they do it now, out they do it when they
// get home).
//
// What this asserts:
//   1. The chips offer ONLY chores that need doing, by the same requirement
//      checkers the player's own chore buttons use.
//   2. The chip never changes the verdict (the asks plan's D1).
//   3. A yes queues the chore; the next free decision (the real resolveTick)
//      does it: the world changes, and they're held at it for its time.
//   4. Each chore kind changes what it says it changes.
//   5. Timing: not while you're still talking to them, not asleep, not while
//      they're out — and by text you get a "done" line in the thread.
//   6. Housekeeping: done by someone else → dropped; never done → expires.
const { loadEngine } = require('./loadgame.js');
const { api } = loadEngine({ required: ['config.js', 'asks.js', 'drives.js', 'sim.js', 'cognition.js', 'computer.js', 'items.js'] });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const J = (expr) => JSON.parse(api(`JSON.stringify(${expr})`));

api(`
  __mk = (seed) => {
    const h = SIM_generateHouse(seed || 20260928, 3);
    const g = { meta: { seed: h.seed, clock: { ...h.clock, day: 5, minutes: 1140 }, contentConfig: null, sessionLog: [] },
                player: h.player, npcs: h.npcs, world: h.world, objects: h.objects };
    g.meta.clock.weekday = getWeekday(5); g.meta.clock.phase = getPhase(1140);
    g.player.location = 'living_room'; g.player.flags = g.player.flags || {};
    g.world.signals = g.world.signals || [];
    for (const id of __ids(g)) {
      const n = g.npcs[id];
      n.relPlayer = { ...n.relPlayer, affection: 5, trust: 5, tension: 0 };
      n.bible.name = n.bible.name || ('Roomie' + id.slice(-1));
    }
    return g;
  };
  __ids = (g) => Object.keys(g.npcs).filter(id => g.npcs[id].residency.status === 'resident').sort();
  __obj = (g, defId, roomId) => {
    for (const [key, b] of Object.entries(g.objects)) {
      if (roomId && key !== 'room_' + roomId) continue;
      const o = Object.values(b).find(o => o.defId === defId); if (o) return o;
    }
    return null;
  };
  __ctx = (id) => ({ activeNpcs: [{ id }], ambientNpcs: [] });
  // Make every kind of chore need doing.
  __mess = (g) => {
    const sink = __obj(g, 'sink_kitchen'); sink.dishes = { plate: 4, pot: 1 }; sink.dishUnits = 6;
    const bin = __obj(g, 'trash_kitchen'); bin.state = { ...bin.state, fill: 'full', rotten_food: 'rotten' };
    const toilet = __obj(g, 'toilet', 'bathroom_a') || __obj(g, 'toilet'); toilet.state = { ...toilet.state, clean: 'dirty' };
    g.world.rooms.living_room.dirt = 0.6;
    // The generated flat starts with broken laundry machines (a RenoFix job);
    // the fixture repairs them so the laundry chore has something to run on.
    g.world.upgrades = { ...(g.world.upgrades || {}), laundry_machines: { ...((g.world.upgrades || {}).laundry_machines || {}), tier: 'functional', activeJobId: null } };
    const hamper = __obj(g, 'laundry_hamper');
    if (hamper) {
      const shirt = Object.keys(CLOTHING_DEFS)[0];
      hamper.contents = [{ defId: shirt, qty: 1, ownerId: __ids(g)[1], meta: { laundryState: 'dirty' } }];
      refreshHamperFill(hamper);
    }
    return g;
  };
  // The real tick, and what it wrote for this npc.
  __tick = (g, id) => { const r = resolveTick(g); return r.npcUpdates[id] || {}; };
  __ask = (g, id, extra, flavor, ctx) => {
    const t = resolveAsk(g, id, 'RequestChore', flavor || '', ctx || __ctx(id), extra);
    t.applyEffects();
    return t;
  };
`);

// ------------------------------------------------------------------ 1
console.log('\n1. The chips offer only chores that need doing');
check('a clean flat offers nothing — and the ask is unavailable', J(`(() => { const g = __mk(); return npcChoreOptions(g).length === 0 && !ASK_TYPES.RequestChore.available(g, g.npcs[__ids(g)[0]], {}); })()`));
const opts = J(`npcChoreOptions(__mess(__mk()))`);
check('a messy flat offers the dishes, the trash, the laundry, the toilet and the messy room', ['dishes', 'trash', 'laundry'].every(k => opts.some(o => o.id === k))
  && opts.some(o => o.id.startsWith('toilet:')) && opts.some(o => o.id === 'tidy:living_room'), JSON.stringify(opts));
check('broken laundry machines keep the laundry off the list (the same gate as the player\'s Laundry button)', J(`(() => {
  const g = __mess(__mk()); g.world.upgrades.laundry_machines.tier = 'broken';
  return !npcChoreOptions(g).some(o => o.id === 'laundry');
})()`));
check('every option passes the player\'s own chore button gates (ACTION_REQUIREMENT_CHECKERS)', J(`(() => {
  const g = __mess(__mk());
  return npcChoreOptions(g).every(o => {
    const p = npcChoreParse(o.id); const room = p.roomId || p.def.rooms(g)[0];
    return checkRequirements(ACTION_DEFS[p.def.actionId], { gameState: g, roomId: room, roomObjects: g.objects['room_' + room] || {} }).ok;
  });
})()`));
check('…and the moment a chore is done it drops off the list', J(`(() => {
  const g = __mess(__mk()); const sink = __obj(g, 'sink_kitchen'); sink.dishes = {}; sink.dishUnits = 0;
  return !npcChoreOptions(g).some(o => o.id === 'dishes');
})()`));
check('the leaf is offered by text now (remote)', J(`ASK_TYPES.RequestChore.remote === true && askRemoteCategories().some(c => c.children.some(l => l.id === 'RequestChore'))`));

// ------------------------------------------------------------------ 2
console.log('\n2. The chip never changes the verdict (D1)');
{
  const diffs = [];
  for (const aff of [-3, -0.2, 0.3, 5]) {
    for (const energy of [10, 50, 95]) {
      const v = J(`(() => {
        const out = [];
        for (const chore of [undefined, 'dishes', 'trash', 'tidy:living_room']) {
          const g = __mess(__mk()); const id = __ids(g)[0];
          g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: ${aff}, tension: 0 };
          g.npcs[id].needs = { ...g.npcs[id].needs, energy: ${energy} };
          const d = resolveAsk(g, id, 'RequestChore', chore ? '' : 'could you do the dishes', __ctx(id), chore ? { chore } : undefined).decision;
          out.push([d.accept, d.reason]);
        }
        return out;
      })()`);
      if (!v.every(x => JSON.stringify(x) === JSON.stringify(v[0]))) diffs.push(`aff=${aff} energy=${energy}: ${JSON.stringify(v)}`);
    }
  }
  check('the same verdict whichever chore is picked (12 relationship × energy cases)', diffs.length === 0, diffs.slice(0, 2).join(' | '));
  check('…and both verdicts occur in that sample', J(`(() => {
    const seen = new Set();
    for (const aff of [-3, 5]) { const g = __mess(__mk()); const id = __ids(g)[0]; g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: aff, tension: 0 };
      seen.add(resolveAsk(g, id, 'RequestChore', '', __ctx(id), { chore: 'dishes' }).decision.accept); }
    return seen.size;
  })()`) === 2);
}
check('typed `$RequestChore take the bins out` finds the trash', J(`(() => { const g = __mess(__mk()); const id = __ids(g)[0];
  const p = parseAskInput('$RequestChore take the bins out'); return resolveAsk(g, id, p.askId, p.flavor, __ctx(id)).decision.choreId; })()`) === 'trash');
check('typed `$RequestChore` naming no chore takes the chip\'s default (the first that needs doing)', J(`(() => { const g = __mess(__mk()); const id = __ids(g)[0];
  const p = parseAskInput('$RequestChore could you help me out?'); return resolveAsk(g, id, p.askId, p.flavor, __ctx(id)).decision.choreId === npcChoreOptions(g)[0].id; })()`));
check('a chip for a chore that no longer needs doing falls back to the words, else "unavailable" (never a chore you didn\'t pick)', J(`(() => { const g = __mess(__mk()); const id = __ids(g)[0];
  const sink = __obj(g, 'sink_kitchen'); sink.dishes = {}; sink.dishUnits = 0;
  return resolveAsk(g, id, 'RequestChore', '', __ctx(id), { chore: 'dishes' }).decision.reason; })()`) === 'unavailable');

// ------------------------------------------------------------------ 3
console.log('\n3. A yes queues it, and the next free moment does it');
const run = J(`(() => {
  const g = __mess(__mk()); const id = __ids(g)[0];
  const t = __ask(g, id, { chore: 'dishes' });
  const queued = g.npcs[id].flags._choreRequest;
  const before = dirtyDishScope(g, 'kitchen').units;
  const upd = __tick(g, id);
  return { accept: t.decision.accept, effects: t.directive, queued, before, after: dirtyDishScope(g, 'kitchen').units,
    activity: upd.activity, commit: upd.commitment && { id: upd.commitment.id, activity: upd.commitment.activity, room: upd.commitment.anchor.roomId },
    flagAfter: upd.flags ? upd.flags._choreRequest : 'no flags' };
})()`);
check('a yes queues the chore on them (how you asked rides along)', run.accept && run.queued && run.queued.choreId === 'dishes' && run.queued.via === 'talk', JSON.stringify(run.queued));
check('the real tick does the dishes (every dirty dish unit cleared)', run.before > 0 && run.after === 0, `${run.before} → ${run.after}`);
check('…and holds them at it: a commitment in the kitchen, "doing the dishes"', run.commit && run.commit.id === 'chore_request' && run.commit.room === 'kitchen' && run.commit.activity === 'doing the dishes' && run.activity === 'doing the dishes', JSON.stringify(run.commit));
check('…and the request is cleared once it\'s done', run.flagAfter === undefined, JSON.stringify(run.flagAfter));
check('a no queues nothing', J(`(() => { const g = __mess(__mk()); const id = __ids(g)[0];
  g.npcs[id].relPlayer = { ...g.npcs[id].relPlayer, affection: -5, tension: 0.5 };
  const t = __ask(g, id, { chore: 'dishes' }); return !t.decision.accept && !g.npcs[id].flags._choreRequest; })()`));
check('the old label-only behaviour is gone (no NPC_ACTIVITY line from the ask)', !/NPC_ACTIVITY/.test(require('fs').readFileSync(require('path').join(require('./loadgame.js').SRC, 'asks.js'), 'utf8').split('const ASK_CHORE')[1].split('const ASK_PHOTO')[0]));
check('the writer is told it will be done after the talk', /agreed — you'll do it as soon as you two are done talking/.test(run.effects));

// ------------------------------------------------------------------ 4
console.log('\n4. Each chore changes what it says');
const kinds = J(`(() => {
  const out = {};
  const doIt = (choreId) => { const g = __mess(__mk()); const id = __ids(g)[0]; queueNpcChore(g, id, choreId, 'talk'); __tick(g, id); return g; };
  let g = doIt('trash'); const bin = __obj(g, 'trash_kitchen'); out.trash = [bin.state.fill, bin.state.rotten_food];
  const toiletRoom = npcChoreOptions(__mess(__mk())).find(o => o.id.startsWith('toilet:')).id;
  g = doIt(toiletRoom); out.toilet = __obj(g, 'toilet', toiletRoom.split(':')[1]).state.clean;
  g = doIt('tidy:living_room'); out.tidy = roomDirtOf(g, 'living_room');
  g = doIt('laundry'); const w = __obj(g, 'washer'); const hm = __obj(g, 'laundry_hamper');
  out.laundry = { washer: (w.contents || []).length, hamper: (hm.contents || []).length, cycle: w.state && w.state.cycle };
  return out;
})()`);
check('the trash: the bin is emptied (fill empty, nothing rotting)', kinds.trash[0] === 'empty' && kinds.trash[1] === 'none', JSON.stringify(kinds.trash));
check('the toilet: it is clean', kinds.toilet === 'clean', kinds.toilet);
check('tidying a room: its dirt is gone', kinds.tidy === 0, String(kinds.tidy));
check('the laundry: the dirty clothes go from the hamper into a running washer', kinds.laundry.washer === 1 && kinds.laundry.hamper === 0 && kinds.laundry.cycle === 'running', JSON.stringify(kinds.laundry));

// ------------------------------------------------------------------ 5
console.log('\n5. When: not mid-talk, not asleep, not out — and by text you hear it\'s done');
const talk = J(`(() => {
  const g = __mess(__mk()); const id = __ids(g)[0];
  queueNpcChore(g, id, 'dishes', 'talk');
  g.player.flags._inConversation = true; g.player.conversation = { npcId: id, roomId: g.npcs[id].location, spoken: true };
  const r1 = tryPendingChore(g, id, g.npcs[id], { location: 'kitchen', block: 'evening' }, 1);
  delete g.player.flags._inConversation;
  const r2 = tryPendingChore(g, id, g.npcs[id], { location: 'kitchen', block: 'evening' }, 1);
  return { r1, done: r2 && r2.done };
})()`);
check('while you\'re still talking to them, it waits; the moment the talk closes, they do it', talk.r1 === null && talk.done === true, JSON.stringify(talk));
check('asleep, it waits', J(`(() => { const g = __mess(__mk()); const id = __ids(g)[0]; queueNpcChore(g, id, 'dishes', 'text');
  return tryPendingChore(g, id, g.npcs[id], { location: g.npcs[id].location, block: 'sleep' }, 1) === null; })()`));
const text = J(`(() => {
  const g = __mess(__mk()); const id = __ids(g)[0];
  g.npcs[id].location = null;   // out of the flat
  const t = __ask(g, id, { chore: 'trash' }, '', assembleImContext(g, id));
  const out = { when: t.decision.choreWhen, via: g.npcs[id].flags._choreRequest.via, note: t.directive };
  out.whileOut = tryPendingChore(g, id, g.npcs[id], { location: null, block: 'work' }, 1);
  const home = tryPendingChore(g, id, g.npcs[id], { location: 'kitchen', block: 'evening' }, 1);
  const th = g.world.computer.apps.im.threads[id];
  out.done = home && home.done;
  out.last = th && th.msgs[th.msgs.length - 1];
  out.unread = th && th.unread;
  out.bin = __obj(g, 'trash_kitchen').state.fill;
  return out;
})()`);
check('asked by text while they\'re out: "when you get home"', text.when === 'home' && text.via === 'text' && /when you get home/.test(text.note), JSON.stringify({ when: text.when, via: text.via }));
check('…nothing happens while they\'re out', text.whileOut === null);
check('…and when they\'re home they do it (the bin is emptied)', text.done === true && text.bin === 'empty', JSON.stringify({ done: text.done, bin: text.bin }));
check('…and the thread says so, as a new message', text.last && text.last.from === 'system' && /✓ .* took out the trash\./.test(text.last.text) && text.unread >= 1, JSON.stringify(text.last));
// A clock minute where this roommate's own schedule has them free / busy.
api(`__at = (g, id, busy) => {
  for (let m = 0; m < 1440; m += CLOCK.tickMinutes) {
    const clock = { ...g.meta.clock, minutes: m };
    if (COMMITMENT_TUNING.busyBlocks.includes(resolveScheduleActivity(g.npcs[id], clock).block) === busy) { g.meta.clock = clock; return true; }
  }
  return false;
}`);
check('asked by text while they\'re home and free: "you\'ll get on it now"', J(`(() => { const g = __mess(__mk()); const id = __ids(g)[0]; g.npcs[id].location = 'living_room';
  __at(g, id, false);
  return __ask(g, id, { chore: 'dishes' }, '', assembleImContext(g, id)).decision.choreWhen; })()`) === 'now');
const busyHome = J(`(() => { const g = __mess(__mk()); const id = __ids(g)[0]; g.npcs[id].location = 'hallway_a';
  if (!__at(g, id, true)) return null;
  const t = __ask(g, id, { chore: 'dishes' }, '', assembleImContext(g, id));
  return { when: t.decision.choreWhen, note: t.directive };
})()`);
check('home but their schedule has them busy (a shift, heading out, asleep): "once you\'re free", never "now"', busyHome && busyHome.when === 'later' && /once you're free/.test(busyHome.note), JSON.stringify(busyHome && busyHome.when));
check('in person while they\'re free: "as soon as you two are done talking"', J(`(() => { const g = __mess(__mk()); const id = __ids(g)[0];
  __at(g, id, false);
  const t = __ask(g, id, { chore: 'dishes' });
  return t.decision.choreWhen === 'after' && /as soon as you two are done talking/.test(t.directive); })()`));

// ------------------------------------------------------------------ 6
console.log('\n6. Housekeeping');
check('done by someone else first: the request is dropped quietly, nobody is sent to a clean sink', J(`(() => {
  const g = __mess(__mk()); const id = __ids(g)[0]; queueNpcChore(g, id, 'dishes', 'talk');
  const sink = __obj(g, 'sink_kitchen'); sink.dishes = {}; sink.dishUnits = 0;
  const r = tryPendingChore(g, id, g.npcs[id], { location: 'kitchen', block: 'evening' }, 1);
  return r && r.clearFlags && !r.done && !g.npcs[id].commitment;
})()`));
check('a request that never gets done expires after a day and a half', J(`(() => {
  const g = __mess(__mk()); const id = __ids(g)[0]; queueNpcChore(g, id, 'dishes', 'text');
  g.npcs[id].flags._choreRequest.askedAbs -= 37 * 60;
  const r = tryPendingChore(g, id, g.npcs[id], { location: null, block: 'work' }, 1);
  return r && r.clearFlags && !r.done;
})()`));
check('a drive commitment with no explicit duration still holds for its def\'s holdMinutes (openCommitment unchanged for drives)', J(`(() => {
  const g = __mk(); const id = __ids(g)[0];
  const c = openCommitment(g, id, { driveId: 'clean_common', kind: 'drive', roomId: 'kitchen', startRoom: g.npcs[id].location, score: 0.5 });
  return c.completesAtAbs - c.startedAtAbs === DRIVE_DEFS.clean_common.utility.holdMinutes;
})()`));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
