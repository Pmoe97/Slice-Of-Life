# Contractor Friend & Tutorial Overhaul

Status: **ALL PHASES DONE (1-4)** — character brief & bible (Del Connors),
plumbing, 35% labor pricing, free tutorial job + milestone hints, and banter/
memory depth all built & verified. Last updated 2026-08-04.

Companions: `src/ref/complete/renovation-occupancy-overhaul-plan.md` (the jobs this
character performs and prices — read that doc first, this one assumes its
data model), `src/ref/complete/external-world-npcs-overhaul-plan.md` (the broader
non-resident-NPC framework this character pilots), `src/ref/complete/game-opening-plan.md`
(names "the tutorial/onboarding surface, which doesn't exist at all yet" as
open work — this doc fills that gap).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source
of truth for where the last session left off. Update it, and the Status
table at the bottom, as the very last thing you do each session — see
`src/ref/patterns/perchance-agent-handoff-prompt.md` for the full session protocol.

---

## Handoff — read this first

**Resume at: nothing — the document is complete.** Phase 4 (Banter depth) is
implemented and verified; all four phases are Done (see the Status table).
Step 0 of the next session should skip both plan documents and report
completion.

**Last session's notes (Phase 4 — implemented & verified):** Gave the
Contractor real memory to reference for IM replies, per the Phase 4 block,
using the standard `memory.facts` mechanism:
- **Static seeds** — `CONTRACTOR_INITIAL_FACTS` (new, config.js, immediately
  after `CONTRACTOR_BIBLE`): 12 first-person facts in Del's voice — what he
  knew about the grandfather (20+ yrs as his contractor, the water-main job,
  the decline, his death) and opinions on the apartment grounded in the real
  starting disrepair (`FACILITY_STARTING_TIERS`). Pre-seeded into
  `state.npcs[CONTRACTOR_ID].memory.facts` at new-game setup in
  `buildGameState` (sim.js, right after the `createNpcFromBible` call).
  day 0 = shared history. These reach the LLM via the IM prompt's
  `[Memories — facts]` block (all valid facts) AND keyword retrieval
  (`retrieveRelevantMemories`) — important because `buildNpcBlockV2` does
  NOT surface `bible.history` on its own (only want/wound/blindSpot/boundary),
  so this material was previously invisible to the model.
- **Running job commentary** — new `setContractorJobFact(gameState, category,
  text, day)` helper (computer.js, beside `fireContractorMilestone`). Keeps
  exactly ONE valid `renovation_job` fact (every new job fact — booking,
  stage refresh, or completion — invalidates the previous active one);
  completed jobs accumulate as `renovation_done` facts. Respects
  `MEMORY_BUDGET.maxFacts` by dropping the oldest `renovation_done` before
  any static/seed fact; no-ops safely when the Contractor NPC is absent.
  Wired at three points: (a) `bookRenovationJob` adds "I just started on
  <label> — a/an <repair|upgrade> job, due day <eta>" (gotcha: `etaDay` is a
  property on the job object, NOT a local const — a first draft referenced it
  bare and threw; use `job.etaDay`); (b) `processRenovationJobsForDay`'s
  stage-advance branch (ui.js) refreshes the active fact to "day N of M,
  currently <stage>" using the existing `getRenovationJobStage`; (c) the
  completion branch retires the active fact and adds "I finished the <label>
  <type> on day <n> — <upgraded|repaired> and ready."
- **Verified live this session** (synthetic fresh-format states via
  `SIM_generateHouse`): 12 static facts seeded & valid on a fresh game; free
  tutorial booking → active fact appears; day-2 rollover → stage-refreshed
  fact; etaDay completion → active retired + done fact added + tier flips to
  `functional`; second (upgrade) booking → new active fact, prior done fact
  persists; `retrieveRelevantMemories(contractor, "tell me about my
  grandfather")` returns the grandfather facts; `buildImPrompt` contains both
  the full `[Memories — facts]` block and a `[Memories — retrieved]` section.
  Real LLM replies via `resolveImReply` (3 questions, live generateText):
  history → "We spent twenty years patching it up together... I'll tell you
  more when I'm not elbow-deep in that stove, kid" (grounds in grandfather
  facts AND the booked kitchen job); in-progress job → "making sure we do it
  right the first time so you aren't calling me back in six months"; unrelated
  small talk → "tinkering in the garage or having a beer" — all in-character,
  none a generic fallback. Budget guard tested (cap 40 holds, statics
  preserved, oldest done dropped); no-op paths safe.
- **Citation drift / test harness gotchas:** `SIM_generateHouse` returns a
  RAW state with top-level `clock` — NOT `meta.clock`. Synthetic tests must
  wrap `state.meta = { clock: state.clock, contentConfig: null, sessionLog: [],
  seed: state.seed }` before calling `bookRenovationJob`/`processRenovationJobsForDay`/`resolveImReply`
  (runtime states assemble `meta` in `writeGeneratedGameState`, state.js).
  Also stub `window.addLogEntry = () => {}` during synthetic day-rollover
  tests — it queues kv writes and renders into the live narration log. The `edit` tool's matcher failed on two ui.js chunks this session (bytes verified
  identical via execute_js); the replacements went in via execute_js
  string-replace instead — no code consequence, just a tooling note.

**Blockers / flagged deviations:** None. One known limitation (not a blocker,
and consistent with how Phases 1-3 treat existing saves): `CONTRACTOR_INITIAL_FACTS`
are seeded at NEW-GAME setup only — an existing save created before this phase
has a Contractor NPC without the static seeds (its dynamic job facts still
work, since those are added live on booking/completion). No save migration was
added.

---

## The thesis

Renovations in the companion doc need someone to perform them. Rather than a
faceless "hire a contractor" button, that someone is **a specific, permanent,
fully-realized character** — knew whoever the player inherited the apartment
from, knows the building's disrepair intimately, does the work personally
(sometimes with an unnamed crew), charges real professional rates, and texts
the player constantly: progress updates, banter, unsolicited advice, answers
to questions. They never move in and are never a room-assignable resident.

This solves two problems at once:

1. **Renovation jobs need a face and a voice**, not just a progress bar —
   this is what makes "day 2 of 5" feel like something happening rather than
   a timer.
2. **The game has no tutorial surface at all today.** This character *is*
   the tutorial: they walk the player through the first renovation for free,
   then keep nudging via IM as new systems come online. Cheaper to build
   than a separate onboarding UI, and it's better fiction than one.

They are also the **first implementation** of a pattern
`external-world-npcs-overhaul-plan.md` wants to generalize: a real NPC
record, real relationship/memory machinery, real IM presence — who is never
a resident and never enters the housing/recruitment system. Build this one
concretely; generalize afterward, not before.

---

## Character brief

Locked from chat, verbatim where it matters:

- Knew the player's grandfather (or whoever the apartment was inherited
  from) — was *his* contractor. Knows the building's history and its rot
  firsthand.
- **A paid professional, not a favor.** "They absolutely charge for labor...
  Any 'discount' would likely be narrative at best, and somehow still feel
  like a markup. This guy is intended to make a lot of money off of the
  player." No discount mechanic. Loyalty is characterization, not a price
  break.
- Performs renovations personally, "sometimes with a team, most of the time
  on their own." The crew doesn't need to be interactive — narration and the
  under-construction scene variant (companion doc) carry that, not NPCs in
  the room.
- Texts the player: helpful hints, guidance through early hurdles, progress
  updates, banter. Can be texted back, asked questions, and replies for
  real (not just canned lines) — this is a real relationship, not a vendor
  bot.
- **Never moves in.** No `residency.status` value that implies co-habitation
  applies to them, ever.
- **Del Connors** (male, late 50s) — locked in Phase 1. **Practical** more
  than grumpy; an ol'-coot old-timer but kind of paternal too — guiding and
  patient. Sounds like he's helping you even when the bill doesn't reflect
  that he's doing you any favors. Calls you "kid". The full bible lives in
  `config.js` (`CONTRACTOR_BIBLE`); this section and that file are the
  authoritative brief.

---

## Data model

### NPC record — real, minimal, permanent

The Contractor needs a genuine `gameState.npcs[contractorId]` entry from the
start of a new game (not lazily grown like a Classifieds stub — they're
pre-built, per the locked decision to build this one concretely). Confirmed
directly: `ensureImThread`/`appendPlayerImMessage` (`computer.js:1415-1438`)
require a real NPC record to resolve name/avatar for IM — there is no
"system sender" concept in the IM app, so texting from this character is not
optional plumbing, it's the minimum needed for the character to exist at all.

- `residency.status: 'visitor'` — the schema already has this exact enum
  value (`config.js:1234`, `CHARACTER_SCHEMA.mutable.residency.status`).
  **Verify its existing semantics before relying on it** — grep every place
  that branches on `residency.status` to confirm `'visitor'` doesn't already
  carry assumptions (e.g. "currently in the apartment," "gets a room") that
  would misfire for a character who is never physically present and never
  has a room. If `'visitor'` turns out to carry the wrong implications,
  either add a narrower status or a separate boolean flag
  (`npc.external = true`) rather than overloading it.
- **Excluded from the resident simulation.** The Contractor should not tick
  needs, run a schedule, wander the apartment, or fire drives — they only
  "exist" via IM and during a booked job's narration. Confirmed: the drive
  loop iterates a `resolved` collection inside `resolveTick` (`sim.js:685-693`)
  and already skips sleeping/transit NPCs by block/flag checks
  (`sim.js:685-691`). **Verify what populates that loop's source collection**
  and add an explicit skip for external/non-resident NPCs (by
  `residency.status === 'visitor'` or the `npc.external` flag, whichever
  Phase 1 settles on) — do not assume the loop already excludes them.
- Standard `bible` fields (name, personality, traits, memory, `relPlayer`)
  populate normally — they're a real character for relationship purposes,
  just not a housing one.

### IM thread — pre-seeded, day one

`ensureImThread(gameState, contractorId)` gets called during new-game setup
(not lazily on first contact) so the thread exists with a welcome/intro
message already in it — this is the tutorial's entry point. Player-initiated
replies use the existing `appendPlayerImMessage` / `resolveImReply` pattern
(`computer.js:1421-1438`) unchanged — a real LLM call resolves the reply
exactly like texting any other NPC, which is what "can be texted with, asked
questions" requires.

### Contractor-initiated texts — scripted, not per-tick LLM

Progress updates, milestone nudges, and delay flavor are **deterministic
template pools**, matching the zero-LLM-in-ticks invariant and the existing
template-narration pattern (`narration: { mode: 'template', templates: [...] }`,
used by `self.watch_tv`, `self.study`, laundry/cook dynamic narration
builders). These post through the same mechanism `processNpcImMessages`
(`drives.js:417-428`) already provides for drive-initiated NPC texts — build
a small pool of `{ npcId: contractorId, text }` messages triggered by
`renovation-occupancy-overhaul-plan.md`'s job lifecycle (booked, stage
complete, job complete) and by tutorial milestones (see below), and pass them
through that same function at the relevant day-rollover point. Only a
player-initiated question gets a live LLM reply.

### Pricing — materials (companion doc) + labor markup (here)

The companion doc's `bookRenovationJob` cost is materials only (the existing
per-tier `cost` field). This doc adds the Contractor's cut on top:

```js
const CONTRACTOR_LABOR_MARKUP = 0.35; // tune during playtesting — "makes real money off the player"
function getContractorJobPrice(materialsCost) {
  return Math.round(materialsCost * (1 + CONTRACTOR_LABOR_MARKUP));
}
```

Total price shown at booking time (companion doc's confirmation screen) is
`getContractorJobPrice(tier.cost)`. Keep this as its own function rather than
baking the markup into `FACILITY_DEFS` tier costs directly — it's what lets
this doc's pricing model change (a second, cheaper/slower contractor
option, a loyalty discount reversal, whatever) without touching the facility
data model in the companion doc.

---

## Tutorial integration

**First auxiliary bedroom repair is free**, guided step-by-step, matching
the original brainstorm ("the first auxiliary bedroom will be a free
upgrade, the process guided by a tutorial"). Concretely:

- `bookRenovationJob` (companion doc) gets a one-time override: if
  `!gameState.world.flags.tutorialRenoUsed` and the target facility is one of
  the three non-player bedroom habitability facilities, the job books at
  $0 materials + $0 labor. Set `world.flags.tutorialRenoUsed = true` on use
  — this is a single flag, not a whole tutorial state machine.
- The Contractor's IM thread walks the player through: why the place is a
  wreck (in-fiction exposition, doubles as the opening's "you inherited
  this" framing per `src/ref/complete/game-opening-plan.md`), how to open RenoFix, what
  booking a job does, what "day N of M" means, and a nudge when the job
  completes ("first one's on me — the rest, you're paying full price, don't
  get used to it").
- Beyond the first bedroom: milestone-triggered hint texts (not a rigid
  script) at natural points — first time RenoFix is opened, first paid job
  booked, first roommate moves in, first Upgrade-tier job booked, apartment
  quality crossing a threshold. Each is a small template pool keyed to a
  `gameState.world.flags` check, same shape as the free-bedroom flag.

This keeps the "tutorial" as a set of cheap, checkable flags plus text pools
— no separate onboarding-overlay system, no scripted cutscene engine.

---

## Implementation phases

### Phase 1 — Character & plumbing

**Goal:** The Contractor exists as a real, simulation-light NPC with a
working IM thread, before any renovation-specific behavior is wired up.

**Tasks:**
- Character-brief pass: propose name/personality options to the user,
  finalize the bible.
- Create the NPC record at new-game setup with `residency.status: 'visitor'`
  (pending the verification below) and standard bible fields.
- Verify `residency.status: 'visitor'` semantics across the codebase; adjust
  the exclusion mechanism if it doesn't cleanly fit.
- Verify and patch the `resolveTick` drive loop (`sim.js:685-693` and its
  source collection) to skip this NPC — no needs decay, no schedule, no
  drives, no location.
- Pre-seed the IM thread with a welcome message at new-game setup.

**Files:** `sim.js` (new-game NPC setup, `resolveTick` loop scoping),
`config.js` (bible content once finalized), `computer.js`
(`ensureImThread` call at setup).

**Verification:** New game starts with the Contractor's IM thread already
populated. The Contractor never appears in the floor plan, never has a
`location`, consumes no simulation time. Player can send them a message and
get a real LLM-backed reply.

### Phase 2 — Pricing & booking integration

**Goal:** The companion doc's `bookRenovationJob` charges the Contractor's
marked-up price and records `contractorId` on the job.

**Files:** `computer.js` (`getContractorJobPrice`, wire into
`bookRenovationJob`'s cost calculation and the booking confirmation UI).

**Verification:** Booking any non-tutorial job charges materials + 35%
markup. The booking confirmation screen shows the marked-up total, not the
bare materials cost.

### Phase 3 — Tutorial script

**Goal:** The free first-bedroom flow and milestone hint texts work end to
end for a fresh save.

**Files:** `computer.js`/`ui.js` (`tutorialRenoUsed` flag and free-job
override in `bookRenovationJob`), new template pools for milestone texts,
hook into `processDayRollover` or the relevant trigger points
(RenoFix-opened, job-booked, job-complete, roommate-moved-in, quality
threshold).

**Verification:** First non-player bedroom repair costs $0 and is flagged
used after one job. Every subsequent bedroom job (including the same
bedroom's later Upgrade) charges full price. Each milestone fires its hint
text exactly once.

### Phase 4 — Banter depth

**Goal:** Player-initiated conversation with the Contractor feels like
talking to a real character, not a job-status bot.

**Files:** Bible/memory content — give the Contractor real facts to
reference (what they knew about the grandfather, opinions on the apartment,
running commentary on jobs in progress) so LLM-backed replies have material
to draw from, same as any other NPC's `memory.facts`.

**Verification:** Asking the Contractor about the apartment's history, an
in-progress job, or unrelated small talk gets a grounded, in-character reply
rather than a generic fallback.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | Done | Character record, simulation exclusion, IM thread, bible finalized (Del Connors) — built & verified |
| 2 | Done | Pricing markup (35% labor) wired into booking; jobs record `contractorId` |
| 3 | Done | Free tutorial job + milestone hints — built & verified (one-time $0 first aux-bedroom job, tutorialRenoUsed flag, 7 one-shot milestone hints) |
| 4 | Done | Banter/memory depth — CONTRACTOR_INITIAL_FACTS static seeds + live renovation_job/renovation_done facts in memory.facts; grounded LLM replies verified |

## Dependency order

```
renovation-occupancy-overhaul-plan.md Phase 1 (bookRenovationJob exists)
        │
        ▼
Phase 1 (character + plumbing) ──► Phase 2 (pricing) ──► Phase 3 (tutorial) ──► Phase 4 (banter)
```
Phase 1 here has no hard dependency on the companion doc (the NPC record and
IM thread can exist before jobs do), but Phase 2 needs `bookRenovationJob` to
exist to wire pricing into it.

---

## Open questions

- ~~Name, gender, personality~~ — **answered** (Phase 1): Del Connors, male,
  late 50s; practical ol'-coot, paternal/guiding/patient, sounds like he's
  helping you even when the bill says otherwise.
- **Ever visible in-scene?** Recommend no for v1 — off-screen/textual
  presence only, matching "contractors don't have to be interactive NPCs"
  from the original brainstorm and keeping scope down. Revisit if it turns
  out to feel like a missing character.
- **Named crew members** vs. always "the guy" / "the crew" in narration —
  flavor decision, doesn't block anything structurally. Default to
  unnamed crew, Contractor is the only named presence.
- **Surprise delays** (parked in the companion doc) would be a natural
  banter hook for this character if built later — not required for v1.
