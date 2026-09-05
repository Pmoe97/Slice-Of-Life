// ===== SECTION: NIGHT SCENE CONTROLLER (night-scene-sleeping-npc-plan Phase 3b) =====
// The Living Tableau's DECIDER half (D15). Everything that answers "what is
// on screen, and what does a tap mean" lives here; render.nightscene.js paints
// what this file hands it and decides nothing. That is peek.js's split — the
// same one boundary.js/actionwindow.js already keep — with the file roles the
// way spritestudio.js / render.spritestudio.js arrange them, because the
// painter is far too big to bolt onto actionwindow.js's "reusable outcome
// pane" without swallowing that file's stated purpose.
//
// THE MECHANICS ARE NOT IN THIS FILE. Every meter delta, every wake check,
// every validity question and every line of prose is already decided by
// boundary.js's pure resolvers (nightPalette / nightActionValid /
// nightStepAction / applyNightStep / composeNightLine). This file composes an
// action id, hands it over, and paints the answer. If a chance roll or a
// delta calculation ever appears below, it is in the wrong file.
//
// Three rules this file exists to keep:
//   1. A TAP RESOLVES INSTANTLY (design invariant 3). nightFire is fully
//      synchronous end to end — resolve, commit, compose the line, repaint,
//      THEN ask for the picture. There is no `await` anywhere in this file and
//      Phase 4's imagery did not add one (it chains .then): the frame arrives
//      when it arrives, behind the shimmer. Two harnesses fail if that changes
//      (verify-night-p3.js section 9, verify-night-p4.js section 4), which is
//      deliberate — the answer to "can I just await this one" is no.
//   2. NO LLM CALL, EVER (design invariant 2, strengthened by D30). The line
//      comes from composeNightLine's authored fragment pools. A phrasing
//      failure degrades to the fallback while the mechanics stand.
//   3. THE TRAY NEVER OFFERS AN IMPOSSIBLE ACTION (D31). Everything painted
//      comes out of nightPalette, which has already filtered by sex-from-data
//      (D35), pose and covers (D34), outstanding evidence and open pose-graph
//      edges (D36). The selection repair below is what keeps that true ACROSS
//      a state change — a pose move can pull the selected part out of reach,
//      and the repair moves the player somewhere real rather than leaving a
//      dead chip armed.

// --- Module state ----------------------------------------------------------
// One session at a time, and none of it persists. What persists is
// npc.flags._nightScene, which boundary.js owns; this is only the cursor over
// it — which tab is open, which chips are lit, what the last action returned.
// D37's frames hang off this object (Phase 4) for the same reason: a session
// cannot be saved mid-way (sweepStaleNightScenes closes any that survives a
// reload), so nothing here has a reason to outlive it — and nightCloseOverlay
// revokes their object URLs on the way out.
let nightSession = null;

function nightSceneActive() {
  return !!(nightSession && !nightSession.ended);
}

// --- Pure: the selection cursor --------------------------------------------

// A region instance's identity. Not just `regionId`: D35 attaches one region
// per entry in HER genitals array, so a futanari carries two `pussy` tabs and
// a character with two cocks carries two `cock` tabs. The instance index is
// what tells them apart, and the side slot of the action id is what carries
// the same distinction into the resolver (`g1`..`g4`).
function nightRegionKey(regionId, instance) {
  return `${regionId}#${instance || 0}`;
}

// Repairs a selection against the palette as it is RIGHT NOW, and is the one
// function standing between D31 and a stale cursor. Every axis falls back to
// something the palette actually offers, in the order the player would expect:
// the tab they are looking at wins, then the part, then the side, then the
// instrument. Returns null only when the palette is genuinely empty (she is
// curled up under the covers with nothing reachable — a real state, and one
// the Move tab exists to get out of).
//
// The side default is the LAST entry rather than the first, which is 'both'
// for a paired part (the artboard's own default) and the only entry for
// everything else. PURE.
function nightRepairSelection(palette, sel) {
  const s = sel || {};
  const regions = (palette && palette.regions) || [];
  if (!regions.length) return null;
  let region = regions.find(r => nightRegionKey(r.regionId, r.instance) === s.regionKey);
  // The tab is gone (a Cleanup tab empties when the last tag is cleared, a
  // Move tab when no edge is open). Follow the PART if it still exists
  // somewhere, so clearing the last evidence tag does not also throw away
  // where the player was working.
  if (!region) region = regions.find(r => r.parts.some(p => p.partId === s.partId)) || regions[0];
  const part = region.parts.find(p => p.partId === s.partId) || region.parts[0];
  const side = part.sides.indexOf(s.side) >= 0 ? s.side : part.sides[part.sides.length - 1];
  const row = part.instruments.find(r => r.instrumentId === s.instrumentId) || part.instruments[0];
  const paceId = (BOUNDARY.nightScene.pace[s.paceId] ? s.paceId : 'steady');
  return {
    regionKey: nightRegionKey(region.regionId, region.instance),
    partId: part.partId,
    side,
    instrumentId: row.instrumentId,
    paceId,
  };
}

// The region / part / instrument-row the repaired selection points at. Three
// tiny lookups rather than one fat "resolve everything" call, because the
// renderer wants them at three different depths. PURE.
function nightSelectedRegion(palette, sel) {
  if (!palette || !sel) return null;
  return (palette.regions || []).find(r => nightRegionKey(r.regionId, r.instance) === sel.regionKey) || null;
}

function nightSelectedPart(palette, sel) {
  const region = nightSelectedRegion(palette, sel);
  if (!region) return null;
  return region.parts.find(p => p.partId === sel.partId) || null;
}

// The motion row — D33's ordering is already ascending-intensity out of
// nightMotionsFor, and the row ORDER is information (leftmost is the safe
// approach, rightmost has to be earned), so this never re-sorts. PURE.
function nightMotionRow(palette, sel) {
  const part = nightSelectedPart(palette, sel);
  if (!part) return [];
  const row = part.instruments.find(r => r.instrumentId === sel.instrumentId);
  return row ? row.motions.slice() : [];
}

// --- Pure: what a chip says before it is pressed ---------------------------

// The forward-looking read behind the artboard's dashed motion chip ("Pinch is
// dashed because at heat 44 it would overshoot"). It runs the SAME code path
// the resolver runs — nightActionValid then nightHeatStep — rather than
// re-deriving the verdict, which is what stops the chip from ever lying about
// what the tap will do. It reads no rng and writes nothing, so it is free to
// call once per chip per render.
//
// This does not leak D28's preferences (those stay discovered by play, never
// shown): the verdict it reports is D27's window, which D33 already teaches
// through the row order. PURE.
function nightMotionPreview(gs, targetId, sel, motionId, prefTable) {
  const blank = { valid: false, verdict: 'invalid', soothe: false, overshoot: false, intensity: 0, gap: 0, actionId: null };
  if (!sel) return blank;
  const actionId = composeNightActionId(sel.partId, sel.side, sel.instrumentId, motionId, sel.paceId);
  const v = nightActionValid(gs, targetId, actionId);
  if (!v.ok) return { ...blank, actionId };
  const target = gs.npcs[targetId];
  const record = target.flags._nightScene;
  const prefs = nightPreferenceMults(prefTable || nightPreferences(target), sel.partId, motionId);
  const soothe = !!(v.part.soothing && v.motion.calming && sel.paceId === 'gentle');
  const heat = nightHeatStep(record, v.part, v.motion, v.pace, v.instrument, soothe, prefs);
  return {
    valid: true, actionId, soothe,
    verdict: heat.verdict,
    overshoot: heat.verdict === 'overshoot',
    intensity: heat.intensity,
    gap: heat.gap,
  };
}

// --- Pure: the two bars (D26, amended by D38) ------------------------------

// Wakefulness is the current, drainable number and Stirring is a permanent
// minimum drawn as a deeper band INSIDE the same track — never a second bar.
// Heat is its own bar, is never coloured or worded as a danger, fills on
// `heat mod climaxEvery` and carries one pip per climax reached.
//
// The willing/hostile tick (D29) is drawn only inside the FIRST cycle: past a
// climax the threshold reads absolute heat and is therefore already met, so a
// tick there would mark a line that can no longer be crossed. PURE.
function nightBarModel(gs, targetId) {
  const cfg = BOUNDARY.nightScene;
  const npc = gs && gs.npcs ? gs.npcs[targetId] : null;
  const rec = npc && npc.flags && npc.flags._nightScene;
  if (!rec) return null;
  const wakeMax = cfg.thresholds.detectionWake;
  const cycle = cfg.thresholds.climaxEvery;
  const pct = (v, max) => Math.max(0, Math.min(100, (v / max) * 100));
  const cycleHeat = (((rec.heat || 0) % cycle) + cycle) % cycle;
  const climaxCount = rec.climaxCount || 0;
  const threshold = nightWillingThreshold(gs, npc);
  return {
    wake: Math.round(rec.detection), stir: Math.round(rec.floor), heat: Math.round(rec.heat),
    wakePct: pct(rec.detection, wakeMax),
    stirPct: pct(rec.floor, wakeMax),
    heatPct: pct(cycleHeat, cycle),
    climaxCount,
    threshold: Math.round(threshold),
    thresholdPct: (climaxCount === 0 && threshold < cycle) ? pct(threshold, cycle) : null,
  };
}

// --- Pure: labels ----------------------------------------------------------

// D33's two-label rule, applied at the one place outside prose that needs the
// standalone form: the phone's current-action summary line, where the region
// tab is off screen and "Head" alone would be ambiguous. nightTargetPhrase
// (boundary.js) already owns the standalone + side splice, so this only joins
// the slots. PURE.
// Phase 6: `target` is optional and only decides the REGISTER -- a caller that
// has the sleeper hands it over, and one that does not gets the authored
// feminine. It is registered HERE rather than by the view model because
// nightTargetPhrase can emit the `{o}` object-case token (her_body's
// standalone label is nothing but that token), and a token must never leave
// the function that can produce one.
function nightSelectionLine(gs, sel, target) {
  const cfg = BOUNDARY.nightScene;
  if (!sel) return '';
  const part = cfg.parts[sel.partId];
  if (!part) return '';
  const instrument = nightInstrumentDef(gs, sel.instrumentId);
  const bits = [
    nightTargetPhrase(part, sel.side),
    instrument ? instrument.label.toLowerCase() : '',
    (cfg.pace[sel.paceId] || {}).label,
  ].filter(Boolean);
  return nightRegister(nightUpperFirst(bits.join(' · ')), target);
}

// The same line for an action already TAKEN, so it can name the motion — this
// is what "Again" repeats, and the artboard's phone bar shows it above the
// receipt chips. PURE.
function nightLastActionLine(gs, result, target) {
  const cfg = BOUNDARY.nightScene;
  if (!result) return '';
  const part = cfg.parts[result.partId];
  const motion = cfg.motions[result.motionId];
  if (!part || !motion) return '';
  const instrument = nightInstrumentDef(gs, result.instrumentId);
  const bits = [
    nightTargetPhrase(part, result.side),
    instrument ? instrument.label.toLowerCase() : '',
    motion.label.toLowerCase(),
  ].filter(Boolean);
  return nightRegister(nightUpperFirst(bits.join(' · ')), target);
}

function nightUpperFirst(s) {
  return String(s || '').replace(/^./, c => c.toUpperCase());
}

// Where she is and what is over her (D34). The player cannot plan a route
// through the pose graph without being able to read the node they are on, and
// until Phase 4's frames land this line is the only place that state shows.
// PURE.
function nightStateLine(gs, targetId) {
  const cfg = BOUNDARY.nightScene;
  const rec = gs && gs.npcs && gs.npcs[targetId] && gs.npcs[targetId].flags
    ? gs.npcs[targetId].flags._nightScene : null;
  if (!rec) return '';
  const pose = (cfg.poses[rec.pose] || {}).label || '';
  const covers = (cfg.covers[rec.covers] || {}).label || '';
  return nightRegister([pose, covers].filter(Boolean).join(' · '), gs.npcs[targetId]);
}

// The receipt row: what the action that just resolved actually cost. Heat is
// omitted when the action carries none at all (every Move and every Cleanup),
// because "heat +0" on a move reads as a failure rather than as the rule D36
// states outright. PURE.
function nightDeltaChips(result) {
  if (!result) return [];
  const fmt = (v) => {
    const a = Math.abs(v);
    return (v < 0 ? '-' : '+') + (a < 1 && a > 0 ? a.toFixed(1) : String(Math.round(a)));
  };
  const out = [
    { key: 'wake', label: `wake ${fmt(result.wakeDelta)}`, tone: result.wakeDelta < 0 ? 'good' : 'risk' },
    { key: 'stir', label: `stir ${fmt(result.stirDelta)}`, tone: 'stir' },
  ];
  if (Math.abs(result.heatDelta) >= 0.05) {
    out.push({ key: 'heat', label: `heat ${fmt(result.heatDelta)}`, tone: result.heatDelta < 0 ? 'risk' : 'heat' });
  }
  return out;
}

const NIGHT_COUNT_WORDS = ['nothing', 'one', 'two', 'three', 'four', 'five'];

// "the mess", "the mess and her panties", "her shirt, the mess and her
// panties". Shared by the Leave confirmation (what you are ABOUT to leave)
// and by Phase 5's end summary (what you DID leave), so the two can never
// name the same evidence two different ways. PURE.
function nightListPhrase(labels) {
  const a = (labels || []).filter(Boolean);
  if (a.length === 0) return '';
  if (a.length === 1) return a[0];
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}

// D22: there is one voluntary exit and it has no name of its own, but it
// confirms when there is evidence outstanding, naming what is about to be
// left behind. An empty evidence array needs no confirmation at all — leaving
// clean is not a decision worth interrupting. PURE.
function nightLeaveConfirm(gs, targetId) {
  const cfg = BOUNDARY.nightScene;
  const rec = gs && gs.npcs && gs.npcs[targetId] && gs.npcs[targetId].flags
    ? gs.npcs[targetId].flags._nightScene : null;
  const tags = (rec && rec.evidence) || [];
  if (!tags.length) return { needed: false, count: 0, labels: [], text: '' };
  const labels = tags.map(t => cfg.evidenceLabels[t] || t);
  const word = NIGHT_COUNT_WORDS[labels.length] || String(labels.length);
  const listed = nightListPhrase(labels);
  return {
    needed: true, count: labels.length, labels,
    text: `You will leave ${word} thing${labels.length === 1 ? '' : 's'} behind: ${listed}.`,
  };
}

// The outstanding-evidence chips on the narration row. PURE.
function nightEvidenceChips(gs, targetId) {
  const cfg = BOUNDARY.nightScene;
  const rec = gs && gs.npcs && gs.npcs[targetId] && gs.npcs[targetId].flags
    ? gs.npcs[targetId].flags._nightScene : null;
  return ((rec && rec.evidence) || []).map(t => ({ tag: t, label: cfg.evidenceLabels[t] || t }));
}

// --- Pure: the end of a session (Phase 5) ---------------------------------

// The headings, one per resolution. 'abandon' is not an ending (the world
// pulled the rug) and says so.
const NIGHT_END_COPY = {
  exit:         'You slip out',
  wake_willing: 'She wakes',
  wake_hostile: 'She wakes',
  abandon:      'The moment passes',
};

// What the ending COST, read off applyNightSceneEnd's own return value rather
// than re-derived from the record — the end block must never report a
// consequence the consequence layer did not actually write. `res` is null only
// when the ending was already resolved (a double Leave, or an abandon), and
// every branch below degrades to the honest generic line rather than inventing
// a number. PURE.
function nightEndSummary(gs, s) {
  if (!s || !s.ended) return null;
  const cfg = BOUNDARY.nightScene;
  const outcome = s.endOutcome || 'abandon';
  const res = s.endResult || null;
  const rows = [];
  let note = '';

  if (outcome === 'exit') {
    const labels = ((res && res.tags) || []).map(t => cfg.evidenceLabels[t] || t);
    note = labels.length
      ? `You leave ${nightListPhrase(labels)} behind you.`
      : 'You leave nothing behind you.';
    rows.push(labels.length
      ? { key: 'evidence', label: `${labels.length} left behind`, tone: 'risk' }
      : { key: 'evidence', label: 'Nothing left behind', tone: 'good' });
  } else if (outcome === 'wake_willing') {
    // D6's earned retroactive consent. The prose is the reciprocate pool's,
    // picked once by the consequence layer and never re-rolled on a repaint.
    note = (res && res.prose) || 'She is awake, and what is in her face is not alarm.';
    rows.push({ key: 'wake', label: 'She wakes willing', tone: 'good' });
  } else if (outcome === 'wake_hostile') {
    note = (res && res.prose) || 'She is awake, and she knows exactly what woke her.';
    rows.push({ key: 'wake', label: 'Caught', tone: 'risk' });
    if (res && res.shaming && res.shaming.coldShoulderSeverity > 0) {
      rows.push({ key: 'cold', label: 'She has gone cold on you', tone: 'risk' });
    }
  } else {
    note = 'You are no longer with {o}.';
  }

  // D23's bank, paid out once. Shown only when it actually landed, so an
  // abandoned session cannot look like it earned something.
  const xp = (res && res.xpAwarded) || 0;
  if (xp > 0) rows.push({ key: 'xp', label: `Stealth +${xp.toFixed(1)} xp`, tone: 'good' });
  const climaxes = (res && res.climaxCount) || 0;
  if (climaxes > 0) {
    rows.push({ key: 'climax', label: climaxes === 1 ? 'She came' : `She came ${climaxes} times`, tone: 'heat' });
  }
  return { outcome, heading: NIGHT_END_COPY[outcome] || NIGHT_END_COPY.abandon, note, rows };
}

// Phase 6: the register, applied to the two composite blocks the view model
// cannot pass through one call. Everything above is authored in the feminine
// (config.js's `prose` header explains why) and nightRegister is idempotent,
// so these are safe over already-converted text — `res.prose` comes from
// pickBoundaryProse, a different system entirely, and passes through unharmed
// unless it was wrong about the target in the first place. PURE.
function nightRegisterConfirm(confirm, target) {
  if (!confirm) return confirm;
  return { ...confirm, text: nightRegister(confirm.text, target),
    labels: (confirm.labels || []).map(l => nightRegister(l, target)) };
}

function nightRegisterEnd(end, target) {
  if (!end) return end;
  return {
    ...end,
    heading: nightRegister(end.heading, target),
    note: nightRegister(end.note, target),
    rows: (end.rows || []).map(r => ({ ...r, label: nightRegister(r.label, target) })),
  };
}

// --- Pure: the frame's identity and the clock (Phase 4) --------------------

// The (state x action) axes of ONE frame (D18), with pace deliberately absent
// — gently and firmly squeezing the same breast is the same picture, and
// dropping pace is what keeps the key space affordable.
//
// The state half is the state the action LANDS IN, not the one it started
// from: for a Move that is the whole point (you want to see her new pose), and
// for everything else the two are identical because only a Move writes
// pose/covers. That makes this one function serve both callers — the frame for
// an action that just resolved (the record already carries the new state) and
// the speculative frame for a chip not yet pressed (the edge's own `to`).
// PURE.
function nightFrameAxes(record, partId, side, instrumentId, motionId) {
  const motion = BOUNDARY.nightScene.motions[motionId];
  if (!record || !motion || !BOUNDARY.nightScene.parts[partId]) return null;
  // Phase 7: the clothing axis rides the key too, for exactly the reason pose
  // and covers do — the prompt names it, so a change must not be served the
  // old pixels. Like them it is the state the action LANDS IN.
  const clothing = { ...(record.clothing || {}) };
  const part = BOUNDARY.nightScene.parts[partId];
  if (motion.garment && Object.prototype.hasOwnProperty.call(clothing, motion.garment.id)) {
    clothing[motion.garment.id] = motion.garment.to;
  }
  if (part && part.restores && Object.prototype.hasOwnProperty.call(clothing, part.restores)) {
    clothing[part.restores] = 'on';
  }
  return {
    pose: motion.pose ? motion.pose.to : record.pose,
    covers: motion.covers ? motion.covers.to : record.covers,
    clothing, clothingToken: nightClothingToken(clothing),
    partId, side, instrumentId, motionId,
  };
}

// The signature the speculative fan-out is keyed on (D20): a new part, side or
// instrument is a new set of motion chips and therefore a new set of frames to
// warm, while a pace change is none of those and must not re-fire the fan-out.
// PURE.
function nightPrefetchSignature(sel) {
  if (!sel) return '';
  return `${sel.regionKey}|${sel.partId}|${sel.side}|${sel.instrumentId}`;
}

// D24 made time a real cost, so the scene has to SHOW it passing. Game-minutes
// since the session opened, from the record's own open stamp — at the
// nightscene scale (1) a game-minute is a real minute, so this reads as a
// stopwatch. `openedMinute` is stored as clock.minutes x 100 (openNightScene),
// hence the divide. PURE.
function nightElapsedMinutes(gs, record) {
  const clock = gs && gs.meta && gs.meta.clock;
  if (!clock || !record) return 0;
  const opened = (record.openedMinute || 0) / 100;
  return Math.max(0, (clock.day - record.openedDay) * 1440 + (clock.minutes - opened));
}

// m:ss, because a session's whole span is minutes and a bare "3" would read as
// a meter rather than a clock. PURE.
function nightElapsedLabel(minutes) {
  const total = Math.max(0, Math.floor(minutes * 60));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

// Everything the painter needs, in one pure call. render.nightscene.js reads
// this and nothing else off the game state — which is what keeps the painter
// from growing a decision. PURE.
function nightViewModel(gs, s) {
  if (!gs || !s) return null;
  const targetId = s.targetId;
  const target = gs.npcs ? gs.npcs[targetId] : null;
  const record = target && target.flags ? target.flags._nightScene : null;
  if (!record) return null;
  const palette = nightPalette(gs, targetId);
  const sel = nightRepairSelection(palette, s.sel);
  const prefTable = nightPreferences(target);
  // Phase 6: the register. Every authored night-scene string is written in
  // the feminine (config.js's `prose` header) and becomes the target's own
  // here, at the one place the controller hands text to the painter.
  // nightRegister is idempotent, so a line composeNightLine already converted
  // passes through untouched and the painter never has to know the rule
  // exists. D28's learned marker rides the same trip.
  const reg = (t) => nightRegister(t, target);
  const known = nightKnownFor(gs, targetId);
  const motions = sel ? nightMotionRow(palette, sel).map(id => ({
    motionId: id,
    label: reg(BOUNDARY.nightScene.motions[id].label),
    known: known.motions[id] || null,
    ...nightMotionPreview(gs, targetId, sel, id, prefTable),
  })) : [];
  return {
    targetId,
    // `npc.bible.name` is the one name an NPC has in this codebase — there is
    // no `.name` on the folder itself, which is why every caller in
    // boundary.js / asks.js / actionwindow.js reads it the same way.
    name: (target.bible && target.bible.name) || targetId,
    record,
    palette,
    // Phase 7: the regions that EXIST on her but have nothing reachable right
    // now, with the next thing in the way named. They are not in `palette.
    // regions`, so nothing that walks the tray can land on one — this is a
    // hint, never a control.
    blocked: (palette.blockedRegions || []).map(b => ({ ...b, text: reg(b.text) })),
    sel,
    motions,
    bars: nightBarModel(gs, targetId),
    stateLine: nightStateLine(gs, targetId),
    evidence: nightEvidenceChips(gs, targetId),
    selectionLine: nightSelectionLine(gs, sel, target),
    lastLine: s.lastResult ? nightLastActionLine(gs, s.lastResult, target) : '',
    lastMotionId: s.lastResult ? s.lastResult.motionId : null,
    deltas: nightDeltaChips(s.lastResult),
    narration: reg(s.narration || ''),
    confirm: s.confirming ? nightRegisterConfirm(nightLeaveConfirm(gs, targetId), target) : null,
    trayOpen: !!s.trayOpen,
    ended: !!s.ended,
    endOutcome: s.endOutcome || null,
    end: nightRegisterEnd(nightEndSummary(gs, s), target),
    // D14/D38's positive beat. It marks the ONE repaint that follows the
    // action that crossed a hundred and never ends the session — nightFire
    // clears it on the next action, so the badge cannot stick.
    // Phase 6: the shadow layer's own receipt, on the narration row rather
    // than in the footer — the footer names YOUR last action and offers to
    // repeat it, and a noise in the hall is neither.
    cue: s.cueResult ? { deltas: nightDeltaChips(s.cueResult), partId: s.cueResult.partId } : null,
    // Phase 6: the painter's own authored strings, registered. The painter
    // has no target to register against and must not learn to — this is the
    // same rule as the labels above, applied to the three lines the view
    // layer used to hold as feminine literals.
    copy: Object.fromEntries(Object.entries(BOUNDARY.nightScene.prose.ui)
      .map(([k, v]) => [k, reg(v)])),
    // D28's quiet marker. The glyphs are config so the painter stays dumb;
    // `known` on a part (palette) or a motion (above) is null until the
    // player has actually worked it out, and null forever for a neutral one.
    knownMarks: BOUNDARY.nightScene.prefs.knownMark,
    climax: !!s.climaxBeat,
    climaxCount: record.climaxCount || 0,
    canRepeat: !!(s.lastResult && nightActionValid(gs, targetId, s.lastResult.actionId).ok),
    // --- Phase 4 ---------------------------------------------------------
    // The frame the tableau is showing, if it has arrived. `generating` is
    // what raises the shimmer: the tap already resolved (invariant 3), this is
    // only the picture catching up. Both are null/false before the first
    // action, which is the dark-ground state the plate paints.
    frame: (s.frameKey && s.frames) ? (s.frames.get(s.frameKey) || null) : null,
    frameGenerating: !!(s.frameKey && s.framesInFlight && s.framesInFlight.has(s.frameKey)),
    // D19: the box IS the picture's shape, so the painter locks the frame to
    // whichever of the three D19 boxes the frame on screen was generated for —
    // never to the shape the window happens to have now, which would crop or
    // letterbox a frame drawn before a resize.
    frameShape: (s.frameKey && s.frames && s.frames.get(s.frameKey))
      ? s.frames.get(s.frameKey).shape
      : (typeof nightFrameShape === 'function' ? nightFrameShape() : 'landscape'),
    elapsed: nightElapsedLabel(nightElapsedMinutes(gs, record)),
  };
}

// --- The session -----------------------------------------------------------

// Opens a session and the overlay over it. The gate is boundary.js's
// (resolveNightSceneGate, through openNightScene) — invariant 1's hard
// 'asleep' floor is consulted there and nothing here opens a second door.
// Phase 6's action chip is the intended caller; it is expected to have
// checked the gate itself for the chip's own visibility, so a false here is
// a genuine race rather than the common path.
function startNightScene(gs, targetId, ctx = {}) {
  if (!gs || nightSceneActive()) return false;
  const record = openNightScene(gs, targetId, ctx);
  if (!record) return false;
  const palette = nightPalette(gs, targetId);
  nightSession = {
    targetId,
    sel: nightRepairSelection(palette, { paceId: 'steady' }),
    lastResult: null,
    narration: '',
    confirming: false,
    trayOpen: false,
    ended: false,
    endOutcome: null,
    // --- Phase 6: the shadow layer ---------------------------------------
    // `cueSlot` is the last elapsed-minutes bucket the tick has already asked
    // about, so a cue is rolled exactly once per bucket however many times
    // the clock repaints. `cueResult` is the last exogenous cue's result and
    // is what the narration row's receipt reads; it is cleared the moment the
    // player acts again, so a cue's cost is never mistaken for a touch's.
    cueSlot: 0,
    cueResult: null,
    endResult: null,   // Phase 5: applyNightSceneEnd's return, painted by the end block
    climaxBeat: false, // D14/D38: true only on the repaint that follows a crossing
    onClick: null, onKey: null,
    // --- Phase 4, D37: the session-local frame store ---------------------
    // key -> { url, prompt, seed, negativePrompt, shape }. NOT kv.images: a
    // session cannot be minimised, saved mid-way or resumed after a load, so
    // its frames have nothing to outlive it for, and routing D18's cadence
    // through the shared 500-entry LRU would evict every plate, portrait and
    // dream panel in the save inside one long session (Q9). The object URLs
    // are revoked in nightCloseOverlay. Do NOT "fix" this back into
    // getCachedImage/setCachedImage.
    frames: new Map(),
    framesInFlight: new Set(),
    frameKey: null,      // the frame the tableau is showing (or waiting for)
    frameAxes: null,     // its (state x action) axes, for D21's reroll
    prefetchSel: null,   // the selection the last speculative fan-out covered
  };
  nightBindControls();
  // D24: the scene runs LIVE at one game-second per real second. This is the
  // whole of the clock wiring — the scene READS the clock TIME already runs
  // and never advances it (single clock owner). It deliberately does not open
  // through openActionWindow, which would pause the loop and make every time
  // cost free, which is exactly the incoherence D24 corrects.
  if (typeof pushTimeContext === 'function') pushTimeContext('nightscene');
  if (typeof openNightOverlay === 'function') openNightOverlay(gs, nightSession);
  nightStartClock();
  nightRepaint();
  return true;
}

// One delegated click listener and one capture-phase key listener for the
// whole overlay, bound at open and released at close — the same lifetime
// openActionWindow gives its own pair, and the reason the painter can rebuild
// every chip on every repaint without ever re-wiring anything.
function nightBindControls() {
  if (typeof document === 'undefined' || !document || !nightSession) return;
  const content = document.getElementById('night-content');
  if (!content) return;
  nightSession.onClick = (e) => {
    const el = e.target && e.target.closest ? e.target.closest('[data-night]') : null;
    if (!el) return;
    // The overlay backdrop is the action window's D1 dismiss target; a live
    // session is not a report to be dismissed, so nothing in here may reach it.
    e.stopPropagation();
    nightHandle(el.getAttribute('data-night'), el.getAttribute('data-value'));
  };
  // Capture phase, like the action window's own handler: the scene is the
  // topmost thing on screen, so its Escape must win over ui.js's overlay
  // chain rather than closing an inventory panel underneath it.
  nightSession.onKey = (e) => {
    if (e.key !== 'Escape' || !nightSession) return;
    e.preventDefault();
    e.stopPropagation();
    // Same Phase 5 fix as nightHandle's: once the session has ended, Escape is
    // the keyboard half of Continue and must still be able to dismiss it.
    if (nightSession.ended) { nightCloseOverlay(); return; }
    if (nightSession.confirming) { nightSession.confirming = false; nightRepaint(); return; }
    if (nightSession.trayOpen) { nightSession.trayOpen = false; nightRepaint(); return; }
    nightRequestLeave();
  };
  content.addEventListener('click', nightSession.onClick);
  document.addEventListener('keydown', nightSession.onKey, true);
}

function nightUnbindControls() {
  if (typeof document === 'undefined' || !document || !nightSession) return;
  const content = document.getElementById('night-content');
  if (content && nightSession.onClick) content.removeEventListener('click', nightSession.onClick);
  if (nightSession.onKey) document.removeEventListener('keydown', nightSession.onKey, true);
  nightSession.onClick = null;
  nightSession.onKey = null;
}

// The whole input surface, in one place. Every branch either changes the
// cursor and repaints, or fires an action — nothing else.
//
// PHASE 5 FIX. `close` is the one input that has to survive the session
// ENDING, and it is checked before nightSceneActive() for exactly that
// reason: nightEndScene stamps `ended`, which makes nightSceneActive() false
// by design (the scene really is over), and an active-only guard at the top
// made the end block's own Continue button inert — the overlay could not be
// dismissed at all, D24's time context stayed pushed at scale 1, and the
// session's frames were never released. The dead `kind !== 'close'` clause
// that used to sit below the guard is the proof the intent was always this;
// it could never be reached.
function nightHandle(kind, value) {
  const s = nightSession;
  if (!s) return;
  if (kind === 'close') { nightCloseOverlay(); return; }
  if (!nightSceneActive()) return;
  switch (kind) {
    case 'region': s.sel = { ...s.sel, regionKey: value, partId: null }; break;
    case 'part':   s.sel = { ...s.sel, partId: value }; break;
    case 'side':   s.sel = { ...s.sel, side: value }; break;
    case 'instrument': s.sel = { ...s.sel, instrumentId: value }; break;
    case 'pace':   s.sel = { ...s.sel, paceId: value }; break;
    case 'motion': nightFire(value); return;
    case 'again':  if (s.lastResult) nightFire(s.lastResult.motionId); return;
    case 'tray':   s.trayOpen = !s.trayOpen; break;
    case 'leave':  nightRequestLeave(); return;
    case 'leave-confirm': nightEndScene('exit'); return;
    case 'leave-cancel': s.confirming = false; break;
    default: return;
  }
  nightRepaint();
}

// THE CLICK PATH. Synchronous from end to end, and it must stay that way
// (design invariant 3): resolve against the pure resolver, commit through the
// one mutator, compose the authored line, repaint. Phase 4's frame request
// belongs AFTER the repaint and must never be awaited.
function nightFire(motionId) {
  const s = nightSession;
  const gs = (typeof currentGameState !== 'undefined') ? currentGameState : null;
  if (!s || !gs) return;
  if (!nightSyncSelection(gs, s)) return;   // nothing reachable at all
  const actionId = composeNightActionId(s.sel.partId, s.sel.side, s.sel.instrumentId, motionId, s.sel.paceId);
  const record = gs.npcs[s.targetId].flags._nightScene;
  // The per-repeat counter D30's seed folds: monotone, reproducible from the
  // save, and the same number the prose uses, so a reload replays both.
  const seedCtx = (record.touches || []).length;
  const result = nightStepAction(gs, s.targetId, actionId, seedCtx);
  if (!result) return;               // D31 refused it — the tray should not have offered it
  applyNightStep(gs, s.targetId, result);
  const line = composeNightLine(gs, s.targetId, result, seedCtx);
  s.lastResult = result;
  s.cueResult = null;                // Phase 6: your own action is the newest thing again
  s.narration = (line && line.text) || BOUNDARY.nightScene.prose.fallback;
  s.confirming = false;
  // D14/D38: purely positive, fires once per hundred crossed, and NEVER ends
  // the session — the resolver has already folded the beat into the line and
  // the pips; this is only what makes it visible for the one repaint that
  // follows the action that caused it.
  s.climaxBeat = !!result.climaxed;
  // D2/D6: Wakefulness hitting the cap is an instant forced wake, and the
  // resolver has ALREADY decided willing vs. hostile against D29's per-NPC
  // threshold. This file only reports it.
  // D18: the frame follows the ACTION, so the tableau is pointed at the new
  // (state x action) frame before the repaint — the painter then shows it
  // straight away if the store already holds it (a repeat, or a chip the
  // prefetch warmed) and raises the shimmer if it does not. Setting the key is
  // a pure string composition; nothing is generated here.
  const shape = (typeof nightFrameShape === 'function') ? nightFrameShape() : 'landscape';
  const axes = nightFrameAxes(gs.npcs[s.targetId].flags._nightScene,
    result.partId, result.side, result.instrumentId, result.motionId);
  s.frameAxes = axes;
  s.frameKey = nightFrameKeyFor(gs, s.targetId, axes, shape);
  if (result.woke) {
    nightEndScene(result.outcome);
    nightRequestFrame(gs, s, axes, shape);
    return;
  }
  nightRepaint();
  // AFTER the repaint and never awaited (design invariant 3). The tap has
  // already resolved, committed, composed its line and painted; this is only
  // the picture catching up.
  nightRequestFrame(gs, s, axes, shape);
}

// D22: one voluntary exit. It confirms only when there is evidence
// outstanding, and the confirmation names it.
function nightRequestLeave() {
  const s = nightSession;
  const gs = (typeof currentGameState !== 'undefined') ? currentGameState : null;
  if (!s || !gs) return;
  if (s.confirming) { nightEndScene('exit'); return; }
  const confirm = nightLeaveConfirm(gs, s.targetId);
  if (!confirm.needed) { nightEndScene('exit'); return; }
  s.confirming = true;
  nightRepaint();
}

// Ends the session, and with it EVERY consequence the session has. Phase 5's
// applyNightSceneEnd (boundary.js) is the one call — it stamps the resolution,
// banks record.xp through awardSkillXp's existing 'stealth' sink, hands the
// leftover evidence to the shared stealth machinery (D25's LEAVE_EVIDENCE, not
// a private roll), and routes a forced wake into applyReciprocatedAct or
// applyShamingReactionLines + noteColdShoulder. It is idempotent by
// construction (an already-resolved record returns null), which is what makes
// the bank land ONCE no matter how the player got here. This file decides
// nothing about any of it; it only shows what came back.
function nightEndScene(outcome) {
  const s = nightSession;
  const gs = (typeof currentGameState !== 'undefined') ? currentGameState : null;
  if (!s || !gs) return;
  s.endResult = (typeof applyNightSceneEnd === 'function')
    ? applyNightSceneEnd(gs, s.targetId, outcome)
    : null;
  s.ended = true;
  s.endOutcome = outcome;
  s.confirming = false;
  s.trayOpen = false;
  s.climaxBeat = false;
  nightRepaint();
}

function nightCloseOverlay() {
  if (!nightSession) return;
  nightUnbindControls();
  nightStopClock();
  // D37: the frames die here, object URLs revoked. Done BEFORE nightSession is
  // dropped, because that is what nightReleaseFrames walks — and any
  // generation still in flight will find `session !== nightSession` on
  // delivery and drop its own blob rather than resurrect a dead store.
  nightReleaseFrames(nightSession);
  // D24's context comes off with the scene. Paired with the push in
  // startNightScene; popTimeContext never pops past the derived base, so an
  // unbalanced close cannot strand the clock at 1x.
  if (typeof popTimeContext === 'function') popTimeContext();
  if (typeof closeNightOverlay === 'function') closeNightOverlay();
  nightSession = null;
}

// Called if the world pulls the rug — the player is moved out of the room, a
// load lands, anything that ends the scene without the player choosing to.
// Phase 6 wires the sim side; this is the seam it will call.
function abortNightScene() {
  const s = nightSession;
  const gs = (typeof currentGameState !== 'undefined') ? currentGameState : null;
  if (!s) return;
  if (gs && !s.ended) abandonNightScene(gs, s.targetId);
  nightCloseOverlay();
}


// --- Phase 4: the frames (D18/D19/D20/D21/D37) ------------------------------
// NOTHING IN HERE IS EVER AWAITED. generateNightFrame returns a promise and
// every caller below chains it with .then(); design invariant 3 is that a tap
// resolves against the pure resolver and the picture arrives when it arrives,
// behind the shimmer. The harness asserts this file contains no `await` and no
// `async` at all, which is the cheapest possible guard on that rule — if a
// later session needs to "just await this one", the answer is no.

// The key for one frame, at the shape the window can show RIGHT NOW.
function nightFrameKeyFor(gs, targetId, axes, shape) {
  if (!axes || typeof composeNightFrameKey !== 'function') return null;
  return composeNightFrameKey(gs, targetId, { ...axes, shape });
}

// Takes delivery of a generated frame. The blob becomes an object URL owned by
// the SESSION (D37) — never kv.images — and replaces whatever stood under the
// same key, which is exactly what makes D21's reroll final: the frame the
// player rejected is revoked here and can never be shown again.
function nightAcceptFrame(session, key, res) {
  if (!session || !key) return false;
  session.framesInFlight.delete(key);
  // The session ended (or was replaced) while this was in flight. Everything
  // it produced dies with it; there is nowhere left to put the pixels.
  if (session !== nightSession) return false;
  if (!res || !res.blob) return false;
  const prev = session.frames.get(key);
  if (prev && prev.url && typeof URL !== 'undefined') URL.revokeObjectURL(prev.url);
  session.frames.set(key, {
    url: (typeof URL !== 'undefined') ? URL.createObjectURL(res.blob) : null,
    prompt: res.prompt, seed: res.seed, negativePrompt: res.negativePrompt, shape: res.shape,
  });
  return true;
}

// Ask for one frame, unless it is already stored or already coming. Returns
// its key so the caller can point the tableau at it. Fire-and-forget.
function nightRequestFrame(gs, session, axes, shape) {
  if (!gs || !session || !axes || typeof generateNightFrame !== 'function') return null;
  const key = nightFrameKeyFor(gs, session.targetId, axes, shape);
  if (!key) return null;
  if (session.frames.has(key) || session.framesInFlight.has(key)) return key;
  session.framesInFlight.add(key);
  generateNightFrame(gs, session.targetId, { ...axes, shape }).then((res) => {
    const arrived = nightAcceptFrame(session, key, res);
    // Only the frame the tableau is actually waiting on repaints; a
    // speculative one lands silently in the store, which is the whole point of
    // warming it. The repaint is the FRAME ONLY — rebuilding the tray under
    // the player's thumb because a picture finished is a different bug.
    if (arrived && session === nightSession && session.frameKey === key) nightRepaintFrame();
  }, () => { session.framesInFlight.delete(key); });
  return key;
}

// D20's speculative prefetch, and the other half of what makes D18's cadence
// survivable: having chosen a part and an instrument, the player's next tap is
// almost certainly one of the motion chips in front of them, so warm those
// frames into the slots NOBODY IS WAITING ON. imageFreeSlots is what keeps
// this polite — a fan-out that queued behind the cap would push a real request
// (the frame for the tap that just happened) behind a dozen guesses.
function nightPrefetchFrames(gs, session, vm) {
  if (!gs || !session || !vm || !vm.sel || !vm.record) return 0;
  if (typeof imageFreeSlots !== 'function' || typeof generateNightFrame !== 'function') return 0;
  const shape = nightFrameShape();
  let slots = imageFreeSlots();
  let fired = 0;
  for (const m of vm.motions) {
    if (slots <= 0) break;
    if (!m.valid) continue;
    const axes = nightFrameAxes(vm.record, vm.sel.partId, vm.sel.side, vm.sel.instrumentId, m.motionId);
    const key = nightFrameKeyFor(gs, session.targetId, axes, shape);
    if (!key || session.frames.has(key) || session.framesInFlight.has(key)) continue;
    nightRequestFrame(gs, session, axes, shape);
    slots--; fired++;
  }
  return fired;
}

// D21: the shared ⓘ / reroll affordance, writing back to the SAME key. Returns
// a promise because ui.js's doRerollImageInfo awaits it — chained, never
// awaited here. An untouched seed field rolls a FRESH one (rerollPeekFrame's
// contract, not rerollActionWindow's deterministic one): the player opened
// this modal because the frame was wrong, and handing them the same seed would
// hand them the same picture back.
function nightRerollFrame(fields) {
  const s = nightSession;
  const gs = (typeof currentGameState !== 'undefined') ? currentGameState : null;
  if (!s || !gs || !s.frameKey || !s.frameAxes) return Promise.resolve({ error: 'No frame to reroll.' });
  const key = s.frameKey;
  const entry = s.frames.get(key);
  const seed = (fields && fields.seed != null) ? fields.seed : Math.floor(Math.random() * 2147483647);
  s.framesInFlight.add(key);
  return generateNightFrame(gs, s.targetId, { ...s.frameAxes, shape: entry ? entry.shape : nightFrameShape() }, {
    prompt: (fields && fields.prompt) || (entry && entry.prompt),
    seed,
    negativePrompt: (fields && fields.negativePrompt) || (entry && entry.negativePrompt),
  }).then((res) => {
    const arrived = nightAcceptFrame(s, key, res);
    if (!arrived) return { error: (res && res.error) || 'The model returned an empty frame.' };
    if (s === nightSession && s.frameKey === key) nightRepaintFrame();
    return { ok: true };
  }, (e) => {
    s.framesInFlight.delete(key);
    return { error: e && e.message ? e.message : 'The model returned an empty frame.' };
  });
}

// D37: the frames die with the session. Revoking is not housekeeping — an
// un-revoked object URL pins its blob in memory for the life of the tab, and
// D18 makes a long session produce a lot of them.
function nightReleaseFrames(session) {
  if (!session || !session.frames) return;
  if (typeof URL !== 'undefined') {
    for (const entry of session.frames.values()) {
      if (entry && entry.url) URL.revokeObjectURL(entry.url);
    }
  }
  session.frames.clear();
  session.framesInFlight.clear();
  session.frameKey = null;
  session.frameAxes = null;
}

// --- Phase 4: the live clock (D24) -----------------------------------------
// The scene runs at one game-second per real second and this loop READS that
// clock — it never advances it (single clock owner, TIME's file header;
// peek.js keeps the same discipline). Its whole job is to keep the elapsed
// readout honest, so it repaints ONE element rather than the tray.
let nightClockTimer = null;

function nightStartClock() {
  if (typeof setInterval !== 'function') return;
  nightStopClock();
  nightClockTimer = setInterval(nightClockTick, 1000);
}

function nightStopClock() {
  if (nightClockTimer != null && typeof clearInterval === 'function') clearInterval(nightClockTimer);
  nightClockTimer = null;
}

function nightClockTick() {
  const gs = (typeof currentGameState !== 'undefined') ? currentGameState : null;
  if (!gs || !nightSession) return;
  // Phase 6's shadow layer rides the live clock, because that is the only
  // thing in the session that moves on its own (D24). Checked before the
  // clock repaint so a cue that fires repaints the whole overlay once rather
  // than painting a stale bar first.
  if (nightAmbientTick(gs, nightSession)) return;
  if (typeof renderNightClock !== 'function') return;
  renderNightClock(nightViewModel(gs, nightSession));
}

// The exogenous risk beat. Returns true when a cue actually fired (and has
// therefore already repainted or ended the session).
//
// Everything about it goes through the SAME path a tap does — the pure
// resolver, the one mutator, the authored composer — because invariant 6's
// rule is that the world's own noise must not reach her through a parallel
// channel. The only differences are that the player did not choose it, it
// earns no XP (nightStepAction zeroes it), and it asks for no picture: D18's
// frames are of what you are DOING, and a door down the hall is not that.
function nightAmbientTick(gs, s) {
  if (!s || s.ended || !nightSceneActive()) return false;
  const A = BOUNDARY.nightScene.ambient;
  const record = gs.npcs?.[s.targetId]?.flags?._nightScene;
  if (!record) return false;
  const slot = Math.floor(nightElapsedMinutes(gs, record) / A.everyMinutes);
  if (slot <= (s.cueSlot || 0)) return false;
  s.cueSlot = slot;                       // consumed whether or not it fires
  const cue = nightAmbientCue(gs, s.targetId, slot);
  if (!cue) return false;
  const seedCtx = (record.touches || []).length;
  const result = nightStepAction(gs, s.targetId, cue.actionId, seedCtx);
  if (!result) return false;
  applyNightStep(gs, s.targetId, result);
  const line = composeNightLine(gs, s.targetId, result, seedCtx);
  s.cueResult = result;
  s.narration = (line && line.text) || BOUNDARY.nightScene.prose.fallback;
  s.climaxBeat = false;
  if (result.woke) { nightEndScene(result.outcome); return true; }
  nightRepaint();
  return true;
}

// Pulls the cursor back onto the palette as it stands NOW and writes it back,
// so the session never holds a selection the tray is not showing. Called
// before every repaint and before every fire: a Move that changes her pose
// (D34) can pull the selected part out of reach between one tap and the next,
// and an unrepaired cursor would then compose an id the resolver refuses.
function nightSyncSelection(gs, s) {
  if (!gs || !s) return null;
  s.sel = nightRepairSelection(nightPalette(gs, s.targetId), s.sel);
  return s.sel;
}

function nightRepaint() {
  const gs = (typeof currentGameState !== 'undefined') ? currentGameState : null;
  if (!gs || !nightSession || typeof renderNightScene !== 'function') return;
  nightSyncSelection(gs, nightSession);
  const vm = renderNightScene(gs, nightSession);
  // D20's fan-out, and the reason it lives here rather than in nightHandle:
  // the motion chips it warms are the ones that were just PAINTED, so the
  // prefetch and the row it is guessing about can never disagree. Only when
  // the selection actually moved — a pace change repaints and is not in the
  // image key, so re-firing on one would burn slots on frames already held.
  if (vm && !nightSession.ended) {
    const sig = nightPrefetchSignature(nightSession.sel);
    if (sig && sig !== nightSession.prefetchSel) {
      nightSession.prefetchSel = sig;
      nightPrefetchFrames(gs, nightSession, vm);
    }
  }
}

// A frame arrived. Repaints THE FRAME and nothing else: a picture finishing is
// not a reason to rebuild the tray under the player's thumb, and a full
// repaint here would also re-fire nothing useful.
function nightRepaintFrame() {
  const gs = (typeof currentGameState !== 'undefined') ? currentGameState : null;
  if (!gs || !nightSession || typeof renderNightFrame !== 'function') return;
  renderNightFrame(nightViewModel(gs, nightSession));
}

// ===== /SECTION: NIGHT SCENE CONTROLLER =====
