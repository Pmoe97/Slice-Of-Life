You are one session in a long-running series implementing the **Food
Overhaul** for this game — a living calorie-based metabolism replacing the
flat hunger clock, meals as real cooked-from-what-you-used plate instances
with a Servings bar and leftovers, a freezer that preserves food indefinitely
but gates it behind a reheat step (skip it and lose the mood bonus, or eat it
frozen and pay a mood cost unless it's meant to be eaten that way), an
interactive verb+stage+method cooking engine with F–S+ grades, equipment
tiers that modulate that engine and unlock grade-gated auto-cook, real dish
objects with capacity-modeled washing, an in-game recipe website with
unlock-on-taste and a meal planner, and NPCs who taste, auto-cook, and eat
calories too. You have no memory of any previous session. Everything you need
to know about where things stand is either in the target document's
**Handoff** section or must be discovered by reading the current code — never
assume continuity with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status`
table in `src/ref/wip/food-overhaul-plan.md`.

The first phase not marked "Done" is your phase. Phases must be done in
order, with these exceptions:

- Phase 1 and Phase 2 are mutually independent — either can run first. The
  plan orders 1 before 2 only because the pickup/freezer is the cheaper
  visible win, not because 2 depends on it.
- Phase 4 doesn't actually need Phase 2's kcal data (dish units carry no
  calories) even though it's numbered after it — usable the moment Phase 2
  lands, not blocked before then.
- Phase 7 splits internally: the NPC-*eating* half only needs Phase 3 (plate
  instances) and may start there if NPC hunger matters more than NPC
  auto-cooking in a given session; the NPC-*auto-cook* half needs Phase 6
  (equipment-lowered thresholds) and should wait for it.

**Hard prerequisites:** never Phase 3 before BOTH Phase 1 and Phase 2 (plates
need storage-class hints and kcal math); never Phase 5 before BOTH Phase 3
and Phase 4 (the engine builds plates through Phase 3's builder and gates
methods on Phase 4's cookware capabilities); never Phase 6 before Phase 5
(equipment modulates a `grade()` function that has to exist first); never
Phase 8 before Phase 5 (recipe cards publish from the engine). Phase 9 is
migration/balance and is always last.

If all phases are complete, **stop** and report that completion to the user.

You should never need to fully read the whole plan document in a session —
Handoff, "Locked decisions" once for the shape, then the specific phase block.

## Step 1 — read the plan's Handoff section, then the relevant phase

- Handoff first — it is the single source of truth for where the last
  session left off.
- Then "Locked decisions" (D1–D29 — D25–D29 are a same-day refinement pass
  on top of the original D1–D24 design session, covering the Servings bar
  and the freeze/reheat/thaw rules; don't skip them assuming they're less
  load-bearing than D1–D24), the "Data model" shapes, the phase block, and
  "Design invariants".
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** The Evidence table itself was already found
  wrong once during the design session (a "yields feed one eater" claim that
  turned out false against the real `RECIPES` table) — a stale or incorrect
  citation is expected, not an error. Find the real current location by
  name/content, not blindly by line number.
- If a phase's instructions conflict with what you find in the live code, or
  a locked decision turns out unworkable, **stop and flag it** — add a note
  under "Blockers / flagged deviations" and end the session there rather than
  improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** the phase you resumed or started. Phase boundaries here
  are deliberate — Phase 5 was split from a single "engine + equipment" phase
  specifically because it was too large to review as one unit; don't recreate
  that problem by pulling Phase 6 work into a Phase 5 session just because it
  would be convenient.
- When the plan says to reuse a pattern, go read that code and match its
  current shape — don't work from the plan's paraphrase. Patterns to mirror:
  - **Effect DSL / trusted producers:** `applyEffects`/`parseEffectDSL`/
    `buildEffectContext` (effects.js). Every new verb this plan introduces
    (`REHEAT_ITEM`, `SET_DISHES`/`ADD_DISHES`/`CLEAN_DISHES`,
    `TRANSFORM_ITEM`/`COOK_STEP`) goes through this exact pipeline — match
    the file's existing trusted-producer-vs-`validateEffects` convention
    rather than inventing a third path.
  - **Async picker actions:** `prepareCook` and the `self.eat` picker
    (defs.actions.js). Phase 3/5/6's rewritten `self.cook` is this same
    shape — an async `prepare()` step the player interacts with before
    effects apply.
  - **Continuous-clock anchors:** the `preparedAbs` freshness anchor and
    `processSpoilageForDay` (sim.js) — the model for the frozen/thaw state
    (`frozenAtAbs`/`thawStartAbs`/`thawProgress`, Phase 1): compute lazily
    from a stored absolute-clock timestamp read against the current clock,
    never a new per-tick mutation loop.
  - **Equipment tiers:** `src/ref/complete/renovation-occupancy-overhaul-plan.md`'s
    FACILITY_DEFS/RenoFix pipeline — Phase 6 reuses this wholesale, go read
    it rather than reinventing tiering.
  - **NPC eating:** `tryEatFood` (drives.js) — Phase 7 rewires its innards
    onto plate instances but keeps its call sites and shape.
  - **The Nile cart:** `computer.js`'s cart/`checkoutCart` path — Phase 8's
    "Add All Ingredients to Cart" reuses it exactly, doesn't parallel it.
  - **`dev/verify/` harnesses:** every `verify-*.js` ends with
    `` console.log(`  ${pass} passed, ${fail} failed`) `` and sets
    `process.exitCode` — `run-all.js` greps for that exact two-space-indented
    line to know a harness ran at all. Match it precisely in any new harness.
- **Hard technical rules** (each with its consequence):
  - **The live-state hazard in async picker actions.** Any action that
    awaits inside a `prepare()` step and then mutates game state afterward
    must re-derive the *live* `currentGameState`/NPC/objects after the
    await — never write through the reference captured before it. A
    heartbeat or checkpoint can replace `currentGameState` while a picker
    is open or an LLM call is in flight; effects applied to the stale
    capture silently vanish from the save. This exact bug was found and
    fixed three separate times this project (a documented prior fix, plus
    two fresh instances found this session) — it is not hypothetical.
    `self.cook`'s Phase 3/5/6 rewrite is precisely this shape and is a
    prime candidate to reintroduce it if written from scratch instead of
    from the existing pattern. Mirror `resolvePairedAct`'s or the current
    `resolveAsk`'s live-state handling exactly.
  - **Never swap `root.kv` inside `browser_eval`.** The "kv-swap protocol"
    (capture `realKv = root.kv` → assign a mem-kv stub → run → restore) that
    an earlier session documented is UNRELIABLE in the live page: the swap
    does not fully take effect on reads, and state.js's debounced
    `queueWrite`/`saveAtBoundary` flushes land in the REAL kv afterward
    (Phase 1 session: the real kv's meta/player/objects were overwritten
    with a throwaway `SIM_generateHouse` state, `meta.versions` became `{}`,
    and boot died with "Migration incomplete for meta: at 0, expected 2";
    recovery was `root.kv.meta.delete('meta')` + clearing the write queue +
    `resumeFromRecord` from the newest intact `kv.saves` record). The SAFE
    pattern for DOM-flow evals that would persist: stub `saveAtBoundary` and
    `queueWrite` to no-ops (and clear `writeQueue` + cancel its timer) for
    the duration of the eval, then restore them — zero kv writes, zero risk.
  - **`loadgame.js`'s `ORDER` array must list every file `index.html` loads,
    updated in the same commit.** `cooking.js` (new, Phase 5) needs a line
    in both the moment it exists. Missing this is not cosmetic: a file that
    ships in `index.html` but not `ORDER` makes every `dev/verify` harness
    that touches it die with a silent `ReferenceError`, and *that harness
    stops reporting instead of failing* — it happened for real in this
    project (`rumination.js` shipped without an `ORDER` line and 175
    assertions across five harnesses silently stopped running). Confirmed
    real this same week from the other direction too: five brand-new
    `verify-*.js` files in this repo had plain syntax errors and had never
    once executed before anyone noticed.
  - **A `verify-*.js` that hasn't actually been run is not verified.**
    `node --check` proves syntax, not correctness — run any new or touched
    harness for real (`node dev/verify/verify-<name>.js`) and confirm it
    prints the pass/fail summary line, then run `node dev/verify/run-all.js`
    and confirm zero "DID NOT REPORT" lines before ending the session.
  - **Kcal is the only metabolic writer** (Design invariant 2). No phase
    writes `player.hunger` directly outside a `satietyFrom`-style recompute
    — route through the same `ADJUST_NEED`/effects path the existing hunger
    system uses.
  - **NPCs stay a single hunger number** (Design invariant 3). The eat
    drive converts calories to NPC hunger at consume time and never touches
    `player.meta`'s kcal ledger — a shared *helper* between player and NPC
    eating is fine, a shared *ledger* is not.
  - **A cooked plate is a snapshot** (Design invariant 1). Once
    `stack.meta.plate` is computed at cook time, later `RECIPES`/config
    changes must never retroactively rewrite food already sitting in the
    fridge.
- **Actually run the phase's Verification steps** — don't mark a phase done
  because the code looks right. Verification happens in two places,
  depending on what the phase touches:
  - **Pure logic** (`items.js`/`effects.js`/`sim.js`/`cooking.js`/`drives.js`
    functions — `storageClassOf`, `sortIntoStorage`, `thawProgress`,
    `makePlate`, `grade`, `autocookThreshold`, the eat-drive rewrite) is
    cheaper and belongs in a new `dev/verify/verify-food-<phase>.js`
    harness, following the `loadgame.js` ORDER + summary-line conventions
    above. `dev/verify/loadgame.js` brings up the real engine in a bare
    Node `vm` — no DOM, but every pure function is directly callable.
  - **Anything DOM/UI-facing** (the doormat pickup flow, the cook screen,
    picker/render changes, the recipe website) needs the **live Perchance
    page** via `browser_eval`/`browser_refresh` — `dev/verify` stops before
    `render.js`/`ui.js` by design and proves nothing about them.
  - At minimum for every phase: (1) the save/load round-trip if the phase
    touches persisted state, and (2) the "DID NOT REPORT" check above for
    any dev/verify harness you touched or added.
- Once a phase is genuinely complete and verified, **stop.** Do not roll into
  the next phase in the same session, even with budget left — one phase per
  session is the point.

## Step 3 — mandatory: write the handoff note before ending, every time

This is the last thing you do in every session, whether the phase finished
cleanly, is partway done, or is blocked:

1. Overwrite the plan's `## Handoff — read this first` section (don't append
   to a growing history):
   - **Resume at:** which phase, and if partial, the exact next action.
   - **Last session's notes:** what got done, what got verified, anything
     that surprised you — name the real identifiers/functions/tuning values
     you created, because the next session greps for them by name.
   - **Blockers / flagged deviations:** anything you stopped on, or "None."
2. Update the phase's row in the plan's `## Status` table — never leave
   Status and Handoff disagreeing.
3. Promote any resolved open question into "Locked decisions" as a new
   D-number and strike it from "Open questions" — several are tied to
   specific phases (the sink hard-block question to Phase 4, the freezer
   object-vs-tier question to Phase 1, the meal-bonus metric to Phase 3, the
   NPC taste source to Phase 7); a session landing that phase should
   explicitly decide or deliberately re-park it, not silently skip it.
4. Record any measured numbers the phase produced that nobody else will go
   measure — the Phase 2 kcal data pass's spot-check results, Phase 6's
   actual tier-1-vs-tier-3 grade distribution/burn-rate numbers, any new
   `THAW_TUNING`/`METABOLISM` constants and why they landed where they did.
5. If this was the last phase, mark the plan's Status header complete and
   move the plan + this prompt to `src/ref/complete/` (update the
   `src/ref/README.md` and `src/ref/structural/ARCHITECTURE.md` indexes in
   the same commit — a plan and its prompt move as a pair).

Do not end a session without doing this. A half-finished phase with a precise
Handoff note is recoverable; a half-finished phase with no note is not.
