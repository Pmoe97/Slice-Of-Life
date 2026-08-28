// ===== SECTION: AVATAR =====
// One avatar component, for every surface that shows a person.
// avatars-and-sprite-studio-plan.md, Phase 2 (D10/D11).
//
// Before this file there were TWENTY-SIX hand-rolled
// `hashToColor(name) + name.charAt(0)` templates across `ui.js`,
// `render.computer.js`, `render.phone.js` and `render.js` — the floor plan,
// the conversation header, RoomList's browse grid, the applicant cards, the
// Messages contact list, the Character Studio's own gallery tiles, the phone's
// contact rows. Each one independently reinvented, none sharing a line.
//
// The floor-plan marker is the standing argument for why that was expensive:
// in twenty lines it carried a cache-only lookup against the wrong image key,
// a `clip-path` id that was never defined, a player who never hydrated, and
// O(roster) kv writes per render. Four defects, all silent, none findable
// until the day the cache stopped missing. Twenty-six copies of that risk is
// not a style problem.
//
// D10 — INITIALS ARE THE FLOOR, NEVER THE FAILURE. Every chip paints
// synchronously as a coloured initial ring and UPGRADES when art resolves.
// There is no loading state, no spinner, no layout shift, and no code path
// where a missing image produces an empty circle. A brand-new applicant, an
// evicted blob and a failed generation are all the ordinary case.
//
// Follows `fields.js` and `icons.js` as the precedent for a small shared
// component file: pure string/DOM builders, no state of its own.

// Moved here from render.computer.js: it is used by both that file and this
// one, and it belongs with the component it colours. render.computer.js keeps
// calling it unchanged from its new home (avatar.js loads before it).
function hashToColor(str) {
  let hash = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 35%)`;
}

// Up to two letters, the way a person's initials actually read. `initialsFor`
// in render.js did this for the floor plan alone; it is the same job
// everywhere, so it is the same function now.
function avatarInitials(name) {
  const n = String(name || '').trim();
  if (!n) return '?';
  return n.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

// The identity token an avatar is addressed by — the same anchor the cutout
// pipeline and the override store use, so a chip, a sprite and a saved
// override can never disagree about who they are about.
//
// STRICT about what counts as an anchor, and that matters. cutoutIdentityToken
// falls back to hashing `id || name || ''` when there is no genSeed, which is
// right for its own purposes but wrong here: a chip is routinely built for a
// subject that is not a real character yet — RoomList mints ~30 cheap stubs a
// day with no genSeed, and a queue row is a fetch in flight. Every one of
// those would take the SAME fallback token (`ni` + the hash of the empty
// string), so they would all be treated as one person, share a memo entry,
// and — if that token ever acquired art — all wear the same face.
//
// No real anchor means no identity, which means initials, which is the
// correct answer for something that is not a character yet (D10).
function avatarIdentityFor(who, isPlayer) {
  if (typeof cutoutIdentityToken !== 'function' || !who) return null;
  const hasAnchor = isPlayer
    ? who.portrait && who.portrait.seed != null
    : who.bible && who.bible.genSeed != null;
  if (!hasAnchor) return null;
  try { return cutoutIdentityToken(who, !!isPlayer); } catch (e) { return null; }
}

// --- The chip ---------------------------------------------------------------
// avatarChip(who, opts) -> HTMLElement
//
// opts:
//   size      a key of AVATAR_TUNING.sizes ('map'|'chip'|'header'|'card'|'hero')
//             or a number of CSS px. Default 'chip'.
//   isPlayer  routes the identity token to the player's anchor
//   name      overrides the display name used for initials + tint
//   ring      'default' | 'player' | 'none'
//   title     tooltip text
//   className extra classes
//
// Paints immediately. Art arrives later, or never, and both are fine.
function avatarChip(who, opts = {}) {
  const el = document.createElement('div');
  const size = avatarChipSize(opts.size);
  el.className = `avatar-chip${opts.className ? ' ' + opts.className : ''}`;
  el.style.setProperty('--avatar-size', `${size}px`);
  if (opts.ring === 'player') el.setAttribute('data-ring', 'player');
  else if (opts.ring === 'none') el.setAttribute('data-ring', 'none');
  if (opts.title) el.title = opts.title;

  const name = opts.name || who?.bible?.name || who?.name || '';
  const initials = document.createElement('span');
  initials.className = 'avatar-chip-initials';
  initials.textContent = avatarInitials(name);
  el.style.background = hashToColor(name || 'unknown');
  el.appendChild(initials);

  mountAvatar(el, who, opts);
  return el;
}

function avatarChipSize(size) {
  if (typeof size === 'number' && size > 0) return size;
  const table = (typeof AVATAR_TUNING !== 'undefined' && AVATAR_TUNING.sizes) || {};
  return table[size || 'chip'] || table.chip || 24;
}

// --- The string form -------------------------------------------------------
// Most of this codebase's list surfaces build rows with innerHTML, so the
// component has to be available as markup too or converting them means
// rewriting them. Emits the SAME DOM as avatarChip; art is mounted afterwards
// by hydrateAvatars, which every render pass already calls.
//
// Its own escaper rather than render.js's: that file loads later and is
// absent entirely from the verify harness's load order, so depending on it
// would make this file untestable for no gain.
function avatarEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function avatarChipHtml(who, opts = {}) {
  const identity = opts.identity || avatarIdentityFor(who, opts.isPlayer);
  const size = avatarChipSize(opts.size);
  const name = opts.name || who?.bible?.name || who?.name || '';
  const ring = opts.ring === 'player' ? ' data-ring="player"'
    : opts.ring === 'none' ? ' data-ring="none"' : '';
  const cls = opts.className ? ` ${opts.className}` : '';
  const idAttr = identity ? ` data-avatar-identity="${avatarEscape(identity)}"` : '';
  const title = opts.title ? ` title="${avatarEscape(opts.title)}"` : '';
  return `<div class="avatar-chip${cls}" style="--avatar-size:${size}px;background:${hashToColor(name || 'unknown')}"${idAttr}${ring}${title}>`
    + `<span class="avatar-chip-initials">${avatarEscape(avatarInitials(name))}</span>`
    + '</div>';
}

// Mount art into every chip in `rootEl` that does not already have some.
// Called once per render pass rather than per row: one pass over the DOM is
// cheaper than a promise per row, and resolveAvatar's session memo means the
// second and every later pass costs no kv at all.
function hydrateAvatars(rootEl) {
  if (typeof document === 'undefined' || typeof resolveAvatar !== 'function') return;
  const scope = rootEl || document;
  for (const el of scope.querySelectorAll('[data-avatar-identity]:not([data-has-art])')) {
    const identity = el.getAttribute('data-avatar-identity');
    if (!identity) continue;
    resolveAvatar(identity, { generate: false }).then((res) => {
      if (res && res.url && el.isConnected) applyAvatarArt(el, res.url);
    }).catch(() => { /* initials stand; D10 */ });
  }
}

// Fill an EXISTING element with avatar art, leaving whatever it already shows
// in place until the art lands. The in-place half of the component, for the
// handful of surfaces whose markup is authored in index.html (the conversation
// header, the floor-plan markers) rather than built here.
//
// Never generates. A chip is drawn on essentially every interaction; kicking
// off a generation from one would spend real quota every time somebody walked
// into a room. Art reaches the cache through the surfaces that legitimately
// make it — the Sprite Studio, and Phase 3's queue — and this picks it up for
// free once it exists.
function mountAvatar(el, who, opts = {}) {
  if (!el || typeof resolveAvatar !== 'function') return;
  const identity = opts.identity || avatarIdentityFor(who, opts.isPlayer);
  if (!identity) return;
  el.setAttribute('data-avatar-identity', identity);

  resolveAvatar(identity, {
    who,
    isPlayer: !!opts.isPlayer,
    outfitToken: who && typeof cutoutOutfitToken === 'function' ? cutoutOutfitToken(who) : undefined,
    generate: false,
  }).then((res) => {
    if (!res || !res.url) return;
    // The element may have been replaced by a re-render between the request
    // and its answer; a detached node is a no-op, not an error.
    if (!el.isConnected && !opts.allowDetached) return;
    applyAvatarArt(el, res.url);
  }).catch(() => { /* initials stand; D10 */ });
}

function applyAvatarArt(el, url) {
  let img = el.querySelector('img.avatar-chip-img');
  if (!img) {
    img = document.createElement('img');
    img.className = 'avatar-chip-img';
    img.alt = '';
    el.appendChild(img);
  }
  img.src = url;
  el.setAttribute('data-has-art', '');
}

// Re-resolve every mounted chip for one identity — after a regenerate, an
// upload, a recrop, or a revert in the Sprite Studio. The studio calls
// invalidateSprite() first so the resolver stops serving the memo.
function refreshAvatars(identity) {
  if (typeof document === 'undefined') return;
  const sel = identity
    ? `[data-avatar-identity="${CSS.escape(identity)}"]`
    : '[data-avatar-identity]';
  for (const el of document.querySelectorAll(sel)) {
    const id = el.getAttribute('data-avatar-identity');
    resolveAvatar(id, { generate: false }).then((res) => {
      if (res && res.url) applyAvatarArt(el, res.url);
      else {
        // A revert with nothing behind it drops back to initials, which is a
        // correct state rather than a broken one.
        const img = el.querySelector('img.avatar-chip-img');
        if (img) img.remove();
        el.removeAttribute('data-has-art');
      }
    }).catch(() => {});
  }
}

// ===== /SECTION: AVATAR =====
