# `dev/verify/` — the regression suite

Not part of the shipped game. `index.html` never loads any of this.

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
| `loadgame.js` | The loader. Everything else requires it. **Its `ORDER` array must list every file `index.html` loads** — see rule 6. |
| `run-all.js` | Runs every `verify-*.js`, totals, exits non-zero on failure. |
| `verify-p1..p5.js` | Plan 0 — NPC correctness fixes |
| `verify-s1..s5.js` | Plan 1 — perception & signals |
| `verify-r1.js`, `verify-r34.js`, `verify-r5.js` | Plan 2 — the scene reader (Phases 1, 3+4, 5) |
| `verify-c1.js` | Plan 3 — NPC cognition (Phase 1): the scorer is pure, deterministic, model-free, and every drive is reachable in a state the game can actually produce |
| `verify-c2.js` | Plan 3 — NPC cognition (Phase 2): one action per npc-tick by construction, a pursuit is held and not re-resolved, what breaks it, and every drive observed firing |
| `verify-c3.js` | Plan 3 — NPC cognition (Phase 3): the authored `temperamentWeights` table is well formed and has one consumer, every weight moves its score the way it claims, personality never overrides a satisfied need, and — paired by seed — an axis visibly moves the drives that declare it while the other axis does not |
| `verify-c4.js` | Plan 3 — NPC cognition (Phase 4): `leaves` traces are well formed and could fire, they step/accumulate/saturate along the def's ladder, `investigate_smell` clears every rot-emitting state (D20) and its walk leg sets no cooldown (D21), and — against a leaves-stripped counterfactual on the same seeds — an untouched house dirties itself without spiralling |
| `verify-c5.js` | Continuous behavior engine (Phase 2): event-driven decision scheduling (D3). The queue predicates (`nextDecisionAbs`/`dueForDecision`/`deriveHeldRecord`) are pure and match the Data model; the plan's own worked example — a synthetic house with forced, staggered commitment lengths — resolves each NPC once per completion and never on an unrelated NPC's boundary; and at population scale a mid-hold commitment triggers ZERO `evaluateDrives` calls until its own completion, which is the flat scan dying by call-count measurement rather than by reading code. Plus determinism (same seed, same commitment sequence, byte for byte) and the tick staying model-free |
| `verify-i1.js` | Plan 5 — NPC initiative (Phase 1): the expression layer. The authored `expresses` table is well formed and on a path that can apply it, the condition evaluator fails closed, an expression rides along and changes NOTHING about the tick but the signal buffer (paired runs with the table stripped), the emotional channel propagates and attenuates like any other sound — a sigh stops at a door and a slam does not — and, on 12 households × 7 days, every authored signal fires, an ordinary mood is silent, and `npcDisinhibition` spans a real range on a cast that has no baked `deviantLevel` |
| `verify-i2.js` | Plan 5 — NPC initiative (Phase 2): making the dead motivation sources live. The `EVENT_EMOTION` table is well formed and every key is a type something can actually emit, `participants` is stamped inside the tick by one writer (because co-presence is tick-local and the write site runs after the whole batch), the two D7 inference rules count every pair and keep one belief per theme — and the measurement the phase exists for: fact and open-question occupancy over 12 households × 7 days goes from 0 to non-zero against a counterfactual written the old way, with the growth bounded by the flat's pair count and the tag vocabulary rather than throttled. Plus D12's gate endpoints (a wholly inhibited NPC still needs the full authored conjunction; a wholly disinhibited one reaches it on desire alone; desire is never scaled) and D13/D20 giving `highDesire` its first reader |
| `verify-i3.js` | Plan 5 — NPC initiative (Phase 3): the overture. The overture table is DRIVE_DEFS' sibling rather than a parallel universe (one lookup, disjoint `need`/`motive` terms, no id collisions), each of the four motive sources is driven DIRECTLY — two of them still read zero on a generated cast, so a population run alone would exercise one and pass — the do-not-disturb set blocks on every entry and fails closed on an unknown one, `npc.overture` has one writing file, and the invariant measured rather than argued: over 12 households × 7 days no NPC ever held a pursuit and an overture at once and every pending record was in the player's room. Plus D10's economy (three refusals running move the relationship less each time, leave three ordinary decaying beliefs, and suppress the next overture on the same curve) and D20 finally giving `mayInitiate` the reader it was named for |
| `verify-i4.js` | Plan 5 — NPC initiative (Phase 4): the other three channels. All four ship as ENTRIES rather than code paths — one proximity registry that fails closed, a `requires` list that reads the do-not-disturb registry the other way up so a knock needs exactly the state an approach forbids, and four channels that sort themselves by geometry with nothing branching on the channel name. Plus: `text_player` really left `DRIVE_DEFS` and its dead reader went with it, a text names its motive and leaves no record to hold anybody, a proposal is only a candidate when it can name a free slot the proposer's own schedule allows and books a commitment that binds exactly as a meal does (with nothing booked until the player says yes, so a decline leaves no orphan), and a knocker stays on their side of the door while their knock lands in the player's room loud enough to stop the scene |
| `verify-i5.js` | Plan 5 — NPC initiative (Phase 5): shared activities. Ten `shared` fields on the ten `self.*` entries rather than a parallel `together.*` table — one resolver, one participant predicate, one narration path, a rate registry that fails closed and an exclusion registry that deliberately fails open. D16's two halves are asserted together and apart (the same activity alone writes neither), the fact tier is bounded by construction rather than throttled (ten activities × ten rounds leaves exactly ten facts, retrievable and surviving eviction), and the "does not dominate" bound is DERIVED from `SHARED_ACTIVITY` against `X5` rather than restated — a whole day at the cap moves an axis less than one judged conversation window. Plus: the write survives `resolveBatch`'s rebuild on all three keys it touches, `presentResidentAffection` reads the same participant list so the mood impulse and the relationship delta cannot drift, every `ACTION_DEFS` entry declares a `timeCost` (three did not, and threw), and a population pass showing every shareable activity is reachable and none is always available |
| `verify-i6.js` | Plan 5 — NPC initiative (Phase 6), rewritten by `npc-initiative-retiming-plan.md` (Phase 2, 2026-08-15) from a wrap-bound suite into an ABSENCE-assertion suite for the same class: `isOnCooldown` compares absolute minutes (`nowAbs - stampedAbs < cd`, no wrap branch), a cooldown of a full day and one of two days elapse (the exact D34 scenario — a value at or above the old `CLOCK.ticksPerDay` could never elapse against the wrapped 0..47 stamp, so three entries fired once per NPC per *game*) — and every cooldown in BOTH tables is a positive `cooldownMinutes` with no `cooldownTicks` surviving in the tables, the code that reads them, or the instrument. Plus, unchanged: the levers Phase 6 tuned are levers (every published cooldown constant reaches a def; every entry's `motive.weight` really is the copied `OVERTURE.motiveWeight`, which is why the instrument sweeps the defs and not the constant), D5's ordering derived from both tables rather than restated, the do-not-disturb registry still resolving every key and failing closed on an unknown one, D10's curve derived from `refusalDiminish`, and the tick still model-free after the retune |
| `measure-initiative.js` | How often the cast reaches for the player, and why: overtures per NPC per day by channel and motive across six arms, what the do-not-disturb gate suppressed (separating a `requires` miss from a real block, and counting only the blocks that stopped something otherwise ready), the endings under a simulated player who answers, the shared-activity → affection → approach feedback loop Phase 5 parked, sweeps of every tuning constant, and where `needs.social` actually sits — the number the parked loneliness motive has to argue against. Where every figure in the initiative plan's Phase 6 Handoff came from |
| `verify-x1.js` | Plan X-5 — conversation consequences (Phase 1): `x5.js` is pure and model-free, every malformed judge reply lands somewhere defined (and "judged nothing" stays distinguishable from "failed"), nothing a model claims can mint a pinned or certain belief, the scene is the window and a judged one never reopens, and both window ceilings are reachable inside `MEMORY_BUDGET.maxRecent` |
| `verify-x2.js` | Plan X-5 — conversation consequences (Phase 2): the writing pass cannot move a relationship even when it volunteers deltas, the Assessor's rubric still carries D8/D9/D10/D7 as sentences, a stubbed judge drives window→call→parse→divide→validate→apply→mark, a judged window never reopens, and the triggers sit where D2/D17 say (and not on room entry) |
| `verify-x3.js` | Plan X-5 — conversation consequences (Phase 3): the writing pass can no longer write memory even when it volunteers it, the Chronicler's rubric still carries D8/D11/D12/D13 as sentences, nothing a model claims can mint a pinned or certain belief, a window already read never reopens — and the measurement the plan exists for: rumination over what the Chronicler wrote takes inferred facts and open questions from 0 to non-zero, against an ambient-writer counterfactual that still yields 0 |
| `verify-x4.js` | Plan X-5 — conversation consequences (Phase 4): the other side of Phases 1–3. Every safety invariant in this suite is satisfied perfectly by a wire that moves nothing, so this asserts that the `conversationPhase` ladder is reachable at all, that a judge answering all zeros (or still answering on the old ±0.3 float scale) moves a relationship byte-nothing across 200 windows, and that the `deltaDivisor` floor is a live guard — one step below it, a best-case window is rejected whole while small ones still apply, which inverts the scale rather than breaking loudly |
| `measure.js` | NPC need economy: prints per-need ranges against drive gates |
| `measure-signals.js` | Signal propagation: how far each channel actually reaches, including the emotional channel's four placement cases (same room / one hop / two hops / through a door) |
| `measure-cognition.js` | What the cast actually does per tick: actions/npc-tick, per-drive eligible-vs-fired, need-curve reachability, whether the apartment dirties itself, the score distribution, and (section 6) how pursuits are opened, held and broken. The baseline Plan 3 compares against |
| `measure-x5.js` | Plan X-5's two judging passes over time: relationship drift under six judge profiles, the windows-per-in-game-day cadence through the real triggers, fact accumulation against `BELIEF.maxFacts`, how much of a paraphrase corpus D25's dedupe catches, and the `deltaDivisor` sweep that set the constant. Where every figure in that plan's Phase 4 Handoff came from |
| `verify-food.js` | The food-decay overhaul: freshness is continuous rather than quantised to `clock.day` (the bug — a short-life dish used to be Fresh until midnight and Rotten after, never passing through a rung), the five-stage ladder is reachable in order and the "good" rung is deliberately unlabelled, Fresh is an absolute window rather than a fraction (so butter is not Fresh for two days), the reported scenario — takeout, then hours of setting the table — still ends in a Fresh meal, containers stretch the whole ladder and a transfer preserves the fraction consumed, Rotten is inedible with no restore multiplier left that implies otherwise, and continuous anchors merge by tolerance keeping the OLDER of the two so a shopping trip is one stack and a merge never flatters the old one |
| `verify-meal.js` | The shared meal as a SPREAD, and the player finally existing. `set_meal` served one dish and capped the eaters at its servings, so a 1-serving steak with three roommates at the table fed the player and left three people collecting an attendance bonus for watching — silently. Servings now pool across several dishes and allocate round-robin (draining in order would feed a table of four entirely from the pizza and make laying out a spread pointless), quality is best-plus-variety rather than the mean (averaging made adding a side score WORSE than the centrepiece alone, punishing the behaviour the mechanic exists to encourage), and under-catering states itself. Plus: the player has an appearance in the same shape an NPC bible carries, so ONE describer serves both and every scene image stops omitting the person it is about; an authored build reaches the prose (derived `heightBuild` must be recomposed after the merge); and a laid table changes the scene key, names its dishes in the prompt, and reverts to the byte-identical plain key when the table is cleared |
| `verify-intro.js` | Player creation + the opening cutscene. Mostly assertions about AGREEMENT between tables deliberately kept separate — the studio's field list vs `CHARACTER_SCHEMA`, `GENITAL_TYPE_FIELDS` vs the schema's union `itemFields`, the gender enum vs `GENDER_DEFAULT_GENITALS` — because each pair can drift silently and a form offering a value the validator rejects is invisible until a player picks it. The three-part gate on `physical.intimate` gets the most attention: every safety property here is satisfied perfectly by a gate that never opens, so each condition is asserted OFF *independently* (and byte-identical to the pre-plan output) **and** the positive case is asserted too. Plus: objects merge while arrays replace on the authored draft, both migrations are deterministic and idempotent and invent no name the player never chose, and `INTRO_BEATS` is well formed with every `{token}` resolvable. Found one real defect — `ensureIntimate` exists because Del Connors' hand-authored bible bypasses the roller and shipped without a body |
| `verify-w9.js` | Intimacy & Voyeurism Phase 9 (D13): the willingness function is the ONLY door into an intimacy act — the hard floors abort with exactly -1 (asleep, schedule-sleep, hostile, stranger, actively-refusing/lockout), act thresholds separate a soft no (`below_threshold`) from a cannot-fire (`floor`), and the `utility.willingness` scoring bias is declared on the same desire-motive overtures that declare `utility.desire`, so the overture path and the act path read one number. The mandatory per-session gate check (a negative-willingness act never fires) is checks 6–7 |
| `verify-w10.js` | Intimacy & Voyeurism Phase 10 (D6/D7): the peek/listen hold. The risk ramp (`peekRiskPerTick`) is the stealthSuccess skill's first mechanical reader — it rises with hold time, drops with stealth and a locked door, rises with the occupant's perception, never goes negative, and the caught roll (`peekCaughtChance`) is monotone-saturating (eventually caught, never certain in one tick). The caught outcome is a personality-gated weighted table (PEEK_OUTCOMES) resolved PURELY from seeded rng — hostile/cold can never escalate or engage, warm-deviant never confronts, and zero-weight outcomes are filtered before the pick because `weightedPick`'s `item.weight \|\| 1` would otherwise promote a forbidden 0 to weight 1. D6's text-only gate (`peekWatchable`: empty/dark rooms), the D15 explicit surface shared by `composePeekViewLine` and `composePeekPrompt` (explicit only when mature flag + naked state, and the prompt never bakes in a keyhole/door), the 'peeked_at_sex' desire mark on the act list, the image budget (per-session and per-day caps, day reset), and the mandatory willingness-floor regression (check 10) |
| `verify-plan.js` | The floor plan and movement overhaul (all 6 phases + both follow-ups). Exists for one invariant above all: **the map and the movement graph cannot disagree** — before this plan, zero of seventeen declared adjacencies shared a wall and nothing noticed, because nothing was ever asked. Asserts every adjacency sits on a real wall wide enough for a door (and demonstrates the check can fail, by moving a room and watching it stop sharing); that `glass` is a threshold and never a route, from both directions and through `findPath`; that the open core is one contiguous zone with every private room one door off it; that propagation reads thresholds (an open crossing costs distance and nothing else, a glass pane beats the walk-around route for sight); and D7 measured rather than argued — kitchen smell reaches the south wing 3.3× more than the north, *proved* to be the threshold's doing by closing the archway and watching the asymmetry collapse. Plus `resolveWalk` pure/deterministic/model-free, each blocker and interrupt driven separately, walk seconds derived from geometry (resize a room, the walk gets longer), `roomPhrase` — which exists because eight narration sites hand-wrote `the ${ROOMS[id].name}` and produced "the Your Bedroom" — and the structural upgrades, where the interesting assertions are that every ADDED edge sits on a real shared wall (the ensuite cuts a door between two rooms that had better touch), that no combination of the five strands a room or leaves a one-way door, that each is individually revertible, and that the kitchen-door upgrade MEASURABLY cuts the smell reaching Bedroom 2 — an upgrade sold as a fix for a problem the layout creates has to actually fix it |
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
6. **`loadgame.js`'s `ORDER` must list every file `index.html` loads.** A new
   `src/srcfiles/*.js` needs a line in BOTH. `rumination.js` shipped in
   `index.html` and never reached `ORDER`, so five harnesses — including all of
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
8. **Always pass `required:` to `loadEngine()`.** Without it the loader
   swallows every read failure: a wrong `SRC` path loads ZERO files, each
   `api()` call throws `ReferenceError` into a `check()` that scores it as an
   ordinary FAIL, and the harness still prints a normal-looking summary line.
   On 2026-08-28 the whole tree sat in that state — `loadgame.js` and ~57
   harnesses pointed at `srcfiles/` instead of `src/srcfiles/`, and six used a
   path one level above the repo root — so `run-all.js` could not execute at
   all. `required: ['config.js', 'sim.js', …]` turns that silence into a
   thrown error naming the missing file. If a result ever looks surprisingly
   clean or surprisingly broken, print `loaded.length` before debugging
   anything else.
9. **Paths are repo-root-relative, two levels up.** From `dev/verify/`:
   `path.join(__dirname, '..', '..', 'src', 'srcfiles')` for sources,
   `path.join(__dirname, '..', '..', 'index.html')` for the entry document.
   Three `'..'` reaches ABOVE the repo and fails with an `ENOENT` naming a
   path outside the project — that is the tell.

## The DOM half

Render and UI work needs a browser:

```bash
# .claude/launch.json has a `slice-of-life` config on port 8734
python -m http.server 8734
# then open  http://localhost:8734/dev-harness.html?cb=1
```

`dev-harness.html` shims the Perchance runtime and replays `index.html`.
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
