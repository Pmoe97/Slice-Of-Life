> **RETIRED 2026-08-25 — do not run this prompt.** All nine phases are built
> and verified and `dream-engine-plan.md` sits beside this file in
> `src/ref/complete/`. Its Status header says COMPLETE and its Status table has
> no unstarted row, so Step 0 below would correctly tell you to stop — this
> banner just saves you the reading. Kept as the design record of how the
> overhaul was run, and as the template `src/ref/patterns/` points at. Dream
> work from here is a change to a finished system: start from the plan's
> `## Locked decisions` (D1–D50), not from this protocol.

You are one session in a long-running series implementing the **Dream Engine**
overhaul for this game — the system that occasionally greets a sleeping or
napping player with a 1–3 panel illustrated dream, compiled deterministically
from their own save (who they snooped on, who they slept with, what an NPC did
in a room they never entered) by seeded selection from authored component
tables, written by the LLM only *into* that skeleton, rendered to images in the
background long before the player ever clicks Sleep, and filed afterwards into a
Dream Diary app on their phone and computer.

You have no memory of any previous session. Everything you need to know about
where things stand is either in the target document's **Handoff** section or
must be discovered by reading the current code — never assume continuity with a
prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status` table
in `src/ref/complete/dream-engine-plan.md`.

The first phase not marked "Done" is your phase.

**Exceptions to strict order:**
- Phases 2 (component tables) and 3 (residue harvester) are independent of each
  other and may run in either order once Phase 1 is done.
- Phase 8 (the Dream Diary app) needs only Phase 7's diary records and may run
  before Phase 9.
- Phase 9 (true dreams and recurrence) is purely additive — deferring it leaves
  nothing half-built.

**Hard prerequisites:**
- **Never start any phase before Phase 1.** Phase 1 registers `defs.dreams.js`
  and `dreams.js` in both `main.html` and `dev/verify/loadgame.js`; without it
  every later phase's harness dies with a `ReferenceError` that looks like a
  logic bug and isn't.
- **Never start Phase 4 before both 2 and 3.** The compiler selects from the
  tables and casts the residue; writing it against imagined shapes guarantees a
  rewrite.
- **Never start Phase 7 before Phase 6.** Presenting a dream whose images were
  never generated leads directly to generating them on the sleep click, which
  is the single thing locked decision D19 and Design invariant 3 forbid.

**External blocks:** verification for Phases 6, 7 and 8 requires the live
Perchance page, because `root.kv`, `root.generateText` and `root.generateImage`
are injected by the Perchance shell and are stubbed to throw in
`dev-harness.html`. If you cannot reach the live page, **stop and tell the
user** rather than declaring a phase verified from a local server or from
reading the code.

If all phases are complete, **stop** and report that completion to the user.

You should never need to fully read the whole plan document in a session.

## Step 1 — read the plan's Handoff section, then the relevant phase

- Handoff first — it is the single source of truth for where the last session
  left off.
- Then `## Locked decisions`, `## Data model`, your phase block, and
  `## Design invariants`. Skip the thesis and the evidence table unless you are
  about to argue with a decision.
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** Find things by name or content, never blindly by
  line number. A stale citation is expected, not an error. Do not spend session
  budget refreshing line numbers.
- If a phase's instructions conflict with what you find in the live code, or a
  locked decision turns out to be unworkable, **stop and flag it** — add a note
  under "Blockers / flagged deviations" and end the session there rather than
  improvising a silent workaround. A silent workaround looks like progress and
  surfaces three phases later.

## Step 2 — do exactly one phase, then stop

- Implement **only** that phase. Phase boundaries encode dependency order, risk
  and review granularity; pulling work forward destroys all three.

- **When told to reuse a pattern, go read that code and match its current
  shape** — do not work from this document's paraphrase. The patterns this
  overhaul mirrors, by name and file:
  - `getActionWindowImage` / `composeActionInstanceKey` (`image.js`) — the
    cached-getter idiom every new image surface must copy.
  - `takePhoto` and `getPhotoImage` (`image.js`) — the freeze-prompt-and-seed
    record discipline, and the comment above `takePhoto` explaining why a
    record never stores a blob.
  - `callAssessor` / `callChronicler` (`llm.js`) — the JSON call shape, the
    single-retry-on-parse-failure rule, and `recordParseTier` telemetry.
  - `callLLM`'s four-tier parse ladder (`llm.js`) — degradation, not exceptions.
  - `startInterruptionPreGeneration` (`interruption.js`) — speculative
    background generation, single-flight, and re-validating against
    `currentGameState` rather than a captured reference.
  - `presentActionOutcome` / `presentActionStep` / `renderActionWindow`'s
    `'picker'` and `'wardrobe'` body branches (`actionwindow.js`) — the window
    contract the dream viewer extends.
  - `doBoundarySleepRoom` (`ui.js`) — how a hand-written `doX()` verb presents
    an outcome window with a synthetic def.
  - `renderPhoneCameraGallery` / `renderPhoneCameraDetail` (`render.phone.js`)
    and the `APP_DEFS` `devices` field (`defs.computer.js`) — the two-surface
    app pattern the Dream Diary copies.
  - `renderScene` (`render.js`) — placeholder-then-async-swap with a `data-*`
    key stale-guard.

- **Hard technical rules:**
  - **Register a new file in `main.html` AND `dev/verify/loadgame.js`, in the
    same commit.** `rumination.js` shipped with only the first and silently
    killed five harnesses and 175 assertions.
  - **Bump every `?v=N` script tag together.** A partial bump is how you get a
    client running half-old code.
  - **Never call `root.generateImage` outside `image.js`.** Every panel goes
    through a cached getter or the LRU and the style funnel are both bypassed.
  - **Never draw from the global RNG stream.** The dream compiler uses its own
    `seededRng(...)`; a mid-stream draw shifts every existing seed's cast.
  - **`dreams.js` reads the knowledge, relationship and NPC memory systems and
    writes to none of them.** The only writes a dream may make are the wake
    tint through `applyEffects` and the engine's own `world.dreams`
    bookkeeping. This is what makes D7's omniscience safe; violating it turns
    the dream into an oracle and breaks the game's information economy.
  - **Never enumerate persisted keys in two places.** `world.dreams` must be in
    `SAVE_KEYS` *and* read back in `loadGameState`'s world literal. One without
    the other writes fine all session and reads back empty forever — this is
    the `castWeb` scar.
  - **Never generate on the sleep click.** Empty queue means no dream, silently.
  - **The LLM never decides structure.** If your phase gives the model a choice
    about form, cast, panel count, imagery or mood, you have misread D1 — stop
    and re-read it.

- **Actually run the phase's Verification steps.** Node harness work runs via
  `node dev/verify/run-all.js`; anything touching `root.kv`, the image plugin
  or the DOM must be verified on the **live Perchance page** — a local server
  proves nothing there. At minimum, for every phase: the **save/load
  round-trip** (does `world.dreams` come back with the same shape?) and the
  **clock and needs accounting** (did the sleep hook change how time or energy
  resolve?).

- Once the phase is verified, **stop.** Do not roll into the next one even with
  budget left. One phase per session is the point.

## Step 3 — mandatory: write the handoff note before ending, every time

Do this whether the phase finished, is partial, or is blocked.

1. **Overwrite** the plan's `## Handoff — read this first` section — Resume at /
   Last session's notes / Blockers. Not append; a growing history buries the
   current state. Name the real identifiers you created — table ids, function
   names, cache key prefixes, harness filenames — because the next session will
   grep for them.
2. **Update your phase's row in the Status table.** Never leave the Status
   table, the Status header and the Handoff disagreeing.
3. **Promote any resolved open question** out of `## Open questions` and into
   `## Locked decisions` as a new D-number.
4. **Phase-specific obligation:** if your phase added or changed any image
   prompt text, record whether you bumped `IMAGE_PROMPT_VERSION` and why — a
   prompt change without a bump leaves stale pixels cached against a key that
   no longer describes them, and nobody else will go check.
5. **If this was the last phase**, mark the plan's Status header complete, move
   both this prompt and the plan into `src/ref/complete/` together, and update
   the index rows in `src/ref/README.md` and
   `src/ref/structural/ARCHITECTURE.md` in the same commit. Also close out the
   Dream Engine item on `src/ref/wip/action-outcome-window-plan.md`, which has
   been waiting on this plan since its D11.

Do not end a session without doing this. A half-finished phase with a precise
Handoff note is recoverable; a half-finished phase with no note is not.
