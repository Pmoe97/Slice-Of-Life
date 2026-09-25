# Audit — the roommates had no hobbies (2026-09-24)

**Status: SHIPPED AND VERIFIED (0.14.2). Round 2 (same day, at the user's
direction — "if it's a to-do, do it; if it's a question, ask"): five follow-ups
BUILT (F1, F4, F5, F8, F9). Round 3 (same day): the user answered all nine
design calls (all kept) and said yes to F2, F3, F6 and F7, all four BUILT (see
"Round 3"). Still waiting on the user: six round-3 design calls, and the
Agenda merge, which has its own plan (`wip/agenda-app-plan.md`, seven
questions). Also fixes a numb verify-i2 check (see "A harness bug found on the
way") and, in round 3, a numb verify-w4 check.**
Written during a self-guided find-and-improve session whose brief was "find
somewhere we're missing genuine, fun gameplay content". No paired prompt: this
is an audit plus the slice it led to, not a phased overhaul. Move to
`complete/` once the calls are confirmed and the follow-ups are built or
explicitly declined.

---

## What was missing

Every resident has three-ish interests (`bible.interests`, from
`INTEREST_POOL`), and every interest carries a `skill` number. Nothing in a
roommate's day ever touched either:

- `skill` is rolled once at generation (`Math.floor(charRng() * 40)`, sim.js)
  and never written again anywhere in the tree.
- The schedule tables hand out `'playing guitar'`, `'painting'`, `'crafting'`
  and `'journaling'` uniformly at random (`ACTIVITY_TABLES.leisure` /
  `wind_down`), unconnected to anyone's interests — and the idle-pastime
  drives win almost every free half-hour anyway.
- `OFFSCREEN_EVENTS`' `hobby` row says "{name} spent time on their {hobby}"
  with `{hobby}` drawn from a fixed list (`EVENT_FILL_DATA.hobby`), so a
  politics-and-partying roommate can "spend time on their knitting".

**Measured** (scratch run, four weeks × three houses × twelve residents, the
real `resolveBatch`): `'playing guitar'` 10 ticks in total, `'painting'` 7,
`'crafting'` 13, `'journaling'` 5 — about one half-hour per person per month —
against 1,469 ticks of `'reading'`, 1,314 of `'watching TV'` and 851 of
`'scrolling social media'`.

## What shipped

`projects.js` (new, after `tv.js` in both script lists), `PROJECT_TUNING` +
`DRIVE_DEFS.work_on_project` (config.js), save key `world.projects`, effect
`PROJECT_ENCOURAGE`, verb `self.encourage_project` ("Ask About Project"),
event types `project_session` / `_started` / `_milestone` / `_finished` /
`_abandoned` / `_gift`.

- **A project each.** `PROJECT_KINDS`: 21 kinds, one or more for every one of
  the 22 `INTEREST_POOL` names (music → a song on guitar, partying → learning
  to DJ, art → a painting, writing → a novel, politics → a zine, true crime →
  a cold case, crafting → knitting, fashion → sewing, cooking → mastering a
  bake, yoga → a pose, fitness/hiking → a strength goal, photography → a photo
  series, coding → a little game, gaming → a speedrun, film → a short film,
  reading → a doorstop classic, gardening → something to harvest, astrology →
  birth charts for the flat, comedy → an open-mic set, travel → a language,
  volunteering → organising a good cause). Each has works to pick from, four
  stages with their own session lines, a bad-session pool, three milestones,
  start/finish/abandon lines, "show" lines for when you ask, a dusty line,
  and optionally a display (where the finished work lives) and gifts.
- **Time for it.** `work_on_project` is a real drive (custom resolver,
  `isProjectDrive` branch in `evaluateDrives`; candidacy
  `projectDriveCandidate` in `DRIVE_CANDIDACY`): a resident at home with a
  project they're still into. The resolver picks the room from the kind (own
  bedroom for `'bedroom'`), sets the activity, applies the drive's
  stimulation/mood effects, and moves the project on — or doesn't: a bad
  session (likelier at the hard stage, for the volatile, in a poor mood) makes
  no progress and costs heart.
- **Heart.** Engagement 0..1 fades daily (slower for the conscientious),
  faster on an idle day or in a low mood; sessions and milestones feed it.
  Below `workThreshold` the project isn't a candidate — it gathers dust (a
  Look Around line where it was left). `abandonAfterDays` in the dust and they
  give up (`project_abandoned`, filed where it was left). The determined
  (conscientiousness > 0) can pick a stalled one back up on their own. The next
  project starts after a rest (longer after quitting), weighted away from the
  kind they just quit.
- **Payoff.** Milestones are worth 2 skill in the project's interest, a finish
  the kind's `skillGain` (6–12), quitting 1 — the first writer of
  `interests[].skill`, which the shared-activity credit
  (`sharedActivitySkillMultiplier`) and the skilled-hobbyist notice
  (`hobby_skill`) already read. Finished work goes on display
  (`world.projects.displayed`, Look Around: the painting on the living-room
  wall, the photo series along hallway A, the zine on the coffee table, the
  charts on the fridge, the harvest on the balcony) while its maker lives
  there. A finish you weren't in the room for texts you if they're fond of you
  (`shareAffection`), in their own `textingStyle`.
- **Secret presents.** A project that starts while the maker's affection for
  you is at least `giftAffection` may (on `giftChance`) secretly be for you —
  knitting, painting, sewing and photos have gifts. Its sessions, card label
  and Encourage line never name it ("won't say what"); `[Project]` tells the
  model it's a secret and to deflect. Finished: handed to you in person if
  you're in the room, else left on your bed (`project_gift` in
  `bedroom_player`, found through `surfaceRoomEvidence`), and it stays in your
  room (Look Around: "The scarf Mira made you is folded on your chair.").
- **Ask About Project.** A Here-tab chip whenever someone in the room has a
  project you haven't asked about today (whoever is at it right now first).
  The line is the stage's show line (or a wince, if it's been gathering dust;
  or a deflection, if it's your present). Effect: engagement
  +`encourage.engagement`, affection +`encourage.affection`, a warm memory
  with you as participant, once a day per roommate; a small mood lift for you.
  This is the gameplay lever: a dusty project you nudge can be saved.
- **What you see.** Roommate card and Look Around: "painting (‘Grandmother,
  Remembered’)" when someone is doing their project's activity. Session events
  surface in the room (`surfaceRoomEvidence`) and, because `project_session`
  is listed in `EVENT_IMPORTANCE` (as `'ambient'` — lowest memory weight),
  on the Meanwhile ticker from nearby rooms. Milestones, starts, finishes and
  quits are `'social'`/`'significant'`, so Chatter can post them (every event
  line is written to read in the first person).
- **Talk.** `[Project]` in `buildNpcBlockV2`: what, how many days in, where
  it's at, how they feel (fired up / stuck / sheepish about the dust), whether
  you asked, and the last two finished or quit projects ("a sore point").

## This one changes behaviour — measured

Unlike What's On (which only decided WHAT was on), a project needs time, so
`work_on_project` competes for free ticks. Eight weeks, five houses, twenty
residents, the real `resolveBatch` (scratch `measure-projects.js`), final
tuning vs the drive deleted:

| | on | off | |
|---|---|---|---|
| project sessions / resident-day | 0.58 | — | |
| finished / abandoned | 24 / 12 | — | a third give up; low-conscientiousness roommates are the ones who do |
| mean days to finish | 26.5 | — | |
| 'watching TV' ticks | 3,845 | 4,087 | −6% |
| 'scrolling social media' | 2,468 | 2,636 | −6% |
| 'reading' (incl. doorstop projects) | 4,694 | 4,728 | −1% |
| 'napping' | 1,053 | 1,183 | −11% |
| 'swimming laps' / sauna | 1,040 / 325 | 1,163 / 364 | −11% |
| seek_company events | 218 | 207 | +5% |
| seek_stimulation events | 44 | 44 | = |

**The first tuning collided with the swim fix.** At `baseAppeal` 0.45 ×
leisure 1.1 the drive beat a neutral swimmer's 0.444 in the daytime and took
the gap ticks swim lives on: `verify-w6`'s deviant cast stopped producing a
nude swim tick at all, and because conscientious people keep their projects
going it pulled their `seek_company` down enough to fail `verify-c3`'s warmth
cross-control (11% against a 9.5% bar; 3% without the drive). `verify-p4`'s
single-seed comfort-peak comparison also tied (64 vs 64). Four settings were
swept (scratch `patch-run.js`, a Module._load hook patching the drive before
each harness): 0.40 flat-day/evening-lean passed w6 and c3 at 8% vs 9%
(too close); **0.43, flat by day, evening ×1.05, wind_down ×1.1 passed both
with room (c3 control 7% vs 10.5%) and p4's peak check**; evenings-only
failed c3 (10%). Sessions per resident-day were 0.58–0.61 across all four —
the project fills idle gaps either way; the setting only decides what it
doesn't outbid. `verify-c1` needed an arrangement where someone has a project
(the drive's real door, the same way earlier sessions added arrangements for
other gated drives): reaches 0.473.

## A harness bug found on the way — verify-i2 was numb to what it guards

`verify-i2`'s "the two runs are the same simulation" compared the NET event
totals of its fields-on and fields-stripped arms (bound 0.5%). With the drive
it read 0.59% and failed. Broken down (scratch `i2-drift.js`), the per-house
differences with the drive OFF were `[0,0,+7,0,0,−1,0,−1,−2,0,−7,0]` — 18
events of real divergence netting to 4 (0.12%) — and on two other seed sets
the drive-off arms scored 0.64% and 0.67%: the check passed on its own seeds
by luck of cancellation. Worse, the same twelve houses run as two genuinely
DECOUPLED simulations (arm b reseeded) netted 0.06% and 0.18% and would have
passed easily. Now measured house by house (Σ|a−b| / events): coupled arms
0.54–0.67% without the drive, 0.59–0.85% with it (project progress is
path-dependent, so a displaced session shifts the next milestone), decoupled
3.3–3.5%; bound 1.5%. Test-only change; the comment in verify-i2 carries the
numbers.

## Design calls made without the user — ANSWERED 2026-09-24: all nine kept

The user's answers: 1 keep, 2 keep, 3 "I would say 3 - 4 weeks, but your
explanation sounds reasonable" (the measured mean is 26.5 days, about 3.7
weeks, so nothing changed), 4 keep, 5 "love this idea. keep." (and F2 made the
present a real item — see round 3), 6 asked what "finish texts" meant
(explained as the text a fond roommate sends when you missed the finish;
kept unless they say otherwise), 7 keep, 8 keep, 9 keep.

1. **One project at a time per roommate**, always drawn from their own
   interests; ~80% are partway into one on the first day they're seen.
2. **It's a real drive**, taking time from TV/phone/naps/the pool (above).
   What's On was careful never to change WHETHER; this deliberately does.
3. **Projects take ~4 weeks and a third are abandoned** — personality
   (conscientiousness) decides most of who finishes. Numbers in
   `PROJECT_TUNING`.
4. **Skill grows for real** (+2 a milestone, +6–12 a finish, +1 for quitting).
5. **Secret presents**: affection ≥ 0.35, half of eligible starts, only for
   knitting/painting/sewing/photos. The present is a room line in your
   bedroom, **not an inventory item** (see F2).
6. **The finish text** goes only to a player the maker is at least a little
   fond of (affection ≥ 0.1), and never for a present (you find it).
7. **Ask About Project** costs 10 minutes, works once a day per roommate,
   +0.25 engagement / +0.02 affection, and can save a dusty project.
8. **Finished work leaves with its maker** (display lines need the maker to
   still be a resident); a present stays.
9. **The random OFFSCREEN `hobby` row was left alone** (see F1).

## Follow-ups

### Built (round 2, 2026-09-24)

- **F1 — The off-screen hobby line tells their real hobby.** `OFFSCREEN_EVENTS`'
  `hobby` row drew `{hobby}` from a fixed list. `projectNameTheHobby` (called
  from `resolveProjectsTick`, which now takes the tick's `newEvents`) rewrites
  the line, text only: their project's `thing` ("Mira spent some time on the
  painting."), a secret present unnamed, or between projects a phrase for a
  kind their own interests lead to (`PROJECT_HOBBY_PHRASES`). Measured: 168 of
  168 hobby events in a six-week, four-house run now name something real.
- **F4 — Roommates keep each other going.** `projectHearAboutIt`: the first
  `npc_chat` of the day between someone and a housemate with a project lifts
  it by `PROJECT_TUNING.chatEncourage` (0.06, a quarter of yours), never a
  secret present. About half of those chats (hash) with no gossip topic are
  retold as project talk from `PROJECT_CHAT_LINES` ("Jonah wanted a progress
  report on the zine, and Oskar gave a long one."). First draft rewrote every
  one and 63 of 64 chats in a run became project talk; now 34 of 64.
  **Measured effect:** over eight weeks and twenty residents, abandonment went
  from 12 of 36 to 9 of 36 (33% → 25%), sessions 0.58 → 0.62 a resident-day;
  verify-c1/c2/c3/w6/p4/i2 unchanged.
- **F5 — The fridge.** Two house-note motives in `housenotes.js`'s list, from
  `projectNoteMotives`: `project_done` (a non-present finish in the last
  `recentEventDays`: "breaking news: local roommate did one strict pull-up") and
  `project_baking` (a baking session in this kitchen today: "the oven is spoken
  for"). A new `proud` chance (warmth + assertiveness, never passive
  aggression), a neutral fridge line ("…about some good news."), and a new
  reply pool, `cheer`, for news ("legend behaviour"). Nothing is claimed that
  isn't stored: no loaf on the counter, no flour.
- **F8 — Session line variety.** A third session line for every stage of every
  kind (84 lines).
- **F9 — Sheepish in person.** Look Around, with a dusty project's owner awake
  in the room: "'I'm getting back to that,' Dahlia says, to nobody in
  particular." (`PROJECT_SHEEPISH_LINES`).
- **Also fixed on the way:** the finish texts read "Finished {thing}! Come and
  see?", which came out as "Finished one strict pull-up!" and "Finished
  Portuguese!". Each kind now has a pronoun-free first-person `done` phrase
  ("did one strict pull-up", "had a whole conversation in Portuguese"), shared
  by the texts and the fridge note; and the in-sentence uses (hobby line, chat
  line, the Ask About memory) use the kind's short `thing` ("the zine", "the
  training", "the Korean lessons") with "how things were going with …" so the
  verb agrees with plurals. Found by printing a real run and reading it.

### Built (round 3, 2026-09-24): the user's yeses

The user's words: F2 "definitely keep. We need to use the inventory more in
general."; F3 "Absolutely. I love things that produce drama. The AI does not
do that well enough on its own."; F6 "Absolutely. Even though it extends
beyond music, I lovingly call these 'Jam Sessions'. The apartment should be a
highly interactive space in every sense of the word."; F7 "EVERYTHING that has
a planned date/time should end up on the calendar", plus the Agenda merge (its
own plan).

- **F2 — Presents are real items.** Seven unpriced `giftOnly` defs in
  `defs.world.js`: `handknit_scarf` / `_hat` / `_socks` and `handmade_shirt`
  are real clothing (CLOTHING_DEFS, stats, wearable from the wardrobe);
  `gift_portrait` / `gift_painting` / `gift_photo_print` are keepsakes
  (category `decor` with sortGroup `gift`: they sit in the bag's Gifts
  section, but ui.js's Give picker, which hands over the first gift-category
  item, can never regift them). `projectFinish` spawns the kind's `item`
  through the trusted SPAWN_ITEM with `meta.title` "from Mira", so the bag
  reads "Hand-Knit Scarf: from Mira". A round-1 save's on-the-bed record still
  reads in Look Around. verify-w4's "every clothing item is on Nile" now
  exempts exactly `giftOnly` (and asserts a giftOnly def is NOT on Nile).
- **F3 — Practice the flat can hear, with drama.** `projectPracticeNoise`
  (the tick pass, on final locations, its own seededRng stream): anyone at
  guitar or the decks emits a new `practice` sound transient
  (`SIGNAL_DEFS.practice`; `PROJECT_TUNING.noise`: guitar 0.8, decks 0.95,
  rough early stages loudest). Anyone awake who perceives it (the one sound
  model: hops, doors, headphones, attention) may react once a day:
  **complain** (through the wall or to their face, and an assertive musician
  answers by playing louder: "…got it turned UP in reply"), which adds tension
  both ways in the cast web, costs the musician some heart, gives them a
  memory, and feeds the fridge's noise motive; or, from stage 2 on, when they
  like them, **stop to listen** (affection both ways, heart). Annoyance comes
  from temperament, feelings toward them, the rough early stages and late
  night. Lines across the open-plan core never bang on a wall that isn't
  there (`projOpenPlan`). **Your verbs:** Bang on the Wall (you can hear it
  from another room: "You bang on Mira's door." / "You yell 'Keep it DOWN!'
  across the flat." / "You bang on the wall.") and Ask for Quiet (same room).
  Either silences them for the rest of the day at a price: engagement −0.1,
  tension +0.03, affection −0.01, and a memory.
  **Measured** (6 houses × 3 weeks, a guitarist and a DJ in each): the first
  tuning (0.55/0.6, 12% a tick) gave 7 reactions in 18 house-weeks. Sound
  carries about one room here, and bedrooms never hear each other. The
  shipped tuning gives ~35: about one a week per musician, two complaints to
  every listen.
- **F6 — Jam Sessions.** `self.jam_session`: a roommate at their project in
  the room with you, once a day each, not if tension − affection ≥ 0.3, never
  a secret present. 45 minutes. A per-kind scene (`PROJECT_JAM`, 21 kinds ×
  early/late, no pronouns for them), +8 XP in the skill it uses (music, art,
  writing, cooking, fitness, focus, tech or social), mood for you; for them
  engagement +0.15, a step of progress that never completes a stage (the
  milestone stays theirs), affection +0.03, comfort +0.02, and a warm memory.
- **F7 — Dated shows on the calendar.** `event` on three kinds (standup →
  the open mic, short_film → a screening in the living room, good_cause → its
  big day). Reaching the final stage books a date `PROJECT_TUNING.event.leadDays`
  (5) out. Ready early, they keep rehearsing, and the finish waits for the
  date; on the day, at the kind's `at` minute, the show happens ready or not
  (`projectShowsTonight`, which also delivers the finish text). The date shows
  on a new **Events** tab in the Calendar app (read-only), on the Year grid
  (a mark and a title line), and in `[Project]` ("The big day (the open mic) is
  in 3 days — it's on the player's calendar."). Giving up takes it off the
  calendar.
- **Also:** the four project verbs now have their own Here bucket,
  **Project ▸**. Found live: sharing the fridge notes' `'here'` group had
  filed Jam Session and Ask About Project under **Notes ▸** (a round-1 bug).
  A repeated-phrase scan of every filled line found "did a tight five for an
  open mic at the open mic" and two doubled birth-chart lines; the work and
  lines are fixed (the scan's other ~90 hits are deliberate comic repetition).
  verify-w4's "clothing sorts under its own group" appended its note to the
  result, so it could never fail; it is a real check now.

### Waiting on the user (questions, not to-dos)

- **The Agenda merge** — seven questions in `wip/agenda-app-plan.md`.
- **R3-1 — How much drama?** About one reaction a week per musician, two
  complaints to every listen, harsher after 22:00, bedrooms can't hear each
  other (the flat's sound model: one hop plus a door). More, less, or about
  right?
- **R3-2 — The price of quiet.** Bang on the Wall / Ask for Quiet silences
  them for the whole day and costs them heart (−0.1) and you a little warmth.
  Too harsh, too soft?
- **R3-3 — Jam Session payoff.** 45 minutes, +8 skill XP, a step of their
  progress (never a milestone), warmth +0.03. Right size?
- **R3-4 — "Out" shows don't leave the flat.** The open mic and the good
  cause's day are "out", but the roommate isn't actually away that evening:
  the finish is reported at 23:00 (18:00 for the good cause), wherever they
  are. Making them really go out means booking an away window through the
  commitment system, which changes where they are, so it's a behaviour change.
  Wanted?
- **R3-5 — Could you attend?** The screening is at home, so you can be
  there. Should you also be able to go to the open mic (a Go option that
  evening), or is a text afterwards enough?
- **R3-6 — Keepsakes can't be regifted.** A portrait someone painted of you
  sits in the Gifts section, but the Give picker never hands it over. Right
  call?

### Standing caution

- **F10 — The new drive lives near the swim fix's edge.** verify-w6's
  "deviant cast swims nude at least once" and verify-c3's cross-control are
  both sensitive to any new free-time drive. Anyone retuning
  `work_on_project` (or adding another pastime-level drive, or changing
  `chatEncourage`) must re-run c1/c2/c3/w6/p4, not just verify-projects.

## Verification

- `node src/src/dev/verify/verify-projects.js` — 107/0 after round 2 (85 in round 1; +22: the hobby line, the sheepish beat, both fridge motives through the real writer and the cheer replies, the chat lift and lines, three session lines a stage, and the `done` phrases): registration (21
  kinds well formed, every interest covered, drive/candidacy/save key/effect/
  verb/event bands/peek rows/script lists), line hygiene (one `{name}` per
  event line, no they/their outside quotes, no " while ", every placeholder
  fills for every work), seeding (deterministic, fits interests, residents
  only), candidacy, sessions (room, activity, milestone, finish, skill, rest),
  bad sessions, the daily fade/dust/abandon/bounce-back/next start, secret
  presents (both deliveries), finish texts by texting style, Ask About Project
  through `checkRequirements`/prepare/buildEffects/the real DSL, the card,
  Look Around and `[Project]`, three weeks of the real `resolveBatch`
  (sessions happen, state survives the rebuild, skill moves, deterministic),
  the before/after hobby-tick count, and the wiring order in sim.js.
- `verify-c1.js` 75/0 (+1 arrangement), `verify-c2.js` 68/9 (+1 pass, the
  same 9 known failures), `verify-i2.js` 57/0 (check rewritten as above).
  Full sweep: see the session summary / memory for the final counts.
- Live on dev-harness.html (throwaway Sandbox, three roommates): projects
  seeded on the first tick (a painting, a pull-up goal, a short film);
  milestones fired and interest skill moved over a day and a half; walking into
  the study surfaced "Xiao stepped back from ‘Grandmother, Remembered’ every
  few minutes, squinting, then went back in."; the card read "painting
  (‘Grandmother, Remembered’)"; Look Around named it; clicking Ask About
  Project gave the stage's show line and moved engagement 0.67 → 0.92 and
  affection 0 → 0.02 with the memory kept; a timer save record contained
  `world.projects`. No script errors (image backend refusals only).
- Round 2 full sweep: 6506 passed / 12 failed / 0 errored — exactly
  verify-projects 85 → 107; verify-house-notes 90/0 unchanged; the same 12
  known failures. Live on dev-harness.html (a fresh throwaway Sandbox — the
  pane's storage had been reset): Look Around with Dahlia beside her dusty
  film gave the storyboard line plus "'I'm getting back to that,' Dahlia
  says, to nobody in particular."; a project_done note written through the
  real writer read, via the real Notes ▸ Read Note chip, "A small
  announcement: I did one strict pull-up. Thank you all for your patience."
- **Round 3:** `verify-projects.js` 160/0 (+53). Sections 18–21: practice
  sound, reach, complaints, escalation, listening, late night, once a day,
  fridge fuel, a two-week real-batch count, and determinism; Bang on the Wall
  and Ask for Quiet through checkRequirements, prepare and the real DSL (door,
  open plan, wall, same room, out of earshot); Jam Sessions (payoff, once a
  day, the stage cap, refusals, every kind's scenes); the booked show (booking,
  the hold, the Events tab, the Year grid, the prompt, the night itself and its
  text, the living-room screening, seeding, abandoning). The first sweep was
  6555/15/0; its three new failures were verify-w4's "every clothing item is
  sold" (now exempts `giftOnly`) and verify-i2's stripped arm (gotcha #21: the
  new in-tick memory writer; the strip now wraps `addMemoryEpisode`). **Final
  sweep 6559 passed / 12 failed / 0 errored**: exactly the known 12 (c2 ×9,
  i4 ×2, p4 ×1), with verify-c1 75, c3 53, w6 39, i2 57, w4 29, s3 38,
  house-notes 90, occasions 60 and tv 89 all green.
- Live on dev-harness.html (a throwaway Sandbox with two roommates): with
  Valentin at the guitar in bedroom 1 and you in the hallway, the room text
  read "Sounds drift through Bedroom 1 door.", the Here row offered Bang on
  the Wall, and clicking it gave "You bang on Valentin's door. The guitar
  stops mid-bar…", setting hushedDay, engagement 0.8 → 0.7, tension +0.03,
  affection −0.01, and the memory; the chip then went away. In the living
  room, Project ▸ Jam Session gave the guitar's early scene, music XP 0 → 8,
  their session count +1, engagement +0.15, affection +0.03, comfort +0.02,
  and the warm memory. A finished secret scarf appeared in the real bag as
  "Hand-Knit Scarf: from Precious" under Clothing, with its stats. The
  phone's Calendar showed "🎤 Valentin: open mic — Tuesday, 3rd of Spring,
  Year 1 (evening, out)" on Events and a 🎤 on the 3rd in Year.
  `advanceAndResolveMinutes` to day 3 at 23:15 ran the real batch: the show
  happened at 23:00, the lowercase texter sent "Ok so i did the open mic, and
  people actually laughed…", and the date left the calendar.
