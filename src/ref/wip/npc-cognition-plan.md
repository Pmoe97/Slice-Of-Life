# NPC Cognition

Status: **planned — not started**. Design session complete 2026-08-11; all
decisions locked.
Last updated 2026-08-11.

Companions:
- `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md` (the umbrella — this is Plan 3 of six, and the one that makes the cast behave like people rather than scenery).
- `src/ref/complete/perception-and-signals-plan.md` (Plan 1 — **complete**. `perceiveSignals` already runs for every NPC every tick at `drives.js`'s `evaluateDrives`; this plan turns its output from a boolean gate into a scored term).
- `src/ref/complete/npc-correctness-fixes-plan.md` (Plan 0 — **complete**. Its Phase 4 rebalanced the need economy; the two unreachable drive gates this plan fixes are the same defect class it found in the relationship model, and its `dev/verify/measure.js` is the instrument that spots them).
- `src/ref/complete/scene-reader-ui-plan.md` (Plan 2 — **complete**. The scene reader's presence lines are where an NPC's chosen activity becomes visible, so this plan's output has a reader from day one).

Paired session prompt: `src/ref/wip/npc-cognition-handoff-prompt.md` — hand
that to an agent verbatim each session; it holds *how to work*, this holds
*what to build*.

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session.

---

## Handoff — read this first

**Resume at:** Phase 1. Nothing has been built yet.

**Last session's notes (design session, 2026-08-11 — no code written):**

- Four design questions were put to the user and all four answered. They are
  **D2** (target activity rate), **D5** (interruption model), **D7**
  (personality authoring) and **D9** (the dead gates). The rest follow from
  those plus R2/R8.
- **The roadmap's thesis for this plan is wrong about the primary defect, and
  the Evidence section below is the correction.** The roadmap leads with
  "an NPC can eat, shower, clean the kitchen and start a conversation in the
  same tick". Measured across 12 households × 7 in-game days: that collision
  happens in **1.0%** of npc-ticks. The real defect is that an NPC with
  something to do **does nothing 82.6% of the time**. Do not re-derive this;
  do not "fix" the thesis back toward the roadmap's version.
- **The instrument that produced every number in Evidence is already in the
  repo**, at `dev/verify/measure-cognition.js`. It was landed during the design
  session rather than left in a scratchpad, for the same reason Plan 2 moved
  its harnesses in: a scratchpad dies with the chat, and an Evidence section
  nobody can re-run is an Evidence section nobody can trust. Run it before you
  change anything — `node dev/verify/measure-cognition.js` — and it should
  print Evidence back to you verbatim. If it does not, something has already
  moved and that is your first finding.
- **Two measurement traps, both of which I fell into and corrected.** Written
  down so the next session doesn't lose an hour to them:
  1. `resolveBatch(gameState, ticks)` **returns `{ state, events, peepResults }`
     and does not mutate its argument** (`sim.js`, end of `resolveBatch`).
     Reading `g.npcs` after calling it gives you the untouched original, and
     every need reads as a flat 50.
  2. Measuring on a freshly generated house makes `clean_common` and
     `investigate_smell` look dead. They are not — on a deliberately dirtied
     house they fire at 4/29 and 100/102 respectively. What is actually true
     is that **the apartment never gets dirty on its own** (see Evidence),
     which is what Phase 4 exists to fix.
- **Naming collisions to design around, both live:** `src/srcfiles/commitments.js`
  already owns the word *commitment* (meal and social commitments, with
  `activeCommitmentFor` / `createCommitment`), and `src/srcfiles/intent.js` is
  the **player's** free-text intent classifier (`classifyIntent`), nothing to
  do with NPCs. This plan therefore uses **`pursuit`** for the committed
  action and puts everything in a new `src/srcfiles/cognition.js`. Do not
  reuse either taken word.
- **`evaluateDrives` already has five exceptions to its own model.**
  `isPeepDrive`, `isSnoopDrive`, `isEatDrive`, `isInvestigateDrive` and
  `isGiftDrive` each bypass the weight roll with a custom resolver. The
  "independent coin flip" design is already half-abandoned in practice; this
  plan finishes the job rather than introducing a foreign idea.
- **The personality precedent to copy is `INTERRUPTION.personalityWeights`**
  (`config.js`), consumed in `interruption.js` as
  `p *= 1 + Σ(temperament[axis] * weight[axis])` against
  `npc.bible.temperament` — the numeric vector `{ warmth, volatility,
  openness, conscientiousness, assertiveness, selfAwareness }`. `SNOOP_TUNING`
  does the same thing a second way. Do not invent a third idiom.

**Blockers / flagged deviations:** None.

---

## The thesis

The people in the apartment are not doing anything. Not metaphorically —
measurably.

An NPC takes a self-directed action roughly **once every six in-game hours**.
Not because they have nothing to do: 40% of the time they have at least one
drive that has passed every gate, cleared its cooldown and is sitting there
eligible. They simply fail the coin flip. `do_laundry` was eligible 531 times
in seven in-game days and fired 31. `text_player` was eligible 1,219 times and
fired 38.

The mechanism is `evaluateDrives`, which walks `DRIVE_DEFS` in declaration
order and, for each drive that passes its gates, rolls `rng() > drive.weight`
and moves on. Twelve independent coin flips, most of them weighted 0.04–0.35,
each resolved in isolation. Nothing compares two candidates. Nothing carries
across a tick. The NPC has no notion of *doing one thing*, and — far more
visibly — no notion of *doing anything*.

The roadmap framed this as an arbitration problem: several drives firing at
once and clobbering each other's `activityOverride`. That does happen, and it
is genuinely wrong when it does. It happens in 1% of npc-ticks. Fixing only
that would leave a cast that still stands still 93% of the time.

Utility scoring fixes both, and fixes the larger one almost incidentally.
Score every candidate against needs, perceived signals, personality and
schedule; take the best one; **commit to it for a few ticks**. The best
candidate always wins, where a 0.05 roll almost never did. Committing is what
turns three coincidences into a plan — walking to the kitchen, cooking, and
carrying the result to someone — and what lets the scene reader say something
truthful about what a person is in the middle of.

It is also where Plan 1 finally pays off for the cast. `perceiveSignals`
already runs for every NPC every tick and its result is already handed to
every gate. Today it can only answer yes or no. Scored, a smell becomes a
*reason*, weighed against how hungry they are and how much they care about
mess.

### What this plan is *not*

- **Not a planner.** A pursuit is one action held for a few ticks, not a tree
  of sub-goals with preconditions. Multi-step behaviour emerges from a
  sequence of scored choices; if it needs a search algorithm, it is Plan 5's
  problem, not this one's.
- **Not an LLM in the tick.** R2 is the hard invariant the entire autonomy
  layer rests on. Scoring is arithmetic over state. If a decision seems to
  need the model, the decision is wrong-shaped.
- **Not a new drive table.** `DRIVE_DEFS` stays. Its sixteen entries gain a
  `utility` block and lose their booleans-as-gates; nothing is renamed or
  removed. A plan that starts by rewriting the content is a plan that never
  ships the mechanism.
- **Not the moment NPCs start conversations.** An NPC choosing to seek you out
  and *opening their mouth first* is Plan 5, and it needs Plan 4's beliefs to
  have anything to say. This plan gets them as far as walking into the room.
- **Not a rebalance of the need economy.** Plan 0 Phase 4 tuned decay and
  restore rates against drive gates and they are broadly right. Two thresholds
  are provably unreachable and get fixed (D9); the rates themselves are not
  reopened.
- **Not a visible-reasoning feature.** The player sees what someone is doing,
  never a score. Surfacing "why" is a design question for later and a very
  good way to make a simulation feel like a spreadsheet.

---

## Evidence

All figures from 12 generated households × 7 in-game days through the real
`resolveBatch`, 5,237 (npc, tick) samples. **Reproduce with
`node dev/verify/measure-cognition.js`** — it prints this entire section.

### The cast is idle, not conflicted

| | |
|---|---|
| npc-ticks where 2+ drives fired (**the collision the roadmap names**) | **1.0%** |
| npc-ticks where the NPC had ≥1 eligible drive and did **nothing** | **82.6%** |
| Mean drives fired per npc-tick | **0.08** |
| Mean drives *eligible* per npc-tick | 0.58 |

An NPC acts about once per 12.5 ticks — once every 6.25 in-game hours.

### Per drive, eligible versus fired

| drive | eligible | fired | realised | `weight` |
|---|---|---|---|---|
| `text_player` | 1219 | 38 | 3.1% | 0.04 |
| `do_laundry` | 531 | 31 | 5.8% | 0.05 |
| `chat_with_roommate` | 281 | 41 | 14.6% | 0.15 |
| `react_to_player` | 250 | 58 | 23.2% | 0.2 |
| `wash_up` | 204 | 48 | 23.5% | 0.25 |
| `shower` | 185 | 57 | 30.8% | 0.3 |
| `seek_company` | 152 | 37 | 24.3% | 0.25 |
| `seek_stimulation` | 142 | 26 | 18.3% | 0.2 |
| `eat` | 86 | 86 | 100% | 0.5 |

`eat` is at 100% because it is one of the five custom-resolver drives whose
chance is computed inside `tryEatFood` rather than by the weight roll — the
weight on its def is decorative. This is the shape the whole table is
drifting toward, one exception at a time.

### Two gates are mathematically unreachable

Observed NPC need ranges over the same run, against the gate each drive
actually declares in `DRIVE_DEFS`:

| drive | gate | observed range | verdict |
|---|---|---|---|
| `sleep_recover` | energy `< 20` | **28**..100 | unreachable |
| `seek_comfort` | comfort `< 40` | **40**..74 | unreachable by one unit |
| `eat` | hunger `< 35` | 0..79 | reachable |
| `shower` | hygiene `< 30` | 0..69 | reachable |
| `seek_company` | social `< 25` | 0..100 | reachable |

`seek_comfort`'s observed floor is *exactly* its threshold and the comparison
is a strict `<`. Both drives fired **zero** times in 84 in-game days. This is
the same defect Plan 0 found in the relationship model's bottom rung, in a
different subsystem, found the same way.

Note that `dev/verify/measure.js` already prints an "unreachable" column and
has been reporting this — but its gate values are hardcoded and have drifted
from `DRIVE_DEFS` (it prints `comfort` gate 25; the def says 40). Phase 1
repoints it at the real table rather than adding a second instrument that can
also drift.

### The apartment never gets dirty on its own

After 7 untouched in-game days on a fresh house: **0 dirty objects, 0 rot, out
of 89 objects.** NPCs ate 86 times and left nothing behind.

On a deliberately dirtied house the perception drives work fine —
`investigate_smell` fires 100/102 and `clean_common` 4/29. The machinery Plan 1
built is sound; it is simply never fed. **Every mess in the game today is made
by the player.** A cast that only ever reacts to the player's mess is a cast
that cannot have a domestic life of its own, which is what Phase 4 addresses.

### `compatibility` and `friction` are generation-only

Computed into `castWeb` in `sim.js` and read only by the cast-generation
validators `frictionPair`, `unresolvedConflict` and `alliance`. They never
influence a single runtime decision. The roadmap flagged this as an open
question; it is confirmed. See the Open questions section — this plan
deliberately does not consume them.

### Instrumentation

The technique, recorded so the numbers stay auditable even if the instrument
is rewritten. Implemented in `dev/verify/measure-cognition.js`. Wrap
`evaluateDrives` in the
`vm` context, re-run its own eligibility filter on the real arguments to
capture the candidate set, then call the original and diff the cooldown
stamps — `setCooldown` is called on exactly the firing paths, so a drive whose
stamp equals `currentTick` after the call and did not before is one that fired:

```js
const before = (npc.flags || {})[DRIVE_COOLDOWN_KEY] || {};
const res = origEvaluateDrives(npc, npcId, npcs, resolved, gameState, rng, currentTick, opts);
const after = res.updatedNpc?.flags?.[DRIVE_COOLDOWN_KEY] || {};
const fired = Object.keys(after).filter(d => after[d] === currentTick && before[d] !== currentTick);
```

This survives Phase 2's rewrite: a pursuit still sets a cooldown when it
starts.

---

## Locked decisions

### The model

- **D1 — Utility scoring replaces the independent weight roll.** Every tick,
  each candidate drive is scored to a single number; the highest scorer above
  a threshold is chosen; the rest do not happen. `drive.weight` stops being a
  probability and is retired in favour of `utility.baseAppeal`. Rationale: the
  measured failure is not arbitration, it is that twelve independent low
  probabilities produce inaction almost always (Evidence).

- **D2 — The target is roughly one self-directed action per four ticks**
  (~2 in-game hours), against 0.08 per tick today — about a 3× increase. This
  is the user's decision. Schedules still supply the baseline activity; a
  pursuit *overrides* it, so this dial controls how often an NPC visibly
  departs from their routine, not whether they are doing anything at all.
  Phase 5 tunes to it by measurement, not by arithmetic.

- **D3 — An NPC holds exactly one `pursuit` at a time.** Stored on the NPC as
  `npc.pursuit`. The `activityOverride` clobber the roadmap describes becomes
  impossible by construction rather than by convention — there is only ever
  one writer.

- **D4 — A pursuit is held for a number of ticks declared per drive**
  (`utility.holdTicks`), not a global constant. Showering is one tick; doing
  laundry is several. A single global number would either make everything
  instantaneous or make an NPC stare at a wall for two hours.

- **D5 — A pursuit breaks on a scoring margin OR a short explicit list.** A
  challenger must beat the held pursuit's *current* score by
  `COGNITION.breakMargin` to displace it, and separately, a short list of
  events always breaks it regardless of score: the player addressing them, and
  a signal at or above the scene reader's callout salience. The user's choice.
  Pure hysteresis was rejected because it couples "does she notice me" to
  weight tuning; hard commitment was rejected because an NPC who ignores you
  for four ticks because they committed to laundry is a feel bug.

### Scoring

- **D6 — A gate becomes a score term, not a boolean.** `utility.need` declares
  the need and the point at which it starts to matter; the contribution rises
  as the need falls below it. A threshold that is never crossed therefore
  produces a low score rather than an impossibility — which is why D9's fix is
  structural rather than a patch.

- **D7 — Personality enters as per-drive temperament weights.**
  `utility.temperamentWeights: { conscientiousness: 0.4, … }`, combined as
  `1 + Σ(temperament[axis] * weight[axis])`, exactly the shape
  `INTERRUPTION.personalityWeights` already uses and `interruption.js` already
  consumes against `npc.bible.temperament`. The user's choice. Temperament
  scalars were rejected for flattening distinctions within a category;
  tie-breaks only were rejected because personality barely showing is most of
  what makes a cast feel generic.

- **D8 — Perceived signals score, and they score at the perceiving NPC's own
  attenuated intensity.** The record `perceiveSignals` already returns carries
  `intensity` after distance and door attenuation; the score term uses that
  number directly. An NPC two rooms from the rot cares proportionally less,
  which is Plan 1's propagation model finally producing behaviour instead of
  a boolean.

- **D9 — The unreachable gates are fixed inside this plan, in Phase 1, by the
  conversion in D6** rather than by a separate correctness pass. The user's
  choice. A patch that moved `sleep_recover`'s threshold from 20 to 30 would
  be deleted by Phase 1 three days later; converting the gate to a curve
  removes the entire failure mode. Phase 1 additionally lands a permanent
  reachability assertion so the class cannot return silently.

### Boundaries

- **D10 — The five custom resolvers keep their resolution logic and lose their
  selection logic.** `tryNpcPeep`, `trySnoopPhone`, `tryEatFood`,
  `tryInvestigateSmell` and `tryGiveGift` still decide *what happens* when
  their drive is chosen — the peep stealth contest, which food is in the
  fridge, which room the smell is in. They stop deciding *whether* their drive
  happens; the scorer does that. This is what makes the model uniform again
  after five exceptions.

- **D11 — Nothing in this plan calls the model, and nothing in it is async.**
  R2, restated because this is the plan most likely to be tempted. Scoring
  runs inside `resolveTick` for every resident every tick; the budget is the
  same order as `perceiveSignals`' measured ~75µs per NPC.

- **D12 — `npc.pursuit` is persisted and migrated.** It survives save/load
  like any NPC field, with an absent value meaning "no pursuit", so an
  existing save simply starts making choices on the next tick. No backfill.

---

## Data model

### `npc.pursuit` (Phase 2) — the one thing this NPC is doing

```js
{
  driveId: 'clean_common',
  startedTick: 412,        // getTickIndex value at selection
  ticksLeft: 2,            // decremented per tick; 0 releases the pursuit
  roomId: 'kitchen',       // where it is being done, for a resolver that needs it
  score: 0.71,             // the score it won with — what a challenger must beat (D5)
}
```

Absent means no pursuit. Never an empty object.

### `DRIVE_DEFS[id].utility` (Phase 1) — added to every entry

```js
utility: {
  baseAppeal: 0.30,                    // the floor this drive scores at when eligible
  need: { need: 'hygiene', below: 45 },  // rises as the need falls under `below` (D6)
  signal: { signal: ['dirty_dishes', 'clutter'], scale: 0.8 },   // D8
  temperamentWeights: { conscientiousness: 0.4, warmth: 0.1 },   // D7
  holdTicks: 2,                        // how long the pursuit is held (D4)
  blockAppeal: { morning: 1.2, wind_down: 0.6 },  // schedule-block multiplier
}
```

Every key optional except `baseAppeal` and `holdTicks`. `gates` stays on the
def for the hard exclusions that are *not* preferences — a visitor allowlist,
a facility under construction — and those keep working exactly as they do now.

### A scored candidate (Phase 1) — computed, never stored

```js
{
  driveId: 'clean_common',
  score: 0.71,
  terms: { base: 0.30, need: 0.00, signal: 0.28, temperament: 0.13, block: 1.0, recency: 1.0 },
}
```

`terms` exists so a failing tuning run can be read rather than guessed at. It
is a debugging surface and has exactly one consumer — the measurement
instrument — which is R8-compliant and deliberately not rendered anywhere.

### `COGNITION` (Phase 1) — `config.js`

```js
const COGNITION = {
  actionThreshold: 0.40,   // below this the NPC carries on with the scheduled activity
  breakMargin: 0.25,       // a challenger must beat the held pursuit by this (D5)
  recencyPenalty: 0.5,     // multiplier applied to a drive done within its own cooldown
  targetActionsPerTick: 0.25,  // D2 — what Phase 5 tunes actionThreshold against
  alwaysBreak: {           // D5's short list
    playerAddress: true,   // the player talks to them
    calloutSalience: 0.70, // matches SCENE_READER.calloutSalience — one idea of "this stops you"
  },
};
```

`actionThreshold` is a **placeholder set by arithmetic and known to be
wrong** — Plan 0 Phase 4 and Plan 1 Phase 1 both had first-pass numbers come
out wrong in both directions. Phase 5 sets it by measurement.

---

## Implementation phases

### Phase 1 — The scoring layer

**Goal:** every drive can be scored to a number, the scoring is pure and
harness-tested, and the two unreachable gates are gone. Nothing selects
anything yet — `evaluateDrives` is untouched and behaviour is bit-identical.
This is deliberate: the scorer must be a computed thing before it is a
decision, which is the invariant Plan 2 was shaped around and the reason it
went as well as it did.

**Files:**
- `src/srcfiles/cognition.js`: **new**, loaded after `drives.js`. `scoreCandidates(npc, npcId, gameState, resolved, perceived)` → ranked `[{ driveId, score, terms }]`, pure, no writes, no model. `scoreDrive(drive, npc, perceived, block)` for one. Reads `npc.bible.temperament` the way `interruption.js` does.
- `src/srcfiles/config.js`: a `utility` block on all sixteen `DRIVE_DEFS` entries (D6/D7/D8), and the `COGNITION` table. `sleep_recover` and `seek_comfort` lose their unreachable `gates` need-threshold, which becomes `utility.need` — that *is* D9's fix.
- `dev/verify/verify-c1.js`: the harness. Purity, determinism, no model call, and **the reachability assertion** — for every drive, some attainable state scores it above `actionThreshold`, which is the assertion that makes D9 permanent.
- `dev/verify/measure-cognition.js`: **already exists.** Extend it to print the score distribution alongside the firing tables, so a later tuning phase can see *why* a drive is losing and not just that it lost.
- `dev/verify/measure.js`: repoint its hardcoded gate column at `DRIVE_DEFS` so it can never disagree with the table again.

**Verification:** harness. `scoreCandidates` never mutates `gameState` (snapshot compare, same technique as `verify-r34.js`'s `signalsByRoom` check) and never reaches `root.generateText` (stub it). Every drive is reachable. Two NPCs with identical state score identically; one with a different temperament scores differently on a drive that declares `temperamentWeights`. Run `measure-cognition.js` and confirm it reproduces the Evidence numbers against unchanged behaviour — if it does not, the instrument is wrong and Evidence is not, since these numbers came from that exact technique.

### Phase 2 — Choice and commitment

**Goal:** an NPC picks one thing and does it for a few ticks. `npc.pursuit`
exists, is persisted, and is the only writer of `activityOverride`.

**Files:**
- `src/srcfiles/cognition.js`: `choosePursuit(gameState, npcId, candidates)` → the winner or null (pure — returns, does not write). `openPursuit(gameState, npcId, choice)` and `releasePursuit(gameState, npcId)` as the named writers beside it, following `openScene`/`markCalloutsShouted`. `shouldBreakPursuit(gameState, npcId, candidates, events)` implementing D5's margin and short list.
- `src/srcfiles/drives.js`: `evaluateDrives`'s weight-roll loop (`if (rng() > drive.weight) continue;`) is replaced by score → choose → commit. The five custom-resolver dispatches stay as *resolution* (D10): a chosen drive with `isEatDrive` still routes into `tryEatFood`. The `gates` hard-exclusion filter, the visitor allowlist and the facility check stay exactly as they are.
- `src/srcfiles/sim.js`: `resolveTick` decrements `ticksLeft` and releases expired pursuits before drives are evaluated. **Top-of-phase note:** `resolveBatch` returns new state and the NPC merge at its end is the same one Plan 0 had to fix for memory replacement — check `npc.pursuit` actually survives a tick before building on it.
- `src/srcfiles/state.js`: `pursuit` in the NPC schema, optional, default absent (D12).

**Verification:** harness. Over a long run, 2+ drives never fire in one tick — the 1.0% collision goes to exactly 0, by construction. A pursuit with `holdTicks: 3` occupies three consecutive ticks and is not re-chosen each one. The player addressing an NPC breaks a pursuit that a merely-higher score would not have. Save/load round-trip preserves a mid-flight pursuit. The measured actions-per-tick rises; do **not** tune it here.

### Phase 3 — Personality differentiation

**Goal:** two NPCs in the same room with the same needs behave differently,
and the difference traces to their temperament rather than to the RNG.

**Files:**
- `src/srcfiles/config.js`: `temperamentWeights` filled in on the drives that deserve them — chores against `conscientiousness`, social drives against `warmth` and `assertiveness`, `seek_stimulation` against `openness`, the snoop/peep drives against the `openness`/low-`conscientiousness` pair `SNOOP_TUNING` already uses. Not every drive gets one; a drive with no weights is one where personality genuinely should not matter.
- `dev/verify/verify-c3.js`: the differentiation harness.

**Verification:** harness, and it must assert the *effect*, not the arithmetic. Generate two casts differing only in one temperament axis, run both for several in-game days, and assert the chore share correlates with `conscientiousness` in the expected direction and by a margin larger than the run-to-run spread. Assert an NPC at the extreme of an axis still does the other things sometimes — a conscientious NPC who *only* cleans is a bug, not a personality.

### Phase 4 — Closing the loop

**Goal:** NPC actions leave traces the world can be perceived through, so the
perception term in D8 has something to score in a house the player has not
touched.

This phase is a deliberate scope addition the roadmap thesis does not name.
It is here because of the Evidence: after seven untouched in-game days there
are zero dirty objects and zero rot in the entire apartment, so D8's signal
term — the whole reason Plan 1 is this plan's dependency — scores 0 forever
unless the player personally makes a mess.

**Files:**
- `src/srcfiles/config.js`: a `leaves` field on the `DRIVE_DEFS` entries that should dirty something, mirroring the existing `emitsSignal` shape so a drive declares its trace rather than being special-cased. Eating leaves dishes; cooking leaves more.
- `src/srcfiles/drives.js`: apply `leaves` where `emitsSignal` is already applied, so the two live side by side and a drive's full footprint reads in one place.

**Verification:** harness plus the instrument. Seven untouched in-game days now end with a non-zero, non-absurd amount of mess — the assertion is a *band*, not a value, and the band is set by running it. `clean_common` and `investigate_smell` go from never firing on an untouched house to firing sometimes. Confirm the house does not spiral: a household of tidy NPCs should trend clean, an untidy one should trend dirty, and neither should saturate within a week.

### Phase 5 — Tune to the target rate

**Goal:** the measured rate of self-directed actions is D2's ~0.25 per
npc-tick. Last, because every earlier phase changes the number.

**Files:**
- `src/srcfiles/config.js`: `COGNITION.actionThreshold`, `breakMargin` and `recencyPenalty` set by measurement. Per-drive `baseAppeal` adjustments where one drive dominates the mix.
- `dev/verify/measure-cognition.js`: extended to print the drive mix and the actions-per-tick against the target.
- The plan's Handoff: **record every number with what was measured to get it.** Several constants in this codebase were wrong on the first pass in both directions and the next person needs to know a number was observed rather than reasoned.

**Verification:** the instrument, across at least 12 households × 7 in-game days — the same population Evidence used, so before and after are comparable. Actions per npc-tick within tolerance of 0.25. No single drive above a reasonable share of all actions. Every drive still fires sometimes (the Phase 1 reachability assertion, now against real selection). Then play it in the browser: walk around a house for an in-game day and confirm the roommates read as busy rather than frantic — the number is a proxy for a feel judgement, and the feel judgement wins.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | Not started | `cognition.js` + `scoreCandidates` + `utility` blocks + `COGNITION`. Pure, tested, nothing selects with it. Fixes the two unreachable gates (D9) |
| 2 | Not started | `npc.pursuit` — score, choose one, commit for `holdTicks`, break on margin or the short list (D5) |
| 3 | Not started | `temperamentWeights` — personality visibly differentiates the drive mix |
| 4 | Not started | NPC actions leave perceivable traces, so the signal term has something to score |
| 5 | Not started | Tune to ~0.25 self-directed actions per npc-tick (D2), by measurement |

---

## Dependency order

```
Phase 1 (scoring) ──► Phase 2 (choice + commitment) ──► Phase 3 (personality)
                                    │                          │
                                    └──► Phase 4 (traces) ──────┴──► Phase 5 (tune)
```

**Phase 1 before Phase 2, always** — same reason Plan 2 put `composeScene`
before the renderer. A scorer written inside the selection loop is a selection
loop full of logic, and it cannot be tested.

**Phase 5 is always last.** Phases 3 and 4 both change what scores what;
tuning before them means tuning twice. Phases 3 and 4 are independent of each
other and may run in either order.

Phase 4 is the one phase that could be cut without breaking the others — the
plan still works, it just only ever reacts to the player's mess.

---

## Open questions (parked, none blocking)

- **Do visitors get pursuits?** `VISITOR_DRIVE_ALLOWLIST` restricts an external
  NPC to a handful of drives, and a visitor committing to a two-tick pursuit
  during a short visit may read oddly. Decide during Phase 2, when the
  commitment machinery is real enough to try it.
- **Should `compatibility`/`friction` become live inputs?** Confirmed
  generation-only in Evidence. Promoting them would make *who* an NPC seeks
  out depend on who they actually get along with, which is a real improvement
  and a real scope increase. The user chose per-drive temperament weights
  without it. Revisit at Plan 5, where NPC-initiated social contact makes the
  question urgent.
- **Does the player ever learn *why*?** A pursuit has a readable reason in
  `terms`. Surfacing it risks turning the sim into a spreadsheet; leaving it
  hidden risks behaviour reading as random. Decide once Phase 3 makes
  behaviour differentiated enough to judge.
- **Should a pursuit survive a room change the NPC did not choose?** Being
  moved by a scripted event mid-pursuit is currently undefined. Decide during
  Phase 2.

---

## Design invariants

1. **Scoring is pure; committing is a named writer.** `scoreCandidates` reads
   state and returns numbers. `openPursuit` writes. Plan 2 proved this out
   across five phases — its `composeScene`/`markCalloutsShouted` split is the
   shape to copy, and its harness assertion that the renderer never writes to
   what it renders is the shape of assertion to copy with it.

2. **The tick stays synchronous, pure and model-free.** R2. Every autonomy
   feature in this game rests on `resolveTick` being callable a hundred times
   in a loop with no network. The measurement in Evidence exists *because*
   that is true; the day it stops being true, none of it is knowable.

3. **One pursuit, one writer.** The `activityOverride` clobber must be
   impossible by construction, not prevented by convention. Conventions in
   this file already failed once — five drives grew their own bypass of the
   weight roll without anyone deciding the model had changed.

4. **A gate that cannot trip is a bug, and the harness proves it can.**
   `sleep_recover` (energy `< 20`, floor 28) and `seek_comfort` (comfort
   `< 40`, floor exactly 40) were dead for the entire life of the drive
   system, in a codebase that already had an instrument printing
   "unreachable" next to them. Printing is not catching. The reachability
   assertion is the catch.

5. **Every drive must be observed firing over a long run, or be explicitly
   marked unimplemented.** R8's shape, applied to behaviour rather than
   fields: a drive nobody ever performs is dead content with a config entry,
   and this plan starts with four of them. `effects.js`'s `implemented: false`
   flag is the precedent for declaring one deliberately.
