You are one session in a long-running series implementing the **Inventory,
Needs, Main Menu & Save System** overhaul for this game — building a real RPG
inventory over the item data the game already has, making its ~200 orderable
food items actually edible, giving food real spoilage that turns into mess and
odor, rebalancing needs so hunger stops being a treadmill and mood stops being
a bar that only falls, giving NPCs possessions that matter, and wrapping the
whole thing in a proper main menu and a visual-novel-style multi-slot save
system. You have no memory of any previous session. Everything you need to
know about where things stand is either in the target document's **Handoff**
section or must be discovered by reading the current code — never assume
continuity with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status` table
in `ref/inventory-needs-menu-saves-plan.md`.

The first phase not marked "Done" is your phase — go to Step 1. The phases
must be done in order, with two deliberate exceptions:

- **Phase 9 (saves) and Phase 10 (menu) are independent of Phases 1–8** and of
  each other. A session that lands on either out of strict order is fine, but
  prefer to run them last so Phase 9 captures the finished schemas.
- **Phase 5's constants-only step** (the `NEEDS` numbers and
  `idleDecayMultiplier`) may be pulled forward at any time if playtesting is
  blocked on the current rates. This is the only sanctioned partial-phase work
  in the plan — if you do it, say so precisely in the Handoff note and leave
  Phase 5 marked "In progress," not "Done."

Never skip Phase 1 before 2, 3, 4, 7 or 8 (they all sit on the inventory
core). Never skip Phase 3 before Phase 7 (Set Meal needs eating to exist).
Never skip Phase 5 before Phase 6 (the happiness content has nothing to feed
until mood is an impulse system).

**Phase 10 has a required companion read:** `ref/perchance-menu-conventions.md`
is a source-level record of how the user's other generators build their menu
and slideshow, and it is the style authority for that phase. Read the sections
Phase 10 names before writing menu code — but read Phase 10's **"Deliberate
deviations"** list first, because several reference behaviours are documented
specifically so they are *not* copied.

If all phases are complete, **stop** and report that completion to the user.

You should never need to fully read the whole plan document in a given
session — read the Handoff section, the "Locked decisions" and "Data model"
sections once so you understand the shape, then the specific phase block
(Goal / Files / Verification) for the phase you're on.

## Step 1 — read the plan's Handoff section, then the relevant phase

- The plan's `## Handoff — read this first` section is the single source of
  truth for exactly where the last session left off — read it before anything
  else.
- Then read the plan's **"Locked decisions"** (thirteen numbered decisions,
  D1–D13; every phase depends on them and they were settled with the user in a
  design session — do not relitigate one mid-implementation), the **"Data
  model"** section (the stack `meta` contract, container defs, freshness
  table, derived hunger/mood, `world.commitments[]`, the save record), and the
  specific phase block you're resuming or starting.
- Read **"Design invariants"** at the bottom of the plan before writing any
  code. They are short, and violating one is the main way this overhaul can go
  quietly wrong.
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** These documents drift as the codebase changes
  under them — a citation may have moved since it was written. Find the real
  current location by name/content, not blindly by line number. A stale
  citation is expected, not an error; just use what you find and move on.
- If a phase's instructions conflict with what you find in the live code, or a
  locked decision turns out to be unworkable given how something else actually
  works, **stop and flag it** — add a note under the Handoff section's
  "Blockers / flagged deviations," explain exactly what you found, and end the
  session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** the phase you resumed or started — no more. Don't pull
  forward work from a later phase even if it looks convenient right now; the
  phase boundaries are deliberate (dependency order, risk, and verification
  granularity all assume phase-sized chunks, and each phase is meant to be
  reviewed on its own).
- When a phase says to reuse an existing pattern, go read that existing code
  first and match its actual current shape — don't approximate from the doc's
  paraphrase. Patterns you will be told to mirror: the uniform stack helpers
  (`addStack`/`removeStack`/`stackQty`, items.js), the location-ref indirection
  that makes `'player'` and a container id interchangeable
  (`locationStackListMutable`, effects.js), the effect-DSL line format consumed
  by `applyEffects`, the world-sub-key persistence block in `saveAtBoundary`
  (state.js) and the `world.phone` lazy-init pattern beside it, the per-folder
  `MIGRATIONS` chain (state.js), the existing cleanliness machinery
  (`cleanlinessWeight`/`dirtyWhen` in defs.world.js, `cleanRoomObjects` in
  computer.js), the `world.visits[]` spine (sim.js) that `world.commitments[]`
  is modelled on, and the `<template>`-cloning convention in render.js.

- **Two latent bugs must be fixed at the top of their phase, before anything
  else in it.** Both are silent today and will corrupt the phase that depends
  on them:
  - **B1 (Phase 8):** `applyConsumeItem` (effects.js) hardcodes
    `who: 'player'`. `CONSUME_ITEM` needs a `who` param defaulting to
    `'player'`. No NPC can eat anything until this lands.
  - **B2 (Phase 4):** `addStack` (items.js) merges on `defId + ownerId`, which
    destroys per-cohort freshness the moment stacks carry spoilage data. The
    merge key must become `defId + ownerId + cohort` before any spoilage code
    is written.

- **Hard technical rules every phase must respect:**
  - **All state mutation routes through `applyEffects`.** `items.js` and
    `inventory.js` are pure — query and sort only. Never mutate a stack list
    directly from a renderer or a handler.
  - **One stack shape everywhere:** `{ defId, qty, ownerId, meta }` — player
    bag, container `.contents`, and `npc.inventory` alike. Never introduce a
    parallel item representation.
  - **Freshness is derived from elapsed days, never stored as a countdown.**
    It must survive saves, reloads, and multi-day time skips.
  - **Inventory is uncapped.** The pressure is spoilage (D4). Never reintroduce
    weight or slot limits.
  - **After Phase 5, nothing writes `player.mood` directly** — mood sources
    emit decaying impulses into `eventTerm`. Existing
    `ADJUST_NEED player mood +X` lines keep their syntax and must keep working.
  - **After Phase 3, no action restores a need from nothing.** Any hunger gain
    is backed by a consumed item.
  - **Never enumerate persisted keys in two places.** After Phase 9, `SAVE_KEYS`
    is the single table and both the autosave path and the snapshot path read
    it. Any new persisted state must be added there *and* verified to survive a
    save/load round-trip — `castWeb` silently never persisted for months
    because it was missed in exactly this way.
  - **Every tuning number goes in `config.js`** next to its neighbours, never
    inline at the call site. The codebase already carries a duplicated tuning
    surface where one copy was silently inert — don't add another.
  - **Acting from the inventory panel costs the same game time as the
    equivalent action chip** and goes through `advanceAndResolveMinutes`. The
    panel must never become a way to sidestep the clock, and needs must decay
    exactly once per action, not twice.
  - **The main menu never renders blank** — the gradient layer sits behind the
    image layers permanently, so zero images is a designed state. The slideshow
    degrades generation failure → cache → gradient with **bounded** retries;
    never reproduce the reference games' uncapped 500 ms retry loop.
  - **`ref/perchance-menu-conventions.md` is a reference, not a spec.** It
    documents real published code including its bugs, and the doc's own
    section 6 flags eight of them. Phase 10 lists exactly what to adopt and
    what to deviate from — follow that list, not the reference doc's defaults.
    Two things in particular are **never** ported: its always-NSFW,
    ungated slideshow prompts (this game gates on `meta.contentConfig`), and
    its practice of storing full multi-megabyte data-URLs in kv.
  - **The save system is novel and is not based on any prior game.** Section 5
    of the conventions doc describes `hedonism-island`'s `SaveManager` and the
    other two games' single-localStorage-key saves. The user has explicitly
    ruled these out as a basis. Do not import their record shape, key naming,
    or storage strategy into Phase 9 — build the design in the plan's "Data
    model" section.
  - Bump the `?v=` query on **every** changed script tag in `main.html`
    together, and update the load-order comment in the SCRIPTS section header
    if the script list changes. New files (`inventory.js`, `commitments.js`,
    `menu.js`) load after their dependencies — `inventory.js` after `items.js`,
    `commitments.js` after `sim.js`, `menu.js` after `ui.js`.

- **Actually run the phase's Verification steps before considering it done** —
  don't mark it complete because the code looks right. Verification happens on
  the live perchance page via `browser_eval` (and `vision` for layout checks).
  A phase's Verification block lists exactly what to check; at minimum drive
  the phase's core flow end-to-end and assert its key invariants. Two checks
  apply to nearly every phase and are easy to skip:
  - **save/load round-trip** — whatever state the phase added is still correct
    after a reload, not just in memory
  - **needs/clock accounting** — the phase's new actions advance time and decay
    needs exactly once

- Once a phase is genuinely complete and verified, **stop.** Do not roll into
  the next phase in the same session, even if you have context budget left —
  one phase per session is the point of this workflow.

## Step 3 — mandatory: write the handoff note before ending, every time

This is the last thing you do in every session, whether the phase finished
cleanly, is partway done, or is blocked:

1. Update the plan's `## Handoff — read this first` section (overwrite it,
   don't append to a growing history):
   - **Resume at:** which phase, and if partial, the exact next action —
     specific enough that a session with zero context beyond this note can
     continue without re-deriving anything.
   - **Last session's notes:** what got done, what got verified, anything that
     surprised you (moved citations, a small necessary deviation and why,
     actual ids/shapes/field names added). Name the real identifiers you
     created — the next session will grep for them.
   - **Blockers / flagged deviations:** anything you stopped on, or "None."
2. Update the phase's row in the plan's `## Status` table: "Done," "In
   progress," or leave "Not started" if you didn't get to it — never leave
   Status and Handoff disagreeing with each other.
3. If your phase resolved one of the plan's **Open questions**, move the
   decision into "Locked decisions" as a new D-number and strike it from Open
   questions. If it raised a new one, add it there.
4. **Phase 9 only:** record the measured size of a real save snapshot in the
   Handoff note. The storage-mitigation decision depends on that number and
   nobody else will measure it.
5. If you completed the last phase of the plan, mark the plan's Status header
   line accordingly so Step 0 of the next session correctly reports the work as
   done.

Do not end a session without doing this, even if you ran out of useful context
mid-phase — a half-finished phase with a precise Handoff note is recoverable;
a half-finished phase with no note is not.
