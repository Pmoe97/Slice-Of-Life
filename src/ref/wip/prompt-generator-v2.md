# Prompt generator v2 — decision-vector architecture

Status: **engine implemented (pass A) + authoring pass B + preferences UI (pass C) + gender-aware refinement (pass D)**.
The decision-vector roll + guard repair + preference filters + `?prompt=` debug
dump are live in `defs.menu.js` (v7) and `genTitlePrompt` is rewired. Pass B
grew every pool past the §1 targets: intensity 13, gathering 3, setting 44,
actor 56, clothing 16, pose 56, activity 77, emotion 26, framing 10, kink 10
(free use, bored & ignored, praise, teasing denial, aftercare, semi-public,
lazy wake-up, worship, bratty), style 6, timeOfDay 8, weather 7. Pass D added
gender-aware activities (`needs` on acts whose recipient matters — blowjobs
need an m/nb actor, cunnilingus needs an f/nb actor), enforced at roll time
and during guard repair, so a lesbian scene never gets "being blown" and a gay
scene never gets "eaten out" (verified zero leaks over 800 rolls). A coherence
guard forces nudity whenever an explicit-intensity scene lands on a plain
mundane activity with everyone dressed. Pass C shipped the Options-menu
cast-preferences toggles (3 gender pools + 3 orientation pairings, "keep at
least one" guard, persisted via `menu`/`prefs`, honored by the engine live).
Measured in-engine combo floors: sfw ~10¹², suggestive ~5×10¹³, explicit
~10¹⁵. **Remaining (optional):** more community kinks, and any further
per-activity `needs`/`p` refinement as the pools grow.

## Goals

1. **Kill the mad-lib.** A prompt today is a single chain of 4 slot picks, so
   range ≈ `subjects × poses × emotions × settings` and incoherent mixes
   happen (explicit pose + wholesome activity, nude clothing + "chopping
   vegetables"). Replace it with a **decision vector**: ~11 independent slots
   rolled **in parallel**, then cleaned by a **conditional-rule layer** so
   incompatible parts are pruned/resampled — a deliberately
   network-like shape: parallel excitations + a constraint pass.
2. **Massively widen the palette.** New slot *kinds* — intensity level,
   gathering scale (solo/duo/group), clothing state, framing/camera,
   time-of-day, weather, lighting mood, style — plus much larger per-slot
   lists spanning the whole content range: totally SFW, tasteful, sensual,
   lewd, carnal, hardcore; solo, partner, group scenes.
3. **> 300,000 distinct prompt combinations.** With ~11 slots the product
   clears this by orders of magnitude even in the most restrictive band (see
   §5). The *effective* count after guard pruning is still ≫ 300k.
4. **No regression to rating gating.** `contentConfig` still decides the
   ceiling via `menuRatingCap` (sfw / suggestive / explicit). The gating
   moves *into* the roll (intensity is chosen from the allowed band first),
   instead of being a post-hoc filter over an unconditional pool.
5. **Drop-in.** Keep `genTitlePrompt(contentConfig, orientation)` as the
   public entry point so `image.js`'s slideshow needs **zero** changes
   (orientation-aware generation, LRU caching, orientation-tagged keys all
   keep working untouched).

## 1. The decision vector

A generated prompt is one drawn **vector** — an object with a value for every
slot. Slots divide into two kinds by *when* they're rolled.

### Layer 1 — context slots (rolled in parallel, first)
These frame the scene. They are rolled **at the same time** from their own
domains (no sequencing), forming the context vector that every detail slot
is conditioned on:

| slot | meaning | target size | band-tagged |
|---|---|---|---|
| `intensity` | intimacy/mood level | 12 (4 sfw · 4 suggestive · 4 explicit) | yes — this is the master band |
| `gathering` | solo / duo / group | 3 | no |
| `setting` | concrete place | 40 | yes |
| `timeOfDay` | dawn … night | 8 | no |
| `weather` | clear … storm, season tints | 7 | no |
| `framing` | camera/composition | 10 | yes (intimate framings gated) |

### Layer 2 — detail slots (rolled in parallel, conditioned on the context)
Each detail slot's *eligible pool* is pre-filtered by the context values
before the roll. This is where most strange combinations die before birth:
- `subjectA` — primary actor (50; band-tagged)
- `subjectB` — secondary actor; pool is `[none]` when `gathering == solo`,
  otherwise a 40-entry actor pool (band-tagged)
- `clothingA`, `clothingB` — 16 entries (8 dressed / 4 partial / 4
  nude-lingerie-towel); pool filtered by `intensity` band + `activity` +
  `setting` (e.g. "nude" only offered for private/bedroom/shower contexts)
- `pose` — 45 (20 solo · 15 pair · 10 group); pool filtered by `gathering`,
  `intensity`, `activity`
- `activity` — 55 (25 sfw · 12 suggestive · 18 explicit); pool filtered by
  `gathering` and `intensity`
- `emotion` — 25 (band-tagged)
- `style` — 6 lighting/mood styles (cozy, moody, dreamy, cinematic, neon,
  natural)

All detail slots roll **in parallel** — the conditioning is one-way
(context → detail), details are independent of each other *until* Layer 3.

## 2. Layer 3 — conditional guard rules

Cross-slot incompatibilities that per-slot conditioning can't see are caught
by a declarative rule list. Rule shape (as implemented):

```js
{ when:  { slotName: [ids] } | predicate(v),   // AND across keys, or a function
  fix:   { slot: 'slotName', filter: pred } }  // resample that slot, filtered
```

Algorithm: roll the full vector (L1 + L2 in parallel), then sweep the rules;
each violated rule resamples its `fix.slot` (bounded — max 8 repairs per
roll). If a roll still can't satisfy the rules, re-roll the whole vector (max
3). The final fallback is a tiny hardcoded guaranteed-safe template (sfw,
solo, cozy) so generation can never hang or emit nonsense.

Representative rules (the full set is authored with the lists):

- `clothing ∈ {nude, lingerie, towel, underwear}` ⇒ `activity` must be
  private/intimate (`shower, bath, bed, lounging, sleeping, massage,
  dancing, changing, sunbathing`) — never `cooking, watering plants, …`
- `activity ∈ {kissing, cuddling, embracing, dancing together, washing
  each other, massage}` ⇒ `gathering ∈ {duo, group}`
- `pose ∈ {on hands and knees, arched back, spreading, …}` ⇒ `intensity`
  band ≥ suggestive **and** `activity` is bed/couch/floor-appropriate
- `gathering == solo` ⇒ `subjectB == none`, all pair poses/activities out
- `framing ∈ {POV intimate, close-up on lips, …}` ⇒ `intensity` ≥ suggestive
- `intensity` band == explicit ⇒ `emotion ∉ {innocent, shy, wholesome}` and
  `subjectA.clothing ∈ {nude, partial}`
- `weather == snow` ⇒ `setting ∉ {beach, rooftop bar, balcony tropical}`
- `intensity` sfw ⇒ no suggestive/explicit entries anywhere (master gate)

Cost is trivial: rules run on a tiny vector; a roll is
`O(slots) + O(rules × repairs)`.

## 3. Rating gating (unchanged contract)

`menuRatingCap(contentConfig)` still returns `sfw | suggestive | explicit`.
The context roll picks `intensity` **from the cap-filtered band set** first;
every conditioned pool is then within that band by construction, and the
guard rules enforce the few stragglers. The vector's effective band is the
`intensity` band, so the assembled prompt's prefix/suffix (`MENU_ART.prefix/
suffix`) match today's contract. The finer intensity labels map onto the
three bands (e.g. *flirty/suggestive* → suggestive; *sensual, tasteful_nude,
lewd, carnal, hardcore* → explicit with increasing explicitness for the
suffix).

## 4. Prompt assembly

`promptFromVector(v, orientation)` concatenates in a fixed order:

```
[band prefix]
subjectA [and subjectB]
[clothing state] [pose] [activity] [emotion]
in [setting], [timeOfDay], [weather], [framing]
[orientation hint] [style] [styleTail]
[band suffix]
```

The orientation hint / styleTail / negative prompt from v1 carry over
unchanged (`defs.menu.js` `ORIENTATION_HINT`, `MENU_ART.styleTail/negativePrompt`).

## 5. Combo math (why >300,000 is a floor, not a stretch)

Lower-bound product for the **most restrictive band** (SFW, `gathering =
solo`, `subjectB = none`), using the target list sizes from §1:

```
intensity 4 × setting 30 × time 8 × weather 7 × subjectA 35
  × clothing 8 × pose 18 × activity 30 × emotion 20 × framing 6 × style 6
≈ 4 × 30 × 8 × 7 × 35 × 8 × 18 × 30 × 20 × 6 × 6
≈ 7.3 × 10^11   (730,000,000,000)
```

Duo/group add `subjectB` (×30) and the pair/group pose+activity pools, which
multiplies the space further. Suggestive and explicit bands are the same
order of magnitude. Even after guard rules remove — say — 99.9% of raw
combinations as incompatible, the surviving space is still ≫ 300,000 in every
band. (Sanity check, deliberately pessimistic: 1 SFW slot of 35 + 8 + 18 + 30
+ 20 alone = 3M before touching intensity/setting/time/weather/framing.)

> Two "distinct prompts" here means at least one slot differs; identical
> strings from the same roll are deduped by the cache anyway
> (`menu_<rating>_<o>_…` keys).

## 6. Migration path

- **Data**: all slot lists + rules live in a new `PROMPT_V2` block in
  `defs.menu.js` (same file, no new imports/script tags). v1's
  `subjects/poses/emotions/settings` entries migrate into
  `subjectA/pose/emotion/setting` verbatim (they're already rating-tagged);
  `intensity/gathering/clothing/activity/framing/timeOfDay/weather/style` are
  new. `MENU_ART.negativePrompt/styleTail/prefix/suffix` are reused.
- **Engine**: `rollPromptVector(contentConfig)`, `promptFromVector(v, orientation)`,
  `resampleForRules(v)`, and the `PROMPT_RULES` table — all in `defs.menu.js`.
  `genTitlePrompt(contentConfig, orientation)` becomes: roll vector → guard
  repair → assemble. Signature unchanged.
- **image.js / config.js**: no changes. Caching, orientation keys, the
  viewport crop, and the saved-pool cap (now 100) all operate on the finished
  blob and never see the prompt internals.
- v1 `MENU_ART` stays until v2 is proven; v2 can fall back to it
  (v1 is a subset of v2's slots with `gathering=solo`, v1 lists as pools).

## 7. Open questions for the user

1. **Pairings**: should `subjectA`/`subjectB` support explicit gender/orientation
   pairings (ff / mm / mf / mixed group), or stay gender-agnostic like v1?
   A `pairing` slot (band-agnostic) would multiply the space again.
Answer: Fully inclusive pairings, mixed race, gender, sexual orientations, fully supported in explicit
prompts. We should include a full preference toggle section in the options menu to allow players to
enable or disable based on their preference (remove male or female actors, sexual orientation based pairings-- hetero, gay(m-m), lesbian (f-f), etc.
2. **Group + hardcore**: include explicit group scenes (threesomes) under
   `gathering=group`, or keep hardcore solo/duo only?
No more than 4 actors to avoid confusing the image generator, we have to be clear to clearly seperate 
actor descriptions in a way that makes generator confusion less likely to occur. But yes, full group support.
3. **Content authoring volume**: target sizes in §1 mean ~280 new/expanded
   list entries (settings, activities, poses, actors, clothing, framing).
   Implement the full authoring now, or start with the engine + current
   v1-derived lists at ~half the target sizes and grow?
We will do work in phases. Engine first, then authored work in AT LEAST TWO or more passes to maximize returns.
4. **Sanity knobs**: expose a `$meta`/config toggle (e.g. a debug `?prompt=`
   URL param) to dump the current vector, so list-vs-guard mistakes are
   visible during authoring?
Yes. Do that.
Note: I do not mind explicit paired with mundane, I actually find it facsinating and sexy. Full nudity
while doing ordinary things, or pairing masturbation/sex with otherwise ordinary settings. Fucked while
cooking, eaten out/blown while playing video games. "Bored & Ignored" and "Free Use" are popular kinks 
among my community.