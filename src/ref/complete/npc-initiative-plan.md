# NPC Initiative & Social Verbs

Status: **COMPLETE — all six phases shipped.** Decisions locked D1–D36. Last
updated 2026-08-13.

Companions:
- `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md` (the umbrella — this is Plan 5 of six, and the payoff the other five were built for. It carries R1–R8 and RI1–RI6, which this plan inherits).
- `src/ref/complete/npc-cognition-plan.md` (Plan 3 — **complete**. `npc.pursuit` is committed intent; this plan's overtures are selected by the same scorer and must not become a second one).
- `src/ref/complete/knowledge-gossip-memory-plan.md` (Plan 4 — **complete**. Open questions, grievances and the player model are the motivations this plan spends. Its D13 bridge is the minimal proof this plan generalises).
- `src/ref/complete/perception-and-signals-plan.md` (Plan 1 — **complete**. The expression layer in Phase 1 is entirely built on its propagation model).

Paired session prompt: `src/ref/complete/npc-initiative-handoff-prompt.md` — it
held *how to work* while this plan was live, and is kept beside it as the
record of how the six sessions were run.

**This plan is finished.** It was a living document worked one phase per
session; what follows is the completed record. The Handoff below is the last
session's, kept because it is where the follow-up work is named — three of the
four open questions at the bottom were created by Phase 6 and none of them
belongs to this plan.

---

## Handoff — read this first

**The plan is COMPLETE. There is no Phase 7 — stop and report it complete.**
Suite green at **1,324 assertions** (`node dev/verify/run-all.js`), up from
1,302: `verify-i6.js` adds 22 and **no other harness moved**. If you are here
because something in this plan broke, start from green; if it is not green,
that is your first finding.

### What Phase 6 built — the identifiers to grep for

- **`dev/verify/measure-initiative.js`** — the instrument. Six arms, the gate,
  the endings, the feedback loop, five sweeps, the loneliness distribution.
  Every number below came from it. It wraps `overtureAllowed` and
  `scoreOvertures` in the vm context to tally what they were asked at their
  real call sites, so nothing in it re-implements a candidacy rule.
- **`dev/verify/verify-i6.js`** — 22 assertions, most of them about D34's
  class rather than its three instances.
- **`OVERTURE.textCooldownTicks` 12 → 16** — the tuning, and the only change
  here that is tuning.
- **`OVERTURE.proposeCooldownTicks` 48 → 20**, **`.knockCooldownTicks` 96 →
  20**, **`NPC_GIFT_TUNING.cooldownTicks` 96 → 20** — bug fixes wearing a
  tuning costume. See D34.

### The one thing to know if you read nothing else

**A `cooldownTicks` is not an elapsed duration. It is a fixed daily clock
window, `ticksPerDay - cooldownTicks` wide, anchored at the tick the entry last
fired on** — because `setCooldown` stamps a 0..47 index that wraps at midnight
and `isOnCooldown` compares a wrapped delta. At or above `CLOCK.ticksPerDay`
the window is empty and **the entry is on cooldown forever after its first
firing**. Three entries were: `propose_player` (48), `knock_player` (96) and
`gift_to_player` (96), all three with comments promising multi-day rates.

This is **D26's own finding in the one place D26 did not reach**. It is D34 in
full, it is why `verify-i6` exists, and the mechanism fix is flagged below
rather than done — it belongs to Plan 3's cognition layer.

### Numbers set by measurement, and what was measured

**The rate**, 12 households × 3 residents × 7 in-game days, seeds
`20260811 + i × 7919`, through the real `resolveBatch` plus the episode writer.
Before → after the retune:

| arm | before | after |
|---|---|---|
| untouched | 0.119 | **0.099** |
| fond (affection 0.9) | 2.456 | **1.742** |
| charged (desire 0.9) | 1.004 | **0.651** |
| player out of the flat | 1.504 | **0.544** |
| player behind a locked door | 1.579 | **0.591** |
| player asleep all week | 1.540 | **0.567** |

**`textCooldownTicks` 12 → 16 is the whole tuning, and the reason is that the
text was the only unrationed channel.** It has no geometric limiter (it reaches
a player anywhere, including out of the flat) and an empty do-not-disturb list
by design (D9 — "a text is the channel that does not disturb"), so it was two
thirds of every arm's volume and reached a sleeping or absent player 4.5 times
a day. 16 ticks is eight in-game hours. Measured on 8 households at affection
0.9: texts 242 → 72, the whole cast 2.464 → 1.405, and the in-person channels
unmoved (approach 152 → 144, propose 20 → 20). On an absent player, where this
is the only channel that can reach at all, 1.464 → 0.452 per NPC per day with
**0 of 24 residents going silent** — that last figure is the one that set the
value rather than 18 or 20, both of which were measured and both of which push
the channel to about 0.25/NPC/day.

**Why 20 for the three broken cooldowns.** It is the largest value measured to
keep every entry live: `propose_player` left **1 of 24 residents unable to ever
propose at 20, against 4 of 24 at 24**. Above roughly half a day the surviving
window can fall entirely inside hours the entry's own `blockFilter` excludes.
`gift_to_player` at 20 gives one gift per 4.9 NPC-days against one per 15.3 at
96 — the second figure being what "once, ever" looks like averaged out.

**What did NOT move, each with the measurement that kept it:**
- `OVERTURE.motiveWeight` **0.50**. Swept 0.25 / 0.35 / 0.50 / 0.70 / 0.90 →
  1.063 / 1.429 / 1.698 / 2.643 / 3.246 per NPC per day. Smooth, and 0.50 is
  the knee before it steepens.
- `approach_player.baseAppeal` **0.30** (0.20 → 0.50 spans 1.429 → 2.040) and
  `text_player.baseAppeal` **0.22** (0.10 → 0.30 spans 1.683 → 1.873).
- `propose_player.baseAppeal` **0.34** — swept 0.20 / 0.24 / 0.28 / 0.34 →
  0.381 / 0.405 / 0.429 / 0.435 proposals per NPC per day, a 14% span. It is
  not the lever, because a proposal is rarely in competition when it is a
  candidate at all. **Its comment was rewritten anyway**: the original said
  "a day-long cooldown already makes it scarce", and that cooldown never
  elapsed, so the stated justification was measuring the bug.
- The do-not-disturb lists. Every entry resolves, every entry is used by a def,
  and on the sleeping arm the gate blocked **4,260 overtures that had a live
  motive and were in position**. It is doing real work.
- The refusal constants. A week of refusing everything costs **0.109 affection**
  and cuts the rate from 1.742 to 0.758 — D10's curve self-limiting exactly as
  designed. `engages half` measured 1.917, `refuses half` 0.897.

### Two questions settled with numbers, not arguments (D35, D36)

- **D35 — the shared-activity feedback loop is real, bounded, and kept.** From
  a cast generated at 0: a week of deliberate evenings reaches affection 0.099
  and moves the rate not at all (the motive floor is 0.3); a month reaches
  0.417 and takes the rate 0.111 → 0.319; a month at the daily cap reaches the
  ceiling. **0.319/NPC/day is the realistic middle and is what the rate was
  tuned to feel right at** — not the 0.9-on-every-axis ceiling.
- **D36 — loneliness does not become a fifth motive.** `needs.social` is below
  55 on **78.9% of npc-ticks** (median 44). A motive live four ticks in five is
  a baseline, not a reason to reach for someone. The real finding is that
  `needs.social` measures time since talking to *anyone*, roommates included —
  a loneliness motive worth having would need time since contact with the
  **player**, which nothing stores. D36 records that shape.

### The browser check, and what it proved

`dev-harness.html` on port 8735, real cast (Rex, Yusuf), `?cb=61`. The Node
loader stops before `ui.js`, so `advanceAndResolve` — which writes the episodes
the curiosity motive feeds on — is only reachable here.

- **An untouched in-game day: zero overtures.** Correct, and it is the state
  every playthrough begins in. The only text was the contractor's scripted one.
- **A day at affection 0.9, two roommates:** Yusuf proposes at 18:00, Rex
  proposes at 20:30, one text each ("hope today is being kind to you", "the
  flat is quiet without you in it"). Four beats spread across an evening from
  two people who adore you. **That is the feel judgement, and it passes** —
  before the retune the same day would have carried roughly twice that, most of
  it phone.
- **Three days at affection 0.9:** Yusuf approach/approach/propose, Rex
  propose/approach/approach — 1.0 overtures per NPC per day, same order as the
  headless 1.742 on a three-resident flat. **Each channel repeated**, which is
  the D34 fix visible in play: before it, each NPC proposed once per game.
- **Accepting a proposal still books:** `commit_6_38_0`, kind `hangout`, day 6,
  ticks 38–42, living room, proposer in `acceptedIds`. The record left pending
  immediately afterwards is a *new* approach opened by the tick
  `doOvertureRespond` advances, not a leak — `propose_player` was stamped at 29
  and `approach_player` at 30.
- No console errors.

### Blockers / flagged deviations

**No blockers.** Four deviations, all recorded in D34 and the Files list:

- **`NPC_GIFT_TUNING.cooldownTicks` was fixed, and it is not this plan's
  drive.** One number, of the same broken class, in the file this phase was
  editing — and `verify-i6`'s class assertion over both tables could not be
  written while it stood. Same call Phase 5 made on the three `ACTION_DEFS`
  entries that had no `timeCost`.
- **`do_laundry` (30) is over D34's soft bound and was left alone.** Measured:
  23 firings at 12, 18 at 18, then a flat **8 at each of 24, 30 and 36** — its
  constant has stopped deciding anything. Re-rating housekeeping is not this
  plan's call, so `verify-i6` reports it as a NOTE rather than failing on it,
  and it is an open question.
- **The mechanism behind D34 was NOT fixed.** Making a stamp measure elapsed
  time means giving it a day, which changes `setCooldown`'s signature, both
  readers, and three harnesses that read the stamp as a bare number. That is a
  change to Plan 3's cognition layer, not a tuning pass. `verify-i6`'s first
  assertion is written to **fail** the moment somebody does it, and says to
  delete the bound rather than widen it.
- **`propose_player.baseAppeal`'s comment was rewritten without its value
  moving.** A justification that rests on a measured-false premise is worse
  than no comment, because the next person to tune it will believe it.

### Three traps this phase fell into, all of them cheap to repeat

- **`OVERTURE.motiveWeight` is copied into each def's `utility.motive.weight`
  at config load.** Writing the published constant after load moves nothing —
  the first draft of that sweep printed five identical rows, which reads
  exactly like a lever that does not work. `verify-i6` asserts the copy so the
  two cannot drift; the instrument sweeps the defs.
- **`verify-i6`'s summary line needs two leading spaces.** `run-all.js` matches
  `/^ {2}(\d+) passed, (\d+) failed$/m` and anything else is reported as
  **DID NOT REPORT**, which is not a harness that passed (README rule 6). The
  first draft had none and the suite reported 1,302 with one harness errored.
- **`__lock` looks for defId `bedroom_door`/`bathroom_door`, not `door`.** An
  earlier draft invented `door`, found nothing, and produced a "locked door"
  arm in which the door was never locked — so the approach fired and the knock
  never did, the exact inverse of the truth. Copy verify-i4's.

---

## The thesis

Every language beat in the game except two adult-content interruptions is
initiated by the player. NPCs never open.

The roadmap frames this as "NPCs approach, knock, propose". The design session
reframed it, and the reframe is the plan: **initiative is not one behaviour, it
is a spectrum ordered by how much of the player's attention it demands.** At
the top an NPC walks between you and the television. At the bottom they leave a
wet towel on the bathroom floor and you find it an hour later. Both are the
same thing — an NPC acting on their own motivation and the world showing it —
and only the top of that range needs new machinery.

Ordered by visibility, and mapped against what already exists:

| Tier | Examples | Status before this plan |
|---|---|---|
| **5 — demands attention** | interrupting your action, confrontation, asking for help | New. This plan |
| **4 — requires acknowledgment** | showing you something, unprompted gift, asking your opinion | New. This plan |
| **3 — alters the shared environment** | changing the music, sighing, slamming cabinets, taking the good chair | Substrate only — Plan 1 propagates signals; nothing emotional emits one |
| **2 — discovered asynchronously** | traces, autonomous chores, the flat being empty | **Largely built.** Plan 3 Phase 4's `leaves`, `clean_common`, work blocks, and `spawnNote`'s existing `authorId` |
| **1 — purely internal** | self-care, pacing when bored | **Built.** Plan 3's drives — `seek_stimulation` is literally labelled `'looking for something to do'` |

Tiers 1 and 2 are done and are **out of scope**. Tier 3 is nearly free and
ships first. Tiers 4 and 5 are the plan.

The second half is the social verb list. There are **no social verbs today** —
every `ACTION_DEFS` entry is `self.*`, `phone.*` or `set_meal`. The player can
talk *at* an NPC and invite them to one meal. Shared activities matter
mechanically because they are the acts that generate the observations Plan 4
turns into knowledge: shared time is the input, being known is the output.

---

## Evidence

Measured 2026-08-12 against the real engine through `resolveBatch`, 12
households × 7 in-game days × 3 residents (36 residents, the population Plan 3
used). Reproduce with the scripts named below.

### Four of the five motivation sources read exactly zero — two of them still do

The design-time measurement, and what has moved since. **Phase 2 moved the two
knowledge rows**; the two relationship rows are unchanged and Phase 3 must
still treat them as cold.

| Source | Where it lives | At design time | Now |
|---|---|---|---|
| `npc.mood` | `npc.mood`, `moodReason` | **−0.48 .. 1.0, mean 0.139** — alive | unchanged. NOT an overture motive by design — Phase 1 gave mood its own channel (D7) |
| `relPlayer.desire` / `comfort` / `affection` | `relPlayer` axes | **0, and immobile** | **`desire` still 0. `affection` / `comfort` / `trust` gained their FIRST non-conversation writer in Phase 5** (D16's shared-activity delta) — capped at `SHARED_ACTIVITY.dailyCreditMinutes`, so a day of it is worth less than one judged window. Still player-driven: nothing ambient moves them. `desire` remains conversation-only, so the charged path is still silent in play |
| `relPlayer.grievances` | `relPlayer.grievances[]` | **0** | **still 0** — nothing writes them outside the conversation path. Same: wired, exercised, silent |
| `memory.openQuestions` | Plan 4's lifecycle | **0** | **33 over 12×7, on 19 of 36 residents** (Phase 2, D15). **The only source that reaches the player unaided** — every one of the 14 overtures Phase 3 measured on an untouched cast was `curiosity` |
| `memory.facts` | Plan 4's belief tier | **0** | **233 over 12×7, on 36 of 36 residents** (Phase 2, D15) |

At design time only `mood` accrued on its own. That is why Phase 1 is the
expression layer: it was the only tier this plan could build on the day it
started.

**Phase 1 remeasured `mood` at the point a consumer actually reads it** — the
`evaluateDrives` call rather than the day boundary — over the same population:
5,467 npc-tick calls, min −0.53, p25 −0.06, median 0.07, p75 0.23, max 1.00,
mean 0.109. The day-boundary figure in the table above is unchanged; the
per-call distribution is the one to tune against, and it lives with the
constants it set, in `EXPRESSION_MOOD`'s comment in `config.js`.

**Phase 2 moved the two knowledge rows and nothing else.** The full occupancy
figures, both arms, are in the Handoff. Curiosity is a live motivation source
now; grievance, affection and desire are not, and an overture scored on them
alone would still be scoring against zero.

### Every relationship axis generates at 0 and never moves without the player

All six axes (`desire`, `comfort`, `affection`, `tension`, `trust`, `respect`)
are 0 for all 36 residents at generation, `conversationPhase` is `'early'` for
all 36, and **0 of 12 residents moved on any axis over seven untouched days**.
The axes move only through conversation rel-deltas.

This is what makes `mayInitiate` dead rather than merely rare — see below.

### `mayInitiate` was computed and read by nothing — FIXED in Phase 2

`checkRelConsequences` (`ui.js`) set two flags that no code anywhere consumed:

```js
if (desire >= REL_CONSEQUENCES.desireHigh) flags.highDesire = true;
if (desire >= REL_CONSEQUENCES.desireHighComfortHigh && comfort >= REL_CONSEQUENCES.comfortHigh
    && affection >= REL_CONSEQUENCES.affectionHigh) flags.mayInitiate = true;
```

A flag named for exactly what this plan does, with four authored thresholds
behind it (`desireHigh` 0.5, `desireHighComfortHigh` 0.7, `comfortHigh` 0.7,
`affectionHigh` 0.6), that had never once caused anything to happen. It was
also a **conjunction across three axes that all start at 0**, so reaching it
needed sustained movement on all three at once.

**Phase 2 replaced the inline conjunction with `npcInitiativeGate` (D12)**, and
gave `highDesire` its first reader in D13's tension override. The authored
thresholds survive as the endpoint: a wholly inhibited NPC still requires
exactly the conjunction above.

**Phase 3 closed it.** `mayInitiate` is now the whole of the `desire` motive in
`OVERTURE_MOTIVES` — an NPC who does not clear the gate cannot open a
desire-motivated overture, and one who does opens a `warm` or a `charged` one
depending on which path let them through. D20 is discharged: both flags cause
something to happen, and neither was deleted.

### The knowledge layer had a cold start, and it was not the threshold — FIXED in Phase 2

Plan 4's own Handoff recorded open-question occupancy as 0 over this population
and kept `createThreshold` at 0.6 as "a longer-horizon feature". The
measurement says the threshold was not the cause.

Simulating the episode writer (see the trap below), residents accumulate
**1,080 episodes — 30.0 each, the `MEMORY_BUDGET.maxEpisodes` cap, saturated
within the week**. Against a full episode tier, rumination produced **0 facts,
0 inferred facts and 0 open questions**.

The reason: rumination's D7 rules key on episode `participants` (co-occurrence
→ "X and Y spend time together") and on `emotionalTag`/category (repetition →
"this keeps happening"). The only writer of ambient episodes —
`advanceAndResolve` in `ui.js` — called

```js
addMemoryEpisode(npc, evt.day, text, eventImportance(evt))
```

with **no `participants` and no `emotionalTag`**. Those arguments were supplied
only by the LLM path (`npc.js`, from `memoryAdditions`). So thirty ambient
episodes a week per resident contributed nothing to belief, and the entire
knowledge web was seeded exclusively by player conversation.

This is the same defect class the roadmap was written to eliminate: a field
written by one path and read by another, never meeting. **Phase 2 closed it.**
Same events, same episodes, both fields supplied: 233 facts and 33 open
questions over the same population, against 0 and 0 for the old writer. Two
rules needed correcting to get there (D24, D25) — the fields alone were
necessary and not sufficient.

### MEASUREMENT TRAP — `resolveBatch` does not write episodes

`ui.js`'s `advanceAndResolve` does, outside the tick. Measuring memory
occupancy headlessly reads 0 episodes, 0 facts and 0 open questions and looks
exactly like a dead knowledge layer. The first pass of this Evidence section
made that mistake. Simulate the loop:

```js
const r = resolveBatch(g, 1); g = r.state;
for (const evt of r.events) g.npcs[evt.npcId] =
  addMemoryEpisode(g.npcs[evt.npcId], evt.day, evt.template, MEMORY_IMPORTANCE.conversational);
```

Add it to the same list as Plan 3's two traps (`resolveBatch` returns new state;
a fresh house never gets dirty).

### There are no social verbs — FIXED in Phase 5

All 25 `ACTION_DEFS` entries were `self.*`, `phone.*` or `set_meal`. Ten had
obvious two-person counterparts already implemented as solo activities:
`self.watch_tv`, `self.cook`, `self.play_games`, `self.study`, `self.workout`,
`self.swim`, `self.take_walk`, `self.listen_music`, `self.balcony_sit`,
`self.relax`.

**Phase 5 gave all ten a `shared` field** (D17) rather than ten new entries.
Measured over 12 households × 7 days, sampling every two in-game hours, an
eligible partner is standing in the room the activity is available from:

| activity | of sampled moments | activity | of sampled moments |
|---|---|---|---|
| `self.relax` | **32.0%** | `self.play_games` | 14.7% |
| `self.listen_music` | 28.0% | `self.cook` | 12.7% |
| `self.watch_tv` | 25.5% | `self.workout` | 8.2% |
| `self.study` | 7.6% | `self.balcony_sit` | 4.2% |
| `self.swim` | 2.8% | `self.take_walk` | **0.2%** |

Every one is reachable; none is always available. The spread is the floor plan
and the schedule, not the filter — the living room is where this cast is, and
`take_walk` is sourced from `entry`, which nobody sits in. Reproduce with
`verify-i5.js`'s REACHABILITY section.

### The rate, as shipped — and two channels that had been firing once per game

**Phase 6 moved every figure in this section that mentions a rate.** Measured
with `measure-initiative.js` on the same 12 households × 3 residents × 7
in-game days, before and after the retune (`textCooldownTicks` 12 → 16,
`proposeCooldownTicks` 48 → 20, `knockCooldownTicks` 96 → 20):

| arm | before | after | by channel, after |
|---|---|---|---|
| untouched | 0.119 | **0.099** | text 10, approach 15 |
| fond (affection 0.9) | 2.456 | **1.742** | text 134, approach 195, propose 110 |
| charged (desire 0.9) | 1.004 | **0.651** | text 66, approach 98 |
| player out of the flat | 1.504 | **0.544** | text 137 |
| player behind a locked door | 1.579 | **0.591** | text 136, knock 13 |
| player asleep all week | 1.540 | **0.567** | text 143 |

Two different things are in that table and they must not be read as one. The
**text** collapse is the tuning (it was two thirds of every arm's volume, and
it is the one channel with neither a geometric limiter nor a do-not-disturb
entry). The **propose** rise, 30 → 110, is D34's bug fix: that channel had been
firing once per NPC per *game*, so Phase 4's figure for it was measuring a
defect. Anything in this document that compares a propose or knock count
against a pre-Phase-6 number is comparing against that.

**The untouched arm is still curiosity, and only curiosity.** 0.099/NPC/day is
one overture per NPC per ten days — a real in-game day at the cold start
produced **zero** in the browser, which is correct and is the state every
playthrough begins in.

### The feedback loop Phase 5 parked, measured

Affection's first non-conversation writer (D16) feeding `approach_player`'s
strongest motive. A player who watches TV with whoever is in the room, from a
cast generated at 0 on every axis, 6 households:

| player | days | shared minutes | mean affection | overtures/NPC/day |
|---|---|---|---|---|
| does nothing | 7 | 0 | 0.0000 | 0.111 |
| watches TV every 4 ticks | 7 | 3,900 | 0.0989 | 0.119 |
| watches TV every 4 ticks | 28 | 16,830 | 0.4167 | 0.319 |
| watches TV every tick (at the daily cap) | 28 | 77,550 | 1.0000 | 1.016 |

**The loop is real, slow, and bounded — which is the answer the open question
wanted.** A week of deliberate evenings moves affection to 0.099 and the rate
not at all, because `REL_CONSEQUENCES.affectionGiftThreshold` (0.3) is the
motive's floor. A month reaches 0.417 and roughly triples the rate. Grinding it
at the daily cap for a month reaches the ceiling. Nothing here compounds
faster than the cap allows, because `SHARED_ACTIVITY.dailyCreditMinutes` is a
hard per-day bound and the motive floor swallows the first three weeks.

**The realistic middle of this table — 0.319/NPC/day, about one overture a day
across the flat — is the number the rate was tuned to feel right at**, not the
0.9-on-every-axis ceiling, which is only reachable through sustained
conversation.

### `deviantLevel` is null on the entire cast

`bible.deviantLevel` is baked only by `computer.js`'s Hot Singles generator,
never by `SIM_generateHouse`; `interruption.js` defaults it to 0. Measured null
for all residents. It cannot be the disinhibition axis for the roommate cast —
see D11.

**Still true after Phase 1, and asserted so it stays known.** D11's
`npcDisinhibition` derives the value instead, and measures **0.123 .. 0.834,
mean 0.483 across 60 generated residents** — a real spread on a cast where the
baked field is absent for everybody. `verify-i1` asserts the premise (the
generated cast still has no baked `deviantLevel`) alongside the fix, so if
generation ever starts baking one, the derivation gets revisited rather than
silently shadowed.

---

## Locked decisions

### The model

- **D1 — Initiative is a hybrid: the scorer selects, a record carries.** An
  overture is chosen by Plan 3's `scoreCandidates`/`choosePursuit` like any
  other act, but once accepted it becomes a record that outlives the tick.
  Selection stays in one place (no second committed-intent system that can
  disagree with `npc.pursuit`, which is what D3 of Plan 3 made impossible by
  construction); state that spans ticks lives where `commitments.js` already
  puts it. The user's choice.

- **D2 — `overture` is the word.** `commitment` is `commitments.js`, `pursuit`
  is Plan 3, `intent` is the player's free-text classifier. New code goes in
  `src/srcfiles/overture.js`, loaded after `cognition.js`.

- **D3 — Expressions ride along; acts occupy the tick.** An NPC sighing is not
  a decision, it is state leaking out of whatever they are already doing —
  declarative, `emitsSignal`-shaped, no tick cost. An NPC walking over to ask
  you something is a chosen act and goes through the scorer. This split is what
  keeps Plan 3's one-action-per-tick guarantee intact: an NPC can sigh *while*
  doing laundry and cannot approach you while doing laundry.

- **D4 — Five motivation sources, four of them already stored.** Curiosity
  (Plan 4's `openQuestions`), grievance (`relPlayer.grievances`), mood
  (`npc.mood`), affection (`relPlayer.affection`) and desire
  (`relPlayer.desire`). Only affection has any mechanical reader today. This
  plan is substantially about *consuming what Plans 0–4 already built*.

- **D5 — Needs do not motivate overtures.** Plan 3's scoring is need-driven and
  that is correct for what an NPC does *to the world*; an overture is directed
  at a person and is motivated by epistemic and emotional state instead. A
  hungry NPC eats; a curious one asks. `utility.need` stays absent on every
  overture drive, which also keeps them out of competition with self-care at
  the moments self-care should win.

### Visibility and scope

- **D6 — Tiers 1 and 2 are out of scope; they are built.** Plan 3's drives are
  the internal tier and its Phase 4 `leaves` are the async-discovery tier.
  Restating them here would be a second implementation of a shipped feature.
  Two cheap extensions are in scope where they cost a config entry:
  NPC-authored notes (`spawnNote` already takes an `authorId`) and a wider
  `leaves` table.

- **D7 — The expression layer (tier 3) ships first.** It is declarative, needs
  no new UI, costs no tick, and rides on `mood` — the one motivation source
  measured alive. It makes the flat feel occupied before any overture machinery
  exists, and it gives Phase 6 something to tune against. The user's choice.

- **D8 — All four channels ship: approach, `text_player` rewrite, propose,
  knock.** The user's choice. Ordered by presentation cost — approach and the
  text rewrite need no new surface, propose needs a player-facing accept/decline,
  knock needs the most new UI.

### Interaction with the player

- **D9 — Overtures are gated by a do-not-disturb set, not by player idleness.**
  Firing only when the player is idle means NPCs never open at the moments that
  carry weight; firing always is harassment at any meaningful rate. The gate
  list reuses what `interruption.js` already consults —
  `getPlayerVulnerableState`, `getDoorState` — plus mid-conversation and sleep.
  The user's choice.

- **D10 — Refusal costs a relationship delta AND is remembered, and both
  self-limit.** A refusal writes a fact with provenance (so the NPC's model of
  you reflects it, R7) and moves the relationship. To stop that spiralling into
  a permanent grudge over a long game, the fact carries normal confidence decay
  and **each successive refusal within a window moves the relationship less
  than the last**. The NPC learns to stop asking rather than learning to hate
  you. The user's choice; the diminishing return is the half that makes the
  other half safe.

### Desire

- **D11 — Disinhibition is derived from temperament, never from
  `deviantLevel`.** `bible.deviantLevel` is null for every member of the
  roommate cast (Evidence). One shared `npcDisinhibition(npc)` in `sim.js`
  computes it from temperament for everyone, using `deviantLevel`'s own
  published weighting, and lets a baked `deviantLevel` override when present so
  Hot Singles keep their authored value. This is the `npcCuriosity` pattern
  exactly — one definition, several callers, extracted precisely so two copies
  cannot drift.

- **D12 — Sex and romance are separate axes, and the current gate conflates
  them.** `mayInitiate` requires `desire ∧ comfort ∧ affection` as a
  conjunction, which makes wanting someone you are not fond of structurally
  unrepresentable. The affection and comfort requirements become
  **personality-scaled**: high disinhibition lowers them toward zero while
  desire stays load-bearing. This produces two distinct paths to an overture —
  an affectionate one and a wanting one — and they must produce **different
  overtures, different narration and different remembered facts**, or the
  distinction never reaches the player. Not a norm imposed on the cast: an
  outcome that appears only for the temperaments that produce it. The user's
  decision.

- **D13 — Desire can override the tension refusal.** `checkRelConsequences`
  returns `canTalk: false` at `tensionHigh` (0.8), which today blocks every
  approach. A disinhibited NPC with high desire approaches anyway — charged
  rather than warm, and the friction is the point. It needs its own narration
  or it reads as the tension model being broken. The user's choice.

- **D14 — Desire-driven overtures are gated by `contentFlags`, phase, and the
  existing thresholds.** `meta.contentConfig.contentFlags.romance` gates the
  affectionate path, `.mature` the explicit one; `conversationPhase` supplies a
  floor; the authored `REL_CONSEQUENCES` numbers supply the bar. Every one of
  these already exists. The player's content settings sit above the whole
  system, and D10's refusal path means an overture is always declinable.

### Knowledge

- **D15 — Ambient episodes must carry `participants` and `emotionalTag`.** The
  cold start in Evidence is that `ui.js`'s episode writer supplies neither, so
  rumination's D7 rules can never fire on ambient life and the knowledge web is
  seeded only by player conversation. Tick events know who was present and what
  kind of thing happened. Without this, **curiosity is dead as a motivation
  source** and D4 is a four-source plan wearing a five-source label.

- **D16 — Shared activities produce witnessed facts AND a relationship
  delta.** Facts alone leave the payoff invisible; a delta alone leaves the
  roadmap's knowledge loop unclosed. Both, with the delta small enough that
  shared time does not become the dominant relationship lever. The user's
  choice.

- **D17 — Shared activities are a participant parameter on the existing
  `self.*` defs, not a parallel `together.*` table.** Ten activities already
  exist; mirroring them would double the table and its upkeep. Shared-specific
  effects are declared as a delta on the existing entry. The user's choice.

### Boundaries

- **D18 — The tick stays synchronous, pure and LLM-free (R2).** The *decision*
  to make an overture is in-tick arithmetic; the *line* is generated at the
  moment it surfaces, on the player's time budget. This is Plan 4's D8 applied
  to a second case, and `interruption.js`'s `startInterruptionPreGeneration` is
  the working precedent for generating a line before it is needed.

- **D19 — `npc.overture` has exactly one writer.** Plan 3's D3, restated,
  because the same failure would be available here: convention already failed
  once in this codebase when five drives grew their own bypass of the weight
  roll. Writers are named and grouped, and the harness asserts they are the only
  path.

- **D20 — Every dead flag this plan touches gets a reader or is deleted.**
  `mayInitiate` and `highDesire` are computed and unread today. R8 applied to
  behaviour: a flag that has never caused anything to happen is either wired in
  this plan or removed in it. No third option.

- **D22 — `expresses` may be one rule or an ORDERED ARRAY, and the first match
  wins.** Decided in Phase 1. The data model below sketched a single rule,
  which makes every drive monochrome — a drive could express exactly one
  emotion for the life of the game, so an NPC could never both slam a cupboard
  on a bad day and hum over the stove on a good one at the same activity.
  Ordering is also how precedence is expressed without a second mechanism:
  `eat` lists the slam before the sigh, so the stricter rule cannot be
  swallowed by the looser one. At most one expression fires per act either way,
  which is what keeps D3 true.

- **D23 — A `when` clause names a source from a registry, and fails closed.**
  Decided in Phase 1. `EXPRESSION_SOURCES` in `drives.js` is the list of things
  a condition may read; an absent key, an empty `when`, a condition with
  neither `below` nor `above`, or a source that is not a number all evaluate to
  **false**, never to true. Phase 1 ships exactly one source — `mood` — and the
  later phases add theirs beside the reader that makes them live. The reason
  for the direction: a silent never-fires is findable (verify-i1 asserts every
  authored signal fires on a real population), while a silent always-fires is a
  layer nobody authored going off on every act in the game.

- **D24 — Co-occurrence counts EVERY pair on an episode, not only episodes
  with exactly two participants.** Decided in Phase 2. Plan 4's rule tested
  `parts.length !== 2` and skipped everything else. That was correct while the
  Chronicler was the only writer of `participants` — it always wrote
  `[npc, 'player']` — and became a silent skip the moment ambient episodes
  started carrying who was in the room. Three residents in the living room is
  the modal case in this flat, and 52 of 1,465 measured events had three
  participants; under the old test every one of them counted for nothing. The
  rule's own comment already said "between the SAME participant pair", so this
  is the implementation catching up with the documented intent. Pair count is
  bounded by the flat (three residents plus the player → six pairs), so a fact
  per pair is a bound rather than a flood. Fewer than two participants is still
  skipped: one person is not a pair.

- **D25 — The repetition rule keeps ONE fact per theme, deduplicated by tag
  rather than by exact text.** Decided in Phase 2, and the more consequential
  half of D24's pair. `latestByTag` moves to the newest tagged episode each
  day, so under exact-text dedupe the SAME recurring theme minted a new
  permanent belief every time its exemplar changed — measured over seven days,
  three separate "this keeps happening" facts about three different broken
  objects, all tagged `embarrassment`, and no ceiling at all over a longer
  game. One theme is one belief; which episode names it is an accident of
  ordering. With this, inferred beliefs saturate at ~9–10 per resident by week
  three and stop, against `BELIEF.maxFacts` 60. The prefix lives in
  `REPETITION_FACT_PREFIX` so the mint and the dedupe cannot drift.

- **D26 — The record carries `ticksLeft` + `openedDay`, not the sketched
  `openedTick`, and `requiresAdjacent` replaces `requiresSameRoom`.** Decided
  in Phase 3, both against the Data model sketch below. A tick index is a 0..47
  per-day value that wraps at midnight, so it cannot measure an age — which is
  exactly why Plan 3's pursuit carries a countdown rather than comparing
  indices, and the bug that taught it (51.5% of cooldown stamps reading as
  permanently on cooldown) is on the record in `isOnCooldown`. `openedDay` is
  what the refusal window and the remembered fact need, and it does not wrap.
  Separately, `requiresSameRoom` makes the phase's own goal sentence false —
  same room means they were already standing there. `isRoomAdjacent` returns
  true for the same room too, so one predicate covers both and the walk is one
  tick. Two hops is a journey, and a journey is Phase 4's `knock`. Note that
  the Mirrored H is sparser than it looks: the living room and the kitchen are
  NOT adjacent.

- **D28 — An ignored overture lapses SILENTLY; escalation is what refusing
  does.** Decided in Phase 3, promoted from Open questions now that the rate is
  observable. Three endings, and the player reaches each of them through
  something they already do (D8): talking to them is `engaged`, walking out of
  the room is `refused` and carries D10's whole economy, and doing neither
  lapses after `utility.holdTicks` at no cost. An NPC who escalates on being
  ignored would be escalating against a **0.056 overtures/NPC/day** baseline on
  an untouched cast (Phase 4 moved that to **0.119** and Phase 6's retune to
  **0.099**, still the same conclusion) — the moments are far too rare for a needy read to be the
  risk, and turning "the player was busy" into a relationship cost would make
  the do-not-disturb set (D9) the only thing standing between the cast and a
  slow grind downward. The escalation that exists is the one the player chose:
  walking away. Revisit in Phase 6 if the feel judgement says otherwise; the
  lapse path is one named writer and costs nothing to change.

- **D27 — An NPC holding a pending overture selects nothing else.** Decided in
  Phase 3, and it is what makes design invariant 2 true in the reading that
  matters. Selection guarantees only that ONE thing is chosen per tick; the
  overture record spans ticks, so without a hold an NPC who crossed the room on
  tick N was free to win an ordinary drive on tick N+1 — measured over 12
  households × 7 days, **95 npc-ticks holding a pursuit and an overture at once
  and 147 where a pending record belonged to someone who had already walked out
  of the room.** They stay put in the player's room, wear the def's
  `activityOverride`, and the record ages out (or the player answers) inside
  `utility.holdTicks`. The hold lives in `resolveTick`, beside the sleep and
  transit skips. Its corollary: `ageOverture` must NOT lapse on the NPC's own
  room, because Pass 1 re-rolls a room preference every tick — the same mistake
  cancelled 233 of 485 pursuits before `agePursuit` stopped releasing on
  transit.

- **D29 — Where an NPC has to be standing is a NAMED PREDICATE from a registry,
  not a boolean.** Decided in Phase 4, against D26's `requiresAdjacent`. One
  boolean was enough for one channel and is not enough for four: an approach
  needs to be able to reach you, a knock needs to be on the OTHER side of a door
  from you, and a text needs neither — it reaches a player who is not in the
  flat at all, which is the one thing the in-person channels can never do.
  `OVERTURE_PROXIMITY` holds `adjacent` / `outside` / `remote`, each carrying
  both its test AND whether the player has to be anywhere (`needsPlayerRoom`),
  because those are one question and splitting them is how a remote channel
  gets blocked by a presence check nobody remembered. It fails closed, like
  `OVERTURE_DND_SOURCES` and D23's `when` sources before it. The semantics of
  `'adjacent'` are D26's unchanged.

  Its sibling: **`requires` is the do-not-disturb registry read the other way
  up** — states that must be TRUE. The knock exists BECAUSE the door is shut, so
  the entry that blocks an approach is the entry that enables a knock, and
  reading both lists off one table is what stops the two from acquiring
  different ideas of what a closed door is.

- **D30 — The proposal channel is affection-motivated and warm only.** Decided
  in Phase 4, and it is a decision rather than an omission. Curiosity and
  grievance are about a THING and are answered by talking NOW, not by scheduling
  — a proposal is the only overture about the future, and what it is for is
  time. And a charged proposal has no different outcome to point at until Phase
  5's shared activities exist, which makes it exactly the tone-with-no-
  consequence D12 forbids: two paths that read differently and DO the same thing
  are one path with two labels. Revisit in Phase 5, when there is something for
  the other tones to mean. The cost is that the channel is invisible on an
  untouched cast, because affection generates at 0 — which is already true of
  the whole relational half of this plan.

  **Revisited in Phase 5; the answer is unchanged, and the reason is now
  sharper.** Shared activities do give a hangout somewhere to go — a bound
  commitment puts the NPC in the room, so whatever verb the player takes there
  becomes shared. But the shared outcome is keyed to the ACTIVITY's tier
  (D31/D17), not to the tone of the proposal that produced the evening, so a
  charged proposal would still book the same hangout and pay the same delta.
  That is still two labels on one path. Making it real needs charged-specific
  shared outcomes — a different rate, different facts — which is `contentFlags.
  mature` territory (D14) and a design call the user owns, not a Phase 5
  inference. Parked in Open questions rather than improvised.

- **D31 — The shared-activity delta is PER HOUR and capped per NPC per day.**
  Decided in Phase 5. D16 asked for a delta "small enough that shared time does
  not become the dominant relationship lever" and did not say how, and the two
  obvious readings both fail: a flat per-action delta makes the cheapest verb
  the exploit (`self.relax` is 15 minutes and ungated, `self.study` is 60), and
  "just author it small" is an argument about how much a player will grind
  rather than a property of the system. Scaling by the action's own
  `resolveTimeCost` minutes makes the lever TIME, which is what a shared
  activity actually is, so every verb pays the same per minute. `dailyCredit-
  Minutes` then makes the bound structural: 2.5 hours × the best rate is
  **0.05 affection**, against `X5.deltaClamp / X5.deltaDivisor` = **0.20** for
  one judged conversation window at its ceiling. A whole day of doing
  everything together is worth less than one good talk, and `verify-i5` derives
  that comparison from both tables rather than restating either number. Past
  the cap the time is still shared — the fact still lands, the narration still
  names them — it just stops paying, because the cap rations the LEVER and does
  not decide what happened.

- **D32 — One fact per activity per NPC, deduplicated on EXACT TEXT.** Decided
  in Phase 5, and it is D25's conclusion reached by a different route. The
  first evening in front of the TV together is the thing that gets remembered;
  the thirtieth is what the delta is for. That bounds this source at one fact
  per shareable entry — ten against `BELIEF.maxFacts` 60 — by construction
  rather than by a throttle, which is the property D24/D25 settled on in Phase
  2. Exact text is safe here where D25 needed a tag because the string is
  rendered deterministically from the entry's own `fact` template and a name
  that does not change; D25's exemplar episode moved to the newest tagged one
  every day, which is precisely why it could not dedupe on text. Measured: ten
  activities × ten rounds leaves exactly ten facts.

- **D33 — "Who is in it with you" is ONE predicate, and its two registries
  fail in OPPOSITE directions on purpose.** Decided in Phase 5.
  `sharedActivityParticipants` is read both by D16's facts-and-delta and by the
  pre-existing `presentResidentAffection` mood impulse, which ask about the
  same room at the same instant — two implementations would have been two ideas
  of togetherness with nothing forcing them to agree, which is the
  `npcCuriosity` pattern this plan has invoked three times. Residents only: a
  booked escort standing in the room is not an evening together, and letting a
  visit count would make it an affection tap.

  The directions. `SHARED_ACTIVITY.rates` is a lookup of the D23/D29 kind — an
  entry naming a tier nobody authored pays **nothing**, failing closed.
  `SHARED_ACTIVITY.excludeActivities` is a **deny-list**, so the same words
  mean the opposite thing: an unrecognised activity string is not a condition
  read as unknown, it is an absence from a list of exclusions, and treating it
  as excluded would mean any new activity string silently killing shared
  activities everywhere. That is D23's own stated failure mode — a silent
  never-fires — arrived at from the other side. It fails **open**, and the
  worst case is a roommate counted as present while they read a book.

- **D35 — The shared-activity delta DOES feed the overtures that read
  affection, and the loop is kept.** Phase 5 raised this as the arm that
  compounds and left it unmeasured. Phase 6 measured it (Evidence, "The
  feedback loop Phase 5 parked"): from a cast generated at 0, a player who
  watches TV with whoever is in the room reaches affection 0.099 in a week and
  0.417 in a month, taking the rate from 0.111 to 0.319 overtures per NPC per
  day. It compounds and it is bounded — twice over, because
  `SHARED_ACTIVITY.dailyCreditMinutes` caps what a day can buy (D31) and
  `REL_CONSEQUENCES.affectionGiftThreshold` swallows the first three weeks
  before the motive is live at all. That is the shape the loop wanted:
  spending time with someone makes them more likely to seek you out, on a
  timescale measured in weeks rather than evenings. Kept as is; no constant
  moved for it.

- **D36 — Loneliness does NOT become a fifth motive source, and the number is
  why.** Phase 4 lost `text_player`'s `utility.need: { social, below: 55 }` to
  D5 and parked this for Phase 6 to settle with the untouched rate in front of
  it. Settled: **no**. Measured over 12 households × 7 days, `needs.social`
  sits below 55 on **78.9% of all npc-ticks** (median 44; below 40 on 40.9%,
  below 25 on 13.9%). A motive live on four npc-ticks in five is not a reason
  to reach for someone, it is a baseline — and scoring an overture on it would
  put a near-permanent term into competition with self-care at exactly the
  moments D5 exists to let self-care win. That is D5's stated objection with a
  number attached rather than an argument.

  The counter-argument that made this a real question — loneliness IS directed
  at a person, which is D5's own test — survives, and the honest reading is
  that `needs.social` is not a measure of loneliness. It is a measure of how
  long since this NPC talked to *anyone*, roommates included, which is why it
  spends most of its life low in a shared flat. A motive worth having here
  would read time since contact **with the player specifically**, which
  nothing currently stores. Recorded as the shape any future attempt has to
  take, rather than as a door left open on the field that is already there.

- **D34 — A `cooldownTicks` is a WRAPPED DAILY WINDOW, not an elapsed
  duration, so every cooldown in the game must fit inside a day.** Found in
  Phase 6 while sweeping the rate, and it is the phase's largest finding by
  some distance. `setCooldown` stamps `currentTick`, a 0..47 index that wraps
  at midnight, and `isOnCooldown` compares a WRAPPED delta. So an entry is not
  "free again `cooldownTicks` after it fired" — it is free during a fixed daily
  clock window, `ticksPerDay - cooldownTicks` wide, anchored at whatever tick
  it last fired on. Two consequences, and both were live:

  1. **At or above `CLOCK.ticksPerDay` (48) the window is empty and the entry
     is on cooldown FOREVER.** Three were: `knock_player` (96),
     `propose_player` (48) and `gift_to_player` (96). All three fired exactly
     **once per NPC per game** while their own comments promised "two in-game
     days", "a full day" and "~2 game days". Fixing `propose_player` alone took
     the channel from 30 to 110 firings over 12 households × 7 days.
  2. **From about half a day up the surviving window can fall entirely inside
     hours the entry's own `blockFilter` excludes,** which is the same failure
     reached gradually. Measured twice, independently: `propose_player` at 24
     ticks left **4 of 24 residents unable to ever propose** against 1 of 24 at
     20, and `do_laundry` fires an identical **8 times at each of 24, 30 and
     36** — a constant that has stopped responding to its own value is the
     signature.

  This is **D26's own finding in the one place D26 did not reach** ("a tick
  index is a 0..47 per-day value that wraps at midnight, so it cannot measure
  an age"), and it is Plan 3's documented cooldown bug half-fixed: that fix
  removed the negative-delta case and left the fixed-window semantics.

  **What Phase 6 did about it, and what it deliberately did not.** It brought
  every cooldown under the bound and asserted the CLASS in `verify-i6` rather
  than the three instances — the hard bound over both tables (provable), the
  half-day bound over `OVERTURE_DEFS` (measured, so asserted only where this
  plan owns the numbers, and merely reported for `do_laundry`). It did **not**
  fix the mechanism. Making a stamp measure real elapsed time means giving it a
  day, which changes `setCooldown`'s signature, both readers, and three
  harnesses that read the stamp as a bare number — that is a change to Plan 3's
  cognition layer, not a tuning pass, and it is flagged in Blockers rather than
  improvised in the plan's last phase. Until it happens, **a cooldown longer
  than half a day is not expressible in this game**, and the harness is what
  stops the next one being written.

- **D21 — The rate is tuned last, by measurement, per NPC per day.** Plan 3's
  Phase 5 is the precedent: constants set by arithmetic came out wrong in both
  directions in three prior plans. "How often is too often" is a feel judgement
  with a number as its proxy, and the legible unit is overtures per NPC per day
  rather than per npc-tick.

---

## Data model

### `npc.overture` (Phase 3) — the one social act this NPC is making

**Built.** As shipped:

```js
{
  overtureId: 'approach_player',  // the OVERTURE_DEFS key — what candidateDef resolves
  channel: 'approach',            // 'approach' | 'text' | 'propose' | 'knock'
  motive: 'curiosity',            // which of D4's sources won
  motiveRef: { factId: 12, topic: 'the broken mug' },  // what specifically
  targetId: 'player',             // who it is aimed at
  openedDay: 3,                   // D26 — a DAY, because a tick index wraps
  ticksLeft: 2,                   // D26 — a countdown, for the same reason
  status: 'pending',              // stored; 'engaged' | 'refused' | 'lapsed' are stamped on the record resolveOverture RETURNS
  tone: 'warm',                   // D12's two paths: 'warm' | 'charged'

  // Phase 4, and PRESENT ONLY on the propose channel — the one overture about
  // the future, which has to be able to name when. Picked in the tick by
  // proposeTerms; the commitment itself is not created until the player says
  // yes, which is what makes "a declined or lapsed proposal leaves no orphan
  // record" a property of the control flow rather than of a sweep.
  proposal: { kind: 'hangout', day: 2, tickStart: 38, tickEnd: 42, roomId: 'living_room' },
}
```

An optional field rather than a null on the other three records: absent already
means none everywhere else here (`resolveOverture` deletes rather than nulls),
so a `proposal: null` on a knock would be the one place in this record where it
did not. `verify-i4` asserts every channel's key set exactly.

Absent means no overture. Never an empty object. Four named writers in one file
(D19) — `openOverture` builds, `resolveOverture` stamps-and-deletes,
`lapseOverture` is the no-cost ending, `ageOverture` counts it down.

Two things the shipped version pins down that the sketch did not. `openedTick`
became `openedDay` + `ticksLeft`, because a 0..47 index that wraps at midnight
cannot measure an age (D26). And `status` has readers on both sides rather than
one stored value nothing asks about: `'pending'` is what `isOverturePending`
tests, and the three terminal values live on the record `resolveOverture`
returns, which is how `ui.js` knows whether D10's economy applies.

### `DRIVE_DEFS[id].expresses` (Phase 1) — the standing emotional trace

**Built.** As shipped:

```js
expresses: {
  signal: 'sighing',
  when: { mood: { below: EXPRESSION_MOOD.low } },   // D23: from EXPRESSION_SOURCES, fails closed
  intensity: SIGNALS_EMIT.sighing,
}
```

or, in priority order (D22 — first match wins, at most one fires):

```js
expresses: [
  { signal: 'cabinet_slam', when: { mood: { below: EXPRESSION_MOOD.veryLow } }, intensity: SIGNALS_EMIT.cabinetSlam },
  { signal: 'humming',      when: { mood: { above: EXPRESSION_MOOD.high } },    intensity: SIGNALS_EMIT.humming },
]
```

Optional, and deliberately the same shape as `emitsSignal` and `leaves` (D3):
declared on the act already happening, applied beside them, costing no tick.
The signal propagates through Plan 1 unchanged — an NPC sighing in the kitchen
is heard from the hall at attenuated intensity, and whether the player
investigates is their business.

Two things the shipped version pins down that the sketch did not. Thresholds
come from `EXPRESSION_MOOD` rather than being written inline, so the layer's
rate has one lever for Phase 6 (`verify-i1` asserts no entry has its own
literal). And a drive whose resolution is CUSTOM cannot carry one unless its
resolver applies it — only `resolveStandardDrive` and `tryEatFood` do, which
is the same defect class as Plan 3's deleted `sleep_recover` bed trace: a
footprint declared on a path that cannot apply it never fires and never
errors.

### `OVERTURE_DEFS` (Phase 3) — `config.js`

**Built.** As shipped:

```js
approach_player: {
  channel: 'approach',
  motives: ['curiosity', 'grievance', 'affection', 'desire'],
  blockFilter: ['leisure', 'evening', 'wind_down', 'morning'],
  cooldownTicks: OVERTURE.cooldownTicks,
  requiresAdjacent: true,                    // D26 — same room OR one step
  doNotDisturb: ['sleeping', 'showering', 'masturbating', 'in_conversation', 'locked_door'],
  activityOverride: 'waiting to talk to you',
  utility: {
    baseAppeal: 0.30,
    motive: { weight: OVERTURE.motiveWeight },
    holdTicks: OVERTURE.lapseTicks,
    temperamentWeights: { assertiveness: 0.25 },
  },
}
```

Scored by Plan 3's `scoreDrive` with a `utility.motive` term in place of
`utility.need` (D5) — and `blockFilter`, `cooldownTicks`, `activityOverride`,
`utility.baseAppeal` and `utility.temperamentWeights` are the SAME fields read
by the SAME code that reads them off a `DRIVE_DEFS` entry, through
`candidateDef`. That is what makes this a sibling table rather than a parallel
one: neither can grow its own idea of what a cooldown or an appeal means.

`locked_door` and `activityOverride` are additions, both with their reader in
the phase. `temperamentWeights` is one axis on purpose — disinhibition already
differentiates the desire path (D12) and openness already differentiates the
curiosity one (rumination grows curiosity by it), so a second copy of either
here would be double-counting.

---

## Implementation phases

### Phase 1 — The expression layer — **DONE 2026-08-12**

**Goal:** the flat sounds and looks occupied. An NPC's mood leaks into the
world through signals the player can perceive, with no new UI and no tick cost.

**Shipped.** 11 rules across 9 drives, three new transient sound signals, and
`npcDisinhibition`. 0.607 expressions per NPC per day over 12 households × 7
days, reaching 36 of 36 residents. `verify-i1.js` (71 assertions) and a new
EXPRESSIONS section in `measure-signals.js`. `computer.js` was also edited —
D11 required its inline copy of the `deviantLevel` arithmetic to be deleted in
favour of the shared one. Every number is in the Handoff with what produced it.

**Files:**
- `src/srcfiles/config.js`: an `expresses` field on the `DRIVE_DEFS` entries that should carry one, and new `SIGNAL_DEFS` entries for the emotional channels (sighing, humming, a slammed cabinet). Salience set so a sigh is noticeable in the room and not through a closed door.
- `src/srcfiles/drives.js`: apply `expresses` beside `emitsSignal` and `leaves`, so a drive's full footprint stays readable in one place.
- `src/srcfiles/sim.js`: `npcDisinhibition(npc)` (D11), extracted beside `npcCuriosity`. Phase 1 is where it lands because it is pure and testable in isolation; Phase 2 is its first consumer.
- `dev/verify/verify-i1.js`: the harness.

**Verification:** harness. Every `expresses` entry names a real signal and a real condition; an NPC in a bad mood emits and a contented one does not; the signal attenuates through doors like any other (reuse `verify-s*`'s technique); nothing is stored, so nothing needs cleaning up. `npcDisinhibition` spans a real range across a generated cast and respects a baked `deviantLevel` when present. Run `measure-signals.js` and confirm the emotional channels propagate the distance intended.

### Phase 2 — Making the dead sources live — **DONE 2026-08-12**

**Goal:** the four motivation sources that read zero start accruing, and the
flag named `mayInitiate` gets a reader.

This is the phase the Evidence exists for. Skipping it ships an initiative
system with one working motivation.

**Shipped.** `EVENT_EMOTION` (16 entries) and `stampEventParticipants` give
ambient episodes both D15 fields; facts go 0 → 233 and open questions 0 → 33
over 12 households × 7 days, reaching 36 of 36 and 19 of 36 residents against a
counterfactual written the old way that still yields 0 and 0. Two of Plan 4's
D7 rules needed correcting to get there (D24, D25) — the fields alone were
necessary and not sufficient, and the growth is now bounded by the flat's pair
count and the tag vocabulary rather than unbounded. `npcInitiativeGate` (D12)
replaces the inline conjunction, and D13's tension override is `highDesire`'s
first reader in the flag's life. `rumination.js` was edited beyond the Files
list below, for D24/D25. `verify-i2.js` (57 assertions). Every number is in the
Handoff with what produced it. **Grievance, affection and desire are still 0** —
Phase 2 moved the knowledge sources only, and Phase 3 must treat the
relationship ones as cold.

**Files:**
- `src/srcfiles/ui.js`: `advanceAndResolve`'s episode writer passes `participants` and `emotionalTag` (D15). The event already knows who was in the room and what kind of thing happened.
- `src/srcfiles/npc.js` / `src/srcfiles/rumination.js`: confirm the D7 inference rules fire once the fields arrive — this is a *measurement*, not an assumption. If they still do not, the finding goes in the Handoff and the threshold work happens here rather than in Phase 6.
- `src/srcfiles/ui.js` + `src/srcfiles/config.js`: `mayInitiate` becomes personality-scaled (D12) — the conjunction is replaced by two paths, warm and charged, with the affection and comfort requirements scaled by `npcDisinhibition`. `highDesire` gets a reader or is deleted (D20).

**Verification:** harness plus the instrument. Open-question and fact occupancy over 12 households × 7 days goes from 0 to non-zero — the assertion is a *band*, set by running it. Two casts differing only in disinhibition reach `mayInitiate` at measurably different relationship states, and a maximally inhibited NPC still requires the full authored conjunction. The Evidence trap (`resolveBatch` writes no episodes) is reproduced in the harness so nobody measures this wrong twice.

### Phase 3 — The overture — **DONE 2026-08-12**

**Goal:** an NPC crosses the room and opens.

**Shipped.** `OVERTURE_DEFS` is scored by Plan 3's `scoreCandidates` in the
same ranked list as every drive (D1), so one winner per npc-tick makes design
invariant 2 structural; `npc.overture` has four named writers in one file
(D19); D9's do-not-disturb set blocks on all five of its entries and fails
closed on a sixth; D10's refusal economy costs less each time AND makes the
next overture less likely, on one shared curve; and `mayInitiate` finally
decides something (D20). Two judgement calls became D26 and D27, the second of
them after the harness measured 95 npc-ticks of an NPC holding both records.
`sim.js` was edited beyond the Files list below, for D27 and the merge carry.
`verify-i3.js` (89 assertions). Every number is in the Handoff with what
produced it. **Grievance, affection and desire are still 0 in play** — Phase 3
wired them and exercised them directly; only curiosity reaches the player
unaided.

**Files, as shipped** (the signatures are the real ones — grep these, not the
Phase 3 sketch a previous revision of this list carried):
- `src/srcfiles/overture.js`: **new**, loaded after `cognition.js` in `main.html` AND in `dev/verify/loadgame.js`'s `ORDER`. `scoreOvertures(npc, npcId, gameState, ctx)` / `bestMotive` / `chooseOverture(choice)` / `overtureRefusalScale(npc, day)` (pure), `openOverture` / `resolveOverture` / `lapseOverture` / `ageOverture` (the named writers, D19) plus `noteOvertureRefused` and `isOverturePending`, and `overtureAllowed(gameState, overtureId)` implementing D9's gate over the `OVERTURE_DND_SOURCES` registry.
- `src/srcfiles/config.js`: `OVERTURE` (tuning, including D10's refusal economy), `OVERTURE_DEFS` with the `approach_player` entry, `OVERTURE_APPROACH_TEMPLATES` and `OVERTURE_REFUSAL_FACTS` (D12's two paths made visible).
- `src/srcfiles/drives.js`: `candidateDef(id)` — the one lookup across both tables — and the overture branch in `evaluateDrives`, which returns before `openPursuit` can run.
- `src/srcfiles/cognition.js`: the motive scoring term (D5) and the merged candidate list, so an overture competes with ordinary drives on one scale and one chooser picks between them.
- `src/srcfiles/sim.js`: **not in the original list, and required.** `ageOverture` beside `agePursuit`, the `npcUpdates[id].overture` merge carry, and D27's hold branch.
- `src/srcfiles/ui.js`: the three endings and the narration — `narrateOvertureArrivals`, `overtureOpeningLine`, `applyOvertureRefusal`, `refuseOverturesInRoom`, and D9's `_inConversation` flag set in `doTalk` and cleared in `closeConversationOverlay`.
- `dev/verify/verify-i3.js`: the harness. `dev/verify/verify-c1.js` needed a one-line guard — see the Handoff.

**Verification:** harness, plus a browser pass for the `ui.js` half the Node suite cannot reach. An overture never fires inside the do-not-disturb set. `npc.overture` has exactly one writing file (source scan, the `verify-c2` technique). Refusing three times in a row moves the relationship less each time and leaves three facts. A pursuit and an overture never both resolve in one npc-tick — measured over 12 households × 7 days rather than argued, which is what caught D27. Scoring stays pure and model-free (snapshot + stubbed `generateText`).

### Phase 4 — The other three channels — **DONE 2026-08-13**

**Goal:** `text_player` says something real; an NPC proposes; an NPC knocks.

**Shipped.** Three new `OVERTURE_DEFS` rows and no new machinery — one scorer,
one record, four named writers, and nothing anywhere branching on the channel
name. Candidacy became a named predicate from a registry (D29) so three channels
can want three different geometries, with `requires` reading that same registry
the other way up: the state that BLOCKS an approach is the state that ENABLES a
knock. `text_player` left `DRIVE_DEFS` entirely (its id would otherwise have
collided and made the overture unreachable) and took its seven hardcoded strings
and its dead `sendsIm` reader with it; `commitments.js` gained a second kind and
a proposer who is never polled; and two channels got the response surface D8
said they needed, while the approach kept needing none. `render.js` and
`tracker.js` were edited beyond the Files list below. `verify-i4.js` (67
assertions), and five older harnesses moved — every one recorded in the Handoff
with which half was wrong. **The phase cost the social-need text**, which is
parked as an open question rather than improvised around.

**Files, as shipped:**
- `src/srcfiles/config.js`: `OVERTURE`'s three new cooldowns; `OVERTURE_TEXT_TEMPLATES` / `OVERTURE_KNOCK_TEMPLATES` / `OVERTURE_PROPOSE_TEMPLATES` and the two per-channel refusal-fact tables; the `knocking` `SIGNAL_DEFS` entry and its `SIGNALS_EMIT` intensity; `COMMITMENT_KINDS`; the three new `OVERTURE_DEFS` rows and `approach_player`'s move from `requiresAdjacent` to `proximity`. `DRIVE_DEFS.text_player` deleted.
- `src/srcfiles/overture.js`: `OVERTURE_PROXIMITY`, the `requires` leg of `overtureAllowed`, `proposeTerms`, `overtureTextLine`, `overtureWaitRoom`, `overtureRespondTargets`, and `openOverture`'s optional `proposal`.
- `src/srcfiles/drives.js`: the overture branch's three declarative deliveries. The `drive.sendsIm` resolver deleted.
- `src/srcfiles/sim.js`: the hold branch asks `overtureWaitRoom`; `resolveScheduleActivity` takes its block from `COMMITMENT_KINDS` and reports the kind; `resolveTick` relocates on `commitmentRoomId` rather than on `block === 'meal'`.
- `src/srcfiles/commitments.js`: `kind` + `proposerId` on `createCommitment`, `activeCommitmentFor` across kinds.
- `src/srcfiles/ui.js`: `doOvertureRespond`, the two dispatcher cases, per-channel arrival narration and opening lines, the per-def refusal fact.
- `src/srcfiles/render.js`: **not in the original list, and required** — the two response chips at the top of the Social group.
- `dev/verify/verify-i4.js`: the harness.

**Verification:** harness for the state machine (a proposal accepted binds the NPC's schedule exactly as a meal does; declined and lapsed proposals leave no orphan record), browser for the two new surfaces. Both done; the browser pass is written up in the Handoff.

### Phase 5 — Shared activities — **DONE 2026-08-13**

**Goal:** things to do *with* someone, and the observations they produce.

**Shipped.** Ten `shared` fields on the ten `self.*` entries that already
existed (D17) and no parallel table — one resolver, one participant predicate,
one narration path, and nothing anywhere branching on which activity it is. The
delta is scaled by the action's own minutes and capped per NPC per day (D31),
which makes D16's "does not dominate" a derived bound rather than an argument:
a whole day at the cap moves an axis less than one judged conversation window.
The fact is minted once per activity per NPC (D32), bounding this source at ten
against `BELIEF.maxFacts` 60. `config.js` was edited beyond the Files list
below, and so were three `ACTION_DEFS` entries that had **no `timeCost` at
all** — `self.workout`, `self.play_games` and `self.study` threw out of
`executeAction` before this phase, and all three are activities D17 makes
shareable. **This is the first non-conversation writer of `affection` /
`comfort` / `trust` in the game**, which is Phase 6's to look at. `verify-i5.js`
(66 assertions). Every number is in the Handoff with what produced it.

**Files, as shipped:**
- `src/srcfiles/config.js`: **not in the original list, and required** — `SHARED_ACTIVITY` (the three named rates, the daily cap, the exclude registry, the fact record's band and confidence), plus `ACTION_TUNING.workoutMinutes` / `.gamesMinutes` / `.studyMinutes`.
- `src/srcfiles/defs.actions.js`: the ten `shared` entries; `timeCost` on the three that had none; `presentResidentAffection` rewritten to read the shared participant list; `watchTvNarration` deleted.
- `src/srcfiles/actions.js`: `sharedActivityParticipants`, `sharedActivityCredit`, `sharedActivityDelta`, `resolveSharedActivity`, `sharedActivityNames`, the `narrateAction` shared branch, and the one call site in `executeAction`.
- `dev/verify/verify-i5.js`: the harness.

**Verification:** harness plus a browser pass for the `executeAction` half the
Node loader cannot reach (it awaits `advanceAndResolveMinutes`). Both done; the
browser pass is written up in the Handoff.

### Phase 6 — Tune to a rate that feels right — **DONE 2026-08-13**

**Goal:** overtures per NPC per day land where the flat feels alive rather than
demanding.

**Shipped.** The instrument, one retune, and one bug that turned out to be
larger than the retune. `measure-initiative.js` reads six arms, the gate, the
endings, the feedback loop, five sweeps and the loneliness distribution;
`verify-i6.js` (22 assertions) asserts the class the bug belongs to. **Four
constants moved, and two of them were not tuning at all** — `propose_player`
and `knock_player` (and `gift_to_player`, outside this plan) had cooldowns at
or above `CLOCK.ticksPerDay` and were therefore firing **once per NPC per
game** (D34). The tuning proper is one number: `textCooldownTicks` 12 → 16,
which took the cast from 2.456 to 1.742 overtures per NPC per day at the
affection ceiling and from 1.504 to 0.544 at a player who is not in the flat,
without moving the in-person channels. Two open questions were settled with
numbers rather than left parked (D35, D36) and four new ones opened, three of
them created by being able to see the system for the first time.

**Files, as shipped:**
- `src/srcfiles/config.js`: `OVERTURE.textCooldownTicks` 12 → 16, `.proposeCooldownTicks` 48 → 20, `.knockCooldownTicks` 96 → 20; `NPC_GIFT_TUNING.cooldownTicks` 96 → 20 (**not in the original list, and required** — same broken class, same file, and the class assertion could not be written while it stood); `propose_player.utility.baseAppeal` left at 0.34 with its justification rewritten, because that justification was a cooldown that never elapsed.
- `dev/verify/measure-initiative.js`: the instrument.
- `dev/verify/verify-i6.js`: the harness.
- `dev/verify/README.md`: both new rows.

**Not changed, and each is a result:** the do-not-disturb lists (every entry
resolves, every entry is used, and the gate blocked 4,260 otherwise-ready
overtures on the sleeping arm — it is doing real work), the refusal constants
(a week of refusing everything costs 0.109 affection and cuts the rate 56%,
which is D10's self-limiting curve behaving), `OVERTURE.motiveWeight` at 0.50
(swept 0.25–0.90, smooth, and 0.50 is the knee before it steepens), and both
`baseAppeal` figures.

**Verification:** the instrument on 12 × 7, `verify-i6`, the whole suite at
1,324, and the browser. The feel pass is written up in the Handoff and it is
what confirmed the number.

---

## Status

**COMPLETE — all six phases done, 2026-08-13.** Decisions locked D1–D36.

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** 2026-08-12 | `expresses` — mood leaks into the world as perceivable signal; `npcDisinhibition`. 11 rules, 3 signals, 0.607 expressions per NPC per day. `verify-i1.js`, 71 assertions |
| 2 | **Done** 2026-08-12 | D15's episode fields — facts 0→233 and open questions 0→33 over 12×7, 36/36 residents, bounded by construction; `npcInitiativeGate` (D12) and D13's tension override give `highDesire` its first reader. `verify-i2.js`, 57 assertions |
| 3 | **Done** 2026-08-12 | `npc.overture` — scored by Plan 3's one scorer, committed by four named writers, gated by D9's set, refusable. 0.056 overtures/NPC/day untouched, 0.889 at affection 0.9, `charged` reachable from comfort/affection 0.20. `verify-i3.js`, 89 assertions |
| 4 | **Done** 2026-08-13 | The other three channels, as `OVERTURE_DEFS` rows rather than code paths. `text_player` left `DRIVE_DEFS` and texts about its motive; `propose_player` books a `hangout` commitment that binds like a meal; `knock_player` reaches a player behind a locked door. 0.056 → 0.119 overtures/NPC/day untouched; an away player and a shut door go from 0 to reachable. `verify-i4.js`, 67 assertions |
| 5 | **Done** 2026-08-13 | Ten `shared` fields on the ten `self.*` entries, not a parallel table. Delta scaled by minutes and capped per NPC/day — a whole day at the cap (0.05) moves less than one judged conversation window (0.20); one witnessed fact per activity per NPC, ten against `BELIEF.maxFacts` 60. Reachability 0.2%–32.0% by activity over 12×7. Fixed three `ACTION_DEFS` entries that had no `timeCost` and threw out of `executeAction`. `verify-i5.js`, 66 assertions |
| 6 | **Done** 2026-08-13 | Tune the rate by measurement. `measure-initiative.js` (six arms, the gate, the endings, the feedback loop, five sweeps, the loneliness distribution). One tuning change — `textCooldownTicks` 12 → 16, taking the affection ceiling from 2.456 to 1.742/NPC/day and an absent player from 1.504 to 0.544 — and D34, which found `propose_player` (48), `knock_player` (96) and `gift_to_player` (96) firing **once per NPC per game** because a cooldown stamp wraps at midnight. D35 and D36 settle Phase 5's and Phase 4's parked questions with numbers. `verify-i6.js`, 22 assertions |

---

## Dependency order

```
Phase 1 (expressions) ──► Phase 3 (the overture) ──► Phase 4 (channels)
                     │                          └──► Phase 5 (shared activities)
Phase 2 (motivation) ─┘                                        │
                                                               └──► Phase 6 (tune)
```

**Phase 2 before Phase 3, always.** An overture system built on motivation
sources that read zero is a system that cannot be measured and will look
correct in a harness while doing nothing in play. This is the same invariant
Plan 3 encoded as "the scorer must be a computed thing before it is a decision".

**Phase 1 is independent** and ships first by D7 — it needs only `mood`, and it
is the only phase that delivers visible value before Phase 2 lands.

**Phase 6 is always last.** Phases 3, 4 and 5 all change what scores what.

---

## Open questions (parked, none blocking)

- **Should NPCs make overtures to each other?** Everything in this plan is
  NPC→player. NPC→NPC overtures would make the flat feel inhabited when the
  player is not in the room, but nothing would ever observe them except through
  Plan 4's gossip. Raised for Phase 5 and still open — Phase 5 built the
  player's half of "doing something together" and touched nothing NPC→NPC.
  `chat_with_roommate` already carries an NPC→NPC `relDelta`, so the shape
  exists; what does not is anything that would make the player aware of it.

- **Should a charged proposal exist, now that shared activities do?** D30
  declined it in Phase 4 and the Phase 5 revisit did not change the answer: a
  hangout's outcome is keyed to the ACTIVITY's tier (D31), not to the tone of
  the proposal that produced it, so a charged proposal would book the same
  hangout and pay the same delta — two labels on one path, which is what D12
  forbids. It becomes answerable the moment there are charged-specific shared
  outcomes, and that is `contentFlags.mature` territory (D14) and the user's
  call, not an inference a phase should make on its own.

- **Does the player get a way to signal availability?** A "do not disturb"
  the player controls, rather than one inferred from their state (D9).

- **Should a cooldown be able to span more than a day?** Phase 6's D34: it
  cannot, and three entries in the game were written as though it could. The
  fix is to make the stamp carry a day so `isOnCooldown` measures elapsed time
  rather than a wrapped index — which changes `setCooldown`'s signature, both
  of its readers, and three harnesses that read the stamp as a bare number.
  That is a change to **Plan 3's cognition layer**, not to this plan, and it is
  the single highest-value follow-up either plan has left: it would let
  `knock_player` have the two days it asked for, `gift_to_player` the "~2 game
  days" its comment claims, and `do_laundry` a rate that responds to its own
  constant. `verify-i6`'s first assertion is written to fail the moment
  somebody does it, and its comment says to delete the bound rather than widen
  it.

- **Should a proposal be blocked while an accepted plan is still pending?**
  Surfaced by fixing D34, because until then nobody could see it: with
  `propose_player` firing once per NPC per game, "one open plan at a time is
  plenty" was true by accident. At a working cooldown a maxed cast proposes
  **0.437 times per NPC per day** — about 1.3 plans a day across a flat of
  three, and nothing stops an NPC proposing again the day after you said yes.
  The cooldown cannot answer this (it is a rate, and this is a *state*
  question), and the tool for it exists: `activeCommitmentFor` in
  `commitments.js` already answers "does this NPC have a live commitment with
  the player". Deliberately not improvised in a tuning phase — adding a
  candidacy condition is a behaviour change, and `proposeTerms` reads the
  proposer's schedule "deliberately without a gameState" today, so wiring it
  means deciding what a proposal should know about the diary.

- **Is `do_laundry`'s cooldown of 30 a rate anybody chose?** Phase 6 found it
  over D34's soft bound and did not touch it, because re-rating housekeeping is
  not this plan's call. Measured: 23 firings at 12, 18 at 18, then a flat 8 at
  each of 24, 30 and 36 — so its current value is not the thing deciding how
  often laundry happens. Whoever owns the chore economy should pick a number
  under 24 and mean it.

---

## Design invariants

1. **Expressions ride along; acts occupy the tick.** The split in D3 is what
   keeps Plan 3's one-action-per-tick guarantee true. An expression that starts
   consuming a tick is a bug, and the harness asserts it.

2. **One committed intent per NPC.** `npc.pursuit` and `npc.overture` must
   never both resolve in the same npc-tick. Plan 3 made the clobber impossible
   by construction; this plan must not reintroduce it by addition.

3. **The tick stays synchronous, pure and model-free.** R2. The decision is
   arithmetic; the language is generated at the moment of use.

4. **A flag nothing reads is a bug, and this plan starts with two.**
   `mayInitiate` and `highDesire` are computed today and consumed nowhere. D20
   says wire them or delete them — the failure mode is a plan that adds a third.

5. **A motivation source that reads zero is dead content.** Four of five did
   when this plan was designed, and the cause was a field mismatch nobody had
   looked for. Measure occupancy before building on a source, not after.
