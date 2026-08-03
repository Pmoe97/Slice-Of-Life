# Adult Content & Time Dilation Overhaul — Implementation Plan

## Status (updated 2026-08-01)

**Phases 1–6 are built and verified.** Time dilation, live-API AfterHours,
masturbation/cum, interruption and NPC peeping all shipped. See
`ref/ARCHITECTURE.md` for how they ended up working, including several
places where the built version deliberately differs from the plan below
(notably: sim checkpoints must not advance the clock, and vulnerability is
an explicit flag rather than inferred from location).

### Still open

- **AfterHours redesign — pipelined, not a priority.** The host's webmaster
  API works and clips do load, but some return an embed refusal ("you can
  only watch this on <host>"). The intent is to make AfterHours behave more
  like the API host's own site — better browsing, search, and graceful
  handling of clips that won't embed. Not urgent; the app is usable.

  **Built (Phase 10):** search bar, pagination, embed-refusal fallback
  ("Watch on site" link). See `ref/ARCHITECTURE.md`.
- Third-party clip fields (title, thumb, embed URL) must be set via
  `textContent` / element properties, never interpolated into an
  `innerHTML` template. This is load-bearing, not style: it is remote text.

---

## Overview

Three interrelated systems, built in six phases. Each phase is independently
shippable — the game works after each one, just with more capability.

---

## PHASE 1: Time Dilation Foundation
*Replace the 30-minute tick clock with a continuous, context-aware time flow.*

### What changes

The current system: every action calls `advanceAndResolve(ticks)` which runs
`advanceClock(clock, ticks)` (+30 min per tick) and `resolveBatch(gameState,
ticks)` (full NPC sim per tick). Time moves in discrete 30-min jumps.

The new system: a continuous clock accumulator. A rAF loop adds
`deltaMs * timeScale` to `clock.minutes` every frame. `timeScale` is determined
by the player's current context (browsing, talking, idle, masturbating).
The NPC simulation runs at fixed checkpoints (every N game-minutes of
accumulated time), not once per action.

### New config (`src/config.js`)

```
TIME_DILATION = {
  // Game-minutes per real-second at each scale
  scales: {
    idle: 20,           // standing around, menu navigation
    browsing: 10,       // computer browser, AfterHours grid
    masturbating: 3,    // slow, intimate — time crawls
    conversation: 1,     // talking to an NPC — real-time
    working: 25,        // work blocks — time flies
    sleeping: 0,        // special: skip-to-morning, not continuous
  },
  // How often the NPC sim runs (in game-minutes of accumulated time)
  simCheckpointMinutes: 30,
  // Minimum game-minutes before a checkpoint fires (prevents rapid
  // micro-checkpoints when timeScale is very low)
  minCheckpointAccumulation: 10,
}
```

### Core loop (`src/sim.js`)

New `startClockLoop()` — a `requestAnimationFrame` loop that:
1. Computes `deltaMs` since last frame
2. Looks up current `timeScale` from a `getTimeContext()` function
3. Adds `deltaMs/1000 * timeScale/60` game-minutes to `clock.minutes`
4. When accumulated game-minutes cross `simCheckpointMinutes`, fires
   `runSimCheckpoint()` — which calls the existing `resolveTick` + needs
   decay + event processing for one checkpoint's worth of time
5. Calls `renderHeader()` to update the clock display (smooth ticking)
6. Handles day-rollover when `minutes >= 1440`

`advanceClock(clock, ticks)` stays for backwards compat (sleep, forced
time-advance actions) but the primary path is the continuous loop.

`resolveBatch` stays but is called with computed checkpoint counts, not
action-driven tick counts.

### Context detection (`src/sim.js` or `src/ui.js`)

`getTimeContext()` checks:
- Computer open + AfterHours watching → `browsing` or `masturbating`
- Talk modal / NPC interaction open → `conversation`
- Work block in progress → `working`
- Sleep → `sleeping` (special path)
- Default → `idle`

A global `currentTimeContext` variable, set by UI actions, read by the
clock loop.

### Affected files

| File | Change |
|------|--------|
| `src/config.js` | Add `TIME_DILATION` config |
| `src/sim.js` | `startClockLoop()`, `runSimCheckpoint()`, `getTimeContext()`, refactor `advanceClock` to accept minutes not ticks |
| `src/ui.js` | `advanceAndResolve` refactored — no longer the primary time driver; now used only for discrete actions (sleep, cum, work blocks). Remove its automatic `render()` call (was causing the iframe bug) |
| `src/render.js` | Clock display updates from the loop, not from `render()` |
| `src/state.js` | Save/load `currentTimeContext` + clock accumulator state |
| `index.html` | CSS for smooth clock display animation |

### Migration

Existing saves store `clock.minutes` as a multiple of 30. The new system
uses raw minutes. `loadGameState` migrates by rounding to nearest 30
(keeps old saves compatible). No data loss — minutes are already stored
as an absolute number, not a tick count.

---

## PHASE 2: Variable-Time Actions
*Actions pass granular time based on context, not fixed ticks.*

### What changes

`resolveTimeCost` in `src/actions.js` currently returns a fixed tick count
from the action def. The new system: actions declare a base time cost in
game-minutes, optionally modified by context (how dirty the dishes are,
how many there are, skill level).

### Action def changes (`src/defs.actions.js`)

```
'self.cook': {
  ...
  timeCost: { base: 20, perIngredient: 2, max: 35 },
  // 20 min base + 2 min per ingredient used, capped at 35
}
'self.shower': {
  ...
  timeCost: { base: 15, skillBonus: -1 },  // -1 min per cleaning skill level
}
'self.relax': {
  ...
  timeCost: { base: 10, moodMultiplier: 0.5 },
  // costs 10 min, but if mood < 0, costs +50% (harder to unwind)
}
```

### `resolveTimeCost` refactor (`src/actions.js`)

```
function resolveTimeCost(def, gameState) {
  const tc = def.timeCost;
  if (typeof tc === 'number') return tc;  // legacy fixed cost
  let minutes = tc.base || 0;
  if (tc.perIngredient) {
    const fridge = gameState.objects[`room_kitchen`] || {};
    minutes += countIngredients(fridge) * tc.perIngredient;
  }
  if (tc.skillBonus) {
    const lvl = skillLevel(gameState.player, tc.skillId || 'cooking');
    minutes += tc.skillBonus * lvl;
  }
  if (tc.max) minutes = Math.min(minutes, tc.max);
  if (tc.min) minutes = Math.max(minutes, tc.min);
  return Math.max(1, Math.round(minutes));
}
```

### Dish-washing example

A new action `'self.dishes'` with:
```
timeCost: {
  base: 5,
  perDirtyDish: 3,
  max: 30,
  compute: (gameState) => {
    const objs = gameState.objects['room_kitchen'] || {};
    const dirty = Object.values(objs).filter(o =>
      o.defId === 'plate' && o.state === 'dirty'
    ).length;
    return { dirtyCount: dirty };
  }
}
```

### Discrete actions vs continuous flow

Variable-time actions are **discrete**: they pause the continuous clock,
advance by the computed minutes, run `runSimCheckpoint` for that duration,
then resume the clock. This is the same pattern "Cum" will use in Phase 3.

### Affected files

| File | Change |
|------|--------|
| `src/defs.actions.js` | All action defs: `timeCost` in minutes (with `compute` for contextual) |
| `src/actions.js` | `resolveTimeCost` refactored for variable minutes |
| `src/ui.js` | `runRegisteredAction` passes minutes to the checkpoint system instead of ticks |
| `src/config.js` | `CLOCK.tickMinutes` deprecated (kept for migration), new `CLOCK.simCheckpointMinutes` |

---

## PHASE 3: Masturbate / Cum Mechanic
*Free browsing, persistent masturbating state, "Cum" finishes with time cost.*

### What changes

Currently `doAfterHoursWatch` fires on every clip click: applies effects,
advances 1 tick, saves. The new flow:

1. **Browsing** (clicking categories, thumbnails): zero cost. Just opens
   the embed iframe. No `advanceAndResolve`, no effects. Pure UI.
2. **Masturbate** (button appears while a video is playing): enters
   `afterHoursMasturbating` state. No time cost yet. Sets
   `currentTimeContext = 'masturbating'` (time slows to 3x). A "Cum" button
   becomes available after a short warmup (a few seconds of real time, or
   immediately — TBD). The player can keep browsing/switching videos while
   masturbating.
3. **Cum** (clicking "Cum"): the actual action. Pauses continuous clock,
   advances a discrete chunk of game-minutes (10-20), applies full effects
   (mood boost, energy drain, hygiene drop, arousal relief), runs
   `runSimCheckpoint` for the duration, fires the interruption check
   (Phase 5). Then returns to browsing context.

### State (`src/computer.js`)

```
browser.afterHoursWatching = clipId     // existing
browser.afterHoursMasturbating = false   // new — is player in session
browser.afterHoursSessionStart = null   // new — game-minutes when started
```

### New config (`src/config.js`)

```
MASTURBATION = {
  moodGain: 0.25,          // full mood boost on cum
  energyCost: 8,           // energy drain
  hygieneCost: 5,          // hygiene drop
  timeCostMinutes: 15,     // game-minutes advanced on cum
  arousalRelief: 1.0,      // if arousal need exists, reduce by this
  warmupSeconds: 3,        // real seconds before "Cum" button enables
  interruptCheckTicks: 1,  // sim checkpoints to roll interruption on
}
```

### Action flow (`src/ui.computer.js`)

```
doAfterHoursWatch(clipId):
  // BROWSING — just open the player, no effects, no time
  browser.afterHoursWatching = clipId
  renderComputerScreen(gs)
  // scroll to player

doAfterHoursMasturbate():
  // Enter masturbating state — no time cost
  browser.afterHoursMasturbating = true
  browser.afterHoursSessionStart = clock.minutes
  currentTimeContext = 'masturbating'
  renderComputerScreen(gs)  // show "Cum" button + progress

doAfterHoursCum():
  // THE ACTION — time + effects + interruption check
  showLoading()
  advanceAndResolveMinutes(MASTURBATION.timeCostMinutes)
  applyMasturbationEffects()
  browser.afterHoursMasturbating = false
  currentTimeContext = 'browsing'
  // Phase 5: fire interruption check here
  renderComputerScreen(gs)

doAfterHoursStop():
  // Abort session — no effects, no time
  browser.afterHoursMasturbating = false
  currentTimeContext = 'browsing'
  renderComputerScreen(gs)
```

### New helper (`src/sim.js` or `src/ui.js`)

`advanceAndResolveMinutes(minutes)` — the discrete-action companion to the
continuous clock. Computes how many sim checkpoints fit in `minutes`,
runs them, handles day-rollover. Replaces `advanceAndResolve(ticks)` for
all discrete actions.

### UI changes (`src/render.computer.js`)

The watch panel (already above the grid from the earlier fix) gets:
- A "Masturbate" button when a video is playing and not masturbating
- A "Cum" button + "Stop" button when masturbating
- A subtle progress indicator (session duration in game-minutes)
- The "Cum" button has a brief disabled state (warmup)

### Affected files

| File | Change |
|------|--------|
| `src/ui.computer.js` | `doAfterHoursWatch` → free browsing; new `doAfterHoursMasturbate`, `doAfterHoursCum`, `doAfterHoursStop` |
| `src/render.computer.js` | Watch panel: masturbate/cum/stop buttons, progress |
| `src/defs.computer.js` | Split AfterHours effects: `browseEffects` (none), `cumEffects` (the current watchEffects) |
| `src/config.js` | Add `MASTURBATION` config |
| `src/computer.js` | `afterHoursMasturbating`, `afterHoursSessionStart` on browser state |
| `src/sim.js` | `advanceAndResolveMinutes(minutes)` |
| `index.html` | CSS for masturbate/cum buttons, progress indicator |

---

## PHASE 4: Door Lock System
*Bedrooms can be locked. The primary defense against being walked in on.*

### What changes

Bedroom doors currently have `states: { door: ['closed', 'open'] }` in
`src/defs.world.js`. We extend to `['open', 'closed', 'locked']`.

### Object def changes (`src/defs.world.js`)

All bedroom door objects:
```
states: { door: ['open', 'closed', 'locked'] },
defaultState: { door: 'closed' },
```

### New actions (`src/defs.actions.js`)

```
'room.lock_door': {
  label: 'Lock Door',
  timeCost: { base: 1 },
  effects: ['SET_OBJECT_STATE door locked'],
  requirements: [
    { type: 'room_has_door' },
    { type: 'door_not_locked' },
  ],
}
'room.unlock_door': {
  label: 'Unlock Door',
  timeCost: { base: 1 },
  effects: ['SET_OBJECT_STATE door open'],
  requirements: [
    { type: 'room_has_door' },
    { type: 'door_locked' },
  ],
}
```

### Render changes (`src/render.js`)

The action chips for the player's current room show "Lock Door" / "Unlock
Door" based on current door state. A locked door is visually indicated
(a lock icon on the room card, or in the scene header).

### Effect validation (`src/effects.js`)

`SET_OBJECT_STATE` already exists and handles arbitrary state strings.
No change needed — 'locked' is just another state value.

### Affected files

| File | Change |
|------|--------|
| `src/defs.world.js` | Bedroom door states: add 'locked' |
| `src/defs.actions.js` | New lock/unlock door actions |
| `src/actions.js` | New requirement checkers: `room_has_door`, `door_not_locked`, `door_locked` |
| `src/render.js` | Lock/unlock action chips, door state display |
| `src/world.js` | `defaultState` migration for existing saves (closed → keep closed) |
| `index.html` | CSS for lock icon, locked door indicator |

---

## PHASE 5: Interruption System
*Personality-driven, AI-generated, background-pre-generated "walked in on" events.*

### What changes

When the player cums (Phase 3's `doAfterHoursCum`), the system rolls an
interruption check. If it succeeds, an NPC walks in on the player. The NPC's
line is AI-generated with full context (personality, relationship, what the
player is watching, door state) and pre-generated in the background so it
appears instantly.

### Interruption probability (`new src/interruption.js`)

```
function rollInterruption(gameState):
  // Only fires when masturbating + cumming
  // Base probability modified by:

  // 1. WHO'S HOME
  const homeNpcs = npcs where location is in-apartment (not null, not 'away')

  // 2. DOOR STATE
  const doorState = getDoorState(player.location)
  // locked:  base * 0.05  (near-zero — they'd have to knock)
  // closed: base * 0.5   (reduced — they have to open the door)
  // open:    base * 1.0   (full chance — they just walk in)

  // 3. TIME OF DAY (from clock.phase)
  // night:     * 0.3  (people asleep or in their rooms)
  // evening:   * 1.2  (active, moving around)
  // midday:    * 1.0
  // morning:   * 0.8  (rushing to get ready)
  // early_morning: * 0.4 (asleep)

  // 4. NPC PERSONALITY (per eligible NPC)
  // assertiveness: high = more likely to barge in
  // conscientiousness: high = less likely (respects closed doors)
  // warmth: high = more likely to visit your room casually
  // volatility: high = more likely to be moving around unpredictably

  // 5. NPC SCHEDULE
  // In 'commute_home' or 'morning' block: * 1.5 (moving through apartment)
  // In 'leisure' block: * 1.2 (lounging, might wander)
  // In 'sleep' block: * 0.1 (asleep)
  // In 'work' block: not home, excluded

  // 6. RELATIONSHIP
  // High tension: * 1.3 (might barge in deliberately)
  // High affection: * 1.1 (comfortable entering your space)
  // Low both: * 0.8 (avoids you)

  // Roll per eligible NPC. First success = that NPC walks in.
  // If door is locked, success = knock instead of walk-in.
```

### Base probability config (`src/config.js`)

```
INTERRUPTION = {
  baseChance: 0.25,           // per eligible NPC per cum event
  doorMultiplier: { locked: 0.05, closed: 0.5, open: 1.0 },
  phaseMultiplier: {
    early_morning: 0.4, morning: 0.8, midday: 1.0,
    afternoon: 1.0, evening: 1.2, night: 0.3,
  },
  personalityWeights: {
    assertiveness: 0.3,      // high assert = more likely to enter
    conscientiousness: -0.4, // high consc = less likely (respects doors)
    warmth: 0.15,           // high warmth = casual visitors
    volatility: 0.2,        // high vol = unpredictable movement
  },
  scheduleMultiplier: {
    commute_home: 1.5, morning: 1.3, leisure: 1.2,
    evening: 1.0, wind_down: 0.8, sleep: 0.1, work: 0,
  },
  relationshipMultiplier: {
    highTension: 1.3, highAffection: 1.1, lowBoth: 0.8,
  },
}
```

### Background pre-generation

When the player enters the masturbating state (`doAfterHoursMasturbate`),
the system immediately:

1. Computes which NPCs are eligible to interrupt (home, not sleeping)
2. For the top candidate (highest interruption probability), starts a
   background `generateText` call with full context
3. The prompt includes:
   - NPC's full temperament, speech profile, boundary text
   - Current relationship state (tension, affection, suspicion)
   - What the player is watching (clip title, category)
   - Door state (locked/closed/open)
   - Time of day / phase
   - Instruction: "You are about to walk in on your roommate. Write what
     you say. Stay in character. React to what they're watching. One to
     three sentences."
4. The generated text is stored in `pendingInterruption`
5. When "Cum" is clicked and the interruption roll succeeds for this NPC,
   the text is already ready — the bubble appears instantly
6. If the roll fails, `pendingInterruption` is discarded

If the actual NPC who wins the roll is different from the pre-generated
one, fall back to generating on-demand (with a brief "footsteps..."
narration beat to cover the ~1s latency).

### AI prompt (`src/llm.js`)

```
function buildInterruptionPrompt(gameState, npcId, clip) {
  const npc = gameState.npcs[npcId]
  const b = npc.bible
  const rel = npc.relPlayer
  const door = getDoorState(gameState.player.location)

  return {
    instruction: `You are ${b.name}, walking in on your roommate who is
    masturbating while watching "${clip.title}" (${clip.category}).
    Your personality: warmth ${b.temperament.warmth},
    volatility ${b.temperament.volatility},
    openness ${b.temperament.openness},
    assertiveness ${b.temperament.assertiveness}.
    Your relationship with them: tension ${rel.tension},
    affection ${rel.affection}.
    The door was ${door}.
    ${door === 'locked' ? 'You knocked and they didn't answer, so you
    waited, then they opened the door looking flustered.' : 'You opened
    the door without thinking.'}

    Write 1-3 sentences of what you say. Stay in character. React to
    what you see and what they're watching. Don't be generic — let your
    personality show. ${b.speech.textingStyle ? 'Speech style: ' + b.speech.textingStyle : ''}

    $output = [this.joinItems(" ")]`,
    startWith: b.name + ':',
    stopSequences: ['\n\n'],
  }
}
```

### Chat bubble UI

A speech bubble that slides in from the right edge of the screen:
- NPC avatar (colored circle with initial, like existing NPC cards)
- NPC name
- The generated interruption text
- Two response buttons (fixed, not AI-generated):
  - "Sorry!" (apologetic) — reduces tension slightly
  - "Own it" (unapologetic) — may increase tension, may impress high-openness NPCs
- After responding, the bubble dismisses and the session is over

The bubble is a new DOM element overlaid on the computer screen, not part
of the normal render cycle (so it doesn't get wiped by re-renders — same
lesson as the iframe fix). Created with direct DOM manipulation, removed
on dismiss.

### Consequences

- **Caught masturbating (door open/closed)**: `ADJUST_SUSPICION` +
  `REL_DELTA tension` scaled by NPC openness (low openness = bigger penalty)
- **Caught masturbating (door locked, they knocked)**: minimal consequence
  (you had privacy, they chose to persist) — small awkwardness, no suspicion
- **Response "Sorry!"**: reduces the tension bump by 50%
- **Response "Own it"**: high-warmth/high-openness NPC = tension *reduces*
  (they find it honest/funny). Low-warmth NPC = tension *increases*

### Affected files

| File | Change |
|------|--------|
| `src/interruption.js` | NEW — `rollInterruption()`, `getInterruptionProbability()`, eligibility |
| `src/config.js` | Add `INTERRUPTION` config |
| `src/llm.js` | `buildInterruptionPrompt()` |
| `src/ui.computer.js` | `doAfterHoursCum` calls `rollInterruption`; `doAfterHoursMasturbate` kicks off pre-generation |
| `src/render.computer.js` | (minimal — bubble is DOM-injected) |
| `src/effects.js` | Apply interruption consequences via existing effect system |
| `src/stealth.js` | `getDoorState()` helper (or in `src/world.js`) |
| `index.html` | CSS for chat bubble (slide-in animation, avatar, text, buttons) |

---

## PHASE 6: NPC Peeping System
*Roommates spy on the player. The mirror of the existing peep system.*

### What changes

NPCs with the right personality profile can attempt to peep on the player
during vulnerable states (masturbating, showering, sleeping, undressed).
Success = they observe silently and gain a memory. Failure = the player
catches them (if the player's perception is high enough).

### New drive (`src/drives.js`)

```
peep_player: {
  id: 'peep_player',
  // Only fires for NPCs with the right personality
  condition: (npc, npcId, resolved) => {
    const t = npc.bible.temperament
    // Curious (high openness) + boundary-willing (low conscientiousness)
    // OR attracted (high warmth toward player)
    const curiosity = t.openness * 0.4 + (1 - t.conscientiousness) * 0.3
    const attraction = npc.relPlayer?.affection || 0
    return curiosity > 0.3 || attraction > 0.4
  },
  blockFilter: ['leisure', 'evening', 'wind_down'],
  // Player must be in a vulnerable state
  playerStateFilter: ['masturbating', 'showering', 'sleeping', 'undressed'],
  // Low base chance, modified by personality
  baseChance: 0.08,
  chanceModifiers: {
    openness: 0.3,          // curious NPCs peep more
    lowConscientiousness: 0.25, // boundary-willing NPCs peep more
    affection: 0.2,         // attracted NPCs peep more
  },
  cooldownTicks: 16,        // ~8 hours minimum between attempts
}
```

### NPC peep resolution (`src/stealth.js`)

```
function resolveNpcPeep(gameState, npcId, playerState):
  const npc = gameState.npcs[npcId]
  const t = npc.bible.temperament
  const rng = seededRng(seed, `npc_peep_${day}_${tick}_${npcId}`)

  // NPC stealth — derived from conscientiousness (methodical = sneaky)
  // and assertiveness (confident = bold)
  const npcStealth = (t.conscientiousness + 1) * 0.3 + rng() * 0.4

  // Player perception — new skill, or derived from existing stats
  // (high when well-rested, sober, alert; low when tired/drunk)
  const playerPerception = getPlayerPerception(gameState.player)

  // Detection: if NPC stealth < player perception, player notices
  const detected = npcStealth < playerPerception

  if (detected):
    // Player catches the NPC — AI-generated chat bubble (Phase 5 system)
    // NPC is embarrassed, reaction based on personality
    return { detected: true, npcId, playerState }
  else:
    // NPC peeps successfully — gains memory episode, relationship shifts
    const memory = `Saw ${playerName} ${playerState}.`
    // Attraction boost if high warmth
    // No suspicion (NPC is the voyeur, not the player)
    return { detected: false, npcId, memory, relDelta }
```

### Player perception (`src/skills.js` + `src/config.js`)

New skill: `perception` — or derived stat (not a learnable skill, just a
computed value):

```
function getPlayerPerception(player):
  // Base 0.3, modified by state
  let p = 0.3
  if (player.energy > 70) p += 0.15      // alert when rested
  if (player.energy < 20) p -= 0.2       // tired = oblivious
  if (player.mood < -0.5) p -= 0.1       // distracted when upset
  // Skill level if we add perception as a real skill
  p += skillMod(player, 'perception', 'perceptionCurve') * 0.2
  return clamp(p, 0.05, 0.95)
```

### NPC-caught-peeping chat bubble

Reuses the Phase 5 bubble system. The prompt is reversed:

```
function buildNpcCaughtPeepingPrompt(gameState, npcId, playerState):
  const npc = gameState.npcs[npcId]
  return {
    instruction: `You are ${npc.bible.name}. You were secretly watching
    your roommate ${playerState} and they just caught you. React based
    on your personality: warmth ${npc.bible.temperament.warmth},
    volatility ${npc.bible.temperament.volatility},
    assertiveness ${npc.bible.temperament.assertiveness}.
    Do you apologize? Get defensive? Play it off? 1-2 sentences.`,
    startWith: npc.bible.name + ':',
  }
```

### Player response options

- "What are you doing?!" (confrontational) — tension up, NPC embarrassed
- "...come in." (inviting) — if NPC has high warmth, relationship shifts
  romantically; if low warmth, NPC flees awkwardly
- "Get out." (cold) — tension up significantly, NPC leaves

### Silent peeping consequences (player never knows)

When the NPC peeps successfully:
- `addMemoryEpisode(npc, day, "Saw you in the shower.", 0.6)` — stored
  in NPC memory, may surface later in conversation (LLM has access to
  memory in talk context)
- `applyRelDelta(npc, { affection: +0.03 })` if warmth > 0 — quiet
  attraction build
- `applyRelDelta(npc, { tension: +0.02 })` if warmth < 0 — awkward
  guilt that manifests as distance
- The player may discover evidence later: "you notice the bathroom door
  was slightly ajar when you definitely closed it" — using the existing
  `LEAVE_EVIDENCE` effect system

### NPC peeping on other NPCs

Future extension: NPCs can peep on each other too, not just the player.
The same drive system supports it — `peep_target` could be any NPC in a
vulnerable state. This creates NPC-to-NPC relationship dynamics (one NPC
catches another, tension/attraction shifts in the cast web). Out of scope
for Phase 6 but architecturally supported.

### Affected files

| File | Change |
|------|--------|
| `src/drives.js` | New `peep_player` drive |
| `src/stealth.js` | `resolveNpcPeep()` |
| `src/skills.js` | `getPlayerPerception()` (or in `src/sim.js`) |
| `src/config.js` | `NPC_PEEP_TUNING`, perception curve |
| `src/llm.js` | `buildNpcCaughtPeepingPrompt()` |
| `src/sim.js` | Peep attempt during `resolveTick` (when drive fires) |
| `src/npc.js` | Memory episode from peeping |
| `src/effects.js` | Rel deltas from peeping |
| `src/ui.js` | Chat bubble for NPC-caught-peeping (reuses Phase 5 bubble) |
| `index.html` | CSS (reuses Phase 5 bubble styles) |

---

## PHASE SUMMARY

| Phase | Systems | New files | Estimated complexity |
|-------|---------|-----------|---------------------|
| 1 | Time dilation foundation | 0 (modifies sim.js, config.js) | High — core architecture change |
| 2 | Variable-time actions | 0 (modifies actions.js, defs) | Medium — pattern refactor |
| 3 | Masturbate/Cum mechanic | 0 (modifies ui.computer, render) | Medium — new states + UI |
| 4 | Door lock system | 0 (modifies defs.world, actions) | Low — extend existing states |
| 5 | Interruption system | 1 (`interruption.js`) | High — AI generation + probability + UI |
| 6 | NPC peeping | 0 (modifies drives, stealth) | High — reverse stealth + perception |

## DEPENDENCIES

```
Phase 1 (time dilation) ──► Phase 2 (variable actions)
                      ──► Phase 3 (masturbate/cum) ──► Phase 5 (interruption)
                                                ──► Phase 4 (door locks) ──► Phase 5
Phase 5 (interruption) ──► Phase 6 (NPC peeping — reuses bubble UI)
```

Phases 2 and 4 can be done in either order after Phase 1.
Phase 5 requires 3 + 4. Phase 6 requires 5 (bubble UI).

## RISKS & MITIGATIONS

- **Time dilation regression**: the tick-based system is deeply woven into
  save/load, NPC schedules, drives, quest timers. Mitigation: keep
  `advanceClock` and `resolveBatch` working, the continuous loop calls them
  under the hood. Old saves work because minutes are stored as absolute
  values.

- **AI generation latency for interruptions**: generateText can take 5-30s.
  Mitigation: pre-generate on masturbate-start, show a "footsteps..."
  narration beat if on-demand generation is needed.

- **NPC peeping feeling stale**: if it fires too often it's repetitive.
  Mitigation: 8-hour cooldown, personality gating (most NPCs can't peep
  at all), low base chance, and the player doesn't even see most peeps
  (silent success). It's a rare, surprising event.

- **Interrupted masturbation feels punishing**: player loses the mood
  boost and gets a tension penalty. Mitigation: the door lock (Phase 4)
  is the defense — if you lock the door, near-zero interruption chance.
  The risk is the player's choice.
