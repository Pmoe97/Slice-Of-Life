// ===== SECTION: RENDER.SPRITESTUDIO =====
// The Sprite Studio's screens. avatars-and-sprite-studio-plan.md, Phase 4.
//
// Same hard rules as RENDER and RENDER.COMPUTER: idempotent, no state
// mutation, no direct kv access. Every asset read goes through resolveSprite
// / resolveAvatar (design invariant 1); the verbs live in spritestudio.js.
//
// A separate file rather than more of render.computer.js, which is already
// ~5,900 lines. COMPUTER_RENDERERS is a plain object literal declared with
// `const` in that file, so a later script can add to it — which is how a new
// app should join now. Loads after it in both index.html and loadgame.js.
//
// D16: the phone gets every asset verb (browse, regenerate, upload, revert,
// link/pin) and NOT the paint canvas. `device` is read the same way
// renderMessages reads it — from the nearest [data-device] ancestor — so one
// renderer serves both surfaces.

function spriteStudioDevice(body) {
  return body.closest('[data-device]')?.getAttribute('data-device') || 'computer';
}

// The async fill pattern this codebase already uses for image tiles: build
// the node synchronously with a placeholder, swap the art in when it lands,
// and check the node is still connected first because a re-render may have
// replaced it.
function spriteFillTile(tile, promise, onEmpty) {
  promise.then((res) => {
    if (!tile.isConnected) return;
    if (res && res.url) {
      const img = document.createElement('img');
      img.className = 'sps-cell-img';
      img.alt = '';
      img.src = res.url;
      tile.appendChild(img);
      tile.setAttribute('data-has-art', '');
    } else if (onEmpty) onEmpty(tile);
  }).catch(() => { if (onEmpty && tile.isConnected) onEmpty(tile); });
}

function spriteStudioHeader(body, gs, st, title, subtitle) {
  const head = document.createElement('div');
  head.className = 'sps-head';
  const left = document.createElement('div');
  left.style.flex = '1';
  left.style.minWidth = '0';
  left.innerHTML = `<div class="sps-title">${escapeHtml(title)}</div>`
    + (subtitle ? `<div class="dim tiny">${escapeHtml(subtitle)}</div>` : '');
  head.appendChild(left);

  // D7's meter. Straight off the index — no blob reads, so this is free to
  // draw on every pass.
  const usage = spriteStoreUsage();
  const meter = document.createElement('div');
  meter.className = 'sps-usage';
  const mb = (n) => `${(n / (1024 * 1024)).toFixed(1)} MB`;
  meter.innerHTML = `<div class="tiny dim">${usage.slots} of ${usage.maxSlots} slots · ${mb(usage.bytes)} of ${mb(usage.softByteBudget)}</div>`
    + `<div class="sps-meter"${usage.byteFrac > 0.8 ? ' data-warn=""' : ''}><i style="width:${Math.min(100, Math.round(Math.max(usage.slotFrac, usage.byteFrac) * 100))}%"></i></div>`;
  head.appendChild(meter);
  body.appendChild(head);

  if (st && st.notice) {
    const note = document.createElement('div');
    note.className = 'sps-notice';
    note.setAttribute('data-tone', st.notice.tone || 'info');
    note.textContent = st.notice.text;
    body.appendChild(note);
  }
}

// --- Roster ----------------------------------------------------------------

function renderSpritesRoster(body, gs, app, screen) {
  const st = spriteStudioState(gs);
  if (!st) return;
  const rows = spriteStudioRoster(gs);
  const shown = rows.filter((r) => spriteStudioFilterRow(gs, r, st.filter));

  spriteStudioHeader(body, gs, st, 'Cast',
    `${rows.length} character${rows.length === 1 ? '' : 's'} · ${rows.filter((r) => r.rank <= 2).length} in the household`);

  const counts = {
    all: rows.length,
    household: rows.filter((r) => spriteStudioFilterRow(gs, r, 'household')).length,
    custom: rows.filter((r) => spriteStudioFilterRow(gs, r, 'custom')).length,
    none: rows.filter((r) => spriteStudioFilterRow(gs, r, 'none')).length,
    broken: rows.filter((r) => spriteStudioFilterRow(gs, r, 'broken')).length,
  };
  const chips = document.createElement('div');
  chips.className = 'sps-chips';
  for (const [id, label] of [['all', 'All'], ['household', 'Household'], ['custom', 'Has custom art'], ['none', 'Needs art'], ['broken', 'Broken']]) {
    if (id === 'broken' && counts.broken === 0) continue;
    const b = document.createElement('button');
    b.className = 'sps-chip' + (st.filter === id ? ' is-on' : '');
    b.setAttribute('data-action', 'sprites.filter');
    b.setAttribute('data-row-id', id);
    b.textContent = `${label} ${counts[id]}`;
    chips.appendChild(b);
  }
  body.appendChild(chips);

  if (shown.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dim tiny';
    empty.textContent = 'Nobody matches that filter.';
    body.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'sps-roster';
  for (const row of shown) {
    const r = spriteReadiness(gs, row.identity, row.who, row.isPlayer);
    const card = document.createElement('div');
    card.className = 'sps-card';
    if (r.state === 'broken') card.setAttribute('data-broken', '');
    card.setAttribute('data-action', 'sprites.open-character');
    card.setAttribute('data-row-id', row.id);
    card.innerHTML = avatarChipHtml(row.who, {
      size: 'hero', isPlayer: row.isPlayer, name: row.name,
      ring: row.isPlayer ? 'player' : 'default',
    })
      + `<div class="sps-card-name">${escapeHtml(row.name)}${row.isPlayer ? ' <span class="dim tiny">(you)</span>' : ''}</div>`
      + `<div class="dim tiny">${escapeHtml(row.role)}</div>`
      + `<div class="sps-badge" data-state="${r.state}">${spriteStateLabel(r)}</div>`;
    grid.appendChild(card);
  }
  body.appendChild(grid);

  const foot = document.createElement('div');
  foot.className = 'sps-foot';
  const mode = activeCharacterArt();
  foot.innerHTML = `<div class="tiny dim" style="flex:1">`
    + (mode.id === 'off'
      ? 'Character art is turned off in Settings, so nothing is being drawn. Sprites you have already made are kept.'
      : 'Your household is drawn in the background while the game is idle. Everyone else is drawn the first time you see them.')
    + '</div>';
  body.appendChild(foot);
}

function spriteStateLabel(r) {
  switch (r.state) {
    case 'broken': return `Broken ${r.broken}`;
    case 'custom': return `Custom ${r.customCutouts}`;
    case 'queued': return 'Queued';
    default: return r.avatar === 'none' ? 'No art' : 'Ready';
  }
}

// --- Character sheet -------------------------------------------------------

function renderSpritesCharacter(body, gs, app, screen) {
  const st = spriteStudioState(gs);
  if (!st) return;
  const rows = spriteStudioRoster(gs);
  const row = rows.find((r) => r.id === st.viewingId) || rows.find((r) => r.identity === st.viewingIdentity);
  if (!row) {
    // Stale selection — a character who moved out, or a save that referenced
    // an id that no longer exists. Fall back to the roster rather than a dead
    // screen, exactly as the Character Studio does.
    st.mode = 'roster'; st.viewingId = null; st.viewingIdentity = null;
    renderSpritesRoster(body, gs, app, screen);
    return;
  }
  const device = spriteStudioDevice(body);

  const back = document.createElement('button');
  back.className = 'btn tiny btn-secondary sps-back';
  back.setAttribute('data-action', 'sprites.open-roster');
  back.textContent = '‹ Cast';
  body.appendChild(back);

  spriteStudioHeader(body, gs, st, row.name, row.role);

  const cols = document.createElement('div');
  cols.className = 'sps-cols';
  cols.appendChild(renderSpriteAvatarPanel(gs, st, row, device));
  cols.appendChild(renderSpriteGrid(gs, st, row, device));
  body.appendChild(cols);
}

function renderSpriteAvatarPanel(gs, st, row, device) {
  const panel = document.createElement('div');
  panel.className = 'sps-avatar-panel';

  const slot = spriteSlotId(row.identity, 'avatar', SPRITE_AVATAR_VARIANT);
  const entry = spriteIndexEntry(slot);
  const linked = !entry || entry.mode === 'linked';
  const stateLabel = !entry ? 'Linked · follows the sprite'
    : entry.broken ? 'Broken'
    : entry.mode === 'linked' ? 'Linked · follows the sprite'
    : entry.origin === 'uploaded' ? 'Uploaded' : 'Pinned';

  panel.innerHTML = `<div class="sps-sect-t">Avatar</div>`;
  const big = document.createElement('div');
  big.className = 'sps-avatar-big';
  big.innerHTML = avatarChipHtml(row.who, {
    size: 120, isPlayer: row.isPlayer, name: row.name,
    ring: row.isPlayer ? 'player' : 'default',
  });
  panel.appendChild(big);

  const badge = document.createElement('div');
  badge.className = 'sps-badge';
  badge.setAttribute('data-state', linked ? 'linked' : 'custom');
  badge.textContent = stateLabel;
  panel.appendChild(badge);

  const blurb = document.createElement('div');
  blurb.className = 'tiny dim sps-blurb';
  blurb.textContent = linked
    ? 'Taken from this character’s sprite, and follows it. Uploading or generating an avatar makes it its own picture — that never changes the sprite.'
    : 'This avatar is its own picture and no longer follows the sprite. Link it again to go back to a crop of the sprite.';
  panel.appendChild(blurb);

  const acts = document.createElement('div');
  acts.className = 'sps-acts';
  acts.appendChild(spriteBtn('sprites.avatar-regenerate', row.id, 'Regenerate', true));
  acts.appendChild(spriteBtn('sprites.avatar-upload', row.id, 'Upload', true));
  if (device === 'computer') {
    acts.appendChild(spriteBtn('sprites.avatar-recrop', row.id, 'Recrop', true));
    acts.appendChild(spriteBtn('sprites.avatar-edit', row.id, 'Edit', true));
  }
  acts.appendChild(spriteBtn(linked ? 'sprites.avatar-unlink' : 'sprites.avatar-link', row.id,
    linked ? 'Pin' : 'Link', true));
  panel.appendChild(acts);

  // The size strip: a crop that reads at 96px can be an unrecognisable smudge
  // at 18px, and 18px is the size the player sees most often. Showing both at
  // once is the only way that judgement is available at all.
  const sizes = document.createElement('div');
  sizes.className = 'sps-sizes';
  sizes.innerHTML = '<div class="sps-sect-t">Appears as</div><div class="sps-sizes-row">'
    + [18, 24, 40, 56].map((px) => avatarChipHtml(row.who, {
      size: px, isPlayer: row.isPlayer, name: row.name,
    })).join('')
    + '</div><div class="tiny dim">Map token, list chip, conversation header, profile card.</div>';
  panel.appendChild(sizes);

  const boundary = document.createElement('div');
  boundary.className = 'tiny dim sps-boundary';
  boundary.innerHTML = 'Sprite Studio edits pixels only. Name, looks and history live in the Character Studio.';
  panel.appendChild(boundary);
  return panel;
}

function renderSpriteGrid(gs, st, row, device) {
  const wrap = document.createElement('div');
  wrap.className = 'sps-grid-wrap';

  const outfits = spriteStudioOutfits(row.identity);
  const outfitToken = spriteStudioOutfitToken(gs, row, st.outfit);

  const bar = document.createElement('div');
  bar.className = 'sps-gridbar';
  bar.innerHTML = '<div class="sps-sect-t" style="flex:1">Sprites</div>';
  if (outfits.length > 1) {
    const seg = document.createElement('div');
    seg.className = 'sps-seg';
    for (const o of outfits) {
      const b = document.createElement('button');
      b.className = 'sps-seg-btn' + ((st.outfit || 'current') === o ? ' is-on' : '');
      b.setAttribute('data-action', 'sprites.set-outfit');
      b.setAttribute('data-row-id', o);
      b.textContent = o === 'current' ? 'Current' : spriteOutfitLabel(o);
      seg.appendChild(b);
    }
    bar.appendChild(seg);
  }
  wrap.appendChild(bar);

  const poses = Object.keys(CUTOUT_POSES);
  const grid = document.createElement('div');
  grid.className = 'sps-grid';
  grid.style.setProperty('--sps-cols', String(CUTOUT_EXPRESSIONS.length));

  grid.appendChild(spriteGridLabel(''));
  for (const e of CUTOUT_EXPRESSIONS) grid.appendChild(spriteGridLabel(e, true));

  for (const pose of poses) {
    grid.appendChild(spriteGridLabel(CUTOUT_POSES[pose].label));
    for (const expression of CUTOUT_EXPRESSIONS) {
      const variant = cutoutVariant(pose, expression, outfitToken);
      const cell = document.createElement('div');
      cell.className = 'sps-cell';
      cell.setAttribute('data-action', 'sprites.select-cell');
      cell.setAttribute('data-row-id', variant);
      if (st.editing === variant) cell.setAttribute('data-current', '');
      cell.innerHTML = '<div class="sps-cell-state tiny">…</div>';
      grid.appendChild(cell);

      spriteStudioCellState(gs, row, pose, expression, outfitToken).then((cs) => {
        if (!cell.isConnected) return;
        cell.setAttribute('data-state', cs.state);
        const label = cell.querySelector('.sps-cell-state');
        if (label) {
          label.textContent = cs.state === 'custom' ? 'Custom'
            : cs.state === 'custom-all' ? 'Custom · all outfits'
            : cs.state === 'generated' ? 'Generated'
            : cs.state === 'queued' ? 'Queued'
            : cs.state === 'broken' ? 'Broken' : 'Add';
        }
        if (cs.url) {
          const img = document.createElement('img');
          img.className = 'sps-cell-img';
          img.alt = '';
          img.src = cs.url;
          cell.insertBefore(img, cell.firstChild);
          cell.setAttribute('data-has-art', '');
        }
      });
    }
  }
  wrap.appendChild(grid);

  // The action bar acts on the SELECTED cell. Nothing is selected until the
  // player picks one, so the bar states that rather than acting on a guess.
  const acts = document.createElement('div');
  acts.className = 'sps-cellacts';
  if (!st.editing) {
    acts.innerHTML = '<div class="tiny dim">Pick a sprite above to regenerate, upload or clear it.</div>';
  } else {
    const slot = spriteSlotId(row.identity, 'cutout', st.editing);
    const wildSlot = spriteSlotId(row.identity, 'cutout', wildcardVariantOf(st.editing));
    const exactEntry = spriteIndexEntry(slot);
    const wildEntry = !exactEntry && spriteIndexEntry(wildSlot);
    const entry = exactEntry || wildEntry;
    const activeSlot = exactEntry ? slot : (wildEntry ? wildSlot : null);
    const info = document.createElement('div');
    info.style.flex = '1';
    info.innerHTML = `<div class="tiny" style="font-weight:600">${escapeHtml(spriteVariantLabel(st.editing))}</div>`
      + `<div class="tiny dim">${entry ? 'Your own art. Style overrides are off for this sprite.' : 'Generated from this character’s seed.'}</div>`;
    // D5's "Where does this apply?" — only meaningful once there IS an
    // override, and only for a cutout (an avatar has no outfit segment).
    if (entry) {
      const scope = spriteOverrideScope(activeSlot);
      info.innerHTML += `<div class="tiny dim">Applies to: ${escapeHtml(scope.label)}</div>`;
    }
    acts.appendChild(info);
    acts.appendChild(spriteBtn('sprites.regenerate', st.editing, 'Regenerate', true));
    acts.appendChild(spriteBtn('sprites.upload', st.editing, 'Upload', true));
    if (entry) {
      acts.appendChild(spriteBtn('sprites.revert', st.editing, 'Revert', true));
      acts.appendChild(spriteBtn(
        wildEntry ? 'sprites.override-narrow' : 'sprites.override-widen',
        activeSlot,
        wildEntry ? 'Narrow to this outfit' : 'Apply to every outfit',
        true,
      ));
    }
    // Computer only (D16): the paint canvas needs a pointer and room for the
    // panels, and the phone says so rather than hiding a button silently.
    if (device === 'computer') acts.appendChild(spriteBtn('sprites.edit', st.editing, 'Edit', false));
  }
  wrap.appendChild(acts);

  if (device === 'phone') {
    const note = document.createElement('div');
    note.className = 'sps-phonenote';
    note.innerHTML = '<div class="tiny" style="font-weight:700">Painting tools are on the computer</div>'
      + '<div class="tiny dim">Erasing, the cleanup sliders and the brush need a pointer and room for the panels. Everything else works here.</div>';
    wrap.appendChild(note);
  }
  return wrap;
}

function spriteGridLabel(text, upper) {
  const d = document.createElement('div');
  d.className = 'sps-glab';
  d.textContent = upper ? String(text).charAt(0).toUpperCase() + String(text).slice(1) : text;
  return d;
}

function spriteBtn(action, rowId, label, secondary) {
  const b = document.createElement('button');
  b.className = 'btn tiny' + (secondary ? ' btn-secondary' : '');
  b.setAttribute('data-action', action);
  b.setAttribute('data-row-id', rowId);
  b.textContent = label;
  return b;
}

// `standing_neutral_cdressed_ojacket_ttee_bjeans` -> "Standing · Neutral"
function spriteVariantLabel(variant) {
  const parts = String(variant || '').split('_');
  const pose = CUTOUT_POSES[parts[0]]?.label || parts[0] || '';
  const expr = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : '';
  return `${pose} · ${expr}`;
}

// `cdressed_ojacket_ttee_bjeans` -> "Jacket, tee, jeans" — the garments, not
// the token. Falls back to the clothing state when there are no garments.
function spriteOutfitLabel(token) {
  const parts = String(token || '').split('_');
  const state = (parts[0] || '').replace(/^c/, '');
  const worn = parts.slice(1)
    .map((p) => p.replace(/^[otb]/, '').replace(/_/g, ' ').trim())
    .filter(Boolean);
  if (worn.length === 0) return state ? state.charAt(0).toUpperCase() + state.slice(1) : 'Outfit';
  const s = worn.join(', ').replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- The recrop surface (Phase 7) -------------------------------------------
// A square crop ring over the cutout at full size, a live round preview at
// every AVATAR_TUNING.sizes so the 18px map token and the 40px conversation
// chip are both visible while dragging, and an Auto button that re-runs D9's
// own detector. No history, no tuning, no destructive buffers — Save just
// writes {crop, sourceVariant} through the existing D8 verb.

function renderSpritesRecrop(body, gs, app, screen) {
  const st = spriteStudioState(gs);
  const rc = spriteRecropState();
  // Stale screen (a reload, a save left mid-crop) — same discipline as the
  // editor and the character sheet.
  if (!rc || !st) { renderSpritesCharacter(body, gs, app, screen); return; }
  if (spriteStudioDevice(body) === 'phone') { renderSpritesCharacter(body, gs, app, screen); return; }

  const wrap = document.createElement('div');
  wrap.className = 'spe';

  const stage = document.createElement('div');
  stage.className = 'spe-stage spr-stage';

  const bar = document.createElement('div');
  bar.className = 'spe-stagebar';
  bar.innerHTML = `<div class="tiny dim" style="font-weight:600">Recrop — ${escapeHtml(rc.row.name)}</div>`;
  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  bar.appendChild(spacer);
  bar.appendChild(spriteBtn('sprites.recrop-auto', '', 'Auto', true));
  stage.appendChild(bar);

  const host = document.createElement('div');
  host.className = 'spe-canvaswrap';
  host.setAttribute('data-backdrop', 'checker');
  const canvas = document.createElement('canvas');
  canvas.className = 'spe-canvas spr-canvas';
  canvas.width = rc.width;
  canvas.height = rc.height;
  host.appendChild(canvas);
  stage.appendChild(host);
  paintSpriteRecropCanvas(canvas, rc);
  attachSpriteRecropPointer(canvas, rc);
  wrap.appendChild(stage);

  const panel = document.createElement('div');
  panel.className = 'spe-panel';

  const src = document.createElement('div');
  src.className = 'spe-group';
  src.innerHTML = '<div class="spe-group-t">Source pose</div>';
  const sel = document.createElement('select');
  sel.className = 'spr-source-sel';
  for (const [variant, label] of spriteRecropSourceOptions()) {
    const o = document.createElement('option');
    o.value = variant;
    o.textContent = label;
    if (variant === rc.sourceVariant) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => { doSpritesRecropSource(sel.value, 'computer'); });
  src.appendChild(sel);
  src.appendChild(spriteNote('The avatar is a crop of THIS cutout. Switching poses re-detects the head — it does not carry the old rect over.'));
  panel.appendChild(src);

  const sizes = document.createElement('div');
  sizes.className = 'spe-group spr-prev';
  sizes.innerHTML = '<div class="spe-group-t">Appears as <span class="spr-dims">'
    + `${rc.crop.w}×${rc.crop.h} of ${rc.width}×${rc.height}</span></div>`;
  const row = document.createElement('div');
  row.className = 'spr-prev-row';
  for (const [name, px] of Object.entries(AVATAR_TUNING.sizes)) {
    const fig = document.createElement('div');
    fig.className = 'spr-prev-fig';
    const c = document.createElement('canvas');
    c.setAttribute('data-size', String(px));
    fig.appendChild(c);
    const lab = document.createElement('div');
    lab.className = 'tiny dim';
    lab.textContent = `${name} · ${px}`;
    fig.appendChild(lab);
    row.appendChild(fig);
    paintSpriteRecropPreview(c, rc, px);
  }
  sizes.appendChild(row);
  panel.appendChild(sizes);

  panel.appendChild(spriteNote('Drag the ring to move it, drag a corner to resize. It stays square — that is the shape every avatar surface in the game uses.'));

  const foot = document.createElement('div');
  foot.className = 'spe-btnrow spe-foot';
  foot.appendChild(spriteBtn('sprites.recrop-close', '', 'Cancel', true));
  foot.appendChild(spriteBtn('sprites.recrop-save', '', 'Save crop', false));
  panel.appendChild(foot);

  wrap.appendChild(panel);
  body.appendChild(wrap);
}

// The pose+expression grid at the character's CURRENT outfit — the same 9
// cells renderSpriteGrid shows. A pose with no art yet is still offered
// (spriteRecropSetSource reports the friendly failure); enumerating only
// populated cells would need an async pass the way the grid's own cells do,
// and this list is small enough that "no art yet" is a fine answer.
function spriteRecropSourceOptions() {
  const st = spriteStudioState(currentGameState);
  const rc = spriteRecropState();
  const row = rc && rc.row;
  const outfit = row ? spriteStudioOutfitToken(currentGameState, row, st && st.outfit) : 'c_o_t_b';
  const out = [];
  for (const pose of Object.keys(CUTOUT_POSES)) {
    for (const expression of CUTOUT_EXPRESSIONS) {
      const variant = cutoutVariant(pose, expression, outfit);
      out.push([variant, spriteVariantLabel(variant)]);
    }
  }
  return out;
}

function paintSpriteRecropCanvas(canvas, rc) {
  if (canvas.width !== rc.width || canvas.height !== rc.height) { canvas.width = rc.width; canvas.height = rc.height; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, rc.width, rc.height);
  ctx.drawImage(rc.canvas, 0, 0);
  // Dim outside the ring so the crop reads clearly against the whole frame.
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, rc.width, rc.height);
  ctx.clearRect(rc.crop.x, rc.crop.y, rc.crop.w, rc.crop.h);
  ctx.drawImage(rc.canvas, rc.crop.x, rc.crop.y, rc.crop.w, rc.crop.h, rc.crop.x, rc.crop.y, rc.crop.w, rc.crop.h);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, Math.round(rc.width / 240));
  ctx.strokeRect(rc.crop.x, rc.crop.y, rc.crop.w, rc.crop.h);
  ctx.fillStyle = '#ffffff';
  const handle = spriteRecropHandleSize(rc.crop);
  for (const [hx, hy] of [
    [rc.crop.x, rc.crop.y], [rc.crop.x + rc.crop.w, rc.crop.y],
    [rc.crop.x, rc.crop.y + rc.crop.h], [rc.crop.x + rc.crop.w, rc.crop.y + rc.crop.h],
  ]) {
    ctx.beginPath();
    ctx.arc(hx, hy, Math.max(3, handle * 0.35), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintSpriteRecropPreview(canvas, rc, size) {
  if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(rc.canvas, rc.crop.x, rc.crop.y, rc.crop.w, rc.crop.h, 0, 0, size, size);
  ctx.restore();
}

// A stroke must not re-render the whole app — that would rebuild the canvas
// mid-drag and drop the pointer capture (the same reason syncSpriteEditorChrome
// exists). Only the previews and the dims readout are touched on every move.
function syncSpriteRecropPreviews(rc) {
  for (const el of document.querySelectorAll('.spr-prev-fig canvas')) {
    const size = Number(el.getAttribute('data-size')) || 40;
    paintSpriteRecropPreview(el, rc, size);
  }
  const dims = document.querySelector('.spr-dims');
  if (dims) dims.textContent = `${rc.crop.w}×${rc.crop.h} of ${rc.width}×${rc.height}`;
}

function attachSpriteRecropPointer(canvas, rc) {
  let mode = null; // null | 'move' | 'tl' | 'tr' | 'bl' | 'br'
  let grabDx = 0, grabDy = 0;

  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const p = spriteCanvasPoint(canvas, ev);
    if (!p) return;
    const handle = spriteRecropHandleSize(rc.crop);
    const corner = spriteRecropCornerAt(rc.crop, p.x, p.y, handle);
    if (corner) {
      mode = corner;
    } else if (p.x >= rc.crop.x && p.x <= rc.crop.x + rc.crop.w && p.y >= rc.crop.y && p.y <= rc.crop.y + rc.crop.h) {
      mode = 'move';
      grabDx = p.x - rc.crop.x; grabDy = p.y - rc.crop.y;
    } else {
      return;
    }
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* no active pointer */ }
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!mode) return;
    const p = spriteCanvasPoint(canvas, ev);
    if (!p) return;
    const next = mode === 'move'
      ? spriteRecropMoveTo(rc.crop, p.x - grabDx, p.y - grabDy, rc.width, rc.height)
      : spriteRecropResizeFromCorner(rc.crop, mode, p.x, p.y, rc.width, rc.height);
    spriteRecropSetCrop(next);
    paintSpriteRecropCanvas(canvas, rc);
    syncSpriteRecropPreviews(rc);
  });

  const end = (ev) => {
    if (!mode) return;
    mode = null;
    try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* already released */ }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

// --- The editor (Phase 5) ---------------------------------------------------
// Tool rail | canvas | panel. The canvas is a real <canvas> the pointer draws
// on; everything it does goes through the pure engine in spritestudio.js, so
// this file only translates pointer coordinates into buffer coordinates and
// paints the result.

function renderSpritesEditor(body, gs, app, screen) {
  const st = spriteStudioState(gs);
  const ed = spriteEditorState();
  // No open session — a stale save left on this screen, or a reload. Fall
  // back rather than showing a dead canvas, the same stale-screen discipline
  // renderSpritesCharacter uses.
  if (!ed || !st) { renderSpritesCharacter(body, gs, app, screen); return; }
  if (spriteStudioDevice(body) === 'phone') { renderSpritesCharacter(body, gs, app, screen); return; }

  const wrap = document.createElement('div');
  wrap.className = 'spe';

  wrap.appendChild(renderSpriteToolRail(ed));
  wrap.appendChild(renderSpriteStage(gs, st, ed));
  wrap.appendChild(renderSpritePanel(gs, st, ed));
  body.appendChild(wrap);
}

const SPRITE_TOOLS = [
  ['flood', 'Magic erase', 'M15 4V2M15 10V8M12.5 6h-2M19.5 6h-2M13.6 8.4l-9.2 9.2a1.4 1.4 0 0 0 2 2l9.2-9.2z'],
  ['erase', 'Eraser', 'M5 15l6-6 5 5-6 6H7zM11 9l4-4a1.5 1.5 0 0 1 2 0l3 3a1.5 1.5 0 0 1 0 2l-4 4M6 20.5h14'],
  ['restore', 'Restore', 'M4 8V4h4M20 9a8 8 0 0 0-14-3L4 8M20 16v4h-4M4 15a8 8 0 0 0 14 3l2-2'],
];

// The second group (Phase 6). The first group cleans a sprite; this one
// changes it. Kept visually apart in the rail because they answer different
// questions — "is this cutout wrong?" and "is this character wrong?".
const SPRITE_TOOLS_DRAW = [
  ['brush', 'Brush', 'M4 20.5s.6-3.5 2.6-3.5c1.7 0 1.8 1.8 3.4 1.8 1.8 0 2.6-1.6 2.6-3.3M10 14.5 18.6 5.9a2.05 2.05 0 0 1 2.9 2.9L12.9 17.4z'],
  ['bucket', 'Fill', 'M11.5 2.5 5.4 8.6a2.6 2.6 0 0 0 0 3.7l4.8 4.8a2.6 2.6 0 0 0 3.7 0l6.1-6.1zM8.5 5.5l9 9M19 16.5s2 2.4 2 3.6a2 2 0 0 1-4 0c0-1.2 2-3.6 2-3.6z'],
  ['pick', 'Eyedropper', 'M17.3 3.2a2.4 2.4 0 0 1 3.5 3.3L15.5 12l-3-3zM12 9l-8.2 8.2V21h3.8L15.8 12.8'],
  ['crop', 'Crop', 'M6.5 2v15.5H22M2 6.5h15.5V22'],
];

function renderSpriteToolRail(ed) {
  const rail = document.createElement('div');
  rail.className = 'spe-rail';
  const addGroup = (tools) => {
    for (const [id, label, path] of tools) {
      const b = document.createElement('button');
      b.className = 'spe-tool' + (ed.tool === id ? ' is-on' : '');
      b.setAttribute('data-action', 'sprites.editor-tool');
      b.setAttribute('data-row-id', id);
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
      rail.appendChild(b);
    }
  };
  addGroup(SPRITE_TOOLS);
  const div = document.createElement('div');
  div.className = 'spe-rail-div';
  rail.appendChild(div);
  addGroup(SPRITE_TOOLS_DRAW);
  return rail;
}

function renderSpriteStage(gs, st, ed) {
  const stage = document.createElement('div');
  stage.className = 'spe-stage';

  const bar = document.createElement('div');
  bar.className = 'spe-stagebar';
  bar.innerHTML = '<div class="tiny dim" style="font-weight:600">Backdrop</div>';
  const seg = document.createElement('div');
  seg.className = 'sps-seg';
  for (const [id, label] of [['checker', 'Checker'], ['white', 'White'], ['dark', 'Dark'], ['plate', 'Room plate']]) {
    const b = document.createElement('button');
    b.className = 'sps-seg-btn' + (ed.backdrop === id ? ' is-on' : '');
    b.setAttribute('data-action', 'sprites.editor-backdrop');
    b.setAttribute('data-row-id', id);
    b.textContent = label;
    seg.appendChild(b);
  }
  bar.appendChild(seg);
  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  bar.appendChild(spacer);
  const hint = document.createElement('div');
  hint.className = 'tiny dim';
  hint.textContent = SPRITE_TOOL_HINTS[ed.tool] || 'Paint to erase';
  bar.appendChild(hint);
  stage.appendChild(bar);

  const host = document.createElement('div');
  host.className = 'spe-canvaswrap';
  host.setAttribute('data-backdrop', ed.backdrop);
  const canvas = document.createElement('canvas');
  canvas.className = 'spe-canvas';
  canvas.width = ed.outWidth || ed.width;
  canvas.height = ed.outHeight || ed.height;
  canvas.setAttribute('data-tool', ed.tool);
  host.appendChild(canvas);
  stage.appendChild(host);
  paintSpriteEditorCanvas(canvas, ed);
  attachSpriteEditorPointer(canvas, ed);

  // D19 — the scene preview. The sprite at true scene scale, on the plate for
  // the room the player is actually standing in, with the reader panel where
  // it really sits. This is where "does it read as part of the picture, or as
  // a sticker on it" stops being a question nobody in this repo could answer.
  // Skipped for an AVATAR session (Phase 7): a 256x256 headshot has no scene
  // scale to sit at, and "standing in the room" is not a question a face
  // crop answers.
  if ((parseSpriteSlotId(ed.slot) || {}).kind !== 'avatar') {
    stage.appendChild(renderSpriteScenePreview(gs, ed, canvas));
  }
  return stage;
}

const SPRITE_TOOL_HINTS = {
  flood: 'Click a region to clear it',
  erase: 'Paint to erase',
  restore: 'Paint to bring the original back',
  brush: 'Paint with the chosen colour',
  bucket: 'Click an area to recolour it',
  pick: 'Click to take that colour',
  crop: 'Drag a box to reframe',
};

// The crop marquee, while a crop drag is in flight. Module-level because it
// belongs to the pointer session rather than to the editor state — nothing
// about a half-drawn rectangle should survive into a save.
let spriteCropDrag = null;

function paintSpriteEditorCanvas(canvas, ed) {
  const w = ed.outWidth || ed.width, h = ed.outHeight || ed.height;
  // The framed output can change size under a crop or a scale, and the canvas
  // has to follow or putImageData throws. Resizing in place keeps the element
  // (and therefore the pointer listeners and any active capture) alive.
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  img.data.set(ed.working);
  ctx.putImageData(img, 0, 0);
  // Drawn straight onto the canvas rather than into an overlay element: an
  // overlay would need its own copy of the fit-scaling maths to stay
  // registered with the image, which is the bug spriteCanvasPoint exists for.
  if (spriteCropDrag && canvas.classList.contains('spe-canvas')) {
    const d = spriteCropDrag;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, Math.round(w / 240));
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1),
      Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
    ctx.restore();
  }
}

// Pointer -> buffer coordinates. The canvas is CSS-scaled to fit, so every
// event has to be mapped back through its own rendered size; using clientX
// directly is the classic version of this bug.
function spriteCanvasPoint(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  // A canvas with no layout (an unopened window, a display:none ancestor)
  // would divide by zero and hand the engine NaN coordinates, which silently
  // do nothing. Returning null makes that a decision rather than an accident.
  if (!r.width || !r.height) return null;
  return {
    x: (ev.clientX - r.left) * (canvas.width / r.width),
    y: (ev.clientY - r.top) * (canvas.height / r.height),
  };
}

function attachSpriteEditorPointer(canvas, ed) {
  let drawing = false;
  let last = null;

  // The canvas shows the FRAMED output; every stroke buffer is indexed in
  // source space. With a crop or a flip in force those are different pixels,
  // so nothing but the eyedropper (which reads what is on screen) works in
  // canvas coordinates.
  const toSource = (p) => spriteGeomToSource(ed.geom, ed.width, ed.height, p.x, p.y);

  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const p = spriteCanvasPoint(canvas, ev);
    if (!p) return;
    if (ed.tool === 'pick') {
      const hex = spriteEditorPick(ed, p.x, p.y);
      if (hex) syncSpriteEditorColor(hex);
      return;
    }
    if (ed.tool === 'flood' || ed.tool === 'bucket') {
      const s = toSource(p);
      if (ed.tool === 'flood') spriteEditorFlood(ed, s.x, s.y);
      else spriteEditorFill(ed, s.x, s.y);
      paintSpriteEditorCanvas(canvas, ed);
      syncSpriteEditorChrome(ed);
      return;
    }
    drawing = true;
    // Pointer capture, so a stroke that leaves the canvas mid-drag still ends
    // cleanly instead of leaving `drawing` stuck true. Guarded like its
    // release: capture throws NotFoundError when the id is not an active
    // pointer, and an exception here would abort the whole pointerdown and
    // lose the stroke rather than merely losing the capture.
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* no active pointer */ }
    if (ed.tool === 'crop') {
      spriteCropDrag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      return;
    }
    last = toSource(p);
    // One drag, one commit (D20). The entry stays open until pointerup, so a
    // stroke costs one undo step rather than one per mousemove.
    spriteEditorStrokeOpen(ed, ed.tool);
    spriteEditorStrokeSegment(ed, last.x, last.y, last.x, last.y);
    paintSpriteEditorCanvas(canvas, ed);
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!drawing) return;
    const p = spriteCanvasPoint(canvas, ev);
    if (!p) return;
    if (ed.tool === 'crop') {
      if (spriteCropDrag) { spriteCropDrag.x1 = p.x; spriteCropDrag.y1 = p.y; }
      paintSpriteEditorCanvas(canvas, ed);
      return;
    }
    const s = toSource(p);
    spriteEditorStrokeSegment(ed, last.x, last.y, s.x, s.y);
    last = s;
    paintSpriteEditorCanvas(canvas, ed);
  });

  const end = (ev) => {
    if (!drawing) return;
    drawing = false;
    last = null;
    try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* already released */ }
    if (ed.tool === 'crop') {
      const d = spriteCropDrag;
      spriteCropDrag = null;
      if (d) { commitSpriteCropDrag(ed, d, canvas); return; }
    }
    // A cancelled pointer commits what was already drawn rather than losing
    // it: the pixels are on screen, and an undo entry is the way back.
    spriteEditorStrokeClose(ed);
    syncSpriteEditorChrome(ed);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

// The marquee is drawn in OUTPUT pixels and stored in SOURCE pixels, so a
// second crop narrows the first rather than being measured against a frame
// that no longer exists.
function commitSpriteCropDrag(ed, d, canvas) {
  const a = spriteGeomToSource(ed.geom, ed.width, ed.height, Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
  const b = spriteGeomToSource(ed.geom, ed.width, ed.height, Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
  const w = Math.round(Math.abs(b.x - a.x)), h = Math.round(Math.abs(b.y - a.y));
  // A click rather than a drag is a miss, not a request to crop to nothing.
  if (w < 4 || h < 4) { paintSpriteEditorCanvas(canvas, ed); return; }
  spriteEditorSetCrop(ed, {
    x: Math.round(Math.min(a.x, b.x)), y: Math.round(Math.min(a.y, b.y)), w, h,
  });
  spriteStudioRerender('computer');
}

// The colour readouts, after an eyedropper pick. Same reason as
// syncSpriteEditorChrome: a full re-render would rebuild the canvas the player
// is working on.
function syncSpriteEditorColor(hex) {
  const inp = document.querySelector('.spe-color input[type="color"]');
  if (inp) inp.value = hex;
  const lbl = document.querySelector('.spe-color-hex');
  if (lbl) lbl.textContent = hex;
  for (const s of document.querySelectorAll('.spe-sw')) {
    s.classList.toggle('is-on', (s.getAttribute('data-row-id') || '').toLowerCase() === hex.toLowerCase());
  }
}

// A stroke must not re-render the whole app — that would rebuild the canvas
// mid-drag and drop the pointer capture. Only the readouts that changed are
// touched.
function syncSpriteEditorChrome(ed) {
  const u = document.querySelector('[data-action="sprites.editor-undo"]');
  const r = document.querySelector('[data-action="sprites.editor-redo"]');
  if (u) u.disabled = !spriteEditorCanUndo(ed);
  if (r) r.disabled = !spriteEditorCanRedo(ed);
  const count = document.querySelector('.spe-histcount');
  if (count) count.textContent = `${ed.historyIndex + 1} of ${ed.history.length} · ${SPRITE_EDIT_HISTORY_MAX} kept`;
  const anchor = document.querySelector('.spe-anchorval');
  if (anchor && ed.bbox) {
    anchor.textContent = (cutoutBottomFrac(ed.bbox, ed.outHeight || ed.height) || 0).toFixed(3);
  }
  const dims = document.querySelector('.spe-dims');
  if (dims) dims.textContent = `${ed.outWidth || ed.width}×${ed.outHeight || ed.height}`;
  // The panel is deliberately not rebuilt mid-drag, so without this the badge
  // would sit on "unchanged" while the player watched the sprite change colour.
  const adjState = document.querySelector('.spe-adjstate');
  if (adjState) adjState.textContent = spriteAdjustIsIdentity(ed.adjust) ? 'unchanged' : 'adjusted';
  for (const fig of document.querySelectorAll('.spe-prev-fig')) {
    const c = fig.querySelector('canvas');
    if (c) paintSpriteEditorCanvas(c, ed);
  }
}

function renderSpriteScenePreview(gs, ed, sourceCanvas) {
  const bar = document.createElement('div');
  bar.className = 'spe-scenebar';

  const box = document.createElement('div');
  box.className = 'spe-scenebox';
  const plate = document.createElement('img');
  plate.className = 'spe-prev-plate';
  plate.alt = '';
  box.appendChild(plate);

  const figWrap = document.createElement('div');
  figWrap.className = 'spe-prev-fig';
  const figCanvas = document.createElement('canvas');
  figCanvas.width = ed.outWidth || ed.width; figCanvas.height = ed.outHeight || ed.height;
  figWrap.appendChild(figCanvas);
  paintSpriteEditorCanvas(figCanvas, ed);
  box.appendChild(figWrap);

  const reader = document.createElement('div');
  reader.className = 'spe-prev-reader';
  reader.innerHTML = '<div class="tiny dim">The scene reader sits here</div>';
  box.appendChild(reader);
  bar.appendChild(box);

  // The REAL plate for the room the player is standing in — not a stand-in.
  const roomId = gs.player && gs.player.location;
  const phase = gs.meta && gs.meta.clock && gs.meta.clock.phase;
  if (roomId && typeof getScenePlate === 'function') {
    getScenePlate(roomId, phase, gs.objects && gs.objects[`room_${roomId}`]).then((res) => {
      if (res && res.url && plate.isConnected) plate.src = res.url;
    }).catch(() => {});
  }

  const side = document.createElement('div');
  side.className = 'spe-sceneside';
  side.innerHTML = `<div class="sps-sect-t">Scene preview</div>`
    + `<div class="tiny dim">${escapeHtml(ROOMS[roomId]?.name || 'This room')} at true scene scale, with the reader where it really sits. `
    + 'This is where you find out whether a sprite reads as part of the picture or as a sticker on it.</div>';
  const anchorRow = document.createElement('div');
  anchorRow.className = 'spe-anchorrow';
  anchorRow.innerHTML = '<span class="tiny dim">Floor anchor</span>'
    + `<span class="tiny spe-anchorval" style="font-weight:600">${(ed.anchor != null ? ed.anchor : (cutoutBottomFrac(ed.bbox, ed.height) || 0)).toFixed(3)}</span>`;
  const trim = document.createElement('button');
  trim.className = 'btn tiny btn-secondary';
  trim.setAttribute('data-action', 'sprites.editor-autotrim');
  trim.textContent = 'Re-measure';
  anchorRow.appendChild(trim);
  side.appendChild(anchorRow);
  bar.appendChild(side);
  return bar;
}

// The matte panel (D18). Every row drives a real CUTOUT_TUNING field and
// re-runs the shipped cleanup against the master.
const SPRITE_MATTE_ROWS = [
  ['alphaFloor', 'Alpha floor', 0, 255, 1],
  ['alphaCeil', 'Alpha ceiling', 0, 255, 1],
  ['spillAlphaMax', 'Decontaminate', 0, 255, 1],
  ['closeRadius', 'Close radius', 0, 6, 1],
  ['speckAreaMax', 'Speck area', 0, 600, 10],
  ['speckRelMax', 'Speck share', 0, 0.3, 0.01],
];

function renderSpritePanel(gs, st, ed) {
  const panel = document.createElement('div');
  panel.className = 'spe-panel';

  // Tool settings
  const tool = document.createElement('div');
  tool.className = 'spe-group';
  if (ed.tool === 'brush' || ed.tool === 'bucket' || ed.tool === 'pick') {
    tool.innerHTML = `<div class="spe-group-t">${ed.tool === 'brush' ? 'Brush' : ed.tool === 'bucket' ? 'Fill' : 'Eyedropper'}</div>`;
    if (ed.tool === 'brush') {
      tool.appendChild(spriteSlider('brush.size', 'Size', 2, 120, 1, ed.brush.size));
      tool.appendChild(spriteSlider('brush.hardness', 'Hardness', 0, 1, 0.05, ed.brush.hardness));
    } else if (ed.tool === 'bucket') {
      tool.appendChild(spriteSlider('fillTolerance', 'Tolerance', 0, 160, 1, ed.fillTolerance));
    }
    if (ed.tool !== 'pick') {
      tool.appendChild(spriteSlider('brush.opacity', 'Opacity', 0.05, 1, 0.05, ed.brush.opacity));
    }
    tool.appendChild(spriteColorRow(ed));
    tool.appendChild(spriteSwatchRow(ed));
    tool.appendChild(spriteNote(
      ed.tool === 'brush' ? 'Paint sits on top of the artwork, and the eraser takes it back off.'
      : ed.tool === 'bucket' ? 'The fill stops at the silhouette. It can recolour a shirt; it can never spill into the background.'
      : 'Click the canvas to take that colour. Picking and then painting lays down exactly what you picked.'));
  } else if (ed.tool === 'crop') {
    tool.innerHTML = '<div class="spe-group-t">Crop</div>';
    tool.appendChild(spriteNote('Drag a box on the canvas. A crop is a frame, not a cut — the master keeps every pixel, so you can widen it again later.'));
    const crow = document.createElement('div');
    crow.className = 'spe-btnrow';
    crow.appendChild(spriteBtn('sprites.editor-crop-artwork', '', 'Crop to art', true));
    crow.appendChild(spriteBtn('sprites.editor-reset-frame', '', 'Whole frame', true));
    tool.appendChild(crow);
  } else if (ed.tool === 'flood') {
    tool.innerHTML = '<div class="spe-group-t">Magic erase</div>';
    tool.appendChild(spriteSlider('tolerance', 'Tolerance', 0, 160, 1, ed.tolerance));
    const note = document.createElement('div');
    note.className = 'tiny';
    note.style.color = 'var(--color-text-faint)';
    note.style.lineHeight = '1.4';
    note.textContent = 'Background between the legs or under an arm is walled in by the subject — click straight into it.';
    tool.appendChild(note);
  } else {
    tool.innerHTML = `<div class="spe-group-t">${ed.tool === 'restore' ? 'Restore' : 'Eraser'}</div>`;
    tool.appendChild(spriteSlider('brush.size', 'Size', 2, 120, 1, ed.brush.size));
    tool.appendChild(spriteSlider('brush.hardness', 'Hardness', 0, 1, 0.05, ed.brush.hardness));
    if (ed.tool === 'restore') {
      const note = document.createElement('div');
      note.className = 'tiny';
      note.style.color = 'var(--color-text-faint)';
      note.textContent = 'Paints the original image back. It can only recover what was there.';
      tool.appendChild(note);
    }
  }
  panel.appendChild(tool);

  // The matte panel
  const matte = document.createElement('div');
  matte.className = 'spe-group';
  matte.innerHTML = '<div class="spe-group-t">Matte <span>CUTOUT_TUNING</span></div>';
  for (const [field, label, min, max, step] of SPRITE_MATTE_ROWS) {
    matte.appendChild(spriteSlider(`tuning.${field}`, label, min, max, step, ed.tuning[field]));
  }
  const mrow = document.createElement('div');
  mrow.className = 'spe-btnrow';
  mrow.appendChild(spriteBtn('sprites.editor-reset-tuning', '', 'Reset matte', true));
  mrow.appendChild(spriteBtn('sprites.editor-reset-strokes', '', 'Clear edits', true));
  matte.appendChild(mrow);
  panel.appendChild(matte);

  // Colour (Phase 6) — parametric in exactly the way the matte above it is,
  // and for the same reason: every value re-runs from the master, so there is
  // always a way back. The tint row is the one that earns its place — it is
  // what lets a sprite generated in daylight sit on a night plate.
  const col = document.createElement('div');
  col.className = 'spe-group';
  col.innerHTML = `<div class="spe-group-t">Colour <span>${spriteAdjustIsIdentity(ed.adjust) ? 'unchanged' : 'adjusted'}</span></div>`;
  for (const [field, label, min, max, step] of SPRITE_ADJUST_ROWS) {
    col.appendChild(spriteSlider(`adjust.${field}`, label, min, max, step, ed.adjust[field]));
  }
  col.appendChild(spriteTintRow(ed));
  const crow2 = document.createElement('div');
  crow2.className = 'spe-btnrow';
  crow2.appendChild(spriteBtn('sprites.editor-reset-adjust', '', 'Reset colour', true));
  col.appendChild(crow2);
  panel.appendChild(col);

  // Frame (Phase 6). Flip, scale and crop are held as a description applied at
  // the end of the pipeline, never baked in, so none of them can invalidate a
  // history entry — and the readout is the real output size a save would write.
  const frame = document.createElement('div');
  frame.className = 'spe-group';
  frame.innerHTML = `<div class="spe-group-t">Frame <span class="spe-dims">${ed.outWidth || ed.width}×${ed.outHeight || ed.height}</span></div>`;
  frame.appendChild(spriteSlider('geom.scale', 'Scale', 0.25, 2, 0.05, ed.geom.scale));
  const frow = document.createElement('div');
  frow.className = 'spe-btnrow';
  frow.appendChild(spriteBtn('sprites.editor-flip', '', ed.geom.flipH ? 'Unflip' : 'Flip', true));
  frow.appendChild(spriteBtn('sprites.editor-crop-artwork', '', 'Crop to art', true));
  frow.appendChild(spriteBtn('sprites.editor-reset-frame', '', 'Reset', true));
  frame.appendChild(frow);
  panel.appendChild(frame);

  // History
  const hist = document.createElement('div');
  hist.className = 'spe-group spe-histgroup';
  const ht = document.createElement('div');
  ht.className = 'spe-group-t';
  ht.textContent = 'History';
  const hbtns = document.createElement('span');
  const undo = spriteBtn('sprites.editor-undo', '', '↶', true);
  const redo = spriteBtn('sprites.editor-redo', '', '↷', true);
  undo.disabled = !spriteEditorCanUndo(ed);
  redo.disabled = !spriteEditorCanRedo(ed);
  hbtns.appendChild(undo); hbtns.appendChild(redo);
  ht.appendChild(hbtns);
  hist.appendChild(ht);
  const list = document.createElement('div');
  list.className = 'spe-hist';
  const from = Math.max(0, ed.history.length - 8);
  for (let i = from; i < ed.history.length; i++) {
    const d = document.createElement('div');
    d.className = i === ed.historyIndex ? 'is-cur' : (i > ed.historyIndex ? 'is-fwd' : '');
    d.textContent = ed.history[i].label;
    list.appendChild(d);
  }
  if (ed.history.length === 0) {
    const d = document.createElement('div');
    d.textContent = 'Opened from ' + (ed.slot.includes('|') ? 'the stored sprite' : 'generated art');
    list.appendChild(d);
  }
  hist.appendChild(list);
  const count = document.createElement('div');
  count.className = 'tiny spe-histcount';
  count.style.color = 'var(--color-text-faint)';
  count.textContent = `${ed.historyIndex + 1} of ${ed.history.length} · ${SPRITE_EDIT_HISTORY_MAX} kept`;
  hist.appendChild(count);
  panel.appendChild(hist);

  const foot = document.createElement('div');
  foot.className = 'spe-btnrow spe-foot';
  foot.appendChild(spriteBtn('sprites.editor-close', '', 'Close', true));
  foot.appendChild(spriteBtn('sprites.editor-save', '', 'Save sprite', false));
  panel.appendChild(foot);
  return panel;
}

// A slider row. `path` is a tuning field (`tuning.alphaFloor`), a brush field
// (`brush.size`) or a bare editor field (`tolerance`), so one control serves
// all three.
//
// Listeners are attached directly rather than routed through data-action:
// the app's dispatch is click-based, and a range needs `input` (live) and
// `change` (settled) separately. That split IS D20 — dragging repaints
// continuously, and ONE history entry is committed when the drag ends, so an
// undo steps back over a slider move rather than over sixty of them.
function spriteSlider(path, label, min, max, step, value) {
  const row = document.createElement('label');
  row.className = 'spe-sl';
  const name = document.createElement('span');
  name.className = 'spe-sl-l';
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'spe-sl-t';
  input.min = String(min); input.max = String(max); input.step = String(step);
  input.value = String(value != null ? value : min);
  const out = document.createElement('span');
  out.className = 'spe-sl-v';
  const fmt = (v) => (step < 1 ? Number(v).toFixed(2) : String(Math.round(v)));
  out.textContent = fmt(input.value);
  row.appendChild(name); row.appendChild(input); row.appendChild(out);

  let dragFrom = null;
  const group = path.startsWith('tuning.') ? 'tuning'
    : path.startsWith('adjust.') ? 'adjust'
    : path.startsWith('geom.') ? 'geom'
    : path.startsWith('brush.') ? 'brush' : 'bare';
  const field = group === 'bare' ? path : path.slice(path.indexOf('.') + 1);
  const read = (ed) => (group === 'bare' ? ed[field] : ed[group][field]);
  const write = (ed, v) => { if (group === 'bare') ed[field] = v; else ed[group][field] = v; };
  // Brush size, opacity and the fill tolerance are read at stroke time, so
  // they change no pixel until the next stroke and need no recompute. The
  // three parametric groups all do.
  const commit = group === 'tuning' ? spriteEditorSetTuning
    : group === 'adjust' ? spriteEditorSetAdjust
    : group === 'geom' ? spriteEditorSetGeom : null;

  input.addEventListener('input', () => {
    const ed = spriteEditorState();
    if (!ed) return;
    if (dragFrom === null) dragFrom = read(ed);
    const v = Number(input.value);
    out.textContent = fmt(v);
    write(ed, v);
    if (commit) {
      spriteEditorRecompose(ed);
      const canvas = document.querySelector('.spe-canvas');
      if (canvas) paintSpriteEditorCanvas(canvas, ed);
      syncSpriteEditorChrome(ed);
    }
  });

  input.addEventListener('change', () => {
    const ed = spriteEditorState();
    if (!ed || dragFrom === null) return;
    const v = Number(input.value);
    const from = dragFrom;
    dragFrom = null;
    if (v === from || !commit) return;
    // Rewind to the pre-drag value and re-apply through the committing path,
    // so history holds exactly one entry for the whole drag.
    write(ed, from);
    commit(ed, { [field]: v });
    const canvas = document.querySelector('.spe-canvas');
    if (canvas) paintSpriteEditorCanvas(canvas, ed);
    syncSpriteEditorChrome(ed);
  });
  return row;
}

// The adjustment rows, all identity at their zero (D18's discipline carried
// into colour: a control the player cannot get back from is not a control).
const SPRITE_ADJUST_ROWS = [
  ['hue', 'Hue', -180, 180, 1],
  ['sat', 'Saturation', -100, 100, 1],
  ['light', 'Lightness', -100, 100, 1],
  ['brightness', 'Brightness', -100, 100, 1],
  ['contrast', 'Contrast', -100, 100, 1],
  ['tint', 'Tint', 0, 100, 1],
];

function spriteNote(text) {
  const note = document.createElement('div');
  note.className = 'tiny spe-note';
  note.textContent = text;
  return note;
}

// The brush colour: a native picker plus the sprite's own dominant colours, so
// recolouring hair starts by clicking the hair colour that is already there.
function spriteColorRow(ed) {
  const row = document.createElement('div');
  row.className = 'spe-color';
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.value = ed.brush.color;
  inp.addEventListener('input', () => {
    const cur = spriteEditorState();
    if (cur) cur.brush.color = inp.value;
    syncSpriteEditorColor(inp.value);
  });
  const hex = document.createElement('span');
  hex.className = 'tiny spe-color-hex';
  hex.textContent = ed.brush.color;
  row.appendChild(inp);
  row.appendChild(hex);
  return row;
}

function spriteSwatchRow(ed) {
  const row = document.createElement('div');
  row.className = 'spe-swatches';
  for (const hex of spriteEditorSwatches(ed)) {
    const b = document.createElement('button');
    b.className = 'spe-sw' + (hex.toLowerCase() === String(ed.brush.color).toLowerCase() ? ' is-on' : '');
    b.style.background = hex;
    b.title = hex;
    b.setAttribute('aria-label', hex);
    b.setAttribute('data-action', 'sprites.editor-swatch');
    b.setAttribute('data-row-id', hex);
    row.appendChild(b);
  }
  return row;
}

// The tint's target colour. `change` rather than `input`: a native colour
// picker fires continuously while the player drags around the wheel, and one
// history entry per wheel pixel would bury everything else.
function spriteTintRow(ed) {
  const row = document.createElement('label');
  row.className = 'spe-sl';
  const name = document.createElement('span');
  name.className = 'spe-sl-l';
  name.textContent = 'Tint colour';
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.className = 'spe-sl-c';
  inp.value = ed.adjust.tintColor;
  inp.addEventListener('change', () => {
    const cur = spriteEditorState();
    if (!cur) return;
    spriteEditorSetAdjust(cur, { tintColor: inp.value });
    const canvas = document.querySelector('.spe-canvas');
    if (canvas) paintSpriteEditorCanvas(canvas, cur);
    syncSpriteEditorChrome(cur);
  });
  row.appendChild(name);
  row.appendChild(inp);
  return row;
}

Object.assign(COMPUTER_RENDERERS, {
  'sprites-roster': renderSpritesRoster,
  'sprites-character': renderSpritesCharacter,
  'sprites-editor': renderSpritesEditor,
  'sprites-recrop': renderSpritesRecrop,
});

// ===== /SECTION: RENDER.SPRITESTUDIO =====
