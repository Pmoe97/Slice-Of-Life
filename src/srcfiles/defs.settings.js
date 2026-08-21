// ===== SECTION: DEFS.SETTINGS =====
// Settings & Pause Overhaul Phase 1: the one settings schema.
// kv.menu 'settings' is the single source of truth for all in-game
// settings — browser-local (kv.menu is deliberately NOT in SAVE_KEYS) and
// never part of a save record. The old 'options'/'prefs' split (see
// D4) is migrated into this object on first load and the old keys
// retired; 'options'.bgArt stays in 'options' (boot-only).
//
// All tables live in THIS file so the schema stays one place. The later
// phases add to it, never to a new file: RACES + CAST_IDENTITIES landed in
// Phase 5, IMAGE_STYLES lands in Phase 7, COLOR_THEMES in Phase 8.

const SETTINGS_DEFAULTS = {
  autosave: true,                 // migrated from kv.menu 'options'.autosave
  autosaveInterval: '30s',        // '30s'|'1m'|'5m'|'10m'  (D6)
  sfwMode: false,                 // contentFlags.mature=false when true (D5)
  textSize: 'medium',             // 'small'|'medium'|'large' (D7)
  genderDist: {                   // cast identity taxonomy, sums to 100 (D14)
    female: 40, male: 40, futanari: 8, trans_male: 6, trans_female: 6,
  },
  raceDist: { human: 100 },       // RACES ids, sums to 100; fantasy OFF by default (D13)
  pairings: { hetero: true, gay: true, lesbian: true },  // art allowlist only
  imageStyle: 'none',             // style id from IMAGE_STYLES, or '__custom' (D9)
  customStylePrompt: '',          // used when imageStyle === '__custom'
  theme: 'midnight',              // id from COLOR_THEMES (D10)
  reduceMotion: false,            // character-cutout plan D9: stills the scene
                                  // cutout transitions. OS prefers-reduced-motion
                                  // already does this on its own; this is the
                                  // in-game override for players whose OS is not
                                  // set but who still want the movement stopped.
};

// Phase 7 (D9): the image style presets — ONE global style across every
// generated image (scenes, characters, portraits, keyhole peeks, photos, and
// the boot-menu slideshow). Each entry is { id, label, blurb, suffix } where
// suffix is a COMMA-PREFIXED prompt phrase appended by the image.js single
// funnel (applyImageStyle). Style is prompt-text only: per-character seeds
// are untouched, so determinism holds (D9) — a style change repaints fresh
// frames, never a stale-cached one.
//
// 'none' is NOT in this table — it is the settings default ('' suffix), so
// with default settings every prompt is byte-identical to pre-overhaul and
// the existing cache stays valid. The Images tab renders it as its own tile
// (STYLE_NONE below). 'anime' mirrors today's hardcoded look. The '__custom'
// sentinel switches the funnel to settings.customStylePrompt, appended
// verbatim.
const IMAGE_STYLES = [
  { id: 'anime',       label: 'Anime',        blurb: 'Clean linework, soft shading — the game\'s classic look.', suffix: ', anime-inspired illustration, clean linework, soft shading' },
  { id: 'photoreal',   label: 'Photoreal',    blurb: 'Photographic detail and natural light.', suffix: ', photorealistic, high detail, natural lighting, 35mm photography' },
  { id: 'watercolor',  label: 'Watercolor',   blurb: 'Soft washes and visible paper texture.', suffix: ', watercolor painting, soft color washes, visible paper texture, delicate edges' },
  { id: 'oilPainting', label: 'Oil painting', blurb: 'Rich brushstrokes and impasto texture.', suffix: ', oil painting, rich brushstrokes, warm impasto texture' },
  { id: 'noir',        label: 'Noir',         blurb: 'Black-and-white film noir, hard shadows.', suffix: ', black and white film noir, hard shadows, high contrast, dramatic lighting' },
  { id: 'ghibli',      label: 'Ghibli',       blurb: 'Hand-drawn warmth, gentle flat colors.', suffix: ', hand-drawn animated film style, warm flat colors, gentle detailed backgrounds' },
  { id: 'pixel',       label: 'Pixel art',    blurb: '16-bit pixel art, retro game look.', suffix: ', 16-bit pixel art, crisp pixels, limited color palette, retro video game aesthetic' },
  { id: '3dRender',    label: '3D render',    blurb: 'Soft global illumination, depth of field.', suffix: ', 3D render, soft global illumination, physically based materials, gentle depth of field' },
  { id: 'lineart',     label: 'Line art',     blurb: 'Clean ink outlines, no shading.', suffix: ', clean line art, no shading, crisp ink outlines, minimalist background' },
  { id: 'pastel',      label: 'Pastel',       blurb: 'Soft diffuse colors, dreamy light.', suffix: ', soft pastel colors, gentle gradients, dreamy diffuse lighting, powdered pastel texture' },
  { id: 'synthwave',   label: 'Synthwave',    blurb: 'Neon glow, retro-futurism.', suffix: ', synthwave aesthetic, neon glow, magenta and cyan palette, retro-futuristic' },
  { id: 'vintage',     label: 'Vintage',      blurb: 'Faded 70s illustration print.', suffix: ', vintage 1970s illustration, faded print colors, grainy texture, retro charm' },
  { id: 'minimalist',  label: 'Minimalist',   blurb: 'Flat shapes, large negative space.', suffix: ', minimalist flat design, large negative space, simple shapes, muted palette' },
  { id: 'inkWash',     label: 'Ink wash',     blurb: 'Sumi-e brushwork, flowing ink.', suffix: ', sumi-e ink wash painting, flowing brushwork, generous negative space, muted ink tones' },
  { id: 'claymation',  label: 'Claymation',   blurb: 'Tactile plasticine stop-motion.', suffix: ', claymation stop-motion style, tactile plasticine textures, soft studio lighting' },
  { id: 'dramatic',    label: 'Dramatic',     blurb: 'Cinematic HDR, volumetric light.', suffix: ', cinematic dramatic lighting, HDR contrast, volumetric light, epic composition' },
  { id: 'sketch',      label: 'Sketch',       blurb: 'Pencil hatching, rough graphite.', suffix: ', pencil sketch, loose hatching, rough graphite texture' },
  { id: '__custom',    label: 'Custom',       blurb: 'Write your own style phrase — appended verbatim to every prompt.', suffix: '' },
];

// The Images tab's off-state tile: no style suffix. Not a member of
// IMAGE_STYLES (that table is exactly 18 entries incl. the '__custom'
// sentinel, per the Phase 7 handoff); the row keys are [STYLE_NONE,
// ...IMAGE_STYLES] so the player can always turn styles back off.
const STYLE_NONE = { id: 'none', label: 'None', blurb: 'No style suffix — the game\'s default look.', suffix: '' };

// Phase 8 (D10): the 14 color themes over the :root token set — three
// Standard palettes, four Accessibility, seven Flavour. Each entry is
// { id, label, group, blurb, vars } where vars maps the exact :root token
// names from the tokens <style> in index.html. The runtime authority is the
// CSS `html[data-theme="…"]` rule-sets next to :root — applyTheme()
// (settings.js) sets data-theme on <html> and those rule-sets win on
// specificity. This JS table's vars are the HUMAN-readable palette AND the
// swatch source for the Appearance tab's grid tiles (menu.js reads
// THEME_SWATCH_TOKENS out of vars) — keep the two in sync: a theme whose
// CSS block drifts from its vars shows wrong swatches, and a theme whose id
// is missing from the CSS just falls back to :root's midnight values.
//
// 'midnight' reproduces today's values EXACTLY (it is the :root block
// verbatim, so it needs no CSS rule-set of its own). 'match-system' is the
// prefers-color-scheme palette with NO explicit values here (vars: {}) —
// the CSS media query decides between the dark (midnight) and light
// (daylight) palettes at runtime.
//
// Semantic hue families stay consistent across every palette so the four
// need bars (energy=warm, hunger=cool, hygiene=positive, mood=accent) and
// the negative/desire/warning status colors stay distinguishable —
// D10's color-blind-safe pairing requirement is explicit in the
// Accessibility group (High Contrast, Nord use CVD-distinct hues;
// Monochrome differentiates the bars by brightness instead).
const COLOR_THEMES = [
  {
    id: 'midnight', label: 'Midnight', group: 'Standard',
    blurb: 'The classic dark-purple look — today\'s colors, exactly as they are.',
    vars: {
      '--color-bg': '#1a1a2e',
      '--color-surface': '#232342',
      '--color-surface-alt': '#2a2a4a',
      '--color-surface-hover': '#32326a',
      '--color-border': '#3a3a5c',
      '--color-border-strong': '#4a4a7c',
      '--color-text': '#e0e0f0',
      '--color-text-dim': '#8888aa',
      '--color-text-faint': '#5a5a7c',
      '--color-accent': '#7b6cf6',
      '--color-accent-hover': '#9d92f8',
      '--color-accent-dim': '#5a4fa0',
      '--color-warm': '#f6a96c',
      '--color-cool': '#6cc7f6',
      '--color-positive': '#6cf6a9',
      '--color-negative': '#f66c8c',
      '--color-desire': '#e26ca6',
      '--color-warning': '#f6d76c',
      '--color-shadow': 'rgba(0,0,0,0.4)',
      '--color-overlay': 'rgba(10,10,20,0.7)',
      '--color-card': '#2c2c50',
    },
  },
  {
    id: 'daylight', label: 'Daylight', group: 'Standard',
    blurb: 'A bright paper-white look with strong ink text.',
    vars: {
      '--color-bg': '#f4f1ea',
      '--color-surface': '#ffffff',
      '--color-surface-alt': '#ece8dd',
      '--color-surface-hover': '#e2dccd',
      '--color-border': '#cbc5b6',
      '--color-border-strong': '#a49d8c',
      '--color-text': '#2c2730',
      '--color-text-dim': '#5d5768',
      '--color-text-faint': '#8b8596',
      '--color-accent': '#5d4fd1',
      '--color-accent-hover': '#4638b0',
      '--color-accent-dim': '#8f84e8',
      '--color-warm': '#cf7a24',
      '--color-cool': '#1f7fbf',
      '--color-positive': '#1f9d66',
      '--color-negative': '#c93f52',
      '--color-desire': '#c04a86',
      '--color-warning': '#a67a00',
      '--color-shadow': 'rgba(60,50,30,0.18)',
      '--color-overlay': 'rgba(40,35,28,0.38)',
      '--color-card': '#ffffff',
    },
  },
  {
    id: 'match-system', label: 'Match System', group: 'Standard',
    blurb: 'Follows your OS light/dark setting automatically.',
    vars: {},
  },
  {
    id: 'high-contrast', label: 'High Contrast', group: 'Accessibility',
    blurb: 'Near-black, pure white text, color-blind-safe need bars.',
    vars: {
      '--color-bg': '#000000',
      '--color-surface': '#101014',
      '--color-surface-alt': '#1a1a20',
      '--color-surface-hover': '#2c2c38',
      '--color-border': '#5f5f7a',
      '--color-border-strong': '#9f9fbe',
      '--color-text': '#ffffff',
      '--color-text-dim': '#dcdcec',
      '--color-text-faint': '#b0b0c6',
      '--color-accent': '#c9a6ff',
      '--color-accent-hover': '#e2d0ff',
      '--color-accent-dim': '#6a3d9a',
      '--color-warm': '#ffb54d',
      '--color-cool': '#4db8ff',
      '--color-positive': '#00e6b8',
      '--color-negative': '#ff3b4e',
      '--color-desire': '#ff6bd6',
      '--color-warning': '#ffe14d',
      '--color-shadow': 'rgba(0,0,0,0.65)',
      '--color-overlay': 'rgba(0,0,0,0.82)',
      '--color-card': '#15151c',
    },
  },
  {
    id: 'dimmed', label: 'Dimmed', group: 'Accessibility',
    blurb: 'Low brightness and gentle contrast for light-sensitive eyes.',
    vars: {
      '--color-bg': '#0d0d14',
      '--color-surface': '#14141d',
      '--color-surface-alt': '#191924',
      '--color-surface-hover': '#232331',
      '--color-border': '#2c2c3a',
      '--color-border-strong': '#3a3a4e',
      '--color-text': '#b4b4c4',
      '--color-text-dim': '#767688',
      '--color-text-faint': '#535364',
      '--color-accent': '#8a82d0',
      '--color-accent-hover': '#a49ee0',
      '--color-accent-dim': '#564f8c',
      '--color-warm': '#c98a58',
      '--color-cool': '#58a2c4',
      '--color-positive': '#58c492',
      '--color-negative': '#c45866',
      '--color-desire': '#ad5886',
      '--color-warning': '#c0ab58',
      '--color-shadow': 'rgba(0,0,0,0.3)',
      '--color-overlay': 'rgba(7,7,12,0.7)',
      '--color-card': '#181826',
    },
  },
  {
    id: 'sepia', label: 'Sepia', group: 'Accessibility',
    blurb: 'Warm parchment tones with softened contrast.',
    vars: {
      '--color-bg': '#f2e8d4',
      '--color-surface': '#eae0c8',
      '--color-surface-alt': '#e0d3b6',
      '--color-surface-hover': '#d3c3a0',
      '--color-border': '#b6a584',
      '--color-border-strong': '#96855f',
      '--color-text': '#3a2f20',
      '--color-text-dim': '#6d5f47',
      '--color-text-faint': '#99896c',
      '--color-accent': '#8a5a2e',
      '--color-accent-hover': '#a8743c',
      '--color-accent-dim': '#6d441f',
      '--color-warm': '#b3661f',
      '--color-cool': '#3f7090',
      '--color-positive': '#3f7f52',
      '--color-negative': '#a03f3f',
      '--color-desire': '#8f4f6f',
      '--color-warning': '#8f7a1c',
      '--color-shadow': 'rgba(60,45,20,0.2)',
      '--color-overlay': 'rgba(60,45,20,0.38)',
      '--color-card': '#efe5cd',
    },
  },
  {
    id: 'nord', label: 'Nord', group: 'Accessibility',
    blurb: 'The calm arctic palette — polar-night darks, frost tones.',
    vars: {
      '--color-bg': '#2e3440',
      '--color-surface': '#3b4252',
      '--color-surface-alt': '#434c5e',
      '--color-surface-hover': '#4c566a',
      '--color-border': '#4c566a',
      '--color-border-strong': '#616e88',
      '--color-text': '#eceff4',
      '--color-text-dim': '#d8dee9',
      '--color-text-faint': '#8d97ab',
      '--color-accent': '#b48ead',
      '--color-accent-hover': '#cfa9c9',
      '--color-accent-dim': '#7d5a82',
      '--color-warm': '#d08770',
      '--color-cool': '#81a1c1',
      '--color-positive': '#a3be8c',
      '--color-negative': '#bf616a',
      '--color-desire': '#c990c0',
      '--color-warning': '#ebcb8b',
      '--color-shadow': 'rgba(0,0,0,0.4)',
      '--color-overlay': 'rgba(22,26,34,0.72)',
      '--color-card': '#434c5e',
    },
  },
  {
    id: 'crimson', label: 'Crimson', group: 'Flavour',
    blurb: 'Deep wine reds with candle-gold warmth.',
    vars: {
      '--color-bg': '#1a0e11',
      '--color-surface': '#261419',
      '--color-surface-alt': '#301a21',
      '--color-surface-hover': '#44232e',
      '--color-border': '#472532',
      '--color-border-strong': '#613442',
      '--color-text': '#f0e2e5',
      '--color-text-dim': '#b08a92',
      '--color-text-faint': '#7c5660',
      '--color-accent': '#d96a9a',
      '--color-accent-hover': '#e88ab2',
      '--color-accent-dim': '#8a3a5e',
      '--color-warm': '#f0a05a',
      '--color-cool': '#86b0d4',
      '--color-positive': '#72d29a',
      '--color-negative': '#ff5d66',
      '--color-desire': '#e0809c',
      '--color-warning': '#f0cf5a',
      '--color-shadow': 'rgba(0,0,0,0.45)',
      '--color-overlay': 'rgba(18,5,9,0.72)',
      '--color-card': '#2e1a20',
    },
  },
  {
    id: 'ocean', label: 'Ocean', group: 'Flavour',
    blurb: 'Deep-sea blues with a hint of surf.',
    vars: {
      '--color-bg': '#0a1520',
      '--color-surface': '#0f2333',
      '--color-surface-alt': '#132c40',
      '--color-surface-hover': '#1a3a54',
      '--color-border': '#1d384e',
      '--color-border-strong': '#2b516e',
      '--color-text': '#dceaf4',
      '--color-text-dim': '#8fb0c4',
      '--color-text-faint': '#5a778c',
      '--color-accent': '#9fb2f4',
      '--color-accent-hover': '#bcc9f8',
      '--color-accent-dim': '#5a6fae',
      '--color-warm': '#ffb86b',
      '--color-cool': '#57b8f0',
      '--color-positive': '#63e6be',
      '--color-negative': '#ff6b7a',
      '--color-desire': '#f07fb4',
      '--color-warning': '#ffe066',
      '--color-shadow': 'rgba(0,0,0,0.45)',
      '--color-overlay': 'rgba(4,14,24,0.72)',
      '--color-card': '#12303f',
    },
  },
  {
    id: 'synthwave', label: 'Synthwave', group: 'Flavour',
    blurb: 'Neon magenta and cyan on a deep violet night.',
    vars: {
      '--color-bg': '#12001e',
      '--color-surface': '#1d0630',
      '--color-surface-alt': '#260a42',
      '--color-surface-hover': '#34105c',
      '--color-border': '#341256',
      '--color-border-strong': '#4d1f7c',
      '--color-text': '#f2e6ff',
      '--color-text-dim': '#bd96e8',
      '--color-text-faint': '#8459b8',
      '--color-accent': '#c77bff',
      '--color-accent-hover': '#dd9eff',
      '--color-accent-dim': '#8a3fd0',
      '--color-warm': '#ffb35c',
      '--color-cool': '#4df3ff',
      '--color-positive': '#5cffb0',
      '--color-negative': '#ff5d6b',
      '--color-desire': '#ff8ad4',
      '--color-warning': '#ffe15c',
      '--color-shadow': 'rgba(0,0,0,0.55)',
      '--color-overlay': 'rgba(10,0,20,0.75)',
      '--color-card': '#260744',
    },
  },
  {
    id: 'forest', label: 'Forest', group: 'Flavour',
    blurb: 'Mossy greens and bark-brown warmths.',
    vars: {
      '--color-bg': '#0e1711',
      '--color-surface': '#16231a',
      '--color-surface-alt': '#1c2b20',
      '--color-surface-hover': '#273a2c',
      '--color-border': '#28392c',
      '--color-border-strong': '#39513f',
      '--color-text': '#e0eee0',
      '--color-text-dim': '#9cb89c',
      '--color-text-faint': '#69866c',
      '--color-accent': '#b49ad8',
      '--color-accent-hover': '#cbaddb',
      '--color-accent-dim': '#7b5c9c',
      '--color-warm': '#e0b25c',
      '--color-cool': '#7fb5d0',
      '--color-positive': '#7fe0a0',
      '--color-negative': '#e05c6a',
      '--color-desire': '#d08ac0',
      '--color-warning': '#e0d25c',
      '--color-shadow': 'rgba(0,0,0,0.45)',
      '--color-overlay': 'rgba(6,14,8,0.72)',
      '--color-card': '#1a2c1e',
    },
  },
  {
    id: 'sunset', label: 'Sunset', group: 'Flavour',
    blurb: 'Dusk skies — coral, rose and amber.',
    vars: {
      '--color-bg': '#1e0f18',
      '--color-surface': '#2b1622',
      '--color-surface-alt': '#351c2b',
      '--color-surface-hover': '#4a2740',
      '--color-border': '#48263a',
      '--color-border-strong': '#653654',
      '--color-text': '#f7e6ea',
      '--color-text-dim': '#c99aa6',
      '--color-text-faint': '#916372',
      '--color-accent': '#d8a0c4',
      '--color-accent-hover': '#e8b8d4',
      '--color-accent-dim': '#965f86',
      '--color-warm': '#ff9a5c',
      '--color-cool': '#7fb0d8',
      '--color-positive': '#8fd8a8',
      '--color-negative': '#ff5d6b',
      '--color-desire': '#f77fb0',
      '--color-warning': '#ffd95c',
      '--color-shadow': 'rgba(0,0,0,0.45)',
      '--color-overlay': 'rgba(20,8,16,0.72)',
      '--color-card': '#331f2d',
    },
  },
  {
    id: 'blossom', label: 'Blossom', group: 'Flavour',
    blurb: 'Soft petals — blush pink and lavender.',
    vars: {
      '--color-bg': '#2a1a26',
      '--color-surface': '#382332',
      '--color-surface-alt': '#422a3c',
      '--color-surface-hover': '#56394e',
      '--color-border': '#4e3448',
      '--color-border-strong': '#6c4a62',
      '--color-text': '#f6ecf2',
      '--color-text-dim': '#d0a8c0',
      '--color-text-faint': '#96708a',
      '--color-accent': '#e0a0c8',
      '--color-accent-hover': '#f0bcd8',
      '--color-accent-dim': '#a0608c',
      '--color-warm': '#f0b06c',
      '--color-cool': '#8ab0d8',
      '--color-positive': '#8ad8a8',
      '--color-negative': '#e0607c',
      '--color-desire': '#f58fc4',
      '--color-warning': '#f0d56c',
      '--color-shadow': 'rgba(0,0,0,0.4)',
      '--color-overlay': 'rgba(24,12,20,0.72)',
      '--color-card': '#40283a',
    },
  },
  {
    id: 'monochrome', label: 'Monochrome', group: 'Flavour',
    blurb: 'Pure gray scale — the need bars read by brightness, not hue.',
    vars: {
      '--color-bg': '#101014',
      '--color-surface': '#17171c',
      '--color-surface-alt': '#1e1e24',
      '--color-surface-hover': '#2a2a32',
      '--color-border': '#2e2e36',
      '--color-border-strong': '#3f3f4a',
      '--color-text': '#e8e8ec',
      '--color-text-dim': '#a0a0aa',
      '--color-text-faint': '#6a6a74',
      '--color-accent': '#b8b8c2',
      '--color-accent-hover': '#d8d8e0',
      '--color-accent-dim': '#6c6c76',
      '--color-warm': '#cfc2b0',
      '--color-cool': '#b0becf',
      '--color-positive': '#d8e0c8',
      '--color-negative': '#e0b0b0',
      '--color-desire': '#cfb0c0',
      '--color-warning': '#d8cfae',
      '--color-shadow': 'rgba(0,0,0,0.45)',
      '--color-overlay': 'rgba(10,10,14,0.75)',
      '--color-card': '#1a1a20',
    },
  },
];

const AUTOSAVE_INTERVALS = [
  { id: '30s', ms: 30000 },
  { id: '1m', ms: 60000 },
  { id: '5m', ms: 300000 },
  { id: '10m', ms: 600000 },
];

const TEXT_SIZES = [
  { id: 'small', label: 'Small', scale: 0.9 },
  { id: 'medium', label: 'Medium', scale: 1 },
  { id: 'large', label: 'Large', scale: 1.2 },
];

const SPEED_PRESETS = [
  { id: 'x0', label: '0×', multiplier: 0 },
  { id: 'x1', label: '1×', multiplier: 1 / 20 },
  { id: 'x20', label: '20×', multiplier: 1 },
  { id: 'x100', label: '100×', multiplier: 5 },
];

// Phase 5 (D14): the five cast identities — the taxonomy bible.gender and
// every rollGender caller already use. artTag is the background-art
// presentation mapping (D14): female/futanari/trans_female → 'f';
// male/trans_male → 'm'. The old 'nb' art-pool entries go dormant (there
// is no nb cast identity — parked open question).
const CAST_IDENTITIES = [
  { id: 'female',       label: 'Female',       artTag: 'f' },
  { id: 'male',         label: 'Male',         artTag: 'm' },
  { id: 'futanari',     label: 'Futanari',     artTag: 'f' },
  { id: 'trans_male',   label: 'Trans male',   artTag: 'm' },
  { id: 'trans_female', label: 'Trans female', artTag: 'f' },
];

// Phase 5 (D13): the race & species pool — a standing content lever for the
// population distribution (extending it is a data edit, not a feature).
// Off by default (human 100%). Each entry is
// { id, label, article, noun, traitPhrase, artPhrase }:
//   article + noun compose the plain description ("an elf");
//   traitPhrase is the visible-feature fragment the describer appends
//     ("with pointed ears and angular features"); human's is '' = today.
//   artPhrase is the per-presentation art-actor variant ("an elven woman" /
//     "an elven man") — TWO forms, because background-art actors are f/m
//     tagged via identityToArtTag (the plan's data model sketched a single
//     string; a male-presenting actor must never be described with the
//     female form).
// Trimmed for a cozy slice-of-life tone.
const RACES = [
  { id: 'human',       label: 'Human',       article: 'a',  noun: 'human',      traitPhrase: '',                                                    artPhrase: { f: 'a human woman', m: 'a human man' } },
  { id: 'elf',         label: 'Elf',         article: 'an', noun: 'elf',        traitPhrase: 'with pointed ears and angular features',              artPhrase: { f: 'an elven woman', m: 'an elven man' } },
  { id: 'orc',         label: 'Orc',         article: 'an', noun: 'orc',        traitPhrase: 'with broad tusks and moss-green skin',                artPhrase: { f: 'an orc woman', m: 'an orc man' } },
  { id: 'dwarf',       label: 'Dwarf',       article: 'a',  noun: 'dwarf',      traitPhrase: 'with a stocky frame and a braided beard',             artPhrase: { f: 'a dwarven woman', m: 'a dwarven man' } },
  { id: 'tiefling',    label: 'Tiefling',    article: 'a',  noun: 'tiefling',   traitPhrase: 'with deep crimson skin and small curved horns',        artPhrase: { f: 'a tiefling woman', m: 'a tiefling man' } },
  { id: 'vampire',     label: 'Vampire',     article: 'a',  noun: 'vampire',    traitPhrase: 'with pale skin and a sharp, elegant smile',            artPhrase: { f: 'a vampire woman', m: 'a vampire man' } },
  { id: 'fae',         label: 'Fae',         article: 'a',  noun: 'fae',        traitPhrase: 'with luminous wings and a faint shimmer to their skin', artPhrase: { f: 'a fae woman', m: 'a fae man' } },
  { id: 'catfolk',     label: 'Catfolk',     article: 'a',  noun: 'catfolk',    traitPhrase: 'with soft feline ears and a gently swishing tail',      artPhrase: { f: 'a catfolk woman', m: 'a catfolk man' } },
  { id: 'wolffolk',    label: 'Wolffolk',    article: 'a',  noun: 'wolffolk',   traitPhrase: 'with pointed lupine ears and a bushy tail',             artPhrase: { f: 'a wolffolk woman', m: 'a wolffolk man' } },
  { id: 'dragonborn',  label: 'Dragonborn',  article: 'a',  noun: 'dragonborn', traitPhrase: 'with fine scales and a horned crest',                  artPhrase: { f: 'a dragonborn woman', m: 'a dragonborn man' } },
];

// The tabbed settings config — data-driven so a phase adds rows, never
// renderer code. Five tabs, empty sections until their phases land (D2).
// Rows are { id, kind: 'toggle'|'cycle'|'sliders'|'grid'|'button'|'text',
// action, ... }; the renderer (menu.js) must never diverge from
// MENU_ACTIONS (design invariant 1).
const SETTINGS_TABS = [
  {
    id: 'general', label: 'General', icon: '⚙️',
    // Phase 2 ships the rows whose consumers are already real (D1/D6):
    // Autosave was re-pointed off the retired 'options' key onto
    // settings.autosave. Phase 4 adds SFW mode (D5) and Text size (D7)
    // and makes the interval row re-arm the live timer. Later phases fill
    // the other tabs' sections.
    sections: [
      {
        title: 'Play',
        rows: [
          {
            id: 'autosave',
            kind: 'toggle',
            field: 'autosave',
            label: 'Autosave',
            desc: 'Write a rotating autosave while you play. You can set the interval below.',
            action: 'settings.toggle',
          },
          {
            id: 'autosave-interval',
            kind: 'cycle',
            field: 'autosaveInterval',
            label: 'Autosave interval',
            desc: 'How often the autosave ring is written. Changing it re-arms the live timer.',
            action: 'settings.cycle',
            options: AUTOSAVE_INTERVALS,
          },
          {
            id: 'sfw-mode',
            kind: 'toggle',
            field: 'sfwMode',
            label: 'SFW guidance mode',
            desc: 'Guides generated content and prompts to stay non-explicit: the mature flag turns off, the LLM is told to fade to black, and mature-gated sites hide. Off by default.',
            action: 'settings.toggle',
          },
          {
            id: 'text-size',
            kind: 'cycle',
            field: 'textSize',
            label: 'Text size',
            desc: 'Scales UI text only — layout and imagery stay exactly as they are.',
            action: 'settings.cycle',
            options: TEXT_SIZES,
          },
        ],
      },
    ],
  },
  {
    id: 'population', label: 'Population', icon: '👥',
    // Phase 5 (D8/D13/D14): the Population pane — two proportional-slider
    // grids (cast identities + races, office-clicker HR pattern: typed %
    // inputs, live normalization, total-100 readout + ⚠ warning) plus the
    // pairing allowlist. These rows replace the six old boot-options toggles
    // (removed this phase) and the retired 'prefs' key; every change writes
    // through setSettings so the world + art consumers read the live store.
    sections: [
      {
        title: 'Cast identities',
        rows: [
          {
            id: 'gender-dist',
            kind: 'sliders',
            field: 'genderDist',
            axis: 'gender',
            action: 'set.population-dist',
            label: 'Gender distribution',
            desc: 'The proportional spread over the five cast identities — the apartment cast at new game, dating profiles, service staff, visitors and background art all draw from it. Replaces the old on/off art toggles.',
            searchText: CAST_IDENTITIES.map((c) => c.label).join(' '),
            keys: CAST_IDENTITIES,
          },
        ],
      },
      {
        title: 'Race & species',
        rows: [
          {
            id: 'race-dist',
            kind: 'sliders',
            field: 'raceDist',
            axis: 'race',
            action: 'set.population-dist',
            label: 'Race distribution',
            desc: 'The proportional spread over the species pool. Fantasy races are off by default (100% human). This governs new cast generation only — it never rewrites an existing NPC.',
            searchText: RACES.map((r) => r.label).join(' '),
            keys: RACES,
          },
        ],
      },
      {
        title: 'Pairings (background art only)',
        desc: 'Which couple combinations generated background art may show. An art allowlist only — it never gates relationships.',
        rows: [
          {
            id: 'pairing-hetero',
            kind: 'toggle',
            field: 'pairings.hetero',
            label: 'Hetero pairings',
            desc: 'Mixed-gender couples in generated background art.',
            action: 'settings.toggle',
          },
          {
            id: 'pairing-gay',
            kind: 'toggle',
            field: 'pairings.gay',
            label: 'Gay pairings',
            desc: 'Male–male couples in generated background art.',
            action: 'settings.toggle',
          },
          {
            id: 'pairing-lesbian',
            kind: 'toggle',
            field: 'pairings.lesbian',
            label: 'Lesbian pairings',
            desc: 'Female–female couples in generated background art.',
            action: 'settings.toggle',
          },
        ],
      },
    ],
  },
  {
    id: 'images', label: 'Images', icon: '🖼️',
    // Phase 7 (D9): the style tile grid (18 IMAGE_STYLES incl. the
    // '__custom' sentinel, plus STYLE_NONE's off-state), the Custom phrase
    // text field, and the cache control. Every row's action id is in
    // MENU_ACTIONS (design invariant 1).
    sections: [
      {
        title: 'Image style',
        desc: 'One style across every generated image — scenes, characters, portraits, keyhole peeks, photos, and the boot-menu slideshow. Changing it repaints the next generation and never serves a stale cached frame.',
        rows: [
          {
            id: 'image-style',
            kind: 'grid',
            field: 'imageStyle',
            action: 'set.image-style',
            label: 'Style',
            desc: 'The active style is appended to every image prompt. None keeps the classic look.',
            searchText: IMAGE_STYLES.map((s) => s.label).join(' '),
            keys: [STYLE_NONE, ...IMAGE_STYLES],
          },
          {
            id: 'custom-style-prompt',
            kind: 'text',
            field: 'customStylePrompt',
            action: 'set.custom-style',
            label: 'Custom style phrase',
            desc: 'Typing here switches the style to Custom and appends your phrase verbatim to every image prompt.',
            placeholder: 'e.g. watercolor wash, loose strokes',
          },
        ],
      },
      {
        title: 'Storage',
        rows: [
          {
            id: 'clear-image-cache',
            kind: 'button',
            danger: true,
            action: 'images.clear-cache',
            buttonLabel: 'Clear',
            label: 'Clear cached images',
            desc: 'Delete every cached generated image — scenes, portraits, photos and the boot-menu slideshow. They regenerate on demand (spending image quota again).',
          },
        ],
      },
    ],
  },
  {
    id: 'appearance', label: 'Appearance', icon: '🎨',
    // Phase 8 (D10): one theme grid — 14 tiles with live swatches (drawn
    // from COLOR_THEMES.vars by the grid renderer) + group tags. Every tile
    // carries data-action 'set.theme' (in MENU_ACTIONS), writes through
    // setSettings immediately, and applyTheme() re-skins the UI chrome live.
    sections: [
      {
        title: 'Theme',
        desc: 'Recolors the game\'s UI chrome only — scenes, characters and generated imagery are never touched.',
        rows: [
          {
            id: 'theme',
            kind: 'grid',
            field: 'theme',
            action: 'set.theme',
            label: 'Color theme',
            desc: 'Fourteen palettes over the UI colors. Midnight is today\'s classic look; Match System follows your OS setting.',
            searchText: COLOR_THEMES.map((t) => `${t.label} ${t.group}`).join(' '),
            keys: COLOR_THEMES,
          },
        ],
      },
      {
        title: 'Motion',
        rows: [
          {
            id: 'reduce-motion',
            kind: 'toggle',
            field: 'reduceMotion',
            label: 'Reduce motion',
            desc: 'Stops characters sliding between positions when a scene changes — they simply appear in place. Already on automatically if your system asks for reduced motion.',
            action: 'settings.toggle',
          },
        ],
      },
    ],
  },
  {
    id: 'data', label: 'Data', icon: '💾',
    // Phase 9 (D11): the Data tab. Export/Import reuse the save panel's
    // existing tools — Export opens the slot grid (every occupied card
    // carries its own Export button → doExportSlot → showExportModal) and
    // Import opens the same modal the panel uses (openImportModal). Reset
    // all data wipes kv saves+images+settings (confirm modal) and boots.
    // Storage insight is a per-folder readout read live from kv, refreshed
    // in place by the 'data.storage' action. Every row's action id is in
    // MENU_ACTIONS (design invariant 1).
    sections: [
      {
        title: 'Save transfer',
        rows: [
          {
            id: 'export-save',
            kind: 'button',
            action: 'set.export-save',
            buttonLabel: 'Export a save…',
            label: 'Export a save',
            desc: 'Open the save panel and pick a slot — every occupied card has an Export button that turns that save into a portable blob you can copy or download.',
          },
          {
            id: 'import-save',
            kind: 'button',
            action: 'set.import-save',
            buttonLabel: 'Import a save…',
            label: 'Import a save',
            desc: 'Paste an exported blob (or choose the file). It installs into a free manual slot, ready to load from the panel.',
          },
        ],
      },
      {
        title: 'Storage',
        rows: [
          {
            id: 'storage-summary',
            kind: 'storage',
            action: 'data.storage',
            buttonLabel: 'Refresh',
            label: 'Storage insight',
            desc: 'What this game is holding in your browser, read live — save slots, cached images, settings, and the current playthrough.',
          },
        ],
      },
      {
        title: 'Danger zone',
        rows: [
          {
            id: 'data-reset',
            kind: 'button',
            danger: true,
            action: 'data.reset',
            buttonLabel: 'Reset all data',
            label: 'Reset all data',
            desc: 'Delete every save, every cached image, and all settings — a clean first-run slate. This cannot be undone.',
          },
        ],
      },
    ],
  },
];
