# Knowledge, Gossip & Rumination

Status: **complete — all five phases implemented and verified, 2026-08-12.**
Design session complete 2026-08-12; all 20 decisions locked (D1–D20).
Phase 1 (the belief record), Phase 2 (Transmission), Phase 3 (Rumination),
Phase 4 (the D13 proof — bridge verified on constructed state; the
open-question occupancy finding resolved, `createThreshold` 0.6 kept as a
longer-horizon feature, measured — see Handoff) and Phase 5 (the Character
Studio) are all implemented and verified. Last updated 2026-08-12.

Companions:
- `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md` (the umbrella — this is Plan 4 of six, and the plan that turns perception into belief. It carries R1–R8 and RI1–RI6, which this plan inherits).
- `src/ref/complete/perception-and-signals-plan.md` (Plan 1 — **complete**. What an NPC perceives is the raw material this plan converts into facts with provenance).
- `src/ref/complete/npc-cognition-plan.md` (Plan 3 — **complete**. `npc.pursuit` is where rumination's output will eventually become initiative, in Plan 5; its `COGNITION` tuning discipline is the model for this plan's constants).
- `src/ref/complete/scene-reader-ui-plan.md` (Plan 2 — **complete**. The scene line and conversation pane are the surfaces gossip can become visible on; `recallSceneExchanges` is the precedent for the player's view of NPC-held knowledge).
- `src/ref/complete/npc-correctness-fixes-plan.md` (Plan 0 — **complete**. Owns the memory tiers this plan extends and the dead-field disposition table whose remaining fields this plan finally gives consumers).

Paired session prompt: `src/ref/complete/knowledge-gossip-handoff-prompt.md` — hand
that to an agent verbatim each session; it holds *how to work*, this holds
*what to build*.

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session — see
`src/ref/patterns/PLAN-ARCHITECTURE.md` for the session protocol.

---

## Handoff — read this first

**RESUMED AND COMPLETED (2026-08-12).** Phase 5 (the Character Studio —
D12/D16/D17) is done, verified and recorded below; every phase of this plan
is now Done. The plan and its paired prompt moved to `src/ref/complete/` in
the same step (house rules 3 and 4); the indexes in `src/ref/README.md`,
`src/ref/structural/ARCHITECTURE.md` and the SENSORY-AND-SOCIAL-ROADMAP Plan 4
row were updated with it.

**What Phase 5 shipped.**
- `validateNpcField(path, value)` (state.js, pure) — D17's schema-guarded
  single-field writer. Paths are dotted with `[n]` for array elements
  ('bible.interests[0].name', 'relPlayer.grievances[0]'). Resolves against
  CHARACTER_SCHEMA (config.js) — the SAME schema `validateCharacter`
  validates whole bibles against, so Edit Mode and saves can never disagree.
  Two resolver details that cost debug passes: the bible root is a FIELD MAP
  (CHARACTER_SCHEMA.bible is not itself a spec node with type/fields — the
  keys ARE the fields), and a segment like 'grievances[0]' is ONE token
  (key + index), not two. Returns { ok, value } normalized (maxLength
  truncates, itemFields defaults filled) or { ok:false, error } (ranges /
  enums / types / maxItems rejected, never coerced). Nullable fields accept
  null. Supports memory-fact paths for completeness; the UI only offers
  fields that cannot break the knowledge web (D22).
- Profile mode in the studio (render.computer.js) — D12/D16.
  `renderRoomListStudio` now dispatches on `classifieds.studio.mode`:
  'create' (the existing draft builder, unchanged), 'list' (every NPC in the
  game, residents first, grouped), 'profile' (a character's tabs). A stale
  viewingNpcId falls back to the list, never a dead tab. Tabs: **Personal**
  (identity / temperament / personality / occupation / speech / interests /
  values / narrative / prose), **Appearance** (every physical field incl.
  typicalAttire + voice), **Gallery** (three `char_${genSeed}_*` portraits
  through `getCharacterImage` — its FIRST reader; first view generates,
  then IMAGE_CACHE), **Relationship** (relPlayer axes + derived phase/
  intimacy shown read-only + grievances), **Memory** (via
  `buildMemoryProfileView`, below), **More Details** (everything mechanical:
  ids, residency, mood, needs, schedule, counters, contactKnown,
  socialCircle, suspicion, flags, inventory — read-only by design). The
  editable tabs are driven by STUDIO_TABS (render.computer.js) so the tab
  contents and the validator literally share one schema.
- `buildMemoryProfileView(npc)` (npc.js, pure) — the R8/RI6 reader for
  every field of the extended fact record (provenance/confidence/salience/
  pinned/emotionalTag/factId/day/importance/category/valid), the episodes,
  recent exchanges, summary, and the open-question records; it also includes
  `derivePlayerModel` and `topOpenQuestion` — the consumers the lifecycle
  already named. The Memory tab renders from it; the DOM half is a
  projection with no logic.
- Edit Mode (D17). `studio.editMode` swaps Personal/Appearance/Relationship
  from read-only rows to schema-driven inputs (text / number / select /
  pool picker / textarea per spec). Save collects inputs + pool selections,
  validates EACH via `validateNpcField`, applies valid ones, REFUSES invalid
  ones (error logged, field untouched), skips no-op writes, and bumps
  `bibleRevision` ONCE per save — one revision per pass, one `bibleChanges`
  entry per actually-changed field (D21). Derived relPlayer fields recompute
  via `deriveConversationPhase` (D17: read-only derived, recomputed, never
  written). Pool-backed fields snapshot the current values on entering Edit
  Mode so toggles add/remove against what the character holds; interests/
  values rebuild as schema items from their pools (D23).
- Handlers: `doClassifiedsStudioSetMode/SetTab/EditToggle/EditDiscard/
  EditPool/SaveEdits` (ui.computer.js) + their cases in ui.js. Navigation
  state lives in `classifieds.studio` (mode/viewingNpcId/tab/editMode/
  editSelections) — never the DOM, and never touching `studio.draft` (the
  top-of-phase check, asserted in the harness). `studioDefaultState()`
  (render.computer.js) is the read-side fallback for pre-Phase-5 saves
  (normalizeComputerState replaces the whole studio object, so the new keys
  are not migrated by FOLDER_VERSIONS). The four pre-existing studio
  handlers were switched to `studioState()`/`rerenderStudio()` so the shared
  surface also re-renders on the phone shell. New actions route through
  handleAction and are subject to the existing energy gate like every
  computer-app action (consistent, not a new behavior).
- ?v bumps in index.html: state.js 34, npc.js 24, computer.js 39,
  render.computer.js 30, ui.js 57, ui.computer.js 28.

**Verification.** Harness in scratch/verify-k5.js (ephemeral — the verdict
is the record; ~60 assertions, all code assertions passing; the only
failures during the run were 6 bugs IN the harness itself — a profile:null
id, F-section checks run in list mode, a lowercase substring check — each
fixed and re-run green). Sections: A validator accept/reject matrix; B
grouped memory view exposes every extended-record field; C save round-trip
(edits apply, the bible still passes validateCharacter, derived recompute);
D navigation state + stale-id fallback + draft untouched; E the edit-mode
save path through the REAL handlers (valid applies, revision bumps once,
no-op saves nothing, invalid refused); F surfaces (list rows, memory flags,
more-details mechanics, gallery wiring). Browser: the studio was driven
live through the real data-action click path; the rendered edit-mode screen
was vision-verified on a forced 1080×900 layout (the live preview iframe is
~28px wide — too narrow to judge) — a coherent dark editor: mode bar,
profile header, action buttons, six-tab bar, schema inputs, no overlaps or
clips beyond normal scrolling. R2 held — nothing in this phase runs inside
the tick.

**The feel test's proxy.** The plan's browser feel test cannot run at real
size (no dev-harness.html, iframe ~28px wide), so the feel judgement is the
vision-verified forced-layout screenshot plus the DOM assertions, per the
session protocol ("feel judgements with assertions as their proxy").

**Deviations from the plan (deliberate, verified).**
- Memory/Gallery/More Details are read-only studio surfaces; Edit Mode
  covers Personal/Appearance/Relationship only (D22). The validator still
  SUPPORTS memory-fact paths; the UI just never offers them.
- One revision per save pass and no-op writes skipped (D21) — the plain
  "log every write" reading of the revision fields was measured fabricating
  33 changes for one 33-input pass before the fix.
- Object arrays edit through pools (D23); interests/values rebuild from
  their pool items (tags/opposition preserved; skill resets to schema
  default 0 — no gameplay writer sets interest skill today).
- The phone-parity `rerenderStudio` line touches the four pre-existing
  studio handlers — same shared surface, one line each, no behavior change.
- No `src/ref` Evidence figure in any other plan moved; no population
  measurement was needed (Phase 5's verification is harness + DOM, not a
  tuning-number run).

**Test hygiene.** The harness mutated then RESTORED its test NPC (Del
Connors) to his authored CONTRACTOR_BIBLE values (age 54, authored traits,
bibleRevision 0, empty bibleChanges) and re-saved; energy/computer power/
windows were restored to their pre-test state. No player-visible residue.

**Nothing resolved from `## Open questions`** — the four parked questions
(trust-modulated confidence, contradictory facts, third-party overhearing,
day-0 shared-history transmission) are parked on grounds outside this
plan's scope and remain parked. Phase 5's own decisions are locked as
D21–D23.

**Blockers / flagged deviations:** None. The pre-existing relDelta
merge-loss bug (flagged by Phase 2, `processNpcRelDeltas` writes to
`gameState.npcs[a]` clobbered by resolveBatch's merge) remains live and out
of scope.
## The thesis

An NPC's knowledge today is a flat list of text facts with no provenance, no
confidence, no transmission, and importance-only eviction. Nobody learns
anything from anybody: Allen can watch the player help Carrie move her boxes
every evening for a week and no fact exists that connects the three of them.
The perception layer (Plan 1) gave NPCs senses; the cognition layer (Plan 3)
gave them the ability to act on what they sense. This plan gives them a memory
that *says where a thing was learned and how much to trust it* (R5), a way for
facts to *travel* — through actual conversation events, never by osmosis (R6)
— and an offscreen *rumination* pass that turns what they hold into open
questions. The open question is the bridge: it is the reason Plan 5's NPC will
walk up to you and say *"Hey, Allen mentioned X and I wanted to ask you more
about it."*

The player model (R7) is the same machinery pointed at one subject — what this
NPC has observed *about you*, derived from beliefs whose provenance is their
own witnessing or a shared activity — so the game can stop pretending NPCs
know things they have never plausibly learned.

And all of it must be *visible* or it is dead content with a physics flavour
(RI1). The Character Studio — today a create-a-character builder — becomes the
unified record of everything stored on a person: personal details, every
appearance field, their gallery photos, relationship data, and the knowledge
web itself, provenance and confidence on display, editable without the player
being able to corrupt a save.

### What this plan is *not*
- **Not a rewrite of the conversation layer.** The LLM `memoryAdditions`
  proposal path stays the writer for player-facing exchanges; this plan adds
  provenance and confidence onto it, it does not bypass it.
- **Not an LLM fiction engine.** Transmission between NPCs is deterministic
  where the codebase already has the machinery (`npc_chat`); the model
  assists only where a conversation already happens, and rumination only at
  the moment an NPC acts on it (D8).
- **Not Plan 5.** No NPC approaches, knocks or proposes. The one exception is
  D13's minimal proof: an NPC can raise an open question inside a conversation
  the player already started.
- **Not a graph database.** The retrieval surface today is keyword-scored
  prose slices; the plan extends that shape (D14) rather than inventing
  traversal. D14 was locked against the option explicitly.
- **Not a second relationship system.** `relPlayer` axes and
  `compatibility`/`friction` keep their jobs; beliefs *use* them (pinning,
  eviction) but do not replace them.
- **Not distortion.** A fact that changes hands loses confidence, never
  content (D2). "Sam said X and Del misheard it as Y" is a Plan 5 novelism
  nobody asked for here.

## Locked decisions

### The belief record
- **D1 — Provenance is a single string enum on every fact.** `'witnessed' | 'told_by:<npcId>' | 'overheard' | 'inferred'`. The `told_by:` prefix carries the source; no separate `source`/`who`/`when` object. The fiction can always name the last hop. A full retelling chain (Q2C) was considered and rejected as storage without a reader. Semantics: *witnessed* = the NPC directly experienced it, **including hearing the player say it first-hand**; *told_by:<id>* = received through NPC↔NPC transmission; *overheard* = heard without being addressed; *inferred* = produced by D7's rules.
- **D2 — Two numbers, not one: `confidence` and `salience`.** `confidence` (0–1) is how sure the NPC is the fact is true; `salience` (0–1) is how much they care about it right now. **Transmission drops confidence; time drops salience; retrieval uses both.** A week-old witnessed fact is still believed but barely worth raising. Confidence changes by exactly three routes: down on transmission, down at inference, up on re-witnessing — nothing else touches it.
- **D3 — `pinned` protects what defines a relationship.** Granted at write time when importance ≥ `significant` **or** when the fact references a participant the NPC is at `close`/`intimate` phase. Pinned facts never evict; an all-pinned overflow is allowed to exceed budget, the existing day-0 precedent. Eviction score becomes `importance × confidence` (was importance alone).
- **D4 — `facts[].category` is the interest-matching key.** Who a fact can be raised to, and who cares to hear it, is matched on category against the listener's `interests`, combined with D6's personality bias. This is the consumer the correctness-plan audit's disposition table reserved the field for.
- **D14 — The belief record extends `facts[]` in place.** Facts are the durable belief tier (gaining `provenance`, `confidence`, `salience`, `pinned`, `emotionalTag`); episodes stay the decaying event tier (`decay`, `emotionalTag`, `participants`) exactly as they are. No unified belief record, no graph. Every existing reader (`retrieveRelevantMemories`, `buildMemorySliceV2`, `compactMemory`, `applyProposal`) and the whole 432-assertion suite stay valid; this plan edits them, it does not replace them.
- **D15 — Storage budget: facts cap 40 → 60, plus a prompt-display cap.** The display cap exists because the prompt block today joins **all** valid facts (`[Memories — facts]`), so a raised budget costs context per conversation; display becomes pinned + significant always, retrieved-top, then most-recent — a bounded window (`FACT_DISPLAY`, see Data model). 60 is provisional and validated by measurement in Phase 1's fill-rate run: if a 12-household × 7-day population never approaches it, the number is headroom and the Handoff records the observed fill rather than pretending the cap was exercised.

### Transmission (R6: only through conversation events)
- **D5 — Hybrid transmission.** **Deterministic leg:** the existing `npc_chat` drive (drives.js ~455) gains a payload — the speaker raises 1–2 facts they have reason to raise (D6), the receiver stores them with `told_by:<speaker>` and attenuated confidence (D2), and the event carries the raised facts so the scene line can name the topic. Runs inside the tick, synchronous, LLM-free (R2). **Model-assisted leg:** when the player converses with an NPC and other NPCs are present (`context.activeNpcs`), the same `applyProposal` call that writes the speaker's memory also writes what was said to the present listeners. One eligibility check (D6) governs what the *speaker* raises; the same bar is applied to what the model marks notable for overhearing. `episodes[].participants` is the co-memory mechanism (roadmap inheritance): a shared episode is written to every participant.
- **D18 — The model-assisted leg is *overhearing by present NPCs*, with `provenance: 'overheard'`.** Confirmed in the design close; the alternative (the *player* relays facts to NPCs — "tell Carrie what Allen said") is explicitly rejected for now: it needs a UI, a consent rule, and a fact-selection mechanic that belong to social verbs (Plan 5), and R6's "only facts the speaker has reason to raise" has no natural analog for a player standing there. Overheard facts land at slightly reduced confidence (`overheardAttenuation`, Data model) — you might have missed part.
- **D6 — A fact must have *reason* to be raised.** Eligibility score = `recency × emotionalWeight × relevanceToListener`, computed against the speaker's own record; probability of raising scales with the score. **Personality then biases *which* facts qualify:** high-`openness` toward novel/inferred facts, high-`warmth` toward social/relationship facts, high-`conscientiousness` toward practical facts, and a talkativeness term scales overall frequency. A fact learned second-hand (`told_by:`) can be re-raised but is never raised as if witnessed — the honesty the provenance enum exists for. This is the Q7 A+C hybrid, not either alone.\n- **D19 — A conversation fact stays conversational unless its importance is declared.** The model leg writes facts into the speaker's memory with importance clamped to `conversational`; only a fact the model *declares* as `significant` or higher escapes the clamp. Set in Phase 2 after Phase 1's fill-rate run flagged that every conversation fact was pinning itself (a fact worth `conversational` importance is exactly the kind that re-witnesses in the next conversation, so unpinned re-witnessing is the *intended* fill-growth route).\n- **D20 — The raised fact travels as `{text, provenance}`, never a factId.** Phase 2's `npc_chat` payload and the scene line carry only what the receiving fiction needs; a stable `factId` cross-reference would be a field with no reader yet (R8). The structured fact reference arrives with the open-question lifecycle in Phase 3, which is the first thing that genuinely needs to point at a *specific* held belief.

### Rumination
- **D7 — Deterministic inference is in, via co-occurrence rules.** Rules mint new facts tagged `provenance: 'inferred'` at fixed reduced confidence, from evidence the NPC already holds: repeated shared episodes between the same participants, or repeated episodes sharing a category/tag. Purely arithmetic, runs inside the existing tick, assertable, deterministic (same state → same output). Two rules in Phase 3 (see Data model); a third (contradiction) is parked as an open question.
- **D8 — Hybrid rumination.** The deterministic pass (D7 + open-question lifecycle) runs always and cheaply. **LLM rumination — real reasoning that turns beliefs into open questions — fires only when an NPC is about to act on one**, i.e. at D13's bridge, on the player's time budget. No background model calls. This is the `compactMemory` piggyback pattern applied at the point of use.
- **D9 — The open question is structured *and* rendered.** Mechanics live on `{ topic, factId, curiosity, age, targets }` — a reference to the held belief, a growing `curiosity` score, and *who* that NPC would ask. The prompt-facing line ("Hey, Allen mentioned X…") is rendered text derived from the record at the moment it is spoken. `curiosity` is bounded per NPC (`openQuestionCap`, Data model).
- **D10 — `emotionalWeight` is a config lookup keyed by `emotionalTag`.** Known tags map to a weight in `EMOTIONAL_WEIGHTS` (config.js). No free-floating weight number written by the model; facts backfill the tag field. D6 (Phase 2) is the table's first reader; rumination (Phase 3) is the second.

### The player model (R7)
- **D11 — The player model is derived, never stored.** `derivePlayerModel(npc)` is a pure query over the NPC's beliefs, witnessed episodes and shared activities. R7 holds by construction: there is no new writer to get wrong, and every input was already earned in play. The stored `playerModel` alternative was rejected because it adds a second writer that can drift from the belief store — the exact defect class the audit keeps finding.

### Player-visible surfaces
- **D12 — The Character Studio becomes the unified character record.** The existing create-a-character studio is expanded into a per-character profile for *any* NPC: tab-organized — personal details, every physical-appearance field, gallery photos linked to the character via the `char_${genSeed}_*` portrait key, relationship data, memory/knowledge data. **Everything stored on a character is visible there in some capacity, and Edit Mode lets the player change virtually any value.** Immersion-breaking mechanical detail lives under a **"More Details"** section, kept out of the fiction surfaces. This is the reader for several fields the audit flagged as consumerless.
- **D16 — The studio lives inside the existing roomlist-studio app.** The create-a-character screen gains a "view/edit any character" mode rather than becoming a new app: one home in the classifieds, and a studio-built character ends up in exactly the place its profile lives. Phase 5's detail.
- **D17 — Edit Mode validates against the existing schema.** Every write goes through a schema-guarded validator (numeric ranges, enum membership, type checks — the same constraints `state.js` already declares for NPC fields), so Edit Mode can change any *valid* value but cannot corrupt a save. Derived fields (e.g. `conversationPhase`, `intimacyLevel`) are read-only and recompute from what was edited.
- **D13 — Scope includes one minimal initiative proof.** An NPC with an open question at `raiseThreshold` raises it the next time the player talks to them — a prompt-side change, since the conversation already happens, that closes the loop D8–D9 describe. Physical approaches, knocks and proposals stay in Plan 5.

### The Character Studio (D21–D23, Phase 5)
- **D21 — Edit Mode is a whole-pass, no-op-aware writer.** One save pass validates every collected field through `validateNpcField`, applies the valid ones, refuses the invalid ones (logged, never coerced), skips fields whose value is unchanged, and bumps `bibleRevision` **once per pass** — not once per field. Measured on the harness: a 33-input save pass logged 33 changes before this decision (the same bug in both directions the correctness plan kept warning about); after it, a one-field edit is one revision and one `bibleChanges` entry.
- **D22 — Edit Mode covers the fiction-facing tabs only.** Personal, Appearance and Relationship are editable; Memory, Gallery and More Details are read-only surfaces. Memory edits would risk breaking the open-question lifecycle's `factId` references (a corrupt-adjacent edit exactly where D17's "cannot corrupt a save" is the guarantee); `validateNpcField` still *supports* memory paths for completeness, the UI just never offers them. D12's "virtually any value" is honoured everywhere a schema-valid edit cannot break the knowledge web.
- **D23 — Pool-backed fields edit through the create-mode pools.** Traits/quirks/likes/dislikes/interests/values toggle against the same pools the draft builder uses (`studioPoolFor`, render.computer.js); interests/values rebuild as schema items from their pool entries (tags/opposition preserved, skill at the schema default 0 — no gameplay writer sets interest skill). The pool is the game's own vocabulary for these fields, so a value outside it cannot be entered — the D17 spirit applied to open-text lists.

## Data model

### The extended fact record (D14, Phase 1)
```js
// facts[] item — existing fields plus five additions (all backfilled):
{
  text: 'Allen mentioned he's job-hunting',
  day: 3,
  importance: 0.5,          // existing
  category: 'work',         // existing — becomes the interest key (D4)
  valid: true,              // existing
  // new — Phase 1:
  provenance: 'witnessed',  // D1: 'witnessed'|'told_by:<id>'|'overheard'|'inferred'
  confidence: 1.0,          // D2: 0..1
  salience: 0.5,            // D2: 0..1
  pinned: false,            // D3
  emotionalTag: '',         // D10 — EMOTIONAL_WEIGHTS key
}
```

### Tuning tables (config.js, `BELIEF` etc.)
```js
const BELIEF = {
  maxFacts: 60,                 // D15 — provisional, measure in Phase 1
  hopAttenuation: 0.8,          // D2 — told_by hop: confidence × 0.8
  confidenceFloor: 0.3,         // D2 — below this, still stored, never raised
  overheardAttenuation: 0.9,    // D18 — overheard: confidence × 0.9
  salienceDefault: 0.5,
  salienceDecayPerDay: 0.05,    // D2 — time drops salience
  salienceFloor: 0.02,
};
const FACT_DISPLAY = {          // D15 — the prompt's [Memories — facts] window
  always: true,                 // pinned + importance >= significant, always shown
  retrieved: 5,                 // top keyword matches
  recent: 8,                    // most-recent valid facts, after the above
  maxTotal: 20,
};
const EMOTIONAL_WEIGHTS = {     // D10 — first reader is D6 (Phase 2)
  grievance: 0.9, argument: 0.85, romance: 0.8, embarrassment: 0.7,
  success: 0.6, failure: 0.6, warmth: 0.5, domestic: 0.3, default: 0.3,
};   // exact values authored in Phase 2; tags the model uses come from this key set
const TRANSMISSION = {          // D5/D6 — Phase 2
  factsPerChat: 2,              // speaker raises 1–2 facts per npc_chat
  recencyHalfLifeDays: 3,       // D6's recency term
  talkativenessBase: 0.15,      // D6 probability floor
};
const RUMINATION = {            // D7/D8/D9 — Phase 3
  intervalTicks: 12,            // per-NPC cadence inside resolveTick (48 ticks/day)
  inferenceWindowDays: 7,       // D7 co-occurrence window
  inferredConfidence: 0.5,      // D7
  curiosityStart: 0.2,
  curiosityPerRun: 0.05,        // scaled by emotionalWeight × openness
  curiosityCap: 1.0,
  raiseThreshold: 0.5,          // D13 bridge trips at this
  expireAfterDays: 14,          // curiosity 0 → question retires
  openQuestionCap: 3,           // D9 bound per NPC
};
```

### The open question (D9, Phase 3)
```js
// npc.memory.openQuestions[] — one per NPC, bounded by openQuestionCap:
{
  topic: 'Allen mentioned a new job',
  factId: 4,                // index/id of the held belief it points at
  curiosity: 0.35,          // 0..1; grows on each rumination pass
  age: 1,                   // in-game days; staleness drives expiry
  targets: ['allen'],       // who this NPC would ask — matched on D4
}
```

### derivePlayerModel (D11, Phase 3)
```js
// Pure function; never stored. Reads beliefs + witnessed episodes + shared activities.
//   { observes: [...], shared: [...], derivesFrom: [...], honesty: <mean confidence> }
```

### npc_chat payload (D5, Phase 2)
```js
// The npc_chat event gains:
{ ...existing, data: {
    other: otherId,
    topic: 'the new job',                      // rendered into the scene line
    raised: [{ text, factId, provenance }],    // what actually moved
  } }
```

## Implementation phases

### Phase 1 — The belief record
**Goal:** every fact carries `provenance`, `confidence`, `salience`, `pinned`, `emotionalTag`; legacy entries are backfilled; eviction and retrieval run on the new numbers; the prompt's fact window is capped so the raised budget does not grow context. Nothing transmits yet — behaviour is otherwise unchanged, which is what makes Phase 2's diffs attributable.

**Files:**
- `src/srcfiles/npc.js`: extend `addMemoryFact` to accept and store the five new fields (with D3's pinning rule and D1's provenance semantics); `migrateNpcToV2` backfills legacy bare-string/partial facts (`provenance: 'witnessed'`, `confidence: 1.0`, `salience: BELIEF.salienceDefault`, `pinned` per D3, `emotionalTag: ''`); `evictLowestScored`'s fact score becomes `importance × confidence` with pinned exempt; `retrieveRelevantMemories` and `buildMemorySliceV2` rank by `importance × confidence × salience` (D2) and apply `FACT_DISPLAY`.
- `src/srcfiles/config.js`: `BELIEF` + `FACT_DISPLAY` tables.
- `src/srcfiles/state.js`: the five fields in the fact `itemFields` schema.
- `src/srcfiles/llm.js`: `buildMemorySliceV2` renders `[Memories — facts]` through `FACT_DISPLAY` instead of joining all facts.
- `dev/verify/verify-k1.js`: the harness.
- **Top-of-phase check:** the facts budget change (40→60) is the first edit, and `measure-cognition.js` is run *before* it to confirm the population still reproduces its Evidence numbers — if the baseline has moved, that is the first finding, not a side quest.

**Verification:** harness — migration backfills every legacy shape (bare string, partial object, v2 object); the invariant "every fact has provenance and confidence" is asserted over a generated population; pinned facts survive an eviction storm and an all-pinned overflow is allowed; eviction drops lowest `importance × confidence` first; retrieval ranks by the D2 product; `FACT_DISPLAY` holds at the cap (seed 80 facts → at most `maxTotal` out); and the **fill-rate measurement** on the 12×7×3 population records the real max fill against the 60 cap (D15's promise) — the number, and the verdict "exercised vs headroom", go in the Handoff. R2 held: `generateText` stubbed to throw during the whole run, 0 calls.

### Phase 2 — Transmission
**Goal:** facts move. `npc_chat` carries a payload (D5 leg 1), conversations are overheard by present NPCs (D18), both honour D6 and D4, confidence attenuates on the way (D2), and the raised fact is visible in the scene line.

**Files:**
- `src/srcfiles/config.js`: `EMOTIONAL_WEIGHTS` (D10 — first reader is D6) and `TRANSMISSION`.
- `src/srcfiles/npc.js`: `pickFactsToRaise(npc, context, count)` — pure, returns candidates scored by `recency × emotionalWeight × relevanceToListener` with the D6 personality bias and D4 category matching; the receiver-side write (`addMemoryFact` with `told_by:<id>`, confidence × `hopAttenuation`, floored). The `applyProposal` overhearing leg: after `memoryAdditions` writes an active NPC's facts, present listeners (`context.activeNpcs`) receive the same facts with `provenance: 'overheard'` and × `overheardAttenuation`.
- `src/srcfiles/drives.js`: the `npc_chat` drive calls `pickFactsToRaise` for its chosen speaker, writes the partner's memory, and extends the event with `data.raised`/`data.topic`.
- `src/srcfiles/scene.js` / `render.js`: the `npc_chat` scene line names the topic when a fact moved ("{name} and {other} were chatting about the new job") — authored phrase, R1-compatible.
- `dev/verify/verify-k2.js`.
- **Top-of-phase check:** the "can a raised fact leave an NPC's memory on the very tick it is written" edge — the receiver's write happens mid-tick, so the cooldown stamps (`isOnCooldown`) and any same-tick re-read must see a consistent record. Follow the `resolveBatch` returns-new-state discipline from the cognition plan.

**Verification:** harness — a transmitted fact lands with `told_by` and `confidence × 0.8`; three hops reach the floor and stop decaying; overhearing writes only NPCs present in the conversation (assert an NPC in another room learns nothing — the no-osmosis assertion, R6); a fact with no recency/weight/relevance is never raised (D6's negative case); a `told_by` fact is re-raisable but never re-raised as `witnessed`; the event carries `data.raised` and the scene line names the topic. Population run: record the gossip rate (npc_chat events that moved at least one fact) on the 12×7×3 population, and confirm the per-chat fact budget holds. R2 held under the stub.

### Phase 3 — Rumination & open questions
**Goal:** deterministic inference (D7) mints inferred facts; a cheap periodic pass creates, ages and expires open questions (D9) using emotional weight (D10) and personality; everything bounded and deterministic. No LLM in this phase.

**Files:**
- `src/srcfiles/rumination.js`: **new**, loaded after `npc.js`, pure (no DOM, no model): `ruminate(npc, gameState, day)` returning the updated NPC or `null`-no-op. D7 rules (co-occurrence of participants → "X and Y spend time together", confidence 0.5, category 'relationship'; repeated same-category/tag episodes → "this keeps happening", confidence 0.4, category derived) written through `addMemoryFact` with `provenance: 'inferred'`, deduplicated against the speaker's existing facts. The open-question lifecycle: create on a low-confidence (`confidence ≤ 0.6`) fact the NPC finds interesting (category × interests × personality), `curiosity += emotionalWeight × openness × curiosityPerRun` per pass, `age` per day, retire at zero after `expireAfterDays`; `targets` matched on D4 (who holds a fact on the same category/topic). This lifecycle *is* the in-phase reader of `openQuestions` (R8): the record is added and read here, and its purpose-reader (D13's bridge) is declared as a named consumer, the NOTE_TEMPLATES precedent.
- `src/srcfiles/sim.js`: `resolveTick` runs `ruminate` per NPC every `RUMINATION.intervalTicks`, staggered by npcId hash — synchronous, pure, measurable.
- `src/srcfiles/npc.js`: `derivePlayerModel(npc)` (D11).
- `src/srcfiles/config.js`: `RUMINATION` table.
- `src/srcfiles/state.js`: `memory.openQuestions` schema (array of the D9 record).
- `dev/verify/verify-k3.js`.

**Verification:** harness — same state → identical rumination output (determinism); the two inference rules mint expected facts with `provenance: 'inferred'` and the fixed confidence, and never duplicate an existing fact; open questions appear for low-confidence-interesting facts and not for high-confidence ones; `curiosity` grows and the record retires at the expiry rule; the cap holds under a fact storm; R2 held (stub). Cost measured on the population run: rumination must stay sub-millisecond per NPC-tick like perception did (Plan 1 measured 0.21ms); the number goes in the Handoff.

### Phase 4 — The proof (D13)
**Goal:** an NPC holding an open question at `raiseThreshold` raises it the next time the player talks to them. The loop closes with no new systems — the conversation already happens, this phase just points it at the open question.

**Files:**
- `src/srcfiles/npc.js`: `topOpenQuestion(npc)` — pure, returns the highest-`curiosity` record at/above threshold or null.
- `src/srcfiles/llm.js`: the NPC block (or dialogue instruction) gains a bridge line when `topOpenQuestion` is non-null: "You've been wondering about X — raise it naturally in the next few exchanges, mention {targets} by name." This is D8's LLM-at-moment-of-use: the model renders the D9 text, on the player's time budget, in a call that was going to happen anyway.
- `dev/verify/verify-k4.js`.
- **Top-of-phase check:** the `activeNpcs`/`ambientNpcs` split in `assembleContext` — the bridge must only fire for NPCs actually in the conversation, or an ambient NPC's open question leaks into a scene line.

**Verification:** harness — `topOpenQuestion` returns the right record and `null` below threshold/with none; `buildNpcBlockV2` output contains the bridge instruction iff threshold met (asserted on the assembled block, the pure half); `generateText`-stub asserts no LLM call off the conversation path. Browser feel test on `dev-harness.html`: talk to an NPC holding an open question and confirm they raise it naturally rather than dumping it on exchange one.

### Phase 5 — The Character Studio (D12/D16/D17)
**Goal:** roomlist-studio becomes the unified per-character record. Every stored value on any NPC is visible and most are editable, edits are schema-safe, and the knowledge web is inspectable for the first time.

**Files:**
- `src/srcfiles/computer.js` + `src/srcfiles/render.computer.js`: expand `renderRoomListStudio` with a profile mode for any existing NPC (resident or visitor): tabs — **Personal** (bible: personality, occupation, interests, speech, values), **Appearance** (every physical field), **Gallery** (portraits via the `char_${genSeed}_*` key through the image cache), **Relationship** (relPlayer axes, conversationPhase, grievances), **Memory** (facts with provenance/confidence/salience/pinned, episodes with tags, recent exchanges, summary, open questions), **More Details** (everything mechanical the fiction never shows: schema types, derived values read-only, cooldowns, ids). Navigation state in the app object, never the DOM (the house pattern).
- `src/srcfiles/state.js`: `validateNpcField(path, value)` — the schema-guarded writer Edit Mode routes through (D17); reads the same ranges/enums the save validator uses so Edit Mode and saves can never disagree.
- `src/srcfiles/npc.js`: any pure readers the tabs need that do not already exist (e.g. a grouped memory view over the extended records).
- `dev/verify/verify-k5.js` (the validator) plus the browser for the DOM surface.
- **Top-of-phase check:** the studio already ships an AI-create flow (`studio.aiBusy`, `buildStudioNpc`) — the new profile mode must not entangle with the draft-builder state (`studio.draft`), or a saved game's residents and an in-progress draft share a struct and clobber each other.

**Verification:** harness — `validateNpcField` rejects out-of-range and enum-violating edits and accepts valid ones; a save round-trips through the validator after edits; the grouped memory view renders every field of the extended record (the R8 assertion: nothing the studio shows is a field nobody reads). Browser — open the studio, view a resident, edit a valid value, confirm the fiction surfaces still render it (scene line, moodle), and confirm More Details holds the mechanical data and Edit Mode cannot produce a corrupt save.

## Status — **COMPLETE** (all five phases done, 2026-08-12)

| Phase | Status | What it does |
|---|---|---|
| 1 | Done | The belief record: `provenance`/`confidence`/`salience`/`pinned`/`emotionalTag` on facts, migration, eviction + retrieval on the new numbers, `FACT_DISPLAY` cap, cap 60 measured (verdict: headroom) |
| 2 | Done | Transmission: `npc_chat` payload (D5 leg 1), overhearing (D18), D6 reason-to-raise, confidence attenuation, scene line names the topic — gossip rate 52.8% measured |
| 3 | Done | Rumination: D7 inference rules, open questions (D9), emotional weight (D10), `derivePlayerModel` (D11), all deterministic in-tick — occupancy 0 on the 7-day population (see Handoff); cost 0.0003ms/resident-tick |
| 4 | Done | The D13 proof: `topOpenQuestion` + the prompt bridge line in `buildNpcBlockV2` (scene + IM); ambient split verified; lifecycle→bridge→re-witness integration asserted — 34/34 harness assertions; occupancy finding resolved (createThreshold 0.6 kept, longer-horizon; sensitivity measured) |
| 5 | Done | The Character Studio: per-character profile (D12) inside roomlist-studio (D16) with schema-safe Edit Mode (D17) — `validateNpcField`, `buildMemoryProfileView`, the grouped tabs, D21–D23 locked — ~60 harness assertions + vision-verified DOM surface |

## Dependency order

```
Phase 1 (belief record) ──► everything
   ├──► Phase 2 (transmission)
   ├──► Phase 3 (rumination) ──► Phase 4 (the proof)
   └──► Phase 5 (studio)              (independent after 1)
```

**Phase 1 before anything, always** — the record is the computed thing
everything else reads, and Phase 2's diffs are only attributable if Phase 1
changed nothing behavioural. **Phases 2 and 3 are independent of each other**
(both consume only Phase 1) and may run in either order; Phase 4 needs 3, and
Phase 5 needs only 1 and is normally last because it is the review surface for
everything else's data.

## Open questions (parked, none blocking)

- **Trust-modulated confidence.** A player-told fact currently lands at full confidence (D1's *witnessed* includes first-hand hearing). If lying ever becomes a mechanic, a player-told fact should start lower or scale with `relPlayer.trust`. Default for now: full. Decide never before Plan 5.
- **Contradictory facts.** An NPC can hold "A told me X" and "B told me not-X". D7 has no rule for it; when it surfaces, rumination has a natural third rule (a doubt, not a new fact). Parked until the two-source case is observed. Phase 2's 40 transmitted facts produced no contradiction — not surprising at 0.75 facts/chat, and the parked status is now upstream of Phase 3's contradiction-free data.
- **Third-party overhearing of `npc_chat`.** The deterministic leg writes only the addressed partner; a third NPC in the same room does not overhear NPC↔NPC chat (overhearing exists only on the model leg, D18). **Phase 2 verdict: no new channel needed.** Measured on the 12×7×3 population (seeds 1–12): 28/53 npc_chats (52.8%) moved ≥1 fact, 40 facts total, the maxPerChat budget of 2 never overflowed. Gossip is not too quiet, so the cheapest next channel stays parked. Revisit only if a later phase's changes measurably lower the rate.
- **`episodes[].participants` and day-0 shared history.** The roadmap names participants as the co-memory mechanism; Phase 2 writes shared episodes per participant, but the day-0 seeded episodes are explicitly exempt from eviction and decay. Whether a day-0 shared episode should *transmit* its facts is undecided — default no, shared history is ambient, not gossip. Unchanged by Phase 2.

## Design invariants

*Inherited from the roadmap and repeated because this plan is where most are at
risk: R2 (tick stays synchronous, pure, LLM-free), R5 (provenance + confidence,
always), R6 (no osmosis), R7 (player knowledge earned in play), R8/RI6 (no
field without its reader in the same phase), RI2 (never async the tick).*

1. **The tick stays synchronous, pure and LLM-free** (R2, RI2). Deterministic transmission (D5 leg 1), inference (D7) and the open-question lifecycle (D8's deterministic half) run inside `resolveTick`. The LLM is invited back only at the moment of use — D13's bridge, on the player's time budget.
2. **Every fact carries provenance and confidence, always** (R5). A bare-string fact is a schema violation by the end of Phase 1; the migration backfills `'witnessed'`/1.0 for legacy entries and the harness asserts the invariant forever after.
3. **Provenance is written once, at storage time, and never rewritten.** A fact that changes hands becomes a *new* record in the receiver's memory; the source record is never edited. Confidence is rewritten by exactly D2's three routes and nothing else. This is what keeps provenance honest — a rewritten provenance is a lie by edit.
4. **Knowledge does not travel by osmosis** (R6). Two NPCs sharing a room transmits nothing; `npc_chat` payloads and `activeNpcs` overhearing are the only channels, and both pass D6. The no-osmosis assertion is the harness guard.
5. **What an NPC knows about the player is earned in play** (R7) — D11 makes this true by construction, not by convention.
6. **No field without its reader in the same phase** (R8, RI6). `pinned`, `confidence`, `salience`, `provenance`, `emotionalTag`, `openQuestions` and `curiosity` each get their reader in the phase that adds them (the open-question lifecycle is Phase 3's reader for `openQuestions`; D13's bridge is its declared consumer). The studio (Phase 5) is where the audit's long-orphaned fields finally get theirs.
