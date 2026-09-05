# Audit — sleeping NPCs contradicted across panes (2026-09-05)

**Status: INVESTIGATED, NOT FIXED.** Written from a user report the day Phase 7
of the night-scene plan closed: *"when you walk into a room it says 'They are
asleep' in one pane and 'They look up at you as you walk in' in another … I feel
like there are other possible triggers that contradict the NPC's sleeping
state."* There were. Four confirmed, all reproduced by running the code, plus
the structural cause that produced all four. No paired prompt — this is an audit,
not a phased overhaul.

Nothing here is night-scene code. The night scene made it visible (it is the one
feature that parks you in a room with a sleeper for a long time) but every bug
below predates it and fires for naps, schedule sleep, and the Phase 17 bed verbs
alike.

---

## The structural cause

**There is no canonical "is this NPC asleep" predicate, and there are two
different notions of asleep that disagree.**

- **Live state:** `npc.activity === 'sleeping' | 'napping'`. Hand-rolled in
  **15 places across 8 files** (`boundary.js`, `drives.js`,
  `movement.present.js`, `overture.js`, `render.js`, `stealth.js`, `ui.js`,
  `willingness.js`). No shared helper.
- **Schedule state:** `resolveScheduleActivity(npc, clock).block === 'sleep'`.
  Used by `interruption.js`, `overture.js`'s `mealJoinEligible`, and
  `cognition.js`.

`overture.js:715` even argues the schedule block is the *right* thing to test
and that `npc.activity` is "a display string … the wrong thing to test." That is
true for *"will she be at work later"* and false for *"is she unconscious right
now."* The two diverge whenever someone sleeps outside their schedule — a nap, a
`sleep_recover` drive, `_sleepAdvance`, or the sleeping-room verbs.

**Measured divergence:** an NPC with `activity: 'sleeping'` during a `leisure`
block is invisible to every schedule-based check.

---

## 1. A sleeping NPC is offered to the model as a SPEAKER

**This is the reported bug.** `getSceneParticipants` (`sim.js:4149`) sorts
everyone present by `affection − tension` and takes the top `SCENE.maxActiveNpcs`
as `active`. **There is no sleep check of any kind.** `active` becomes
`context.activeNpcs`, which `buildScenePrompt` (`llm.js:251`) prints under:

> `CHARACTERS PRESENT (these are the ONLY people who can speak):`

…with a full `buildNpcBlockV2` — temperament, dialogue style, retrieved
memories — and a response schema whose example names her as the speaker. The
only counter-signal is one clause buried in the block:
`[Current state]: Mood: neutral. Currently: sleeping.`

**Reproduced** (resident asleep in her own room, player walks in):

| surface | says |
|---|---|
| presence pane (`scene.js` `presenceLines`) | `Someone is asleep.` |
| scene prompt | lists her as an eligible speaker (`promptListsHerAsSpeaker: true`) |
| `getSceneParticipants` | `active: [her]` |

The model is being told she is asleep and simultaneously told she is one of the
only people who can speak. It resolves that the way you saw.

**The fix is already half-built:** the prompt has an `AMBIENT (present but NOT
speaking — mention in narration only)` block that prints `(currently
${npc.activity})`. That is exactly the right home for a sleeper and needs no new
prompt text.

**One decision the fix has to make:** if the only person present is asleep,
`activeNpcs` goes empty. `ui.js:8461` already guards the NPC-opens-conversation
path on `currentSceneState.active.length > 0`, so the call is simply skipped —
which is correct (nobody should open a conversation) — but it should be
confirmed that nothing else assumes a non-empty `activeNpcs`
(`llm.js:288/292/295` build the schema example from `activeNpcs[0]?.…` with
fallbacks, so they degrade rather than crash).

---

## 2. A sleeping owner WITNESSES you sneaking into her room

`ui.js:8455` prints the literal line you saw:

```js
addLogEntry('narration', ownerName ? `${ownerName} looks up as you come in.` : 'Someone looks up as you come in.');
```

Guarded on `stealthResult.witnessed`, which is `stealth.js:80`:

```js
const witnessed = presentIds.includes(ownerId);
```

**Pure co-presence. No sleep check.** So walking into a bedroom where the owner
is asleep is treated as being seen by her, and it is not just cosmetic — it takes
the *direct witness* branch, the most expensive one in the table:

- `WITNESS <owner> player certain`
- `ADJUST_SUSPICION boundary_violation +0.35` (`witnessedSuspicionDelta`, ×1.5
  if her boundary is `room_access` — so up to **+0.525**, against a
  `confrontThreshold` of 0.5)
- `REL_DELTA tension +0.1`
- a **grievance** (`addGrievance`), which `ask_apologize` can later target

The sneak-caught branch — the one that *should* apply — is a tenth of that
(+0.15) and leaves discoverable evidence instead of certain knowledge.

**The same file already knows the concept.** `resolvePeep` at `stealth.js:131`
does `const isAsleep = activity === 'sleeping' || activity === 'napping';` and
branches its detection chance on it. The room-entry witness path just never
learned it.

`stealth.js:435` (the room-*search* witness) uses the identical
`presentIds.includes(ownerId)` and has the same hole.

---

## 3. A sleeping NPC witnesses house-rule violations, and gossips about them

`flags.js:72` and `flags.js:97` build their witness set from
`getPresentNpcIds(...)` with no sleep filter. A sleeper in the room therefore
takes the full consequence: `MOOD_DELTA`, `REL_DELTA tension`, and an
`addMemoryFact` belief in the `house` category — which is explicitly the gossip
hook, so `TRANSMISSION` then carries "she saw you do it" to the rest of the
house. She was asleep.

---

## 4. A napping NPC joins you for dinner and walks in on you

Both of these check the schedule block, so they are blind to any off-schedule
sleep. **Reproduced with `activity: 'sleeping'` during a `leisure` block:**

| system | check | result |
|---|---|---|
| `overture.js` `mealJoinEligible` | `busyBlocks.includes(block)` | `{ eligible: true }` — she gets up and comes to dinner |
| `interruption.js:73` `getEligibleNpcs` | `block === 'sleep'` | eligible, with a **31.5%** per-check interruption probability |
| `cognition.js:794` | `resolved.block === 'sleep'` | same shape |

---

## Proposed fix (small, and it should be its own pass)

1. **One predicate.** `npcIsAsleep(npc)` → `activity` in
   `{'sleeping','napping'}`, in a file everything already loads (`sim.js` or
   `npc.js`). Replace the 15 hand-rolled copies over time; the point now is that
   new code has one obvious thing to call.
2. **`getSceneParticipants`** excludes sleepers from `active` and leaves them in
   `present`/`ambient`, so the presence pane and the prompt's AMBIENT block still
   mention them. No prompt change needed.
3. **`stealth.js`** — both witness sites become
   `presentIds.includes(ownerId) && !npcIsAsleep(owner)`. A sleeping owner should
   fall through to the **sneak** branch (roll against stealth, maybe leave
   evidence), which is what actually happened.
4. **`flags.js`** — filter the witness set through the same predicate.
5. **The block-based checks** become `block === 'sleep' || npcIsAsleep(npc)`.
   Do not replace the block check — it is still right for *"will she be
   available later"*; it is only insufficient for *"is she conscious now"*.
6. **Harness** (`verify-sleep-consistency.js`, registered in `loadgame.js` —
   `run-all.js` auto-discovers): a sleeping NPC is never in `active`, never
   witnesses a room entry or a house-rule violation, is never meal-join
   eligible, and is never an interruption candidate. Plus the cheap structural
   guard that would have caught all four: **every system that reads
   `getPresentNpcIds` to decide an NPC ACTS must pass its result through
   `npcIsAsleep`.**

## Not investigated

- `peek.js:37/564`, `commitments.js:262`, `drives.js:1019`,
  `signals.js:520/569`, `image.js:1744`, `inventory.js:59`, `actions.js:63` also
  read `getPresentNpcIds`. Some of those are legitimately sleep-agnostic (a
  sleeping body still occupies a room, still appears in a scene image, still
  blocks privacy). Each needs the question asked separately: *does this decide
  that she DOES something, or only that she IS somewhere?* Only the first kind
  needs the gate.
- Whether the LLM ever contradicts sleep from the AMBIENT block alone (it is
  told `(currently sleeping)` there and instructed to mention in narration
  only). Worth a look once fix 2 lands, since that becomes the sleeper's only
  route into the prompt.
