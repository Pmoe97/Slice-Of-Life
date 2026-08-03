# Economy — design plan

Status: **rent model, calendar, flat cost stack, gig board, upgrades,
usage metering, and taxes built.** Last updated 2026-08-01.

Companion doc: `ref/vocation-and-gigs-plan.md` (where income comes from).

---

## The thesis

Money problems are solved by **people**, not by grinding.

That only works if money is a *budget* rather than a *toll booth*. The
build as it stands has one obligation (rent) and one income source (a flat
per-block rate), which means it has no decisions in it — just a treadmill
and a number. Everything below exists to create tradeoffs: now vs. later,
money vs. time, money vs. relationships.

### The calibration that got us here

Real-world anchor (the designer's own household): $149k gross, ~$9,700/mo
net, $3,950/mo rent = **~41% of net income**. Tight but survivable.

The build before this plan: max grind $8,008/mo against $8,233/mo rent =
**103% of income to rent**, with nothing else to spend on. That is the gap
this plan closes — not by raising the hourly rate (which at $44/hr was
already a realistic wage) but by widening the income ceiling and giving
money somewhere else to go.

---

## Built: the rent model

The player holds the lease and owes the **whole** rent. Roommates offset
it, each by at most a capped fraction — never an even split, because an
even split means three roommates make rent a non-issue exactly when the
social sim starts working.

| Knob | Value | Where |
|---|---|---|
| Rent total | $1,900 / week ($8,233/mo) | `ECONOMY.rent.total` |
| Pay period | 7 days | `ECONOMY.payPeriodDays` |
| Cap, apartment in disrepair | 8% of total | `ECONOMY.rent.minRoommateShare` |
| Cap, fully restored | 30% of total | `ECONOMY.rent.maxRoommateShare` |
| Default contribution | 15% | `ECONOMY.rent.defaultRoommateShare` |
| Per-roommate negotiated share | `residency.rentShare` | `changeResidencyStatus` |

`computeRent(npcs, quality)` (SIM) recomputes from live residency at each
billing. `getApartmentQuality()` is currently a stub returning 1 — honest,
since the apartment presently spawns fully furnished — and becomes a real
derivation when the upgrade system lands.

**Rent is the only asymmetric cost.** Everything else below splits evenly.

### The cap is a property of the building

Nobody pays penthouse rates for a wreck:

```
achievableShare = 0.08 + (0.30 − 0.08) × apartmentQuality
```

A building in disrepair tops out near 8% a head; fully restored commands
30%. With three roommates that's a ~$3,000/month swing in the player's
burden, which is what makes restoration an investment rather than a drain.

At the top of the curve **the apartment pays for itself**: break-even lands
around four roommates, and a full house of seven clears roughly $9,000/month
in profit. `playerShare` goes negative there, and callers must treat that as
income rather than clamping it — see `ref/apartment-upgrades-plan.md`.

---

## The calendar (prerequisite)

Taxes are quarterly and utilities are seasonal, so the game needs a year.

- **360-day year, 4 quarters of 90 days, 4 seasons aligned to the quarters.**
  Chosen over 365 because quarters, seasons and billing all divide cleanly,
  and nobody will miss the five days.
- `getSeason(day)` — new, alongside the existing `getWeekday(day)`.
- Season drives HVAC load, which is the single largest swing in the whole
  cost stack.

---

## Cost stack

| Cost | Cadence | Split | Controllable |
|---|---|---|---|
| Rent | weekly | 20% cap per roommate | no |
| Electric | monthly | even | **heavily** |
| Water / sewer | monthly | even | **yes** |
| Gas / heat | monthly, seasonal | even | yes |
| Internet | monthly | even | tier choice — **gates work** |
| Phone | monthly | personal | tier choice |
| Renters insurance | monthly | personal | no |
| Groceries | continuous | per-purchase (existing) | **yes** |
| Household supplies | monthly | even | mild |
| Estimated taxes | **quarterly** | personal | via deductions |

Non-rent household costs run roughly **$2,300–3,200/mo** depending on
season and habits, so the player's even share is ~$575–800/mo on top of
their rent share.

### Failure is a cutoff, not an interest charge

This is what separates a bill from a threat. Each utility, unpaid past its
grace period, cuts off — and each cutoff reaches into a different system:

- **Power** → the computer is dead (no gig work, no income), fridge
  contents spoil, lights out, roommate tension spikes hard.
- **Internet** → freelance work is impossible; AfterHours and Stream dead.
- **Water** → no showers (hygiene spiral into the existing `filthy`
  consequences), no dishes, sink state degrades.
- **Gas** → no cooking (`self.cook` unavailable), no hot water in winter.
- **Rent** → the existing eviction ladder.

Restoring service should cost a reconnection fee, so letting something lapse
is a real setback rather than a free loan.

---

## Utilities: usage-metered

**Built (Phase 5).** Bills are a consequence of how the household lived,
itemised on the statement. `world.utilities` accumulates counters between
billings; the monthly bill is `base + Σ(counter × rate)`. This is the
design's best gift to the social sim: a roommate who takes 40-minute
showers or leaves the heat at 78° shows up in your bank account, and
confronting them is a relationship move with a number attached.

**NPC actions must meter too.** The drives already shower, do laundry, cook
and game — if only the player's actions count, the bill can't tell the
story. This is the whole point.

### What meters

`world.utilities` accumulates counters; the monthly bill is
`base + Σ(counter × rate)`.

| Meter | Driven by | Notes |
|---|---|---|
| HVAC | season + thermostat setting | **the dominant line item** |
| Water heating | shower count (player + NPC) | gas or electric |
| Showers | `self.shower`, NPC `self_care` | water |
| Laundry | `self.laundry`, NPC `do_laundry` | water + electric (dryer) |
| Dishes | `self.dishes` | water |
| Cooking | `self.cook`, NPC cooking | gas |
| Devices | computer hours, console, gym equipment | small, itemise anyway |

### Representative monthly ranges (4 residents)

| | Frugal | Typical | Heavy / peak season |
|---|---|---|---|
| Electric | $180 | $260 | $420 |
| Water / sewer | $90 | $130 | $180 |
| Gas | $60 | $140 | $300 |

Rates to start from and tune: electric ~$0.17/kWh, water ~$0.012/gal, gas
~$1.20/therm. Shower ≈ 17 gal, laundry load ≈ 20 gal.

**A deliberate honesty:** device usage is genuinely small in real life — a
computer running 6h/day is a few dollars a month. Itemise it anyway. Seeing
`Computer 212h — $8` next to `Heat — $206` is both true and quietly funny,
and it teaches the player where the money actually goes. The levers that
matter are the thermostat, showers and laundry, which is correct, and all
three are things roommates do.

---

## Quarterly estimated taxes

The highest-value mechanic in this plan. A large lumpy obligation every 90
days that punishes spending everything and *forces* saving — which is also
what makes the investment system meaningful, since idle reserve money
should be working.

- **Blended rate ~27%** (self-employment 15.3% + effective federal). One
  number, not a bracket table.
- Due at each quarter end on that quarter's gross, minus deductions.
- **Deductions make other systems matter**: tech purchased from Nile, a
  share of the internet bill, and Classes (skill training) are all
  legitimately deductible for a freelancer. Buying a better computer
  becomes a tax decision as well as a capability one.
- **Underpayment** → penalty plus interest, rolled into the next quarter.
  Compounding, so ignoring it is a spiral rather than a flat fee.
- **Optional auto-reserve**: a toggle that skims the rate off each gig
  payment into a tracked reserve the player can't accidentally spend.
  Teaches the mechanic and is what a competent freelancer actually does —
  make it opt-in so learning it the hard way is possible.

---

## Bill splitting

- **Rent**: 20% cap per roommate. The player carries the gap. Asymmetric on
  purpose.
- **Utilities and household supplies**: even split among residents, no cap.
  They're small and obviously shared, and an even split is what makes the
  usage mismatch dramatic — everyone pays a quarter of a bill that one
  person ran up.
- **Groceries**: per-purchase, as now. Who buys is already a drama axis.
- **Phone, insurance, taxes**: personal, never shared.

A roommate who can't or won't pay their utility share is a drama beat, and
should reuse the rent-agreement machinery when that exists.

---

## Target shape (sanity check)

Established freelancer, 3 roommates, working 4h/day × 5 days:

```
gross                        $8,233/mo
  less tax reserve (27%)    −$2,223
net                          $6,010

rent share (3 @ 20%)        −$3,293
utilities share (even)        −$200
groceries                     −$350
phone + insurance             −$135
                            ─────────
surplus                      $2,032/mo   → savings, investing, discretionary
```

Comfortable, not trivial, with real surplus. Roughly the designer's own
real-life position, which is the feel being targeted.

Novice grinding **solo** needs ~$9,400/mo net and earns ~$3,720. Nowhere
close — solo stays impossible, as designed.

---

## Build order

Each step is independently shippable and useful on its own.

1. **Calendar** — `getSeason`, 360-day year, quarter boundaries. Nothing
   else can be scheduled without it. **Built (Phase 1).**
2. **Flat cost stack** — all the bills at fixed amounts, with cadences,
   splitting, and the cutoff consequences. This alone transforms the feel,
   because money finally has somewhere to go. **Built (Phase 3).**
3. **Usage metering** — replace the flat utility amounts with accumulated
   counters. Purely a swap behind the same bill. **Built (Phase 5).**
4. **Taxes** — quarterly, deductions, reserve toggle. **Built (Phase 6).**
5. **Gig board** — see `ref/vocation-and-gigs-plan.md`. Last because the
   costs need to exist before variable income means anything. **Built
   (Phase 2).**

---

## Open questions

- **Grocery scale.** Item prices are real-world ($3 bread, $4 eggs), which
  makes food a rounding error against a $1,900 weekly rent. Either inflate
  them (immersion-breaking) or accept that food is a time-and-effort cost
  rather than a money cost, and let cooking-vs-takeout carry the money
  angle. Currently leaning toward the latter.
- **Does the player pick the apartment's utility tiers** (internet speed,
  thermostat) or are they household decisions roommates get a say in? The
  latter is more dramatic and more annoying — probably correct.
- **Seasonal rent?** Probably not, but heat in winter effectively makes
  winter more expensive, which gives the year a shape.
- ~~Late-game money sinks.~~ **Answered:** apartment upgrades. The place
  starts in disrepair and restoring it is the primary sink — and it pays
  back, because facilities raise how much rent roommates will carry. See
  `ref/apartment-upgrades-plan.md`. Investing becomes the accelerator for
  that project rather than a parallel score.

## Design invariants

1. **The per-roommate rent cap scales with apartment quality** (8% → 30%)
   and is never a flat number. No agreement may exceed the ceiling for the
   apartment's current state.
2. **Solo living is not sustainable at any apartment quality.** If a build
   makes it viable, the numbers are wrong.
3. **Overwork must be possible and must hurt.** See
   `ref/sleep-and-alarm-plan.md`.
4. **Every recurring cost has a cutoff consequence** that reaches into a
   system other than money.
5. **NPC behaviour must show up on the bills.** A cost the household
   generates but only the player can see is a missed drama beat.
