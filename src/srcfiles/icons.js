// ===== SECTION: ICONS =====
// A small hand-authored SVG icon set for the computer's desktop/taskbar
// shell and its 8 apps. Every icon shares one contract so they drop into
// any button/tile without per-call tuning: viewBox="0 0 24 24",
// stroke="currentColor" with no fill (themed entirely through CSS `color`,
// same as a text glyph), stroke-width 1.75, rounded caps/joins for a flat
// Win11-ish linework look — no gradients, no bevels, no baked-in color.
// This replaces hashToColor (render.computer.js) in every role that's an
// app or OS-chrome *icon*; hashToColor stays in use as a background tint
// behind per-entity thumbnails (products/shows/contacts), which a fixed
// icon set can't stand in for.

const ICONS = {
  // --- App icons (keyed by APP_DEFS id) ---
  work: () => svgWrap(`
    <rect x="3" y="8" width="18" height="12" rx="2"/>
    <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    <line x1="3" y1="13" x2="21" y2="13"/>
  `),
  shop: () => svgWrap(`
    <path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8Z"/>
    <path d="M9 8V6a3 3 0 0 1 6 0v2"/>
  `),
  browser: () => svgWrap(`
    <circle cx="12" cy="12" r="9"/>
    <path d="M3 12h18"/>
    <path d="M12 3c2.5 2.6 3.8 5.8 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.8-3.8-9s1.3-6.4 3.8-9Z"/>
  `),
  classes: () => svgWrap(`
    <path d="M12 4 2 9l10 5 10-5-10-5Z"/>
    <path d="M6 11.5V17c0 1.2 2.7 3 6 3s6-1.8 6-3v-5.5"/>
  `),
  services: () => svgWrap(`
    <path d="M9 21 15 9"/>
    <path d="M6 21h6"/>
    <path d="M13 9 17.5 3.5a1.5 1.5 0 0 1 2.6 1.5L17 9"/>
    <path d="M13 9a2.5 2.5 0 0 0-4 3l1 1"/>
  `),
  classifieds: () => svgWrap(`
    <circle cx="8" cy="15" r="3.5"/>
    <path d="M10.5 12.5 19 4"/>
    <path d="M16 7l2.5 2.5"/>
    <path d="M13.5 9.5 16 12"/>
  `),
  im: () => svgWrap(`
    <path d="M4 5h16v11H9l-4 4v-4H4Z"/>
    <line x1="8" y1="9.5" x2="16" y2="9.5"/>
    <line x1="8" y1="12.5" x2="13" y2="12.5"/>
  `),
  stream: () => svgWrap(`
    <rect x="3" y="5" width="18" height="13" rx="2"/>
    <path d="M10 8.5v6l5-3-5-3Z" fill="currentColor" stroke="none"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
  `),

  // --- OS chrome ---
  close: () => svgWrap(`
    <line x1="6" y1="6" x2="18" y2="18"/>
    <line x1="18" y1="6" x2="6" y2="18"/>
  `),
  minimize: () => svgWrap(`
    <line x1="5" y1="18" x2="19" y2="18"/>
  `),
  maximize: () => svgWrap(`
    <rect x="5" y="5" width="14" height="14" rx="1.5"/>
  `),
  restore: () => svgWrap(`
    <rect x="8" y="4" width="12" height="12" rx="1.5"/>
    <rect x="4" y="8" width="12" height="12" rx="1.5"/>
  `),
  start: () => svgWrap(`
    <rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor" stroke="none"/>
    <rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" stroke="none"/>
    <rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor" stroke="none"/>
    <rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor" stroke="none"/>
  `),
  back: () => svgWrap(`
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="11 6 5 12 11 18"/>
  `),
  forward: () => svgWrap(`
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="13 6 19 12 13 18"/>
  `),
  search: () => svgWrap(`
    <circle cx="10.5" cy="10.5" r="6.5"/>
    <line x1="15.3" y1="15.3" x2="20" y2="20"/>
  `),
  send: () => svgWrap(`
    <path d="M4 20 20 12 4 4l2.5 8L4 20Z"/>
  `),
};

function svgWrap(inner) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

// One call site for anywhere an icon is needed as markup — wraps the raw
// <svg> in a sizeable/colorable <span> so callers style the icon like any
// other inline element rather than reaching into SVG internals.
function svgIcon(name, extraClass) {
  const raw = ICONS[name] ? ICONS[name]() : '';
  if (!raw) return '';
  return `<span class="icon icon-${name}${extraClass ? ' ' + extraClass : ''}">${raw}</span>`;
}

// ===== /SECTION: ICONS =====
