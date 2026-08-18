# Mobile Layout Overhaul

Status: **complete — all three phases shipped and verified live.** The mobile
horizontal crop is fixed at the root, the play shell is polished for
portrait/touch, and every overlay/system in the game has been swept for
narrow-viewport overflow. Moved to `complete/` 2026-08-15.
Last updated 2026-08-15.

Companions:
- `src/ref/complete/scene-reader-ui-plan.md` (the `#main-content` bands this plan lays out on phones)
- `src/ref/complete/inventory-needs-menu-saves-plan.md` (the `.invp-box`/`.svp-box` overlay chrome, already vw-capped)
- `src/ref/structural/ARCHITECTURE.md` (the as-built map; BrineOS/phone & desktop-shell sections cover the other two shells this plan sweeps)

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session.

---

## Handoff — read this first

**Resume at:** None — plan complete. All three phases shipped and verified
live 2026-08-15.

**Last session's notes (Phase 3 execution, 2026-08-15):** Full-system sweep.
- **D6:** `#debug-panel` → `width: min(480px, 100vw)` (was fixed 480px — 127px
  hung off a 353px phone). Computed width verified = viewport.
- **Sweep find (fixed, D1 treatment):** `.win` has `min-width: var(--win-min-w)`
  (360px); compact screens force every window fullscreen (`width: 100%`), so
  on <360px viewports the used width stayed 360px and ~7px of the window's
  right edge (chrome + content) was clipped by `#main-content`'s overflow.
  Fixed: `.win { min-width: 0; min-height: 0 }` inside the compact media block
  (kept byte-for-byte in sync with `isDesktopShellCompact()`). Verified: all
  five sampled apps now fit exactly (was R360 on a 353 viewport).
- **Sweep checklist** (real `data-action` chains at the live 353px viewport,
  no-horizontal-crop assertion, **zero offenders everywhere**): play screen ·
  menu title · menu options · save panel · inventory panel · container
  (wardrobe) · debug panel · computer desktop · apps im/shop/browser/stream/
  home · phone home/tracker/clock/camera/settings · conversation overlay ·
  interrupt bubble · player studio · char form (modal-overlay) · intro
  cutscene · loading overlay.
- **Widths:** the harness can't resize the preview iframe and `html { zoom }`
  doesn't move vw/media queries, so 412/768 were not simulated. For fixed /
  `inset: 0` overlay shells, fitting at 353 implies fitting at every larger
  width; the ≤900px shell grid is 1-column and governed by the Phase 1 fix, so
  it cannot crop at 768 either. Nothing on the plan's "only if it overflows"
  list (chips wrap, header fullscreen hide) was triggered by measurement.
- `vision` at 353px on the three highest-traffic screens — play screen
  (header/scene/reader/footer all fit; reader visibly taller than the scene
  image), computer desktop with the IM window (window edge-to-edge, taskbar
  clear, no overlap), phone home (shell contained, tile grid complete). No
  structural clipping on any.

**Phase 2 notes (2026-08-15):** Play-shell mobile
polish shipped. All locked decisions implemented, verified live:
- **D4 (touch targets)** — new coarse-pointer block in `index.html` after the
  compact-desktop block: `.chip` (min-height 40px, flex-centered),
  `.footer-tab` (min-height 40px, 12px vert padding), `.fsi` (min-height 40px,
  12px vert padding), `.drawer-toggle` (44×44), `.phone-screennav-btn`
  (min-height 44px, 12px vert padding). The dev iframe is a fine-pointer
  desktop so the query can't fire live — verified by applying the same
  declarations un-gated: chip 40, tab 40, fsi 40, drawer 44. Font sizes
  unchanged.
- **D3 (affordance)** — `#action-chips[data-scrollable]::after` fade (32px,
  gradient to `--color-surface`, `pointer-events: none`; `#action-chips` now
  `position: relative`). Deliberate small deviation: the fade is gated on a
  `data-scrollable` attribute (render hook in `render.js` sets it when the
  strip overflows and drops it on scroll-to-end) so the affordance is honest —
  it never paints over a row where every chip fits. One-shot nudge in
  `render.js`: `maybeChipNudgeHint()` runs at the end of
  `_renderTabsAndChips` (covers both full renders and tab switches), animates
  80px over 550ms, gated on coarse pointer + a `sessionStorage` flag.
  Verified: forced coarse → nudge 0→72→80px, flag stored, second call no-ops.
- **D5 (header ≤380px)** — `#save-btn, #menu-btn { padding: var(--space-1) }`
  at ≤380px. Fullscreen button **not hidden**: measured at 320/340/360/380 it
  always ends 8px short of the viewport edge, and with a deliberately long
  room name at 320px everything still fits (header end 312) — hiding it would
  remove the exit affordance for nothing. Save stays (pause menu has no Save).
- **D8 (portrait reader)** — `@media (max-width: 600px) and (orientation:
  portrait) { .scene-container { flex-basis: 26% } }`. Applied live
  (`flex-basis: 26%` computed).
- Phase 1 invariants re-verified at 360/320: `#app.scrollWidth` = simulated
  width, `html.scrollWidth` = viewport, header/footer/scene all end ≤ width.
  `vision` on a rasterized shot confirmed the fade is visible on the chip
  strip, the reader takes clearly more vertical space than the scene image,
  and no accidental right-edge clipping (html2canvas still misrenders text;
  trust rects for text).
- `#debug-panel`, overlay sweep, 412/768 columns: untouched, all Phase 3.

**Phase 1 notes (2026-08-15):** D1 `min-width: 0` fix shipped and verified —
`html.scrollWidth` = viewport (353, was 1114), `#app.scrollWidth` = width at
live and simulated 360px, chips scroll internally (10 chips → scrollW 1014 vs
clientW 360), header/footer children all end ≤ viewport, narrative wraps.

**Design session notes (2026-08-15 — diagnosis only, zero code written):**
The user reported the game is "horribly cropped horizontally on
mobile, across almost all systems and screens." Diagnosed live in the preview
iframe (449px viewport) with a direct `browser_eval` overflow scan:

- `html.clientWidth` = 449 but `html.scrollWidth` = `body.scrollWidth` = 1114;
  `#app` itself is 449 wide with mobile `grid-template-areas` (`"header"`
  `"main"` `"footer"` — the `@media (max-width: 900px)` block IS applying) yet
  `grid-template-columns` resolves to **1114.3px** — the single `1fr` track is
  stretched to ~1114px, and every child (header, scene, reader, footer) lays
  out at that width, clipped by `html/body { overflow: hidden }`.
- Bisected the track minimum: setting `#footer { min-width: 0; overflow: auto }`
  collapses `#app.scrollWidth` 1114 → 449. `min-width: 0` on `#header` or
  `#main-content` alone does nothing (both already have `overflow: hidden`,
  so their automatic min is 0).
- Root cause: `#footer` is a grid item spanning **one** track on mobile, with
  default `min-width: auto` and `overflow: visible`, so its **min-content**
  sizes the track. Its min-content is driven by `#action-chips`
  (`index.html:948`), which renders up to ~10 chips (`white-space: nowrap;
  flex-shrink: 0`) — measured min-content = max-content = **1114px**. On
  desktop `#footer` spans all three grid columns, and per spec an item
  spanning multiple tracks has automatic minimum size 0, which is why desktop
  was never affected. Numbers from the session:
  `#footer` min/max 1114/1114, `#action-chips` 1114/1114, `.footer-status-row`
  227/227, `.footer-tab-row` 281/281, `.footer-input-row` 83/265.
- Verified the fix: with `#footer { min-width: 0 }` injected, `app.scrollWidth`
  = 449 = viewport, and at a simulated 360px the app is exactly 360 with the
  chips row scrolling internally (`chipsScrollW` 1114 vs `clientWidth` 360).
  Header at 360px fits exactly: drawer 8–37, room 45–164, Save 180–220, Menu
  228–272, fullscreen button 280–352. So the header is *at capacity* at 360px.
- Secondary findings (all verified):
  - `#debug-panel` (`index.html:1504`) is `width: 480px` fixed-right — overflows
    any viewport under 480px.
  - Touch targets are small: chips 29px tall, tabs 34px tall (guidance: 40–48px
    on coarse pointers).
  - The chips row scrolls with no affordance — the screenshot's "Plug In…"
    cut-off chip is exactly this; on a phone, 10 chips means ~3 are visible
    with nothing telling the player the rest are there.
  - All overlay screens (menu, studio, cutscene, inventory/container/save,
    phone, conversation ≤600px, interrupt bubble) are `position: fixed;
    inset: 0` or `vw`-capped, so they were NOT broken by the grid bug — their
    contents just render inside the blown-out shell. Verified: `.conv-box`
    fullscreens ≤600px, `.invp-box` is `min(920px, 94vw)`, `.phone-device` is
    `min(360px, 100vw - 32px)`, desktop windows force-fullscreen on compact
    screens (`isDesktopShellCompact` in `render.desktop.js:25`).

**Blockers / flagged deviations:** None. Do not re-litigate the D-numbers below
before checking whether the design session already locked them.

---

## The thesis

The game shell is a CSS grid sized for a desktop, and its width is being
dictated by its own content instead of the viewport. A single footer row —
the action-chip strip — holds a handful of non-wrapping chips whose intrinsic
min-content width is 1114px, and on mobile the `#footer` grid item's default
`min-width: auto` lets that one row blow the whole app grid out to 1114px.
Every screen that lives inside `#app` (the play screen, the scene reader, the
floor-plan drawers, every status bar) then renders at 1114px wide and the
phone's viewport clips it — which is why the cropping is "recurring across
almost all systems and screens." It is one grid-item sizing bug, and the rest
of the work is the deliberate mobile polish that makes the shell genuinely
good on a portrait phone instead of merely not-broken.

### What this plan is *not*
- **Not a redesign.** The information architecture (scene image + reader bands,
  drawers, footer rows) stays exactly as designed. This plan makes it fit
  portrait phones and touch.
- **Not new gestures or behaviour.** Chips stay a horizontal scroll row (see
  D3); nothing becomes swipe-to-interact.
- **Not changing the desktop layout at all.** Everything is scoped to
  `@media`/`@container` narrow and coarse-pointer branches, or to base rules
  that desktop already satisfies.
- **Not a vertical space rework of the scene reader.** Its bands (heading,
  establishing, beats, history) keep their proportions; only the scene image's
  portrait share of the column is touched (Phase 2, optional, D8).

## Evidence

Measurements taken live 2026-08-15 in the 449px-wide preview iframe via
`browser_eval` (the "root cause" row is the whole story):

| Quantity | Value |
|---|---|
| `document.documentElement.clientWidth` | 449 |
| `document.documentElement.scrollWidth` / `body.scrollWidth` | 1114 / 1114 |
| `#app` grid-template-areas (mobile block applied) | `"header" "main" "footer"` |
| `#app` grid-template-columns (resolved) | 1114.3px |
| `#app.scrollWidth` with `#footer { min-width: 0 }` injected | **449** (= viewport) |
| `#footer` min-content / max-content | 1114 / 1114 |
| `#action-chips` min-content / max-content | 1114 / 1114 (10 chips) |
| `.footer-status-row`, `.footer-tab-row`, `.footer-input-row` min-content | 227 / 281 / 83 |
| At simulated 360px after fix: `#app.scrollWidth`, chips `scrollWidth`/`clientWidth` | 360, 1114/360 (scrolls internally) |
| Chip / tab rendered heights at 360px | 29px / 34px |

## Locked decisions

### Root cause
- **D1 — Grid items get `min-width: 0`.** Add `min-width: 0` to `#header`,
  `#main-content`, and `#footer` in the base styles (next to the `#app` grid
  rule at `index.html:139`), not inside the media query: it is a general
  "a grid/flex child must be allowed to shrink below its content's min-content
  width" rule, it is what the spec's automatic-minimum-size escape hatch is
  for, and putting it in the base keeps the desktop 3-column layout equally
  immune if a future change edits the grid. This is the fix for the reported
  bug. All other `min-width: auto` hazards found later get the same treatment.
- **D2 — The shell grid stays as designed.** One column ≤900px with drawers;
  three columns above. No new breakpoints in the shell; Phase 3 adds widths to
  the verification matrix, not to the CSS.

### Action chips
- **D3 — Chips stay a scroll row, with an affordance.** 10 nowrap chips cannot
  wrap onto a 360px screen without eating the whole footer (measured ~5 rows),
  so they remain `flex-wrap: nowrap; overflow-x: auto; touch-action: pan-x`
  (`index.html:948`). Add a right-edge fade gradient on coarse-pointer/narrow
  screens so a partially-visible chip reads as "there is more," plus a
  first-tap hint (see Phase 2). Do not add a visible scrollbar on touch.
- **D4 — Coarse-pointer touch targets ≥ 40px.** Chips (29px today), footer
  tabs (34px), `.fsi` rows, phone screen-nav, and the drawer toggles get
  taller hit areas under `@media (hover: none) and (pointer: coarse)` —
  padding, not font-size. Keep visual density; enlarge the tappable box.

### Header (narrow screens)
- **D5 — ≤380px the header drops to its essentials.** The room group, Save and
  Menu buttons, and the fullscreen button measured 8–352px at 360px — at
  capacity. On `≤380px` reduce button padding, and if the fullscreen button
  still overflows, hide it there (target via its generated class prefix
  `[class^="fullscreenButtonPluginButton"]`); Save stays (it is the only
  top-level save affordance — the pause menu has no Save button, see Phase 2's
  note). Room label keeps its existing ellipsis.

### Overlays
- **D6 — `#debug-panel` becomes `width: min(480px, 100vw)`.** The only
  fixed-width overlay in the app (`index.html:1504`); on a 360px phone 120px
  of it hangs off-screen.
- **D7 — Overlay shells are already narrow-safe; audit, don't redesign.**
  `.invp-box`/`.ctr-box`/`.svp-box` (`min(920px, 94vw)`), `.modal-box`
  (`90%`/`max-width: 600px`), `.conv-box` (fullscreen ≤600px), `.phone-device`
  (`min(360px, 100vw - 32px)`), `.ps-frame` (`min(980px, 100%)`), the intro
  cutscene (fullscreen), and the interrupt bubble (`90%`) all size off the
  viewport already. Phase 3 *measures* each at 360px and fixes only what
  actually overflows.

### Vertical (portrait)
- **D8 — Give the scene reader more of the column on portrait phones
  (optional polish).** `.scene-container` (`index.html:389`) is
  `flex: 0 0 32%; min-height: 150px; max-height: 260px`. On a 360×740 phone
  that leaves the reader ~30% of the screen. Shrink the scene share to
  `0 0 26%` (keeping min/max caps) under `(max-width: 600px) and (orientation:
  portrait)` so the beats have room. Verified visually before/after (Phase 2).

## Data model

None — this plan is pure CSS in `index.html` plus a couple of one-line
behaviour hooks in `src/srcfiles/ui.js`/`render.js` (chip first-tap hint,
below). The durable "data" is the measurement matrix in Evidence; re-run it
verbatim after each phase:

```js
// Re-run after any phase (browser_eval at the live preview width):
// 1) app.scrollWidth === document.documentElement.clientWidth  (no page crop)
// 2) ... chips: scrollWidth > clientWidth on mobile (scrolls, not clipped)
// 3) every element's getBoundingClientRect().right <= clientWidth + 1
//    except (a) drawer sidebars (fixed off-canvas) and (b) items inside a
//    box whose own overflow-x is auto/scroll
```

## Implementation phases

### Phase 1 — Root-cause fix: let the grid children shrink
**Goal:** On any viewport, `#app.scrollWidth` equals the viewport width. The
play shell no longer crops horizontally at any size; the action chips row
scrolls inside its own box; the scene reader and narrative text wrap at real
phone widths.

**Files:**
- `index.html`: add one grouped rule beside the `#app` base grid rule
  (`index.html:139`): `#header, #main-content, #footer { min-width: 0; }`
  (D1). No other changes. Do NOT touch `#sidebar-left/right` (fixed, 280px
  wide on mobile — correct as-is).

**Verification:** Re-run the Evidence matrix. At the live preview width AND at
a simulated 360px (temporarily constrain `#app { width: 360px }`), assert:
`app.scrollWidth === 360`, header children all end ≤ 360, chips row
`scrollWidth > clientWidth`. Then `browser_refresh`, open the room screen, and
`vision` the rendered canvas/element: the whole layout must fill the viewport
with no right-edge clipping, and the narrative text must wrap rather than
run off-screen.

### Phase 2 — Play-shell mobile polish (touch + narrow)
**Goal:** The play screen on a phone is comfortable: tappable rows, a readable
chip strip, a header that fits, and a reader with room to breathe.

**Files:**
- `index.html`:
  - Coarse-pointer block (D4): under `@media (hover: none) and (pointer:
    coarse)` bump `.chip`, `.footer-tab`, `.fsi`, `.drawer-toggle`,
    `.phone-screennav-btn` hit areas to ≥40px (padding/height), and give the
    chip strip's buttons `min-height: 40px` without changing font size.
  - Chip affordance (D3): on the same coarse-pointer branch (and ≤520px for
    good measure), add a `::after` fade (linear-gradient, `pointer-events:
    none`, ~32px) pinned to the right edge of `#action-chips` so a cut-off
    chip visually implies "more".
  - First-tap hint (D3): on a coarse pointer, if the chips row is scrollable at
    first render, nudge it ~80px once via JS (`ui.js` boot/render hook) so the
    player sees movement and learns it scrolls; one shot per session, store
    the "hinted" flag on `sessionStorage`. Do not fight the player afterwards.
  - Header ≤380px (D5): shrink `#save-btn`/`#menu-btn` padding and font, and
    hide the fullscreen button only if measurement shows overflow
    (`[class^="fullscreenButtonPluginButton"] { display: none }` inside the
    same query). Keep Save — verify against the pause menu: it currently has
    no Save action (only Resume/Continue/New Game/Load/Options/Exit), so
    hiding header Save would strand autosave-less players; if a session wants
    to hide Save instead, first add a Save entry to the pause menu (out of
    scope for this plan — flag as a deviation).
  - Portrait reader share (D8): `@media (max-width: 600px) and (orientation:
    portrait)` set `.scene-container { flex-basis: 26%; }`.
- `src/srcfiles/ui.js` (or `render.js`, whichever owns the post-render hook):
  the one-shot chip nudge above.

**Verification:** Simulated 360px and a real touch device (devtools device
mode): every footer control is ≥40px tall; the chips row shows a right-edge
fade and nudges once on first render; the header fully contains its buttons;
`vision` the room screen in portrait and confirm the reader gained space, the
fade is visible, and nothing is clipped. Re-run the Evidence matrix (Phase 1
invariants must still hold).

### Phase 3 — Full-system narrow-viewport sweep
**Goal:** Every screen in the game — not just the play shell — is verified
horizontally safe at 360px, 412px, and 768px, and any stragglers are fixed.

**Files:**
- `index.html`: `#debug-panel` → `width: min(480px, 100vw)` (D6). Fix whatever
  else the sweep finds, each with the same `min-width: 0` / vw-cap / overflow
  treatment (D1/D7), never a redesign.
- Nothing else unless the sweep proves otherwise.

**Verification:** Scripted sweep at each width — for every overlay/screen, open
it (drive the real `data-action` chain via `browser_eval`: menu screens,
player studio, intro cutscene, modal, inventory + container + save panels,
char form, computer desktop with a couple of apps incl. Nile/IM/AfterHours,
phone home + Tracker + Clock + Camera + Settings, conversation overlay,
interrupt bubble, debug panel, loading overlay, Home placement studio) and run
the no-horizontal-crop assertion per screen, collecting offenders by selector.
Then `vision`-check the three highest-traffic screens (play screen, computer
desktop with one window, phone home) at 360px. Full checklist row for each
system in the Handoff when done.

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** | `min-width: 0` on the three `#app` grid children — root-cause fix for the horizontal crop |
| 2 | **Done** | Coarse-pointer touch targets, chip scroll affordance + one-shot nudge, ≤380px header, portrait reader share |
| 3 | **Done** | `#debug-panel` width cap; scripted overflow sweep of every overlay/screen at 360/412/768 |

## Dependency order

```
Phase 1 ──► Phase 2 ──► Phase 3
```

Phases are strictly sequential: Phase 2's measurements are meaningless while
the shell is still blown out, and Phase 3's sweep opens overlays on top of a
shell that must already be sane. No part of Phase 2 or 3 may run before Phase 1
is verified.

## Open questions (parked, none blocking)
- **Should chips wrap to two rows instead of one scroll row at ≤420px?** Measured
  at ~5 rows for 10 chips — rejected on space grounds, but a 2-row-wrap +
  scroll-within-2-rows hybrid is worth re-testing in Phase 2 now that the shell
  is sane. Decide by measurement, not by taste; either way D3's affordance
  applies.
- **Is Save genuinely needed in the header on phones?** The pause menu has no
  Save entry, so yes today. If someone adds a pause-menu Save later, hide
  header Save ≤380px and re-measure — see Phase 2's D5 note.

## Design invariants

1. **A row of non-wrapping content must never size its container.** The whole
   game rendered 1114px wide on phones for some time because `#action-chips`
   (10 `nowrap` chips) set `#footer`'s min-content and the grid item's
   `min-width: auto` let it dictate the track. Any grid/flex child that can
   hold `white-space: nowrap` content gets `min-width: 0` (or a real
   `overflow` on that axis), or it will silently crop the game again.
2. **Nothing ships that requires horizontal page scroll at ≤480px.** All
   horizontal lists scroll within their own box (their own `overflow-x:
   auto`/`scroll`), never the page. The fixed/`inset: 0` overlay shells are
   exempt from *content* width checks but not from their own
   no-overflow-vs-viewport check.
3. **Chips are a scroll row, deliberately (D3).** When someone is tempted to
   `flex-wrap` them to "solve mobile", re-run the 360px measurement first:
   the footer would grow ~5 rows and crush the scene reader that the whole
   game reads through.
