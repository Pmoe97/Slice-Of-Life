# NPC Central Object Overhaul — Full Phased Implementation Plan

## Architecture Summary

The overhaul expands the NPC object across 5 layers, following Path B (parallel construction, additive migration). The game stays playable throughout. Each phase is independently verifiable.

### Current State (what exists today)

```
npc = {
  bible: {                          // frozen identity
    name, visual (flat string, 400 chars max),
    genSeed, history (string, 600 chars),
    temperament: { warmth, volatility, openness, conscientiousness, assertiveness, selfAwareness },
    occupation: { category, title, scheduleTemplate, incomeBand, stressProfile, hours },
    interests: [{ name, tags }],     // max 3
    values: [{ name, opposition }], // max 2
    baggage, wound, want, blindSpot, boundary,  // strings, 300 chars
    speech: { verbosity, formality, humorStyle, profanityLevel, verbalTics, textingStyle },
    scheduleTemplate, sketch, sampleLines
  },
  bibleRevision: 0, bibleChanges: [],
  residency: { status, room, bed, partnerOf, since, contributesRent, rentShare },
  location, activity, mood (-1..1),
  needs: { hunger, hygiene, energy, social },  // 0-100
  relPlayer: { trust, affection, tension, respect },  // -1..1, 4 axes
  memory: { facts[], episodes[], summary },     // flat, no retrieval
  arcs: [], flags: {},
  suspicion: {}, clothing: 'dressed'
}
```

### Target State (what we're building toward)

```
npc = {
  bible: {                          // LAYER 1 — frozen identity
    identity: { name, age, gender, pronouns, sexuality, genSeed },
    physical: {                     // THE 25+ ITEM DESCRIPTION SECTION
      height, build, heightBuild,
      hair: { color, style, length, texture },
      eyes: { color, shape },
      skin: { tone, texture, ethnicity },
      face: { shape, nose, lips, cheekbones, jawline, ears },
      body: { shape, chestSize, buttSize, legs, posture },
      distinguishingFeatures: [],
      piercings: [{ location, type, description }],
      tattoos: [{ location, description, style }],
      fashion: "",
      accessories: "",
      typicalAttire: { casual, work, sleep, formal },
      voice: { pitch, texture, accent },
      gait: "",
      scent: "",
      genitals: ""                   // adult content, gated by contentConfig
    },
    temperament: { warmth, volatility, openness, conscientiousness, assertiveness, selfAwareness },
    personality: {                   // NEW — derived behavioral directives
      traits: [], coreTrait, hiddenTrait,
      quirks: [], likes: [], dislikes: []
    },
    occupation: { category, title, scheduleTemplate, incomeBand, stressProfile, hours },
    interests: [{ name, tags, skill }],  // skill is NEW
    values: [{ name, opposition }],
    backstory: {                    // restructured (fields preserved)
      baggage, wound, want, blindSpot, boundary, history
    },
    speech: { verbosity, formality, humorStyle, profanityLevel, verbalTics, textingStyle, vocabularyLevel, catchphrases },
    scheduleTemplate, sketch, sampleLines,
    // LEGACY: visual (kept as a cached paragraph, derived from physical)
    visual: ""
  },
  // LAYER 2 — living state (mutable, changes constantly)
  residency: { status, room, bed, since, rentShare, contributesRent, partnerOf },
  location, activity,
  clothing: 'dressed' | 'sleepwear' | 'undressed' | 'showering' | 'towel',
  mood: -1..1,
  moodReason: "",
  needs: { hunger, hygiene, energy, social, comfort, stimulation },  // comfort + stimulation NEW
  schedule: { currentBlock, nextBlock, willReturnAt },
  flags: {},
  suspicion: {},

  // LAYER 3 — relationships (per-target)
  relPlayer: {
    trust: -1..1, affection: -1..1, tension: -1..1, respect: -1..1,
    comfort: 0..1,                // NEW
    desire: -1..1,               // NEW
    intimacyLevel: 0..100,       // NEW — derived
    conversationPhase: 'early' | 'familiar' | 'close' | 'intimate',  // NEW — derived
    grievances: [{ text, severity, day, resolved }],  // NEW
    firstMetDay, lastInteractionDay  // NEW
  },

  // LAYER 4 — memory (tiered)
  memory: {
    recent: [{ speaker, text, type, day, tick }],  // NEW — last ~10 exchanges
    facts: [{ text, day, importance, category, valid }],  // expanded: category + valid
    episodes: [{ day, text, decay, importance, emotionalTag, participants[] }],  // expanded
    summary: "",
    summaryRevision: 0,          // NEW
    styleCounters: {             // NEW — anti-repetition
      total, sincePersonal,
      recentTopics: [],
      lastJobMention, lastHobbyMention
    }
  },

  // LEGACY/SHARED
  bibleRevision: 0, bibleChanges: [], arcs: []
}
```

---

## PHASE 0 — SCAFFOLDING & MIGRATION INFRASTRUCTURE ✅ COMPLETE

**Goal:** Establish the migration path and schema infrastructure so every subsequent phase can add fields without breaking existing saves.

**Rationale:** The codebase already uses additive defaults (suspicion, clothing were added without migration). We formalize this pattern and bump the npcs folder version so we can run a proper migration that backfills new fields with defaults for existing saves.

### 0.1 — Bump npcs folder version and write migration

**File: `src/state.js`**
- `FOLDER_VERSIONS.npcs`: 1 → 2
- `MIGRATIONS.npcs`: add migration `{ from: 1, to: 2, fn: (npc) => migrateNpcToV2(npc) }`

**File: `src/npc.js`** (new function)
- `migrateNpcToV2(npc)`: backfills all new fields with defaults:
  - `bible.physical` ← derive from `bible.visual` (parse if possible, else defaults)
  - `bible.personality` ← `{ traits: [], coreTrait: '', hiddenTrait: '', quirks: [], likes: [], dislikes: [] }`
  - `bible.backstory` ← move `bible.baggage/wound/want/blindSpot/boundary/history` into `bible.backstory` object (keep old fields as aliases for compatibility)
  - `bible.interests[].skill` ← 0 for each
  - `relPlayer.comfort` ← 0, `relPlayer.desire` ← 0, `relPlayer.intimacyLevel` ← derive, `relPlayer.conversationPhase` ← 'early', `relPlayer.grievances` ← [], `relPlayer.firstMetDay` ← 1, `relPlayer.lastInteractionDay` ← 1
  - `memory.recent` ← [], `memory.styleCounters` ← `{ total: 0, sincePersonal: 0, recentTopics: [], lastJobMention: -1, lastHobbyMention: -1 }`, `memory.summaryRevision` ← 0
  - `memory.facts[].category` ← 'other' if missing, `memory.facts[].valid` ← true
  - `memory.episodes[].emotionalTag` ← '', `memory.episodes[].participants` ← []
  - `needs.comfort` ← 50, `needs.stimulation` ← 50
  - `moodReason` ← '', `schedule` ← `{ currentBlock: '', nextBlock: '', willReturnAt: null }`
  - Keep `bible.visual` as-is (cached paragraph, will be regenerated in Phase 1)

### 0.2 — Expand CHARACTER_SCHEMA

**File: `src/config.js`**
- Add `physical` to `bible` schema (object, optional, with sub-field specs)
- Add `personality` to `bible` schema (object, optional)
- Add `backstory` to `bible` schema (object, optional) — but keep `baggage/wound/want/blindSpot/boundary/history` as legacy flat fields for backward compat
- Add `skill` to `interests[].itemFields` (number, 0-100, default 0)
- Add `vocabularyLevel`, `catchphrases` to `speech.fields`
- Add `comfort`, `stimulation` to `needs.fields` (0-100, default 50)
- Add `comfort`, `desire`, `intimacyLevel`, `conversationPhase`, `grievances`, `firstMetDay`, `lastInteractionDay` to `relPlayer.fields`
- Add `recent`, `styleCounters`, `summaryRevision` to `memory.fields`
- Add `category`, `valid` to `memory.facts.itemFields`
- Add `emotionalTag`, `participants` to `memory.episodes.itemFields`
- Add `moodReason`, `schedule` to `mutable` section

### 0.3 — Update validateCharacter for nested objects

**File: `src/npc.js`**
- `validateCharacter`: add validation for `bible.physical` (recurse into sub-objects, apply defaults)
- `validateCharacter`: add validation for `bible.personality` (same pattern)
- `validateCharacter`: add validation for `bible.backstory` (if present, validate sub-fields; if absent, derive from legacy flat fields)
- Ensure existing saves without these fields pass validation (all new fields optional with defaults)

### 0.4 — Update createNpcFromBible

**File: `src/sim.js:1595`**
- Add all new fields to the constructor with defaults
- This is the ONLY constructor — every NPC goes through here

### 0.5 — Verify

- `browser_eval`: load existing save, confirm no errors, confirm new fields exist with defaults
- `browser_eval`: `return Object.keys(currentGameState.npcs[Object.keys(currentGameState.npcs)[0]].relPlayer)` — should show new axes
- Confirm `validateCharacter` passes on both old-format and new-format bibles

---

## PHASE 1 — PHYSICAL DESCRIPTION SYSTEM (The 25+ Item Section) ✅ COMPLETE

**Goal:** Replace the flat `visual` string with a structured `physical` object and a `getPhysicalDescriptionForPrompt()` helper that composes it into a paragraph.

**Why first:** Most decoupled (only 4 consumers: image.js ×2, llm.js:buildProsePrompt, config.js:schema). Foundation for the prompt overhaul. Verifiable with vision tool.

### 1.1 — Define the physical object schema

**File: `src/config.js`**
- Full `physical` sub-schema in `CHARACTER_SCHEMA.bible.physical`:
  ```
  height: string, build: string, heightBuild: string (cached "tall and lean"),
  hair: { color, style, length, texture },
  eyes: { color, shape },
  skin: { tone, texture, ethnicity },
  face: { shape, nose, lips, cheekbones, jawline, ears },
  body: { shape, chestSize, buttSize, legs, posture },
  distinguishingFeatures: [string],
  piercings: [{ location, type, description }],
  tattoos: [{ location, description, style }],
  fashion: string,
  accessories: string,
  typicalAttire: { casual, work, sleep, formal },
  voice: { pitch, texture, accent },
  gait: string,
  scent: string,
  genitals: string (gated by contentConfig.mature)
  ```

### 1.2 — Build physical description pools for generation

**File: `src/config.js`** (new constants)
- `PHYSICAL_POOL_HAIR`: colors, styles, lengths, textures (weighted)
- `PHYSICAL_POOL_EYES`: colors, shapes
- `PHYSICAL_POOL_SKIN`: tones, textures, ethnicities
- `PHYSICAL_POOL_FACE`: shapes, noses, lips, cheekbones, jawlines, ears
- `PHYSICAL_POOL_BODY`: shapes, builds, heights, chestSizes, buttSizes, legs, postures
- `PHYSICAL_POOL_FEATURES`: scars, freckles, glasses, birthmarks, etc.
- `PHYSICAL_POOL_PIERCINGS`: locations, types
- `PHYSICAL_POOL_TATTOOS`: styles, locations
- `PHYSICAL_POOL_FASHION`: style descriptors
- `PHYSICAL_POOL_VOICE`: pitches, textures, accents
- `PHYSICAL_POOL_SCENT`: scent descriptors
- Each pool seeded by `genSeed` for determinism

### 1.3 — Generate physical object in rollCastSlot

**File: `src/sim.js:rollCastSlot`**
- After temperament/speech, generate `physical` from pools using `charRng`
- Add to `structured.physical`
- Keep `structured.visual = ''` (will be derived from physical in prose expansion)

### 1.4 — Update expandCharacterProse to fill physical details

**File: `src/llm.js:expandCharacterProse` + `buildProsePrompt`**
- `buildProsePrompt`: include the generated physical fields as constraints ("The character has [hair.color] [hair.style] hair, [eyes.color] eyes, [skin.tone] skin, [body.shape] build")
- Ask LLM to fill in the remaining descriptive fields (fashion, accessories, voice, gait, scent, distinguishing features, piercings, tattoos)
- LLM returns: `{ physical: { ...filledFields }, visual: "composed paragraph", history, sketch, sampleLines, name }`
- Merge LLM-returned physical fields with seed-generated ones (seed fields win, LLM fills gaps)
- Generate `visual` as a cached paragraph from the full physical object

### 1.5 — Build getPhysicalDescriptionForPrompt helper

**File: `src/npc.js`** (new function)
- `getPhysicalDescriptionForPrompt(npc)`: reads `npc.bible.physical`, composes a single descriptive paragraph
- Format: "Tall and lean, with shoulder-length wavy auburn hair, green almond-shaped eyes, and warm olive skin. Heart-shaped face with a straight nose and full lips. Athletic build, small chest, long legs. Wears thrifted vintage — oversized sweaters, mom jeans, silver ear piercings. Moves with a slight slouch, smells faintly of bergamot."
- Respects clothing state: if `npc.clothing === 'sleepwear'`, append "currently in sleepwear"; if `npc.clothing === 'towel'`, append "wrapped in a towel"; etc.
- This is the function `buildNpcBlock` will call in Phase 2

### 1.6 — Update image.js to consume structured physical

**File: `src/image.js`**
- `buildImagePrompt`: replace `npc.bible.visual` with `getPhysicalDescriptionForPrompt(npc)` for character layers
- `buildCharacterPrompt`: same replacement
- Keep `npc.bible.visual` as a fallback if `physical` is absent (backward compat)

### 1.7 — Update renderCharPreview to show physical summary

**File: `src/ui.js:renderCharPreview`**
- Add a `char-preview-physical` element to the template showing a one-line physical summary (height/build + hair + distinguishing feature)
- This gives the player a visual sense of their roommate during creation review

### 1.8 — Verify

- `browser_eval`: generate a new character, confirm `bible.physical` is populated with all fields
- `browser_eval`: `return getPhysicalDescriptionForPrompt(currentGameState.npcs[Object.keys(currentGameState.npcs)[0]])` — confirm readable paragraph
- `vision`: generate a character image via the new prompt, verify it matches the physical description (hair color, build, etc.)
- `vision`: generate a scene image with the NPC present, verify character appears correctly
- Confirm existing saves still load (Phase 0 migration backfills physical)

---

## PHASE 2 — PROMPT & CONVERSATION OVERHAUL ✅ COMPLETE

**Goal:** Replace `buildNpcBlock` with `buildNpcBlockV2` that feeds from all 5 layers. Expand the output contract to include `actions` and `internal`. Wire `validateProposal`/`applyProposal` for the new fields.

**Why second:** Depends on Phase 1 (physical). This is the highest-impact change — it's what makes the NPC feel alive in conversation. Builds on the existing pipeline without breaking it.

### 2.1 — Build buildNpcBlockV2

**File: `src/llm.js`** (new function alongside `buildNpcBlock`)
- Structure the block as labeled sections:
  ```
  === {name} (ID: {id}) ===
  [Physical]: {getPhysicalDescriptionForPrompt(npc)} — what the player sees right now
  [Temperament]: warmth {w}, volatility {v}, openness {o}, conscientiousness {c}, assertiveness {a}
    → {temperamentDirective(npc)} — behavioral directive derived from axes
  [Personality]: {traits.join(', ')} — core: {coreTrait}, hidden: {hiddenTrait}
    Quirks: {quirks.join(', ')}
    Likes: {likes.join(', ')}, Dislikes: {dislikes.join(', ')}
  [Occupation]: {title} ({hours})
  [Backstory]: Want: {want}. Wound: {wound}. Blind spot: {blindSpot}. Boundary: {boundary}.
  [Speech]: verbosity {v}, formality {f}, humor {h}, profanity {p}
    Verbal tics: {verbalTics.join(', ')}
    Texting style: {textingStyle}
  [Current state]: Mood: {moodLabel} ({moodReason}). Currently: {activity}. Wearing: {clothingLabel}.
  [Needs]: {needsLine} + comfort/stimulation
  [Relationship with player]: {conversationPhase} — {relationshipDirective(npc)}
    trust {t}, affection {a}, tension {t}, respect {r}, comfort {c}, desire {d}
    {grievancesLine(npc)}
  [Relationships with others]: {castWebLines}
  [Memories — recent]: {recentExchanges}
  [Memories — facts]: {factsLine}
  [Memories — episodes]: {episodesLine}
  [Memories — summary]: {summary}
  [Style tracking]: avoid repeating {recentTopics}. {sincePersonalLine}
  ```

### 2.2 — Build temperament directive helper

**File: `src/llm.js`** (new function)
- `temperamentDirective(npc)`: maps temperament axes to behavioral directives:
  - warmth > 0.5: "engaged, caring, warm in interactions"
  - warmth < -0.3: "polite but distant, guarded"
  - volatility > 0.5: "emotionally reactive, quick to show feelings"
  - volatility < -0.3: "steady, composed, rarely shows strong emotion"
  - openness > 0.5: "shares freely, curious about others"
  - openness < -0.3: "guarded about personal matters, deflects"
  - assertiveness > 0.5: "direct, takes charge in conversations"
  - assertiveness < -0.3: "passive, waits for others to lead"
  - conscientiousness > 0.5: "careful with words, thinks before speaking"
  - conscientiousness < -0.3: "careless, says things without thinking"
  - Combine multiple into a comma-separated directive string

### 2.3 — Build relationship directive helper

**File: `src/llm.js`** (new function)
- `relationshipDirective(npc)`: maps relationship axes + phase to behavioral directives:
  - Phase "early": "You barely know them. Be polite but neutral. Don't assume familiarity."
  - Phase "familiar": "You've gotten to know them. Be warmer, reference shared experiences."
  - Phase "close": "You're close. Be warm and open. Small gestures matter."
  - Phase "intimate": "You're deeply connected. Physical and emotional closeness colors everything."
  - High tension (> 0.4): "There's tension between you. Be guarded, short, or sharp."
  - High trust (> 0.5): "You trust them. You can be vulnerable."
  - Low affection (< -0.2): "You're not fond of them. Be cool, keep distance."
  - High desire (> 0.3): "There's attraction. Notice their body, their proximity. Let it color your responses."

### 2.4 — Build conversation phase derivation

**File: `src/npc.js`** (new function)
- `deriveConversationPhase(relPlayer)`: computes `intimacyLevel` and `conversationPhase`
  - `intimacyLevel = (relPlayer.trust + 1 + relPlayer.affection + 1 + relPlayer.comfort * 2) / 4 * 100` (roughly 0-100)
  - Phase: < 20 = 'early', < 40 = 'familiar', < 70 = 'close', >= 70 = 'intimate'
  - Call this whenever relationship deltas are applied (in `applyRelDelta`)

### 2.5 — Build grievances line helper

**File: `src/llm.js`** (new function)
- `grievancesLine(npc)`: formats unresolved grievances:
  - "Grievances: you haven't done dishes in 3 days (unresolved); you were rude last Tuesday (unresolved)"
  - Empty if no unresolved grievances

### 2.6 — Expand the output contract in buildScenePrompt

**File: `src/llm.js:buildScenePrompt`**
- Update the JSON format section to include:
  ```
  "actions": ["*leans against the counter*", "*runs hand through hair*"],
  "internal": "optional brief thought the NPC has but doesn't say",
  ```
- Update CRITICAL RULES to explain actions (physical actions in asterisks) and internal (brief inner thought)
- Keep all existing fields (narration, dialogue, relationshipDeltas, moodDeltas, effects, memoryAdditions)

### 2.7 — Update validateProposal for new output fields

**File: `src/npc.js:validateProposal`**
- Add validation for `actions`: must be array of strings, max 5, each max 120 chars
- Add validation for `internal`: must be string, max 300 chars, optional
- These are additive — proposals without them still validate

### 2.8 — Update applyProposal for new output fields

**File: `src/npc.js:applyProposal`**
- In the logEntries section, add handling for `actions`:
  - Push each action as `{ type: 'action', text: actionText }`
- Add handling for `internal`:
  - Push as `{ type: 'internal', text: internalText }`
- These get rendered in the narration log (Phase 2.9)

### 2.9 — Update renderNarrationLog for actions and internal

**File: `src/render.js:renderNarrationLog`**
- Add CSS classes for `.log-action` (italic, action-style) and `.log-internal` (italic, dimmer, thought-style)
- Render action entries as: `*leans against the counter*` in italics
- Render internal entries as: `(thinking: ...) ` in dimmer italic
- Interleave with narration/dialogue in order

### 2.10 — Update addLogEntry for new entry types

**File: `src/ui.js:addLogEntry`**
- Handle `type: 'action'` and `type: 'internal'` entry types
- Persist them in the session log with their type for proper rendering

### 2.11 — Wire buildNpcBlockV2 into the prompt pipeline

**File: `src/llm.js:buildScenePrompt` + `buildImPrompt`**
- Replace `buildNpcBlock(npc)` calls with `buildNpcBlockV2(npc)`
- This is the flip — once verified, the old `buildNpcBlock` becomes dead code
- Keep `buildNpcBlock` in the file for now (can be removed in a cleanup pass)

### 2.12 — Update buildImPrompt for V2

**File: `src/llm.js:buildImPrompt`**
- Use `buildNpcBlockV2` for the NPC block
- Keep the narrower IM output contract (dialogue + deltas only, no narration/actions)
- But add `internal` to the IM contract (you can have thoughts while texting)

### 2.13 — Anti-purple-prose directives

**File: `src/prompt.js`** (expand `buildStyleSection` or add `buildAntiProseSection`)
- Add explicit anti-purple-prose directives to every prompt:
  - "Write like a person, not a novelist. No flowery prose."
  - "No 'a symphony of...' or 'the dance of...' metaphors."
  - "No listing three things in a row with the same sentence structure."
  - "No starting sentences with 'The' more than twice in a row."
  - "No describing eyes as 'orbs', 'pools', or 'windows to the soul'."
  - "No 'could feel the tension in the air'."
  - "Characters speak like real people. Short sentences. Incomplete thoughts."
  - "Actions are physical and specific, not abstract ('shifts weight' not 'embodies unease')."
- These are the result of real experience with LLMs writing like novelists

### 2.14 — Verify

- `browser_eval`: trigger a conversation (`doTalk(npcId)`) and confirm the prompt includes physical, personality, style tracking sections
- `browser_eval`: confirm the response includes `actions` and `internal` fields (or at least accepts them)
- `browser_eval`: confirm the narration log renders actions in italics and internal thoughts in dimmer text
- `browser_eval`: confirm no perchanceErrors or console errors
- Test with a new game (Phase 1 physical) and an existing save (Phase 0 migration)

---

## PHASE 3 — RELATIONSHIP EXPANSION ✅ COMPLETE

**Goal:** Add `comfort`, `desire`, `intimacyLevel`, `conversationPhase`, `grievances` to `relPlayer`. Make relationships visible to the player. Wire relationship consequences.

**Why third:** Depends on Phase 2 (the prompt needs to reference the new axes). The relationship system is the game's core progression mechanic — expanding it deepens the social sim.

### 3.1 — Update applyRelDelta for new axes

**File: `src/npc.js:applyRelDelta`**
- Add `comfort` (0-1, clamped) and `desire` (-1..1, clamped) to the delta application
- After applying deltas, call `deriveConversationPhase` to update `intimacyLevel` and `conversationPhase`
- Update `lastInteractionDay` to the current day

### 3.2 — Update validateProposal for new axes

**File: `src/npc.js:validateProposal`**
- Add validation for `comfort` and `desire` deltas (same range as existing: max ±0.3 per call)
- These are additive — proposals without them still validate

### 3.3 — Update applyNpcToNpcDelta for new axes

**File: `src/npc.js:applyNpcToNpcDelta`**
- Add `comfort` and `desire` to NPC-to-NPC relationship tracking
- Update `createBlankPair` to include the new axes

### 3.4 — Grievance system

**File: `src/npc.js`** (new functions)
- `addGrievance(npc, text, severity, day)`: push `{ text, severity, day, resolved: false }` to `relPlayer.grievances`
- `resolveGrievance(npc, index)`: mark grievance as resolved
- `getUnresolvedGrievances(npc)`: filter for unresolved grievances
- Grievances are added via `memoryAdditions` — the LLM can propose them:
  ```
  "memoryAdditions": { "npc_id": { "grievances": [{ "text": "didn't do dishes", "severity": 0.3 }] } }
  ```
- Update `validateProposal` to validate grievance additions (text required, severity 0-1)
- Update `applyProposal` to apply grievances via `addGrievance`

### 3.5 — Grievance resolution through gameplay

**File: `src/ui.js`** (various action handlers)
- When the player does something that addresses a grievance (cooks, cleans, apologizes), resolve matching grievances
- `checkQuestCompletion`: resolving a grievance can complete a quest
- The LLM can also propose grievance resolution via `memoryAdditions.grievances[].resolved = true`

### 3.6 — Relationship display in UI

**File: `src/render.js`**
- `renderPresentList`: expand the NPC card to show relationship info:
  - Phase indicator (early/familiar/close/intimate) as a label
  - Mood indicator (existing)
  - Activity (existing)
  - Small relationship bars or indicators for trust/affection/tension (optional, could be behind a "details" expand)
- This makes relationships VISIBLE to the player, addressing the current "invisible to the player" problem

### 3.7 — Relationship panel (expandable detail view)

**File: `src/render.js`** (new function)
- `renderNpcDetailPanel(npc)`: expanded view showing:
  - Name, occupation, physical one-liner
  - Temperament summary (warm/cool, volatile/steady, etc.)
  - Relationship axes with labels and phase
  - Unresolved grievances (if any)
  - This appears when the player clicks "details" on an NPC card or opens a relationship view

### 3.8 — Relationship consequence tuning

**File: `src/config.js`**
- Expand `REL_CONSEQUENCES` to include comfort/desire thresholds:
  - Low comfort (< 0.2): NPC avoids physical proximity, keeps conversations short
  - High comfort (> 0.7): NPC is physically relaxed around player, initiates casual touch
  - High desire (> 0.5): NPC flirts, notices player's body, longer eye contact
  - High desire + high comfort + high affection: NPC may initiate romantic/physical advances
- Update `checkRelConsequences` in `ui.js` to check the new axes

### 3.9 — CastWeb expansion

**File: `src/sim.js:generateCastWeb`**
- Add `comfort` and `desire` to NPC-to-NPC relationship initialization
- These start at 0 for new pairs
- `computeCompatibility` and `computeFriction` can feed into initial comfort

### 3.10 — Verify

- `browser_eval`: confirm `relPlayer` has 6 axes + phase + grievances after a conversation
- `browser_eval`: trigger a conversation, confirm the LLM prompt includes the new axes
- `browser_eval`: confirm `intimacyLevel` and `conversationPhase` update when relationship deltas are applied
- `browser_eval`: add a grievance via memoryAdditions, confirm it appears in the prompt on the next turn
- Visual: confirm the NPC card shows relationship phase

---

## PHASE 4 — MEMORY PIPELINE (Tiered + Retrieval) ✅ COMPLETE

**Goal:** Replace the flat memory system with a tiered structure (recent, facts with categories, episodes with emotional tags, summary with revision, style counters). Implement relevance-based retrieval at prompt time.

**Why last:** Highest risk — touches the most consumers (npc.js, llm.js, state.js). Most complex. But also the highest long-term value — this is what makes an NPC "remember" something from 1000 messages ago.

### 4.1 — Tier 1: Recent exchanges (conversation buffer)

**File: `src/npc.js`** (new functions)
- `addRecentExchange(npc, speaker, text, type, day, tick)`: push to `memory.recent`, cap at 10
- `getRecentExchanges(npc)`: return the last 10 exchanges as formatted text
- Wire into `applyProposal`: after applying narration/dialogue, also push to `memory.recent` for each active NPC
- The `type` field: 'narration', 'dialogue', 'action', 'internal', 'player_input'

### 4.2 — Tier 2: Facts with categories

**File: `src/npc.js`**
- Update `addMemoryFact(npc, fact, category)`: add `category` field ('player' | 'household' | 'self' | 'other'), add `valid` field (true)
- Update `buildMemorySlice` (or new `buildMemorySliceV2`): include category in the fact list
- `invalidateFact(npc, index)`: mark fact as `valid: false` (for when facts change)
- Increase `MEMORY_BUDGET.maxFacts` from 20 to 40 (tiered system can hold more)

### 4.3 — Tier 3: Episodes with emotional tags

**File: `src/npc.js`**
- Update `addMemoryEpisode(npc, day, text, importance, emotionalTag, participants)`:
  - Add `emotionalTag` (string: 'positive', 'negative', 'neutral', 'tense', 'tender')
  - Add `participants` (array of NPC IDs + 'player')
- Increase `MEMORY_BUDGET.maxEpisodes` from 15 to 30
- Update `decayMemory`: decay rate could vary by importance (important episodes decay slower)

### 4.4 — Tier 4: Summary with revision tracking

**File: `src/npc.js` + `src/llm.js`**
- Update `compactMemory`: when compacting, bump `summaryRevision`
- Track which episodes were included in which summary revision (for invalidation)
- When a fact is invalidated (becomes `valid: false`), bump `summaryRevision` and recompute summary if the fact was in the current summary's scope

### 4.5 — Tier 5: Style counters (anti-repetition)

**File: `src/npc.js`** (new functions)
- `updateStyleCounters(npc, topic)`: called after each exchange
  - Increment `total`
  - If topic is personal (relationships, feelings, past), increment `sincePersonal`
  - Push topic to `recentTopics` (cap 10, FIFO)
  - If topic relates to NPC's occupation, update `lastJobMention`
  - If topic relates to NPC's interests, update `lastHobbyMention`
- `getStyleDirective(npc)`: returns anti-repetition directive:
  - "You've recently discussed: {recentTopics.join(', ')}. Vary your topics."
  - "It's been {sincePersonal} exchanges since you talked about something personal."
  - "You mentioned work {ticksSinceJobMention} ticks ago — don't bring it up again unless relevant."
- Topic extraction: the LLM can propose a `topic` field in its output, or we extract keywords from the player's action text

### 4.6 — Relevance-based retrieval

**File: `src/npc.js`** (new function)
- `retrieveRelevantMemories(npc, query, limit)`: score facts and episodes by relevance to the query
  - **Option A (keyword-scored, simpler):** tokenize the query, score each fact/episode by keyword overlap (case-insensitive, stem-aware). Return top N.
  - **Option B (embedding-based, like ai-character-chat):** generate embeddings for the query and for each fact/episode, score by cosine similarity. Requires a transformer model (can use a small one loaded from esm.sh or a per-chance API). More accurate but heavier.
  - **Recommendation:** Start with Option A (keyword-scored). It's simpler, requires no external model, and is "good enough" for the first pass. Upgrade to Option B in a later phase if the keyword approach proves insufficient.
- `retrieveRelevantMemories` returns: `{ facts: [...top N], episodes: [...top N] }` — relevant memories from ALL tiers, not just the last 10

### 4.7 — Generate search queries at prompt time

**File: `src/llm.js`** (new function)
- Before building the NPC block, generate 2-4 search queries from the player's action text:
  - Extract keywords, entities, and topics from the player's input
  - These queries are used to retrieve relevant memories
- `buildNpcBlockV2` calls `retrieveRelevantMemories(npc, queries)` and includes the results in the `[Memories — retrieved]` section
- This is the key mechanism: the NPC "remembers" relevant past events even if they were 1000 messages ago

### 4.8 — Update buildNpcBlockV2 for retrieved memories

**File: `src/llm.js:buildNpcBlockV2`**
- Replace the flat `mem.facts.join('; ')` with:
  - `[Memories — recent]: {getRecentExchanges(npc)}` — last 3-5 verbatim exchanges
  - `[Memories — retrieved]: {retrievedFacts.join('; ')}; {retrievedEpisodes.join('; ')}` — relevance-scored
  - `[Memories — facts]: {allFacts.filter(valid).join('; ')}` — all valid facts (if room)
  - `[Memories — summary]: {summary}` — compressed older history
  - `[Style tracking]: {getStyleDirective(npc)}` — anti-repetition

### 4.9 — Update buildMemorySlice for V2

**File: `src/npc.js`**
- `buildMemorySliceV2(npc, query)`: returns the full tiered memory object:
  ```
  {
    recent: getRecentExchanges(npc),
    facts: (npc.memory.facts || []).filter(f => f.valid).map(f => f.text),
    retrievedFacts: retrieveRelevantMemories(npc, query).facts,
    episodes: (npc.memory.episodes || []).filter(e => e.decay > 0.2).map(e => e.text),
    retrievedEpisodes: retrieveRelevantMemories(npc, query).episodes,
    summary: npc.memory.summary || '',
    styleDirective: getStyleDirective(npc),
  }
  ```
- Wire `assembleContext` to pass the player's action text as the query

### 4.10 — Update assembleContext for V2 memory

**File: `src/npc.js:assembleContext`**
- Pass the player's action text (or last message) to `buildMemorySliceV2` so it can retrieve relevant memories
- For scene prompts: use the player's action as the query
- For IM prompts: use the texted message as the query
- For ambient NPCs: keep the simple slice (no retrieval — they're not speaking)

### 4.11 — Update compactMemory for tiered structure

**File: `src/llm.js:compactMemory`**
- When compacting, summarize the oldest episodes (not the most recent) into the summary
- Keep recent exchanges separate (they're in `memory.recent`, not compacted)
- Bump `summaryRevision`
- Only compact when `memory.recent` + `memory.episodes` exceed a combined budget (not just episodes alone)

### 4.12 — Update shouldCompactMemory

**File: `src/npc.js:shouldCompactMemory`**
- New trigger: compact when `memory.episodes.length >= maxEpisodes` OR `memory.recent.length >= 10 AND memory.episodes.length > 5`
- The idea: don't compact until you have both a rich recent buffer AND enough episodes to justify compression

### 4.13 — Topic extraction from LLM output

**File: `src/llm.js`**
- Add optional `topic` field to the output contract: the LLM proposes what the exchange was about
  ```
  "topic": "cooking"  // or "personal/feelings", "work/stress", etc.
  ```
- `applyProposal`: if `topic` is present, call `updateStyleCounters(npc, topic)` for each active NPC
- This is more reliable than keyword extraction from the player's text
- `validateProposal`: validate `topic` as optional string, max 60 chars

### 4.14 — Update memoryAdditions for tiered structure

**File: `src/npc.js:validateProposal + applyProposal`**
- `memoryAdditions` now supports:
  ```
  {
    "npc_id": {
      "facts": [{ "text": "...", "category": "player", "importance": 0.8 }],
      "episodes": [{ "text": "...", "importance": 0.6, "emotionalTag": "tender", "participants": ["player", "npc_id"] }],
      "grievances": [{ "text": "...", "severity": 0.3 }]
    }
  }
  ```
- All fields optional, backward compatible (bare string in facts still works — defaults to category 'other')

### 4.15 — Migration for existing flat memory

**File: `src/state.js`** (update Phase 0 migration)
- Existing `memory.facts` (array of strings) → `memory.facts` (array of `{ text, day: 0, importance: 1, category: 'other', valid: true }`)
- Existing `memory.episodes` (array of `{ day, text, decay, importance }`) → add `emotionalTag: ''`, `participants: []`

### 4.16 — Verify

- `browser_eval`: have a conversation, confirm `memory.recent` populates with exchanges
- `browser_eval`: confirm facts have categories after the LLM proposes them
- `browser_eval`: confirm style counters update after exchanges with topic
- `browser_eval`: after 10+ exchanges, confirm compactMemory triggers and summaryRevision bumps
- `browser_eval`: confirm `retrieveRelevantMemories` returns relevant facts for a keyword query
- `browser_eval`: confirm the prompt includes retrieved memories section
- Long-term test: have a conversation about a specific topic, then 20 turns later mention it again — confirm the NPC "remembers" via retrieved memories

---

## PHASE 5 — PERSONALITY SYSTEM (Traits, Quirks, Likes/Dislikes) ✅ COMPLETE

**Goal:** Populate `bible.personality` with traits, quirks, likes, dislikes, core trait, hidden trait. These feed the prompt's `[Personality]` section and give the NPC behavioral texture beyond temperament axes.

**Why fifth:** The personality section was added to the prompt in Phase 2 but the fields are empty. This phase fills them. Can run in parallel with Phase 3 or 4.

### 5.1 — Build personality pools

**File: `src/config.js`** (new constants)
- `PERSONALITY_TRAITS_POOL`: ~60 trait tags (reliable, sarcastic, anxious, ambitious, nurturing, guarded, impulsive, methodical, flirtatious, stubborn, curious, cynical, idealistic, territorial, clingy, independent, meticulous, chaotic, diplomatic, blunt, secretive, expressive, stoic, needy, competitive, lazy, perfectionist, easygoing, intense, passive-aggressive, protective, manipulative, vulnerable, confident, insecure, generous, selfish, patient, restless, nostalgic, adventurous, cautious, rebellious, conformist, creative, practical, spiritual, materialistic, sensitive, thick-skinned, loyal, fickle, honest, deceptive, warm, cold, playful, serious, dramatic, understated)
- `QUIRKS_POOL`: ~40 quirk strings ("always hums while cooking", "can't sleep without socks", "collects mismatched mugs", "talks to plants", "names their electronics", "always late by exactly 7 minutes", "has strong opinions about pizza toppings", "saves cardboard boxes", "rereads the same book annually", "pees with the bathroom door open")
- `LIKES_POOL`: ~30 like strings ("rainy mornings", "the smell of fresh laundry", "bad puns", "thrift stores", "loud music", "quiet mornings", "fermented food", "horror movies", "gardening", "deep conversations at 2am")
- `DISLIKES_POOL`: ~30 dislike strings ("small talk", "the sound of chewing", "being touched unexpectedly", "loud chewers", "condescension", "wasting food", "being interrupted", "cold coffee", "sticky counters", "passive-aggressive notes")

### 5.2 — Generate personality in rollCastSlot

**File: `src/sim.js:rollCastSlot`**
- After temperament, generate personality:
  - `traits`: pick 3-5 from the pool, weighted by temperament (high warmth → more warm/social traits; high volatility → more intense/reactive traits)
  - `coreTrait`: pick 1 from traits (the most defining one)
  - `hiddenTrait`: pick 1 from the pool, NOT in traits (something they suppress or don't show — "secretly competitive" or "actually quite sentimental")
  - `quirks`: pick 2-4 from QUIRKS_POOL
  - `likes`: pick 3-5 from LIKES_POOL
  - `dislikes`: pick 3-5 from DISLIKES_POOL
- Add to `structured.personality`

### 5.3 — Update expandCharacterProse for personality

**File: `src/llm.js:buildProsePrompt`**
- Include generated personality fields as constraints
- Ask LLM to write sample lines that reflect the personality traits and quirks
- The LLM can suggest additional quirks (we take 1-2 LLM-suggested quirks alongside the rolled ones)

### 5.4 — Verify

- `browser_eval`: generate a new character, confirm `bible.personality` has traits, quirks, likes, dislikes
- `browser_eval`: confirm the prompt includes the `[Personality]` section with actual content
- `browser_eval`: confirm sample lines reflect the personality
- Confirm existing saves have empty personality (Phase 0 default) — no breakage, just less rich

---

## PHASE 6 — NEEDS EXPANSION (Comfort + Stimulation) ✅ COMPLETE

**Goal:** Add `comfort` and `stimulation` to the needs system. These drive new behaviors: comfort-seeking (NPC moves to comfortable spaces, seeks physical proximity when comfort is low) and stimulation-seeking (NPC seeks entertainment, social activity when bored).

**Why sixth:** Depends on Phase 3 (comfort as a need interacts with comfort as a relationship axis). Low priority but rounds out the needs system.

### 6.1 — Add comfort and stimulation to needs decay/restore

**File: `src/config.js`**
- Add to `NEEDS`: `comfort: { decayPerTick: 0.5, max: 100, warnBelow: 20 }`, `stimulation: { decayPerTick: 1, max: 100, warnBelow: 20 }`
- Add restore sources: comfort restored by being in a comfortable room (living room with entertainment, bedroom with upgraded bed), by physical proximity to trusted people, by relaxing activities
- Stimulation restored by entertainment (TV, games), social interaction, new experiences

### 6.2 — Update resolveTick for new needs

**File: `src/sim.js:resolveTick`**
- Decay comfort and stimulation per tick
- Restore comfort when NPC is in a comfortable room (check facility tiers — upgraded living room, upgraded bedroom)
- Restore stimulation when NPC is doing a leisure activity

### 6.3 — Update needsLine for new needs

**File: `src/llm.js:needsLine`**
- Add comfort and stimulation flags:
  - comfort < 30: "craving comfort"
  - stimulation < 30: "bored, restless"

### 6.4 — New drives for comfort and stimulation

**File: `src/config.js:DRIVE_DEFS`**
- `seek_comfort`: fires when comfort < 25, NPC moves to a comfortable room, activity "relaxing"
- `seek_stimulation`: fires when stimulation < 25, NPC seeks entertainment (TV, games, social), activity "looking for something to do"

### 6.5 — Verify

- `browser_eval`: confirm comfort and stimulation decay over time
- `browser_eval`: confirm they restore in appropriate rooms/activities
- `browser_eval`: confirm the prompt includes comfort/stimulation in the needs line

---

## PHASE 7 — LIVING STATE ENRICHMENT (Mood Reason, Schedule, Clothing) ✅ COMPLETE

**Goal:** Enrich the mutable living state with `moodReason` (why they're in this mood), `schedule` tracking (current/next block, return time), and clothing state integration with the prompt.

**Why seventh:** These are polish layers that make the NPC feel more present. Low risk, additive.

### 7.1 — Mood reason tracking

**File: `src/npc.js`**
- `applyMoodDelta(npc, delta, reason)`: store `moodReason` alongside the mood change
- Update `applyProposal` to pass the reason from the LLM's narration (or derive from the event type)
- `buildNpcBlockV2`: include `moodReason` in the `[Current state]` section: "Mood: tense (frustrated about work)"

### 7.2 — Schedule tracking

**File: `src/sim.js:resolveScheduleActivity`**
- After resolving the schedule block, update `npc.schedule`:
  - `currentBlock`: the current schedule block
  - `nextBlock`: the next block (for anticipation — "heading to work soon")
  - `willReturnAt`: estimated return time for work/commute blocks
- `buildNpcBlockV2`: include schedule info in the prompt: "Schedule: currently in 'morning' block, next is 'work' at 09:00"

### 7.3 — Clothing state in prompt

**File: `src/llm.js:buildNpcBlockV2`**
- Include clothing in the `[Current state]` section
- `getPhysicalDescriptionForPrompt` already appends clothing state (Phase 1.5)
- Add explicit clothing line: "Wearing: sleepwear" / "Wearing: towel (just showered)" / "Wearing: dressed normally"

### 7.4 — Verify

- `browser_eval`: confirm `moodReason` updates when mood changes
- `browser_eval`: confirm `schedule` tracks current/next block
- `browser_eval`: confirm the prompt includes mood reason, schedule, and clothing

---

## PHASE 8 — INTEGRATION, POLISH & CLEANUP ✅ COMPLETE

**Goal:** Remove legacy code paths, ensure all phases work together, final verification pass.

### 8.1 — Remove buildNpcBlock (V1)

**File: `src/llm.js`**
- Delete `buildNpcBlock` (the old version)
- Confirm no callers remain (all should use `buildNpcBlockV2`)

### 8.2 — Remove buildMemorySlice (V1)

**File: `src/npc.js`**
- Delete `buildMemorySlice` (the old version)
- Confirm `assembleContext` and `assembleImContext` use `buildMemorySliceV2`

### 8.3 — Remove legacy visual field

**File: `src/config.js`**
- `CHARACTER_SCHEMA.bible.visual`: make optional (not required)
- Eventually remove it once `getPhysicalDescriptionForPrompt` is the sole source of physical description
- For now keep it as a cached paragraph (regenerated from physical)

### 8.4 — Consolidate backstory fields

**File: `src/config.js` + `src/npc.js`**
- Move `baggage/wound/want/blindSpot/boundary/history` officially into `bible.backstory` object
- Keep flat-field aliases in `validateCharacter` for backward compat with exports/imports
- Update all readers to use `bible.backstory.want` etc.
- Update `exportCharacter`/`importCharacter` to handle the new structure

### 8.5 — Full end-to-end test

- New game: generate a cast, verify physical/personality/memory/relationships all populate
- Existing save: load, verify migration, verify new fields exist with defaults
- Conversation: talk to an NPC, verify the prompt includes all 5 layers
- IM: text an NPC, verify the V2 prompt
- Long conversation: 20+ exchanges, verify memory retrieval works
- Image generation: verify character and scene images use structured physical
- Relationship progression: trigger enough positive interactions to advance phase, verify phase changes

### 8.6 — Performance check

- `browser_eval`: time the prompt construction — ensure adding physical/personality/retrieved memories doesn't blow up token count unreasonably
- If prompt is too long: implement budgeting — cap retrieved memories, cap facts, prioritize recent + retrieved over all facts
- `browser_eval`: check for any console warnings or errors after a full play session

### 8.7 — Documentation

- Update any in-code comments that reference the old NPC shape
- Ensure `AGENTS.md` or equivalent notes the new structure for future sessions

---

## DEPENDENCY GRAPH

```
Phase 0 (Scaffolding)
  ├── Phase 1 (Physical) ──────────────┐
  │                                     ├── Phase 2 (Prompt/Conversation)
  │                                     │     ├── Phase 3 (Relationships)
  │                                     │     │     ├── Phase 6 (Needs)
  │                                     │     │     └── Phase 7 (Living State)
  │                                     │     ├── Phase 5 (Personality) ← can run parallel with 3
  │                                     │     └── Phase 4 (Memory) ← can run parallel with 3/5
  │                                     │
  │                                     └── Phase 8 (Cleanup) ← after all above
```

**Critical path:** 0 → 1 → 2 → 4 → 8
**Parallelizable:** 3, 5, 6, 7 can all run after 2 is complete
**Highest risk:** Phase 4 (memory retrieval) — most consumers, most complex
**Highest impact:** Phase 2 (prompt overhaul) — this is what the player feels

---

## FILE CHANGE MATRIX

| File | P0 | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 |
|------|----|----|----|----|----|----|----|----|----|
| config.js | ✓✓ | ✓✓ | ✓ | ✓ | ✓ | ✓✓ | ✓ | ✓ | ✓ |
| sim.js | ✓ | ✓✓ | | ✓ | | ✓ | ✓ | ✓✓ | |
| npc.js | ✓✓ | ✓ | ✓✓ | ✓✓ | ✓✓ | | | ✓ | ✓✓ |
| llm.js | | ✓✓ | ✓✓ | ✓ | ✓✓ | ✓ | | ✓ | ✓✓ |
| prompt.js | | | ✓ | | | | | | |
| image.js | | ✓✓ | | | | | | | |
| state.js | ✓✓ | | | | ✓ | | | | |
| render.js | | ✓ | ✓ | ✓✓ | | | | | |
| ui.js | | ✓ | ✓ | ✓ | ✓ | | | | |
| drives.js | | | | | | | ✓✓ | | |
| effects.js | | | | | ✓ | | | | |
| stealth.js | | | | | | | | | (verify only) |
| interruption.js | | | | | | | | | (verify only) |
| index.html | | ✓ | ✓ | ✓ | | | | | |

✓ = minor changes, ✓✓ = major changes

---

## RISK MITIGATIONS

1. **Prompt token explosion:** Adding physical + personality + retrieved memories to the prompt could blow past context limits. Mitigation: implement a token budget in `buildNpcBlockV2` that caps each section. Prioritize: current state > relationship > recent > retrieved > facts > summary > style. Drop sections from the bottom if over budget.

2. **Memory retrieval quality:** Keyword-scored retrieval may return irrelevant results. Mitigation: weight by recency × relevance, and give the LLM's `topic` field priority over raw keyword extraction. Monitor and upgrade to embeddings if needed.

3. **Migration breakage:** The Phase 0 migration touches every NPC in every save. Mitigation: snapshot before migration (already in `checkAndMigrateFolder`), test with real saves, provide a fallback that loads the old shape if migration fails.

4. **Two NPC cap (SCENE.maxActiveNpcs = 2):** The prompt overhaul makes each NPC block larger. With 2 active NPCs, the prompt could be very long. Mitigation: the token budget system (risk 1) handles this. Also, ambient NPCs stay as one-line sketches (unchanged).

5. **LLM output reliability:** The expanded output contract (actions, internal, topic) gives the LLM more to get wrong. Mitigation: all new fields are optional in validation — a response without them still works. The parse ladder in `callLLM` already handles malformed JSON.

6. **Performance:** Memory retrieval at prompt time adds latency. Mitigation: keyword scoring is O(n) where n is the number of facts+episodes (~70 max). This is negligible. Embedding-based retrieval would add a model call — only upgrade if needed.

---

## ESTIMATED EFFORT PER PHASE

| Phase | Files | Complexity | Risk | Impact |
|-------|-------|------------|------|--------|
| 0: Scaffolding | 4 | Medium | Low | Foundation |
| 1: Physical | 5 | Medium | Low | High (visual quality) |
| 2: Prompt | 5 | High | Medium | Highest (conversational depth) |
| 3: Relationships | 4 | Medium | Low | High (progression) |
| 4: Memory | 4 | Highest | High | High (long-term recall) |
| 5: Personality | 2 | Low | Low | Medium (behavioral texture) |
| 6: Needs | 3 | Low | Low | Low (polish) |
| 7: Living State | 3 | Low | Low | Low (polish) |
| 8: Cleanup | 8 | Low | Low | (maintenance) |
