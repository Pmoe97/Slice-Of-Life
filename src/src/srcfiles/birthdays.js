// ===== SECTION: BIRTHDAYS =====
// Roommate birthdays (birthdays-and-occasions-plan.md Phase 1, D1–D12). The
// seasonal calendar had four 35-day seasons and not one personal date on
// it. Now every NPC has a birthday, the player can find out when it is, and
// on the day it matters whether they remembered.
//
// The loop, end to end:
//   - WHEN: npcBirthdayDayOfYear — a pure function of bible.genSeed (D1),
//     never stored, so an old save gets stable birthdays with no migration
//     (the taste.js precedent). An explicit bible.birthday override wins.
//   - FINDING OUT (D3/D4): mention birthdays to a roommate and you learn
//     theirs (the prompt line always carries the real date, so what they
//     say and what the Calendar shows can never disagree); two days out, a
//     housemate who is fond of them texts you a heads-up — or, failing
//     one, the birthday roommate drops a hint themselves; on the morning
//     itself the whole house knows.
//   - THE DAY (D5/D6/D8): a morning narration line, a better mood for them,
//     a [Birthday] prompt line so the conversation plays it, and a reward
//     for saying happy birthday (in person or by text — any mention counts)
//     and, separately, for a gift given that day.
//   - AFTER (D7): at the next rollover, a roommate fond enough to have
//     expected it, whose birthday you knew about and ignored, is hurt —
//     a small relationship sting, a mood dip and a memory. Never a sting
//     for a birthday you had no way of knowing.
//
// Residents only (D2): visitors, contacts, applicants and former residents
// have derived birthdays too (the function is total) but nothing here
// surfaces them — that's a later phase's call.
//
// Player-side state rides player.birthdays (the one-key player record;
// ensurePlayerBirthdays is its lazy default, the state.js additive-default
// precedent):
//   { known: { [npcId]: dayLearned }, everWished: bool,
//     marks: { [npcId]: { year, wished, gifted, headsUp, resolved, forgot, via } } }
// ONE mark per NPC, for the birthday year it was written in — the first
// write for a later year replaces it (birthdayMark).
//
// Pure-ish domain logic, no DOM, no model calls: the UI layer (ui.js's
// processBirthdaysForDayUi, doConvSend; computer.js's resolveImReply) calls
// in and narrates what comes back. BIRTHDAY_TUNING (config.js) is the one
// tuning table.

// --- Calendar arithmetic ----------------------------------------------------

// Day-of-year 1..daysPerYear for an absolute day (day 1 = 1st of Spring, Y1).
function birthdayDayOfYear(day) {
  const n = CALENDAR.daysPerYear;
  return ((((day - 1) % n) + n) % n) + 1;
}

// D1 — the NPC's birthday as a day-of-year. Derived-but-stable: seeded from
// genSeed (persisted on every bible, generated and authored alike), salted so
// it never correlates with another genSeed draw. An integer bible.birthday
// in range wins (authored characters, harnesses).
function npcBirthdayDayOfYear(npc) {
  const n = CALENDAR.daysPerYear;
  const override = npc?.bible?.birthday;
  if (Number.isInteger(override) && override >= 1 && override <= n) return override;
  const raw = npc?.bible?.genSeed ?? npc?.genSeed ?? null;
  const seedBase = (typeof raw === 'number' && isFinite(raw)) ? raw : hashStr(String(raw ?? npc?.id ?? 'npc'));
  const rng = mulberry32(((seedBase >>> 0) + BIRTHDAY_TUNING.seedSalt) >>> 0);
  return 1 + Math.floor(rng() * n);
}

function isBirthdayOn(npc, day) {
  return !!npc && birthdayDayOfYear(day) === npcBirthdayDayOfYear(npc);
}

// 0 on the day itself, up to daysPerYear - 1 the day after.
function daysUntilBirthday(npc, fromDay) {
  const n = CALENDAR.daysPerYear;
  return (npcBirthdayDayOfYear(npc) - birthdayDayOfYear(fromDay) + n) % n;
}

// "14th of Summer" — the same day/season wording formatDate uses, minus the
// weekday and year (a birthday has neither).
function formatBirthday(dayOfYear) {
  const dps = CALENDAR.daysPerSeason;
  const idx = Math.floor((dayOfYear - 1) / dps) % CALENDAR.seasons.length;
  const dom = ((dayOfYear - 1) % dps) + 1;
  return `${dom}${ordinalSuffix(dom)} of ${CALENDAR.seasonNames[CALENDAR.seasons[idx]]}`;
}

// --- Player-side record -----------------------------------------------------

function ensurePlayerBirthdays(player) {
  if (!player) return { known: {}, marks: {}, everWished: false };
  const rec = (player.birthdays && typeof player.birthdays === 'object') ? player.birthdays : {};
  if (!rec.known || typeof rec.known !== 'object') rec.known = {};
  if (!rec.marks || typeof rec.marks !== 'object') rec.marks = {};
  if (typeof rec.everWished !== 'boolean') rec.everWished = false;
  player.birthdays = rec;
  return rec;
}

// The NPC's mark for one birthday year. `create` writes a fresh one when the
// stored mark is for another year (or missing); otherwise a year mismatch
// reads as "no mark".
function birthdayMark(gs, npcId, year, create) {
  const rec = ensurePlayerBirthdays(gs?.player);
  const m = rec.marks[npcId];
  if (m && m.year === year) return m;
  if (!create) return null;
  const fresh = { year, wished: false, gifted: false, headsUp: false, resolved: false, forgot: false, via: null };
  rec.marks[npcId] = fresh;
  return fresh;
}

function knowsBirthday(gs, npcId) {
  return !!gs?.player?.birthdays?.known?.[npcId];
}

// Returns true only when this call is what taught the player.
function learnBirthday(gs, npcId, day) {
  const rec = ensurePlayerBirthdays(gs?.player);
  if (rec.known[npcId]) return false;
  rec.known[npcId] = day || 1;
  return true;
}

// --- Small readers ----------------------------------------------------------

function isBirthdayResident(npc) {
  return !!npc && npc.residency?.status === 'resident';
}

// Sorted so every pass over them (and every tie-break) is deterministic.
function birthdayResidentIds(gs) {
  return Object.keys(gs?.npcs || {}).filter(id => isBirthdayResident(gs.npcs[id])).sort();
}

function isBirthdayToday(gs, npcId) {
  const npc = gs?.npcs?.[npcId];
  return isBirthdayResident(npc) && isBirthdayOn(npc, gs.meta?.clock?.day);
}

// D6 — does this line of the player's acknowledge a birthday? Generous by
// design: any mention counts.
function birthdayWishMatches(text) {
  return new RegExp(BIRTHDAY_TUNING.wishPattern, 'i').test(String(text || ''));
}

function birthdayNpcName(npc) {
  return npc?.bible?.name || 'your roommate';
}

function fillBirthdayText(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

// Deterministic line choice — a pure hash of (who, day), so a reload replays
// the same text and no rng stream anywhere else is disturbed.
function pickBirthdayLine(pools, sender, day, salt) {
  const style = sender?.bible?.speech?.textingStyle;
  const pool = (style && pools[style]) || pools.default || [];
  if (!pool.length) return '';
  return pool[hashStr(`${salt}|${day}`) % pool.length];
}

function castAffection(gs, fromId, toId) {
  const key = [fromId, toId].sort().join('|');
  return gs?.world?.castWeb?.[key]?.axes?.[`${fromId}→${toId}`]?.affection || 0;
}

function nudgeNpcMood(npc, delta) {
  return { ...npc, mood: Math.max(-1, Math.min(1, (npc.mood || 0) + delta)) };
}

// --- Acknowledgment (D6/D8) -------------------------------------------------

// Called with every free-text line the player says to (or texts) a roommate,
// AFTER the reply has been applied (the one effect-application moment —
// applyProposal replaces npcs[npcId], so an earlier write would be lost).
// Returns { kind, beat } when something happened, else null.
//   - On their birthday: the first mention is the wish (reward once).
//   - Any other day: mentioning birthdays is how you find out theirs (D3).
function noteBirthdayWish(gs, npcId, text, via) {
  const npc = gs?.npcs?.[npcId];
  if (!isBirthdayResident(npc) || !gs.player || !birthdayWishMatches(text)) return null;
  const T = BIRTHDAY_TUNING;
  const day = gs.meta.clock.day;
  const name = birthdayNpcName(npc);
  if (!isBirthdayOn(npc, day)) {
    if (!learnBirthday(gs, npcId, day)) return null;
    return { kind: 'learned', beat: fillBirthdayText(T.learnBeat, { name, date: formatBirthday(npcBirthdayDayOfYear(npc)) }) };
  }
  learnBirthday(gs, npcId, day);
  const mark = birthdayMark(gs, npcId, getYear(day), true);
  if (mark.wished) return null;
  mark.wished = true;
  mark.via = via === 'text' ? 'text' : 'spoken';
  ensurePlayerBirthdays(gs.player).everWished = true;
  const W = T.wish;
  let next = applyRelDelta(npc, { affection: W.affection, trust: W.trust }, day);
  next = nudgeNpcMood(next, W.mood);
  next = addMemoryFact(next, { text: fillBirthdayText(T.wishFact, { name }), day, importance: W.factImportance, category: 'relationship' });
  gs.npcs[npcId] = next;
  pushMoodImpulse(gs.player, W.playerMood, day);
  return { kind: 'wished', beat: fillBirthdayText(mark.via === 'text' ? T.wishBeatText : T.wishBeatSpoken, { name }) };
}

// D8 — a gift given ON the birthday. ASK_GIFT.effects asks this whether to
// add the bonus lines (pure read — effects() runs before postEffects), and
// ASK_GIFT.postEffects calls noteBirthdayGift to write the mark. Once per
// birthday: a second present the same day is an ordinary gift.
function birthdayGiftBonusApplies(gs, npcId) {
  if (!isBirthdayToday(gs, npcId)) return false;
  const mark = birthdayMark(gs, npcId, getYear(gs.meta.clock.day), false);
  return !(mark && mark.gifted);
}

function birthdayGiftEffectLines(gs, npcId) {
  if (!birthdayGiftBonusApplies(gs, npcId)) return [];
  return [`REL_DELTA ${npcId} affection +${BIRTHDAY_TUNING.giftBonus.affection.toFixed(2)}`];
}

function noteBirthdayGift(gs, npcId) {
  if (!birthdayGiftBonusApplies(gs, npcId)) return null;
  const day = gs.meta.clock.day;
  learnBirthday(gs, npcId, day);
  const mark = birthdayMark(gs, npcId, getYear(day), true);
  mark.gifted = true;
  ensurePlayerBirthdays(gs.player).everWished = true;
  const npc = gs.npcs[npcId];
  gs.npcs[npcId] = nudgeNpcMood(npc, BIRTHDAY_TUNING.giftBonus.mood);
  return { kind: 'gifted', beat: fillBirthdayText(BIRTHDAY_TUNING.giftBeat, { name: birthdayNpcName(npc) }) };
}

// --- Prompt line (D9) -------------------------------------------------------

// One line for buildNpcBlockV2 (llm.js), the scene AND the IM prompt. Always
// carries the real date so an NPC asked "when's your birthday?" answers with
// the date the Calendar will show; the day-of wording tells the writer
// whether the player has remembered yet.
function birthdayPromptLine(gs, npcId) {
  const npc = gs?.npcs?.[npcId];
  const day = gs?.meta?.clock?.day;
  if (!isBirthdayResident(npc) || !day) return null;
  const name = birthdayNpcName(npc);
  const date = formatBirthday(npcBirthdayDayOfYear(npc));
  const until = daysUntilBirthday(npc, day);
  if (until === 0) {
    const mark = birthdayMark(gs, npcId, getYear(day), false);
    if (mark && mark.gifted) return `[Birthday]: TODAY (${date}) is ${name}'s birthday. The player gave them a birthday present today — they're touched, and it shows.`;
    if (mark && mark.wished) return `[Birthday]: TODAY (${date}) is ${name}'s birthday. The player already wished them a happy birthday today — it genuinely pleased them.`;
    return `[Birthday]: TODAY (${date}) is ${name}'s birthday. The player hasn't mentioned it yet — ${name} has noticed, and how much that shows depends on how close they are.`;
  }
  if (until === CALENDAR.daysPerYear - 1) {
    const mark = birthdayMark(gs, npcId, getYear(day - 1), false);
    if (mark && mark.forgot) return `[Birthday]: Yesterday (${date}) was ${name}'s birthday, and the player never said a word about it. It stung; they may or may not bring it up.`;
  }
  if (until <= BIRTHDAY_TUNING.promptSoonDays) {
    return `[Birthday]: ${date} — ${until === 1 ? 'tomorrow' : `in ${until} days`}. It's on their mind; they might mention it if it comes up naturally.`;
  }
  return `[Birthday]: ${date}.`;
}

// --- Calendar rows (D10) ----------------------------------------------------

// The Calendar app's Birthdays screen: every resident whose birthday the
// player knows, soonest first.
function knownBirthdayRows(gs) {
  const known = gs?.player?.birthdays?.known || {};
  const day = gs?.meta?.clock?.day || 1;
  const rows = [];
  for (const id of Object.keys(known)) {
    const npc = gs.npcs?.[id];
    if (!isBirthdayResident(npc)) continue;
    const until = daysUntilBirthday(npc, day);
    const mark = until === 0 ? birthdayMark(gs, id, getYear(day), false) : null;
    rows.push({
      id, npcId: id,
      name: birthdayNpcName(npc),
      date: formatBirthday(npcBirthdayDayOfYear(npc)),
      daysUntil: until,
      remembered: !!(mark && (mark.wished || mark.gifted)),
    });
  }
  return rows.sort((a, b) => (a.daysUntil - b.daysUntil) || a.name.localeCompare(b.name));
}

function birthdayRowLabel(row) {
  const when = row.daysUntil === 0 ? 'today!' : row.daysUntil === 1 ? 'tomorrow' : `in ${row.daysUntil} days`;
  const done = row.daysUntil === 0 && row.remembered ? ' — you remembered ✓' : '';
  return `🎂 ${row.name} — ${row.date} (${when})${done}`;
}

// --- The day rollover (D4/D5/D7) -------------------------------------------

// The strongest housemate able to tip the player off about npcId's birthday:
// fond of them, at least friendly with the player. Deterministic (score,
// then id). null when nobody qualifies.
function pickBirthdayTipster(gs, npcId, residentIds) {
  const T = BIRTHDAY_TUNING;
  let best = null;
  for (const id of residentIds) {
    if (id === npcId) continue;
    const toThem = castAffection(gs, id, npcId);
    const toPlayer = gs.npcs[id]?.relPlayer?.affection || 0;
    if (toThem < T.tipsterNpcAffection || toPlayer < T.tipsterPlayerAffection) continue;
    const score = toThem + toPlayer;
    if (!best || score > best.score) best = { id, score };
  }
  return best ? best.id : null;
}

// Runs once per calendar day crossed (ui.js's processDayRollover), with the
// NEW day. Order matters and is the narrative order: yesterday resolves, then
// today is announced, then the heads-up for two days out goes out. Returns
// { lines, texts } — lines for the narration log (the UI wrapper logs them),
// texts already delivered into the IM threads via processNpcImMessages.
function processBirthdaysForDay(gs, day) {
  const out = { lines: [], texts: [] };
  if (!gs?.player || !gs.npcs || !day) return out;
  const T = BIRTHDAY_TUNING;
  const rec = ensurePlayerBirthdays(gs.player);
  const ids = birthdayResidentIds(gs);

  // 1. D7 — yesterday's birthdays resolve.
  if (day > 1) {
    for (const id of ids) {
      const npc = gs.npcs[id];
      if (!isBirthdayOn(npc, day - 1)) continue;
      const mark = birthdayMark(gs, id, getYear(day - 1), true);
      if (mark.resolved) continue;
      mark.resolved = true;
      if (mark.wished || mark.gifted) continue;
      if (!rec.known[id]) continue;
      if ((npc.relPlayer?.affection || 0) < T.expectAffection) continue;
      mark.forgot = true;
      const name = birthdayNpcName(npc);
      const F = T.forgot;
      // currentDay undefined: a sting at midnight is not an interaction, so
      // lastInteractionDay must not move.
      let next = applyRelDelta(npc, { affection: F.affection, tension: F.tension }, undefined);
      next = nudgeNpcMood(next, F.mood);
      next = addMemoryFact(next, { text: fillBirthdayText(T.forgotFact, { name }), day: day - 1, importance: F.factImportance, category: 'relationship' });
      gs.npcs[id] = next;
      out.lines.push(fillBirthdayText(T.forgotLine, { name }));
    }
  }

  // 2. D5 — today's birthdays: the house knows, and so do you.
  for (const id of ids) {
    const npc = gs.npcs[id];
    if (!isBirthdayOn(npc, day)) continue;
    learnBirthday(gs, id, day);
    birthdayMark(gs, id, getYear(day), true);
    gs.npcs[id] = nudgeNpcMood(npc, T.dayOfMood);
    out.lines.push(fillBirthdayText(T.dayOfLine, { name: birthdayNpcName(npc) }) + (rec.everWished ? '' : T.dayOfHint));
  }

  // 3. D4 — the heads-up, headsUpDays out. A housemate tips you off; failing
  // one, the birthday roommate may mention it themselves; failing that,
  // nobody says anything and you find out on the day.
  for (const id of ids) {
    const npc = gs.npcs[id];
    if (daysUntilBirthday(npc, day) !== T.headsUpDays) continue;
    const bdayDay = day + T.headsUpDays;
    const mark = birthdayMark(gs, id, getYear(bdayDay), true);
    if (mark.headsUp) continue;
    const when = WEEKDAY_NAMES[getWeekday(bdayDay)];
    const name = birthdayNpcName(npc);
    let senderId = pickBirthdayTipster(gs, id, ids);
    let text = null;
    if (senderId) {
      text = fillBirthdayText(pickBirthdayLine(T.tipOffLines, gs.npcs[senderId], day, `${senderId}>${id}`), { name, when });
    } else if ((npc.relPlayer?.affection || 0) >= T.fishPlayerAffection
      && (npc.bible?.temperament?.assertiveness ?? 0) >= T.fishMinAssertiveness) {
      senderId = id;
      text = fillBirthdayText(pickBirthdayLine(T.fishLines, npc, day, `${id}>self`), { name, when });
    }
    if (!senderId || !text) continue;
    mark.headsUp = true;
    learnBirthday(gs, id, day);
    out.texts.push({ npcId: senderId, text, aboutId: id });
  }
  if (out.texts.length && typeof processNpcImMessages === 'function' && gs.world?.computer?.apps?.im) {
    processNpcImMessages(gs, out.texts);
  }
  return out;
}

// ===== /SECTION: BIRTHDAYS =====
