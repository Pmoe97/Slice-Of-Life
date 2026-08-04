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
  bank: () => svgWrap(`
    <path d="M3 10 12 4l9 6"/>
    <path d="M5 10v8h14v-8"/>
    <line x1="9" y1="10" x2="9" y2="18"/>
    <line x1="15" y1="10" x2="15" y2="18"/>
    <path d="M4 21h16"/>
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

  // --- BrineOS Phase 3: phone shell chrome (handset / home / power /
  // settings). Same contract as everything above — settings rides the
  // standard gear, and the phone handset is a Lucide-style outline so it
  // reads as "app" next to the app tiles, not as a filled glyph.
  phone: () => svgWrap(`
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>
  `),
  home: () => svgWrap(`
    <path d="m3 10 9-7 9 7"/>
    <path d="M5 8.5V21h14V8.5"/>
    <path d="M10 21v-6h4v6"/>
  `),
  power: () => svgWrap(`
    <path d="M12 2v10"/>
    <path d="M18 7a9 9 0 1 1-12 0"/>
  `),
  settings: () => svgWrap(`
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
  `),

  // BrineOS Phase 4: Tracker app (clipboard-with-check) + the bell used on
  // notification rows. Same contract as everything above.
  tracker: () => svgWrap(`
    <rect x="5" y="4" width="14" height="17" rx="2"/>
    <path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/>
    <path d="m9.5 13 2 2 3.5-3.5"/>
  `),
  // BrineOS: the RenoFix (upgrades) app — Lucide wrench. Added in Phase 5
  // when the app became phone-visible, but the desktop desktop icon and
  // taskbar had been calling svgIcon('upgrades') since Phase 4 and
  // silently rendering a blank tile — the icon set simply never had one.
  upgrades: () => svgWrap(`
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  `),
  bell: () => svgWrap(`
    <path d="M6 16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2c0-5-3-6-3-6a4 4 0 0 0-8 0s-3 1-3 6Z"/>
    <path d="M10 21h4"/>
  `),
  // BrineOS Phase 6: Clock app.
  clock: () => svgWrap(`
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 6v6l4 2"/>
  `),
  // BrineOS Phase 8: Camera app.
  camera: () => svgWrap(`
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/>
    <circle cx="12" cy="13" r="3.5"/>
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
