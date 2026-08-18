# Intimacy & Voyeurism Overhaul — Full-Audit Prompt

Hand the block below to the Perchance AI helper verbatim. It audits every one
of the 19 shipped phases of `src/ref/complete/intimacy-and-voyeurism-overhaul-plan.md`
against the live generator, checking **completeness, trueness to documentation,
bugs, and architecture** — and writes a single report. It is read-only: it
verifies and reports, it does not fix. Its output feeds no later phase (the
overhaul is complete); it exists to catch drift, dead code, and silent
violations the per-phase verifications never re-ran.

The prompt assumes the agent is a fresh session with no memory of the
overhaul. Everything it needs is either in the target documents or must be
discovered by reading the code.

Paste the agent's returned markdown into
`src/ref/complete/intimacy-and-voyeurism-audit-report.md`, then decide with
the user which fixes to schedule (a follow-up fix-session prompt, not this
audit, does the repairing).

---

## The prompt

> You are one session in a long-running series auditing the **Intimacy &
> Voyeurism Overhaul** of a 2D "Sims"-flavoured apartment sim on perchance.org.
> All 19 phases are marked **Done**; the plan is archived at
> `src/ref/complete/intimacy-and-voyeurism-overhaul-plan.md`. You have no
> memory of any previous session. This is a **read-only audit** — you will
> verify, measure, and report; you will **not** modify main.pjs, index.html,
> or any file under `src/`. If you find a defect, you record it in the report;
> you do not fix it. Never relitigate locked decisions D1–D29 — you check
> whether the code faithfully implements them, not whether they were right.
> If a locked decision turns out unworkable in the live code, flag it under
> "Blockers / flagged deviations" and say so plainly rather than papering
> over it.
>
> ## Step 0 — orient (cheap)
>
> Read the `## Handoff — read this first` section and the `## Status` table in
> the plan (all 19 rows should read **Done** — if any row does not, that is
> finding #1). Then read, in order: the thesis and "What this plan is *not*",
> **Locked decisions D1–D29**, the **Data model**, the **Dependency order**,
> the **Open questions**, and the ten **Design invariants**. Skim each phase
> block (`#### Phase N — ...`) as you reach that phase in Step 3. You will
> also need the session protocol in
> `src/ref/complete/intimacy-and-voyeurism-handoff-prompt.md` (it lists the
> hard technical rules and verification obligations). Cross-check **every**
> cited file, line number, and version number against the actual current code
> before trusting it — a stale citation is expected, not an error, and every
> instance you find goes in the report's citation catalogue.
>
> ## Step 1 — know the code shape
>
> - Map the files. Everything ships from `index.html` `<script>` tags
>   (note the `?v=` version numbers — record each one you rely on, and check
>   the ones the Handoff quotes). The dev harness mirrors the load order in
>   `src/dev/verify/loadgame.js` — the two lists must agree, and any file the
>   plan's phases added must appear in both.
> - Read the phase files: `willingness.js`, `peek.js`, `boundary.js`,
>   `pregnancy.js`, `codex.js`, `relationships.js`, `signals.js`, `scene.js`,
>   `drives.js`, `cognition.js`, `overture.js`, `actions.js`, `effects.js`,
>   `npc.js`, `sim.js`, `image.js`, `llm.js`, `prompt.js`, `ui.js`,
>   `render.js`, `render.computer.js`, `defs.actions.js`, `defs.world.js`,
>   `defs.computer.js`, `config.js`. Use `list_code_definition_names` and
>   targeted `read`/`grep` — do not read 50k lines top to bottom.
> - Read every `src/dev/verify/verify-wN.js` for N = 4…19. Each is the
>   phase's own assertion suite (some are 500+ lines): treat it as the phase's
>   intended-behavior spec, then re-run its highest-value checks live (Step 4).
>   **Note: there is no `verify-w1.js`/`verify-w2.js`/`verify-w3.js`** — Phases
>   1–3 apparently shipped without a dedicated harness. Confirm that, then
>   list it as a coverage gap with whatever the phases DID use to verify.
> - The harnesses were written for `node dev/verify/run-all.js`, but this
>   session has **no shell tool** — every verification happens on the live
>   Perchance page (`browser_eval`/`browser_refresh`), where `root.kv` and the
>   image plugin exist. If the user can run node elsewhere, that is
>   supplemental; your report must stand on live-page verification alone.
>
> ## Step 2 — the four audit dimensions
>
> Every finding gets one primary dimension (and file:line evidence):
>
> 1. **Completeness.** Does the phase's Goal / Files / Verification all
>    actually exist and function? A planned file never created, a planned
>    verb with no handler, a phase whose own verification criterion cannot
>    be satisfied today, a UI surface that renders nothing — these are
>    completeness findings. Verify a phase's presence the way its own
>    verification clause says to (live), not just by grepping identifiers.
> 2. **Trueness to documentation.** Does the code match what the plan and its
>    Handoff claim — identifiers, shapes, tuning numbers, call-site counts,
>    "ONE writer" ownership, load-order position, version numbers, measured
>    rates? Catalogue every stale citation, distinguishing
>    "expected-and-benign" (a comment pointing at a renamed helper) from
>    "broken" (a claim that misleads a future editor — e.g. a doc saying
>    `defs.computer.js` holds Nile rows when the catalog derives from
>    ITEM_DEFS, or a loadgame.js comment saying "in main.html" when the file
>    is index.html).
> 3. **Bugs.** Actual behavioral defects. Pay special attention to the bug
>    classes the phases themselves documented: boolean-return used as a
>    lookup key (`wearsSoundBlocking` → `SOUND_DEVICE_DEFS[true]`), signed
>    deltas producing `+-0.15` → `Number()` NaN, the registered-action
>    bridge swallowing submenu verbs and crashing on a missing `timeCost`,
>    in-function vs config-promised delta double-application, raw NPCs
>    carrying no `.id` (it is the map key) so id-carrying context shims are
>    mandatory, and wrapper-offset `SyntaxError` line numbers (trust
>    `syntaxErrors` instead).
> 4. **Weak architecture.** Single-writer ownership that drifted (two writers
>    of one flag), parallel catalogs where one derived view was the decision
>    (D18's CLOTHING_DEFS), hardcoded prose/numbers where a table exists,
>    functions blowing the 40-line convention, bare `Math.random()` in
>    sim-adjacent code (seeded rng only), kv access outside `state.js`
>    adapters, submenu nesting past one level, load-order lists that
>    disagree, dead code the phases left behind, and comments pointing at
>    paths that no longer resolve.
>
> ## Step 3 — the per-phase audit (Phase 1 → Phase 19, in order)
>
> For each phase: read its plan block (Goal/Files/Verification) + the
> matching Handoff note + its `verify-wN.js`, grep the anchors below, then
> **run its verification live**. Report a per-phase verdict for all four
> dimensions. The grep anchors (real identifiers from the Handoff — verify
> each still exists in the current code):
>
> - **Phase 1 — Submenu actions (D5, invariant 6):** `def.submenu` in
>   defs.actions.js; parents `door.interact`, `bed.interact`,
>   `wardrobe.interact`, `sound.interact`; popover open/close + blur in
>   ui.js/render.js; chips never render a submenu's verbs flat. Check: one
>   level of nesting, never two; mobile chip row does not blow out.
> - **Phase 2 — Fog-of-war (D10, invariant 5):** `renderFloorPlan`/
>   `renderFloorPlanLive`; pure `derivePlausibleActivity` (same room → full,
>   other room → coarse, locked → 'inside'); dimmed non-current rooms still
>   clickable; lock glyph with the occupant avatar still visible. Confirm a
>   new-map surface added after Phase 2 (e.g. Phase 19's stereo) does not
>   leak info the plan could not know.
> - **Phase 3 — Door cues (D4/D17):** pure `deriveDoorCues` (signals.js);
>   the `composeScene` door-cue block (scene.js); keyed text pools — never a
>   single rote string; cues perception-gated via `perceiveSignals`; light
>   semantics (asleep ⇒ dark, awake ⇒ lit at night); Phase 19's
>   `DOOR_CUE_POOLS['sound:music']`. Check D4's anti-repetition rule across
>   ten consecutive adjacent-tick renders.
> - **Phase 4 — Clothing defs/wardrobe/catalog (D11/D18):** the clothing
>   section of ITEM_DEFS (defs.world.js) with `slot`/`category`/`stats`/
>   `traits`/`styleTags`/`sortGroup:'clothing'`; `CLOTHING_DEFS` is a DERIVED
>   view, not a parallel table; wardrobe container with `.contents` +
>   `flags.tier`; `capacityByTier` enforced; Nile rows derive from priced
>   ITEM_DEFS. Check D18's "one table" decision held.
> - **Phase 5 — Wardrobe UI + state machine (D19):** the wardrobe panel
>   (slot grid); `wardrobe.change_outfit` + `wardrobe.open` under
>   `wardrobe.interact`; `CLOTHING_STATES` machine; `TRANSIENT_CLOTHING`
>   revert on the SAME per-span path for player and NPCs; the intimate gate
>   reads `NAKED_CLOTHING_STATES = ['undressed','nude']` and the other two
>   conditions (`opts.intimate` + `activeContentFlags().mature`) are
>   untouched — **the gate must stay fail-closed**: dressed/towel/changing/
>   sleepwear never open it, and nothing else widened the gate since
>   (invariant 4). Grep every other reader of `clothing ===` / `clothing ==`.
> - **Phase 6 — NPC wardrobe AI (D20):** resolveTick pass 2 derives
>   `npc.outfit` + `npc.clothing` from pure `outfitTypeForContext` →
>   `composeOutfit` / `npcClothingForContext`; `change_clothes` is the
>   caught-changing beat only (`setsClothing:'changing'`, one tick,
>   TRANSIENT revert) — no drive-set outfit drift (invariant 3 spirit); the
>   `swim` drive + one shared naked-swim gate on derived `npcDeviancy`
>   (openness×assertiveness); `STARTER_WARDROBES` per-bedroom signature sets.
>   Verify: two simulated days, an NPC is in work/sleep/workout/swim attire
>   per block; a high-deviancy NPC sometimes swims nude (peekable).
> - **Phase 7 — Clothing stats (D11):** one reader per stat, wired into
>   attraction / desire source / willingness (`clothingWillingnessBias` in
>   npc.js) / scene prose. Verify: two same-personality NPCs respond
>   differently to a revealing outfit vs loungewear; an old save with no
>   outfit still renders (default supplied).
> - **Phase 8 — Desire (D9/D12):** `DESIRE` tuning (config.js); `npc.desire`;
>   player desire need + footer bar; decay + sources (signals/flirt/peek);
>   `utility.desire` is a bias, never a hard gate. Verify: watching the
>   showering roommate's room raises player desire; it decays over a day; a
>   high-desire NPC's intimacy candidates outscore leisure; desire never
>   gates a non-intimacy action.
> - **Phase 9 — Willingness (D13, D21, invariant 1 — the phase whose check
>   cannot be skipped):** `willingness.js` is PURE (same inputs ⇒ same
>   output — determinism harness); `WILLINGNESS` weights match D21
>   (base −0.3 / attraction 0.5 / desire 0.4 / mood 0.2 / phase 0.35 /
>   personality 0.2 / context 0.25 / history 0.1; thresholds 0.45/0.5/0.6/
>   0.45/0.35, masturbate 0; abortFloor 0); hard floors asleep / hostile /
>   actively refusing / stranger return −1 with `reason:'floor'` and the
>   recorded `reasons` list, and **a floored subject never participates in
>   anything — verify the negative floor aborts on BOTH the player-as-
>   initiator and NPC-as-initiator directions (D3 symmetry)**. Grep the
>   full callsite census of `resolveWillingnessGate(` and compare against
>   what every phase's Handoff claims (e.g. boundary.js exactly 3, all
>   inside its three gate helpers; codex.js exactly 1, inside
>   `resolveConfrontTier`). Any callsite outside its documented helper is a
>   blocker.
> - **Phase 10 — Peek & Listen (D6/D7/D22/D23):** `peek.js` PEEK_SESSION
>   (`PEEK.tickMinutes` — the clock must advance in the same chunked/minutes
>   semantics the heartbeat uses, never by looping real ticks during
>   fast-forward); `riskPerTick` ramping; `PEEK_OUTCOMES` per personality;
>   `composePeekKey` cache; `peekImageBudgetAllows/Spend` are the ONLY
>   spenders (D22: freshPerSession 2 / freshPerDay 6, degrade never block);
>   keyhole lens is pure CSS/SVG, NEVER baked into the generated image (D6);
>   imagery is prompt-bounded and gate-aware through
>   `getPhysicalDescriptionForPrompt` — no post-hoc LLM assessor, no
>   hardcoded explicit strings (D23/D15). Verify with the **peek budget
>   respected**: reuse the cache; keep fresh generations ≤ 2 this session.
> - **Phase 11 — Player verbs + Make a Move (D3/D13):** `INTIMACY_ACT_DEFS`
>   (masturbate / quickie / share_shower / sex / cuddle); `resolvePairedAct`
>   (both parties' effects, willingness pre-check, `undressed`, moaning
>   signal to adjacent rooms, bed unmade, `notePlayerLedgerEntry`); Make a
>   Move resolves through the SAME initiative gate an NPC overture does
>   (`INITIATIVE_GATE`/`npcInitiativeGate`) — a bypass either direction is a
>   bug (invariant 2). Verify a full paired act against a willing NPC, and a
>   refusal with zero footprint against an unwilling one.
> - **Phase 12 — Relationships (D12):** `world.relationships`; the ONE
>   advance core `tryAdvanceRelationshipStatus` (both the daily pass and
>   matchmake route through it — check no second writer crept in); `pairCompatibility`;
>   `RELATIONSHIP` tuning; couple room-sharing. Verify: a co-located
>   compatible pair drifts single → seeing → committed over simulated days;
>   the record survives save/load.
> - **Phase 13 — NPC intimacy (D3/D13):** `masturbate` + `intimate` DRIVE_DEFS
>   (desire-bias utility, private-room + partner-willingness candidacy,
>   cooldowns, `leaves`/`emitsSignal`/`setsClothing` footprints); `tryIntimatePair`
>   (both NPCs' states, castWeb deltas both ways, relationship history,
>   `applyInfidelityFootprint`); overture variants; **no partner selection
>   bypasses the gate** (the w13 harness asserts exactly this — re-run it
>   live). Verify: a committed couple disappears into their room, moans
>   reach the neighbors, and both drives never fire past a negative
>   willingness.
> - **Phase 14 — Outside partners & infidelity (D24/D25):**
>   `ensureOutsidePartners` (per-resident seeded stream; record-gated — a
>   resident who already holds a committed/seeing record is skipped);
>   `world.outsidePartners` is a lookup, never the source of truth;
>   `planOutsidePartnerVisitsForDay`; `getActivePartnerVisit`; the host-
>   bedroom bind (D25); the `sext_partner` drive + `trySextPartner`; the ONE
>   infidelity writer `applyInfidelityFootprint` with `infidelityWrongedActs`/
>   `infidelityCheatingFact`/`infidelityWrongedPerceives`/
>   `applyInfidelityJealousy`/`maybeJealousUponFact`. Verify: the delivery-
>   driver rule (an unrelated visitor is never a partner); a caught-cheating
>   act produces jealousy deltas and the fact spreads by next day; the
>   pre-existing double-application of pairDeltas (noted, kept) is still
>   documented.
> - **Phase 15 — Codex + Confront/Spread/Matchmake (D8/D26):** the ledger
>   (`player.ledger[npcId]`) with ONE writer per kind (`notePlayerLedgerEntry`
>   participated / `notePlayerWitnessedEntry` witnessed); readers
>   `codexEntries`/`codexKnownNpcIds`/`codexNextUnspentIndex`/
>   `spendCodexEntry`; `CODEX_ACT_LABELS`; `resolveConfrontTier` is a READ
>   that calls `resolveWillingnessGate` (tier modulations only) — the three
>   verbs leave ZERO intimacy footprint; `applyConfrontNpc` /
>   `applySpreadSecret` / `applyMatchmakeNpc`; the codex app renders
>   (`renderCodexRoster`/`renderCodexDetail` in render.computer.js). Check
>   D26's `minCompatibilityForMatch` (0.35) < every generated pair still
>   holds (measured 0.43–0.49).
> - **Phase 16 — Consequences (D2/D14):** `COLD_SHOULDER` tuning;
>   `coldShoulderState`/`coldShoulderActive`/`coldShoulderSuppressesOvertures`;
>   **ONE writer** `noteColdShoulder`; willingness floor `'cold_shoulder'`
>   with exactly ONE read in willingness.js (inside `willingnessFloorReasons`);
>   the repair ratchet `noteColdShoulderRepair` (gift/apology/time);
>   `advanceColdShoulderForDay` move-out risk (no rng passed ⇒ never fires);
>   `resolveShamingTier`/`resolveShamingReaction` are READS; the peek-confirm
>   path has exactly ONE `noteColdShoulder(` (peek.js confront branch);
>   `applyInfidelityJealousy`'s `public_infidelity` severity 2 cold-shoulder
>   is on top of the jealousy deltas, never instead of. Verify: a close
>   dynamic reacts playfully to the same act a stranger finds mortifying
>   (D2 — no shame simulator anywhere; grep for any player-moral scoring).
> - **Phase 17 — Boundary acts (D27/D28):** `boundary.js` BOUNDARY_ACT_DEFS
>   (sleep_with / sleep_watch / throuple / cuck); `sleepingOccupantInRoom`;
>   `boundaryWakeChance` table; `resolveBoundaryGate` (the ATTEMPT gate: the
>   asleep floor is RECORDED as −1 with reasons ['asleep'], never relaxed);
>   `resolveBoundaryAwakeGate` (D27 warm wake re-gate); `resolveBoundaryThroupleGate`
>   (desire ≥ 45); `resolveBoundaryCatch`; **exactly three**
>   `resolveWillingnessGate(` callsites, all inside those helpers — re-run
>   the source-grep; the sneak_into_bed drive (`isBoundarySneakDrive`) with
>   cold-shoulder suppression agreeing with the willingness read. Verify the
>   MANDATORY gate check for this phase (floored target: asleep/cold-
>   shoulder/hostile — the act aborts with zero footprint).
> - **Phase 18 — Pregnancy (D29):** `pregnancy.js` readers
>   (`pregnanciesForParent`/`activePregnancyFor`/`visiblePregnancyFor`/
>   `pregnancyVisible`/`pregnancyForPair`/`hasBabyPresence`/`bornPregnancyFor`);
>   the ONE conception door `maybeConceive` with **exactly three callsites**
>   (drives.js `tryIntimatePair`, actions.js `resolvePairedAct`, boundary.js
>   `applyReciprocatedAct` — all inside COMPLETED-act resolvers downstream of
>   the willingness gate), `qualifyingActs` exactly `['sex']`; the day pass
>   `processPregnanciesForDay` (emergent trying / one-shot reveal / birth /
>   presence cost); `_tryingWith`/`relationship.trying`/`_baby` flags; the
>   save key `'pregnancies'` in SAVE_KEYS.world + `WORLD_KEY_FALLBACKS`.
>   Verify: quickie/cuddle/share_shower/throuple never conceive; a floored
>   pair act produces zero pregnancy records AND zero history; the lifecycle
>   is deterministic and idempotent.
> - **Phase 19 — Sound (D7-interplay):** `SOUND_DEVICE_DEFS` (stereo/
>   boombox/record_player with `musicByVolume`); `headphones`/`mp3_player`
>   (`blocksSound`); `SIGNAL_DEFS.music` + `SIGNAL_ICONS.bySignal.music`;
>   `MUSIC` tuning incl. `keepItDown` (threshold 0.45 / chance 0.05 /
>   mood −0.04); **`wearsSoundBlocking` returns a BOOLEAN** (the Phase-19
>   bug class: never key `SOUND_DEVICE_DEFS` with its return — read the
>   accessory name instead); `perceiveSignals` filters `channel==='sound'`
>   records for wearers; `openVolumePicker`; the `sound.interact` submenu
>   verbs; `APARTMENT_LAYOUT_VERSION` 5 seeding the stereo. Verify: a vol-2
>   stereo lifts mood in adjacent rooms and sparks the occasional beat;
>   headphones make the door-cue/listen system report nothing audible while
>   the world's signals still exist.
>
> ## Step 4 — the cross-cutting sweeps (run once, after all phases)
>
> ### A. The ten design invariants
> Verify each against the live code and report per-invariant:
> 1. **No force, ever** — the willingness function is the only door; census
>    every callsite; a negative floor aborts in BOTH directions; no effect,
>    drive, verb, or LLM call makes an unwilling subject participate.
> 2. **Symmetric initiation** — player Make-a-Move and NPC overtures share
>    the gate; grep for any second path.
> 3. **Deterministic authority** — no LLM call decides whether a boundary act
>    happens; grep the prompt builders for hardcoded explicit strings that
>    bypass `getPhysicalDescriptionForPrompt`; every explicit surface follows
>    the `intimateAllowed`/`buildEscortBoundaryText` pattern.
> 4. **`undressed` semantics** — the gate read is `NAKED_CLOTHING_STATES` and
>    unchanged in the fail-open direction; audit the full clothing-state
>    machine's transitions into and out of the gate.
> 5. **Floor plan never omniscient** — every map surface applies
>    fog/plausibility gating; nothing added after Phase 2 leaks.
> 6. **One level of nesting** — scan every `submenu` for a nested submenu.
> 7. **Every act leaves a trace** — each INTIMACY/BOUNDARY act produces ≥1 of
>    leaves / signal / clothing change / ledger / history.
> 8. **No shame simulator** — no player-moral scoring anywhere.
> 9. **Content all-on by default** — `mature` is the only gate; no second
>    NSFW toggle appeared.
> 10. **No hardcoded explicit strings** — grep image.js/llm.js/prompt.js/
>    peek.js/scene.js prompt builders; every explicit string is built
>    deterministically through the gated path.
>
> ### B. The hard technical rules (from the handoff prompt)
> - **State.js owns kv access** — runtime reads/writes go through state.js
>   adapters; grep for bare kv use in domain files.
> - **Determinism** — no bare `Math.random()` in sim-adjacent code; seeded
>   rng only; same (seed, inputs) ⇒ same decision (spot-recheck a few
>   determinism harnesses, e.g. w9, w18, w19).
> - **Closed-form fast-forward** — new timed loops (peek) advance the clock
>   in chunked/minutes semantics, never by looping real ticks during
>   fast-forward.
> - **Load order registered in two places** — index.html script tags vs
>   loadgame.js ORDER; any disagreement is a bug (missing file would break
>   the dev harness).
>
> ### C. Save/load round-trip (G.1 survival + G.2 determinism)
> For each phase's persisted surface (relationships, pregnancies,
> outsidePartners, wardrobe `.contents`/`flags.tier`, cold-shoulder flags,
> codex spent entries, peek budget `_peekBudget`, the player's outfit/
> headphones, stereo `volume` state, `_baby`/`_tryingWith` flags), run the
> REAL `writeGeneratedGameState` + `loadGameState` against an in-memory kv
> adapter (meta PRE-SEEDED with `{versions: {...FOLDER_VERSIONS}}` so the
> migration check is a no-op) and confirm survival + determinism.
>
> ### D. Live-page verification protocol (non-negotiable)
> - All checks run via `browser_eval`/`browser_refresh` on the live page.
> - **NEVER write to the user's real kv/save** (seed `zy2y81efix`). Build
>   throwaway states (`SIM_generateHouse` + `validateCharacter` if present),
>   and when you must exercise persistence use this order:
>   `stopAutosave()` + `stopClockLoop()` FIRST → `forceFlush()` into the real
>   kv → capture `realKv = root.kv` → `root.kv = makeMemKv()` (the kv-plugin
>   namespace is a PLAIN object; `root.kv.___proxyHandler` is undefined) →
>   run the test → `forceFlush()` into the mem kv → restore
>   `root.kv = realKv` → `startClockLoop()`. NEVER let an autosave see a
>   swapped state (a mid-session autosave wrote a partial meta and bricked
>   boot once — that exact failure mode is documented in the Phase-18
>   Handoff note).
> - After ANY file edit (there should be none — you are read-only — but the
>   page still hard-reloads between evals), the first eval RACES script load:
>   start it with a poll for the helpers you need
>   (`for(...){ if (typeof X === 'function') break; await sleep(250); }`).
> - If an eval reports the page frozen, recover with `browser_refresh`.
> - Visual surfaces (peek lens, floor plan fog, codex UI, keyhole images):
>   confirm by eye with the `vision` tool (canvas must be
>   `preserveDrawingBuffer:true` to capture). Describe the INTENDED
>   appearance in full and ask it to verify against that.
> - The one check that cannot be skipped in every phase with an intimacy
>   surface: **a negative-willingness act never fires** — assert it
>   directly on the page, both initiator directions.
> - Finish with a final `browser_refresh` and confirm a clean boot: no
>   `perchanceErrors`, no `syntaxErrors`, no uncaught console errors.
> - Image budget: this audit must not blow the Phase-10 peek budget (D22).
>   Reuse the kv image cache; keep fresh generations ≤ 2 for the whole
>   session; prefer authored/stubbed assertions about the prompt-builder
>   OUTPUT over actually generating.
>
> ## Step 5 — the report (deliverable)
>
> Write ONE markdown document, `src/ref/complete/intimacy-and-voyeurism-audit-report.md`
> (overwrite if re-running), with:
>
> 1. **Executive summary** — verdict per dimension (completeness /
>    trueness / bugs / architecture), total findings by severity
>    (Blocker / Major / Minor / Nit), and a one-line overall health call.
> 2. **Per-phase table** — Phase | Completeness | Doc-trueness | Bugs |
>    Architecture | Notes. One short verdict cell each; a phase is
>    "**Green**" only if all four cells are clean, else "**Amber**"/"**Red**"
>    with the reasons.
> 3. **Detailed findings** — every finding with: severity, phase(s) touched,
>    `file:line` evidence, the documented claim vs the observed reality, and
>    a reproduction (the browser_eval that showed it). Ordered by severity.
>    Findings that are merely "claim now false because the code moved on"
>    (stale comments/citations) go in section 5, not here.
> 4. **Cross-cutting sweep results** — the ten invariants, the hard rules,
>    the save/load G.1/G.2 results, each as Verified / Not verified + evidence.
> 5. **Stale-citation catalogue** — every claim in the plan/Handoff/verify
>    harnesses that does not match current code, each tagged
>    `expected-and-benign` or `broken`. Include the loadgame.js "in
>    main.html" comment, the defs.computer.js Nile-row line, the missing
>    verify-w1…w3, and any version-number drift (config v=121 etc. vs the
>    `?v=` on the actual script tags).
> 6. **Prioritized fix list** — every Blocker/Major finding as a concrete,
>    bounded fix (one line each, with the file + function to touch), ordered
>    by severity × blast radius, each tagged Read-only (yours to repair in a
>    later session) vs Needs-design-decision.
> 7. **Measured numbers** — any tuning value or rate you measured that
>    differs from what the Handoff recorded (D21–D29 numbers, measured
>    conception/beat rates, fresh-peek generations spent). Nobody else will
>    re-measure them.
> 8. **Coverage gaps** — checks that could not run in this environment
>    (node harnesses, WebGPU, image budget, network) so a future session
>    knows what this audit did NOT prove.
>
> Keep the report honest: where you could not verify something, write
> "not verified — reason" rather than inferring. If you find a phase whose
> plan block and code fundamentally disagree, stop that phase, flag it under
> **Blockers / flagged deviations**, and finish the audit of the remaining
> phases before ending.
>
> When done, also give the user a short chat summary: the health call, the
> blocker/major count, and the top five fixes.

---

## Notes for the implementing agent (not part of the prompt)

- The plan lives at `src/ref/complete/intimacy-and-voyeurism-overhaul-plan.md`
  (archived 2026-08-16, all 19 phases Done) with its session protocol at
  `src/ref/complete/intimacy-and-voyeurism-handoff-prompt.md`. Companion
  plans live in `src/ref/complete/`; the signal/drive substrate umbrella is
  `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md`. House conventions: 40-line
  functions, `hidden`-attribute UI, id suffixes (`Btn`/`El`/`Ctn`/`Input`),
  CRLF-or-mixed files edited only via execute_js string replacement.
- Attention spots this audit should not miss (each documented in the plan's
  Handoff as a resolved incident, now candidates for drift):
  - `verify-w1.js`/`w2`/`w3` do not exist — Phases 1–3 never shipped a
    dedicated harness.
  - The Phase-18 save incident (partial meta → `Migration incomplete for
    meta: at 0, expected 2`; repaired; kv snapshots `pre-w18-*` and
    `scratch/save-backup-w18.json` exist) — the real save now loads with
    Anna as resident; the audit must boot-check it without mutating it.
  - The repaired save has historically had **0 residents** at times (Phase-13
    note documents "13 NPCs, 0 residents") — if the audit finds the current
    cast thin, that is a data state, not necessarily a bug; note it.
  - The pre-existing pairDeltas double-application in `tryIntimatePair`
    (Phase 14) was deliberately kept for the w13 baseline — confirm it is
    still documented and still not a live divergence.
- The report path is the deliverable; the audit is read-only by design so a
  later session can schedule the fix list without this session's findings
  being clobbered by its own repairs.
