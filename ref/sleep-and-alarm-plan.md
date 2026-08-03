# Sleep, alarms, energy and burnout — design plan

Status: **built.** Last updated 2026-08-01.

---

## Built: energy-scaled sleep

A night is 6–8 hours, scaled by how drained the player was when they went
to bed. Exhausted buys the long night; near-rested gets the short one.

| Knob | Value | Where |
|---|---|---|
| Shortest night (energy at max) | 6h | `SLEEP.minHours` |
| Longest night (energy at zero) | 8h | `SLEEP.maxHours` |
| Energy per hour slept | 12.5 | `SLEEP.restorePerHour` |
| Design anchors | bed 22:00, wake 06:00 | `SLEEP.naturalBedtimeHour` / `naturalWakeHour` |
| Collapse recovery rate | 70% of normal | `NEED_CONSEQUENCES.energy.restEfficiency` |

`resolveSleepHours(energyAtBedtime)` (SIM) is the curve; `doSleep` (UI)
applies it. `maxHours × restorePerHour = 100` exactly, so a full night from
empty lands precisely at full and **anything shorter does not**. That
proportionality is the whole point — it is what will make the alarm system
mean something.

Passing out from exhaustion recovers at `restEfficiency`, so collapsing is
never a shortcut past going to bed properly. (It briefly was, and the need
system spent that time arguing against itself.)

### Known wrinkle: wake time drifts early when rested

Because duration shrinks as energy rises, a player who sleeps at 22:00 on
full energy wakes at 04:00. In practice the realistic band (energy 10–50 at
bedtime) wakes between 05:15 and 06:00, which matches the intended rhythm —
and a player at full energy has little reason to sleep at all.

**The alarm system is what will properly anchor wake time.** Resist adding
a separate wake-time floor before then; two systems both trying to own when
the player gets up will fight.

---

## Not built: the alarm system

**Intent:** the player sets an alarm for no later than a chosen time. It
caps the night — it cannot extend it.

- If the natural night would end before the alarm, nothing happens. The
  alarm is a ceiling, not a schedule.
- If the natural night would run past the alarm, the player is woken early
  and recovers only `hoursActuallySlept × restorePerHour`.
- The bad case this is designed to create: **very drained + went to bed
  late**. You needed the full 8 hours, the alarm gave you 5, you start the
  day at 62 energy and it compounds. That is a self-inflicted wound the
  player can see coming and choose anyway, which is the good kind.
- Wants an interaction surface — plausibly a bedside clock object in
  `bedroom_player`, or a phone/computer app.
- Should interact with work: an early alarm to catch more work blocks is
  exactly the trade the burnout system needs to punish.

## Not built: burnout

Working near the energy ceiling day after day must have **steep and severe**
consequences. Grinding has to be possible but genuinely costly — otherwise
the social solution to rent is optional flavour rather than the answer.

Direction (not yet specified):
- Track consecutive high-workload days, not just instantaneous energy.
- Consequences should hit *mood* hard, and mood already feeds back into
  work pay via `WORK_TUNING`'s focus multiplier — so burnout should make
  grinding progressively less profitable, not just unpleasant. The
  death-spiral is the feature.
- Relationship neglect should be part of it: a player who works every
  waking hour isn't spending time with roommates, and roommate
  relationships gate the rent relief they need. The systems should close
  that loop on their own rather than needing a bespoke penalty.
- Recovery should require real downtime, not a single good night.

## Not built: energy as a levelled stat

Starting energy should be **lower than the current 100**, and grow over the
course of the game.

- `NEEDS.energy.max` is currently a flat 100 and is read in several places
  as the cap — it would need to become a per-player value.
- This is the main early-game difficulty lever: a lower ceiling means fewer
  work blocks per day, which makes early rent harder and the pressure to
  recruit roommates sharper.
- Open question: what raises it? Sleep consistency, exercise (`self.workout`
  already exists and awards a `fitness` skill nothing reads), story beats,
  or some combination.

---

## Design invariants

1. **Sleep must dominate collapse on every axis.** Time, energy, mood.
2. **Energy recovered is proportional to hours actually slept.** Never a
   flat "you slept, have 100".
3. **The alarm can only shorten a night, never lengthen one.**
4. **Overwork must be possible and must hurt.** If a build makes grinding
   sustainable, the burnout numbers are wrong.
