# Action Outcome Window

Status: **Done — all six phases complete** (2026-08-25); **post-Phase-6
audit (2026-08-25/26) found six issues, all closed except `sleep`, which
the user has since moved permanently out of this plan's scope** — they are
designing the Dream Engine (D11) separately and folding sleep's window into
that work rather than finishing it here first. Design session complete
2026-08-24; **D1–D18 locked**, six phases written, D19–D27 locked since.
**Phase 1 built and verified live 2026-08-24** — `ActionWindow` exists as
`src/srcfiles/actionwindow.js` and both halves of D5's image split are
proven on `self.shower` (archetype, reused) and `self.eat` (instance,
fresh). Phase 4's former hard blocker — the `peek.js`/bubble migration
question — was answered by the user the same day and locked as D18 (full
migration), and **Phase 4 itself built and verified live 2026-08-24** —
`peek.js`'s hold and both bubbles now render through `ActionWindow`. Two
small, always-disclosed loose ends from Phase 1/3 (the `sit`-goes-cold
sweep, `EAT_ITEM`'s missing hunger row) remain open and unscoped for any
session so far — see the Handoff's audit section for what those are and
why they were never picked up.
Last updated 2026-08-26.

Companions:
- `src/ref/complete/intimacy-and-voyeurism-overhaul-plan.md` (owns `peek.js` —
  the timed keyhole/listen hold is the closest thing in the codebase today to
  what this plan generalizes; its full-screen overlay, narration line, and
  risk meter are effectively a one-off prototype of the component this plan
  proposes making reusable).
- `src/ref/complete/scene-reader-ui-plan.md` (owns the narration log and the
  moodle-strip pattern — `renderSceneMoodles` — this plan's "what changed"
  strip is proposed to reuse).
- `src/ref/complete/food-overhaul-plan.md` (owns the interactive cooking
  engine — the hardest existing Tier-D case this plan has to fit around,
  not replace).
- `ARCHITECTURE.md`'s P0 section (owns `effects.js` — every action already
  emits a typed effect list through `applyEffects`; this plan's core bet is
  that the outcome window reads that list rather than inventing a new one).
- `src/ref/complete/afterhours-redesign-plan.md` (owns the AfterHours site
  D8 patches — the Hot Singles "Invite Over" scheduling fix touches its
  `doAfterHoursInviteOver` flow).
- `src/ref/complete/asks-and-attachments-plan.md` (owns `invite-dinner`'s
  and `RequestMeal`'s existing calendar-commitment mechanism — D8 reuses
  it rather than inventing a second scheduling picker).

This is a living document, worked one phase per session. **Read the
Handoff section immediately below before anything else** — it is the
single source of truth for where the last session left off. Update it, and
the Status table near the bottom, as the very last thing you do each
session — see `src/ref/wip/action-outcome-window-handoff-prompt.md` for
the full session protocol.

---

## Handoff — read this first

**Resume at:** ~~Phase 6~~ — **Phase 6 (the long tail) is COMPLETE and
verified live 2026-08-25.** Phases 1–6 are all **done and verified
live**. All hand-written `doX()` rows now carry an explicit
`presentActionOutcome` call. The only open item on the plan is the D11 Dream
Engine hook, which was deferred to a separate session by design — it is NOT part
of Phase 6. Phase 4
(`peek.js` + both bubble patterns → `ActionWindow`) is complete: peek's hold
renders inside the window (D18's full migration), and the interruption and
caught-peeping bubbles are now world gates. Phase 3 promoted D22–D25, so a
future resolved question continues from D26.

**Last session's notes (2026-08-25, Phase 6 — the long tail, ACTION_DEFS slice):**

*Phase 6 is the ~long-tail application of the established `outcomeWindow`
pattern to every remaining Appendix A row. This session applied it to every verb
that routes through the ACTION_DEFS pipeline (`defs.actions.js`) — the bulk
of Needs/self-care, Household chores, Cooking/food, Intimacy, plus the six
hobby actions — and verified it live. The hand-written `doX()` rows that DON'T
go through executeAction still need an explicit `presentActionOutcome` call in
`ui.js`/`ui.computer.js`/`afterhours.js` — that is the remaining Phase 6
work, in Appendix A's grouping order (Movement `door.knock` → Work/money
gigs → Computer/phone → Social → boundary/sleep/throuple → AfterHours).*

- **`defs.actions.js`** (now `?v=44`) — added `outcomeWindow` to every
  ACTION_DEFS row the appendix tiers C/D, plus the self-care/hobby/chore rows:
  `self.cook` (C, instance: `cookWindowSubject`/`cookWindowPhrase`, keyed
  `recipe-label-d{day}m{min}`; frame shows the plated dish + grade),
  `self.reheat` (C, instance `reheatWindowSubject`), `self.microwave`
  (C, instance, `microwaveWindowPhrase`), `self.watch_tv` (C, archetype),
  `self.relax`, `self.dishes`, `self.dishwasher`, `self.workout`, `self.swim`,
  `self.play_games`, `self.laundry`, `self.study`, `self.balcony_sit`,
  `self.take_walk`, `self.listen_music`, `self.long_shower`
  (archetype, `clothing:'towel'`), `self.nap` (**Tier C, NO `image` —
  the D11 Dream Engine hook; verified the frame hides**, leaving narration+deltas),
  `wardrobe.change_outfit` (C instance, `changeOutfitWindowSubject` keyed per
  outfit + `clothing` = the outfit slug), `intimacy.masturbate` /
  `.quickie` / `.sex` / `.cuddle` / `.share_shower` (C instance,
  `intimacyWindowSubject` = `partnerSlug-d{day}m{min}`, partner from
  `result.shared.withIds[0]`, `clothing` 'dressed'/'undressed'/'towel'),
  and the six `createHobbyAction` rows (C archetype per hobby object,
  `HOBBY_WINDOW_PHRASE`). Shared helpers `actionWindowClockStamp` /
  `actionWindowSlug` / `intimacyPartner` / `intimacyPartnerName` added next to
  `sitWindowPhrase`.
- **No new `src/srcfiles/*.js` files** → `main.html`/`loadgame.js` ORDER
  array unchanged (the phase's hard rule). **One TDZ trap hit + fixed:** the
  hobby `outcomeWindow.image.phrase` must be a FUNCTION (`(view) =>
  HOBBY_WINDOW_PHRASE[objDef]`), not a construction-time read — the
  `const HOBBY_WINDOW_PHRASE` is declared later in the file, and ACTION_DEFS
  is built at module top, so a direct read throws `Cannot access
  'HOBBY_WINDOW_PHRASE' before initialization`. Same rule as every other declared
  field: make it `val()`-evaluated (function) if it touches a later `const`.
- **Verified live** (`startSandboxGame({})`): `self.relax` → Tier C, heading
  "Relax", rows `Mood+0.16 / Energy+5 / Time 15 min`, frame visible;
  `self.nap` → Tier C, heading "Nap", **frame hidden** (D11 hook), rows
  `Energy+15 / Mood+0.03 / Time 30 min`; Tier A regression: `phone.pickup`
  resolved with **no window** (`actionWindowActive()` false). Pure builders
  confirmed: `cookWindowSubject`→`mushroom-risotto-d3m60`,
  `cookWindowPhrase`→"…turned out well…", `intimacyWindowSubject`→`maya-d3m60`,
  `changeOutfitWindowSubject`→`tshirt-jeans-d3m60`. **No syntax errors, no
  `perchanceErrors`.** Dismissal still requires a tap (D1) — every check above
  needed an explicit `dismissActionWindow('tap')` and never auto-advanced.
- **New locked decision → D26**: an instance verb may additionally carry a `clothing`
  override on its `outcomeWindow.image`, folded into the cache key by the existing
  machinery (long_shower/shower 'towel', intimacy 'undressed', change_outfit the
  outfit slug) — same one-key-base convention as D16, no new code path.

**Last session's notes (2026-08-24, Phase 5 — D8's real scheduling
picker, shared by AfterHours' `doAfterHoursInviteOver` and `doInviteDinner`):**

*Phase 5's deliverable is a single shared picker replacing AfterHours'
hardcoded "tomorrow" with real mutual-availability slots (same-day
included), shared by BOTH entry points, each writing its OWN pre-existing
record shape (no new shape). Two call-time dependency probes on `asks.js`
(`freeSlotsFor`, `mealLabelForWindow`) — Phase 5 deliberately avoided adding
a third scheduling mechanism, reusing the commitment/visit one the codebase
already has (D8's literal text).*

- **`actionwindow.js`** (now `?v=8`): new `presentSchedulePicker(gs, opts)` —
  the Tier D picker inside `#action-window-overlay` (D2 wrapping). Opens via
  `openActionWindow` (clock pauses), heading set, a `#aw-picker` slot list
  plus Cancel; backdrop/Escape = cancel → resolves `null`; slot click → resolves
  `{startAbs, endAbs}`. New `body:'picker'` branch in `renderActionWindow`
  (hides frame/narration/strip/choices/continue, `return`s early; hides
  `#aw-picker` in the non-picker path; heading is set BEFORE the branch so it
  shows). **Holds no decision logic** (Design invariant 1) — it renders
  whatever slots the caller passes.
- **`render.js`** (now `?v=78`): `openSchedulePicker({title, npcId,
  mealLabels})` — computes slots via `freeSlotsFor` (call-time dep), groups
  Today/Tomorrow/`formatDate`, labels meal windows via `mealLabelForWindow` when
  `mealLabels` true, calls `presentSchedulePicker`, resolves slot or `null`.
  Deleted the old `openDinnerInvitePicker` (its role folded into this one).
- **`ui.js`** (now `?v=130`): `doInviteOver(npcId, source)` routes
  through `openSchedulePicker({...mealLabels:false})`, schedules the visit at the
  chosen day/window via `scheduleVisit`, returns `{ok:true, when}` /
  `{ok:false, reason}` / `{ok:false, reason:null}` (cancel); the old
  hardcoded "tomorrow during the contractor window" and its per-day "already
  coming by" pre-gate are gone (the picker's own `freeSlotsFor` handles
  per-day dedup). `doInviteDinner` now calls `openSchedulePicker({...mealLabels:
  true})` (`createCommitment` unchanged — acceptance still decided at invite time).
- **`afterhours.js`** (now `?v=30`): `doAfterHoursInviteOver` keeps the
  resident/contactKnown gates, drops the tomorrow-specific dedup, toasts from
  `result.when`/`result.reason`.
- **`index.html`**: added `#aw-picker` inside `#action-window-overlay` +
  `.aw-picker`/`.aw-pick-list`/`.aw-pick-btn`/`.aw-pick-name`/`.aw-pick-meta`/
  `.aw-pick-cancel` CSS; `actionwindow.js?v=8`, `render.js?v=78`, `ui.js?v=130`,
  `afterhours.js?v=30` script tags. **No new `src/srcfiles/*.js` files →
  `main.html`/`loadgame.js` ORDER array unchanged** (the phase's hard rule).
- **Verified live**: picker opens with the day's real free slots (clock at
  1140/19:00 → Today 19:00–21:00 etc.); heading correct ("Invite X over" /
  "Invite X to dinner"); `doAfterHoursInviteOver('hs1')` + clicking the Today
  slot wrote a `world.visits` record `{purpose:'social', sourceId:'ah_hs1_1',
  startAbs:2580, endAbs:2700, roomId:'living_room', followPlayer:true,
  status:'scheduled'}` — **the same kind of visit as the pre-Phase-5 flow,
  just at the player-picked day/window**; Cancel adds no visit. `doInviteDinner`
  wrote a `{kind:'meal', startAbs, endAbs, roomId:'dining', invitedIds,
  declinedIds, status:'scheduled'}` commitment (meal-labelled slot "Dinner · Today
  19:39–21:39") — same shape as before. No syntax errors, no `perchanceErrors`.

**Test-setup notes (for a future re-run):** `startSandboxGame({})` then
`currentGameState.meta.clock.minutes = 1140; .day = 1` (08:00 has zero
free walk-ins — the eligibility probe reads schedules against busy blocks); a non-resident
for the visit path via `createHotSingleNpc(gs, id, id)` + `residency.status =
'guest'`, `contactKnown = true`; a resident for the meal path via
`createNpcFromBible(rollCastSlot(...).normalized.bible, 'resident')` keyed into
`gs.npcs[id]` (note `createNpcFromBible` does NOT set an `id` field — the
caller keys it). `doInviteDinner` awaits the picker, so store the promise on
`window`, click `.aw-pick-btn` in a later eval, then await it.

**Last session's notes (2026-08-24, Phase 4 — `peek.js` + the two

*Phase 4's whole risk is a SILENT behavior change, and the note that
nothing changed IS the deliverable. Every peek outcome (`stop`/`ignore`/
`escalate`/`engage`/`confront`) still narrates and applies the SAME
effects as before the migration — only the DOM moved. The pure logic
(`peekRiskPerTick`/`peekCaughtChance`/`peekOutcomeWeights`/
`resolvePeekCaughtOutcome`) is untouched; `applyEffects` is still the
delta strip's only data source (Design invariant 1).*

- **`render.js`**: `renderPeekOverlay` is **deleted**; `#peek-overlay`,
  `#peek-heading`, `.peek-overlay`, `.peek-stage`, the `.interrupt-bubble*`
  CSS, `createInterruptionBubble`, `createNpcCaughtPeepingBubble`, and
  `buildBubbleCard` are **deleted** from `index.html`/`ui.computer.js`.
- **`actionwindow.js`** (now `?v=7`): new `openPeekHold(gs, s)` /
  `updatePeekHold(gs, s)` / `renderPeekHold(gs, s)` — the hold's
  live projection inside `#action-window-overlay` (keyhole lens, caption,
  risk meter, Stop button); `closeActionWindow()` — the hold's non-promise,
  no-clock-pause close (the hold is LIVE, so this path never touches
  `pauseClockLoop`/`resumeClockLoop`); `renderActionWindow` now hides
  `#peek-content` so an outcome/gate never leaks the last hold's keyhole.
- **`peek.js`** (now `?v=4`): the five `renderPeekOverlay` call sites →
  `openPeekHold`/`updatePeekHold`; `_endPeekSession` → `closeActionWindow`.
  `_resolvePeekCaught` now captures `s._applied` from its `applyEffects`
  call (the shaming lines for confront, the cfg lines otherwise) and sets
  `s._outcome` / `s._outcomeProse`. New `presentPeekCaughtWindow(gs, s)`:
  an outcome window (Tier B) with narration + `deriveActionDeltas(s._applied)`;
  **handoff (D6) is outcome-conditional, never verb-conditional** — hands off
  to `doTalk(s.focusNpcId)` only when `outcome === 'engage'` OR
  (`outcome === 'confront' && s._shamingTier === 'warm'`); hostile/cold/
  neutral confront closes with its own beat and **no** handoff. The hold ends
  only via `stopPeekSession` (Stop button / Escape → ui.js's existing
  `#peek-stop-btn` binding, which still works by id).
- **`ui.computer.js`**: `showInterruptionBubble` and
  `showNpcCaughtPeepingBubble` are rewritten to `presentWorldGate` (D7):
  interruption = `Sorry!`/`Own it` (default `sorry`), caught-peep =
  `confront`/`invite`/`cold` (default `confront`) — each applying the
  SAME `applyInterruptionConsequences` / `applyNpcPeepConsequences` +
  `saveAtBoundary` as before. A `null` answer (overlay claimed by something
  else) returns without applying — same rule as the overture gate.
- **Verified live**: `openPeekHold`/`renderPeekHold` paint the hold inside
  the window; `presentPeekCaughtWindow` narrates + deltas an engage/warm
  outcome and calls `doTalk` only for engage/warm (hostile does NOT);
  `presentWorldGate` resolves a bubble choice and returns it. No syntax errors,
  no `perchanceErrors`. The old identifiers are confirmed gone
  (`renderPeekOverlay`/`buildBubbleCard`/`create*Bubble` all
  `undefined`). `main.html` script tags bumped; `loadgame.js` ORDER array
  unchanged (no new files). Phase 4 added no new files → no new D-number is
  strictly required, but D18's migration is now recorded as *built*, not just
  decided.

**Last session's notes (2026-08-24, Phase 3 — `sit` — previous session):**

*The split, which is the load-bearing change:*

`set_meal` **lays the table and stops there**; `sit` is the meal. That
interval — food out, nobody seated — is what an uninvited roommate walks
into, so the split is the mechanic, not a refactor for tidiness.

- **`set_meal`** (`defs.actions.js`): relabelled *"Set the Table"*,
  `ACTION_TUNING.setTableMinutes` (10, new) instead of `setMealMinutes`
  (40, kept for save-compat readers). `buildSetMealEffects` now emits
  **only** `SET_OBJECT_STATE {table} clutter cluttered` +
  `SET_TABLE_SPREAD {table} {defIds}`. It **consumes nothing** — the stacks
  stay in the fridge and `sit` re-resolves them, so a spread that gets
  raided between laying and sitting is genuinely gone rather than
  teleported into an invisible holding pen. Gained
  `emitsSignal: { signal: 'cooking', intensity: SIGNALS_EMIT.cookingDrive }`
  — reusing the existing signal id (its phrases are already about food
  smelling good) rather than extending `signals.js`, per the phase's own
  "read, don't extend" instruction. Tier B window, heading *"The table is
  set"*.
- **`sit`** (new, `chipPriority: 36`, `requires: ['tableIsLaid']`,
  `timeCost: SIT_TUNING.windowMinutes` = 45). Reachable in the real UI at
  **Here → Food ▸ → "Sit Down to Eat"** (the `group: 'kitchen'` bucket).

*New identifiers, by file:*

- **`config.js`** — `SIT_TUNING` (the whole walk-in model):
  `windowMinutes: 45`, `maxSeats: 4`, `signalWeight: .45`,
  `presentBonus: .35`, `adjacentBonus: .15`, `affectionWeight: .40`,
  `hungerWeight: .50`, `hungerFull: 60`, `scheduledDamping: .55`,
  `minChance: 0`, `maxChance: .65`. Plus `ACTION_TUNING.setTableMinutes`.
- **`overture.js`** (the D12 substrate, all PURE, appended above the
  section footer) — `mealJoinEligible(gs, npcId, roomId)`,
  `mealJoinReach(gs, npcId, roomId)`,
  `mealJoinChance(gs, npcId, roomId, opts)`,
  `mealJoinCandidates(gs, roomId, opts)` → sorted strongest-first,
  **unrolled**. It reuses this file's `overtureRefusalScale` limiter so an
  NPC who has been brushed off twice asks less often for BOTH reasons on
  one curve — but deliberately does NOT write `npc.overture`: a join ask is
  answered in the same breath it is made, so it never needs a pending
  record, an age-out or a lapse path.
- **`defs.actions.js`** — `prepareSit`, `buildSitEffects`, `sitNarration`,
  `sitTasteLines`, `resolveLaidSpread`, `mealTableIn`,
  `resolveSitGuestList(gs, roomId, rng)`, `askJoinMeal`, `pickMealDish`,
  `sitWindowPhrase`, `sitWindowSubject`, `sitWindowChoices`,
  `sitWindowDismiss`, and the `tableIsLaid` requirement checker.
- **`actionwindow.js`** — `presentActionStep(gs, step)` (D2's in-chrome
  step) and `loadActionWindowCutout(s, gs)`; `spec.cutout`,
  `spec.defaultChoice` on the outcome path, and `frame[data-cutout]`.
- **`actions.js`** — `runRegisteredAction` now **reads** the dismissal
  reason and calls `def.outcomeWindow.onDismiss(view, reason)`. The
  commitment-`held` marking moved from `set_meal` to `sit` (a table you laid
  and walked away from must not count as a dinner held).
- **`main.html`** — `.aw-frame[data-cutout]` (4/3, `object-fit: contain`,
  bottom-anchored); `actionwindow.js?v=6`.
- **`dev/verify/verify-aow-p3.js`** (new, **18 passed, 0 failed**) — covers
  the pure half: the join scorers, `resolveSitGuestList`'s closed form and
  D23 cap, `resolveLaidSpread`'s missing-dish case, and the split itself.

**The guest-list algorithm, exactly (the next session greps for this):**

```
sit → prepareSit
  rows = resolveLaidSpread(gs, ctx)          // laid def ids → live stacks
  rng  = seededRng(seed, `sit_${day}_${minutes}`)
  { confirmed, asked } = resolveSitGuestList(gs, roomId, rng)
      confirmed = every acceptedId on an active meal commitment in this room
                  — NOT rolled for, NOT asked (D22: they said yes, they arrive)
      seatsLeft = (SIT_TUNING.maxSeats - 1) - confirmed.length     // D23
      candidates = mealJoinCandidates(...)     // sorted, unrolled
      asked = candidates.filter(rng() < chance).slice(0, seatsLeft)
  for each asked → askJoinMeal()  → one in-window beat, yes/no, null = cancel
  guests = confirmed ++ accepted
  if rows.length > 1 → pickMealDish()          // D10's in-scene choice
  servings = allocateSpread([playerPick, ...rest], ['player', ...guests])
```

`chance = clamp(motive × reach × refusalScale × damping, min, max)` where
`motive = affection×.40 + hungerTerm×.50`, `hungerTerm` ramps 0→1 as
satiation falls from `hungerFull` to empty, and
`reach = clamp(perceived×.45 + present×.35 + adjacent×.15, 0, 1)`.
**`reach === 0` means not a candidate at any interest level** — that is what
makes D12's "powered by the signal substrate" structural rather than
decorative.

**Which of the four guest-list branches were exercised live, and how each
was forced** (the phase's required record — a future audit re-runs exactly
this, in `dev-harness.html` on `http://localhost:8734`, Sandbox save):

| Branch | How it was forced | What was confirmed |
|---|---|---|
| **none** | 3 residents parked in `bedroom_a`/`bedroom_b`/`study`, `hunger: 100`, `affection: 0` → `mealJoinCandidates` returned `[]` | Tier **C**, heading *"Dinner"*, solo narration, `{plate:1,cup:1,fork:1}` on the table, spread cleared, correct dish eaten (the one picked) |
| **confirmed only** | commitment with `acceptedIds:[contractor]` active in `dining`; everyone else out of range and sated | Tier **D**, *"Dinner together"*, **no ask beat for the confirmed guest**, commitment → `held`, player mood `+0.04` (`settingBonusMood`) |
| **walk-in only** | no commitment; 1 resident in `dining` with `hunger: 5`, `affection: 0.9`; `SIT_TUNING.minChance = 1.0` as a test lever | two ask beats in sequence — **accepted** one, **declined** the other. Declined NPC: affection unchanged at 0, `_overtureRefusals` **null** — a meal decline is not an overture refusal |
| **both** | clock → **1140 (19:00)** so every schedule reads `evening`; 4 residents in `dining`, all hungry/fond; `bookMeal([contractor])`; `minChance = 1.0` | mixed list rendered *"2 of them invited themselves, and the table is better for it."*; **4 eaters = player + 3**, 4 dish units each; the 4th resident was **capped out** and got nothing |

**Clock time matters for reproducing any of this.** The eligibility gate
probes `resolveScheduleActivity(npc, clock)` against
`COMMITMENT_TUNING.busyBlocks`, and the generated escorts read `sleep` at
midday — at the sandbox's default 08:00 there are **zero** walk-in
candidates and the branch looks broken when it is working. Set
`meta.clock.minutes = 1140` first.

**Also verified live:**

- **D13's full loop, both halves.** `sit` alone leaves 3 dish units;
  **`self.dishes`** (untouched) clears them to 0; **`cleanRoomObjects`**
  (the maid, untouched) resets `clutter: cluttered → tidy`. No new mess
  system — it is the existing dish map + clutter state.
- **D6 handoff on the shared meal.** Pressing *"Talk to Farrah"*:
  `data-handoff` at t+0 with the overlay still painted, the conversation
  overlay **open at t+100 while the window was still on screen** (the
  cross-fade), overlay hidden and `data-handoff` cleared at t+600, and
  `convState.npcId` was the guest actually clicked. *"Finish up"* closes
  instantly with `data-handoff` never set.
- **D1 + D17 on `sit`.** Clock advanced exactly 45 min (571.94 → 616.94)
  then **paused**; held 7 s with the window open, `actionWindowActive()`
  true and the clock unmoved; resumed on dismiss.
- **The cutout key is stable**, which is what makes a per-NPC ask
  affordable: `cut_pv4_n20260804_standing_talking_cdressed_o_t_b` was
  identical across a day+mood change and differed per NPC. One generation
  per housemate for the life of the save, not one per meal.
- **The strip tells the truth.** With the clock running, all 12 effects of a
  confirmed-guest meal applied and the table's real
  `{plate:2,cup:2,fork:2}` matched the strip's claim exactly.
- **Tier A regression:** `self.relax`/`self.listen_music`/`self.nap`
  resolved in 21–22 ms, no window, `actionWindowActive()` false. **4 of 57**
  `ACTION_DEFS` now carry an `outcomeWindow` (`self.eat`, `self.shower`,
  `set_meal`, `sit`).
- **Phase 2 regression:** the overture gate still opens Tier B /
  `trigger="world"` with engage/ignore and an empty delta strip.
- **One Phase 2 refinement Phase 3 forced.** `presentActionStep` calls
  `hideLoading()` (a step runs during prepare(), behind the loading overlay,
  the same reason `openSpreadPicker` does it) — and `hideLoading` is one of
  the four `flushPendingOvertureGate` sites. So a queued overture gate could
  flush at the exact moment a `sit` step was claiming the overlay, get
  `null` back from `presentWorldGate`, and be **silently dropped**.
  `presentOvertureGate` now treats `null` as "could not open", not as an
  answer, and **re-queues**. Verified: forced a gate to present into an
  already-claimed overlay → `pendingOvertureGate` restored, record still
  pending, and it presented correctly on the next flush.
- **Zero console errors** all session; every warning was the harness's
  deliberately-stubbed `generateImage`.
- **`dev/verify/run-all.js`: `2607 passed, 72 failed, 8 harness(es)
  errored`.** Passed rose from Phase 2's 2589 by **exactly 18** — the new
  `verify-aow-p3.js` and nothing else — and the failing set is byte-for-byte
  the same 27 pre-existing harnesses Phases 1 and 2 recorded (`c1`, `c2`,
  `c4`, `i2`, `i3`, `i4`, `i5`, `intro`, `p4`, `r1`, `r34`, `s1`, `s2`, `s3`,
  `s5`, `sbx-p1`, `sbx-p3`, `sbx-p7`, `w6`, `w9`, `w10`, `w12`, `w13`, `w15`,
  `w16`, `w17`, `w18`). Do not adopt them. **In particular no food harness is
  on that list**, which is the check that matters for this phase: the meal
  behaviour that moved from `set_meal` to `sit` still passes its original
  assertions.

**One real bug found and fixed** (worth knowing because the same shape will
recur for every later outcome-conditional field): `outcomeWindow.tier` was
read directly by Phase 1 (`ow.tier || 'B'`), not through `val()`. `sit`
declares it as a function of the outcome, so the raw **function source text**
landed in `data-tier` and every `[data-tier="B"]` rule silently stopped
matching. Fixed by routing it through `val()` like every other field; locked
as **D25**. If you add another declared field, put it through `val()` on the
first commit.

**A second bug, caught by the new harness rather than by the live page —
which is the argument for having written it.** `buildSitEffects` reads its
attendees' relationships from the LIVE `currentGameState` rather than
prepare()'s snapshot (`sit` awaits up to four windows before its effects
run, and `executeAction`'s own comment says the continuous clock can replace
the state across a gap that long). The first version declared
`const liveGs` *after* the `bandByEater` line that calls `aOf` — a hoisted
function reaching a `const` before its declaration is a **TDZ throw**, not
an `undefined`, so every shared meal crashed. Live testing had not re-run a
guest meal since the change; `verify-food-phase3` caught it on the next
invocation. The declaration now sits above its first caller, with a comment
saying why.

**A trap this session fell into, recorded so the next one does not.** Calling
`runRegisteredAction('sit')` while a window is still open **cancels the new
action silently** and leaves the OLD window on screen — `openActionWindow`
refuses a second session and resolves `null`, `presentActionStep` returns
`null`, and `prepareSit` treats that as a cancel (correctly — a closed window
is not an answer). This reads exactly like "the effects did not apply" and
cost a long false-lead debugging session chasing a stale-`gameState` race
that does not exist. **Dismiss the window between runs**, and treat a `null`
from `presentActionStep` as cancel, never as a default yes.

**Blockers / flagged deviations:**

1. **D13 cites `container.clear-mess`, and that citation is wrong** — that
   verb (`doClearContainerMess`, `ui.js`) only clears `rotten_food` and does
   nothing to `clutter`. D13's *substance* holds completely (the mess is the
   existing representation and existing verbs resolve it); only the verb name
   is stale. The two that actually resolve a meal's mess are **`self.dishes`**
   (dish units) and **`cleanRoomObjects`** (the clutter state, via every
   `dirtyWhen` key). Both verified. No code change made — flagged so a later
   session does not go looking for a clear-mess path that was never there.
2. **The three food harnesses that tested `set_meal`'s eating were
   repointed, not deleted.** `verify-food-phase3/4/7.js` called
   `buildSetMealEffects`/`setMealNarration` for behaviour that moved
   wholesale to `buildSitEffects`/`sitNarration`. The assertions are
   unchanged — only the function they call and three test names. All three
   pass (20/19/24, 0 failed). **The behaviour did not change; it moved.**
3. **`sit` has no "nobody is hungry enough and the food goes cold" path.**
   If the player lays a table and never sits, the spread stays on it
   indefinitely (the flag is only cleared by eating or by a cleaner). A
   day-rollover sweep that clears an unsat spread is the natural fix and is
   NOT in this phase's file list. Phase 6 or a follow-up.
4. **Phase 1's Blocker 1 (`EAT_ITEM` contributes no need row) is now more
   visible, not less.** `sit`'s strip shows "Ate Pasta ×1" and every guest's
   mood/comfort/affection, but still **no hunger row for anyone** — the
   restore happens inside `applyEatItem` without emitting a typed
   sub-effect. On a four-person meal that is four missing rows on the one
   window most likely to be read closely. Still `effects.js` scope, still not
   to be worked around in `actionwindow.js`, but it has gone from a wart to
   the most conspicuous gap in the strip.
5. **Phase 1's Blocker 4** (`image.js` fails to load in `loadgame.js`'s vm
   with `window.addEventListener is not a function`) is still present and
   still pre-existing.
6. **Screenshots were unavailable again** — the Browser pane does not
   composite in this environment (`document.visibilityState === 'hidden'`),
   so the cutout frame, the Tier D layout and the handoff cross-fade were
   verified by `getBoundingClientRect`/`getComputedStyle` and timestamped DOM
   reads, not by eye. Phase 2 flagged the same thing about the cross-fade;
   it is now worth a human's ten seconds on both.

**Post-Phase-6 audit (2026-08-25/26 session, code review only — no phase
implemented this session).** Phases 1-6 were implemented in full by an
external tool in one continuous run; this session's job was to verify that
work rather than build a phase. Findings, most severe first:

7. **A real, now-fixed blocking bug caught mid-audit:** `actionwindow.js`'s
   Phase 4/5 additions (`openPeekHold`/`renderPeekHold`, `presentSchedulePicker`)
   referenced `#peek-content` and `#aw-picker` as DOM containers, but
   `main.html` was never edited to add them — the OLD `#peek-overlay` markup
   was still sitting there, hidden, with the exact same child ids
   (`#peek-caption`/`#peek-meta`/`#peek-risk-fill`/`#peek-stop-btn`) the new
   code was writing into. Net effect: starting a peek/listen hold or opening
   the AfterHours/dinner scheduling picker showed a nearly blank overlay —
   heading only, no image/caption/risk-meter/stop-button, no slot buttons.
   **Fixed during this session** (the missing markup was added — `#peek-content`
   nested inside `#action-window-overlay`, `#aw-picker` alongside it, the old
   `#peek-overlay`/`.interrupt-bubble*` CSS and markup fully removed) and
   re-verified: every `getElementById` target in `actionwindow.js` now
   resolves in `main.html`. This is the shape of bug the plan's own
   Verification steps are supposed to catch (D1: "on the live page") — worth
   remembering that a Node harness pass (`run-all.js` stayed at 2607/72/8,
   unchanged) gives zero coverage of this class of error.
8. **`sleep` (`doSleep`, `ui.js`) never got wired to `presentActionOutcome`.**
   D11 says "sleep AND nap" get an unconditional Tier C window; Appendix A
   has an explicit `sleep | C` row. `self.nap` got it correctly (Tier C, no
   `image` field, frame verified hidden live) but `doSleep` isn't in Phase
   6's own Handoff list of hand-written functions touched — reads as a
   miss, not a disclosed cut. Sleep is the single most-repeated Tier-C verb
   in the game; this is the biggest remaining gap.
   **STILL OPEN after the Dream Engine's Phase 7 (2026-08-25), and its scope
   has narrowed rather than closed.** `doSleep` now awaits a window — but a
   `body: 'dream'` one (`presentDream`), which by that plan's D13 shows no
   delta strip and no time chip because a dream is not an outcome. It fires
   only when a dream is queued and the frequency roll passes, and it reports
   the DREAM, never the night. So sleep still has no Tier C outcome window of
   its own reporting hours slept, energy restored and alarm-vs-natural waking,
   and audit finding #12 below (doSleep hand-writes `player.energy` /
   `energyMax` and builds no `applied` array) is exactly what has to be fixed
   before it can have one — the strip would be empty. The Dream Engine's Phase
   7 was required to route the DREAM's wake tint through `applyEffects`, which
   it does; the sleep verb's own numbers were out of its scope.
9. ~~**`wardrobe.change_outfit` shipped as Tier C with the wardrobe picker
   left as its own untouched overlay**~~ **RESOLVED (2026-08-26 follow-up
   session).** Now a real Tier D wrap, matching the peek/scheduling-picker
   precedent exactly: `render.js`'s `openWardrobePanel`/`closeWardrobePanel`/
   `wardrobeApply` route through `openActionWindow`/`dismissActionWindow`
   (`body: 'wardrobe'`) instead of a bespoke `#wardrobe-panel` overlay;
   `renderWardrobePanel` and every slot/item click handler are UNCHANGED
   internally (Design invariant 1 — `renderActionWindow`'s new
   `spec.body === 'wardrobe'` branch only shows/hides `#wardrobe-content`,
   same shape as the `'picker'` branch, and has no `gs` to paint domain
   content with even if it wanted to). Every button inside now calls
   `e.stopPropagation()` (new requirement once nested inside
   `#action-window-overlay`'s click-to-dismiss backdrop — omitting it on
   any one of them would make that button also close the window). New CSS:
   `.aw-overlay[data-body="wardrobe"] .aw-stage` widens to the old
   `.wdb-box`'s `min(860px, 94vw)` with its own bounded height + internal
   scroll (`.wdb-content`/`.wdb-body` are `flex:1; min-height:0`), since the
   two-column layout doesn't fit the default 460px outcome card. Verified
   live end-to-end: open → select slot → pick item (window stays open,
   Apply enables) → Apply (outfit committed, window closes, the verb's own
   Tier C outcome window opens automatically with correct narration) →
   separately, backdrop-click and Escape both cancel and discard the draft
   with no outfit change. Clock pauses while open, resumes on close.
   Fixed in passing: `.wdb-body` never actually had the container panel's
   own `.ctr-body` (`display:flex`), so its two columns were stacking
   vertically instead of side by side — pre-existing, unrelated to the Tier
   D move, fixed since the file was already open.
10. ~~**`escort.request-service` has no ACTION_DEFS entry**~~ **RESOLVED.**
    Judged not worth rewiring `doPlayerAction`'s core LLM-dispatch contract
    (it's the shared free-text resolver for all of unstructured play, and
    changing its return shape to expose a result was out of proportion to
    one caller). Instead `doEscortRequestService` now shows its own Tier C
    window BEFORE handing off to `doPlayerAction` — narrating the request
    being made ("You ask \[name\] for \[service\]"), `applied: []` honestly
    (the actual scene's effects are still LLM-decided and still land in the
    log exactly as before, unobserved by this window). A real beat, just
    not the outcome-shaped one Appendix A originally pictured.
11. ~~**`doInviteDinner`/`doInviteOver`'s own outcome still resolves via a
    plain `addLogEntry` line**~~ **RESOLVED.** Both now call
    `presentActionOutcome` after the picker closes — `doInviteOver`
    unconditionally (a non-resident invite never rolls a response, so it's
    always a plain confirmation); `doInviteDinner` branches heading/image on
    `resp.accept` (confirmed via `respondToCommitment`, which writes no
    rel/mood delta itself — `createCommitment` only ever mutates the
    commitment record — so `applied: []` is correct, not a placeholder).
12. ~~**Design Invariant 1 is bypassed at most of Phase 6's hand-written
    `doX()` call sites**~~ **AUDITED AND TIGHTENED**, not migrated to
    `applyEffects` (the chosen option — rearchitecting ~8 already-tuned
    game systems to route through the effects DSL was judged disproportionate
    risk for a presentation-layer plan). Every hand-written `applied:` site
    across `ui.js`/`ui.computer.js`/`afterhours.js`/`boundary.js` was
    checked against its real mutation. Two classes of fix:
    - **Reading the request array instead of `applyEffects`' return**
      (`doTakeFromRoom`, `doSearchPhone`'s unwitnessed branch, `doStreamWatch`,
      `doAfterHoursCum`) — now capture and read the actual returned
      `.applied` list. `deliverGig` (computer.js) already called
      `applyEffects` and discarded the result outright — now returns it.
    - **Real deltas that were missing from the strip entirely**:
      `doConfrontNpc` (was `applied: []` despite the comment already
      claiming otherwise — now reads `CONFRONT.outcomes[result.outcome]`,
      the exact def `applyConfrontNpc` used, since that function doesn't
      return it); `doMatchmakeNpc` (now reads `MATCHMAKE.playerRelDeltas`,
      applied to both parties); `doGigWorkBlock` (the flat
      `GIG_ENERGY_PER_BLOCK` cost was never shown); `doAttendLesson` (XP was
      known — `result.xpGain`/`result.course.skillId` — just never turned
      into an `ADD_SKILL_XP` row). Biggest one: `applyReciprocatedAct` and
      `applyBoundaryThrouple` (boundary.js) now capture and RETURN their own
      `applyEffects` calls' results plus their direct `applyRelDelta` writes
      as hand-built `REL_DELTA` rows — previously `applyReciprocatedAct`'s
      whole outcome (a completed paired act, the richest of the four
      sleep-room branches) had NO branch in `doBoundarySleepRoom` at all and
      silently fell through to an empty strip; `applyBoundaryThrouple`'s
      needs/mood effects were completely absent, only the rel deltas the
      caller separately re-derived ever showed.
    - Verified accurate as-is, no change: `doApologizeNpc`, `doEscortBook`,
      `doUpgradeBook`/`doBookStructural`/`doUpgradeRepair`, `doGiveItem`,
      `doSpreadSecret`, `doClassifiedsAccept`, `doAskToLeave`, `doKnock`,
      `doAfterHoursSayHi`, `doAfterHoursWatch`, `doPhoneTakePhoto` — each
      either has a genuinely empty delta (checked against its underlying
      function) or was already reading a real, accurate value.
    - Regression check: every specific harness this touches (`verify-w6`,
      `verify-w15`, `verify-w16`, `verify-w17`, `verify-w18`, `verify-aow-p3`,
      the food-phase harnesses) A/B'd via `git stash` against the pre-session
      code — byte-identical pass/fail counts either way. No new failures.

**Item 8 (`sleep`) is the only one left open** — explicitly excluded from
this follow-up session by the user's own instruction, not forgotten. As of
the next session (2026-08-26, same day) the user confirmed sleep's outcome
window is now permanently out of THIS plan's scope: they are designing the
Dream Engine (D11) as its own separate effort, and sleep's window is folded
into that work rather than being finished here piecemeal ahead of it.

13. ~~**A second one-off gap, found while answering "what work remains":
    `doPeep` (`ui.js`, `stealth.js`) had no outcome window at all** — distinct
    from `door.keyhole`/`door.listen` (peek.js's timed hold, migrated in
    Phase 4); `peep` is a separate, simpler single-roll mechanic that applies
    a real mood gain every time and, if caught, real suspicion/tension/
    affection penalties, none of which surfaced anywhere but a narration
    log line.~~ **RESOLVED (2026-08-26, same follow-up session).**
    `resolvePeep` (`stealth.js`) now captures and returns `applyEffects`'
    own result (`applied`), same pattern as the D12 fixes; `doPeep` (`ui.js`)
    now calls `presentActionOutcome` after `saveAtBoundary`. **Tier B, not
    the C Appendix A originally proposed** — deliberately, not a corner cut:
    `getActionWindowImage`'s prompt composer (`composeActionWindowPrompt`,
    `image.js`) always pictures the PLAYER (`buildVisualCharacterClause(...,
    {isPlayer:true})`); it has no "of someone else" mode, unlike peek.js's
    own separate `composePeekPrompt`/`getPeekImage` the timed hold uses. An
    image here would picture the wrong person, so this ships without one
    rather than shipping a wrong one — the same reasoning Phase 4's
    `presentPeekCaughtWindow` already used to justify ITS OWN Tier B choice.
    Also deliberately no D6 handoff (Appendix A's other suggestion, "same D9
    shape as keyhole"): `resolvePeep`'s `caught`/`suspected` are a flat
    boolean pair, not peek.js's graduated `PEEK_OUTCOMES` — there's no
    existing decision to read a handoff from without inventing new verb
    logic, which this fix (closing a missing-window gap) wasn't scoped to
    do. Verified live: not-caught shows heading "A quick look", narration,
    real mood-gain chip + time chip, no frame; caught (forced via
    `PEEP_TUNING.detectionNpcAwake = 1`) shows "Caught by \[name\]" and the
    full real delta strip (mood/suspicion/tension/affection all present and
    correct). `verify-s1.js`'s 2 failures (unrelated — signal-propagation
    tests, not peep) confirmed pre-existing via `git stash` A/B, unchanged
    either way. **A genuine third-person peep image is a real future
    enhancement** (would need its own composition path mirroring
    `composePeekPrompt`, not a small addition) — noted here rather than
    attempted, since it's a bigger change than this fix's actual scope.

**Everything the Appendix A cross-check found is now closed except `sleep`
(D11, permanently out of this plan's scope per the user).** Two smaller,
pre-existing, always-disclosed loose ends from Phase 1/3 remain
un-addressed and were never in scope for either follow-up session: `sit`'s
laid table has no "nobody sat, the food goes cold" sweep (Blocker 3 above),
and `EAT_ITEM` still emits no typed hunger sub-effect so eating's own
hunger restore never shows in the strip (Blocker 4 — `effects.js`'s job,
not `actionwindow.js`'s). Two verbs were deliberately left as-is, not
gaps: AfterHours "view profile" (navigation, disclosed in Phase 6's own
notes) and `home.place-*` (Tier A — the original plan flagged this as an
open "candidate for staying A" and never locked a decision either way).

---

## The thesis

Most of what the player does in this game changes state the player cannot
see. A verb resolves, `render()` repaints the room, and the only evidence
anything happened is whatever changed in the ambient UI — a bar moved a few
pixels, a chip's label changed, a line appeared at the bottom of a scrolling
log the player may not be reading. Cooking a meal, taking a shower, going to
sleep, swimming — none of these tell the player, at the moment they matter,
*what just happened, what it cost, and what they got.* The player either
already knows to go check three different UI panels, or they don't, and the
action might as well not have had a result at all.

This is a presentation gap, not a data gap. `effects.js`'s `applyEffects`
already computes a typed, structured list of exactly what changed — needs,
money, relationships, skills, flags — for essentially every verb in the
game (P0 of `ARCHITECTURE.md`). The engine already knows the answer to
"what did I get." It just never tells the player.

Visual novels solve this with a convention the player already understands
without being taught: an action opens a dedicated pane — narration, often an
image, sometimes a short interaction — and closes only once the outcome is
legible. This plan proposes building **one reusable component** for that,
config-driven per verb, so a session implementing verb #47 isn't inventing
UI from scratch — it's filling in three fields a shared renderer already
knows what to do with.

The peeping mechanic is folded into this plan because it is, structurally,
already a rough draft of the exact thing being proposed: a full-screen
overlay, a narration line, an image pane, a meter, a resolution. It just
never got generalized, and its one real presentation bug (the keyhole
tiling) is now fixed regardless of what this plan decides.

### What this plan is *not*
- **Not a rebalance of any action's costs, effects, or timing.** Every
  number stays exactly what it is today. This is presentation over the
  existing effect list, not a new one.
- **Not a rewrite of any action's own interaction UI.** The cooking engine,
  the wardrobe picker, the escort booking checklist, the furniture
  placement mode — none of that logic changes. The open question is only
  whether the *chrome around* those screens becomes the shared component.
- **Not a fix to `peek.js`'s risk/caught/outcome logic.** That system is
  built, tuned, and out of scope. Only its keyhole CSS was touched, and
  only because it was a shipped bug independent of this plan.
- **Not a requirement that every verb gets a modal.** Pure administrative
  actions (add to cart, sort a list, toggle a filter, open a thread) already
  show their result inline the instant they happen — a modal there would be
  friction, not clarity. See the tiering in Appendix A; a real fraction of
  the ~150 verbs are proposed to stay exactly as they are today (Tier A).
- **Not a new effect/consequence system.** The "what changed" strip is
  proposed to read the same typed array `applyEffects` already produces —
  if a verb doesn't emit an effect for something, the window won't
  either, and that's a signal to go fix the verb's effect list, not the
  window.
- **Not the Dream Engine.** Sleep/nap get a Tier C image hook (D11); what
  actually generates a dream is a separate, larger system the user has
  independent plans for and gets its own companion document. Building the
  hook here must not foreclose whatever that system turns out to need.

---

## Locked decisions

- **D1 — Tier B/C always waits for a tap to continue. No auto-advance.**
  Considered splitting by tier (B auto, C tap, since C spent an image
  generation), but the user chose uniform tap-to-continue: guarantees every
  outcome is actually read, at the cost of one extra click per action —
  which is exactly the cost worth paying, since the entire thesis of this
  plan is that actions were going unread in the first place.
- **D2 — Tier D wraps its existing interaction UI in the new chrome,
  rather than bolting a resolution card onto an untouched screen.** Chosen
  over the lower-risk option for visual consistency end-to-end: the cooking
  engine's stage picker, wardrobe's outfit picker, and escort's checklist
  will render *inside* `ActionWindow`'s frame, not as separate screens that
  merely hand off to it at the end. This is the higher-surface-area choice —
  each Tier D verb's existing, working, tuned UI gets touched, not just
  extended — and should size its own phase accordingly rather than being
  bundled with the Tier B/C rollout.
- **D3 — The default bias flips to Tier C.** Most actions get imagery, even
  mundane or quick ones (napping, dishes, working a gig block). Tier B is
  now the exception — for verbs where there is genuinely nothing to picture
  beyond the delta strip (paying a bill) — not the default resting place
  for anything that felt too small to bother with. Tier A stays the floor
  for state that's already visible the instant it changes (a cart, a
  sorted list).
- **D4 — Investing (`invest.buy` / `invest.sell-all`) is Tier A, not B.**
  Correction from the first pass: the Bank app's own balance/position
  display already is the confirmation, instantly and legibly. A window
  here would restate what's already on screen, not clarify anything.
- **D5 — Images are reused by default for a defined class of "archetype"
  verbs; only "instance" verbs generate fresh per occurrence.** Dishes,
  cleaning, most gig-work blocks, and other repetitive-motion verbs cache
  one representative image per `(verb, room, …)` key and reuse it every
  time — the same LRU-cache-by-composed-key pattern `image.js` already
  proves out for peek/scene art (`composePeekKey` and siblings), not a new
  mechanism. Verbs where the *specific* content is the point — a
  particular plate, a particular outfit, an intimate act, a dream — stay
  fresh per instance. Which verb falls in which bucket is not fully worked
  out yet (see Open questions).
- **D6 — The window gains a fourth resolution mode: hand off to
  conversation. It's still a tap to close (D1), then, conditionally, a
  smooth visual transition into `talk`'s conversation UI — never an
  instant dissolve, and never automatic.** Whether the transition happens
  depends on the specific outcome, not the verb: being caught peeping and
  having the NPC `engage`/`confront` hands off; the NPC choosing to end it
  without talking (a door slammed in your face) closes the window on its
  own narrated beat with **no** handoff. This maps directly onto
  `peek.js`'s existing outcome vocabulary (`PEEK_OUTCOMES`:
  `stop`/`ignore`/`escalate`/`engage`/`confront`) — the presentation layer
  only has to branch on which outcome it already got, not invent a new
  one. `dismissal` grows a fourth value, `'handoff'`, alongside
  `'auto' | 'tap' | 'interactive'` — see the updated shape below.
- **D7 — The window is no longer only player-triggered; it also gates
  world-initiated moments, and it queues rather than interrupts.** An NPC
  committed to approaching the player (`npc.overture`) opens the window
  first, not a bare inline prompt — a clear "You see \[name\] — they look
  like they have something to say," with an explicit engage/ignore choice.
  Ignoring costs nothing and the player keeps doing whatever they were
  doing; engaging hands off into conversation (D6). Confirmed: this never
  interrupts an in-progress action (mid-cook, an existing conversation) —
  it waits for the current action to resolve, then presents. This
  reclassifies `overture.accept`/`overture.decline` out of Tier A.
- **D8 — AfterHours "Invite Over" stops hardcoding a vague future ("they'll
  come by tomorrow") and opens a real scheduling picker instead** — the
  same mutual-availability, calendar-commitment mechanism `invite-dinner`
  and the `RequestMeal`/`RequestHangout` asks already use elsewhere in this
  codebase, extended so same-day slots are possible. This reclassifies the
  verb from Tier B to Tier D — it's an interactive picker now, not a
  one-shot confirmation — and is as much a logic fix (reuse the existing
  commitment-booking mechanism instead of a hardcoded string) as a
  presentation one. `invite-dinner` itself is retagged to Tier D for the
  same reason — it was already a calendar picker; it was mistiered B in
  the first pass.
- **D9 — Peeking's caught resolution shows the immediate beat — the door
  opening, them seeing you — inside the window; outcomes are then
  outcome-conditional per D6** (`confront`/`engage` hand off into real
  conversation; a hostile refusal — the door slammed in your face — closes
  with its own beat and no handoff).
- **D10 — A new verb, `sit`, fully replaces `set_meal`'s old
  round-robin-eats resolution and is the sole trigger for the real meal
  event.** `set_meal` (laying the spread out) keeps its own Tier B window —
  a plain confirmation of what got laid out — but no eating happens there
  anymore. `sit` is a separate action, gated by two questions the game
  resolves the instant the player sits (see D12/D13): are there confirmed
  guests, and does anyone uninvited join. Either kind of company opens the
  same materially richer Tier D scene: imagery of the table and the seated
  guests, freeform conversation via the D6 handoff, and an in-scene choice
  of what to eat from what's laid out. Eating alone is a quick Tier C
  beat — "you ate your meal" — that also leaves a real mess behind (D13).
- **D11 — Sleep and nap get an unconditional Tier C window (narration +
  image + deltas), but the image generator behind it is explicitly NOT
  designed in this plan.** The user has a "Dream Engine" concept in
  mind — abstracting the player's known day, relationships, and desires
  into surreal, subconscious-feeling imagery — large enough to deserve its
  own companion plan, not a paragraph here. This plan commits only to the
  interface: sleep/nap's `image` field is a hook. Nothing built here should
  assume the hook's contents (a literal scene render, an abstracted
  symbol set, something else entirely) until that plan exists. **Deferred
  by the user to a separate session** (2026-08-24 evening) — not
  forgotten, just not this document's job.
- **D12 — Joining is always an explicit per-NPC ask, "Can I join you?" —
  never an automatic seat.** The instant the player chooses `sit`, the
  game **simulates the next 45 minutes instantly** (closed-form, no real
  waiting — confirmed) to decide which NPCs, if any, are in range and
  interested enough to attempt it — confirmed guests already committed
  need no ask, they're simply there. Interest is powered by the **signal
  substrate** `signals.js` already models — smell/sound propagation is an
  existing, tuned mechanic (`floorplan-and-movement-plan.md` even
  documents a real asymmetry in cooking-smell reach between wings) —
  confirmed as the right system to lean on rather than a bespoke roll. A
  confirmed/planned meal **lowers but never zeroes** the chance of an
  additional uninvited ask — the two are independent enough that a
  scheduled guest and a walk-in can both show up to the same meal. Each
  candidate NPC who decides to attempt it surfaces inside the `sit` window
  as its own beat — "\[Name\] asks: 'Can I join you?'" — and the player
  answers yes/no per NPC, before the guest list finalizes. Any non-empty
  final list (confirmed + accepted walk-ins) opens the Tier D shared-meal
  scene (D10); an empty list resolves the quick solo Tier C beat. This
  likely rides the same commit/decide substrate `npc.overture` already
  uses for NPC-initiated approaches (drives/cognition/willingness), scoped
  to a meal-joining flavor, rather than inventing new NPC decision logic.
- **D13 — Eating alone leaves a real mess — dirty dishes, trash — that the
  existing chore verbs resolve, not a new bespoke "mess" system.** Routes
  through whatever `world.js`/`container.clear-mess`/`self.dishes` already
  use to represent room cleanliness and object state — consistent with
  "not a new effect system."
- **D14 — Recommendation, not yet exercised: `sit` is deliberately NOT the
  first vertical slice, but is the second.** The user explicitly deferred
  this sequencing call ("do with that what you will"). Building the
  hardest, most branch-heavy case first means debugging the shared
  `ActionWindow` component and `sit`'s own considerable edge cases at the
  same time, with no simpler working example to isolate which is at
  fault. Proposed order: Phase 1 proves the core component (tiers,
  dismissal, the delta strip reading `applyEffects`) on a single
  low-branching Tier C verb with no gating and no handoff — `self.eat` or
  `self.shower` are the obvious candidates, since `food-overhaul-plan.md`
  already gives eating a narration+image-shaped result to read from.
  Phase 2 (or shortly after) takes on `sit` specifically *because* it's
  the hardest case — it is the one verb that exercises D2's Tier D
  wrapping, D5's reused/fresh image split, D6's conditional handoff, D12's
  per-NPC ask, and D13's downstream chore consequence all at once — so it
  becomes the proof that the architecture holds under its heaviest load,
  once the foundation under it is already trustworthy.
- **D15 — A verb's existing narration string is the window's default, and
  `outcomeWindow.narration` is an OPTIONAL override, not a required field.**
  Resolves the open question "can the window reuse that string verbatim for
  Tier B, or does it read differently once it's the single focused thing on
  screen?" Answered by building Phase 1: `resolveActionWindowSpec` falls back
  to `result.narration` — what `narrateAction` already produced — and both
  Phase 1 verbs use the fallback unchanged. `self.shower`'s "You take a
  shower. Refreshed." reads correctly as the focused line, so the default is
  good enough to make hand-authoring an opt-in cost paid only where a verb
  actually earns it. Consequence for Phase 6: the long tail does NOT need a
  bespoke narration per row — most rows are `tier` + an image `phrase` and
  nothing else. Do not budget Phase 6 as ~150 prose rewrites.
- **D16 — D5's split is a choice of cache-key PREFIX and discriminator, on
  one shared key base — never two caching mechanisms.** Locked by Phase 1's
  implementation: `awa_`/`awi_` over `actionWindowKeyBase`, both through
  `getCachedImage`/`setCachedImage`. An "archetype" verb is one whose
  discriminator (`variant`) is stable across occurrences; an "instance" verb
  is one whose discriminator (`subject`) varies per occurrence. That is the
  entire mechanical difference, so classifying a verb later costs one field,
  not a new code path. The exact key strings are recorded in the Handoff.
- **D17 — The continuous clock is PAUSED while a window is open.** Not
  contemplated in D1, but required by it: D1 buys legibility at the price of
  one extra click, and that price must not silently include game-minutes
  (the `idle` dilation scale is 20×, so a few seconds of reading would cost
  real time). `openActionWindow`/`dismissActionWindow` use the same
  `wasRunning` → `pauseClockLoop`/`resumeClockLoop` guard `advanceAndResolve`
  and the pause menu already use, so a window opened while the clock is
  already stopped never restarts it. Verified live: clock held at minute 495
  across a 7-second hold.
- **D18 — `peek.js` and both bubble patterns (interruption,
  caught-peeping-by-an-NPC) FULLY MIGRATE onto `ActionWindow`.** Confirmed by
  the user 2026-08-24, at the end of the Phase 1 session — this was the
  plan's one open scope commitment and Phase 4's hard blocker. **Phase 4 is
  now unblocked.** Chosen over "keep separate, model on it" and over the
  bubbles-only middle option: one component, one chrome, one dismissal
  contract everywhere, accepting that it touches three built, tuned, verified
  systems. Consequences the implementing session must hold onto:
  - The whole risk of Phase 4 is a **silent behavior change**, not a visual
    one. `peek.js`'s risk ramp, caught roll, and `PEEK_OUTCOMES` resolution
    are NOT in scope and must come through byte-identical — only the
    presentation moves. Phase 4's deliverable is the before/after
    confirmation that every outcome (`stop`/`ignore`/`escalate`/`engage`/
    `confront`) still narrates and applies the same effects; the note that
    nothing changed IS the deliverable, not the migration itself.
  - Peek is a **Tier D** case, not Tier C: it is a live, timed, real-time
    hold that resolves into a B/C-shaped outcome, so it exercises D2's
    "existing interaction UI inside the chrome" rule. It is therefore better
    taken after Phase 3's Tier D work than before it, even though the
    Dependency order graph only strictly requires Phase 2.
  - The keyhole mask, vignette, and risk meter are peek's **content**, not
    shared chrome — they belong inside the frame `ActionWindow` provides,
    not promoted into `actionwindow.js`. Phase 1 deliberately did not reuse
    them (`.aw-frame` is a plain rounded viewport) and that split should
    hold.
  - Phase 6 rows that were waiting on this (the bubble-pattern rows) still
    wait for Phase 4 rather than duplicating the migration early.
- **D19 — D7's "ignore" is a THIRD ending, not a rebranded decline. It
  leaves the overture record `pending` and applies nothing at all.**
  Locked by building Phase 2, which had to reconcile D7's "ignoring costs
  nothing and the player keeps doing whatever they were doing" with Phase
  2's Verification line "the declined overture's existing consequences
  still fire unchanged". They are not in tension once you count the
  endings: an overture already had three (engage / refuse / lapse), and the
  gate adds a surface for the first two without touching the third or
  collapsing any of them. Pressing "Not now", tapping the backdrop, or
  hitting Escape applies **no** rel delta, writes **no** memory fact, and
  does **not** call `applyOvertureRefusal` — the record stays live, and the
  player can still refuse it properly with the existing `overture.decline`
  chip (D10's economy, whole), still refuse it by walking out
  (`refuseOverturesInRoom`), or still let it lapse for free. Measured side
  by side on the live page: gate-ignore leaves every `relPlayer` axis at 0
  with no `_overtureRefusals`; the decline chip on the same record spends
  −0.04 affection, `{count:1}`, and a memory fact. **Consequence for any
  later world-gate:** the quiet answer must always be the cheapest ending
  that already exists, never a new cost invented by the surface. A gate is
  an offer; it must not become a trap.
- **D20 — a handoff's DESTINATION belongs to the caller; `actionwindow.js`
  owns only the TRANSITION.** The tempting shortcut was a dispatch table in
  `actionwindow.js` mapping a `handoff: { kind: 'conversation', npcId }`
  descriptor onto `doTalk` — rejected, because Design invariant 1 makes
  that file a projection and the moment it knows what a conversation is, it
  has opinions. What it does instead: on a handoff dismissal it sets
  `data-handoff`, **resolves its promise immediately**, and hides the
  overlay on a timer. The caller — which already knows the target, because
  it built the choice — opens the next surface into the fade. Resolving
  first is the load-bearing detail: it is what makes this a cross-fade
  rather than a sequence, and it is verified (the conversation overlay was
  open at t+80 ms while the window was still painted). **Consequence for
  Phase 4:** `peek.js` keeps its own knowledge of who it hands off to;
  migrating it must not move that knowledge into `actionwindow.js`.
- **D21 — a world-initiated window queues on a shared "is the screen the
  player's?" question, and every retry point must be paired with a state
  that can outlast the others.** Locked by Phase 2 needing four flush
  sites, not one. `overtureGateBlocked()` is the single question
  (presenting / loading overlay / `actionWindowActive()` /
  `peekSessionActive()` / `convState` / a peep bubble ahead in line), and
  the four askers are `advanceAndResolve`'s tail, `hideLoading()`,
  `closeConversationOverlay()`, and the gate's own `finally`. The last two
  are the non-obvious ones and both were found live: a conversation can
  outlast every other retry, and with the clock at 0× and no action
  running, a gate closing is the *only* moment that would ever show a
  second queued gate. **Consequence:** any later world-trigger (a delivery
  arriving, a visitor at the door) adds its blocker to
  `overtureGateBlocked()`'s list and its own close to the flush sites —
  it does not invent a second queue with a second set of rules.
- **D22 — When the player sits, "who shows up in the next 45 minutes?" is
  answered INSTANTLY and in closed form. Nothing waits.** Confirmed by the
  user 2026-08-24, resolving the open question this plan carried as Phase
  3's top-of-phase blocker ("does the window wait for a confirmed guest who
  has not arrived yet?"). The answer is that there is nothing to wait for:
  *"Did someone schedule to show up? Yes. BOOM they show up. No, then will
  anyone else, in their simulated lives, be in range of sight, smell or
  sound? If yes, will they ask to join for the meal? If yes BOOM they show
  up."* From the player's side the whole resolution is near-instantaneous.
  Consequences the implementation holds:
  - A confirmed guest is **never rolled for and never asked**. They accepted
    a commitment; sitting down is when they turn up. `resolveSitGuestList`
    seats them before any dice are touched.
  - No ticks are advanced to "simulate" the 45 minutes and no walk is
    modelled. `SIT_TUNING.windowMinutes` is what the fiction says elapsed
    and what the action costs — not a duration anything waits out.
  - The scoring is PURE and the ROLL is the caller's
    (`mealJoinCandidates` returns chances; `resolveSitGuestList` rolls).
    A function that both computes a chance and consumes randomness cannot be
    re-read afterwards to explain what it did.
- **D23 — Four at the table, counting the player. Invited guests are seated
  first, so a walk-in can never take a confirmed guest's chair.** Set by the
  user 2026-08-24: *"a max of 4 people at the table feels reasonable, this
  is in line with the early design assertion made early in this game's
  development that no more than 3 npc's should ever appear in a
  group-conversation type setting because of the difficulty of weighing a
  context window that big."* So `SIT_TUNING.maxSeats = 4` means **three NPC
  seats**, and the number is a restatement of the group-conversation ceiling
  rather than an independent dial — **raise both together or neither.** The
  user noted the context-window limit could be engineered around later; until
  it is, this cap moves with it. Ordering is the other half and is not
  cosmetic: `seatsLeft` is computed after confirmed guests are seated, so an
  over-subscribed table drops walk-ins, never invitees.
- **D24 — The join ask shows a CUTOUT, not a generated scene. No image is
  generated per NPC per occasion.** Set by the user 2026-08-24: *"Images
  should not appear per NPC, but we could have a generic cached image that
  shows for every NPC that arrives, or we can use the NPC cutout system so no
  generation is necessary."* Of the two options offered, the cutout system
  was taken — it shows the ACTUAL person rather than a generic stand-in, and
  it is already built. The economics are the point and they check out:
  `cutoutKey(identity, pose, expression, outfit, styleToken)` carries no
  clock and no mood, so a given housemate's asking frame is generated **once
  for the life of the save** and reused every evening after. Verified stable
  across a day+mood change. Consequence for any later per-NPC beat (Phase 6
  has several): reach for `getCharacterCutout` through
  `presentActionStep`'s `cutout: { npcId, pose, expression }`, never for a
  fresh scene generation.
- **D25 — Every declared `outcomeWindow` field goes through `val()`, tier
  included.** Locked by a real bug in Phase 3: Phase 1 read `tier` directly
  (`ow.tier || 'B'`) because at the time it was always a literal, so when
  `sit` declared it as a function of the outcome the raw **function source
  text** was written into `data-tier` and every `[data-tier="B"]` CSS rule
  silently stopped matching. The general rule is now: a field on
  `outcomeWindow` is a value OR a function of the view, with no exceptions,
  and adding a field means routing it through `val()` in the same commit.
  The specific case is worth stating too, because it is D6's shape one level
  up: **`tier` is a fact about the OUTCOME, not about the verb.** `sit` is a
  Tier D scene when anyone came and a quick Tier C beat when nobody did, and
  that is the same reasoning Design invariant 2 applies to `dismissal` —
  branch on the value the verb's own logic produced, never on the verb id.

## Data model

A single component, provisionally `ActionWindow`, generalizing
`peek.js`/`renderPeekOverlay`'s existing shape:

```
outcomeWindow: {
  tier:      'B' | 'C' | 'D',
  trigger:   'player' | 'world',                  // D7 — who opens the window
  narration: (gs, result) => string,               // most actions already build this
  image:     { kind: 'archetype' | 'instance', … } | null,  // C/D only — D5
  deltas:    deriveFromEffects(result.effects),     // generic — reads applyEffects' own output
  dismissal: 'auto' | 'tap' | 'interactive' | 'handoff',  // D1, D6
}
```

**This is the original sketch. What was actually built drifted from it —
the Handoff records the real shape and is the one to code against.** Three
differences worth knowing before you read the phases below: `deltas` is not
a field at all (it is derived unconditionally from `result.applied`, so a
verb cannot opt out or supply its own); every declared field may be a value
OR a function of `view` (`{ gs, def, result, prepared, roomId }`), which is
how `dismissal` reads the outcome and therefore how D6 stays
outcome-conditional; and `choices` (`[{ id, label, tone?, handoff? }]`) was
added for D7's world gate, which is built through its own entry point
`presentWorldGate(gs, gate)` rather than through a def.

Four tiers, by how much the player needs to be told (default bias per D3:
reach for C, not B, unless there's truly nothing to picture):

- **Tier A — no window.** The result is already visible in the UI the
  instant it happens (cart contents, a sorted list, a toggled filter). Stays
  exactly as today.
- **Tier B — narration only, the exception now, not the default (D3).** A
  short panel: what happened, in prose, plus the delta strip. No image.
  Tap-to-dismiss (D1). Reserved for verbs with genuinely nothing to picture
  — paying a bill, laying out the table before anyone's sat down.
- **Tier C — narration + image, single resolution.** Same as B, plus a
  generated image — reused from an archetype cache for repetitive verbs,
  fresh per instance where the specific content is the point (D5).
  Tap-to-dismiss, unless the outcome hands off into conversation instead
  (D6). Eating, showering, sleeping (image pending the Dream Engine, D11),
  getting dressed, an intimacy act, a search turning up a find, an
  NPC-initiated "they want to talk" gate (D7).
- **Tier D — the existing interaction UI, rendered inside `ActionWindow`'s
  chrome, resolving into a B/C-shaped outcome at the end (D2).** Cooking,
  the peek/listen hold, escort booking, furniture placement, wardrobe's
  full outfit picker, AfterHours/`invite-dinner` scheduling (D8), `sit`
  when confirmed or uninvited company shows up (D10/D12). The interaction
  logic itself is unchanged; what changes is that it now runs inside the
  shared frame instead of its own standalone screen, and may end in a D6
  handoff instead of a close.

The load-bearing bet: `deltas` is not bespoke per verb. It's one function
reading the same effect list every verb already returns. A verb that gets a
`narration` and (optionally) an `image` function is otherwise indistinguishable
to the component from any other verb of its tier.

Every tier assignment above traces to a D-number; the shape is settled
enough to build phases against. What's still open (the `peek.js`/bubble
migration, the confirmed-guest-arrival edge case) is scoped to specific
phases below, not the whole design.

---

## Implementation phases

### Phase 1 — the core component, proven on both image paths at once
**Goal:** `ActionWindow` exists and renders a real Tier B and Tier C
outcome: narration pane, image pane, the delta strip reading straight off
`applyEffects`' output (no bespoke per-verb delta logic), and tap-to-dismiss
(D1). Wired to exactly two verbs, chosen to prove D5's split immediately
rather than defer it: `self.eat` (fresh, per-instance image) and
`self.shower` (reused, archetype-cached image) — nothing else changes
behavior yet, every other verb keeps its current no-window resolution.
**Files:**
- `src/srcfiles/actionwindow.js` (new): the render/dismiss logic, mirroring
  the pure-logic/render split `peek.js`/`render.js` already use — this file
  holds no decision logic, only projection, matching the Design invariant
  below.
- `main.html`: new `#action-window-overlay` markup + CSS, modeled directly
  on `.peek-overlay`/`.peek-stage`/`.peek-lens` (reuse the structure, not
  the peek-specific content).
- `src/srcfiles/image.js`: the D5 archetype-vs-instance cache-key split —
  two composing functions alongside the existing `composePeekKey` and
  siblings, not a new caching mechanism.
- `src/srcfiles/defs.actions.js` / `src/srcfiles/actions.js`: an
  `outcomeWindow` field on `self.eat`'s and `self.shower`'s entries, per
  the Data model shape above.
**Verification:** live page only (no `dev/verify` harness applies to UI).
Eat and shower both open the window with correct narration/deltas; eat's
image is freshly generated per occurrence, shower's is reused across
repeated showers (same cache key, no duplicate generation call); dismiss
requires a tap, never auto-advances (D1); every other action in the game
is provably unaffected — spot-check a few Tier A verbs still resolve with
no window at all.

### Phase 2 — the handoff-to-conversation primitive, proven on overtures
**Goal:** D6's fourth `dismissal` value (`'handoff'`) and D7's
world-initiated trigger both exist and are proven on the simplest real
case: an NPC's committed `overture` now opens `ActionWindow` first ("You
see \[name\] — they look like they have something to say"), engage/ignore,
with engage transitioning into `talk`'s conversation UI and ignore closing
with no consequence. Confirms D7's queueing rule: the gate never fires
mid-action, only once the player's current action resolves.
**Files:**
- `src/srcfiles/actionwindow.js`: the `trigger: 'world'` path and the
  `'handoff'` dismissal — tap-to-close, then transition into conversation,
  never an instant dissolve (D6).
- `src/srcfiles/ui.js`: wherever `overture.accept`/`overture.decline` are
  currently handled inline — route through `ActionWindow` instead; find
  the current call site by name, not by the line numbers Appendix A cites
  (citations drift).
- `src/srcfiles/commitments.js` / wherever `npc.overture` completion is
  currently detected: the queueing check — defer presenting the gate until
  no player action is in progress.
**Verification:** live page. Trigger an NPC overture while the player is
mid-cook or mid-conversation — confirm the gate visibly waits, doesn't
interrupt. Engage transitions smoothly into `talk`. Ignore closes cleanly
and the declined overture's existing consequences (whatever they are today)
still fire unchanged.

### Phase 3 — `sit`, the architecture's heaviest case
**Goal:** The full mechanic from D10/D12/D13, built on the foundation
Phases 1–2 proved: `set_meal` gets its own quiet Tier B confirmation;
`sit` is a new, separate action that simulates the next 45 minutes
closed-form (no real waiting), determines confirmed guests, and rolls
ambient interest per nearby NPC off the existing signal substrate. Every
interested uninvited NPC surfaces its own "Can I join you?" ask inside the
window, yes/no, and confirmed guests need no ask. Any non-empty final
guest list opens a Tier D scene (table + guests imagery, freeform
conversation via the Phase 2 handoff, in-scene food choice from what's
laid out); an empty list resolves a quick Tier C "you ate alone" that also
leaves a real mess for `self.dishes`/`container.clear-mess` to resolve.
**Top-of-phase blocker:** confirm the confirmed-guest-arrival edge case
(is a confirmed guest ever not yet present when the player sits?) before
writing the guest-list-finalization logic — see Open questions.
**Files:**
- `src/srcfiles/defs.actions.js`: new `sit` action entry; `set_meal`'s
  entry trimmed to lay-the-table-only (no eating resolution).
- `src/srcfiles/signals.js`: read (not extend, unless the existing smell/
  sound signals don't already cover "a meal is happening") for the
  ambient-interest roll.
- `src/srcfiles/drives.js` / `src/srcfiles/overture.js`: the per-NPC
  "attempt to join" decision — reuse `npc.overture`'s commit/decide
  substrate, scoped to a meal-joining flavor, per D12.
- `src/srcfiles/actionwindow.js`: the Tier D in-window ask sub-step (one
  beat per candidate NPC) ahead of the full scene.
- `src/srcfiles/world.js`: the leftover-mess object/state write for the
  solo-eating branch (D13) — reuse whatever `container.clear-mess`
  already reads, don't invent a new mess representation.
**Verification:** live page. Force each branch by save-editing the guest
commitment/signal state: zero guests (mess appears afterward, dishes
verb clears it), one confirmed guest, one uninvited walk-in only, both at
once (mixed guest list renders correctly). Confirm the 45-minute
resolution is instant — no real-time wait.

### Phase 4 — `peek.js` and the two existing bubble patterns migrate onto `ActionWindow`
**Top-of-phase blocker: RESOLVED (D18, 2026-08-24) — this phase is OPEN,
and was BUILT + verified live the same day.**
The user confirmed a FULL migration rather than separate-but-similar
implementations. It remains the single largest touch to already-built,
tuned, verified code in this whole plan, so treat D18's consequences as
binding: peek's risk/caught/outcome logic is out of scope and must come
through byte-identical, and this phase's deliverable is the before/after
confirmation that nothing changed behaviourally.
**Goal:** `peek.js`'s `renderPeekOverlay`
and its bespoke `#peek-overlay` markup/CSS are replaced by `ActionWindow`
calls, with `peek.js`'s existing pure logic (`peekRiskPerTick`,
`peekCaughtChance`, `resolvePeekCaughtOutcome`, etc.) completely
untouched — only the render call sites move. The caught resolution's door-
opening beat renders inside the window (D9), and `confront`/`engage`
outcomes use the Phase 2 handoff; a hostile refusal closes with its own
beat and no handoff. The interruption bubble and the caught-peeping-by-an-
NPC bubble (`ui.computer.js`) migrate the same way.
**Files:**
- `src/srcfiles/peek.js`: `renderPeekOverlay` calls become `ActionWindow`
  calls; `startPeekSession`/`_peekTick`/`_endPeekSession` unchanged.
- `main.html`: `#peek-overlay` and its CSS block removed once nothing
  references it — confirm with a repo-wide search first.
- `src/srcfiles/ui.computer.js`: the interruption and caught-peeping bubble
  call sites, same migration pattern.
**Verification:** live page. Every peek/listen session outcome (stop,
ignore, escalate, engage, confront) still narrates and applies its effects
identically to before the migration — this is a pure presentation-layer
swap, so behavior must be byte-identical; only the DOM changed.

### Phase 5 — real scheduling for AfterHours' invite and `invite-dinner`
**Goal:** D8's fix — both verbs open a real mutual-availability scheduling
picker (same-day slots included) instead of AfterHours' hardcoded "they'll
come by tomorrow." One shared picker implementation, not two.
**Files:**
- `src/srcfiles/afterhours.js`: `doAfterHoursInviteOver` routes through the
  new picker instead of its current hardcoded response.
- `src/srcfiles/ui.js`: `doInviteDinner` (already a calendar picker per the
  first-pass tiering note) — confirm whether it can become the shared
  implementation `afterhours.js` also calls, or whether both call a common
  new function.
- `src/srcfiles/actionwindow.js`: the Tier D wrapping (D2) for the picker.
**Verification:** live page. Book a same-day slot through both entry
points; confirm both write the same kind of commitment `invite-dinner`
already produces today (no new commitment shape).

### Phase 6 — the long tail
**Goal:** Every remaining Appendix A row gets its `outcomeWindow` field, in
the grouping order Appendix A already uses (Needs/self-care → Household
chores → the rest of Cooking/food → Movement → Work/money → Computer/phone
→ Social → Intimacy/romance → Renovation/decor → Sleep). Mechanical once
Phases 1–5 exist — each row already states its tier and what the window
shows; this phase is applying the established pattern, not inventing new
component behavior.
**Files:** `src/srcfiles/defs.actions.js` and the relevant hand-written
`doX()` functions in `ui.js`/`ui.computer.js`/`afterhours.js`, one
`outcomeWindow` field at a time.
**Verification:** live page, spot-checked by category rather than
exhaustively — one verb per Appendix A section, confirming its tier
renders as specified and its delta strip matches its real effect list.

---

## Status

| Phase | Status | What it adds |
|---|---|---|
| 1 | **Done** (2026-08-24, verified live) | The `ActionWindow` component itself (`src/srcfiles/actionwindow.js`), proven on `self.eat` (fresh/instance image) and `self.shower` (reused/archetype image). Delta strip reads `applyEffects`' returned `applied` list only; tap-only dismissal; clock pauses while open |
| 2 | **Done** (2026-08-24, verified live) | The D6 `'handoff'` dismissal (`actionWindowHandsOff`, the `data-handoff` cross-fade, `dismissal` resolved as a function of the outcome) + D7's world-initiated gate (`presentWorldGate`, `#aw-choices`), proven on all three NPC overture channels. Queueing via `pendingOvertureGate`/`flushPendingOvertureGate` (four flush sites); ignore costs nothing and leaves the record pending (D19) |
| 3 | **Done** (2026-08-24, verified live) | `sit` — the full open-invitation meal mechanic. `set_meal` lays the table only (Tier B) and consumes nothing; `sit` resolves the guest list closed-form (D22), asks per walk-in inside the chrome via `presentActionStep` + cutouts (D2/D24), caps at 4 seats with invitees first (D23), hands off into `talk` per guest (D6/D10), and leaves the existing mess for `self.dishes`/`cleanRoomObjects` (D13). All four guest-list branches exercised live; `verify-aow-p3.js` covers the pure half (18/18) |
| 4 | **Done** (2026-08-24, verified live) | `peek.js` + the interruption/caught-peeping bubbles migrate onto `ActionWindow` (D18, full migration). `renderPeekOverlay`/`#peek-overlay`/`#peek-heading`/`.peek-overlay`/`.peek-stage` and the two bubble DOM builders (`createInterruptionBubble`/`createNpcCaughtPeepingBubble`/`buildBubbleCard`) are gone; peek's hold now renders inside the window via `openPeekHold`/`renderPeekHold`/`updatePeekHold` and ends via `closeActionWindow` (no clock pause — a hold is live). The caught resolution captures `s._applied` from its `applyEffects` call and narrates + deltas it inside the window via `presentPeekCaughtWindow`; engage, and a warm-tier confront, hand off (D6) to `doTalk`; hostile/cold/neutral confront closes with its own beat and no handoff. Both bubbles are now world gates (`presentWorldGate`): interruption = Sorry!/Own it (default `sorry`), caught-peep = confront/invite/cold (default `confront`), each applying the SAME consequences + `saveAtBoundary` as before. |
| 5 | **Done** (2026-08-24, verified live) | D8's real scheduling picker, shared by AfterHours' `doAfterHoursInviteOver` and `doInviteDinner`. One implementation (`presentSchedulePicker` in `actionwindow.js` as Tier D chrome + `openSchedulePicker` in `render.js` computing slots via `asks.js`'s `freeSlotsFor`/`mealLabelForWindow`), replacing AfterHours' hardcoded "tomorrow" and reusing the existing visit/commitment booking — same-day slots included, each verb writes its OWN pre-existing record shape (no new shape). No new files → `loadgame.js` ORDER unchanged |
| 6 | **Done** (2026-08-25, verified live) | The long tail. ACTION_DEFS slice: `outcomeWindow` on every ACTION_DEFS row the appendix tiers C/D — self-care/hobby/chores (watch_tv, relax, dishes, dishwasher, laundry, workout, swim, play_games, study, balcony_sit, take_walk, listen_music, long_shower, nap), cooking (cook/reheat/microwave), wardrobe.change_outfit, and the five intimacy acts — with D26 (per-verb `clothing` override in the key). Hand-written slice (this session): explicit `presentActionOutcome` added to every remaining `doX()` that bypasses executeAction — `ui.js` (`doKnock`, `doAskContact`, `doGiveItem` with real CONSUME_ITEM+REL_DELTA applied, `doApologizeNpc`, `doAskToLeave`, `doTakeFromRoom`, `doSearchPhone`, `doBoundarySleepRoom`, `doBoundaryThrouple`, `doConfrontNpc`, `doSpreadSecret`, `doMatchmakeNpc`, `doEscortBook`), `ui.computer.js` (`doGigWorkBlock`, `doGigDeliver`, `doAttendLesson`, `doClassifiedsAccept`, `doClassifiedsInterview`, `doStreamWatch`, `doUpgradeBook`, `doBookStructural`, `doUpgradeRepair`), `afterhours.js` (`doAfterHoursSayHi`, `doAfterHoursWatch`, `doAfterHoursCum`), `ui.phone.js` (`doPhoneTakePhoto`). Delta strips show real `applied` effects (archetype=reused / instance=fresh image); tap-only dismissal. Judgment call: AfterHours view-profile (hot-single) left as navigation (profile screen is its own display). The D11 Dream Engine hook (nap/sleep imagery) remains a separate deferred session, not part of Phase 6. |

## Dependency order

```
Phase 1 (core component) ──► everything else
        └─► Phase 2 (handoff + world gate) ──► Phase 3 (sit)
        │                                  └─► Phase 4 (peek/bubble migration)
        └─► Phase 5 (scheduling picker) ── independent of 2/3/4
        └─► Phase 6 (long tail) ── after 1; benefits from 2's patterns
                                    existing but doesn't strictly require them
```

Phase 5 needs only Phase 1 (it's a Tier D verb, D2's wrapping pattern) and
can run any time after it, in parallel with 2/3/4. Phase 6 can begin
piecemeal as soon as Phase 1 lands — a verb with no handoff and no
world-trigger needs nothing from Phases 2–5 — but rows that turned out to
need D6 (the bubble-pattern rows) should wait for Phase 4 rather than
duplicating that migration early. Phase 4's blocker is resolved (D18 — full
migration confirmed), so it is bound only by the graph above; because peek
is a Tier D case, taking it after Phase 3's Tier D work is the easier order
even though only Phase 2 is strictly required.

---

## Open questions (decide next session)

- ~~**`peek.js` and the two existing bubble patterns (interruption,
  caught-peeping-by-an-NPC) — full migration onto `ActionWindow`, or built
  separately and modeled on it?**~~ **RESOLVED 2026-08-24 → D18: full
  migration**, confirmed explicitly by the user at the end of the Phase 1
  session, exactly as this entry asked for. The original framing, kept
  because the reasoning still governs how Phase 4 must be executed: "We are
  essentially going to rebuild those actions INTO this reusable system"
  read like a yes, but it was a big enough scope commitment (touching
  built, tuned, verified systems) that it deserved an explicit confirmation
  rather than an inference. It got one — and the "touching verified
  systems" caution is now D18's binding constraint, not a reason to
  hesitate.
- ~~**Any upper bound on how many walk-ins can ask in one `sit`, or does
  the candidate pool naturally cap it?**~~ **RESOLVED 2026-08-24 → D23:
  an explicit cap of four AT THE TABLE, counting the player**, tied to the
  game's existing three-NPC group-conversation ceiling rather than left to
  the pool. Invited guests take their chairs first. The mixed guest list
  this entry described (some invited, some self-invited) is built and was
  exercised live — see the Handoff's branch table.
- ~~**If a confirmed/scheduled guest hasn't actually arrived yet when the
  player hits `sit`, does the window wait for them, or does sitting lock
  in the guest list at that instant?**~~ **RESOLVED 2026-08-24 → D22:
  nothing waits.** The user's answer was that there is nothing to wait for
  — sitting down IS the moment the question gets asked, and it is answered
  in closed form. A confirmed guest is not rolled for and not asked; they
  said yes, so they arrive. This was Phase 3's top-of-phase blocker and it
  is cleared.
- **Dream Engine specifics** — explicitly deferred by the user to a
  separate session (see D11). **That session happened on 2026-08-24 and the
  plan now exists: `src/ref/complete/dream-engine-plan.md`, paired with
  `dream-engine-handoff-prompt.md`.** Its D1–D22 are locked, and **its Phase 7
  landed on 2026-08-25** — but not in the shape this bullet predicted, and the
  difference matters here. (a) `doSleep` is wired to `presentDream`, a
  `body: 'dream'` window with no delta strip and no time chip (that plan's
  D13), NOT to `presentActionOutcome` — so **blocker #8 above is still open**,
  narrowed to "sleep has no outcome window OF ITS OWN". (b) `self.nap`'s
  `image` field is deliberately still empty, and that is now that plan's
  **D41**: `getActionWindowImage` composes its own prompt under its own key, so
  a dream panel routed through `image.phrase` would be a fresh generation on
  the nap click drawn from a prompt the record never carried. The nap opens the
  dream as a second window from `onDismiss` instead. Nothing further to decide
  here; what remains is this plan's own audit item 8 / finding #12.
  **CLOSED 2026-08-25: all nine phases of the Dream Engine landed and the plan
  moved to `src/ref/complete/dream-engine-plan.md`.** This item needs nothing
  further. What it hands back to this plan is one narrowed blocker (#8 above,
  sleep's own outcome window) and one decision it is bound by (that plan's D41,
  which is why `self.nap`'s `image` field is still empty and must stay so).
- **Which verbs are "archetype" (reused image) vs. "instance" (fresh per
  occurrence), per D5.** Appendix A doesn't attempt this split yet — it's
  flagged per-row only where it's obvious (dishes, gigs, hobbies). *Narrowed
  by Phase 1:* the MECHANISM is settled (D16 — one key base, two prefixes,
  a stable vs. varying discriminator), so what remains open is purely the
  per-verb assignment, which costs one field per row.
- ~~**How much of Appendix A's per-verb detail is worth authoring by hand
  vs. defaulting.**~~ **Resolved by Phase 1 → D15.** The verb's existing
  narration is the default and reads correctly as the focused line; hand
  authoring is opt-in.
- **D26 — an instance verb may add a `clothing` override on its
  `outcomeWindow.image`, and it is folded into the cache key by the existing
  machinery (long_shower 'towel', the intimacy acts 'undressed'/'towel',
  change_outfit the outfit slug) — the same one-key-base convention as D16, not a
  second mechanism.** Locked by Phase 6, whose instance rows need it: without
  `clothing` the key falls back to the player's *current* outfit, which would
  make a "freshly changed" frame key on whatever they were already wearing. The
  override is just another `val()`-evaluated declared field (D25's rule), and
  it rides the SAME `actionWindowKeyBase` compose path, so classifying a verb
  later still costs one field, never a new code path. **Trap that forced the
  note:** the hobby `phrase` must be a function (`(view) => HOBBY_WINDOW_PHRASE[objDef]`),
  never a construction-time read — ACTION_DEFS is built at module top but the
  `const` map it reads is declared later, and a direct read is a TDZ throw.**

- **D27 — Two follow-up-session judgment calls, both confirmed explicitly
  by the user rather than inferred (2026-08-26).** Raised as an
  AskUserQuestion because both had a materially cheaper alternative on the
  table:
  1. **Wardrobe gets the FULL Tier D wrap**, not left as its own overlay
     with Appendix A's proposed tier just downgraded to match. Chosen over
     leaving it alone specifically because the render logic didn't need to
     change at all — only its container and open/close plumbing — so the
     lower-risk option would have been leaving a real, fixable D2 gap in
     place for no remaining reason to.
  2. **Design Invariant 1's hand-written-`applied` gap is closed by
     AUDITING AND TIGHTENING each site, not by migrating the underlying
     game systems (gig payout, upgrade costs, stream mood, gift/apology/
     confront/spread/matchmake deltas, escort cost) onto the effects DSL.**
     Chosen because this plan's own Design invariant 1 already scopes
     `actionwindow.js` (and by extension what it's fed) to READING a value
     some other system already produced — rearchitecting those systems'
     internal mechanism to satisfy the letter of that rule more strictly
     would have been the plan reaching outside its own stated boundary
     ("the window is a renderer, not a decision-maker") to touch verb logic
     it was never meant to touch. Consequence: a future new hand-written
     `presentActionOutcome` call site should default to reading a real
     return value (extending the callee's return object if the value is
     already sitting in a local variable there, per the `applyReciprocatedAct`/
     `applyBoundaryThrouple`/`deliverGig` precedent) — hand-building an
     `applied` array is the fallback for values that are genuinely fixed
     config constants (D27.2's own `CONFRONT.outcomes`/`MATCHMAKE.playerRelDeltas`
     precedent), never the default reach.

---

## Design invariants

1. **The window is a renderer, not a decision-maker.** It must never
   compute an effect, roll a chance, or decide an outcome — every number it
   shows comes from a value some other system already produced. This
   mirrors the `peek.js`/`render.js` split (pure logic vs. "holds no logic
   of its own" projection) already proven out in this codebase.
2. **A handoff (D6) is always outcome-conditional, never verb-conditional.**
   The component must never decide "this verb always talks afterward" —
   it reads whichever outcome the verb's own logic already produced
   (`engage`/`confront` vs. a hostile refusal) and branches on that value.
   Hard-coding a handoff per verb is exactly the kind of decision-making
   Invariant 1 forbids.
3. **Every image goes through `image.js`'s existing cache/budget
   machinery** (the same LRU-by-composed-key pattern `composePeekKey` and
   siblings already use) **— never a direct `generateImage` call from
   inside `actionwindow.js`.** D5's archetype/instance split is a choice of
   *which cache key* to compose, not a reason to bypass the cache.

---

## Appendix A — verb inventory + proposed tier

Every distinct player-invokable verb found across `src/srcfiles/*.js`,
grouped as found, each tagged with a **proposed** tier (A/B/C/D — see
"Data model" above) and one line on what the outcome window would
show. Revised after D3–D13: the default bias is now Tier C, not B — most
rows below moved up one tier from the first pass. Still a first pass, not a
locked table — flag any that read wrong and they move.

Legend: **A** no window (unchanged) · **B** narration only, now the
exception · **C** narration + image (reused = cached per D5's "archetype"
bucket; fresh = generated per instance) · **D** interactive, resolves into
B/C, sometimes via a D6 handoff into conversation instead of closing.

### Needs / self-care
| Verb | Tier | Outcome window shows |
|---|---|---|
| `self.eat` | C, fresh | What you ate, portion, hunger/mood delta, plate image |
| `self.shower` | C, reused | Hygiene restored, mood note, a "cleaned up" image |
| `self.long_shower` | C, reused | Same as shower, bigger deltas, note on water/heating cost |
| `intimacy.masturbate` | C, fresh | Narration + generated frame, desire/mood/energy deltas |
| `self.nap` | C | Energy/mood restored, how long — image is the D11 Dream Engine hook |
| `self.relax` | C, reused | Mood restored, an image of where/how you unwound |
| `self.balcony_sit` | C, reused | Mood delta, an image of the moment; flags a "confiding" beat if someone joined |
| `self.take_walk` | C, reused | Mood delta, a street/block image |
| `self.listen_music` | C, reused | Mood delta, a small image of the moment |
| `self.watch_tv` | C, reused | Mood delta scaled by co-viewer, an image of the room/screen |
| `wardrobe.change_outfit` | D | Picker unchanged (D2); resolves to a fresh image of the fit + any mood/confidence note |
| Hobby actions (guitar/bookshelf/record player/console/sketchpad/plant) | C, reused | Mood/energy delta, one representative image per hobby object |
| `look` | A | Free, no time cost — stays inline (room description refresh) |
| `wait` | A | Trivial — stays inline; maybe a one-line toast, not a window |

### Household chores
| Verb | Tier | Outcome window shows |
|---|---|---|
| `self.dishes` | C, reused | How many done, skill-capped note, time spent, one cached "doing dishes" image |
| `self.dishwasher` | C, reused | Cycle started, an image of loading it; the *finish* is a Tracker notification, not this window |
| `self.laundry` | C, reused | Cycle started, same async-completion caveat as dishwasher |
| `container.clear-mess` | A | Instant, visible in the room already |
| `self.lock_door` / `self.unlock_door` | A | State visible on the door immediately |
| `door.unlock` | A | Same |

### Cooking / food
| Verb | Tier | Outcome window shows |
|---|---|---|
| `self.cook` | D | The existing multi-stage engine, unchanged; resolves into a fresh plate image + grade + who it'll feed |
| `self.reheat` / `self.microwave` | C | What was reheated, quality note if degraded, a plate image (often the original cook's cached frame) |
| `set_meal` (lay the spread) | B | Confirms what got laid out and who's expected; no eating happens here (D10) |
| `sit` (**new verb, D10/D12/D13**) | C solo / D with company | The instant the player sits, the game resolves and *displays* two yes/no questions: confirmed guests? uninvited walk-in (smell/sound-detected, D12)? Either "yes" opens the Tier D scene — table + seated guests imagery, freeform conversation (D6 handoff), in-scene food choice from what's laid out. Both "no": a quick Tier C "you ate your meal," plus a real mess left behind for `self.dishes`/`container.clear-mess` to resolve (D13) |
| `recipes.*` (open-detail/add-to-cart/planner-*) | A | Already visible in the ChefBook UI |
| `grocery.*` / `food.*` (cart, tip, checkout, place-order) | A | Cart/order state already visible; delivery ETA belongs in the Tracker, not this window |

### Movement / navigation
| Verb | Tier | Outcome window shows |
|---|---|---|
| `move` | A | Room change is the UI's own re-render; only exception is an *interrupted* walk (blocked/overture, D7) which already narrates inline |
| `door.open` | A | Delegates to move |
| `door.knock` | C, reused | Who answered (or didn't), a small image of them at the door |
| `step-away` | A | Trivial focus change |

### Work / money
| Verb | Tier | Outcome window shows |
|---|---|---|
| `gig.accept` | A | Listing state changes in the Work app already |
| `computer.gig-work-block` | C, reused | Progress made this block, energy/time cost, one cached image per gig type |
| `gig.deliver` | C, fresh | Payout, reputation change, tier-up moment if it happens |
| `gig.abandon` | A | Listing reverts; visible in-app |
| `pay-rent` / `pay-bills` / `bills.pay*` | A | Balance change already visible in the Bank app |
| `invest.buy` / `invest.sell-all` | A | **Corrected, D4** — Bank app's own display is already instant and legible |
| `taxes.pay` / `taxes.toggle-reserve` / `taxes.withdraw-reserve` | A | Bank app already shows this |
| `upgrades.purchase` | A | Job appears on the Tracker; the moment that matters is `upgrades.repair`/completion below |
| `upgrades.book-confirm` / `upgrades.book-structural` | C | Job scheduled, ETA, cost, an image of the planned work |
| `upgrades.repair` | C, fresh | Facility restored, before/after note, a photo (RenoFix already has one) |
| `upgrades.snap-photo` | A | It's already a photo action |

### Computer / phone apps
| Verb | Tier | Outcome window shows |
|---|---|---|
| Cart/checkout verbs (`shop.*`, `home.*` add/remove/checkout) | A | Cart UI already shows this; delivery is a Tracker event, not this window |
| `home.place-*` | D | Placement mode unchanged; resolves into a "the room now looks like this" beat (arguably redundant with just seeing the room — candidate for staying A, see Open questions) |
| `browser.visit` / `browser.ah-*` (category/search/page/refresh/host/close) | A | Browsing is its own UI |
| `browser.ah-watch` | C, fresh (likely reuses an existing clip still) | What you watched, mood/desire note |
| `browser.ah-masturbate` / `-cum` / `-stop` | D | Real-time session unchanged; resolves like `intimacy.masturbate` (Tier C shape) |
| AfterHours Hot Singles — say hi / view profile | C, reused (likely an existing portrait) | Confirms contact made / what the profile shows |
| AfterHours Hot Singles — **invite over** | D | **Revised, D8** — opens the same mutual-availability scheduling picker as `invite-dinner` below; same-day slots allowed. No more hardcoded "tomorrow" |
| `classes.enroll` | A | Course appears enrolled in-app |
| `classes.attend-lesson` | C, reused | XP gained, one cached image per course |
| `services.hire` / `-cancel` | A | Visible in Services app |
| `services.maid-save` | A | Config form, own confirmation |
| `escorts.view-profile` | A | Profile is its own screen |
| `escorts.book` | D | Checklist/time-picker unchanged; resolves into a booking confirmation |
| `escort.request-service` | C, fresh | The service itself resolves like the intimacy act it redeems |
| `classifieds.*` (post/view/filter/sort/favorite) | A | List UI already shows this |
| `classifieds.interview` | C, fresh | What you learned about the applicant, an image of them |
| `classifieds.accept` / `-reject` | C / A | New roommate moving in is a real beat; reject is A |
| `classifieds.studio-*` | A | Authoring tool, its own screen |
| `im.open-thread` / `im.send` | A | Chat UI is already the feedback |
| `im.invite` | C | Confirms who's coming and roughly when |
| `im.invite-dinner` | D | **Retagged, D8** — already a calendar picker in the first pass' own description; belongs at D alongside AfterHours' invite, arguably the same implementation |
| `stream.watch` | C, reused | Mood/relationship note if watched with someone, a still of the show |
| `codex.open-npc` | A | Profile screen |
| `codex.confront` / `-spread` / `-matchmake` | C, fresh | Real narrative beats — reaction, relationship deltas, sometimes an image |
| `phone.camera-take` | C, fresh | It's already a photo action — this tier was already right |
| `phone.camera-view` / `-share` | A | Inline, viewing your own roll |
| `phone.set-alarm` / `-clear-alarm` | A | Visible on the Clock app |
| `phone.settings-*` / `tracker-dismiss` / `-snooze` | A | Settings/tracker UI |
| `phone.pickup` / `drop` / `plug` / `unplug` | A | World-object state, visible immediately |

### Social / conversation
| Verb | Tier | Outcome window shows |
|---|---|---|
| `talk` / `conv.send` / `conv.leave` etc. | A | Conversation is already its own dedicated UI — the window's job is to hand off into it (D6), never to run alongside it |
| Conversation attachments (share photo, give gift) | — | Folds into the conversation pane, not a separate window — consistent with D6 |
| `ask-contact` | C, fresh | Got the number or was turned down, a reaction image |
| `invite-dinner` | D | **Retagged, D8** — a real scheduling picker, same mechanism as AfterHours' invite |
| `give-item` | C, fresh | What was given, their reaction |
| `apologize` | C, fresh | How it landed, severity change |
| `overture.accept` / `-decline` | C, world-triggered | **Revised, D7** — the NPC-initiated gate itself: "You see \[name\] — they look like they have something to say." Engage → D6 handoff into conversation. Ignore → closes, costs nothing |
| `ask-to-leave` | C, fresh | A real, consequential beat — how they took it |
| `write-note` | A | Object appears in the room |
| `search-room` | C, fresh | What was found (or that nothing was), a discovery beat |
| `search-phone` | C, fresh | What was found, an image of the search moment |
| Caught-peeping-by-an-NPC reaction (Confront/Invite/Cold) | C, likely D6 handoff | Existing bubble pattern — migration candidate (see Open questions); "Confront" naturally continues into real dialogue |

### Asks (`$AskId` tree)
| Category | Tier | Outcome window shows |
|---|---|---|
| All ask leaves (Meal/Hangout/Loan/Repay/Gift/Chore/Photo/Intimacy/Info) | A | These resolve *inside* the conversation UI by design (asks.js's whole point is conversational phrasing) — a separate window would fight that, not help it. `RequestMeal`'s scheduling should end up sharing D8's picker mechanism where it overlaps |

### Intimacy / romance
| Verb | Tier | Outcome window shows |
|---|---|---|
| `make_a_move` | D | Partner/act picker unchanged; resolves into whichever act's own Tier-C outcome |
| `intimacy.quickie` / `.sex` / `.cuddle` / `.share_shower` | C, fresh | Narration + generated frame, relationship/desire/mood deltas |
| `bed.interact` → `sleep_with` / `sleep_watch` | C, fresh | The roll's outcome (uncaught/refuse/reciprocate/shame), narrated plainly |
| `boundary.throuple` | C, fresh | Configuration result, relationship deltas for both |
| `pregnancy.start-trying` / `-stop-trying` | A | Flag toggle, visible in a status readout |
| Interruption reaction (Sorry/Own It) | C, possible D6 handoff | Existing bubble pattern — migration candidate; a badly-landed "Own it" could hand off into a real confrontation |

### Stealth / voyeurism
| Verb | Tier | Outcome window shows |
|---|---|---|
| `door.keyhole` / `door.listen` | D | **Already built** — `peek.js`'s overlay is this plan's reference implementation, not just its prototype (pending the migration confirm — see Open questions). Caught resolution shows the door-opens beat inline (D9); `confront`/`engage` outcomes use the D6 handoff into real conversation instead of just closing |
| `peep` (one-off) | C, fresh | Detection roll outcome, what was seen, one frame if not caught; caught follows the same D9 handoff shape as keyhole |
| `knock` | C | See Movement — overt alternative to peeking |

### Renovation / decor
| Verb | Tier | Outcome window shows |
|---|---|---|
| (see Work/Money and Computer/Phone — `upgrades.*`, `home.place-*`) | — | Already tiered above |

### Skills
Skills have no verbs of their own — XP is a side effect folded into the
owning verb's existing delta strip (cooking, dishes, swim, `classes.attend-lesson`).
No separate tier.

### Sleep
| Verb | Tier | Outcome window shows |
|---|---|---|
| `sleep` | C | Hours slept, energy restored/deficit, alarm-interrupted vs. natural waking — image is the D11 Dream Engine hook, not designed here |

### Other / misc
| Verb | Tier | Outcome window shows |
|---|---|---|
| `scene.image-info` / `-reroll` | A | Already its own small UI |
| `self.read_note` / `-bin_note` | A | Note content is its own display |
| Container transfers (`open`/`close`/`take`/`put`/etc.) | A | Inventory UI shows this instantly |
| `inventory.use` / `-drop` / `-trash` / `-place` | A | Same |
| `sound.play` / `-set_volume` / `-eject` | A | Stereo UI state |
| Grouping-parent chips (`door.interact`, `wardrobe.interact`, `bed.interact`) | — | Never themselves execute — no window applies |
