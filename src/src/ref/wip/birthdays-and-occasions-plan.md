# Birthdays — personal dates on the calendar

Status: **COMPLETE — all six phases built and verified.** Phase 1
(roommate birthdays) shipped 2026-09-22 in a find-and-improve session; the user
then answered every open question the same day (D13–D16 below), and the
holiday half of the old "Occasions" scope moved to its own plan. Phases 2–6
(the player's own birthday, importance & gossip, the house celebrating, birthday
parties, contacts) were built 2026-09-29 in one session — see the Handoff. The
file keeps its original name because a dozen source comments cite it.
Last updated 2026-09-29.

Companions:
- `src/src/ref/complete/seasonal-calendar-and-sandbox-plan.md` (built the
  140-day, four-season calendar this plan puts personal dates onto; D2 there
  — the weekday shift — is why `getWeekday`, not a reordered
  `WEEKDAY_NAMES`, names the day a birthday falls on)
- `src/src/ref/complete/asks-and-attachments-plan.md` (`ask_gift` is the
  birthday-gift path — D8 here adds a bonus on top of its match delta and
  its first `postEffects`; read that plan's invariant 1 before touching
  `decide()`)
- `src/src/ref/complete/food-overhaul-plan.md` (`taste.js` is the precedent
  for D1's derived-but-stable, never-stored per-NPC trait)
- `src/src/ref/complete/knowledge-gossip-memory-plan.md` (birthday facts are
  written in the `relationship` category, a `socialCategories` member —
  eligible for the warmth bias and transmission; whether a "forgot my
  birthday" fact actually spreads was NOT measured, see Q4)
- `src/src/ref/wip/actions-and-activities-overhaul-plan.md` (Phase 17's
  `$HouseParty` is Phase 5's substrate; its Q4 cook-off question is a
  separate, still-parked occasion)
- `SEASONS-AND-OCCASIONS-ROADMAP.md` (same folder) — the umbrella this plan
  now sits under; R7 (player picks their birthday), R8 (importance), R9
  (aging) are the user's answers to this plan's old Q1/Q4/Q2.
- `occasions-and-holidays-plan.md` / `aging-plan.md` (same folder) — the
  holidays (old Q3) and aging (old Q2) now live there; festivity (occasions
  D6) is one input to birthday importance (D14 here).

This is a living document. **Read the Handoff section immediately below
before anything else** — it is the single source of truth for where the last
session left off. The plan is complete; what remains is the "Waiting on the
user" list in the Handoff (design calls the session made and the user has not
confirmed) and the follow-ups it names.

---

## Handoff — read this first

**Nothing to resume** — all six phases are built. The next work in this area is
`aging-plan.md` (the number moves on the birthday — its Phase 1 rides
`processBirthdaysForDay`) and Occasions P4; both are separate plans.

### Phases 2–6 session (2026-09-29)

Built in one session at the user's request ("complete the remainder of this
plan"). Everything is in `birthdays.js` (one module, ~1,000 lines now) plus
its hook sites; `BIRTHDAY_TUNING` (config.js) owns every number and every
authored line (new blocks `player`, `importance`, `celebrate`, `party`,
`contacts`).

- **Phase 2 — the player's birthday (D13, D17–D18).** `player.birthday`
  (day-of-year 1..140) is picked in creation on a new studio field kind,
  `birthday` (studio.js `buildStudioBirthday`), which opens the SHARED year
  grid as a picker (`buildBirthdayPicker`, render.calendar.js — the Calendar's
  Year tab's own `buildYearGrid` with `selectable`, over
  `yearGridModel(null, { noToday: true, birthdays: false, events: false })`, so
  holidays show and nothing is "today"). Blank = rolled by
  `rollPlayerBirthday(seed)` at world-build (sim.js `buildGameState`); Roll
  Everything fills a blank one, never overwrites a picked one; Sandbox re-open
  keeps it (`studioDraftFromPlayerRecord`). A save from before Phase 2 has no
  stored birthday: `playerBirthdayDayOfYear` DERIVES a stable one (seed + name,
  D1's precedent) and a one-time modal (`openPlayerBirthdayPrompt`, ui.js,
  triggered from `startClockLoop` — the funnel every load path goes through)
  asks with that day pre-selected; closing it any way keeps the derived day
  (`promptShown`). On the day (`processPlayerBirthday`): a narration line, a
  mood lift, a text at midnight from each resident who KNOWS it (fond ≥ 0.30, or
  told) and is fond ≥ 0.5 (below that, a coin toss between text and "say it in
  person" — the `[Birthday]` prompt line makes them say it), and the closest
  resident fond ≥ 0.35 leaves a present in your bag (the `gift_to_player`
  `MOVE_ITEM` path via `giftableStack`; owning nothing giftable, they "picked
  something up" — chocolates or flowers). Telling someone ("my birthday is…",
  `toldPattern`) is a beat (`noteBirthdayTold`) that makes them know it; it is
  NOT read as learning theirs. The Year tab marks your day; the Birthdays tab
  always lists you.
- **Phase 3 — importance & gossip (D14, D19).** `npcBirthdayImportance` (0..1,
  derived, never stored, `bible.birthdayImportance` overrides): base + festivity
  (occasions.js `npcFestivity`) + warmth + traits (dramatic/expressive/needy/
  insecure up; stoic/understated/independent down) + a milestone age. The
  multiplier `birthdayImportanceScale` spans 0.6..1.5 and scales the forget
  sting and the wish's affection/mood (trust unscaled). `birthdayGossip`: a hurt
  roommate at importance ≥ 0.6 tells their 1 (2 at ≥ 0.8) closest housemates
  (cast affection ≥ 0.3) — a real `told_by:<id>` fact through
  `receiveTransmittedFact` — and the log line says "It seems to have got around
  the house."
- **Phase 4 — the house celebrates (D20).** `celebrateBirthday`, built at the
  rollover so it is there in the morning: each housemate fond of the birthday
  roommate (cast affection ≥ 0.3) does ONE thing chosen by a hash of
  (celebrant, honoree, year) — a card (a real `note`, addressed to them, on their
  bedroom — or on the fridge when they have no bedroom, which a fresh Sandbox
  roommate doesn't), a cake (the new `birthday_cake` item: six servings, fridge
  class, three days — ONE per birthday, the fondest baker's), or a Chatter post
  (liked by the honoree). Cards and cakes emit `birthday_card` / `birthday_cake`
  world events (classified in `EVENT_IMPORTANCE`/`EVENT_EMOTION`), cast-web
  bump each way, a small mood lift for the honoree, one narration line for the
  player. Those who did nothing are noticed only by an honoree whose importance
  ≥ 0.5 (a small cast drop and a memory, at most two).
- **Phase 5 — a birthday party (D21).** A `party` commitment on a resident's
  birthday that the resident ACCEPTED is theirs (`birthdayPartyHonoree`).
  sim.js's per-tick party pass calls `noteBirthdayPartyPresence` — the
  attendance ledger `commitment.attended` (the player counts when in the room).
  The next rollover (`resolveBirthdayParties`, run BEFORE the forget sting so a
  party thrown counts as remembering) pays out: the honoree's mood and, toward a
  player-hosted party, affection (or a sting if the player threw it and never
  came), a memory of who came, guests warmer toward them, accepted no-shows
  cooler. A party that never reached its guest of honor pays nothing (and the
  ordinary sting then applies). The `[Birthday]` prompt line carries the party.
- **Phase 6 — beyond residents (D22).** A contact (`isBirthdayContact`: a
  non-resident, non-former, non-prospective NPC with `contactKnown` — a partner,
  Del, anyone whose number you have) gets a birthday: on the day they text you
  a line if fond ≥ 0.25 (Del always, in his own voice), it teaches you the date,
  your wish counts (at half a roommate's), the prompt line reaches them, and the
  Year tab, the Birthdays tab and the Codex page (`renderCodexDetail`, both copies)
  show it. No sting, no tip-off, no celebration — those assume a shared house.
- **Hook sites touched:** `sim.js` (`player.birthday`; the party pass),
  `studio.js`, `render.calendar.js`, `occasions.js` (`yearGridModel`: `noToday`,
  `selfBirthday`, contacts), `ui.js` (the old-save modal + two `data-action`s),
  `time.js` (`startClockLoop` → prompt), `render.computer.js` (Codex birthday, both
  copies), `defs.world.js` (`birthday_cake`), `config.js`, `index.html` (CSS +
  `?v=`), `defs.patchnotes.js` (0.14.5).
- **Verified:** `verify-birthdays.js` **68/68** (updated: the wish and sting are
  now scaled by importance; the Calendar always lists you), new
  `verify-birthdays-p2.js` **88/88** (registration; the roll/pick/store/derive
  path incl. `SIM_generateHouse` with a draft; the day itself; the year-grid
  model and the REAL `render.calendar.js` picker over a fake DOM; importance
  spread/traits/scale; gossip; celebration incl. one cake and the no-bedroom
  fallback; every party case incl. an end-to-end real `resolveTick` → attendance
  → rollover; contacts incl. Del; old-save record shapes). Full sweep: **6908
  passed / 13 failed / 0 errored** — the 12 known failures (see
  `verify-suite-regression-triage-2026-09-20.md`) plus one that is not this
  work: `verify-im-asks.js` "no runtime writer pushes onto a thread directly"
  fails on a CRLF checkout because its regex strips `pushImMessage` with
  `\n}\n` (computer.js:1897 is that function's own `push`, so the code is
  right; the test is line-ending-sensitive).
- **Live-verified** in `dev-harness.html` (throwaway Sandbox, not the user's
  save): the studio's Birthday field opens the grid, a pick lands in the draft
  (13th of Summer = 48), Roll it clears, Roll Everything fills a blank and keeps
  a picked one; the old-save modal (compact grid so Save stays on screen) —
  pick → Save stores it, log line, prompt does not return; a real rollover
  across midnight onto the player's birthday logged "🎂 It's your birthday.",
  Mira left the chips, Mira's text arrived, Jonah was marked "spoken"; a real
  rollover onto Mira's birthday logged "🎂 It's Mira's birthday today." and "🎈
  The house has been busy for Mira: Jonah left a card." with the card on the
  fridge. That live pass found one real bug (a Sandbox roommate has no
  `residency.room`, so the card had nowhere to go) — fixed, with a test.
- **Not live-verified:** the party path (verified end to end in node, through the
  real `resolveTick`, but not played), a cake/post in the browser, the Codex
  line, and the studio inside the real New Game flow (the studio was opened
  directly; the confirm → options → cutscene handoff carries the draft
  unchanged and `buildPlayerDraftForNewGame` is unit-tested).

**Waiting on the user** (design calls this session made and the user has NOT
confirmed — every one is a number or a wording in `BIRTHDAY_TUNING`, cheap to
change):
1. **Who knows your birthday, and how they greet you** — a resident knows it at
   affection ≥ 0.30 or when told; ≥ 0.5 → a midnight text, below that a coin
   toss between a text and saying it in person. Right?
2. **The birthday present** — the closest resident at ≥ 0.35 gives something
   they own, else chocolates or flowers. Should a present cost the giver
   anything, or be rarer?
3. **The old-save prompt** — asked once, dismissing it keeps the derived day. Do
   you also want a way to CHANGE your birthday later (there isn't one)?
4. **Importance** — the formula and the 0.6..1.5 span. And gossip: importance ≥ 0.6
   tells one close housemate, ≥ 0.8 tells two. Big enough? too big?
5. **The celebration** — built at midnight so it's there in the morning; card /
   cake / post by a hash; one cake per birthday. Should the cake be something the
   player can also bake for them? (It isn't — nothing in the player's verbs
   makes a birthday cake.)
6. **Parties** — the honoree must have ACCEPTED the party to be its guest of
   honor. A party the player throws for someone who declines is just a party.
7. **Contacts** — texts only when fond ≥ 0.25 (Del always); your wish pays at half.
8. **The version** — this bumped `GAME_VERSION` to 0.14.5 with a "Birthdays" patch
   note (the last two sessions each bumped one). Revert to 0.14.4 if you'd
   rather fold it into that entry.

**Follow-ups (to-dos, not questions):** aging (`aging-plan.md`) moves the number on
the birthday — its Phase 1 hooks `processBirthdaysForDay`; a resident's own
party (NPC-hosted, for their own birthday) works through the accepted-guest rule
but no NPC currently proposes one; the cake has no "everyone gathers" beat.

**Phase 1 session notes (2026-09-22, find-and-improve session):**
- Why this area: a survey for missing *content* (not bugs) found the
  seasonal calendar has four 35-day seasons and not one personal date on
  it — `grep -i "birthday\|holiday\|festival"` over `srcfiles/` hit only
  flavor strings, and no design doc had scoped them out. "Play Games" and
  "Watch TV" (flat time-for-mood verbs, 1–2 canned lines each) were the
  other two candidates surveyed; see Q5.
- Built: `birthdays.js` (new — index.html beside `pregnancy.js`, and
  `dev/verify/loadgame.js` ORDER), `BIRTHDAY_TUNING` (config.js, after
  `NPC_GIFT_TUNING`), and five hook sites: `processDayRollover` (ui.js,
  after the pregnancy pass), `doConvSend` (ui.js, after
  `askTurn.applyEffects()`), `resolveImReply` (computer.js, both reply
  paths), `buildNpcBlockV2` (llm.js, beside `[Pregnancy]`/`[Baby]` — so
  scene AND IM prompts), `ASK_GIFT` (asks.js: `decide` flag, `effects`
  bonus, a new `postEffects`, `leafNote`), plus the Calendar's new
  `birthdays` screen (defs.computer.js) over a `birthdays` source
  (render.computer.js `resolveScreenSource`). `player.birthdays` noted in
  state.js's SAVE_KEYS comment. `?v=` bumped on every touched file.
- Verified: `verify-birthdays.js` **68/68** (derivation, arithmetic, learn,
  wish, tip-off/fish/shy, day-of, forget + every non-sting case, gift through
  the real `resolveAsk`, IM prompt, Calendar rows, old-save lazy default).
  Full sweep **5959 passed / 12 failed / 0 errored** against a same-day
  pre-edit baseline of 5891 / 12 / 0 — delta exactly the 68 new assertions,
  identical failure set (all 12 pre-existing, catalogued in
  `verify-suite-regression-triage-2026-09-20.md`).
- Live-verified in `dev-harness.html` (a throwaway 3-roommate Sandbox, not
  the user's save), through the real rollover (`advanceAndResolveMinutes`
  across midnight) and real UI clicks: Han's properly-punctuated tip-off
  text landed in Messages two days out ("Quick note: Yuki's birthday is on
  Wednesday…") → the Calendar's Birthdays tab listed Yuki "(in 2 days)" →
  the day-of log line + hint → texting "happy birthday!! 🎂" from the real
  Messages window paid out (affection 0.50→0.56, trust +0.02, mood
  0.08→0.18, memory, "🎂 Yuki was glad you remembered.") → no sting next
  morning; Ravi, fond and ignored, stung the morning after (0.50→0.45,
  tension +0.04, memory, next-day prompt line). The spoken path was driven
  through the real conversation overlay with `callLLM` stubbed in the page
  (the dev harness has no model): "🎂 Han lights up — you remembered." and
  the write survived `applyProposal`. Fixtures used: relationship numbers
  (to stand in for an established household) and one `bible.birthday`
  override — nothing else.
- Surprise worth remembering: `SIM_generateHouse` leaves `bible.name` empty,
  so a harness asserting "the line names them" with `includes(name)` passes
  vacuously (`includes('')` is always true). The harness names its NPCs.

**Blockers / flagged deviations:** None blocking. Two things the user should
know: (1) the Patch Notes line went into 0.14.2, whose title is still
"Hotfix: RoomList Applicants" — a feature now sits in a hotfix-titled entry;
retitling was left to the user. (2) D1–D12 below were made by the session,
not the user — they are locked for *consistency*, and open to the user's
review.

---

## The thesis

Slice of Life is a social sim whose whole economy is "money problems are
solved by people". It has a deep relationship engine — five-axis
`relPlayer`, a cast web, gossip, memory, rumination, initiative — and a real
calendar with seasons and weekdays. What it did not have was a single
*occasion*: a day that means something to a specific person, that you can
know about, prepare for, and get right or wrong.

Occasions are the oldest trick in the genre (Harvest Moon, Stardew,
Animal Crossing, The Sims) because they convert a relationship number into a
story with a deadline. A birthday is the smallest complete version: it
recurs, it is personal, it rewards paying attention (did you ask? did you
listen to the heads-up?), and forgetting it is a *felt* failure that the
existing memory and gossip systems can carry forward on their own. And it
costs almost nothing to build here, because every piece it needs already
exists: a derived-stable seed trait (`taste.js`), one-way NPC texts
(`processNpcImMessages`), the gift ask, the prompt's structural life-fact
lines, the Calendar app, the daily rollover.

### What this plan is *not*
- **Not a holiday calendar.** Holidays are `occasions-and-holidays-plan.md`.
- **Not aging.** `bible.age` does NOT increment in Phase 1 — the prompt line
  deliberately never says "turning N". Aging is `aging-plan.md` (whose
  survey found portrait keys are identity-anchored, which is why it needs
  its own design).
- **Not a new menu verb.** Remembering is *saying it* — free text, in person
  or by text (D6). No "Wish Happy Birthday" button competes for chip space.
- **Not a grind.** One wish and one birthday gift pay once per birthday per
  NPC; the stacked best case is 0.24 affection in a day (D11).
- **Not a trap.** You are never stung for a birthday you had no way to know
  about (D7).

## Evidence

- `CALENDAR` (config.js) — `daysPerSeason: 35`, `daysPerYear: 140`, four
  seasons; `formatDate` renders "Sunday, 1st of Spring, Year 1". No table
  anywhere keyed by day-of-year.
- Pre-Phase-1 `grep -in "birthday"` over `srcfiles/`: two flavor strings
  (`config.js` shared-beat pool "threw an impromptu birthday dinner…",
  `defs.menu.js` an image-prompt tag) and `pregnancy.js`'s unrelated
  `birthDay` field. `grep -in "holiday\|festival"`: one flavor string.
- `self.play_games` / `self.watch_tv` (defs.actions.js): flat
  `ADJUST_NEED` time→mood verbs, one solo template, two shared templates.

## Locked decisions

### When (D1–D2)
- **D1 — derived, never stored.** `npcBirthdayDayOfYear(npc)` = 1 +
  ⌊mulberry32(genSeed + `BIRTHDAY_TUNING.seedSalt`)() × 140⌋. An integer
  `bible.birthday` in 1..140 overrides (authored characters, harnesses);
  anything else is ignored. Same NPC → same birthday forever, old saves
  included, zero migration — the `taste.js` precedent.
- **D2 — residents only (Phase 1).** Every NPC *has* a birthday (the
  function is total), but only `residency.status === 'resident'` NPCs are
  announced, tipped off, prompted, listed, rewarded or stung. Contacts,
  visitors, applicants and former residents are Phase 5's call.

### Finding out (D3–D4)
- **D3 — ask and you learn.** The prompt line always carries the real date,
  so any line mentioning birthdays to a roommate (not on their birthday)
  marks it known with a Calendar beat. Generous by design — the NPC is
  answering from the same date the Calendar shows, so they can't disagree.
- **D4 — the heads-up, two days out.** A housemate fond of the birthday
  roommate (cast affection ≥ 0.3) *and* friendly with you (≥ 0.15) texts a
  tip-off — strongest pair wins, deterministically. Failing one, the
  birthday roommate hints themselves if fond of you (≥ 0.35) and not shy
  (assertiveness ≥ 0). Failing that, silence — you find out on the day.
  Lines come from pools keyed by the *sender's* `speech.textingStyle`, chosen
  by a pure hash of (sender, subject, day). Once per birthday.

### The day (D5–D6, D8–D9)
- **D5 — the house knows.** At the rollover onto the day: a narration line
  (with a how-to hint until the player has ever remembered one), the NPC's
  mood +0.08, and the birthday becomes known.
- **D6 — remembering is saying it.** On the day, any player line matching
  `BIRTHDAY_TUNING.wishPattern` (birthday / bday / hbd / happy returns /
  cumple) to that roommate — spoken or texted — is the wish: affection
  +0.06, trust +0.02, their mood +0.10, a small player mood impulse, a
  non-pinned `relationship` memory. Once per birthday. Checked AFTER the
  reply is applied (`applyProposal` replaces `npcs[id]`); the IM path counts
  even when no reply comes back (the text was delivered).
- **D8 — a birthday present.** `ask_gift` on the day adds
  `giftBonus.affection` (+0.06) on top of the match delta (a miss still earns
  it — the occasion is what was remembered), +0.08 mood, a "for their
  birthday" memory, a birthday `leafNote`. Once per birthday; a second
  present is an ordinary gift. The decision gains `birthday: true` only when
  true, so every other gift decision keeps its exact old shape.
- **D9 — the prompt line.** `[Birthday]:` in `buildNpcBlockV2`, residents
  only: the date always; "in N days / tomorrow" inside `promptSoonDays` (3);
  on the day, whether the player has wished / gifted / said nothing; the day
  after, the hurt if forgotten.

### After (D7) and surfaces (D10)
- **D7 — the forget sting.** At the next rollover, a birthday not wished or
  gifted, that the player *knew about*, for a roommate fond enough to expect
  it (affection ≥ `expectAffection` 0.35, the same "fond" bar as
  `gift_to_player`): affection −0.05, tension +0.04, mood −0.10, a
  `relationship` memory at importance 0.6 (not pinned — it can fade), a
  narration line. `applyRelDelta` gets `currentDay` undefined — a midnight
  sting is not an interaction. Idempotent (`mark.resolved`).
- **D10 — the Calendar's Birthdays tab.** A read-only list screen over the
  `birthdays` source: every known resident birthday, soonest first, "today!"
  and "you remembered ✓" on the day.

### Shape (D11–D12)
- **D11 — magnitudes sit under a good gift.** Wish 0.06 < gift interest 0.12;
  sting 0.05 < wish. Stacked best day 0.24.
- **D12 — pure domain module, UI narrates.** `birthdays.js` never touches the
  DOM or the model; `processBirthdaysForDay` returns `{ lines, texts }` (texts
  already delivered), the wish/gift notes return `{ kind, beat }`, the UI
  paints them. Same split as `pregnancy.js`.

### The user's answers (D13–D16, 2026-09-22)
- **D13 — The player picks their birthday** (old Q1, roadmap R7): in
  character creation, from a calendar view of the entire year (4 seasons ×
  35 days). The same year-grid component renders the Calendar app's Year
  view (occasions P1). Sandbox gets the picker too.
- **D14 — Birthday importance** (old Q4, R8): a derived 0..1 per character
  (festivity is one input; warmth, `dramatic`/`expressive`/`needy`/
  `insecure` up, `stoic`/`understated`/`independent` down, milestone ages
  up). It scales the forget sting and the joy of being remembered — and a
  high-importance person who is forgotten by someone important to them
  **tells people**: the forgot fact is seeded into close housemates'
  memories as secondhand gossip (a real transmission, not a hope). "It
  doesn't need to be a HUGE deal."
- **D15 — People age** (old Q2, R9): see `aging-plan.md`. The number moves on
  the birthday (that plan's Phase 1 rides this module's rollover pass).
- **D16 — Holidays** (old Q3) → `occasions-and-holidays-plan.md`; the Game
  Room (old Q5) → `game-room-overhaul-plan.md`.

### Decisions the 2026-09-29 session made (D17–D22 — unconfirmed, see "Waiting on the user")
- **D17 — the player's birthday is a day-of-year 1..140 on `player.birthday`.**
  Blank rolls from the seed (`rollPlayerBirthday`); an old save derives one
  (`playerBirthdayDayOfYear`) and asks once. Never a stored default for old saves.
- **D18 — who knows it:** fond ≥ 0.30 or told; texts at ≥ 0.5 (a coin toss below);
  the closest fond ≥ 0.35 leaves a present.
- **D19 — importance is derived (R5)** and scales the sting and the wish 0.6..1.5;
  gossip is a real `told_by` transmission, 1–2 close housemates.
- **D20 — the house celebrates at the rollover, one thing each, one cake.**
- **D21 — a party on a birthday is the honoree's iff they accepted;** attendance
  is a ledger written by the per-tick party pass; payoff at the next rollover,
  before the sting.
- **D22 — contacts get the day, the text (if fond) and the wish, never the sting.**

## Data model

```js
// Derived (D1) — never stored:
npcBirthdayDayOfYear(npc) → 1..140

// player.birthdays (lazy default: ensurePlayerBirthdays)
{
  known: { [npcId]: dayLearned },
  everWished: bool,                  // drops the day-of hint
  marks: { [npcId]: {                // ONE per NPC, for one birthday year;
    year, wished, gifted, headsUp,   //   a later year's first write replaces it
    resolved, forgot, via            // via: 'spoken' | 'text' | null
  } },
}
```

`BIRTHDAY_TUNING` (config.js) owns every number and every authored line.

## Implementation phases

### Phase 1 — Roommate birthdays ✅ (2026-09-22)
- **Goal:** D1–D12 as above.
- **Files:** `birthdays.js` (new); `config.js` (`BIRTHDAY_TUNING`);
  `ui.js` (rollover pass + `doConvSend` wish); `computer.js`
  (`resolveImReply` wish); `llm.js` (`[Birthday]` line); `asks.js`
  (`ASK_GIFT`); `defs.computer.js` + `render.computer.js` (Calendar tab);
  `state.js` (SAVE_KEYS comment); `index.html` + `dev/verify/loadgame.js`
  (registration); `defs.patchnotes.js` (0.14.2 line).
- **Verification:** `node src/src/dev/verify/verify-birthdays.js` (68);
  full sweep delta = exactly its assertions; live: tip-off → Calendar →
  day-of → text wish → no sting / forget → sting.

### Phase 2 — The player's own birthday (D13) ✅ (2026-09-29)
- **Goal:** the player picks their birthday from a full-year grid in
  creation (and Sandbox); it shows on the Calendar; on the day, residents who
  know it (fond enough, or told) text or say happy birthday, the closest
  leaves a present (the `gift_to_player` MOVE_ITEM path), and the player's
  mood lifts. Old saves without one get a derived birthday and a one-time
  "when's your birthday?" prompt to set it.
- **Files:** `studio.js` (a `birthday` field kind in `PLAYER_STUDIO_TABS`
  beside Age), a year-grid renderer shared with the Calendar (occasions P1),
  `birthdays.js` (player pass), `config.js` (lines), `menu.js`/sandbox.

### Phase 3 — Birthday importance & gossip (D14) ✅ (2026-09-29)
- **Goal:** importance scales the sting and the payoff; a forgotten
  high-importance roommate seeds the fact into close housemates' memory as
  secondhand gossip, so it comes up in *their* conversations.
- **Verification:** measured spread (a stoic barely cares, a dramatic one
  tells two people); the gossip fact lands with provenance `told`.

### Phase 4 — The house celebrates ✅ (2026-09-29)
- **Goal:** on the day, each resident fond of the birthday roommate does
  something small and perceivable — a card on their door, a cake in the
  fridge (a real edible item), a Chatter post — as world events the meanwhile
  ticker / `surfaceRoomEvidence` already surface, with a cast-web bump. A
  roommate who wasn't fond, and did nothing, is noticed too.

### Phase 5 — A birthday party ✅ (2026-09-29)
- **Goal:** `$HouseParty` booked for a roommate's birthday becomes *their*
  party — a bigger payoff for the guest of honor, attendance remembered.

### Phase 6 — Beyond residents ✅ (2026-09-29)
- **Goal:** contacts, partners, and Del get birthdays surfaced (a text on the
  day); the Codex/profile shows a known birthday.

## Status

| Phase | Status | Summary |
|---|---|---|
| 1 | **Done** (2026-09-22) | Roommate birthdays — derive, learn, tip-off, day-of, wish, gift bonus, forget sting, Calendar tab; 68 checks, live-verified |
| 2 | **Done** (2026-09-29) | The player's own birthday — picker on the year grid in creation/Sandbox, old-save one-time prompt, day-of greetings + a present; `verify-birthdays-p2.js` |
| 3 | **Done** (2026-09-29) | Importance (0.6–1.5 scale on sting and wish) & gossip (a real told_by transmission) |
| 4 | **Done** (2026-09-29) | The house celebrates — a card, a cake (`birthday_cake`, one per birthday) or a Chatter post; cast bump; the cold are noticed |
| 5 | **Done** (2026-09-29) | Birthday parties — the attendance ledger and the next-morning payoff |
| 6 | **Done** (2026-09-29) | Contacts — a text on the day (Del included), your wish counts, Calendar/Codex show it |

## Dependency order

```
Phase 1 ──► Phase 2 (needs the year-grid from occasions P1)
        ──► Phase 3 (needs occasions P1's festivity)
        ──► Phases 4, 5, 6 (independent)
```

## Open questions

All five original questions were answered by the user on 2026-09-22 —
see D13–D16. None open.

## Design invariants

1. **A birthday you couldn't know about never stings.** The sting reads
   `known`; if a future phase adds a new way to learn, it must set `known`,
   and nothing may sting without it.
2. **Write after `applyProposal`, never before.** `applyProposal` replaces
   `npcs[npcId]`; the wish hook sits after it in both `doConvSend` and
   `resolveImReply` for exactly this reason (the asks plan's `postEffects`
   note is the scar).
3. **Birthdays are derived.** Don't add a stored birthday field to generated
   bibles — the override exists for authored characters only. A stored copy
   is a second source of truth that old saves won't have.
4. **Once per birthday.** Every reward is gated on the year's mark; a new
   reward must be too.
5. **The party resolves before the sting.** `resolveBirthdayParties` runs first
   in `processBirthdaysForDay` so `mark.partied` is set when the sting reads the
   mark — reorder it and a thrown party stings.
6. **A rollover write to `npcs[id]` reads the CURRENT record.** The day-of pass,
   the celebration and the gossip each replace `gs.npcs[id]` (immutably); a pass
   that keeps a stale `const npc` across another pass's write loses the write.
