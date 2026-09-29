// ===== SECTION: AGING =====
// Everyone gets older, slowly (aging-plan.md; the user's R9: "a slow process,
// not an instant, drastic change to any one descriptor field… a well-paced
// gradual change").
//
//   - THE NUMBER (A1): on the birthday rollover, once per birthday year, every
//     NPC's bible.age — and the player's appearance.age — goes up by one. The
//     guard is a per-record `agedYear`, so a reload never ages anyone twice.
//     Species do not change the calendar: an elf's birthday still comes every
//     year and the number still moves by one (A9) — what a long-lived species
//     slows is the VISIBLE ladder below (visible age = age x species pace).
//   - THE LOOK (A2/A3/A5): a short, per-person ladder of visible steps — the
//     first grey strands, laugh lines, weathered skin, a slight stoop — with
//     onset ages DERIVED from the person's seed (R5), never stored. At most ONE
//     step lands per birthday, and only once the visible age has crossed that
//     step's onset; several due steps queue across later birthdays. A step
//     writes the bible's physical fields (authoritative), appends to
//     bible.agingLog (debuggable, and what the mirror beat reads) and bumps
//     bible.appearanceEpoch.
//   - THE PORTRAITS (A4): the epoch folds into the image identity tokens ONLY
//     when > 0 (appearanceEpochToken, read by image.js), so every key — and the
//     whole existing cache — is byte-identical until a real step lands. The seed
//     never changes, so a repainted portrait is the same person, older.
//   - THE PLAYER (A8): ages too; the appearance drift has a Settings toggle
//     (playerAging, default on). The number always moves.
//   - MILESTONES (A6): 21 and every tenth birthday put a note in the prompt for
//     a few days, and feed birthday importance (birthdays.js reads bible.age).
//   - AUTHORED LOOKS (A7): an authored descriptor ages along the same ladder
//     (grey comes for everyone); bible.agingProfile can pin the pace or disable
//     steps: { disabled: true } | { disable: [stepId], onsets: { stepId: age } }.
//
// Pure domain logic, no DOM, no model calls. AGING_TUNING (config.js) owns every
// number; processBirthdaysForDay (birthdays.js) calls processAgingForDay first.

// --- Readers ------------------------------------------------------------------

// The record that carries age + physical: an NPC's bible, or the player's appearance.
function agingRecord(gs, id) {
  if (id === 'player') return gs?.player?.appearance || null;
  return gs?.npcs?.[id]?.bible || null;
}

function agingPace(rec) {
  const p = AGING_TUNING.speciesPace[rec?.species || 'human'];
  return (typeof p === 'number' && p > 0) ? p : 1;
}

// How old they LOOK for the ladder's purposes.
function agingVisibleAge(rec) {
  return (Number(rec?.age) || 0) * agingPace(rec);
}

function agingSeedBase(gs, id) {
  if (id === 'player') {
    const p = gs?.player || {};
    return hashStr(`${gs?.meta?.seed ?? ''}|${p.name || ''}|${p.surname || ''}|aging`);
  }
  const raw = gs?.npcs?.[id]?.bible?.genSeed;
  return (typeof raw === 'number' && isFinite(raw)) ? raw : hashStr(String(raw ?? id));
}

// The count of applied visible steps (0 for everyone until a step lands).
function appearanceEpoch(rec) {
  const e = Number(rec && rec.appearanceEpoch);
  return e > 0 ? Math.floor(e) : 0;
}

// What image.js folds into an identity key: '' at epoch 0 (so every existing
// key is byte-identical), `e<N>` after. `who` is an NPC record or the player.
function appearanceEpochToken(who, isPlayer) {
  const e = appearanceEpoch(isPlayer ? who?.appearance : who?.bible);
  return e > 0 ? `e${e}` : '';
}

// --- The derived profile (A2) -----------------------------------------------------

// { paceMul, steps: [{ ladder, idx, id, onset, text, field, skipIf }] } — every
// step this person will ever take, in ladder order. Every random draw is taken
// whether or not the step is kept, so one step's `chance` never shifts another's.
function agingProfile(rec, seedBase) {
  const T = AGING_TUNING;
  const override = (rec && typeof rec.agingProfile === 'object' && rec.agingProfile) || {};
  if (override.disabled === true) return { paceMul: 1, steps: [] };
  const rng = mulberry32(((seedBase >>> 0) + T.seedSalt) >>> 0);
  const paceMul = 1 + (rng() * 2 - 1) * T.paceJitter;
  const disabled = new Set(Array.isArray(override.disable) ? override.disable : []);
  const steps = [];
  for (const [ladder, def] of Object.entries(T.ladders)) {
    let prev = -Infinity;
    def.steps.forEach((step, idx) => {
      const r1 = rng();
      const r2 = rng();
      if (disabled.has(step.id)) return;
      if (step.chance !== undefined && r2 >= step.chance) return;
      let onset = (step.mean + (r1 * 2 - 1) * step.spread) * paceMul;
      if (override.onsets && typeof override.onsets[step.id] === 'number') onset = override.onsets[step.id];
      onset = Math.max(onset, prev + T.minGapYears);   // a ladder never bunches
      prev = onset;
      steps.push({ ladder, idx, id: step.id, onset, text: step.text, field: def.field, skipIf: def.skipIf || null });
    });
  }
  return { paceMul, steps };
}

// --- Physical access ----------------------------------------------------------------

function agingGet(physical, field) {
  if (!physical) return undefined;
  if (field === 'features') return physical.distinguishingFeatures;
  return field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), physical);
}

function agingSet(physical, field, value) {
  if (field === 'features') { physical.distinguishingFeatures = value; return; }
  const segs = field.split('.');
  let node = physical;
  for (const s of segs.slice(0, -1)) node = (node[s] = node[s] || {});
  node[segs[segs.length - 1]] = value;
}

// Steps that would change nothing are consumed silently (they never spend a
// birthday): the text is already there, the hair is already grey or dyed, the
// field doesn't exist on an authored partial.
function agingStepIsNoop(rec, step) {
  const physical = rec.physical;
  if (!physical || typeof physical !== 'object') return true;
  if (step.field === 'features') {
    // Already at (or past) this rung — an authored "laugh lines" means the faint
    // rung is behind them — so the step would add nothing.
    const list = Array.isArray(physical.distinguishingFeatures) ? physical.distinguishingFeatures : [];
    const rungs = AGING_TUNING.ladders[step.ladder].steps.map(s => s.text);
    return rungs.some((t, i) => i >= step.idx && list.includes(t));
  }
  const cur = agingGet(physical, step.field);
  if (step.field === 'hair.color') {
    if (!cur) return true;
    const low = String(cur).toLowerCase();
    return (step.skipIf || []).some(s => low.includes(s));
  }
  if (typeof cur === 'string' && step.skipIf && step.skipIf.some(s => cur.toLowerCase().includes(s))) return true;
  if (typeof cur === 'string' && cur === step.text) return true;
  return false;
}

// The next step this person is due for, or null. Consumes no-op steps as it goes
// (recorded in rec.agingSkipped so a ladder can move on past them).
function agingNextStep(rec, profile) {
  const done = new Set([...(rec.agingLog || []).map(e => e.step), ...(rec.agingSkipped || [])]);
  const va = agingVisibleAge(rec);
  for (let guard = 0; guard < 32; guard++) {
    let best = null;
    for (const step of profile.steps) {
      if (done.has(step.id)) continue;
      const prevInLadder = profile.steps.filter(s => s.ladder === step.ladder && s.idx < step.idx);
      if (prevInLadder.some(s => !done.has(s.id))) continue;   // the ladder is climbed in order
      if (va < step.onset) continue;
      if (!best || step.onset < best.onset) best = step;
    }
    if (!best) return null;
    if (agingStepIsNoop(rec, best)) {
      (rec.agingSkipped || (rec.agingSkipped = [])).push(best.id);
      done.add(best.id);
      continue;
    }
    return best;
  }
  return null;
}

// Applies ONE step to the record. Returns the log entry.
function agingApplyStep(rec, step, day) {
  const physical = rec.physical;
  const before = agingGet(physical, step.field);
  let after;
  if (step.field === 'features') {
    // Replace only what AGING itself put there (the previous rung of this ladder
    // in the log), never an authored feature.
    const owned = (rec.agingLog || []).filter(e => e.field === 'features' && AGING_TUNING.ladders[step.ladder].steps.some(s => s.id === e.step)).map(e => e.to[e.to.length - 1]);
    const list = (Array.isArray(physical.distinguishingFeatures) ? physical.distinguishingFeatures : []).filter(f => !owned.includes(f));
    list.push(step.text);
    after = list;
    agingSet(physical, step.field, list);
  } else if (step.field === 'hair.color') {
    if (!rec.agingBase) rec.agingBase = {};
    if (!rec.agingBase.hairColor) rec.agingBase.hairColor = String(before);
    after = step.text.replace('{base}', rec.agingBase.hairColor);
    agingSet(physical, step.field, after);
  } else {
    after = step.text;
    agingSet(physical, step.field, after);
  }
  const entry = { age: rec.age, step: step.id, field: step.field, from: Array.isArray(before) ? before.slice() : before, to: Array.isArray(after) ? after.slice() : after, day };
  (rec.agingLog || (rec.agingLog = [])).push(entry);
  rec.appearanceEpoch = appearanceEpoch(rec) + 1;
  return entry;
}

// --- The birthday ---------------------------------------------------------------------

// One person's birthday: the number, then at most one step. `looks` false skips
// the step (the player with the Settings toggle off). Returns { age, entry|null }.
function agingBirthday(rec, seedBase, day, looks) {
  // The age they started at, kept for the player's fallback image key (image.js
  // playerIdentityToken) so a birthday with no visible step never repaints them.
  if (!rec.agingBase) rec.agingBase = {};
  if (rec.agingBase.startAge === undefined) rec.agingBase.startAge = Number(rec.age) || 0;
  rec.age = (Number(rec.age) || 0) + 1;
  let entry = null;
  if (looks !== false) {
    const step = agingNextStep(rec, agingProfile(rec, seedBase));
    if (step) entry = agingApplyStep(rec, step, day);
  }
  return { age: rec.age, entry };
}

function isMilestoneAge(age) {
  const T = AGING_TUNING;
  return Number.isFinite(age) && age > 0 && ((T.milestoneEvery > 0 && age % T.milestoneEvery === 0) || T.milestoneAges.includes(age));
}

// Runs from processBirthdaysForDay, first, with the NEW day. Ages everyone whose
// birthday it is (once per birthday year). Returns { lines, playerAge, playerLines }:
// `playerAge` is set when it is the player's birthday, `playerLines` are the mirror
// beats for a step that landed on them. NPC steps make no narration — the player
// notices on their own, or doesn't (R9).
function processAgingForDay(gs, day) {
  const out = { lines: [], playerAge: null, playerLines: [], aged: [] };
  if (!gs || !day || day <= 1) return out;
  const year = getYear(day);
  for (const id of Object.keys(gs.npcs || {}).sort()) {
    const npc = gs.npcs[id];
    const rec = npc?.bible;
    if (!rec || !Number.isFinite(Number(rec.age)) || rec.agedYear === year) continue;
    if (!isBirthdayOn(npc, day)) continue;
    rec.agedYear = year;
    const res = agingBirthday(rec, agingSeedBase(gs, id), day, true);
    out.aged.push({ id, age: res.age, step: res.entry ? res.entry.step : null });
  }
  const app = gs.player?.appearance;
  if (app && Number.isFinite(Number(app.age)) && app.agedYear !== year && typeof isPlayerBirthdayOn === 'function' && isPlayerBirthdayOn(gs, day)) {
    app.agedYear = year;
    const looks = typeof isPlayerAgingOn === 'function' ? isPlayerAgingOn() : true;
    const res = agingBirthday(app, agingSeedBase(gs, 'player'), day, looks);
    out.playerAge = res.age;
    if (res.entry) out.playerLines.push(AGING_TUNING.mirrorLines[res.entry.step] || AGING_TUNING.mirrorLines.default);
  }
  return out;
}

// --- Prompt (A6) ----------------------------------------------------------------------

// Days since a person's birthday (0 on the day) for a day-of-year birthday.
function agingDaysSince(bdayDoy, day) {
  const n = CALENDAR.daysPerYear;
  return (birthdayDayOfYear(day) - bdayDoy + n) % n;
}

// Milestone lines for one NPC's prompt: their own birthday (for a few days after
// it) and, if they know it, the player's.
function agingMilestonePromptLines(gs, npcId) {
  const T = AGING_TUNING;
  const day = gs?.meta?.clock?.day;
  const npc = gs?.npcs?.[npcId];
  const lines = [];
  if (!day || !npc) return lines;
  const year = getYear(day);
  if (typeof isBirthdayPerson === 'function' && isBirthdayPerson(npc) && isMilestoneAge(Number(npc.bible?.age))
    && npc.bible?.agedYear === year && agingDaysSince(npcBirthdayDayOfYear(npc), day) <= T.milestoneDays) {
    lines.push(T.milestonePrompt.replace('{name}', npc.bible?.name || 'They').replace('{age}', String(npc.bible.age)));
  }
  const app = gs.player?.appearance;
  if (app && isMilestoneAge(Number(app.age)) && app.agedYear === year
    && typeof residentKnowsPlayerBirthday === 'function' && residentKnowsPlayerBirthday(gs, npcId)
    && agingDaysSince(playerBirthdayDayOfYear(gs), day) <= T.milestoneDays) {
    lines.push(T.milestonePromptPlayer.replace('{name}', npc.bible?.name || 'They').replace('{age}', String(app.age)));
  }
  return lines;
}

// ===== /SECTION: AGING =====
