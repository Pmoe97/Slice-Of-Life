# The Plan document — architecture

How an overhaul plan is built in this project, section by section, and why
each part exists. Copy the skeleton at the bottom to start a new one.

**Canonical exemplar:** [`../complete/external-world-npcs-overhaul-plan.md`](../complete/external-world-npcs-overhaul-plan.md).
When something here is ambiguous, that document is the tiebreaker.
[`../complete/afterhours-redesign-plan.md`](../complete/afterhours-redesign-plan.md) and
[`../complete/inventory-needs-menu-saves-plan.md`](../complete/inventory-needs-menu-saves-plan.md)
are the same shape at different sizes.

---

## What a plan is for

A plan is **not** a to-do list. It is a durable answer to the question a
future session will actually have: *"why is it like this, and what am I not
allowed to change?"*

It is written to be read by someone — a person or an agent — with **zero
context**, one phase at a time, possibly weeks apart. Every structural choice
below follows from that single constraint.

The plan is a **living document**. It is edited during implementation, not
just before it. A plan that still reads exactly as written on day one is a
plan nobody was actually using.

---

## The sections, in order

### 1. Title + Status header

```markdown
# External World / Services / NPCs Overhaul

Status: **complete** — all eight phases implemented and verified.
Last updated 2026-08-05.
```

The status line is the **first thing a resuming session reads** and the only
thing it needs in order to decide whether to keep going. Keep it one glance
long. `planned — not started` / `in progress — Phase N` / `complete`.

### 2. Companions

Cross-links to related plans, each annotated with *what the relationship is* —
not just a list of names.

> `src/ref/complete/economy-and-rent-plan.md` (the cost stack these services add to)

The annotation is the point. "Related" is useless; "this plan changes its
`etaDay` math to working days" tells a session whether it needs to go read it.

### 3. Living-document note

Two sentences pointing at the paired session prompt and stating the update
obligation. Verbatim boilerplate — copy it.

### 4. `## Handoff — read this first`

**The most important section.** Overwritten every session, never appended to.
Three fixed sub-parts:

- **Resume at:** which phase, and if partial, the exact next action.
- **Last session's notes:** what got done, what got verified, what surprised
  you — with the real identifiers you created, because the next session will
  grep for them.
- **Blockers / flagged deviations:** or "None."

Write it as though the reader has never seen the project. They haven't.

### 5. `## The thesis` + `### What this plan is *not*`

The thesis is the argument for why the work is worth doing, in prose. Not
features — the *problem*, stated so plainly that its solution feels forced.

The "is not" list is the more valuable half. Every overhaul accretes scope
during implementation; a written non-goal is the cheapest possible defence.
Aim for four or five, each one a real temptation you are refusing.

### 6. Evidence (optional, but strong)

If the plan exists because something is *measurably* wrong, show the numbers
with file:line citations. A table of decay rates against restore rates makes
"the balance is off" unarguable, and it stops a later session from
re-deriving it.

### 7. `## Locked decisions`

Numbered `D1`…`Dn`, grouped under subheads. These are the outputs of the
design conversation, recorded so they are **not relitigated mid-phase**.

The numbering matters: phases and prompts refer to them by number
("Phase 4 implements D5 and D6"), which is far more durable than restating
the decision in three places and letting the copies drift.

### 8. `## Data model`

Concrete shapes — record structures, tuning tables, formulas — for everything
new. This is what makes phases writable as short blocks: the shape is defined
once here, and each phase says which part it builds.

### 9. `## Implementation phases`

`### Phase N — short name`, each with exactly three blocks:

- **Goal:** one paragraph. What is true when this phase is done.
- **Files:** one bullet per file, saying what goes in it. This is where the
  real detail lives — the bullets carry the design, not a separate steps list.
- **Verification:** what to actually *run* to prove it. Not "check it works" —
  the specific flows, the specific invariants, the round-trips.

Phase size is set by what can be reviewed on its own, and by dependency
boundaries. If a phase can't be verified independently, it's drawn wrong.

Call out any **top-of-phase blocker** here — a latent bug that must be fixed
before the rest of the phase is safe. Both bugs found in the inventory
overhaul were silent until the phase that depended on them.

### 10. `## Status` table

One row per phase: number, status, one-line summary. The prompt's Step 0 reads
**only this table**, so it must never disagree with the header or the Handoff.

### 11. `## Dependency order`

An ASCII graph plus a paragraph on what may safely run out of order. Real
plans always have exceptions; state them here rather than making each session
re-reason about it.

```
Phase 1 (visit spine) ──► everything else
        └─► Phase 2 (contacts) ──► Phase 6, Phase 8
        └─► Phase 4 (independent — can slot anywhere after 1)
```

### 12. `## Open questions (parked, none blocking)`

Things deliberately undecided, with a note on when to decide them. The
parenthetical matters: it tells a session these are not obstacles.

When a phase resolves one, it gets promoted into Locked decisions as a new
D-number and struck from here.

### 13. `## Design invariants`

Numbered rules that hold for the life of the system, not just the overhaul.
The ones that earn their place are the ones with a **scar** attached:

> **Never enumerate persisted keys in two places.** `castWeb` silently never
> persisted for months because it was missed in exactly this way.

An invariant without a consequence is a preference. An invariant with a story
is a rule people follow.

---

## Skeleton

```markdown
# <Overhaul name>

Status: **planned — not started**. Design session complete <date>; all
decisions locked.
Last updated <date>.

Companions: `src/ref/<folder>/<other-plan>.md` (<what the relationship is>).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session — see
`src/ref/<folder>/<name>-handoff-prompt.md` for the full session protocol.

---

## Handoff — read this first

**Resume at:** Phase 1. Nothing has been built yet.

**Last session's notes (design session, <date> — no code written):**
- <what was decided, what was audited, what to distrust>

**Blockers / flagged deviations:** None.

---

## The thesis
<the argument, in prose>

### What this plan is *not*
- **Not <X>.** <why not>

## Locked decisions
### <group>
- **D1 — <decision>.** <detail>

## Data model
### <shape name> (Phase N)
```<the concrete shape>```

## Implementation phases

### Phase 1 — <name>
**Goal:** <one paragraph>
**Files:**
- `src/srcfiles/<file>.js`: <what goes here>
**Verification:** <what to run, what must hold>

## Status
| Phase | Status | What it does |
|---|---|---|
| 1 | Not started | <one line> |

## Dependency order
```<graph>```

## Open questions (parked, none blocking)
- **<question>** — decide during Phase N.

## Design invariants
1. **<rule>.** <the scar that justifies it>
```

---

## Failure modes seen in practice

- **Status header and Status table disagreeing.** Step 3 of the prompt exists
  for this; it still happens when a session ends early.
- **A phase with no independent verification.** Always a sign the boundary is
  wrong.
- **Decisions restated in three places.** They drift. State once in Locked
  decisions, refer by D-number everywhere else.
- **Citations rotting.** Unavoidable and fine — the prompt tells sessions to
  expect it. Do not spend a session refreshing line numbers.
- **The plan and `structural/ARCHITECTURE.md`'s index drifting apart.** Update
  both in the same commit. Five docs were deleted once with eighteen live
  citations pointing at them because this wasn't done.
