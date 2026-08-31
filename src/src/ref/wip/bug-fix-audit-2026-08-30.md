# Bug-fix audit — 2026-08-30 (settings, knock cost, chat images, peek framing, shower towel)

**Status: Open — all five fixes implemented and verified live on 2026-08-30.**
User's final confirmation outstanding; move to `complete/` once the five
behaviours are confirmed good in play. No paired prompt (this was a bug
audit, not a phased overhaul).

Covers five player-reported issues from one feedback session:

1. Need-decay settings (`Need decay speed` / `Disable need decay entirely`)
   did not affect how much energy actions drained.
2. Knocking on a door cost thirty game-minutes.
3. Requesting an image in a chat returned the same image every time.
4. Peek images looked posed (subject facing the viewer) and never evolved
   while held.
5. Everyone peeped on in the shower was wearing a towel.

---

## 1. Need-decay settings only governed TIME decay, not action drains

### Root cause

`needDecayScaleFor`-style scaling existed in exactly one place:
`decayPlayerNeeds` (`sim.js`), the closed-form **time** decay. Every flat
per-action energy drain bypassed it:

- All `ADJUST_NEED player energy -N` lines (workout, swim, games, intimacy
  verbs, computer apps, AfterHours, dream panels) landed in
  `applyAdjustNeed` (`effects.js`), which wrote `player.energy` directly,
  unscaled.
- The gig grind's per-click drain (`computer.js` workGigClick) was a direct
  `player.energy = clamp(player.energy - GIG_ENERGY_PER_BLOCK, …)` write —
  it bypassed the whole effect pipeline, so "limitless energy" still left a
  gig as the one action that drained the bar.

The setting descriptions ("Lower is more forgiving" / "Energy, hygiene,
hunger and mood stay exactly where they start") promised what the code
didn't deliver for actions.

### Fix

- New single choke point `needDecayScaleFor(gameState)` in `sim.js`, right
  above `decayPlayerNeeds`, reading `world.gameplayOptions` and returning
  `0` when `needDecayDisabled`, else `needDecayScale` (default `1`).
  `decayPlayerNeeds` now uses it (identical behavior, one less inline read).
- `applyAdjustNeed` (`effects.js`): a **negative** player `energy` delta is
  scaled by `needDecayScaleFor`. Positive deltas (shower/nap/relax/eat
  restores) are deliberately **unscaled** — the complaint was that actions
  still *drain*; recovery verbs still work under a hard setting, which is
  the forgiving direction.
- `computer.js` gig click: drain scaled by `needDecayScaleFor` (the direct
  write, now consistent with every other drain).

Scope note: only *energy* drains were scaled, exactly the reported axis.
Hygiene soiling, mood impulses and hunger intake were left alone — they
read as "the action did this", not "time decayed it". Pregnancy's forced
baby-energy cost (`pregnancy.js`) was also left alone (a system cost, not
an action drain). If the user later wants hygiene/hunger/mood included, the
same helper extends trivially.

### Verification (live page)

- `needDecayScaleFor`: disabled → `0`, slider 0.5 → `0.5`, default → `1`.
- `ADJUST_NEED player energy -8` at energy 50: default → 42, 0.5× → 46,
  disabled → 50 (no drain). `+10` restore at disabled → 60 (unscaled).
- `advanceAndResolveMinutes(3)` decays once, moves clock exactly 3 minutes.

---

## 2. A knock cost 30 game-minutes (charged twice)

### Root cause

`doKnock` (`ui.js`) ran `advanceAndResolve(1)` — one full tick, i.e.
`CLOCK.tickMinutes` = 30 game-minutes — **and then** a manual
`decayPlayerNeeds(player, CLOCK.tickMinutes, …)`, so the 30 minutes were
decayed **twice** and a 3-second overture cost half an hour of needs.
`doUnlockDoorFromOutside` had the identical double-charge pattern.

### Fix

Both verbs now go through the exact-minutes path
`advanceAndResolveMinutes(BOUNDARY.durationMinutes.knock | .unlock_door)`,
which advances the clock to the exact target, decays player needs exactly
once, and drives phone-battery/memory decay for the true span.

New durations added to `BOUNDARY.durationMinutes` (`config.js`):
`knock: 3`, `unlock_door: 1`. The knock outcome window's `minutesSpent`
was updated to match (was `CLOCK.tickMinutes`).

### Verification (live page)

- `BOUNDARY.durationMinutes.knock === 3`, `.unlock_door === 1`.
- `advanceAndResolveMinutes(3)` moved the loaded save's clock by exactly
  3.0 minutes and decayed energy exactly once.

Other `advanceAndResolve(1)` sites exist (chores, peep, some computer
verbs) — left alone: the user flagged only the knock, and those verbs'
tick-cost is a separate tuning question.

---

## 3. Chat image requests returned the same image every time

### Root cause

The ask "Photo Request" (`📷 Photo`) builds its image record deterministically
in `buildAskPhotoRecord` (`asks.js`):

```
id = askphoto_<hash(saveSeed | npcId | day | count)>
seed = hash(...)
```

where `count` was `askTurn.ladder.count` — the repeat-ladder **streak**. The
ladder resets to 0 on every accepted ask (`ASK_TUNING.ladder.resetOnAccept`,
D7), so two accepted photo requests the same day drew the identical
`(npcId, day, count=0)` tuple → identical record id → `getAskPhotoImage`
served the **same cached image** for every request. The kv image cache then
made it permanent: the same pixels, forever, that day.

### Fix

The record's discriminator is now a per-NPC **monotonic serial**
(`nextAskPhotoSerial` in `asks.js`), persisted on `npc.flags._askPhotoN`
and incremented once per accepted photo ask. `runAskPhotoFlow` (`ui.js`)
passes the serial instead of the ladder streak.

Determinism per save (D1) survives: the serial persists with the NPC, and
already-generated photos stay addressable by their cached ids — reloading
a save reproduces exactly what was already shown, while each *new* request
is genuinely new art. Recalled conversations render text only, so nothing
re-draws from the record later.

### Verification (live page)

- `nextAskPhotoSerial` returns 0, 1, 2 and persists `_askPhotoN = 2`.
- `buildAskPhotoRecord` with serial 0 vs 1 → different ids
  (`askphoto_buqldq` vs `askphoto_c4q72p`) and different seeds.

### Related: F3 conversation-scene visualizer

The auto scene panel (`🎨 Scene`, `generateConversationSceneImage`) was
already uncached with a random seed per call, but its **prompt** was
deterministic (same room, same cast, same "mid-conversation" phrase), so
two panels looked near-identical even though the pixels differed. Added a
per-call moment-descriptor pool (`CONV_SCENE_BEATS`, 10 entries, image.js)
drawn with the same `Math.random` the generation already uses, so each
panel is visibly a different frame of the conversation.

---

## 4. Peek images posed for the viewer and never evolved while held

### 4a. Posed framing (subject ignoring the act)

#### Root cause

`composePeekPrompt` (`image.js`) framed the scene as "`X is {act}, at ease
in their own space`" — read by the model as a composed portrait. The
reported symptom: `on a video call` + undressed rendered as "standing
there, undressed, posed for you — but not on a call".

#### Fix

Rewritten to force **candid, mid-action, unaware** framing in the positive
prompt ("glimpsed through a narrow gap in a slightly open door… mid-motion,
absorbed in what they are doing, completely unaware of being watched, body
angled away from the door, not looking at the viewer, natural unposed body
language") and hardened the negative prompt
(`IMAGE_NEGATIVE.peek` now also bans "posing for the camera, looking at the
viewer, facing the camera, standing straight, static portrait, studio
pose"). `getPeekImage` now reads `IMAGE_NEGATIVE.peek` instead of a
duplicated inline string.

### 4b. Static frame while held

#### Root cause

`_refreshView` (`peek.js`) refreshed the image **only** when the act key
changed, and `composePeekKey` is deterministic per (room, npc seed, phase,
act), so even an act-change mid-session that had been seen before returned
the same cached blob. Holding a keyhole showed one static frame forever.

#### Fix

- `PEEK.frameRefreshSec: 5` (`config.js`) — the lens re-rolls a fresh frame
  every 5 real seconds while held, even when the act hasn't changed.
- Frame **sequencing**: a changed act restarts the sequence on the canonical
  deterministic key (revisiting a moment still reuses its art across
  sessions); a time-based refresh continues it under a unique
  `…_f{frameSeq}` key, so repeated frames are genuinely new generations,
  never the same cached blob. `frameSeq` increments per fresh generation.
- `getPeekImage` takes an optional `frameKey` override; `rerollPeekFrame`
  takes the shown frame's key so the ⓘ reroll overwrites exactly the frame
  on screen.
- **One-generation-at-a-time guard** (`s._genInFlight`): a frame takes far
  longer to draw than the 5s cadence, so without the guard ticks would
  stack overlapping generations (duplicate quota spend, racing src writes).
- Budget raised `freshPerSession 2→4`, `freshPerDay 6→8` — 2 fresh frames
  died ~10s into a hold, exactly the "worthless to peek past a few seconds"
  complaint; 4/8 still caps a long or repeated peeking habit.

### Verification (live page)

- Full real session at a bedroom door (`startPeekSession('bedroom_1')`,
  image source stubbed for speed, catch chance zeroed): canonical frame at
  t≈0, `_f1` at t=5, `_f2` at t=11 — new unique key every 5s, no overlaps
  (`_genInFlight` never true during ticks), clean teardown.
- One **real** generation through the new prompt path produced a valid
  512×768 frame (content itself not vision-checkable — the vision model
  declines this game's adult content — so the candid framing rests on the
  prompt wording above, which directly encodes the fix).

---

## 5. Everyone peeped on in the shower was wearing a towel

### Root cause

The `shower` drive's `setsClothing` was `'towel'` (config.js) — but `'towel'`
is the **post**-shower state per the clothing state machine (config.js:
"towel — post-shower"). `setsClothing` is applied at the moment the drive
OPENS (`drives.js`: `c.setClothing(drive.setsClothing)`), and a 30-min shower
is exactly ONE sim tick (`utility.holdMinutes`: 30 = 1 tick; drives
re-evaluate only per 30-min sim checkpoint), so there was **never** a held
tick where pass-2's activity rule (`npcClothingForContext`, npc.js:
`if (activity === 'showering' && NUDITY_TUNING.nudeShower) return 'nude'`)
could override it. Every NPC was `'towel'` for the entire shower.

Since `'towel'` ∉ `NAKED_CLOTHING_STATES`, the intimate gate stayed closed,
so both the peek image (`composePeekPrompt` → `buildVisualCharacterClause`
→ "wrapped in a towel") and the peek view line
(`composePeekViewLine` → `PEEK_VIEW_CLOTHING.towel` = ", wrapped in a towel")
showed a towel. The player's own shower was already correct
(`def.transientClothing 'nude'` + `afterClothing 'towel'`), and the
masturbate drive already used `setsClothing: 'nude'`. Stealth peep
(`stealth.js` PEEP_CLOTHING_DESC) derives from activity, not clothing, so it
was already correct.

### Fix

- **config.js** — shower drive `setsClothing: 'towel'` → `'nude'` (in-shower
  must be `'nude'`, like the player shower + masturbate drive; the leftover
  `'nude'` reverts to `'dressed'` next tick via `npcClothingForContext`'s
  `if (clothing === 'nude') return 'dressed'`).
- **image.js** — `composePeekKey` now folds `npc.clothing` into the cache
  key (`…_${phase}_${npc.clothing||'dressed'}_${actKey}`). The old key never
  carried clothing, so towel frames cached under the buggy state
  (`peek_…_showering`) would have been served forever; the new `_nude_…`
  keys orphan the stale towel frames (they age out of the LRU, never shown)
  without a broad `IMAGE_PROMPT_VERSION` bump.

No other edits: the gate, the explicit act phrase (`PEEK_VIEW_ACT
showering.explicit` = "in the shower"), the view line
(`PEEK_VIEW_CLOTHING.nude` = ", completely bare") and the image prompt
clause all already knew what to do with `'nude'`.

### Verification (live page)

- `DRIVE_DEFS.shower.setsClothing === 'nude'`.
- `npcClothingForContext(…, 'showering', 'towel', rng) === 'nude'`
  (held-tick rule) and `'idle', 'nude' → 'dressed'` (post-shower revert).
- `composePeekKey` with a 'nude' showering npc →
  `peek_pv4_…_day_nude_showering_…` (clothing folded in).
- `composePeekPrompt` with a realistic 'nude' showering npc → clause ends
  "… completely naked", prompt reads "… completely naked is in the shower",
  gate open. (An earlier failed check traced to a malformed test npc that
  lacked `physical.hair.color` and hit `buildVisualCharacterClause`'s
  `b?.visual` early return — the function itself was never the problem.)
- Note: `vision` cannot review the resulting frames (adult content
  refusal); the fix's correctness rests on the prompt/clothing logic above.

---

| File | Change | `?v=` |
|---|---|---|
| `src/src/srcfiles/sim.js` | `needDecayScaleFor` helper; `decayPlayerNeeds` uses it | 91 → 92 |
| `src/src/srcfiles/effects.js` | `applyAdjustNeed`: scale negative player energy drains | 36 → 37 |
| `src/src/srcfiles/computer.js` | gig click drain scaled | 66 → 67 |
| `src/src/srcfiles/config.js` | `BOUNDARY.durationMinutes.knock/unlock_door`; `PEEK.frameRefreshSec`; `PEEK.imageBudget` 4/8; shower drive `setsClothing` 'towel' → 'nude' (fix 5) | 156 → 158 |
| `src/src/srcfiles/ui.js` | doKnock / doUnlockDoorFromOutside → `advanceAndResolveMinutes`; `runAskPhotoFlow` → serial | 145 → 146 |
| `src/src/srcfiles/asks.js` | `nextAskPhotoSerial` | 11 → 12 |
| `src/src/srcfiles/peek.js` | frame refresh cadence, frame sequence, one-gen guard | 5 → 7 |
| `src/src/srcfiles/image.js` | candid peek prompt; `IMAGE_NEGATIVE.peek`; `getPeekImage` frameKey; `rerollPeekFrame` frameKey; `CONV_SCENE_BEATS`; `composePeekKey` folds `npc.clothing` (fix 5) | 35 → 37 |
| `index.html` | version bumps above | — |

## Notes / leftovers

- Test play on the user's real save left the player moved to `hallway_a`
  and the clock +3 min; both were restored (player back to `living_room`)
  and re-saved. The +3-minute clock offset is baked into that save and
  unavoidable.
- `vision` cannot review the peek frames (adult content refusal). If a
  visual check of candid framing is wanted, it needs a human eye.
- Remaining `advanceAndResolve(1)` sites (non-knock verbs) and the
  un-scaled hygiene/mood/hunger action effects are documented above as
  deliberate scope decisions, not oversights.
