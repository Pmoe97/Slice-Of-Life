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
| `prompt-generator-v2.md` | Engine + authoring + preferences UI + gender-aware refinement all shipped; optional pool expansion outstanding. |
| `home-design-studio-plan.md` | Furniture becomes composite objects — a shape's parts are normalized to a 0..1 box, so a placement is one `{x,y,w,h,rot}` and everything inside it moves, resizes and rotates as one thing. **Foundation built**: 40 shapes, a full editor (`dev/designer.html`) with room reshaping, drag/resize/rotate, undo, autosave, named slots, and per-piece upgrade gating that lets one design describe a room's dry-then-filled renovation. One room (the pool) is authored as the worked example; eighteen still auto-arrange. |
| `floorplan-and-movement-plan.md` | The apartment becomes a real floor plan. **All 6 phases plus both follow-ups built, 94 assertions.** A 19-room tiled layout traced from the hand-drawn plan (rooms are LISTS of rects, so L-shapes survive), `ROOM_THRESHOLDS` typing every edge `door`/`open`/`glass` for the signal layer, `resolveWalk` (auto-path, deterministic blockers and interrupts, seconds derived from geometry), a renderer that draws walls with the doorways cut out of them plus ~40 top-down furniture symbols reflecting live object state, `STRUCTURAL_UPGRADES` — upgrades that edit the graph rather than a quality number, bookable through the contractor pipeline in RenoFix — The wing asymmetry (south bedrooms sit off the kitchen through an open archway) is deliberately SENSORY only — D7, and read its correction note before reaching for rent. Geometry is authored in `dev/mapper.html`; **open that before editing any adjacency by hand.** |
| `CONTINUOUS-SIMULATION-ROADMAP.md` | **The umbrella for five linked plans, none built.** Retires the 30-minute tick as the unit NPC decisions happen in — `SCHEDULES`, `resolveScheduleActivity`, and every tick-counted field convert to `clockToAbsolute`-space. Holds the cross-cutting decisions (`C1`–`C8`) all five plans inherit. Documentation only, written 2026-08-14. |
| `continuous-simulation-handoff-prompt.md` | **The session prompt for the whole roadmap above** — hand this to an implementation session, not the roadmap itself. One prompt covering five linked plans (`perchance-agent-handoff-prompt.md`'s pattern, not the one-prompt-per-plan pattern `complete/` uses): a fixed 20-row dependency-safe checklist across all five documents' phases, hard technical rules (load-order registration in two places, `state.js`-only kv access, determinism), and — because this roadmap is meant for a Perchance-native agent with no Node/shell access — an explicit translation rule for every `dev/verify/*.js` reference in the five plans onto `browser_eval` against the live generator page instead. |
| `continuous-behavior-engine-plan.md` | The core plan. `npc.commitment` (real absolute-minute completion times, `kind:'action'\|'drive'`) replaces `npc.pursuit`'s tick-counted hold; event-driven decision scheduling replaces the flat per-tick NPC scan; routine survives as a time-of-day scoring weight, not a hard gate; absorbs `floorplan-and-movement-plan.md`'s position/walk/render-split work as its own physical-output layer. 6 phases, none started. |
| `needs-and-heartbeat-plan.md` | Needs decay/restoration, phone battery, and memory decay move off the 30-minute tick onto their own fine periodic heartbeat (proposed `HEARTBEAT_MINUTES: 1`), with fast-forward always resolving in closed form (`elapsed_minutes × decayPerMinute`, never a looped heartbeat). Explicitly excludes `hunger`, already derived via `HUNGER_RHYTHM`. 4 phases, none started. |
| `external-world-retiming-plan.md` | The visit spine, restaurant hours, food-delivery ETAs, and gig work blocks convert from `[startTick,endTick)` to `clockToAbsolute`-space windows — restaurant hours specifically as a *recurring* daily rule (D2), not a one-shot window like the other three. Day rollover/rent/bills confirmed untouched. 4 independent phases, none started. |
| `npc-initiative-retiming-plan.md` | Overture and drive cooldowns convert from wrapped tick deltas to absolute-minute comparisons, permanently closing the representational hole behind **D34** (a cooldown at or above `ticksPerDay` could never elapse) rather than re-tuning around it — includes `cognition.js`'s `recencyMultiplier`, a second wrapped-delta site this session's cross-check pass found sharing the same field. 3 phases, none started. |
| `decor-economy-plan.md` | A new "Home" app sells furniture through Nile's exact checkout/delivery mechanism, unmodified; placing a delivered piece writes a real object instance in `gameState.objects` (not a config entry), so `continuous-behavior-engine-plan.md`'s anchor resolution can find player-furnished rooms the same way it finds a stove. Structural changes stay in RenoFix — a different catalog, on purpose. 3 phases, none started. |

The roadmap's Plans 2–5 (`scene-reader-ui`, `npc-cognition`,
`knowledge-gossip-memory`, `npc-initiative`) exist as theses inside
`SENSORY-AND-SOCIAL-ROADMAP.md` and get their own documents at the point the
plan beneath each one ships. **Do not write plan N+1's phases before plan N
lands** — its real shape is not knowable yet. Plans 0–4 have all landed, plus
**Plan X-5** (`plan-x5-conversation-consequences`), which is not one of the
roadmap's six: it was inserted ahead of Plan 5 because Plan 5's design session
measured four of its five motivation sources reading exactly zero. With X-5
shipped, **Plan 5 (`npc-initiative`) has landed — all six phases, so every
plan in the roadmap is now complete** and `wip/` holds only the umbrella and
the prompt generator.

### `complete/`
| Plan | Paired prompt |
|---|---|
| `external-world-npcs-overhaul-plan.md` | — (used `patterns/perchance-agent-handoff-prompt.md`) |
| `afterhours-redesign-plan.md` | `afterhours-redesign-handoff-prompt.md` |
| `inventory-needs-menu-saves-plan.md` | `inventory-needs-menu-saves-handoff-prompt.md` |
| `restaurant-network-expansion-plan.md` | `restaurant-expansion-handoff-prompt.md` |
| `npc-correctness-fixes-plan.md` | — (roadmap Plan 0; carries the dead-field disposition table) |
| `perception-and-signals-plan.md` | — (roadmap Plan 1; the signal substrate Plans 2–5 consume) |
| `scene-reader-ui-plan.md` | `scene-reader-ui-handoff-prompt.md` (roadmap Plan 2; the main UI stopped being a log and became a scene) |
| `npc-cognition-plan.md` | `npc-cognition-handoff-prompt.md` (roadmap Plan 3; utility scoring + committed `pursuit`s replace the twelve independent drive coin flips) |
| `knowledge-gossip-memory-plan.md` | `knowledge-gossip-handoff-prompt.md` (roadmap Plan 4; the belief record, gossip transmission, rumination + open questions, the D13 bridge, and the Character Studio) |
| `npc-initiative-plan.md` | `npc-initiative-handoff-prompt.md` (roadmap Plan 5; NPCs open — the expression layer, `npc.overture` across four channels, shared activities, and the rate tuned by measurement. Its D34 is worth reading outside this plan: a `cooldownTicks` is a wrapped daily window rather than an elapsed duration, so three entries in the game had been firing once per NPC per *game*) |
| `plan-x5-conversation-consequences.md` | `plan-x5-handoff-prompt.md` (**not one of the roadmap's six** — inserted ahead of Plan 5. Splits the model that *writes* dialogue from the two that judge it: the Assessor scores a relationship over a scene, the Chronicler extracts knowledge over a day, and the writer scores nothing) |
| `renovation-occupancy-overhaul-plan.md` | — |
| `contractor-tutorial-overhaul-plan.md` | — |
| `npc-overhaul-plan.md` | — |
| `apartment-expansion-plan.md` | — |
| `apartment-upgrades-plan.md` | — |
| `economy-and-rent-plan.md` | — |
| `game-opening-plan.md` | — |
| `player-creation-and-intro-plan.md` | — (the other half of `game-opening-plan.md`: the Player Design studio, the `physical.intimate` layer on player and NPCs behind a three-part fail-closed gate, and the pregenerated-image opening cutscene. Read its D5–D11 before touching anything intimate-adjacent) |

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
