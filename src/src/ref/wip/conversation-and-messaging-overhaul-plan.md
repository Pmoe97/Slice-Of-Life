# Conversation & Messaging Overhaul

Status: **in progress — Phases 1–4 built and verified; Phase 5 next.** Opened 2026-09-27 from the user's bug/QoL
list ("We need to fix conversing in this game").
Last updated 2026-09-27.

## Companions

- `src/src/ref/complete/asks-and-attachments-plan.md` — the ask spine this
  plan extends (decide-before-LLM, flavor never decides, writer effects
  stripped on ask turns, seeded determinism). Every invariant there still
  holds; this plan adds *structured arguments* and a *second surface*
  (texting), not a second decision path.
- `src/src/ref/wip/actions-and-activities-overhaul-plan.md` — its **D6**
  ("the chat modal's Ask button pre-expands Affection") is **reversed** here
  by the user (D3 below). Its money ledger (D9) and borrow/return (D8) are
  reused unchanged.
- `src/src/ref/complete/scene-reader-ui-plan.md` — Phase 5's recalled half
  of the conversation pane (`recallSceneExchanges`) is what chat images now
  interleave with (D1).
- `src/src/ref/complete/plan-x5-conversation-consequences.md` — the Assessor
  and Chronicler judge IM turns exactly like spoken ones; the new texting
  asks ride that unchanged.

This is a living document. Update the Handoff and the Status table whenever
something lands; they must never disagree.

## Handoff — read this first

**Resume at:** Phase 5 (Messages).

**Last session's notes:** Plan written from a survey of `ui.js`
(conversation overlay, ask menu, gift/borrow pickers), `asks.js`,
`image.js` (F3 scene panel), `computer.js`/`ui.computer.js`/
`render.computer.js` (Messages), `llm.js` (IM prompt).

2026-09-27 (second session): Phases 1–2 were already built by the first
session (cut off mid-Phase 3); this session finished Phase 3. The composer
is `renderAskComposer` in `ui.js` — host-agnostic on purpose, so Phase 5's
Messages sheet reuses it rather than growing a second one. Pure helpers it
reads live in `asks.js`: `askCategoryOf`, `askRemoteCategories`,
`askArgDefaults`, `askArgsReady`, `askArgSummary`. Live-checked in
`dev-harness.html` with Playwright (stubbed `root.generateText`/
`generateImage`) at 1280×900 and 390×844: menu opens at the root titled
Interact, a $50 Loan chip moves $50 and records it on the ledger, the bubble
reads "Give Money · $50 · Loan", Escape cancels the composer before it
pauses the talk. `verify-acc-p13.js` pinned the old "asking you not to"
phrase — updated to D9's "asking the player not to" (the assertion was
wrong, not the code).

Phase 4 (same session): `inventory.js` owns the giving model —
`giftSources` (bag minus borrowed/key/rotten, plus ready food in any
fridge/pantry that isn't someone else's), `giftGoalFor`/`giftMatchesGoal`,
`findGiftSource` (re-find a pick in live state) and `giveGiftUnit` (the one
writer; one serving of a plate). ASK_GIFT moves through `giveGiftUnit` in
postEffects — its old `MOVE_ITEM` line took the first stack of the def and
moved a plate whole. Two things beyond the plan, both needed for the user's
Care Package to actually finish: (1) the Bonding Night step says "snacks or
drinks" but matched category `food` only, which contains no drink —
`GIFT_GOAL_CATEGORIES` makes the step take what its words say; (2) a chain
goal's `talk` step only completed when a conversation OPENED (doTalk), so
after handing the meal over mid-talk "Check in with X" never ticked until
the player closed and reopened — doConvSend now completes a waiting talk
step on the next spoken turn. The scene chip still has a wordless path for
someone who won't talk (a cold shoulder can't be talked to at all —
checkRelConsequences refuses), now through the same picker and writer.
Live-checked: chip → conversation → picker (fridge plate pinned "For your
goal") → 3→2 servings in the fridge, 1 in their things → goal advances →
the next line completes the Care Package.

**Blockers / flagged deviations:** None.

## The thesis

Talking is the game's main verb, and it has drifted into two unequal halves.
In person, the conversation has a request tree, pickers, photos, money and
a scene visualizer; but the visualizer never reads a word of the
conversation, reopening a talk shoves every picture to the bottom, the
request tree opens on the wrong page, and the two things players most often
want to *do* — hand someone a meal for a goal, give someone money — are the
two least obvious flows in it. Over text, there is nothing at all: a text
box and a Send button.

The fix is not more asks. It is making the asks that exist **easy to reach,
honest about what they need, and available wherever talking happens.**

### What this plan is *not*

- **Not new decision logic.** No leaf's `decide()` changes. Structured
  arguments (amount, gift/loan, event kind, guests) feed the *writes* only,
  exactly as `giftDefId` and the calendar slot always have (D1 of the asks
  plan).
- **Not a new image pipeline.** The scene panel keeps its record shape,
  LRU cache, reroll modal and persistence; only its *prompt* changes.
- **Not physical asks over text.** Hugs, borrowing, follow-me and handing
  over an item stay in-person only. Texting gets the asks a phone can
  actually carry.
- **Not a Messages redesign.** The thread list, typing dots, invite buttons
  and shared-thread-across-devices model all stay; the thread gains a `+`.
- **Not an NPC-initiated texting system.** NPCs already text through
  `processNpcImMessages`; making them *ask* things over text is future work.

## Evidence

| # | Symptom (user report) | Cause (file:line at survey time) |
|---|---|---|
| E1 | Reopening a conversation stacks every scene image at the bottom | `openConversationOverlay` (ui.js ~7456) draws ALL recalled rows, then ALL images (`convRenderImages`), then the separator — images were never placed by time. Image records store `tick` as a tick *index* while `memory.recent` stores `tick` as *minutes* (npc.js ~598 "naming wart"), so they could not even be compared. |
| E2 | The scene visualizer "does not read the conversation AT ALL" | `buildConversationScenePrompt` (image.js ~1960) is a fixed template: the two appearance clauses + room + mood label + one of ten canned `CONV_SCENE_BEATS` picked by panel index. No transcript, no LLM pass. The only LLM-drafted image prompt in the game is the *photo ask* (`draftAskPhotoPrompt`, asks.js ~1256). |
| E3 | The Asks menu always opens on Affection | `openAskMenu` (ui.js ~7566) hard-codes `askMenuPath = ['affection']` (actions-and-activities D6). |
| E4 | Giving a meal for a goal makes no sense | Three separate gift paths that don't know about each other: (a) the Care Package / Bonding Night / Make Things Right goals advance ONLY through the scene chip `Give Item to X` (`doGiveItem`, ui.js ~4329), which hands over the *first* matching bag item with no choice and never talks; (b) the in-conversation **Give a Gift** ask moves the item but never advances a goal; (c) a cooked meal lands in the **fridge** (`buildCookEffects`, defs.actions.js ~2612), so neither path can even see it until the player manually moves it to their bag — and then `doGiveItem` would hand over the whole multi-serving batch. |
| E5 | Money giving isn't fluid | `$GiveMoney` / `$RequestLoan` / `$RequestRepay` / `$CollectMoney` read the amount (and gift-vs-loan) by regex out of free text (`giveMoneyAmountFor`, `giveMoneyModeFromFlavor`, asks.js ~963). No amount = a silent $40 default. |
| E6 | Messages has "virtually zero functionality" | `renderMessages` (render.computer.js ~4636): a text input and Send. No asks, no money, no photo exchange (photos can only be pushed *from* the Photos app), and `buildImPrompt` (llm.js ~453) cannot carry an ask directive. |

Found in the deeper pass (not in the user's list):

| # | Defect |
|---|---|
| E7 | Messages renders message text and previews with `innerHTML` — model or player text containing markup is rendered as markup. |
| E8 | IM threads grow without bound in the save (`thread.msgs.push`, no cap anywhere). |
| E9 | Several ask `leafNote`s are written from the wrong side of the table. The directive is addressed to the NPC ("Reply ONLY as {npc}"), but GiveMoney says "You just handed them money", RequestPhoto "They said yes to sending you a photo", Hang Out / Meal "They said yes to …" — the NPC is told the *player* made the decision. |
| E10 | Three ask reason codes have no phrase and fall through to "it's not the right time": `give_money`, `return` (Give It Back), and CollectMoney reuses `repay` ("they're settling what they owe") for the NPC paying the player back. |
| E11 | `doConvSharePhoto` skips what `doConvSend` does per turn: the partner presence re-check, the departure lifecycle, `context.conversationNpcId`, and the scene visualizer. |

## Locked decisions

Decided on the user's behalf in this session where the user's message left
the choice open — each is flagged **(confirm)** and listed in the final
reply as a question.

### Chat images
- **D1 — An image stays where it happened.** Every new chat image record
  stores `anchor` (the last scene-channel `memory.recent` entry at the moment
  the image was *requested*: `{ day, tick, text }` with `tick` in minutes,
  the recent-buffer convention) plus `minutes`. On reopen, recalled rows and
  images merge: an image goes right after its anchor row; an evicted anchor
  (or a legacy record) falls back to time order (legacy `tick` is an index,
  so ×30). Live, the "generating" placeholder is placed when the panel is
  requested and the finished image replaces it in place — a reply that
  arrives meanwhile no longer pushes the picture below itself.

### Scene visualizer
- **D2 — A scene director reads the conversation.** Before generating a
  panel, one text-model pass (`draftConversationScene`, image.js) reads the
  last ~10 spoken lines of this conversation, the room, the time of day,
  what each of them is doing and wearing, and the previous panel's
  description, and returns ONLY the moment: poses, expressions, gestures,
  props, framing — never appearance. The final prompt is the two identity
  clauses (unchanged `buildVisualCharacterClause`) + that moment + room +
  lighting + orientation, so faces stay stable while the picture follows the
  talk. The draft is frozen on the record (reproducible, rerollable); the
  cache key folds a hash of the final prompt so an older save can never
  serve a stale panel. A failed or empty draft falls back to the old
  template. `{ } [ ]` are stripped (Perchance template trap).

### The request menu
- **D3 — Renamed "Interact" (confirm), opens at the top level.** The `+`
  menu holds requests, gifts, money, photos, affection, apologies — "Asks"
  no longer describes it. It opens on the category list every time
  (reverses actions-and-activities D6, at the user's request).
- **D4 — A composer, not a `$Template`.** Picking a leaf no longer pastes
  `$RequestMeal <Optional>` into the text box. It opens a colour-coded
  composer strip above the input: the ask's label (tinted by category, ✕ to
  cancel), the ask's **argument chips** (Tab/arrow/touch navigable, real
  buttons), and the text box becomes the optional message. Enter or Say
  sends. Typed `$AskId words` still works for anyone who uses it.
- **D5 — Arguments are structured inputs.** They ride `resolveAsk`'s
  `extra` exactly like `giftDefId` — never into `decide()`. Flavor parsing
  stays only as the fallback for typed `$` input.
  - Give Money: amount (preset chips + custom, capped by wallet) and
    **Gift / Loan** (confirm the two colours: gift = warm/positive, loan =
    amber).
  - Loan Request: amount (chips capped by the relationship-phase cap, which
    the composer shows).
  - Repay a Loan / Collect a Debt: amount, defaulting to everything owed.
  - Invite: event kind (the `playerInvitable` commitment kinds) and other
    roommates to include (toggles). Throw a Party: roommates to include.

### Gifts
- **D6 — One giving pipeline, and it can reach the fridge (confirm).**
  - The gift picker lists the bag **and** ready-to-eat food in the
    apartment's fridge/pantry (home-cooked plates, meals, snacks — never raw
    ingredients), labelled by where it is. From outside the kitchen the
    gesture is "I saved you a plate — it's in the fridge"; in the kitchen or
    dining room it's handed over.
  - A home-cooked plate gives **one serving** (split into their things; they
    eat it when hungry), never the whole batch.
  - Items that satisfy an active goal step for this person are pinned to the
    top with a **For your goal** badge.
  - Giving in conversation advances any matching `give_item` goal step and
    counts as cold-shoulder reparation, exactly as the old chip did.
  - The scene chip (`Give Item to X`) now opens the conversation straight
    into that picker instead of silently handing over the first match — one
    flow, not two.

### Messages
- **D7 — Texting gets the phone's version of Interact.** A `+` beside the
  text field opens a sheet of the asks a phone can carry — a leaf opts in
  with `remote: true`: Ask About Them, Hang Out, Meal Invitation, Invite,
  Throw a Party, all four money leaves, Photo Request, Share a Photo, Post a
  Photo of Us, Apologize, Ask for Space, the subscription talk. Same
  registry, same `decide()`, same composer and argument chips. Over text:
  a photo request that's accepted comes back as a generated photo *in the
  thread* (persisted, rerollable, same record contract as chat images);
  money shows as a transfer bubble; plans open the calendar modal and end
  with a confirming text. Ask turns keep every in-person invariant: decide
  first, writer effects stripped, the ask's own effects applied once.
- **D8 — Messages is textContent-only** (E7) and **threads cap at 400
  messages** (E8), oldest trimmed.

### Ask plumbing
- **D9 — leafNotes speak to the NPC** (E9): "you" is the NPC, "they" is the
  player, everywhere.
- **D10 — Every reason code has its own phrase** (E10): `give_money`,
  `return`, and a new `collect` for CollectMoney.

## Data model

```js
// Chat image record (npc.flags._convImages[] and IM message.image) — D1
{ kind: 'scene'|'askphoto'|'shared', from, tag, caption,
  day, tick /* legacy: tick INDEX */, minutes /* new: clock minutes */,
  anchor: { day, tick /* minutes */, text } | null,   // new
  cacheKey?, id?, photoId?, prompt, seed, negativePrompt, promptStyled?,
  moment? /* D2: the director's drafted moment, for the next panel */ }

// Ask leaf, new optional fields — D5/D7
{ ...leaf,
  remote: true,                       // offered in Messages
  args: [                             // composer argument groups
    { id: 'amount', kind: 'amount', presets(gs, npc, npcId) -> [n],
      max(gs, npc, npcId) -> n, initial(gs, npc, npcId) -> n, hint(gs, npc, npcId) -> str },
    { id: 'mode', kind: 'choice', options: [{ id, label, tone }], initial },
    { id: 'guests', kind: 'multi', options(gs, npc, npcId) -> [{ id, label }] },
  ] }
// Structured args arrive in resolveAsk's `extra` as { amount, mode, kind, guests }.

// IM message, new optional fields — D7
{ from, text, day, tick, tag?, askId?, image?: <chat image record>,
  transfer?: { amount, dir: 'out'|'in', mode } }
```

## Implementation phases

### Phase 1 — Images stay in place (D1)
**Goal:** reopening a conversation shows every image where it happened.
**Files:**
- `npc.js` — `recallSceneExchanges` rows carry `day`/`tick`/`text` of the
  entry they came from (additive).
- `ui.js` — `convImageAnchor(npc)`; anchor + minutes stamped on scene
  panels, ask photos and shared photos; `openConversationOverlay` merges
  (`convMergeRecalled`); the live panel replaces its own placeholder.
**Verification:** `verify-conv-images.js` — interleave by anchor, by time
for an evicted anchor, legacy records, live placeholder replaced in place.

### Phase 2 — The scene director (D2)
**Files:** `image.js` — `draftConversationScene`, `buildConversationScenePrompt`
takes the draft, cache key folds the prompt hash; `ui.js` passes the
previous panel's moment.
**Verification:** `verify-conv-scene.js` extended — the draft reads the
transcript, two panels of different conversation differ, fallback on
failure, no braces reach the prompt.

### Phase 3 — Interact: rename, root, composer, arguments (D3/D4/D5/D9/D10)
**Files:** `asks.js` (args, remote flags, reason phrases, leafNotes,
arg-aware effects), `ui.js` (composer, send path), `index.html`
(composer markup + CSS, labels).
**Verification:** `verify-ask-composer.js`; live click-through in
`dev-harness.html`.

### Phase 4 — Gifts (D6)
**Files:** `inventory.js` (`giftSources`), `asks.js` (ASK_GIFT plate
serving + goal hook), `ui.js` (picker, chip → conversation).
**Verification:** `verify-gift-flow.js` — Care Package end to end.

### Phase 5 — Messages (D7/D8)
**Files:** `computer.js` (IM ask resolution, cap), `llm.js`
(`buildImPrompt` ask directive), `ui.computer.js` (sheet, composer, send),
`render.computer.js` (bubbles, tags, images, transfers, escaping),
`index.html` (CSS).
**Verification:** `verify-im-asks.js`; live on the phone in the harness.

### Phase 6 — Close-out
Full suite, patch notes (0.14.2 entry), ARCHITECTURE/README rows.

## Status

| Phase | State |
|---|---|
| 1 — Images stay in place | built + verified (`verify-conv-images.js` 32) |
| 2 — Scene director | built + verified (`verify-conv-scene.js` 42) |
| 3 — Interact composer | built + verified (`verify-ask-composer.js` 69; live in the harness) |
| 4 — Gifts | built + verified (`verify-gift-flow.js` 51; live in the harness) |
| 5 — Messages | not started |
| 6 — Close-out | not started |
