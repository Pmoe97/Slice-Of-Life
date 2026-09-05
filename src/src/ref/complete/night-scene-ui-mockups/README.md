# Night Scene UI — mockup sources

The artboards behind the Night Scene UI design session (2026-09-04). The
canonical *view* is the published canvas, linked from
[`../night-scene-sleeping-npc-plan.md`](../night-scene-sleeping-npc-plan.md);
these are its sources, kept in the repo so the design survives independently
of that link.

- `Main.dc.html` — the chosen direction, Living Tableau, desktop 1440×900.
- `CTableauPhone.dc.html` / `CTableauPhoneSheet.dc.html` — the two phone
  states: frame-is-the-screen with a compact action bar, and the full tray
  raised as a sheet.
- `Vocab.dc.html` — the vocabulary options that were put to the user. The
  choices they made are recorded in the plan's D33, not here.
- Everything else — the five unchosen approaches from the first pass (A Body
  Map, B Beat Ledger, C's first sketch, D Instrument Panel, E Card Hand,
  F Silhouette + Milestones). **Deliberately stale**: they still show the old
  Detection/floor vocabulary, a Quell button, and Ghost vs. Bail as separate
  exits. Kept as a record of what was considered and rejected, not as a spec.
- `canvas.json` — the layout manifest (which artboard sits where, and the
  two-page split).

## Do NOT paste these styles into the game

**Every colour in these files is a hardcoded hex.** That was correct for a
mockup — an artboard has no access to the game's stylesheet — and it is wrong
for the game, which has **14 colour themes** driven by `html[data-theme=...]`
overriding the `:root` token block in `index.html`. Copying an inline
`background:#232342` into the real overlay produces a night scene that looks
right in `midnight` and broken in the other thirteen.

The mapping used while drawing, so Phase 3b can go the other way:

| mockup hex | real token |
|---|---|
| `#1a1a2e` | `--color-bg` |
| `#232342` | `--color-surface` |
| `#2a2a4a` | `--color-surface-alt` |
| `#32326a` | `--color-surface-hover` |
| `#2c2c50` | `--color-card` |
| `#3a3a5c` | `--color-border` |
| `#4a4a7c` | `--color-border-strong` |
| `#e0e0f0` | `--color-text` |
| `#8888aa` | `--color-text-dim` |
| `#5a5a7c` | `--color-text-faint` |
| `#7b6cf6` | `--color-accent` |
| `#f6a96c` | `--color-warm` |
| `#6cc7f6` | `--color-cool` |
| `#6cf6a9` | `--color-positive` |
| `#f66c8c` | `--color-negative` |
| `#e26ca6` | `--color-desire` |
| `#f6d76c` | `--color-warning` |

Spacing, radii and font sizes were drawn from the same token set
(`--space-*`, `--radius-sm|md|lg`, `--fs-xs|sm|base|md|lg`) and should go back
as those tokens too. The two colours with no token — `#6d1f36` (the Stirring
band inside the Wakefulness bar) and `#b8455f` (the evidence chip's border) —
are the only genuinely new values, and Phase 3b should add them as tokens
rather than inlining them.

## Editing them

They are [Design Components](../../patterns/) artboards: a `.dc.html` each,
laid out by `canvas.json`. Regenerating the published canvas needs the
`/design` skill's `seed-canvas.mjs`, which is not vendored here. Opening one
directly in a browser will show the markup unstyled by the canvas chrome but
otherwise intact — the layout is plain inline-styled HTML with no runtime.
