# Seasons & Weather — feeling the year turn

Status: **Phases 1–7 built and verified (2026-09-23); Phase 8 (power
outages, W10) added by the user and planned; one live check outstanding:**
W9's window views have never been rendered by a real image model (no
backend in any dev environment — the character-cutout plan's same external
gate). Everything else is verified by harness and live in the dev harness.
Last updated 2026-09-23.

Companions:
- `SEASONS-AND-OCCASIONS-ROADMAP.md` — R5 (derived), R6 (deterministic),
  R10 (the balcony is the outdoors), R11 (weather/daylight live in
  `seasons.js`) bind this plan.
- `occasions-and-holidays-plan.md` — traditions that read weather
  (fireworks, moon-viewing, Color Day, Midwinter snow).
- `src/src/ref/complete/actions-and-activities-overhaul-plan.md` Phase 8 /
  `temperature.js` — the thermostat model this plan's temperature curve
  feeds. NPC comfort/clothing read the outdoor temperature through
  `ambientTempC`; **HVAC billing does not** (it uses the seasonal rate table) —
  so W2 is the one gameplay-affecting change here, it moves no bill, and it has
  a measured guard.
- `src/src/ref/wip/character-cutout-scene-rendering-plan.md` — plates/
  cutouts; W9's window views extend its plate key.

---

## Handoff — read this first

**Resume at:** Phase 8 (power outages, W10) — design first; see W10. Also
worth doing: a W11 feel pass on the seasonal numbers (see W11). **One live
check outstanding:** with
the real image backend attached (Perchance itself, or `connect-vastai.ps1`
+ `local-ai.config.js` for the dev harness), visit a windowed room across a
few seasons and conditions and judge the plates: does "Through the window:
…" actually show the view (summer sun, autumn leaves, snow, rain on the
glass, a dark window at night), does the balcony's "Open to the sky: …"
read, and is the extra plate count per room (≤16 looks, generated lazily)
acceptable in practice. If a phrase produces bad art, it's one string in
`WEATHER_TUNING.views`; then move this plan to `complete/`.

**Where it all lives:** `seasons.js` (the one weather module, R11) —
the chain (`weatherConditionOn`/`weatherTurnMin`/`weatherConditionAt`; read
"now" through `weatherConditionAt`, never `weatherConditionOn`), the curve
(`outdoorTempC`), daylight, the sky line, the room cue, the sky watch
(`skyWatchLines` + ui.js `narrateSkyChanges`), `outsideAppeal`/
`roomWeatherWeight`, the drive/food/price/dress/mood helpers and the window
view. `WEATHER_TUNING` (config.js) is the one table. `verify-weather.js`
(102 checks, sections 0–14) is the plan's harness; `verify-c3.js`'s
cross-control was corrected in P3 (see its notes).

**Decided by the user 2026-09-23** (both were Q1/Q2): **W10 — power
outages**, as a real occasional event — "a REALLY fun occasional event,
that would be a great mechanical and atmospheric addition" — planned as
Phase 8 below (not designed yet). **W11 — no climate picker**: the seasons
are an idealized temperate year, each "the 'perfect' version of itself"
(the user's frame of reference: temperate east-coast North America). W11
implies a feel check on the P1 numbers — see its entry. 0.14.2 is retitled
"Seasons, Holidays & Birthdays" with a summary that leads with the weather
(the title was never the user's choice; they handed it back).

## As built — per-phase notes, newest first

**Phase 7 — close-out (2026-09-23):** this Handoff rewritten (the per-phase
notes below are the record); Status table final; README/roadmap/memory
updated; ARCHITECTURE.md gained a Seasons & Occasions load-order note. No
`GAME_VERSION` bump: every phase already has its line in the current
0.14.2 entry, which the user set as the working version.

**Phase 6 notes (2026-09-23 — built; pixels unverified):**
- `WEATHER_TUNING.views` + `windowViewToken(gs, roomId)` /
  `windowViewPhrase(token, roomId)`: rooms that see outside get
  `day-<season>-<sun|grey|wet|snow>` or `night-<dark|wet|snow>` (13 + 3 looks;
  conditions fold: fog/cold snap → grey, storm → wet, heat → sun; snow only
  in winter). The balcony has its own night phrasing ("a night sky over the
  city lights").
- `plateKey(…, view)` appends `_v<token>` LAST, so a windowless room's key
  is byte-identical and every cached plate for it stays valid;
  `buildBackgroundPrompt(…, view)` adds "Through the window: …" (the balcony:
  "Open to the sky: …"); `getScenePlate(…, view)`. Callers: render.js
  `sceneArtContext`/`renderScene`, state.js's thumbnail fallback key,
  render.spritestudio.js's preview. The cutout LAYOUT seeds on the key
  without the view, so the cast doesn't reshuffle when it starts to rain.
- `verify-cutout-p2`'s two arity pins (the plate can't take a character
  argument) now compare parameter NAMES against an explicit list (gotcha #9
  shape) — `view` added by name, a character parameter still fails.
- Verified: `verify-weather.js` 102 (section 14; the real
  `sceneArtContext` is lifted out of render.js by name — a typeof-guarded
  first draft "passed" by skipping). Live: summer living room keyed
  `…_vday-summer-sun` with "blazing summer sunshine outside, lush green
  trees", a snowy winter kitchen, the balcony at 23:00 "Open to the sky:
  snow falling softly in the dark", the hallway's key unchanged.

**Phase 5 notes (2026-09-23 — built and verified):**
- **W7 — measured first.** At the default 21°C thermostat the indoor
  temperature sits under the base comfort band 70% of winter, 8% of autumn,
  3% of spring and never in summer, and it follows the new daily curve, so
  indoor outfits already vary with the weather through the existing thermal
  bias. The real gap was going OUT: `npcOutfitForContext`'s 'work' fit (only
  ever chosen for someone whose day takes them out, D14) now dresses by
  `outdoorDressBias` — ≤10°C toward the warmest layer, ≥20°C **no outer
  layer** (`composeOutfit` gained `bias.skipSlots`). Found writing the check:
  a thermal bias alone kept the coat on at 27°C, since the coat's
  work/formal traits (+4/+2) outscore any heat, so office-goers had always
  worn a coat to work in summer.
- **W8 — day-sized beats only.** NPC mood is an accumulator (sim.js adds
  capped deltas; nothing eases it back), so no per-tick seasonal term.
  `seasonalMoodForDay` (rollover, applied by ui.js `applySeasonalMoodEffects`
  as MOOD_DELTA lines): the year's first warm day (day mean ≥17°C; lands
  10th–19th of Spring) gets a line and a +0.03 lift for the player (impulse)
  and every resident; the darkest days (daylight <580 min: 9th–23rd of
  Winter) dip residents with volatility ≥0.4 by 0.01, only out of mood above
  0.05. The first snow's lift fires from the sky watch when it starts
  (`firstSnowBetween`). Measured against the mood economy (paired houses
  through a winter with the rollover effects applied): sensitive residents
  average 0.548 vs 0.572 over the dark days (−0.024); others unchanged.
- Verified: `verify-weather.js` 96 (section 13 new). aa-p8, p5, voc-p2/p34/
  p9, w4/w5/w6 unchanged.

**Phase 4 notes (2026-09-23 — built and verified):**
- **Prices are whole dollars**, so a percentage on $1–3 produce rounds to
  nothing: `WEATHER_TUNING.produce` is a whole-dollar delta by season
  (tomato +1 winter; lettuce −1 summer / +1 winter; potatoes −1 autumn / +1
  spring), never below $1 and **never unavailable** (availability was the
  plan's other option; a hard gate on buying could empty a larder, and the
  plan says seasonal food is never a gate). Deltas net to zero over a year
  except the tomato (it can't go under $1 in summer).
- **Both shops read it** (Nile sells the same tomato as QuickCart):
  `itemPriceNow(def, gs)` in `cartSubtotal(cart, catalog, gs)` (Nile
  checkout + QuickCart totals), `renderNile` (card price, cart rows and
  total, plus an "in season" / "out of season" note on the card via
  `produceSeasonNote`), `renderGroceryCart`, `renderCatalog`. Everything
  that isn't produce (decor included) is its sticker price.
- **Cravings**: `seasonalFoodLean(gs, recipeKey, defId)` (hearty: soup,
  loaded potato, pasta, baked pizza, instant noodles at a day mean ≤10°C;
  fresh: salad, sandwich at ≥22°C; `dayMeanTempC` = baseline + the
  condition's offset, no hourly swing) added to the taste weight in
  drives.js's two choice sites: the eat tie-break (`tasteWeight`, by the
  plate's `recipeKey`) and `npcAutoCookMeal`'s recipe pick. 0.25 is smaller
  than the smallest gap between two taste bands (hate 0.1 → dislike 0.4),
  so it only ever breaks a tie inside a band (harness pins that).
- Verified: `verify-weather.js` 87 (section 12 new: prices by season,
  both shops' subtotals, the notes, the leans, and the real
  `npcAutoCookMeal` choosing soup on a cold day and salad on a hot one for
  an indifferent roommate, salad in winter for one who likes lettuce).
  verify-c4/food-phase7/grocery/i1/s3 unchanged. Live (review port):
  summer lettuce "in season" $1, winter lettuce "out of season" $3 and
  tomato $2, the Nile-style cart header and QuickCart's cart row at $6.

**Phase 3 notes (2026-09-23 — built and verified):**
- **Where, never whether.** `outsideAppeal(gs)` (condition factor for day
  or dark × a temperature factor, `WEATHER_TUNING.outside`: 0 in a storm,
  ~3 on a fine spring afternoon) weights the balcony in all four room
  pickers via `roomWeatherWeight`: drives.js `moveToRoom` (read_book,
  scroll_phone) and `moveToCommon` (seek_company), sim.js
  `resolveRoomForActivity` (the schedule's preference lists and its
  any-common-room fallback). Below `minAppeal` (0.2) the balcony is off the
  list; the two ANY-common-room pickers only ever lose it (`boost: false`),
  never gain it. "Stepping outside" when outside is off the list becomes
  "watching the weather from the window" (`outside.activitySwap`, rooms in
  ACTIVITY_ROOM_PREFERENCES). No drive score changes — measured paired on
  the same houses (8 × 5 days × 4 seasons): the balcony holds 15.2% of awake
  NPC-time on fine days vs 11.2% without weather, 0.6% vs 11.4% in rain,
  storms and bitter cold; drive totals within noise.
- **Told with the weather.** `drive.weatherTemplates` (read_book, watch_tv,
  scroll_phone) → `driveWeatherTemplate` at event creation: "{name} read
  out on the balcony in the sun." / "…curled up with a book while the rain
  came down outside." (`WEATHER_TUNING.cozy`). Text only.
- **The player.** "Sit on the Balcony" is dynamic (`balconySitWeather`: a
  line per condition × light, `clearCold` at ≤5°C; mood = base ×
  `outsideAppeal` clamped 0.25–2, so a fine morning logged a +0.08 impulse
  live and a storm "…a crack of thunder sends you back inside, soaked.").
  Sunbathe's line follows the light (`sunbatheLine`).
- **Two small appeal leans, facility-gated only**: `utility.weather` in
  `scoreDrive` (a `weather` term, in `terms`), `weatherDriveLean`: swim +0.04
  at ≥30°C or a heatwave, sauna +0.04 at ≤2°C, a cold snap or snow.
  Measured paired: high summer swims 110 vs 76, deep winter saunas 50 vs 30,
  total events within 2%. Never on an always-available drive (harness pins
  that only swim/sauna declare one).
- **verify-c3's warmth cross-control went red, and the check was wrong.**
  Its whole-group control counted `clean_common`, which declares BOTH axes
  (conscientiousness 0.4, warmth 0.1), so it measured an intended
  conscientiousness effect and passed only when seek_company swung the
  other way to cancel it. The weather's room choice evened seek_company out
  (7% → 16%). Fixed to the check's own stated premise ("an axis those
  drives do not declare"): the control counts only undeclared drives.
  Measured at 28 households on two seed sets: 3%/4% with the weather, 17%/9%
  without. The old sum had also been hiding a real conscientiousness pull on
  seek_company. c3 53/53.
- `verify-peek-events` greps drives.js for `roomId: …locationOverride`:
  kept the stamp inline (gotcha #9 shape) rather than editing the check.
- Verified: `verify-weather.js` 79 (section 11 new); c1 74, c2 unchanged
  (9 pre-existing), c3 53, w6 39. Live (the review port, fresh Sandbox): the
  storm and fine balcony lines through the real action, the +0.08 impulse,
  the balcony cue.

**Phase 2 notes (2026-09-23 — built and verified):**
- **A change of weather now arrives at a time of day** (W1's deferred
  mid-day change, built because "it's started snowing" needs it):
  `weatherTurnMin` (its own seed stream, so the chain is untouched; null when
  today matches yesterday; uniform over 00:00–22:00) and
  `weatherConditionAt` (yesterday's condition until the front, today's
  after). `outdoorTempC` **eases** the offset across `front.rampMin` (120)
  after the front, so there is no step: the largest 10-minute move is now
  0.85°C, where Phase 1 stepped up to 9°C at midnight. What's left at
  midnight is under 2.3°C, from a season's own switch of mix and diurnal
  swing. `weatherNow` (HUD, sky line) reads the minute.
- **Per-condition persistence**, found by reading a live sample (a
  three-day thunderstorm in the test house): at one shared 0.55, 200 sampled
  years had a 12-day storm, 17 days of fog and 22 of rain. Now `persist` per
  condition (storm 0.1, fog 0.2, rain/snow 0.4, cloudy 0.5, cold snap 0.62,
  heat 0.7; clear keeps the 0.55 default) with **compensated redraw weights**
  (`weatherRedrawMix`: w × (1 − p), which makes the stationary share exactly
  the authored mix), so the season means don't move. Storms now average 1.3
  days, fog 1.5, heatwaves 3.4. This changed every seed's weather sequence;
  nothing stores weather, so no save is affected.
- **The weather in a room** (W4): `WEATHER_TUNING.rooms` (authored, since no
  room had a window flag: balcony `outside`; living/dining/kitchen/study/
  all bedrooms/gym/pool `window`; hallways, bathrooms, entry, laundry,
  changing room and game room windowless) and `WEATHER_TUNING.cues` (per
  condition × window/outside × morning/day/dusk/night, seasonal variants,
  `anywhere` for a storm through the walls). `weatherRoomCue` → the scene
  reader's `sr-weather` line (composeScene `weather`, after the senses) and
  its own scene-prompt line `- The weather, from this room: …`
  (`weatherCueLine`, npc.js `scene.weatherCue`). Kept out of the sensory
  line on purpose: "Nothing much registers" stays true of a clean room in a
  storm (`verify-s2` pins it).
- **The sky watch replaces the plan's "meanwhile ticker"**. The meanwhile
  ticker surfaces recorded world events in *nearby* rooms, and weather is
  never stored (invariant 2), so it can't ride that ticker. Instead
  `narrateSkyChanges` (ui.js) runs at the end of every `advanceAndResolve`
  (both paths), keeps a session-only marker (`skyWatchAbs`, reset in
  `startClockLoop` like `lastRolledOverDay`), and logs `skyWatchLines`
  (seasons.js, pure): the latest front crossed (`changes`: first snow >
  pairs > starts > ends; worded "while you slept" when
  `flags._vulnerableState === 'sleeping'`; live lines need a room that sees
  outside, but a storm is heard anywhere) and, **live only** (span ≤ 90 min,
  awake, exposed room), sunset/sunrise, worded by the clock *when logged*
  (so "isn't even five" never prints at 17:30). The rollover's
  condition lines moved here; `processWeatherForDay` now only says the first
  day of summer/autumn/winter.
- **Fixed a Phase 1 (and Occasions P1) bug found live:** `updateClockDisplay`
  (time.js, every clock-loop frame) wrote the bare time and date over the
  header, stripping the sky and holiday emojis a frame after `render()` drew
  them. P1's live check only passed because the loop wasn't ticking in the
  pane. Now both paint through `paintHeaderClock` (render.js), once per
  game-minute. On the phone layout (≤900px) the time's 46px cap clipped the
  emoji too. The date drops its weekday there (`.hdr-wd`) so it's 68px and
  the time 54px, the same total; "26 Winter" shows the season, which
  "Thu 26 Wi…" never did.
- Also caught reading samples: summer's "sun hot on your skin" at 06:00 (a
  `morning` light slot now), "rooftops gone white" the instant snow
  started, and heat/cold-snap onset lines claiming the full effect before
  the ease. All reworded.
- Verified: `verify-weather.js` 63/63 (sections 8–10 new; 3 steady-day,
  7 rewritten for the rollover's narrower job, 2 pooled over three seeds —
  one seed's noise reached 2.4 points after storms got shorter, 0.5 at 1,500
  years; the remaining ~1-point autumn clear bias is summer's weather
  lingering into autumn's first days). Live: a thunderstorm rolled in at
  10:35 while idling in the living room ("⛈️ A thunderstorm rolls in.",
  the window cue switching to "rain lashing the window"); an hour-by-hour
  walk to the 18:21 sunset logged "🌆 It's getting dark outside." once;
  a real `doSleep` across a 05:10 fog logged "🌫️ Fog rolled in while you
  slept…" before the wake line; the header held "15:14 🌧️" / "Wed 25
  Winter 🎁" through the running loop at 1280px, 744px and 375px.

**Phase 1 notes (2026-09-23 — built and verified):**
- Built: `WEATHER_TUNING` (config.js — eight conditions with emoji/sky words/
  offsets and temperature **gates**, per-season mixes, persistence 0.55,
  seasonal diurnal swing, feel words, daylight table, rollover lines) and
  `seasons.js` (new; index.html + loadgame ORDER right after occasions.js):
  `weatherConditionOn` (a per-seed memoised chain), `weatherDayMix`,
  `seasonAnchorsC` (Gauss-Jordan solve so each season's MEAN equals
  `THERMOSTAT_TUNING.seasonOutdoorC` — anchors come out [18.5, 30.5, 14.5,
  2.5]), `seasonalBaselineC`, `weatherOffsetC` (re-centred per DAY), 
  `outdoorTempC`, `daylight`/`isDaylight`, `weatherNow`, `skyLine`,
  `processWeatherForDay`. Hooks: `ambientTempC` (temperature.js) now reads
  `outdoorTempC` (typeof-guarded fallback to the flat table); the "- Outside:"
  line in `sceneDateLine` (scene AND IM prompt); the HUD `hdr-time` weather
  emoji + sky-line title; the rollover (ui.js, after the occasions pass).
- **HVAC billing does not read outdoor temperature** (it uses
  `UTILITY_HVAC_SEASONAL`), so W2 moves no bill — measured, not assumed.
- **Two things caught by looking at a sample year, not by the harness:**
  (1) early/late winter sit between the season anchors, so the ungated chain
  snowed at ~10°C — fixed with per-condition `maxBaseC`/`minBaseC` gates
  (snow ≤ 6, cold snap ≤ 10, heat ≥ 24) and per-day offset re-centring; a
  snowless winter is now possible (and realistic), so "first snow" is once
  per year *that snows*. (2) see the diurnal/snow-line follow-up below.
- `verify-aa-p8.js` §1/§4 updated deliberately: its exact-blend check now
  uses the live `outdoorTempC`, and its "too hot" case uses a summer
  afternoon instead of assuming day 1 is warm (it's the cold edge of spring
  on a smooth curve). Both edits say why in the file.
- Verified: `verify-weather.js` 30/30; `verify-aa-p8.js` 31/31. Live: the
  HUD read "01:18 ☁️" (title "Outside: grey and overcast, freezing (0°C),
  still dark."), the scene prompt carried Date / Outside / Decorations, and
  a 7-day roll-through gave snow on Midwinter Eve.

**Survey (2026-09-22):** the season is read by
exactly four systems — HVAC seasonal rate (`computer.js:1998`), the tax
period label (`render.computer.js:4872`), date formatting (`sim.js`), and
`temperature.js`'s `ambientTempC` (`THERMOSTAT_TUNING.seasonOutdoorC =
[18, 27, 15, 6]`, a flat step per season). There is **no weather, no
daylight, no seasonal narration, and the scene prompt carries no date or
season at all** (Occasions P1 adds the date line; this plan adds the sky).
**Blockers:** none.

## The thesis

The user's words: "I want to FEEL the seasons throughout the game." Right
now a winter day and a summer day are the same day with a different
heating bill. Seasons are felt through small, constant, sensory evidence —
the light at five o'clock, rain on the window, the first cold morning, a
roommate in shorts on the balcony, soup instead of salad — and through the
rhythm of what a household *does* when it's hot or dark. None of it needs to
be big. It needs to be everywhere, a little.

### What this plan is *not*
- **Not a weather simulator.** A day has one condition (with persistence),
  one temperature curve, and sunrise/sunset. No wind vectors, no forecasts
  beyond "tomorrow".
- **Not a rent lever.** W2 keeps each season's average outdoor temperature
  equal to today's flat values, so the HVAC bill's seasonal average doesn't
  move (measured, not assumed).
- **Not outdoors.** The player never leaves (R10); weather is seen, heard and
  felt through windows, the balcony and the front door.

## Locked decisions

- **W1 — One condition per day**, deterministic (R6): a seasonal Markov chain
  over `clear`, `cloudy`, `rain`, `storm`, `fog`, `heat` (summer),
  `cold_snap` (winter), `snow` (winter, late autumn/early spring),
  seeded by (`meta.seed`, year, day), with persistence so fronts last 1–4
  days — per condition since P2 (a storm is a day, a heatwave several).
  A change lands at a seeded time of day, not midnight (built in P2), and
  the temperature eases across it. Conditions carry temperature gates (built
  in P1) so snow can't fall on a mild day.
- **W2 — A smooth temperature curve**: piecewise-linear through four
  season-midpoint anchors *solved* so each season's mean is exact (built as
  this, not the cosine first sketched — a cosine can't hit the table's
  asymmetric spring 18 / autumn 15) + the day's re-centred condition offset +
  a seasonal diurnal swing. Its
  per-season mean is pinned to `seasonOutdoorC` so HVAC economics are
  unchanged on average; `ambientTempC` reads the new function.
- **W3 — Daylight**: sunrise/sunset per day-of-year (long summer evenings,
  dark winter afternoons). Read by scene text, the prompt, the balcony's
  "is it dark" beats, and (W9) image light.
- **W4 — One sky line everywhere**: the scene prompt's date line gains
  "Outside: steady autumn rain, already dark"; the IM prompt gets it too
  ("it's pouring here"); rooms that see outside get weather sound/light cues
  (built in P2 as their own scene-reader and prompt line, beside the
  sensory line rather than inside it); a change is announced when it lands
  ("It's started snowing.") by the sky watch. That's a narration line rather
  than the meanwhile ticker, which only carries stored events.
- **W5 — Weather shapes what people do**: balcony/sunbathe/pool-deck verbs
  and drives gate or lean on weather; cozy indoor pastimes lean up in cold,
  dark or wet weather. Small appeal terms only — the drive-competition
  memory (`idle-pastime-drives-dominate-appeal-budget`) makes big swings
  dangerous; every change re-runs `verify-c3.js`.
- **W6 — Seasonal food**: QuickCart produce varies in price/availability by
  season; NPC cravings lean seasonal (soups and roasts in winter, cold and
  fresh in summer) through `taste.js`'s tie-break, never a hard gate.
- **W7 — Wardrobe follows the day**: the existing `thermal` clothing stat
  already reads temperature; with a daily curve, outfits vary day to day.
- **W8 — A small seasonal mood term**: a capped dip in the darkest weeks for
  sensitive/low-energy temperaments, a lift on the first warm day and first
  snow. Tiny, bounded, measured against the mood economy.
- **W9 — Window views** (last): a season/condition/daylight token in plate
  prompts and keys **only for rooms with windows**, from a small bounded set
  so the image cache can't explode. Needs the real image backend to verify.
- **W10 — Power outages** (user, 2026-09-23 — was Q1): "a REALLY fun
  occasional event, that would be a great mechanical and atmospheric
  addition." Weather-driven (a storm, a heatwave's overloaded grid, an ice
  storm in a cold snap), occasional, deterministic like everything else (R6).
  Phase 8. What goes dark and what it costs (the fridge, the computer and
  WiFi, the thermostat, lights, hot water) is its design work — the economy
  invariants price anything that spoils or bills.
- **W11 — No climate picker; each season is the perfect version of itself**
  (user, 2026-09-23 — was Q2): "The 'climate' is a little bit of an
  illusion, the 'feel' of seasons is supposed to be designed so each season
  feels like the 'perfect' version of itself … temperate east coast north
  america." A design target, not a simulation: when tuning, ask "is this the
  summer (or winter…) people picture?", not "is this realistic?". Open
  implication for a tuning pass: the P1 means were pinned to the thermostat
  table ([18, 27, 15, 6]), which puts mid-summer's baseline at 30.5°C (clear
  afternoons ~35°C — heatwave territory every day) and leaves snow unreliable
  (a snowless winter is possible). Billing doesn't read the outdoor curve, so
  the means are free to move for feel.

## Data model

As built (P1–P2):

```js
// seasons.js — all derived (R5), nothing stored
weatherConditionOn(gs, day) → 'rain'            // the day's condition (after its front)
weatherTurnMin(gs, day) → minute | null         // when today's front arrives
weatherConditionAt(gs, day, minutes) → 'rain'   // what it's doing at a moment — use this
outdoorTempC(gs, day, minutes) → number         // baseline + eased offset + diurnal
daylight(day) → { sunriseMin, sunsetMin }
weatherNow(gs) / skyLine(gs) → "Outside: steady rain, chilly (11°C), dark since 17:10."
weatherRoomCue(gs, roomId) → { text, via: 'window'|'outside'|'walls' } | null
skyWatchLines(gs, fromAbs, toAbs, { slept, roomId }) → [lines]
outsideAppeal(gs) → 0..~3                       // P3: how inviting outside is
roomWeatherWeight(gs, roomId, { boost }) → weight  // P3: the balcony in room pickers
weatherDriveLean(lean, gs) → appeal             // P3: swim hot / sauna cold
itemPriceNow(def, gs), seasonalFoodLean(gs, recipeKey, defId)  // P4
outdoorDressBias(gs) → { thermal, skipSlots }  // P5: dressed to go out
seasonalMoodForDay(gs, day) → { lines, effects }  // P5: lifts and the dark dip
windowViewToken(gs, roomId), windowViewPhrase(token, roomId)  // P6
// config.js: WEATHER_TUNING { persistence, conditions{offsetC, gates, persist},
//   mix, diurnalC, feelWords, daylight, lines, front, rooms, cues, changes,
//   light, watch }
```

## Implementation phases

- **Phase 1 — Weather, temperature, daylight engine** (`seasons.js`,
  `WEATHER_TUNING`, `ambientTempC` switched to the curve, the prompt sky
  line). Verify: chain stationary distribution per season; persistence;
  per-season temperature mean equals `seasonOutdoorC` within 0.25°C; HVAC
  bill over a year unchanged within 1%; full-sweep flat.
- **Phase 2 — Ambience** (sensory lines, meanwhile weather changes, IM
  prompt). Verify live: a rainy evening reads as one.
- **Phase 3 — Activities** (W5). Verify: `verify-c1/c2/c3` flat; a measured
  sunny-vs-rainy balcony usage difference.
- **Phase 4 — Seasonal food** (W6).
- **Phase 5 — Mood & wardrobe tuning** (W7/W8).
- **Phase 6 — Window views** (W9) — needs the image backend.
- **Phase 7 — Close-out.**
- **Phase 8 — Power outages (W10).** Added 2026-09-23 at the user's request,
  after close-out. Design first (what goes dark, how long, what it costs,
  how it's told), then build and measure against the economy invariants.

## Status

| Phase | Status |
|---|---|
| 1 | **Done** (2026-09-23) — weather chain, gated conditions, pinned temperature curve, daylight, sky line in prompts + HUD, rollover lines; `verify-weather.js` |
| 2 | **Done** (2026-09-23) — fronts arrive at a time of day (eased temperature), per-condition persistence, the weather in a room (scene reader + prompt line), the sky watch (changes, sunset/sunrise, slept wording), header emoji fix; `verify-weather.js` 63 |
| 3 | **Done** (2026-09-23) — outside appeal weights the balcony in every room picker (where, not whether), weather-told idle pastimes, the player's balcony/sunbathe read the weather, swim/sauna hot/cold leans; verify-c3's cross-control corrected to its premise; `verify-weather.js` 79 |
| 4 | **Done** (2026-09-23) — seasonal produce prices (whole dollars, both shops, "in season" note), craving lean inside a taste band (auto-cook + eat tie-break); `verify-weather.js` 87 |
| 5 | **Done** (2026-09-23) — dressed for the weather going out (coat / no jacket, `skipSlots`), first-warm-day and first-snow lifts, a floored dark-weeks dip for the sensitive; `verify-weather.js` 96 |
| 6 | **Built** (2026-09-23) — window view token in plate keys/prompts for rooms that see outside (≤16 looks), layout unmoved; `verify-weather.js` 102. **Pixels unverified** — needs the real image backend |
| 7 | **Done** (2026-09-23) — close-out: Handoff rewritten, docs/memory, ARCHITECTURE note |
| 8 | **Planned** — power outages (W10), added by the user after close-out |

## Open questions (parked)

None. Q1 (power outages) became W10 and Q2 (climate choice) became W11 —
both decided by the user 2026-09-23.

## Design invariants

1. **The season means of W2 are pinned** by a harness; changing the curve
   must keep them, or move `seasonOutdoorC` deliberately with a note.
2. **Weather is computed, never stored**; only what people *did* because of
   it lands in state. (The sky watch's marker is session-only UI state, like
   the rollover's `lastRolledOverDay`, and its lines are ordinary narration.)
3. **Each condition's long-run share is its authored mix weight**, whatever
   its persistence (the redraw is compensated). The temperature re-centring
   depends on that; change `persist` freely, but never bypass
   `weatherRedrawMix`.
