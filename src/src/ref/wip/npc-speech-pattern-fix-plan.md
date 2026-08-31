# NPC speech-pattern fix — 2026-08-30 (tics sandwich, verbatim loops, canned entry greetings)

**Status: Open — all five fixes implemented and verified live on 2026-08-30.**
User's final confirmation outstanding (needs a real in-game conversation on a
save); move to `complete/` once the behaviour is confirmed good in play. This
was a bug fix, not a phased overhaul, so there is no paired session prompt.

Covers the six player-reported symptoms from one feedback session, all around
Megan's dialogue becoming a scripted loop:

1. Every spoken line came out as "honestly… X, right? fair enough." — her
   speech tics/catchphrases were being read as a mandatory template.
2. Lines repeated verbatim inside one conversation ("(he's not wasting any
   time. i love that.)" twice; an entire arrival beat twice).
3. Every room-entry ("You walk into the room.") got the same canned
   "back already" greeting.
4. Narration kept re-describing the static pose and recycling filler
   micro-actions (*slowly blinks*, *tilts her head back*).
5. Dialogue answered the model's own question instead of the player's actual
   message (generic "don't take too long" responses that would fit any turn).
6. Internal thoughts were monotonous — one frame ("(he's definitely…)") and
   one tone-topic ("sexual anticipation") recycled.

The save's live transcript confirmed all six on Megan (`npc_1u01r19_0`): 6/6
spoken lines opened "honestly...", all ended "right?", 3/6 ended "fair
enough.", and the transcript contained byte-identical repeated lines.

---

## 1. Tics and catchphrases were read as a mandatory format

### Root cause

`buildNpcBlockV2`'s `[Speech]` line (llm.js) rendered the profile's rolls
(sim.js verbalTics/catchphrase roll; config.js `VERBAL_TICS`) as:

```
[Speech]: verbosity…, texting: lowercase with selective ellipsis
  tics: honestly, right?
  Things they say: "fair enough"
```

and `buildStyleSection` (prompt.js) had no rule about repetition of tics.
Treated as a required template, the model produced
"honestly… <content> right? fair enough." for nearly every line.

### Fix

- `[Speech]` reworded (llm.js `buildNpcBlockV2`): flavor and catchphrases are
  now explicitly RARE — at most ONE tic per line, never in most lines, never a
  required opener/closer/format; catchphrases "a handful per conversation at
  most", never a filler ending.
- `buildStyleSection` (prompt.js) gained an ANTI-PURPLE-PROSE bullet: tics and
  catchphrases are "RARE seasoning, never a format"; never build a
  "tic … content … tic" template; if the transcript already shows one
  overused, STOP using it entirely.

### Verification (live page)

- `buildNpcBlockV2` with Megan's real saved npc → `[Speech]` shows the new
  RARE wording for both tics and catchphrases.

---

## 2. Verbatim copy-loop (repeating own transcript lines)

### Root cause

The writer sees its own full transcript in `[Memories — recent]`
(`getRecentExchanges`, npc.js) and, under repetition pressure, re-emits prior
lines word-for-word — the save had the same internal thought twice and two
identical arrival beats.

### Fix

Two layers:
- New CRITICAL RULES bullet (llm.js `buildScenePrompt`): "NEVER reuse a line
  from [Memories — recent]… Repeating yourself verbatim is the single most
  visible failure in this conversation."
- **Mechanical guard** (llm.js): `normalizeDupText` / `findTranscriptDuplicates`
  scan every produced dialogue/internal/action line (normalized to lowercase
  alphanumerics, asterisks stripped, ≥15 chars to avoid false positives)
  against the speakers' scene-channel transcript. `callLLM` runs this after
  normalization; on any hit it logs and calls `retryWithDedupRule` — ONE extra
  `generateText` with a HARD RULE banning the offending lines (max 3, quoted)
  — re-validates the retry via `validateProposal` + `stripWriterJudgement`, and
  accepts it only if valid. One retry max; a stubborn second failure is
  accepted rather than burning more generations.

### Verification (live page)

- `findTranscriptDuplicates` correctly flagged a new proposal containing
  "he's not wasting any time. i love that." against Megan's real memory.
- `retryWithDedupRule` returns the parsed retry object (single valid JSON).
- player_input entries are deliberately excluded from the dedup set, so an NPC
  legitimately echoing the player's own words is not blocked.

---

## 3. Canned room-entry greeting

### Root cause

Every room change calls `callLLM(context, 'You walk into the room.')`
(ui.js:7553) — a literal playerAction — and the scene prompt gave the model no
guidance for an entry beat, so it greeted each arrival with the same
"back already / took you long enough, fair enough" frame (the two entry turns
at 19:39 and 20:49 in the save were identical).

### Fix

New `buildTurnTypeDirective(context, playerAction)` (llm.js), fired only on the
exact literal `'You walk into the room.'`: the player has said nothing yet, so
the NPC must not greet/comment on the arrival ("back already", "you again" and
friends are banned), may speak unprompted only with a genuine reason and only
with a line DIFFERENT from any arrival line already in the transcript, and is
otherwise allowed to say nothing at all (narration shows the room settling).
It lands right before the output contract (`buildScenePrompt`, after the
CRITICAL RULES literal and beside the mature-on line) so it's the last thing
the model reads before composing.

### Verification (live page)

- `buildTurnTypeDirective({}, 'You walk into the room.')` returns the TURN
  TYPE block; any other playerAction returns `''` (never fires on a real
  message).

---

## 4. Static-pose re-description + filler micro-actions

### Root cause

The old CRITICAL RULES told the model to keep an established stance ("a stance
once established persists"), which it over-applied by re-describing the pose
each turn ("sprawled across the bed, pale skin against dark sheets"), and it
padded turns with *slowly blinks* / *tilts her head back* fillers.

### Fix

Two new CRITICAL RULES bullets (llm.js):
- Narration must ADVANCE — show new motion/engagement/sensory detail reacting
  to the player's action; never re-state an established pose/body/room in the
  same words (the existing "stance persists" rule stays, but now explicitly
  means the character stays put, not that the narration re-says it).
- actions must be meaningful reactions; filler micro-actions (blink, head
  tilt, weight shift, posture) are banned unless that exact movement is a real
  reaction. Fewer actions (even zero) beats a recycled one.

These ride the same mechanical dedup guard: a re-emitted "sprawled across the
bed" narration is a line ≥15 chars that matches the transcript, so it triggers
the retry ban too.

### Verification (live page)

- Full composed `buildScenePrompt` (real Megan save, minimal fabricated
  context) contains the narrAdvance and no-filler bullets (asserted by string
  match).

---

## 5. Non-sequitur dialogue (not answering the player)

### Root cause

The prompt never told the writer to answer the specific content of the
player's action, so under the pressure to produce a line the model answered a
topic category or its own invented question.

### Fix

New CRITICAL RULES bullet (llm.js): "Read 'Player's action' again before
writing. Your dialogue MUST directly respond to the specific content of that
line… Never answer a topic category or a vibe instead of the message itself;
if the reply could be swapped into any other exchange unchanged, it is wrong."

---

## 6. Monotone internal thoughts + single-topic fixation

### Root cause

`internal` had no variety rule, so the model reused one thought frame
("(he's definitely…)") and `topic` was being filled with emotional tone labels
("sexual anticipation") that repeat, making the style counter's recent-topic
tracking monotone too.

### Fix

Two new CRITICAL RULES bullets (llm.js):
- internal thoughts must vary in structure and reference something SPECIFIC
  just said/done (the swim, the question, the towel); never reuse a thought
  frame turn after turn, never repeat a thought verbatim.
- topic must describe what the exchange was CONCRETELY about ("swimming
  plans", "moving to the bedroom", "a missing towel") — never an emotional
  tone label ("sexual anticipation", "tension"); a repeating topic label is a
  failure to track variety.

---

## Files touched

| File | Change | `?v=` |
|---|---|---|
| `src/src/srcfiles/llm.js` | `[Speech]` reword; `buildTurnTypeDirective`; 7 new CRITICAL RULES bullets; `normalizeDupText`/`findTranscriptDuplicates`/`retryWithDedupRule` + `callLLM` wiring | 46 → 47 |
| `src/src/srcfiles/prompt.js` | ANTI-PURPLE-PROSE tic/catchphrase rule | 19 → 20 |
| `index.html` | version bumps above | — |

The `?v=` bumps follow the project convention (every edited source file bumps
its script tag's `?v=` for cache-busting — same pattern as
bug-fix-audit-2026-08-30.md).

## Notes / leftovers

- No NPC profile or save data was edited (risky); the fixes are prompt-level
  plus the mechanical dedup guard, so they cover every NPC, not just Megan.
- The save's existing transcript still contains the old pattern lines; they
  are not retroactively rewritten — new turns use the fixed prompt + guard,
  so the pattern dies out of the buffer naturally (40-entry cap) as the
  conversation continues.
- `validateProposal` caps (internal ≤300, topic ≤60 chars, llm.js/npc.js)
  are unchanged — the new rules produce text within the existing contract.
- The live page is at the main menu with no save loaded, so no end-to-end LLM
  call was run; verification was prompt-text + guard-logic based (unit checks
  above), which matches the bug-fix-audit-2026-08-30 precedent's stance that
  final confirmation comes from the user's next real conversation.
