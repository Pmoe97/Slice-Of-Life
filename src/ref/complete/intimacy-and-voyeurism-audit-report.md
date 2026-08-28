# Intimacy & Voyeurism Overhaul — Full-Audit Report

**Audit date:** 2026-08-16 (post-completion, all 19 phases **Done**)
**Method:** read-only audit. No file under `src/`, `main.pjs`, or `index.html` was modified. Every live check ran on the real Perchance page via `browser_eval`/`browser_refresh` against the current code. No node shell was available, so the `dev/verify` harnesses were treated as intended-behavior specs and re-run live where feasible.
**Audited against:** `src/ref/complete/intimacy-and-voyeurism-overhaul-plan.md` (archived 2026-08-16, all 19 Status rows **Done**), `src/ref/complete/intimacy-and-voyeurism-handoff-prompt.md`, and the verify harnesses `src/dev/verify/verify-w4.js` … `verify-w19.js`.

---

## 1. Executive summary

| Dimension | Verdict |
|---|---|
| **Completeness** | **Strong.** All 19 phases' Goals, Files and Verification clauses exist and function. The single gap is the missing `verify-w1/w2/w3` harnesses (Phases 1–3 verified live instead). Every phase's mandatory gate check re-passed live. |
| **Trueness to documentation** | **Good with one stale harness check.** All quoted `?v=` version numbers match the live script tags exactly (zero drift). Locked decisions D1–D29 are implemented as written. One verify-harness check contradicts the shipped code (w8's "release is a negative table"), and a handful of citations point at dead paths (all catalogued in §5). |
| **Bugs** | **None found that affect live behaviour.** The previously-documented bug classes (`SOUND_DEVICE_DEFS[true]`, `+-0.15` NaN, bridge swallowing submenu verbs, delta double-application) are all resolved or documented-and-kept. The Phase-18 save incident is fully repaired. |
| **Architecture** | **Healthy, with three soft spots:** state.js's "sole kv access" claim is stale (8 direct `root.kv` calls outside it), the loadgame.js ORDER list disagrees with index.html on two files (both documented as intentional), and the pairDeltas double-application is documented in the plan but not in the code comment that would be read first. |

**Findings by severity:** 0 Blocker · 1 Major · 3 Minor · 3 Nit (plus 2 documented-noted data/nit items). Detailed findings in §3, stale citations in §5, fix list in §6.

**Overall health call: GREEN — the overhaul is faithful, shippable, and gate-clean. No repair is urgent. The only "real" defect is a stale assertion in `verify-w8.js` that will fail under `node dev/verify/run-all.js` and could mislead a future editor into "fixing" the code. The missing w1–w3 harnesses are a documentation/hygiene gap, not a behaviour gap.**

---

## 2. Per-phase table

| Phase | Completeness | Doc-trueness | Bugs | Architecture | Verdict |
|---|---|---|---|---|---|
| 1 — Submenu actions | ✓ | ✓ | ✓ | ✓ | **Green** |
| 2 — Fog-of-war | ✓ | ✓ | ✓ | ✓ | **Green** |
| 3 — Door cues | ✓ | ✓ | ✓ | ✓ | **Green** |
| 4 — Clothing defs/catalog | ✓ | ✓ (D18 one-table held) | ✓ | ✓ | **Green** |
| 5 — Wardrobe UI + state machine | ✓ | ✓ (gate fail-closed) | ✓ | ✓ | **Green** |
| 6 — NPC wardrobe AI | ✓ | ✓ | ✓ | ✓ | **Green** |
| 7 — Clothing stats | ✓ | ✓ | ✓ | ✓ | **Green** |
| 8 — Desire | ✓ | **Amber** — w8 harness check contradicts shipped config (§3-M1) | ✓ | ✓ | **Amber** (harness only; code green) |
| 9 — Willingness | ✓ | ✓ | ✓ | ✓ | **Green** |
| 10 — Peek & Listen | ✓ | ✓ | ✓ | ✓ | **Green** |
| 11 — Player verbs + Make a Move | ✓ | ✓ | ✓ | ✓ | **Green** |
| 12 — Relationships | ✓ | ✓ | ✓ | ✓ | **Green** |
| 13 — NPC intimacy | ✓ | ✓ | ✓ | ✓ | **Green** |
| 14 — Outside partners / infidelity | ✓ | ✓ (double-apply doc thin in code, §3-M4) | ✓ | ✓ | **Green** |
| 15 — Codex + Confront/Spread/Matchmake | ✓ | ✓ | ✓ | ✓ | **Green** |
| 16 — Consequences / cold-shoulder | ✓ | ✓ | ✓ | ✓ | **Green** |
| 17 — Boundary acts | ✓ | ✓ | ✓ | ✓ | **Green** |
| 18 — Pregnancy | ✓ | ✓ | ✓ | ✓ | **Green** |
| 19 — Sound | ✓ | ✓ | ✓ | ✓ | **Green** |

---

## 3. Detailed findings (by severity)

### Blocker
None.

### Major

#### M1 — `verify-w8.js` asserts the *opposite* of the shipped `DESIRE.release` convention (doc-trueness; Phase 8)
- **Claim:** verify-w8.js check "release is a negative table" asserts `Object.values(DESIRE.release).every(v => v < 0)`.
- **Observed:** `DESIRE.release = { masturbate: 40, sex: 100, quickie: 60 }` — all **positive** (`config.js:3545-3548`), and the config comment explicitly documents the convention: *"Positive AMOUNTS: the effect strings carry the '-' (the act SATES, desire falls by this much)"*. All 8 call sites negate: `defs.actions.js:301/333/366` (`ADJUST_NEED player desire -${DESIRE.release.masturbate/quickie/sex}`), `config.js:3771`, `drives.js:7010/7053` (`delta: -DESIRE.release.*`). The effect pipeline is verified to land the negative delta.
- **Reproduction:** live eval — `out.table.releaseNegative` evaluated `false` against the live config.
- **Severity rationale:** a harness that fails against correct code means `node dev/verify/run-all.js` reports a false failure; a future editor may "fix" the *code* to satisfy it. The harness is the stale artifact.
- **Fix (read-only, yours to repair):** update the w8 check to assert the caller-side-negation convention (`Object.values(DESIRE.release).every(v => v > 0)` and/or assert the emitted `-${…}` effect strings).

### Minor

#### m2 — state.js's "Sole kv access point" claim is stale (architecture; hard rule B)
- **Claim:** `state.js:3` — "Sole kv access point. No other section calls root.kv directly."
- **Observed:** 8 direct `root.kv` calls outside state.js: `defs.menu.js:222`, `menu.js:30/41/293`, `image.js:567/600/734/855` — all `root.kv.menu.get/set` for title-gallery prefs/ring/options. None touch sim state (player/world/npcs/objects), all are menu/gallery UI persistence.
- **Verdict:** claim false in letter; no correctness impact (gallery prefs are not sim state). Pre-existing drift (predates the I&V phases).
- **Fix (read-only):** either route the gallery-pref reads through a small `state.js` adapter or amend the state.js:3 comment to carve out the menu-gallery exception.

#### m3 — loadgame.js ORDER disagrees with index.html on two files (architecture; hard rule E)
- **Claim (hard rule):** "index.html script tags vs loadgame.js ORDER — any disagreement is a bug."
- **Observed:** `codex.js` sits between `relationships.js` and `rumination.js` in index.html (index.html:4804) but after `interruption.js` in loadgame.js's ORDER; `studio.js` sits near the bottom of index.html (index.html:4858, below the render/ui layer) but after `pregnancy.js` in loadgame.js. Both positions are **documented as intentional** in loadgame.js comments (pure/domain-logic files with no load-time dependencies; the harness is truncated before render/ui by design).
- **Verdict:** letter violated, no functional impact (no file missing from either list; all 19 phase-added files — willingness.js, codex.js, peek.js, boundary.js, pregnancy.js — appear in both). Report as a rule-enforcement nit, not a bug.
- **Fix (read-only):** add a one-line "known intentional divergence" note in loadgame.js's header so the rule's letter is acknowledged rather than silently bent.

#### m4 — pairDeltas double-application: documented in the plan, not in the code (doc-trueness; Phase 14)
- **Claim (Phase-14 handoff, plan line 88):** "tryIntimatePair applies pairDeltas in-function AND resolveTick re-applies them via processNpcRelDeltas — a PRE-EXISTING double application, kept for the w13 baseline; harmless … flagged not fixed."
- **Observed:** the double application is **still present**: `tryIntimatePair` directly applies `applyNpcToNpcDelta` both ways (`drives.js:1038-1044`) AND pushes the same pairDeltas into its returned `relDeltas` (`drives.js:1039-1040`), which the drive loop funnels to `processNpcRelDeltas` (`sim.js:1902 → sim.js:1932 → drives.js:1513-1521`, which applies them to the castWeb again). The plan doc carries the note; the in-code comment (`drives.js:1030-1036`) documents only *why* the in-function application exists, not that a second application follows, and config.js:7058 ("castWeb axes applied in BOTH directions by tryIntimatePair") likewise doesn't flag the double-apply.
- **Verdict:** behavior matches the documented-and-kept baseline; the *code* is the thinner half of the documentation. A future editor reading only drives.js would believe the in-function apply is the whole story.
- **Fix (read-only):** append one line to the drives.js:1030 comment: "…resolveTick re-applies these same deltas via processNpcRelDeltas — a pre-existing double application, kept for the w13 baseline; harmless (small signed deltas), flagged not fixed."

### Nits

#### n1 — Missing `verify-w1.js` / `verify-w2.js` / `verify-w3.js` (coverage gap; Phases 1–3)
Phases 1–3 shipped without a dedicated harness (glob confirms only w4–w19 exist). Phases 1–3 were verified live in-session (submenu nesting, fog/plausibility, door cues incl. the D4 ten-render anti-repetition check), so behaviour is covered; the *documented* assertion suites for those phases never materialized.

#### n2 — afterhours.js:2923 "feeling a mix of relief and mild shame" (invariant 8 boundary probe)
The only player-facing prose with a shame valence. It is a single authored narration line after the player's masturbation session — a flavor line, **not** a mechanical player-moral score (no stat, no relationship delta, no system reads it). Invariant 8 ("no shame simulator") is satisfied; flagged so it is a conscious choice, not an accidental echo of the "NPC mortification" (D2) system.

#### n3 — Current save cast is thin (data state, not a bug)
The repaired real save boots cleanly (day 5, resident Anna; Vex/Victor present as visitors). The Phase-13 handoff's "13 NPCs, 0 residents" observation is a documented data-state precedent; nothing in the audit found the cast-thinning to be a code regression.

---

## 4. Cross-cutting sweep results

### A. The ten design invariants

| # | Invariant | Result | Evidence |
|---|---|---|---|
| 1 | **No force, ever** — willingness is the only door; negative floor aborts both directions | **Verified** | 8-callsite census: boundary.js 3 (lines 213/239/265, all inside `resolveBoundaryGate`/`resolveBoundaryAwakeGate`/`resolveBoundaryThroupleGate`), codex.js 1 (line 145, inside `resolveConfrontTier`), defs.actions.js 1 (line 1022, the `willingness:` action requirement), drives.js 2 (964 `findIntimatePartner`, 1012 `tryIntimatePair`), willingness.js 1 (the def). Live aborts verified in BOTH directions (player→NPC and NPC→player): asleep/hostile/stranger/refusing/cold-shoulder all return −1 with `reason:'floor'` and zero footprint. No effect, drive, verb, or LLM call makes an unwilling subject participate. |
| 2 | **Symmetric initiation** — player Make-a-Move and NPC overtures share the gate | **Verified** | Make-a-Move → `runRegisteredAction(ctx.actTargetNpcId)` → the same `willingness:` requirement the NPC path reads; NPC pair acts route through `findIntimatePartner`/`tryIntimatePair` → `resolveWillingnessGate`; the overture accept path starts **no** act (overture.js has no act-execution surface); boundary reciprocation is downstream of its own gate. No second path found by grep. |
| 3 | **Deterministic authority** — no LLM call decides a boundary act; explicit surfaces follow the gated pattern | **Verified** | Boundary outcomes use authored pools + seeded rng (`resolveBoundaryCatch`, `peekCaughtChance`, `PEEK_OUTCOMES`); no `resolveWillingnessGate`/`willingness(` reference exists in peek.js (source grep). Explicit body prose routes through `getPhysicalDescriptionForPrompt` + `intimateAllowed` + `NAKED_CLOTHING_STATES` in all three consumers (npc.js:2501, image.js:278, peek.js:151). |
| 4 | **`undressed` semantics** — gate reads `NAKED_CLOTHING_STATES`, fail-closed | **Verified** | `NAKED_CLOTHING_STATES = ['undressed','nude']` (config.js:3373); dressed/towel/sleepwear/changing never open the gate under any tested condition (mature on/off, outfit present); nothing widened it since (grep of every `clothing ===`/`clothing ==` reader). |
| 5 | **Floor plan never omniscient** — every map surface fogged; nothing added after Phase 2 leaks | **Verified** | `derivePlausibleActivity` is pure (same room → full, other room → coarse, locked → `inside`); the only map surfaces are `renderFloorPlan`/`renderFloorPlanLive` (both fog-gated) and the design-studio room editor (`render.computer.js:650` — furniture-only, no NPC/location info). Phase 19's stereo is static furniture; the door-cue/music system adds signals to rooms already gated by fog. |
| 6 | **One level of nesting** | **Verified** | All four `submenu:` defs are flat string arrays (defs.actions.js:206/251/454/766); no nested submenu exists anywhere. |
| 7 | **Every act leaves a trace** | **Verified** | Intimacy acts: emitsSignal (moaning) + setsClothing (undressed) + ledger + relationship history + bed-unmade + desire release (Phase 11/13 live runs). Boundary acts: every branch of `applyBoundarySleepRoom` writes a ledger entry plus mood/rel deltas or `unmakeBed`; `applyReciprocatedAct` carries the full footprint; `applyBoundaryThrouple` writes ledger + history + unmakeBed. |
| 8 | **No shame simulator** | **Verified** | No player-moral scoring anywhere. The `shame`/`guilt` words resolve to: the documented confront tiers (codex.js:124/155/235), the documented shaming reaction pools (`SHAMING` in config.js:4047/4079), a relationship-axis flavor (config.js:7734), and one afterhours prose line (n2). |
| 9 | **Content all-on by default** | **Verified** | `CONTENT_CONFIG.contentFlags.mature = true` (config.js:9-14); `intimateAllowed` is `activeContentFlags().mature === true` (npc.js:2522); every explicit surface (title-gallery rating cap, afterhours `requiresContentFlag:'mature'`, LLM content section, initiative gate) reads the **one** flag. No second NSFW toggle exists. |
| 10 | **No hardcoded explicit strings** | **Verified** | image.js/peek.js/scene.js/prompt.js prompt builders verified gated (peek view line + peek prompt degrade to safe paraphrases with mature off, and never bake a keyhole/door into the image; scene presence lines use `clothingLabel`/`outfitFlavorProse`). llm.js contains no body-explicit strings — only disposition colouring (llm.js:294) and the scenario narration "walked in on your roommate masturbating" (llm.js:1112, dialogue-generation context about the player's own act, not a description of a body). |

### B. The hard technical rules

| Rule | Result | Evidence |
|---|---|---|
| **State.js owns kv access** | **Not fully verified — 8 violations (m2)** | All sim-state (meta/player/world/npcs/objects) access is through state.js adapters; the direct calls are menu-gallery prefs only. |
| **Determinism — no bare `Math.random()` in sim-adjacent code** | **Verified** | All 16 `Math.random()` occurrences are in defs.menu.js (title-gallery randomization), image.js:527 (cache-key uniqueness — deliberately non-deterministic), and orbital.js's documented unseeded helper. sim.js/drives.js/npc.js/willingness.js/boundary.js/peek.js/pregnancy.js use `seededRng` exclusively. Determinism harnesses spot-rechecked live: w9 purity (byte-identical outputs, no writes), w18 lifecycle determinism, w19 beat determinism, Phase 6 three-day sims (natural/prudish/deviant/fastidious casts all reproduce). |
| **Closed-form fast-forward** | **Verified** | peek.js contains zero `advanceClock`/`resolveBatch` references (source grep). The peek hold runs on the `peeking` time context (`TIME_DILATION.scales.peeking === 60`, verified live), advancing 1 game-minute/real-second through the main clock loop; desire/needs flow through `decayPlayerNeeds`' closed form with the source's remaining-life bound. |
| **Load order registered in two places** | **Letter violated (m3); no missing files** | All 54 index.html scripts present; the harness list is intentionally truncated at the render/ui layer; codex.js/studio.js positions differ and are commented as intentional. All 19 phases' added files appear in both lists. |

### C. Save/load round-trip (G.1 survival + G.2 determinism)

Ran the **real** `writeGeneratedGameState` + `loadGameState` against an in-memory kv adapter (built to the w19 `makeMemKv` shape, meta pre-seeded with `{versions:{...FOLDER_VERSIONS}}` so the migration check is a no-op). The kv-swap protocol was followed exactly (`stopAutosave()`/`stopClockLoop()` first → `forceFlush()` into the real kv → swap `root.kv` → run → `forceFlush()` → restore → `startClockLoop()`); the user's real save was never written.

- **G.1 — survival (all 10 surfaces byte-identical after load):** `world.relationships` (committed record + history + `trying`), `world.pregnancies` (record + `_baby`/`_tryingWith` flags), `world.outsidePartners` (resident→partner index), player `outfit` (headphones accessory) + `clothing`, player `flags._peekBudget`, `player.ledger` (participated + witnessed-spent entries, `spent` flags intact), NPC `flags._coldShoulder`, wardrobe `contents` + `flags.tier`, stereo `state {power:'on', volume:'2'}`. **All pass.**
- **G.2 — determinism:** two identical-input trips produced byte-identical loaded states across all nine compared surfaces (relationships/pregnancies/outsidePartners/outfit/budget/ledger/npcFlags/stereo/clothing). **Pass.**
- (An earlier two-trip run with *different* seeds showed mismatches that were pure test artifacts — differing cast ids in the JSON — not determinism failures; re-run with identical input confirmed byte-equality.)

---

## 5. Stale-citation catalogue

| # | Location | Claim | Reality | Tag |
|---|---|---|---|---|
| S1 | loadgame.js (×6: codex / image / peek / boundary / pregnancy / studio comments) | "…in index.html" | The file is **index.html**; index.html does not exist. The intent is unambiguous. | **broken** (misleads a reader into hunting a non-existent file) |
| S2 | Plan Phase-4 file list ("Nile rows for clothing" in `defs.computer.js`) | Clothing catalog rows in defs.computer.js | **D18 locked the one-table decision**: clothing lives in ITEM_DEFS (defs.world.js); `CLOTHING_DEFS` is a derived view (defs.world.js:1303); `SHOP_CATALOG_LIST` derives from priced ITEM_DEFS. Verified: defs.computer.js has no clothing rows (only the `wardrobe` furniture row, defs.computer.js:288 — correct). The plan itself documents the deviation at line 280. | **expected-and-benign** (documented locked-decision deviation) |
| S3 | Plan Phase-19 handoff (plan line 33) | "defs.computer.js: Nile rows" line cited as if it were an action item | The handoff itself labels it "a stale citation; documented not changed" — verified no defs.computer.js change was needed and none exists. | **expected-and-benign** |
| S4 | Handoff Phase-14 note | "the pairDeltas double-application … is still documented" | Documented in the plan (line 88) and config.js:7058; **not** in the drives.js:1030 comment a code-reader sees first (M4). | **expected-and-benign** (documented; code side thinner than plan side) |
| S5 | verify-w8.js | "release is a negative table" | Live `DESIRE.release` is positive with caller-side negation (M1). | **broken** (harness asserts the opposite of shipped code) |
| S6 | Handoff/plan "Status: all 19 rows Done" | — | Confirmed true. | — |
| S7 | Version numbers quoted in the Handoff | config v=121, icons v=26, defs.world v=36, defs.actions v=37, defs.computer v=29, defs.menu v=19, defs.intro v=12, defs.design v=2, orbital v=12, state v=51, sim v=72, commitments v=13, world v=29, movement v=2, signals v=18, scene v=17, items v=24, inventory v=17, effects v=30, drives v=38, cognition v=28, overture v=15, actions v=31, intent v=18, skills v=19, stealth v=19, time v=27, computer v=55, tracker v=15, phone v=20, npc v=46, willingness v=2, relationships v=5, codex v=2, rumination v=15, prompt v=19, llm v=34, x5 v=15, interruption v=22, image v=26, peek v=3, boundary v=1, pregnancy v=1, render v=60, render.computer v=44, render.desktop v=19, render.phone v=23, ui v=91, ui.computer v=45, afterhours v=29, ui.windowmanager v=19, ui.phone v=22, studio v=12, menu v=17 | All match the live index.html script tags exactly (index.html:4729-4864). | **no drift** |
| S8 | loadgame.js ORDER vs index.html | "the two lists must agree" | codex.js/studio.js positions differ; documented as intentional (M3). | **expected-and-benign** (documented) |
| S9 | Verify-w1/w2/w3 | Phases 1–3 "apparently shipped without a dedicated harness" | Confirmed missing (glob). | **expected-and-benign** (coverage gap, n1) |

---

## 6. Prioritized fix list

Ordered by severity × blast radius. All tagged **Read-only** (repair belongs to a later fix session) or **Needs-design-decision**.

1. **[Major] verify-w8.js release-table check** — flip the assertion to the shipped convention (`DESIRE.release` values are positive amounts negated at the call sites; assert `> 0` and/or the emitted `-${…}` strings). Tag: **Read-only**. Touch: `src/dev/verify/verify-w8.js` check "release is a negative table".
2. **[Minor] state.js:3 "sole kv access" comment** — either add a `state.js` adapter for the menu-gallery prefs or carve out the exception in the comment. Tag: **Read-only**. Touch: `state.js:3` (or `menu.js`/`image.js` gallery-pref call sites).
3. **[Minor] loadgame.js header note** — acknowledge the two intentional ORDER divergences (codex.js, studio.js) so the rule's letter is enforced consciously. Tag: **Read-only**. Touch: `src/dev/verify/loadgame.js` header comment.
4. **[Minor] drives.js:1030 comment** — append the "double-application kept for the w13 baseline" note so the code self-documents the behaviour the plan documents. Tag: **Read-only**. Touch: `src/srcfiles/drives.js` comment above the castWeb block.
5. **[Nit] S1 "in index.html" ×6** — sed the loadgame.js comments to "index.html". Tag: **Read-only**. Touch: `src/dev/verify/loadgame.js`.
6. **[Nit, Needs-design-decision] n2 afterhours.js:2923** — decide whether the "mild shame" narration line stays (it is prose, not a mechanic; if it should go, it's a one-line pool edit).

No Blocker fixes. No code-behaviour fixes are required.

---

## 7. Measured numbers (deltas vs the Handoff)

All values below were measured live this session and match the Handoff/plan tuning where the Handoff quoted numbers.

- **Phase 6:** deviancy product `openness×assertiveness` clamped: high=1, low=0, mid=0.5625, missing temperament=0.25. Nude-swim gate: prudish never (50 draws at 0.99), deviant at `rng()<0.05`. 3-day sims (startDay Sat, seed 20260816): natural cast clothing states `dressed/towel/sleepwear` only, work block always `dressed`, work-item match iff wardrobe has work items; prudish cast: 0 nude ticks; deviant cast: nude ticks only during `swimming laps`; `change_clothes` fired 2× in the day_shift+conscientious cast; `changing` never exceeded 1 tick in any sim. (Matches the plan's numbers; the w6 header notes the browser was the source of truth.)
- **Phase 7:** same-personality observer: revealing outfit → attraction 0.553 / desire 0.041; loungewear → attraction 0.110 / desire 0; plain daily < 0.15/< 0.05. `clothingWillingnessBias`: revealing 0.247 vs loungewear 0.0525. Effective reveal 0.822 after modesty damp. Attraction observer-independent; desire deviancy-gated (prude 0, deviant > 0).
- **Phase 8:** player shower-source exposure = +1.5/tick (60-min span: control 47.0 vs exposed 50.0 from a 50 start); pure decay 0.05/min (80→77 over 60 min), clamps at 0, old-save default 20. NPC heartbeat: 0.04/min decay (30→27.6), +0.05/min net with a running-water source (40→40.3). `utility.desire` bias = `0.2·clamp01((desire−45)/(100−45))`: desire-80 approach scores 0.823 vs desire-10 at 0.669; intimacy candidate (0.929) outscores eat (0.270) at desire 90/hunger 60; non-intimacy drive byte-identical at any desire. One-shots: flirted +6, peeked_at_sex +8, strongest-wins, consumed-once-and-cleared.
- **Phase 10:** risk ramp 0.069→0.177 (tick 0→9); stealth skill level-10 and a locked door each lower risk; `peekCaughtChance` monotone-saturating, `c(0)=0`, ≤ `maxCatchChance` (0.35). PEEK image budget: freshPerSession 2 / freshPerDay 6; session cap holds, per-day cap holds mid-session, stale day-record resets, cache hits never spend (`peekImageBudgetSpend` only on `!result.cached`, image.js:312). Beats: 0 fresh generations spent this session.
- **Phase 19:** in-room volume-1 mood term = exactly 0.25×0.04 = 0.01/tick (control-diff); worn mp3_player gain 0.004/tick; player mood-target lift = min(cap 0.04, 0.5×0.05) = 0.025, worn term `MOOD_TARGET.comfort.wornMusicTerm`; keep-it-down beat: 4 in 3 pinned days at volume 3, 0 at volume 0, deterministic (1009 == 1009), template always names the resident; sleeping NPCs hear nothing and never beat.
- **Phase 12 (re-measured this session):** generated-pair compatibility range **0.451–0.557** (fresh houses); D26's matchmake bar `minCompatibilityForMatch = 0.35` < every measured pair — holds.
- **Phase 18:** lifecycle timeline re-verified: conceive (chance per `PREGNANCY`), reveal day 7 (`announced` one-shot), birth day 15 (`_baby` both parents), presence cost daily, deterministic + idempotent across rollovers; qualifyingActs exactly `['sex']`; non-qualifying acts never conceive; floored pair acts produce zero pregnancy records and zero history.
- **Real save:** boots clean at day 5, 1 resident (Anna), Vex/Victor as visitors; player desire bar reads 50% post-boot (footer renders 🔥). No fresh peek generations spent.

---

## 8. Coverage gaps (not proven by this audit)

- **node harnesses not executed.** No shell tool this session; `dev/verify/run-all.js` never ran. All assertions were re-run live where portable; **S5/M1 predicts run-all fails at the w8 release-table check** (the only predicted failure). The remaining harness checks not individually re-run live are covered by this audit's equivalent live probes (documented per phase above).
- **Peek session controller (`startPeekSession`/`_peekTick`) not re-run live.** It needs the DOM, a real door, a watchable room and the real-time clock loop; running it would advance the user's real save. Its pure derivations were all verified live, and the w10 header documents the controller was live-verified in the Phase-10 session itself.
- **Vision checks not re-run.** The floor-plan fog rasterization and the keyhole-lens appearance were vision-confirmed in earlier work (per the handoff); this session re-verified the derivations and DOM fog state but did not re-capture pixels.
- **`maybeJealousUponFact` positive path.** The wrapper was re-run live on a non-triggering state (clean no-op, no crash — the earlier harness crash was a stale-reference artifact). The firing path was verified in Phase 14 via `applyInfidelityJealousy` (jealousy deltas + cold-shoulder + grievance on the wronged, `public_infidelity` severity-2 on top of jealousy). A full positive-path live wrapper run was not repeated.
- **WebGPU/WebGL.** Not applicable — the I&V phases add no GPU surfaces.
- **Image budget.** 0 fresh peek generations spent; budget (2/session, 6/day) intact for the user's session.

---

*Audit is read-only by design. Findings recorded above; no repairs were made. A follow-up fix session may schedule §6.*
