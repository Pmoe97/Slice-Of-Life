// ===== SECTION: HOUSE NOTES =====
// The roommates' half of the fridge (0.14.2).
//
// The perception plan built notes as ordinary world objects (world.js's
// spawnNote, the `note` OBJECT_DEF, read/bin verbs) and let only the PLAYER
// write one. Its NOTE_TEMPLATES table named "Plan 5" as the NPC-side consumer;
// the initiative plan then filed NPC-authored notes under "tier 2, largely
// built" (its D6) and nothing ever wrote one. So you could stick a note on the
// fridge and nobody would ever read it, answer it, or leave you one back.
//
// This module is the whole NPC side, run once per resolveTick from sim.js
// (resolveHouseNotesTick) on each resident's FINAL location for the tick:
//
//   1. TIDY  — an author takes their own note down once you've read it and a
//              couple of days have passed (never yours).
//   2. READ  — a resident reads every note in the room they're standing in,
//              yours included, and catches up on new replies. Reading one of
//              YOUR notes (or what you wrote back on theirs) lands in their
//              memory as an episode with the words in it, so it can come up
//              in conversation; a note ADDRESSED to them that thanks or
//              scolds them moves the relationship a hair, once a day.
//   3. REPLY — having read a note, they may scrawl a short line on the
//              bottom of it ("wasn't me", "ask Jun", "legend."), voiced by
//              their texting style. A reply flips the note back to unread so
//              it catches your eye again.
//   4. WRITE — at the fridge, with you out of the room, a resident with a
//              REAL, stored reason may leave a note of their own: a full
//              sink, a full bin, a noise or thermostat complaint they already
//              made, something rotten they binned, leftovers they cooked, a
//              repair you paid for. Nothing is invented; every motive reads
//              state another system already keeps.
//
// Deterministic and stream-isolated: rolls come from a per-NPC seededRng
// keyed on (day, minute, npc) or a pure hash of the note id — never the
// tick's shared rng, so adding notes to the world moves no other roll.
// Numbers and every line of text live in config.js (HOUSE_NOTE_TUNING,
// NOTE_TEMPLATES, NOTE_REPLY_LINES).

// Bookkeeping that belongs to the house, not to any one note: when each
// author last wrote (and about what), how many notes went up today, and which
// addressed note last moved whom. world.houseNotes, in SAVE_KEYS with an
// additive default; filled lazily here like occasions.js's ensureWorldOccasions.
function ensureHouseNotes(gs) {
  const world = gs.world || (gs.world = {});
  const hn = (world.houseNotes && typeof world.houseNotes === 'object') ? world.houseNotes : (world.houseNotes = {});
  if (!hn.motiveDay || typeof hn.motiveDay !== 'object') hn.motiveDay = {};   // `${npcId}|${motive}` → day written
  if (!hn.authorDay || typeof hn.authorDay !== 'object') hn.authorDay = {};   // npcId → day they last wrote one
  if (!hn.houseDay || typeof hn.houseDay !== 'object') hn.houseDay = { day: 0, count: 0 };
  if (!hn.feltDay || typeof hn.feltDay !== 'object') hn.feltDay = {};         // `${npcId}|warm|gripe` → day
  return hn;
}

// --- Small readers ---------------------------------------------------------

function houseNoteName(gs, id) {
  if (id === 'player') return 'you';
  return gs?.npcs?.[id]?.bible?.name || 'someone';
}

function houseNoteResidents(gs) {
  return Object.keys(gs?.npcs || {}).filter(id => gs.npcs[id]?.residency?.status === 'resident');
}

function notesInRoom(gs, roomId) {
  return Object.values(gs?.objects?.[`room_${roomId}`] || {})
    .filter(o => o && o.defId === 'note')
    .sort((a, b) => (a.meta?.day || 0) - (b.meta?.day || 0));
}

// The note body plus every reply, in order — the "parts" a reader catches up
// on. meta.readBy[id] counts how many parts that person has seen.
function noteParts(note) {
  const m = note?.meta || {};
  const parts = [{ authorId: m.authorId || 'player', text: m.text || '', day: m.day }];
  for (const r of Array.isArray(m.replies) ? m.replies : []) if (r && r.text) parts.push(r);
  return parts;
}

function noteSeenCount(note, id) {
  const n = note?.meta?.readBy?.[id];
  return typeof n === 'number' ? n : 0;
}

function markNoteSeen(note, id) {
  if (!note.meta) note.meta = {};
  note.meta.readBy = { ...(note.meta.readBy || {}), [id]: noteParts(note).length };
}

// What the note is stuck to, for prose ("the fridge"). Falls back to "wall".
function noteSurfaceLabel(gs, note, roomId) {
  const id = note?.meta?.attachedTo;
  const obj = id ? gs?.objects?.[`room_${roomId}`]?.[id] : null;
  const def = obj ? OBJECT_DEFS[obj.defId] : null;
  return def ? def.label.toLowerCase() : 'wall';
}

function houseNoteMentions(text, name) {
  if (!name) return false;
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${esc}\\b`, 'i').test(String(text || ''));
}

function hash01(key) {
  return hashStr(String(key)) / 4294967296;
}

function fillNoteText(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

// A line from a { style: [lines] } pool in the writer's own voice — the
// BIRTHDAY_TUNING convention: the author's bible.speech.textingStyle, then
// `default`. `accept` filters lines (a {other} line with nobody to name).
function pickStyledNoteLine(pools, npc, salt, accept) {
  if (!pools) return '';
  const style = npc?.bible?.speech?.textingStyle;
  let pool = (style && pools[style]) || pools.default || [];
  if (accept) pool = pool.filter(accept);
  if (pool.length === 0 && accept) pool = (pools.default || []).filter(accept);
  if (pool.length === 0) return '';
  return pool[hashStr(String(salt)) % pool.length];
}

// "Bathroom A Plumbing" → "bathroom A plumbing": prose-case, keeping a
// one-letter designator the way people say it.
function facilityPhrase(label) {
  return String(label || '').split(/\s+/).map(w => (w.length === 1 ? w : w.toLowerCase())).join(' ');
}

// How a housemate feels about the note's author: fondness and friction, from
// relPlayer for you and the cast web for another housemate.
function houseNoteFeelings(gs, fromId, toId) {
  if (toId === 'player') {
    const rel = gs?.npcs?.[fromId]?.relPlayer || {};
    return { affection: rel.affection || 0, tension: rel.tension || 0 };
  }
  const key = [fromId, toId].sort().join('|');
  const ax = gs?.world?.castWeb?.[key]?.axes?.[`${fromId}→${toId}`] || {};
  return { affection: ax.affection || 0, tension: ax.tension || 0 };
}

// --- Reading a player's free text ------------------------------------------
// Free text is always valid; this only decides what KIND of reply fits.
// HOUSE_NOTE_TUNING's patterns, in its documented precedence.
let houseNotePatternCache = null;
function houseNotePatterns() {
  if (houseNotePatternCache) return houseNotePatternCache;
  const T = HOUSE_NOTE_TUNING;
  houseNotePatternCache = {
    strong: new RegExp(T.strongGripePattern, 'i'),
    thanks: new RegExp(T.thanksPattern, 'i'),
    wish: new RegExp(T.wishPattern, 'i'),
    offer: new RegExp(T.offerPattern, 'i'),
    weak: new RegExp(T.weakGripePattern, 'i'),
  };
  return houseNotePatternCache;
}

function classifyNoteText(text) {
  const t = String(text || '');
  const p = houseNotePatterns();
  if (p.strong.test(t)) return 'gripe';
  if (p.thanks.test(t)) return 'thanks';
  if (p.wish.test(t)) return 'wish';
  if (p.offer.test(t)) return 'offer';
  if (p.weak.test(t)) return 'gripe';
  if (t.includes('?')) return 'question';
  return 'plain';
}

// A note's kind for replying to it: an NPC note carries its motive's
// replyKind; a player note is read from its words.
function noteKind(note) {
  const m = note?.meta || {};
  if (m.authorId && m.authorId !== 'player') {
    const motive = HOUSE_NOTE_TUNING.motives[m.motive];
    if (motive?.replyKind) return motive.replyKind;
  }
  return classifyNoteText(m.text);
}

// --- 1. Tidy ----------------------------------------------------------------

function tidyOwnNotes(gs, npcId, roomId, day) {
  const T = HOUSE_NOTE_TUNING;
  const bucket = gs.objects?.[`room_${roomId}`];
  if (!bucket) return 0;
  let removed = 0;
  for (const note of notesInRoom(gs, roomId)) {
    if (note.meta?.authorId !== npcId) continue;
    const age = day - (note.meta?.day ?? day);
    const seen = (note.state?.read || 'unread') === 'read';
    if ((seen && age >= T.takeDownAfterReadDays) || age >= T.maxAgeDays) {
      delete bucket[note.id];
      removed++;
    }
  }
  return removed;
}

// --- 2 & 3. Read and reply --------------------------------------------------

// Can this housemate answer this note, and which reply pool fits? null when
// they can't or shouldn't: their own note, a full note, one they already
// answered, one addressed to someone else, one about someone else by name,
// or a well-wish that isn't theirs to accept.
function noteReplyPool(gs, note, replierId) {
  const T = HOUSE_NOTE_TUNING;
  const m = note?.meta || {};
  if (!m.authorId || m.authorId === replierId) return null;
  const replies = Array.isArray(m.replies) ? m.replies : [];
  if (replies.length >= T.maxReplies) return null;
  if (replies.some(r => r && r.authorId === replierId)) return null;
  if (m.addressedTo && m.addressedTo !== replierId) return null;
  const myName = gs.npcs?.[replierId]?.bible?.name;
  const named = houseNoteMentions(m.text, myName);
  const namesOther = houseNoteResidents(gs).some(id => id !== replierId && houseNoteMentions(m.text, gs.npcs[id]?.bible?.name));
  if (namesOther && !named) return null;
  const targeted = m.addressedTo === replierId || named;
  const kind = noteKind(note);
  if (kind === 'wish' && !targeted) return null;
  return { kind, targeted };
}

function noteReplyChance(gs, note, replierId, kind, targeted) {
  const T = HOUSE_NOTE_TUNING;
  const { affection } = houseNoteFeelings(gs, replierId, note.meta.authorId);
  let p = T.replyBaseChance * (targeted ? T.replyTargetedMult : 1) * (1 + T.replyAffectionWeight * affection);
  if (kind === 'plain') p *= T.replyPlainMult;
  return Math.max(0, Math.min(T.replyMaxChance, p));
}

// The line itself. A complaint gets sorry or defensive by temperament and by
// how they feel about whoever wrote it; everything else maps straight to a pool.
function composeNoteReply(gs, note, replierId, kind) {
  const T = HOUSE_NOTE_TUNING;
  const npc = gs.npcs[replierId];
  const authorId = note.meta.authorId;
  let poolKey = { thanks: 'thanked', wish: 'touched', offer: 'grateful', question: 'question', plain: 'plain', news: 'cheer' }[kind];
  if (kind === 'gripe') {
    const t = npc?.bible?.temperament || {};
    const f = houseNoteFeelings(gs, replierId, authorId);
    const jitter = (hash01(`${note.id}|${replierId}|tone`) - 0.5) * 2 * T.sorryJitter;
    const s = T.sorryWarmth * (t.warmth || 0) + T.sorryAffection * f.affection
      - T.sorryVolatility * (t.volatility || 0) - T.sorryTension * f.tension + jitter;
    poolKey = s >= 0 ? 'sorry' : 'defensive';
  }
  const others = houseNoteResidents(gs).filter(id => id !== replierId && id !== authorId && gs.npcs[id]?.bible?.name);
  const other = others.length ? gs.npcs[others[hashStr(`${note.id}|${replierId}|other`) % others.length]].bible.name : null;
  const line = pickStyledNoteLine(NOTE_REPLY_LINES[poolKey], npc, `${note.id}|${replierId}|line`,
    other ? null : (l => !l.includes('{other}')));
  return line ? { text: fillNoteText(line, { other }), poolKey } : null;
}

// String.replace (formatEventText, chatter) reads `$&`, `$1` in a
// replacement string; a player can type anything, so double the dollars.
function eventSafe(text) {
  return String(text || '').replace(/\$/g, '$$$$');
}

function readNotesHere(gs, npcId, roomId, day, tick, out) {
  const T = HOUSE_NOTE_TUNING;
  const hn = ensureHouseNotes(gs);
  const npc = gs.npcs[npcId];
  for (const note of notesInRoom(gs, roomId)) {
    const parts = noteParts(note);
    const seen = noteSeenCount(note, npcId);
    if (seen >= parts.length) continue;
    const m = note.meta || {};
    const surface = noteSurfaceLabel(gs, note, roomId);
    const firstRead = seen === 0;
    markNoteSeen(note, npcId);

    // Your words reach their memory, verbatim — including what you wrote
    // back on the bottom of their OWN note.
    for (let i = seen; i < parts.length; i++) {
      const part = parts[i];
      if (part.authorId !== 'player') continue;
      const onWhose = m.authorId === 'player' ? null : (m.authorId === npcId ? 'their' : `${houseNoteName(gs, m.authorId)}'s`);
      out.events.push({
        day, tick, roomId, npcId, type: 'note_read', moodDelta: 0,
        importance: MEMORY_IMPORTANCE.social,
        data: onWhose ? { surface, whose: onWhose, text: eventSafe(part.text) } : { surface, text: eventSafe(part.text) },
        template: onWhose
          ? '{name} read what you wrote on {whose} note on the {surface}: "{text}"'
          : '{name} read the note you left on the {surface}: "{text}"',
        seenByPlayer: false,
      });
    }
    if (m.authorId === npcId) continue;
    // Another housemate's note: remembered, quietly (the player never gets a
    // "Jun read Mira's note" line — only the reply, if there is one).
    if (firstRead && m.authorId !== 'player') {
      out.events.push({
        day, tick, roomId, npcId, type: 'note_read', moodDelta: 0,
        importance: MEMORY_IMPORTANCE.ambient,
        data: { surface, author: houseNoteName(gs, m.authorId), text: eventSafe(m.text) },
        template: "{name} read {author}'s note on the {surface}: \"{text}\"",
        seenByPlayer: true,
      });
    }
    if (!firstRead) continue;

    // A note of yours ADDRESSED to them lands, a little, once a day.
    if (m.authorId === 'player' && m.addressedTo === npcId) {
      const cls = classifyNoteText(m.text);
      if ((cls === 'thanks' || cls === 'wish') && hn.feltDay[`${npcId}|warm`] !== day) {
        hn.feltDay[`${npcId}|warm`] = day;
        out.relDeltas.push({ a: npcId, b: 'player', deltas: { affection: T.thanksAffection } });
      } else if (cls === 'gripe' && hn.feltDay[`${npcId}|gripe`] !== day) {
        hn.feltDay[`${npcId}|gripe`] = day;
        out.relDeltas.push({ a: npcId, b: 'player', deltas: { tension: T.gripeTension } });
      }
    }

    // Maybe answer it — a pure hash of (note, reader), so a reload replays
    // the same decision and no other roll moves.
    const fit = noteReplyPool(gs, note, npcId);
    if (!fit) continue;
    if (hash01(`${gs.meta?.seed}|reply|${note.id}|${npcId}`) >= noteReplyChance(gs, note, npcId, fit.kind, fit.targeted)) continue;
    const reply = composeNoteReply(gs, note, npcId, fit.kind);
    if (!reply) continue;
    note.meta.replies = [...(Array.isArray(m.replies) ? m.replies : []), { authorId: npcId, text: reply.text, day }];
    markNoteSeen(note, npcId);
    // New writing on it: it catches your eye again.
    note.state = { ...note.state, read: 'unread' };
    out.events.push({
      day, tick, roomId, npcId, type: 'note_reply', moodDelta: 0,
      importance: MEMORY_IMPORTANCE.ambient,
      data: { whose: m.authorId === 'player' ? 'your' : `${houseNoteName(gs, m.authorId)}'s`, surface },
      template: '{name} scribbled something on the bottom of {whose} note on the {surface}.',
      seenByPlayer: false,
    });
  }
}

// --- 4. Write ----------------------------------------------------------------

function fridgeHasLeftover(gs, items) {
  const fridge = Object.values(gs.objects?.[`room_${HOUSE_NOTE_TUNING.npcWriteRoom}`] || {}).find(o => o.defId === 'fridge');
  const want = String(items || '').toLowerCase();
  return !!fridge && (fridge.contents || []).some(s => s && s.defId === 'cooked_meal'
    && (s.meta?.plate?.servings?.left ?? 0) > 0
    && String(s.meta?.plate?.label || '').toLowerCase() === want);
}

// A repair or upgrade you booked that finished in the last few days, in a
// room everyone shares (a bedroom's habitability job is its occupant's
// business, and a structural job has no facility to name).
function recentRepairJob(gs, day) {
  const jobs = Array.isArray(gs.world?.renovationJobs) ? gs.world.renovationJobs : [];
  let best = null;
  for (const job of jobs) {
    if (!job || job.status !== 'complete' || !job.facilityId || !FACILITY_DEFS[job.facilityId]) continue;
    if (String(job.facilityId).startsWith('bedroom_habitability')) continue;
    const done = job.etaDay;
    if (typeof done !== 'number' || done > day || day - done >= HOUSE_NOTE_TUNING.repairThanksDays) continue;
    if (!best || done > best.etaDay) best = job;
  }
  return best;
}

// Every note this housemate has a real reason to write right now, in the
// order they'd write them. Each reads state another system already keeps.
function houseNoteMotives(gs, npcId, day) {
  const T = HOUSE_NOTE_TUNING;
  const npc = gs.npcs[npcId];
  const out = [];
  const room = Object.values(gs.objects?.[`room_${T.npcWriteRoom}`] || {});
  const sink = room.find(o => o.defId === 'sink_kitchen');
  if (sink && typeof dishLevelOf === 'function' && dishLevelOf(sink) === 'many') out.push({ motive: 'dishes' });
  const bin = room.find(o => o.defId === 'trash_kitchen');
  if (bin && bin.state?.fill === 'full') out.push({ motive: 'bins' });

  const recent = (gs.world?.events || []).filter(e => e && e.npcId === npcId && typeof e.day === 'number'
    && e.day <= day && e.day >= day - T.recentEventDays);
  // practice_complaint (projects.js): a roommate's guitar or decks, not yours —
  // a house note about noise is aimed at the whole fridge either way.
  if (recent.some(e => e.type === 'music_too_loud' || e.type === 'party_loud' || e.type === 'practice_complaint')) out.push({ motive: 'noise' });
  const temp = recent.filter(e => e.type === 'temperature_complaint' && typeof e.data?.cold === 'boolean').pop();
  if (temp) out.push({ motive: temp.data.cold ? 'cold' : 'hot' });
  const binned = recent.filter(e => e.type === 'investigate_smell' && e.data?.container).pop();
  if (binned) out.push({ motive: 'binned', vars: { container: String(binned.data.container).toLowerCase() } });

  if ((npc?.relPlayer?.affection || 0) >= T.warmMinAffection) {
    const cooked = recent.filter(e => e.type === 'eat' && e.day === day && e.data?.cooked && e.data?.items).pop();
    if (cooked && fridgeHasLeftover(gs, cooked.data.items)) {
      out.push({ motive: 'leftovers', vars: { items: String(cooked.data.items).toLowerCase() }, addressedTo: 'player' });
    }
    const job = recentRepairJob(gs, day);
    if (job) out.push({ motive: 'thanks_repair', vars: { facility: facilityPhrase(FACILITY_DEFS[job.facilityId].label) }, addressedTo: 'player' });
  }
  // Side Projects (projects.js, 0.14.2): a project they just finished, or a
  // bake in progress in this kitchen today. typeof-guarded: projects.js loads
  // after this file.
  if (typeof projectNoteMotives === 'function') out.push(...projectNoteMotives(gs, npcId, day));
  return out;
}

// Gripes come from the tidy and the unassertive; warm notes from the warm.
function passiveAggression(npc) {
  const T = HOUSE_NOTE_TUNING;
  const t = npc?.bible?.temperament || {};
  return Math.max(0, Math.min(1, T.paBase + T.paConscientiousness * (t.conscientiousness || 0)
    - T.paAssertiveness * (t.assertiveness || 0) - T.paWarmth * (t.warmth || 0)));
}

function houseNoteChancePerMinute(npc, motive) {
  const T = HOUSE_NOTE_TUNING;
  // Side Projects: news about your own project comes from the warm and the
  // assertive — people who like to share — never from passive aggression.
  if (T.motives[motive]?.proud) {
    const t = npc?.bible?.temperament || {};
    return T.proudChancePerMinute * Math.max(0, Math.min(1, T.proudBase + T.proudWarmth * (t.warmth || 0) + T.proudAssertiveness * (t.assertiveness || 0)));
  }
  if (T.motives[motive]?.warm) {
    const w = npc?.bible?.temperament?.warmth || 0;
    return T.warmChancePerMinute * Math.max(0, Math.min(1, T.warmBase + T.warmWarmth * w));
  }
  return T.gripeChancePerMinute * passiveAggression(npc);
}

function writeHouseNote(gs, npcId, roomId, cand, day, tick) {
  const T = HOUSE_NOTE_TUNING;
  const npc = gs.npcs[npcId];
  const def = T.motives[cand.motive];
  const vars = cand.vars || {};
  const line = pickStyledNoteLine(NOTE_TEMPLATES[cand.motive], npc, `${gs.meta?.seed}|note|${npcId}|${cand.motive}|${day}`);
  const text = fillNoteText(line, vars);
  if (!text) return null;
  const roomObjs = Object.values(gs.objects?.[`room_${roomId}`] || {});
  const board = roomObjs.find(o => o.defId === 'fridge') || roomObjs.find(o => OBJECT_DEFS[o.defId]?.surfaces);
  const note = spawnNote(gs, { roomId, attachedTo: board?.id || null, authorId: npcId, text, addressedTo: cand.addressedTo || null });
  if (!note) return null;
  note.meta.motive = cand.motive;
  markNoteSeen(note, npcId);
  const hn = ensureHouseNotes(gs);
  hn.motiveDay[`${npcId}|${cand.motive}`] = day;
  hn.authorDay[npcId] = day;
  hn.houseDay = hn.houseDay.day === day ? { day, count: hn.houseDay.count + 1 } : { day, count: 1 };
  const surface = noteSurfaceLabel(gs, note, roomId);
  // Both types spelled out as literals: verify-i2 finds every emittable event
  // type by scanning for them, so a ternary would hide two real types.
  const kind = def.warm
    ? { type: 'note_left_warm', template: '{name} left you a note on the {surface} about {about}.' }
    : { type: 'note_left', template: '{name} stuck a note on the {surface} about {about}.' };
  return {
    day, tick, roomId, npcId, ...kind, moodDelta: 0,
    data: { surface, about: fillNoteText(def.about, vars) },
    seenByPlayer: false,
  };
}

function maybeWriteHouseNote(gs, npcId, roomId, day, minutes, minutesThisTick, tick) {
  const T = HOUSE_NOTE_TUNING;
  const hn = ensureHouseNotes(gs);
  if (hn.authorDay[npcId] === day) return null;
  if (hn.houseDay.day === day && hn.houseDay.count >= T.maxNpcNotesPerDay) return null;
  const up = new Set(notesInRoom(gs, roomId).map(n => n.meta?.motive).filter(Boolean));
  const cands = houseNoteMotives(gs, npcId, day).filter(c => {
    if (up.has(c.motive)) return false;
    const last = hn.motiveDay[`${npcId}|${c.motive}`];
    return !(typeof last === 'number' && day - last < T.motiveCooldownDays);
  });
  if (cands.length === 0) return null;
  const rng = seededRng(gs.meta?.seed, `housenotes_${day}_${minutes}_${npcId}`);
  const npc = gs.npcs[npcId];
  for (const cand of cands) {
    if (rng() < chanceOverMinutes(houseNoteChancePerMinute(npc, cand.motive), minutesThisTick)) {
      return writeHouseNote(gs, npcId, roomId, cand, day, tick);
    }
  }
  return null;
}

// --- The tick pass ------------------------------------------------------------
// Called from resolveTick after the proximity pass, on each resident's FINAL
// location (post-drive npcUpdates). Awake, onsite residents only. Returns
// { events, relDeltas } for resolveTick to merge — events become memory
// episodes in UI's advanceAndResolve like every other tick event.
function resolveHouseNotesTick(gs, npcUpdates, activeNpcIds, minutesThisTick) {
  const out = { events: [], relDeltas: [] };
  const clock = gs?.meta?.clock;
  if (!clock || !gs.objects) return out;
  const day = clock.day;
  const minutes = clock.minutes;
  const tick = getTickIndex(minutes);
  const T = HOUSE_NOTE_TUNING;
  for (const id of activeNpcIds || []) {
    const npc = gs.npcs?.[id];
    if (!npc || npc.residency?.status !== 'resident') continue;
    const u = npcUpdates?.[id] || {};
    const location = u.location !== undefined ? u.location : npc.location;
    if (!location || !ROOMS[location]) continue;
    const activity = u.activity !== undefined ? u.activity : npc.activity;
    if (npcIsAsleep({ activity })) continue;
    const block = u.schedule?.currentBlock ?? npc.schedule?.currentBlock;
    if (block === 'sleep') continue;
    tidyOwnNotes(gs, id, location, day);
    readNotesHere(gs, id, location, day, tick, out);
    const transit = u.transit !== undefined ? u.transit : npc.transit;
    if (location === T.npcWriteRoom && !transit && gs.player?.location !== location) {
      const evt = maybeWriteHouseNote(gs, id, location, day, minutes, minutesThisTick, tick);
      if (evt) out.events.push(evt);
    }
  }
  return out;
}

// --- The player's side ----------------------------------------------------------

// The read narration (defs.actions.js's readNoteNarration delegates here):
// whose hand, who it's for, the words, everything scrawled underneath, and —
// on a note of yours — who has seen it. Three attribution cases written out
// rather than composed from a fragment ("A note, in Hana:" is what a
// `${name}` slot produces, and it is wrong).
function noteReadingText(gs, note) {
  const m = note?.meta || {};
  const authorId = m.authorId;
  const name = authorId === 'player' ? null : gs?.npcs?.[authorId]?.bible?.name;
  const attribution = authorId === 'player'
    ? 'in your own handwriting'
    : (name ? `in ${name}'s handwriting` : "in handwriting you don't recognise");
  const forWhom = m.addressedTo === 'player' ? ' for you'
    : (m.addressedTo && gs?.npcs?.[m.addressedTo]?.bible?.name ? ` for ${gs.npcs[m.addressedTo].bible.name}` : '');
  let out = `A note${forWhom}, ${attribution}:\n\n    "${m.text || ''}"`;
  const replies = (Array.isArray(m.replies) ? m.replies : []).filter(r => r && r.text);
  replies.forEach((r, i) => {
    const hand = r.authorId === 'player' ? 'your handwriting'
      : (gs?.npcs?.[r.authorId]?.bible?.name ? `${gs.npcs[r.authorId].bible.name}'s handwriting` : 'another hand');
    out += `\n${i === 0 ? '\nUnderneath' : 'Below that'}, in ${hand}: "${r.text}"`;
  });
  if (authorId === 'player') {
    const readers = Object.keys(m.readBy || {}).filter(id => id !== 'player' && gs?.npcs?.[id]?.bible?.name)
      .map(id => gs.npcs[id].bible.name);
    out += readers.length === 0 ? '\n\n(Nobody has read it yet.)'
      : `\n\n(Seen by ${readers.length === 1 ? readers[0] : `${readers.slice(0, -1).join(', ')} and ${readers[readers.length - 1]}`}.)`;
  }
  return out;
}

// The note the player can "Write Back" on here: the newest one by someone
// else that you've already read, not addressed to another housemate, with
// room left and no reply of yours on it yet.
function playerReplyableNote(gs, roomId) {
  const T = HOUSE_NOTE_TUNING;
  const cands = notesInRoom(gs, roomId).filter(n => {
    const m = n.meta || {};
    if (!m.authorId || m.authorId === 'player' || !gs.npcs?.[m.authorId]) return false;
    if ((n.state?.read || 'unread') !== 'read') return false;
    if (m.addressedTo && m.addressedTo !== 'player') return false;
    const replies = Array.isArray(m.replies) ? m.replies : [];
    return replies.length < T.maxReplies && !replies.some(r => r && r.authorId === 'player');
  });
  return cands.length ? cands[cands.length - 1] : null;
}

// The player's reply, written on the bottom of someone's note. Every
// housemate who has read it now has something new to catch up on.
function addPlayerNoteReply(gs, noteId, roomId, text) {
  const note = gs.objects?.[`room_${roomId}`]?.[noteId];
  const clean = String(text || '').trim().slice(0, NOTE_TUNING.maxLength);
  if (!note || note.defId !== 'note' || !clean) return null;
  const replies = Array.isArray(note.meta?.replies) ? note.meta.replies : [];
  if (replies.length >= HOUSE_NOTE_TUNING.maxReplies) return null;
  note.meta.replies = [...replies, { authorId: 'player', text: clean, day: gs.meta?.clock?.day ?? 1 }];
  return note;
}

// ===== /SECTION: HOUSE NOTES =====
