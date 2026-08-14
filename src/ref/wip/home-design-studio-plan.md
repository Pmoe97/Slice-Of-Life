# The Home Design Studio

Status: **foundation built** — the data model, the renderer half and the
editor all ship and are verified (18 assertions inside
`dev/verify/verify-plan.js` §8). One room is designed; the other eighteen
still auto-arrange, which is the intended interim state.

Companions: `dev/designer.html` (the editor), `dev/sync-designer.js` (keeps
its palette in step with the game's shape library).

Follows `floorplan-and-movement-plan.md`, whose Phase 5 furniture pass this
supersedes.

---

## Handoff — read this first

Open `dev/designer.html`. Everything else here is context for it.

Three things to know:

1. **A shape's parts are normalized to a 0..1 box.** That is the whole
   design. A placement stores only `x/y/w/h/rot`; every part is a fraction of
   that box, so drag a corner and the pillow follows the bed. Nothing in the
   system ever manipulates a part.
2. **A room is either designed or auto-arranged, never both.** A
   `ROOM_DECOR` entry replaces the perimeter auto-layout wholesale.
3. **The studio's palette is generated from the game's own table.** After
   editing `DESIGN_SHAPES` by hand, run `node dev/sync-designer.js` or the
   two will drift. `verify-plan.js` fails if they have.

---

## The thesis

The first furniture pass drew each item from a hand-written function that
emitted absolute-coordinate SVG. A bed could be *drawn* and never *moved*,
because its pillow bar had no relationship to its frame beyond both being
written on the same line.

That is **shape salad**: it looks like an object and behaves like debris. You
cannot build an editor on it, because there is nothing to grab.

So the unit of composition changed. A shape is a list of parts in a
normalized box; a placement is a box. Move, resize and rotation are one
affine map applied to the group, which is why the editor could be built at
all — and why an object stays an object when you drag it.

### What this is *not*

- **Not an in-game feature yet.** It is a development instrument that
  authors data the game consumes. The same editor can become a computer app
  later without the data shape changing.
- **Not a replacement for auto-placement.** Nineteen rooms is a lot of
  authoring; the perimeter layout keeps undesigned rooms furnished.
- **Not mechanical.** Furniture position is currently visual only. Whether
  it should ever feed a mood or an activity is deliberately undecided —
  see the open questions.

---

## Locked decisions

- **D1 — Parts are normalized to 0..1, always.** Asserted over the whole
  library. An absolute coordinate cannot move with its object, and one would
  poison the editor silently rather than loudly.
- **D2 — A placement is `{ shape, x, y, w, h, rot }`** and nothing else.
  Rotation is degrees about the placement's own centre.
- **D3 — A designed room REPLACES auto-placement.** Half-designed rooms
  would produce furniture stacked on furniture with no way to tell which
  system put it there.
- **D4 — Gating is per placement**, `requires: { facility, minTier, maxTier }`,
  and **fails closed**: a gate naming a facility that does not exist hides
  the piece. A gate that cannot be evaluated is not a gate.
- **D5 — Gated placements describe the FINISHED room.** The pool is the
  worked example: a dry basin (`maxTier: 'broken'`) and a filled one
  (`minTier: 'functional'`) on the *identical footprint*, so renovation
  fills the hole rather than conjuring it. Exactly one draws at every tier,
  asserted.
- **D6 — The studio is authoritative for geometry, the repo for shapes.**
  Room rectangles and placements are edited in the tool and exported;
  `DESIGN_SHAPES` is authored in `defs.design.js` and synced INTO the tool.
  One direction each, so neither can silently overwrite the other.
- **D7 — Work in progress is never lost.** Autosave to `localStorage` on
  every mutation, a 200-deep undo stack, named save slots, and export/import.
  The undo stack matters more than the autosave: closing a tab is rare, a
  confident wrong drag is not.

---

## Data model

```js
// defs.design.js
DESIGN_SHAPES[id] = {
  label, w, h,                    // default size when placed
  parts: [                        // ALL values are fractions of the box
    { kind:'rect',    x, y, w, h, rx?, cls },
    { kind:'ellipse', cx, cy, rx, ry,   cls },
    { kind:'line',    x1, y1, x2, y2,   cls },
  ],
};

ROOM_DECOR[roomId] = [
  { shape, x, y, w, h, rot, variant?, requires? },
];
```

`cls` picks a fill from the floor plan's palette — `frame` `soft` `detail`
`felt` `water` `coping` `lane` `plant` `glass` `void`. `void` exists because
a pool is a *hole with a surround*, and drawing it as one filled rectangle
makes it a billiard table with delusions.

---

## What shipped

| Piece | Where |
|---|---|
| 40 composite shapes | `src/srcfiles/defs.design.js` |
| Authored decor + gating | same file, `ROOM_DECOR` / `decorVisible` |
| Shape renderer | `render.js` — `renderDesignShape`, `renderAuthoredDecor` |
| Part palette CSS | `main.html`, `.fp-p-*` |
| The editor | `dev/designer.html` |
| Palette sync | `dev/sync-designer.js` |
| Assertions | `dev/verify/verify-plan.js` §8 |

**Editor features:** room reshaping (add / move / resize rectangles, with a
live tiling check against `ROOM_ADJACENCY`), placement with a visual
palette, select / drag / corner-resize / rotate handles, grid snap at 1/5/10,
arrow-key nudge, duplicate, z-order, per-piece upgrade gating, **tier preview**
(see the room as a player at each renovation stage would), undo/redo,
autosave, named slots, export and import.

---

## Open questions (parked, none blocking)

- **Eighteen rooms still auto-arrange.** The pool room is the worked
  example. Designing the rest is authoring work, not engineering.
- **Should position mean anything mechanically?** Feng shui as flavour is
  free; feng shui that moves a mood modifier is a different feature and
  wants deciding before anything reads a coordinate.
- **In-game surface.** The same editor as a computer app — persistence into
  object instances, cost/time gating, touch support. The data shape is
  already right for it.
- **Shapes are still hand-authored.** The studio places and transforms
  shapes; it does not draw new ones. A part editor is the obvious next
  thing and is a bigger tool than this one.
- **Object state is not reflected in authored decor.** The auto-placer draws
  a crusty stove differently from a clean one; an authored placement is
  static. Reconciling the two wants the `variant` field to be derivable
  from live state, not just authored.
