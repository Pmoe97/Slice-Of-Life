# Actions & Activities Overhaul — filling the apartment with things to do

Status: **planned — not started**. Design session complete 2026-08-30; a
partner design-review session complete 2026-08-31 (D30–D36 added, Pets cut,
sauna placement locked, file references fixed against the live codebase).
The design gate is clear — only Q4 (cook-off judging/stakes) is still
parked, and it's deferred to Phase 17, far downstream. Last updated
2026-08-31.

Companions:
- `src/src/ref/complete/asks-and-attachments-plan.md` (the Ask system this plan's
  invitation system is built ON — read it before touching `asks.js`)
- `src/src/ref/complete/action-outcome-window-plan.md` (the `ActionWindow` every
  new verb resolves through; `sit`/`set_meal` already prove the pattern)
- `src/src/ref/complete/npc-initiative-plan.md` + `npc-initiative-retiming-plan.md`
  (the overture system this plan extends with reverse asks and event invites)
- `src/src/ref/complete/intimacy-and-voyeurism-overhaul-plan.md` (the willingness
  gate, wardrobe, peep/stealth, and music-device sound substrate this plan
  respects and extends)
- `src/src/ref/complete/food-overhaul-plan.md` (the cooking engine + `taste.js`
  the cook-off reuses whole)
- `src/src/ref/complete/floorplan-and-movement-plan.md` + `src/src/ref/complete/npc-avatar-liveliness-and-movement-plan.md`
  (the spatial graph and the movement-presentation layer the Follow mechanic
  rides)
- `src/src/ref/complete/action-outcome-window-handoff-prompt.md` (the session protocol
  shape a later handoff prompt for THIS plan will mirror)
- `src/src/ref/complete/player-creation-and-intro-plan.md` (the player
  `physical.intimate` layer / fail-closed gate that any new intimate-adjacent
  verb must route through)

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session. Its paired
`actions-and-activities-handoff-prompt.md` (same folder) is the prompt every
implementation session should be handed verbatim.

---

## Handoff — read this first

**Resume at:** Phase 19 (Audio & sound track — D29). Phase 17 is done, Phase
18 is retired. **P19 is genuinely the last unstarted phase** — it can proceed
whenever (D29: "parallel, any time"). If Phase 19 is also done by the time
you read this, every phase 1–19 (excluding retired 18) is Done — stop and
report completion to the user rather than looking for more work. Q4
(cook-off judging weights/stakes, D14) is STILL open — Phase 17 confirmed it
never touches the cook-off ask leaf (checked: `COMMITMENT_KINDS.party` is a
separate kind from a hypothetical `cook_off`, and Phase 17's own Files line
never named `taste.js`), so this remains parked for whichever future session
actually builds the cook-off event type — stop and ask rather than inventing
the weights if that day comes.

**Phase 17 (House Parties + Touring, D26–D27) — implementation, 2026-09-02.**
Two independent features, both riding existing spines rather than inventing
new ones (D60–D62 record the real design calls made along the way — read
those before touching any of this).

**House Party.** `COMMITMENT_KINDS.party` (config.js, next to `pool_party` —
the plan's Files line guessed `commitments.js`, the real home followed
`pool_party`'s own precedent instead): `{ block: 'leisure', label: 'a house
party', boundActivity: 'partying', roomId: 'living_room' }`, deliberately
NOT `playerInvitable`. `ASK_PARTY` (id `HouseParty`, `$HouseParty
<Optional>`, asks.js, in the existing `invite` category alongside
`ASK_INVITE`) is its own leaf — bespoke wording per `pool_party`'s own
comment naming this exact need — `schedule: true`, `kind: 'party'`, decide()
byte-identical to `ASK_INVITE`'s formula, and it returns `inviteExtraIds`
(via the SAME `inviteExtraGuestsFromFlavor` `$Invite` uses) so
`runAskScheduleFlow` (ui.js, unmodified — that field is leaf-agnostic
already) books every named extra guest for free. `PARTY_TUNING` (config.js,
after `DIRT_TUNING`): `dirtPerTickPerGuest` (0.006), `attendeeMoodPerTick`
(0.01), `annoyanceMoodPerIntensity`/`annoyanceMoodCap`, `complainThreshold`
(0.2 — see D60 for the real propagation math that number is calibrated
against), `complainChancePerTick` (0.12), `complainMoodDelta`, and
`complaintLines`. The actual party "running" is a new Pass 2 block in
sim.js's `resolveTick`, inserted right after the existing dirt foot-traffic
block, riding the SAME per-NPC loop (same "narrowest real hook" precedent):
`activePartyCommitmentInRoom(gameState, roomId)` (commitments.js, new,
mirrors `activeMealCommitmentsInRoom` but singular) splits every awake
resident into an ATTENDEE branch (physically in the live party's room —
present-based like `mealAttendees`, not `acceptedIds`-based: bumps dirt,
emits a real `party_noise` transient at `SIGNALS_EMIT.partyNoise` (0.65),
gets a small mood lift) and a LISTENER branch (anyone else who can perceive
`party_noise` through the signal layer: an annoyance mood malus scaled by
arrived intensity, and past `complainThreshold` a chance-gated `party_loud`
event — same threshold/chance/event shape as `music_too_loud`, `EVENT_
IMPORTANCE`/`EVENT_EMOTION` both classify it `social`/`argument` to match).
**No new placement code was needed** — `activeCommitmentFor` (the SAME
mechanism `meal`/`hangout` already use) relocates an accepted party attendee
to `living_room` for the window automatically, since `party` is now a real
`COMMITMENT_KINDS` entry; this was verified live in the harness (section 8),
not assumed. The new `party_noise` `SIGNAL_DEFS` entry (config.js) is its own
signal id, not a reuse of `voices` — deliberately, so an ordinary two-person
`chat_with_roommate` can never read as (or force retuning against) a party.

**Touring.** `ASK_TOUR` (id `ShowAround`, `$ShowAround <Optional>`, asks.js,
in the existing `follow` category alongside `ASK_FOLLOW`) is an IMMEDIATE
leaf — no `schedule: true`, no `COMMITMENT_KINDS` entry at all, because D27
reads as "want the grand tour, right now" rather than a future booking.
decide()/available() are byte-identical to `ASK_FOLLOW`'s (plus one more
gate: already-touring blocks a re-ask). On accept, `postEffects` sets BOTH
`npc.follow = { leader: 'player', sinceDay }` (Follow's own record, unchanged
shape) AND `npc.touring = { visited: [] }` — the tour rides Follow's
existing room-by-room presentation rather than a new scripted walk system
(confirmed absent from the codebase before this phase: no "beat"/multi-stop
walk concept existed anywhere). `TOUR_STOPS` (config.js): one authored,
`{name}`-templated line per curated room — every common room except both
bathrooms (`isPrivacyRoom` would refuse them anyway) plus the player's own
bedroom as the closing stop, 12 rooms total. `advanceTouring(gameState,
leaderId, roomId)` (movement.js, new, next to `advanceFollowers`) is called
from `doMove` (ui.js) right after the existing follow-release narration
loop, for the room the player actually arrived in (destination-only, same
convention as `walkNarration` itself — not per room crossed mid-route): it
fires each touring npc's beat for a newly-visited stop exactly once, and on
the LAST stop fires a second wrap-up beat, clears both `follow`/`touring`,
and pays out `TOUR_TUNING.completeMoodDelta`/`completeRelDelta` as a direct
write (clamped, mirroring `applyMoodDeltaEffect`/`applyRelDeltaEffect`'s own
clamp — there's no `executeAction` call here to route through the DSL, same
reasoning `advanceFollowers` already uses for writing `npc.location`
directly). Follow's three existing release sites (`advanceFollowers`'s
privacy-room refusal, `doStopFollowing`, sim.js Pass 1's sleep/off-site
release) each now also clear `npc.touring`, so a tour never outlives the
Follow relationship it rides.

**Real identifiers for the next session.** `activePartyCommitmentInRoom`
(commitments.js), `advanceTouring` (movement.js), `ASK_PARTY`/`ASK_TOUR`
(asks.js, ids `HouseParty`/`ShowAround`), `PARTY_TUNING`/`TOUR_STOPS`/
`TOUR_TUNING`/`COMMITMENT_KINDS.party` (config.js). No new files were
created this phase, so `loadgame.js`'s `ORDER` array needed no changes —
only `index.html`'s `?v=` bumps: config 171→172, sim 97→98, commitments
14→15, movement 3→4, asks 17→18, ui 156→157. New `.claude/launch.json` entry
`slice-of-life-aa-p17` (port 8742) — the same concurrent-sessions reasoning
Phases 15/16 recorded (worktrees for at least two other sessions were
visible on disk this session, `.claude/worktrees/*`).

**Not built this phase, deliberately.** See D62: no party "quality" score
from food/drink/catering — D26 names them as things a party has, not things
this phase's own Verification asked to score, and music needed zero new
code since `SOUND_DEVICE_DEFS.music`'s existing per-tick pass already
applies in any room regardless of what commitment is active there. See D60:
no off-map "neighbor" complaint system — none exists anywhere in this
engine (D28's own boundary), so party noise reactions are modeled as
in-house roommates through the existing signal layer, exactly like every
other noise reaction already in the game. Multiple simultaneous attendees do
NOT stack `party_noise` intensity (a listener's `perceiveSignals` read keeps
only the single loudest matching record, same as every other signal) — a
5-guest party reads no louder to a listener than a 1-guest one; a future
session wanting headcount to matter would need to sum matching records
instead of taking the max, a real, separable change.

**Verification.** `node src/src/dev/verify/verify-aa-p17.js` — new harness,
51/51 passing: registration (both new leaves in their categories,
`COMMITMENT_KINDS.party`'s shape and non-`playerInvitable` flag, both new
tuning buckets, `TOUR_STOPS`' curated room list and bathroom exclusion, the
new `party_noise` signal, the `EVENT_IMPORTANCE`/`EVENT_EMOTION` entries);
`ASK_PARTY.decide()` (flavor-blind verdict, multi-guest parsing via the SAME
`inviteExtraGuestsFromFlavor` `$Invite` uses) and a real `createCommitment
('party', ...)` booking (host, room, independent per-guest accept/decline);
`ASK_TOUR`'s available()/decide()/postEffects (both `follow` and `touring`
set together); `advanceTouring` (one beat per new stop, `{name}`
substitution, never refires, skips a balked follower, the final stop's
two-beat wrap-up with the clamped reward); `advanceFollowers`'s privacy-room
refusal now clearing `npc.touring` too; and — the load-bearing section —
REAL per-tick wiring through `resolveTick`: an accepted party attendee gets
placed in the party's room by the EXISTING `activeCommitmentFor` scheduler
(no new placement code), room dirt rises beyond plain foot traffic, a real
`party_noise` transient appears in `world.signals`, the attendee's mood
lifts, and — run across real simulated exposure — a resident one room away
gets a genuine `party_loud` complaint event (never when no party is booked
at all, proving the gate is real and not a background chance).
`node src/src/dev/verify/run-all.js` (full, unfiltered) — **3913 passed / 84
failed / 12 errored.** Phase 16's own recorded baseline was 3863/83/12; the
+51 passed is entirely this phase's new harness (confirmed: 3913 − 51 =
3862, one LESS than baseline, and failed went 83→84 — a net +1 failure that
is NOT this phase's). Investigated rather than assumed: the extra failure is
`verify-w1.js`'s "exactly the four D5 submenu parents exist" assertion,
about `ACTION_DEFS` submenu-parent shapes in `defs.actions.js` — a file this
phase never touched, already showing as modified/uncommitted in `git status`
at this session's very start (this repo has other uncommitted, concurrent
session work sitting in it — see the worktrees note above and the
`parallel-perchance-ai-sessions` memory). Re-ran the full sweep twice;
`3913/84/12` was identical both times (deterministic, not a flake). Two
PRE-EXISTING harnesses needed a one-line relaxation because they asserted an
exact category membership this phase legitimately extended:
`verify-aa-p1.js` ("exactly one 'invite' category, holding exactly Invite" →
"holding Invite", `ASK_PARTY` now shares that category) and `verify-aa-p6.js`
("exactly FollowMe" → "holding FollowMe", `ASK_TOUR` now shares that
category) — both now assert inclusion rather than exclusivity, with a
comment pointing at `verify-aa-p17.js` for the new member's own coverage.
**Live-verified** in `dev-harness.html`'s Sandbox mode (1 rolled roommate,
Viola): opened the Request menu on her — the `invite` category shows
"Throw a Party" right below "Invite" with its own help text
(`<optional: who else — e.g. with Elena and Marcus>`); the `follow` category
shows "Show Them Around" right below "Follow Me". Sent a bare `$ShowAround`
— Viola accepted ("Viola nods — sure, they'd like that."), the Social bar
immediately offered "Ask Viola to Stop Following" (confirming `npc.follow`
was set), and walking room-to-room fired real, `{name}`-substituted beats
live: entering the Living Room printed "You walk Viola into the living room
— the real center of the place, you explain, ..." and the next move to the
Dining Room printed "And this is where we actually sit down to eat," you
say, walking Viola past the ...' — sequential, no repeats, exactly as
`advanceTouring` computes. The party booking flow itself (the calendar
modal + `createCommitment`) was NOT separately clicked through live: it is
100% shared, unmodified code (`runAskScheduleFlow`, `openAskScheduleModal`)
already proven live-working for three sibling leaves in earlier phases, and
`ASK_PARTY`'s own registration/decide/booking got full Node coverage above.
Zero new console errors beyond the pre-existing, unrelated
`ReferenceError: root is not defined` background-art retry every prior
phase's handoff has already flagged.

**Blockers / flagged deviations (Phase 17):** None. D60–D62 (above) are
real, deliberate design calls this phase had to make where the plan's own
wording was ambiguous or silent (D26's "neighbors/roommates", the party's
real config home, food/drink scoring) — recorded as new locked decisions,
not silent workarounds.

**Phase 16 (Skill research, D25) — implementation, 2026-09-02.** D25's three
pillars — self-directed research (browser + bookshelf), practice actions,
skill-gated verbs — turned out to be mostly ALREADY real by the time this
session read the code (D32's own pattern repeating): `chefs_corner`/`fitcast`/
`codeflow`/`recipes` (SITE_DEFS, defs.computer.js) already grant cooking/
fitness/tech XP on every browser visit (COMPUTER's `visitSite` pushes a fresh
history entry and reapplies `effects` on EVERY visit, not just the first —
already a working, repeatable research loop, never previously exercised by
any verify harness). Several `def.skill` XP grants already existed on real
verbs (`self.cook`, `self.dishes`, `self.lift_weights`, etc.). And
`ACTION_REQUIREMENT_CHECKERS.skillAtLeast` (defs.actions.js) already existed,
fully implemented — a genuine "declared with zero callers" gap, the same
shape as Phase 1B's dead stealth-XP path. This session's real work: the
BOOKSHELF half of research (which had no equivalent at all), a browser site
to give cleaning parity with cooking/fitness/tech, one new skill-gated verb
to give `skillAtLeast` its first real caller, and wiring the previously
orphaned `'art'` `SKILL_IDS` entry (config.js) to a real practice verb.

**Real identifiers.** `RESEARCHABLE_SKILLS` / `RESEARCH_NARRATION` /
`createResearchAction` (defs.actions.js) — **placed BEFORE `const ACTION_DEFS`
in the file**, not near sibling `createHobbyAction` (~2500 lines further
down) the way that factory sits: `ACTION_DEFS`'s object literal calls
`createResearchAction` eagerly inside its own spread
(`...RESEARCHABLE_SKILLS.reduce(...)`), and a `const` referenced before its
own line throws (temporal dead zone) — unlike a hoisted `function`
declaration, which is why `createHobbyAction` itself can stay far below
where `ACTION_DEFS` calls it. If a future session adds a similar
data-table-plus-factory pattern consumed inside `ACTION_DEFS`'s own literal,
it needs the same ordering, not `createHobbyAction`'s. Five new leaves —
`research.cooking` / `research.cleaning` / `research.fitness` /
`research.tech` / `research.art` — one per researchable skill (stealth
deliberately excluded: D32 already settled stealth XP as practice-only).
Each is `source: { kind: 'object', objDefs: ['bookshelf', 'study_bookshelf',
'hobby_bookshelf'] }` (all three bookshelf-shaped OBJECT_DEFS — the living
room's seeded `bookshelf` fixture and the study's seeded `study_bookshelf`
both work from day one, no purchase required, matching D25's "lifestyle, not
a class schedule"), ungated (`requires: []`), `timeCost.base:
RESEARCH_TUNING.minutes` (40), `skill: { id, xp: RESEARCH_TUNING.xp }` (15 —
at `EFFECT_LIMITS.skillXpCap`'s own ceiling, which is fine either side of:
that cap only binds the LLM-validated path, never `def.skill`, which is
ACTIONS' trusted-producer path). `RESEARCH_TUNING`
(config.js, new bucket directly after `HOBBY_TUNING`): `{ minutes: 40, xp:
15, moodGain: 0.05, energyCost: 3 }`. New `self.deep_clean` (defs.actions.js,
directly after `self.clean`) — `requires: ['roomHasDirt',
'skillAtLeast:cleaning:2']` (the checker's first real caller), `skill: {
id: 'cleaning', xp: 6 }`, `timeCost.base: ACTION_TUNING.deepCleanMinutes`
(20) — with its own `prepareDeepClean`/`buildDeepCleanEffects`/
`deepCleanNarration` (mirrors `prepareClean`/`buildCleanEffects`/
`cleanNarration`'s exact shape, but clears the room's WHOLE dirt reading in
one pass rather than `self.clean`'s capped partial step — the skill gate is
the payoff, not an owned item). New `ACTION_TUNING.deepCleanMinutes` (20) /
`deepCleanMoodGain` (0.09) (config.js). `createHobbyAction` (defs.actions.js)
now takes an optional 4th `skill` param — omitted for five of the six hobbies
(unchanged, pure vibe), passed only for `hobby_sketchpad`:
`{ id: 'art', xp: 6 }`, the previously-orphaned `SKILL_IDS` entry's first
real consumer. New `SITE_DEFS.tidyhome` (defs.computer.js, next to
`recipes`) — `effects: ['ADD_SKILL_XP cleaning 6']`, giving cleaning the same
browser-research coverage cooking/fitness/tech already had. `OBJECT_DEFS`
entries `bookshelf` / `study_bookshelf` / `hobby_bookshelf` (defs.world.js)
each gained all five `research.*` ids in their `affords` array (documentation
metadata only — `affords` doesn't itself gate chip availability, `source`
does; see `actionSourceMatches`, actions.js). New `.claude/launch.json` entry
`slice-of-life-aa-p16` (port 8741) — several concurrent sessions on this repo
were visible via `ListAgents` this session (same reasoning Phase 15
recorded). `index.html`'s `?v=` bumps: config 170→171, defs.world 49→50,
defs.actions 51→52, defs.computer 35→36. `skills.js` needed NO code changes
this phase — every primitive it exports (`skillLevel`/`skillMod`/
`awardSkillXp`/`SKILL_CURVES`) was already generic enough; Phase 16's real
work was entirely new DATA consuming that existing engine, not new engine
code, so despite being named in the plan's own "Files" line for this phase,
it's untouched (its `?v=` stays at 19).

**Not built this phase, deliberately.** No runtime "pick a skill to study"
picker (self.cook's async `prepare()`-driven modal is the precedent shape) —
"named skill" is each research leaf's own chip label instead (`Study
Cooking`, `Study Cleaning`, ...), which keeps the whole feature data-plus-
the-existing-generic-machinery, fully Node-testable, and needs zero new
render.js code (render.js is NOT in this phase's Files line, and
`buildActionGroups`'s submenu special-casing per parent object — wardrobe/
lockers/sound/bed/door — would have been REQUIRED to add a submenu-popover
research chip instead of five flat ones; that's real, avoidable scope this
session chose not to take on). No new hobby object for the `'writing'`
`SKILL_IDS` entry — unlike `'art'` (an obvious fit for the existing
`hobby_sketchpad`), `'writing'` has no natural existing object to hang off,
and inventing one (a new placeable item + OBJECT_DEFS + ITEM_DEFS +
DECOR_CATALOG_DEFS + placement footprint + HOBBY_TUNING rows) is real,
separate scope. `'social'` and `'focus'` `SKILL_IDS` entries are ALSO still
orphaned (zero consumers anywhere) — `'social'` would need to touch asks.js
(explicitly out of this phase's Files), and `'focus'` has no obvious hook at
all (it is NOT the same thing as `computeFocusMultiplier`, computer.js's gig-
work productivity term — that reads energy/mood/burnout, never
`player.skills.focus`; a false-cognate a future session should not conflate).
All three remain real, flagged gaps for a future session, not a regression
introduced here. No live LLM polish pass on research narration — the five
`RESEARCH_NARRATION` lines are deterministic authored flavor, same standard
as `HOBBY_NARRATION`'s siblings (invariant 1).

**Verification.** `node src/src/dev/verify/verify-aa-p16.js` — new harness,
33/33 passing: registration (all five research leaves' skill/timeCost/
source/gating shape, `self.deep_clean`'s requires/skill/timeCost, the
`skillAtLeast` checker existing, `SITE_DEFS.tidyhome`, `hobby.sketchpad`'s
new `art` skill with every OTHER hobby confirmed still skill-less, and the
`affords` arrays on all three bookshelf defs); real source-matching
(`actionSourceMatches` true in `living_room`/`study` against their SEEDED
bookshelf objects, false in `kitchen` which has none — proving real object
gating, not a room-wide freebie); the real trusted-producer effect-
application sequence (`buildEffects`/`effects` + the declarative
`ADD_SKILL_XP` append + `applyEffects`, mirroring `actions.js`'s
`executeAction` lines ~165-171 exactly) actually raising tech XP for
`research.tech` and art XP for `hobby.sketchpad` — **note:** a full
`executeAction()` happy-path call was NOT used for this (confirmed by
hitting it directly first): `executeAction` unconditionally reaches
`advanceAndResolveMinutes` (time.js), which reads the bare global
`currentGameState` with no `typeof` guard and throws in the bare Node vm —
this is the SAME documented boundary verify-w11.js's own header already
names ("the refusal paths that return BEFORE the clock moves are fully
covered here... the clock-advance half needs ui.js + the DOM"), not a new
gap; `self.deep_clean`'s gate closed at cleaning level 0 and level 1 (even
with real dirt present), opening at EXACTLY level 2, with the `skillAtLeast`
checker itself probed in isolation too; a full one-pass clear (the whole
dirt reading, not `self.clean`'s capped step) once unlocked; a **D32-style
measured example** — a fresh player crosses the cleaning level-2 threshold
through bookshelf research ALONE in 11 sessions (well within a "reasonable
number"), with `cleanEfficiency` measurably improving alongside it;
`visitSite('tidyhome')` resolving for real and its DSL line repeatably
raising cleaning XP on a second application (not a one-shot bonus); and a
plain JSON round-trip proving `player.skills` (every researched/practiced
skill: cooking/cleaning/fitness/tech/art/stealth) survives save/load intact.
`node src/src/dev/verify/run-all.js` (full, unfiltered) — **3863 passed / 83
failed / 12 errored**, i.e. exactly the Phase 15 baseline (3830/83/12) plus
this harness's own 33, with the same 12 named harnesses erroring and the
same `verify-w6`/`verify-w9` failures as before — all pre-existing and
unrelated to this plan. **Live-verified** in `dev-harness.html`'s Sandbox
mode (0 rolled roommates): from the Living Room, all five `Study ___` chips
render and read correctly against the seeded `bookshelf` fixture with zero
purchase; clicking `Study Cleaning` produced the real outcome window (Mood
+0.05, Energy -3, Cleaning XP +15, Time 40 min, the authored narration line)
exactly matching `RESEARCH_TUNING`; with the room dirtied and cleaning skill
directly set to 0 via the console, `Clean Up` appeared but `Deep Clean` did
NOT; raising cleaning skill to 160 (level 2) and re-rendering made `Deep
Clean` appear immediately, and clicking it produced the "done properly...
spotless" narration and cleared the chip (room no longer dirty); moving to
the Study room confirmed the identical five chips render against
`study_bookshelf`; spawning a `hobby_sketchpad` instance and clicking
`Sketch` showed the pre-existing Mood/Energy effects PLUS the new "Art XP
+6" line, confirming the `createHobbyAction` regression is clean. Zero new
console errors (only the pre-existing, unrelated `ReferenceError: root is
not defined` from menu.js's background-art retry, flagged in every prior
phase's handoff, present before this phase's changes too).

**Blockers / flagged deviations (Phase 16):** None. The three remaining
orphaned `SKILL_IDS` entries (`'social'`, `'writing'`, `'focus'`) are a real,
explicitly-scoped-out gap, not a blocker — see "Not built this phase" above
for why each was left alone and what a future session touching skills would
need to do differently for each.

**Phase 15 (Chatter social media layer, D24) — implementation, 2026-09-01.**
`social_feed` (`chatter.example`) GROWS from a static SITE_DEFS flavor page
(recipes/weather-tier authored body text, no state) into a real APP_DEFS app
with its own accumulating feed — the same id, not a second parallel entry
point (D24's own wording: "`social_feed` ... grows"). The substrate for
"posts generated from house events + NPC beliefs/gossip" turned out to
already exist almost entirely: `world.events` (tick-emitted, typed,
`EVENT_IMPORTANCE`-banded) and `npc.memory.facts` (the knowledge-gossip-
memory-plan's belief store, with `factRecency`/`factEmotionalWeight`/
`factPersonalityBias`/`talkativeness` already scoring exactly this kind of
"would this person bring this up" decision for the sibling `npc_chat` gossip-
raise roll, npc.js). Phase 15's real work was a new consumer of that
substrate — a public "would I post about this" score reusing the same
primitives minus `factInterestRelevance` (there's no single listener when
posting publicly) — not a new belief system. Reactions (NPC likes/comments)
are new: `chatterAffinity` reads `world.castWeb` (NPC↔NPC, cast-generation's
own pairwise social axes) or `npc.relPlayer` (NPC↔player, same axes shape)
depending on the post's author, composing an existing signal into one
[-1,1] number — no third relationship ledger.

**Real identifiers.** New `chatter.js` (registered in both `index.html` and
`loadgame.js`'s `ORDER`, directly after `puzzles.js` in both — same "pure
domain module, called at runtime only" slot money.js/mail.js/puzzles.js
already sit in): `CHATTER_TUNING` (`maxBackfillDays: 5`, `maxPostsPerDay: 3`,
`feedRetentionDays: 21`, `postScoreRef: 0.5` — deliberately the same scale as
`TRANSMISSION.raiseScoreRef` since it reuses the same scoring primitives,
`reactionWindowDays: 6`, `likeBaseChance: 0.12`/`likeAffinityWeight: 0.55`,
`commentBaseChance: 0.05`/`commentAffinityWeight: 0.25`), `CHATTER_EVENT_TEMPLATES`/
`CHATTER_FACT_TEMPLATES`/`CHATTER_COMMENT_TEMPLATES` (small mood-bucketed
first-person/gossip-voice wrapper pools — deterministic string templates,
NOT an LLM call; see "not built this phase" below), `chatterEventFirstPerson`
(substitutes `'I'` for `{name}` in an event's raw template — English past
tense doesn't conjugate by person, so this produces grammatical first-person
text without a real rewrite; a deliberate one-line divergence from
`formatEventText`, sim.js, which substitutes the real name for third-person
narration), `chatterEventScore`/`chatterFactScore`/`chatterBestCandidateForDay`
(the "decide" half — one highest-scoring candidate per author per day),
`chatterRenderText` (the "decorate" half — deterministic template fill, no
LLM), `chatterAffinity`/`applyChatterReactions` (the reaction pass — re-rolls
every resident against every post inside `reactionWindowDays` on every
generation call; a "no" isn't sticky), `generateChatterForSingleDay`/
`generateChatterForDay` (the day-watermark catch-up wrapper — `lastGeneratedDay`
rather than puzzles' equality guard, since a feed accumulates instead of
replacing one current puzzle; backfills at most `maxBackfillDays` on a
long-untouched save, same silent-discard philosophy debugLog's own day-window
pruning uses), `pruneChatterFeed`, and the three player verbs
`postChatterAsPlayer`/`toggleChatterLike`/`addChatterComment` (each mints its
own subseed rather than reusing the day's generation rng, since all three are
out-of-band). New `APP_DEFS.social_feed` (defs.computer.js, replacing the
removed `SITE_DEFS.social_feed` in the same commit — label "Chatter", two
screens: `feed` entry + `profile` hideFromNav, the latter doubling as the
player's own profile when `npcId === 'player'` so D24's "a player profile"
goal doesn't need a third screen). New `defaultComputerState().apps.social_feed`
(computer.js: `{ posts: [], lastGeneratedDay: 0, nextPostId: 1 }` — the
generic per-app shallow-merge in `normalizeComputerState` back-fills this for
old saves with zero extra code, verified). New on-open generation hook, ONE
line each, in `computer.js`'s `openApp` and `phone.js`'s `phoneOpenApp` —
mirrors the exact `if (appId === 'puzzles') generatePuzzleForDay(...)`
precedent already living in both functions. New `ICONS.social_feed` (icons.js
— a heart-over-caption-line glyph, distinct from `im`'s speech-bubble;
skipping this is the documented "blank tile" landmine). New
`MOOD_PAYOUTS.chatterPost` (config.js, `0.02`). New `renderChatterFeed`/
`renderChatterProfile`/`chatterScreenParams`/`renderChatterPost` (render.computer.js,
registered in `COMPUTER_RENDERERS` as `'chatter-feed'`/`'chatter-profile'`) —
`chatterScreenParams` mirrors `codexScreenParams` exactly (screen params live
in the window/navStack, never in app state). New `doChatterPost`/
`doChatterLike`/`doChatterComment`/`doChatterOpenProfile`/`chatterScopeForDevice`
(ui.computer.js) — text inputs are read directly by id (`doImSend`'s pattern),
not carried through `extra`; `doChatterOpenProfile` mirrors `doCodexOpenNpc`
exactly including the device-parameterised `switchScreen`. Four new dispatch
cases in `ui.js`'s `handleAction`: `chatter.post`/`chatter.like`/
`chatter.comment` (all read `extra?.rowId`/`extra?.device`, the same
generic-record-id slot `im.send`/`dreams.open-entry` already use — no new
entry needed in the central `data-*` → `extra` parser) and
`chatter.open-profile` (reads the positional `npcId` from `data-npc`, like
`codex.open-npc`). New `.cht-*` CSS block (index.html, right after DailyGrid's
`.pz-*` block, still before the Menu-overhaul responsive rules). New
`.claude/launch.json` entry `slice-of-life-aa-p15` (port 8740) — several
concurrent sessions on this repo were visible via `ListAgents` this session,
so a fresh named port avoided colliding with another session's live server
rather than reusing the bare `slice-of-life` config. `index.html`'s `?v=`
bumps: config 169→170, icons 33→34, defs.computer 34→35, phone 21→22,
computer 70→71, render.computer 58→59, ui.js 155→156, ui.computer 54→55;
`chatter.js` is a new file at v1.

**Not built this phase, deliberately.** No live LLM "polish" pass
(`root.generateText`) on post/comment text — invariant 1 (decide before you
decorate) plus invariant 7 (pure logic Node-testable, presentation live-only)
put a live-only LLM call out of scope for the Node-verifiable core; the
deterministic templates ARE the decided, readable, ship-quality text on their
own (same standard as recipes.js/weather's authored flavor), and a future
session can add an optional live "regenerate with AI" affordance on top
using the exact `asks.js` `draftAskPhotoPrompt` pattern (template first,
`await root.generateText(...)` in a try/catch, template fallback on failure)
without touching chatter.js's decided substance. No nightly/tick-integrated
reaction pass — reactions run inside `generateChatterForDay`'s own
day-by-day loop (seeded, Node-testable) rather than being threaded into
`resolveTick`'s rumination cadence; this was a deliberate blast-radius choice
(D24 doesn't require live-tick reactions, and touching `resolveTick` is a
materially bigger, riskier surface for a first pass). No negative/snarky
NPC comments — a low/negative-affinity reactor can still like/comment at a
reduced rate, but the comment pool stays supportive-or-neutral only
(no modeled cruelty), matching this codebase's existing "drama-first, not
cruelty-first" tone. No separate "who I follow" graph — every current
resident is a Chatter friend by construction (`chatterResidentIds`); no
follow/unfollow verb exists or is needed for the phase goal.

**Verification.** `node src/src/dev/verify/verify-aa-p15.js` — new harness,
40/40 passing: registration (APP_DEFS/ICONS/MOOD_PAYOUTS, and that the old
SITE_DEFS flavor page is gone, not duplicated); pure text helpers
(`chatterEventFirstPerson`'s `{other}` resolution, mood-bucket selection);
candidate selection (a classified event/fact becomes material, an
unclassified ambient event never does, a stale event outside the lookback
window doesn't qualify); seeded determinism + same-day idempotency of
`generateChatterForDay`; the `maxPostsPerDay` cap holding for a single day
even with 8 eligible authors; the backfill watermark jumping straight to
today on a 200-day-stale save while still floor-limiting how far back any
new post can date; feed pruning past `feedRetentionDays`; `chatterAffinity`
correctly reading castWeb for an NPC↔NPC pair and `relPlayer` for NPC↔player,
defaulting to neutral (not crashing) when a pair record is deliberately
absent; `applyChatterReactions` reliably producing at least one like across
5 high-affinity residents; all three player verbs including text
trim/truncate-at-280/empty-rejection and the immediate reaction pass a
player post triggers; and — the same real-function-not-a-stand-in discipline
Phase 14 used — a populated feed (posts, likes, comments, the watermark)
round-tripped through `JSON.parse(JSON.stringify(...))` into the actual
`normalizeComputerState` comes back byte-identical, and a pre-Phase-15 save
with no `apps.social_feed` key at all back-fills cleanly.
`node src/src/dev/verify/run-all.js` (full, unfiltered) — **3830 passed / 83
failed / 12 errored**, i.e. exactly the Phase 14 baseline (3790/83/12) plus
this harness's own 40, with the same 12 named harnesses erroring as before —
all pre-existing and unrelated to this plan. **Live-verified** in
`dev-harness.html`'s Sandbox mode (a fresh Sandbox run with 0 rolled
roommates, so residency/relPlayer/a synthetic post were set directly via the
console for visual coverage — the probabilistic generator itself is what the
Node harness already proves deterministically): opened Chatter from the
phone home grid (real rendered heart icon, not a blank tile) — composed a
player post, liked it (♡ 0 → ♥ 1), replied with a comment, all rendering
correctly with the input clearing and the card updating in place. Injected an
NPC-authored fact-sourced post ("apparently the rent is going up again 👀",
the gossip-voice template) — real avatar-chip initials ring, the "overheard"
source badge (eventRef.kind==='fact' reader), a real comment thread. Clicked
the author's name and confirmed `renderChatterProfile` — hero avatar, name,
`bible.sketch` as the bio line ("26-year-old Hot Single"), and that NPC's own
post history. Opened the SAME app from the computer desktop shell
(`openApp`/`renderComputerScreen`) and confirmed it read the identical feed
state — proving the phone/computer state-sharing contract holds, plus a real
non-blank heart icon in both the taskbar and the window titlebar. Zero new
console errors (only the pre-existing, unrelated `ReferenceError: root is not
defined` this harness already throws from menu.js's background-art retry,
present before this phase's changes too).

**Blockers / flagged deviations (Phase 15):** None. In passing, this session
found a real PRE-EXISTING bug unrelated to this plan, the same shape as
Phase 14's flagged `renderDreamDiary`/`renderDreamEntry` duplicate:
`render.computer.js` also has `codexEmptyState`/`renderCodexRoster`/
`renderCodexDetail` defined TWICE, byte-identical, ~900 lines apart — dead
code from the same old merge, not a live bug since the second copy simply
shadows the first. Flagged as a background task (`task_e0ec8240`) rather
than fixed here (out of this phase's scope); NOT re-verified as fixed by
this session — check its outcome before assuming it's resolved.

**Phase 14 (Crossword / puzzle minigame, D23) — implementation, 2026-09-01.**
One genuine implementer's call, recorded as **D59** (Locked decisions, under
"Computer, phone, and deeper" directly after D23 — read it before touching
any of this): general crossword-grid construction is NP-hard and overkill
for a house minigame, so each day's puzzle draws 4 (of 24 hand-authored)
across/down word PAIRS — each pair only needs to share a real letter,
`findCrossing` (puzzles.js) finds where — and stacks each pair in its own
non-colliding vertical block. Real intersections, seeded, idempotent, and a
fraction of the complexity of freeform synthesis.

**Real identifiers.** New `puzzles.js` (registered in both `index.html` and
`loadgame.js`'s `ORDER`, directly after `mail.js` in both — same "pure
domain module, called at runtime only" slot money.js/mail.js already sit in):
`PUZZLE_WORD_PAIRS` (24 pairs), `PUZZLE_TUNING` (`pairsPerDay: 4`, `skillId:
'wordplay'`, `xpPerComplete: 12`, `hintRewardMult: 0.5`), `findCrossing`,
`puzzleCellKey`, `puzzleAnswerLetterAt`, `isWordSolved`/`isPuzzleSolved`,
`computePuzzleNumbers` (standard crossword numbering — one running number per
distinct word-start cell, so a pair whose across/down share a start cell
shares one number for free), `generatePuzzleForDay` (seeded via
`seededRng(meta.seed, \`puzzle_${day}\`)` + the existing `pickUnique`
helper, idempotent exactly like `generateGigsForDay`), `checkPuzzleCompletion`
/ `grantPuzzleCompletionReward` (the single reward site — awards
`awardSkillXp(player, 'wordplay', ...)` + `pushMoodImpulse(...,
MOOD_PAYOUTS.puzzleComplete, ...)`, halved if `puzzle.revealed` is non-empty),
`fillPuzzleCell`, `revealHintForWord`. New `APP_DEFS.puzzles` (defs.computer.js,
label "DailyGrid", one screen `today` → `puzzles-today`). New
`defaultComputerState().apps.puzzles` (computer.js: `{ day: 0, words: [],
rows, cols, filledCells: {}, revealed: {}, completedDay: null }` — the
generic per-app shallow-merge in `normalizeComputerState` already back-fills
this for old saves with zero extra code). New on-open generation hook, ONE
line each, in `computer.js`'s `openApp` and `phone.js`'s `phoneOpenApp` —
mirrors the exact existing `if (appId === 'upgrades') fireContractorMilestone
(...)` precedent already living in both functions, not a new mechanism.
New `ICONS.puzzles` (icons.js — a 3x3 grid glyph with the center cell
blacked out; skipping this is the codebase's own documented "blank tile"
landmine, called out by name against `upgrades`/`recipes`/`food`'s own past
misses). New `MOOD_PAYOUTS.puzzleComplete` (config.js, `0.04`). New
`renderPuzzlesToday` (render.computer.js, registered in `COMPUTER_RENDERERS`
as `'puzzles-today'`) — grid cell `<input>`s wire their own direct
`addEventListener('input', ...)` (afterhours.js's `AH_renderSearchBar`
pattern), NOT the `[data-action]` delegation, and deliberately do not
re-render on every keystroke at all (see D59's last paragraph for why the
phone shell specifically forced this design). New `doPuzzleFillCell`/
`doPuzzleRevealHint`/`doPuzzleCheck` (ui.computer.js) and two new dispatch
cases, `puzzle.hint`/`puzzle.check` (ui.js), for the Hint and Check Answers
buttons only — cell typing never goes through this switch. New `.pz-*` CSS
block (index.html, right before the Menu-overhaul responsive rules, after
Brine Bank's own block). `index.html`'s `?v=` bumps: config 168→169, icons
32→33, defs.computer 33→34, phone 20→21, computer 69→70, render.computer
57→58, ui.js 154→155, ui.computer 53→54; `puzzles.js` is a new file at v1.

**Not built this phase, deliberately.** No wordle-style second daily mode —
D23/the Phase 14 goal explicitly calls it "an easy extension," not part of
this phase's scope. No live per-keystroke red/green cell feedback — D59
explains why a per-keystroke render was rejected outright (phone shell has
no `typingHere`-style guard); correctness highlighting is computed live from
state on every REAL render (initial open, Hint, Check Answers, completion),
so "Check Answers" is a deliberate no-op-mutation redraw, not a new checked
flag. No puzzle archive/history screen — one screen (`today`) covers the
whole phase goal, matching Streamly's own one-screen precedent.

**Verification.** `node src/src/dev/verify/verify-aa-p14.js` — new harness,
30/30 passing: APP_DEFS/ICONS/MOOD_PAYOUTS registration; seeded determinism
(same seed+day byte-identical, 8 different days show real variety, a
re-processed same-day rollover is a no-op that doesn't wipe progress); grid
integrity (every word's cells fall inside the grid, across/down crossings
agree on their shared letter, at least one cell is a genuine two-word
intersection); crossword numbering; fill/refuse-black-cell/complete
behavior including the exact half-credit-with-a-hint math and that a second
completion check never double-pays; hint reveal + its own no-op-once-solved
case; and — the phase's own "survives a save/load" bullet, proven with the
real function rather than a hand-rolled stand-in — a half-filled,
partially-hinted puzzle round-tripped through `JSON.parse(JSON.stringify(...))`
into the actual `normalizeComputerState` comes back byte-identical, and a
pre-Phase-14 save with no `apps.puzzles` key at all back-fills cleanly.
`node src/src/dev/verify/run-all.js` (full, unfiltered) — **3790 passed / 83
failed / 12 errored**, i.e. exactly the Phase 13 baseline (3760/83/12) plus
this harness's own 30, with the same 12 named harnesses erroring as before
(`verify-i4.js`, the `verify-present-p2/2b/3.js` trio, and the `verify-voc-*`
family) — all pre-existing and unrelated to this plan. **Live-verified** in
`dev-harness.html`'s Sandbox mode: opened DailyGrid from the phone home grid
(real rendered icon, not a blank tile) — day 1's puzzle drew GIFT/TAG,
LAUNDRY/DRYER, SOFA/NAP, POOL/LOUNGE (32 unique cells, matching the harness's
own math), clue numbers and letter-count hints all correct. Typed a wrong
letter into a cell — auto-advance correctly stayed put where no cell exists
to the right (a down-word-only cell), and "Check Answers" then painted it
red on a real redraw (confirming the deliberately-no-op-on-keystroke design
actually works, not just compiles). Filled every word correctly via
`doPuzzleFillCell` — the "✓ Solved today's puzzle!" banner rendered, all
inputs disabled, the system log printed "DailyGrid solved for today!", with
zero new console errors (only the pre-existing, unrelated
`ReferenceError: root is not defined` this harness already throws from
menu.js's background-art retry, present before this phase's changes too).
Opened the SAME app from the computer desktop shell (`doComputerOpen` +
`doComputerOpenApp('puzzles')`) and confirmed it read the identical solved
state — proving the phone/computer state-sharing contract holds. Confirmed
the desktop taskbar/icon set renders real SVG (46 icons, all with real
child shapes), not a blank `puzzles` tile.

**Blockers / flagged deviations (Phase 14):** None. In passing, this session
found a real PRE-EXISTING bug unrelated to this plan: `render.computer.js`
has `renderDreamDiary`/`renderDreamEntry` (Dream Engine Phase 8) defined
TWICE, byte-identical, back to back — dead code from an old merge, not a
live bug since the second copy simply shadows the first — flagged as a
background task rather than fixed here (out of this phase's scope).

**Phase 13 (East Wing hotspot + sauna, D22) — implementation, 2026-09-01.**
Three genuine implementer's calls made and recorded as **D58** (Locked
decisions, under "East Wing" alongside D22 — read it before touching any of
this): (1) the sauna is `FACILITY_DEFS`/`ROOM_FACILITIES`, never
`STRUCTURAL_UPGRADES` — "no new floor-plan node" (Q2) rules out the graph-
editing mechanism; (2) the sauna's privacy is object-sourcing plus flavor,
not a new sub-room presence tier — `sharedActivityParticipants` is room-level
everywhere in this codebase and stays that way; (3) `pool_party` ships with
**no bespoke ask leaf** — it's a `COMMITMENT_KINDS` entry riding the existing
`$Invite`/`ASK_INVITE` leaf, exactly the door D37 left open for an eventType
with no bespoke judging.

**Real identifiers.** Six new `defs.actions.js` verbs, all East-Wing-grouped
except the balcony one: `self.sunbathe` (object-sourced off `pool_loungers`,
replacing its dead `self.relax` afford — self.relax's own `source.roomIds`
never included pool_room), `self.pool_games` (object-sourced off
`swimming_pool`, gated by a new `residentsPresent` requirement checker so
Marco Polo can't fire solo — reuses `sharedActivityParticipants` from
`actions.js`, the same list `shared` itself draws from), `self.yoga` +
`self.lift_weights` (object-sourced off `yoga_mat`/`weight_set`, both newly
added to `gym_equipment`'s `gatesActions`), `self.sauna` (object-sourced off
the new `sauna` OBJECT_DEFS fixture, gated by the new `pool_sauna` facility,
`vulnerableState:'sauna'` mirroring shower/swim), and
`self.tend_balcony_plant` (object-sourced off `plant_balcony` — mood/energy
only, no `health` state write, since that state is decorative everywhere it
appears in this codebase and giving one plant a real decay loop while its
siblings stay inert would be its own orphan mechanic). `self.eat`'s
`source.roomIds` gained `'balcony'`; `balcony_table` gained the same
`dishes`/`clutter` states `dining_table`/`kitchen_table` carry so a balcony
meal leaves a real mess, and `buildEatEffects`' table lookup (defs.actions.js)
now matches it. The lockers "wardrobe hook": `lockers` (defs.world.js) went
from a bare `container: true` with no open/take/put affordance (a real,
pre-existing gap — it declared itself a container and could never be one) to
a proper `{capacity, label}` container with the full triad, plus
`lockers.interact`/`lockers.change_outfit`/`lockers.open` mirroring
`wardrobe.interact`/`wardrobe.change_outfit`/`wardrobe.open` exactly
(`prepareLockerChangeOutfit`, `hasLockerClothes`, both new;
`openWardrobePanel` gained an optional 4th `heading` param so the panel
reads "Lockers" instead of "Wardrobe" there). New `pool_sauna` FACILITY_DEFS
entry (`config.js`, `room: 'pool_room'`, broken/functional/upgraded,
3200/9000 cost) alongside the existing `pool_systems`; new `sauna`
OBJECT_DEFS entry placed in `APARTMENT_LAYOUT.pool_room`
(`APARTMENT_LAYOUT_VERSION` 8→9). New `COMMITMENT_KINDS.pool_party`
(`roomId: 'pool_room'`, `playerInvitable: true`, `inviteWords`). New
`ACTION_ANCHOR_OBJS` entries for every new object-sourced verb. render.js
gained a `sauna` floor-plan icon (`FP_FURNITURE`) and a `lockers`-specific
submenu branch in the container-chip loop (mirroring the `wardrobe`
special-case there); `defs.placement.js` gained a `sauna: {w:24,h:22}`
footprint. `index.html`'s `?v=` bumps: config 167→168, defs.world 48→49,
defs.actions 50→51, defs.placement 1→2, render 87→88.

**Not built this phase, deliberately.** No `ROOM_DECOR`/authored placement
for the sauna's exact south-west-corner position — `resolveAutoPlacements`
packs it automatically like any other furniture piece; the corner/door
detail is flavor (`imagePhrase`) only, per D58. No sub-room presence
tracking for the sauna's "privacy" — see D58 point 2. No change to
`plant_lr`/`hobby_houseplant`'s equally-inert `health` state — only
`plant_balcony` was in this phase's scope (D22), and giving it a working
decay loop the other two don't have would be a new orphan asymmetry, not a
fix.

**Verification.** `node src/src/dev/verify/verify-aa-p13.js` — new harness,
40/40 passing: registration of all six verbs + the lockers submenu trio +
both new checkers + every new object/facility/layout/anchor entry;
object-sourced gating proving `self.sauna` matches its object before the
facility is paid for but `checkRequirements` still refuses it until
`pool_sauna` is functional (and accepts `self.yoga`/`self.lift_weights` once
`gym_equipment` is); `residentsPresent` refusing an empty room, opening with
a resident present, and excluding a showering one (same exclusion
`resolveSharedActivity` itself reads) — with `self.pool_games`' full
requirement chain agreeing at every step; the lockers wardrobe-hook round
trip (empty gates the chip, stashed swimwear opens it,
`prepareLockerChangeOutfit` resolves the LOCKERS object specifically, not a
phantom wardrobe); `balcony_table`'s real `obj.dishes` unit map taking the
exact `ADD_DISHES` lines `buildEatEffects` emits, same as
`dining_table`/`kitchen_table`; and `"pool party"`/`"swim party"` flavor text
both resolving to the `pool_party` kind through `inviteKindFromFlavor`
unchanged, with empty/unrecognized flavor still falling back to `hangout`.
`node src/src/dev/verify/run-all.js` (full, unfiltered), run three times —
**~3760 passed / ~83 failed / 12 errored**, `verify-aa-p13.js` itself stable
at 40/0/0 across all three. The total wobbles by ±1-2 pass/fail run to run
on the UNCHANGED post-Phase-13 tree (confirmed directly: two consecutive
runs differing by nothing but this harness's own print-format fix — see
below — still flipped `verify-r1.js` from 37/3 to 36/4, a scene-narration
template test with zero relation to East Wing/pool/gym/lockers content) —
pre-existing flakiness in a handful of probabilistic/threshold harnesses
(`verify-r1.js`, and `verify-c1.js`/`verify-c2.js`'s "reaches 0.336 (> 0.4)"-
style overture-appeal assertions), not something this phase caused. Cross-
checked with a stash-and-rerun of `verify-c1.js`/`verify-i5.js` against the
PRE-Phase-13 tree: identical failure names and even identical measured
values (9 and 3 failures respectively) both with and without this phase's
code. The 12-errored count matches the Phase 12 baseline exactly. One real
bug this session's own harness caught in ITSELF, not the game: the first
`verify-aa-p13.js` draft printed its summary line without the exact 2-space
indent `run-all.js`'s regex requires (`/^ {2}(\d+) passed, (\d+) failed$/m`),
so it silently counted as "errored" under the full concurrent sweep despite
passing 40/40 standalone — fixed by matching the `'='.repeat(46)` + 2-space
convention every other harness in this suite already uses; flagging in case
a future new harness copies the wrong precedent. **Live-verified** in
`dev-harness.html`'s Sandbox mode (House preset: Restored, so every facility
including `pool_sauna` starts functional; 1 rolled roommate added): walked
pool_room → game_room → changing_room → gym → balcony and fired every new
chip. `Use the Sauna` produced the exact Mood +0.2/Energy +6/Hygiene +5/
Time 20min outcome window with "You're wrapped in a towel" clothing-state
narration; `Sunbathe` rendered correctly alongside it; `Pool Games` was
correctly ABSENT while alone ("PRESENT: No one else here" — confirming
`residentsPresent` gates the chip live, not just in the harness); the
`Lockers ▸` submenu (grouped under the room's "Containers" bucket, exactly
like `Wardrobe ▸`) opened a correctly-labeled "Lockers" panel (not
"Wardrobe") with Inside/Your Bag columns, and `Change Outfit` on an empty
locker showed the exact `hasLockerClothes` refusal line ("The lockers are
empty — stash some clothes here first."); `Do Yoga` produced Mood +0.14/
Energy +3/Fitness XP +8/Time 30min; `Tend the Plants` (grouped under the
balcony's `Relax ▸` submenu alongside the pre-existing `Sit on the
Balcony`/`Listen to Music`, confirming it participates correctly in the
existing chip-collapsing UI) produced Mood +0.04/Time 8min. Zero console
errors from any of these — the one console error present throughout (a
`ReferenceError: root is not defined` in `menu.js`'s `initStorage`) predates
navigation entirely and is a known `dev-harness.html` environment quirk, not
caused by this phase (menu.js was never touched). Not exercised live: a
real Pool Games round with a co-present resident (the rolled roommate never
wandered into pool_room during this pass — their own schedule wasn't
steered there) and the lockers' full store→change round trip (would need a
swim-gear purchase first); both are already covered deterministically by
the harness's own `residentsPresent`/`hasLockerClothes` sections above.

**Two mechanics, one new file (`mail.js`), three deliberate scope cuts —
see the new D57 in Locked decisions for the full reasoning; short version:**
the mailbox (`world.mailbox[]`) only ever produces `'bill'`/`'flyer'`/
`'letter'` (never `'package'` — real physical packages route entirely
through the retimed `world.deliveries` → door-event path instead, see
below); "friend"/"roommate" as door-knock triggers were NOT built (the
existing organic-visit systems already model those arrivals with their own
soft-cap/cooldown machinery, and retrofitting them through this same new
mechanism in the same phase that builds it was judged too much blast radius
for one session); `front_door`'s own inert lock state was left untouched
(D21 treats locking as a pre-existing given, not a Phase 12 deliverable).

**Real identifiers.** New `mail.js` owns `pushMailEntry`/`processMailForDay`
(the mailbox's daily roll — flyers/letters seeded by day; bills are pushed
separately, see next) and the door event's lifecycle
(`queueDeliveryDoorEvent`, `maybeScheduleSolicitor`,
`resolveDoorEventDecision`, `sweepDoorEvent`, `fallbackDeliveryToDoormat`).
`ui.js`'s existing `processBillsForDayUi` gained one line —
`pushMailEntry(currentGameState, 'bill', r.label, day)` inside its existing
per-bill loop — firing only the moment a REAL bill posts (rent excluded,
see D57). `ui.js`'s `processDeliveriesForDay` (Nile/Home purchases) was
rewritten: instead of instantly, silently placing the item on the doormat
at the ETA, it now calls `queueDeliveryDoorEvent`, opening a single pending
`world.doorEvent` that stays answerable for
`MAIL_TUNING.deliveryKnockWindowMinutes` (240) before a new tick-driven
sweep (`sweepDoorEventNow`, called once per `advanceAndResolve` — right
after the day-rollover loop, so an event created BY today's rollover gets
its "there's a knock" announcement in the same advance call rather than
waiting a full extra tick) resolves it to EXACTLY the old silent doormat
placement as the fallback — an AFK/inattentive player loses nothing. Three
new `defs.actions.js` verbs: `self.get_mail` (object-sourced off the new
`mailbox` OBJECT_DEFS entry, `defs.world.js`, placed in `entry`'s room
bucket — `APARTMENT_LAYOUT.entry`), `self.answer_door`/`self.refuse_door`
(room-sourced off `entry` — a door event is world-level state, not tied to
one object instance). Two new `ACTION_REQUIREMENT_CHECKERS`
(`hasUnclaimedMail`, `doorEventPending` — the latter also bounds
`world.doorEvent.createdAbs`/`expiresAbs` so a solicitor scheduled for
11:00 isn't answerable at 08:00). Two new trusted `effects.js` entries,
`CLAIM_MAIL`/`RESOLVE_DOOR_EVENT`, thin wrappers over `mail.js`'s real
functions (`applyClaimMail`/`applyResolveDoorEvent`). The solicitor
(flavor-only, no NPC record) rolls once per day at rollover (seeded by day)
with a FIXED ring window (`MAIL_TUNING.solicitorStartMinute` 11:00 for
`solicitorWindowMinutes` 240 — deliberately not randomized, so a Node
harness can assert the exact window). `index.html`'s per-file `?v=`
cache-busting params were bumped for every file touched (config 166→167,
defs.world 47→48, defs.actions 49→50, state 63→65, sim 96→97, effects
40→41, ui 153→154) plus the new `mail.js?v=1` registered directly after
`money.js` (both are world-ledger modules with no UI dependency); `mail.js`
was also added to `dev/verify/loadgame.js`'s `ORDER`, directly after
`money.js` there too.

**A real bug found and fixed, discovered by this phase but not part of its
own mechanism — see D57 for the full account.** `state.js`'s
`loadGameState` hand-lists every world key on read (`const x = await
getWorld('x') || default`) instead of dynamically walking `SAVE_KEYS` the
way the three write paths do. `mailbox`/`doorEvent` were correctly added to
`SAVE_KEYS`/`WORLD_KEY_FALLBACKS` (governing the WRITE side) but silently
vanished on every READ — confirmed live in `dev-harness.html`'s Sandbox
mode (a freshly-started game's `currentGameState.world` was missing both
keys, even though `SIM_generateHouse` called directly in the console
produced them correctly). Fixed by adding the two explicit `getWorld` reads
and including them in `loadGameState`'s returned `world: {...}` literal —
the EXACT "castWeb failure" this function's own neighboring comments
already warn about by name (`gameplayOptions`/`dreams` each hit this once
before). **Flagged, not fixed, for a future session:** `loadGameState`'s
hand-list is a standing trap that will catch a future new world key again
unless the function is refactored to walk `SAVE_KEYS` dynamically like its
siblings — out of scope for this phase's own diff, but real and
load-bearing. A background task was spawned for this (see the chip in the
session UI) rather than left as prose alone.

**Verification.** `node src/src/dev/verify/verify-aa-p12.js` — new harness,
42/42 passing: registration (three verbs, two checkers, two effects, the
mailbox object + its entry placement); the mailbox's accumulate/gate/claim
cycle and `processMailForDay`'s seeded determinism + claimed-entry pruning;
the delivery retiming's admit (item to player, `world.doorEvent` cleared)/
refuse (item to doormat, matching the exact pre-Phase-12 line)/never-
overwrites-a-busy-slot/expiry-falls-back-to-doormat branches; the
solicitor's seeded daily roll, its fixed window, `doorEventPending`'s
gate boundaries, and `sweepDoorEvent`'s announce-once-then-resolve
behavior. `node src/src/dev/verify/run-all.js` (full, unfiltered) —
**3721 passed/82 failed/12 errored**, i.e. exactly the Phase 11 baseline
(3679/82/12) plus this phase's 42 new assertions, zero regressions; the
82 failed/12 errored are the same pre-existing, already-documented,
unrelated set (verify-w6/w9/etc. — untouched by this phase). Live-verified
in `dev-harness.html`'s Sandbox mode: the Get Mail chip claimed real seeded
mailbox entries with correct narration ("You check the mailbox: a bill
from GreenLeaf Electric and a flyer from a pizza place two blocks over.")
and then correctly disappeared; a queued delivery door event showed both
Answer/Ignore chips — Answer handed the item straight into inventory
(confirmed via the inventory count and the sidebar's delivery status
flipping to "Book — delivered"/handedTo 'player'), Ignore placed it on the
doormat exactly like the old silent fallback (confirmed via the doormat
object's own `contents`); a solicitor door event's Answer branch narrated
the canvasser flavor line and applied the mood dip (visible in the mood
bar); advancing ~16 in-game days through the real clock loop
(`advanceAndResolve`) exercised the full day-rollover pipeline with zero
console errors — flyers/letters accumulated and narrated correctly ("Mail
arrives: a flyer."), stayed unclaimed rather than being pruned, and no
bill mail appeared before any real bill's actual due date.

**Last session's notes (design session, 2026-08-30 — no code written):**
- The user reviewed a 56-item catalog of new verbs/activities (grouped:
  Kitchen & food / Bathroom & grooming / Living room & common /
  Study-computer-phone / East wing / Entry-hallways-laundry / NPC & social /
  Deeper systems) and selected the scope below, with corrections. That
  catalog was never persisted; **this document is now the record of the
  selection.** The user's words are quoted under each scope heading.
- Two explicit structural mandates from the user, both locked as decisions:
  1. **NPC invitations and events use a central invitation system whose
     bones already exist in the Asks system** (D1–D4).
  2. **"Make a move" moves inside the chat modal as an "Ask" tree**, with a
     family of physical actions added (D5–D7).
- The user flagged a hard requirement: the game needs **a lot of original
  music and sound effects** because a LOT of sounds are about to be added
  (D29).
- **East Wing is the declared priority** — it is meant to be a hotspot
  (swimming, games, socialization, upgrades like the sauna) and is boring
  today (D22).
- Reference implementation cited by the user: the NPC flags system in
  `perchance.org/freeuseofficeclicker` (its `src/js/17-flags-detection.js`).
  That file is not fetchable directly (src/ files are service-worker gated),
  so D15 is designed from the user's description of the mechanism plus this
  codebase's own perception/signal layer; verify against the original when a
  live copy is at hand.
- One scope item's original pitch was lost in a context handoff — the user
  remembered it only as "a lot of potential to be great or awful." It is
  parked (Open questions → Q1) to be defined fresh with the user during its
  phase rather than guessed.

**This session's notes (design review, 2026-08-31 — no code written):**
- Walked the whole plan with a partner pass; verified several referenced
  hooks against the real codebase — `signals.js`, `isPrivacyRoom`
  (cognition.js:1373), `UTILITY_THERMOSTAT` (config.js:794 → computer.js's
  hvac billing), `harvestChatterResidue` (dreams.js:281),
  `willingnessFloorReasons` (willingness.js), `doMakeAMove` (ui.js:905), and
  `boundary.js`'s existing sleep-room gate all confirmed real.
- **File-reference cleanup done.** Every phase's Files line naming a module
  that doesn't exist under that name (`chat.js`, `wardrobe.js`, `beliefs.js`,
  `perception.js`, `planner.js`, `chores.js` — also `src/ref/scripts/...`
  fictitious paths in Phase 1) now says where the logic actually lives
  (`ui.js` / `items.js`+`sprites.js` / `relationships.js`+`rumination.js` /
  `signals.js`+`cognition.js`'s `isPrivacyRoom` / `tracker.js`+`intent.js` /
  `sim.js`+`drives.js`+`commitments.js` respectively) or flags it as a real
  TBD where no existing file fits. `money.js` (Phase 4) is left alone — D9's
  ledger has no obvious existing home, so "new file vs. folding into
  `world.js`/`config.js`" is a genuine kickoff-time call, not a factual
  error like the other six were.
- **Pets cut entirely.** D28 and Phase 18 both retired — a pet system needs
  its own dedicated design track (the dog case alone implies an
  "outside"/off-map layer this game has never modeled). See Q3.
- **Sauna placement locked (Q2).** Pool room, south-west corner, north-facing
  door, a *subroom* — D22 and Phase 13 updated. Deliberately a one-off: no
  second subroom is planned.
- **D10 / Phase 5 walked back.** There is no "NPC never asks something the
  player can't grant" gate — the player's own limits live in the player's
  head, and an NPC asking for money the player doesn't have is drama, not a
  flaw. Both updated to drop the false constraint.
- **New D30.** Acting on a sleeping/unaware NPC (via the new D5–D7 Affection/
  Physical ladder) routes through the *existing* Phase-17 boundary-act gate
  (`boundary.js`) rather than relaxing `willingness.js`'s hard 'asleep'
  floor — three outcomes: wake hostile, wake receptive, undisturbed.
  Confirmed `openConversationOverlay` has no NPC-state side effects today,
  so "opening the panel doesn't disturb them" already holds by
  construction; nothing to build there.
- **Parked, explicitly NOT part of this plan:** the user has a future concept
  for a hidden multipurpose room (Study → bookshelf → secret door). Noted
  here only so it isn't lost the way Q1's original pitch was — needs its own
  design session if/when picked up.
- **New Phase 1B (D32–D36), sequenced right after Phase 1.** Grew out of the
  user's stealth/sneaking/cover-tracks ideas. Checking the actual codebase
  before writing anything down changed the shape a lot: room-entry stealth,
  peeping, AND phone-snooping (`doSearchRoom`, `doSearchPhone`/
  `resolveSnoopPhone`, `generatePhoneSnoopPhotoImage`) all already ship —
  fully tuned, evidence/suspicion-integrated, one even has a reverse
  NPC-on-player drive. The one dead piece: nothing ever calls
  `awardSkillXp(player, 'stealth', ...)`, so `stealthSuccess` never moves
  off level 0 despite a real 11-step curve sitting ready
  (`SKILL_CURVES.stealthSuccess`) with a comment reserving it for exactly
  this. Real new scope shrank to: pickpocketing (person-target, D33), a
  Sneaking toggle suppressing the footstep signal (D34), an explicit branch
  on the existing SFW-only phone-snoop photo (D35), and granular
  cover-your-tracks actions (D36) feeding D30/D31. First instinct was to
  unify all the stealth mechanics into one resolver; reading the actual code
  showed three independently-shipped, consistently-shaped systems already
  proving the pattern, so P1B follows it rather than refactoring it.

**This session's notes (implementation, Phase 1, 2026-08-31):**
- **The invitation spine (D1–D4) was already far more built than the plan's
  design-review session realized.** `asks.js`'s `asks-and-attachments-plan.md`
  had already shipped `ASK_HANGOUT`/`ASK_MEAL` as full `schedule: true` leaves
  — decide-by-affection, a calendar-slot modal (`openAskScheduleModal`,
  render.js), and `createCommitment` (commitments.js) booking a real
  `COMMITMENT_KINDS`-keyed record that SIM's `resolveScheduleActivity`
  already relocates every ACCEPTED attendee for, per-NPC, with zero
  Phase-1-specific code. So D2's "an event is a commitment with a roster"
  and D1's "the Asks system IS the invitation system" were already true for
  the single-invitee case before this session touched anything; the real gap
  was **(a)** nothing could invite more than the one NPC you're talking to,
  and **(b)** a booked commitment was invisible everywhere except the moment
  it ran — no Agenda entry, no way to cancel it. This phase's actual scope
  narrowed to exactly those two gaps plus the invariant-8 bug found along the
  way (below).
- **New ask leaf: `ASK_INVITE`** (`asks.js`, `id: 'Invite'`, `ASK_TYPES.Invite`,
  category `'invite'`, template `'$Invite <Optional>'`). It does NOT replace
  `ASK_HANGOUT`/`ASK_MEAL` — those still exist unchanged and are still the
  right leaf for "invite whoever I'm talking to." `ASK_INVITE`'s reason to
  exist is the thing they structurally can't do: pull in OTHER residents too.
  It parses an event-type word ("dinner"/"hangout"/etc — driven by
  `COMMITMENT_KINDS[k].inviteWords`, opted into per-kind via a new
  `playerInvitable: true` flag; only `meal` and `hangout` opted in) and any
  other resident names ("...with Elena") out of the flavor text via two new
  pure helpers, `inviteKindFromFlavor` / `inviteExtraGuestsFromFlavor`
  (asks.js, right after `ASK_MEAL`) — the same longest-phrase/whole-word
  matching `intent.js`'s `classifyIntent`/`matchRoomIntent` already use for
  free text, reused directly (asks.js loads after intent.js in both real load
  orders). Both values ride on the returned `decision` object
  (`decision.inviteKind` / `decision.inviteExtraIds`), exactly like
  `ASK_GIFT`'s `giftMatch`/`giftLabel` — **never as an input to the
  accept/decline formula itself**, which stays byte-identical to
  `ASK_HANGOUT`'s (affection − tension, seeded noise, ladder penalty).
  Verified directly: `verify-aa-p1.js` section 2 asserts the SAME warm NPC
  accepts identically whether the flavor is empty or names an event and a
  guest — flavor moves what gets booked, never whether this leaf says yes.
- **`ui.js`'s `runAskScheduleFlow`** (the shared stage-2 handler every
  `schedule: true` leaf goes through) now reads `askTurn.decision.inviteKind`/
  `inviteExtraIds` when present, falling back to the leaf's static
  `kind`/`roomId` exactly as before for `ASK_HANGOUT`/`ASK_MEAL`/any future
  `schedule:true` leaf that doesn't set them. The extra invitees ride as
  ordinary `invitedIds` into the SAME `createCommitment` call the primary
  partner books through — each one gets a real, independent
  `respondToCommitment` roll, narrated with a short deterministic line
  (`"${name} is in too."` / `"...isn't up for it."`) right before the
  LLM-phrased confirm. Live-verified in-browser: `$Invite dinner with
  Bramwell` while talking to Aiko produced a `meal` commitment in `dining`
  with `invitedIds: ['<Bramwell>']`, `acceptedIds: ['<Aiko>', '<Bramwell>']`
  — exactly the plan's own Verification line.
- **`host` is the one genuinely new commitment field** (`commitments.js`,
  `createCommitment`'s new `host` param, default `'player'`). D2's
  `eventType`/`roster`/`confirmed`/`durationMinutes` were deliberately NOT
  added as separate stored fields — `kind` (a `COMMITMENT_KINDS` key, each
  already carrying a human `label`) already IS eventType; `invitedIds`/
  `acceptedIds` already ARE the roster/confirmed lists; duration is
  `endAbs - startAbs` on demand. Storing second copies would be invariant-6
  violations (state with no independent reader) — this was a deliberate
  read of D2's *intent* against fields that already existed, not a shortcut.
  `host` could NOT be inferred from the existing `proposerId` param —
  that's overloaded (the asks-plan schedule flow already passed
  `proposerId: convNpcId` for a PLAYER-initiated ask, purely to skip
  re-rolling an NPC who'd already said yes in stage 1; only
  `doOvertureRespond`'s TRUE npc-initiated path means it as "the host").
  All three call sites now pass `host` explicitly:
  `doInviteDinner`/`runAskScheduleFlow` → `'player'`,
  `doOvertureRespond` → `npcId`. `verify-aa-p1.js` section 3 pins this
  distinction directly (proposerId set + host omitted still resolves to
  `'player'`).
- **"Clear the Calendar" landed as a new Calendar app**
  (`defs.computer.js`, `APP_DEFS.calendar`, devices `['computer','phone']`,
  entry screen `'upcoming'`) rather than a phone-tracker action — the
  Tracker's Notifications/Agenda screens are explicitly documented read-only
  (render.phone.js), so cancelling needed its own surface. Reuses the
  existing generic `list` renderer (the same one Shop's cart uses) over a
  new `'commitments'` literal source case in `resolveScreenSource`
  (render.computer.js), backed by a new pure reader `upcomingCommitments`
  (commitments.js, every still-`'scheduled'` commitment soonest-first) and a
  new `cancelCommitment(gameState, id)` (commitments.js — splices the record
  outright; no `'cancelled'` status was invented, since invariant 6 has no
  reader for one). The row action `calendar.cancel` → `doCancelCommitment`
  (ui.js, next to `doInviteDinner`) is a free, no-consequence action by
  design (D2's "explicit escape hatch, not silent abandonment" — this is
  the escape hatch, not a decline, so no relationship cost). New icon:
  `icons.js`'s `calendar` key. Live-verified: booking, viewing (`"dinner
  with Aiko, Bramwell — ... (hosted by you)"`), and clearing (narrates
  `"You cleared dinner with Aiko and Bramwell off the calendar."`, screen
  reverts to `"Nothing on the calendar."`) all worked in-browser.
  **One real bug found and fixed live:** the Calendar's `labelFn` first read
  `row.invitedIds` for who's coming — which excludes the PRIMARY partner
  (they're `proposerId`-seeded straight into `acceptedIds`, never
  `invitedIds`), so a dinner you're hosting would have listed every guest
  EXCEPT the person you're actually eating with. Fixed to read
  `acceptedIds` (who's actually confirmed), matching what
  `trackerCommitments` already did correctly.
- **The "scheduler hook" the plan's Files line asked about (Phase 1, "real
  home TBD ... likely tracker.js/intent.js") turned out to be
  `tracker.js`, and it is NOT a new scheduler.** SIM's
  `resolveScheduleActivity`/`activeCommitmentFor` already relocate every
  ACCEPTED attendee of ANY commitment, one NPC at a time, for its window —
  confirmed with zero new code needed (verify-aa-p1.js section 6 puts TWO
  independently-accepted NPCs on the same commitment and shows both get
  bound to the room). The actual gap was pure VISIBILITY: a booked
  commitment had no Agenda entry and no notification before its window
  opened. New adapter `trackerCommitments` (tracker.js, registered in
  `buildTrackerEntries`'s adapter list) reads `upcomingCommitments`,
  reuses the existing `trackerUrgencyFromDaysUntil` ladder (so a same-day
  or next-day plan surfaces as a real phone notification, not just an
  Agenda line, same as gigs/deliveries), and deep-links to
  `{ appId: 'calendar', screenId: 'upcoming' }`. Live-verified: a booked
  hangout appeared as a "CALENDAR / Time together with Aiko" notification
  with Dismiss/Snooze, and tapping its title routed straight into the
  Calendar app.
- **Invariant-8 bug found and fixed, unrelated to this phase but blocking
  its own verification:** `asks.js` was registered in `index.html`
  (`?v=12`) but completely ABSENT from `dev/verify/loadgame.js`'s `ORDER`
  array — not a stale line, never added at all, across the whole prior
  asks-and-attachments-plan run. That meant `ASK_HANGOUT`/`ASK_MEAL`/every
  existing leaf had ZERO Node coverage before this session, and this
  phase's own `ASK_INVITE` would have had none either. Confirmed asks.js is
  fully DOM-free (`grep` for `document.`/`window.`/`addEventListener`: zero
  hits) and added it to `ORDER` right after `pregnancy.js` (asks.js's real
  index.html position, between render.phone.js and ui.js, sits inside the
  render/ui block this loader otherwise stops before — same rationale as
  the existing `studio.js`/`codex.js` documented divergences, which the
  file's header comment now lists as three instead of two). New harness
  `dev/verify/verify-aa-p1.js` (31 assertions, all passing) covers
  registration, the flavor-parsing helpers, the D1 flavor-can't-move-the-
  verdict invariant, `host`, `cancelCommitment`, the tracker/Calendar
  adapters, and the multi-guest scheduler claim above.
- **Full regression check:** `node src/src/dev/verify/run-all.js` (now
  parallelized by a fix made mid-session outside this plan's scope — see
  its own header) reports **3298 passed, 76 failed, 13 harness(es)
  errored** — exactly the 2026-08-31 baseline (3267/76/13) plus this
  session's 31 new passing assertions and zero regressions; the 76
  failures and 13 errors are byte-identical to the pre-existing,
  documented-elsewhere set (verify-w6.js etc.).
- **Live-page verification (invariant 7's presentation half):** done via
  `dev-harness.html` on `localhost:8735` (the `slice-of-life-review`
  launch.json entry — the default 8734 port had another session's server
  on it). Covered: the "📅 Invite" category appearing in the chat Ask menu
  between Hangouts and Money; sending `$Invite dinner with Bramwell` while
  talking to Aiko end-to-end through the schedule modal (meal-labeled
  slots rendered correctly); the booked commitment's real shape in
  `currentGameState.world.commitments`; the Calendar app on both the
  phone home grid (icon renders) and via a Tracker notification deep-link;
  and Clear the Calendar's cancel + narration. No console errors observed
  during any of this.
- **Not built this phase, deliberately:** a multi-NPC PICKER UI for
  `$Invite` (it parses names from typed flavor text instead — consistent
  with `loanAmountFromFlavor`'s existing precedent for structured-data-in-
  flavor, and avoids inventing new modal chrome this phase doesn't need);
  a MEMORY_FACT for each extra invitee individually (only the primary
  partner gets one, matching every other ask leaf's one-partner-per-turn
  shape — extras get the deterministic narration line instead); any new
  `eventType` beyond `meal`/`hangout` (party/cookoff/tour/pool_party are
  Phases 13/14/17's calls to make, per D14/D22/D26/D27 — nothing here
  should be read as pre-deciding those).

**Blockers / flagged deviations (Phase 1):** None from this phase. (The
invariant-8 `asks.js` gap above was found and fixed in the same commit, not
left as a deviation.)

**This session's notes (implementation, Phase 1B, 2026-08-31):**
- **D32 — XP wiring, the real amounts.** All three lived where the plan said
  they would (`stealth.js`), added as new keys on each mechanic's own
  CONFIG.js tuning table (never a separate table — "nothing magic outside
  CONFIG" holds): `STEALTH_TUNING.xpCleanSneak = 12` (the `resolveRoomEntryStealth`
  clean-sneak `else` branch, which used to be a bare comment with no code at
  all), `PEEP_TUNING.xpClean = 10` (`resolvePeep`'s undetected branch —
  awarded whenever `!detected`, so a "suspected" near-miss still counts, since
  no consequence effect fired either way), `PHONE_SNOOP_TUNING.xpUnwitnessed
  = 10` (`doSearchPhone`'s `!ownerPresent` branch, ui.js — this one could NOT
  be Node-verified directly since ui.js sits outside `loadgame.js`'s ORDER by
  design; verified live instead, see below). **Measured example (the
  handoff's own required proof, not just "it compiles"):** a fresh player
  (`skills: {}`, `stealthSuccess` level 0, `skillMod` 0.25) crosses the
  level-1 boundary (40 xp) after exactly 4 clean sneaks at 12 xp each (48 xp
  total) — `verify-aa-p1b.js` section 2 asserts this exact arithmetic against
  the real `awardSkillXp`/`skillLevel`/`skillMod`, and it was independently
  reproduced live in-browser: two clean pickpockets (15 xp each, D33) landed
  `player.skills.stealth === 30` on the nose. `skills.js` itself needed ZERO
  changes — no new curve, exactly as the plan predicted; `SKILL_CURVES.stealthSuccess`
  was already sitting there reserved for this.
- **D33 — pickpocketing: new `resolvePickpocket(gameState, targetId)`**
  (stealth.js, right after `resolveNpcPeep`). Matches the file's proven shape
  exactly: a seeded roll scoped to `pickpocket_${day}_${tick}_${targetId}`,
  a weighted pick (mirroring `pickEvidenceObject`'s pattern) off the target's
  own non-key-item inventory stacks, `skillMod(player, 'stealth', 'stealthSuccess')`-gated
  detection, and a genuine three-way clean/suspected/caught branch (new
  `PICKPOCKET_TUNING`, config.js, right after `PEEP_TUNING`). Caught → no
  transfer, `ADJUST_SUSPICION boundary_violation +0.4` + `REL_DELTA tension
  +0.15` (steeper than room-entry's 0.35, per the plan's own reasoning —
  lifting something off someone standing next to you is a bigger tell).
  Clean → `MOVE_ITEM` the picked stack to the player + `xpClean = 15`, and a
  30% `suspectedChance` roll on top that — if it lands — opens the D36
  window instead of a hard confrontation. No new UI modal: unlike Search
  Room's `openRoomSearchModal`, the target item is auto-picked (weighted rng,
  same as evidence placement), so no render.js chrome was needed to satisfy
  D33's own described shape. New chip (`render.js`, Social group, alongside
  the existing present-NPC loop): `Pickpocket <name>`, gated on the target
  actually carrying something non-key (mirrors Give Item's `hasItem` gate,
  so the chip never promises a lift `resolvePickpocket` would just refuse).
  New handler `doPickpocket` (ui.js, next to `doSearchPhone`), routed through
  `handleAction`'s `'pickpocket'` case. **Live-verified**: pickpocketing a
  sandbox roommate (Wendell) twice in a row both resolved "LIFTED CLEAN",
  the sketchpad/energy drink genuinely appeared in `player.inventory`
  (confirmed via console read, not just narration text), a real 1-minute
  time cost applied, and the outcome window rendered correctly.
- **D34 — Sneaking: a real gap, not just a toggle.** The player EMITS NO
  FOOTSTEPS SIGNAL AT ALL on movement today — only NPCs do (`sim.js`'s
  per-NPC batch resolution). Fixing that was this decision's real scope, not
  just gating an existing thing: new `emitPlayerFootsteps(gameState, roomId,
  transit)` (signals.js, right before `emitTransient`) mirrors the NPC
  emission exactly (`SIGNALS_EMIT.footstepsTransit`/`footstepsArrive`,
  `sourceId: 'player'`), called from `doMove` (ui.js) for every room crossed
  — mid-route rooms AND the destination, matching the existing
  `resolveRoomEntryStealth` call sites right above each one. Sneaking
  (`gameState.player.sneaking`, a bare boolean, no migration needed — same
  as `player.skills`) makes `emitPlayerFootsteps` a no-op entirely (full
  suppression, not a damped multiplier — "suppresses" was the plan's own
  word, and there is no existing punishing consequence tied to the footsteps
  signal today for a partial dial to matter against). The "connective
  tissue" claim is real and specifically wired into pickpocket's own
  detection formula: `PICKPOCKET_TUNING.sneakingDetectionMultiplier = 0.7`,
  read directly off `gameState.player.sneaking` inside `resolvePickpocket`.
  `verify-aa-p1b.js` section 5 proves this isn't just a smaller number on
  paper — 80 paired trials (same day-seeded roll, Sneaking off vs on) landed
  32 caught normally vs 21 caught while Sneaking, a monotonic per-trial
  relationship (same raw roll, lower threshold), not a coincidence of
  aggregate statistics. New "Start/End Sneaking" chip (render.js, the
  `misc`/"More" group, alongside Wait) and `doToggleSneaking` (ui.js) — free
  at any energy (new `isActionExemptFromEnergyGate` check), no time cost,
  same shape as the existing pregnancy "trying" toggle. **Live-verified**:
  toggling narrates ("You slow down and move quietly." / "You stop
  tiptoeing around."), the chip label flips, and walking multiple rooms
  while active produced zero new signals.
- **D35 — explicit phone-snoop photos.** `composePhoneFind`'s `'photo'` kind
  (npc.js) now carries an `explicit` boolean, decided by a deterministic hash
  roll (`mulberry32(hashStr(...) + gameState.meta.seed)`, NOT a `seededRng`
  object — kept the function's own documented "PURE — no rng" claim
  technically true, same determinism guarantee, no generator threaded
  through) gated on `intimateAllowed(gameState)` AND a new
  `PHONE_SNOOP_TUNING.explicitPhotoChance = 0.35` (SFW stays the default,
  "sometimes" is real — both branches independently confirmed to occur
  across 60 draws with mature on, and NEVER with mature off, regardless of
  the roll). `buildPhoneSnoopPhotoPrompt(npc, gameState, explicit)` and
  `generatePhoneSnoopPhotoImage(npc, gameState, explicit)` (image.js) both
  gained the two new params; the explicit branch re-checks `intimateAllowed`
  itself rather than trusting the caller's flag (defense in depth — verified
  directly: `explicit:true` with mature OFF still renders the SFW prompt).
  Reuses the EXACT three-condition gate `composePeekPrompt`'s already does
  (`opts.intimate && intimateAllowed(gs) && NAKED_CLOTHING_STATES.includes(clothing)`)
  via `buildVisualCharacterClause` — no new gate. The one adaptation: since
  this describes a PHOTO already on the phone, not the npc's current live
  clothing state, the naked-state condition is satisfied the same way
  `boundary.js:443` already does when it needs to narrate a state the live
  object doesn't carry — a shallow clone with `clothing: 'nude'` forced,
  never touching the real npc object. `showPhoneFindModal`/`doSearchPhone`
  (ui.js) thread `finding.explicit`/`currentGameState` through to
  `generatePhoneSnoopPhotoImage`. **Live-verified** with a real generated
  character (Wendell): the explicit prompt actually named his generated
  intimate-layer physical fields ("completely naked... penis: length
  average...") while the SFW prompt named his actual worn outfit ("wearing a
  denim jacket, a flannel and jeans") — genuinely different renders, not a
  cosmetic flag. `generatePhoneSnoopPhotoImage` itself ran clean through the
  real browser canvas path (dev-harness.html's stubbed `generateImage`
  rejected as documented/expected — the prompt-building and error-handling
  path is what mattered, and both worked).
- **D36 — the cover-tracks window.** `openSuspicionWindow(gameState, npc,
  kind)` / `activeSuspicionWindow(gameState, npc)` / `resolveCoverTracks(gameState,
  npcId)` (stealth.js, after the pickpocket resolver). The window is a
  single `npc.flags._suspicionWindow = { kind, subject: 'boundary_violation',
  expiresAtTick }` — one at a time, a new incident before the old one clears
  just replaces it, same as the mechanics above never stack two roll
  outcomes. `coverTracksWindowTicks = 2` (~1 hour, `PICKPOCKET_TUNING`).
  "Hardens into a certain belief or gossip fuel" turned out to need NO new
  system — it's the EXISTING `STEALTH_TUNING.confrontThreshold` check
  already in `doTalk` (ui.js:6786): once accumulated `suspicion.boundary_violation`
  crosses 0.5, the next conversation deterministically confronts the player.
  Cover-tracks just buys the number back down before that happens
  (`coverTracksRelief = 0.7`, a deterministic partial relief — no skill roll
  on top of the original act's own roll, matching the file's own reasoning
  for why cover-tracks isn't itself a second gate). This phase's ONE
  concrete trigger is D33's pickpocket "suspected" outcome; the plan's
  "Redress, Clean Evidence, Remake Sheets" siblings are Phase 2's (D30
  sleeping-NPC branch) and later phases' (existing search) to wire against
  the SAME window mechanism — nothing here should be read as having built
  those yet. New chip: "Play It Cool with <name>" (render.js, Social group),
  gated on `activeSuspicionWindow(gs, npc)`; new `doCoverTracks` (ui.js).
  **Live-verified**: opened a window via console (mirroring what a real
  pickpocket-suspected roll would do), the chip appeared, clicking it
  narrated ("You play it cool with Wendell — a joke, a shrug, nothing to see
  here...") and dropped `npc.suspicion.boundary_violation` from 0.12 to
  0.036 (0.12 − 0.12×0.7), and the chip vanished afterward — a second click
  is refused (`resolveCoverTracks` returns `ok:false`), and an unused window
  expires on its own once the clock passes it (Node-verified).
- **New Node harness `verify-aa-p1b.js`** (31 assertions, all passing).
  `image.js` is deliberately NOT in its `required` list — it has a real,
  pre-existing, out-of-scope bug (an unconditional top-level
  `window.addEventListener('resize', ...)` around image.js:2574 that no
  existing harness's `required` list catches either) that throws in the bare
  vm; function declarations still hoist before that throw, so
  `buildPhoneSnoopPhotoPrompt`/`buildVisualCharacterClause` are defined
  regardless. Flagged as a real pre-existing issue, not touched — out of
  this phase's scope and not blocking anything this phase needed. One
  process-of-writing-the-harness lesson worth recording: `SIM_generateHouse`
  mints npc ids that fold in the save seed (e.g. `npc_80uytz_0`) — a fresh
  house per trial seed means a DIFFERENT npc roster each time, so patching
  `otherHouse.npcs[originalOwnerId]` silently creates a phantom object under
  a foreign key while the real room owner in that house goes untouched. Two
  of this harness's early drafts hit exactly that (nulls where XP deltas
  should have been). The fix used throughout: ONE persistent house, vary
  `gameState.meta.clock.day` between trials instead — every roll in this
  phase's resolvers keys its rng off `(day, tick, ...)`, so this gets
  independent draws for free without ever needing a second generated cast.
  A second, smaller lesson: `WITNESS`'s applier (`addMemoryEpisode`)
  REPLACES `gameState.npcs[id]` with a new object rather than mutating in
  place (unlike `ADJUST_SUSPICION`/`REL_DELTA`/`MOVE_ITEM`, which do mutate
  in place) — a cached npc reference taken before a call that can trigger
  `WITNESS` goes stale the moment it fires. Section 1's witnessed-owner
  check now runs LAST and re-fetches `g.npcs[ownerId]` fresh for exactly
  this reason.
- **Cache-busting (invariant 8):** no new source files this phase, so
  `loadgame.js`'s `ORDER` needed no change — only `index.html`'s `?v=`
  bumped for every file actually edited: `config.js` 159→160, `signals.js`
  19→20, `stealth.js` 20→21, `npc.js` 54→55, `image.js` 37→38, `render.js`
  82→83, `ui.js` 147→148.
- **Full regression check:** `node src/src/dev/verify/run-all.js` reports
  **3329 passed, 76 failed, 13 harness(es) errored** — exactly the
  2026-08-31 baseline (3298/76/13) plus this session's 31 new passing
  assertions and zero regressions; the 76 failures and 13 errors are
  byte-identical to the pre-existing, documented-elsewhere set (`verify-w6.js`
  etc., `verify-voc-*`, `verify-present-p2/p2b/p3`, `verify-c4.js`,
  `verify-s1.js`).
- **Not built this phase, deliberately:** any unification of the three
  pre-existing stealth mechanics into one resolver (D32 explicitly rules
  this out — "the real gap is XP, not architecture"); a picker UI for which
  item to pickpocket (auto-picked, weighted, matching evidence-placement's
  own precedent); a movement-speed cost for Sneaking (not requested by D34's
  text, and would have touched `world.js`'s `walkSeconds`/`WALK.secondsPerRoom`
  tiering, outside this phase's Files line); "Redress"/"Clean Evidence"/
  "Remake Sheets" — D36's other named siblings, which belong to Phase 2's
  D30 sleeping-NPC branch and later phases' existing-search context, reading
  the SAME window mechanism this phase built.

**Blockers / flagged deviations (Phase 1B):** None. (image.js's pre-existing
top-level `addEventListener` bug is flagged above for awareness — it did not
block anything this phase needed and was left alone as out of scope.)

**This session's notes (implementation, Phase 2, 2026-08-31):**
- **D5/D6 — Make-a-Move retired as a standalone chip; folded into the Ask
  tree.** `render.js`'s "Make a Move" chip (Social group) is gone outright —
  no more `action: 'make_a_move'` anywhere; `handleAction`'s switch case in
  `ui.js` is deleted too (dead code, nothing dispatches it). `openAskMenu`
  (ui.js) now sets `askMenuPath = ['affection']` instead of `[]` — the chat
  modal's Ask button opens straight into the Affection category (D6's
  pre-expand), with the existing Back button (`askMenuGoBack`) one tap from
  the full category list. `doMakeAMove` (ui.js:905, unchanged internals) is
  no longer chip-triggered — it is now doConvSend's pass2 for an ACCEPTED,
  AWAKE `RequestIntimacy` ask (`askTurn.ask.id === 'RequestIntimacy' &&
  askTurn.decision.accept && !askTurn.decision.sleepAttempt` — the
  `!sleepAttempt` guard is load-bearing, see D30 below), called as
  `doMakeAMove(myNpcId)` — since the partner is already known (who you're
  talking to), its own partner-picker branch never fires; the flow lands
  straight on the act picker (Quickie/Sex/Cuddle/Share a Shower via the
  UNCHANGED `intimacyActsAvailable`/`runRegisteredAction` pipeline).
  **Live-verified end to end**: sent `$RequestIntimacy` to a willing NPC in
  chat, the fallback line rendered, the "How do you want to make a move?"
  picker opened automatically, picked Cuddle, and it executed through the
  real registered-action pipeline (outcome window, mood delta, time cost,
  moment photo) with zero console errors.
- **D7 — the Affection ladder: four new ask leaves, deliberately NOT built
  as ACTION_DEFS/`resolvePairedAct`.** The plan's Files line floated new
  paired-affection defs in `defs.actions.js`; that was tried first and
  dropped on inspection — `resolvePairedAct` (actions.js) unconditionally
  writes a player-ledger entry (`notePlayerLedgerEntry`, feeding the Codex's
  Confront/Spread-Secret/Matchmake system) AND runs the infidelity/
  conception passes on every paired act. A hug or a cheek kiss is not
  gossip-worthy "intimate encounter" material (`codexActLabel`'s fallback
  string is literally "an intimate encounter" for any unmapped act id) and
  should not silently roll for a pregnancy. **Flagged deviation, not a
  blocker**: `asks.js`'s `makeAffectionAsk(actId, {...})` factory builds
  `ASK_HUG` / `ASK_KISS_CHEEK` / `ASK_KISS_LIPS` / `ASK_CUDDLE` (ids `Hug`/
  `KissCheek`/`KissLips`/`Cuddle`) as PURE ask leaves whose `effects()`
  return ordinary DSL lines (`ADJUST_NEED`/`REL_DELTA`/`MOOD_DELTA`) sized
  from a new `AFFECTION_TUNING` config bucket (config.js, next to
  `ASK_TUNING`) — the exact same shape `ASK_GIFT` already uses for
  `MOVE_ITEM`/`REL_DELTA` without a registered action backing it. No new
  `defs.actions.js` entries exist for this phase.
- **The light receptivity score** (`affectionReceptivityScore`, asks.js,
  right before `makeAffectionAsk`): `affection − tension×tensionPenaltyWeight
  + npc.mood×moodWeight − seedCtx.ladderPenalty + noise`, against a
  per-act `AFFECTION_TUNING.ladder[actId].threshold` that climbs with the
  ladder (hug −0.3, kiss_cheek −0.1, kiss_lips 0.1, cuddle 0.15). D7's
  "recent history" term is NOT a new cooldown — Hug/KissCheek/KissLips/
  Cuddle/RequestIntimacy all share `category: 'affection'`, so they share
  ONE repeat-ladder streak (the existing `askLadderPenalty`/`bumpAskCount`
  machinery); asking one right after being refused another already carries
  the 2nd-ask penalty for free. D7's "location-gated" half is
  `AFFECTION_TUNING.privacyBonus` (0.15), added to kiss_lips/cuddle's score
  when `isPrivacyRoom(roomId, npc)` (cognition.js — the NPC's own room, or a
  bathroom) — a soft weight, never a hard block, matching the ask system's
  existing "the refusal gets phrased in character" precedent (ASK_INTIMACY's
  own `available()` comment). Non-'asleep' willingness floors (stranger/
  hostile/cold_shoulder/actively_refusing) are reused WHOLE via
  `affectionFloorOrSleep` (asks.js), which calls `willingnessFloorReasons`
  directly and reuses the SAME `floor_*` reason codes/phrases ASK_INTIMACY
  already had — no new floor vocabulary.
- **D30 — the sleeping-target branch, genuinely new mechanism.** Every leaf
  on the ladder (including `RequestIntimacy`, whose `decide()` now checks
  `willingnessFloorReasons(...).includes('asleep')` BEFORE ever calling
  `resolveWillingnessGate` — the old quiet `floor_asleep` refusal is gone for
  a sleeping target, replaced by a real attempt) branches into two new
  boundary.js functions: `resolveAffectionSleepAttempt(gs, actId, targetId,
  ctx)` (PURE — wake-chance roll via a new `BOUNDARY.affectionLadder`
  tuning bucket, bucketed by `catchRisk` per rung: hug/kiss_cheek low,
  kiss_lips/cuddle med, RequestIntimacy high == the existing sleep_with
  table verbatim; on a wake, receptive-vs-hostile is
  `willingnessAttraction(gs, target, 'player', ctx) × 0.6 + npcDeviancy(target)
  × 0.4` against a seeded noise draw and a 0.5 threshold — DELIBERATELY not
  `resolveBoundaryAwakeGate`'s full willingness read, per D30's explicit "no
  relationship-stage gate" text) and `applyAffectionSleepAttempt(gs,
  targetId, attempt, opts)` (MUTATES — `wake_hostile` reuses
  `applyShamingReactionLines`/`noteColdShoulder` verbatim, the SAME
  consequence a caught `sleep_with` gets; `wake_receptive` applies
  whatever `opts.relDeltas`/`opts.npcMoodGain` the CALLER supplies — kept
  generic on purpose, config-blind, mirroring the def/mechanism split
  `resolvePairedAct` already keeps; `undisturbed` writes nothing at all,
  D30's "free-use-kink" case). The ladder leaves' `postEffects` supply their
  own `AFFECTION_TUNING.relDeltas[actId]`/`npcMoodGain[actId]` on a
  receptive wake (via `effects()`'s DSL, since `decision.accept` is true by
  construction for `wake_receptive` — the SAME branch a normal accept takes,
  for free); `RequestIntimacy`'s postEffects supplies
  `INTIMACY.relDeltas.cuddle`/`INTIMACY.npcMoodGain.cuddle` instead — a
  deliberate choice to land somewhere between "nothing" and "a full
  completed sex act decided off one chat message": reuses an existing,
  already-vetted magnitude rather than inventing a new number or escalating
  through `applyReciprocatedAct` (which is `sleep_with`'s own, bed/ledger/
  infidelity-carrying completion and was judged too heavy for a chat-only
  advance with no established "in bed" premise). **Node-verified**
  (`verify-aa-p2.js` §5–7): low attraction+deviancy reliably wakes hostile
  with a real shaming reaction; high attraction+deviancy reliably wakes
  receptive; a low-risk rung against a warm-tier sleeper mostly goes
  undisturbed; each outcome writes exactly its own consequence and nothing
  else (a cross-check literally diffs the NPC object before/after the
  undisturbed branch). **Live-verified**: opened a conversation with a
  sleeping NPC (confirmed real — `doTalk`/`conversationPartnerPresent` have
  no activity gate today, a pre-existing gap this phase relies on rather
  than closes), sent `$Hug`, got the generic decline fallback line (correct
  — `sleep_undisturbed` carries `accept:false`), and confirmed via console
  the NPC's `relPlayer`/`suspicion` were byte-unchanged while the player's
  own mood ticked up by the small undisturbed payoff — zero console errors.
- **New Node harness `verify-aa-p2.js`** (26 assertions, all passing).
  Covers: category/registry shape; light-score accept/decline including a
  direct comparison against the SAME state's full willingness gate (proving
  the two are genuinely different bars, not a re-skin); flavor-blindness
  (invariant 1); the shared repeat-ladder crossing leaf boundaries within
  one category; non-asleep floors reused whole; both sleep-attempt
  resolvers in isolation; and RequestIntimacy's AWAKE path confirmed
  byte-identical to its pre-Phase-2 shape (still needs the FULL willingness
  gate, not the light score — a stranger-adjacent `__warm` npc that clears
  the ladder's Hug threshold does NOT clear `resolveWillingnessGate`'s
  0.45 bar for 'default', confirmed directly).
- **Cache-busting (invariant 8):** no new source files, so `loadgame.js`'s
  `ORDER` needed no change (config.js/boundary.js/asks.js were all already
  registered from prior phases). `index.html`'s `?v=` bumped for every file
  actually edited: `config.js` 160→161, `boundary.js` 2→3, `render.js`
  83→84, `asks.js` 13→14, `ui.js` 148→149.
- **Full regression check:** `node src/src/dev/verify/run-all.js` reports
  **3355 passed, 76 failed, 13 harness(es) errored** — exactly the
  2026-08-31 Phase-1B baseline (3329/76/13) plus this session's 26 new
  passing assertions and zero regressions; the 76 failures/13 errors are
  byte-identical to the pre-existing, documented-elsewhere set.
- **Not built this phase, deliberately:** any paired ACTION_DEFS for the
  ladder (see the flagged deviation above); a "Redress"/cover-tracks trigger
  for the D30 sleeping branch (D36's window mechanism is real and reusable,
  but this phase's three sleep outcomes are self-contained — nothing here
  opens a `_suspicionWindow`; a `wake_hostile` is a direct, immediate
  confrontation via the shaming pipeline, not a "suspected" near-miss, so
  D36 genuinely doesn't apply to it); any change to the EXISTING
  `intimacy.cuddle`/`intimacy.quickie`/`intimacy.sex`/`intimacy.share_shower`
  ACTION_DEFS or their willingness gates — Make-a-Move's tail is reused
  byte-for-byte, only its trigger moved.

**Blockers / flagged deviations (Phase 2):** One, already detailed above —
the plan's Files line for `defs.actions.js` ("any new paired-affection
defs") was deliberately NOT acted on. `resolvePairedAct`'s ledger/
conception/infidelity side effects are real, unconditional, and wrong for a
casual hug or cheek kiss; the ladder's mechanics live entirely in `asks.js`
+ a new `AFFECTION_TUNING` config bucket instead, following `ASK_GIFT`'s
existing precedent (a DSL-effects ask leaf with no registered-action
backing) rather than the plan's more literal "`resolveSharedAct`
[resolvePairedAct] / `source: { kind: 'paired' }`" phrasing. D30's
sleeping-branch resolvers (`resolveAffectionSleepAttempt`/
`applyAffectionSleepAttempt`) DO live in `boundary.js` as the plan expected.

**This session's notes (implementation, Phase 3, 2026-08-31):**
- **New file `flags.js`** — registered in BOTH `index.html` (`?v=1`, right
  after `npc.js`) and `dev/verify/loadgame.js`'s `ORDER` (same position, same
  commit). Six functions: `houseRuleConditionMet` (the condition matcher —
  `{ act, roomId }`, an absent key matches anything), `ruleCareWeight` /
  `ruleReactionSeverity` (the personality formulas), `resolveHouseRuleViolations`
  (PURE — decide), `applyHouseRuleViolations` (MUTATES — trusted-producer
  apply, same trust tier as `stealth.js`'s `resolveRoomEntryStealth`, skips
  `validateEffects`), and `checkHouseRules` (the one entry point: decide then
  apply, invariant 1).
- **New D38 — `npc.flags` is already a plain OBJECT bag, not an array; the
  plan's own data-model sketch (`npc.flags = [ {...} ]`) would have collided
  with it.** Checking the real codebase (not just the plan's prose) found
  `npc.flags` already carries dozens of `_`-prefixed sub-records
  (`_coldShoulder`, `_askCounts`, `_suspicionWindow`, `_intimacyHistory`,
  `_askPhotoDraft_*`, `_driveCooldowns`, ...) across `asks.js`, `npc.js`,
  `overture.js`, `drives.js`, `effects.js`. Overwriting it with a bare array
  would have silently broken every one of those. Resolution, following the
  SAME def/instance split D2/D37 already established for commitments: the
  rule DEFINITION (`condition`/`weight`/`label`) lives in `config.js`'s
  `HOUSE_RULE_DEFS` (a table, like `PICKPOCKET_TUNING`/`COMMITMENT_KINDS`);
  the per-house ACTIVE-rule record is `world.houseRules` (an array of
  `{ id, setDay }` only — exactly what the plan's own sketch already had for
  `world.houseRules`, untouched). `npc.flags` was never touched by this
  phase. **Boundary flags (D13, Phase 7) and NPC-owned comfort flags (D16,
  Phase 8) still need their own instance-storage decision when built** —
  almost certainly a new sub-keyed array on the EXISTING `npc.flags` object
  (e.g. `npc.flags._boundaryRules = [...]`), matching every other per-NPC
  record's convention, never a bare array replacing `npc.flags` itself. Flag
  this for whichever session builds Phase 7/8.
- **New D39 — D15 names traits that don't exist under those names;
  mapped onto the real `npc.bible.temperament` schema (warmth, volatility,
  openness, conscientiousness, assertiveness, selfAwareness — no
  `agreeableness`, no `disinhibition`).** `ruleCareWeight` (flags.js): warmth
  is the closest existing stand-in for "agreeableness" (a warmer NPC lets
  more slide — negative weight) and conscientiousness raises how much an NPC
  minds order/propriety (positive weight), combined via `FLAGS_TUNING.careBase/
  careConscientiousnessWeight/careWarmthWeight`, gated by `minCareToReact`
  (0.25) below which a violation is let go with ZERO consequence — no memory,
  no deltas, not just a smaller one. `ruleReactionSeverity`: volatility
  (emotional reactivity / low impulse control) is the closest existing
  stand-in for "disinhibition," scaling how sharp the reaction runs once it
  fires (`FLAGS_TUNING.severityBase/severityVolatilityWeight`) — never
  whether one fires at all, which is `ruleCareWeight`'s job alone. Both reuse
  traits this file already leans on for comparable personality-scaled reads
  (`npcDeviancy`, the shaming-reaction tiers), rather than inventing two new
  temperament axes with no other consumer (invariant 6).
- **Detection is co-presence (`getPresentNpcIds`), not a `perceiveSignals`
  round-trip — a deliberate reuse, not a shortcut.** Design invariant 3 ("an
  NPC is never bound by a rule it cannot perceive") is satisfied by
  construction: an NPC not in `event.roomId` never enters `presentIds` and
  never reacts (Node-verified directly — `verify-aa-p3.js` §2 — and
  live-verified: moving the witness to the kitchen before eating produced
  zero new memory fact and a byte-identical `relPlayer.tension`, confirmed
  after the fact even though the NPC's own autonomous drives walked her back
  into the living room moments later — the eat resolved against her location
  AT THE MOMENT it fired, not after). Reasoning: `SIGNAL_TUNING.attenuation.sight`
  is 0.10 (signals.js — sight essentially never leaves its own room already),
  and eating is not secretive — nobody rolls a stealth chance to eat a
  sandwich — so a full signal emission+query round-trip would just re-derive
  what co-presence already answers, for the one act this phase wires. This
  is the SAME primitive `resolveRoomEntryStealth`/`resolvePeep` already use
  for an overtly witnessed act (stealth.js) — **whichever phase adds the next
  house-rule condition should default to this same shape, not build a signal
  producer, unless that condition is actually about something an NPC could
  plausibly miss from an adjacent room** (at which point a real
  `perceiveSignals` query is the right tool, and co-presence would be wrong).
- **Hook point: `effects.js`'s `applyEatItem` (the `EAT_ITEM` effect
  applier), one unconditional call at the very end** — `checkHouseRules(ctx.gameState,
  { act: 'eat', roomId: eaterRoom, actorId: who })`, where `eaterRoom` is the
  eater's OWN location (`ctx.gameState.player.location` for `who==='player'`,
  `ctx.gameState.npcs[who]?.location` otherwise). This is the ONE place every
  eating path already funnels through — `self.eat` (kitchen/dining only,
  defs.actions.js), the inventory panel's location-agnostic "Use" verb
  (`doInventoryUse`, ui.js — the ONLY way to actually eat in the living room
  today, since `self.eat`'s own `source.roomIds` is `['kitchen', 'dining']`),
  and `set_meal`'s per-attendee NPC feeding — so one hook covers the chip,
  the panel, and NPC-side eating without three separate call sites drifting
  apart. Verified this is real wiring, not just the standalone flags.js
  functions in isolation, two ways: `verify-aa-p3.js` §6 fires the actual
  `EAT_ITEM` DSL line through `applyEffects` (not a direct `checkHouseRules`
  call) and asserts the witness's tension still rises; live-verified in
  `dev-harness.html` by eating a real Granola Bar through the actual
  Inventory panel's Use button while a rolled sandbox NPC (Rowena) stood in
  the Living Room with the rule active — her `mood` dropped to -0.066,
  `relPlayer.tension` rose to 0.044, and a real memory fact landed:
  `{ text: 'Watched you ignore the house rule: "No eating in the living
  room."', category: 'house', emotionalTag: 'domestic' }` — zero console
  errors from any file this phase touched (the one console error present,
  `menu.js`'s pre-existing `root is not defined`, is `dev-harness.html`'s own
  documented Perchance-global limitation, untouched by this phase).
- **Player-facing verb: a free toggle chip, NOT a `defs.actions.js` entry —
  flagged deviation from the plan's own Files line, not a blocker.** The
  Files line asked for "flag-management verbs" in `defs.actions.js`;
  `ACTION_DEFS` entries are built for resolved, timed, narrated acts
  (`self.eat`, `self.cook`) and a house-rule declaration is an instant,
  zero-cost stance exactly like Sneaking (D34) — so this phase mirrors THAT
  precedent instead: `render.js`'s `misc`/"More" chip group gained "Set/
  Rescind House Rule: No Eating in the Living Room" (toggles on
  `world.houseRules`), `ui.js`'s new `doToggleHouseRule()` (no time cost,
  narrates, saves — byte-identical shape to `doToggleSneaking`), a
  `'house-rule.toggle'` case in `handleAction`'s switch, and a matching entry
  in `isActionExemptFromEnergyGate`. Only ONE rule template ships
  (`HOUSE_RULE_DEFS.no_eating_living_room`), so the toggle hardcodes that id
  rather than threading a `ruleId` param through the chip-click wiring for a
  list of one (render.js's chip objects only carry `action`/`npcId` through
  to the DOM today — no generic custom-field passthrough exists, and
  building one for a single caller would be invariant-6 plumbing with no
  second user yet).
- **New Node harness `verify-aa-p3.js`** (23 assertions, all passing).
  Covers: the condition matcher's key-presence semantics; the perception gap
  (design invariant 3) byte-for-byte; a co-present high-care NPC's full
  reaction (both effects, mood down, tension up, the belief's exact
  category/tag, 2nd-person phrasing matching `WITNESS_MEMORY_TEMPLATES`'s own
  precedent); a real no-op when no house rule is active; the personality
  gate genuinely zeroing the reaction (not shrinking it) for an extreme
  low-conscientiousness/high-warmth NPC; the real `EAT_ITEM` wiring (not a
  direct `flags.js` call); and that an actor is never counted as their own
  witness. **First save-format lesson worth recording**: this harness's
  final summary line originally read `` `\n${pass} passed, ${fail} failed` ``
  (no leading spaces) — `run-all.js`'s parser requires the EXACT two-space-
  indented, `=`-bordered format every sibling harness uses
  (`` `\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}` ``,
  regex `/^ {2}(\d+) passed, (\d+) failed$/m`); getting this wrong makes
  `run-all.js` report the harness as "DID NOT REPORT — ran with an error"
  even though the harness itself exits 0 with everything passing when run
  standalone — worth checking a NEW harness's summary line against a sibling
  file's `tail`, not just running it alone, before trusting a full sweep.
- **Cache-busting (invariant 8):** `flags.js` is new (`?v=1`, both lists).
  `index.html`'s `?v=` bumped for every other file actually edited:
  `config.js` 161→162, `effects.js` 37→38, `render.js` 84→85, `ui.js` 149→150.
- **Full regression check:** `node src/src/dev/verify/run-all.js` reports
  **3378 passed, 76 failed, 13 harness(es) errored** — exactly the
  2026-08-31 Phase-2 baseline (3355/76/13) plus this session's 23 new passing
  assertions and zero regressions; the 76 failures/13 errors are
  byte-identical to the pre-existing, documented-elsewhere set.
- **Not built this phase, deliberately:** NPC SELF-compliance with a house
  rule (would an NPC voluntarily avoid violating their own rule) — D15's
  "compliance" language could be read to include this, but it would mean
  wiring a new gate into `cognition.js`'s `scoreCandidates`/`DRIVE_DEFS`, a
  much larger and riskier lift touching the live drive-scoring system; only
  the detect-a-violation-and-react half is built and verified. D13's
  boundary flags (Phase 7) and D16's comfort flags (Phase 8) — the engine
  (`houseRuleConditionMet`/the personality formulas) is written generically
  enough for both to read through, but neither has a producer, a UI, or an
  instance-storage shape yet (see D38 above). A picker UI for multiple house
  rules — moot with exactly one rule; whichever phase adds a second one
  decides that UI. `ADJUST_SUSPICION` for a house-rule violation — 
  deliberately omitted; suspicion is P1B's stealth-specific
  `boundary_violation` subject for acts the player is HIDING, and eating in
  the wrong room in front of someone is not that — the belief/gossip fact is
  the whole consequence, matching "you saw me do it" rather than "you caught
  me sneaking."

**Blockers / flagged deviations (Phase 3):** One, detailed above — the
plan's Files line for `defs.actions.js` ("flag-management verbs") was
deliberately NOT acted on; a free toggle chip (Sneaking's own D34 precedent)
fits a zero-cost declaration better than a resolved `ACTION_DEFS` entry.

**This session's notes (implementation, Phase 4, 2026-09-01):**
- **New D40 — item stacks already carry a real per-instance `ownerId`
  (`items.js`, `{ defId, qty, ownerId, meta }`); D8's plan text asking for
  `ITEM_DEFS` to "gain an optional owner" was written before checking the
  live code and doesn't fit — `ITEM_DEFS` is the static per-def catalog (one
  "hoodie" entry for every hoodie in the game), never a place to hang a
  single instance's current holder. The real D8 shape: `ownerId` (already
  shipped, previously under-used — mostly `'player'`/`null`) plus a NEW
  `meta.borrowed = { from: npcId, dueDay }` stamp, following the file's own
  header comment ("later phases add fields here, this is the single
  source"). Borrow/Return leaves (below) deliberately bypass the generic
  `MOVE_ITEM` effect line for the actual transfer — `applyMoveItem`
  (effects.js) hardcodes the destination `ownerId` to `'player'`-or-`null`,
  which is flatly wrong for a borrow (the whole point is that ownership does
  NOT follow possession) — and call `items.js`'s `removeStack`/`addStack`
  directly instead, so the lender's id rides as the real `ownerId` from the
  start. Confirmed live: a borrowed item's `ownerId` reads as the LENDER's
  npc id while it sits in the player's own `inventory` array, and
  `addStack`'s own ownerId-keyed merge check means it can never silently
  fuse with a stack the player already owns outright of the same def (proof:
  `verify-aa-p4.js` §8, and live-verified with a stackable `energy_drink`
  case). `stealth.js`'s existing `doTakeFromRoom` (the steal path) needed
  ZERO changes — it already sets `ownerId: 'player'` on a take via the
  generic MOVE_ITEM path, which is exactly right for a steal's PERMANENT
  transfer (D8), unlike a borrow's temporary one.
- **D9 — the money ledger: new file `money.js`** (the plan's own flagged
  "genuine kickoff-time call" — no existing file fit; a small dedicated
  module matches this codebase's per-concern convention, same as `flags.js`
  Phase 3). Three functions: `moneyOwedByPlayer`/`moneyOwedToPlayer` (PURE
  reads — `moneyOwedByPlayer` falls back to the legacy `_loanOwed` flag when
  the new ledger has no entry yet, so an old debt is visible and repayable
  before anything migrates it) and `adjustMoneyLedger(gs, npcId, side,
  delta)` (MUTATES — folds any legacy `_loanOwed[npcId]` into the ledger on
  its first write, clamps each side at 0, prunes the whole per-npc entry
  once both sides settle). **Purity was the one real trap here**: an earlier
  draft folded the legacy migration into the READ helper, which would have
  made `ASK_REPAY.available()` — called during ask-menu RENDER, not a real
  turn — silently mutate state just from opening the chat menu, a direct
  invariant-1 violation. Split into a pure read (used by `available()`/
  `decide()`) and a separate mutating write (called only from `postEffects`)
  once that was caught.
- **`ask_loan`/`ask_repay` (asks.js) now map onto the ledger**, exactly as
  D9 asks: their `postEffects` call `adjustMoneyLedger(gs, npcId,
  'playerOwes', ±amount)` instead of touching `player.flags._loanOwed`
  directly; `repayAmountFor`'s pure read now goes through
  `moneyOwedByPlayer`. A FRESH loan never touches the legacy flag at all
  (`verify-aa-p4.js` §3) — only a save that still has an old `_loanOwed`
  entry ever exercises the fold-in path.
- **New leaf `$GiveMoney`** (`asks.js`, id `GiveMoney`, category `money`):
  the player hands money to whoever they're talking to, no request needed.
  Always accepted (same "the verdict IS the transaction" shape as
  `ask_gift`/`ask_repay`) — the flavor's mode word (`giveMoneyModeFromFlavor`,
  `/\bloan\b/i`) decides whether it's a no-strings gift (small affection
  `REL_DELTA`, `ASK_TUNING.giveMoney.giftRelDelta`, no ledger entry) or a
  loan (books `npcOwes`, no relationship delta of its own), the SAME
  structured-in-flavor precedent `inviteKindFromFlavor` set in Phase 1 — it
  moves what gets booked, never whether the hand-over lands (D1). Amount
  capped by money on hand only (`giveMoneyAmountFor`) — no phase ceiling,
  unlike `ask_loan`'s REQUEST cap, since giving your own money away needs no
  plausibility limit. Live-verified: `$GiveMoney $50 loan` to a warm NPC
  spent the $50 for real and left `moneyLedger[npcId].npcOwes === 50`.
- **New leaf `$CollectMoney`** (id `CollectMoney`, category `money`): the
  `npcOwes` mirror of `ask_repay` — always accepted, no NPC wallet to cap
  against (same "no NPC cash field exists, by design" reasoning `ask_loan`'s
  own header already gives), `EARN_MONEY` granted abstractly and
  `adjustMoneyLedger(gs, npcId, 'npcOwes', -amount)` in `postEffects`. This
  is what makes D9's "repayment clears both directions" true WITHIN Phase 4
  — D10's NPC-initiated request (Phase 5) is a different, later door onto
  the SAME ledger, not a prerequisite for this one closing. Live-verified
  end to end: collecting the $50 `GiveMoney...loan` debt back through
  `$CollectMoney` returned the player's money to $500 and emptied the
  ledger entry.
- **New leaf `$BorrowItem`** (id `BorrowItem`, category `gifts`, `borrow:
  true`): temporary transfer with a return expectation. Unlike
  gift/repay/collect, lending a POSSESSION is a real trust question — decide()
  reuses `ask_loan`'s exact affection+trust−tension−ladderPenalty+noise shape
  verbatim rather than an always-accept verdict (`verify-aa-p4.js` §7 proves
  a cold NPC genuinely refuses, leaving their own copy untouched). The item
  is a STRUCTURED input (`seedCtx.borrowDefId`, chosen via a new inventory
  picker), same contract as `ask_gift`'s `giftDefId` — never touches
  `decide()`, only which item `postEffects()` moves. New pure helper
  `borrowableStacks(gs, npc)` (inventory.js, mirrors `giftableStacks`
  exactly but reads the NPC's own `inventory`). `dueDay` stamped as
  `askDay(gs) + ASK_TUNING.borrow.dueDays` (3 game days).
- **New leaf `$ReturnItem`** (id `ReturnItem`, category `gifts`,
  `returnItem: true`): give back something borrowed. Always accepted, same
  "no 'no' to a returned debt" shape as `ask_repay`; the item is a
  STRUCTURED input (`seedCtx.returnDefId`) chosen from a new pure helper
  `borrowedFromStacks(gs, npcId)` (inventory.js — stacks in the player's OWN
  bag with `meta.borrowed.from === npcId`), scoped to one lender so the
  picker can never offer back the wrong person's thing (live-verified: with
  the sketchpad borrowed from Orien, the Return picker showed only
  "Sketchpad," nothing else). `postEffects` clears the borrowed marker and
  restores `ownerId` to the lender in the SAME `removeStack`/`addStack` call
  that moves it — never a stale `meta.borrowed` left dangling on the
  returned stack.
- **`doConvSend` (ui.js) extended with `borrowDefId`/`returnDefId`** as two
  new positional params alongside the existing `giftDefId`, NOT generalized
  into one shared "structured pick" parameter — three short, independent
  branches (each ~4 lines: find the stack, build the narration line, clear
  the input) read more plainly than an abstraction built for a case that may
  never need a fourth. `askLeaf`/`resolveAsk`'s `extra` payload selection
  follow the same three-way ternary shape. New picker functions
  `openConvBorrowPicker`/`openConvReturnPicker` (ui.js) are near-duplicates
  of `openConvGiftPicker` by design — same modal/grid/cancel shape, sourced
  from `borrowableStacks`/`borrowedFromStacks` instead of `giftableStacks`.
  `askMenuInsertLeaf` gained `leaf.borrow`/`leaf.returnItem` branches
  alongside the existing `leaf.gift` one. render.js's ask-menu row builder
  needed NO changes — it already renders a row from just `label`/`help`/
  `available()`, never assuming `template` exists (confirmed by reading it
  before touching anything — `ASK_GIFT` already proved this path works with
  no `template` field).
- **The overdue "demands it back" beat — a real hook in `doTalk` (ui.js),
  not a Tracker notification.** Considered a `tracker.js` adapter first (the
  `trackerRent`/`trackerCommitments` pattern) but there is no phone "app" a
  borrowed-item notification could deep-link into (no Inventory app exists
  in `APP_DEFS`), so that would have meant inventing UI surface this feature
  doesn't need. Instead, mirrors the EXISTING deterministic pre-turn check
  `doTalk` already does for the suspicion-confront threshold (ui.js:6786,
  same function, same placement) — a new pure read,
  `firstOverdueBorrowedStack(gs, npcId)` (inventory.js: the first stack in
  `player.inventory` with `meta.borrowed.from === npcId && dueDay <= day`),
  and if it finds one, `convAddBeat` narrates the lender asking for it back
  before the conversation opens. Repeats every talk while still overdue (a
  nag, not a gate) — nothing is consumed by the beat itself; only
  `$ReturnItem` clears it. Live-verified: advanced the clock past a 3-day
  due window and re-approached the lender — "Orien raises an eyebrow. 'Hey —
  can I get my Sketchpad back?'" rendered as the conversation's opening
  beat, before "You approach Orien to talk."
- **Steal — confirmed zero new code needed**, exactly as the plan's own Goal
  text predicted. `doTakeFromRoom` (ui.js, unchanged) already builds
  `MOVE_ITEM ${defId} ${qty} ${ownerId} player` + `ADJUST_SUSPICION
  ${ownerId} boundary_violation +${delta}` — a stolen item already lands
  with `ownerId: 'player'` (a real, permanent transfer, matching D8) and
  already raises suspicion by `witnessedSuspicionDelta`/
  `possessionTakeSuspicionDelta` depending on presence.
  `verify-aa-p4.js` §11 reconstructs those exact DSL lines and confirms the
  pipeline still behaves this way — regression coverage for a Files-line
  item that turned out to need no implementation, not proof of new work.
- **New Node harness `verify-aa-p4.js`** (46 assertions, all passing).
  Covers: the ledger's independence/clamping/pruning; the legacy-flag
  migration's purity-on-read and fold-in-on-write; `ask_loan`/`ask_repay`'s
  real mapping onto the new ledger; `$GiveMoney`'s gift-vs-loan flavor
  parsing and money-on-hand cap; `$CollectMoney` closing the other
  direction; `$BorrowItem`'s real accept/decline and the ownerId-follows-
  the-lender stamping (plus the stackable-item merge-safety case);
  `$ReturnItem`'s marker-clearing and ownership restore;
  `firstOverdueBorrowedStack`'s day-gating and per-lender scoping; and the
  steal regression above. `ITEM_DEFS` has no `novel`/generic "book" def, so
  the harness uses real catalog items instead (`hobby_sketchpad` for
  single-instance borrow/return cases, `energy_drink` — genuinely stackable
  — for the merge-safety case).
- **Cache-busting (invariant 8):** `money.js` is new — registered in BOTH
  `index.html` (`?v=1`, positioned directly before `asks.js`, its only
  caller — real position, not a documented divergence like `asks.js`'s own
  three-file exception list) and `dev/verify/loadgame.js`'s `ORDER` (same
  slot). `index.html`'s `?v=` bumped for every other file actually edited:
  `config.js` 162→163, `asks.js` 14→15, `inventory.js` 22→23, `ui.js`
  150→151.
- **Full regression check:** `node src/src/dev/verify/run-all.js` reports
  **3424 passed, 76 failed, 13 harness(es) errored** — exactly the
  2026-08-31 Phase-3 baseline (3378/76/13) plus this session's 46 new
  passing assertions and zero regressions; the 76 failures/13 errors are
  byte-identical to the pre-existing, documented-elsewhere set.
- **Live-page verification (invariant 7's presentation half):** done via
  `dev-harness.html` on `localhost:8735` (a fresh Sandbox save, one rolled
  roommate). Covered, all in one continuous conversation with the rolled
  NPC: `$GiveMoney $50 loan` (bubble, LLM reply, real `-$50` on the player
  and `npcOwes: 50` on the ledger); `Collect a Debt` clearing it back to
  `$500`/an empty ledger; the Gifts category correctly greying "Give a Gift"
  (nothing giftable in a fresh inventory) while "Borrow Something" stayed
  live; the borrow picker listing the NPC's real belongings, picking
  "Sketchpad," and the console confirming `ownerId` on the moved stack was
  the NPC's id (not `'player'`) with `meta.borrowed` stamped; advancing the
  clock 4 days and re-approaching triggering the exact overdue beat before
  the approach narration; and "Give It Back" then showing ONLY the
  sketchpad in its picker, returning it, and the console confirming the
  marker was gone and `ownerId` was restored to the NPC. No console errors
  beyond the pre-existing, documented `root is not defined` (menu.js,
  dev-harness.html's own known Perchance-global limitation).
- **Not built this phase, deliberately:** an NPC-initiated money request
  (D10 — explicitly Phase 5's, per both the Locked Decision text and the
  dependency graph); any change to `stealth.js`/`doTakeFromRoom` (steal
  already worked, see above); a picker UI for MULTIPLE simultaneous debts
  or borrows from the same NPC (the ledger and `borrowedFromStacks` both
  handle it structurally, but nothing in this phase's verification needed
  the picker to disambiguate two debts at once); any Tracker/phone-
  notification surface for an overdue item (the `doTalk` beat covers the
  plan's own verification line without inventing app UI this feature
  doesn't need).

**Blockers / flagged deviations (Phase 4):** None. (D40 above is a
documentation correction of the plan's own D8 text against the real code,
not a deviation from the phase's actual goal — the owner/borrower model it
describes is exactly what got built.)

**This session's notes (implementation, Phase 5, 2026-09-01):** See D41/D42
above (under "Reverse overtures & NPC-initiated asks") for the full real
shape of both halves of this phase — this note covers what was verified and
what was deliberately left out.
- **D10 (the request half — the only real new work; the invitation half
  D10 also names was already built before this session touched anything).**
  Two new `OVERTURE_DEFS` rows (`request_money_player`/`request_borrow_player`,
  config.js), a new sibling field to `proposes` (`requests: { kind }`), a new
  pure `requestTerms` (overture.js), and a new `def.requests` branch in
  `doOvertureRespond` (ui.js) that transacts money.js's ledger or an item
  stack directly rather than booking a commitment. `scoreOvertures`'s existing
  affection-floor motive (shared with `propose_player`) gates both. Decline
  needed zero new code — `applyOvertureRefusal` was already fully generic;
  only new `refusalFacts` tables were added per row.
- **D31 (the sleeping-player advance's real choice).** Discovered a
  pre-existing (Intimacy & Voyeurism Phase 17) mechanism already modeling
  this premise — `sneak_into_bed`/`trySneakIntoBed`/`boundarySneakCandidacy`
  (boundary.js) — with the one real defect D31 names: its "caught" branch
  resolved a fixed hostile outcome unconditionally, no player input at all.
  Extended rather than replaced: the roll (undisturbed vs. wakes) is
  byte-identical to before; "caught" now stamps a pending record
  (`npc.flags._sleepAdvance`) instead of resolving anything, and a new
  deferred gate (mirroring the overture gate's own D7 "screen is free"
  shape, hooked into the same flush sites) asks the player for a real choice
  — into it / decline / angry — applying exactly one of three outcomes via
  the new `resolveSleepAdvanceChoice`, never a second roll.
- **Live-verified in-browser** (`dev-harness.html`, a fresh sandbox with one
  generated roommate, Keiko): both new request rows opened via console
  (mirroring how Phase 1B verified the cover-tracks window), the gate
  rendered with the correct narration (`{amount}`/`{item}` substitution
  confirmed — "could you spot me $40?" / "could I borrow your sketchpad?")
  and the correct chip labels ("Help Keiko out" / "Lend it to Keiko" /
  "Not now"); accepting the money request moved real money
  (`player.money` 100→60) and wrote the ledger (`npcOwes: 40`); accepting the
  borrow request moved the real item into Keiko's `inventory` with `ownerId`
  staying `'player'`; declining produced the tailored refusal memory fact
  ("You told Keiko no when they asked to borrow money.") and the standard
  D10 affection cost. The D31 gate was verified by stamping
  `npc.flags._sleepAdvance` directly and calling
  `flushPendingSleepAdvanceGate()`: the three-choice window rendered exactly
  as designed ("Pull them closer" / "Gently say no" / "Push them off,
  furious"); "into it" flipped Keiko's `clothing`/`activity` to
  `undressed`/`intimacy`, raised affection, and emitted the moaning signal
  (confirmed via the scene's own signal indicator); "decline" and "angry"
  were confirmed against the exact tuned deltas
  (`declineRelDeltas`/`caughtRelDeltas`/`caughtSuspicion`) via console.
  No console errors beyond the two documented, pre-existing dev-harness
  stub warnings (`generateImage stubbed out`, and menu.js's `root is not
  defined` noted since Phase 1). One artifact of console-driven testing
  worth recording so a future session doesn't mistake it for a bug:
  console-opening an overture directly (bypassing the normal
  choosePursuit/resolveTick commit path) never sets that overture's
  cooldown, so the live continuous clock loop can legitimately reopen an
  equivalent-looking record moments later — call `pauseClockLoop()` before
  console-driven overture tests, as this session did once it noticed.
- **Node coverage:** new `verify-aa-p5.js` (18 assertions, all passing) —
  registration, `requestTerms`'s unconditional-money/gated-borrow shapes,
  `scoreOvertures`/`openOverture` carrying `request`, `trySneakIntoBed`'s new
  deferred-not-resolved caught branch (regression-checked against the
  unchanged silent-success branch), and all three
  `resolveSleepAdvanceChoice` outcomes plus its null-when-nothing-pending
  case. **Pre-existing, NOT this phase's to fix:** updated `verify-w17.js`'s
  one assertion that directly asserted the OLD unconditional-caught
  contract (now asserts the deferred one instead — confirmed via a
  git-stash A/B that the file's overall pass/fail count is unchanged by this
  edit, 16 passed/3 failed before and after); while debugging it, found that
  file's OWN "silent success" sub-assertion has an unrelated pre-existing bug
  (the test's search loop calls `trySneakIntoBed` once to classify
  silent-vs-caught, which already mutates the live npc, then calls it AGAIN
  on the same object for the "real" assertion — double-applying the
  `ADJUST_NEED desire` effect). Confirmed pre-existing via `git stash` against
  the untouched working tree (identical 16/3 split with zero phase-5 code
  present) — not introduced this session, not fixed this session (out of
  scope; belongs to whichever plan verify-w17.js is really tracking).
- **Full regression sweep:** `node src/src/dev/verify/run-all.js` — the
  working tree at session start already carried substantial OTHER
  uncommitted work (see `git status`: `commitments.js`/`defs.computer.js`/
  `effects.js`/`icons.js`/`image.js`/`inventory.js`/`npc.js`/
  `render.computer.js`/`render.js`/`signals.js`/`stealth.js`/`tracker.js`
  all modified, none of it touched this session), so the exact full-suite
  numbers moved between consecutive runs independent of this phase's edits
  (consistent with [[parallel-perchance-ai-sessions]] — another process
  editing the same tree). Isolated comparison (this phase's 5 source edits
  + `verify-w17.js` stashed out, full suite re-run twice): the pass/fail/error
  counts were IDENTICAL with and without this phase's source changes, aside
  from this phase's own 18 new passing assertions. All 6 `aa-p*.js` harnesses
  (Phases 1/1B/2/3/4/5): 175 passed, 0 failed.
- **Not built this phase, deliberately:** a "help" request row (D10 also
  names it, but there's no state for an accepted favor to move — no field
  without a reader, invariant 6); a reverse "give it back" flow for an
  NPC-held borrowed-from-player item (no `meta.borrowed` stamp on the
  npc-held stack this phase — see D41); any change to
  `sneak_into_bed`'s candidacy or its "undisturbed" branch (both byte-identical
  to before D42).

**Blockers / flagged deviations (Phase 5):** None.

**This session's notes (implementation, Phase 6, 2026-09-01):**
- **New ask leaf `ASK_FOLLOW`** (`asks.js`, id `'FollowMe'`, category
  `'follow'`, template `'$FollowMe <Optional>'`), registered in its own new
  `{ id: 'follow', label: '🚶 Follow', children: [ASK_FOLLOW] }`
  ASK_CATEGORIES entry (between Help Around and Photos). `decide()` is
  byte-identical to `ASK_HANGOUT`/`ASK_MEAL`/`ASK_INVITE`'s formula
  (affection − tension×tensionPenaltyWeight − ladderPenalty + noise ≥
  `ASK_TUNING.acceptThreshold`) — no new tuning bucket needed, per D1's
  "flavor/reuse the shared curve" precedent. `available()` blocks two cases:
  asking an NPC already following (`npc.follow.leader === 'player'`) and
  asking a sleeping/napping one (`npc.activity` check, the same activity
  strings `willingnessFloorReasons`' 'asleep' floor reads). `postEffects`
  is the ONE write that CREATES the relationship:
  `npc.follow = { leader: 'player', sinceDay: gs.meta.clock.day }` — direct
  mutation, no new config bucket, matching `ASK_GIFT`'s "DSL-effects leaf,
  no registered-action backing" precedent (Phase 2's own flagged deviation).
- **D11's data model note, resolved as written:** `npc.follow` carries no
  destination field, by design — this session's own reading of "Follow ends
  on arrival at the destination" is that Follow is genuinely INDEFINITE (the
  user's own scope text: "so that they will naturally travel from place to
  place in the house with you"), and "arrival" isn't a distinct trigger this
  lightweight shape needs code for — the three REAL lifecycle ends below
  cover everything the Verification bullet actually tests. Flagged here as a
  deliberate interpretation, not a factual gap, in case a future session
  reads the plan text more literally.
- **The room-by-room relocation: new `advanceFollowers(gameState, leaderId,
  fromRoom, roomSequence)`** (`movement.js`, after `reconcileNpcPos`, before
  the reverse-overture section) — called once per `doMove` (`ui.js`) with
  the SAME `walk.crossed` sequence the player's own stealth/footstep loop
  right below it already mirrors, so a follower makes the whole multi-room
  trip in lockstep rather than teleporting to the destination. A privacy-room
  refusal (`isPrivacyRoom`, cognition.js — bathroom or the follower's OWN
  bedroom, the exact "don't follow" line `imminentDeparture` already draws
  for a departing conversation partner) stops the follower one room short
  and clears `npc.follow` — the only place this function WRITES the field,
  and only ever to end it, never to begin one (D11's "the walk presentation
  never writes it" — read as "never CREATES it"). Narrated in `doMove`
  (`"${name} stops at the doorway — not going in there."`) right after the
  arrival beat. **Live-verified**: asked a resident to follow mid-chat,
  walked three rooms (hallway → living room → hallway) with them tagging
  along the whole way (confirmed via the Present panel each hop), then
  walked into a bathroom — they stopped in the hallway, `npc.follow` cleared,
  narration rendered exactly as coded.
- **The per-tick backstop and the two other lifecycle ends: `sim.js`'s
  Pass 1 and Pass 3.** A follow relationship needs to survive spans doMove
  never sees (`wait`, sleep, batch catch-up) — Pass 1 now re-affirms a
  following NPC's `location = gameState.player.location` and
  `activity = 'following'` every 30-minute checkpoint, at the TOP of its
  branch chain (higher priority than even a bound event commitment), UNLESS
  the schedule block is `sleep` or an off-site work boundary
  (`npcIsOffsite`), in which case `npc.follow` is deleted instead — an NPC's
  own bedtime/shift wins over an open-ended follow request, and they fall
  through to ordinary sleep/work placement the same tick rather than
  carrying a stale record into it. Pass 3 (drive-scoring) skips a following
  NPC entirely (a `continue` right after the residency check, before
  `ageCommitment`) so nothing opens a new commitment that would walk them
  away — following holds full attention, the same shape a held commitment
  already gets. **Node-verified** (`verify-aa-p6.js` §6–8): a displaced
  follower snaps back to the leader's room on the very next checkpoint; zero
  commitments open across 8 ticks of following; a clock minute where the
  NPC's own schedule reads `sleep` reliably releases the relationship and
  places them in their own bed, not the leader's room.
- **The other two lifecycle ends, both in `ui.js`.** `doTalk` clears
  `npc.follow` for the NPC being addressed, right next to
  `notePlayerAddressed` — stopping to actually talk ends the escort, no
  narration of its own (the conversation overlay opening is the beat). New
  **`doStopFollowing(npcId)`** (next to `doToggleSneaking`) is the explicit
  release — free, immediate, no relationship cost, same "escape hatch, not
  silent abandonment" shape as Phase 1's Clear the Calendar — wired through
  `handleAction`'s new `'stop-following'` case. New chip **"Ask `<name>` to
  Stop Following"** (`render.js`, Social group, alongside the pickpocket/
  cover-tracks loop), gated on `npc.follow?.leader === 'player'`, shown for
  resident or guest alike (`ASK_FOLLOW` itself carries no residency gate).
  **Live-verified**: the chip appears the instant a follow begins and
  disappears the instant it ends (either release path); talking to a
  follower silently drops the flag before the overlay opens; a save/quick-
  load round-trip through the real kv-backed Save/Load UI (not just
  `structuredClone` in isolation) preserved `npc.follow` byte-for-byte —
  the plan's own "reads as sim state after a load" bullet, proven against
  the actual save system, not assumed.
- **New Node harness `verify-aa-p6.js`** (25 assertions, all passing).
  Covers: ASK_FOLLOW registration/decide/available/postEffects;
  `advanceFollowers`' room-by-room relocation, non-follower isolation, and
  both privacy-room shapes (bathroom + the follower's own bedroom, each in
  its own generated house since `advanceFollowers` walks every co-located
  follower of the leader in one call — testing two outcomes independently
  needs them not to be co-present for either call, a real test-authoring
  gotcha worth flagging for whoever writes the next `advanceFollowers`
  scenario); the Pass 1 backstop; the Pass 3 commitment-skip; and the sleep
  release (with a `__sleepMinute` helper that scans real minutes via
  `resolveScheduleActivity` rather than assuming one, so the test can't pass
  vacuously if a cast's schedule ever changes shape).
- **A pre-existing issue found and isolated, NOT caused by this phase:**
  the full unfiltered `run-all.js` sweep now reports **3400 passed, 75
  failed, 14 harness(es) errored** — one MORE errored harness than the
  documented 13-harness baseline. The new one is `verify-i4.js`, crashing on
  `Object.keys(rec)` over an undefined overture record partway through its
  "four channels sort by geometry" section. Isolated by reverting this
  session's three Node-loaded touched files (`sim.js`, `movement.js`,
  `asks.js`) to the HEAD commit and re-running `verify-i4.js` in that
  state — the identical crash reproduced byte-for-byte, proving it predates
  and is unrelated to Phase 6 (it's still-uncommitted breakage from an
  earlier phase, most likely Phase 2–5's `overture.js`/`boundary.js`
  changes, given what the failing section actually tests — not chased
  further, out of this phase's scope). `verify-c2.js`'s pre-existing 11
  failures were checked the same way (sim.js reverted to HEAD) and reproduce
  identically — also not Phase 6's doing. Whoever picks up `overture.js`
  next should budget time for `verify-i4.js`.
- **Cache-busting (invariant 8):** no new source files this phase, so
  `loadgame.js`'s `ORDER` needed no change. `index.html`'s `?v=` bumped for
  every file actually edited: `asks.js` 15→16, `movement.js` 2→3, `sim.js`
  92→93, `render.js` 85→86, `ui.js` 151→152.
- **Not built this phase, deliberately:** any change to `movement.js`'s
  frame-integrator/`npc.walk` machinery — `advanceFollowers` teleports
  `npc.location` directly (via `reconcileNpcPos`, the same "a room change,
  not a journey" pattern `cognition.js`'s workspace relocation already uses)
  rather than planning an animated `planWalk` walk for the follower; the
  floor-plan avatar snaps room-to-room instead of visibly walking the path.
  Flagged as a real presentation gap, not a functional one — nothing in D11
  or the Verification bullet asked for animated follower motion, and doing
  so would mean threading a second `npc.walk` plan through a function that
  today only ever writes `npc.location`.

**Blockers / flagged deviations (Phase 6):** None (the pre-existing
`verify-i4.js`/`verify-c2.js` issue above is flagged for awareness — proven
unrelated to this phase — not a Phase 6 blocker).

**This session's notes (implementation, Phase 7, 2026-09-01):**
- **D12 (Apology).** New leaf `ASK_APOLOGIZE` (`asks.js`, id `'Apologize'`,
  category `'apology'`, template `'$Apologize <Optional>'`), belief-gated on
  `npc.js`'s EXISTING `relPlayer.grievances[]` (the `addGrievance`/
  `resolveGrievance`/`getUnresolvedGrievances` trio, already there from the
  infidelity precedent — no `beliefs.js` needed, confirming the plan's own
  TBD note). `decide()` targets the OLDEST unresolved grievance
  (deterministic, no picker UI — Phase 3's "ship the simple case" precedent);
  sincere = the FIRST attempt, made within `ASK_TUNING.apology.timelyWindowDays`
  (3) of the grievance's `day`. A new `noteGrievanceApologyAttempt` (npc.js,
  beside `resolveGrievance`) stamps a failed/late/repeat try's
  `apologizedDay` so a second attempt on the same still-unresolved grievance
  reads as insincere too, regardless of timing. Sincere repairs `trust` +
  relieves `tension` (`ASK_TUNING.apology.repairFraction`/`tensionReliefMult`
  × the grievance's own `severity`) and resolves it; insincere deepens
  `tension` by `insincereTensionDelta` and leaves it open. "Reusing the
  ladder mechanics" (D12's own words) is the EXISTING generic per-category
  ask-repeat ladder (`askLadderPenalty`) — same-day apology spam already
  costs score/trust through that shared mechanism; nothing bespoke was
  needed for that half.
  **Real transgression wiring — the actual gap, matching the plan's own
  "stealth.js (transgression source)" Files line**: before this session,
  `relPlayer.grievances` had exactly ONE producer in the whole codebase
  (`relationships.js`'s infidelity path) — none of stealth.js's three
  "caught" branches ever wrote one, so the apology leaf would have had
  nothing real to target. Added `addGrievance` calls to exactly the CERTAIN
  branches (never the "suspected"/evidence-only ones, which stay
  unconfirmed by design, D36): `resolveRoomEntryStealth`'s direct-witness
  branch (`STEALTH_TUNING.witnessedGrievance{Text,Severity}`),
  `resolvePeep`'s `detected` branch (`PEEP_TUNING.grievance{Text,Severity}`),
  `resolvePickpocket`'s `caught` branch
  (`PICKPOCKET_TUNING.caughtGrievance{Text,Severity}`). Live-verified in
  `dev-harness.html`, not just Node: walking into a rolled NPC's (Yolanda's)
  room while she was home wrote a real unresolved grievance
  ("The player walked into my room like they owned it."), and `$Apologize`
  against her the same session-day resolved it for real — `relPlayer.trust`
  0 → 0.18, `tension` fell, and a real memory fact landed
  ("The player apologized for it, and it actually landed — sincere, and
  about time.").
  **Deliberately NOT unified with the pre-existing `doApologizeNpc`/
  `noteColdShoulderRepair` button (`ui.js`/`npc.js`)** — that mechanic is
  narrowly scoped to cold-shoulder-severity repair and stays exactly as it
  was; the two apology surfaces are independent today (a sincere
  `$Apologize` does NOT also step down an active cold shoulder). Flagged
  here in case a future session wants to bridge them — not done this phase
  to keep scope to what D12 actually asked for.
- **D13 (Boundary flags).** New leaf `ASK_BOUNDARY` (`asks.js`, id
  `'AskForSpace'`, category `'boundary'`, template `'$AskForSpace <Optional>'`)
  — the reverse direction from `boundary.js`'s existing (player-violates-NPC)
  acts: the player asks an NPC to respect a boundary, and if they agree
  (a light trust/mood/tension receptivity check, `ASK_TUNING.boundary`,
  the SAME shape `affectionReceptivityScore` uses — never the willingness
  gate, this is a request) it becomes a real flag instance,
  `npc.flags._boundaryRules = [{ id, setDay }]` — the exact D38 sub-keyed-
  array-on-the-existing-bag shape Phase 3 flagged for this, confirmed
  live-verified (`_boundaryRules: [{"id":"no_enter_room","setDay":1}]` on a
  real rolled NPC after a real Ask-menu send). Ships ONE template (Phase 3's
  "ship one" precedent): `BOUNDARY_RULE_DEFS.no_enter_room` (config.js),
  condition `{ act: 'enter_room', roomId: 'bedroom_player' }` — `bedroom_player`
  is `ROOMS`' real id for the player's own room (`config.js`), confirmed
  before use, not guessed.
  **The engine**: `flags.js` gained `resolveBoundaryRuleViolation`/
  `applyBoundaryRuleViolation`/`checkBoundaryRules` — the self-directed
  sibling of Phase 3's `checkHouseRules`, reusing the SAME matcher
  (`houseRuleConditionMet`) and SAME personality formulas (`ruleCareWeight`/
  `ruleReactionSeverity`, D39) verbatim, per that phase's own note that the
  engine was built generic enough for this. The only real difference: the
  "reactor" is the BOUND NPC'S OWN conscience (their own `relPlayer.tension`
  rises when THEY break their own promised line), not a witness judging
  someone else — `FLAGS_TUNING.boundaryTensionAtFullStrength` (0.15) is a
  new, smaller, tension-only sibling of the house-rule engine's mood+tension
  pair, since nobody else saw it happen.
  **New D43 — the detection hook's real, deliberately narrow scope.**
  D13/Phase-3's own note flagged that boundary-flag instances would need
  "their own instance-storage decision when built," but left the DETECTION
  hook point entirely open. Investigated first: unlike eating (Phase 3's
  ONE funnel, `applyEatItem`), an NPC's `location` field is written from at
  least 8 independent call sites across `sim.js`/`movement.js`/`cognition.js`/
  `effects.js` — no shared mover function exists anywhere in this codebase.
  Rather than hook all 8 (a large, risky lift touching the same core
  tick/drive machinery Phase 3 explicitly declined to touch for NPC
  self-compliance), this phase hooks exactly ONE: `sim.js`'s `resolveBatch`,
  at the point it merges each tick's `npcUpdates` into `state.npcs` — a
  small diff pass (`boundaryChecks`, built from `prevLocation !== update.location`
  during the SAME merge loop, no second pass over the data) fires
  `checkBoundaryRules` for any npc whose room actually changed AND who has
  a non-empty `_boundaryRules` array (a cheap property-read guard before
  the function call, since the common case is zero active boundary rules
  house-wide). This covers every DISCRETE-tick location write `resolveTick`'s
  `npcUpdates` produces (Pass 1 schedule/wander, Pass 3 drive-driven
  `locationOverride`, visitor/overture/commitment-cancel carry-through) —
  it deliberately does NOT cover `movement.js`'s continuous live-walk
  landings (`advanceFrameWalks`/`settleWalks`), `advanceFollowers` (Phase
  6's `$FollowMe`), or `cognition.js`'s work-commitment open/`returnHome`
  writes, none of which route through `resolveBatch`'s `npcUpdates`. A
  future session that wants full coverage (e.g. an NPC dragged into the
  room by Follow, or arriving there via a live walk) has to add hooks at
  those sites too — this is a real, load-bearing scope decision, not an
  oversight, and it's flagged here so it isn't silently assumed complete.
  Verified real, not just unit-tested: `verify-aa-p7.js` §10 temporarily
  swaps in a fake `resolveTick` returning a controlled `npcUpdates` for one
  `resolveBatch` tick (proving the ACTUAL merge-and-check code path, not a
  standalone `checkBoundaryRules` call in isolation — the same discipline
  verify-aa-p3 §6 used for `EAT_ITEM`).
- **New Node harness `verify-aa-p7.js`** (34 assertions, all passing).
  Covers: registration; the belief-gate rejecting an unknown apology; a
  sincere+timely accept's full effect (trust up, tension down, resolved,
  memory fact); a too-late first attempt and a same-grievance repeat attempt
  both reading insincere; the real stealth.js→grievance wiring (a seed-swept
  real `resolvePickpocket` catch, end to end through a real `$Apologize`);
  `$AskForSpace` writing a real `_boundaryRules` instance and its
  already-agreed/hostile-floor short-circuits; `checkBoundaryRules`'s
  violation/no-op/low-care-lets-it-slide branches; and the real `resolveBatch`
  wiring (§10 above).
- **Cache-busting (invariant 8):** no new files this phase — `?v=` bumped
  for every file actually edited: `config.js` 163→164, `sim.js` 93→94,
  `stealth.js` 21→22, `npc.js` 55→56, `flags.js` 1→2, `asks.js` 16→17.
- **Live verification (invariant 7, `dev-harness.html`):** a real Sandbox
  run (one rolled roommate, Yolanda) — opened the chat modal, confirmed
  D6's Affection pre-expand still works, found both new categories
  ("🙏 Apologize"/"🛑 Ask for Space") in the Ask-menu tree via the actual UI,
  sent both leaves for real, and read the resulting `npc.flags`/
  `relPlayer`/`memory.facts` back out of live state (via `getAllNpcs()`) to
  confirm the writes were real, not just decision objects. Zero console
  errors from anything this phase touched — the one error present
  (`menu.js`'s `root is not defined`) is `dev-harness.html`'s own documented,
  pre-existing Perchance-global limitation.
- **Full regression check:** `node src/src/dev/verify/run-all.js` reports
  **3434 passed, 75 failed, 14 harness(es) errored** — the 14 errored
  harnesses are the same `voc-p*`/`present-p*`/`c4`/`i4`/`s1` set Phase 6's
  own Handoff already flagged (none touch `config.js`/`npc.js`/`flags.js`/
  `asks.js`/`stealth.js`/`sim.js`, the six files this phase edited); the 75
  failures are the same pre-existing, documented-elsewhere `w*`/`voc-p8` set
  (bathroom/temperature/pregnancy/deviancy/vocation — unrelated to this
  plan). This session's own 34 new assertions all pass. The failed count
  reads one lower than Phase 3's own baseline note (76→75) — not
  investigated further, since nothing in the moved set touches anything
  this phase's own files reference; flagged only so a future session
  doesn't mistake it for this phase's doing.

**Blockers / flagged deviations (Phase 7):** None. D43 (above) is a real,
deliberate scope narrowing (one detection funnel of several possible ones),
not a blocker — flagged in its own entry rather than here because it's a
permanent design record (a D-number), not a transient session note.

**This session's notes (implementation, Phase 8, 2026-09-01):**
- **The thermostat is real.** New `THERMOSTAT_TUNING` (config.js) replaces
  the deleted flat `UTILITY_THERMOSTAT=1.0` constant — `defaultC`(21),
  `minC`(15), `maxC`(28), `stepC`(1), `neutralC`(21), `costPerDegreeC`(0.12),
  `hvacEfficiency`(0.85), `seasonOutdoorC`([18,27,15,6], CALENDAR.seasons
  order), `baseMinC`(19)/`baseMaxC`(25), `comfortJitterC`(2),
  `clothingBiasWeight`(3), `annoyanceMoodDeltaPerDegree`(0.01)/`Cap`(0.08),
  `complainThresholdC`(3)/`complainChancePerTick`(0.08),
  `selfAdjustChancePerTick`(0.05), plus authored cold/hot complaint lines. A
  real `thermostat` object (`defs.world.js`, placed in `hallway_a` — a
  chokepoint every resident passes constantly, matching the East Wing's own
  chokepoint precedent) affords two new object-anchored ACTION_DEFS verbs,
  `thermostat.raise`/`thermostat.lower` (`defs.actions.js`, `source: {kind:
  'object', objDefs:['thermostat']}`, `timeCost:{base:1}`, mirroring
  `self.lock_door`/`self.unlock_door`'s exact two-verb shape rather than
  inventing slider UI chrome nothing else uses), gated by new
  `ACTION_REQUIREMENT_CHECKERS.thermostatBelowMax`/`thermostatAboveMin`.
  Needed ZERO `ui.js` changes — unlike D34's Sneaking toggle or Phase 3's
  house-rule toggle (both free stances with no physical object, needing
  dedicated handlers), a real object-anchored verb routes through the
  existing generic chip→registered-action bridge already. New trusted-only
  (`llm:false`, matching `EARN_MONEY`'s precedent) effect `ADJUST_THERMOSTAT`
  (effects.js, `applyAdjustThermostat`) lazily inits `world.thermostat` on
  first write (same convention as `ui.js`'s `doToggleHouseRule` initing
  `world.houseRules` — no world-gen-time field was added). **Live-verified**
  in `dev-harness.html`: the "Raise the Thermostat"/"Lower the Thermostat"
  chips appear in Hallway A's Here menu, clicking one narrates ("You nudge
  the thermostat up a notch.") and writes a real `targetC` (confirmed via
  console: 21→22→21), and forcing `targetC` to 28 (maxC) live makes the
  Raise chip vanish while Lower stays — the boundary gate working against
  real UI state, not just the standalone checker function.
- **New file `temperature.js`** (registered in both `index.html`, `?v=1`,
  right after `flags.js`, and `dev/verify/loadgame.js`'s `ORDER`, same
  position, same commit) — six pure, deterministic (no rng anywhere)
  functions: `ambientTempC`, `thermostatHvacMultiplier`, `npcComfortBandC`,
  `temperatureDiscomfort` (the one signed shared read — negative=cold,
  positive=hot, 0=inside the band — every other consumer reads THIS,
  never re-derives the sign), `temperatureClothingBiasWeight`,
  `thermostatSelfAdjustChance`. `ambientTempC` blends
  `THERMOSTAT_TUNING.seasonOutdoorC[season]` toward `targetC` by
  `hvacEfficiency` — ONE value for the whole apartment (D48: no per-room
  heat-source term this phase, a deliberate cut, not an oversight — flagged
  as its own decision since D16's sketch named "heat source bumps"
  explicitly).
- **D45 — the comfort band is a fixed range + deterministic per-NPC jitter,
  not temperament-derived**, despite D16's own sketch. Checked first (same
  discipline as D39): no real temperament axis has any physiological link to
  cold/heat tolerance. `npcComfortBandC` hashes `npcId`
  (`mulberry32(hashStr(...))`, D35's own seeded-jitter primitive) for the
  spread instead. Personality isn't wasted — `thermostatSelfAdjustChance`
  scales assertiveness into the REACTION likelihood, D39's care/severity
  split applied one level differently. Full reasoning: Locked decisions D45.
- **D46 — "change clothes" needed no new drive.** Every `CLOTHING_DEFS` item
  has carried a `thermal` stat since the intimacy plan's D11, with
  `config.js`'s own `CLOTHING_EFFECTS` comment saying outright "no reader
  today, by design" — this phase gave it its first real reader.
  `npc.js`'s `npcOutfitForContext` (already recomputes an NPC's outfit fresh
  EVERY tick, unconditionally — not gated on the `change_clothes` drive
  actually firing) now feeds `temperatureClothingBiasWeight`'s signed weight
  into `composeOutfit`'s pre-existing `bias.stats` extension point (the SAME
  one Phase 7's styleLean already uses, coexisting independently, zero
  interaction risk). A zero bias (inside the comfort band) is byte-identical
  to pre-Phase-8 behavior — confirmed directly by picking a wardrobe pair
  (`shorts`/`cargo_pants`, IDENTICAL `traits` arrays so the trait-position
  bonus term cancels, isolating comfort/attraction/thermal) where the
  default (no bias) pick is `shorts`, and a real forced-cold `gameState`
  through the ACTUAL `npcOutfitForContext` call (not `composeOutfit` in
  isolation) flips it to `cargo_pants`, then a forced-hot call flips it back.
  One real test gotcha found and fixed: the NPC's own seeded occupation
  `styleLean` (Phase 7 Dimension 1, a real independent bias) happened to
  favor `shorts` for the test's default seed/cast strongly enough to mask
  the thermal flip — neutralized in the test (`styleLean: []`) rather than
  over-tuning `clothingBiasWeight` to brute-force through an unrelated
  system's real, working bias.
- **D47 — HVAC billing's real hook.** `computer.js`'s `accrueHvacForDay` now
  reads `thermostatHvacMultiplier(gameState)` instead of the deleted flat
  `UTILITY_THERMOSTAT` constant — `1 + |targetC−neutralC|×costPerDegreeC`,
  scaling with the player's chosen DELTA, never the raw setting (21°C is
  baseline cost in every season; 28°C costs more in every season alike,
  which is what makes an extreme setting a real, felt choice rather than a
  seasonal freebie). **One pre-existing harness broke and was fixed for
  real, not routed around:** `verify-cal-p2.js` (Seasonal Calendar & Sandbox
  plan's own "D7 do-not-touch" check) asserted `UTILITY_THERMOSTAT === 1.0`
  directly — updated to assert what it actually protects (an untouched
  thermostat still bills at the exact old flat baseline,
  `thermostatHvacMultiplier({world:{}}) === 1.0`), with a comment pointing at
  this decision. Re-ran clean: all 27 of that harness's assertions still
  pass, including its own 140-day HVAC total
  (`35×(2.2+6.8+2.2+8.5)=689.5`, byte-identical to the pre-Phase-8 figure).
- **New Node harness `verify-aa-p8.js`** (31 assertions, all passing). Covers
  registration; the exact ambient-blend formula; the exact HVAC-multiplier
  formula AND its real `accrueHvacForDay` wiring (not just the standalone
  function); comfort-band determinism/per-NPC variance/bounds; discomfort
  sign correctness in both directions and zero inside the band;
  `ADJUST_THERMOSTAT`'s real DSL wiring through `parseEffectDSL`/
  `applyEffects` with clamping proven at both ends; both requirement
  checkers at both boundaries; the real `npcOutfitForContext` wardrobe flip
  (D46, above); and — the paired-trial discipline `verify-aa-p1b.js`
  established for Sneaking — a real `resolveBatch` run of 60 ticks pinning a
  household at `minC` in winter against a comfortable control on the SAME
  cast/seed, proving a real narrated `temperature_complaint` event fires, a
  real self-adjust write to `world.thermostat` eventually happens, and the
  cold household's aggregate mood drop measurably exceeds the control's —
  not "it compiles," a measured, reproducible claim.
- **Cache-busting (invariant 8):** `temperature.js` is new (`?v=1`, both
  lists). `index.html`'s `?v=` bumped for every other file actually edited:
  `config.js` 164→165, `defs.world.js` 45→46, `defs.actions.js` 47→48,
  `sim.js` 94→95, `effects.js` 38→39, `computer.js` 67→68, `npc.js` 56→57.
- **Full regression check:** `node src/src/dev/verify/run-all.js` reports
  **3465 passed, 75 failed, 14 harness(es) errored** — exactly the Phase 7
  baseline (3434/75/14) plus this session's 31 new passing assertions and
  zero regressions, ONE PRE-EXISTING HARNESS FIXED along the way
  (`verify-cal-p2.js`, D47 above — its own pass count is unchanged at 27, the
  fix repointed one assertion at the real invariant rather than adding or
  removing coverage).
- **Live-page verification (invariant 7's presentation half):** done via
  `dev-harness.html` on a new `slice-of-life-aa-p8` launch.json entry
  (port 8738 — port 8737 from a prior phase and the shared default 8734 were
  both already in use). Covered: a fresh Sandbox roll, walking to Hallway A,
  both thermostat chips appearing in the Here menu, Raise/Lower both
  narrating and writing real `world.thermostat.targetC` state, and the
  Raise chip correctly vanishing once forced to `maxC` while Lower stays
  available. No NEW console errors (the one present, `menu.js`'s
  `root is not defined`, is `dev-harness.html`'s own documented
  pre-existing Perchance-global limitation, unrelated to this phase). The
  per-tick annoyance/complaint/self-adjust mechanics are NOT independently
  re-demonstrated live beyond this — `verify-aa-p8.js` section 8's paired
  `resolveBatch` trial already proves that half with a stronger, reproducible
  guarantee than a manual multi-hour in-game wait would.
- **Not built this phase, deliberately:** any per-room heat-source term
  (cooking, occupancy) — D48, `THERMOSTAT_TUNING` is the one table a future
  producer adds a bump to; a visible "complain" bubble/modal (the mechanic
  produces a real narrated memory episode via the existing `newEvents`/
  `formatEventText`/`eventEmotionalTag` pipeline, same as `music_too_loud`,
  but no NEW UI surface — a bubble would need the kind of player-presence-
  aware plumbing `narrateOvertureArrivals` has and this ambient mechanic
  doesn't need); any change to `npc.needs.comfort` (the pre-existing,
  unrelated general-coziness need) — deliberately left untouched to avoid a
  name collision/scope-creep with D16's own comfort concept (see D45); a
  picker UI for which thermostat step size to use (one `stepC`, matching
  Phase 3's "ship one" precedent for a first version of a mechanic).

**Blockers / flagged deviations (Phase 8):** None. D45/D46/D48 (above) are
real, deliberate scope decisions (a fixed comfort band, no new drive, no
heat-source term), not blockers. D47's `verify-cal-p2.js` fix is a genuine
cross-plan repair, not a deviation from this phase's own scope — flagged in
its own D-number entry because it's a permanent record, not a transient note.

**This session's notes (implementation, Phase 9, 2026-09-01):**
- **The single biggest finding: most of D17's underlying plumbing already
  existed before this phase touched anything, shipped by an earlier plan
  (the perception/signals + food-overhaul work).** Checked before writing
  anything down, same discipline as D32/D43. Real and mature already:
  `config.js`'s `dirtyWhen`/`cleanlinessWeight`/`emits` on every
  `OBJECT_DEFS` entry (stove burner, fridge/freezer rot, sink/table dishes,
  shower grime, dresser/nightstand/bookshelf/hamper clutter, the pool);
  `world.js`'s `recomputeRoomCleanliness`/`refreshRoomCleanliness`, deriving
  a real 0-100 `world.rooms[roomId].cleanliness` from those states, already
  feeding the player's mood (`sim.js`'s `resolveMoodTarget` comfortTerm) and
  scene description text (`ui.js`); `computer.js`'s `cleanRoomObjects`,
  already resetting all of it for BOTH the paid cleaning service
  (`performCleaningVisit`) and a real, already-shipped NPC chore drive
  (`drives.js`'s `drive.cleansRoom`) — "NPCs do cleaning chores through the
  existing chore system" (D17's own text) was already fully true. What was
  NOT real: `clean.object` was declared as an `affords` entry on 13 objects
  but had ZERO `ACTION_DEFS` handler anywhere — the player had no way to
  clean anything themselves — and there was no room-level ambient layer at
  all, which matters because `hallway_a`/`hallway_b`'s only objects
  (`coat_rack`, `thermostat`, the inert `floor`) are ALL
  `cleanlinessWeight: 0`, so the existing system can never make a hallway
  read as anything but a flat `CLEANLINESS.baseline` (50) forever. This
  reframed the phase from "build a cleaning system" to "close the two real
  gaps: an ambient per-room layer for object-sparse rooms, and a player
  verb" — see new **D49**/**D50** (Locked decisions) for the full reasoning
  and the resulting scope calls.
- **Real identifiers.** New file `dirt.js` (registered in both `index.html`
  and `loadgame.js`'s `ORDER`, directly after `temperature.js`; needs only
  `world.js`'s `refreshRoomCleanliness` and `effects.js`'s `clamp`, both
  loaded earlier): `roomDirtOf(gameState, roomId)`, `bumpRoomDirt(gameState,
  roomId, amount)` (the one write path — clamps to [0,1], always calls
  `refreshRoomCleanliness` itself so cleanliness can never go stale against
  it), `dustSignalIntensity(dirt)`. New `DIRT_TUNING` (config.js):
  `footTrafficPerTick: 0.003`, `cookingDirtPerCook: 0.05`,
  `eatingDirtPerAct: 0.02`, `cleanStepBase: 0.5`, `cleanStepVacuum: 0.85`,
  `visibleFloor: 0.05`, `cleanlinessPenaltyMax: 35`, `dustSignalFloor: 0.12`,
  `dustSignalScale: 0.5`. New standing signal `SIGNAL_DEFS.dust` (config.js,
  channel `smell`), emitted by a new small room-loop at the end of
  `signals.js`'s `deriveStandingSignals` (the one standing signal with no
  `OBJECT_DEFS.emits` entry behind it — there's no single object to hang it
  on, which is the whole point). New trusted-only effect `ADD_ROOM_DIRT`
  (`effects.js`'s `EFFECT_DEFS`, `paramShape: ['roomId','amount']`,
  `llm:false`, `applyAddRoomDirt`, new `EFFECT_LIMITS.roomDirtDeltaCap: 1`)
  — cooking's `buildCookEffects` (`defs.actions.js`) pushes it as a DSL
  line; eating's `applyEatItem` (`effects.js`) and the per-tick foot-traffic
  hook (`sim.js`) call `bumpRoomDirt` directly, matching how
  `ADJUST_THERMOSTAT`'s own per-tick self-adjust block calls
  `gameState.world.thermostat` directly rather than round-tripping through
  the DSL. New room-sourced ACTION_DEFS entry `self.clean` (`defs.actions.js`,
  `source.roomIds: ALL_ROOMS`, `requires: ['roomHasDirt']`, `skill: {id:
  'cleaning', xp: 4}`, runtime logic `prepareClean`/`buildCleanEffects`/
  `cleanNarration` — the two-step prepare/buildEffects contract every
  dynamic action in that file follows). New requirement checker
  `ACTION_REQUIREMENT_CHECKERS.roomHasDirt`. `computer.js`'s
  `cleanRoomObjects` gained one line resetting `world.rooms[roomId].dirt =
  0` before its existing `refreshRoomCleanliness` call. `world.js`'s
  `refreshRoomCleanliness` now blends `dirt * DIRT_TUNING
  .cleanlinessPenaltyMax` into the object-derived score. `state.js` and
  `sim.js`'s two room-shell-init sites both set `dirt: 0` on a fresh room
  (not a required migration — every reader already falls back to `?? 0`/
  `|| 0` for a save written before this field existed).
- **Supplies, real but minimal.** Rather than inventing a new item,
  `self.clean` checks/consumes the pre-existing `all_purpose_cleaner`
  `ITEM_DEFS` entry (`defs.world.js`'s "Cleaning supplies" section) — a
  purchasable item with ZERO readers anywhere in the codebase before this
  phase. Owning one picks `cleanStepVacuum` (a bigger single-pass drain)
  over `cleanStepBase`, consumed for real via a real `DESTROY_ITEM
  all_purpose_cleaner 1 player` line. `dish_soap`/`sponge` (same section,
  same "purchasable, zero readers" shape) remain unwired — a real, smaller
  follow-up, not a phase-9 requirement (D17's verification checklist never
  names supplies). See D50.
- **`clean.object` is a real, deliberately deferred gap, not an
  oversight — see D50.** Wiring it needs its own design pass: the existing
  multi-object action-source convention (`source.objDefs`,
  `findObjectInRoom`'s `.some()`) lights up ONE chip whenever ANY listed def
  is present in the room, with no built-in mechanism to pick which of
  several simultaneously-dirty object types the chip should target if more
  than one is dirty at once (e.g. a kitchen with both a greasy stove and a
  cluttered coffee table). `prepareClean`/`buildCleanEffects` are the
  pattern to extend, or the precedent to follow, whichever a future session
  judges more direct.
- **Node verification: `verify-aa-p9.js`, 46/46 passing.** Covers (0)
  registration of every new identifier; (1) `bumpRoomDirt`'s clamp and its
  REAL `refreshRoomCleanliness` blend, proven on `hallway_a` specifically
  (every object there is `cleanlinessWeight:0`, so its cleanliness can only
  move because of `dirt` — a direct, load-bearing proof, not an assumption);
  (2) `ADD_ROOM_DIRT`'s real DSL wiring both directions plus the magnitude-
  cap/bad-room validation; (3) the `dust` standing signal's real gating and
  exact-formula intensity; (4) `cleanRoomObjects` resetting the ambient
  layer for real (the "NPC chore cleans a room" bullet); (5) `applyEatItem`
  as a real dirt source; (6) `buildCookEffects` as a real dirt source — its
  own returned line set ALSO includes an `EAT_ITEM` call (`self.cook`
  auto-eats what it just made), so applying the full real line set correctly
  bumps kitchen dirt by cooking AND eating combined, not cooking alone — a
  genuine emergent interaction the test asserts explicitly rather than
  fighting; (7) `self.clean`'s full prepare/buildEffects/narration contract,
  the `roomHasDirt` gate flipping both ways, and the `all_purpose_cleaner`
  consumption path (with and without the item owned); (8) real per-tick
  wiring through `resolveBatch` — foot traffic measurably raises dirt over
  20 ticks, AND a real sleep-guard proof: forcing `npc.schedule.currentBlock`
  directly does nothing (Pass 1 re-derives `block` fresh from `SCHEDULES`
  every tick — a trap this session hit and is flagging so a future session
  doesn't re-hit it), so the real control is pinning the clock to midnight
  on a real weekend day (`(day+5)%7 >= 5`), where every `SCHEDULES` variant's
  weekend sleep window covers the whole test window regardless of which
  shift template an NPC was assigned; (9) hallway_a/hallway_b end-to-end —
  the literal "Clean Hallway" ask, proven on both rooms.
- **Live-page verification (invariant 7's presentation half):** done via
  `dev-harness.html` on a new `slice-of-life-aa-p9` launch.json entry (port
  8739). A fresh Sandbox roll, walked to Hallway A: the "Clean Up" chip is
  correctly ABSENT at `dirt:0`; a direct `bumpRoomDirt(currentGameState,
  'hallway_a', 0.6)` in the console changed the underlying state
  (`resolveAvailableActions` immediately listed `self.clean` as `ok:true`)
  but the chip did NOT refresh until a genuine room-transition re-render
  (walked to Living Room and back) — a harness/render-timing quirk of
  injecting state out-of-band, not a real bug, and worth remembering if a
  future session pokes `currentGameState` directly from the console. After
  a real transition: the chip appeared, the scene narrated "A faint
  staleness, the smell of a room that hasn't been aired out" (the new
  `dust` signal, live), clicking it narrated "You sweep and tidy Hallway A.
  It's better, but there's more to do." (dirt 0.6→0.1, `cleanStepBase`),
  and clicking it again narrated "...until it's spotless." and the chip
  disappeared (dirt→0). No new console errors — the one present
  (`menu.js`'s `root is not defined`) is `dev-harness.html`'s own documented
  pre-existing limitation, unrelated to this phase, same as Phase 8 noted.
- **Full regression check:** `node src/src/dev/verify/run-all.js` reports
  **3511 passed, 75 failed, 14 harness(es) errored** — exactly the Phase 8
  baseline (3465/75/14, from Phase 8's own Handoff note) plus this session's
  46 new passing assertions and zero regressions. Individually inspected
  every one of the 14 errored harnesses' actual stack traces
  (`verify-c4.js`, `verify-i4.js`, `verify-present-p2/p2b/p3.js`,
  `verify-s1.js`, `verify-voc-p1/p1-equiv/p2/p34/p56/p7/p8/p9.js`) — none
  mention `dirt`, `DIRT_TUNING`, `self.clean`, `ADD_ROOM_DIRT`,
  `cleanRoomObjects`, or anything this phase touched; they're pre-existing
  and unrelated (a `sink_kitchen.states.dishes` read on `undefined`, two
  generic `Object.keys` on `undefined`/`null`, a missing `OCCUPATION_SCHEMA`
  — none of them new. (A stash/pop round-trip to get a true isolated before/
  after diff was attempted and immediately abandoned once it reverted far
  more than this session's own edits — this repo has substantial prior-
  session work still uncommitted, so `git stash` on any file this phase
  touched reverts THAT work too, not just Phase 9's slice of it. Restored
  immediately via `git stash pop`; nothing was lost. Comparing against
  Phase 8's own recorded post-Phase-8 baseline instead was the safe,
  accurate path — don't repeat the stash attempt in a future session for
  the same reason.)
- **Not built this phase, deliberately:** `clean.object` (per-object
  stove/fridge/shower/dresser/etc. cleaning — D50); a `dish_soap`/`sponge`
  reader; parties as a dirt source (D26/Phase 17 doesn't exist yet); any
  NPC-mood-malus-from-dirt mechanic mirroring the temperature/music
  per-tick annoyance blocks — the player's own mood already reacts via the
  pre-existing `comfortTerm` (now reading the blended cleanliness for free),
  and D17's verification checklist never asked for an NPC-side one, so
  adding it would have been unrequested scope.

**Blockers / flagged deviations (Phase 9):** None. D49/D50 (above) are real,
deliberate scope decisions (the ambient layer as a new field rather than a
dirtyWhen reuse; `clean.object` and finer-grained supplies deferred), not
blockers.

**This session's notes (implementation, Phase 10, 2026-09-01):**
- **Same finding as D49/D50, checked before writing anything down per the
  Phase 9 Handoff note's explicit prompt to check: `trash_kitchen`'s
  `fill`/`rotten_food` states and `toilet`'s `clean` state were already
  real, already read (`dirtyWhen`/`emits`/`refreshRoomCleanliness`), and
  `trash_kitchen`'s `fill` was even already being WRITTEN — by the kitchen
  eat-drive's `leaves` table (config.js) — with nothing anywhere to ever
  reset it. `toilet`'s `clean` state had no writer OR reader gap; it had a
  reader and NO writer at all before this phase. Both are exactly D18/D19's
  real job: verbs, not data. `coffee_maker` and `bathroom_mirror` carry no
  `dirtyWhen` at all, so `self.brew`/`mirror.groom` are flat beats with no
  loop to close; `sink_bathroom`'s `clutter` state exists but isn't
  use-driven (it's about toiletries left on the counter, not hand-washing),
  so `sink.wash_hands` stays flat too.
- **`self.brew` deliberately reuses self.cook's own ingredient-consumption
  helpers (`kitchenSources`/`ingredientDestroyLines`/
  `findObjectByDefIdLive`/`kitchenIngredientPool`, all in `defs.actions.js`)
  rather than re-deriving a second "where does this ingredient live"
  lookup** — same file, already correct, already tested by the food-overhaul
  plan. The only real design call was the OUTPUT: `dish_fresh_coffee`
  already existed (ITEM_DEFS, energy/hunger/kcal, previously only reachable
  by restaurant purchase) so brewing needed no new item, just a new
  producer. Not facility-gated on `kitchen_appliances` — that facility's
  `broken` tier is literally the fridge quality ladder's bottom rung ("Old
  Fridge"), and `coffee_maker` is in the base kitchen layout from day one;
  gating a basic appliance behind a fridge upgrade would have blocked
  something the object model says already exists. Gated on `powerNotCutoff`
  only (a drip machine is electric; no facility tier fits).
- **Real identifiers** (all in existing files — no new file this phase):
  `defs.actions.js` — six ACTION_DEFS entries (`self.brew`,
  `trash.take_out`, `toilet.use`, `toilet.clean`, `sink.wash_hands`,
  `mirror.groom`), three ACTION_REQUIREMENT_CHECKERS (`hasCoffeeBeans`,
  `trashNeedsTakingOut`, `toiletDirty`), and their runtime functions
  (`prepareBrew`/`buildBrewEffects`/`brewNarration`, `prepareTrashOut`/
  `buildTrashOutEffects`/`trashOutNarration`, `prepareToiletUse`/
  `buildToiletUseEffects`/`toiletUseNarration`, `prepareToiletClean`/
  `buildToiletCleanEffects`/`toiletCleanNarration`). `config.js` —
  `ACTION_TUNING.brewMinutes/trashOutMinutes/trashOutMoodGain/
  toiletMinutes/toiletHygieneGain/toiletCleanMinutes/toiletCleanMoodGain/
  washHandsMinutes/washHandsHygieneGain/groomMinutes/groomHygieneGain/
  groomMoodGain`. `defs.world.js` — `affords` arrays updated on
  `coffee_maker`, `trash_kitchen`, `toilet`, `sink_bathroom`,
  `bathroom_mirror`.
- **New `verify-aa-p10.js`** (38/38 passing): registration of all six verbs/
  three checkers/five affords updates; `self.brew`'s gate + real ingredient
  consumption + real `dish_fresh_coffee` spawn + the no-beans cancel path;
  `trash.take_out`'s gate both directions + the real `refreshRoomCleanliness`
  pickup (the generic `actions.js` touchedRooms sweep wasn't re-tested here
  since it's pre-existing/invariant-level — this harness calls
  `refreshRoomCleanliness` directly to prove the READ side instead);
  `toilet.use`/`toilet.clean`'s full dirty→clean→dirty loop including both
  gate directions; the flat `sink.wash_hands`/`mirror.groom` effects; and a
  dedicated check that grooming's mood line is a REAL `pushMoodImpulse` call
  (not a dead write) via `player.moodEvents`. **No live-page pass this
  session** — every new verb is an object-sourced chip with flat or
  single-object-state effects, the same shape as already-shipped
  `thermostat.raise`/`self.lock_door`, so the Node coverage is the real
  proof per invariant 7; nothing here is presentation-layer.
- **D52's bug fix (see Locked decisions) was NOT optional scope creep** — it
  was discovered because `toilet.use`/`toilet.clean` literally could not be
  verified (or work in the real game) without `toilet`'s real `states`/
  `dirtyWhen`, which the pre-existing `Object.assign(OBJECT_DEFS, {...})`
  anchor-table bug was destroying. Root-caused per the fix-don't-workaround
  rule rather than dodged (a `toilet`-only special case would have left
  `shower`/`stove`/`bed`/`sink_kitchen` — objects THIS PLAN'S OWN
  `self.shower`/`self.cook`/`self.dishes` already depend on — broken for
  every future phase). Blast radius measured both ways (fix present vs.
  reverted) before trusting it; see D52 for the exact numbers. The `run-all.js`
  baseline this phase leaves for the next session is **3637 passed, 82
  failed, 12 harness(es) errored** — NOT directly comparable to the
  2026-08-31-documented "3298/76/13" baseline, since that number predates
  (or predates measuring against) this bug; treat 3637/82/12 as the new
  floor. The 82 failed and 12 errored are itemized by name in D52 and are
  confirmed unrelated to this plan.

**Blockers / flagged deviations (Phase 10):** None for D18/D19 themselves.
D52's discovery (unrelated pre-existing bugs in `verify-w6/w9/w13/w15/w16/
w17/w18` now visible instead of masked by a crash) is flagged for a future
session, not blocking this plan's own progress.

---

## The thesis

The apartment is already mechanically dense — food, intimacy, needs, gossip,
overtures, a whole OS — but it still feels hollow: a huge house with a
handful of verbs and rooms that are empty of things to do. The player can
cook, shower, swim, study, and talk, and not much else, and most objects
(`coffee_maker`, `toilet`, `bathroom_mirror`, `sink_bathroom`,
`trash_kitchen`, `lockers`, `changing_bench`, `pool_loungers`, `yoga_mat`,
`coat_rack`, `shoe_rack`, `doormat`, `front_door`, `balcony_table`,
`plant_balcony`) exist as scenery with no verb at all. The East Wing — pool,
gym, game room, balcony, changing room — is the building's intended social
heart and currently its emptiest region.

The fix is not "more verbs" as a tally. It is: **make every room a place
something happens**, and make the things that happen between people flow
through one spine. Almost everything the user picked is either (a) a verb on
an object that exists but is dead, (b) a chore/need loop the house has no
model for yet (cleaning, temperature, laundry states, mail), or (c) a social
act between player and NPC — and that whole family should run through the
invitation/ask system, which already has the determinism, the decision
machinery, the ladder, and the scheduling. This plan is deliberately
architecture-first: the invitation spine and the flags engine land before
the surface verbs, so the surface is cheap to add afterwards.

### What this plan is *not*
- **Not a new-rooms plan.** The East Wing work upgrades what exists — the
  sauna is a *subroom* inside `pool_room` (its own door, its own privacy
  level, no new floor-plan node), not a new wing. It's a deliberate one-off:
  no second subroom is planned or foreseen (see D22). The floor plan graph
  is otherwise untouched.
- **Not a dialogue-system rewrite.** Every social act phrases through the
  existing scene/ask prompt machinery. No new LLM pipeline; decisions stay
  deterministic (decide-before-LLM is an invariant, not a suggestion).
- **Not an economy re-tune.** Rent, bills, taxes, and the tuned rent curve
  are untouched. New money verbs (gifts, loans, cook-off stakes) move
  existing money through existing ledgers.
- **Not a rendering/graphics overhaul.** The cutout, sprite, and
  movement-presentation plans are separate tracks; this plan only *uses*
  their outputs (avatars on social profiles, walk layers for Follow).
- **Not "every object gets ten verbs."** A verb earns its place by making a
  decision or relieving a need. Scenery verbs land where the user picked
  them, and no further.
- **Not a sound-engine rewrite.** The audio phase hooks the existing
  music-device/headphones substrate and acquires assets; it does not replace
  how sound is produced or blocked.

## Scope — the user's selection (verbatim)

### Kitchen & Food
> 1, 6 (Kitchen + Dining Room), 7 (half exists right?)

- **1 — coffee_maker.** Brew coffee: a real drink item (caffeine/energy
  effect), one action, the object is currently verb-less (`coffee_maker`,
  defs.world.js:353).
- **6 — Kitchen + Dining Room as a place.** The kitchen is dense already
  (cook/eat/reheat/microwave/freezer/dishes/dishwasher); the dining room is
  the thin one. Complete it as a venue: shared meals, dinner as an event,
  and the dining room's own verbs beyond `set_meal`/`sit`.
- **7 — (half exists).** The `sit`/`set_meal` dinner flow (action-outcome
  window plan, D10/D12/D13) already covers "start the meal with whoever
  joins." The half that exists gets completed by making the *dinner party*
  an invitation-system event (Phase 17) rather than new stand-alone code.

### Bathroom & Grooming
> 1, 2, 3, 4

All four bathroom/grooming items — the bathroom is currently one verb
(`self.shower`). New: **toilet** (private, hygiene-adjacent beat),
**bathroom_mirror** (groom: brush teeth / fix hair — appearance/confidence
hook), **sink_bathroom** (wash hands — hygiene), and a **grooming/self-care
family** that connects to appearance and the wardrobe/sprites systems.
`long_shower` already exists as the relaxation variant; it is not
duplicated.

### Living Room & Common
> 1, 2, 3 (…technical implications like getting characters to dress
> differently based on temperature, but too drastically hot or cold and they
> may get annoyed and/or try to change it themselves), 4 (Cleaning in
> general. I haven't really figured out how to clean much of anything.)

- **1, 2 — Living-room verbs** (sofa/TV/coffee-table surfaces that are
  currently thin: watch-together, lounge variants).
- **3 — Temperature.** The player gets a thermostat verb; the house gets a
  temperature model; **NPCs dress by temperature and get annoyed outside
  their comfort band, and may try to change it themselves** — the whole
  annoyance/self-adjust loop is the fun, and it rides the flags system (D16).
- **4 — Cleaning in general.** A real cleaning system — per-room dirt,
  cleaning verbs and supplies, mess as a by-product of activities, NPC
  cleaning chores — where today there is essentially none (D17).

### Study / Computer / Phone
> 2 (I LOVE the idea of creating an actual crossword/puzzle minigame that
> players can play), 3 (Building Chatter into a multilayer full social media
> layer sounds very fun), 4 (a lot of potential to be great or awful),
> 5 (was originally designed to be something you could do to develop a range
> of skills over time), 6 (is already a thing — the Brine Bank app has a
> bills section)

- **2 — Crossword / puzzle minigame.** A real playable minigame, new BrineOS
  app, seeded daily puzzle (D23).
- **3 — Chatter → full social media layer.** `social_feed`
  (`chatter.example`, defs.computer.js:540) is a static parody site today;
  become a multi-layer social network (D24).
- **4 — (content to be defined with the user — Q1).** Flagged "a lot of
  potential to be great or awful"; its original pitch was lost, parked in
  Open questions.
- **5 — Skill research / progression.** Skills become a player-developable
  track beyond EduStream courses: self-directed research, practice, and
  skill-gated verbs (D25). (EduStream courses exist; this extends them.)
- **6 — Brine Bank bills: already a thing.** Confirmed exists; no work.

### East Wing
> EVERYTHING. East wing is BORING at present. It is meant to be a HOTSPOT
> for activities. Swimming, games, socialization, upgrades like the sauna.
> There is so much potential in the east wing that we aren't doing.

The full East Wing treatment (D22): pool activities beyond `self.swim`
(pool games, loungers/sunbathe, locker + changing-bench verbs), game-room
social surfaces (tournaments, billiards/darts), gym and yoga verbs on
`yoga_mat`/`weight_set`, the **sauna upgrade**, balcony sit/eat/plants verbs,
and East-Wing **events** (pool party) through the invitation system.

### Entry / Hallways / Laundry
> Get Mail/Deliveries is a must, Actually Answer the door (…we are going to
> need to get our hands on a lot of original music and sound effects, because
> we are going to be adding a LOT of sounds), Clean Hallway action, Wash,
> Dry, Fold, Put Away, Snoop through, laundry, lots of laundry actions.

- **Get Mail / Deliveries** (D21) — the entry becomes a real surface.
- **Answer the door** (D21) — doorbell/knock → who's there → admit/refuse.
- **Clean Hallway** (D17 — cleaning system covers hallways).
- **Laundry chain** (D20): Wash → Dry → Fold → Put Away → **Snoop** — a full
  state machine where today `self.laundry` is one verb.
- The **sound/music requirement** is a cross-cutting track (D29), noted here
  because the user raised it in this section.

### NPC & Social
> I want to move "Make a move" inside of the chat modal as an "Ask" tree, and
> add a lot of physical actions like hugging, kissing, and more. More item
> controls in general. Gifting, borrowing, lending, stealing, asking for
> money (loan or gift), GIVING money (loan or gift). More Reverse Overtures.
> Asking NPC's to 'follow' so that they will naturally travel from place to
> place in the house with you, good to transition between spaces or between
> 'public' and 'private'. Formal apology system could be useful. Ask for
> Space/Boundaries is good. Cook-off is fun social/interactive activity!
> Flags/Conditions (deeper system. Flags can dictate 'Rules' that NPC's abide
> by, see the NPC flags system I built in perchance.org/freeuseofficeclicker
> for reference).

- **Make a Move → Ask tree** (D5–D6) + **physical actions** (hug/kiss/cuddle
  and more; D7).
- **Item controls** — gift (exists), borrow, lend, steal (D8).
- **Money controls** — ask for money loan or gift (ask_loan/ask_repay exist;
  extend), **give** money loan or gift (new), bidirectional ledger (D9).
- **More Reverse Overtures** — NPC-initiated invitations and requests
  through the overture channels (D10).
- **Follow** — NPCs travel with the player between rooms and between
  public/private spaces (D11).
- **Formal apology** — a real social act with belief-gated weight (D12).
- **Ask for Space / Boundaries** — a social companion to the existing
  boundary acts, expressed as flags (D13).
- **Cook-off** — a competitive cooking event riding the cooking engine and
  `taste.js` (D14).
- **Flags / Conditions system** — the freeuseofficeclicker-style engine that
  dictates rules NPCs abide by (D15).

### Deeper
> House Parties, Touring, Pets.

- **House Parties** — the flagship invitation-system event (D26).
- **Touring** — show a guest/roommate around the apartment (D27).
- ~~**Pets**~~ — **cut 2026-08-31**, see D28 (retired) and Q3. A pet system
  needs its own dedicated design track, not a phase inside this plan.

---

## Locked decisions

### The central invitation & event system (the spine)
- **D1 — The Asks system IS the invitation system.** There is one social
  surface: `asks.js`'s `ASK_CATEGORIES`/`ASK_TYPES` tree. New
  people-involving activities are ask leaves (player→NPC) or overture defs
  (NPC→player); there is no parallel "event planner." `parseAskInput`,
  `resolveAsk`, the repeat-ask ladder, and the calendar-slot machinery are
  reused whole.
- **D2 — An event is a commitment with a roster.** A planned gathering is a
  `commitments.js` record of the existing `hangout` kind, extended with
  `roster` (npc ids + the player), `eventType`, `location`, and `duration`.
  Booking goes through the existing calendar-slot flow (`ASK_HANGOUT` proves
  it). One scheduler; an event is not a special clock.
- **D3 — Invitations are symmetric.** Player→NPC (ask leaf) and NPC→player
  (overture) both *write the same event shape*. The acceptance surface is
  shared: a planned event shows up in Tracker/Agenda and the commitment
  machinery, whichever side authored it.
- **D4 — Determinism holds for event leaves exactly as for asks.**
  `decide()` stays pure over state+seed; flavor never decides; the writer's
  effects are stripped at `doConvSend`, never inside `callLLM`. (Existing
  invariant, restated because every future event leaf inherits it.)

### Stealth, detection & covert acts (the second spine)
- **D32 — The real gap is XP, not architecture.** Room-entry stealth
  (`resolveRoomEntryStealth`, stealth.js), peeping (`resolvePeep`,
  stealth.js), and phone-snooping (`doSearchPhone`/`resolveSnoopPhone`,
  ui.js:3465 / drives.js:1355) are NOT new — all three already ship, each
  with its own tuning table (`STEALTH_TUNING`, `PEEP_TUNING`,
  `PHONE_SNOOP_TUNING`), a seeded roll, a `skillMod(player, 'stealth',
  'stealthSuccess')`-gated success chance, and a witnessed/unwitnessed or
  clean/suspected/caught branch with real evidence and suspicion
  consequences. `skills.js`'s `SKILL_CURVES.stealthSuccess` (11 steps,
  25%→94%) was deliberately reserved for exactly this — its own comment
  says "P6 (stealth)" by name. What's missing: **nothing ever calls
  `awardSkillXp(player, 'stealth', ...)`** — every player is stuck at level
  0 forever, no matter how many clean sneaks they pull off. This phase is
  NOT a unification refactor of three working systems into one resolver
  (that was the first instinct and it was wrong once the actual code got
  read); it follows their proven, independently-shipped pattern for the
  genuinely new verbs below, and wires real XP into the existing three.
- **D33 — Pickpocketing is new.** A covert item-take directly off an NPC's
  person — not their room, not a phone left lying around — needs an
  aware-target detection roll none of the existing three mechanics have
  (they only fire when a room's owner is absent, or an object/phone is
  unattended). New resolver in `stealth.js`, same shape as the other three:
  seeded roll, `skillMod`-gated chance, its own tuning table, clean/
  suspected/caught branches.
- **D34 — Sneaking is new.** A Start/End Sneaking toggle (the "More" chip
  row) suppresses the player's own `footsteps` signal (signals.js's
  `PLAUSIBLE_TUNING.bySignal.footsteps`) during movement — today's
  mechanics gate specific interactions (entering a bedroom, searching a
  phone), never the general act of moving past or near someone. Sneaking is
  the connective tissue that makes pickpocketing and hallway-level risk
  possible at all.
- **D35 — Explicit phone-snoop photos.** `generatePhoneSnoopPhotoImage` /
  `buildPhoneSnoopPhotoPrompt` (image.js:1668) are deliberately SFW/candid
  today (a 2026-08-24 Discord-feedback feature, "F6"), by explicit design
  ("not automatically an explicit find on its own"). This phase adds an
  explicit branch using the SAME three-condition gate the intimacy system
  already applies elsewhere in image.js (explicit request + mature flag +
  naked state) — no new gate invented, and the SFW find stays the default;
  explicit is the sometimes-branch, matching the "physical, like private
  nudes of themself or their sexual partner" ask.
- **D36 — Cover-your-tracks, granular.** Contextual actions (Redress, Clean
  Evidence, Remake Sheets, and siblings) appear during a "suspected" /
  noticed-but-unconfirmed window on any stealth-gated act — D30's sleeping-
  NPC branch, D33's pickpocketing, or an existing search — and can shrink or
  clear the suspicion before it hardens into a certain belief or gossip
  fuel. Reuses the `ADJUST_SUSPICION` effect DSL already threaded through
  every mechanic above; the "window" is the one genuinely new piece of
  state (a per-incident countdown/flag the cover-tracks actions read and
  clear).

### Make a Move → Ask tree, and physical actions
- **D5 — `make_a_move` is removed from the social chip row.** Initiation
  moves into the chat modal's existing Request/Ask menu. The chip row gains
  nothing back; the chat "Ask" surface is the only player→NPC initiation
  door, preserving intimacy-plan **D3 symmetric initiation** (the NPC side
  still has its overtures).
- **D6 — Quick-entry, not a second door.** The chat modal's Ask button
  pre-expands the new "Affection" category when the conversation is with
  someone present. This is a UX shortcut to the same tree, never a separate
  flow.
- **D7 — Affection is a ladder, and the willingness gate stays the only door
  into sex.** New casual-physical acts — Hug, Kiss (cheek), Kiss (lips),
  Cuddle — are ask leaves (and, where fitting, proximity chips) gated by a
  light receptivity check (relationship standing + mood + recent history),
  NOT the willingness gate. The existing `RequestIntimacy` leaf keeps the
  willingness gate as its whole decision (asks.js's `ASK_INTIMACY` — never a
  second gate). The two never blur: affection can be refused for free;
  intimacy refusal is the willingness verdict.
- **D30 — A sleeping/unaware target routes through the existing boundary-act
  gate, never through a relaxed willingness floor.** `willingnessFloorReasons`
  (`willingness.js`)'s hard 'asleep' floor stays exactly as hardened today —
  Phase 17 of the intimacy plan already carved sleeping targets out into
  `boundary.js`'s separate gate (`resolveBoundaryGate`/
  `applyBoundarySleepRoom`) precisely so nothing else has to touch that
  floor. Every Affection/Physical leaf (D7) aimed at a sleeping/unaware NPC
  branches there instead of the normal receptivity check, extending the
  existing sleep-room-attempt pattern into a real three-way outcome:
  **wake hostile** (a boundary violation, same consequence shape as today's
  attempt), **wake receptive** ("into it"/compliant — gated by
  relationship, personality, and existing desire state, not a new gate), or
  **undisturbed** (the act lands unnoticed — the free-use-kink case). Flavor
  and severity scale with how intimate the act is; the branch point is the
  same for all of them. Opening the conversation panel never touches this —
  `openConversationOverlay` is confirmed pure UI today (avatar/log/focus
  only, no NPC-state reads or writes), and that stays true: only
  *submitting* a leaf's `decide()` ever consults sleep state, same as every
  other leaf. **No relationship-stage gate** on the receptive branch — any
  NPC can theoretically wake receptive. The weight instead reuses two
  existing real fields rather than inventing new ones: `willingnessAttraction()`
  (willingness.js) for how drawn to the player they are, and `npcDeviancy()`
  (npc.js:2406 — openness × assertiveness, already driving the pool's
  nude-swim gate) for how much their own construct is willing to go along
  with being caught up in something. Low on both → overwhelmingly
  wake-hostile; high on both → receptive is genuinely on the table; nothing
  about relationship tier enters the formula.
- **D31 — The reverse case: NPCs can initiate on a sleeping/unaware player,
  and it's an intended, welcome outcome, not an edge case to suppress.**
  Mirroring D30, an NPC can attempt an advance on a sleeping player through
  the reverse-overture channel (D10). The one asymmetry with D30: an NPC's
  reaction to the player's advance is decided deterministically (there is no
  real mind on that side of the screen to consult), but here the target IS
  the player, who has a real answer nothing should compute for them.
  Whether the player wakes at all still resolves through the same
  three-branch shape (stays asleep is a legitimate outcome, mirroring D30's
  undisturbed branch) — but once/if the player wakes, they get an actual
  choice (into it / decline / get angry), delivered through the same
  accept/decline chip surface D10 already reuses for reverse asks, just
  extended with a third rung. No roll ever decides how the player feels
  about it. Implemented alongside Phase 5 (reverse overtures), since it
  rides the same NPC-initiated-advance channel; Phase 5's scope note is
  updated to include it.

### Money & items between characters
- **D8 — Item possession gets an owner and a borrower.** `ITEM_DEFS` gain an
  optional `owner` (`npcId` | `'player'`) and items in play can carry a
  `borrowed: {from, until, due}` record. **Gift** = permanent transfer
  (existing `ASK_GIFT`). **Borrow** = temporary transfer with a return
  expectation (new `$BorrowItem` ask + an NPC side). **Steal** = covert
  transfer that routes through the existing stealth/evidence/suspicion
  pipeline (P6) and the belief/gossip system — a theft that is witnessed or
  suspected becomes knowledge.
- **D9 — Money is one bidirectional ledger.** Replace the one-way
  `_loanOwed` player flag with `player.moneyLedger`: per-NPC `{playerOwes,
  npcOwes}`. `ask_loan`/`ask_repay` (player borrows/repays) map onto it; new
  `$GiveMoney <amount> [gift|loan]` ask leaf (player gives) and an
  NPC-initiated money request (D10) close the loop. A loan is a loan
  whichever side owes it; repayment clears both directions.

### Reverse overtures & NPC-initiated asks
- **D10 — NPCs initiate too.** Beyond the four overture channels
  (`OVERTURE_DEFS`: text/propose/knock), NPCs gain *reverse asks*: an
  invitation (party, cook-off, dinner, outing) or a request (money, a
  borrowed item, help). Each is an overture row whose proposal payload is an
  event/request; the player's accept/decline resolves through the same
  deterministic machinery mirrored with the player as target (reads NPC
  intent + the player's standing/mood to flavor and weight the ask — never
  to filter it out). **There is no "can the player actually grant this"
  gate**: an NPC can and will ask for money the player doesn't have or a
  thing the player won't give. That's a tension point, not a design flaw —
  the player's own limits live entirely in the player's head. Delivered on
  the existing channels so the response surface (`overture.accept`/
  `overture.decline` chips) is reused whole.
- **New D41 — D10's real shape, Phase 5.** The "invitation" half of D10 was
  already built before this phase touched anything: `propose_player`/
  `collab_ask` (both pre-existing, npc-initiative-plan) already let an NPC
  book a commitment through the exact same overture machinery. The real gap
  was the "request" half — nothing let an NPC ask the player for money or an
  item. Two new `OVERTURE_DEFS` rows close it: `request_money_player` /
  `request_borrow_player` (config.js), riding the `propose` channel exactly
  as `collab_ask` does (D18's own precedent) but carrying a NEW field,
  `requests: { kind }` — `proposal`'s sibling, never a second copy of it.
  `overture.js`'s new `requestTerms(npc, def, gameState)` is `proposeTerms`'s
  sibling too: money is unconditional (D10's "no gate on what the player can
  grant" — the amount is `ASK_TUNING.loan.defaultAmount`, never scaled to
  what's on hand); the borrow ask is the one request with a real candidacy
  gate (`borrowableStacks(gs, gs.player)` — duck-typed reuse of the existing
  helper against the PLAYER's own bag, returning null, hence no candidacy at
  all, when there's nothing to ask for). `scoreOvertures`/`openOverture` both
  carry `request` alongside `proposal` as an optional sibling field. Accepting
  does NOT call `createCommitment` — `ui.js`'s `doOvertureRespond` gained a
  `def.requests` branch that transacts directly: money.js's
  `adjustMoneyLedger(gs, npcId, 'npcOwes', amount)` (the player becomes the
  lender, capped at `player.money` on hand, same floor-at-0 clamp
  `giveMoneyAmountFor` already uses) or an item move (`removeStack`/
  `addStack`, `ownerId` stays `'player'` — the lender — mirroring
  `ASK_BORROW`'s own contract, deliberately with NO `meta.borrowed` stamp
  since nothing reads a due day off an NPC-held stack this phase — no reverse
  "give it back" flow exists yet, and stamping one would be invariant 6's
  field-with-no-reader). Decline needed zero new code: `doOvertureRespond`'s
  existing decline branch (`applyOvertureRefusal`) is already fully generic
  over any `def.respond`, and both new rows just supply their own
  `refusalFacts` table for a decline that reads like a decline of THIS ask
  rather than the generic "walked away" fallback.
- **New D42 — D31's real shape, Phase 5.** D31's own text ("mirroring D30...
  through boundary.js") pointed at the right file. What it did NOT point at:
  a pre-existing mechanism (Intimacy & Voyeurism Phase 17, D13) already
  modeled "an NPC sneaks into the sleeping player's bed" — the `sneak_into_bed`
  drive, `boundarySneakCandidacy`/`trySneakIntoBed` (boundary.js). Building a
  second, parallel NEW overture-channel mechanism for the same premise would
  have been exactly the "fourth shape" this codebase's own file-header
  comments keep warning against (see P1B's identical finding about stealth).
  So D31 extends the existing one instead: the stealth/perception roll is
  UNCHANGED (it still decides only whether the player wakes — undisturbed
  stays undisturbed, unchanged); what changed is the "caught" branch, which
  used to resolve `caughtRelDeltas`/`caughtSuspicion` unconditionally the
  instant it fired, with no player input at all — exactly the
  roll-decides-feelings shape D31 forbids. `trySneakIntoBed`'s caught branch
  now stamps `npc.flags._sleepAdvance = { status: 'pending', openedDay,
  openedTick }` (mirrors D36's `_suspicionWindow` shape) and returns
  `activityOverride: 'waking you'` with NO event — nothing resolves until the
  player actually answers. New pure predicate `hasPendingSleepAdvance(npc)`
  and new MUTATING resolver `resolveSleepAdvanceChoice(gameState, npcId,
  choice)` (both boundary.js) apply exactly one of three outcomes the player
  picked, never a second roll: `'into_it'` — a real completed act, costed
  identically to any other (reuses `BOUNDARY.throuple.npcEffects`/
  `playerEffects` + `INTIMACY.relDeltas.sex`, the same figure
  `applyReciprocatedAct`'s own reciprocate branch reads for the
  player-initiated mirror of this act); `'decline'` — the one genuinely NEW
  outcome, a real no gently taken (new `BOUNDARY.npcSneak.declineRelDeltas =
  { tension: 0.05, comfort: -0.03 }`, far short of being caught out);
  `'angry'` — exactly what `'caught'` used to fire unconditionally
  (`caughtRelDeltas`/`caughtSuspicion`), now gated behind the player's own
  real choice rather than a die roll. Presentation lives in `ui.js`: a THIRD
  one-at-a-time gate (`flushPendingSleepAdvanceGate`/
  `presentSleepAdvanceGate`, alongside the existing overture-gate and
  peep-bubble queues — the same D7 "screen is free" problem, not a fourth
  shape) — but unlike the other two queues, this one is a LIVE SCAN over
  `gameState.npcs` for `hasPendingSleepAdvance` rather than a remembered
  npcId, deliberately more robust against two simultaneous pending records
  than the "queue one, drop the rest" precedent the overture gate and peep
  bubble both use (a dropped SECOND overture/peep bubble is silence, since
  nothing was written to state for it; a dropped sleep-advance would leave a
  written pending flag stuck forever, so this queue self-heals by scanning
  instead). `presentWorldGate`'s `choices` array needed no changes to carry a
  third rung — it was already generic over N entries. Hooked into the same
  three flush call sites `flushPendingOvertureGate` uses
  (`advanceAndResolve`'s tail, `hideLoading`, NOT `closeConversationOverlay`
  since a sleeping player cannot be mid-conversation); the real one in
  practice is `hideLoading()`, since `doSleep`'s own loading overlay is still
  up when `advanceAndResolve` returns to its caller mid-batch (confirmed live:
  the gate queues silently during the night and surfaces the instant
  `doSleep`'s overlay comes down).

### Follow, apology, boundaries, cook-off
- **D11 — Follow is a lightweight commitment.** A `$FollowMe` ask leaf sets
  `npc.follow` (the NPC follows the player); the reverse (player follows an
  NPC) rides the reverse-overture travel from the liveliness plan. A follower
  paths with the player room-to-room through the movement-presentation layer.
  Follow ends on: arrival at the destination, the player entering a private
  space the NPC wouldn't enter, conversation, or an explicit release.
  `npc.follow` is sim state; the walk presentation never writes it.
- **D12 — Apology is a belief-gated social act.** A `$Apologize <for X>` ask
  leaf (or chip) is gated by what the wronged NPC *believes* happened (the
  belief/gossip record — an NPC only accepts an apology for something they
  know about). Sincere + timely apologies repair part of the transgression's
  REL_DELTA; insincere or repeated ones deepen the wound (reusing the ladder
  mechanics). The apology is recorded in the NPC's beliefs (`forgiven`), so
  gossip carries it and a later re-litigation is possible.
- **New D44 — D12's "beliefs"/"forgiven" language is the EXISTING
  `npc.relPlayer.grievances[]`, not a new record (Phase 7, 2026-09-01).**
  `npc.js` already had `addGrievance`/`resolveGrievance`/
  `getUnresolvedGrievances` (`{text, severity, day, resolved}`), with exactly
  one producer before this phase (`relationships.js`'s infidelity path) —
  confirming the plan's own "no `beliefs.js` exists" TBD note. The real gap
  was producers, not architecture (the same shape D32 found for stealth XP):
  `stealth.js`'s three "caught" branches never wrote one. This phase added
  `addGrievance` calls to exactly the CERTAIN branches — `resolveRoomEntryStealth`'s
  direct-witness case, `resolvePeep`'s `detected` case, `resolvePickpocket`'s
  `caught` case — deliberately excluding every "suspected"/evidence-only
  branch (D36's unconfirmed window; a belief-gated apology must gate on
  something the NPC actually, certainly knows). A new `noteGrievanceApologyAttempt`
  (npc.js) stamps a failed/late/repeat try so a second attempt on the same
  still-unresolved grievance reads as insincere regardless of timing — this
  is "reusing the ladder mechanics" applied to a SPECIFIC grievance; the
  EXISTING generic per-category ask-repeat ladder (`askLadderPenalty`)
  independently still covers same-day apology spam. **Deliberately left
  disconnected from the pre-existing `doApologizeNpc`/`noteColdShoulderRepair`
  button** (`ui.js`/`npc.js`, cold-shoulder-severity repair only) — the two
  apology surfaces coexist but don't talk to each other; a sincere
  `$Apologize` does not also step down an active cold shoulder. Flagged for
  a future session that may want to bridge them.
- **D13 — Boundaries become flags.** "Ask for Space" / boundary asks
  (respect privacy, stop an unwanted behavior, don't enter my room) write a
  per-NPC flag that NPCs actually respect through the D15 flags engine. The
  existing `boundary.js` acts (sleeping-room, throuple, bull/cuck) stay; this
  is their everyday social companion.
- **New D43 — D13's detection hook is real but deliberately narrow: ONE
  funnel of several possible ones (Phase 7, 2026-09-01).** Unlike eating
  (Phase 3's one funnel, `applyEatItem`), an NPC's `location` field is
  written from at least 8 independent call sites across `sim.js`/
  `movement.js`/`cognition.js`/`effects.js` — no shared mover function exists
  anywhere in this codebase (checked before writing anything down, same
  discipline as D37/D38). Hooking all 8 would mean touching the same core
  tick/drive machinery Phase 3 explicitly declined to touch for NPC
  self-compliance — too large and risky a lift for what this phase actually
  needs. Instead: `sim.js`'s `resolveBatch` (the ONE point that merges a
  resolved tick's `npcUpdates` into `state.npcs`) gained a small diff pass —
  for every npc whose `location` in this tick's `npcUpdates` differs from
  its pre-merge value AND who has a non-empty `npc.flags._boundaryRules`,
  fire `flags.js`'s `checkBoundaryRules`. This covers every DISCRETE-tick
  location write `resolveTick` produces (Pass 1 schedule/wander, Pass 3
  drive-driven `locationOverride`, visitor/overture/commitment-cancel
  carry-through) but deliberately does NOT cover `movement.js`'s continuous
  live-walk landings, `advanceFollowers` (Phase 6), or `cognition.js`'s
  work-commitment open/`returnHome` writes — none of those route through
  `resolveBatch`'s `npcUpdates`. A future session wanting full coverage (an
  NPC dragged in by Follow, or arriving via a live walk) adds hooks at those
  sites too; this is a real, permanent scope boundary, not an oversight.
- **D14 — Cook-off is a competitive event, not a new engine.** Two (or more)
  parties cook a dish through the existing cooking engine (`self.cook`,
  cooking.js, equipment grading); `taste.js` scores each result
  deterministically; a winner takes stakes (bragging rights, small money,
  chores-for-a-day). Booked through the invitation system as an
  `eventType: 'cookoff'`, played through the shared-activity machinery
  (`resolvePairedAct` / `source: { kind: 'paired' }`).

### Flags, temperature, cleaning, rooms
- **D15 — NPC flags / conditions engine (the freeuseofficeclicker pattern).**
  A flag is a named rule an NPC checks at decision time:
  `{ id, subject, condition, behavior, weight, source }`. Three sources:
  (a) player-set *house rules* ("no eating in the living room", "knock
  before entering bedrooms", "no guests after midnight"), (b) *boundary
  flags* the player set against a specific NPC (D13), (c) *NPC-owned flags*
  (their own comfort/preference rules, e.g. a 22°C thermostat preference).
  Compliance is personality-driven (conscientiousness/agreeableness,
  disinhibition); *detection* happens through the perception/signal layer (a
  rule nobody can perceive is not enforced — an NPC never acts on a rule it
  cannot see); violation produces belief/gossip + relationship consequences.
  Flags live on `npc.flags` with a per-house `houseRules` list; modeled on
  the user's `freeuseofficeclicker` `src/js/17-flags-detection.js` (verify
  against the original when a live copy is at hand).
- **D16 — Temperature is a shared state with teeth.** A thermostat verb
  (object + adjust) sets a target; a daily ambient temperature is derived
  (season schedule + player setting + heat sources). HVAC billing scales with
  the player's chosen delta instead of the flat `UTILITY_THERMOSTAT`
  multiplier. NPCs derive clothing from temperature through the wardrobe
  system (cold → warm layers, hot → minimal) and get annoyed (mood/desire
  deltas) outside their comfort band — then they *try to change it
  themselves*: use the thermostat, change clothes, complain (a D15
  comfort-flag behavior). The player setting the thermostat to extremes is
  exactly the drama the user wants, so the annoyance/self-adjust loop is the
  feature, not a bug to smooth away.
- **D17 — A real cleaning system.** Each room gets `dirt` (0..1) with
  sources (cooking, eating, parties, foot traffic, dust over time) and a
  decay (cleaning). New cleaning verbs (`self.clean`, per-object: sweep,
  vacuum, mop, wipe) plus supplies (broom/mop/vacuum/cleaner as purchasable
  items or room equipment). NPCs do cleaning chores through the existing
  chore system. Dirt feeds the smell/signal layer (a musty room smells) and
  can build into a visible/annoying state. Hallway cleaning (the user's
  "Clean Hallway action") is just this system pointed at
  `hallway_a`/`hallway_b`.
- **New D49 — `dirt` is a genuinely new, stored field, deliberately NOT a
  reuse of the existing `dirtyWhen`/`cleanlinessWeight`/`emits` system
  (config.js/world.js, real and mature before this phase — every OBJECT_DEFS
  entry already declares `dirtyWhen`, `world.js`'s `refreshRoomCleanliness`
  already derives a 0-100 `world.rooms[roomId].cleanliness` from it, and
  `computer.js`'s `cleanRoomObjects` already resets it for the paid cleaning
  service and the NPC `cleansRoom` drive — all pre-existing, checked before
  writing anything down, same discipline as D32/D43).** That system is
  entirely OBJECT-INSTANCE-driven: a room's cleanliness only moves when some
  object in it has a dirty STATE. It cannot express "foot traffic and dust in
  a room with no dirtyable furniture," and that is not a hypothetical gap —
  `hallway_a`/`hallway_b` (the user's own "Clean Hallway" example) contain
  only `coat_rack`, `thermostat` and the inert `floor` object, and all three
  are `cleanlinessWeight: 0`. `recomputeRoomCleanliness` returns a flat
  `CLEANLINESS.baseline` (50) for both hallways forever, regardless of
  anything that happens in them — confirmed by reading every object those
  rooms spawn, not assumed. `world.rooms[roomId].dirt` (new, `dirt.js`,
  0..1, real stored state because unlike the object system there is nothing
  to re-derive it FROM) is the room-level ambient layer D17 actually asks
  for; `world.js`'s `refreshRoomCleanliness` blends it in as an additional
  penalty on top of the unchanged object-derived score, so the two systems
  compose rather than compete. Sources wired for real: cooking
  (`defs.actions.js`'s `buildCookEffects`, on top of — not instead of — the
  stove/sink object mess it already leaves), eating (`effects.js`'s
  `applyEatItem`, wherever the eater actually is), and foot traffic + dust
  (folded into ONE small per-resident-per-tick bump in `sim.js`'s existing
  `resolveTick` Pass 2 loop — the same D43 hook-narrowing precedent: the
  narrowest real hook, not a second whole-room-every-tick pass, for two
  sources this small). Parties (D26, Phase 17, not yet built) are left for
  that phase to wire when it exists. The decay side (`self.clean`,
  `cleanRoomObjects`) is Locked below under D50.
- **New D50 — `self.clean` drains the ambient layer only; the pre-existing
  `clean.object` affordance (declared on 13 OBJECT_DEFS entries — stove,
  fridge, freezer, sink_kitchen, shower, two dressers, hamper, bookshelf,
  nightstand, coffee table, pool — but never wired to any ACTION_DEFS entry
  or effect before this phase) is a real, deliberately deferred gap, not an
  oversight.** `self.clean` is room-sourced across `ALL_ROOMS` (D49's `dirt`
  field, `ADD_ROOM_DIRT` effect — `llm:false`, same trust tier as
  `ADJUST_THERMOSTAT`), gated by a new `roomHasDirt` requirement checker;
  this alone satisfies every verification bullet Phase 9 actually needs
  (cooking/eating accumulate it, cleaning decays it, the smell layer reads
  it, `cleanRoomObjects` resets it for the NPC chore/paid service, and it is
  the literal, only possible answer for "Clean Hallway" since a hallway has
  no dirty OBJECT for a per-object verb to target). Wiring `clean.object`
  for real needs its own design pass first — the existing action-source
  convention (`source.objDefs`, `findObjectInRoom`'s `.some()`) lights up
  ONE chip whenever ANY listed def is present, with no built-in way to pick
  which of several simultaneously-dirty object types in the same room the
  chip should actually target — and was judged out of scope for one phase.
  Left for a future session; `prepareClean`/`buildCleanEffects` (the two
  functions self.clean's `prepare`/`buildEffects` point to,
  `defs.actions.js`) are the pattern to extend or the precedent to follow.
  Supplies: rather than inventing a new item, `self.clean` was wired against
  `all_purpose_cleaner` — a pre-existing, purchasable `ITEM_DEFS` entry
  (`defs.world.js`'s "Cleaning supplies" section, alongside `dish_soap` and
  `sponge`, also still unwired) that had ZERO readers anywhere in the
  codebase before this phase. Owning one gives `cleanStepVacuum` (a bigger
  single-pass drain) instead of `cleanStepBase`, consumed for real via a
  `DESTROY_ITEM` line — closing a genuine pre-existing invariant-6 gap
  instead of creating a new one. `dish_soap`/`sponge` (and the plan's
  originally-named broom/mop/vacuum) remain real, smaller follow-ups for a
  future session that wants finer-grained tool tiers.
- **D18 — Kitchen & dining completes the venue.** `coffee_maker` gets a brew
  verb (a caffeinated drink item — energy/mood effects); `trash_kitchen`
  gets take-out-the-trash (a chore that resets kitchen smell); the dining
  room's identity is *shared meals as events* (Phase 17), building on
  `set_meal`/`sit`/dishes which already exist.
- **D19 — Bathroom & grooming.** `toilet` (private hygiene beat),
  `bathroom_mirror` (groom — brush teeth, fix hair; appearance/confidence
  hook into the wardrobe/sprite systems), `sink_bathroom` (wash hands —
  hygiene). Grooming affects appearance-driven social reads; `long_shower`
  stays the relaxation variant.
- **New D51 — Grooming's "appearance/confidence hook" (D19) needed no new
  stat, field, or system, same resolution shape as D46 ("change clothes
  needed no new drive").** `player.mood` is ALREADY the real
  appearance-adjacent social read: `ADJUST_NEED player mood` (effects.js's
  `applyAdjustNeed`) has pushed a decaying impulse through `pushMoodImpulse`
  since the mood-impulse system landed, and `llm.js`'s per-scene prompt
  already surfaces `Current mood: ${moodLabel(player.mood)}` to every NPC in
  every conversation (line ~246) — so a mood bump from grooming is already
  visible to NPCs' reads of the player, already decays like a real
  "freshly put-together" feeling should, and needed zero new plumbing.
  `mirror.groom`'s effects are exactly `ADJUST_NEED player hygiene
  +${groomHygieneGain}` and `ADJUST_NEED player mood +${groomMoodGain}` —
  see config.js's `groomMoodGain` comment. No `player.appearance`-as-a-stat,
  no new MOOD_TARGET term, no new field: invariant 6 satisfied by reusing an
  existing, already-consumed pipeline rather than inventing a parallel one.
- **New D52 — Bug fix, discovered while building D19, unrelated to D18/D19
  themselves: `defs.world.js`'s curated-interaction-anchor table (committed
  2026-08-31, the "D17 npc-avatar-liveliness plan, Q4" block) was
  `Object.assign(OBJECT_DEFS, { bed: {anchorMode:'center'}, shower:
  {standInset:5}, toilet: {standInset:4}, ... })` — a SHALLOW top-level
  merge that REPLACES each named key's entire OBJECT_DEFS entry rather than
  adding to it.** This silently destroyed the full id/label/states/affords/
  dirtyWhen/emits/cleanlinessWeight of all 14 objects it named — `bed`,
  `sofa`, `armchair`, `swimming_pool`, `dining_table`, `kitchen_table`,
  `desk`, `study_desk`, `treadmill`, `shower`, `toilet`, `tv`, `stove`,
  `sink_kitchen` — down to just the one anchor field, confirmed directly
  (`OBJECT_DEFS.shower` was `{"standInset":5}`, nothing else). Discovered
  because `toilet.use`/`toilet.clean` (D19) need `toilet`'s real `states`/
  `dirtyWhen`/`affords` to exist. Root-caused and fixed rather than worked
  around (a silent `if (defId !== 'toilet')` dodge would have left `shower`/
  `stove`/`bed`/`sink_kitchen` — objects `self.shower`/`self.cook`/
  `self.dishes` all depend on — broken for every future phase too): the fix
  is a per-key `Object.assign(OBJECT_DEFS[defId], anchor)` loop, which
  `resolveObjectStandPoint` (defs.placement.js:200-203) already expected
  (`OBJECT_DEFS[obj.defId].anchorMode`/`.standInset`, read off the SAME def
  as every other reader). **Blast radius, measured with the fix reverted
  alone:** `run-all.js` unfiltered went from this phase's own 3637 passed/82
  failed/12 errored down to 795 passed/3 failed/**95 harness(es) errored**
  — i.e. before this fix, 95 of ~111 harnesses could not even run to
  completion (most on this exact defect: a house-gen'd `shower`/`stove`/
  `bed`/etc. missing the fields dozens of unrelated systems assume are
  there). With the fix, errored drops to 12 (all pre-existing `verify-voc-*`
  /`verify-present-*`/`verify-i4` failures — the vocation and presentation
  plans, confirmed by grep to share zero identifiers with this plan) and
  passed nearly quadruples. The 82 failed (up from the last-documented
  76, +6) were checked by name — `verify-w6/w9/w13/w15/w16/w17/w18` — all
  intimacy/pregnancy/liveliness-plan assertions with no reference anywhere
  to any Phase 10 identifier; they were previously invisible because their
  harnesses crashed before reaching them, not newly broken by this fix.
  Left for a future session; not this plan's job to fix (out of scope for
  D18/D19, and arguably out of scope for this whole plan).
- **D20 — Laundry is a state machine, not one verb.** `self.laundry` splits
  into **Wash** (washer load — closed-form cycle), **Dry** (dryer or line),
  **Fold** (a folded stack), **Put Away** (into the wardrobe — makes clothes
  available again), and **Snoop** (read an NPC's laundry — a small
  perception/suspicion moment with gossip potential, its own instance of the
  P1B stealth pattern — distinct from the already-shipped phone/room snoop,
  `doSearchPhone`/`doSearchRoom`). Clothes move
  `dirty → washed → dried → folded → stored`. `laundry_machines` facility
  gates the washer/dryer verbs.
- **New D53 — Laundry state lives on the physical garment stack
  (`stack.meta.laundryState`), not an abstract load counter, and the
  wardrobe is already the wearability gate for free.** `composeOutfit`/
  `npcWardrobeItems` (items.js/npc.js — untouched by Phase 11) only ever
  read candidate defIds from `wardrobe.contents`; a dirtied garment being
  physically REMOVED from the wardrobe (into the shared hamper) is what
  stops it being offered, with zero new filtering logic anywhere in outfit
  composition. Washer/dryer cycles are a lazy-resolved anchor
  (`obj.laundry.cycleActiveUntilAbs`), the exact same shape as the
  food-overhaul dishwasher's `cycleActiveUntilAbs` — the one real
  difference is the resolver bumps each contained garment's own
  `laundryState` forward IN PLACE rather than clearing an aggregate load,
  because individual garments keep their identity through the whole chain
  (dish units never needed to).
- **New D54 — The dirtying source is day-rollover wear, not a per-outfit-
  change hook, and it is a genuinely new mechanism (nothing raised
  `hamper.state.fill` before this phase — confirmed by grep, not assumed).**
  `sim.js`'s `processLaundryWearForDay`, called from `processDayRollover`
  immediately after `processSpoilageForDay` (the SAME hook the dishwasher's
  own lazy-resolve already sits at): once per day, for the player and
  every resident NPC, the garments occupying their CURRENT `outfit`'s slots
  move from their own wardrobe into the shared hamper, dirtied and
  owner-stamped. Deterministic — invariant 1, wearing clothes for a day is
  a certainty, not a roll. This is also what makes the pre-existing
  `'stale_laundry'` signal (config.js's `laundry_hamper.emits`, declared
  since before this plan but never fed anything real) actually fire for the
  first time.
- **New D55 — A real latent bug, found and fixed while making the hamper
  physical: two existing "do the laundry" call sites used to blindly reset
  `hamper.state.fill` to `'empty'`, which would have deleted real dirty
  garments the moment D54 made the hamper's contents real.** `drives.js`'s
  `do_laundry` NPC chore (`emptiesHamper`) and `computer.js`'s paid-maid
  laundry add-on (`performMaidVisit`) — harmless before this phase since
  nothing ever raised `fill` in the first place, but a live footgun against
  a real `hamper.contents`. Both now call a new shared `items.js` helper,
  `runHamperIntoWasher` — the same real move-and-start-cycle the player's
  own Wash action runs, a no-op (not a delete) when the washer is busy or
  nothing's dirty. Verified in `verify-aa-p11.js` with a garment seeded in
  the hamper while the washer is mid-cycle, confirming it survives.
- **New D56 — No new file this phase, on purpose, even though the
  mechanism itself is genuinely new (unlike D49/D51's precedent, where an
  existing mature system just needed a verb).** Laundry logic was
  distributed into each file's existing ownership boundary instead:
  `items.js` (data/cycle helpers — `laundryStateOf`, `hamperFillLevel`,
  `laundryCycleProgress`/`resolveLaundryCycle`, `wardrobeObjectForOwner`,
  `moveGarmentStacks`, `dirtyWornOutfitForResident`, `runHamperIntoWasher`),
  `effects.js` (four new trusted effects — `MOVE_GARMENTS`,
  `START_LAUNDRY_CYCLE`, `FOLD_GARMENTS`, `PUTAWAY_GARMENTS`),
  `defs.actions.js` (the four verbs + four requirement checkers), `stealth.js`
  (`resolveLaundrySnoop`). Each file already owned exactly this kind of
  logic; inventing a `laundry.js` would have split one cohesive mechanism
  across five files' worth of cross-references for no real gain.
- **D21 — The front door becomes real.** A `mailbox` state accumulates mail
  (bills, flyers, packages) that the player *gets* ("Get Mail/Deliveries is
  a must"); **Answer the Door** — a knock/doorbell presents "who's there"
  (delivery driver, friend, roommate, solicitor) and the player
  admits/refuses through a short deterministic beat. Locking (`door.*`)
  already exists; delivery ETAs already exist in external-world retiming —
  this is the physical door-side of them.
- **New D57 — D21 implemented as two mechanics sharing `mail.js`, with three
  deliberate scope cuts, none silent.** (1) The mailbox never generates a
  'package' kind, despite the Data model literally listing it as one of
  four — a real Nile/Home box doesn't fit a mail slot, and inventing a
  second, smaller "mail parcel" concept alongside the already-working
  `world.deliveries` system would have duplicated infrastructure for no
  mechanical gain. All *physical* packages, without exception, route through
  the retimed `world.deliveries` → door-event path instead (see below); the
  mailbox only ever produces `'bill'`/`'flyer'`/`'letter'`. (2) "Friend"/
  "roommate" as door-knock triggers were NOT built — the existing
  `processFriendVisitsForDay`/`processOutsidePartnerVisitsForDay`
  (external-world plan) already model resident-hosted arrivals, with their
  own soft-cap/cooldown machinery, by teleporting the visitor straight in;
  routing them through the new admit/refuse door event instead is a real,
  contained follow-up for a later session, not attempted here — retrofitting
  two already-shipped, tested visit systems in the same phase that builds
  the mechanism they'd route through was judged too much blast radius for
  one session's flavor payoff. (3) `front_door`'s own `lock`/inert state was
  left untouched — D21's own text treats locking as a pre-existing given,
  not a Phase 12 deliverable, and it stays exactly as inert as it was
  before this phase (no `self.lock_door`/`self.unlock_door` affordance
  added to it).
  **The mechanism itself, real identifiers:** new `mail.js` (no other file
  fit both halves — see its own header comment) owns `pushMailEntry`/
  `processMailForDay` (the mailbox's daily roll — flyers/letters seeded by
  day, bills pushed separately, see next) and the door event's lifecycle
  (`queueDeliveryDoorEvent`, `maybeScheduleSolicitor`,
  `resolveDoorEventDecision`, `sweepDoorEvent`, `fallbackDeliveryToDoormat`).
  Bills are never invented in `mail.js` — `ui.js`'s existing
  `processBillsForDayUi` gained one line, `pushMailEntry(currentGameState,
  'bill', r.label, day)`, inside its existing per-bill loop, firing only the
  moment a REAL bill actually posts (rent excluded on purpose — it already
  has its own extensive UI via `processRentForDay`, and a duplicate flavor
  line for it was judged low value for the complexity of special-casing it).
  `ui.js`'s `processDeliveriesForDay` (Nile/Home purchases, `world.deliveries`)
  was rewritten: instead of instantly, silently placing the item on the
  doormat at the ETA, it now calls `queueDeliveryDoorEvent`, which opens a
  `world.doorEvent` (single pending record — at most one caller at a time)
  that stays answerable for `MAIL_TUNING.deliveryKnockWindowMinutes` (240)
  before a new tick-driven sweep (`sweepDoorEventNow`, called once per
  `advanceAndResolve` — same "every path that moves the clock goes through
  here" reasoning as `processFoodOrdersNow`) resolves it to EXACTLY the old
  silent doormat placement as the fallback, so an AFK/inattentive player
  loses nothing. Three new `defs.actions.js` verbs — `self.get_mail`
  (object-sourced off the new `mailbox` OBJECT_DEFS entry, `defs.world.js`,
  placed in `entry`'s room bucket), `self.answer_door`/`self.refuse_door`
  (room-sourced off `entry`, since a door event is world-level state, not
  tied to one object instance) — and two new `ACTION_REQUIREMENT_CHECKERS`
  (`hasUnclaimedMail`, `doorEventPending`, the latter also gating on
  `world.doorEvent.createdAbs`/`expiresAbs` so a solicitor scheduled for
  11:00 isn't answerable at 08:00). Two new trusted `effects.js` entries,
  `CLAIM_MAIL`/`RESOLVE_DOOR_EVENT`, both thin wrappers over `mail.js`'s real
  functions (same shape as the laundry effects wrap `items.js`). The
  solicitor (flavor-only, no NPC record) rolls once per day at rollover
  (seeded by day) with a FIXED time-of-day ring window
  (`MAIL_TUNING.solicitorStartMinute` 11:00 for
  `solicitorWindowMinutes` 240) rather than a randomized one, specifically so
  a Node harness can assert the exact window without depending on when a
  tick-driven sweep happens to first run.
  **A real bug found and fixed, unrelated to this plan's own mechanism but
  discovered by it:** `state.js`'s `loadGameState` does NOT dynamically walk
  `SAVE_KEYS` the way the write paths (`writeGeneratedGameState`, the
  autosave/snapshot loop, and the save-record export/import loop) do — it
  hand-lists every world key as its own `const x = await getWorld('x') ||
  default` line, then hand-assembles the returned `world: {...}` literal.
  `mailbox`/`doorEvent` were correctly added to `SAVE_KEYS` and
  `WORLD_KEY_FALLBACKS` (governing the WRITE side) but silently vanished on
  every READ — confirmed live: a freshly-started Sandbox game's
  `currentGameState.world` was missing both keys entirely, even though
  calling `SIM_generateHouse` directly in the console produced them
  correctly. This is the EXACT "castWeb failure" `loadGameState`'s own
  neighboring comments already warn about by name (`gameplayOptions` and
  `dreams` each hit this once before); fixed by adding the two explicit
  `getWorld` reads and including them in the returned world literal. Node
  coverage never would have caught this — `verify-aa-p12.js` builds its test
  states via `SIM_generateHouse` directly (matching every other harness in
  this suite), which never touches `loadGameState` at all; only a live
  Sandbox-mode round trip surfaced it. **Flagging for a future session, not
  fixing now:** `loadGameState`'s hand-list is a standing trap — a fourth
  wiring point (write `SAVE_KEYS`, write `WORLD_KEY_FALLBACKS`, write
  `buildGameState`'s literal, write `loadGameState`'s hand-list +
  returned-object literal) that the other three write paths don't need,
  and that a future new world key WILL forget again unless
  `loadGameState` is refactored to walk `SAVE_KEYS` dynamically like its
  siblings. Out of scope for this phase's own diff — a refactor of a
  load-bearing function untouched by this plan's goal is exactly the kind of
  scope creep the session prompt warns against, but it is a real, load-bearing
  gap worth a dedicated session.
- **D22 — The East Wing is the hotspot (declared priority).** Existing:
  `self.swim`, `self.play_games`, `self.workout`. Added: pool games
  (water-volleyball, Marco Polo — shared activities), `pool_loungers`
  (sunbathe/read), `lockers` + `changing_bench` (store swim gear / change —
  wardrobe hook), `yoga_mat` + `weight_set` verbs, the **sauna upgrade**
  — resolved (Q2): a *subroom* in `pool_room`'s south-west corner with a
  north-facing door, offering a real degree of privacy while existing
  entirely inside the pool room's footprint (no new floor-plan node), with
  health + social perks — balcony verbs (`balcony_table` sit/eat,
  `plant_balcony` tend), and East-Wing **events** (pool party) through the
  invitation system. The chokepoint design (game room gates the wing) stays;
  the wing just stops being empty.
- **New D58 — Phase 13's real mechanism for D22, three genuine implementer's
  calls made and recorded (2026-09-01).**
  **(1) The sauna is FACILITY_DEFS, never STRUCTURAL_UPGRADES**, despite the
  Phase 13 Files line naming both as candidates. STRUCTURAL_UPGRADES exists
  specifically to edit the room graph (`addEdge`/`removeEdge`/`threshold`/
  `roomType` — see `pool_window`/`ensuite`/`dining_doors`), which is exactly
  what "no new floor-plan node" (D22, Q2, and the plan's own "Not a
  new-rooms plan" section) rules out. `pool_sauna` (config.js) is a third
  `room: 'pool_room'` entry in `FACILITY_DEFS`/`ROOM_FACILITIES`, broken/
  functional/upgraded exactly like `pool_systems`, gating a new `sauna`
  OBJECT_DEFS fixture (`defs.world.js`) placed in `APARTMENT_LAYOUT.pool_room`
  (layout version 8→9) — the same "renovate what's already standing there"
  shape as `swimming_pool`'s own `water: 'empty'` day-one state. The
  south-west-corner/north-facing-door detail is flavor (`imagePhrase`,
  `render.js`'s floor-plan icon) — not an enforced coordinate.
  `resolveAutoPlacements` (defs.placement.js) packs a room's perimeter
  automatically; hand-authoring one object's exact spot would mean building
  `ROOM_DECOR` support for this one fixture, which is out of scope per
  invariant 6 for a deliberate one-off subroom.
  **(2) The sauna's "real degree of privacy" is object-sourcing, not a new
  presence tier.** `sharedActivityParticipants` (`actions.js`) — the ONE
  function every `shared` block and the new `residentsPresent` checker both
  read — determines "who's with you" by **room-level presence**
  (`ctx.presentNpcIds`), not by which object/verb someone is doing. Every
  existing shared activity in this codebase (self.swim, self.workout,
  self.play_games, self.relax) already works this way — there is no
  sub-room presence granularity anywhere in the engine, and building one for
  a single fixture would be new machinery invariant 6 doesn't justify for
  one object. `self.sauna` is `source: {kind:'object', objDef:'sauna'}` (an
  affordance distinct from "anywhere in pool_room", the same way
  `wardrobe.change_outfit` is object-sourced without the bedroom needing to
  be its own room) and reuses `vulnerableState`/`transientClothing`
  (`'sauna'`/`'undressed'`→`'towel'`) exactly like `self.shower`/`self.swim`
  — a towel-only act, not a locked-room one. The "privacy" D22 describes is
  narrative (an enclosed nook versus the open pool floor) and mechanical
  only in the sense that using it is its own affordance, not a claim that a
  sauna user is invisible to a resident standing three feet away in the same
  room. If a future phase genuinely needs sub-room presence tracking (a
  second private nook, a locked room within a room), that is new
  infrastructure worth its own design pass, not something to retrofit
  silently onto this one fixture.
  **(3) `pool_party` ships with NO bespoke ask leaf** — it is a
  `COMMITMENT_KINDS` entry (`config.js`) with `playerInvitable: true` and
  `inviteWords`, riding the existing `$Invite` leaf (`ASK_INVITE`,
  `inviteKindFromFlavor`, asks.js) exactly the way D37's own comment invites
  a future eventType to when it "has no bespoke judging or narration" —
  true here (unlike the cook-off, D14, or the full house party, D26, both
  future phases). No new file, no new leaf; `COMMITMENT_KINDS.pool_party`
  and its `roomId: 'pool_room'` are the whole mechanism.
  **A real gap found and fixed, not part of this phase's own scope but
  blocking it directly:** `lockers` (`defs.world.js`, changing_room) had
  `container: true` (a bare boolean, not the `{capacity, label}` shape every
  other container object uses) and NO `container.open`/`container.take`/
  `container.put` in its `affords` — meaning the "east wing wet room" built
  in the floorplan plan could never actually store or retrieve anything,
  despite being declared a container. Fixed as part of building the "store
  swim gear" wardrobe hook (D22): lockers now has a real container shape and
  the standard triad, plus `lockers.change_outfit`/`lockers.interact`/
  `lockers.open` mirroring `wardrobe.change_outfit`/`wardrobe.interact`/
  `wardrobe.open` byte-for-byte (`prepareLockerChangeOutfit`,
  `hasLockerClothes`, both new). `openWardrobePanel` (render.js) gained a
  4th optional `heading` param (defaults to `'Wardrobe'`, unchanged for the
  bedroom callsite) so the panel says "Lockers" rather than "Wardrobe" when
  opened from the east wing.

### Computer, phone, and deeper
- **D23 — A real crossword minigame.** A new BrineOS app (`APP_DEFS` entry,
  phone + computer). Seeded daily puzzle from a word/definition bank (seed =
  day), fill-in grid UI, hints, and mood/skill rewards. The user loves this
  one; a second seeded daily mode (wordle-style) is an easy Phase-14
  extension.
- **New D59 — Grid construction is "draw N pairs," not general crossword
  synthesis (Phase 14, 2026-09-01).** General crossword-grid construction
  (freely intersecting words in an authored-looking layout) is NP-hard and
  wildly overbuilt for a house minigame nobody is grading against a real
  newspaper puzzle. `PUZZLE_WORD_PAIRS` (puzzles.js) is 24 hand-picked
  across/down word PAIRS, each guaranteed only to share a real letter — no
  hand-computed row/col, `findCrossing` finds the first shared letter at
  generation time. `generatePuzzleForDay` seed-picks `PUZZLE_TUNING
  .pairsPerDay` (4) pairs via the existing `pickUnique` (sim.js, same helper
  `rollCastSlot` already uses for weighted-unique draws) and stacks each
  pair in its own vertical block (across at local row = the down word's
  crossing index, down at local column = the across word's crossing index)
  so blocks never collide with each other — the "bank" the plan's data model
  names is this pair list; "grid generation" is which 4 of 24 pairs get
  drawn for the day, not freeform synthesis. This gives a genuine grid with
  real intersections (verified: `verify-aa-p14.js` section 2) at a fraction
  of the complexity, and reads exactly like a small daily puzzle should.
  Reward is a new `wordplay` skill id (no curve yet — same "XP now, curve
  later" precedent as `tech`/`fitness`, skills.js) plus `MOOD_PAYOUTS
  .puzzleComplete` (config.js), halved via `grantPuzzleCompletionReward`
  whenever any cell was filled by the Hint button (`puzzle.revealed`) rather
  than typed. Generation is hooked into `computer.js`'s `openApp` and
  `phone.js`'s `phoneOpenApp` (both already special-case `appId==='upgrades'`
  for the contractor tutorial — this mirrors that exact precedent, one line
  each, not a day-rollover hook) — RoomList's own "generate on first
  meaningful contact" precedent (`postListing`), not gig board's day-1
  bootstrap special case, since a crossword has none of gig board's income
  urgency. Per-keystroke cell fills deliberately skip re-rendering entirely
  (mutate state only) rather than reuse the [data-action] delegation or
  `renderComputerScreen` — the desktop window's `typingHere` guard
  (render.desktop.js) only protects the computer shell, and the phone shell
  (`renderPhoneContent`, render.phone.js) always rebuilds its body on every
  render with no such guard, so a naive per-keystroke redraw would fight the
  player mid-type on phone specifically. Only deliberate, infrequent actions
  (Hint, Check Answers, and completion itself) trigger a real redraw.
- **D24 — Chatter becomes a real social network.** `social_feed`
  (`chatter.example`) grows: NPC profiles (bible + `avatarChip`/portrait),
  posts generated from house events + NPC beliefs/gossip (templated,
  LLM-finished), like/comment (NPCs react through the cognition/gossip
  systems), a player profile, and a feed seeded from live house state. The
  "great or awful" risk is content quality — gated by the existing
  SFW/consent pipeline and the narrative rules, never by post-hoc censorship.
  `harvestChatterResidue` (dreams.js) already proves the house→feed pipeline.
- **D25 — Skills become a developable track.** Self-directed research
  (browser + bookshelf: spend time reading/studying a named skill), practice
  actions (hobby/verb actions already grant `def.skill` XP), and skill-gated
  verbs (cleaning quality, cooking already, new hobby verbs). EduStream
  courses stay; this makes skill growth a lifestyle, not a class schedule.
  The user's note: this is what the original design was for.
- **D26 — House Party is the flagship event.** Invite N guests through the
  invitation system; the party is a multi-participant event with music (D29
  audio hooks the existing music devices), food (cooked or DoorDrop
  catering), drink, noise (signal layer — neighbors/roommates react), and a
  mess it *leaves behind* (D17 dirt — cleanup is part of the price). Parties
  are where flags, gossip, and romance collide; the D2 event shape is what
  makes it a feature, not a special-case script.
- **D27 — Touring is a guided walk.** Invite a guest/roommate on a tour; the
  pair walks the apartment through a sequence of narration beats per room
  (deterministic beats + flavor, riding the walk/movement presentation). A
  small, social, low-code feature that makes the house feel like a home you
  show off.
- **New D60 — "Neighbors" in D26 means the household, not an off-map entity
  (Phase 17, 2026-09-02).** No off-map/outside layer exists anywhere in this
  engine (D28's own boundary: the player cannot leave the apartment at all),
  and grepping the whole codebase for a "neighbor" concept before writing any
  code found none — every existing use (`SOUND_DEVICE_DEFS.music`'s own
  comment: "carries to the neighbours all day") is loose language for
  whoever is in earshot, always another resident. Party noise reactions
  therefore reuse sim.js's proven `music_too_loud` shape exactly (perceive →
  threshold → chance → a real event), aimed at residents, not a new
  off-map complaint system — the real, calibrated arrival math (one open
  hop from `SIGNALS_EMIT.partyNoise` (0.65) lands at ~0.325, base sound
  attenuation 0.5 × `openMultiplier.sound` 1) set `PARTY_TUNING
  .complainThreshold` at 0.2, deliberately below music's own 0.45 (calibrated
  for in-room/next-door listening) since a party is meant to be the more
  pervasive case D26 asks for.
- **New D61 — Party is a real COMMITMENT_KINDS entry with its own leaf;
  Touring has none at all (Phase 17, 2026-09-02).** `COMMITMENT_KINDS.party`
  (config.js, next to `pool_party` — real home, not the plan's guessed
  `commitments.js`) is deliberately NOT `playerInvitable`: `ASK_PARTY`
  (`$HouseParty`, asks.js) is its own leaf with bespoke wording, exactly the
  case `pool_party`'s own comment predicted needing one ("unlike the cook-off
  ... or the full house party"). It still gets multi-guest booking for free
  by returning `inviteExtraIds` off its `decide()` — `runAskScheduleFlow`
  (ui.js) already reads that field off ANY leaf's decision, not just
  `ASK_INVITE`'s. Touring, by contrast, is NOT a scheduled event at all — D27
  reads as an immediate "want the grand tour?" (`ASK_TOUR` / `$ShowAround`),
  byte-identical decide() to `ASK_FOLLOW`, riding Follow's existing
  presentation rather than booking a future window. `npc.touring = { visited:
  [] }` rides alongside `npc.follow` (set together in `ASK_TOUR.postEffects`,
  cleared together at every one of Follow's three existing release sites —
  `advanceFollowers`'s privacy-room refusal, `doStopFollowing`, sim.js Pass
  1's sleep/off-site release). `advanceTouring` (movement.js, called from
  `doMove` right where Follow's own release beats are narrated) fires one
  authored beat (`TOUR_STOPS`, config.js — every common room except both
  bathrooms, plus the player's own bedroom as the closing stop; no scripted
  multi-stop walk system existed before this phase, confirmed absent) per
  NEWLY-entered curated room, and on the last one fires a second, wrap-up
  beat and pays out `TOUR_TUNING`'s small mood/relationship reward directly
  (movement.js already writes `npc.location` directly from the presentation
  layer for Follow; this mirrors that, not the ACTION_DEFS DSL, since
  there's no `executeAction` call here to route through).
- **New D62 — Food/drink presence does not score a party "quality" (Phase
  17, 2026-09-02, deliberate scope cut).** D26 names food/drink/music as
  things a party HAS, not necessarily things Phase 17 must SCORE — the
  Verification checklist ("books with N guests, runs, produces noise + mess,
  neighbors react; cleanup resolves the mess; a tour plays narration beats")
  never asks for one, unlike the cook-off's real judging need (D14, a later
  phase's own call). Music needed zero new code — `SOUND_DEVICE_DEFS.music`'s
  existing per-tick mood/keep-it-down pass already applies to ANY room
  regardless of what commitment is active in it. Food/drink at a party is
  the SAME existing kitchen/DoorDrop/inventory systems already give the
  player everywhere else; nothing new ties "how much was on the table" to a
  party outcome. A future phase wanting that is real, avoidable scope, not a
  gap introduced here.
- **D28 — Retired (2026-08-31).** Pets are cut from this plan entirely. The
  dog case alone needs an "outside"/off-map layer this game has never
  modeled — the player currently has no way to leave the apartment at all —
  and the user decided a pet system deserves its own dedicated design and
  implementation session rather than being squeezed in as one phase here.
  See Q3 for the reasoning.
- **D29 — A lot of original music and SFX (user-raised requirement).** A
  standing acquisition + hookup track: per-mood/scene music (a small library
  of generated originals) and per-action sound effects (doors, cooking,
  water, laundry machines, notifications, doorbell). Hooked through the
  existing music-device/headphones substrate (intimacy plan Phase 19) so the
  sound-blocking rules still work. This is asset work + a thin audio module,
  not a rewrite; it can proceed in parallel with any gameplay phase.

### Implementation clarifications (locked during Phase 1)
- **D37 — D2's commitment fields map onto ones that already existed, not new
  ones (Phase 1, 2026-08-31).** `commitments.js`'s pre-Phase-1 record already
  had `kind` (a `COMMITMENT_KINDS` key, each carrying a human `label`),
  `invitedIds`/`acceptedIds`/`declinedIds`, and `roomId` — these ARE D2's
  `eventType`/`roster`/`confirmed`/`location`, under names the
  asks-and-attachments-plan chose before this plan existed. Do NOT add a
  second `eventType`/`roster`/`confirmed`/`durationMinutes` field in a later
  phase on a literal reading of D2's Data model sketch — that sketch was
  written before this plan's design-review session re-audited the live code,
  and doing so would be invariant 6's exact violation (a field with no
  independent reader, duplicating one that already exists). The one field
  Phase 1 actually added is `host` (`'player'` | an npcId) — genuinely
  missing before, and NOT derivable from the pre-existing `proposerId` param
  (see Phase 1's Handoff notes for why). If a later phase needs a field this
  list doesn't cover, add it — this decision only forecloses re-adding ones
  that already exist under another name.
- **D38 — Flag/rule INSTANCES never live on `npc.flags` as a bare array; that
  property is already a plain object bag (Phase 3, 2026-08-31).** Checking
  the real codebase before writing anything down (same discipline as D37)
  found `npc.flags` already carrying dozens of `_`-prefixed sub-records
  (`_coldShoulder`, `_askCounts`, `_suspicionWindow`, `_intimacyHistory`,
  `_askPhotoDraft_*`, `_driveCooldowns`, ...) across `asks.js`, `npc.js`,
  `overture.js`, `drives.js`, `effects.js` — D15's own Data model sketch
  (`npc.flags = [ { id, source, condition, behavior, weight } ]`) would have
  silently overwritten every one of them. Resolution, following the SAME
  def/instance split D2/D37 already established: a rule's DEFINITION
  (`condition`/`weight`/`label`) lives in a `config.js` table
  (`HOUSE_RULE_DEFS`, same shape as `PICKPOCKET_TUNING`/`COMMITMENT_KINDS`);
  the per-house ACTIVE-rule record is `world.houseRules` (an array of
  `{ id, setDay }` — exactly D15's own sketch for `world.houseRules`,
  untouched). Do NOT add a raw array under `npc.flags` in Phase 7 (D13,
  boundary flags) or Phase 8 (D16, comfort flags) on a literal reading of
  D15's sketch — use a new sub-keyed array on the EXISTING object instead
  (e.g. `npc.flags._boundaryRules = [...]`), matching every other per-NPC
  record already there.
- **D39 — D15's "conscientiousness/agreeableness, disinhibition" compliance
  language maps onto the REAL `npc.bible.temperament` schema, which has
  neither "agreeableness" nor "disinhibition" by name (Phase 3,
  2026-08-31).** The real axes are warmth, volatility, openness,
  conscientiousness, assertiveness, selfAwareness (config.js's `BIBLE_SCHEMA`/
  every seeded temperament literal). Warmth is the closest existing stand-in
  for "agreeableness" (a warmer NPC lets more slide); volatility (emotional
  reactivity / low impulse control) is the closest existing stand-in for
  "disinhibition" (how sharp a reaction runs once it fires). `flags.js`'s
  `ruleCareWeight`/`ruleReactionSeverity` are the one implementation of this
  mapping; any later phase reading D15's original trait names should reuse
  those two functions rather than re-deriving a second mapping that could
  disagree with this one.
- **D40 — D8's "ITEM_DEFS gain an optional owner" doesn't fit the real item
  model; the real shape is the per-INSTANCE `ownerId` stacks already carry,
  plus a new `meta.borrowed` stamp (Phase 4, 2026-09-01).** Item stacks are
  `{ defId, qty, ownerId, meta }` (`items.js`) — `ITEM_DEFS` is the static
  per-def catalog (one "hoodie" entry for every hoodie in the game) and has
  no per-instance concept to hang an owner on. `ownerId` already existed
  (previously under-used: mostly `'player'`/`null`) and is now doing real
  work: a gift/steal (permanent transfer) sets it to the new holder, same as
  before; a borrow leaves it pointing at the LENDER even while the item
  physically sits in the player's bag (`asks.js`'s `ASK_BORROW`/
  `ASK_RETURN_ITEM` bypass the generic `MOVE_ITEM` DSL line for exactly this
  reason — `effects.js`'s `applyMoveItem` hardcodes the destination
  `ownerId` to `'player'`-or-`null`, which is wrong for a borrow). Any later
  phase modeling item possession should read `ownerId`/`meta.borrowed`
  (money.js/items.js/inventory.js's `borrowableStacks`/`borrowedFromStacks`)
  rather than inventing a second ownership field.
- **D45 — An NPC's temperature comfort band is a fixed physical range plus
  deterministic per-NPC jitter, NOT temperament-derived, despite D16's own
  literal data-model sketch (Phase 8, 2026-09-01).** Checked before writing
  anything down, same discipline as D39: none of the real `npc.bible.
  temperament` axes (warmth, volatility, openness, conscientiousness,
  assertiveness, selfAwareness) have any real physiological link to cold/heat
  tolerance — inventing one would be exactly the fake-mapping D39 refused to
  do for "agreeableness"/"disinhibition". `temperature.js`'s `npcComfortBandC`
  instead hashes `npcId` (`mulberry32(hashStr(...))`, the same seeded-jitter
  primitive D35 used) for a small deterministic per-NPC spread around
  `THERMOSTAT_TUNING.baseMinC/baseMaxC` — different residents feel a room
  differently without a fabricated trait link. Personality is NOT wasted,
  though: `thermostatSelfAdjustChance` scales the REACTION (assertiveness —
  how likely an uncomfortable NPC is to act on it) exactly the way D39's own
  `ruleCareWeight`/`ruleReactionSeverity` split "whether" from "how sharp,"
  applied one level differently here ("whether to just suffer" vs. "how much
  it hurts").
- **D46 — "NPCs derive clothing from temperature" (D16) needed no new drive;
  it rides the ALREADY-EXISTING `thermal` clothing stat through
  `composeOutfit`'s own documented bias extension point (Phase 8,
  2026-09-01).** Every `CLOTHING_DEFS` item has carried a `thermal` stat
  since the intimacy plan's D11 (Phase 4/7) — `config.js`'s own
  `CLOTHING_EFFECTS` comment said outright "no reader today, by design,"
  reserved for exactly this. `npc.js`'s `npcOutfitForContext` (which already
  derives an NPC's outfit fresh every tick, unconditionally, regardless of
  whether the `change_clothes` drive itself fires) now feeds
  `temperatureClothingBiasWeight`'s signed weight into `composeOutfit`'s
  `bias.stats` param — the SAME extension point Phase 7's styleLean already
  uses, both coexisting independently. This is continuous and automatic,
  never a per-tick roll — a cold NPC's wardrobe pick just IS warmer, the same
  tick ambient temperature changes, with zero new competing-drive risk (no
  `DRIVE_DEFS`/`scoreCandidates` change of any kind). `verify-aa-p8.js`
  section 7 proves the ACTUAL `npcOutfitForContext` call flips a real pick
  (`shorts`↔`cargo_pants`, matched traits so only comfort/attraction/thermal
  decide it) between a forced-cold and forced-hot ambient, not just
  `composeOutfit` in isolation.
- **D47 — HVAC billing's flat `UTILITY_THERMOSTAT=1.0` constant is DELETED,
  replaced by `temperature.js`'s `thermostatHvacMultiplier` (Phase 8,
  2026-09-01), scaling with `|targetC − THERMOSTAT_TUNING.neutralC|` — the
  player's chosen DELTA, never the raw setting (21°C costs baseline in every
  season; 28°C costs more in every season alike).** One pre-existing harness
  (`verify-cal-p2.js`, the Seasonal Calendar & Sandbox plan's own "D7
  do-not-touch" check) asserted the OLD constant directly and broke — fixed,
  not silently worked around: it now asserts what it actually cared about
  (an untouched thermostat still bills at the old flat 1.0 baseline), and a
  new comment there points at this decision. Confirmed via `verify-cal-p2.js`
  itself post-fix: 140 days of HVAC accrual at the default setting sums to
  the exact byte-identical old total (`35×(2.2+6.8+2.2+8.5) = 689.5`).
- **D48 — `ambientTempC` deliberately has NO heat-source term this phase
  (cooking, occupancy) — one value for the whole apartment, season +
  thermostat only (Phase 8, 2026-09-01).** D16's sketch named "heat source
  bumps" as a component; scope was cut to keep the phase's one new file
  small and its every claim independently provable (an occupancy/cooking
  bump would need per-room state this phase doesn't otherwise touch).
  `THERMOSTAT_TUNING` is the one table any future producer adds a bump to —
  the same "engine built generic enough for a later producer" precedent
  D38's flags table already established — not a restructure. Flagged here so
  a future session doesn't assume it was overlooked rather than cut on
  purpose.

## Data model

### Event / commitment roster (D2 — Phase 1, real shape as of 2026-08-31 — see D37)
```js
// commitments.js — the actual record (kind/invitedIds/acceptedIds/roomId
// pre-date this plan; `host` is the one field Phase 1 added):
{
  kind: 'hangout' | 'meal' | ...,     // = D2's "eventType" (COMMITMENT_KINDS key, each with a .label)
  invitedIds: ['npc_1'],              // = D2's "roster": everyone asked
  acceptedIds: ['npc_2'],             // = D2's "confirmed": everyone who said yes
  declinedIds: [],
  roomId: 'dining',                   // = D2's "location"
  startAbs, endAbs,                   // duration is endAbs - startAbs, not stored separately
  host: 'player' | npcId,             // NEW in Phase 1 — who this plan belongs to
  status: 'scheduled' | 'held' | 'missed',
}
```

### Ask-tree additions (D5–D7, D10–D14 — Phases 1/2/4/6/7)
```js
ASK_CATEGORIES gains two categories:
{ id: 'affection', label: '🤗 Affection',
  children: [ASK_HUG, ASK_KISS_CHEEK, ASK_KISS_LIPS, ASK_CUDDLE, ASK_INTIMACY] }
  // RequestIntimacy moves here from its own category.
{ id: 'social', label: '🙏 Social',
  children: [ASK_FOLLOW, ASK_APOLOGIZE, ASK_SPACE, ASK_COOKOFF,
             ASK_BORROW, ASK_GIVE_MONEY, ...] }
```
Every leaf keeps the existing contract: pure `decide()`, `effects()` /
`postEffects()`, `leafNote()` — identical to the current leaves.

### Money ledger (D9 — Phase 4, real shape as of 2026-09-01)
```js
player.moneyLedger = {
  [npcId]: { playerOwes: 0, npcOwes: 0 },  // playerOwes: player borrowed from NPC;
                                           // npcOwes: NPC borrowed from player
}
// money.js — moneyOwedByPlayer/moneyOwedToPlayer (PURE reads; the player-
// owes read falls back to the legacy player.flags._loanOwed[npcId] until
// migrated) and adjustMoneyLedger(gs, npcId, side, delta) (MUTATES — folds
// any legacy debt in on its first write, clamps each side at 0, prunes the
// entry once both sides settle). ask_loan/ask_repay (asks.js) read/write
// playerOwes; $GiveMoney [loan]/$CollectMoney (asks.js, both new this
// phase) write/read npcOwes. A no-strings $GiveMoney is a transfer with no
// ledger entry. D10's NPC-initiated request (Phase 5) is a different door
// onto this SAME ledger, not a parallel one.
```

### Item ownership (D8 — Phase 4, real shape as of 2026-09-01 — see D40)
```js
// an item STACK (items.js — { defId, qty, ownerId, meta }, not a new shape,
// this field already existed): ownerId IS the owner, already real for a
// gift/steal (permanent transfer). Borrow adds one new meta field:
{ defId: 'hobby_sketchpad', qty: 1, ownerId: npcId /* the LENDER, not the holder */,
  meta: { borrowed: { from: npcId, dueDay } } }
```
Gift = permanent owner transfer (`ownerId` changes, unchanged from before
this phase). Borrow = temporary — `ownerId` STAYS the lender's even while
the stack sits in the player's own `inventory` array (asks.js's
`ASK_BORROW`/`ASK_RETURN_ITEM` bypass the generic `MOVE_ITEM` DSL line for
exactly this reason; see D40). Steal = covert owner transfer through the
existing stealth/evidence/suspicion pipeline (`doTakeFromRoom`, ui.js — no
changes needed this phase, it already sets `ownerId: 'player'`).

### Sneaking & the cover-tracks window (D34, D36 — Phase 1B, real shape as of 2026-08-31)
```js
// player.sneaking — a bare boolean, no migration needed (same as
// player.skills). Read by signals.js's emitPlayerFootsteps (suppresses the
// player's own footsteps signal entirely) and stealth.js's
// resolvePickpocket (PICKPOCKET_TUNING.sneakingDetectionMultiplier).
player.sneaking = true | false

// npc.flags._suspicionWindow — one at a time; a new incident before the old
// one clears just replaces it. Opened by stealth.js's openSuspicionWindow
// (this phase's one caller: resolvePickpocket's suspected branch), read by
// activeSuspicionWindow, consumed by resolveCoverTracks.
npc.flags._suspicionWindow = { kind: 'pickpocket', subject: 'boundary_violation', expiresAtTick } | undefined
```
No new "hardened belief" state: crossing `STEALTH_TUNING.confrontThreshold`
(existing, `doTalk`) is already what a cover-tracks window is racing
against — the window just buys `npc.suspicion[subject]` back down before a
talk fires the deterministic confrontation.

### Follow (D11 — Phase 6)
```js
npc.follow = { leader: 'player', sinceDay } | null
```

### Flags & conditions (D15 — Phase 3, real shape as of 2026-08-31 — see D38/D39)
```js
// config.js — the DEFINITION table (condition/weight/label never duplicated
// into save data, same def/instance split as COMMITMENT_KINDS/PICKPOCKET_TUNING):
HOUSE_RULE_DEFS = {
  no_eating_living_room: { id, label, condition: { act, roomId }, weight },
  // future rules add their own act/condition shape here; houseRuleConditionMet
  // (flags.js) is the one matcher every source (house rule / D13 boundary /
  // D16 comfort) reads through.
}
// world.js — the per-house ACTIVE-rule record (exactly D15's original sketch):
world.houseRules = [ { id, setDay } ]
```
`npc.flags` is NOT where flag instances live — it is already a plain object
bag of unrelated `_`-prefixed sub-records (D38); a boundary/comfort flag's
future instance storage is a new sub-keyed array ON that object
(`npc.flags._boundaryRules`), never a bare array replacing it.
Detection (Phase 3's shipped house-rule source): co-presence
(`getPresentNpcIds`), the same primitive `resolveRoomEntryStealth`/
`resolvePeep` use for an overtly witnessed act — not a `cognition.js`/
`evaluateDrives` per-tick consult, and not a `perceiveSignals` round-trip
(sight barely leaves its own room anyway). An NPC not in the room is
provably unaffected either way; see flags.js's file-header comment for when
a future rule condition would actually need the heavier signals-based path.

### Temperature (D16 — Phase 8, real shape as of 2026-09-01 — see D45–D48)
```js
// config.js — THERMOSTAT_TUNING (defaultC/minC/maxC/stepC/neutralC/
// costPerDegreeC/hvacEfficiency/seasonOutdoorC[4]/baseMinC/baseMaxC/
// comfortJitterC/clothingBiasWeight/annoyance*/complain*/selfAdjust*):
// the ONE tuning bucket, replaces the deleted flat UTILITY_THERMOSTAT.

// world.js — the household's one dial (lazily init'd, ui.js's houseRules
// convention — no world-gen-time field needed):
world.thermostat = { targetC }                  // player-set, thermostat.raise/lower

// temperature.js — the pure math every consumer shares:
ambientTempC(gameState)                          // seasonOutdoorC[season] blended toward targetC by hvacEfficiency — ONE value, whole apartment, no heat-source term (D48)
thermostatHvacMultiplier(gameState)              // 1 + |targetC-neutralC|×costPerDegreeC — computer.js's accrueHvacForDay reads this instead of the old flat constant (D47)
npcComfortBandC(npc, npcId)                      // { minC, maxC } — fixed range + deterministic per-npc hash jitter, NOT temperament-derived (D45)
temperatureDiscomfort(gameState, npc, npcId)     // signed °C outside the band; negative=cold, positive=hot, 0=inside
temperatureClothingBiasWeight(gameState, npc, npcId) // signed weight fed into composeOutfit's bias.stats.thermal (D46 — no new drive)
thermostatSelfAdjustChance(npc)                  // assertiveness-scaled per-tick roll
```
`npc.comfort` (D16's original sketch) does NOT exist as a stored field —
it's `npcComfortBandC`, a pure function, avoiding a name collision with the
pre-existing, unrelated `npc.needs.comfort` (a 0-100 general-coziness need,
`applyNeedsHeartbeat`) and satisfying invariant 6 (nothing here needs to be
stored; it's cheap to recompute). Annoyance (mood malus) + the occasional
narrated complaint + the personality-weighted thermostat self-nudge all live
in `sim.js`'s `resolveTick` Pass 2, mirroring the existing `music_too_loud`
block one section above it (NOT `applyNeedsHeartbeat`, which is explicitly
documented pure/rng-free). "Change clothes" needed no new mechanism at all —
see D46.

### Dirt (D17 — Phase 9)
```js
// per-room accumulation, read by the smell/signal layer and by moods:
room.dirt = { [roomId]: { amount: 0..1, lastCleanDay } }
// sources: cooking, meals, parties, foot traffic, dust; cleaning decays it.
```

### Laundry states (D20, D53 — Phase 11, real shape as of 2026-09-01)
```js
// A clothing STACK (hamper/washer/dryer/wardrobe contents, or an
// inventory) carries its laundry state in meta — see ITEMS'
// laundryStateOf. Absent/'stored' = clean; the wardrobe itself is the
// wearability gate (D53) — no separate flag needed once a garment is
// physically back in it.
{ defId: 'hoodie', qty: 1, ownerId: 'player'|npcId|null,
  meta: { laundryState: 'dirty'|'washed'|'dried'|'folded'|'stored' } }

// Washer/dryer cycle — an instance field, lazy-resolved exactly like the
// food-overhaul dishwasher's obj.dishwasher.cycleActiveUntilAbs (ITEMS'
// laundryCycleProgress/resolveLaundryCycle). NOT a world-level field.
washerOrDryerObj.laundry = { cycleActiveUntilAbs: 0 }
```

### Mail (D21 — Phase 12)
```js
world.mailbox = [ { id, kind: 'bill'|'flyer'|'package'|'letter',
                    from, arrivedDay, claimed: false } ]
```

### Crossword (D23 — Phase 14, real shape as of 2026-09-01 — see D59)
```js
// world.computer.apps.puzzles (computer.js's defaultComputerState). `day` is
// the day this grid was generated for (0 = never generated — the
// gigs.lastRefreshDay trick); filledCells/revealed are BOTH plain
// { "row,col": value } maps, not arrays (sparse, keyed by position).
// `seed` isn't stored separately — gameState.meta.seed + `day` IS the seed
// (seededRng(meta.seed, `puzzle_${day}`)), so nothing here needs to freeze it.
{ day, words: [{ clue, answer, row, col, dir: 'across'|'down' }],
  rows, cols, filledCells: { '2,0': 'G' }, revealed: { '0,0': true },
  completedDay }  // null until solved; guards a second reward payout
```

### Chatter post (D24 — Phase 15)
```js
{ id, author: npcId | 'player', text, likes: [npcId],
  comments: [{ author, text }], day, eventRef }
```

### Pet — retired (D28)
No data model. Pets are cut from this plan's scope (see D28).

## Implementation phases

### Phase 1 — Invitation & Event core (D1–D4) — **Done 2026-08-31**
**Goal.** The spine. `commitments.js` extends the hangout record with a
roster + event metadata; a `$Invite` ask leaf (choose person, choose event
type, choose time) and the acceptance machinery (friend will come / NPC
schedules it / player commitment) land in the chat Ask tree; booked events
become scheduled activities the scheduler actually runs; the **Clear the
Calendar** demand clears them; invite types text/propose/knock route to the
invitation overlay.
**What actually shipped (see the Handoff's Phase 1 notes for full detail).**
The single-invitee half of this (D1/D2) turned out to already exist —
`ASK_HANGOUT`/`ASK_MEAL` (asks.js, from the earlier asks-and-attachments-plan)
were already full `schedule:true` leaves booking real `createCommitment`
records that SIM's `resolveScheduleActivity` already runs for every accepted
attendee, per-NPC, with no help from this phase. The real gap was
multi-invitee events and calendar visibility, so that's what landed: a new
`ASK_INVITE` leaf (`asks.js`, id `'Invite'`, category `'invite'`) that parses
an event type + extra resident names out of its flavor text and folds them
into the SAME commitment as ordinary `invitedIds` (never affecting its own
accept/decline verdict — D1 held); a new `host` field on the commitment
record (the one real D2 field gap — see D37 for why `roster`/`eventType`/
`confirmed`/`durationMinutes` were NOT added as separate fields); a new
Calendar app (`defs.computer.js`) that lists upcoming commitments and can
cancel one (`calendar.cancel` → `doCancelCommitment`, ui.js) — this is "Clear
the Calendar"; and a new `trackerCommitments` Agenda/notification adapter
(tracker.js) — this is the "scheduler hook," and it turned out to be a
visibility adapter, not a new scheduler (the real per-NPC scheduling already
worked). Along the way, found and fixed an invariant-8 bug unrelated to this
plan: `asks.js` was in `index.html` but had never been added to
`dev/verify/loadgame.js`'s `ORDER`, so no ask leaf — old or new — had Node
coverage before this session.
**Files.** `asks.js` (new `ASK_INVITE` leaf + `'invite'` category +
`inviteKindFromFlavor`/`inviteExtraGuestsFromFlavor`), `commitments.js`
(`host` field, `cancelCommitment`, `upcomingCommitments`), `config.js`
(`COMMITMENT_KINDS[k].playerInvitable`/`.inviteWords`, `meal.roomId`),
`tracker.js` (`trackerCommitments` adapter), `defs.computer.js` (`calendar`
app), `render.computer.js` (`resolveScreenSource`'s `'commitments'` source),
`icons.js` (`calendar` icon), `ui.js` (`doCancelCommitment` + the
`runAskScheduleFlow` multi-invitee wiring + `host` at all three
`createCommitment` call sites), `dev/verify/loadgame.js` (added `asks.js` to
`ORDER` — the invariant-8 fix), `dev/verify/verify-aa-p1.js` (new harness,
31 assertions).
**Verification.** `node src/src/dev/verify/verify-aa-p1.js` — 31/31 passing.
`node src/src/dev/verify/run-all.js` — 3298 passed/76 failed/13 errored,
matching the pre-existing baseline exactly (this phase's 31 new assertions,
zero regressions). Live-verified in `dev-harness.html`: `$Invite dinner with
Bramwell` while talking to Aiko → commitment with `roomId: 'dining'`,
`invitedIds: ['<Bramwell>']`, `acceptedIds: ['<Aiko>','<Bramwell>']` — the
plan's own Verification line, byte for byte; the Calendar app showing and
clearing it; a Tracker notification deep-linking straight into the Calendar
app.

### Phase 1B — Stealth, detection & covert acts (D32–D36)
**Goal.** Wire real XP into the three stealth mechanics that already ship
(room-entry, peep, phone-snoop) so `stealthSuccess` levels actually move —
today nothing calls `awardSkillXp(player, 'stealth', ...)` and every player
is permanently level 0. Add the genuinely new pieces: pickpocketing (D33, a
person-target covert take), a Sneaking toggle that suppresses the player's
footstep signal for general movement (D34), an explicit branch on
phone-snoop photo finds (D35), and granular cover-your-tracks actions (D36)
consumed by D30/D31's sleeping-NPC branch and by any stealth-gated act's
suspected/noticed-but-unconfirmed window. Sequenced early (right after the
invitation spine) because D8 (steal/pickpocket), D20 (laundry snoop), and
D30/D31 (sleeping-NPC acts) all consume it.
**Files.** `stealth.js` (pickpocket resolver, cover-tracks helpers),
`skills.js` (no new curve — just new `awardSkillXp('stealth', ...)` call
sites at each mechanic's clean/unwitnessed branch), `signals.js` (footstep
suppression while sneaking), `image.js` (explicit branch on
`buildPhoneSnoopPhotoPrompt`), `ui.js` (Sneaking toggle chip, pickpocket
verb, cover-tracks actions), `defs.actions.js` (new verb defs).
**Verification.** A clean room-entry, a clean peep, and an unwitnessed
phone-snoop each now visibly award stealth XP, and enough of them cross a
level boundary (mood impulse fires, `stealthSuccess` chance measurably
rises); pickpocketing resolves through its own seeded roll into clean/
suspected/caught; Sneaking measurably lowers detection while moving through
an occupied common room; an explicit phone-snoop photo only ever generates
when the existing mature-content gate is open; a suspected outcome opens a
real window a cover-tracks action can clear before it hardens.

### Phase 2 — Make-a-Move → Ask + Affection acts (D5–D7, D30)
**Goal.** `doMakeAMove` (ui.js:905) reroutes to the Ask tree — same
`parseAskInput`/`resolveAsk` pipeline as the free-text asks; "Make a move"
and "Ask" become one surface. New `AskPhysical` generic leaf + ladder
(Hug → Kiss on Cheek → Kiss on Lips → Cuddle → RequestIntimacy, weight and
location-gated) with the *willingness gate as the only door* to sex;
affection conversations (hug/kiss/cuddle) resolve through
`resolveSharedAct` / `source: { kind: 'paired' }`. A sleeping/unaware target
branches into the existing boundary-act gate instead (D30) — the ladder
never asks `willingness.js` to relax its 'asleep' floor.
**Files.** `asks.js` (ASK_CATEGORIES 'affection', ladder, generic leaf),
`ui.js` (reroute + chips), `render.js:3951` chip, `defs.actions.js` (any new
paired-affection defs), `boundary.js` (D30's wake-hostile/wake-receptive/
undisturbed outcomes on the existing sleep-target gate).
**Verification.** Physical → targets correctly downgraded/rejected by
willingness, never bypassed; mood/relationship effects apply; conversation
ends with both parties leaving cleanly; a leaf attempted on a sleeping NPC
resolves through `resolveBoundaryGate` into one of D30's three outcomes and
never through the normal receptivity check; opening the conversation panel
on a sleeping NPC changes nothing about their state.

### Phase 3 — Flags & Conditions engine (D15)
**Goal.** The freeuseofficeclicker-style rule engine: a named flag with
`condition`/`behavior`/`weight`, consulted at NPC decision time
(cognition/evaluateDrives). Three sources — player-set house rules, boundary
flags, NPC-owned comfort/preference flags. Detection through the
perception/signal layer so an NPC is never bound by a rule it cannot
perceive. Personality-driven compliance; violation → belief/gossip +
relationship consequences.
**Files.** `src/js/17-flags-detection.js` pattern (new flags module),
`defs.actions.js` (flag-management verbs), `cognition.js` + perception/signal
layers, `loadgame.js` ORDER + `?v=` bump.
**Verification.** House rule "no eating in the living room" → eating there
in view of an NPC triggers the NPC's flag behavior; NPC outside the room
doesn't react (perception gap); gossip records the violation.

### Phase 4 — Money & Item controls (D8–D9)
**Goal.** Money becomes one bidirectional ledger: `player.moneyLedger` with
`playerOwes`/`npcOwes` per NPC; `ask_loan`/`ask_repay` map onto it; new
`$GiveMoney <amount> [gift|loan]` ask leaf (player gives) and an NPC-side
money request close the loop; repayment clears both directions. Item
ownership: gifts transfer permanently, borrows are temporary with a due day,
steals are covert transfers stamped through the stealth/evidence/suspicion
pipeline — which already exists and ships (`doSearchRoom`, ui.js:3394); this
phase's new work is the ownership/ledger model on top of it, not the take
mechanic itself. Taking something directly off an NPC's person (rather than
their room) is pickpocketing, D33/Phase 1B.
**Files.** `asks.js` (new `$GiveMoney` leaf), `money.js`/ledger, migration of
`_loanOwed`, item model (`owner`/`borrowed`), inventory + world-object item
instances, `stealth.js` (steal hook onto the existing `doSearchRoom` path).
**Verification.** Loan both directions settles and clears; a borrowed item
NPC demands back on due day; a witnessed steal lands in evidence/suspicion.

### Phase 5 — Reverse overtures & NPC-initiated asks (D10, D31)
**Goal.** NPCs initiate too: invitations (party, cook-off, dinner, outing)
and requests (money, a borrowed item, help) delivered through the existing
overture channels, with the player's accept/decline resolved by the same
deterministic machinery mirrored with the player as target (reads NPC intent
+ player standing/mood to flavor and weight the ask, never to filter out
asks the player can't actually grant — that mismatch is drama, not a bug).
A third reverse category rides the same channel (D31): an NPC-initiated
advance on a sleeping/unaware player. Whether the player wakes resolves
deterministically (mirroring D30's branch shape); if they wake, the
into-it/decline/anger choice is real player input, never a computed roll.
**Files.** `overture.js` (reverse-ask rows + payloads), `asks.js` (mirrored
resolve), `boundary.js` (D31's sleeping-player branch), `ui.js`
(accept/decline chips reused, extended with the third rung for D31).
**Verification.** Across a simulated week an NPC issues a plausible invite
and a plausible request; accepting schedules the event (P1 machinery); a
request the player can't fulfill (e.g. money they don't have) resolves as a
normal decline/tension beat, never a soft-lock; an NPC's sleeping-player
advance either leaves the player asleep throughout or wakes them into a real
three-option choice — never a resolved outcome the player didn't pick.

### Phase 6 — Follow (D11)
**Goal.** A `$FollowMe` ask leaf sets `npc.follow`; a follower paths with
the player room-to-room through the movement-presentation layer. Follow ends
on arrival, entering a private space the NPC wouldn't enter, conversation, or
an explicit release. `npc.follow` is sim state; the walk presentation never
writes it.
**Files.** `asks.js` (leaf), `movement.js` presentation layer, the npc-agenda
hook (real home TBD — likely `tracker.js`/`intent.js`; no `planner.js`
exists), `cognition.js`'s `isPrivacyRoom` (private-space gating).
**Verification.** "Follow me" → NPC tracks the player across rooms; entering
a bedroom releases the follower; the flag reads as sim state after a load.

### Phase 7 — Apology + Ask for Space / Boundaries (D12–D13)
**Goal.** `$Apologize <for X>` is belief-gated (an NPC only accepts an
apology for something they believe happened); sincere + timely repairs part
of the transgression's REL_DELTA, insincere/repeated deepens it, and the
apology is recorded in NPC beliefs (`forgiven`) so gossip carries it. Ask for
Space / boundary asks (respect privacy, stop an unwanted behavior, don't
enter my room) write per-NPC flags the D15 engine respects.
**Files.** `asks.js` (two leaves), the forgiven record (real home TBD —
likely `relationships.js`/`rumination.js`; no `beliefs.js` exists),
`stealth.js` (transgression source), new `flags.js` (boundary rows, D15).
**Verification.** Apologizing for an unknown wrong is rejected; a sincere
timely apology moves REL_DELTA; a boundary flag changes NPC behavior
(perception-gated).

### Phase 8 — Temperature & clothing (D16)
**Goal.** A thermostat verb sets a target; daily ambient temperature derives
from season schedule + player setting + heat sources; HVAC billing scales
with the player's delta instead of the flat `UTILITY_THERMOSTAT` multiplier.
NPCs derive clothing from temperature through the wardrobe system and get
annoyed (mood/desire deltas) outside their comfort band — then try to change
it themselves: use the thermostat, change clothes, complain (a D15
comfort-flag behavior). Extreme settings are the drama, not smoothed away.
**Files.** `defs.world.js`/`defs.actions.js` (thermostat verb), new
temperature module (ambient + comfort), `computer.js` utils.hvac billing,
clothing derivation (real home TBD — likely `items.js`/`sprites.js`; no
`wardrobe.js` exists), `cognition.js` (annoyance/self-adjust).
**Verification.** Setting 28°C in summer raises billing above baseline; an
NPC outside comfort band shows mood delta and self-adjusts (thermostat /
clothing / complaint) when present.

### Phase 9 — Cleaning system + Clean Hallway (D17)
**Goal.** Per-room `dirt` (0..1) with sources (cooking, eating, parties,
foot traffic, dust over time) and decay; new cleaning verbs (`self.clean`,
per-object: sweep/vacuum/mop/wipe) plus supplies (broom/mop/vacuum as
purchasable items or room equipment); NPCs clean through the existing chore
system. Dirt feeds the smell/signal layer and builds into a visible/annoying
state. "Clean Hallway" is this system pointed at `hallway_a`/`hallway_b`.
**Files.** new `dirt.js` module, `defs.actions.js` (cleaning verbs),
`defs.items.js` (supplies), NPC cleaning (real home TBD — likely
`sim.js`/`drives.js`/`commitments.js`; no dedicated `chores.js` exists),
smell/signal layer (`signals.js`), `loadgame.js` ORDER + `?v=` bump.
**Verification.** Cooking accumulates kitchen dirt; cleaning decays it; a
dirty kitchen reads in the smell layer; an NPC chore cleans a room; hallway
cleaning action works.

### Phase 10 — Kitchen & Dining + Bathroom & Grooming (D18–D19)
**Goal.** `coffee_maker` brew verb (caffeinated drink item — energy/mood
effects); `trash_kitchen` take-out-the-trash chore (resets kitchen smell);
dining room's identity is shared meals as events (P17) on
`set_meal`/`sit`/dishes. Bathroom: `toilet` hygiene beat,
`bathroom_mirror` groom (brush teeth, fix hair — appearance/confidence
hooks into wardrobe/sprite), `sink_bathroom` wash hands; grooming affects
appearance-driven social reads; `long_shower` stays the relaxation variant.
**Files.** `defs.actions.js` + `defs.items.js` (new verbs/drinks),
`defs.world.js` (verb attachments to existing objects), the trash chore
(same real-home caveat as Phase 9's `chores.js`), grooming's appearance hook
(real home TBD — likely `avatar.js`/`sprites.js`; no `appearance.js`
exists).
**Verification.** Brewing then drinking coffee gives energy/mood; taking out
trash clears kitchen smell; grooming raises appearance read that a social
gossip event consumes.

### Phase 11 — Laundry chain + Snoop (D20, D53–D56) — **Done 2026-09-01**
**Goal.** `self.laundry` splits into **Wash** (washer load — closed-form
cycle), **Dry** (dryer or line), **Fold**, **Put Away** (into the wardrobe —
makes clothes available again), and **Snoop** (read an NPC's laundry — a
small perception/suspicion moment with gossip potential). Clothes move
`dirty → washed → dried → folded → stored`; `laundry_machines` facility
gates washer/dryer verbs.
**What actually shipped (see the Handoff's Phase 11 notes for full detail).**
No new file (D56) — real identifiers landed in each file's existing
ownership boundary. `defs.actions.js`: `self.laundry` rewritten to move
real stacks and start a real cycle; three new verbs `dryer.dry`/
`dryer.fold`/`dryer.putaway` + four new requirement checkers
(`washerReadyToWash`/`dryerReadyForLoad`/`dryerLoadReadyToFold`/
`foldedLaundryReady`). `effects.js`: four new trusted effects
(`MOVE_GARMENTS`/`START_LAUNDRY_CYCLE`/`FOLD_GARMENTS`/`PUTAWAY_GARMENTS`).
`items.js`: the laundry data/cycle helpers (D53) plus the day-rollover
dirtying helper `dirtyWornOutfitForResident` and the NPC/maid-chore fix
`runHamperIntoWasher` (D55). `sim.js`: `processLaundryWearForDay` (D54),
called from `ui.js`'s `processDayRollover`. `stealth.js`:
`resolveLaundrySnoop`, the P1B-pattern covert resolver. `ui.js`/`render.js`:
`doSnoopLaundry` + the Snoop chip. `drives.js`/`computer.js`: the
`emptiesHamper`/maid-laundry-step fix (D55). `defs.world.js`: `dryer`'s
`affords` gained its three verbs. `config.js`: `LAUNDRY_TUNING`,
`LAUNDRY_SNOOP_TUNING`, and the snoop description/template tables.
**Files.** As above — see the Handoff's Phase 11 entry for the exact
function-by-function account.
**Verification.** `node src/src/dev/verify/verify-aa-p11.js` — new harness,
42/42 passing. `node src/src/dev/verify/run-all.js` (full) — 3679 passed/82
failed/12 errored, exactly the Phase 10 baseline (3637/82/12) plus this
phase's 42 assertions, zero regressions. Live-verified in
`dev-harness.html`: the dirty→washed→dried→folded→stored round trip
clicked through the real chips end to end (narration matched), the
garment landing back in the wardrobe and reading `laundryState: 'stored'`,
`ownerId: null`; the Snoop chip firing a real outcome window; and the
edge case of an owner with no bedroom wardrobe (a hired contractor NPC)
correctly leaving their folded garment in the dryer rather than losing it.

### Phase 12 — Entry: mail, deliveries, answer the door (D21)
**Goal.** A `mailbox` state accumulates mail (bills, flyers, packages) the
player gets via "Get Mail/Deliveries"; **Answer the Door** presents
"who's there" (delivery driver, friend, roommate, solicitor) and the player
admits/refuses through a short deterministic beat. Locking (`door.*`) and
delivery ETAs already exist — this is the physical door-side of them.
**Files.** new `mail.js` module, `defs.world.js` (mailbox verb),
`defs.actions.js` (answer-door beat), external-world retiming (arrivals),
`loadgame.js` ORDER + `?v=` bump.
**Verification.** Mail accumulates and is claimable; a knock triggers an
answer-door beat that resolves admitted/refused; a package arrival retimes
into the door sequence.

### Phase 13 — East Wing hotspot + sauna (D22)
**Goal.** The declared priority. Existing `self.swim`, `self.play_games`,
`self.workout` stay; add pool games (water-volleyball, Marco Polo — shared
activities), `pool_loungers` (sunbathe/read), `lockers` + `changing_bench`
(store swim gear / change — wardrobe hook), `yoga_mat` + `weight_set` verbs,
the **sauna upgrade** (a subroom in `pool_room`'s south-west corner, a
north-facing door, privacy inside the pool room's own footprint, health +
social perks — resolved Q2), balcony verbs (`balcony_table` sit/eat,
`plant_balcony` tend), and East-Wing **events** (pool party) through the
invitation system. The chokepoint design (game room gates the wing) stays;
the wing stops being empty.
**Files.** `defs.actions.js` + `defs.world.js` (new verbs/objects),
`STRUCTURAL_UPGRADES`/`FACILITY_DEFS` (sauna), `defs.actions.js` shared
activities (pool games), invitation system (pool-party eventType),
`loadgame.js` ORDER + `?v=` bump.
**Verification.** A wing visit offers the new verbs; a pool party books and
runs; sauna upgrade unlocks and gives health/social perks; swim gear storage
round-trips with the wardrobe.

### Phase 14 — Crossword / puzzle minigame (D23) — **Done 2026-09-01**
**Goal.** A new BrineOS app (`APP_DEFS` entry, phone + computer). Seeded
daily puzzle from a word/definition bank (seed = day), fill-in grid UI,
hints, and mood/skill rewards. A wordle-style second seeded daily mode is an
easy extension here.
**Files.** `defs.computer.js` (APP_DEFS `puzzles`, "DailyGrid"), new
`puzzles.js` (word-pair bank, seeded grid build, fill/reveal/reward — see
D59), `computer.js` (default `apps.puzzles` state + the `openApp` on-open
generation hook), `phone.js` (the matching `phoneOpenApp` hook),
`icons.js` (`ICONS.puzzles` — the documented blank-tile landmine), `config.js`
(`MOOD_PAYOUTS.puzzleComplete`), `render.computer.js` (`renderPuzzlesToday`),
`ui.computer.js` (`doPuzzleFillCell`/`doPuzzleRevealHint`/`doPuzzleCheck`),
`ui.js` (`puzzle.hint`/`puzzle.check` dispatch cases), plus the CSS block
(`.pz-*`, index.html).
**Verification.** Same-day seed gives the same grid; a completed puzzle grants
the reward; a half-fill survives a save/load; the app lists on phone +
computer. See the Handoff's Phase 14 entry for the full account (Node
harness `verify-aa-p14.js`, 30/30, plus live-page verification of both
shells).

### Phase 15 — Chatter social media layer (D24)
**Goal.** `social_feed` (chatter.example) grows: NPC profiles (bible +
`avatarChip`/portrait), posts generated from house events + NPC
beliefs/gossip (templated, LLM-finished), like/comment (NPCs react through
the cognition/gossip systems), a player profile, and a feed seeded from live
house state. Content quality risk ("great or awful") is gated by the
existing SFW/consent pipeline and the narrative rules, never by post-hoc
censorship. `harvestChatterResidue` (dreams.js) already proves the
house→feed pipeline.
**Files.** `defs.computer.js` (APP_DEFS social_feed), Chatter UI, feed
generator (templates + `generateText` finish), cognition/gossip reaction
hooks, dreams.js integration.
**Verification.** A house event produces a Chatter post; an NPC reacts
(likes/comments) plausibly; the feed renders on phone + computer; NSFW/SFW
gating holds.

### Phase 16 — Skill research (D25)
**Goal.** Skills become a developable track: self-directed research (browser
+ bookshelf: spend time reading/studying a named skill), practice actions
(hobby/verb actions already grant `def.skill` XP), and skill-gated verbs
(cleaning quality, cooking already, new hobby verbs). EduStream courses stay;
this makes skill growth a lifestyle, not a class schedule.
**Files.** `defs.actions.js` (research verbs), `skills.js` (practice +
gating), `defs.computer.js` (browser hooks), `defs.world.js` (bookshelf).
**Verification.** Researching a named skill raises its XP; a skill-gated verb
unlocks at the threshold; progress persists across a save/load.

### Phase 17 — House Parties + Touring (D26–D27)
**Goal.** Parties: invite N guests through the invitation system; a
multi-participant event with music (D29 hooks the existing music devices),
food (cooked or DoorDrop catering), drink, noise (signal layer — neighbors
react), and a mess it leaves behind (D17 dirt — cleanup is part of the
price). Parties are where flags, gossip, and romance collide; the D2 event
shape makes it a feature, not a special-case script. Touring: invite a
guest/roommate on a tour; the pair walks the apartment through narration
beats per room (deterministic beats + flavor, riding the walk/movement
presentation).
**Files.** `commitments.js` (party eventType), `defs.actions.js` (party
props: music/food/noise/mess), D9 dirt integration, invitation system
(multi-guest), touring module (beats), movement presentation.
**Verification.** A party books with N guests, runs, produces noise + mess,
and neighbors react; cleanup resolves the mess; a tour plays narration beats
room-by-room.

### Phase 18 — RETIRED (was Pets, D28)
Cut 2026-08-31. Pets need their own dedicated design track — the dog case
alone implies an "outside"/off-map layer this game has never modeled — not
a phase squeezed into this plan. See D28 and Q3. Nothing here to implement.

### Phase 19 — Audio & sound track (D29)
**Goal.** A standing acquisition + hookup track: per-mood/scene music (a
small library of generated originals) and per-action sound effects (doors,
cooking, water, laundry machines, notifications, doorbell). Hooked through
the existing music-device/headphones substrate (intimacy plan Phase 19) so
the sound-blocking rules still work. Asset work + a thin audio module; can
proceed in parallel with any gameplay phase.
**Files.** new `audio.js` module, music/SFX asset library (hosted URLs),
music-device integration, `defs.actions.js` (SFX hooks).
**Verification.** Music swaps with mood/scene; SFX fire on their actions;
headphones/music-device sound-blocking still respected.

## Status

| Phase | Feature | Decisions | Status |
|-------|---------|-----------|--------|
| 1 | Invitation & Event core | D1–D4 | Done 2026-08-31 |
| 1B | Stealth, detection & covert acts | D32–D36 | Done 2026-08-31 |
| 2 | Make-a-Move → Ask + Affection acts | D5–D7, D30 | Done 2026-08-31 |
| 3 | Flags & Conditions engine | D15, D38, D39 | Done 2026-08-31 |
| 4 | Money & Item controls | D8–D9 | Done 2026-09-01 |
| 5 | Reverse overtures & NPC-initiated asks | D10, D31, D41, D42 | Done 2026-09-01 |
| 6 | Follow | D11 | Done 2026-09-01 |
| 7 | Apology + Ask for Space / Boundaries | D12–D13 | Done 2026-09-01 |
| 8 | Temperature & clothing | D16, D45–D48 | Done 2026-09-01 |
| 9 | Cleaning system + Clean Hallway | D17, D49–D50 | Done 2026-09-01 |
| 10 | Kitchen & Dining + Bathroom & Grooming | D18–D19, D51–D52 | Done 2026-09-01 |
| 11 | Laundry chain + Snoop | D20, D53–D56 | Done 2026-09-01 |
| 12 | Entry: mail, deliveries, answer the door | D21, D57 | Done 2026-09-01 |
| 13 | East Wing hotspot + sauna | D22, D58 | Done 2026-09-01 |
| 14 | Crossword / puzzle minigame | D23, D59 | Done 2026-09-01 |
| 15 | Chatter social media layer | D24 | Done 2026-09-01 |
| 16 | Skill research | D25 | Done 2026-09-02 |
| 17 | House Parties + Touring | D26–D27, D60–D62 | Done 2026-09-02 |
| 18 | ~~Pets~~ — retired | D28 | Retired 2026-08-31 |
| 19 | Audio & sound track | D29 | Not started |

## Dependency order

```
P1  Invitation & Event core (spine)
├─ P1B Stealth, detection & covert acts (sequenced early; D8/D20/D30/D31 consume it)
├─ P2  Make-a-Move → Ask + Affection   (independent after P1; D30's cover-tracks rides P1B)
├─ P3  Flags & Conditions engine       (needs P1 decision-time surface)
│  ├─ P7  Apology + Boundaries         (writes boundary flags → P3)
│  ├─ P8  Temperature & clothing       (comfort flags → P3)
│  └─ P17 House Parties + Touring      (flags colliding at parties)
├─ P4  Money & Item controls           (independent after P1; pickpocket rides P1B)
├─ P5  Reverse overtures               (needs P1 event booking; D31 rides P1B)
├─ P6  Follow                          (independent after P1)
├─ P9  Cleaning system                 (independent; feeds P17 mess)
├─ P10 Kitchen & Bathroom              (independent after P1; P17 meals)
├─ P11 Laundry + Snoop                 (independent; laundry-snoop is its own
│                                       instance of the P1B pattern, not P1B itself)
├─ P12 Entry: mail / answer door       (independent)
├─ P13 East Wing hotspot + sauna       (needs P1 event booking)
├─ P14 Crossword minigame              (independent)
├─ P15 Chatter social layer            (independent; feeds on house events)
├─ P16 Skill research                  (independent)
├─ P18 — RETIRED (was Pets; see D28)
└─ P19 Audio & SFX                     (parallel, any time)

Parallel-safe clusters: P1B/P2/P4/P6/P10/P11/P12/P14/P15/P16 after P1;
P3 must precede P7/P8; P9 precedes P17; P19 anytime.
```

## Open questions (parked — none blocking)

- **Q1 — RESOLVED, cut entirely.** Study/Computer/Phone item 4's "a lot of
  potential to be great or awful" pitch, recovered and then dropped:
User: "Video Call a Friend — Messages app: scheduled call with an off-map 
friend-of-roommate; roommates can interrupt. [system]" This is was what I was
referring to when I said that this has a lot of potential. I have a good vision
for a system like this, but have decided it is too out of scope for what I want
in this game. So we will be bypassing the video call feature entirely.
- **Q2 — RESOLVED (D22, Phase 13).** Sauna placement/type:
User: Changing room is relatively small. I think I am going to put the sauna
in the pool room, in the South-West corner with a North facing door. The sauna
is a 'subroom' technically because it exists entirely inside of the pool room
and offers a certain level of privacy.
- **Q3 — RESOLVED, cut entirely (D28, Phase 18 retired).** Pet scope:
User: So to own a pet, one has to take care of them. For some pets this means
never leaving the home, while with some it does. You have to 'walk the dog' for
them to relieve themselves. Cats, fish, reptiles, are all examples where you
never have to leave the home for them to be taken care of. While my initial
inclination is to include dogs, we do not currently have a single method for
the player to leave the apartment at all. If we want to include dogs, we need
to talk about an "outside" layer of the sim.
User (2026-08-31): Cutting pets from the plan entirely — a pet system needs
real design and implementation on its own; it isn't a good fit squeezed into
this plan here. See D28 (retired) and Phase 18 (retired).
- **Q4 — Cook-off judging & stakes (D14).** `taste.js` scoring weights and
  what winners actually win (bragging rights, small money,
  chores-for-a-day). Resolve at P17 kickoff (cook-off books as an event).

## Design invariants

With scars, from the playthrough and refactor. **Treat these as
non-negotiable.**

1. **Decide before you decorate.** Every outcome is computed
   deterministically first; LLM/flavor text only *finishes* the wording.
   Flavor never decides.
2. **The willingness gate is the only door to sex** (intimacy plan + D5).
   Never bypassed, never shortcut, for player-initiated *or* NPC-initiated
   advances. Everything else — asking, declining, env setup — is legit.
3. **An NPC is never bound by a rule it cannot perceive** (D15). Detection
   through the perception/signal layer is a precondition for enforcement;
   otherwise rules are magic.
4. **A conversation never replies for a person who isn't there** (D4). The
   join-machinery matches roster to present people; no avatar ever speaks
   for an absent NPC.
5. **Events are commitments.** One scheduler; an invitation that is accepted
   is a commitment that runs; "Clear the Calendar" is the explicit escape
   hatch, not silent abandonment.
6. **No field without a reader.** Everything added here is consumed within
   its own phase (vocation D23 scar). No orphan state.
7. **Verification split.** Pure logic verified in `dev/verify` (Node);
   presentation/visual verified on the live page with `page_eval` +
   vision. Both for visual phases.
8. **New source files register** in `loadgame.js` ORDER and bump the
   `?v=` cache-busting param (intimacy plan pattern).
9. **Money and items are symmetric ledgers** (D8–D9). A loan is a loan
   whichever side owes it; an item is owned/borrowed/stolen by someone —
   never a free-floating flag.
10. **The presentation layer never writes sim state.** Movement walk-ins,
    walk presentations, and chatter are views over sim state, never
    mutators (liveliness plan carryover).