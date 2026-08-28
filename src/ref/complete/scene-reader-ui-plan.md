# The Scene Reader

Status: **complete — all five phases built and verified**. Design session
complete 2026-08-10; all decisions locked. Phases 1–4 built 2026-08-10,
Phase 5 built 2026-08-11.
Last updated 2026-08-11.

Companions:
- `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md` (the umbrella — this is Plan 2 of six, and the first one the player will actually *feel*).
- `src/ref/complete/perception-and-signals-plan.md` (Plan 1 — **complete**; this plan is its first real consumer. `perceiveSignals`, `signalPhrase` and the `salience` field on every perceived record were all built for this).
- `src/ref/complete/npc-correctness-fixes-plan.md` (Plan 0 — **complete**; its Phase 1 turned `memory.recent` into a 40-entry channel-tagged buffer, which is what makes Phase 5's conversation history possible at all).

Paired session prompt: `src/ref/complete/scene-reader-ui-handoff-prompt.md` —
it holds *how to work*, this holds *what to build*. Both moved here together
when the last phase landed.

This was a living document, worked one phase per session; it is now the record
of what got built. The Handoff below says so and the Build notes keep every
specific the five sessions paid for.

---

## Handoff — read this first

**Resume at: nothing — the plan is complete.** All five phases are built and
verified. Do not open a new session against this document; it is a record of
what was built, not a queue. The next piece of work is roadmap Plan 3
(`npc-cognition`), which depends only on Plan 1 and is independent of this.

Harness coverage: 40 assertions for Phase 1 (`dev/verify/verify-r1.js`), 27
for Phases 3+4 (`dev/verify/verify-r34.js`), 43 for Phase 5
(`dev/verify/verify-r5.js`); Phase 2 is DOM only. Whole suite across three
plans: **432, green.**

**Blockers / flagged deviations:** none. No phase hit a conflict with the live
code and no locked decision turned out unworkable.

**Phase 5 notes (2026-08-11):**
- The pure half is **`recallSceneExchanges(npc, nowDay)` in `npc.js`**, sitting
  directly beside `getRecentExchanges` — the same buffer, one function per
  reader: that one is the prompt's view, this one is the player's. Helpers
  `recallRow` and `recallTimeLabel` beside it. The plan's file list named only
  `ui.js` and `index.html`; putting the logic in `npc.js` instead of the
  renderer is what made 43 assertions possible on a phase billed as DOM-only.
- It returns display-ready rows — `{kind:'time',label}`,
  `{kind:'bubble',from,text}`, `{kind:'beat',text}` — so the DOM half
  (**`convRenderRecalled(npc)` in `ui.js`**) has no filtering, no timestamp
  formatting and no `channel` string in it at all. A harness assertion greps
  for exactly that and fails if any of it migrates into the renderer.
- **`openConversationOverlay` still clears first, then renders.** Order is
  asserted: clear before render, or re-opening doubles the history. Verified in
  the browser — re-open leaves one copy and one separator.
- **`convScrollToBottom()` must run AFTER `overlay.setAttribute('data-open')`.**
  While the overlay is `display:none` the log has no layout, so `scrollHeight`
  is 0 and the scroll silently does nothing — the pane would open at the oldest
  recalled line instead of at the present moment. Ordering is asserted.
- **A timestamp per *exchange*, not per line.** D14 says "a timestamp per
  exchange"; a time row is emitted only when `(day, tick)` changes. Four lines
  at 19:00 get one `19:00`. Grouping on minutes alone would merge yesterday
  into today, so the day is part of the key — asserted.
- Labels: today is a bare `19:30`; the day before is `Yesterday 19:30`; older
  is `Wed Mar 24, Year 1 · 19:30`. Entries from before Plan 0 stamped these
  fields carry `day: 0` and read as **`Earlier`** — the same word `sceneHistory`
  already uses for a closed scene whose time was never recorded, rather than
  inventing `Day 0, 00:00`.
- **No second cap on how much history is shown.** The buffer is already bounded
  at `MEMORY_BUDGET.maxRecent` (40, tuned in Plan 0 with a written rationale)
  and the pane opens scrolled to the live end. A number here would be one
  nobody tuned. Asserted at the cap: 200 exchanges in, 40 bubbles out, newest
  kept. See D15.
- **Past bubbles are at `opacity: 0.62`, and a past PLAYER bubble also drops
  its accent fill — that second part is measured, not taste.** Measured in the
  browser with relative luminance against the pane background (35,35,66 →
  37.2): a past player bubble that kept `--color-accent` would read at **89.3
  at 0.62 opacity and 83.4 at 0.55**, against **44.3 for a LIVE npc bubble**.
  Dimming alone leaves the oldest thing in the pane brighter than the newest,
  which is design invariant 5 exactly backwards; you would need roughly 0.15
  opacity to bring an accent fill down to live-npc luminance, and at 0.15 the
  text is unreadable. Swapping to `--color-surface-alt` lands it at **41.6**,
  just under live. Opacity 0.62 itself was set by eye and only confirmed by
  computed style — treat that one as unmeasured.
- **Cosmetic wart, deliberately not fixed:** the forced opening line ("You
  approach Sam to talk.") is stored as `type: 'player_input'`, so on recall it
  renders as a player bubble even though the live pane showed it as a beat.
  `doConvSend` knows it was forced; `applyProposal`, which writes the buffer,
  does not. Tagging it would mean threading a flag through the memory writer
  whose ordering Plan 0's D4 assertions guard — too much risk for a UI phase.
  Pattern-matching the template string in the reader was the other option and
  is worse: a heuristic that breaks silently when the template changes.
- **The `·` in the dated label survived** because it was written with the Edit
  tool. It is the same character `render.js` already uses in ten places. The
  `python - <<'PYEOF'` heredoc mangling recorded below is real; avoid that
  route, not the character.

---

## Build notes

Kept, not buried: these are the specifics each session paid for — browser
quirks, which assertions were themselves wrong, why a constant is the value it
is. They were in the Handoff while the plan was live.

**Where the harnesses live now (2026-08-10):** they moved out of the session
scratchpad into **`dev/verify/`** in the repo, because a scratchpad is
per-session and a 389-assertion regression suite that vanishes with the chat
is worthless. `node dev/verify/run-all.js` runs everything;
`dev/verify/README.md` explains the loader, the two tuning instruments, and
how to drive the DOM harness. Every citation in this plan and in Plans 0/1 was
repointed.

**Phases 3+4 notes (2026-08-10):**
- Both surfaces ship. The **moodle strip** (`#scene-moodles`, above the
  heading) shows perceived signals always, and a need only once it has crossed
  `warnBelow`. That last part is a deliberate narrowing of the plan text: the
  footer status row already shows all four needs as labelled bars with
  percentages, so a second iconic copy of the same numbers would be noise. The
  strip stays a list of things that WANT attention.
- The **floor plan** draws each signal at its source room (D9), capped at
  `SIGNAL_ICONS.maxPerRoom`, opacity by band. `signalsByRoom` (SIGNALS) is the
  new pure query behind it — source-keyed, so intensities are the EMITTED
  value and never attenuated. That is the point: perception is the strip's
  job, emission is the map's.
- **`renderSceneReader` now returns the composed scene** so its callers can
  call `markCalloutsShouted`. The renderer deliberately does not mark them
  itself — a projection that writes to the thing it projects is how view and
  state start to disagree. A harness assertion greps `render.js` and fails if
  `markCalloutsShouted` ever appears inside `renderSceneReader`.
- **Both draw paths must mark.** `render()` and `addLogEntry` each call
  `renderSceneReader`; if only one marked, a beat arriving while a callout was
  up would redraw and leave it unmarked. Asserted for both.
- **Bug found in the browser, not the harness:** `renderSceneMoodles` read
  `rec.phrase` for its tooltips, but a raw `perceiveSignals` record carries no
  prose — `phrase` is attached by SCENE's `sensoryLines`. Every moodle had an
  empty title. Now calls `signalPhrase` directly.
- **The attention model is visible in the UI for the first time.** With
  `energy: 12`, `getPlayerPerception` bottoms out and sight drops under its
  notice floor: the player perceives note + rot only. Rested, the same room
  yields note + rot + dishes + laundry-from-two-rooms-away. Nothing was
  written for that — it falls out of Plan 1.
- **Browser-pane quirk, do not chase it:** after resizing the viewport a few
  times, `computer{action:'screenshot'}` starts returning a scaled-down
  capture even though `#app` measures the full viewport width. `zoom` with a
  region is not supported either. Verify DOM state with `javascript_tool`
  instead — it is more reliable than reading a shrunken image.

**Phase 2 notes (2026-08-10):**
- **The dev harness works again and is the way to see this.** `dev-harness.html`
  shims the Perchance runtime and replays `index.html`. It had been failing at
  boot with `Cannot read properties of undefined (reading 'get')` because its
  kv shim predates `menu.js` — it was missing the `menu`, `saves` and
  `saveIndex` folders. Fixed. **Its folder list must be kept in step with the
  `root.kv.*` folders the game actually touches**, which is a superset of
  `KVFolders` in `state.js`.
- Serve with the `slice-of-life` launch config (port 8734) and open
  `/dev-harness.html`. **Append a cache-buster** (`?cb=2`) — the browser
  caches the harness itself and will silently serve a stale copy of your edit.
- Drive it from the console rather than clicking: `menu.new-game` →
  `generate-cast` → `approve-cast` gets you into play, and `currentGameState`,
  `doMove`, `addLogEntry`, `spawnNote` and `composeScene` are all reachable by
  bare name.
- **`.sr-establishing` must be `flex: 0 0 auto`, not `0 1 auto`.** At `0 1` a
  long run of beats squeezed the establishing passage until it clipped, which
  defeats the one thing this layout exists to guarantee. Verified with 30
  filler beats: unclipped, unmoved, unshrunk, while beats scroll and stay
  pinned to the bottom.
- **The scene image shrank from 45% to 32%** (`max-height` 360→260). At 45%
  the reader had so little room that the establishing passage clipped
  mid-callout with two sensory lines unreachable. This is a layout change the
  plan did not name, but `#main-content`'s proportions are what decide whether
  the scene reader fits, so it is in scope.
- **`calloutSalience` retuned 0.55 → 0.70.** At 0.55 an unread note *and*
  strong rot both called out at once, which is exactly the "if everything
  shouts, nothing does" failure the mechanism exists to prevent. Against
  Plan 1's salience table, 0.70 admits precisely two things — an unread note
  (≈0.86) and something breaking (0.72). Those are the two events that should
  genuinely stop you.
- Do not put backslash escapes through a `python - <<'PYEOF'` heredoc in this
  environment: `content: '\25B8'` arrived as octal `` (0x15) plus `B8`.
  Use the literal character.
- `renderNarrationLog` is deleted. Its per-entry branches survive as
  `buildLogEntryNode`, so the beats list and any future consumer share one
  idea of what a log entry looks like.

**Phase 1 notes (2026-08-10):**
- `src/srcfiles/scene.js` is new and loads after `signals.js`. `composeScene`
  is pure and verified byte-identical-safe; a harness assertion also stubs
  `root.generateText` and fails if composition ever reaches for the model.
- **Log entries gained `roomId` as well as `minutes` and `sceneId`.** The plan
  named only the latter two. Adding room means `sceneHistory` derives the
  entire history drawer from the log alone, with nothing about a closed scene
  stored anywhere — which is RI3 and removes a whole class of drift. Asserted:
  `meta` carries no `scenes`/`sceneLog` key.
- **The `meta` 1→2 migration seeds `scene.roomId` as `null` on purpose.** A
  folder migration only ever receives `meta` and cannot know where the player
  is standing. `currentScene` resolves it lazily against
  `player.location` and does NOT write the answer back — a lazily-correct room
  beats a confidently wrong one. Asserted both halves.
- Pre-plan log entries have no `sceneId` and read as scene 0, landing in
  history under "Earlier". Their room and time were never recorded and are
  deliberately not invented.
- `openScene` is idempotent per room, so a no-op move cannot fragment history.
- Callouts are computed from the FULL perceived list and the sensory slice
  widens to `max(maxSensoryLines, callouts.length)` — a callout must always
  also appear in the passage, since it is emphasis, not removal. Asserted.
- `composeScene` costs ~133µs, so calling it on every render is fine.
- The `shouted` filter (D12) is already in `composeScene`; Phase 4 only needs
  to add the writer. It was cheaper to build the read side now than to edit
  the function twice.

**Design-session notes (2026-08-10):**
- Four design questions were put to the user and all four answered; they are
  D1, D4, D7 and D10 below. The rest follow from those plus R3/R4.
- **Verification route:** the whole engine loads into a bare Node `vm` —
  `dev/verify/loadgame.js`, established by Plan 0. `composeScene` (Phase 1) is
  pure and fully harness-testable. Phases 2–5 are DOM work and are the first
  thing in this project that genuinely needs a browser; use the Browser pane's
  preview tools, and keep as much logic as possible in the pure layer so the
  DOM half stays thin.
- **`#conv-log` is wiped on every open** (`openConversationOverlay` does
  `log.innerHTML = ''`), so the conversation pane has NO history today — every
  conversation starts from a blank box. R4 is therefore a missing feature, not
  a styling pass. Phase 5 is bigger than it sounds.
- Do not start Phase 2 before Phase 1's `composeScene` is real and tested. The
  entire value of this plan is that the scene is a *computed object* first and
  a DOM tree second.

---

## The thesis

The game already writes good prose. You just can't find it.

`#main-content` is a scene image on top of `.narration-log`, and that log is a
flat `div` per entry, last 50, newest at the bottom. Every entry gets identical
visual weight: a line of dialogue, a system notice about rent, and something a
roommate did in another room three hours ago are typographically
indistinguishable. Nothing marks *now*. Nothing establishes *where you are* —
the room name lives in a caption on the image and the only way to get a
description is to spend a turn clicking "Look Around".

The result reads like a receipt:

```
You move to the Kitchen.
Hana: "Oh — hey."
You cook pasta. It smells good — there's enough for leftovers.
Marcus tidied the living room.
```

Four unrelated facts in a queue, in the order they were appended. That is a
log of things that have happened, which is exactly what it is, and it is the
single biggest thing standing between this game and the experience it is
trying to be.

Plan 1 built the material this needs and deliberately shipped no UI for it.
`perceiveSignals` returns ranked records carrying authored prose, a band, a
source room and a **salience** score — that last field exists for precisely
one reason, which is this plan deciding what gets woven into prose and what
gets surfaced as a cue. It has had no reader since the day it was written.

A scene reader turns the same content into this:

```
THE KITCHEN — Tuesday, 19:30

Hana is at the counter, chopping something.

Something in the fridge has gone over — you can smell it from the
doorway. Dishes are stacked in the sink, two days deep.

  ─────────────────────────────────────────

Hana: "Oh — hey. Didn't hear you come in."

You cook pasta. It smells good — there's enough for leftovers.

⌄ earlier today (6)
```

Same events. Same LLM output. The difference is that one of them is a place
you are standing in and the other is a list.

### What this plan is *not*

- **Not a new narrator.** The model's output is unchanged — same prompts, same
  proposals, same `logEntries`. This plan changes the frame around them, not
  the words in them.
- **Not more LLM calls.** The establishing passage is composed from authored
  phrases (R1/D4). The one existing model call on room entry — which only
  fires when an NPC is present — stays exactly as it is. Cost per action does
  not move.
- **Not a redesign of the whole shell.** Header, sidebars, footer, chips,
  input bar, computer and phone shells are all untouched. This plan owns
  `#main-content`'s lower half, two small additions elsewhere, and the
  conversation overlay.
- **Not the interaction model.** How the player acts — chips and the free-text
  bar in the footer — is out of scope. This is what they *read*, not what they
  *do*. If the chips want rethinking, that is its own plan.
- **Not taste and touch.** Still Plan 1's non-goal, still true: they don't
  propagate, so they belong to item detail and action narration, not to the
  ambient scene.

---

## Evidence

Citations were true at commit `2e77243`. Find by name, not line number.

**What the main content area is today** (`index.html`, `#main-content`):

```html
<div class="scene-container"><img id="scene-img"> <span id="scene-label"></span></div>
<div class="narration-log" id="narration-log"></div>
```

**How the log renders** (`render.js`, `renderNarrationLog`): clears the
container, takes `sessionLog.slice(-50)`, clones `#tpl-log-entry` per entry,
sets `data-type` to one of `dialogue|narration|action|internal|system`, appends,
scrolls to bottom. There is no grouping, no timestamp, no notion of a current
moment, and no room context.

**What a log entry holds** (`ui.js`, `addLogEntry`):

```js
{ type, text, speaker, day }
```

No time, no room, no scene. Reconstructing "what happened while I was in the
kitchen" from this is impossible — the information was never recorded.

**What Plan 1 already produces and nothing reads** — a perceived record:

```js
{ signalId, channel, intensity, band, sourceRoomId, sourceId, here, salience }
```

`salience` (`def.salience × perceivedIntensity`) has had no consumer since it
was written. `signalPhrase(record, gameState)` returns authored, deterministic,
band-keyed prose and is currently called by exactly one place: the debug panel.

**The conversation pane** (`ui.js`, `openConversationOverlay`): sets the
avatar, name and status, then `log.innerHTML = ''`. Every conversation with a
character you have known for forty in-game days opens as an empty box.

---

## Locked decisions

### Scene structure

- **D1 — A scene is room-scoped.** Entering a room opens a scene; leaving
  closes it and files it to history. This is the user's decision, and it maps
  onto the game's own unit of place — rooms already gate movement, own
  cleanliness, own objects and own privacy.
- **D2 — Log entries carry a `sceneId`, and `meta.scene` records the open
  one.** "What happened while I was in here" has to be recorded, because it
  cannot be derived from the current shape (see Evidence). Additive; entries
  from before this plan read as scene `0`.
- **D3 — History is a list of closed scenes, collapsed.** Not a flat log with
  fading. The player expands "earlier today" and gets discrete places and
  times, which is the same structure the live scene has.
- **D4 — The establishing passage is composed; the model still writes the
  beat.** Authored phrases for room, time, presence and senses (R1), and the
  existing NPC-present LLM call on room entry is untouched. Walking into an
  empty room stays instant and free; walking in on someone still gets a
  reaction.

### Composition

- **D5 — Presence lines are `${name} is ${activity}`, with an authored
  override table.** `ACTIVITY_TABLES` strings mostly read correctly in that
  frame ("Hana is reading in bed"); a handful do not, and
  `PRESENCE_PHRASES[activity]` overrides those. Enriching the table is content
  work, not structure work, and can happen any time after Phase 1.
- **D6 — Sensory lines come from `mergePerceived(perceiveSignals(...))`,
  capped at `SCENE_READER.maxSensoryLines`.** Already sorted by salience, so
  the cap keeps the strongest. A signal from another room says so, exactly as
  the scene prompt's sensory line already does.
- **D7 — `composeScene` is pure and returns a plain object.** It never
  touches the DOM and never writes state. This is the whole reason the plan is
  shaped as it is: the scene becomes testable, the renderer becomes a dumb
  projection, and Plan 3 gets a data structure it can reuse.

### Peripheral awareness

- **D8 — Two surfaces ship: a moodle strip beside the scene, and sensory
  icons on the floor plan.** The user picked both. They answer different
  questions — the strip is "what am I aware of right now", the floor plan is
  "where is it coming from".
- **D9 — Floor-plan icons render at the signal's SOURCE room, not the
  player's.** That is what makes it a map rather than a second moodle strip,
  and it makes Plan 1's propagation model legible for the first time.
- **D10 — An icon encodes channel and band.** Channel picks the glyph, band
  picks the opacity. No new vocabulary — both already exist on every record.

### Attention

- **D11 — A signal at or above `SCENE_READER.calloutSalience` renders as a
  callout block inside the scene.** In the prose, visually set apart. The
  user's choice, and the right one: it reads as fiction rather than as a
  system notification, and it cannot be missed while reading.
- **D12 — A callout fires once per scene per signal.** Tracked on
  `meta.scene.shouted`. Without this, standing in a room with a note would
  re-shout on every render — which is precisely the noise the plan exists to
  remove.

### The conversation pane (R4)

- **D13 — The pane opens showing prior exchanges with this character**, drawn
  from `memory.recent` filtered to `channel: 'scene'` (Plan 0, Phase 1). Today
  it opens empty; this is the missing half of R4.
- **D14 — Past is visually and structurally marked**: reduced contrast, a
  timestamp per exchange, and a separator between the recalled history and the
  live conversation. The player must never have to work out whether they are
  reading something happening now.
- **D15 — How much history the pane shows is the buffer's cap, not a second
  number.** `recallSceneExchanges` returns the whole `channel: 'scene'` slice
  of `memory.recent`, which Plan 0 already bounds at `MEMORY_BUDGET.maxRecent`
  (40) with a written rationale, and the pane opens scrolled to the live end so
  depth costs the player nothing. A separate `SCENE_READER` knob here would be
  a constant nobody had tuned, sitting next to four that were. *(Phase 5,
  2026-08-11.)*
- **D16 — "A timestamp per exchange" (D14) means per distinct `(day, tick)`,
  not per line.** A time row is emitted only when the stamp changes, so four
  lines spoken at 19:00 carry one `19:00` between them. Repeating the same
  time down the gutter is noise with a timestamp on it, and noise is what this
  plan exists to remove. The day is part of the key: grouping on minutes alone
  merges yesterday's 19:00 into today's. *(Phase 5, 2026-08-11.)*

---

## Data model

### `meta.scene` (Phase 1) — the open scene

```js
{
  id: 12,                  // monotonic; increments on room change
  roomId: 'kitchen',
  startedDay: 3,
  startedMinutes: 1170,    // minutes-from-midnight, for the heading
  shouted: ['note'],       // signalIds already called out this scene (D12)
}
```

### Log entry, extended (Phase 1)

```js
{ type, text, speaker, day, minutes, sceneId }
```

`minutes` and `sceneId` are new. Both additive; a pre-plan entry has neither
and reads as scene `0` at an unknown time (rendered without a timestamp).

### `composeScene(gameState, sceneState)` (Phase 1) — pure, never stored

```js
{
  heading: { roomId, roomName, dayLabel, timeLabel, phase },
  presence: [ { npcId, name, line } ],
  sensory:  [ { signalId, channel, band, phrase, here, sourceRoomId, sourceRoomName, salience } ],
  callouts: [ { signalId, phrase, salience } ],
  beats:    [ ...log entries whose sceneId === meta.scene.id ],
  history:  [ { sceneId, roomName, timeLabel, beatCount } ],
}
```

### `SCENE_READER` (Phase 1) — `config.js`

```js
const SCENE_READER = {
  calloutSalience: 0.55,   // at/above this, a signal gets its own block (D11)
  maxSensoryLines: 3,      // strongest N woven into the establishing passage
  historyScenes: 12,       // closed scenes kept in the collapsed drawer
  maxBeats: 40,            // beats rendered in one open scene before trimming
};
```

### `PRESENCE_PHRASES` (Phase 1) — `config.js`

```js
// Overrides for ACTIVITY_TABLES strings that read badly as
// `${name} is ${activity}`. Everything absent falls through to that default.
const PRESENCE_PHRASES = {
  'at work': '{name} is out at work.',
  'sleeping': '{name} is asleep.',
  'commuting': '{name} is out.',
  // …
};
```

---

## Implementation phases

### Phase 1 — The scene model

**Goal:** the scene exists as a computed object, fully tested, with nothing
rendering it yet. When this phase is done, `composeScene` returns a correct
heading, presence lines, sensory lines, callouts and beats for any game state,
and the log records enough to reconstruct which scene each entry belonged to.

**Files:**
- `src/srcfiles/config.js`: `SCENE_READER`, `PRESENCE_PHRASES`.
- `src/srcfiles/scene.js` **(new)**: `composeScene(gameState, sceneState)` per the data model, plus `openScene(gameState, roomId)` (bumps `meta.scene`, called from `doMove`) and `sceneHistory(gameState)`. Pure except `openScene`. Loads after `signals.js` — it reads `perceiveSignals`/`signalPhrase` at call time only, so ordering is loose, but keep it adjacent to its dependency.
- `src/srcfiles/ui.js`: `addLogEntry` stamps `minutes` and `sceneId` from `meta.scene`. `doMove` calls `openScene` before its narration line, so the "You move to the Kitchen" beat lands in the NEW scene, not the old one.
- `src/srcfiles/state.js`: `meta` folder 1→2 migration seeding `meta.scene` for existing saves (id 0, the player's current room, day/minutes from the clock). Log entries are left alone — they read as scene 0, which is exactly right for "everything before this update".

**Verification:** in the Node harness. Assert `composeScene` returns a heading
matching the player's room and clock; that presence lines cover every present
NPC and use `PRESENCE_PHRASES` where one exists; that sensory lines are capped
at `maxSensoryLines` and ordered by salience; that `callouts` contains exactly
the records at/above `calloutSalience` and `sensory` still contains them (a
callout is emphasis, not removal); that `beats` contains only entries with the
open `sceneId`; that moving rooms bumps `meta.scene.id` and starts `beats`
empty. Assert `composeScene` never mutates `gameState` (byte-identical
snapshot, same as Plan 1's purity check). Assert a pre-migration save loads
with a valid `meta.scene` and its old log entries render as scene 0.

---

### Phase 2 — The scene reader

**Goal:** `#main-content`'s lower half becomes the scene. The player sees where
they are, who is there, what they can sense, and what has happened since they
walked in — with history collapsed below it.

**Files:**
- `index.html`: replace `<div class="narration-log">` with the scene-reader shell — `#scene-reader` containing `#scene-heading`, `#scene-establishing`, `#scene-beats`, `#scene-history` (a `<details>`). Add the CSS: a type scale that makes the establishing passage read as prose, beats as dialogue/narration, and history as subordinate. Bump every changed `?v=N`.
- `src/srcfiles/render.js`: `renderSceneReader(gs, sceneState)` projecting `composeScene`'s output onto that shell. `renderNarrationLog` is **deleted**, and `render()`'s call to it replaced. Keep `#tpl-log-entry` for the beats list — the per-type styling it already carries (`log-action`, `log-internal`) is still exactly right.
- `src/srcfiles/ui.js`: `addLogEntry` calls `renderSceneReader` instead of `renderNarrationLog`.

**Verification:** in the browser preview. Walk between rooms and confirm the
heading and establishing passage change, beats reset, and the previous scene
appears in history. Spoil something in the kitchen and confirm the smell
appears in the establishing passage from the kitchen and from one room away,
with the "drifting in from" attribution. Confirm a long conversation scrolls
the beats without the establishing passage scrolling away. Screenshot the
before/after.

---

### Phase 3 — Peripheral awareness

**Goal:** the two glanceable surfaces. What you are aware of, and where it is
coming from.

**Files:**
- `index.html`: `#scene-moodles`, a slim row above `#scene-heading`. CSS for the strip and for the floor-plan icon layer.
- `src/srcfiles/config.js`: `SIGNAL_ICONS` — channel → glyph, plus a small per-signal override for the ones that deserve their own (a note, rot). Band → opacity.
- `src/srcfiles/render.js`: `renderSceneMoodles(gs)` — perceived signals for the player's room plus existing need warnings, as icons with title text. `renderFloorPlan` gains a signal pass: for every room, the standing+transient signals ORIGINATING there (D9), drawn as small glyphs inside the room rect at band opacity.
- `src/srcfiles/signals.js`: `signalsByRoom(gameState)` — a room→records map for the floor plan. Derived per call like everything else in that file; no new state.

**Verification:** browser. Rot in the kitchen shows a smell glyph on the
kitchen rect specifically, not on the player's room. Walking toward it makes
the moodle strip's dot fill in as the band rises. A locked bedroom door
visibly cuts what reaches the strip. Assert in the harness that
`signalsByRoom` attributes every record to its `sourceRoomId` and that it
never mutates state.

---

### Phase 4 — Attention callouts

**Goal:** the note on the fridge stops you. Once.

**Files:**
- `src/srcfiles/scene.js`: `composeScene` populates `callouts` from records at/above `SCENE_READER.calloutSalience`, filtered against `meta.scene.shouted`; a new `markShouted(gameState, signalId)` records one.
- `src/srcfiles/render.js`: `renderSceneReader` draws callouts as their own block within the establishing passage, accented.
- `src/srcfiles/ui.js`: after a render that produced callouts, mark them shouted so a re-render is quiet.

**Verification:** browser + harness. A fresh note in the room produces exactly
one callout, and re-rendering the same scene produces none. Leaving and
re-entering the room opens a new scene and the callout fires again — which is
correct: you walked in on it afresh. Reading the note drops its salience below
the threshold, so it stops being callout-worthy even in a new scene. Assert
that a callout also still appears in `sensory` (emphasis, not removal).

---

### Phase 5 — The conversation pane remembers (R4)

**Goal:** opening a conversation with someone you know shows that you know
them. Past exchanges above, clearly past; the live one below, clearly live.

**Files:**
- `src/srcfiles/ui.js`: `openConversationOverlay` stops wiping to empty. It renders prior exchanges from `npc.memory.recent` filtered to `channel === 'scene'` (Plan 0 Phase 1 made this buffer 40 deep and channel-tagged for exactly this), each with a timestamp from its `day`/`tick`, then a separator, then the live conversation. `convAddBubble`/`convAddBeat` append below the separator as they do now.
- `index.html`: CSS for `[data-past]` bubbles — reduced contrast, timestamp gutter — and for the separator.

**Verification:** browser. Talk to someone, leave, talk again: the first
conversation appears above the separator, greyed and timestamped, and the new
one below it at full contrast. Text them, then talk to them in person, and
confirm the IM exchange does NOT appear in the in-person pane (the channel
filter — Plan 0's D6, asserted there and still holding here). A character you
have never spoken to opens with no history and no separator.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** | `composeScene` + `meta.scene` + `sceneId` on log entries. Pure, tested, nothing renders it. 40 assertions pass (`dev/verify/verify-r1.js`) |
| 2 | **Done** | The scene reader replaces the narration log in `#main-content`. Verified in the browser; screenshots in the Phase 2 notes |
| 3 | **Done** | Moodle strip + sensory icons on the floor plan. Pure halves covered by 27 assertions (`dev/verify/verify-r34.js`); DOM verified in the browser |
| 4 | **Done** | `markCalloutsShouted` — a callout fires once per scene per signal. Covered by the same harness |
| 5 | **Done** | The conversation pane shows prior exchanges, marked as past. `recallSceneExchanges` (pure, `npc.js`) + `convRenderRecalled` (`ui.js`). 43 assertions (`dev/verify/verify-r5.js`); DOM verified in the browser |

**All five phases done. Suite: 432 assertions across three plans, green.**

---

## Dependency order

```
Phase 1 (scene model) ──► Phase 2 (scene reader) ──► Phase 4 (callouts)
        └──────────────► Phase 3 (awareness surfaces)

Phase 5 (conversation pane) — independent of all of the above
```

Phase 3 needs Phase 1's data but not Phase 2's DOM, so it can run in either
order relative to Phase 2 — though Phase 2 first is more satisfying, since it
is the phase that makes the game feel different. Phase 5 touches only the
conversation overlay and can run at any point, including first if a quick win
is wanted.

---

## Open questions (parked — these outlived the plan)

**None of the four below were closed.** Two of them said "decide during
Phase 2/3" and those sessions did not; none blocked anything, and none is
work this plan still owes. They are recorded here as live questions about a
shipped feature, to be picked up by whoever next touches the scene reader —
most naturally Plan 3, which reuses `composeScene`'s output.

- **Does the scene image regenerate when signals change?** A visibly dirty
  kitchen arguably should look dirty. `composeSceneKey` deliberately excludes
  object state today because bursting the image cache on every state change is
  expensive. Decide during Phase 3, when the sensory layer is visible and it
  is clear whether the image looks wrong next to it.
- **Should a scene close on a long time gap as well as a room change?**
  Sleeping eight hours in one room currently keeps one scene open across the
  whole night. Probably wants a boundary; decide during Phase 2 when the
  history drawer exists to hold the result.
- **How much authored content do `PRESENCE_PHRASES` deserve?** Phase 1 ships
  the mechanism and a handful of overrides. Whether the remaining ~40
  `ACTIVITY_TABLES` strings each get a hand-written line is a content pass,
  and worth judging against how they read in practice.
- **Does the history drawer need search or filtering?** Not at twelve scenes.
  Revisit if the drawer becomes something people actually browse.

---

## Design invariants

1. **The scene is a computed object before it is a DOM tree.** `composeScene`
   is pure and testable; the renderer is a projection with no logic of its
   own. Every layout question this project has ever got wrong got wrong
   because presentation and derivation were the same function.

2. **Composition never calls the model.** The establishing passage is authored
   phrases assembled deterministically (R1). The model's one job here is the
   beat it already writes. A scene that costs a network round-trip to look at
   is a scene the player stops looking at.

3. **A callout fires once per scene per signal.** Emphasis that repeats is
   just noise with a border on it, and noise is the thing this plan exists to
   remove.

4. **The floor plan shows signals at their source.** If it showed what the
   player perceives, it would be a second moodle strip in a worse shape. Its
   entire value is answering "where is that coming from".

5. **History is subordinate, always.** The log survives because losing it
   would lose real information, but it never competes with the present moment
   for attention. The instant it does, this plan has failed at the one thing
   it set out to do.
