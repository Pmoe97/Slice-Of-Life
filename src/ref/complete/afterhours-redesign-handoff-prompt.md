You are one session in a long-running series implementing the **AfterHours
Site Expansion** overhaul for this game — turning AfterHours into a
real-feeling adult website: a Pornhub + Eporner blended feed, a routed
mini-site (homepage, dedicated player page, related/suggested rail), a
campy parody ad network, watch persistence, and a "Hot Singles" section that
is genuinely populated by full NPCs (chat, befriend, meet in person, move
in). You have no memory of any previous session. Everything you need to know
about where things stand is either in the target document's **Handoff**
section or must be discovered by reading the current code — never assume
continuity with a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` header line and the `## Status`
table in `src/ref/complete/afterhours-redesign-plan.md`.

The first phase not marked "Done" is your phase — go to Step 1. The phases
must be done in order, with one deliberate exception: Phase 5 (ads/ticker/
toasts) needs only Phase 2 and can be slotted anywhere after it, so a session
that lands on it out of strict order is fine. Never skip Phase 1 before Phase
2 (every view in 2–4 is a blended search), never skip Phase 6 before Phase 7
(`world.afterHours.metNpcIds` lives there), and never skip Phase 7 before
Phase 8.

If all phases are complete, **stop** and report that completion to the user.

You should never need to fully read the whole plan document in a given
session — read the Handoff section, the "Locked decisions" section once so
you understand the shape, then the specific phase block (Goal / Files /
Verification) for the phase you're on.

## Step 1 — read the plan's Handoff section, then the relevant phase

- The plan's `## Handoff — read this first` section is the single source of
  truth for exactly where the last session left off — read it before anything
  else.
- Then read the plan's "Locked decisions" (every phase depends on them —
  especially the blend decisions, the sandbox/privacy posture, the
  deterministic-seeding rule, and the no-timers-in-render rule) and the
  specific phase block (Goal / Files / Verification) you're resuming or
  starting.
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** These documents drift as the codebase changes
  under them — a citation may have moved since it was written. Find the real
  current location by name/content, not blindly by line number. A stale
  citation is expected, not an error; just use what you find and move on.
- If a phase's instructions conflict with what you find in the live code, or
  a "locked decision" turns out to be unworkable given how something else
  actually works, **stop and flag it** — add a note under the Handoff
  section's "Blockers / flagged deviations," explain exactly what you found,
  and end the session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** the phase you resumed or started — no more. Don't pull
  forward work from a later phase even if it looks convenient right now; the
  phase boundaries are deliberate (dependency order, risk, and verification
  granularity all assume phase-sized chunks, and each phase is meant to be
  reviewed on its own).
- When a phase says to reuse an existing pattern, go read that existing code
  first and match its actual current shape — don't approximate from the
  doc's paraphrase. Patterns you will be told to mirror: the escort roster
  (`ensureEscortRoster`, sim.js), the world-sub-key persistence block in
  `saveAtBoundary` (state.js:416) and the `world.phone` lazy-init pattern
  (state.js:458), the sandboxed embed iframe (render.computer.js ~440), the
  IM invite-over flow (ui.js:1024), and the `textContent`-not-`innerHTML`
  rule for API output.
- **Hard technical rules every phase must respect:**
  - Eporner is fetched with plain browser `fetch` ONLY (a server-side proxy
    gets its anti-bot HTML wall); Pornhub via `root.superFetch` only.
  - Every embed iframe keeps `sandbox="allow-scripts allow-same-origin"`
    + `referrerpolicy="no-referrer"`; the only `window.open` escape is the
    explicit "Watch on site →" button.
  - All generated site content derives from `seededRng(meta.seed,
    'afterhours')`, never `Math.random`.
  - No timers scheduled from inside a render pass — autonomous animation uses
    AfterHours-managed lifecycle timers that mutate DOM directly and are
    stopped when the site closes.
  - Computer AND phone render the same AfterHours (shared renderer +
    `data-device` dispatch) — never build a device-only path.
  - The masturbate/cum/session mechanic is sacred: any phase that touches the
    watch/player area must re-verify the full session flow before calling
    itself done.
  - Bump the `?v=` query on **every** changed script tag in `index.html`
    together, and update the load-order comment (index.html, the SCRIPTS section
    header ~line 2553) if the
    script list changes. New `afterhours.js` code loads after `ui.computer.js`.
- **Actually run the phase's Verification steps before considering it done**
  — don't mark it complete because the code looks right. Verification happens
  on the live perchance page via `browser_eval` (and `vision` for layout
  checks): open the site, search, browse, watch, reload saves. A phase's
  verification block lists exactly what to check; at minimum drive the
  phase's core flow end-to-end and assert the key invariants (sandbox
  attributes, both sources present in a blended grid, seeded stability,
  save/load round-trip where relevant).
- Once a phase is genuinely complete and verified, **stop.** Do not roll into
  the next phase in the same session, even if you have context budget left —
  one phase per session is the point of this workflow.

## Step 3 — mandatory: write the handoff note before ending, every time

This is the last thing you do in every session, whether the phase finished
cleanly, is partway done, or is blocked:

1. Update the plan's `## Handoff — read this first` section (overwrite it,
   don't append to a growing history):
   - **Resume at:** which phase, and if partial, the exact next action —
     specific enough that a session with zero context beyond this note can
     continue without re-deriving anything.
   - **Last session's notes:** what got done, what got verified, anything
     that surprised you (moved citations, a small necessary deviation and
     why, actual ids/shapes added).
   - **Blockers / flagged deviations:** anything you stopped on, or "None."
2. Update the phase's row in the plan's `## Status` table: "Done," "In
   progress," or leave "Not started" if you didn't get to it — never leave
   Status and Handoff disagreeing with each other.
3. If you completed the last phase of the plan, mark the plan's Status header
   line accordingly so Step 0 of the next session correctly reports the work
   as done.

Do not end a session without doing this, even if you ran out of useful
context mid-phase — a half-finished phase with a precise Handoff note is
recoverable; a half-finished phase with no note is not.
