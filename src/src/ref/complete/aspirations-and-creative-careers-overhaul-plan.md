# Aspirations, Creative Careers & Chatter Overhaul

Status: **COMPLETE — all 18 phases built and verified.** Design session
complete 2026-09-18; decisions locked D1–D58 at design time, D59–D112 added
during implementation. Close-out audit run 2026-09-19; moved from `wip/` to
`complete/` the same day.

Companions:
- `src/src/ref/complete/actions-and-activities-overhaul-plan.md` (built the
  hobby actions, the Chatter feed this plan grows into a platform, the Ask
  tree every new leaf here joins, and the skill-research phase; its Phase 19
  audio work is the only phase still open and is unrelated).
- `src/src/ref/complete/economy-and-rent-plan.md` (the cost stack the new
  income streams sit against; **this plan revises its solo-living
  invariant — see D1 — and the economy plan's own invariant list must be
  annotated in Phase 15, not silently contradicted**).
- `src/src/ref/complete/vocation-and-lifestyle-expansion-plan.md` (the NPC
  occupation pool — `incomeBand`/`spendingLean` are what D42 derives NPC
  subscription affordability from; the `workMode: 'self_employed'` lean is what
  D40 reads to pick NPC creators).
- `src/src/ref/complete/knowledge-gossip-memory-plan.md` (`addMemoryFact`,
  `receiveTransmittedFact`, `ruminate` — the Notice & Opinion layer (D9–D13)
  is a new fact *kind* on that store, never a parallel memory).
- `src/src/ref/complete/intimacy-and-voyeurism-overhaul-plan.md` (the
  three-condition explicit-content gate `image.js` already enforces is the
  ONLY gate Chatter Private's content may use — D31).
- `src/src/ref/complete/asks-and-attachments-plan.md` (every new ask leaf —
  `$Feature`, `$SubscriptionTalk` — matches its `decide()`/`effects()` shape).
- `src/src/ref/wip/home-design-studio-plan.md` (Phases 16–17 resolve its
  parked "should placement ever be mechanical" question — yes, narrowly —
  and turn its dev-only editor into a Home-app screen. Its data shape is
  untouched; that was the promise its own doc made).
- `src/src/ref/complete/restaurant-network-expansion-plan.md` (DoorDrop's
  12 restaurants — the home kitchen becomes the 13th vendor, D25).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session — see
`src/src/ref/wip/aspirations-and-creative-careers-handoff-prompt.md` for the
full session protocol.

---

## Handoff — read this first

**Resume at:** nowhere — **the plan is complete.** All 18 phases are built
and verified. This document is archived to `src/src/ref/complete/` in the
same commit as this note.

**Last session's notes (Phase 18, Close-out audit, 2026-09-19):**
- **What the audit did.** Built `verify-acc-p18.js` (Node, 82 checks): (1)
  every D-number the plan's own Phase 18 verification line names, D1–D58,
  mapped to a real identifier still present in the shipped source (a grep
  over every `src/src/srcfiles/*.js` file — not a re-run of each phase's
  own functional assertions, which `run-all.js acc-p` already re-confirms
  green); (2) invariant 8 — the five new files (`notice.js`, `works.js`,
  `platform.js`, `aspirations.js`, `defs.works.js`) registered in both
  `index.html` and `loadgame.js`'s `ORDER`; (3) a curated spot-check of
  D59–D112 addenda with independent audit value (a retired symbol that
  must not reappear, a value that must not be persisted, a tuning dial's
  actual number); (4) a **consolidated** persisted-field round trip — every
  new field this plan added (`player.works`/`incomeLog`/`independenceWeeks`/
  `kitchen`/`aspirations`, `npc.chatter`, `world.roomDecorOverrides`,
  `world.computer.apps.social_feed.profile`) set together on ONE record and
  survived through `JSON.parse(JSON.stringify(...))`, rather than only ever
  proven one field at a time by an individual phase's own harness; (5) the
  D14 gig-reputation migration (`normalizeGigsAppState`/`foldGigReputation`)
  folding an old scalar (37) into `{ tech: 37, admin: 0, ... }`, called
  directly. All 82 pass. `chatter.js`'s header was re-read and already
  tells the truth (rewritten in Phase 9, D27) — nothing to do there.
- **Live-page verification (`dev-harness.html`, port 8743, added to
  `.claude/launch.json` as `slice-of-life-aa-p18`).** A fresh 0-roommate
  Sandbox reached WorkHub → Works, Chatter (handle prompt → profile →
  Support/Chatter-Private/Blocked panels), and Compass (all 5 directions
  listed) with zero new console errors (only the pre-existing, unrelated
  `local-ai-shim` `ERR_CONNECTION_REFUSED` noise when no local AI server is
  running, and menu.js's title-gallery `root is not defined` — both
  pre-existing dev-harness limitations, documented elsewhere, not this
  plan's). Separately, **the real old-save migration path was proven by
  calling `restoreSave(record)` directly** (the actual function `Continue`
  and `Load Game` both call) against a save record hand-edited to the
  pre-plan shape: `player.works`/`workInProgress`/`catalogCarry`/
  `catalogPaidDay`/`nextWorkSeq`/`kitchen`/`aspirations`/`incomeLog`/
  `independenceWeeks` all deleted, `world.computer.apps.gigs.reputation`
  rolled back to a bare scalar, `world.computer.apps.social_feed.profile`
  deleted outright, every NPC's `.chatter` and `.bible.creator` deleted,
  and the recorded `meta.versions.world` rolled back to 5. `restoreSave`
  returned a state with the scalar correctly folded to
  `{ tech: 99, admin: 0, ... }` (tested with a distinctive value to rule
  out a stale fixture) and no thrown error — the on-disk migration chain,
  the in-memory `normalizeComputerState` fold, and every `ensureX` lazy
  default all fired correctly on a genuinely old-shaped record.
  **Testing-methodology note, not a game bug:** driving this same scenario
  through the `Continue` **button** in the UI (rather than calling
  `restoreSave` directly) intermittently reproduced a board/reputation that
  looked unmigrated. Root-caused to `menu.js`'s `menuEntryCache` — the
  cache `refreshMenuContinue` populates on boot — going stale across the
  repeated in-tab `root.kv` surgery this test performed on a still-open
  session; a plain page reload plus a direct function call both proved the
  shipped code path is correct. Worth knowing if a future session sees the
  same thing while testing saves live: reload with no prior live session in
  the same tab, or call `restoreSave` directly, rather than trusting a
  `Continue` click issued moments after hand-editing `kv.saves` in the same
  running tab.
- **Sweep.** Before (= the Phase 17 session's after): **5362 / 79 / 9**.
  After adding `verify-acc-p18.js`: **5444 / 79 / 9** — up by exactly 82,
  failed/errored counts unchanged from baseline. `run-all.js acc-p` now
  reports 525/525 across all 18 phase harnesses.
- **Patch Notes + version.** Added a player-facing entry to
  `defs.patchnotes.js`'s `PATCH_NOTES` (version `0.14.0`, dated
  2026-09-19, titled "Aspirations, Creative Careers & Chatter") summarizing
  the whole plan in plain language — the six-category gig board, going
  independent, Chatter as a platform, NPC opinions, Compass/aspirations,
  the revised solo-living invariant, and the Home designer's Arrange mode.
  Bumped `GAME_VERSION` (config.js) from `0.13.0` to `0.14.0`.
- **No blockers, no deviations.** Every D-number checked resolved clean;
  no D-113+ was needed. The two external-block parked names (Q1
  "Inkwell", Q2 "Compass") stand as shipped, per D74/D101.
- **Housekeeping done in this same commit:** this plan and its handoff
  prompt move from `src/src/ref/wip/` to `src/src/ref/complete/`;
  `src/src/ref/README.md` and `src/src/ref/structural/ARCHITECTURE.md`
  indexes updated to match.

**Phase 17, in full (2026-09-19):**
- **What shipped, by identifier** (grep for these):
  - `defs.design.js` — `normalizePlacement(pos, { snap, gridSize, minSize,
    rotStep, roomId })` → `{ x, y, w, h, rot }` | `null` (D110): snaps to
    the grid (default 5), floors size (default 2), rounds rotation to
    `rotStep` (default 15°) wrapped into `[0, 360)`, and — only when
    `roomId` is given — rejects a placement whose (unrotated) box doesn't
    land inside the union of `ROOM_LAYOUT[roomId]` via `placementFitsRoom`.
    `BASE_FURNITURE_SHAPES` (15 defId → `DESIGN_SHAPES` aliases, e.g.
    `sink_kitchen`/`sink_bathroom` → `sink`); `baseFurnitureShape(defId)`;
    `roomAutoBaseCandidates(gs, roomId)` (D111) — `resolveAutoPlacements`
    reshaped to `{ shape, defId, x, y, w, h, rot: 0 }`, skipping any defId
    `baseFurnitureShape` can't resolve. New shape: `DESIGN_SHAPES.desktop_computer`.
  - `computer.js` — `placeDecorItem`/`moveDecorObject` (pre-existing,
    decor-economy plan) now call `normalizePlacement(pos, { roomId })` and
    refuse (`"That doesn't fit in the room."`) on `null` instead of only
    floor-checking size (D110). `startRoomArrange(gs, roomId)` →
    `{ ok, placements, already }` — snapshots `roomAutoBaseCandidates` into
    `world.roomDecorOverrides[roomId]`, idempotent (`already: true`,
    unchanged, if one exists); `removeRoomArrangePlacement(gs, roomId,
    index)`; `resetRoomArrange(gs, roomId)` — **deletes** the key, never
    sets `[]` (D111, so "reset" and "arranged-but-empty" can't collide
    with `roomDesignBase`'s own `.length > 0` check).
  - `ui.computer.js` — `homePlacementUI.mode: 'decor' | 'base'`,
    `.undo: {}` (D112, keyed `` `${mode}:${roomId}` `` → `{ stack, redo }`);
    `homePointerXY(ev)` (touch-or-mouse clientX/Y) — `homePlacementSvgPoint`
    now routes through it, which is the WHOLE touch fix (every gesture
    already went through that one function); `onHomePlacementMouseMove`
    rewritten to build a raw candidate pos per mode/drag-kind, then run it
    through `normalizePlacement` every frame and skip the update on
    rejection (a wall, not a snap-back-on-release); `homePlacementSnapshot`
    /`homePlacementRestore`/`homePlacementPushUndo`/`homePlacementUndoKey`;
    `doHomePlaceMode`/`doHomeArrangeStart`/`doHomeArrangeRemove`/
    `doHomeArrangeReset`/`doHomePlaceUndo`/`doHomePlaceRedo`;
    `onHomePlacementTouchMove`/`onHomePlacementTouchEnd` +
    `touchmove`/`touchend`/`touchcancel` listeners in
    `initHomePlacementGestures` (`{ passive: false }`, needed for
    `preventDefault` to actually stop page-scroll mid-drag). Every
    `doHomePlace*`/`doHomeArrange*` now calls a new `rerenderHomePlacement()`
    (both `renderComputerScreen` AND `renderPhoneScreen`) — the Home app is
    `devices: ['computer', 'phone']` and `homePlacementUI` is one shared
    singleton, so the phone screen going stale after a computer-driven
    mutation (and vice versa) was a real pre-existing gap this phase closed.
  - `render.computer.js` — `renderHomePlacement` gained the Decor/Arrange
    mode chips and Undo/Redo chips (disabled when their stack is empty);
    `buildHomePlacementCanvas` branches on mode (decor: unchanged — base
    backdrop, interactive placed objects, draft; base: placed-decor
    backdrop, interactive override entries keyed by array index, or — no
    override yet — the current base dimmed with nothing to drag) and its
    backdrop now tries `renderAuthoredDecor` FIRST, `renderAutoFurniture`
    only as fallback (a bug this phase's own overrides would otherwise
    have introduced: the backdrop drew the raw auto-packer even once a
    room had an override, going stale the moment arranging existed).
    `buildHomePlacementBaseNode` (base mode's twin of
    `buildHomePlacementObjectNode`); `bindHomePointerDown`/
    `appendHomePlacementBackdrop` helpers.
  - `ui.js` — six new dispatch cases: `home.place-mode` (reads
    `extra.rowId`, reusing the existing `data-row-id` extraction rather
    than adding a `data-mode` one), `home.place-undo`, `home.place-redo`,
    `home.arrange-start`, `home.arrange-remove`, `home.arrange-reset`.
  - `dev/designer.html` — a marked, synced `normalizePlacement`/
    `placementFitsRoom` block (byte-for-byte the live functions); its
    mousemove handler's move/size/rot branches call the shared function
    (rot keeps its shift-key fine-rotate feature via `rotStep`) instead of
    inline `G()`/`Math.max()` math; room-reshaping (the `rect` drag kind)
    is untouched — D55 says structure stays with renovation, not the
    Studio.
  - `dev/sync-designer.js` — now also injects
    `normalizePlacement.toString()`/`placementFitsRoom.toString()` between
    markers (D110). **Found and fixed in passing:** its SHAPES/
    SHIPPED_DECOR regex assumed bare `\n`; `designer.html` is CRLF on this
    machine, so that half of the sync had been silently a no-op — caught
    only because `desktop_computer` wasn't reaching the file despite a
    "success" log. Now `\r?\n`.
  - `verify-plan.js` — two new checks under "the studio stays in sync with
    the game": designer.html's normalizePlacement/placementFitsRoom match
    the live functions byte-for-byte (114/114, was 112/112).
- **Verification:** `verify-acc-p17.js` — **27/27** (Node, invariant 7 —
  the interactive surface is DOM-only and verified live instead):
  `normalizePlacement`'s grid-snap + rotation-wrap-to-345° + size floor +
  non-finite-input rejection + bounds accept/reject; `baseFurnitureShape`
  direct/aliased/unknown; every `BASE_FURNITURE_SHAPES` target is a real
  shape; `roomAutoBaseCandidates` on `bedroom_player` (5/5 fixtures
  covered: bed/desk/wardrobe/nightstand/desktop_computer) and `kitchen`
  (4/9 — the rest deliberately uncovered, D111); `startRoomArrange`
  idempotence, `removeRoomArrangePlacement`'s splice and bad-index refusal,
  `resetRoomArrange`'s delete-not-`[]` and refuse-if-not-arranged;
  `placeDecorItem`/`moveDecorObject` rejecting outside the room and
  accepting/snapping inside it; an arranged room reading as `designed`
  through `decorFor`/`roomDesignBase`/`roomPlayerDesignCount` exactly like
  an authored one. Live page (`dev-harness.html`, port 8742, a fresh
  0-roommate Sandbox): Home → Place → Arrange → Start arranging snapshot
  bedroom_player's 5 fixtures; a real dispatched mousedown/mousemove/
  mouseup moved the nightstand (and re-snapped its size 9×9 → 10×10, the
  grid); the identical drag toward (9000, 9000) left it exactly where it
  was; Undo restored the pre-drag position and disabled itself, Redo
  restored the move and disabled itself; Remove spliced the nightstand
  out (Undo restored it); Reset to original layout deleted the override
  key outright (`decorFor`/`roomDesigned`/`roomPlayerDesignCount` all
  confirmed back to auto/0); a **TouchEvent**-only sequence (touchstart/
  touchmove/touchend, no mouse events) moved the bed exactly like the
  mouse path; Decor mode's backdrop showed the arranged layout, then the
  auto layout again after reset; a manual `saveAtBoundary` + full page
  reload reproduced the arranged override array byte-for-byte.
  `dev/designer.html`: opened cleanly on a fresh checkout; adding and
  dragging a Bed in Bedroom 1 worked through the shared `normalizePlacement`.
- **Sweep.** Before (= the Phase 16 session's after): **5333 / 79 / 9**.
  **After: 5362 / 79 / 9** — up by exactly 27 (`verify-acc-p17.js`) + 2
  (`verify-plan.js`'s new drift checks); failed/errored counts UNCHANGED
  from baseline once a pre-existing casualty (below) was fixed rather than
  left as a new regression.
- **A pre-existing harness broke, then was fixed — not left as a new
  regression:** `verify-acc-p6.js`'s `__placeKit` and two inline
  `placeDecorItem` calls used hardcoded positions (`{x:10,y:10}` for
  `bedroom_player`, rect `[90,5,110,130]`; `{x:5,y:5}` for `living_room`,
  rect `[165,190,160,165]`) that were always outside the real room —
  silently accepted before D110's bounds check existed, `TypeError`-crashing
  the harness once it did. Fixed to derive from `ROOM_LAYOUT[roomId][0]`;
  one exact-width assertion (`objPos.w === 16`) updated to the now-grid-
  snapped `15`. Back to 18/18. No other harness hardcodes a position
  (`verify-acc-p16.js`'s `__furnish` already derives from `ROOM_LAYOUT`).
- **Deviations from the plan, resolved (D110–D112):** `normalizePlacement`
  as the shared choke point, synced via `.toString()` injection rather
  than hand-copied (D110); arranging snapshots by defId with an unshaped
  fixture simply omitted, matching the shipped pool room's own
  pool_pump/sauna gap, and the parked "does an override absorb placed
  objects" question resolved as recommended — no (D111); undo/redo scoped
  per room+mode, deliberately not covering the inventory-crossing
  place/pickup actions (D112). Nothing blocked.
- **Behavioral notes worth knowing:**
  - Dragging a piece whose w/h isn't already a multiple of the grid bumps
    it to the nearest multiple on the very first frame of ANY drag
    (`normalizePlacement` re-snaps the whole pos, not just the axis being
    changed) — a 9×9 nightstand becomes 10×10 the instant it's touched.
    Cosmetic; every catalog shape already ships at grid multiples, so this
    is really only visible on newly-arranged base furniture.
  - Rotation is never bounds-checked — matches every other geometry reader
    in the codebase (`decorVisible`, `resolveObjectStandPoint`), which
    already treat a placement's box as axis-aligned regardless of `rot`.
  - Once a room IS arranged, `decorFor` draws ONLY the override entries —
    a fixture with no resolvable shape (most kitchen appliances) simply
    stops rendering. Deliberate (D111) and not a new gap: the shipped pool
    room already never draws `pool_pump`/`pool_loungers` the same way.
  - `homePlacementUI` (mode, room, selection, undo stacks) is ONE shared
    module-level singleton — a computer window and a phone both open to
    Home → Place see and drive the exact same interaction state, which is
    why every mutation handler re-renders both screens now.
  - `moveDecorObject` (computer.js) still has no call site anywhere in the
    game — it predates this phase and was already dead code (the Studio's
    live drag mutates `obj.pos`/override entries by direct reference
    instead). This phase updated its validation for correctness and
    consistency with `placeDecorItem` but did not wire it in; that was
    already true before Phase 17 and isn't this phase's to fix.

**Earlier sessions (compact — identifiers only):**
- Phase 16 (2026-09-19): `defs.works.js` `HOME_TUNING`; `defs.design.js`
  `roomDesignBase`/`roomPlacedDecor`/`decorFor`/`roomDesigned`/
  `roomPlayerDesignCount`/`roomDecorDensity`/`roomStyleWeights`/
  `roomDesignVersion`/`designedRoomComfort`/`wallSlotsFor`/
  `wallSlotOccupant`; `render.js` `renderPlacedDecor`/`renderAuthoredDecor`;
  `world.js` `applyDesignedRoomComfort`; `notice.js` `noticeRoomDesign`/
  `roomDesignQuality`/`OPINION_LINES.room_design`; `works.js` `hangWork`/
  `takeDownWork`/`hungPieces`; the Home app's Hang screen; `world.
  roomDecorOverrides` in SAVE_KEYS; D106–D109. `verify-acc-p16.js` 26/26.
- Phase 15 (2026-09-19): `ECONOMY.independence`, `player.incomeLog` from
  `applyEarnMoney`, `independenceCost`/`independenceIncome`/
  `independenceIndex`/`processIndependenceForDay` (aspirations.js),
  `processIndependenceForDayUi`; the economy audit — `GIG_TUNING.payScale
  0.3`, the compressed tier band and tier-2–4 rates (D104); the economy
  plan's dated note and the invariants memory; D104–D105.
  `verify-acc-p15.js` 10/10 (dabbler 0.93 never; catalog-only 0.44;
  creator week 21; stacked writer week 28).
- Phase 14 (2026-09-19): `ASPIRATION_DIRECTIONS` + `ASP` (defs.works.js),
  `aspirations.js` (`chooseDirections`, `liveMilestones`,
  `checkAspirations`), Compass (`compass-overview`), the intro's toggles;
  D101–D103. `verify-acc-p14.js` 15/15.
- Phase 13 (2026-09-19): `recognitionTells`/`recognitionChance`/
  `recognitionRoll` (`_roomsSeen` by the sim), `identity_link` facts,
  the `subscription` subject, `$SubscriptionTalk` + `_playerBoundaries`,
  `checkPlayerBoundary`/`maybeBoundaryUponFact`; D98–D100.
  `verify-acc-p13.js` 20/20.
- Phase 12 (2026-09-19): `deriveCreator`/`ensureCreator` (sim.js),
  `bible.creator` schema, `npcCreator`/`creatorIds`/`npcCreatorTick`,
  `buildNpcSelfShotRecord`, `subscribeToNpc`/`billPlayerSubscriptions`,
  `chatterPrivatePostView`, the Creator panel, the bank's Subscriptions;
  D95–D97. `verify-acc-p12.js` 19/19.
- Phase 11 (2026-09-19): `canOpenPrivatePage`/`openPrivatePage`,
  `takePhoto(gs, tags, { selfShot, intimate })` + `level` on every photo,
  `$Feature` (`ASK_FEATURE`, `consent_feature` facts, enforced in
  `postChatterAsPlayer`), `castPrivateDecision`/`derivePrivateSubscribers`,
  `ghostConversion(gs, 'private')`, the private screen; D92–D94.
  `verify-acc-p11.js` 24/24.
- Phase 10 (2026-09-18/19): `postAppeal`/`applyGrowth`/`ghostDecay`
  (`growthK 0.5`, measured), `npcSlots`, `castSubscribeDecision`,
  `ghostConversion` (D91), `deriveSubscribers`/`billSubscriptions`,
  `platformPerceiversFor` (D89), ghost comments (D90), `trackerPlatform`,
  the About select, the profile's Support/Notifications; D88–D91.
  `verify-acc-p10.js` 32/32.
- Phase 9 (2026-09-18): `platform.js` (profile, handles, `chatterCastIds`,
  blocking, `visiblePostsFor`, `castFollowDecision` + daily pass),
  `CHATTER_LABELS`, image/poll posts, `postChatterAsPlayer` needs a handle;
  D85–D87. `verify-acc-p9.js` 26/26.
- Phase 8 (2026-09-18): `player.kitchen` (D81); `openKitchen`, `listDish`,
  `generateKitchenOrdersForDay`, `fulfillKitchenOrder`, `closeKitchenDay`;
  `playerKitchenDef` / `restaurantVendorsForDisplay`; notice `perceiverIds`
  (D83); cast orders (D84); D81–D84. `verify-acc-p8.js` 20/20.
- Phase 7 (2026-09-18): `ITEM_DEFS.player_art`; `pieceItemStack`,
  `sellWork`; sketchpad chips; D79–D80. `verify-acc-p7.js` 15/15.
- Phase 6 (2026-09-18): `recording_kit`; `playOwnTrack` +
  `EFFECT_DEFS.PLAY_OWN_TRACK`; `WORK_START_COPY` + `openWorkStartModal`;
  Streamly `releases`; D77–D78. `verify-acc-p6.js` 18/18.
- Phase 5 (2026-09-18): `INKWELL_LABEL` (D74); `renderInkwell`; desk chips;
  `releaseWork` notices in-room (D75); D74–D76. `verify-acc-p5.js` 17/17.
- Phase 4 (2026-09-18): `defs.works.js` (`WORK_KINDS`, `WORKS_TUNING` —
  D71), `works.js`; WorkHub `works` screen; `trackerCatalog`; D71–D73.
  `verify-acc-p4.js` 35/35.
- Phase 3 (2026-09-18): `notice.js` — `noticeSubject`, `opinionValence`,
  `OPINION_PERSONALITY` (D70), `craft_moment`; D65–D70. `verify-acc-p3.js`
  40/40.
- Phase 2 (2026-09-18): `GIG_CATEGORIES`, 24 `GIG_TEMPLATES`,
  `gigs.reputation` map, `MIGRATIONS.world 5→6`; D61–D64.
  `verify-acc-p2.js` 60/60.
- Phase 1 (2026-09-18): `music` skill, `craftQuality`, hobby `mode`;
  D59/D60. `verify-acc-p1.js` 39/39.

**Design-session notes (2026-09-18 — kept for context):**
- Full design conversation with the user; every decision below was made
  explicitly, not inferred. The pillars were arrived at in this order and the
  order is meaningful: (1) the player has no throughline (no aspiration /
  goal system exists anywhere — grep for `aspiration|life goal|milestone`
  finds only contractor tutorial hints), (2) hobbies are wallpaper, (3) home
  arrangement is mechanically mute, then the user added (4) Sims-style
  work-from-home creative careers, (5) the gig board going multi-category,
  (6) Chatter becoming a real public platform with a three-layer audience,
  and (7) revised the standing "solo living must never be sustainable"
  invariant to "possible, but only as a stacked late-game accomplishment."
- **Citations were checked against live code during the design session**
  (2026-09-18) — `skills.js`, `chatter.js`, `computer.js`'s gig functions,
  `defs.computer.js`'s `GIG_TEMPLATES`/`GIG_REPUTATION_TIERS`/app list,
  `asks.js`'s `ASK_CATEGORIES`, `config.js`'s `SKILL_IDS`/`MOOD_PAYOUTS`/
  `CONTENT_CONFIG`, `defs.design.js`'s `ROOM_DECOR`, `signals.js`'s
  `perceiveSignals`, `npc.js`'s `addMemoryFact`/`receiveTransmittedFact`.
  Line numbers will drift; names won't.
- **Two things the Evidence section records that a session might otherwise
  "fix" in passing — don't, they're Phase 2's job:** every gig template gates
  on `skill: 'tech'` including `copy_edit` (category `writing`), and
  `eligibleGigTemplates`'s tier-by-template-index mapping is off by one
  (6 templates, 5 tiers — `infra_project` resolves to tier floor 0).
- **Naming is locked as defaults, not as gospel** (D26): Friends / Followers /
  Backers / Chatter Private. All four are entries in one label table so a
  rename is a one-line change; the user was offered alternatives and did not
  object to these. If the user renames them mid-plan, change the table, not
  the D-number.
- `chatter.js`'s header comment asserts NSFW non-explicitness "by design" and
  residents-only authorship as settled facts. **They were implementation-time
  scope guesses, not user decisions** — the user said so explicitly. Phase 9
  rewrites that header; until then, don't cite it as a constraint.
- "Afterhours" is already an in-fiction brand (`afterhours.js`, an existing
  late-night browsing/ad-network system). It is **not** available as a name
  for the NSFW tier — that collision was caught during design.

**Blockers / flagged deviations:** None.

---

## The thesis

Every NPC in this game has a throughline. Cognition gives them wants,
initiative lets them act on those wants, memory-with-provenance lets them
learn, gossip lets what they learn travel. The player has none of this. The
player's whole structure is *react*: rent comes due, an NPC asks something,
a need drops. There is no answer anywhere in the codebase to "what am I
playing *for*?" — the closest things are a bills tracker, a discovery log,
and six one-shot tutorial hints named "milestones."

That absence is why three other systems feel thinner than their line counts
suggest. Hobbies exist (guitar, sketchpad, records, console, reading) but
four of five award nothing and none produce anything — a player who plays
guitar for a hundred in-game hours is exactly where they started. Skill
curves were declared with the comment "so P4/P6/P7 have a stable curve to
read the moment their systems exist"; two of them (`payMultiplier`,
`socialEdge`) still have no reader. The apartment *is* the entire game world
and yet arranging it does nothing — the Home Design Studio's own doc parks
"whether placement should ever feed a mood" as deliberately undecided, and
one room of nineteen has been designed. Mastery has no end-purpose, so
nothing that builds toward mastery matters.

This plan gives the player what NPCs already have, and it does it by making
skill *pay* in the most literal sense. The gig board — already the right
shape: skill-gated, reputation-tiered, deliberately lumpy — stops being six
`tech` templates with one global reputation number and becomes a real
multi-category freelance market (writing, music, art, code, food, and a
no-skill floor) with reputation earned per craft. Above it, a player who has
built a craft *and* a reputation can go independent: self-publish a book,
release a track, sell a painting, run a home kitchen — a catalog of works
that earns a trickle, fades without promotion, and rewards the prolific over
the one-hit. Chatter, today a text feed among housemates, becomes the actual
public surface for all of it: a three-layer audience (the authored cast who
post real content and can subscribe to you; "ghosts," the numbers-only
public that makes a following in the millions cheap to simulate; and paying
subscribers on a support tier and an explicitly opted-into private tier), a
pseudonymous handle so "did they figure out it's me" is an earned discovery
rather than a guaranteed reveal, and full symmetry — NPCs can be creators
too, and you can subscribe to them, at a real cost, with a real chance of
being found out.

Underneath all of it, one shared **Notice & Opinion** layer: when the player
makes something — a dish, a song, a room, a post — it becomes a thing an NPC
can perceive, form an opinion on, remember, and tell someone else about,
through the perception and gossip machinery that already exists. Build it
once; every pillar plugs in.

And on top: **aspirations**. Broad directions the player chooses (Craft,
Connection, Comfort, Independence, Notoriety), each spawning concrete
milestones that are pure predicates over state the other pillars produce.
No new currency, no fail states, no expiry. The one direction with real
mechanical teeth is Independence, and it is the reason the standing
"solo living must never work" rule is revised rather than kept (D1): solo
self-sufficiency becomes *possible*, but only as a stacked, late-game
accomplishment — skill, reputation, and sustained upkeep across several
systems at once — which is honest to how those pursuits actually work and
turns the game's central pressure into something a player can, with enough
work, actually win.

### What this plan is *not*

- **Not a new currency, resource, or points system.** Aspirations reward
  mood (existing `MOOD_PAYOUTS`) and NPC recognition (Notice & Opinion).
  Money flows only through the income paths that already exist
  (`EARN_MONEY`, `player.money`). The moment a phase wants a new meter, it
  is drifting.
- **Not a quest log with fail states.** Milestones sit until true. Nothing
  expires, nothing punishes. The rest of this game's progression is slow and
  forgiving; this matches it.
- **Not mandatory.** A player who never opens the aspirations app, never
  posts to Chatter, and never publishes anything has the complete game they
  had before. This is texture on top of the reactive loop, not a replacement.
- **Not a second decor economy.** Buying furniture stays with
  `decor-economy-plan.md`. Phases 16–17 touch *arrangement* — where things
  are and what that says — never what is for sale.
- **Not a job simulator.** The player never leaves the apartment
  (`external-world-npcs-overhaul-plan.md`'s thesis holds). Every career here
  is work-from-home by construction: gigs are remote, works are made in the
  apartment, the platform is a screen.
- **Not a new consent mechanic.** Featuring another person in content routes
  through the Ask tree and the willingness/boundary gates that already govern
  every intimate act (D31, D33). If a phase seems to need a new door, it is
  wrong — the existing ones are the only doors.
- **Not a rewrite of Chatter's feed.** The NPC-authored, event-sourced
  in-house posting that ships today keeps working unchanged; the platform
  layer is additive (D27).

---

## Evidence

Measured against the live code, 2026-09-18.

| Claim | Where | What's there |
|---|---|---|
| No player goal system exists | `grep -rniE "aspiration\|life goal\|milestone"` over `srcfiles/` | Only `fireContractorMilestone` (`computer.js`) — six one-shot tutorial hints keyed `world.flags.tutorial_<id>`. `tracker.js` is obligations (rent, bills, deliveries). `codex.js` is a discovery log. |
| Hobbies award nothing | `defs.actions.js` `createHobbyAction` calls (~1599–1608) | Five hobby actions; only `hobby_sketchpad` passes an XP spec (`{ id: 'art', xp: 6 }`). Guitar, reading, records, console: one flavor line + a mood tick. |
| Two skill curves have no reader | `skills.js` `SKILL_CURVES`; `grep payMultiplier\|socialEdge` | `payMultiplier` and `socialEdge` are declared and consumed nowhere. `defs.computer.js:~471` documents an optional `qualitySkill` template field "read through payMultiplier" — no template sets it, nothing reads it. |
| `SKILL_IDS` is broader than the game uses | `config.js` `SKILL_IDS` | `['cooking','cleaning','stealth','tech','fitness','social','art','writing','focus']` — `writing`, `social`, `fitness`, `focus` have no award site. No `music`. |
| Gig board is single-skill | `defs.computer.js` `GIG_TEMPLATES` | 6 templates. **All six** are `skill: 'tech'` — including `copy_edit` (`category: 'writing'`). Categories are cosmetic. |
| Gig reputation is one number | `computer.js:~40` app init; `eligibleGigTemplates` | `gigs.reputation: 0` — a scalar. A writing gig raises the rep that unlocks infrastructure projects. |
| Tier mapping is off by one | `eligibleGigTemplates`, comment "5 templates, 5 tiers, 1:1" | Six templates, five tiers. `GIG_REPUTATION_TIERS[5]?.floor ?? 0` → `infra_project` (the Elite gig) resolves to floor 0 and is offered at any rep once `minSkill` 5 is met. Latent, not yet player-visible only because `tech` 5 takes a while. |
| Chatter is house-only, text-only | `chatter.js` `chatterResidentIds`, post shape | Authors are `residency.status === 'resident'` only. A post is `{id, author, text, likes, comments, day, eventRef}` — no media, no polls, no visibility, no audience beyond the cast. No follower or subscriber concept. |
| NPCs have no wallet | `grep npc.money\|npc.wallet\|npc.funds` | Nothing. NPC economics are `incomeBand` + `spendingLean` on the occupation record — persona flavor for the LLM (`occupationLivingClause`), never a number. |
| Home arrangement is visual-only | `defs.design.js` `ROOM_DECOR`; home-design-studio-plan.md "What this is not" | One room (`pool_room`) designed; eighteen auto-arrange. Position "is currently visual only." |
| The existing hooks this plan reuses are real | — | `perceiveSignals(gameState, perceiverId, roomId)` (signals.js), `addMemoryFact(npc, fact)` / `receiveTransmittedFact` (npc.js), `ruminate(npc, gameState, day)` (rumination.js), `willingnessFloorReasons` (willingness.js), `resolveBoundaryGate` (boundary.js), `takePhoto(gameState, tags)` + `buildPhotoPrompt` (image.js), `RESTAURANT_DEFS` (defs.computer.js), `MIGRATIONS` (state.js), the `ASK_CATEGORIES` tree (asks.js). All confirmed by name. |

---

## Locked decisions

### Economy & the revised invariant

- **D1 — Solo self-sufficiency is possible, as a stacked accomplishment.**
  The standing rule "solo living must never be payable" (economy-and-rent
  plan; memory) is **revised**, not deleted: the game no longer enforces a
  ceiling that overrides the simulation. Instead, difficulty comes honestly
  from stacking — a craft skill at high level, a per-category reputation at
  high tier, a catalog that needs upkeep, and a following that needs
  feeding, all sustained concurrently. Early on, every independent stream is
  worse than gig work (unsold books, an unknown kitchen). At the top, the
  stack can cover a solo lease. Phase 15 measures this and writes the
  revision into the economy plan's invariant list with the numbers.
- **D2 — Income stays lumpy at every tier.** The gig board keeps its ~70%
  refresh / dry-spell behavior. Catalog income is a decaying trickle with
  spikes (D17). Platform income is subscriber counts that churn (D34). A
  reliable weekly figure still means the design is broken — D1 changes the
  *ceiling*, not the *shape*.
- **D3 — Money flows only through existing paths.** Every credit uses the
  `EARN_MONEY` effect or the same `player.money +=` sites gig delivery uses;
  every debit (a subscription you pay) uses the existing bill/charge path.
  No new ledger. `money.js`'s loan ledger is untouched.
- **D4 — Overwork still hurts.** All new time-block work (drafting, recording,
  cooking orders, promoting) spends energy through the same per-block cost
  gig work does (`GIG_ENERGY_PER_BLOCK`) and counts toward the same burnout
  the vocation plan built. A creative career is not a way around burnout.

### Skills & hobbies

- **D5 — One new skill: `music`.** Added to `SKILL_IDS`. `writing`, `art`,
  `social` already exist and gain award sites; nothing else is added.
- **D6 — Hobbies split into mastery and bonding, declared on the action.**
  `createHobbyAction` gains an explicit `mode: 'mastery' | 'bonding'`.
  Mastery hobbies award XP (guitar → `music`, sketchpad → `art`, reading →
  `writing` as research at a reduced rate). Bonding hobbies (records,
  console) award **no XP by design** — their value is the shared-activity
  invite path that already exists (`ASK_HANGOUT`/`ASK_INVITE`). Forcing XP
  onto them is busywork and is refused.
- **D7 — `socialEdge` gets its reader; `payMultiplier` is retired.**
  `socialEdge` (on the `social` skill) becomes on-camera *presence* — the
  appeal multiplier for skill-agnostic lifestyle content (D29). Gig pay is
  owned by reputation tiers, so `payMultiplier` and the phantom
  `qualitySkill` template field are deleted, not wired — no field without a
  reader (invariant 6).
- **D8 — Level-ups are noticeable.** Crossing a skill level while an NPC is
  in the room emits a Notice & Opinion subject (D10). This is the first
  subject the layer is verified against, before any career exists.

### Notice & Opinion (the shared layer)

- **D9 — One layer, many subjects.** A single API —
  `noticeSubject(gameState, { kind, ref, roomId, day, ... })` in a new
  `notice.js` — is the only way a player-made thing becomes NPC-perceivable.
  Subjects: `skill_levelup`, `work` (a book/track/piece/dish), `room_design`,
  `chatter_post`, `chatter_private`, `subscription`, `aspiration`. Phases add
  subjects; none adds a second mechanism.
- **D10 — Perception before opinion.** A subject is not known to an NPC until
  perceived: in-room subjects go through `perceiveSignals` as a standing or
  transient signal; platform subjects go through the NPC's own Chatter usage
  (D37). An NPC never has an opinion about something it could not have
  encountered (invariant 3 of the actions plan, extended).
- **D11 — Opinions are facts.** A perceived subject becomes a memory fact via
  `addMemoryFact` with `kind: 'opinion'`, a `subject` ref, a `valence` in
  [−1, 1] computed from personality × subject quality × relationship, and
  provenance. It is therefore already transmissible (`receiveTransmittedFact`)
  and already raisable in conversation (`ruminate`). Nothing new is built for
  spread — that is the whole point of making it a fact.
- **D12 — Valence is deterministic and personality-first.** Quality moves
  valence; personality decides the sign's sensitivity (a critical NPC is
  harder to impress, a warm one rounds up); relationship tier adds a bias.
  Pure function, seeded, Node-verifiable.
- **D13 — The LLM phrases, never decides.** An opinion fact reaches the
  persona prompt (`llm.js`'s memory block) as text the model may voice. The
  fact's valence is the decision; the model's line is the decoration
  (invariant 1).

### Gig board

- **D14 — Reputation is per category.** `gigs.reputation` becomes
  `{ [category]: 0..100 }`. Categories: `admin` (no skill), `tech`,
  `writing`, `music`, `art`, `food`. A `MIGRATIONS` entry folds the old
  scalar into `tech` (it was only ever earned on `tech` gigs).
- **D15 — Templates carry an explicit `tier`.** The index-based mapping is
  deleted. Each template declares `tier: 0..4` and `skill`/`minSkill`
  honestly (`copy_edit` becomes `skill: 'writing'`). Board generation draws
  per category, sized by that category's tier, so a Novice writer with Elite
  tech rep sees Elite tech gigs and Novice writing gigs on the same board.
- **D16 — A no-skill floor always exists.** `admin` gigs (data entry, the
  café-shift-style flavor already in WorkHub's copy) need `minSkill: 0` on
  no skill and appear at every rep. A fresh player always has something to
  take; a specialist can ignore them.

### Works & catalog (the independent tracks)

- **D17 — One work record, four kinds.** `player.works[]` holds
  `{ id, kind: 'book'|'track'|'piece'|'menu', title, quality, createdDay,
  releasedDay, reach, lastPromotedDay, earned, meta }`. Quality is
  `skillMod(<kind's skill>, <kind's curve>)` at creation, fixed forever (a
  work is what it was when made). Reach is the live audience number that
  earns; it grows on release and promotion and decays (D18).
- **D18 — Reach fades without promotion; catalogs add.** Reach halves every
  `WORK_TUNING.decayHalfLifeDays` (default 14) since `lastPromotedDay`.
  Promote (a 30-minute block, energy per D4) resets the clock and adds a
  quality-scaled bump. Daily catalog income = Σ over works of
  `reach × quality × WORK_KINDS[kind].rateePerReach`, with a seeded daily
  spike roll (`spikeChance` default 0.02, ×10) so a back-catalog book can
  have a good week. Prolific beats one-hit: nothing caps the sum.
- **D19 — Release gates on skill AND category reputation.** Going
  independent in a kind requires `skillLevel ≥ WORK_KINDS[kind].minSkill`
  *and* `gigs.reputation[category] ≥ minRep`. Gig work is the bootstrap;
  independence is the graduation. A player may skip gigs and grind the skill,
  but reputation only comes from delivered work, so the gate holds.
- **D20 — Production is multi-block, like a gig.** Drafting a book,
  recording a track, finishing a piece: `blocks` of progress at
  `GIG_TUNING.progressPerClick × focus`, resumable across days, listed in
  WorkHub's new **Works** tab beside accepted gigs. Same `computeFocusMultiplier`,
  same energy.
- **D21 — Books: write → publish → royalties.** Kind `book`, skill
  `writing`, curve `cookQuality` renamed to a general `craftQuality` (same
  values; one curve, one lookup — the cooking reader is updated in the same
  commit). Published through a self-pub storefront screen in WorkHub (flavor
  name parked, Q1). Reading (bonding-side hobby on the bookshelf) awards
  `writing` research XP at 1/3 the sketchpad rate (D6).
- **D22 — Tracks: practice → record → release on Streamly.** Kind `track`,
  skill `music`. Recording requires a `recording_kit` decor item — a new
  Home-app catalog entry (decor-economy's shop, ~$180, `category:
  'bedroom'|'study'`) — placed in the room. Released to **Streamly** (the
  existing in-fiction streaming app, `id: 'stream'`), which gains a
  "Your releases" screen. Reuse the brand; don't invent a label.
- **D23 — Pieces: sketch → finish → sell or hang.** Kind `piece`, skill
  `art`. A finished piece is also an inventory item (`ITEM_DEFS`
  `player_art`) so it can be *hung* (Phase 16) instead of sold. Selling is
  one-off (art has no recurring listeners) — reach on a sold piece is 0; it
  earns once at `quality × WORK_KINDS.piece.salePrice(rep)`. Hanging keeps
  it in the catalog at reach 0 but makes it a `room_design` Notice subject.
- **D24 — Food: the home kitchen is DoorDrop's 13th vendor.** Kind `menu`
  (one work per listed dish), skill `cooking`. The player opts in from
  WorkHub's Works tab; a listing appears in `RESTAURANT_DEFS` **at runtime**
  (`playerKitchenDef(gameState)`, never a static entry) under the name the
  player types. Orders generate per day from `reach` (regulars) and are
  fulfilled by actually cooking through `cooking.js` — the dish's quality is
  the meal's quality. Unfulfilled orders by end of day lose reach.
- **D25 — A dirty kitchen hurts the rating.** Order volume is multiplied by
  the kitchen's `refreshRoomCleanliness` score (world.js) at fulfillment.
  `dirt.js`'s room dirt and the object-state cleanliness both already feed
  that score; this is a reader, not a new field.

### Chatter — audience model

- **D26 — Names (a label table, `CHATTER_LABELS`).** `friends` → "Friends"
  (the authored cast), `followers` → "Followers" (ghosts + cast who follow),
  `backers` → "Backers" (SFW support tier), `private` → "Chatter Private"
  (the NSFW tier). One table; renaming is a one-line change. "Afterhours" is
  unavailable (existing brand).
- **D27 — Additive over the existing feed.** `chatter.js`'s NPC-authored,
  event-sourced posting is unchanged. New: player posts carry `visibility`
  (`'public'|'private'`) and optional `media`; NPC posts gain `media` and
  `poll` kinds; authorship widens from residents to the whole known cast
  (D28). The header comment claiming residents-only and non-explicit "by
  design" is rewritten to describe what is actually true after Phase 9.
- **D28 — Three audience layers.**
  - **Cast**: every NPC with `contactKnown` (the external-world roster —
    exes, coworkers, friends who visit) plus residents. They post real
    content (text, image, poll) about house things, hobbies, food, work,
    dates, and the player. They can follow, react, comment, subscribe, and
    block, as decisions (D36, D42).
  - **Ghosts**: `profile.ghostFollowers` — a number, plus a seeded generator
    for handles that appear in notifications (`@xXfoxymoon22Xx liked your
    post`). No personality, no authored posts, no facts. They are the scale
    and the money, never the story.
  - **Subscribers**: cast or ghosts on `backers` or `private`. Tracked
    separately from followers because they cost money (D34, D42).
- **D29 — Appeal is decided, then decorated.** A post's `appeal` is a pure
  function: `WORK_KINDS`-style base by content kind × `skillMod(<craft
  skill>)` for craft content or `skillMod('social','socialEdge')` for
  lifestyle content × cadence bonus (posted within 3 days of the last) ×
  seeded roll. Ghost follower growth per post =
  `appeal × followers^0.6 × k`, with a `viralChance` (default 0.01, ×20).
  Ghost followers decay `ghostDecayPerDay` (0.005) on days with no post.
- **D30 — Pseudonymous by default.** Every profile (player and NPC) has a
  `handle` distinct from its name. The player picks theirs on first open.
  Creators see subscribers' *handles*, never names. Linking a handle to a
  person is a separate act (D44).

### Chatter — monetization

- **D31 — Chatter Private sits behind the existing mature gate and an
  explicit in-fiction opt-in.** Not offered at all unless
  `CONTENT_CONFIG.contentFlags.mature`. Even then, the player must enable it
  from their profile ("Open a Private page") — a stored `profile.privateOpen`
  flag with its own confirmation screen. Its content may only be as explicit
  as `image.js`'s three-condition gate allows for the same subject in the
  same state; the platform never adds a fourth condition and never bypasses
  the three.
- **D32 — Backers and Private are separate pools with a shared funnel.**
  Followers convert: `backers = floor(followers × convBackers(tier))`,
  `private = floor(followers × convPrivate(cadence))`. Ghost conversion is
  a number; cast conversion is a decision (D42). Two prices, both
  player-set within bounds (`backersPrice` [2, 15] default 5;
  `privatePrice` [5, 30] default 10).
- **D33 — Featuring another person is an Ask.** New leaf `$Feature` under
  the `photos` category — "can I post this with you in it," decided by
  `decide()` over the existing willingness gate for the content's
  explicitness level (a fully-clothed lifestyle clip is a hangout-tier ask;
  anything the three-condition gate would call intimate is
  `ASK_INTIMACY`-tier and routes through `willingnessFloorReasons` exactly
  as `ASK_INTIMACY` does). Refusal is final for that content. Personality
  can make an NPC *want* it (exhibitionist trait → positive delta), never
  bypass a floor.
- **D34 — Subscribers churn; billing is on the rent cadence.** Each billing
  cycle, subscriber counts are re-derived (D32) — a quiet creator loses
  payers. Income = `backers × backersPrice + private × privatePrice` credited
  per D3. Cast subscribers are billed individually and can lapse as a
  decision (D42).
- **D35 — Blocking is manual and per-NPC.** `profile.blocked: Set<npcId>`.
  A blocked NPC cannot follow or subscribe and does not perceive the
  player's posts through Chatter (D37). **No auto-suggest, no safety net** —
  the player can forget to block their sibling before opening a Private
  page, and that is by design. Blocking someone you don't know is subscribed
  is impossible by construction (D30, D44).

### Chatter — NPCs as creators, and the player as subscriber

- **D36 — Cast members follow and subscribe as decisions.** Per NPC, seeded
  per cycle: follow chance from affinity (`chatterAffinity`) + a lifestyle
  interest match; subscribe chance from follow + relationship tier +
  disposable slots (D42) + personality (a supportive partner is very likely
  to back you; a judgmental relative very unlikely to go Private). Pure
  `decide()`-shaped, never random-only.
- **D37 — NPCs perceive Chatter by using it.** An NPC who follows the player
  "sees" public posts on the days they scroll (their existing
  `scroll_phone` idle pastime is the hook) and Private posts only if
  subscribed. Each seen post can raise an opinion fact (D11). Blocked NPCs
  see nothing — but can still *hear* about it through gossip, which is the
  realistic gap.
- **D38 — Not every NPC is a creator.** Creator status is gated:
  `bible.creator = { active, kinds: [...], privateOpen }` set at cast
  generation from personality (exhibitionist / ambitious / broke — the
  `workMode: 'self_employed'` and low `incomeBand` leans raise it) at a base
  rate of ~15% for any account, ~5% for a Private page. Most NPCs just use
  Chatter socially, the way most NPCs don't do gig work today.
- **D39 — NPC creators grow offscreen.** Their followers/subscribers tick
  per cycle from a per-NPC appeal derived from their bible (no per-post
  simulation). Their posts appear in the feed through the existing NPC
  posting path with `media` where the kind calls for it, and their Private
  content is described, not rendered, unless the player subscribes (D41).
- **D40 — The player can subscribe to any NPC creator not blocking them.**
  Backers or Private, at that NPC's price, billed on the rent cadence from
  `player.money` through the existing charge path. An NPC blocks the player
  by decision at page creation (a private person blocks housemates; an
  exhibitionist blocks no one) — pure, seeded, personality-driven.
- **D41 — Subscribed Private content renders through the same gate.** A
  subscribed NPC's Private post is generated with `takePhoto`/`buildPhotoPrompt`
  under the three-condition gate for that NPC in a `naked`-state pose the
  NPC's own willingness would permit for a self-shot (the subject is
  consenting to their own content by construction; nobody else is in it
  unless *their* consent fact exists). Never more explicit than the gate.
- **D42 — Subscriptions cost NPCs something real: slots.** NPCs have no
  wallet (Evidence) and this plan does not add one. Instead, an NPC's
  discretionary subscription capacity is derived: `slots = f(incomeBand,
  spendingLean)` (low/frugal → 0–1, mid/neutral → 1–2, high/free_spender →
  up to 4). Subscribing to the player consumes a slot; a slot-limited NPC
  drops the lowest-affinity subscription first. The player's income from
  a cast subscriber is real money (D3). This is the cheapest thing that
  makes an NPC's subscription a *choice* rather than a freebie.

### Discovery & relationships

- **D43 — Recognition is a roll, not a reveal.** Linking a handle to a
  person — either direction — happens when a perceiver with the relevant
  memory encounters content with a *tell*: a room they've been in (matches a
  fact they hold), a distinctive body detail (`bible.appearance` marks), a
  voice line in a caption that matches a speech pattern. `recognitionChance`
  per exposure scales with intimacy of prior knowledge. On success, a fact
  `identity_link { handle, npcId | 'player' }` is written — and is
  transmissible like any fact. That is how "everyone knows" can happen
  without the game ever announcing it.
- **D44 — Discovery consequences run through opinions, not scripts.** "Your
  roommate found your Private page" is an `identity_link` fact plus a
  `chatter_private` opinion whose valence comes from D12. Pride, judgment,
  jealousy, curiosity are valence + personality; the LLM voices it (D13).
  No bespoke event chain.
- **D45 — Subscribing to someone else is a boundary topic, not infidelity.**
  A partner learning the player subscribes to another person's Private page
  is handled by a new Ask leaf `$SubscriptionTalk` under `boundary` — "are
  you okay with this" — resolved by that NPC's boundaries/personality,
  producing a boundary flag (the D13 flags engine from the actions plan).
  It does **not** route through `relationships.js`'s infidelity deltas;
  subscribing to content is not an act in the way cheating is, and folding
  it in would flatten a thing that is genuinely about individual norms. A
  partner who set a boundary and finds it crossed *then* takes the normal
  boundary-violation path.

### Aspirations

- **D46 — Hybrid: directions chosen, milestones emergent.** The player picks
  up to two **directions** from `ASPIRATION_DIRECTIONS`: `craft`,
  `connection`, `comfort`, `independence`, `notoriety`. Each direction has a
  pool of **milestone templates**; the engine surfaces the next one or two
  whose preconditions are met by current state. Milestones are pure
  predicates (`skillLevel('art') >= 5`, `works.some(kind==='book')`,
  `relationshipTier(anyone) >= 'partner'`, `roomsDesigned >= 3`,
  `profile.followers >= 10000`, `independenceWeeks >= 8`).
- **D47 — Chosen at the intro, changeable any time.** The player-creation
  flow gains one screen; the same choice lives in a new personal app
  **Compass** (`id: 'compass'`, `category: 'personal'`; name parked, Q2).
  Switching directions loses nothing — completed milestones stay completed,
  because they are facts about state, not about the choice.
- **D48 — Payoff is mood plus recognition.** `MOOD_PAYOUTS.aspirationMilestone`
  (0.10) per milestone, `aspirationDirection` (0.25) when a direction's
  pool is exhausted, and a Notice subject `aspiration` so NPCs in the room
  can react. Nothing else. No unlocks gated behind aspirations — they
  *report* progress, they never *gate* content.
- **D49 — No fail states, no expiry, no nagging.** A milestone sits until
  true. Compass shows at most two live milestones per direction. The tracker
  (`tracker.js`) does not list them — that surface is obligations, and an
  aspiration is not one.
- **D50 — Independence is measured, not declared.** `independenceIndex(gs)`
  (Phase 15): over a rolling four-week window, `(gig + catalog + platform
  income) ≥ (rent + utilities + groceries baseline)` computed *as if solo* —
  roommate rent offsets excluded. `player.independenceWeeks` counts
  consecutive qualifying weeks. The `independence` direction's final
  milestone is 8 consecutive weeks. This is the mechanical form of D1.

### Home

- **D51 — A designed room has a small comfort effect.** A room with a
  `ROOM_DECOR` entry (authored or player-made, D53) grants
  `HOME_TUNING.designedRoomMood` (0.02) as a mood impulse when the player
  rests or sleeps there, scaled by decor density. Undesigned rooms grant
  nothing. This resolves the home-design-studio plan's parked question
  narrowly: placement matters *a little*, never as an optimization target.
- **D52 — Rooms are opinion subjects.** Entering a designed room emits a
  `room_design` Notice subject for NPCs present; valence from decor density
  × style match to the NPC's `styleLean`. "Your place finally feels like
  somewhere people want to be" is an opinion fact, voiced by the LLM.
- **D53 — Player designs override, per room.** `world.roomDecorOverrides[roomId]`
  (a `ROOM_DECOR`-shaped array) takes precedence over the authored
  `ROOM_DECOR` entry and over auto-arrangement. A room is designed if either
  exists. The data shape is the studio's own — that plan's promise ("the
  same editor can become a computer app later without the data shape
  changing") is kept literally.
- **D54 — Hanging art is placement.** A `player_art` `DESIGN_SHAPES` entry
  (a framed rectangle whose fill is the piece's cached image if any, else a
  seeded abstract) placed through the Home app's designer, `meta.workId`
  linking it to the work. It is a `room_design` subject with the piece's
  quality as an extra valence input.
- **D55 — The in-game designer is the dev designer, moved.** Phase 17 ports
  `dev/designer.html`'s move/resize/rotate/snap/undo onto a Home-app screen
  operating on `roomDecorOverrides` for rooms the player has access to. The
  dev tool keeps existing for authoring `ROOM_DECOR`; the game gets the same
  editor for player rooms. Reshaping rooms (the tiling check) is **not**
  ported — structure stays with renovation.

### Process

- **D56 — New files.** `notice.js` (D9), `works.js` (D17–D25),
  `platform.js` (D28–D45; `chatter.js` keeps the feed), `aspirations.js`
  (D46–D50), `defs.works.js` (`WORK_KINDS`, `WORK_TUNING`, `CHATTER_LABELS`,
  `CHATTER_TUNING` additions, `ASPIRATION_DIRECTIONS`, `HOME_TUNING`). Each
  registers in **both** `index.html` and `loadgame.js`'s `ORDER` in the same
  commit (invariant 8). Load order: `defs.works.js` with the other defs;
  `notice.js` after `npc.js`/`signals.js`; `works.js` after `skills.js`/
  `computer.js`; `platform.js` after `chatter.js`/`notice.js`;
  `aspirations.js` last among logic files.
- **D57 — Harness naming.** `src/src/dev/verify/verify-acc-p<N>.js`, one per
  phase with pure logic; `node src/src/dev/verify/run-all.js acc-p` filters
  to them. Presentation phases verify on the live page and say so.
- **D58 — Save shape.** New persisted fields: `player.works`,
  `player.independenceWeeks`, `player.aspirations`, `world.computer.apps.gigs.reputation`
  (now a map), `world.computer.apps.social_feed.profile` (player),
  `npc.bible.creator`, `npc.chatter` (per-NPC follower/subscription state),
  `world.roomDecorOverrides`. Each is added with a lazy default *and* a
  `MIGRATIONS` entry where the shape changed (only `gigs.reputation` does).
  Enumerate them once, in `state.js`'s persisted-key list — never in two
  places (the `castWeb` scar).

### Resolved during implementation

- **D59 — `hobby_houseplant` is `bonding`.** (Phase 1, 2026-09-18.) The
  Phase 1 block named guitar/sketchpad/bookshelf as mastery and records/
  console as bonding and did not mention the plant. D6 makes the mode a
  binary and every hobby must declare one; the plant has no craft skill
  to master and nothing to perform, so it is the no-XP side by
  elimination. Not a statement that anyone bonds over watering it — if a
  gardening skill is ever added, it becomes mastery then.
- **D60 — The hobby mode is consumed at construction, not stored on the
  def.** (Phase 1.) `createHobbyAction` reads `opts.mode` to decide whether
  `def.skill` exists and throws on every inconsistent spec (missing/unknown
  mode, mastery without a `SKILL_IDS` skill or with `xp ≤ 0`, bonding with
  a skill). No `def.hobbyMode` / `def.mode` field is written — invariant 6.
  A later phase that needs the mode at runtime (Phase 6's stereo-play
  emission on the record-player path, Phase 14's milestone pools) adds
  `def.hobbyMode` together with its reader, in the same commit.
- **D61 — One category table; templates are guarded at load.** (Phase 2,
  2026-09-18.) `GIG_CATEGORIES` in `defs.computer.js` is the single ordered
  list of `{ id, label, skill }`; the reputation map's keys
  (`defaultGigReputation`), the board's draw/group/filter order, the chip
  labels and each category's craft skill all derive from it — never a
  second enumeration. `GIG_TEMPLATES` is checked at load (the
  `createHobbyAction` posture, D6): an unknown category, a `skill` that is
  not the category's craft, a no-skill template with `minSkill > 0`, or a
  `tier` outside `GIG_REPUTATION_TIERS` throws at startup. Food's craft
  skill is `cooking` (the plan's category is `food`; the skill id was never
  going to be renamed).
- **D62 — Board size is per category; the refresh roll is not.** (Phase 2.)
  `generateGigsForDay` draws each category the player qualifies for at
  that category's tier `boardSize` and `payMult`, in `GIG_CATEGORIES`
  order, but keeps ONE ~70% refresh roll for the whole board (D2 — one dry
  spell, not six). A fresh player therefore sees exactly the old board
  (the admin slice, 3–4 gigs); every craft reached at `minSkill 1` adds a
  slice. The tier table's numbers were not retuned.
- **D63 — Promotions are per category and upward only.** (Phase 2.)
  `bumpGigCategoryRep` reports `tierUp: { from, to, category }` only when
  the tier index rose; the UI names the category ("Competent in
  Writing"). The pre-Phase-2 check fired on any tier-name change, so a
  late delivery that dropped a tier announced a "milestone" — gone.
- **D64 — The board filter is render-owned, not saved.** (Phase 2.) Which
  chip is lit is `_gigBoardFilter` in `render.computer.js`
  (`setGigBoardFilter`/`gigBoardFilter`), the `_actionNavStack` precedent
  — not a field on `gigs` (invariant 6 has nothing to read it for after a
  reload). One value serves both devices.
- **D65 — The opinion's text is the phrased line, written at notice time.**
  (Phase 3, 2026-09-18.) The D13 wording table (`OPINION_LINES`, notice.js,
  keyed by kind and valence band) is applied when the fact is built, so
  the persona prompt's `[Memories — facts]`, the chronicler's known-block,
  `factTopicPhrase` and `derivePlayerModel` all read it with no renderer
  change — `llm.js` is untouched. Lines are claim-style ("the player's
  guitar playing has clearly improved"), like every other fact, so a
  told_by copy reads correctly as a weaker belief.
- **D66 — Raise candidacy is `factRaiseScore`, not `ruminate`.** (Phase 3.)
  The plan's rumination.js bullet named the wrong file: `ruminate` runs
  inference and the open-question lifecycle and lists nothing. An opinion's
  "weight from |valence|" is `opinionRaiseWeight` (notice.js), read by
  npc.js's `factEmotionalWeight` for `kind === 'opinion'` — the real path
  `pickFactsToRaise` (the npc_chat gossip leg) scores. rumination.js is
  untouched; `ruminate` is verified to run over opinion holders unchanged.
- **D67 — Level-up quality is `0.3 + 0.07 × level`.** (Phase 3.) A crossing
  is judged by the level reached, not by the act of crossing: level 1 reads
  0.37 (mildly negative to a neutral onlooker, positive to a warm one),
  level 3 is neutral, 10 is 1.0. Other kinds pass `subject.quality`
  explicitly (a work's `craftQuality`); unknown → 0.5.
- **D68 — One opinion per subject per NPC; a secondhand copy counts.**
  (Phase 3.) `holdsOpinionOn(npc, key)` gates the write; an NPC told about
  a subject does not later form a first-hand opinion of the same subject
  (re-witnessing is `receiveTransmittedFact`'s confidence up-route, not a
  second record). The next level / edition is a new key.
- **D69 — Stealth level-ups are never noticed.** (Phase 3.) `awardSkillXp`'s
  `gameState` arg is passed only by the witnessed sites (effects.js's
  `applyAddSkillXp`, computer.js's `attendLesson`, puzzles.js); the stealth
  sites (stealth.js ×4, boundary.js, ui.js's phone snoop) reward a *clean,
  unseen* act and pass nothing — a roommate cannot form an opinion of how
  quietly you rifled their drawer.
- **D70 — `OPINION_PERSONALITY` is the one sensitivity table.** (Phase 3.)
  Keys, as shipped: temperament `bias { warmth 0.25, openness 0.10 }`,
  `sensitivity { conscientiousness 0.30, volatility 0.20 }`; trait tags
  from `bible.personality.traits` + `coreTrait` (never `hiddenTrait`):
  `hard` cynical/blunt/perfectionist/competitive/sarcastic/cold/critical
  (−0.15 each), `soft` warm/nurturing/generous/easygoing/idealistic/
  supportive (+0.15 each), both capped ±0.30, `craft` creative/curious
  (+0.10 on craft kinds); relationship `(affection − tension) × 0.20 +
  respect × 0.10`; jitter ±0.08 seeded on (world seed, `bible.genSeed`,
  subject key). Phases 10, 13 and 16 read this table; none adds a second.
- **D71 — The catalog tuning is `WORKS_TUNING`.** (Phase 4, 2026-09-18.)
  The plan's `WORK_TUNING` collides with config.js's existing
  `WORK_TUNING` (the focus floors and phone multiplier every work block
  reads — a duplicate `const` refuses to load). Plural after `works.js`.
  Every later mention of `WORK_TUNING` in this plan's phase blocks means
  `WORKS_TUNING`.
- **D72 — The daily credit is whole-dollar, carried, and idempotent.**
  (Phase 4.) `player.money` is an integer everywhere, so
  `catalogIncomeForDay` credits `floor(carry + total)` through
  `EARN_MONEY … catalog` and keeps the fraction on `player.catalogCarry`
  (a $0.40/day back-catalog title still pays every few days). It credits
  once per day (`player.catalogPaidDay`, the `lastRefreshDay` precedent):
  a re-processed rollover previews the same numbers and pays nothing
  twice. The tracker's Catalog line shows the rounded day value; the
  credit is its integer part.
- **D73 — Fade before pay.** (Phase 4.) `processWorksForDay` runs
  `decayWorks` and then `catalogIncomeForDay`, so a promotion earns at
  full strength for exactly the days it held, and the tracker's post-
  rollover preview matches what was paid. Decay is per work, keyed on
  `lastDecayDay` (× 0.5^(days/14)), idempotent within a day.
- **D74 — The self-publishing storefront is "Inkwell".** (Phase 5,
  2026-09-18; Q1's default, used as instructed.) One string,
  `INKWELL_LABEL` in `defs.works.js`; the WorkHub screen id is `inkwell`.
  No collision with WorkHub / Nile / Streamly / DoorDrop / ChefBook /
  AfterHours / Chatter / Brine*.
- **D75 — A release notices the room.** (Phase 5.) `releaseWork` emits the
  `work` subject for every kind through `noticeSubject` (in-room
  perceivers, at the work's own quality, category = the kind's gig
  category) and returns `noticed`. Platform perceivers — "the day a cast
  NPC reads it" — wait for Phase 10's hook, as the plan's Phase 5 block
  says. Later tracks get this for free; they add nothing.
- **D76 — Writing is chips + a modal, not an ACTION_DEFS entry.** (Phase 5.)
  The plan's `self.write` action needs a text box (the title), which the
  effects pipeline has nowhere to put — the note-writing precedent. So:
  `Start a Manuscript` / `Write — "<title>"` Here chips (devices bucket,
  offered when a `desk` or `desktop_computer` is in the room),
  `openManuscriptModal` → `doStartManuscript` (start + first block), and
  `doWorkBlock(..., { offline: true })` for the desk (no connectivity
  gate; the WorkHub route keeps it). Drafting is ungated — D19 gates
  publishing — and the modal states the projected finish quality.
- **D77 — Recording starts at music ≥ `WORK_KINDS.track.minSkill`, at a
  placed kit.** (Phase 6, 2026-09-18.) The plan's Phase 6 block asks for
  the start gate (unlike drafting); the chip appears only when a
  `recording_kit` object is placed in the room AND the skill is met. The
  engine's own requirement (`workRequirementMet`) is "placed anywhere",
  re-read at start and at release. Same chip + `WORK_START_COPY` modal
  shape as writing (D76) — `openWorkStartModal(kind)`.
- **D78 — The stereo-play emission is the player's listen, trusted-only.**
  (Phase 6.) NPCs never operate sound devices (no drive; `music` is a
  standing signal from a device's own state), so "an NPC plays it" cannot
  exist. The hook is the one the plan names — the `hobby.record_player`
  action — which appends `PLAY_OWN_TRACK <room>` (an `llm: false`
  EFFECT_DEFS entry) when a released track exists; `works.js`'s
  `playOwnTrack` rolls `WORKS_TUNING.stereoPlayChance` (0.35) seeded per
  moment and, on a hit, notices the room with the `work` subject. The
  narrator never decides what is on the stereo.
- **D79 — Painting starts at art ≥ `WORK_KINDS.piece.minSkill`, at the
  sketchpad.** (Phase 7, 2026-09-18.) The plan's "at the gate, the player
  can finish a piece": the `Paint a Piece` chip needs a `hobby_sketchpad`
  object in the room and art ≥ 3 (no easel exists in any catalog). The
  same chip + `WORK_START_COPY` modal shape (D76/D77). A finished piece is
  a `player_art` stack (`meta.workId/title/quality`) AND a work record;
  the bag labels a titled instance "Painting: <title>".
- **D80 — Piece imagery is the seeded swatch (Q5 resolved).** (Phase 7.)
  `bookCoverSwatch(work)` — a `hashToColor` gradient of id + title with
  initials — is the one cover for books, tracks and pieces. No
  `generateImage` call; a live image per piece is an optional polish
  behind the camera's quota discipline, owed, never required. Selling is
  a piece's release (`sellWork`: the D19 gate, `salePrice(q, art rep)`
  once through `EARN_MONEY`, the item leaves the bag, the record stays
  released at reach 0); `releaseWork` refuses pieces. Hanging is Phase 16.
- **D81 — `player.kitchen` is the listing.** (Phase 8, 2026-09-18.)
  `{ name, listedDay|null, orders[], lastOrdersDay, ratingSum, ratingCount }`
  on the player record with a lazy default (`ensurePlayerKitchen`); each
  listed dish is a released `menu` work (`meta.recipeId`), so the catalog
  and the milestone predicates see dishes like any other work. The listing
  reaches DoorDrop only through `playerKitchenDef(gameState)` /
  `restaurantVendorsForDisplay` at read time — `RESTAURANT_DEFS` never
  holds it, its menu is empty (you cannot order from yourself), and
  `countRestaurantsOpenAt` keeps reading the authored roster.
- **D82 — Orders are filled from plates, not by a special cook.** (Phase
  8.) `cooking.js` is untouched: the player cooks a recipe exactly as
  always; `fulfillKitchenOrder` hands over one serving of any matching
  plate (bag, then fridge/pantry/freezer — `kitchenSources`' order), pays
  `WORK_KINDS.menu.orderPrice(dish quality, food rep)` through
  `EARN_MONEY`, and rates the order at the plate's quality. Filling an
  order is the dish's promotion (`+ regularGain × quality` reach, the fade
  clock reset); a missed order costs `unfulfilledReachLoss` of the dish's
  reach at rollover. Cleanliness scales the morning's order VOLUME (D25),
  read from WORLD's `refreshRoomCleanliness('kitchen')`.
- **D83 — `noticeSubject` takes explicit `perceiverIds` for consumed
  subjects.** (Phase 8.) A housemate who ordered a dish and ate it
  perceived it by the eating — `via: 'consumed'`. The only producers
  allowed to name perceivers are ones where the perception IS the act;
  this is not a way around D10's in-room/platform rule.
- **D84 — Cast NPCs order from the kitchen (Q4 resolved: yes, lightly).**
  (Phase 8.) Each resident rolls `residentOrderChance` × cleanliness per
  listed dish per day; the order carries `customerId`, fills exactly like
  a ghost's, and notices that NPC when filled (D83). Ghost orders remain
  numbers (invariant 9).
- **D85 — The handle prompt is the feed itself.** (Phase 9, 2026-09-18.)
  With no handle, `renderChatterFeed` shows a "Pick a handle" panel in
  place of the composer; `setChatterHandle` normalises free text
  (leading `@` and whitespace stripped, runs of whitespace → `_`, 24
  chars) and refuses only an empty string or a cast member's own handle.
  `postChatterAsPlayer` refuses without a handle — pseudonymity is
  structural, not a UI nicety.
- **D86 — Cast posts read "@handle · Name".** (Phase 9.) Housemates and
  known contacts are not a mystery to the player in person, so the feed
  shows both; the handle alone is what a ghost, a stranger or Phase 13's
  recognition roll sees. `npcChatterHandle` is `word_nam##` (an interest
  or trait word, a name fragment, two digits) seeded on `genSeed`; ghost
  handles are `word+word+digits` or `xX…Xx` — the two shapes never
  coincide, and `ghostHandle(seed, taken)` re-salts against the cast set.
- **D87 — Blocking is mutual.** (Phase 9.) `blockNpc` hides the player's
  posts from the NPC (D35's rule) AND the NPC's posts from the player's
  feed, prunes them from the follower/backer/private lists, and flips
  `followsPlayer` off; `castFollowDecision` returns chance 0 for a blocked
  NPC. Still no auto-suggest and no safety net.
- **D88 — Appeal's multipliers are normalised; growth starts from zero.**
  (Phase 10, 2026-09-19.) D29's craft multiplier is
  `craftQuality(level) / craftQuality(10)` — a level-10 post reads at
  exactly its `appealBase`, a level-0 one at 0.3 of it — and the lifestyle
  multiplier is `1 + socialEdge` (the social skill's first reader). Growth
  uses `(followers + 1)^growthExp` so the first post ever gains something.
  `growthK` is 0.5, chosen by measurement (Handoff): D29's curve has no
  ceiling, and 0.5 puts a rent-covering following about six months of
  daily posting at skill 6+ away, never predictably (one viral roll moves
  a 30-day result 4×).
- **D89 — Platform perception runs at rollover over yesterday's scrolls.**
  (Phase 10.) The rollover into day D treats every public player post
  inside `CHATTER_TUNING.reactionWindowDays` as a `chatter_post` NOTICE
  subject for each following, unblocked NPC with a `scroll_phone` event on
  day D−1 who has not seen it (`npc.chatter.seenPostIds`); the opinion
  fact is dated D−1. The plan's "scrolled today" is read as "the day that
  just ended" — today's scrolling has not happened at rollover.
  `platformPerceivers` stays a function (invariant 6); `platformPerceiversFor`
  in platform.js is its body.
- **D90 — Ghost comments exist (Q3 → yes).** (Phase 10.) A public post at
  or above `ghostCommentMinAppeal` draws, at `ghostCommentChance`, one
  comment from `CHATTER_GHOST_COMMENTS` stored as `{ author: null, ghost:
  true, seed, text }`; the handle is `ghostHandle(seed)` at render. No
  fact, no memory, never a person — D28's "ghosts are numbers" holds; the
  comment is a number's worth of texture.
- **D91 — Conversion is price-sensitive.** (Phase 10.) D32's
  `convBackers(tier)` is `convBackers × (backersPriceDefault /
  backersPrice)^priceElasticity` (0.5): at the default price it is
  `convBackers` exactly; the dearest price converts ~58 % as many but
  nets ~1.7× the money. The price is a trade-off between the Backer
  count (a number later phases read) and income, not a free multiplier.
  The private tier gets its own `convPrivate(cadence)` in Phase 11.
- **D92 — `$Feature` is about an existing photo, tiered by its stamped
  level, and consent gates every posting.** (Phase 11, 2026-09-19.) The
  leaf is picker-first over the camera roll (only photos the NPC is in —
  `subjectNpcIds`), the pick riding as the structured payload. image.js
  stamps `level` on every record at capture — `'intimate'` when the mature
  flag is on and anyone in the frame is in a naked state (the gate's two
  state conditions, whether or not the prompt opted into the layer), else
  `'lifestyle'`; older records read `'moment'` → intimate. Floors
  (`willingnessFloorReasons`) refuse both tiers in ASK_INTIMACY's own
  words — a sleeping target gets `floor_asleep`, never the affection
  ladder's wake attempt (you do not wake someone to ask about a photo);
  the intimate tier then reads the `'default'` willingness bar, the
  lifestyle tier the hangout score, either with a `(npcDisinhibition −
  0.5) × featureDisinhibition` delta that never passes a floor. The answer
  is a `consent_feature` fact `{ ref: photoId, granted, level }` — a
  refusal is final for that photo. `postChatterAsPlayer` refuses an image
  whose cast subjects lack a granted fact, public or private: featuring
  another person is an ask, full stop.
- **D93 — `convPrivate(cadence)` defined.** (Phase 11.) Private (ghost) =
  floor(followers × `convPrivate` × cadence × the D91 price term), cadence
  = min(1, private posts in the last `privateCadenceWindowDays` /
  `privateCadenceTarget`), `privateCadenceFloor` when the page has only
  older posts, 0 for a page with nothing on it. A Private page earns its
  conversion by being posted to.
- **D94 — One slot, one tier; slots come back.** (Phase 11.) An NPC's
  `subscribes` is a single value: a Private decision on a current Backer
  is an upgrade on the slot already held (they leave the Backers pool);
  `castSubscribeDecision` never re-adds a Private subscriber to Backers.
  Blocking, a cold lapse, and the page closing all return the slot —
  `blockNpc` now does too (a Phase 10 leak: the slot stayed spent).
- **D95 — A creator's numbers are state, not bible.** (Phase 12,
  2026-09-19.) `bible.creator` holds who they are (`active`, `kinds`,
  `privateOpen`, the two prices, `blocksPlayer`), derived once and seeded
  on `genSeed`; their following (`ghostFollowers`) and the tick watermark
  live on `npc.chatter` beside `seenPostIds`, seeded to a head start on
  first read. The plan's shape put `ghostFollowers` on the bible; a number
  that moves every cycle does not belong on a character sheet.
- **D96 — An unpaid subscription lapses.** (Phase 12.) On the rent-cadence
  charge, a line the player cannot cover is cancelled unpaid (the
  housekeeper's visit is postponed; a paywall doesn't wait), and so is a
  line to a creator who has since blocked the player or been blocked. The
  log says so; nothing is owed.
- **D97 — NPC private posts are listed, not hidden; no NPC-to-NPC
  subscriptions.** (Phase 12.) A creator's private post is a normal feed
  post with `visibility: 'private'`, rendered to the player as a locked
  card (caption, price, the subscribe button) unless they pay for that
  tier — D39's "described, not rendered". NPCs do not subscribe to each
  other, so an NPC's slots (D42) are only ever spent on the player and
  the "drops the lowest-affinity subscription first" rule has nothing to
  trigger it in this plan.
- **D98 — Recognition runs one way, on four tells.** (Phase 13,
  2026-09-19.) An NPC links the PLAYER's handle; the player already sees
  `@handle · Name` for everyone they know in person (D86), so there is
  nothing for them to work out. The tells are a room they have stood in
  (the player's own room stronger), the player's face in a selfie, an
  explicit selfie for someone at the intimate phase, and being in the
  photo (certainty); they OR together and scale with prior knowledge
  (affinity), capped. The plan's "voice line in a caption" tell is not
  built — the player has no speech bible to match against. The fact is
  `identity_link { handle, who: 'player', source }`, `recognition`-tagged
  (raisable, never posted to Chatter), and rides `receiveTransmittedFact`
  with its structure.
- **D99 — "A room they've been in" is a memory of place the sim writes.**
  (Phase 13.) `npc.flags._roomsSeen` — a capped id list appended in
  `resolveBatch` on the same change-of-room test the boundary check uses —
  not a fact and not a query over world.events. The `subscription`
  NOTICE subject is perceived by the creator subscribed to, and only when
  they already hold the link to the player's handle.
- **D100 — The subscription boundary is player-bound, and the crossing
  lands when the drawer learns.** (Phase 13.) `$SubscriptionTalk`'s "not
  okay" writes `BOUNDARY_RULE_DEFS.no_private_subscriptions` onto
  `npc.flags._playerBoundaries` (the mirror of `_boundaryRules`). A Private
  subscription is the player's act against it, enforced by
  `checkPlayerBoundary` at the moment the NPC learns of it — at subscribe
  time through NOTICE if they know the handle, or by gossip through
  `maybeBoundaryUponFact` (wired beside `maybeJealousUponFact` at both
  transmission sites) — once per subscription: tension, a `grievance`-
  tagged fact and a grievance the apology leaf can answer. Never
  relationships.js's infidelity deltas (verified by spy).
- **D101 — The aspirations app is "Compass" (Q2).** (Phase 14,
  2026-09-19.) `COMPASS_LABEL` in `defs.works.js` is the one string; the
  app def's own label is the same word for its tile.
- **D102 — What the predicates read.** (Phase 14.) The plan's
  `relationshipTier(anyone) >= 'partner'` is `relPlayer.conversationPhase
  === 'intimate'` — the player side has phases, not a partner status;
  "roomsDesigned" is rooms holding ≥ 2 placed catalog pieces until Phase
  16 defines a designed room; every `done` is a fact only the journey
  makes true (a fresh game satisfies none of them by default — "every
  utility on" and "nothing unresolved" were replaced by "hang your own
  art" and "mend a rift" for exactly that reason); the helpers never call
  an ensure* backfill, so a predicate can run against any save without
  writing to it.
- **D103 — Completion is checked at rollover, for the chosen directions
  only.** (Phase 14.) A milestone reached mid-day is logged and paid at
  the next rollover; choosing a direction whose milestones are already
  true completes them then, with their payouts — a deliberate, small
  catch-up rather than a silent one. The intro's "one screen" is a section
  of generic toggle rows on the existing options screen (`menu.js`'s
  `aspirationOptionsSections`), so New Game and Compass share one rule set.
- **D104 — The gig pay rescale (the economy audit).** (Phase 15,
  2026-09-19.) Measured with the machinery this plan built, the gig board
  paid a Novice grinding admin work four times a solo penthouse lease by
  week 4: templates paid $35–220 a block AND the reputation tier multiplied
  it by up to 5× — reputation counted twice, and invariant 2 of the economy
  plan had never held. `GIG_TUNING.payScale 0.3` (one dial, in the payout
  formula), the tier multiplier compressed to [1 … 1.7], and the tier-2–4
  template rates compressed to 85–120 a block. After: gigs alone peak at
  0.93 of the solo cost at a daily Elite grind and never qualify; a catalog
  alone is worse than gigs (0.44); the full stack qualifies in months
  (creator week 21, stacked writer week 28). The one change in this plan
  made against the user's stated invariants rather than its own text —
  deliberately reversible from the dial.
- **D105 — The ledger, the solo cost, the cadence.** (Phase 15.)
  `applyEarnMoney` — the one credit verb — writes `player.incomeLog`
  `{ day, amount, reason }` (capped); `ECONOMY.independence` names the
  independent reasons (gig / gig_partial / catalog / chatter / art_sale /
  kitchen — never a loan, a debt collected or a rent surplus), the
  four-week window, a groceries baseline of 70 a week (no such constant
  existed) and the ledger horizon. The solo cost is `ECONOMY.rent.total` ×
  weeks (never `computeRent`'s playerShare) + the even-split utilities at
  base for one resident + the personal bills + groceries ≈ $8,090 per four
  weeks. On each rent-cadence day the window ending YESTERDAY is judged:
  qualifying → `independenceWeeks + 1`, failing → 0 (D50's "consecutive",
  literally). The only surfaces are the rollover's two lines and Compass's
  three milestones — the tracker stays obligations-only (D49).

---

- **D106 — "Designed" is three sources through one reader; placed objects
  stay the one player-placement store.** (Phase 16, 2026-09-19.) The
  decor-economy plan had already made the player's placements REAL room
  objects with a `pos` (`placeDecorItem`, so anchors, cleanliness and
  signals find them) and had shipped a Studio screen over them; the design
  session's D53 did not know. Rather than a second store, defs.design.js's
  `roomDesignBase` (override → authored → null), `roomPlacedDecor` (the
  pos-objects as placements) and `decorFor` (base ∪ placed) are the one
  reader; `world.roomDecorOverrides` exists exactly as D53 shapes it, is
  read by the renderer, the anchor resolver, comfort, opinions and Compass,
  and is written by Phase 17. The packer no longer claims a wall for a
  pos-object (it draws at its pos — closing the drawn≠walked gap the
  liveliness plan's invariant 2 had for placed decor). The authored pool
  room is designed for comfort (D51 says "authored or player-made") but
  `roomPlayerDesignCount` is 0 there: it is never an opinion subject about
  the player and never counts for Compass.
- **D107 — The room opinion: shape, version, supersession.** (Phase 16.)
  `roomDesignQuality = base + density × densityWeight + density ×
  styleMatch × styleWeight + (mean hung quality − 0.5) × art`
  (`HOME_TUNING.opinion`); styleMatch is the room's `DESIGN_STYLE_TAGS`
  weights summed over the NPC's `occupation.styleLean` (0.5 with no lean or
  no tags) — one vocabulary matched against itself, no second taste
  system. The subject key's version is `roomDesignVersion`: the shape
  multiset plus the hung workIds, never coordinates. A new version's
  opinion marks the NPC's older room_design facts on that room `valid:
  false`. The producer (`noticeRoomDesign`) runs on the player's arrival
  (`doMove`) and on hang / take-down, and emits the transient only when an
  awake NPC standing in the room has not judged the current version.
  `subjectQuality` grew `(subject, npc, gameState)` for this one kind.
- **D108 — The comfort's write sites.** (Phase 16.) `designedRoomComfort`
  (pure) × `applyDesignedRoomComfort` (world.js, the one push site) from
  UI's `doSleep` and from `executeAction` for verbs flagged `restful`
  (`self.nap`, `self.relax`) — declarative like `skill`/`meters`. Nothing
  is pushed for an auto-arranged room (no zero entries). `HOME_TUNING`
  lives in defs.works.js per D56, not config.js.
- **D109 — A hung piece is a room object, not an override entry.** (Phase
  16.) `hangWork` mints a `player_art` object with `pos` = the wall slot
  (`wallSlotsFor`: one slot per OUTER wall of the largest rect, interior
  seams excluded, `HOME_TUNING.wallSlot`), `meta { workId, title, quality,
  slot, placedDay }`, exactly `placeDecorItem`'s instance shape, so the
  Compass predicate that already read "a room object with defId
  player_art or meta.workId" is literally true and Phase 17's Studio can
  move it like any placed object. No D19 gate, no money; the work stays
  unreleased at reach 0 and `takeDownWork` returns the stack with its meta
  so it can sell later. The canvas draws the D80 swatch through
  `place.fill` on the `art` part class.
- **D110 — normalizePlacement is the one snap/floor/rotation/bounds choke
  point, shared byte-for-byte with the dev tool.** (Phase 17,
  2026-09-19.) `defs.design.js`'s `normalizePlacement(pos, { snap,
  gridSize, minSize, rotStep, roomId })` + `placementFitsRoom` replace the
  inline `G()`/`Math.max(3, …)` snap math the Home Studio and
  `dev/designer.html` each had their own copy of; passing `roomId` adds a
  reject-outside-the-room check (all four corners of the unrotated box
  must land inside the union of `ROOM_LAYOUT[roomId]`) that neither copy
  had before. `computer.js`'s `placeDecorItem`/`moveDecorObject` — both
  pre-existing, decor-economy-plan functions — now run every pos through
  it and refuse a placement normalizePlacement rejects; previously they
  only floor-checked size, so a piece could be dragged (or scripted) clear
  outside its room. Since `dev/designer.html` has no module system,
  "shared, not duplicated" means `dev/sync-designer.js` now also injects
  the LIVE function's `.toString()` between two markers in the HTML
  (alongside its existing SHAPES/SHIPPED_DECOR sync), so the two are
  byte-identical by construction rather than by discipline;
  `verify-plan.js` §8 grew two checks that fail if a hand-edit or a
  forgotten sync lets them drift. The dev tool never passes `roomId`, so
  authoring (e.g. the pool's pieces) keeps its original freedom to place
  outside a single rect. **Found and fixed in passing:** `sync-designer.js`'s
  SHAPES/SHIPPED_DECOR regex assumed bare `\n`; `designer.html` is checked
  out CRLF on this machine, so that sync had been silently a no-op for an
  unknown number of past sessions — the file's SHAPES table was stale
  until this session's fix (`\r?\n`). Unrelated to this plan's design, but
  found only because a newly added shape (`desktop_computer`, below)
  wasn't reaching the file despite the script reporting success.
- **D111 — Arranging a room's base furniture snapshots the auto layout
  into the SAME override array, by defId; an unshaped fixture is left out,
  matching the shipped pool room's own gap.** (Phase 17.) `computer.js`'s
  `startRoomArrange(gs, roomId)` snapshots `defs.design.js`'s
  `roomAutoBaseCandidates` (the room's `resolveAutoPlacements` output,
  reshaped to `{ shape, defId, x, y, w, h, rot: 0 }`) into
  `world.roomDecorOverrides[roomId]` — refusing (returning the existing
  array, `already: true`) if an override already exists, never silently
  overwriting one. `removeRoomArrangePlacement`/`resetRoomArrange` are the
  other two writers; `resetRoomArrange` **deletes** the key rather than
  setting `[]`, because `roomDesignBase` treats an empty array exactly
  like no override (D53) — `[]` and absent must stay indistinguishable or
  "reset" and "arranged-but-empty" would silently collide.
  `baseFurnitureShape(defId)` resolves a defId to a drawable
  `DESIGN_SHAPES` key directly or through the new `BASE_FURNITURE_SHAPES`
  alias table (`sink_kitchen`/`sink_bathroom` → `sink`, `coffee_table_lr` →
  `coffee_table`, `weight_set` → `weight_rack`, etc., 15 entries); a
  footprint-bearing defId with neither is skipped — it simply stops being
  drawn once the room is arranged, no crash, no fallback render. This is
  not a new gap: the shipped pool room already never draws `pool_pump` or
  `pool_loungers` (ROOM_DECOR.pool_room has no entry naming either), so an
  object with no authored/overridden placement quietly falling back to a
  centroid stand-point (`resolveObjectStandPoint`) was already the
  accepted behavior D106 built on. One new shape was added where the gap
  would otherwise have been highly visible: `DESIGN_SHAPES.desktop_computer`
  (every player bedroom has one). Kitchen fixtures with no shape (freezer,
  pantry, coffee_maker, trash_kitchen, dishwasher, microwave — 6 of 10)
  are left uncovered deliberately; extending coverage further is
  owed polish, not a blocker.
  **The Handoff's parked question is resolved as recommended:** an
  override snapshot does NOT absorb placed objects — `roomPlacedDecor`
  (bought decor, hung art) stays the untouched pos-object store;
  `roomDesignBase`'s override is base-layout-only. `decorFor` is still
  base ∪ placed either way, so nothing about what's drawn changes; only
  what a "start arranging" snapshot captures does.
- **D112 — Undo/redo is one stack per room+editing-mode, and deliberately
  does not cover placeDecorItem/pickUpDecorObject.** (Phase 17.)
  `homePlacementUI.undo[`${mode}:${roomId}`] = { stack, redo }` in
  `ui.computer.js`, each entry a snapshot of exactly what that mode can
  mutate — decor mode: `{ [objId]: pos }` for every pos-carrying object in
  the room; base mode: a deep clone of `roomDecorOverrides[roomId]` (or
  `undefined`). `homePlacementPushUndo` fires before every mutation
  (drag start, remove, start-arrange, reset); `onHomePlacementMouseUp`
  pops the entry back off if nothing actually changed, so a click that
  isn't a drag leaves no stack entry. Placing a bag item and picking one
  up move a stack in or out of `player.inventory` too — undoing a move is
  free to give back, undoing a purchase-shaped action is not obviously
  free, so those two keep their pre-existing explicit Cancel / re-place-
  it-yourself affordances instead of joining the undo stack.

## Data model

### Skills (Phase 1)
```js
// config.js
const SKILL_IDS = ['cooking','cleaning','stealth','tech','fitness','social','art','writing','focus','music'];
// skills.js — payMultiplier deleted; cookQuality renamed craftQuality (values unchanged)
const SKILL_CURVES = { timeReduction, craftQuality, cleanEfficiency, stealthSuccess, socialEdge };
// defs.actions.js
createHobbyAction(defId, label, phrases, { mode: 'mastery'|'bonding', skill?, xp? })
```

### Gig board (Phase 2) — as shipped 2026-09-18
```js
// defs.computer.js — the one category table (D61); rep keys, board order,
// filter chips and each category's craft skill all derive from it
const GIG_CATEGORIES = [ { id: 'admin', label: 'Admin', skill: null }, { id: 'tech', … 'tech' },
  { id: 'writing', … 'writing' }, { id: 'music', … 'music' }, { id: 'art', … 'art' }, { id: 'food', … 'cooking' } ];
const GIG_CATEGORY_IDS, GIG_CATEGORY_BY_ID, GIG_TEMPLATES_LIST;   // derived
// world.computer.apps.gigs
{ board: [], accepted: [], lastRefreshDay: 0,
  reputation: { admin: 0, tech: 0, writing: 0, music: 0, art: 0, food: 0 } }  // defaultGigReputation()
// defs.computer.js — a template (24 of them; a load-time guard throws on a bad one)
{ id, label, category: GIG_CATEGORY_IDS[i], skill: null|SKILL_ID (the category's craft), minSkill, tier: 0..4,
  blocksRange, deadlineRange, basePayoutPerBlock, clientPool }
// state.js MIGRATIONS.world { from: 5, to: 6 } → computer.js normalizeGigsAppState:
//   reputation number → { tech: number, ...zeros }; board/accepted[].category re-stamped from the template
// readers/writers: gigCategoryRep(gigs, cat) / bumpGigCategoryRep(gigs, cat, delta) → { before, after, tierUp }
```

### Notice & Opinion (Phase 3) — as shipped 2026-09-18
```js
// notice.js
noticeSubject(gs, { kind, ref, roomId, day, quality?, meta? })
//   → { key, perceivers: [{ npcId, valence, band, text, via: 'room'|'platform' }] }
// kind ∈ NOTICE_KINDS: 'skill_levelup'|'work'|'room_design'|'chatter_post'|'chatter_private'|'subscription'|'aspiration'
// key = noticeSubjectKey(subject) = `${kind}:${ref}[:${meta.to ?? meta.version}]`
// in-room: NOTICE_SIGNALS[kind] → emitTransient('craft_moment', sourceId 'notice:<key>') → perceiveSignals per awake NPC
// platform: platformPerceivers(gs, subject) → [] until Phase 10 (a function, not a field)
// one opinion per (npc, key); a told_by copy counts (holdsOpinionOn)
// → addMemoryFact(npc, { kind: 'opinion', subject: { kind, ref, key }, valence, text, day, category,
//                        importance: social + |v|·(conversational − social), provenance: 'witnessed', confidence: 1 })
opinionValence(npc, subject, gs)       // pure, seeded, [-1, 1]; OPINION_PERSONALITY is the one table (D70)
opinionLine(subject, valence, gs)      // OPINION_LINES[kind][opinionBand(valence)], {craft} from SKILL_CRAFT_NOUNS
opinionRaiseWeight(fact)               // npc.js factEmotionalWeight reads it for kind 'opinion' (D66)
// npc.js receiveTransmittedFact carries kind/subject/valence verbatim; skills.js awardSkillXp(..., day, gameState?) emits skill_levelup
```

### Works (Phase 4) — as shipped 2026-09-18
```js
// player.works[]   (on the persisted player record; lazy defaults via works.js ensurePlayerWorks — no migration)
{ id: 'work_<n>', kind: 'book'|'track'|'piece'|'menu', title, quality: 0..1 (craftQuality at finish, fixed), createdDay,
  releasedDay: null|day, reach: 0.., lastPromotedDay: null|day, lastDecayDay, earned, meta: { startedDay, itemId?, listingName? } }
// player.workInProgress[]
{ id, kind, title, blocks, done, startedDay, meta }
// player.catalogCarry (fractional $ not yet paid), player.catalogPaidDay (idempotence), player.nextWorkSeq (ids)
// defs.works.js
WORK_KINDS = {
  book:  { skill: 'writing', category: 'writing', minSkill: 4, minRep: 40, blocksRange: [24, 40], ratePerReach: 0.04, usesComputer: true, releaseReach: (q, rep) => round((40 + 160q) × (0.5 + rep/100)) },
  track: { skill: 'music',   category: 'music',   minSkill: 4, minRep: 40, blocksRange: [8, 16],  ratePerReach: 0.02, usesComputer: true, requires: 'recording_kit', releaseReach: (q, rep) => round((60 + 240q) × (0.5 + rep/100)) },
  piece: { skill: 'art',     category: 'art',     minSkill: 3, minRep: 20, blocksRange: [4, 10],  ratePerReach: 0, salePrice: (q, rep) => round((60 + 200q) × (1 + rep/100)) },
  menu:  { skill: 'cooking', category: 'food',    minSkill: 4, minRep: 20, ratePerReach: 0, ordersPerReach: 0.08, releaseReach: (q, rep) => round((5 + 20q) × (0.5 + rep/100)) },
};   // each row also carries label/plural/verb
WORKS_TUNING = { decayHalfLifeDays: 14, promoteBlockMinutes: 30, promoteBump: 0.25, spikeChance: 0.02, spikeMult: 10 };  // WORK_TUNING is config.js's focus table (D71)
// works.js: canRelease(gs, kind) → { ok, reasons[] }; startWork(gs, { kind, title, meta }); workBlock(gs, id, device);
//           releaseWork(gs, id); promoteWork(gs, id, device); decayWorks(gs, day); catalogIncomeForDay(gs, day, { credit });
//           processWorksForDay(gs, day)  ← ui.js processDayRollover, beside processGigsForDay
```

### Chatter platform (Phases 9–13)
```js
// world.computer.apps.social_feed.profile   (player)
{ handle, ghostFollowers, castFollowers: [npcId], backers: { ghosts: n, cast: [npcId] },
  private: { open: false, ghosts: n, cast: [npcId] }, backersPrice: 5, privatePrice: 10,
  blocked: [npcId], lastPostDay, subscriptions: [{ npcId, tier: 'backers'|'private', since }],
  // Phase 10 (lazy, all optional on an old save):
  growthLog: [{ day, postId, gained, viral }],   // 20-line ring, newest first
  lastFollowDay, lastDecayDay, lastBilledDay, nextBillingDay }
// post (extends the existing shape)
{ id, author, text, likes, comments, day, eventRef,
  visibility: 'public'|'private', media: null|{ kind: 'image', key }|{ kind: 'poll', options, votes }, appeal,
  meta: { source: null|{ kind: 'work', workId }|{ kind: 'skill', skillId } } }   // Phase 10 (D29)
// comment (a ghost's — D90; a cast comment keeps { author: npcId, text })
{ author: null, ghost: true, seed, text }
// Phase 11: profile.private gains openedDay (lazy); a camera-roll photo record gains
//   level: 'intimate'|'lifestyle'   (stamped at capture — D92; older records derived)
// facts (D33/D92 — written by the $Feature leaf, read at post time)
{ kind: 'consent_feature', ref: photoId, granted: boolean, level, text, day, importance, category: 'social' }
// npc.chatter
{ handle, followsPlayer, subscribes: null|'backers'|'private', slotsUsed, seenPostIds: [],
  ghostFollowers, lastCreatorTickDay }   // Phase 12 (D95): a creator's own numbers, lazy
// npc.bible.creator (Phase 12 — a schema entry; derived by sim.js's deriveCreator, seeded on genSeed)
{ active, kinds: ['lifestyle'|'craft:<skill>'], privateOpen, backersPrice, privatePrice, blocksPlayer }
// profile.subscriptions (the player's — D40)
[{ npcId, tier: 'backers'|'private', since }]   // + profile.lastChargedDay (lazy)
// player.aspirations (Phase 14, D47 — lazy, ensurePlayerAspirations)
{ directions: [dirId], completed: { [milestoneId]: day }, directionsDone: { [dirId]: day }, lastCheckedDay }
// world.computer.apps.gigs.delivered   (Phase 14 — a lifetime count, read by the independence direction)
// player.incomeLog (Phase 15, D105 — written by applyEarnMoney, capped, pruned past ledgerDays)
[{ day, amount, reason }]
// player.independenceWeeks, player.independenceNextDay   (Phase 15, D50 — processIndependenceForDay)
// facts
{ kind: 'identity_link', handle, who: 'player', day, source: postId, text, emotionalTag: 'recognition' }   // Phase 13 (D98); rides a hop
// npc.flags (Phase 13)
{ _roomsSeen: [roomId],                                   // D99 — written by resolveBatch
  _playerBoundaries: [{ id: 'no_private_subscriptions', setDay }],   // D100 — a line drawn for the player
  _playerBoundaryReacted: [subjectKey] }                  // D100 — one crossing per subscription
```

### Aspirations (Phase 14)
```js
// player.aspirations
{ directions: ['craft', 'independence'], completed: ['craft.first_release', ...], chosenDay }
// defs.works.js
ASPIRATION_DIRECTIONS = {
  craft: { label, milestones: [{ id, text, pre: (gs) => bool, done: (gs) => bool }, ...] },
  connection, comfort, independence, notoriety
};
MOOD_PAYOUTS.aspirationMilestone = 0.10; MOOD_PAYOUTS.aspirationDirection = 0.25;
```

### Independence (Phase 15)
```js
player.independenceWeeks: 0
independenceIndex(gs) → { income4w, soloCost4w, ratio, qualifies }
```

### Home (Phases 16–17) — both shipped, 2026-09-19
```js
// defs.works.js
HOME_TUNING = { designedRoomMood: 0.02, densityRef: 8,
                opinion: { base: 0.4, densityWeight: 0.3, styleWeight: 0.3, art: 0.3 },
                wallSlot: { w: 12, h: 8, inset: 1.5 } }
// defs.design.js
DESIGN_SHAPES.player_art          // frame + `art` part (fill from place.fill); recording_kit shipped in Phase 6
DESIGN_SHAPES.desktop_computer    // Phase 17 (D111) — the one new shape, so an arranged bedroom keeps its monitor
DESIGN_STYLE_TAGS[shape] = [...]  // occupation.styleLean vocabulary
world.roomDecorOverrides[roomId] = [ { shape, defId?, x, y, w, h, rot, requires? }, ... ]   // D53; read by roomDesignBase, written by Phase 17
roomDesignBase(gs, roomId)   → { source: 'override'|'authored', placements } | null
roomPlacedDecor(gs, roomId)  → [{ shape, defId, objId, x, y, w, h, rot, meta }]   // the room's pos-objects (catalog decor, player_art)
decorFor(gs, roomId)         → visible base entries ++ placed          // [] = undesigned
roomDesigned / roomPlayerDesignCount / roomDecorDensity / roomStyleWeights / roomDesignVersion / designedRoomComfort
wallSlotsFor(roomId) → [{ id: 'n'|'e'|'s'|'w', label, x, y, w, h, rot }];  wallSlotOccupant(gs, roomId, slotId)
// defs.design.js — Phase 17 (D110/D111): the in-game designer
normalizePlacement(pos, { snap, gridSize, minSize, rotStep, roomId }) → { x, y, w, h, rot } | null   // shared with dev/designer.html
BASE_FURNITURE_SHAPES = { sink_kitchen: 'sink', coffee_table_lr: 'coffee_table', ... }   // defId → drawable shape aliases
baseFurnitureShape(defId) → shapeId | null
roomAutoBaseCandidates(gs, roomId) → [{ shape, defId, x, y, w, h, rot: 0 }, ...]   // what startRoomArrange snapshots
// computer.js — Phase 17: the three roomDecorOverrides writers
startRoomArrange(gs, roomId) → { ok, placements, already }
removeRoomArrangePlacement(gs, roomId, index) → { ok, reason? }
resetRoomArrange(gs, roomId) → { ok, reason? }   // deletes the key, never sets []
placeDecorItem / moveDecorObject   // pre-existing (decor-economy plan); now route pos through normalizePlacement(…, { roomId }) — D110
// ui.computer.js — Phase 17
homePlacementUI.mode: 'decor' | 'base';  homePlacementUI.undo[`${mode}:${roomId}`] = { stack, redo }   // D112
// a hung piece (works.js hangWork) — a room object, D109:
gs.objects['room_<id>'][objId] = { id, defId: 'player_art', bucket, pos: { x, y, w, h, rot }, ownerId: 'player',
                                   meta: { workId, title, quality, slot, placedDay, acquiredDay } }
// notice.js
noticeRoomDesign(gs, roomId, day) → noticeSubject({ kind: 'room_design', ref: roomId, roomId, category: 'home',
                                                    meta: { version: roomDesignVersion(...), label: <room name> } })
roomDesignQuality(gs, roomId, npc)   // per-viewer; subjectQuality(subject, npc, gs) routes the kind here
// world.js
applyDesignedRoomComfort(gs, roomId, day)   // ← ui.js doSleep, actions.js executeAction for def.restful
```

---

## Implementation phases

### Phase 1 — Skill foundation & the hobby split
**Goal:** `music` exists; every hobby declares whether it is mastery or
bonding; mastery hobbies award XP; `payMultiplier` and `qualitySkill` are
gone; `cookQuality` is `craftQuality`. No career exists yet — this phase is
the substrate every later one reads.
**Files:**
- `src/src/srcfiles/config.js`: add `'music'` to `SKILL_IDS`.
- `src/src/srcfiles/skills.js`: rename `cookQuality` → `craftQuality`
  (values unchanged); delete `payMultiplier`; header comment updated to
  describe real consumers (D7).
- `src/src/srcfiles/cooking.js`: the one `cookQuality` reader → `craftQuality`.
- `src/src/srcfiles/defs.actions.js`: `createHobbyAction` gains `mode`;
  guitar → `{ mode: 'mastery', skill: 'music', xp: 6 }`, sketchpad stays
  `art`, bookshelf reading → `{ mode: 'mastery', skill: 'writing', xp: 2 }`,
  records/console → `{ mode: 'bonding' }` (no XP, by D6, with the reason in
  a one-line comment).
- `src/src/srcfiles/defs.computer.js`: remove the `qualitySkill` doc line.
**Verification:** `verify-acc-p1.js`: `skillLevel` over `music` after N
guitar actions crosses level 1 at the expected XP; `bonding` hobbies leave
`player.skills` untouched; `skillMod(p,'cooking','craftQuality')` returns the
old `cookQuality` value at every level; grep proves zero `cookQuality`/
`payMultiplier` references remain. Full `run-all.js` sweep: no regression
against the 2026-08-31 baseline (3298 passed / 76 failed / 13 errored, all
pre-existing).
**Done 2026-09-18** — 39/39; sweep measured 4917/79/9 before and
4956/79/9 after (the 08-31 figure above was stale; see Handoff).

### Phase 2 — Multi-category gig board
**Goal:** Reputation is per category, templates carry explicit tiers and
honest skills, the board is generated per category and rendered grouped with
a category filter. A player with high `tech` rep and no `writing` rep sees
Elite tech gigs and Novice writing gigs together. The off-by-one is gone.
**Files:**
- `src/src/srcfiles/defs.computer.js`: `GIG_TEMPLATES` rewritten — ~4
  templates per category × 6 categories (admin: data entry, transcription,
  survey batch; tech: the existing five minus copy_edit, retiered; writing:
  copy edit, blog post, feature article, ghostwrite chapter; music: jingle,
  stem mix, session part, score cue; art: icon set, illustration, cover art,
  mural mockup; food: meal-prep batch, private dinner, catering tray, recipe
  development). Each `{ category, skill, minSkill, tier }` per D15/D16.
- `src/src/srcfiles/computer.js`: `gigTier`/`gigPayMult` take
  `(rep)` unchanged but every caller passes `reputation[category]`;
  `eligibleGigTemplates` filters on `t.tier` (index mapping deleted);
  `generateGigsForDay` draws per category (board size per category from that
  category's tier, summed); `deliverGig`/`processGigDeadlinesForDay` move the
  category's rep; app init's `reputation` becomes the map.
- `src/src/srcfiles/state.js`: `MIGRATIONS` entry: `typeof reputation ===
  'number'` → `{ tech: n, admin: 0, ... }`.
- `src/src/srcfiles/render.computer.js`: `renderGigBoard` groups by category
  with a filter chip row; rep tier shown per category on the header.
- `src/src/srcfiles/tracker.js`: `trackerGigs` unchanged (reads accepted).
**Verification:** `verify-acc-p2.js`: migration folds a scalar 37 into
`{tech: 37}` with zeros elsewhere; over 200 seeded days, a player with
`tech` rep 90 / `writing` rep 0 is offered tier-4 tech templates and only
tier-0 writing templates; `infra_project` is never offered below its tier
floor (the old bug's regression test); delivering a writing gig moves
`writing` rep and leaves `tech` untouched; `admin` templates appear on
every generated board. Live page: board renders grouped; filter chips work
on both devices.

### Phase 3 — Notice & Opinion layer
**Goal:** `noticeSubject` exists and is verified end-to-end on one subject
(`skill_levelup`, D8): an NPC in the room when the player levels up forms an
opinion fact, that fact can transmit to a second NPC through the existing
gossip path, and `ruminate` can raise it. No career subject exists yet.
**Files:**
- `src/src/srcfiles/notice.js` (new): `noticeSubject`, `opinionValence`
  (pure, seeded; personality sensitivity table), the in-room perceiver
  resolution via `perceiveSignals`, and the platform-perceiver hook stub
  that Phase 10 fills (documented as such — no field without a reader means
  the stub is a function that returns `[]`, not a data field).
- `src/src/srcfiles/npc.js`: `addMemoryFact` accepts `kind: 'opinion'`
  (validate via the existing fact schema path); `receiveTransmittedFact`
  carries `subject`/`valence` through unchanged.
- `src/src/srcfiles/rumination.js`: opinion facts are eligible raise
  candidates with a weight from `|valence|`.
- `src/src/srcfiles/llm.js`: the memory block renders an opinion fact as one
  line ("thinks the player's guitar playing has gotten genuinely good") — the
  wording table lives in `notice.js`, keyed by subject kind and valence band.
- `src/src/srcfiles/skills.js`: `awardSkillXp` calls `noticeSubject` on a
  level cross when `gameState` is passed (add the optional arg; existing
  callers unchanged).
- `index.html` + `src/src/dev/verify/loadgame.js`: register `notice.js`.
**Verification:** `verify-acc-p3.js`: seeded scenario — NPC A in room,
player crosses `music` 1→2 → A holds an `opinion` fact with valence in the
expected band for A's personality; NPC B not in room holds none; run one
transmission event A→B → B holds a provenance-tagged copy; `ruminate(A)`
lists the fact as a raise candidate. Valence is identical across two runs
with the same seed and differs for a "critical" vs "warm" personality.

### Phase 4 — Works engine
**Goal:** `works.js` exists with the record, production-in-progress,
release, promotion, decay, and daily catalog income — verified with a
synthetic work before any real track exists. WorkHub gains a **Works** tab
listing in-progress production and the catalog with per-work reach and
earnings. `tracker.js` shows a "Catalog" income line when non-zero.
**Files:**
- `src/src/srcfiles/defs.works.js` (new): `WORK_KINDS`, `WORK_TUNING`.
- `src/src/srcfiles/works.js` (new): `startWork`, `workBlock` (mirrors
  `workGigBlock`), `releaseWork` (checks D19 gates), `promoteWork`,
  `decayWorks`, `catalogIncomeForDay` (seeded spike roll), `canRelease(kind)`.
  Income credits through `EARN_MONEY`.
- `src/src/srcfiles/ui.js`: day-rollover calls `decayWorks` +
  `catalogIncomeForDay` next to `processGigsForDay`.
- `src/src/srcfiles/tracker.js`: `trackerCatalog`.
- `src/src/srcfiles/render.computer.js` + `ui.computer.js`: Works tab
  (screen `works` on the `work` app), promote button, release flow shell.
- `src/src/srcfiles/state.js`: `player.works`, `player.workInProgress`
  lazy defaults + persisted-key list.
- `index.html` + `loadgame.js`: register both new files.
**Verification:** `verify-acc-p4.js`: a synthetic `book` at quality 0.8,
reach 100: income on day 0 equals `100 × 0.8 × ratePerReach`; after 14 days
unpromoted, reach ≈ 50; promote resets the clock and bumps; two works earn
the sum of both (catalog-additive); release refused at `writing` 3 / rep 60
and at `writing` 5 / rep 30, accepted at 5 / 45; the spike roll fires at the
configured rate over 5,000 seeded days (±20%). Save/load round-trips
`player.works`.

### Phase 5 — Writing: draft, publish, royalties
**Goal:** The player can draft a manuscript (multi-block), publish it from a
self-pub screen in WorkHub, and see royalties trickle in and fade. Reading
already awards `writing` (Phase 1).
**Files:**
- `src/src/srcfiles/defs.actions.js`: `self.write` action on `desk`/
  `desktop_computer` → `startWork('book')` / `workBlock`.
- `src/src/srcfiles/works.js`: `book` release sets `releaseReach` from
  quality × writing rep; title free-text (free text is always valid — the
  AI-character-generation rule applies to every free-text field here).
- `src/src/srcfiles/render.computer.js`: publish screen (flavor name per Q1),
  book card with a seeded cover swatch.
- `src/src/srcfiles/notice.js`: `work` subject emitted on release for
  in-room NPCs, and on the day a cast NPC "reads" it (D37's platform hook is
  Phase 10; until then, in-room only).
**Verification:** `verify-acc-p5.js`: a full draft→publish→30-day royalty
run at two quality levels shows the higher-quality book out-earning the
lower at every day; releasing a second book increases total daily income;
`noticeSubject('work')` fires once per release. Live: the Works tab shows a
draft progressing across two in-game days.

### Phase 6 — Music: record, release on Streamly
**Goal:** Guitar practice builds `music`; a `recording_kit` decor item can
be bought and placed; with it, the player records a track (multi-block) and
releases it to Streamly, which gains a "Your releases" screen showing plays
(= reach) and earnings.
**Files:**
- `src/src/srcfiles/defs.computer.js`: `recording_kit` in the Home
  catalog; `DESIGN_SHAPES.recording_kit` in `defs.design.js`.
- `src/src/srcfiles/defs.actions.js`: `self.record` on `recording_kit`
  (requires `music ≥ WORK_KINDS.track.minSkill` to *start*; release gates
  separately per D19).
- `src/src/srcfiles/works.js`: `track` kind wiring; `requires` check.
- `src/src/srcfiles/render.computer.js`: Streamly `releases` screen.
- `src/src/srcfiles/notice.js`: `work` subject on release; an NPC using the
  stereo/record player on a day a player track exists may "play it" — a
  small seeded chance that emits the subject in-room (the object hook is
  the existing `hobby_record_player` action path).
**Verification:** `verify-acc-p6.js`: recording refused without a placed
`recording_kit`; a released track's reach decays and promotes per Phase 4;
the stereo-play emission fires at the configured rate. Live: buy → place →
record → release → Streamly shows it.

### Phase 7 — Art: finish, sell
**Goal:** Sketching builds `art`; at the gate, the player can *finish* a
piece (multi-block) which becomes both a work and an inventory item
(`player_art`); the Works tab offers Sell (one-off at `salePrice`). Hanging
is Phase 16.
**Files:**
- `src/src/srcfiles/defs.actions.js`: `self.paint` on `hobby_sketchpad`
  (or an easel if one exists in the catalog — grep first).
- `src/src/srcfiles/items.js`: `player_art` item def with `meta.workId`.
- `src/src/srcfiles/works.js`: `piece` kind; `sellWork` (removes the item,
  credits once, reach 0).
- `src/src/srcfiles/image.js`: optional — a cached abstract image per piece
  via the existing image pipeline, keyed by work id, behind the same
  quota discipline the camera uses. If Perchance-only generation blocks it
  in Node, the seeded-swatch fallback is the verified path.
**Verification:** `verify-acc-p7.js`: finishing creates a work and an item
with matching ids; selling removes both and credits `salePrice(q, rep)`;
a sold piece contributes 0 to catalog income. Inventory round-trip.

### Phase 8 — Food: the home kitchen on DoorDrop
**Goal:** The player opts into a home-kitchen listing, names it, lists
dishes they can cook (each a `menu` work), and daily orders arrive scaled by
reach and the kitchen's cleanliness; fulfilling an order is cooking that dish
through `cooking.js`; regulars fade if orders go unfulfilled or the listing
goes quiet.
**Files:**
- `src/src/srcfiles/defs.computer.js`: `playerKitchenDef(gameState)` —
  runtime `RESTAURANT_DEFS`-shaped entry (D24); `RESTAURANT_DEFS_LIST`
  readers that enumerate vendors get the player's listing appended at read
  time (grep every reader; the ≥2-open invariant must still hold).
- `src/src/srcfiles/works.js`: `menu` kind; `generateKitchenOrdersForDay`
  (seeded; volume × cleanliness per D25); `fulfillOrder` → `cooking.js`'s
  cook path with the order's recipe; end-of-day unfulfilled → reach loss.
- `src/src/srcfiles/cooking.js`: cook result carries `orderId` when
  fulfilling; quality feeds the order's rating.
- `src/src/srcfiles/render.computer.js`: Works tab → Kitchen section
  (orders queue, fulfill, rating); DoorDrop shows the player's own listing
  greyed ("that's you").
- `src/src/srcfiles/notice.js`: `work` subject when a resident eats a
  listed dish (they are the first regulars — a resident order is a cast
  order, D28).
**Verification:** `verify-acc-p8.js`: orders/day at reach 50 vs 200 scale
linearly; a kitchen at cleanliness 0.3 gets ~30% of the orders a clean one
does; an unfulfilled day drops reach; fulfilling through `cooking.js`
consumes ingredients and produces a meal of the expected quality; the
≥2-open-restaurants invariant holds at every half-hour with the player
listing present. Live: opt in → orders → cook → paid.

### Phase 9 — Chatter audience model
**Goal:** Chatter has a player profile with a pseudonymous handle, three
audience layers, media and poll posts, cast-wide authorship, and visibility
on posts. No money yet. The header comment is rewritten to the truth.
**Files:**
- `src/src/srcfiles/defs.works.js`: `CHATTER_LABELS` (D26), audience
  tuning additions.
- `src/src/srcfiles/platform.js` (new): profile init + handle prompt,
  `ghostHandle(seed)`, follower state, `castFollowDecision` (D36),
  `blockNpc`/`unblockNpc` (D35), `visiblePostsFor(npcId)`.
- `src/src/srcfiles/chatter.js`: authorship → `contactKnown ||
  resident` (D28); post shape gains `visibility`/`media`/`poll`; NPC post
  candidates gain topic kinds (house, hobby, food, work, player, date) with
  `media` for image-worthy sources through `takePhoto`-style keys when the
  source event has a room; header comment rewritten (D27).
- `src/src/srcfiles/render.computer.js` + `ui.computer.js`: profile screen
  (handle, counts by label, blocked list with manual add/remove), post
  composer with visibility toggle (private greyed until Phase 11), poll
  render + vote, image render via the cached key.
- `src/src/srcfiles/state.js`: `social_feed.profile`, `npc.chatter` lazy
  defaults + persisted-key list.
- `index.html` + `loadgame.js`: register `platform.js`.
**Verification:** `verify-acc-p9.js`: a known-but-non-resident NPC can
author a post; a blocked NPC is excluded from `visiblePostsFor`; the ghost
handle generator is deterministic per seed and never collides with a cast
handle; polls tally NPC votes deterministically. Live: handle prompt on
first open, profile renders, an NPC image post shows on both devices.

### Phase 10 — Growth, Backers, and platform perception
**Goal:** Posting grows followers by appeal (D29); Backers convert and pay
(D32, D34); NPCs perceive the player's public posts by scrolling (D37) and
form opinions (Phase 3's platform hook is filled here); cast members follow
and back you as decisions with real slot costs (D36, D42). "Notoriety"
becomes measurable.
**Files:**
- `src/src/srcfiles/platform.js`: `postAppeal` (pure), `applyGrowth`,
  `ghostDecay`, `deriveSubscribers` (per billing cycle), `billSubscriptions`
  (credits via D3), `npcSlots(npc)` (D42), `castSubscribeDecision`.
- `src/src/srcfiles/notice.js`: platform perceiver hook → for each
  following NPC whose idle pastime was `scroll_phone` today, unseen public
  posts → `chatter_post` opinion subjects.
- `src/src/srcfiles/chatter.js`: player posts can be sourced from a work or
  an activity (`meta.source`) so `postAppeal` knows the craft skill.
- `src/src/srcfiles/ui.js`: rollover → `applyGrowth`/`ghostDecay`; billing
  cycle → `deriveSubscribers`/`billSubscriptions` beside rent.
- `src/src/srcfiles/tracker.js`: `trackerPlatform` (income line, next
  billing).
- `src/src/srcfiles/render.computer.js`: profile shows Followers/Backers,
  price setter (bounds per D32), notification list with ghost handles.
**Verification:** `verify-acc-p10.js`: 30 days of daily posting at craft
skill 6 ends with more ghost followers than at skill 2; 30 quiet days decay
followers by the configured fraction; the viral roll fires at its rate over
10k seeded posts; Backers = floor(followers × conv) and income = count ×
price at each cycle; a `low/frugal` NPC never exceeds 1 slot; an NPC with
`scroll_phone` today holds an opinion fact about yesterday's post, one
without does not. Save round-trip of profile + `npc.chatter`.

### Phase 11 — Chatter Private
**Goal:** Behind the mature flag and an explicit opt-in, the player can open
a Private page, post private content (solo via the existing photo pipeline;
featuring another person via `$Feature`), set a price, and earn from Private
subscribers. Blocking is the only protection and it is manual.
**Files:**
- `src/src/srcfiles/platform.js`: `openPrivatePage`, private conversion,
  private billing; `visiblePostsFor` honors subscription for private posts.
- `src/src/srcfiles/asks.js`: `ASK_FEATURE` leaf under `photos` (D33) —
  `decide()` picks the willingness tier from the content's gate level;
  `effects()` writes a `consent_feature` fact on the NPC with the content
  ref so D41's "nobody else is in it unless their consent fact exists" is
  checkable.
- `src/src/srcfiles/image.js`: private self-shot generation reuses
  `takePhoto` with `opts.intimate` under the three-condition gate; no new
  gate function (D31).
- `src/src/srcfiles/render.computer.js` + `ui.computer.js`: opt-in
  confirmation screen; Private tab; composer's private toggle live; price.
- `src/src/srcfiles/notice.js`: `chatter_private` subject for subscribed
  NPCs (D37) — perceived only if subscribed.
**Verification:** `verify-acc-p11.js`: with `mature: false` the opt-in
screen is unreachable and `openPrivatePage` returns `{ok:false}`; `$Feature`
against an NPC with an `asleep` floor is refused with the same reason string
`ASK_INTIMACY` gives; a consenting NPC yields a `consent_feature` fact; a
private post is invisible to a following-but-unsubscribed NPC and visible to
a subscribed one; blocked NPCs can neither follow nor subscribe. Live: the
gate degrades an explicit prompt to the safe paraphrase exactly as peek does
when the gate is closed.

### Phase 12 — NPC creators & the player as subscriber
**Goal:** Some NPCs (D38) run accounts and Private pages that grow offscreen
(D39); the player can subscribe to any that don't block them, at a real
cost on the rent cadence (D40); subscribed Private content renders through
the same gate (D41). NPC creator handles are pseudonymous (D30).
**Files:**
- `src/src/srcfiles/sim.js` / `concept.js`: cast generation sets
  `bible.creator` from personality + occupation leans (D38);
  `validateNpcField` schema entry in `state.js`.
- `src/src/srcfiles/platform.js`: `npcCreatorTick` (offscreen growth),
  `npcBlocksPlayerDecision` (D40), `subscribeToNpc`/`unsubscribeFromNpc`,
  billing on the player side through the existing charge path.
- `src/src/srcfiles/chatter.js`: creator NPCs' feed posts carry `media` per
  kind; their private posts are listed (not rendered) unless subscribed.
- `src/src/srcfiles/image.js`: NPC private self-shot via `takePhoto` for
  that NPC under the gate (D41).
- `src/src/srcfiles/render.computer.js`: NPC profile screen with
  subscribe/unsubscribe; billing shows in Brine Bank's charges.
**Verification:** `verify-acc-p12.js`: over 500 generated NPCs, creator
rate ≈ 15% and private rate ≈ 5% (±3%); a "private" personality blocks
housemates, an exhibitionist blocks none; subscribing debits the player on
the next cycle and stops after unsubscribe; an NPC's private post is
`{rendered:false}` for a non-subscriber and gate-governed for a subscriber.
Save round-trip of `bible.creator` + `profile.subscriptions`.

### Phase 13 — Recognition & consequences
**Goal:** Handles get linked to people by rolls with tells (D43), in both
directions; discovery produces opinion facts that gossip carries (D44);
subscribing to someone else is a boundary conversation, not infidelity
(D45). This is where "I think that's Carrie's room in that photo" becomes a
fact three people hold by Friday.
**Files:**
- `src/src/srcfiles/platform.js`: `recognitionRoll(perceiver, post)` —
  tells from room facts, appearance marks, speech tics; writes
  `identity_link`.
- `src/src/srcfiles/notice.js`: `subscription` subject (someone learns who
  subscribes to whom) with valence per D12.
- `src/src/srcfiles/asks.js`: `ASK_SUBSCRIPTION_TALK` under `boundary`
  (D45) → boundary flag via the existing flags engine.
- `src/src/srcfiles/rumination.js` / `llm.js`: `identity_link` facts are
  raisable and phrased ("I'm pretty sure that account is you").
**Verification:** `verify-acc-p13.js`: an NPC who has been in the player's
bedroom recognizes a private post shot there at a higher rate than one who
hasn't; an `identity_link` transmits A→B like any fact; `$SubscriptionTalk`
produces a boundary flag with the NPC's personality-appropriate stance and
never touches `castWeb` infidelity deltas (assert the delta function is not
called). Deterministic across seeds.

### Phase 14 — Aspirations
**Goal:** The intro offers up to two directions; **Compass** shows live
milestones per direction; milestones complete from pure predicates and pay
out mood + a Notice subject. Nothing is gated behind them.
**Files:**
- `src/src/srcfiles/defs.works.js`: `ASPIRATION_DIRECTIONS` with ~8
  milestone templates per direction, each `pre`/`done` pure over `gs`.
  `independence`'s final milestone reads `independenceWeeks` (Phase 15
  provides it; until then the predicate is false — that is fine).
- `src/src/srcfiles/aspirations.js` (new): `liveMilestones(gs)`,
  `checkAspirations(gs, day)` (rollover), `chooseDirections`.
- `src/src/srcfiles/defs.intro.js` / player-creation flow: one screen.
- `src/src/srcfiles/defs.computer.js`: `compass` app (`personal`, both
  devices); `render.computer.js` + `ui.computer.js` screens.
- `src/src/srcfiles/config.js`: the two `MOOD_PAYOUTS` entries.
- `src/src/srcfiles/notice.js`: `aspiration` subject on completion.
- `src/src/srcfiles/state.js`: `player.aspirations` default + persisted key.
- `index.html` + `loadgame.js`: register `aspirations.js`.
**Verification:** `verify-acc-p14.js`: with `craft` chosen and `art` at 4,
the live list contains "reach art 5" and not "sell a piece" (pre unmet);
crossing to 5 completes it exactly once, pushes the payout once, emits the
subject once; switching directions keeps `completed`; every milestone
template's `pre`/`done` is a pure function (call twice, same result, no
state writes — assert by deep-equal of `gs` before/after). Live: intro
screen, Compass on phone and computer.

### Phase 15 — Independence & the economy audit
**Goal:** `independenceIndex` exists and is honest; `independenceWeeks`
counts; the economy plan's invariant list is annotated with D1 and the
measured numbers (at what skill/rep/catalog/following a solo lease is
covered, and how many in-game weeks a focused player takes to get there).
**Files:**
- `src/src/srcfiles/works.js` or `aspirations.js`: `independenceIndex(gs)`
  (rolling 4-week income vs solo cost — rent + utilities + groceries
  baseline from the economy plan's constants, roommate offsets excluded);
  rollover increments/resets `player.independenceWeeks`.
- `src/src/dev/verify/verify-acc-p15.js`: a scripted "focused writer"
  and a "focused creator" run over 52 in-game weeks — record the week
  independence first qualifies, and that a "dabbler" (one category at
  level 3) never does.
- `src/src/ref/complete/economy-and-rent-plan.md`: **append** a dated note
  to its invariant list pointing at D1 with the measured numbers. Do not
  edit its historical text.
- Memory: the design-invariants memory is updated the same session.
**Verification:** the two scripted runs above; solo cost excludes roommate
offsets (assert against `playerShare` with zero roommates); a week of
income below cost resets the counter.

### Phase 16 — Home: comfort, opinions, hanging art
**Goal:** Designed rooms grant a small comfort effect (D51) and are opinion
subjects (D52); `roomDecorOverrides` exists and is honored by the renderer
and by "is this room designed" (D53); a finished piece can be hung (D54)
through a minimal placement flow (pick a wall slot) — the full editor is
Phase 17.
**Files:**
- `src/src/srcfiles/defs.design.js`: `DESIGN_SHAPES.player_art`;
  `decorFor(roomId)` reads overrides first, then `ROOM_DECOR`.
- `src/src/srcfiles/render.js`: `renderRoomFurniture` uses `decorFor`.
- `src/src/srcfiles/world.js` / `ui.js`: rest/sleep in a designed room →
  mood impulse per `HOME_TUNING`; room entry → `room_design` subject.
- `src/src/srcfiles/notice.js`: `room_design` valence uses decor density ×
  `styleLean` match; hung art adds the piece's quality.
- `src/src/srcfiles/render.computer.js` + `ui.computer.js`: Home app →
  "Hang" (choose a piece, choose one of N wall slots per room).
- `src/src/srcfiles/state.js`: `world.roomDecorOverrides` default + key.
**Verification:** `verify-acc-p16.js`: a room with an override is
"designed"; sleeping there pushes exactly one impulse of the expected size;
an NPC whose `styleLean` matches the room's dominant style forms a higher
valence than one whose doesn't; hanging writes a `player_art` placement
with `meta.workId` and the piece stays in the catalog at reach 0. Live: the
hung piece draws in the room view.

### Phase 17 — Home: the in-game designer
**Goal:** The Home app gains a designer screen — `dev/designer.html`'s
move/resize/rotate/grid-snap/undo over the placed decor of a room the
player controls, saving to `roomDecorOverrides`. Room reshaping is not
ported (D55).
**Files:**
- `src/src/srcfiles/render.computer.js` / `ui.computer.js`: the designer
  screen; input handling on both devices (touch on phone).
- `src/src/srcfiles/defs.design.js`: `normalizePlacement` shared with the
  dev tool (extract, don't duplicate — `dev/sync-designer.js` keeps the two
  in step and `verify-plan.js` §8 fails if they drift).
- `dev/designer.html`: imports the extracted helper.
**Verification:** live page only — drag a sofa, reload, it stays; undo
restores; a placement outside the room's rects is rejected; the dev
designer still opens and `node src/src/dev/sync-designer.js` reports no
drift. `verify-plan.js` §8 still passes.

### Phase 18 — Close-out audit
**Goal:** Every D-number has a reader; every new persisted field
round-trips; the full harness sweep is at or above baseline; `chatter.js`'s
header tells the truth; Patch Notes entry written; `GAME_VERSION` bumped;
plan moved to `complete/`; indexes updated.
**Files:** as found. Plus `src/src/srcfiles/defs.patchnotes.js`,
`src/src/ref/README.md`, `src/src/ref/structural/ARCHITECTURE.md`.
**Verification:** `node src/src/dev/verify/run-all.js` unfiltered; a
grep-driven checklist of D1–D58 each mapped to a function or field; a
fresh-save and an old-save (pre-plan) both load and reach the Works tab,
Chatter profile, and Compass without error.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** (2026-09-18) | `music` skill; mastery/bonding hobby split; `craftQuality`; `payMultiplier` retired — `verify-acc-p1.js` 39/39 |
| 2 | **Done** (2026-09-18) | Per-category gig reputation (`GIG_CATEGORIES`, world 5→6 migration); explicit template tiers with a load-time guard; 24-template 6-category board drawn per category; grouped renderer with filter chips on both devices — `verify-acc-p2.js` 60/60 |
| 3 | **Done** (2026-09-18) | Notice & Opinion layer (`notice.js`: `noticeSubject`, seeded `opinionValence` over `OPINION_PERSONALITY`, `craft_moment` perception gate through `perceiveSignals`, opinion facts on the memory store, abs(valence) raise weight, platform hook stub) — verified end-to-end on `skill_levelup`: `verify-acc-p3.js` 40/40 |
| 4 | **Done** (2026-09-18) | Works engine (`defs.works.js` `WORK_KINDS`/`WORKS_TUNING`; `works.js` `startWork`/`workBlock`/`releaseWork`/`promoteWork`/`decayWorks`/`catalogIncomeForDay`/`processWorksForDay`), the D19 gate, EARN_MONEY crediting with a carry, WorkHub's Works tab, the Tracker's Catalog line — `verify-acc-p4.js` 35/35 |
| 5 | **Done** (2026-09-18) | Writing: desk chips + title modal → `startWork('book')`/`workBlock`; the Inkwell storefront screen (D74) with seeded cover swatches; `releaseWork` notices in-room NPCs (D75); measured 30-day royalties at two qualities — `verify-acc-p5.js` 17/17 |
| 6 | **Done** (2026-09-18) | Music: `recording_kit` decor item (catalog/shape/footprint), kit chips + modal → `startWork('track')`, Streamly's Your Releases screen, the trusted-only `PLAY_OWN_TRACK` stereo-play emission (D78) — `verify-acc-p6.js` 18/18 |
| 7 | **Done** (2026-09-18) | Art: sketchpad chips + modal → a piece that is both a work and a `player_art` item; `sellWork` (one-off `salePrice`, EARN_MONEY, the item leaves the bag, reach 0); seeded swatch imagery (Q5 → D80) — `verify-acc-p7.js` 15/15 |
| 8 | **Done** (2026-09-18) | Food: `player.kitchen` (D81), `openKitchen`/`listDish`/`generateKitchenOrdersForDay`/`fulfillKitchenOrder`/`closeKitchenDay`, `playerKitchenDef` at read time (≥2-open preserved), cleanliness-scaled orders (D25), cast orders (Q4 → D84) noticed by the eater (D83), Works-tab Kitchen section, DoorDrop's greyed listing — `verify-acc-p8.js` 20/20 |
| 9 | **Done** (2026-09-18) | Chatter audience model: `platform.js` (profile + handle prompt, `ghostHandle`/`npcChatterHandle`, `chatterCastIds`, `blockNpc`/`visiblePostsFor`, `castFollowDecision` + daily pass), `CHATTER_LABELS` (invariant 11), image/poll posts, visibility, cast-wide authorship, the profile screen — `verify-acc-p9.js` 26/26 |
| 10 | **Done** (2026-09-19) | Growth (`postAppeal`/`applyGrowth`/`ghostDecay`, `growthK 0.5` measured), Backers (`npcSlots`, `castSubscribeDecision`, `deriveSubscribers`, price-elastic `ghostConversion` — D91), billing on the rent cadence through EARN_MONEY (`billSubscriptions`, `trackerPlatform`), NPC perception by scrolling (`platformPerceiversFor` fills Phase 3's hook — D89), ghost comments (Q3 → D90), the composer's About select, the profile's Support/Notifications panels — `verify-acc-p10.js` 32/32 |
| 11 | **Done** (2026-09-19) | Chatter Private: the D31 gate + opt-in modal (`canOpenPrivatePage`/`openPrivatePage`), the hidden `private` screen, self-shots through `takePhoto(gs, tags, { selfShot, intimate })` under the three-condition gate with `level` stamped on every record, `$Feature` as a picker-first ask writing `consent_feature` facts (D92) enforced at post time, `convPrivate(cadence)` (D93), the cast Private decision with Backer upgrades and slot returns (D94), `chatter_private` perception for subscribers only — `verify-acc-p11.js` 24/24 |
| 12 | **Done** (2026-09-19) | NPC creators: `bible.creator` derived at `createNpcFromBible` (`deriveCreator`/`ensureCreator`, seeded — 16.5 % / 5.9 % over 510 NPCs), the D40 block decision, offscreen growth (`npcCreatorTick`) with described-not-rendered private posts (`buildNpcSelfShotRecord` under the gate), the player subscribing at the creator's price and charged with rent (`subscribeToNpc`/`billPlayerSubscriptions`, lapses unpaid — D96), the locked feed card, the NPC profile's Creator panel, the bank's Subscriptions panel — `verify-acc-p12.js` 19/19 |
| 13 | **Done** (2026-09-19) | Recognition as a seeded roll over tells (`recognitionTells`/`recognitionChance`/`recognitionRoll`; `_roomsSeen` written by the sim — D99) writing transmissible `identity_link` facts (55 % vs 21 % measured), the `subscription` NOTICE subject for a creator who knows the handle, `$SubscriptionTalk` as a player-bound boundary (`_playerBoundaries`, `checkPlayerBoundary`, `maybeBoundaryUponFact` beside the jealousy hook — D100) that never touches infidelity — `verify-acc-p13.js` 20/20 |
| 14 | **Done** (2026-09-19) | Aspirations: `ASPIRATION_DIRECTIONS` (5 directions, 48 pure milestone predicates over read-only `ASP` helpers), `aspirations.js` (`chooseDirections`/`toggleDirection`/`liveMilestones`/`checkAspirations` at rollover with the two `MOOD_PAYOUTS` and the `aspiration` Notice subject), the Compass app on both devices (Q2 → D101), the intro's directions section — `verify-acc-p14.js` 15/15 |
| 15 | **Done** (2026-09-19) | `independenceIndex`/`independenceWeeks` over a new income ledger (`player.incomeLog` from `applyEarnMoney`), the solo cost with a groceries baseline, the count on the rent cadence; **the economy audit** — gig pay rescaled (`GIG_TUNING.payScale 0.3`, the tier multiplier and top rates compressed — D104) after measuring a Novice grind at 4× a solo lease; four scripted 52-week runs (gigs-only 0.93 never; catalog-only 0.44; the full stack at week 21 / 28); the economy plan's dated note and the invariants memory — `verify-acc-p15.js` 10/10 |
| 16 | **Done** (2026-09-19) | Home: `decorFor` over override → authored → placed (`world.roomDecorOverrides` in SAVE_KEYS, read everywhere, written by Phase 17), placed decor drawn at its pos (the packer skips it), `designedRoomComfort` × density pushed from sleep and the `restful` verbs (D51), `room_design` opinions per design version with style match (`DESIGN_STYLE_TAGS` × `styleLean`) and hung-art quality, superseding the older one (D52/D54), `hangWork`/`takeDownWork` + the Home app's Hang screen (D54) — `verify-acc-p16.js` 26/26 |
| 17 | **Done** (2026-09-19) | Home: in-game designer — the Studio gains Decor/Arrange mode tabs, per-room+mode undo/redo, touch input, and a shared `normalizePlacement` (snap/floor/rotation/reject-outside-room) with `dev/designer.html`; `startRoomArrange`/`removeRoomArrangePlacement`/`resetRoomArrange` let the player rearrange a room's own base furniture into `roomDecorOverrides` — D110–D112 — `verify-acc-p17.js` 27/27 |
| 18 | **Done** (2026-09-19) | Close-out audit (D1–D112 grep-checked, consolidated field round trip, live save-migration proof via `restoreSave`), `GAME_VERSION` 0.13.0→0.14.0, Patch Notes entry, moved to `complete/` — `verify-acc-p18.js` 82/82 |

## Dependency order

```
Phase 1 (skills) ──► Phase 2 (gig board) ──► Phase 4 (works engine) ──► 5, 6, 7, 8 (tracks; any order)
        │                                            │
        └──► Phase 3 (Notice & Opinion) ─────────────┼──► Phase 9 (Chatter audience) ──► 10 ──► 11 ──► 12 ──► 13
                                                     │
                                                     └──► Phase 14 (Aspirations) ──► Phase 15 (Independence)
Phase 3 ──► Phase 16 (Home comfort/opinions/hang; needs Phase 7 for hanging) ──► Phase 17 (designer)
Phase 18 last.
```

Safe out of order: Phases 5–8 are independent of each other once 4 lands.
Phase 9 needs only 3 (not 4) and may run before the tracks; Phase 10 wants 4
so posts can cite a work, but degrades gracefully (lifestyle-only appeal)
if 4 is absent. Phase 14 can be built any time after 3 with the milestone
pools limited to what exists — later phases *add* templates to
`ASPIRATION_DIRECTIONS`, so a session doing 5–13 after 14 must add its
milestones (the phase blocks above don't repeat this; it is stated here
once). Phase 16 needs 7 only for hanging — a session may land comfort +
opinions and leave hanging for when 7 exists, and must say so in the Handoff.
Never do 11 before 10 (private conversion reads the follower funnel), never
do 12 before 11 (NPC pages reuse the player's private plumbing), never do 13
before 12 (recognition needs NPC handles to exist).

## Open questions (parked, none blocking)

- **Q1 — Self-pub storefront flavor name.** **Resolved at Phase 5 →
  "Inkwell" (D74)**, `INKWELL_LABEL` in `defs.works.js`.
- **Q2 — The aspirations app's name.** **Resolved at Phase 14 → "Compass"
  (D101)**, `COMPASS_LABEL` in `defs.works.js` (the user was away; the
  default shipped and is one string to change).
- **Q3 — Should ghost *comments* exist?** **Resolved at Phase 10 → yes
  (D90).** `CHATTER_GHOST_COMMENTS` is a template pool; a comment stores a
  seed, the handle is regenerated at render; no facts, no memory, never a
  person.
- **Q4 — Does the player's own kitchen listing appear to *NPC* diners?**
  **Resolved at Phase 8 → yes, lightly (D84).** Resident housemates order
  at `WORKS_TUNING.kitchen.residentOrderChance` × cleanliness per dish per
  day; a cast order carries `customerId`, fills like any other, and is a
  Notice subject for that NPC when filled (D83).
- **Q5 — Piece imagery.** **Resolved at Phase 7 → seeded swatches (D80).**
  `bookCoverSwatch` is the one cover for books, tracks and pieces; a live
  image per piece is an optional polish, owed, never required.

## Design invariants

1. **Decide before you decorate.** Every appeal, valence, growth, order
   count, recognition, and milestone is computed deterministically from
   state + seed first; the LLM and the templates only phrase it. The Chatter
   feed already lives by this; a phase that lets the model *decide* whether
   an NPC liked your book has broken the whole Notice layer.
2. **The willingness gate is the only door.** `$Feature` and NPC private
   content route through `willingnessFloorReasons`/`resolveBoundaryGate`
   exactly as `ASK_INTIMACY` does. The actions plan's scar: every time a
   phase "just needed" the asleep floor to bend, it was wrong.
3. **An NPC never has an opinion about something it could not have
   perceived.** In-room via signals; on-platform via following/subscribing
   and scrolling. The September Audit fixed a sleeping NPC "witnessing" a
   rule break — the same bug shape, and Notice would reproduce it at scale
   if D10 is skipped.
4. **Opinions are facts, and facts are the only memory.** No parallel store.
   `castWeb` silently failed to persist for months because a second store
   was enumerated in a second place; a `player.opinions` array would be the
   same mistake with a different name.
5. **Money flows through existing paths only.** `EARN_MONEY` in, the charge
   path out. A phase that adds `player.platformBalance` has created a
   second wallet that the tracker, bank, and rent math don't know about.
6. **No field without a reader.** The vocation plan shipped four lifestyle
   dimensions as spec-only and they rotted. `payMultiplier` sat unread for
   two months. Phase 3's platform hook is a *function returning `[]`*, not
   a field, for exactly this reason.
7. **Pure logic in Node, presentation on the live page.** `works.js`,
   `platform.js`, `notice.js`, `aspirations.js` must import no DOM and must
   be exercisable by `run-all.js`. Renderers verify live. A "verified" phase
   whose only test was reading the code has happened before and shipped a
   dead XP path.
8. **New files register in `index.html` AND `loadgame.js`'s `ORDER`, same
   commit.** Five new files in this plan; this has silently broken every
   harness that touched a half-registered file, repeatedly.
9. **Ghosts are numbers.** The moment a ghost gets a name that persists, a
   personality, or a fact, it is a cast member and the audience model has
   collapsed into simulating the internet. `ghostHandle(seed)` is
   regenerated, never stored.
10. **Lumpy at every tier.** Refresh rolls, spike rolls, churn, decay. D1
    raised the ceiling; if a week's income ever becomes predictable to the
    dollar, the shape is broken regardless of the amount.
11. **Naming lives in one table.** `CHATTER_LABELS` is the only place
    "Backers" or "Chatter Private" appear as strings. A rename that requires
    a grep has already leaked.
