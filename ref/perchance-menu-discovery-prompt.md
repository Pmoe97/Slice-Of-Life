# Perchance AI Helper — Main Menu & Slideshow Discovery Prompt

Hand the block below to the Perchance AI helper verbatim. It can read the
source of the referenced generators directly, which this repo's agent cannot.
Its output feeds **Phase 10** of `ref/inventory-needs-menu-saves-plan.md`.

Paste its returned markdown into `ref/perchance-menu-conventions.md`, then
re-run Phase 10.

---

## The prompt

> I need you to do an exploratory source-code read of three of my published
> Perchance generators and produce a single technical reference document. Do
> **not** write or modify any code — this is a documentation task only. I want
> to reimplement these patterns in a different generator, so I need enough
> concrete detail to rebuild them from your notes alone.
>
> The generators:
>
> - `https://perchance.org/lust-haven` — main menu style reference
> - `https://perchance.org/stellar-lust` — main menu style reference
> - `https://perchance.org/hedonism-island` — Discord image + link reference
>
> Read the actual HTML, CSS, and JS of each. Where the three differ, document
> each one separately rather than blending them into an average — I want to
> see the range so I can choose.
>
> Please cover, in this order:
>
> ### 1. Main menu structure
> - The exact DOM structure of the title/main menu screen: elements, classes,
>   ids, nesting, and any `<template>` tags used.
> - How the menu is shown and hidden — separate screen, overlay, class toggle,
>   or something else? What owns that state?
> - The full menu entry list for each game, in order, with the exact label
>   text, and what each one does.
> - How the menu behaves at boot versus mid-game. Is there a pause menu, and
>   does it reuse the same component?
>
> ### 2. Visual style
> - Complete CSS for the menu: layout method (flex/grid/absolute), alignment,
>   sizing, spacing, and how it responds to different viewport sizes.
> - Every color, with its actual hex/rgb value, and whether the game uses CSS
>   custom properties. If so, list the full custom-property block.
> - Typography: font families, where the fonts are loaded from, weights,
>   sizes, letter-spacing, text-shadow or outline treatments.
> - Hover, focus, active, and disabled states for menu entries.
> - Any transitions, animations, or keyframes — including entrance animations
>   when the menu first appears.
> - How the title/logo is rendered: image asset, styled text, or SVG? If an
>   asset, what are its dimensions and where is it hosted?
>
> ### 3. The background slideshow — this is the most important section
>
> I want to fully reimplement this, so please be exhaustive and quote real
> code rather than summarizing.
>
> - How images are generated: which plugin, the exact call signature, and
>   every option passed to it (resolution, style/model, guidance, negative
>   prompt, seed handling).
> - **How prompts are assembled.** I built these from compiled trait lists
>   (actors, sets, settings, poses, emotions, etc.) multiplied together. I
>   need: the full set of list names, roughly how many entries each holds, the
>   exact template or concatenation order used to build a final prompt string,
>   and any conditional or weighted selection logic.
> - Whether lists carry rating/NSFW tags, and how the code filters or mixes by
>   rating.
> - The slideshow loop: how long each image is displayed, the transition
>   effect and its duration, and how the two layers are cross-faded.
> - **Prebuffering and concurrency:** how many images are generated ahead,
>   how in-flight requests are tracked, and what happens if generation is
>   slower than the display interval.
> - **Caching:** is anything persisted between sessions (kv, localStorage,
>   in-memory only)? What's the cache key, and what's the eviction policy?
> - **Failure handling:** what is shown when generation fails, is rate
>   limited, or is disabled — and does the menu ever end up blank?
> - Any preloading of a first image so the menu isn't empty on initial paint.
>
> ### 4. Discord integration (from `hedonism-island`)
> - The exact markup for the Discord element on the menu.
> - The image asset: its URL, dimensions, and format.
> - Its CSS: placement, sizing, hover effect, and how it sits relative to the
>   other menu entries.
> - The invite URL, and the link attributes used (`target`, `rel`, etc.).
> - Whether any other social or external links sit alongside it, and how the
>   group is laid out.
>
> ### 5. Save / load menu, if one exists
> - Does any of these three games have a multi-slot save UI? If so, document
>   its layout, what metadata each slot card shows, and how slots are stored
>   in kv (key naming, record shape).
> - Any import/export or save-code feature, and its serialization format.
>
> ### 6. Reusable conventions
> - Anything shared across all three that reads as a house style — naming
>   conventions, a shared CSS reset or variable block, a common screen-manager
>   pattern, a standard button component.
> - Anything you'd flag as a mistake or a thing I did better in one game than
>   another.
>
> ### Output format
>
> Return one markdown document with a section per numbered heading above.
> Include **real code blocks copied from the source**, not paraphrases —
> especially for the CSS custom-property block, the prompt-assembly logic, and
> the slideshow loop. Where a game does something one of the others doesn't,
> say so explicitly. If you cannot find something, write "not found in
> source" rather than inferring it — I would rather have a gap I can fill than
> a plausible guess I can't distinguish from fact.

---

## Notes for the implementing agent (not part of the prompt)

- The target game already has `root.generateImage` wired through the
  `text-to-image-plugin` ([perchance.pjs](../perchance.pjs)), called at
  [image.js:106](../src/srcfiles/image.js), and an LRU image cache in
  `state.js`. Prefer adapting the discovered slideshow onto that existing
  plumbing over importing a second image path.
- The existing menu to replace is `showMenuModal`
  ([ui.js:2899](../src/srcfiles/ui.js)); boot flow is `boot()`
  ([ui.js:2990](../src/srcfiles/ui.js)).
- Content-rating filtering must respect the game's existing
  `meta.contentConfig`.
