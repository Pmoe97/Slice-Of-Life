# Player creation and the opening cutscene

Status: **built and complete** — all 6 phases, D1-D20 locked, 71 assertions
in `dev/verify/verify-intro.js`. The 16 pregenerated images landed
2026-08-14; `INTRO_BEATS[].image` is fully populated and the reel plays.

Companion to `complete/game-opening-plan.md`, which designed the inheritance
opening and marked itself built. It was half right.

---

## The thesis

`game-opening-plan.md` shipped the *mechanics* of the Stardew-like opening —
solo start, rent grace, a wrecked apartment — and never shipped its *fiction*
or its *protagonist*. Three specific holes:

1. **New Game did not do the solo start.** `menu.new-game` routed to
   `showCharCreationModal('random')`, the legacy form whose "Number of
   Roommates" select defaults to **2**. `startSoloGame()` was written,
   correct, and reachable from no button in `main.html`. The empty-bedrooms-
   as-scoreboard premise the entire rent economy rests on was not what
   pressing New Game actually produced.
2. **The player had no name.** `player.name` appeared exactly once in the
   codebase, as a fallback that always fired: `gs.player?.name || 'You'`.
3. **The inheritance was told, never shown.** Del Connors' bible and his
   twelve seeded memory facts are entirely about the grandfather; his welcome
   IM opens *"you're the one who inherited the old place."* The simulation
   already believed a story the player had never been told.

This plan builds the missing half: a full-screen Player Design studio, a
first-class player identity, an intimate layer on every character, and the
cutscene that finally tells the story Del has been remembering all along.

### What this plan is *not*

- **Not a tutorial layer.** The cutscene ends in the entryway and hands to
  the game. Del's `CONTRACTOR_TUTORIAL_MILESTONES` already fire on their own
  triggers and needed nothing.
- **Not the intimacy system.** It builds the *substrate* that system will
  read — `physical.intimate` on every character, with one gated reader — and
  deliberately stops there. `preferences` is not in the schema precisely
  because nothing consumes it yet.
- **Not a rewrite of cast creation.** The legacy form still exists and still
  works; it moved from the New Game button to the debug panel.

---

## Locked decisions

### The surfaces
- **D1** — The studio is its own full-screen surface (`#player-studio`,
  z 200), a sibling of `#main-menu` (z 190), not the modal. The title screen
  stays visible behind it: pressing New Game never blanks the backdrop.
- **D2** — New Game routes studio → cutscene → `startSoloGame`. The legacy
  `new-game-{random,guided,manual,seed}` actions survive, reachable only from
  the debug panel, because a pre-populated household is genuinely useful for
  testing anything downstream of one.
- **D3** — Neither pre-game surface may call `closeMainMenu()`. It stays the
  single point where the game shell is uncovered, so a path that forgets to
  finish fails loudly with a blank screen instead of half-starting a game.
- **D4** — Skip and "watched every beat" are the *same* ending
  (`doIntroSkip` → `finishIntro` → `startSoloGame`). There is no second path
  into play to keep in sync.

### The intimate layer
- **D5** — It lands on **both** player and NPCs, as one nested
  `physical.intimate` group. The nesting is load-bearing: it gives the
  describer **one** gate to check instead of a gate per field.
- **D6** — `body.chestSize` is **not** replaced. It remains the *clothed*
  silhouette every ordinary scene reads; `intimate.breasts` is the undressed
  detail. Two levels of detail because there are two contexts.
- **D7** — The gate is a three-part conjunction of three *different kinds* of
  check, so no single mistake opens all three: the caller opted in
  (`opts.intimate`), the content flags allow it (via `activeContentFlags`,
  the same notion the browser's adult sites use), and the subject is actually
  `clothing === 'undressed'`.
- **D8** — The gate **fails closed**. A caller that opts in without passing
  `gameState` is refused rather than falling back to `CONTENT_CONFIG`'s
  defaults, which have everything on by design and would turn a forgotten
  argument into an open gate.
- **D9** — `genitals` is an **array of typed objects** discriminated on
  `type`, so one character can carry more than one set.
- **D10** — The schema's `itemFields` is the **union** of every type's keys,
  because `resolveNpcFieldSpec` resolves an array element against one flat
  map and nothing else. Teaching it a type-dispatched shape would mean a
  second validator for one field, and "the tab contents and the save
  validator share one schema" is the invariant the Character Studio rests on.
  `GENITAL_TYPE_FIELDS` says which keys actually *apply*; `normalizeGenitals`
  strips the rest. Three readers, one table.
- **D11** — `preferences` is deliberately absent. `genitals` was pruned once
  for having no reader (`npc-correctness-fixes-plan.md` Phase 5), and adding
  a field in that state again would earn the same prune.

### Generation
- **D12** — The intimate group is **not** rolled inside `generatePhysical`.
  It derives from `gender`, which both callers resolve *after* that function
  returns; folding it in would hoist the gender draw and change what every
  existing seed produces. It is a separate `generateIntimate` call each
  caller makes once it knows the gender, appending draws at the end.
- **D13** — The guarantee lives in `createNpcFromBible` (`ensureIntimate`),
  not in the roller. A generated cast is not the only way an NPC is made —
  `CONTRACTOR_BIBLE` is hand-authored, escorts come from a roster, and
  `importCharacter` takes one from a file. **This was found by the harness:**
  Del Connors shipped without a body until the assertion caught him.
- **D14** — On the authored merge, objects **merge** and arrays **replace**.
  Authoring `breasts.size` must not drop the rolled shape; authoring a
  `genitals` list must not be unioned with the rolled one, or a player who
  deliberately removed a part gets it handed back.

### The portrait
- **D15** — The prompt is a **snapshot, not a binding**. Built from the
  fields, then freely editable; the moment the player types in it,
  `promptDirty` latches and no field change, no reroll, and no confirm ever
  rebuilds it. Only an explicit "Rebuild from fields" clears the latch.
- **D16** — A portrait record stores prompt + seed, never the blob — the
  image cache is a shared LRU that can evict the pixels. Same reasoning as
  `takePhoto`'s photo records.
- **D17** — The portrait prompt does **not** opt into the intimate layer. A
  character-sheet portrait is a clothed shot.

### The cutscene
- **D18** — Images are **pregenerated and identical for every player**. The
  framing *is* the content: every shot is composed to obscure the
  protagonist — hands, silhouettes, objects on tables — so one set of art is
  truthful for every body the studio can build. A generated intro would have
  to draw the player, which is exactly what these shots avoid.
- **D19** — `image` is a URL string, any origin, data: URIs included, so the
  hosting decision stays open. A blank URL and a URL that 404s are the **same
  case**, handled the same way: text-only card, sequence plays on.
- **D20** — The grandfather's identity is **derived** from the player's
  surname (`Julius {surname}`), which is why the studio asks for a surname at
  all rather than a single name field.

---

## Data model

### `physical.intimate` — on `CHARACTER_SCHEMA.bible.physical` (Phase 1)

```js
intimate: {
  breasts:  { size, shape, areola, nipples, sensitivity },
  genitals: [ { type: 'vagina'|'penis', ...per-type keys } ],   // 0..4
  bodyHair: '',
}
```

Per-type keys, from `GENITAL_TYPE_FIELDS` (config.js):

| type | keys |
|---|---|
| `vagina` | labia, color, hair, sensitivity, description |
| `penis` | length, girth, cut, balls, hair, sensitivity, description |

`GENDER_DEFAULT_GENITALS` maps the five-value gender enum to a default set;
`futanari` is the only draw carrying two. It is a **default, not a
constraint** — the studio adds and removes rows freely, which is how a player
builds a body the enum has no single word for.

### `player` additions (Phase 2)

`name`, `surname` (strings) and `portrait: { prompt, seed, promptDirty }`.

### `INTRO_BEATS` — `src/srcfiles/defs.intro.js` (Phase 5)

`{ id, image, lines: [{ speaker, text }], sfx?, caption? }`, `speaker` one of
`'lawyer' | 'player' | null`. `{name}` / `{surname}` interpolate at play time.

---

## Implementation phases

| Phase | What landed |
|---|---|
| 1 | The intimate schema on everybody. New `PHYS_POOL_*` + `GENITAL_TYPE_FIELDS` + `GENDER_DEFAULT_GENITALS` (config), `generateIntimate`/`rollGenitals`/`normalizeGenitals`/`ensureIntimate` (sim), the gated reader `composeIntimateDescription` + `intimateAllowed` (npc), migrations `npcs` 6→7 and `player` 4→5. |
| 2 | Player identity. `PLAYER_SURNAME_POOL` + `rollPlayerName` (sim), `player.name`/`surname`/`portrait`, `SIM_generateHouse`'s 4th param widened `playerAppearance` → `playerDraft`, the object-merge/array-replace rule in `generatePlayerAppearance`. |
| 3 | The studio. New `src/srcfiles/studio.js` + `#player-studio` markup/CSS. Seven tabs generated from `PLAYER_STUDIO_TABS`; add/remove rows from `STUDIO_ROW_GROUPS` (one builder, three groups); every field validated through `validateNpcField`. `menu.new-game` rerouted; legacy form → debug panel. |
| 4 | The portrait. `buildPlayerPortraitPrompt` + `getPlayerPortraitImage` (image.js), the Portrait tab, the `promptDirty` latch. |
| 5 | The cutscene. `defs.intro.js` (16 beats) + the player in studio.js: two-layer crossfade, next-image preload, keyboard nav, skip, and the art-less layout. |
| 6 | Wiring. `startSoloGame(draft)`, its opening log line rewritten to follow the cutscene rather than restate it, every `?v=N` bumped, both new files added to `main.html` **and** `dev/verify/loadgame.js`'s `ORDER`. |

---

## Verification

`dev/verify/verify-intro.js` — 54 assertions, in `run-all.js` (1447 total,
all passing). Six groups, matching the six risks:

1. **Table agreement.** Every studio `schemaPath` resolves in
   `CHARACTER_SCHEMA`; every value a studio pool can *offer* passes
   `validateNpcField`; every `GENITAL_TYPE_FIELDS` key is in the schema
   union and no union key is unclaimed.
2. **Gender → genitals is total.** All five enum values produce a
   well-formed set; `futanari` gets two distinct types; an unknown gender
   falls back to a body rather than to nothing; every construction path
   yields one (this is the group that caught Del).
3. **The gate, one condition at a time.** Each of the three conditions is
   asserted OFF independently and shown byte-identical to the pre-plan
   output — and the positive case is asserted too, because every safety
   property here is satisfied perfectly by a gate that never opens.
4. **The authored merge.** Objects merge, arrays replace, `heightBuild`
   recomposes, foreign keys normalize out, a hand-edited prompt survives.
5. **Migrations.** Both backfills are deterministic and idempotent, touch
   nothing else, and do not invent a name the player never chose.
6. **`INTRO_BEATS` well-formedness.** Unique ids, no empty cards, every
   speaker known to the stylesheet, every `{token}` resolvable, and the
   script demonstrably uses `{surname}` for the will.

**DOM layer, verified live in the browser** (the harness stops before
render/ui): studio opens over the menu; Roll Everything fills the sheet;
changing a genital row's `type` rebuilds the row's fields; the `promptDirty`
latch survives a field change AND a full reroll and is cleared only by an
explicit reset; the cutscene interpolates `Julius Ashcombe` from the player's
surname; a real image renders letterboxed with the text scrim; a **broken**
URL degrades to the identical text-only card as a blank one; advancing past
the last beat ends and hands the draft to `startSoloGame`.

---

## The art direction

Held as data in `defs.intro.js`: `INTRO_ART` (style tail, negative prompt,
four colour grades) plus `shot` / `grade` / `prompt` on every beat.

- **Theme** — *a small life, interrupted.* The colour arc IS the story:
  `cramped` (cold fluorescent) → `threshold` (chiaroscuro, blown-out doorway)
  → `passage` (overcast, brightening) → `arrival` (the game's warm palette,
  through dust). Asserted monotonic, because a beat in the wrong act is a
  narrative bug rather than a nit.
- **Framing** — anonymity by CONSTRUCTION. Six techniques rotated
  (`SILHOUETTE` `HANDS` `POV` `OBJECT` `OTS` `EXTERIOR`) so there is no face
  to draw, rather than a negative prompt asking politely. The shared negative
  is a backstop; `verify-intro.js` asserts each people-bearing beat states its
  own anonymity, names no body part the player authors, and genders nobody.
- **Style is NOT on the beat.** Subject and framing are permanent; the look is
  one swappable constant (`INTRO_ART.styleTail`), because the global style
  picker is coming and a restyle must be one edit plus a regeneration, not 16
  rewrites. Asserted: no beat prompt contains a style word.
- **Two shots depend on legible text** and diffusion is bad at it —
  `document`'s "LAST WILL AND TESTAMENT" heading (expect to composite it in;
  the illegible body copy beneath is free) and `elevator`'s button, which
  reads `PH` rather than `PENTHOUSE` because two characters is inside what
  these models manage.
- **Known limitation:** `HANDS` shots show skin. No framing removes that; the
  mitigation is sleeves plus low-key/rim light in every one of them, which
  makes tone ambiguous rather than absent. A reduction, not a solution.
- **`later` works with no art at all.** A black title card is a real device
  and the cutscene's art-less layout centres the text for it. A prompt exists
  so that is a choice; both states are finished.

Regenerate the paste-ready sheet (always matches the repo):

```bash
node -e "const{loadEngine}=require('./dev/verify/loadgame.js');const{api}=loadEngine({required:['defs.intro.js']});const b=api('INTRO_BEATS');let o='# Intro reel\n\nNegative (all 16):\n\n```\n'+api('INTRO_ART.negativePrompt')+'\n```\n';b.forEach((x,i)=>{o+='\n## '+String(i+1).padStart(2,'0')+'. '+x.id+' · '+x.shot+' · '+x.grade+'\n\n```\n'+api('buildIntroPrompt(INTRO_BEATS['+i+'])')+'\n```\n'});require('fs').writeFileSync('dev/intro-prompts.md',o);console.log('wrote dev/intro-prompts.md')"
```

## Open questions (parked, none blocking)

- **A second style set.** The reel is one style; the global style picker
  will want more. The split that makes that cheap is already in place — the
  beats carry subject and framing, `INTRO_ART.styleTail` carries the look,
  so a second set is one edit and a regeneration of the sixteen.
- **External NPCs have no `physical` record at all** — `createExternalNpc`
  builds a bible without one, and the describer falls back to "a young
  adult". That predates this plan and inventing bodies for delivery drivers
  was not its job, but the boundary is now asserted, so whoever gives
  externals a body will be told the intimate group has to come with it.
- **Nothing reads the portrait after character creation.** It is stored and
  reproducible; no surface displays it yet. The phone's Camera app and the
  Character Studio are the obvious homes.
- **`intimate` has exactly one reader.** That satisfies RI6 today. The
  intimacy/sexting layer is what it was built for.

---

## Design invariants

1. **The player starts alone.** Inherited from `game-opening-plan.md`, and
   now actually true of the New Game button.
2. **A blank field rolls.** The studio's standing promise, carried from the
   old form to every one of its ~40 fields.
3. **One schema, one validator.** The studio cannot offer a value the save
   path would reject, because they resolve the same table.
4. **The intimate group is reachable through exactly one gate**, and that
   gate fails closed.
5. **The cutscene never blocks on art**, and never will.
