# Audit — the fridge only worked one way (2026-09-23)

**Status: SHIPPED AND VERIFIED (0.14.2); seven follow-ups OPEN (below).**
Written during a self-guided find-and-improve session whose brief was "find
somewhere we're missing genuine, fun gameplay content". No paired prompt:
this is an audit plus the slice it led to, not a phased overhaul. Move to
`complete/` once the follow-ups are built or explicitly declined.

---

## What was missing

The perception plan built notes as ordinary world objects (`spawnNote`,
world.js; the `note` OBJECT_DEF; Read / Bin verbs) and argued its whole
design from one case: *"an endearing or passive-aggressive note on the fridge
that draws your eye the moment you walk in"*. It let only the **player**
write one. `NOTE_TEMPLATES` (config.js) held NPC note text with a named
consumer, "roadmap Plan 5".

Plan 5 (npc-initiative-plan.md) then listed "NPC-authored notes (`spawnNote`
already takes an `authorId`)" as an in-scope cheap extension (D6) and filed
tier 2 as *"Largely built … `spawnNote`'s existing `authorId`"* (line 217).
**Nothing ever wrote one.** For six weeks:

- a note you left was never read by anyone;
- no roommate ever left a note;
- `NOTE_TEMPLATES` had no reader (an R8 exception that never closed);
- `meta.addressedTo` was reserved and never set.

Both `complete/` docs still say otherwise (perception-and-signals-plan.md:90
"has no writer yet" is now stale in the other direction). They're historical
records; this doc is the correction.

## What shipped

`housenotes.js` (new, in both script lists), one pass per `resolveTick` on
each awake resident's final location. See its header for the full design.

- **Tidy:** an author takes their own note down once you've read it and 2
  days have passed, or at 6 days. Your notes are never taken down for you.
- **Read:** residents read every note in the room they're in, yours included,
  and catch up on new replies. Your words go into their memory **verbatim**
  (`note_read` → a social-importance episode), so the LLM can bring them up.
  A note of yours **addressed** to them moves the relationship a hair
  (affection or tension ±0.02, once per person per day).
- **Reply:** having read a note, they may write a short line on the bottom,
  picked by what kind of note it is (your free text is read by
  `HOUSE_NOTE_TUNING`'s patterns: complaint / thanks / well-wish / offer /
  question / plain) and voiced by their `textingStyle`. A complaint gets
  "sorry" or "defensive" depending on warmth, fondness, volatility and
  tension. "ask {other}" names a real housemate. A reply flips the note back
  to unread.
- **Write:** at the fridge, with you out of the room, a resident may leave a
  note for a **real, stored reason**: the sink derived "many", the bin
  `full`, their own `music_too_loud`/`party_loud` or `temperature_complaint`
  (now carrying `data.cold`) from today or yesterday, an `investigate_smell`
  that cleared a container, a batch cook with servings left in the fridge
  (the eat event now carries `data.cooked`), or a renovation job you booked
  that completed within 3 days. Gripes scale with `passiveAggression`
  (conscientious, unassertive, cool); warm notes need affection ≥ 0.2.
  Caps: one per author per day, two per house per day, 3-day motive cooldown,
  never a second note on a grievance already up.
- **Player side:** a **For** picker on Leave a Note; **Write Back on X's
  Note** (Notes ▸) once you've read someone's note; the read narration shows
  who it's for, every reply underneath, and "(Seen by …)" on yours.
- Content: 8 motives × 7 voices × 2 lines, 7 reply pools × 7 voices × 2.
- Rolls come from a per-NPC `seededRng` or a hash of the note id, **never the
  tick's shared stream**. Measured: `resolveTick` with the pass is
  byte-identical to without it apart from note events (verify-house-notes §9).

## Harness changes (and why each is the check being wrong, not the code)

- **verify-c4.js `__dirtyCount`**: counted *any* object whose state appears
  in its `emits` table as dirt. A note emits a sight signal in both read
  states, so every note became a mess-house-day and the tidy-vs-untidy check
  inverted (174 vs 159). Measured with the pass switched off via a loader
  hook: every behavioural count was identical (clean_common 54/32/65/26,
  investigate 11). Now dirt = an emitted key the def's own `dirtyWhen` names.
  Result: 97/68/93/120 mess-house-days, identical with notes on and off and
  identical to the pre-change baseline. (It had also been counting stereos by
  volume, a constant in both arms; capable went 62 → 61.)
- **verify-s4.js**: the `NOTE_TEMPLATES` shape check walks motive → style →
  lines now, and requires a `default` pool per motive.
- **verify-i2.js** was right: it finds emittable event types by scanning for
  `type: '…'` literals, and a ternary hid both `note_left` types. The code
  now spells them out.
- **verify-house-notes.js** (new, 90 checks).

Sweep: 6217/12/0 before → **6307/12/0 after**. The delta is exactly the new
harness's 90, every other per-file line is identical, and the 12 are the same
known failures (commitment/drive race, seek_stimulation, gift_to_player, the
c2 fire list).

## Decisions made without the user (override freely)

1. NPCs **write** only at the kitchen fridge; they **read** anywhere.
2. NPCs write only when you're **not in the room** (a note is what you leave
   instead of saying it).
3. Gripe notes are **unaddressed** ("whoever" is the genre); warm notes are
   addressed to you.
4. The relationship nudge needs **explicit addressing** (the For picker); a
   note that merely names someone doesn't move anything.
5. The original `logistics` lines ("rent's due friday and i get paid
   thursday", "landlord called about the window", "out till late") were
   **dropped**: no stored state grounds them yet (see F1).

## Open follow-ups (not built)

- **F1 — "Out till late, don't wait up."** Ground it in the schedule: a
  resident whose day has them offsite through the evening (`npcIsOffsite`
  probed at ~21:00 of today) leaves it in the morning. Needs a schedule
  probe helper that doesn't disturb `resolveScheduleActivity`'s callers.
- **F2 — Occasions tie-ins.** A birthday-card note ("{name}'s birthday
  thursday. card's in the drawer, sign it"), a holiday note, "decorations
  come down this weekend". Occasions P4 (traditions) could use notes as a
  channel. Watch for overlap with birthdays.js's tip-off texts.
- **F3 — Roommate-to-roommate addressed notes**, grounded in cast-web
  tension ("Jonah — you owe me $20. — M"). Drama you can snoop on.
- **F4 — Notes in the conversation prompt.** Notes reach the LLM only as
  episodes today. Listing what's currently on the fridge in the scene
  context when you talk in the kitchen would let a roommate say "did you
  see my note?".
- **F5 — Binning someone's note.** The author never notices. An unread
  binned note could be a small tension beat.
- **F6 — Reading a note addressed to someone else.** Residents do; nothing
  follows. That's the privacy question the perception plan reserved
  `addressedTo` for.
- **F7 — Real-model round trip.** Engine and UI are verified (node, plus
  dev-harness.html live 2026-09-23: Leave a Note with For, Read, Write Back,
  roommates reading and replying through real `advanceAndResolveMinutes`,
  the note re-drawing the eye). Not yet checked: that a roommate actually
  brings a note up in conversation with a live model.
