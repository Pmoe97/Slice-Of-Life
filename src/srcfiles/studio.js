// ===== SECTION: STUDIO =====
// The Player Design studio and the opening cutscene — everything that
// happens between clicking New Game and the first rendered frame of play.
//
// Both are PRE-GAME surfaces: they run while `#app` is still covered by
// `data-app-hidden` and `currentGameState` is still null. Neither may call
// closeMainMenu() — startSoloGame does that, at the very end, and keeping it
// as the single uncovering point is what makes a path that forgets to finish
// fail loudly with a blank screen instead of half-starting a game (see
// MENU's closeMainMenu comment).
//
// The studio's whole surface is generated from ONE table, PLAYER_STUDIO_TABS.
// Populate and read both walk it, which is the same discipline the old
// PLAYER_LOOK_FIELDS block used and for the same reason: a second hand-written
// reader is how a field gets offered to the player and then silently dropped.
// Every appearance field additionally resolves against CHARACTER_SCHEMA
// through validateNpcField — the identical validator the Character Studio and
// the save path use — so this surface cannot offer a value the game would
// reject.

// The authored draft. Blank/absent means "roll it", exactly as the old form
// promised; generatePlayerAppearance (SIM) fills every unauthored field from
// the cast's own pools. Never a full appearance record — only what the player
// actually chose.
let playerStudioDraft = null;
let playerStudioTab = 'identity';
let studioFullBodyLink = false;
let playerStudioPortraitUrl = null;
let playerStudioBusy = false;

function blankPlayerDraft() {
  return {
    name: '',
    surname: '',
    age: null,
    gender: '',
    physical: {},
    portrait: { prompt: '', seed: 0, promptDirty: false },
  };
}

// --- The one table ---
// `path` is relative to the draft. `schemaPath` is the same field's address in
// CHARACTER_SCHEMA, used for validation; fields with no schema counterpart
// (name, surname) carry none and are validated locally.
//
// `pool` is a thunk rather than a value because every PHYS_POOL_* is a
// top-level `const` in config.js — reading one at table-definition time would
// depend on load order, and this file loads last on purpose.
const PLAYER_STUDIO_TABS = [
  { id: 'identity', label: 'Identity', sections: [
    { label: 'Who you are', fields: [
      { path: 'name',    label: 'First name', kind: 'text', placeholder: 'Rolled if blank', maxLength: 40 },
      { path: 'surname', label: 'Surname',    kind: 'text', placeholder: 'Rolled if blank', maxLength: 40,
        hint: 'Your grandfather shares it. The will will name him.' },
      { path: 'age',     label: 'Age',        kind: 'number', min: 18, max: 80, placeholder: 'Roll it' },
      { path: 'gender',  label: 'Gender',     kind: 'select', schemaPath: 'bible.gender',
        pool: () => Object.keys(CHAR_GEN.genderWeights),
        hint: 'Sets your default anatomy on the Intimate tab. Change either freely afterward.' },
    ] },
  ] },

  { id: 'body', label: 'Body', sections: [
    { label: 'Frame', fields: [
      { path: 'physical.height', label: 'Height', kind: 'select', schemaPath: 'bible.physical.height', pool: () => PHYS_POOL_HEIGHT },
      { path: 'physical.build',  label: 'Build',  kind: 'select', schemaPath: 'bible.physical.build',  pool: () => PHYS_POOL_BUILD },
    ] },
    { label: 'Shape', fields: [
      { path: 'physical.body.shape',     label: 'Body shape', kind: 'select', schemaPath: 'bible.physical.body.shape',     pool: () => PHYS_POOL_BODY_SHAPE },
      { path: 'physical.body.chestSize', label: 'Chest (frame)', kind: 'select', schemaPath: 'bible.physical.body.chestSize', pool: () => PHYS_POOL_CHEST_SIZE,
        hint: 'Your pectorals and ribcage — the clothed silhouette, not breast tissue. Breast size and shape live on the Intimate tab.' },
      { path: 'physical.body.buttSize',  label: 'Hips',       kind: 'select', schemaPath: 'bible.physical.body.buttSize',  pool: () => PHYS_POOL_BUTT_SIZE },
      { path: 'physical.body.legs',      label: 'Legs',       kind: 'select', schemaPath: 'bible.physical.body.legs',      pool: () => PHYS_POOL_LEGS },
      { path: 'physical.body.posture',   label: 'Posture',    kind: 'select', schemaPath: 'bible.physical.body.posture',   pool: () => PHYS_POOL_POSTURE },
    ] },
  ] },

  { id: 'face', label: 'Face & Hair', sections: [
    { label: 'Hair', fields: [
      { path: 'physical.hair.color',   label: 'Colour',  kind: 'select', schemaPath: 'bible.physical.hair.color',   pool: () => PHYS_POOL_HAIR_COLOR },
      { path: 'physical.hair.style',   label: 'Style',   kind: 'select', schemaPath: 'bible.physical.hair.style',   pool: () => PHYS_POOL_HAIR_STYLE },
      { path: 'physical.hair.length',  label: 'Length',  kind: 'select', schemaPath: 'bible.physical.hair.length',  pool: () => PHYS_POOL_HAIR_LENGTH },
      { path: 'physical.hair.texture', label: 'Texture', kind: 'select', schemaPath: 'bible.physical.hair.texture', pool: () => PHYS_POOL_HAIR_TEXTURE },
    ] },
    { label: 'Eyes', fields: [
      { path: 'physical.eyes.color', label: 'Colour', kind: 'select', schemaPath: 'bible.physical.eyes.color', pool: () => PHYS_POOL_EYE_COLOR },
      { path: 'physical.eyes.shape', label: 'Shape',  kind: 'select', schemaPath: 'bible.physical.eyes.shape', pool: () => PHYS_POOL_EYE_SHAPE },
    ] },
    { label: 'Skin', fields: [
      { path: 'physical.skin.tone',      label: 'Tone',      kind: 'select', schemaPath: 'bible.physical.skin.tone',      pool: () => PHYS_POOL_SKIN_TONE },
      { path: 'physical.skin.texture',   label: 'Texture',   kind: 'select', schemaPath: 'bible.physical.skin.texture',   pool: () => PHYS_POOL_SKIN_TEXTURE },
      { path: 'physical.skin.ethnicity', label: 'Heritage',  kind: 'select', schemaPath: 'bible.physical.skin.ethnicity', pool: () => PHYS_POOL_SKIN_ETHNICITY },
    ] },
    { label: 'Features', fields: [
      { path: 'physical.face.shape',      label: 'Face shape', kind: 'select', schemaPath: 'bible.physical.face.shape',      pool: () => PHYS_POOL_FACE_SHAPE },
      { path: 'physical.face.nose',       label: 'Nose',       kind: 'select', schemaPath: 'bible.physical.face.nose',       pool: () => PHYS_POOL_NOSE },
      { path: 'physical.face.lips',       label: 'Lips',       kind: 'select', schemaPath: 'bible.physical.face.lips',       pool: () => PHYS_POOL_LIPS },
      { path: 'physical.face.cheekbones', label: 'Cheekbones', kind: 'select', schemaPath: 'bible.physical.face.cheekbones', pool: () => PHYS_POOL_CHEEKBONES },
      { path: 'physical.face.jawline',    label: 'Jawline',    kind: 'select', schemaPath: 'bible.physical.face.jawline',    pool: () => PHYS_POOL_JAWLINE },
      { path: 'physical.face.ears',       label: 'Ears',       kind: 'select', schemaPath: 'bible.physical.face.ears',       pool: () => PHYS_POOL_EARS },
      { path: 'physical.facialHair',      label: 'Facial hair', kind: 'select', schemaPath: 'bible.physical.facialHair',      pool: () => PHYS_POOL_FACIAL_HAIR },
    ] },
  ] },

  { id: 'marks', label: 'Marks', sections: [
    { label: 'Distinguishing features', fields: [
      { path: 'physical.distinguishingFeatures', label: '', kind: 'toggles', pool: () => PHYS_POOL_FEATURES, max: 4 },
    ] },
    { label: 'Piercings', fields: [{ path: 'physical.piercings', label: '', kind: 'rows' }] },
    { label: 'Tattoos',   fields: [{ path: 'physical.tattoos',   label: '', kind: 'rows' }] },
  ] },

  { id: 'style', label: 'Style & Voice', sections: [
    { label: 'Presentation', fields: [
      { path: 'physical.fashion',     label: 'Everyday style', kind: 'select', schemaPath: 'bible.physical.fashion', pool: () => PHYS_POOL_FASHION },
      { path: 'physical.accessories', label: 'Accessories',    kind: 'text',   schemaPath: 'bible.physical.accessories', maxLength: 120, placeholder: 'e.g. a chipped signet ring' },
    ] },
    { label: 'Voice', fields: [
      { path: 'physical.voice.pitch',   label: 'Pitch',   kind: 'select', schemaPath: 'bible.physical.voice.pitch',   pool: () => PHYS_POOL_VOICE_PITCH },
      { path: 'physical.voice.texture', label: 'Texture', kind: 'select', schemaPath: 'bible.physical.voice.texture', pool: () => PHYS_POOL_VOICE_TEXTURE },
      { path: 'physical.voice.accent',  label: 'Accent',  kind: 'select', schemaPath: 'bible.physical.voice.accent',  pool: () => PHYS_POOL_VOICE_ACCENT },
    ] },
    { label: 'Presence', fields: [
      { path: 'physical.gait',  label: 'Gait',  kind: 'select', schemaPath: 'bible.physical.gait',  pool: () => PHYS_POOL_GAIT },
      { path: 'physical.scent', label: 'Scent', kind: 'select', schemaPath: 'bible.physical.scent', pool: () => PHYS_POOL_SCENT },
    ] },
  ] },

  { id: 'intimate', label: 'Intimate', sections: [
    { label: 'Breasts (tissue)', hint: 'Breast tissue — the undressed layer. Your frame\'s pectoral size is on the Body tab under "Chest (frame)".', fields: [
      { path: 'physical.intimate.breasts.size',        label: 'Size',        kind: 'select', schemaPath: 'bible.physical.intimate.breasts.size',        pool: () => breastPoolForGender(playerStudioDraft.gender).size },
      { path: 'physical.intimate.breasts.shape',       label: 'Shape',       kind: 'select', schemaPath: 'bible.physical.intimate.breasts.shape',       pool: () => breastPoolForGender(playerStudioDraft.gender).shape },
      { path: 'physical.intimate.breasts.nipples',     label: 'Nipples',     kind: 'select', schemaPath: 'bible.physical.intimate.breasts.nipples',     pool: () => PHYS_POOL_BREAST_NIPPLES },
      { path: 'physical.intimate.breasts.areola',      label: 'Areolae',     kind: 'select', schemaPath: 'bible.physical.intimate.breasts.areola',      pool: () => PHYS_POOL_BREAST_AREOLA },
      { path: 'physical.intimate.breasts.sensitivity', label: 'Sensitivity', kind: 'select', schemaPath: 'bible.physical.intimate.breasts.sensitivity', pool: () => PHYS_POOL_SENSITIVITY },
    ] },
    { label: 'Anatomy', hint: 'Add as many as you like — more than one is how you build a body the gender list has no single word for.',
      fields: [{ path: 'physical.intimate.genitals', label: '', kind: 'rows' }] },
    { label: 'Grooming', fields: [
      { path: 'physical.intimate.bodyHair', label: 'Body hair', kind: 'select', schemaPath: 'bible.physical.intimate.bodyHair', pool: () => PHYS_POOL_BODY_HAIR },
    ] },
  ] },

  { id: 'portrait', label: 'Portrait', sections: [] },   // built by renderStudioPortraitTab
];

// Add/remove row groups. One builder serves all three because they differ in
// exactly one way: whether the row's fields are fixed, or dispatched on a
// `type` value the row itself carries. `fieldsByType` is the typed variant
// and comes straight from GENITAL_TYPE_FIELDS (config) — the same table the
// roller and the describer read, so the studio can never offer a key the
// prose would ignore.
const STUDIO_ROW_GROUPS = {
  'physical.piercings': {
    addLabel: 'Add piercing', max: 6, empty: 'None.',
    fields: {
      location: { label: 'Location', pool: () => PHYS_POOL_PIERCING_LOC },
      type:     { label: 'Type',     pool: () => PHYS_POOL_PIERCING_TYPE },
    },
    blank: () => ({ location: PHYS_POOL_PIERCING_LOC[0], type: PHYS_POOL_PIERCING_TYPE[0], description: '' }),
    title: (row) => `${row.type || 'piercing'} — ${row.location || '?'}`,
  },
  'physical.tattoos': {
    addLabel: 'Add tattoo', max: 6, empty: 'None.',
    fields: {
      location: { label: 'Location', pool: () => PHYS_POOL_TATTOO_LOC },
      style:    { label: 'Style',    pool: () => PHYS_POOL_TATTOO_STYLE },
    },
    blank: () => ({ location: PHYS_POOL_TATTOO_LOC[0], style: PHYS_POOL_TATTOO_STYLE[0], description: '' }),
    title: (row) => `${row.style || 'tattoo'} — ${row.location || '?'}`,
  },
  'physical.intimate.genitals': {
    addLabel: 'Add anatomy', max: 4, empty: 'None. Leave empty to roll from your gender.',
    typeKey: 'type',
    typePool: () => PHYS_POOL_GENITAL_TYPES,
    fieldsByType: () => GENITAL_TYPE_FIELDS,
    blank: () => rollStudioGenitalBlank(PHYS_POOL_GENITAL_TYPES[0]),
    title: (row) => row.type || 'anatomy',
  },
};

// A new genital row starts on the FIRST value of each of its pools rather
// than empty, so adding one produces a describable body immediately instead
// of a row of blanks the player has to fill before it means anything.
function rollStudioGenitalBlank(type) {
  const fields = GENITAL_TYPE_FIELDS[type];
  if (!fields) return { type };
  const row = { type };
  for (const [key, spec] of Object.entries(fields)) {
    row[key] = spec.pool ? spec.pool()[0] : '';
  }
  return row;
}

// Which field specs a row actually shows: fixed for piercings/tattoos,
// dispatched on the row's own `type` for genitals.
function studioRowFields(group, row) {
  if (!group.fieldsByType) return group.fields || {};
  const byType = group.fieldsByType()[row?.[group.typeKey]] || {};
  // `description` gets its own full-width control below the grid.
  const out = {};
  for (const [k, v] of Object.entries(byType)) if (k !== 'description') out[k] = v;
  return out;
}

// --- Draft path access ---
function studioGet(path) {
  let cur = playerStudioDraft;
  for (const seg of String(path).split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
}

function studioSet(path, value) {
  const segs = String(path).split('.');
  let node = playerStudioDraft;
  for (const seg of segs.slice(0, -1)) node = (node[seg] = node[seg] || {});
  const key = segs[segs.length - 1];
  // An empty value DELETES rather than storing '' — the draft's contract is
  // "only what was authored", and a stored '' would read as "the player chose
  // blank" and suppress the roll.
  if (value === '' || value === null || value === undefined) delete node[key];
  else node[key] = value;
}

// The validation boundary. Fields carrying a schemaPath go through
// validateNpcField against CHARACTER_SCHEMA — the same call the Character
// Studio's Edit Mode and the save validator make. Fields without one (name,
// surname, age) are local to the player and checked here.
function validateStudioField(field, value) {
  if (value === '') return { ok: true, value: '' };
  if (field.kind === 'number') {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return { ok: false, error: `${field.label} must be a number` };
    return { ok: true, value: clamp(n, field.min ?? 0, field.max ?? 999) };
  }
  if (field.schemaPath) {
    const r = validateNpcField(field.schemaPath, value);
    return r.ok ? { ok: true, value: r.value } : r;
  }
  let v = String(value);
  if (field.maxLength && v.length > field.maxLength) v = v.slice(0, field.maxLength);
  return { ok: true, value: v };
}

// The Full body checkbox's payload: copy each build-equivalent into its
// field, skipping anything the target's own pool can't hold. Updates the
// open selects in place (no re-render, no focus loss).
function applyStudioBuildLink(build) {
  const link = BUILD_FULL_BODY_LINK[build];
  if (!link) return;
  let changed = false;
  for (const [path, val] of Object.entries(link)) {
    const field = findStudioField(path);
    if (!field) continue;
    if (field.kind === 'select' && field.pool && !field.pool().includes(val)) continue;
    if (studioGet(path) === val) continue;
    studioSet(path, val);
    const sel = [...document.querySelectorAll('[data-studio-path]')].find(s => s.getAttribute('data-studio-path') === path);
    if (sel) sel.value = val;
    changed = true;
  }
  if (changed && !playerStudioDraft.portrait.promptDirty) playerStudioDraft.portrait.prompt = '';
}

// --- Surface ---
function openPlayerStudio() {
  playerStudioDraft = blankPlayerDraft();
  playerStudioTab = 'identity';
  playerStudioPortraitUrl = null;
  playerStudioBusy = false;
  studioFullBodyLink = false;
  const el = document.getElementById('player-studio');
  if (!el) return;
  // Idempotent (guards on data-wired), so this is the honest place for it:
  // the listeners exist exactly when the surface does, and nothing in boot()
  // has to remember a surface it never opens.
  wirePlayerStudioInputs();
  el.hidden = false;
  // Deliberately does NOT close the main menu: the studio opens OVER the
  // title screen, so pressing New Game never blanks the backdrop the player
  // is looking at. Cancel just hides this again and the menu is still there.
  renderPlayerStudio();
}

function closePlayerStudio() {
  const el = document.getElementById('player-studio');
  if (el) el.hidden = true;
  if (playerStudioPortraitUrl) {
    URL.revokeObjectURL(playerStudioPortraitUrl);
    playerStudioPortraitUrl = null;
  }
}

function renderPlayerStudio() {
  const tabsEl = document.getElementById('ps-tabs');
  const bodyEl = document.getElementById('ps-body');
  if (!tabsEl || !bodyEl) return;

  tabsEl.innerHTML = '';
  for (const tab of PLAYER_STUDIO_TABS) {
    const btn = document.createElement('button');
    btn.className = 'ps-tab' + (tab.id === playerStudioTab ? ' active' : '');
    btn.setAttribute('data-action', 'studio.tab');
    btn.setAttribute('data-row-id', tab.id);
    btn.textContent = tab.label;
    tabsEl.appendChild(btn);
  }

  bodyEl.innerHTML = '';
  const tab = PLAYER_STUDIO_TABS.find(t => t.id === playerStudioTab) || PLAYER_STUDIO_TABS[0];
  if (tab.id === 'portrait') {
    renderStudioPortraitTab(bodyEl);
  } else {
    for (const section of tab.sections) bodyEl.appendChild(buildStudioSection(section));
  }

  updateStudioNameNote();
}

// Refreshes only the "who you are" summary line under the studio header.
// Called on every name/surname keystroke — deliberately NOT renderPlayerStudio,
// which rebuilds the whole form and would destroy the focused input, closing
// the mobile keyboard on every typed character.
function updateStudioNameNote() {
  const nameNote = document.getElementById('ps-name-note');
  if (!nameNote) return;
  const n = (playerStudioDraft.name || '').trim();
  const s = (playerStudioDraft.surname || '').trim();
  nameNote.textContent = n || s
    ? `${n || '(rolled)'} ${s || '(rolled)'}`
    : 'Everything unset will be rolled for you.';
}

function buildStudioSection(section) {
  const wrap = document.createElement('div');
  wrap.className = 'ps-section';
  if (section.label) {
    const h = document.createElement('h3');
    h.className = 'ps-section-title';
    h.textContent = section.label;
    wrap.appendChild(h);
  }
  if (section.hint) {
    const p = document.createElement('p');
    p.className = 'ps-hint';
    p.textContent = section.hint;
    wrap.appendChild(p);
  }
  const grid = document.createElement('div');
  grid.className = 'ps-grid';
  for (const field of section.fields) {
    // Row groups and toggle grids span the full width; plain fields sit in
    // the two-column grid.
    if (field.kind === 'rows' || field.kind === 'toggles') {
      wrap.appendChild(field.kind === 'rows' ? buildStudioRows(field) : buildStudioToggles(field));
    } else {
      grid.appendChild(buildStudioField(field));
    }
  }
  if (grid.children.length > 0) wrap.appendChild(grid);
  return wrap;
}

function buildStudioField(field) {
  const wrap = document.createElement('div');
  wrap.className = 'ps-field';
  const label = document.createElement('label');
  label.className = 'ps-label';
  label.textContent = field.label;
  wrap.appendChild(label);

  const current = studioGet(field.path);
  let control;
  if (field.kind === 'select') {
    control = document.createElement('select');
    // Empty value = "Roll it", and it is the default: the form's standing
    // promise, carried over from the old PLAYER_LOOK_FIELDS block, is that a
    // blank field rolls.
    const rollOpt = document.createElement('option');
    rollOpt.value = '';
    rollOpt.textContent = 'Roll it';
    control.appendChild(rollOpt);
    for (const val of field.pool()) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = studioPrettify(val);
      control.appendChild(opt);
    }
    control.value = current ?? '';
  } else if (field.kind === 'number') {
    control = document.createElement('input');
    control.type = 'number';
    if (field.min !== undefined) control.min = field.min;
    if (field.max !== undefined) control.max = field.max;
    control.placeholder = field.placeholder || '';
    control.value = current ?? '';
  } else {
    control = document.createElement('input');
    control.type = 'text';
    if (field.maxLength) control.maxLength = field.maxLength;
    control.placeholder = field.placeholder || '';
    control.value = current ?? '';
  }
  control.className = 'ps-control';
  control.setAttribute('data-studio-path', field.path);
  wrap.appendChild(control);

  if (field.path === 'physical.build') {
    const cbWrap = document.createElement('label');
    cbWrap.className = 'ps-fullbody';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = studioFullBodyLink;
    cb.setAttribute('data-studio-fullbody', '');
    cbWrap.appendChild(cb);
    const cbLabel = document.createElement('span');
    cbLabel.textContent = 'Full body?';
    cbWrap.appendChild(cbLabel);
    wrap.appendChild(cbWrap);
  }

  if (field.hint) {
    const hint = document.createElement('div');
    hint.className = 'ps-field-hint';
    hint.textContent = field.hint;
    wrap.appendChild(hint);
  }
  return wrap;
}

// Multi-select over a flat string pool, capped at `max`. Same shape as the
// Character Studio's studioPoolPickerFor, routed to this surface's action.
// Studio-only sentinels for the Distinguishing features toggles. A toggle
// grid can only hold strings, so "no features at all" and "I'll write my own"
// are encoded as these two markers (plus a free-text sibling field for the
// custom text) and flattened away the moment the draft leaves the studio —
// they must never reach the schema, the save, or the describer. See
// flattenStudioFeatures.
const FEATURES_NONE = '__none__';
const FEATURES_CUSTOM = '__custom__';

function buildStudioToggles(field) {
  const wrap = document.createElement('div');
  wrap.className = 'ps-toggles';
  const selected = new Set(studioGet(field.path) || []);
  const isFeatures = field.path === 'physical.distinguishingFeatures';

  // The Marks toggles get two special controls that a bare grid can't hold:
  // an explicit "None" (no features — even better than leaving it unset,
  // which silently rolls 1-2 for you) and "Custom" (type your own), which
  // reveals a free-text field below the grid. Both are sentinel values in
  // the same array so the one toggle engine serves all three cases.
  if (isFeatures) {
    const special = document.createElement('div');
    special.className = 'ps-toggle-special';
    for (const [val, label] of [['__none__', 'None'], ['__custom__', 'Custom']]) {
      const btn = document.createElement('button');
      btn.className = 'ps-toggle ps-toggle-special-btn' + (selected.has(val) ? ' active' : '');
      btn.setAttribute('data-action', 'studio.toggle');
      btn.setAttribute('data-row-id', `${field.path}|${val}`);
      btn.textContent = label;
      special.appendChild(btn);
    }
    wrap.appendChild(special);
  }

  const grid = document.createElement('div');
  grid.className = 'ps-toggle-grid' + (selected.has(FEATURES_NONE) ? ' disabled' : '');
  for (const val of field.pool()) {
    const btn = document.createElement('button');
    btn.className = 'ps-toggle' + (selected.has(val) ? ' active' : '');
    btn.setAttribute('data-action', 'studio.toggle');
    btn.setAttribute('data-row-id', `${field.path}|${val}`);
    btn.textContent = studioPrettify(val);
    btn.disabled = selected.has(FEATURES_NONE);
    grid.appendChild(btn);
  }
  wrap.appendChild(grid);

  if (isFeatures && selected.has(FEATURES_CUSTOM)) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ps-control ps-features-custom';
    input.maxLength = 200;
    input.placeholder = 'e.g. a lightning-shaped scar, a sleeve of bad tattoos, heterochromia';
    input.value = studioGet('physical.distinguishingFeaturesCustom') || '';
    input.setAttribute('data-studio-features-custom', '');
    wrap.appendChild(input);
  }

  const note = document.createElement('div');
  note.className = 'ps-field-hint';
  if (selected.has(FEATURES_NONE)) {
    note.textContent = 'No distinguishing features.';
  } else {
    const real = [...selected].filter(v => v !== FEATURES_NONE && v !== FEATURES_CUSTOM).length;
    note.textContent = real === 0
      ? `None chosen — one or two will be rolled for you. Pick up to ${field.max}, or choose None above.`
      : `${real} of ${field.max} chosen.${selected.has(FEATURES_CUSTOM) ? ' Custom features will be added to these.' : ''}`;
  }
  wrap.appendChild(note);
  return wrap;
}

function buildStudioRows(field) {
  const group = STUDIO_ROW_GROUPS[field.path];
  const wrap = document.createElement('div');
  wrap.className = 'ps-rows';
  if (!group) return wrap;

  const rows = studioGet(field.path) || [];
  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ps-hint';
    empty.textContent = group.empty;
    wrap.appendChild(empty);
  }

  rows.forEach((row, idx) => {
    const card = document.createElement('div');
    card.className = 'ps-row';

    const head = document.createElement('div');
    head.className = 'ps-row-head';
    const title = document.createElement('span');
    title.className = 'ps-row-title';
    title.textContent = studioPrettify(group.title(row));
    head.appendChild(title);
    const del = document.createElement('button');
    del.className = 'ps-row-remove';
    del.setAttribute('data-action', 'studio.row-remove');
    del.setAttribute('data-row-id', `${field.path}|${idx}`);
    del.textContent = 'Remove';
    head.appendChild(del);
    card.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'ps-grid';

    // The type selector comes first for a typed group — changing it rebuilds
    // the rest of the row, since a different type shows different fields.
    if (group.typeKey) {
      grid.appendChild(buildStudioRowControl(
        field.path, idx, group.typeKey, 'Type', group.typePool(), row[group.typeKey]));
    }
    for (const [key, spec] of Object.entries(studioRowFields(group, row))) {
      grid.appendChild(buildStudioRowControl(field.path, idx, key, spec.label, spec.pool ? spec.pool() : null, row[key]));
    }
    card.appendChild(grid);

    // Free-text note, full width under the grid.
    const noteWrap = document.createElement('div');
    noteWrap.className = 'ps-field';
    const noteLabel = document.createElement('label');
    noteLabel.className = 'ps-label';
    noteLabel.textContent = 'Notes';
    const note = document.createElement('input');
    note.type = 'text';
    note.className = 'ps-control';
    note.maxLength = 200;
    note.placeholder = 'Optional detail';
    note.value = row.description || '';
    note.setAttribute('data-studio-row', `${field.path}|${idx}|description`);
    noteWrap.appendChild(noteLabel);
    noteWrap.appendChild(note);
    card.appendChild(noteWrap);

    wrap.appendChild(card);
  });

  if (rows.length < group.max) {
    const add = document.createElement('button');
    add.className = 'ps-add';
    add.setAttribute('data-action', 'studio.row-add');
    add.setAttribute('data-row-id', field.path);
    add.textContent = `+ ${group.addLabel}`;
    wrap.appendChild(add);
  }
  return wrap;
}

function buildStudioRowControl(arrayPath, idx, key, label, pool, value) {
  const wrap = document.createElement('div');
  wrap.className = 'ps-field';
  const lab = document.createElement('label');
  lab.className = 'ps-label';
  lab.textContent = label;
  wrap.appendChild(lab);
  let control;
  if (pool) {
    control = document.createElement('select');
    for (const val of pool) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = studioPrettify(val);
      control.appendChild(opt);
    }
    control.value = value ?? pool[0];
  } else {
    control = document.createElement('input');
    control.type = 'text';
    control.value = value ?? '';
  }
  control.className = 'ps-control';
  control.setAttribute('data-studio-row', `${arrayPath}|${idx}|${key}`);
  wrap.appendChild(control);
  return wrap;
}

function studioPrettify(v) {
  return String(v).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

// --- Actions ---
function doStudioTab(tabId) {
  if (!PLAYER_STUDIO_TABS.some(t => t.id === tabId)) return;
  playerStudioTab = tabId;
  renderPlayerStudio();
}

function doStudioToggle(rowId) {
  const [path, value] = String(rowId).split('|');
  const field = findStudioField(path);
  if (!field) return;
  const isFeatures = path === 'physical.distinguishingFeatures';
  const current = studioGet(path) || [];
  let next;
  // None is exclusive: it clears every real feature AND the custom marker.
  // Choosing a real feature again clears None. Custom coexists with real
  // picks but never with None.
  if (isFeatures && value === FEATURES_NONE) {
    next = current.includes(FEATURES_NONE) ? [] : [FEATURES_NONE];
  } else if (isFeatures && value === FEATURES_CUSTOM) {
    next = current.includes(FEATURES_CUSTOM)
      ? current.filter(v => v !== FEATURES_CUSTOM)
      : [...current.filter(v => v !== FEATURES_NONE), FEATURES_CUSTOM];
  } else {
    next = current.includes(value)
      ? current.filter(v => v !== value)
      : (current.filter(v => v !== FEATURES_NONE && v !== FEATURES_CUSTOM).length >= (field.max ?? 99)
          ? current
          : [...current, value]);
    if (isFeatures) next = next.filter(v => v !== FEATURES_NONE);
  }
  if (next.length === 0) studioSet(path, '');   // empty deletes → back to rolling
  else studioSet(path, next);
  renderPlayerStudio();
}

function doStudioRowAdd(path) {
  const group = STUDIO_ROW_GROUPS[path];
  if (!group) return;
  const rows = studioGet(path) || [];
  if (rows.length >= group.max) return;
  studioSet(path, [...rows, group.blank()]);
  renderPlayerStudio();
}

function doStudioRowRemove(rowId) {
  const [path, idxRaw] = String(rowId).split('|');
  const idx = Number(idxRaw);
  const rows = studioGet(path) || [];
  if (!Number.isInteger(idx) || idx < 0 || idx >= rows.length) return;
  const next = rows.filter((_, i) => i !== idx);
  if (next.length === 0) studioSet(path, '');   // empty deletes → back to rolling
  else studioSet(path, next);
  renderPlayerStudio();
}

function findStudioField(path) {
  for (const tab of PLAYER_STUDIO_TABS) {
    for (const section of tab.sections) {
      const f = section.fields.find(x => x.path === path);
      if (f) return f;
    }
  }
  return null;
}

// Fill every unset field from a real generatePlayerAppearance draw, so the
// player starts from a person rather than a blank sheet. Uses the SAME
// generator new-game will use, which is the point — nothing here can produce
// a body the game would not have rolled on its own.
function doStudioRollAll() {
  const seed = genSeed();
  // The Mark toggles' None/Custom sentinels are studio-only; strip them from
  // the authored object before the roller sees it (an unset features field is
  // what triggers the roll), then restore the toggle state on the result so
  // the player's None/Custom choice survives Roll Everything.
  const authoredPhysical = JSON.parse(JSON.stringify(playerStudioDraft.physical || {}));
  const featuresState = {
    none: (authoredPhysical.distinguishingFeatures || []).includes(FEATURES_NONE),
    custom: (authoredPhysical.distinguishingFeatures || []).includes(FEATURES_CUSTOM),
    customText: authoredPhysical.distinguishingFeaturesCustom || '',
  };
  flattenStudioFeatures(authoredPhysical);
  const rolled = generatePlayerAppearance(seed, {
    // Anything already authored is preserved: Roll Everything fills the
    // blanks, it does not overwrite the player's choices.
    age: playerStudioDraft.age ?? undefined,
    gender: playerStudioDraft.gender || undefined,
    physical: authoredPhysical,
  });
  const names = rollPlayerName(seed, rolled.gender, playerStudioDraft);
  playerStudioDraft.name = playerStudioDraft.name || names.name;
  playerStudioDraft.surname = playerStudioDraft.surname || names.surname;
  playerStudioDraft.age = rolled.age;
  playerStudioDraft.gender = rolled.gender;
  if (featuresState.none) rolled.physical.distinguishingFeatures = [FEATURES_NONE];
  else if (featuresState.custom) rolled.physical.distinguishingFeatures = [FEATURES_CUSTOM, ...rolled.physical.distinguishingFeatures];
  rolled.physical.distinguishingFeaturesCustom = featuresState.customText;
  playerStudioDraft.physical = rolled.physical;
  // The portrait prompt is derived from the fields, so a full reroll
  // invalidates it — UNLESS the player hand-edited it, which is permanent
  // (see the Portrait tab).
  if (!playerStudioDraft.portrait.promptDirty) playerStudioDraft.portrait.prompt = '';
  renderPlayerStudio();
}

function doStudioClearAll() {
  const portrait = playerStudioDraft.portrait;
  playerStudioDraft = blankPlayerDraft();
  // A hand-edited prompt survives Clear — it is authored content, and the
  // whole promise of the edit is that nothing overwrites it.
  if (portrait.promptDirty) playerStudioDraft.portrait = portrait;
  renderPlayerStudio();
}

function doStudioCancel() {
  closePlayerStudio();
  playerStudioDraft = null;
}

// The handoff. Everything the studio knows becomes the draft
// SIM_generateHouse takes; the cutscene plays; startSoloGame writes the game.
function doStudioConfirm() {
  if (playerStudioBusy) return;
  const draft = buildPlayerDraftForNewGame();
  closePlayerStudio();
  playerStudioDraft = null;
  playIntroCutscene(draft);
}

// Draft → the shape SIM_generateHouse's 4th parameter expects. Genital rows
// are normalized here (rather than at every edit) so a row whose type changed
// mid-edit cannot carry the previous type's keys into the save.
function buildPlayerDraftForNewGame() {
  const d = playerStudioDraft || blankPlayerDraft();
  const physical = JSON.parse(JSON.stringify(d.physical || {}));
  if (physical.intimate && Array.isArray(physical.intimate.genitals)) {
    physical.intimate.genitals = normalizeGenitals(physical.intimate.genitals);
  }
  return {
    name: (d.name || '').trim(),
    surname: (d.surname || '').trim(),
    age: Number.isFinite(d.age) ? d.age : undefined,
    gender: d.gender || undefined,
    physical: flattenStudioFeatures(physical),
    portrait: { ...d.portrait },
  };
}

// The Mark toggles' None/Custom sentinels are studio UI, not character data.
// This is the single cleanup: `__none__` → no features (the empty array is
// the real value — it explicitly means "don't roll any", unlike an absent
// field which rolls 1-2), `__custom__` + the sibling free-text field → real
// feature strings (split on commas/semicolons), and the raw picks pass
// through untouched. Mutates the passed object's own properties; safe on a
// shallow copy, which is what every caller hands it.
function flattenStudioFeatures(physical) {
  if (!physical) return physical;
  const raw = physical.distinguishingFeatures;
  if (Array.isArray(raw)) {
    const none = raw.includes(FEATURES_NONE);
    const custom = raw.includes(FEATURES_CUSTOM);
    const picked = raw.filter(v => v !== FEATURES_NONE && v !== FEATURES_CUSTOM);
    const customText = String(physical.distinguishingFeaturesCustom || '')
      .split(/[,;]/).map(s => s.trim()).filter(Boolean);
    physical.distinguishingFeatures = (none || picked.length === 0 && customText.length === 0)
      ? []
      : [...picked, ...customText];
  }
  delete physical.distinguishingFeaturesCustom;
  return physical;
}

// --- Portrait tab (Phase 4) ---
function renderStudioPortraitTab(bodyEl) {
  const wrap = document.createElement('div');
  wrap.className = 'ps-section';

  const intro = document.createElement('p');
  intro.className = 'ps-hint';
  intro.textContent = 'The prompt is built from everything you filled in. Edit it freely — '
    + 'once you do, it stops rebuilding itself, so changing a field afterward will not overwrite your wording.';
  wrap.appendChild(intro);

  const layout = document.createElement('div');
  layout.className = 'ps-portrait-layout';

  // Preview
  const pane = document.createElement('div');
  pane.className = 'ps-portrait-pane';
  const img = document.createElement('img');
  img.className = 'ps-portrait-img';
  img.id = 'ps-portrait-img';
  img.alt = '';
  if (playerStudioPortraitUrl) img.src = playerStudioPortraitUrl;
  else img.hidden = true;
  pane.appendChild(img);
  if (!playerStudioPortraitUrl) {
    const ph = document.createElement('div');
    ph.className = 'ps-portrait-placeholder';
    ph.id = 'ps-portrait-placeholder';
    ph.textContent = playerStudioBusy ? 'Generating…' : 'No portrait yet.';
    pane.appendChild(ph);
  }
  layout.appendChild(pane);

  // Prompt + controls
  const side = document.createElement('div');
  side.className = 'ps-portrait-side';

  const label = document.createElement('label');
  label.className = 'ps-label';
  label.textContent = 'Image prompt';
  side.appendChild(label);

  const ta = document.createElement('textarea');
  ta.className = 'ps-control ps-prompt';
  ta.id = 'ps-prompt';
  ta.rows = 8;
  ta.value = playerStudioDraft.portrait.prompt || buildPlayerPortraitPrompt(buildPlayerDraftForNewGame());
  side.appendChild(ta);

  const state = document.createElement('div');
  state.className = 'ps-field-hint';
  state.id = 'ps-prompt-state';
  state.textContent = playerStudioDraft.portrait.promptDirty
    ? 'Edited by you — this prompt is now yours and will not be rebuilt.'
    : 'Built from your fields. It will refresh as you change them.';
  side.appendChild(state);

  const btns = document.createElement('div');
  btns.className = 'ps-portrait-btns';
  const gen = document.createElement('button');
  gen.className = 'ps-btn';
  gen.setAttribute('data-action', 'studio.portrait-generate');
  gen.textContent = playerStudioPortraitUrl ? 'Regenerate' : 'Generate portrait';
  gen.disabled = playerStudioBusy;
  btns.appendChild(gen);
  const reset = document.createElement('button');
  reset.className = 'ps-btn ps-btn-secondary';
  reset.setAttribute('data-action', 'studio.portrait-reset');
  reset.textContent = 'Rebuild from fields';
  reset.disabled = !playerStudioDraft.portrait.promptDirty;
  btns.appendChild(reset);
  side.appendChild(btns);

  layout.appendChild(side);
  wrap.appendChild(layout);
  bodyEl.appendChild(wrap);
}

async function doStudioPortraitGenerate() {
  if (playerStudioBusy) return;
  const ta = document.getElementById('ps-prompt');
  const prompt = (ta?.value || '').trim();
  if (!prompt) return;
  playerStudioDraft.portrait.prompt = prompt;
  // A stable seed per prompt, so regenerating an unchanged prompt reproduces
  // the same face rather than rerolling it — the contract getCharacterImage
  // already relies on for NPC portraits.
  playerStudioDraft.portrait.seed = hashStr(prompt);
  playerStudioBusy = true;
  renderPlayerStudio();
  try {
    const res = await getPlayerPortraitImage(playerStudioDraft.portrait);
    if (res.url) {
      if (playerStudioPortraitUrl) URL.revokeObjectURL(playerStudioPortraitUrl);
      playerStudioPortraitUrl = res.url;
    }
  } catch (e) {
    console.warn('Portrait generation failed:', e);
  } finally {
    playerStudioBusy = false;
    renderPlayerStudio();
  }
}

function doStudioPortraitReset() {
  playerStudioDraft.portrait.promptDirty = false;
  playerStudioDraft.portrait.prompt = '';
  renderPlayerStudio();
}

// --- Input wiring ---
// Form controls are handled here rather than through ui.js's data-action
// chain: a select or a text input reports through change/input events, not
// clicks, and every one of them routes to the same two handlers by reading
// its own data-studio-path / data-studio-row attribute. One listener pair on
// the container, attached once.
function wirePlayerStudioInputs() {
  const root = document.getElementById('player-studio');
  if (!root || root.hasAttribute('data-wired')) return;
  root.setAttribute('data-wired', '');

  const handle = (e) => {
    const el = e.target;
    if (!playerStudioDraft) return;

    // The Custom free-text field for distinguishing features — a sibling
    // store to the toggles array, flattened away at draft exit.
    if (el.getAttribute?.('data-studio-features-custom') != null) {
      if (!playerStudioDraft.physical) playerStudioDraft.physical = {};
      playerStudioDraft.physical.distinguishingFeaturesCustom = el.value;
      if (!playerStudioDraft.portrait.promptDirty) playerStudioDraft.portrait.prompt = '';
      return;
    }

    // The Full body checkbox beside Build. A convenience, not a stored
    // field: checking it links the picked build to every body field with
    // an equivalent option.
    if (el.getAttribute?.('data-studio-fullbody') != null) {
      studioFullBodyLink = el.checked;
      if (el.checked) applyStudioBuildLink(studioGet('physical.build') || '');
      return;
    }

    const rowAttr = el.getAttribute?.('data-studio-row');
    if (rowAttr) {
      const [path, idxRaw, key] = rowAttr.split('|');
      const rows = studioGet(path);
      if (!Array.isArray(rows)) return;
      const idx = Number(idxRaw);
      if (!rows[idx]) return;
      rows[idx][key] = el.value;
      const group = STUDIO_ROW_GROUPS[path];
      // Changing the discriminator changes which fields the row HAS, so the
      // row is rebuilt from scratch on that key and left alone on any other —
      // otherwise a vagina row keeps the penis keys it was showing a moment
      // ago and normalizeGenitals silently drops the player's edits later.
      if (group?.typeKey && key === group.typeKey) {
        rows[idx] = rollStudioGenitalBlank(el.value);
        renderPlayerStudio();
      } else if (group?.title) {
        // Retitle in place; a full re-render would steal focus mid-typing.
        const card = el.closest('.ps-row')?.querySelector('.ps-row-title');
        if (card) card.textContent = studioPrettify(group.title(rows[idx]));
      }
      return;
    }

    const path = el.getAttribute?.('data-studio-path');
    if (!path) return;
    const field = findStudioField(path);
    if (!field) return;
    const res = validateStudioField(field, el.value);
    if (!res.ok) {
      showStudioNote(res.error);
      el.value = studioGet(path) ?? '';
      return;
    }
    studioSet(path, res.value);
    // Full body link: with the checkbox on, picking a build populates every
    // body field that has an equivalent option.
    if (path === 'physical.build' && studioFullBodyLink) applyStudioBuildLink(res.value);
    // The portrait prompt is derived from these fields; a change invalidates
    // a machine-built one. A hand-edited one is never touched (D6).
    if (!playerStudioDraft.portrait.promptDirty) playerStudioDraft.portrait.prompt = '';
    const note = document.getElementById('ps-name-note');
    if (note && (path === 'name' || path === 'surname')) updateStudioNameNote();
  };

  root.addEventListener('change', handle);
  // Text inputs also report on `input` so typing is captured without needing
  // a blur; selects fire only `change`, so both are wired and the handler is
  // idempotent.
  root.addEventListener('input', (e) => {
    if (e.target?.id === 'ps-prompt') {
      // THE latch (D6). The moment the player types in the prompt box it
      // becomes theirs: no field change, no reroll, and no confirm rebuilds
      // it. Only "Rebuild from fields" clears this, explicitly.
      playerStudioDraft.portrait.promptDirty = true;
      playerStudioDraft.portrait.prompt = e.target.value;
      const state = document.getElementById('ps-prompt-state');
      if (state) state.textContent = 'Edited by you — this prompt is now yours and will not be rebuilt.';
      const reset = document.querySelector('[data-action="studio.portrait-reset"]');
      if (reset) reset.disabled = false;
      return;
    }
    if (e.target?.type === 'text' || e.target?.type === 'number') handle(e);
  });
}

function showStudioNote(msg) {
  const el = document.getElementById('ps-note');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showStudioNote._t);
  showStudioNote._t = setTimeout(() => { el.hidden = true; }, 3500);
}

// ===== /SECTION: STUDIO =====

// ===== SECTION: INTRO =====
// The opening cutscene player. The script is data (DEFS.INTRO's INTRO_BEATS);
// this is the projector.
//
// Three properties worth stating, because each is a decision rather than an
// accident:
//
//  1. It NEVER blocks on art. A beat's text renders immediately; the image
//     arrives underneath it or does not. A blank URL, a broken URL and a slow
//     URL are all the same case, handled the same way.
//  2. It always ends in exactly one place — finishIntro → startSoloGame —
//     whether the player watched every beat or hit Skip on the first. There
//     is no second path into play to keep in sync.
//  3. It preloads the NEXT beat's image only. Preloading the whole reel would
//     stall the first frame behind sixteen requests, which is the opposite of
//     what a cutscene needs.

let introState = null;   // { beats, idx, draft }

function playIntroCutscene(draft) {
  const beats = Array.isArray(INTRO_BEATS) ? INTRO_BEATS : [];
  // No script is not a reason to refuse to start the game.
  if (beats.length === 0) { finishIntro(draft); return; }
  introState = { beats, idx: 0, draft };
  const el = document.getElementById('intro-cutscene');
  if (!el) { finishIntro(draft); return; }
  el.hidden = false;
  renderIntroBeat();
}

function renderIntroBeat() {
  if (!introState) return;
  const beat = introState.beats[introState.idx];
  if (!beat) { doIntroSkip(); return; }

  const imgA = document.getElementById('intro-img-a');
  const imgB = document.getElementById('intro-img-b');
  const textEl = document.getElementById('intro-text');
  const progressEl = document.getElementById('intro-progress');
  if (!textEl) return;

  // Two-layer crossfade, same technique as the title gallery: the incoming
  // image loads into whichever layer is currently hidden, then they swap.
  const showing = imgA?.classList.contains('visible') ? imgA : imgB;
  const incoming = showing === imgA ? imgB : imgA;
  const url = introBeatImage(beat);
  const stage = document.getElementById('intro-stage');
  if (incoming && url) {
    incoming.onload = () => {
      incoming.classList.add('visible');
      showing?.classList.remove('visible');
      stage?.classList.remove('no-art');
    };
    // A URL that 404s is the same case as no URL: keep whatever is on screen,
    // fall back to the art-less layout, and let the text carry the beat.
    incoming.onerror = () => {
      incoming.onload = null;
      imgA?.classList.remove('visible');
      imgB?.classList.remove('visible');
      stage?.classList.add('no-art');
    };
    incoming.src = url;
  } else if (!url) {
    imgA?.classList.remove('visible');
    imgB?.classList.remove('visible');
    stage?.classList.add('no-art');
  }

  textEl.innerHTML = '';
  if (beat.sfx) {
    const sfx = document.createElement('div');
    sfx.className = 'intro-sfx';
    sfx.textContent = beat.sfx;
    textEl.appendChild(sfx);
  }
  for (const line of beat.lines || []) {
    const p = document.createElement('p');
    p.className = 'intro-line'
      + (line.speaker ? ` intro-line-${line.speaker}` : ' intro-line-caption')
      + (beat.caption ? ' intro-line-titlecard' : '');
    p.textContent = introInterpolate(line.text, introState.draft);
    textEl.appendChild(p);
  }

  if (progressEl) progressEl.textContent = `${introState.idx + 1} / ${introState.beats.length}`;
  preloadNextIntroImage();
}

// A beat's image, or '' when there is nothing to show. Kept as its own
// function so "is there art for this beat" is one question with one answer,
// asked identically by the renderer and the preloader.
function introBeatImage(beat) {
  const url = beat && typeof beat.image === 'string' ? beat.image.trim() : '';
  return url;
}

function preloadNextIntroImage() {
  if (!introState) return;
  const next = introState.beats[introState.idx + 1];
  const url = introBeatImage(next);
  if (!url) return;
  const pre = new Image();
  pre.src = url;
}

function introInterpolate(text, draft) {
  return String(text || '').replace(/\{(\w+)\}/g, (whole, key) => {
    const v = draft ? draft[key] : '';
    // An unresolved token prints as nothing rather than as `{surname}` — a
    // stray brace in the middle of a line reads as a bug to the player, and
    // an empty gap reads as a pause.
    return typeof v === 'string' && v ? v : '';
  }).replace(/\s{2,}/g, ' ').trim();
}

function doIntroAdvance() {
  if (!introState) return;
  if (introState.idx >= introState.beats.length - 1) { doIntroSkip(); return; }
  introState.idx++;
  renderIntroBeat();
}

function doIntroBack() {
  if (!introState || introState.idx === 0) return;
  introState.idx--;
  renderIntroBeat();
}

// Skip and "watched it all" are the same ending, deliberately.
function doIntroSkip() {
  if (!introState) return;
  const draft = introState.draft;
  introState = null;
  const el = document.getElementById('intro-cutscene');
  if (el) el.hidden = true;
  finishIntro(draft);
}

function finishIntro(draft) {
  startSoloGame(draft);
}

// Space / Enter / → advance, ← goes back, Escape skips. Registered here
// rather than in UI's keydown handler so each surface owns its own keys —
// the same split the pause menu's Escape already uses. The guard matches
// MENU's `typeof window !== 'undefined'` idiom and exists for one reason:
// it is what lets this file load in dev/verify's headless harness, where
// `document` is undefined, so PLAYER_STUDIO_TABS and STUDIO_ROW_GROUPS can
// be asserted against CHARACTER_SCHEMA without a browser.
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (!introState) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      doIntroAdvance();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      doIntroBack();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      doIntroSkip();
    }
  });
}

// ===== /SECTION: INTRO =====
