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
// Residents get all of it (D2). Phase 6 adds CONTACTS (a non-resident whose
// number you have, Del included): they text you on the day when fond enough
// and your wish counts — but no sting, no tip-off and no celebration, which
// all assume a shared house. Applicants and former residents are still out.
//
// Phases 2–5 (the same file, in order below): the PLAYER'S own birthday —
// picked on the year grid in creation, greeted on the day by everyone who
// knows it (D13); birthday IMPORTANCE and the gossip a forgotten,
// high-importance roommate starts (D14); the house CELEBRATING — a card, a
// cake, a Chatter post — the morning of a roommate's birthday; and a
// $HouseParty booked on a birthday becoming THEIR party.
//
// Player-side state rides player.birthdays (the one-key player record;
// ensurePlayerBirthdays is its lazy default, the state.js additive-default
// precedent):
//   { known: { [npcId]: dayLearned }, everWished: bool,
//     marks: { [npcId]: { year, wished, gifted, headsUp, resolved, forgot, via,
//                         celebrated, partied } },
//     told: { [npcId]: dayTold }, self: { year, announced, greeted, gift },
//     promptShown: bool }
// and player.birthday — the day-of-year the player picked (absent on a save
// from before Phase 2, which derives one and asks once).
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
  if (!player) return { known: {}, marks: {}, everWished: false, told: {}, promptShown: false };
  const rec = (player.birthdays && typeof player.birthdays === 'object') ? player.birthdays : {};
  if (!rec.known || typeof rec.known !== 'object') rec.known = {};
  if (!rec.marks || typeof rec.marks !== 'object') rec.marks = {};
  if (typeof rec.everWished !== 'boolean') rec.everWished = false;
  if (!rec.told || typeof rec.told !== 'object') rec.told = {};
  if (typeof rec.promptShown !== 'boolean') rec.promptShown = false;
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
  const fresh = { year, wished: false, gifted: false, headsUp: false, resolved: false, forgot: false, via: null, celebrated: false, partied: false };
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

// Phase 6 — a contact: someone outside the house whose number you have (a
// partner, Del, anyone you exchanged numbers with). Former residents and
// applicants stay out.
function isBirthdayContact(npc) {
  if (!npc || npc.contactKnown !== true) return false;
  const status = npc.residency?.status;
  return status !== 'resident' && status !== 'former' && status !== 'prospective';
}

// Whoever has a birthday the player can find out about and honour.
function isBirthdayPerson(npc) {
  return isBirthdayResident(npc) || isBirthdayContact(npc);
}

function birthdayHash01(key) {
  return (hashStr(String(key)) % 100000) / 100000;
}

// Sorted so every pass over them (and every tie-break) is deterministic.
function birthdayResidentIds(gs) {
  return Object.keys(gs?.npcs || {}).filter(id => isBirthdayResident(gs.npcs[id])).sort();
}

function isBirthdayToday(gs, npcId) {
  const npc = gs?.npcs?.[npcId];
  return isBirthdayPerson(npc) && isBirthdayOn(npc, gs.meta?.clock?.day);
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

// --- Importance (Phase 3, D14) ---------------------------------------------

// How much THEIR birthday matters to THEM, 0..1: derived, never stored (R5).
// Festivity is one input; warmth and a few traits lean it either way, and a
// round age (or 21) is a milestone. An explicit bible.birthdayImportance
// overrides (authored characters, harnesses).
function npcBirthdayImportance(npc) {
  const b = npc?.bible || {};
  if (typeof b.birthdayImportance === 'number' && isFinite(b.birthdayImportance)) return Math.max(0, Math.min(1, b.birthdayImportance));
  const I = BIRTHDAY_TUNING.importance;
  const fest = typeof npcFestivity === 'function' ? npcFestivity(npc) : 0.5;
  let v = I.base + I.festivity * fest;
  for (const [axis, w] of Object.entries(I.temperament)) v += (Number(b.temperament?.[axis]) || 0) * w;
  for (const trait of b.personality?.traits || []) v += I.traits[trait] || 0;
  const age = Number(b.age);
  if (Number.isFinite(age) && ((age > 0 && age % 10 === 0) || I.milestoneAges.includes(age))) v += I.milestoneBonus;
  return Math.max(0, Math.min(1, v));
}

// The multiplier on the forget sting and the wish's payoff — "it doesn't need
// to be a HUGE deal", so it only spans scaleLo..scaleHi around 1.
function birthdayImportanceScale(npc) {
  const I = BIRTHDAY_TUNING.importance;
  return I.scaleLo + (I.scaleHi - I.scaleLo) * npcBirthdayImportance(npc);
}

// A hurt, high-importance roommate tells the housemates they are close to —
// a real transmission (a told_by fact through receiveTransmittedFact, the
// same receiver-write the npc_chat drive's gossip uses), so it can surface in
// THEIR conversations. Returns how many housemates were told.
function birthdayGossip(gs, npcId, residentIds, day) {
  const I = BIRTHDAY_TUNING.importance;
  const npc = gs.npcs[npcId];
  if (!npc || typeof receiveTransmittedFact !== 'function') return 0;
  const imp = npcBirthdayImportance(npc);
  if (imp < I.gossipMin) return 0;
  const tellers = imp >= I.gossipTellers.highAt ? I.gossipTellers.high : I.gossipTellers.base;
  const listeners = residentIds
    .filter(id => id !== npcId && gs.npcs[id])
    .map(id => ({ id, aff: castAffection(gs, npcId, id) }))
    .filter(x => x.aff >= I.gossipCloseAffection)
    .sort((a, b) => (b.aff - a.aff) || a.id.localeCompare(b.id))
    .slice(0, tellers);
  const fact = { text: fillBirthdayText(I.gossipFact, { name: birthdayNpcName(npc) }), day: day - 1, importance: I.gossipFactImportance, category: 'relationship' };
  for (const l of listeners) {
    gs.npcs[l.id] = receiveTransmittedFact(gs.npcs[l.id], fact, { kind: 'told', provenance: `told_by:${npcId}`, sourceId: npcId, day });
  }
  return listeners.length;
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
  if (!isBirthdayPerson(npc) || !gs.player) return null;
  // "my birthday is…" is the PLAYER telling THEM (Phase 2), not a wish and not
  // how you learn theirs — it never falls through to either.
  if (birthdayToldMatches(text)) return noteBirthdayTold(gs, npcId, text);
  if (!birthdayWishMatches(text)) return null;
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
  // Phase 3 (D14): being remembered means more to some people. A contact's
  // wish pays at a fraction (Phase 6) — they are not in your house.
  const scale = birthdayImportanceScale(npc) * (isBirthdayResident(npc) ? 1 : T.contacts.wishMoodScale);
  let next = applyRelDelta(npc, { affection: W.affection * scale, trust: W.trust }, day);
  next = nudgeNpcMood(next, W.mood * scale);
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
  if (!day) return null;
  // The player's own birthday (Phase 2) rides the same prompt slot — a person
  // can have both lines on the same day.
  const own = typeof playerBirthdayPromptLine === 'function' ? playerBirthdayPromptLine(gs, npcId) : null;
  const theirs = birthdayOwnPromptLine(gs, npcId, npc, day);
  if (theirs && own) return `${theirs}\n${own}`;
  return theirs || own || null;
}

function birthdayOwnPromptLine(gs, npcId, npc, day) {
  if (!isBirthdayPerson(npc)) return null;
  const name = birthdayNpcName(npc);
  const date = formatBirthday(npcBirthdayDayOfYear(npc));
  const until = daysUntilBirthday(npc, day);
  if (until === 0) {
    const mark = birthdayMark(gs, npcId, getYear(day), false);
    // Phase 5: a party booked on the day is THEIR party.
    const party = birthdayPartyToday(gs, npcId) ? ` ${BIRTHDAY_TUNING.party.promptLine}` : '';
    if (mark && mark.gifted) return `[Birthday]: TODAY (${date}) is ${name}'s birthday. The player gave them a birthday present today — they're touched, and it shows.${party}`;
    if (mark && mark.wished) return `[Birthday]: TODAY (${date}) is ${name}'s birthday. The player already wished them a happy birthday today — it genuinely pleased them.${party}`;
    return `[Birthday]: TODAY (${date}) is ${name}'s birthday. The player hasn't mentioned it yet — ${name} has noticed, and how much that shows depends on how close they are.${party}`;
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
    if (!isBirthdayPerson(npc)) continue;
    const until = daysUntilBirthday(npc, day);
    const mark = until === 0 ? birthdayMark(gs, id, getYear(day), false) : null;
    rows.push({
      id, npcId: id,
      name: birthdayNpcName(npc),
      date: formatBirthday(npcBirthdayDayOfYear(npc)),
      daysUntil: until,
      remembered: !!(mark && (mark.wished || mark.gifted || mark.partied)),
    });
  }
  // Phase 2: your own birthday is always on the list (you know it).
  if (gs?.player && typeof playerBirthdayDayOfYear === 'function') {
    const doy = playerBirthdayDayOfYear(gs);
    const until = (doy - birthdayDayOfYear(day) + CALENDAR.daysPerYear) % CALENDAR.daysPerYear;
    rows.push({ id: 'player', npcId: null, self: true, name: 'You', date: formatBirthday(doy), daysUntil: until, remembered: false });
  }
  return rows.sort((a, b) => (a.daysUntil - b.daysUntil) || a.name.localeCompare(b.name));
}

function birthdayRowLabel(row) {
  const when = row.daysUntil === 0 ? 'today!' : row.daysUntil === 1 ? 'tomorrow' : `in ${row.daysUntil} days`;
  if (row.self) return `🎂 Your birthday — ${row.date} (${when})`;
  const done = row.daysUntil === 0 && row.remembered ? ' — you remembered ✓' : '';
  return `🎂 ${row.name} — ${row.date} (${when})${done}`;
}

// --- The player's own birthday (Phase 2, D13) -----------------------------

// An integer 1..daysPerYear, else 0 (a falsy "nothing usable").
function normalizePlayerBirthday(v) {
  const n = CALENDAR.daysPerYear;
  return (Number.isInteger(v) && v >= 1 && v <= n) ? v : 0;
}

// The rolled birthday for a blank "Roll it" draft (SIM's buildGameState) and
// the studio's Roll Everything — a pure function of the seed, salted so it
// never correlates with another draw.
function rollPlayerBirthday(seed) {
  const raw = (typeof seed === 'number' && isFinite(seed)) ? seed : hashStr(String(seed ?? 'player'));
  const rng = mulberry32(((raw >>> 0) + BIRTHDAY_TUNING.player.seedSalt) >>> 0);
  return 1 + Math.floor(rng() * CALENDAR.daysPerYear);
}

function hasPlayerBirthday(gs) {
  return normalizePlayerBirthday(gs?.player?.birthday) > 0;
}

// The player's birthday as a day-of-year. A save from before Phase 2 has no
// stored one, so it derives a stable one (seed + name — old saves need no
// migration, the D1 precedent); the one-time prompt then lets them choose.
function playerBirthdayDayOfYear(gs) {
  const p = gs?.player;
  if (!p) return null;
  return normalizePlayerBirthday(p.birthday)
    || rollPlayerBirthday(hashStr(`${gs?.meta?.seed ?? ''}|${p.name || ''}|${p.surname || ''}`));
}

function isPlayerBirthdayOn(gs, day) {
  return !!gs?.player && birthdayDayOfYear(day) === playerBirthdayDayOfYear(gs);
}

// Stores the pick (the prompt's Save, or Skip locking in the derived day).
function setPlayerBirthday(gs, doy) {
  const v = normalizePlayerBirthday(doy);
  if (!v || !gs?.player) return false;
  gs.player.birthday = v;
  ensurePlayerBirthdays(gs.player).promptShown = true;
  return true;
}

// Only an old save ever asks: a new game always stores one.
function playerBirthdayNeedsPrompt(gs) {
  return !!gs?.player && !hasPlayerBirthday(gs) && !ensurePlayerBirthdays(gs.player).promptShown;
}

function birthdayToldMatches(text) {
  return new RegExp(BIRTHDAY_TUNING.player.toldPattern, 'i').test(String(text || ''));
}

// Does this resident know when the player's birthday is? Fond enough, or told.
function residentKnowsPlayerBirthday(gs, npcId) {
  const npc = gs?.npcs?.[npcId];
  if (!isBirthdayResident(npc) || !gs.player) return false;
  return !!ensurePlayerBirthdays(gs.player).told[npcId]
    || (npc.relPlayer?.affection || 0) >= BIRTHDAY_TUNING.player.knownAffection;
}

// The player tells a roommate ("my birthday's on the…"). Runs from
// noteBirthdayWish — after the reply is applied, like every birthday write —
// and returns { kind: 'told', beat } the first time, else null.
function noteBirthdayTold(gs, npcId, text) {
  const npc = gs?.npcs?.[npcId];
  if (!isBirthdayResident(npc) || !gs.player) return null;
  const rec = ensurePlayerBirthdays(gs.player);
  if (rec.told[npcId]) return null;
  const P = BIRTHDAY_TUNING.player;
  const day = gs.meta.clock.day;
  const date = formatBirthday(playerBirthdayDayOfYear(gs));
  rec.told[npcId] = day;
  gs.npcs[npcId] = addMemoryFact(npc, { text: fillBirthdayText(P.toldFact, { date }), day, importance: 0.5, category: 'relationship' });
  return { kind: 'told', beat: fillBirthdayText(P.toldBeat, { name: birthdayNpcName(npc), date }) };
}

// The [Birthday] line about the PLAYER's day, for a resident who knows it.
// null when they don't (nobody is told what they couldn't know).
function playerBirthdayPromptLine(gs, npcId) {
  const npc = gs?.npcs?.[npcId];
  const day = gs?.meta?.clock?.day;
  if (!day || !residentKnowsPlayerBirthday(gs, npcId)) return null;
  const P = BIRTHDAY_TUNING.player;
  const name = birthdayNpcName(npc);
  const n = CALENDAR.daysPerYear;
  const until = (playerBirthdayDayOfYear(gs) - birthdayDayOfYear(day) + n) % n;
  if (until === 0) {
    const self = gs.player.birthdays?.self;
    const greeted = self && self.year === getYear(day) ? self.greeted?.[npcId] : null;
    if (greeted === 'text') return `[Birthday]: TODAY is the player's birthday and ${name} knows. They already texted them a happy birthday this morning.`;
    return `[Birthday]: TODAY is the player's birthday and ${name} knows. They haven't said a word yet — expect them to wish the player a happy birthday warmly, in their own way, unprompted.`;
  }
  if (until <= P.promptSoonDays) return `[Birthday]: the player's birthday is ${until === 1 ? 'tomorrow' : `in ${until} days`} and ${name} knows.`;
  return null;
}

// The closest housemate (fond enough) leaves a present in the player's bag —
// the gift_to_player MOVE_ITEM path (something of theirs, via giftableStack),
// or, owning nothing giftable, something they picked up. Returns
// { id, defId, label } or null.
function playerBirthdayGift(gs, day, knowerIds) {
  const P = BIRTHDAY_TUNING.player;
  const cands = knowerIds
    .map(id => ({ id, aff: gs.npcs[id]?.relPlayer?.affection || 0 }))
    .filter(x => x.aff >= P.giftAffection)
    .sort((x, y) => (y.aff - x.aff) || x.id.localeCompare(y.id));
  if (!cands.length) return null;
  const id = cands[0].id;
  const npc = gs.npcs[id];
  const stack = typeof giftableStack === 'function' ? giftableStack(npc) : null;
  const ctx = buildEffectContext(gs, [id], [id], {}, []);
  let defId;
  if (stack) {
    defId = stack.defId;
    applyEffects(parseEffectDSL(`MOVE_ITEM ${defId} 1 ${id} player`), ctx);
  } else {
    const pool = P.giftFallback.filter(d => ITEM_DEFS[d]);
    if (!pool.length) return null;
    defId = pool[hashStr(`${id}|pgift|${day}`) % pool.length];
    applyEffects(parseEffectDSL(`SPAWN_ITEM ${defId} 1 player`), ctx);
  }
  return { id, defId, label: ITEM_DEFS[defId]?.label || 'something' };
}

// The rollover onto the player's birthday. Once per year (self.announced).
// Everyone who knows it greets them — a text at midnight when fond enough
// (or by the toss of a coin below that), otherwise in person on the day (the
// [Birthday] prompt line) — and the closest leaves a present.
function processPlayerBirthday(gs, day, residentIds, out) {
  if (!isPlayerBirthdayOn(gs, day)) return;
  const P = BIRTHDAY_TUNING.player;
  const rec = ensurePlayerBirthdays(gs.player);
  const year = getYear(day);
  if (!rec.self || rec.self.year !== year) rec.self = { year, announced: false, greeted: {}, gift: null };
  const self = rec.self;
  if (self.announced) return;
  self.announced = true;
  pushMoodImpulse(gs.player, P.dayOfMood, day);
  const knowers = residentIds.filter(id => residentKnowsPlayerBirthday(gs, id));
  out.lines.push(P.dayOfLine + (knowers.length ? '' : P.dayOfQuietLine));
  let greets = 0;
  for (const id of knowers) {
    const npc = gs.npcs[id];
    const byText = (npc.relPlayer?.affection || 0) >= P.textAffection || birthdayHash01(`${id}|pb|${day}`) < 0.5;
    self.greeted[id] = byText ? 'text' : 'spoken';
    if (!byText) continue;
    greets++;
    out.texts.push({ npcId: id, text: pickBirthdayLine(P.greetLines, npc, day, `${id}>player`), aboutId: 'player' });
  }
  if (greets) pushMoodImpulse(gs.player, Math.min(P.greetMoodCap, greets * P.greetMood), day);
  const gift = playerBirthdayGift(gs, day, knowers);
  if (gift) {
    self.gift = { from: gift.id, defId: gift.defId };
    out.lines.push(fillBirthdayText(P.giftLine, { name: birthdayNpcName(gs.npcs[gift.id]), item: `the ${gift.label.toLowerCase()}` }));
  }
}

// --- The house celebrates (Phase 4) ----------------------------------------

function pushBirthdayEvent(gs, evt) {
  const w = gs.world || (gs.world = {});
  if (!Array.isArray(w.events)) w.events = [];
  w.events.push(evt);
}

function joinBirthdayNames(names) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

// Each housemate fond of the birthday roommate does one small, perceivable
// thing — a card on their door, a cake in the fridge (a real edible item), a
// Chatter post — built at the rollover so it is there in the morning, with a
// cast-web bump. One cake per birthday, the fondest baker's. The ones who did
// nothing are noticed, but only by someone whose birthday matters to them.
// Deterministic (a hash of celebrant, honoree, year — R6), once per birthday.
function celebrateBirthday(gs, honoreeId, day, residentIds, out) {
  const C = BIRTHDAY_TUNING.celebrate;
  const honoree = gs.npcs[honoreeId];
  const year = getYear(day);
  const mark = birthdayMark(gs, honoreeId, year, true);
  if (mark.celebrated) return;
  mark.celebrated = true;
  const honoreeName = birthdayNpcName(honoree);
  const others = residentIds.filter(id => id !== honoreeId && gs.npcs[id]);
  const fond = others.map(id => ({ id, aff: castAffection(gs, id, honoreeId) })).filter(x => x.aff >= C.fondAffection)
    .sort((x, y) => (y.aff - x.aff) || x.id.localeCompare(y.id));
  const fondIds = new Set(fond.map(x => x.id));
  const did = [];
  let cakeMade = false;
  let web = gs.world.castWeb || {};
  const homeRoom = honoree.residency?.room;
  const fridge = Object.values(gs.objects?.room_kitchen || {}).find(o => o.defId === 'fridge');
  const feed = gs.world?.computer?.apps?.social_feed;
  const canPost = !!(feed && Array.isArray(feed.posts) && typeof feed.nextPostId === 'number');
  for (const { id } of fond) {
    const celebrant = gs.npcs[id];
    const cname = birthdayNpcName(celebrant);
    const h = birthdayHash01(`${id}>${honoreeId}|${year}|celebrate`);
    let gesture = 'card';
    if (h < C.cakeChance && !cakeMade && fridge && ITEM_DEFS[C.cakeItem]) gesture = 'cake';
    else if (h >= C.cakeChance && h < C.cakeChance + C.postChance && canPost) gesture = 'post';
    let done = false;
    if (gesture === 'cake') {
      applyEffects(parseEffectDSL(`SPAWN_ITEM ${C.cakeItem} 1 ${fridge.id}`), buildEffectContext(gs, [id], [id], {}, []));
      pushBirthdayEvent(gs, { day, tick: 0, roomId: 'kitchen', npcId: id, type: 'birthday_cake', moodDelta: 0, importance: MEMORY_IMPORTANCE.social,
        data: { honoree: honoreeName }, template: C.cakeEventTemplate, seenByPlayer: false });
      cakeMade = true;
      done = true;
    } else if (gesture === 'post') {
      const postId = 'post_' + (feed.nextPostId++);
      const line = C.postLines[hashStr(`${id}|${honoreeId}|${year}|post`) % C.postLines.length];
      feed.posts.push({ id: postId, author: id, text: fillBirthdayText(line, { name: honoreeName }), likes: [honoreeId], comments: [], day,
        eventRef: null, visibility: 'public', media: null });
      done = true;
    }
    if (!done) {
      gesture = 'card';
      const text = fillBirthdayText(pickBirthdayLine(C.cardLines, celebrant, day, `${id}>${honoreeId}|card`), { name: honoreeName, from: cname });
      // On their bedroom door — or, for someone with no bedroom of their own
      // (a fresh Sandbox roommate has none), on the fridge.
      const onDoor = !!(homeRoom && ROOMS[homeRoom]);
      const cardRoom = onDoor ? homeRoom : 'kitchen';
      const note = typeof spawnNote === 'function'
        ? spawnNote(gs, { roomId: cardRoom, attachedTo: onDoor ? null : (fridge ? fridge.id : null), authorId: id, text, addressedTo: honoreeId }) : null;
      if (note) {
        note.meta.motive = 'birthday_card';
        pushBirthdayEvent(gs, { day, tick: 0, roomId: cardRoom, npcId: id, type: 'birthday_card', moodDelta: 0, importance: MEMORY_IMPORTANCE.social,
          data: { honoree: honoreeName }, template: onDoor ? C.cardEventTemplate : C.cardFridgeEventTemplate, seenByPlayer: false });
        done = true;
      }
    }
    if (!done) continue;
    did.push({ id, gesture, name: cname });
    web = applyNpcToNpcDelta(web, id, honoreeId, { affection: C.bump.toHonoree });
    web = applyNpcToNpcDelta(web, honoreeId, id, { affection: C.bump.fromHonoree });
  }
  // The ones who did nothing — noticed, by someone who cares about the day.
  const imp = npcBirthdayImportance(honoree);
  let next = gs.npcs[honoreeId];
  if (imp >= C.snubMinImportance) {
    const snubbers = others.filter(id => !fondIds.has(id)).map(id => id).sort().slice(0, 2);
    for (const id of snubbers) {
      web = applyNpcToNpcDelta(web, honoreeId, id, { affection: C.snubCastAffection });
      next = addMemoryFact(next, { text: fillBirthdayText(C.snubFact, { name: honoreeName, snubber: birthdayNpcName(gs.npcs[id]) }), day, importance: C.snubFactImportance, category: 'relationship' });
    }
  }
  if (did.length) next = nudgeNpcMood(next, Math.min(C.honoreeMoodCap, did.length * C.honoreeMood));
  gs.npcs[honoreeId] = next;
  gs.world.castWeb = web;
  if (did.length) {
    const what = joinBirthdayNames(did.map(d => `${d.name} ${d.gesture === 'cake' ? 'put a cake in the fridge' : d.gesture === 'post' ? 'posted a shoutout' : 'left a card'}`));
    out.lines.push(fillBirthdayText(C.houseLine, { name: honoreeName, what }));
  }
}

// --- A birthday party (Phase 5) ---------------------------------------------

// A booked house party that is THEIR party: it falls on their birthday and
// they accepted (the guest of honor). null for an ordinary party.
function birthdayPartyHonoree(gs, c) {
  if (!c || c.kind !== 'party' || typeof commitmentDay !== 'function') return null;
  const cd = commitmentDay(c);
  const ids = (c.acceptedIds || []).filter(id => isBirthdayResident(gs.npcs?.[id]) && isBirthdayOn(gs.npcs[id], cd)).sort();
  return ids[0] || null;
}

// Today's live-or-upcoming party for this person's birthday, or null.
function birthdayPartyToday(gs, npcId) {
  const npc = gs?.npcs?.[npcId];
  const day = gs?.meta?.clock?.day;
  if (!isBirthdayResident(npc) || !day || !isBirthdayOn(npc, day) || typeof commitmentDay !== 'function') return null;
  return (gs.world?.commitments || []).find(c => c.kind === 'party' && c.status === 'scheduled'
    && commitmentDay(c) === day && (c.acceptedIds || []).includes(npcId)) || null;
}

// Called from sim.js's per-tick party pass for each resident physically in a
// live party's room: the attendance ledger (c.attended) is who was actually
// there, the player included. The only writer.
function noteBirthdayPartyPresence(gs, c, npcId) {
  if (!c || c.kind !== 'party') return;
  const a = Array.isArray(c.attended) ? c.attended : (c.attended = []);
  if (npcId && !a.includes(npcId)) a.push(npcId);
  if (gs?.player?.location === c.roomId && !a.includes('player')) a.push('player');
}

// The rollover after a birthday party: the guest of honor's payoff, the host's
// thanks (or hurt, if the player threw it and never came), and attendance
// remembered — who showed, who said they would and didn't. A party that never
// reached its guest of honor pays nothing. Once per party (c.birthdayResolved).
function resolveBirthdayParties(gs, day, out) {
  const P = BIRTHDAY_TUNING.party;
  const list = gs.world?.commitments;
  if (!Array.isArray(list) || typeof commitmentDay !== 'function') return;
  for (const c of list) {
    if (c.kind !== 'party' || c.birthdayResolved || commitmentDay(c) !== day - 1) continue;
    const honoreeId = birthdayPartyHonoree(gs, c);
    if (!honoreeId) continue;
    c.birthdayResolved = true;
    const attended = Array.isArray(c.attended) ? c.attended : [];
    if (!attended.includes(honoreeId)) continue;
    const honoree = gs.npcs[honoreeId];
    const name = birthdayNpcName(honoree);
    const bday = day - 1;
    const playerCame = attended.includes('player');
    const guestIds = attended.filter(a => a !== honoreeId && a !== 'player' && gs.npcs[a]);
    const host = c.host || 'player';
    const scale = birthdayImportanceScale(honoree);
    const mark = birthdayMark(gs, honoreeId, getYear(bday), true);
    mark.partied = true;
    let next = nudgeNpcMood(honoree, P.honoreeMood * scale);
    let factText;
    const guestNames = guestIds.map(g => birthdayNpcName(gs.npcs[g]));
    if (host === 'player') {
      learnBirthday(gs, honoreeId, bday);
      next = applyRelDelta(next, { affection: (playerCame ? P.hostAffection : P.hostAbsentAffection) * scale }, undefined);
      factText = !playerCame ? P.skippedFact : guestNames.length ? fillBirthdayText(P.attendedFact, { host: 'The player', name, guests: joinBirthdayNames(guestNames) }) : fillBirthdayText(P.hostedFact, { name });
    } else {
      const hostName = birthdayNpcName(gs.npcs[host]) || 'Someone';
      factText = fillBirthdayText(P.attendedFact, { host: hostName, name, guests: guestNames.length ? joinBirthdayNames(guestNames) : 'nobody else' });
    }
    next = addMemoryFact(next, { text: fillBirthdayText(factText, { name }), day: bday, importance: P.factImportance, category: 'relationship' });
    let web = gs.world.castWeb || {};
    for (const g of guestIds) {
      web = applyNpcToNpcDelta(web, g, honoreeId, { affection: P.guestAffection });
      web = applyNpcToNpcDelta(web, honoreeId, g, { affection: P.guestAffection / 2 });
    }
    const noShows = (c.acceptedIds || []).filter(a => a !== honoreeId && isBirthdayResident(gs.npcs[a]) && !attended.includes(a)).sort().slice(0, 3);
    for (const n of noShows) {
      web = applyNpcToNpcDelta(web, honoreeId, n, { affection: P.absentAffection * scale });
      next = addMemoryFact(next, { text: fillBirthdayText(P.noShowFact, { name: birthdayNpcName(gs.npcs[n]), honoree: name }), day: bday, importance: P.factImportance * 0.8, category: 'relationship' });
    }
    gs.npcs[honoreeId] = next;
    gs.world.castWeb = web;
    out.lines.push(fillBirthdayText((host === 'player' && !playerCame) ? P.lineSkipped : guestNames.length ? P.line : P.lineNoGuests, { name }));
  }
}

// --- The day rollover (D4/D5/D7 + Phases 2–6) --------------------------------

function deliverBirthdayTexts(gs, texts) {
  if (texts.length && typeof processNpcImMessages === 'function' && gs.world?.computer?.apps?.im) {
    processNpcImMessages(gs, texts);
  }
}

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
// NEW day. Order matters and is the narrative order: yesterday resolves (a
// party thrown counts as remembering; then the sting), then today is
// announced and celebrated, your own birthday is greeted, the heads-up for
// two days out goes out, and contacts text. Returns { lines, texts } — lines
// for the narration log (the UI wrapper logs them), texts already delivered
// into the IM threads via processNpcImMessages.
function processBirthdaysForDay(gs, day) {
  const out = { lines: [], texts: [] };
  if (!gs?.player || !gs.npcs || !day) return out;
  const T = BIRTHDAY_TUNING;
  const rec = ensurePlayerBirthdays(gs.player);
  const ids = birthdayResidentIds(gs);

  // 0. Phase 5 — yesterday's birthday parties resolve FIRST: a party thrown
  // for someone is remembering them, so the sting below must see its mark.
  if (day > 1) resolveBirthdayParties(gs, day, out);

  // 1. D7 — yesterday's birthdays resolve.
  if (day > 1) {
    for (const id of ids) {
      const npc = gs.npcs[id];
      if (!isBirthdayOn(npc, day - 1)) continue;
      const mark = birthdayMark(gs, id, getYear(day - 1), true);
      if (mark.resolved) continue;
      mark.resolved = true;
      if (mark.wished || mark.gifted || mark.partied) continue;
      if (!rec.known[id]) continue;
      if ((npc.relPlayer?.affection || 0) < T.expectAffection) continue;
      mark.forgot = true;
      const name = birthdayNpcName(npc);
      const F = T.forgot;
      // Phase 3 (D14): it stings more for someone whose birthday matters to them.
      const scale = birthdayImportanceScale(npc);
      // currentDay undefined: a sting at midnight is not an interaction, so
      // lastInteractionDay must not move.
      let next = applyRelDelta(npc, { affection: F.affection * scale, tension: F.tension * scale }, undefined);
      next = nudgeNpcMood(next, F.mood * scale);
      next = addMemoryFact(next, { text: fillBirthdayText(T.forgotFact, { name }), day: day - 1, importance: F.factImportance, category: 'relationship' });
      gs.npcs[id] = next;
      // ...and someone who cares a lot tells the housemates they are close to.
      const told = birthdayGossip(gs, id, ids, day);
      out.lines.push(fillBirthdayText(T.forgotLine, { name }) + (told ? T.importance.gossipLine : ''));
    }
  }

  // 2. D5 — today's birthdays: the house knows, and so do you. Phase 4: and
  // the house celebrates.
  for (const id of ids) {
    const npc = gs.npcs[id];
    if (!isBirthdayOn(npc, day)) continue;
    learnBirthday(gs, id, day);
    birthdayMark(gs, id, getYear(day), true);
    gs.npcs[id] = nudgeNpcMood(npc, T.dayOfMood);
    out.lines.push(fillBirthdayText(T.dayOfLine, { name: birthdayNpcName(npc) }) + (rec.everWished ? '' : T.dayOfHint));
    celebrateBirthday(gs, id, day, ids, out);
  }

  // 2b. Phase 2 — your own birthday.
  processPlayerBirthday(gs, day, ids, out);

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

  // 3b. Phase 6 — a contact's birthday: fond enough (or Del, who always does)
  // and they text you the day itself. No sting, no tip-off, no celebration.
  for (const id of Object.keys(gs.npcs).sort()) {
    const npc = gs.npcs[id];
    if (!isBirthdayContact(npc) || !isBirthdayOn(npc, day)) continue;
    const mark = birthdayMark(gs, id, getYear(day), true);
    if (mark.headsUp) continue;
    const isDel = typeof CONTRACTOR_ID !== 'undefined' && id === CONTRACTOR_ID;
    if (!isDel && (npc.relPlayer?.affection || 0) < T.contacts.textAffection) continue;
    const text = isDel
      ? T.contacts.contractorLines[hashStr(`${id}|${day}`) % T.contacts.contractorLines.length]
      : pickBirthdayLine(T.contacts.lines, npc, day, `${id}>self`);
    if (!text) continue;
    mark.headsUp = true;
    learnBirthday(gs, id, day);
    out.texts.push({ npcId: id, text, aboutId: id });
  }
  deliverBirthdayTexts(gs, out.texts);
  return out;
}

// ===== /SECTION: BIRTHDAYS =====
