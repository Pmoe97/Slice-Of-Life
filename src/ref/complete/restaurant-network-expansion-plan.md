# Restaurant Network Expansion + Full Menus

Status: **complete** — all four phases implemented + verified live (one
post-completion new-game bug found and fixed 2026-08-05 — see Handoff)
(2026-08-05). The 12-restaurant roster, full 128-entry menus, meal-category
filter, wrap-aware hours, cross-midnight deliveries, and the ≥2-open-at-
every-tick invariant are all shipped. Phase 4's verification results are in
the Handoff note below.
Last updated 2026-08-05.

Session protocol: this plan is implemented one phase per session under
`src/ref/complete/restaurant-expansion-handoff-prompt.md` (the restaurant-specific
variant of `src/ref/patterns/perchance-agent-handoff-prompt.md`). Read its Step 0/Step 1
before starting any phase, and write this document's Handoff note as the
last thing you do every session.

Scope: expand the DoorDrop restaurant network from 6 places to 12, grow
every menu to 8-12 items, add meal-category coverage (breakfast / lunch /
dinner / late-night-craving / 24-hour), and make the platform satisfy one
hard invariant: **at least two restaurants open at every half-hour tick of
every day**.

This is a data + one-mechanic plan. The bulk is authored content
(`RESTAURANT_DEFS` menu entries + `ITEM_DEFS` dish lines); the only real
code changes are (a) a richer hours model that supports multiple open
windows and windows that cross midnight, and (b) making food orders whose
delivery lands after midnight roll onto tomorrow's visit record correctly.

---

## Handoff — read this first

**ALL PHASES COMPLETE (2026-08-05).** The Restaurant Network Expansion is
done and fully verified: 12 restaurants, every menu full (128 entries),
meal-category filter, wrap-aware hours, cross-midnight deliveries, and the
≥2-open invariant at every half-hour tick. Phase 4 (verification) is DONE.
Step 0 of the next session should report completion and stop — there is no
remaining work in this plan.

**Post-completion bug (found 2026-08-05 — the "no stores open on a brand
new game" report):** a fresh new game showed ZERO food stores open for
delivery. Root cause was NOT the defs/hours — it was a STALE BUILD: the
browser's HTTP cache was serving pre-overhaul src/*.js because the
`?v=` cache-bust params on index.html's script tags had never been bumped
for the restaurant-network changes. The cached defs.computer.js had only
the old 6-restaurant roster and the cached computer.js had the old simple
`isRestaurantOpen` (`tick >= open && tick < close`, no `[0,47]` 24h
sentinel, no wrap-aware windows, no `getRestaurantWindows`/
`countRestaurantsOpenAt`), so at a new game's 08:00 start (tick 16) no
restaurant satisfied the range check. Diagnosed by comparing the live
page's `RESTAURANT_DEFS_LIST.length` (6) / `isRestaurantOpen.toString()`
against disk (12 / wrap-aware), confirmed by `?v=` URLs being unchanged
while file contents had moved on. **Fix: bumped every `?v=N` → `N+1` on
index.html's script tags (32 of them).** After the bump the live page
loads all 12 defs, new-game start tick 16 has 3 open (Sunrise Cafe, Big
Bite Burgers, The Greasy Spoon), and `countRestaurantsOpenAt(t) >= 2`
holds for all 48 ticks (min 2 at tick 10 / 05:00) — re-verified on the
fixed build. LESSON: whenever src/*.js content changes, bump that script's
`?v=` param in index.html or the browser keeps serving the old file.

**Follow-up (2026-08-05): live ETA ticker.** The DoorDrop Orders screen's
"X min away" countdown is now live: `updateFoodOrderEtas` (RENDER.COMPUTER)
runs from `updateClockDisplay` (TIME) every clock frame and updates ONLY
each `.dd-order-eta` pill's textContent in place (cards are tagged
data-order-id), never rebuilding the list — the same-node check passed
across a +10 min advance, and eta≤0 flips the pill to "At your door" live.
Covers both the phone and computer DoorDrop windows. Also fixed the ETA
pill showing a raw float (`Math.ceil`, see prior turn). Bumped ?v= for
render.computer.js (26) and time.js (11).


**Last session (2026-08-05) — Phase 4 verification results (all passed):**
- Invariant: `countRestaurantsOpenAt(t) >= 2` for ALL 48 ticks; min = 2 at
  ticks 10-11 (05:00-06:00, the two 24h anchors); tick 0 = 4, tick 33
  (16:30) = 7 — matches the corrected Coverage proof exactly.
- Rendering: browse lists all 12 cards, open-first; hours strings exact
  ("Open 24 hours" ×2; midnight_noodle "17:00–04:00"; munchies
  "18:00–05:00"; sunrise "06:00–14:00"; corner_deli "10:00–16:00";
  golden_wok "11:00–23:00"; sals "11:00–23:30"; el_camino "10:30–23:00";
  bangkok "11:00–22:00"; kaisen "11:30–21:30"; emerald "17:00–23:00").
  Filters narrow All→12, Breakfast→1, Lunch→1, Dinner→4 (golden_wok,
  bangkok, kaisen, emerald), Late Night→4 (sals, el_camino, midnight_noodle,
  munchies), 24H→2, with the active chip styled filled vs .btn-secondary.
  Closed cards show the Closed pill and no View Menu; open cards do.
- Menu integrity: all 128 menu itemIds resolve in ITEM_DEFS; every Phase 3
  authored price/hunger/energy number matches (0 mismatches across the
  full enumerated check, including emerald's >55-hunger mains and the
  coffee/tea energy values); no dish in any menu carries a `price`
  (dish_soap is a cleaning item, not a menu dish); menus render
  "$price — restores N hunger" correctly.
- Cross-midnight (check 4): at 23:10 from latenight_munchies, an ASAP
  order (food_2_0) landed arrivalDay=3, arrivalTick=0, visit
  {sourceId, day:3, startTick:0, endTick:2, purpose:'delivery', npcId:
  driver_5, roomId:'entry'} on tomorrow's record; the cart time select
  offered a "Tomorrow" optgroup (ASAP — Tomorrow 00:00 … 06:00); the
  Orders screen read "arriving Tomorrow 00:00"; advancing the clock past
  arrival (advanceAndResolve across the boundary) delivered the food to
  the doormat (player in bedroom → handedTo 'doormat'). A 2am order from
  big_bite stayed same-day (arrivalDay=day, arrivalTick=6, "ASAP — 03:00",
  no Tomorrow label anywhere).
- Closed-refusal (check 5): sunrise_cafe at 18:00 → "Sunrise Cafe is
  closed right now (06:00–14:00)."; midnight_noodle at 10:00 → "Midnight
  Noodle is closed right now (17:00–04:00)."; wrap boundaries exact
  (midnight_noodle open at 2:00, closed at 16:30/tick 33, open at
  17:00/tick 34).
- No regressions (check 6): final browser_refresh = zero perchanceErrors /
  syntaxErrors; a legacy order record with no `arrivalDay` rendered
  same-day ("arriving 15:00", ETA via the `arrivalDay = order.day`
  fallback); the real save was verified intact after the test suite
  (day 2, $3800, computer off, 0 food orders, 7 npcs).

**Correction to the snapshot/restore recipe (do not repeat the bug):**
the kv snapshot/restore MUST delete the folder's CURRENT keys, not the
snapshot's keys — `deleteMany(await root.kv[f].keys())` then
`setMany(snapshotEntries)`. My first restore used
`deleteMany(snapshotKeys)`, which left every test-created key in place
(driver_2/driver_5 npcs, two extra scene images) and they came back in the
post-restore counts. ALSO call `pauseClockLoop()` before restoring: the
continuous clock's sim checkpoints can cross day rollovers mid-restore and
re-write mutated in-memory state into kv between your awaited kv calls.
Restore order that worked cleanly: pauseClockLoop → stopAutosave →
per-folder deleteMany(current keys) + setMany(snapshot entries) →
forceFlush → verify counts match → browser_refresh. Images restore keeps
Blob values as-is (see the incident below). The two leak vectors a DoorDrop
test creates are driver npcs (driver_1..5 via pickFoodDriver →
createExternalNpc, persisted by saveAtBoundary) and extra scene images in
kv.images.

**Blockers / flagged deviations:** none. The restore-technique bug above
was found and corrected mid-session; the save was verified intact after
restore (day 2, $3800, computer off, 0 food orders, 7 npcs — no driver
residue).

**Current DoorDrop state (post-Phase 4):**
- 12 restaurants; every menu 8-13 items; all 128 menu itemIds resolve; no
  dish has a `price`; `service` set on all 12 defs.
- Phase 1/2 mechanics unchanged: windows/wrap hours, `arrivalDay` on
  orders, tomorrow-labeled cart select + Orders pills, legacy-order shim
  (`arrivalDay != null ? arrivalDay : order.day`).
- `countRestaurantsOpenAt(tick)` (dev-only) available for the invariant.
- Restaurants still referenced nowhere in LLM/NPC content.

**Verification note:** this project has no test harness; verification is
done via `browser_eval` against the live page. When a test mutates the
save, snapshot `meta`/`player`/`world`/`npcs`/`snapshots`/`objects`
/`images` via `entries()`, `stopAutosave()` + `forceFlush()`, restore
using the corrected recipe above (delete CURRENT keys, pause the clock
loop), and restore `images` WITHOUT JSON round-tripping (Blobs — see the
incident in the old Handoff).

---

## The target roster (12 restaurants)

| Restaurant | Cuisine | `service` | Hours (tick) | Hours (clock) |
|---|---|---|---|---|
| `sunrise_cafe` **new** | Café | `breakfast` | `[12, 28]` | 06:00-14:00 |
| `corner_deli` **new** | Soup & Deli | `lunch` | `[20, 32]` | 10:00-16:00 |
| `big_bite` (exists) | American | `24h` | `[0, 47]` | 24 hours |
| `the_greasy_spoon` **new** | Diner | `24h` | `[0, 47]` | 24 hours |
| `golden_wok` (exists) | Chinese | `dinner` | `[22, 46]` | 11:00-23:00 |
| `sals_pizzeria` (exists) | Italian | `late` | `[22, 47]` | 11:00-23:30 |
| `el_camino` (exists) | Mexican | `late` | `[21, 46]` | 10:30-23:00 |
| `bangkok_house` (exists) | Thai | `dinner` | `[22, 44]` | 11:00-22:00 |
| `kaisen_sushi` (exists) | Japanese | `dinner` | `[23, 43]` | 11:30-21:30 |
| `emerald_kitchen` **new** | Upscale | `dinner` | `[34, 46]` | 17:00-23:00 |
| `midnight_noodle` **new** | Asian | `late` | `[34, 8]` | 17:00-04:00 (wrap) |
| `latenight_munchies` **new** | Street food | `late` | `[36, 10]` | 18:00-05:00 (wrap) |

`service` is a new per-restaurant field: `breakfast | lunch | dinner |
late | 24h` — the primary meal-category the DoorDrop filter groups by
("craving joints" = the `late` places: cheap comfort food for when the
crav-and-want-it-now urge hits at 1am). Hours with `open > close` wrap
across midnight.

### Coverage proof for the ≥2 invariant (open count per tick window)

- 00:00-04:00: big_bite, greasy_spoon, midnight_noodle, latenight_munchies = **4**
- 04:00-05:00: big_bite, greasy_spoon, latenight_munchies = **3**
- 05:00-06:00: big_bite, greasy_spoon = **2** ← minimum floor
- 06:00-10:00: + sunrise_cafe = **3**
- 10:00-10:30: + corner_deli = **4**
- 10:30-11:00: + el_camino = **5**
- 11:00-11:30: + golden_wok, sals, bangkok = **8**
- 11:30-14:00: + kaisen = **9**
- 14:00-16:00: sunrise closed; big_bite, greasy_spoon, corner_deli, golden_wok,
  sals, el_camino, bangkok, kaisen = **8**
- 16:00-17:00: corner_deli closed; big_bite, greasy_spoon, golden_wok, sals,
  el_camino, bangkok, kaisen = **7**
- 17:00-18:00: + midnight_noodle, emerald = **9**
- 18:00-21:30: + latenight_munchies = **10**
- 21:30-22:00: kaisen closed = **9**
- 22:00-23:00: bangkok closed; big_bite, greasy, sals, el_camino, golden_wok,
  midnight_noodle, emerald, latenight = **8**
- 23:00-23:30: golden_wok, el_camino, emerald close; sals, big_bite,
  greasy_spoon, midnight_noodle, latenight = **5**
- 23:30-00:00: sals closes; big_bite, greasy, midnight_noodle, latenight = **4**

(The floor is 05:00-06:00, ticks 10-11, when only the two 24h anchors are
open = **2**. Note the 14:00-17:00 rows above were originally mis-drawn as
3/2 — they omitted the five afternoon dinner places, whose real hours make
those windows 8/7; corrected 2026-08-05 during Phase 3 verification, see the
Handoff's flagged deviations.)

Minimum is **2 at every tick** (the two 24h anchors alone guarantee the
floor). Two 24h places is deliberate, not accidental: it's what makes the
invariant structural instead of hand-tuned.

---

## Phase 1 — Hours model: multiple windows + midnight wrap

**Status: DONE — implemented + verified live 2026-08-05 (see Handoff).**

**Where:** `src/computer.js` (`isRestaurantOpen`), `src/render.computer.js`
(browse hours string), plus small helper functions next to
`isRestaurantOpen`.

1. **Normalize hours into windows.** Add `getRestaurantWindows(def)` that
   accepts both the legacy shape `[open, close]` and a new array-of-windows
   shape `[[open, close], ...]`, returning `[[open, close], ...]`. (Array
   form is future-proofing — a dinner place with a lunch+dinner split later
   needs no new mechanics — but NO restaurant in this plan actually uses
   multi-windows yet; everything here is a single window, some wrapping.)
2. **Wrap-aware openness.** Rewrite `isRestaurantOpen(def, tick)` to return
   true if ANY window contains the tick, where a window with `open > close`
   spans midnight: `tick >= open || tick < close`. `[0, 47]` = 24h. Keep the
   default `[0, 47]` fallback for a def with no `hours` (unchanged behavior).
3. **One hours-string formatter.** Add `formatRestaurantHours(def)` used by
   BOTH the browse card (`renderDoorDropBrowse`, replacing the inline
   `formatTime(hours[0]*30)–formatTime(hours[1]*30)`) and the closed-refusal
   message in `placeFoodOrder`. Rules: `[0,47]` → `"Open 24 hours"`;
   single window → `"11:00–23:00"`; wrap window → `"5:00 PM–4:00 AM"` (the
   raw 24h strings are fine; a human reads `17:00–04:00` correctly, no day
   labels needed on a card).
4. **`service` field.** Add `service` to all 12 restaurant defs per the
   roster table. (Escort defs already use a service-vocabulary too — no
   collision in code; they live in a different object and are never compared.)
5. **Coverage helper (dev-only).** Add a tiny pure `countRestaurantsOpenAt(tick)`
   (or reuse `RESTAURANT_DEFS_LIST` + `isRestaurantOpen` in a one-liner) —
   not wired into the UI, just used by Phase 4's verification to assert the
   ≥2 invariant across all 48 ticks.

## Phase 2 — Cross-midnight deliveries (late-night correctness)

**Status: DONE — implemented + verified live 2026-08-05 (see Handoff).**

**Where:** `src/computer.js` (`placeFoodOrder`, `getFoodEarliestArrivalTick`,
`getFoodOrderTotals` unchanged), `src/render.computer.js`
(`renderDoorDropCart` time select, `renderDoorDropOrders` arrival label).

The bug: `placeFoodOrder` clamps arrivals to tick 47 on the order's own day,
so an order placed at 23:00 that physically arrives at 00:15 would be
mis-scheduled for 23:30 *today*. Once late-night kitchens exist this fires.

1. **Absolute-arrival math.** In `placeFoodOrder`, compute the arrival in
   absolute minutes `day*1440 + nowMinutes + prep + travel`, then derive
   `arrivalDay = floor(abs/1440)` and `arrivalTick = roundToNextTick(abs % 1440)`.
   Store BOTH on the order: keep `day` = order day (for the Orders list /
   "ordered on" display) and add `arrivalDay`; `getFoodOrderEtaMinutes` and
   `processFoodOrdersNow` switch to `arrivalDay` (their math already handles
   the cross-day delta — they just currently read `order.day`).
2. **Schedule the visit on the arrival day.** `scheduleVisit(gameState,
   order.id, arrivalDay, {...})` — the driver arrives on tomorrow's record
   when the kitchen is slow enough. `scheduleVisit` already keys on
   source+day, so no collision.
3. **Cart time select.** `getFoodEarliestArrivalTick` becomes
   `getFoodEarliestArrival(gs, restaurantId, seq)` returning
   `{ day, tick }`. The `<select>` in `renderDoorDropCart` enumerates slots
   as `{day, tick}` values (day 0 = today, 1 = tomorrow) from earliest to
   `earliest + maxScheduleAheadTicks`, labeling tomorrow's options
   `"Tomorrow HH:MM"` — exactly the pattern the escort booking screen
   already uses at `render.computer.js:1495`. Drop the 47 clamp.
4. **Orders screen.** `renderDoorDropOrders` arrival pill shows
   `Tomorrow HH:MM` when `order.arrivalDay > today`. `getFoodOrderEtaMinutes`
   already returns the right positive delta.
5. **Keep the "closed right now" guard authoritative.** `isRestaurantOpen`
   is still checked at order time only; a 24h joint open at 2am is orderable
   at 2am, and the arrival math handles whatever window its prep+travel
   lands in (all within the same day for pre-11pm orders).

## Phase 3 — The content: new restaurants + full menus (bulk of the work)

**Status: DONE — implemented + verified live 2026-08-05 (see Handoff).**
(Phase 3 may be split across sessions; it was done in one this time — all
twelve menus expanded, every entry has a real `ITEM_DEFS`, and the ≥2
invariant + menu-integrity checks were run as part of Phase 4's checklist
before marking done.)

**Where:** `src/defs.computer.js` (`RESTAURANT_DEFS`), `src/defs.world.js`
(restaurant-dish section), `src/render.computer.js` (browse filter).

### 3a. New dish item defs

Add ~85 new `dish_*` entries to the "Delivered restaurant dishes" section of
`defs.world.js` following the existing conventions exactly: `category: 'meal'`
(or `'drink'`), `stackable: true`, `maxStack` 2-6, `perishable.days` 1-2
(fried/short-lived = 1, noodle/curry/diner = 2), `consumable.hunger` in the
existing 15-55 range with `mood` 0.03-0.08. Coffee/espresso/tea-style dishes
add `energy` (mirroring `coffee_beans`' `{ energy: 8 }`). NO `price` field —
prices live in menu entries only.

Pricing convention (keep consistent with the existing roster): roughly
`$0.30-0.35` per hunger point for normal joints (kung pao $14/45, pad thai
$15/44), slightly cheaper for breakfast/cheap-diner fare, richer markup for
fancy places (kaisen today is $24/40; emerald_kitchen goes to ~$0.55-0.60/
point). Restaurant food must keep beating home cooking on hunger+mood (the
existing design invariant) and remain visibly worse value than cooking once
fees stack on.

### 3b. Existing six → expanded menus (all ids/names unchanged)

- **golden_wok** (now 11:00-23:00): existing 4 + `dish_orange_chicken`
  $15/48, `dish_lo_mein` $12/40, `dish_house_fried_rice` $13/42,
  `dish_beef_broccoli` $14/46, `dish_wonton_soup` $8/20,
  `dish_fortune_cookies` $4/8(mood .03) → **10 items**.
- **sals_pizzeria** (now 11:00-23:30): existing 3 + `dish_cheese_pizza`
  $16/48, `dish_sausage_pizza` $18/52, `dish_white_pizza` $17/50,
  `dish_meatball_sub` $13/44, `dish_breadsticks` $6/18, `dish_caesar_wedge`
  $9/22, `dish_cannoli` $8/16(mood .06), `dish_limonata` $5/10 →
  **11 items**.
- **big_bite** (→ 24 hours; update blurb to say so): existing 3 +
  `dish_breakfast_burger` $11/42, `dish_sausage_egg_muffin` $8/32,
  `dish_pancakes` $9/36, `dish_hash_browns` $5/16, `dish_chicken_sandwich`
  $13/46, `dish_onion_rings` $7/20, `dish_bacon_burger` $16/52,
  `dish_nuggets` $8/28, `dish_lemonade` $4/8, `dish_apple_pie`
  $6/18(mood .04) → **13 items** (the all-day breakfast crowd is the point
  of a 24h burger joint).
- **kaisen_sushi** (unchanged hours): existing 3 + `dish_spicy_tuna_roll`
  $22/38, `dish_rainbow_roll` $28/42, `dish_ebi_tempura` $16/34,
  `dish_chicken_katsu` $17/44, `dish_gyoza` $11/28, `dish_edamame` $6/14,
  `dish_green_tea` $4/6(mood .02), `dish_mochi` $8/12(mood .06) →
  **11 items**.
- **el_camino** (unchanged hours): existing 3 + `dish_carnitas_tacos`
  $12/42, `dish_chorizo_tacos` $13/44, `dish_quesadilla` $11/40,
  `dish_tamales` $10/36, `dish_elote` $6/16, `dish_sopes` $9/32,
  `dish_horchata` $5/12(mood .03), `dish_bean_cheese_burrito` $10/38 →
  **11 items**.
- **bangkok_house** (unchanged hours): existing 3 + `dish_drunken_noodles`
  $15/46, `dish_massaman_curry` $17/50, `dish_thai_fried_rice` $13/42,
  `dish_tom_yum` $9/24, `dish_satay` $11/30, `dish_thai_iced_tea`
  $5/12(mood .03), `dish_mango_sticky_rice` $9/18(mood .07),
  `dish_coconut_ice_cream` $7/12(mood .06) → **11 items**.

### 3c. Six new restaurants (new `RESTAURANT_DEFS` entries)

- **sunrise_cafe** — `service: 'breakfast'`, `hours: [12, 28]`,
  `prepMinutes: 10`, `deliveryFeeBase: 2`. 12 items: `dish_pancake_stack`
  $11/40, `dish_belgian_waffle` $12/42, `dish_breakfast_sandwich` $10/38,
  `dish_avocado_toast` $9/30, `dish_hash_brown_bowl` $8/28,
  `dish_granola_bowl` $10/32, `dish_breakfast_potatoes` $6/20,
  `dish_fresh_coffee` $4/8(+energy 10), `dish_oat_latte` $6/6(+energy 6),
  `dish_orange_juice_pitcher` $5/3(mood .02), `dish_croissant` $5/16,
  `dish_bagel_cc` $7/24.
- **the_greasy_spoon** — `service: '24h'`, `hours: [0, 47]`,
  `prepMinutes: 12`, `deliveryFeeBase: 2`. 12 items: `dish_diner_breakfast`
  $10/45, `dish_club_sandwich` $12/46, `dish_patty_melt` $13/48,
  `dish_grilled_cheese` $8/30, `dish_tomato_soup_cup` $5/16,
  `dish_chicken_tenders` $11/38, `dish_hamburger_steak` $14/50,
  `dish_pancake_plate` $9/35, `dish_pie_slice` $6/18(mood .05),
  `dish_coffee_mug` $3/6(+energy 8), `dish_vanilla_shake` $6/14(mood .05),
  `dish_onion_soup` $7/22.
- **corner_deli** — `service: 'lunch'`, `hours: [20, 32]`,
  `prepMinutes: 12`, `deliveryFeeBase: 2`. 10 items: `dish_pho_ga` $12/42,
  `dish_tomato_soup_bowl` $8/28, `dish_bread_bowl_chili` $12/40,
  `dish_chicken_flatbread` $11/38, `dish_salad_medley` $10/30,
  `dish_mushroom_soup` $9/30, `dish_half_sandwich_soup` $11/36,
  `dish_grilled_cheese_deli` $9/32, `dish_lemonade_pitcher` $5/12,
  `dish_turkey_club` $12/44.
- **emerald_kitchen** — `service: 'dinner'`, `hours: [34, 46]`,
  `prepMinutes: 30`, `deliveryFeeBase: 8`. 9 items: `dish_ribeye` $38/65,
  `dish_duck_breast` $34/60, `dish_short_rib` $36/62, `dish_caesar_salad`
  $12/24, `dish_butter_potatoes` $10/28, `dish_creme_brulee`
  $9/16(mood .07), `dish_chocolate_torte` $10/18(mood .07), `dish_house_red`
  $14(mood .08, energy -4), `dish_espresso` $6(+energy 8). (The one place
  whose hunger values exceed the current 55 ceiling — deliberate: it's the
  splurge, priced accordingly.)
- **midnight_noodle** — `service: 'late'`, `hours: [34, 8]` (wrap),
  `prepMinutes: 18`, `deliveryFeeBase: 4`. 9 items: `dish_tonkotsu_ramen`
  $16/52, `dish_dan_dan` $14/48, `dish_spicy_wontons` $10/34,
  `dish_garlic_fried_rice` $12/40, `dish_chashu_bowl` $15/46,
  `dish_egg_ramen` $11/36, `dish_gyoza_night` $10/30, `dish_boba_milk_tea`
  $7/12(mood .05), `dish_cucumber_salad` $6/14.
- **latenight_munchies** — `service: 'late'`, `hours: [36, 10]` (wrap),
  `prepMinutes: 12`, `deliveryFeeBase: 3`. 9 items: `dish_loaded_nachos`
  $11/40, `dish_buffalo_wings` $13/42, `dish_chili_cheese_tots` $9/34,
  `dish_hot_dog` $7/26, `dish_mozzarella_sticks` $8/28, `dish_poutine`
  $12/44, `dish_fried_pickles` $7/22, `dish_cheesesteak` $14/48,
  `dish_freezie` $5/10(mood .04).

Each new def gets: `id`, `label`, `cuisine`, `blurb` (one line, in the same
voice as the existing five), `service`, `deliveryFeeBase`, `prepMinutes`,
`hours`, `menu`. `RESTAURANT_DEFS_LIST` is `Object.values(...)` — new places
appear in the browse grid automatically, no registration step.

### 3d. Browse UI: meal-category filter + open-first sort

`renderDoorDropBrowse` gains a small filter row above the grid: `All |
Breakfast | Lunch | Dinner | Late Night | 24H`, matching on the new
`service` field, plus an "Open now" visual treatment already partly present
(closed cards show the Closed pill). Keep it single-select (a toggle row of
buttons, same styling family as the tip selector). Open places render
before closed ones within a filter. This is pure render-time state (a local
`filterService` variable per render) — no persistence, no app-state change.

---

## Phase 4 — Verification

**Status: DONE — implemented + verified live 2026-08-05 (see Handoff).**

All via the fresh-iframe `browser_eval` technique (ARCHITECTURE.md P2 note).
Checks:

1. **Invariant (the hard requirement):** iterate all 48 ticks, assert
   `countRestaurantsOpenAt(tick) >= 2` for every tick. Then spot-check the
   floors: tick 10 (05:00) = exactly 2 (also tick 11 = 2), tick 33 (16:30)
   = 7, tick 0 (00:00) = 4. (These are the REAL counts — the floor is
   05:00-06:00; the afternoon counts 8/7 were verified during Phase 3 and
   the old proof claiming tick 33 = 2 was corrected in the Coverage proof
   above.)
2. **Rendering:** DoorDrop browse lists all 12 with correct hours strings
   (24h places read "Open 24 hours"; `midnight_noodle` reads
   `17:00–04:00`); each filter chip narrows to the right service set;
   closed places show the Closed pill and no View Menu button; open places
   do.
3. **Menu data integrity:** every menu `itemId` resolves in `ITEM_DEFS`;
   every item's price renders; hunger values match the authored numbers;
   nil `dish_*` entry has a `price` (would leak into Nile).
4. **Ordering across the boundary:** at 23:10 from `latenight_munchies`,
   place an ASAP order → arrival lands after midnight on `arrivalDay =
   today+1` with the correct tick; the driver visit exists on the next
   day's record; the cart time select offers a "Tomorrow HH:MM" slot; the
   Orders screen labels it Tomorrow; advancing the clock past it delivers
   to the doormat/player exactly like today's flow. Also verify a 2am order
   from a 24h place (same-day arrival, small tick) still works.
5. **Closed-refusal:** ordering from `sunrise_cafe` at 18:00 refuses with
   the windows-formatted hours message; ordering from a wrap-hours place
   during its closed 05:00-17:00 gap refuses.
6. **No regressions:** `browser_refresh` shows zero `perchanceErrors` /
   `syntaxErrors`; existing orders from before the change (a
   `world.foodOrders` record with no `arrivalDay` field) still render — treat
   missing `arrivalDay` as `arrivalDay = order.day` (the only compatibility
   shim this plan needs; no kv migration).

---

## What this plan deliberately does NOT do

- No NPC/LLM integration: restaurants stay out of narrative prompts (matches
  current behavior; scope would balloon otherwise).
- No dine-in mechanic, no restaurant visits, no walk-in ordering — DoorDrop
  delivery only, as today.
- No multi-window restaurants in this pass (the hours model supports them,
  but no def uses them yet — yagni until a lunch/dinner-split place earns
  one).
- No dynamic/LLM-generated menus — all content is authored data, cached-free
  and deterministic.
- No new money systems: delivery fees/service fees/tips unchanged
  (`FOOD_TUNING` untouched; only `prepMinutes`/`deliveryFeeBase` per new
  restaurant).
