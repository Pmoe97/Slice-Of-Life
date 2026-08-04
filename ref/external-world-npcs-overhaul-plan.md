# External World / Services / NPCs Overhaul

Status: **planned — not built.** Design session complete 2026-08-04; every
open question from the previous direction-only revision is now decided.
Last updated 2026-08-04.

Companions: `ref/contractor-tutorial-overhaul-plan.md` (built — the pilot
external NPC this plan generalizes; Del's presence rules are defined here,
everything else about him already shipped),
`ref/renovation-occupancy-overhaul-plan.md` (built — this plan changes its
`etaDay` math to working days, and puts Del onsite in the room being worked),
`ref/economy-and-rent-plan.md` (the cost stack these services add to).

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source
of truth for where the last session left off. Update it, and the Status
table at the bottom, as the very last thing you do each session — see
`ref/perchance-agent-handoff-prompt.md` for the full session protocol.

---

## Handoff — read this first

**Resume at:** Phase 1. No session has implemented against this document yet.

**Last session's notes:** Document rewritten from direction-only into this
phased plan following a full design session. No code written.

**Blockers / flagged deviations:** None.

---

## The thesis

**The player never leaves the apartment.** That is the game's defining
constraint, and this plan is what makes it a feature rather than a cage: the
world comes to you. Paid services (a maid on a contract, food delivered by a
real driver, escorts booked from a roster), the household's own social life
(roommates' friends turning up organically), and anyone you've met and kept
in touch with — all of it arrives at the door.

Direct quote, the clearest statement of scope: *"Entertainment, prostitution,
food, services, I want a full rich world that the player can hire their
services on demand and enjoy a rich, lush existence even though they never
leave the home themselves."*

Every one of these people is a **full NPC** — same bible depth, same memory,
same relationship machinery as a roommate — grown lazily in the background so
the cast never feels thin and new-game generation never pays for everyone at
once. Any of them can become a friend, a partner, or eventually a resident.

### What this plan is *not*

It is not a "leave the apartment" system. There are no destinations, no
travel, no off-site locations. Every mechanic here delivers people and goods
**into** the existing 18-room floor plan.

---

## Locked decisions

Settled in the design session. Do not re-litigate without checking with the
user first.

### Presence and infrastructure

1. **One unified visit queue.** `world.visits[]` is the single source of
   truth for "who is onsite and why," written by every source (renovation
   jobs, maid contracts, food orders, roommates' social lives, player
   invitations). The scene layer, floor plan, and renderers ask one question.
2. **Hybrid presence.** While onsite, an external NPC gets a real
   `npc.location` and enters scene participation — encounterable, talkable,
   and visible on the floor plan. Their location and activity are driven by
   the **visit's purpose**, not by a schedule. **No needs decay** (a maid
   does not get hungry mid-shift). A small **drive allowlist** fires so they
   aren't robotic — see Data model.
3. **The player is always home.** There is no "nobody home" case. Visits fire
   regardless of which room the player is in or whether they're asleep;
   anything that happens away from the player resolves off-screen through the
   normal sim and is surfaced afterward via `addLogEntry` narration and/or IM.
   A booking is never wasted for lack of the player's attendance.
4. **Externals are part of the household fabric.** They interact with
   residents *and with each other* through the existing NPC-to-NPC social
   drive and `castWeb` (`generateCastWeb`, sim.js:1408). Del chatting with a
   roommate, the maid running into someone's visiting friend — all organic.
5. **Everyone persists forever.** No pruning of `gameState.npcs`. See
   Performance below for the required mitigation — this decision makes an
   active-NPC index mandatory, not optional.
6. **Soft cap on concurrent visitors.** Organic visits (roommates' friends)
   defer to another day when the house is already busy; paid and scheduled
   visits always honor their booking.

### Contacts

7. **Contacts are earned, not granted.** The player asks for a number in
   conversation. Willingness is **not a flat threshold** — it varies by
   personality axes and traits, so some people hand it over readily and
   others need a real relationship first.
8. **Hiring someone is not the same as knowing them.** Booking a service
   gives you no direct contact. The maid, a driver, an escort — each needs
   the personal ask to become a real contact.
9. **Del is the single exception**, a contact from day one (already shipped).

### Per category

10. **Del** is onsite **09:00–16:30, weekdays only**, in the room his active
    job is in. Renovation jobs therefore progress on **working days**, with a
    paid **weekend-rush** option at booking that keeps the crew working
    through. This changes shipped `etaDay` math — see Phase 4.
11. **The maid** runs on an alarm-style **per-day window grid** (each selected
    weekday carries its own start/end time), max 7 days/week, windows bounded
    to 09:00–16:30. **Base rate covers common-area cleaning only.** Add-ons:
    bedrooms/whole-apartment access, laundry (throughput-capped), and
    cooking/meal prep. Priced to **get expensive quickly by design.**
12. **Food delivery** is a DoorDash-alike: pick a restaurant, pick dishes,
    pick a delivery time, watch a driver ETA. Dishes are **real items**
    delivered by a **real driver NPC**.
13. **Friends of roommates**: each resident has a deterministic circle of
    **2–4 friends**, stubbed when that resident is created and promoted to a
    full bible **when a visit is planned** (in the background, before arrival
    — generation never blocks the visit). Hosting frequency derives from
    **warmth + openness**. The player can build **fully independent**
    relationships with them, including romance and move-in.
14. **Escorts** are browsed from a **persistent roster** with profiles.
    Booking is an **à la carte checklist filtered by that escort's own
    advertised services** — two escorts have genuinely different menus, so
    who you book matters. Purchased limits are enforced **both** as explicit
    in-character boundaries in the LLM prompt **and** as action gating.
    Escorts are full NPCs and interaction is otherwise free-form.
15. **Move-in**: the player holds **sole authority** to extend an offer.
    Residents may **advocate** for a friend or partner organically in
    AI-generated conversation ("Beth's lease is up — could she move in?").
    Eligibility requires a strong relationship with the player *or* with a
    resident.
16. **Separate apps per category.** Food and escorts each get their own app
    shaped to its job; the maid lives in an expanded HomeCare.

---

## Data model

### `world.visits[]` — the spine

One record per scheduled or active visit. Written by every source, read by
everything.

```js
{
  id: 'visit_<day>_<n>',
  npcId,                  // the visitor (a real gameState.npcs entry by arrival)
  purpose: 'contractor' | 'maid' | 'delivery' | 'social' | 'escort',
  sourceId,               // job id / contract id / order id / booking id / null for invites
  day,                    // the day it occurs
  startTick, endTick,     // 0-47 half-hour ticks (getTickIndex, sim.js:214)
  roomId,                 // where they are; purpose-driven, may update during the visit
  status: 'scheduled' | 'active' | 'done' | 'deferred',
  hostNpcId,              // for purpose:'social' — whose friend this is; null otherwise
}
```

Ticks, not clock minutes, so this lines up with `SCHEDULES` (config.js:1660,
`0-47` half-hour ticks) and `getTickIndex`. **09:00–16:30 is ticks 18–33.**

Helper (new, sim.js beside `getPresentNpcIds`, sim.js:300):
`getActiveVisits(gameState)` → visits whose `day`/tick window contains now.
Every consumer goes through this rather than scanning sources.

### Presence — how a visitor enters the sim

`resolveTick` currently skips `'visitor'` status outright (sim.js:492). That
skip becomes **windowed**: a visitor with an active visit resolves; one
without still skips.

Inside the window a visitor resolves with:
- `location` = the visit's `roomId` (purpose-driven; the contractor sits in
  his job's room, the maid rotates through her cleaning scope, a social guest
  uses `ACTIVITY_ROOM_PREFERENCES`, config.js:1769)
- `activity` = a purpose-derived string ("scrubbing the counters", "running
  cable")
- **no needs decay** — skip the needs block entirely for visitors
- **drive allowlist**: only `react_to_player` and the social drives
  (`seek_company`, `chat_with_roommate`) may fire. Self-care and chore drives
  never do. Implemented as a check in `evaluateDrives` (drives.js:41)
  alongside the construction gate added by the renovation overhaul.

**Proposed default, flag if wrong:** the allowlist above is the author's
recommendation, not a user decision. Adjust freely during Phase 1.

### Contacts

New per-NPC boolean: `npc.contactKnown` (default `false`; `true` for Del at
seed time). The IM contact list currently filters on `residency.status`
(render.computer.js:1871, mirrored in render.phone.js:504) — with externals
persisting forever, that would auto-populate every driver and escort. Change
both to: residents/prospective as today, **plus any NPC with
`contactKnown`**.

Acquisition: a new `social.ask_contact` action available while talking to
someone whose contact you lack. Success is **personality-weighted**, not a
flat threshold — derive from `bible.temperament` (warmth, openness) and
relationship state, so a guarded NPC needs real rapport and an open one
shares early.

### Maid contract

Lives in the HomeCare app's existing `services.hired[]` shape
(`hireService`, computer.js) extended for scheduling:

```js
{
  serviceId: 'maid',
  schedule: [ { weekday: 0-6, startTick, endTick }, ... ],  // per-day grid
  addons: ['bedrooms' | 'laundry' | 'cooking'],
  npcId,                 // the assigned maid, a persistent NPC
}
```

Base scope mirrors the existing `accessScope:'common'` on
`SERVICE_DEFS.standard_cleaning` (defs.computer.js:374); the `bedrooms`
add-on maps to `accessScope:'all'`, which already carries the
privacy/evidence implications the stealth system models.

**Laundry throughput** consumes hamper `state.fill` (the same field
`hamperNotEmpty` reads, defs.actions.js:258) at a fixed rate per onsite hour
— a week of neglect is not cleared by one short visit.

**Pricing:** per onsite hour × add-on multipliers, tuned so a 7-day
full-scope contract is a serious recurring expense. Starting numbers are a
proposed default; tune in Phase 3.

### Food

- `RESTAURANT_DEFS` (new, defs.computer.js): `{ id, label, cuisine, menu:
  [itemIds], deliveryFeeBase, prepMinutes }`.
- Dishes are **new `ITEM_DEFS` entries** (defs.world.js:553) — real items with
  hunger restore, quality, and spoilage, so delivered food can sit getting
  cold and a roommate can eat your leftovers.
- Orders reuse the delivery pipeline shape (`world.deliveries`,
  `processDeliveriesForDay`, ui.js) but arrive **via a driver visit** rather
  than materializing on the doormat: the driver is a `purpose:'delivery'`
  visit with a short window at the `entry`, and hands over the items.

### Friends of roommates

- **Social network**, generated deterministically when a resident's bible is
  created: `npc.socialCircle = [friendStubId, ...]` (2–4 entries).
- **Friend stubs** live in `world.externalStubs{}`, reusing the shape and
  seeded-RNG approach of `generateApplicantStubsForDay` (computer.js:889) —
  cheap deterministic fields, no LLM.
- **Promotion to a full NPC** happens when a visit is *planned*, ahead of
  arrival, via the existing `promoteStubToNpc` pattern (computer.js:1000).
- **Hosting frequency** from the host's `bible.temperament.warmth` and
  `.openness`. High/high fills the living room; low/low almost never hosts.
- Once promoted, they are ordinary NPCs: `relPlayer`, memory, IM (once you
  have their contact), romance, and move-in eligibility all work unmodified.

### Escorts

- `world.escortRoster[]`: a persistent pre-generated pool of full NPCs with
  profiles (bio, rate, offered services).
- `ESCORT_SERVICE_DEFS` (new): the à la carte catalogue. Each escort's
  profile carries `offeredServices: [serviceId]`; the booking checklist
  renders **only** that escort's offered set.
- Booking record: `{ escortNpcId, services: [serviceId], day, startTick,
  endTick, price }`, which schedules a `purpose:'escort'` visit.
- **Enforcement is dual**: the booked service ids are injected into the scene
  prompt as that character's explicit in-fiction boundaries for the visit,
  **and** gate which intimate actions are selectable. Everything outside the
  booked set is both refused in-character and mechanically unreachable.
  Within the booked set, interaction is free-form and unsanitized.

### Move-in advocacy

No new UI. A resident with a strong relationship to both the player and an
external NPC can raise it in normal conversation via the existing LLM
proposal contract — the proposal schema gains an optional
`advocateFor: npcId` field. The player's existing offer action then works
against that external NPC exactly as it does for a Classifieds applicant.

### Performance (required by "everyone persists forever")

`resolveTick` iterates all of `gameState.npcs` every tick, and `castWeb` is
pairwise. With unbounded external NPCs both grow without limit. **Mandatory:**
maintain an **active-NPC index** (residents + visitors with an active visit)
and iterate that in the tick loop instead of the full map. `castWeb` entries
are created **only** between NPCs who have actually met, never eagerly across
the whole roster.

---

## Implementation phases

### Phase 1 — The visit spine

**Goal:** `world.visits[]` exists, visitors resolve into the sim during their
window and leave it afterward, and Del is onsite for his own jobs. No new
services yet — Del proves the whole mechanism.

**Files:** `sim.js` (`getActiveVisits`, windowed visitor resolution in
`resolveTick` sim.js:486-492, purpose-driven location/activity, needs-decay
skip, active-NPC index), `drives.js` (visitor drive allowlist in
`evaluateDrives`), `config.js` (`VISIT_TUNING`: soft cap, contractor window
ticks 18–33), `render.js`/`render.computer.js` (visitors on the floor plan
and in scene presence).

**Verification:** With an active renovation job, Del appears in the job's
room between ticks 18–33 on weekdays and is absent outside that window and on
weekends. He is talkable, shows on the floor plan, and never accrues needs.
A roommate sharing his room can strike up a conversation. Outside any visit
he is fully dormant exactly as today. The tick loop iterates the active index,
not the whole npcs map.

### Phase 2 — Contacts

**Goal:** Contacts are earned and gate the IM list; invitations work.

**Files:** `config.js` (`npc.contactKnown` in `CHARACTER_SCHEMA`),
`defs.actions.js`/`actions.js` (`social.ask_contact`, personality-weighted
success), `render.computer.js:1871` + `render.phone.js:504` (contact filter
→ `contactKnown`), `sim.js` (Del seeded `contactKnown: true`), IM app
(invite-over control writing a `purpose:'social'` visit).

**Verification:** A newly met NPC is not in contacts until asked; a guarded
NPC refuses at low rapport and an open one accepts earlier. Del is present
from day one. Inviting a contact schedules a visit they actually turn up for.

### Phase 3 — The maid (first real service)

**Goal:** A full contract-driven service, end to end.

**Files:** `defs.computer.js` (HomeCare expansion, maid service def),
`config.js` (pricing, add-on multipliers, laundry rate), `computer.js`
(contract CRUD, schedule→visit generation), `render.computer.js`/
`render.phone.js` (the schedule grid UI), cleaning/laundry/cooking effects
routed through the existing `applyEffects` pipeline.

**Verification:** A contract generates visits on exactly the selected
weekdays and windows. Base scope cleans common rooms only; the bedrooms
add-on reaches private rooms (and leaves the expected evidence/privacy
surface); laundry drains hamper fill at the capped rate, so a full hamper
takes multiple visits; cooking leaves real food. Cost scales as configured.

### Phase 4 — Working-day renovation math

**Goal:** Renovation jobs count working days, with a weekend-rush option.
**This modifies shipped behavior** — see the renovation plan.

**Files:** `computer.js` (`bookRenovationJob` — `etaDay` from a working-day
calculation, optional rush premium), `ui.js` (`processRenovationJobsForDay`),
`render.computer.js` (booking modal shows the rush option and the true
completion date), `ref/renovation-occupancy-overhaul-plan.md` (update its
`etaDay` description — it currently documents raw calendar days).

**Verification:** A 3-day job booked Friday completes Wednesday. The same job
with weekend rush completes Monday and costs the premium. Existing saves with
in-flight jobs don't break.

### Phase 5 — Food delivery

**Goal:** Order food, a driver brings it, it's a real item.

**Files:** `defs.computer.js` (`RESTAURANT_DEFS`, new app),
`defs.world.js:553` (dish `ITEM_DEFS`), `computer.js` (ordering, ETA,
driver-visit scheduling), `render.*` (menus, cart, live ETA), `ui.js`
(handover on driver arrival).

**Verification:** An order schedules a driver visit at the chosen time; the
ETA counts down; the driver appears at the entry, is talkable, and hands over
real items that enter inventory, can be refrigerated, spoil, and be eaten by
someone else.

### Phase 6 — Friends of roommates

**Goal:** The household's social life runs on its own.

**Files:** `sim.js` (`socialCircle` generation at bible creation,
visit planning from warmth/openness, background promotion), `computer.js`
(external stub generation/promotion reusing computer.js:889/1000),
`config.js` (circle size, frequency tuning, soft-cap deferral).

**Verification:** Each resident has 2–4 stubbed friends at new-game.
A high-warmth/high-openness roommate hosts noticeably more than a closed one.
A planned visit promotes the stub to a full bible *before* arrival. The guest
hangs out in sensible rooms with their host, is independently talkable, and
can become a contact, a friend, a romance, and eventually a resident. Organic
visits defer when the soft cap is hit; paid visits never do.

### Phase 7 — Escorts

**Goal:** Roster, à la carte booking, dual-enforced limits.

**Files:** `defs.computer.js` (app, `ESCORT_SERVICE_DEFS`), `sim.js` (roster
pre-generation with `offeredServices`), `computer.js` (booking, pricing,
visit scheduling), `prompt.js` (booked services → in-character boundaries for
the visit), `defs.actions.js`/`actions.js` (action gating from the booking),
`render.*` (roster browse, profile, checklist).

**Verification:** The roster persists across sessions and rebooking the same
person works. The checklist shows only that escort's offered services and
two escorts differ. A booked visit permits exactly the purchased set —
outside it, actions are unavailable *and* the character declines in-fiction.
Inside it, interaction is free-form. They're a full NPC: memory persists, and
a relationship can develop across bookings.

### Phase 8 — Move-in advocacy and integration

**Goal:** External NPCs can become residents; everything ties together.

**Files:** `prompt.js` (proposal schema `advocateFor`), `npc.js`
(validate/apply), `computer.js` (offer flow accepts any eligible external
NPC, not just Classifieds applicants), `sim.js` (`moveToRoom`, sim.js:998,
reached from the new path).

**Verification:** A resident with strong ties to both the player and an
external NPC raises the subject unprompted in conversation. The player can
then extend an offer; accepting runs the existing move-in path (room
assignment, rent share, `residency.status` → `'resident'`) and the new
resident stops being a visitor. Full playtest: a friend-of-roommate met
organically becomes a contact, a romance, and finally a housemate.

---

## Status

| Phase | Status | What it does |
|---|---|---|
| 1 | Not started | `world.visits[]` spine, windowed visitor presence, Del onsite, active-NPC index |
| 2 | Not started | `contactKnown`, ask-for-contact action, IM filter, invitations |
| 3 | Not started | The maid: contract grid, add-ons, laundry throughput |
| 4 | Not started | Working-day `etaDay` + weekend rush (modifies shipped code) |
| 5 | Not started | Food: restaurants, dish items, driver NPC, ETA |
| 6 | Not started | Friends of roommates: circles, organic visits, background promotion |
| 7 | Not started | Escorts: roster, à la carte booking, dual-enforced limits |
| 8 | Not started | Move-in advocacy, integration playtest |

## Dependency order

```
Phase 1 (visit spine) ──► everything else
        └─► Phase 2 (contacts) ──► Phase 6 (friends), Phase 8 (move-in)
        └─► Phase 3 (maid)
        └─► Phase 4 (working days — independent, can slot anywhere after 1)
        └─► Phase 5 (food)
        └─► Phase 7 (escorts) — wants Phase 2 for post-booking contacts
```

Phase 1 is the hard prerequisite; every service writes into its queue. Phase 2
should come second — friends, escorts, and invitations all assume contacts
exist. Phases 3/4/5 are independent of each other. Phase 8 needs 2 and 6.

---

## Open questions (parked, none blocking)

- **Tipping** drivers and other providers — flavor with a small relationship
  effect. Not scoped; add during Phase 5 if it feels missing.
- **Do externals form relationships with each other** across visits (the maid
  and a recurring driver)? `castWeb` supports it; whether visits ever overlap
  enough to matter is a playtest question.
- **Recurring driver pool vs a new driver each order** — decision 5 says all
  persist, but whether the app draws from a small pool (familiar faces) or
  generates fresh each time is unsettled. Recommend a small pool.
- **Pricing, laundry rate, soft-cap value, drive allowlist** — proposed
  defaults only, all tunable, all flagged inline above.

## Design invariants

1. **The player never leaves the apartment.** Nothing in this plan may
   introduce a destination, a travel mechanic, or an off-site scene. The
   world arrives.
2. **One visit queue.** Any new visit source writes `world.visits[]`. No
   parallel presence system, ever.
3. **Visitors never run needs decay.** They are present for a purpose and
   leave; they are not residents with a hidden life.
4. **A booking is never wasted for lack of the player's attention.** Visits
   resolve off-screen and report back.
5. **Contacts are earned.** Hiring someone never grants their number (Del,
   who predates this system, excepted).
6. **Externals are full NPCs.** Same bible, memory, and relationship depth as
   any resident — never a stub in the player's face, never a vendor bot.
7. **The active-NPC index is mandatory**, because nothing is ever pruned.
   Never reintroduce a full-map scan in the tick loop.
