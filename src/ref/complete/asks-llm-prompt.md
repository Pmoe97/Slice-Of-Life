# The reusable ask LLM prompt

The prompt block appended to the **existing** scene prompt (`buildScenePrompt`,
`src/srcfiles/llm.js`) whenever the player sends an Ask. It is *not* a
replacement prompt — the NPC's bible block, the conversation, and the scene
context all stay exactly as they are. This section only tells the writer what
was asked, what was decided, and what it is allowed to do (speak).

Compiled at runtime by `buildAskDirective` (implemented in
`asks-and-attachments-plan.md` Phase 1; source `src/srcfiles/llm.js`). Every
`{placeholder}` is filled from the ask decision; the block between the two
`---` lines is the whole injected section.

## The ask-directive block

```
---

[ASK CONTEXT — the player used the Request menu. You are NOT deciding the
outcome of this request; it has already been decided. You are only writing
the in-character response.]

- The request: {askLabel} ({askId})
- The player's words: "{flavorText}"
- Your character's decision: {ACCEPTED | DECLINED}
- Why, in one plain line: {reasonPhrase}
- Your attitude toward the player right now: {stance}
{ladderLine}
- Everything that happens *because* of this decision (money, schedules,
  items, memories) is handled by the game automatically. Do not describe
  those mechanics happening. You only speak and act.

Rules:
- Reply ONLY as {npcName}, in their own voice, exactly as they would talk in
  this situation. Use their established speech style — do not change register
  for this one message.
- The decision above is final. Do not renegotiate, do not add conditions, do
  not reverse it, do not ask the player to sweeten the offer.
- If ACCEPTED: respond in character, warmly or however this NPC would,
  acknowledging exactly what was asked.
- If DECLINED: decline in character, matching the stance ({stance}) and the
  reason above. Do not be ruder or kinder than the stance says.
{leafNote}
- 1-3 short sentences. One optional brief action in *asterisks*.
- Emit no effects, no state changes, no summary of the game's mechanics.

---
```

### Placeholder fill rules

| Placeholder | Source |
|---|---|
| `{askLabel}` / `{askId}` | the ask leaf's `label` / `id` |
| `{flavorText}` | the player's message after the `$AskId` prefix; empty → "—" |
| `{ACCEPTED \| DECLINED}` | the deterministic decision (D1) |
| `{reasonPhrase}` | from the decision: `accept` → "they genuinely want to" ; `cool` → "the relationship isn't there" ; `busy` → "their schedule genuinely won't allow it" (retained vocabulary — no leaf currently returns it; the two-stage scheduled flow (D18) resolves schedule conflicts at the calendar modal, so a scheduled ask is never declined for `busy`) ; ladder declines → "they've already been asked the same thing today and it's wearing thin" (2nd) / "they've had enough — this is the same ask again, and the patience is gone" (3+). The willingness-gated leaves (intimacy, Phase 7 ask_intimacy; photos, Phase 8 ask_photo) map the gate to richer codes: `below` → "they're not in the mood for that right now" (intimacy) / `below_photo` → "they're not comfortable sharing that right now" (photos) ; floor refusals → `floor_stranger` "they barely know you", `floor_hostile` "there's too much bad blood between you right now", `floor_cold_shoulder` "they've gone cold on you", `floor_actively_refusing` "they've already said no, and they meant it", `floor_asleep` "they're fast asleep". The gift leaf (Phase 9) is always accepted — its reason names the MATCH, not a verdict: `gift_interest` "it's exactly the kind of thing they love", `gift_want` "it speaks directly to something they've been wanting", `gift_wound` "it reaches something that's hurt them", `gift_miss` "it's not quite their thing, but they appreciate the gesture". The repayment leaf (Phase 10) is always accepted too — `repay` → "they're settling what they owe" (the debt being settled is the ask's own content; the writer never re-decides it) |
| `{stance}` | accept → `measured` (early phase) or `warm`; gifts (always accepted) → `measured` early, `warm` when the gift landed (interest/want/wound match), `polite` on a miss (gracious, never gushing — the numbers already decided zero). Decline, 1st → `distant` (early phase) or `polite`. Decline, 2nd consecutive → `guarded` ("little resistance"). Decline, 3+ consecutive → `exasperated`. The gate floor refusals (intimacy/photos) override the phase base: `floor_hostile`/`floor_cold_shoulder` → `stern`, `floor_stranger` → `distant`, `floor_asleep`/`floor_actively_refusing` → `polite` (quiet, not angry). Ladder stances are decline-only (D7/D16) — an accepted repeat keeps its normal phase-based stance |
| `{ladderLine}` | present only when the repeat ladder (D7) is active: `- Note: this is the {n}th time they have asked the same kind of thing today. The player is pushing their luck and it shows in your attitude.` |
| `{leafNote}` | optional per-leaf behaviour line supplied by the ask leaf (e.g. ask_info's "answer from your bible block — it is authoritative about who you are"). Omitted when the leaf defines none. The ACCEPTED and DECLINED rule lines are mutually exclusive too — only the one matching the decision is compiled. |

### The stance ladder (decline only)

The ladder (D7) applies to DECLINED repeat asks; an accepted repeat keeps its
normal phase-based stance and reason and resets the streak (D16).

| Ask | Stance | Reason |
|---|---|---|
| 1st | the leaf's base — `distant` (early phase) or `polite`; gate floors override with `stern`/`distant`/`polite` | the leaf's own reason phrase |
| 2nd consecutive | `guarded` — "little resistance": still civil, but noticeably less enthusiastic; a brief deflection | "they've already been asked the same thing today and it's wearing thin" |
| 3+ consecutive | `exasperated` — the words should make the player *feel* the relationship delta | "they've had enough — this is the same ask again, and the patience is gone" |

## The scheduling-confirm variant

Used for the second LLM pass after the calendar modal (D9). Shares the first
lines with the block above where possible so the prefix cache hits.

```
---

[SCHEDULING CONFIRMATION — {askLabel}]

- {npcName} already accepted the player's {askLabel} request in the previous
  exchange.
- It is now set: {dayLabel}, {timeLabel} ({slotLabel}).
- Reply in character, briefly, confirming the plan — e.g. "See you then!"
- 1-2 short sentences, {npcName}'s own voice. No mechanics, no renegotiation.

---
```

### Template fallback

If either LLM pass fails, the ask pipeline falls back to a static line that
does not break the flow. **Both are wired as of Phase 10** — pass 1 via
`buildAskFallbackLine` (asks.js), pass 2 in `runAskScheduleFlow` (ui.js),
and both render through the normal `applyProposal` path so a degraded turn
still lands in `memory.recent` / the session log / the Assessor's window.
The pass-1 fallback does NOT gate the rest of the ask pipeline: the decision
already happened (invariant 1), so the calendar modal, photo flow, and the
ask's own effects run regardless of how the writer did.

- Accept (pre-schedule): `"{npcName} nods — sure, they'd like that."`
- Decline: `"{npcName} declines, and that's that for now."`
- Post-schedule: `"{npcName} confirms — {dayLabel} at {timeLabel}."`

## Notes for implementers

- This block is appended *after* `buildEffectVocabSection` and the NPC blocks,
  so its instructions land last — the writer reads the decision immediately
  before writing.
- On ask turns, `proposal.effects` and `moodDeltas` are stripped by the ask
  pipeline (D2) *before* `applyProposal`; the fallback parse tier in `callLLM`
  (`parseEffectDSL` sweep) must not be able to smuggle effects back in on ask
  turns — gate the strip at `doConvSend`, not inside `callLLM`.
- Keep `{reasonPhrase}` and `{stance}` as *semantic* inputs, not raw numbers.
  The writer should never see the score behind the decision.
