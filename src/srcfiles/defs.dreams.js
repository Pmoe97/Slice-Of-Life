// ===== SECTION: DEFS.DREAMS =====
// Dream Engine Phase 2 (src/ref/complete/dream-engine-plan.md). Pure data: every
// hotswappable part of a dream lives here and nowhere else.
//
// The thesis in one line (D1): **the LLM never decides structure.** Form,
// perspective, tempo, register, lens, distortion, setting, cast, motif and
// panel count are all chosen by a seeded roll over the tables in THIS file
// before any model call is made. The model is handed the filled skeleton and
// writes panel prose into it; it chooses nothing else. That is the whole
// anti-slop guarantee, and it only holds while this file stays data.
//
// D6: every table entry is { id, label, weight, directive, imageFragment } at
// minimum — `directive` is the line the LLM sees, `imageFragment` is the
// phrase folded into the panel image prompt. Adding a new form, lens or
// register is an edit to this file and nothing else: no new code path, ever.
// **There are no functions in this file, deliberately.** The moment a table
// needs a helper to be read, D6 is gone and every later phase has two places
// to look.
//
// SHAPE: every table is an OBJECT KEYED BY ID, like ACTION_DEFS and ROOMS,
// not an array like the settings option tables. Two reasons: the compiler
// stores slot ids on the dream record and needs DREAM_FORMS[slots.form] to be
// a direct lookup (the Phase 4 verification is written against exactly that),
// and every entry restates its own `id` the way ACTION_DEFS entries do, so a
// value pulled out of a table still knows what it is. Weighted selection goes
// through SIM's weightedPick(rng, Object.values(TABLE), fn).
//
// ONE TRAP, worth stating once here: weightedPick's default weight function is
// `item.weight || 1`, so **an entry authored with `weight: 0` reads as 1**.
// Nothing in this file may ever use 0 to mean "off". Exclusion is a filter at
// selection time — that is how `napOnly` and the sfw gate work — and the
// tuning multipliers below floor at 0.15 rather than 0 for the same reason.

// The three abstraction bands every form, lens and distortion is tagged with.
// dreamAbstraction (grounded / balanced / surreal) reweights the pools through
// these bands rather than through per-id maps, so a new lens declares its band
// and is immediately weighted correctly by all three settings — no third place
// to edit, which is D6 applied to the tuning table itself.
//   literal — could happen; the wrongness is in the situation, not the physics
//   tilted  — one rule of the world is quietly broken and nobody remarks on it
//   unreal  — the physics are gone and the dream is not pretending otherwise
const DREAM_ABSTRACTION_BANDS = ['literal', 'tilted', 'unreal'];

// The flavours of morning a dream can leave behind (D12). Each register names
// one; Phase 7's wake narration switches on it. Kept as a short closed list
// rather than free text so the narration cannot be handed a band it has no
// line for.
const DREAM_WAKE_BANDS = ['warm', 'wry', 'unsettled', 'heavy', 'charged'];

// The kinds of raw material harvestResidue (Phase 3, dreams.js) can pull out
// of a save. A closed list for the same reason the bands are: the harvester's
// per-kind base weights below are asserted complete in both directions, so a
// new source added without a weight is caught rather than silently scoring 0.
//
// These are DESCRIPTIONS OF PROVENANCE, not of content — what the dreamer's
// relationship to the material is, which is the thing that decides how loudly
// it should sound in a dream:
//   participated — the player did it, and their body remembers
//   witnessed    — the player saw it happen to someone else
//   overheard    — words that reached the player, or NPC talk that did not
//   unseen_event — D7's superpower: something real the player never saw at all
//   grievance    — a standing complaint or an unsaid tension pointed at them
//   appetite     — a want, looked at directly or typed into a search box
//   obligation   — a promise or a bill with a date on it
//   possession   — an object the player owns and handles
//   absence      — somebody who has not been spoken to in a while
const DREAM_RESIDUE_KINDS = [
  'participated', 'witnessed', 'overheard', 'unseen_event',
  'grievance', 'appetite', 'obligation', 'possession', 'absence',
];

// --- DREAM_FORMS: the spine (D4) ---------------------------------------
// The form decides PANEL COUNT. `beats.length` **is** the panel count — there
// is no separate roll, and Phase 4 asserts the two match for every form in
// this table. Each beat carries its own `directive` (the line the writer gets
// for that panel, and only that panel), `phrase` (the composition fragment
// that panel's image prompt gets) and `fallback` (Phase 5).
//
// `fallback` is the templated prose buildDreamFallback (dreams.js) writes into
// this panel when the model call fails outright. It lives on the BEAT rather
// than as a switch in dreams.js for D6's reason and no other: a new form
// authored in this file must not need a code edit to become showable, and a
// per-form switch elsewhere is exactly the second home that would silently
// leave a new form dreamless the day somebody added one. Placeholders are
// {where}, {who}, {motif} and {residue}, filled from the compiled record.
//
// The templates are written in SECOND PERSON throughout and deliberately
// ignore `slots.perspective`, which is the one thing about the fallback that
// is not faithful. Twenty-one beats times five perspectives is eighty-five
// templates nobody would keep in sync, and second person is the stance that
// reads acceptably under all five — the perspective still reaches the PICTURE
// through composeDreamPanelPrompt, which is generated whether the writer
// succeeded or not. Sized to DREAM_TUNING.panelWordMin/Max once filled, so a
// total model failure is not visible to the player as a shape change.
//
// `napOnly: true` marks the single-beat fragment forms naps draw from (D16).
// The filter is on `forSleep`, so a night dream never draws a fragment and a
// nap never draws anything longer than one panel.
const DREAM_FORMS = {
  tableau: {
    id: 'tableau', label: 'Tableau', weight: 3, abstraction: 'literal',
    directive: 'A single held image. Nothing happens, nothing resolves, nobody arrives. The dream is one scene that is already complete and refuses to move.',
    imageFragment: 'a single held composition, nothing in motion',
    beats: [
      { id: 'held', directive: 'The whole dream is this one scene. Describe what is in it, then the one thing about it that is wrong. Do not resolve the wrongness and do not comment on it.', replayDirective: 'The whole dream is this one scene, and it is a real one. Reconstruct it exactly as it happened — the place, the people, the light — and let the detail that should not be yours to know sit plainly in the middle of it. Describe it from outside, without commentary.', phrase: 'a still, centred tableau',
        fallback: "You are in {where} and nothing here is going to move. {motif}, and it has been there as long as the room has. One thing about all of this is wrong; you can see which, and looking does not change it: {residue}.",
      },
    ],
  },
  loop: {
    id: 'loop', label: 'The Loop', weight: 3, abstraction: 'tilted',
    directive: 'The same small stretch of time twice. The second pass is the first pass with one element changed, and no one in the dream notices the change.',
    imageFragment: 'a repeated framing, the same angle twice',
    beats: [
      { id: 'first_pass', directive: 'A small ordinary action, start to finish. Plain and unremarkable. Establish the exact details a second pass could contradict.', replayDirective: 'The real event, start to finish, in the order it happened. Establish it plainly and accurately, the way someone would reconstruct a room after the fact — nothing embellished, nothing softened.', phrase: 'the ordinary version of the scene',
        fallback: "You are in {where}, doing the small ordinary thing you came in here to do. It takes exactly as long as it takes. You put your hand where your hand goes. {motif} is somewhere behind you and you do not turn round. All of this is correct.",
      },
      { id: 'second_pass', directive: 'The same action again, reusing the same nouns and the same order where you can, except one element is now different. State the difference flatly. Nobody reacts to it.', replayDirective: 'The same real event again, reusing the same nouns and the same order where you can. This pass is what it looked like from the outside — the detail the dreamer was never told is visible now, stated once, flatly.', phrase: 'the same scene, one element replaced',
        fallback: "You are in {where} again, doing the same small ordinary thing, in the same order, with the same hands. One element has been replaced since the first time and nobody mentions it. You do not stop. Underneath it, unchanged: {residue}.",
      },
    ],
  },
  descent: {
    id: 'descent', label: 'Descent', weight: 3, abstraction: 'unreal',
    directive: 'Arrival, then wrongness, then submersion. Each panel is further down and further in, and there is no route back up.',
    imageFragment: 'a downward composition, the horizon above the subject',
    beats: [
      { id: 'arrival', directive: 'The dreamer arrives somewhere lower than where they started. Describe the place at eye level and make it ordinary.', replayDirective: 'The event, from its beginning: the room, the doorway, the moment the dreamer walked into it. Reconstruct the place at eye level, ordinary and accurate, the way it really was.', phrase: 'the top of a descent, light from above',
        fallback: "The stairs put you in {where}, lower than you started. It is an ordinary place at eye level, all surfaces and low light and the smell of somewhere lived in. {motif} is here too and nothing about that seems worth remarking on. There is further down to go.",
      },
      { id: 'wrongness', directive: 'Further down. Something here does not obey the rule the first panel established. State it once, plainly, and keep going down.', replayDirective: 'The middle of the event, where it stops being explainable. Reconstruct what actually happened — the moment, the words, the movement — exactly as it must have unfolded, without adding meaning to it.', phrase: 'midway down, the light narrowing',
        fallback: "Further down. The rule that held on the last floor does not hold on this one; you say so once, to nobody, and keep going. {residue} is somewhere in the walls of this place. The light narrows behind you and you do not turn round.",
      },
      { id: 'submersion', directive: 'The bottom. The dreamer is inside the thing now rather than looking at it. End on a physical sensation, not a thought, and not on waking.', replayDirective: 'The end of the event, the moment it was already over. Describe what the dreamer could not have seen but now can, physically — the room settling, the silence, the aftermath. No interpretation; just the fact of it.', phrase: 'fully submerged, the light nearly gone',
        fallback: "The bottom. You are inside it now rather than looking at it, and the difference is physical: pressure at the ribs, cold at the back of the neck, {motif} somewhere above you and getting smaller. Your hands are still moving. Nothing arrives to stop them.",
      },
    ],
  },
  late_and_lost: {
    id: 'late_and_lost', label: 'Late and Lost', weight: 3, abstraction: 'literal',
    directive: 'Somewhere the dreamer is expected, and a route that will not deliver them there. The stakes are stated once and never explained again.',
    imageFragment: 'a corridor or street receding, the subject small in frame',
    beats: [
      { id: 'the_deadline', directive: 'Name what the dreamer is late for and how little time is left. Concrete and specific. Do not say they are anxious.', replayDirective: 'The event as it was bound to happen: the thing that was already decided before the dreamer knew about it. Reconstruct the lead-up — the schedule, the message, the missed signal — accurately, without saying the dreamer is anxious.', phrase: 'a clock or a doorway, the subject already moving',
        fallback: "You are due somewhere in eleven minutes and you are in {where}. You know exactly what it is you are late for: {residue}. {motif} sits in the hallway where you will have to pass it, and you are already moving.",
      },
      { id: 'the_wrong_route', directive: 'The way there stops working. Turns arrive in the wrong order, or the distance grows. Keep moving through it; do not arrive and do not give up.', replayDirective: 'The part of the event that went a way the dreamer never saw: the detour, the other room, the conversation between other people. Reconstruct it from outside, as if watching it from the doorway.', phrase: 'a route folding back on itself',
        fallback: "The way there stops working. The turns arrive in an order you did not agree to and each one puts more distance between you and the place you are expected. You pass {motif} twice. You keep going. You do not arrive and you do not stop.",
      },
    ],
  },
  wrong_room: {
    id: 'wrong_room', label: 'The Wrong Room', weight: 4, abstraction: 'tilted', settingKind: 'apartment',
    directive: "The dreamer's own apartment with one thing added that was never there. The building is right in every other particular, which is what makes it wrong.",
    imageFragment: 'a familiar domestic interior, one architectural element that should not exist',
    beats: [
      { id: 'familiar', directive: 'The apartment, exactly as it is. Three concrete true details, no more. Let the reader settle.', replayDirective: 'The real place, exactly as it is — the room where the event happened, furnished from what the dream knows about that room. Let the dreamer\'s eye settle on the truth of it before anything else.', phrase: 'the apartment as it really is',
        fallback: "You are in {where}. The mug is where the mug goes, the light does the thing the light does at this hour, and somebody has left the hall cupboard open again. {residue} is the only thing here you would not describe out loud.",
      },
      { id: 'the_extra_door', directive: 'There is a door, or a window, or a room, in a wall that never had one. Open it or look through it. Describe what is on the other side without explaining how it fits.', replayDirective: 'The door the dreamer never opened. The event happened on the other side of it, in a room the dreamer was never in. Reconstruct that room as it must have been — the light, the arrangement, the people in it — with the confidence of someone who was there and the absence of anyone who was.', phrase: 'a door in a wall that has no room behind it',
        fallback: "There is a door in the wall beside the window, and there has never been a door in that wall. You open it. On the other side is {motif}, and a distance the flat has no room for. Nothing explains it. You leave the door open.",
      },
    ],
  },
  audience: {
    id: 'audience', label: 'Audience', weight: 3, abstraction: 'tilted',
    directive: 'The dreamer is being watched doing something that should be private. The watchers are patient and entirely unremarkable.',
    imageFragment: 'a subject lit from the front, watching faces dim in the background',
    beats: [
      { id: 'on_display', directive: 'The dreamer is mid-task, in the open, doing something ordinary and unguarded. Describe the task in detail, as if it were still private.', replayDirective: 'The real event, seen whole. The dreamer is in it, doing what they actually did, but the dream watches from the outside — every detail of it, accurate, unguarded, exactly as it happened.', phrase: 'a lit foreground subject, mid-task',
        fallback: "You are in {where}, mid-task, hands busy with something you would only ever do alone: the unguarded version, the one nobody is meant to see. {residue} is part of it. The light is on you and only on you, and you carry on.",
      },
      { id: 'the_watchers', directive: 'They have been there the whole time. Say how many and how close. They do not intervene, do not speak, and do not leave.', replayDirective: 'The people who were there for it — how many, how close, what they did and did not see. Reconstruct them as they must have been, patient and unremarkable, doing nothing to stop it.', phrase: 'rows of quiet onlookers, faces indistinct',
        fallback: "There are perhaps forty of them and they have been there the whole time, seated in the dark just past where the light stops. Nobody speaks. Nobody looks away. {motif} stands at the front like an exhibit. You finish what you were doing.",
      },
    ],
  },
  undoing: {
    id: 'undoing', label: 'Undoing', weight: 2, abstraction: 'unreal',
    directive: 'Something whole comes apart across three panels, in the wrong direction, at a pace nobody can interrupt.',
    imageFragment: 'a composition losing structure from one edge inward',
    beats: [
      { id: 'intact', directive: 'The thing, whole and in use, described so the reader knows exactly what shape it holds.', replayDirective: 'The event, before it went wrong: whole and in use, the way it was at the start. Reconstruct it so the shape of what came later is already in it — without saying so.', phrase: 'the object or place whole and intact',
        fallback: "It is whole. You are in {where} and the thing is in front of you doing exactly what it was built to do, and you can see how it holds together, the joints and the tension and {motif} sitting inside it as though it belongs. It has never once failed.",
      },
      { id: 'the_first_thread', directive: 'One part gives. Small, specific, mechanical. The dreamer tries to hold it and their hands are the wrong size for the job.', replayDirective: 'The moment it began to come apart — the specific, mechanical detail where the real event turned. Reconstruct the exact sequence of it, the way someone would testify to it.', phrase: 'the first structural failure, close in',
        fallback: "One part gives. It is a small mechanical thing, a seam or a screw or a word, and it goes with almost no sound at all. You put your hands on it and your hands are the wrong size for the job. {residue} is what comes loose next.",
      },
      { id: 'nothing_left', directive: 'What is standing where it used to be. Do not mourn it in words — describe the space and let the space do it. Never end on waking.', replayDirective: 'What is left after the event: the room as it is now, the absence where the thing or the person used to be. Describe the space and let the space carry it. Never end on waking.', phrase: 'the empty space it occupied',
        fallback: "What is standing there now is the shape of the space it used to take up. {where} is bigger than it was. {motif} is on the floor where the rest of it went. You look at the empty part for a while and your hands stay where they are.",
      },
    ],
  },
  reunion: {
    id: 'reunion', label: 'Reunion', weight: 3, abstraction: 'literal',
    directive: 'Someone is here who should not be, and the meeting is warm right up until it is not. The wrongness is in them, never in the setting.',
    imageFragment: 'two figures at conversational distance, one lit more clearly than the other',
    beats: [
      { id: 'the_meeting', directive: 'They are here and the dreamer is glad. Give the reunion its full weight — a gesture, a first line of dialogue, the specific relief of it.', replayDirective: 'The meeting that actually happened, reconstructed whole: who was there, the gesture, the first line spoken, the specific weight of it. Render it warmly and accurately — the dreamer\'s memory of the event, not an invention of it.', phrase: 'a close, warm two-figure composition',
        fallback: "{who} is here. You had not understood how much of you was holding still until it stopped, and now there is a hand on your arm and the specific relief of a voice you know saying your name. {motif} is behind them. Neither of you moves.",
      },
      { id: 'the_wrongness_of_them', directive: 'Something about them is not right: a detail of face, voice, age or knowledge. State it once, without alarm, and stay in the room with them.', replayDirective: 'The detail of the real event that the dreamer could not account for at the time and now can: something in the face, the voice, the timing, or what they knew. State it once, flatly, without alarm, and stay in the room with it.', phrase: 'the same two figures, one subtly altered',
        fallback: "{who} is a little too tall, or the voice arrives half a second before the mouth does, or they know a thing about you that you never told them: {residue}. You notice it once and you do not raise it. You stay in the room with them.",
      },
    ],
  },

  // --- Nap fragments (D16). One beat, always. A nap is twenty minutes; it
  // gets an image and a paragraph, not an arc. These are the ONLY forms a nap
  // can draw, and no night dream ever draws them. Their abstraction bands are
  // spread across all three so the player's dreamAbstraction dial still means
  // something on the nap path.
  fragment_face: {
    id: 'fragment_face', label: 'Fragment: A Face', weight: 3, napOnly: true, abstraction: 'literal',
    directive: 'One face, held too long, seen too close. No situation around it. It is not doing anything.',
    imageFragment: 'an extreme close portrait, shallow depth of field',
    beats: [
      { id: 'the_face', directive: 'A single face at close range. Describe it in physical detail only — light, skin, where the eyes are pointed. Give it no scene and no dialogue.', replayDirective: 'A face the dreamer has seen, held too long, seen too close — the way it was in the real moment. Describe it in physical detail only: light, skin, where the eyes were pointed. Give it no scene and no dialogue.', phrase: 'a face filling the frame',
        fallback: "A face, close enough that it is all there is. {who}. Light from below, the pores of the skin, one eyelash out of place, the eyes pointed at something over your shoulder and staying there. It does nothing. It goes on doing nothing for a long time.",
      },
    ],
  },
  fragment_object: {
    id: 'fragment_object', label: 'Fragment: An Object', weight: 3, napOnly: true, abstraction: 'literal',
    directive: 'One object, isolated, given far more attention than it deserves. The dream is entirely about its surface.',
    imageFragment: 'a single object isolated against a plain ground',
    beats: [
      { id: 'the_object', directive: 'One object, close, described the way a hand would learn it — weight, edge, temperature, wear. Nothing else exists in this dream.', replayDirective: 'An object from the real event, isolated, given more attention than it deserves. Describe it the way a hand would learn it — weight, edge, temperature, wear — exactly as it was.', phrase: 'a lone object, centred and lit',
        fallback: "{motif}, and nothing else in the world. Close enough to learn by hand: the weight of it, the temperature it has taken from the room, the wear on the edge where it has been held before. You do not pick it up. There is nothing here to pick it up with.",
      },
    ],
  },
  fragment_threshold: {
    id: 'fragment_threshold', label: 'Fragment: A Threshold', weight: 2, napOnly: true, abstraction: 'tilted',
    directive: 'A doorway, a stair head, a lift with its doors open. The dream is the moment before crossing, and it never crosses.',
    imageFragment: 'a threshold framed head-on, the far side underlit',
    beats: [
      { id: 'the_threshold', directive: 'A place that exists to be passed through, and the dreamer stopped in it. Describe both sides. Do not go through.', replayDirective: 'The threshold of the real event: the doorway, the stair head, the lift, with the event on the other side. Describe both sides. Do not go through — the dream is the moment before crossing, and it never crosses.', phrase: 'an open threshold, the space beyond unresolved',
        fallback: "A doorway, and you have stopped in it. Behind you is {where}, lit and ordinary and finished with you. In front of you the light does not reach the floor. {motif} waits on the near side to be carried through. You do not go through.",
      },
    ],
  },
  fragment_sound: {
    id: 'fragment_sound', label: 'Fragment: A Sound', weight: 2, napOnly: true, abstraction: 'unreal',
    directive: 'A sound with no source, in a space that is otherwise still. The dream is the listening, not the finding.',
    imageFragment: 'an empty interior, nothing in frame that could be making a noise',
    beats: [
      { id: 'the_sound', directive: 'A sound the dreamer can locate exactly and cannot account for. Describe the room it is arriving in. Never reveal what is making it.', replayDirective: 'A sound from the real event with a source the dreamer never saw — the voice, the door, the movement in another room. Describe the room it arrived in. Never reveal what was making it; the dreamer does not know.', phrase: 'a still empty room, sourceless',
        fallback: "The room is empty and still. The sound is coming from a point you could put a finger on, about head height, near the window, and there is nothing there and nothing near it that could be making it. It does not stop. You go on listening: {residue}.",
      },
    ],
  },
};

// --- DREAM_PERSPECTIVES: grammatical stance -----------------------------
// Locked per dream, not per panel: a dream that changes person halfway reads
// as a writing error rather than as a dream.
const DREAM_PERSPECTIVES = {
  embodied_first: {
    id: 'embodied_first', label: 'Embodied first person', weight: 4, dreamerInFrame: false,
    directive: 'Write in first person, present tense, fully inside the body. Report sensation directly and never step outside to comment on it.',
    imageFragment: 'first-person point of view, hands or feet at the frame edge',
  },
  second_person: {
    id: 'second_person', label: 'Second person', weight: 3, dreamerInFrame: true,
    directive: 'Write in second person, present tense — "you". Never let the narration know more than the dreamer does.',
    imageFragment: 'over-the-shoulder framing, subject seen from just behind',
  },
  disembodied: {
    id: 'disembodied', label: 'Disembodied', weight: 3, dreamerInFrame: false,
    directive: 'The dreamer is present but has no body in the scene. Nobody addresses them and nothing occludes their view. Do not explain how they are seeing this.',
    imageFragment: 'a floating vantage, no visible observer',
  },
  body_swapped: {
    id: 'body_swapped', label: 'Wrong body', weight: 2, dreamerInFrame: false,
    directive: "First person, but the body is not the dreamer's — the hands, the height, the reach all belong to somebody else. Never name whose. Show the mismatch through actions that misfire, never through a moment of realisation.",
    imageFragment: 'a low or unfamiliar eye line, proportions slightly off',
  },
  retrospective: {
    id: 'retrospective', label: 'Retrospective', weight: 2, dreamerInFrame: false,
    directive: 'Present tense, but the dreamer is watching something that has already finished and cannot intervene. They may not touch anything in the scene.',
    imageFragment: 'a scene observed through glass or from a doorway',
  },
};

// --- DREAM_TEMPO: pace of the prose -------------------------------------
const DREAM_TEMPO = {
  languid: {
    id: 'languid', label: 'Languid', weight: 3,
    directive: 'Long, unhurried sentences. Time is generous here. Let one gesture take as many clauses as it needs.',
    imageFragment: 'long exposure, soft motion blur',
  },
  stuttering: {
    id: 'stuttering', label: 'Stuttering', weight: 3,
    directive: 'Short sentences and hard cuts. Skip the connective moments entirely — the dreamer is in the doorway, then across the room, with nothing in between.',
    imageFragment: 'a hard, abrupt crop, motion frozen mid-gesture',
  },
  accelerating: {
    id: 'accelerating', label: 'Accelerating', weight: 2,
    directive: 'Begin with room to breathe and shed words as you go. The last two sentences should be the shortest in the panel.',
    imageFragment: 'converging lines, movement toward the frame edge',
  },
  frozen: {
    id: 'frozen', label: 'Frozen', weight: 2,
    directive: 'Nothing moves. Write only what is already the case. No verbs of motion for the dreamer — they may look and they may notice, and that is all.',
    imageFragment: 'perfectly still, no motion anywhere in frame',
  },
};

// --- DREAM_REGISTERS: tone, and the wake tint (D12) ---------------------
// Each register owns its morning. `moodDelta` / `energyDelta` are what Phase 7
// hands to applyEffects so the tint produces honest `applied` rows, and `band`
// is which of DREAM_WAKE_BANDS the wake narration reads.
//
// MAGNITUDES ARE DELIBERATELY SMALL. Mood is a 0..1 need; MOOD_PAYOUTS.goodSleep
// (config.js) is 0.05 for a full night on schedule and ACTION_TUNING.napMoodGain
// is 0.03. Every number below sits at or under the nap. Energy is a 0..100 need
// restored at SLEEP.restorePerHour = 12.5/hour, so a night returns something
// like 85; a dream moves it by single digits. A dream colours a morning, it
// does not decide one — the moment dreaming becomes a way to farm mood, D2's
// "a dream is deniable" is gone and the player is optimising their sleep
// schedule against this table.
//
// `sfwGated` is a HARD, INDEPENDENT filter, not a weight (D17): when
// isSfwMode() is true the entry is dropped from the pool outright, whatever
// dreamRegister says. A filter and not `weight: 0` because of the weightedPick
// trap at the top of this file; a filter and not a prompt softener because a
// softened erotic dream is still an erotic dream.
const DREAM_REGISTERS = {
  tender: {
    id: 'tender', label: 'Tender', weight: 3,
    directive: 'Warm without being sentimental. Nothing here threatens the dreamer. Earn the warmth with a specific physical kindness rather than by naming a feeling.',
    imageFragment: 'soft warm light, close and unguarded',
    moodDelta: 0.03, energyDelta: 0, band: 'warm',
  },
  absurd: {
    id: 'absurd', label: 'Absurd', weight: 2,
    directive: 'Something is ridiculous and the dream treats it as routine. Play it completely straight — the humour is in the flatness of the reporting, never in a joke.',
    imageFragment: 'a deadpan composition, the impossible element centred and unremarked',
    moodDelta: 0.02, energyDelta: 0, band: 'wry',
  },
  uncanny: {
    id: 'uncanny', label: 'Uncanny', weight: 4,
    directive: 'Everything is nearly right. The wrongness is small, specific and physical, and nobody in the dream acknowledges it. Do not build toward a scare; there is no scare.',
    imageFragment: 'even sourceless light, everything a little too clean',
    moodDelta: -0.01, energyDelta: -1, band: 'unsettled',
  },
  anxious: {
    id: 'anxious', label: 'Anxious', weight: 3,
    directive: 'Something is owed, late, or about to be found out. Keep it in the body and in the logistics — never write the word for the feeling, and never let the dreamer resolve it.',
    imageFragment: 'tight framing, cluttered foreground, no clear exit',
    moodDelta: -0.03, energyDelta: -3, band: 'unsettled',
  },
  melancholy: {
    id: 'melancholy', label: 'Melancholy', weight: 3,
    directive: 'Something is over and the dream is standing in the space it left. Quiet, unhurried, no self-pity. Describe the absence through what is still physically there.',
    imageFragment: 'cool desaturated light, wide empty space around the subject',
    moodDelta: -0.02, energyDelta: 0, band: 'heavy',
  },
  sublime: {
    id: 'sublime', label: 'Sublime', weight: 2,
    directive: 'Scale far beyond the dreamer, and no threat in it. Awe reported plainly, from a body that is small and knows it. No grandeur in the sentences themselves.',
    imageFragment: 'vast scale, the subject tiny against it, high dynamic range',
    moodDelta: 0.03, energyDelta: 2, band: 'warm',
  },
  erotic: {
    id: 'erotic', label: 'Erotic', weight: 2, sfwGated: true,
    directive: 'Charged and unhurried. Stay with heat, proximity and attention rather than anatomy, and keep the dream logic intact — this is a dream that happens to be erotic, not a sex scene with dream trimmings.',
    imageFragment: 'warm low light, skin and fabric, intimate proximity',
    moodDelta: 0.03, energyDelta: -1, band: 'charged',
  },
};

// --- DREAM_WAKE_LINES: the morning the register left behind (D12, Phase 7) --
// The tint made legible. Every register names one of DREAM_WAKE_BANDS and
// every band names its lines here, so a new register is still a data edit
// (D6): declare a band that already has lines, or add the band and its lines
// together. Phase 7's dreamWakeLine() indexes this by the DREAM's OWN frozen
// seed rather than by any RNG, which is D34(c) applied to the wake narration —
// the same record must produce the same morning line forever, because the
// Dream Diary (Phase 8) reprints it beside a dream the player read months ago.
//
// Second person and deliberately vague about CONTENT. The dream itself has
// already been shown panel by panel; this line reports only what the dreamer
// carries out of it, and it has to read acceptably after a nap as well as
// after a full night — 'wake' rather than 'wake up in the morning' — because
// D16 sends nap dreams through exactly this function.
//
// None of them names the dream's cast, its setting or its motif. A wake line
// that summarised the dream would be the engine telling the player what they
// just saw, and worse, it would be the one line in the system that could
// contradict the panels (D2: a dream is deniable, and a summary is not).
const DREAM_WAKE_LINES = {
  warm: [
    'You wake carrying something warm you cannot name, and it stays with you through the first few minutes of the room.',
    'Whatever that was, you surface out of it easier than you went in.',
    'You wake up already halfway to a good mood, for no reason you could defend.',
  ],
  wry: [
    'You wake up almost laughing at something that made no sense at all, and makes even less now.',
    'You surface with the distinct feeling of having been told a joke you cannot repeat.',
    'It follows you out for a second — something ridiculous, reported completely straight — and then it goes.',
  ],
  unsettled: [
    'You wake up and the dream stays standing in the corner of the room for a moment before it goes.',
    'You surface a little wrong. Nothing in the room has moved; it takes you a second to be sure of that.',
    'You wake with the sense of having left something running somewhere, and no idea what.',
  ],
  heavy: [
    'You wake slowly. Whatever that was, it left the weight of something already over.',
    'You surface with an ache that has no event attached to it, which somehow makes it worse.',
    'It takes you a while to get up. Nothing happened; you feel like something did.',
  ],
  charged: [
    'You wake up warm and unsettled in a way that has nothing to do with the room.',
    'You surface out of it slowly, and take rather longer than you needed to get up.',
    'It stays on your skin for a minute after you open your eyes.',
  ],
};

// --- DREAM_LENSES: the visual filter, one per dream ----------------------
// The lens is the strongest single lever on what a dream LOOKS like, which is
// why it is per-dream and not per-panel: three panels under three lenses read
// as three unrelated pictures. The `imageFragment` here does most of the work
// in composeDreamPanelPrompt (Phase 4), so these are written as complete
// photographic descriptions rather than as adjectives.
const DREAM_LENSES = {
  sodium_vapor: {
    id: 'sodium_vapor', label: 'Sodium vapour', weight: 3, abstraction: 'literal',
    directive: 'Everything is lit the colour of a streetlight at 3am. Colours other than orange barely survive.',
    imageFragment: 'lit entirely by orange sodium-vapour streetlight, deep amber cast, colour crushed toward monochrome',
  },
  overexposed_35mm: {
    id: 'overexposed_35mm', label: 'Overexposed 35mm', weight: 3, abstraction: 'literal',
    directive: 'Too much light. Detail is burning out of the bright side of everything.',
    imageFragment: 'overexposed 35mm film, blown highlights, heavy grain, washed-out whites',
  },
  underwater_caustics: {
    id: 'underwater_caustics', label: 'Underwater caustics', weight: 2, abstraction: 'unreal',
    directive: 'Light arrives the way it does through moving water, whether or not there is any water.',
    imageFragment: 'rippling underwater caustic light across every surface, blue-green cast, light moving on the walls',
  },
  chalk_on_black: {
    id: 'chalk_on_black', label: 'Chalk on black', weight: 2, abstraction: 'unreal',
    directive: 'The world is drawn rather than lit — outlines on darkness, with nothing behind them.',
    imageFragment: 'white chalk lines on a black ground, no fill, no background, drawn rather than photographed',
  },
  polaroid_bleed: {
    id: 'polaroid_bleed', label: 'Polaroid bleed', weight: 3, abstraction: 'tilted',
    directive: 'A picture that developed badly. The colours have run into each other and the edges have given up.',
    imageFragment: 'instant-film look, colours bleeding into each other, soft chemical edges, faded cyan shift',
  },
  empty_stage_light: {
    id: 'empty_stage_light', label: 'Empty stage light', weight: 2, abstraction: 'tilted',
    directive: 'One hard light from one direction, and unlit darkness everywhere it does not reach.',
    imageFragment: 'a single hard theatrical spotlight, everything outside it in flat black, hard-edged shadow',
  },
  security_grain: {
    id: 'security_grain', label: 'Security grain', weight: 2, abstraction: 'tilted',
    directive: 'Seen from a fixed camera that was never meant to make anything look good.',
    imageFragment: 'low-resolution security-camera footage, high fixed wide angle, monochrome grain, slight fisheye',
  },
};

// --- DREAM_DISTORTIONS: how the setting is wrong ------------------------
// The distortion applies to the PLACE, never to the people — cast wrongness is
// the reunion form's job. Keeping the two separate is what stops a dream from
// being wrong in five ways at once, which reads as noise rather than as a
// dream. `none` is a real entry for the same reason: a dream whose people are
// wrong is often strongest in a room that is exactly right, and an engine that
// cannot produce that has one gear.
const DREAM_DISTORTIONS = {
  endless: {
    id: 'endless', label: 'Endless', weight: 3, abstraction: 'tilted',
    directive: 'The space does not end where it should. A corridor, a room or a stair keeps going past the point where the building would have to stop.',
    imageFragment: 'the space extending impossibly far into the distance, no far wall',
  },
  flooded: {
    id: 'flooded', label: 'Flooded', weight: 3, abstraction: 'tilted',
    directive: 'There is standing water where there should not be, at a depth nobody is treating as an emergency.',
    imageFragment: 'still shallow water covering the floor, reflections doubling everything above it',
  },
  doubled: {
    id: 'doubled', label: 'Doubled', weight: 2, abstraction: 'unreal',
    directive: 'The place occurs twice — the same room adjacent to itself, or repeating past a doorway. Do not explain which one is real.',
    imageFragment: 'the same room repeating through a doorway, identical twice over',
  },
  outdoors_indoors: {
    id: 'outdoors_indoors', label: 'Outdoors indoors', weight: 2, abstraction: 'unreal',
    directive: 'Weather, sky or ground that belongs outside is inside instead, and the room is otherwise unchanged.',
    imageFragment: 'open sky and weather inside an ordinary interior, the furniture untouched by it',
  },
  scale_wrong: {
    id: 'scale_wrong', label: 'Scale wrong', weight: 2, abstraction: 'unreal',
    directive: "The room is a size the dreamer's body does not agree with. Do not say they have shrunk or grown — describe the furniture and let the reader work it out.",
    imageFragment: 'furniture and doorways at the wrong scale relative to the figure',
  },
  time_wrong: {
    id: 'time_wrong', label: 'Time wrong', weight: 3, abstraction: 'tilted',
    directive: 'The light says one hour and everything else says another. Clocks disagree with windows and neither yields.',
    imageFragment: 'daylight and night light in the same frame, clocks disagreeing with the windows',
  },
  none: {
    id: 'none', label: 'Undistorted', weight: 2, abstraction: 'literal',
    directive: 'The place itself is exactly right, in every particular. Whatever is wrong with this dream, it is not the room.',
    imageFragment: 'an ordinary space, accurately and unremarkably rendered',
  },
};

// --- DREAM_SETTINGS: where the dream is (Phase 4) -----------------------
// The data model's `slots.setting` is { roomId, sourceKind }, where sourceKind
// is 'apartment' | 'external' | 'nowhere'. The apartment half is already data
// — ROOMS (config.js) — but the other two had no source anywhere in the game,
// because the sim has no locations outside the flat at all. This table is that
// source, and it is here rather than in dreams.js for the reason D6 gives:
// a new dream place must be a data edit and nothing else.
//
// HOW THE APARTMENT ENTRY RESOLVES. `home` deliberately carries no roomId. The
// compiler picks the actual room from the dream's own residue — the room the
// grievance happened in, the room the player was watched in — and falls back to
// where the player physically is. Enumerating the seventeen rooms here would be
// ROOMS restated in a second file, which is the one thing this plan's design
// invariant 7 is about; the compiler reads the real table instead.
//
// WHY THE EXTERNALS ARE GENERIC. Not one of them names a real venue, employer
// or street, because the save has no such nouns to be consistent with. A dream
// that invented "the Blue Room on Foster Street" would be asserting a place
// into a world that has never heard of it, and the next dream would contradict
// it. What they name instead is a KIND of place every dreamer already has —
// a night bus, a corridor of an institution, a shop after closing — which the
// writer can furnish freely because nothing in the save can disagree.
//
// The `abstraction` tag works exactly as it does on forms, lenses and
// distortions: it is what makes the player's dreamAbstraction dial reach the
// setting too, so a grounded dreamer stays home and a surreal one drifts.
//
// `fallbackPlace` (Phase 5) is this setting as a PROSE noun phrase, which is a
// different job from `imageFragment` and cannot be done by it: a diffusion
// fragment ("a long institutional corridor, linoleum floor, doors along one
// wall") is a shopping list, and a beat template needs something that can
// follow the word "in". The `home` entry's is only ever reached when the
// compiler produced no roomId — normally dreamSettingProsePlace resolves the
// real room through roomPhrase (config.js) rather than restating the
// seventeen rooms here, which is design invariant 7.
const DREAM_SETTINGS = {
  home: {
    id: 'home', label: 'The apartment', weight: 18, abstraction: 'literal', sourceKind: 'apartment',
    directive: "The dreamer's own building, and the compiler has named the room. Furnish it from what the dream already knows about that room; do not add a floor, a wing or a neighbour the apartment does not have.",
    imageFragment: 'domestic and lived-in, ordinary furniture',
    fallbackPlace: 'the flat',
  },

  // --- external: real-feeling places the apartment does not contain -------
  transit: {
    id: 'transit', label: 'In transit', weight: 3, abstraction: 'tilted', sourceKind: 'external',
    directive: 'A night bus, a late train carriage, a lift that has been moving too long. The dreamer is travelling and the journey has no stated destination.',
    imageFragment: 'the inside of a night bus or late train carriage, dark windows, empty seats',
    fallbackPlace: 'a night bus',
  },
  institution: {
    id: 'institution', label: 'An institution', weight: 3, abstraction: 'literal',  sourceKind: 'external',
    directive: 'A corridor belonging to a school, a clinic or an office nobody works in any more. Signage, chairs against a wall, a door at the far end. Never name the institution.',
    imageFragment: 'a long institutional corridor, linoleum floor, doors along one wall, chairs against the other',
    fallbackPlace: 'a corridor of an institution',
  },
  shop_after_hours: {
    id: 'shop_after_hours', label: 'A shop after hours', weight: 2, abstraction: 'tilted', sourceKind: 'external',
    directive: 'A supermarket or shop with half the lights off and the doors unlocked. Fully stocked, entirely staffless. The dreamer is not stealing and does not think about paying.',
    imageFragment: 'a supermarket aisle with half the overhead lights off, shelves full, nobody at the tills',
    fallbackPlace: 'a shop after closing',
  },
  half_remembered_house: {
    id: 'half_remembered_house', label: 'A half-remembered house', weight: 3, abstraction: 'literal', sourceKind: 'external',
    directive: "A house the dreamer knows they have lived in and cannot place. The layout is confident and unverifiable. Do not say whose house it is and do not let the dreamer wonder.",
    imageFragment: 'an older domestic interior from another decade, patterned wallpaper, low warm lamps',
    fallbackPlace: 'a house you cannot place',
  },
  a_place_of_work: {
    id: 'a_place_of_work', label: 'A place of work', weight: 2, abstraction: 'literal', sourceKind: 'external',
    directive: 'A back-of-house that belongs to no job the dreamer has ever held — a stockroom, a kitchen pass, a desk in a row of desks. They are expected to know what they are doing here.',
    imageFragment: 'a back-of-house work space, strip lighting, stacked crates and worn surfaces',
    fallbackPlace: 'the back room of a job you have never held',
  },

  // --- nowhere: the dream has stopped pretending there is a place --------
  the_void: {
    id: 'the_void', label: 'Nowhere at all', weight: 2, abstraction: 'unreal', sourceKind: 'nowhere',
    directive: 'There is no place. Things exist at the distances the dream needs them at and nothing connects them. Do not describe a floor, walls or a sky, and do not have the dreamer notice their absence.',
    imageFragment: 'no environment at all, objects floating in undifferentiated dark space, no floor and no horizon',
    fallbackPlace: 'a place with no floor',
  },
  the_between: {
    id: 'the_between', label: 'Between two places', weight: 2, abstraction: 'unreal', sourceKind: 'nowhere',
    directive: 'A passage joining two places that do not exist. It has a length and a direction and neither end. Whatever is at the far end stays at the far end.',
    imageFragment: 'an unplaceable passage receding in both directions, no visible ends, featureless walls',
    fallbackPlace: 'a passage between two places',
  },
};

// --- DREAM_MOTIFS: the concrete anchor (D10) ----------------------------
// One authored object or image per dream, recorded into world.dreams.motifHistory
// and re-usable by later dreams at DREAM_TUNING.motifCarryChance. This is the
// cheapest table in the whole engine and it does the most work: without it a
// player gets a series of unrelated one-offs, and with it they get a recurring
// payphone and the sense of one dreamer behind all of them.
//
// `text` is the clause that persists on the record and rides into both the
// diary and the prompt; `imageFragment` is its visual; `directive` is the one
// instruction about HOW to place it, which is what stops every motif from being
// introduced the same way. Phase 3 also harvests motifs from real owned items —
// those are built at harvest time in this same shape and are never written
// back here, because this file is authored data and nothing else writes to it.
const DREAM_MOTIFS = {
  payphone: {
    id: 'payphone', label: 'The payphone', weight: 3,
    text: 'a payphone ringing in a corridor with nobody near it',
    directive: 'It should be audible before it is visible, and it must still be ringing when the panel ends.',
    imageFragment: 'a wall-mounted payphone in an empty corridor',
  },
  flooded_stair: {
    id: 'flooded_stair', label: 'The flooded stair', weight: 3,
    text: 'a stairwell with two inches of still water on every step',
    directive: 'The dreamer walks in it rather than around it. Give it a sound.',
    imageFragment: 'a concrete stairwell, each step holding still water',
  },
  wrong_door: {
    id: 'wrong_door', label: 'The wrong door', weight: 3,
    text: 'a door set into a wall that never had one',
    directive: 'Introduce it as though it had always been there. The dreamer may notice it is new; nothing else in the dream does.',
    imageFragment: 'a plain interior door in a blank wall, slightly ajar',
  },
  unread_letter: {
    id: 'unread_letter', label: 'The unread letter', weight: 2,
    text: "an envelope with the dreamer's name on it, still sealed",
    directive: 'It stays sealed. The dreamer may pick it up, turn it over, and put it down again.',
    imageFragment: 'a sealed handwritten envelope on a flat surface',
  },
  running_tap: {
    id: 'running_tap', label: 'The running tap', weight: 2,
    text: 'a tap left running in a room with nobody in it',
    directive: 'Nobody turns it off, the dreamer included, and nobody remarks on that.',
    imageFragment: 'a tap running into a full basin, water going over the edge',
  },
  borrowed_coat: {
    id: 'borrowed_coat', label: 'The borrowed coat', weight: 2,
    text: "a coat on a hook that is not the dreamer's and fits perfectly",
    directive: 'The fit is the detail that matters. Report it without curiosity.',
    imageFragment: 'a heavy coat hanging on a single wall hook',
  },
  stopped_clock: {
    id: 'stopped_clock', label: 'The stopped clock', weight: 3,
    text: 'a clock with both hands resting on the same number',
    directive: 'Have the dreamer read it correctly and take the reading seriously.',
    imageFragment: 'a plain wall clock, both hands overlapping',
  },
  packed_boxes: {
    id: 'packed_boxes', label: 'The packed boxes', weight: 2,
    text: "boxes taped shut and labelled in somebody else's handwriting",
    directive: 'The dreamer can read the labels. Give one of them, and do not explain it.',
    imageFragment: 'stacked sealed cardboard boxes with marker labels',
  },
  bare_bulb: {
    id: 'bare_bulb', label: 'The bare bulb', weight: 2,
    text: 'a bare bulb swinging with nothing there to have moved it',
    directive: 'The swing is steady rather than dying away. Let the shadows do the describing.',
    imageFragment: 'a single bare filament bulb on a flex, shadows swinging',
  },
  single_shoe: {
    id: 'single_shoe', label: 'The single shoe', weight: 2,
    text: 'one shoe standing upright in the middle of the floor',
    directive: 'Place it where it has to be stepped around. Nobody moves it.',
    imageFragment: 'a single shoe upright in an empty floor space',
  },
  open_window: {
    id: 'open_window', label: 'The open window', weight: 2,
    text: 'a window open onto a night that is the wrong season',
    directive: 'The temperature of the air is the tell. Name the season it is coming from, not the one it should be.',
    imageFragment: 'an open window, the air outside visibly the wrong weather',
  },
  spare_key: {
    id: 'spare_key', label: 'The spare key', weight: 2,
    text: 'a spare key that fits every lock in the building',
    directive: 'It should be used at least once, casually, on something the dreamer has no business opening.',
    imageFragment: 'a small brass key held between two fingers',
  },
  wet_footprints: {
    id: 'wet_footprints', label: 'The wet footprints', weight: 3,
    text: 'wet footprints crossing a dry floor and stopping halfway',
    directive: 'The dreamer follows them to where they stop. There is nothing at the end, and the dream does not treat that as a twist.',
    imageFragment: 'wet bare footprints across a dry floor, ending mid-room',
  },
  neighbours_music: {
    id: 'neighbours_music', label: "The neighbour's music", weight: 2,
    text: 'music through a wall, too quiet to name the song',
    directive: 'The dreamer nearly recognises it throughout and never does. Do not name it at the end either.',
    imageFragment: 'a blank interior wall, the room otherwise empty',
  },
};

// --- DREAM_TUNING: every number ----------------------------------------
// The engine's whole numeric surface, in one place, so tuning a dream is never
// a code change.
//
// **The per-sleep probability is NOT here, on purpose (D24).** It lives as
// `chance` on each DREAM_FREQUENCIES entry in defs.settings.js, because that is
// the table the settings row already renders: a list of option ids there plus a
// parallel map of numbers here is two things that have to agree, and they would
// stop agreeing the first time somebody added a frequency option. The rule is
// the same one the rest of this plan runs on — one home per number, never two.
// What DOES live here is `napChanceMult`, which is a property of naps rather
// than of any settings row.
const DREAM_TUNING = {
  // --- Frequency (D16, D19) ---
  // Naps dream at a fraction of the night rate: multiplied onto whichever
  // DREAM_FREQUENCIES.chance is in force, so turning frequency down turns naps
  // down with it and 'off' stays a hard zero without a second check.
  napChanceMult: 0.35,

  // --- Caps. Every one of these is enforced in dreams.js, not here. ---
  queueCap: 2,             // D19: compiled + rendered and waiting. Never more.
  diaryCap: 40,            // shown dreams kept for the Dream Diary (Phase 8)
  motifHistoryCap: 12,     // D10 carryover pool
  consumedEventCap: 100,   // D9 true-dream source dedupe ring

  // --- Compiler selection (Phase 4) ---
  residueDays: 3,          // how far back harvestResidue looks (Phase 3)
  residuePickMin: 2,       // fragments handed to the writer as raw material
  residuePickMax: 4,       // more than this and the panel becomes a summary
  castMax: 2,              // 0-2 named NPCs; a third is a crowd, not a dream
  // Given that two or more people are available in the residue, how often the
  // dream casts both rather than one. Under half, deliberately: most dreams
  // are about one person, and a two-hander every other night makes the cast
  // feel like a roster being worked through rather than a preoccupation.
  castTwoChance: 0.45,
  // Once the cast is chosen, the residue pick is re-weighted so the material
  // handed to the writer is ABOUT the people in the dream. Without these two
  // the compiler routinely produced a dream cast with one roommate and three
  // fragments naming a different one, which reads as a writing error rather
  // than as dream logic. A boost for a fragment that names a cast member, and
  // a damp — never a zero, see the weightedPick trap at the top of this file —
  // for one that names somebody who is not in this dream at all. Fragments
  // that name nobody (a bill, an object, a search) are untouched by both.
  castAffinityBoost: 2.5,
  castStrangerDamp: 0.2,
  // The weight the compiler folds in for the room it falls back to when the
  // residue names none - where the player physically is, else their own
  // bedroom. Folded in ALWAYS rather than only when the residue is silent,
  // so the number of RNG draws does not depend on whether a given save
  // happened to produce a room (see the draw-count note in dreams.js). Low,
  // because a room the material actually points at should win.
  roomFallbackWeight: 0.5,
  motifCarryChance: 0.35,  // D10: reuse a motif from motifHistory rather than roll fresh
  trueDreamChance: 0.12,   // D8: an illustrated replay of something real and unseen
  recurrenceChance: 0.06,  // D11: re-run a diary dream with its lens and tempo shifted

  // --- Prose bounds (Phase 5). Enforced in the prompt's rules block AND read
  // by buildDreamFallback's templates, so a fallback panel is the same size as
  // a written one and a total model failure is not visible as a shape change.
  panelWordMin: 45,
  panelWordMax: 70,
  // ...and the bounds parseDreamweaverReply ENFORCES, which are deliberately
  // much wider than the ones the prompt asks for. The prompt's job is to get
  // 45-70; the parser's job is to decide what is not a panel at all. A model
  // that lands on 38 words has written a slightly short dream and the player
  // should get it; one that returns four words has failed, and one that
  // returns a nine-paragraph essay has ignored the brief and is trimmed back
  // to the last sentence boundary inside the ceiling rather than cut
  // mid-clause. Rejecting everything outside 45-70 would throw away most
  // usable replies for a shape nobody would notice.
  panelWordHardMin: 15,
  panelWordHardMax: 140,

  // --- dreamRegister -> per-register MULTIPLIER over DREAM_REGISTERS' own
  // `weight` (D17). Not a replacement: the base weights say which registers
  // this engine reaches for, and these say how far the player's dial bends
  // that. Every register id must appear in every mode — the Phase 2 harness
  // asserts both directions, so adding a register without tuning it is caught
  // rather than silently defaulting to 1.
  //
  // `gentle` does not remove the dark registers, it thins them: a gentle
  // setting that could never produce a melancholy dream would be a different
  // game mode, not a tone dial. `erotic` is additionally and independently
  // gated by isSfwMode() — these numbers never override that.
  registerWeights: {
    gentle:   { tender: 2.5, absurd: 1.5, uncanny: 0.5, anxious: 0.2, melancholy: 1.0, sublime: 2.0, erotic: 0.4 },
    balanced: { tender: 1.0, absurd: 1.0, uncanny: 1.0, anxious: 1.0, melancholy: 1.0, sublime: 1.0, erotic: 1.0 },
    charged:  { tender: 0.7, absurd: 0.8, uncanny: 1.6, anxious: 2.0, melancholy: 1.2, sublime: 1.0, erotic: 2.2 },
  },

  // --- dreamAbstraction -> per-BAND multiplier, applied to the `abstraction`
  // tag on DREAM_FORMS, DREAM_LENSES and DREAM_DISTORTIONS alike (D17).
  //
  // Bands rather than per-id maps because per-id maps are the version of this
  // that rots: a new lens would need three more numbers in three more objects
  // and would silently weight as 1 until somebody noticed. A band tag on the
  // entry is one edit, in the same object, and cannot be forgotten without the
  // harness saying so.
  //
  // Reweighting only, never gating — a grounded dream can still land on an
  // unreal form, just rarely (whether that is enough separation is a live open
  // question in the plan). The floor is 0.15 and not 0 both so that no pool can
  // collapse to nothing and because of the weightedPick trap documented at the
  // top of this file.
  abstractionWeights: {
    grounded: { literal: 3.0, tilted: 1.0, unreal: 0.15 },
    balanced: { literal: 1.0, tilted: 1.0, unreal: 1.0 },
    surreal:  { literal: 0.4, tilted: 1.0, unreal: 2.5 },
  },

  // --- The residue harvest (Phase 3, dreams.js) ---------------------------
  // Every number harvestResidue reads. The CLAUSE TEMPLATES are deliberately
  // NOT here: the plan puts redaction inside the scorers ("each scorer emits
  // an already dreamable clause"), so the phrasing lives beside the state it
  // is phrasing, and only the numbers come back to this file. That split is
  // the one place this engine has two homes for related things, and it is the
  // split the plan asked for — numbers tune, phrasing does not.
  residue: {
    // Base salience per provenance kind, before recency and per-source
    // strength are multiplied in. The ordering IS the plan's "sources, in
    // descending weight": what the player did outranks what they saw, which
    // outranks what the world did behind their back, which outranks the
    // furniture. Every DREAM_RESIDUE_KINDS id must appear here and nothing
    // else may — verify-dreams-residue.js asserts both directions.
    kindWeights: {
      participated: 0.95,
      witnessed:    0.85,
      unseen_event: 0.80,
      grievance:    0.75,
      overheard:    0.65,
      appetite:     0.60,
      absence:      0.50,
      obligation:   0.45,
      possession:   0.30,
    },

    // A fragment's weight halves every this-many days of age. Two days, so
    // yesterday still shouts and the far edge of the residueDays window is a
    // murmur rather than an equal. Sources with no date (possessions, an
    // absence, a standing grievance with no day) skip the term entirely
    // rather than being treated as infinitely old.
    recencyHalfLifeDays: 2,

    // How many fragments any ONE source may contribute. Without this the
    // debug log — 4000 entries, three days of which is still hundreds —
    // would be the entire pool and every dream would be about NPC chatter.
    perSourceCap: 6,
    // ...and the size of the pool handed back. Phase 4 picks residuePickMin
    // to residuePickMax out of it, so this only has to be comfortably wider
    // than the pick, not exhaustive.
    poolCap: 24,

    // --- Thresholds. Each one answers "is this loud enough to dream about". ---
    desireThreshold:  0.45,  // |relPlayer.desire| — the axis, -1..1
    tensionThreshold: 0.40,  // relPlayer.tension, 0..1 in practice
    absenceDays:      4,     // day - relPlayer.lastInteractionDay before it registers
    absenceDaysFull:  14,    // ...and where the absence term stops growing
    questExpiryDays:  2,     // an active quest this close to expiresDay is an obligation
    billDueDays:      3,     // an unpaid bill this close to dueDay is one too
    // An overdue bill's weight rises with overdueDays and tops out here, so
    // a rent bill three weeks gone does not drown out the entire pool.
    billOverdueFull:  10,
    // Episodes below this decay are already being forgotten by their owner
    // and should not resurface in someone else's dream. Matches the 0.2 floor
    // retrieveRelevantMemories (npc.js) uses for the same judgement.
    episodeDecayFloor: 0.2,
    // Clause length. Long enough for a real sentence out of the debug log,
    // short enough that a fragment stays a fragment.
    clauseMaxChars:   140,

    // --- Item motifs (harvestItemMotifs) ---
    // Owned items enter the motif pool alongside the authored DREAM_MOTIFS
    // (see that table's comment). One weight for all of them: an authored
    // motif was written to carry a dream and a coffee mug was not, so the mug
    // sits below the weakest authored entry and gets in on variety, not force.
    itemMotifWeight: 1,
    itemMotifCap:    8,
  },
};
