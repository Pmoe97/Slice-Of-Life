# Dream Engine

Status: **COMPLETE — all 9 phases landed and verified, 2026-08-25.** Design
session 2026-08-24; decisions D1–D50 locked. The nine phases: state and
registration, the component tables, the residue harvester, the compiler, the
dreamweaver call, rendering and the queue, presentation and the sleep/nap
hooks, the Dream Diary app on both surfaces, and — Phase 9 — the true and
recurring classes. **The loop is closed: the player dreams, the dreams are
kept, and some of them are real.**

Every phase is covered by the Node suite (`node dev/verify/run-all.js`); 6 and
7 also passed a live `dev-harness.html` browser pass, and 8 a live click-
through. Phase 8's harness (`verify-dreams-diary.js`) was written after the
fact during the Phase 9 audit, because that session had no shell tool — it
found a real bug on its first run. The ONE thing never done, carried since
Phase 5, is the round trip against a REAL model and a REAL image plugin: no
live model has ever written a dream and no diffusion model has ever drawn a
panel. That is a play-test, and the Handoff says what to watch for.
Last updated 2026-08-25.
Companions:
- `src/ref/wip/action-outcome-window-plan.md` — its **D11** carved out an
  unconditional Tier C window for sleep and nap and left the `image` field on
  `ACTION_DEFS['self.nap']` deliberately empty, commented "the Dream Engine's
  hook". This plan fills that hook and closes the last open item on that plan.
  Its blocker **#8** (`doSleep` never wired to `presentActionOutcome`) is
  resolved here, in Phase 7.
- `src/ref/complete/knowledge-gossip-memory-plan.md` — owns the fact / episode /
  provenance model the residue harvester reads. Dreams **read it and never
  write to it**; that asymmetry is Design invariant 2 below.
- `src/ref/complete/plan-x5-conversation-consequences.md` — `callDreamweaver`
  copies `callAssessor`/`callChronicler`'s call shape: one JSON pass, one retry
  only on a definitive parse failure, results stripped of anything the writer is
  not allowed to decide.
- `src/ref/wip/settings-and-pause-overhaul-plan.md` — owns `SETTINGS_DEFAULTS`
  and `sfwMode`. This plan adds three flat cycle fields to that schema and
  nothing else; it does not touch the settings shell.
- `src/ref/wip/character-cutout-scene-rendering-plan.md` — the plate/cutout
  split. Dream panels are **neither**: they are one-off composed frames closer
  to a photo record. See D14.

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table near
the bottom, as the very last thing you do each session — see
`src/ref/complete/dream-engine-handoff-prompt.md` for the full session protocol.

---

## Handoff — read this first

**Resume at: nothing. The Dream Engine is COMPLETE.** All nine phases have
landed and all nine are verified against the Node suite. This document and its
session prompt live in `src/ref/complete/` now; the only reason to open either
again is to change how dreams work, and the place to start is `## Locked
decisions` (D1–D50), not this section.

**One thing genuinely remains untested, and it has been carried since Phase 5:
a REAL model and a REAL image plugin.** Every model call and every panel in
every verification pass so far has been a stub or a hand-driven `<canvas>`.
Nobody has yet seen whether a live model clears the parse ladder at a usable
rate, whether the prose is any good, or **what a dream panel actually looks
like** when a diffusion model draws it. That is a play-test, not a phase. If
the panels come back as collages or comic strips despite `IMAGE_NEGATIVE.dream`,
the fix is that negative or `DREAM_PROMPT_TAIL`, and **it needs an
`IMAGE_PROMPT_VERSION` bump** — see the standing rule under Phase 6's notes.

**Last session's notes (Phase 9 + a full audit, 2026-08-25):**

Phase 9 was implemented in an environment with no shell tool, and the session
ended mid-way through its verification step. The code was complete and, as it
turned out, largely correct; what was missing was everything that needs a
machine to check. A follow-up session with a shell ran the suite, closed the
gaps and audited Phases 8 and 9 together. Both halves are recorded here.

**What Phase 9 added:**

- `dreams.js`: `rollDreamKind` now returns a real class (still exactly two
  draws — D31), plus **`selectTrueDreamSource`**, **`compileTrueDream`**,
  **`selectRecurringSource`**, **`compileRecurringDream`**, **`dreamEpisodeKey`**,
  and the shared tail **`finishDreamRecord`** that `compileDistortedDream` and
  both new branches all return through. `fileDreamToDiary` now spends
  `source.episodeKeys` into the D9 ring alongside `source.eventIds`.
- `defs.dreams.js`: a **`replayDirective`** on all 21 beats of all 9 forms — the
  same beat shapes re-authored as phases of a faithful replay (D6: a true dream
  is a data edit, not a code path). `trueDreamChance` and `recurrenceChance`
  already existed in `DREAM_TUNING` from Phase 2 and were not re-added.
- `llm.js`: **`buildDreamReplayBlock`**, and `buildDreamPrompt` now branches on
  the class — a true dream gets the replay directives, `THE PLACE` in place of
  `WHAT IS WRONG WITH THE PLACE`, a mandatory `THE EVENT TO REPLAY` block and a
  witness rule instead of the impossible-thing rule; a recurring dream gets a
  shift line on one beat that quotes the origin's own panel text. **D1 is
  intact** — the model still chooses nothing; every branch is a different
  skeleton handed to it, not a different question.
- The record gained one additive field, **`shiftedBeat`** (the recurring
  dream's re-rolled beat id, `null` otherwise), and it is in the Data model.

**What the audit found and fixed — this is the part worth reading:**

1. **`verify-dreams-true.js` did not parse.** Four escaping bugs, all the
   classic vm-template shapes: two backticks inside the `api(\`…\`)` template
   (which close it early) and two `\'` that needed `\\'` (inside a template
   literal the first collapses to a bare quote and terminates the vm's own
   string). The harness had never been run. Fixed; it now reports **26/26**.
2. **No `?v=` bumps.** `defs.dreams.js`, `dreams.js` and `llm.js` all changed
   and all three tags were untouched — every returning player would have run
   Phase 8's code against Phase 9's save shape. Bumped 6→7, 6→7, 41→42.
   (Phase 8's own bumps — icons 31, defs.computer 32, render.computer 52, ui
   135 — were correctly applied and are unchanged.)
3. **A real aliasing hole in `compileRecurringDream`**, found by the tripwire
   pass rather than the harness. The function copied `residue` and `cast`,
   stated in a comment that it copied everything, and handed `setting` and
   `motif` over BY REFERENCE — so a recurring dream and the diary entry it
   re-ran shared two objects. Nothing writes to them today, which is exactly
   why nothing noticed. Both are copies now, the aliasing assertion mutates all
   four preserved slots, and the rule is **D49**.
4. **A real bug in the Dream Diary**, found by writing Phase 8's missing
   harness. Both renderers labelled a nap dream by testing `dream.kind ===
   'nap'` — but `kind` is the D8 CLASS (`distorted` / `true` / `recurring`) and
   is never `'nap'`; nap-ness is `forSleep` (D16/D36). The ' · nap' suffix could
   not render for any dream that has ever existed, and its absence looks
   exactly like a night dream, so no amount of clicking would have shown it.
   Fixed in all four sites (two renderers × two surface copies).
5. **A real gap in the Phase 9 harness's own determinism check.** Its
   byte-identical-fallback assertion compared two saves that BOTH fall back, so
   both would take a stray draw and stay equal — it could not see a draw added
   on the true/recurring path at all. Replaced with an assertion that pins
   `rollDreamKind` to `'distorted'` and requires the records to be unchanged.
   Now **D48**.
6. **Two guards the harness never covered**, both added: an event the player
   has already WITNESSED is never dreamt as true (`seenByPlayer` is the other
   half of D9, and the day rule alone does not cover the pre-midnight half of a
   night), and a diary entry that was never SHOWN is not re-run.

**Things that looked wrong in the crashed session's own notes and are NOT:**

- Its notes refer throughout to `src/dev/verify/` and `index.html`. The real
  paths are `dev/verify/` and `index.html`, and **the files landed in the right
  places** — the notes were wrong, the edits were not.
- It reported corrupting `llm.js` with a byte-level replace and then repairing
  it. The repair is clean; `buildDreamPrompt` reads correctly end to end.
- `render.computer.js` declares all six Dream Diary functions **twice**. That
  is this file's own convention for a renderer shared between the desktop and
  mobile shells — `renderCodexRoster`, `renderCodexDetail`, `renderBankOverview`,
  `renderBillsDashboard`, `renderInvestDashboard` and four others already do
  it, later copy wins by hoisting. Not a paste artifact. The two dream copies
  are identical apart from one explanatory comment, and
  `verify-dreams-diary.js` asserts the count is exactly two so a fix applied to
  one surface and not the other is caught.
- Its fixes to `verify-dreams-compile.js`'s flaky `kind === 'distorted'`
  assertions (which Phase 9 made reachable) are genuine and well made.

**Verified.**

- **`verify-dreams-true.js` — 26/26, with all 28 tripwires proven to fire**
  (scripted mutate-run-restore, tree byte-identical afterwards): both class
  rolls, a branch drawing before falling back, the day rule, the seenByPlayer
  guard, both consumed rings, the episode decay floor / tag filter / window,
  the pinned `none` distortion, the episode key, the single-fragment residue,
  the preserved cast / setting / motif, both by-reference aliases, the
  re-rolled lens, the nap/night diary filter, the unshown-entry guard, the
  filing of episode keys, all five writer branches, and a beat losing its
  `replayDirective`.
- **`verify-dreams-diary.js` — NEW, 11/11, with all 16 tripwires proven to
  fire.** This is Phase 8's missing coverage, written after the fact. It
  asserts D18's one-def-two-surfaces, that both renderers are declared once per
  surface, that the dispatch case and `doDreamOpenEntry` exist, that every
  field the renderers read is a field `fileDreamToDiary` really writes, the nap
  label, **D50** (the diary never reports a class), and the repaint discipline
  (through `getDreamPanelImage`, `data-dream-key` stale guard, `isConnected`
  check, the record's own frozen seed, never a stored blob).
- **The full suite: 2875 passed / 72 failed / 8 errored**, against the Phase 7
  baseline of 2838 / 72 / 8 — exactly +37, which is 26 + 11, and **zero
  regressions**. The 72
  failures and 8 errored harnesses are pre-existing and belong to other
  in-progress work sitting uncommitted in this tree. **Do not chase them.**
- All eight earlier dream harnesses still green: compile 40, p1 18, p6 36, p7
  34, residue 32, tables 27, weave 44.
- `node --check` on every file in `src/srcfiles`.

**`IMAGE_PROMPT_VERSION` was NOT bumped, and Phase 9 has to justify that more
carefully than any phase since 6, because it is the one phase that changed what
a panel prompt SAYS.** A true dream pins `slots.distortion` to `'none'` and
carries a single source fragment, so `composeDreamPanelPrompt` composes
different text for it than it would for a distorted dream. That is safe, and
the reason is that a true dream is a NEW record: its `dream.id` is a fresh
`hashStr(seed|index)`, every panel key is a function of that id, and no key
that existed before this commit describes a true or recurring panel. Nothing
cached was invalidated because nothing cached was addressed. **The Phase 6 rule
is unchanged and still binding:** any later edit to `composeDreamPanelPrompt`,
`dreamPanelViewportClause`, a table's `imageFragment`, a `replayDirective`'s
effect on a prompt, `DREAM_ABSENT_PHRASE`, `DREAM_EMPTY_CAST_PHRASE` or
`DREAM_PROMPT_TAIL` needs a bump.

**Standing caveats, carried forward:**

1. **The real model / real image plugin round trip** (above). The only
   substantive thing never done.
2. **`doSleep` still hand-writes its own energy and `energyMax`** — audit
   finding #12 on `action-outcome-window-plan.md`, and blocker #8 there is
   still open: sleep has a dream window but no outcome window OF ITS OWN, and
   cannot have one until that finding is fixed, because its strip would be
   empty.
3. **A crash between a failed top-up and the next save can still let two
   compiles share an index** (Phase 6's, unchanged and self-healing).
4. **`recordParseTier` counts dream calls into `LLM_TELEMETRY.calls`** (Phase
   5's, unchanged).

---

## The thesis

Sleep is the single most-repeated action in the game and it is currently a
loading overlay followed by a line of text. Meanwhile the simulation is quietly
accumulating the richest material in the project — who the player snooped on,
what they witnessed, which conversations went badly, what an NPC did in a room
the player never entered — and almost none of it is ever reflected back at
them. `world.events` literally carries a `seenByPlayer` flag, which means the
game already knows exactly which of its own happenings the player has never
been shown.

A dream is the one place that material can surface without breaking the
simulation's rules. It costs nothing, decides nothing, and is deniable. It can
be wrong. It can show the player something they have no right to know, because
a dream is not evidence. That combination — total access, zero authority — is
not available anywhere else in the game, and it is what makes a dream engine
worth building rather than just another generated-text surface.

The design risk is obvious and it is not technical: generated dream content is
the easiest thing in the world to make worthless. "And then I was flying, and
somehow I knew it was my mother." The defence is that **the LLM never decides
anything structural**. A dream's form, perspective, tempo, register, visual
lens, distortion, cast, motif and panel count are all chosen deterministically
from authored tables by a seeded roll before the model is ever called. The
model receives a filled-in skeleton and a pile of real, specific residue from
the player's actual save, and its only job is to write 45–70 words per panel
that don't explain themselves. Slop comes from formlessness; this system's
whole shape is a refusal to hand form to the generator.

### What this plan is *not*

- **Not a choice system.** Dreams are watched, not played (D3). No branches, no
  pre-rendered alternates, no interactive body. If a future plan wants lucid
  dreaming it can have it; this one does not.
- **Not a mechanic.** A dream never writes to needs, relationships, knowledge,
  facts, flags, suspicion, or any NPC state (D2). The only thing it applies is
  a wake mood/energy tint. Anything the player *learns* from a dream lives in
  their head, not in the save.
- **Not a replacement for `doSleep`.** Sleep's existing energy restore, alarm
  handling, good-sleep growth and overnight batch stay exactly as they are. The
  dream is a window that opens after the night resolves.
- **Not a real-time generator.** Nothing is ever generated while the player
  waits to fall asleep. If the queue is empty, the player simply doesn't dream
  that night (D19). Never block sleep on a generation.
- **Not a general prompt-kind registry.** `prompt.js` has parked
  `PROMPT_KINDS`/`assemblePrompt` until there is a reason to build it. This
  plan hand-rolls its own assembly like every other caller and does not
  refactor the six existing ones.
- **Not a new image pathway.** Every panel goes through `image.js`'s cached
  getters. `root.generateImage` is never called from `dreams.js`.

---

## Evidence

The material already exists and is already structured. Nothing here needs a new
recording system.

| Source | Where | What it gives a dream |
|---|---|---|
| `world.events[]` | `sim.js` — `{day,tick,roomId,npcId,type,moodDelta,data,template,seenByPlayer}` | **The true-dream spine.** `seenByPlayer:false` is an explicit, already-maintained list of things that happened that the player never saw. |
| `world.debugLog[]` | `debuglog.js:43` `logDebugEvent`, queried via `queryDebugLog(gs,{dayFrom,dayTo,npcIds,categories})` (`debuglog.js:86`) | Day/minute-stamped, npcId-tagged, 21-day window. The richest structured history in the game. |
| `player.ledger[npcId]` | `actions.js:760` `notePlayerLedgerEntry`; `codex.js:26` `notePlayerWitnessedEntry` | `{kind:'participated'\|'witnessed', act, day, roomId, otherNpcId}`. Acts include `peeked_masturbation`, `saw_with_X`. |
| `npc.memory.episodes[]` | schema in `config.js` | Already carries `emotionalTag` and `participants[]` — pre-tagged emotional material. |
| `npc.relPlayer` | writer `npc.js:1078` `applyRelDelta` | Six axes plus `grievances` and `lastInteractionDay`. |
| `world.afterHours` | `state.js:786` | `history`, `liked`, **`searchHistory`** — the player's private appetites, in their own words. |
| `meta.sessionLog[]` | `ui.js:7994` `addLogEntry`, capped 100 | The last 100 narration/dialogue beats with scene + room. |
| `npc.bible.{want,wound,blindSpot,boundary}` | `config.js` | `composePhoneFind` (`npc.js:1365`) already proves these are safe to surface obliquely. |

And the hook is already cut. `ACTION_DEFS['self.nap']` (`defs.actions.js:871`)
carries `outcomeWindow: { tier:'C', trigger:'player', dismissal:'tap' }` with
the `image` key omitted **on purpose**, and `resolveActionWindowSpec`
(`actionwindow.js:268`) already gates the frame on
`if (spec.tier !== 'B' && ow.image)`. Nothing has to be invented to make a
dream appear; something has to be built to make it worth appearing.

---

## Locked decisions

### The compiler

- **D1 — The LLM never decides structure.** Form, perspective, tempo, register,
  lens, distortion, setting, cast, motif and panel count are all selected
  deterministically from authored tables in `defs.dreams.js` by a seeded roll,
  before any model call. The model receives the filled skeleton and writes
  panel prose into it. It chooses nothing else. This is the entire anti-slop
  thesis; every other decision serves it.
- **D2 — Soft signals only. A dream writes no sim state.** No needs, no
  relationship axes, no facts, no episodes, no flags, no suspicion, no NPC
  state, ever. The only exceptions are the wake tint (D12) and the engine's own
  bookkeeping inside `world.dreams`. A dream is deniable by construction.
- **D3 — Dreams are watched, not played.** No choices, no branches, no
  interactive body. A tap advances a panel; the last tap closes the window.
- **D4 — 1–3 panels, one generated image per panel.** Panel count is a property
  of the chosen form, not a separate roll. Naps get 1-panel fragment forms only
  (D16).
- **D5 — The compiler uses its own seeded RNG and never the global stream.**
  `seededRng(gs.meta.seed, hashStr('dream|' + index))` (`sim.js:63`,
  `sim.js:18`). Drawing from the global cast RNG would shift every existing
  seed's cast — the standing determinism invariant. Same seed + same state must
  produce a byte-identical compiled dream.
- **D6 — Every slot is a table entry with an id, a prose directive and an image
  fragment.** Adding a new form/lens/register is a data edit in
  `defs.dreams.js` and nothing else. No new code path per component.

### Sources and knowledge

- **D7 — The dream mind is omniscient, and that is the point.** A dream may
  draw on anything in state, including events the player never witnessed and
  NPC interiority they have not learned. The user's framing: an all-knowing,
  fourth-wall-breaking power the player has no genuine control over — an NPC's
  bad day at work, a conversation two NPCs had, someone thinking about the
  player in the shower. A low-key superpower some of the time. This is
  deliberately in tension with the rest of the game's information discipline
  and is permitted **only** because D2 guarantees the dream changes nothing:
  the player gains a suspicion, never a fact.
- **D8 — Three dream classes.** `distorted` (recombined residue, the common
  case), `true` (an illustrated replay of something that actually happened
  off-screen, drawn from `world.events` / `npc.memory.episodes` — the D7
  superpower), and `recurring` (a previously-shown dream re-run with the same
  form and cast but shifted, D11).
- **D9 — A true dream never double-narrates.** Its source event must be from a
  day earlier than the current night and must not be in the batch
  `advanceAndResolve` is about to surface as "While you were asleep: …"
  (`ui.js:5655`). Consumed source ids go into `world.dreams.consumedEventIds`
  so the same event is never dreamt twice. `seenByPlayer` is **not** flipped —
  that would be a state write (D2).

### Continuity

- **D10 — Motif carryover.** Every dream records the concrete anchor it used (a
  payphone, a flooded stairwell, a door in the wrong wall) into
  `world.dreams.motifHistory`. Later dreams have a weighted chance to reuse
  one, so dreams read as one dreamer's rather than a series of unrelated
  one-offs.
- **D11 — True recurring dreams.** Rarely, a dream from the diary re-runs with
  its original form, cast and motif preserved but its lens, tempo and one beat
  shifted. This requires the compiled slots to be stored on the diary record,
  not just the rendered output — which is why `slots` is a persisted field.

### Presentation

- **D12 — The wake tint is the only applied effect.** Each register carries a
  small mood delta (and, for a few, an energy delta) applied through
  `applyEffects` so it produces honest `applied` rows, then folded into the
  existing wake narration. Magnitudes stay well under a good night's sleep — a
  dream colours a morning, it does not decide one.
- **D13 — Dream panels show no delta strip and no time chip.** A new
  `body: 'dream'` branch in `renderActionWindow`, alongside the existing
  `'picker'` and `'wardrobe'` branches. The strip would be both empty and a lie
  about what a dream is.
- **D14 — A dream panel is a photo record.** It persists `{prompt, seed}` and
  never the blob, exactly as `takePhoto` does (`image.js:1256`, rationale at
  `image.js:1241`): the image cache is a shared evictable LRU, so a diary entry
  must be able to reconstitute its own pixels on demand indefinitely. The
  pre-generation pass warms the cache; the record survives eviction.
- **D15 — One window session, an internal panel cursor.** `presentDream` opens
  a single action-window session and advances a cursor on tap rather than
  opening N sessions. This sidesteps `openActionWindow`'s re-entry guard and
  the `data-handoff` fade entirely, and lets the dream own its panel-to-panel
  cross-fade.
- **D16 — Naps dream too, differently.** Nap dreams are single-panel fragment
  forms at a lower rate, and they fill the `image` hook that `self.nap` left
  open in `defs.actions.js`.

### Player controls

- **D17 — Three flat settings fields**, matching `SETTINGS_DEFAULTS`'
  flat-cycle-row convention (`defs.settings.js:31-38` explains why nested
  fields are avoided): `dreamFrequency` (`off`/`rare`/`sometimes`/`often`,
  default `sometimes` ≈ half of all sleeps), `dreamRegister`
  (`gentle`/`balanced`/`charged` — reweights the tone table), and
  `dreamAbstraction` (`grounded`/`balanced`/`surreal` — how far from literal a
  dream drifts). `sfwMode` remains a **hard, independent gate**: when on, the
  `erotic` register is removed from the table outright regardless of
  `dreamRegister`.
- **D18 — The Dream Diary is one `APP_DEFS` entry with
  `devices: ['computer','phone']`.** `render.phone.js` derives the phone home
  grid from that field and routes through the same `COMPUTER_RENDERERS`
  (`render.computer.js:22`), so both surfaces come from one def. Modelled on
  the phone camera app's gallery/detail pair, which already reconstitutes
  images from frozen prompt+seed records.

### Pipeline

- **D19 — Queue of 2, topped up opportunistically, never blocking.** Dreams are
  compiled, written and rendered in the background and parked in
  `world.dreams.queue`. Sleep consumes from the queue. An empty queue means no
  dream that night — never a wait, never a spinner.
- **D20 — Single-flight background generation**, following
  `startInterruptionPreGeneration` (`interruption.js:200`): fire un-awaited,
  park the result, and re-validate liveness against **`currentGameState`** at
  resolution rather than a captured reference, because `resolveBatch` replaces
  the object (`interruption.js:239` records exactly why).
- **D21 — Panel images generate sequentially, not in parallel.** There is no
  concurrency cap anywhere in `image.js` outside the menu gallery; three
  parallel panel generations from a background pass would contend with the
  scene plate and cutouts the player is actually looking at.
- **D22 — Validity re-check at consumption, not freshness re-roll.** Before a
  queued dream is shown, `dreamStillValid` confirms its cast still exists and
  is still in the world. A dream compiled from two-day-old residue is fine —
  that is what dreams are. A dream about someone who moved out is not.

### Verification

- **D23 — `dev-harness.html` verifies everything except real generation.**
  Established Phase 1, 2026-08-25, by reading the file rather than trusting
  this plan's own earlier note. `dev-harness.html` ships a **working in-memory
  `root.kv`** (its `makeFolder()` shim); only `generateText` and
  `generateImage` deliberately reject, so that the game's own fallback paths
  get exercised. Therefore **anything touching storage, save/load or the
  settings and app UI is locally verifiable** — serve the repo and open
  `http://localhost:8735/dev-harness.html` (the `slice-of-life-review` entry in
  `.claude/launch.json`). Only work that needs a real model or a real image
  round trip — Phases 5 and 6, and the visible half of 7 — actually requires
  the live Perchance page. The shim's one limitation is that its store is
  per-page-load, so a **browser reload** wipes it; cover that case with a Node
  harness round trip through `writeGeneratedGameState` → `loadGameState`
  against `makeMemKv` (see `verify-dreams-p1.js`), which is stricter anyway.
  This decision exists because the opposite belief would have had Phase 1
  reporting itself unverifiable, and would do the same to Phase 8.
  **Amended in Phase 6, 2026-08-25:** "Phases 5 and 6 require the live page"
  was too broad. The FAILURE half of Phase 6 is exactly what the rejecting
  stubs exercise, and the SUCCESS half can be driven locally by swapping
  `root.generateImage` for one that returns a real `<canvas>` — which runs the
  real `canvasToBlob`, the real `URL.createObjectURL`, the real
  `setCachedImage`/`getCachedImage` and the real kv shim, none of which a Node
  harness can reach. That covered every Phase 6 verification item except one.
  What genuinely still needs Perchance is narrower than this decision said:
  **whether a real model's prose clears the parse ladder at a usable rate, and
  what a dream panel actually looks like when a real diffusion model draws
  it.**

### Tuning

- **D24 — The per-sleep chance has exactly one home, and it is
  `DREAM_FREQUENCIES`.** Promoted from Open questions in Phase 2. Each entry in
  `DREAM_FREQUENCIES` (`defs.settings.js`) carries the real probability as
  `chance` (0 / 0.2 / 0.5 / 0.8); `DREAM_TUNING` does **not** restate them.
  `DREAM_TUNING` is nominally "every number", but a list of option ids in one
  file plus a parallel map of numbers in another is two things that have to
  agree, and they would stop agreeing the first time somebody added a frequency
  option — the settings row needs the option table regardless, so the option
  table is where the number goes. What `DREAM_TUNING` does own is
  `napChanceMult`, which is a property of naps rather than of any settings row
  and is multiplied onto whichever `chance` is in force (so `off` stays a hard
  zero for naps too, without a second check). `verify-dreams-tables.js` asserts
  the absence of the duplicate directly: any object inside `DREAM_TUNING` whose
  key set matches the `DREAM_FREQUENCIES` ids fails the run.

### The residue record (Phase 3)

- **D25 — A fragment's `day` is provenance, not a promise of recency.** Four
  of the nine kinds are EVENTS (`participated`, `witnessed`, `overheard`,
  `unseen_event`) and are windowed to `DREAM_TUNING.residueDays`, so their
  `day` is always inside it; the search-derived half of `appetite` and the
  quest/bill half of `obligation` are windowed too. The rest are STANDING
  STATE — a grievance, a desire, a tension, an absence, a possession — and are
  deliberately **not** windowed, because an unresolved grievance is still
  unresolved a month later and dropping it would make the dream mind more
  forgetful than the NPC holding it. Where those carry a `day` it is an ORIGIN
  date (when the grievance formed, when the two of you last spoke) and can be
  arbitrarily far outside the window. Anything downstream that wants "recent"
  must filter on **kind**, never on `day`. `verify-dreams-residue.js` encodes
  this as an `eventKinds()` helper; the harness was written the other way
  first and two assertions failed for exactly this reason.
- **D26 — `unseen_event` fragments carry a minted `sourceKey`.** `world.events`
  records have no id of their own, and both D9's `consumedEventIds` ring and
  Phase 4's `source.eventIds` field need one. `dreamEventKey(evt)` (dreams.js)
  mints `'evt:' + hashStr(day|tick|npcId|type|roomId|template)`, which is
  stable across a save/load round trip and across two independently built
  copies of the same state. The harvester **skips** any event whose key is
  already in the ring, so D9's guarantee holds at the source rather than only
  at the compiler. This is an additive optional field on the fragment shape,
  not a change to it — no other kind carries it.
- **D27 — Residue NUMBERS live in `DREAM_TUNING.residue`; residue PHRASING
  lives in `dreams.js`.** This is the one place in the engine where two related
  things sit in two files, and it is deliberate: the plan puts redaction inside
  the scorers ("each scorer emits an already dreamable clause"), so the
  phrasing belongs beside the state it is phrasing, while the standing rule
  that every number has one home in `DREAM_TUNING` is not worth breaking for
  the sake of co-location. Tuning a dream stays a data edit; rephrasing one is
  a code edit, because a phrase is not a dial. The clause templates are
  `RESIDUE_ACT_CLAUSES` / `RESIDUE_ACT_FALLBACK` plus the inline strings in
  each scorer.

### The compiler's slots (Phase 4)

- **D28 — The setting is a table, and the apartment half of it is not.**
  `slots.setting` needed a source and had none: `sourceKind: 'apartment'` is
  answered by `ROOMS` (config.js), but `'external'` and `'nowhere'` had no data
  anywhere in the game, because the sim has no locations outside the flat at
  all. `DREAM_SETTINGS` (defs.dreams.js) is that source — eight entries, banded
  and weighted like every other table, so a new dream place is a data edit and
  nothing else (D6). Three rules it lives under. **(a)** The `home` entry
  carries no `roomId`; `selectDreamRoom` picks the real room from the residue's
  own `roomId` fields, weighted by how loudly the material points at it, with
  the player's current room folded in at `DREAM_TUNING.roomFallbackWeight`.
  Enumerating the seventeen rooms in a second file is precisely design
  invariant 7. **(b)** No external entry names a real venue, employer or
  street, because the save has no such nouns to stay consistent with — they
  name KINDS of place (a night bus, an institutional corridor, a shop after
  closing) that the writer can furnish freely and no later dream can
  contradict. **(c)** The record is
  `{ settingId, sourceKind, roomId }` — `settingId` is additive beyond the two
  fields the Data model listed, for exactly D26's reason: without it Phase 5
  cannot find the setting's directive and Phase 9 cannot reproduce a recurring
  dream's place, and no other field could carry it without being a type pun.
  A form may lock the kind through `settingKind`; `wrong_room` is the only one
  that does, because "the dreamer's own apartment with one thing added" is
  not a thing a night bus can be.
- **D29 — The dreamer is described only when the framing shows them.**
  `dreamerInFrame` is a required boolean on every `DREAM_PERSPECTIVES` entry,
  and `composeDreamPanelPrompt` folds the player's `buildVisualCharacterClause`
  in only when it is true — `second_person` today, nothing else. A first-person
  POV, a floating vantage, somebody else's body and a scene watched through
  glass all say the dreamer is not a visible subject, and handing a diffusion
  model a full character description underneath one of those framings puts the
  dreamer in the middle of their own point-of-view shot. A required field
  rather than a defaulted one so a new perspective cannot be authored without
  answering the question.
- **D30 — A frozen panel prompt carries neither the viewport nor the style.**
  Every other composer in `image.js` appends an orientation clause and runs
  through `applyImageStyle`; a dream panel does neither at compile time. The
  prompt is persisted onto the record and read again by the Dream Diary weeks
  later (D14), and the device it is eventually drawn on is a fact about the
  device. Phase 6 appends both at the cache boundary, exactly as `getPhotoImage`
  applies the style over a frozen record prompt. `composeDreamPanelKey` follows
  the same split: it folds `IMAGE_PROMPT_VERSION` and the panel index and
  nothing else, and Phase 6 appends `imageStyleToken()`.
- **D31 — A phase that defers work reserves the deferred phase's RNG draws.**
  `rollDreamKind(rng)` takes two draws, discards both and returns `'distorted'`,
  because D8's other two classes are Phase 9's. Had it taken none, Phase 9
  would insert its draws at the head of an established sequence and re-cast
  every dream in every existing save — design invariant 5, in the one form
  that is invisible until it has already happened. The harness asserts the
  count is exactly two, so Phase 9 has to consume them rather than add to them.

### The writer's contract (Phase 5)

- **D32 — The reply's `beat` id is read, and alignment is by id first.** The
  shape is `{ "panels": [ { "beat": "<id>", "text": "..." } ] }`, and
  `assignDreamPanels` matches a reply entry to a compiled panel by beat id,
  falling back to position only when the id matches nothing. This is not
  ceremony and it is not a D1 breach: the beats, their order and their count
  were all decided by `compileDream`, so a beat the model invents matches
  nothing and buys it no structural say at all. What it buys the ENGINE is
  protection against the one silent failure this reply shape allows — each
  panel's image prompt was frozen against its beat at compile time, so a reply
  that arrives out of order and is assigned positionally paints submersion
  prose under an arrival picture, and nothing anywhere would report it.
- **D33 — A reply that cannot fill every panel is a total failure.** Not a
  partial application. Two model-written panels beside one blank is worse to
  look at than three templated ones, so `parseDreamweaverReply` returns `null`
  unless it can fill the whole form, `callDreamweaver` retries once (a failed
  parse applied nothing, so a re-roll cannot double anything — the same
  amendment `callAssessor` carries) and then returns `ok: false`, and the
  caller templates the ENTIRE dream through `buildDreamFallback`.
  `applyDreamPanelText` enforces the same rule from the other side: it refuses
  a text array that is not exactly `panels.length` long and leaves `status` at
  `'compiled'`, so a half-written dream can never reach the queue looking
  finished.
- **D34 — The fallback prose is authored ON THE BEAT, in `defs.dreams.js`.**
  Every beat in `DREAM_FORMS` carries a `fallback` template alongside its
  `directive` and `phrase`, so a form added to the data file is showable the
  moment it is written — D6 applied to the degraded path. A per-form switch in
  `dreams.js` would be the second home that silently leaves a new form
  dreamless the day somebody adds one, and nobody would notice until a model
  call failed on exactly that form. Three rules it lives under. **(a)** The
  templates are second person throughout and deliberately ignore
  `slots.perspective`: 21 beats x 5 perspectives is 85 templates nobody would
  keep in sync, second person is the one stance that reads acceptably under all
  five, and the perspective still reaches the PICTURE, which is generated
  whether the writer succeeded or not. **(b)** Every value that reaches a
  placeholder is a bare, lowercase clause by construction, so the template
  owns the grammar around it — `{where}` carries its own preposition, and
  `dreamFallbackFill` sentence-cases every sentence rather than only the first.
  **(c)** `buildDreamFallback` takes no RNG draw from any stream; the same
  record templates identically forever, which is what the Dream Diary needs to
  repaint a page weeks later.
- **D35 — The bounds the prompt ASKS for and the bounds the parser ENFORCES
  are different numbers.** `panelWordMin`/`panelWordMax` (45-70) go in the
  prompt; `panelWordHardMin`/`panelWordHardMax` (15-140) are what
  `dreamPanelText` enforces, and they are deliberately much wider. The
  prompt's job is to get 45-70; the parser's job is only to decide what is not
  a panel at all. A reply at 38 words is a slightly short dream the player
  should get; four words is a failure; a nine-paragraph essay is trimmed back
  to the last sentence boundary inside the ceiling rather than cut mid-clause.
  Rejecting everything outside 45-70 would throw away most usable replies over
  a shape nobody would notice.

### The pipeline (Phase 6)

- **D36 — The queue is one night dream and one nap dream, never two of a
  kind.** `nextDreamSlot` fills the `night` slot first and the `nap` slot
  second, which with `queueCap: 2` means exactly one of each. This is the only
  reading of D19 under which D16 can happen at all: a queue holding two night
  dreams would mean a nap could only ever dream by generating on the click,
  which design invariant 3 forbids outright. Night goes first because it is
  the common case and the more expensive record — up to three panels against a
  nap's one. Consumption (Phase 7) therefore looks for the queued dream whose
  `forSleep` matches, not for `queue[0]`.
- **D37 — The dream index is reserved before the first await and spent whether
  or not the attempt succeeds.** `dream.id` is `hashStr(seed|index)` where
  `seed` is itself a pure function of the save seed and the index, so
  `dream.id` depends on NOTHING but those two — and every panel cache key is a
  function of `dream.id`. Two different compiles at the same index therefore
  share cache keys. That is harmless while each index is used once, and stops
  being harmless the moment a top-up fails after rendering some panels: the
  retry would find the previous attempt's pixels waiting under its own new
  prose, and nothing anywhere would report it. An index is free; that
  collision is not. The reservation is a write to `world.dreams`, which is one
  of the two writes design invariant 2 permits. It is taken synchronously
  before any await, so `gs` is still `currentGameState` at that instant.
- **D38 — A dream that could not render every panel does not reach the
  queue.** Not a partial park. A queued dream with one un-rendered panel is a
  dream that generates a picture on the sleep click, which is design invariant
  3 arriving through the back door and looking like a working feature. The
  same all-or-nothing shape D33 applies to the prose, applied to the pixels:
  `renderDreamPanels` returns false and the record is dropped. Its index is
  already spent (D37), so the next top-up compiles a fresh dream rather than
  retrying this one against a stale key. Verified live — with the image plugin
  down the queue simply stays empty and nothing throws.
- **D39 — `dreamStillValid` checks four things, and the cast is only one of
  them.** D22 named the cast; the other three are failures the queue makes
  possible by existing. (a) The **form** must still be in `DREAM_FORMS` with a
  matching beat count — a data edit between sessions can orphan a queued
  record. (b) The **register** must still pass `dreamRegisterAllowed`, so a
  player who switches `sfwMode` ON after an `erotic` dream was queued is not
  shown it: D17's gate is hard and independent, and a gate that only holds at
  selection time is not hard. The check reuses the compiler's own filter
  rather than naming `erotic`, so a future gated register is covered without a
  second home. (c) The **status** must be `'written'` or `'rendered'` — D33's
  refusal seen from the other side, so a dream that never got its prose can
  never be presented however complete it otherwise looks.
- **D40 — A dream panel's cache KEY varies with the device; its SEED never
  does.** `getDreamPanelImage` generates with the record's own frozen
  `panel.seed`, not with `hashStr(key)` as every other surface in `image.js`
  does. The key folds the viewport orientation and the active image style
  (D30's device half), so a phone and a desktop, or two styles, never share an
  entry — but a diary entry is a memory of one specific picture, and rotating
  a phone is not an event in the dreamer's life. Same picture, different
  frame. This is the deliberate exception to `plateKey`/`composePlateSeed`'s
  "same key, same picture" rule, and it exists because a dream panel is a
  photo record (D14) rather than a view of the current world.

### Presentation and consumption (Phase 7)

- **D41 — A dream panel cannot be an outcome-window image, so the nap gets a
  second window.** This plan's Phase 7 text asked for `self.nap`'s
  `outcomeWindow.image` field to resolve to the queued nap dream's panel. That
  is unworkable and the code does not do it. `getActionWindowImage`
  (`image.js`) does not display a prompt — it COMPOSES one: the player's
  `buildVisualCharacterClause`, the verb's phrase, "in the bedroom", the
  phase lighting, an orientation clause, then `applyImageStyle`, under an
  `awi_` key. Handing it a dream panel would therefore (a) generate a fresh
  picture on the nap click, which is design invariant 3 arriving through the
  back door, (b) discard the frozen prompt and the frozen seed a diary entry
  needs to repaint itself (D14/D40), (c) put the dreamer in the middle of
  their own point-of-view shot whenever the perspective says otherwise (D29),
  and (d) leave the writer's panel prose with nowhere to go, since the nap
  window's narration is the nap's. So `self.nap` keeps its Tier C window
  reporting the nap — thirty minutes, energy, mood — and `onDismiss` opens the
  dream as its own `body: 'dream'` window behind it. The empty `image` field
  D11 of `action-outcome-window-plan.md` left as "the Dream Engine's hook" is
  still empty and now says why. If a future session genuinely wants the panel
  inside the nap's own frame, that needs a new spec field carrying an
  already-resolved URL, never `image.phrase`.
- **D42 — The wake line goes in the session log, and it is authored per BAND.**
  Promoted from Open questions, which asked this phase to decide it. A dream
  that vanished on the last tap would leave no trace anywhere the player looks,
  and the log is where every other consequence of sleeping already lands. It is
  ONE line, written after the dream rather than folded into the sleep sentence,
  because it describes waking out of the thing just watched. The lines live in
  `DREAM_WAKE_LINES` (defs.dreams.js) beside `DREAM_WAKE_BANDS` — a data edit,
  D6 applied to the morning — and `dreamWakeLine` indexes them by the record's
  own frozen `seed` rather than by any RNG draw, so the Dream Diary reprints
  the same morning months later (D34(c) applied to the wake). No line names the
  dream's cast, setting or motif: a summary would be the engine telling the
  player what they just saw, and it is the one line in the system that could
  contradict the panels.
- **D43 — One dream per day, and the roll is seeded per (save, day, kind).**
  `world.dreams.lastDreamDay` was specified as "gates the frequency roll" and
  this is what that means: the first dream of a day closes it for both kinds. A
  night's sleep resolves on the FOLLOWING day (`advanceAndResolve` has already
  moved the clock by the time `doSleep` consumes), so an afternoon nap and that
  night never collide; two naps in one afternoon do. The roll itself is
  `seededRng(gs.meta.seed, hashStr('dreamroll|<day>|<kind>'))` — its own
  stream, never the global one (invariant 5), and deliberately STABLE, because
  a queued dream is a generated asset and an unseeded roll would let a player
  reload and click Sleep until one appeared.
- **D44 — Consumption prunes the queue of every invalid record, not just the
  kind it was asked for.** `dreamStillValid` failing is permanent for the cast
  case and indefinite for the register case, so a record left in place holds
  its slot against `nextDreamSlot` forever: the player who lost a housemate
  would quietly stop dreaming at night, and the player who switched `sfwMode`
  on after an `erotic` dream was queued would stop dreaming altogether. The
  prune is bookkeeping inside `world.dreams`, which is one of the two writes
  invariant 2 permits. Its cost is that a rendered dream can be dropped for a
  setting the player may flip back — accepted, because the alternative is a
  queue that silently never drains.
- **D45 — A dream the window could not show is not spent.** `presentDream`
  resolves null when there is no DOM (a harness) or when a window is already
  open, and `playQueuedDream` treats that as "not shown": no tint, no diary
  entry, no `lastDreamDay`, and the record stays in the queue for the next
  sleep. Filing on a null would burn a rendered dream nobody saw and close the
  day against it, and nothing anywhere would report it.
- **D46 — The diary cap alone is sufficient; there is no per-entry delete.**
  The player may eventually want to delete a dream, and Phase 8 decided
  against a delete affordance. The cap (`DREAM_TUNING.diaryCap`) already
  drops the oldest entry once full, so the diary self-prunes; and invariant 2
  keeps dreams a one-way record — the only writes a dream may make are the
  wake tint and `world.dreams` bookkeeping — so a delete button would be the
  diary's first destroy-surface, risking a misclick on a memory for a feature
  the cap already provides implicitly. A future "forget this dream" is a new
  write path and a new locked decision.

### True dreams and recurrence (Phase 9)

- **D47 — The true-dream chance stays flat, because the material already
  self-regulates.** Promoted from Open questions, which asked whether
  `trueDreamChance` should rise with how much of the house the player has never
  seen. It should not, and the reason is that the thing a second dial would be
  measuring is already the gate: a true dream needs an unseen world event or an
  untold NPC episode to source, so a player who witnesses everything leaves the
  branch nothing to find and it falls through to `distorted` on its own. A
  frequency that ALSO rose with unseen-ness would be counting the same scarcity
  twice, and would have to be kept in step with the harvester's own window and
  decay rules forever. One dial, and the save decides the rest.
- **D48 — A class branch that finds no material must draw NOTHING before
  falling back.** `rollDreamKind` spends its two reserved draws (D31) and then
  `compileTrueDream` / `compileRecurringDream` select their source with no
  draws at all, so a `true` roll on a save with nothing to replay leaves the
  RNG exactly where a `distorted` roll would have left it and produces a
  byte-identical record. This is design invariant 5 in the form that is
  invisible until it has already happened: a single draw taken before
  discovering there was no material would re-cast every dream after it, in
  every existing save, and nothing would report it. Established as a decision
  during the Phase 9 audit because the harness could not see it — the check
  that was there compared two saves that both fell back, so both took the
  stray draw and stayed equal. The assertion now pins `rollDreamKind` to
  `'distorted'` and requires the records to be unchanged, which is the only
  framing that can see it.
- **D49 — A preserved slot is COPIED, never handed over by reference.** A
  recurring dream keeps its origin's form, setting, cast, motif and residue
  (D11/D28(c)), and every one of those is a shallow copy. Passing the origin's
  own object through would make the fresh record and the diary entry it re-runs
  the same object, so anything that ever wrote to a compiled dream's place or
  motif would silently edit the memory it came from — a corruption with no
  symptom until a diary page read wrong months later. Nothing writes to them
  today, which is exactly why it went unnoticed: the code copied `residue` and
  `cast`, said in a comment that it copied everything, and left `setting` and
  `motif` aliased. Found by the Phase 9 tripwire pass, not by the harness,
  because the aliasing assertion only mutated the two slots that were already
  copied.
- **D50 — The Dream Diary never reports a dream's CLASS.** Not in the gallery,
  not on the detail page, not through `recurrenceOf` and not through
  `source`. D7 lets a true dream replay something real the player never
  witnessed, and that is safe only because D2 makes a dream deniable: the
  player gains a suspicion, never a fact. An entry stamped "true" would convert
  every dream in the diary from the first into the second and hand the player
  an oracle — and "recurring" says the same thing about a different night. The
  diary shows the form's label, the day, the register and whether it was a nap,
  and that is the whole of it. Nothing on screen shows this rule is being kept,
  which is why `verify-dreams-diary.js` asserts it against the renderer's
  source rather than leaving it to be eyeballed.

---

## Data model
### `world.dreams` (Phase 1)

```js
{
  queue: [],             // compiled + written + rendered, awaiting a sleep. Cap 2 (D19).
  diary: [],             // shown dreams, newest first. Cap DREAM_TUNING.diaryCap (40).
  motifHistory: [],      // { motifId, text, dreamId, day }  cap 12 (D10)
  consumedEventIds: [],  // true-dream source dedupe, cap 100 (D9)
  lastDreamDay: null,    // gates the frequency roll
  nextIndex: 1,          // monotonic; feeds the per-dream seed (D5)
}
```

Additive default (`{}` → the above), so **no migration is required** — the same
additive-default precedent as `relationships` and `signals`. Registering it
takes five edits and all five are mandatory; see Phase 1.

### The compiled dream (Phase 4)

The full record. `panels[].text` is empty until Phase 5 fills it; `status`
tracks how far down the pipeline it has got.

```js
{
  id,                    // hashStr(`${seed}|${index}`)
  seed,                  // number — drives every downstream RNG and image seed
  index,                 // world.dreams.nextIndex at compile time
  kind: 'distorted' | 'true' | 'recurring',       // D8
  compiledDay, compiledMinutes,
  forSleep: 'night' | 'nap',                       // D16

  slots: {               // every value is an id into a defs.dreams.js table (D6)
    form:        'descent',
    perspective: 'disembodied',
    tempo:       'stuttering',
    register:    'uncanny',
    lens:        'sodium_vapor',
    distortion:  'endless',
    setting:     { roomId, sourceKind: 'apartment' | 'external' | 'nowhere' },
  },

  cast: [ { npcId, role: 'figure' | 'witness' | 'absent' } ],   // 0–2
  motif: { motifId, text, carriedFrom: dreamId | null },        // D10
  residue: [ { kind, weight, text, npcId?, itemId?, roomId?, day? } ],  // 2–4
  source: { eventIds: [], episodeKeys: [] },       // 'true' dreams only (D9)
  recurrenceOf: dreamId | null,                    // 'recurring' dreams only (D11)

  panels: [ {
    beat,                // the form's beat role for this panel
    prompt,              // FROZEN image prompt, composed at compile time (D14)
    seed,                // hashStr(panel cache key)
    text: '',            // filled by callDreamweaver in Phase 5
  } ],

  wake: { moodDelta, energyDelta, band },          // the soft signal (D12)
  status: 'compiled' | 'written' | 'rendered' | 'shown',
}
```

### The component tables (Phase 2, all in `defs.dreams.js`)

Every table is `{ id, label, weight, directive, imageFragment }` at minimum.
`directive` is the line handed to the LLM; `imageFragment` is the phrase folded
into the panel image prompt. Adding a component is a data edit (D6).

| Table | What it decides | Notable entries |
|---|---|---|
| `DREAM_FORMS` | **Panel count and each beat's role.** The spine. | `tableau` (1), `loop` (2: A → A-but-wrong), `descent` (3: arrival → wrongness → submersion), `late_and_lost` (2), `wrong_room` (2: the apartment with a door that isn't there), `audience` (2), `undoing` (3), `reunion` (2), `fragment_*` (1, nap-only, D16) |
| `DREAM_PERSPECTIVES` | Grammatical stance | `embodied_first`, `second_person`, `disembodied`, `body_swapped`, `retrospective` |
| `DREAM_TEMPO` | Pace of the prose | `languid`, `stuttering`, `accelerating`, `frozen` |
| `DREAM_REGISTERS` | Tone **and** the wake tint (D12) | `tender`, `absurd`, `uncanny`, `anxious`, `melancholy`, `sublime`, `erotic` — each carries `{ moodDelta, energyDelta }` |
| `DREAM_LENSES` | The visual filter, per dream | `sodium_vapor`, `overexposed_35mm`, `underwater_caustics`, `chalk_on_black`, `polaroid_bleed`, `empty_stage_light`, `security_grain` |
| `DREAM_DISTORTIONS` | How the setting is wrong | `endless`, `flooded`, `doubled`, `outdoors_indoors`, `scale_wrong`, `time_wrong` |
| `DREAM_MOTIFS` | The concrete anchor (D10) | authored pool, plus motifs harvested from real owned items |
| `DREAM_TUNING` | Every number | frequency by setting, register weights per `dreamRegister`, abstraction weights per `dreamAbstraction`, caps, panel word bounds, `trueDreamChance`, `recurrenceChance`, `motifCarryChance` |

`DREAM_REGISTERS.erotic` is removed from the weight table entirely when
`isSfwMode()` is true (`settings.js:313`) — a filter at selection time, not a
prompt softener (D17).

### The residue fragment (Phase 3)

What the harvester returns. Deliberately flat and text-first: the LLM receives
these as **raw material**, never as instructions.

```js
{ kind,       // one of DREAM_RESIDUE_KINDS (defs.dreams.js) —
              // 'participated' | 'witnessed' | 'overheard' | 'unseen_event'
              // | 'grievance' | 'appetite' | 'obligation' | 'possession' | 'absence'
  weight,     // (0..1] salience score
  text,       // one concrete clause, already redacted to a dreamable phrase
  npcId?, itemId?, roomId?, day?,
  sourceKey?  // 'unseen_event' fragments ONLY — the minted world.events id (D26)
}
```

`day` is **provenance, not a promise of recency** — see D25. `weight` is
`DREAM_TUNING.residue.kindWeights[kind]` × a per-source strength × a recency
decay, clamped to [0,1].

---

## Implementation phases

### Phase 1 — State, settings, and registration

**Goal:** `world.dreams` persists and round-trips, the three sliders exist and
are readable, and both new files are registered in *both* places so no later
phase dies with a `ReferenceError`.

**Files:**
- `src/srcfiles/dreams.js` (new): stub only — the section header and a single
  `defaultDreamState()` returning the D-model shape above.
- `src/srcfiles/defs.dreams.js` (new): stub only — section header and an empty
  `DREAM_TUNING`.
- `src/srcfiles/state.js`: add `dreams` to `SAVE_KEYS.world`; add a
  `WORLD_KEY_FALLBACKS.dreams` entry returning `defaultDreamState()`; add the
  read-back line in `loadGameState` **and** include `dreams` in the `world:{…}`
  literal. Both are required — the `gameplayOptions` and `debugLog` comments in
  that file document what happens when only one is done (writes fine all
  session, reads back empty next load).
- `src/srcfiles/sim.js`: initialize `dreams` in `buildGameState`'s `world`
  literal.
- `src/srcfiles/defs.settings.js`: three flat fields in `SETTINGS_DEFAULTS`
  (D17) plus their option tables, following `SCENE_VIS_MODES`' shape; three
  cycle rows in the settings screen def.
- `src/srcfiles/settings.js`: three normalizer lines in the settings loader
  alongside the existing `sfwMode` line.
- `index.html`: two `<script>` tags — `defs.dreams.js` before `dreams.js`,
  `dreams.js` after `image.js` and before `actionwindow.js`. **Bump every
  `?v=N` tag together**, never one.
- `dev/verify/loadgame.js`: two entries in `ORDER` at the same positions.

**Top-of-phase note:** registering a new file in `index.html` but not
`loadgame.js` is the `rumination.js` scar — five harnesses and 175 assertions
died silently. Do both in the same commit.

**Verification:** `node dev/verify/run-all.js` still passes with the two new
files in `ORDER`. In the live Perchance page: start a game, confirm
`gameState.world.dreams` exists, save, reload, confirm it reads back with the
same shape (not `{}`). Toggle each of the three sliders and confirm the value
persists across a menu close/open.

---

### Phase 2 — The component tables

**Goal:** every hotswappable part of a dream exists as data, with no logic
anywhere. A reader can add a new lens or form without touching a function.

**Files:**
- `src/srcfiles/defs.dreams.js`: all eight tables from the Data model section,
  fully populated. Each entry carries `id`, `label`, `weight`, `directive`
  (the line the LLM sees) and `imageFragment` (the phrase the panel prompt
  gets). `DREAM_FORMS` entries additionally carry `beats: [...]` whose length
  **is** the panel count (D4), and a `napOnly` flag for the fragment forms.
  `DREAM_REGISTERS` entries carry `{ moodDelta, energyDelta }` (D12).
  `DREAM_TUNING` holds every number, including the per-setting weight maps for
  `dreamRegister` and `dreamAbstraction`.

**Verification:** a new `dev/verify/verify-dreams-tables.js` asserting table
integrity as invariants, not values (harness rule 2): every form's `beats`
length is 1–3; every `napOnly` form has exactly 1 beat; every table entry has a
non-empty `directive` and `imageFragment`; every id is unique within its table;
every register weight map in `DREAM_TUNING` names only real
`DREAM_REGISTERS` ids; `erotic` exists and is the only entry gated by sfw.

---

### Phase 3 — The residue harvester

**Goal:** a pure, deterministic function that turns a save into a scored pool
of dreamable fragments. No RNG, no I/O, no model. This is where D7's omniscience
actually lives.

**Files:**
- `src/srcfiles/dreams.js`: `harvestResidue(gs, opts)` → `[fragment]`, plus one
  small scorer per source so each can be tested and tuned alone. Sources, in
  descending weight: `player.ledger` (participated/witnessed acts),
  `queryDebugLog` over the last `DREAM_TUNING.residueDays`, unseen
  `world.events` (D7 — the superpower material), `npc.memory.episodes` filtered
  by `emotionalTag`, `relPlayer` extremes (high `|desire|`, high `tension`,
  standing `grievances`), `world.afterHours.searchHistory`, near-expiry quests
  and unpaid bills as `obligation`, owned items as `possession`, and NPCs with
  a large `day - lastInteractionDay` gap as `absence`.
- Redaction happens **here**, not in the prompt: each scorer emits an already
  dreamable clause, so the prompt builder never has to reason about what is
  safe to say.

**Verification:** `dev/verify/verify-dreams-residue.js` — harvesting the same
save twice returns an identical array (purity); harvesting mutates nothing
(deep-compare the save before/after); an NPC with a fresh `grievance` produces a
`grievance` fragment naming them; an unseen `world.events` entry produces an
`unseen_event` fragment while a seen one does not; a save with an empty world
returns `[]` rather than throwing.

---

### Phase 4 — The compiler

**Goal:** `compileDream` turns a save plus a seed into a complete dream record —
every slot filled, cast chosen, motif chosen, all panel image prompts frozen —
with **no LLM call and no image generation**. Byte-identical for the same seed
and state (D5).

**Files:**
- `src/srcfiles/dreams.js`: `compileDream(gs, { forSleep, index })`, built on a
  local `seededRng(gs.meta.seed, hashStr('dream|' + index))` — never the global
  stream. Order of operations: roll kind (D8) → pick form (filtered by
  `forSleep`, weighted by `dreamAbstraction`) → pick register (weighted by
  `dreamRegister`, `erotic` removed when `isSfwMode()`) → perspective, tempo,
  lens, distortion → select cast from the residue's npcIds → select motif
  (carry from `motifHistory` at `motifCarryChance`, else roll fresh) → pick 2–4
  residue fragments → compose one frozen image prompt per beat → derive `wake`
  from the register.
- `composeDreamPanelPrompt(dream, beat, gs)`: the panel's image prompt =
  `buildVisualCharacterClause` for any cast figure (the existing shared
  describer) + the beat's own phrase + the lens `imageFragment` + the
  distortion `imageFragment` + the setting. Composed **before**
  `applyImageStyle`, which Phase 6 applies at the cache boundary as every other
  surface does.

**Verification:** `dev/verify/verify-dreams-compile.js` — compiling twice with
the same seed and state gives a deep-equal record; changing only the seed
changes the slots; `forSleep:'nap'` only ever yields a `napOnly` form with one
panel; `panels.length === DREAM_FORMS[slots.form].beats.length` for every form
in the table (loop over all of them); with `sfwMode` on, 500 compiles never
select `erotic`; the global RNG stream is untouched (roll the cast generator
before and after and confirm identical output).

---

### Phase 5 — The dreamweaver call

**Goal:** the model fills in panel prose and nothing else, with a parse ladder
and a templated fallback so a bad response still yields a showable dream.

**Files:**
- `src/srcfiles/llm.js`: `buildDreamPrompt(gs, dream)` and
  `async callDreamweaver(gs, dream)` → `{ ok, panels }`, placed beside
  `callAssessor`/`callChronicler` and copying their shape: `startWith: '{'`,
  one retry only on a definitive parse failure (a failed parse applied
  nothing, so a re-roll cannot double-apply), `recordParseTier` telemetry, and
  a `stripWriterJudgement`-equivalent that discards every key except panel
  text — the model is not permitted to return a mood, a register, a cast, or a
  panel it was not asked for.
- The prompt carries, in order: the form's beat list with each beat's
  `directive`; the perspective/tempo/register/lens/distortion directives; the
  cast by name with their `relPlayer` stance; the motif; the residue fragments
  as **raw material, explicitly labelled as unordered and non-obligatory**; and
  a hard rules block. The rules are the anti-slop lever and are not optional:
  present tense; concrete nouns; 45–70 words per panel; state the impossible
  thing flatly and never explain it; **never** end on waking, never use
  "suddenly", "somehow I knew", "I realized", never name the emotion, never
  reach for stock dream imagery (flight, teeth, falling) unless the form asked
  for it, never write a framing device.
- `buildDreamFallback(dream)` in `dreams.js`: per-form templated prose so a
  total model failure still produces a legal, if plainer, dream.

**Verification:** `dev/verify/verify-dreams-weave.js` — feed canned response
strings through the parse ladder and assert the tier reached for each (clean
JSON, brace-missing, truncated, garbage); assert a garbage response yields
`ok:false` and that `buildDreamFallback` then produces `panels.length` matching
the form; assert extra keys in the response are stripped; assert the prompt
built for a `napOnly` form asks for exactly one panel.

---

### Phase 6 — Rendering and the queue

**Goal:** dreams get their images generated in the background and park in
`world.dreams.queue`, two deep, never blocking anything.

**Files:**
- `src/srcfiles/image.js`: `composeDreamPanelKey(gs, panel, dream)` folding in
  `IMAGE_PROMPT_VERSION`, the lens id and `imageStyleToken()`; a
  `dp_` key prefix beside the existing `awa_`/`awi_`;
  `async getDreamPanelImage(gs, panel)` following `getActionWindowImage`'s
  cached-getter idiom exactly (check cache → generate → `canvasToBlob` →
  `setCachedImage` → `createObjectUrl`); an `IMAGE_NEGATIVE.dream` entry.
  The panel's prompt is read off the record, **never rebuilt from current
  state** (D14) — same rule as `getPhotoImage`.
- `src/srcfiles/dreams.js`: `topUpDreamQueue(gs)` — single-flight via a
  module-level `dreamGenInFlight` guard (D20), compiles → weaves → renders
  panels **sequentially** (D21) → pushes to `queue` → `saveAtBoundary`.
  Re-validates against `currentGameState` before every write, not a captured
  reference. `dreamStillValid(gs, dream)` (D22).
- `src/srcfiles/ui.js`: call `topUpDreamQueue` un-awaited on wake and on day
  rollover. Never awaited from a player-facing path.

**Verification:** live Perchance page (a local server cannot exercise `root.kv`
or the image plugin). Sleep once, then confirm `world.dreams.queue.length`
climbs to 2 over the following day without any visible hitch; confirm the panel
blobs are in the image cache by reopening the same dream and seeing it paint
instantly; save/load and confirm the queue survives with prompts and seeds
intact; kill the network mid-generation and confirm the queue simply stays
short rather than throwing.

---

### Phase 7 — Presentation, and the sleep/nap hooks

**Goal:** the player actually dreams. Panels advance on tap, the clock stays
paused, the wake tint is applied honestly, and `doSleep` finally has an outcome
window.

> **Landed 2026-08-25. Two items below were superseded during the phase and
> the CODE is right, not this sketch.** (a) The `self.nap` `image` field is
> **D41**: a dream panel cannot be an outcome-window image at all, so the nap
> opens a second `body: 'dream'` window from `onDismiss` instead. (b)
> `hideLoading()` before presenting is **not** done, because it would let a
> queued overture gate fire into the dream and be lost — see the Handoff.

**Top-of-phase blocker:** `doSleep` currently builds **no `applied` array** — it
mutates `player.energy`/`energyMax` directly. That is audit finding #12 on the
action-outcome-window plan. The dream's wake tint must go through
`applyEffects` so it produces real `applied` rows (Design invariant 1 of that
plan). Do not hand-write the numbers.

**Files:**
- `src/srcfiles/actionwindow.js`: a `body: 'dream'` branch in
  `renderActionWindow` alongside `'picker'` and `'wardrobe'` — image, prose,
  panel dots, no delta strip, no time chip (D13). `presentDream(gs, dream)`
  opening **one** session with an internal panel cursor (D15); the backdrop
  click and the key handler advance the cursor while panels remain and dismiss
  only on the last.
- `src/srcfiles/ui.js`: in `doSleep`, after `saveAtBoundary('sleep', …)` and
  before the `finally`, roll `shouldDream(gs,'night')`, `dreamStillValid`, then
  `hideLoading()` and `await presentDream(...)`. Mirror the idiom
  `doBoundarySleepRoom` already uses for a hand-written verb's window. Move the
  shown dream to `diary`, record its motif, and kick `topUpDreamQueue`
  un-awaited.
- `src/srcfiles/defs.actions.js`: `self.nap`'s `outcomeWindow` gains its
  `image` field as a **function of `view`** (the TDZ trap in that plan's D25 is
  real — `phrase` must be a function, not a const read) resolving to the queued
  nap dream's single panel, and an `onDismiss` that files it to the diary.

**Verification:** live. Sleep with a dream queued: panels advance on tap, the
continuous clock is paused throughout and resumes after, the wake narration
carries the tint, and the mood delta appears in the debug panel as a real
applied effect. Sleep with an empty queue: no window, no wait, no error. Nap
with a nap dream queued: exactly one panel, in the Tier C frame. Confirm the
save/load round-trip and the clock/needs accounting are unchanged by the hook.

---

### Phase 8 — The Dream Diary

**Goal:** one app def, both devices, and a diary entry that can repaint its own
panels years later from frozen prompt and seed.

**Files:**
- `src/srcfiles/defs.computer.js`: a `dreams` `APP_DEFS` entry with
  `devices: ['computer','phone']` (D18), `entryScreen: 'diary'`, and two
  screens — a gallery and a detail.
- `src/srcfiles/render.computer.js`: two renderers registered in
  `COMPUTER_RENDERERS` — `dreamdiary` (a list of entries, newest first, each
  with its first panel as a thumbnail and its register as a label) and
  `dreamentry` (the panels in sequence with their prose). Model both on the
  phone camera's gallery/detail pair, which already reconstitutes images from
  frozen records via `getPhotoImage`. Use the placeholder-then-async-swap
  pattern with `data-*` key stale-guards, exactly as `renderScene` does.

**Verification:** live, on **both** surfaces. Open the diary on the phone and on
the computer and confirm identical content. Force-evict a dream's panels from
the image cache and reopen the entry — the panels must regenerate to the same
images from the stored prompt and seed. Confirm the diary cap holds at
`DREAM_TUNING.diaryCap` and that the oldest entry drops rather than the newest.

---

### Phase 9 — True dreams and recurrence

**Goal:** the two classes that make the system feel like it belongs to one
dreamer with a superpower, rather than a generator with good tables.

**Files:**
- `src/srcfiles/dreams.js`: the `kind:'true'` branch of `compileDream` —
  select an unseen `world.events` entry or a high-`emotionalTag`
  `npc.memory.episodes` entry, honour the D9 exclusions (earlier day, not in
  tonight's `sleepEvents`, not in `consumedEventIds`), and compile a form whose
  beats replay rather than distort. The prompt for a true dream swaps the
  "distort this" directive block for a "render this faithfully, from the
  outside, without commentary" one.
- `src/srcfiles/dreams.js`: the `kind:'recurring'` branch — pull a diary entry,
  preserve `slots.form`, `cast` and `motif`, re-roll `lens` and `tempo`, shift
  one beat, and stamp `recurrenceOf` (D11).
- `src/srcfiles/defs.dreams.js`: `trueDreamChance` and `recurrenceChance` in
  `DREAM_TUNING`, plus the replay beat directives.

**Verification:** `dev/verify/verify-dreams-true.js` — a save with a known
unseen event compiles a `true` dream sourcing it; the same event is never
sourced twice across 50 compiles; an event from the current night is never
sourced; a `recurring` dream deep-equals its origin on `slots.form`, `cast` and
`motif` and differs on `lens`. Then live: confirm a true dream reads as a
faithful replay and that the same material is not also narrated by "While you
were asleep: …" on the same morning.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | **Done** (2026-08-25) | `world.dreams` subtree, three settings sliders, both new files registered in `index.html` **and** `loadgame.js`. Harness `verify-dreams-p1.js`, 18/18. |
| 2 | **Done** (2026-08-25) | `defs.dreams.js` — all seven component tables plus `DREAM_TUNING`, pure data, keyed by id. Abstraction banded via `DREAM_ABSTRACTION_BANDS`; wake tint on the register via `DREAM_WAKE_BANDS`. Harness `verify-dreams-tables.js`, 27/27. |
| 3 | **Done** (2026-08-25) | `harvestResidue` + `harvestItemMotifs` — nine scorers, pure and deterministic, including D7's unseen-event material. `DREAM_RESIDUE_KINDS` + `DREAM_TUNING.residue` added. Harness `verify-dreams-residue.js`, 32/32. |
| 4 | **Done** (2026-08-25) | `compileDream` + `composeDreamPanelPrompt` + `composeDreamPanelKey` — seeded, deterministic, every slot filled and every panel prompt frozen; no LLM, no images. Added `DREAM_SETTINGS`, `dreamerInFrame`, `settingKind` and four compiler numbers to `defs.dreams.js`. Harness `verify-dreams-compile.js`, 40/40, 16 tripwires proven. |
| 5 | **Done** (2026-08-25) — live model round trip outstanding | `buildDreamPrompt` + `callDreamweaver` (llm.js); `parseDreamweaverReply` + `buildDreamFallback` + `applyDreamPanelText` (dreams.js). Three-tier ladder over `x5ParseJsonObject`, one retry, `recordParseTier`; a `fallback` template on all 21 beats and a `fallbackPlace` on all 8 settings. Harness `verify-dreams-weave.js`, 44/44, 13 tripwires proven. |
| 6 | **Done** (2026-08-25) — real-model/real-plugin round trip outstanding | `getDreamPanelImage` + `dreamPanelCacheKey` + `dreamPanelViewportClause` + `IMAGE_NEGATIVE.dream` (image.js); `topUpDreamQueue` + `dreamStillValid` + `nextDreamSlot` + `renderDreamPanels` + `liveDreamGameState` + `dreamFrequencyChance` + `dreamGenInFlight` (dreams.js); two un-awaited fire sites in `ui.js` (wake, day rollover). Queue is one night dream + one nap dream (D36). Harness `verify-dreams-p6.js`, 36/36, 18 tripwires proven, plus a live browser pass. |
| 7 | **Done** (2026-08-25) — real-model/real-plugin round trip outstanding | `shouldDream` + `pickQueuedDream` + `dreamWakeLine` + `applyDreamWake` + `fileDreamToDiary` + `playQueuedDream` (dreams.js); `presentDream` + `loadDreamPanels` + `actionWindowAdvancesDream` + `advanceDreamPanel` + `awWireContinue` + the `body:'dream'` branch (actionwindow.js); `presentDreamForSleep` + the `doSleep` hook (ui.js); `napWindowDismiss` on `self.nap` (defs.actions.js); `DREAM_WAKE_LINES` (defs.dreams.js). The nap hook is D41's second window, not an outcome image. Harness `verify-dreams-p7.js`, 34/34, 27 tripwires proven, plus a full live browser pass. |
| 8 | **Done** (2026-08-25); harness added retroactively in the Phase 9 audit (`verify-dreams-diary.js`, 11/11, 16 tripwires proven — it found the nap-label bug) | The Dream Diary — `APP_DEFS.dreams` (both devices, diary + entry screens), `dreams` icon, `dreamdiary`/`dreamentry` renderers + `loadDreamPanelIntoImg` stale-guard repaint from frozen prompt+seed (D14), `doDreamOpenEntry` + `dreams.open-entry` dispatch, `.dream-*` CSS. Cap, oldest-drop, save/load round-trip, portrait/landscape key split and both surfaces verified live. |
| 9 | **Done** (2026-08-25) — real-model/real-plugin round trip outstanding | True and recurring dreams. `rollDreamKind` returns a real class (still exactly two draws, D31); `selectTrueDreamSource` + `compileTrueDream` + `dreamEpisodeKey` (a true dream replays one unseen world event or NPC episode, place pinned to `none`, residue IS the event); `selectRecurringSource` + `compileRecurringDream` (form/setting/cast/motif preserved as COPIES, lens/tempo/register/perspective/distortion re-rolled, one beat shifted, `recurrenceOf` + the additive `shiftedBeat` stamped); the shared tail `finishDreamRecord`; `fileDreamToDiary` spends `episodeKeys` too; a `replayDirective` on all 21 beats (defs.dreams.js); `buildDreamReplayBlock` + the class branches in `buildDreamPrompt` (llm.js). Harness `verify-dreams-true.js`, 26/26, 28 tripwires proven. |

## Dependency order

```
Phase 1 (state + registration) ──► everything else
        └─► Phase 2 (tables) ──► Phase 4
        └─► Phase 3 (residue) ──► Phase 4
                Phase 4 (compiler) ──► Phase 5 ──► Phase 6 ──► Phase 7
                                                        └─► Phase 8
                                                              └─► Phase 9
```

Phases 2 and 3 are independent of each other and may run in either order after
Phase 1. Everything else is strictly ordered: the compiler cannot be written
before the tables it selects from or the residue it casts, and nothing can be
presented before it can be rendered. **Never start Phase 7 before Phase 6** —
presenting a dream whose images were never generated is how you end up
generating on the sleep click, which is the one thing D19 forbids. Phase 8 needs
only Phase 7's diary records, so it may run before Phase 9. Phase 9 is purely
additive and can be deferred indefinitely without leaving the system in a
half-state.

## Open questions (parked, none blocking)

- ~~**Does a dream ever appear in `meta.sessionLog`?**~~ **Resolved in Phase 7
  as D42:** yes, exactly one line, the register's own wake line, written after
  the dream rather than folded into the sleep sentence. It never summarises the
  dream's content.
- **Should `dreamAbstraction: 'surreal'` unlock forms that `grounded` can't
  reach**, or only reweight the shared pool? Still open, but the mechanism now
  exists and is reweight-only: Phase 2 tagged every form, lens and distortion
  with an `abstraction` band and `DREAM_TUNING.abstractionWeights` bends the
  three bands per mode, flooring at 0.15 so nothing is ever unreachable. A
  `grounded` dream can therefore still land on an `unreal` form, just rarely.
  Promote to a locked decision if the tuning pass shows grounded dreams reading
  as identical to each other — the change would be a filter at selection time,
  not a new number. **Phase 4 wired the mechanism through and added a fourth
  pool to it** (`DREAM_SETTINGS`), and `verify-dreams-compile.js` asserts that
  grounded and surreal move all four — form, lens, distortion and setting —
  in the right direction. So the question is now purely "is reweighting enough
  separation", answerable only by playing it.
- ~~**True-dream frequency relative to relationship state.**~~ **Resolved in
  Phase 9 as D47:** it stays flat. The material already self-regulates — a
  player who sees everything leaves no unseen events to source, so the branch
  falls through to `distorted` on its own without a second dial to keep in
  step with the first.

## Design invariants

1. **The generator never chooses form.** Every structural property of a dream
   is a seeded draw from an authored table before the model is called. The
   moment a phase hands the model a structural decision, the anti-slop
   guarantee is gone and the system is just another text generator.
2. **A dream reads everything and writes nothing.** The knowledge system, the
   relationship axes and the NPC memory model are strictly read-only from
   `dreams.js`. D7's omniscience is only safe because of this; a single write
   turns the dream from a suspicion into an oracle and breaks the information
   economy the rest of the game is built on.
3. **Never generate on the sleep click.** If the queue is empty the player does
   not dream. `castWeb` silently never persisting for months is this project's
   standing lesson about invisible failures; a dream that hangs the sleep
   button would be the loud version of the same mistake.
4. **A panel record stores prompt and seed, never pixels.** The image cache is
   a shared LRU with a 500-entry cap that evicts under pressure. A diary entry
   that stored a blob reference would silently become a broken image, which is
   exactly landmine L10 that `takePhoto` was designed around.
5. **The compiler's RNG is its own.** Drawing from the global stream shifts
   every existing seed's cast. This has bitten the project before and the rule
   is absolute: new draws append at the end of their own sequence, and the
   dream sequence is a separate one.
6. **Register the file in both places.** `index.html` *and*
   `dev/verify/loadgame.js`, in the same commit. `rumination.js` shipped with
   only the first and took five harnesses and 175 assertions down silently.
7. **Never enumerate persisted keys in two places.** `world.dreams` goes into
   `SAVE_KEYS` and is read back in `loadGameState`'s world literal — both, or
   it writes all session and reads back empty forever.
