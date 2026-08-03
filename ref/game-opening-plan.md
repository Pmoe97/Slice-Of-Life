# The opening — acquiring the apartment

Status: **built.** Last updated 2026-08-01.

---

## The problem with the current opening

The game starts with a fully-populated four-bedroom apartment: the player
plus a generated cast, already moved in, rent already splitting. Every
system that makes the game interesting — recruiting roommates, negotiating
rent shares, the pressure of carrying a lease alone — is pre-solved before
the player touches anything.

The rent model (`ref/economy-and-rent-plan.md`) is built around solo living
being unsustainable and roommates being the relief valve. That curve only
means something if the player *starts* alone and *earns* their way out.

## Direction

A Stardew Valley-like intro: the player comes into "owning" the apartment
rather than already living in it with a full household.

- **Inheritance framing.** Something hands the player a place they can't
  really afford — that's the hook, and it explains the starter money that
  softens the first weeks without making the player feel bought-in.
- **The apartment is a wreck.** It starts bare bones and in disrepair;
  most rooms are rooms in name only until repaired. This is what makes the
  inheritance premise work — you've been handed something impressive and
  unusable, which is the same shape as an overgrown farm. See
  `ref/apartment-upgrades-plan.md`.
- **Start alone.** Empty bedrooms are the visible, spatial statement of the
  problem. The Mirrored H's four bedrooms become a scoreboard.
- **The first objective writes itself:** make one bedroom habitable so
  somebody will move in. That points the player straight at recruiting,
  which is the answer to rent.
- **Ramp, don't cliff.** Starter money should cover roughly the first
  couple of weeks or first month. After that, rent is a consistent threat,
  permanently.
- **Starting energy is lower** than the eventual ceiling (see
  `ref/sleep-and-alarm-plan.md`), so the early game is genuinely tight on
  both money and hours.

## What this touches

- `ECONOMY.startingMoney` — currently $3,500, a placeholder. Should be
  derived from "≈N weeks of solo rent" once the intro exists.
- Cast generation currently produces a full household at new-game. It would
  need to produce **prospective** roommates the player recruits over time
  instead of **resident** ones. The `residency.status` enum already has
  `prospective`, and the Classifieds computer app already models applicants
  — that is most of the machinery.
- `player.rentDueDay` / first billing — needs a grace period so the opening
  isn't a rent bill on day one.
- The tutorial/onboarding surface, which doesn't exist at all yet.

## Open questions

- How much of the apartment is *usable* at the start? Disrepair answers
  most of this (rooms exist but don't work), but whether some are outright
  locked is still open — the adjacency graph and floor plan assume all 17
  rooms are reachable. Tracked in `ref/apartment-upgrades-plan.md`.
- Is there a story reason the apartment is this nice, or is "you inherited
  something absurd" enough?
- Does the player choose their own bedroom?
- Where do prospective roommates come from early, before Classifieds has
  any reputation behind it?

## Design invariants

1. **The player starts alone**, or close to it.
2. **Starter money buys time, not safety.** It should run out visibly.
3. **Recruiting is earned**, not handed over in character creation.
