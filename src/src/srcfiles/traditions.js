// ===== SECTION: TRADITIONS =====
// What people DO on the calendar's days (occasions-and-holidays-plan.md Phases
// 4–8, D17–D22). occasions.js answers "what is today"; this module builds what
// the traditions on each row actually are — engine by engine, every one riding
// a system that already exists (D17): items and your bag, notes on a wall,
// commitments, Chatter, the front door, the mailbox, memory. R1 binds every
// line (no religion, ever); R2 says who takes part is FESTIVITY for that
// occasion, never identity; R5/R6 say derived and deterministic — a hash of
// (person, occasion, year), never a live roll a reload could change.
//
//   P4  gifts     presents, Valentine's cards (and the unsigned one), luck
//                 envelopes, small nightly gifts; an occasion bonus on the
//                 presents YOU give, once per person per occasion (D18)
//   P5  feasts    the most festive free resident hosts a household meal/party
//                 (a real commitment); attendance is recorded by sim.js's
//                 per-tick passes; the payoff is the next rollover (D19)
//   P6  rituals   your verbs (light the lantern, watch the moon, the
//                 countdown…) inside their windows, and what the house does at
//                 midnight — the countdown fires at the rollover onto New
//                 Year's Day with whoever is in the room (D20)
//   P7  playful   pranks, costumes, trick-or-treaters at the door, the
//                 powder fight, the egg hunt, Giving Week's kindnesses and its
//                 coin jar (D21)
//   P8  world     anniversaries, holiday Chatter posts and mail, Sale Day (D22)
//   beats         the smaller traditions, one data row each (TRADITION_TUNING.beats)
//
// The one STORED state is world.occasions.trad (a response, per the roadmap's
// invariant 2): the once-per-year ledger, the lantern count, the hidden eggs,
// the jar, the day's costumes. Everything else is derived.
//
// Pure-ish domain logic, no DOM, no model calls. processTraditionsForDay is
// called from processOccasionsForDay (occasions.js), i.e. once per day crossed.

// --- State & small helpers -------------------------------------------------------

function tradState(gs) {
  const occ = ensureWorldOccasions(gs);
  if (!occ.trad || typeof occ.trad !== 'object') occ.trad = {};
  const t = occ.trad;
  if (!t.done || typeof t.done !== 'object') t.done = {};
  if (!t.lanterns || typeof t.lanterns !== 'object') t.lanterns = { year: 0, nights: {} };
  if (!t.lanterns.nights || typeof t.lanterns.nights !== 'object') t.lanterns.nights = {};
  if (!t.eggs || typeof t.eggs !== 'object') t.eggs = { year: 0, rooms: {}, found: {}, hiddenBy: null };
  if (!t.jar || typeof t.jar !== 'object') t.jar = { year: 0, coins: 0 };
  if (!t.costumes || typeof t.costumes !== 'object') t.costumes = { day: 0, by: {} };
  if (!t.ritual || typeof t.ritual !== 'object') t.ritual = {};
  return t;
}

// True the FIRST time a key is seen (and records it). Keys are
// `<kind>|<occasionId>|<year>|…`, so old years can be pruned.
function tradOnce(gs, key) {
  const t = tradState(gs);
  if (t.done[key]) return false;
  t.done[key] = true;
  return true;
}

function tradPrune(gs, year) {
  const t = tradState(gs);
  for (const k of Object.keys(t.done)) {
    const y = Number(k.split('|')[2]);
    if (Number.isFinite(y) && y < year - TRADITION_TUNING.keepYears) delete t.done[k];
  }
}

function tradHash01(...parts) {
  return (hashStr(parts.join('|')) % 100000) / 100000;
}

function tradFill(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

function tradCap(s) {
  const t = String(s || '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function tradResidents(gs) {
  return Object.keys(gs?.npcs || {}).filter(id => gs.npcs[id]?.residency?.status === 'resident').sort();
}

function tradName(gs, id) {
  return gs?.npcs?.[id]?.bible?.name || 'A roommate';
}

function tradNames(gs, ids) {
  const names = ids.map(id => tradName(gs, id));
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

// Off the clock for the holiday (occasions.js's work model).
function tradFree(gs, id, day) {
  const plan = typeof holidayWorkPlan === 'function' ? holidayWorkPlan(gs.npcs[id], day) : null;
  return !(plan && plan.works);
}

function tradAffinity(gs, id, occId) {
  return npcOccasionAffinity(gs.npcs[id], occId);
}

function tradMood(gs, id, delta) {
  if (!delta || !gs.npcs[id]) return;
  const npc = gs.npcs[id];
  gs.npcs[id] = { ...npc, mood: Math.max(-1, Math.min(1, (npc.mood || 0) + delta)) };
}

function tradMemory(gs, id, text, day, importance) {
  if (!gs.npcs[id] || !text) return;
  gs.npcs[id] = addMemoryFact(gs.npcs[id], { text, day, importance: importance ?? TRADITION_TUNING.feast.factImportance, category: 'relationship' });
}

function tradBond(gs, a, b, amount) {
  if (!amount || a === b) return;
  let web = gs.world.castWeb || {};
  web = applyNpcToNpcDelta(web, a, b, { affection: amount });
  web = applyNpcToNpcDelta(web, b, a, { affection: amount });
  gs.world.castWeb = web;
}

function tradBondAll(gs, ids, amount) {
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) tradBond(gs, ids[i], ids[j], amount);
}

function tradTension(gs, a, b, delta) {
  let web = gs.world.castWeb || {};
  web = applyNpcToNpcDelta(web, a, b, { tension: delta });
  web = applyNpcToNpcDelta(web, b, a, { tension: delta });
  gs.world.castWeb = web;
}

function tradCastTension(gs, a, b) {
  const key = [a, b].sort().join('|');
  const pair = gs?.world?.castWeb?.[key];
  return Math.max(pair?.axes?.[`${a}→${b}`]?.tension || 0, pair?.axes?.[`${b}→${a}`]?.tension || 0);
}

function tradEffects(gs, lines) {
  const ctx = buildEffectContext(gs, [], [], {}, []);
  applyEffects(parseEffectDSL(lines), ctx);
}

function tradGive(gs, defId, qty, to) {
  if (!ITEM_DEFS[defId]) return false;
  tradEffects(gs, `SPAWN_ITEM ${defId} ${qty || 1} ${to || 'player'}`);
  return true;
}

function tradFridgeId(gs) {
  const f = Object.values(gs.objects?.room_kitchen || {}).find(o => o.defId === 'fridge');
  return f ? f.id : null;
}

function tradEvent(gs, evt) {
  const w = gs.world || (gs.world = {});
  if (!Array.isArray(w.events)) w.events = [];
  w.events.push(evt);
}

// A Chatter post by an NPC (the same shape chatter.js writes). Silent when the
// feed doesn't exist yet.
function tradPost(gs, authorId, text, day) {
  const feed = gs.world?.computer?.apps?.social_feed;
  if (!feed || !Array.isArray(feed.posts) || typeof feed.nextPostId !== 'number') return false;
  feed.posts.push({ id: 'post_' + (feed.nextPostId++), author: authorId, text, likes: [], comments: [], day, eventRef: null, visibility: 'public', media: null });
  return true;
}

// Which residents take part, by rule (TRADITION_TUNING.beats[*].who), for one
// occasion on one day. Deterministic; free (not working the holiday) only.
function tradWho(gs, who, occId, day, max) {
  const T = TRADITION_TUNING;
  const year = getYear(day);
  const ids = tradResidents(gs).filter(id => tradFree(gs, id, day));
  const byHash = (a, b) => (tradHash01(a, occId, year, who) - tradHash01(b, occId, year, who)) || a.localeCompare(b);
  let pool;
  if (who === 'festive') {
    pool = ids.filter(id => tradAffinity(gs, id, occId) >= T.takePartAffinity)
      .sort((a, b) => (tradAffinity(gs, b, occId) - tradAffinity(gs, a, occId)) || a.localeCompare(b));
  } else if (who === 'warm') {
    pool = ids.filter(id => (Number(gs.npcs[id].bible?.temperament?.warmth) || 0) >= 0.2).sort(byHash);
  } else if (who === 'couples') {
    pool = [];
    for (const id of ids) {
      const rel = typeof relationshipSummaryForNpc === 'function' ? relationshipSummaryForNpc(gs, id) : null;
      if (rel && ids.includes(rel.partnerId) && !pool.includes(id)) pool.push(id);
    }
    pool.sort(byHash);
  } else if (who === 'singles') {
    pool = ids.filter(id => !(typeof relationshipSummaryForNpc === 'function' && relationshipSummaryForNpc(gs, id))).sort(byHash);
  } else if (who === 'loss') {
    const re = new RegExp(T.calls.hardPattern, 'i');
    pool = ids.filter(id => re.test(String(gs.npcs[id].bible?.wound || '') + ' ' + String(gs.npcs[id].bible?.background || ''))).sort(byHash);
  } else {
    pool = ids.slice().sort(byHash);
  }
  return max ? pool.slice(0, max) : pool;
}

// --- P4: gifts, cards & envelopes (D18) ---------------------------------------------

function tradGiftSpec(occId) {
  return TRADITION_TUNING.gifts[occId] || null;
}

// The gift occasion running today (a span's night counts), or null.
function occasionGiftToday(gs) {
  const day = gs?.meta?.clock?.day;
  if (!day) return null;
  for (const o of occasionsOnDay(day)) {
    const spec = tradGiftSpec(o.id);
    if (spec) return { occasionId: o.id, night: o.night, spec, def: o.def };
  }
  return null;
}

// D18 — does a present YOU give them today earn the occasion bonus? Once per
// person per occasion (per night, for a nightly-gift run). A pure read, like the
// birthday bonus: the mark is written by noteOccasionGift.
function occasionGiftBonusApplies(gs, npcId) {
  const today = occasionGiftToday(gs);
  if (!today || !gs.npcs?.[npcId]) return null;
  const day = gs.meta.clock.day;
  const key = `giftbonus|${today.occasionId}|${getYear(day)}|${today.spec.perNight ? today.night : 0}|${npcId}`;
  const t = tradState(gs);
  return t.done[key] ? null : { occasionId: today.occasionId, key, bonus: today.spec.bonus, label: today.def.label };
}

function occasionGiftEffectLines(gs, npcId) {
  const b = occasionGiftBonusApplies(gs, npcId);
  return b ? [`REL_DELTA ${npcId} affection +${b.bonus.toFixed(2)}`] : [];
}

function noteOccasionGift(gs, npcId, itemLabel) {
  const b = occasionGiftBonusApplies(gs, npcId);
  if (!b) return null;
  tradState(gs).done[b.key] = true;
  const day = gs.meta.clock.day;
  gs.npcs[npcId] = addMemoryFact(gs.npcs[npcId], {
    text: tradFill(TRADITION_TUNING.giftMemory, { occasion: b.label, item: itemLabel || 'a present' }),
    day, importance: 0.4, category: 'relationship',
  });
  return { occasionId: b.occasionId, beat: `🎁 A gift for ${b.label} — that means something today.` };
}

// One resident's gift to YOU: an envelope of cash, or an item picked for the day.
function tradGiveGift(gs, id, occId, spec, day, out) {
  const npc = gs.npcs[id];
  const name = tradName(gs, id);
  const h = tradHash01(id, occId, getYear(day), 'gift');
  if (spec.envelope) {
    const [lo, hi] = spec.envelope;
    const amount = lo + Math.floor(h * (hi - lo + 1));
    tradEffects(gs, `EARN_MONEY ${amount} holiday envelope`);
    out.lines.push(tradFill(spec.line, { name, amount }));
    tradMemory(gs, id, `Gave the player a small envelope for luck on ${OCCASION_DEFS[occId].label}.`, day, 0.35);
    return;
  }
  const pool = (spec.items || []).filter(d => ITEM_DEFS[d]);
  if (!pool.length) return;
  const defId = pool[Math.floor(h * pool.length) % pool.length];
  tradGive(gs, defId, 1, 'player');
  out.lines.push(tradFill(spec.line, { name, item: `the ${ITEM_DEFS[defId].label.toLowerCase()}` }));
  tradMemory(gs, id, `Gave the player ${ITEM_DEFS[defId].label.toLowerCase()} for ${OCCASION_DEFS[occId].label}.`, day, 0.35);
}

function processGiftsForDay(gs, day, out) {
  const T = TRADITION_TUNING;
  const year = getYear(day);
  for (const o of occasionsOnDay(day)) {
    const spec = tradGiftSpec(o.id);
    if (!spec) continue;
    const night = spec.perNight ? o.night : 0;
    const ids = tradResidents(gs).filter(id => tradFree(gs, id, day)
      && tradAffinity(gs, id, o.id) >= T.takePartAffinity
      && (gs.npcs[id].relPlayer?.affection || 0) >= T.fondToGive)
      .sort((a, b) => ((gs.npcs[b].relPlayer.affection) - (gs.npcs[a].relPlayer.affection)) || a.localeCompare(b));
    const givers = [];
    for (const id of ids) {
      if (givers.length >= spec.givers) break;
      if (!tradOnce(gs, `gift|${o.id}|${year}|${night}|${id}`)) continue;
      givers.push(id);
    }
    for (const id of givers) {
      tradGiveGift(gs, id, o.id, spec, day, out);
      if (spec.card && typeof spawnNote === 'function') {
        const text = tradFill(T.cards.signed[Math.floor(tradHash01(id, o.id, year, 'card') * T.cards.signed.length) % T.cards.signed.length], { name: tradName(gs, id) });
        spawnNote(gs, { roomId: T.cards.room, attachedTo: null, authorId: id, text, addressedTo: 'player' });
      }
    }
    // The secret admirer: the fondest, most drawn-to-you resident, once a year.
    if (spec.admirer && typeof spawnNote === 'function' && tradOnce(gs, `admirer|${o.id}|${year}`)) {
      const c = tradResidents(gs).filter(id => !givers.includes(id)
        && (gs.npcs[id].relPlayer?.desire || 0) >= T.cards.admirerMinDesire
        && (gs.npcs[id].relPlayer?.affection || 0) >= T.cards.admirerMinAffection)
        .sort((a, b) => ((gs.npcs[b].relPlayer.desire) - (gs.npcs[a].relPlayer.desire)) || a.localeCompare(b));
      if (c.length) {
        const text = T.cards.admirer[Math.floor(tradHash01(c[0], o.id, year, 'admirer') * T.cards.admirer.length) % T.cards.admirer.length];
        const note = spawnNote(gs, { roomId: T.cards.room, attachedTo: null, authorId: c[0], text, addressedTo: 'player' });
        if (note) {
          note.meta.admirerId = c[0];
          tradMemory(gs, c[0], T.cards.memoryAdmirer, day, 0.5);
          out.lines.push('💌 An unsigned Valentine\'s card is waiting in your room.');
        }
      }
    }
  }
}

// --- The smaller traditions (beats) ------------------------------------------------------

function tradBeatKey(beatId, o, day) {
  return `beat|${o.id}|${getYear(day)}|${beatId}|${o.total > 1 ? o.night : 0}`;
}

// Parents' Day / a family call: per person, and the outcome is theirs.
function processCallBeat(gs, beat, o, day, out) {
  const C = TRADITION_TUNING.calls;
  const re = new RegExp(C.hardPattern, 'i');
  const who = C[beat.callKind]?.who || 'family';
  const ids = tradWho(gs, 'all', o.id, day, beat.max);
  for (const id of ids) {
    if (!tradOnce(gs, `call|${o.id}|${getYear(day)}|${id}`)) continue;
    const npc = gs.npcs[id];
    const hard = re.test(String(npc.bible?.wound || '') + ' ' + String(npc.bible?.background || ''));
    const name = tradName(gs, id);
    out.lines.push(tradFill(hard ? C.hard : C.good, { name, who }));
    tradMood(gs, id, hard ? C.hardMood : C.goodMood);
    tradMemory(gs, id, tradFill(hard ? C.memoryHard : C.memoryGood, { who }), day, 0.4);
  }
  if (o.id === 'parents_day' && tradOnce(gs, `grandfather|${o.id}|${getYear(day)}`)) {
    out.lines.push(C.grandfather);
    if (typeof pushMoodImpulse === 'function' && gs.player) pushMoodImpulse(gs.player, C.playerMood, day);
  }
}

function processBeat(gs, beatId, beat, o, day, out) {
  const T = TRADITION_TUNING;
  // A run's beat that only happens on some nights (Lantern Nights' fried sweets, card games).
  if (beat.nights && o.total > 1 && !beat.nights.includes(o.night)) return;
  if (!tradOnce(gs, tradBeatKey(beatId, o, day))) return;
  if (beat.callKind) { processCallBeat(gs, beat, o, day, out); return; }
  // Handled by the feast engine when the occasion has a feast.
  if (beatId === 'brunch' && T.feasts[o.id]) return;
  if (beat.saleDay && typeof saleDayMultiplier === 'function' && saleDayMultiplier(gs) >= 1) return;
  // Forgive: real grudges only — cast-web tension between two residents.
  if (beatId === 'forgive') {
    const ids = tradResidents(gs);
    const pairs = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const ten = tradCastTension(gs, ids[i], ids[j]);
      if (ten >= beat.tensionToForgive) pairs.push({ a: ids[i], b: ids[j], ten });
    }
    pairs.sort((x, y) => (y.ten - x.ten) || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
    for (const p of pairs.slice(0, beat.max)) {
      tradTension(gs, p.a, p.b, -0.06);
      tradMood(gs, p.a, beat.mood); tradMood(gs, p.b, beat.mood);
      out.lines.push(tradFill(T.playful.color.forgiveLine, { a: tradName(gs, p.a), b: tradName(gs, p.b) }));
    }
    return;
  }
  const min = beat.who === 'couples' ? 2 : 1;
  const ids = tradWho(gs, beat.who, o.id, day, beat.max);
  if (ids.length < min) return;
  const names = tradNames(gs, ids);
  if (beat.line) out.lines.push(tradFill(beat.line, { names }));
  for (const id of ids) {
    tradMood(gs, id, beat.mood ?? T.participantMood);
    if (beat.memory) tradMemory(gs, id, tradFill(beat.memory, { names: tradNames(gs, ids.filter(x => x !== id)) || 'the house' }), day, 0.35);
  }
  if (beat.bond) tradBondAll(gs, ids, beat.bond);
  if (beat.dirt) bumpRoomDirt(gs, 'living_room', beat.dirt);
  if (beat.playerMood && typeof pushMoodImpulse === 'function' && gs.player) pushMoodImpulse(gs.player, beat.playerMood, day);
  if (beat.item) {
    const fond = ids.find(id => (gs.npcs[id].relPlayer?.affection || 0) >= T.fondToGive);
    if (fond) tradGive(gs, beat.item, 1, 'player');
  }
  if (beat.post && tradHash01(o.id, day, beatId, 'post') < 0.5) tradPost(gs, ids[0], beat.post[Math.floor(tradHash01(ids[0], day, beatId) * beat.post.length) % beat.post.length], day);
}

function processBeatsForDay(gs, day, out) {
  for (const o of occasionsOnDay(day)) {
    for (const trad of o.def.traditions || []) {
      const beat = TRADITION_TUNING.beats[trad];
      if (beat) processBeat(gs, trad, beat, o, day, out);
    }
  }
}

// --- P5: feasts (D19) ---------------------------------------------------------------------

function tradFeastSpec(occId) {
  return TRADITION_TUNING.feasts[occId] || null;
}

// A feast is a real commitment the most festive free resident proposes (the
// household meal/party machinery of commitments.js), marked with the occasion.
function processFeastsForDay(gs, day, out) {
  const F = TRADITION_TUNING.feast;
  for (const o of occasionsOnDay(day)) {
    const spec = tradFeastSpec(o.id);
    if (!spec || o.night !== 1) continue;
    if (!tradOnce(gs, `feast|${o.id}|${getYear(day)}`)) continue;
    const hosts = tradResidents(gs).filter(id => tradFree(gs, id, day)
      && tradAffinity(gs, id, o.id) >= F.hostAffinity && npcFestivity(gs.npcs[id]) >= F.hostMinFestivity)
      .sort((a, b) => (tradAffinity(gs, b, o.id) - tradAffinity(gs, a, o.id)) || a.localeCompare(b));
    if (!hosts.length) {
      if (o.def.closure === 'major' && F.noHostMajor) out.lines.push(tradFill(F.noHostMajor, { occasion: o.def.label }));
      continue;
    }
    const host = hosts[0];
    const invited = tradResidents(gs).filter(id => id !== host);
    const startAbs = day * 1440 + spec.hour;
    const made = createCommitment(gs, { kind: spec.kind, startAbs, endAbs: startAbs + spec.minutes, roomId: spec.room, invitedIds: invited, proposerId: host, host });
    if (!made || !made.record) continue;
    made.record.occasion = o.id;
    made.record.feastLabel = spec.label;
    const hh = Math.floor(spec.hour / 60), mm = spec.hour % 60;
    const time = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
    out.lines.push(tradFill(F.inviteLine, { name: tradName(gs, host), label: spec.label, time }));
  }
}

// The rollover after: the payoff, read off the attendance ledger sim.js's
// per-tick passes wrote (commitment.attended — NPC ids, and 'player').
function resolveFeasts(gs, day, out) {
  const F = TRADITION_TUNING.feast;
  const list = gs.world?.commitments;
  if (!Array.isArray(list) || typeof commitmentDay !== 'function') return;
  for (const c of list) {
    if (!c.occasion || c.feastResolved || commitmentDay(c) !== day - 1) continue;
    c.feastResolved = true;
    const spec = tradFeastSpec(c.occasion);
    const def = OCCASION_DEFS[c.occasion];
    if (!spec || !def) continue;
    const attended = (Array.isArray(c.attended) ? c.attended : []).filter(id => id !== 'player' && gs.npcs[id]);
    const playerCame = Array.isArray(c.attended) && c.attended.includes('player');
    const host = c.host && c.host !== 'player' ? c.host : null;
    const label = c.feastLabel || spec.label;
    if (!attended.length) continue;
    const names = tradNames(gs, attended);
    for (const id of attended) {
      tradMood(gs, id, F.attendMood);
      tradMemory(gs, id, tradFill(F.fact, { host: host ? tradName(gs, host) : 'The house', label, names: tradNames(gs, attended.filter(x => x !== id)) || 'everyone' }), day - 1, F.factImportance);
      if (playerCame) gs.npcs[id] = applyRelDelta(gs.npcs[id], { affection: F.playerAffection }, undefined);
    }
    tradBondAll(gs, attended, F.attendBond);
    if (playerCame && gs.player && typeof pushMoodImpulse === 'function') pushMoodImpulse(gs.player, F.playerMood, day - 1);
    if (spec.gratitude && attended.length >= 2) out.lines.push(tradFill(F.gratitudeLine, { name: tradName(gs, attended[0]) }));
    // The label starts the sentence ("the Midwinter dinner" → "The Midwinter dinner").
    const Label = tradCap(label);
    if (playerCame) out.lines.push(attended.length === 1 ? tradFill(F.lineJustYou, { label: Label, name: tradName(gs, attended[0]) }) : tradFill(F.line, { label: Label, names }));
    else out.lines.push(tradFill(F.lineNoYou, { label: Label, names }));
    if (!playerCame && def.closure === 'major' && host && (gs.npcs[host].relPlayer?.affection || 0) >= F.skipMinAffection) {
      tradMood(gs, host, F.skipMood);
      tradMemory(gs, host, tradFill(F.factSkipped, { label }), day - 1, F.factImportance);
    }
    if (spec.leftovers && attended.length >= F.leftoversMinAttendees && ITEM_DEFS[F.leftoverItem]) {
      const fridge = tradFridgeId(gs);
      if (fridge) tradEffects(gs, `SPAWN_ITEM ${F.leftoverItem} 1 ${fridge}`);
    }
    const poster = host || attended[0];
    if (tradHash01(c.id, 'feastpost') < 0.6) tradPost(gs, poster, tradFill(F.post[Math.floor(tradHash01(c.id, 'p') * F.post.length) % F.post.length], { label }), day - 1);
    tradEvent(gs, { day: day - 1, tick: 47, roomId: c.roomId, npcId: poster, type: 'occasion_feast', moodDelta: 0, importance: MEMORY_IMPORTANCE.social,
      data: { label }, template: '{name} hosted {label}.', seenByPlayer: false });
  }
}

// --- Sim's attendance ledger (called from resolveTick's meal and party passes) ---------------

function noteGatheringPresence(gs, c, npcId) {
  if (!c || !c.occasion) return;
  const a = Array.isArray(c.attended) ? c.attended : (c.attended = []);
  if (npcId && !a.includes(npcId)) a.push(npcId);
  if (gs?.player?.location === c.roomId && !a.includes('player')) a.push('player');
}

// --- P6: night rituals (D20) -----------------------------------------------------------------

function tradRitualDef(id) {
  return TRADITION_TUNING.rituals[id] || null;
}

function tradRitualOccasions(def) {
  return def.occasions || [def.occasion];
}

// The occasion (a running one) a ritual is open for today, or null.
function tradRitualOccasionToday(def, day) {
  const on = occasionsOnDay(day);
  return on.find(o => tradRitualOccasions(def).includes(o.id)) || null;
}

// Is this ritual open right now, here? { ok, occasion, night } | { ok: false, reason }.
function ritualWindow(gs, id, roomId) {
  const def = tradRitualDef(id);
  const clock = gs?.meta?.clock;
  if (!def || !clock) return { ok: false, reason: 'Nothing to do.' };
  const occ = tradRitualOccasionToday(def, clock.day);
  if (!occ) return { ok: false, reason: 'Not today.' };
  if (roomId && !def.rooms.includes(roomId)) return { ok: false, reason: 'Wrong room for that.' };
  const m = clock.minutes;
  if (m < def.from || m >= def.to) return { ok: false, reason: 'Not at this hour.' };
  const t = tradState(gs);
  if (t.ritual[`${id}|${clock.day}`]) return { ok: false, reason: def.done || 'You\'ve already done that today.' };
  return { ok: true, occasion: occ, night: occ.night };
}

function tradRitualCompanions(gs, roomId) {
  return tradResidents(gs).filter(id => gs.npcs[id].location === roomId
    && !['sleeping', 'napping'].includes(String(gs.npcs[id].activity || '').toLowerCase()));
}

// What the verb will say — decided once in prepare so the effect and the line
// cannot disagree (the decorate verb's discipline).
function ritualPrepare(gs, id, roomId) {
  const def = tradRitualDef(id);
  const w = ritualWindow(gs, id, roomId);
  if (!def || !w.ok) return { cancelled: true };
  const companions = tradRitualCompanions(gs, roomId);
  let line = def.line;
  if (id === 'light_lantern') {
    const lit = Object.keys(tradState(gs).lanterns.nights).filter(n => Number(n) <= w.night).length + (tradState(gs).lanterns.nights[w.night] ? 0 : 1);
    line = tradFill(def.line, { glow: lit === 1 ? 'One lantern glows there now.' : `${lit} lanterns glow there now.` });
  }
  if (companions.length) line = tradFill(def.shared, { name: tradName(gs, companions[0]) });
  return { ritualId: id, roomId, occasionId: w.occasion.id, night: w.night, companions, line };
}

// The write: your lift, the bond with whoever shared it, and the ritual's own state.
function applyOccasionRitual(gs, id, roomId) {
  const def = tradRitualDef(id);
  const clock = gs.meta.clock;
  const w = ritualWindow(gs, id, roomId || gs.player.location);
  if (!def || !w.ok) return null;
  const t = tradState(gs);
  t.ritual[`${id}|${clock.day}`] = true;
  if (id === 'light_lantern') {
    t.lanterns.year = getYear(clock.day);
    t.lanterns.nights[w.night] = 'player';
  }
  if (typeof pushMoodImpulse === 'function') pushMoodImpulse(gs.player, def.mood, clock.day);
  const companions = tradRitualCompanions(gs, roomId || gs.player.location);
  for (const cid of companions) {
    tradMood(gs, cid, TRADITION_TUNING.participantMood);
    gs.npcs[cid] = applyRelDelta(gs.npcs[cid], { affection: 0.02 }, clock.day);
    tradMemory(gs, cid, `Shared ${def.label.toLowerCase()} with the player on ${OCCASION_DEFS[w.occasion.id].label}.`, clock.day, 0.35);
  }
  return { companions };
}

// How many lanterns glow in the window today (0 when it isn't Lantern Nights).
function lanternCount(gs, day) {
  const d = day || gs?.meta?.clock?.day;
  const on = occasionsOnDay(d).find(o => o.id === 'lantern_nights');
  if (!on) return 0;
  const t = tradState(gs);
  if (t.lanterns.year !== getYear(d)) return 0;
  return Object.keys(t.lanterns.nights).filter(n => Number(n) <= on.night).length;
}

// The countdown, at the rollover onto New Year's Day, with whoever is in the room.
function processCountdown(gs, day, out) {
  const C = TRADITION_TUNING.countdown;
  const on = occasionsOnDay(day).find(o => o.id === 'new_years_day' && o.night === 1);
  if (!on || !tradOnce(gs, `countdown|new_years_eve|${getYear(day) - 1}`)) return;
  const there = tradResidents(gs).filter(id => C.rooms.includes(gs.npcs[id].location)
    && !['sleeping', 'napping'].includes(String(gs.npcs[id].activity || '').toLowerCase()));
  const playerIn = C.rooms.includes(gs.player?.location);
  if (!there.length && !playerIn) return;
  if (there.length) {
    out.lines.push(tradFill(C.line, { names: tradNames(gs, there) }));
    for (const id of there) {
      tradMood(gs, id, C.mood);
      tradMemory(gs, id, tradFill(C.fact, { names: tradNames(gs, there.filter(x => x !== id)) || 'the player' }), day - 1, 0.4);
    }
    tradBondAll(gs, there, C.bond);
    // Couples present kiss at midnight.
    const seen = new Set();
    for (const id of there) {
      const rel = typeof relationshipSummaryForNpc === 'function' ? relationshipSummaryForNpc(gs, id) : null;
      if (rel && there.includes(rel.partnerId) && !seen.has(id) && !seen.has(rel.partnerId)) {
        seen.add(id); seen.add(rel.partnerId);
        out.lines.push(tradFill(C.kiss, { a: tradName(gs, id), b: tradName(gs, rel.partnerId) }));
      }
    }
  }
  out.lines.push(playerIn ? C.playerIn : C.playerAway);
  if (playerIn && typeof pushMoodImpulse === 'function') pushMoodImpulse(gs.player, C.playerMood, day - 1);
}

// Last night's fireworks and moon-viewing, seen by whoever was festive and free.
function processNightSightsForDay(gs, day, out) {
  const T = TRADITION_TUNING;
  const last = occasionsOnDay(day - 1);
  for (const o of last) {
    if (o.id === 'midsummer' || o.id === 'new_years_eve') {
      if (!tradOnce(gs, `fireworks|${o.id}|${getYear(day - 1)}`)) continue;
      const ids = tradWho(gs, 'festive', o.id, day - 1, 3);
      if (!ids.length) continue;
      out.lines.push(tradFill(T.fireworks.line, { names: tradNames(gs, ids) }));
      for (const id of ids) tradMood(gs, id, T.fireworks.mood);
      tradBondAll(gs, ids, T.fireworks.bond);
    }
    if (o.id === 'harvest_moon') {
      if (!tradOnce(gs, `moon|${o.id}|${getYear(day - 1)}`)) continue;
      const ids = tradWho(gs, 'festive', o.id, day - 1, 3);
      if (!ids.length) continue;
      out.lines.push(`🌕 ${tradNames(gs, ids)} watched the harvest moon from the balcony.`);
      for (const id of ids) tradMood(gs, id, 0.04);
      tradBondAll(gs, ids, 0.02);
    }
  }
}

// Lantern Nights: a festive roommate lights the night's lantern if you don't.
function processLanternsForDay(gs, day, out) {
  const on = occasionsOnDay(day).find(o => o.id === 'lantern_nights');
  if (!on) return;
  const t = tradState(gs);
  if (t.lanterns.year !== getYear(day)) { t.lanterns.year = getYear(day); t.lanterns.nights = {}; }
  if (t.lanterns.nights[on.night]) return;
  const ids = tradWho(gs, 'festive', 'lantern_nights', day, 1);
  if (!ids.length) return;
  t.lanterns.nights[on.night] = ids[0];
  out.lines.push(`🏮 ${tradName(gs, ids[0])} lit night ${on.night}'s lantern in the window at dusk.`);
  tradMood(gs, ids[0], TRADITION_TUNING.participantMood);
}

// --- P7: playful days (D21) ------------------------------------------------------------------

function tradPranksters(gs, day) {
  const P = TRADITION_TUNING.playful.pranks;
  return tradResidents(gs).filter(id => tradFree(gs, id, day)
    && tradAffinity(gs, id, 'fools_day') >= P.minAffinity
    && (gs.npcs[id].bible?.personality?.traits || []).some(t => P.traits.includes(t)))
    .sort((a, b) => (tradAffinity(gs, b, 'fools_day') - tradAffinity(gs, a, 'fools_day')) || a.localeCompare(b));
}

// Does a prank land on this person? Volatile / touchy people don't laugh.
function tradPrankLands(gs, id) {
  const P = TRADITION_TUNING.playful.pranks;
  const vol = Number(gs.npcs[id].bible?.temperament?.volatility) || 0;
  const playful = (gs.npcs[id].bible?.personality?.traits || []).some(t => P.traits.includes(t));
  return !(vol > P.touchy) || playful;
}

function processPranksForDay(gs, day, out) {
  const P = TRADITION_TUNING.playful.pranks;
  const o = occasionsOnDay(day).find(x => x.id === 'fools_day');
  if (!o || !tradOnce(gs, `pranks|fools_day|${getYear(day)}`)) return;
  const residents = tradResidents(gs);
  for (const p of tradPranksters(gs, day).slice(0, P.max)) {
    const roll = tradHash01(p, day, 'pranktarget');
    const prank = P.kinds[Math.floor(tradHash01(p, day, 'prank') * P.kinds.length) % P.kinds.length];
    const prankster = tradName(gs, p);
    if (roll < P.playerChance) {
      // The player has no temperament record: a seeded coin toss decides how it lands.
      const landed = tradHash01(p, day, 'playerland') >= 0.3;
      out.lines.push(tradFill(landed ? P.playerLands : P.playerBackfire, { prankster, prank }));
      if (typeof pushMoodImpulse === 'function') pushMoodImpulse(gs.player, landed ? P.moodLands : P.moodBackfire, day);
      gs.npcs[p] = applyRelDelta(gs.npcs[p], landed ? { affection: P.affectionLands } : { tension: P.tensionBackfire }, undefined);
      tradMemory(gs, p, `Pulled ${prank} on the player for Fools' Day.`, day, 0.3);
    } else {
      const targets = residents.filter(id => id !== p);
      if (!targets.length) continue;
      const t = targets[Math.floor(tradHash01(p, day, 'target') * targets.length) % targets.length];
      const landed = tradPrankLands(gs, t);
      out.lines.push(tradFill(landed ? P.landsLine : P.backfireLine, { prankster, target: tradName(gs, t), prank }));
      tradMood(gs, t, landed ? P.moodLands : P.moodBackfire);
      if (landed) tradBond(gs, p, t, 0.02); else tradTension(gs, p, t, P.tensionBackfire);
      tradMemory(gs, t, `${prankster} pulled ${prank} on them for Fools' Day${landed ? ' — and it was funny' : ''}.`, day, 0.3);
    }
  }
}

// The player's own prank: whoever is in the room takes it by temperament.
function playerPrankTargets(gs) {
  return tradResidents(gs).filter(id => gs.npcs[id].location === gs.player.location
    && !['sleeping', 'napping'].includes(String(gs.npcs[id].activity || '').toLowerCase()));
}

function applyPlayerPrank(gs, targetId, prankIdx) {
  const P = TRADITION_TUNING.playful.pranks;
  const day = gs.meta.clock.day;
  if (!targetId || !gs.npcs[targetId] || !tradOnce(gs, `playerprank|fools_day|${getYear(day)}|${targetId}`)) return null;
  const landed = tradPrankLands(gs, targetId);
  tradMood(gs, targetId, landed ? P.moodLands : P.moodBackfire);
  gs.npcs[targetId] = applyRelDelta(gs.npcs[targetId], landed ? { affection: P.affectionLands } : { tension: P.tensionBackfire }, day);
  tradMemory(gs, targetId, `The player pulled ${P.kinds[prankIdx % P.kinds.length]} on them for Fools' Day${landed ? ' — and it was funny' : ', and they weren\'t in the mood'}.`, day, 0.35);
  return { landed };
}

// Color Day: the house's own powder fight; grudges can soften.
function processColorFightForDay(gs, day, out) {
  const C = TRADITION_TUNING.playful.color;
  const o = occasionsOnDay(day).find(x => x.id === 'color_day');
  if (!o || !tradOnce(gs, `colorfight|color_day|${getYear(day)}`)) return;
  const ids = tradWho(gs, 'festive', 'color_day', day, 3);
  if (ids.length < 2) return;
  out.lines.push(tradFill(C.line, { names: tradNames(gs, ids) }));
  for (const id of ids) tradMood(gs, id, C.mood);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) tradTension(gs, ids[i], ids[j], C.tension);
  bumpRoomDirt(gs, 'living_room', C.dirt);
}

// The Spring Festival egg hunt: hidden at the rollover onto the day.
function processEggsForDay(gs, day, out) {
  const E = TRADITION_TUNING.playful.eggs;
  const o = occasionsOnDay(day).find(x => x.id === 'spring_festival' && x.night === 1);
  if (!o || !tradOnce(gs, `eggs|spring_festival|${getYear(day)}`)) return;
  const t = tradState(gs);
  const rooms = E.hide.rooms.filter(r => ROOMS[r]).sort((a, b) => (tradHash01(a, day, 'egg') - tradHash01(b, day, 'egg')) || a.localeCompare(b)).slice(0, E.hide.count);
  const hidden = tradWho(gs, 'festive', 'spring_festival', day, 1);
  t.eggs = { year: getYear(day), rooms: Object.fromEntries(rooms.map(r => [r, true])), found: {}, hiddenBy: hidden[0] || null };
  out.lines.push(hidden.length ? tradFill(E.hideLine, { name: tradName(gs, hidden[0]) }) : '🥚 There are eggs hidden around the apartment somewhere.');
}

function eggHuntState(gs) {
  const t = tradState(gs);
  const day = gs?.meta?.clock?.day;
  const on = day && occasionsOnDay(day).find(o => o.id === 'spring_festival');
  return on && t.eggs.year === getYear(day) ? t.eggs : null;
}

// Are there eggs left to find in this room?
function eggHere(gs, roomId) {
  const e = eggHuntState(gs);
  return !!(e && e.rooms[roomId] && !e.found[roomId]);
}

function eggsRemaining(gs) {
  const e = eggHuntState(gs);
  return e ? Object.keys(e.rooms).filter(r => !e.found[r]).length : 0;
}

function applyEggHunt(gs, roomId) {
  const e = eggHuntState(gs);
  if (!e || !e.rooms[roomId] || e.found[roomId]) return null;
  e.found[roomId] = true;
  return { defId: TRADITION_TUNING.playful.eggs.hunt.item, remaining: eggsRemaining(gs) };
}

// Halloween: costumes (a flag for the day), the candy, and the knock at the door.
function processHalloweenForDay(gs, day, out) {
  const H = TRADITION_TUNING.playful.halloween;
  const o = occasionsOnDay(day).find(x => x.id === 'halloween');
  if (!o) { const t0 = tradState(gs); if (t0.costumes.day && t0.costumes.day !== day) t0.costumes = { day: 0, by: {} }; return; }
  if (!tradOnce(gs, `halloween|halloween|${getYear(day)}`)) return;
  const t = tradState(gs);
  const ids = tradWho(gs, 'festive', 'halloween', day, 4);
  t.costumes = { day, by: {} };
  ids.forEach((id, i) => { t.costumes.by[id] = H.costumes[Math.floor(tradHash01(id, day, 'costume') * H.costumes.length) % H.costumes.length]; });
  if (ids.length) out.lines.push(tradFill(H.costumeLine, { names: tradNames(gs, ids) }));
  // Someone (fond, festive) buys candy for the door.
  const giver = ids.find(id => (gs.npcs[id].relPlayer?.affection || 0) >= TRADITION_TUNING.fondToGive);
  if (giver && ITEM_DEFS[H.candyItem]) {
    tradGive(gs, H.candyItem, 4, 'player');
    out.lines.push(tradFill(H.candyGiver, { name: tradName(gs, giver) }));
  }
  // The knock: one pending door event, 18:30 for three hours.
  if (!gs.world.doorEvent) {
    const start = day * 1440 + H.ring.startMinute;
    gs.world.doorEvent = { id: `door_tot_${day}`, kind: 'trick_or_treat', label: 'A gaggle of trick-or-treaters', refId: null,
      createdAbs: start, expiresAbs: start + H.ring.windowMinutes, announced: false };
  }
}

function costumeOf(gs, id) {
  const t = gs?.world?.occasions?.trad;
  const day = gs?.meta?.clock?.day;
  return t && t.costumes && t.costumes.day === day ? (t.costumes.by[id] || null) : null;
}

// An unanswered trick-or-treat knock ends here (sweepDoorEvent): a festive
// housemate covers for you if the house has one; otherwise it's a trick.
function trickOrTreatExpired(gs) {
  const H = TRADITION_TUNING.playful.halloween;
  const day = gs.meta.clock.day;
  const cover = tradResidents(gs).find(id => tradAffinity(gs, id, 'halloween') >= TRADITION_TUNING.takePartAffinity);
  if (cover) return H.coveredLine;
  bumpRoomDirt(gs, 'entry', H.trickDirt);
  return H.refused;
}

// Giving Week: small kindnesses, and the jar that pays out at the Sharing Feast.
function processGivingForDay(gs, day, out) {
  const G = TRADITION_TUNING.playful.giving;
  const on = occasionsOnDay(day).find(o => o.id === 'giving_week');
  const t = tradState(gs);
  if (on) {
    if (t.jar.year !== getYear(day)) t.jar = { year: getYear(day), coins: 0 };
    if (tradOnce(gs, `giving|giving_week|${getYear(day)}|${on.night}`)) {
      const doers = tradWho(gs, 'warm', 'giving_week', day, G.doers);
      const residents = tradResidents(gs);
      for (const id of doers) {
        const kind = G.kinds[Math.floor(tradHash01(id, day, 'kind') * G.kinds.length) % G.kinds.length];
        const name = tradName(gs, id);
        const others = residents.filter(x => x !== id);
        const toPlayer = !others.length || tradHash01(id, day, 'toplayer') < 0.5;
        const target = toPlayer ? null : others[Math.floor(tradHash01(id, day, 'tgt') * others.length) % others.length];
        if (kind === 'treat') {
          const item = G.treatItems.filter(d => ITEM_DEFS[d])[Math.floor(tradHash01(id, day, 'ti') * G.treatItems.length) % G.treatItems.length];
          if (toPlayer && item) { tradGive(gs, item, 1, 'player'); out.lines.push(tradFill(G.treatPlayerLine, { name })); }
          else if (target) { out.lines.push(tradFill(G.treatLine, { name, target: tradName(gs, target) })); }
        } else if (kind === 'chore') {
          bumpRoomDirt(gs, 'kitchen', G.dirt);
          out.lines.push(toPlayer ? tradFill(G.chorePlayerLine, { name }) : tradFill(G.choreLine, { name, target: tradName(gs, target) }));
        } else {
          const [lo, hi] = G.jarCoins;
          t.jar.coins += lo + Math.floor(tradHash01(id, day, 'coins') * (hi - lo + 1));
          out.lines.push(tradFill(G.jarLine, { name }));
        }
        tradMood(gs, id, G.mood);
        if (target) tradBond(gs, id, target, G.bond);
        else gs.npcs[id] = applyRelDelta(gs.npcs[id], { affection: 0.02 }, undefined);
      }
    }
  }
  // The Sharing Feast: the jar goes to a good cause.
  const feast = occasionsOnDay(day).find(o => o.id === 'sharing_feast');
  if (feast && t.jar.coins > 0 && tradOnce(gs, `jarpayout|sharing_feast|${getYear(day)}`)) {
    out.lines.push(tradFill(G.payoutLine, { total: t.jar.coins }));
    for (const id of tradResidents(gs)) tradMood(gs, id, 0.02);
    t.jar = { year: getYear(day), coins: 0 };
  }
}

function jarRitualOpen(gs) {
  const day = gs?.meta?.clock?.day;
  return !!(day && occasionsOnDay(day).some(o => o.id === 'giving_week' || o.id === 'sharing_feast'));
}

function applyJarCoins(gs, amount) {
  const t = tradState(gs);
  const day = gs.meta.clock.day;
  if (t.jar.year !== getYear(day)) t.jar = { year: getYear(day), coins: 0 };
  t.jar.coins += amount;
  return t.jar.coins;
}

// --- P8: personal anniversaries and the world talking (D22) --------------------------------------

function processAnniversariesForDay(gs, day, out) {
  const A = TRADITION_TUNING.anniversaries;
  const n = CALENDAR.daysPerYear;
  const plural = (y) => (y === 1 ? '' : 's');
  // The day you got the keys: the first day of the game, every year.
  if (day > 1 && (day - 1) % n === 0) {
    const years = (day - 1) / n;
    if (tradOnce(gs, `anniv|keys|${getYear(day)}`)) {
      out.lines.push(tradFill(A.keys.line, { years, s: plural(years) }));
      if (typeof pushMoodImpulse === 'function' && gs.player) pushMoodImpulse(gs.player, A.keys.mood, day);
    }
  }
  const residents = tradResidents(gs);
  for (const id of residents) {
    const since = Number(gs.npcs[id].residency?.since) || 0;
    if (since >= 1 && day > since && (day - since) % n === 0) {
      const years = (day - since) / n;
      if (!tradOnce(gs, `anniv|movein|${getYear(day)}|${id}`)) continue;
      out.lines.push(tradFill(A.moveIn.line, { name: tradName(gs, id), years, s: plural(years) }));
      tradMood(gs, id, A.moveIn.mood);
      tradMemory(gs, id, tradFill(A.moveIn.memory, { years, s: plural(years) }), day, 0.4);
    }
  }
  const store = gs.world?.relationships || {};
  for (const [key, rec] of Object.entries(store)) {
    if (rec.status === 'single' || !Number.isFinite(rec.lastTransitionDay) || day <= rec.lastTransitionDay) continue;
    if ((day - rec.lastTransitionDay) % n !== 0) continue;
    const [a, b] = key.split('|');
    if (!residents.includes(a) || !residents.includes(b)) continue;
    if (!tradOnce(gs, `anniv|couple|${getYear(day)}|${key}`)) continue;
    const years = (day - rec.lastTransitionDay) / n;
    out.lines.push(tradFill(A.couple.line, { a: tradName(gs, a), b: tradName(gs, b), years, s: plural(years) }));
    tradMood(gs, a, A.couple.mood); tradMood(gs, b, A.couple.mood);
    tradBond(gs, a, b, A.couple.bond);
  }
}

// Holiday Chatter posts: a couple of festive residents mark the day.
function processHolidayPostsForDay(gs, day, out) {
  const C = TRADITION_TUNING.chatterPosts;
  for (const o of occasionsOnDay(day)) {
    if (o.night !== 1 || !(o.def.traditions || []).length) continue;
    if (!tradOnce(gs, `posts|${o.id}|${getYear(day)}`)) continue;
    const ids = tradWho(gs, 'festive', o.id, day, C.perOccasion).filter(id => tradAffinity(gs, id, o.id) >= C.minAffinity);
    for (const id of ids) {
      const text = tradFill(C.generic[Math.floor(tradHash01(id, o.id, day, 'post') * C.generic.length) % C.generic.length], { label: o.def.label });
      tradPost(gs, id, text, day);
    }
  }
}

// Holiday mail: a card in the mailbox on a few of the days.
function processHolidayMailForDay(gs, day) {
  const M = TRADITION_TUNING.mail;
  if (typeof pushMailEntry !== 'function') return;
  for (const o of occasionsOnDay(day)) {
    if (o.night !== 1 || !M.occasions.includes(o.id)) continue;
    if (!tradOnce(gs, `mail|${o.id}|${getYear(day)}`)) continue;
    pushMailEntry(gs, M.kind, M.cardFrom[Math.floor(tradHash01(o.id, day, 'mail') * M.cardFrom.length) % M.cardFrom.length], day);
  }
}

// Sale Day: shop prices drop for the day (Nile and QuickCart share itemPriceNow).
function saleDayMultiplier(gs) {
  const day = gs?.meta?.clock?.day;
  if (!day) return 1;
  const on = occasionsOnDay(day).some(o => (o.def.traditions || []).includes('sales'));
  return on ? TRADITION_TUNING.sale.multiplier : 1;
}

// --- House Notes F2 (0.14.5): the fridge as the house's calendar -------------------------------

function tradWhenWords(n) {
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
}

// Notes this resident has a reason to leave about what is coming: a housemate's birthday in a day or two
// (the card's in the drawer), a major holiday in a day or two (who's cooking), the decorations for an
// occasion that is over (they come down this weekend). Reads state other systems keep. Pure.
function occasionNoteMotives(gs, npcId, day) {
  const npc = gs?.npcs?.[npcId];
  if (!npc || npc.residency?.status !== 'resident') return [];
  const out = [];
  if (typeof daysUntilBirthday === 'function') {
    for (const id of tradResidents(gs)) {
      if (id === npcId) continue;
      const n = daysUntilBirthday(gs.npcs[id], day);
      if (n >= 1 && n <= 2) { out.push({ motive: 'birthday_soon', vars: { who: tradName(gs, id), when: tradWhenWords(n) } }); break; }
    }
  }
  if (typeof occasionsOnDay === 'function') {
    for (const ahead of [1, 2]) {
      const o = occasionsOnDay(day + ahead).find(x => x.night === 1 && x.def.closure === 'major');
      if (o && !occasionsOnDay(day).some(x => x.id === o.id)) { out.push({ motive: 'holiday_soon', vars: { label: o.def.label, when: tradWhenWords(ahead) } }); break; }
    }
  }
  if (typeof decorationsUpIn === 'function' && typeof decorToTakeDown === 'function') {
    for (const { occasionId } of decorationsUpIn(gs, null, day)) {
      const room = OCCASION_DECOR[occasionId]?.room;
      if (room && decorToTakeDown(gs, day, room) === occasionId) { out.push({ motive: 'decor_down', vars: { label: OCCASION_DEFS[occasionId].label } }); break; }
    }
  }
  return out;
}

// --- Prompt lines --------------------------------------------------------------------------------

// Extra [Occasion]-adjacent lines for one NPC: their costume, the lanterns in the
// window, the anniversary of you getting the keys.
function tradPromptLines(gs, npcId) {
  const npc = gs?.npcs?.[npcId];
  const day = gs?.meta?.clock?.day;
  if (!npc || !day || npc.residency?.status !== 'resident') return [];
  const lines = [];
  const costume = costumeOf(gs, npcId);
  if (costume) lines.push(`[Occasion]: ${npc.bible?.name || 'They'} is dressed as ${costume} for Halloween.`);
  const lit = lanternCount(gs, day);
  if (lit > 0) lines.push(`[Occasion]: ${lit === 1 ? 'One lantern glows' : `${lit} lanterns glow`} in the window for Lantern Nights.`);
  const n = CALENDAR.daysPerYear;
  if (day > 1 && (day - 1) % n < TRADITION_TUNING.anniversaries.promptDays) {
    const years = Math.floor((day - 1) / n);
    if (years >= 1) lines.push(`[Occasion]: ${tradFill(TRADITION_TUNING.anniversaries.keys.prompt, { years, s: years === 1 ? '' : 's' })}`);
  }
  return lines;
}

// The scene reader / prompt's "what the room looks like" line for the rituals'
// visible state: lanterns in the window, a carved pumpkin.
function tradSceneLine(gs, roomId, day) {
  const d = day || gs?.meta?.clock?.day;
  const parts = [];
  const lit = lanternCount(gs, d);
  if (lit > 0 && ['living_room', 'dining', 'balcony'].includes(roomId)) parts.push(`${lit === 1 ? 'A lantern glows' : `${lit} lanterns glow`} in the window.`);
  return parts.length ? parts.join(' ') : null;
}

// --- Your verbs (P6/P7): one generated action per ritual ------------------------------------------
// defs.actions.js generates an ACTION_DEFS entry for every row of TRADITION_VERBS
// (config.js) that runs through here: tradVerbOpen is the requirement checker,
// tradVerbPrepare decides what will happen (and what it will say) ONCE, and
// applyTradVerb is the write (the OCCASION_RITUAL effect calls it).

function tradVerbRow(id) {
  return (typeof TRADITION_VERBS !== 'undefined' ? TRADITION_VERBS : []).find(v => v.id === id) || null;
}

// { ok: true } or { ok: false, reason } — is this verb open now, in this room?
function tradVerbOpen(gs, id, roomId) {
  const row = tradVerbRow(id);
  const clock = gs?.meta?.clock;
  if (!row || !clock) return { ok: false, reason: 'Nothing to do.' };
  const day = clock.day;
  const T = TRADITION_TUNING;
  const t = tradState(gs);
  const once = (k) => !t.ritual[`${k}|${day}`];
  const on = (occId) => occasionsOnDay(day).some(o => o.id === occId);
  if (roomId && row.rooms && !row.rooms.includes(roomId)) return { ok: false, reason: 'Wrong room for that.' };
  if (T.rituals[id]) return ritualWindow(gs, id, roomId);
  // Power outages (seasons plan W10): the candles verb is open while the power is out.
  if (id === 'light_candles') {
    if (typeof outageActive !== 'function' || !outageActive(gs)) return { ok: false, reason: 'The power is on.' };
    if (outageCandlesLit(gs)) return { ok: false, reason: OUTAGE_TUNING.candles.done };
    return { ok: true };
  }
  if (id === 'play_prank') {
    if (!on('fools_day')) return { ok: false, reason: 'Not today.' };
    const targets = playerPrankTargets(gs).filter(x => !t.done[`playerprank|fools_day|${getYear(day)}|${x}`]);
    return targets.length ? { ok: true } : { ok: false, reason: 'Nobody here to prank.' };
  }
  if (id === 'powder_fight') {
    if (!on('color_day')) return { ok: false, reason: 'Not today.' };
    return once(id) ? { ok: true } : { ok: false, reason: 'You already did that today.' };
  }
  if (id === 'hunt_eggs') {
    if (!eggHuntState(gs)) return { ok: false, reason: 'No egg hunt on.' };
    if (!eggsRemaining(gs)) return { ok: false, reason: 'Every egg has been found.' };
    return clock.minutes >= 360 && clock.minutes < 1320 ? { ok: true } : { ok: false, reason: 'Not at this hour.' };
  }
  if (id === 'dye_eggs') {
    if (!on('spring_festival_eve')) return { ok: false, reason: 'Not today.' };
    return once(id) ? { ok: true } : { ok: false, reason: 'You already did that today.' };
  }
  if (id === 'carve_pumpkin') {
    if (!on('halloween')) return { ok: false, reason: 'Not today.' };
    return once(id) ? { ok: true } : { ok: false, reason: 'You already did that today.' };
  }
  if (id === 'coins_in_jar') {
    if (!jarRitualOpen(gs)) return { ok: false, reason: 'No giving jar out.' };
    if ((gs.player.money || 0) < T.playful.giving.jar.coins) return { ok: false, reason: 'Not enough money.' };
    return (t.ritual[id + '|' + day] || 0) < 3 ? { ok: true } : { ok: false, reason: 'You\'ve given plenty today.' };
  }
  return { ok: false, reason: 'Nothing to do.' };
}

// What will happen and what it will say, decided once. { cancelled } when closed.
function tradVerbPrepare(gs, id, roomId) {
  const T = TRADITION_TUNING;
  const open = tradVerbOpen(gs, id, roomId);
  if (!open.ok) return { cancelled: true, reason: open.reason };
  if (T.rituals[id]) return ritualPrepare(gs, id, roomId);
  const companions = tradRitualCompanions(gs, roomId);
  const companion = companions.length ? tradName(gs, companions[0]) : null;
  if (id === 'play_prank') {
    const P = T.playful.pranks;
    const day = gs.meta.clock.day;
    const target = playerPrankTargets(gs).find(x => !tradState(gs).done[`playerprank|fools_day|${getYear(day)}|${x}`]);
    const idx = Math.floor(tradHash01(target, day, 'ppidx') * P.kinds.length) % P.kinds.length;
    const landed = tradPrankLands(gs, target);
    return { verbId: id, arg: `${target}:${idx}`, line: tradFill(landed ? P.player.landsLine : P.player.backfireLine, { prank: P.kinds[idx], target: tradName(gs, target) }) };
  }
  if (id === 'powder_fight') {
    const C = T.playful.color.player;
    return { verbId: id, companions, line: companion ? tradFill(C.shared, { name: companion }) : C.line };
  }
  if (id === 'hunt_eggs') {
    const E = T.playful.eggs.hunt;
    const found = eggHere(gs, roomId);
    const where = ['the cushions', 'the bookshelf', 'a plant pot', 'the curtains', 'the couch'][Math.floor(tradHash01(roomId, gs.meta.clock.day, 'where') * 5)];
    return { verbId: id, found, line: found ? tradFill(E.found, { where }) : tradFill(E.none, { room: (ROOMS[roomId]?.name || 'room').toLowerCase() }) };
  }
  if (id === 'dye_eggs') {
    const E = T.playful.eggs.dye;
    return { verbId: id, line: companion ? tradFill(E.shared, { name: companion }) : E.line };
  }
  if (id === 'carve_pumpkin') {
    const H = T.playful.halloween.pumpkin;
    return { verbId: id, companions, line: companion ? tradFill(H.shared, { name: companion }) : H.line };
  }
  if (id === 'coins_in_jar') return { verbId: id, line: T.playful.giving.jar.line };
  if (id === 'light_candles') {
    const C = OUTAGE_TUNING.candles;
    return { verbId: id, line: companion ? tradFill(C.shared, { name: companion }) : C.line };
  }
  return { cancelled: true };
}

// The write behind the OCCASION_RITUAL effect. Returns what happened (for tests).
function applyTradVerb(gs, id, roomId, arg) {
  const T = TRADITION_TUNING;
  const clock = gs.meta.clock;
  const day = clock.day;
  if (T.rituals[id]) return applyOccasionRitual(gs, id, roomId);
  const open = tradVerbOpen(gs, id, roomId);
  if (!open.ok) return null;
  const t = tradState(gs);
  const mood = (d) => { if (typeof pushMoodImpulse === 'function') pushMoodImpulse(gs.player, d, day); };
  if (id === 'play_prank') {
    const [target, idx] = String(arg || '').split(':');
    const res = applyPlayerPrank(gs, target, Number(idx) || 0);
    if (!res) return null;
    t.ritual[`${id}|${day}`] = true;
    mood(res.landed ? T.playful.pranks.moodLands : -0.02);
    return res;
  }
  if (id === 'powder_fight') {
    const C = T.playful.color;
    t.ritual[`${id}|${day}`] = true;
    mood(C.player.mood);
    const here = tradRitualCompanions(gs, roomId);
    for (const cid of here) {
      tradMood(gs, cid, C.mood);
      gs.npcs[cid] = applyRelDelta(gs.npcs[cid], { tension: C.tension }, day);
    }
    bumpRoomDirt(gs, roomId, C.dirt);
    return { companions: here };
  }
  if (id === 'hunt_eggs') {
    t.ritual[`${id}|${day}`] = (t.ritual[`${id}|${day}`] || 0) + 1;
    const res = applyEggHunt(gs, roomId);
    if (res) { tradGive(gs, res.defId, 1, 'player'); mood(T.playful.eggs.hunt.mood); }
    return res;
  }
  if (id === 'dye_eggs') {
    const E = T.playful.eggs.dye;
    t.ritual[`${id}|${day}`] = true;
    tradGive(gs, E.item, E.qty, 'player');
    mood(E.mood);
    return { qty: E.qty };
  }
  if (id === 'carve_pumpkin') {
    t.ritual[`${id}|${day}`] = true;
    mood(T.playful.halloween.pumpkin.mood);
    for (const cid of tradRitualCompanions(gs, roomId)) tradMood(gs, cid, T.participantMood);
    return {};
  }
  if (id === 'light_candles') {
    applyOutageCandles(gs);
    mood(OUTAGE_TUNING.candles.mood);
    for (const cid of tradRitualCompanions(gs, roomId)) tradMood(gs, cid, T.participantMood);
    return {};
  }
  if (id === 'coins_in_jar') {
    const J = T.playful.giving.jar;
    t.ritual[`${id}|${day}`] = (t.ritual[`${id}|${day}`] || 0) + 1;
    mood(J.mood);
    return { total: applyJarCoins(gs, J.coins) };
  }
  return null;
}

// The door verbs' trick-or-treat branch (defs.actions.js's answer/refuse builders).
function tradDoorEffects(gs, decision) {
  const H = TRADITION_TUNING.playful.halloween;
  const inv = gs.player?.inventory || [];
  const candy = inv.find(s => s.defId === H.candyItem && s.qty > 0);
  if (decision === 'admit') {
    return candy ? [`DESTROY_ITEM ${H.candyItem} 1 player`, `ADJUST_NEED player mood +${H.giveMood}`]
      : [`ADJUST_NEED player mood ${H.noneMood}`];
  }
  return [`ADJUST_NEED player mood ${H.refuseMood}`];
}

function tradDoorNarration(gs, decision) {
  const H = TRADITION_TUNING.playful.halloween;
  if (decision !== 'admit') return H.refused;
  const inv = gs.player?.inventory || [];
  return inv.some(s => s.defId === H.candyItem && s.qty > 0) ? H.admitGive : H.admitNone;
}

// --- The daily entry point ---------------------------------------------------------------------------

// Called from processOccasionsForDay (live state only), once per day crossed,
// with the NEW day. Order: last night's payoffs first (the countdown, sights,
// yesterday's feasts), then today's proposals and gestures.
function processTraditionsForDay(gs, day) {
  const out = { lines: [] };
  if (!gs || !gs.npcs || !day || !gs.world) return out;
  tradState(gs);
  // Yesterday.
  processCountdown(gs, day, out);
  processNightSightsForDay(gs, day, out);
  resolveFeasts(gs, day, out);
  // Today.
  processAnniversariesForDay(gs, day, out);
  processGiftsForDay(gs, day, out);
  processFeastsForDay(gs, day, out);
  processBeatsForDay(gs, day, out);
  processLanternsForDay(gs, day, out);
  processPranksForDay(gs, day, out);
  processColorFightForDay(gs, day, out);
  processEggsForDay(gs, day, out);
  processHalloweenForDay(gs, day, out);
  processGivingForDay(gs, day, out);
  processHolidayPostsForDay(gs, day, out);
  processHolidayMailForDay(gs, day);
  tradPrune(gs, getYear(day));
  return out;
}

// ===== /SECTION: TRADITIONS =====
