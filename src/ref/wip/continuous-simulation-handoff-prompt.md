You are one session in a long-running series implementing the **continuous
simulation overhaul** for this game — removing the 30-minute tick as the
unit NPC decisions happen in, across five linked plans: NPCs get real
absolute-minute commitments and physically walk to real anchors instead of
teleporting between schedule blocks; their needs decay on a fine heartbeat
instead of jumping once per tick; the outside world's visits, restaurant
hours, deliveries, and gigs run on the same absolute clock; NPC-initiated
overtures use cooldowns that can no longer wrap and silently never elapse;
and a new "Home" app lets the player actually furnish a room so there's
somewhere for "watch TV" to anchor to. You have no memory of any previous
session. Everything you need to know about where things stand is either in
the target document's **Handoff** section or must be discovered by reading
the current code — never assume continuity with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which document or phase to work on — find it yourself using the steps
below.

---

## Step 0 — find out where you are (cheap: Status tables, not full docs)

Five documents carry phases; a sixth (the roadmap) does not and is read
differently — see the note at the end of this step.

```
src/ref/complete/continuous-behavior-engine-plan.md
src/ref/complete/needs-and-heartbeat-plan.md
src/ref/complete/external-world-retiming-plan.md
src/ref/complete/npc-initiative-retiming-plan.md
src/ref/complete/decor-economy-plan.md
```

**The order is not "check each file top to bottom" — the five plans have
real dependencies on each other.** Read only the `## Status` table near the
bottom of each document you touch, and use this fixed, dependency-safe
checklist. Go top to bottom; **the first row not marked "Done" is your
phase for this session:**

| # | Document | Phase |
|---|---|---|
| 1 | `continuous-behavior-engine-plan.md` | Phase 1 — commitment substrate |
| 2 | `decor-economy-plan.md` | Phase 1 — catalog and checkout *(DONE — built, see `complete/`)* |
| 3 | `decor-economy-plan.md` | Phase 2 — placement screen *(DONE — built, see `complete/`)* |
| 4 | `continuous-behavior-engine-plan.md` | Phase 2 — event-driven scheduling |
| 5 | `continuous-behavior-engine-plan.md` | Phase 3 — duration/anchor resolution |
| 6 | `decor-economy-plan.md` | Phase 3 — anchor-availability proof *(DONE — built, see `complete/`)* |
| 7 | `continuous-behavior-engine-plan.md` | Phase 4 — physical layer |
| 8 | `continuous-behavior-engine-plan.md` | Phase 5 — work/commute, interrupts, catch-up |
| 9 | `needs-and-heartbeat-plan.md` | Phase 1 — rate conversion |
| 10 | `needs-and-heartbeat-plan.md` | Phase 2 — heartbeat accumulator |
| 11 | `needs-and-heartbeat-plan.md` | Phase 3 — closed-form fast-forward + phone/memory |
| 12 | `needs-and-heartbeat-plan.md` | Phase 4 — tuning |
| 13 | `external-world-retiming-plan.md` | Phase 1 — visit spine *(DONE — built, see `complete/`)* |
| 14 | `external-world-retiming-plan.md` | Phase 2 — restaurant hours *(DONE — built, see `complete/`)* |
| 15 | `external-world-retiming-plan.md` | Phase 3 — delivery ETAs *(DONE — built, see `complete/`)* |
| 16 | `external-world-retiming-plan.md` | Phase 4 — gig work blocks *(DONE — built, see `complete/`)* |
| 17 | `npc-initiative-retiming-plan.md` | Phase 1 — config field conversion |
| 18 | `npc-initiative-retiming-plan.md` | Phase 2 — `isOnCooldown`/`setCooldown`/`recencyMultiplier` |
| 19 | `npc-initiative-retiming-plan.md` | Phase 3 — population re-measurement |
| 20 | `continuous-behavior-engine-plan.md` | Phase 6 — tuning and the live pass |

**Why this exact order, and the one hard rule in it:** rows 2–3 and 6 are
**already Done** — `decor-economy-plan.md` is fully built and has moved to
`complete/` (its own Status table says so), so a session reading its Status
table sees every row done and skips past it; the rows are kept so the row
numbering stays stable. Their original rationale — "a real furnished room
exists before behavior-engine's anchor resolution needs one to test
against" — has already played out. Rows 13–16 are likewise **already Done** —
`external-world-retiming-plan.md` is fully built and has moved to
`complete/` (its own Status table says so), for the same reason the rows
are kept: stable row numbering. Row 1 must go first — every other
remaining row needs `clockToAbsolute`-space timing to exist as the target
shape. Row 20 is placed **last, deliberately** — it is a live "watch it and
see if the routines feel right" pass, and watching it before rows 9–19
land would mean judging NPC behavior against needs decay, restaurant
hours, and cooldowns that are still running on the stale tick grid, which
would give a false read.

**The one real exception:** rows 13–16 (`external-world-retiming-plan.md`'s
four phases) are mutually independent — that document's own Dependency
order section says so. Do them in any order among themselves if you have a
reason to; don't reorder anything else in this table without flagging it
(Step 1). *(Moot now — all four rows are Done; kept so the numbering stays
stable, the same way rows 2–3 and 6 are.)*

If every row above shows "Done," **stop** and report that completion to the
user — do not invent further work, and do not start on `## Open questions`
sections, which are explicitly parked, not queued.

You should never need to fully read more than **one** of the five documents
in a given session, and never the whole roadmap.

**The sixth document, `src/ref/wip/CONTINUOUS-SIMULATION-ROADMAP.md`, has no
phases of its own** — it's an index. Open it only if a phase's own doc
tells you to (cross-cutting decisions `C1`–`C8` live there, referenced by
name from every plan) or per Step 3's closing instruction below.

---

## Step 1 — read your document's Handoff section, then the relevant phase

- Your document's `## Handoff — read this first` section (right near the
  top) is the single source of truth for exactly where the last session
  left off — read it before anything else.
- Then read the document's "The thesis" and "Locked decisions" sections
  (short, and every phase depends on them), its "Data model" if the phase
  touches a data shape, and the specific phase block (Goal / Files /
  Verification) you're resuming or starting.
- **Cross-check every cited file and line number against the actual
  current code before trusting it**, using `read`/`grep`/`glob`. These
  documents drift as the codebase changes under them — a citation may have
  moved since it was written. Find the real current location by name/
  content, not blindly by line number. A stale citation is expected, not
  an error; just use what you find and move on.
- If a phase's instructions conflict with what you find in the live code,
  or a "locked decision" turns out unworkable given how something else
  actually works, **stop and flag it** — add a note under the document's
  Handoff section's "Blockers / flagged deviations," explain exactly what
  you found, and end the session there rather than improvising a silent
  workaround. A silent workaround is the single most expensive failure in
  this workflow: it looks like progress and is only discovered phases
  later, by someone with far less context than you have right now.

---

## Step 2 — do exactly one phase, then stop

### Scope

Implement **only** the phase you resumed or started — no more. Don't pull
work forward from a later row of Step 0's table even if it looks
convenient right now; the row order encodes real dependency and risk, and
each phase is meant to be reviewed on its own.

### Reuse, don't approximate

When a phase says to mirror an existing pattern, go **read** that code
first with `read`/`grep` and match its actual current shape — don't work
from this document set's paraphrase of it. The load-bearing patterns
across this roadmap:

- `cognition.js`'s `scoreDrive` / `scoreCandidates` / `choosePursuit` /
  `shouldBreakPursuit` — the utility scorer every commitment decision
  reuses. It is being *extended* (new units, new call timing), never
  rewritten.
- `clockToAbsolute` / `clockFrame` (`time.js`) — the absolute-minute
  arithmetic every one of the five plans hangs its conversion off. Read
  `clockFrame`'s existing `gameMinutes = (cappedDeltaMs/1000) * (scale/60)`
  formula (time.js:169) before touching anything that integrates position
  or time per frame — it is not to be reinvented.
- `resolveTimeCost`, `executeAction` (`actions.js`) — the action pipeline
  `continuous-behavior-engine-plan.md` generalizes to non-player actors.
- `resolveWalk` / `planWalk` conventions
  (`src/ref/wip/floorplan-and-movement-plan.md`, status: built) — the
  walking/pathing machinery behavior-engine's Phase 4 absorbs rather than
  rebuilds.
- `checkoutCart`, `processDeliveriesForDay` (`computer.js`/`ui.js`) —
  Nile's exact checkout/delivery mechanism, reused unmodified by
  `decor-economy-plan.md`. Read `checkoutCart` in full before touching it
  (computer.js:658) — decor-economy-plan.md's own Phase 1 Files entry
  quotes its real current shape, not a guess.
- `dev/designer.html`'s select/drag/resize/rotate handles — the DOM/SVG
  interaction code decor-economy's in-game placement screen reuses
  directly, not reimplements.
- `isOnCooldown` / `setCooldown` (`drives.js`) — the one shared cooldown
  mechanism `npc-initiative-retiming-plan.md` converts. Its D3 names every
  known caller, including a second wrapped-delta copy in
  `cognition.js`'s `recencyMultiplier` that does **not** call
  `isOnCooldown` — read that function too, don't assume the shared
  mechanism is the only place the pattern appears.
- `decayPlayerNeeds`'s existing `ticks` multiplier — the closed-form
  fast-forward shape `needs-and-heartbeat-plan.md` generalizes to a
  `minutes` multiplier.

### Hard technical rules

These survive every phase in this roadmap, not just the one you're on:

1. **Determinism and purity are non-negotiable (C6).** Whatever replaces
   `resolveTick`'s decision step stays synchronous, in-memory, and never
   calls a model or awaits network I/O. This is not a style preference —
   every autonomy feature in this game, and every regression test in
   `dev/verify/` (even the ones you personally cannot run — see
   Verification below), assumes this. Breaking it breaks testability for
   every future session silently, until someone with the tooling to
   notice does.
2. **`state.js` is the sole kv access point.** A new module never calls
   `root.kv` directly — go through `state.js`'s existing accessor
   pattern (`getObjectBucket`/`setObjectBucket` and siblings are the
   worked example).
3. **A new `src/srcfiles/*.js` file needs a line in TWO places: `main.html`'s
   `<script>` tags AND `dev/verify/loadgame.js`'s `ORDER` array** — even
   though you cannot run `loadgame.js` yourself (see Verification), leave
   it correct for whoever/whatever does next. `rumination.js` shipped with
   only the first and **175 assertions silently stopped running** with a
   `ReferenceError` until someone noticed (`dev/verify/README.md` rule 6).
   Don't repeat that.
4. **Save-migration was explicitly waived by the person who owns this
   decision — the game hasn't shipped.** You may reshape existing
   fields/records however the plan calls for, with no migration function
   required. This does **not** mean skip defaults on brand-new keys —
   that's not migration, that's just not crashing. A genuinely new
   `world`/`meta` key still needs a safe `getX('...') || defaultX()` read
   (`defaultComputerState()` is the project's own worked example), the
   same way any new feature would regardless of this plan's waiver.
5. **Determinism of seeding carries forward under the new unit.** Where a
   phase touches a `seededRng(seed, ...)` call, the seed string's shape
   may change (e.g. D7: `` `tick_${day}_${tick}` `` →
   `` `npc_${npcId}_decision_${absoluteMinute}` ``) but a given save seed
   must still reproduce a given game byte-for-byte. If you're not sure a
   change preserves this, flag it rather than assume it does.

### Your tools, and how they map onto this workflow

You have `read`, `glob`, `grep`, `list_code_definition_names` (reading);
`write`, `edit`, `patch`, `copy_lines` (editing); `execute_js`, `browser_eval`,
`browser_refresh` (running code); plus `fetch_url`/`fetch_generator`,
image/music generation, and `vision`. **You have no shell and no Node
runtime.** That matters a lot for how "Verification" works in these five
documents, because they were written referencing this repo's existing
`dev/verify/*.js` suite, which is a **Node** `vm`-based harness
(`node dev/verify/run-all.js`) — you cannot execute it directly.

**The translation rule, which applies to every Verification section in
every one of the five plans:** wherever a phase says "run
`dev/verify/X.js`" or "reuse `Y`'s methodology," don't skip the check
because the literal file won't run for you — translate it:

1. `read` the referenced `dev/verify/*.js` file to see exactly what state
   it builds, which functions it calls, and what thresholds it asserts.
2. Reproduce the equivalent check with `browser_eval` against the real,
   live generator page — every function these harnesses call
   (`resolveTick`, `evaluateDrives`, `perceiveSignals`, and everything
   this roadmap adds) is a plain global in that page's scope once
   `main.html` has loaded, the same way this project's own
   `structural/ARCHITECTURE.md` documents for its iframe-injection
   technique. Call the same functions, on the same kind of synthetic or
   real game state, and assert the same thresholds inline in your
   `browser_eval` script.
3. `browser_refresh` before trusting any check that depends on freshly
   edited code — a loaded page can silently keep serving a stale copy of
   a file you just changed, exactly the caching hazard
   `dev/verify/README.md`'s DOM-testing section warns about for its own
   iframe technique. When in doubt, refresh.
4. `execute_js` (an isolated worker, no DOM, no Node) is useful for a
   quick isolated sanity check that doesn't need the real engine loaded —
   e.g. confirming a rate-conversion formula's arithmetic in the abstract.
   It cannot load `main.html`'s script-tag globals (no DOM to attach
   them to), so it is not a substitute for `browser_eval` on anything
   that needs real game state.
5. `vision` is for the phases whose own Verification is inherently visual
   rather than a threshold check — behavior-engine's Phase 4 (the render
   split, avatar markers moving) and Phase 6 (the live tuning pass,
   explicitly "checked by eye" in that phase's own text). Use it against
   the live page rather than guessing correctness from code alone.

If a session with real Node/shell access ever picks up this roadmap
instead, the actual `dev/verify/*.js` suite is strictly preferred over
this translation — it's faster and has no snapshot-staleness problem
(`dev/verify/README.md` says so about its own preferred order). This
translation rule is this environment's fallback, not a replacement for
that preference.

### Then, stop

Once a phase is genuinely complete and verified by the means above, **stop.**
Do not roll into the next row of Step 0's table in the same session, even
with room left — one phase per session is the point of this workflow.

---

## Step 3 — mandatory: write the handoff note before ending, every time

This is the last thing you do in every session, whether the phase finished
cleanly, is partway done, or is blocked. Do it even if you ran out of
useful context mid-phase — a half-finished phase with a precise Handoff
note is recoverable; a half-finished phase with no note is not.

1. **Overwrite** the document's `## Handoff — read this first` section
   (don't append to a growing history):
   - **Resume at:** which phase, and if partial, the exact next action —
     specific enough that a session with zero context beyond this note can
     continue without re-deriving anything.
   - **Last session's notes:** what got done, what got verified and how
     (name the actual `browser_eval` checks you ran and what they
     returned — a future session with no memory needs the real numbers,
     not "it worked"), anything that surprised you (a moved citation, a
     small necessary deviation and why).
   - **Blockers / flagged deviations:** anything you stopped on, or
     "None."
2. **Update that phase's row in the document's `## Status` table** —
   "Done," "In progress," or leave "Not started" if you didn't reach it.
   Never leave Status and Handoff disagreeing with each other.
3. **Promote any open question you resolved** (in this document's own
   "Open questions" section, or one this session's reading closed) into
   "Locked decisions" as a new, numbered D-entry — don't just delete the
   question, record the answer the way this session's own cross-check
   pass added D5/D13 to two of these documents as a worked example.
4. **If this session completed the document's last phase:**
   - Update that document's Status **header** line (top of the file) to
     match the Status table, e.g. `Status: **built** — all N phases...`,
     mirroring how every other completed plan in this repo states it.
   - Move the file from `src/ref/wip/` to `src/ref/complete/` — this
     shared prompt and `CONTINUOUS-SIMULATION-ROADMAP.md` itself both
     **stay in `wip/`** even once every plan underneath them is done
     (this matches the precedent `SENSORY-AND-SOCIAL-ROADMAP.md` set: its
     six constituent plans moved to `complete/` one at a time while the
     roadmap and its own tooling stayed put as the index).
   - Update `CONTINUOUS-SIMULATION-ROADMAP.md`'s own section for that
     plan (`## Plan N — <name>`) to say `*(built — see
     [../complete/<file>](../complete/<file>))*` instead of `*(planned —
     not started)*` — exactly the phrasing `SENSORY-AND-SOCIAL-ROADMAP.md`
     uses for its own finished plans. An umbrella that still calls a
     shipped plan "planned" is actively misleading the next session's
     Step 0.
   - Update `src/ref/README.md`'s doc tables and
     `src/ref/structural/ARCHITECTURE.md`'s doc index to move that row
     from the `wip/` table to the `complete/` table (or add the "built"
     status inline, matching how other rows in those files read).
5. **If this session was row 20 of Step 0's table** (the last row of the
   whole checklist) **and every document now shows fully "Done":** the
   roadmap's own thesis is realized — say so plainly in your closing
   summary to the user, since nothing in this repo's convention
   auto-detects "the whole roadmap, not just one plan, is finished."

Do not end a session without doing this.
