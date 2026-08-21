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
| `SENSORY-AND-SOCIAL-ROADMAP.md` | **The umbrella for six linked overhauls.** Start here for anything NPC- or sensory-related — it holds the cross-cutting decisions (`R1`–`R8`) all six plans inherit, and the theses for the four not yet written. **All six linked plans are complete and live in `complete/`; this umbrella stays in `wip/` by design** (it's an index and an argument, not a phased plan — see its own header). |
| `home-design-studio-plan.md` | Furniture becomes composite objects — a shape's parts are normalized to a 0..1 box, so a placement is one `{x,y,w,h,rot}` and everything inside it moves, resizes and rotates as one thing. **Foundation built**: 40 shapes, a full editor (`dev/designer.html`) with room reshaping, drag/resize/rotate, undo, autosave, named slots, and per-piece upgrade gating that lets one design describe a room's dry-then-filled renovation. One room (the pool) is authored as the worked example; eighteen still auto-arrange — genuinely open work, not a leftover. |
| `character-cutout-scene-rendering-plan.md` | **The scene-rendering overhaul** — scenes stop being one image with people baked in and become a people-free background *plate* plus per-character transparent *cutouts* layered on top and moved with CSS transforms. Split the pixels by responsibility (D1): plate keys carry no characters, so one room plate serves every cast and every save; each cutout is generated once (BRIA RMBG-1.4 via the plugin's `removeBackground:true`, persona-realm's specks cleanup + alpha-bbox, deterministic seeds) and cached per identity/pose/expression/outfit (D3/D4), then placed deterministically and re-positioned by CSS transitions when the scene changes (D9/D10). Peek, portraits, and the menu gallery are explicitly untouched. D1–D13 locked, design session 2026-08-21, planned — not started. The detailed reference of the cutout pipeline it adapts is documented inside the plan. |\n| `settings-and-pause-overhaul-plan.md` | **The settings + pause overhaul** — a real pause menu (Resume/Save/Load/Options/Discord/Quit to Menu over a dimmed game, no more boot-title reuse) and a searchable tabbed settings surface (General/Population/Images/Appearance/Data) where every option is wired or cut. Browser-local `kv.menu` 'settings' store (D1–D14 locked); a **population distribution over gender AND fantasy race that governs ALL cast generation** — Hot Singles, maid/escort services, friends-of-friends, applicants, contractors, the apartment cast at new game, and background-art actors — everyone except Del, the one authored from-start NPC (player poll: races available but OFF by default, human 100%). 18-preset + Custom image-style system appended to every generation; 14 color themes; font-only text sizing; an SFW guidance toggle driven by the existing `contentFlags.mature` pipeline; a data tab (export/import/reset/storage insight); and an x0/x1/x20/x100 game-speed HUD that is explicitly not a settings option. Design session 2026-08-19 (revised after the race poll); planned — not started. Paired with `settings-and-pause-overhaul-handoff-prompt.md`. |
| `CONTINUOUS-SIMULATION-ROADMAP.md` | **The umbrella for five linked plans** — all five built: Plan 1 (continuous behavior engine), 2 (needs and the heartbeat), 3 (external-world retiming), 4 (npc-initiative retiming) and 5 (decor economy). Retires the 30-minute tick as the unit NPC decisions happen in — `SCHEDULES`, `resolveScheduleActivity`, and every tick-counted field convert to `clockToAbsolute`-space. Holds the cross-cutting decisions (`C1`–`C8`) all five plans inherit. Documentation only, written 2026-08-14. **Stays in `wip/` by design**, same reasoning as the roadmap above. |
| `continuous-simulation-handoff-prompt.md` | **The session prompt for the whole roadmap above** — hand this to an implementation session, not the roadmap itself. One prompt covering five linked plans (`perchance-agent-handoff-prompt.md`'s pattern, not the one-prompt-per-plan pattern `complete/` uses): a fixed 20-row dependency-safe checklist across all five documents' phases, hard technical rules (load-order registration in two places, `state.js`-only kv access, determinism), and — because this roadmap is meant for a Perchance-native agent with no Node/shell access — an explicit translation rule for every `dev/verify/*.js` reference in the five plans onto `browser_eval` against the live generator page instead. |

The roadmap's Plans 2–5 (`scene-reader-ui`, `npc-cognition`,
`knowledge-gossip-memory`, `npc-initiative`) exist as theses inside
`SENSORY-AND-SOCIAL-ROADMAP.md` and get their own documents at the point the
plan beneath each one ships. **Do not write plan N+1's phases before plan N
lands** — its real shape is not knowable yet. Plans 0–4 have all landed, plus
**Plan X-5** (`plan-x5-conversation-consequences`), which is not one of the
roadmap's six: it was inserted ahead of Plan 5 because Plan 5's design session
measured four of its five motivation sources reading exactly zero. With X-5
shipped, **Plan 5 (`npc-initiative`) has landed — all six phases, so every
plan in the roadmap is now complete.**

**2026-08-18 cleanup:** `wip/` was audited end to end and reduced to only
documents with genuine open work or a deliberate reason to stay (the two
roadmap umbrellas above). Six documents that were fully complete with no
stated reason to remain — `asks-and-attachments-plan.md` (+ its two
companions), `floorplan-and-movement-plan.md`, `bug-fix-audit-2026-08-17.md`,
and `prompt-generator-v2.md` — moved to `complete/` below.

### `complete/`
| Plan | Paired prompt |
|---|---|
| `intimacy-and-voyeurism-overhaul-plan.md` | `intimacy-and-voyeurism-handoff-prompt.md` (**the adult-sim layer — COMPLETE, all 19 phases built and verified live 2026-08-16**; D1–D16 locked. Wardrobe, fog-of-war + door cues, desire, willingness-as-only-door, peek/listen, symmetric intimacy verbs, couples + outside partners + infidelity, the codex, consequences, boundary acts, pregnancy, and the Phase-19 music devices + headphones sound-blocking finale) |
| `food-overhaul-plan.md` | `food-overhaul-handoff-prompt.md` (**COMPLETE — all 9 phases built and verified, 2026-08-18**; D1–D41 locked. Kcal as the one metabolic currency replacing the flat hunger clock (D1–D4); meals as derived plate instances with a Servings bar, sum-of-parts kcal, batch yields, leftovers (D5–D7, D25); fats/seasonings and an interactive verb+stage+method cooking engine with F–S+ grades (D8, D16); equipment gating failure risk/throughput and unlocking grade-gated auto-cook (D12–D15); real dish objects with capacity-modeled washing (D9–D11); the freezer + duration-based thawing, with a reheat step gating the `betterHot` mood bonus and a mood cost for eating ordinary food frozen (D17–D19, D26–D29); cook-from-storage (D20); ChefBook the recipe website with unlock-on-taste, add-all-ingredients-to-cart, and a meal planner (D21/D22, D40); NPC taste preferences and calorie-based eating (D23/D24). **Phase 9** turned out to be almost entirely an audit — every earlier phase's own migration/tuning pass already covered its file list — plus clearing a harness-tooling debt Session 10 had flagged (`run-all.js` now reports **0 harness(es) errored**, down from 18); D41 records that no new save-migration code was actually needed) |
| `asks-and-attachments-plan.md` | `asks-and-attachments-handoff-prompt.md` + `asks-llm-prompt.md` (**COMPLETE — all 12 phases built, D1–D29 locked; moved from `wip/` 2026-08-18**. The conversation attachments menu + the coded-ask system: a nested Request tree of hardcoded ask types resolving deterministically — `decide()` pure over state+seed — phrased but never decided by the LLM. `$AskId <flavor>` syntax, the repeat-ask ladder, scheduled asks bound to real commitments through a calendar modal, meal types inferred from time-of-day, willingness-routed intimacy asks, photo asks + camera-roll sharing, interest-matched gift asks, and the `_loanOwed` loan/repay lifecycle. Phase 11 ran a full-plan audit; Phase 12 fixed every finding it raised, verified live) |
| `floorplan-and-movement-plan.md` | — (moved from `wip/` 2026-08-18. **All 6 phases plus both follow-ups built, 94 assertions.** The apartment becomes a real floor plan: a 19-room tiled layout traced from the hand-drawn plan (rooms are LISTS of rects, so L-shapes survive), `ROOM_THRESHOLDS` typing every edge `door`/`open`/`glass` for the signal layer, `resolveWalk` (auto-path, deterministic blockers/interrupts, seconds derived from geometry), a renderer drawing walls with doorways cut out plus ~40 top-down furniture symbols reflecting live object state, `STRUCTURAL_UPGRADES` editing the graph itself. Geometry authored in `dev/mapper.html` — open that before editing any adjacency by hand) |
| `bug-fix-audit-2026-08-17.md` | — (moved from `wip/` 2026-08-18. **CLOSED — the tracked 2026-08-17 playtest audit; all 7 Bad + 4 Ugly findings fixed and verified live** across 3 passes: two-device Messages, functional showers at start, weekly rent label, gig-economy rebalance, energy gate, LLM-judge retries, edible starter ingredients/Eat chip Day 1, real meal-size hunger restores, sleep-slowed overnight hunger, and the picker-race eating fix. A future playtest audit is a new dated document, not a reopening of this one) |
| `prompt-generator-v2.md` | — (moved from `wip/` 2026-08-18. **COMPLETE — decision-vector engine (pass A) + authoring (pass B) + preferences UI (pass C) + gender-aware refinement (pass D), all shipped.** ~11 independent slots rolled in parallel and cleaned by a conditional-rule layer; measured in-engine combo floors sfw ~10¹², suggestive ~5×10¹³, explicit ~10¹⁵. Further kink/pool expansion remains a standing, open-ended content lever, not an unfinished pass) |
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
| `decor-economy-plan.md` | — (continuous-simulation roadmap Plan 5; the "Home" furniture app — built, all 3 phases) |
| `needs-and-heartbeat-plan.md` | — (continuous-simulation roadmap Plan 2; needs decay/restoration, phone battery, and memory decay off the 30-minute tick onto one fine periodic heartbeat — built, all 4 phases. `HEARTBEAT_MINUTES` confirmed at 5 by the Phase-4 live pass, D8: 1/5/30-min chunking of the closed form is byte-identical, so 5 was chosen at 5× fewer calls. D7's net-per-minute closed form is worth reading: decay-then-restore would overcount restore on any need that dips to its floor mid-span. A 2026-08-15 audit found and fixed a real Phase 3 gap — the discrete path's phone-battery/memory-decay hook skipped any span that didn't cross a tick boundary — see the plan's Addendum) |
| `external-world-retiming-plan.md` | — (continuous-simulation roadmap Plan 3; visits, restaurant hours, delivery ETAs, and gig work blocks retimed from `[startTick,endTick)` to `clockToAbsolute`-space windows, restaurant hours as a *recurring* daily rule — built, all 4 phases. Gig work's one time-cost literal now reads `GIG_TUNING.workBlockMinutes` (D5)) |
| `npc-initiative-retiming-plan.md` | — (continuous-simulation roadmap Plan 4; overture and drive cooldowns convert from wrapped tick deltas to absolute-minute comparisons, closing the representational hole behind **D34** — built, all 3 phases. Includes `cognition.js`'s `recencyMultiplier`, a second wrapped-delta site sharing the same field. Phase 3's re-measurement confirmed the conversion behavior-invisible at the mechanism level — zero cooldown violations across 524 population-scale stamps, propose at 0.425 vs published 0.437 — while recording that the population totals have drifted from Plan 5's published table with the continuous behavior-engine overhaul; D5 holds the current baseline for behavior-engine Phase 6 to tune against) |
| `continuous-behavior-engine-plan.md` | The core plan of the five. `npc.commitment` (real absolute-minute completion times, `kind:'action'\|'drive'\|'work'`) replaces `npc.pursuit`'s tick-counted hold; event-driven decision scheduling replaces the flat per-tick NPC scan; routine survives as a time-of-day scoring weight, not a hard gate; work/commute is ONE long commitment with a real front-door walk (D5); absorbs `floorplan-and-movement-plan.md`'s position/walk/render-split work as its own physical-output layer. **Built — all 6 phases, D1–D16.** Phase 6 (the tuning + live pass) landed four changes — `COGNITION.recencyWindow` 2→1.5, the commute-block grace on `ageCommitment`'s release, the pass-3 transit fall-through, and the heartbeat status-strip redraw — and verified by eye over three simulated days: meals 1.33/npc-day with breakfast appearing, showers 1.0/day, every work start at its boundary or one 30-min tick later. A 2026-08-15 audit found Phase 3's `kind:'action'` anchor path was dead code (never reachable) and wired it — see the plan's Addendum. |
| `plan-x5-conversation-consequences.md` | `plan-x5-handoff-prompt.md` (**not one of the roadmap's six** — inserted ahead of Plan 5. Splits the model that *writes* dialogue from the two that judge it: the Assessor scores a relationship over a scene, the Chronicler extracts knowledge over a day, and the writer scores nothing) |
| `renovation-occupancy-overhaul-plan.md` | — |
| `mobile-layout-overhaul-plan.md` | — (mobile horizontal crop fixed at the root — `min-width: 0` on the `#app` grid children — plus the play-shell polish, chip affordance, and the full narrow-viewport overlay sweep; all three phases built and verified live 2026-08-15) |
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
