# Vocation — the freelancer gig board

Status: **not started.** Replaces the current `JOB_DEFS` model entirely.
Last updated 2026-08-01.

Companion doc: `ref/economy-and-rent-plan.md` (where the money goes).

---

## What's wrong with the current model

`JOB_DEFS` is: pick one of three jobs, click "work block" for a flat rate,
accrue strikes against a deadline, get fired at three. It's placeholder and
it has two structural problems:

- **Income is a faucet.** Money is a linear function of clicks. There's no
  risk, no negotiation, no dry spell, and therefore no reason to save.
- **It models employment**, with a boss and a schedule, when the design
  wants a freelancer with neither.

## The direction

The player is a freelancer. Work as much or as little as they want,
whenever they want. No employer, no fixed hours, no strikes for taking a
day off. **The only pressure is the bills** — which is exactly why the cost
stack has to exist first.

Income should be **lumpy**: good weeks and dry spells. Lumpiness is what
makes savings meaningful, and it's what gives the quarterly tax bill its
teeth. A player with a steady faucet never has to plan.

---

## The gig board

A computer app (absorbing what is currently WorkHub). It lists available
work; the player accepts what they want and delivers by a deadline.

### A gig

| Field | Notes |
|---|---|
| `client` | Named. Repeat clients matter — see below. |
| `payout` | Lump sum on delivery, not per block. |
| `blocks` | Work blocks required to complete. |
| `deadline` | 2–10 days out. |
| `requiredSkills` | Gates availability, e.g. `{ tech: 4 }`. |
| `category` | Maps to which skill it exercises. |
| `rush` | Optional: shorter deadline, premium pay. |

Accepting commits the player to the blocks. Work is logged against the gig
rather than into a generic counter, so a half-finished gig is a visible
obligation.

### Reputation tiers

Reputation (0–100) gates which gigs appear. It's earned by delivering on
time and lost by missing deadlines or abandoning work.

| Tier | Rep | Pay / block | Typical gig | Board size |
|---|---|---|---|---|
| Novice | 0–20 | $18–28 | 2–4 blocks | 3–4 gigs |
| Competent | 20–40 | $32–50 | 3–8 blocks | 4–5 gigs |
| Established | 40–65 | $55–90 | 6–14 blocks | 5–6 gigs |
| Specialist | 65–85 | $95–140 | 10–20 blocks | 5–7 gigs |
| Elite | 85–100 | $130–190 | 14–30 blocks | 6–8 gigs |

Sustainable earning (4h/day × 5 days) runs from ~$46k/yr at Novice to
~$312k/yr at Elite. Grinding (6h/day × 7 days) roughly doubles it, at the
cost the burnout system will impose. The ceiling is deliberately far above
the ~$96k a beginner can grind out, so late game has somewhere to go —
before investment income is even considered.

### Dry spells

The board refreshes on a cadence, probabilistically. At low reputation it
refreshes with fewer and worse gigs, and sometimes nothing worth taking.
This is the mechanism that creates feast-and-famine, so it should not be
smoothed away: a week with no good work is the game asking whether the
player saved.

### Failure

- **Missed deadline** → reputation hit, client lost, partial or no pay.
- **Abandoned gig** → larger reputation hit.
- **No power or no internet** → cannot work at all (see the cost stack's
  cutoff consequences). Missing a deadline because the power was cut is the
  kind of compounding failure the economy should be capable of producing.

---

## Progression

Three axes, deliberately separate:

- **Reputation** — access. Which gigs exist for you at all.
- **Skills** (existing `SKILLS`/`SKILL_CURVES`) — eligibility for
  skill-gated gigs, and quality/speed within them.
- **Equipment** — a better computer from Nile as a throughput or
  eligibility gate, and simultaneously a tax deduction.

The three should reinforce: reputation opens a gig, skill lets you take it,
equipment lets you finish it faster.

---

## Open questions

- **Quality outcomes.** Should a gig delivered at the deadline with low
  relevant skill produce a worse result — less pay, less reputation, an
  unhappy client? It adds depth but also a second failure axis on top of
  deadlines.
- **Concurrent gigs.** One at a time is simpler and forces choosing. Several
  at once is more freelancer-realistic and more stressful. Leaning toward
  allowing 2–3 with the deadline pressure doing the limiting.
- **Repeat clients.** A client relationship that grows across gigs — better
  rates, direct offers that bypass the board, and a real loss when you burn
  one. Strong candidate, since it makes reputation personal rather than a
  number.
- **Retainers.** A recurring client covering part of rent in exchange for
  committed blocks was considered and set aside for now. Worth revisiting
  once dry spells prove either too punishing or too toothless — it's the
  natural dial.
- **Do NPCs have gigs too?** Their income is currently abstract. If
  roommates can lose work, their ability to pay rent becomes volatile, which
  is drama — but it also makes the player's rent unpredictable through no
  fault of their own. Probably yes, but gently.

---

## Migration from `JOB_DEFS`

- `JOB_DEFS`, `work.strikes`, `blocksPerDeadline` and the firing logic all
  go away.
- `WORK_TUNING`'s focus multiplier (energy and mood scaling output) should
  **survive** — it's the hook burnout needs, and it applies just as well to
  gig progress as to flat pay.
- `workOneBlock` already routes payment through `EARN_MONEY`; gig payout
  should use the same path.
- Reputation partly exists (`work.reputation`, `repGrowth`) and can be
  carried over rather than rebuilt.

## Design invariants

1. **Income is lumpy.** If a build produces a reliable weekly figure, the
   dry-spell mechanic is broken.
2. **No employer.** Nothing may compel the player to work on a given day.
3. **The bills are the only pressure.** Motivation to work comes from the
   cost stack, never from a boss or a strike counter.
4. **The ceiling stays far above subsistence**, so late game has room and
   investment income has something to compound on top of.
