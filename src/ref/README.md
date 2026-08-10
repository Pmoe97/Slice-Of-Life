# `src/ref/` — design documents

Everything in here is prose, not code. The code is the truth about what the
game *does*; these documents are the record of what it is *for*, what was
decided, and why it looks the way it does.

## The five folders

| Folder | Holds | Lifecycle |
|---|---|---|
| **`structural/`** | Always-current reference. Describes the game as it *is*, and is updated whenever the code moves under it. Never "finishes". | Living |
| **`patterns/`** | The reusable document architectures themselves, plus the generic prompts. **Start here when beginning a new overhaul.** | Living |
| **`wip/`** | Plans with work still outstanding. Exactly the docs a session might be asked to resume. | Moves to `complete/` |
| **`complete/`** | Finished overhauls, kept as design record and precedent. Their Status headers say so. | Terminal |
| **`archive/`** | Superseded, one-off, or historical. Not maintained, not authoritative. | Terminal |

A plan and its paired session prompt **live together** — a plan-specific
handoff prompt is useless without its plan, and vice versa. They move between
folders as a pair.

## Where to start

- **Understanding the codebase** → [`structural/ARCHITECTURE.md`](structural/ARCHITECTURE.md)
- **Writing a new overhaul plan** → [`patterns/PLAN-ARCHITECTURE.md`](patterns/PLAN-ARCHITECTURE.md)
- **Writing the session prompt for one** → [`patterns/HANDOFF-PROMPT-ARCHITECTURE.md`](patterns/HANDOFF-PROMPT-ARCHITECTURE.md)
- **A worked example of both** → [`complete/external-world-npcs-overhaul-plan.md`](complete/external-world-npcs-overhaul-plan.md) and [`complete/afterhours-redesign-handoff-prompt.md`](complete/afterhours-redesign-handoff-prompt.md)

## Contents

### `structural/`
| Doc | What it is |
|---|---|
| `ARCHITECTURE.md` | The as-built map of the codebase: sections, their contracts, and the doc index. The single most important file here. |
| `game-clock-time-system.md` | Reference map of the clock: the data model, the two time paths, every rate and discrete cost, and everything still hard-coded to the 30-minute tick. |
| `perchance-menu-conventions.md` | Source-level read of `lusthaven` / `stellar-lust` / `hedonism-island` — menu structure, CSS, the slideshow component, the Discord badge. External reference; documents real published code **including its bugs** (see its §6). |

### `patterns/`
| Doc | What it is |
|---|---|
| `PLAN-ARCHITECTURE.md` | The anatomy of an overhaul plan document, section by section, with a copy-paste skeleton. |
| `HANDOFF-PROMPT-ARCHITECTURE.md` | The anatomy of a one-phase-per-session prompt, plus the discovery-prompt variant. Copy-paste skeleton. |
| `perchance-agent-handoff-prompt.md` | The original generic session protocol, covering several linked overhauls at once. Predates the per-overhaul prompts; kept as the ancestor of the pattern. |
| `perchance-menu-discovery-prompt.md` | A worked **discovery prompt** — the one-shot kind you hand an agent that can see something you can't. Produced `structural/perchance-menu-conventions.md`. |

### `wip/`
| Doc | Status |
|---|---|
| `SENSORY-AND-SOCIAL-ROADMAP.md` | **The umbrella for six linked overhauls.** Start here for anything NPC- or sensory-related — it holds the cross-cutting decisions (`R1`–`R8`) all six plans inherit, and the theses for the four not yet written. |
| `npc-correctness-fixes-plan.md` | Roadmap Plan 0. Five defects the NPC audit found. Written, not started. Should land before the rest. |
| `perception-and-signals-plan.md` | Roadmap Plan 1. The signal substrate every later plan consumes. Written, not started. |
| `prompt-generator-v2.md` | Engine + authoring + preferences UI + gender-aware refinement all shipped; optional pool expansion outstanding. |

The roadmap's Plans 2–5 (`scene-reader-ui`, `npc-cognition`,
`knowledge-gossip-memory`, `npc-initiative`) exist as theses inside
`SENSORY-AND-SOCIAL-ROADMAP.md` and get their own documents at the point the
plan beneath each one ships. **Do not write plan N+1's phases before plan N
lands** — its real shape is not knowable yet.

### `complete/`
| Plan | Paired prompt |
|---|---|
| `external-world-npcs-overhaul-plan.md` | — (used `patterns/perchance-agent-handoff-prompt.md`) |
| `afterhours-redesign-plan.md` | `afterhours-redesign-handoff-prompt.md` |
| `inventory-needs-menu-saves-plan.md` | `inventory-needs-menu-saves-handoff-prompt.md` |
| `restaurant-network-expansion-plan.md` | `restaurant-expansion-handoff-prompt.md` |
| `renovation-occupancy-overhaul-plan.md` | — |
| `contractor-tutorial-overhaul-plan.md` | — |
| `npc-overhaul-plan.md` | — |
| `apartment-expansion-plan.md` | — |
| `apartment-upgrades-plan.md` | — |
| `economy-and-rent-plan.md` | — |
| `game-opening-plan.md` | — |

### `archive/`
`Bug-Report.txt`, `Perchance-Helper-AI-P0-P6-Audit-Plan.txt` — historical, unmaintained.

## Retired documents

Five plan docs were deleted in commit `404356c` ("Removes five plan docs
fully absorbed into ARCHITECTURE.md's status table"). Their **citations were
never cleaned up**, so roughly eighteen comments across `src/` and `src/ref/`
still point at paths that no longer resolve. If you follow one of these and
find nothing, that is why — the content is in `structural/ARCHITECTURE.md`:

| Retired path | Was about |
|---|---|
| `src/ref/BrineOS-The-Phone-plan.md` | The in-game phone (9 phases). The most-cited of the five. |
| `src/ref/adult-content-overhaul-plan.md` | Adult content systems |
| `src/ref/vocation-and-gigs-plan.md` | Where player income comes from |
| `src/ref/sleep-and-alarm-plan.md` | The sleep/alarm model |
| `src/ref/HANDOFF.md` | An early, pre-pattern session note |

All five remain recoverable from git. They predate both this reorganisation
and the move into `src/`, so they live at the **old** `ref/` root in history:

```bash
git show 404356c^:ref/BrineOS-The-Phone-plan.md
```

Use that if a future change needs the original reasoning rather than the
absorbed summary. (The paths in the table above are how the surviving
citations now read after the reorganisation — no file has ever existed at
those exact paths.)

## House rules

1. **A plan's Status header and its Status table must never disagree.** Step 3
   of every session prompt exists to enforce this.
2. **Citations drift.** Every `file.js:123` in here was true when written and
   may not be now. Find the real location by name, not by line number. A stale
   citation is expected, not a bug.
3. **When a plan completes, move it to `complete/` with its prompt** and
   update this index.
4. **Update `structural/ARCHITECTURE.md`'s doc index** in the same commit that
   adds or moves a plan, or the two drift the way the retired five did.
