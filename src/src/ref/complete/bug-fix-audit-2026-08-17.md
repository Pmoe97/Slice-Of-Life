# Bug-Fix Audit — 2026-08-17

Status: **CLOSED — all findings from the 2026-08-17 playtest audit fixed and
verified live.** This file is the record of every finding, its status, and
the reasoning behind each fix. Pass 1 = the "Ugly bugs + opening economics"
pass (see §4), Pass 2 = the hunger pass (see §5), Pass 3 = the picker-race
eating fix (see §7). All 7 Bad + 4 Ugly findings are fixed and verified on
the live page (see §6). A future playtest audit is a NEW dated document
(`bug-fix-audit-<date>.md`), not a reopening of this one.

Scope: a 5-day playthrough (solo start, one roommate, RenoFix, DoorDrop,
gigs, IM, phone) — D6 checkpoint at Day 5-6, $2440, energy 67/71, hygiene 0
for days, rent $1900 due weekly with bathroom-A plumbing job booked to
Day 10.

---

## 1. Verified working (noted so they are not "re-broken" by a fix)

- **NPC autonomy** — Sage sleeps/eats/works 9-18/commutes/relaxes on the
  continuous behavior engine; showers, meals and work-start all land at
  their scheduled times. No regressions observed during the audit.
- **LLM conversations** — internal monologue, action beats, in-character
  voice, memory recall all present and legible.
- **Roommate pipeline** — applicant pool, filters, character bibles,
  interviews, room assignment, and rent recompute-on-move-in all work.
- **RenoFix** — working-day scheduling, one concurrent job, free tutorial
  job on an auxiliary bedroom.
- **DoorDrop** — menu/cart/tip/ETA/driver/doormat dropoff all work.
- **Floor plan + fog-of-war + avatars, sleep/alarm/energyMax good-sleep
  growth, phone battery/charging** — all functioning.

## 2. Findings — BAD (UX / friction)

| # | Finding | Evidence | Status |
|---|---|---|---|
| B1 | **No "Eat" chip on Day 1.** Starter groceries are all `category:'ingredient'`; `EDIBLE_CATEGORIES = {'food','meal','snack','drink'}` (`inventory.js:167`) and the Eat chip is gated by `hasEdibleFood` (`defs.actions.js:877`), so the only early options are the Bag→Use verb or a $20 DoorDrop. Stove is also broken at start, so cooking is not a bridge. | `inventory.js:167`, `defs.world.js` STARTER_GROCERIES, `defs.actions.js:30/877` | **Fixed — pass 2** |
| B2 | **Hunger labels are decorative / misleading.** Any positive hunger delta is a "meal" that resets the rhythm — the 0-100 display value is derived and mostly sits high; DoorDrop text "restores 50 hunger" vs "8" implies differences that don't exist. | `effects.js:192` (`applyAdjustNeed` hunger branch), `sim.js` `satietyFrom`, `config.js` `HUNGER_RHYTHM.satietyStart:90` | **Fixed — pass 2** |
| B3 | **Overnight hunger drain ~40-45 pts.** Wakes every morning at 0-7% hunger. | playtest observation (5 mornings) | **Fixed — pass 2** |
| B4 | **No shower for 6+ days.** Both `bathroom_*_plumbing` start `'broken'` (`config.js` `FACILITY_STARTING_TIERS`), `self.shower` requires `facilityFunctionalHere:self.shower`, and `isFacilityFunctional` only passes `functional`/`upgraded` (`computer.js:2219`). No interim wash for the player. **User says this was supposed to be fixed — showers must be FUNCTIONAL (working, unremarkable) at game start, not upgraded/luxurious.** | `config.js:1788-1789`, `computer.js:2219`, `defs.actions.js:97` | **Fixed — pass 1** |
| B5 | **Gig economy too steep.** A typical 4-block gig at low mood/energy (focus 0.2-0.5) takes ~17 clicks; config's own comment pegs solo rent ($271/day) as "not quite payable" at full grind ($264/day), and reality lands well under that. **User: make more per gig OR reduce effort per gig.** | `computer.js:385` `computeFocusMultiplier`, `config.js:6156` `WORK_TUNING`, `defs.computer.js:373` `GIG_ENERGY_PER_BLOCK` + `GIG_TEMPLATES` | **Fixed — pass 1** (see §4) |
| B6 | **Energy gate too blunt.** `handleAction` blocks ALL non-exempt actions at energy 0, including **delivering a finished gig** (`gig.deliver` not exempt) — you can finish the work but not collect. Same gate comment references a nonexistent `canPerformAction`. | `ui.js:3175`, `ui.js:3042` `ENERGY_GATE_EXEMPT`, `ui.js:318` stale comment | **Fixed — pass 1** |
| B7 | **Rent label says `/mo`, rent is weekly.** `ECONOMY.rent.total` = 1900, `payPeriodDays: 7` ("rent due weekly"). One UI site says `/mo`. **User: rent is $1900/week.** | `config.js:390/432`, `render.computer.js:1788` | **Fixed — pass 1** |

## 3. Findings — UGLY (bugs)

| # | Finding | Evidence | Status |
|---|---|---|---|
| U1 | **Phone Messages thread-click doesn't render.** `doImOpenThread` sets `im.viewingNpcId` then calls only `renderComputerScreen` — the phone pane (shared `renderMessages` renderer, rendered by `renderPhoneScreen`→`renderPhoneContent`) never repaints, so it stays on "Select a conversation." **Reproduced live 2026-08-17** (clicked a thread row in the phone's Messages; `viewingNpcId` updated to `contractor`, pane unchanged). | `ui.computer.js:1156`, `render.phone.js` `renderPhoneContent`, `render.computer.js:3170` | **Fixed — pass 1** |
| U2 | **Computer + phone Messages open at once interact badly.** Both render `#cs-chat-input` (duplicate id); `doImSend` does `document.getElementById('cs-chat-input')`, which returns the COMPUTER's input whenever both are in the DOM — sending from the phone reads the computer's text (or nothing), and after a send only the computer is repainted. `im.viewingNpcId` is also shared, so opening a thread on one device silently switches the other. **Reproduced live 2026-08-17** (2 inputs in DOM, `getElementById` → computer's). | `render.computer.js:3270/3305`, `ui.computer.js:1174` `doImSend` | **Fixed — pass 1** |
| U3 | **LLM judge passes fail to parse too often.** "Assessor reply unparseable" ×4 and "Chronicler reply unparseable" ×2 in ~5 days. Graceful no-op (D14) but burns the window: relationship/knowledge progression silently stalls. | `llm.js:583/731`, `x5.js:144/244` (parse already has a brace/regex ladder) | **Fixed — pass 1** (single retry on parse-failure only) |
| U4 | **Stale comment** `(see canPerformAction)` at `ui.js:318`; the real gate is `ENERGY_GATE_EXEMPT` / `isActionExemptFromEnergyGate` (`ui.js:3042/3079`). | `ui.js:318` | **Fixed — pass 1** |
| U6 | **Eating "does nothing" when the player dawdles at the picker.** The Eat chip → picker flow applies its effects to the `gameState` snapshot captured when the action started, but an async `prepare()` (the eat/cook/set_meal pickers) lets the continuous clock replace `currentGameState` (a heartbeat rebuilds the player, a checkpoint rebuilds the state). Effects — the consumed food, the hunger restore, meal deltas — then land on the detached snapshot the renderer and saver have moved past, so the player sees "You eat a pasta." with hunger still at 0 and the food untouched. `resolvePairedAct` already worked around this with the live-state pattern; `executeAction`'s effect block didn't. **Reproduced live 2026-08-17** (picker open across a real-time gap, then eat → live hunger 0→40 after fix, before fix 0). | `actions.js` `executeAction` | **Fixed — pass 3** |

## 4. Pass 1 — what changed and why

Decisions for pass 1, matching the user's direction (Ugly bugs + opening
economics; everything else tracked above and deferred):1. **U1/U2 (Messages on two devices)** — `doImOpenThread` now re-renders
   both the computer and the phone. `doImSend` becomes device-aware: input,
   typing indicator, send button and focus are all scoped to the
   `data-device` pane that sent, and both devices repaint so the shared
   thread stays in sync. The phone's Enter-send handler passes its device
   through. Shared `im.viewingNpcId` is kept — Messenger-style cross-device
   sync is intended; the duplicate-input grab was the actual bug.
2. **B4 (showers)** — `FACILITY_STARTING_TIERS` sets both
   `bathroom_*_plumbing` to `'functional'` (the "Working Shower" tier: hot
   water, toilet, drains — functional, not special). `'upgraded'` (Modern
   Bath) remains the paid RenoFix goal. Game-opening narrative about
   patch-job plumbing survives as backstory.
3. **B7 (rent label)** — RoomList ad rent info now reads `/wk` to match
   `ECONOMY.rent.payPeriodDays: 7`.
4. **B5 (gig economy)** — effort reduced + entry pay raised:
   - `WORK_TUNING.minEnergyFocus` 0.4 → 0.55, `minMoodFocus` 0.5 → 0.7
     (a neutral mood no longer halves throughput; low energy no longer
     collapses progress to 0.2 of a block per click).
   - `GIG_ENERGY_PER_BLOCK` 6 → 5 (energy budget ~14 blocks/day instead of
     ~11.6).
   - Entry gig pay up: `data_entry` 24→28, `copy_edit` 34→40,
     `web_tweak` 40→48 per block.
   - The "My Gigs" screen now shows current work-efficiency % so the
     player can SEE when rest/mood would help.
   - Config's economy comment updated (12 → ~14 blocks/day) to stay true.
   Design intent preserved: solo full-grind still does not quite cover
   $271/day; roommates are still the way out.
5. **B6 (energy gate)** — `gig.deliver` added to `ENERGY_GATE_EXEMPT` (it
   is a zero-cost collect, not an exertion) and the stale
   `canPerformAction` comment corrected.
6. **U3 (LLM judges)** — one retry on **parse-failure only** in
   `callAssessor`/`callChronicler`. D14's no-retry rule was about never
   risking a DOUBLED delta; a definitive parse failure applied nothing, so
   one retry cannot double. Empty-window no-ops still never retry.
7. **U4 (comment)** — fixed in the same edit as B6.

## 5. Pass 2 — the hunger pass (B1 + B2 + B3), 2026-08-17

One coherent pass over the food/hunger system; all three findings were the
same root design bug wearing three hats.

1. **B1 (Eat chip on Day 1)** — `'ingredient'` joined `EDIBLE_CATEGORIES`
   (`inventory.js`). Ingredients ARE food — every edible one already carried
   real `consumable` values and was eatable via the bag's Use verb, but the
   chip and picker excluded the whole category, so a new player with a full
   fridge/pantry got no Eat chip (and the stove is broken day one, so
   cooking wasn't a bridge). `edibleDef` still requires non-empty
   `consumable`, so flour/sugar/garlic/butter stay inedible. The chip, the
   picker and the bag's Use verb now read the same rule.
2. **B2 (labels were lies) — made the numbers REAL** rather than hiding
   them. The old hunger branch discarded the item's size entirely: any
   positive delta reset `hoursSinceLastMeal` to 0, so a cracker "fed you
   exactly as much as +40" and every food label was fiction. Now eating adds
   the item's `consumable.hunger` (× serving/freshness) to current satiety,
   capped at `satietyStart`, and recomputes `hoursSinceLastMeal` from the
   result — a snack tops you up, only a real meal refills you, and a big
   meal on a full stomach wastes its size. DoorDrop's menu now shows the
   per-serving restore for multi-serving dishes (a 4-serving pizza says
   "restores ~14 per serving", not "restores 55"). NPC hunger is untouched
   (it was always a real bar).
3. **B3 (overnight drain) — sleep slows the hunger clock.** New
   `SLEEP.hungerMultiplier: 0.5`: `doSleep` passes `{ sleeping: true }` to
   `decayPlayerNeeds`, which scales only the hunger span by 0.5 (energy /
   hygiene / mood / desire decay normally). An 8-hour night costs ~4 hours
   of waking hunger: dinner → wake "peckish" (~60 satiety) instead of
   "starving" (0-7%). Skipping dinner still hurts — you wake at ~15 — so the
   rhythm's pressure survives; it just stops being a sleep tax.

Design intent preserved: the meal-based rhythm (D1), the mealsToday cap,
and "no action restores a need from nothing" (real items must be consumed).
The `mealsWellFed`/`mealsSkipped` mood terms are unchanged.

No items remain on the Bad list. All 7 Bad + 4 Ugly findings from the
original audit are now fixed across passes 1-2.

## 6. Verification record

| Date | What | Result |
|---|---|---|
| 2026-08-17 | U1 live repro (pre-fix) | Confirmed — phone pane stayed "Select a conversation." |
| 2026-08-17 | U2 live repro (pre-fix) | Confirmed — 2× `#cs-chat-input`, `getElementById` → computer's. |
| 2026-08-17 | Pass-1 fixes applied | **All verified live.** U1: phone thread click now repaints the pane (log + input + active row appear). U2: with both devices open, a phone send reads the phone's input (computer's "WRONG-COMPUTER" untouched). B4: fresh-game `initUpgradesState` gives both bathrooms `functional`/100 and `isFacilityFunctional` true; stove stays broken. B5: `GIG_ENERGY_PER_BLOCK`=5, low-state focus floor 0.385 (was 0.2), fresh 0.7, entry pay 28/40/48, "Work efficiency: 55%" note renders. B6: `gig.deliver` now exempt, work still gated. B7: RoomList reads "Rent: 1900/wk total". Final `browser_refresh`: zero perchance/syntax/console errors. |
| 2026-08-17 | Pass-2 fixes applied | **All verified live.** B1: `edibleStacks` finds the seeded kitchen groceries (Eggs/Cheese/Rice/Onion/Potatoes/Tomato Sauce on the day-6 save), `hasEdibleFood` requirement passes, and a real chip→picker→eat run consumed Rice and moved the player from hunger 6→18 (hours 16.7→14.5, mealsToday 0→1). B2: partial-restore math spot-checked (snack at starving +10 → 20; meal +40 → 50; feast +55 → 65; negative delta inert; near-full meals cap at 90); DoorDrop renders "restores 13 hunger per serving (serves 3)" for multi-serving dishes. B3: `decayPlayerNeeds(…, 480, {sleeping:true})` yields 4h (satiety 70) vs 8h (satiety 50) awake. Final `browser_refresh`: zero perchance/syntax/console errors. |
| 2026-08-17 | U5: Load-menu Delete fix | **Fixed + verified live.** Root cause: `#modal-overlay` sat at `--z-overlay` (200) and `.inventory-panel` (the container of the Save/Load menu) ALSO sat at 200 and painted later in the DOM — so the Delete/Load/Overwrite confirm dialogs opened *behind* the panel, invisible to the player and unclickable (real hits landed on the panel's `DIV.svp-card`; `.click()` in automation bypasses hit-testing, which is why the mechanism looked fine). Fix: `#modal-overlay` raised to the `--z-modal` tier (300). Verified: hit-test at the confirm button's coords now returns `BUTTON.btn`; end-to-end delete of a throwaway `manual_9` slot through the real UI removed the record + index entry, closed the modal, and re-rendered the card as "Empty slot". Final `browser_refresh`: zero perchance/syntax/console errors. |
| 2026-08-17 | U6: picker-race eating fix (pass 3) | **Fixed + verified live.** Reproduced pre-fix (picker open across a real-time gap → live `currentGameState.player` detaches from the action's snapshot; eat leaves hunger at 0 and the meal unconsumed on the live state). Fix: `executeAction` binds `live = currentGameState` after the async `prepare()` await and routes every post-await mutation (effects, touched-room cleanup, meters, outfit, signal, facility decay, shared activity, paired act, vulnerable window) through it — same pattern `resolvePairedAct` already used. Verified post-fix, both fast path and with a 12s dawdle at the picker: eating a fresh `meal_pasta` at hunger 0 lands on the live state (hunger 0→40, hsm 20→10, mealsToday 0→1, stack consumed, header bar 0→40) with the modal closing and narration logging exactly once. Final `browser_refresh`: zero perchance/syntax/console errors. |

## 7. Pass 3 — the picker-race eating fix (U6), 2026-08-17

One finding, one root cause, one targeted fix.

**U6 (eating "does nothing")** — the Eat chip's flow is
`runRegisteredAction` → `executeAction` → `prepare()` (awaits the player's
pick in the eat/cook/set_meal pickers). While the picker is open the
continuous clock keeps running, and its heartbeat (every 5 game-minutes ≈
15 real-seconds of idle) rebuilds the player object while checkpoints
rebuild the whole state — so by the time the player clicks, the
`currentGameState` the UI renders and saves is a different object from the
`gameState` `executeAction` was handed. The effect application then mutated
the detached snapshot: the eaten food and the hunger restore "happened" on
an object nobody renders or saves, and the player saw the narration but a
hunger bar that never moved and a meal that never left the bag.

Fix: after the `prepare()` await, `executeAction` resolves the LIVE state
(`const live = currentGameState || gameState`) and routes every
post-await mutation through it — `applyEffects`, the touched-room
cleanliness refresh, utility metering, outfit, signal emission, facility
decay, shared-activity credit, the vulnerable/clothing window and the
paired-act resolver. This is the exact pattern `resolvePairedAct` already
used for the same problem ("write to the live object; the parameter stays
the fallback for harness callers"). On the fast path (no await gap)
`live === gameState`, so non-picker actions are byte-for-byte unchanged.
