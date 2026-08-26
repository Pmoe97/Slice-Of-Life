// Peek risk + off-screen event provenance (2026-08-26 playtest fixes).
//
// Nine defects found from one exported save and one session of keyhole
// peeking. They fall into two families, and both families are the same
// mistake in different clothes: a number or a room that describes ONE thing
// being used to describe a DIFFERENT thing.
//
//   THE PEEK CURVE — peekRiskPerTick returns the risk AT tick t (a level).
//                    The caller summed it, charging baseRisk and the whole
//                    perception term again every second, so the median hold
//                    was 3 real seconds and riskAccum pinned at maxRisk by
//                    second 6. These assertions fix the SHAPE of the curve,
//                    not its exact numbers — a tuning pass must stay free to
//                    move the dials, and must not be free to re-introduce the
//                    accumulation.
//   BEING CAUGHT   — `engage` threw a ReferenceError (a const scoped to a
//                    sibling block) before the session could be torn down,
//                    and every outcome ended the hold, including the two
//                    whose whole content is that the watching continues.
//   EVENT ROOMS    — an off-screen life event (a date, a package) was stamped
//                    with whatever room the NPC was standing in, and then
//                    read back by surfaceRoomEvidence as "here is what
//                    happened in this room". A drive event was stamped with
//                    the room the NPC was LEAVING. Two drives that name a
//                    place in their own prose named no room in their data.
//
// Where these can be reached they are asserted behaviourally; peek.js's
// session lifecycle needs a DOM and a timer, so its two structural fixes are
// asserted against the source, the same treatment ui.js gets elsewhere.
const fs = require('fs');
const path = require('path');
const { loadEngine, SRC } = require('./loadgame.js');
const { api } = loadEngine({ required: ['peek.js', 'drives.js', 'sim.js', 'config.js', 'effects.js', 'settings.js', 'defs.settings.js', 'state.js'] });

const PEEKSRC = fs.readFileSync(path.join(SRC, 'peek.js'), 'utf8');
const SIMSRC = fs.readFileSync(path.join(SRC, 'sim.js'), 'utf8');
const DRIVESRC = fs.readFileSync(path.join(SRC, 'drives.js'), 'utf8');

let pass = 0, fail = 0;
async function check(name, cond, detail) {
  const c = await cond;
  if (c === true) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++;
    const d = typeof c === 'string' && c ? c : detail;
    console.log(`  FAIL  ${name}${d ? `\n        ${d}` : ''}`);
  }
}

api(`
  // A peek session shaped exactly as startPeekSession builds one, minus the
  // DOM. peekRiskPerTick and peekCaughtChance are pure and take only this.
  function sess(over) {
    return Object.assign({
      roomId: 'bedroom_1', doorId: 'd1', doorName: 'door', mode: 'peek',
      focusNpcId: 'npc_a', ticksElapsed: 0, riskAccum: 0,
      caught: false, acknowledged: false, freshImages: 0,
    }, over || {});
  }

  // A game state with one occupant whose perception we can dial. The dial has
  // to be the REAL one: getNpcPerception reads npcCuriosity (openness and
  // conscientiousness off the temperament) and needs.energy. An invented
  // field on the npc would leave both ends of the comparison identical and
  // the spread assertion would pass for the wrong reason - which is what it
  // did on the first run of this harness.
  function gsWith(openness, opts) {
    opts = opts || {};
    return {
      meta: { seed: 'peek-h', clock: { day: 3, minutes: 600 } },
      player: { location: 'hallway_a', skills: opts.skills || {}, energy: 80 },
      npcs: { npc_a: {
        bible: { name: 'Test', temperament: { openness, conscientiousness: opts.consc || 0 } },
        needs: { energy: opts.energy === undefined ? 80 : opts.energy },
        relPlayer: opts.relPlayer || {},
        residency: { status: 'resident', room: 'bedroom_1' },
      } },
      objects: {},
      world: { rooms: {} },
    };
  }

  // Survival curve for the CURRENT tuning, driven through the real functions.
  // mode 'level' is what peek.js does now; 'accum' is the bug it had.
  function holdCurve(gs, mode, ticks) {
    const s = sess();
    let surv = 1, acc = 0, median = null;
    for (let t = 1; t <= (ticks || 400); t++) {
      s.ticksElapsed = t;
      const r = peekRiskPerTick(s, gs);
      acc = Math.min(PEEK.maxRisk, mode === 'accum' ? acc + r : r);
      surv *= (1 - peekCaughtChance(acc));
      if (median === null && surv < 0.5) median = t;
    }
    return { median: median === null ? Infinity : median, surv };
  }
`);

async function main() {

console.log('\n1. the peek risk curve — a level, never a running sum');

await check('peekRiskPerTick is a pure function of the tick, not of any accumulator',
  api(`(() => {
    const gs = gsWith(0.5);
    const a = peekRiskPerTick(sess({ ticksElapsed: 5, riskAccum: 0 }), gs);
    const b = peekRiskPerTick(sess({ ticksElapsed: 5, riskAccum: 0.9 }), gs);
    if (a !== b) return 'the risk at a tick depends on riskAccum, so the two cannot be separated';
    const c = peekRiskPerTick(sess({ ticksElapsed: 6, riskAccum: 0 }), gs);
    if (!(c > a)) return 'the risk does not rise with the tick — there is no ramp';
    return true;
  })()`));

await check('peek.js ASSIGNS the risk rather than adding it (the 3-second-hold bug)',
  (() => {
    // The single line this whole section exists for. A source scan because
    // the tick loop needs a DOM and a timer; the behavioural half is the
    // curve assertions below, which only hold under the assigning reading.
    const m = PEEKSRC.match(/s\.riskAccum\s*=\s*([^;]+);/);
    if (!m) return 'peek.js no longer assigns riskAccum at all';
    if (/riskAccum\s*\+/.test(m[1])) return 'riskAccum is accumulating again: ' + m[1].trim();
    if (!/peekRiskPerTick/.test(m[1])) return 'riskAccum is no longer derived from peekRiskPerTick';
    return true;
  })());

await check('a keyhole hold survives long enough to be worth opening',
  api(`(() => {
    // The SHAPE, not the number: a tuning pass may move the dials, and this
    // has to keep passing while it does. What it may not do is go back to a
    // hold measured in single-digit seconds.
    const gs = gsWith(0.5);
    const { median } = holdCurve(gs, 'level');
    if (median < 10) return 'median hold is ' + median + 's against a typical occupant — the keyhole is unusable';
    if (median > 120) return 'median hold is ' + median + 's — being caught has stopped being a risk';
    return true;
  })()`));

await check('the old accumulating reading really was the difference (this is not a tuning illusion)',
  api(`(() => {
    const gs = gsWith(0.5);
    const level = holdCurve(gs, 'level').median;
    const accum = holdCurve(gs, 'accum').median;
    if (!(accum < level)) return 'summing the risk is no longer harsher than reading it as a level, so the fix is untested';
    if (accum > 8) return 'the accumulating reading holds ' + accum + 's, so it would not have produced the reported 2-3s';
    return true;
  })()`));

await check('perception still matters, and no longer decides the whole hold',
  api(`(() => {
    // Opposite ends of getNpcPerception's two real inputs: an incurious,
    // half-asleep occupant against a wide-awake, wide-open one.
    const sleepy = holdCurve(gsWith(-1, { energy: 10, consc: 1 }), 'level').median;
    const sharp = holdCurve(gsWith(1, { energy: 95, consc: -1 }), 'level').median;
    if (!(sleepy > sharp)) return 'a sharper occupant does not catch you sooner - perception is inert';
    // The player-facing half, and the actual complaint. Perception used to
    // make the FIRST tick a ~21% catch against a sharp occupant, before the
    // ramp had contributed anything at all: you could lose the keyhole on
    // second one, repeatedly, and no amount of care changed it. Leaning on
    // the relationship between two dials would only measure the dials; this
    // measures what the player feels.
    const worst = gsWith(1, { energy: 95, consc: -1 });
    const firstTick = peekCaughtChance(peekRiskPerTick(sess({ ticksElapsed: 1 }), worst));
    if (firstTick > 0.06) {
      return 'the very first second is a ' + (firstTick * 100).toFixed(1) + '% catch against a sharp occupant';
    }
    return true;
  })()`));

await check('stealth and a locked door both buy a materially longer hold',
  api(`(() => {
    // Both were worth under 30% of the standing risk, i.e. a skill and a
    // precaution the player could not feel.
    const gs = gsWith(0.5);
    const plain = peekRiskPerTick(sess({ ticksElapsed: 10 }), gs);
    if (!(PEEK.stealthBonus > 0 && PEEK.lockBonus > 0)) return 'one of the two mitigations is worth nothing';
    if (PEEK.stealthBonus < PEEK.baseRisk) return 'maxed stealth is worth less than the base risk';
    if (PEEK.lockBonus < PEEK.baseRisk / 2) return 'a locked door is worth almost nothing';
    if (!(plain > 0)) return 'the risk floored out, so the mitigations cannot be compared';
    return true;
  })()`));

console.log('\n2. being caught (D7/D15)');

await check('every outcome the personality gate can return has a consequence row',
  api(`(() => {
    const seen = new Set();
    for (const table of Object.values(PEEK_OUTCOMES.weightTables)) {
      for (const [k, w] of Object.entries(table)) if (w > 0) seen.add(k);
    }
    for (const k of seen) {
      if (!PEEK_OUTCOMES[k]) return 'outcome ' + k + ' is reachable and has no consequence row';
    }
    return true;
  })()`));

await check("the two outcomes that mean 'they do not mind' keep the hold alive",
  api(`(() => {
    // The player's report: being caught by someone who does not care still
    // shut the lens and threw a modal over the moment.
    if (!PEEK_OUTCOMES.ignore.continuesHold) return 'ignore still ends the hold';
    if (!PEEK_OUTCOMES.escalate.continuesHold) return 'escalate still ends the hold';
    // And the three that genuinely end it must NOT continue: stop and
    // confront are refusals, and engage opens the door and hands off to a
    // conversation (D6/D18) — there is no keyhole left to look through.
    for (const k of ['stop', 'confront', 'engage']) {
      if (PEEK_OUTCOMES[k].continuesHold) return k + ' continues the hold, but it ends the watching';
    }
    return true;
  })()`));

await check('the caught path honours continuesHold instead of always tearing down',
  (() => {
    const i = PEEKSRC.indexOf('async function _resolvePeekCaught');
    if (i < 0) return 'peek.js has no _resolvePeekCaught';
    const body = PEEKSRC.slice(i, PEEKSRC.indexOf('\n}', PEEKSRC.indexOf('presentPeekCaughtWindow(gs, s)', i)));
    // CODE lines only: the branch's own comment names continuesHold, so a
    // scan that reads comments passes on a branch that has been gutted.
    const nl = String.fromCharCode(10);
    const code = body.split(nl).filter((l) => l.trim().slice(0, 2) !== '//').join(nl);
    if (!/cfg\.continuesHold/.test(code)) return 'the caught resolution never consults continuesHold';
    if (!/s\.acknowledged\s*=\s*true/.test(code)) return 'a continuing hold does not mark itself acknowledged';
    // The tick loop must then stop rolling — otherwise the whole resolution
    // re-runs every second, re-applying its relationship deltas.
    const tick = PEEKSRC.slice(PEEKSRC.indexOf('async function _peekTick'), i);
    if (!/if\s*\(\s*!s\.acknowledged\s*\)/.test(tick)) return 'the tick loop still rolls for a catch after being acknowledged';
    return true;
  })());

await check('the engage branch cannot throw on a variable from a sibling block',
  (() => {
    // ReferenceError: effCtx is not defined — a `const` declared inside the
    // else-branch and read from outside it. engage carries weight in warm,
    // warmDeviant and neutral, so this was a common path, and the throw
    // landed before _endPeekSession, leaving the interval running.
    const i = PEEKSRC.indexOf('async function _resolvePeekCaught');
    const body = PEEKSRC.slice(i, PEEKSRC.indexOf('async function presentPeekCaughtWindow'));
    const decl = body.indexOf('const effCtx =');
    const use = body.indexOf('SET_OBJECT_STATE');
    if (decl < 0) return 'effCtx is gone entirely';
    if (use < 0) return 'the engage door-opening effect is gone';
    if (decl > use) return 'effCtx is declared after the engage branch uses it';
    // It must be declared at FUNCTION scope, not inside the else.
    const between = body.slice(decl, use);
    const closes = (between.match(/\n  \}/g) || []).length;
    if (closes === 0) return 'effCtx still appears to be nested in the branch that uses it indirectly';
    return true;
  })());

await check('the door-opening effect is parsed correctly and is not silently empty',
  api(`(() => {
    // parseEffectDSL returns an ARRAY OF EFFECT OBJECTS. The old call did
    // .map(l => l[0]) on it, mapping each object to undefined, and
    // .filter(Boolean) then dropped every one — the door never went ajar.
    const parsed = parseEffectDSL('SET_OBJECT_STATE door_1 ajar ajar');
    if (!Array.isArray(parsed) || parsed.length !== 1) return 'the DSL line no longer parses to one effect';
    if (!parsed[0] || parsed[0].type !== 'SET_OBJECT_STATE') return 'the parsed effect is not a SET_OBJECT_STATE';
    const broken = parsed.map(l => l[0]).filter(Boolean);
    if (broken.length !== 0) return 'the old buggy shape no longer produces an empty list, so this proves nothing';
    return true;
  })()`));

await check('peek.js does not re-introduce the [0]-index on a whole-string parse',
  (() => {
    const bad = PEEKSRC.split(/\r?\n/)
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => /parseEffectDSL\(`/.test(l) && /\.map\(\s*l\s*=>\s*l\[0\]/.test(l));
    if (bad.length) return 'peek.js:' + bad[0][0] + ' indexes [0] into a whole-string parse again';
    return true;
  })());

console.log('\n3. off-screen events carry the EVENT room, never the NPC room');

await check('an off-screen event is stamped from its own definition and nothing else',
  api(`(() => {
    const npc = { bible: { name: 'Test' }, flags: {} };
    const rng = seededRng('offscreen-h', 1);
    const seen = {};
    for (let i = 0; i < 400; i++) {
      const e = drawOffscreenEvent(seededRng('offscreen-h', i), 'npc_a', npc, []);
      const def = OFFSCREEN_EVENTS.find((d) => d.type === e.type);
      if (!def) return 'drew an event type that is not in the table: ' + e.type;
      const want = (def.roomId && ROOMS[def.roomId]) ? def.roomId : null;
      if (e.roomId !== want) return e.type + ' stamped ' + e.roomId + ', its definition says ' + want;
      seen[e.type] = true;
    }
    // The mix has to actually be a mix, or this proves only one branch.
    const withRoom = Object.keys(seen).filter((t) => OFFSCREEN_EVENTS.find((d) => d.type === t).roomId);
    const without = Object.keys(seen).filter((t) => !OFFSCREEN_EVENTS.find((d) => d.type === t).roomId);
    if (withRoom.length === 0 || without.length === 0) return 'the draw only produced one kind of event';
    return true;
  })()`));

await check('the events that name a room in their prose are the ones that carry a room',
  api(`(() => {
    // "broke a {item} in the kitchen", "a long nap on the couch" — if the
    // text says where, the record has to say where, and vice versa.
    for (const def of OFFSCREEN_EVENTS) {
      const namesKitchen = /kitchen|fridge/i.test(def.text);
      if (namesKitchen && def.roomId !== 'kitchen') return def.type + " says kitchen in its prose and stamps " + def.roomId;
      if (def.roomId && !ROOMS[def.roomId]) return def.type + ' names a room that does not exist: ' + def.roomId;
    }
    // And the clearly-elsewhere ones must NOT claim a room in the flat.
    for (const t of ['bad_day', 'shopping', 'date', 'good_news', 'sick']) {
      const def = OFFSCREEN_EVENTS.find((d) => d.type === t);
      if (def && def.roomId) return t + ' happens away from the apartment and stamps ' + def.roomId;
    }
    return true;
  })()`));

await check('sim.js no longer overwrites the stamp with the NPC current room',
  (() => {
    const i = SIMSRC.indexOf('drawOffscreenEvent(rng, id, npc, otherIds)');
    if (i < 0) return 'sim.js no longer draws off-screen events';
    const near = SIMSRC.slice(i, i + 3000);
    if (/evt\.roomId\s*=\s*location/.test(near)) return 'the off-screen event is stamped with the NPC location again';
    // The signal (a smoke alarm, a cooking smell) has to come from the same
    // place the event did, or it follows the cook around the flat.
    if (/roomId:\s*location,\s*intensity/.test(near)) return 'the event signal still emits from the NPC location rather than the event room';
    return true;
  })());

await check("the 'baby' event cannot be drawn by somebody with no baby",
  api(`(() => {
    const childless = { bible: { name: 'Test' }, flags: {} };
    for (let i = 0; i < 600; i++) {
      const e = drawOffscreenEvent(seededRng('baby-h', i), 'npc_a', childless, []);
      if (e.type === 'baby') return 'a childless NPC drew the baby event on draw ' + i;
    }
    // ...and a parent still can, or the fix deleted the content instead of
    // gating it.
    const parent = { bible: { name: 'Test' }, flags: { _baby: true } };
    let got = false;
    for (let i = 0; i < 600 && !got; i++) {
      if (drawOffscreenEvent(seededRng('baby-h', i), 'npc_a', parent, []).type === 'baby') got = true;
    }
    return got || 'a parent can no longer draw the baby event either';
  })()`));

console.log('\n4. drive events record where the activity HAPPENED');

await check('the drive event is stamped with the destination, not the room being left',
  (() => {
    const i = DRIVESRC.indexOf('if (drive.eventTemplate && !drive.npcToNpc)');
    if (i < 0) return 'drives.js no longer emits generic drive events';
    const body = DRIVESRC.slice(i, i + 700);
    const m = body.match(/roomId:\s*([^,]+),/);
    if (!m) return 'the drive event no longer stamps a room';
    if (!/locationOverride/.test(m[1])) return 'the stamp is ' + m[1].trim() + ' — the room the NPC walked away from';
    return true;
  })());

await check('a drive that names its rooms has rooms that exist, and never a private bedroom',
  api(`(() => {
    for (const [id, d] of Object.entries(DRIVE_DEFS)) {
      if (!d.moveToRoom) continue;
      for (const r of d.moveToRoom) {
        // 'bedroom' is the own-bedroom sentinel resolveStandardDrive expands.
        if (r === 'bedroom') continue;
        if (!ROOMS[r]) return id + ' routes to ' + r + ', which is not a room';
        if (r === 'bedroom_player') return id + " routes NPCs into the player's bedroom";
        if (ROOMS[r].type === 'bedroom') return id + ' routes to ' + r + ", somebody else's bedroom";
      }
    }
    return true;
  })()`));

await check('a drive whose prose names a place declares that place (shower, nap)',
  api(`(() => {
    // Both wrap an actionId for an object ANCHOR, which is a stand-point
    // inside a room and never a choice of room — so without moveToRoom they
    // happened wherever the NPC was standing. A shower in the living room and
    // a nap in the player's bedroom are the two the playtest actually hit.
    const shower = DRIVE_DEFS.shower;
    if (!shower.moveToRoom || !shower.moveToRoom.length) return 'shower still happens wherever the NPC is standing';
    for (const r of shower.moveToRoom) if (!/bathroom/.test(r)) return 'shower routes to ' + r;
    const nap = DRIVE_DEFS.sleep_recover;
    if (!nap.moveToRoom || !nap.moveToRoom.length) return 'sleep_recover still naps wherever the NPC is standing';
    for (const r of nap.moveToRoom) {
      if (r !== 'bedroom' && ROOMS[r].type !== 'common') return 'sleep_recover routes to ' + r + ', which is not somewhere you nap';
    }
    return true;
  })()`));

await check('moveToCommon actually moves somebody who is not already in a common room',
  (() => {
    // The guard read `drive.moveToCommon && !location`, i.e. only relocate
    // somebody who is NOWHERE. location is set every tick for every NPC, so
    // seek_company narrated "came out to the common area" and nobody moved.
    // CODE lines only: the fix's own comment quotes the old guard verbatim,
    // and a scan that reads comments fails on the explanation of the very
    // bug it is checking for - which is exactly what this did on first run.
    const guard = (DRIVESRC.match(/^\s*if \(drive\.moveToCommon.*$/m) || [])[0];
    if (!guard) return 'drives.js no longer handles moveToCommon in a code line';
    if (/&&\s*!location/.test(guard)) return 'the branch is still gated on the NPC having no location at all';
    if (!/alreadyCommon|COMMON_ROOMS/.test(guard)) return 'the guard no longer asks whether they are already in a common room';
    return true;
  })());

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

}
main();
