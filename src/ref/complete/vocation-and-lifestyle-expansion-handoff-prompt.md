You are one session in a long-running series implementing the **NPC Vocation
& Lifestyle Expansion** for this game — the overhaul that turns an NPC's job
from a character-independent absence generator into the thing that decides
whether they are home, where in the flat they are, what you can catch them
doing, and what kind of person the job says they are. Some roommates leave for
a shift; some work from the study all day; some have no job and money anyway;
a few work in the adult industry and film in their own room.

You have no memory of any previous session. Everything you need to know about
where things stand is either in the target document's **Handoff** section or
must be discovered by reading the current code — never assume continuity with
a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

---

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status` table
in `src/ref/wip/vocation-and-lifestyle-expansion-plan.md`.

The first phase not marked **Done** is your phase.

**As this prompt was written, Phases 1–6 were Done and Phase 7 was next.**
Confirm that from the table rather than assuming it. **Update: all eight phases
are now done — Phase 8 (income → rent) shipped first, then the four Phase-7
lifestyle dimensions (`styleLean` / `foodLean` / `sleepRhythm` / `spendingLean`)
shipped field+reader together (2026-08-22; see `verify-voc-p9.js`). The
plan is complete.**

**The exceptions and hard prerequisites:**

- **Phase 8 (income → rent) is DEFERRED BY DESIGN.** It is gated behind all
  of 1–7 *and* an explicit decision by the user to rebalance the economy. A
  future rent rebalance is the user's call, never a session's unprompted start.
  The reason is in the plan's own words: the rent curve is tuned, the tuning
  carries the game's central pressure, and a `means` roommate paying a realistic
  share could quietly remove the pressure the whole social sim is built on.
- **Never touch a rent number outside Phase 8.** Not a share, not a ceiling,
  not a total, however obviously wrong one looks in passing (design
  invariant 7).

If Phase 7 is Done and the user has already declined Phase 8, **stop** and
report the plan complete.

You should never need to read the whole plan document in a session — it is
long, and Step 1 names the four sections that matter.

---

## Step 1 — read the plan's Handoff section, then the relevant phase

- **Handoff first.** It is the single source of truth for where the last
  session left off, and for this plan it also carries four hard-won findings
  and a list of pre-existing test failures you must not go chasing.
- Then read `## Locked decisions` (D1–D23), `## Data model`, your phase block,
  and `## Design invariants`.
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** Find the real current location by name or
  content, never blindly by line number. A stale citation is expected, not an
  error — just use what you find and move on.
- If a phase's instructions conflict with the live code, or a locked decision
  turns out to be unworkable, **stop and flag it** — add a note under the
  Handoff's "Blockers / flagged deviations", explain exactly what you found,
  and end the session there rather than improvising a silent workaround.

### What the last implementation session already discovered about Phase 7

The plan predicted an unemployed NPC would out-act an employed one. **Measured,
they do not** — 708 drive-ticks against 819 over the same 2025 awake ticks.
The cause was measured directly rather than guessed: on an idle midday tick the
NPC has ~7.5 live candidates and the best of them scores **~0.356 against
`COGNITION.actionThreshold` of 0.40**. It is *not* cooldown exhaustion and
*not* an empty candidate list — 124 of 135 idle ticks are "options exist, none
appeals". Someone with all day free gets every need met early, and the drive
table has almost nothing that appeals *without* a need behind it.

That is Phase 7's real material: **low-stakes idle drives** (read a book, put
the TV on, scroll a phone) that clear the bar on appeal rather than on
desperation. **Do not "fix" it by lowering `actionThreshold`** — COGNITION's
own header says 0.40 is load-bearing, and lowering it would make the entire
cast twitchier rather than making one NPC's afternoon fuller.

---

## Step 2 — do exactly one phase, then stop

Implement **only** that phase. Phase boundaries here encode dependency order
and review granularity, and this plan has already been bitten once by a change
that reached further than its phase (see the Handoff's note 1).

### Reuse, don't approximate

Go read the current shape of these before writing anything that resembles
them — not the plan's paraphrase of them:

| What you need | Read this |
|---|---|
| A drive, authored | `DRIVE_DEFS.swim` and `DRIVE_DEFS.masturbate` in `config.js` |
| A drive's candidacy door | `DRIVE_CANDIDACY` in `cognition.js` |
| A commitment opened and held | `openHomeWorkCommitment` in `cognition.js` |
| An NPC-initiated ask | `OVERTURE_DEFS.collab_ask` + `OVERTURE_CANDIDACY` in `overture.js` |
| Outfit chosen from context | `outfitTypeForContext` in `npc.js` |
| Wardrobe traits and outfit types | `OUTFIT_TYPES` / `CLOTHING_DEFS` in `defs.world.js` |
| Food and taste, if diet is your dimension | `taste.js`, and `src/ref/complete/food-overhaul-plan.md` |

### Hard technical rules

Each of these has a consequence attached. They are not style preferences.

1. **D23 — never author a field without its reader, in the same phase.**
   This governs Phase 7 *absolutely*, and it is the rule most likely to be
   broken by a well-meaning session. The scar is in the bible schema in
   `config.js`, where `stressProfile` sat on all twenty occupation entries
   **read by nothing** until a correctness pass deleted it. Phase 7's own
   instruction is therefore: pick **one** lifestyle dimension, find or write
   the code that consumes it, ship both together, then pick the next. A field
   whose reader is "coming in a later phase" is not written to the schema yet.

2. **D1 — the schedule block vocabulary is CLOSED.** No phase adds a block
   name. `BLOCK_TIME_OF_DAY`, `ACTIVITY_TABLES`, `WORK_BLOCKS`, every drive's
   `timeOfDay`, and the harness assertions that pin the union of block names
   all key on the existing set — a new name is a change to all of them at
   once, and this plan was scoped on the assumption that never happens.

3. **D12 — there is exactly ONE offsite predicate, `npcIsOffsite` (`sim.js`).**
   Never write `block === 'work'` inline to decide whether someone is out of
   the flat. Nine sites did that before Phase 1, and two of the nine had
   gameplay consequences nobody noticed until they were listed in one table.
   `dev/verify/verify-voc-p1.js` pins the surviving inline block-name tests by
   exact count — if you add a legitimate one, update that count *and* its
   comment explaining why it is legitimate.

4. **Nudity is decided in exactly one place** (design invariant 4): resolveTick
   pass 2's `npcClothingForContext`, via the `deviancyThreshold` ×
   `nudeSwimChance` gate. A drive that sets nudity itself bypasses that gate.
   The `swim` drive's own comment records that a second path was deliberately
   not built.

5. **The willingness gate is never bypassed, extended, or special-cased**
   (design invariant 5). Every NPC↔NPC intimate act routes through
   `findIntimatePartner`, which is what calls `resolveWillingnessGate`. Add
   conditions *on top of* it. A phase that edits the gate to make a feature
   work has inverted the dependency.

6. **Character creation never hard-fails** (design invariant 6). The affinity
   system introduced the first hard zero-weight gate in the roll, which makes
   it the first thing capable of emptying a candidate pool. D11's uniform
   fallback in `rollCastSlot` is not optional.

7. **Do not reorder the RNG in `rollCastSlot` again without expecting fallout.**
   D6 moved the temperament roll above the occupation roll, which changes what
   cast a given seed produces. That is accepted and documented — but it
   invalidated several seed-tuned verify harnesses, and the last session had to
   repair `verify-w6` (two seeds re-tuned, two assertions corrected) and
   `verify-c1`/`verify-i4`. If you change that order again, budget for the same
   repair, and prefer fixing a wrong assertion over re-tuning a seed to hide
   one.

8. **A new `src/srcfiles/*.js` file needs a line in TWO places:** `index.html`'s
   `<script>` tags **and** `dev/verify/loadgame.js`'s `ORDER` array. `rumination.js`
   once shipped with only the first and **175 assertions silently stopped
   running** with a `ReferenceError` until someone noticed. Leave `ORDER`
   correct even though you may not be able to run it yourself.

9. **Bump the `?v=` query string in `index.html` for every source file you
   edit.** A browser serving a cached `config.js` against a fresh `cognition.js`
   produces a bug that looks like a logic error and is not one.

### Verification is not optional — and where it happens depends on your tools

**If you have Node and a shell**, this is simple and strictly preferred:

```
node dev/verify/verify-voc-p1.js        (44 checks)
node dev/verify/verify-voc-p1-equiv.js  (4)
node dev/verify/verify-voc-p2.js        (45)
node dev/verify/verify-voc-p34.js       (28)
node dev/verify/verify-voc-p56.js       (43)
```

All five were green when Phases 1–6 landed. **Run all five whatever phase you
are on** — they are the regression net for everything this plan has already
built — and add a `verify-voc-p7.js` in the same shape for your own phase.

**If you are a Perchance-native agent with no shell and no Node runtime**
(tools: `read`/`glob`/`grep`, `write`/`edit`/`patch`, `execute_js`,
`browser_eval`, `browser_refresh`, `vision`), the `dev/verify/*.js` suite is a
Node `vm`-based harness you cannot execute directly. **Do not skip the checks
because the literal file will not run for you.** Translate them:

1. `read` the referenced `dev/verify/verify-voc-*.js` file to see exactly what
   state it builds, which functions it calls, and what thresholds it asserts.
2. Reproduce the equivalent check with `browser_eval` against the **live
   generator page**. Every function these harnesses call — `resolveTick`,
   `resolveBatch`, `generateCast`, `scoreCandidates`, `npcIsOffsite`,
   `occupationAffinity`, `openHomeWorkCommitment` — is a plain global in that
   page's scope once `index.html` has loaded. Call the same functions, on the
   same kind of state, and assert the same thresholds inline.
3. **`browser_refresh` before trusting any check that depends on freshly
   edited code.** A loaded page will happily keep serving a stale copy of a
   file you just changed. Combined with rule 9 above (bump `?v=`), this is the
   difference between verifying your change and verifying the old one.
4. `execute_js` is an isolated worker with no DOM and no Node — fine for
   checking a formula's arithmetic in the abstract, useless for anything
   needing real game state. It cannot load `index.html`'s globals.
5. `vision` is for the parts whose verification is genuinely visual.

**Two checks apply to nearly every phase here and are easy to skip:**

- **Determinism within the version.** Generate the same cast from the same
  seed twice and require an identical result. Every phase of this plan touches
  something the cast roll can see.
- **A full simulated week that does not throw**, with at least one NPC of each
  `workMode` in it. Most of this plan's real bugs showed up as behaviour over
  a week rather than as an exception on one tick.

### Known-failing tests you should NOT go chasing

These were failing **before** this plan and are not yours to fix as part of it.
Confirmed by running the same probe against the committed tree:

- **`dev/verify/verify-c2.js` — the mid-hold activity assertion.**
  `npc.activity` diverges from `commitmentActivity(held)` for
  `do_laundry`/`eat`/`react_to_player`, on **12 of 12 seeds on both trees**.
  c2's fixed seed was simply lucky before D6's reorder. It is a real engine
  edge worth its own investigation; re-tuning c2's seed would only hide it.
- **`dev/verify/verify-c1.js` — the reachability sweep** for drives gated on a
  room or on desire (`masturbate`, `intimate`, `sext_partner`, `sneak_into_bed`,
  `swim`). The sweep's fixture cannot put an NPC into a firing state for these.
  It was improved during Phase 5/6 (private-bedroom and poolside arrangements;
  the block is now derived from the swept minute) but the desire-gated ones
  still cannot be reached.
- **`dev/verify/verify-w6.js` — "candidacy fires on a transition."**
  Pre-existing.

If you make one of these *worse*, that is yours. If it is failing exactly as
described above, leave it and say so in your handoff note.

### Then, stop

Once the phase is genuinely complete and verified, **stop.** Do not roll into
the next phase even with context budget left. One phase per session is the
point of this workflow.

---

## Step 3 — mandatory: write the handoff note before ending, every time

This is the last thing you do in every session, whether the phase finished
cleanly, is partway done, or is blocked.

1. **Overwrite** the plan's `## Handoff — read this first` section — do not
   append to a growing history:
   - **Resume at:** which phase, and if partial, the exact next action,
     specific enough that a session with zero context can continue without
     re-deriving anything.
   - **Last session's notes:** what got done, what got verified, and anything
     that surprised you. **Name the real identifiers you created** — the next
     session greps for them, and this plan's existing Handoff is written that
     way for exactly that reason.
   - **Blockers / flagged deviations:** or "None."
2. **Update the phase's row in the `## Status` table**, and the Status header
   line at the top of the document. Never leave the header, the table and the
   Handoff disagreeing — that is this project's most common recorded failure.
3. **Promote any resolved open question** out of `## Open questions` into
   `## Locked decisions` as a new D-number, and strike it from the parked list.
   Two were resolved this way already (gig days, and the `contentWork` flag) —
   match that format.
4. **Phase-specific obligation — Phase 7:** for **each** lifestyle dimension you
   ship, record in the Handoff (a) the field name, (b) **the reader that
   consumes it, by function and file**, and (c) the A/B result showing the
   observable output changes when only the occupation changes. D23 is
   unenforceable later without (b) written down.
5. **Phase-specific obligation — Phase 8, if it is ever run:** record the
   measured month-one and month-three player pressure against the pre-change
   baseline, as numbers. "It seems fine" is not a result, and nobody will go
   back and measure it for you.
6. **If this was the last phase**, mark the plan's Status header complete and
   move the document from `src/ref/wip/` to `src/ref/complete/` — then update
   its row in **both** `src/ref/README.md` and
   `src/ref/structural/ARCHITECTURE.md` in the same commit. Five docs were once
   deleted with eighteen live citations pointing at them because that was not
   done.

Do not end a session without doing this, even if you ran out of useful context
mid-phase. A half-finished phase with a precise Handoff note is recoverable; a
half-finished phase with no note is not.
