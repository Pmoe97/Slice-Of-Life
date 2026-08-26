# AI-Assisted Character Generation

Status: **in progress — Phases 1–5 built and verified.** Design session
complete 2026-08-26; all decisions locked. Phases 1–5 implemented and verified
the same day. Next: **Phase 6** (live-character rewrite), then Phase 7, which
is now mostly done — see its row in the Status table.
Last updated 2026-08-26.

Companions:
- `src/ref/complete/player-creation-and-intro-plan.md` (built the Player
  Design studio — `PLAYER_STUDIO_TABS`, `openStudio`/`renderPlayerStudio`,
  `blankStudioDraft` — which is one of the five surfaces this plan adds the
  Describe section to. This plan does not change what any studio field
  *means*, only how a draft can be filled and what kind of value a control
  will accept).
- `src/ref/complete/sandbox-editor-overhaul-plan.md` (built the sandbox
  roommate editor — `pendingSandboxConfig`, the roommate `partial` shape,
  `roommateAuthoredFields`, `sbxSelectControl` — a second surface this plan
  touches. Its D19 guard on `applySandboxPreset` is untouched here: a concept
  fill writes `partial`, never day fields).
- `src/ref/complete/seasonal-calendar-and-sandbox-plan.md` (authored
  `authoredFields` and `mergeProseIntoBible`'s prefix-match lock — B1/D12.
  This plan's D9 is built entirely on that mechanism and adds no second
  merge point).
- `src/ref/complete/npc-overhaul-plan.md` (authored the bible, the
  `rollCastSlot` partial contract, and the structured-draw → prose-expansion
  split this plan inverts for one code path).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session — see
`src/ref/wip/ai-character-generation-handoff-prompt.md` for the full session
protocol.

---

## Handoff — read this first

**Resume at:** **Phase 6** — the live-character rewrite, the only surface left.
Phases 1–5 are built and verified, and Phase 7 is all but done (its portrait
prompt landed in Phase 4, its D4 resolver cleanup in Phase 1; only the
move-to-`complete/` doc pass remains).

**Phases 4 + 5 notes (2026-08-26):**

Both pre-game surfaces are live. Phase 4 put the section in the Player Design
studio (`#ps-concept`, above the tab strip, since one description fills fields
across every tab), covering **both** `openStudio` subjects: the player
(`player` scope — identity + appearance + portrait prompt) and the sandbox's
"Design appearance" NPC subject (`npcAppearance` scope — appearance only,
verified to leave `name`/`age` alone even when the model volunteers them).
Phase 5 put it on the sandbox roommate detail head, above all five sub-tabs.
New identifiers: `studioConceptScope`, `doStudioConceptToggle`,
`doStudioConceptGenerate`, `applyConceptToStudioDraft` (studio.js);
`doSandboxConceptToggle`, `doSandboxConceptGenerate` (menu.js); verbs
`studio.concept-toggle` / `studio.concept-generate` /
`sandbox.concept-toggle` / `sandbox.concept-generate`, all four registered in
**both** ui.js action lists (design invariant 1).

**The deviation that matters — Handoff note 4 is now WRONG, deliberately.**
It said `partial.speech`/`partial.personality` must go through
`buildStudioNpc`'s post-roll patch rather than becoming partial keys. That was
right when the Character Studio was the only consumer. It is wrong now: the
sandbox path runs straight through `generateCast` → `rollCastSlot` and has no
such seam, so a described roommate's quirks, speech and prose were being
dropped on the way into a started game. `rollCastSlot` therefore now honours
`partial.personality`, `partial.speech`, `partial.history`, `partial.sketch`,
`partial.sampleLines` and `partial.visual` — merged per key over the rolled
values, drawing no randomness, determinism re-verified byte-identical. The
post-patch in `buildStudioNpc` still exists and is now redundant; leaving it is
harmless (same values, applied twice) and removing it is a tidy-up for
whoever next touches that function.

**Two connected bugs this exposed, both pre-existing and both now fixed:**

1. **`applySandboxRoommateProse`'s `fillFallback` ignored `authoredFields`
   entirely** (ui.js) — it overwrote `visual`/`history`/`sketch`/`sampleLines`
   unconditionally. Harmless while nothing in the sandbox could author them;
   silent data loss the moment a concept fill could, since a filled roommate
   defaults to `skipProse` and would have had its written history replaced by
   a template. `name` already had the right shape (`b.name || …`); the other
   four now match it.
2. **`roommateAuthoredFields` had no cases for `personality`, `speech`,
   `history`, `sketch`, `visual` or `sampleLines`** — the rule ("presence in
   the partial IS the authored set") was fine, those keys simply had no
   producer before. Added.

**Verified (Phases 4 + 5), live against a real started game:** the player fill
keeps a hand-typed `name` and `physical.hair.color` while filling everything
else, Replace-mode overwrites both, off-pool values display in the form
(including an off-pool distinguishing feature as an active chip), Roll
Everything fills only the gaps the fill left, and the draft survives
`buildPlayerDraftForNewGame` → `generatePlayerAppearance` with a consistent
derived `heightBuild`. On the sandbox side: three roommates described in one
sentence each come out distinct, each keeps its own description when you
switch between them (state lives on the roommate record, not module-level),
`skipProse` auto-flips to templated (D9), and — the decisive check — starting
the game with `root.generateText` stubbed to **throw** completes with
**0 calls** and yields three valid residents carrying their novel job titles
(with real `SCHEDULES` keys and the model's own `hours`), off-pool hair, their
own quirks, and their AI-written sketch/history/sample lines intact.

**A footgun found in passing, not fixed (pre-existing, out of scope):**
`startSandboxGame()` called with **no argument** does
`cfg = cfg || (pendingSandboxConfig = defaultSandboxConfig())` — it silently
*wipes* the player's whole config instead of reading it. The only real call
site (`ui.js`, the `sandbox.start` verb) passes `pendingSandboxConfig`, so it
is unreachable in play; it cost this session one confusing test run.

---

**Phase 3 notes (2026-08-26):**

The shared section now exists, and the Character Studio's create mode runs on
it. `concept.js` gained the UI half — `defaultConceptState`, `CONCEPT_COPY`
(D6's wording, in one table so five surfaces cannot invent five),
`renderConceptSection(state, {key, scope, toggleAction, generateAction})`,
`readConceptControls(key)` and `conceptMergeInto(target, incoming, replace)`
(D10's merge). It lives in `concept.js` rather than `fields.js` because it is
this feature's UI, not a generic control, and `concept.js` already loads before
all four consuming surfaces.

**How a Phase 4–6 surface wires itself in** — four steps, no more:
1. keep a `defaultConceptState()` object wherever that surface keeps its other
   state (never the DOM);
2. render `renderConceptSection(state, {...})` with a **unique `key`** — the
   player studio opens OVER the sandbox screen, so two sections can be in the
   document at once and a bare `querySelector` would read the wrong textarea;
3. register a toggle verb and a generate verb;
4. in the generate handler: `readConceptControls(key)` → `fillFromConcept` →
   `conceptMergeInto(existingDraft, adapter(result.draft), live.replace)`.

**Deleted, as planned:** `generateCharacterWithAI` and
`buildAIGenerationPrompt` (127 lines) are gone from `computer.js`, along with
the `classifieds.studio-ai-generate` verb, the `#studio-ai-input` textarea, the
`aiBusy`/`aiPrompt` state keys (replaced by `studio.concept`), and the
`.rl-studio-ai-input` CSS rule.

**Two things this phase had to fix that the phase text did not anticipate:**

1. **`collectStudioDraft` was destroying every draft key with no control on
   screen.** It rebuilt the draft from the form each time, so a concept fill's
   `speech`, `sampleLines`, `occupationOverrides` and `physical.piercings` were
   all silently deleted by the very next studio click — plan design invariant 6
   one layer in from the control. Two hand-written preservations already
   existed there (pool arrays; `personality.coreTrait`/`hiddenTrait`), each
   evidently added after someone found a specific field being eaten. Rather
   than add a third, the rule is now **derived**: a `coveredKeys` set is built
   from the `data-studio-field` attributes actually on screen, and any
   top-level key outside it is carried over untouched. Keys the form does
   cover stay authoritative, so clearing a control still clears the draft.
   Caught by checking `bibleHours`, which read `flexible` when the model had
   said `nights`.
2. **The harvest wrote dotted paths as literal flat keys.** `draft[field] =
   val` was fine while every field was single-segment; the new appearance
   fields are `physical.hair.color` shaped and would have produced a literal
   `"physical.hair.color"` key that `buildStudioNpc` never reads — stored,
   looking stored, doing nothing. Now `setStudioDraftPath` /
   `deleteStudioDraftPath`, the latter pruning emptied parents so a cleared
   appearance leaves `{}` rather than a husk.

**Also landed:** the create surface gained **30 appearance fields** (it had
zero), built by walking `PLAYER_STUDIO_TABS` rather than authoring a third
appearance form — scalar fields only, since the `toggles`/`rows` groups need
the full studio's add/remove machinery, which is safe precisely because of fix
1 above. And `buildStudioNpc` now routes `draft.physical` through
`partial.physical` instead of spreading it over the rolled physical afterwards:
the old spread bypassed `applyAuthoredPhysical`'s `heightBuild` recompute, so
an authored height/build left `heightBuild` reading the roll's value and the
two contradicted each other in every prompt that printed them. Now verified
consistent (`tall and stooped`).

**Verified (Phase 3), live in `dev-harness.html` against a real started game:**
the section renders collapsed (D7); D10's merge keeps a hand-typed `name` and
`physical.hair.color` while filling everything else, and Replace-mode
overwrites both; a thrown model error leaves the draft byte-identical and shows
one line (D11); generated appearance both stores **and displays**; a
re-harvest preserves every uncontrolled key; and `buildStudioNpc` produces a
bible that passes `validateCharacter` carrying the off-pool hair, build,
fashion, quirks, interests, piercings, the novel job title with a real
`SCHEDULES` key, and the model's own `hours`. Full `run-all.js` unchanged at
**3031 passed / 72 failed / 8 errored**.

---

**Phase 2 notes (2026-08-26):**

`src/srcfiles/concept.js` shipped, registered in **both** `main.html` (after
`llm.js`) and `dev/verify/loadgame.js`. Surface:
`CONCEPT_SCOPES` (the four scopes of D5), `buildConceptPrompt`,
`parseConceptResponse` + `conceptRepairJson`, `normalizeConceptDraft`,
`conceptTouchedFields`, `conceptWroteProse`, the three adapters
(`conceptToPartial` / `conceptToStudioDraft` / `conceptToEditList`),
`conceptEditsTouchAppearance`, and the one impure `fillFromConcept`.
`dev/verify/verify-concept-p2.js` pins it — **136 assertions, 0 failures**.

**Things a Phase 3–6 session needs to know:**

- **The adapters differ on purpose.** `conceptToPartial` flattens `interests`
  and `values` to NAME STRINGS, because that is what the sandbox's own
  controls read and write (`sbxWriteMultiSelect`) — an object in that slot
  renders as `[object Object]`. The draft keeps the full objects, so
  `conceptToEditList` (Phase 6) still gets the model's own `opposition`.
- **`conceptToEditList` is idempotent and skips no-op writes**, which is what
  stops a rewrite fabricating a `bibleRevision` every time it is opened.
  Pinned by the harness. It never emits `bible.occupation.scheduleTemplate`
  (D2b).
- **`rollCastSlot` gained `partial.occupationOverrides`** — a narrow allowlist
  (`incomeBand`, `hours`, `workMode`, `incomeSource`) so a described
  "night-shift ER nurse" does not wear a day shift just because Nurse was the
  nearest pool entry. `scheduleTemplate` and `category` are deliberately NOT
  overridable.
- **Three physical subtrees are never generated**, each for its own reason:
  `heightBuild` (a derived cache `applyAuthoredPhysical` recomputes),
  `typicalAttire` (reserved, no reader — plan invariant 3), and `intimate`
  (derived from gender by `generateIntimate` and authored on the studio's own
  tab; parked as an open question, not a permanent exclusion).
- **`nearestPoolEntry`'s metric changed**, driven by a Phase 2 test failure.
  It was Jaccard, which divides by the union and so punishes a long phrase for
  being long: "night shift ER nurse" against the pool's "health Nurse" scored
  1/5 = 0.2, fell under the 0.34 floor, and the described nurse got a randomly
  drawn job's schedule. It is now the **overlap coefficient** (shared ÷ smaller
  set) over stopword-filtered tokens ≥ 3 chars, still floored at 0.34 and
  additionally requiring one shared token ≥ 4 chars so a short common word
  cannot carry a match. Determinism re-verified after the change.

**Verified (Phase 2):** the full harness above; determinism re-checked
byte-identical against `HEAD` (`5573851ef91a9138…`) after the matcher change;
full `run-all.js` **3031 passed / 72 failed / 8 errored** — the 72 and the 8
are the unchanged pre-plan baseline, and the +136 is this harness. Live in
`dev-harness.html` with a stubbed `root.generateText`: a good reply fills 28
paths and collapses to 14 `authoredFields`; a reply **truncated mid-appearance
still yields 23 of those 28** rather than failing; a model refusal, a thrown
network error and an empty description each return a clean `{ok:false}` with
player-facing copy and leave the draft untouched (D11).

**One trap that cost a cycle:** `run-all.js` matches
`/^ {2}(\d+) passed, (\d+) failed$/m` — **the two leading spaces on the
summary line are load-bearing.** Without them a harness runs green standalone
and is silently counted as "errored" by the suite.

---

**Phase 1 notes (2026-08-26):**

Phase 1 shipped. New file `src/srcfiles/fields.js` (`comboControl`,
`customChipInput`, `offPoolValues`, `takeCustomChipValue`,
`fieldsDatalistId`), registered in **both** `main.html` and
`dev/verify/loadgame.js`. Converted: the sandbox roommate editor's occupation
/ interests / values / all five backstory fields (`sbxSelectControl` gained a
`free` flag), the Player Design studio's non-enum selects and its
piercing/tattoo/genital row controls (`studioFieldIsFreeText` derives this
from the schema, so the table never restates it), the Character Studio's
occupation row, and the four Character Studio pool grids (off-pool chips plus
an "Add your own" box on two new verbs,
`classifieds.studio-add-custom` / `classifieds.studio-edit-add-custom`). The
profile Edit Mode needed no conversion — it renders from the schema and was
already free-text on non-enum fields — and gained pool *suggestions* via
`studioScalarPoolFor`, indexed lazily out of `PLAYER_STUDIO_TABS`.

**Two things the phase found that were not in the original plan text:**

1. **D4 came forward into Phase 1, and its resolvers live in `sim.js`, not
   `concept.js`.** Phase 1's own end-to-end verification caught the hole: an
   off-pool `occupationCategory` / `interests` / `values` stored in the
   partial and redisplayed perfectly, then was **silently dropped by
   `rollCastSlot`** (`POOL.find(exact)` + `.filter(Boolean)`), so the started
   game handed you a different character with no error. That is design
   invariant 6 one layer below the UI, and Phase 1 is the phase that made
   those three fields typeable — so shipping it without the resolvers would
   have shipped a lie. `nearestPoolEntry`, `normalizeMatchText`,
   `resolveAuthoredOccupationPool`, `resolveAuthoredInterests` and
   `resolveAuthoredValues` are now in `sim.js` beside `rollCastSlot`, their
   primary consumer. Phase 2's `concept.js` calls them rather than defining
   its own.
2. **`doClassifiedsStudioTogglePool` truncated any name containing a
   colon** — it did `rowId.split(':')` with a destructure. Harmless while
   every name came from a pool; a live bug the moment a player or an AI fill
   can write `"3am thoughts: the playlist"`. Fixed to `indexOf`, matching
   `doClassifiedsStudioEditPool`, which already did it correctly.

**Verified:** off-pool values store *and* redisplay on the sandbox surfaces
(checked by driving the real DOM at `dev-harness.html`, all five sub-tabs);
the control-type split matches D2 exactly (gender/species/room/bed still
`SELECT`, the other nine `INPUT` with datalists); a fat off-pool partial
survives `rollCastSlot` → `mergeProseIntoBible` into a bible that passes
`validateCharacter`, with a real `SCHEDULES` key on the novel job title.
**Determinism is byte-identical**: a SHA-256 over four seeds × three cast
sizes plus a pool-only partial is unchanged against `HEAD`
(`5573851ef91a9138…`) — `weightedPick` consumes one `rng()` regardless of
candidate-list length, which is why resolving to a single candidate is safe.
Full `dev/verify/run-all.js`: **72 failed both before and after** (measured
against a clean `HEAD` worktree — 2875 → 2895 passed, same 72 failures, same
8 errored harnesses), so zero regressions.

**The four findings from the original audit still hold:**

1. **A half-built version of this feature already ships.** The in-game
   Character Studio has an "AI Generate" box: `generateCharacterWithAI` +
   `buildAIGenerationPrompt` (`src/srcfiles/computer.js` ~1465/1545), wired
   through `doClassifiedsStudioAIGenerate` (`src/srcfiles/ui.computer.js`
   ~1068) and rendered by `renderStudioCreateMode`
   (`src/srcfiles/render.computer.js` ~2543). **It generates zero
   appearance** — not one `physical.*` field — and it exists on exactly one
   of five editing surfaces. Phase 3 replaces it; do not extend it in place.
2. **`buildAIGenerationPrompt` inlines four large pools verbatim** (traits,
   quirks, likes, dislikes — several thousand characters) and then
   hard-filters the response with `POOL.includes(x)`, silently dropping every
   near-miss. D3 deletes both halves of that approach.
3. **The pools are not validation.** `validateNpcScalar`
   (`src/srcfiles/state.js` ~1787) enforces `enum` only where the schema
   declares one. `physical.*`,
   `personality.traits/quirks/likes/dislikes`,
   `baggage/wound/want/blindSpot/boundary`, `speech.humorStyle`, `sketch`
   and `history` are plain strings with **no enum** — a free-typed value is
   already schema-legal today. `getPhysicalDescriptionForPrompt`
   (`src/srcfiles/npc.js` ~2485) concatenates those strings straight into
   prose, so a novel value survives end to end with no new plumbing. This is
   the fact D1 rests on; re-verify it before Phase 1 if the schema has moved.
4. **`rollCastSlot`'s partial contract is the fill mechanism** and needs no
   change: "whatever is supplied is held fixed; everything else is rolled"
   (`src/srcfiles/sim.js` ~4005). A concept fill is a fat `partial`. The one
   gap is `partial.speech` and `partial.personality`, which `rollCastSlot`
   does *not* honour — `buildStudioNpc` patches them on afterwards
   (`src/srcfiles/computer.js` ~1418). Phase 2 must go through that same
   post-patch seam, not add partial keys.

**Blockers / flagged deviations:** None.

---

## The thesis

Starting a sandbox game in this project is a data-entry job. The Player
Design studio alone is six tabs and roughly sixty fields. Each roommate adds
five sub-tabs on top of that, and a full house is six to eight roommates. A
player who wants an *authored* household — not a rolled one — is looking at
several hundred individual decisions before the first frame of play, and
almost all of them are decisions they do not actually care about. Nobody has
an opinion about a stranger's earlobes. They have an opinion about "the
ex-Marine landlord's kid who never left".

The existing escape hatch is "leave it blank and it rolls", and it works, but
it is all-or-nothing per field: you either specify the earlobes or you get
random earlobes, and random earlobes have no relationship to the character
you were picturing. There is no way to say the one sentence you actually have
in your head and get a coherent whole person out of it.

The engine is already shaped for the fix. `rollCastSlot` takes a `partial`
and holds it fixed. `CHARACTER_SCHEMA` + `validateNpcField` is a real
validation boundary shared by every editing surface. `authoredFields` already
exists to stop the prose pass from clobbering hand-written values. What is
missing is a producer: something that turns one sentence into a fat, valid
`partial`, and a UI that can then *show* what it produced, so the player
edits from a filled form instead of an empty one.

The second half of that sentence is easy to underestimate. An AI fill that
writes "lavender undercut" into a `<select>` built from
`PHYS_POOL_HAIR_COLOR` produces a control with nothing selected — the value
is in the draft, invisible on screen, and destroyed by the next form harvest.
Free-text acceptance is therefore not a nice-to-have alongside the generator;
it is a precondition for it, which is why it is Phase 1 and not Phase 7.

### What this plan is *not*

- **Not a replacement for the roller.** The concept fill produces a partial
  and hands it to `rollCastSlot`, which fills the rest exactly as it does
  today. There is no second character-construction path, and a failed or
  refused AI call always degrades to today's behaviour (an empty partial,
  everything rolled), never to a broken character.
- **Not a rewrite of the studio surfaces.** Five surfaces gain one section
  and a control-type swap. No tab is reorganised, no field is removed, and
  `PLAYER_STUDIO_TABS` / `STUDIO_TABS` / `SANDBOX_TABS` keep their current
  contents.
- **Not free text on enum or keyed fields.** D2 draws the line and states the
  reason. "Virtually every dropdown" is the goal; `gender`, `species`,
  `genitals[].type`, `scheduleTemplate` and the room/bed pickers are the
  named exceptions.
- **Not a new prose-expansion pass.** A concept fill *replaces* the
  start-of-game prose call for that character (D9); it does not add a second
  one. Total AI calls per authored roommate stays at one.
- **Not image generation.** Phase 7 writes the portrait *prompt* from the
  concept and bumps `genSeed` when appearance moves; it does not touch
  `image.js`'s generation or caching.
- **Not a chat interface.** One box, one button, one JSON round trip. No
  refinement conversation, no "make her taller" follow-ups. That is a
  possible successor plan, and the open questions section says when to decide
  it.

---

## Evidence

Field counts, to make the size of the data-entry problem concrete rather than
rhetorical. Counted from the tables themselves, 2026-08-26:

| Surface | Table | Fields offered |
|---|---|---|
| Player Design studio | `PLAYER_STUDIO_TABS` (`studio.js` 57) | 6 tabs, 44 fixed fields + 3 add/remove row groups (up to 16 more rows) |
| Sandbox roommate | `renderSandboxRoommate*` (`menu.js` 735-870) | 5 sub-tabs, 20 fields, x N roommates |
| Sandbox appearance | `openStudio({kind:'npc'})` | the same 44-field studio minus Identity/Portrait |
| Character Studio create | `renderStudioCreateMode` (`render.computer.js` 2532) | 17 fields + 4 pool grids (~190 togglable chips) |
| Profile Edit Mode | `STUDIO_TABS` (`render.computer.js` 2771) | 3 tabs, 61 paths |

A six-roommate sandbox house therefore offers on the order of
44 + 6 x (20 + 44) = **430 individual controls** before Start. The plan's
claim is not that players fill all of them — it is that the ones they skip
currently produce a character unrelated to the one they wanted.

Pool coverage, for D1. Values a player might reasonably type that the current
`<select>`s cannot express, sampled against the live arrays in `config.js`
(6462-6570):

| Field | Pool | Cannot express |
|---|---|---|
| `physical.hair.color` | `PHYS_POOL_HAIR_COLOR` | any dyed or unnatural colour not enumerated |
| `physical.fashion` | `PHYS_POOL_FASHION` | any subculture not enumerated |
| `personality.quirks` | `QUIRKS_POOL` (41 authored sentences) | any quirk specific to the character being described |
| `occupation` | `OCCUPATION_POOL` categories | any job title outside the 59 entries |

`QUIRKS_POOL` is the sharpest case: the pool is 41 *specific authored
sentences*, and the whole value of describing a character is getting the
quirk that belongs to *them*.

---

## Locked decisions

### Vocabulary and validation

- **D1 — Free text is accepted on every non-enum string field, from the UI
  and from the AI alike.** Verified against `validateNpcScalar`: `enum` is
  the only vocabulary gate the validator applies, and the `PHYS_POOL_*`
  arrays are roller inputs and UI suggestions, never constraints.
  `getPhysicalDescriptionForPrompt` consumes these values as raw prose
  fragments, so a novel value reaches the narrator, the image prompt and the
  Character Studio unchanged.
- **D2 — Four categories of field stay hard pickers, and only these.**
  (a) schema `enum` fields — `bible.gender`, `bible.species`,
  `physical.intimate.genitals[].type`: a free-typed value fails
  `validateNpcScalar` and would be silently dropped, which is worse than not
  offering it. (b) `occupation.scheduleTemplate` — a key into `SCHEDULES`; a
  novel value breaks NPC scheduling with no visible error. (c) the sandbox
  room/bed pickers — options carry `disabled` state a `datalist` cannot
  express, and a free-typed room id double-books a bed. (d) numeric fields
  (age, temperament axes, speech scalars) — already range-clamped, and "free
  text" is not a meaningful ask for a slider.
- **D3 — The generator does not inline pools into the prompt, and does not
  hard-filter the response against them.** Both halves of today's approach
  go. The prompt names the *shape* of each field and gives one or two
  examples; the response is coerced by type and range only. The pools remain
  as `datalist` suggestions in the UI, which is the job they are actually
  good at.
- **D4 — A free-typed value on a mechanically-backed field is kept verbatim
  and backed by derived payload.** *(Built in Phase 1, not Phase 2 — see the
  Handoff. The resolvers live in `sim.js` beside `rollCastSlot`, their primary
  consumer; `concept.js` calls them rather than defining its own.)* Three
  fields carry payload behind the label, and each gets a resolver: `occupation` (title
  kept; category / scheduleTemplate / incomeBand / hours / workMode derived
  from the nearest `OCCUPATION_POOL` entry by token overlap, or from a
  neutral default), `interests[]` (name kept; `tags` from the nearest pool
  entry, else `[]` — empty tags cost only cast-variety pressure, which is a
  preference and not a gate, per `rollCastSlot`'s own comment), and
  `values[]` (name kept; `opposition` from the AI, else nearest, else a
  generic — the field is schema-`required`, so it can never be left absent).

### Surfaces and naming

- **D5 — One engine, five surfaces, four scopes.** All five Describe
  sections call one function in one new file. The scope decides which fields
  the prompt asks for and which adapter converts the result: `player`
  (identity + appearance + portrait prompt), `npcAppearance` (appearance
  only), `npcFull` (everything), `npcRewrite` (everything, for a character
  who already exists).
- **D6 — The in-game label is "Describe & Generate", the button is
  "Generate", and nothing in the UI ever says "vibe".** Stated here so all
  five surfaces agree and a later session does not invent a sixth wording.
  Internal identifiers use the `concept` prefix (`conceptFill`,
  `CONCEPT_SCOPES`, `buildConceptPrompt`) — chosen because it is not a word
  the UI uses, so a grep for it finds engine code and never copy.
- **D7 — The section is collapsed by default and never blocks anything.** It
  renders above the first field group on every surface, closed, with the
  existing manual fields untouched beneath it. A player who never opens it
  sees today's game exactly.

### Fill semantics

- **D8 — A concept fill writes the draft; it does not create the
  character.** On every surface the result lands in the same draft/partial
  the manual controls read and write, the surface re-renders, and the player
  reviews and edits before confirming. There is no path from the Describe box
  straight into `gameState.npcs`.
- **D9 — Concept-filled paths are authored paths, and a fill that wrote
  prose suppresses the start-of-game prose call.** The fill's touched paths
  go into `authoredFields` by exactly the rule `roommateAuthoredFields`
  already uses (presence in the partial *is* the authored set), so
  `mergeProseIntoBible` will not overwrite them. Because the fill also writes
  `name` / `surname` / `visual` / `history` / `sketch` / `sampleLines`, the
  roommate's Prose toggle defaults to templated — one AI call at fill time
  replaces the one AI call at start time rather than adding to it.
- **D10 — A fill merges over the draft; it never blanks a field the player
  typed.** Existing draft values win over generated ones unless the player
  explicitly asks for a re-fill via the section's "Replace what I've written"
  checkbox (off by default). This is the current
  `doClassifiedsStudioAIGenerate` merge order, kept.
- **D11 — Failure is always silent-and-safe.** A refused call, a network
  error, unparseable JSON, or a truncated response leaves the draft exactly
  as it was and surfaces one line of copy. The character-creation path's
  standing rule — "character creation must never hard-fail" — extends here.

### Live characters

- **D12 — A live NPC may be fully rewritten, behind an explicit confirm that
  names what moves and what does not.** The bible is replaced; `relPlayer`,
  `memory`, `residency`, `mood`, `needs`, `location` and every other mutable
  field are untouched. The confirm copy says so in those words, and lists the
  count of bible fields that will change.
- **D13 — A rewrite goes through the existing edit-save loop, not a new
  one.** `doClassifiedsStudioSaveEdits` (`ui.computer.js` ~1280) already
  validates each `{path, value}` with `validateNpcField`, skips no-op writes,
  applies with `applyNpcField`, logs to `bibleChanges`, and counts one
  `bibleRevision` per pass. A rewrite produces an edit list and runs the same
  loop, so it inherits revision history for free and cannot write a value the
  manual editor could not.
- **D14 — A rewrite that changes appearance bumps `genSeed`; one that does
  not, does not.** `genSeed` is the image cache key. Leaving it fixed after
  an appearance rewrite shows the old face indefinitely; bumping it on a
  personality-only rewrite throws away a good cached portrait for nothing.

---

## Data model

### `CONCEPT_SCOPES` (Phase 2) — `src/srcfiles/concept.js`

One table. `fields` is the ordered list of top-level draft keys the prompt
asks for and the normalizer accepts; anything outside it is dropped before
validation, so widening a scope is a one-line edit in one place.

```js
const CONCEPT_SCOPES = {
  player:        { fields: ['name','surname','age','gender','physical','portraitPrompt'],
                   subjectNoun: 'the player character' },
  npcAppearance: { fields: ['physical'],
                   subjectNoun: 'this character' },
  npcFull:       { fields: ['name','surname','age','gender','species','occupation',
                            'temperament','personality','speech','interests','values',
                            'baggage','wound','want','blindSpot','boundary',
                            'physical','history','sketch','sampleLines'],
                   subjectNoun: 'a new character' },
  npcRewrite:    { fields: /* same list as npcFull */, subjectNoun: 'an existing character' },
};
```

### The concept draft (Phase 2)

The normalizer's output. Deliberately the **same shape as a sandbox roommate
`partial`** plus the keys `rollCastSlot` cannot take, so the sandbox adapter
is close to identity and the other adapters stay small.

```js
{
  name, surname,                  // string
  age,                            // number, clamped [18,60]
  gender, species,                // enum-checked; dropped if invalid
  occupation: {                   // D4-resolved — always complete or absent
    category, title, scheduleTemplate, incomeBand, hours, workMode, incomeSource, ...
  },
  temperament: { <axis>: number in [-1,1], ... },   // partial; absent axes roll
  personality: { traits[], coreTrait, hiddenTrait, quirks[], likes[], dislikes[] },
  speech: { verbosity, formality, humorStyle, profanityLevel,
            verbalTics[], textingStyle, vocabularyLevel, catchphrases[] },
  interests: [{ name, tags[], skill }],             // D4-resolved
  values:    [{ name, opposition }],                // D4-resolved
  baggage, wound, want, blindSpot, boundary,        // string, <= 300
  physical: { /* CHARACTER_SCHEMA.bible.physical shape */ },
  history, sketch, sampleLines[],                   // prose
  portraitPrompt,                                   // player scope only
  _touched: ['name','physical.hair.color', ...],    // D9 — dotted paths written
}
```

`_touched` is the underscore-prefixed odd one out on purpose: it is
bookkeeping the adapters consume and strip, and it must never reach a bible.
Every adapter deletes it explicitly rather than relying on
`validateCharacter` to strip it — see design invariant 4.

### D4's resolvers — **BUILT, in `src/srcfiles/sim.js`** (Phase 1)

Beside `rollCastSlot`, which is their primary consumer. All four are pure —
no RNG — which is what lets them sit inside a function whose determinism is
asserted (design invariant 4's byte-identical-household guarantee).

`resolveAuthoredOccupationPool(text)` returns `{ pool, title }` rather than a
single entry, so `rollCastSlot` still makes **exactly one** `weightedPick`
draw whether the text named a real category or something nobody enumerated.
`weightedPick` consumes one `rng()` regardless of candidate-list length, so
resolving to a one-element list leaves a seed's stream identical in shape to
an exact-category match. `title` is `null` when the text named a real
category (the entry's own title wins) and the typed text when it did not.

```
1. exact category match on OCCUPATION_POOL[].category   -> those entries
2. exact title match (case/space-insensitive)           -> [that entry]
3. nearestPoolEntry over "<category> <title>"           -> [that entry],
                                                           title = text
4. no match                                             -> whole pool,
                                                           title = text
```

`resolveAuthoredInterests(names)` keeps each name and borrows the nearest
entry's `tags`, or `[]` with no near match. `resolveAuthoredValues(names)`
keeps each name and fills the schema-**required** `opposition` from the
caller's own suggestion (Phase 2's AI hint), then the nearest entry's, then
the generic `'compromise'`.

`nearestPoolEntry(text, pool, keyFn)` is the shared fuzzy matcher: normalize
(lowercase, strip punctuation, collapse whitespace), then exact -> substring
either direction -> Jaccard token overlap **above a 0.34 floor** -> `null`.
The floor is load-bearing: without it almost every multi-word phrase matches
something through one shared common word, and a bad match is worse than no
match because it silently substitutes payload the player never asked for.

### `conceptState` (Phases 3-6) — per surface

The section's own UI state, stored beside the draft it fills, never in the
DOM (the discipline `classifieds.studio` already follows):

```js
{ open: false, text: '', busy: false, replace: false, lastError: '' }
```

---

## Implementation phases

### Phase 1 — Free text everywhere (`fields.js`) — **BUILT 2026-08-26**

**Goal:** Every vocabulary dropdown on every character-editing surface
accepts a typed value that is not in its list, and *shows* a value that is
not in its list. The four D2 categories keep real `<select>`s. Nothing about
generation exists yet, but a player can hand-type "lavender undercut" into
the hair colour field, confirm, and see it in the finished character.

**Files:**
- `src/srcfiles/fields.js` **(new)**: the shared control builders. One
  function, `comboControl({ value, pool, placeholder, attrs })`, returning an
  `<input list="...">` plus a generated `<datalist>` with a stable id derived
  from the field path. Reads and writes through `.value`, and carries the
  caller's `data-*` attributes verbatim — that is what makes it a drop-in for
  the three existing `<select>` builders, all of which are harvested by
  `.value` on a `data-*` selector. Also `customChipInput(...)` for the
  multi-select pool grids, which cannot be a combo: an "+ Add your own" text
  input that appends a chip to the selection, and renders any off-pool value
  already in the draft as a chip with a remove affordance. Guard the whole
  file's DOM use on `typeof document` so it loads in the vm harness.
- `main.html`: one `<script src="src/srcfiles/fields.js?v=1">` tag,
  positioned after `icons.js` and before `menu.js` / `render.computer.js` /
  `studio.js`. Bump the `?v=` of every file this phase edits.
- `dev/verify/loadgame.js`: register `fields.js` in `ORDER` at the matching
  position, **in the same commit as the main.html tag** (design invariant 5 —
  the rumination.js scar).
- `src/srcfiles/menu.js`: `sbxSelectControl` gains a `free` flag; when set it
  delegates to `comboControl`. Called with `free: true` from
  `renderSandboxRoommateIdentity` (occupation),
  `renderSandboxRoommateInterests` (interests, values) and
  `renderSandboxRoommateBackstory` (all five). Left as a `<select>` for
  gender and species (D2a) and for `renderSandboxRoommatePlacement` (D2c).
  The harvest side in `wireSandboxConfigInputs` needs no change — it already
  reads `.value` off `data-sbx-field`.
- `src/srcfiles/studio.js`: the `kind: 'select'` branch of the field renderer
  switches to `comboControl` when the field's `schemaPath` resolves to a spec
  with no `enum`; `gender` (the one enum field in the table) keeps its
  `<select>`. `validateStudioField` already routes through `validateNpcField`
  and therefore already accepts any string on those paths — confirm that with
  a live edit rather than assuming it.
- `src/srcfiles/render.computer.js`: `studioSelectField` gains the same
  `free` flag for the create surface's occupation row; the four
  `studioPoolPicker` grids gain `customChipInput`. The profile Edit Mode's
  pool pickers (`studioPoolPickerFor`, `classifieds.studio-edit-pool`) get
  the same treatment, so a rewritten NPC's off-pool traits are visible and
  removable.
- `src/srcfiles/ui.computer.js`: `collectStudioDraft` already preserves
  pool-toggled arrays from the existing draft, so it needed no change.
  `studioPoolNamesToValues` now calls D4's `resolveAuthoredInterests` /
  `resolveAuthoredValues` (the planned `TODO(concept-D4)` was closed in this
  phase rather than deferred, because D4 came forward — see the Handoff), so
  a custom value typed here and one typed in the sandbox get identical
  payload. Also fixes `doClassifiedsStudioTogglePool`'s `rowId.split(':')`,
  which truncated any name containing a colon.
- `src/srcfiles/sim.js`: **D4's four pure resolvers**, and the three
  `rollCastSlot` call sites that consume them (occupation candidate pool,
  authored interests, authored values), plus the `authoredOccTitle` stamp on
  the built occupation record. This is the half that makes free text on those
  three fields real rather than decorative — see the Handoff for why it could
  not wait for Phase 2.
- `main.html` CSS: `.combo-input` styling matching the existing
  `.sbx-control` / `.rl-studio-input` / studio select appearance, so the swap
  is invisible. `datalist` renders natively; there is no dropdown chrome to
  build.

**Verification:** In `dev-harness.html`, on each of the five surfaces: type
an off-pool value into a converted control, confirm, and assert the value
reached the target record (`pendingSandboxConfig.roommates[i].partial`,
`studioSubject.draft`, `classifieds.studio.draft`, `gs.npcs[id].bible`) via
the browser console. Then re-open the surface and assert the control *shows*
the off-pool value — the failure mode this phase exists to prevent is a value
that stores but does not display. Start a real sandbox game with one
off-pool-heavy roommate and assert their `bible.physical.hair.color` survives
`applySandboxPreset` and `mergeProseIntoBible` intact. Re-run
`verify-sbx-p1/p2/p3/p7` and `verify-cal-p1..p4` and confirm unchanged
pass/fail counts (p1/p3/p7 each carry one known pre-existing failure).

---

### Phase 2 — The concept engine (`concept.js`) — **BUILT 2026-08-26**

**Goal:** One pure, testable module turns a description string plus a scope
into a validated concept draft, and one thin async wrapper is the only thing
in the file that touches `root.generateText`. No UI calls it yet.

**Files:**
- `src/srcfiles/concept.js` **(new)**:
  - `CONCEPT_SCOPES` (data model above).
  - `buildConceptPrompt(description, scope, context)` — per-scope
    instruction. Names field shapes, not pools (D3). `context` carries the
    already-authored draft values so the model is told what to stay
    consistent with (a fill on a half-filled form must not contradict it),
    and, for `npcRewrite`, the existing character's name and residency so the
    model is rewriting rather than inventing from nothing.
  - `parseConceptResponse(text)` — tolerant extraction: strip markdown
    fences, take the outermost `{`...`}`, `JSON.parse`, and on failure
    attempt one repair pass for the single most common truncation (an
    unterminated trailing object). Returns `null` rather than throwing.
  - `normalizeConceptDraft(parsed, scope)` — the validation boundary. Walks
    `CONCEPT_SCOPES[scope].fields`, coerces each by its `CHARACTER_SCHEMA`
    spec via `validateNpcField`, clamps numbers to their declared range,
    truncates strings to `maxLength`, caps arrays at `maxItems`, drops
    anything that fails, and records every path it kept in `_touched`. Never
    throws; always returns an object, possibly empty.
  - D4's resolvers are **already built, in `sim.js`** (Phase 1). Call
    `resolveAuthoredOccupationPool` / `resolveAuthoredInterests` /
    `resolveAuthoredValues` / `nearestPoolEntry`; do **not** define a second
    set here. `resolveAuthoredValues` already accepts `{name, opposition}`
    objects, which is the seam for passing the model's own opposition hint.
  - `conceptToPartial(draft)` / `conceptToStudioDraft(draft)` /
    `conceptToEditList(draft, npc)` — the three adapters. Each strips
    `_touched` explicitly (design invariant 4).
  - `conceptTouchedFields(draft)` — `_touched` collapsed to the
    `authoredFields` prefix form (D9), matching `roommateAuthoredFields`'
    output exactly: `'physical'` rather than forty `physical.*` paths.
  - `async fillFromConcept(description, scope, context)` — the one impure
    function: builds, calls `root.generateText`, parses, normalizes, and
    returns `{ ok, draft }` or `{ ok: false, reason }`. **No
    `stopSequences`** — the current `['}\n']` on `generateCharacterWithAI`
    truncates any pretty-printed nested JSON whose last nested object is
    followed by a newline, which is precisely the shape a full-appearance
    response has. This is a top-of-phase correctness note, not a style
    preference.
- `main.html` + `dev/verify/loadgame.js`: register `concept.js` in both, same
  commit, positioned after `llm.js` (it reuses that file's prompt
  conventions) and before the UI layer.
- `dev/verify/verify-concept-p2.js` **(new)**.

**Verification:** The new harness, with canned responses and no live model —
`fillFromConcept` is the only function needing one, and it is a four-line
wrapper. Assert, for each scope: (a) a well-formed full response normalizes
to a draft where **every** path passes `validateNpcField`; (b) that draft fed
through `conceptToPartial` into a real `rollCastSlot` call yields a bible
that passes `validateCharacter`; (c) a response with out-of-range numbers
(age 12, warmth 4.5), wrong types (age as a string, traits as a string),
hallucinated enums (`gender: "agender"`, `species: "goblin"`) and 900-char
strings produces a draft that still fully validates, with the bad fields
dropped and the good ones kept — never an all-or-nothing rejection; (d)
malformed JSON, an empty string and a truncated response each return
`{ ok: false }` with the draft untouched; (e) `nearestPoolEntry` pinned
directly — exact, substring, token-overlap and no-match each asserted;
(f) `resolveOccupation` on a novel title returns a complete record whose
`scheduleTemplate` is a real key in `SCHEDULES`; (g)
`conceptTouchedFields` output is byte-identical in form to
`roommateAuthoredFields` for an equivalent partial, and `mergeProseIntoBible`
with it leaves every filled field intact.

---

### Phase 3 — Character Studio create mode — **BUILT 2026-08-26**

**Goal:** The in-game Character Studio's existing AI box is replaced by the
Describe & Generate section, now covering appearance and every other bible
field, routed entirely through `concept.js`. The old prompt builder and
response filter are deleted.

**Files:**
- `src/srcfiles/render.computer.js`: `renderStudioCreateMode`'s AI section
  becomes `renderConceptSection(body, conceptState, 'npcFull')` — the shared
  renderer (collapsed by default per D7, textarea, Generate button, the
  "Replace what I've written" checkbox per D10, an error line). The create
  surface also gains the appearance fields it never had, reusing
  `PLAYER_STUDIO_TABS`' appearance groups rather than authoring a third
  appearance form.
- `src/srcfiles/ui.computer.js`: `doClassifiedsStudioAIGenerate` rewritten to
  call `fillFromConcept(text, 'npcFull', ctx)` and merge per D10. Delete
  nothing else in this file.
- `src/srcfiles/computer.js`: **delete** `generateCharacterWithAI` and
  `buildAIGenerationPrompt` (~180 lines including the four inlined pools).
  `buildStudioNpc` gains `partial.physical` pass-through — it currently
  spreads `draft.physical` over the rolled physical *after* `rollCastSlot`,
  which bypasses `applyAuthoredPhysical`'s `heightBuild` recompute; route it
  through the partial instead so the derived field is correct.
- `main.html`: styling for the section.

**Verification:** In a running game, open the Studio, describe a character,
Generate. Assert the draft is populated across all groups including
appearance; assert the form *shows* off-pool values (Phase 1's guarantee
under real generated data); edit two fields by hand, re-generate with Replace
off and assert the hand edits survived; re-generate with Replace on and
assert they were overwritten. Create the character and assert
`gs.npcs[id].bible` validates, `heightBuild` is consistent with `height` /
`build`, and the character appears as an applicant. Confirm no remaining
references to the deleted functions
(`grep -rn "generateCharacterWithAI\|buildAIGenerationPrompt" src/`).

---

### Phase 4 — Player Design studio and sandbox appearance studio — **BUILT 2026-08-26**

**Goal:** Both `openStudio` scopes gain the section: the player gets identity
+ appearance + a portrait prompt, the sandbox roommate appearance subject
gets appearance only.

**Files:**
- `src/srcfiles/studio.js`: `renderPlayerStudio` renders the section above
  the tab strip, so it applies across tabs rather than living on one.
  `studioSubject` gains `concept: conceptState`. The fill writes through
  `studioSet` — the existing path-aware writer, which already implements the
  "empty deletes" contract — so a filled draft is indistinguishable from a
  typed one, including for `blankStudioDraft`'s authored-means-present rule.
  Scope is `studioSubject.kind === 'npc' ? 'npcAppearance' : 'player'`. The
  `physical.piercings` / `physical.tattoos` / `physical.intimate.genitals`
  row groups accept generated rows, capped at each group's declared `max`.
- `main.html`: the section's markup inside `#player-studio`, above `#ps-tabs`.

**Verification:** From the title screen, New Game -> Player Design, describe
yourself, Generate. Assert every tab shows filled values, that the Intimate
tab's genital rows are consistent with the chosen gender, and that Roll
Everything still respects them as authored. Begin the game and assert
`gs.player`'s appearance matches the draft. Then from the sandbox screen,
open a roommate's Design appearance, Generate, and assert only `physical` was
written — no `name`, no `age` — and that
`roommateDefaultSkipProse(partial)` now returns true.

---

### Phase 5 — Sandbox roommate editor — **BUILT 2026-08-26**

**Goal:** The section appears on the roommate detail head, above the
sub-tabs, and one description fills all five sub-tabs at once.

**Files:**
- `src/srcfiles/menu.js`: `renderSandboxRoommateDetailHead` renders the
  section. The fill calls `fillFromConcept(text, 'npcFull', ctx)` and
  `conceptToPartial` writes `r.partial` per D10's merge order.
  `roommateAuthoredFields` needs no change (D9 — presence in the partial
  already *is* the authored set), but a comment there should record that a
  concept fill is now a second producer of that set. `r.skipProse` defaults
  to templated once a fill has written prose fields. The rail card subtitle
  (`sbxRoommateSub`) should reflect a filled roommate, so the strip shows at
  a glance which are authored.
- `main.html`: section markup and CSS inside the sandbox shell.

**Verification:** Sandbox -> add three roommates -> describe each in one
sentence -> Generate. Assert each `partial` is fat and distinct, that the
five sub-tabs all show filled values, and that the Prose toggle flipped to
Templated. Start the game and assert: three characters matching the
descriptions, `authoredFields` populated per roommate, `bibleRevision` 0, and
**zero prose AI calls made at start** (stub `root.generateText` to throw, as
`verify-i3` does, and confirm the start completes). Re-run
`verify-sbx-p1/p2/p3/p7` for unchanged counts.

---

### Phase 6 — Live character rewrite

**Goal:** The profile surface gains the section for an existing NPC. A fill
produces a preview of exactly which bible fields would change; a confirm
applies them through the existing edit-save loop; mutable state is provably
untouched.

**Files:**
- `src/srcfiles/render.computer.js`: `renderStudioProfileMode` gains the
  section (scope `npcRewrite`), plus the confirm panel — a diff list of
  `path: old -> new`, the count, and D12's plain-language statement of what
  is preserved.
- `src/srcfiles/ui.computer.js`: `doClassifiedsStudioConceptRewrite` builds
  the edit list with `conceptToEditList(draft, npc)` and runs it through the
  **existing** `doClassifiedsStudioSaveEdits` machinery (D13) — extract that
  function's apply loop into `applyStudioEditList(npc, edits)` and have both
  callers use it, rather than duplicating validation. `genSeed` bumps only
  when a `bible.physical.*` path is in the applied set (D14).
- `src/srcfiles/image.js`: no change — confirm the `genSeed` bump is
  sufficient to miss the portrait cache, and record the finding here either
  way.

**Verification:** In a running game with an established roommate: record
`relPlayer`, `memory`, `residency`, `mood`, `location` and `bibleRevision`
first. Rewrite them from a description. Assert the diff preview matches what
was applied; assert every recorded mutable field is byte-identical
afterwards; assert `bibleRevision` incremented by exactly one and
`bibleChanges` gained one entry per changed path. Assert an
appearance-changing rewrite bumped `genSeed` and a personality-only one did
not. Talk to them and confirm the narrator's persona block reflects the new
bible. Cancel a rewrite at the confirm and assert nothing changed.

---

### Phase 7 — Portrait prompt and polish

**Goal:** The player scope's `portraitPrompt` reaches the Portrait tab, and
the loose ends the earlier phases deliberately deferred are closed.

**Files:**
- `src/srcfiles/studio.js`: a `player` fill writes `draft.portrait.prompt`
  and sets `promptDirty`, so `applyStudioBuildLink`'s auto-clear does not
  wipe it. Confirm against that function's existing `promptDirty` contract
  before writing.
- `src/srcfiles/ui.computer.js`: replace Phase 1's `TODO(concept-D4)` in
  `studioPoolNamesToValues` with the real `resolveInterests` /
  `resolveValues` calls.
- `src/ref/structural/ARCHITECTURE.md` + `src/ref/README.md`: index rows for
  this plan; move the plan and its prompt to `complete/` together.

**Verification:** Player studio -> describe -> Generate -> Portrait tab shows
a prompt derived from the description and the generated appearance; generate
the portrait and confirm it matches. Off-pool interests and values entered by
hand in the Character Studio now carry resolved `tags` / `opposition`. Full
`dev/verify/run-all.js` pass with counts compared against the pre-plan
baseline recorded in Phase 1's session notes.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | **Built & verified** (2026-08-26) | Free text on every non-enum dropdown; `fields.js` combo + custom-chip controls; D4's resolvers in `sim.js` (pulled forward) |
| 2 | **Built & verified** (2026-08-26) | `concept.js` — scopes, prompt, tolerant parse + repair, normalizer, three adapters; `verify-concept-p2.js` (136 assertions) |
| 3 | **Built & verified** (2026-08-26) | Character Studio create mode on the new engine; shared `renderConceptSection` authored; 30 appearance fields added; old AI path deleted |
| 4 | **Built & verified** (2026-08-26) | Player Design studio + sandbox appearance studio; also landed Phase 7's portrait prompt |
| 5 | **Built & verified** (2026-08-26) | Sandbox roommate editor; one description fills five sub-tabs; zero prose calls at start (D9) |
| 6 | Not started | Live-character rewrite behind a confirm, through the existing edit loop |
| 7 | **Mostly done** — only the doc-index move remains | Portrait prompt landed in Phase 4; the D4 resolver cleanup landed in Phase 1 |

---

## Dependency order

```
Phase 1 (free text) --> Phase 2 (engine) --+--> Phase 3 (studio create)
                                           +--> Phase 4 (player + appearance)
                                           +--> Phase 5 (sandbox roommates)
                                           +--> Phase 6 (live rewrite)
                                                        |
                                                        +--> Phase 7 (polish)
```

Phase 1 and Phase 2 are the only hard ordering: Phase 2 has no UI and Phase 1
has no generator, so they are independently verifiable and could in principle
be built in either order — but building 2 first means every Phase 3-6
verification is blind to whether generated values *display*, which is the
failure this plan most wants to avoid. Build 1 first.

Phases 3, 4, 5 and 6 are mutually independent and may be taken in any order
or split across sessions; each owns distinct files apart from the shared
`renderConceptSection`, which Phase 3 authors and the rest consume. If Phase
3 is not the first of them, whichever runs first authors that renderer and
this document gets updated to say so.

Phase 7 depends on Phase 4 (portrait) and on Phase 1's deferred TODO.

---

## Open questions (parked, none blocking)

- **A refinement conversation ("make her taller", "less sarcastic")** — the
  natural successor once one-shot filling is proven. Decide after Phase 6,
  when there is real evidence about how often a first fill is close but not
  right.
- **Household-level description ("three broke art students and their
  landlord")** — one call filling every roommate partial at once, with
  relationships between them. Decide after Phase 5; it is a fourth scope on
  the same engine, not new machinery.
- **Whether `QUIRKS_POOL` and friends should shrink** once free text and
  generation are the common path. They still back the roller and the
  suggestions, so probably not — but revisit after Phase 5 rather than
  carrying dead vocabulary indefinitely.
- **Concept text persistence.** Should the description that produced a
  character be stored on the bible for later reference or re-rolling? Cheap
  to add, needs a schema field with a reader (design invariant 3). Decide in
  Phase 6, where a rewrite would have an obvious use for it.

---

## Design invariants

1. **Free text is accepted wherever the schema has no `enum`, and refused
   wherever it has one.** The line is drawn by the validator, not by taste,
   so it cannot drift. A field that gains an `enum` later automatically
   becomes a picker; a field that loses one automatically becomes free.
2. **The generator never constructs a character — it only fills a draft.**
   Every path from a description to a real NPC goes through the same
   `rollCastSlot` + `validateCharacter` the manual path uses. The moment a
   second construction path exists, the two drift, and the fill path becomes
   the one that produces subtly invalid characters nobody notices until a
   save fails to load.
3. **A field is only worth writing if something reads it (RI6, inherited).**
   The whole plan writes into fields that already have readers. The one new
   candidate — persisted concept text — is parked above precisely because it
   has no reader yet, and `stressProfile` is what happens when that rule is
   skipped.
4. **`_touched` never reaches a bible.** Every adapter strips it explicitly.
   Relying on `validateCharacter` to strip unknown keys is what made the
   `authoredFields` lock a silent no-op before it was declared in
   `CHARACTER_SCHEMA` — the castWeb scar in a different costume.
5. **A new source file is registered in `main.html` and
   `dev/verify/loadgame.js` in the same commit.** `rumination.js` shipped to
   only one of the two lists and five harnesses with 175 assertions died
   silently. This plan adds two files.
6. **A generated value must display in the control that owns it.** Storing a
   value the form cannot show is worse than not storing it: the next form
   harvest destroys it, and the player watches their character quietly revert
   with no error. This is why Phase 1 precedes everything.
