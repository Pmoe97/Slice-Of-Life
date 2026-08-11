# The Scene Reader

Status: **in progress — Phase 1 done**. Design session complete 2026-08-10;
all decisions locked. Phases 2–5 outstanding.
Last updated 2026-08-10.

Companions:
- `src/ref/wip/SENSORY-AND-SOCIAL-ROADMAP.md` (the umbrella — this is Plan 2 of six, and the first one the player will actually *feel*).
- `src/ref/complete/perception-and-signals-plan.md` (Plan 1 — **complete**; this plan is its first real consumer. `perceiveSignals`, `signalPhrase` and the `salience` field on every perceived record were all built for this).
- `src/ref/complete/npc-correctness-fixes-plan.md` (Plan 0 — **complete**; its Phase 1 turned `memory.recent` into a 40-entry channel-tagged buffer, which is what makes Phase 5's conversation history possible at all).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session.

---

## Handoff — read this first

**Resume at:** Phase 2 (the scene reader). Phase 1 is done and verified — 40
assertions at `scratchpad/verify-r1.js`, plus `scratchpad/demo-r1.js`, which
renders `composeScene`'s output as prose in the terminal. **Read that demo
before writing any DOM** — it is what Phase 2 is projecting, and it already
reads correctly.

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
  `scratchpad/loadgame.js`, established by Plan 0. `composeScene` (Phase 1) is
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

**Blockers / flagged deviations:** None.

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

**What the main content area is today** (`main.html`, `#main-content`):

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
- `main.html`: replace `<div class="narration-log">` with the scene-reader shell — `#scene-reader` containing `#scene-heading`, `#scene-establishing`, `#scene-beats`, `#scene-history` (a `<details>`). Add the CSS: a type scale that makes the establishing passage read as prose, beats as dialogue/narration, and history as subordinate. Bump every changed `?v=N`.
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
- `main.html`: `#scene-moodles`, a slim row above `#scene-heading`. CSS for the strip and for the floor-plan icon layer.
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
- `main.html`: CSS for `[data-past]` bubbles — reduced contrast, timestamp gutter — and for the separator.

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
| 1 | **Done** | `composeScene` + `meta.scene` + `sceneId` on log entries. Pure, tested, nothing renders it. 40 assertions pass (`scratchpad/verify-r1.js`) |
| 2 | Not started | The scene reader replaces the narration log in `#main-content` |
| 3 | Not started | Moodle strip + sensory icons on the floor plan |
| 4 | Not started | Attention callouts, once per scene per signal |
| 5 | Not started | The conversation pane shows prior exchanges, marked as past |

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

## Open questions (parked, none blocking)

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
