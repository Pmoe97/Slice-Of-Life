# Agenda — Tracker + Calendar + Compass as one app

**Status: COMPLETE — all five phases built and verified 2026-09-29 (0.14.5).** The user answered the seven questions by approving the proposed defaults (B1–B7) in the master decisions list; sound and Handmade Rooms stay deferred. Written 2026-09-24 during the Side Projects
session, from the user's answer to its question 13:

> "Honestly, EVERYTHING that has a planned date/time should end up on the
> calendar. I want to combine the tracker, the compass, and the calendar into
> a single cohesive "Agenda" app because I feel like they are definitely
> overlapping in a very real sense."

Companions: `src/src/ref/wip/side-projects-audit-2026-09-24.md` (where the
question came from); the Tracker's own header in `srcfiles/tracker.js`
(BrineOS Phase 4. The header cites `src/src/ref/BrineOS-The-Phone-plan.md`,
which is no longer anywhere under `ref/`); `wip/actions-and-activities-overhaul-plan.md`
(Calendar, Phase 1 D2); `complete/aspirations-and-creative-careers-overhaul-plan.md`
(Compass, Phase 14 D46–D49); `wip/occasions-and-holidays-plan.md` (Year
grid, D3); `wip/birthdays-and-occasions-plan.md` (Birthdays tab, D10).

## The thesis

The player has three places to look for "what's coming", and none of them is
the whole picture. The Tracker knows about money and chores but only lives on
the phone. The Calendar knows about plans and occasions but not about rent.
The Compass knows where you're headed but deliberately has no dates. One app,
**Agenda**, should answer "what's on, what needs me, and where am I going"
from one derivation. Every source that has a date appears on the timeline and
the grid, and nothing is stored twice.

### What this plan is *not*

- Not a new reminder system. Every entry stays **derived** from game state,
  the way the Tracker already works (BrineOS decision D: no queue, no "seen"
  flags; only dismiss/snooze intents are stored).
- Not a change to any sim behaviour. Bills, commitments, shows and birthdays
  keep working exactly as they do; this changes where the player sees them.
- Not new content. Anything with a date that isn't tracked anywhere yet
  (Q5) is a separate, later decision.

## Evidence — what exists today (surveyed 2026-09-24)

| | Tracker | Calendar | Compass |
|---|---|---|---|
| Where | **phone only**. A shell app (`phone.js` `PHONE_TRACKER_APP_ID`), not in `APP_DEFS` | phone + computer (`APP_DEFS.calendar`) | phone + computer (`APP_DEFS.compass`) |
| Screens | Notifications, Agenda (`render.phone.js`) | Upcoming, Events (new, Side Projects), Holidays, Year, Birthdays | Directions |
| Source | `buildTrackerEntries` (tracker.js): 15 read adapters. Rent, bills, taxes, gigs, catalog, platform, quests, deliveries, renovation jobs, services, IM unread, courses, facilities, tension, commitments | `upcomingCommitments`, `projectCalendarEvents`, `holidayRows`, `knownBirthdayRows`, `yearGridModel` | `ensurePlayerAspirations`, `liveMilestonesFor`, `directionProgress` |
| Shape | `{key, kind, urgency 0–100, title, detail, dueDay, daysUntil, deepLink}` | per-screen `labelFn` rows | chips + milestone panels |
| Stored | `world.phone.dismissed/snoozed` only | nothing | `player.aspirations` (the player's chosen directions) |
| Badge | yes: `getTrackerNotifications(gs).length` | no | no — **D49: "not a task list: no urgency, no due day, no tracker line"** |

**Overlaps**
- Commitments (a booked dinner or hangout) appear twice: the Tracker's Agenda
  (`trackerCommitments`) and the Calendar's Upcoming. Both read
  `upcomingCommitments`, so one definition is shown on two surfaces.
- The Tracker's Agenda **is** an agenda already, just without occasions.

**Gaps**
- Dated things that never reach the Calendar or the Year grid: rent due,
  every bill's due day, the tax quarter end, gig deadlines, delivery ETAs,
  renovation finish days, booked services.
- Dated things that never reach the Tracker's Agenda: holidays, birthdays you
  know, roommates' shows (open mic, screening, the good cause's day).
- The Tracker doesn't exist on the computer at all.
- The Compass has no dates by design, so it's the odd one out (Q2).

## Proposed design (pending Q1–Q7)

**One derivation, `agendaEntries(gs)`** (new `agenda.js`, loaded after
tracker.js / occasions.js / birthdays.js / projects.js). It is the Tracker's
15 adapters unchanged, plus adapters for holidays, known birthdays and
roommates' shows. They all return the Tracker's entry shape, extended with
`minutes` (a time of day, when there is one) and `lane` (`money` | `home` |
`people` | `occasions` | `you`). `buildTrackerEntries` becomes a thin read of
it, so the badge, dismiss and snooze keep working byte-for-byte.

**One app, `APP_DEFS.agenda`**, on both devices. Proposed tabs:
1. **Coming up**: every entry grouped by day, today first. Urgent entries
   are highlighted, not separated (Q3). Each row deep-links as the Tracker's
   do; commitments keep their Clear.
2. **Needs you**: the notifications (urgency ≥ `TRACKER.notifyThreshold`),
   with dismiss and snooze. Only if Q3 says to keep it separate.
3. **Year**: the existing grid, reading `agendaEntries` for its marks, so
   rent and bills appear next to birthdays and holidays (Q4 decides which
   lanes).
4. **Directions**: the Compass, unchanged and calm, with no badges or dates
   (Q2).
5. Birthdays and Holidays become **filters** on Coming up, not tabs.

Saves: a navStack or `openAppId` pointing at `tracker`, `calendar` or
`compass` redirects to the matching Agenda tab. `world.phone.dismissed` and
`snoozed` keep their keys, because the entry keys don't change.

## Implementation phases (proposed)

| # | Phase | What | Verify |
|---|---|---|---|
| 1 | One derivation | `agenda.js`: `agendaEntries` = the tracker adapters + holiday, birthday and show adapters. `buildTrackerEntries` reads it. No UI change. | New `verify-agenda.js`: every tracker entry is unchanged (key, urgency, detail) against a same-code "before" (loadgame Module._load hook); the new adapters' rows match `holidayRows`, `knownBirthdayRows` and `projectCalendarEvents`. The badge count is identical. |
| 2 | The app | `APP_DEFS.agenda` (both devices) with the Coming up and Needs you tabs. The phone's Tracker tile opens it. | A real-DOM check in the browser (the suite is blind to DOM, per memory), on both the phone and the desktop. Deep links, Clear, dismiss and snooze. |
| 3 | The grid | The Year view reads `agendaEntries`, with lane marks and a legend. | `verify-occasions` still green; cells carry the new marks; the phone at 375px has no overflow. |
| 4 | Directions | The Compass moves in as a tab and keeps D49's calm (or not, per Q2). | `verify-acc-p14` still green. |
| 5 | Retire | The Tracker, Calendar and Compass tiles go (or stay as shortcuts, per Q7). Old saves redirect. | Load an old save that has each app open. |

## Status

| Phase | State |
|---|---|
| 1 | **Done** — `agenda.js`: `agendaEntries(gs)` = `buildTrackerEntries` (untouched, so the badge, the notifications, dismiss and snooze are byte for byte what they were: `verify-agenda` checks the prefix, the fields and the notify set) plus holiday, known-birthday, roommates'-show and outage-watch adapters. Each entry has a `lane`; commitments have `minutes` and a `commitmentId`. The new adapters are `notify: false` with urgency capped under `TRACKER.notifyThreshold`. **Deviation from the proposal:** `buildTrackerEntries` does NOT read `agendaEntries` (that would put the holidays into the badge); the Agenda wraps the Tracker instead. |
| 2 | **Done** — `APP_DEFS.agenda` on both devices; `render.agenda.js`: Coming up (grouped by day, Overdue / Today / Tomorrow / dates / Anytime, a lane toggle, Clear on plans) and Needs you (dismiss / snooze 1d / 3d, DND and out-of-reach still silence it). Live-checked in the browser pane on the desktop and the phone (dismiss, snooze, Clear, lanes, no overflow). |
| 3 | **Done** — the Year tab draws one coloured dot per lane under a date (bills, plans, the outage watch), the lane chips double as the legend and filter it, a tapped day lists them. Holidays, birthdays and shows keep their own emoji marks. |
| 4 | **Done** — Directions is a tab reusing the Compass's own renderer, so it stays calm: no dates, no badges (D49). `verify-acc-p14` still green. |
| 5 | **Done** — the Calendar and the Compass leave the desktop icons, the Start menu and the phone's home; the Tracker tile is gone. `agendaRetired` / `agendaRedirect` send every old link (`openApp`, `switchScreen`, `phoneOpenApp`) to the matching tab, and an old save with any of them open reopens as an Agenda window (`normalizeComputerState`, `normalizePhoneState`). The old app definitions stay in `APP_DEFS` (the redirect and the tests read them). |

## Questions for the user (answered 2026-09-29: the proposed defaults, B1–B7)

1. **One app on both devices?** The Tracker is phone-only today. Should the
   Agenda be on the computer too? (Proposed: yes.)
2. **The Compass's calm.** Its design (D49) says directions are "not a task
   list: no urgency, no due day, no tracker line." Inside the Agenda, should
   Directions stay a calm tab of its own with no badges or dates, or should
   live milestones show up on the timeline as undated goals? (Proposed: its
   own calm tab.)
3. **Notifications.** Keep a separate "Needs you" tab with dismiss and
   snooze, or show urgency as a highlight inside the one list? (Proposed:
   keep the tab. The badge needs a list to point at.)
4. **What goes on the grid.** Everything dated (rent, bills, taxes,
   deliveries, plans, birthdays, holidays, roommates' shows), or only the
   social and occasion things, with money in its own lane or left off?
   (Proposed: everything, with a lane toggle.)
5. **Dated things nothing tracks yet.** Roommates' work shifts that you know
   about, the alarm, parties, a power outage forecast (Seasons W10). Which of
   these should the Agenda add? Each is its own small piece of work, after
   Phase 5.
6. **Views.** The Year grid exists. Do you also want a week or day timeline
   view, or is Coming up plus Year enough?
7. **The old tiles.** Retire the Tracker, Calendar and Compass tiles
   entirely, or keep them as shortcuts into the matching Agenda tab?

## Design invariants (carried over)

- Derived, not stored (BrineOS D). The only player intents are dismiss and
  snooze, keyed by an entry's own identity.
- One definition of every date. The Agenda reads the same functions the sim
  does (`upcomingCommitments`, `projectCalendarEvents`, `holidayRows`, …) and
  never recomputes a due day.
- Holidays are non-religious cultural festivals (feedback memory). Never
  describe them as anything else.
