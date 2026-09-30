# Perchance Main Menu & Slideshow Conventions — Source Reference

*Exploratory read of three published generators, produced for Phase 10 of
`inventory-needs-menu-saves-plan.md`. Sources were read directly via the
Perchance generator API. All line numbers below are for the generator sources
as downloaded on the date of this document (files: `main.pjs`,
`index.html`). Where the three games differ they are documented separately;
where a section says "not found in source" it genuinely does not exist in that
generator.*

| Generator | Role in this doc |
|---|---|
| **lusthaven** (`perchance.org/lusthaven`) | Main menu + slideshow (first, simpler version) |
| **stellar-lust** (`perchance.org/stellar-lust`) | Main menu + slideshow (second, near-identical version, more lists) |
| **hedonism-island** (`perchance.org/hedonism-island`) | Discord badge + multi-slot save manager |

Both menu/slideshow games implement the **same slideshow pattern** (same
function names, same timings, same kv folder) — clearly a reused house pattern.
lusthaven is the version with a prompt-simplifying wrapper around
`generateImage`; stellar-lust calls the plugin directly. Each difference is
called out below.

---

## 1. Main menu structure

### 1.1 lusthaven

Screens are not toggled — they are **re-rendered** into a single container.
`renderTitle()` builds the title screen as a template literal assigned to
`mainContent.innerHTML` (`index.html:1621`). The previous screen simply
disappears.

```html
function renderTitle(){
  game.screen='title';statsBar.hidden=true;
  let hasSave=!!localStorage.getItem('lusthaven_save');
  mainContent.innerHTML=`
    <div class="title-screen">
      <div class="title-bg-layer"></div>
      <img id="titleBgImgA" class="title-bg-img visible" src="">
      <img id="titleBgImgB" class="title-bg-img" src="">
      <div class="title-bg-overlay"></div>
      <div class="title-content">
        <h1>LUSTHAVEN</h1>
        <p class="subtitle">A Fantasy Adult RPG</p>
        <div class="title-buttons">
          <button onclick="newGame()" class="big-btn">New Game</button>
          <button onclick="loadGame()" class="big-btn" id="continueBtn" ${hasSave?'':'hidden'}>Continue</button>
        </div>
        <p class="title-loading" id="titleLoading" hidden></p>
        <p class="warning">⚠️ This game contains explicit adult content — graphic sex, nudity, and profanity. 18+ only.</p>
        <p style="color:var(--text-mute);font-size:11px;margin-top:8px;max-width:320px;text-shadow:0 0 8px rgba(0,0,0,.8)">AI-generated portraits, scenes, dialogue, quests, and erotic narration.</p>
      </div>
      <div class="title-arrows">
        <button class="title-arrow-btn" onclick="titlePrev()" id="titlePrevBtn">◀</button>
        <span class="title-counter" id="titleCounter">1</span>
        <button class="title-arrow-btn" onclick="titleNext()" id="titleNextBtn">▶</button>
      </div>
    </div>`;
  initTitleGallery();
}
```

**DOM tree:**

```
.title-screen                (fixed, full-viewport, z-index 50, flex)
├── .title-bg-layer          (z0 gradient fallback, always visible under everything)
├── img#titleBgImgA.title-bg-img.visible   (z1, slideshow layer A)
├── img#titleBgImgB.title-bg-img           (z1, slideshow layer B)
├── .title-bg-overlay        (z2 left→right darkening gradient)
├── .title-content           (z3, text column, left-aligned)
│   ├── h1 "LUSTHAVEN"
│   ├── p.subtitle "A Fantasy Adult RPG"
│   ├── .title-buttons
│   │   ├── button.big-btn "New Game"
│   │   └── button.big-btn#continueBtn "Continue"  (hidden unless save exists)
│   ├── p#titleLoading.title-loading  (hidden; never shown a message in this game)
│   ├── p.warning (18+ warning)
│   └── p (AI-generated content footnote)
└── .title-arrows            (z4, bottom-right)
    ├── button.title-arrow-btn#titlePrevBtn "◀"
    ├── span.title-counter#titleCounter
    └── button.title-arrow-btn#titleNextBtn "▶"
```

- **Show/hide mechanism:** none of the screens persist. `renderTitle()` /
  `renderMap()` / `renderLocation()` etc. each overwrite `mainContent.innerHTML`.
  `game.screen` (a string) is the state variable that knows which screen is
  active; `statsBar.hidden=true` hides the HUD. Leaving the title happens by
  calling `newGame()` or `loadGame()`, both of which replace the innerHTML.
- **No `<template>` tags** anywhere in lusthaven's index.html.
- **Boot:** `init()` (`index.html:1156`) sets up world data,
  `loadGalleryFromKV()`, then `renderTitle()`. `init()` is invoked at the very
  bottom of the file (`index.html:6336`). Nothing else runs at load.
- **Mid-game:** there is no pause menu and no "return to title" path in-game.
  `renderTitle()` is only re-entered from `loadGame()` when the loaded save has
  no `player` (corrupt save fallback, `index.html:5054`).

### 1.2 stellar-lust

Identical architecture, minor markup differences. `renderTitle()`
(`index.html:861`) builds `.title-stage` into `$('mainContent').innerHTML`.

```html
function renderTitle() {
  game.screen = 'title';
  $('statsBar').hidden = true;
  let hasSave = !!localStorage.getItem('stellarlust_save');
  let hasNGPlus = false;
  try { hasNGPlus = !!JSON.parse(localStorage.getItem('stellarlust_ngplus')); } catch(e) {}
  $('mainContent').innerHTML = `
    <div class="title-stage">
      <div class="title-bg-layer"></div>
      <img id="titleBgImgA" alt="">
      <img id="titleBgImgB" alt="">
      <div class="title-bg-overlay"></div>
      <div class="title-content">
        <h1>STELLAR LUST</h1>
        <div class="subtitle">An Erotic Space RPG</div>
        <p class="desc">Captain your ship across the galaxy. Build a crew, navigate faction politics, uncover an ancient threat, and indulge your deepest desires among the stars.</p>
        <div class="btn-stack">
          <button class="title-btn" onclick="startNewGame()">New Game</button>
          <button class="title-btn" id="continueBtn" onclick="loadGame()" ${hasSave?'':'disabled'}>Continue</button>
          ${hasNGPlus ? '<button class="title-btn gold" onclick="startNewGame()">★ New Game+</button>' : ''}
        </div>
        <div class="title-loading" id="titleLoading"></div>
        <div class="title-warning">⚠ 18+ Only — Contains AI-generated explicit sexual content, nudity, and adult themes.</div>
        <div class="title-footnote">All characters are fictional and AI-generated. Content is dynamically created and not pre-written.</div>
      </div>
      <div class="title-arrows">
        <button class="title-arrow-btn" id="titlePrevBtn" onclick="titlePrev()">‹</button>
        <span class="title-counter" id="titleCounter">...</span>
        <button class="title-arrow-btn" id="titleNextBtn" onclick="titleNext()">›</button>
      </div>
    </div>`;
  initTitleGallery();
}
```

**DOM tree** is the same as lusthaven but under `.title-stage`, with two
differences: the class is `.title-stage` (not `.title-screen`) and there is a
`.desc` paragraph plus a conditional third menu button. `#titleBgImgA` starts
**without** the `.visible` class here (in lusthaven it starts visible).

- **Show/hide:** same innerHTML-replacement pattern; `game.screen='title'` +
  `$('statsBar').hidden=true`.
- **No `<template>` tags.**
- **Boot:** bare `renderTitle();` statement at `index.html:2286` runs when the
  script loads. (A player-id is also minted into localStorage at
  `index.html:8-10`.)
- **Mid-game:** no pause overlay. The HUD's stats bar has a `⚙️` button that
  calls `renderSettings()` (`index.html:687`); the settings panel offers
  Content Intensity, Image Generation on/off, Auto-Save, "🗑️ Delete Save", and
  "← Back". The ending screen ("THE END") has "🏠 Return to Title" →
  `renderTitle()` and "🌟 New Game+" → `startNewGame()`.
  `renderTitle` is also wrapped at `index.html:2394` so entering the title
  plays title music:
  ```js
  const _origRenderTitle = renderTitle;
  renderTitle = function() { _origRenderTitle(); playMusic('title'); };
  ```

### 1.3 hedonism-island

Different model: the menu is **static HTML** in the body, shown at startup and
**hidden by toggling a `.hidden` class** (opacity 0 + `pointer-events:none`).
The game UI lives in sibling containers.

```html
<div id="app">
  <!-- Main Menu (shown on startup) -->
  <div id="main-menu" class="main-menu">
    <div class="menu-container">
      <h1 class="game-title">HEDONISM ISLAND</h1>
      <p class="game-subtitle">Survival • Romance • Degeneracy</p>

      <div class="menu-buttons">
        <button class="menu-btn" id="btn-continue">Continue</button>
        <button class="menu-btn" id="btn-new-game">New Game</button>
        <button class="menu-btn" id="btn-load">Load Game</button>
        <button class="menu-btn secondary" id="btn-clear-saves">🗑️ Clear Old Saves</button>
        <button class="menu-btn" id="btn-settings">Settings</button>
        <button class="menu-btn" id="btn-credits">Credits</button>
      </div>

      <p class="version-info">v3.0.0 - Turn-Based Update</p>
    </div>

    <!-- Discord Link Logo -->
    <a href="https://discord.com/invite/E6N9WKpGPA" target="_blank" rel="noopener noreferrer" class="discord-logo-link" title="Join our Discord community!">
      <img src="data:image/svg+xml,....." class="menu-logo">
    </a>
  </div>

  <!-- Character Creation (shown after New Game) -->
  <div id="character-creation"></div>
  ...
</div>
```

- **Menu entries in order:** Continue (`btn-continue`, disabled unless an
  autosave exists), New Game (`btn-new-game`), Load Game (`btn-load`), 🗑️
  Clear Old Saves (`btn-clear-saves`, `.secondary`), Settings (`btn-settings`),
  Credits (`btn-credits`). Plus a `.version-info` text line.
- **Show/hide:** `menu.classList.add("hidden")` on continue/load/new-game
  (`index.html:9771`, `:9848`, `:14354`); `classList.remove("hidden")` to
  return to the menu. A `MainMenu` ES class owns the wiring: `init()`
  (`index.html:9662`) → `attachEventListeners()` +
  `checkContinueButton()`; each button gets an `onclick`. The state is not a
  string screen — the menu is a separate always-mounted DOM subtree, and the
  `#app` grid is what's behind it.
- **Boot:** the script at the bottom constructs `mainMenu`, `gameState`,
  `saveManager`, `optionsMenu`, etc. and calls `mainMenu.init()`.
- **Mid-game pause:** an **OptionsMenu** modal (opened via the `⚙️`
  `game-menu-btn` in the game HUD, `index.html:13126`) with four option cards:
  💾 Save / Load, ⚙️ Settings, 🏠 Main Menu, ▶️ Resume. "Main Menu"
  auto-saves to `autosave` first. Escape closes it (`index.html:14598`).

---

## 2. Visual style

### 2.1 lusthaven

lusthaven ships **two** style blocks in one `<style>`: a "legacy" block
(`index.html:276` onwards, contains the original title CSS) and a newer
**"LUSTHAVEN DESIGN SYSTEM — occult / arcane sensual"** block
(`index.html:468` onwards) whose rules override the legacy ones at equal
specificity. The title screen's final look is defined by the design system.

**Full CSS custom-property block** (`index.html:469-502`):

```css
:root{
  /* base surfaces */
  --bg-0:#0a0713; --bg-1:#120a20; --bg-2:#1a1030;
  --surface:rgba(26,16,48,.72); --surface-2:rgba(36,22,64,.82); --surface-3:rgba(46,28,80,.9);
  --glass-blur:12px;
  /* accents */
  --arcane:#b57bff; --arcane-deep:#7c3aed; --arcane-soft:rgba(168,85,247,.16);
  --blood:#e11d48; --blood-deep:#9f1239; --blood-soft:rgba(225,29,72,.14);
  --gold:#d9b871; --gold-deep:#b08d3e; --gold-soft:rgba(217,184,113,.14);
  --sigil:#67d6e2; --sigil-soft:rgba(103,214,226,.14);
  /* text */
  --text:#efe6d8; --text-dim:#b9a9cf; --text-mute:#7d6f98; --ink-on-accent:#12081f;
  /* lines & structure */
  --line:rgba(150,110,200,.24); --line-strong:rgba(180,140,230,.4);
  --radius:14px; --radius-sm:9px; --radius-lg:20px; --radius-pill:999px;
  /* elevation & glow */
  --shadow-1:0 2px 8px rgba(0,0,0,.35);
  --shadow-2:0 10px 34px rgba(0,0,0,.5);
  --glow-arcane:0 0 22px rgba(168,85,247,.35);
  --glow-blood:0 0 22px rgba(225,29,72,.32);
  --glow-gold:0 0 20px rgba(217,184,113,.3);
  /* spacing scale */
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --s6:32px;
  /* type */
  --font-display:'Cinzel',Georgia,serif;
  --font-body:'Cormorant Garamond','Iowan Old Style',Georgia,serif;
  --font-ui:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;
  /* motion */
  --dur-fast:.14s; --dur:.24s; --dur-slow:.5s; --ease:cubic-bezier(.22,.61,.36,1);
}
```

**Page background** — ambient layered gradients plus an animated "arcane haze"
via `body::before` (`index.html:505-527`):

```css
body{
  background:
    radial-gradient(1200px 800px at 15% -10%, rgba(124,58,237,.18), transparent 60%),
    radial-gradient(1000px 700px at 110% 10%, rgba(225,29,72,.13), transparent 55%),
    radial-gradient(900px 900px at 50% 120%, rgba(103,214,226,.06), transparent 60%),
    linear-gradient(160deg,#0a0713,#120a20 45%,#0a0713);
  background-attachment:fixed;
  color:var(--text); font-family:var(--font-body);
  font-size:18px; line-height:1.7; min-height:100vh; text-align:left;
  padding:14px; -webkit-font-smoothing:antialiased;
}
body::before{ /* drifting arcane haze */
  content:''; position:fixed; inset:-20%; z-index:-2; pointer-events:none;
  background:
    radial-gradient(3px 3px at 20% 30%, rgba(181,123,255,.5), transparent),
    radial-gradient(2px 2px at 70% 60%, rgba(217,184,113,.4), transparent),
    radial-gradient(2px 2px at 40% 80%, rgba(225,29,72,.35), transparent),
    radial-gradient(2px 2px at 85% 25%, rgba(103,214,226,.4), transparent),
    radial-gradient(3px 3px at 55% 15%, rgba(181,123,255,.35), transparent);
  background-size:cover; opacity:.5; animation:drift 26s ease-in-out infinite alternate;
}
body::after{ /* subtle vignette frame */
  content:''; position:fixed; inset:0; z-index:-1; pointer-events:none;
  /* (gradient vignette) */
}
```

**Title-screen CSS** — final (design-system) rules, `index.html:744-751`
(overriding the legacy `.title-screen`/`.title-bg-*` rules at `index.html:290-296`):

```css
/* ---------- title screen ---------- */
.title-screen h1{font-family:var(--font-display);font-size:70px;letter-spacing:.12em;text-shadow:0 0 46px rgba(217,184,113,.55),0 0 90px rgba(225,29,72,.3)}
.subtitle{font-family:var(--font-body);font-style:italic;color:var(--gold);font-size:20px;letter-spacing:.04em}
.title-arrow-btn{background:rgba(18,10,32,.7);border:1px solid var(--line-strong);color:var(--gold);backdrop-filter:blur(6px)}
.title-arrow-btn:hover{background:rgba(225,29,72,.5);box-shadow:var(--glow-blood)}
```

Legacy block that still supplies the structural layout (`index.html:290-306`):

```css
.title-screen{position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:flex-start;padding:0;z-index:50;overflow:hidden}
.title-bg-layer{position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(135deg,#0a0510,#1a0a20,#0a0510);z-index:0}
.title-bg-img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;z-index:1;opacity:0;transition:opacity 1.2s ease-in-out}
.title-bg-img.visible{opacity:1}
.title-bg-overlay{position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(90deg,rgba(10,5,16,.92) 0%,rgba(10,5,16,.75) 25%,rgba(10,5,16,.35) 50%,rgba(10,5,16,.1) 80%,rgba(10,5,16,.3) 100%);z-index:2}
.title-content{position:relative;z-index:3;padding:0 0 0 60px;max-width:420px}
.title-screen h1{font-size:64px;text-shadow:0 0 40px rgba(212,175,55,.6),0 0 80px rgba(196,30,58,.3);margin-bottom:5px;letter-spacing:6px;line-height:1}
.subtitle{color:var(--blood);font-size:18px;margin-bottom:30px;font-style:italic;text-shadow:0 0 20px rgba(0,0,0,.8)}
.title-buttons{display:flex;flex-direction:column;gap:12px;margin:20px 0;max-width:280px}
.title-buttons .big-btn{width:100%;margin:0}
.title-arrow-btn{background:rgba(20,10,25,.8);color:var(--gold);border:1px solid var(--gold);width:48px;height:48px;border-radius:50%;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;transition:all .2s;backdrop-filter:blur(4px)}
.title-arrow-btn:hover{background:rgba(196,30,58,.6);transform:scale(1.1)}
.title-arrow-btn:disabled{opacity:.3;cursor:not-allowed;transform:none}
.title-counter{color:var(--text-dim);font-size:13px;font-family:Georgia,serif;text-shadow:0 0 8px rgba(0,0,0,.8);min-width:50px;text-align:center}
```

Legacy menu button (`index.html:283-288`) — used for the title buttons:

```css
.big-btn{background:linear-gradient(135deg,#8b1a3a,var(--blood));color:#ffd700;border:2px solid var(--gold);padding:12px 30px;font-size:18px;cursor:pointer;border-radius:6px;font-family:Georgia,serif;transition:all .2s;margin:5px}
.big-btn:hover{transform:scale(1.05);box-shadow:0 0 20px rgba(196,30,58,.5)}
.action-btn:disabled{opacity:.5;cursor:not-allowed}
```

- **Typography:** Google Fonts stylesheet at `index.html:272-274`:
  `family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600;700`.
  Title: **Cinzel** 70px, weight 600 default, `letter-spacing:.12em`, gold glow
  shadow. Subtitle: **Cormorant Garamond** italic 20px gold. UI font is Inter.
- **Hover/focus/active/disabled:** `.big-btn:hover` scales 1.05 + red glow;
  `.title-arrow-btn:hover` turns blood red, scales 1.1; `:disabled` = opacity
  .3, `cursor:not-allowed`. No `:focus` or `:active` styles exist.
- **Transitions/animations:** `transition:all .2s` on buttons, the 1.2s image
  crossfade, and the ambient `drift` keyframe on `body::before`. **No entrance
  animation** for the title screen itself.
- **Reduced motion** respected (`index.html:757-761`):
  ```css
  @media(prefers-reduced-motion:reduce){
    *{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}
    body::before{animation:none}
    #mainContent{animation:none}
  }
  ```
- **Responsive** (`index.html:763-764`): at `max-width:600px`, `.title-screen
  h1{font-size:44px}`, body font 17px.
- **Title/logo:** styled `<h1>` text. No image/SVG asset.

### 2.2 stellar-lust

**No CSS custom properties at all** — every value is a literal hex/rgba.
Full title CSS block, `index.html:89-110`:

```css
.title-stage { position:fixed; inset:0; overflow:hidden; background:linear-gradient(135deg,#050511 0%,#0a0a25 50%,#100820 100%); }
.title-bg-layer { position:absolute; inset:0; z-index:0; background:linear-gradient(135deg,#050511,#0a0a25,#100820); }
#titleBgImgA, #titleBgImgB { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:0; transition:opacity 1.2s ease-in-out; z-index:1; }
#titleBgImgA.visible, #titleBgImgB.visible { opacity:1; }
.title-bg-overlay { position:absolute; inset:0; z-index:2; background:linear-gradient(to right, rgba(5,5,17,.92) 0%, rgba(5,5,17,.75) 25%, rgba(5,5,17,.3) 50%, rgba(5,5,17,.1) 100%); }
.title-content { position:absolute; top:50%; left:0; transform:translateY(-50%); max-width:480px; padding:0 60px; z-index:3; }
.title-content h1 { font-family:'Cinzel',Georgia,serif; font-size:64px; color:#d9b871; text-shadow:0 0 30px rgba(217,184,113,.5), 0 0 60px rgba(217,184,113,.2); margin:0 0 8px; letter-spacing:4px; line-height:1.05; }
.title-content .subtitle { font-family:'Cormorant Garamond',Georgia,serif; font-style:italic; font-size:20px; color:#e11d48; margin:0 0 28px; text-shadow:0 0 15px rgba(225,29,72,.3); }
.title-content .desc { font-family:'Cormorant Garamond',Georgia,serif; font-size:15px; color:#efe6d8; max-width:380px; margin:0 0 24px; line-height:1.5; opacity:.85; }
.title-content .btn-stack { display:flex; flex-direction:column; gap:12px; max-width:280px; }
.title-btn { font-family:'Cinzel',Georgia,serif; font-size:18px; padding:14px 32px; border:2px solid #d9b871; background:rgba(10,7,19,.6); color:#d9b871; cursor:pointer; transition:all .25s; letter-spacing:2px; border-radius:2px; text-align:center; }
.title-btn:hover { background:rgba(217,184,113,.15); box-shadow:0 0 20px rgba(217,184,113,.3); transform:translateX(4px); }
.title-btn.gold { background:rgba(217,184,113,.1); }
.title-btn:disabled { opacity:.35; cursor:not-allowed; border-color:#555; color:#555; }
.title-loading { font-family:'Cormorant Garamond',Georgia,serif; font-size:13px; color:#b57bff; margin-top:16px; min-height:20px; }
.title-warning { font-family:'Cormorant Garamond',Georgia,serif; font-size:12px; color:#e11d48; margin-top:20px; opacity:.7; }
.title-footnote { font-family:'Cormorant Garamond',Georgia,serif; font-size:11px; color:#665; margin-top:8px; opacity:.5; }
.title-arrows { position:absolute; bottom:30px; right:30px; z-index:4; display:flex; align-items:center; gap:12px; }
.title-arrow-btn { width:48px; height:48px; border-radius:50%; border:2px solid rgba(217,184,113,.4); background:rgba(10,7,19,.6); color:#d9b871; font-size:20px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .2s; }
.title-arrow-btn:hover:not(:disabled) { border-color:#d9b871; box-shadow:0 0 15px rgba(217,184,113,.3); }
.title-arrow-btn:disabled { opacity:.2; cursor:not-allowed; }
.title-counter { font-family:'Cormorant Garamond',Georgia,serif; font-size:14px; color:#d9b871; min-width:50px; text-align:center; }
@media (max-width:600px) {
  .title-content { padding:0 20px; max-width:300px; }
  .title-content h1 { font-size:44px; letter-spacing:2px; }
  .title-content .subtitle { font-size:16px; }
  .title-btn { max-width:220px; font-size:16px; }
  .title-arrows { bottom:20px; right:15px; }
}
```

- **Typography:** Google Fonts (`index.html:13-15`): `family=Cinzel:wght@400;700;900&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600`.
  Title **Cinzel 64px #d9b871** (gold), `letter-spacing:4px`; subtitle
  **Cormorant Garamond italic 20px #e11d48** (crimson); body text `#efe6d8`
  (warm off-white).
- **Hover states:** `.title-btn:hover` tints gold + glows + `translateX(4px)`;
  `.title-arrow-btn:hover:not(:disabled)` glows gold; `:disabled` greys out
  (opacity .35 / .2). No `:focus`/`:active`.
- **Entrance animation:** none for the title stage. (The page has a starfield
  `body::before` and a `pulse-bg` loading shimmer elsewhere.)
- **Title/logo:** styled `<h1>` text.

### 2.3 hedonism-island

System-font app; menu colors are light-grey buttons on a dark photo backdrop.

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  line-height: 1.6;
  color: #333;
  background: #1a1a1a url('https://user.uploads.dev/file/f2298da58835e5109933fa05e8e40561.png') center/contain no-repeat fixed;
  min-height: 100vh;
  overflow-x: hidden;
}

.main-menu {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  padding-left: 15%;
  z-index: 1000;
  opacity: 1;
  transition: opacity 0.4s ease-in-out;
}
.main-menu.hidden { opacity: 0; pointer-events: none; }

.menu-container {
  background: rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(1px);
  padding: 40px 50px;
  border-radius: 20px;
  box-shadow: 0 10px 50px rgba(0, 0, 0, 0.8);
  text-align: left;
  border: 2px solid rgba(255, 255, 255, 0.1);
  animation: menuSlideIn 0.5s ease;
  max-width: 400px;
  width: 100%;
}

@keyframes menuSlideIn {
  from { opacity: 0; transform: translateY(-30px); }
  to   { opacity: 1; transform: translateY(0); }
}

.game-title {
  font-size: 3.5rem;
  font-weight: 900;
  color: #fff;
  margin: 0 0 10px 0;
  text-shadow:
    0 0 20px rgba(255, 255, 255, 0.5),
    0 0 40px rgba(255, 100, 100, 0.3),
    3px 3px 6px rgba(0, 0, 0, 0.8);
  letter-spacing: 3px;
}

.game-subtitle {
  font-size: 1.2rem;
  color: #aaa;
  margin: 0 0 40px 0;
  font-weight: 300;
  letter-spacing: 2px;
}

.menu-buttons { display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px; }

.menu-btn {
  padding: 12px 30px;
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
  background: rgba(185, 185, 185, 0.8);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-transform: uppercase;
  letter-spacing: 1px;
  width: 100%;
  text-align: left;
}
.menu-btn:hover {
  background: rgba(60, 60, 60, 0.9);
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-3px);
  box-shadow:
    0 8px 20px rgba(0, 0, 0, 0.6),
    0 0 20px rgba(255, 255, 255, 0.1);
}
.menu-btn:active { transform: translateY(-1px); }
.menu-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

.version-info { font-size: 0.9rem; color: #666; margin: 0; font-style: italic; }
```

Responsive (`index.html:24163-24192`), `max-width:768px`:

```css
@media (max-width: 768px) {
  .main-menu { justify-content: center; padding-left: 0; }
  .menu-container { padding: 40px 30px; text-align: center; max-width: 90%; }
  .game-title { font-size: 2.5rem; }
  .game-subtitle { font-size: 1rem; }
  .menu-btn { font-size: 1rem; padding: 12px 25px; text-align: center; }
  .discord-logo-link { width: 80px; height: 80px; bottom: 15px; right: 15px; border-radius: 15px; padding: 8px; }
}
```

- **Custom properties:** none.
- **Typography:** system sans-serif stack, no web fonts. Title weight 900,
  `text-transform` none but letter-spacing 3px.
- **Entrance animation:** the **only one of the three with a menu entrance
  animation** — `menuSlideIn 0.5s ease` (fade + slide down 30px) on the
  container.
- **Title/logo:** styled `<h1>` text.

---

## 3. The background slideshow

**hedonism-island: not found in source.** It has no slideshow — its menu is
static text over the fixed body background image. The entire rest of this
section describes lusthaven and stellar-lust, which implement the identical
pattern. I document the shared mechanics once and list the per-game
differences explicitly.

### 3.1 How images are generated (plugin + call signature)

Both import the plugin in `main.pjs`:

```
generateText = {import:ai-text-plugin}
generateImage = {import:text-to-image-plugin}
kv = {import:kv-plugin}
```

- lusthaven `main.pjs:1-3`; stellar-lust `main.pjs:1-3` (identical).

**lusthaven call** (`index.html:1703`):

```js
let r=await generateImage({prompt,resolution:"768x768",negativePrompt:titleGallery.negativePrompt});
titleGallery.images.push(r.dataUrl);
```

**stellar-lust call** (`index.html:781`):

```js
let result = await generateImage({ prompt, resolution:'768x768', negativePrompt:TITLE_NEG });
if (result && result.dataUrl) {
  titleGallery.images.push(result.dataUrl);
  saveTitleImgToKV(result.dataUrl);
  ...
}
```

Options passed: **only** `prompt`, `resolution:'768x768'`, `negativePrompt`.
No `seed`, no model/style/guidance. Both games then use `result.dataUrl`
directly (a data: URL, pushed into `<img src>` and stored in kv).

**Negative prompts:**

- stellar-lust (`index.html:716`):
  ```js
  const TITLE_NEG = 'blurry, low quality, deformed, ugly, bad anatomy, bad face, text, watermark, child, male focus, masculine';
  ```
- lusthaven (property of `titleGallery`, `index.html:1612-1613`):
  ```js
  let titleGallery={
    negativePrompt:"blurry, low quality, censored, deformed, bad anatomy, extra limbs, extra fingers, mutated hands, fused fingers, text, watermark, signature, jpeg artifacts, oversaturated, flat colors, simple background, cropped, out of frame",
    images:[],
    idx:0,
    autoTimer:null,
    generating:false,
    MAX_CACHED:30
  };
  ```

**Important lusthaven-only detail:** lusthaven wraps the *entire* generator in
a styling/archive wrapper (`index.html:875-909`). `generateImage` is rebound
to a function that rewrites every prompt before it reaches the plugin:

```js
const _origGenerateImage = generateImage;
const ART_STYLE_TAIL=', cohesive anime illustration, cel-shaded, clean linework, arcane occult lighting, amethyst and crimson color grade, candlelit volumetric glow, atmospheric depth';
const ART_NEG_BASE='3d render, photorealistic, photograph, western cartoon, rough sketch, watermark, signature, text, extra limbs, deformed';

function applyArtStyle(p){
  if(!p||typeof p!=='string')return p;
  if(p.indexOf('amethyst and crimson color grade')!==-1)return p; // idempotent
  p=p.replace(/digital painting/gi,'anime style');
  if(!/anime/i.test(p))p=p.replace(/[,\s]*$/,'')+', anime style';
  return p+ART_STYLE_TAIL;
}
generateImage = async function(...args){
  let origPrompt='';
  try{
    let o=args[0];
    if(typeof o==='string'){origPrompt=o; args[0]=applyArtStyle(o);}
    else if(o&&typeof o==='object'){
      origPrompt=o.prompt||'';
      if(o.prompt)o.prompt=applyArtStyle(o.prompt);
      o.negativePrompt=(o.negativePrompt?o.negativePrompt+', ':'')+ART_NEG_BASE;
    }
  }catch(e){}
  let r;
  try{ r = await _origGenerateImage(...args); }catch(e){ throw e; }
  try{
    if(r && r.dataUrl){
      let prompt=origPrompt, opts=args[0]||{};
      if(!prompt){ if(typeof opts==='string')prompt=opts; else if(opts.prompt)prompt=opts.prompt; }
      let ctx=_imgCtx; _imgCtx=null;
      let type = ctx&&ctx.type ? ctx.type : inferImgType(prompt);
      let subject = ctx&&ctx.subject ? ctx.subject : inferSubject(prompt);
      let location = ctx&&ctx.location ? ctx.location : (game.currentLocation?game.currentLocation.name:null);
      galleryAdd({dataUrl:r.dataUrl, prompt, type, subject, location, ts:Date.now(), day:game.day||1, worldTime:game.worldTime||0});
    }
  }catch(e){ console.error('gallery log', e); }
  return r;
};
```

So in lusthaven the *final* prompt actually sent to the plugin is:
`<assembled prompt> + ", anime style, cohesive anime illustration, cel-shaded,
clean linework, arcane occult lighting, amethyst and crimson color grade,
candlelit volumetric glow, atmospheric depth"` and the negative prompt is the
titleGallery negative plus `ART_NEG_BASE`. The title-call's `r.dataUrl` is
also automatically logged to the in-game gallery via `galleryAdd`.

### 3.2 How prompts are assembled

Prompts are built in **`genTitlePrompt()`**, which lives in `main.pjs` for
lusthaven and in `index.html` for stellar-lust. Lists are flat string lists
with **no odds/weights** (`^`), no tags, no sub-hierarchy — each entry is one
complete noun phrase. Selection is uniform `selectOne`.

**lusthaven `main.pjs:943-958` (verbatim):**

```js
genTitlePrompt() =>
  let subject = titleGallerySubject.selectOne.evaluateItem;
  let setting = titleGallerySetting.selectOne.evaluateItem;
  let mood = titleGalleryMood.selectOne.evaluateItem;
  let isHardcore = Math.random() < 0.5;
  let action;
  if (isHardcore) {
    action = titleGalleryPartner.selectOne.evaluateItem;
  } else {
    action = titleGallerySoloPose.selectOne.evaluateItem;
  }
  let prefix = isHardcore ? "explicit hardcore fantasy porn, beautiful nude female character, " : "beautiful nude female fantasy character, ";
  let suffix = isHardcore ? ", explicit sex, graphic penetration, detailed genitals, fluids, nsfw, adult, porn" : ", nsfw, adult";
  return prefix + subject + ", " + action + ", " + mood + ", " + setting + ", anime art style, highly detailed face, detailed skin texture, soft volumetric lighting, rich colors, depth of field, masterpiece, best quality" + suffix;
```

Concatenation order (lusthaven): `[prefix] + subject + ", " + action + ", "
+ mood + ", " + setting + ", anime art style, highly detailed face, detailed
skin texture, soft volumetric lighting, rich colors, depth of field,
masterpiece, best quality + [suffix]`.

**stellar-lust `index.html:720-738` (verbatim):**

```js
function genTitlePrompt() {
  let subject = root.titleGallerySubject.selectOne.evaluateItem;
  let setting = root.titleGallerySetting.selectOne.evaluateItem;
  let mood = root.titleGalleryMood.selectOne.evaluateItem;
  let hardcore = Math.random() < 0.5;
  let pose;
  if (hardcore) {
    pose = root.titleGalleryPartnerPose.selectOne.evaluateItem;
    return 'explicit sci-fi erotica, beautiful nude female alien character, ' + subject + ', ' + pose + ', ' + setting + ', ' + mood + ', explicit sex, graphic penetration, nsfw, adult, anime art style, highly detailed face, detailed skin texture, soft volumetric lighting, rich colors, depth of field, masterpiece, best quality';
  } else {
    pose = root.titleGallerySoloPose.selectOne.evaluateItem;
    return 'beautiful nude female sci-fi character, ' + subject + ', ' + pose + ', ' + setting + ', ' + mood + ', nsfw, adult, anime art style, highly detailed face, detailed skin texture, soft volumetric lighting, rich colors, depth of field, masterpiece, best quality';
  }
}
```

Concatenation order (stellar-lust): `[prefix] + subject + ", " + pose + ", "
+ setting + ", " + mood + ", [style block]". Note stellar-lust puts **pose
before setting before mood** (lusthaven: action, mood, setting).

**List inventory + entry counts** (counted programmatically from the pjs):

| List | lusthaven entries | stellar-lust entries |
|---|---|---|
| `titleGallerySubject` | 48 | 54 |
| `titleGallerySetting` | 15 | 57 |
| `titleGalleryMood` | 14 | 47 |
| `titleGallerySoloPose` | 35 | 49 |
| `titleGalleryPartner` / `titleGalleryPartnerPose` | 30 | 49 |

lusthaven `main.pjs:399` (subject), `:449` (setting), `:466` (solo pose),
`:503` (partner), `:535` (mood).
stellar-lust `main.pjs:41` (subject), `:97` (setting), `:156` (mood), `:205`
(solo pose), `:256` (partner pose).

Representative entries:

- lusthaven subject: *"a succubus with large bat-like wings and a slender
  tail"*, *"a dark elf with dusky purple skin and long white hair"*;
  setting: *"candlelit bedchamber with red silk drapes and flickering wall
  sconces"*, *"opulent brothel room with velvet cushions and gauzy curtains"*;
  solo pose: *"reclining on her back with one arm behind her head, legs
  elegantly crossed"*; partner: *"being fucked hard from behind by a busty
  futa demoness with a massive cock"*, *"double penetrated by two futa
  demonesses with massive cocks, airtight"*; mood: *"sensual and inviting, a
  knowing smile on her lips"*, *"drooling slightly, eyes crossed, completely
  cock-drunk and mindless"*.
- stellar-lust subject: *"a sultry Zelthori diplomat with glowing
  bioluminescent patterns across her blue skin, four arms elegantly posed"*,
  *"a curvaceous Krellax huntress with emerald scales glistening, prehensile
  tail coiled seductively"*; setting: *"the bridge of a sleek starship,
  panoramic viewport showing a colorful nebula"*, *"an alien jungle world with
  bioluminescent flora and floating spores"*; solo pose: *"reclining on her
  back, one knee raised, looking up through her lashes"*; partner pose:
  *"being held from behind by strong hands, head thrown back in ecstasy"*;
  mood: *"sensual and inviting, a knowing smile playing on her lips"*, *"lost
  in ecstasy, head thrown back, mouth open, eyes rolled back"*.

### 3.3 Rating / NSFW tags on lists

**Not present in source.** The lists carry no rating/NSFW tags and there is no
filtering or mixing by rating anywhere in the title-slideshow code path.
Instead:

- The hardcore/solo split is a **hard-coded 50/50 coin flip**
  (`Math.random() < 0.5`) inside `genTitlePrompt`, deciding whether to pull
  from the partner list or the solo-pose list and which prefix/suffix strings
  to use.
- Every generated prompt unconditionally contains `nsfw, adult` (solo) or
  `explicit sex, graphic penetration ... nsfw, adult, porn` (hardcore,
  lusthaven) / `explicit sex, graphic penetration, nsfw, adult` (hardcore,
  stellar-lust). The slideshow is **always** NSFW.
- stellar-lust's `game.settings.intensity` (`tame | suggestive | explicit |
  hardcore`, default `explicit`) gates **in-game** scene text/images only
  (`index.html:1693-1705`, `intensityExplicitness()` feeds prompts in
  `proposition()` etc.) — it **does not** gate the title gallery.
- stellar-lust's in-game "Image Generation: Enabled/Disabled" setting
  (`renderSettings`, `index.html:2136`) also does **not** disable the title
  slideshow.

> **Implication for the target game:** the reference games offer no
> content-config-driven filtering for the slideshow. If the target game's
> `meta.contentConfig` must gate it, that logic must be added — e.g. gate the
> hardcore branch, or swap the whole prompt suffix, based on the configured
> rating.

### 3.4 The slideshow loop (interval, transition, crossfade)

Both games share the identical component. Interval: **8000 ms**. Crossfade:
**1.2 s opacity transition** on two stacked `<img>` layers.

**lusthaven (`index.html:1727-1745`):**

```js
function showTitleImg(i){
  if(i<0)i=0;
  let imgA=document.getElementById('titleBgImgA'),imgB=document.getElementById('titleBgImgB');
  if(!imgA||!imgB)return;
  if(!titleGallery.images[i])return;
  let visibleImg=imgA.classList.contains('visible')?imgA:imgB;
  let hiddenImg=imgA.classList.contains('visible')?imgB:imgA;
  hiddenImg.src=titleGallery.images[i];
  hiddenImg.classList.add('visible');
  visibleImg.classList.remove('visible');
  titleGallery.idx=i;
  updateTitleCounter();
}

function startTitleAutoCycle(){
  stopTitleAutoCycle();
  titleGallery.autoTimer=setInterval(()=>{
    let next=titleGallery.idx+1;
    if(next<titleGallery.images.length){
      showTitleImg(next);
    }else{
      genNextTitleImg();
    }
  },8000);
}
function stopTitleAutoCycle(){
  if(titleGallery.autoTimer){clearInterval(titleGallery.autoTimer);titleGallery.autoTimer=null;}
}
```

**stellar-lust (`index.html:759-771`)** is the same except: it wraps `i` into
range with modulo instead of clamping to 0, and it updates a `N / M` counter:

```js
function showTitleImg(i) {
  if (!titleGallery.images.length) return;
  let imgA = document.getElementById('titleBgImgA');
  let imgB = document.getElementById('titleBgImgB');
  if (!imgA || !imgB) return;
  i = ((i % titleGallery.images.length) + titleGallery.images.length) % titleGallery.images.length;
  titleGallery.idx = i;
  let visible = imgA.classList.contains('visible') ? imgA : imgB;
  let hidden = visible === imgA ? imgB : imgA;
  hidden.src = titleGallery.images[i];
  hidden.classList.add('visible');
  visible.classList.remove('visible');
  let counter = document.getElementById('titleCounter');
  if (counter) counter.textContent = (i + 1) + ' / ' + titleGallery.images.length;
}
```

Crossfade mechanics: set `hidden.src`, then add `.visible` to the hidden
layer and remove it from the shown one. Because both layers transition
`opacity 1.2s ease-in-out`, the incoming fades up over 1.2 s while the
outgoing fades down — a proper crossfade. The new image's `src` is set *before*
the class flip, so it decodes before fading in.

Layer behavior differences:
- lusthaven: `object-fit:contain` on both imgs (letterboxes; the gradient
  shows at top/bottom or sides). Starts with `#titleBgImgA` already having
  class `visible`.
- stellar-lust: `object-fit:cover` (fills the viewport). Both start hidden.

**Manual navigation** (both games — stops the timer, acts, restarts it):

```js
// lusthaven index.html:1747-1762
function titleNext(){
  stopTitleAutoCycle();
  let next=titleGallery.idx+1;
  if(next>=titleGallery.images.length){
    genNextTitleImg();
  }else{
    showTitleImg(next);
  }
  startTitleAutoCycle();
}
function titlePrev(){
  stopTitleAutoCycle();
  let prev=titleGallery.idx-1;
  if(prev<0)prev=0;
  showTitleImg(prev);
  startTitleAutoCycle();
}
```

(stellar-lust's versions at `index.html:802-831` are identical except
`titlePrev` does not advance beyond the last generated image and
`titleNext`'s overflow case calls `genNextTitleImg()`.)

### 3.5 Prebuffering and concurrency

- **Exactly one in-flight request.** A boolean `titleGallery.generating`
  guards `genNextTitleImg()`; it early-returns if already true.
- **Lazy prebuffer of ~3.** After each successful (or failed) generation,
  both games run:
  ```js
  titleGallery.generating=false;
  if(titleGallery.images.length<3){
    setTimeout(genNextTitleImg,500);
  }
  ```
  (lusthaven `index.html:1725-1726`; stellar-lust `index.html:797-798`) — so
  the system keeps generating every 500 ms until at least 3 images are
  buffered. On manual "next past the end", it generates on demand.
- **Slower generation than the 8 s interval:** the auto-cycle tick that finds
  `next >= images.length` calls `genNextTitleImg()` *without advancing the
  index*, so the current image simply stays up until the next tick finds a new
  image. No request queue, no skipped frames, at most one pending
  request. The interval is not adaptive.
- lusthaven sets a small loading-context marker before generating:
  `setImgCtx('Title')` (`index.html:1700`) — feeds the global gallery log with
  a "Title" type.

### 3.6 Caching

**Both games: in-memory array for the session + kv-plugin persistence across
sessions.** kv is per-user (IndexedDB). No localStorage for images.

- **Store:** kv folder `titleGallery` (so `root.kv.titleGallery`).
- **Key:** `Date.now() + '_' + random6` — e.g.
  lusthaven `let key=String(Date.now())+'_'+Math.random().toString(36).slice(2,6);`
  (`index.html:1685`); stellar-lust
  `let key = Date.now() + '_' + Math.random().toString(36).slice(2,8);`
  (`index.html:744`).
- **Value:** the full data-URL string (`data:image/png;base64,...`), stored
  directly.
- **Eviction policy:** `MAX_CACHED = 30`. After every save the game lists
  entries and deletes the oldest ones beyond 30.
  - stellar-lust (`index.html:744-755`) — correct:
    ```js
    async function saveTitleImgToKV(dataUrl) {
      try {
        let key = Date.now() + '_' + Math.random().toString(36).slice(2,8);
        await root.kv.titleGallery.set(key, dataUrl);
        let entries = await root.kv.titleGallery.entries();
        if (entries.length > titleGallery.MAX_CACHED) {
          entries.sort((a,b) => String(a[0]).localeCompare(String(b[0])));
          for (let i = 0; i < entries.length - titleGallery.MAX_CACHED; i++) {
            await root.kv.titleGallery.delete(entries[i][0]);
          }
        }
      } catch(e) {}
    }
    ```
  - lusthaven (`index.html:1684-1693`) — has a subtle **operator-precedence
    bug** in its sort (see section 6):
    ```js
    let key=String(Date.now())+'_'+Math.random().toString(36).slice(2,6);
    await root.kv.titleGallery.set(key,dataUrl);
    let entries=await root.kv.titleGallery.entries();
    if(entries.length>titleGallery.MAX_CACHED){
      entries.sort((a,b)=>parseInt(a[0].split('_')[0])||0-(parseInt(b[0].split('_')[0])||0));
      let toDelete=entries.slice(0,entries.length-titleGallery.MAX_CACHED);
      for(let [k] of toDelete){await root.kv.titleGallery.delete(k);}
    }
    ```
- **Load at boot:** `loadTitleGalleryFromKV()` reads all entries, sorts by
  key, and pushes any value that is a string starting with `data:image`
  (both games; lusthaven sorts numerically by key prefix,
  stellar-lust lexicographically).
- Only data-URL strings are kept — any other stored type is skipped, so kv
  record shape is effectively `{ "<timestamp>_<rand>": "data:image/...;base64,..." }`.

### 3.7 Failure handling

- The generation call is wrapped in `try/catch` (empty catch that only
  `console.error`s in both games). On failure nothing is pushed and no user
  message is shown.
- Because the `images.length < 3 → retry in 500 ms` tail runs even after a
  failure, a persistently failing/rate-limited plugin triggers a **blind
  500 ms retry loop**. There is no backoff, no cap, and no error UI for rate
  limits in either game.
- kv read/write failures are also swallowed (try/catch empty / `console.error`).
- **The menu never ends up blank:** the `.title-bg-layer` gradient is a
  separate z-0 element behind the (empty) image layers, and the text column +
  arrows are z-2+. With zero images: gradient background + title text +
  arrows **disabled** + counter showing `...` (stellar-lust) or `1` (lusthaven,
  and lusthaven also keeps `titleLoading` hidden).
- stellar-lust additionally shows `Generating gallery...` in `#titleLoading`
  while waiting (set in `initTitleGallery`, `index.html:850`).
- lusthaven: if the very first generation fails, arrows stay disabled and the
  counter stays `...`.

### 3.8 First-image preload (empty menu on initial paint)

Both games run `initTitleGallery()` from `renderTitle()` and never leave the
menu empty on first paint (the gradient is there), but the *image* appears
only after the first success:

**lusthaven (`index.html:1650-1667`):**

```js
async function initTitleGallery(){
  if(titleGallery.images.length>0){
    showTitleImg(titleGallery.idx);startTitleAutoCycle();return;
  }
  titleGallery.idx=0;titleGallery.images=[];
  document.getElementById('titleCounter').textContent='...';
  document.getElementById('titlePrevBtn').disabled=true;
  document.getElementById('titleNextBtn').disabled=true;
  let loaded=await loadTitleGalleryFromKV();
  if(loaded>0){
    showTitleImg(titleGallery.images.length-1);   // shows the NEWEST cached image immediately
    document.getElementById('titlePrevBtn').disabled=false;
    document.getElementById('titleNextBtn').disabled=false;
    startTitleAutoCycle();
    if(loaded<3)genNextTitleImg();
  }else{
    genNextTitleImg();                            // generates the first image; on success
  }                                               // showTitleImg(0) + startTitleAutoCycle()
}
```

**stellar-lust (`index.html:833-859`)** is the same flow plus it sets
`titleLoading` text (`Generating gallery...`, cleared when ≥1 image loads).
On the very first-ever run (no kv entries) the generation path does **not**
clear the loading text (minor bug — the `Generating gallery...` line stays
under the buttons; flagged in section 6).

---

## 4. Discord integration (hedonism-island)

### 4.1 Markup (`index.html:32391-32393`)

The badge is a **sibling of `.menu-container`** inside `#main-menu`, so it is
positioned by `position:fixed` independently of the button stack.

```html
<!-- Discord Link Logo -->
<a href="https://discord.com/invite/E6N9WKpGPA" target="_blank" rel="noopener noreferrer" class="discord-logo-link" title="Join our Discord community!">
  <img src="data:image/svg+xml,%3c?xml%20version='1.0'%20encoding='utf-8'?%3e%3csvg%20xmlns='http://www.w3.org/2000/svg'%20version='1.1'%20width='4096'%20height='4096'%20viewBox='0%200%204096%204096'%3e%3crect%20x='0'%20y='0'%20width='4096'%20height='4096'%20fill='%230b0c0d'%20/%3e%3cg%20fill='%23b47a3c'%20fill-rule='evenodd'%20stroke='none'%3e...%3c/g%3e%3c/svg%3e" class="menu-logo">
</a>
```

### 4.2 The image asset

- **Inline SVG data URI**, not a hosted file. The SVG is a 4096×4096 Discord
  "controller" glyph: a `#0b0c0d` (near-black) rounded-rect background
  `<rect>` with a `#b47a3c` (bronze/brass) Discord-mark `<path>` drawn with
  `fill-rule="evenodd"`. Because it is URL-encoded `data:image/svg+xml,` it
  needs no external request and no storage quota.
- **Rendered size:** the `.discord-logo-link` box is **120×120 px** (80×80 on
  mobile), and `.menu-logo` fills it with `object-fit:contain`.

### 4.3 CSS (`index.html:23996-24039`)

```css
/* Discord Logo Link */
.discord-logo-link {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 120px;
  height: 120px;
  z-index: 1001;
  transition: all 0.3s ease;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
  background: rgba(11, 12, 13, 0.9);
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.discord-logo-link:hover {
  transform: scale(1.1) translateY(-5px);
  box-shadow:
    0 8px 25px rgba(0, 0, 0, 0.7),
    0 0 30px rgba(180, 122, 60, 0.4);
  background: rgba(11, 12, 13, 1);
}

.discord-logo-link:active {
  transform: scale(1.05) translateY(-3px);
}

.menu-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.3));
  transition: filter 0.3s ease;
}

.discord-logo-link:hover .menu-logo {
  filter:
    drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5))
    brightness(1.2);
}
```

- **Placement:** fixed, bottom-right corner (`bottom:20px; right:20px`), so it
  floats over whatever the menu shows and over the game after the menu hides.
  It is deliberately **outside the button stack** — the menu column is
  left-aligned (`padding-left:15%`), the badge anchors the opposite corner.
- **Hover:** scales to 1.1, lifts 5 px, glows bronze (matching the glyph
  color), darkens the tile background, and brightens the logo via CSS filter.
- **Link attributes:** `target="_blank"`, `rel="noopener noreferrer"`,
  plus a `title` tooltip.
- **Invite URL:** `https://discord.com/invite/E6N9WKpGPA`.

### 4.4 Other social / external links

**No other social or external links exist** in hedonism-island's menu (grep
for twitter/x/patreon/youtube/tiktok/reddit/instagram found nothing). The
Discord badge is the only outbound link in the whole menu, and the only
grouping is its fixed-corner placement. (A hosted background PNG
`https://user.uploads.dev/file/f2298da58835e5109933fa05e8e40561.png` backs
`body`, and a second hosted PNG backs the character-creation overlay — assets,
not links.)

---

## 5. Save / load menu

### 5.1 lusthaven — **single slot only, no save UI**

No multi-slot UI and no import/export. Everything is one localStorage key.

- **Key:** `lusthaven_save`. **Value:** `JSON.stringify(game)` — the entire
  live `game` object (`index.html:5005`). On quota failure a "lite" copy is
  saved with `portraitUrl`, `bgUrl`, `iconUrl`, memory transcripts/summaries
  stripped (`index.html:5012-5020`).
- **When:** manual `saveGame()`/autosave. Autosave wiring
  (`index.html:5025-5046`): debounced 2 s after mutations (`AUTOSAVE_DEBOUNCE
  = 2000`), a 30 s `setInterval`, plus `visibilitychange`, `pagehide` and
  `beforeunload` handlers — all skipped while `game.screen==='title'` or
  `'create'`.
- **Continue:** the title's Continue button calls `loadGame()`
  (`index.html:5051`), which does `JSON.parse`, then runs a long chain of
  migration defaults (`if(!game.player.traits)game.player.traits=[];` …),
  re-loads the gallery, unhides the stats bar, and re-renders the saved
  screen.

### 5.2 stellar-lust — **single slot only, no save UI**

- **Key:** `stellarlust_save`. **Record shape** (`index.html:2250-2263`):
  ```js
  function saveGame() {
    try {
      let save = {
        player: game.player, ship: game.ship, galaxy: game.galaxy,
        currentSystemId: game.currentSystem ? game.currentSystem.id : 0,
        npcs: game.npcs, crew: game.crew, quests: game.quests,
        time: game.time, factions: game.factions, settings: game.settings,
        codex: game.codex, mainQuestAct: game.mainQuestAct,
        mainQuestProgress: game.mainQuestProgress,
      };
      localStorage.setItem('stellarlust_save', JSON.stringify(save));
      toast('Game saved! 💾');
    } catch(e) { toast('Save failed!'); }
  }
  ```
- **Load:** `loadGame()` (`index.html:2265`) restores each field with
  defaults, then `updateStats(); renderSystem();`.
- **Autosave:** manual only via the 💾 HUD button — there is no interval
  autosave here (despite a `game.settings.autoSave` toggle that doesn't appear
  wired).
- **Delete:** the Settings screen has a "🗑️ Delete Save" button that removes
  the key and returns to title (`index.html:2144`).
- **Extra key:** `stellarlust_ngplus` — JSON with `{ unlocked, bonusStats,
  bonusCredits, unlocks[] }`, written at ending, read by the title screen to
  show the "★ New Game+" button.
- **No import/export.**

### 5.3 hedonism-island — **full multi-slot save manager + import/export**

This is the reference implementation for a save manager.

**Storage:** per-slot localStorage keys `hedonism_save_<slotName>`
(`index.html:8390`). Slot names in use: `autosave`, `auto_*`, `quick_save`,
`Save N` (manual, max 5), `imported`. Each value is **LZW-compressed** and
prefixed with `LZ:` (falls back to raw JSON if compression doesn't shrink).

**Compressor** (`index.html:7833-7904`): a hand-rolled LZW to a UTF-16 string.

```js
class SaveCompressor {
  static compress(jsonString) {
    try {
      const compressed = SaveCompressor._lzCompress(jsonString);
      const result = "LZ:" + compressed;
      if (result.length < jsonString.length) { ... return result; }
      return jsonString;
    } catch (e) { ... return jsonString; }
  }
  static decompress(stored) {
    if (!stored) return stored;
    if (stored.startsWith("LZ:")) {
      try { return SaveCompressor._lzDecompress(stored.slice(3)); }
      catch (e) { return stored; }
    }
    return stored;
  }
  // _lzCompress: classic LZW dict (dictSize caps at 65536), emits char codes
}
```

**Save record shape** (the JSON inside each slot, `index.html:8366-8397`):

```js
const saveData = {
  version: this.version,
  meta: {
    ...this.state.meta,
    saveDate: (new Date()).toISOString(),
    saveName: slotName
  },
  player: this.player ? this.player.toJSON() : null,
  resourceManager: this.resourceManager ? this.resourceManager.toJSON() : null,
  npcManager: this.npcManager ? this.npcManager.saveNPCs() : [],
  questManager: window.game?.questManager ? window.game.questManager.toJSON() : null,
  tutorial: window.game?.tutorial ? window.game.tutorial.toJSON() : null,
  weather: this.weather ? this.weather.serialize() : null,
  buildings: window.game?.buildingManager ? window.game.buildingManager.toJSON() : null,
  state: { ...this.state, meta: void 0 },
};
const jsonString = JSON.stringify(saveData);
const compressed = SaveCompressor.compress(jsonString);
localStorage.setItem(`hedonism_save_${slotName}`, compressed);
```

**Slot metadata** (what `listSaves()` reads back, `index.html:8631-8668`):
for each `hedonism_save_*` key, decompress + parse, then build
`{ slotName, version, saveDate, playerName, day, playTime, health,
characterCount }` (field paths differ for v1 vs v2 saves). Sorted newest
first.

**The Save Manager UI** (`SaveManager` class, `index.html:13797`+) — a modal
with:

- Header: 💾 "Save Manager" / "Continue • Save/Load • Import/Export".
- Action buttons: **▶ Continue**, **⏺ Quick Save** (writes `quick_save`),
  **⏮ Quick Load** (loads newest `quick_*`), **⬇ Export**, **⬆ Import** (hidden
  `<input type="file" accept=".json">`).
- Tabs: **Manual Saves** / **Autosaves**; a 🔍 search box; a sortable table
  (Name / Day-Time / Saved At / Character / Location / Playtime) with a
  "Create New Save (N slots remaining)" row (max 5 manual).
- Each row: editable slot-name text input (rename = load + save-new + delete-old,
  `index.html:14336-14360`), a type tag (`autosave`/`auto`/`quick`/`manual`),
  "Day N", saved date, character name, location, playtime, and per-row
  **Save (overwrite) / Load / Export / Delete** buttons.
- Keyboard: F5 quick save, F9 quick load, Esc close. A toast notification
  system and an inline confirm overlay back all actions.
- **Export format** (`index.html:14404-14417`): downloads the *raw stored
  string* (still `LZ:`-compressed) as
  `hedonism_island_<slot>.json`. **Import** (`index.html:14426`,
  `gameState.importSave` at `index.html:8617`): reads the file text,
  `JSON.parse`s it, `loadState(...)`, then saves a copy under `imported`.
- **Menu wiring:** the main-menu "Load Game" button prefers
  `window.game.saveManager.show()` and only falls back to a simpler legacy
  modal (`showLoadMenu`, `index.html:9816`) if the manager is unavailable.
  Legacy modal uses `.load-game-modal`, `.save-item` cards (slot name, "Day X
  • Y characters • playtime", date, Load/Delete).
- **Continue** (`index.html:9753`): loads `hedonism_save_autosave`, first
  checking `meta.version` against `window.GAME_VERSION` /
  `window.COMPATIBLE_VERSIONS` and refusing with a version-mismatch dialog.
- **Clear Old Saves** button removes every localStorage key starting with
  `hedonism`.

---

## 6. Reusable conventions

### Shared house style across all three

1. **The slideshow component is one reused pattern** (lusthaven and
   stellar-lust). Same names, same mechanics: `titleGallery` object with
   `images/idx/autoTimer/generating/MAX_CACHED`, `initTitleGallery`,
   `genNextTitleImg`, `showTitleImg`, `startTitleAutoCycle` /
   `stopTitleAutoCycle`, `titlePrev`/`titleNext`, kv folder `titleGallery`,
   `MAX_CACHED=30`, 8 s interval, 1.2 s crossfade, 3-image lazy buffer,
   500 ms refill retry, `data:image`-only kv filter, key
   `<timestamp>_<rand6>`. Copying one game's block gives you the other's.
2. **Two-layer opacity crossfade.** Both games use two absolute `<img>` layers
   toggling a `.visible` class with `transition:opacity 1.2s ease-in-out`,
   hidden layer's `src` set before the flip. (lusthaven `object-fit:contain`,
   stellar-lust `cover`.)
3. **Screen manager pattern (the two dark-fantasy RPGs).** Screens are
   re-rendered as template literals into one container (`#mainContent`);
   `game.screen` is the state string; HUD shown/hidden via `statsBar.hidden`;
   `renderX()` naming; functions exposed for inline `onclick` via a
   `window.fn = fn` export block. hedonism-island instead uses persistent DOM
   + `.hidden` class toggling + ES classes (`MainMenu`, `OptionsMenu`,
   `SaveManager`, `SettingsMenu`) with addEventListener wiring — a bigger,
   more maintainable OO approach.
4. **Font pairing.** lusthaven and stellar-lust both load **Cinzel** (display
   serif for the title and menu buttons) + **Cormorant Garamond** (italic
   body/subtitle) from Google Fonts, and both render the title in gold
   (`#d9b871`) on a very dark purple/blue gradient with layered glow
   text-shadows. hedonism-island uses the system sans stack — visually the
   odd one out.
5. **Menu button component.** Translucent, bordered, uppercase, letterspaced
   buttons with a glow + lift on hover: `.big-btn` (lusthaven), `.title-btn`
   (stellar-lust), `.menu-btn` (hedonism). All three hide/disable the Continue
   button until a save exists.
6. **Content warning on the menu.** All three games put an 18+/content warning
   line directly under the menu buttons.
7. **Negative-prompt house style.** Both slideshow games hard-code a similar
   negative prompt ("blurry, low quality, deformed, bad anatomy, text,
   watermark…").

### Things I'd flag

1. **lusthaven kv-eviction sort bug** (`index.html:1688`):
   `entries.sort((a,b)=>parseInt(a[0].split('_')[0])||0-(parseInt(b[0].split('_')[0])||0))`
   — `||` binds looser than `-`, so the comparator returns the first key's
   integer for *every* comparison (a constant-ish truthy value). It "works"
   only because `Array.prototype.sort` is stable, leaving insertion order, so
   the oldest (inserted first) entries still get deleted. Fix:
   `(parseInt(a)||0) - (parseInt(b)||0)`. stellar-lust's
   `String(a[0]).localeCompare(String(b[0]))` is the correct pattern.
2. **stellar-lust loading text never clears on first-ever run.** The
   `Generating gallery...` text in `#titleLoading` is only cleared in the
   "≥1 image loaded from kv" branch of `initTitleGallery`. When generation
   produces the first-ever image, `genNextTitleImg`'s `wasEmpty` branch calls
   `showTitleImg(0)` + `startTitleAutoCycle()` but not `titleLoading.textContent=''`.
3. **No rate-limit handling.** On persistent generation failure both games
   retry every 500 ms forever with no backoff and no user-visible error, and
   arrows stay disabled — the menu degrades to a static gradient behind the
   (perfectly readable) text column. Consider a max-retry cap + a
   "generation unavailable" note.
4. **kv stores full data-URLs.** 768×768 base64 PNGs are ~1–2 MB each; 30 of
   them per user is tens of MB of IndexedDB. Consider storing upload URLs
   (or `image/avif`/webp) instead if quota matters in the target game.
5. **The slideshow ignores all rating/settings.** Neither game gates the title
   gallery by `game.settings.intensity` or an images-on/off toggle; it is
   always-on and always-NSFW. The target game's `meta.contentConfig` gating
   must be layered on top — none of these three is a model for that.
6. **lusthaven's art-style wrapper double-styles the title prompt.** Because
   the wrapper appends ", anime style" + `ART_STYLE_TAIL` to *every* prompt —
   including the title gallery's, which already ends with "anime art
   style, … masterpiece, best quality" — title images get the style words
   twice. Harmless but redundant; the idempotence guard only checks for the
   color-grade phrase.
7. **hedonism-island dead-ish code:** the legacy `showLoadMenu` modal is only
   a fallback and duplicates the SaveManager; the `autoSave` setting toggle in
   stellar-lust isn't wired to anything.
8. **What each game does better:**
   - stellar-lust: correct kv sort; modulo-safe index; `result && result.dataUrl`
     guard before pushing; disabled arrows get a `:hover:not(:disabled)` guard.
   - lusthaven: `object-fit:contain` never crops the subject; `prefers-reduced-motion`
     support; the wrapper's idempotent style enforcement keeps every image
     on-theme; the `titleLoading` element is simply hidden when unused (no
     stuck text — the inverse of stellar-lust's bug).
   - hedonism-island: the only real save manager (named/renamable slots,
     per-slot overwrite/load/export/delete, autosave vs manual tabs, version
     checking, import/export, keyboard shortcuts) and the only menu with an
     entrance animation. Its inline-SVG Discord badge needs no hosting.

---

*Prepared for the target game's reimplementation: the slideshow can be lifted
nearly verbatim onto the existing `root.generateImage` plumbing (the only
wiring change is calling `root.generateImage` instead of the wrapper/global),
with `meta.contentConfig`-based filtering added to `genTitlePrompt`'s
hardcore/solo branch, and the hedonism-island SaveManager + Discord badge
styles copied for the Phase-10 menu and saves.*
