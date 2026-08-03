# Apartment upgrades and disrepair

Status: **built.** Last updated 2026-08-01.

Companions: `ref/economy-and-rent-plan.md` (where the money comes from),
`ref/game-opening-plan.md` (why the place is a wreck),
`ref/apartment-expansion-plan.md` (the 17-room layout being repaired).

---

## The thesis

**The apartment starts bare bones and in disrepair.** Rooms are rooms in
name only until the player fixes them. Restoring the place is the game's
primary money sink — and unlike investing, it *pays back*, because better
facilities let the player command more rent from roommates.

This solves three problems at once:

1. **Late-game surplus has somewhere to go.** Once a player is clearing
   $2k+/mo, upgrades absorb it for years.
2. **The 17-room apartment earns its size.** Right now every room is
   fully-furnished from day one, so the expansion is scenery. In disrepair
   it becomes a to-do list with a visible spatial shape.
3. **It gives the opening its Stardew shape.** An inherited luxury
   penthouse you can't afford and can't use is the same premise as an
   overgrown farm, and it's a much better start than "here is a finished
   apartment, please enjoy it."

---

## Facilities

A **facility** is an installable/repairable feature of a room. Most rooms
have several. Each has a condition tier:

```
absent → broken → functional → upgraded (→ luxury)
```

A room is only what its name says once its defining facility is
`functional`. A gym with a broken treadmill and no weights is a spare room
with equipment in it.

### What a facility carries

| Field | Purpose |
|---|---|
| `room` | Which room it belongs to |
| `tiers` | Cost and effect at each condition level |
| `unlocks` | Player actions gated on it (`self.workout` needs working gym kit) |
| `enablesDrives` | NPC drives gated on it — NPCs can only use what works |
| `qualityWeight` | Contribution to apartment quality (see below) |
| `appeal` | Which NPC traits value it (see "different roommates value different things") |
| `decayPerUse` | How fast it degrades — see maintenance |

### Existing machinery this should reuse

Most of the scaffolding is already there and currently under-used:

- `OBJECT_DEFS` already has `states`, `condition: 100`, and `breakable`.
  `condition` is written and essentially never read — this is what it's for.
- `APARTMENT_LAYOUT` already places objects per room; disrepair is a
  different *starting state*, not a different structure.
- `ACTION_DEFS.requires` predicates already gate actions
  (`ACTION_REQUIREMENT_CHECKERS`). `self.workout` requiring functional
  equipment is one new checker, not a new system.
- The Nile shop app buys things; the Services app (TidyBot) is the natural
  sibling for hiring **contractors**.
- `computeObjectGriminess`/room cleanliness already derives a room-level
  score from object state — apartment quality is the same shape.

---

## Apartment quality → rent leverage

This is the payback loop, and it must not break the cap invariant.

```
apartmentQuality  = Σ(facility.qualityWeight × tierValue) / Σ(qualityWeight)   → [0, 1]

achievableShare   = minRoommateShare + (maxRoommateShare − minRoommateShare) × apartmentQuality
                  = 0.08             + (0.30 − 0.08)                          × quality
```

A wreck tops out around **8%** a head; a fully restored apartment with every
amenity working commands **30%**. The ceiling is never a flat number — it is
a property of the building, which is exactly why restoring it is an
investment.

### What that's worth

At $1,900/wk rent, by apartment state and household size:

| Roommates | Disrepair (8%) | Mid (19%) | Restored (30%) |
|---|---|---|---|
| 1 | $1,748 | $1,539 | $1,330 |
| 3 | $1,444 | $817 | $190 |
| 4 | $1,292 | $456 | **−$380** |
| 5 | $1,140 | $95 | **−$950** |
| 7 | $836 | **−$627** | **−$2,090** |

*(player owes per week; negative is profit)*

Two things fall out of this table, and both are the point:

- **Restoration is worth ~$3,000/month at three roommates** and far more at
  scale. That's the return that justifies $50k renovations.
- **A full house in a restored apartment pays for itself.** Break-even
  lands at four roommates; seven clears about **$9,000/month** in profit.

### The apartment paying for itself is the intended end state

This is the game's thesis taken to its conclusion. If money problems are
solved by people, then *enough* people should solve them outright — and
the player who got there did it by filling every bedroom and keeping seven
relationships functional, which is its own kind of hard. The profit is
payment for that management burden, not a loophole.

The progression gates it naturally: a wreck caps roommates at 8%, so early
recruits barely help; reaching 30% requires the full restoration, which
requires the money the roommates were supposed to provide. The player has
to climb out of that with gig work.

**`playerShare` can go negative and callers must treat it as income**, not
clamp it to zero. `processRentForDay` settles any outstanding balance out
of the surplus first, then pays the remainder through `EARN_MONEY`.

### Different roommates value different things

Each facility has an `appeal` profile keyed to the existing temperament
axes and traits. A fitness-minded NPC pays a premium for a working gym; a
homebody cares about the living room and kitchen; a studious one wants the
study.

This makes **recruiting specific people** matter, and it means the upgrade
order is a strategic choice rather than a checklist. It also gives the
Classifieds applicant screen something real to reason about.

### Facilities also gate recruitment

A roommate won't move into a room that isn't habitable. **The first upgrade
goal in the game is making one bedroom liveable so the player can get their
first roommate at all** — which is exactly the right opening objective,
because it points straight at the rent problem.

Beyond habitability, apartment quality should widen the *pool* of
applicants: a wreck attracts whoever is desperate, a restored penthouse
attracts people with real income who can pay near the cap.

---

## Cost scale

Upgrades have to absorb a $2k+/mo late-game surplus over years without
feeling like a treadmill.

| Band | Cost | Example |
|---|---|---|
| Minor repair | $200–800 | Leaking faucet, broken lamp, patch drywall |
| Facility repair | $1,500–6,000 | Treadmill motor, washer, oven |
| Facility install/upgrade | $3,000–15,000 | Full gym kit, proper range, laundry pair |
| Major renovation | $20,000–50,000 | Pool restoration, kitchen gut, balcony rebuild |

A single $15k upgrade is ~7 months of saving at $2k/mo surplus — or fewer
if the player uses the market to accelerate, which is how investing earns
its place instead of being a parallel score.

Repairs should be purchasable as **materials + player labour** (cheaper,
costs blocks and skill) or **hire a contractor** (expensive, costs only
money and calendar days). That's a direct money-vs-time trade, and it gives
the unused `cleaning`/`tech` skills somewhere to matter.

---

## Maintenance and decay

Facilities degrade **with use**, not merely with time — and heavier
household use degrades faster. This is thematically identical to the
usage-metered utilities in the economy plan, and it means a full house is
genuinely more expensive to run than an empty one.

- Ties `condition` to something real for the first time.
- Keeps the sink open after restoration is "done".
- Creates the roommate-friction beat: someone who uses the gym daily is
  wearing out equipment everyone paid for.
- Must be **slow**. If maintenance turns into a chore treadmill it has
  failed. The intent is occasional, noticeable, and attributable — not
  constant.

---

## Open questions

- **Is there a swimming pool?** The disrepair example given was "the pool
  room is only a pool room in name until you repair the liner, filters and
  pump" — liner/filter/pump is a *swimming* pool, but the current layout
  has `game_room` with a billiards `pool_table`. Either the apartment gains
  a pool room (new room, new adjacency edges) or the example was
  illustrative. Needs a decision before the facility list is written.
- **Do rooms start locked/unusable, or just unfurnished?** Gating whole
  rooms behind repair gives progression more shape, but the adjacency graph
  and floor plan currently assume all 17 rooms are reachable. A middle
  option: reachable but useless, which keeps pathfinding intact and still
  makes the wreck visible on the floor plan.
- **Can roommates contribute to upgrades?** A roommate who wants a gym
  chipping in is good drama and a good relationship sink — but it competes
  with the rent-share mechanic for the same conceptual space.
- **Cosmetic vs. functional upgrades.** Should there be pure-aesthetic
  spending (furniture, decor) that only affects quality/appeal and unlocks
  nothing? Probably yes — it's the sink that never closes.
- **How does disrepair interact with the existing cleanliness system?** A
  dirty room and a broken room are different problems and should read
  differently to the player.

---

## Design invariants

1. **The per-roommate rent cap is a property of the building**, scaling
   8% → 30% with apartment quality. It is never a flat number, and no
   agreement or relationship may exceed the ceiling for the apartment's
   current state.
2. **A room is not its name until its defining facility works.**
3. **Upgrades pay back**, via rent leverage, recruitment and NPC needs —
   never a pure cosmetic drain (except where explicitly cosmetic).
4. **Maintenance is occasional, not a treadmill.** If it starts feeling
   like a chore rota, the decay rates are wrong.
5. **The first upgrade goal is one habitable bedroom**, because that points
   the player at recruiting, which is the answer to rent.
