// ===== SECTION: DEFS.PATCHNOTES =====
// The Patch Notes app's data: a real, player-facing release history keyed
// by GAME_VERSION (config.js). Unlike almost everything else under a
// defs.*.js file, this content is NOT in-fiction — it's a genuine changelog,
// the same kind a Steam page or itch.io devlog would show, presented as a
// phone/computer app the same way the Debug Log (F4 cheat menu) and the
// version-mismatch save warning already surface real development facts to
// the player. `render.computer.js`'s renderPatchNotesList/renderPatchNotesDetail
// read this directly; nothing in it is derived from live game state.
//
// Newest entry first. Each entry:
//   version   the GAME_VERSION string this entry documents (must match a
//             real value GAME_VERSION has held — this is where the CURRENT
//             GAME_VERSION always gets its entry, per the process note
//             below)
//   date      a real-world date ('YYYY-MM-DD') — this is about the
//             software's development, not an in-game day
//   title     a short name for the release, one line
//   summary   optional, one or two sentences of framing before the list
//   changes   [{ kind, text }], kind one of 'added'|'changed'|'fixed'
//             (colors/labels the detail renderer's own job — see
//             PATCHNOTES_KIND_LABELS below)
//
// --- Process note for future sessions ---
// HANDOFF-PROMPT-ARCHITECTURE.md's Step 3 (the mandatory close-out) now
// includes: when a plan's FINAL phase completes, add an entry here
// summarizing the whole plan, and bump GAME_VERSION if it hasn't already
// moved since the last entry. This file is the one place that instruction
// actually lands — read that doc before writing a new entry so the shape
// and tone stay consistent with the rest of this list.
const PATCHNOTES_KIND_LABELS = {
  added: 'Added',
  changed: 'Changed',
  fixed: 'Fixed',
};

const PATCH_NOTES = [
  {
    version: '0.14.1',
    date: '2026-09-21',
    title: 'Hotfix: Bathroom Routing & Any-Door Peeking',
    summary: "A small hotfix: one household bug, one long-requested expansion "
      + "to the peeking system, and the sauna finally gets used by more than "
      + "just you.",
    changes: [
      { kind: 'fixed', text: "Building the Private Ensuite was supposed to seal Bathroom A off from everyone but you, forcing the rest of the household to queue for Bathroom B. Instead, roommates kept showing up in Bathroom A to shower and groom regardless of the upgrade or which hallway their own room was on. They now respect the lock." },
      { kind: 'added', text: "Peeking and listening at a door is no longer limited to bedroom and bathroom doors off the two hallways — any real door in the apartment (the gym, the game room, the study, the balcony, and more) can now be peeked or listened through. The option only shows up when there's actually someone on the other side to catch." },
      { kind: 'added', text: "Roommates can now use the sauna themselves instead of leaving it to you. If someone's in there when you're not, you can peek in through the sauna door and see for yourself." },
      { kind: 'fixed', text: "A more anxious, easily-rattled roommate was supposed to reach for the sauna to unwind more than an even-keeled one would. A typo in that behavior meant everyone was equally likely to use it regardless of temperament — now the anxious ones actually do head there more." },
      { kind: 'fixed', text: "Getting caught sneaking into your bed at night, or a household welcoming a new baby, were both supposed to stick in a roommate's memory as their own kind of moment — one awkward, one warm — the way they mentally group and revisit things over time. A wiring gap meant neither ever got filed that way, so they were quietly invisible to that process. Fixed." },
      { kind: 'fixed', text: "Roommates using the pool or sauna on their own was rarer than intended — even a roommate who'd genuinely enjoy it almost never found the idea appealing enough in the moment to act on, so both sat unused regardless of who lived there. They're now realistically likely to head there on their own, especially the more easygoing, laid-back ones." },
      { kind: 'fixed', text: "A character's written backstory, and the sample lines of dialogue you or the AI gave them while creating them, never actually reached a conversation — they only ever showed up on their profile page. Conversations now draw on both, so a roommate's history and the way they were written to sound actually come through in how they talk to you." },
      { kind: 'added', text: "Sandbox mode now lets you set who a roommate already is to you before the game starts — a stranger by default, but also an acquaintance, a friend, a close friend, an ex, or family (a sibling, a relative, or step-family). Pick one and they'll already know you: a real history, no starting over at 'nice to meet you.'" },
      { kind: 'fixed', text: "A roommate's stated wardrobe habits (what they'd wear to work, casually, to bed) never actually affected what they wore — only their profile said it. Their real outfit choices now lean toward it." },
      { kind: 'added', text: "How skilled a roommate actually is at a hobby now matters: sharing that hobby with them deepens things faster the better they are at it, and if someone else is around to see it, they'll notice and may bring it up later." },
    ],
  },
  {
    version: '0.14.0',
    date: '2026-09-19',
    title: 'Aspirations, Creative Careers & Chatter',
    summary: 'The gig board grows up, going independent becomes real, and '
      + 'Chatter stops being a house bulletin board and becomes a platform '
      + "everyone — you included — actually has a presence on.",
    changes: [
      { kind: 'added', text: "The gig board now covers six categories — admin, tech, writing, music, art, and food — each with its own reputation you build by delivering that kind of work. A specialist and a generalist see very different boards." },
      { kind: 'added', text: "Going independent: once your craft and reputation are strong enough, you can self-publish a book, release a track on Streamly, sell or hang a finished painting, or open your own home kitchen through DoorDrop. Released work keeps earning afterward — a trickle that fades without upkeep, so staying prolific matters more than any single hit." },
      { kind: 'added', text: "Chatter is now a real social platform: you pick a pseudonymous handle, build an audience across Followers, paying Backers, and an opt-in Chatter Private tier, and can block anyone by hand. Some NPCs run their own pages too, including ones you can pay to subscribe to." },
      { kind: 'added', text: "People in the house — and on Chatter — can now form real opinions about your work, your posts, and how you've decorated your room, remember them, and bring them up or repeat them to others." },
      { kind: 'added', text: "Recognition: posting under a handle doesn't guarantee anonymity forever. Someone who knows you well enough can eventually put the pieces together, and word can spread from there." },
      { kind: 'added', text: "Aspirations: choose up to two life directions (craft, connection, comfort, independence, notoriety) from the new Compass app. Milestones surface on their own as you play and pay off in mood and recognition — nothing is ever locked behind them, and switching directions never costs you progress already made." },
      { kind: 'changed', text: "Solo living is no longer flatly impossible — it's a genuine late-game accomplishment for someone who has stacked a real craft, a strong reputation, a following, and a catalog that keeps earning, all at once. It stays out of reach for everyone else." },
      { kind: 'added', text: "A well-designed room is no longer just decoration — people who spend time in it notice and form opinions about it, and finished paintings can be hung on the wall instead of sold. The in-game Home designer also gained an Arrange mode, undo/redo, and touch support, so you can rearrange your own room's furniture without leaving the game." },
    ],
  },
  {
    version: '0.13.0',
    date: '2026-09-10',
    title: 'The September Audit',
    summary: 'A full-codebase audit went looking for uncompleted systems, '
      + 'disconnects between what was built and what players could actually '
      + 'reach, and general bugs — then fixed what it found.',
    changes: [
      { kind: 'fixed', text: 'A partner who was clearly not in the mood (explicitly negative mood and desire right now) could still be read as willing for a three-way advance if relationship history and room privacy compensated. The hard consent floors (asleep, hostile, stranger, actively refusing) were never affected — this was a gap in the softer threshold math above them.' },
      { kind: 'fixed', text: 'A sleeping resident could be offered to the AI narrator as a conversation speaker, "witness" you entering her room or breaking a house rule while unconscious, get summoned to a shared meal, or count as someone who might walk in on you — all while genuinely asleep. One shared "is this person actually conscious right now" check now covers every one of these.' },
      { kind: 'added', text: "Clean — a new action for wiping down a specific dirty object (the stove, a fridge full of rot, a cluttered table, the shower, and others) rather than only the whole-room tidy-up. Some of the mess in this apartment had no cleaning verb at all until now." },
      { kind: 'fixed', text: "An NPC's restless, bored behavior (looking for something to do) almost never fired — a handful of unrelated hobby drives had quietly out-competed it for months." },
      { kind: 'fixed', text: 'A messy kitchen table produced no smell or visual cue for anyone to notice, unlike every other dirty surface in the house.' },
      { kind: 'fixed', text: 'The late-night pool scene was supposed to carry a risk of someone walking in on it; the sound cue it depended on to signal that risk was never actually wired up.' },
      { kind: 'fixed', text: "A newborn baby's effect on the household (the sleep-deprived energy cost) only applied when the player was one of the parents — an NPC couple's baby cost the player nothing, despite living in the same apartment." },
    ],
  },
];
