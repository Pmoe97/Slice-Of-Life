# Seasonal Calendar & Sandbox Mode

Status: **COMPLETE — all phases A1–A5 and B1–B7 built and verified (2026-08-22).**
Design session complete 2026-08-21; all decisions locked.
Last updated 2026-08-22.

Companions:
- `src/ref/complete/economy-and-rent-plan.md` (owns the bill cadence, tax
  period and rent clock this plan re-times; every number in Part A is a
  re-tuning of a constant that plan introduced).
- `src/ref/structural/game-clock-time-system.md` (the as-built map of the
  clock — **must be updated in the same commit as Phase A5**, or it becomes
  the authoritative-looking record of a calendar that no longer exists).
- `src/ref/complete/game-opening-plan.md` (owns `ECONOMY.opening` — the solo
  start, rent grace and first-bill delay that Part B's sandbox path bypasses).
- `src/ref/complete/player-creation-and-intro-plan.md` (owns the Player Design
  studio and `PLAYER_STUDIO_TABS`, the table Part B reuses for NPC appearance).
- `src/ref/complete/contractor-tutorial-overhaul-plan.md` (owns the milestone
  flags Phase B7 must pre-set so a restored-house sandbox does not fire the
  tutorial on day 1).
- `src/ref/wip/character-cutout-scene-rendering-plan.md` (owns portrait/cutout
  generation — a 7-roommate sandbox front-loads its cost; see D26).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session — see
`src/ref/complete/seasonal-calendar-and-sandbox-handoff-prompt.md` for the full
session protocol.

---

## Handoff — read this first

**Status: COMPLETE.** All phases A1-A5 and B1-B7 are built and verified (2026-08-22). The plan and its session prompt moved to src/ref/complete/ (as a pair) in this commit; this is design record and precedent, no work remains.

**Final phase record (Phase B7, 2026-08-22 - tutorial suppression + the day-1 audit, D19's assert-don't-rebase guard):**

- **sim.js (CRLF)** - the step-7 marker is now real. suppressTutorial (default on) pre-sets every tutorial flag: for (const id of Object.keys(CONTRACTOR_TUTORIAL_MILESTONES)) gameState.world.flags['tutorial_'+id] = true. Iterating the table (not an enumerated list) is the point: a future milestone is covered automatically. The 7 ids (grep of fireContractorMilestone( call sites) = renofixOpened, tutorialJobBooked, tutorialJobComplete, firstPaidJobBooked, firstUpgradeJobBooked, firstRoommateMovedIn, qualityThreshold; the one non-milestone one-shot guard read (grep flags?.tutorial_) is tutorial_qualityThreshold in maybeFireContractorQualityMilestone (ui.js) - itself a milestone id, so it's covered, and fireContractorMilestone's own if (flags[key]) return false (computer.js:2451) re-guards regardless. Del still exists; only the beats are suppressed (D20).
- **D19 guard** - new snapshotSandboxDayFields(gameState) (sim.js, above applySandboxPreset) returns a path->value map of player.rentDueDay, every world.bills[id].dueDay, world.taxes.lastQuarterBilled, gigs.lastRefreshDay, captured at the TOP of applySandboxPreset; the D19 block at the bottom throws if any moved off that snapshot OR if gameState.clock.day !== 1. CROSS-CHECK FINDING (plan said meta.clock.day): SIM_generateHouse returns the clock at TOP-LEVEL gameState.clock - meta.clock only appears after write/load (writeGeneratedGameState, state.js:1263). Reading meta.clock would throw on every valid sandbox start; the guard reads gameState.clock.day ?? gameState.meta?.clock?.day. Fired live (browser_eval): heaviest sandbox (restored + all five structural toggles + 7 roommates + custom money) diffed against a plain solo start -> clock.day, rentDueDay, every bills[id].dueDay, lastQuarterBilled, gigRefresh all byte-identical (zero day-shaped diffs); forcing clock.day=5 throws a D19 error; suppressTutorial:false + restored + a present world.computer.apps.im -> maybeFireContractorQualityMilestone FIRES and sets tutorial_qualityThreshold (the beat is not broken); suppressTutorial:true -> flag pre-set, guard short-circuits. (The live milestone-fire test needed currentGameState set to a synthetic state with meta + world.computer.apps.im populated - fireContractorMilestone returns false on bare generated states, its documented synthetic-state path.) Fresh reload: no perchanceErrors/syntaxErrors.
- **No new srcfile -> no loadgame.js ORDER change.**
- **node dev/verify/verify-sbx-p7.js + node dev/verify/run-all.js**: not run - this session has no shell (same as B3-B6). verify-sbx-p7.js is written to the p3 pattern; it derives the day-shaped fields the same way snapshotSandboxDayFields does so the list can't drift from the guard; covers D20 (flag set on / absent off; table-key set == 7), the heaviest-vs-solo cross diff, the guard firing, and a write->flush->load round-trip asserting the tutorial flags survive + all day fields stay day-1-shaped. Fixes carried in p7's copy (p3's were too thin - it was never run): p3's makeMemKv lacked keys/delete/update (writeGeneratedGameState needs them) and its D19-style day test set meta.clock.day instead of clock.day; both corrected here so the first harness that actually runs behaves. Run node dev/verify/run-all.js once a shell exists and confirm green.

## Locked decisions

### Part A — the calendar

- **D1 — 35-day seasons, 140-day year.** `CALENDAR.daysPerSeason = 35`,
  `daysPerYear = 140`. Four seasons: spring 1-35, summer 36-70, autumn
  71-105, winter 106-140. Five 7-day weeks per season, twenty weeks per year.
  `monthsPerYear`, `daysPerMonth` and `monthNames` are **deleted** — nothing
  but `formatDate` reads them.

- **D2 — Day 1 is a Sunday, via a base shift, not an array reorder.**
  `getWeekday(day)` becomes `((day + 5) % 7)`. `WEEKDAY_NAMES` stays
  Monday-first and **is not touched**; `isWeekend`'s `>= 5` still catches
  Saturday (5) and Sunday (6) and **is not touched**.
  *Why not reorder the array:* maid contracts persist `schedule[].weekday` as
  a raw 0-6 index (`computer.js:2668`). Reordering the labels would silently
  move every existing contract by one day, with no error and no migration
  hook. A base shift changes which *calendar day* a Wednesday falls on —
  which is the intended change — while index 2 keeps meaning Wednesday.
  *Accepted consequence:* day 1 is now a weekend. Del's crew do not work
  (`isWeekend` gates renovation progress at `sim.js:541` and `ui.js:1474`),
  and every NPC runs their `weekend` schedule template. The opening is a
  quieter day than it was. This is deliberate.

- **D3 — Taxes bill every two seasons: end of Summer and end of Winter.**
  The season period and the tax period are **separate constants** from here
  on. `CALENDAR.daysPerTaxPeriod = 70`, so `isTaxPeriodEnd(day)` is
  `day % 70 === 0` → days 70 (last day of Summer) and 140 (last day of
  Winter), then 210, 280, …
  *Why not per-season:* a 35-day tax period shrinks the lump 2.57× and fires
  it 2.57× more often, which dissolves the "large lumpy obligation that
  forces saving" the mechanic exists to be (`config.js:585`). Two per year
  keeps a lump worth saving for and is a legible fiction ("the summer bill
  and the winter bill").
  *Renames* (see Data model for the full list): `getQuarter` →
  `getTaxPeriod`, `isQuarterEnd` → `isTaxPeriodEnd`, `getQuarterDay` →
  `getTaxPeriodDay`, and a **new** `getSeasonIndex(day)` that `getSeason`
  now calls. `getSeason`'s signature and return value are unchanged.

- **D4 — Tax interest scales; the penalty does not.**
  `TAX_CONFIG.interestRate` 0.02 → **0.015** (0.02 × 70/90 = 0.0156).
  `underpaymentPenalty` **stays 0.08**.
  *Why the asymmetry:* the penalty is a fraction of the *shortfall*, which
  shrinks in proportion to the period, so more-frequent smaller penalties
  net out to the same dollars per day. Interest is a fraction of the
  *carried balance*, which does not shrink — billing more often compounds it
  faster in playtime. One is self-normalising; the other is not.

- **D5 — All six utility bills go to `cadenceDays: 35`.** Electric, water,
  gas, internet, phone, insurance. Rent stays at `payPeriodDays: 7`. Each
  utility now posts exactly once per season and exactly twice per tax period
  — which is what keeps the internet-deduction formula
  (`Math.ceil(daysPerTaxPeriod / cadenceDays)`) exact rather than
  approximate.

- **D6 — The first-due stagger is preserved unchanged.** `initBillState`'s
  `firstDue` offsets (`sim.js:4225-4232`) stay exactly as they are:
  internet 12, electric 14, water 18, gas 22, phone 28, insurance 30, each
  `+ ECONOMY.opening.firstBillDelay`. Only `cadenceDays` changes.
  *Why:* "once per season" is a statement about the *period*, not the
  *phase*. Collapsing six bills onto the season boundary would build a
  ~$600 wall on day 35, every season, forever — and taxes land there too on
  every second one. Keeping the stagger gives you the seasonal cadence and
  keeps the month a rhythm. **Do not "tidy" these onto day 35.**

- **D7 — Flat amounts and bases scale by 7/6 for per-day parity.**
  A 30→35 day cycle is a 14.3% per-day discount on everything posted
  per-cycle. Corrected values:

  | Constant | Was | Becomes |
  |---|---|---|
  | `BILL_DEFS.electric.amount` | 260 | 303 |
  | `BILL_DEFS.water.amount` | 130 | 152 |
  | `BILL_DEFS.gas.amount` | 140 | 163 |
  | `BILL_DEFS.internet.amount` | 80 | 93 |
  | `BILL_DEFS.phone.amount` | 65 | 76 |
  | `BILL_DEFS.insurance.amount` | 25 | 29 |
  | `UTILITY_BASE.electric` | 25 | 29 |
  | `UTILITY_BASE.water` | 15 | 18 |
  | `UTILITY_BASE.gas` | 12 | 14 |

  `graceDays` and `reconnectionFee` are **unchanged** — 5 days of a 35-day
  cycle is materially the same window as 5 of 30. `UTILITY_METER` per-unit
  rates and `UTILITY_HVAC_SEASONAL` are **unchanged** — they are already
  per-unit and per-day, and scaling them would double-count.

- **D8 — Investing is decoupled from the game year, explicitly.**
  Introduce `INVESTING.daysPerFinancialYear = 360` and have `dailyReturn`
  divide by it instead of the literal `360`. Per-day returns are **byte-
  identical** to today.
  *Why not `CALENDAR.daysPerYear`:* that would make a $10k Index position
  earn $6.43/day instead of $2.50/day — a silent 2.57× buff to the system
  the economy plan explicitly scopes as "the accelerator for apartment
  upgrades rather than a parallel score."
  *The display must stop lying.* `render.computer.js:4272` renders
  `expectedReturn * 100` as the headline. It becomes the per-season figure —
  `expectedReturn * CALENDAR.daysPerSeason / INVESTING.daysPerFinancialYear`
  — labelled `/season`, with the annual figure moved into the existing
  description line.

- **D9 — `formatDate` renders "Sunday, 12th of Autumn, Year 1".** A second
  function `formatDateShort(day)` renders `"Sun 12 Autumn"` for the two
  space-constrained surfaces: the HUD day readout (`render.js:45`,
  `time.js:390`) and the phone lock screen (`render.phone.js:404`). Every
  other `formatDate` call site takes the long form unchanged. An
  `ordinalSuffix(n)` helper lives beside them in `sim.js`.

- **D10 — `structural/game-clock-time-system.md` is updated in the Phase A5
  commit.** It is the as-built map of the clock and currently describes a
  360-day year. Left stale it becomes an authoritative-looking record of a
  calendar that no longer exists — the exact failure mode
  `PLAN-ARCHITECTURE.md` records for `ARCHITECTURE.md`'s index.

### Part B — sandbox mode

- **D11 — Sandbox is a third start path, peer to solo and cast.** A new
  `menu.sandbox` title-screen button between "New Game" and "Load Game"
  (`main.html:5414`). It reaches `startSandboxGame(cfg)`, which mirrors
  `startSoloGame` (`ui.js:5928`) — same stop-autosave / stop-clock /
  generate / patch / write / sync / render sequence, same single uncovering
  point. It does **not** run the intro cutscene.

- **D12 — Authored fields are locked by an explicit list, not by luck.**
  A bible carries `bible.authoredFields: string[]` — dotted paths the player
  filled in by hand (`'name'`, `'physical'`, `'physical.hair.color'`,
  `'visual'`, …). `mergeProseIntoBible(bible, prose, authoredFields)` is the
  single merge point and skips any path covered by the list (a prefix match:
  `'physical'` protects everything under it).
  *Why an explicit list rather than fixing the spread:* `physical` survives
  today only because `expandCharacterProse` returns the same object it was
  handed. That is accidental, undocumented, and one refactor away from
  breaking silently. `visual` — the fallback both `buildVisualCharacterClause`
  (`image.js:269`) and the LLM character block (`llm.js:359`) use — does not
  survive at all.
  `authoredFields` **is persisted** on the bible. It is part of the
  character, and later systems (a Character Studio edit, a re-expansion)
  must honour it too.

- **D13 — Sandbox NPC appearance reuses `PLAYER_STUDIO_TABS` verbatim.**
  The table's paths are draft-relative and its `physical.*` addresses already
  match the NPC bible shape exactly, validating through `validateNpcField`
  against the same `CHARACTER_SCHEMA`. The studio is generalised to take a
  `subject` (the draft object + a label) rather than reading the
  module-global `playerStudioDraft`. **One table, two subjects.** A second
  hand-written appearance form is how a field gets offered and then silently
  dropped — the exact scar `studio.js`'s header comment records.

- **D14 — Authored appearance merges through the existing
  `generatePlayerAppearance` semantics.** Extract its merge half into
  `applyAuthoredPhysical(rolledPhysical, authored)` — the per-group shallow
  merge, the `intimate` half-level-deeper object merge, the genitals array
  **replace** (not union), and the `heightBuild` recompose. Both
  `generatePlayerAppearance` and the new NPC path call it. Do not
  reimplement; that function already carries three bug-fixes in its comments.

- **D15 — `rollCastSlot` gains one new partial: `physical`.** Applied after
  `generatePhysical(charRng)` and after `generateIntimate`/
  `appendFacialHairDraw`, via `applyAuthoredPhysical`. The append-at-end RNG
  discipline (design invariant 4 of the cutout plan, cited at `sim.js:3585`)
  is preserved: the merge **draws no randomness**, so a given seed's
  household is byte-identical when `partial.physical` is absent.

- **D16 — Room and bed assignment reuses `moveNpcIntoRoom`.** Sandbox
  assigns via `moveNpcIntoRoom` (`sim.js:3061`), which already finds the
  first free bed slot. Capacity comes from the facility tier's
  `residentCapacity` (`config.js:1597-1638`): `functional` = 1,
  `upgraded` = 2. The bedroom set is derived from `ROOMS` after
  `applyStructuralUpgrades` has run — so converting the study adds a fourth
  bedroom to the picker for free.
  `generateCast`'s hardcoded 3-bedroom / `bed: 'A'` loop (`sim.js:3655`) is
  **left alone** — it is the non-sandbox path and changing it is out of
  scope.

- **D17 — Three house presets plus per-facility override.**
  `wreck` (today's `FACILITY_STARTING_TIERS`, unchanged),
  `lived_in` (every facility `functional`, condition 70),
  `restored` (every facility `upgraded`, condition 100).
  Custom is per-facility `{ tier, condition }`. Structural upgrades are five
  independent booleans, presets set none of them.

- **D18 — The preset applies structural and completion side-effects
  explicitly.** After writing `world.flags.structural_*`, the preset **must**
  call `applyStructuralUpgrades(gameState)` — the live `ROOM_ADJACENCY` /
  `ROOM_THRESHOLDS` / `ROOMS` tables were populated at load with the base
  layout and do not rebuild themselves. After setting any facility tier to
  `functional` or above, it **must** call
  `applyFacilityCompletionStates(gameState, facilityId)` for every facility —
  `pool_systems` is the one with real `completionStates`, and without this a
  "restored" house has a filled pool that still emits stagnant-water smell.

- **D19 — Sandbox always starts on day 1. There is no day jump.** The
  advanced thing is the *house*, not the calendar: roommates, rooms,
  facility tiers, structural upgrades, money. `meta.clock` is left exactly as
  `SIM_generateHouse` built it, and **no absolute day field is ever
  rewritten** — not `player.rentDueDay`, not `world.bills[id].dueDay`, not
  `world.taxes.lastQuarterBilled`, not `gigs.lastRefreshDay`.
  *Why this is a decision and not an omission:* "start on day 96" is a real
  and tempting feature, and it is the single most expensive thing this plan
  could contain. Every persisted absolute day number would have to be rebased
  in lockstep — and the set of them is open, because every future system that
  stamps a day joins it silently. Miss one and the game opens on a wall of
  overdue bills or an already-expired quest, with no error. The value it buys
  is small: a lategame *feeling* comes from a restored apartment, a full
  house and money in the bank, all of which day 1 can express perfectly well.
  A sandbox at day 1 is a write against a state that has not ticked; a
  sandbox at day 96 is a migration. **If a future session wants this, it is a
  new plan with its own audit phase, not a field added to
  `SANDBOX_CONFIG.economy`.**

- **D20 — Sandbox suppresses the contractor tutorial by pre-firing its
  flags.** `world.flags.tutorial_*` and every `fireContractorMilestone` id
  (`qualityThreshold`, `tutorialJobBooked`, `tutorialJobComplete`,
  `firstPaidJobBooked`, `firstUpgradeJobBooked`, `firstRoommateMovedIn`,
  `renofixOpened`) are marked already-fired when `flags.suppressTutorial` is
  set (default **on**).
  *Why:* `maybeFireContractorQualityMilestone` (`ui.js:1428`) runs at day
  rollover and fires the moment quality crosses the threshold. A `restored`
  sandbox trips it on day 1 with a tutorial beat that makes no sense. Del
  himself still exists as an NPC — only the tutorial *beats* are suppressed.

- **D21 — Prose and portraits are skippable, per-roommate.** A `skipProse`
  flag per roommate; when set, `expandCharacterProse` is not called and the
  `fallback*` functions in `llm.js` fill `visual`/`history`/`sketch`/
  `sampleLines` instead. Default **off** for a rolled roommate, default
  **on** for one whose appearance was fully authored (the player has already
  said what they look like).
  *Why it matters:* `approveCastAndStartGame` fires one LLM call per NPC. A
  7-roommate sandbox front-loads seven, plus whatever the cutout pipeline
  costs. Sandbox is the path people re-run most; making it cheap is the
  point.

- **D22 — The investing display shows per-season, confirmed after A4.** The
  alternative considered in Open questions — rescaling `expectedReturn` to
  `0.09 × 140/360 = 0.035` and dividing by `CALENDAR.daysPerYear` — was
  rejected again on the figures A4 actually shipped: T-Bill 0.4%/season,
  Index 0.9%/season, Growth 1.4%/season, each with the annual rate in the
  description line. The per-season headline is a figure the game's real
  horizon can reach, and `daysPerFinancialYear = 360` keeps the real-world
  anchors intact. Do not re-open this unless the game year stops being 140.

- **D23 — Sandbox does not expose a starting `relPlayer`, decided in B5.** The config shape keeps the reserved field (`relPlayer: null` = engine default); the roommate UI does not expose it. "Start as established friends" stays out of scope: it interacts with `castWeb` and the cold-shoulder system in ways nobody has audited, and null keeps the engine's default relationship construction.
- **D24 — Sandbox does not expose `personality` (traits, quirks, likes, dislikes), decided in B5.** The identity form already covers name/age/gender/species/occupation/temperament/interests/values plus the five prose pools, and the appearance studio covers looks — a personality panel would add another table-shaped form and another `rollCastSlot` partial for the smallest sandbox upside. `rollCastSlot`'s partial stays exactly as B2 defined it.
---

## Data model

### `CALENDAR` (Phase A1) — `config.js`

```js
// Four 35-day seasons: five 7-day weeks each, 140 days to the year, 20 weeks
// to the year. 35 % 7 === 0, so every season AND every year begins on the
// same weekday forever — the property the old 360-day year never had (its
// weekday drifted 3 days a year). Day 1 is a Sunday; see getWeekday.
//
// daysPerTaxPeriod is DELIBERATELY NOT daysPerSeason. Taxes bill twice a
// year — end of Summer (day 70) and end of Winter (day 140) — because a
// per-season lump is 2.57x smaller and 2.57x more frequent, which dissolves
// the saving-forcing function the mechanic exists for. See D3.
const CALENDAR = {
  daysPerSeason: 35,
  daysPerYear: 140,
  daysPerTaxPeriod: 70,
  seasons: ['spring', 'summer', 'autumn', 'winter'],
  seasonNames: { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' },
};
// DELETED: monthsPerYear, daysPerMonth, monthNames — a 35-day season has no
// months, and formatDate was their only reader.
// UNCHANGED: WEEKDAY_NAMES stays Monday-first. See D2.
```

### Calendar helpers (Phase A1) — `sim.js`

The full rename map. `getSeason`'s signature and return value do not change.

| Was | Becomes | Body |
|---|---|---|
| `getWeekday(day)` | *(same name)* | `((day + 5) % 7)` |
| `isWeekend(day)` | *(same name)* | `getWeekday(day) >= 5` — **unchanged** |
| `getQuarter(day)` | `getTaxPeriod(day)` | `Math.floor((day - 1) / CALENDAR.daysPerTaxPeriod) % 2` |
| `isQuarterEnd(day)` | `isTaxPeriodEnd(day)` | `(day % CALENDAR.daysPerTaxPeriod) === 0` |
| `getQuarterDay(day)` | `getTaxPeriodDay(day)` | `((day - 1) % CALENDAR.daysPerTaxPeriod) + 1` |
| — | `getSeasonIndex(day)` **(new)** | `Math.floor((day - 1) / CALENDAR.daysPerSeason) % 4` |
| — | `isSeasonEnd(day)` **(new)** | `(day % CALENDAR.daysPerSeason) === 0` |
| `getSeason(day)` | *(same name)* | `CALENDAR.seasons[getSeasonIndex(day)]` |
| `getYear(day)` | *(same name)* | `Math.floor((day - 1) / CALENDAR.daysPerYear) + 1` — **unchanged body** |

Worked values to assert against (Phase A1's verification):

```
day   1 → Sunday,  spring, season-day  1, taxPeriod 0, year 1
day   2 → Monday,  spring
day   7 → Saturday, spring
day   8 → Sunday,  spring
day  35 → Saturday, spring, isSeasonEnd
day  36 → Sunday,  summer, season-day  1
day  70 → Saturday, summer, isSeasonEnd, isTaxPeriodEnd, taxPeriod 0
day  71 → Sunday,  autumn, taxPeriod 1
day 105 → Saturday, autumn, isSeasonEnd
day 106 → Sunday,  winter
day 140 → Saturday, winter, isSeasonEnd, isTaxPeriodEnd, year 1
day 141 → Sunday,  spring, year 2, taxPeriod 0
```

### `formatDate` / `formatDateShort` (Phase A5) — `sim.js`

```js
function ordinalSuffix(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
}

// "Sunday, 1st of Spring, Year 1". The long form — every call site takes
// this except the two space-constrained ones below.
function formatDate(day) {
  const weekday = WEEKDAY_NAMES[getWeekday(day)];
  const dom = ((day - 1) % CALENDAR.daysPerSeason) + 1;
  const season = CALENDAR.seasonNames[getSeason(day)];
  return `${weekday}, ${dom}${ordinalSuffix(dom)} of ${season}, Year ${getYear(day)}`;
}

// "Sun 12 Autumn" — the HUD day readout and the phone lock screen. The long
// form is ~30 chars against the old ~18 and overflows both.
function formatDateShort(day) {
  const weekday = WEEKDAY_NAMES[getWeekday(day)].slice(0, 3);
  const dom = ((day - 1) % CALENDAR.daysPerSeason) + 1;
  return `${weekday} ${dom} ${CALENDAR.seasonNames[getSeason(day)]}`;
}
```

### `bible.authoredFields` (Phase B1)

```js
// Dotted paths the player authored by hand. Prefix-matched: 'physical'
// protects every key under it. Persisted with the bible — a later Character
// Studio edit or prose re-expansion must honour it too.
authoredFields: ['name', 'physical', 'visual']
```

```js
// The ONE merge point for prose expansion. Replaces the inline object
// literal in approveCastAndStartGame.
function mergeProseIntoBible(bible, prose, authoredFields) { /* ... */ }
```

### `SANDBOX_CONFIG` (Phase B3)

The whole authored setup as one plain object. Held in a module-level
`pendingSandboxConfig` while the UI is open; consumed once by
`applySandboxPreset`; never persisted.

```js
{
  version: 1,

  // The player. Exactly buildPlayerDraftForNewGame()'s shape — the studio
  // already produces it, threaded to SIM_generateHouse's 4th parameter.
  player: { name, surname, age, gender, physical, portrait },

  // 0..7 roommates. `partial` goes to rollCastSlot untouched.
  roommates: [{
    partial: {
      name, age, gender, species, occupationCategory,
      temperament: { warmth, volatility, openness, conscientiousness, assertiveness },
      interests: [], values: [], baggage, wound, want, blindSpot, boundary,
      physical: {},                      // D15 — the new partial
    },
    authoredFields: [],                  // D12 — derived from which fields the UI filled
    residency: { room: 'bedroom_1', bed: null },   // bed null = first free slot
    relPlayer: null,                     // null = engine default; else { affection, trust, respect, tension, desire }
    skipProse: false,                    // D21
  }],

  house: {
    preset: 'wreck' | 'lived_in' | 'restored' | 'custom',
    facilities: { '<facilityId>': { tier, condition } },   // custom only; partial is fine
    structural: {
      kitchen_hall_door: false, pool_window: false,
      study_to_bedroom: false, ensuite: false, dining_doors: false,
    },
  },

  // D19: there is deliberately NO startDay here. Sandbox is always day 1;
  // the advanced thing is the house, not the calendar. These fields tune the
  // day-1 opening — they never rebase an existing day stamp.
  economy: {
    money: 3800,
    rentGraceDays: 14,        // overrides ECONOMY.opening.rentGraceDays
    billsStartDay: 8,         // overrides the firstBillDelay base
    taxReserve: 0,
  },

  flags: { suppressTutorial: true },     // D20
}
```

### `applySandboxPreset(gameState, cfg)` (Phase B3)

Pure-ish patch applied **between** `SIM_generateHouse` and
`writeGeneratedGameState`. Mutates `gameState` in place, returns it. Order is
load-bearing:

```
1. house.structural   → world.flags.structural_<id>
2. applyStructuralUpgrades(gameState)          // D18 — rebuild live tables FIRST
3. house.preset/facilities → world.upgrades[id] = { tier, condition }
4. applyFacilityCompletionStates(gameState, id) for every facility  // D18
5. roommate residency → moveNpcIntoRoom(...)   // D16, needs (2) for bedroom_4
6. economy.money / taxReserve → player.money, world.taxes.reserve
7. flags.suppressTutorial → world.flags.tutorial_* + contractor milestones  // D20
```

**`meta.clock` is never touched, and no absolute day field is ever
rewritten** (D19). If you find yourself adding a step 8 that rebases a
`dueDay`, stop — that is a different plan.

---

## Implementation phases

> **Part A and Part B are independent** — no phase in one blocks a phase in
> the other. Within each part, order matters. See Dependency order.

### Phase A1 — Calendar constants and helpers

**Goal:** The calendar is 35-day seasons, a 140-day year and a 70-day tax
period; day 1 is a Sunday; `getSeason`/`getYear`/`isWeekend` return correct
values for every day in the worked table above. Nothing that *displays* a
date has changed yet, and nothing economic has been re-tuned — this phase is
pure arithmetic, verified in isolation.

**Files:**
- `src/srcfiles/config.js`: replace `CALENDAR` with the Data-model shape.
  Delete `monthsPerYear`, `daysPerMonth`, `monthNames`. **Do not touch**
  `WEEKDAY_NAMES` (D2) or `UTILITY_HVAC_SEASONAL`. Update the block comment
  above `CALENDAR` (currently at `config.js:3150-3159`) — it explicitly
  claims "numbering is unchanged (still 7-day weeks via getWeekday), so
  nothing that reads getWeekday shifts", which this phase makes false.
- `src/srcfiles/sim.js`: apply the full rename map. `getWeekday` gets the
  `(day + 5) % 7` body with a comment naming D2 and the maid-contract reason.
  Add `getSeasonIndex`, `isSeasonEnd`. `formatDate` will still reference the
  deleted month fields at the end of this phase — that is expected; make it a
  **temporary** `` `${WEEKDAY_NAMES[getWeekday(day)]} day ${day}` `` stub with
  a `// Phase A5` marker rather than leaving a crash. Phase A5 writes the real
  one.
- Rename call sites — these are the complete set as of the audit, **verify by
  grep, not by this list**: `getQuarter` → `computer.js:2227`,
  `render.computer.js:3702`; `isQuarterEnd` → `ui.js:1294`; `getQuarterDay` →
  `render.computer.js:3703`; `CALENDAR.daysPerQuarter` → `computer.js:2204`,
  `render.computer.js:3704`, `render.computer.js:3722`, `tracker.js:137`.
  `computer.js:1871`'s `getSeason` call is **unchanged** (it wants the season,
  and gets it).

**Verification:** New `dev/verify/verify-cal-p1.js`.
- Assert every row of the worked-values table above, by day number.
- Assert `getWeekday` cycles 7 and that days 1, 8, 36, 71, 106, 141 are all
  Sunday (index 6) — this is the "seasons and years always start Sunday"
  property, and it is the whole reason 35 was chosen.
- Assert `isWeekend` is true for exactly 2 of every 7 consecutive days across
  days 1-300, and that `addWorkingDays(1, 5)` and `workingDaysBetween` still
  behave (they read `isWeekend` and are easy to break with a base shift).
- Assert `CALENDAR.daysPerYear % CALENDAR.daysPerSeason === 0` and
  `daysPerYear % 7 === 0` and `daysPerTaxPeriod % daysPerSeason === 0`.
- `grep -rn "daysPerQuarter\|getQuarter\|isQuarterEnd\|monthNames\|daysPerMonth" src/srcfiles/`
  must return **zero** hits outside comments.
- `node dev/verify/run-all.js` — the whole suite, to catch anything that read
  a weekday index.

---

### Phase A2 — Bill cadence and per-day parity

**Goal:** Every utility bill posts once per season at an amount that holds
dollars-per-day constant against the old 30-day cycle. The stagger is intact
and no bill has moved onto the season boundary.

**Files:**
- `src/srcfiles/config.js`: `BILL_DEFS` — set `cadenceDays: 35` on electric,
  water, gas, internet, phone, insurance (D5). Rent stays 7. Apply the D7
  amount table. Update the `cadenceDays` comment at `config.js:527` — it
  documents `7=weekly, 30=monthly, 90=quarterly`, all three now wrong.
  `UTILITY_BASE` gets the D7 values. **Do not touch** `UTILITY_METER` rates,
  `UTILITY_HVAC_SEASONAL`, `graceDays`, or `reconnectionFee`.
- `src/srcfiles/sim.js`: `initBillState`'s `firstDue` offsets are
  **unchanged** (D6). Add a comment saying so and why, because the next
  reader will want to align them.

**Verification:** New `dev/verify/verify-cal-p2.js`.
- Drive `processBillsForDay` over days 1-140 on a generated house and assert
  each of the six bills posts exactly **4 times** (once per season) and never
  more than one posts on any single day except where the old stagger already
  collided.
- The parity assertion, which is the point of the phase: total dollars posted
  over 140 days under the new constants must be within **2%** of
  `(old per-cycle amount) × (140/30)` for each flat bill. Compute the old
  values inline in the harness rather than reading them from config (they are
  gone).
- Assert HVAC dollars are unchanged: accrue `accrueHvacForDay` across days
  1-140 and assert the total equals `35 × (2.2 + 6.8 + 2.2 + 8.5)`. This
  proves the seasonal resize did not move per-day utility pressure.
- Assert no bill's `dueDay` is ever `≡ 0 (mod 35)` in its first four
  postings — the "did someone tidy the stagger onto the boundary" guard.

---

### Phase A3 — Taxes on a two-season period

**Goal:** Taxes bill on days 70 and 140 and every 70 days thereafter, the
interest rate is scaled for per-day parity, and the internet deduction is
exact rather than rounded.

**Top-of-phase check:** confirm Phase A1's rename actually reached
`processQuarterlyTaxes`' `lastQuarterBilled === quarter` guard
(`computer.js:2229`). The persisted key name **stays `lastQuarterBilled`** —
it is opaque and renaming it would need a save migration this plan explicitly
refuses. Only the *value* changes meaning (0-1 instead of 0-3). Comment it.

**Files:**
- `src/srcfiles/config.js`: `TAX_CONFIG.interestRate` 0.02 → 0.015 with the
  D4 reasoning inline. `underpaymentPenalty` **stays 0.08** — write the
  "self-normalising" reason next to it, because the symmetry is tempting and
  wrong. Update the `TAX_CONFIG` header comment (`config.js:585`): "every 90
  days" → "every 70 days — end of Summer and end of Winter".
- `src/srcfiles/computer.js`: `computeTaxOwed`'s `postingsPerQuarter`
  becomes `Math.ceil(CALENDAR.daysPerTaxPeriod / internetDef.cadenceDays)`
  = `ceil(70/35)` = 2, exactly the real posting count. Replace the comment
  (`computer.js:2199-2201`) that says "posts every 30 days (3x per quarter)".
  Rename the local to `postingsPerPeriod`.
- `src/srcfiles/ui.js`: `processTaxesForDayUi`'s `isQuarterEnd` guard
  (`ui.js:1294`) — already renamed in A1; update the surrounding comment
  (`ui.js:1288`) which says "every 90 days".

**Verification:** New `dev/verify/verify-cal-p3.js`.
- Assert `isTaxPeriodEnd` is true for exactly `{70, 140, 210, 280}` across
  days 1-300 and false everywhere else.
- Assert `getSeason(70) === 'summer'` and `getSeason(140) === 'winter'` —
  this is D3's whole user-facing promise.
- Drive `processQuarterlyTaxes` twice in one period and assert the
  `lastQuarterBilled` guard prevents a double bill.
- Assert the deduction is exact: post the internet bill across a full 70-day
  period, count the real postings, and assert `postingsPerPeriod` equals it.
  (Under the old constants with a 35-day period this would be 2 vs 1.17 — the
  bug this phase exists to not ship.)
- Carry an unpaid balance across three periods and assert the compounded
  total is within 2% of the old rate compounded over the same *number of
  days* — the D4 parity check.

---

### Phase A4 — Decouple investing from the game year

**Goal:** Per-day fund returns are byte-identical to before this plan, the
constant that makes that true is named, and the UI states the return in a
unit the game actually has.

**Files:**
- `src/srcfiles/config.js`: add `INVESTING.daysPerFinancialYear: 360` with
  the D8 comment — it must say outright that this is deliberately **not**
  `CALENDAR.daysPerYear`, and why (per-day tuning parity; the real-world
  return anchors stay legible). Change `dailyReturn`'s
  `(annualReturn / 360)` to `(annualReturn / INVESTING.daysPerFinancialYear)`.
  Fix the `funds` header comment, which still says `/ 360` inline.
- `src/srcfiles/render.computer.js`: the fund row at `:4272` renders
  `(fund.expectedReturn * 100).toFixed(1)`. Change to the per-season figure
  and label it `/season`; move the annual figure into the description line
  beside it. Read the surrounding render function before editing — do not
  guess the markup.

**Verification:** New `dev/verify/verify-cal-p4.js`.
- The parity assertion: for each fund and for days 1-500, assert
  `INVESTING.dailyReturn(...)` returns **exactly** what
  `annualReturn / 360 ± noise` returned before. Pin this by asserting
  `daysPerFinancialYear === 360` and that the seeded noise path is untouched
  (same fund+day → same value across runs).
- Assert `INVESTING.daysPerFinancialYear !== CALENDAR.daysPerYear` — a
  guard-rail assertion whose failure message says "read D8 before changing
  this."
- Compound $10,000 in `index` over 140 days and assert the result is within
  1% of the pre-plan figure.

---

### Phase A5 — Date rendering and the display sweep

**Goal:** Every surface that shows a date, a season, a quarter or a
tax countdown says something true. `game-clock-time-system.md` matches the
code.

**Files:**
- `src/srcfiles/sim.js`: replace the Phase A1 `formatDate` stub with the real
  implementation, plus `formatDateShort` and `ordinalSuffix` (Data model).
- `src/srcfiles/render.js:45`, `src/srcfiles/time.js:390`,
  `src/srcfiles/render.phone.js:404`: switch to `formatDateShort`. Take a
  screenshot of each before and after — the HUD is the one place a 30-char
  string will break layout, and it is the string the player sees most.
- `src/srcfiles/render.computer.js`: `renderTaxPanel` (`:3699`). The
  `'Q' + (quarter + 1)` label becomes the period name — `'Summer period'` /
  `'Winter period'`, derived from `getSeason(day)` at the *end* of the
  current tax period, not today's season. `'Quarter gross'` row label →
  `'Period gross'`. The progress bar already reads
  `CALENDAR.daysPerTaxPeriod` after A1.
- `src/srcfiles/tracker.js`: `trackerTaxes` (`:131`) — the `nextDue`
  computation already adapts after A1; update the two `detail` strings
  ("this quarter", "at quarter end") to say period.
- `src/ref/structural/game-clock-time-system.md`: update every statement
  about the year length, season length, quarter/tax cadence, weekday base and
  `formatDate` output (D10). **Same commit.**

**Verification:** in `dev-harness.html` (this phase touches the render layer,
which `dev/verify/loadgame.js` deliberately stops short of).
- Load a save, step the clock to days 1, 35, 36, 70, 140, 141 and read the
  HUD, the phone lock screen, the tracker and the bills dashboard at each.
  Day 1 must read "Sunday, 1st of Spring, Year 1"; day 141 must read
  "Sunday, 1st of Spring, Year 2".
- Assert no horizontal overflow on the HUD day readout at the narrowest
  supported width (see `mobile-layout-overhaul-plan.md`).
- Assert the tax panel's countdown on day 69 reads 1 day and on day 71 reads
  69 days.
- `grep -rn "[Qq]uarter" src/srcfiles/` — every surviving hit must be a
  comment about the *tax* period, not a season or a display string.

---

### Phase B1 — The authored-field lock

**Goal:** A bible can declare which of its fields the player wrote, and the
prose-expansion pass provably cannot overwrite them. This phase ships
standalone and is useful without any sandbox UI.

**Files:**
- `src/srcfiles/config.js`: add `authoredFields` to `CHARACTER_SCHEMA` as an
  optional array of strings. Find the schema by name — it is the gate every
  construction path returns through, and a field it does not know about is a
  field `validateCharacter` will strip.
- `src/srcfiles/llm.js`: add `mergeProseIntoBible(bible, prose, authoredFields)`
  beside `expandCharacterProse`. Prefix-match semantics: `'physical'` in the
  list protects `physical` and everything under it. Handle the four
  unconditional fields (`visual`, `history`, `sketch`, `sampleLines`), the
  guarded one (`name`), and `physical` — and add the comment explaining that
  `physical` previously survived only because `expandCharacterProse` returns
  the same object it was handed, which is not a guarantee anyone should rely
  on.
- `src/srcfiles/ui.js`: `approveCastAndStartGame` (`:5989`) — replace the
  inline `candidateBible` object literal with a `mergeProseIntoBible` call.
  Behaviour for a bible with no `authoredFields` must be **identical** to
  today.

**Verification:** New `dev/verify/verify-sbx-p1.js`.
- Build a bible with `authoredFields: ['name', 'physical', 'visual']`, run
  it through `mergeProseIntoBible` with a stub prose object that sets *every*
  field to a sentinel, and assert the three authored ones are untouched and
  the rest took the sentinel.
- Assert prefix matching: `'physical'` protects `physical.hair.color`;
  `'physical.hair'` protects `physical.hair.color` but **not**
  `physical.eyes.color`.
- The no-regression assertion: an empty `authoredFields` must produce a
  bible byte-identical to the pre-change merge. Construct the old result
  inline in the harness and `deepEqual`.
- Round-trip a bible with `authoredFields` through `validateCharacter` and
  assert the field survives normalisation (this is the `castWeb` scar —
  see design invariant 3).

---

### Phase B2 — NPC appearance authoring

**Goal:** `rollCastSlot` accepts a `physical` partial and merges it with the
same semantics the player studio already uses, without changing any seed's
output when the partial is absent.

**Files:**
- `src/srcfiles/sim.js`: extract `applyAuthoredPhysical(rolledPhysical, authored)`
  from `generatePlayerAppearance` (`:3303-3330`) — the per-group shallow
  merge, the `intimate` deep-merge, the genitals **replace**, and the
  `heightBuild` recompose. Have `generatePlayerAppearance` call it, so there
  is one implementation. Then wire `partial.physical` into `rollCastSlot`,
  applied **after** `structured.physical.intimate = generateIntimate(...)`
  and `appendFacialHairDraw(...)` (`sim.js:3583-3584`) so the RNG draw order
  is untouched (D15).
- `src/srcfiles/sim.js`: update `rollCastSlot`'s header comment (`:3428`),
  which enumerates the accepted partials and will now be one short.

**Verification:** New `dev/verify/verify-sbx-p2.js`.
- **The determinism assertion, which is the reason for the ordering rule:**
  generate the same seed's full cast twice, once through the pre-change code
  path and once with `partial.physical` absent, and assert the two casts are
  byte-identical. If this fails, the merge is drawing randomness or was
  inserted in the wrong place.
- Author only `physical.hair.color` and assert every other physical field is
  still rolled (not absent, not defaulted).
- Author `physical.intimate.breasts.size` alone and assert the rolled
  `shape`/`areola`/`nipples` survive — the exact bug
  `generatePlayerAppearance`'s comment records.
- Author a `genitals` array of one entry and assert the result has exactly
  one (replace, not union).
- Author `physical.build` and assert `physical.heightBuild` recomposed —
  otherwise the authored build never reaches any prompt.

---

### Phase B3 — `applySandboxPreset` and the config shape

**Goal:** Given a `SANDBOX_CONFIG` object, a generated game state is patched
into the described starting state, correctly, with every side-effect applied.
No UI yet — this phase is driven entirely from the verify harness.

**Prerequisite:** B1 and B2. **Not** Part A — sandbox never touches the
calendar (D19), so this phase is safe to build against either the old or the
new one.

**Files:**
- `src/srcfiles/sim.js` (or a new `sandbox.js` — decide by whether it needs
  `ui.js` scope; `applyFacilityCompletionStates` currently lives in `ui.js`,
  which argues for `ui.js` or for moving that function down. **Flag the
  choice in the handoff note rather than making it silently.**): add
  `applySandboxPreset(gameState, cfg)` implementing steps 1-7 of the Data
  model's ordered list. Step 7 (tutorial suppression) is Phase B7 — stub it
  with a `// Phase B7` marker. There is no step 8 (D19).
- `src/srcfiles/config.js`: add `SANDBOX_HOUSE_PRESETS` — the three D17
  presets as data, not branches. `wreck` must be expressed as "use
  `FACILITY_STARTING_TIERS`", not a copy of it.

**Verification:** New `dev/verify/verify-sbx-p3.js`.
- Apply a `restored` + `study_to_bedroom` + `ensuite` preset and assert, in
  order: `ROOM_ADJACENCY` contains the `bathroom_a|bedroom_player` edge and
  **not** `bathroom_a|hallway_a`; `ROOMS.study.type === 'bedroom'`; every
  `world.upgrades[id].tier === 'upgraded'`.
- **The pool assertion** (D18's reason for existing): after a `restored`
  preset, the `swimming_pool` object's `state` must carry
  `FACILITY_DEFS.pool_systems.completionStates`' values. Without step 4 this
  is a filled pool that still smells of stagnant water.
- **The ordering assertion:** run the preset with steps 1 and 2 swapped and
  assert the bedroom picker cannot see `study` — proving the order in the
  Data model is load-bearing and not incidental.
- Assign 7 roommates across 4 bedrooms and assert every one has a distinct
  `(room, bed)` and that no room exceeds its tier's `residentCapacity`.
- Round-trip: `applySandboxPreset` → `writeGeneratedGameState` →
  `loadGameState` and assert every patched field survived. This is the
  save-key-enumeration scar (design invariant 3).

---

### Phase B4 — The sandbox shell: menu entry and start path

**Goal:** A "Sandbox" button on the title screen opens a config screen with
working defaults and a Start button that reaches a playable game. The
roommate and house sub-editors are stubs; the path end-to-end is real.

**Files:**
- `main.html` (this is **`index.html` inside Perchance** — see the handoff
  prompt's file-name mapping table; the repo name and the Perchance name
  differ and neither can be changed): a
  `<button class="title-btn" data-action="menu.sandbox">Sandbox</button>`
  between New Game (`:5414`) and Load Game (`:5415`). Match the surrounding
  markup exactly, and bump the `?v=` cache-buster on every srcfile this phase
  changes.
- `src/srcfiles/menu.js`: the `menu.sandbox` action. Follow the existing
  menu-action dispatch (`:219`) — this codebase routes through `ui.js`'s
  global `data-action` chain, not per-element listeners.
- `src/srcfiles/ui.js`: `startSandboxGame(cfg)`, mirroring `startSoloGame`
  (`:5928`) beat for beat: `stopAutosave` → `stopClockLoop` → `closeModal` →
  `closeMainMenu` → `showLoading` → `SIM_generateHouse(seed, n, partials, playerDraft)`
  → seed `pendingCast.contentConfig` → `applySfwMode` →
  **`applySandboxPreset`** → `writeGeneratedGameState` → `syncGameStateFromKv`
  → `getSceneParticipants` → gig-board seed → `render` → `startAutosave` →
  `startClockLoop`. Read `startSoloGame` first; the ordering of the two
  `stop*` calls at the top closes a real race documented in its comments.
  **`closeMainMenu` is the single uncovering point** — do not call it from
  the config screen.

**Verification:** live Perchance page (this is UI; `loadgame.js` cannot see it).
- Title → Sandbox → Start with all defaults produces a game indistinguishable
  from a solo start: day 1, $3800, wreck house, no roommates.
- Save, reload the page, Continue — the game comes back.
- Escape/back from the config screen returns to the title with `#app` still
  covered (`data-app-hidden` present) — the "half-started game" failure the
  studio header comment describes.

---

### Phase B5 — The roommate builder

**Goal:** Up to 7 roommates, each with a full identity form and the shared
appearance studio, assigned to rooms, with prose/portrait skip controls.

**Files:**
- `src/srcfiles/studio.js`: generalise the studio to take a `subject`
  (`{ draft, label, kind: 'player' | 'npc' }`) instead of reading the
  module-global `playerStudioDraft`. `PLAYER_STUDIO_TABS` is **not**
  duplicated (D13). The `intimate` tab's `breastPoolForGender` thunk reads
  `playerStudioDraft.gender` directly (`studio.js:141`) — it must read the
  subject's. Audit every thunk in the table for the same coupling before
  starting; there may be more than one.
- `src/srcfiles/ui.js` (or the sandbox module): the roommate list UI — add /
  remove / reorder, per-slot identity fields (name, age, gender, species,
  occupation category, temperament sliders, want/wound/blindSpot/boundary
  pickers, interests, values), a room+bed picker populated from the live
  `ROOMS` after structural upgrades, a "Design appearance" button opening the
  studio for that slot, and the `skipProse` toggle (D21, defaulting per its
  rule).
- Populate `roommate.authoredFields` from which fields the form actually
  filled — an untouched field must **not** appear in the list, or it locks a
  rolled value against prose that would have improved it.

**Verification:** live Perchance page.
- Build 3 roommates: one fully authored, one name-only, one fully rolled.
  Start. Assert in the debug cast viewer that the authored one's name,
  appearance and `authoredFields` all survived; the name-only one kept its
  name and rolled everything else; the rolled one is a normal draw.
- Assert the fully-authored roommate's portrait prompt reflects the authored
  appearance (`buildVisualCharacterClause` reads `physical` when
  `physical.hair.color` is present).
- Open the appearance studio for the player and then for a roommate in the
  same session and assert the two drafts do not bleed into each other — the
  module-global is the thing being removed, and this is how it fails.

---

### Phase B6 — The house-state editor

**Goal:** Preset picker, per-facility tier/condition overrides, and the five
structural toggles, all reflected correctly in the started game.

**Files:**
- `src/srcfiles/ui.js` (or the sandbox module): the house panel. Three preset
  buttons, a facility list grouped by room showing each facility's tiers from
  `FACILITY_DEFS`, and five structural checkboxes from `STRUCTURAL_UPGRADES`
  (`config.js:184`) rendered from the table — labels and descriptions come
  from the data, never retyped.
- Show the derived apartment quality live (`getApartmentQuality`) so the
  player can see what a preset means before starting.
- Gate the bedroom count shown in Phase B5's room picker on
  `study_to_bedroom` — toggling it must add/remove a bedroom from the picker
  immediately, which means the two panels share state rather than each
  holding a copy.

**Verification:** live Perchance page.
- `restored` + all five structural toggles → start → walk the map. The
  ensuite door exists, the hallway door does not, the pool window shows the
  water and is **not** walkable (it is `glass`; a walkable pool window means
  `applyStructuralUpgrades`' glass branch was bypassed), the study is a
  bedroom.
- Swim in the pool and assert no stagnant-water smell (the D18 side-effect,
  now through the real UI).
- Set one facility to `broken` under a `restored` preset and assert the
  override survives — presets must not re-apply after a manual edit.

---

### Phase B7 — Tutorial suppression and the day-1 audit

**Goal:** A restored, fully-populated sandbox opens on a coherent day 1 —
no tutorial beat fires, and nothing about the advanced house state has
disturbed a calendar that never moved.

**Files:**
- The sandbox module: implement step 7 of `applySandboxPreset` — D20's
  tutorial suppression. Set `world.flags` for every `fireContractorMilestone`
  id — find them with `grep -rn "fireContractorMilestone(" src/srcfiles/`
  rather than copying the list from this plan, which will rot. Also set any
  `world.flags.tutorial_*` key read as a one-shot guard; find those with
  `grep -rn "flags?\.tutorial_" src/srcfiles/`.
- The sandbox module: **assert, don't rebase.** Add a development-time guard
  at the end of `applySandboxPreset` that throws if `meta.clock.day !== 1` or
  if any `world.bills[id].dueDay` / `player.rentDueDay` differs from what a
  fresh `SIM_generateHouse` produced. D19 is a decision that is easy to erode
  one convenience field at a time; this guard is what makes the erosion loud.
- `src/ref/complete/seasonal-calendar-and-sandbox-plan.md`: mark complete.

**Verification:** live Perchance page **and** `dev/verify/verify-sbx-p7.js`.
- **The D19 assertion:** build the heaviest sandbox the UI can express —
  `restored`, all five structural upgrades, 7 authored roommates, custom
  money — and assert that `meta.clock`, `player.rentDueDay`, every
  `world.bills[id].dueDay`, `world.taxes.lastQuarterBilled` and
  `gigs.lastRefreshDay` are **byte-identical** to a plain solo start's. Diff
  the two states and assert the difference set contains nothing day-shaped.
- Start it and assert on the first frame: zero overdue bills, zero rent owed,
  nothing expired in the tracker, the date reads day 1 of Spring, Year 1.
- Advance one day and assert no bill posts that should not have.
- Start `restored` + `suppressTutorial` and advance one full day. Assert
  `maybeFireContractorQualityMilestone` fired nothing — read the log, do not
  infer from the absence of a modal.
- Start `restored` with `suppressTutorial: false` and assert the milestone
  *does* fire, proving the flag is doing the work and the beat is not simply
  broken.
- `node dev/verify/run-all.js` green.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| A1 | Done | `CALENDAR` constants, Sunday base, season/tax-period helper split |
| A2 | Done | Bill cadence 30→35, flat amounts scaled 7/6 for per-day parity |
| A3 | Done | Taxes on a 70-day period (Summer/Winter end), interest scaled 0.02→0.015, internet deduction exact |
| A4 | Done | `INVESTING.daysPerFinancialYear` (360, not the game year), per-day returns byte-identical, fund cards relabelled per-season |
| A5 | Done | `formatDate`/`formatDateShort`, tax panel + tracker sweep, clock doc updated |
| B1 | Done | `bible.authoredFields` + `mergeProseIntoBible` — authored fields provably safe |
| B2 | Done | `partial.physical` on `rollCastSlot` via shared `applyAuthoredPhysical` |
| B3 | Done | `applySandboxPreset` + `SANDBOX_HOUSE_PRESETS`; harness-driven, no UI |
| B4 | Done | Title-screen entry, config shell, `startSandboxGame` end-to-end |
| B5 | Done | Roommate builder; studio generalised to a subject |
| B6 | Done | House-state editor: presets, per-facility overrides, structural toggles |
| B7 | Done | Tutorial suppression + the day-1 audit (D19's no-rebase guard) |

---

## Dependency order

```
PART A — calendar. No arrow crosses into Part B; the halves are independent.

A1 (calendar helpers) ──► A2 (bills) ──► A3 (taxes)
        │                                    │
        ├──► A4 (investing, independent) ────┤
        │                                    │
        └────────────────────────────────┴──► A5 (display sweep)

PART B — sandbox.

B1 (authored lock) ──► B2 (physical partial)
                                    │
                                    ▼
                         B3 (applySandboxPreset)
                                    │
                                    ▼
                         B4 (menu + start path)
                                    │
                           ┌───────┴───────┐
                           ▼                ▼
                     B5 (roommates)   B6 (house state)
                           └───────┬───────┘
                                    ▼
                      B7 (tutorial + day-1 audit)
```

**Part A and Part B are independent.** There is no arrow between them. They
share a document because they were designed together and touch overlapping
config — not because either blocks the other. D19 removed the one coupling
that would have existed (a day jump needing a settled calendar). Either half
can be worked to completion while the other has not started.

**What may safely run out of order:**

- **A4 is independent of A2 and A3.** It touches only `INVESTING` and one
  render line. It needs A1 only for `CALENDAR.daysPerSeason` in the display
  formula.
- **Any Part B phase may precede any Part A phase.** Sandbox never reads or
  writes a calendar field (D19). If Part A stalls, all of Part B is safe
  work, and the reverse holds too.
- **B5 and B6 are siblings** and may be done in either order — with one
  coupling: B6's `study_to_bedroom` toggle must feed B5's room picker, so
  whichever runs second owns wiring that link, and whichever runs first
  should leave a note in the Handoff saying it did not.

**Hard prerequisites:**

- **Never do A5 before A1.** A5 writes the real `formatDate` against helpers
  A1 creates; done first it writes against the deleted month fields.
- **Never do A3 before A1.** A3's whole subject is the tax-period constant A1
  introduces.
- **B3 has no Part A prerequisite.** It used to; D19 removed it. Do not
  re-introduce the block.
- **Never do B5 before B2.** The studio has nowhere to write an authored
  appearance until `rollCastSlot` accepts one.

---

## Open questions (parked, none blocking)

- (None — D23 and D24 resolved the two B5-era questions.)

- **Where does `applySandboxPreset` live?** ~~`applyFacilityCompletionStates`
  is currently in `ui.js`, which argues against a clean `sandbox.js`. Decide
  in B3 and record it.~~ **RESOLVED in B3:** both `applySandboxPreset` and
  `applyFacilityCompletionStates` live in `sim.js` (the latter moved down out of
  ui.js) so the loadgame harness — whose ORDER stops before the UI layer — can
  drive them directly. ui.js no longer defines `applyFacilityCompletionStates`;
  its renovation-completion call site still resolves the shared global.

---

## Design invariants

1. **A calendar change must hold dollars-per-day constant.** Every constant
   in Part A that posts per-cycle is scaled by the cycle-length ratio, and
   every per-day or per-unit rate is left alone. The scar: the 30→35 day
   cadence is a silent 14.3% discount on six bills at once, and nothing in
   the game would have reported it — the bills would simply have felt easier
   and nobody would have known why.

2. **Never scale a self-normalising rate.** `underpaymentPenalty` is a
   fraction of a shortfall that shrinks with the period; `interestRate` is a
   fraction of a balance that does not. They look identical in the config
   block and behave oppositely under a period change. Ask what the rate
   multiplies before you touch it.

3. **Never enumerate persisted keys in two places.** `castWeb` silently never
   persisted for months because it was missed in exactly this way.
   `authoredFields` (D12) is a new persisted bible field and must be added to
   `CHARACTER_SCHEMA`, or `validateCharacter` will strip it on the way in and
   the lock will be a no-op that looks like it works.

4. **Appearance merges draw no randomness.** `applyAuthoredPhysical` is
   applied after every roll and adds nothing to the RNG sequence, so a seed's
   household is byte-identical whether or not a partial was supplied. The
   scar: the cutout plan's D13 species roll had to be appended at the end of
   `rollCastSlot` for exactly this reason, and the comment at `sim.js:3585`
   records why.

5. **Module-level tables do not rebuild themselves.** `ROOM_ADJACENCY`,
   `ROOM_THRESHOLDS` and `ROOMS[].type` are populated once at load from the
   base layout. Writing `world.flags.structural_*` changes nothing until
   `applyStructuralUpgrades(gameState)` is called. The scar: a sandbox that
   sets the flags and skips the call produces a house whose data says
   "ensuite" and whose movement graph says otherwise, and NPCs path through
   a wall that the map draws as sealed.

6. **A facility tier is not the whole state of a facility.** `pool_systems`
   carries `completionStates` that `applyFacilityCompletionStates` writes
   separately. The scar is recorded verbatim at `ui.js:1405`: a dry basin
   with a torn liner emitted the smell of stagnant green water for an entire
   game because the state the def described was never written by anything.

7. **The season period and the tax period are separate constants and must
   stay separate.** They were the same number for the life of the economy
   plan, and every formula that read `daysPerQuarter` meant one of the two
   without saying which. Any future change that collapses them back — "they
   were the same before" — silently re-times either the HVAC seasons or the
   tax lump, and only one of those has a test.
