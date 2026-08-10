## Handoff — read this first

**ALL PHASES COMPLETE, AND A FULL-SCOPE AUDIT HAS BEEN APPLIED.** Phase 8
(the last phase) is done and verified live; a subsequent audit pass over all
eight phases found and fixed 11 issues (below). Nothing to resume.

### Audit pass — findings fixed

Audited the whole overhaul against this document, then fixed everything
found. All fixes verified live in `dev-harness.html` (which shims Perchance's
`root`), driving the real functions on a real `buildGameState` world.

Two real bugs:
- **Deviant interruption was dead on weekdays.** `getEligibleNpcs` admits
  social visitors but `getInterruptionProbability` still read their own
  schedule template — every external NPC is `day_shift`, whose weekday
  `work` block is ticks 20-34, and `scheduleMultiplier.work` is `0`. That
  zeroed 14 of the 15 ticks of the 09:00-16:30 invite window, so an invited
  Hot Single could never walk in on a weekday. `interruption.js` now treats
  an NPC on an active `purpose:'social'` visit as `'leisure'` — matching what
  `resolveVisitPresence` already reports for them. Measured on a Friday at
  12:00: p was 0, now 0.326 (deviant A/B still holds: 0.326 vs 0.290 at
  deviant 0, and an absent field is identical to 0).
- **Back/Forward onto the player view showed "no longer available."**
  `ahNav` set `browser.afterHoursWatching`, but `ahBack`/`ahForward` didn't,
  while `AH_syncBrowseView` nulls it on any browse nav that changes identity.
  New `AH_applyViewState` re-derives the watched clip (and re-kicks the
  related rows) from the restored params on every history path.

State/lifecycle:
- **Orphaned masturbation sessions.** Leaving the player view (the address
  bar renders on EVERY view) nulled the clip but left `afterHoursSession`
  set — and the only Stop controls live inside the player view, which then
  renders the unavailable stub. `reconcileTimeContext` kept the 3x frame
  alive off the record, so the clock stayed slowed with no way out.
  `AH_syncBrowseView` now ends the session properly.
- **`world.visits` was append-only forever.** Nothing ever removed a record;
  every delivery/maid/contractor/invite left one in a world sub-key written
  in full on every save. `processVisitsForDay` now sweeps retired records
  older than `VISIT_TUNING.retainDoneDays` (7).
- **The Hot Singles roster was generated inside a render pass.**
  `AH_hotSinglesRoster` called `ensureHotSinglesRoster`, so the home banner
  created six NPCs mid-render. It is a pure read now; the ensure calls live
  on non-render paths only — `writeGeneratedGameState`, `syncGameStateFromKv`
  (covers a save resumed straight onto the site), the day rollover (the
  escort precedent, and the backfill this plan always specified but never
  had), and `AH_onSiteOpen`. `doBrowserVisit` now calls `AH.onSiteOpen`
  BEFORE its render, not after.
- **The "session" caches were persisted.** `afterHoursCache`,
  `afterHoursRelatedCache` and `afterHoursWatchedStack`/`Snapshots` lived on
  the browser app object, which `state.js` writes wholesale — a single home
  visit pushed ~390 full clip records into the save, and dead `'fetching'`
  entries survived reloads and deadlocked rows on skeletons. They are
  module-level (`AH_rowCache` / `AH_relatedCache` / `AH_watchedSnapshots` /
  `AH_watchedStack`) now; `AH_ensureState` deletes the legacy keys once so
  existing saves shed the bulk. This deleted the whole
  `AH_relatedCacheFresh`/`AH_rowCacheFresh`/`AH_relatedInFlight` workaround
  layer — those symbols are gone.

Smaller:
- `Math.random` in the ticker drift (the one in the codebase) violated
  Locked decision 11 / invariant 6; it's a seeded `'afterhours|ticker'`
  stream now, verified stable per save and different across saves.
- The Invite Over button disabled on `v.day >= nowDay` while both handlers
  gate on `day === tomorrow` — a date in progress today locked you out of
  booking the next one. Aligned to `nowDay + 1`.
- `doInviteOver` returns `{ ok, reason? }`; the site's toast reports what
  actually happened instead of assuming its own pre-checks still match.
- `doAfterHoursMasturbate` has a re-entry guard — reachable without a
  double-click, since `isAfterHoursSessionActive` is derived (pocket the
  phone and the button flips back while the record survives), and re-entry
  re-armed the warmup and fired a second interruption pre-generation.
- Every `index.html` citation in this plan and in the handoff prompt was
  unfollowable — **the file is `main.html`**. All corrected.

Verified clean and unchanged by the audit: sandbox + referrerpolicy on both
hosts' embeds, `textContent`-only for API output (markup in a clip title
stays text), the mature gate, roster determinism/idempotency, the IM invite
path (`invite_*`, `followPlayer` false), and all eight views rendering
without throwing. `?v=` bumped: config 35→36, interruption 10→11, computer
30→31, ui 33→34, ui.computer 25→26, afterhours 17→18.

**Phase 8 — done and verified live this session** (save seed mb1bkia4y9,
a leftover test save with no residents). Hot Singles are now full citizens of
the world: invite-over visits, real conversations, the existing move-in
path, and the deviant number has mechanical teeth.
- `config.js`: `AH_HOT_SINGLES_TUNING.interruptionDeviantWeight: 1.0` — the
  volatility-term multiplier is `1 + weight * deviantLevel` (max 2x at
  deviant 1). Tunable/clampable if playtest finds it obnoxious.
- `ui.js`: `doInviteOver(npcId, source)` gained the `'ah'` source —
  `sourceId 'ah_<npcId>_<day>'`, visit `followPlayer: true`, and narration
  flavour `${name} — the person you met on AfterHours — says they'll come by
  tomorrow.` The IM path (`im.invite`, one-arg call) is byte-identical to
  before. This is the "visit-arrival narration flavour" home (there is no
  separate arrival event for player-invited visits — the invite is narrated
  once, and that's where the ah-* flavour lands).
- `sim.js`: `scheduleVisit` records now carry `followPlayer` (optional, only
  set by ah-invites; old saved records read falsy → no behavior change), and
  `resolveVisitPresence` gained a social+followPlayer branch that follows the
  PLAYER through common rooms (the escort precedent, common rooms only — a
  date doesn't follow into anyone's bedroom). `VISIT_TUNING.activities.social`
  is reused as-is, so no activity-pool changes were needed.
- `interruption.js`: (a) `getInterruptionProbability` scales the volatility
  term by `bible.deviantLevel` (absent on cast → 0). (b) `getEligibleNpcs`
  now also admits **social-purpose visitors inside an active visit window**
  — invited Hot Singles and roommates' friends can genuinely wander in.
  Scoped to purpose 'social' deliberately: maids/contractors/delivery/
  escorts are on the clock, never interruptible. THIS IS A SMALL, DELIBERATE
  EXTENSION beyond the plan's literal ask (the plan's Files entry only named
  the volatility scaling); it's what makes "a high-deviant Hot Single
  genuinely is more likely to wander in" true DURING an invite-over visit,
  not just post-move-in. Revert the socialVisitorIds block in
  `getEligibleNpcs` if you ever want visitors non-interruptible again.
- `llm.js` (NOT prompt.js — the plan's "prompt.js: assembleContext/
  buildNpcBlockV2 area" citation points at buildNpcBlockV2, which actually
  lives in llm.js:197; prompt.js has no NPC-context assembly): `[Deviant
  disposition]: N.NN on a 0-1 scale …` line emitted right after
  [Temperament] in buildNpcBlockV2, only when `bible.deviantLevel` is a
  number (cast roommates have none → nothing emitted, so vanilla
  conversations are untouched).
- `afterhours.js`: `AH_renderHotSingle`'s actions row gained an Invite Over
  button with four live states — "Say hi first" (unmet, disabled) →
  "Invite Over" (enabled) → "Invited — coming by" (disabled; a visit is on
  the books) → "Lives with you" (disabled; resident). Handler
  `doAfterHoursInviteOver(npcId)` mirrors doInviteOver's gating (residency /
  contact / tomorrow-visit) for in-site toasts, then delegates to
  `doInviteOver(npcId, 'ah')` — no money anywhere (Hot Singles are not a
  service). Handlers use addEventListener directly (no ui.js dispatch
  change), so no new data-action entries were needed.
- `main.html`: `.ah-hotsingle-invite` style (violet, like the pink say-hi)
  in the Phase 7 hotsingle block; `?v=` bumped together — config.js 34→35,
  sim.js 23→24, llm.js 9→10, interruption.js 9→10, ui.js 32→33,
  afterhours.js 16→17. Script LIST unchanged, so the load-order comment
  (~2546) is untouched.

**Verified live** (browser_eval on the real page, seed mb1bkia4y9):
- Invite-over flow end-to-end on Willow (hot_single_5, deviant 0.80): unmet
  → button "Say hi first"; say-hi → metNpcIds=[hot_single_5], contactKnown,
  IM unread 1, button "Invite Over"; invite → kv-persisted visit
  `ah_hot_single_5_13` purpose 'social' followPlayer, day 13 (tomorrow)
  09:00-16:30, button "Invited — coming by", narration "Willow — the person
  you met on AfterHours — says they'll come by tomorrow."; advance clock →
  she arrives in the living room ("hanging out"/"catching up", schedule
  label 'visit'), follows the player into the kitchen on the next tick;
  scene context (assembleContext) lists her active → real doTalk exchange
  with her in context (she responded in-character, no validation warnings).
- Move-in: zero new code. With a habitable bedroom (test set
  bedroom_habitability_2 functional) + relationship phase 'close',
  `acceptApplicant` moved her in (resident, bedroom_2/A), retired her visit
  records, kept deviantLevel intact. Gated correctly at 'familiar' (the
  phase this save actually has): isMoveInEligible false.
- Interruption: social-visitor eligibility live (eligible while she was a
  visitor, p≈0.51); resident-path A/B on the same NPC, deviant 0.80 vs 0 →
  p 0.526 vs 0.491 (volatility factor 1.8x); rollInterruption with
  baseChance forced to 1 returns {npcId:'hot_single_5', doorState:'unlocked'}.
- [Deviant disposition] emitted for Willow (0.80), absent for a cast-style
  NPC with the field deleted.
- Sacred mechanic re-verified on the Phase 3 player page: Masturbate →
  session recorded + Cum disabled during warmup → Cum enabled → clock +15m →
  session cleared (interruption didn't roll that tick — probabilistic).
- Both shells: phone + computer render the identical profile (shared
  renderer); the one "phone showed stale button" scare was the phone being
  'elsewhere' — renderPhoneScreen early-returns on presence, leaving stale
  DOM, which is expected, not a bug (moved the player to the phone's room →
  correct "Lives with you").
- Full playtest (meet → chat → invite over → romance → move in) exercised in
  pieces; "romance" was simulated by setting conversationPhase 'close' for
  the move-in gate rather than developing it organically (the relationship
  machinery is the standard conversation system — unchanged).
- Cleanup: metNpcIds=[], contactKnown=false, IM thread deleted, Willow
  regenerated byte-identically (createHotSingleNpc on the same seed →
  deviant 0.7993156621884554), all visits removed, upgrade reverted, clock
  rewound to day 12 ~889m, view reset to home, phone off, sessionLog scrubbed
  of the test lines, flushed. Fresh reload verified clean (seed, day, unmet
  profile state).

**Deviations / things that may surprise you:**
- Social visitors (any purpose-'social' visit, i.e. invited guests AND
  roommates' friends) are now interruptible — see the interruption.js note
  above. Deliberate, documented, reversible.
- The plan's "src/srcfiles/prompt.js" citation for the deviant context line
  actually points at llm.js's buildNpcBlockV2 (prompt.js contains no NPC
  context assembly) — put it there, plan-text notwithstanding.
- sim.js needed no activity-pool work: ah-invites are purpose 'social' and
  ride the existing VISIT_TUNING.activities.social pool.
- "interact with residents" could not be live-tested (this save has zero
  residents); it's verified by machinery — every social visitor already runs
  the VISITOR_DRIVE_ALLOWLIST (react_to_player + seek_company/
  chat_with_roommate) drives, unchanged from Phase 6.
- The verification save is still the leftover no-residents test save; the
  invitation/interruption/move-in state is all cleaned out so a future
  playtest can run the whole arc fresh.

**Blockers / flagged deviations:** None. The only flag worth carrying: the
interruption weight is 1.0 (2x volatility at deviant 1) — visible by design
(the plan wanted "genuinely more likely"); if playtest finds it obnoxious,
clamp `interruptionDeviantWeight` and note it here.


---
## The thesis

AfterHours currently reads as a single scrolling page: category tabs, a
search bar, a grid, and a watch panel pinned above the grid. The plan is to
make it *feel like a real website* the player browses — a homepage, a
dedicated player page, related/suggested content, live "now watching"
numbers, a parody ad network, a footer, a 404 — all backed by **two real
content sources blended into one seamless feed** so the same search returns
Pornhub and Eporner results interwoven as if they were one site.

Direct quotes, the clearest statements of scope:
*"The website is going to feel to the player like a REAL website. A
homepage, a dedicated 'Player' page. 'More like This/Suggested Next Watch'
type section next or under video player."*
*"It to feel seamless, fun, interactive, realistic."*
*"Hot Singles could be legitimate in the sense that it has actual NPC's you
can chat with, befriend, meet in person, move in. People you meet there will
have a tendancy to be more deviant on average."*
*"Ads can absolutely just be campy and ridiculous, total parody of real porn
ads which I feel like are already parodies of themselves."*

### What this plan is *not*

- **Not** a "Shorts" shortform section (shelved by the user).
- **Not** minigames (explicitly deferred by the user: "Let's forget the
  minigames for now").
- **Not** fake-virus prompts on the phone/computer (the user loves the idea
  but parked it: "that is a back pocket idea for now").
- **Not** any relaxation of the privacy posture — the sandboxed embed and the
  single "Watch on site →" escape are untouched.
- **Not** AI generation for the site's chrome: no `generateImage`/
  `generateText` for ads, comments, or art. Real thumbnails come from the two
  APIs; everything else is authored copy + CSS/SVG + seeded text pools. The
  sim's LLM is untouched except one context line in Phase 8.

---

## Locked decisions

Settled in the design session. Do not re-litigate without checking with the
user first.

### Content and blend

1. **Two sources, one feed.** Every search/category/row query fans out to
   Pornhub (via `root.superFetch`) and Eporner (via direct `fetch`) in
   parallel, normalizes both into one clip shape, dedupes cross-posts, and
   interleaves so results read as one site. Each source degrades
   independently — if Eporner is down, the feed is Pornhub-only and vice
   versa.
2. **Pornhub via superFetch only; Eporner via direct `fetch` only.** The
   Eporner anti-bot wall makes any proxy path unusable (see Handoff).
   Eporner's free direct fetch also shifts load off the shared perchance
   proxy quota — a deliberate bonus, not a coincidence.
3. **Dedup merges hosts.** When the two sites carry the same video (normalized
   title match AND duration within ±10%), it renders as ONE card with a
   "2 sources" badge, and the player page's source selector lets the player
   choose which host's embed to play — a genuinely useful consequence of the
   blend, not just decoration.
4. **Cards carry source badges** (PH / EP chip) so the mix is legible.
5. **Blend shape:** equal page sizes from both sources (~20/page; confirm
   Pornhub's exact webmasters page size during Phase 1 and set Eporner's
   `per_page` to match) and a round-robin interleave that never runs more
   than two same-source cards in a row. Weights live in `AH_TUNING`
   (config.js) as proposed defaults — 50/50.
6. **Sort mismatch is an accepted blend artifact.** Pornhub's default order
   is relevance; Eporner's search default is latest. A best-effort client-side
   sort in the search view (Phase 4) is the fix; per-source `order=` params
   should be probed during Phase 1 and aligned where possible.

### Site structure

7. **AfterHours becomes a routed mini-site.** `browser.afterHoursView =
   { view, params, stack }` plus an internal back/forward stack. Views:
   `home`, `search`, `category`, `player`, `history`, `liked`,
   `hotsingles`, `hot-single`, `404`. The site header shows a fake
   read-only address bar (`afterhours.example/...`) and its own
   back/forward/refresh controls; the sim's browser Back/Forward keeps
   working as today (it moves between *sites*), and the site's own controls
   move within AfterHours.
8. **A dedicated player page** (`/watch/<id>`), not a panel pinned above the
   grid. Full meta row, heart (like), share → toast, source selector,
   "Up Next" rail + "More Like This" row + "Because you watched" row, and a
   deterministic seeded comments section. **The existing masturbate / cum /
   stop / session mechanic must survive the move intact** — it is a
   regression risk and the highest-priority thing to re-verify in Phase 3.
9. **Homepage rows are just more blended searches.** Featured carousel,
   category tiles (live thumbs), Trending Now, New Releases, Top Rated,
   Continue Watching, Recommended for You (queries derived from the player's
   watch history). Rows reuse one `fetchRow(sectionId, query)` pipeline.
10. **History / Liked pages persist.** Clicking a past clip re-opens the
    player directly from the stored record (which carries its own embeds),
    so re-watching never depends on re-finding the clip in a fresh search.
11. **All generated site content is deterministic.** Ads rotation offset,
    fake commenters, "now watching" numbers, fake model names, and the Hot
    Single roster all derive from `seededRng(meta.seed, 'afterhours')` —
    stable across re-renders within a save, different across saves. No
    `Math.random` anywhere a re-render could drift it.

### Chrome and flavour

12. **Ads are pure parody, campy on purpose.** Rotating banner/skyscraper
    slots: HornyGoat™ Max Dose pills, "Hot MILFs in YOUR area", "You are
    visitor #1,000,000!", casino slots, a fake "browser update" prompt styled
    as the sim's own browser (joke only — cancel does nothing, OK shows a
    toast). Fake close buttons that spawn a replacement ad, countdown timers
    that reset, an "Ad" label. CSS/text/emoji only — no AI art. **No fake
    virus prompts** (deferred).
13. **Fake viruses are parked, not built.** A future plan can add a fake
    virus/browser-update prank layer; this plan deliberately doesn't.
14. **Autonomous animation never runs from a render pass.** Ads rotation,
    the live "watching now" ticker, and toast dismissal run on
    AfterHours-managed lifecycle timers that mutate DOM directly, started
    when the site opens and stopped when it closes — the exact precedent of
    the warmup timer (config.js `MASTURBATION.warmupSeconds` + the
    render-scheduled-timer trap documented at ui.computer.js:442).
15. **Site furniture:** a footer ("© 2006 AfterHours", "DMCA", dead links
    that toast "This page doesn't exist."), breadcrumbs, a 404 for gibberish
    URLs, "Share" that copies a fake link and toasts, thumbnails with
    view-counts, a "watching now" counter that ticks up and down.

### Persistence and the sim

16. **Watch state persists in `world.afterHours`** — a new `world` sub-key in
    the kv `world` folder, written exactly like `world.escortBookings`/
    `world.moveInOffers` (see the `queueWrite('world', ...)` block in
    state.js's `saveAtBoundary`, state.js:416). History (capped ~100),
    liked (~200), search history (capped ~20), `continueWatching`, and (from
    Phase 7) `metNpcIds`. No migration: old saves lazy-init via
    `gameState.world.afterHours = gameState.world.afterHours ||
    defaultAfterHoursState()` — the `world.phone` pattern (state.js:458).
17. **Interruption memory feeds off real watch history.** The existing
    "walked in on you masturbating to …" memory (interruption.js:215) falls
    back to the most recent `world.afterHours.history` title when no clip is
    currently active. No change to when interruptions roll — only to the
    memory flavour.
18. **Hot Singles are full NPCs**, generated by the same
    `createExternalNpc` path (computer.js:2159) the maid/drivers/escorts use
    (design invariant 6 of the external-world plan: never a vendor bot), in a
    deterministic roster `world.hotSinglesRoster` mirroring
    `ensureEscortRoster` (sim.js, Phase 7 of the external-world plan). They
    are **not a paid service** (that's escorts) — meeting them is free, and
    afterwards they are ordinary NPCs: IM contact, invites over
    (`world.visits[]`), romance, move-in — all existing machinery, no new
    systems.
19. **"More deviant on average" is a generation skew + a number.** Hot Single
    NPCs re-roll `volatility`/`openness` toward the high end and draw from an
    adult-leaning trait pool, and carry `npc.bible.deviantLevel` in [0,1]
    derived from that temperament. The number exists so later systems can
    consume it without string-matching (Phase 8: drive gating, interruption
    math, a context line in the LLM prompt).
20. **Content gating is unchanged.** The whole site (Hot Singles included)
    rides the existing `requiresContentFlag: 'mature'` gate
    (defs.computer.js) — hidden by `filterByContentFlags` and refused by
    `visitSite`. A pre-generated Hot Single roster is inert when the flag is
    off, exactly like the escort roster.

---

## Data model

### Normalized Clip (Phase 1) — replaces the current clip shape

Current clips (ui.computer.js:490) are `{ id, title, duration, views,
rating, thumb, embedUrl, watchUrl }`. The normalized shape:

```js
{
  id: 'ph:abc123xyz',           // '<source>:<sourceVideoId>' — stable per playthrough
  sources: ['ph', 'ep'],        // both, when dedup merged a cross-post
  title, duration, durationSec, // duration = display string; durationSec for dedup/related
  views, rating, thumb,
  embedUrls: { ph: 'https://www.pornhub.com/embed/abc123xyz', ep: 'https://www.eporner.com/embed/xxxx' },
  watchUrls: { ph: 'https://www.pornhub.com/view_video.php?viewkey=abc123xyz', ep: 'https://www.eporner.com/xxxx' },
  category: 'milf',             // primary source's category — KEEP for interruption.js:146 compat
  keywords: ['milf', '...'],    // Eporner keywords + title words → feed the related rail
  addedDaysAgo,                 // PH publish_date / Eporner added → days ago (see Handoff — PH now has a date field)
}
```

`interruption.js:146-149` reads `clip?.category || afterHoursCategory` — the
`category` field is kept on the normalized clip so that code path needs no
change. Verify with grep during Phase 1 anyway.

### `world.afterHours` (Phase 6)

```js
{
  history: [ { clipId, title, thumb, embedUrls, watchUrls, source, day, tick, watchMinutes } ],
  // capped ~100, most-recent-first; carries its own embeds so /history re-watches offline of a fresh search
  liked:   [ { clipId, title, thumb, embedUrls, watchUrls, day } ],
  // capped ~200
  searchHistory: [ { query, day } ],            // capped ~20
  continueWatching: { clipId, title, embedUrls, day, tick } | null,
  metNpcIds: [],                                 // Phase 7 — Hot Singles the player said hi to
}
```

### `browser.afterHoursView` (Phase 2)

```js
{
  view: 'home' | 'search' | 'category' | 'player' | 'history' | 'liked'
      | 'hotsingles' | 'hot-single' | '404',
  params: { query, catId, clipId, npcId },
  stack: [ { view, params } ],   // internal history for the site's own back/forward
}
```

Also `browser.afterHoursSourcePages = { ph: 1, ep: 1 }` (Phase 1) — per-source
page cursors so "Next Page" advances both feeds. The existing
`afterHoursClipPage` remains the UI-facing "result page" number.

### Hot Single NPC (Phase 7)

```js
// world.hotSinglesRoster: [ { npcId: 'hot_single_1', ... } ] — id list/record
// mirroring world.escortRoster. The NPC itself is a full gameState.npcs entry
// via createExternalNpc(gs, 'hot_single_<n>', 'hot_single_<n>', 'Hot Single'),
// plus a generation-time deviant skew (see Locked decision 19):
//   npc.bible.deviantLevel            // 0..1, derived from the re-rolled temperament
//   npc.bible.temperament             // volatility/openness biased high
//   npc.bible.personality.traits      // adult-leaning trait pool
```

### Sources — verified endpoints and shapes

**Pornhub** (`root.superFetch`, JSON):
`https://www.pornhub.com/webmasters/search?thumbsize=medium&page=N&search=Q`
→ `{ videos: [{ video_id, title, duration ("MM:SS" string), views, rating,
default_thumb, thumb, thumbs:[{src}], url, embed_url }], totalPages }`.
No duration filter (a `max_duration` param is silently ignored). Pix-cdn77
thumbs are MP4 previews — keep the JPG/PNG preference. **Date field present
despite the older note: `publish_date` ("YYYY-MM-DD HH:MM:SS") is returned
and now fed to `addedDaysAgo` (see Handoff).**
Embed: `https://www.pornhub.com/embed/{videoId}`.

**Eporner** (plain `fetch`, JSON, no key/CORS/proxy):
`https://www.eporner.com/api/v2/video/search/?query=Q&per_page=N&page=N&format=json&thumbsize=medium&order=latest`
→ `{ count, per_page, page, total_count, total_pages, videos: [{ id, title,
keywords, views, rate, url, added, length_sec, length_min, embed,
default_thumb, thumbs:{ small, medium, large, large_wide, huge_wide } }] }`.
Embed: `https://www.eporner.com/embed/{id}`. Detail/categories endpoints
return empty — never call them. Direct browser fetch only (see Handoff).

Both are verified live as of 2026-08-05; re-confirm in Phase 1 before
trusting the shapes.

---

## Implementation phases

### Phase 1 — The blend: adapters, dedup, host-switch player

**Goal:** Search/category results are one seamless blended feed. Each card
shows a source badge and a "N sources" count when a cross-post merged; the
player can switch hosts when both sites carry the clip.

**Files:**
- `src/srcfiles/afterhours.js` (**new**; Phase 1 ships only the adapter layer,
  the full site relocates here in Phase 2): `AH_SOURCES = { ph: { search(q,
  page) }, ep: { search(q, page) } }`, `normalizePhVideo(v)`,
  `normalizeEpVideo(v)`, `parseDuration`, `normalizeTitle(s)` (lowercase,
  strip studio/filler prefixes), `blendResults({ph, ep})` (dedup by
  normalized-title + duration ±10%, round-robin interleave, ≤2 same-source in
  a row, per-clip `sources`).
- `src/srcfiles/ui.computer.js`: `fetchAfterHoursClips(catId)` (line 490)
  refactored to fan out to both sources in parallel, blend, and write
  `browser.afterHoursClips`. Keep the existing staleness guard
  (`browser.afterHoursCategory !== catId`) and the loading/error state.
- `src/srcfiles/computer.js`: `defaultComputerState` (line 47) gains
  `afterHoursSourcePages: { ph: 1, ep: 1 }`.
- `src/srcfiles/render.computer.js`: grid cards gain the source badge +
  host count; the watch panel gains a host-switch row (PH / EP chips) that
  swaps `iframe.src` between `clip.embedUrls.ph/ep` and the fallback bar's
  `watchUrl` — **both iframe variants carry the identical sandbox +
  referrerpolicy attributes** (the existing block at render.computer.js
  ~440-450 is the template; don't regress it).
- `src/srcfiles/config.js`: `AH_TUNING` (blend weights 50/50, per-page count,
  dedup duration tolerance ±10%, source order).
- `main.html`: `.ah-source-badge`, `.ah-host-switch` styles; add the
  `afterhours.js` script tag **after `ui.computer.js`** (before
  `ui.windowmanager.js`) and update the load-order comment at main.html:2255;
  bump `?v=` on every changed script tag.

**Verification (live page, browser_eval):** search a term that hits both
sites (e.g. "milf") — the grid contains PH and EP cards with correct badges;
a known cross-posted title renders as one card with "2 sources"; the player's
host switch changes `iframe.src` without a page reload and **both** hosts'
iframes still carry `sandbox="allow-scripts allow-same-origin"` +
`referrerpolicy="no-referrer"`; a category browse + pagination behaves as
before (Next Page advances both source cursors); with Eporner unreachable the
feed degrades to PH-only with no error state; interruption memory text still
works (regression: interruption.js clip lookup untouched).

### Phase 2 — The site shell: router, nav chrome, footer/404, skeleton, seed

**Goal:** AfterHours is a routed mini-site. All existing AfterHours render +
handler code relocates into `afterhours.js` behind `AH.render(body, gs, site)`
(`renderAfterHours`, render.computer.js:233, becomes a one-line delegate, so
the phone's shared-renderer path is untouched). The site header carries a
fake read-only address bar + internal back/forward; a footer, a 404, skeleton
loading, and the per-playthrough seed arrive.

**Files:**
- `src/srcfiles/afterhours.js`: `AH_VIEWS` view renderer registry, `ahNav(view,
  params)` (pushes `browser.afterHoursView.stack`), `ahBack()`/`ahForward()`,
  `AH_SEED = seededRng(meta.seed, 'afterhours')` (used for the seed-derived
  branding — site tagline, ad rotation offset, ticker baseline), the footer
  renderer, the 404 view, skeleton grid renderer, and the address-bar
  readout. **All** AfterHours renderers/handlers move here; the site's
  `browser.ah-*` action names stay so ui.js's dispatch (ui.js:1620-1644) is
  unchanged apart from where the functions live.
- `src/srcfiles/computer.js`: `defaultComputerState` gains
  `afterHoursView: { view:'home', params:{}, stack:[] }` and `afterHoursSeed`.
- `src/srcfiles/config.js`: `AH_TUNING` gains route names and skeleton timing.
- `main.html`: `.ah-addressbar`, `.ah-footer`, `.ah-skeleton`,
  `.ah-toast-layer` styles; `?v=` bumps.

**Verification:** navigate categories → search → player and back/forward
through the site's own stack; the address bar shows matching fake URLs;
typing gibberish in the address bar (an input on the site header) lands on
the 404 view with a working "Back to Home" link; skeleton renders while a
row loads; the same save shows identical seed-derived branding across a
reload and different saves show different branding; the site renders
identically on the phone shell (data-device parity).

### Phase 3 — Player page + related rail + comments

**Goal:** `/watch/<id>` is a real page: full meta, heart, share → toast,
"Up Next" rail, "More Like This" + "Because you watched" rows, and a
deterministic seeded comments section. **The masturbate/cum/session mechanic
moves over verbatim** — regression-proof it first.

**Files:**
- `src/srcfiles/afterhours.js`: the `player` view; `fetchRelated(clip)` — one
  blended search per top keyword, rows deduped against the current clip;
  `renderComments(clip)` — seeded commenter pool (usernames/avatars/
  timestamps/text pools) keyed `seededRng(AH_SEED, 'comments:'+clipId)`, so
  the same clip shows the same comments across re-renders; "Like" toggle;
  "Share" → fake link + toast.
- `src/srcfiles/ui.computer.js`: `doAfterHoursWatch` (line 443) rewires to
  `ahNav('player', { clipId })`; session/cum/stop handlers preserved.
- `main.html`: `.ah-player-layout`, `.ah-rail`, `.ah-comments`, `.ah-related-*`
  styles; `?v=` bumps.

**Verification:** clicking a card lands on the player view (not a panel above
the grid); the rail and both related rows populate with real thumbs and never
repeat the current clip; heart toggles; Share copies and toasts; the same
clip renders identical comments across re-renders; **the full masturbate →
warmup → cum → interruption flow still works** (this is the critical
regression check); back returns to the previous view with scroll/watch state
sane.

### Phase 4 — Homepage + discovery rows + search filters

**Goal:** The homepage looks like a site: featured carousel, category tiles
with live thumbs, Trending Now / New Releases / Top Rated, Continue Watching,
Recommended for You. The search view gains client-side sort (relevance /
newest / top rated) and a source filter (All / PH / EP); duration chips
display but don't filter (neither API honors them).

**Files:**
- `src/srcfiles/afterhours.js`: `home` view + `fetchRow(sectionId, query)`
  reusing the Phase 1 pipeline; carousel; search view filters; a small
  per-session in-memory result cache (`browser.afterHoursCache`, keyed
  `sectionId:page`, cleared on category change) so returning home doesn't
  refetch rows the player already saw.
- `src/srcfiles/config.js`: `AH_TUNING.homeSections` (which rows, their
  queries and order).
- `src/srcfiles/computer.js`: `defaultComputerState` gains
  `afterHoursCache` and the search view's active-filter state.
- `main.html`: `.ah-carousel`, `.ah-row`, `.ah-cat-tile` styles; `?v=` bumps.

**Verification:** home renders ≥4 distinct rows each populated with a PH/EP
mix; Continue Watching shows the last-watched clip; Recommended reflects a
real query derived from history keywords; the search sort control re-orders
the blended page (best-effort — Pornhub's date-less clips sort sensibly);
the source filter actually filters; navigating away and back reuses cached
rows without visible refetch.

### Phase 5 — Ad network, live ticker, toasts

**Goal:** The campy ad slots, the "watching now" counter, and notification
toasts make the site feel alive. All autonomous animation on
AfterHours-managed lifecycle timers (Locked decision 14).

**Files:**
- `src/srcfiles/defs.computer.js`: `AH_ADS` — the parody ad copy pool
  (HornyGoat™, Hot MILFs in YOUR area, visitor #1,000,000, casino, fake
  browser-update), each entry `{ slot: 'banner'|'skyscraper', copy, cta }`.
- `src/srcfiles/afterhours.js`: `renderAdSlot(slot)` (rotates on a
  `setInterval` owned by the AH module lifecycle — started on site open,
  cleared on close; close button swaps to a new ad), `renderTicker()`
  ("12,483 watching now" ticking up/down via direct DOM writes), `spawnToast(text)`
  into the `.ah-toast-layer` with auto-dismiss.
- `main.html`: `.ah-ad-*`, `.ah-ticker`, `.ah-toast` + animations; `?v=` bumps.

**Verification:** ad slots appear on home/search/player and rotate on
interval; a fake close button replaces the ad; the ticker counts up and down
without a page re-render; toasts stack and auto-dismiss; closing the site
stops all timers (no leaked intervals — check via repeated open/close);
ad copy and toasts are pure authored text (no API-derived strings here, so
innerHTML is fine — but see invariant 2).

### Phase 6 — Persistence + resume + interruption memory flavour

**Goal:** Watching is remembered across saves and reloads. `world.afterHours`
persists history/liked/searchHistory/continueWatching; re-opening the site
offers "Continue Watching"; the interruption memory line draws from real
history when no clip is active.

**Files:**
- `src/srcfiles/state.js`: `defaultAfterHoursState()`; lazy-init
  `gameState.world.afterHours` in `saveAtBoundary` (the `world.phone` pattern,
  state.js:458) and `queueWrite('world', 'afterHours', ...)` alongside the
  other world sub-keys (state.js:416 block); init in `buildGameState` /
  `writeGeneratedGameState` (the visit/escortRoster precedent, state.js:823).
- `src/srcfiles/afterhours.js`: record-on-watch (history + continueWatching),
  like/unlike, search-history recording, the home "Continue Watching" tile.
- `src/srcfiles/interruption.js`: the masturbation memory text (line 215)
  falls back to the most recent `world.afterHours.history` title.
- `main.html`: `?v=` bumps on changed scripts.

**Verification:** watch a clip, like two, close the computer; reload the save
→ history/liked/search history all survive; Continue Watching resumes the
last clip (its stored embeds re-open the player without a fresh search);
history is capped at its limit (oldest dropped); cumming with no active clip
produces an interruption memory referencing the most recent history title.

### Phase 7 — Hot Singles: the roster, profiles, "Say hi"

**Goal:** The site's "Hot Singles in your area" section is real: a
deterministic roster of full NPCs with profiles, a "Say hi" flow that grants
`contactKnown` + a first IM (so they enter the phone's IM app), and a
deviant-skewed personality.

**Files:**
- `src/srcfiles/sim.js`: `ensureHotSinglesRoster(gameState)` — mirrors
  `ensureEscortRoster` (sim.js, near line 448-501): deterministic
  pre-generation of ~6 `hot_single_1..6`, idempotent + backfilled (new-game
  write, day rollover, first browse) so old saves pick it up. Also init
  `world.hotSinglesRoster` in `buildGameState`.
- `src/srcfiles/computer.js`: `createExternalNpc` gains an optional
  `{ deviant: 0..1 }` skew (re-roll `volatility`/`openness` toward the high
  end, draw traits from an adult-leaning pool, set `bible.deviantLevel`);
  a thin `createHotSingleNpc` wrapper calling it with
  `'Hot Single'` as the occupation title.
- `src/srcfiles/afterhours.js`: `hotsingles` browse view + `hot-single`
  profile view; "Say hi" → sets `npc.contactKnown = true`, appends to
  `world.afterHours.metNpcIds`, delivers a seeded opening line via
  `processNpcImMessages` (the IM path used by tutorial milestones), and toasts.
- `src/srcfiles/state.js`: persist `world.hotSinglesRoster` (the
  `escortRoster` precedent).
- `src/srcfiles/config.js`: `AH_HOT_SINGLES_TUNING` (roster size ~6, deviant
  skew strength, opening-line pool).
- `main.html`: `.ah-hotsingle-*` styles; `?v=` bumps.

**Verification:** roster is deterministic (same 6 singles every load of the
same save); each is a full `gameState.npcs` entry with skewed
volatility/openness and a `deviantLevel` in [0,1]; profiles render; "Say hi"
grants contact + a first IM that lands in the phone's IM app; the roster
round-trips save/load; no payment mechanic anywhere; with `mature` off the
whole section (and roster entry points) is hidden.

### Phase 8 — Hot Singles relationships + deviant integration

**Goal:** Hot Singles live in the world: invite-over visits, full
relationship machinery (befriend, romance), and move-in via the existing
offer/accept path. Their deviant skew has real mechanical teeth.

**Files:**
- `src/srcfiles/afterhours.js`: "Invite Over" on the profile — writes a
  `purpose:'social'` visit (mirroring the IM invite-over flow at ui.js:1024),
  tagged `sourceId: 'ah-<npcId>'` so narration can flavour it as "the person
  you met on AfterHours".
- `src/srcfiles/ui.js`: visit-arrival narration flavour for `ah-*` visits.
- `src/srcfiles/sim.js`: any visit-activity text the spine needs for Hot
  Single guests (reuses `VISIT_TUNING.activities`, config.js:714).
- `src/srcfiles/interruption.js`: `deviantLevel` scales the
  `personalityWeights.volatility` term (interruption config, config.js ~2492)
  so a high-deviant Hot Single genuinely is more likely to wander in — a
  deliberate, on-brand effect. Tunable via `AH_HOT_SINGLES_TUNING`; if it
  proves obnoxious in playtest, clamp it — flag in the Handoff.
- `src/srcfiles/prompt.js`: `bible.deviantLevel` surfaced in the NPC context
  block (the `assembleContext`/`buildNpcBlockV2` area) so conversation can
  naturally read more forward without hard-coding lines.
- Move-in: **no new code** — the external-world offer/accept flow
  (`acceptApplicant`, computer.js) already handles any eligible external NPC.

**Verification:** invite a Hot Single → they arrive as a visitor, are
talkable, follow the player through common rooms, and interact with
residents; a relationship develops through normal conversation; the move-in
offer/accept path works for them with zero new move-in code; interruption
rolls for a high-deviant single exceed a low-deviant roommate's; the full
playtest: meet on site → chat → invite over → romance → move in.

---

## Status — ALL PHASES COMPLETE

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** | The blend: PH+EP adapters, normalization, dedup, interleave, source badges, host-switch player |
| 2 | **Done** | Site shell: router + address bar + footer/404 + skeletons + per-playthrough seed; AfterHours relocated to afterhours.js |
| 3 | **Done** | Player page + Up Next / More Like This / Because-you-watched + seeded comments (masturbation mechanic moves intact) |
| 4 | **Done** | Homepage rows (carousel, categories, trending/new/rated, continue, recommended) + search filters |
| 5 | **Done** | Campy ad network, live watching-now ticker, toasts |
| 6 | **Done** | world.afterHours persistence, continue-watching resume, interruption memory flavour |
| 7 | **Done** | Hot Singles: deterministic roster, deviant-skewed profiles, Say-hi → contact |
| 8 | **Done** | Hot Single visits, romance, move-in; deviantLevel drives interruption/prompt |

## Dependency order

```
Phase 1 (blend) ──► Phase 2 (shell) ──► Phase 3 (player) ──► Phase 4 (home)
   └─► Phase 5 (ads) — needs only 2; can slot anywhere after it
   Phase 3 ──► Phase 6 (persistence) ──► Phase 7 (Hot Singles)
   Phase 7 ──► Phase 8 (relationships + deviant integration)
```

Phase 1 is the hard prerequisite — every view in 2–4 is a blended search.
Phase 2 must precede 3 (the player is a routed view) and 5 (timers hang off
the module lifecycle). Phase 6 before 7 (`world.afterHours.metNpcIds` lives
there). Phase 8 needs 7 and the built external-world contact/visit/move-in
infrastructure.

---

## Open questions (parked, none blocking)

- **Blend weights and per-page counts** — measured in Phase 1: both APIs
  honor 30/page (`AH_TUNING.perPage: 30`, 50/50 weights) → 60 clips per
  blended page. Pornhub's search ordering param was not probed; revisit for
  "New Releases" in Phase 4.
- **Interruption scaling for deviant Hot Singles** — the volatility hook is
  intended, but the multiplier is a proposed default; clamp if playtest says
  it's annoying (flag in the Handoff).
- **"Invite Over" threshold** — free once `contactKnown`, or after a chat
  threshold? Free-but-flavoured proposed; tune in Phase 8.
- **History/liked caps** — 100 / 200 proposed defaults.
- **Comments seeding scope** — per-save (via `AH_SEED`) proposed, so the same
  save's site feels consistent; a future plan could store player-authored
  comments.
- **Fake-virus prank layer** — parked by the user; this plan deliberately
  excludes it. A future plan building on Phase 5's toast/timer machinery
  would be a natural home.

## Design invariants

1. **Privacy posture is unchanged and absolute.** Every embed iframe
   (Pornhub AND Eporner) keeps `sandbox="allow-scripts allow-same-origin"`
   + `referrerpolicy="no-referrer"`; the only new-tab escape anywhere is the
   explicit "Watch on site →" parent-side `window.open`. No new popups, ever.
2. **All third-party API output goes through `textContent` / node creation,
   never `innerHTML`.** Authored chrome (ad copy, comments pools, toasts) may
   use `innerHTML`; anything derived from the two APIs may not. Existing
   precedent: the clip cards and iframe fallback in render.computer.js.
3. **Both devices stay in sync.** Computer and phone render the same
   AfterHours through the shared renderer + `data-device` dispatch. No
   device-only paths, ever.
4. **Mature content flag still gates the whole site** — Hot Singles included.
5. **Eporner is always direct `fetch`; Pornhub always `root.superFetch`.**
   Each source degrades independently.
6. **Determinism.** All generated site content derives from
   `seededRng(meta.seed, 'afterhours')` — stable within a save across
   re-renders and reloads, never `Math.random`.
7. **No timers scheduled from a render pass.** Autonomous animation runs on
   AfterHours-managed lifecycle timers mutating DOM directly, started when
   the site opens and stopped when it closes.
8. **The masturbate/cum/session mechanic survives intact** — a regression
   risk on the Phase 3 player-page move; verify before anything else in that
   phase.
9. **No AI generation for the site's chrome** (no generateImage/generateText
   for ads, comments, or art). The sim's LLM is untouched except the Phase 8
   `deviantLevel` context line.
10. **Hot Singles are full NPCs**, never vendor bots (inherits external-world
    invariant 6) — same bible, memory, and relationship depth as any resident.
11. **No minigames, no Shorts, no fake-virus prompts** in this plan
    (explicitly deferred by the user).
