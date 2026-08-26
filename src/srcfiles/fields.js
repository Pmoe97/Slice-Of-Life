// ===== SECTION: FIELDS =====
// Shared form-control builders for the character-editing surfaces.
//
// AI-Assisted Character Generation plan, Phase 1 (D1/D2). Every vocabulary
// control in this game was a `<select>` built from a `PHYS_POOL_*`-style
// array, which meant the array WAS the vocabulary: a value outside it could
// not be typed, and — the sharper half — could not be DISPLAYED. That second
// property is what makes this file a precondition for AI filling rather than
// a cosmetic upgrade. A generated "lavender undercut" written into a select
// built from PHYS_POOL_HAIR_COLOR renders as nothing selected; the value sits
// in the draft, invisible, until the next form harvest reads the control's
// empty `.value` and destroys it. The player watches their character revert
// with no error anywhere (plan design invariant 6).
//
// The line between "free text" and "picker" is drawn by the VALIDATOR, not by
// taste (plan D1/D2, design invariant 1): `validateNpcScalar` (state.js)
// applies a vocabulary gate only where CHARACTER_SCHEMA declares an `enum`.
// Everything else — every physical.* field, traits/quirks/likes/dislikes, the
// five narrative fields — is a plain string the describer concatenates
// straight into prose, so a novel value already survives end to end. Callers
// therefore reach for comboControl by default and keep a real <select> only
// for the four D2 categories: schema enums (gender, species, genitals[].type),
// SCHEDULES-keyed fields (occupation.scheduleTemplate), option sets carrying
// `disabled` state (the sandbox room/bed pickers), and numbers.
//
// Everything here is a pure DOM builder — no game state, no reads of
// currentGameState. The file loads in the vm harness (dev/verify/loadgame.js)
// because every document touch is guarded; the pure halves (fieldsDatalistId's
// slug/hash, offPoolValues) are directly testable there.

// --- Datalist plumbing ---
// A <datalist> resolves its `list=` by id from anywhere in the document, so
// the lists live in one hidden host rather than beside each input. That is
// what lets comboControl return a bare <input>: callers append the returned
// node exactly where they appended their old <select>, and every existing
// harvest path (`.value` off a data-* selector) keeps working untouched. A
// wrapper element would have broken all three call sites at once.
const FIELDS_DATALIST_HOST_ID = 'fields-datalist-host';

function fieldsDatalistHost() {
  if (typeof document === 'undefined' || !document.body) return null;
  let host = document.getElementById(FIELDS_DATALIST_HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = FIELDS_DATALIST_HOST_ID;
    host.hidden = true;
    document.body.appendChild(host);
  }
  return host;
}

// djb2. Only ever used to name a datalist, so collisions cost a wrong
// suggestion list and nothing else — but keying on CONTENT means two fields
// sharing a pool share one datalist node, which is what bounds the host's
// growth across re-renders. A key-based id would grow with the number of
// fields; this grows with the number of distinct pools (~50).
function fieldsPoolHash(pool) {
  let h = 5381;
  const s = pool.join('');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Ensure a datalist exists for this pool and return its id. Re-renders hit
// the existing node and rewrite its options rather than appending a second
// one, so opening the same tab fifty times leaves fifty times nothing behind.
function fieldsDatalistId(pool) {
  const host = fieldsDatalistHost();
  if (!host || !Array.isArray(pool) || pool.length === 0) return null;
  const id = `fields-dl-${fieldsPoolHash(pool)}`;
  let dl = document.getElementById(id);
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = id;
    host.appendChild(dl);
  } else if (dl.childElementCount === pool.length) {
    return id;   // already built from this exact pool (content-keyed id)
  }
  dl.innerHTML = '';
  for (const val of pool) {
    const opt = document.createElement('option');
    opt.value = typeof val === 'object' && val !== null ? String(val.value ?? '') : String(val);
    dl.appendChild(opt);
  }
  return id;
}

// --- The combo control ---
// A type-or-pick input: the pool shows as native suggestions, and anything
// the player types is kept verbatim. Returns the <input> itself so it is a
// drop-in for the <select> it replaces.
//
// opts:
//   value        current value ('' shows the placeholder)
//   pool         array of strings, or a thunk returning one (the PHYS_POOL_*
//                arrays are top-level consts read at call time, never at
//                definition time — the same reason PLAYER_STUDIO_TABS uses
//                thunks)
//   placeholder  the "Roll it" affordance: a blank field still rolls, so the
//                placeholder is where that promise is made now that there is
//                no empty <option> to carry it
//   maxLength    forwarded to the input
//   className    the surface's own control class, so the swap is invisible
//   attrs        data-* attributes copied verbatim — this is the whole
//                compatibility story with the existing harvest paths
function comboControl(opts) {
  const o = opts || {};
  if (typeof document === 'undefined') return null;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = o.className || 'combo-input';
  input.value = o.value == null ? '' : String(o.value);
  if (o.placeholder) input.placeholder = o.placeholder;
  if (o.maxLength) input.maxLength = o.maxLength;
  // Browser autofill fights a datalist for the same dropdown slot and wins,
  // which hides the pool entirely on a field named anything like "name".
  input.setAttribute('autocomplete', 'off');
  input.classList.add('combo-input');

  const pool = typeof o.pool === 'function' ? o.pool() : o.pool;
  const listId = fieldsDatalistId(Array.isArray(pool) ? pool : []);
  if (listId) input.setAttribute('list', listId);

  for (const [k, v] of Object.entries(o.attrs || {})) {
    if (v === undefined || v === null) continue;
    input.setAttribute(k, String(v));
  }
  return input;
}

// --- Off-pool selections in a multi-select grid ---
// A pool grid renders one button per pool entry and marks the selected ones
// active. A selected value that is NOT in the pool therefore renders as
// nothing at all — the grid's version of the invisible-value failure. This
// returns those orphans so a caller can render them as extra chips, which is
// what makes an AI-written quirk both visible and removable.
//
// `keyFn` exists because two of the four grids hold objects, not strings
// (INTEREST_POOL entries are `{name, tags}`), and the selection arrays hold
// names either way.
function offPoolValues(selected, pool, keyFn) {
  if (!Array.isArray(selected) || selected.length === 0) return [];
  const key = keyFn || ((x) => (typeof x === 'string' ? x : x && x.name));
  const known = new Set((pool || []).map(key).filter(Boolean).map(v => String(v).toLowerCase()));
  const seen = new Set();
  const out = [];
  for (const s of selected) {
    const name = typeof s === 'string' ? s : key(s);
    if (!name) continue;
    const lower = String(name).toLowerCase();
    if (known.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    out.push(name);
  }
  return out;
}

// --- "Add your own" row for a pool grid ---
// The grid's counterpart to comboControl. A text input plus an Add button;
// the button carries the caller's action verb and field path the same way
// every pool chip does, so the existing click-routing handles it and no new
// event plumbing is needed. The handler finds the text by looking up
// `[data-custom-for="<field>"]` — the input and the button agree on the field
// path, which is the only thing they need to share.
//
// opts: field, addAction, placeholder, className, btnClassName, maxLength
function customChipInput(opts) {
  const o = opts || {};
  if (typeof document === 'undefined') return null;
  const row = document.createElement('div');
  row.className = 'fields-custom-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = o.className || 'combo-input';
  input.placeholder = o.placeholder || 'Add your own…';
  input.maxLength = o.maxLength || 120;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('data-custom-for', o.field || '');
  row.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = o.btnClassName || 'btn tiny btn-secondary';
  if (o.addAction) btn.setAttribute('data-action', o.addAction);
  btn.setAttribute('data-row-id', o.field || '');
  btn.textContent = 'Add';
  row.appendChild(btn);

  return row;
}

// Read and clear the custom-value box for a field. Returns '' when the box is
// empty or absent, so a caller can bail without a second null check. Clearing
// here rather than at the call site is deliberate: every "add" handler wants
// the same reset, and forgetting it means the next Add silently re-adds the
// same value.
function takeCustomChipValue(field) {
  if (typeof document === 'undefined') return '';
  const el = document.querySelector(`[data-custom-for="${String(field).replace(/"/g, '\\"')}"]`);
  if (!el) return '';
  const val = String(el.value || '').trim();
  el.value = '';
  return val;
}

// ===== /SECTION: FIELDS =====
