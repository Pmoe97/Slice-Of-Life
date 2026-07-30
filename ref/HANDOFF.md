# Handoff: Slice of Life sandbox expansion

Paste this whole file as your first message in the new chat.

## What this project is

"Slice of Life" is an AI-narrated apartment life-sim built as a **Perchance
generator** — vanilla ES2020 JS, multi-file `src/` (Perchance's editor now
supports this; no bundler, no build step, no npm), a `kv-plugin` for
persistence, `ai-text-plugin`/`text-to-image-plugin` for LLM narration and
scene art. No test harness. Git repo initialized this session
(`C:\Projects\Slice-Of-Life`, currently on `master`, 12 commits, clean tree).

The user's goal: an apartment sandbox "limited only by the player's
imagination" — a real diegetic computer (work, browsing, streaming, adult
content, classifieds, shopping, courses, hired services, IM) plus the same
depth across the whole apartment (cooking, cleaning, decorating, spying,
sneaking, stealing). It should read as a lived-in house with real problems,
not a management sim.

## Read this first

**`ref/ARCHITECTURE.md`** is the living design record — it has a phase-by-
phase status table at the top and a detailed section per phase below,
including exact file/function names, design rationale, and the specific
verification each phase went through. It is long (800+ lines) but it is the
source of truth for what exists and why. Read it before touching anything.
Update it — same style, same level of detail — as you complete more work.
Don't let it drift out of sync with the code.

**`git log --oneline`** — each commit is a coherent, tested milestone with a
detailed message explaining what changed and why. `ref/Original Prompt and
Response Train.txt` is the original design brief (pre-existing, authoritative
for the base game's invariants).

## Status: P0–P4 done, P5–P8 not started

- **P0** — Effects engine (`effects.js`), data-driven action registry
  (`actions.js`/`defs.actions.js`), tone/content prompt wiring.
- **P1** — World object model (`world.js`/`defs.world.js`): ~28 object defs,
  seeded instances, derived room ownership/cleanliness.
- **P2** — Items and inventory (`items.js`): ITEM_DEFS, recipes,
  object/item effects fully wired, recipe-driven cooking.
- **P3** — Skills (`skills.js`): XP→level curves, six outcome curves.
- **P4** — **The computer, complete**: all 8 apps — WorkHub, Nile (shop),
  Browser, EduStream (classes), HomeCare (services), RoomList (classifieds,
  produces real move-ins), Messages (IM, real LLM conversations), Streamly.

**Not started**: P5 (free-text actions routing through the effect/action
system instead of going straight to the LLM), P6 (stealth — witnesses,
evidence, suspicion), P7 (NPC autonomy — the house acting on its own), P8
(content volume expansion). These were all scoped in the original
architecture plan; ask the user if that plan's details survived in prior
chat history, or re-derive scope from `ref/ARCHITECTURE.md`'s references to
"P6", "P7" etc. sprinkled through the P1–P4 writeups (e.g. stealth's
`accessScope`/evidence hooks are already stubbed in Services/Classifieds).

## Hard invariants — do not break these

- **Zero LLM inside ticks/day-rollover.** `resolveTick`, `resolveBatch`,
  and anything called from `processDayRollover` must stay synchronous and
  LLM-free. Classifieds' applicant generation deliberately uses `llm.js`'s
  deterministic `fallback*` prose generators, never a live `generateText`
  call, for exactly this reason.
- **Max 2 active NPCs** in any scene/conversation (`SCENE.maxActiveNpcs`).
  IM threads are 1 active NPC each — never violate this.
- **Bibles are frozen.** Nothing writes `npc.bible` after creation. Boundary
  logic (P6, when you build it) must read `bible.boundary` and match it
  against a lookup table (see `BOUNDARY_POOL` in `config.js`), never migrate
  or mutate the bible itself.
- **The LLM never chooses a mechanical value.** It proposes bounded effects
  (validated by `effects.js`'s `validateEffects`) and writes flavor prose
  that gets frozen on first use. Everything that gates, scores, or resolves
  is deterministic and seeded.
- **`applyEffects` (effects.js) must stay synchronous, in-memory only.**
  This is what lets a future NPC-autonomy pass (P7) call it from inside a
  pure tick. Don't make it async, don't have it touch kv directly.
- **`state.js` is the sole kv access point.** Every other file goes through
  its accessor functions (`getWorld`/`setWorld`/`getObjectBucket`/etc.),
  never `root.kv` directly.
- **No magic numbers outside config.** New tunables go in `config.js` or a
  `defs.*.js` sibling, not inline in logic files.
- **Zero inline styles.** CSS lives in `main.html`'s `<style>` block, JS
  only toggles classes/`data-*` attributes (see the `.fill[data-fill="N"]`
  bucket pattern used for every progress bar).
- **`render()` (render.js) is idempotent and state→DOM only.** No app state
  may live only in the DOM — `render.computer.js`'s hard rule is that the
  entire computer screen is derivable from `gameState.world.computer`.

## Load order matters

`main.html`'s `<script>` tags ARE the dependency graph (classic scripts,
shared global scope, no modules). Current order:

```
config.js → defs.world.js → defs.actions.js → defs.computer.js → state.js
→ sim.js → world.js → items.js → effects.js → actions.js → skills.js
→ computer.js → npc.js → prompt.js → llm.js → image.js → render.js
→ render.computer.js → ui.js → ui.computer.js
```

Rule: if a new file's *top-level* code reads another file's `const` data
at **load time**, the dependency must load earlier. Function *calls* into a
later-loaded file are always fine — they only execute at runtime, after
every script has loaded (e.g. `ui.js`'s `boot()` calls functions from every
other file with no ordering problem, since nothing runs until the last
script tag has executed).

**A JS gotcha that cost real debugging time twice this session**: top-level
`const`/`let` in a classic `<script>` are lexical bindings, NOT `window`
properties (only `var` and function declarations are). Never write
`window[someString]` to look up a `const`-declared registry — it silently
returns `undefined`. Use an explicit local registry object instead (see
`render.computer.js`'s `CATALOG_SOURCES` for the pattern).

## How to actually test changes (important, non-obvious)

**There is no test harness.** All verification this session was done by
opening `main.html` in the Claude Code browser preview pane and running
JS directly via the `javascript_tool`, mocking `root.kv` (Perchance's
kv-plugin) with a tiny in-memory Proxy-based mock, and mocking
`root.generateText`/`root.generateImage` as needed.

**Critical gotcha**: the browser preview pane snapshots `main.html` on
first load and does **not** re-fetch changed `<script src>` files on a
plain `navigate()` reload — even across closing and reopening tabs. If you
edit a file and re-test without accounting for this, you will silently test
stale code and get misleading results (this happened once this session).

**The fix**: after editing files, create a fresh `<iframe>` pointing at
`main.html?fresh=<timestamp>` via `javascript_tool`, wait for it to load,
then run your test code inside `iframe.contentWindow` via `.eval(...)` —
not by reading `iframe.contentWindow.SOME_CONST` as a property (won't work,
see the `const`-isn't-a-window-property gotcha above). Example pattern:

```js
// Step 1: create the iframe
(async () => {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = 'file:///C:/Projects/Slice-Of-Life/main.html?fresh=' + Date.now();
  document.body.appendChild(iframe);
  await new Promise(r => { iframe.onload = r; setTimeout(r, 3000); });
  window.__IFRAME__ = iframe;
})();

// Step 2 (separate javascript_tool call): run test code inside it
var w = window.__IFRAME__.contentWindow;
var testCode = `(async () => {
  // mock root.kv with an in-memory Proxy, mock generateText/generateImage,
  // call SIM_generateHouse / writeGeneratedGameState / loadGameState /
  // whatever you're testing, snapshot results with JSON.parse(JSON.stringify(x))
  // (NOT bare references — see the aliasing gotcha below), assign to
  // window.__TEST_OUT__
})();`;
w.eval(testCode);

// Step 3: read the result
window.__IFRAME__.contentWindow.__TEST_OUT__

// Step 4: clean up when done with that iframe
window.__IFRAME__.remove();
```

**Another gotcha**: when building a test-output object across multiple
`await` steps, always snapshot mutable state with
`JSON.parse(JSON.stringify(x))` at the point you capture it, not a bare
reference — otherwise later mutations to the same object retroactively
change what an earlier-captured field appears to show once the whole `out`
object is finally `JSON.stringify`'d. Bit this session twice; both times it
looked like a real bug until traced back to test-code aliasing, not product
code.

**Verification philosophy established this session**: don't claim something
works without actually running it against the real code and checking exact
values (not just "it didn't throw"). Every phase this session was verified
with specific assertions — exact dollar amounts, exact XP totals, exact
before/after deltas — not just smoke tests. Keep doing this.

## Working conventions established this session

- **Comments explain WHY, never WHAT.** No restating what a line obviously
  does. Comments capture non-obvious rationale, invariants, or "this looks
  wrong but isn't, because X" — matching the pre-existing codebase's own
  comment style (it's unusually well-commented; match that bar).
- **Commit after each coherent milestone**, not after every file edit. Git
  history this session is deliberately fine-grained (12 commits across
  ~5 phases) so any commit can be checked out as a working state. Commit
  messages are detailed — what changed, why, and a summary of what was
  verified. Follow that pattern.
- **`ref/ARCHITECTURE.md` gets updated in the same commit as the code**,
  with a section per phase: what was built, key design decisions and why,
  and a "Verified:" paragraph with specific numbers.
- **Stop at consistent checkpoints, not arbitrary ones**, if you're running
  low on context/budget — mid-phase is fine as long as nothing is left in a
  broken cross-file state (half-migrated function signatures, etc.). This
  happened once this session (P2 split across two commits) and worked fine.
- **Dead code**: delete it outright when confirmed unused, don't leave
  commented-out remnants or compatibility shims. Several genuinely-dead
  pre-existing functions (`moveToRoom`, `createBlankPair`,
  `residency.status:'prospective'`) got real callers during this session
  instead of staying dead — check whether something "unused" is actually
  reserved for a not-yet-built phase before deleting it.
- **Small bugs found while building something else get fixed inline**, not
  deferred — e.g., a missing `dirtyWhen` on the bed object, a `renderInventory`
  that didn't know about the new stack shape. Note them in the commit
  message and `ARCHITECTURE.md` so the fix isn't a mystery later.

## Immediate next step

Ask the user whether to continue straight into P5 (free-text action
routing), P6 (stealth), P7 (autonomy), or P8 (content volume) — or whether
they want to playtest what exists first. Given the computer is now fully
built and the base action/effect engine is solid, P6 (stealth) is probably
the highest-narrative-payoff next step since Services/Classifieds already
left hooks for it (`accessScope`, evidence-shaped data), but that's a
suggestion, not a decision — confirm with the user before starting.
