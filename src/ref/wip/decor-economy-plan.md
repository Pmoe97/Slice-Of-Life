# The decor economy: furniture, purchase, and player-facing placement

Status: **planned — not started**. Design session complete 2026-08-14; all
decisions locked. Documentation only — no code written.
Last updated 2026-08-14.

Companions:
- `CONTINUOUS-SIMULATION-ROADMAP.md` (the umbrella — implements C3, C5).
- `home-design-studio-plan.md` (built the composite-shape/anchor/drag-
  resize-rotate machinery this plan surfaces in-game — this plan does not
  rebuild any of that, it gives it a second, player-facing home).
- `continuous-behavior-engine-plan.md` (reads this plan's placed objects
  as anchors for its Phase 3 — the actual consumer of everything this
  plan produces).
- `floorplan-and-movement-plan.md` (built `STRUCTURAL_UPGRADES` and the
  RenoFix booking flow this plan deliberately does *not* reuse — see
  Locked decisions for why the boundary is real).

This is a living document, worked one phase per session. **Read the
Handoff section immediately below before anything else.**

---

## Handoff — read this first

**Resume at:** Phase 1. Nothing has been built.

**Last session's notes (design session, 2026-08-14 — no code written):**
- Nile's checkout/delivery pipeline was read in full, not assumed:
  `checkoutCart` (computer.js:658) charges `cartSubtotal + ECONOMY.
  deliveryFee`, writes one `world.deliveries` record per cart line with
  `etaDay = clock.day + 1`; `processDeliveriesForDay` (ui.js:874) finds
  the entry hallway's `doormat` object and calls `addStack` on its
  `.contents`. This plan's delivery reuse means literally this — a decor
  purchase becomes one more `world.deliveries` entry with a `defId` the
  existing pipeline already knows how to hand off, not a parallel
  mechanism.
- `APP_DEFS.shop` (Nile's own definition, defs.computer.js:37) was read as
  the structural template for the new Home app — same shape
  (`id`/`label`/`category`/`devices`/`entryScreen`/`screens`), new catalog
  source.
- `STRUCTURAL_UPGRADES` (config.js, built this session in
  `floorplan-and-movement-plan.md`) already covers walls/doors/room-type
  changes, contractor-booked with real crew days. Decor is deliberately
  **not** routed through that system — see D1's reasoning, which was a
  direct, explicit choice in this session's second AskUserQuestion round
  (a "Home" app with Nile-style delivery, not a RenoFix-style booking).

**Blockers / flagged deviations:** None.

---

## The thesis

Right now furniture is either auto-placed by a perimeter algorithm
(`renderRoomFurniture`'s fallback, floorplan-and-movement-plan.md Phase 5)
or hand-authored once by the developer through `dev/designer.html`
(home-design-studio-plan.md). A player has no way to buy a couch. That's
fine as long as decor is purely cosmetic — but `continuous-behavior-
engine-plan.md`'s C5 makes it load-bearing: an activity like "watch TV"
needs an anchor to route to, and an anchor comes from a placed object.
Once that's true, an unfurnished room isn't just plain, it's *inert* —
nobody can really do anything there. The player needs a real way to fix
that: buy furniture, have it delivered, place it.

The mechanism for "buy something, have it delivered" already exists and
is exactly right (Nile). The mechanism for "place a thing with real
position, size, and rotation" already exists and is exactly right (the
Home Design Studio, built as a dev tool this same session). This plan is
mostly wiring: a new catalog behind Nile's existing checkout/delivery
shape, and the Studio's existing editing surface behind a new in-game
screen instead of only `dev/designer.html`.

### What this plan is *not*

- **Not a new delivery mechanism.** Reuses `world.deliveries` and
  `processDeliveriesForDay` exactly as Nile already does.
- **Not a new drag/resize/rotate implementation.** Reuses the composite-
  shape editing machinery from `dev/designer.html` verbatim — the
  in-game screen is that same interaction model, wrapped for the game
  shell instead of a standalone page.
- **Not structural.** Walls, doors, and room type stay `STRUCTURAL_
  UPGRADES`, contractor-booked. This plan's catalog is movable objects
  only — nothing it sells can change what a room *is*, only what's in it.
- **Not a mood/aesthetics scoring system.** Whether a placed sofa's color
  "matches" anything is not this plan's concern. The only mechanical
  consequence of furnishing is C5's anchor availability.

---

## Locked decisions

- **D1 — A new "Home" app, not folded into Nile or RenoFix.** Chosen
  directly in this session's design round over both alternatives: Nile's
  whole framing is small consumables (`buyQty` units, a flat delivery
  fee) and a sofa is a poor fit for that shape; RenoFix's contractor-
  booking flow makes every purchase as ceremonious as fitting a door,
  which is the wrong tone for buying a lamp. A dedicated app matches
  Nile's checkout lightness while keeping its own catalog and its own
  placement step.
- **D2 — Checkout is Nile's exact mechanism, re-pointed at a new
  catalog.** `checkoutCart`'s shape (charge subtotal + delivery fee, push
  one `world.deliveries` record per line, `etaDay = day + 1`) is reused
  unmodified — this plan's own checkout function differs from Nile's only
  in which catalog it reads from and which app's cart it clears.
- **D3 — A delivered decor item lives in inventory until placed, exactly
  like any other delivered good.** No new "pending placement" state
  machine — it arrives on the doormat via `addStack`, same as groceries,
  and stays a normal inventory stack until the player opens the Home app
  and places one.
- **D4 — Placing an item consumes it from inventory and creates a real
  object instance** (`gameState.objects[room_<roomId>]`) with a position
  — not merely a `ROOM_DECOR` visual entry. This is the one place this
  plan diverges from the Studio's current dev-tool behavior: `dev/
  designer.html` edits `ROOM_LAYOUT`/`ROOM_DECOR` config directly; the
  in-game version edits **live object instances**, because C5 needs
  something `continuous-behavior-engine-plan.md`'s anchor resolution can
  find in `gameState.objects` the same way it already finds a stove or a
  bed. `DESIGN_SHAPES`'s parts/anchor data is still what's drawn and
  anchored *from* — only where the placement record lives changes.
- **D5 — The in-game Studio screen is placement-only, not room-reshaping.**
  `dev/designer.html`'s Rooms tab (adding/resizing rectangles, retiling
  the apartment's actual shape) stays a dev-only capability — reshaping a
  room is closer to `STRUCTURAL_UPGRADES` territory than to furnishing
  it, and giving the player that power is explicitly out of this plan's
  scope. The in-game screen exposes exactly the Place tab's
  drag/resize/rotate/select interaction, over the player's own owned
  furniture instead of the dev-authored catalog.
- **D6 — An unfurnished room's degraded state is kept, not patched
  around.** Restated from C5: this plan does not add a "starter furniture
  pack" or force every room to have a minimum viable anchor set. An empty
  room stays empty until the player spends money on it. That absence is
  the whole reason this economy has a reason to exist.

---

## Data model

```js
// defs.computer.js — new app, Nile's own shape (defs.computer.js:37) mirrored
home: {
  id: 'home', label: 'Home', category: 'shopping', requires: [],
  devices: ['computer', 'phone'],
  entryScreen: 'browse',
  screens: {
    browse: { label: 'Browse', renderer: 'nile', source: 'DECOR_CATALOG_LIST',
              rowAction: 'home.add-to-cart', rowActionLabel: 'Add to Cart' },
    cart:   { label: 'Cart', renderer: 'list', source: 'state:apps.home.cart',
              emptyText: 'Your cart is empty.', rowAction: 'home.remove-from-cart' },
    place:  { label: 'Place', renderer: 'home-placement' },   // new renderer — the in-game Studio screen
  },
},
```

```js
// A catalog entry — priced, buyable, and naming which DESIGN_SHAPES entry
// it places once delivered. Distinct from DESIGN_SHAPES itself: the
// catalog is what's for sale; DESIGN_SHAPES is how it's drawn.
DECOR_CATALOG_DEFS.sofa_basic = {
  id: 'sofa_basic', label: 'Sofa', price: 340, buyQty: 1,
  shape: 'sofa',              // DESIGN_SHAPES id — the composite geometry
  category: 'living_room',
};
```

```js
// A placed decor object instance, in gameState.objects[room_<roomId>] —
// D4's key decision: a real instance, not a visual-only ROOM_DECOR entry.
{
  id, defId: 'sofa_basic', bucket: 'room_living_room',
  pos: { x, y, w, h, rot },   // where the Studio placed it
  ownerId: null,
  // Everything else a normal object instance already carries
  // (condition, state, contents) — decor objects are not a new kind
  // of thing, just a new SOURCE of ordinary objects.
}
```

---

## Implementation phases

### Phase 1 — The catalog and checkout
**Goal:** the Home app exists, lists a real catalog, and checkout produces
delivery records exactly as Nile's does.
**Files:**
- `src/srcfiles/defs.computer.js`: `APP_DEFS.home`, `DECOR_CATALOG_DEFS`,
  `DECOR_CATALOG_LIST` (mirrors `SHOP_CATALOG_LIST`'s derivation).
- `src/srcfiles/computer.js`: generalize `checkoutCart` (computer.js:658)
  to take a cart-source parameter rather than writing a second, near-
  identical function. Read now, not paraphrased: today it hardcodes
  `gameState.world.computer.apps.shop` and `ITEM_DEFS` at three points
  (the cart itself, `cartSubtotal`, and the per-line `ITEM_DEFS[c.defId]`
  deduction/delivery lookups). The recommended shape —
  `checkoutCart(gameState, { cartPath: 'apps.shop.cart', catalog:
  ITEM_DEFS })`, called as `checkoutCart(gameState, { cartPath:
  'apps.home.cart', catalog: DECOR_CATALOG_DEFS })` from Home — keeps one
  function owning the charge/tax-deduction/delivery-record logic so it
  can never drift between the two callers, which is worth more than the
  small win of two independent siblings. If `DECOR_CATALOG_DEFS` entries
  turn out to need a field `ITEM_DEFS` doesn't have (or vice versa) once
  this is actually written, a thin per-catalog adapter is an acceptable,
  small deviation — flag it, don't silently fork the whole function back
  into two copies.
**Verification:** a purchase charges the correct total, produces the
correct `world.deliveries` record, and — reusing
`processDeliveriesForDay` unmodified — the item lands on the doormat the
next day exactly as a Nile grocery order would.

### Phase 2 — The in-game placement screen (D4, D5)
**Goal:** a delivered decor item, still sitting in inventory, is placeable
via a `home-placement` renderer offering the same select/drag/resize/
rotate interaction `dev/designer.html`'s Place tab already has, writing a
real object instance (D4) rather than a config-file edit.
**Files:**
- `src/srcfiles/render.computer.js`: the new `home-placement` renderer.
- `src/srcfiles/computer.js` or a new file: the placement commit function
  — consumes the inventory stack, creates the object instance, records
  its `pos`.
- Confirms at implementation time exactly how much of `dev/designer.html`'s
  client-side interaction code (drag handles, snap, rotate) can be shared
  rather than reimplemented — it's already pure DOM/SVG manipulation with
  no dev-only dependencies, so direct reuse is the expectation, not a
  rewrite.
**Verification:** placing an item removes it from inventory, creates a
findable object instance in the target room's bucket, and that instance
is immediately visible to `renderFloorPlanStatic` (floorplan-and-
movement-plan.md) exactly as any other object in that room's bucket
already is — no special-casing needed in the renderer, which is the proof
D4's "real object instance" choice was the right one.

### Phase 3 — Anchor availability, end to end
**Goal:** a placed decor object is a usable anchor for `continuous-
behavior-engine-plan.md`'s Phase 3 resolution — this phase is the
integration proof, not new decor-side work.
**Files:** none new — verification against that plan's own anchor
resolver.
**Verification:** the worked example: an empty living room has no
"watch TV" anchor (degrades to room-center per D6); after a sofa and a TV
are bought, delivered, and placed, the same activity resolves to a real
anchor at the sofa's position. This is the single test that proves the
whole economy does what it exists to do.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | Not started | Home app catalog + checkout, reusing Nile's delivery |
| 2 | Not started | In-game placement screen, writing real object instances |
| 3 | Not started | End-to-end anchor-availability proof |

---

## Dependency order

```
Phase 1 (catalog + checkout) ──► Phase 2 (placement screen) ──► Phase 3 (anchor proof)
```
Phase 1 has no dependency on any other plan in this set and can start
immediately. Phase 3 depends on `continuous-behavior-engine-plan.md`'s
Phase 3 (anchor resolution) existing to integrate against.

---

## Open questions (parked, none blocking)

- ~~Does `checkoutCart` get generalized...~~ — **resolved this session,
  see Phase 1's Files.** A default recommendation is given; a small,
  flagged deviation from it is still acceptable if the real code makes
  generalizing awkward. No longer fully open.
- **Catalog breadth at launch** — not fully open either: the **minimum**
  is now stated explicitly — ship enough `DECOR_CATALOG_DEFS` entries to
  completely furnish at least one currently-anchor-empty room (the living
  room: a sofa and a TV stand, at minimum) so Phase 3's own worked
  example is literally buyable, not hypothetical. Beyond that floor, how
  much fuller the launch catalog is remains a genuine content-authoring
  choice, not an architectural one, and still doesn't block any phase.

---

## Design invariants

1. **Decor purchases never bypass the doormat.** One delivery mechanism
   in the whole game, reused, not a second one that could drift from the
   first.
2. **A placed decor object is a real object instance, indistinguishable
   from any other object in its room's bucket**, by design — this is what
   lets every other system (anchors, cleanliness, signals) treat it like
   furniture that's simply always been there, with zero special-casing.
3. **Structural and decor are different catalogs for a reason.** The
   moment a "furniture" purchase can change a room's shape or type, it
   has quietly become a structural upgrade wearing decor's price tag —
   this boundary (D1) is worth defending deliberately if a future session
   is tempted to blur it.
