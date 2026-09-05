// ===== SECTION: RENDER.NIGHTSCENE (night-scene-sleeping-npc-plan Phase 3b) =====
// The Living Tableau's PAINTER (D15). Same hard rules as RENDER and
// RENDER.COMPUTER: idempotent, no state mutation, no rolls, no direct kv
// access. Everything below reads nightViewModel(gs, s) — one pure call in
// nightscene.js — and paints it. If a decision ever appears in this file it is
// in the wrong file; nightscene.js is the decider, this is the projection,
// which is peek.js's split with the file roles arranged the way
// spritestudio.js / render.spritestudio.js arrange them.
//
// A separate file rather than more of actionwindow.js, whose stated purpose is
// "the reusable outcome pane": the night scene is neither an outcome nor a
// question, it is a LIVE session like the peek hold, and it is an order of
// magnitude more chrome than that hold. actionwindow.js keeps exactly two
// lines about it — the awHide that stops a later window leaking this content
// over itself, which is the rule every body kind there obeys.
//
// TWO THINGS A LATER SESSION WILL BE TEMPTED TO BREAK:
//   - NO HARDCODED COLOURS. The artboards this was drawn from
//     (ref/wip/night-scene-ui-mockups/) are hex all the way down, which was
//     right for an artboard and is wrong here: the game ships 14 themes that
//     override the :root token block, so an inline #232342 looks correct in
//     `midnight` and broken in the other thirteen. Every colour below is a
//     token; the mapping back is in that folder's README.
//   - THE BACKDROP IS NOT A DISMISS TARGET. .aw-overlay's D1 rule is that a
//     tap anywhere closes the window. A live session is not a report, so
//     data-body="night" turns that off in CSS and nightscene.js's delegated
//     handler stops propagation on every control.

// One overlay tree, rebuilt per repaint. Every control carries data-night
// (what it is) and data-value (which one), and nightscene.js's single
// delegated listener reads them — so the painter can throw the whole tray away
// on every tap without ever re-wiring a handler.
function nightEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function nightBtn(cls, text, kind, value, on) {
  const b = nightEl('button', cls, text);
  b.type = 'button';
  b.setAttribute('data-night', kind);
  if (value != null) b.setAttribute('data-value', value);
  if (on) b.setAttribute('data-on', '');
  return b;
}

// The overlay's own open. It deliberately does NOT go through
// openActionWindow: that pauses the clock and hands back a promise for an
// answer, and D24 says this scene runs LIVE at one game-second per real
// second with no answer to give. openPeekHold is the precedent — same chrome,
// same "show my content, hide every outcome part", no clock touch.
function openNightOverlay(gs, s) {
  if (typeof document === 'undefined' || !document || !s) return;
  const overlay = document.getElementById('action-window-overlay');
  if (!overlay) return;
  overlay.removeAttribute('hidden');
  overlay.removeAttribute('data-handoff');
  overlay.setAttribute('data-body', 'night');
  overlay.setAttribute('data-tier', 'D');
  overlay.setAttribute('data-trigger', 'player');
  if (typeof awShow === 'function') awShow('night-content');
  if (typeof awHide === 'function') {
    awHide('aw-heading'); awHide('aw-frame'); awHide('aw-narration');
    awHide('aw-deltas'); awHide('aw-choices'); awHide('aw-continue-btn');
    awHide('aw-picker'); awHide('peek-content'); awHide('wardrobe-content');
    awHide('aw-dream-dots');
  }
  renderNightScene(gs, s);
}

function closeNightOverlay() {
  if (typeof document === 'undefined' || !document) return;
  const overlay = document.getElementById('action-window-overlay');
  if (overlay) {
    overlay.setAttribute('hidden', '');
    overlay.removeAttribute('data-body');
  }
  const content = document.getElementById('night-content');
  if (content) {
    content.setAttribute('hidden', '');
    content.removeAttribute('data-tray');
    content.removeAttribute('data-ended');
  }
  const heading = document.getElementById('aw-heading');
  if (heading) heading.removeAttribute('hidden');
}

function renderNightScene(gs, s) {
  if (typeof document === 'undefined' || !document || !gs || !s) return;
  const content = document.getElementById('night-content');
  if (!content) return;
  const vm = nightViewModel(gs, s);
  if (!vm) return;

  content.removeAttribute('hidden');
  // Phone only: the tray rides as a sheet over a dimmed frame, raised by
  // "Change…". Desktop ignores the attribute entirely — D15's "the same
  // anatomy at both widths; mobile is not a reduced desktop" is one DOM tree
  // with two arrangements, never two trees.
  if (vm.trayOpen) content.setAttribute('data-tray', 'open');
  else content.removeAttribute('data-tray');
  if (vm.ended) content.setAttribute('data-ended', vm.endOutcome || 'exit');
  else content.removeAttribute('data-ended');

  nightPaintBars(vm);
  renderNightFrame(vm);
  nightPaintPanel(vm);
  nightPaintCompact(vm);
  nightPaintConfirm(vm);
  // Handed back so nightscene.js's repaint can fire D20's speculative fan-out
  // against the motion chips that were actually just painted, without building
  // a second view model to find out what they were.
  return vm;
}

// D26: Wakefulness is the current, drainable number with Stirring drawn as a
// deeper band INSIDE the same track — never a second bar. Heat is its own bar
// and is never coloured or worded as a danger; D38 fills it on the within-
// cycle position and hangs one pip per climax off the end.
function nightPaintBars(vm) {
  const host = document.getElementById('night-bars');
  if (!host) return;
  host.innerHTML = '';
  const b = vm.bars;
  if (!b) return;

  const wake = nightEl('div', 'night-bar');
  wake.setAttribute('data-meter', 'wake');
  wake.append(nightEl('span', 'night-bar-label', 'Wakefulness'));
  const wakeTrack = nightEl('div', 'night-track');
  const wakeFill = nightEl('div', 'night-fill');
  wakeFill.setAttribute('data-fill', 'wake');
  wakeFill.style.width = `${b.wakePct}%`;
  const stirBand = nightEl('div', 'night-band');
  stirBand.style.width = `${b.stirPct}%`;
  const stirTick = nightEl('div', 'night-tick');
  stirTick.setAttribute('data-tick', 'stir');
  stirTick.style.left = `${b.stirPct}%`;
  wakeTrack.append(wakeFill, stirBand, stirTick);
  wake.append(wakeTrack,
    nightEl('span', 'night-bar-value', String(b.wake)),
    nightEl('span', 'night-bar-sub', `stirring ${b.stir}`));

  const heat = nightEl('div', 'night-bar');
  heat.setAttribute('data-meter', 'heat');
  heat.append(nightEl('span', 'night-bar-label', 'Heat'));
  const heatTrack = nightEl('div', 'night-track');
  const heatFill = nightEl('div', 'night-fill');
  heatFill.setAttribute('data-fill', 'heat');
  heatFill.style.width = `${b.heatPct}%`;
  heatTrack.append(heatFill);
  // D29's per-NPC willing/hostile bar, drawn only inside the first cycle —
  // past a climax the threshold reads absolute heat and is already met, so a
  // tick there would mark a line that cannot be crossed again. Invariant 4:
  // the player is never a silent die roll away from a character's feelings,
  // and this is that roll's absence made visible.
  if (b.thresholdPct != null) {
    const tick = nightEl('div', 'night-tick');
    tick.setAttribute('data-tick', 'willing');
    tick.style.left = `${b.thresholdPct}%`;
    tick.title = `${vm.copy.willingTick} (${b.threshold})`;
    heatTrack.append(tick);
  }
  heat.append(heatTrack, nightEl('span', 'night-bar-value', String(b.heat)));
  if (b.climaxCount > 0) {
    const pips = nightEl('span', 'night-pips');
    pips.title = `${b.climaxCount} climax${b.climaxCount === 1 ? '' : 'es'}`;
    for (let i = 0; i < b.climaxCount; i++) pips.append(nightEl('span', 'night-pip'));
    heat.append(pips);
  }

  host.append(wake, heat);
}

// The tableau itself (D18/D19/D20/D21). One frame per (state x action),
// ASPECT-LOCKED to the picture it holds: `data-shape` picks the same box the
// frame was generated for, so `object-fit: contain` produces neither a crop
// nor a letterbox. `object-fit: cover` is BANNED on this surface (D19) — it is
// the one line in the stylesheet a later session must not "helpfully" add.
//
// Until the first action there is no frame at all, and the plate carries the
// one thing the player cannot plan without: which node of D34's pose graph she
// is on and what is over her. The plate is also what shows through while a
// frame is generating, behind the shimmer — a tap has already resolved by
// then (design invariant 3), so this is a picture catching up, never a wait.
//
// Exported under its own name because nightscene.js repaints THIS ALONE when a
// frame lands: rebuilding the tray under the player's thumb because a
// generation finished is a different bug.
function renderNightFrame(vm) {
  if (typeof document === 'undefined' || !document || !vm) return;
  const frame = document.getElementById('night-frame');
  const img = document.getElementById('night-img');
  const plate = document.getElementById('night-plate');
  const shimmer = document.getElementById('night-shimmer');
  const url = vm.frame && vm.frame.url;

  if (frame) frame.setAttribute('data-shape', vm.frameShape || 'landscape');
  if (img) {
    if (url) {
      if (img.src !== url) {
        img.src = url;
        // The same floating ⓘ every other generated surface in the game
        // carries (D21) — the night scene is not a special case. Regenerate
        // overwrites the SAME session key, so a frame the player rejected is
        // revoked and never shown again.
        if (typeof setImageMeta === 'function') {
          setImageMeta(img, {
            label: 'Night Scene',
            prompt: vm.frame.prompt || '',
            seed: vm.frame.seed != null ? vm.frame.seed : null,
            negativePrompt: vm.frame.negativePrompt || null,
            reroll: (fields) => nightRerollFrame(fields),
          });
        }
      }
      img.removeAttribute('hidden');
    } else {
      // The <img> outlives any one frame, so it still holds the last action's
      // picture until this one arrives. Hiding it means a generating frame
      // shows its own dark ground and shimmer instead of leaving the previous
      // act on screen as though it were this one.
      img.setAttribute('hidden', '');
      img.removeAttribute('src');
    }
  }
  if (frame) {
    if (url) frame.setAttribute('data-has-image', '');
    else frame.removeAttribute('data-has-image');
  }
  if (shimmer) {
    if (vm.frameGenerating) shimmer.removeAttribute('hidden');
    else shimmer.setAttribute('hidden', '');
  }
  if (plate) plate.textContent = url ? '' : vm.stateLine;
  const line = document.getElementById('night-line-frame');
  if (line) line.textContent = vm.narration;
  // D14/D38's beat. It hangs off the FRAME rather than off either narration
  // element because desktop reads its line from the panel and the phone reads
  // it from the scrim — the frame is the one surface both arrangements share.
  // Purely positive and never a wake trigger: it marks the repaint after the
  // crossing and is gone on the next action.
  const climax = document.getElementById('night-climax');
  if (climax) {
    if (vm.climax) {
      climax.textContent = vm.climaxCount > 1 ? vm.copy.climaxAgain : vm.copy.climax;
      climax.removeAttribute('hidden');
    } else {
      climax.setAttribute('hidden', '');
      climax.textContent = '';
    }
  }
  renderNightClock(vm);
}

// D24 made time a real cost, so the scene shows it being spent. One element,
// repainted by nightscene.js's own one-second loop, which READS the clock TIME
// already runs and never advances it.
function renderNightClock(vm) {
  if (typeof document === 'undefined' || !document || !vm) return;
  const el = document.getElementById('night-clock');
  if (el) el.textContent = vm.elapsed || '';
}

function nightPaintPanel(vm) {
  const panel = document.getElementById('night-panel');
  if (!panel) return;
  panel.innerHTML = '';

  if (vm.ended) { panel.append(nightEndBlock(vm)); return; }

  // --- the narration row: D32's two halves, plus what is outstanding
  const narrationRow = nightEl('div', 'night-narration-row');
  narrationRow.append(nightEl('p', 'night-line', vm.narration
    || `${vm.name} ${vm.copy.asleep} ${vm.stateLine}.`));
  // Phase 6: the shadow layer's receipt sits HERE and not in the footer,
  // because the footer names the player's own last action and offers to
  // repeat it — and a door closing down the hall is neither.
  if (vm.cue) {
    const cueChips = nightEl('div', 'night-deltas night-cue-deltas');
    for (const d of vm.cue.deltas) {
      const chip = nightEl('span', 'night-delta', d.label);
      chip.setAttribute('data-tone', d.tone);
      cueChips.append(chip);
    }
    narrationRow.append(cueChips);
  }
  if (vm.evidence.length) {
    const chips = nightEl('div', 'night-evidence');
    for (const e of vm.evidence) chips.append(nightEl('span', 'night-evidence-chip', e.label));
    narrationRow.append(chips);
  }
  panel.append(narrationRow);

  // --- D16 slot 1a: the region tabs. Move and Cleanup are pushed to the far
  //     end because they bracket the pleasure regions: Move opens access up,
  //     Cleanup closes evidence down, and neither is a touch.
  const tabs = nightEl('div', 'night-tabs');
  for (const r of vm.palette.regions) {
    const key = nightRegionKey(r.regionId, r.instance);
    const count = r.kind === 'cleanup' ? ` · ${r.parts.length}` : '';
    const tab = nightBtn('night-tab', `${r.label}${count}`, 'region', key, vm.sel && vm.sel.regionKey === key);
    tab.setAttribute('data-kind', r.kind);
    tabs.append(tab);
  }
  // Phase 7: the regions she HAS but that are closed right now, drawn dim and
  // inert with the next thing in the way named. D31's rule is that an
  // impossible ACTION is unreachable rather than refused; a whole region
  // silently absent is not that — it is the game hiding part of her body, and
  // it is what made penetration undiscoverable for a real player.
  for (const b of vm.blocked || []) {
    const tab = nightEl('span', 'night-tab night-tab-blocked', b.label);
    tab.setAttribute('data-kind', b.kind);
    tab.setAttribute('data-blocked', b.reason);
    tab.title = b.text;
    tab.append(nightEl('span', 'night-tab-why', b.text));
    tabs.append(tab);
  }
  panel.append(tabs);

  if (!vm.sel) {
    panel.append(nightEl('p', 'night-empty', vm.copy.unreachable));
    panel.append(nightPaceRow(vm, 'night-pace'));
    return;
  }

  const region = nightSelectedRegion(vm.palette, vm.sel);
  const part = nightSelectedPart(vm.palette, vm.sel);

  // --- D16 slot 1b + 2: the part chips and, inline and ONLY for a paired
  //     part, the side toggle.
  const where = nightSlot('Where');
  const partChips = nightEl('div', 'night-chips');
  for (const p of region.parts) {
    const chip = nightBtn('night-chip', p.label, 'part', p.partId, p.partId === vm.sel.partId);
    // D28: discovery is the game, so this is deliberately quiet — a mark, no
    // words, and nothing at all on a part the player has not worked out yet
    // (including one that turns out to be neither loved nor disliked, so an
    // unmarked chip stays ambiguous rather than reading as a confirmed no).
    if (p.known) nightMarkKnown(chip, vm, p.known);
    partChips.append(chip);
  }
  where.append(partChips);
  if (part && part.sides.length > 1) {
    const seg = nightEl('div', 'night-seg');
    for (const side of part.sides) {
      seg.append(nightBtn('night-seg-btn', NIGHT_SIDE_LABELS[side] || side, 'side', side, side === vm.sel.side));
    }
    where.append(nightEl('span', 'night-sep'), seg);
  }
  panel.append(where);

  // --- D16 slot 3: the instrument row, shown only where more than one is
  //     valid (D31 — an impossible action is unreachable, not rejected).
  if (part && part.instruments.length > 1) {
    const withRow = nightSlot('With');
    const instChips = nightEl('div', 'night-chips');
    for (const row of part.instruments) {
      const def = (vm.palette.instruments || []).find(i => i.id === row.instrumentId);
      instChips.append(nightBtn('night-chip', def ? def.label : row.instrumentId,
        'instrument', row.instrumentId, row.instrumentId === vm.sel.instrumentId));
    }
    withRow.append(instChips);
    panel.append(withRow);
  }

  // --- D16 slot 4: the motions, WHICH ARE THE TRIGGER. Rendered left to
  //     right in ascending intensity because D33 makes the row order itself
  //     information: the leftmost verb on any part is the safe approach and
  //     the rightmost has to be earned, which is how the tray teaches D27
  //     without a tutorial. A motion that would overshoot her right now is
  //     drawn dashed — the same read the resolver will make, taken from the
  //     same code path so the chip can never lie about it.
  const how = nightSlot('How', 'accent');
  const motionRow = nightEl('div', 'night-motions');
  for (const m of vm.motions) {
    const chip = nightBtn('night-motion', m.label, 'motion', m.motionId, false);
    if (m.known) nightMarkKnown(chip, vm, m.known);
    if (m.overshoot) chip.setAttribute('data-verdict', 'overshoot');
    if (m.soothe) chip.setAttribute('data-verdict', 'soothe');
    if (vm.lastMotionId === m.motionId) chip.setAttribute('data-last', '');
    motionRow.append(chip);
  }
  motionRow.append(nightEl('span', 'night-order-hint', '← safe · earned →'));
  how.append(motionRow, nightPaceRow(vm, 'night-pace'),
    nightBtn('night-leave', 'Leave', 'leave', null, false));
  panel.append(how);

  // --- the footer: where she is, and what the last action cost.
  const footer = nightEl('div', 'night-footer');
  footer.append(nightEl('span', 'night-state', vm.stateLine));
  footer.append(nightEl('span', 'night-hint', vm.lastLine
    ? `${vm.lastLine} — tap it again to repeat.`
    : `${vm.selectionLine} — tap a motion to do it.`));
  const deltas = nightEl('div', 'night-deltas');
  for (const d of vm.deltas) {
    const chip = nightEl('span', 'night-delta', d.label);
    chip.setAttribute('data-tone', d.tone);
    deltas.append(chip);
  }
  footer.append(deltas);
  panel.append(footer);
}

const NIGHT_SIDE_LABELS = { left: 'Left', right: 'Right', both: 'Both', '-': '' };

// D28's marker, on a part chip or a motion chip. `data-known` carries the
// band so the stylesheet can tone it; the glyph itself is config
// (prefs.knownMark) so this file keeps deciding nothing.
function nightMarkKnown(chip, vm, band) {
  chip.setAttribute('data-known', band);
  const mark = nightEl('span', 'night-known', (vm.knownMarks || {})[band] || '');
  mark.setAttribute('aria-hidden', 'true');
  chip.append(mark);
}

function nightSlot(label, tone) {
  const slot = nightEl('div', 'night-slot');
  const l = nightEl('span', 'night-slot-label', label);
  if (tone) l.setAttribute('data-tone', tone);
  slot.append(l);
  return slot;
}

// The persistent three-position control that modulates EVERY action (D16) —
// the cheapest source of real granularity in the game. Rendered into both the
// desktop How row and the phone's compact bar; the delegated handler does not
// care which one was pressed.
function nightPaceRow(vm, cls) {
  const seg = nightEl('div', cls);
  seg.classList.add('night-seg', 'night-seg-pace');
  for (const id of Object.keys(BOUNDARY.nightScene.pace)) {
    const def = BOUNDARY.nightScene.pace[id];
    const btn = nightBtn('night-seg-btn', def.label, 'pace', id, !!(vm.sel && vm.sel.paceId === id));
    btn.setAttribute('data-pace', id);
    seg.append(btn);
  }
  return seg;
}

// Phone, collapsed (D15's default): the frame IS the screen, and this bar
// carries the current action, the Pace control, Again, Change… and Leave.
// Painted at every width and hidden by CSS on desktop, so there is one DOM
// tree rather than two.
function nightPaintCompact(vm) {
  const host = document.getElementById('night-compact');
  if (!host) return;
  host.innerHTML = '';
  if (vm.ended) return;

  const grab = nightBtn('night-grab', '', 'tray', null, false);
  grab.setAttribute('aria-label', vm.trayOpen ? 'Close the tray' : 'Open the tray');
  grab.append(nightEl('span', 'night-grab-bar'));
  host.append(grab);

  const row = nightEl('div', 'night-compact-row');
  const summary = nightEl('div', 'night-compact-summary');
  summary.append(nightEl('div', 'night-compact-line', vm.lastLine || vm.selectionLine));
  const deltas = nightEl('div', 'night-deltas');
  for (const d of vm.deltas) {
    const chip = nightEl('span', 'night-delta', d.label);
    chip.setAttribute('data-tone', d.tone);
    deltas.append(chip);
  }
  summary.append(deltas);
  row.append(summary, nightPaceRow(vm, 'night-pace-compact'));
  host.append(row);

  const actions = nightEl('div', 'night-compact-actions');
  const again = nightBtn('night-again', 'Again', 'again', null, false);
  // Nothing to repeat yet, or the state moved and the last action is no
  // longer valid (a Move can take the part out of reach). The tray never
  // offers something that cannot happen — that rule holds for Again too.
  if (!vm.canRepeat) again.disabled = true;
  actions.append(again,
    nightBtn('night-change', 'Change…', 'tray', null, !!vm.trayOpen),
    nightBtn('night-leave', 'Leave', 'leave', null, false));
  host.append(actions);
}

// D22: one voluntary exit, confirming only when there is evidence outstanding
// and naming what is about to be left behind. Leaving clean is not a decision
// worth interrupting, so an empty evidence array never reaches this.
function nightPaintConfirm(vm) {
  const host = document.getElementById('night-confirm');
  if (!host) return;
  host.innerHTML = '';
  if (!vm.confirm || !vm.confirm.needed) { host.setAttribute('hidden', ''); return; }
  host.removeAttribute('hidden');
  const card = nightEl('div', 'night-confirm-card');
  card.append(nightEl('p', 'night-confirm-text', vm.confirm.text));
  const row = nightEl('div', 'night-confirm-actions');
  row.append(nightBtn('btn btn-secondary', 'Stay', 'leave-cancel', null, false),
    nightBtn('btn', 'Leave anyway', 'leave-confirm', null, false));
  card.append(row);
  host.append(card);
}

// The end of a session (Phase 5). Every word below comes out of
// nightEndSummary, which reads applyNightSceneEnd's own return — the block
// never re-derives a consequence, so it cannot report one the consequence
// layer did not write. The note says what the resolution LEFT, never what the
// narration already said: composeNightLine's own `woke` pool ends the line
// with her eyes opening, and repeating that here read as a stutter.
function nightEndBlock(vm) {
  const block = nightEl('div', 'night-end');
  const end = vm.end || { heading: 'The moment passes', note: '', rows: [] };
  block.append(nightEl('div', 'night-end-heading', end.heading));
  if (vm.narration) block.append(nightEl('p', 'night-line', vm.narration));
  if (end.note) block.append(nightEl('p', 'night-end-note', end.note));
  // The receipt. One chip per thing the ending actually did — what was left
  // behind, the banked stealth xp, how many times she came — in the same
  // tone vocabulary the in-session delta chips already use, so "risk" reads
  // the same colour here as it does mid-scene.
  if (end.rows && end.rows.length) {
    const rows = nightEl('div', 'night-end-rows');
    for (const r of end.rows) {
      const chip = nightEl('span', 'night-end-chip', r.label);
      chip.setAttribute('data-tone', r.tone);
      rows.append(chip);
    }
    block.append(rows);
  }
  block.append(nightBtn('btn', 'Continue', 'close', null, false));
  return block;
}

// ===== /SECTION: RENDER.NIGHTSCENE =====
