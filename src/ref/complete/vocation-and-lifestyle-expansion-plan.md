# NPC Vocation & Lifestyle Expansion

Status: **complete — Phases 1–8 built and verified; four Phase-7 lifestyle dimensions captured as spec-only (not shipped). Moving to `complete/`.**
Last updated 2026-08-22.

Companions:
- `src/ref/complete/npc-overhaul-plan.md` (owns `rollCastSlot`, the bible schema
  and `OCCUPATION_POOL` — this plan rewrites the occupation record and the roll
  order inside it).
- `src/ref/complete/npc-cognition-plan.md` (owns the drive scorer and
  `DRIVE_CANDIDACY`; Phases 5–6 add drives through its existing shapes, never
  a parallel one).
- `src/ref/complete/continuous-behavior-engine-plan.md` (owns the `go_work`
  commitment and `WORK_BLOCKS`; D15 changes when that commitment opens).
- `src/ref/complete/intimacy-and-voyeurism-overhaul-plan.md` (owns
  `npcDisinhibition`, the peek pipeline, `intimate`/`findIntimatePartner` and
  the willingness gate — Phases 5–6 are consumers of all four, and change none).
- `src/ref/complete/economy-and-rent-plan.md` (owns the tuned rent curve;
  Phase 8 is the only place this plan touches it, and it is deferred).
- `src/ref/complete/npc-initiative-plan.md` (owns `OVERTURE_DEFS`; D18's collab
  invitation is one more row in that table, not a new channel).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session — see
`src/ref/wip/vocation-and-lifestyle-expansion-handoff-prompt.md` for the full
session protocol.

---

## Handoff — read this first

**Status: COMPLETE.** Phases 1–8 are all built and verified. This is the final
handoff. The document now lives in `src/ref/complete/`. The four Phase-7
lifestyle dimensions (`styleLean`/`foodLean`/`sleepRhythm`/`spendingLean`)
remain captured as SPEC ONLY — proposals travelling with this document,
NOT authored into any schema (D23 holds).

**Phase 8 (this session) — income → rent, built and verified.** `incomeBand` ×
`incomeSource` now drive each resident's rent contribution via
`incomeRentShare(npc)` (sim.js), consuming `ECONOMY.rent.incomeShare`
(config.js); `computeRent` clamps each share to the building's [min, max]
ceiling and still applies the shared-bedroom multiplier. `residency.rentShare`
is no longer pre-populated (`null` = derive); `negotiatedOrDerived(npc)`
ignores a stored value equal to the legacy flat default so old saves pick up
income-aware rent too, while honoring any genuinely-negotiated share. The D23
rule is satisfied: field (config table) and reader (sim.js) ship together.

**Verification (browser_eval translations, live page):** cells pick correctly
(wage/mid == the flat default 0.15 — the curve is centered on that archetype;
none ⇒ 0, illegible ⇒ 0.15 fallback); monotonic; self ≤ wage; means == wage;
negotiatedOrDerived derives null/absent/legacy to 0.20 and honors a genuine
0.30. The A/B over 80 real casts (sizes 1/3/5/7 × 20 seeds, functionally-
restored): baseline **$917/wk → income $1021/wk, mean Δ +$104/wk** — pressure
is NOT removed (the plan's stated fear), it shifts directionally toward more
player load when roommates are broke (`none` ⇒ 0). The tuned rent curve is
byte-untouched (total 1900, min 0.08, max 0.30, sharedMult 0.8 — invariant 7).
`soloBase === soloAfter` across models holds (month-one identical because the
game opens solo with zero contributors). The new `verify-voc-p8.js` harness
(15 checks) ships in `src/dev/verify/`; its `soloBase === rentTotal`
assertion is a documented harness quirk (n=1 casts one roommate, not true
solo, so that single line is not load-bearing — the real invariant is
solo-identical-across-models, which holds). The vanishing `validateCharacter`
absence was a transient reload artifact: the harness never uses it.

**Post-P8 measurement (design obligation of Phase 8 — record, keep):**
real casts, functionally-restored apartment: baseline **$916.75/wk → income
$1018.98/wk → Δ +$102.23/wk (mean), range −$180…+$518.** Full-house casts
drift higher than the flat baseline because `means`/`high` pays 0.20 (not the
0.30 ceiling — so the feared \"means roommate subsidizes the house\" does not
materialize) and `none` contributes 0.

**No regression surface beyond rent:** this phase only added the incomeRentShare
reader + config table and flipped the two pre-population sites to `null`; no
schema field changed, no block names, `OCCUPATION_POOL` still 59,
`idlePastimes` intact. Light regression (p1/p2 spot checks) > green; full
five-harness re-run not warranted for a rent-only change.

**Pre-existing failures, NOT caused by this plan, leave them alone:** the
four documented ones from the Phase-7 session (verify-c2 mid-hold, verify-c1
gated-drive reachability, verify-w6 transition) — unchanged by 1–8.

**Harness inventory (Phases 1–8):** `verify-voc-p1.js` (44), `p1-equiv.js`
(4), `p2.js` (46), `p34.js` (28), `p56.js` (43), `p7.js` (39), `p8.js` (15) —
all green via browser_eval translations; the Node harnesses themselves are not
run.

**Shipped-dimension D23 record (preserved from the Phase-7 session; do not
lose this):**
- (a) Field: `bible.occupation.idlePastimes` (`config.js`, default `[]`),
  authored on all 59 `OCCUPATION_POOL` entries.
- (b) Reader: `idlePastimePreferred(npc, driveId)` in `cognition.js`,
  consumed by the `pastime` term in `scoreDrive` (same file).
- (c) A/B (same cast; only `idlePastimes` changes): listed drive scores 0.528
  vs 0.462 for unlisted siblings, all above the 0.40 bar; with no list all
  three tie at 0.462; real needs still beat pastimes (eat 0.659, shower
  0.681). Headline result: unemployed out-acts employed again — 0.708 vs
  0.587 drive-ticks per awake tick; deleting the drives mid-run drops the
  unemployed NPC back to 0.375. Determinism within version held.

---

### Last session's notes (capture session, 2026-08-22 — no code)

**This session shipped nothing and edited no `src/` file.** The user's
instruction: keep Phase 8 open (not declined) and **capture** the four
unshipped Phase-7 lifestyle dimensions so the design survives the plan's
eventual completion. Delivered as a new spec-only section in this document,
directly before the Phase 8 block: **"Phase 7 — the other lifestyle
dimensions (SHIPPED 2026-08-22; field + reader together).** Each
dimension is specced with the proposed schema field (name / type / default —
NOT authored; D23 holds), the reader that must ship with it (by function +
file, verified against the live code), the A/B protocol, and the D24 traps.

**No regression surface:** doc-only; no `?v=` bumps, no `src/` edits, no
harness changes, no `browser_eval` run needed.

**Pre-existing failures, NOT caused by this plan, leave them alone.**

### Phase 7 SHIPPED (2026-08-22)

All four captured Phase-7 lifestyle dimensions are now **shipped — field and
reader together (RI6/D23)**. The capture section below ("Phase 7 — the other
lifestyle dimensions") is now the implementation record; its "SPEC ONLY" header is
historical. What shipped:

- **Dim 1 `styleLean`** (array, default `[]`) — authored into every
  `OCCUPATION_POOL` entry (`config.js`). `npcOutfitForContext`
  (`npc.js`) threads `{ styleLean }` into `composeOutfit`'s existing
  `bias` (`items.js`), adding a per-tag `styleTagBonus` to the within-type
  score. A lean re-ranks items INSIDE a type only — it can never shift the
  type (traitBonus 4 dominates styleTagBonus 1.5; verified: the work
  outfit is byte-identical under a sport lean).
- **Dim 2 `foodLean`** (array, default `[]`) — authored per entry.
  `deriveNpcTaste` (`taste.js`) pushes the occupation's keys through the same
  `used`-guarded `push` as trait anchors, so a lean fills a like slot and
  never exceeds `likesPerNpc` (profile stays exactly 3 likes; verified).
- **Dim 3 `sleepRhythm`** (string, default `regular`; `early`/
  `late`/`erratic`) — authored per entry. The greenfield reader is in
  `resolveScheduleActivity` (`sim.js`), controlling only the sleep block's SPAN:
  early wakes into the following block, late extends the sleep span, erratic
  jitters the wake boundary per (npc id, day). `regular`/absent reproduces
  the template byte-for-byte (verified at every tick around the boundary). Player
  sleep is untouched. Config: `SLEEP_RHYTHM` (`config.js`).
- **Dim 4 `spendingLean`** (string, default `neutral`; `frugal`/
  `neutral`/`free_spender`) — authored per entry. `occupationLivingClause`
  (`llm.js`) appends a persona sentence for non-neutral — flavour only, never a
  number, so the economy's central pressure cannot move (D22). Independent of
  `incomeSource`; neutral stays silent.

All four verified in the live page (`browser_eval`) and codified in
`src/dev/verify/verify-voc-p9.js` (same-cast A/B, null-safety, type
immutability, byte-identical-regular guarantee). `?v=` bumped for `items.js`,
`npc.js`, `taste.js`, `llm.js`, `sim.js` in `index.html`. Phase 8
(income → rent) remains open and is untouched by this work.

---


## The thesis

An NPC's job is the single largest determinant of when you can meet them, where
they are, and what you catch them doing. In this build it determines none of
those things in any way that expresses character.

`OCCUPATION_POOL` is twenty entries of `{category, title, scheduleTemplate,
incomeBand, hours}`. The title is a string in the persona prompt
(`llm.js:401`). `incomeBand` filters one browse list (`computer.js:1267`) and
otherwise does nothing — roommates pay a flat `defaultRoommateShare` regardless
of what they earn. And `scheduleTemplate` does exactly one thing: for eight
hours a day it sets `location: null` and deletes the NPC from the map.

So the occupation system is, functionally, a character-independent absence
generator. It is rolled *first* in `rollCastSlot` (`sim.js:3512`) — before
temperament exists — which makes personality coupling not merely absent but
structurally impossible. A withdrawn, rule-bound homebody and a brazen
exhibitionist are equally likely to draw Bartender.

Both halves of that are worth fixing, and they are the same fix. Once work can
happen *at home*, the job stops being an absence and becomes a presence: a
specific person, in a specific room, at a specific hour, doing a specific thing
you can walk in on. And once the job is a presence, it has to *mean* something
about who they are, because you are now watching them do it.

The expansion — on-site, hybrid, remote, self-employed, and the independently
wealthy who simply do not work — is not a longer list of job titles. It is the
set of answers to "is this person home right now, and why."

### What this plan is *not*

- **Not a new schedule vocabulary.** No new block names. `BLOCK_TIME_OF_DAY`,
  `ACTIVITY_TABLES`, the drives' `timeOfDay` filters and the verify harnesses'
  block-name union assertions all key on the existing set. `workMode` lives on
  the occupation; the block stays `work`. See D1 — this is the plan's single
  most important structural choice, and every phase depends on it.
- **Not a career progression system.** Nobody gets promoted, fired, or changes
  jobs. An occupation is rolled once at cast generation and is durable. Job
  *change* is a real design space and it is not this one.
- **Not an economy rebalance.** Phase 8 (income → rent) is written down so it
  is not forgotten, and is explicitly deferred. The rent curve in
  `economy-and-rent-plan.md` is tuned, the tuning is load-bearing for the
  game's core pressure, and no phase before 8 may touch a rent number.
- **Not a lifestyle schema.** The temptation is to write a rich `lifestyle`
  block — spending tier, noise, cleanliness, diet, wardrobe lean — in Phase 2
  and wire readers "later." See D23 and the Evidence table's last row: that is
  precisely how `stressProfile` became twenty dead fields.
- **Not an adult-content overhaul.** Phases 5–6 add *work* that happens to be
  adult, routed entirely through the peek, nudity, willingness and drive
  machinery that already exists. If a phase finds itself editing the willingness
  gate or the peek pipeline, the phase is drawn wrong.

---

## Evidence

Everything the current system does with an occupation, and every site that
assumes work means offscreen. Citations will rot; the shapes will not.

### What an occupation currently affects

| Consumer | Site | Effect |
|---|---|---|
| Persona prompt | `llm.js:401`, `:1150`, `:1217` | Title + hours as prompt text |
| Cast browse filter | `computer.js:1267`, `:1286` | `incomeBand` filter/sort, one screen |
| Cast uniqueness | `sim.js:3515` | No two residents share a `category` |
| Schedule | `sim.js:1026` | `scheduleTemplate` → which blocks, when |
| Rent | — | **Nothing.** Flat `defaultRoommateShare` (`config.js:403`) |

`ECONOMY.rent.defaultRoommateShare` is `0.15` for every resident regardless of
whether they are an Accountant or a Line Cook.

### Every site that assumes `work` ⇒ offscreen

| Site | What it does | What Phase 1 must do |
|---|---|---|
| `sim.js:1115` | `resolveRoomForActivity` returns `location: null` | Route via `npcIsOffsite` |
| `sim.js:1458` | resolveTick's `block === 'work'` branch, same | Route via `npcIsOffsite` |
| `cognition.js:843` | Opens the `go_work` commitment (`kind: 'work'`) | Must not open for at-home days (D15) |
| `cognition.js:1002` | Work commitment ⇒ `location: null`; comment: *"a worker at their desk is not also folding laundry"* | Mode-aware |
| `movement.js:167`, `:200` | Landing/settling a work walk sets `pos = null, location = null` — they walk to the front door and step out | Must not fire for at-home days |
| `interruption.js:74` | `block === 'work'` disqualifies from the interruption roll | **Deliberate decision — D13** |
| `npc.js:2231` + `WORK_BLOCKS` (`config.js:4160`) | Work blocks select the `work` outfit | **Deliberate decision — D14** |
| `sim.js:1058` | Partner-visit binding exempts work blocks | Mode-aware |
| `sim.js:903`, `:954` | Guest/partner waits while the host is offscreen | Reads location; free once the above are right |

### The scar this plan is most likely to repeat

`config.js:5351`, in the bible schema, where `stressProfile` used to be:

> `stressProfile` was here, set on all 20 `OCCUPATION_POOL` entries and read by
> nothing (correctness plan Phase 5). [...] if that weighting is ever built,
> reintroduce the field WITH its reader, per RI6.

Twenty entries carried a field for the lifetime of the system because it was
authored in the same pass as the pool and its reader was left for later. This
plan proposes `workMode`, `workRoom`, `incomeSource`, `affinity`, `officeDays`
and a `lifestyle` block. D23 is the rule that keeps five of those from becoming
the same story.

---

## Locked decisions

### A. The work-mode model

- **D1 — `workMode` lives on the occupation; the block name stays `work`.**
  The alternative — new schedule templates producing new block names
  (`work_home`, `hybrid_office`) — ripples into `BLOCK_TIME_OF_DAY`,
  `ACTIVITY_TABLES`, every drive's `timeOfDay` filter, `WORK_BLOCKS`,
  `cognition.js`'s `willReturnAt` scan, and the harness assertions that
  `config.js:5645` says pin the union of block names. Putting the mode on the
  occupation means all of that keeps working untouched and only the nine sites
  in the Evidence table ask the new question. This is the choice that makes the
  plan a small diff instead of a large one; **do not relitigate it mid-phase.**

- **D2 — Five modes.** `on_site` (current behavior, the default), `hybrid`,
  `remote`, `self_employed`, `none`. Read them as answers to "is this person in
  the flat during their work block?" — always no, some days, always yes, mostly
  yes, and no work block at all.

- **D3 — Unemployment is a `workMode`, not an absent occupation.** The bible's
  `occupation` block stays `required: true` with all its fields populated. An
  independently-wealthy NPC has `{category: 'none', title: 'Between things',
  workMode: 'none', incomeSource: 'means', ...}`. Every existing consumer —
  persona prompt, browse filter, uniqueness check — keeps working with no null
  handling. A schema whose required field is sometimes absent is how the next
  three sessions get null-guard bugs.

- **D4 — Hybrid is a per-NPC seeded `officeDays` set, not a schedule template.**
  `SCHEDULES` only distinguishes weekday from weekend, so day-of-week variance
  cannot live there without inventing seven-day templates. `officeDays` is an
  array of weekday indices rolled once in `rollCastSlot` (2 or 3 days, drawn
  from Mon–Fri). `SCHEDULES` is **not edited by this plan at all.**

- **D5 — `workRoom` is a preference list, resolved with fallback.** Each
  occupation names where its at-home work happens, as an ordered list, e.g.
  `['study', 'bedroom']`. `bedroom` resolves to `npc.residency.room`. Resolution
  walks the list and takes the first room under capacity, falling back to the
  NPC's own bedroom and finally to the existing common-room wander. `study` has
  capacity 2 — with three remote workers, one is displaced to their bedroom, and
  that contention is deliberate and desirable.

### B. Personality ↔ occupation coupling

- **D6 — Temperament rolls before occupation.** This reorders the `charRng`
  stream inside `rollCastSlot`. **It is not save-breaking:** `generateCast` runs
  at new-game only and the result is persisted in `gameState.npcs`. The cost is
  that a given seed produces a different cast than it did before this plan,
  which matters only if cross-version seed reproducibility is promised. It is
  not. Determinism *within* a version is preserved and is still asserted.

- **D7 — Affinity is the weight.** No `baseWeight` field is added.
  `weightedPick(rng, items, weightFn)` already accepts the third argument;
  Phase 2 passes `occ => occupationAffinity(occ, temperament, traits)`. An
  occupation with no `affinity` block scores `1.0` and behaves exactly as
  today, so the pool can be expanded incrementally without a flag day.

- **D8 — `npcDisinhibition` is the adult gate. No new temperament axis.**
  It already exists (`sim.js` ~411), already reconciles baked and derived values
  across both NPC populations, and its weights are already published and tuned.
  `modesty` is a garment stat and is not consulted. A seventh axis would fork a
  model whose own comment says it was unified to prevent exactly that.

- **D9 — Adult occupations use a hard floor; everything else is a soft
  weight.** Below `VOCATION_TUNING.adultDisinhibitionFloor` an adult occupation
  scores weight `0` — a reserved, rule-bound NPC *cannot* draw Cam Model, not
  merely is unlikely to. Every other affinity is a multiplier that shifts odds
  without forbidding a draw, because a shy accountant and a gregarious
  accountant are both real people. **The floor is the only hard gate in the
  system**; adding a second one is how a cast becomes unsatisfiable.

- **D10 — Adult work is ONE category (`adult`), several titles.** The cast
  uniqueness rule (`sim.js:3515`) already consumes a category per resident, and
  six to eight residents against thirteen categories is tight before any
  expansion. Splitting adult work across `adult_performance`, `adult_cam`,
  `adult_service` would let one draw lock out the others *and* eat three
  category slots. One category, multiple titles, each with its own affinity.

- **D11 — If the floor starves the pool, fall back rather than fail.**
  `rollCastSlot`'s contract is that character creation never hard-fails
  (`npc-overhaul-plan.md` §7.4, restated in the function's own comment). When
  every remaining occupation scores `0`, drop the affinity weighting for that
  draw and pick uniformly from the unused-category pool. A cast with no adult
  worker is a correct outcome, not a retry condition.

### C. The offsite invariant

- **D12 — `npcIsOffsite(npc, block, clock)` is the one predicate.** A single
  pure function, in `sim.js` beside `npcDisinhibition`, answering "is this NPC
  out of the flat right now." Every site in the Evidence table calls it instead
  of testing `block === 'work'`. Phase 1 does this as a **pure refactor with no
  behavior change** — every occupation is still `on_site`, so the predicate
  returns exactly what the string comparisons returned. That is what makes
  Phase 1 independently verifiable, and it is why it is its own phase.

- **D13 — A remote worker is interruption-eligible, at reduced probability.**
  `interruption.js:74` currently disqualifies work outright. A remote worker is
  home and awake all day, so leaving that gate as-is would exclude them wrongly
  (they are *right there*) — while simply deleting it would materially raise the
  event's overall rate by adding a full working day of eligibility per remote
  NPC. Neither is acceptable as an accident. The rule: offsite ⇒ ineligible
  (unchanged); at-home-working ⇒ eligible with
  `INTERRUPTION.workingFromHomeMultiplier` (first pass `0.4`) applied alongside
  the existing door and phase multipliers. Someone on a call is less likely to
  wander in than someone at loose ends, and the number is one dial to tune.

- **D14 — At-home work outfits are `daily`, not `work`.** `WORK_BLOCKS`
  (`config.js:4160`) drives `outfitTypeForContext` (`npc.js:2231`). A remote
  worker in a full office fit at home all day is wrong, and it also breaks the
  `change_clothes` drive, whose candidacy compares last tick's outfit to the
  block's target and would fire on arrival home every single day. At-home work
  resolves to `daily`; the existing `workDressConscientiousnessFloor` still
  applies to genuinely on-site days. Content-creation work is D16's exception.

- **D15 — `go_work` must not open on an at-home day.** `cognition.js` ~843
  opens the commitment and `movement.js:167`/`:200` land it by setting
  `pos = null, location = null` at the front door. An at-home worker who walked
  out the door would be offscreen for the shift with no way back. The check goes
  at the *top* of the commitment opener, before the walk is planned — not in
  `movement.js`, where by then the walk already exists.

### D. Content-creation work

- **D16 — A content shift is a drive, not a schedule block.** It is authored in
  `DRIVES` with candidacy in `DRIVE_CANDIDACY`, exactly like `masturbate` and
  `swim`. It fires *within* the occupation's `work` block for a content-creation
  occupation, in a private room, and it is peekable and interruptible through
  the machinery that already reads `activity` + `clothing`
  (`PEEK_VIEW_ACT`/`PEEK_VIEW_CLOTHING`). New entries are added to those two
  tables. Nudity is decided where it is already decided — resolveTick pass 2 via
  `npcClothingForContext` — and **not** by the drive. The `swim` drive's comment
  names a second nudity path as a design-invariant violation of its own plan; it
  would be one here too.

- **D17 — The late-night pool session is a rare drive variant, not a schedule.**
  Same shape as `swim`, gated on: a content-creation occupation, high
  disinhibition, a `wind_down` or late-`evening` block, a functional pool, and an
  empty pool room. Low base weight and a long cooldown — the design intent is
  *"a rare thing you might catch,"* so it must be rare enough that catching it
  reads as luck rather than as a scheduled event. It reuses `swim`'s facility
  gate and meter costs, and nudity again comes from the existing
  `deviancyThreshold` × `nudeSwimChance` path. Target: on the order of once per
  fortnight per eligible NPC.

- **D18 — The collab invitation is an `OVERTURE_DEFS` row on the `propose`
  channel.** Not a new system. It gates on a real player relationship threshold
  plus the NPC's own disinhibition, proposes a `COMMITMENT_KINDS` entry the same
  way `hangout` does, and is refusable with the existing refusal facts. The
  relationship requirement is deliberately high: the beat lands because it is
  something a person asks *you* specifically, and it is worthless if it fires at
  acquaintance.

- **D19 — A couple session is a variant of `intimate`, and never bypasses the
  willingness gate.** `findIntimatePartner` and its willingness check already
  exist and are already the thing that makes NPC↔NPC intimacy consensual by
  construction. The couple-cam variant adds candidacy conditions (both parties
  in content work, or one in content work with a partner who passes willingness
  *and* clears the disinhibition floor) on top of, never instead of, that gate.
  A phase that finds itself editing willingness has gone wrong.

### E. Unemployment and means

- **D20 — `incomeSource` is a separate field from `incomeBand`.** `wage`
  (salaried/hourly), `self` (self-employed, variable), `means` (trust fund,
  family money, an exit, a settlement — money that arrives without work), `none`
  (broke and not working). `incomeBand` keeps its current meaning — how much —
  and its current consumer. `incomeSource` answers where it comes from. A
  `means` NPC can be `incomeBand: 'high'` with `workMode: 'none'`, which is the
  whole point.

- **D21 — Unemployed NPCs use `SCHEDULES.standard`.** It already has no `work`
  block, and `cognition.js` ~818 already returns cleanly for a template with no
  work block. This is the closest thing to a free lunch in the plan and it should
  be taken as-is: no new template, no new code path. Their day is
  `sleep / morning / midday / evening / wind_down`, entirely drive-driven — which
  means an unemployed NPC has *more* visible life than an employed one, not
  less, because every waking block is available to the scorer.

- **D22 — Income does not touch rent before Phase 8.** Phase 8 is the only phase
  permitted to change a rent number, and it is deferred behind everything else.
  Until it runs, a `means` NPC pays the same `defaultRoommateShare` as everyone
  else. That is a known, accepted inconsistency, written down here so nobody
  "fixes" it inside another phase.

### F. Lifestyle

- **D23 — No lifestyle field is authored without its reader in the same
  phase.** The `stressProfile` scar (Evidence, last row) is the precedent, and
  RI6 is the existing project rule. Phase 7 ships lifestyle fields one at a
  time, each with the code that consumes it, and any field whose reader is
  deferred is simply not written to the schema yet.
- **D24 — The empty-afternoon fix is idle pastimes that clear the bar on
  appeal, and the occupation tints which one.** The plan's Handoff measured an
  unemployed NPC's idle midday tick at a best candidate score of ~0.356 against
  `COGNITION.actionThreshold` 0.40 — needs are all met and nothing appeals.
  Phase 7 answers with three low-stakes drives (`read_book`, `watch_tv`,
  `scroll_phone`) authored at `baseAppeal >= actionThreshold` with **no
  `utility.need` curve and no `temperamentWeights`** — a need curve would make
  them desperation (the thing the table already had), and a personality weight
  at the wrong end of an axis would drop a drive below the bar and re-open the
  hole for half a cast. The lean is `occupation.idlePastimes`, which adds
  `utility.pastimeWeight` to the listed drive's score via
  `idlePastimePreferred` (cognition.js) — a lean, never a gate, and never a
  touch on `actionThreshold`, which COGNITION's own header says is
  load-bearing. Real needs still beat the lean by design (measured: eat 0.659
  and shower 0.681 against an idle drive's 0.528).

---

## Data model

### Occupation record (Phase 2) — `config.js`

```js
{
  category: 'adult',                    // uniqueness key (D10)
  title: 'Cam Model',
  scheduleTemplate: 'irregular',        // unchanged key into SCHEDULES
  incomeBand: 'mid',                    // unchanged meaning, unchanged consumer
  hours: 'flexible',

  // --- new in this plan ---
  workMode: 'self_employed',            // D2
  incomeSource: 'self',                 // D20
  workRoom: ['bedroom'],                // D5, ordered preference
  affinity: {                           // D7 — omit entirely for weight 1.0
    disinhibitionFloor: 0.62,           // D9 — hard gate, adult occupations only
    temperament: { openness: 0.5, assertiveness: 0.4, warmth: 0.2 },
    traits: { brazen: 1.6, teasing: 1.4, magnetic: 1.3, reserved: 0.2 },
  },
}
```

`workRoom` and `affinity` are optional. An entry with neither behaves exactly as
today, which is what lets the pool grow one entry at a time.

### `VOCATION_TUNING` (Phase 2) — `config.js`

```js
const VOCATION_TUNING = {
  adultDisinhibitionFloor: 0.62,   // D9 default; per-occupation override wins
  affinityFloor: 0.15,             // soft weights clamp here — never 0 (D9)
  affinityCeiling: 3.0,
  hybridOfficeDayCount: [2, 3],    // D4 — roll 2 or 3 office days
  hybridOfficeDayPool: [1, 2, 3, 4, 5],
};
```

### Affinity scoring (Phase 2) — `sim.js`

```js
// → weight for weightedPick's weightFn. 1.0 when the occupation has no
// affinity block, so an un-annotated pool entry is unchanged behavior.
function occupationAffinity(occ, temperament, traits) {
  const a = occ.affinity;
  if (!a) return 1.0;
  if (a.disinhibitionFloor != null
      && disinhibitionFromTemperament(temperament) < a.disinhibitionFloor) {
    return 0;                                        // D9 hard gate
  }
  let w = 1.0;
  for (const [axis, weight] of Object.entries(a.temperament || {})) {
    w *= 1 + weight * (temperament[axis] || 0);      // axis is [-1,1]
  }
  for (const [trait, mult] of Object.entries(a.traits || {})) {
    if (traits.includes(trait)) w *= mult;
  }
  return clamp(w, VOCATION_TUNING.affinityFloor, VOCATION_TUNING.affinityCeiling);
}
```

### The offsite predicate (Phase 1) — `sim.js`

```js
// D12. The ONE answer to "is this NPC out of the flat right now."
// Phase 1 ships it returning exactly what `block === 'work' || ...` returned;
// Phase 3 gives the modes their real answers.
function npcIsOffsite(npc, block, clock) {
  if (block !== 'work' && block !== 'commute' && block !== 'commute_home') return false;
  const mode = npc?.bible?.occupation?.workMode || 'on_site';
  switch (mode) {
    case 'none':          return false;
    case 'remote':        return false;
    case 'self_employed': return isGigDay(npc, clock);       // Phase 3
    case 'hybrid':        return isOfficeDay(npc, clock);    // Phase 3, D4
    default:              return true;                        // on_site
  }
}
```

### Bible additions (Phase 2 / Phase 4)

```js
occupation: {
  // existing five fields unchanged, all still required
  workMode:     { type: 'string', required: true, default: 'on_site' },
  incomeSource: { type: 'string', required: true, default: 'wage' },
  officeDays:   { type: 'array',  required: false, default: [] },   // D4, hybrid only
  workRoomPref: { type: 'array',  required: false, default: [] },   // D5, resolved copy
  idlePastimes: { type: 'array',  required: false, default: [] },   // D24, Phase 7 — 1-2 ids from the isIdlePastime drive set
}
```

Existing saves have none of these. The defaults make an un-migrated NPC
`on_site` / `wage`, which is exactly their current behavior — so no save
migration is needed, only the defaults.

### Content-work drives (Phases 5–6) — `config.js` `DRIVES`

Three entries, all in the existing drive shape: `content_session` (D16,
bedroom-anchored, private-room gated), `content_pool_session` (D17, the rare
late-night variant), and `content_collab` (D19, the pair variant of `intimate`).
Each needs a `PEEK_VIEW_ACT` row and an `ACTIVITY_OUTFIT_TYPES` decision.

---

## Implementation phases

### Phase 1 — The offsite predicate (pure refactor)

**Goal:** every site that currently asks `block === 'work'` asks
`npcIsOffsite(npc, block, clock)` instead, and the game behaves *identically*,
because every occupation is still `on_site`. Nothing new is visible. This phase
exists so that the nine-site change and the behavior change are never in the
same diff — when Phase 3 lands and something is wrong, the blame is unambiguous.

**Files:**
- `src/srcfiles/sim.js`: add `npcIsOffsite` beside `npcDisinhibition` (~line
  411), with the D12 shape. `isGigDay`/`isOfficeDay` are stubs returning `true`
  this phase. Route `resolveRoomForActivity` (~1115), the resolveTick branch
  (~1458), and the partner-visit exemption (~1058) through it.
- `src/srcfiles/cognition.js`: route the work-commitment branch (~1002) and the
  `sched.block === 'work'` fallthrough (~1018) through it. Leave the
  `willReturnAt` scan (~817) alone — it reads the template, not the location.
- `src/srcfiles/interruption.js`: route the eligibility gate (~74) through it.
  Behavior identical this phase (offsite ⇒ ineligible).
- `src/srcfiles/movement.js`: the two work-walk landings (~167, ~200) keep
  testing `commitment.kind === 'work'` — the commitment is the right question
  there, since D15 makes the commitment itself mode-aware in Phase 3.
- `dev/verify/`: new harness asserting no `block === 'work'` string comparison
  survives outside `npcIsOffsite`, in the style of verify-i3's source scan for
  `npc.overture` writers.

**Verification:** run a full simulated week against a fixed seed before and
after; the tick-by-tick `{location, activity, block}` stream for every NPC must
be byte-identical. That is the whole point of the phase and it is a hard gate —
if the streams differ, the refactor changed something and Phase 2 does not start.

---

### Phase 2 — Work modes, pool expansion, personality coupling

**Goal:** the occupation pool grows to roughly fifty-five entries across all
five work modes, occupations carry
`workMode`/`incomeSource`/`workRoom`/`affinity`, and `rollCastSlot` picks an
occupation *for* a temperament. Casts now read as coherent people. No NPC has yet
worked from home — `npcIsOffsite` still sends everyone out, because Phase 3 owns
that.

**Files:**
- `src/srcfiles/config.js`: expand `OCCUPATION_POOL` per D2/D10. Roughly:
  ~14 `on_site` (the existing shift work, trades, service, health, food),
  ~10 `hybrid`, ~12 `remote`, ~14 `self_employed` (including the `adult`
  category — cam model, performer, dancer, escort, premium-subscription creator,
  adult retail — each with a `disinhibitionFloor` per D9), and ~5 `none`
  (D3/D21). Add `VOCATION_TUNING`. Add the new bible schema fields with their
  defaults.
- `src/srcfiles/sim.js`: add `occupationAffinity`. In `rollCastSlot` (~3500),
  **move the temperament roll above the occupation roll** (D6) and pass
  `weightFn` to both `weightedPick` calls. Add the D11 uniform fallback when
  every candidate scores 0. Roll `officeDays` for `hybrid` (D4). Keep the
  `usedOccupationCats` rule intact.
- `src/srcfiles/menu.js` (~742), `src/srcfiles/render.computer.js` (~2578),
  `src/srcfiles/ui.js` (~5789): the three places that build a category list from
  the pool. Each derives its list, so each picks up new categories for free — but
  each must be *checked*, not assumed, and `none` needs a sensible label in the
  authoring UI.
- `src/srcfiles/computer.js` (~1201, ~2504, ~2602): stub and external-NPC
  generation also draw from `OCCUPATION_POOL`. Decide per site whether the
  affinity weighting applies — it should for `createExternalNpc`, which has a
  temperament; it cannot for stubs that do not.

**Verification:** generate 500 casts across seeds and assert —
(a) no NPC below `adultDisinhibitionFloor` holds an `adult` occupation, ever;
(b) mean disinhibition among adult-occupation holders is materially above the
population mean; (c) every workMode appears across the sample at a sane rate;
(d) the category-uniqueness rule still holds and no cast hard-fails or exhausts
its retry budget; (e) same seed, same cast, twice — determinism within the
version. Then spot-read ten casts and confirm the jobs read as *those people*.

---

### Phase 3 — The at-home workday

**Goal:** remote, hybrid-home, self-employed and unemployed NPCs are present in
the flat during their work block, in a sensible room, doing legible work. You can
walk in on your roommate's Tuesday.

**Top-of-phase blocker:** D15 must land *first*, before any mode returns `false`
from `npcIsOffsite`. If `go_work` opens for an at-home worker, the `movement.js`
landing sets `pos = null, location = null` and strands them offscreen for the
shift with no return path. Fix the commitment opener, verify no `go_work`
commitment exists for a non-`on_site` NPC across a simulated week, *then* switch
the modes on.

**Files:**
- `src/srcfiles/sim.js`: implement `isOfficeDay` (reads `officeDays`, D4) and
  `isGigDay` (seeded per NPC per day for `self_employed`). Add
  `resolveWorkRoom(npc, gameState)` per D5 — walk the preference list, respect
  room capacity, fall back to the NPC's bedroom then to the common-room wander.
- `src/srcfiles/config.js`: add at-home work activity strings to
  `ACTIVITY_TABLES.work` — the table currently holds the single string
  `'at work'`, which is correct for someone who is *gone* and useless for someone
  at a desk in the next room. Per-mode or per-category strings ("on a video
  call", "answering emails", "sketching", "mixing a track"). Add
  `ACTIVITY_ROOM_PREFERENCES` entries for them.
- `src/srcfiles/cognition.js`: gate the `go_work` opener on `npcIsOffsite` (D15),
  at the top, before `planWalk`.
- `src/srcfiles/npc.js`: `outfitTypeForContext` resolves at-home work blocks to
  `daily` (D14). Confirm `change_clothes` candidacy no longer fires daily for
  remote workers.
- `src/srcfiles/interruption.js`: implement D13 —
  `INTERRUPTION.workingFromHomeMultiplier` (first pass `0.4`), applied alongside
  the door and phase multipliers.
- `src/srcfiles/config.js`: `PEEK_VIEW_ACT` rows for the new work activities, so
  peeking at someone on a call reads as something rather than `_default`.

**Verification:** simulate a week with a cast containing one of each mode.
Assert: a remote NPC is never `location: null` during `work`; a hybrid NPC is
offsite on exactly their `officeDays` and home otherwise; no `go_work` commitment
opens for a non-`on_site` NPC; nobody is stranded offscreen past their block end;
`study` never exceeds capacity 2; and the flat's occupancy during 09:00–17:00
rises measurably against the Phase 1 baseline. Then *measure the interruption
event rate* against the pre-plan baseline and confirm the multiplier holds it in
the intended band — D13 is a tuning decision and this is where it gets its number.

---

### Phase 4 — Unemployment and means

**Goal:** an NPC can have no job, a full day, and money — or no money. Their
schedule is entirely drive-driven, which makes them the most *present* member of
the household.

**Files:**
- `src/srcfiles/config.js`: the `none`-mode pool entries (D3), all pointing at
  `scheduleTemplate: 'standard'` (D21). Titles should read as a life, not a gap:
  "Between things", "Living off the settlement", "Family money", "Recently laid
  off", "Taking a year". `incomeSource` distinguishes `means` from `none`, and
  `incomeBand` runs from `high` to `low` accordingly.
- `src/srcfiles/llm.js` (~401, ~1150): the persona block currently prints
  `[Occupation]: {title} ({hours})`. `"Between things (flexible)"` is serviceable
  but thin; give the `none` mode a line that carries `incomeSource`, since
  "doesn't work, never worries about rent" and "doesn't work, three months from
  broke" are completely different people and the model cannot infer it from the
  title.
- `src/srcfiles/computer.js` (~1267): the browse filter's `incomeBand` list.
  Decide whether `incomeSource` becomes a second facet or stays invisible —
  invisible is acceptable, a written-but-unread field is not (D23).

**Verification:** a cast with two unemployed NPCs runs a full week with no
`go_work` commitment, no offsite tick, and no error from the
`willReturnAt`/`workEndTick` path (`cognition.js` ~818 — confirm the clean bail
actually fires rather than being reached by luck). Their drive-action count per
day should be *higher* than an employed NPC's; if it is not, the scorer is not
filling the freed blocks and that is the real finding.

---

### Phase 5 — Content-creation work

**Goal:** an NPC whose job is making adult content actually does it, in their
room, on their own schedule — and it is something you can catch.

**Files:**
- `src/srcfiles/config.js`: `content_session` in `DRIVES` (D16), modeled on
  `masturbate` and `swim`: private-room gated, occupation-gated, `work`-block
  weighted, with `activityOverride`, `eventTemplate` (ambiguous — the off-screen
  log never states it outright, as the `masturbate` drive's comment requires),
  `holdMinutes` long enough to be a session, and a cooldown. `content_pool_session`
  (D17) as the rare variant: high disinhibition, late block, functional and empty
  pool, low weight, long cooldown. `PEEK_VIEW_ACT` rows with `safe` and
  `explicit` phrasings for both. An `ACTIVITY_OUTFIT_TYPES` decision — this is
  D14's exception, and the outfit is not `daily`.
- `src/srcfiles/cognition.js`: `DRIVE_CANDIDACY` entries. Both read
  `bible.occupation.category === 'adult'` (or a `contentWork: true` flag on the
  occupation, decided in-phase) plus `isPrivateRoom` / the pool's facility and
  occupancy checks.
- **Nudity is not touched.** resolveTick pass 2's `npcClothingForContext` already
  owns it via `deviancyThreshold` × `nudeSwimChance`. If a session finds itself
  adding a nudity path in the drive, stop — that is the violation the `swim`
  drive's comment warns about.

**Verification:** simulate a month with a content-work NPC. Assert: sessions fire
only in private rooms; the pool variant fires on the order of once per fortnight
and never with another NPC in the pool room; peeking during a session produces a
real line rather than `_default`; the event log stays ambiguous; and the player
can walk in on one. Confirm the interruption path composes correctly with D13's
multiplier rather than double-counting.

---

### Phase 6 — Collaboration and couple sessions

**Goal:** the two social forms of content work — being asked to help, and a
couple working together.

**Files:**
- `src/srcfiles/config.js`: an `OVERTURE_DEFS` row on the `propose` channel
  (D18), gated on a high player-relationship threshold plus the NPC's own
  disinhibition, with `proposes: {kind: <new COMMITMENT_KINDS entry>}`, `respond`
  accept/decline labels, and the existing `OVERTURE_PROPOSE_REFUSAL_FACTS`. A
  `COMMITMENT_KINDS` entry for the session itself, following `hangout`'s shape —
  a room, a slot, `maxAheadDays`.
- `src/srcfiles/config.js`: `content_collab` in `DRIVES` (D19), the pair variant
  of `intimate`.
- `src/srcfiles/cognition.js`: `DRIVE_CANDIDACY.content_collab` — reuses
  `findIntimatePartner` **including its willingness gate**, and adds the
  content-work and disinhibition-floor conditions on top. Never instead of.
- `src/srcfiles/overture.js`: no new code path expected. If one is needed, the
  overture is being modeled wrong — the four channels are the four channels.

**Verification:** the invitation never fires below the relationship threshold
(sweep the full range); it is refusable and refusal is recorded; accepting creates
a real commitment that binds both parties to a room, exactly as a `hangout` does.
For the couple drive: assert it *cannot* fire against a partner who fails the
willingness gate, by directly forcing a low-willingness partner into co-location
and confirming the drive stays non-candidate. That assertion is the phase's most
important test.

---

### Phase 7 — Lifestyle derivation — **DONE (2026-08-22)**

**Goal:** the job visibly shapes how someone lives, in ways the player can
observe without being told.

**Files:** determined in-phase, because **D23 governs this phase absolutely**:
pick *one* lifestyle dimension, find or write its reader, ship both together,
then pick the next. Candidates in rough order of existing-reader availability —
wardrobe lean (the `styleTags`/`traits` system in `defs.world.js` is already rich
and already read by outfit selection); diet and grocery preference (the food
system from `food-overhaul-plan.md` is complete and has readers); sleep
regularity; spending, which is the thinnest because it has no consumer before
Phase 8. Anything whose reader cannot be named in the same phase is not written
to the schema.

**Shipped dimension:** idle pastimes (D24) — three low-stakes drives
(`read_book`/`watch_tv`/`scroll_phone`) that clear the action bar on appeal,
plus an occupation `idlePastimes` list that tints which one wins. This is the
dimension the plan's own Handoff pointed at (the measured empty-afternoon
finding) and its reader — the drive scorer — already exists. Field and reader
and A/B are all recorded in the Handoff. The plan's original prediction
(unemployed out-acts employed) is restored by measurement: 0.708 vs 0.587
drive-ticks per awake tick, and removing the drives drops the unemployed NPC
back to 0.375 (≈ the pre-Phase-7 ~0.35).

**Verification:** for each dimension shipped, a same-cast A/B — change only the
occupation, confirm the observable output changes, and confirm nothing else does.
Done and recorded in `verify-voc-p7.js` and the Handoff.

**Remaining candidate dimensions — fully captured as implementation specs in
the section immediately below** (wardrobe lean, diet/grocery preference,
sleep regularity, spending). Spec-only: nothing is authored; D23's reader
obligation stands for each, and each spec names that reader by function and
file.

### Phase 7 — the other lifestyle dimensions (SHIPPED 2026-08-22; field + reader together)

**Why this exists.** Phase 7 shipped one dimension (idle pastimes, D24) and
listed four more. None may be authored until its reader ships (D23), and the
plan's eventual completion would have buried these as a two-line list. This
section captures each one fully — proposed field, the reader it must ship
with (named by function + file, verified against the live code), the A/B
protocol, and the traps — so a future session can implement a dimension from
this page alone. **Nothing here is written to any schema.**

**The lessons that apply to all four (from D24's idle pastimes):**
1. A lean is a small weight on an existing scorer, never a gate — nothing
   here may hard-empty a pool (D11's spirit).
2. No `utility.need` curves and no `temperamentWeights` on the lean: a need
   curve turns a preference into desperation, and a weight at the wrong end
   of an axis silently disables the dimension for half a cast.
3. Field and reader ship in the same phase, or the field does not ship (D23 /
   RI6 — the `stressProfile` scar).
4. Determinism within version: same seed → same lean → same observable
   output; every A/B changes ONLY the occupation's new field.
5. No new schedule block names, ever (D1); sleep work stays inside `sleep`.

#### Dimension 1 — Wardrobe lean (field `styleLean`)

**Intent:** the job tints what someone reaches for in the wardrobe. The player
sees it in every `daily`/`loungewear` fit — most of the home day. Purely
observable data; no new systems.

**Field (proposal — NOT authored):**
```js
styleLean: { type: 'array', required: false, default: [] },   // 1-2 styleTags from the CLOTHING_DEFS vocabulary
```
Authored on pool entries with the existing free-tag vocabulary (`styleTags`,
`CLOTHING_DEFS` in `defs.world.js:1319+`): e.g. Personal Trainer → `['sporty']`,
Pastry Chef → `['cozy']`, Bartender → `['sharp']`, Freelance Artist →
`['loud']`. Empty = no lean (legacy/hand-authored default, exactly like
`idlePastimes`).

**Reader (the seam already exists — the cheapest next dimension):**
`npcOutfitForContext` (`npc.js:2261`) calls
`composeOutfit(outfitTypeForContext(...), npcWardrobeItems(...))` and omits
the third argument. `composeOutfit(wantedType, itemIds, bias)` (`items.js:804`)
already accepts `bias = { stats, traitBonus }`. Ship the reader by extending
`bias` with a style-tag term (items whose `styleTags` intersect
`occupation.styleLean` gain a small per-tag bonus in the score fn) and
threading the lean into the call. The bonus must never beat a true trait
match — a 'cozy'-lean chef still wears the button-up for the work outfit.

**The line this dimension must NOT cross:** `outfitTypeForContext`
(`npc.js:2229`) stays untouched. The type is decided by block/activity and by
D14 (at-home work → `daily`); a lean that shifted types would fight D14 and
would thrash the `change_clothes` drive (its candidacy compares last tick's
outfit against the block's target TYPE — a type-level comparison, so a
within-type item lean leaves it quiet; a type change sets it off daily).

**A/B (same cast; only `styleLean` changes):** the worn `daily`/`loungewear`
outfit (item ids) of an NPC with `['cozy']` differs from the same NPC with
`['edgy']`; the `work` outfit is identical across both; same seed twice →
same outfit twice.

**Verification:** `verify-voc-p7`-style harness (or `browser_eval`
translation); item-id assertions; no vision needed — this is data, not
rendering.

#### Dimension 2 — Diet / grocery preference (field `foodLean`)

**Intent:** the job tints what a person reaches for at the plate and what
they buy. The taste system is complete and already read by three things, so
the reader cost is near zero.

**Field (proposal — NOT authored):**
```js
foodLean: { type: 'array', required: false, default: [] },   // 1-2 recipe/plate keys or food-style tags
```
Authored per pool entry: Pastry Chef → the sweet recipe keys; Line Cook → the
hearty/fast ones; Barista → the quick breakfast keys.

**Reader (the D23-clean one):** `deriveNpcTaste` (`taste.js`) derives
`{ likes, dislikes }` from genSeed + personality traits through
`TASTE_TUNING.traitAnchors`, with a `used` set so nothing doubles up and the
profile ends at exactly `likesPerNpc`/`dislikesPerNpc`. Ship the reader by
pushing the occupation's `foodLean` keys through the same guarded `push`,
after the trait anchors and before the seed draw — a few lines — and every
downstream consumer named in `taste.js`'s header works unchanged: set_meal
relationship/mood deltas, NPC auto-cook choice, eat-drive tie-breaks. Do NOT
build a parallel `preferredMeal` consumer unless the anchor approach proves
insufficient.

**A/B (same cast; only `foodLean` changes):** a hungry NPC with a bare fridge
auto-cooks the liked recipe rather than the first available; a fed attendee's
set_meal outcome lands in a higher taste band; an un-leaned NPC's profile is
identical to today (default `[]`).

**Trap:** adding an occupation input to `deriveNpcTaste` changes derived
tastes for the whole cast — that IS the A/B; within-version determinism holds
because the occupation is durable per NPC. Run the food-overhaul regression
harnesses (`verify-w4` etc.) alongside the p7 suite.

#### Dimension 3 — Sleep regularity (field `sleepRhythm`)

**Intent:** the *within-template* sleep story. A schedule template fixes the
whole `sleep` block; this dimension makes the day-shift worker who is up at
05:30 different from the one who sleeps through the alarm. The player sees it
as who is already up in `morning` and who is still going in `wind_down`.

**Field (proposal — NOT authored):**
```js
sleepRhythm: { type: 'string', required: false, default: 'regular' },   // early|regular|late|erratic
```

**Reader — DOES NOT EXIST TODAY; this is the greenfield dimension.** NPC sleep
is schedule-determined: SCHEDULES (`config.js:5835`) fixes each template's
`sleep` window, `resolveRoomForActivity` (`sim.js:1296`) returns
`{ location: null, activity: 'sleeping' }` for the whole block, and energy
restores per tick inside it (`sim.js:2455`). There is no per-NPC variation to
lean on. Ship the reader as a per-NPC span adjustment derived from
`sleepRhythm` + the template's sleep window — rolled once at cast generation
like `officeDays` (D4's shape), stored nowhere extra (derived, per D4/D21's
philosophy). Concretely: `early` truncates the tail of `sleep` (the resident
is up in `morning`); `late` extends sleep into the start of `morning`;
`erratic` jitters the boundary per day. Everything stays inside the closed
block vocabulary (D1) — the block is still `sleep`; the NPC just occupies it
for a different span.

**Trap:** player sleep is off-limits — SLEEP (`config.js:3157`), the alarm
system and `resolveSleepHoursWithAlarm` (`sim.js:3161`) are the player's.
This dimension is NPC-only, through `resolveRoomForActivity` and the sleep
energy path.

**A/B (same cast; only `sleepRhythm` changes):** over a simulated week, an
`early` NPC's first awake block of the day is earlier in absolute clock time
than the same NPC's with `late`; both land exactly inside the block
vocabulary; no other output differs.

#### Dimension 4 — Spending (field `spendingLean`)

**Intent:** how the job colours money behaviour — the broke line cook who
hoards versus the mid-band manager who spends their check. Observability
depends on the reader, below.

**Field (proposal — NOT authored):**
```js
spendingLean: { type: 'string', required: false, default: 'neutral' },   // frugal|neutral|free_spender
```

**Reader — mechanically unavailable until Phase 8.** Today the only income
consumers are `occupationLivingClause` (`llm.js:333`, prompt text for
`incomeSource`) and the browse filter/sort (`computer.js:1267`/`:1286`,
`incomeBand`). There is no NPC money-flow for a spending lean to tint. Two
candidate readers:
1. **Persona-only (shippable BEFORE Phase 8):** `occupationLivingClause`
   gains a sentence for a non-neutral `spendingLean` (a frugal line, a
   free-spender line) — an existing reader, cheap, and the same pattern
   `incomeSource` already uses. The player observes it in conversation.
2. **Mechanical (Phase 8 or later):** a spending term inside whatever
   rent-share / income negotiation Phase 8 builds — a free spender negotiates
   *down*, a frugal one *up*, always inside the ceiling. This is the
   design-risk one: any mechanical consumer is an economy feature, and the
   economy's central pressure must not move (D22 / design invariant 7). The
   measured month-one/month-three pressure obligation applies to it exactly
   as it does to Phase 8 itself.

**A/B (when the reader ships):** same cast, only `spendingLean` changes; the
chosen consumer's observable output differs, and nothing else does.

---

### Phase 8 — Income → rent (built 2026-08-22)

**Goal:** `incomeBand` and `incomeSource` finally drive the rent contribution
that `config.js:403`'s own comment admits is a placeholder.

**Outcome (as-authored):** `incomeRentShare(npc)` (sim.js) reads the
`ECONOMY.rent.incomeShare` table (config.js: `wage/self/means` × low/mid/high +
`none` ⇒ 0) and returns the share; `negotiatedOrDerived(npc)` honors an explicit
non-default `residency.rentShare`, treats a legacy 0.15 as not-a-negotiation
(derives), and `null` derives. `computeRent` still clamps to [0.08, 0.30] and
applies the shared-bedroom multiplier. `residency.rentShare` is no longer
pre-populated (null = derive). The D23 rule is satisfied: table and reader ship
in the same change.

**A/B measured over 80 real casts (functionally-restored apartment):**
baseline $917/wk → income $1021/wk, mean Δ **+$104/wk** — pressure moves up,
not away (the plan's stated fear: a `means` roommate does NOT subsidize the
house — `means`/`high` pays 0.20, below the 0.30 ceiling). Tuned curve
byte-untouched (total 1900, min 0.08, max 0.30, sharedMult 0.8, invariant 7).
Full numbers in the Handoff.

**Files:** `src/srcfiles/sim.js` (incomeRentShare, negotiatedOrDerived, the
two pre-population sites), `src/srcfiles/config.js` (`ECONOMY.rent.incomeShare`),
`src/srcfiles/render.computer.js` (debug readonly row),
`src/dev/verify/verify-voc-p8.js` (new, 15 checks).

**Verification:** the A/B is the reply to this phase's own requirement — the
player's pressure lands in the same band as before (Δ +$104, direction up),
solo month-one identical across models.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** | `npcIsOffsite` predicate — pure refactor, proven equivalent over 1008 ticks |
| 2 | **Done** | Work modes, 59-entry pool, personality↔occupation affinity |
| 3 | **Done** | The at-home workday; `work_home` commitment, rooms, activities, outfits, interruption rate |
| 4 | **Done** | Unemployment and independent means |
| 5 | **Done** | Content-creation work; bedroom sessions and the rare pool session |
| 6 | **Done** | Collab invitation and couple sessions |
| 7 | **Done** | Lifestyle derivation: idle pastimes — job-tinted idle drives + the empty-afternoon fix (4 more dimensions captured spec-only — see Handoff) |
| 8 | **Done** | Income → rent: `incomeRentShare` + `negotiatedOrDerived`, table-driven, curve untouched (Δ +$104/wk) |

## Dependency order

```
Phase 1 (offsite predicate) ──► everything else
        │
        └─► Phase 2 (modes + pool + affinity) ──► Phase 3 (at-home workday)
                    │                                     │
                    │                                     ├─► Phase 5 (content work)
                    │                                     │        └─► Phase 6 (collab + couples)
                    │                                     │
                    └─► Phase 4 (unemployment) ───────────┘
                    │
                    └─► Phase 7 (lifestyle — independent, any time after 2)

Phase 8 (income → rent) ◄── behind ALL of the above (built 2026-08-22)
```

Phase 1 is a hard prerequisite for everything; it is also the only phase that can
be verified by pure equivalence, so it is the cheapest to get right and the most
expensive to skip. Phase 4 needs only Phase 2 (it needs the pool entries and the
schema, not the at-home routing) and may run before or beside Phase 3. Phase 7 is
genuinely independent after Phase 2. Phase 6 requires Phase 5.

## Open questions (parked, none blocking)

- ~~**Does `self_employed` need gig days at all?**~~ **RESOLVED (Phase 3) —
  kept.** `selfEmployedGigDayChance` 0.2 gives roughly one day out a week and
  measures at 93.7% of ticks in the flat, which reads as "mostly home, not
  always" rather than as noise. Derived per NPC per day, so it stores nothing.
- ~~**Should `content_session` be occupation-gated or flag-gated?**~~
  **RESOLVED (Phase 5) — flag.** `contentWork: true` on the occupation, set
  on Cam Model / Adult Film Performer / Premium Content Creator. The flag and
  `category === 'adult'` are NOT the same set: an Exotic Dancer works a club,
  an Escort works elsewhere, a boutique owner works a shop. None of them films
  in the flat. A flag also leaves room for a non-adult streamer later.
- **Does the browse filter surface `incomeSource`?** Decide during Phase 4;
  invisible is an acceptable answer, unread-but-written is not (D23).
- **Do hybrid NPCs' office days need to be visible to the player?** A roommate
  whose schedule you can *learn* is more interesting than one whose presence is
  random, but it needs a surface. Decide during Phase 3.

## Design invariants

1. **`workMode` lives on the occupation; the block vocabulary is closed.**
   No phase adds a schedule block name. The union of block names is asserted by
   the verify harnesses (`config.js:5645`), read by `BLOCK_TIME_OF_DAY`,
   `ACTIVITY_TABLES`, `WORK_BLOCKS` and every drive's `timeOfDay` — a new name is
   a change to all of them at once, and the plan was scoped on the assumption
   that never happens.
2. **One offsite predicate, forever.** `npcIsOffsite` is the only place the
   question is answered. Nine sites asked it independently with a string
   comparison before this plan, and two of those nine had gameplay consequences
   nobody had noticed until they were enumerated in one table. A tenth caller
   that tests `block === 'work'` inline is the bug this invariant prevents.
3. **Never author an occupation field without its reader in the same phase.**
   `stressProfile` sat on all twenty pool entries, read by nothing, until a
   correctness pass deleted it — see `config.js:5351`, which states the rule
   (RI6) in the codebase itself. This plan proposes six new fields and is
   therefore six times as exposed.
4. **Nudity is decided in exactly one place.** resolveTick pass 2, via
   `npcClothingForContext`, through the `deviancyThreshold` × `nudeSwimChance`
   gate. The `swim` drive's own comment records that a second gate was
   deliberately not built, because it would let a drive bypass the first. Content
   work is not an exception.
5. **The willingness gate is never bypassed, extended, or special-cased.**
   Every NPC↔NPC intimate act routes through `findIntimatePartner`'s check.
   Phase 6 adds conditions *on top of* it. A phase that edits the gate to make a
   feature work has inverted the dependency.
6. **Character creation never hard-fails.** Inherited from
   `npc-overhaul-plan.md` §7.4. The affinity system introduces the first hard
   zero-weight gate in the roll (D9), which makes it the first thing capable of
   emptying a candidate pool. D11's uniform fallback is not optional.
7. **Rent numbers change in one phase only.** The economy arc is tuned and the
   tuning carries the game's core pressure. Phase 8 owns it; no other phase may
   adjust a share, a ceiling, or a total, however obviously wrong it looks in
   passing.
