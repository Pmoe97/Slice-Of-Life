# Audit — there was nothing on TV (2026-09-23)

**Status: SHIPPED AND VERIFIED (0.14.2); ten design calls to confirm and nine
follow-ups OPEN (below).**
Written during a self-guided find-and-improve session whose brief was "find
somewhere we're missing genuine, fun gameplay content". No paired prompt:
this is an audit plus the slice it led to, not a phased overhaul. Move to
`complete/` once the calls are confirmed and the follow-ups are built or
explicitly declined.

---

## What was missing

Watching TV is one of the most common things anybody in the flat does:

- `watch_tv` is one of the three idle-pastime drives every roommate falls back
  on (`DRIVE_DEFS.watch_tv`, `isIdlePastime`; see the idle-pastime memory for
  how often those win), and the schedule tables' idle activity lists hand out
  `'watching TV'` too.
- The player's **Watch TV** verb (`self.watch_tv`) is one of the first things
  you find in the living room.

There was nothing to watch. The drive's line was *"{name} put the TV on and
sprawled across the couch."* The verb's lines were *"You watch some TV.
Mindless, relaxing."* and, with company, *"you watch whatever is on until it
ends"* / *"Neither of you is really following it"*. Streamly on the computer
had thirteen named shows (`STREAM_DEFS`), but an episode was a counter
(`resumePoints[showId] + 1`, "You watch episode 40 of Wilderness") with no
seasons, no content, nothing anyone else in the house knew about. The
living-room TV and Streamly didn't share anything.

## What shipped

`tv.js` (new, in both script lists), `STREAM_DEFS[*].tv` + `TV_EPISODE_BEATS`
(defs.computer.js), `TV_TUNING` (config.js), save key `world.tv`.

- **Shows air.** Each show has a format (serial / competition / episodic), a
  release (weekly on one weekday, or a whole season at once), a premiere day,
  season length and a hiatus. Day 1 is a Sunday; several shows are mid-season
  when the game opens and The Neighborhood's S5 premieres on day 5. Every
  episode has a beat: serials run premiere → middle → twist → finale, the
  mystery gets a new victim, place and killer every season (the killer is
  never the red herring), Bake Off crowns a winner. All derived from the day;
  nothing about the calendar is stored.
- **People follow shows.** Taste is derived and stable (a per-person jitter,
  `INTEREST_POOL` matches, temperament leans) — plus the job the show is
  about: a health worker hate-watches Code Black, a cook Bake Off, a tradesperson
  Renovation Rescue. Each roommate follows up to three shows and starts within
  two episodes of the latest of each. Caught up on everything, on half of days
  they start something new — usually what their housemates are into (word of
  mouth), so the flat gets each other into shows.
- **One screen.** The living-room TV plays one thing (`world.tv.nowPlaying`).
  A roommate who ends a tick on the sofa `'watching TV'` (the drive, or a
  schedule table) joins what's on or puts on their next episode; anyone
  there at an episode's midpoint has seen it; a sitting plays at most three
  new episodes before drifting to reruns; everyone gets up, the TV goes off.
  Their `watch_tv` event names it (*"Jonah flopped down next to Mira for
  Code Black while the rain came down outside."*), the roommate card and Look
  Around say *"watching Murder, Actually"* / *"The TV is on: …"*.
- **Your Watch TV** joins what's on, or the room picks: a show you and someone
  here are level on → your show → what the roommate here is into → what the
  house talks about → a first episode of something new → an old sitcom. The
  line says what happened in the episode and who was on the sofa (spoiled
  for you, seen it already and watching your face, lost because they skipped
  the earlier ones, laughing at the same bits, pausing it to explain their
  job). Everyone who saw a new episode is credited; you and a roommate who
  saw one together are marked as watching it together.
- **Streamly** is the same shows and the same place in them: the card says
  what season is airing, where you're up to, when the next drops and who in
  the flat watches it; watching tells you what happened, when the next one
  drops, and which roommates you just overtook. Old saves' resume points are
  adopted once (clamped to what's out). Caught up, you rewatch (no mood lost).
- **Spoilers.** A roommate ahead of you on a show you've watched in the last
  two weeks, awake in a room with you, may — once a day, ~even odds over three
  hours together — let the latest episode slip: the real beat of the real
  episode (`tv_spoiler`, 'embarrassment' in their memory). The careful and
  warm catch themselves instead (`tv_near_spoiler`). When you reach that
  episode: *"You already knew. Thanks, Dagny."*
- **Talk.** `[Watching]` in the NPC block: what they're hooked on, the latest
  beat they've seen (asides to "you" trimmed), what else they watch, where you
  are relative to them (behind: spoilers would land badly; ahead; level, and
  watching it together), when the next one drops.
- **A broken Living Room Setup plays nothing** (the player's verb was already
  gated on it; the drive isn't — see F7). Repair it and the shows come on.

**Invariant, measured:** the pass decides WHAT is on, never WHETHER anyone
watches. `verify-tv.js` section 10 runs a week of the real `resolveBatch` with
the pass on and off (proved off: `world.tv` never created) and asserts identical
events tick for tick and identical roommate location/activity/needs/mood/
relPlayer. The full sweep moved by exactly this session's new assertions
(6307 → 6397, same 12 pre-existing failures, every other file's count
unchanged).

## Design calls made without the user (confirm or overrule)

1. **The existing 13 Streamly shows are the whole catalog**, given schedules
   and beats rather than replaced; their names/genres are unchanged.
2. **Weekly drops + hiatuses** rather than everything always available — so the
   house converges on the same episode and spoilers have a window.
3. **The room picks what you watch on the living-room TV** (no chooser); the
   computer is where you choose. See F3.
4. **Spoilers have no numbers** — no mood or relationship delta, just the line,
   the roommate's memory of doing it, and the payoff line later.
5. **Hate-watch professions**: health → Code Black, food → Bake Off, trades →
   Renovation Rescue.
6. **A broken Living Room Setup plays nothing**, and the game opens with it
   broken — so the TV content starts after the first living-room repair.
7. **Word of mouth on half of caught-up days** (`TV_TUNING.discoverChance`).
8. **Streamly caught up = rewatch**, so Streamly's mood stays uncapped as before.
9. **Watch TV's shared templates were removed** and its narration is built by
   `tvWatchNarration` (company included). verify-i5 now names it as the one
   self-narrating shared entry (`SELF_NARRATING_SHARED`) and repoints its
   generic D17 narration checks to `self.relax`.
10. **Time costs untouched**: a Streamly episode still costs 60–120 min
    (`episodeTicks`), a living-room Watch TV 30 min (`tvMinutes`). See F9.

## Open follow-ups

- **F1 — Appointment TV.** A roommate proposing a watch party for a finale or
  a new-episode night (the `hangout` commitment kind exists). Changes WHETHER
  people gather, so it needs a design pass and a verify-c1/c2/c3 run.
- **F2 — The fridge.** "DON'T watch ep 7 without me — M": a house-note motive
  grounded in `world.tv.together` (you and them level on a show). Rides
  housenotes.js's motive table; see house-notes-audit-2026-09-23.md.
- **F3 — Choose what to put on.** A picker on Watch TV (the recipe picker's
  shape) listing shows with where you are.
- **F4 — Chatter.** Roommates posting about finales; a spoiler on your feed.
- **F5 — Occasions.** Halloween horror night, the Midwinter cozy movie
  (occasions plan P6/P7 name both) can ride `nowPlaying`.
- **F6 — Books.** `read_book` has exactly the same hole ("curled up with a
  book"): a book catalog, reading progress, lending, a two-person book club.
- **F7 — The drive has no TV.** `DRIVE_DEFS.watch_tv` has `gates: []` and no
  `FACILITY_DRIVE_MAP` entry, so roommates "put the TV on" in a house whose
  Living Room Setup is broken (the player can't). Pre-existing; this session
  made the screen honest (nothing plays) but left WHETHER alone. Gating the
  drive would move idle-pastime tallies — verify-c1/c2/c3 first.
- **F8 — Streamly's Now Playing panel is dead UI.** `renderStreamly` reads
  `stream.watchingShowId` / `watchProgress`; nothing writes either. Pre-existing.
- **F9 — Two lengths for one episode.** Streamly's 60–120 min vs the living
  room's 30. Pre-existing; not reconciled.

## Verification

- `node src/src/dev/verify/verify-tv.js` — 89/0: registration, calendar,
  beats (filled, capitalised, unique per season, new case per season, killer ≠
  red herring, no " while " — verify-weather reads that word as the cozy clause),
  taste, seeding, the screen (joiners, midpoint credit incl. a leaver, binge
  cap, TV off, broken setup), every Watch TV mode through the real DSL and
  narrateAction, spoilers, Streamly, the prompt line through buildNpcBlockV2,
  and the on/off invariant.
- `verify-i5.js` 80/0 (was 79: +1 "a self-narrating shared entry names the
  company all the same").
- Live on dev-harness.html (throwaway Sandbox): the roommate card read
  "watching Murder, Actually"; the real Watch TV outcome window showed the
  join line and beat; the Streamly cards and an episode line; a spoiler
  surfaced in the log through `surfaceRoomEvidence`. No script errors.
