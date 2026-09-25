# Audit — RoomList applicants going unreachable (2026-09-22)

**Status: Finding 1 FIXED AND VERIFIED; Findings 2–3 OPEN; Finding 4 measured,
not a bug.** Written during a self-guided find-and-improve session. No paired
prompt — this is an audit, not a phased overhaul. Move to `complete/` once
Findings 2 and 3 are fixed or explicitly declined.

Starting point: the one still-unconfirmed half of a 2026-09-21 player report
(Discord, Chipper, 8/22): applicants *"disappearing from my profile inbox upon
reloading a save file"* (the player's own hedge: "perhaps?"). The previous
session checked `classifieds.applicants` and `SAVE_KEYS` and found nothing — but
"Profile Inbox" is a specific screen, and it isn't `classifieds.applicants`. It
is `renderRoomListQueue` (`render.computer.js`), which renders
`classifieds.fetchQueue` — the list of profiles the player asked RoomList to
load from the Browse grid. Nothing in `dev/verify/` covered the Browse stubs,
the fetch queue, or the Inbox at all before this session.

---

## The structural cause

**RoomList indexes applicants by the day's stub batch, but the applicant
outlives the stub.** Browse shows 30 cheap `stub` records per day
(`generateApplicantStubsForDay`, `computer.js`). Requesting a profile promotes a
stub into a real `'prospective'` NPC in `gs.npcs` (`promoteStubToNpc`) and adds
a `fetchQueue` entry that carries both `stubId` and `npcId`. Then two things
happen to the stub, on their own clocks:

- **Every day rollover**, `classifieds.activeDay` moves to the new batch —
  Browse (and every Browse filter) only ever looks at `stubs[activeDay]`.
- **After `STUB_RETENTION_DAYS` (3)**, the old day's stubs are deleted outright.

The NPC is untouched by either. Any surface that reaches an applicant *through*
its stub loses them on one of those two clocks, while the applicant is still a
perfectly valid, acceptable roommate — possibly one the player has already
interviewed and texted.

---

## Finding 1 — Inbox rows became dead clicks after 3 days (FIXED)

**Symptom.** Four in-game days after requesting a profile, its Inbox row still
reads "✓ Ready — click to view", and clicking it does nothing. No message, no
navigation. That applicant can no longer be opened, accepted, or rejected from
RoomList.

**Mechanism.** Every ready row carried `data-action="classifieds.view-stub"`
with `data-row-id=<stubId>`. `doClassifiedsViewStub` (`ui.computer.js`) looks
the stub up across `classifieds.stubs` and returns silently when it's missing —
which it is once day *N*'s stubs are pruned on day *N*+4.

**Live reproduction (before the fix), `dev-harness.html`:** new game → Bedroom 1
made liveable → listing posted → Neve requested from Browse → Inbox showed her
ready and opened her profile ✓ → four `processClassifiedsForDay` rollovers (day
1's stubs pruned; the queue entry still `ready`; `gs.npcs[...]` still
`prospective`) → clicked her Inbox row → nothing happened.

**Fix.** `renderRoomListQueue` now routes a ready row through the existing
`classifieds.view-applicant` action with the entry's `npcId`, never through the
stub. Same handler every other applicant card already uses. One renderer, one
call site; `doClassifiedsViewStub` is untouched (Browse cards still use it, and
those are always live stubs).

**Verification.**
- Live, same save as the repro: the day-5 click opens Neve's full profile;
  Accept → Assign → Bedroom 1 moved her in and cleared exactly her Inbox entry.
- New harness `dev/verify/verify-roomlist-inbox.js`, **16/16**. Unusually for
  this suite it runs the *real* `renderRoomListQueue` and the real
  `doClassifiedsFetchStub`/`doClassifiedsViewStub`/`doClassifiedsViewApplicant`,
  lifted by name out of their source files into the engine vm against a
  minimal fake `document`, and dispatches the click the way `handleAction`
  does. It asserts behavior (the click opens the profile), not the verb name.
- Run against the **pre-fix** code in a throwaway worktree: 14 passed, **2
  failed** — exactly the two "day 5: clicking … opens its applicant's profile"
  checks, nothing else. Same-day clicks passed pre-fix, correctly: they did
  work before.
- Full sweep: 5875/12 before → **5891/12** after; the only per-file diff is the
  new harness. The 12 failures are the long-standing, already-diagnosed ones in
  `verify-suite-regression-triage-2026-09-20.md`.
- Patch-noted as the first entry under 0.14.2 (`GAME_VERSION` bumped
  0.14.1→0.14.2 the same session, at the user's direction).

---

## Finding 2 — the Browse "★ Saved" filter empties after one day (OPEN)

**Measured, not live-clicked** (a node probe against the real engine): request
an applicant, ★ Save them, turn on the Saved filter → they show. Roll one day →
the filter shows nothing, while `classifieds.favorites` still holds their id,
the `★ Saved (1)` button still counts them, and the NPC still exists. The grid
says "No applicants match your filters."

**Mechanism.** `getVisibleStubs` (`computer.js`) applies `favoritesOnly` as a
filter over `stubs[activeDay]` only — the shortlist feature whose own comment
says *"come back to them later"* only works the same day. Unlike Finding 1 this
needs no pruning; the `activeDay` rotation alone does it.

**Why not fixed this session.** Not a one-line reroute: in Saved mode the grid
needs a second card source — favorited `'prospective'` NPCs from `gs.npcs`,
rendered as full-NPC cards routed through `classifieds.view-applicant` (the
`renderRoomListApplicants` card shape already exists) — rather than a filter over
stubs. Two small calls to make first: whether gender/income filters still apply
in Saved mode (they would have to read `npc.bible`, not the stub), and whether
Studio-built applicants (Finding 3) belong in it too. Practical impact is
reduced now that Finding 1 is fixed: every stub-promoted favorite is also in the
Inbox, which now always works.

---

## Finding 3 — Studio-built applicants have no way back (OPEN, code reading only)

**Not live-verified — confirm before fixing.** An applicant built in the
Character Studio (`buildStudioNpc`) is pushed to `classifieds.applicants` and
the Studio opens their profile directly. They are never a stub (so never on
Browse) and never in `fetchQueue` (so never in the Inbox). The one screen that
lists `classifieds.applicants` — `renderRoomListApplicants`, the `applicants`
screen — is `hideFromNav: true` in `APP_DEFS.classifieds` (`defs.computer.js`),
and its only entry point found by grep is the "Back to Applicants" button on a
Studio applicant's own profile. Navigate away from that profile once and there
appears to be no route back to the accept flow inside RoomList. The Studio's
Characters list does show `'prospective'` NPCs, but its profile view offers
edit/IM actions, not Accept/Reject — worth checking live.

Candidate fixes (pick one): un-hide the Applicants tab; or give Studio-built
applicants an Inbox entry at creation (a `ready` queue row with no stub is
exactly what the Finding 1 fix now handles).

Side note: `generateApplicantsForDay` (`computer.js`), the only other writer of
`classifieds.applicants`, has **zero callers** — its comment says "Called from
day rollover" but nothing calls it (the day rollover calls the stub generator
instead). Dead code; left alone because deleting it is unrelated to any symptom.

---

## Finding 4 — "after reloading a save" (measured; not an applicant bug)

- **Save → reload preserves the Inbox** when the save record was written after
  the request: requested two profiles, waited for the next 30s timer record,
  reloaded, Continue → both entries and both NPCs intact.
- **Continue loads the newest save *record*, never the live kv folders**
  (`refreshMenuContinue`/`latestContinueEntry`, `menu.js`). Records come from the
  30s timer (`SAVE_TUNING.recordReasons: ['timer']`), manual saves, and a
  best-effort `pagehide` exit-save. In the live test the exit-save **did not
  land** (navigation cut off the async IndexedDB write — the code comment
  already calls it best-effort), so a reload a few seconds after requesting a
  profile restored the record from just before it: Inbox empty, NPC gone. That
  looked exactly like the reported bug and is the first thing this session
  reproduced — but it's the generic "last ≤30s of play" window, applies to
  everything equally, and is by design. Not chased further.

**Is Finding 1 what the reporter hit?** Unproven. It's on the exact screen they
named, and a player who sleeps through a few nights between requesting and
revisiting would hit it — but their word was "disappeared", while the rows stay
visible (just dead). Findings 1 and 2 together are the most plausible
explanation found; if the report recurs, ask whether the rows were *gone* or
*unclickable*.
