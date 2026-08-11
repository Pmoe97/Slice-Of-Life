# Sensory & Social Roadmap

Status: **active** — the umbrella for six linked overhauls. Design session
2026-08-10. **Plans 0, 1 and 2 are complete.** Plan 3 is the next design
session — it depends only on Plan 1 and was always independent of Plan 2.
Plans 3–5 are theses awaiting their own design sessions.
Last updated 2026-08-11.

**Verification note for every plan below.** Plan 0 established that the whole
engine — all 27 files through `interruption.js` — loads into a bare Node `vm`
with five stubs, so `resolveTick`, `SIM_generateHouse`, `evaluateDrives` and
every pure function are directly callable against real generated houses with
no browser and no Perchance runtime. See `dev/verify/loadgame.js`. **Prefer
this to the iframe technique in `ARCHITECTURE.md`** for anything below the
render layer; it is faster, has no snapshot-staleness problem, and it is what
made Plan 0's need rebalance tunable at all.

This is an **index and an argument**, not a plan. It holds the vision that
spans six overhaul plans so no single plan has to carry it, and it records
the cross-cutting decisions that all six inherit. Individual plans follow
`src/ref/patterns/PLAN-ARCHITECTURE.md`; this document does not.

---

## The thesis

The apartment is more alive than the people in it.

That is not a figure of speech. The apartment has nineteen registered
verbs, an object model with per-instance dirty states, derived room
cleanliness, spoilage that produces real odor, facilities that decay and
need maintenance, and metered utilities that show up on a bill. The people
in it have four social verbs, twelve drives that fire on independent coin
flips with no arbitration, a relationship model whose bottom rung is
mathematically unreachable, and roughly one and a half turns of
conversational memory.

And the player experiences all of it through a scrolling log of things
that already happened.

Three problems, one shape:

1. **The world doesn't reach the player's senses.** Rot in the fridge sets
   a boolean that dampens a mood target. It doesn't *smell*. A note left
   on the fridge has nowhere to exist. Footsteps outside a door are not a
   thing the game can represent.
2. **NPCs don't perceive anything.** Peeping and phone-snooping are the
   only two places an NPC notices the world, and each is a bespoke
   hand-written check. An NPC cannot hear the shower running, smell that
   someone cooked, or see a note addressed to them.
3. **NPCs don't know each other or you.** Knowledge is a flat list of
   text facts with no provenance, no confidence, no transmission, and
   FIFO eviction. Nobody learns anything from anybody.

The unifying insight is that **1 and 2 are the same system**, and that
**3 rides on it**. A thing that happens in a room emits a signal. The
signal propagates, attenuates, and decays. Anyone in range — player or
NPC — may perceive it, gated by their own attention. What the player
perceives becomes prose and peripheral awareness. What an NPC perceives
becomes knowledge, with a provenance of "I saw this myself."

Once knowledge has provenance, gossip becomes expressible: Allen tells
Carrie something, and Carrie now holds that fact with provenance
`told_by:allen` and lower confidence than if she had witnessed it. Once
an NPC can hold a low-confidence fact they find interesting, they have a
*reason* to seek you out — which is the mechanism that turns a reactive
cast into a social sim.

That chain is the whole roadmap:

```
signals ──► perception ──► knowledge ──► interest ──► initiative
   │             │              │
   └─► prose     └─► NPC        └─► gossip between NPCs
       + HUD         cognition
```

### What this roadmap is *not*

- **Not a rewrite.** Every plan below extends systems that already exist.
  `world.events`, `ROOM_ADJACENCY`, `room.odor`, `surfaceRoomEvidence`,
  `getPlayerPerception`, `DRIVE_DEFS` and the memory tiers are all being
  generalised, not replaced.
- **Not a graphics project.** "Sensory" here means the game *tells* you
  what things are like, through prose and peripheral cues. It does not
  mean new art pipelines.
- **Not an excuse to abandon the zero-LLM tick.** Signals emit, propagate
  and decay inside `resolveTick`. That path stays synchronous, pure and
  model-free. Every plan below is bound by this.
- **Not five senses for their own sake.** Sight, sound and smell are
  ambient channels that propagate through space. Taste and touch are
  properties of items and acts, surfaced at the moment of contact. Forcing
  them into the propagation model would be symmetry for its own sake.
- **Not a simulation for the simulation's own sake.** Every signal must
  be perceivable by someone and every perception must change something the
  player can notice. A signal nobody can sense is dead code with a
  physics flavour.

---

## Cross-cutting locked decisions

These were settled in the 2026-08-10 design session and are inherited by
every plan below. Plans refer to them as `R1`…`R8`, distinct from their
own `D`-numbers.

- **R1 — Ambient prose is authored and composed; the model writes beats.**
  Signal descriptions come from authored phrase tables keyed by signal
  type and intensity band, composed deterministically. The LLM is reserved
  for dialogue and scene beats, where it is already earning its cost.
  Rationale: instant, free, offline-safe, and can never contradict
  mechanical state. It also keeps the tick loop model-free (R2).

- **R2 — The tick loop stays synchronous, pure and LLM-free.** Signal
  emission, propagation, decay and NPC perception all run inside
  `resolveTick`. This is the existing hard invariant that the entire
  autonomy layer depends on; nothing in this roadmap may weaken it.

- **R3 — The main UI is a scene reader, not a log.** The primary
  presentation is narrative prose, read like an interactive novel. Sensory
  information reaches the player three ways: woven into that prose, as
  peripheral awareness indicators (moodles, icons, badges), and — for
  things demanding attention — as a surfaced cue. A history log is
  retained but demoted; it is not the main event.

- **R4 — Past and present are visually delineated.** In the conversation
  pane and anywhere else history accumulates, prior interactions are
  clearly marked as past: timestamps, reduced contrast, separators. The
  player should never have to work out whether they are reading something
  happening now.

- **R5 — Knowledge has provenance and confidence, always.** No NPC ever
  holds a bare fact. Every fact records how it was acquired (witnessed,
  told by X, inferred, overheard) and how confident they are. This is what
  makes gossip expressible and what makes "Allen mentioned X" sayable.

- **R6 — Knowledge does not travel by osmosis.** Two NPCs sharing a room
  transmits nothing. Facts move only through an actual conversation event
  between them, and only facts the speaker has reason to raise. Confidence
  attenuates on transmission.

- **R7 — What an NPC knows about the player must be earned in play.**
  Shared time, shared activities and observed behaviour are the only
  sources. Nothing about the player is injected into a prompt that the NPC
  has not plausibly learned.

- **R8 — Every generated field must have a consumer.** The NPC audit found
  34 fields written, migrated, schema-validated and read by nothing. No
  plan below may add a field without naming, in the same phase, the code
  that reads it. Declaring a vocabulary ahead of its consumers is
  permitted only with an explicit `implemented: false` flag, following the
  precedent in `effects.js`.

---

## The six plans

| # | Plan | Status | What it establishes |
|---|---|---|---|
| 0 | [`../complete/npc-correctness-fixes-plan.md`](../complete/npc-correctness-fixes-plan.md) | **Complete** (2026-08-10) | Fixed the five defects the audit found. Later plans build on a working relationship and memory layer. Carries the authoritative dead-field disposition table |
| 1 | [`../complete/perception-and-signals-plan.md`](../complete/perception-and-signals-plan.md) | **Complete** (2026-08-10) | The signal substrate: standing + transient signals, propagation with per-channel door attenuation, notes, and one perception query shared by the player and every NPC |
| 2 | [`../complete/scene-reader-ui-plan.md`](../complete/scene-reader-ui-plan.md) | **Complete** (2026-08-11) | The interactive-novel main UI, awareness indicators, demoted log, delineated conversation history. Created `src/srcfiles/scene.js`; 110 assertions |
| 3 | `npc-cognition-plan.md` | **Ready — next up**, thesis only | Utility-scored intent selection, committed multi-tick plans, NPCs consuming perception |
| 4 | `knowledge-gossip-memory-plan.md` | Thesis only | Facts with provenance and confidence, NPC-to-NPC transmission, rumination, the player model |
| 5 | `npc-initiative-plan.md` | Thesis only | NPCs approach, knock, propose; shared activities that feed Plan 4 |

Plans 2–5 have theses recorded below. Each gets its own design session
before it is written, at the point where the plan beneath it has landed
and its real shape is known. **Do not write plan N+1's phases before plan
N ships** — the inventory overhaul learned this the expensive way.

---

## Plan 2 — The Scene Reader *(built — see [`../complete/scene-reader-ui-plan.md`](../complete/scene-reader-ui-plan.md))*

*The thesis below is what was commissioned; the plan document is what got
built and is the authority on the result.*

The main content area stops being `renderNarrationLog` and becomes a
scene: a composed passage of prose describing where you are, what is
happening, and what you can sense, refreshed as state changes rather than
appended to forever.

Three surfaces, per R3:

- **The scene passage.** Room, time, present NPCs and their activities,
  woven with the authored sensory phrases Plan 1 produces. This is the
  thing the player actually reads.
- **Peripheral awareness.** Moodles and icons for persistent conditions —
  a smell that won't go away, a sound elsewhere in the apartment, hunger,
  cold. Categorised by sense channel and severity, glanceable, not read.
- **Attention cues.** When something crosses a salience threshold — a note
  addressed to you, someone at your door, rot that just became
  unignorable — it is surfaced deliberately rather than left to be noticed
  in a paragraph.

The conversation overlay keeps its dedicated pane and gains R4's
past/present delineation. The narration log survives as a collapsible
history.

**Open before this plan is written:** how much of the scene passage is
re-composed per render versus cached; whether the scene image regenerates
on signal change; how attention cues interact with the existing modal and
bubble machinery.

---

## Plan 3 — NPC Cognition *(thesis only)*

Drives currently roll independently in `Object.entries(DRIVE_DEFS)`
declaration order, and any that pass all fire — an NPC can eat, shower,
clean the kitchen and start a conversation in the same thirty-minute tick,
with only the last `activityOverride` surviving. There is no notion of a
person doing one thing.

Replace the independent-coin-flip model with utility scoring: each tick,
score every candidate action against needs, personality, perceived
signals, schedule and social context; pick one; **commit to it for a
number of ticks**. Commitment is what makes behaviour legible to the
player and what makes multi-step intent possible — walking to the kitchen,
cooking, and carrying the result to someone is a plan, not three
coincidences.

This is also where NPCs become consumers of Plan 1's perception output:
a smelled signal raises the utility of cleaning; a heard signal raises the
utility of investigating; a seen note raises the utility of responding.

**Open before this plan is written:** whether committed intents can be
interrupted and by what; how utility weights are authored so personality
genuinely differentiates behaviour without becoming unreadable; whether
`compatibility`/`friction` (currently generation-only) become live inputs.

---

## Plan 4 — Knowledge, Gossip & Rumination *(thesis only)*

The largest and most novel plan. Memory stops being a flat list of text
and becomes a web of held beliefs.

Every fact an NPC holds carries **provenance** (witnessed / told by X /
overheard / inferred) and **confidence**. Provenance is what makes
transmission expressible and what lets an NPC say the sentence the design
is aimed at: *"Hey, Allen mentioned X and I wanted to ask you more about
it, I hope that's alright."*

Facts move between NPCs only through real conversation events (R6), and
only facts the speaker has a reason to raise — recency, emotional weight,
relevance to the listener. Confidence attenuates per hop, so a fact three
people deep is held loosely and may be raised as a question rather than an
assertion.

**Rumination** is the offscreen counterpart: an NPC processes what they
hold, generating inferences, emotional weight, and — critically —
*questions*. A held fact that is interesting to this particular
personality and low in confidence becomes an open question, and an open
question is a reason to seek someone out. That is the bridge into Plan 5.

The **player model** (R7) is the same machinery pointed at one subject:
what this NPC has observed about you, derived from facts whose provenance
is their own witnessing or a shared activity. Structured and queryable, so
it drives mechanics and not only prose.

This plan is also where the audit's dead memory fields finally get
consumers: `facts[].category` becomes the interest-matching key,
`episodes[].participants` becomes the transmission and co-memory
mechanism, `emotionalTag` becomes rumination weight.

**Open before this plan is written:** the storage budget for a fact web
that can no longer be a 40-entry FIFO; whether distortion on transmission
is modelled or only confidence decay; how facts are retired without losing
the ones that define a relationship; whether inference runs deterministically
or piggybacks an LLM call.

---

## Plan 5 — NPC Initiative & Social Verbs *(thesis only)*

The payoff. Every language beat in the game today except two adult-content
interruptions is initiated by the player.

NPCs gain the ability to open: approach you in a room, knock on your door,
text you about something real rather than one of seven hardcoded strings,
propose an activity. Each of these is a committed intent from Plan 3,
motivated by an epistemic or emotional state from Plan 4 — an open
question, an unresolved grievance, a need, something they just perceived.

And the social verb list expands to give the player things to *do with*
someone rather than *at* them: hang out, cook together, play games, watch
something. These matter mechanically because they are the acts that
generate the observations Plan 4 turns into knowledge. Shared time is the
input; being known is the output.

**Open before this plan is written:** how an NPC-initiated approach
interacts with whatever the player is currently doing; whether refusal has
a cost; how often is too often.

---

## Dependency order

```
Plan 0 (correctness) ──► everything
   │
Plan 1 (signals) ──┬──► Plan 2 (scene reader — consumes signals as prose + HUD)
                   └──► Plan 3 (cognition — consumes signals as NPC input)
                             │
                             └──► Plan 4 (knowledge — perception becomes belief)
                                       │
                                       └──► Plan 5 (initiative — belief becomes action)
```

Plan 2 and Plan 3 both depend only on Plan 1 and are independent of each
other; either may run first. Plan 2 is scheduled first because the log is
the thing most in the way of enjoying the game.

Plan 0 is small enough to land inside a single session and **must**
precede Plan 4 in particular — building a knowledge web on top of a memory
layer that evicts by FIFO and writes its transcript backwards would bake
both defects in permanently.

---

## Design invariants

These outlive the roadmap. Numbered `RI` to keep them distinct from any
single plan's invariants.

1. **RI1 — A signal nobody can perceive must not exist.** Every emitter
   needs a perceiver, and every perception needs an observable
   consequence. The NPC audit found 34 fields with no consumer; the
   signal layer is a much easier place to make that mistake at scale,
   because physics is fun to write and consumers are not.

2. **RI2 — Never let the tick loop become async.** `resolveTick` and
   everything it calls is synchronous and model-free. `applyEffects` was
   built under this constraint, `evaluateDrives` inherits it, and the
   perception layer must too. The moment one signal emitter awaits
   something, the whole autonomy layer becomes unschedulable.

3. **RI3 — Derived, never stored, wherever it is derivable.** Room
   ownership, privacy and NPC presence are already computed on demand,
   which is why a move-out cannot leave a stale owner behind. Perceived
   signal sets and player-model summaries follow the same rule: if it can
   be recomputed from state, do not persist it and do not mirror it.

4. **RI4 — Untrusted input goes through a validator; trusted producers do
   not.** Config-authored effects skip `validateEffects`; anything from the
   model does not. Signals emitted by objects and drives are trusted
   producers. Anything a model proposes about perception is not.

5. **RI5 — One writer per surface.** `addLogEntry` is the single writer
   for the session log, which is why the scene and IM paths cannot drift.
   The scene reader, the awareness HUD and the knowledge web each get
   exactly one writer for the same reason.

6. **RI6 — When a field is added, its reader ships in the same phase.**
   See R8. This roadmap exists partly because the last overhaul did not do
   this and left a quarter of the NPC schema inert.
