You are one session in a long-running series implementing the **Aspirations,
Creative Careers & Chatter Overhaul** for this game — giving the player the
throughline NPCs already have. When finished: the gig board is a real
multi-category freelance market with reputation earned per craft; a player
who has built a craft *and* a reputation can go independent (self-publish a
book, release a track on Streamly, sell or hang a painting, run a home kitchen
on DoorDrop) with a catalog that earns a fading trickle and rewards the
prolific; Chatter is a public platform with a three-layer audience (the
authored cast, numbers-only "ghosts," and paying Backers / Chatter Private
subscribers), pseudonymous handles, manual blocking, NPC creators the player
can subscribe to at real cost, and recognition that spreads as gossip; one
shared Notice & Opinion layer lets NPCs perceive, judge, remember, and repeat
anything the player makes; aspirations (directions chosen, milestones
emergent) report progress without gating anything; and a designed room
finally means something. The standing "solo living must never work"
invariant is *revised* by this plan (D1) — solo self-sufficiency becomes
possible as a stacked late-game accomplishment.

You have no memory of any previous session. Everything you need to know about
where things stand is either in the target document's **Handoff** section or
must be discovered by reading the current code — never assume continuity with
a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

**One thing that is NOT drift, read this before anything else:** this repo
mirrors Perchance's own container shape. The game's source lives at
`src/src/srcfiles/`, design docs at `src/src/ref/`, the dev/verify harness at
`src/src/dev/verify/` — **all nested one level deeper than a plain `src/`
layout**. Only `index.html` and `main.pjs` sit outside both layers. If you
find yourself typing `src/srcfiles/...` or `dev/verify/...`, stop — it's
`src/src/srcfiles/...` and `src/src/dev/verify/...`. This has burned a session
before (six files with off-by-one `..` bugs).

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status` table
in `src/src/ref/wip/aspirations-and-creative-careers-overhaul-plan.md`.

The first phase not marked "Done" is your phase, reading the table top to
bottom (1 through 18).

**Exceptions to strict order** — the plan's own `## Dependency order` section
names them; read it (it is short). In summary: Phases 5–8 (the four
independent tracks) are order-free among themselves once Phase 4 exists;
Phase 9 needs only Phase 3 and may precede the tracks; Phase 14 can land any
time after Phase 3 with a reduced milestone pool; Phase 16 may land its
comfort/opinion half before Phase 7 exists (hanging waits). A session that
takes an allowed out-of-order phase must say so in the Handoff.

**Hard prerequisites:**
- **Never skip Phase 1** — every later phase reads `music`, `craftQuality`,
  and the mastery/bonding `mode`.
- **Phase 2 before Phase 4** — release gates (D19) read per-category
  reputation, which does not exist until Phase 2's migration.
- **Phase 3 before Phase 9** — the platform layer's whole point is that posts
  become opinion facts; there is nothing to plug into without `notice.js`.
- **10 → 11 → 12 → 13 strictly in order** — private conversion reads the
  follower funnel, NPC pages reuse the player's private plumbing, recognition
  needs NPC handles to exist.
- **Phase 15 before marking the `independence` direction's final milestone
  reachable** — Phase 14 ships that predicate reading a field Phase 15
  creates; until then it is simply false, which is fine and expected.

**External blocks:** Phase 5's storefront name (Q1) and Phase 14's app name
(Q2) are parked with defaults ("Inkwell", "Compass"). Use the default and
record it as a D-number; do not stall. If a phase needs a real
`generateImage` call (Phase 7's piece imagery, Q5), Node cannot make it —
implement the seeded-swatch fallback as the verified path and note the live
check as owed.

If every phase (1–18) is marked Done, **stop** and report that completion to
the user.

You should never need to fully read the whole plan document in a session —
it is long. The Handoff, Locked decisions, Data model, your phase block, and
Design invariants are enough.

## Step 1 — read the plan's Handoff section, then the relevant phase

- Handoff first — it is the single source of truth for where the last
  session left off.
- Then "Locked decisions" — read the group headers and the decisions your
  phase cites, plus **D1–D4 and D9–D13 always** (the economy shape and the
  Notice layer are the substrate everything sits on) and **D26 and D30** if
  your phase touches Chatter at all (the label table and pseudonymity).
- Then "Data model", your phase's block under "Implementation phases", and
  "Design invariants".
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** The design session checked its citations by
  name on 2026-09-18 (`skills.js`, `chatter.js`, `computer.js`'s gig
  functions, `defs.computer.js`'s `GIG_TEMPLATES`, `asks.js`'s
  `ASK_CATEGORIES`, `config.js`'s `SKILL_IDS`/`MOOD_PAYOUTS`/`CONTENT_CONFIG`,
  `defs.design.js`'s `ROOM_DECOR`, `signals.js`'s `perceiveSignals`,
  `npc.js`'s `addMemoryFact`/`receiveTransmittedFact`). Line numbers drift;
  find the real location by name/content, not blindly by number. A stale
  citation is expected, not an error.
- The plan's Evidence table records two things a session might be tempted
  to "fix in passing" — every gig template gating on `tech`, and the
  tier-by-index off-by-one in `eligibleGigTemplates`. **They are Phase 2's
  job.** Don't touch them from another phase.
- `chatter.js`'s header asserts residents-only authorship and
  non-explicitness "by design." **Those were implementation-time guesses,
  not user decisions** (the user said so explicitly). Until Phase 9
  rewrites that header, do not cite it as a constraint.
- If a phase conflicts with the live code, or a locked decision turns out
  unworkable, **stop and flag it** under "Blockers / flagged deviations" and
  end the session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** that phase. Phase boundaries encode dependency order
  deliberately — Phase 3 proves Notice & Opinion on a trivial subject
  (skill level-ups) before any career subject exists; Phase 4 proves the
  works engine on a synthetic work before any real track leans on it.
- When told to reuse a pattern, go read that code and match its current
  shape — don't work from this prompt's or the plan's paraphrase. Patterns
  to mirror, by function and file:
  - `src/src/srcfiles/computer.js` — `gigTier`, `gigPayMult`,
    `eligibleGigTemplates`, `generateGigsForDay` (seeded, idempotent,
    probabilistic refresh), `workGigBlock` (focus × progressPerClick),
    `deliverGig`. Phase 2 reshapes these; Phases 4–8's production blocks
    copy `workGigBlock`'s shape exactly.
  - `src/src/srcfiles/chatter.js` — `generateChatterForSingleDay`
    (seeded per day, deterministic truncation), `applyChatterReactions`,
    `chatterAffinity`, `postChatterAsPlayer`. Phases 9–13 extend, never
    replace.
  - `src/src/srcfiles/npc.js` — `addMemoryFact`, `receiveTransmittedFact`;
    `src/src/srcfiles/rumination.js` — `ruminate`. Every opinion and
    identity link is a fact on this store (D11, invariant 4).
  - `src/src/srcfiles/signals.js` — `perceiveSignals(gameState,
    perceiverId, roomId)` is the in-room perception path (D10).
  - `src/src/srcfiles/asks.js` — `ASK_HANGOUT`, `ASK_PHOTO`, `ASK_INTIMACY`,
    `ASK_BOUNDARY` and the `ASK_CATEGORIES` tree: `$Feature` (Phase 11)
    and `$SubscriptionTalk` (Phase 13) match this shape exactly — pure
    `decide()`, `effects()`/`postEffects()`, `leafNote()`.
  - `src/src/srcfiles/willingness.js` `willingnessFloorReasons` and
    `src/src/srcfiles/boundary.js` `resolveBoundaryGate` — the only doors
    (invariant 2). `$Feature` reads them; it never adds to them.
  - `src/src/srcfiles/image.js` — `takePhoto`, `buildPhotoPrompt`, and
    the three-condition gate documented at the peek-image section. Private
    content (Phases 11–12) reuses these under that gate; no fourth
    condition, no bypass (D31, D41).
  - `src/src/srcfiles/skills.js` — `awardSkillXp`/`skillLevel`/`skillMod`.
    Add award sites and readers; never a second formula.
  - `src/src/srcfiles/state.js` — `MIGRATIONS` and the persisted-key list.
    Phase 2's reputation migration and every new field (D58) go here, once.
  - `src/src/srcfiles/defs.computer.js` — `RESTAURANT_DEFS` /
    `RESTAURANT_DEFS_LIST` and their readers (Phase 8 appends the player's
    listing at read time; the ≥2-open invariant from the restaurant plan
    must survive).
  - `src/src/srcfiles/defs.design.js` — `ROOM_DECOR`'s placement shape;
    `dev/designer.html` + `dev/sync-designer.js` (Phase 17 extracts, never
    duplicates).
- **Hard technical rules**, each a Design invariant from the plan — repeated
  here because they are the easiest to violate by accident:
  - **Decide before you decorate** (invariant 1). Appeal, valence, growth,
    orders, recognition, milestones: deterministic from state + seed first.
    The LLM phrases. If the model is ever asked whether an NPC *liked*
    something, stop.
  - **The willingness gate is the only door** (invariant 2). If a phase
    seems to need the asleep floor — or any floor — to bend, that is a
    stop-and-flag, not a workaround.
  - **No opinion without perception** (invariant 3, D10). In-room via
    signals; on-platform via following/subscribing + scrolling (D37). A
    blocked NPC sees nothing and may still *hear* — that gap is the design.
  - **Opinions are facts; no parallel store** (invariant 4). A
    `player.opinions` array is the `castWeb` scar with a new name.
  - **Money through existing paths only** (invariant 5, D3). `EARN_MONEY`
    in, the existing charge path out. No `platformBalance`.
  - **No field without a reader** (invariant 6). Phase 3's platform hook
    is a function returning `[]` until Phase 10 — not a stored field.
  - **Ghosts are numbers** (invariant 9). `ghostHandle(seed)` is
    regenerated for display, never persisted. A ghost with a stored name
    is a bug.
  - **Lumpy at every tier** (invariant 10). D1 raised the ceiling, not the
    predictability. Keep the refresh rolls, spike rolls, churn, and decay.
  - **Naming lives in `CHATTER_LABELS`** (invariant 11). "Backers" and
    "Chatter Private" appear as strings in exactly one table.
  - **New source files register in BOTH `index.html`'s `<script>` tags AND
    `src/src/dev/verify/loadgame.js`'s `ORDER` array, in the same commit**
    (invariant 8). Five new files in this plan (`defs.works.js`,
    `notice.js`, `works.js`, `platform.js`, `aspirations.js`); load order
    is in D56. A file in only one place has silently broken every harness
    that touched it before.
- **Actually run the phase's Verification steps.** Per invariant 7: pure
  logic in `src/src/dev/verify` (Node), presentation on the live page.
  Harnesses are `verify-acc-p<N>.js` (D57); `node
  src/src/dev/verify/run-all.js acc-p` filters to them in seconds. Run the
  **full unfiltered sweep once**, near the end of the session before the
  Step 3 note, and take the baseline seriously: as of 2026-08-31 it reports
  **3298 passed, 76 failed, 13 harness(es) errored** — all pre-existing and
  unrelated (several documented as known, e.g. `verify-w6.js`). If your
  numbers move down, or up by more than your own new assertions account
  for, something regressed — find it before ending. For UI phases (2's
  board, 9–12's screens, 14's Compass, 16–17's Home), a Node harness proves
  nothing; verify on the live page (`python -m http.server` per
  `.claude/launch.json`, or `dev-harness.html` — read its header for its
  limits). At minimum, every phase that adds a persisted field proves a
  save/load round-trip, and every phase that credits or debits money
  proves `player.money` moved by exactly the expected amount and the
  tracker/bank agree.
- Once verified, **stop.** One phase per session is the point, even with
  budget left.

## Step 3 — mandatory: write the handoff note before ending, every time

1. Overwrite the plan's Handoff section (Resume at / Last session's notes /
   Blockers). Name the real identifiers you created — function names, the
   exact ask-leaf ids, the exact `MIGRATIONS` key, the app/screen ids —
   because the next session greps for them, not for prose.
2. Update the phase's row in the `## Status` table. Never leave Status and
   Handoff disagreeing — a later session's Step 0 reads only the table.
3. Promote any resolved open question into `## Locked decisions` as a new
   D-number (continue from D58). Q1/Q2 defaults used → D-number. Q3/Q4/Q5
   answered → D-number.
4. Phase-specific obligations:
   - **Phase 2:** record the exact `MIGRATIONS` key and a measured example
     of an old save's scalar rep folding into the map; record the final
     template count per category.
   - **Phase 3:** record the personality-sensitivity table's actual keys
     (which `bible` traits move valence) — Phases 10, 13, 16 read the same
     table and must not invent a second.
   - **Phase 4:** record the measured income of the synthetic work at day
     0 / 14 / 28 so later tuning has a baseline.
   - **Phase 8:** record how the ≥2-open invariant was preserved with the
     player listing present, and Q4's resolution.
   - **Phase 10:** record the measured follower curve (30 days, skill 2 vs
     6) and the slot table as shipped.
   - **Phase 11:** record the exact reason strings `$Feature` returns at
     each refused floor, confirmed identical to `ASK_INTIMACY`'s.
   - **Phase 12:** record the measured creator/private rates over the
     generated sample.
   - **Phase 14:** record the milestone template count per direction and
     which later phases still owe templates.
   - **Phase 15:** record the measured week independence first qualifies
     for each scripted archetype, and confirm the economy plan's invariant
     list carries the dated D1 note. **Update the design-invariants memory
     the same session** — it currently states the old rule.
   - **Phase 17:** record what was extracted from `dev/designer.html` and
     that `sync-designer.js` still reports no drift.
5. If this was Phase 18, mark the plan's Status header **complete**, move
   the plan and this prompt to `src/src/ref/complete/`, and update the
   indexes in `src/src/ref/README.md` and
   `src/src/ref/structural/ARCHITECTURE.md` in the same commit.
6. If this was the last phase, also add a Patch Notes entry —
   `src/src/srcfiles/defs.patchnotes.js`'s `PATCH_NOTES` array (read that
   file's header first). This whole plan is one release to the player:
   summarize its real, player-visible shape — the multi-category gig board,
   going independent (books, tracks, art, a home kitchen), Chatter as a
   platform with Backers and Chatter Private, NPC creators, aspirations and
   Compass, rooms that mean something — in plain language. No D-numbers, no
   file names, no phase recap. Bump `GAME_VERSION` (config.js) for it if
   the version hasn't already moved since the last entry.

Do not end a session without doing this. A half-finished phase with a
precise Handoff note is recoverable; a half-finished phase with no note is
not.
