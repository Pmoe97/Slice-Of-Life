# `dev/verify/` — the regression suite

Not part of the shipped game. `main.html` never loads any of this.

```bash
node dev/verify/run-all.js        # everything, with a total
node dev/verify/verify-s3.js      # one harness on its own
```

## Why this works at all

`loadgame.js` brings the **entire engine** — every file from `config.js`
through `interruption.js` — up inside a bare Node `vm` context with five
stubs (`window`, `root`, and a `mulberry32` seed). No browser, no Perchance
runtime, no `root.kv`.

That means `resolveTick`, `SIM_generateHouse`, `evaluateDrives`,
`perceiveSignals`, `composeScene` and every pure function in the project are
directly callable against real generated houses. **Prefer this to the iframe
technique described in `src/ref/structural/ARCHITECTURE.md`** for anything
below the render layer: it is faster, it has no snapshot-staleness problem,
and it is what made the Plan 0 need rebalance tunable at all.

It stops before `render.js`/`ui.js`, which need a DOM. Those are verified in
`dev-harness.html` (see below).

## What is here

| File | Covers |
|---|---|
| `loadgame.js` | The loader. Everything else requires it. **Its `ORDER` array must list every file `main.html` loads** — see rule 6. |
| `run-all.js` | Runs every `verify-*.js`, totals, exits non-zero on failure. |
| `verify-p1..p5.js` | Plan 0 — NPC correctness fixes |
| `verify-s1..s5.js` | Plan 1 — perception & signals |
| `verify-r1.js`, `verify-r34.js`, `verify-r5.js` | Plan 2 — the scene reader (Phases 1, 3+4, 5) |
| `verify-c1.js` | Plan 3 — NPC cognition (Phase 1): the scorer is pure, deterministic, model-free, and every drive is reachable in a state the game can actually produce |
| `verify-c2.js` | Plan 3 — NPC cognition (Phase 2): one action per npc-tick by construction, a pursuit is held and not re-resolved, what breaks it, and every drive observed firing |
| `verify-c3.js` | Plan 3 — NPC cognition (Phase 3): the authored `temperamentWeights` table is well formed and has one consumer, every weight moves its score the way it claims, personality never overrides a satisfied need, and — paired by seed — an axis visibly moves the drives that declare it while the other axis does not |
| `verify-c4.js` | Plan 3 — NPC cognition (Phase 4): `leaves` traces are well formed and could fire, they step/accumulate/saturate along the def's ladder, `investigate_smell` clears every rot-emitting state (D20) and its walk leg sets no cooldown (D21), and — against a leaves-stripped counterfactual on the same seeds — an untouched house dirties itself without spiralling |
| `verify-i1.js` | Plan 5 — NPC initiative (Phase 1): the expression layer. The authored `expresses` table is well formed and on a path that can apply it, the condition evaluator fails closed, an expression rides along and changes NOTHING about the tick but the signal buffer (paired runs with the table stripped), the emotional channel propagates and attenuates like any other sound — a sigh stops at a door and a slam does not — and, on 12 households × 7 days, every authored signal fires, an ordinary mood is silent, and `npcDisinhibition` spans a real range on a cast that has no baked `deviantLevel` |
| `verify-i2.js` | Plan 5 — NPC initiative (Phase 2): making the dead motivation sources live. The `EVENT_EMOTION` table is well formed and every key is a type something can actually emit, `participants` is stamped inside the tick by one writer (because co-presence is tick-local and the write site runs after the whole batch), the two D7 inference rules count every pair and keep one belief per theme — and the measurement the phase exists for: fact and open-question occupancy over 12 households × 7 days goes from 0 to non-zero against a counterfactual written the old way, with the growth bounded by the flat's pair count and the tag vocabulary rather than throttled. Plus D12's gate endpoints (a wholly inhibited NPC still needs the full authored conjunction; a wholly disinhibited one reaches it on desire alone; desire is never scaled) and D13/D20 giving `highDesire` its first reader |
| `verify-i3.js` | Plan 5 — NPC initiative (Phase 3): the overture. The overture table is DRIVE_DEFS' sibling rather than a parallel universe (one lookup, disjoint `need`/`motive` terms, no id collisions), each of the four motive sources is driven DIRECTLY — two of them still read zero on a generated cast, so a population run alone would exercise one and pass — the do-not-disturb set blocks on every entry and fails closed on an unknown one, `npc.overture` has one writing file, and the invariant measured rather than argued: over 12 households × 7 days no NPC ever held a pursuit and an overture at once and every pending record was in the player's room. Plus D10's economy (three refusals running move the relationship less each time, leave three ordinary decaying beliefs, and suppress the next overture on the same curve) and D20 finally giving `mayInitiate` the reader it was named for |
| `verify-i4.js` | Plan 5 — NPC initiative (Phase 4): the other three channels. All four ship as ENTRIES rather than code paths — one proximity registry that fails closed, a `requires` list that reads the do-not-disturb registry the other way up so a knock needs exactly the state an approach forbids, and four channels that sort themselves by geometry with nothing branching on the channel name. Plus: `text_player` really left `DRIVE_DEFS` and its dead reader went with it, a text names its motive and leaves no record to hold anybody, a proposal is only a candidate when it can name a free slot the proposer's own schedule allows and books a commitment that binds exactly as a meal does (with nothing booked until the player says yes, so a decline leaves no orphan), and a knocker stays on their side of the door while their knock lands in the player's room loud enough to stop the scene |
| `verify-i5.js` | Plan 5 — NPC initiative (Phase 5): shared activities. Ten `shared` fields on the ten `self.*` entries rather than a parallel `together.*` table — one resolver, one participant predicate, one narration path, a rate registry that fails closed and an exclusion registry that deliberately fails open. D16's two halves are asserted together and apart (the same activity alone writes neither), the fact tier is bounded by construction rather than throttled (ten activities × ten rounds leaves exactly ten facts, retrievable and surviving eviction), and the "does not dominate" bound is DERIVED from `SHARED_ACTIVITY` against `X5` rather than restated — a whole day at the cap moves an axis less than one judged conversation window. Plus: the write survives `resolveBatch`'s rebuild on all three keys it touches, `presentResidentAffection` reads the same participant list so the mood impulse and the relationship delta cannot drift, every `ACTION_DEFS` entry declares a `timeCost` (three did not, and threw), and a population pass showing every shareable activity is reachable and none is always available |
| `verify-i6.js` | Plan 5 — NPC initiative (Phase 6): the rate. Mostly one finding, asserted as a class — a cooldown stamp is a 0..47 tick index that WRAPS, so `cooldownTicks` is not an elapsed duration but a fixed daily clock window anchored at the stamp, and at or above `CLOCK.ticksPerDay` it never elapses at all. Three entries were above it and fired once per NPC per *game* while their comments promised "two game days", "a full day" and "~2 game days". The bound is derived from `CLOCK.ticksPerDay`, demonstrated from both sides (a cooldown at the bound is free on 0 ticks of the day; one under it is free on exactly `ticksPerDay - cd`), and asserted over BOTH tables because `candidateDef` resolves both. Plus: the levers Phase 6 tuned are levers (every published cooldown constant reaches a def; every entry's `motive.weight` really is the copied `OVERTURE.motiveWeight`, which is why the instrument sweeps the defs and not the constant), D5's ordering derived from both tables rather than restated, the do-not-disturb registry still resolving every key and failing closed on an unknown one, D10's curve derived from `refusalDiminish`, and the tick still model-free after the retune |
| `measure-initiative.js` | How often the cast reaches for the player, and why: overtures per NPC per day by channel and motive across six arms, what the do-not-disturb gate suppressed (separating a `requires` miss from a real block, and counting only the blocks that stopped something otherwise ready), the endings under a simulated player who answers, the shared-activity → affection → approach feedback loop Phase 5 parked, sweeps of every tuning constant, and where `needs.social` actually sits — the number the parked loneliness motive has to argue against. Where every figure in the initiative plan's Phase 6 Handoff came from |
| `verify-x1.js` | Plan X-5 — conversation consequences (Phase 1): `x5.js` is pure and model-free, every malformed judge reply lands somewhere defined (and "judged nothing" stays distinguishable from "failed"), nothing a model claims can mint a pinned or certain belief, the scene is the window and a judged one never reopens, and both window ceilings are reachable inside `MEMORY_BUDGET.maxRecent` |
| `verify-x2.js` | Plan X-5 — conversation consequences (Phase 2): the writing pass cannot move a relationship even when it volunteers deltas, the Assessor's rubric still carries D8/D9/D10/D7 as sentences, a stubbed judge drives window→call→parse→divide→validate→apply→mark, a judged window never reopens, and the triggers sit where D2/D17 say (and not on room entry) |
| `verify-x3.js` | Plan X-5 — conversation consequences (Phase 3): the writing pass can no longer write memory even when it volunteers it, the Chronicler's rubric still carries D8/D11/D12/D13 as sentences, nothing a model claims can mint a pinned or certain belief, a window already read never reopens — and the measurement the plan exists for: rumination over what the Chronicler wrote takes inferred facts and open questions from 0 to non-zero, against an ambient-writer counterfactual that still yields 0 |
| `verify-x4.js` | Plan X-5 — conversation consequences (Phase 4): the other side of Phases 1–3. Every safety invariant in this suite is satisfied perfectly by a wire that moves nothing, so this asserts that the `conversationPhase` ladder is reachable at all, that a judge answering all zeros (or still answering on the old ±0.3 float scale) moves a relationship byte-nothing across 200 windows, and that the `deltaDivisor` floor is a live guard — one step below it, a best-case window is rejected whole while small ones still apply, which inverts the scale rather than breaking loudly |
| `measure.js` | NPC need economy: prints per-need ranges against drive gates |
| `measure-signals.js` | Signal propagation: how far each channel actually reaches, including the emotional channel's four placement cases (same room / one hop / two hops / through a door) |
| `measure-cognition.js` | What the cast actually does per tick: actions/npc-tick, per-drive eligible-vs-fired, need-curve reachability, whether the apartment dirties itself, the score distribution, and (section 6) how pursuits are opened, held and broken. The baseline Plan 3 compares against |
| `measure-x5.js` | Plan X-5's two judging passes over time: relationship drift under six judge profiles, the windows-per-in-game-day cadence through the real triggers, fact accumulation against `BELIEF.maxFacts`, how much of a paraphrase corpus D25's dedupe catches, and the `deltaDivisor` sweep that set the constant. Where every figure in that plan's Phase 4 Handoff came from |
| `demo-r1.js` | Renders `composeScene`'s output as prose in the terminal |

The five `measure-*` scripts are **tuning instruments, not tests**. They
print; they do not assert. Plan 0 Phase 4 and Plan 1 Phase 1 both had their
numbers set by running these and looking, after a first pass set by arithmetic
came out wrong in both directions. Re-run them after changing any rate.

`measure-cognition.js` is also the source of every figure in the NPC cognition
plan's `## Evidence` section — if it stops reproducing them, the plan's
baseline has moved and every later comparison in it is stale.

## Rules that keep this useful

1. **A phase is not done until its harness passes.** Every plan phase that can
   be verified here has been.
2. **Assert the invariant, not the implementation.** The valuable assertions
   in here are things like "`composeScene` never mutates state", "there is
   exactly one `perceiveSignals` in the tree", "every declared signal has a
   reachable emitter" — they catch a class of mistake, not one instance.
3. **When a harness fails, decide whether the code or the assertion is
   wrong.** Several assertions in here were the thing that was wrong: a
   `undefined < 0.01` comparison that failed on the best possible outcome, a
   mood-target check that compared across rooms with different cleanliness,
   an orphan check written before transient signals existed. Fixing the test
   is legitimate — silently loosening it is not, so say which you did.
4. **Assert a version bump as a floor, never an equality.** `verify-r5` pinned
   `ui.js?v=55` exactly, and the next plan to touch `ui.js` got reported as a
   Plan 2 regression. Versions only ever go up.
5. **Never hardcode a value that another file owns.** `measure-cognition.js`
   spent its whole life setting `clutter: 'heavy'` where `defs.world.js` says the
   values are `tidy|cluttered`, so its "filthy house" column was measured against
   a house that was never cluttered. Derive it — from `DRIVE_DEFS`, from the
   object def's own `emits` table — and the two can never drift.
   This is the rule broken most often, and always the same way: a constant is
   correct when the assertion is written, a later plan retunes it by
   measurement, and the harness reports the retune as a regression.
   `verify-c1` hardcoded `eat`'s morning `blockAppeal` of 1.2 and a recency
   window derived from a cooldown of 8; Plan 3's Phase 5 moved both. Read the
   number from the table.
6. **`loadgame.js`'s `ORDER` must list every file `main.html` loads.** A new
   `src/srcfiles/*.js` needs a line in BOTH. `rumination.js` shipped in
   `main.html` and never reached `ORDER`, so five harnesses — including all of
   `verify-c2` — died with `ReferenceError: ruminate is not defined` the moment
   they called `resolveTick`, and **175 assertions silently stopped running**.
   `run-all.js` reports an errored harness separately from a failing one for
   exactly this reason: a harness that DID NOT REPORT is not a harness that
   passed. Never read past that line.
7. **A renamed constant is a stale test, not a fixed one.** When a plan moves a
   budget or a threshold, grep the suite for the old name before closing the
   phase. Plan 4 moved `MEMORY_BUDGET.maxFacts` (40) to `BELIEF.maxFacts` (60)
   and `verify-p3` went on comparing against `undefined` — which fails loudly,
   but the same class of move can just as easily pass loudly.

## The DOM half

Render and UI work needs a browser:

```bash
# .claude/launch.json has a `slice-of-life` config on port 8734
python -m http.server 8734
# then open  http://localhost:8734/dev-harness.html?cb=1
```

`dev-harness.html` shims the Perchance runtime and replays `main.html`.
**Always append a cache-buster** (`?cb=2`, `?cb=3`…) — the browser caches the
harness itself and will silently serve a stale copy of your edit.

Drive it from the console rather than clicking through:

```js
document.querySelector('[data-action="menu.new-game"]').click();
document.querySelector('[data-action="generate-cast"]').click();
document.querySelector('[data-action="approve-cast"]').click();
// currentGameState, doMove, addLogEntry, spawnNote, composeScene,
// renderSceneReader — all reachable by bare name.
```

Its kv shim must list every folder the game touches (`meta player world npcs
objects images snapshots menu saves saveIndex`). A missing one fails at boot
with `Cannot read properties of undefined (reading 'get')`, which reads like a
game bug and is not one.
