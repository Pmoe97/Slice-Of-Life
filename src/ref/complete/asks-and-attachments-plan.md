# Asks & the Conversation Attachments Menu

Status: **COMPLETE — Phases 1–12 done and verified. Phases 1–10 (the full
ask system: spine, Request tree menu, repeat ladder, scheduled asks, meal
inference, money & chore asks, intimacy asks, photo asks, gift asks,
hardening) done and verified; Phase 11 (the full-plan audit) done with
findings in the `## Audit findings — Phase 11` section; Phase 12 (fix the
audit's findings) done — every finding resolved with a note, end-of-phase
sweep green on the live page, final clean refresh**.
Last updated 2026-08-17.

Companions:
- `src/ref/complete/plan-x5-conversation-consequences.md` (the Assessor/Chronicler split this plan writes asks *through* — the writer already scores nothing, and asks extend that to "the writer also never *decides* outcomes on ask turns")
- `src/ref/complete/npc-initiative-plan.md` (the conversation overlay, `doConvSend`, and the free-text "Say or do something" box that becomes the surface for asks)
- `src/ref/complete/intimacy-and-voyeurism-overhaul-plan.md` (willingness gates — the deterministic engine the intimacy ask reuses whole)
- `src/ref/complete/continuous-behavior-engine-plan.md` (`resolveScheduleActivity` + `COMMITMENT_TUNING.busyBlocks` — the schedule probe scheduled asks bind)
- `src/ref/structural/ARCHITECTURE.md` (commitments, effects, memory, the clock)

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session — hand this plan
to an implementation session together with its session protocol
(`asks-and-attachments-handoff-prompt.md`, in this folder) and its reusable
runtime prompt (`asks-llm-prompt.md`); see
`src/ref/patterns/HANDOFF-PROMPT-ARCHITECTURE.md` for the full session protocol.

---

## Handoff — read this first

**Resume at:** Nothing — the plan is COMPLETE. Phase 12 (fix the Phase 11
audit's findings) is DONE: every finding F1–F8 was resolved with a note in
the `## Audit findings — Phase 11` section, the end-of-phase invariants sweep
(D1 same-save-same-answer, flavor-never-flips, D2 writer effects stripped,
D5 availability re-check, D7 ladder, D14 the only intimacy door) was re-run
green on the live page, and the final `browser_refresh` is clean
(no perchanceErrors / syntaxErrors). The Status table marks Phase 12 (and
hence the whole plan) Done. There is nothing left to implement; future
sessions should NOT start a phase — report completion instead.

**Last session's notes (Phase 12, 2026-08-17 — findings fixes + verification):**
- **F2 (the one code change):** `runAskPhotoFlow` (ui.js:4907) now passes
  `record.caption` ("Selfie from &lt;name&gt; — &lt;flavor&gt;") as the
  accepted-photo bubble's text (`convAddImageBubble('npc', url,
  record.caption, '📷 Photo')` — textContent-rendered, so player-sourced
  flavor stays inert HTML-wise). `ui.js` bumped `?v=99 → ?v=100` in
  index.html. Verified live: direct flow call painted the bubble with caption
  + tag + loaded image (vision-confirmed a real anime selfie portrait), and a
  full `$RequestPhoto` turn through the real UI parsed → gated (declined this
  save: 'below_photo', Mara) → phrased in voice with no photo bubble (correct
  — the flow only runs on accept).
- **Doc-only fixes:** F3/F4 rewrote asks-llm-prompt.md — the `{stance}` row
  now names the code's real vocabulary (accept `measured`/`warm`; decline
  `distant`/`polite`; ladder `guarded`/`exasperated`; gate floors
  `stern`/`distant`/`polite`; gift miss `polite`), the ladder table gained a
  Reason column with the exact ASK_LADDER_REASONS strings, `busy` is flagged
  retained-but-unused (D18 moves schedule conflicts to the modal), and the
  header now says buildAskDirective is implemented (llm.js). F5 updated
  ARCHITECTURE.md:53 + README.md:55 to D1–D28 (they were D1–D26). F1 added a
  "closed as intended" note to D5 (the D7 ladder, not a count gate, is the
  per-day pressure mechanism). F6 marked the NPC-money open question Resolved
  and promoted **D29** (no NPC cash field; loans relationship-capped via
  ASK_TUNING.loan.maxByPhase). F7 marked the three stale phase-verification
  lines (Phases 1/2/4) superseded by D7/D8/D14. F8 fixed the D3 regex
  illustration to `^\$([A-Za-z0-9_]+)(?:\s+(.*))?` and added superset notes
  to the Data-model resolveAsk shape + ASK_CATEGORIES sketch (8 categories,
  code registry authoritative) and the Phase 4/5 modal-location drift
  (render.js openAskScheduleModal).
- **End-of-phase sweep (live, all green):** D1 — same-clone resolveAsk twice
  → identical verdict across RequestInfo/Loan/Photo/Intimacy/Meal. Flavor —
  two flavors per leaf → identical accept/reason (flavor still reaches the
  directive for phrasing). D2 — stubbed `root.generateText` to return a valid
  proposal smuggling `SPEND_MONEY 50`; sent `$RequestLoan $80` through
  doConvSend; money went +80 (the loan's EARN_MONEY) not −50, and
  `player.flags._loanOwed = {npc_157ayf2_0: 80}` landed — the strip gate in
  doConvSend holds even against a *valid* proposal, not just the regex tier.
  D5 — ASK_PHOTO available alone in a room → gate reached; with an onlooker →
  decide returns 'unavailable' (belt-and-braces holds). D7 — ladder on a
  stranger's intimacy ask (deterministic floor declines): 1st `distant`,
  2nd `guarded` + second ladder reason, 3rd `exasperated` + third reason, and
  a clone's REL_DELTA dropped trust 0 → −0.06 exactly. D14 — intimacy menu
  enabled for a stranger, ask reason = gate reason (`floor_stranger`), and
  the floor path wrote nothing (`_intimacyRefusals` absent through
  applyEffects).
- The test harness: resumed save `auto_1` (sv_0c4uzv87xa, Camille, day 2) —
  the same save Phase 10/11 used. Note the live kv.meta folder currently
  holds menu-cast imageIndex state (seed null) — `continueGame()` won't load
  without first `restoreSave(record)`; the Continue button does this via
  resumeFromRecord. `stopClockLoop()` kept state stable during evals; the
  final browser_refresh restored a clean page.

**Blockers / flagged deviations:** None. No finding required changing a
locked decision; the one promotion (D29) is an *addition* that resolves a
parked open question, not a re-interpretation. D-number count is now D1–D29
(ARCHITECTURE.md/README.md/Status tables updated accordingly; the Phase 11
row in the Status table still says D1–D28 because that is what Phase 11
audited).

**Post-completion change (2026-08-17, user request — display only, no
decision-logic change):** the player's ask bubble no longer shows the raw
`$RequestType` syntax. Live and in recalled history, an ask bubble renders
the leaf label as a small-caps header ("MEAL INVITATION", "LOAN REQUEST")
with the CLEAN flavor as the body; a bare ask renders as just the header. An
unknown `$Tag` still falls through to a plain message (D3), and plain lines
render verbatim. The `$AskId <Optional>` line remains ONLY in the input field
(via the Request tree's template, and typeable by hand). Implemented in
`convAddBubble` (header + empty-body skip), `doConvSend` (body =
`parsedAsk.flavor`, gift turns keep their "You hand X the Y." line), the new
`askBubbleDisplay` helper + `convRenderRecalled` (clean recalled reads), and
restyled `.conv-tag` CSS. `ui.js` `?v=101`. D4 updated to describe the
refinement. Verified live: recalled history renders the earlier raw-stored
asks clean, live sends (with flavor / bare / unknown-tag / plain) all match
the design, and a captured screenshot of the overlay confirmed the header +
clean-body layout.

**Follow-up (same session, user request — still display only):** instead of
rendering an empty body when `<Optional>` was left untouched, each ask leaf
carries a canned `defaultFlavor` — a generic player-voice line for that
request type (asks.js) — and both live (`doConvSend`) and recalled
(`askBubbleDisplay`) bubbles render it as the body when the flavor is empty.
The fallback is strictly display: `parseAskInput` still strips `<Optional>`
to '', `resolveAsk`/`buildAskDirective` still see the empty flavor (D1/D15),
so a canned line can never drift a decision or leak into the writer's
prompt. `asks.js?v=11`, `ui.js?v=102`. Verified live: bare `$RequestInfo`,
`$RequestLoan`, `$RequestPhoto` etc. render header + the leaf's canned body,
decisions unchanged, recalled re-renders match.

---

## The thesis

The conversation overlay is the game's richest surface, but every request the
player makes is an unstructured free-text prompt: the LLM decides *both* the
words and the outcome, and there is no way for the player to state an
unambiguous intent — "cover my shift", "lend me $40", "dinner tonight" — that
resolves against the game's real machinery. Two deterministic systems already
exist that prove the pattern works: commitments decide meal attendance from
affection/tension/schedule + seeded noise (`respondToCommitment`), and
willingness decides intimacy from a scored gate (`resolveWillingnessGate`).
But both are only reachable through menu chips or the narrator's discretion,
never as an explicit in-conversation ask the player can aim precisely.

FUOC's attachments menu shows the destination: a `+` surface with money,
gifts, image requests, and image sending. This plan builds that surface for
Slice of Life on its deterministic spine — a Request tree of hardcoded ask
types that resolve deterministically and are **phrased, never decided**, by
the LLM. Asks become the one place where the code is authoritative about
outcomes on the conversation surface, and the conversation becomes a real
mechanic for money, schedules, consent, and relationship cost.

### What this plan is *not*
- **Not a menu skin.** The tree UI is maybe a fifth of it; the ask pipeline —
  parse → decide → strip → phrase → apply → remember — is the rest.
- **Not a generalization of the LLM's authority.** It *shrinks* it: on ask
  turns the writer's effects are stripped, the same way X-5 already strips
  its relationshipDeltas and memoryAdditions.
- **Not the action system.** `classifyIntent`/`ACTION_DEFS` move the player
  and run verbs; asks are NPC-facing requests. They can compose (an ask can
  write an `NPC_ACTIVITY`), but asks are not actions.
- **Not every conceivable ask.** The catalog starts with the systems that
  exist: meals, hangouts, money, chores, photos, intimacy, info. New asks are
  added one leaf at a time as their systems land.
- **Not the IM surface.** v1 is in-person only; the IM "Invite to Dinner"
  chip stays. Porting the menu to IM is explicitly out of scope (parked, see
  Open questions).

## Locked decisions

### Intent & determinism
- **D1 — Deterministic decision, flavor-blind.** `decide()` is a pure
  function of (npc state, relationship, world, seed). The player's optional
  text is **never** an input to the decision — it only shapes LLM phrasing.
  Same save → same outcome; reloading never renegotiates (matches
  `respondToCommitment`'s own comment).
- **D2 — The LLM phrases, never decides.** On ask turns, `proposal.effects`
  (and `moodDeltas`) are stripped before apply — X-5 already strips
  relationshipDeltas/memoryAdditions at ingestion. The ask pipeline writes
  its own effects through the normal effect pipeline, at the same point
  `applyProposal` would have, so there is one effect-application moment per
  turn.
- **D3 — Syntax.** `$AskId <flavor>` in the conv input. `doConvSend` parses
  `^\$([A-Za-z0-9_]+)(?:\s+(.*))?` (asks.js:1108 — the bare `$AskId` with no
  flavor is part of the same regex, so a tag alone parses to `{ askId,
  flavor: '' }`); an unknown `$Tag` falls through to the plain text path. A
  bare `$AskId` with no flavor is allowed.
- **D4 — Tag display.** The player's ask bubble shows a header label naming
  the ask ("Meal Invitation", "Loan Request") and the CLEAN message body —
  the flavor after `$AskId`, never the raw `$RequestType` syntax (the
  `$`-line is input syntax: it appears in the send field via the Request
  tree and is typeable by hand, but a rendered message never shows it; a
  bare ask renders the leaf's canned `defaultFlavor` as the body — a
  per-leaf generic player-voice line — instead of an empty one, display-only
  so the flavor fed to the decision/directive stays empty (D1)). NPC bubbles
  are unchanged. (Phase 12 post-audit refinement: the original "dim chip
  above the text" was restyled to a small-caps header and the body is now
  flavor-only, live and in recalled history — ui.js
  `convAddBubble`/`askBubbleDisplay`. Post-completion user refinement: an
  untouched `<Optional>` renders each leaf's `defaultFlavor` — asks.js
  fields, same fallback in `doConvSend` (live) and `askBubbleDisplay`
  (recalled), so a bare ask is never a header-only bubble.)
- **D5 — Availability gates.** Each leaf has `available(gs, npc, ctx)`; the
  tree greys out (and hides behind a filter) what can't happen right now —
  closed pool, non-resident NPC, category already maxed today. Belt and
  braces: `available` is re-checked inside `decide()` because state can move
  between render and send. (The "category already maxed today" clause was
  dropped during implementation — closed as intended: the per-day pressure
  mechanism is the D7 repeat ladder, not a count gate. No leaf imposes a
  per-day cap; repeated asks are always `available` and pay ladder penalties
  instead. Phase 10's sweep never required the cap — F1.)
- **D6 — Seed.** Every decision draws `seededRng(seed, 'ask_' + category +
  '_' + npcId + '_' + day + '_' + counter)` so it is reproducible per save.
- **D13 — Asks are category-scoped.** The ladder counter (D7) is per
  category; a loan ask and a dinner ask never share a streak.
- **D15 — The template's `<Optional>` placeholder is UI, not flavor.** The
  Request tree inserts `template` (`'$AskId <Optional>'`) with the placeholder
  pre-selected. Sent untouched, `parseAskInput` strips a standalone
  `<Optional>` flavor so the turn is exactly a bare `$AskId` (D3) — the
  placeholder must never reach the LLM as flavor text (D1).
- **D16 — The 3rd-ask REL_DELTA is decline-only.** D7's "3+ consecutive:
  a larger penalty AND a negative REL_DELTA" is implemented so only a
  DECLINED 3rd+ consecutive ask takes the relationship hit; an accepted ask
  resets the streak (resetOnAccept) and costs nothing — accepting can't both
  reset the ladder and still lose trust, or resetOnAccept would be
  meaningless. The ladder stance/reason/ladderLine escalation is likewise
  decline-only (the accepted ask keeps its normal phase-based stance).
- **D17 — Phase 4 ships the hangout leaf, not the meal leaf.** The plan's
  Phase-4/5 file lists overlap on "schedule:true leaves"; resolved by making
  Phase 4's concrete exemplar the hangout ask (`ask_hangout`, kind
  'hangout', room `COMMITMENT_KINDS.hangout.roomId` = living_room — the same
  kind the initiative proposals book) and leaving `ask_meal` entirely to
  Phase 5 (its file list still owns it). Phase 5's verification still tests
  its own leaf end-to-end; nothing in Phase 4 is meal-specific.
- **D18 — Free runs are chunked, and the stage-2 acceptance is honored, not
  re-rolled.** `freeSlotsFor` finds maximal non-busy runs (the same
  resolveScheduleActivity/busyBlocks read respondToCommitment uses) and
  splits each into bookable windows of at most
  `ASK_TUNING.schedule.chunkMinutes` (120), dropping anything under
  `minFreeWindowMinutes` (60) — an all-day free run must not pin the NPC for
  fifteen hours, and Phase 5's meal mapping must compose with chunked
  windows (overlap a chunk against `mealSlots` rather than expecting raw
  runs). And in `runAskScheduleFlow`, the already-accepted NPC is passed to
  `createCommitment` as **proposerId**, which puts them straight into
  acceptedIds without re-running `respondToCommitment` — that noise draw
  could flip a stage-1 yes and break same-save-same-answer (D1).
- **D19 — Meal-window granularity.** The meal ask's calendar modal offers
  ALL free windows (hangout behavior), and a row whose window overlaps a
  `COMMITMENT_TUNING.mealSlots` window is labeled with the inferred meal
  ("Breakfast"/"Lunch"/"Dinner"); windows outside every meal window keep the
  plain phase label and remain bookable. The inference test is OVERLAP, not
  containment (a 07:00–09:00 chunk is still breakfast), and the inferred
  label rides on the confirm directive's `dayLabel` and the memory fact
  ("Breakfast, tomorrow at 08:30") — the commitment record itself stays
  field-free, its `startAbs` deriving the slot (Data model). Flavor never
  flips the label (D1): a "coffee" flavor in a lunch window still reads
  "Lunch".
- **D20 — The `_loanOwed` flag and the `postEffects` hook.** An accepted
  loan writes `player.flags._loanOwed = { [npcId]: amount }` (a per-NPC
  player-facing object, accumulating on repeat accepted loans to the same
  NPC) via a new optional leaf hook `postEffects(gs, npc, npcId, decision,
  data)` that `resolveAsk.applyEffects()` invokes right after the DSL effect
  lines — the same single effect-application moment. The ask pipeline owns
  this structured player flag exactly as it owns `bumpAskCount`'s
  `_askCounts` on the NPC; Phase 10 wires the repayment lifecycle against
  the per-NPC shape.
- **D21 — Loan size and the chore gate.** The loan's parsed/capped amount
  feeds only the writes (EARN_MONEY + `_loanOwed`), never `decide()` — the
  phase cap (`ASK_TUNING.loan.maxByPhase`) is the size control, and
  EARN_MONEY's own validate cap (moneyDeltaCap 200) is bypassed for asks
  (trusted producer), so intimate-phase $500 loans apply. The chore's
  "schedule" term in the decide formula is the presence gate itself — the
  NPC is mid-conversation, so "now" is possible by definition; the energy
  term is `(npc.needs.energy − 50) / 50 × ASK_TUNING.chore.energyWeight`.
- **D22 — Intimacy gate act and floor semantics (Phase 7).** `ask_intimacy`
  reads `resolveWillingnessGate` with act `'default'` — the codebase's own
  "would they say yes at all" bar (`WILLINGNESS.scoring.act`), exactly the
  question an intimacy ask asks; no new WILLINGNESS.thresholds entry (Phase
  7's file list is asks.js only). Verdict mapping: allowed → accept +
  `noteIntimacyOccurred`; below_threshold → soft no (reason `'below'`) +
  `noteIntimacyRefusal` with the default 1-day lockout (lockUntilDay = day+1,
  so a re-ask the same day floors on `actively_refusing`, and the refusal's
  history term keeps chilling the gate the next day); floor → hard refusal
  (reason `'floor_<state>'`), NOTHING stamped — the hard floors are states
  (stranger/hostile/cold shoulder/already-refusing), not refusals, and
  willingness's floor-writes-nothing rule is part of "reuse whole". This
  resolves the Phase-7 verification line "stranger/hostile → floor refusal
  line, `_intimacyRefusals` stamped" against D14: the stamping clause belongs
  to the below_threshold path; the floor path's refusal line is the ask's
  own "floor refusal line". The intimacy decision draws NO seeded noise —
  the gate is already deterministic, so D1/D6 holds without a draw (the
  ladder still bites via stance escalation + the 3rd+ REL_DELTA).
- **D23 — `postEffects` receives the LIVE npc (Phase 7).**
  `resolveAsk.applyEffects()` re-reads `gameState.npcs[npcId]` at apply time
  instead of passing the resolve-time capture. `applyProposal` (npc.js
  `addRecentExchange`) and the clock-loop checkpoints replace npc objects
  between `resolveAsk` and `applyEffects`, so writes through the captured
  reference (Phase 7's `noteIntimacyRefusal`/`noteIntimacyOccurred` — the
  first npc-writers on the hook) silently vanished at the next save. Phase
  6's loan flag was immune because it writes `gs.player.flags`.
- **D24 — Photo-ask semantics (Phase 8).** `ask_photo` reads the willingness
  gate with act `'photo'`, backed by a NEW threshold entry
  `WILLINGNESS.thresholds.photo = 0.4` (between cuddle 0.35 and default
  0.45). Availability's "private enough" = no other NPC in the room
  (onlooker-free); room class + door lock stay the gate's context term.
  Verdict mapping mirrors D22: allowed → accept; below_threshold → reason
  `'below_photo'` ("they're not comfortable sharing that right now") — a
  photo refusal is NOT an intimacy refusal, so no note* stamps, memory fact
  only; floor → `floor_<state>`. The gate-routed decision draws no seeded
  noise (D22's reasoning applies to every gate-routed leaf). The accepted
  photo is a deterministic record (prompt = physical description + flavor,
  capped; seed = hash of a save-seed-tagged string) rendered through the
  shared LRU under `photo_askphoto_*` — same save reproduces the same photo.
  The share-photo path is NOT an ask turn: no decision, no effect-strip (the
  writer reacts to the photo's caption text like any free-text turn, the
  same convention sharePhotoToImThread uses); its pseudo-leaf lives in
  `ASK_SHARE_TYPES`, never `ASK_TYPES`, so no `$SharePhoto` tag exists (D3).

### The repeat ladder
- **D7 — Escalation on repeated asks.** Per-NPC, per-category consecutive
  counter within a day (stored in `npc.flags._askCounts[category] = { count,
  lastDay }`). 1st ask: normal. 2nd consecutive: a small deterministic score
  penalty ("little resistance"), **no relationship delta**. 3+ consecutive: a
  larger penalty **and** a negative `REL_DELTA` (axis and magnitude from
  `ASK_TUNING`, capped at `EFFECT_LIMITS.relDeltaCap`). A day rollover or an
  **accepted** ask resets the counter. The prompt's stance escalates so the
  NPC's words match the numbers.

### Scheduled asks
- **D8 — Two-stage flow.** Stage 1: `decide()` answers "would they at all"
  (accept/decline + reason, e.g. `'cool'`/`'accept'`). On accept of a
  schedule-oriented ask, a calendar modal opens — days within
  `COMMITMENT_TUNING.maxInviteAheadDays`, each showing the NPC's genuinely
  free windows probed through the same `resolveScheduleActivity` +
  `busyBlocks` read `respondToCommitment` uses. The chosen slot is re-checked
  against hard blocks; a hard block (work/commute/sleep) genuinely can't be
  skipped, so the modal prefers offering free slots and the recheck is a
  safety net. Stage 2: final yes → `createCommitment` (a real record —
  `resolveScheduleActivity` relocates the NPC into the room for the window,
  so they actually arrive).
- **D9 — Two LLM passes, prefix-friendly.** Pass 1 phrases the
  acceptance/decline. After the modal confirms, pass 2 phrases the sign-off
  ("see you then!"). Both are the same ask-directive prompt, one variant each
  (see `asks-llm-prompt.md`), sharing as much prefix as possible for the
  prefix cache. Template fallback line if a call fails.

### Catalog shape
- **D10 — No meal-type asks.** One `requestMeal` leaf. The meal's identity is
  derived from the scheduled window via `COMMITMENT_TUNING.mealSlots`
  (breakfast 480–600, lunch 780–900, dinner 1140–1320 minutes-of-day). The
  send-time tag is generic ("Meal Invitation"); after the slot is picked, the
  commitment record and the confirm pass use the inferred slot label
  ("Breakfast, tomorrow 8:30").
- **D11 — First catalog.** Categories: **meals** (requestMeal), **hangouts**
  (a scheduled together-activity, `kind:'hangout'`), **money** (loan),
  **chores** (do X now), **photos** (send me a photo), **intimacy**
  (willingness-routed), **info** (tell me about X).
- **D12 — Asks are remembered.** Accept/decline writes a `MEMORY_FACT` or
  `MEMORY_EPISODE` on the NPC ("she covered your shift", "you were told no").
  Money asks additionally write a player-facing flag (`_loanOwed`) so
  repayment can be tracked. Intimacy refusals already stamp via
  `noteIntimacyRefusal` — asks reuse it.
- **D14 — Intimacy asks reuse willingness whole.** The intimacy ask is not a
  new gate. `resolveWillingnessGate` is the decision; on `below_threshold` →
  refusal prose + `noteIntimacyRefusal`; on `floor` → hard refusal; on allow →
  `noteIntimacyOccurred` and the LLM narrates from the verdict. No second
  gate, ever.
- **D25 — Gift ask shape (Phase 9).** One `RequestGift` leaf, always
  accepted; the deterministic verdict IS the match (`giftMatchKind` against
  bible.interests/want/wound → 'interest'|'want'|'wound'|null). The item is
  the **structured** input — it travels through `resolveAsk`'s `extra`
  param (`{giftDefId}`), merged into the seed context and the effect data,
  and NEVER through flavor (D1/invariant 2). A hand-typed `$RequestGift`
  with no item resolves 'unavailable' with zero writes. Effects gate on
  accept and are always `MOVE_ITEM` + `MEMORY_FACT` + `REL_DELTA`
  (affection; interest 0.12, want/wound 0.10, miss 0 — a miss emits no
  line).
- **D26 — Gift sources (Phase 9).** Inventory only — no store catalog
  (parked FUOC-style store stays out). `giftableStacks` = non-keyItem, qty>0
  from the player bag. The match sources are exactly bible.interests (name +
  tags), want, and wound — nothing else.
- **D27 — Repay leaf shape (Phase 10).** One `RequestRepay` leaf (category
  'money'), always accepted — repaying is a plan, not a negotiation, so the
  verdict never needs a decision path. The amount from `repayAmountFor`
  (flavor $N repays that much; bare repays the whole debt; capped by both
  the remaining `_loanOwed` to this NPC and money on hand; 0 → zero writes)
  feeds ONLY the writes — SPEND_MONEY + MEMORY_FACT + the postEffects
  reduction of `player.flags._loanOwed[npcId]` (the per-NPC key is deleted
  at 0) — never `decide()`, exactly D21's loan precedent. A `$RequestRepay`
  with nothing owed / no money / a wrong-npc ask resolves 'unavailable'
  with zero writes (D5 re-check).
- **D28 — Ask fallbacks ride the normal applyProposal path (Phase 10).**
  A degraded LLM pass on an ask turn degrades to the asks-llm-prompt.md
  template line rendered through `applyProposal` — the same memory.recent /
  session-log / Assessor+Chronicler writes a phrased turn gets — and the
  ask's own pipeline (schedule modal, photo flow, `applyEffects`) runs
  regardless of the writer's parse tier (it is no longer gated on a valid
  proposal). The fallback speaker resolves from `context.activeNpcs` (the
  exact name applyProposal matches dialogue against) so a name-less NPC
  still records its line; effect-stripping (D2) still applies only to the
  writer's output, never to the ask's own effects.
- **D29 — NPCs have no money field (Phase 6; the "NPC money for loans" open
  question, resolved).** The loan ask is relationship-capped: the size
  control is `ASK_TUNING.loan.maxByPhase` alone, and the player's parsed
  amount feeds only the writes (EARN_MONEY + `_loanOwed`), never `decide()`
  (D21). No `npc.money`/cash field exists or is introduced — the "they're
  short this month" texture is flavor.

## Data model

### ASK_TYPES — the catalog (Phase 1, `asks.js`)

```js
ASK_CATEGORIES = [
  { id: 'meals', label: '🍽️ Meals & Plans', children: [ask_meal, ...] },
  { id: 'hangouts', label: '🎮 Hangouts', children: [ask_hangout] },
  { id: 'money', label: '💰 Money', children: [ask_loan] },
  { id: 'chores', label: '🧹 Help Around', children: [ask_chore] },
  { id: 'photos', label: '📷 Photos', children: [ask_photo] },
  { id: 'intimacy', label: '💋 Intimacy', children: [ask_intimacy] },
  { id: 'info', label: '💬 Ask About Them', children: [ask_info] },
]
```
*(This sketch predates Phase 9's `gifts` category and Phase 10's `repay`
leaf. The code's registry (asks.js:1072) is authoritative: 8 categories —
`meals`, `hangouts`, `money` `[ask_loan, ask_repay]`, `gifts`, `chores`,
`photos` `[ask_photo, ASK_SHARE_PHOTO]`, `intimacy`, `info` — F8.)*

```js
ask_meal = {
  id: 'RequestMeal', category: 'meals', label: 'Invite to a meal',
  help: '<optional: what/when — e.g. coffee early>', template: '$RequestMeal <Optional>',
  schedule: true,                        // calendar modal + commitment (Phase 4)
  decide(gs, npc, npcId, flavor, ctx)    // → { accept, reason, stance, ladder }
  available(gs, npc, ctx)                // resident-only, etc.
  effects(gs, npc, npcId, decision, data)
  directive(gs, npc, npcId, decision, data) // → the ask-directive block (Phase 1)
}
```

### Ask parse + decision result (Phase 1)

```js
parseAskInput(text)      // → null | { askId, flavor }
resolveAsk(gs, npcId, askId, flavor, ctx)
//   → { ask, decision: { accept, reason }, stance, ladder, directive,
//       applyEffects() }  — pure; no LLM, no state writes
```
*(The sketch is a subset of the code's return, which adds `reasonPhrase`,
`flavor`, and a `setSlot(slot)` hook for Phase 4's calendar flow — a
consistent superset, F8.)*

### The ask ladder flags (Phase 3)

```js
npc.flags._askCounts = { [category]: { count, lastDay } }   // on the NPC
```

Reset on day rollover (`processDayRollover`) and on any accepted ask of that
category. `lastDay` guards stale counters after a reload.

### Scheduled-ask record (Phase 4)

Reuses `world.commitments[]` unchanged (`createCommitment`, kinds `'meal'`
and `'hangout'`). No new fields; the confirm-pass label and the record's
`startAbs` are enough to derive the meal slot (D10).

### ASK_TUNING (Phase 1, `config.js`)

```js
const ASK_TUNING = {
  ladder: { secondAskPenalty: 0.05, thirdAskPenalty: 0.15,
            thirdAskRelDelta: -0.06, relAxis: 'trust', resetOnAccept: true },
  loan: { defaultAmount: 40, amountFromFlavor: true,
          maxByPhase: { early: 20, familiar: 100, close: 300, intimate: 500 } },
  photo: { threshold: 'photo' /* willingness act */ },
}
```

### The reusable LLM prompt

Lives at `src/ref/complete/asks-llm-prompt.md` — the ask-directive block
(`buildAskDirective` in `llm.js`) and the scheduling-confirm variant. Compiled
once per ask turn, appended to the existing scene prompt.

## Implementation phases

### Phase 1 — The ask spine
**Goal:** the full pipeline exists end to end with one v1 leaf, proven on the
live page. `$AskId <flavor>` parses, decides deterministically, strips writer
effects, injects the directive, renders the tag, and the NPC phrases the
verdict in character.
**Files:**
- `src/srcfiles/asks.js` (new): `ASK_CATEGORIES`/`ASK_TYPES` registry,
  `parseAskInput`, `resolveAsk` (pure decision + stance + directive +
  effect-apply helper via the standard effect pipeline), the `ask_info` leaf
  (decide by trust; declined → deflect; accepted → answers from the bible
  block already in the prompt).
- `src/srcfiles/config.js`: `ASK_TUNING` block.
- `src/srcfiles/llm.js`: `buildScenePrompt` appends the ask-directive section
  when `context.askDirective` is present (compile from
  `asks-llm-prompt.md`).
- `src/srcfiles/ui.js` `doConvSend`: `parseAskInput` check at the top →
  `resolveAsk` → on ask turns strip `proposal.effects`/`moodDeltas` before
  `applyProposal`, apply the ask's own effects at the same point, set
  `context.askDirective`, remember via `MEMORY_FACT`.
- `src/srcfiles/ui.js` `convAddBubble`: accept an optional `tag` arg; render a
  dim chip (`.conv-bubble .conv-tag`) above the text.
- `index.html`: `.conv-tag` CSS.
**Verification:** via `browser_eval` — send `$RequestInfo What do you do for
fun?` → player bubble carries the "Ask About Them" chip, NPC answers in voice
from their bible, no effects written. `$BogusTag hi` → normal free-text path
(no chip). Send the identical ask twice → identical accept/decline (seed,
D1). *(Superseded by D7: the 2nd same-category ask draws `count=1` and a
ladder penalty, so it is *supposed* to differ; D1's real test is
reload-stability, which Phase 10 verified.)* Confirm the writer's `effects`
are stripped on the ask turn (assert the ask's own effect landed and no SPEND
occurred).

### Phase 2 — The Request tree UI
**Goal:** the attachments menu exists in the conversation overlay and walks
the tree.
**Files:**
- `index.html`: `#conv-attach-btn` (`+`) in `.conv-input-row`, `#conv-ask-menu`
  popover, breadcrumb/back affordance, leaf rows, availability state
  (greyed), hint line under the input while a `$AskId` is active.
- `src/srcfiles/ui.js`: open/close/nav handlers, tree builder from
  `ASK_CATEGORIES`, `available()` evaluation, leaf click → `#conv-input` =
  `template`, focus, selection of the `<Optional>` span for easy replace.
- `index.html`: menu CSS (positioned over the overlay, same z-layer as the
  conversation).
**Verification:** open menu → drill down → leaf inserts template with
`<Optional>` pre-selected; unavailable leaves greyed for a stranger/hostile
NPC but live for a resident; send works end to end from the menu. *(The
stranger/hostile-greyed clause is superseded by D14: `ask_intimacy`
deliberately stays ENABLED for strangers — a stranger's ask refuses, it
doesn't grey out.)*

### Phase 3 — The repeat ladder
**Goal:** repeated asks of the same category escalate per D7 and the NPC's
words match.
**Files:**
- `src/srcfiles/asks.js`: `_askCounts` read/write in `resolveAsk`; penalty in
  the decision; 3+ → `REL_DELTA`; ladder stance strings.
- `src/srcfiles/ui.js` `processDayRollover`: reset stale `_askCounts`
  entries.
- `config.js`: `ASK_TUNING.ladder`.
**Verification:** ask the same category three times in a row →
1st normal, 2nd deflects with no `relPlayer` change, 3rd → `relPlayer[axis]`
drops by exactly `thirdAskRelDelta` and the reply reads annoyed; next game-day
resets; an accepted ask resets mid-day.

### Phase 4 — Scheduled asks
**Goal:** schedule-oriented asks bind the NPC's real schedule via the calendar
modal (D8/D9).
**Files:**
- `src/srcfiles/render.js` `openAskScheduleModal`: the schedule modal (day
  header rows within `maxInviteAheadDays`, free slots per day from the probe,
  confirm/cancel — the file list below predates the shared-modal move, F8).
- `src/srcfiles/asks.js`: `schedule: true` leaves; `freeSlotsFor(npc, dayAbs)`
  probing `resolveScheduleActivity` against `busyBlocks`; final-yes →
  `createCommitment` with the chosen slot.
- `src/srcfiles/ui.js` `doConvSend`: on accept of a scheduled ask → open
  modal → slot confirm (recheck hard blocks) → create commitment → LLM pass 2
  (or template fallback).
- `src/srcfiles/llm.js`: the scheduling-confirm directive variant.
**Verification:** invite a resident to a meal → modal shows genuinely free
windows; pick a work-bound slot → hard-block refusal path; pick a free slot →
commitment record created, NPC is relocated into the room during the window
(advance the sim), pass-2 reply reads like a sign-off. *(The work-bound-slot
clause predates D8's final shape: the modal offers FREE windows only, and the
hard-block recheck is a safety net that reopens the modal rather than a
refusal path.)*

### Phase 5 — requestMeal + meal inference
**Goal:** one meal ask; breakfast/lunch/dinner falls out of the slot (D10).
**Files:**
- `src/srcfiles/asks.js`: `ask_meal` leaf (schedule: true); slot → label via
  `COMMITMENT_TUNING.mealSlots`; record + confirm pass carry the inferred
  label.
- `src/srcfiles/render.js` `openAskScheduleModal`: modal day rows show the
  derived meal label for windows that land in a slot (Phase 5's
  "index.html: modal day rows" drifted to render.js, F8).
**Verification:** schedule an 08:30 slot → record/confirm say "breakfast"; a
19:30 slot → "dinner"; flavor text mentioning coffee at 08:30 still resolves
to breakfast (flavor never decides, D1).

### Phase 6 — Money & chores
**Goal:** `request_loan` and `request_chore` work end to end with real state
writes.
**Files:**
- `src/srcfiles/asks.js`: `ask_loan` — amount parsed from flavor
  (`$20`/`$120`), default + cap by conversation phase (`ASK_TUNING.loan`),
  decide by affection/trust; accepted → `EARN_MONEY` + `MEMORY_FACT` +
  `_loanOwed` flag; declined → nothing on first ask, ladder handles repeats.
  `ask_chore` — decide by affection/energy/schedule; accepted →
  `NPC_ACTIVITY` (they actually do it); declined → deflect.
- No NPC cash field is introduced (parked in Open questions; loans are
  relationship-capped, the "they're short this month" texture is flavor).
**Verification:** `$RequestLoan Could you spot me $120?` → player money +120,
NPC memory records it, flag set; `$RequestChore take the bins out` → NPC
activity changes and the sim shows them doing it; an angry NPC declines and
the words match.

### Phase 7 — Intimacy asks
**Goal:** the intimacy category routes through willingness with zero new gate
logic (D14).
**Files:**
- `src/srcfiles/asks.js`: `ask_intimacy` leaf — `resolveWillingnessGate` is
  the decision; verdict → `noteIntimacyRefusal` / `noteIntimacyOccurred`;
  stance + consent phrasing into the directive.
- `index.html`: no new UI — it's a tree leaf like any other.
**Verification:** a stranger/hostile NPC → floor refusal line, `_intimacyRefusals`
stamped; a warm intimate-phase NPC in a private locked room → allowed, the LLM
narrates from the verdict; the refusal lockout holds the next day.

### Phase 8 — Photos
**Goal:** `request_photo` (NPC sends a generated image) and share-photo (player
sends a camera-roll photo) both render as image bubbles in the conversation.
**Files:**
- `src/srcfiles/asks.js`: `ask_photo` leaf — available when the NPC is
  present and the room is private enough; decision via a willingness-style
  gate (`ASK_TUNING.photo.threshold`); accepted → `root.generateImage` from
  the NPC's bible/appearance + flavor, rendered as a bubble record.
- `src/srcfiles/ui.js` / `index.html`: conversation image bubble render
  (reuse the IM photo-thumb pattern from `render.computer.js`); share-photo
  entry: pick a camera-roll photo (`getPhotoImage`) → attach as an image
  bubble → NPC reacts.
**Verification:** request a photo at low trust → refusal; at high trust →
image bubble lands in the log; sharing a real camera-roll photo shows the
thumbnail and the NPC replies in voice.

### Phase 9 — Gifts
**Goal:** hand an inventory item to an NPC and get a deterministic
relationship reaction.
**Files:**
- `src/srcfiles/asks.js` / `inventory.js`: gift-from-inventory flow (item
  transfer), REL_DELTA from interest matching (`bible.interests` /
  `bible.want` / `bible.wound` — a match moves the needle, a miss does not),
  `MEMORY_FACT` so the gift is remembered, LLM narrates the reaction.
- `index.html`: a small gift picker grid in the menu flow (inventory-backed).
**Verification:** give a want/interests match → `relPlayer[affection]` rises;
give an unrelated item → no delta; NPC references the gift later (memory).

### Phase 10 — Hardening
**Goal:** every ask remembers correctly, asks and the Assessor/Chronicler
agree, and the invariants hold under a verification sweep.
**Files:**
- `src/srcfiles/asks.js`: audit every leaf's `effects` and memory writes;
  wire `_loanOwed` lifecycle; confirm ask turns produce `memory.recent`
  entries the Assessor/Chronicler can judge.
- `src/ref/structural/ARCHITECTURE.md` + `src/ref/README.md`: doc index.
**Verification:** run each ask path once via `browser_eval` and assert: same
save same answer (D1); flavor never flips an outcome (D1 test case);
writer effects stripped (D2); availability re-checked at decide (D5); counter
semantics (D7). Update the plan's Status table.

### Phase 11 — Full-plan audit

**Goal:** Read the ENTIRE plan — every phase block (1–10), every locked
decision (D1–D28), the Data model, the Design invariants, the Open questions,
and the reusable prompt (`asks-llm-prompt.md`, which must still match
`buildAskDirective`) — and audit it against the live code. For every
proposed change and every decision, classify it exactly one of: (a)
**implemented as proposed** (verified in the code, cite where), (b)
**implemented with a documented deviation** (cite both the deviation and where
it was recorded — e.g. a Locked decision, a Handoff note), or (c) **missing or
drifted** (the plan promised something the code doesn't do, or does
differently with no record). This phase changes NO code and runs NO live
turns; it produces the findings record. The point is the audit a reader of
the plan cannot do by reading the Handoff alone — the Handoff summarizes, it
does not verify.

**Files:**
- `src/ref/wip/asks-and-attachments-plan.md` — the whole document,
  including the Status table and this phase's own numbering.
- `src/ref/wip/asks-llm-prompt.md` — the reusable prompt vs
  `buildAskDirective` (asks.js) and the fallback list (ui.js).
- The code each phase cited, current shapes, at minimum:
  `src/srcfiles/asks.js` (registry, `parseAskInput`, `resolveAsk`,
  `buildAskDirective`, every leaf, `ASK_TUNING`), `ui.js` (the
  `doConvSend` ask pipeline, `runAskScheduleFlow`, `runAskPhotoFlow`,
  `doConvGiveGift`, the Request tree), plus `effects.js` (`applyEffects`,
  `buildEffectContext`, `EFFECT_DEFS`, `validateEffects`), `npc.js`
  (`applyProposal`, memory writers), `commitments.js` (`respondToCommitment`,
  `createCommitment`), `sim.js` (`resolveScheduleActivity`,
  `COMMITMENT_TUNING.busyBlocks`, `seededRng`), `willingness.js`
  (`resolveWillingnessGate`/`noteIntimacyRefusal`/`noteIntimacyOccurred`),
  `image.js`, `x5.js` (`assessorWindow`/`chroniclerWindow`),
  `inventory.js` (`giftableStacks`), `config.js` (`ASK_TUNING`),
  `index.html` (script load order + `?v=` bumps, ask menu styles).
  Re-verify every file/line citation in the plan against the current code; a
  moved citation is itself a finding (low severity).

**Verification (how the audit is complete):** every phase's proposed change
and every locked decision D1–D28 is traced to one of the three states above;
findings are recorded in a new `## Audit findings — Phase 11` section of
this plan, each entry { promised, found (with current file/line), state
(a/b/c), severity, suggested fix }; the Status table marks Phase 11 Done and
the Handoff is updated (`Resume at: Phase 12` + the finding summary);
NO code file was modified and the live page was left untouched.

### Phase 12 — Fix the audit's findings

**Goal:** Work through the Phase 11 findings list in severity order. Each
finding gets fixed, verified live (`browser_eval`, `vision` for anything
visual), marked resolved in the `## Audit findings — Phase 11` section with
a one-line note of what changed (and any `?v=` bumps, load-order changes),
and the plan's Status table / Handoff stay in sync. The invariants that
matter to a finding are re-checked on the live page as part of its fix — the
full Phase 10 sweep (D1 same-save-same-answer, flavor-never-flips, D2 writer
effects stripped, D5 availability re-check, D7 ladder, D14 the only intimacy
door) is re-run at the end of the phase, not per finding. A finding whose
"fix" would require changing a locked decision is NOT fixed silently — it is
flagged in the Handoff and promoted to a new D-number first (the standing
rule: stop and flag, don't improvise).

**Files:** whatever each finding touches (the Phase 11 file list is the
universe).

**Verification:** every finding is either resolved-with-note or explicitly
deferred-with-reason in the findings section; the end-of-phase sweep is green
on the live page; final clean `browser_refresh` with no perchanceErrors /
syntaxErrors; Status table marks Phase 12 (and hence the whole plan) Done and
the Handoff says so. If the findings list is large, a session fixes a
coherent subset (highest severity first), updates the findings section and
Handoff (`Resume at: Phase 12 — next finding: <id>`), and stops; the phase
is Done only when the findings list is empty.


## Audit findings — Phase 11

Audit date 2026-08-17, read-only (no code changes, no live turns). Every
phase block (1–10), every locked decision (D1–D28), the Data model, the
Design invariants, the Open questions, and `asks-llm-prompt.md` were traced
against the live code. Everything of substance is **implemented as proposed**
(state a) — the two dozen citations below that came out clean include: the
spine (`parseAskInput` asks.js:1105, `resolveAsk` asks.js:1129,
`buildAskDirective` llm.js:132, the effect-strip gated in `doConvSend`
ui.js:~4697 not in `callLLM`, `.conv-tag` CSS index.html:3756); the tree
(`ASK_CATEGORIES` asks.js:1072, `askMenuRender`/`askMenuInsertLeaf`
ui.js:4450/4481, hint index.html:4517); the ladder (decline-only escalation
+ REL_DELTA asks.js:1152, `sweepAskCounts` from `processDayRollover`
ui.js:189, `ASK_TUNING.ladder` config.js:1243); scheduled asks
(`freeSlotsFor`/`hasFreeSlotsAhead` asks.js:271/300, `openAskScheduleModal`
render.js:1928, proposerId-into-acceptedIds in `runAskScheduleFlow`
ui.js:4851, `buildSchedulingConfirmDirective` llm.js:174); meal inference
(`mealLabelForWindow` overlap asks.js:318, labels on modal/confirm/memory);
money & chores (`ask_loan`/`ask_chore`, `EARN_MONEY` + `_loanOwed` +
`postEffects`, `NPC_ACTIVITY`); intimacy (act `'default'`, D22's exact
verdict mapping incl. floor-writes-nothing, `noteIntimacyRefusal`/
`noteIntimacyOccurred` through the live-npc re-read, D23); photos (act
`'photo'`, `WILLINGNESS.thresholds.photo` = 0.4 config.js:3693, deterministic
`buildAskPhotoRecord`/`getAskPhotoImage`, `ASK_SHARE_PHOTO` kept out of
`ASK_TYPES`); gifts (structured `giftDefId` via `extra`, `giftMatchKind`
over exactly interests/want/wound, `giftableStacks` inventory.js:299); and
hardening (both fallback passes through `applyProposal`, the `_loanOwed`
repay lifecycle). Load order + `?v=` bumps verified: asks.js?v=10 loads
after commitments/willingness/effects/npc/llm/x5/image and before
ui.js?v=99, and the load-order comment documents it. `asks-llm-prompt.md`
matches `buildAskDirective`/`buildSchedulingConfirmDirective` line-for-line.
No file/line citation in the plan was found moved in a way that mattered.

Findings (state: a = implemented as proposed; b = documented deviation; c =
missing/drifted). All are LOW severity — none is a functional defect and none
requires changing a locked decision.

- **F1 (c, low) — D5's "category already maxed today" availability clause
  never landed.** No leaf implements a per-day max; repeated asks are handled
  by the D7 ladder (penalties + 3rd+ REL_DELTA), not by an availability gate,
  and no phase block ever specified the cap's shape or value.
  Promised: D5 (line ~168), "category already maxed today". Found: no
  `available()` returns false on a count-based cap (asks.js ASK_INFO/LOAN/
  CHORE/INTIMACY return `() => true`; hangout/meal gate on resident +
  `hasFreeSlotsAhead`; repay/gift/photo gate on their own resources).
  Suggested fix: either add one line to D5 noting the ladder is the per-day
  pressure mechanism (no max gate), or close as intended in Phase 12 with a
  note. The verification sweeps (Phase 10, 33/33) never required it.

- **F2 (b, low) — `buildAskPhotoRecord`'s `caption` is dead.** The record's
  flavor-aware caption ("Selfie from <name> — <ask>", asks.js:784) is never
  rendered: `runAskPhotoFlow` paints the accepted-photo bubble with the fixed
  `'📷 Photo'` tag and no caption (ui.js:4914). D24's deterministic-record
  requirement and Phase 8's image-bubble requirement both work; the caption
  is an unused extra. Suggested fix: render `record.caption` as the bubble's
  text, or delete the field.

- **F3 (c, low) — asks-llm-prompt.md {stance} vocabulary drifts from the
  code.** Promised: "{stance} ... warm / playful / measured per relationship
  phase; decline: polite / distant / stern / exasperated (ladder 3+) /
  apologetic-but-firm (busy)". Found: `askStanceFor` (asks.js:201) never
  emits `playful` (accept is `measured` early / `warm` otherwise, `polite`
  for a gift miss) and no leaf returns reason `busy` (the two-stage flow
  moved schedule conflicts to the modal), so `apologetic-but-firm` is dead
  vocabulary; the code's actual 2nd-rung word `guarded` (asks.js:1154) is
  described in the doc's ladder table as "little resistance" but never named,
  and the floor mapping (`floor_hostile`/`floor_cold_shoulder` → `stern`,
  `floor_stranger` → `distant`, asleep/refusing → `polite`) isn't in the doc
  either. Suggested fix: rewrite the {stance} row to the code's real
  vocabulary (measured/warm/polite/distant/stern/guarded/exasperated + floor
  mapping), keeping doc and `buildAskDirective` in sync.

- **F4 (c, low) — asks-llm-prompt.md header still calls `buildAskDirective`
  "planned in asks-and-attachments-plan.md Phase 1".** It is implemented
  (llm.js:132). Suggested fix: reword to "implemented".

- **F5 (c, low) — ARCHITECTURE.md:53 and README.md:55 say "D1–D26 locked".**
  D27 (repay leaf) and D28 (fallbacks through applyProposal) landed in
  Phase 10; the Handoff and Status carry D1–D28. Suggested fix: update both
  doc rows to D1–D28.

- **F6 (c, low) — the plan's Open questions still lists "NPC money for
  loans" as open ("Decide in Phase 6; lean is relationship-capped loans with
  no new field").** Phase 6 implemented exactly that lean (`ASK_TUNING.loan
  .maxByPhase` is the size control, no npc cash field, ASK_LOAN comment
  documents the decision), but — unlike the gift-sources question, which is
  marked "Resolved in Phase 9 as D26" — this one was never marked resolved
  and no D-number was promoted. Suggested fix: mark it resolved in the plan
  (optionally promote a D-number).

- **F7 (b, low) — three phase-verification lines are stale, each superseded
  by a later locked decision (the code matches the decisions, not the old
  lines).** (1) Phase 1: "Send the identical ask twice → identical
  accept/decline (seed, D1)" conflicts with D7 — the 2nd same-category ask
  draws `count=1` seed and a ladder penalty, so it is *supposed* to differ;
  D1's real test is reload-stability, which Phase 10 verified. (2) Phase 4:
  "pick a work-bound slot → hard-block refusal path" predates D8's final
  shape — the modal offers free windows only and the hard-block recheck is a
  safety net that reopens the modal. (3) Phase 2: "unavailable leaves greyed
  for a stranger/hostile NPC" — `ask_intimacy` deliberately stays enabled for
  strangers (D14: a stranger's ask refuses, it doesn't grey out).
  Suggested fix: mark these lines superseded (by D7/D8/D14) so a future
  reader doesn't treat them as current expectations.

- **F8 (informational) — benign retained vocabulary / stale plan sketches,
  no action strictly required.** `ASK_REASON_PHRASES` (asks.js:61) and the
  prompt doc list `busy` ("their schedule genuinely won't allow it") but no
  leaf returns it (two-stage flow, D18's proposerId). The plan's Data-model
  `resolveAsk` shape is a subset of the code's return (which adds
  `reasonPhrase`, `ladder`, `flavor`, `setSlot` — a consistent superset).
  The Data-model `ASK_CATEGORIES` sketch (7 categories) predates Phase 9
  (gifts) and Phase 10 (repay under money); the code's registry is
  authoritative. D3's regex illustration `^\$([A-Za-z0-9_]+)\s+(.*)`
  conflicts with its own bare-`$AskId` clause; the code's
  `^\$([A-Za-z0-9_]+)(?:\s+(.*))?` (asks.js:1108) resolves in favor of the
  bare-ask clause. Phase 4's "day tabs" are day header rows in the shared
  modal, and Phase 5's "index.html: modal day rows" is implemented in
  render.js (`openAskScheduleModal`) — file-location drift only.

### Phase 12 resolutions (2026-08-17 — all findings resolved, no deferrals)

- **F1 — resolved-with-note.** Closed as intended: D5 now states the D7
  ladder is the per-day pressure mechanism and no leaf imposes a count gate.
- **F2 — resolved (code).** `runAskPhotoFlow` (ui.js:4907) now renders
  `record.caption` as the accepted-photo bubble's text
  (`convAddImageBubble('npc', url, record.caption, '📷 Photo')`,
  textContent-rendered). `ui.js` `?v=99 → ?v=100`. Verified live: direct flow
  call (caption + tag + image, vision-confirmed) and a real `$RequestPhoto`
  turn (gated decline this save — correct, the flow only runs on accept).
- **F3 — resolved (doc).** asks-llm-prompt.md's `{stance}` row and the stance
  ladder now carry the code's real vocabulary (measured/warm; distant/polite;
  guarded/exasperated; floor stern/distant/polite; gift-miss polite), the
  ladder table gained a Reason column with the exact ASK_LADDER_REASONS
  strings, and `busy` is flagged retained-but-unused. Verified in sync with
  `askStanceFor` (asks.js:201) and `resolveAsk`'s ladder override (asks.js:
  1152).
- **F4 — resolved (doc).** Header now reads "implemented" (with llm.js
  source).
- **F5 — resolved (doc).** ARCHITECTURE.md:53 and README.md:55 now say
  D1–D28. (The plan itself carries D1–D29 after D29's promotion; the Phase 11
  Status row keeps D1–D28 because that is what Phase 11 audited.)
- **F6 — resolved (doc + new decision).** The NPC-money open question is
  marked "Resolved in Phase 6 as D29" and D29 was promoted to Locked
  decisions (no NPC cash field; loans relationship-capped via
  `ASK_TUNING.loan.maxByPhase`; the parsed amount feeds only the writes,
  D21).
- **F7 — resolved (doc).** The three stale phase-verification lines (Phase 1
  "send twice → identical", Phase 2 "stranger/hostile greyed", Phase 4
  "work-bound slot refusal") are now marked superseded by D7/D8/D14 in place.
- **F8 — resolved (doc).** D3's regex illustration fixed to
  `^$([A-Za-z0-9_]+)(?:\s+(.*))?` (asks.js:1108); superset notes added to the
  Data-model `resolveAsk` shape and `ASK_CATEGORIES` sketch (8 categories,
  code registry authoritative); Phase 4/5 file lists point at render.js
  `openAskScheduleModal`. `busy` retention is documented in the prompt doc's
  `{reasonPhrase}` row.

**End-of-phase invariants sweep (2026-08-17, live, all green):** D1
same-save-same-answer (same-clone resolveAsk, 5 leaves), flavor-never-flips
(2 flavors per leaf), D2 writer effects stripped (stubbed LLM smuggling
`SPEND_MONEY 50` through a VALID proposal; `$RequestLoan $80` → money +80,
`_loanOwed` written, no −50), D5 availability re-checked at decide (photo
leaf alone-vs-onlooker), D7 ladder (1st distant / 2nd guarded / 3rd
exasperated + REL_DELTA −0.06 exact on a clone), D14 the only intimacy door
(stranger's ask enabled in menu, reason == gate reason `floor_stranger`,
floor writes nothing). Final `browser_refresh` clean — no perchanceErrors /
syntaxErrors.


## Status
| Phase | Status | What it does |
|---|---|---|
| 1 | Done | The ask spine: registry, parse, decision, strip, directive, tag |
| 2 | Done | The Request tree menu in the conversation overlay |
| 3 | Done | The repeat ladder + escalation stance |
| 4 | Done | Scheduled asks: calendar modal, free-slot probe, commitment, pass 2 |
| 5 | Done | requestMeal + breakfast/lunch/dinner inference |
| 6 | Done | Loan + chore asks with real state writes |
| 7 | Done | Intimacy asks through the willingness gate |
| 8 | Done | Photo asks + camera-roll sharing as image bubbles |
| 9 | Done | Gifts from inventory with interest-matched REL_DELTA |
| 10 | Done | Memory/assessor integration + verification sweep |
| 11 | Done | Full-plan audit: trace every phase block + D1–D28 to the code, record findings (no code changes) |
| 12 | Done | Fix the Phase 11 findings F1–F8 (one code change: F2 photo-caption bubble; the rest doc sync), verify each live, end-of-phase invariants sweep green, final clean refresh |

## Dependency order
```
Phase 1 (the spine) ──► everything else
    ├─► Phase 2 (menu) ──► Phase 3 (ladder)        // ladder needs repeatable asks
    ├─► Phase 2 ──► Phase 4 (scheduled) ──► Phase 5 (meal inference)
    ├─► Phase 3 ──► Phase 6 (money & chores)       // ladder penalty is a loan input
    ├─► Phase 7, 8, 9 (independent — any time after Phase 1)
    └─► Phase 10 (hardening) ──► Phase 11 (audit) ──► Phase 12 (fix findings)
```
Phases 7–9 have no dependency on 2–6 and may be slotted in any order. Phase 5
must follow Phase 4 (it needs the modal). Phase 6's ladder coupling is one
penalty term; it can start before Phase 3 if the penalty is stubbed. Phases
11 and 12 are strictly last and sequential — 11 audits the finished system,
12 fixes what 11 records.

## Open questions (parked, none blocking)
- **NPC money for loans.** NPCs have no cash field today (verified). Decide
  in Phase 6; lean is relationship-capped loans with no new field.
  **Resolved in Phase 6 as D29 — relationship-capped loans, no new field.**
- **Counter-offers on decline.** Should a declined ask offer a counter
  ("can't tonight — tomorrow?")? Parked; revisit after Phase 4's modal exists.
- **Gift sources.** Inventory only, or also a small store catalog like FUOC's?
  **Resolved in Phase 9 as D26 — inventory only.**
- **The menu in IM.** Port the ask tree to the phone/computer messaging
  surface? Deliberately out of scope for v1.
- **Meal variety.** `requestMeal` covers shared meals; "make me breakfast"
  (a chore-style ask producing food) can be a Phase 6 chore variant later.

## Design invariants
1. **Decision first, always.** An ask's outcome is computed before any LLM
   call; the LLM never has the first word on an ask turn. (The whole point of
   this plan. A regression here silently hands outcomes back to the narrator
   and undoes everything.)
2. **Flavor never decides.** If a player's optional text can flip a decision,
   that is a bug. The Phase 10 sweep holds a test for it.
3. **The writer never writes state on ask turns.** Effects are stripped;
   anything the ask needs goes through the ask pipeline and the effect
   pipeline. Extends X-5's "the writer scores nothing" to "the writer also
   decides nothing."
4. **Same save, same answer.** Every decision draws `seededRng` with a
   per-ask seed. Reloading never renegotiates. (Same principle as
   `respondToCommitment`.)
5. **Availability is belt and braces.** Checked in the menu *and* re-checked
   at `decide()` — state moves between render and send.
6. **Asks are category-scoped.** The ladder counter is per category; a loan
   and a dinner never share a streak.