# External World / Services / NPCs Overhaul

Status: **direction only — not detailed, not built.** Last updated 2026-08-04.

Companions: `ref/contractor-tutorial-overhaul-plan.md` (the pilot
implementation of the pattern this doc wants to generalize — build that one
first, concretely, before generalizing anything here),
`ref/renovation-occupancy-overhaul-plan.md` (leaves a parked gap — comfort-tier
rooms have no off-site substitute while under construction — this doc is
where that gap eventually gets closed).

**This document captures a vision and a direction, not an implementation
plan.** Unlike its two companions, this one was explicitly *not* fully
brainstormed before being written down — the user said so directly mid-chat:
"We have introduced a lot of new content material... feel free to NOT make
the plan yet and ask more questions and converse more." Treat every section
below as a starting point for a **dedicated future design session**, not as
instructions ready to hand to an implementing agent. Do not build against
this document without that session happening first.

---

## Handoff — read this first

**Do not implement anything from this document.** There are no phases here
to resume. If a session ends up here (by the self-locating check in
`ref/perchance-agent-handoff-prompt.md`, or by direct instruction), stop and
tell the user a dedicated design session is needed before any code gets
written against this doc.

---

## The thesis

The apartment isn't the whole world. Outside its four walls is a full cast
the player can access without ever leaving home: paid services (laundry,
food delivery, a cleaning visit that's an actual person instead of a bot),
and the roommates' own social world (friends who visit, some of whom might
eventually become roommates themselves). None of these are flavor text —
they're full-fidelity characters with the same depth as a resident, grown
lazily in the background so the cast never feels thin, without ever paying
the cost of generating everyone up front.

Direct quote, worth preserving verbatim because it's the clearest statement
of scope: *"Entertainment, prostitution, food, services, I want a full rich
world that the player can hire their services on demand and enjoy a rich,
lush existence even though they never leave the home themselves."*

---

## What's actually decided

Keep this list short — most of the doc below is direction, not decision.

1. **Non-resident NPCs are full characters, not stubs-forever.** Same bible
   depth as a resident eventually, even if they start cheap/lazy.
2. **Two broad categories**: paid services (laundry, food delivery, maid/
   cleaning, entertainment/companionship) and roommates' outside friends
   (visitable, potentially recruitable via an alternate path).
3. **Growth is lazy and invisible to the player** — "we can slowly grow
   NPCs in the background without the player ever noticing."
4. **The Contractor (companion doc) is the pilot.** Build that one
   concretely first; only generalize the pattern afterward, once it's proven
   out in one real character instead of designed in the abstract.
5. **Some external NPCs may eventually become move-in candidates** via an
   alternate recruitment path, separate from Classifieds.

---

## Existing machinery this should reuse, not reinvent

Confirmed by direct inspection — these already exist and are the right
foundation:

- **Lazy stub → full-NPC growth already exists.** The Classifieds flow
  (`generateApplicantStubsForDay`, `computer.js:876+` — cheap deterministic
  fields, no LLM, seeded RNG per stub; `promoteStubToNpc`,
  `computer.js:987-997` — promotes a stub into a real `gameState.npcs[id]`
  entry on demand) is exactly the "grow in the background, flesh out when
  the player engages" mechanism this doc wants for external NPCs generally.
  This is a generalization of existing code, not a new invention.
- **The Services app already exists.** `HomeCare`/TidyBot
  (`defs.computer.js:76-82`, `SERVICE_DEFS` in `config.js`) already hires
  recurring service visits (`processServiceVisitsForDay`, `computer.js:796+`)
  on a cadence — currently impersonal (a cleaning bot, no NPC attached).
  Turning "TidyBot" into an actual person who shows up, that the player can
  meet, befriend, and text, is an *extension* of this existing app, not a
  parallel system.
- **IM already supports any real NPC.** `ensureImThread` /
  `appendPlayerImMessage` (`computer.js:1415-1438`) work for any
  `gameState.npcs[id]` — an external NPC plugs into texting exactly like the
  Contractor does, once it has a record.
- **`residency.status` already has a `'visitor'` value** (`config.js:1234`).
  Likely the right fit for "has a record, never lives here" — but its exact
  semantics need verification (see the Contractor doc's Phase 1, which does
  this check first).

---

## Explicitly NOT decided — do not invent answers to these

- **Which services ship first**, and in what order. The clearest existing
  pressure point is the gap `renovation-occupancy-overhaul-plan.md` leaves
  open on purpose: comfort-tier rooms (laundry, kitchen upgrade, etc.) have
  no off-site substitute while under construction. A laundry/food substitute
  is the most obviously load-bearing candidate for "ship first" — but that's
  a recommendation, not a decision.
- **How friends-of-roommates surface.** Does a roommate's social drive
  introduce them unprompted? Does the player have to ask? Is there a
  "who do you know" browse screen?
- **The external → resident move-in path.** How it differs from Classifieds,
  whether it requires an existing relationship with a current resident
  first, whether it competes with or complements normal recruitment.
- **Content boundaries for the entertainment/companionship category.**
  `CONTENT_CONFIG.contentFlags.mature: true` (`config.js:14`) already permits
  mature content generally, but a transactional-intimacy service is its own
  distinct design surface — tone, limits, and presentation deserve an
  explicit conversation with the user before anything is built here, not an
  inherited default from the general content flag.
- **Simulation cost.** Whether external NPCs are fully dormant until
  summoned (recommended, matching the Contractor's simulation-exclusion
  approach) or get some lighter-weight background presence. Not confirmed
  for the general category.
- **Data model specifics** for each category — none of this has been
  designed at the field level the way the companion docs were. That's the
  point of the future session this document exists to set up.

---

## Recommended build order (direction, not a commitment)

1. **Generalize the Contractor's plumbing**, after it's built and proven:
   a reusable "external NPC" shape — `residency.status: 'visitor'`
   (or whatever Phase 1 of the Contractor doc settles on), IM-ready,
   excluded from `resolveTick`'s simulation loop.
2. **One paid service**, chosen to directly answer the renovation doc's
   parked gap — most likely a laundry or food substitute usable while the
   relevant room is under construction. Small, concrete, immediately useful.
3. **Friends-of-roommates**, as an extension of the existing social-drive
   system — a roommate mentions or invites an outside friend.
4. **Broader service categories and the external→resident move-in path**,
   once 2 and 3 have proven the pattern holds up.

---

## Before implementing anything here

Hold a dedicated design session — same shape as the one that produced the
other two documents in this trio: ground in the actual current code first
(what's changed since this was written, especially anything in the
Contractor doc that landed), then brainstorm scope and data model per
category, then write a real phased plan. This document's job is to record
the vision and point at the right starting thread, not to be executed
as-is.

---

## Status

| Section | Status |
|---|---|
| Vision / decided scope | Captured above |
| Data model | Not designed |
| Phased implementation plan | Does not exist yet — write one only after a dedicated session |
