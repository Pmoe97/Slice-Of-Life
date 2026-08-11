# `dev/verify/` — the regression suite

Not part of the shipped game. `main.html` never loads any of this.

```bash
node dev/verify/run-all.js        # everything, with a total
node dev/verify/verify-s3.js      # one harness on its own
```

## Why this works at all

`loadgame.js` brings the **entire engine** — every file from `config.js`
through `interruption.js` — up inside a bare Node `vm` context with five
stubs (`window`, `root`, and a `mulberry32` seed). No browser, no Perchance
runtime, no `root.kv`.

That means `resolveTick`, `SIM_generateHouse`, `evaluateDrives`,
`perceiveSignals`, `composeScene` and every pure function in the project are
directly callable against real generated houses. **Prefer this to the iframe
technique described in `src/ref/structural/ARCHITECTURE.md`** for anything
below the render layer: it is faster, it has no snapshot-staleness problem,
and it is what made the Plan 0 need rebalance tunable at all.

It stops before `render.js`/`ui.js`, which need a DOM. Those are verified in
`dev-harness.html` (see below).

## What is here

| File | Covers |
|---|---|
| `loadgame.js` | The loader. Everything else requires it. |
| `run-all.js` | Runs every `verify-*.js`, totals, exits non-zero on failure. |
| `verify-p1..p5.js` | Plan 0 — NPC correctness fixes |
| `verify-s1..s5.js` | Plan 1 — perception & signals |
| `verify-r1.js`, `verify-r34.js`, `verify-r5.js` | Plan 2 — the scene reader (Phases 1, 3+4, 5) |
| `measure.js` | NPC need economy: prints per-need ranges against drive gates |
| `measure-signals.js` | Signal propagation: how far each channel actually reaches |
| `demo-r1.js` | Renders `composeScene`'s output as prose in the terminal |

The two `measure-*` scripts are **tuning instruments, not tests**. They print;
they do not assert. Plan 0 Phase 4 and Plan 1 Phase 1 both had their numbers
set by running these and looking, after a first pass set by arithmetic came
out wrong in both directions. Re-run them after changing any rate.

## Rules that keep this useful

1. **A phase is not done until its harness passes.** Every plan phase that can
   be verified here has been.
2. **Assert the invariant, not the implementation.** The valuable assertions
   in here are things like "`composeScene` never mutates state", "there is
   exactly one `perceiveSignals` in the tree", "every declared signal has a
   reachable emitter" — they catch a class of mistake, not one instance.
3. **When a harness fails, decide whether the code or the assertion is
   wrong.** Several assertions in here were the thing that was wrong: a
   `undefined < 0.01` comparison that failed on the best possible outcome, a
   mood-target check that compared across rooms with different cleanliness,
   an orphan check written before transient signals existed. Fixing the test
   is legitimate — silently loosening it is not, so say which you did.

## The DOM half

Render and UI work needs a browser:

```bash
# .claude/launch.json has a `slice-of-life` config on port 8734
python -m http.server 8734
# then open  http://localhost:8734/dev-harness.html?cb=1
```

`dev-harness.html` shims the Perchance runtime and replays `main.html`.
**Always append a cache-buster** (`?cb=2`, `?cb=3`…) — the browser caches the
harness itself and will silently serve a stale copy of your edit.

Drive it from the console rather than clicking through:

```js
document.querySelector('[data-action="menu.new-game"]').click();
document.querySelector('[data-action="generate-cast"]').click();
document.querySelector('[data-action="approve-cast"]').click();
// currentGameState, doMove, addLogEntry, spawnNote, composeScene,
// renderSceneReader — all reachable by bare name.
```

Its kv shim must list every folder the game touches (`meta player world npcs
objects images snapshots menu saves saveIndex`). A missing one fails at boot
with `Cannot read properties of undefined (reading 'get')`, which reads like a
game bug and is not one.
