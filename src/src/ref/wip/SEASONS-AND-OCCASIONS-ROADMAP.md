# Seasons & Occasions — roadmap

Status: **in progress.** Design session 2026-09-22 (with the user, over
AskUserQuestion; the user's answers are recorded as R-decisions below).
Built: Birthdays P1; Occasions P1 (the calendar), P2 (the holiday work
model), P3 (decorations); Seasons P1 (weather, temperature curve, daylight),
P2 (ambience: fronts at a time of day, the weather in a room, the sky
watch), P3 (weather shapes where people go and what the balcony is like), P4
(seasonal produce prices and cravings), P5 (dressed for the weather going out;
seasonal mood beats), P6 (window views in the scene art), P7 (close-out) —
Seasons & Weather is code-complete.
Everything else is planned. Last updated 2026-09-23.

This is an umbrella, not a phased plan: it holds the cross-cutting decisions
(R1–R12) that every plan below must honor, and the build order. Each plan
carries its own phases, Handoff and Status table.

## The plans

| Plan | What it is | Status |
|---|---|---|
| [`occasions-and-holidays-plan.md`](occasions-and-holidays-plan.md) | The holiday calendar (a fixed, non-religious roster of 20 occasions across the four seasons), the per-NPC **holiday work model** (who gets the day off, who takes the premium shift), festivity, and the traditions and rituals as real verbs, events and NPC behavior | **P1–P3 done (2026-09-22/23)**; P4 next |
| [`seasons-and-weather-plan.md`](seasons-and-weather-plan.md) | Making the seasons *felt*: daily weather, a smooth yearly temperature curve, daylight, seasonal ambience in scenes and prompts, seasonal food/activities/wardrobe, seasonal window views | **Code-complete, all 7 phases (2026-09-23)**; one live check outstanding (window views need the real image backend) |
| [`birthdays-and-occasions-plan.md`](birthdays-and-occasions-plan.md) | Birthdays: Phase 1 (roommates) done; the player's own birthday picked from a full-year calendar in creation (R7), birthday importance + gossip (R8), the house celebrating, parties | Phase 1 done |
| [`aging-plan.md`](aging-plan.md) | Everyone ages: the number moves on the birthday, appearance drifts slowly and one step at a time, portraits refresh only when a visible descriptor actually changes (R9) | Planned |
| [`game-room-overhaul-plan.md`](game-room-overhaul-plan.md) | Not a date system, designed in the same session: the Game Room comes to life — darts, pool, a card table (poker/blackjack ported from AcesAndLace), a multi-game arcade cabinet of original games, tabletop games; stakes and rivalries (R12) | Planned |

## Build order (the user delegated it — "Your choice!")

1. **Occasions P1** (the calendar spine) → **P2** (the holiday work model).
   Holidays are the headline ask, and every other plan reads the calendar.
2. **Seasons & weather P1–P3** — the "FEEL the seasons" layer the user named
   first; cheap, broad, and it makes every holiday land better.
3. **Occasions traditions** (P3+) — interleaved with seasons as each needs it
   (Midsummer fireworks want a weather check; Halloween wants dark evenings).
4. **Birthdays P2–P3** (player birthday picker, importance/gossip) and
   **Aging** — they share the birthday hook.
5. **Game Room** — the largest single plan; its P1 (the match spine) can start
   any time after nothing else is mid-flight, because it reads none of the
   above (its holiday tie-ins are its last phase).

## Cross-cutting decisions

- **R1 — No religion, anywhere.** (User, 2026-09-22.) Every holiday is a
  non-religious cultural festival with familiar traditions. Holidays that
  exist in the real world because of a faith appear only as their
  non-religious analog, stripped of the faith entirely — Easter becomes
  **Spring Festival** (egg hunt, flower-gifting, brunch), a winter gift-giving
  holiday becomes **Midwinter**, a festival of lights becomes **Lantern
  Nights**. No holiday is "for" a group of believers. **Terminology note: say
  "non-religious", never "secular"** — the word caused a real
  misunderstanding in the design session.
- **R2 — Observance is personal, never by identity.** Everyone may celebrate
  everything; *how much* a character cares is their **festivity** (a derived
  0..1 trait from temperament, traits and values — never from heritage or
  anything resembling faith). A festive roommate decorates early and invites
  you into traditions; a low-festivity one shrugs, or grumbles at the carols.
- **R3 — Familiar names where the holiday is already broadly non-religious**
  (Valentine's Day, Halloween, Thanksgiving, New Year's Eve/Day); descriptive
  analog names otherwise. (User chose "Familiar + analogs".)
- **R4 — Days off are a per-person decision, not a switch.** (User, verbatim
  intent: "Would this job naturally be off on this holiday? Would this job
  offer overtime for this holiday? Depending on financial situation, and
  personality-based work-ethic, would this NPC voluntarily CHOOSE to work…?
  How 'Festive' is this NPC?" — and the travel-respiratory-therapist example:
  someone who *loves* holiday shifts for the premium pay.) Modelled in
  `occasions-and-holidays-plan.md` D10–D16.
- **R5 — Derived, not stored.** Every new per-character trait (birthday,
  festivity, birthday importance, aging profile, holiday work decision) is a
  pure function of `bible.genSeed` + existing bible fields, with an explicit
  override field for authored characters. Old saves get everything for free.
  (The `taste.js` precedent, and birthdays' D1.)
- **R6 — Deterministic.** Same save, same day → same weather, same holiday
  roster, same who-works-Midwinter. Seeded by (identity, occasion, year) —
  never a live roll that a reload could change.
- **R7 — The player picks their birthday** in character creation, from a
  calendar view of the entire year. (User, Q1.) One year-grid component
  serves both that picker and the Calendar app's Year view.
- **R8 — Birthdays matter more to some people.** (User, Q4.) A derived
  *birthday importance*; people who care a lot are more hurt, and are likely
  to tell others when someone important to them forgets. "It doesn't need to
  be a HUGE deal."
- **R9 — Aging is gradual.** (User, Q2.) "A slow process, not an instant,
  drastic change to any one descriptor field… a well-paced gradual change."
- **R10 — The player never leaves the apartment.** Every tradition happens at
  home. The balcony is the outdoors (fireworks, moon-viewing, Color Day); the
  front door is the world arriving (trick-or-treaters, carolers, deliveries).
- **R11 — Every calendar reader goes through one module.** `occasions.js`
  owns "what is today" (occasions, eves, spans, countdowns); weather and
  daylight live in `seasons.js`. No system computes a holiday date itself.
- **R12 — The Game Room reuses AcesAndLace's engine math, not its code
  shape.** The hand evaluator, hand-strength scale, blackjack math and the
  AI's play-style parameters port over (to seeded RNG); the single-opponent
  global-state game loop and its DOM do not.

## Design invariants (shared)

1. **No faith, no faith-coded observance** (R1/R2). A review of any new
   holiday content checks this first.
2. **A day's calendar facts are computed, never stored.** Only the player's
   *responses* (what they knew, gave, said) are stored.
3. **Nothing punishes the player for a date they couldn't know about.**
   (Birthdays invariant 1, generalized: holidays are always on the Calendar;
   a birthday stings only if known.)
