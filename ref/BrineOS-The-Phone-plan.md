# BrineOS — the phone

Status: **ALL NINE PHASES COMPLETE (2026-08-04).** Phase 0 (pre-flight
refactors), Phase 1 (banking + softlock fix), Phase 2 (the phone as an
object), Phase 3 (the shell), Phase 4 (Tracker), Phase 5 (app parity +
connectivity + L11), Phase 6 (Alarm/Clock), Phase 7 (Autopay), Phase 8
(Camera and Gallery), Phase 9 (privacy and snooping) — every checklist item
implemented and verified against running code with exact values, not just
"it didn't throw." Plan written 2026-08-03.

Companion docs: `ref/ARCHITECTURE.md` (as-built), `ref/economy-and-rent-plan.md`,
`ref/vocation-and-gigs-plan.md`, `ref/sleep-and-alarm-plan.md`.

---

## Context

The game has deep systems and no **bite**. Rent pressure, burnout, utility
cutoffs, gig deadlines and tax quarters are all real data in `gameState`, but
**nothing in the codebase surfaces them proactively** — a `grep` for
`notification|agenda|dueSoon|reminder|toast` across `src/srcfiles/` returns
zero hits. The player only discovers trouble by going and looking for it. A
vise that never visibly tightens doesn't feel like a vise.

BrineOS is the fix: a phone that is **the thing that pulls at you**, where the
computer is **the thing you sit down at to produce**. It carries a global
Tracker (an agenda/quest-log "Brain" for every obligation in the game), a
notification spine, a Banking app that centralises bill pay, and enough app
parity that the phone is genuinely useful — plus the physicality of a real
object you can leave in the wrong room.

**Intended outcome:** the player is told what is bearing down on them, at the
moment it happens, and always has somewhere to tap to act on it.

### It also fixes a shipped softlock

`bills.pay` / `bills.pay-all` are emitted **only** from the computer's bills
dashboard (`render.computer.js:2182,2198`), and `doComputerOpen` refuses to
open when power is cut (`ui.computer.js:11`). Rent has a world-chip escape
hatch (`render.js:499`); **electric does not**. So: electric goes overdue →
power cuts → computer dies → the electric bill can never be paid. An
unrecoverable save. Phase 1 fixes this independently of the phone.

---

## Design principles

These are decisions already made. Do not relitigate them mid-build.

1. **PC produces, phone pulls.** You *can* work from the phone — it is slow
   and costs more energy per unit of progress — but the PC is where real
   throughput lives. Redundancy elsewhere is fine and desirable: modern
   phones and computers overlap, and the player picks by convenience.
2. **Nothing forces the player's attention.** Every notification can be
   denied, snoozed, or silenced. An ever-present phone button with a badge
   is the only permanent intrusion.
3. **Silencing blinds, it never shields.** Snoozing a rent notification does
   not move the due date. Muting the client does not extend the deadline.
   The phone is pure information; it is never a buffer against consequences.
   This preserves "the bills are the only pressure."
4. **The Tracker is read-only.** It tells you everything and controls
   nothing. Every row deep-links to the app that does control it.
5. **Derive, don't sync.** Wherever a thing can be recomputed from existing
   state, recompute it. This codebase's recurring bug class is two sources
   of truth drifting apart. Persist only what is genuinely player intent
   (dismissals, settings, the camera roll).
6. **The phone is a physical object.** It has a location. It can be left
   behind, plugged in, found, and read by someone else.

### Inherited hard invariants — do not break

- **Zero LLM inside `resolveTick` / `resolveBatch` / `processDayRollover`.**
- `applyEffects` stays **synchronous and in-memory only**.
- `state.js` is the **sole kv access point**.
- **No magic numbers** outside `config.js` / `defs.*.js`.
- `render()` is **idempotent, state→DOM only**. (Note: the "zero inline
  styles" rule is already relaxed for the computer's dynamic window
  geometry — `render.desktop.js:204-209`. The phone has fixed geometry, so
  it must stay fully class/`data-*` driven: bucket battery to 5% steps with
  pre-authored CSS, exactly like `.fill[data-fill="N"]` at `render.js:60`.)
- **Max 2 active NPCs** (`SCENE.maxActiveNpcs`); IM threads are 1.
- **NPC bibles are frozen.**
- Seeded ids only — never `Date.now()` for anything persisted.

### Source layout note

All sources are at `C:\Projects\Slice-Of-Life\src\srcfiles\*.js` (**not**
`src/*.js` — `ref/HANDOFF.md` is stale on this). `main.html` loads each as a
plain `<script src="...?v=N">` in a documented, order-sensitive sequence;
**bump the `?v=` cache-bust param on every edit**. There is no build step and
no test harness.

---

## Architecture decisions

### A. State split

New `world.phone` holds **shell state + phone-only app state**:

```js
{
  power: 'off',              // 'off' | 'on'  (screen on, not battery)
  openAppId: null,
  navStack: [],              // [{ appId, screenId, params }]
  settings: { dnd: false, passcode: false },
  camera: { roll: [] },
  dismissed: {},             // notifKey -> day dismissed
  snoozed: {},               // notifKey -> day to resurface (integer day)
}
```

**Shared app data stays at `world.computer.apps`** — not moved, not renamed.
Gigs, browser, IM, shop, classifieds, services, classes, stream and invest
are *account* data, and the fiction is "same accounts, different device."
This means every existing renderer and `do*()` handler works unmodified and
there is **zero save migration**.

Do **not** add a `getAppState(gs, appId)` indirection. 23 renderers hardcode
`gs.world.computer.apps.*` and `resolveScreenSource` reduces `state:` paths
literally against `gs.world.computer` (`render.computer.js:110-119`). An
accessor used only by new code buys nothing — a future rename would still
touch all 23. Either rename everything in one mechanical pass or leave it
alone. **Leave it alone.**

Do **not** add `world.phone.present`. Presence is derived from the object's
bucket (decision B). Two sources of truth will desync.

`world.phone` must be added to **all three** `state.js` sites or it silently
won't persist: `saveAtBoundary` (~line 411), `loadGameState` (~639),
`writeGeneratedGameState` (~736).

### B. The phone is a world OBJECT, not an inventory item

Only objects have per-instance identity, mutable `state`/`flags`, a
`contents` slot, and can sit alone in a room bucket. An item stack cannot be
"left on the kitchen counter" — there is no floor, item stacks exist only
inside containers or the player.

```js
phone: {
  id: 'phone', label: 'Phone', nouns: ['phone', 'cell', 'cellphone'],
  portable: true, breakable: true, container: false, private: true,
  unique: true,                                  // NEW flag — see below
  states: { plugged: ['unplugged', 'plugged'], lock: ['unlocked', 'locked'] },
  defaultState: { plugged: 'unplugged', lock: 'unlocked' },
  affords: ['phone.use', 'phone.pickup', 'phone.drop', 'phone.plug', 'inspect.object'],
  imagePhrase: 'a phone face-down on the surface',
  // NO dirtyWhen, NO cleanlinessWeight — see landmine L6
  // NO evidenceKinds until Phase 9 — see landmine L7
}
```

Battery is **numeric `flags.battery` (0–100)**, *not* `state`. `obj.state`
values must stay string enums; `cleanRoomObjects` and
`validateObjectStateChange` both depend on that.

Spawns via `APARTMENT_LAYOUT.bedroom_player` with `APARTMENT_LAYOUT_VERSION`
bumped 2→3 (`defs.world.js:438`).

**Pick up / set down / plug in become the first-ever callers of the dead
`MOVE_OBJECT` effect** (`effects.js:394`, `applyMoveObject` at
`effects.js:248`) — plumbing that has been laid and unused since P1.

### C. Presence and charging

The phone is **usable** when `bucket === 'carry_player'` **or**
`bucket === 'room_' + player.location`.

**When it is in another room, nothing gets through.** No badge, no
notifications, no tracker. This is the whole point of the leave-behind
mechanic — if notifications reach you anyway, leaving your phone somewhere
costs nothing and the Phase 9 snooping premise has no tension. The
always-visible phone button shows an "elsewhere" state instead.

Charging requires a **room bucket** + `plugged` + power not cut off. Moving
to `carry_player` auto-unplugs. Charging meters the existing `devices` meter
(`recordUtilityUsage(gs, 'devices', n)`, `computer.js:1457`) so it shows up
on the electric bill, per the "NPC behaviour must show up on the bills"
invariant applied to the player.

**Battery drains at sim checkpoints** (every `TIME_DILATION.simCheckpointMinutes`
= 30 accumulated game-minutes), *not* at day rollover — a once-a-day drain
would be a midnight step function. **Verify the discrete path
(`advanceAndResolveMinutes` → `pendingCheckpointMinutes`, `time.js:247`)
also fires checkpoints**, or sleeping 8 hours will cost zero battery.

### D. Tracker and notifications are ONE derived pass

`buildTrackerEntries(gs)` runs read-adapters over every obligation source and
returns a sorted array. Notifications are the **same data** filtered to
"urgent and not dismissed." Persist only `dismissed` / `snoozed` maps keyed
by a **deterministic key** (e.g. `bill:electric:due:47`).

This deletes the need for a `world.notifications` queue entirely, makes
idempotence free rather than a discipline, and avoids the failure mode where
a generator call site is forgotten (missing notification) or doubled.

**Do not** schedule anything in minutes. `meta.clock.minutes` is a **float**
during continuous play. All obligations in this codebase are bare integer
day numbers compared with `>=` (`isDueToday`/`rescheduleDue`, `sim.js:156`).
Snooze is an integer day. For stamping records, use `day` +
`getTickIndex(minutes)` (`sim.js:205`), the pair `processNpcImMessages`
already uses (`drives.js:322`).

One-shot confirmations ("gig accepted") are **not** notifications — they are
`addLogEntry` calls. Don't persist them.

### E. The phone shell is an OVERLAY, not a mode switch

The computer takes over the viewport via `#app[data-mode="computer"]`. The
phone must instead layer **above the game and above the computer**, so the
player can glance at it mid-activity.

- New CSS token `--z-phone: 170`. **Not 150** — `main.html:64-72` already
  defines `--z-computer-taskbar: 150` and `--z-computer-startmenu: 160`,
  inside the deliberate `--z-drawer: 100` / `--z-overlay: 200` gap.
- The `#phone-screen` node must be a **sibling of `#computer-screen` at
  `#app` level**, never inside it — `#computer-screen` is CSS-hidden unless
  `data-mode="computer"`.
- Rendered by a new `renderPhoneScreen(gs)` called as a **sibling** of the
  existing `renderComputerScreen(gs)` line at `render.js:26`. Because
  `renderComputerScreen` early-returns when the computer is off
  (`render.desktop.js:37`), anything phone-related placed inside it would be
  dead whenever the computer is off. Adding a sibling call means **none of
  the 68 `renderComputerScreen()` call sites in `ui.computer.js` need to
  change.**
- On a genuinely phone-shaped viewport, `isDesktopShellCompact()`
  (`render.desktop.js:24`) already forces computer windows fullscreen — so
  the phone overlay will sit on top of a fullscreen fake-desktop. Decided:
  the phone is a fixed bottom-right overlay (`--z-phone: 170`) that floats
  over the fullscreen desktop, which stays visible and clickable around it;
  the FAB opens/closes it. Recorded with the Phase 3 acceptance notes.

### F. Connectivity asymmetry

Phone works if **home internet is up OR phone service is up**.

- Home internet cut → phone still works on cellular (**degraded but
  survivable** — exactly the compounding-not-fatal failure the economy plan
  asks for, and the reason work-from-phone exists).
- Power cut → phone can't charge → dies in about a day.
- `BILL_DEFS.phone` (`config.js:291`) currently has `cutoff: null`. Giving it
  a real cutoff requires **all three**: `cutoff: 'phone'` on the def,
  `'phone'` added to `BILL_CUTOFF_IDS` (`config.js:332`), and a
  `BILL_CUTOFF_EFFECTS.phone` entry (`config.js:337`) — or the cutoff never
  activates.

**`BILL_CUTOFF_EFFECTS.*.blocksApps` is dead data.** Verified: it appears
only at `config.js:338-341` and is read by nothing in all 28 source files.
Real gating is five hardcoded `isCutoffActive` calls in `ui.computer.js`
(lines 11, 111, 115, 187, 1014) plus four `ACTION_REQUIREMENT_CHECKERS`
(`defs.actions.js:219-222`). In Phase 5, either wire `blocksApps` up for real
with a device dimension **or delete it** — do not leave a third dead registry
next to `MOVE_OBJECT` and `obj.discovered`.

---

## Landmines

Every one of these was verified against the code. They will bite.

| # | Landmine | Where | Consequence |
|---|---|---|---|
| L1 | `switchScreen` is hardcoded to `world.computer.windows[appId]` and early-returns on a missing window | `computer.js:210-215` | Renderers emit `data-action="computer.open-screen"` (`render.desktop.js:143`, `render.computer.js:191`). Pressing Back in a phone-rendered Browser mutates a *computer window* or silently no-ops. **Renderers are NOT reusable verbatim until nav is device-parameterised.** |
| L2 | `setTimeContext` is a single scalar, last-writer-wins, with **15 call sites** | `time.js:41`; `ui.computer.js:19,35,124,126,310,331,349,377`; `ui.js:1316,1371,1542,1626,1651,2051,2244` | An overlay opened mid-conversation (scale 1) and closed restores `idle` (scale 20) — the conversation then runs 20× too fast. Several sites already hand-roll `prevContext` save/restore; `ui.js:2051,2244` already special-case computer power. The model is straining before the phone exists. |
| L3 | `validateObjectPortable` reads `ctx.roomObjects` only | `effects.js:112-117`; reach set built at `effects.js:508`, callers `actions.js:34`, `stealth.js:46`, `npc.js:837` | `carry_player` is never in the reach set, so **pickup validates but drop returns "Not reachable."** Do NOT widen the reach set — `MOVE_OBJECT` is `llm: true` and room-scoping is the documented anti-hallucination wall (`effects.js:91-93`). Route player pickup/drop as a **trusted producer** instead (the `performCleaningVisit` pattern, `computer.js:748`, which passes `{}` for roomObjects). |
| L4 | `normalizeComputerState` keeps saved windows for **unknown appIds** as long as they have a `rect` | `computer.js:127-130` | Renaming `bills`→`bank` leaves a permanently invisible, uncloseable window entry: `renderWindows` `continue`s on the undefined app (`render.desktop.js:173`) while `renderTaskbar` iterates `APP_DEFS` so no button exists. **Add an unknown-appId prune before renaming anything.** |
| L5 | Layout backfill dedupes by `defId` **within the room bucket only** | `world.js:112-123` | If the player is *carrying* the phone when `APARTMENT_LAYOUT_VERSION` is next bumped (for any unrelated fixture), `room_bedroom_player` lacks `defId:'phone'` → **a second phone spawns.** Every future bump spawns another. Fix with a `def.unique` guard that scans all buckets. |
| L6 | `cleanRoomObjects` resets every `dirtyWhen` key to `def.states[key][0]` | `computer.js:714-728` | If `lock` were ever in `dirtyWhen`, a housekeeper visit would silently flip the phone's lock state. **Give the phone no `dirtyWhen` and no `cleanlinessWeight`.** |
| L7 | `pickEvidenceObject` selects on `private && evidenceKinds.length` | `stealth.js:26-33` | Giving the phone `evidenceKinds` early makes it a `LEAVE_EVIDENCE` target for the *player's own* sneaking whenever it's in the room being sneaked into. **Withhold `evidenceKinds` until Phase 9.** |
| L8 | The evidence-discovery pass scans only `room_${location}` where `roomOwnerId(location) === id` and takes the **first** undiscovered match | `sim.js:617-638` | An NPC only searches *their own room*, so a phone left in your bedroom is never found. Phase 9 needs its own pass, not a reuse. Also `EVIDENCE_KIND_TEXT[kind]` (`sim.js:632`) must have an entry or `template` is `undefined`. |
| L9 | `obj.evidence` is a **single slot**, not a list | `effects.js:302` | A camera roll of N photos does not map onto it without a shape change. |
| L10 | Image cache is an **LRU capped by `IMAGE_CACHE.cap`**; `saveAtBoundary` deletes evicted keys | `state.js:592-626` | Photos carrying evidence would silently vanish. **Store the prompt + seed and regenerate on demand**; never treat the blob as the record. |
| L11 | `afterHoursMasturbating` is a sticky boolean whose only force-clear is `closeComputer` | set `ui.computer.js:322`; cleared `computer.js:279`, `ui.computer.js:308,347,375`; read `sim.js:217`, `interruption.js:160`, `render.computer.js:452` | There is **no phone equivalent of walking away from the monitor.** Pocket the phone mid-session and the player is permanently "masturbating" to the peep system — while walking through the kitchen. This exact bug class is documented at `computer.js:271-276` as having already happened once. **See the Phase 5 fix.** |
| L12 | `svgIcon(app.id)` returns `''` for unknown ids | `icons.js`; called `render.desktop.js:54,74,101,117` | `bills`, `upgrades` and `invest` already render blank. Every new/renamed app id needs an `ICONS` entry. |
| L13 | `meta.clock.minutes` is a **float** during continuous play | `time.js:94` | Never key an id or a comparison off it. |

---

## Phases

Each phase is independently shippable and should be committed separately with
`ref/ARCHITECTURE.md` updated **in the same commit**. Check boxes (UPDATE THIS DOCUMEENT) as they land.

### Phase 0 — Pre-flight refactors (no visible change)

These are invisible-until-broken and far harder to retrofit once 11 apps sit
on the phone. **Nothing else may start before these land.**

- [x] **0.1 Time-context derivation.** Replaced the `setTimeContext` scalar
      (`time.js:41`) with a **push/pop stack over a derived base**: base =
      `computeTimeContext(gs)` (masturbating > browsing > idle, read from
      durable state; rebuilt via `resetTimeContext(gs)` on boot), transient
      surfaces (conversation, sleep, work block, masturbating session) push
      on top and pop off. All 15 imperative call sites removed (L2). The
      "pure function" option was judged too invasive because conversation
      is module-level `convState`, not gameState — the stack is the plan's
      sanctioned fallback and satisfies the acceptance nesting tests
      (`idle > conversation > browsing > conversation > idle`, and
      sleep-mid-conversation restoring conversation).
      *Acceptance:* VERIFIED — overlay open/close restores correct scale at
      every nesting via live-page stack simulation.
- [x] **0.2 Device-parameterised screen navigation.** `switchScreen`
      (`computer.js`) now takes `device='computer'`; a non-computer device
      navigates `world.phone.navStack` (safe no-op until Phase 3). Computer
      window shells emit `data-device="computer"` (`render.desktop.js`
      buildWindowShell); the click dispatcher reads
      `event.target.closest('[data-device]')` and passes it through, and
      `doComputerOpenScreen` branches on it. No module-level `activeDevice`
      global.
- [x] **0.3 Unknown-appId prune** in `normalizeComputerState` — windows only
      kept when `win.rect && APP_DEFS[appId]`; `focusedAppId` re-guarded
      against pointing at a pruned window (L4).
- [x] **0.4 `def.unique` guard** in `ensureAllObjectBuckets` — back-fill is
      now a second pass run after every bucket is loaded, and skips a
      `unique` def already present in *any* bucket (`objectDefIdExistsAnywhere`),
      so a phone carried or left in another room can't be duplicated by a
      layout bump (L5). VERIFIED: spawn-when-absent, skip-when-present, and
      carried-phone cases all produce exactly one instance.

### Phase 1 — Banking, and the softlock fix (computer only)

Do the `APP_DEFS` churn while only one device reads it.

- [x] **1.1** Merge `bills` + `invest` into one `bank` app ("Brine Bank" or
      similar) with screens `overview` / `bills` / `invest`, reusing the
      existing `bills-dashboard` and `invest-dashboard` renderers
      (`render.computer.js:43,45`) unchanged.
      *Done:* `defs.computer.js` — one `bank` app, entryScreen `overview`,
      screens `overview`/`bills`/`invest` reusing `bank-overview` (new),
      `bills-dashboard`, `invest-dashboard`. Data stayed put
      (`world.bills`, `computer.apps.invest`) so reused renderers/handlers
      work unmodified. Old-save `bills`/`invest` windows are auto-pruned by
      normalizeComputerState's unknown-appId prune (verified).
- [x] **1.2** Add an `ICONS.bank` entry (L12).
      *Done:* bank/wallet line-art, same 24×24 stroke=currentColor contract.
- [x] **1.3** Overview screen shows: balance (`player.money`, presented as
      Checking), tax reserve (`world.taxes.reserve`), portfolio value
      (`getPortfolioValue`), and total outstanding bills. **No new account
      types** — these four are already real. Savings accounts are scope
      creep; see Deferred.
      *Done:* `renderBankOverview` (render.computer.js) — Net Worth hero +
      three balance cards + Outstanding list with cutoff pills; registered
      in `COMPUTER_RENDERERS`. Verified all three tabs render.
- [x] **1.4 Fix the softlock.** Make bill payment reachable when the power is
      cut. Cheapest correct fix: a world action chip (mirroring
      `Pay Rent` at `render.js:499`) shown whenever any bill has
      `cutoffActive`. This is a real shipped bug and worth landing on its own
      merits.
      *Done:* render.js "Pay Bills (service cut off)" chip when any bill has
      `cutoffActive`; ui.js `case 'pay-bills'` → shared
      `doPayBillsFromWorld()` (ui.computer.js `doBillsPayAll` now delegates
      to it); `'pay-bills'` added to `ENERGY_GATE_EXEMPT` so it works at 0
      energy.
      *Acceptance (verified):* set electric overdue → cutoff → chip appears
      in the Here tab, clicking pays balance + `reconnectionFee`
      (3800→3637, cutoff cleared, service restored).
- [x] **1.5 Truthful payment reporting.** Found during Phase 1 review, after
      1.4 landed. `payAllBills` returned the same
      `'Nothing to pay right now.'` for two opposite situations: nothing
      owed, and bills owed that the player can't afford. Because 1.4's world
      chip appears *only* when a bill is `cutoffActive`, the unaffordable
      branch is **guaranteed reachable** — a broke player with the power cut
      clicked "Pay Bills (service cut off)" and was told there was nothing to
      pay. Separately, `doPayBillsFromWorld` logged "You pay off **all** your
      bills" even when `payAllBills` had skipped the ones it couldn't cover.
      *Done:* `payAllBills` (computer.js) now tracks `owedCount` and the
      cheapest unaffordable bill, returns `unpaidCount` + `cheapestUnpaid` on
      success, and on total failure distinguishes "Nothing to pay right now."
      from "You can't cover any of it. Cheapest is X at $N, and you have $M."
      `doPayBillsFromWorld` (ui.js) reports "You pay what you can … N bills
      still outstanding" whenever `unpaidCount > 0`.
      *Acceptance (verified, exact values):* nothing-owed → correct message;
      cut-off-and-broke ($50 vs Electric $260+$40) → names the $300 shortfall,
      money untouched, cutoff intact; partial ($150) → pays Internet $80,
      leaves Electric cut off, `unpaidCount: 1`, money 150→70; affluent
      ($5000) → pays $300 incl. reconnection, cutoff cleared, money 5000→4700.

**Phase 1 status: COMPLETE.** All five items verified against running code.
Note that a player who is broke *and* has no power is still in a genuinely
hard spot — that is a legitimate fail-state, not a softlock, and the intended
climb-out is Phase 5's connectivity asymmetry (work from the phone on
cellular while the battery lasts). The unrecoverable-save bug is fixed.

### Phase 2 — The phone as an object

- [x] **2.1** `OBJECT_DEFS.phone` per decision B. Add to
      `APARTMENT_LAYOUT.bedroom_player`; bump `APARTMENT_LAYOUT_VERSION` to 3.
      *Done:* `defs.world.js:71` (def), `:467` (layout placement), `:457`
      (version 3). No `dirtyWhen`/`cleanlinessWeight` (L6) and no
      `evidenceKinds` until Phase 9 (L7), as specified.
- [x] **2.2** Pickup / set-down / plug-in / unplug as **trusted-producer**
      `do*()` handlers calling `applyEffects` with a trusted ctx (L3).
      `effects.js` should need **zero changes**.
      *Done:* `defs.actions.js:182-203`. `effects.js` unchanged.
- [x] **2.3** `flags.battery` 0–100. Drain at sim checkpoints; charge when
      plugged in a room with power. Meter `devices` while charging.
      *Done:* `advancePhoneBattery`/`isPhoneCharging` (world.js), called from
      `advanceAndResolve` — which both the continuous checkpoint path and
      every discrete action flow through, so an 8-hour sleep still costs
      battery (decision C's "verify the discrete path" note).
      *Verified:* charge +6/tick, drain −2/tick (matching `PHONE` config),
      `devices` meter +0.5 per charging tick, and pocketed-but-plugged
      correctly refuses to charge.
      *In-play (2026-08-04, real kv-plugin save, day 5):* plugged in the
      bedroom, an 8-hour sleep via `doSleep` (the discrete path — 16 ticks,
      clock 02:01→10:01) took battery 20→**100** (capped; 16×+6=+96) and
      raised `utilities.devices.count` by **exactly 8.0** (16×0.5). Both
      read back through real `root.kv` after `saveAtBoundary`. Confirmed the
      discrete path accrues battery — the pending check is closed.
- [x] **2.4** `phonePresence(gs)` → `'carried' | 'here' | 'elsewhere'`,
      derived from bucket vs `player.location`. Never stored.
      *Done, then repaired.* The first implementation had `findPhoneObject`
      discard the bucket key and `phonePresence`/`isPhoneCharging` branch on
      the denormalized `obj.bucket` **field** — so a stale field reported the
      phone `elsewhere` while it sat in the room, and blocked charging. A
      load-time canonicalization pass was added first, but that only made a
      wrong invariant true at load; the field was still what runtime logic
      trusted, and the code comment claimed the opposite of what it did.
      *Fixed:* `findPhoneObject` returns `{ obj, bucket }` from the
      `Object.entries` key; `phonePresence` and `isPhoneCharging(gs, phone,
      bucket)` branch on that structural key. The field is now decorative and
      cannot desync runtime behaviour. Canonicalization kept as
      belt-and-braces (the field is still persisted and read by `effects.js`).
      *Verified with a deliberately corrupted field:* structure
      `room_kitchen` + field `carry_player` + player in kitchen → `here`
      (was `carried`); structure `carry_player` + field `room_hallway_a` →
      `carried` (was `elsewhere`); charging with a lying field → `true`
      (was `false`).
- [x] **2.5** `world.phone` added to all three `state.js` sites.
      *Done:* `saveAtBoundary` (state.js:434-436), `loadGameState` (:705),
      `writeGeneratedGameState` (:777-778).
      *Acceptance:* set the phone down in the kitchen, walk to the bedroom,
      save, reload — the phone is still in the kitchen and presence reads
      `elsewhere`. Leave it plugged in overnight and confirm both the battery
      rise and a non-zero `devices` meter delta on the electric bill.
      *In-play (2026-08-04, same real save):* unplugged phone drained
      100→**68** through a full 8-hour sleep (16 ticks, exactly 16×−2),
      `devices` delta 0 while unplugged, and the persisted object in
      `root.kv` showed `battery: 68, plugged: 'unplugged'` after the sleep.

**Phase 2 status: COMPLETE.** Every item implemented and every verification
now done in a real kv-plugin save (the two *in-play* end-to-end runs above —
overnight charge and 8-hour sleep drain — closed 2026-08-04, with the save
snapshotted and restored afterwards so nothing in it moved).

### Phase 3 — The BrineOS shell

- [x] **3.1** New files `phone.js` (state + domain, load after `computer.js`),
      `render.phone.js` (load after `render.computer.js` — it needs
      `COMPUTER_RENDERERS`), `ui.phone.js` (load after `ui.computer.js`).
      Add `<script>` tags in load order; bump `?v=`.
- [x] **3.2** `#phone-screen` markup as a sibling of `#computer-screen`;
      `--z-phone: 170`; all shell CSS in `main.html`'s `<style id="styles">`.
      Added a second tier `--z-phone-fab: 165` for the FAB (under the open
      phone so the overlay never covers its own launch button, above the
      taskbar/start menu at 150/160). Verified: FAB z 165, phone z 170,
      taskbar z 150.
- [x] **3.3** Home screen (icon grid), status bar (clock, battery via
      `data-battery` bucketed to 5% with pre-authored CSS), back/home nav
      driven by `world.phone.navStack`.
- [x] **3.4** The **always-on-screen phone button** with an unread badge,
      visible in normal mode *and* computer mode, reflecting presence
      (`carried` / `here` / `elsewhere`).
- [x] **3.5** `renderPhoneScreen(gs)` called as a sibling at `render.js:26`.
- [x] **3.6** `phone.*` cases in `handleAction`; check whether
      `isActionExemptFromEnergyGate` (`ui.js`) needs a `phone.` clause the
      way it special-cases `computer.use`. (The `phone.` prefix clause was
      already present from the Phase 2 battery-actions work — verified, no
      change needed.)
- [x] **3.7** Settings app: **one DND boolean**. Per-notification-kind
      toggles are tuning a volume nobody has measured yet — see Deferred.
      *Acceptance:* phone opens over the game and over the computer, both
      shells render simultaneously without z-index or focus conflict, and
      the whole screen is derivable from `world.phone` (nothing in the DOM).

      **Verification (2026-08-04, live preview, real kv):** refusal to open
      while the phone is in another room (presence `elsewhere`); full open →
      home grid (9 tiles: 8 apps + Settings) → bank app reuses the computer
      renderer + screennav (Overview/Bills/Portfolia) with nav routing that
      left computer windows untouched → back to home → Settings DND toggle →
      home → close. Over a fullscreen computer both shells render
      simultaneously (phone z 170 above taskbar z 150, FAB 165); battery
      death gate at 0% refuses with "Plug it in…" (charging at 0% still
      opens — charge only moves at checkpoints); charging bolt shows when
      plugged with power. Battery buckets verified (5% → data-battery 5).
      Save snapshot/repaired after verification (phone back in `room_hallway_a`).

      **Decision E (recorded):** the phone is a fixed bottom-right overlay
      (`--z-phone: 170`) that floats over an already-fullscreen compact-mode
      computer — the fake-desktop stays fully visible and clickable around
      it, and the FAB (bottom-right, above the taskbar in computer mode) is
      what the player uses to open/close it. No mode switch.

      **Decision F (Phase 3 reading):** the battery-death gate refuses to
      *open* a 0% phone unless it's charging; a dead phone is effectively
      inert until plugged in, which is the Phase 6 "dead phone, no alarm"
      mechanic's natural foundation.

### Phase 4 — The Tracker and notifications

The payoff phase. One derived pass, per decision D.

**Phase 4 status: COMPLETE.** All five items implemented and verified live
(2026-08-04, real kv save, snapshot restored after). See the verification
block under 4.5.

- [x] **4.1** New `tracker.js` with `buildTrackerEntries(gs)` — pure, no
      persistence, no LLM. Read-adapters for each source below. Loads
      between `computer.js` and `phone.js` (`index.html`); `phone.js`'s
      `getPhoneUnreadCount` calls `getTrackerNotifications`.
- [x] **4.2** Entry shape: `{ key, kind, urgency, title, detail, dueDay,
      daysUntil, deepLink: { appId, screenId, params } }`. `urgency` derived
      from `daysUntil` + cutoff proximity. All thresholds live in the
      `TRACKER` config block (config.js) — no magic numbers in tracker.js.
- [x] **4.3** Sources to ingest (all verified to exist):

| Source | Where the due date lives | Notes |
|---|---|---|
| Rent | `player.rentDueDay`, `player.rentOwed` | Only while owed (>0) — posting day is `rentDueDay - payPeriodDays`; urgency always 100 (owed ⇒ posted); escalates at overdue 7 / 14 in the detail text |
| Bills ×7 | `world.bills[id].{dueDay,balance,status,overdueDays,cutoffActive}` | Unpaid: urgency 100, cutoff countdown (`dueDay - cadenceDays + graceDays`) in the detail. Paid-up: future agenda item, urgency **capped** at `futureRecurringMaxUrgency` so far-away charges never nag |
| Quarterly taxes | **derived** — `isQuarterEnd`, `getQuarterDay`, `world.taxes.lastQuarterBilled` | No stored date; key = next quarter-end day. Owed via `computeTaxOwed`; unpaid carried debt is urgency 100 |
| Gig deadlines | `world.computer.apps.gigs.accepted[].deadlineDay` | `blocksDone` is **fractional** — shown `x.x/blocks` |
| Quests | `world.quests.active[].expiresDay` | Expired (past `expiresDay`) is a real failure state → urgency 100 |
| Deliveries | `world.deliveries[].etaDay` | `status === 'ordered'` only — delivered packages become doormat objects and drop off on their own |
| Service visits | `world.computer.apps.services.hired[].nextDay` | Auto-visits — capped at `futureRecurringMaxUrgency` |
| IM unread | `world.computer.apps.im.threads[npcId].unread` | Already populated by `DRIVE_DEFS.text_player`; urgency per-message capped at `imUnreadMax` |
| Courses | `world.computer.apps.classes.enrolled[].progress` | **No date** — fixed low urgency, "N of M lessons" |
| Facility decay | `world.upgrades[id].condition` | **Functional+ tiers only** (broken = known opening state, lives in RenoFix); warn below `facilityWarnCondition`, critical below `facilityCriticalCondition` |
| High-tension move-out | `npc.flags._highTensionDays` | Implicit countdown = `tensionMoveOutDay - _highTensionDays`; surface as a warning |

- [x] **4.4** Notifications = the same entries filtered to urgent and not
      dismissed/snoozed. Deterministic keys (embed the posting day / gig id
      / quarter-end day, so an intent can never leak onto a future
      instance). Snooze in **integer days** (`TRACKER.snoozeOptionsDays`).
      Intents live on `world.phone.dismissed` / `world.phone.snoozed`
      (added to `defaultPhoneState`/`normalizePhoneState`); state.js's
      existing `world.phone` write sites persist them unchanged.
- [x] **4.5** Badge count, Tracker app, dismiss and snooze. Respect DND.
      **Respect presence** — `elsewhere` means nothing gets through
      (decision C).

      **Recorded decisions during implementation:**
      - The plan's "lock-screen preview list" (4.5) is fulfilled by the
        Tracker app's **Notifications screen**, since no lock screen exists
        until Phase 9. The Tracker is a phone-only shell app
        (`PHONE_TRACKER_APP_ID`, deliberately NOT in APP_DEFS — same reason
        as Settings: it must never leak onto the computer desktop). Home
        grid is now 10 tiles. Two screens (Notifications / Agenda) rendered
        via the existing `phone-screennav` + `data-device="phone"` routing.
      - DND and presence silence the **Notifications screen and badge** but
        never the **Agenda** — silencing blinds, never shields (the Agenda
        is a screen you opened, not something that interrupts you).
      - Deep links: rent/bills/taxes → `bank/bills` or `bank/overview`,
        gigs → `work/accepted`, quests/IM/tension → `im/threads`,
        deliveries → `shop/browse`, services → `services/hired`, courses →
        `classes/enrolled`, facilities → `upgrades/dashboard`. All params
        empty today (each target opens to the right screen already).
      - **Bug found & fixed (pre-existing):** the phone's shared-app path in
        `renderPhoneContent` never cleared `#phone-content` before invoking
        a `COMPUTER_RENDERERS` renderer (computer window bodies are cleared
        by `renderWindows`), so shared-app content accumulated across
        renders on the phone. Phase 4 added `body.innerHTML = ''` before the
        shared renderer call.

      *Acceptance (all verified live, real kv, snapshot restored after):*
      pay a bill and confirm its entry and notification disappear without
      any explicit clear call; dismiss a notification, reload, confirm it
      stays dismissed; snooze 1d/3d resurfacing; DND on → badge 0 +
      silenced screen while the Agenda stays full; phone in another room →
      nothing surfaces (badge 0, silenced screen, `phone.open` still
      refused); badge count matches urgent-not-intended entries; deep-link
      rows navigate the phone and Back returns to the Tracker.

      **Verification (2026-08-04, live preview, real kv):** synthetic state
      exercise of every adapter (rent 2d overdue → 100; electric/water past
      cutoff → 100 with "service cut off"; gas in grace → 100 with "2d to
      cutoff"; internet/phone/insurance paid-up → capped 10-20 agenda items;
      taxes unpaid + this-quarter estimate → 100/$778; late gig → 100/4.5 of
      10 blocks; expired + active quests; delivery eta day+1 → 75; service
      visit capped → 30; IM 2 unread → 50; course 2/5 → 15; functional
      facility at 15% → 65, at 50% and broken → absent; tension 3/7 → 75).
      Dismiss/snooze/resurface verified against the real save's world.phone.
      Layout metrics: 360×608 phone, all items fit, no title/detail
      overflow, 10-tile 4-column home grid. Save snapshot restored
      byte-for-byte (day 5, phone back in `room_hallway_a`, battery 0,
      `world.phone` pristine, test delivery removed).

### Phase 5 — App parity and connectivity

**Phase 5 status: COMPLETE.** All five items implemented and verified live
(2026-08-04, real kv save, snapshot restored after). See the verification
block under 5.5.

- [x] **5.1** Add a `devices: ['computer','phone']` field to `APP_DEFS`
      entries; filter the phone's icon grid on it. Natural extension of the
      existing registry; requires no renderer changes. The phone's home
      grid is now **derived** from the registry (`render.phone.js` +
      `phoneOpenApp` both filter on `devices`), so the `PHONE_HOME_APPS`
      roster is gone — all 10 apps are phone-hosted and the grid is 12
      tiles (10 apps + Tracker + Settings).
- [x] **5.2** Port shared apps to the phone shell. Renderers are reused
      **unchanged** — this only works because Phase 0.2 fixed navigation.
      The RenoFix (`upgrades`) app is now phone-reachable, which also
      closed a pre-existing gap: its desktop/taskbar icons were calling
      `svgIcon('upgrades')` with no such icon in the set, silently
      rendering a blank tile (L12). Added a Lucide wrench to `icons.js`.
- [x] **5.3** Connectivity asymmetry per decision F, including the
      `BILL_CUTOFF_IDS` / `BILL_CUTOFF_EFFECTS.phone` wiring and the
      wire-up-or-delete decision on `blocksApps`. **Wire-up decision:**
      `blocksApps` is now LIVE via `appBlockedReason(gameState, appId,
      device)` (computer.js), read by the gig/stream/browser handlers.
      `power.blocksComputer` is live too. Deleted dead fields:
      `power.blocksApps`, `power.spoilsFridge`, `internet.blocksGigWork`,
      `water.blocksActions`, `gas.blocksActions`, `rent.isEvictionLadder`
      (the last three live in `ACTION_REQUIREMENT_CHECKERS` /
      `rent.isEvictionLadder` was already unread — rent rollover uses its
      own ladder). `label` stays live (bills dashboard + rollover logs).
      `BILL_CUTOFF_EFFECTS.phone = { label: 'Phone service is off' }`.
- [x] **5.4** Work-from-phone penalty via a config multiplier applied at
      `computeFocusMultiplier` (`computer.js:294`) — the player can work
      from the phone, it's just bad. `WORK_TUNING.phoneFocusMultiplier =
      0.6` in config.js. `workGigBlock` and `doGigWorkBlock` carry the
      `device` through.
- [x] **5.5 Fix L11 before AfterHours ships on the phone.** Replace the
      sticky `afterHoursMasturbating` boolean with a **derived** vulnerable
      state: store a session `{ device, startedTick }` and have
      `getPlayerVulnerableState` (`sim.js:213`) return `'masturbating'` only
      if the session exists **and its owning device is still actively in
      use** (computer powered on and in computer mode; or phone open, present
      and unlocked). This is self-healing — pocketing the phone, locking it,
      battery death and power loss all end the session with no force-clear
      call to forget. Do **not** try to patch this by adding more clear
      sites; that is the bug pattern documented at `computer.js:271-276`.
      *Acceptance:* start an AfterHours session on the phone, pocket it, walk
      into a room with an NPC — confirm no peep event fires.

      **Recorded decisions during implementation:**
      - **`isAfterHoursSessionActive(gs)`** (computer.js) is the single
        derived check. Computer: `computer.power === 'on'`. Phone:
        `world.phone.power === 'on'` **AND presence `'here'`** AND object
        `state.lock !== 'locked'` AND not (battery ≤ 0 && !charging). The
        presence read is strict: `'carried'` (the pocket) is NOT active —
        L11's exact bug is being flagged masturbating *while walking
        through the kitchen* with the phone in your pocket, and decision C's
        "usable when carried" covers the phone *working*, not being *in
        use*. A phone-in-hand session therefore needs the phone set down in
        the room; `doAfterHoursMasturbate` guards this on the phone device
        ("Set the phone down somewhere you can use it first.") so the
        Masturbate button gives feedback instead of silently not starting.
      - **Session record** replaces the flag on `apps.browser`:
        `afterHoursSession: { device, startedTick }` (plus the existing
        `afterHoursWarmupUntilMs` wall-clock deadline). `startedTick` is the
        absolute game-minute so the session timer survives midnight (was
        `afterHoursSessionStart`). Explicit terminators — Stop, Cum,
        Close-player — clear the record (the sanctioned clear sites) and
        pop the time context; `closeComputer` clears nothing (it powers off
        and the derived check self-heals, now documented in place of the old
        flag-clearing comment). Old saves with a stale
        `afterHoursMasturbating: true` and no session record read as
        inactive — no migration needed.
      - **Time context** (`time.js`): `masturbating` was removed from
        `computeTimeContext`'s base (a phone session can't be reconstructed
        as a static base). New `reconcileTimeContext(gs)` keeps a
        `'masturbating'` stack frame in sync with the derived session on
        every `getTimeContext()` read — the fast path (push/pop from the
        terminators) is unchanged, and the reconcile is the safety net that
        clears a stale frame on a derived exit. The interruption
        pre-generation guard (`interruption.js`) and the AfterHours render
        (`render.computer.js`) both read `isAfterHoursSessionActive`.
      - **Connectivity model** (decision F, enforced in `appBlockedReason`):
        phone online apps (work/stream/browser) are blocked only when **both**
        `internet` (wifi) AND `phone` (cellular) cutoffs are active; the
        computer needs only its wifi. Bank / upgrades / shop / classes /
        classifieds / IM / services are **never** connectivity-gated — bill
        payment must stay reachable (Phase 1 softlock rule). Power cutoffs
        kill the computer but never the phone (battery). The phone bill now
        cuts off (`BILL_DEFS.phone.cutoff = 'phone'`), posted by the same
        rollover path as power/water/gas.
      - **Tracker keeps notifying about bills even while payoff is blocked.**
        Bill entries are pure info and their deep-link is `bank/bills`, which
        is never connectivity-gated — the tracker nagging about an unpaid
        phone bill is a reminder, not a dead end.
      - **Bug found & fixed (pre-existing):** the Character Studio's
        `studioSliderField` wrote its live value via
        `document.getElementById(...)` — with the same studio screen now
        renderable on phone and computer at once, the slider updated the
        *first* matching id in the document (the other shell's label).
        Scoped the read to the field's own wrap.

      **Verified live (2026-08-04):** phone home grid = 12 tiles incl.
      classifieds + upgrades; upgrades opens on the phone with its icon;
      `appBlockedReason` matrix — computer (power→all blocked, internet→
      work/browser/stream blocked, bank/classes stay up), phone (single
      cutoff→null, both→work/browser/stream blocked, bank/shop/upgrades
      stay up); phone bill cutoff activates via `processBillsForDay`;
      `workGigBlock` phone progress = computer × 0.6; full L11 scenario —
      session active in-room (`getPlayerVulnerableState` =
      `'masturbating'`, Cum/Stop render on the phone), pocketed → `null`,
      restored in-room → active again, explicit terminator → cleared; power
      off / lock / battery-death all read inactive; stale legacy bool with
      no session reads inactive; time context = 'masturbating' (3×) during a
      session and self-heals to browsing on power-off with no terminator.

### Phase 6 — Alarm and Clock

**Premise correction, found at the start of this phase:** the plan text
above assumed the alarm was unbuilt and living partly on the computer. Both
were wrong. `ref/sleep-and-alarm-plan.md`'s "Not built" header was stale —
`player.alarm`, `doSetAlarm` (ui.js), `resolveSleepHoursWithAlarm` (sim.js),
and the free-text intent `matchAlarmIntent` ("set alarm for 7", intent.js)
were all already implemented and working, reachable only by typing a
command. Grepping `computer.js`/`render.computer.js` for `alarm` turned up
zero real hits (one character-quirk string, one unrelated CSS comment using
the word "alarming") — there was never a computer-side surface to remove.
6.3 as originally scoped doesn't apply; nothing needed deleting.

**Phase 6 status: COMPLETE.** Real scope: give the pre-existing mechanic a
phone UI, and wire in the one piece that genuinely didn't exist — the dead
-phone dependency.

- [x] **6.1** Clock app on the phone. **Phone-only** — this is the one app
      that does not stay on the computer.
      *Done:* `PHONE_CLOCK_APP_ID` (phone.js), same shell-app pattern as
      Settings/Tracker (deliberately not in `APP_DEFS`). `renderPhoneClock`
      (render.phone.js): live time/date, current alarm status, an hour-grid
      of buttons spanning `SLEEP.alarmMinHour..alarmMaxHour` (no hardcoded
      bounds), and a "No Alarm" clear button. Both dispatch to the existing
      `doSetAlarm(hour)` directly (`phone.set-alarm` / `phone.clear-alarm`
      cases, ui.js) — no new domain logic, the phone is purely a face on
      `player.alarm`. `render()`'s existing sibling call to
      `renderPhoneScreen` (render.js:26) means `doSetAlarm`'s own
      `render()`/`saveAtBoundary` already keeps the phone screen in sync;
      no wrapper function was needed.
      **Side effect:** the 12-hour formatting formula
      (`hour === 0 ? 12 : ...`) existed inline in both `doSetAlarm` and the
      HUD's alarm status line — adding a third copy for the Clock face
      would have been the point to stop. Consolidated into one
      `formatHour12(hour)` in sim.js (next to `formatTime`/`formatDate`,
      loads before all three consumers); the two existing call sites were
      switched over, not left as duplicates.
- [x] **6.2** Alarm caps a night, never extends it (invariant 3 of the sleep
      plan). Bounds `SLEEP.alarmMinHour` / `alarmMaxHour`.
      *Confirmed, not rebuilt:* `resolveSleepHoursWithAlarm` (sim.js) already
      implements this correctly — verified by direct call, not just reading
      the code (see 6.4's acceptance run below, which exercises the same
      function).
- [x] **6.3** ~~Remove the existing alarm surface from `computer.js` /
      `render.computer.js`~~ — **N/A, see the premise correction above.**
      Nothing existed there to remove.
- [x] **6.4** A dead phone means **no alarm fires.** This is the mechanic
      earning its keep — confirm it's survivable, not merely punishing.
      *Done:* this was the one real gap — `doSleep` read `player.alarm`
      unconditionally, with zero dependency on the phone object at all.
      Added a battery-dead check in `doSleep` (ui.js) using the same gate
      `doPhoneOpen` already uses (`getPhoneBattery(gs) <= 0 &&
      !isPhoneCharging(...)`): if the phone is dead and not charging at the
      moment the player falls asleep, the effective alarm hour for that
      night is `null` — the alarm doesn't fire — but `player.alarm` (the
      saved preference) is left untouched, so plugging the phone back in
      restores it without the player re-setting it. A distinct narration
      line ("Your phone died overnight — the alarm never went off.") covers
      the case so the failure is legible, not a silent no-op — consistent
      with this project's "make shit matter, but tell the player why."
      *Acceptance (verified, exact values, real function calls):*
      `resolveSleepHoursWithAlarm` called directly with the sleep plan's
      stated bad case — energy 5 at bedtime (near-total exhaustion), bedtime
      01:00 (went to bed very late), alarm set for 6:00am. First pass used
      energy 15 / bedtime 23:30 and only produced a 3.75-point shortfall,
      because a near-full natural night also clamps at the 100 energy
      ceiling — not a useful demonstration, so the inputs were changed to
      genuinely reproduce the plan's "very drained + went to bed late"
      case. With energy 5 / bedtime 01:00 / alarm 6am: natural night would
      be `7.9h` (uncapped), the alarm caps it to exactly `5h`
      (`alarmFired: true`). Energy recovered `5 × 12.5 = 62.5`, landing at
      `5 + 62.5 = 67.5` — against `100` (clamped) if the alarm hadn't fired,
      a real **32.5-point shortfall**, closely matching the sleep plan's own
      illustrative "~62 energy" framing. Confirms the shortfall compounds
      exactly as designed and is proportional to hours actually slept
      (invariant 2). Separately verified the phone-dead detection the new
      `doSleep` gate uses: `getPhoneBattery`/`isPhoneCharging` on a dead,
      unplugged phone → `{ battery: 0, charging: false }` (gate fires,
      `alarmHour` resolves to `null`); dead but **plugged in** → `{ battery:
      0, charging: true }` (gate does NOT fire — booting off the cord is
      fine, matching Phase 3's reading of decision F, since charge only
      moves at checkpoints and refusing outright would strand the player
      until an arbitrary future tick).

### Phase 7 — Autopay

**Phase 7 status: COMPLETE.** All four items implemented and verified
against running code with exact values.

Deliberately separate from Phase 1: it is a distinct economic feature with
its own ordering question inside `processDayRollover`, its own partial-payment
and fee semantics, and a new money-losing failure mode. Shipping it alongside
the bill-pay UI rewrite would make a regression impossible to attribute.

- [x] **7.1** Opt-in **per bill**, `world.bills[id].autopay`, default **off**.
      *Done:* `bill.autopay` (default `false`) added to `initBillState()`
      (sim.js) for new games; old saves read it defensively (`!bill.autopay`
      → off) since `getWorld('bills')` has no per-field backfill — no
      migration needed. `toggleBillAutopay(gameState, billId)` (computer.js)
      flips it; rent (`split:'lease'`) is rejected — it has its own
      cap/eviction path, not this flat-balance model. UI: a
      `bills.toggle-autopay` button per eligible bill card in
      `renderBillsDashboard`, rendered **regardless of current balance**
      (it's a standing preference, not a payment action) — verified the
      Water card shows the toggle "On" with no Pay button when its balance
      is 0, and Rent's card has no autopay button at all. Reused on both
      devices for free (Phase 1/5's shared renderer).
- [x] **7.2** Processed in `processDayRollover` — decide and **document**
      whether it runs before or after `processBillsForDayUi` (`ui.js:126`).
      **Decision: after.** `processAutopayForDayUi(day)` is called
      immediately following `processBillsForDayUi(day)` in
      `processDayRollover` (ui.js), so autopay acts on the day's *already
      -posted* charges and *already-evaluated* cutoffs — the true current
      balance — rather than a stale pre-posting one. Kept as its own
      function rather than folded into `processBillsForDay` itself, so
      Phase 1's bill-posting path stays untouched and a regression in either
      is attributable to the right phase.
- [x] **7.3** The trap: autopay firing against an insufficient balance
      bounces → fee + a notification, and is a *worse* outcome than a manual
      miss. This is the lumpy-income invariant getting teeth — autopay is the
      safe choice in good months and the thing that bites in a dry spell.
      *Done:* `processAutopayForDay(gameState, day)` (computer.js) calls
      `payBill` (the exact path a manual click uses, so a payoff on an
      already-cut-off bill correctly clears the cutoff and charges the
      reconnection fee too) for every `autopay: true` bill with a positive
      balance not yet attempted this cycle. On failure, `AUTOPAY.bounceFee`
      is added straight onto the balance — compounding the debt immediately,
      which a manual miss never does (a manual miss just sits at its posted
      amount through the grace window). A one-shot gate
      (`bill.autopayAttempted`, reset to `false` only when a fresh charge
      posts in `processBillsForDay`'s existing loop) stops it from
      re-attempting — and re-bouncing, re-charging the fee — every day of
      the grace window; it waits for the next billing cycle, like a real
      bank draft. A bounce is logged as a real narration/system event
      (`processAutopayForDayUi`), the same standard the codebase already
      holds cutoff activations to — the player needs to see it, not
      discover it later as an unexplained inflated balance.
- [x] **7.4** Tune the fee against `ref/economy-and-rent-plan.md`'s stated
      target shape before considering this done.
      *Done:* `AUTOPAY.bounceFee = 30` (config.js) — flat, not scaled to the
      bill (real NSF fees don't scale either), anchored to the existing
      `reconnectionFee` range already in `BILL_DEFS` ($25 internet–$40
      electric) rather than invented from nothing.

      *Acceptance (verified, exact values, real function calls):* rent
      correctly rejected for autopay. Successful autopay: $1000 balance,
      $260 electric charge, autopay on → pays in full, money $1000→$740,
      `autopayAttempted` flips `true`. Bounce: $50 balance vs. $260 owed →
      money **untouched** at $50, bill balance $260→**$290** (exactly
      `+bounceFee`). One-shot gate: re-running the same day's pass again
      produces zero results and leaves the balance unchanged — no double
      -bounce. New cycle: resetting `autopayAttempted` and adding a fresh
      $100 charge on top of the still-bounced $290 → attempts again, bounces
      again (still broke), balance $290+$100+$30=**$420** exactly. Cutoff
      payoff: $5000 balance, $260 owed + cutoff active, autopay on → pays
      $300 (`260+40` reconnection fee, matching Phase 1's own verified
      combo), money $5000→$4700, cutoff cleared. Toggle sequence from a
      fresh bill (`autopay: false`): first toggle → `true`, second toggle →
      `false` — flips correctly both directions.

### Phase 8 — Camera and Gallery

**Phase 8 status: COMPLETE.** All five items implemented; the L10
acceptance criterion verified with a real mock of `root.kv`/
`root.generateImage` tracking actual call counts, not just "it didn't
throw."

- [x] **8.1** `camera.take-photo` action. Photo record:
      `{ id, day, tick, roomId, subjectNpcIds, caption, prompt, seed, tags }`.
      **Store the prompt + seed, never rely on the cached blob** (L10) —
      regenerate on demand.
      *Done:* `takePhoto(gameState, tags)` (image.js) builds the exact
      record shape, using `buildImagePrompt` (the same prompt-builder
      `getSceneImage` uses, room + present NPCs + object `imagePhrase`) with
      an appended "candid smartphone photo" framing phrase so photos read
      distinctly from ambient scene art. The prompt is **frozen at capture
      time** — a photo keeps looking like the room did when taken, even
      after the room changes later (a fixture gets upgraded, an NPC moves
      out) — matching L10's intent, not just its letter. `id` and `seed`
      are both seeded via `hashStr` (never `Date.now()`), following
      `genObjectId`'s exact (save seed | namespace | day | tick | slot)
      pattern. `phone.camera-take` (`ui.js`) dispatches to `doPhoneTakePhoto`
      — free, no time/energy cost, matching "the phone is glanceable even
      exhausted."
- [x] **8.2** Roll capped at N (config), oldest evicted.
      *Done:* `CAMERA.rollCap = 30` (config.js). `takePhoto` unshifts
      (newest first) and truncates `roll.length` past the cap — truncating
      the tail of a newest-first array removes the oldest entries.
      `world.phone.camera.roll` added to `defaultPhoneState`/
      `normalizePhoneState` (world.js) — old saves back-fill an empty roll,
      no migration needed.
- [x] **8.3** Real generated images via the existing `image.js` path, using
      room + present NPCs + object `imagePhrase`.
      *Done:* `getPhotoImage(photo)` (image.js) — keyed by the photo's own
      `id` (**not** `getSceneImage`'s room/phase/npc composite key, since
      two photos of the same room a day apart must stay individually
      addressable, not collapse onto one shared cache slot), passing the
      frozen `seed` to `root.generateImage` — the same determinism contract
      `getCharacterImage` already relies on for NPC portraits, which
      `getSceneImage` itself does **not** use (scene art is intentionally
      non-reproducible; a photo cannot be, or L10 is violated in spirit).
- [x] **8.4** Before/after restoration shots — the upgrade system currently
      has no payoff beyond a number going up.
      *Done:* a "Snap Photo" button on every facility card in
      `renderUpgradesDashboard` (`upgrades.snap-photo` →
      `doUpgradesSnapPhoto`, ui.computer.js), tagging the photo
      `[facility:<id>, tier:<tier>]` and overwriting its caption with
      `"<Facility> — <Tier label>, Day N"` so a later gallery browse reads
      as a restoration record. **Scoping call:** no dedicated before/after
      comparison widget was built — the plan asks for the *capability* to
      capture these moments, not a side-by-side viewer; the Gallery already
      lets the player scroll to any two shots. **Device note:** RenoFix is
      a shared-device app (Phase 5) whose renderer signature carries no
      `device` param, so the button appears on both computer and phone
      rather than threading a device flag through all 23 shared renderers
      for one button. The fiction (you have your phone on you regardless of
      which screen you're looking at) already matches decision C's loose
      phone-presence model.
- [x] **8.5** Share a photo into an IM thread.
      *Done:* `sharePhotoToImThread(gameState, npcId, photoId)` (computer.js)
      reuses `appendPlayerImMessage`/`resolveImReply` **unmodified** rather
      than a parallel send path — the photo is described to the LLM as text
      (its caption, via a synthesized `[shared a photo: ...]` message; there
      is no vision capability here and none is needed for a plausible
      in-fiction reaction), and the resulting player bubble is tagged
      `photoId` so `renderMessages` (render.computer.js) attaches a
      thumbnail. A photo aging out of the roll after being shared degrades
      the bubble to `"[photo no longer available]"` rather than a broken
      image or a crash — verified directly. `phone.camera-share` dispatch
      reuses the `imSending` guard `doImSend` already declares (both mutate
      the same thread; sharing is the same act as texting, just with an
      attachment) rather than a second guard variable.

      *Acceptance (verified, exact values, real mocked
      `root.kv`/`root.generateImage` tracking actual call counts):* first
      `getPhotoImage` call → cache miss, 1 `generateImage` call. Second call
      on the same photo → cache **hit**, still 1 call. Simulated LRU
      eviction of that exact blob, third call → cache miss again, 2nd
      `generateImage` call fires, and **the seed and prompt passed are
      byte-identical to the first call** — this is the acceptance criterion
      exactly: the gallery shows the same photo regenerated, not a broken
      entry or a random new roll. Roll-cap: took `rollCap + 5` photos,
      final roll length exactly `30`, newest present, oldest evicted.
      DOM-level: gallery renders correct thumbnail count + Take button;
      detail view shows the correct caption, a correctly-wired share button
      per resident/prospective NPC; a missing photo id degrades to a
      message instead of throwing; sharing produces a correctly-tagged
      thread message; the IM bubble renders exactly one thumbnail for a
      shared photo and falls back to explanatory text once that photo is
      evicted from the roll; RenoFix's Snap Photo buttons render one per
      *actually-displayed* facility card and produce the correct tagged,
      captioned photo record.

### Phase 9 — Privacy and snooping

**Phase 9 status: COMPLETE.** All five items implemented; the plan's exact
acceptance scenario verified end-to-end with real values, including a
genuine cross-file integration check (the aliasing gotcha below) that
turned out to already be handled by existing infrastructure.

- [x] **9.1** Lock state + passcode setting. A locked phone mostly defeats
      snooping.
      *Done:* `world.phone.settings.passcode` (boolean, default off — the
      same "one boolean, no over-engineering" precedent DND set in Phase 3;
      no PIN-entry minigame). `setPhoneLock(gameState, locked)` (world.js)
      is a direct **setter**, not a toggle — `doPhoneOpen` always force
      -unlocks (it's the owner's own phone, they always get back in) and
      `doPhoneClose` force-locks **only** when `settings.passcode` is on.
      Turning the setting off doesn't retroactively unlock an already
      -locked phone. `phone.state.lock` itself already existed since Phase 2
      (`states: { lock: [...] }`) — this phase is what finally gives it a
      consumer.
- [x] **9.2** New `isSnoopDrive` in `DRIVE_DEFS`, mirroring the existing
      `isPeepDrive` dispatch in `evaluateDrives` (`drives.js:41`). Reuse the
      established curiosity formula from `tryNpcPeep` (`drives.js:283`):
      `openness*0.3 + (1-(conscientiousness+1)/2)*0.25`, plus `affection*0.2`.
      Weight `personality.traits.includes('curious')` on top as a modifier —
      note this would be the **first mechanical use** of `traits`, which is
      currently prompt-flavour only.
      *Done:* `DRIVE_DEFS.snoop_phone` (`isSnoopDrive: true`,
      `blockFilter: null` — unlike peeping, a phone can be found any time,
      not just during a specific vulnerable-state moment). `trySnoopPhone`
      (drives.js) reuses the exact curiosity formula plus a bounded
      `curiousTrait` bonus on top (not a second gate — a "curious"-tagged
      NPC with unremarkable temperament numbers still needs `minDrawn`).
      All numbers in new `SNOOP_TUNING` (config.js), mirroring
      `NPC_PEEP_TUNING`'s shape.
- [x] **9.3** A **new discovery pass** — do not reuse `sim.js:617-638`, which
      only scans a room's owner in their own room and would never find a
      phone in the player's bedroom (L8).
      *Done:* `trySnoopPhone` checks whatever room the NPC actually occupies
      this tick (`resolved.location`), no ownership requirement at all — a
      roommate wandering into the *player's own* bedroom and finding the
      phone there works, which is exactly the scenario `sim.js:617-638`
      structurally cannot produce. Requires the player **not** be in that
      room (decision C's `'elsewhere'` case is the whole tension this
      exists for) and the phone unlocked and not already carrying evidence.
- [x] **9.4** Only now give the phone `evidenceKinds` (L7) and add matching
      `EVIDENCE_KIND_TEXT` entries (L8). Note `obj.evidence` is a single slot
      (L9) — the found-phone record is one evidence entry, not a per-photo
      list.
      *Done:* `evidenceKinds: ['phone_contents']` added to `OBJECT_DEFS.phone`
      (defs.world.js), `EVIDENCE_KIND_TEXT.phone_contents` added
      (config.js). One evidence record (`{kind, strength, day, discovered}`)
      per phone, gated by `!phone.evidence` in `trySnoopPhone` so a second
      snoop attempt on an already-flagged phone is a no-op rather than
      overwriting or piling up. **Side effect now in scope, not a bug:**
      `pickEvidenceObject` (stealth.js) can now select the phone as a
      `LEAVE_EVIDENCE` target for the *player's own* sneaking if it happens
      to be sitting in a room being sneaked into — this was the exact
      interaction L7 deferred, and Phase 9 is the phase where that
      deferral ends; it's expected, not a regression.
- [x] **9.5** Consequences: memory episode + suspicion via the existing
      `ADJUST_SUSPICION` (the `'general'` subject is allocated and unused),
      scaled by what was actually in the roll / threads.
      *Done:* `resolveSnoopPhone` (drives.js) writes strength as
      `baseStrength + min(1, (rollLength+threadCount)/richnessNormalizer) *
      richnessStrengthBonus` (config.js's `SNOOP_TUNING`) — a phone with
      photos and open IM threads is a bigger find than an empty one, capped
      at `EFFECT_LIMITS.evidenceStrengthCap`. Applies `MEMORY_EPISODE` +
      `ADJUST_SUSPICION <npcId> general +delta` via `applyEffects` (trusted
      producer, same tier as the rest of `evaluateDrives`).
      **Design call, recorded:** `general` suspicion is applied to the
      *snooping NPC's own* suspicion field, not the player's — there is no
      symmetric "player suspects this NPC" field anywhere in the codebase.
      Verified directly that `ui.js`'s confrontation trigger hardcodes
      `boundary_violation`, not a generic subject read — so this is
      deliberately an **inert signal for now**: the snooping NPC carries
      private knowledge/guilt they didn't have before, available for a
      future system to build on, exactly matching `general`'s documented
      purpose as an allocated-but-unused catch-all. Not wired to today's
      confrontation flow; that would require a different narrative (the
      *player* confronting the snooper) that Phase 9 doesn't build.

      **Bug hunted and cleared during verification (worth recording):**
      calling `trySnoopPhone` in isolation and checking a held NPC variable
      afterward showed zero memory episodes — looked like the effect wasn't
      landing. Traced to the exact aliasing gotcha `ref/HANDOFF.md` warns
      about: `applyMemoryEpisodeEffect` (effects.js) *replaces*
      `gameState.npcs[id]` via `addMemoryEpisode`'s pure-return pattern,
      rather than mutating in place, so a held reference goes stale.
      Reading `gameState.npcs[id]` fresh confirmed the memory episode *was*
      written correctly. This is not a bug in the snoop code — `sim.js`
      lines 704-721 already document and fix this exact class of problem
      generically for every drive (pulling `postDrive.memory`/
      `.suspicion`/etc. back into `npcUpdates` after any drive's effects
      run, because it first broke `resolveNpcPeep`'s silent-success memory).
      The fix already covers `snoop_phone` for free — verified only after
      tracing the false alarm to its root rather than assuming either "it
      works" or "it's broken."

      *Acceptance (verified end-to-end, exact values, matching the plan's
      scenario literally):* an unlocked phone with 3 photos + 2 open IM
      threads, in a room the curious NPC occupies while the player is
      elsewhere → discovery fires, evidence `{kind:'phone_contents',
      strength: 0.7167, day, discovered:false}` (matching the richness
      formula exactly: `0.3 + min(1,5/6)*0.5`), a memory episode lands on
      the NPC (read fresh from `gameState.npcs`, not a stale reference),
      suspicion.general → exactly `0.15` (`SNOOP_TUNING.suspicionDelta`).
      Repeated with the phone locked (via the same `setPhoneLock` call
      `doPhoneClose` makes when passcode is on) → discovery blocked,
      evidence stays `null`. Also verified individually: dull-personality
      NPC gated out even with a forced-pass rng; player present in the same
      room blocks; an already-evidenced phone blocks re-discovery; a
      borderline NPC (temperament alone insufficient) crosses the threshold
      only with the `curious` trait bonus added; `setPhoneLock`
      force-sets in both directions; `defaultPhoneState`/
      `normalizePhoneState` correctly carry and back-fill `settings.passcode`;
      the Settings screen renders both toggle rows correctly wired.

---

## Verification

There is **no test harness**. The established method (`ref/HANDOFF.md`) is the
only one that works, and it has two non-obvious traps:

1. The browser preview **snapshots `main.html` on first load** and does not
   re-fetch changed `<script src>` files on a plain reload — even across
   closing tabs. Testing edited code without accounting for this silently
   tests stale code. **Fix:** create a fresh `<iframe>` at
   `main.html?fresh=<timestamp>` via `javascript_tool`, wait for load, then
   `iframe.contentWindow.eval(...)`. Do **not** read
   `iframe.contentWindow.SOME_CONST` as a property — top-level `const` in a
   classic script is a lexical binding, not a `window` property.
2. When building test output across `await` steps, snapshot with
   `JSON.parse(JSON.stringify(x))` at capture time, never a bare reference —
   later mutations otherwise retroactively change what an earlier field
   appears to show. This has produced false bug reports twice.

Mock `root.kv` with an in-memory Proxy and `root.generateText` /
`root.generateImage` as needed.

**Verification philosophy: assert exact values, not "it didn't throw."** Every
phase above has an acceptance criterion with specific state to check. Check
exact dollar amounts, exact battery deltas, exact day numbers. Do not claim a
phase works without running it against real code.

Highest-risk things to verify explicitly:
- Sim checkpoints fire on the **discrete** path (Phase 2.3), or sleep costs no battery.
- Time context restores correctly from every nesting combination (Phase 0.1).
- Phone navigation never mutates computer window state (Phase 0.2).
- The derived vulnerable state self-heals from every exit path (Phase 5.5).
- A save round-trips: set the phone down, reload, it's still there (Phase 2.5).

---

## Explicitly NOT building

Recorded so these don't get re-proposed:

- **`world.notifications` as a persisted queue** — folded into the derived
  Tracker (decision D).
- **`world.phone.present`** — derived from the object's bucket.
- **`getAppState()`** — no value without converting all 23 renderers.
- **Per-notification-kind toggles** — one DND boolean until there's evidence
  more is needed.
- **New bank account types** (savings/checking split) — the four real
  balances are enough.

## Deferred / open questions

- **The Phone app itself (calls).** What phone is complete without one — but
  the design isn't settled. Two shapes when it's time: calls as texts with a
  different skin (cheap), or calls as the one notification tier that's harder
  to ignore ("3 missed calls from your landlord" hits differently than an
  unread text) without breaking "nothing forces attention."
- **Email**, as a slower, more formal channel than IM — clients, the landlord,
  bureaucracy.
- **A social/photo app** — posting for a follower count, giving freelancer
  reputation a softer second face and the occasional gig lead. Depends on
  Phase 8.
- **Phone tiers.** Decided: start with one, no tiers. Revisit only if the
  monthly plan cost proves too flat to matter.
- **What the phone overlay looks like on top of an already-fullscreen
  compact-mode computer** (decision E). Decided during Phase 3: fixed
  bottom-right overlay at `--z-phone: 170`, floats over the fullscreen
  desktop which stays visible/clickable; FAB opens/closes it.
- **Does a dead phone lose queued notifications, or do they arrive on
  recharge?** Arriving late is more interesting than losing them.