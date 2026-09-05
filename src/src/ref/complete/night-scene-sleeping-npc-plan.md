# Night Scene — the sleeping-NPC free-play minigame

Status: **COMPLETE — all seven phases built (2026-09-05).** The mechanics were locked
2026-09-03; the UI was locked 2026-09-04 in a dedicated design session that
also revised four mechanics decisions (D17/D22/D23/D24) and resolved a
standing contradiction between D8 and design invariant 6. A second pass the
same day added the mechanic that makes Heat a real resource — Intensity
Acceleration Resistance — plus per-NPC touch preferences and authored prose
(D27–D31). Phase 3a landed the whole mechanics revision those passes
called for on 2026-09-04 — the grammar tables, IAR, preferences, the pose
graph, unbounded heat and the authored prose are all built and green
(`verify-night-p1.js`, 115/115). 3b landed the Living Tableau and 4 the
per-action imagery and the live clock, both the same day. Phase 5 landed the
endings on 2026-09-05 — the private suspicion roll is deleted and every
resolution now runs through the sim's own consequence surfaces. Phase 6 closed
the feature the same day: the action chip that opens it, the shadow layer that
pressures it, the register that stops it assuming its target's pronouns, D28's
learned preferences, and Q2's answer. Phase 7 closed D34's clothing axis the
same day — the third tracked piece Phase 3a dropped, found by the user playing
Phase 6 and going looking for the undress control. **The only things still open
are the live balance verdict (Q5) and Q3's parked skill axis — both need the
user, not another session.** Last updated 2026-09-05.

Companions:
- `src/src/ref/wip/actions-and-activities-overhaul-plan.md` — **the parent
  plan.** Its D30 (sleeping-target branch → `boundary.js`, three outcomes:
  wake hostile / wake receptive / undisturbed) is the exact mechanism this
  plan replaces *for the in-room case*, now via a dedicated action chip
  rather than the chat ask path (see D13 below). Its D31 (`_sleepAdvance` /
  the player-waking gate) is the reverse-case precedent this plan must not
  break.
- `src/src/ref/complete/intimacy-and-voyeurism-overhaul-plan.md` — the
  willingness gate (the ONLY door into intimacy, invariant 1), whose hard
  `'asleep'` floor this plan respects exactly as Phase 17 / D30 do — never
  through a relaxed willingness.
- `src/src/ref/complete/action-outcome-window-plan.md` — the `ActionWindow`
  / `image.js` cache the night scene's narration beats and plate caching
  reuse.
- `src/src/ref/wip/character-cutout-scene-rendering-plan.md` — the
  deterministic-seed cache pattern the night-scene frames draw on. Note the
  night scene does NOT use the plate/cutout split: D18 generates a whole
  frame per action, because the subject is the act, not the room. Its
  `CUTOUT_POSES` table also has no reclining pose, and a lying figure is the
  worst case for the cutout matte (body and sheets interpenetrate) — don't
  reach for cutouts here without proving that first.
- `src/src/ref/complete/avatars-and-sprite-studio-plan.md` — the per-character
  headshot avatar pipeline. It was the candidate source for a "real face on
  the pillow" identity trick (old Q4); that idea was **rejected** and the UI
  session did not revive it. Kept only as the reference for why `kv.sprites`
  refuses generated pixels — which is why any future "pin this frame" feature
  must store a prompt + seed, never a blob (the `takePhoto` precedent).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session.

**The reusable per-phase prompt is
[`night-scene-handoff-prompt.md`](night-scene-handoff-prompt.md)** — hand it
verbatim to a fresh session and it will find its own phase.
[`night-scene-ui-design-prompt.md`](night-scene-ui-design-prompt.md) is the
one-shot prompt that ran the UI design session on 2026-09-04; it is **spent**
and kept only as a record of what that session was asked to do.

**Mockups for the locked UI (D15–D38):**
https://claude.ai/code/artifact/759d6f8f-ee83-478c-8a62-0c0f19e3c19a — page 1
is the chosen Living Tableau at desktop and both phone states, plus the
vocabulary options sheet; page 2 keeps the five unchosen approaches and is
deliberately stale on vocabulary. **The sources live in the repo** at
[`night-scene-ui-mockups/`](night-scene-ui-mockups/) — read that folder's
README before copying anything out of them, because every colour in them is a
hardcoded hex and this game has 14 themes.

---

## Handoff — read this first

**All seven phases are complete. There is no next phase.** Phase 7 landed
2026-09-05 and closed D34's clothing axis — the third tracked piece Phase 3a
dropped and nobody noticed for six phases, found the same day Phase 6 closed by
the user playing it and going looking for the undress control. `verify-night-p7.js`
is **67/67**; p1 **117/117**, p2 **26/26**, p3 **103/103**, p4 **120/120**,
p5 **103/103**, p6 **127/127** — **663/663 across the seven**. A full
`run-all.js` went from **4768 passed / 83 failed / 9 errored** to **4838 / 83 /
9**; the +70 is p7's 67 plus three assertions added to p1 and p4 where Phase 7
changed what was true. The failures are all pre-existing and in files this plan
never touches. Measure against that pair, not against zero.

**Still outstanding, and neither is code:** Q5's live balance verdict (the plan
makes the user's own play the acceptance test) and Q3's parked skill axis.

**What Phase 7 built.**

- **`clothing` on the session record**, over the SAME vocabulary as the evidence
  tags — the tag IS the garment, which is what let Cleanup keep working with no
  change and stops the two halves naming one thing two ways.
  `BOUNDARY.nightScene.garments` declares `zones`, a `layer` and the Move edge
  that displaces each; `garmentSets` maps the sim's own `npc.clothing` onto a
  starting set. Read ONCE at `openNightScene` (`nightOpeningGarments`) and
  frozen — the scene must never re-read `npc.clothing`, because sim.js pins a
  sleeper to `'sleepwear'` and would overwrite the scene's own work on the next
  tick. Migration: none needed. `sweepStaleNightScenes` closes every open record
  on load, so a record without `clothing` can never reach play, and every reader
  guards with `|| {}` anyway.
- **The gate is by ZONE, not by tag** (`nightPartZones` / `nightGarmentsBlocking`
  / `nightGarmentAvailable` / `nightPartReachable`). A part's zone is DERIVED
  from the garments its own `evidence` list names, which is why this axis landed
  with **zero per-part churn**: the tag a part leaves behind was already the
  record of what had been in its way. Two things fall out of that and are worth
  knowing before you touch it:
  - **Her ass names only `bottoms`, but her panties cover the same zone, so both
    have to move.** The gate is physical rather than bookkeeping.
  - **A towel works with no special case.** `breast` names `shirt`, a towel
    session has no shirt, and the towel covers `top` — so the towel is what is
    in the way, and opening it clears both halves of her at once.
- **Layering.** Panties are layer 1 in the `bottom` zone and bottoms are layer 0,
  so the bottoms come down first. The tray teaches the order by only ever
  offering what is next, and the resolver refuses the inner one outright rather
  than relying on the tray to hide it.
- **Clothing deliberately does NOT join `nightExposure`'s scalar.** That is a
  considered deviation from the phase brief, which said to fold it in. Pose and
  covers are one 0–2 ladder and meet in a `min`; a garment is in the way of a
  ZONE, and collapsing "her shirt is up" and "her bottoms are down" into one
  number would make either one unlock the other. It is a separate predicate
  checked alongside the ladder.
- **Cleanup RESTORES** (`part.restores`). Straightening her panties puts them
  back ON as well as clearing the tag, which closes off everything they cover.
  That makes Cleanup a real mid-scene decision instead of free tidying: you do it
  at the end, or you do it twice. Both directions cost wakefulness and permanent
  Stirring.
- **The image key's clothing half comes off the RECORD** (`nightClothingToken`,
  carried on `nightFrameAxes` as `clothingToken`). It used to read
  `npc.clothing`, which the sim never changes during a session, so **every frame
  of an entire session keyed identically however far the scene had gone** — the
  picture could not show what had happened. `nightClothingClause` feeds the
  PROMPT from the same state, so the key and the prompt can never disagree.
- **Legibility: a region she HAS but that is closed now says so.**
  `nightPalette` returns `blockedRegions` beside `regions`, each naming the next
  thing in the way (`prose.blocked`), and the painter draws them dim and inert.
  This is the fix for what the user actually hit: penetration needs pose
  `back_parted` AND the covers fully off AND both bottom-zone garments moved,
  and until all of that was done the Pussy tab did not exist to hint at it.
  **This is not a walk-back of D31.** D31 says an impossible ACTION is
  unreachable rather than refused; a whole region silently absent is not that —
  it is the game hiding that she has a part of her body. A blocked region is
  never in `palette.regions`, so nothing that walks the tray can land on one.

**Also fixed, found while answering the same question:** `inside`'s `standalone`
was `'inside her'`, a prepositional phrase, which composed to **"You slide into
inside her."** / "You thrust into inside her." / "You curl inside inside her."
against five of the seven motions its `cock` row accepts — i.e. against
penetration, the most important action in the game. Changed to the noun phrase
`'her cunt'`. **`verify-night-p6.js` section 18** is the guard: it walks every
part × motion the tables can compose and fails on any doubled preposition.
`inside` was the only collision in the whole grammar.

**The assertion that would have caught the original gap, and now exists.**
`verify-night-p7.js` section 2 asserts the SYMMETRY directly: every garment has
a Move part that displaces it AND a Cleanup part that restores it, nothing
restores a garment that does not exist, every garment id is an evidence tag, and
every displacing motion leaves the tag its garment names. The tell for six
phases was that Cleanup could put clothes back that nothing had ever taken off;
that shape is now a test failure.

**Three harnesses changed because Phase 7 changed what was true — none were
loosened.**

1. **p1's record fixture** gained a `clothing` map (fully displaced, so a grammar
   sweep tests the grammar and not the new gate), and its D31 sweep now sets up a
   clothing state per action the way it already sets up pose and covers.
   Section 14 gained two assertions: putting her panties back closes off what
   they cover, and pulling them aside again re-leaves the tag. **115 → 117.**
2. **p4's `__axes` fixture** gained the two new key fields (order matters — it is
   compared byte-for-byte against `nightFrameAxes`). Its "a different clothing
   state is a different picture" check was REPLACED, because its premise is now
   wrong: the assertion is that `npc.clothing` no longer moves the key and the
   session record's state does. **119 → 120.**
3. **p6** gained section 18 (the preposition guard). **124 → 127.**

**Found and deliberately NOT fixed:**

- **A part that names no garment is never clothing-gated, by design.** Her ribs
  stay reachable through a shirt and her legs through her bottoms, because the
  authored data says touching them displaces nothing. That is the zone
  derivation working rather than leaking, and p7 asserts it on purpose — but it
  means "fully dressed" is not the same as "nothing reachable", and a future
  session adding a part must decide its `evidence` list knowing that is also its
  clothing gate.
- **`front` yields no pussy parts at any exposure.** Her ass region reaches
  `front` and her pussy region does not, so face-down is back-only. May well be
  intended; nobody has ruled on it.
- **The 83 pre-existing `run-all` failures and 9 errored harnesses.** Untouched.

**Verified by hand** (`dev-harness.html`, sandbox, a resident promoted to
resident-asleep in her own bedroom, `sleepwear`). From the opening state the tray
reported **"Tits — The covers are in the way." / "Belly — The covers are in the
way." / "Pussy — Not from the way she is lying." / "Ass — The covers are in the
way."** Drawing the sheet back cleared two of those; the Ass hint then walked
**"Her bottoms first." → "Her panties first." →** open, with the Move tray
offering exactly the next garment each time and dropping each as it was done.
Narration: *"You pull her panties aside steadily. … Her panties are pulled
aside."* Rolling her onto her back and parting her thighs left the tray with no
blocked regions at all and the Pussy tab offering **Mound · Lips · Clit ·
Entrance · Inside**, with Inside accepting **fingers · tongue · cock** and the
motion row reading **Dip · Slide in · Grind · Pump · Straddle · Thrust · Ride**.
The prose fix landed: *"You are sliding into her cunt barely touching her."*
She woke on it — a cold-tier stranger at heat 0 taking a 78-intensity action is a
full D27 overshoot, which is the mechanic working, and the point is that the
player can now SEE the whole path rather than not knowing it exists. Re-entry was
then correctly refused with `cold_shoulder` (Phase 5's consequence layer). Phone
at 390×844: no horizontal overflow, no control under 44px.

**Blockers: none.**

---

## Phase 7's brief — D34's clothing axis (CLOSED 2026-09-05, same day it was found)

**Kept as the record of what was wrong and what was decided, because the ruling
in point 5 is the user's and the diagnosis explains a design that would
otherwise look arbitrary. What SHIPPED is in the Handoff at the top.**

**The player had no way to undress the target.** Raised by the user immediately
after Phase 6 closed: they went looking for the control and there wasn't one.

**D34 names THREE tracked pieces** — "**pose** …, **covers** (covered / turned
back / off), and **clothing** (per garment, the existing evidence tags)".
Phase 3a built `pose` and `covers` and silently dropped the third. Every phase
since, Phase 6 included, built on a two-axis exposure model without noticing the
decision listed three.

**What that looks like in the code:**

- `nightExposure(record)` (boundary.js) is `min(poses[pose].exposure,
  covers[covers].exposure)`. There is no clothing term, and the session record
  has no clothing field.
- A covered part is unlocked by pose + bedsheet alone. Touching it then
  IMPLICITLY displaces the garment and writes an evidence tag (`shirt`,
  `panties`, `bottoms`) — the garment was never a thing the player moved, only
  a thing that turns out to have been moved.
- **The tell:** the Cleanup region has "Straighten her panties", "Pull her
  bottoms back up", "Fix her shirt" — an UNDO for an action that does not
  exist. You can put her clothes back and you can never take them off.
- **It reaches the imagery too.** `nightFrameStateToken` (image.js) is
  `` `${pose}_${covers}_${target.clothing || 'sleepwear'}` ``, reading
  `npc.clothing`, which sim.js pins to `'sleepwear'` while she is asleep and the
  night scene never writes. So every frame of an entire session generates as
  "sleepwear" however far the scene has gone — the picture cannot show it
  either.

**What closing it needed** (a new phase, NOT a patch inside Phase 6 — it touches
the record shape, the exposure gate, the Move tray and the image key at once).
Every point below landed, with ONE deliberate deviation, argued in the Handoff:
point 3 says fold the garment into `nightExposure`, and it is a separate
predicate instead, because a garment is in the way of a ZONE and collapsing two
garments into one scalar would make either one unlock the other.

1. `clothing` on the session record — per-garment state over the SAME tag
   vocabulary the evidence list already uses (`shirt` / `bottoms` / `panties`),
   so Cleanup keeps working unchanged and the two halves finally name one thing.
   Needs a load-time default, like `pose`/`covers` have.
2. Garment parts in the **Move** region, mirroring the three Cleanup parts —
   the symmetric "do" for each existing "undo", on the same wake/stir formula.
   Displacing a garment is exactly where the evidence tag SHOULD be written,
   instead of arriving as a side effect of a touch.
3. `nightExposure` folds the relevant garment in, so `minExposure` reads all
   three axes. Watch the interaction with pose/covers: the current gate is a
   `min`, and three-way it should probably stay one.
4. `nightFrameStateToken` reads the RECORD's clothing rather than
   `npc.clothing`. This changes the image key, so previously cached frames stop
   being addressed — acceptable, since D37 frames are session-local anyway.
5. **A target who is already nude starts exposed. RULED BY THE USER
   2026-09-05.** No clothing state, no garment parts in Move, and — the part
   that matters — **no redressing entries in Cleanup**, because there is
   nothing to put back. The only thing still between you and her is the sheet.
   That makes the clothing axis genuinely OPTIONAL per session rather than
   assumed, which the current code gets wrong in both directions at once: it
   assumes garments exist however the sim has her dressed, and it offers
   "Straighten her panties" to a woman who is not wearing any. Read her real
   state (`npc.clothing` — the sim pins `'sleepwear'` while asleep, but
   `'nude'` and `'towel'` both occur) when the session OPENS, and freeze it on
   the record; the scene must not re-read it mid-session, because it is the
   scene's job to change it from there.
6. `verify-night-p1/p3` assert the pose+covers gate; they will need the third
   axis, and the new harness should assert the symmetry directly — **every
   Cleanup part offered has a Move part that produces the tag it clears, and a
   nude target is offered neither.** That is the assertion whose absence let
   this survive six phases.

### Two more findings from the same play session (2026-09-05)

**A. Penetration IS reachable, but nothing tells you how — Phase 7 should fix
the legibility, not the gate.** The control exists: **Pussy ▸ Inside ▸ Cock ▸
Slide in**. It is gated on a CONJUNCTION the tray never states — `inside` and
`entrance` carry `reach: ['back_parted']` (overriding the region's own reach)
AND `minExposure: 2`, and `nightExposure` is a `min`, so the covers must be
fully `off` rather than merely `turned_back`. Net effect: **exactly one pose
node in the whole graph reaches penetration**, and getting there from a typical
opening (`side_away` / `covered`) is a five-action Move sequence — turn toward,
roll to back, draw the sheet back, pull it off, part her thighs. Measured cost
of that route at stealth 0 against a neutral tier: **wakefulness 60.3, stirring
21.1 before you have touched her at all**, and a `steady` `slide_in` from there
took wakefulness straight to 100 (D27 overshoot) and stirring to 88.6 — an
instant forced wake. The mechanics are arguably right (you are meant to build
heat and approach gently), but the player is given no way to READ any of it:
an unreachable part is simply absent, which D31 chose deliberately and which
here means the most important action in the game is invisible until five
correct moves have already been made. Note also that `front` yields no pussy
parts at all at any exposure, which may or may not be intended.

**B. FIXED 2026-09-05 — the penetration lines were ungrammatical.** `inside`'s
`standalone` was `'inside her'`, a PREPOSITIONAL phrase. It reads correctly
alone, and composes to **"You slide into inside her."**, "You thrust into
inside her.", "You curl inside inside her.", "You dip into inside her.", "You
grind against inside her." — five of the seven motions its `cock` row accepts,
including both penetration verbs. Changed to the noun phrase `'her cunt'`,
which composes correctly against every motion in its `acc` table and matches
the register D33 locked (`genitalInstruments.vagina.standalone` is already
`'your cunt'`; swap the word if you want a different one, it is one line).
**`verify-night-p6.js` section 18 is the guard** — it walks every part ×
motion the tables can compose and fails on any doubled preposition, and
asserts no part label is a prepositional phrase at all. p6 is now **127/127**.

---

## The thesis

Sleeping-NPC intimacy is currently a coin flip with three faces: one roll
decides wake-vs-uncaught, and a static read of attraction/deviancy decides
hostile-vs-receptive. There is no player agency between the click and the
verdict, so it never feels like a game — it feels like a lottery with
narrative dressing.

The user's pitch replaces the roll with a **rising-pressure free-play scene**:
an open palette of body zones, each a choice with a detection cost and a heat
gain; a quell action to rebalance current risk; a permanent, rising floor
under that risk that nothing can undo; a genuine choice at the end between a
risky-but-thorough Cleanup and a fast, dirty Bail; and real endings decided by
skill and choices, not a die roll. It converts a binary verdict into a
resource-management game — the same design move the sim already makes
elsewhere (peek's risk/caught loop, the ActionWindow's tiered outcomes) — and
it makes *skill* the honest currency of "retroactive consent" for
non-receptive NPCs.

### What this plan is *not*
- **Not a ladder.** No fixed progression of stages you must climb with a
  high-enough skill check. The player picks zones freely, in any order, from
  an open palette; the *budget* (detection/floor) is the pressure, not a
  sequence.
- **Not a relaxation of the willingness gate's hard `'asleep'` floor.** Like
  Phase 17 and D30 before it, this routes sleeping targets through
  `boundary.js`'s carve-out. The floor stays hardened; nothing here opens a
  second, lighter door (invariant 1).
- **Not a second intimacy skill tree.** D3 keeps it to stealth + game
  knowledge. A "somnophilia/seduction" axis is explicitly parked (Q3), not
  built.
- **Not blocked on image generation, whatever the eventual UI turns out to
  be.** No mechanic ever waits on a generation to resolve. How image-heavy
  the UI ends up (an open question for the dedicated design session) doesn't
  change that — it just changes how much staging gets generated, not
  whether the game logic can proceed without it.
- **Not an LLM-decided game.** The model narrates each touch beautifully but
  never decides a meter delta, a wake threshold, or an ending (invariant 2).

## Evidence (for the *problem*, not the *plan* — old mechanism)

The current sleeping-room interaction is one-shot:
- `resolveAffectionSleepAttempt` (boundary.js) — wake roll against
  `BOUNDARY.affectionLadder.wakeChanceByRisk`, then receptive-vs-hostile is
  `willingnessAttraction × 0.6 + npcDeviancy × 0.4` against a seeded noise
  draw. `applyAffectionSleepAttempt` applies exactly one outcome.
- `resolveBoundaryCatch` (boundary.js) — the `sleep_with` analogue: wake roll
  against `BOUNDARY.sleepRoom.wakeChanceByDynamic`, then warm-tier re-gates
  through `resolveBoundaryAwakeGate`, every other tier shames.

In both, the player's only decision is *which act*, made before any roll. The
user's words: "The sleep interactions do not feel satisfying at all yet." The
fix is agency + pacing + multiple endings, not a bigger roll.

## Locked decisions

### The core mechanic
- **D1 — Free play over an open zone palette, not a ladder.** The player
  chooses what to stimulate and in what order from a full body-zone palette
  (face, mouth, chest, stomach, pussy, thighs, inner thighs, calves, feet,
  butt, and penis for a male target). No fixed sequence, no "must clear stage
  N" structure. The strategy emerges from the *budget*, not from a path.
- **D2 — REVISED. Two tracked numbers, not three: Detection (current,
  quellable) with a permanent rising Floor underneath it, and an independent
  Heat.**
  - **Detection** = current restlessness, 0–100. Quellable, but never below
    the current Floor. Hitting 100 is an **instant wake**.
  - **Floor** = "Stirring," reframed. Not its own bar — a permanent minimum
    under Detection. Rises a little every time Detection rises (see the
    formula below), never falls, and Quell cannot touch it. If the Floor
    itself reaches 100, Detection is pinned at 100 too — that's the same
    event as an instant wake, not a separate check.
  - **Heat** = how into it she is, 0–100. Fully independent of Detection and
    Floor — no feedback either direction (D7 is gone). Pure upside: it's
    the tiebreak read whenever Detection forces a wake (D6), and maxing it
    on its own terms triggers its own positive beat, never a punishment.
  - **The formula (illustrative, real curve is Phase 6/Q5 tuning):**
    ```
    detectionGain = zoneDelta(seeded) × tierRiskMult × skillMult(skill)
    floorGain     = detectionGain × stirringRate(skill)
    ```
    Both `skillMult` and `stirringRate` shrink toward a near-zero floor as
    skill rises — a **doubled** skill benefit specifically on the Floor,
    by design: a maxed-stealth player's Floor should barely move at all.
    "Free play" is the explicit goal at max skill — raw Detection can still
    spike if you're careless, but the risk *game* should feel trivial, not
    just cheaper.
- **D3 — Skill is stealth + game knowledge, and nothing else (for now).**
  The `stealthSuccess` curve (skills.js) drives both `skillMult` and
  `stirringRate` above; the rest is learned game knowledge — which zones are
  risky on which tier of sleeper, when to quell, when to bail vs. clean up.
  A separate "somnophilia/seduction" skill is parked (Q3): the user can hear
  the argument (a *persuader* build that converts strangers via heat vs. a
  *ghost* build that never wakes anyone) but doesn't yet see the vision.

### Endings and consequences
- **D4 — Waking is NOT the endgame.** With sufficient skill a full session —
  anal, vaginal, oral, orgasm anywhere — can complete **without ever waking
  her**. **Amended by D22:** that is a *description of a good run*, not an
  ending the game names. There is no Ghost ending and no Bail ending — the
  session simply ends, and what it cost is decided by the evidence left
  behind (D25).
- **D5 — REVISED. The suspicion rollover now has a mechanical hook: it
  scales with leftover evidence.** On the next day rollover, a completed
  session can roll a small chance she suspects / figures it out later,
  weighted by however much evidence (D12) was left uncleaned at session end.
  An empty evidence array rolls at or near zero; an exit with evidence left
  behind rolls meaningfully higher. Exact curve is open (Q2/Phase 6) — the
  *shape* (evidence-weighted, not depth-weighted) is now locked.
  **Amended by D25:** the roll itself is not this plan's to own. Evidence
  feeds the game's existing stealth machinery (`LEAVE_EVIDENCE`,
  `ADJUST_SUSPICION`, `stealth.js`'s suspicion windows), so the NPC's later
  inference runs through the same channel as every other stealth consequence
  rather than a private `BOUNDARY.nightScene.suspicion` roll.
  **LANDED 2026-09-05 (Phase 5).** The evidence-weighting lives in the
  LEAVE_EVIDENCE **strength**, because strength is exactly the term
  `sim.js`'s discovery scan weights its per-tick chance by
  (`STEALTH_TUNING.evidenceStrengthDiscoveryFactor`) — so D5's locked shape is
  expressed in the shared system's own units rather than as a second curve.
  `BOUNDARY.nightScene.exit` holds the knobs; `resolveNightSceneConsequence` /
  `applyNightEvidenceHandoff` (boundary.js) are the code. A clean exit writes
  no record at all, which is "rolls at or near zero" exactly.
- **D6 — Skill is the key to "retroactive consent" on non-receptive NPCs.**
  For an NPC who would otherwise refuse (cold tier, low attraction), high
  skill + good play can still build enough Heat that if Detection forces a
  wake, she wakes *willing* instead of hostile. Retroactive consent is
  *earned*, never rolled for free. This is the **only** place Heat and
  Detection interact — a read at the moment of a forced wake, never a
  running feedback loop.
- **D7 — DELETED.** Was: "heat gain feeds back into detection." Removed this
  session — it taxed pursuing Heat with extra risk, which contradicts Heat
  being a pure, never-punishing win track. The "go slow unless skilled"
  tension the deleted mechanic was meant to create already exists directly
  in the zone table's own detection costs; no feedback loop was needed.
  Left as a tombstone entry so the numbering stays stable and greppable.

### The tension / rebalance / cleanup / bail mechanics
- **D8 — SUPERSEDED by D17 and D24.** Was: "Quell is the balance mechanism"
  — a dedicated Quell action draining current Detection toward the Floor at a
  time-only cost. Two things killed it. First, the time cost was incoherent
  against invariant 6's "the world is paused" clause: a free cost made Quell
  spam strictly optimal. D24 settles the clock question (the scene runs live)
  and D17 deletes the action outright — quelling is now what *certain actions
  cause*, never a button. Tombstone kept so the numbering stays greppable.
- **D9 — SUPERSEDED by D16.** Was: "buttons in a tray, grouped by category
  (lull / stimulate / intimate)." Reopened at the user's request after the
  first design session and replaced by the composed four-slot action grammar.
- **D10 — SUPERSEDED by D15.** Was: "diegetic staging + objective bars."
  Replaced by the Living Tableau, chosen from six approaches.
- **D11 — SUPERSEDED by D18.** Was: "one cached plate, everything else CSS."
  Replaced by one frame per (state × action) — imagery exists to show what you
  are *doing*, not to show where you are.
- **D12 — REVISED by D22. Cleanup is its own tray category and a real risky
  action set.** That much stands, and it keeps its own tab in D15's tray. What
  D22 removes is the second half of this decision — Cleanup is no longer "the
  only path to a true Ghost ending", because there is no Ghost ending. It is
  now the only thing that changes what an exit *costs*. Certain touches leave
  "evidence"
  tags (displaced panties/bottoms/shirt, mussed sheets, fluids). Cleanup
  actions each clear one evidence tag, at their own detection/floor cost on
  the same formula as a touch (illustrative costs in the data model below).
  ~~Bail explicitly skips this — it's a drop-everything-and-run exit, and
  whatever evidence exists when you bail stays, feeding D5's suspicion
  rollover at a higher weight. A session therefore ends one of three ways:
  Ghost (voluntary end, evidence fully cleared), Bail (voluntary end,
  evidence left as-is), or a forced wake.~~ **Struck by D22:** there is one
  voluntary exit (`Leave`), not two, and it has no name of its own — the exit
  is always valid and the evidence left behind is the only thing that varies.
  A forced wake (Wakefulness hits 100, Heat decides willing vs. hostile per
  D6) remains a distinct resolution, because she is awake at the end of it.
- **D13 — NEW (resolves old Q1). Entry is a dedicated action chip, not the
  chat ask path.** The Night Scene opens from an action chip that appears
  when the player is physically in a room with a sleeping, eligible NPC.
  Chat's `$RequestIntimacy` sleeping branch (D30) is no longer this
  feature's in-room front door; whatever it still covers is out of this
  plan's scope.
  **LANDED 2026-09-05 (Phase 6).** `boundary.night_scene` (`defs.actions.js`),
  first in `bed.interact`'s submenu, `source: { kind: 'paired' }` so it is never
  a flat chip and no action-pipeline fields so it never reaches `executeAction`.
  `render.js`'s bed block DROPS the row unless `resolveNightSceneGate` allows
  it — an ineligible target gets no chip rather than a chip that refuses — and
  `ui.js` intercepts it before the registered-action bridge and calls
  `startNightScene`, deliberately not `openActionWindow` (which would pause
  D24's clock). **`boundary.sleep_with` / `boundary.sleep_watch` were kept**:
  they are 30-minute "get into bed beside them" / "watch them" verbs with their
  own mechanism, not lighter versions of this scene, and D13 only names the
  chat-ask path as replaced.
- **D14 — NEW. `heatWake` is deleted; Heat has no wake trigger of its own.**
  Heat is read only (a) as the tiebreak at the instant a Detection-forced
  wake happens (D6), and (b) as the trigger for its own separate, purely
  positive "climax" beat when it maxes on its own terms — a narration/
  staging event, not an ending. Whether a session can have more than one
  climax beat, and whether Heat resets or keeps climbing afterward, is an
  open Phase 1 implementation detail, not yet decided.

## UI and the design passes — locked (D15–D38)

Decided in the UI design session of 2026-09-04, from a clean-slate pass over
six approaches drawn at both widths, plus the second pass later that day that
added Intensity Acceleration Resistance and per-NPC preferences (D27–D31, at
the end of this section). **D9, D10 and D11 are superseded** — by D16, D15 and
D18 respectively; they stay in "Locked decisions" above as tombstones so the
numbering never shifts. Mockups (page 1 = the chosen direction plus the
vocabulary options; page 2 = the five unchosen approaches, stale on
vocabulary): https://claude.ai/code/artifact/759d6f8f-ee83-478c-8a62-0c0f19e3c19a

### The presentation

- **D15 — The Night Scene is a Living Tableau. (Supersedes D10.)** One
  persistent generated frame is the scene, not an illustration beside it. Over
  it: a two-bar strip at the top (Wakefulness with the Stirring band inside it,
  Heat separate), and beneath it a frosted panel — the `.aw-stage` chrome's
  visual language — carrying the narration line and the whole action tray. The
  same anatomy at both widths; mobile is not a reduced desktop. It is the sim's
  third overlay, and it renders as one more `data-body` branch on
  `#action-window-overlay` (`renderActionWindow` already switches on
  `spec.body` for `picker` / `wardrobe` / `dream`; `#night-content` is a
  sibling of `#peek-content`).
  - **Desktop:** bars, then the frame, then the panel, all centred in a column.
  - **Phone, collapsed (the default):** the frame IS the screen; the narration
    sits in a scrim over its lower edge; a compact bar shows the current action,
    the Pace control, **Again**, **Change…** and **Leave**.
  - **Phone, tray open:** **Change…** raises the full tray as a sheet over a
    dimmed frame. Every control is ≥44px.

- **D26 — The player-facing vocabulary is Wakefulness / Stirring / Heat.**
  "Detection" and "Floor" are internal words and were never good ones.
  Wakefulness is the current, drainable number; Stirring is the permanent
  minimum drawn as a deeper band inside the same bar, never a second bar; Heat
  is its own bar and is never coloured or worded as a danger. The record's
  field names (`detection`, `floor`, `heat`) are NOT renamed by this decision —
  see Open questions.

### The input model

- **D16 — Input is a four-slot composed action grammar plus one Pace control.
  (Supersedes D9's flat tray of zone buttons.)** The design goal is deep
  granularity without a wall of buttons: never "Touch chest", always *what part,
  which side, with what, doing what, how hard*.
  1. **Part** — a region tab (Head · Chest · Belly · Between her legs · Ass ·
     Legs · Feet · Back, plus **Cleanup** as its own tab) then a part chip
     within it (e.g. Chest → breast / nipple / areola / between them / ribs).
     Roughly 5–9 parts per region, so the screen never shows more than ~9.
  2. **Side** — left / right / both. Inline, and shown ONLY for paired parts.
  3. **Instrument** — fingertip · fingers · palm · knuckle · lips · tongue ·
     cock · body (items later, see the parked item economy). Shown only when
     more than one is valid for the selected part.
  4. **Motion** — *the trigger.* Tapping a motion fires the action. Valid set
     is derived from (part × instrument): trace, rub, circle, press, tap,
     squeeze, knead, pinch, roll, tug, spread, kiss, lick, flick, suck, dip,
     curl, thrust…
  - **Pace — Gently · Steady · Firmly** — a persistent three-position control
    that applies to whatever is fired. It pushes wakefulness and heat in
    opposite directions and is the cheapest possible source of real granularity:
    three buttons that modulate every action in the game.
    - **Amended by Phase 3a (2026-09-04): that opposition is EMERGENT, not a
      raw multiplier pair.** `firm` raises both raw numbers; what makes the
      signs diverge is D27 — a firm touch on a cold NPC overshoots her window
      and the heat comes back negative while the wakefulness cost goes up.
      Implementing it as a literal opposed pair would have made `firm` a
      strictly worse `gentle` and deleted the reason to ever pick it. The
      harness asserts the emergent version (verify-night-p1.js, section 8).
  - **Selection persists.** Repeating an action is one tap on the same motion
    (or **Again** on phone). Depth is paid once, not per action.
  - The action id is `part.side.instrument.motion.pace`, e.g.
    `breast.both.palm.squeeze.firm`, `hair.-.fingertips.stroke.gentle`.
  - The old `category: lull|stimulate|intimate` field is **derived, not
    authored** — grouping is anatomical, which is self-explanatory and needs no
    legend. Cleanup remains its own tab because it is a different kind of thing.
  - Phase 3 must filter the part palette by target sex from data, not from a
    hardcoded UI check.

- **D17 — Quell is deleted as an action; soothing is emergent. (Revises D8.)**
  There is no Quell button, because quelling is not a thing you do — it is what
  certain things you do happen to cause. A soothing action is a soothing-capable
  part (hair, scalp, forehead, temple, nape, shoulders, back, arm) × a calming
  motion (stroke, trace, rest, breathe on) × `gentle` pace. Every action now
  returns three deltas and soothing is simply the subset where the first is
  negative:
  - `wakeDelta` — may be negative (that IS the soothe).
  - `stirDelta` — **always ≥ 0, including on a soothe.** This is the anti-spam
    rule: soothing buys back current wakefulness at a permanent cost, so
    soothe-forever is not a strategy.
  - `heatDelta` — **slightly negative on a soothe.** Calming her down cools her
    down. The drain must stay small enough that pursuing heat still wins
    outright, or the game defeats its own forward motion.
  - Illustrative only, Phase 6 tunes: soothe = wake −6…−10, stir +0.5…+1.5,
    heat −1. Gentle intimate = wake +5, stir +1, heat +4. Firm intimate =
    wake +14, stir +3, heat +9. Two soothes undo one firm touch and cost ~2
    permanent stirring and ~2 heat; one intimate touch covers nine soothes.
  - `nightStepQuell` is removed. `nightStepTouch` and `nightStepCleanup`
    converge on one resolver over the composed action id.

- **D24 — The scene runs LIVE at one game-second per real second. (Resolves the
  D8 / invariant-6 contradiction.)** The clock is not paused. The night scene
  pushes a time context whose `TIME_DILATION.scales` value is `1` — the same
  scale `conversation` already uses. The session loop READS the clock and never
  advances it (single clock owner, TIME's file header), exactly as `peek.js`
  does. A paused world would have made every time cost free and soothing
  strictly optimal; this is why D8's "time only" cost was incoherent as written.
  Invariant 6's "while it runs the world is paused" clause is **wrong** and is
  corrected in the invariants below.

### Imagery

- **D18 — One frame per (state × ACTION), not per state. (Supersedes D11's "one
  cached plate".)** The point of imagery here is seeing **what you are doing**,
  not seeing the character. The player wants to see the act they chose, so the
  frame changes on every click that names a different action, and repeating an
  action in an unchanged state re-shows the cached frame. There is **no
  per-session and no per-day generation budget** — the cache is the only gate.
  - The **image key is a coarser projection of the action id than the mechanics
    key**: `state × part × side × instrument × motion`, **dropping pace**.
    Gently and firmly squeezing the same breast is the same picture. This is
    what makes the key space affordable (order 400 per state rather than
    thousands).
  - Both keys still fold what every key in `image.js` folds:
    `IMAGE_PROMPT_VERSION`, the identity tokens, the clothing/stage state, the
    intimate gate and the active image style.

- **D19 — Frames are aspect-locked to the image and are NEVER cropped.** The
  frame's `aspect-ratio` equals the generated image's, so `object-fit: contain`
  produces neither a crop nor a letterbox — the box *is* the picture's shape.
  `object-fit: cover` is banned on this surface. `generateImage` accepts only
  `512x512`, `512x768`, `768x512`, `768x768`, so resolution is chosen from the
  space actually available and then the frame is locked to it:

  | Available box aspect | Generate | Frame caps |
  |---|---|---|
  | taller than ~0.85 (phone portrait) | `512x768` | max-width 640 |
  | ~0.85 to ~1.2 (tablet, square window) | `768x768` | max-width 900 |
  | wider than ~1.2 (desktop) | `768x512` | max-width 1024, max-height 512 |

  Upscaling is accepted, absurd upscaling is not. On a 1440×900 desktop the
  height cap binds and the tableau lands near 720×480 — essentially native
  pixels. On a very wide monitor the 1024 cap binds at 1.33×, and the surplus
  width becomes dark ground, a vignette and a hairline frame — elegant framing,
  never stretch. ~~`sceneOrientation()` currently returns two values and must
  grow a third.~~
  - **AMENDED by Phase 4 (2026-09-04): `sceneOrientation()` stays at TWO
    values, and the three-way classifier is its own function
    (`nightFrameShape` / `nightFrameShapeFor` / `nightFrameBoxAspect`,
    image.js).** Growing the shared one would have changed nineteen call sites
    at once: `IMAGE_CACHE.resolutions.scene` has no `square` entry, so every
    plate, dream panel and outcome frame on a near-square window would have
    asked `generateImage` for `undefined`; each `=== 'landscape'` framing
    branch would have fallen through to its portrait wording on a square
    window; and every scene key composed on such a window would have turned
    over at once — the eviction storm Q9 and D37 exist to avoid. The night
    frame is the only surface that wants a square box. `verify-night-p4.js`
    section 1 asserts sceneOrientation still returns exactly two values across
    five viewports, so a later session that "finishes the job" fails a test.
  - **Also amended: the caps are applied through the WIDTH, not as a
    `max-height`.** `aspect-ratio` + an explicit width + a `max-height` is
    over-constrained CSS: the height cap wins and the box stops being the
    picture's shape, which letterboxes the image inside it — exactly what this
    decision forbids. The first Phase 4 layout pass drew the landscape frame at
    1024×512 (2:1) around a 3:2 image. The fix converts the height budget
    through the aspect (`width: min(1024px, 100%, calc(var(--night-frame-h) *
    3 / 2))`), leaving ONE constraint on the box, so the aspect always holds.
    Measured on a 1440×900 desktop: **768×512, ratio exactly 1.500** — native
    pixels. On a 390×844 phone: **358×537, ratio exactly 0.667**, generating
    512×768.

- **D20 — At most 8 generations in flight, with speculative prefetch.**
  `generateImageTracked` counts in-flight generations but does not gate them; it
  gains a semaphore at 8. Against that budget, selecting a part and an
  instrument speculatively generates the frames for the motion chips currently
  on screen, so the common click is a cache hit. This is how D18's per-action
  cadence coexists with invariant 3: **no mechanic ever waits on a generation** —
  a tap resolves instantly against the pure resolver, and the frame arrives when
  it arrives, behind the shimmer the ActionWindow already uses.

- **D21 — Bad-generation protection is the shared ⓘ / reroll affordance,
  writing back to the same cache key.** No new mechanism is needed: register the
  frame with `setImageMeta(img, {label, prompt, seed, negativePrompt, reroll})`
  (`ui.js`) and the existing floating ⓘ opens `openImageInfo` — editable prompt,
  seed and negative prompt, with Regenerate. The reroll **overwrites the same
  cache key** (as `rerollActionWindow` already does), so a frame the player
  rejected is gone and never shown again. There is no approve-before-commit
  gate: nothing may stand between a tap and its outcome.

### Endings, XP and evidence

- **D22 — "Ghost" is a description, not a game state. (Revises D4, D5 and
  D12.)** There is no Ghost ending and no Bail ending. Every exit from a session
  is a valid exit; the only question a session answers on the way out is **what
  evidence was left behind**, and the world handles that consequence. This
  collapses the two exit buttons into **one `Leave`**, with a confirmation naming
  the outstanding evidence when there is any ("you'll leave two things behind").
  `resolveNightSceneOutcome`'s `'ghost'` / `'bail'` return values go away; a
  forced wake (`wake_willing` / `wake_hostile`) is still a distinct resolution
  because she is awake at the end of it. Cleanup keeps its own tab and stays a
  real risky action — it is now the only thing that changes the exit's
  consequences, rather than the thing that unlocks a named ending.

- **D25 — Evidence routes through the existing stealth system, not a bespoke
  roll. (Revises D5.)** The codebase already models this: `LEAVE_EVIDENCE`
  (`obj.evidence = {kind, strength, day, discovered}`), `WITNESS`,
  `ADJUST_SUSPICION`, and `stealth.js`'s `openSuspicionWindow` /
  `activeSuspicionWindow` / `resolveCoverTracks`. Uncleaned evidence at exit
  feeds that machinery so the NPC's later inference is the same system that
  governs every other stealth consequence in the game. `rollGhostSuspicion`'s
  private `BOUNDARY.nightScene.suspicion` roll is superseded — Phase 5 should
  wire the real one rather than keep a parallel channel (invariant 6's rule
  about parallel channels applies to consequences as much as to risk).
  **LANDED 2026-09-05 (Phase 5).** `rollGhostSuspicion` and the `suspicion`
  bucket are **deleted**, and `verify-night-p1.js` section 15 is now the guard
  that neither comes back. The carrier is the room's **bed**, which gained
  `evidenceKinds: ['disturbed_bed']` in `defs.world.js` so the stamp is a legal
  effect rather than a trusted-producer cheat; the chain
  LEAVE_EVIDENCE → `sim.js`'s per-tick discovery scan → `ui.js`'s
  ADJUST_SUSPICION was verified running end to end by hand.
  **One part of this decision was deliberately NOT built:
  `openSuspicionWindow`.** `PICKPOCKET_TUNING.coverTracksWindowTicks` is 2
  (~1 hour) and the target is asleep at exit, so a "Play It Cool" chip opened
  there would expire before she could be spoken to — dead machinery. Its
  natural home is the DISCOVERY event, which is shared code and Phase 6/Q2's.

- **D23 — XP is awarded per action completed, at per-action rates.** Fully
  fucking someone is a more impressive feat than touching them and pays
  accordingly. `BOUNDARY.nightScene.xp`'s four-outcome bucket
  (`ghostComplete` / `bailClean` / `wakeWilling` / `caught`) is superseded by a
  per-action rate on the action tables; `awardSkillXp(player, 'stealth', …)` is
  still the sink. An exit-time bonus may survive as a small multiplier, but the
  body of the reward is earned action by action, during play.
  **LANDED 2026-09-05 (Phase 5), with one ruling.** The bank is paid out at
  `xp.exitMult` on EVERY real ending — `exit`, `wake_willing` AND
  `wake_hostile` — and only `abandon` forfeits it. That deliberately reads this
  decision's own "earned action by action, DURING play" over the flat
  clean-branch-only convention D32 set for the one-roll stealth verbs, which
  award a fixed lump for a binary outcome — the shape this decision superseded.
  A forced wake's stake is the shaming and the cold shoulder, not the skill the
  player demonstrated getting there. `applyNightSceneEnd` is the one payout
  site and is idempotent, so the bank lands once however the player got there.

### Heat becomes a real resource (added 2026-09-04, second design pass)

The first pass left Heat monotone: it only ever rose, so it was never
something you could be short of, and D6's "retroactive consent is earned"
was earned by simply playing. D27–D29 fix that at the root rather than by
moving a threshold.

- **D27 — Intensity Acceleration Resistance. Heat gain is a function of the
  GAP between an action's intensity and her current Heat, and escalating too
  fast LOSES heat.** You cannot walk into a room and put your cock down a
  sleeping stranger's throat and expect anything but a wide-awake, furious
  person. You have to warm her up, and what warms her up changes as she warms.
  - Every action carries an `intensity` on the same 0–100 axis as Heat:
    `intensity = part.intensity + motion.intensityOffset + PACE.intensityOffset`.
    Pace therefore does double duty — "gently" is how you *approach* a part
    whose full intensity she is not ready for.
  - `gap = intensity − heat`, and the heat curve is piecewise on that gap:

    | gap | reading | heat |
    |---|---|---|
    | > `tooFastAt` | too fast — she tenses | **negative**, scaling with the overshoot |
    | `idealPeak`-ish, ≤ `tooFastAt` | the next step up | full gain, best at `idealPeak` |
    | 0 … `idealPeak` | at her level | good gain |
    | `staleAt` … 0 | maintenance | a fraction (`maintainFloor`) — keeps her warm |
    | < `staleAt` | regression | decays toward zero |

  - The bottom row is the inverse the user named: going back to caressing a
    thigh after full sex is not *unpleasant*, it is merely **ineffective** —
    it does not graduate her and it does not hold the gain rate. So the decay
    approaches zero and never goes negative. Only overshoot is punishing.
  - An overshoot also **rouses her** — a jarring escalation is exactly the
    thing that wakes a sleeping person — via a multiplier on that action's own
    `wakeDelta`.
  - **This is NOT D7 resurrected, and a future session must not read it as
    such.** D7 was "heat gain feeds back into detection", which taxed *pursuing
    heat* with extra risk and made the win track punishing. D27 taxes
    *misjudging the escalation*, which is a skill question. Playing well —
    stepping up inside the window — costs no extra wakefulness at all. The
    coupling is action-intensity → wake, never heat → wake.
  - Illustrative knobs, Phase 6 tunes: `idealPeak 12`, `tooFastAt 25`,
    `staleAt −20`, `maintainFloor 0.25`, `overshootHeatLoss 0.35` per point
    past `tooFastAt`, `overshootWakeMult` ramping 1.0 → 2.5.

- **D28 — Every NPC has touch preferences, and they are derived, not stored.**
  Some parts and some motions land better on some people. Modelled on
  `TASTE_TUNING` / `taste.js` exactly: a stable function of the character's
  `genSeed` plus a few temperament anchors, on its own seed stream
  (`seedSalt`), with **no stored field** — so old saves need no migration and
  the same save always reproduces the same preferences.
  - A **loved** part raises heat gain, **widens** the D27 window (she will let
    you move faster somewhere she loves), and slightly lowers wakefulness.
  - A **disliked** part lowers heat gain, **narrows** the window, and raises
    wakefulness — an unwelcome touch rouses.
  - `bible.physical.intimate.preferences` is currently declared-absent in
    `CHARACTER_SCHEMA` with the note "it arrives with the intimacy layer that
    consumes it." That slot becomes the **authored override** for hand-written
    characters, the way `authoredFields` already protects hand-written bible
    values; the derived roll is the default for everyone else.
  - **Discovery is the game.** Preferences are not shown up front. The player
    learns them by playing, and what they have learned is remembered — the
    natural home is the existing per-character knowledge ledger
    (`player.ledger` / `codex.js`), which is already the "what do I know about
    this person" store. Learned preferences surface as a quiet marker on the
    part chip in D15's tray; unlearned ones show nothing at all.
  - **LANDED 2026-09-05 (Phase 6), writer and marker together as this plan
    required. One correction to the wording above:** the store is NOT
    `player.ledger[npcId]`. That is an array of day-stamped ACTS carrying a
    `spent` flag, read by the codex's confront/spread verbs, and a preference
    is not an act — putting one there would surface it as blackmail material.
    It is a sibling on the same folder, `player.nightKnown[npcId] = { parts,
    motions }` (migration player 7→8), so it still saves and loads with the
    player for free. `resolveNightLearning` (pure) + `applyNightLearning`
    (mutator, called from `applyNightStep`): a part or motion becomes known
    after `prefs.learnAfter` repeats in one session, counted off
    `record.touches` so learning needs no counter of its own and a reload
    replays it. **A NEUTRAL part is never learned however many times it is
    worked**, which is what keeps an unmarked chip ambiguous rather than a
    confirmed-nothing tell. The marker rides `nightPalette`'s per-part `known`
    field and the motion row's; the glyph is config (`prefs.knownMark`).

- **D29 — The willing/hostile threshold is a per-NPC moving target.
  (Resolves Q8; revises D6/D14's flat `heatWillingMin`.)** How much Heat it
  takes to wake willing rather than hostile depends on who she is: her
  relationship with the player and her own deviancy. A warm, adventurous
  partner needs very little; a cold, conservative near-stranger needs almost
  all of it.
  - `threshold = clamp(base − relEase − deviancyEase, min, max)`; illustrative
    `base 80`, `relWeight 30`, `deviancyWeight 20`, clamped to 20…90.
  - Still deterministic — a read, not a roll (D6's "earned, never rolled for
    free" is unchanged).
  - Together with D27's losable heat and D17's soothing drain, this is what
    finally makes D6 true: heat is spendable, losable, and measured against a
    bar that some people set very high.

- **D30 — Narration is AUTHORED, never generated. Nothing ever waits on
  prose.** The night scene makes no LLM call on the action path. Every action
  presents its line instantly, and the line varies between repeats of the same
  action so the language never reads as a stuck string.
  - Built by **fragment composition**, not one pool per action — the action
    space is far too large to author line-by-line. The exact precedent is
    `composePeekViewLine` (`peek.js`), which already assembles a frame + an act
    phrase + a state clause from separate pools under a seeded pick, and
    `pickPeekProse` / `PEEK_PROSE` for the pool-and-substitute pattern.
  - The night scene's fragments: an opener keyed by motion family, a target
    phrase keyed by (part, side), a manner phrase keyed by pace, and — the one
    that carries the mechanics — **a reaction phrase keyed by the D27 verdict
    and the heat band**. A too-fast escalation reads as her tensing, and the
    player learns the system from the prose without a tutorial.
  - The seed folds the action and a per-repeat counter, so doing the same thing
    twice gives two different lines and a reload reproduces both.
  - **This goes further than invariant 2, which is amended accordingly.** The
    invariant said the LLM narrates but never decides; on this surface the LLM
    is not in the loop at all. Nothing in the scene is worth a two-second stall.

- **D31 — Valid actions are declared, never assumed.** Not every combination
  of part, instrument and motion means anything — nobody pinches a nipple with
  their tongue. Validity is data: each part declares the instruments it
  accepts and, per instrument, the motions it accepts. The tray renders only
  what is valid, so an impossible action is unreachable rather than rejected,
  and the resolver refuses an invalid id rather than resolving it to something.
  A harness assertion walks the whole table and fails on any part that offers
  an instrument with no motions, or a motion no instrument can perform.

### The prose contract, the body, and the vocabulary (added 2026-09-04, third pass)

- **D32 — Every line has two halves: what you did, and what she did back.**
  This amends D30, which specified the authoring mechanism but not the
  contract. The log is not a caption on the player's own action; it is the
  **primary feedback channel**, and the bars are the secondary one. A player
  should be able to run a whole session reading only the prose and still know
  exactly where they stand.
  - **Half one — the act.** What you did, in the register D33 sets, immersive
    and specific to the composed action (part, side, instrument, motion, pace).
  - **Half two — her response and her state.** What she is experiencing, what
    she is doing, how she looks, whether she moved. This half is where the
    mechanics become legible without a number: the D27 verdict (an overshoot
    reads as her tensing or flinching away; an in-window step reads as her
    leaning into it; a regression reads as her not really registering it), the
    heat band (breathing, colour, wetness, sounds), the wakefulness band
    (stillness → shifting → surfacing), and any pose change from D34.
  - The response half is therefore keyed on **state, not on the action** — the
    same touch produces a different second half at heat 10 and heat 80. That is
    what makes repeated actions feel like a scene progressing rather than a
    button being pressed.
  - Both halves are authored fragments under a seeded pick (D30), so nothing
    waits and repeats vary.

- **D34 — Position is real, tracked state, and it gates what you can reach.**
  The record's `sheetStage` (initialised to `'covered'`, read by nothing) is
  generalised into three tracked pieces: **pose** (on her back / on her side /
  on her front / curled / legs parted / …), **covers** (covered / turned back /
  off), and **clothing** (per garment, the existing evidence tags). Together
  they are the "state" half of D18's `state × action` image key and the thing
  D32's second half reports.
  - Pose **changes as a consequence of actions** — a firm touch on the inner
    thigh may part her legs; an overshoot may make her curl away from you and
    take a part out of reach; a soothe may let her settle and roll toward you.
    Seeded and deterministic like everything else.
  - Pose **gates the part palette.** On her front, her cunt is hard to reach
    and her ass is easy; curled up closes both. An unreachable part is not
    shown, exactly as an invalid instrument is not shown (D31) — the tray never
    offers something that cannot happen.
  - This is the mechanic that makes the scene feel like a body rather than a
    menu, and it gives the player a reason to work *toward* an opening rather
    than only toward a number.
  - **Pose and covers landed in Phase 3a. CLOTHING DID NOT, and nobody noticed
    for six phases** — the symptom was silence, because a covered part was
    gated on pose and the bedsheet alone and touching it silently displaced the
    garment. **Landed 2026-09-05 by Phase 7**, found by the user playing Phase 6
    and going looking for the undress control. The gate is by ZONE and each
    part's zone is derived from the garments its own `evidence` list already
    named, so the axis needed no per-part churn; `garments` carries `zones` and
    a `layer` (panties under bottoms), `garmentSets` maps the sim's
    `npc.clothing` onto a starting set read once at open, and Cleanup's
    `restores` makes putting a garment back close off what it covers. A nude
    target starts exposed with no garment rows and no redressing entries (the
    user's ruling). Deliberately NOT folded into `nightExposure`'s scalar — see
    the Handoff. The guard against it going missing again is
    `verify-night-p7.js` section 2: every garment must have BOTH a Move part
    that displaces it and a Cleanup part that restores it.

- **D33 — Vocabulary: contact-footprint instruments, intensity-ordered motions,
  explicit register. (Resolves Q11's three axes; the tables themselves are
  Phase 3a.)**
  - **Instruments — "how much of you is touching" (W2, minus a body-weight
    entry).** Base set for every player: **One fingertip · Two fingers · Whole
    hand · Lips · Tongue**. The label carries the mechanic — a footprint is
    self-explanatory in a way "fingers vs fingertips" was not. Mounting and
    grinding are motions on a genital instrument, not a separate "your weight"
    tool.
  - **Motions — plain verbs, rendered left-to-right in ascending intensity
    (H2).** The row ordering is itself information: the leftmost verb on any
    part is the safe approach and the rightmost has to be earned, so the tray
    teaches D27 without a tutorial. The full verb vocabulary is four families:
    *contact* (brush, trace, stroke, rub, circle, press, drag, tap), *grip*
    (cup, squeeze, knead, pinch, roll, tug, spread, hold), *mouth* (breathe on,
    nuzzle, kiss, lick, flick, suck, mouth, bite), *rhythm* (dip, slide in,
    curl, pump, grind, thrust, straddle, ride).
  - **Register — explicitly adult, anatomically specific, not clinical.** This
    is a pornographic scene and the words register as such. Parts are named for
    what they are — clit, labia, nipples, balls, asshole — not euphemised
    ("between her legs") and not medicalised ("labia minora"). The current
    config, which keys `pussy` and labels "Between her legs", is internally
    inconsistent and the label side loses.
  - **Every part carries TWO labels: an in-region one and a standalone one.**
    (Resolves Q12; the rule fell out of the register answers rather than being
    designed for.) Inside the tray the region is already selected and visible,
    so the part chip can use the short, natural word — under **Cock** a part
    called *Head* is unambiguous, and under **Pussy** a part called *Lips* is
    unambiguous. Everywhere the region is NOT established — prose (D32), the
    phone's current-action summary line, the image prompt (D18), a codex entry
    — the standalone label is used: *glans*, *labia*. This is what lets the
    tray read like a body instead of a glossary while nothing downstream is
    ambiguous. Both labels live in the same part row; neither is derived from
    the other.
  - **The register calls, settled:**

    | | in-region | standalone | note |
    |---|---|---|---|
    | Cock → tip | Head | Glans | |
    | Pussy → outer | Lips | Labia | resolves the three-way "lips" collision |
    | Ass → perineum | Taint | Taint | |
    | region name | Pussy | Pussy | "cunt" is reserved for prose, where it lands harder |
    | chest, breasted | Tits | Tits | region label **Tits** |
    | chest, flat | Pecs | Pecs | region label **Chest**; driven by `intimate.breasts` / `body.chestSize` |
    | nipples | Nipples | Nipples | universal, never swapped |

- **D35 — The part palette and the instrument palette are derived from the
  genitals ARRAY, never from `gender`.** `physical.intimate.genitals` is
  already an array of typed objects (`maxItems: 4`) discriminated on `type`,
  with `GENDER_DEFAULT_GENITALS` supplying only a *default* set that the
  studio can add to or remove from — `GENITAL_TYPE_FIELDS` is the single table
  every existing reader (`rollGenitals`, `normalizeGenitals`, the Player Design
  studio, the describer) already derives from. The night scene joins them.
  - **The target's parts:** the base regions, plus one genital region per entry
    in *her* array. A futanari carries both. A character with an empty array
    carries neither, and nothing breaks.
  - **The player's instruments:** the five base instruments, plus one per entry
    in the *player's* array (their cock, their cunt). This is why a body-weight
    instrument was unnecessary — straddling and grinding are motions belonging
    to those.
  - A character carrying two entries of the same type (the schema allows it)
    needs disambiguated labels; the tray must not render two identical chips.
    - **Phase 3a decided where that lives: the SIDE slot of the action id.**
      It answers "which one" generally — `left|right|both` for a paired part,
      `g1..g4` for the Nth genital of a type, `-` when the question does not
      arise. On the instrument side the same idea appears as `base`: two cocks
      get two chips (`cock`, `cock2`) that share one validity row.
  - **`sensitivity` is already rolled per genital entry and on `breasts`**
    (`low · muted · average · responsive · high · exquisite`). D28's derived
    preferences must READ that first and only roll for parts that have no
    authored sensitivity — otherwise the night scene would silently contradict
    a character's own bible.
    - **Phase 3a implemented this as a WHOLE-REGION verdict.** `high`/
      `exquisite` makes every part of that region loved, `low`/`muted` makes
      them disliked, and anything else (`average`, `responsive`) holds them out
      of the derived draw entirely — the bible said neutral and the roll does
      not get to overrule it. So roughly a third of characters carry a
      blanket-banded genital region, which is the bible speaking, not a bug.
      `bible.physical.intimate.preferences` outranks even that.

- **D36 — Repositioning her is a first-class action category, and it is the
  expensive way to reach what you want.** D34 makes pose gate the part palette;
  this is the player's lever on it. **Move** is a tray tab beside **Cleanup**,
  and the two bracket the pleasure regions in a way that reads: Move opens
  access up, Cleanup closes evidence down, and neither is a touch.
  - Poses are **nodes and moves are edges** — a small directed graph, not a
    flat list of states. Rolling her from her front to her back may have no
    direct edge and require going through her side; parting her thighs is only
    available from poses where they are together. So reaching a part you want
    can take a *route*, and planning that route is real play.
  - Each move carries its own cost on the same formula as any other action:
    a real `wakeDelta` and a real `stirDelta`, scaled by how much of her you
    are moving. Shifting an arm is cheap; rolling her whole body is the most
    expensive thing in the game. Moves carry no heat of their own.
  - **Heat makes her pliant, and that is the second thing Heat is for.** A warm
    NPC moves *with* you semi-consciously, so heat scales a move's cost DOWN.
    Before this, Heat's only mechanical read was the wake tiebreak (D6/D29);
    now it buys access, which makes warming her up strategic rather than merely
    the win condition.
    - **Direction matters and a future session must not "fix" it into
      symmetry.** This is a heat → wake-cost coupling, but it only ever makes
      the player SAFER. D7 was deleted because it taxed pursuing heat; a
      benefit coupling has none of that problem. Never mirror this into a
      penalty.
    - Cost is deliberately NOT scaled by current wakefulness. That reads as the
      more physical model ("she's deeply asleep, easier to move"), but it is a
      positive feedback loop — high wake → dearer move → higher wake — and it
      would spiral a session into an unrecoverable state through no decision
      the player made.
  - Moves are deterministic like everything else: the move always happens, the
    cost is the cost. There is no resist-roll and no half-move.
  - Soothing (D17) therefore gains a second use as well: settle her deeper, and
    the wakefulness headroom you bought is what pays for the next big move.
  - Some moves also change `covers` (drawing the sheet back) or expose a
    garment — so a move can *add evidence* the same way a touch can, and
    Cleanup has to answer for it.

- **D37 — Night-scene frames are SESSION-LOCAL and never enter the shared
  image LRU. (Resolves Q9.)** A session cannot be minimised, cannot be saved
  mid-way, and is closed out on load by `sweepStaleNightScenes` — so its
  frames have no reason to outlive it and no way to be re-shown after it. They
  live in an in-memory map for the life of the session and are dropped, with
  their object URLs revoked, when it resolves.
  - This means **the 500-entry `kv.images` LRU is untouched**, which is what
    Q9 was worried about: D18's per-action cadence would otherwise have evicted
    every scene plate, portrait and dream panel in the save inside one long
    session.
  - **This is a deliberate deviation from the ActionWindow's rule that "every
    image goes through image.js's cache/budget machinery"** (that file's
    design invariant 2). State it in the code where a future session will read
    it, or somebody will helpfully "fix" the night scene back into
    `getCachedImage`/`setCachedImage` and quietly reintroduce the eviction
    storm. The prompt/seed composition still lives in `image.js`; only the
    STORE is different.
  - D21's reroll still overwrites the same key — ephemerally, which is all it
    ever needed to do.
  - Honest cost: re-entering the same NPC's room on a later night regenerates
    everything from scratch. That is the accepted trade for never evicting the
    rest of the game's art, and D18 already established that generation is not
    the scarce resource here.

- **PARKED — "Take a picture", the one thing that DOES persist.** Not designed
  yet; noted so the phases do not foreclose it. A capture action inside the
  scene would write a record into the existing camera roll
  (`world.phone.camera.roll`, `CAMERA.rollCap: 30`), which by long-standing
  precedent freezes **prompt + seed, never the blob** (`takePhoto`, image.js —
  the shared LRU can evict a memento's pixels at any time, so a photo is
  stored as the recipe that reproduces it). That makes a photo the sole
  permanent artefact of a session and reuses the Photos app's existing info /
  reroll UI for free.
  - Three consequences worth having in mind before designing it, all of them
    upside: a photo is evidence the player CHOSE to create; the phone-snoop
    path (`buildPhoneSnoopPhotoPrompt`) already lets an NPC find things on a
    device; and the codex ledger already models "things known about a person".
    A picture taken in a night scene is therefore not a screenshot — it is a
    game object with a future.

- **D38 — Heat is unbounded, and every 100 is another climax.** (Resolves the
  long-open repeat-climax question.) Heat no longer caps at 100. It keeps
  climbing, and each hundred crossed fires its own climax beat. Falling back
  down does not re-arm a checkpoint already spent.
  - `climaxCount` is monotone: `climaxCount = max(climaxCount, floor(heat/100))`,
    and the beat fires on the frames where it increases. Losing heat and
    climbing back through 100 does not fire it again.
  - **`nightStepTouch`'s `Math.min(100, record.heat + heatGain)` must go.** It
    is the line that currently enforces the cap.
  - **This collides with D27 and the fix is load-bearing.** IAR reads
    `gap = intensity − heat`, and intensity tops out around 100. At heat 250
    every action would read as a deep regression, gain almost nothing, and heat
    could never reach 300 — unbounded heat and acceleration resistance would be
    mutually exclusive. **So D27 reads the WITHIN-CYCLE position,
    `heat mod 100`, not absolute heat.**
  - That fix is not a patch, it is the better model: after a climax the
    escalation curve **restarts**, so you have to warm her back up to climb to
    the next one. A multi-orgasm session becomes a real escalating structure
    rather than a straight line, and the discontinuity at each hundred reads as
    exactly what it is — she has just come, and she is sensitive and starting
    over. Intended, not an artefact.
  - **The wake tiebreak (D29) keeps reading ABSOLUTE heat**, so past the first
    climax a forced wake is always a willing one. That is correct rather than
    degenerate: she has already come. The tiebreak's tension lives in the first
    hundred, which is where a session's real risk lives anyway.
  - **UI (amends D26):** the Heat bar fills on `heat mod 100` and carries one
    pip per climax reached, so the bar stays a bar and the count is legible
    beside it. It is still never coloured or worded as a danger.

## Data model

> **SUPERSEDED, and no longer what the code holds. Phase 3a landed
> 2026-09-04.** The `zones` map below — 13 flat entries each with a
> `category` — is a historical record of what Phase 1 shipped and nothing
> more; `BOUNDARY.nightScene` now carries `regions` / `parts` / `instruments`
> / `genitalInstruments` / `motions` / `pace` / `poses` / `covers` instead,
> plus the `iar`, `prefs`, `willing`, `move`, `soothe` and `prose` buckets
> D27–D38 needed. `quell` (D17) and the four-outcome `xp` (D23) and
> `thresholds.heatWillingMin` (D29) are all gone. **Read `config.js` for the
> live shape — this block is kept only so a future session can see what the
> revision replaced.** What did survive unchanged: `tierRiskMult`, the two
> skill curves, `thresholds.detectionWake` and `suspicion`. The session
> record below IS current.

### `BOUNDARY.nightScene` (config.js) — the tuning home
Illustrative values only — shape first, real numbers land in Phase 6 (Q5).

```js
nightScene: {
  // Zone palette. zoneDelta is a small seeded range (not a flat number) to
  // keep touches from feeling identical — real Detection cost per touch is
  // zoneDelta × tierRiskMult × skillMult(skill) (D2/D3). heat is flat and
  // NOT skill-scaled — skill governs risk, not how good it feels.
  // category feeds the (not-yet-designed) tray grouping; evidence lists the
  // Cleanup tags a touch leaves behind (D12) — untagged zones leave none.
  zones: {
    hair:        { label: 'Hair & neck',        zoneDelta: [2, 3],   heat: 0, category: 'lull',      risk: 'trivial'  },
    back:        { label: 'Back & shoulders',   zoneDelta: [2, 3],   heat: 0, category: 'lull',      risk: 'trivial'  },
    calves:      { label: 'Calves',             zoneDelta: [3, 5],   heat: 1, category: 'stimulate',  risk: 'safe'     },
    stomach:     { label: 'Stomach',            zoneDelta: [5, 7],   heat: 2, category: 'stimulate',  risk: 'safe'     },
    thighs:      { label: 'Thighs',             zoneDelta: [7, 9],   heat: 3, category: 'stimulate',  risk: 'moderate' },
    feet:        { label: 'Feet',               zoneDelta: [8, 12],  heat: 1, category: 'stimulate',  risk: 'moderate' }, // personality-dependent
    butt:        { label: 'Butt',               zoneDelta: [10, 14], heat: 4, category: 'stimulate',  risk: 'moderate' },
    face:        { label: 'Face',               zoneDelta: [12, 16], heat: 3, category: 'stimulate',  risk: 'high'     },
    mouth:       { label: 'Mouth',              zoneDelta: [14, 18], heat: 4, category: 'intimate',   risk: 'high',    evidence: [] },
    chest:       { label: 'Chest',              zoneDelta: [18, 22], heat: 6, category: 'intimate',   risk: 'high',    evidence: ['shirt'] },
    innerThighs: { label: 'Inner thighs',       zoneDelta: [16, 20], heat: 6, category: 'intimate',   risk: 'high',    evidence: ['bottoms'] },
    pussy:       { label: 'Between her legs',   zoneDelta: [24, 28], heat: 9, category: 'intimate',   risk: 'extreme', evidence: ['panties', 'fluids'] },
    anal:        { label: 'Her ass',            zoneDelta: [28, 32], heat: 8, category: 'intimate',   risk: 'extreme', evidence: ['bottoms', 'fluids'] },
    penis:       { label: "His cock",           zoneDelta: [24, 28], heat: 9, category: 'intimate',   risk: 'extreme', evidence: ['bottoms', 'fluids'] }, // male target only
  },

  // Cleanup (D12): one entry per evidence tag, each its own tray action on
  // the same detection/floor formula as a touch. Doing all of them before
  // leaving is what makes a session a true Ghost.
  cleanup: {
    panties: { label: "Straighten her panties",  zoneDelta: [4, 6] },
    bottoms: { label: "Pull her bottoms back up", zoneDelta: [4, 6] },
    shirt:   { label: "Fix her shirt",            zoneDelta: [3, 5] },
    sheets:  { label: "Smooth the sheets",        zoneDelta: [2, 4] },
    fluids:  { label: "Clean up",                 zoneDelta: [6, 9] },
  },

  // Per-sleeper-dynamic multiplier on zoneDelta, reusing the existing
  // shaming tiers (resolveShamingTier) — a cold-tier stranger's high-risk
  // zones cost more than a warm-tier partner's.
  tierRiskMult: { cold: 1.5, neutral: 1.0, warm: 0.6, hostile: 1.5 },

  // Both curves are driven by stealthSuccess (skills.js) and BOTH shrink
  // toward their `min` as skill rises — the doubled skill benefit on Floor
  // growth (D2). Real curve shape is Q5/Phase 6.
  skillMult:    { min: 0.15 },   // scales detectionGain
  stirringRate: { min: 0.02 },   // scales floorGain, on top of the above

  // Quell brings current Detection toward the Floor, never below it (D8).
  // Time cost only — Heat cost removed this session, flagged for
  // confirmation in the Handoff.
  quell: { detectionDrain: [8, 12] },

  thresholds: {
    detectionWake: 100,   // instant wake — Floor can never let Detection
                           // duck under this once Floor itself hits it (D2)
    heatClimax: 100,      // a purely positive in-session beat, NOT a wake
                           // trigger (D14) — repeat-climax behavior is an
                           // open Phase 1 detail
  },

  xp: { ghostComplete: 15, bailClean: 5, wakeWilling: 8, caught: 0 },  // awardSkillXp, stealth
}
```

### The live session record — `npc.flags._nightScene`
One active session per target; presence/lifecycle rules in Phase 2.
Precedent shapes: `_sleepAdvance` and `_suspicionWindow` on `npc.flags`.
**Updated 2026-09-04 to what Phase 3a actually writes.**

```js
npc.flags._nightScene = {
  targetId,            // who the player is with (resident, asleep, in-room)
  openedDay, openedMinute,
  detection,           // current "Wakefulness" — clamped to [floor, 100] (D2).
                       // NOT renamed to the D26 vocabulary; see Q10.
  floor,               // monotonic non-decreasing — "Stirring" (D2)
  heat,                // UNBOUNDED above, never below 0 (D38). Independent of
                       // detection/floor except at D27's overshoot and D36's
                       // move discount — see the config header.
  climaxCount,         // monotone (D38): max(climaxCount, floor(heat/100)).
                       // A spent checkpoint never re-arms.
  pose,                // D34 — a node in the pose graph. Rolled at open
                       // (rollNightOpeningPose), moved by `move`-family motions,
                       // and it GATES which parts the tray offers.
  covers,              // D34 — 'covered' | 'turned_back' | 'off'. Same gate,
                       // via the lower of the two exposures.
  evidence: [],        // tags left by touches AND moves (D12) — cleared one at a
                       // time by the Cleanup region's parts
  touches: [],         // ordered action-id history (every action, not just
                       // touches), drives narration + the exit consequence
  xp,                  // D23 — accumulated per-action stealth XP, banked at exit
  resolved: null,      // 'exit' | 'wake_willing' | 'wake_hostile' | 'abandon'
}
```

`sheetStage` and `bailPending` are **gone** — the first became `pose`+`covers`
(D34), the second went with D22's collapse to a single exit. `nightStepAction`
is pure and returns the deltas; **`applyNightStep` is the only thing that writes
this record**, and Phase 3b should call it rather than assembling the object
itself.

## Implementation phases

### Phase 1 — Mechanics core (pure, harness-first)
**Goal:** The entire game logic — touch, quell, floor accrual, cleanup
actions + evidence tracking, wake resolution, the heat-climax beat, all
endings, the evidence-weighted suspicion roll — exists as pure functions over
state + seed, with zero UI, node-verifiable like every other resolver in this
codebase.
**Files:**
- `src/src/srcfiles/config.js`: the `BOUNDARY.nightScene` bucket above.
- `src/src/srcfiles/boundary.js`: `nightStepTouch(gs, targetId, zoneId,
  seedCtx)` → `{ detectionΔ, floorΔ, heatΔ, evidenceAdded, woke, outcome? }`;
  `nightStepCleanup(gs, targetId, tag, seedCtx)` (same shape, clears a tag
  instead of adding one); `nightStepQuell(...)`; `resolveNightSceneOutcome`
  → `'ghost' | 'bail' | 'wake_willing' | 'wake_hostile'`;
  `rollGhostSuspicion(gs, record)` weighted by `record.evidence.length` (D5).
- `src/src/dev/verify/verify-night-p1.js`: node harness — zone/cleanup-table
  shape assertions; floor never decreases; detection never sits below the
  current floor; detection instant-wakes at exactly 100; a cleanup action
  removes exactly its evidence tag and nothing else; heat has zero coupling
  to detection/floor in either direction (D7 is gone — assert it stays
  gone); both skill curves shrink toward their `min`; determinism (same seed
  → same result).
**Verification:** harness green; invariant 2 (no state writes in the pure
layer).

### Phase 2 — Scene state + lifecycle
**Goal:** A session can begin and end cleanly inside the sim's rules: entered
only with a resident who is genuinely asleep in the player's room, abandoned
cleanly if the player leaves mid-session, and persisted so a reload doesn't
orphan or duplicate it.
**Files:**
- `src/src/srcfiles/boundary.js`: `openNightScene(gs, targetId)` (guards:
  resident, asleep, in-room, `coldShoulderActive` false — this is the guard
  D13's action chip will call), `abandonNightScene`, `resolveNightSceneEnd`.
- `src/src/srcfiles/state.js`: `_nightScene` is part of the npc folder
  automatically (npcs are `all: true` in `SAVE_KEYS`) — no SAVE_KEYS change
  expected, but load-time sanity (an abandoned/half-written record must
  self-heal like `_sleepAdvance`'s live-scan gate does) is part of this
  phase.
**Verification:** browser flow — enter with a sleeping resident, leave the
room, re-enter; reload mid-session; confirm exactly one record, clean
abandonment, no orphan.

### Phase 3 — The mechanics revision, then the overlay + interaction UI
**Rewritten 2026-09-04, after the UI design session.** This phase has two
halves and they must land in that order.

**3a — revise the resolvers (pure, harness-first). DONE 2026-09-04 —
`verify-night-p1.js`, 115/115.** The UI session changed
what an action *is*, so the Phase 1 signatures move before any DOM exists:
- `BOUNDARY.nightScene.zones`' 13 flat entries with a `category` are replaced
  by the D16 tables: parts (grouped by region, each declaring its valid
  instruments, valid motions, soothing capability, sex restriction and the
  evidence it leaves), instruments, motions, and the three Pace multipliers.
- `nightStepTouch(gs, targetId, zoneId, seedCtx)` becomes a single resolver
  over a composed action id (`part.side.instrument.motion.pace`) returning
  `{ wakeDelta, stirDelta, heatDelta, evidenceAdded, evidenceCleared, woke,
  outcome? }`. Cleanup is one more region in the same table, not a second
  function — keep `nightStepCleanup` only if the evidence-clearing branch
  genuinely reads better separately.
- **`nightStepQuell` is deleted** (D17). Soothing is the subset where
  `wakeDelta < 0`; `stirDelta` stays ≥ 0 on every action including a soothe,
  and a soothe carries a small negative `heatDelta`.
- `resolveNightSceneOutcome`'s `'ghost'`/`'bail'` returns go away (D22); a
  voluntary exit is just an exit carrying whatever evidence remains.
- `BOUNDARY.nightScene.xp`'s four-outcome bucket is replaced by a per-action
  XP rate (D23).
- **The second design pass adds four more things to 3a**, all of them in the
  same pure layer: every part and motion carries an `intensity` and the
  `acceleration` knobs land beside them (D27); the preference roll gets its own
  seed stream and derivation, `taste.js`-style (D28); `heatWillingMin` becomes
  the per-NPC `willingThreshold` formula (D29); and each part declares its
  valid instruments and, per instrument, its valid motions (D31). The authored
  prose pools (D30) can land here or in 3b — they are data, and the resolver
  only needs to return enough for the composer to key off.
- Harness: extend `verify-night-p1.js`. The assertions that must survive
  verbatim — floor/stirring never decreases (now including on a soothe),
  wakefulness never sits below stirring, an instant wake at exactly 100,
  determinism. **One that must NOT survive verbatim:** the old "heat has zero
  coupling to the risk side in either direction" assertion. D27 deliberately
  couples *action intensity* to wakefulness on an overshoot, and a test written
  against the old wording will either fail or be loosened into meaninglessness.
  Rewrite it as the thing D7 actually protected: **heat never influences
  wakefulness or stirring, and wakefulness never influences heat** — the
  coupling runs intensity → both, which is a different arrow.
  New assertions: every action id the tables can compose resolves, and every
  id they cannot compose is refused (D31); a soothe has `wakeDelta < 0` AND
  `stirDelta > 0`; Pace moves wakefulness and heat in opposite directions; an
  overshoot past `tooFastAt` returns a negative `heatDelta`; a gap below
  `staleAt` returns a near-zero but non-negative one; the same NPC seed always
  derives the same preferences (D28).

**3b — the overlay. DONE 2026-09-04 — `verify-night-p3.js`, 103/103.** The Living Tableau (D15) as the sim's third overlay,
rendered as one more `data-body` branch on `#action-window-overlay` beside
`picker` / `wardrobe` / `dream`, with its content in a `#night-content`
container (the `#peek-content` precedent). Bars per D26 — Wakefulness with the
Stirring band inside the same track, Heat separate and never coloured as a
danger. Tray per D16: region tabs, part chips, the side toggle for paired
parts, the instrument row, the motion row that fires, and the persistent Pace
control. One `Leave` (D22), confirming when evidence is outstanding.
**Files, as built:** `src/src/srcfiles/config.js` (3a's tables, plus 3b's
`evidenceLabels`), `src/src/srcfiles/boundary.js` (3a's resolvers),
`src/src/dev/verify/verify-night-p1.js`; then `index.html` (`#night-content`
markup, the stylesheet block, and the two new tokens `--color-stirring` /
`--color-evidence`), `src/src/srcfiles/actionwindow.js` (two `awHide` lines —
the night scene claims the overlay itself rather than opening through
`openActionWindow`, which pauses the clock D24 says must keep running), and the
decider/painter pair `src/src/srcfiles/nightscene.js` +
`src/src/srcfiles/render.nightscene.js`. That is `peek.js`'s split with the
file roles arranged the way `spritestudio.js` / `render.spritestudio.js`
arrange them; `nightscene.js` is registered in BOTH `index.html` and
`dev/verify/loadgame.js`'s ORDER, and the painter in `index.html` only (pure
view code, same as `render.spritestudio.js`).
**One ruling 3b had to make:** the artboards draw phone chips at 40px and the
phone side toggle at 36px, but D15 says every control is >= 44px. The locked
decision wins over the sketch — every phone control is >= 44px, region tabs
included; desktop keeps the artboard's 34px chips, where a mouse is the
pointer.
**Verification:** harness green for 3a. For 3b, a desktop (1440×900) and phone
(390×844) layout pass with no overflow and no control under 44px; the tray
reaches every part in ≤3 taps and repeats in 1.

### Phase 4 — Per-action imagery and the live loop
**Rewritten 2026-09-04. DONE 2026-09-04 — `verify-night-p4.js`, 119/119.**
Two things: the frames, and the clock.
- **Frames (D18/D19/D20/D21).** One frame per (state × action), keyed on
  `state × part × side × instrument × motion` — **pace deliberately dropped
  from the image key**, since gentle and firm are the same picture. No session
  or day budget; the cache is the only gate. Resolution is chosen from the
  available box and the frame is aspect-locked to it, so `object-fit: contain`
  neither crops nor letterboxes — `cover` is banned on this surface.
  `sceneOrientation()` grows a third return value. `generateImageTracked` gains
  a semaphore at 8 in flight. Selecting a part + instrument speculatively
  generates the on-screen motion chips' frames into the free slots.
  Registration through `setImageMeta` gives the frame the shared ⓘ/reroll for
  free, and the reroll overwrites the same cache key.
- **The live loop (D24).** The scene runs at one game-second per real second:
  push a time context whose `TIME_DILATION.scales` value is `1`. The loop
  READS the clock and never advances it (`peek.js`'s discipline, TIME's single
  clock owner rule). This is what makes soothing cost something.
**Files, as built:** `src/src/srcfiles/config.js`
(`TIME_DILATION.scales.nightscene: 1`, `IMAGE_CACHE.resolutions.night`,
`IMAGE_CACHE.maxInFlight: 8`); `src/src/srcfiles/image.js`
(`NIGHT_FRAME_BOX` / `nightFrameBoxAspect` / `nightFrameShapeFor` /
`nightFrameShape`, `nightFrameStateToken` / `composeNightFrameKey` /
`composeNightFrameSeed` / `composeNightFramePrompt` / `generateNightFrame`,
`IMAGE_NEGATIVE.night`, and the semaphore — `imageFreeSlots` /
`acquireImageSlot` / `releaseImageSlot` inside `generateImageTracked`);
`src/src/srcfiles/nightscene.js` (`nightFrameAxes` / `nightPrefetchSignature` /
`nightElapsedMinutes` / `nightElapsedLabel` in the pure layer, and
`nightFrameKeyFor` / `nightAcceptFrame` / `nightRequestFrame` /
`nightPrefetchFrames` / `nightRerollFrame` / `nightReleaseFrames` /
`nightStartClock` / `nightStopClock` / `nightClockTick` /
`nightRepaintFrame` in the controller);
`src/src/srcfiles/render.nightscene.js` (`renderNightFrame` replacing
`nightPaintFrame`, plus `renderNightClock`); `index.html` (`#night-img`,
`#night-shimmer`, `#night-clock`, `--night-frame-h` and the three
`[data-shape]` rules).
**Verification, as run:** `verify-night-p4.js` 119/119, plus a hand pass at
1440×900 and 390×844 in `dev-harness.html` against a `root.generateImage` stub
that paints its own resolution — see the Handoff for the measured numbers.

### Phase 5 — Endings and handoff
**DONE 2026-09-05 — `verify-night-p5.js`, 103/103.** What actually shipped is
in the Handoff at the top of this document; the block below is the brief it was
built from, kept because its file list and its re-check are still the record of
what was asked for. Two deviations from that brief, both deliberate and both
argued in the Handoff: the staging/climax-beat work went into
`nightscene.js` + `render.nightscene.js` + `index.html` rather than `ui.js`
(the brief predates Phase 3b, which moved the whole overlay out of `ui.js`),
and `openSuspicionWindow` was NOT wired, because a cover-tracks window opened
on a sleeping target expires before she can be spoken to.
**Goal:** All endings resolve through the sim's existing consequence surfaces
instead of new parallel ones.
**Rewritten 2026-09-04 after Phase 3a**, which changed what the resolutions
ARE. There are now **three**, not four: `'exit'` (D22 — one voluntary exit,
whatever evidence remains), `'wake_willing'` and `'wake_hostile'` (a forced
wake, split by D29's per-NPC threshold read at that instant). `'abandon'` is
the fourth stored value and is not an ending — it writes no consequence.
**Files:**
- `src/src/srcfiles/boundary.js`: resolution wiring — `'exit'` →
  `noteIntimacyOccurred` + the banked `record.xp`, then hand
  `record.evidence` to the SHARED stealth machinery (D25: `LEAVE_EVIDENCE`,
  `ADJUST_SUSPICION`, `stealth.js`'s suspicion windows) rather than the
  private `rollGhostSuspicion`, which this phase should retire together with
  its `BOUNDARY.nightScene.suspicion` bucket; `'wake_willing'` → the existing
  `wake_receptive`/reciprocate branch (`applyAffectionSleepAttempt`'s
  receptive path, or `applyReciprocatedAct` for the full act), decided purely
  by the `outcome` `nightStepAction` already returned (D6/D14 — there is no
  separate "heat win" event); `'wake_hostile'` → `applyShamingReactionLines`
  + `noteColdShoulder` (verbatim reuse).
- `src/src/srcfiles/ui.js`: the wake slow-zoom staging + handoff to the
  consensual overlay or the shaming window; a distinct positive beat when a
  step returns `climaxed: true` (D14/D38 — it fires once per hundred and
  never ends the session).
- `src/src/srcfiles/skills.js`: no change — XP rides the existing
  `awardSkillXp(..., 'stealth', ...)` site, and the amount is already
  accumulated on `record.xp` action by action (D23). An exit-time multiplier
  is `xp.exitMult`, currently 1.
**Verification:** browser — reach all three resolutions at least once; confirm
a clean exit writes only the intended record (NPC state diffed, like D30's own
verification did); confirm the banked XP lands once rather than per action,
and that uncleaned evidence produces a real stealth-system consequence on the
next day rather than a private roll.
**Re-check while you are here (flagged by the 2026-09-04 handoff):** a Cleanup
action still runs the same wake check a touch does, which is D12's point. With
D22 that is now a real trade rather than a dominated one — but nobody has
confirmed the trade is worth taking, because the consequence side has never
been wired. This phase is where that becomes answerable.

### Phase 6 — Integration and tuning (the open questions land here)
**DONE 2026-09-05 — `verify-night-p6.js`, 124/124.** What actually shipped is in
the Handoff at the top of this document, including the three rulings it had to
make and the two shared-system changes it argued for. Two deviations from the
brief below, both deliberate: the shadow layer is a real `ambient` REGION
resolved through `nightStepAction` rather than anything in `signals.js` (the
signal substrate emits nothing for an NPC merely walking past, so proximity is
read directly — `nightAmbientProximity`), and Q2's answer is neither of the two
options the brief offered (strength now scales the CONSEQUENCE, not the odds).
The balance pass below is the one thing a session cannot finish: its goals are
asserted in section 15, but the verdict is the user's.
**Goal:** The Night Scene becomes *the* in-room sleeping interaction, wired
through a real action chip, and the balance is tuned by real play.
**Files:**
- Wherever the sim's room action-chip system lives (likely
  `actions.js`/`defs.actions.js`): the new chip that opens the Night Scene
  when in-room with a sleeping, eligible NPC (D13), calling Phase 2's
  `openNightScene` guard.
- `src/src/srcfiles/signals.js` / door substrate: the third-party shadow
  layer — a roommate passing the doorway registers as a faint sound-cue,
  routed through the same `nightStepAction` wakefulness/stirring math
  rather than a parallel channel (keeps invariant 6 intact). The natural
  shape is a synthetic action id in its own region, so an exogenous cue pays
  the same clamps and the same monotonic stirring every player action does.
- `BOUNDARY.nightScene`: the real tuning pass — `skillMult`/`stirringRate`
  curves, cleanup/quell costs, the evidence-weighted suspicion curve (Q2).
- Confirm or reverse the Handoff's flagged inference (Quell's Heat cost
  removal).
**Verification:** live balance pass — cold-tier stranger vs. warm-tier
partner must feel radically different; a maxed-stealth player must be able
to ghost a full session with the floor barely moving (D2's "free play"
goal); the user's verdict is the acceptance test.

## Status

| Phase | Status | What it does |
|---|---|---|
| — | Mechanics design | **Locked** — D1–D6, D12–D14, plus D17, D22–D25 and D27–D31 from the two 2026-09-04 design passes; D7/D8 deleted |
| — | UI design | **Locked** (2026-09-04) — D15–D26 + D32–D35, Living Tableau; D9/D10/D11 superseded. Vocabulary axes chosen (D33); the tables are Phase 3a |
| 1 | **Done** (revised by 3a) | Pure mechanics core. Its resolvers were rewritten by Phase 3a and its harness with them — `verify-night-p1.js`, **115/115** |
| 2 | **Done** | Session state + lifecycle (`verify-night-p2.js`, **26/26**). The record shape changed in 3a: `sheetStage`/`bailPending` out, `pose`/`covers`/`climaxCount`/`xp` in |
| 3a | **Done** (2026-09-04) | The mechanics revision: D16/D33 grammar tables (57 parts, 42 motions, 1749 valid combinations), one `nightStepAction` resolver, D27 IAR, D28 preferences, D29 threshold, D31 validity, D34 pose, D36 Move graph, D38 unbounded heat, D23 XP, D30/D32 authored prose. `verify-night-p1.js`, **115/115** |
| 3b | **Done** (2026-09-04) | The overlay. `#night-content` as a third `data-body` branch; `nightscene.js` (decider) + `render.nightscene.js` (painter); D26 bars with the Stirring band inside the Wakefulness track and D38's climax pips; the D16 tray (region tabs, part chips, side toggle, instrument row, the motion row that fires, persistent Pace) with D27's overshoot drawn as a dashed chip; one `Leave` with D22's naming confirm. `verify-night-p3.js`, **103/103** |
| 4 | **Done** (2026-09-04) | Per-action generated frames (D18's key, pace dropped), D19's aspect-locked box in three shapes, D20's semaphore at 8 + speculative prefetch, D21's ⓘ/reroll, D37's session-local store, and D24's live clock at scale 1. `verify-night-p4.js`, **119/119** |
| 5 | **Done** (2026-09-05) | The endings. `resolveNightSceneConsequence` + `applyNightSceneEnd` (the one call site, idempotent): exit → `noteIntimacyOccurred` + the banked xp + `LEAVE_EVIDENCE` on the bed at a count-scaled strength (D25 — `rollGhostSuspicion` and `BOUNDARY.nightScene.suspicion` DELETED); `wake_willing` → `applyReciprocatedAct`; `wake_hostile` → `applyShamingReactionLines` + `noteColdShoulder`; `abandon` → nothing. Plus D14/D38's climax beat and the end block's receipt. Two pre-existing defects fixed: Continue was inert, and the phone hid the end block entirely. `verify-night-p5.js`, **103/103** |
| 6 | **Done** (2026-09-05) | Integration and tuning. D13's entry chip (`boundary.night_scene`, first in the bed submenu, gated on `resolveNightSceneGate` in render.js, intercepted in ui.js); the shadow layer as a real `ambient` REGION resolved through `nightStepAction` (`nightAmbientProximity` / `nightAmbientCue` / `nightAmbientTick`) so exogenous risk pays every clamp a touch pays; the whole authored register through one idempotent `nightRegister` with `{o}` for the object case; D28's writer (`resolveNightLearning`/`applyNightLearning` → `player.nightKnown`, migration player 7→8) AND its chip marker together; `prose.side.both` made live. Q2 answered — strength now scales the CONSEQUENCE (`sim.js` carries it, `ui.js` reads it, referenced to `sneakEvidenceStrength` so the sneak path is unmoved), plus an awake gate on the shared discovery scan. Q5's design goals asserted rather than magnitudes; no curve retuned. `verify-night-p6.js`, **124/124** |
| 7 | **Done** (2026-09-05) | **D34's clothing axis**, dropped by Phase 3a and found by playing Phase 6. `clothing` on the record over the evidence-tag vocabulary, read from `npc.clothing` once at open and frozen; `garments` with `zones`/`layer`, gated by ZONE and derived from each part's own `evidence` list, so it landed with no per-part churn; garment rows in Move mirroring Cleanup's, which now `restores`; the image key's clothing half moved off `npc.clothing` onto the record (it used to key every frame of a session identically); and `blockedRegions`, so a region she HAS but that is closed names the next thing in the way instead of vanishing. A nude target starts exposed with no garment rows and no redressing (user ruling). Plus the `inside` prose fix ("You slide into inside her") and its grammar guard. `verify-night-p7.js`, **67/67**; p1 115→**117**, p4 119→**120**, p6 124→**127** |

## Dependency order

```
Phase 1 (pure mechanics) ──► Phase 2 (state/lifecycle)
                                      │
                     UI design session (external — not a numbered phase)
                                      │
                                      ▼
                    Phase 3 (overlay UI) ──► Phase 4 (stage + dynamics)
                                      │
                                      ▼
                             Phase 5 (endings + handoff)
                                      │
                                      ▼
                          Phase 6 (integration + tuning)
                                      │
                                      ▼
                        Phase 7 (D34's clothing axis)
```

**Updated 2026-09-04 (twice).** The UI design session has happened and the
mechanics revision it forced has LANDED — Phase 3a rewrote the Phase 1
resolvers and their harness before any DOM existed, which is the dependency
the diagram above understated. **Phase 3b is now a pure rendering job**
against a frozen, tested API (`nightPalette` returns the whole filtered tray;
`nightStepAction` + `applyNightStep` + `composeNightLine` are the click
path). Phase 6 still needs Q2/Q5's real numbers from its own tuning pass.

## Open questions (all resolved but Q3 and Q5's live verdict)

- ~~Q1 — does the Night Scene replace D30's chat-ask sleeping branch when
  in-room?~~ **Resolved: yes, via a dedicated action chip (D13).**
- ~~Q2 — exact steepness of the evidence-weighted suspicion consequence
  (D5/D25).~~ **RESOLVED 2026-09-05 by Phase 6, and the answer is neither of
  the two the question offered.** Phase 5 had measured the leftover count
  against the DISCOVERY probability and found it nearly inert (100% vs 98.3%
  over an eight-hour night). Phase 6 measured the alternative — widening the
  night scene's strength range against the shared base — and it does the same
  nothing, because the flat `evidenceDiscoveryChancePerTick` (0.15) already
  discovers anything at all over a night in the owner's own room. **The real
  fault was that strength was read by only one of the two terms it should
  drive: it weighted the odds and not the CONSEQUENCE.** `ui.js`'s
  `evidence_discovered` handler wrote a flat `sneakCaughtSuspicionDelta`, so a
  five-tag mess and one crooked shirt taught her the same amount. The fix is in
  the shared system in the shared system's own units: `sim.js` puts `strength`
  on the event, `ui.js` scales the suspicion write linearly by it, referenced
  to `STEALTH_TUNING.sneakEvidenceStrength` (so a sneak's fixed 0.4 still
  writes EXACTLY the old flat delta and the stealth path does not move) and
  clamped by `EFFECT_LIMITS.suspicionDeltaCap`. Measured: one leftover tag →
  0.0675 suspicion, five → 0.3375, against a `confrontThreshold` of 0.5. The
  intermediate Cleanup actions are now linear and each buys something, while
  clearing the LAST tag still removes the record entirely and stays
  categorically the best step. `exit.evidencePerTag` moved 0.15 → 0.18 so five
  tags saturate the cap. Asserted in `verify-night-p6.js` section 14.
- **Q3 — a future "somnophilia/seduction" skill axis?** Still parked, not
  built, and now the ONLY design question this plan leaves open. Phase 6 is
  built; revisit once the user has actually played it.
- ~~Q4 — real avatar head on the pillow?~~ **Resolved: no.**
- **Q5 — the real numbers.** `skillMult`/`stirringRate` curves, per-part
  `wakeDelta` ranges / `intensity` / `heat` across the whole D16 grammar, the
  per-motion and Pace multipliers, D27's `iar` knobs, D28's preference
  multipliers, D29's `willing` weights, D36's move discount, the soothe drain,
  cleanup costs, and D23's XP rate. **All of them are now real fields in
  `BOUNDARY.nightScene` carrying illustrative values** rather than prose in
  this doc, so Phase 6 tuning is an edit to one config bucket. Phase 3a's
  harness deliberately asserts SHAPES and RELATIONS (this is bigger than that,
  this has the opposite sign) and never a magnitude, so retuning does not
  break it.
  **Phase 6 (2026-09-05) did the half of this a harness can do, and left the
  other half open deliberately.** `verify-night-p6.js` section 15 turns D2's
  and D3's stated goals into assertions — a maxed-stealth player finishes a
  60-action session with Stirring under 10 and never wakes her even at cold
  tier; an unskilled player's Stirring runs 5× higher; cold vs warm differ by
  more than 1.8×; and the Stirring benefit outruns the raw `skillMult` span,
  which is D2's "doubled skill benefit" made checkable. Those already hold on
  the illustrative values in `BOUNDARY.nightScene`, so **Phase 6 retuned no
  curve at all** — the only number it changed is `exit.evidencePerTag` (Q2).
  Every assertion is a shape or a relation, so a real tuning pass can move any
  curve without breaking one. **What is still open is the thing a harness
  cannot supply: the user's own verdict on whether it FEELS right.**
- ~~Q6 — do wake handoffs reuse the existing branches, and does a heat-win
  continue as a consensual act?~~ **Resolved by D14.** Yes.
- ~~Q7 — mobile layout of the tray + bars?~~ **Resolved by D15.** Two phone
  states: the frame is the screen with a compact action bar, and **Change…**
  raises the full tray as a sheet.
- ~~Does Quell still cost a little Heat, or time only?~~ **Resolved by D17
  and D24:** the question is void, because Quell no longer exists. Soothing
  costs stirring permanently and drains a little heat, and the clock runs
  live so time is a real cost again.
- ~~Q8 — should the heat tiebreak threshold scale?~~ **Resolved by D27 and
  D29.** The threshold is now a per-NPC moving target driven by relationship
  and deviancy (D29) — but the real fix was upstream: D27 makes Heat losable,
  so it stops being a number that only goes one way. The curve itself is Q5.
- ~~Q11 — the vocabulary axes.~~ **Resolved by D33/D35:** contact-footprint
  instruments (minus a body-weight entry), intensity-ordered motions, and an
  explicitly adult, anatomically specific register. Both palettes derive from
  the genitals array, never from `gender`.
- ~~Q12 — five register calls inside D33.~~ **Resolved 2026-09-04**, and the
  answers produced a rule rather than five strings: parts carry an in-region
  label AND a standalone label, because the tray has already established the
  region and prose has not. The settled table is in D33. Head/Glans,
  Lips/Labia, Taint, Pussy, Tits-or-Chest.
- ~~Q9 — does the shared image LRU need a bigger cap or a reserve?~~
  **Resolved by D37: neither — and BUILT AND ASSERTED by Phase 4.** A live
  session with 8 frames in `nightSession.frames` left `kv.images` holding
  nothing but cutouts and avatars (zero `night_*` keys), and
  `verify-night-p4.js` section 7 scans both night files for
  `getCachedImage`/`setCachedImage` and proves every object URL is revoked on
  close. Night-scene frames never enter it. They are
  session-local and dropped when the session resolves, because a session
  cannot be minimised, saved mid-way or resumed after a load. The one thing
  that persists is a deliberately taken picture (parked, see D37).
- ~~Q10 — Do the record's field names follow D26's vocabulary?~~ **Resolved
  by Phase 3b (2026-09-04): NO, and the split is accepted permanently.** The
  record keeps `detection` / `floor`; the player-facing surface keeps
  Wakefulness / Stirring. What makes that safe rather than merely tolerated is
  that the two vocabularies meet in exactly ONE function —
  `nightBarModel(gs, targetId)` in `nightscene.js`, which reads
  `rec.detection` / `rec.floor` and returns `wake` / `stir` / `wakePct` /
  `stirPct` / `heatPct` / `climaxCount` / `thresholdPct`. Nothing else in the
  decider touches either name and the painter never touches them at all. A
  rename would now be a pure cost: it would churn `boundary.js`, both existing
  harnesses and every save-shaped assertion to move a translation that already
  lives in five lines. **Both halves are asserted** (`verify-night-p3.js`
  section 9: "the painter never reads the record's internal meter names" and
  "in the decider they appear ONLY inside nightBarModel"), so a later session
  that spreads the internal names into the view layer fails a test rather than
  silently invalidating this answer.
- ~~Repeat-climax behavior.~~ **Resolved by D38:** heat is unbounded and
  every 100 is another climax; a spent checkpoint never re-arms. D27 reads
  the within-cycle position (`heat mod 100`) so the two are compatible —
  read D38 before touching either.

## Design invariants

1. **The hard `'asleep'` floor is never relaxed.** The Night Scene routes
   through `boundary.js`'s carve-out exactly as Phase 17 and D30 do — the
   willingness function's floor stays hardened, and nothing here opens a
   second, lighter door. (Scar: the whole intimacy plan's invariant 1 exists
   because a single bypass would make the gate a suggestion.)
2. **The LLM never decides — and, on the action path, never narrates either.**
   Meter deltas, wake thresholds and resolutions are pure functions of state +
   seed. **Strengthened 2026-09-04 by D30:** the model is not in the loop at
   all for a touch. Every action's line is authored and composed from fragment
   pools under a seeded pick (`composePeekViewLine` is the working precedent),
   so it appears instantly and varies between repeats. Nothing in this scene
   is worth a two-second stall — which is the same rule invariant 3 applies to
   art, applied to words.
3. **Image generation is never on the critical path.** A mechanic never
   blocks waiting on a generation, no matter how many generations the UI
   uses per session — and D18 makes that *many*: one frame per (state ×
   action), with no session or day budget. A tap resolves instantly against
   the pure resolver and the frame arrives when it arrives, behind the
   shimmer. D20's concurrency cap (8) and speculative prefetch are what make
   that cadence survivable, not a licence to await one. (Scar: this codebase
   already has one plan stuck because nobody could see real pixels — the
   night scene must not add a second one.)
4. **The player's agency is real input.** A `wake_willing` ("retroactive
   consent") is earned through skill + choices via the heat tiebreak (D6),
   and the player is never a silent die roll away from a character's
   feelings — D31's rule, held here too.
5. **An undisturbed completion is a clean fiction, weighted by how clean it
   actually was.** `ghost` writes the intimacy-history record and rolls the
   evidence-weighted suspicion chance (D5) and nothing else — no
   relationship damage, no guaranteed suspicion — so "she never knew" stays
   true unless the rollover (weighted by whatever evidence was left) says
   otherwise.
6. **The Night Scene never writes sim authority over the sleeping NPC.** It
   does not change `npc.activity`/`location`/`schedule`, and the moment it
   resolves, control returns to the normal sim — the parent plan's static/live
   split discipline. **Corrected 2026-09-04 (D24):** the earlier clause "while
   it runs the world is paused (ActionWindow precedent)" was wrong, and it made
   D8's time-only Quell cost free. The scene runs LIVE at one game-second per
   real second (`TIME_DILATION.scales` value `1`, as `conversation` uses), and
   like `peek.js` the session loop only READS the clock — it never advances it.
   Exogenous risk sources (Phase 6's shadow layer) must route through the same
   wakefulness/stirring math, not a parallel channel; the same rule now applies
   to consequences, which route through the shared stealth system (D25).
