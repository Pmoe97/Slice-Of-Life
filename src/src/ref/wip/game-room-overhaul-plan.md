# Game Room Overhaul — a room people actually play in

Status: **planned — design complete 2026-09-22 (the user answered Q1–Q3 the
same day); not started.** The user asked for it directly ("Game room needs to
come to life! … This is a massive area for improvement and expansion."). Last updated
2026-09-22.

Companions:
- `SEASONS-AND-OCCASIONS-ROADMAP.md` — R12 (reuse AcesAndLace's engine math,
  not its code shape). Holiday tie-ins (Lantern Nights card games, New Year's
  arcade tournament) are this plan's last phase.
- **`C:\Projects\AcesAndLace\AcesAndLace.html`** — the user's own casino game
  (a single 463 KB Perchance page). Port assessment below.
- `src/src/ref/complete/asks-and-attachments-plan.md` + `money.js` — stakes
  settle through the bidirectional money ledger and the chore ask.
- `src/src/ref/complete/action-outcome-window-plan.md` — the window/modal
  conventions every minigame screen follows.

---

## Handoff — read this first

**Resume at:** Phase 1 (the match spine) — can start any time nothing else is
mid-flight; reads none of the date systems.

**Survey (2026-09-22):**
- Today the Game Room is one flat verb: `self.play_games` (defs.actions.js)
  — 40 minutes, +0.1 mood, −3 energy, one solo line, two shared lines, gated
  on `facilityFunctional:game_room_setup`. Anchors: `pool_table`,
  `game_console`, `dartboard` (defs.world.js 677–697). A `board_game` item
  exists (media, $20). The facility's top tier ("Entertainment Hub", $5,000)
  already *promises* "multiple consoles, arcade cabinet, dartboard" — the
  arcade has a natural unlock.
- **AcesAndLace port assessment.** Pure and portable almost verbatim (swap
  `Math.random` for `seededRng`): `createDeck`/`shuffleDeck`,
  `evaluateHand`/`scoreFive`/`compareScores`/`combinations` (best-5-of-N),
  `evaluateOmaha`, `twoCardStrength`/`preflopStrength`/`handStrength` (one
  shared 0–1 scale — its own comment explains why that mattered),
  `bjValue`/`isBlackjack`. **Portable as a design, not as code:**
  `opponentAct` — heads-up only, reads a global `G`, and is entangled with
  the strip/heat/campaign mechanics and the DOM — but its decision core
  (strength bands 0.42/0.72, pot odds, `aggression`/`bluff`/`slowplay`/
  `foldPressure`/`strengthBias`, plus per-character "heat" tilt) extracts
  cleanly into a pure multi-way `decidePokerAction(seat, table, style, rng)`.
  The play-style parameters map almost one-to-one onto Slice-of-Life
  temperament (D8). Blackjack's opponent logic and the variants (Omaha,
  five-card draw, seven stud, Spanish 21) come along the same way. Roulette
  is a casino game with no home analog — not ported.
- **Blockers:** none for Phase 1.

## The thesis

A game room is the most social room in a shared house: it's where rivalries
happen, where someone always wants a rematch, where the new roommate turns
out to be a pool shark, where Friday night becomes poker night. Right now
it's a mood vending machine. The fix is not more mood — it's *real games
with real opponents who have real personalities*, and consequences that
land in the relationship engine this game is built on.

### What this plan is *not*
- **Not a casino.** Home games between people who live together. Stakes are
  bragging rights, chores, capped IOUs and (behind the willingness gate) strip
  stakes — never an income stream (the economy
  invariants: independent income must stay worse than gig work; a poker
  "grind" would break that).
- **Not twelve shallow games.** Each game is a small, finished, replayable
  thing — darts, pool, a card table, an arcade cabinet of a few original
  games, a couple of tabletop games — added one phase at a time.
- **Not solo-only.** Every game except the arcade is best against a
  roommate; the arcade's high-score table makes even that social.
- **Not keyboard-only.** Every game is playable by touch (the mobile layout
  is real).

## Locked decisions

- **D1 — A match is a first-class record**: `{ gameId, players: ['player',
  npcId…], stakes, result, day }`. One spine (`games.js`) starts matches,
  resolves results, and applies consequences; each game is a module that
  only produces a result.
- **D2 — Consequences are social**: the winner's and loser's mood, a
  rivalry term on the cast web (respect up for a close game, tension up for
  a blowout against a sore loser), the NPC's reaction by temperament
  (`competitive`, volatility, warmth), and the player's choice after — be
  gracious, gloat, or demand a rematch — as a relationship beat.
- **D3 — Stakes**: bragging rights (default); **chores** ("loser does the
  dishes" — rides `ask_chore`'s `NPC_ACTIVITY`, so they really do them); an
  **IOU** through `money.js`'s ledger (no NPC wallet exists — the ledger is
  the honest home for a bet). Stakes need agreement (an ask, decided by
  relationship and temperament).
- **D4 — A 'games' skill** joins `SKILL_IDS`; an NPC's game skill derives
  from their `interests[].skill` for gaming (already wired for shared
  activities) and a seeded per-game aptitude (R5).
- **D5 — NPCs play without you**: offscreen matches between roommates as
  events ("Mira beat Jonah at pool again — he wants a rematch"), and on the
  arcade, roommates set high scores (derived from skill, deterministic) and
  *tell you* when they beat yours.
- **D6 — The facility tiers gate the gear**: functional = pool table, darts,
  console, board games, card table; upgraded (Entertainment Hub) = the
  arcade cabinet + a second console.
- **D7 — The old verb survives** as the "just messing around" option; each
  real game gets its own verb on its anchor object.
- **D8 — Card-table AI styles come from temperament** (R12): assertiveness →
  aggression, `deceptive`/`teasing` → bluff, `cautious`/`anxious` →
  foldPressure, `patient` → slowplay, `methodical` → strengthBias, volatility
  → how hard losing "heats" them (AcesAndLace's tilt).
- **D9 — Darts** is a timing game: an oscillating aim on two axes, click/tap
  to throw; 301 and Around the Clock.
- **D10 — Pool** is a real 2D physics 8-ball (canvas): aim, power, spin;
  the NPC's shot is a seeded aim error scaled by skill.
- **D11 — Poker** is Texas Hold'em for 2–5 seats (you + roommates), with
  AcesAndLace's variants as house rules later; chips are per-session tokens,
  converted to the agreed stakes at the end.
- **D12 — Blackjack** with a roommate dealing (house rules: dealer stands on
  soft 17), same stakes model.
- **D13 — Tabletop**: two quick board games (a four-in-a-row and a dice
  game) plus a party game night (a trivia/"guess who said it" round built on
  the knowledge-gossip facts the house already holds).
- **D14 — The arcade cabinet** ("we could legitimately design arcade games" —
  the user) holds four original one-button/touch games with a shared
  high-score table. **Approved by the user as drafted (2026-09-22):**
  - **Rent Runner** — an endless runner: jump the overdue bills, grab the
    coins, the rent meter chases you. One button.
  - **Night Shift** — slide drinks down four bar lanes to customers before
    they reach the end; catch the empties. Four taps.
  - **Stack Up** — drop the swinging slab onto the tower; the overhang is
    sliced off; how high can you build? One button.
  - **Neon Serpent** — a snake with a twist: the tail you shed becomes walls.
    Swipe/arrows.
- **D16 — Strip stakes at the card table** (user, 2026-09-22: "AbsoLUTELY it
  should allow strip stakes"). Offered only behind the mature content flag and
  the existing **willingness gate** (`resolveWillingnessGate`, the same one
  every intimate act routes through) — an NPC agrees to strip stakes only if
  the gate says they would; a player can always decline. Garments come off the
  real wardrobe/clothing state (`CLOTHING_STATES`, the outfit layers), so a
  lost hand is visible in the scene and the cutout. AcesAndLace's forfeit and
  layer-count logic is the design precedent; its "heat" becomes volatility-
  driven tilt (D8). Never below what the willingness gate allows mid-game: a
  player or NPC can call it off at any hand.
- **D17 — Real-money IOUs are in** (user: "Sure why not? Could create some
  interesting situations."): a bet settles through `money.js`'s ledger (who owes
  whom), capped per session (so it's a situation, not an income stream — the
  design invariant below still holds and is measured), and an unpaid poker debt
  is a real ledger entry the relationship engine can see.
- **D14 is approved as drafted** (user: "Sure. Run with those."): Rent Runner,
  Night Shift, Stack Up, Neon Serpent.
- **D15 — Holiday tie-ins** (last phase): Lantern Nights card games, a
  Midwinter board-game night, a New Year's Eve arcade tournament, Thanksgiving
  "the game's on" (the TV).

## Implementation phases

- **Phase 1 — The match spine** (D1–D4, D7): `games.js`, the 'games' skill,
  stakes asks, consequences, and an *abstract* resolver so "challenge Mira to
  pool" works end to end before any minigame exists.
- **Phase 2 — Darts** (D9).
- **Phase 3 — Card engine port** (`cardgames.js`, R12): deck, evaluator,
  strength, the pure multi-way `decidePokerAction`, blackjack math — all
  harness-tested before any UI.
- **Phase 4 — Poker night** (D11): the table UI, 2–5 seats, D8 styles.
- **Phase 5 — Blackjack** (D12).
- **Phase 6 — Pool** (D10).
- **Phase 7 — Arcade cabinet framework + first game** (D14).
- **Phase 8 — Arcade games 2–4 + high scores + NPC scores** (D5/D14).
- **Phase 9 — Tabletop & party games** (D13).
- **Phase 10 — Roommates playing each other** (D5) + a weekly game-night
  commitment kind.
- **Phase 11 — Holiday tie-ins** (D15).
- **Phase 12 — Close-out.**

## Status

| Phase | Status |
|---|---|
| 1–12 | Not started |

## Open questions

- ~~Q1 strip stakes~~ → D16. ~~Q2 arcade line-up~~ → D14 approved. ~~Q3 real
  money~~ → D17. (All resolved by the user 2026-09-22.)
- **Q4 — Console games**: abstract ("you play a racing game — you win by a
  nose") or one real two-player minigame? (Not yet asked; decide at Phase 9.)

## Design invariants

1. **No game is an income stream.** A harness measures that a week of the
   best-possible card play can't beat gig work (the independenceIndex test's
   spirit).
2. **Seeded everything** (R6): a reload replays the same deal, the same NPC
   decision.
3. **One spine**: games produce results; only `games.js` applies
   consequences.
