// ===== SECTION: ACTION OUTCOME WINDOW (action-outcome-window-plan Phase 1-2) =====
// The reusable outcome pane: narration, usually an image, and a "what
// changed" delta strip, shown after an action that mattered, dismissed only
// by a deliberate tap (D1 — no auto-advance, ever).
//
// THIS FILE HOLDS NO DECISION LOGIC. It is the projection half of the same
// split peek.js already uses, just inverted in file terms: peek.js decides
// and renderPeekHold only paints, and here the VERB decides
// (defs.actions.js's `outcomeWindow` field, actions.js's executeAction) and
// everything below only paints what it was handed. Design invariant 1: if a
// chance roll or an effect calculation ever appears in this file, it is in
// the wrong file.
//
// Three rules this file exists to keep, restated because they are the ones
// easiest to break by accident:
//   1. Every number in the delta strip comes from applyEffects' OWN returned
//      effect list (`result.applied`) — never a before/after diff, never a
//      per-verb hand-written delta.
//   2. Every image goes through image.js's cache/budget machinery
//      (getActionWindowImage -> getCachedImage/setCachedImage). A direct
//      generateImage call from here would be a bug.
//   3. Dismissal is a tap. There is no timer in this file.
//
// The clock is PAUSED while a window is open (the same pauseClockLoop /
// resumeClockLoop pair advanceAndResolve and the pause menu use) — reading
// the outcome must not cost the player game-minutes, or D1's "one extra
// click" becomes "one extra click and three game-minutes".
//
// PHASE 2 adds two things, and neither of them adds a decision to this file:
//   - D7's `trigger: 'world'` gate. A world-initiated window asks a question
//     instead of reporting an outcome, so it paints `spec.choices` in place of
//     the single Continue button and dismisses with the chosen choice's id.
//     WHICH choices exist, and what each one means, is built by the caller
//     (ui.js's overture gate) — this file only paints them and reports back
//     which one was pressed.
//   - D6's `'handoff'` dismissal. Still a tap (D1); what changes is only that
//     the close is a directed cross-fade rather than an instant hide, so the
//     conversation the caller is about to open rises as this window falls.
//     This file performs the TRANSITION and nothing else: it never calls
//     doTalk, never picks a target, and never decides that a handoff is owed.
//     Whether one is owed arrives here already decided — either as the
//     resolved `spec.dismissal` (a def may declare it as a function of the
//     view, so it reads the OUTCOME the verb produced, never the verb id —
//     Design invariant 2) or as `handoff: true` on the choice the player
//     actually pressed.

// THE DREAM ENGINE'S PHASE 7 adds a third body kind, `'dream'`, and it is the
// only one that shows more than one thing before it closes. It changes none of
// the three rules above: the panels were rendered into the image cache long
// before the window opened (dream-engine-plan D19), the strip is absent rather
// than empty (D13), and a tap is still the only thing that moves — it just
// turns the page instead of closing the book while panels remain (D15).
// Everything that DECIDES anything about a dream lives in dreams.js; this file
// gets a finished record and turns it over.

// --- Module state ----------------------------------------------------------
// One window at a time; none of it persists (a window is a moment, not a
// save field). What persists is what the action did, which was already
// applied and saved before the window ever opened.
let actionWindowSession = null;

function actionWindowActive() {
  return !!actionWindowSession;
}

function awShow(id) {
  if (typeof document === 'undefined' || !document) return;
  const el = document.getElementById(id);
  if (el) el.removeAttribute('hidden');
}

function awHide(id) {
  if (typeof document === 'undefined' || !document) return;
  const el = document.getElementById(id);
  if (el) el.setAttribute('hidden', '');
}

// --- The delta strip's projection table (PURE) -----------------------------
// effect type -> one displayable row, or nothing for "not player-legible".
// Bookkeeping effects (flags, memories, object state, movement) deliberately
// produce no row: the strip answers "what changed for me", not "what did the
// engine write". Params arrive as STRINGS (parseEffectParams), so everything
// here formats rather than computes — no arithmetic across two effects, ever.
const ACTION_WINDOW_NEED_GLYPHS = {
  energy: '⚡', hunger: '🍽', hygiene: '🧼', mood: '🙂',
  comfort: '🛋', stimulation: '✨', hydration: '💧', social: '💬',
};

const ACTION_WINDOW_AXIS_GLYPHS = {
  affection: '💗', trust: '🤝', tension: '⚡',
  respect: '🎖', desire: '🔥', comfort: '🛋',
};

function actionWindowSigned(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw === undefined || raw === null ? '' : raw);
  // Relationship axes are fractional (-1..1); needs, money and XP are whole.
  const shown = (n !== 0 && Math.abs(n) < 1) ? String(Number(n.toFixed(2))) : String(Math.round(n * 100) / 100);
  return n > 0 ? `+${shown}` : shown;
}

function actionWindowTone(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}

// '' for the player (the strip is written from their point of view, so
// naming them in every row is noise); the NPC's name for anyone else.
function actionWindowSubjectName(who, gs) {
  if (!who || who === 'player') return '';
  const npc = gs && gs.npcs ? gs.npcs[who] : null;
  return (npc && npc.bible && npc.bible.name) || who;
}

function actionWindowTitle(word) {
  const s = String(word || '').replace(/_/g, ' ');
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function actionWindowItemLabel(defId) {
  const def = typeof ITEM_DEFS !== 'undefined' ? ITEM_DEFS[defId] : null;
  return (def && def.label) || defId;
}

// One row per effect. A type absent from this table says nothing.
const ACTION_WINDOW_ROW_BUILDERS = {
  ADJUST_NEED: (p, gs) => {
    const owner = actionWindowSubjectName(p.who, gs);
    return {
      kind: 'need',
      glyph: ACTION_WINDOW_NEED_GLYPHS[p.need] || '•',
      label: owner ? `${owner} · ${actionWindowTitle(p.need)}` : actionWindowTitle(p.need),
      value: actionWindowSigned(p.delta),
      tone: actionWindowTone(p.delta),
    };
  },
  MOOD_DELTA: (p, gs) => {
    const owner = actionWindowSubjectName(p.who, gs);
    return {
      kind: 'need', glyph: '🙂',
      label: owner ? `${owner} · Mood` : 'Mood',
      value: actionWindowSigned(p.delta), tone: actionWindowTone(p.delta),
    };
  },
  REL_DELTA: (p, gs) => ({
    kind: 'rel',
    glyph: ACTION_WINDOW_AXIS_GLYPHS[p.axis] || '💠',
    label: `${actionWindowSubjectName(p.npcId, gs) || 'They'} · ${actionWindowTitle(p.axis)}`,
    value: actionWindowSigned(p.delta), tone: actionWindowTone(p.delta),
  }),
  ADJUST_SUSPICION: (p, gs) => ({
    kind: 'rel', glyph: '👁',
    label: `${actionWindowSubjectName(p.npcId, gs) || 'They'} · Suspicion`,
    value: actionWindowSigned(p.delta), tone: 'down',
  }),
  SPEND_MONEY: (p) => ({
    kind: 'money', glyph: '💵',
    label: p.reason ? actionWindowTitle(p.reason) : 'Spent',
    value: `-$${Math.abs(Number(p.amount) || 0)}`, tone: 'down',
  }),
  EARN_MONEY: (p) => ({
    kind: 'money', glyph: '💵',
    label: p.reason ? actionWindowTitle(p.reason) : 'Earned',
    value: `+$${Math.abs(Number(p.amount) || 0)}`, tone: 'up',
  }),
  ADD_SKILL_XP: (p) => ({
    kind: 'skill', glyph: '✦',
    label: `${actionWindowTitle(p.skillId)} XP`,
    value: actionWindowSigned(p.xp), tone: 'up',
  }),
  EAT_ITEM: (p, gs) => {
    const eater = actionWindowSubjectName(p.who, gs);
    const label = actionWindowItemLabel(p.defId);
    return {
      kind: 'item', glyph: '🍽',
      label: eater ? `${eater} ate ${label}` : `Ate ${label}`,
      value: `×${p.qty}`, tone: 'flat',
    };
  },
  CONSUME_ITEM: (p) => ({
    kind: 'item', glyph: '📦',
    label: `Used ${actionWindowItemLabel(p.defId)}`, value: `×${p.qty}`, tone: 'down',
  }),
  SPAWN_ITEM: (p) => ({
    kind: 'item', glyph: '📦',
    label: actionWindowItemLabel(p.defId), value: `+${p.qty}`, tone: 'up',
  }),
  ADD_DISHES: (p) => {
    const def = typeof DISH_DEFS !== 'undefined' ? DISH_DEFS[p.dishType] : null;
    return {
      kind: 'chore', glyph: '🧽',
      label: `Dirty ${String((def && def.label) || p.dishType).toLowerCase()}`,
      value: `+${p.qty}`, tone: 'down',
    };
  },
  CLEAN_DISHES: (p) => ({
    kind: 'chore', glyph: '🧽', label: 'Dishes washed',
    value: p.qty ? `×${p.qty}` : '', tone: 'up',
  }),
};

// PURE. applyEffects' returned `applied` list -> the strip's rows. This is
// the delta strip's ONLY data source (Design invariant 1 / the plan's
// load-bearing bet): a verb that wants a row emits an effect, it does not
// hand the window a number.
//
// Known gap, recorded rather than worked around: COMPOUND effects that do
// their own need math internally (EAT_ITEM calls applyAdjustNeed for the
// kcal/mood restore without emitting a typed sub-effect) contribute only
// their own row here — the restore they performed is not in `applied`, and
// this file must not go looking for it by any other means.
function deriveActionDeltas(applied, gs) {
  const rows = [];
  for (const eff of applied || []) {
    const build = eff && ACTION_WINDOW_ROW_BUILDERS[eff.type];
    if (!build) continue;
    const row = build(eff.params || {}, gs);
    if (row) rows.push(row);
  }
  return rows;
}

// --- Spec resolution (PURE) ------------------------------------------------
// The def's declared `outcomeWindow` + the verb's own result -> the flat
// shape the renderer paints. Every value here is READ, never decided:
// narration is the verb's narration, the deltas are the verb's applied
// effects, and the image plan is the def's own declared phrase/kind.
//
// A declared field may be a value or a function of the view — the same
// two-shapes-one-field convention ACTION_DEFS' narration/timeCost already
// use. The view carries what the verb produced: gs, def, result, the
// prepare() pick, and the room it happened in.
function resolveActionWindowSpec(gs, def, result) {
  const ow = def && def.outcomeWindow;
  if (!ow) return null;
  const view = {
    gs, def, result,
    prepared: (result && result.prepared) || null,
    roomId: (result && result.roomId) || (gs && gs.player && gs.player.location) || null,
  };
  const val = (v) => (typeof v === 'function' ? v(view) : v);
  const spec = {
    // Phase 3 (D25): `tier` goes through val() like every other declared
    // field. `sit` is the case that needed it — D10 makes the SAME verb a
    // Tier D scene when anyone came and a quick Tier C beat when nobody did,
    // and that is a fact about the outcome, not about the verb. Same shape
    // and same justification as D6's outcome-conditional `dismissal`.
    // (Phase 1 read this field directly; a function landed in the DOM as its
    // own source text, which is how the gap was found.)
    tier: val(ow.tier) || 'B',
    trigger: ow.trigger || 'player',
    heading: val(ow.heading) || def.label || '',
    narration: (typeof ow.narration === 'function' ? ow.narration(gs, result) : (result && result.narration)) || '',
    deltas: deriveActionDeltas(result && result.applied, gs),
    minutes: Number(result && result.minutesSpent) || 0,
    // D6 through Design invariant 2: `dismissal` goes through val() like every
    // other declared field, which is the whole mechanism by which a handoff
    // stays outcome-conditional. A def that wants one writes
    //   dismissal: (view) => view.result.outcome === 'engage' ? 'handoff' : 'tap'
    // — it branches on the value its own logic already produced. A def that
    // writes the literal 'handoff' has hard-coded "this verb always talks
    // afterward", which is the thing the invariant forbids; nothing here can
    // stop that, but nothing here should make it the easy shape either.
    dismissal: val(ow.dismissal) || 'tap',
    // D7: a world-initiated window asks. Each entry is { id, label, tone?,
    // handoff? } and the id is what dismissActionWindow resolves with.
    // Phase 3: a PLAYER-triggered outcome may carry them too — `sit`'s shared
    // meal ends in a choice of who to talk to (D10) rather than a bare
    // Continue. Same field, same contract, both directions.
    choices: val(ow.choices) || null,
    defaultChoice: val(ow.defaultChoice) || null,
    image: null,
  };
  // Tier B is narration only (D3's exception); every other tier may carry an
  // image, and only when the def actually declared a phrase for one.
  if (spec.tier !== 'B' && ow.image) {
    const phrase = val(ow.image.phrase);
    if (phrase) {
      const clock = (gs && gs.meta && gs.meta.clock) || {};
      spec.image = {
        kind: ow.image.kind === 'instance' ? 'instance' : 'archetype',
        verbId: def.id,
        roomId: view.roomId,
        phrase,
        clothing: val(ow.image.clothing) || null,
        variant: val(ow.image.variant) || 'base',
        // D5: an instance frame is the point BECAUSE it is this occurrence.
        // Without a subject it would collide with every other occurrence of
        // the same verb, so the clock stamp is the floor, not the default.
        subject: val(ow.image.subject) || `d${clock.day || 0}m${Math.floor(clock.minutes || 0)}`,
      };
    }
  }
  return spec;
}

// --- Presentation ----------------------------------------------------------
// The one entry point a verb's caller uses. Resolves to the dismissal reason
// once the player taps; resolves immediately (null) when there is no window
// to show or no DOM to show it in (a harness).
function presentActionOutcome(gs, def, result) {
  const spec = resolveActionWindowSpec(gs, def, result);
  if (!spec) return Promise.resolve(null);
  return openActionWindow(gs, spec);
}

// D7's entry point: the world opened this one, not the player. Resolves to the
// id of the choice the player pressed, or to `defaultChoice` when they closed
// it without pressing one (backdrop, Escape) — because a gate that can be
// dismissed has to mean something when it is, and only the caller knows what
// the quiet answer is.
//
// A gate is a QUESTION, not an outcome: nothing has been applied yet, so there
// is no `applied` list to read and the delta strip stays empty rather than
// claiming "Nothing else changed" about a moment that has not happened. That
// is the one behavioural difference between this and the player path; all the
// chrome, the clock pause and the tap contract are identical.
function presentWorldGate(gs, gate) {
  if (!gate) return Promise.resolve(null);
  const spec = {
    tier: gate.tier || 'B',
    trigger: 'world',
    heading: gate.heading || '',
    narration: gate.narration || '',
    deltas: [],
    minutes: 0,
    dismissal: gate.dismissal || 'tap',
    defaultChoice: gate.defaultChoice || null,
    choices: gate.choices || null,
    image: gate.image || null,
  };
  return openActionWindow(gs, spec);
}

// --- Tier D: a step INSIDE the chrome (D2, Phase 3) ------------------------
// D2's rule is that a Tier D verb's own interaction renders inside this
// frame rather than on a screen of its own. A "step" is one beat of that
// interaction — `sit`'s "Can I join you?" ask, its choice of what to eat —
// and it is the same window, the same tap contract and the same clock pause
// as every other one; only the body differs.
//
// This decides NOTHING. The caller has already worked out which beats exist
// and what each answer means; this shows one and reports which button was
// pressed. `sit` rolled the dice long before it got here.
//
// Two differences from an outcome window, both because a step happens BEFORE
// the action resolves rather than after it:
//   - it runs during prepare(), so the loading overlay is still up and has to
//     come down first — the same thing openSpreadPicker does for the same
//     reason, and the reason it is done here rather than by each caller.
//   - it can carry a CUTOUT rather than a generated scene. A per-NPC ask must
//     not cost a generation every time someone leans in, and the cutout cache
//     is keyed on (identity, pose, expression, outfit) — so the same person
//     asking on a hundred different evenings costs exactly one frame, ever.
//
// Resolves to the pressed choice's id, to `defaultChoice` when the player
// dismissed it without choosing, or to null when there is no DOM (a harness)
// — and a null MUST be treated by the caller as "cancel the whole action",
// never as a silent yes.
function presentActionStep(gs, step) {
  if (!step) return Promise.resolve(null);
  if (typeof hideLoading === 'function') hideLoading();
  const spec = {
    tier: 'D',
    trigger: 'player',
    heading: step.heading || '',
    narration: step.narration || '',
    deltas: [],
    minutes: 0,
    dismissal: 'interactive',
    defaultChoice: step.defaultChoice || null,
    choices: step.choices || null,
    image: step.image || null,
    // { npcId } — resolved through image.js's getCharacterCutout, which is
    // the cache/budget machinery for cutouts exactly as getActionWindowImage
    // is for scenes (Design invariant 3: never generateImage from here).
    cutout: step.cutout || null,
  };
  return openActionWindow(gs, spec);
}

// --- Tier D: the scheduling picker inside the chrome (D2/D8, Phase 5) --------
// The shared calendar for both invite entry points (AfterHours \"invite over\"
// and \"invite to dinner\"). The slot COMPUTATION is the caller's
// (render.js's openSchedulePicker probes the NPC's free windows via freeSlotsFor
// and hands them in as `slots`); this is the projection half only — it
// paints a list of already-worked-out windows and reports which one was picked,
// exactly the invariant 1 split every other entry point obeys. Same window, same
// tap contract, same clock pause (D17) as any outcome; this one is a
// question (which time?), so Cancel / the backdrop / Escape all resolve null and
// the caller treats null as \"didn't book anything\". Resolves to the chosen
// { startAbs, endAbs } or null.
function presentSchedulePicker(gs, opts) {
  if (!opts) return Promise.resolve(null);
  if (typeof document === 'undefined' || !document) return Promise.resolve(null);
  if (actionWindowSession) return Promise.resolve(null);
  const spec = {
    tier: 'D',
    trigger: 'player',
    heading: opts.heading || 'Choose a time',
    body: 'picker',
    pickerSlots: opts.slots || [],
    deltas: [],
    minutes: 0,
    dismissal: 'tap',
    defaultChoice: 'cancel',
    choices: null,
    image: null,
    cutout: null,
  };
  return openActionWindow(gs, spec).then((reason) => {
    if (typeof reason === 'string' && reason.indexOf('slot:') === 0) {
      const slot = (opts.slots || [])[Number(reason.slice(5))];
      return slot || null;
    }
    return null;
  });
}

// --- The dream viewer (dream-engine-plan Phase 7, D3/D13/D15) --------------
// A dream is WATCHED, not played (D3). No choices, no branches, no delta strip
// and no time chip (D13): a strip under a dream would be both empty and a lie
// about what a dream is, and the one number a dream does move — the register's
// wake tint — is applied by dreams.js AFTER the last panel, as part of waking
// up, not as a receipt for having looked.
//
// This file still decides nothing. The dream arrived compiled, written and
// rendered; every panel's prose and picture were frozen onto the record hours
// of game time ago, and all of this does is turn them over one at a time.
//
// Resolves to the dismissal reason once the LAST panel is dismissed, or to
// null when there is no DOM (a harness) or a window is already open — and
// dreams.js treats that null as "not shown", so the record stays in the queue
// rather than being spent on a window nobody saw.
function presentDream(gs, dream) {
  if (!dream || !Array.isArray(dream.panels) || dream.panels.length === 0) return Promise.resolve(null);
  if (typeof document === 'undefined' || !document) return Promise.resolve(null);
  if (actionWindowSession) return Promise.resolve(null);
  const spec = {
    // Tier C: a frame and a line. Not B, which hides the frame outright.
    tier: 'C',
    // The dream came to the player; they did not press anything to get it.
    // The same reading presentWorldGate uses for D7's gate.
    trigger: 'world',
    body: 'dream',
    heading: dream.forSleep === 'nap' ? 'A half-dream' : 'A dream',
    // Both filled per-panel by the body branch below, from the record.
    narration: '',
    deltas: [], minutes: 0,
    dismissal: 'tap', defaultChoice: null, choices: null,
    image: null, cutout: null,
    dream,
  };
  return openActionWindow(gs, spec);
}

// Every panel's frame, in order, through image.js's cache (Design invariant 3
// of this file: never generateImage from here) — and SEQUENTIALLY, which is
// D21 for the same reason the background pass obeys it.
//
// On the normal path every one of these is a cache HIT: Phase 6 rendered the
// whole dream before it was allowed into the queue (D38), and a dream that
// could not render every panel never got there. A miss is still possible —
// the image cache is a shared LRU with a 500-entry cap and a night can pass
// between the render and the sleep — and it costs a regeneration from the
// record's own frozen prompt and seed (D14/D40), which is exactly what the
// Dream Diary will do years later. It does NOT cost the player a wait: the
// window is already open and readable, the same contract every other frame in
// this file has.
async function loadDreamPanels(s) {
  const dream = s.spec.dream;
  for (let i = 0; i < dream.panels.length; i++) {
    let result = null;
    try {
      if (typeof getDreamPanelImage === 'function') result = await getDreamPanelImage(dream, i);
    } catch (e) {
      console.warn('Dream panel image failed:', e.message);
    }
    // Dismissed while resolving. Dropping the rest on the floor is right —
    // the cache kept whatever did arrive, so reopening this dream from the
    // diary still gets it for free.
    if (actionWindowSession !== s) return;
    s.dreamPanels[i] = (result && result.url)
      ? { url: result.url, prompt: result.prompt || null }
      : { url: null, error: (result && result.error) || 'no panel' };
    // Only repaint if this is the panel actually on screen. The player may
    // already have advanced past it, and a render for a stale index would
    // pull the picture back a beat.
    if (s.panelIndex === i) { s.generating = false; renderActionWindow(s); }
  }
}

// D3: a tap advances a panel; the last tap closes the window. Asked by
// dismissActionWindow of every dismissal, which is how the backdrop, the
// button and the key handler all get this behaviour without any of them
// knowing what a dream is.
//
// Escape is the exception and is deliberately NOT an advance: it is the
// universal "get me out of here" and skipping the rest of a dream is a
// legitimate thing to want. The dream still counts as shown — the player
// chose to stop looking at something they were being shown, which is not the
// same as never having been shown it.
function actionWindowAdvancesDream(s, reason) {
  if (!s || !s.spec || s.spec.body !== 'dream') return false;
  if (reason === 'escape') return false;
  const panels = (s.spec.dream && s.spec.dream.panels) || [];
  return s.panelIndex < panels.length - 1;
}

function advanceDreamPanel(s) {
  s.panelIndex++;
  // Normally already resolved and this is a straight swap with no dark frame
  // between beats — loadDreamPanels walks ahead of the player and every panel
  // is a cache hit. The shimmer is for the case where it is not.
  s.generating = !s.dreamPanels[s.panelIndex];
  renderActionWindow(s);
}

function openActionWindow(gs, spec) {
  if (typeof document === 'undefined' || !document) return Promise.resolve(null);
  const overlay = document.getElementById('action-window-overlay');
  if (!overlay || actionWindowSession) return Promise.resolve(null);

  return new Promise((resolve) => {
    // The same wasRunning guard advanceAndResolve uses: only resume what we
    // actually paused, so a window opened while the clock was already
    // stopped (the pause menu, a discrete batch) doesn't restart it.
    const wasRunning = typeof clockLoopRunning !== 'undefined' && clockLoopRunning;
    if (wasRunning && typeof pauseClockLoop === 'function') pauseClockLoop();

    const s = {
      spec, resolve, wasRunning,
      imageKey: null, imageUrl: null, imagePrompt: null, imageError: null,
      isCutout: false,
      generating: !!(spec.image || spec.cutout || spec.body === 'dream'),
      // Dream Engine Phase 7 (D15): ONE session, an internal cursor. A dream
      // is the only body that shows more than one thing before it closes, and
      // it advances the cursor rather than opening a window per panel — which
      // is what sidesteps this file's own re-entry guard and the data-handoff
      // fade. Inert (and left at 0) for every other body.
      panelIndex: 0,
      // Resolved panel frames, filled in order by loadDreamPanels. Not a
      // single imageUrl like every other body, because advancing must be
      // INSTANT: the panels were rendered into the cache before the player
      // ever clicked Sleep (D19), so by the time the second panel is asked
      // for it is already sitting here and there is no dark frame between
      // beats.
      dreamPanels: [],
      onClick: null, onKey: null,
    };
    actionWindowSession = s;

    // A backdrop tap on an outcome is "I have read it". On a D7 gate it is the
    // quiet answer, which is a real answer and belongs to the caller — the
    // gate names it in `defaultChoice` (for an overture: ignore, which by D7
    // costs nothing and leaves the record standing).
    const quietReason = () => spec.defaultChoice || 'tap';
    s.onClick = () => dismissActionWindow(quietReason());
    // Capture phase + stopPropagation: the window is the topmost thing on
    // screen, so its Escape must win over ui.js's overlay chain rather than
    // closing an inventory panel underneath it.
    s.onKey = (e) => {
      if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      // A gate has more than one answer, so Enter/Space cannot stand for "the
      // obvious one" the way they do on a single Continue button — every key
      // out of a gate is the quiet answer, and the choice buttons are the only
      // way to give a loud one.
      if (spec.choices && spec.choices.length) { dismissActionWindow(quietReason()); return; }
      dismissActionWindow(e.key === 'Escape' ? 'escape' : 'key');
    };
    overlay.addEventListener('click', s.onClick);
    document.addEventListener('keydown', s.onKey, true);

    renderActionWindow(s);
    if (spec.image) void loadActionWindowImage(s, gs);
    else if (spec.cutout) void loadActionWindowCutout(s, gs);
    else if (spec.body === 'dream') void loadDreamPanels(s);
  });
}

// How long the handoff cross-fade runs. Must match .aw-overlay[data-handoff]'s
// transition in main.html — the timer only decides when the (already inert,
// already resolved) overlay stops taking up compositing, never when the player
// gets control back, so a drift here is a cosmetic tail, not a stuck window.
const ACTION_WINDOW_HANDOFF_MS = 420;

// Does THIS dismissal owe a handoff? Read, never decided (Design invariant 2).
// Two sources, and both were computed by someone who knew the outcome:
//   - a gate's pressed choice carrying `handoff: true` (the caller built the
//     choice list from the record's own shape), or
//   - the spec's resolved `dismissal`, which a def declares as a function of
//     the view and therefore of the outcome its own logic produced.
// A choice that exists wins outright: pressing "not now" on a window whose
// spec-level dismissal says 'handoff' must not hand off.
function actionWindowHandsOff(spec, reason) {
  const choices = (spec && spec.choices) || null;
  if (choices && choices.length) {
    const chosen = choices.find(c => c && c.id === reason);
    return !!(chosen && chosen.handoff);
  }
  return spec && spec.dismissal === 'handoff';
}

// D1: the ONLY way out. Called from the overlay tap, the Continue button, a
// gate's choice buttons and the key handler — never from a timer. (The timer
// below runs AFTER the window is already dismissed and resolved; it ends an
// animation, it does not end a window.)
//
// D6: a handoff is still a tap. What it changes is only the shape of the
// close — the overlay cross-fades out instead of vanishing, and the promise
// resolves at the START of that fade so the caller's conversation opens INTO
// the gap rather than after a dead beat. Never an instant dissolve, never
// automatic: something the player pressed is what got us here.
function dismissActionWindow(reason) {
  const s = actionWindowSession;
  if (!s) return;
  // Phase 7 (D15): a dream with panels left does not close on a tap — it
  // turns over. Checked HERE rather than in each of the four callers, so the
  // backdrop, the Continue button, the key handler and any future caller all
  // inherit it and none of them has to know what a dream is. Still a tap, and
  // still the only way anything moves (D1): there is no timer in this file.
  if (actionWindowAdvancesDream(s, reason)) { advanceDreamPanel(s); return; }
  actionWindowSession = null;
  const outReason = reason || 'tap';
  const handoff = actionWindowHandsOff(s.spec, outReason);

  const overlay = typeof document !== 'undefined' ? document.getElementById('action-window-overlay') : null;
  if (overlay) {
    if (s.onClick) overlay.removeEventListener('click', s.onClick);
    if (handoff) {
      // Inert immediately — the fade is decoration, and a backdrop that still
      // swallowed clicks for another 400ms would eat the first thing the
      // player tries to do in the conversation underneath.
      overlay.setAttribute('data-handoff', '');
      setTimeout(() => {
        // Only tidy up OUR overlay: a window opened during the fade owns it now.
        if (actionWindowSession) return;
        overlay.removeAttribute('data-handoff');
        overlay.setAttribute('hidden', '');
      }, ACTION_WINDOW_HANDOFF_MS);
    } else {
      overlay.setAttribute('hidden', '');
    }
  }
  if (s.onKey && typeof document !== 'undefined') document.removeEventListener('keydown', s.onKey, true);

  if (s.wasRunning && typeof resumeClockLoop === 'function') resumeClockLoop();
  s.resolve(outReason);
}

// The image half — through image.js's cache, never generateImage directly
// (Design invariant 3). The window is already up and readable while this
// runs; a dismissal mid-generation just drops the result on the floor (the
// cache keeps the blob, so the next occurrence of an archetype verb still
// gets it for free).
async function loadActionWindowImage(s, gs) {
  let result = null;
  try {
    result = await getActionWindowImage(gs, s.spec.image);
  } catch (e) {
    console.warn('Action window image failed:', e.message);
  }
  if (actionWindowSession !== s) return; // dismissed while generating
  s.generating = false;
  if (result && result.url) {
    s.imageUrl = result.url;
    s.imageKey = result.key;
    s.imagePrompt = result.prompt || null;
  } else {
    s.imageError = (result && result.error) || 'no frame';
  }
  renderActionWindow(s);
}

// The cutout half (Phase 3, D24). Same contract as loadActionWindowImage —
// through image.js's cache, never generateImage directly — but the cache is
// the CUTOUT cache, keyed on (identity, pose, expression, outfit). That key
// is why a per-NPC ask is affordable: the frame is generated the first time a
// given person asks and reused for every occasion after, so "an image per NPC
// who arrives" costs one generation per housemate for the life of the save,
// not one per meal.
async function loadActionWindowCutout(s, gs) {
  let result = null;
  const npcId = s.spec.cutout && s.spec.cutout.npcId;
  const npc = npcId && gs && gs.npcs ? gs.npcs[npcId] : null;
  try {
    if (npc && typeof getCharacterCutout === 'function') {
      result = await getCharacterCutout(
        npc,
        s.spec.cutout.pose || 'standing',
        s.spec.cutout.expression || 'talking',
      );
    }
  } catch (e) {
    console.warn('Action window cutout failed:', e.message);
  }
  if (actionWindowSession !== s) return; // dismissed while generating
  s.generating = false;
  if (result && result.url) {
    s.imageUrl = result.url;
    s.imageKey = result.key;
    s.isCutout = true;
  } else {
    // A missing cutout collapses the frame exactly the way a missing scene
    // does. The question is still legible and the answer is still required —
    // the picture was never the question.
    s.imageError = (result && result.error) || 'no cutout';
  }
  renderActionWindow(s);
}

// --- Projection ------------------------------------------------------------
// Paints `s` onto the overlay. Reads nothing but `s`; decides nothing.
function renderActionWindow(s) {
  if (typeof document === 'undefined' || !document || !s) return;
  const overlay = document.getElementById('action-window-overlay');
  if (!overlay) return;
  const spec = s.spec;
  overlay.removeAttribute('hidden');
  // A hold (peek/listen) or the wardrobe picker render their own content in
  // #peek-content/#wardrobe-content; every other body kind must never leak
  // either one over it.
  awHide('peek-content');
  awHide('wardrobe-content');
  // The dream's panel dots, hidden HERE rather than in each body branch: the
  // picker returns before reaching any shared hide, so a picker opened after
  // a dream would otherwise paint the last dream's dots over its slot list.
  awHide('aw-dream-dots');
  // A window that opens while a previous one is still fading out (a gate
  // queued behind a handoff) must not inherit the fade.
  overlay.removeAttribute('data-handoff');
  overlay.setAttribute('data-tier', spec.tier);
  overlay.setAttribute('data-trigger', spec.trigger || 'player');
  // Read by CSS for bodies that need a wider stage than the default outcome
  // card (currently just wardrobe's two-column picker) — the same purpose
  // data-tier/data-cutout already serve.
  overlay.setAttribute('data-body', spec.body || '');

  const heading = document.getElementById('aw-heading');
  if (heading) heading.textContent = spec.heading || '';

  // Phase 5 (D8): a scheduling picker replaces the standard body with its own
  // slot list (render.js hands the windows in precomputed). It is a question
  // (which time?), not a report — so no frame, no narration, no delta strip,
  // no Continue; the backdrop/Escape are Cancel. The body branch must also be the
  // one place that HIDES #aw-picker, so a later outcome never leaks the last
  // picker's rows over it.
  if (spec.body === 'picker') {
    awHide('aw-frame'); awHide('aw-narration'); awHide('aw-deltas');
    awHide('aw-choices'); awHide('aw-continue-btn');
    const picker = document.getElementById('aw-picker');
    if (picker) {
      picker.innerHTML = '';
      picker.removeAttribute('hidden');
      const list = document.createElement('div');
      list.className = 'aw-pick-list';
      const slots = spec.pickerSlots || [];
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-block aw-pick-btn';
        btn.addEventListener('click', (e) => { e.stopPropagation(); dismissActionWindow('slot:' + i); });
        const name = document.createElement('span');
        name.className = 'aw-pick-name';
        name.textContent = slot.label || '';
        const meta = document.createElement('span');
        meta.className = 'aw-pick-meta';
        meta.textContent = slot.sublabel || '';
        btn.append(name, meta);
        list.appendChild(btn);
      }
      if (list.childElementCount === 0) {
        const none = document.createElement('p');
        none.className = 'dim';
        none.textContent = 'No free windows to schedule right now.';
        list.appendChild(none);
      }
      picker.appendChild(list);
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn-secondary aw-pick-cancel';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', (e) => { e.stopPropagation(); dismissActionWindow('cancel'); });
      picker.appendChild(cancel);
    }
    return;
  }
  awHide('aw-picker');

  // Wardrobe's Tier D wrap (D2, action-outcome-window-plan audit finding
  // #9): a change-outfit session paints its own two-column picker into
  // #wardrobe-content — render.js's renderWardrobePanel and the click
  // handlers it wires per-row, none of which this file touches or knows the
  // shape of (Design invariant 1). This is the projection half only: show
  // the container, hide everything an outcome/gate/picker would show, and
  // stop. render.js's openWardrobePanel calls renderWardrobePanel itself
  // right after opening (it has the `gs` this function does not), and every
  // slot/item/apply click re-renders through that same function directly —
  // this branch runs once per open, not once per click inside it.
  if (spec.body === 'wardrobe') {
    awHide('aw-frame'); awHide('aw-narration'); awHide('aw-deltas');
    awHide('aw-choices'); awHide('aw-continue-btn');
    awShow('wardrobe-content');
    return;
  }

  // Dream Engine Phase 7 (D3/D13/D15): ONE panel of a dream. A frame, the
  // panel's own prose, and a dot per beat — and deliberately nothing else. No
  // delta strip and no time chip (D13): the strip would be empty, and an empty
  // strip under a dream reads as "nothing happened", which is a claim about a
  // dream that this engine is not allowed to make. The one number a dream does
  // move is the wake tint, and it is applied on WAKING (dreams.js), after the
  // last panel, rather than as a receipt for having looked at a picture.
  //
  // Re-entered on every advance, so it reads the cursor and holds no state of
  // its own. Everything it paints was frozen onto the record before the player
  // clicked anything.
  if (spec.body === 'dream') {
    awHide('aw-deltas'); awHide('aw-choices');
    const dream = spec.dream || {};
    const panels = dream.panels || [];
    const i = Math.min(Math.max(0, s.panelIndex), Math.max(0, panels.length - 1));
    const panel = panels[i] || {};
    const resolved = s.dreamPanels[i] || null;

    const dreamFrame = document.getElementById('aw-frame');
    if (dreamFrame) {
      dreamFrame.removeAttribute('data-cutout');
      // A panel whose picture could not be reconstituted collapses its frame
      // rather than leaving an empty box, exactly as a failed outcome frame
      // does. The prose is still the dream; the picture was never the dream.
      if (resolved && resolved.error) dreamFrame.setAttribute('hidden', '');
      else dreamFrame.removeAttribute('hidden');
    }

    const dreamShimmer = document.getElementById('aw-shimmer');
    if (dreamShimmer) {
      if (s.generating) dreamShimmer.removeAttribute('hidden');
      else dreamShimmer.setAttribute('hidden', '');
    }

    const dreamImg = document.getElementById('aw-img');
    if (dreamImg) {
      if (resolved && resolved.url) {
        if (dreamImg.src !== resolved.url) {
          dreamImg.src = resolved.url;
          if (typeof setImageMeta === 'function' && resolved.prompt) {
            setImageMeta(dreamImg, {
              label: spec.heading || 'Dream',
              prompt: resolved.prompt,
              // The RECORD'S frozen seed, not a hash of the cache key (D40) —
              // the number that would actually reproduce this picture, on this
              // device or any other.
              seed: panel.seed != null ? panel.seed : null,
              negativePrompt: (typeof IMAGE_NEGATIVE !== 'undefined' && IMAGE_NEGATIVE.dream) || null,
            });
          }
        }
        dreamImg.removeAttribute('hidden');
      } else {
        // The <img> is shared across every window, so it still holds the
        // PREVIOUS panel's blob until this one resolves. Hiding it means an
        // unresolved panel shows the dark lens and the shimmer instead of the
        // beat the player already read.
        dreamImg.setAttribute('hidden', '');
      }
    }

    const dreamText = document.getElementById('aw-narration');
    if (dreamText) {
      // Read off the record verbatim, NOT through sentence(): a panel is
      // already several finished sentences (D35's bounds), and the templated
      // fallback sentence-cases every one of its own (D34(b)).
      dreamText.textContent = panel.text || '';
      dreamText.removeAttribute('hidden');
    }

    const dots = document.getElementById('aw-dream-dots');
    if (dots) {
      dots.innerHTML = '';
      // A single-panel dream — which is every nap dream (D16) — has nothing to
      // count, and a lone dot would read as a broken control.
      if (panels.length > 1) {
        dots.removeAttribute('hidden');
        for (let n = 0; n < panels.length; n++) {
          const dot = document.createElement('span');
          dot.className = 'aw-dream-dot';
          if (n === i) dot.setAttribute('data-on', '');
          dots.appendChild(dot);
        }
      }
    }

    const dreamBtn = document.getElementById('aw-continue-btn');
    if (dreamBtn) {
      dreamBtn.removeAttribute('hidden');
      // The label is the honest description of what the tap does. Both taps
      // land in dismissActionWindow; only that function knows which one closes.
      dreamBtn.textContent = i < panels.length - 1 ? 'Continue' : 'Wake up';
      awWireContinue(dreamBtn);
    }
    return;
  }

  const narration = document.getElementById('aw-narration');
  if (narration) {
    narration.textContent = typeof sentence === 'function' ? sentence(spec.narration) : spec.narration;
    // Every branch above HIDES this element (the picker, the wardrobe and the
    // dream all paint their own body), and only this line brings it back. Found
    // during Phase 7's live pass, on an outcome window opened after a body that
    // had hidden it: the narration was written and invisible.
    narration.removeAttribute('hidden');
  }

  const frame = document.getElementById('aw-frame');
  if (frame) {
    // Tier B has no frame at all; a Tier C frame whose generation failed
    // collapses too rather than leaving an empty box (the narration and the
    // strip are still the outcome — the image was never the outcome). A
    // cutout frame follows the identical rule.
    if ((spec.image || spec.cutout) && !s.imageError) frame.removeAttribute('hidden');
    else frame.setAttribute('hidden', '');
    // A cutout is a person on a transparent background, not a scene: it must
    // be contained rather than cover-cropped, or the ask beat shows someone's
    // midriff. One attribute, because the difference is entirely presentational.
    if (s.isCutout) frame.setAttribute('data-cutout', '');
    else frame.removeAttribute('data-cutout');
  }

  const shimmer = document.getElementById('aw-shimmer');
  if (shimmer) {
    if (s.generating) shimmer.removeAttribute('hidden');
    else shimmer.setAttribute('hidden', '');
  }

  const img = document.getElementById('aw-img');
  if (img) {
    if (s.imageUrl) {
      if (img.src !== s.imageUrl) {
        img.src = s.imageUrl;
        // The same floating info affordance every other generated surface
        // carries — the window is not a special case.
        if (typeof setImageMeta === 'function' && s.imagePrompt) {
          setImageMeta(img, {
            label: spec.heading || 'Outcome',
            prompt: s.imagePrompt,
            seed: null,
            negativePrompt: (typeof IMAGE_NEGATIVE !== 'undefined' && IMAGE_NEGATIVE.actionWindow) || null,
          });
        }
      }
      img.removeAttribute('hidden');
    } else {
      // The <img> is a shared element across every window, so it still holds
      // the LAST window's blob until this one's frame arrives. Hiding it
      // means a generating window shows its own dark lens and shimmer
      // instead of flashing the previous action's picture — which read as
      // "here is your outcome" for as long as generation took.
      img.setAttribute('hidden', '');
    }
  }

  const strip = document.getElementById('aw-deltas');
  if (strip) {
    strip.innerHTML = '';
    // Same as the narration above: the picker, the wardrobe and the dream all
    // hide the strip, and this is the only place that shows it again. Without
    // it, the first outcome window after any of them paints its chips into a
    // hidden element and reports "nothing changed" by saying nothing at all.
    strip.removeAttribute('hidden');
    for (const row of spec.deltas || []) strip.appendChild(actionWindowChip(row));
    if (spec.minutes > 0) {
      strip.appendChild(actionWindowChip({
        kind: 'time', glyph: '🕘', label: 'Time', value: `${spec.minutes} min`, tone: 'flat',
      }));
    }
    // "Nothing else changed" is an answer about an action that ran. A D7 gate
    // has not run anything — it is asking — so it says nothing rather than
    // claiming a null result for a moment that has not resolved yet.
    if (strip.childElementCount === 0 && spec.trigger !== 'world') {
      const none = document.createElement('span');
      none.className = 'aw-delta-empty';
      none.textContent = 'Nothing else changed.';
      strip.appendChild(none);
    }
  }

  // D7: choices replace Continue, they do not sit beside it — a gate with a
  // Continue button would be offering a third answer nobody defined.
  const choices = (spec.choices && spec.choices.length) ? spec.choices : null;
  const btn = document.getElementById('aw-continue-btn');
  if (btn) {
    if (choices) btn.setAttribute('hidden', '');
    else btn.removeAttribute('hidden');
    // Said explicitly, because the button is shared and the dream body
    // relabels it per panel (Phase 7). Without this, the first outcome window
    // after a dream would offer to "Wake up" from a shower.
    btn.textContent = 'Continue';
    awWireContinue(btn);
  }

  const row = document.getElementById('aw-choices');
  if (row) {
    row.innerHTML = '';
    if (choices) {
      row.removeAttribute('hidden');
      for (const c of choices) row.appendChild(actionWindowChoiceButton(c));
    } else {
      row.setAttribute('hidden', '');
    }
  }
}

// The Continue button's one click handler, wired once for the life of the
// page. Shared between the outcome body and the dream body (Phase 7) because
// both of them press the same element, and a second addEventListener on it
// would dismiss the window twice — harmless today only because
// dismissActionWindow returns on a null session.
function awWireContinue(btn) {
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', (e) => { e.stopPropagation(); dismissActionWindow('tap'); });
}

// One gate answer. `tone` only picks the button's existing look; what the
// answer MEANS is the caller's, and arrives back to them as the id.
function actionWindowChoiceButton(choice) {
  const b = document.createElement('button');
  b.className = `btn ${choice.tone === 'quiet' ? 'btn-secondary' : 'btn-primary'} aw-choice`;
  b.textContent = choice.label || choice.id;
  b.setAttribute('data-choice', choice.id);
  b.addEventListener('click', (e) => { e.stopPropagation(); dismissActionWindow(choice.id); });
  return b;
}

// One delta chip, shaped after the scene reader's moodle strip (.sr-moodle):
// glyph, label, value, and a tone attribute the CSS colors.
function actionWindowChip(row) {
  const el = document.createElement('span');
  el.className = 'aw-delta';
  el.setAttribute('data-kind', row.kind || 'other');
  el.setAttribute('data-tone', row.tone || 'flat');
  const g = document.createElement('span');
  g.className = 'aw-delta-glyph';
  g.textContent = row.glyph || '•';
  el.appendChild(g);
  const l = document.createElement('span');
  l.className = 'aw-delta-label';
  l.textContent = row.label || '';
  el.appendChild(l);
  if (row.value) {
    const v = document.createElement('span');
    v.className = 'aw-delta-value';
    v.textContent = row.value;
    el.appendChild(v);
  }
  return el;
}

// --- Peek/listen hold (Phase 4, D18) ------------------------------------
// The timed keyhole/listen hold renders INSIDE the action window's chrome: peek
// is a Tier D hold (live, real-time) whose risk ramp, caught roll and outcome
// resolution stay in peek.js UNTOUCHED — only the projection moves here
// (peek.js's renderPeekOverlay is gone). Two differences from every other
// window, both because a hold is LIVE rather than a finished outcome:
//   - it must NOT pause the clock (the hold IS the game running — D7's "the
//     scene can change mid-peek" comes from the clock's own checkpoints), so
//     this path never touches pauseClockLoop/resumeClockLoop.
//   - it is neither a question nor a report, so it gets no backdrop/Escape
//     dismiss and no promise: the hold ends only through peek.js's
//     stopPeekSession (Stop button / Escape), which calls closeActionWindow.
// The keyhole mask, vignette and risk meter are peek's CONTENT (D18), not
// shared chrome — they live in #peek-content inside the frame and are painted
// from peek.js's session object, never decided here.
function openPeekHold(gs, s) {
  if (typeof document === 'undefined' || !document || !s) return;
  const overlay = document.getElementById('action-window-overlay');
  if (!overlay) return;
  const content = document.getElementById('peek-content');
  if (content) content.setAttribute('data-mode', s.mode);
  overlay.removeAttribute('hidden');
  awShow('peek-content');
  awHide('aw-frame'); awHide('aw-narration'); awHide('aw-deltas');
  awHide('aw-choices'); awHide('aw-continue-btn');
  renderPeekHold(gs, s);
}

function updatePeekHold(gs, s) {
  renderPeekHold(gs, s);
}

// The hold's per-tick repaint — the lens, its caption, and the risk meter
// moving while the page stays still. Reads nothing but `s`; decides nothing.
function renderPeekHold(gs, s) {
  if (typeof document === 'undefined' || !document || !s) return;
  const heading = document.getElementById('aw-heading');
  if (heading) heading.textContent = s.mode === 'peek' ? 'Peeking' : 'Listening';
  const caption = document.getElementById('peek-caption');
  if (caption) {
    const line = s._viewLine || (s.mode === 'peek'
      ? 'You peer through the keyhole…' : 'You listen at the door…');
    caption.textContent = (typeof sentence === 'function') ? sentence(line) : line;
  }
  const meta = document.getElementById('peek-meta');
  if (meta) {
    const secs = Math.round(s.ticksElapsed * PEEK.realTickMs / 1000);
    meta.textContent = `held for ${secs}s`;
  }
  const riskFill = document.getElementById('peek-risk-fill');
  if (riskFill) {
    const bucket = Math.round(Math.max(0, Math.min(1, s.riskAccum / PEEK.maxRisk)) * 100 / 5) * 5;
    riskFill.setAttribute('data-fill', bucket);
  }
  const stopBtn = document.getElementById('peek-stop-btn');
  if (stopBtn) stopBtn.textContent = s.mode === 'peek' ? 'Stop Watching' : 'Stop Listening';
}

// The hold is NOT an action window (no promise, no clock pause), so it gets
// its own close — the inverse of openPeekHold. peek.js calls this when the
// hold ends for ANY reason; it resolves nothing and touches no clock.
function closeActionWindow() {
  if (typeof document === 'undefined' || !document) return;
  const overlay = document.getElementById('action-window-overlay');
  if (overlay) overlay.setAttribute('hidden', '');
  awHide('peek-content');
}

// ===== /SECTION: ACTION OUTCOME WINDOW =====
