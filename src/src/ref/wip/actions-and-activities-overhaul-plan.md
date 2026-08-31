# Actions & Activities Overhaul — filling the apartment with things to do

Status: **planned — not started**. Design session complete 2026-08-30; all
scope selected by the user and the cross-cutting decisions locked. Content
for a handful of items is deliberately parked (see Open questions).
Last updated 2026-08-31.

Companions:
- `src/src/ref/complete/asks-and-attachments-plan.md` (the Ask system this plan's
  invitation system is built ON — read it before touching `asks.js`)
- `src/src/ref/complete/action-outcome-window-plan.md` (the `ActionWindow` every
  new verb resolves through; `sit`/`set_meal` already prove the pattern)
- `src/src/ref/complete/npc-initiative-plan.md` + `npc-initiative-retiming-plan.md`
  (the overture system this plan extends with reverse asks and event invites)
- `src/src/ref/complete/intimacy-and-voyeurism-overhaul-plan.md` (the willingness
  gate, wardrobe, peep/stealth, and music-device sound substrate this plan
  respects and extends)
- `src/src/ref/complete/food-overhaul-plan.md` (the cooking engine + `taste.js`
  the cook-off reuses whole)
- `src/src/ref/complete/floorplan-and-movement-plan.md` + `src/src/ref/wip/npc-avatar-liveliness-and-movement-plan.md`
  (the spatial graph and the movement-presentation layer the Follow mechanic
  rides)
- `src/src/ref/wip/action-outcome-window-handoff-prompt.md` (the session protocol
  shape a later handoff prompt for THIS plan will mirror)
- `src/src/ref/complete/player-creation-and-intro-plan.md` (the player
  `physical.intimate` layer / fail-closed gate that any new intimate-adjacent
  verb must route through)

This is a living document, worked one phase per session. **Read the Handoff
section immediately below before anything else** — it is the single source of
truth for where the last session left off. Update it, and the Status table
near the bottom, as the very last thing you do each session. A paired
`actions-and-activities-handoff-prompt.md` is written at the first
implementation session (this plan's design gate lives in its Open questions,
so the prompt is premature until those are settled).

---

## Handoff — read this first

**Resume at:** Phase 1. Nothing has been built.

**Last session's notes (design session, 2026-08-30 — no code written):**
- The user reviewed a 56-item catalog of new verbs/activities (grouped:
  Kitchen & food / Bathroom & grooming / Living room & common /
  Study-computer-phone / East wing / Entry-hallways-laundry / NPC & social /
  Deeper systems) and selected the scope below, with corrections. That
  catalog was never persisted; **this document is now the record of the
  selection.** The user's words are quoted under each scope heading.
- Two explicit structural mandates from the user, both locked as decisions:
  1. **NPC invitations and events use a central invitation system whose
     bones already exist in the Asks system** (D1–D4).
  2. **"Make a move" moves inside the chat modal as an "Ask" tree**, with a
     family of physical actions added (D5–D7).
- The user flagged a hard requirement: the game needs **a lot of original
  music and sound effects** because a LOT of sounds are about to be added
  (D29).
- **East Wing is the declared priority** — it is meant to be a hotspot
  (swimming, games, socialization, upgrades like the sauna) and is boring
  today (D22).
- Reference implementation cited by the user: the NPC flags system in
  `perchance.org/freeuseofficeclicker` (its `src/js/17-flags-detection.js`).
  That file is not fetchable directly (src/ files are service-worker gated),
  so D15 is designed from the user's description of the mechanism plus this
  codebase's own perception/signal layer; verify against the original when a
  live copy is at hand.
- One scope item's original pitch was lost in a context handoff — the user
  remembered it only as "a lot of potential to be great or awful." It is
  parked (Open questions → Q1) to be defined fresh with the user during its
  phase rather than guessed.

**This session's notes (design review, 2026-08-31 — no code written):**
- Walked the whole plan with a partner pass; verified several referenced
  hooks against the real codebase — `signals.js`, `isPrivacyRoom`
  (cognition.js:1373), `UTILITY_THERMOSTAT` (config.js:794 → computer.js's
  hvac billing), `harvestChatterResidue` (dreams.js:281),
  `willingnessFloorReasons` (willingness.js), `doMakeAMove` (ui.js:905), and
  `boundary.js`'s existing sleep-room gate all confirmed real.
- **File-reference cleanup done.** Every phase's Files line naming a module
  that doesn't exist under that name (`chat.js`, `wardrobe.js`, `beliefs.js`,
  `perception.js`, `planner.js`, `chores.js` — also `src/ref/scripts/...`
  fictitious paths in Phase 1) now says where the logic actually lives
  (`ui.js` / `items.js`+`sprites.js` / `relationships.js`+`rumination.js` /
  `signals.js`+`cognition.js`'s `isPrivacyRoom` / `tracker.js`+`intent.js` /
  `sim.js`+`drives.js`+`commitments.js` respectively) or flags it as a real
  TBD where no existing file fits. `money.js` (Phase 4) is left alone — D9's
  ledger has no obvious existing home, so "new file vs. folding into
  `world.js`/`config.js`" is a genuine kickoff-time call, not a factual
  error like the other six were.
- **Pets cut entirely.** D28 and Phase 18 both retired — a pet system needs
  its own dedicated design track (the dog case alone implies an
  "outside"/off-map layer this game has never modeled). See Q3.
- **Sauna placement locked (Q2).** Pool room, south-west corner, north-facing
  door, a *subroom* — D22 and Phase 13 updated. Deliberately a one-off: no
  second subroom is planned.
- **D10 / Phase 5 walked back.** There is no "NPC never asks something the
  player can't grant" gate — the player's own limits live in the player's
  head, and an NPC asking for money the player doesn't have is drama, not a
  flaw. Both updated to drop the false constraint.
- **New D30.** Acting on a sleeping/unaware NPC (via the new D5–D7 Affection/
  Physical ladder) routes through the *existing* Phase-17 boundary-act gate
  (`boundary.js`) rather than relaxing `willingness.js`'s hard 'asleep'
  floor — three outcomes: wake hostile, wake receptive, undisturbed.
  Confirmed `openConversationOverlay` has no NPC-state side effects today,
  so "opening the panel doesn't disturb them" already holds by
  construction; nothing to build there.
- **Parked, explicitly NOT part of this plan:** the user has a future concept
  for a hidden multipurpose room (Study → bookshelf → secret door). Noted
  here only so it isn't lost the way Q1's original pitch was — needs its own
  design session if/when picked up.
- **New Phase 1B (D32–D36), sequenced right after Phase 1.** Grew out of the
  user's stealth/sneaking/cover-tracks ideas. Checking the actual codebase
  before writing anything down changed the shape a lot: room-entry stealth,
  peeping, AND phone-snooping (`doSearchRoom`, `doSearchPhone`/
  `resolveSnoopPhone`, `generatePhoneSnoopPhotoImage`) all already ship —
  fully tuned, evidence/suspicion-integrated, one even has a reverse
  NPC-on-player drive. The one dead piece: nothing ever calls
  `awardSkillXp(player, 'stealth', ...)`, so `stealthSuccess` never moves
  off level 0 despite a real 11-step curve sitting ready
  (`SKILL_CURVES.stealthSuccess`) with a comment reserving it for exactly
  this. Real new scope shrank to: pickpocketing (person-target, D33), a
  Sneaking toggle suppressing the footstep signal (D34), an explicit branch
  on the existing SFW-only phone-snoop photo (D35), and granular
  cover-your-tracks actions (D36) feeding D30/D31. First instinct was to
  unify all the stealth mechanics into one resolver; reading the actual code
  showed three independently-shipped, consistently-shaped systems already
  proving the pattern, so P1B follows it rather than refactoring it.

**Blockers / flagged deviations:** None. Nothing is built yet, so no
deviations exist to flag.

---

## The thesis

The apartment is already mechanically dense — food, intimacy, needs, gossip,
overtures, a whole OS — but it still feels hollow: a huge house with a
handful of verbs and rooms that are empty of things to do. The player can
cook, shower, swim, study, and talk, and not much else, and most objects
(`coffee_maker`, `toilet`, `bathroom_mirror`, `sink_bathroom`,
`trash_kitchen`, `lockers`, `changing_bench`, `pool_loungers`, `yoga_mat`,
`coat_rack`, `shoe_rack`, `doormat`, `front_door`, `balcony_table`,
`plant_balcony`) exist as scenery with no verb at all. The East Wing — pool,
gym, game room, balcony, changing room — is the building's intended social
heart and currently its emptiest region.

The fix is not "more verbs" as a tally. It is: **make every room a place
something happens**, and make the things that happen between people flow
through one spine. Almost everything the user picked is either (a) a verb on
an object that exists but is dead, (b) a chore/need loop the house has no
model for yet (cleaning, temperature, laundry states, mail), or (c) a social
act between player and NPC — and that whole family should run through the
invitation/ask system, which already has the determinism, the decision
machinery, the ladder, and the scheduling. This plan is deliberately
architecture-first: the invitation spine and the flags engine land before
the surface verbs, so the surface is cheap to add afterwards.

### What this plan is *not*
- **Not a new-rooms plan.** The East Wing work upgrades what exists — the
  sauna is a *subroom* inside `pool_room` (its own door, its own privacy
  level, no new floor-plan node), not a new wing. It's a deliberate one-off:
  no second subroom is planned or foreseen (see D22). The floor plan graph
  is otherwise untouched.
- **Not a dialogue-system rewrite.** Every social act phrases through the
  existing scene/ask prompt machinery. No new LLM pipeline; decisions stay
  deterministic (decide-before-LLM is an invariant, not a suggestion).
- **Not an economy re-tune.** Rent, bills, taxes, and the tuned rent curve
  are untouched. New money verbs (gifts, loans, cook-off stakes) move
  existing money through existing ledgers.
- **Not a rendering/graphics overhaul.** The cutout, sprite, and
  movement-presentation plans are separate tracks; this plan only *uses*
  their outputs (avatars on social profiles, walk layers for Follow).
- **Not "every object gets ten verbs."** A verb earns its place by making a
  decision or relieving a need. Scenery verbs land where the user picked
  them, and no further.
- **Not a sound-engine rewrite.** The audio phase hooks the existing
  music-device/headphones substrate and acquires assets; it does not replace
  how sound is produced or blocked.

## Scope — the user's selection (verbatim)

### Kitchen & Food
> 1, 6 (Kitchen + Dining Room), 7 (half exists right?)

- **1 — coffee_maker.** Brew coffee: a real drink item (caffeine/energy
  effect), one action, the object is currently verb-less (`coffee_maker`,
  defs.world.js:353).
- **6 — Kitchen + Dining Room as a place.** The kitchen is dense already
  (cook/eat/reheat/microwave/freezer/dishes/dishwasher); the dining room is
  the thin one. Complete it as a venue: shared meals, dinner as an event,
  and the dining room's own verbs beyond `set_meal`/`sit`.
- **7 — (half exists).** The `sit`/`set_meal` dinner flow (action-outcome
  window plan, D10/D12/D13) already covers "start the meal with whoever
  joins." The half that exists gets completed by making the *dinner party*
  an invitation-system event (Phase 17) rather than new stand-alone code.

### Bathroom & Grooming
> 1, 2, 3, 4

All four bathroom/grooming items — the bathroom is currently one verb
(`self.shower`). New: **toilet** (private, hygiene-adjacent beat),
**bathroom_mirror** (groom: brush teeth / fix hair — appearance/confidence
hook), **sink_bathroom** (wash hands — hygiene), and a **grooming/self-care
family** that connects to appearance and the wardrobe/sprites systems.
`long_shower` already exists as the relaxation variant; it is not
duplicated.

### Living Room & Common
> 1, 2, 3 (…technical implications like getting characters to dress
> differently based on temperature, but too drastically hot or cold and they
> may get annoyed and/or try to change it themselves), 4 (Cleaning in
> general. I haven't really figured out how to clean much of anything.)

- **1, 2 — Living-room verbs** (sofa/TV/coffee-table surfaces that are
  currently thin: watch-together, lounge variants).
- **3 — Temperature.** The player gets a thermostat verb; the house gets a
  temperature model; **NPCs dress by temperature and get annoyed outside
  their comfort band, and may try to change it themselves** — the whole
  annoyance/self-adjust loop is the fun, and it rides the flags system (D16).
- **4 — Cleaning in general.** A real cleaning system — per-room dirt,
  cleaning verbs and supplies, mess as a by-product of activities, NPC
  cleaning chores — where today there is essentially none (D17).

### Study / Computer / Phone
> 2 (I LOVE the idea of creating an actual crossword/puzzle minigame that
> players can play), 3 (Building Chatter into a multilayer full social media
> layer sounds very fun), 4 (a lot of potential to be great or awful),
> 5 (was originally designed to be something you could do to develop a range
> of skills over time), 6 (is already a thing — the Brine Bank app has a
> bills section)

- **2 — Crossword / puzzle minigame.** A real playable minigame, new BrineOS
  app, seeded daily puzzle (D23).
- **3 — Chatter → full social media layer.** `social_feed`
  (`chatter.example`, defs.computer.js:540) is a static parody site today;
  become a multi-layer social network (D24).
- **4 — (content to be defined with the user — Q1).** Flagged "a lot of
  potential to be great or awful"; its original pitch was lost, parked in
  Open questions.
- **5 — Skill research / progression.** Skills become a player-developable
  track beyond EduStream courses: self-directed research, practice, and
  skill-gated verbs (D25). (EduStream courses exist; this extends them.)
- **6 — Brine Bank bills: already a thing.** Confirmed exists; no work.

### East Wing
> EVERYTHING. East wing is BORING at present. It is meant to be a HOTSPOT
> for activities. Swimming, games, socialization, upgrades like the sauna.
> There is so much potential in the east wing that we aren't doing.

The full East Wing treatment (D22): pool activities beyond `self.swim`
(pool games, loungers/sunbathe, locker + changing-bench verbs), game-room
social surfaces (tournaments, billiards/darts), gym and yoga verbs on
`yoga_mat`/`weight_set`, the **sauna upgrade**, balcony sit/eat/plants verbs,
and East-Wing **events** (pool party) through the invitation system.

### Entry / Hallways / Laundry
> Get Mail/Deliveries is a must, Actually Answer the door (…we are going to
> need to get our hands on a lot of original music and sound effects, because
> we are going to be adding a LOT of sounds), Clean Hallway action, Wash,
> Dry, Fold, Put Away, Snoop through, laundry, lots of laundry actions.

- **Get Mail / Deliveries** (D21) — the entry becomes a real surface.
- **Answer the door** (D21) — doorbell/knock → who's there → admit/refuse.
- **Clean Hallway** (D17 — cleaning system covers hallways).
- **Laundry chain** (D20): Wash → Dry → Fold → Put Away → **Snoop** — a full
  state machine where today `self.laundry` is one verb.
- The **sound/music requirement** is a cross-cutting track (D29), noted here
  because the user raised it in this section.

### NPC & Social
> I want to move "Make a move" inside of the chat modal as an "Ask" tree, and
> add a lot of physical actions like hugging, kissing, and more. More item
> controls in general. Gifting, borrowing, lending, stealing, asking for
> money (loan or gift), GIVING money (loan or gift). More Reverse Overtures.
> Asking NPC's to 'follow' so that they will naturally travel from place to
> place in the house with you, good to transition between spaces or between
> 'public' and 'private'. Formal apology system could be useful. Ask for
> Space/Boundaries is good. Cook-off is fun social/interactive activity!
> Flags/Conditions (deeper system. Flags can dictate 'Rules' that NPC's abide
> by, see the NPC flags system I built in perchance.org/freeuseofficeclicker
> for reference).

- **Make a Move → Ask tree** (D5–D6) + **physical actions** (hug/kiss/cuddle
  and more; D7).
- **Item controls** — gift (exists), borrow, lend, steal (D8).
- **Money controls** — ask for money loan or gift (ask_loan/ask_repay exist;
  extend), **give** money loan or gift (new), bidirectional ledger (D9).
- **More Reverse Overtures** — NPC-initiated invitations and requests
  through the overture channels (D10).
- **Follow** — NPCs travel with the player between rooms and between
  public/private spaces (D11).
- **Formal apology** — a real social act with belief-gated weight (D12).
- **Ask for Space / Boundaries** — a social companion to the existing
  boundary acts, expressed as flags (D13).
- **Cook-off** — a competitive cooking event riding the cooking engine and
  `taste.js` (D14).
- **Flags / Conditions system** — the freeuseofficeclicker-style engine that
  dictates rules NPCs abide by (D15).

### Deeper
> House Parties, Touring, Pets.

- **House Parties** — the flagship invitation-system event (D26).
- **Touring** — show a guest/roommate around the apartment (D27).
- ~~**Pets**~~ — **cut 2026-08-31**, see D28 (retired) and Q3. A pet system
  needs its own dedicated design track, not a phase inside this plan.

---

## Locked decisions

### The central invitation & event system (the spine)
- **D1 — The Asks system IS the invitation system.** There is one social
  surface: `asks.js`'s `ASK_CATEGORIES`/`ASK_TYPES` tree. New
  people-involving activities are ask leaves (player→NPC) or overture defs
  (NPC→player); there is no parallel "event planner." `parseAskInput`,
  `resolveAsk`, the repeat-ask ladder, and the calendar-slot machinery are
  reused whole.
- **D2 — An event is a commitment with a roster.** A planned gathering is a
  `commitments.js` record of the existing `hangout` kind, extended with
  `roster` (npc ids + the player), `eventType`, `location`, and `duration`.
  Booking goes through the existing calendar-slot flow (`ASK_HANGOUT` proves
  it). One scheduler; an event is not a special clock.
- **D3 — Invitations are symmetric.** Player→NPC (ask leaf) and NPC→player
  (overture) both *write the same event shape*. The acceptance surface is
  shared: a planned event shows up in Tracker/Agenda and the commitment
  machinery, whichever side authored it.
- **D4 — Determinism holds for event leaves exactly as for asks.**
  `decide()` stays pure over state+seed; flavor never decides; the writer's
  effects are stripped at `doConvSend`, never inside `callLLM`. (Existing
  invariant, restated because every future event leaf inherits it.)

### Stealth, detection & covert acts (the second spine)
- **D32 — The real gap is XP, not architecture.** Room-entry stealth
  (`resolveRoomEntryStealth`, stealth.js), peeping (`resolvePeep`,
  stealth.js), and phone-snooping (`doSearchPhone`/`resolveSnoopPhone`,
  ui.js:3465 / drives.js:1355) are NOT new — all three already ship, each
  with its own tuning table (`STEALTH_TUNING`, `PEEP_TUNING`,
  `PHONE_SNOOP_TUNING`), a seeded roll, a `skillMod(player, 'stealth',
  'stealthSuccess')`-gated success chance, and a witnessed/unwitnessed or
  clean/suspected/caught branch with real evidence and suspicion
  consequences. `skills.js`'s `SKILL_CURVES.stealthSuccess` (11 steps,
  25%→94%) was deliberately reserved for exactly this — its own comment
  says "P6 (stealth)" by name. What's missing: **nothing ever calls
  `awardSkillXp(player, 'stealth', ...)`** — every player is stuck at level
  0 forever, no matter how many clean sneaks they pull off. This phase is
  NOT a unification refactor of three working systems into one resolver
  (that was the first instinct and it was wrong once the actual code got
  read); it follows their proven, independently-shipped pattern for the
  genuinely new verbs below, and wires real XP into the existing three.
- **D33 — Pickpocketing is new.** A covert item-take directly off an NPC's
  person — not their room, not a phone left lying around — needs an
  aware-target detection roll none of the existing three mechanics have
  (they only fire when a room's owner is absent, or an object/phone is
  unattended). New resolver in `stealth.js`, same shape as the other three:
  seeded roll, `skillMod`-gated chance, its own tuning table, clean/
  suspected/caught branches.
- **D34 — Sneaking is new.** A Start/End Sneaking toggle (the "More" chip
  row) suppresses the player's own `footsteps` signal (signals.js's
  `PLAUSIBLE_TUNING.bySignal.footsteps`) during movement — today's
  mechanics gate specific interactions (entering a bedroom, searching a
  phone), never the general act of moving past or near someone. Sneaking is
  the connective tissue that makes pickpocketing and hallway-level risk
  possible at all.
- **D35 — Explicit phone-snoop photos.** `generatePhoneSnoopPhotoImage` /
  `buildPhoneSnoopPhotoPrompt` (image.js:1668) are deliberately SFW/candid
  today (a 2026-08-24 Discord-feedback feature, "F6"), by explicit design
  ("not automatically an explicit find on its own"). This phase adds an
  explicit branch using the SAME three-condition gate the intimacy system
  already applies elsewhere in image.js (explicit request + mature flag +
  naked state) — no new gate invented, and the SFW find stays the default;
  explicit is the sometimes-branch, matching the "physical, like private
  nudes of themself or their sexual partner" ask.
- **D36 — Cover-your-tracks, granular.** Contextual actions (Redress, Clean
  Evidence, Remake Sheets, and siblings) appear during a "suspected" /
  noticed-but-unconfirmed window on any stealth-gated act — D30's sleeping-
  NPC branch, D33's pickpocketing, or an existing search — and can shrink or
  clear the suspicion before it hardens into a certain belief or gossip
  fuel. Reuses the `ADJUST_SUSPICION` effect DSL already threaded through
  every mechanic above; the "window" is the one genuinely new piece of
  state (a per-incident countdown/flag the cover-tracks actions read and
  clear).

### Make a Move → Ask tree, and physical actions
- **D5 — `make_a_move` is removed from the social chip row.** Initiation
  moves into the chat modal's existing Request/Ask menu. The chip row gains
  nothing back; the chat "Ask" surface is the only player→NPC initiation
  door, preserving intimacy-plan **D3 symmetric initiation** (the NPC side
  still has its overtures).
- **D6 — Quick-entry, not a second door.** The chat modal's Ask button
  pre-expands the new "Affection" category when the conversation is with
  someone present. This is a UX shortcut to the same tree, never a separate
  flow.
- **D7 — Affection is a ladder, and the willingness gate stays the only door
  into sex.** New casual-physical acts — Hug, Kiss (cheek), Kiss (lips),
  Cuddle — are ask leaves (and, where fitting, proximity chips) gated by a
  light receptivity check (relationship standing + mood + recent history),
  NOT the willingness gate. The existing `RequestIntimacy` leaf keeps the
  willingness gate as its whole decision (asks.js's `ASK_INTIMACY` — never a
  second gate). The two never blur: affection can be refused for free;
  intimacy refusal is the willingness verdict.
- **D30 — A sleeping/unaware target routes through the existing boundary-act
  gate, never through a relaxed willingness floor.** `willingnessFloorReasons`
  (`willingness.js`)'s hard 'asleep' floor stays exactly as hardened today —
  Phase 17 of the intimacy plan already carved sleeping targets out into
  `boundary.js`'s separate gate (`resolveBoundaryGate`/
  `applyBoundarySleepRoom`) precisely so nothing else has to touch that
  floor. Every Affection/Physical leaf (D7) aimed at a sleeping/unaware NPC
  branches there instead of the normal receptivity check, extending the
  existing sleep-room-attempt pattern into a real three-way outcome:
  **wake hostile** (a boundary violation, same consequence shape as today's
  attempt), **wake receptive** ("into it"/compliant — gated by
  relationship, personality, and existing desire state, not a new gate), or
  **undisturbed** (the act lands unnoticed — the free-use-kink case). Flavor
  and severity scale with how intimate the act is; the branch point is the
  same for all of them. Opening the conversation panel never touches this —
  `openConversationOverlay` is confirmed pure UI today (avatar/log/focus
  only, no NPC-state reads or writes), and that stays true: only
  *submitting* a leaf's `decide()` ever consults sleep state, same as every
  other leaf. **No relationship-stage gate** on the receptive branch — any
  NPC can theoretically wake receptive. The weight instead reuses two
  existing real fields rather than inventing new ones: `willingnessAttraction()`
  (willingness.js) for how drawn to the player they are, and `npcDeviancy()`
  (npc.js:2406 — openness × assertiveness, already driving the pool's
  nude-swim gate) for how much their own construct is willing to go along
  with being caught up in something. Low on both → overwhelmingly
  wake-hostile; high on both → receptive is genuinely on the table; nothing
  about relationship tier enters the formula.
- **D31 — The reverse case: NPCs can initiate on a sleeping/unaware player,
  and it's an intended, welcome outcome, not an edge case to suppress.**
  Mirroring D30, an NPC can attempt an advance on a sleeping player through
  the reverse-overture channel (D10). The one asymmetry with D30: an NPC's
  reaction to the player's advance is decided deterministically (there is no
  real mind on that side of the screen to consult), but here the target IS
  the player, who has a real answer nothing should compute for them.
  Whether the player wakes at all still resolves through the same
  three-branch shape (stays asleep is a legitimate outcome, mirroring D30's
  undisturbed branch) — but once/if the player wakes, they get an actual
  choice (into it / decline / get angry), delivered through the same
  accept/decline chip surface D10 already reuses for reverse asks, just
  extended with a third rung. No roll ever decides how the player feels
  about it. Implemented alongside Phase 5 (reverse overtures), since it
  rides the same NPC-initiated-advance channel; Phase 5's scope note is
  updated to include it.

### Money & items between characters
- **D8 — Item possession gets an owner and a borrower.** `ITEM_DEFS` gain an
  optional `owner` (`npcId` | `'player'`) and items in play can carry a
  `borrowed: {from, until, due}` record. **Gift** = permanent transfer
  (existing `ASK_GIFT`). **Borrow** = temporary transfer with a return
  expectation (new `$BorrowItem` ask + an NPC side). **Steal** = covert
  transfer that routes through the existing stealth/evidence/suspicion
  pipeline (P6) and the belief/gossip system — a theft that is witnessed or
  suspected becomes knowledge.
- **D9 — Money is one bidirectional ledger.** Replace the one-way
  `_loanOwed` player flag with `player.moneyLedger`: per-NPC `{playerOwes,
  npcOwes}`. `ask_loan`/`ask_repay` (player borrows/repays) map onto it; new
  `$GiveMoney <amount> [gift|loan]` ask leaf (player gives) and an
  NPC-initiated money request (D10) close the loop. A loan is a loan
  whichever side owes it; repayment clears both directions.

### Reverse overtures & NPC-initiated asks
- **D10 — NPCs initiate too.** Beyond the four overture channels
  (`OVERTURE_DEFS`: text/propose/knock), NPCs gain *reverse asks*: an
  invitation (party, cook-off, dinner, outing) or a request (money, a
  borrowed item, help). Each is an overture row whose proposal payload is an
  event/request; the player's accept/decline resolves through the same
  deterministic machinery mirrored with the player as target (reads NPC
  intent + the player's standing/mood to flavor and weight the ask — never
  to filter it out). **There is no "can the player actually grant this"
  gate**: an NPC can and will ask for money the player doesn't have or a
  thing the player won't give. That's a tension point, not a design flaw —
  the player's own limits live entirely in the player's head. Delivered on
  the existing channels so the response surface (`overture.accept`/
  `overture.decline` chips) is reused whole.

### Follow, apology, boundaries, cook-off
- **D11 — Follow is a lightweight commitment.** A `$FollowMe` ask leaf sets
  `npc.follow` (the NPC follows the player); the reverse (player follows an
  NPC) rides the reverse-overture travel from the liveliness plan. A follower
  paths with the player room-to-room through the movement-presentation layer.
  Follow ends on: arrival at the destination, the player entering a private
  space the NPC wouldn't enter, conversation, or an explicit release.
  `npc.follow` is sim state; the walk presentation never writes it.
- **D12 — Apology is a belief-gated social act.** A `$Apologize <for X>` ask
  leaf (or chip) is gated by what the wronged NPC *believes* happened (the
  belief/gossip record — an NPC only accepts an apology for something they
  know about). Sincere + timely apologies repair part of the transgression's
  REL_DELTA; insincere or repeated ones deepen the wound (reusing the ladder
  mechanics). The apology is recorded in the NPC's beliefs (`forgiven`), so
  gossip carries it and a later re-litigation is possible.
- **D13 — Boundaries become flags.** "Ask for Space" / boundary asks
  (respect privacy, stop an unwanted behavior, don't enter my room) write a
  per-NPC flag that NPCs actually respect through the D15 flags engine. The
  existing `boundary.js` acts (sleeping-room, throuple, bull/cuck) stay; this
  is their everyday social companion.
- **D14 — Cook-off is a competitive event, not a new engine.** Two (or more)
  parties cook a dish through the existing cooking engine (`self.cook`,
  cooking.js, equipment grading); `taste.js` scores each result
  deterministically; a winner takes stakes (bragging rights, small money,
  chores-for-a-day). Booked through the invitation system as an
  `eventType: 'cookoff'`, played through the shared-activity machinery
  (`resolvePairedAct` / `source: { kind: 'paired' }`).

### Flags, temperature, cleaning, rooms
- **D15 — NPC flags / conditions engine (the freeuseofficeclicker pattern).**
  A flag is a named rule an NPC checks at decision time:
  `{ id, subject, condition, behavior, weight, source }`. Three sources:
  (a) player-set *house rules* ("no eating in the living room", "knock
  before entering bedrooms", "no guests after midnight"), (b) *boundary
  flags* the player set against a specific NPC (D13), (c) *NPC-owned flags*
  (their own comfort/preference rules, e.g. a 22°C thermostat preference).
  Compliance is personality-driven (conscientiousness/agreeableness,
  disinhibition); *detection* happens through the perception/signal layer (a
  rule nobody can perceive is not enforced — an NPC never acts on a rule it
  cannot see); violation produces belief/gossip + relationship consequences.
  Flags live on `npc.flags` with a per-house `houseRules` list; modeled on
  the user's `freeuseofficeclicker` `src/js/17-flags-detection.js` (verify
  against the original when a live copy is at hand).
- **D16 — Temperature is a shared state with teeth.** A thermostat verb
  (object + adjust) sets a target; a daily ambient temperature is derived
  (season schedule + player setting + heat sources). HVAC billing scales with
  the player's chosen delta instead of the flat `UTILITY_THERMOSTAT`
  multiplier. NPCs derive clothing from temperature through the wardrobe
  system (cold → warm layers, hot → minimal) and get annoyed (mood/desire
  deltas) outside their comfort band — then they *try to change it
  themselves*: use the thermostat, change clothes, complain (a D15
  comfort-flag behavior). The player setting the thermostat to extremes is
  exactly the drama the user wants, so the annoyance/self-adjust loop is the
  feature, not a bug to smooth away.
- **D17 — A real cleaning system.** Each room gets `dirt` (0..1) with
  sources (cooking, eating, parties, foot traffic, dust over time) and a
  decay (cleaning). New cleaning verbs (`self.clean`, per-object: sweep,
  vacuum, mop, wipe) plus supplies (broom/mop/vacuum/cleaner as purchasable
  items or room equipment). NPCs do cleaning chores through the existing
  chore system. Dirt feeds the smell/signal layer (a musty room smells) and
  can build into a visible/annoying state. Hallway cleaning (the user's
  "Clean Hallway action") is just this system pointed at
  `hallway_a`/`hallway_b`.
- **D18 — Kitchen & dining completes the venue.** `coffee_maker` gets a brew
  verb (a caffeinated drink item — energy/mood effects); `trash_kitchen`
  gets take-out-the-trash (a chore that resets kitchen smell); the dining
  room's identity is *shared meals as events* (Phase 17), building on
  `set_meal`/`sit`/dishes which already exist.
- **D19 — Bathroom & grooming.** `toilet` (private hygiene beat),
  `bathroom_mirror` (groom — brush teeth, fix hair; appearance/confidence
  hook into the wardrobe/sprite systems), `sink_bathroom` (wash hands —
  hygiene). Grooming affects appearance-driven social reads; `long_shower`
  stays the relaxation variant.
- **D20 — Laundry is a state machine, not one verb.** `self.laundry` splits
  into **Wash** (washer load — closed-form cycle), **Dry** (dryer or line),
  **Fold** (a folded stack), **Put Away** (into the wardrobe — makes clothes
  available again), and **Snoop** (read an NPC's laundry — a small
  perception/suspicion moment with gossip potential, its own instance of the
  P1B stealth pattern — distinct from the already-shipped phone/room snoop,
  `doSearchPhone`/`doSearchRoom`). Clothes move
  `dirty → washed → dried → folded → stored`. `laundry_machines` facility
  gates the washer/dryer verbs.
- **D21 — The front door becomes real.** A `mailbox` state accumulates mail
  (bills, flyers, packages) that the player *gets* ("Get Mail/Deliveries is
  a must"); **Answer the Door** — a knock/doorbell presents "who's there"
  (delivery driver, friend, roommate, solicitor) and the player
  admits/refuses through a short deterministic beat. Locking (`door.*`)
  already exists; delivery ETAs already exist in external-world retiming —
  this is the physical door-side of them.
- **D22 — The East Wing is the hotspot (declared priority).** Existing:
  `self.swim`, `self.play_games`, `self.workout`. Added: pool games
  (water-volleyball, Marco Polo — shared activities), `pool_loungers`
  (sunbathe/read), `lockers` + `changing_bench` (store swim gear / change —
  wardrobe hook), `yoga_mat` + `weight_set` verbs, the **sauna upgrade**
  — resolved (Q2): a *subroom* in `pool_room`'s south-west corner with a
  north-facing door, offering a real degree of privacy while existing
  entirely inside the pool room's footprint (no new floor-plan node), with
  health + social perks — balcony verbs (`balcony_table` sit/eat,
  `plant_balcony` tend), and East-Wing **events** (pool party) through the
  invitation system. The chokepoint design (game room gates the wing) stays;
  the wing just stops being empty.

### Computer, phone, and deeper
- **D23 — A real crossword minigame.** A new BrineOS app (`APP_DEFS` entry,
  phone + computer). Seeded daily puzzle from a word/definition bank (seed =
  day), fill-in grid UI, hints, and mood/skill rewards. The user loves this
  one; a second seeded daily mode (wordle-style) is an easy Phase-14
  extension.
- **D24 — Chatter becomes a real social network.** `social_feed`
  (`chatter.example`) grows: NPC profiles (bible + `avatarChip`/portrait),
  posts generated from house events + NPC beliefs/gossip (templated,
  LLM-finished), like/comment (NPCs react through the cognition/gossip
  systems), a player profile, and a feed seeded from live house state. The
  "great or awful" risk is content quality — gated by the existing
  SFW/consent pipeline and the narrative rules, never by post-hoc censorship.
  `harvestChatterResidue` (dreams.js) already proves the house→feed pipeline.
- **D25 — Skills become a developable track.** Self-directed research
  (browser + bookshelf: spend time reading/studying a named skill), practice
  actions (hobby/verb actions already grant `def.skill` XP), and skill-gated
  verbs (cleaning quality, cooking already, new hobby verbs). EduStream
  courses stay; this makes skill growth a lifestyle, not a class schedule.
  The user's note: this is what the original design was for.
- **D26 — House Party is the flagship event.** Invite N guests through the
  invitation system; the party is a multi-participant event with music (D29
  audio hooks the existing music devices), food (cooked or DoorDrop
  catering), drink, noise (signal layer — neighbors/roommates react), and a
  mess it *leaves behind* (D17 dirt — cleanup is part of the price). Parties
  are where flags, gossip, and romance collide; the D2 event shape is what
  makes it a feature, not a special-case script.
- **D27 — Touring is a guided walk.** Invite a guest/roommate on a tour; the
  pair walks the apartment through a sequence of narration beats per room
  (deterministic beats + flavor, riding the walk/movement presentation). A
  small, social, low-code feature that makes the house feel like a home you
  show off.
- **D28 — Retired (2026-08-31).** Pets are cut from this plan entirely. The
  dog case alone needs an "outside"/off-map layer this game has never
  modeled — the player currently has no way to leave the apartment at all —
  and the user decided a pet system deserves its own dedicated design and
  implementation session rather than being squeezed in as one phase here.
  See Q3 for the reasoning.
- **D29 — A lot of original music and SFX (user-raised requirement).** A
  standing acquisition + hookup track: per-mood/scene music (a small library
  of generated originals) and per-action sound effects (doors, cooking,
  water, laundry machines, notifications, doorbell). Hooked through the
  existing music-device/headphones substrate (intimacy plan Phase 19) so the
  sound-blocking rules still work. This is asset work + a thin audio module,
  not a rewrite; it can proceed in parallel with any gameplay phase.

## Data model

### Event / commitment roster (D2 — Phase 1)
```js
// commitments.js — the existing hangout-kind record, extended:
{
  kind: 'hangout',
  // ...existing fields...
  roster: ['npc_1', 'player'],        // who is expected
  eventType: 'dinner' | 'cookoff' | 'party' | 'tour' | 'pool_party' | ...,
  location: 'dining',                 // roomId
  durationMinutes: 120,
  host: 'player' | npcId,
  confirmed: ['npc_1'],               // who has said yes
}
```

### Ask-tree additions (D5–D7, D10–D14 — Phases 1/2/4/6/7)
```js
ASK_CATEGORIES gains two categories:
{ id: 'affection', label: '🤗 Affection',
  children: [ASK_HUG, ASK_KISS_CHEEK, ASK_KISS_LIPS, ASK_CUDDLE, ASK_INTIMACY] }
  // RequestIntimacy moves here from its own category.
{ id: 'social', label: '🙏 Social',
  children: [ASK_FOLLOW, ASK_APOLOGIZE, ASK_SPACE, ASK_COOKOFF,
             ASK_BORROW, ASK_GIVE_MONEY, ...] }
```
Every leaf keeps the existing contract: pure `decide()`, `effects()` /
`postEffects()`, `leafNote()` — identical to the current leaves.

### Money ledger (D9 — Phase 4)
```js
player.moneyLedger = {
  [npcId]: { playerOwes: 0, npcOwes: 0 },  // playerOwes: player borrowed from NPC;
                                           // npcOwes: NPC borrowed from player
}
// Migration: existing _loanOwed[npcId] → playerOwes[npcId].
// ask_loan/ask_repay read/write playerOwes; $GiveMoney [loan] and the
// NPC-side request write npcOwes. Gifts are transfers with no ledger entry.
```

### Item ownership (D8 — Phase 4)
```js
// an ITEM instance (in an inventory or the world):
{ defId: 'hoodie', qty: 1, owner: 'player' | npcId,
  borrowed: { from: npcId | 'player', untilDay, dueDay } | null }
```
Gift = permanent owner transfer. Borrow = temporary with a due day (an NPC
wants their thing back — the `_loanOwed` pattern applied to items). Steal =
covert owner transfer that stamps the stealth/evidence/suspicion pipeline.

### Follow (D11 — Phase 6)
```js
npc.follow = { leader: 'player', sinceDay } | null
```

### Flags & conditions (D15 — Phase 3)
```js
world.houseRules = [ { id, label, condition, defaultBehavior } ]
npc.flags = [ { id, source: 'houseRule'|'boundary'|'npcOwned',
                condition, behavior, weight } ]
```
Detection: `cognition.js`/`evaluateDrives` consults applicable flags; the
perception/signal layer decides whether a rule is even perceivable before an
NPC can be bound by it.

### Temperature (D16 — Phase 8)
```js
world.thermostat = { targetC }                  // player-set
ambientC(day, hour) = seasonalBase + thermostatDelta + heatSourceBumps
npc.comfort = { minC, maxC }                    // derived from temperament
```
HVAC billing = f(player's delta from baseline) replacing the flat
`UTILITY_THERMOSTAT` multiplier.

### Dirt (D17 — Phase 9)
```js
// per-room accumulation, read by the smell/signal layer and by moods:
room.dirt = { [roomId]: { amount: 0..1, lastCleanDay } }
// sources: cooking, meals, parties, foot traffic, dust; cleaning decays it.
```

### Laundry states (D20 — Phase 11)
```js
// clothing item (ITEM_DEFS clothing category):
{ defId: 'hoodie', laundryState: 'dirty'|'washed'|'dried'|'folded'|'stored' }
// washer/dryer load:
world.laundryLoad = { itemIds: [], state: 'washing'|'drying', doneMinute }
```

### Mail (D21 — Phase 12)
```js
world.mailbox = [ { id, kind: 'bill'|'flyer'|'package'|'letter',
                    from, arrivedDay, claimed: false } ]
```

### Crossword (D23 — Phase 14)
```js
// APP_DEFS entry 'puzzles'; grid generated seeded by day:
{ seed, words: [{ clue, answer, row, col, dir: 'across'|'down' }],
  filledCells, revealed }
```

### Chatter post (D24 — Phase 15)
```js
{ id, author: npcId | 'player', text, likes: [npcId],
  comments: [{ author, text }], day, eventRef }
```

### Pet — retired (D28)
No data model. Pets are cut from this plan's scope (see D28).

## Implementation phases

### Phase 1 — Invitation & Event core (D1–D4)
**Goal.** The spine. `commitments.js` extends the hangout record with a
roster + event metadata; a `$Invite` ask leaf (choose person, choose event
type, choose time) and the acceptance machinery (friend will come / NPC
schedules it / player commitment) land in the chat Ask tree; booked events
become scheduled activities the scheduler actually runs; the **Clear the
Calendar** demand clears them; invite types text/propose/knock route to the
invitation overlay.
**Files.** `asks.js` (new `$Invite` leaf + category), `commitments.js`
(roster/eventType/location/confirmed, migration), a scheduler hook (real
home TBD at kickoff — likely `tracker.js`/`intent.js`; no `planner.js`
exists), `ui.js` (ask surface + invitation overlay wiring).
**Verification.** ask `$Invite dinner with npc_2` → commitment has roster +
confirmed; advancing time past the booked hour runs the dinner activity with
both parties present; calendar UI shows/clears it.

### Phase 1B — Stealth, detection & covert acts (D32–D36)
**Goal.** Wire real XP into the three stealth mechanics that already ship
(room-entry, peep, phone-snoop) so `stealthSuccess` levels actually move —
today nothing calls `awardSkillXp(player, 'stealth', ...)` and every player
is permanently level 0. Add the genuinely new pieces: pickpocketing (D33, a
person-target covert take), a Sneaking toggle that suppresses the player's
footstep signal for general movement (D34), an explicit branch on
phone-snoop photo finds (D35), and granular cover-your-tracks actions (D36)
consumed by D30/D31's sleeping-NPC branch and by any stealth-gated act's
suspected/noticed-but-unconfirmed window. Sequenced early (right after the
invitation spine) because D8 (steal/pickpocket), D20 (laundry snoop), and
D30/D31 (sleeping-NPC acts) all consume it.
**Files.** `stealth.js` (pickpocket resolver, cover-tracks helpers),
`skills.js` (no new curve — just new `awardSkillXp('stealth', ...)` call
sites at each mechanic's clean/unwitnessed branch), `signals.js` (footstep
suppression while sneaking), `image.js` (explicit branch on
`buildPhoneSnoopPhotoPrompt`), `ui.js` (Sneaking toggle chip, pickpocket
verb, cover-tracks actions), `defs.actions.js` (new verb defs).
**Verification.** A clean room-entry, a clean peep, and an unwitnessed
phone-snoop each now visibly award stealth XP, and enough of them cross a
level boundary (mood impulse fires, `stealthSuccess` chance measurably
rises); pickpocketing resolves through its own seeded roll into clean/
suspected/caught; Sneaking measurably lowers detection while moving through
an occupied common room; an explicit phone-snoop photo only ever generates
when the existing mature-content gate is open; a suspected outcome opens a
real window a cover-tracks action can clear before it hardens.

### Phase 2 — Make-a-Move → Ask + Affection acts (D5–D7, D30)
**Goal.** `doMakeAMove` (ui.js:905) reroutes to the Ask tree — same
`parseAskInput`/`resolveAsk` pipeline as the free-text asks; "Make a move"
and "Ask" become one surface. New `AskPhysical` generic leaf + ladder
(Hug → Kiss on Cheek → Kiss on Lips → Cuddle → RequestIntimacy, weight and
location-gated) with the *willingness gate as the only door* to sex;
affection conversations (hug/kiss/cuddle) resolve through
`resolveSharedAct` / `source: { kind: 'paired' }`. A sleeping/unaware target
branches into the existing boundary-act gate instead (D30) — the ladder
never asks `willingness.js` to relax its 'asleep' floor.
**Files.** `asks.js` (ASK_CATEGORIES 'affection', ladder, generic leaf),
`ui.js` (reroute + chips), `render.js:3951` chip, `defs.actions.js` (any new
paired-affection defs), `boundary.js` (D30's wake-hostile/wake-receptive/
undisturbed outcomes on the existing sleep-target gate).
**Verification.** Physical → targets correctly downgraded/rejected by
willingness, never bypassed; mood/relationship effects apply; conversation
ends with both parties leaving cleanly; a leaf attempted on a sleeping NPC
resolves through `resolveBoundaryGate` into one of D30's three outcomes and
never through the normal receptivity check; opening the conversation panel
on a sleeping NPC changes nothing about their state.

### Phase 3 — Flags & Conditions engine (D15)
**Goal.** The freeuseofficeclicker-style rule engine: a named flag with
`condition`/`behavior`/`weight`, consulted at NPC decision time
(cognition/evaluateDrives). Three sources — player-set house rules, boundary
flags, NPC-owned comfort/preference flags. Detection through the
perception/signal layer so an NPC is never bound by a rule it cannot
perceive. Personality-driven compliance; violation → belief/gossip +
relationship consequences.
**Files.** `src/js/17-flags-detection.js` pattern (new flags module),
`defs.actions.js` (flag-management verbs), `cognition.js` + perception/signal
layers, `loadgame.js` ORDER + `?v=` bump.
**Verification.** House rule "no eating in the living room" → eating there
in view of an NPC triggers the NPC's flag behavior; NPC outside the room
doesn't react (perception gap); gossip records the violation.

### Phase 4 — Money & Item controls (D8–D9)
**Goal.** Money becomes one bidirectional ledger: `player.moneyLedger` with
`playerOwes`/`npcOwes` per NPC; `ask_loan`/`ask_repay` map onto it; new
`$GiveMoney <amount> [gift|loan]` ask leaf (player gives) and an NPC-side
money request close the loop; repayment clears both directions. Item
ownership: gifts transfer permanently, borrows are temporary with a due day,
steals are covert transfers stamped through the stealth/evidence/suspicion
pipeline — which already exists and ships (`doSearchRoom`, ui.js:3394); this
phase's new work is the ownership/ledger model on top of it, not the take
mechanic itself. Taking something directly off an NPC's person (rather than
their room) is pickpocketing, D33/Phase 1B.
**Files.** `asks.js` (new `$GiveMoney` leaf), `money.js`/ledger, migration of
`_loanOwed`, item model (`owner`/`borrowed`), inventory + world-object item
instances, `stealth.js` (steal hook onto the existing `doSearchRoom` path).
**Verification.** Loan both directions settles and clears; a borrowed item
NPC demands back on due day; a witnessed steal lands in evidence/suspicion.

### Phase 5 — Reverse overtures & NPC-initiated asks (D10, D31)
**Goal.** NPCs initiate too: invitations (party, cook-off, dinner, outing)
and requests (money, a borrowed item, help) delivered through the existing
overture channels, with the player's accept/decline resolved by the same
deterministic machinery mirrored with the player as target (reads NPC intent
+ player standing/mood to flavor and weight the ask, never to filter out
asks the player can't actually grant — that mismatch is drama, not a bug).
A third reverse category rides the same channel (D31): an NPC-initiated
advance on a sleeping/unaware player. Whether the player wakes resolves
deterministically (mirroring D30's branch shape); if they wake, the
into-it/decline/anger choice is real player input, never a computed roll.
**Files.** `overture.js` (reverse-ask rows + payloads), `asks.js` (mirrored
resolve), `boundary.js` (D31's sleeping-player branch), `ui.js`
(accept/decline chips reused, extended with the third rung for D31).
**Verification.** Across a simulated week an NPC issues a plausible invite
and a plausible request; accepting schedules the event (P1 machinery); a
request the player can't fulfill (e.g. money they don't have) resolves as a
normal decline/tension beat, never a soft-lock; an NPC's sleeping-player
advance either leaves the player asleep throughout or wakes them into a real
three-option choice — never a resolved outcome the player didn't pick.

### Phase 6 — Follow (D11)
**Goal.** A `$FollowMe` ask leaf sets `npc.follow`; a follower paths with
the player room-to-room through the movement-presentation layer. Follow ends
on arrival, entering a private space the NPC wouldn't enter, conversation, or
an explicit release. `npc.follow` is sim state; the walk presentation never
writes it.
**Files.** `asks.js` (leaf), `movement.js` presentation layer, the npc-agenda
hook (real home TBD — likely `tracker.js`/`intent.js`; no `planner.js`
exists), `cognition.js`'s `isPrivacyRoom` (private-space gating).
**Verification.** "Follow me" → NPC tracks the player across rooms; entering
a bedroom releases the follower; the flag reads as sim state after a load.

### Phase 7 — Apology + Ask for Space / Boundaries (D12–D13)
**Goal.** `$Apologize <for X>` is belief-gated (an NPC only accepts an
apology for something they believe happened); sincere + timely repairs part
of the transgression's REL_DELTA, insincere/repeated deepens it, and the
apology is recorded in NPC beliefs (`forgiven`) so gossip carries it. Ask for
Space / boundary asks (respect privacy, stop an unwanted behavior, don't
enter my room) write per-NPC flags the D15 engine respects.
**Files.** `asks.js` (two leaves), the forgiven record (real home TBD —
likely `relationships.js`/`rumination.js`; no `beliefs.js` exists),
`stealth.js` (transgression source), new `flags.js` (boundary rows, D15).
**Verification.** Apologizing for an unknown wrong is rejected; a sincere
timely apology moves REL_DELTA; a boundary flag changes NPC behavior
(perception-gated).

### Phase 8 — Temperature & clothing (D16)
**Goal.** A thermostat verb sets a target; daily ambient temperature derives
from season schedule + player setting + heat sources; HVAC billing scales
with the player's delta instead of the flat `UTILITY_THERMOSTAT` multiplier.
NPCs derive clothing from temperature through the wardrobe system and get
annoyed (mood/desire deltas) outside their comfort band — then try to change
it themselves: use the thermostat, change clothes, complain (a D15
comfort-flag behavior). Extreme settings are the drama, not smoothed away.
**Files.** `defs.world.js`/`defs.actions.js` (thermostat verb), new
temperature module (ambient + comfort), `computer.js` utils.hvac billing,
clothing derivation (real home TBD — likely `items.js`/`sprites.js`; no
`wardrobe.js` exists), `cognition.js` (annoyance/self-adjust).
**Verification.** Setting 28°C in summer raises billing above baseline; an
NPC outside comfort band shows mood delta and self-adjusts (thermostat /
clothing / complaint) when present.

### Phase 9 — Cleaning system + Clean Hallway (D17)
**Goal.** Per-room `dirt` (0..1) with sources (cooking, eating, parties,
foot traffic, dust over time) and decay; new cleaning verbs (`self.clean`,
per-object: sweep/vacuum/mop/wipe) plus supplies (broom/mop/vacuum as
purchasable items or room equipment); NPCs clean through the existing chore
system. Dirt feeds the smell/signal layer and builds into a visible/annoying
state. "Clean Hallway" is this system pointed at `hallway_a`/`hallway_b`.
**Files.** new `dirt.js` module, `defs.actions.js` (cleaning verbs),
`defs.items.js` (supplies), NPC cleaning (real home TBD — likely
`sim.js`/`drives.js`/`commitments.js`; no dedicated `chores.js` exists),
smell/signal layer (`signals.js`), `loadgame.js` ORDER + `?v=` bump.
**Verification.** Cooking accumulates kitchen dirt; cleaning decays it; a
dirty kitchen reads in the smell layer; an NPC chore cleans a room; hallway
cleaning action works.

### Phase 10 — Kitchen & Dining + Bathroom & Grooming (D18–D19)
**Goal.** `coffee_maker` brew verb (caffeinated drink item — energy/mood
effects); `trash_kitchen` take-out-the-trash chore (resets kitchen smell);
dining room's identity is shared meals as events (P17) on
`set_meal`/`sit`/dishes. Bathroom: `toilet` hygiene beat,
`bathroom_mirror` groom (brush teeth, fix hair — appearance/confidence
hooks into wardrobe/sprite), `sink_bathroom` wash hands; grooming affects
appearance-driven social reads; `long_shower` stays the relaxation variant.
**Files.** `defs.actions.js` + `defs.items.js` (new verbs/drinks),
`defs.world.js` (verb attachments to existing objects), the trash chore
(same real-home caveat as Phase 9's `chores.js`), grooming's appearance hook
(real home TBD — likely `avatar.js`/`sprites.js`; no `appearance.js`
exists).
**Verification.** Brewing then drinking coffee gives energy/mood; taking out
trash clears kitchen smell; grooming raises appearance read that a social
gossip event consumes.

### Phase 11 — Laundry chain + Snoop (D20)
**Goal.** `self.laundry` splits into **Wash** (washer load — closed-form
cycle), **Dry** (dryer or line), **Fold**, **Put Away** (into the wardrobe —
makes clothes available again), and **Snoop** (read an NPC's laundry — a
small perception/suspicion moment with gossip potential). Clothes move
`dirty → washed → dried → folded → stored`; `laundry_machines` facility
gates washer/dryer verbs.
**Files.** `defs.actions.js` (laundry verbs), laundry module (loads + state),
clothing states (same real-home caveat as Phase 8's `wardrobe.js`),
`signals.js` (snoop's perception layer), `loadgame.js` ORDER + `?v=` bump.
**Verification.** Dirty → stored round trip works; a washer load completes on
schedule; snooping produces a perception/gossip outcome; clothes in `stored`
are wearable again.

### Phase 12 — Entry: mail, deliveries, answer the door (D21)
**Goal.** A `mailbox` state accumulates mail (bills, flyers, packages) the
player gets via "Get Mail/Deliveries"; **Answer the Door** presents
"who's there" (delivery driver, friend, roommate, solicitor) and the player
admits/refuses through a short deterministic beat. Locking (`door.*`) and
delivery ETAs already exist — this is the physical door-side of them.
**Files.** new `mail.js` module, `defs.world.js` (mailbox verb),
`defs.actions.js` (answer-door beat), external-world retiming (arrivals),
`loadgame.js` ORDER + `?v=` bump.
**Verification.** Mail accumulates and is claimable; a knock triggers an
answer-door beat that resolves admitted/refused; a package arrival retimes
into the door sequence.

### Phase 13 — East Wing hotspot + sauna (D22)
**Goal.** The declared priority. Existing `self.swim`, `self.play_games`,
`self.workout` stay; add pool games (water-volleyball, Marco Polo — shared
activities), `pool_loungers` (sunbathe/read), `lockers` + `changing_bench`
(store swim gear / change — wardrobe hook), `yoga_mat` + `weight_set` verbs,
the **sauna upgrade** (a subroom in `pool_room`'s south-west corner, a
north-facing door, privacy inside the pool room's own footprint, health +
social perks — resolved Q2), balcony verbs (`balcony_table` sit/eat,
`plant_balcony` tend), and East-Wing **events** (pool party) through the
invitation system. The chokepoint design (game room gates the wing) stays;
the wing stops being empty.
**Files.** `defs.actions.js` + `defs.world.js` (new verbs/objects),
`STRUCTURAL_UPGRADES`/`FACILITY_DEFS` (sauna), `defs.actions.js` shared
activities (pool games), invitation system (pool-party eventType),
`loadgame.js` ORDER + `?v=` bump.
**Verification.** A wing visit offers the new verbs; a pool party books and
runs; sauna upgrade unlocks and gives health/social perks; swim gear storage
round-trips with the wardrobe.

### Phase 14 — Crossword / puzzle minigame (D23)
**Goal.** A new BrineOS app (`APP_DEFS` entry, phone + computer). Seeded
daily puzzle from a word/definition bank (seed = day), fill-in grid UI,
hints, and mood/skill rewards. A wordle-style second seeded daily mode is an
easy extension here.
**Files.** `defs.computer.js` (APP_DEFS 'puzzles'), new puzzle module (grid
gen + bank), BrineOS UI (grid render, input), skills/mood hooks.
**Verification.** Same-day seed gives the same grid; a completed puzzle grants
the reward; a half-fill survives a save/load; the app lists on phone +
computer.

### Phase 15 — Chatter social media layer (D24)
**Goal.** `social_feed` (chatter.example) grows: NPC profiles (bible +
`avatarChip`/portrait), posts generated from house events + NPC
beliefs/gossip (templated, LLM-finished), like/comment (NPCs react through
the cognition/gossip systems), a player profile, and a feed seeded from live
house state. Content quality risk ("great or awful") is gated by the
existing SFW/consent pipeline and the narrative rules, never by post-hoc
censorship. `harvestChatterResidue` (dreams.js) already proves the
house→feed pipeline.
**Files.** `defs.computer.js` (APP_DEFS social_feed), Chatter UI, feed
generator (templates + `generateText` finish), cognition/gossip reaction
hooks, dreams.js integration.
**Verification.** A house event produces a Chatter post; an NPC reacts
(likes/comments) plausibly; the feed renders on phone + computer; NSFW/SFW
gating holds.

### Phase 16 — Skill research (D25)
**Goal.** Skills become a developable track: self-directed research (browser
+ bookshelf: spend time reading/studying a named skill), practice actions
(hobby/verb actions already grant `def.skill` XP), and skill-gated verbs
(cleaning quality, cooking already, new hobby verbs). EduStream courses stay;
this makes skill growth a lifestyle, not a class schedule.
**Files.** `defs.actions.js` (research verbs), `skills.js` (practice +
gating), `defs.computer.js` (browser hooks), `defs.world.js` (bookshelf).
**Verification.** Researching a named skill raises its XP; a skill-gated verb
unlocks at the threshold; progress persists across a save/load.

### Phase 17 — House Parties + Touring (D26–D27)
**Goal.** Parties: invite N guests through the invitation system; a
multi-participant event with music (D29 hooks the existing music devices),
food (cooked or DoorDrop catering), drink, noise (signal layer — neighbors
react), and a mess it leaves behind (D17 dirt — cleanup is part of the
price). Parties are where flags, gossip, and romance collide; the D2 event
shape makes it a feature, not a special-case script. Touring: invite a
guest/roommate on a tour; the pair walks the apartment through narration
beats per room (deterministic beats + flavor, riding the walk/movement
presentation).
**Files.** `commitments.js` (party eventType), `defs.actions.js` (party
props: music/food/noise/mess), D9 dirt integration, invitation system
(multi-guest), touring module (beats), movement presentation.
**Verification.** A party books with N guests, runs, produces noise + mess,
and neighbors react; cleanup resolves the mess; a tour plays narration beats
room-by-room.

### Phase 18 — RETIRED (was Pets, D28)
Cut 2026-08-31. Pets need their own dedicated design track — the dog case
alone implies an "outside"/off-map layer this game has never modeled — not
a phase squeezed into this plan. See D28 and Q3. Nothing here to implement.

### Phase 19 — Audio & sound track (D29)
**Goal.** A standing acquisition + hookup track: per-mood/scene music (a
small library of generated originals) and per-action sound effects (doors,
cooking, water, laundry machines, notifications, doorbell). Hooked through
the existing music-device/headphones substrate (intimacy plan Phase 19) so
the sound-blocking rules still work. Asset work + a thin audio module; can
proceed in parallel with any gameplay phase.
**Files.** new `audio.js` module, music/SFX asset library (hosted URLs),
music-device integration, `defs.actions.js` (SFX hooks).
**Verification.** Music swaps with mood/scene; SFX fire on their actions;
headphones/music-device sound-blocking still respected.

## Status

| Phase | Feature | Decisions | Status |
|-------|---------|-----------|--------|
| 1 | Invitation & Event core | D1–D4 | Not started |
| 1B | Stealth, detection & covert acts | D32–D36 | Not started |
| 2 | Make-a-Move → Ask + Affection acts | D5–D7, D30 | Not started |
| 3 | Flags & Conditions engine | D15 | Not started |
| 4 | Money & Item controls | D8–D9 | Not started |
| 5 | Reverse overtures & NPC-initiated asks | D10, D31 | Not started |
| 6 | Follow | D11 | Not started |
| 7 | Apology + Ask for Space / Boundaries | D12–D13 | Not started |
| 8 | Temperature & clothing | D16 | Not started |
| 9 | Cleaning system + Clean Hallway | D17 | Not started |
| 10 | Kitchen & Dining + Bathroom & Grooming | D18–D19 | Not started |
| 11 | Laundry chain + Snoop | D20 | Not started |
| 12 | Entry: mail, deliveries, answer the door | D21 | Not started |
| 13 | East Wing hotspot + sauna | D22 | Not started |
| 14 | Crossword / puzzle minigame | D23 | Not started |
| 15 | Chatter social media layer | D24 | Not started |
| 16 | Skill research | D25 | Not started |
| 17 | House Parties + Touring | D26–D27 | Not started |
| 18 | ~~Pets~~ — retired | D28 | Retired 2026-08-31 |
| 19 | Audio & sound track | D29 | Not started |

## Dependency order

```
P1  Invitation & Event core (spine)
├─ P1B Stealth, detection & covert acts (sequenced early; D8/D20/D30/D31 consume it)
├─ P2  Make-a-Move → Ask + Affection   (independent after P1; D30's cover-tracks rides P1B)
├─ P3  Flags & Conditions engine       (needs P1 decision-time surface)
│  ├─ P7  Apology + Boundaries         (writes boundary flags → P3)
│  ├─ P8  Temperature & clothing       (comfort flags → P3)
│  └─ P17 House Parties + Touring      (flags colliding at parties)
├─ P4  Money & Item controls           (independent after P1; pickpocket rides P1B)
├─ P5  Reverse overtures               (needs P1 event booking; D31 rides P1B)
├─ P6  Follow                          (independent after P1)
├─ P9  Cleaning system                 (independent; feeds P17 mess)
├─ P10 Kitchen & Bathroom              (independent after P1; P17 meals)
├─ P11 Laundry + Snoop                 (independent; laundry-snoop is its own
│                                       instance of the P1B pattern, not P1B itself)
├─ P12 Entry: mail / answer door       (independent)
├─ P13 East Wing hotspot + sauna       (needs P1 event booking)
├─ P14 Crossword minigame              (independent)
├─ P15 Chatter social layer            (independent; feeds on house events)
├─ P16 Skill research                  (independent)
├─ P18 — RETIRED (was Pets; see D28)
└─ P19 Audio & SFX                     (parallel, any time)

Parallel-safe clusters: P1B/P2/P4/P6/P10/P11/P12/P14/P15/P16 after P1;
P3 must precede P7/P8; P9 precedes P17; P19 anytime.
```

## Open questions (parked — none blocking)

- **Q1 — Study/Computer/Phone "great or awful" content (D24/D25).** The
  user's selection "a lot of potential to be great or awful" (Study item 4)
  lost its specific content in a context handoff. Define the concrete
  deliverable with the user before starting P15 (Chatter) or P16 (skills).
User: "Video Call a Friend — Messages app: scheduled call with an off-map 
friend-of-roommate; roommates can interrupt. [system]" This is was what I was
referring to when I said that this has a lot of potential. I have a good vision
for a system like this, but have decided it is too out of scope for what I want
in this game. So we will be bypassing the video call feature entirely.
- **Q2 — Sauna specifics (D22).** Placement (in/off the changing room),
  capacity, health/social perk tuning, and whether it's a
  `STRUCTURAL_UPGRADES` or `FACILITY_DEFS` entry. Resolve at P13 kickoff.
User: Changing room is relatively small. I think I am going to put the sauna
in the pool room, in the South-West corner with a North facing door. The sauna
is a 'subroom' technically because it exists entirely inside of the pool room
and offers a certain level of privacy.
- **Q3 — Pet scope (D28).** Which species, how adoption works (adoption
  event? stray?), and how heavy the NPC-interaction layer is. Resolve at
  P18 kickoff.
User: So to own a pet, one has to take care of them. For some pets this means
never leaving the home, while with some it does. You have to 'walk the dog' for
them to relieve themselves. Cats, fish, reptiles, are all examples where you
never have to leave the home for them to be taken care of. While my initial
inclination is to include dogs, we do not currently have a single method for
the player to leave the apartment at all. If we want to include dogs, we need
to talk about an "outside" layer of the sim.
User (2026-08-31): Cutting pets from the plan entirely — a pet system needs
real design and implementation on its own; it isn't a good fit squeezed into
this plan here. See D28 (retired) and Phase 18 (retired).
- **Q4 — Cook-off judging & stakes (D14).** `taste.js` scoring weights and
  what winners actually win (bragging rights, small money,
  chores-for-a-day). Resolve at P17 kickoff (cook-off books as an event).

## Design invariants

With scars, from the playthrough and refactor. **Treat these as
non-negotiable.**

1. **Decide before you decorate.** Every outcome is computed
   deterministically first; LLM/flavor text only *finishes* the wording.
   Flavor never decides.
2. **The willingness gate is the only door to sex** (intimacy plan + D5).
   Never bypassed, never shortcut, for player-initiated *or* NPC-initiated
   advances. Everything else — asking, declining, env setup — is legit.
3. **An NPC is never bound by a rule it cannot perceive** (D15). Detection
   through the perception/signal layer is a precondition for enforcement;
   otherwise rules are magic.
4. **A conversation never replies for a person who isn't there** (D4). The
   join-machinery matches roster to present people; no avatar ever speaks
   for an absent NPC.
5. **Events are commitments.** One scheduler; an invitation that is accepted
   is a commitment that runs; "Clear the Calendar" is the explicit escape
   hatch, not silent abandonment.
6. **No field without a reader.** Everything added here is consumed within
   its own phase (vocation D23 scar). No orphan state.
7. **Verification split.** Pure logic verified in `dev/verify` (Node);
   presentation/visual verified on the live page with `page_eval` +
   vision. Both for visual phases.
8. **New source files register** in `loadgame.js` ORDER and bump the
   `?v=` cache-busting param (intimacy plan pattern).
9. **Money and items are symmetric ledgers** (D8–D9). A loan is a loan
   whichever side owes it; an item is owned/borrowed/stolen by someone —
   never a free-floating flag.
10. **The presentation layer never writes sim state.** Movement walk-ins,
    walk presentations, and chatter are views over sim state, never
    mutators (liveliness plan carryover).