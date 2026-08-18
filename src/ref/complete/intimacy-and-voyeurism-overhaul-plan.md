# Intimacy & Voyeurism Overhaul

Status: **ALL 19 PHASES COMPLETE — the full Intimacy & Voyeurism Overhaul is shipped.** Design session complete 2026-08-15; all decisions locked. Last updated 2026-08-16.

Companions:
- `src/ref/complete/player-creation-and-intro-plan.md` (the `physical.intimate` layer and its three-part fail-closed gate — **read D5–D11 before touching anything intimate-adjacent**; this plan's clothing work must keep `undressed` meaning what that gate expects)
- `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md` (the drive/overture/gossip substrate — R1–R8 — everything here rides)
- `src/ref/complete/perception-and-signals-plan.md` (the signal layer the door-cue, peek, and listen systems read)
- `src/ref/complete/npc-cognition-plan.md` (utility scoring + commitments — desire bias and the intimacy drives slot into it)
- `src/ref/complete/npc-initiative-plan.md` (overtures + the initiative gate + shared activities — the initiation-symmetry and paired-act substrate)
- `src/ref/complete/external-world-npcs-overhaul-plan.md` (the visit spine — outside partners generalize it)
- `src/ref/complete/knowledge-gossip-memory-plan.md` (fact provenance + gossip transmission — the scandal engine the consequences ride)
- `src/ref/complete/renovation-occupancy-overhaul-plan.md` (per-bedroom facilities, `residentCapacity: 2` — couples sharing a room)
- `src/ref/complete/afterhours-redesign-plan.md` (the player's existing masturbation path; the apartment act generalizes it)
- `src/ref/complete/needs-and-heartbeat-plan.md` (the heartbeat + closed-form fast-forward the real-time peek loop must respect)
- `src/ref/complete/continuous-behavior-engine-plan.md` (commitments/anchors — intimacy acts anchor on beds like everything else)

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session — see
`src/ref/complete/intimacy-and-voyeurism-handoff-prompt.md` for the full session
protocol.

---

## Handoff — read this first

**Resume at:** None — **ALL 19 PHASES COMPLETE**. The overhaul is shipped and verified. If further work comes, it should be a NEW plan document; this one is archived to `src/ref/complete/` (update the `src/ref/README.md` + `src/ref/structural/ARCHITECTURE.md` indexes — already done in the archive step).

**Last session's notes (Phase 19 — Music devices & headphones, 2026-08-16 — FINAL phase):**
- **`SOUND_DEVICE_DEFS`** (config.js v=121, after `SIGNAL_ICONS`): `stereo`/`boombox`/`record_player` — each `{label, emoji, musicByVolume: {'0':0, '1':0.25/0.3/0.2, '2':0.5/0.55/0.45, '3':0.75/0.85/0.7}, affords:['sound.play','sound.set_volume','sound.eject']}`; `headphones`/`mp3_player` — `{sourceItemDef, carried:true, blocksSound:true, npcMoodGainPerTick: 0.003/0.004}`. `SIGNAL_DEFS.music` — `{channel:'sound', category:'ambient', salience:0.3, intensity:...}` with faint/clear/strong phrase pools; `SIGNAL_ICONS.bySignal.music = '🎶'`. Music tuning `MUSIC` (config.js): `npcMoodPerIntensity 0.04` (cap `npcMoodCap 0.03`), `playerMoodScale 0.05` (cap `playerMoodCap 0.04`), `wornPlayerMoodTarget 0.02`, `keepItDown {threshold 0.45, chancePerTick 0.05, npcMood -0.04, lines [5]}`. `MOOD_TARGET.comfort` gained `musicScale/musicCap/wornMusicTerm`; `EVENT_IMPORTANCE.music_too_loud='social'`, `EVENT_EMOTION.music_too_loud='argument'`.
- **World + items** (defs.world.js v=36): `hobby_record_player` gained `volume` state + emits music 0.2/0.45/0.7 when powered on (in `buildHobbyEffects`); NEW OBJECT_DEFS `stereo` (seeded into living_room via **`APARTMENT_LAYOUT_VERSION` 5**) and `boombox`; ITEM_DEFS: `headphones` CONVERTED to `{sortGroup:'clothing', slot:'accessory', blocksSound:true}` + new `mp3_player` item (`blocksSound:true`); buyable `stereo` ($90) / `boombox` ($45) items. **No defs.computer.js change needed** — Nile rows derive automatically from priced ITEM_DEFS (the plan's "defs.computer.js: Nile rows" line is a stale citation; documented not changed).
- **Verbs** (defs.actions.js v=37): `'sound.interact'` grouping parent — submenu `['sound.play','sound.set_volume','sound.eject']` (Phase 1 submenu pattern, one level, never flat). The three object-sourced verbs use helper `soundDeviceObj` (reads `ctx.actObjId`); `prepareSoundDevice` (pick target object in room), `prepareSoundVolume` (awaits the NEW `openVolumePicker(currentVolume, deviceLabel)` modal in render.js v=60), `buildSoundPlayEffects`/`buildSoundVolumeEffects`/`buildSoundEjectEffects` emit SET_OBJECT_STATE lines; narration builders. `actions.js` v=31: `executeAction` threads `opts.objId` into `ctx.actObjId`. `buildActionGroups` (render.js) renders one "Device ▸" chip per sound device in room, carrying `extra.objId`.
- **Sound blocking** (signals.js v=18): **`wearsSoundBlocking(gameState, perceiverId)` returns a BOOLEAN** (reads the wearer's `outfit.accessory`); `perceiveSignals` FILTERS OUT records whose `def.channel === 'sound'` for wearers. ui.js v=91: `handleAction`'s `door.listen` intercept returns early (reports nothing) when the player wears sound-blocking; the door-cue/keyhole view is untouched. `door.listen`'s no-blocking path ALSO now respects `SIGNAL_DEFS.music` intensity for its cue text via `DOOR_CUE_POOLS['sound:music']` (scene.js v=17, 6 lines).
- **Sim effects** (sim.js v=72): resolveTick pass-2 music term — music mood for awake non-blocking NPCs in the same room (or adjacent via the door-listen signal read) `min(intensity, npcMoodCap) * npcMoodPerIntensity`-scaled; the keep-it-down beat (`music_too_loud` event, mood −0.04, seeded per (npc,room,day,tick)); worn-device gain for players (`wornMusicTerm` mood target term) and NPCs (`npcMoodGainPerTick`). resolveMoodTarget gained the music terms. **BUG FOUND+FIXED during verification:** the worn-NPC-gain code initially re-read `wearsSoundBlocking`'s BOOLEAN as a `SOUND_DEVICE_DEFS` key (`SOUND_DEVICE_DEFS[true]`) so the gain never fired — fixed by re-reading the accessory name: `const acc = (gameState.npcs?.[id]?.outfit?.accessory) || ''; const gain = SOUND_DEVICE_DEFS[acc]?.npcMoodGainPerTick;`. (CRLF file — edited via execute_js string replacement.)
- **Verify coverage:** `src/dev/verify/verify-w19.js` (NEW — written for `node dev/verify/run-all.js` but NOT executable this session, no shell tool; every check ran LIVE via browser_eval instead, all green). Sections: derivation/propagation (door-hop arrival intensity 0.1125), the headphones/mp3_player filter (records dropped for wearers, world state unchanged), the door-cue gate + ajar/light survival, mood control-diff (in-room vol-2 0.02/tick vs 0), beats (fire loud / never quiet / deterministic / `{name}` template), sleeping-NPC no-lift/no-beats even with music reaching them, worn-gain control-diff, player mood-target terms, verb builders + the REAL `applyEffects` pipeline (0.5→0.75→silent via `executeAction`), record-player hobby, submenu-never-flat, **the MANDATORY gate check** (asleep floored target refuses via `resolveWillingnessGate` `reason:'floor'` AND the `executeAction` path, zero `relPlayer` footprint + census), and save/load round-trip **G.1** (stereo state + player headphones + NPC mp3_player survive real `writeGeneratedGameState`/`loadGameState`) + **G.2** determinism.
- **Live verification notes (browser_eval, throwaway `SIM_generateHouse` states — the user's real kv/save seed `zy2y81efix` NEVER written to):** 25/25 section checks + G.1 + G.2 green; final `browser_refresh` clean boot, no perchanceErrors/syntaxErrors. The live round-trip protocol: `stopAutosave()` + `stopClockLoop()` FIRST → `forceFlush()` into real kv → capture `realKv = root.kv` → `root.kv = makeMemKv()` (kv-plugin namespace is a PLAIN object; `root.kv.___proxyHandler` is undefined) → tests → `forceFlush()` into mem → `root.kv = realKv` → `startClockLoop()`. One combined G.1+G.2 eval threw `value.___proxyHandler.executeChain is not a function` (undiagnosed) — running G.1 and G.2 as SEPARATE evals with the full protocol each worked cleanly. After ANY file edit the first browser_eval reloads and RACES script load — start evals with a poll for `typeof validateCharacter === 'function' && typeof SIM_generateHouse === 'function'`.
- **Measured numbers.** keepItDown threshold 0.45 / chance 0.05 per awake loud-music NPC-tick / mood −0.04; npcMoodPerIntensity 0.04 capped 0.03 (in-room vol-2 = 0.02/tick; through door vol-2 = 0.0045); playerMoodScale 0.05 cap 0.04 (in-room vol-2 = 0.025 target); wornMusicTerm 0.02 (player) / npcMoodGainPerTick 0.003 headphones / 0.004 mp3_player; beats measured in 3-day windows (seeds 20260903/20260904, pinned living-room resident at vol 3). Fresh-house player energy 70 → base attention 0.3 (filters the 0.1125 door-hop arrival; energy 100 → 0.45 needed to notice). **0 images generated** (no image-budget spend; Phase 19 has no image surface). **CRLF note:** config/ui/state/sim/render/llm/npc/image/actions/drives/scene are CRLF or mixed — edits there must go through execute_js string replacement, never the plain edit tool.

**Prior session's notes (Phase 18 — Pregnancy, D14/D16, 2026-08-16):**
- **The new file `src/srcfiles/pregnancy.js`** (loaded in index.html between boundary.js and render.js; `loadgame.js` ORDER gained 'pregnancy.js' after 'boundary.js'). Pure readers: `pregnanciesForParent(gs,id)`, `activePregnancyFor(gs,id)` (birthDay==null), `visiblePregnancyFor(gs,id)` (active AND day≥visibleFromDay — the belly read), `pregnancyVisible(gs,id)` (bool form), `pregnancyForPair(gs,a,b)`, `hasBabyPresence(gs,id)` (reads flags._baby — 'player' → gs.player.flags, else npc.flags), `bornPregnancyFor(gs,id)`. Fact builders `pregnancyFactRecord(gs,parents,day)` / `birthFactRecord(gs,parents,day)` — category `PREGNANCY.factCategory` ('pregnancy'), importance 0.8 (significant → pinned), emotionalTag 'romance', canonical texts "{A} and {B} are expecting a baby." / "…had a baby." `pregnancySelfLine(gs)` — the PLAYER's bump/newborn line for the scene establishing passage (null when nothing to say). `pickTryingLine`/`pickBirthLine` — seeded prose pickers (PEEK_PROSE pattern, salts `tryingline|pair|day` / `birthline|pair|day`).
- **The ONE conception door `maybeConceive(gs, a, b, act, opts)`** — the only entry into `world.pregnancies`. Guards: `PREGNANCY.qualifyingActs.includes(act)` (currently ['sex'] only) AND neither participant already actively pregnant. Trying flag: `player.flags._tryingWith` (player acts) else `relationship.trying` (NPC pair, via getRelationship). Roll `seededRng(gs.meta.seed, 'conceive|'+pairKey+'|'+day+'|'+minutes)`; chance = trying ? 0.35 : 0.08. Pushes `{parents: sorted, conceivedDay, dueDay: day+14, visibleFromDay: day+6, birthDay: null, announced: false}`. **Exactly THREE callsites, all inside COMPLETED-act resolvers, all downstream of the willingness gate (verified by grep): drives.js `tryIntimatePair` (after addRelationshipHistory, renumbered steps 4–10), actions.js `resolvePairedAct` (after notePlayerLedgerEntry, passes `def.paired.ledgerAct || def.id`), boundary.js `applyReciprocatedAct` (passes 'sex').** Quickie/cuddle/share_shower/throuple never conceive (qualifyingActs + callsite placement). The willingness gate is byte-unchanged — this phase adds no door (D13/D15: the act's own gate proved both parties willing; data decides, prose narrates).
- **The day pass `processPregnanciesForDay(gs, day)`** (called from ui.js `processDayRollover` right after the `updateRelationshipsForDay` loop; returns narration LINES for the caller to log, same contract). Three deterministic jobs: (1) EMERGENT TRYING — a committed relationship record with recent sex (`lastIntimateDay` within `PREGNANCY.trying.recencyDays` 7) may flip `rec.trying=true` via `seededRng(seed, 'trying|'+pairKey+'|'+day)` < chancePerDay 0.06; single/no-history pairs never try. (2) TERM — the one-shot reveal at visibleFromDay (announced=true + the pinned pregnancy fact written to BOTH NPC parents via `addMemoryFact`; player parents get no fact — they know already), then the birth at dueDay: `_baby: {otherParent, bornDay}` stamped on BOTH parents (the ONE birth writer), the birth fact on both NPC parents, one narration line. (3) PRESENCE — post-birth daily cost: NPC parents `applyMoodDelta(+0.04, 'new baby')` (note: reason is a STRING now, not the day — fixed in-process), player `pushMoodImpulse(+0.06)` + energy −6/day. Idempotent per record (`announced` is the fact latch, `birthDay` the birth latch).
- **The player's "Try for a Baby" toggle** (ui.js): render.js Social-group chips per present NPC "Try for a Baby with X"/"Stop Trying with X" (gated on `npc.flags?._intimacyHistory?.lastWith === 'player'` or already-trying); `doPregnancySetTrying(npcId, trying)` flips `player.flags._tryingWith`, logs narration, renders, `saveAtBoundary('pregnancy-trying')`; handleAction cases `pregnancy.start-trying`/`pregnancy.stop-trying`.
- **Scene/prompt/image wiring.** scene.js `presenceLines` appends a bump line via `presencePregnancyLine(gameState, npcId, name, line)`; `composeScene` folds `pregnancySelfLine(gameState)` into the self line. npc.js `getPhysicalDescriptionForPrompt(npc, opts)` gained a fail-closed belly clause gated on `opts.gameState && typeof pregnancyVisible==='function' && selfId && pregnancyVisible(...)` where **`selfId = opts.isPlayer ? 'player' : (opts.npcId || npc.id)`** — NPC records carry no `.id` (it's the map key), so real callers must pass `opts.npcId` (see peek, below) or id-carrying context shims. llm.js `buildNpcBlockV2(npc, query, channel, day, gameState)` — new 5th param; emits `[Pregnancy]:`/`[Baby]:` block lines (guarded on typeof — llm.js loads before pregnancy.js); its `getPhysicalDescriptionForPrompt` call threads gameState; callers `buildScenePrompt`/`buildImPrompt` pass `context.gameState` (both assembleContext and assembleImContext add it). image.js `describe` threads `opts.gameState` (+`isPlayer` for the player); **`composePeekPrompt(gs, roomId, npc, actKey, npcId)` / `getPeekImage(gs, roomId, npc, npcId)` gained the npcId param** (peek.js passes `focus.npcId`) so a peek at a visibly pregnant occupant shows the bump; render.js getSceneImage call passes `{gameState: gs}`.
- **Persistence**: state.js SAVE_KEYS world list gained `'pregnancies'`; `WORLD_KEY_FALLBACKS.pregnancies = () => []`; loadGameState reads `getWorld('pregnancies')` and includes it in the world reconstruction. NO version bump (additive-default precedent like relationships/outsidePartners). Offscreen baby event: sim.js `drawOffscreenEvent` appends `{type:'baby', weight:3, ...'stayed in with the baby'...}` to the pool when `npc?.flags?._baby`.
- **Config** (config.js `PREGNANCY` after BOUNDARY): `termDays 14, visibleFromDay 6, tryingChancePerAct 0.35, baseChancePerAct 0.08, qualifyingActs ['sex'], trying {chancePerDay 0.06, recencyDays 7}, baby {offscreenEventWeight 3, dailyMoodBoost 0.04, playerMoodBoost 0.06, playerEnergyCost 6}, factCategory 'pregnancy', factImportance 0.8, factEmotionalTag 'romance', birthLines [4], tryingLines [3]`. Plus `EVENT_IMPORTANCE.birth='significant'`, `EVENT_EMOTION.birth='warmth'`, and an OFFSCREEN_EVENTS baby row.
- **Verify coverage:** `src/dev/verify/verify-w18.js` (6 sections: conception door incl. qualifying-acts-only + active-pregnancy guard + trying-vs-base empirical rate + record shape; **section 2 — the MANDATORY gate check** — exactly three `maybeConceive(` call sites total across drives/actions/boundary/willingness (willingness 0), plus the floored-target pair act (asleep / cold-shoulder / hostile) aborting with ZERO pregnancy records and ZERO history AND a positive control completing; lifecycle — emergent trying (committed+recent-sex flips, single/no-history never, deterministic), the one-shot reveal fact, the birth stamps + fact + narration + bump-gone + idempotent re-rollover, the presence cost (birth-day-first, +0.04/−6 per day after); the player path (_tryingWith drives the roll, player._baby stamp, pregnancySelfLine bump→newborn); the pure readers across a full lifecycle; section 5 — save/load round-trip through the REAL `writeGeneratedGameState`/`loadGameState` against an in-memory kv adapter meta pre-seeded with `{versions: {...FOLDER_VERSIONS}}` — G.1 pregnancies(+active+born)/relationship.trying/_baby/_tryingWith survival, G.2 determinism). **Same caveat as w16/w17 (Phase 16 blocker 6): written for `node dev/verify/run-all.js` but NOT executable this session (no shell tool) — every check was run LIVE via browser_eval instead and is green.**
- **Live verification (browser_eval, throwaway `SIM_generateHouse` states):** uniform seeded rolls (mean 0.498 over 5000 draws); measured per-act conception ~21% trying / ~6% base over 90-minute sweeps (censored early-stop bias; targets 0.35/0.08 — the sweep stops on first hit); same-(pair,day,minutes) → identical decision (double-run at 790→both miss, 800→both conceive); active-pregnancy guard holds over a 2400-minute sweep; quickie never conceives; full NPC lifecycle (conceive day 2 → reveal day 8 with pinned fact on BOTH parents → birth day 16 with `_baby` stamps + birth fact + narration + bump gone + mood +0.04/day, idempotent re-rollover); emergent trying measured (82% of nightly-sex committed couples within 30 days, median day 11); player path (tryingWith → conceive; player birth stamps player._baby + energy −6/day + newborn self-line); the gate check (asleep/cold-shoulder/hostile all abort with 0 pregnancies + 0 history; positive controls complete — the player pipeline `executeAction('intimacy.sex')` with a willing target conceived, partner history + ledger written); the describer/prompt block trio (bump in peek prompt via npcId, `[Pregnancy]`/`[Baby]` block lines via id-carrying shims, player bump via isPlayer, born → no bump — **the original trio failure was the raw-npc-has-no-.id bug, fixed by the selfId/npcId threading above**); presence line shows the bump; the playerSelfLine; the chip labels. Final page state: clean boot, no perchanceErrors/syntaxErrors.
- **SAVE INCIDENT (IMPORTANT — read before touching the user's kv).** Mid-verification I corrupted the user's real kv meta: my live round-trip evals swapped `root.kv` (mem adapter) and `currentGameState` (throwaway states) WITHOUT first stopping the 30s autosave timer, and a fired autosave wrote a partial meta (`{clock, sessionLog, imageIndex}`, no versions/seed) into the REAL meta folder → boot's `migrateFolder('meta', 0→2)` asserted ("Migration incomplete for meta: at 0, expected 2"). **Rule for future sessions: in live evals, `stopAutosave()` + `stopClockLoop()` FIRST, swap `root.kv`/`currentGameState`, `forceFlush()` into the mem kv BEFORE restoring — and never let an autosave see a swapped state.** The meta was REPAIRED: reconstructed from the freshest `pre-migrate-meta-1-to-2-*` snapshot (seed zy2y81efix) + current FOLDER_VERSIONS + the damaged meta's clock (day 6) + a backfilled `scene`; boot now clean. While repairing I also discovered the save has had **0 residents since ~mid-July** (Phase 13's note already documents "13 NPCs, 0 residents"; every July save record and the live folders had only contractor + driver_3-era external NPCs, empty castWeb/relationships/events, empty player ledger). I recovered the last-known cast from the Jul-13 `pre-migrate-npcs-6-to-7-1786660049352` snapshot — **Anna (npc_e6q6ze_0, resident, bedroom_1), Vex (npc_e6q6ze_900000, visitor), Victor (driver_3, visitor)** — backfilled `bible.physical.intimate` with the same seeded 6→7 formula, and injected them into the auto-slot records (auto_0..4 — the Continue path, since `resumeFromRecord`'s stale-key sweep overwrites the live folder anyway) + the live npcs folder. Continue now loads day 5 with Anna as resident, sim runs, clock advances, no errors. **Backups:** kv.snapshots `pre-w18-repair-1786914316475` (live meta+npcs before repair), `pre-w18-slotpatch-1786914558427-*` (the five auto-slot records before patching), plus `scratch/save-backup-w18.json` (full 4MB kv export). upload_file kept failing with network_failure — retry the scratch export upload next session if a hosted backup is wanted. If the user prefers the old 13-NPC state, restore the `pre-w18-slotpatch-*` records. The slot records' July content was OVERWRITTEN by today's autosaves during this incident (content-equivalent day-5 state, so no real loss beyond createdAt/saveIndex lineage).
- **Measured numbers.** termDays 14, visibleFromDay 6, tryingChancePerAct 0.35, baseChancePerAct 0.08 (measured live ~21%/6% over minute sweeps — censored early-stop), trying.chancePerDay 0.06 / recencyDays 7 (measured 82% of nightly-sex committed couples within 30 days, median day 11), baby.dailyMoodBoost 0.04 (NPC) / playerMoodBoost 0.06 + playerEnergyCost 6 per day, offscreenEventWeight 3, factImportance 0.8 (pinned). Roll uniformity mean 0.498 over 5000 draws. **0 images generated** (no image-budget spend this phase; the bump shows only in scene/peek PROMPT text, no fresh generations). **CRLF note:** most src/ files are CRLF or mixed (config/ui/state/sim/render/llm/npc/image/actions/drives/scene) — use execute_js string replacement for edits there, never the plain edit tool, and preserve the file's dominant EOL.

**Prior session's notes (Phase 17 — Boundary acts: sleeping-room, throuple, bull/cuck, D13/D14, 2026-08-16):**
- **The new file `src/srcfiles/boundary.js`** (loaded between peek.js and render.js) holds the whole phase. `BOUNDARY_ACT_DEFS` — `sleep_with` (caught risk high, ledgerAct 'boundary_sleep_with', targetState 'sleeping'), `sleep_watch` (watching a sleeping resident, ledgerAct 'boundary_watch_sleeper', targetState 'sleeping'), `throuple` (three-way: true), `cuck` (threeWay: true — the LEDGER act is 'cuck' when the two NPC participants hold a committed/seeing record, else 'throuple'). `BOUNDARY_PROSE` pools (sleepWithOpen/sleepWatchOpen/sleepWithUncaught/sleepWatchUncaught/warmRefuse/reciprocate/throupleOpen/cuckOpen/throupleDone/cuckDone). `sleepingOccupantInRoom(gs, roomId)` → the resident in that room whose `_vulnerableState === 'sleeping'` (drives.js's flag). `boundaryTierFor` = `resolveShamingTier`. `boundaryThreeWayConfig(gs, npcA, npcB)` — cuck when the pair holds a committed/seeing record, else throuple. `boundaryWakeChance(gs, occupant, initiator)` — the seeded-risk curve from `BOUNDARY.sleepRoom.wakeChanceByDynamic` (cold 0.92 / neutral 0.65 / warm 0.30 / hostile 0.95 — note hostile ALSO high: a hostile dynamic is not safe, just different; warm is the only low-risk lane) modulated by stealth/sleep-depth from `boundaryTargetSleepDepth`. `pickBoundaryProse` — the PEEK_PROSE seeded pattern (per (pool, day, npc)). `applyBoundarySleepRoom(gs, ctx)` — outcomes uncaught / caught / warm_refuse / reciprocated. `applyReciprocatedAct` — the completed paired-act footprint (undressed, activityOverride, intimacy history BOTH ways via noteIntimacyOccurred, bed unmade, ledger 'reciprocated', infidelity via applyInfidelityFootprint). `applyBoundaryThrouple` — BOTH NPC participants get the intimacy footprint + castWeb both ways + relationship history, the THREE ledger entries (otherNpcId cross-linked), the player's own relDeltas to both, bed unmade. `applyThreeWayInfidelity` — a PARTICIPANT LOOP: every participant's `infidelityWrongedActs` is computed (so a married NPC threesome wrongs their outside partner, and player-among-others routes each NPC participant's committed partner — including each OTHER — through the player as `otherId:'player'` → `public_infidelity` cold-shoulder, symmetric with the paired footprint). `boundaryThreeWayFact` (canonical gossip fact for the phase), `boundarySneakCandidacy` (npcId's own sneaking door — deviancy openness+assertiveness floor 0.6, desire floor 50, `_vulnerableState === 'sleeping'`, adjacent unlocked door), `trySneakIntoBed` (silent vs caught footprint, both via seeded rng; silent: desire −40, mood +0.05, affection relDeltas, bed unmade, "lying beside you" prose; caught: tension spike, `suspicion.boundary_violation +0.2`, "sneaking back out" prose, `seenByPlayer` event only when the player actually witnesses).
- **The gate — one willingness function, three helpers, the awake re-gate.** `resolveBoundaryGate(gs, initiatorId, targetId, ctx)` — the ATTEMPT gate: requires the target `_vulnerableState === 'asleep'` AND in-room AND resident AND not cold-shouldering the initiator, and calls `resolveWillingnessGate(gs, targetId, 'sex', ctx)` with ctx.actKind='boundary' so the floor records `reason:'floor', reasons:['asleep']` (the D13 narrow-floor record, willingness −1, logged, never relaxed). `resolveBoundaryThroupleGate` — both partners through `resolveWillingnessGate(gs, partnerId, 'sex')` + `desire ≥ BOUNDARY.throuple.desireFloor` (45). **`resolveBoundaryAwakeGate`** — the NEW D27 helper: when the wake roll finds the target AWAKE, the act is RE-GATED through `resolveWillingnessGate(gs, targetId, 'sex', {actKind:'boundary-awake'})` with a shallow activity-proxy context (`intimateAllowed`-equivalent) so a willing warm target can still reciprocate but an unwilling one cannot be pushed; the asleep floor itself is never relaxed. `resolveBoundaryCatch` — seeded roll against `boundaryWakeChance`; on caught, if the dynamic is warm it re-runs the awake gate (warm-willing → reciprocate, warm-unwilling → warm_refuse), else the shaming path via `resolveShamingReaction` (tier/deltas/severe cold-shoulder `noteColdShoulder(..., 'caught_peep')`-style, ledger 'caught', tension spike from `BOUNDARY.sleepRoom.caughtTensionSpike` 0.08). **The MANDATORY gate check (source-grep, verified): boundary.js has EXACTLY THREE `resolveWillingnessGate(` calls — inside resolveBoundaryGate, resolveBoundaryThroupleGate, and resolveBoundaryAwakeGate only; no other path touches the willingness function, and the willingness function itself is byte-unchanged (invariant 1). The three gate helpers are the ONLY doors: every applyBoundary* entry point routes through resolveBoundaryGate/resolveBoundaryThroupleGate first (resolveBoundaryAwakeGate is the only helper resolveBoundaryCatch and applyBoundarySleepRoom call), so a completed act only ever happens with an awake, willing partner (D27).
- **The player-facing UI** (ui.js v=90): `doBoundarySleepRoom(actId, npcId)` — gate → open prose → `advanceAndResolveMinutes` → `applyBoundarySleepRoom` → narrate → render → `saveAtBoundary`; `doBoundaryThrouple()` — two `openIntimacyPicker` partner picks → `resolveBoundaryThroupleGate` (a soft no → `willingnessRefusalProse` + `noteIntimacyRefusal(partner,'below_threshold')`, no footprint) → advance → `applyBoundaryThrouple` → cuck/throuple prose → save. render.js v=59: the bed's "▸" chip (Here group) appears when `sleepingOccupantInRoom`, exposing `sleep_with`/`sleep_watch`; a 'Propose a Threesome' chip in the Social group when `presentNpcIds.length >= 2`. defs.actions.js v=36: `bed.interact` gained `submenu:['boundary.sleep_with','boundary.sleep_watch']` and the two verb defs carry `labels: {name}`-style so the submenu renders names. handleAction intercepts the three boundary ids BEFORE the registered-action bridge.
- **Two REAL bugs found and fixed while wiring the UI** (both pre-existing-handover, Phase-17-owned): (1) the boundary.sleep_* verbs are defs.actions rows, so the registered-action bridge swallowed them → `resolveTimeCost` crashed on a missing `timeCost` — handleAction now intercepts them before the bridge (the old switch case for boundary.throuple was dead code and was removed). (2) `doBoundarySleepRoom` was being called with the FULL id `'boundary.sleep_with'` but `BOUNDARY_ACT_DEFS` keys are short `'sleep_with'` — stripped, matching `boundaryTierFor`/`sleepingOccupantInRoom` consumers.
- **The NPC sneaking drive** (config.js v=120 `DRIVE_DEFS.sneak_into_bed` — isBoundarySneakDrive, weight 0.0, evening/wind_down blocks, cooldown `BOUNDARY.npcSneak.cooldownMinutes` 720; cognition.js v=28 `DRIVE_CANDIDACY.sneak_into_bed` → `boundarySneakCandidacy`; drives.js v=38 `else if (drive.isBoundarySneakDrive)` branch → `trySneakIntoBed` + cooldown). `COLD_SHOULDER.suppressedDrives` gained 'sneak_into_bed' (a cold NPC never sneaks — the willingness read and the candidacy agree, same pattern as Phase 16's suppression agreement).
- **Config** (config.js v=120 `BOUNDARY`): `durationMinutes {sleep_with:30, sleep_watch:10, throuple:40}`; `sleepRoom` — the wake-chance table above, `watchWakeChance {cold:0.75, neutral:0.45, warm:0.18, hostile:0.85}`, `stealthFactor 0.06`, `perceptionWeight 0.15`, `sleepWith {playerMood 0.15, playerEnergy 8, reciprocateDeltas = INTIMACY.relDeltas.sex}`, `watch {playerMood 0.08}`, `warmRefuseDeltas {tension 0.05, affection 0.02}`, `caughtTensionSpike 0.08`; `throuple {desireFloor 45, pairDeltas, relDeltas, npcEffects, playerEffects}`; `npcSneak` (all above). `EVENT_IMPORTANCE.boundary='significant'`, `EVENT_EMOTION.boundary='embarrassment'`. Codex: `CODEX_ACT_LABELS` += boundary_sleep_with:'climbed into bed with', boundary_watch_sleeper:'watched while they slept', throuple:'had a threesome with', cuck:'had a threesome with' (codex.js v=2).
- **Verify coverage:** `src/dev/verify/verify-w17.js` (8 sections: gate matrix incl. asleep-floor recorded and negative-floor-absent refusal paths; **the MANDATORY gate check** — exactly 3 resolveWillingnessGate callsites in boundary.js all inside the three helpers, plus the no-bypass source-grep; wake/catch branch + same-seed determinism; three-way footprint + cuck config + infidelity (absent-wronged fact/'cheat' history no-jealousy vs in-room-wronged jealousy + public_infidelity cold-shoulder severity 2); sneak drive candidacy + cold-shoulder suppression + silent/caught footprints; codex labels; save/load round-trips G.1/G.2 through the real writeGeneratedGameState/loadGameState against an in-memory kv adapter meta pre-seeded with `{versions: {...FOLDER_VERSIONS}}`). **Same caveat as w16 (blocker 6): written for `node dev/verify/run-all.js` but NOT executable this session — no shell tool** — every check was run LIVE via browser_eval instead and is green; loadgame.js ORDER gained 'boundary.js' after 'peek.js'.
- **Live verification (browser_eval, throwaway `SIM_generateHouse` states — the user's real kv/save, seed zy2y81efix, was NEVER written to):** gate matrix green (asleep resident allowed with floor −1 + reasons ['asleep']; awake/absent/non-resident/cold-shoulder all refused); throuple gate (both willing allowed; soft no → below_threshold 0.27 partner 'b' + noteIntimacyRefusal; desire<45 → not_into_it; asleep partner → floor −1 — a negative willingness never fires); the MANDATORY check via execute_js grep (exactly 3 callsites, all in the helpers); catch/wake branches with fixed seeds — cold wake seed 3000 → caught, severity 3, tension 0.25+0.08 spike, ledger 'caught'; uncaught seed 4006 → player mood/energy up, ledger null; **warm-willing seed 5001 → RECIPROCATED** (undressed, activity 'intimacy', intimacy history, bed unmade — the awake re-gate made reciprocate reachable; the pre-D27 proxy made it dead); warm-unwilling seed 6004 → warm_refuse (tension +0.05, affection +0.02, NO cold-shoulder, ledger 'caught'); same-seed same-outcome; throuple footprint (both undressed + intimacy history + cross-linked ledger + castWeb both ways + unmade bed; committed pair → ledger 'cuck'; absent wronged → fact + 'cheat' history, no jealousy; in-room wronged → jealousy + public_infidelity cold-shoulder severity 2, one event); sneak drive (deviancy 0.9/0.9 + sleeping + adjacent unlocked door → candid; low deviancy/awake/locked/non-adjacent → not; cold-shoulder suppresses + positive control opens; silent seed 9000 desire −40 affection +0.03 "lying beside you" no event; caught seed 9002 tension +0.12 suspicion 0.2 "sneaking back out" event type 'boundary' seenByPlayer; locked door → resolver null); save/load round-trips GREEN through real state.js functions with in-memory kv (caught cold-shoulder + ledger survived; reciprocated undressed/activity/history/ledger/bed-unmade survived; deterministic). **UI flows through the REAL handleAction**: sleep_with caught (severity 3, ledger, clock 480→510, persisted) and boundary.throuple (the picker STUBBED via `window.openIntimacyPicker` auto-return — the real modal hangs headless; ledger 'throuple', both undressed, clock 480→520, persisted). currentGameState/root.kv/currentSceneState swapped then restored in finally. Final `browser_refresh`: clean boot, no perchanceErrors/syntaxErrors.
- **Measured numbers.** Wake-chance table (cold 0.92 / neutral 0.65 / warm 0.30 / hostile 0.95; watch 0.75/0.45/0.18/0.85); throuple desireFloor 45; warmRefuseDeltas tension +0.05 / affection +0.02; caughtTensionSpike 0.08; boundary_sleep_with 30min / sleep_watch 10min / throuple 40min; sneak deviancyFloor 0.6 / desireFloor 50 / stealthBase 0.25 / baseCatchChance 0.3 / perceptionGapWeight 0.6 / cooldown 720 / desireRelease −40 / moodGain +0.05 / caughtSuspicion 0.2; caught severity 3 at cold dynamic; in-room wronged cold-shoulder severity 2 (public_infidelity). **0 images generated** (no image-budget spend this phase; the boundary prose is all authored text, per the plan).

**Prior session's notes (Phase 16 — Shaming, cold-shoulder, move-out extension, D2/D14, 2026-08-16):**
- **The cold-shoulder state machine** (npc.js, new SECTION after `applyMoodDelta`): `npc.flags._coldShoulder = { day, severity, reason }` + `repairs` (per-kind day stamps) + `healDay` (both internal to the recovery ratchet). Readers: `coldShoulderState(npc, day)` (PURE, `{active, severity, day, reason, daysSince}`) and `coldShoulderActive(npc)` (cheap check). The ONE writer: `noteColdShoulder(npc, severity, day, reason)` — clamped to [1, COLD_SHOULDER.maxSeverity=3], severity ≤ 0 clears. Config (config.js `COLD_SHOULDER` after REL_CONSEQUENCES): `talkRefuseChance {1:0.25,2:0.60,3:0.95}`, `avoidChance {1:0.10,2:0.35,3:0.70}`, `overtureSuppressedFrom:1`, `suppressedDrives: ['peep_player','snoop_phone','gift_to_player','react_to_player']`, `minDaysBeforeRepair:1`, `giftCooldownDays:2`, `apologyCooldownDays:2`, `timeRecoveryDays:4`, `apologyBlockedAboveSeverity:3`, `repairRelDeltas {tension:-0.05, affection:0.03}`, `moveOutSeverity:3`, `moveOutEarliestDay:2`, `moveOutChancePerDay:0.35`, `causeSeverity {public_infidelity:2}`, `apologyLines` (4 beats). Effects: talk gate + room avoidance (ui.checkRelConsequences — severity-scaled rolls, deliberately FIRST), total overture suppression (`scoreOvertures` returns `{}` — overture.js) and player-directed-drive suppression (`isDriveCandidate` — cognition.js, the SAME read `coldShoulderSuppressesOvertures` so the two gates cannot disagree), and the willingness HARD FLOOR (`'cold_shoulder'` in `willingnessFloorReasons` — willingness.js) — a cold-shouldering NPC cannot be made to participate in anything intimate (invariant 1, fail-closed; verified −1 for BOTH the player initiator AND an NPC initiator, symmetric, D3).
- **The reparation ratchet** (`noteColdShoulderRepair(npc, kind, day)` — npc.js): kind ∈ 'gift'|'apology'|'time'; returns `{repaired, severity, reason}` with reason ∈ 'not_active'|'no_day'|'too_soon'|'won_t_listen'|'cooldown'|null. Gates: minDaysBeforeRepair, apology blocked at severity ≥ 3 (won_t_listen — the coldest hurt needs a gesture first), per-kind cooldowns. Each success ratchets severity −1, resets `healDay` (the time clock restarts), stamps `repairs[kind]`; severity 0 deletes the flag. Players reach it via ui's `doApologizeNpc` (handleAction `case 'apologize'`; the Apologize chip appears in render.js's social chips while cold) and the Give-Item repair branch in `doGiveItem` (any gift-category item while cold, no quest needed — render.js shows the chip).
- **The day-rollover pass** (`advanceColdShoulderForDay(npc, day, rng)` — npc.js, called by ui's `processRelConsequencesForDay` with a seeded rng per (npc, day)): time heals one severity per `timeRecoveryDays` at full cold; a max-severity cold carries a REAL move-out risk — a per-day seeded roll `rng() < moveOutChancePerDay` once `day - onset ≥ moveOutEarliestDay`, counted in `_coldShoulderDays`. `movedOut` is the VERDICT — the caller narrates and runs the actual move-out (`doAskToLeave`). No rng passed → never fires (deterministic). Measured: timeRecoveryDays 4 heals a severity-3 on day 4, so the risk window is days 2–3 (~58% cumulative if the player does nothing), a day-1 gift removes it entirely.
- **The shaming resolver** (npc.js, new SECTION after the cold-shoulder block — Phase 17's boundary perving path calls this too): `resolveShamingTier(gs, npcOBJECT)` — the SAME dynamic read the peek caught-tables use (hostile tension 0.8 / warm comfort 0.6 or familiar/close/intimate phase / near-stranger-cold / neutral); `resolveShamingReaction(gs, npcOBJECT, ctx)` → `{tier, def, prose, coldShoulderSeverity}` (PURE — a READ, applies nothing); `pickShamingProse` seeded per (tier, day, npc) via hashStr+mulberry32 (the PEEK_PROSE pattern). Config (`SHAMING` in config.js): tiers cold/neutral/warm/hostile with relDeltas + npcMood/playerMood/suspicion + `coldShoulderSeverity` (cold 3, neutral 2, warm 0, hostile 3 — a close dynamic turns the same act into comedy and is not even cold-shouldered, D2). The peek 'confront' outcome now resolves through it (`_resolvePeekCaught` — peek.js): applies the tier deltas via the DSL effect path (Signed formatting `v < 0 ? '' : '+'` — this ALSO fixes a pre-existing bug where the old confront line `affection:-0.15` produced `+-0.15` → `Number()` NaN), stamps `noteColdShoulder(..., 'caught_peep')` when `coldShoulderSeverity > 0`, and records `s._shamingTier`/`s._shamingProse`.
- **The infidelity fallout** (relationships.js `applyInfidelityJealousy` — the ONE cold-shoulder cause path): when `otherId === 'player'`, the wronged party now ALSO goes cold-shoulder (`noteColdShoulder(wronged, COLD_SHOULDER.causeSeverity.public_infidelity=2, day, 'public_infidelity')`) on TOP of the jealousy deltas + grievance — never instead of. NPC↔NPC betrayals stay in the castWeb (no player-facing flag). Idempotent (the `_jealousy` key check returns before any re-stamp).
- **Verify coverage:** `src/dev/verify/verify-w16.js` (9 sections, 15 checks; `node dev/verify/run-all.js` picks it up; loadgame.js ORDER unchanged — no new files) — state machine (clamp/clear/daysSince), the repair ratchet + cooldowns + won_t_listen + too_soon + not_active, **section 2 — the MANDATORY gate check** (willingness exactly −1 for BOTH initiators, gate.reason 'floor' + reasons includes 'cold_shoulder', no partner via findIntimatePartner, all suppressedDrives non-candid, zero overtures, positive control opens, the refusal prose, and the source-grep: willingness.js has EXACTLY ONE `coldShoulderActive(` read, inside `willingnessFloorReasons`), the drive/overture gate agreement, shaming tiers/determinism/purity (the resolver is a READ), the peek-confirm source-grep (peek.js has EXACTLY ONE `noteColdShoulder(` inside the confront branch) + the signed-delta format check, infidelity fallout (player-as-other severity/reason/mood+grievance, idempotence, NPC↔NPC no-flag), move-out (severity-2 never / earliest day / roll decides / time rescue / no-rng never fires), and section 8 — save/load round-trip through the REAL `writeGeneratedGameState`/`loadGameState` against an in-memory kv adapter (meta PRE-SEEDED with `{versions: {...FOLDER_VERSIONS}}` so the migration check-and-migrate is a no-op — the empty-mem-kv assert `Migration incomplete for meta: at 0, expected 2` is exactly what a fresh swap hits; G.1 _coldShoulder+_coldShoulderDays survival, G.2 determinism).
- **Live verification (browser_eval, throwaway `SIM_generateHouse` states — the user's real kv/save, seed zy2y81efix, was NEVER written to):** the gate check (both initiators floor −1 with reason cold_shoulder; findIntimatePartner null; suppressed drives; overtures empty with a non-cold control scoring > 0; positive control opens on flag-clear); shaming tiers cold→3 / warm→0 / hostile→3 with deterministic prose; the repair ratchet and per-kind cooldowns; move-out (severity 2 never over 40 days of rng()=0; severity 3 earliest-day high-roll no / next-day low-roll yes; time heal at day+4 keeps the NPC); infidelity fallout (cold-shoulder severity 2 + reason public_infidelity + jealousy + grievance + mood drop; NPC↔NPC wronged party gets no flag); the FULL caught-confront path through the real `_resolvePeekCaught` (a stranger, seed 1, resolves 'confront' → onset severity 3 reason 'caught_peep', `_shamingTier`/`_shamingProse` recorded, tension delta applied); and the save/load round-trip LIVE — `root.kv` swapped to an in-memory adapter pre-seeded with the real kv's meta record, `writeGeneratedGameState`+`forceFlush`+`loadGameState`, cold-shoulder flags survived, real kv restored and its meta JSON byte-identical before/after. Final `browser_refresh`: clean boot, no perchanceErrors/syntaxErrors.
- **Measured numbers.** Cold-shoulder tuning (all in COLD_SHOULDER, calibrated this phase): severity→talkRefuse 0.25/0.60/0.95, severity→avoid 0.10/0.35/0.70; timeRecoveryDays 4 (severity-3 heals on day 4, risk window days 2–3 ≈58% cumulative); moveOutChancePerDay 0.35; causeSeverity.public_infidelity 2 (a move-out-risk only at max severity, i.e. only via a caught-peek at a cold/hostile dynamic). Shaming: cold deltas tension +0.25 / affection −0.2 / trust −0.15, npcMood −0.2, suspicion +0.3, onset 3; neutral tension +0.18, onset 2; warm tension +0.06 / affection +0.05, no onset; hostile tension +0.3 / affection −0.25 / trust −0.2, onset 3. Repair: giftCooldown 2 / apologyCooldown 2 / minDaysBeforeRepair 1; repairRelDeltas −0.05 tension / +0.03 affection. **0 images generated** (no image-budget spend this phase; the caught-confirm path generates no images).

**Prior session's notes (Phase 15 — Knowledge codex + Confront / Spread / Matchmake, D8, 2026-08-16):**
- **The ledger substrate.** The per-character ledger (`player.ledger[npcId]`) was already written by `notePlayerLedgerEntry` (Phase 11's participated acts, Phase 14's infidelity pass). Phase 15 added the WITNESSED half: `notePlayerWitnessedEntry` (codex.js — thin wrapper that stamps `kind:'witnessed'`; opts `{otherNpcId, outcome}`); the peek flow (peek.js) writes one witnessed entry per session at session end (peek mode only, `peeked_masturbation`/`saw_with_X` via `codexActForActivity`); `surfaceRoomEvidence` (ui.js) writes witnessed entries when the player is in-room during an 'intimate' event. `notePlayerLedgerEntry` itself (actions.js) gained `opts = {kind, otherNpcId, outcome}` so both writers share one path. Readers (codex.js): `codexEntries` (newest-first by day), `codexKnownNpcIds`, `codexNextUnspentIndex`, `spendCodexEntry` (flips `spent`, entry STAYS in history, second spend is a no-op — the only consumer of the flag). Vocabulary: `CODEX_PAIRED_ACTS`, `CODEX_MASTURBATION_ACTIVITIES`, `codexActForActivity` (INTIMACY_ACTIVITIES → saw_with_X paired, masturbating(/in bed) → peeked_masturbation), `CODEX_ACT_LABELS` (note: `saw_with_X` label is deliberately just 'together' so the renderer's appended ' with <name>' reads "seen together with TstC"), `codexKindLabel` (witnessed→'seen', told→'told', else 'involved').
- **Confront** ("I saw you with X"): `resolveConfrontTier` — tier = PHASE_ORDER index of relPlayer.conversationPhase, MODULATED by the willingness gate read (`resolveWillingnessGate(..., 'sex', ctx)`): `reason==='floor'` → tier + CONFRONT.tierFloorShift (−1), `allowed` → tier + tierWillingShift (+1, capped 3). It is a READ, never a door — the three verbs leave ZERO intimacy footprint (verified). `resolveConfrontOutcome` maps tier → `key`: ≤0 'shame', ≤2 'tease', else 'engage'. `codexGossipFact` = the CANONICAL `infidelityCheatingFact` when the page NPC's `relationshipSummaryForNpc` names a partner ≠ the act's other (so transmission dedupe + `maybeJealousUponFact` recognize it), else a plain "caught together" romance fact. `injectCodexGossip` feeds the EXISTING transmission: `receiveTransmittedFact` (provenance 'overheard', sourceId 'player') + `maybeJealousUponFact` (wronged hearer gets jealousy IMMEDIATELY). `applyConfrontNpc` applies the outcome's deltas (shame: relPlayer tension +0.12, npcMood −0.1, suspicion.boundary_violation +0.1, and gossip to same-room hearers minus the confronted NPC + act's other, `former` excluded — D10: nobody present, nobody heard), spends the entry, returns `{ok, outcome, tier, otherName, gossipIds, entry}`. `CONFRONT` config (config.js): willingAct 'sex', tierFloorShift −1, tierWillingShift +1, outcomes + `lines` (seededRng-per-(outcome,day,npc) reaction prose) + `playerLines`.
- **Spread** (tell one NPC a secret): `spreadEligible` = unspent AND `otherNpcId` set (your own solo acts are yours to keep). `applySpreadSecret(gameState, npcId, entryIndex, receiverId)` — `receiveTransmittedFact` (kind 'told', provenance 'witnessed'), and a WRONGED-party receiver gets the jealousy to their face via `maybeJealousUponFact` (their copy of the fact carries the `cheating` metadata); uninvolved receivers hold the fact for the ordinary gossip drive to raise ("spreads by next day" is the existing factTransfers path). Receiver already holding the fact → deduped, one copy. Spends the entry.
- **Matchmake** (requires knowledge of BOTH people + an existing relationship record): `matchmakeEligible` (ledger entries for both + `getRelationship(...,false)` exists + both resident + not committed), `matchmakeCandidates` (sorted compat desc). `applyMatchmakeNpc(gameState, a, b)` — refuses `{ok:false, reason:'incompatible'}` when `pairCompatibility < MATCHMAKE.minCompatibilityForMatch` (0.35); else injects `progressBoost` 0.25 (the Phase 12 pass's exact fuel), warms castWeb BOTH ways via `applyNpcToNpcDelta` (`warmDeltas` affection 0.1 / desire 0.12 / comfort 0.05 — self-consistent: pairCompatibility's dynamic term reads the same axes), stamps a 'matched' history entry, `playerRelDeltas` respect +0.04 to both, then immediately re-checks the pair through `tryAdvanceRelationshipStatus` (cooldown-respecting) and returns `{ok, compat, events}`. **The shared single-pair core was EXTRACTED** — `tryAdvanceRelationshipStatus(gameState, a, b, rec, day)` (relationships.js) is now the one implementation both `updateRelationshipsForDay` (daily pass) and the matchmake verb call.
- **The codex app/UI.** defs.computer.js: `codex` app in APP_DEFS (devices computer+phone, renderers 'codex-roster'/'codex-detail'). icons.js: notebook icon. render.computer.js: `renderCodexRoster` (per-NPC rows, entry count + "N ready to use") and `renderCodexDetail` (header name + phase, the three verb buttons, day-stamped entry cards with provenance badge + spent/fresh pill), `codexScreenParams` (reads `world.computer.windows.codex` or the phone navStack). ui.js: `doCodexOpenNpc` / `doConfrontNpc` / `doSpreadSecret` / `doMatchmakeNpc` + `handleAction` cases `codex.open-npc`/`codex.confront`/`codex.spread`/`codex.matchmake` (+ `data-index` parsing in the click dispatcher for spending the right stored index). index.html: script tags with v bumps (config.js v=118, icons.js v=26, defs.computer.js v=29, actions.js v=30, relationships.js v=4, codex.js v=1, peek.js v=2, render.computer.js v=44, ui.js v=88) + the `.codex-*` CSS block. **Deviations from the plan's Files list:** the codex renderers live in `render.computer.js` (not `ui.phone.js`/`render.js`) and the codex entry card is `renderCodexDetail`'s `act.textContent` line (ui.js only hosts the action handlers) — the established computer-app pattern, noted not changed.
- **Verify coverage:** `src/dev/verify/verify-w15.js` (7 sections, 30 checks; `node dev/verify/run-all.js` picks it up; `loadgame.js` ORDER gained `codex.js` after relationships.js) — ledger writers/readers, activity mapping, confront tiers + outcomes + canonical-fact gossip + D10 no-hearer + determinism/no-double-spend, spread (wronged/uninvolved/dedupe), **section 5 — the MANDATORY gate check** (floored target never a participant, the three verbs leave zero intimacy footprint, `willingness()` byte-unchanged by a full verb pass, and the source-grep assertion: codex.js has EXACTLY ONE `resolveWillingnessGate(` call and it sits inside `resolveConfrontTier`), matchmake (eligibility matrix, boost + both-way warmth + matched history + single→seeing, cooldown, authored-mismatch incompatible refusal, daily-pass-through-refactored-core), and section 7 — save/load round-trip through the REAL `writeGeneratedGameState`/`loadGameState` against an in-memory kv adapter (G.1 survival of participated+witnessed+spent + relationships, G.2 determinism).
- **Live verification (browser_eval, throwaway `SIM_generateHouse` states — the user's real kv/save, seed zy2y81efix, was NEVER written to):** all 23 domain checks ported to the live page GREEN; the save/load round-trip (G.1 + G.2) ran LIVE against the real `writeGeneratedGameState`/`loadGameState` with an in-memory kv swap (`forceFlush()` before restoring `root.kv` so load-time queued writes drain into the mem kv, never the real one; real kv confirmed intact after); codex UI rendered live and vision-checked (header "TestA" + phase 'early', the three verb buttons, entry lines "seen together with TestC" / "involved slept together", day/room sub-lines, spent/fresh pills — all legible, no overlap/clip); the static gate check green (gateCalls 1, inTier 1, elsewhere 0, no `willingness(` outside). Final page refresh: clean boot, no perchanceErrors.
- **Measured numbers.** Confront outcome deltas: shame tension +0.12 / npcMood −0.1 / suspicion +0.1; tease tension +0.02 / affection +0.04; engage tension −0.08 / affection +0.1 / desire +0.1 / comfort +0.05. Matchmake: progressBoost 0.25, warmDeltas 0.1/0.12/0.05, playerRelDeltas respect +0.04, minCompatibilityForMatch 0.35. Tier calibration (measured, seed 20260816): fresh NPC = stranger → tier 0 ('shame'); warm `{trust .5, affection .6, comfort .7, tension .1, desire .5}` → phase 'close' (intimacyLevel 60) → tier 2 ('tease'); + `{affection .2, desire .25, comfort .3}` → phase 'intimate' (80), willingness 0.63 ≥ sex threshold 0.6 → tier 3 ('engage'). Hostile (tension 0.9 → 1.0): gate `reason:'floor'`, and because tension SUBTRACTS from the derived phase (intimate 80 → close 57) the tier falls 3 → 1 — a floored target never reads as MORE engaged. **Fresh generated resident pair compat 0.43–0.49 (seed 20260815, 4-res, even with every castWeb axis hostile) — below the 0.5 `minCompatibilityForStart` formation bar, above the 0.35 matchmake bar** → couples only form once the castWeb dynamic term warms through co-location/interaction, and the matchmake 'incompatible' refusal is unreachable for generated casts (see D26). **0 images generated** (no image-budget spend this phase).

**Prior session's notes (Phase 14 — Outside partners, long-distance, infidelity, D14, 2026-08-16):**
- **The outside-partner substrate** (sim.js v=70): `ensureOutsidePartners(gameState)` — idempotent, per-resident seeded rng stream `outside_<npcId>`; a resident who already holds a committed/seeing record (exact-split membership test — a key `npc_10|outside_npc_1` must not read as containing `npc_1`) is SKIPPED (one relationship record is the whole gate, so an in-house couple never gains a second partner). Creates a full external NPC via `createExternalNpc(gameState, 'outside_<npcId>', 'outside_<npcId>', 'Partner')` (contactKnown, `needs.desire = OUTSIDE_PARTNER_TUNING.desireSeed` 55, warm castWeb BOTH directions from `warmAxes`, `getRelationship(...,true).status='committed'`), and records it in `world.outsidePartners[residentId] = { npcId, sinceDay, lastVisitDay }` (persisted via SAVE_KEYS.world + WORLD_KEY_FALLBACKS.outsidePartners; loadGameState reads it; writeGeneratedGameState calls ensureOutsidePartners so a brand-new game ships with couples, and the day-rollover call backfills old saves / later move-ins). `outsidePartnerIdOf` is the direct lookup. Visit planning: `planOutsidePartnerVisitsForDay(gameState, day)` — cooldown `visitCooldownDays` 3, roll `visitChancePerDay` 0.4, evening window `windowStartMinute` 1080 / `windowEndMinute` 1290, duration 150–300, booked into the RESIDENT's own bedroom, soft-cap deferred exactly like friend visits, `sourceId: 'partner_<npcId>_<day>'`. `getActivePartnerVisit` joins the visit spine (mirror of getActiveEscortVisit). `resolveVisitPresence`'s partner branch follows the host into common rooms AND the host's OWN bedroom (the "boyfriend who has a key" line), waits in the booked room when the host is off-screen.
- **THE CO-LOCATION GAP FOUND AND FIXED (D25):** the couple never landed in a private room through the REAL tick loop — wind_down routes to common rooms and 'reading in bed' is a stay-put activity, so the host wandered the common areas all evening and the intimate drive (which requires `isPrivateRoom`) never became candid. Fix: `resolveScheduleActivity` gained a partner-visit bind — a resident who is the HOST of an active partner visit resolves as `{ block: 'leisure', commitmentRoomId: npc.residency.room, commitmentKind: 'partner_visit' }` (the same commitment-room relocation shape D7 uses), exempt for work/commute blocks (a mid-shift host is not pulled home), and a REAL commitment still wins because the commitment check returns before the bind. The partner's presence resolver then co-locates them in the host's bedroom, and the Phase 13 intimate drive fires. Verified through real ticks: act fires on the FIRST tick of the visit, host in bedroom + couple co-located 7/7 ticks.
- **The intimate pair act with a visitor** (drives.js v=37): `findIntimatePartner` generalized — a VISITOR is a partner candidate ONLY when they hold a committed/seeing record with the initiator (the delivery-driver rule: an unrelated visitor is never a partner); residents keep the old rule. `tryIntimatePair` step 9 calls `applyInfidelityFootprint` and returns `wrongedNpcs` (sim.js resolveTick merges them into npcUpdates + calls `maybeJealousUponFact` per factTransfer). **Two bugs fixed while here (pre-existing, w13-baseline-compatible):** (1) restored the missing `const events = [event];` in tryIntimatePair; (2) restored the in-function castWeb pair-delta application (applyNpcToNpcDelta both ways) that the config comment promises — without it the couple's warm axes never moved (w13's affection check would have caught it). NOTE: tryIntimatePair applies pairDeltas in-function AND resolveTick re-applies them via processNpcRelDeltas — a PRE-EXISTING double application, kept for the w13 baseline; harmless (deltas are small and signed), flagged not fixed.
- **The sext drive** (long-distance thread): `DRIVE_DEFS.sext_partner` (isSextDrive, activityOverride 'texting') + `trySextPartner` resolver — queues ONE npc→npc IM (drained by `processNpcImMessages` into `world.computer.apps.im.threads[partnerId]`, the SAME thread the player reads), warms the castWeb pair (`sext.warmDelta`), desire +6, mood +0.03, cooldown 600, 8 authored lines. Candidacy (`DRIVE_CANDIDACY.sext_partner`): partner exists + desire ≥ `sext.desireFloor` (45) + partner NOT currently in the house (go be with them, don't text them). Sexting raises desire (texting makes it worse) — the sender's own desire is the only door (messages are not acts).
- **The infidelity footprint** (relationships.js v=3 — the ONE writer, section header): `infidelityWrongedActs` (names the third party exactly once: for the a-b act it's a's committed/seeing partner and b's, so a player act with one partner wrongs exactly that partner; the couple's own act with an outside partner wrongs the outside partner — the married-resident case), `infidelityCheatingFact` (canonical third-person text "{cheater} slept with {other}", cheating metadata `{cheaterId, otherId, day}`), `infidelityWrongedPerceives` (same room, OR the moan reaches them via perceiveSignals — D10 no-omniscience), `applyInfidelityJealousy` (idempotent per `cheater|other|day` key in `flags._jealousy`; wronged mood drop, wronged→cheater castWeb deltas `wrongedDeltas`, and when the other is 'player': relPlayer deltas `wrongedPlayerDeltas` + a grievance), `applyInfidelityFootprint` (cheater's memory fact + 'cheat' history entry + caught-path jealousy + 'cheating' event), `maybeJealousUponFact` (the gossip-receipt hook: an already-flagged day is a no-op). `receiveTransmittedFact` (npc.js) copies the `cheating` metadata verbatim; the overhearing leg of applyProposal also calls maybeJealousUponFact. The player path: actions.js `resolvePairedAct` calls `applyInfidelityFootprint(live,'player',targetId,...)` after the ledger write + logs the caught narration.
- **The gossip wiring**: TRANSMISSION.socialCategories gained 'cheating'; EVENT_EMOTION.cheating='argument', EVENT_IMPORTANCE.cheating='significant'; VISITOR_DRIVE_ALLOWLIST gained 'intimate' (a visiting partner can initiate). Cheating facts clear `factRaiseScore` (category-gated) and reach the wronged party's `maybeJealousUponFact` on the next chat/transmission — "spreads by next day" is exactly the existing factTransfers path.
- **Verify coverage:** `src/dev/verify/verify-w14.js` (6 sections, 22 checks, `node dev/verify/run-all.js` picks it up) — generation/idempotency/partnerChance gates/skip-if-committed/determinism, visit planning (bedroom booking, soft cap, cooldown), presence, findIntimatePartner visitor rule + stranger-never-chosen, full tryIntimatePair with a visiting partner, evaluateDrives, infidelityWrongedActs/CheatingFact/WrongedPerceives (incl. far-room never + moan-through-signals), applyInfidelityJealousy, the footprint ONE-writer, maybeJealousUponFact, the gossip raise-scorer, **the MANDATORY gate check (floored visitor never chosen, act aborts ZERO footprint, symmetric — section 5)**, source-read no-bypass, and a 48-tick resolveBatch day + gossip end-to-end. Harness functional suite (scratch/harness/w14-loader.js + test-w14-smoke/a/b/c/d/e/f/g + w13-port): 70 checks all green, including **test-w14-f (the co-location bind through REAL ticks: F.1–F.6)** and **test-w14-g (the save/load round-trip through the REAL `writeGeneratedGameState`/`loadGameState` against an in-memory kv adapter — G.1 basic survival, G.2 after the pair act, G.3 infidelity+sext footprint, G.4 determinism, G.5 pre-Phase-14-save backfill)**.
- **Live verification (browser_eval, throwaway in-memory states — the user's real save in kv was NEVER touched):** couple pairs up through the real tick loop (act on the visit's first tick); peek detectability — `composePeekViewLine` renders "Through the brass circle, Gus is having sex, undressed." (gate open via `intimateAllowed`); listen detectability — the moaningHigh signal reads 0.9 in the act room and 0.2 in the adjacent hallway (matches the config design comment; a real resident NPC standing there perceives 0.2/0.09); the sext drive fires through evaluateDrives and the IM drains into the partner's thread (`from:'npc'`); **player-as-other infidelity** via resolvePairedAct lands wronged `flags._jealousy['npc_x|player|1']`, exact `wrongedPlayerDeltas` (trust −0.12, tension +0.15), the grievance "You slept with my partner. I heard about it." (severity 0.5), the cheater's "slept with the player" fact, and the 'cheat' history entry. **Save/load round-trip was done in the HARNESS (test-w14-g) against the real state.js functions** — the live kv carries the user's real save (seed zy2y81efix), so no kv write happened on the page. Final page refresh: clean boot, no errors.
- **Measured numbers.** partnerChance default 0.35 → 2 of 3 residents for seed 20260816 (fresh-house default roll). Sext: fires at desire 100 wind_down (live + harness), desire-floor 45, desire 30 never; IM drains 1:1 into the partner thread. The couple's act fires on the visit's first tick (measured seed 20260824, abs ≈2598–2722 → 19:18–21:22). Moan attenuation confirmed 0.9→0.2 adjacent. Player-other deltas −0.12/+0.15, grievance severity 0.5. **0 images generated** (no image-budget spend this phase).

**Prior session's notes (Phase 13 — NPC masturbation, NPC-initiated intimacy & pair acts, D3/D13, 2026-08-16 — still fully accurate; Phase 14 only generalized `findIntimatePartner` for visitors and fixed the two tryIntimatePair bugs noted above):**
- **The two drives** (`DRIVE_DEFS.masturbate` / `DRIVE_DEFS.intimate` + `NPC_INTIMACY` tuning table, config.js v=116): masturbate is a STANDARD drive (private-room candidacy + desire floor, self effects, 'nude' clothing while it lasts, moaningLow signal, cooldown 720, eventTemplate '{name} closed the door behind them for a while.'). intimate is the pair act: `isIntimateDrive:true`, action-wrapped anchor on the bed via `actionId:'self.nap'` (resolveActionAnchor works — anchor=bed), effects on BOTH participants (desire −100 = −DESIRE.release.sex, energy −INTIMACY.npcEnergyCost.sex, hygiene −INTIMACY.npcHygieneCost.sex, mood +INTIMACY.npcMoodGain.sex), `pairDeltas` castWeb axes BOTH directions, `leaves.bed {made:1}` (invariant 7), emitsSignal moaningHigh, activityOverride 'having sex', clothing 'undressed', cooldown 1080, eventTemplate '{name} and {other} were alone together for a while.' Measured hierarchy: baseAppeal intimate 0.36 > masturbate 0.34 so the pair act outranks solo masturbation in the shared scorer (measured 0.733 vs 0.655 at desire 100 wind_down). PRESENCE_PHRASES never name the act ('masturbating'→'{name} is alone in bed.', 'having sex'→'{name} is in bed with someone.'); EVENT_IMPORTANCE.intimate='significant'; EVENT_EMOTION.intimate='romance', .masturbate='embarrassment'.
- **The resolvers** (drives.js v=36, inserted before the Phase 6 peep block): `findIntimatePartner(npc,npcId,gameState,location,block)` — PURE (no rng, no mutation), co-located residents only, skips self/committed/sleeping/showering, requires `resolveWillingnessGate.allowed` for act 'sex', prefers the committed/seeing relationship partner over warm non-relationship residents. `tryIntimatePair(npc,npcId,resolved,gameState,drive)` RE-CHECKS the gate first (invariant 1, the negative floor aborts before a single state write), applies effects to BOTH npcs via the trusted applyEffects/buildEffectContext path, castWeb deltas both ways via relDeltas, `getRelationship(...true)` + `addRelationshipHistory` (first_sex on first, then sex — verified 1st vs 2nd act), `noteIntimacyOccurred` BOTH ways (Phase 9 recency), applyDriveLeaves unmakes the bed, emitTransient moaningHigh, openCommitment for the PARTNER (the ONE commitment writer), setCooldown(partner,'intimate'), and returns `{activityOverride:'having sex', clothingState:'undressed', pairState:{partnerId,npc,clothing:'undressed',activity:'having sex'}, commitmentChoice, events:[{type:'intimate',data:{other:partnerId}}], relDeltas}`. `buildPairCommitmentChoice` produces the action-kind commitment for step 5. evaluateDrives gained the `else if (drive.isIntimateDrive)` branch and a `pairState`/`commitmentChoice` in its result; step 5 now opens `commitmentChoice || {...}`.
- **Candidacy** (cognition.js v=25): `DRIVE_CANDIDACY.masturbate` = isPrivateRoom && desire≥30; `DRIVE_CANDIDACY.intimate` = isPrivateRoom && desire≥40 && findIntimatePartner(...) non-null — co-location is part of the door (a willing partner in a different room is NOT a candidate).
- **Clothing rules** (npc.js v=44): `INTIMACY_ACTIVITIES = ['having sex','making love','sex','quickie']`; npcClothingForContext returns 'nude' for masturbating/'masturbating in bed' and 'undressed' for INTIMACY_ACTIVITIES. NPC 'undressed' PERSISTS after pair acts — matches Phase 11 player-partner semantics (no NPC re-dress rule added; the intimate gate's naked read stays intact).
- **sim.js v=68**: pairState merge block right after the clothingState merge in pass 3 — carries the partner's clothing/activity/needs/mood/flags/commitment/pos/walk/relPlayer/memory/suspicion/inventory/overture + transit:null. Order-independent (works whether the partner was evaluated earlier or later in the tick).
- **Verify harness** `src/dev/verify/verify-w13.js` (10 sections, 25 checks; `node dev/verify/run-all.js` picks it up; loadgame.js ORDER unchanged — no new files). Covers: NPC_INTIMACY tuning, candidacy doors (incl. co-location), findIntimatePartner purity/preference/stranger/sleeping/showering/committed-skip, the full tryIntimatePair footprint (effects both ways, castWeb both ways, first_sex vs sex, unmade bed, moaningHigh, partner commitment+cooldown, stampEventParticipants), the MANDATORY gate check (true-stranger willingness exactly −1 and zero-footprint abort; cold generated pair reads below_threshold 0.503 — NOT −1, because generateCast pre-seeds initial axes so a freshly generated pair is NOT a stranger; both refusal shapes abort with zero footprint), evaluateDrives end-to-end + no-double-catch + cooldown drops candidacy, masturbate standard path, clothing rules, reachability (desire-30 masturbate clears the bar: 0.442 > 0.40 at wind_down; intimate 0.733 outranks masturbate 0.655), and the 48-tick resolveBatch regression (day 2, minutes=CLOCK.startMinutes — advanceClock is TICKS×30min) + byte-determinism + effect-line parse check.
- **Live verification (browser_eval, throwaway states — the user's real save was never the sim under test):** full footprint, gate aborts (stranger −1 floor AND below_threshold 0.503 soft-no, both zero-footprint), candidacy matrix, drive hierarchy, reachability, 48-tick regression clean + deterministic, and the mandatory save/load round-trip PASSED (throwaway warm committed couple + completed pair act via evaluateDrives + resolveBatch → saveAtBoundary → loadGameState: _intimacyHistory, _driveCooldowns.intimate, world.relationships committed + first_sex + lastIntimateDay, castWeb warm axes, clothing 'undressed' all survived).
- **User's real save**: seed zy2y81efix, day 5, 13 NPCs, 0 residents. A mid-session round-trip mistake overwrote it WITHOUT meta.versions (FOLDER_VERSIONS={meta:2,player:6,world:4,npcs:7,images:1,snapshots:1,objects:2}) and broke boot; it was restored from a kv snapshot (all 73 keys: meta/player/world/npcs/objects), confirmed booting cleanly after the final refresh (loadGameState → seed zy2y81efix, 13 npcs, meta.versions intact, player.inventory present). Backup copy: https://user.uploads.dev/file/7aeea324aafad3d75c3b359e93ca3889.json (expires in 1 day; delete when done). scratch/save-snapshot.json also holds it.
- **Measured numbers.** NPC_INTIMACY thresholds: masturbate 30 / intimate 40; act 'sex' reads WILLINGNESS.thresholds.sex. baseAppeal intimate 0.36 / masturbate 0.34; blockAppeal {masturbate: leisure 1.1, evening 1.15, wind_down 1.3; intimate: leisure 1.1, evening 1.2, wind_down 1.4}. Scores at desire 100 wind_down: intimate 0.733, masturbate 0.655; desire-30 masturbate 0.442. Cold-generated-pair willingness 0.503 (below_threshold); true stranger exactly −1 (floor). 0 images generated.

**Blockers / flagged deviations (Phase 18):** None blocking. (1) **THE SAVE INCIDENT — the user's real kv meta was corrupted mid-session and repaired** (see the Phase-18 session note above): live round-trip evals raced the 30s autosave timer while `root.kv`/`currentGameState` were swapped, and a fired autosave wrote a partial meta (no versions/seed) into the real meta folder → boot's `migrateFolder('meta', 0→2)` assert. Repaired (reconstructed from the `pre-migrate-meta-1-to-2-*` snapshot, seed zy2y81efix restored, `scene` backfilled, versions = current FOLDER_VERSIONS), boot clean, Continue loads the save, sim runs. **Future rule: `stopAutosave()` + `stopClockLoop()` before ANY live eval that swaps `root.kv` or `currentGameState`, and `forceFlush()` into the mem kv before restoring.** (2) The save has had **0 residents since ~mid-July** (known since Phase 13's note: "13 NPCs, 0 residents"); this session recovered the last-known cast (Anna/Vex/Victor) from the Jul-13 npcs 6→7 pre-migrate snapshot and injected it into the auto-slot records + live folder so Continue loads it — reversible via `pre-w18-slotpatch-1786914558427-*` if the user prefers the old state (their save is otherwise day-5-era, empty castWeb/relationships/events/ledger). (3) Throuples deliberately never conceive — `maybeConceive` has exactly three callsites (tryIntimatePair / resolvePairedAct / applyReciprocatedAct) and `qualifyingActs` is `['sex']`; a throuple act is not a qualifying single-pair act, which is a design choice (D29), not a gap. (4) verify-w18.js is written for `node dev/verify/run-all.js` but was NOT executable this session (no shell tool — same as Phase 16 blocker 6 / Phase 17 blocker 5); every check was run LIVE via browser_eval instead and is green. (5) `upload_file` failed with `network_failure` three times — the full-save backup lives only in `scratch/save-backup-w18.json` (session-ephemeral) + kv.snapshots (`pre-w18-repair-*`, `pre-w18-slotpatch-*`); retry hosting it next session if a permanent URL is wanted. (6) Prior-session blockers carry: kv.meta lineage drift from the Phase 11 restore, old restore uploads (Phase 7/6 URLs; the Phase 13 backup expires 2026-08-17), and the Phase 15 regex-fragile source-greps (reword comments, never loosen regexes). (7) **CRLF tooling note:** most src/ files are CRLF or mixed (config/ui/state/sim/render/llm/npc/image/actions/drives/scene) — edit them with execute_js string replacement preserving the dominant EOL, never the plain edit tool (a mid-session edit-tool attempt broke a line that then needed two repair passes).

**Blockers / flagged deviations (Phase 17):** None blocking. (1) The sleeping-room ACT requires the target to be ASLEEP (the `_vulnerableState === 'sleeping'` flag from drives.js) AND the initiator to be IN the room — so an awake target, an absent target, or a locked door simply never shows the verb; that is the intended fail-closed gate, not a gap. (2) The cold-shoulder floor closes even the ATTEMPT (resolveBoundaryGate returns cold_shoulder before the wake roll) — carry-over of Phase 16 blocker 1's initiator-agnostic floor, now deliberate for the boundary layer: a cold NPC is not approached at all (D28). (3) `warmRefuseDeltas` applies via the DSL relPlayer effect path, which requires the full relPlayer axes on the TARGET — a test-constructed minimal NPC without `trust`/`affection`/`comfort`/`tension`/`desire` axes throws on the partial-axis effect application; real `SIM_generateHouse` NPCs always carry them, so this is a test-construction gotcha only (flagged for verify-w17.js writers). (4) Phase 16 blocker 1's scope question ("if a later phase needs per-relationship cold") is now explicitly answered by D28 — no per-relationship scope was added; the boundary layer reads the same global flag the willingness floor reads. (5) verify-w17.js is written for `node dev/verify/run-all.js` but was NOT executable in this session (no shell tool — same as Phase 16 blocker 6); every check it asserts was run LIVE via browser_eval instead and is green. (6) Prior-session blockers carry: kv.meta lineage drift from the Phase 11 restore, old restore uploads (Phase 7/6 URLs; the Phase 13 backup expires 2026-08-17), and the Phase 15 regex-fragile source-greps (reword comments, never loosen regexes).

**Blockers / flagged deviations (Phase 16):** None blocking. (1) The cold-shoulder floor is an INITIATOR-AGNOSTIC/global floor — a cold-shouldering NPC is floored even toward an NPC initiator they personally like (the castWeb warm positive control still floors). That is the design's reading of D13 (the flag is the hurt, the NPC will not be intimate at all while it lasts), but it means a mid-relationship partner who is cold toward the PLAYER also refuses an NPC partner's overture; if Phase 17's boundary layer needs per-relationship cold, the flag would need an optional initiator scope — flagged, not changed. (2) The plan's Files list said the cold-shoulder/shaming logic would land in `npc.js`/`drives.js`; it landed entirely in `npc.js` (the state machine + shaming sections) plus the gate reads in `willingness.js`/`overture.js`/`cognition.js` and the cause writer in `relationships.js` — no new file was needed. (3) The move-out risk is a probabilistic per-day SEEDED roll (0.35) rather than the plan's deterministic counter sketch — the counter (`_coldShoulderDays`) is informational; the decision is the roll. (4) The `+-` sign-format bug fix in peek's confront effect lines is a behavior change to Phase 10's confront outcome (its tension delta now actually lands instead of producing NaN) — verified compatible with the w10 baseline's other outcomes. (5) Prior-session blockers carry: kv.meta lineage drift from the Phase 11 restore, old restore uploads (Phase 7/6 URLs; the Phase 13 backup expires 2026-08-17), and the Phase 15 regex-fragile source-greps (reword comments, never loosen regexes). (6) verify-w16.js is written for `node dev/verify/run-all.js` but was NOT executable in this session (no shell tool; the worker can't replicate the vm's per-script const scoping) — every check it asserts was run LIVE via browser_eval instead and is green.

**Blockers / flagged deviations (Phase 15):** None blocking. (1) verify-w15.js's source-grep assertion (exactly one `resolveWillingnessGate(` in codex.js, inside `resolveConfrontTier`) is regex-fragile against future comment wording — reword comments, never loosen the regex (same rule as w13/w14). (2) The 'incompatible' matchmake refusal is UNREACHABLE for generated resident casts (measured compat floor ~0.43 vs minCompatibilityForMatch 0.35 — D26); the verify check therefore manufactures the mismatch by overriding the pair's bible (interests/values/temperament) before the assertion, and it's the honest test of the refusal branch. (3) The live-page save/load round-trip was run against an in-memory kv adapter swapped into `root.kv` (with `forceFlush()` before restore), NOT against the real kv — the user's save (seed zy2y81efix) is live there and was never written to. (4) The codex renderers live in `render.computer.js` + `ui.js`, not the plan's `ui.phone.js`/`render.js` (see the Phase 15 notes) — consistent with the computer-app pattern. (5) Prior-session blockers carry: kv.meta lineage drift from the Phase 11 restore, old restore uploads (Phase 7/6 URLs; the Phase 13 backup expires 2026-08-17).

**Blockers / flagged deviations (Phase 13 — carried):** None blocking. (1) The plan's initiate-act partner selection is implemented as CO-LOCATED ONLY (both NPCs must be in the same private room at tick time) — matches the plan's reading and the commitment's roomId anchor; a same-house partner elsewhere in the apartment does not trigger an intimate drive until co-located. (2) NPC 'undressed' persists after pair acts (no NPC re-dress rule) — deliberate parity with Phase 11's player-partner behavior; revisit only if the peek imagery budget complains. (3) The overture half of Phase 13 (NPC-initiated approaches) was already delivered by Phases 8/9 via OVERTURE_DEFS desire-motive entries (approach_player/text_player/knock_player) — no new overture code was needed. (4) Prior-session blockers carry: kv.meta lineage drift from the Phase 11 restore, and old restore uploads (Phase 7/6 URLs; the Phase 13 backup expires 2026-08-17). (5) verify-w13.js's source-grep checks are regex-fragile against future comment wording in drives.js/cognition.js — reword comments, never loosen the regexes.

**Blockers / flagged deviations (Phase 14):** None blocking. (1) The visit/act still needs the HOST to be home at visit time — a resident whose shift runs into the window (18:00–21:30) is exempted from the bedroom bind and the partner waits in their room (resolveVisitPresence's "key" line); the couple still pairs up once the host is home. (2) The outside-partner NPC's bible.name is only populated via the char-creation partials path — a partner generated on a house that skipped name partials falls back to 'Someone' in infidelityCheatingFact (and the present-card "name" reads), as does every name-less NPC; same pre-existing fallback as formatEventText. (3) verify-w14.js's source-grep checks are regex-fragile the same way w13's are — reword comments, never loosen the regexes. (4) The live-page save/load round-trip was deliberately NOT run against the real kv (the user's save, seed zy2y81efix, is live there) — the real writeGeneratedGameState/loadGameState pair was round-trip-tested in the harness (test-w14-g) instead; if a future session wants a live kv round-trip, back up kv first.


## The thesis

The apartment is a social petri dish, and intimacy is where its drama
concentrates — but today every spicy surface is a text site in a computer
window (AfterHours), a relationship number nobody can read, or a peep system
with nothing to catch. The overhaul makes the house itself the stage:
clothing you can see and change, doors you can peek through and listen at,
desire that builds and spends, NPCs who couple, cheat, and get caught, and a
player with real verbs, real risk, and a per-character ledger that turns
what they have witnessed into a resource. "Anything the player can do, NPCs
can do" extends to the bedroom; the cognition/gossip/signals machinery
becomes the engine that makes intimacy *consequential*.

### What this plan is *not*
- **Not a shame simulator.** D2. No moral scoring of the player anywhere;
  consequences are NPC reactions (personality × relationship × context), and
  a close/intimate dynamic reacting playfully to the same act a stranger
  finds mortifying is the design, not an inconsistency.
- **Not a gallery.** Every surface is simulation-backed; generated images are
  *rewards for acts* (a peek that resolves, a scene that earns it), never
  content you browse.
- **Not a coercion game.** D13. There is no force verb, no unwilling-subject
  path, and the willingness function is the only door into an intimacy act.
  Boundary acts (sleeping-room scenes, voyeurism, exhibitionism) are *risk
  systems* — gated, chance-of-consequence, symmetric — not entitlements.
- **Not a new settings layer.** D14. Everything ships on behind the existing
  `mature` content flag; there is no second "NSFW toggle."
- **Not a rewrite of the NPC cognition layer.** The drives, overtures,
  gossip, commitments, and signals stay the substrate; this plan adds terms,
  drives, verbs, and surfaces on top.

---

## Locked decisions

The D-numbers are the design conversation's Q&A, one-to-one, plus D15/D16.

### Vision
- **D1 — No explicitness ceiling.** Imagery may be as graphic as the player
  wants: full frontal, graphic sex, fluids. Nothing generated exceeds what
  AfterHours already streams to the same player. The image pipeline gains an
  explicit tier; the peek/scene pipelines render explicit content when the
  state calls for it. Content flags remain the only gate (`mature` on by
  default).
- **D2 — Tone is emergent, never authored, never a shame simulator.** The
  system states facts about relationship/dynamic/context; NPCs react per
  personality. Low-relationship, uncalled-for perving draws shaming reactions
  (unless the NPC is into it); close dynamics make the same acts playful,
  comedic, or escalatory. Sex is fun, messy, comedic, romantic — the game is
  a social experiment with multiple complex relationships, not a morality
  system. Any rule that reads like a judgment on the player is misdrawn.

### Symmetry & consent
- **D3 — Symmetric initiation.** Player and NPCs initiate intimacy through
  the same gates at every level: flirt → advance → invite → act. The
  player's "Make a Move" resolves through the identical gate an NPC overture
  does (the initiative gate, `INITIATIVE_GATE`/`npcInitiativeGate`). No
  player-only bypass, no NPC-only bypass.
- **D13 — No force, ever; boundary acts are high-risk dynamics.** There is
  no coercion or rape mechanic — no verb, drive, or effect makes an unwilling
  subject participate (hard invariant, enforced in Phases 9/11/13).
  Boundary-pushing acts ARE supported as risk systems: sneaking into a
  sleeping character's room to look at or interact with them, voyeurism,
  exhibitionism. They are gated by relationship/dynamic + opportunity +
  personality, carry devastating consequences when caught at a low dynamic
  (possible cold-shoulder or move-out), and are symmetric — some NPCs attempt
  them back. Consent is a *willingness function*, not a binary, and it is
  always revocable (a mid-act mood collapse or caught attempt aborts).

### Discovery & exposure
- **D4 — Discovery is sensory and diegetic.** No tutorial. Availability is
  telegraphed by in-fiction cues the scene reader and floor plan derive from
  real room/object state: light through the keyhole, a door ajar, sounds
  behind the door. Cues must be *varied and non-repetitive* — a rote repeated
  "you notice light through the keyhole" line is itself a bug.
- **D5 — The expandable action submenu is a general pattern.** Any object
  with multiple simultaneous verbs renders as "X ▸" expanding a one-level
  popover (door: Keyhole (Peek) / Listen / Open / Knock; bed: Sleep / Nap /
  Make Bed; stereo: Volume / Play / Eject). One level of nesting, never two.
  Replaces flat chips for multi-verb objects everywhere, including future
  objects.
- **D6 — The peek flow.** Text line ("You crouch to the keyhole…") →
  keyhole-lens image (CSS/SVG mask + vignette; the keyhole is NEVER baked
  into the generated image) with a loading shimmer → a written outcome line.
  Empty/dark rooms return text only, no image spent. A caught peek ends with
  the caught outcome instead of the image.
- **D7 — Peeking is a timed, real-time hold.** Game minutes tick while the
  player watches; the scene can change mid-peek; catch-risk ramps with
  duration (modulated by occupant perception, door state, and the player's
  `stealthSuccess` skill — the curve planted but never read). "Caught" is a
  per-NPC personality outcome, never uniform: some stop, some ignore, some
  escalate or engage once they know they are watched. The player can stop at
  any time; being caught can override the choice.
- **D8 — The knowledge ledger is a per-character codex.** A per-NPC history
  of events the player witnessed or participated in — provenance, day, kind,
  outcome. It is the surface the Confront / Spread / Matchmake / leverage
  verbs read and spend. Lives in a codex UI (phone app or sidebar tab).
- **D9 — Desire is a first-class need.** Player desire is a real need with
  its own footer bar beside energy/hunger/hygiene/mood. NPCs carry `desire`
  too (D12). Sources: exposure to signals, seeing nudity/sex, flirtation,
  proximity to a desired partner. Release: intimacy and masturbation.
- **D10 — The floor plan is honest, never omniscient.** Rooms the player is
  not in are dimmed under a fog-of-war overlay; NPC avatars remain visible
  everywhere (positional awareness — you know someone's in the kitchen, like
  hearing a toddler stomp around downstairs) but granular activity labels
  appear only when plausibly known. Locked rooms are marked at a glance, yet
  the avatar inside still shows. The map never reveals what it couldn't know.

### Mechanics
- **D11 — Full wardrobe system.** Itemized clothing (slots: top, bottom,
  outerwear, shoes, socks, underwear, swimwear, accessories, plus outfit
  types: daily, work, sleepwear, loungewear, workout, swim, formal). Every
  item carries stats, traits, category, and type; outfits are mix-and-match
  (down to the socks for the player). Wardrobe capacity is per-storage tier
  and upgradeable. NPC selection is driven — schedule × personality — never
  random. Clothing is a system with economy (Nile catalog, storage objects),
  not a prompt label.
- **D12 — Desire & attraction are real, emergent numbers.** Per-NPC `desire`
  biases drive/overture scoring (a bias term, not a hard gate). NPC↔NPC
  pairs emerge from castWeb compatibility + schedule proximity + personality;
  no scripted couples.

### Scope & guardrails
- **D14 — All relationship configurations and all consequences are in.**
  Matchmaking, throuples, cheating, bull/cuck dynamics, and pregnancy are
  possible (pregnancy scoped in D16). Infidelity is a choice with
  consequences (jealousy, gossip, breakups). NPCs may move out for EXTREME
  circumstances (extends `REL_CONSEQUENCES.tensionMoveOutDay` triggers), and
  may go "cold shoulder" — a state that makes reparation extremely difficult
  but not impossible. Everything ships on by default behind the existing
  `mature` flag; no new gating menu.
- **D15 — Deterministic authority over boundary content; LLM-only narration
  within the authorized frame.** A boundary act (any intimacy act, any
  boundary act) is always *decided* by deterministic data — gates, the
  willingness function, drive scoring, content flags. No LLM call decides
  whether one happens. Every image/LLM prompt that can carry explicit content
  goes through the SAME fail-closed path as `getPhysicalDescriptionForPrompt`
  (intimate opt-in + `activeContentFlags` + state truth), mirroring
  `buildEscortBoundaryText` (prompt.js). Explicit strings are never
  hardcoded into prompts that bypass the gate.
- **D16 — Pregnancy scope.** A minimal-but-real model: conception from
  certain sex acts (both parties' willingness required; a "trying" flag on
  the couple/player or an unprotected-act chance — decided in Phase 18),
  a compressed term (game days), a birth event, and a baby presence that
  affects schedules, mood, and conversation. Player-pregnancy and NPC-pregnancy
  parity. No parenthood content beyond the baby's presence in v1 — flagged
  expandable.
- **D17 — Door-cue light semantics (Phase 3 resolution).** The plan's
  `lightThroughKeyhole = occupant present && (daylit || activity implies
  light)` is implemented as: during daylit clock phases an occupied room
  reads as lit (daylight floods it); at night a room reads as lit only if
  an occupant is AWAKE. Nothing models lamps, so "the activity implies
  light" is "being awake implies a lit room"; the single honest exception
  is the asleep states — a sleeping occupant's door stays dark. Audible
  door cues are perception-gated (the same perceiveSignals query the whole
  game reads), so a low-attention player genuinely misses sounds through
  closed doors while light still shows. Phase 10 (peek) must read these
  same cues.
- **D18 — Clothing data lives in ITEM_DEFS; the wardrobe shape reuses the
  container machinery (Phase 4 resolution).** The plan's Phase-4 file list
  put "Nile rows for clothing" in defs.computer.js, but the shipped catalog
  derives from ITEM_DEFS (`SHOP_CATALOG_LIST`, ITEMS) — so clothing is an
  ITEM_DEFS section in defs.world.js carrying the CLOTHING fields
  (`slot`/`category` = style family/`stats`/`traits`/`styleTags`), and
  `CLOTHING_DEFS` is a derived view over slot-carrying entries (one table,
  never a parallel catalog). The plan's `WARDROBE = { tier, capacity,
  items: [itemId] }` shape is implemented on the EXISTING container model:
  a wardrobe instance keeps `.contents` (uniform stacks) + `flags.tier`
  (a number, default 1 — numbers live in flags because state values must
  stay string enums); `capacity = capacityByTier[tier]` counts ITEMS (sum
  of stack quantities; every clothing item is non-stackable qty 1).
  `category` = style family per the plan's example, with `sortGroup:
  'clothing'` stamped per def so inventory sort doesn't fall back to
  'other'. Non-clothing items may still be stored in a wardrobe and count
  against capacity (no UI restriction in Phase 4; Phase 5 may decide).
  The wardrobe TIER upgrade path is deferred to a later phase — Phase 4
  declares and enforces tier 1 only.
- **D19 — The clothing state machine and the change_outfit naming (Phase 5
  resolution).** `npc.clothing` is a state machine over `CLOTHING_STATES`
  (dressed / changing / nude / towel / sleepwear / undressed);
  `TRANSIENT_CLOTHING` = {sleepwear, towel, changing} is reverted to
  'dressed' by the SAME per-span path for both actor kinds (NPC resolveTick
  pass 2; player decayPlayerNeeds). 'nude' is a NAKED-IN-SCENE state (Phase
  5's shower sets it via `withVulnerableState`'s `opts.clothing:'nude'`,
  leaving `opts.after:'towel'`), and the intimate gate now reads
  `NAKED_CLOTHING_STATES = ['undressed','nude']` instead of a bare
  `=== 'undressed'` — the only widening the gate ever took, in the
  fail-closed direction (invariant 4); the other two conditions
  (opts.intimate + activeContentFlags().mature) are untouched, and
  'towel'/'changing'/'dressed'/'sleepwear' never open it. **Action naming:**
  the Change Outfit verb is `wardrobe.change_outfit` under a
  `wardrobe.interact` submenu parent (not the plan's `self.change_outfit`)
  so the one chip can carry BOTH `wardrobe.change_outfit` and
  `wardrobe.open` — mirroring `door.interact`; the objId rides on the parent
  chip's context (Phase 1 pattern). **Phase 4's open wardrobe question**
  (may non-clothing items be stored?) resolves: YES, no UI restriction —
  everything in `.contents` counts against capacity equally.
- **D20 — NPC outfit is derived every tick, never drive-set; the
  change_clothes drive is the visible beat; swim is a new facility-gated
  drive (Phase 6 resolution).** The plan's Phase-6 file list said the
  change_clothes drive "sets `'changing'` transiently then the target
  outfit". In practice a drive-set outfit can never disagree with what an
  NPC is doing (a derived outfit always can), and a driftable second writer
  violates the spirit of invariant 3 — so resolveTick pass 2 derives
  `npc.outfit` + `npc.clothing` every tick from pure functions
  (outfitTypeForContext → composeOutfit over the bedroom wardrobe;
  npcClothingForContext for the state machine), and `change_clothes` is
  purely the caught-changing drama beat (`setsClothing:'changing'`, one
  tick, TRANSIENT revert). Its candidacy is TRANSITION-aware: because
  pass-2 updates merge only at batch end, `npc.outfit` read at pass 3 is
  the previous tick's derivation, so comparing it to the current block's
  target detects waking-into-work still in yesterday's clothes; it never
  fires mid-activity (`ctx.activity`, added to scoreCandidates' ctx). The
  fastidious/slovenly split is the drive's temperamentWeights
  (conscientiousness). The plan's "`nude_swim` variant of the swim drive"
  premise found no swim drive in the codebase (swimming was leisure-roll
  only), so a `swim` DRIVE_DEFS was created (wraps `self.swim` for the pool
  anchor, meters devices/waterHeating, decays pool_systems via
  MAINTENANCE.npcDecayActions) and the naked swim is ONE pass-2 activity-
  nudity gate (`npcClothingForContext`: shower ungated, pool gated on the
  derived `npcDeviancy` = openness×assertiveness, decided once per swim
  session) shared by driven and leisure swimming — never a second drive
  that could bypass it. STARTER_WARDROBES became per-bedroom signature
  sets (work/athletic/beach) instead of identical kits so the outfit AI
  has real material day one.
- **D21 — Willingness numbers calibrated (Phase 9 resolution).** The
  plan's proposed willingness term weights were the "Willingness numbers"
  open question; Phase 9 shipped them as `WILLINGNESS` (config.js) with the
  live calibration: term weights base -0.3 / attraction 0.5 / desire 0.4 /
  mood 0.2 / phase 0.35 / personality 0.2 / context 0.25 / history 0.1;
  thresholds default 0.45, quickie 0.5, sex 0.6, share_shower 0.45, cuddle
  0.35, masturbate 0 (solo — floor is its only door); abortFloor 0 (below =
  cannot fire); HARD FLOORS asleep / hostile (tension ≥ tensionHigh, no
  disinhibition override at the intimacy door) / actively refusing / stranger.
  A warm-default intimate-phase NPC lands ~1.0 (clamped) and clears `sex`;
  a neutral acquaintance sits ~0.30, below every paired act's bar. Bias
  term `utility.willingness: { weight: 0.15, act: 'default' }` on the three
  desire-motive overtures (bias, not gate; the floor drops a floored
  candidate outright — invariant 1).
- **D22 — Peek image budget (Phase 10 resolution).** `freshPerSession: 2`
  and `freshPerDay: 6` per player (kv `player.flags._peekBudget`). The kv
  image cache (key = `composePeekKey`) is the PRIMARY gate: if a cached
  frame matches the current view, it is re-shown for free (so a repeated
  peek at the same scene costs 0 fresh generations); only a genuinely new
  view spends the budget. Exhausted budget degrades, never blocks: the last
  cached frame re-shown, else the pure-text "shadows move across the
  keyhole…" line. `peekImageBudgetAllows/Spend` (peek.js) are the only
  spenders; the plan's older "cap + degradation rule" open question is
  hereby closed.
- **D23 — Peek imagery is deterministic-only (Phase 10 resolution).** There
  is no post-hoc LLM content assessor for peek images: the image pipeline
  (`getPeekImage`/`composePeekPrompt`, image.js) is prompt-bounded and
  gate-aware, and its `intimateAllowed` read runs through the same
  `getPhysicalDescriptionForPrompt` surface as every other explicit path
  (D15). The non-peek scene-image pipeline may revisit the assessor idea
  later; it is not part of Phase 10.
- **D24 — The outside-partner relationship record is the whole gate; a
  visiting partner is only ever an intimacy partner when the record exists
  (Phase 14 resolution).** A resident who already holds a committed/seeing
  record (an in-house couple forming, or another partner) never gains an
  outside partner — one relationship record decides it, so the delivery
  driver or the hot single is never "someone's boyfriend". Symmetrically,
  `findIntimatePartner`'s generalization for visitors is record-gated: a
  VISITOR is a partner candidate ONLY when they hold a committed/seeing
  record with the initiator (the delivery-driver rule) — an unrelated
  visitor, however warm, is never a Phase 13 pair-act partner. The
  `world.outsidePartners` index (residentId → { npcId, sinceDay,
  lastVisitDay }) is a cheap lookup, never the source of truth.
- **D25 — A partner visit binds the HOST to their own bedroom (Phase 14
  resolution).** The plan's "they disappear to her room" cannot come true
  through the ordinary schedule: wind_down routes to common rooms and
  'reading in bed' is a stay-put activity, so the host alone never reaches a
  private room and the intimate drive (which requires `isPrivateRoom`) never
  becomes candid. During an active partner visit the host resident therefore
  resolves via `resolveScheduleActivity` as a commitment-style bind
  (`{ block: 'leisure', commitmentRoomId: npc.residency.room,
  commitmentKind: 'partner_visit' }`) — the same invitation-binds shape D7
  uses — exempt for work/commute blocks (a mid-shift host is not pulled
  home) and always beaten by a real commitment (the commitment check runs
  first). `resolveVisitPresence`'s partner branch already makes the PARTNER
  follow the host into the host's own bedroom, so binding the host is what
  actually co-locates the couple; the visit then stays one committed unit
  until it ends.
- **D26 — The matchmake 'incompatible' refusal is defensive-only for
  generated casts (Phase 15 measurement).** Fresh generated resident pairs
  measure 0.43–0.49 `pairCompatibility` even with every castWeb axis hostile
  (the static floor — base 0.2 + shared-interest + values + personality —
  keeps them there; seed 20260815, 4-res). So `MATCHMAKE.minCompatibilityForMatch`
  (0.35) sits BELOW every generated pair, and the `{ok:false,
  reason:'incompatible'}` branch is only reachable for constructed/outside
  pairs. This is deliberate, not a bug: the real formation door is
  `RELATIONSHIP.minCompatibilityForStart` (0.5), which a matchmake can
  nudge a pair across (the castWeb dynamic term warms as couples interact)
  but cannot manufacture from nothing — so the refusal branch stays, and
  the phase's verify check exercises it via an authored bible mismatch.
- **D27 — The warm wake re-gates; the asleep floor is never relaxed (Phase 17).** When the sleeping-room wake roll finds the target AWAKE, the act is RE-RUN through the same `resolveWillingnessGate` with a shallow activity-proxy context (`resolveBoundaryAwakeGate`, actKind 'boundary-awake' — the same `intimateAllowed`-style read, so a warm willing target may reciprocate but an unwilling one cannot be pushed). The asleep floor itself is RECORDED (willingness −1, reason 'floor', reasons ['asleep']) and never relaxed: a completed boundary act only ever happens with an awake, willing partner. The willingness function is byte-unchanged (invariant 1) — the boundary layer adds helper callsites, not edits.
- **D28 — The sleeping-room gate is an ATTEMPT, not an entitlement (Phase 17).** Cold-shoulder closes even the attempt (resolveBoundaryGate returns reason 'cold_shoulder' BEFORE the wake roll — fail-closed, and the same global flag the willingness floor reads, so the boundary layer deliberately did NOT add per-relationship cold scope). The warm dynamic never shames: a warm-caught-warm refusal is `warm_refuse` (playful, `warmRefuseDeltas` tension +0.05 / affection +0.02, no cold-shoulder) vs the cold/hostile shaming path (`resolveShamingReaction` → severity-3 cold-shoulder). The three-way infidelity footprint loops EVERY participant's records (a married NPC threesome wrongs their outside partner; player-among-others routes each NPC participant's committed partner through the player as `otherId:'player'` → `public_infidelity` cold-shoulder) — symmetric with the Phase 14 paired footprint.
- **D29 — Pregnancy specifics (Phase 18 resolution).** Both D16 options ship: the explicit "trying" flag (player `flags._tryingWith`, NPC couple `relationship.trying`, the player reaching it via per-NPC "Try for a Baby" chips, NPCs reaching it EMERGENTLY at the day pass) AND the unprotected base chance on every completed qualifying act. Qualifying acts are exactly `PREGNANCY.qualifyingActs` (`['sex']` — full sex only; quickie/cuddle/share_shower/throuple never conceive). One shared `world.pregnancies` record shape for player and NPC pregnancies. Conception is deterministic per (seed, pair, day, absolute minute) — data decides, the LLM/image pipeline only narrates (D15). A completed act is the ONLY door (the act's own willingness gate is upstream; this phase adds no new gate). The baby presence (post-birth) is a `_baby` flag on both parents + daily mood/energy cost + an offscreen "stayed in with the baby" event + pinned memory facts — no v1 parenting sim.

---

## Data model

Shapes are defined here once; phases say which part they build. Tuning
numbers are proposed defaults — calibrate by measurement in the phase that
first reads them.

### Submenu actions (Phase 1)
```js
// ACTION_DEFS entry gains:
submenu: ['door.keyhole', 'door.listen', 'door.open', 'door.knock']
// The parent chip renders "Bathroom A Door ▸"; expanding shows the verbs in
// declaration order. Submenu verbs are normal ACTION_DEFS entries (own
// requires/effects/narration) that inherit the parent's object/room context.
// Exactly one level of nesting.
```

### Fog-of-war floor plan (Phase 2)
```js
// renderFloorPlan/ renderFloorPlanLive gains a plausibility pass.
// - Rooms other than the player's current room get a dim overlay
//   (.fp-room[data-fog]) — still clickable for movement.
// - Locked rooms render the existing .fp-locked barrier AND a lock glyph;
//   the occupant's avatar still renders inside.
// - Activity labels on avatars render only when plausible:
//     same room            → full activity
//     other room           → coarser label from derivePlausibleActivity
//     locked room, other   → 'inside' (or nothing), never the granular act
// derivePlausibleActivity(gs, npcId, playerRoomId) is pure; it returns what
// the player could realistically know (signal-strength + familiarity gated).
```

### Door sensory cues (Phase 3)
```js
// Pure derivation per door object, fed from SIGNALS' perceiveSignals + room
// occupancy + object state:
deriveDoorCues(gs, doorObj, playerRoomId)
// → { lightThroughKeyhole: bool,   // occupant present && (daylit || activity implies light)
//     ajar: bool,                  // door object state, or threshold type
//     audible: [signalIds],        // strongest signals audible through the door
//     occupantIds: [...] }         // who is plausibly in there
// Scene reader renders one composed, varied line per cue; the floor plan
// renders a small glow glyph on doors with lightThroughKeyhole. Cue text
// pools are keyed by the cue kind — never one repeated string (D4).
```

### Clothing & wardrobe (Phases 4–7)
```js
CLOTHING_DEFS = {
  basic_tee: { id, label, slot: 'top', category: 'casual',
    stats: { attraction: 0, comfort: 0.05, modesty: 0.3, thermal: 0.2 },
    traits: ['everyday'], price: 12, buyQty: 1, styleTags: [...] },
}
// slot ∈ top|bottom|outerwear|shoes|socks|underwear|swimwear|accessory
// stats ∈ attraction|comfort|modesty|thermal|reveal — each a bias term a
// consumer (attraction check, desire, willingness, scene prompt) reads.
// traits ∈ everyday|sexy|work|sport|sleep|formal|revealing|comfortable|...

OUTFIT = { slotId: itemId }          // one item per slot; missing slot = n/a
WARDROBE = { tier: 1|2|3, capacity: 12|24|40, items: [itemId] }  // storage object

// npc.clothing stays the STATE machine; outfit is what is worn:
CLOTHING_STATES = ['dressed', 'changing', 'nude', 'towel', 'sleepwear', 'undressed']
//    dressed   — wearing current outfit (the default)
//    changing  — mid-change; a vulnerable state; transient (one tick span)
//    nude      — fully naked and present (shower/pool/sex) — prompt-gated
//    towel     — post-shower (existing TRANSIENT_CLOTHING revert path)
//    sleepwear — in bed (existing TRANSIENT_CLOTHING revert path)
//    undressed — MUST keep its existing meaning: it is the value that opens
//                getPhysicalDescriptionForPrompt's intimate branch (npc.js).
//                Phases 5–6 must map the machine onto it compatibly — the
//                gate checks `clothing === 'undressed'`; naked-in-scene states
//                (nude) must either BE 'undressed' at the gate or the gate is
//                taught the new set in the same phase (fail-closed only).
```

### Desire (Phase 8)
```js
DESIRE = {
  player: { start: 20, max: 100, decayPerMinute: 0.05,
            warnBelow: 15 /* not shown until nonzero relevant */ },
  npc:    { start: 10, max: 100, decayPerMinute: 0.04 },
  sources: [ // exposure → Δdesire (player and NPCs, strongest wins per tick)
    { signal: 'running_water',      amount: 1.5 },  // showering in earshot
    { signal: 'moaning',            amount: 4 },
    { signal: 'nudity_present',     amount: 2 },    // see a nude NPC (Phase 6 emits)
    { kind: 'flirted',              amount: 6 },    // flirtation target
    { kind: 'peeked_at_sex',        amount: 8 },
  ],
  release: { masturbate: -40, sex: -100, quickie: -60 },
}
// Player: a real need (footer bar). NPC: npc.desire, fed to scoreCandidates
// as utility.desire (a bias term like utility.need, never a hard gate —
// D12). Crossing a threshold unlocks intimacy overtures / Make a Move
// candidacy without forcing them.
```

### Willingness (Phase 9)
```js
// The ONLY door into an intimacy act (D13). Pure function:
willingness(gs, npc, initiatorId, act, ctx)
// → number in [-1, 1].  >= threshold(act) → willing; below → act refuses.
// Terms (all pure reads, all tunable):
//   base            -0.3
//   attraction      castWeb/relPlayer attraction toward initiator  (×0.5)
//   desire          npc.desire/100                                   (×0.4)
//   mood            npc.mood                                         (×0.2)
//   phase           conversationPhase(early..intimate)               (×0.35)
//   personality     openness, temperament tweaks, deviancy trait      (×0.2)
//   context         private room + locked door, or risky-common      (×0.25)
//   history         lastIntimateDay recency, prior refusals          (×-0.1)
// HARD FLOORS (return -1, abort any act):
//   target is asleep/hostile/tension-high/actively refusing
//   target is an NPC with zero prior interaction (stranger floor)
// Floor exceptions exist ONLY for Phase 17 boundary acts (sleeping-room
// acts), which route through a separate narrow gate with its own devastating-
// consequence binding — never through a relaxed willingness.
```

### Peek / Listen (Phase 10)
```js
PEEK_SESSION = { doorId, roomId, occupantIds, ticksElapsed, riskAccum, active }
// Timed hold: advances the clock in PEEK.tickMinutes (1) per real second
// while held; each tick re-derives the door cue + occupant activity, so the
// scene can change mid-peek (D7).
riskPerTick(session, gs) =
  PEEK.baseRisk + PEEK.riskPerTick * ticksElapsed
    - stealthSkill(player) * PEEK.stealthBonus       // the stealthSuccess curve
    - doorLocked * PEEK.lockBonus
    + occupantPerception(occupant) * PEEK.perceptionWeight
// Caught resolution is per-NPC (D7):
PEEK_OUTCOMES = {
  // keyed by personality gates (deviancy, openness, dynamic, mood)
  stop:    { closes door, mood/tension delta },
  ignore:  { continues, small tension },
  escalate:{ continues deliberately, may switch act, desire gain for both },
  engage:  { acknowledges the watcher — door opens, may invite in },
  confront:{ shaming / anger / cold-shoulder risk — D16 phase },
}
// Listen = the same session with shorter default hold, audio-only lines
// (signal → prose), and the SAME risk model. Headphones (Phase 19) suppress
// received audio signals and therefore nothing is audible to listen to.
```

### Intimacy acts (Phase 11)
```js
INTIMACY_ACT_DEFS = {
  masturbate:   { participants: 'solo',  durationMinutes: 15,
    requires: ['private_room'], vulnerableState: 'masturbating',
    setsClothing: 'nude', emitsSignal: { moaning, low },
    effects: ['ADJUST_NEED player desire -40', 'ADJUST_NEED player mood +X'] },
  quickie:      { participants: 'paired', durationMinutes: 10,
    requires: ['willingness>=q', 'private_room'], caughtChanceBoost: 2,
    setsClothing: 'undressed', emitsSignal: { moaning, med }, leaves: {bed unmade},
    effects: [desire release, mood, energy cost, hygiene -] },
  share_shower: { participants: 'paired', vulnerableState: 'showering',
    requires: ['facilityFunctionalHere:self.shower', 'willingness>=t'],
    emitsSignal: { running_water, high }, effects: [hygiene, mood, affection] },
  sex:          { participants: 'paired', durationMinutes: 40,
    requires: ['willingness>=s', 'private_room', 'privacy'],
    setsClothing: 'undressed', emitsSignal: { moaning, high }, leaves: {bed unmade},
    meters: [...], effects: [desire -100, mood, affection/trust, energy -, hygiene -] },
  cuddle:       { participants: 'paired', durationMinutes: 25,
    requires: ['after_sex_or_close'], effects: [mood, affection, trust] },
  make_a_move:  { participants: 'proposal', requires: ['initiative_gate'] },
}
// Each act is an ACTION_DEFS-style entry resolved through executeAction /
// the shared-activity machinery, with effects via the same DSL (ADJUST_NEED,
// SET_OBJECT_STATE leaves, meters). Paired acts also write BOTH parties'
// castWeb/relPlayer deltas and — if witnessed/learned — a ledger entry.
```

### Relationships (Phase 12)
```js
world.relationships[pairKey] = {
  status: 'single' | 'seeing' | 'committed',
  public: bool,                 // who knows — gossip-derived, not authored
  history: [{ kind, day, other? }],   // first_kiss, first_sex, fight, cheat...
  lastIntimateDay: null|day,
  trying: bool,                 // pregnancy flag (D16) — read by Phase 18
}
pairCompatibility(a, b) = f(castWeb axes, bible.interests ∩, values ∩,
                            personality distance)   // pure; the pair-formation
                                                    // temperature (D12)
// Couple residency: two residents on one upgraded bedroom (residentCapacity
// 2, existing) with the rent sharedRoomShareMultiplier — no new housing
// system, just the assignment.
```

### NPC intimacy (Phase 13)
```js
// New DRIVE_DEFS entries, all routed through scoreCandidates (desire bias):
masturbate   — needs private room + desire > t; sets 'masturbating' +
               'nude'; emits low moaning; peepable; cooldown long.
intimate     — desire > t AND a willing partner in the house (willingness
               of the partner toward the initiator) AND a private room.
               Opens a kind:'action' commitment anchored on a bed; during it
               BOTH NPCs set 'undressed', the room emits moaning (adjacent
               rooms hear it), and the bed leaves unmade. On completion both
               castWeb pair axes update + a world.relationships history entry.
// OVERTURE_DEFS gains desire-motivated variants (approach/text) that resolve
// through the SAME initiative gate — D3.
```

### Outside partners & infidelity (Phase 14)
```js
// Reuse the visit spine (external-world plan): an outside partner is an
// external NPC (own bible/appearance/schedule) with:
//   relationship: { toNpcId, status },  // castWeb with the resident partner
//   visits:        periodic (generalized from escort visits)
//   im:            a persistent thread (sexting rides the existing IM)
// On arrival they and their partner may trigger the Phase 13 intimate drive
// (they "disappear to her room"). Infidelity = any intimacy act that
// contradicts a relationship record; the GOSSIP system carries the news
// (fact provenance 'witnessed'/'told'/'overheard' already exists).
```

### Knowledge ledger (Phase 15)
```js
player.ledger[npcId] = [{
  kind: 'witnessed' | 'participated' | 'told',
  act: 'peeked_masturbation' | 'saw_with_X' | 'shared_shower' | ...,
  day, roomId,
  otherNpcId: null|id,
  spent: false,                 // spent → verb consumption; stays in history
  outcome: null|'caught'|'escalated'|...
}]
// Codex UI: per-NPC page listing entries (day-stamped), the surface for
// Confront ("I saw you with X"), Spread (gossip injection — feeds the
// existing transmission), Matchmake (requires knowledge + relationships).
```

### Consequences (Phase 16)
```js
npc.flags._coldShoulder = { day, severity: 1|2|3 }
// Effects while active: talk/approach/overture suppression by severity;
// refusal of all intimacy (willingness forced -1); recovery requires the
// player to pass specific reparation acts (gift + apology + time), ratcheting
// severity down one per successful act. Tension-based move-out (existing
// tensionMoveOutDay) gains additional triggers: caught boundary acts at
// low dynamic, public infidelity fallout.
// Shaming: a reaction template set keyed by dynamic tier (stranger→cold,
// close→teasing), fired by NPCs who witness/are told about uncalled-for
// perving — mood/tension deltas, never a system judgment (D2).
```

### Boundary acts (Phase 17)
```js
// A narrow, separate registry — NOT a relaxed willingness:
BOUNDARY_ACT_DEFS = {
  sleep_with_npc: { targetState: 'sleeping', catchRisk: high,
    // relationship-gated: attempted value scales with dynamic; at low
    // dynamic a wake-up is near-certain and consequences are devastating
    // (D16: cold-shoulder / move-out) — at high dynamic the target may
    // accept, reciprocate, or never fully wake (D13: some NPCs are into it) }
  sleep_watch_npc: { targetState: 'sleeping', catchRisk: med } // look, don't touch
  throuple_invite: { requires: two willing partners + desire }
  cuck_dynamic:    { a consenting three-way configuration — requires all
                     three parties' willingness }
}
// Every entry resolves against the SAME willingness function PLUS its own
// narrow context gate; nothing here bypasses D13. NPCs may initiate
// equivalents (symmetry).
```

### Pregnancy (Phase 18)
```js
world.pregnancies = [{ parents: [ids], conceivedDay, dueDay, visibleFromDay }]
// Conception: on qualifying acts when relationship.trying === true OR an
// unprotected act (per-act chance, CONCEPTION odds) AND both parents willing
// (D15 — deterministic, no LLM). Term ~14 game days (compressed, tunable).
// visibleFromDay: belly + scene-prompt line + conversation fuel.
// Birth: a day event, the baby becomes a presence (schedules/mood/conversation
// note; no v1 parenting sim). Player pregnancy shares the shape.
```

### Music devices & headphones (Phase 19)
```js
SOUND_DEVICE_DEFS = {
  stereo:        { placed, emitsSignal: { music, byVolume }, volume: 0..3,
                   affords: [set_volume, play, eject_record] },
  boombox:       { placed/carryable, same shape, portable },
  record_player: { existing hobby object gains volume + emits music },
  mp3_player:    { carried item, flags: { blocksSound: true },
                   suppresses received AUDIO signals while worn (player and
                   NPCs); mood +, awareness −: no listening, no cues, no
                   gossip-overheard }
}
// Music signals feed NPC mood/stimulation + occasional "keep it down" beats
// at high volume; headphones make a wearer deaf to the drama (D7 interplay:
// you can't hear the moaning you're not listening for).
```

---

## Implementation phases

### Arc 0 — The UI substrate

#### Phase 1 — Expandable submenu actions
**Goal:** any multi-verb object renders as one "X ▸" chip that expands a
one-level popover of its verbs. The pattern is general (D5) — door/bed/stereo
alike — and replaces flat chips for every object with more than two verbs.
**Files:**
- `src/srcfiles/render.js`: `renderActionChips` teaches the submenu shape;
  chips with `def.submenu` render the parent + a popover; submenu verbs are
  normal action rows. Context (object/room) passes through to the sub-verbs.
- `src/srcfiles/ui.js`: `handleAction` accepts the submenu verbs unchanged
  (they are ACTION_DEFS entries); add the popover open/close + blur handling.
- `src/srcfiles/defs.actions.js`: seed 2–3 demo `submenu` groups (bedroom
  door, bathroom door) with `door.keyhole`/`door.listen` as stubs that
  return "Not yet available" so Phase 3/10 slots in later.
**Verification:** on the live page, open a door's chip → exactly one level of
popover, verbs clickable, blur closes it; flat chips for single-verb actions
unchanged; mobile chip row still fits (no horizontal blowout).

#### Phase 2 — Fog-of-war floor plan + door-state rendering
**Goal:** the plan shows what the player could plausibly know (D10): current
room lit, others dimmed, avatars visible everywhere, granular activity gated,
locked rooms marked with occupants still shown.
**Files:**
- `src/srcfiles/render.js`: `renderFloorPlan`/`renderFloorPlanLive` —
  fog overlay for non-current rooms (still clickable for movement),
  lock glyph on locked rooms, activity-label plausibility via
  `derivePlausibleActivity` (new, pure).
- `src/srcfiles/world.js` or `signals.js`: `derivePlausibleActivity` — the
  pure rule (same room → full; other room → coarse; locked → 'inside').
- `index.html`: `.fp-room[data-fog]`, `.fp-lock-glyph` styles.
**Verification:** move room to room; non-current rooms dim; locked bathroom
shows lock + occupant avatar; activity labels degrade exactly per the rule;
navigation still works on dimmed rooms; save/load round-trip unchanged.

#### Phase 3 — Sensory door cues
**Goal:** doors whisper (D4): light through the keyhole, ajar state, audible
sounds — derived from real state, varied in prose, shown in the scene reader
and as plan glyphs.
**Files:**
- `src/srcfiles/scene.js`: `composeScene` gains a door-cue block when the
  player is adjacent to a door with a cue; text pools per cue kind, keyed,
  never one string.
- `src/srcfiles/signals.js`: `deriveDoorCues` (pure) — reads
  `perceiveSignals` + room occupancy + door object state.
- `src/srcfiles/render.js` + `index.html`: floor-plan glow glyph for
  `lightThroughKeyhole` doors.
**Verification:** with an NPC showering behind a closed bathroom door, the
scene reader shows light + running water; with the house empty at night, no
cues; no repeated identical cue line across ten consecutive adjacent-tick
renders.

### Arc A — Wardrobe

#### Phase 4 — Clothing model, defs, wardrobe storage, catalog
**Goal:** clothing is data (D11): `CLOTHING_DEFS`, outfit schema, wardrobe
storage objects with tiered capacity, and Nile catalog entries so it can be
bought.
**Files:**
- `src/srcfiles/defs.world.js`: `CLOTHING_DEFS` (a solid starter set across
  all slots/outfit types), wardrobe OBJECT_DEFS entry (extends the existing
  `wardrobe` container with `capacityByTier`), starter outfits in
  `APARTMENT_LAYOUT`/storage.
- `src/srcfiles/defs.computer.js`: Nile rows for clothing (priced, so
  `SHOP_CATALOG_LIST` picks them up automatically).
- `src/srcfiles/items.js`-adjacent helpers: outfit/wardrobe stack helpers
  (add/remove item from wardrobe, compose outfit).
**Verification:** buy a tee on Nile → delivers to the doormat → moves into
the wardrobe; wardrobe capacity enforced at tier 1; save/load round-trip
preserves wardrobe contents.

#### Phase 5 — Player wardrobe UI + Change Outfit + clothing state machine
**Goal:** the player dresses down to the socks (D11): a wardrobe/outfit UI
(mix-and-match slots), a Change Outfit action, and `npc.clothing` promoted to
the state machine — with `undressed` semantics preserved for the intimate
gate.
**Files:**
- `src/srcfiles/render.js` + `index.html`: the wardrobe panel (slot grid,
  owned items, tier/capacity, current outfit), opened from the wardrobe
  object; reuses the picker/panel patterns (`openRecipePicker` family).
- `src/srcfiles/defs.actions.js`: `self.change_outfit` (submenu on the
  wardrobe object, Phase 1 pattern).
- `src/srcfiles/npc.js` + `llm.js`: `clothingLabel`/`getPhysicalDescriptionForPrompt`
  taught the new states — **fail-closed**: a naked-in-scene state must either
  BE `'undressed'` at the gate or the gate learns the new set in this same
  phase, never silently.
- `src/srcfiles/sim.js`: player outfit persisted on the player; transient
  state transitions (shower→towel→outfit) ride the existing
  `TRANSIENT_CLOTHING` revert path.
**Verification:** change into a swimsuit at the wardrobe and the scene line /
floor plan reflect it; showering sets the nude/undressed state and the
intimate gate opens exactly when the content flags + opt-in allow — and stays
closed with any one condition missing (three-part gate, D7 of the intro plan).

#### Phase 6 — NPC wardrobe AI + change_clothes drive + nudity gating
**Goal:** NPCs change with rhyme and reason (D11): a `change_clothes` drive
keyed to schedule blocks and personality, nudity gating that opens the naked
swim / naked shower behaviors, and caught-caught-changing as a keyhole moment.
**Files:**
- `src/srcfiles/config.js`: the `change_clothes` DRIVE_DEFS entry (timeOfDay
  morning/evening/wind_down, `utility` biased by conscientiousness; sets
  `'changing'` transiently then the target outfit); `nude_swim` variant of
  the swim drive gated on a deviancy/exhibitionism read (openness ×
  assertiveness, hidden trait `deviancy`).
- `src/srcfiles/npc.js`: outfit selection (pure): schedule block + personality
  → outfit type → item pick; clothing state transition rules.
- `src/srcfiles/sim.js`: resolveTick applies the clothing-state transitions
  (changing → outfit, towel → outfit, nude during swim/shower/sex).
**Verification:** over two simulated days an NPC wears work clothes in the
work block, sleepwear in bed, workout clothes in the gym, swimwear at the
pool; a high-deviancy NPC sometimes swims nude (peekable); the `'undressed'`
gate stays correct for all transitions.

#### Phase 7 — Clothing stats & traits effects
**Goal:** clothes matter (D11): stats bias attraction checks, desire sources,
willingness terms, and scene-prompt flavor; revealing/comfortable/exhibition
traits modulate NPC reactions to the wearer.
**Files:**
- `src/srcfiles/config.js` (or a new `tuning` block): how each stat enters an
  existing formula (attraction term, desire source, willingness term) — pure
  data wiring, one reader per stat.
- `src/srcfiles/scene.js` + `llm.js`: outfit-aware prose (wearing the nice
  top reads differently than the stained tee).
**Verification:** two identically-personalitied NPCs differ in attraction/
desire response to the player in a revealing outfit vs. loungewear; no
outfit value breaks an existing save (default outfit supplied).

### Arc B — Desire & voyeurism

#### Phase 8 — Desire system
**Goal:** desire is real (D9/D12): a player need with a footer bar, an NPC
stat with sources/decay, and a bias term in drive/overture scoring.
**Files:**
- `src/srcfiles/config.js`: `DESIRE` tuning; `npc.desire` on the schema.
- `src/srcfiles/sim.js` (`decayPlayerNeeds` + the heartbeat path): player
  desire decay; desire sources applied when signals/flirtation/peeks occur.
- `src/srcfiles/cognition.js`/`drives.js`: `scoreCandidates` reads
  `utility.desire` as a bias term (never a hard gate — D12).
- `index.html` + `src/srcfiles/render.js`: the desire footer bar.
**Verification:** watching the showering roommate's room raises desire; it
decays over a game day; a high-desire NPC's intimacy candidates outscore
their leisure ones; desire never gates a non-intimacy action.

#### Phase 9 — Willingness & consent math
**Goal:** the single door into intimacy (D13): a pure `willingness()`
function every act and drive reads, with hard floors that abort, and the
boundary-act exception explicitly routed elsewhere.
**Files:**
- New `src/srcfiles/willingness.js` (or in `npc.js`): the function + tuning
  table from the Data model; `assertWillingnessIntegrity`-style checks for
  the verify harness.
- `src/srcfiles/effects.js`/`actions.js` consumers: the first call sites
  (Phase 11 acts) wired to it.
**Verification:** a tension-high/sleeping/stranger NPC always returns −1 and
no act fires; a warm intimate NPC crosses the threshold; the function is pure
(same inputs, same output — determinism harness).

#### Phase 10 — Peek & Listen
**Goal:** the door is a window (D6/D7): timed real-time peeks with the
keyhole-lens image pipeline, a ramping risk curve, and per-NPC caught
outcomes.
**Files:**
- New `src/srcfiles/peek.js`: the `PEEK_SESSION` loop (advances the clock in
  `PEEK.tickMinutes`, re-derives door cues each tick), `riskPerTick`, caught
  resolution into `PEEK_OUTCOMES`.
- `src/srcfiles/image.js`: `composePeekPrompt` + key composition — the
  occupant's current activity + clothing state (Phases 5/6) + lighting; the
  keyhole overlay is pure CSS/SVG (D6).
- `index.html` + `src/srcfiles/render.js`: the keyhole lens (mask + vignette
  + shimmer) and the peek UI (peek/listen/stop).
- `src/srcfiles/ui.js`: hooking the door submenu verbs (`door.keyhole`,
  `door.listen`) to the sessions.
**Verification:** peeking at a masturbating NPC shows a generated image behind
the lens with the right clothing state; risk rises with hold time and the
player's stealth skill (the `stealthSuccess` curve now has a reader); caught
resolves per-NPC personality (a close+deviancy NPC escalates, a stranger
confronts); empty rooms return text only; the peek respects the image budget
(D7 cap) and the closed-form fast-forward rules.

#### Phase 11 — Player intimacy verbs + Make a Move
**Goal:** the player has verbs (D3/D13): masturbate, quickie, share shower,
sex, cuddle — plus Make a Move resolving through the initiative gate.
**Files:**
- `src/srcfiles/defs.actions.js`: `INTIMACY_ACT_DEFS` entries as ACTION_DEFS
  rows (the Data model shapes), including paired acts resolved via the
  shared-activity machinery (`resolveSharedActivity`).
- `src/srcfiles/actions.js`: paired-act execution (both parties' effects,
  deltas, willingness pre-check via Phase 9).
- `src/srcfiles/ui.js`: Make a Move (initiative-gate mirror of the NPC
  overture), the act flow (choice of act, partner selection when more than
  one present).
**Verification:** a full paired act against a willing NPC applies both
parties' needs/deltas, sets `undressed`, emits moaning audible to adjacent
rooms, unmakes the bed, and lands a ledger entry; against an unwilling NPC it
refuses with prose and no effects; Make a Move mirrors the NPC gate
(D3 — same threshold, same refusal).

### Arc C — Couples & NPC intimacy

#### Phase 12 — Relationship records & couple formation
**Goal:** the house has couples (D12/D14): `world.relationships`, emergent
formation from castWeb + proximity + personality, and two residents sharing
an upgraded bedroom.
**Files:**
- `src/srcfiles/sim.js` (or new `src/srcfiles/relationships.js`): the
  relationships store + `pairCompatibility`; formation checks on a slow
  cadence (proximity co-occurrence + compatibility temperature).
- `src/srcfiles/config.js`: `RELATIONSHIP` tuning (thresholds, progression
  cooldowns).
- `src/srcfiles/computer.js`/`roomlist`-adjacent: an NPC in a committed
  relationship may move into a partner's room (existing residentCapacity 2 +
  sharedRoomShareMultiplier — no new housing system).
**Verification:** over simulated weeks two compatible, co-located NPCs drift
from single → seeing → committed; their relationship survives save/load;
couples report status on their cards.

#### Phase 13 — NPC intimacy: masturbation, overtures, pair acts
**Goal:** NPCs do it too (D3/D13): the masturbate drive, the intimate pair
drive, and desire-motivated overtures — all through the same gates as the
player.
**Files:**
- `src/srcfiles/config.js`: the `masturbate` and `intimate` DRIVE_DEFS
  entries (desire-bias utility, private-room + partner-willingness candidacy,
  long cooldowns, `leaves`/`emitsSignal`/`setsClothing`).
- `src/srcfiles/overture.js`/`cognition.js`: desire-motivated overture
  variants; both drives route through `scoreCandidates` and the Phase 9
  willingness check.
- `src/srcfiles/drives.js`: the pair-act resolution (both NPCs' states,
  castWeb deltas, relationship history).
**Verification:** a high-desire NPC in a private room masturbates (peekable,
caught-able); a committed couple disappears into their room, emits moaning
their neighbors can hear, and returns with matched castWeb deltas; both
drives respect their cooldowns and never fire past a negative willingness.

#### Phase 14 — Outside partners, long-distance, infidelity
**Goal:** the boyfriend who comes over and disappears to her room (D14):
outside partners on the visit spine, persistent IM, and infidelity with real
consequences.
**Files:**
- `src/srcfiles/computer.js`: generalize the escort visit plumbing into
  outside-partner visits (arrival → partner rendezvous → departure),
  seeded from `world.relationships`.
- `src/srcfiles/ui.phone.js`/`computer.js`: the long-distance thread
  (sexting/video over the existing IM/phone camera).
- Gossip wiring: an intimacy act that contradicts a relationship record
  emits a `cheating`-flavored fact through the existing transmission system.
**Verification:** a committed NPC's partner visits, they pair up, and their
act is detectable by peek/listen; the partner's IM thread works; a player
caught cheating with the partner produces jealousy deltas in the wronged NPC
and the fact spreads by next day.

### Arc D — Consequences

#### Phase 15 — Knowledge codex + Confront / Spread / Matchmake
**Goal:** knowing is having (D8): the per-character ledger UI and the verbs
that spend it.
**Files:**
- `src/srcfiles/ui.phone.js`/`render.js`: the codex (per-NPC pages, day-
  stamped ledger entries).
- `src/srcfiles/ui.js`: `doConfrontNpc` (uses ledger + willingness +
  relationship state — outcomes per dynamic: shame/tease/engage), `doSpreadSecret`
  (injects a fact into the transmission system), `doMatchmakeNpc` (requires
  knowledge + relationships, triggers the Phase 12 formation path).
**Verification:** a witnessed act appears in the codex with provenance;
confronting a stranger about a witnessed cheating act produces a tension
spike + gossip; matching two compatible NPCs accelerates their formation;
spent entries flip `spent` and stay in history.

#### Phase 16 — Consequences: shaming, cold-shoulder, move-out
**Goal:** actions have weight (D2/D14): per-dynamic shaming reactions, the
cold-shoulder state, and extended move-out triggers.
**Files:**
- `src/srcfiles/config.js`: `COLD_SHOULDER` tuning; shaming reaction pools
  keyed by dynamic tier; extra move-out triggers (boundary acts at low
  dynamic, public infidelity fallout).
- `src/srcfiles/npc.js`/`drives.js`: the cold-shoulder flag's effects on
  talk/overture/willingness; reparation acts (gift/apology/time) ratcheting
  severity down.
**Verification:** a stranger caught peeping shames the player (mood/tension
deltas, no system judgment); a caught boundary act at low dynamic triggers
cold-shoulder and a real chance of move-out; a close dynamic reacts playfully
to the same act (D2); reparation works and recovery is slow but possible.

### Arc E — Boundary acts & pregnancy

#### Phase 17 — Boundary acts: sleeping-room acts, throuple/multiple, bull/cuck
**Goal:** the boundary-pushing layer as risk systems (D13/D14): sleeping-room
acts, throuples, and consenting three-way dynamics — gated, symmetric,
consequential.
**Files:**
- New `src/srcfiles/boundary.js`: `BOUNDARY_ACT_DEFS` + the narrow context
  gate (relationship-gated attempted value, wake-up/catch risk curve) — never
  a relaxed willingness.
- `src/srcfiles/defs.actions.js`: player-facing verbs (sleeping-room verbs
  appear on a bed submenu only when the occupant is asleep); NPC equivalents.
- `src/srcfiles/config.js`: three-way dynamic gating (all parties' willingness).
**Verification:** sneaking into a stranger's room while they sleep almost
always wakes them with devastating relationship fallout; the same act at a
close dynamic may be accepted/reciprocated; a throuple act requires all three
willing and refuses otherwise; no path bypasses the willingness function
(D13 harness).

#### Phase 18 — Pregnancy
**Goal:** it can happen (D14/D16): conception, a compressed term, a birth
event, and a baby presence — with full NPC/player parity and "trying" as a
couple-level choice.
**Files:**
- `src/srcfiles/sim.js`: `world.pregnancies` lifecycle (conceive → term →
  birth) on the day-rollover pass; conception checks on qualifying acts when
  `trying` or unprotected.
- `src/srcfiles/npc.js`/`llm.js`: visible-from-day belly in scene prose; the
  birth day event; the baby presence affecting schedules/mood.
- `src/srcfiles/ui.js`: the player-pregnancy path mirrors the NPC one.
**Verification:** a "trying" committed couple conceives within expected
windows; term compresses to game days and the birth event fires once; the
baby presence shows in schedules/mood and persists across save/load.

### Arc F — Sound

#### Phase 19 — Music devices & headphones
**Goal:** the apartment has a soundscape and the player can opt out of it
(D7-interplay): stereo/boombox/record player with volume + music signals, and
the mp3-player+headphones that block received audio.
**Files:**
- `src/srcfiles/defs.world.js` + `defs.computer.js`: `SOUND_DEVICE_DEFS`
  objects + Nile rows.
- `src/srcfiles/signals.js`: the `music` signal by volume; headphones as a
  received-signal filter (player and NPCs).
- `src/srcfiles/defs.actions.js`: set_volume/play/eject verbs (Phase 1
  submenu), a `listen` suppression when wearing headphones.
**Verification:** a stereo at volume 2 lifts mood in adjacent rooms and
sparks the occasional "keep it down" beat; wearing headphones makes the door-
cue/listen system report nothing audible while the music/other signals still
exist for the world.

---

## Status — **ALL 19 PHASES COMPLETE** (archived to `src/ref/complete/`)

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** | Expandable submenu action pattern (D5) |
| 2 | **Done** | Fog-of-war floor plan, locked-door marks, plausibility-gated activity (D10) |
| 3 | **Done** | Sensory door cues — light-through-keyhole, ajar, sounds (D4) |
| 4 | **Done** | Clothing defs, wardrobe storage, Nile catalog (D11) |
| 5 | **Done** | Player wardrobe UI, Change Outfit, clothing state machine (D11) |
| 6 | **Done** | NPC wardrobe AI, change_clothes drive, nudity gating (D11) |
| 7 | **Done** | Clothing stats & traits wired into attraction/desire/prose (D11) |
| 8 | **Done** | Desire system — player need, NPC stat, scoring bias (D9/D12) |
| 9 | **Done** | Willingness & consent math — the only door into intimacy (D13) |
| 10 | **Done** | Peek & Listen — timed hold, keyhole images, risk, per-NPC outcomes (D6/D7) |
| 11 | **Done** | Player intimacy verbs + Make a Move (D3/D13) |
| 12 | **Done** | Relationship records, couple formation, shared bedroom (D12/D14) |
| 13 | **Done** | NPC masturbation + NPC-initiated intimacy + pair acts (D3/D13) |
| 14 | **Done** | Outside partners, long-distance, infidelity dynamics (D14) |
| 15 | **Done** | Knowledge codex + Confront / Spread / Matchmake (D8) |
| 16 | **Done** | Shaming, cold-shoulder, move-out extension (D2/D14) |
| 17 | **Done** | Boundary acts — sleeping-room, throuple, bull/cuck (D13/D14) |
| 18 | **Done** | Pregnancy (D14/D16) |
| 19 | **Done** | Music devices & headphones sound-blocking |

## Dependency order

```
Ph 1 (submenu) ─► every phase's verbs surface through it
Ph 2 (fog of war) ─► Ph 3 (door cues render on the plan)
Ph 3 (door cues) ─► Ph 10 (peek reads cues) + Ph 19 (headphones mute them)
Ph 4 (clothing model) ─► Ph 5 ─► Ph 6 ─► Ph 7
Ph 4/5 ─► Ph 10 (peek images show clothing) + Ph 6/7 (nudity gating)
Ph 8 (desire) ─► Ph 11 (release), Ph 13 (NPC drives), Ph 12 (pair formation)
Ph 9 (willingness) ─► Ph 11, Ph 13, Ph 15 (confront), Ph 17 (boundary gate)
Ph 12 (relationships) ─► Ph 13 (pair acts), Ph 14 (outside partners), Ph 15
Ph 14 ─► Ph 16 (infidelity fallout) ─► Ph 17 (throuple/cuck need partners)
Ph 18 (pregnancy) can slot after Ph 12/13 (needs couples) — independent
Ph 19 (sound) — nearly independent; needs Ph 3 (mute interplay) + Ph 1
```

Exceptions: Phases 1–3 are the UI substrate and can each be reviewed alone.
Phase 9 is pure and may be built before Phase 8 if the session prefers, but
must precede 11/13/15/17. Phases 17–19 are the most standalone (each needs
only its own arc's prerequisites) and are the likeliest to be split into
their own plan documents when they arrive, following the roadmap pattern.

## Open questions (parked, none blocking)
- **Willingness numbers:** ~~the proposed term weights need live
  calibration~~ **RESOLVED in Phase 9 (D21)** — shipped and calibrated in
  `WILLINGNESS` (config.js); see the Handoff.
- **LLM-guardrail depth (D15 follow-up):** the CONSENT half is resolved —
  willingness is deterministic-only (no LLM call may decide a consent
  outcome; D13/D15, verified in Phase 9). ~~Still open: how aggressive the
  post-hoc CONTENT assessor should be for the peek/scene image pipeline
  (X5-style judging for intimacy scenes, or deterministic-only with prompt
  boundaries). Decide during Phase 10.~~ **RESOLVED FOR PEEK in Phase 10
  (D23)** — deterministic-only with prompt boundaries, no content assessor
  for peek imagery. The non-peek scene-image pipeline may revisit the
  assessor idea later.
- **Pregnancy specifics:** conception odds, "trying" as a toggle vs.
  unprotected-act chance, whether player and NPC pregnancy use one shape or
  two. ~~Decide during Phase 18.~~ **RESOLVED in Phase 18 (D29)** — both the
  trying flag and the unprotected base chance ship (0.35 / 0.08 per completed
  sex act), one shared `world.pregnancies` record for player and NPC
  pregnancies, deterministic per (seed, pair, day, minute).
- **Cold-shoulder severity curve** and shaming deltas. Decide during Phase 16.
- **Peek image budget:** ~~exact per-session fresh-generation cap and the
  degradation rule. Decide during Phase 10.~~ **RESOLVED in Phase 10 (D22)** —
  `freshPerSession: 2` / `freshPerDay: 6`, kv cache is the primary gate,
  degradation = last cached frame else text-only. See the Handoff for the
  live verification numbers.
- **NPC-on-NPC catching:** whether an NPC masturbating should ever be caught
  by another NPC (not just the player), feeding gossip. Decide during
  Phase 13.

## Design invariants
1. **No force, ever.** The willingness function is the only path into any
   intimacy act, and no drive, verb, effect, or LLM call may bypass it (D13).
   This is the game's line in the sand; treat every boundary act as a risk
   system, never a coercion mechanism.
2. **Symmetric initiation.** Player Make-a-Move and NPC intimacy overtures
   resolve through the same gate (D3). A change that lets either side skip
   it is a bug, not a feature.
3. **Deterministic authority over boundary content.** A boundary act is
   decided by data — gates, willingness, drive scoring, content flags — and
   only narrated by the LLM/image pipeline within the authorized frame
   (D15). Explicit prompt strings must always go through the same fail-closed
   path as `getPhysicalDescriptionForPrompt`'s gate.
4. **`undressed` means `undressed`.** The clothing overhaul must keep the
   value that opens the intimate-description gate compatible, or the gate
   changes in the same phase and only in the fail-closed direction.
5. **The floor plan is never omniscient.** Fog of war and plausibility
   gating (D10) apply to every new map surface forever; the plan previously
   showed everything, so every old-save render that "loses" information is
   the intended change, not a regression.
6. **One level of nesting.** Submenus expand one level, never two (D5).
7. **Every act leaves a trace.** An intimacy act always produces at least one
   of: `leaves` (bed unmade), a signal (moaning), a clothing-state change,
   a ledger entry, or a relationship-history entry — so the world (gossip,
   cleanliness, catching, codex) always has something to react to.
8. **No shame simulator.** Consequences are NPC reactions (D2); nothing in
   the system scores the player morally. When a reaction reads like a
   judgment, it is misdrawn.
9. **Content all-on by default.** Everything ships behind the existing
   `mature` flag; never add a second NSFW toggle (D14).
10. **Never hardcode explicit strings into prompts.** Every explicit image or
    LLM prompt is built by deterministic code through the gated path (D15) —
    same rule the browser's adult sites already follow.
