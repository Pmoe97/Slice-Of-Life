// ===== SECTION: PREGNANCY (Intimacy & Voyeurism Phase 18, D14/D16) =========
// The conception / term / birth lifecycle and the baby presence.
//
// `world.pregnancies` is the lifecycle store — an array of
//   { parents: [ids], conceivedDay, dueDay, visibleFromDay, birthDay, announced }
// The ONLY door in is a COMPLETED qualifying act: the act's own willingness
// gate has already proved both parties willing (invariant 1 sits upstream —
// this phase adds no door, it reads the footprint of acts that already
// happened), and the outcome is DETERMINISTIC (D15: data decides, prose
// narrates; no LLM call decides a conception). The D16 "trying" flag —
// relationship.trying for an NPC couple, player.flags._tryingWith for the
// player — buys the deliberate per-act chance; every other act runs on the
// base unprotected chance. Seeded rng only (never bare Math.random): each
// roll is keyed on (save seed, pair, day, absolute minutes), so a replayed
// save reproduces the exact same conception decisions.
//
// After birth the BABY PRESENCE is a separate stamp — npc.flags._baby /
// player.flags._baby — written ONCE by the birth pass (the single writer),
// so the "who is pregnant right now" read stays a pure query over
// world.pregnancies while the post-birth presence lives where the mood /
// schedule / conversation systems already look. No v1 parenting sim (D16):
// the presence is a daily mood note, a sleep-deprived energy cost on the
// player, an offscreen "stayed in with the baby" event, and pinned memory
// facts on both parents (the conversation fuel).
//
// Load order: config.js → ... → relationships.js → pregnancy.js → codex.js.
// It reads sim.js's seededRng, npc.js's addMemoryFact / applyMoodDelta and
// relationships.js's getRelationship — all loaded before it.

// --- Pure readers ----------------------------------------------------------
// All reads take gameState and return plain data; none of them write.

// Every pregnancy (born or not) a given participant is part of. `player` is
// a legal participant id. PURE.
function pregnanciesForParent(gs, id) {
  if (!gs?.world?.pregnancies) return [];
  return gs.world.pregnancies.filter(p => (p.parents || []).includes(id));
}

// The pregnancy currently being carried — not yet born. Null for everyone
// else. PURE.
function activePregnancyFor(gs, id) {
  return pregnanciesForParent(gs, id).find(p => p.birthDay == null) || null;
}

// The active pregnancy whose bump has become visible (past visibleFromDay on
// the current game day). This is the read the scene reader, the physical
// describer and the prompt builders all use for the belly. PURE.
function visiblePregnancyFor(gs, id) {
  const day = gs?.meta?.clock?.day;
  if (typeof day !== 'number') return null;
  return pregnanciesForParent(gs, id).find(p =>
    p.birthDay == null && day >= (p.visibleFromDay ?? Infinity)) || null;
}

// A quick boolean form of the above — the most-called shape. PURE.
function pregnancyVisible(gs, id) {
  return !!visiblePregnancyFor(gs, id);
}

// The active pregnancy shared by a specific pair, or null. PURE.
function pregnancyForPair(gs, a, b) {
  return pregnanciesForParent(gs, a).find(p =>
    p.birthDay == null && (p.parents || []).includes(b)) || null;
}

// The post-birth baby presence. The parent's flags._baby was stamped once at
// birth (the birth pass is the one writer). PURE.
function hasBabyPresence(gs, id) {
  if (id === 'player') return !!(gs?.player?.flags?._baby);
  return !!(gs?.npcs?.[id]?.flags?._baby);
}

// A birth that has already happened, for a participant — the durable record
// behind a parent's _baby flag. PURE.
function bornPregnancyFor(gs, id) {
  return pregnanciesForParent(gs, id).find(p => p.birthDay != null) || null;
}

// --- Facts ---------------------------------------------------------------
// The canonical pregnancy/birth fact text + record — the SAME record shape
// Phase 14's infidelity writer uses (provenance/confidence/salience/
// emotionalTag), category 'pregnancy', importance significant → pinned, so
// the fact display window always carries it (the conversation fuel: an LLM
// that reads a pinned significant fact can naturally reference the baby).
// Deterministic: names are the parents in sorted-id order. PURE.
function pregnancyFactRecord(gs, parents, day) {
  const names = parents.map(id =>
    id === 'player' ? (gs?.player?.name || 'the player') : (gs?.npcs?.[id]?.bible?.name || 'Someone'));
  return {
    text: `${names[0]} and ${names[1]} are expecting a baby.`,
    day,
    importance: PREGNANCY.factImportance,
    category: PREGNANCY.factCategory,
    provenance: 'witnessed',
    confidence: 1.0,
    salience: 1.0,
    emotionalTag: PREGNANCY.factEmotionalTag,
  };
}

function birthFactRecord(gs, parents, day) {
  const names = parents.map(id =>
    id === 'player' ? (gs?.player?.name || 'the player') : (gs?.npcs?.[id]?.bible?.name || 'Someone'));
  return {
    text: `${names[0]} and ${names[1]} had a baby.`,
    day,
    importance: PREGNANCY.factImportance,
    category: PREGNANCY.factCategory,
    provenance: 'witnessed',
    confidence: 1.0,
    salience: 1.0,
    emotionalTag: PREGNANCY.factEmotionalTag,
  };
}

// --- The player's own body in the scene ------------------------------------
// The establishing-passage line for the PLAYER's pregnancy/baby — the same
// surface playerSelfLine serves, but the bump needs gameState (the lifecycle
// store lives on world). Returns null when there is nothing to say. PURE.
function pregnancySelfLine(gs) {
  if (!gs) return null;
  if (visiblePregnancyFor(gs, 'player')) {
    return "You're visibly pregnant — several months along, the bump leading the way.";
  }
  if (hasBabyPresence(gs, 'player')) {
    return "The baby is asleep in the next room. You haven't slept properly in days and you don't care.";
  }
  return null;
}

// --- Conception ------------------------------------------------------------
// The single conception door, called by every COMPLETED qualifying act. The
// act's own willingness gate already proved both parties willing — this is
// purely the chance roll + the record write. Returns the new pregnancy record
// (or null — no roll, or the roll missed). Deterministic given state.
//
// Guards: (1) the act must be a qualifying kind (PREGNANCY.qualifyingActs —
// full sex, not quickie/cuddle/shower); (2) neither participant may already
// be carrying an active pregnancy. The trying flag decides the odds:
// relationship.trying for an NPC pair, player.flags._tryingWith for the
// player's acts. MUTATES world.pregnancies on success only.
function maybeConceive(gs, a, b, act, opts = {}) {
  if (!gs || !gs.world || !gs.meta?.clock || !PREGNANCY.qualifyingActs.includes(act)) return null;
  if (activePregnancyFor(gs, a) || activePregnancyFor(gs, b)) return null;
  const day = gs.meta.clock.day;
  let trying = false;
  if (a === 'player' || b === 'player') {
    const npcId = a === 'player' ? b : a;
    trying = gs.player?.flags?._tryingWith === npcId;
  } else {
    const rec = getRelationship(gs, a, b, false);
    trying = !!(rec && rec.trying === true);
  }
  const chance = trying ? PREGNANCY.tryingChancePerAct : PREGNANCY.baseChancePerAct;
  const key = [a, b].sort().join('|');
  const minutes = gs.meta.clock.minutes ?? 0;
  // Seeded per (save, pair, day, absolute minute) — a replayed save rolls
  // identically; two different acts by the same pair always roll differently.
  const rng = seededRng(gs.meta.seed, `conceive|${key}|${day}|${minutes}`);
  if (rng() >= chance) return null;
  const parents = [a, b].sort();
  const p = {
    parents,
    conceivedDay: day,
    dueDay: day + PREGNANCY.termDays,
    visibleFromDay: day + PREGNANCY.visibleFromDay,
    birthDay: null,
    announced: false,
  };
  (gs.world.pregnancies || (gs.world.pregnancies = [])).push(p);
  return p;
}

// --- The day-rollover pass -------------------------------------------------
// One call per rollover. Three jobs, all deterministic:
//   1. Emergent trying — a committed couple with recent intimacy may start
//      trying (the D16 flag's NPC side), seeded per (pair, day).
//   2. Term progress — the visible-from-day reveal (the one-shot pinned
//      pregnancy fact — nobody knew before, the bump makes it public), and
//      the birth when dueDay arrives: narration line, the _baby stamps on
//      both parents (the ONE writer), and the birth fact on both parents.
//   3. The baby presence's daily cost on the parents (mood + player energy).
// Returns the narration lines for the CALLER (ui's rollover) to log — same
// contract as updateRelationshipsForDay. Idempotent per record: birthDay is
// the one-shot latch, `announced` the fact-write latch. MUTATES.
function processPregnanciesForDay(gs, day) {
  const narrations = [];
  const store = gs.world.pregnancies || (gs.world.pregnancies = []);

  // 1. Emergent trying.
  const relStore = gs.world.relationships || {};
  for (const [key, rec] of Object.entries(relStore)) {
    if (rec.status !== 'committed' || rec.trying) continue;
    const hadSex = (rec.history || []).some(h => h.kind === 'sex' || h.kind === 'first_sex');
    if (!hadSex) continue;
    if (typeof rec.lastIntimateDay !== 'number' || day - rec.lastIntimateDay > PREGNANCY.trying.recencyDays) continue;
    const rng = seededRng(gs.meta.seed, `trying|${key}|${day}`);
    if (rng() < PREGNANCY.trying.chancePerDay) {
      rec.trying = true;
      narrations.push(pickTryingLine(gs, key.split('|'), day));
    }
  }

  // The lifecycle pass (reveal → birth → presence) needs a pregnancy store;
  // without one there is nothing to advance and the trying pass above is all
  // today's work.
  if (store.length === 0) return narrations;

  // 2. Term progress + birth.
  for (const p of store) {
    if (!p.announced && day >= p.visibleFromDay) {
      p.announced = true;
      const fact = pregnancyFactRecord(gs, p.parents, p.conceivedDay);
      for (const pid of p.parents) {
        if (pid === 'player') continue;
        const npc = gs.npcs[pid];
        if (npc) gs.npcs[pid] = addMemoryFact(npc, fact);
      }
    }
    if (p.birthDay != null) continue;
    if (day < p.dueDay) continue;
    p.birthDay = day;
    narrations.push(pickBirthLine(gs, p, day));
    for (const pid of p.parents) {
      const other = p.parents.find(x => x !== pid);
      if (pid === 'player') {
        if (!gs.player) continue;
        gs.player.flags = { ...(gs.player.flags || {}), _baby: { otherParent: other, bornDay: day } };
      } else {
        const npc = gs.npcs[pid];
        if (!npc) continue;
        gs.npcs[pid] = { ...npc, flags: { ...(npc.flags || {}), _baby: { otherParent: other, bornDay: day } } };
      }
    }
    const bFact = birthFactRecord(gs, p.parents, day);
    for (const pid of p.parents) {
      if (pid === 'player') continue;
      const npc = gs.npcs[pid];
      if (npc) gs.npcs[pid] = addMemoryFact(npc, bFact);
    }
  }

  // 3. The presence's daily cost.
  for (const p of store) {
    if (p.birthDay == null) continue;
    for (const pid of p.parents) {
      if (pid === 'player') {
        if (!gs.player) continue;
        pushMoodImpulse(gs.player, PREGNANCY.baby.playerMoodBoost, day);
        gs.player.energy = Math.max(0, (gs.player.energy ?? 0) - PREGNANCY.baby.playerEnergyCost);
      } else {
        const npc = gs.npcs[pid];
        if (!npc || !npc.flags?._baby) continue;
        gs.npcs[pid] = applyMoodDelta(npc, PREGNANCY.baby.dailyMoodBoost, 'new baby');
      }
    }
  }

  return narrations;
}

// Deterministic prose pickers — the PEEK_PROSE seeded pattern (pool, day,
// pair). PURE.
function pickTryingLine(gs, parents, day) {
  const names = parents.map(id => gs?.npcs?.[id]?.bible?.name || 'Someone');
  const pool = PREGNANCY.tryingLines;
  const rng = seededRng(gs.meta.seed, `tryingline|${parents.sort().join('|')}|${day}`);
  return pool[Math.floor(rng() * pool.length)].replace('{name}', names[0]).replace('{other}', names[1]);
}

function pickBirthLine(gs, p, day) {
  const names = p.parents.map(id =>
    id === 'player' ? (gs?.player?.name || 'you') : (gs?.npcs?.[id]?.bible?.name || 'Someone'));
  const pool = PREGNANCY.birthLines;
  const rng = seededRng(gs.meta.seed, `birthline|${p.parents.join('|')}|${day}`);
  return pool[Math.floor(rng() * pool.length)].replace('{name}', names[0]).replace('{other}', names[1]);
}
