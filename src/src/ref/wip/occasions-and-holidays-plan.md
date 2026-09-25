# Occasions & Holidays — a calendar worth living through

Status: **in progress — Phases 1–3 of 9 built and verified (2026-09-22/23); Phase 4 next.**
Last updated 2026-09-22.

Companions:
- `SEASONS-AND-OCCASIONS-ROADMAP.md` (same folder) — the umbrella. **R1–R12
  bind this plan**; R1 (no religion) and R4 (days off are a per-person
  decision) are the user's own words, not session guesses.
- `birthdays-and-occasions-plan.md` (same folder) — the birthday module this
  plan's festivity trait shares inputs with, and whose gift-bonus shape (D8
  there) Phase 4 here generalizes.
- `seasons-and-weather-plan.md` (same folder) — weather/daylight; several
  traditions (fireworks, moon-viewing, Color Day) read it once it exists and
  degrade gracefully before it does.
- `src/src/ref/complete/seasonal-calendar-and-sandbox-plan.md` — built the
  140-day calendar; its D2 weekday shift is why every date here falls on a
  fixed weekday.
- `src/src/ref/wip/actions-and-activities-overhaul-plan.md` — `$HouseParty`,
  the mail/door system (trick-or-treaters ride `world.doorEvent`), Chatter,
  the thermostat — all substrates here.

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else.** Update it, and the Status
table near the bottom, as the very last thing you do each session.

---

## Handoff — read this first

**Resume at:** Phase 4 (gifts, cards & envelopes). Phases 1–3 are done.

**Phase 3 notes (2026-09-23 — decorations, built and verified):**
- Built: `OCCASION_DECOR` (config.js — nine sets: Midwinter, Halloween,
  Lantern Nights, Valentine's, Spring Festival, Thanksgiving, New Year's
  Eve, Midsummer, Harvest Moon; one room each; `lead` = the player's window,
  `npcLead` = when a festive roommate does it, later on purpose) and
  `OCCASION_TUNING.decor`; occasions.js `decorWindow`, `decorRecord`,
  `occasionToDecorate`, `decorationsUpIn`, `decorToTakeDown`,
  `putUpDecorations`, `takeDownDecorations`, `processDecorForDay` (inside
  `processOccasionsForDay`), `decorSceneLine`, `decorHomeNote`, and a local
  `fillOccasionText`. **First stored holiday state:** `world.occasions`
  (state.js SAVE_KEYS world list + `WORLD_KEY_FALLBACKS.occasions`) —
  `{ decor: { [occasionId]: { year, upDay, by, downDay, dueDownDay,
  lingerNoted, downBy } } }`. Effects `DECORATE_OCCASION` / `TAKE_DOWN_DECOR`
  (effects.js, trusted-only); verbs `self.decorate` / `self.take_down_decor`
  (defs.actions.js, rooms living_room/dining/balcony, requirement checkers
  `decorWindowOpen` / `decorTakeDownable`); `composeScene().decor` →
  `.sr-decor` in `renderSceneReader`; THE HOME per-room note and a
  "Decorations here" line in the scene prompt (NOT the IM prompt —
  `sceneDateLine(gs, withRoom)`).
- **Caught live:** the verbs first used group `chill`, which render.js's
  `defBucketFor` folds into the **Relax ▸** submenu — the seasonal chip was
  one tap deep. They now use group `occasion` (no bucket → a flat chip).
- Takedown: a roommate's set comes down 1–7 days after the occasion (their
  conscientiousness), is remarked on once four days after if still up; the
  player's set lingers until the Take Down chip, or 14 days, then "somebody
  got tired of waiting". Daily mood ±tiny by each resident's feeling.
- Verified: `verify-occasions-decor.js` **34/34**; full sweep **6087 / 12 /
  0** (baseline + only the new harnesses, identical failures). Live
  (dev-harness, a fresh throwaway Sandbox — the pane's IndexedDB had been
  reset between sessions, so the older test saves were gone): Kestrel
  (Halloween affinity 0.83) decorated on Autumn 18 with the log line and the
  `.sr-decor` passage line; the set came down on the next processed
  rollover; a save record carried `world.occasions` and a reload→Continue
  read it back intact (the castWeb/gameplayOptions scar, checked both
  halves); the flat Decorate chip, clicked for real, put up Midwinter with
  the grandfather's-box line and the room re-read as decorated.


**Phase 2 notes (2026-09-22 — the holiday work model, built and verified):**
- Built: `OCCASION_TUNING.work` (config.js — policy tables, roster shares,
  premiums, margins, money-need/work-ethic leans, mood, reason phrases);
  occasions.js `holidayPolicyFor`, `npcMoneyNeed`, `npcWorkEthic`,
  `workAffectingOccasion`, `holidayWorkPlan`, `holidayWorkPhrase`,
  `holidayWorkLine`, `applyHolidayWorkMood`; the rollover's "🗓️ who's
  working" line + D15 mood (inside `processOccasionsForDay`, live state
  only); the reason in `[Occasion]`. **`scheduleDayTypeFor` lives in sim.js
  beside `isWeekend`, not occasions.js** (deviation from D14's wording, on
  purpose: the schedule layer owns day types, and sim.js loads first — it
  typeof-guards `holidayWorkPlan`, so a sim-only harness gets exactly the old
  pick). The three day-type sites (`resolveScheduleActivity`,
  `workBlockEndAbs`, `nextScheduleBoundary`) and `isGigDay` now call it; a
  source-grep check pins that no bare `isWeekend(clock.day) ? 'weekend'`
  pick remains (invariant 3).
- **Calibration, measured:** the first pass (premiumWeight 0.6, major weight
  1.0) made the *average* nurse volunteer (staffed 18/19 working Midwinter)
  and let a 0.95-festive electrician take double-time call-outs. Now 0.4 /
  1.3 (partial 0.8): on Midwinter across 40 four-roommate houses, 17/148
  employed roommates work (11%) — staffed 11/19, self-employed 5/37, one
  on-call, offices and cafés 0 — and 6 people *volunteer*. The "travel RT"
  archetype (low festivity, money-driven) works Midwinter in all 60 seeded
  draws, rostered or volunteering; a festive, comfortable nurse never
  volunteers and asks off when rostered.
- Verified: `verify-occasions-work.js` **34/34**.

**Phase 1 notes (2026-09-22 — built and verified):**
- Built: `OCCASION_DEFS` (22 rows: the 20 occasions + Tax Day twice) and
  `OCCASION_TUNING` in config.js (after `BIRTHDAY_TUNING`); `occasions.js`
  (new, index.html right after `birthdays.js`, and `loadgame.js` ORDER) —
  `occasionsOnDay` (runs report `night`/`total`), `upcomingOccasions`,
  `daysUntilOccasion`, `seasonStage`, `npcFestivity`/`npcOccasionAffinity`,
  `occasionDateLine`, `occasionPromptLine`, `holidayRows`/`holidayRowLabel`,
  `yearGridModel`, `occasionBadge`, `processOccasionsForDay`;
  `render.calendar.js` (new, render layer — `buildYearGrid` + the
  `calendar-year` renderer, registered via `Object.assign(COMPUTER_RENDERERS)`
  like render.spritestudio.js; NOT in loadgame). Hooks: `processDayRollover`
  (ui.js, before the birthday pass), `sceneDateLine` in `buildScenePrompt` AND
  `buildImPrompt` (llm.js — the IM prompt had no date at all before),
  `[Occasion]` in `buildNpcBlockV2` beside `[Birthday]`, the HUD `hdr-day`
  emoji + title (render.js `renderHeader`), the Calendar's `holidays` (list)
  and `year` tabs (defs.computer.js) + the `holidays` source
  (render.computer.js `resolveScreenSource`), `.cal-*` CSS in index.html.
- A run counts in `spanUnit` ('night' default; Giving Week is 'day') — caught
  live: the Holidays tab first said "Giving Week · 6 nights".
- Verified: `verify-occasions.js` **60/60** — including an R1 guard that
  greps all 153 authored holiday strings for faith vocabulary, the weekday
  pin for all 22 rows in years 1/2/5, and the real render.calendar.js painted
  into a fake DOM (140 cells, Sunday-first columns, tap-to-detail, picker
  mode). Full sweep **6018 / 12 / 0** = the 5891 baseline + 68 (birthdays) +
  59 (this harness before the unit check), identical failure set.
- Live (dev-harness, the throwaway 3-roommate Sandbox): crossed midnight
  from Spring 13 via `advanceAndResolveMinutes` → "💝 Valentine's Day. Cards,
  chocolates, flowers — and a certain tension about who's getting what from
  whom." in the log, the HUD read "Sat 14 Spring 💝" (title "Valentine's
  Day"), the date line + three `[Occasion]` lines (Yuki "loves this
  holiday", Han and Ravi "take it or leave it"); the Calendar's Year tab
  painted all four seasons at desktop width and stacked at 375 px with no
  horizontal overflow; the Holidays tab listed the year soonest first.

**Blockers / flagged deviations:** none. (Q1 resolved by the user: keep Giving Week.)

---

## The thesis

The game has a real calendar — seasons, weekdays, a year — and nothing ever
happens on it except rent. A year of this game is 140 days; a player can live
two or three of them in one save and never once feel the year turn.

Holidays are how people feel time. They are anticipation (the lights go up a
week early), ritual (the same foods, the same arguments about the thermostat,
the same countdown), and a mirror held up to a household: who comes home,
who takes the holiday shift for the money, who gets you a present, who
forgets. That last part is why they belong in *this* game in particular —
Slice of Life's whole engine is people, and a holiday is a scheduled
occasion for people to reveal themselves.

It's also cheap to make rich here, because almost every tradition is a
remix of a system that already exists: gifts (`ask_gift`, `gift_to_player`),
feasts (`set_meal`, commitments, the cooking engine), parties (`$HouseParty`),
the front door (`world.doorEvent`), the balcony, Chatter, the mail, the
wardrobe's outfit types, the thermostat, the LLM prompt's structural lines.

### What this plan is *not*
- **Not religious, in any way** (R1). No holiday belongs to a faith; no
  character observes because of one.
- **Not a leave-the-house plan** (R10). The world comes to the door; the
  balcony is outside.
- **Not a floating/lunar calendar.** Every occasion has a fixed date; 140
  days is exactly 20 weeks, so each also has a fixed weekday — Thanksgiving is
  always a Thursday. (Floating dates are Q3.)
- **Not an economy lever.** Holiday premium pay is character truth (mood,
  prompt, who's home) — NPCs have no wallet field, and nothing here moves
  rent pressure. Sale Day discounts are the one player-economy touch, bounded.
- **Not weather.** That's `seasons-and-weather-plan.md`; traditions only read it.

## The roster

Twenty occasions (two span several days), plus Tax Day twice. Weekday is fixed every year
(weekday = (day-of-season + 5) mod 7, Monday = 0 — every season starts on a
Sunday). **Closure** drives the work model (D10): `major` = most workplaces
closed; `partial` = offices close early / many take it; `none` = an ordinary
working day with a twist.

| Season · day | Occasion | Weekday | Closure | Traditions (Phase that builds them) |
|---|---|---|---|---|
| Spring 1 | **New Year's Day** | Sun | major | slow brunch, resolutions said aloud, luck envelopes (small cash gifts between roommates), a fresh-start clean (P5/P6/P4) |
| Spring 4 | **Fools' Day** | Wed | none | pranks — roommates on each other and on you; a prank verb for the player (P7) |
| Spring 14 | **Valentine's Day** | Sat | none | cards, chocolates, flowers; date night for couples; a singles' commiseration night; a secret-admirer card (P4/P6) |
| Spring 21 | **Color Day** | Sat | none | colored-powder fight on the balcony/pool deck, sweets, "forgive and forget" — tension between participants eases (P7) |
| Spring 28 | Spring Festival Eve | Sat | none | dyeing eggs (P7) |
| Spring 29 | **Spring Festival** | Sun | major | the egg hunt (eggs hidden around the apartment), flower-gifting, spring brunch, chocolate rabbits (P7/P4/P5) |
| Summer 2 | **Rest Day** | Mon | major | a day off for the workers of the world: barbecue on the balcony, no chores, a lazy afternoon (P5) |
| Summer 8 | **Parents' Day** | Sun | none | roommates call their parents; the ones with a hard family history have a harder day; you think of your grandfather (P6) |
| Summer 18 | **Midsummer** | Wed | major | the longest day: flower crowns, a pool party, barbecue, sparklers and fireworks from the balcony at night (P5/P6) |
| Summer 28–33 | **Giving Week** (6 days) | Sat–Thu | none | small kindnesses — roommates do each other's chores, leave treats, drop coins in a jar (P7) — *Q1* |
| Summer 34 | **Sharing Feast** | Fri | none | a shared table of sweets and food, new clothes, the jar goes to a good cause (P5) — *Q1* |
| Summer 35 | *Tax Day* | Sat | none | (already mechanical — surfaced on the calendar only) |
| Autumn 10 | **Harvest Moon** | Tue | none | moon-viewing on the balcony, harvest pies/mooncakes, lanterns, calling family (P6) |
| Autumn 21 | **Halloween** | Sat | none | costumes, carving pumpkins, trick-or-treaters at the door (candy or a trick), a horror-movie night, a costume party (P7) |
| Autumn 22 | **Remembrance Night** | Sun | none | candles and photos for people who are gone, cooking their favorite dish, telling stories about them — roommates with a loss in their past, and you with your grandfather (P6) |
| Autumn 26 | **Thanksgiving** | Thu | major | the big shared feast (everyone brings a dish), the gratitude round, sports on TV, the food-coma nap, leftovers for days (P5) |
| Autumn 27 | **Sale Day** | Fri | none | Nile and QuickCart discounts; roommates come home with bags (P8) |
| Winter 8–13 | **Lantern Nights** (6 nights) | Sun–Fri | none | one more lantern lit in the window each night, fried sweets, a small gift each night, card games (P6/P4 — and the Game Room's card table) |
| Winter 24 | **Midwinter Eve** | Tue | partial | the tree trimmed, cookies baked, stockings hung, carols (P3/P6) |
| Winter 25 | **Midwinter** | Wed | major | the gift swap, the big dinner, the cozy movie, hot drinks, (snow — seasons plan) (P4/P5) |
| Winter 35 | **New Year's Eve** | Sat | partial | the party, the countdown at midnight, noisemakers, fireworks from the balcony, the midnight kiss, resolutions (P6) — also *Tax Day* |

**Anticipation windows.** Major occasions and Lantern Nights/Halloween get a
lead-in: decorations go up (P3) `decorLeadDays` before, the Calendar counts
down, the prompt line says "Midwinter is in 3 days", the eve gets its own
narration line.

## Locked decisions

### The calendar (D1–D5)
- **D1 — The roster above is the data.** `OCCASION_DEFS` (config.js), one row
  per occasion: `{ id, label, season, dom, span?, closure, busyFor?, eveOf?,
  lead?, blurb, lines: { eve, morning, night }, traditions: [...] }`. A row's
  day-of-year is `seasonIndex*35 + dom`; `span` covers the multi-day ones.
- **D2 — One reader module** (R11): `occasions.js` answers "what is today /
  tomorrow / in N days", eves, span nights ("the third night of Lantern
  Nights"), countdowns, and the per-occasion year. Nothing else computes a
  holiday date.
- **D3 — Always on the Calendar** (roadmap invariant 3). Unlike birthdays,
  holidays need no discovery: the Calendar app's **Holidays** tab lists them,
  its **Year** tab shows the whole year as a grid (holidays, known birthdays,
  today), and the HUD date gains the day's occasion.
- **D4 — The prompt knows the date.** Before this plan the scene prompt said
  only `Day N`. Phase 1 adds one date line — weekday, date, season stage
  (early/mid/late spring), today's occasion and the nearest one ahead — and a
  per-NPC `[Occasion]` line when it's an occasion (their festivity, and from
  P2 whether they're working it).
- **D5 — Narration at the rollover**: an eve line the night before (majors,
  and any row with `lines.eve`), a morning line on the day, a nightly line for
  span occasions. Deterministic pick from the row's pools.

### Festivity (D6–D9)
- **D6 — Festivity is derived** (R2/R5): 0..1 from a genSeed-seeded base
  (spread `festivityJitter`) plus leans — warmth and openness up; traits
  `nostalgic`, `warm`, `playful`, `expressive`, `dramatic`, `generous`,
  `nurturing`, `sensitive` up; `cynical`, `cold`, `stoic`,
  `serious`, `understated` down; values `tradition`, `connection`, `harmony`
  up, `independence` down. `bible.festivity` overrides. Never heritage.
- **D7 — Per-occasion affinity** is a small seeded tilt (±`affinityJitter`)
  on top, so a festive person can still be lukewarm about Halloween and a
  grump can secretly love Midsummer.
- **D8 — Festivity is shared with birthdays.** Birthday importance (birthdays
  R8/Q4) takes festivity as one input among others — not a copy of it.
- **D9 — What festivity drives:** mood on the day (lift when festive and
  free; a dip when festive and stuck at work; mild irritation at *other
  people's* festivity when very low), who decorates (P3), who initiates
  traditions and invites the player (P4–P7), and the work decision (D12).

### The holiday work model (D10–D16) — R4, the user's design
- **D10 — Only a working day can change.** The model runs only when the
  NPC's schedule would otherwise be a `weekday` with work in it, on an
  occasion whose closure is `major` or `partial`. Weekend holidays change no
  one's shift in Phase 2. `none`-closure occasions never touch schedules.
- **D11 — Every job has a holiday policy**, from its `category` (override:
  an occupation row's `holidayPolicy`):
  - `closed` — offices, schools, labs, studios, most remote wage work: the
    business shuts on `major` days. (tech, finance, legal, science,
    education, arts-wage, media-wage except news, wellness-wage, fitness-wage)
  - `staffed` — it never shuts, and pays a holiday premium: nurse, paramedic,
    night security, hotel concierge, journalist (news), remote support.
  - `open` — open most holidays, closed only on the biggest (Midwinter,
    Thanksgiving, New Year's Day); busy days mean tips: line cook, barista,
    pastry chef, bartender, retail manager, exotic dancer.
  - `oncall` — closed, but emergency call-outs pay double: trades.
  - `self` — no boss; they decide, and holiday demand is real (a musician on
    New Year's Eve, a photographer on Valentine's, a streamer on Midwinter).
  - `none` — not working (`incomeSource` means/none).
- **D12 — The decision** (deterministic per NPC × occasion × year, R6):
  `workPull = moneyNeed + 0.5·workEthic + premiumAppeal`,
  `homePull = festivity · occasionWeight`.
  - *moneyNeed* — from `incomeBand` (low 0.55 / mid 0.3 / high 0.1), +0.15
    `free_spender`, +0.1 `frugal` (likes the money), +0.15 `materialistic`,
    +0.1 `ambitious`; 0 for `means`.
  - *workEthic* — conscientiousness mapped to 0..1, +0.15 each for
    `reliable`/`methodical`/`perfectionist`, −0.25 `lazy`, +0.1 value
    `ambition`, −0.1 value `contentment`.
  - *premiumAppeal* — `(premium − 1) · premiumWeight`: staffed 1.5×,
    busy-day tips (the row's `busyFor` includes the job's category) 1.3×,
    on-call 2×, none 1×.
  - `staffed`/`open` jobs **roster** a share of staff (`rosterShare`, seeded).
    Rostered: work, unless `homePull − workPull > askOffMargin` and the
    seeded swap succeeds (`swapChance`). Not rostered: **volunteer** if
    `workPull − homePull > volunteerMargin` — this is the travel-RT case.
  - `oncall`: off, unless the seeded call-out lands (`calloutChance`) and
    `workPull > homePull`.
  - `self`: work if `workPull − homePull > selfMargin` (busy days lower it).
  - `closed`: off. `none`: nothing changes.
- **D13 — The outcome carries its reason**: `closed`, `rostered`,
  `volunteered`, `asked_off`, `swap_failed`, `called_out`, `self_working`,
  `self_off`. The morning narration, the `[Occasion]` prompt line ("picked up
  the Midwinter shift for the time-and-a-half — and doesn't mind"), Chatter
  and mood all read the reason, so the player can *understand* the choice.
- **D14 — Off means weekend.** An NPC who isn't working a holiday runs their
  schedule's `weekend` day type — one helper, `scheduleDayTypeFor(npc, day)`,
  replaces the three `isWeekend`-based day-type picks. Everything downstream
  (drives, availability, asks) follows for free.
- **D15 — Mood follows the reason**: off & festive → lift; volunteered →
  content; rostered & festive → a dip ("stuck at work on Midwinter");
  swap_failed → a bigger one.
- **D16 — The player isn't in the model.** The player is a freelancer who
  sets their own hours; a holiday changes nothing about the gig board except
  flavor (P8).

### Traditions (D17–D22)
- **D17 — A tradition is a named hook, not a subsystem.** `traditions:
  ['gift_swap', 'feast', …]` on a row; each id is built by exactly one phase
  and rides an existing system.
- **D18 — Gift days generalize the birthday bonus** (birthdays D8): on
  Midwinter, Valentine's, Spring Festival (flowers), Lantern Nights (small
  gifts) a present gets an occasion bonus, once per NPC per occasion.
- **D19 — Feasts are household commitments** the most festive free resident
  proposes (an overture), bound to `set_meal`; everyone who's home comes.
- **D20 — Night rituals are timed beats**: the countdown fires at 23:59→00:00
  only with residents in the room; fireworks are a sound signal plus a
  balcony view; lanterns are a per-night object state.
- **D21 — Playful days are events with consequences**: pranks move mood by
  temperament; trick-or-treaters are a `doorEvent` kind (candy or a trick);
  Color Day lowers tension between participants.
- **D22 — Personal days are occasions too** (P8): the anniversary of the day
  you got the keys, a roommate's move-in anniversary, a couple's
  anniversary — same readers, same narration shape.

## Data model

```js
// config.js
OCCASION_DEFS = { new_years_day: { id, label, season: 'spring', dom: 1, closure: 'major',
  eveOf: null, lead: 0, blurb: 'the first day of the year — fresh starts…',
  lines: { eve: [...], morning: [...], night: [...] }, traditions: [...] , busyFor: [] }, … }
OCCASION_TUNING = { festivityJitter, affinityJitter, decorLeadDays, rosterShare,
  swapChance, calloutChance, premium: { staffed: 1.5, busy: 1.3, oncall: 2 },
  premiumWeight, askOffMargin, volunteerMargin, selfMargin, occasionWeight: { major, partial }, … }

// Derived, never stored (R5):
occasionsOnDay(day) → [{ def, night?, of? }]      // spans report which night
npcFestivity(npc) → 0..1 ;  npcOccasionAffinity(npc, occId) → 0..1
holidayWorkPlan(gs, npcId, day) → { works, reason, premium } | null
scheduleDayTypeFor(npc, day) → 'weekday' | 'weekend'
```

Stored state begins only in the tradition phases (P3+), each under
`world.occasions` (a new SAVE_KEYS world key, added the phase it's first
needed) — e.g. `{ decor: { roomId: occId }, lanterns: { lit: n } }`.

## Implementation phases

### Phase 1 — The calendar spine
- **Goal:** the year has holidays, the game knows it, and the player can see
  it — no behavior changes yet beyond narration and the prompt.
- **Files:** `config.js` (`OCCASION_DEFS`, `OCCASION_TUNING`); `occasions.js`
  (new — readers, festivity, prompt lines, calendar rows); `ui.js` (rollover
  narration after the birthday pass); `llm.js` (the scene date line D4 + the
  per-NPC `[Occasion]` line beside `[Birthday]`); `defs.computer.js` +
  `render.computer.js` (Calendar **Holidays** list + **Year** grid renderer);
  HUD date badge (`render.js`); `index.html` + `loadgame.js`;
  `verify-occasions.js`.
- **Verification:** every row's day-of-year/weekday matches the table; spans
  and eves resolve; festivity in range, stable, override wins, never reads
  heritage; the prompt carries the date line; the Year grid renders 140 cells
  with every holiday marked (lifted-renderer harness, the
  `verify-roomlist-inbox.js` pattern); live click-through of the Calendar and
  a rollover onto a holiday.

### Phase 2 — The holiday work model (R4)
- **Goal:** D10–D16. On a major holiday some roommates are home all day and
  some chose — or were rostered — to work it, and the game says why.
- **Files:** `occasions.js` (`holidayPolicyFor`, `holidayWorkPlan`,
  `scheduleDayTypeFor`); `cognition.js` (×2) + `sim.js` (×2) (day-type picks);
  `config.js` (policy table, tuning; optional `holidayPolicy` on rows);
  `ui.js` (morning "who's working" line); `llm.js` (reason in `[Occasion]`);
  mood hook at the rollover.
- **Verification:** the decision table per policy (closed → off; staffed low-
  festivity low-income → volunteers; festive high-income rostered → asks off);
  determinism; a full-sweep delta of only the new assertions (this touches
  schedule selection — the whole suite must stay flat); a 3-roommate house
  on Midwinter measured: who's home by the hour.

### Phase 3 — Decorations & the look of a holiday
- **Goal:** festive residents put decorations up `decorLeadDays` ahead and
  take them down after; the living room *looks* like Midwinter; decor is
  buyable seasonally; scenes and prompts describe it.
- **Files:** `occasions.js`, `config.js` (decor sets per occasion),
  `defs.computer.js` (seasonal Nile stock), scene sensory lines, `llm.js`.

### Phase 4 — Gifts, cards & envelopes
- **Goal:** D18 — occasion gift bonus (generalized from birthdays),
  `gift_to_player` boosted on gift days, Valentine's cards, New Year luck
  envelopes, Lantern Nights' small gifts, Spring Festival flowers.

### Phase 5 — Feasts
- **Goal:** D19 — Thanksgiving potluck, Midwinter dinner, New Year's brunch,
  Rest Day/Midsummer barbecue, the Sharing Feast; leftovers.

### Phase 6 — Night rituals
- **Goal:** D20 — New Year's countdown + midnight kiss, fireworks (Midsummer,
  New Year's Eve), Lantern Nights lighting, Harvest Moon viewing, Remembrance
  candles (with the grandfather), Parents' Day calls.

### Phase 7 — Playful days
- **Goal:** D21 — Halloween (costumes as an outfit type, trick-or-treaters,
  candy item, horror night), Fools' Day pranks, Color Day, the Spring
  Festival egg hunt, Giving Week kindnesses.

### Phase 8 — Personal anniversaries & the world talking
- **Goal:** D22 anniversaries; Chatter holiday posts; holiday mail; Sale Day
  discounts; offscreen holiday events; holiday residue for the Dream Engine.

### Phase 9 — Close-out audit
- **Goal:** every D-number grep-checked against the shipped code; R1 content
  review of every authored line; Patch Notes entry.

## Status

| Phase | Status | Summary |
|---|---|---|
| 1 | **Done** (2026-09-22) | Calendar spine — roster, readers, festivity, narration, prompt date line, Calendar Holidays + Year, HUD badge; `verify-occasions.js` 60, live-verified |
| 2 | **Done** (2026-09-22) | Holiday work model (R4) — policy per job, roster/volunteer/ask-off/call-out/self, schedule via `scheduleDayTypeFor`, who's-working line, mood, prompt reason; `verify-occasions-work.js` 34, calibrated |
| 3 | **Done** (2026-09-23) | Decorations — nine sets, the player's Decorate/Take Down chips, festive roommates decorating, lagged takedowns, scene + prompt surfaces, `world.occasions` persisted; `verify-occasions-decor.js` 34, live-verified incl. save/reload |
| 4 | Not started | Gifts, cards, envelopes |
| 5 | Not started | Feasts |
| 6 | Not started | Night rituals |
| 7 | Not started | Playful days |
| 8 | Not started | Anniversaries & the world talking |
| 9 | Not started | Close-out |

## Dependency order

```
P1 ──► P2 ──► (P3 … P8 in any order) ──► P9
P3 decorations is read by P6 (lanterns in the window) — soft, not blocking.
P6's fireworks/moon-viewing read seasons-and-weather P1 if present.
```

## Open questions (parked, none blocking Phase 1)

- ~~Q1 — Giving Week / Sharing Feast~~ **Resolved 2026-09-22 (user): keep
  it.** Giving Week → Sharing Feast stands as the non-religious replacement
  for the roster's "Fasting Week → Feast of Breaking".
- **Q2 — Should the contractor's crew observe holidays?** Realistic, but it
  shifts job ETAs (`addWorkingDays`). Left holiday-blind for now.
- **Q3 — Floating dates?** A holiday that drifts ~11 days a year (a lunar
  feel) is possible with the same readers; nothing needs it yet.
- **Q4 — Does the player get holiday gig-board effects** (fewer gigs on
  majors, holiday-rate gigs)? D16 says flavor only; the economy invariants
  would need a check before anything more.

## Design invariants

1. **R1 before anything.** Every authored holiday line is read for faith
   content before it ships; the close-out repeats the read.
2. **Weekday math is the calendar's, not a table's.** A holiday's weekday is
   derived (`getWeekday`); the table's Weekday column is documentation, and a
   harness pins it so a calendar change can't silently desync it.
3. **Schedules change only through `scheduleDayTypeFor`.** No site may test
   "is it a holiday" itself to decide whether someone works.
4. **Only responses are stored** (roadmap invariant 2).
