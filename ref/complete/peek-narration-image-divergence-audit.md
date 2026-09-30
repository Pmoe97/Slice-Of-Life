# Audit — peek images contradict peek narration (2026-09-05)

**Status: FIXED 2026-09-05, same session it was reported.** `verify-peek-prompt.js`
is **38/38**. Everything below is the diagnosis as written before the fix; what
shipped is in "What was built" at the bottom. User report: *"peeking still shows the
character awake, eyes open, standing up despite the text saying 'she is asleep
in her comfy clothes' … one shower peek said 'you see her showering, filming
herself' but the image didn't reflect that at all. also never any suds or
wetness in the shower peeks. overall narration and prompts just don't reflect
each other at all."*

All of it reproduces. The narration and the image **do** share their act phrase
— `PEEK_VIEW_ACT[activity]`, read by `composePeekViewLine` (`peek.js:149`) and
`composePeekPrompt` (`image.js:1328`) alike. The divergence is not in the act.
It is that **everything wrapped around the act in the image prompt is
unconditional, and for 17 of the 58 acts it contradicts the act outright.**

Companion to `sleeping-npc-contradiction-audit.md` (same session) — the sleeping
case below is a third instance of the same root problem: a system that knows an
NPC is asleep and then behaves as though she isn't.

---

## The real prompt, printed

Sleeping NPC, from a live build (`composePeekPrompt`, abridged in the middle
only):

> Interior of the bedroom 1 in a shared apartment, bright daylight, glimpsed
> through a narrow gap in a slightly open door from the hallway, a private candid
> moment. *…character clause…* currently in sleepwear **is asleep in bed,
> mid-motion, absorbed in what they are doing**, completely unaware of being
> watched, **body angled away from the door, not looking at the viewer, natural
> unposed body language**, warm tones, cinematic composition, slice-of-life
> atmosphere.

Negative: `… posing for the camera, looking at the viewer, facing the camera,`
**`standing straight, static portrait,`** `studio pose`

The prompt says **"asleep in bed, mid-motion, absorbed in what they are
doing"**. Two words of sleep against roughly fifteen words of active, upright,
turned-away framing — plus a negative prompt that bans **"static portrait"**,
which is precisely what a sleeping person is. Nothing anywhere says *eyes
closed*, *lying down*, or *horizontal*. The model is doing what it was asked.

---

## 1. The framing clause assumes an active subject — wrong for 8 acts

`composePeekPrompt` appends `mid-motion, absorbed in what they are doing … body
angled away from the door … natural unposed body language` to **every** act,
and `IMAGE_NEGATIVE.peek` bans `standing straight, static portrait`.

That framing was added 2026-08-30 for a real reason (the comment in
`image.js:1339` explains it: the old wording produced posed portraits looking at
the viewer). It is correct for the ~40 active acts. It is wrong for these:

`masturbating` · `masturbating in bed` · `having sex` · `sex` · `quickie` ·
**`sleeping`** · **`napping`** · `reading in bed`

For `sleeping`/`napping` it is flatly contradictory. For the in-bed sexual acts
it is fighting the pose the act implies.

## 2. The negative prompt fights the act for 8 more

`IMAGE_NEGATIVE.peek` bans `posing for the camera, looking at the viewer,
facing the camera`. Someone **filming themselves is facing a camera** — that is
the entire act. So the prompt asks for it in the positive and forbids it in the
negative:

`filming` · `filming by the pool` · `filming together` · `on a video call` ·
`in a standup` · `recording a take` · `on a client call` · `laying down a take`

This is the user's "said filming herself, image didn't reflect it" exactly. The
positive said `is filming themselves` — I confirmed it does reach the prompt —
and the negative cancelled it.

The fix is **not** to drop those negative terms wholesale: they are what stops
the subject posing for the *peeker*. It is to stage the geometry in the positive
("set up facing their own camera on a tripod, side-on to the door") so the model
has somewhere to put a camera that isn't the keyhole.

## 3. Showering has no water in it at all

The whole prompt for a shower peek is `is in the shower` plus the generic room
and framing clauses. There is **no steam, water, wet skin, wet hair, suds,
running water, or glass** anywhere in it — positive or negative. The room clause
is `Interior of the bathroom a in a shared apartment, bright daylight`.

Nothing asks for a wet person, so nothing paints one. (Minor, spotted in
passing: `roomName.toLowerCase()` turns "Bathroom A" into `bathroom a`.)

## 4. The act is 2 words in a ~90-word prompt

With the intimate gate open, `buildVisualCharacterClause(npc, {intimate: true})`
contributes roughly seventy words of fixed anatomy — height, hair, eyes, skin,
face, build, breasts with nipple and areola detail, full genital description,
body hair — before the act's two words arrive. Measured on the shower case, the
character clause is longer than every other clause combined.

That is presumably deliberate for identity consistency, but it means the act is
a small fraction of the signal, and it is why act-specific staging (points 1–3)
has to be *explicit* rather than relying on one verb to carry the frame.

## 5. Narration bug spotted in passing

`composePeekViewLine` falls back to `'they'` for a nameless NPC while its frames
read `{name} is …`, producing **"they is asleep in bed"**. Only reachable when
`npc.bible.name` is empty, so it may never surface in real play — but the frame
strings assume a singular name and the fallback breaks that contract.

---

## Proposed fix

The shape of it: **the act table already has two columns (`safe`/`explicit`)
because one string could not do two jobs. It now needs a third axis for the same
reason — an image needs staging the prose does not.**

1. `PEEK_VIEW_ACT` rows gain optional image-only fields:
   - `staging` — positive fragment appended for this act (`'eyes closed, lying
     on their side under the covers, completely still'` for `sleeping`;
     `'steam, wet skin and hair, water running, soap suds, fogged glass'` for
     `showering`; `'set up facing their own camera on a tripod, side-on to the
     door'` for the filming family).
   - `posture` — replaces the unconditional `mid-motion, absorbed in what they
     are doing` when present (`'still, at rest'` for the static acts).
   - `dropNegative` — terms removed from `IMAGE_NEGATIVE.peek` for this act
     (`'static portrait'` for sleeping; the camera terms for the filming family).
   A row with none of the three behaves exactly as today, so this is additive
   and only the ~17 rows that need it change.
2. `composePeekPrompt` reads those three and composes rather than concatenating
   a fixed tail.
3. `IMAGE_NEGATIVE.peek` becomes a base list the act can subtract from.
4. **The image key must fold the staging**, or a cached frame from before the
   change is served for the new prompt. `composePeekKey` already folds
   `clothing` and `actKey`; bumping `IMAGE_PROMPT_VERSION` is the blunt way and
   is probably right here, since every peek frame's prompt changes.
5. Harness (`verify-peek-prompt.js`): for **every** `PEEK_VIEW_ACT` row, the
   composed prompt must not contain a term the negative also contains, and every
   static act must not say `mid-motion`. That pair of assertions is what would
   have caught all of 1 and 2.

## The sleeping-frame brief — ANSWERED by the user, 2026-09-05

> *"Peeking on a sleeping subject does not have to necessarily yield an
> interesting subject, but their body can be depicted as open in the sense that
> they are viewed legibly not just a dark silhouette under some covers. For nude
> sleepers getting to see their nude form is some capacity acts as a reward for
> the viewer but we aren't inherently oversexualizing every view."*

So: **legible, not lurid.** The frame does not have to be interesting; it has to
be readable. The reward for looking at a nude sleeper is earned by VISIBILITY —
light, an unobstructed body, covers off — never by posing them or narrating them
as an invitation. `PEEK_STAGING.asleep` is written to that brief and
`verify-peek-prompt.js` section 4 holds both halves of it: legibility is
asserted, and so is the absence of sexualising language, in the clothed and the
nude frame alike.

---

## What was built

- **`PEEK_FRAMING`** (config.js) — `defaultPosture` plus the negative as an
  ARRAY, so an act can subtract from it. `IMAGE_NEGATIVE.peek` now derives from
  it rather than duplicating the list.
- **Three optional image-only fields on a `PEEK_VIEW_ACT` row** — `posture`,
  `staging`, `dropNegative`, `addNegative`. **A row declaring none behaves
  byte-for-byte as it always did**, asserted in section 3, which is why only the
  17 rows that needed it changed.
- **`PEEK_STAGING`** — shared staging for the two sleep acts and the eight
  camera acts, so they cannot drift apart one row at a time.
- **`composePeekNegative(actKey)`** (image.js) — the base minus the act's drops
  plus its adds. **`'looking at the viewer'` can never be dropped**, even by an
  act that declares it: it is the one term keeping the subject unaware of the
  PEEKER rather than of their own camera. Both generation sites
  (`getPeekImage`, `rerollPeekFrame`) send it.
- **The camera acts are staged, not fought.** They drop the term that names the
  act and gain geometry in the positive — the camera is across the room, the
  body side-on to the door — so the model has somewhere to put a camera that is
  not the keyhole.
- **`PEEK_PROMPT_VERSION` ('k2')**, folded into `composePeekKey`. Every peek
  prompt changed, so every cached peek frame is stale — but nothing else is, and
  bumping the global `IMAGE_PROMPT_VERSION` would have thrown away every
  portrait, plate, dream panel and avatar in the save to fix a keyhole.
- **Fixed in passing:** `roomName.toLowerCase()` ("bathroom a" → "Bathroom A"),
  and `composePeekViewLine`'s `'they'` fallback that composed "they is asleep in
  bed" (now `'someone'`, which agrees with the frames' singular verb).

**The harness assertion that would have caught the original bug**
(`verify-peek-prompt.js` section 1): *for every act, no multi-word phrase in the
composed positive prompt may also appear in that act's own composed negative* —
with `"not looking at the viewer"` recognised as the prompt agreeing with the
negative rather than fighting it. Section 7 holds the other half: every act
phrase must reach BOTH the prompt and the narration, which is the invariant that
was always true and must stay so.

**Two assertions I got wrong first and corrected** (worth knowing, because both
are easy to re-introduce): a regex guess at "static acts" wrongly caught the
in-bed SEXUAL acts, which are motion and deliberately keep `mid-motion` — the
test now reads what an act DECLARES; and a substring check for sexualising
language matched `"posed"` inside the framing's own `"natural unposed body
language"`, so it is word-boundary matched now.

---

## Not addressed

- **The act is still ~2 words in a ~90-word prompt** (point 4 above). Explicit
  per-act staging is the mitigation, not a fix. If frames still read generically,
  the next lever is trimming `buildVisualCharacterClause` for this surface.
- **The remaining ~40 acts have no staging**, which is correct — they were never
  contradicted. They will look generic rather than wrong, and any of them can
  gain a `staging` line at any time with no code change.
