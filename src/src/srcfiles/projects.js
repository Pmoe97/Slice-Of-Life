// ===== SECTION: PROJECTS =====
// Side Projects (0.14.2): the roommates finally have something of their own.
//
// Every resident has interests, and every interest carries a skill number —
// and nothing in anyone's day ever touched either. Measured before this file
// existed (four weeks, three houses, twelve residents, the real resolveBatch):
// 'playing guitar' filled 10 ticks in total, 'painting' 7, 'crafting' 13,
// 'journaling' 5 — about one half-hour per person per month — against 1,469
// ticks of reading, 1,314 of TV and 851 of scrolling. The schedule tables
// hand those hobby strings out at random and the idle pastimes win the time
// almost every time, so nobody was ever into anything, and interest skill was
// rolled once at generation (0..39) and never moved again.
//
// This module gives each roommate one project at a time, drawn from what
// they're actually into:
//
//   1. A PROJECT.   A kind (PROJECT_KINDS: a song on guitar, a painting, a
//                   novel, a scarf, a speedrun, a zine, a cold case, birth
//                   charts for the whole flat…) and a specific work ('Harbour
//                   Lights', a scarf, War and Peace). Four stages, each with
//                   its own lines, so what you overhear changes as they get
//                   better: the same three chords with a pause before each
//                   change, then the verse clean and the bridge falling apart,
//                   then the whole song with one wrong note.
//   2. TIME FOR IT. DRIVE_DEFS.work_on_project (config.js) — a real drive,
//                   candidate only while they're still into it
//                   (projectDriveCandidate). Its resolver (tryWorkOnProject,
//                   the isProjectDrive branch in evaluateDrives) picks the room
//                   and the activity from the kind and moves the project along.
//   3. HEART.       Engagement (0..1). Sessions and milestones feed it; idle
//                   days, bad sessions and a low mood drain it; the determined
//                   pick a stalled project back up. Below the threshold it
//                   gathers dust; long enough there and they give up. You can
//                   ask about it (the Encourage verb) and that genuinely helps.
//   4. PAYOFF.      Finishing raises their skill in that interest for real
//                   (which the shared-activity credit and the skilled-hobbyist
//                   notice already read), finished work goes up on the walls
//                   (Look Around), a roommate who likes you texts you about it
//                   — and one who REALLY likes you may have been making it for
//                   you all along, and won't say what it is until it's on
//                   your bed.
//   5. TALK.        [Project] in the NPC block: what, how far, how they feel
//                   about it, whether you asked, what they finished or quit.
//   6. THE FLAT.    (Round 3, the user's asks.) Presents are real items in
//                   your bag. Loud practice is a sound the flat hears — and
//                   complains about, or stops to listen to — and you can Bang
//                   on the Wall or Ask for Quiet. A Jam Session joins them at
//                   it. A show (open mic, screening, the good cause's day) is
//                   booked on a date that goes on your calendar.
//
// Everything this file rolls is its own seededRng stream or a pure hash —
// never the tick's shared rng. The drive itself is a real behavioural change
// (it takes time the idle pastimes used to fill); the resolver's room pick is
// the one place the tick rng is used, exactly as every other drive's moveToRoom
// does. Numbers live in config.js (PROJECT_TUNING); the kinds and every line
// live here with their reader.
//
// Line conventions: an event template names {name} exactly once (formatEventText
// replaces the first occurrence only) and never says "their" or "they", because
// Chatter turns {name} into "I" when a roommate posts about it. {work} is the
// work as it reads mid-sentence (‘Harbour Lights’, the scarf, cherry
// tomatoes), {a_work} its indefinite form, {noun} the bare noun.

// --- The kinds (content) ---------------------------------------------------------
//
// interests: INTEREST_POOL names that lead here. wording: 'title' (quoted), 'the'
// (definite noun) or 'bare'. stages: what it's like at each stage, for the
// prompt. session[stage]: ordinary session lines; bad: a session that went
// nowhere; milestone[i]: finishing stage i (0..2); finish/abandon/start: the
// big beats. show[stage]: what you see when you ask about it (Encourage).
// dusty: the room line while it gathers dust. display: where the finished
// work lives in the flat. gifts: what it can be when it was for you (item:
// the ITEM_DEFS id you get). event: a show with a date — booked on reaching
// the final stage, on the calendar as `label` ("{name}: open mic") `when`,
// and the finish happens that day at minute `at` (in `room`, if it's held
// at home), never sooner.
const PROJECT_KINDS = {
  guitar: {
    interests: ['music'], wording: 'title',
    works: ['Harbour Lights', 'Blackbird Hill', 'The Tuesday Waltz', 'Paper Moon Motel', 'Slow Train to Galway', 'Wildflower Road'],
    label: 'learning to play {work} on guitar', thing: '{work}',
    done: 'can play {work} all the way through now',
    activity: 'practising guitar', rooms: ['bedroom', 'living_room'],
    start: '{name} has decided to learn {work} on guitar, and has already bought a capo.',
    stages: [
      'still learning where the fingers go; every chord change takes a full second',
      'can play the verse, slowly; the bridge falls apart every time',
      'can get through the whole song, mostly — one change in the bridge still trips them up',
      'polishing it; it sounds like the actual song now',
    ],
    session: [
      ['{name} spent an hour on {work}: the same three chords, with a long pause before every change.',
       '{name} practised {work} — mostly tuning, then the first two bars, then more tuning.',
       '{name} spent the session on a single chord change in {work}, and got it about half the time.'],
      ['{name} ran the verse of {work} again and again, slowly, and stopped dead at the bridge every time.',
       '{name} played the verse of {work} through twice, clean, then fumbled the bridge and started over.',
       '{name} hummed along to the verse of {work} to keep time, and lost the thread at the bridge.'],
      ['{name} worked through {work} end to end, slowing to a crawl at the same change in the bridge.',
       '{name} looped the bridge of {work} for twenty minutes straight. It is getting there.',
       '{name} slowed {work} right down with a metronome and inched it back up, click by click.'],
      ['{name} played {work} through three times, a little faster each time.',
       '{name} played {work}, and for a whole minute it sounded exactly like the record.',
       '{name} played {work} with the door open, which is new.'],
    ],
    bad: ['{name} tried {work} for ten minutes, swore at the bridge, and put the guitar down hard.',
          '{name} got nowhere with {work} today — sore fingertips and a buzzing string.'],
    milestone: [
      '{name} got through the verse of {work} without stopping, and said "yes!" to the empty room.',
      '{name} made it through the bridge of {work} for the first time, then immediately fluffed the easy bit.',
      '{name} played {work} start to finish with one wrong note, then played it again to prove it was no fluke.',
    ],
    finish: '{name} played {work} all the way through, clean — then once more, for the joy of it.',
    abandon: '{name} put the guitar back in its case. {work} will have to wait, possibly forever.',
    dusty: "{name}'s guitar leans in the corner, gathering dust.",
    show: [
      "{name} plays you the first line of {work} — very slowly — and apologises for every chord change. You tell them it's recognisable. It almost is.",
      "{name} plays you the verse of {work}, then stops dead where the bridge should be. \"That's as far as it goes. For now.\" They look pleased you asked.",
      "{name} plays you most of {work}. The bridge wobbles and survives. They look up at you like they've just landed a plane.",
      "{name} plays you {work}, the whole thing, and it's actually good. They pretend not to care what you think, badly.",
    ],
    skillGain: 12,
  },

  dj: {
    interests: ['partying'], wording: 'bare',
    works: ['a disco-into-house set', 'a sunrise set', 'a Friday-night set for the flat', 'an all-vinyl set', 'a set with no skips'],
    label: 'learning to DJ, working up {work}', thing: 'the set',
    done: 'got through {work} without a single trainwreck',
    activity: 'practising on the decks', rooms: ['bedroom'],
    start: '{name} has bought a secondhand DJ controller and is working up {work}.',
    stages: [
      'still learning to beatmatch; most transitions sound like two songs arguing',
      'can beatmatch by ear now; the transitions are clunky but on time',
      'has the running order; working on the two mixes that keep going wrong',
      'the set holds together; now it is about making it sound effortless',
    ],
    session: [
      ['{name} spent an hour trying to beatmatch. Through the door it sounded like two songs arguing.',
       '{name} practised on the decks: the same eight bars of the same two tracks, over and over.',
       '{name} watched a beatmatching tutorial three times, then tried it and swore at the tempo slider.'],
      ['{name} worked on transitions — clunky, but landing on the beat now.',
       '{name} ran mixes with headphones half on, nodding at nothing.',
       '{name} spent an hour on one blend, back and forth, until the join got quieter.'],
      ['{name} went through the running order of {work}, stopping at the same two mixes to try them again.',
       '{name} spent the evening on one transition in {work}, which is now apparently "nearly there".',
       '{name} recorded a run of {work} and listened back with a face like a judge.'],
      ['{name} played {work} top to bottom with the door open. It sounded like a party nobody had arrived at yet.',
       '{name} ran {work} again, tweaking the order, looking very serious about a hi-hat.',
       '{name} played {work} to an empty bedroom, lights off, headphones round the neck.'],
    ],
    bad: ['{name} trainwrecked the same mix six times and unplugged the controller in disgust.',
          '{name} lost the beat in every transition and gave up to lie on the floor.'],
    milestone: [
      '{name} held a beatmatch for a full minute, by ear, and did a small victory dance.',
      '{name} nailed a blend so smooth you could not hear the join, and played it back twice to check.',
      '{name} got through the hardest mix in {work} three times running.',
    ],
    finish: '{name} ran {work} start to finish without a single trainwreck, and turned it up for the last track.',
    abandon: '{name} unplugged the DJ controller and slid it under the bed. The decks are resting.',
    dusty: "{name}'s DJ controller sits on the desk, unplugged, the cable coiled on top.",
    show: [
      "{name} hands you the spare headphones and plays you a transition. It sounds like two songs having a disagreement. \"It's a style,\" they say.",
      "{name} plays you a blend — clunky, but on the beat. They watch your face the whole way through.",
      "{name} plays you the middle of {work}, skipping the two mixes that \"aren't ready\". You're nodding along before you notice.",
      "{name} plays you the opening of {work} and it genuinely sounds like a night out. They pretend not to see you dancing.",
    ],
    skillGain: 10,
  },

  painting: {
    interests: ['art'], wording: 'title',
    works: ['The Harbour at Dusk', 'View from the Balcony', 'Lemons, Seriously', 'Grandmother, Remembered', 'City in the Rain', 'Fox in Snow'],
    label: 'painting {work}', thing: 'the painting',
    done: 'finished the painting, {work}',
    activity: 'painting', rooms: ['living_room', 'study', 'balcony', 'bedroom'],
    start: '{name} has set up an easel and started a painting: {work}.',
    stages: [
      'still blocking in shapes; it could be anything',
      'the composition is there; the colours are fighting each other',
      'repainting the hard part — the light, the thing they cannot get right',
      'details and glazes; it looks like a real painting now',
    ],
    session: [
      ['{name} blocked in {work} — big shapes, no detail. It could be anything.',
       '{name} worked on {work}, then painted over most of it.',
       '{name} mixed colours for {work} for an hour and barely touched the canvas.'],
      ['{name} worked on the colours in {work}, which are currently fighting each other.',
       '{name} stepped back from {work} every few minutes, squinting, then went back in.',
       '{name} painted over a whole corner of {work} and started it again, humming.'],
      ['{name} repainted the hard part of {work} for the third time.',
       '{name} spent an hour on {work} and changed one small patch of light. It is better.',
       '{name} took a photo of {work} and looked at it upside down, which apparently helps.'],
      ['{name} worked on the details of {work} with a very small brush and a very straight face.',
       '{name} glazed {work} and stood looking at it for a long time.',
       '{name} fussed over one highlight in {work}, called it done, then went back to it.'],
    ],
    bad: ['{name} stared at {work}, said "no," and turned the canvas to face the wall.',
          '{name} muddied the colours on {work} and spent the rest of the session scraping them back.'],
    milestone: [
      '{name} got the composition of {work} right at last — it finally looks like what it is.',
      '{name} got the colours in {work} to stop fighting.',
      '{name} cracked the hard part of {work}, stepped back, and actually smiled at it.',
    ],
    finish: '{name} signed the corner of {work}. It is finished, and it is good.',
    abandon: '{name} turned {work} to face the wall and left it there.',
    dusty: "{name}'s half-finished painting is propped against the wall, facing it.",
    show: [
      "{name} lets you look at {work}. It's mostly shapes. \"Use your imagination,\" they say, and then, \"no, not like that.\"",
      "{name} shows you {work}. You can see what it's going to be now. They point out everything wrong with it before you can.",
      "{name} shows you {work} and asks what's wrong with it. You tell them the truth: not much. They don't believe you, but they're smiling.",
      "{name} shows you {work}. It's lovely. They hover, pretending to clean a brush, until you say so.",
    ],
    display: { room: 'living_room', line: "{name}'s painting, {work}, hangs on the wall." },
    gifts: [
      { noun: 'portrait', given: 'a small portrait of you, painted from memory and a little too kind', short: 'portrait', item: 'gift_portrait' },
      { noun: 'painting', given: 'a painting of the view from your window, at the time of day you like best', short: 'painting', item: 'gift_painting' },
    ],
    skillGain: 12,
  },

  novel: {
    interests: ['writing'], wording: 'title',
    works: ['The Salt Year', 'A House with Too Many Doors', 'Nobody Leaves Carraway', 'Small Hours', 'What the River Took', 'The Second Lighthouse'],
    label: 'writing a novel, {work}', thing: '{work}',
    done: 'finished writing {work}, the whole novel',
    activity: 'writing', rooms: ['study', 'bedroom'],
    start: '{name} has started writing a novel. It is called {work}, and that is all anyone is allowed to know.',
    stages: [
      'a first chapter, rewritten four times',
      'a messy middle; they know where it ends but not how to get there',
      'the ending, which keeps changing',
      'a full draft, being cut and tidied',
    ],
    session: [
      ['{name} rewrote the first chapter of {work}. Again.',
       '{name} wrote six hundred words of {work} and deleted four hundred of them.',
       '{name} wrote an outline for {work} on index cards and laid them out on the floor.'],
      ['{name} wrote a chapter of {work} in one long sitting, headphones on, not looking up.',
       '{name} spent the session on {work} staring at the ceiling and typing in short bursts.',
       '{name} wrote two thousand words of {work}, which is a record.'],
      ['{name} wrote the ending of {work}, then a different ending.',
       '{name} worked on the last chapters of {work} and came out looking wrung out.',
       '{name} read the last chapter of {work} out loud to an empty room.'],
      ['{name} cut a whole chapter from {work}, and says it is better for it.',
       '{name} read {work} back from the start, pencil in hand.',
       '{name} spent the whole session on commas in {work}. Just commas.'],
    ],
    bad: ['{name} sat in front of {work} for an hour and wrote one sentence. Then deleted it.',
          '{name} decided the whole middle of {work} is terrible and closed the laptop.'],
    milestone: [
      '{name} finished the first chapter of {work} and, for once, did not rewrite it.',
      '{name} crossed the halfway mark of {work} and made a cup of tea to celebrate.',
      '{name} wrote the last line of {work}. A draft exists.',
    ],
    finish: '{name} finished {work} — the whole novel, redrafted and done — and printed it out, just to hold it.',
    abandon: '{name} moved {work} into a folder called "old" and closed the laptop.',
    dusty: "A sticky note on {name}'s laptop just says \"{work}???\"",
    show: [
      "{name} reads you the first paragraph of {work}, then snaps the laptop shut. \"That's all you get.\" It was good, actually.",
      "{name} tells you what happens in {work} so far, with a lot of hand movements, and asks if the middle makes sense. You say it does. It mostly does.",
      "{name} tells you there are three possible endings to {work} and asks which you'd want. You pick one. They look alarmed, which means you picked right.",
      "{name} lets you read a chapter of {work}. You read it all the way through. When you look up they've been watching you the whole time.",
    ],
    display: { room: 'living_room', line: "A thick printout of {name}'s novel, {work}, sits on the shelf." },
    skillGain: 12,
  },

  zine: {
    interests: ['politics'], wording: 'title',
    works: ['Who Owns This Street?', 'Fix the Buses', 'Notes from the Tenants’ Union', 'The Landlord Issue', 'Small Print'],
    label: 'making a zine, {work}', thing: 'the zine',
    done: 'finished the zine, {work} (copies on the coffee table)',
    activity: 'working on a zine', rooms: ['study', 'bedroom', 'living_room'],
    start: '{name} is making a zine called {work}, and there are already scissors everywhere.',
    stages: [
      'a pile of notes and strong opinions',
      'writing the pieces, all of them too long',
      'laying it out with scissors and a glue stick',
      'proofreading, and hunting for a photocopier',
    ],
    session: [
      ['{name} filled a notebook page with furious notes for {work}.',
       '{name} read three articles for {work} and got angrier with each one.',
       '{name} collected quotes for {work} from three different group chats.'],
      ['{name} wrote a piece for {work} that is twice as long as it can be.',
       '{name} cut the lead piece in {work} in half, and it was better for it.',
       '{name} wrote a very short, very angry poem for {work}. It is going in.'],
      ['{name} cut and pasted pages of {work} on the floor, glue stick in teeth.',
       '{name} laid out a spread of {work} and moved one headline four times.',
       '{name} hunted through old magazines for letters to cut out for {work}.'],
      ['{name} proofread {work} out loud, in a debate voice.',
       '{name} went through {work} with a red pen and found a typo in the title.',
       '{name} folded a test copy of {work} and found the page order was wrong. Again.'],
    ],
    bad: ['{name} wrote a paragraph for {work}, reread it, and said "that is just shouting" to nobody.',
          '{name} glued a page of {work} upside down and had to start the spread again.'],
    milestone: [
      '{name} finished the first piece for {work} — one page, every word earned.',
      '{name} finished writing everything in {work}. Now it just needs to look like something.',
      '{name} finished laying out {work}. It looks like a real zine.',
    ],
    finish: '{name} came home with a box of photocopied copies of {work}, still warm.',
    abandon: '{name} put the scissors away. {work} is on hold until the revolution, or the weekend.',
    dusty: "Cut-up pages of {name}'s zine drift around, held down with a mug.",
    show: [
      "{name} tells you what {work} is going to say. It takes a while. They're very good at it.",
      "{name} reads you the opening piece of {work}. It's angry and funny and ends on a good line.",
      "{name} shows you a spread of {work}, all cut-out letters and hand-drawn arrows. It looks great, and slightly like a ransom note.",
      "{name} hands you a proof copy of {work} and a red pen. You find one typo. They're thrilled.",
    ],
    display: { room: 'living_room', line: "A stack of {name}'s zine, {work}, sits on the coffee table. Take one." },
    skillGain: 8,
  },

  cold_case: {
    interests: ['true crime'], wording: 'the',
    works: ['Harrow Lane disappearance', 'lighthouse fire of 1987', 'missing bride of Ashcombe', 'Riverside Motel case', 'lottery-ticket murder'],
    label: 'investigating an old unsolved case, {work}', thing: 'the case',
    done: 'finished a theory about the {noun}',
    activity: 'poring over case files', rooms: ['bedroom'],
    start: '{name} has become obsessed with an old unsolved case, {work}. There is a corkboard now.',
    stages: [
      'reading everything ever written about it',
      'building a timeline; the corkboard has string now',
      'chasing one detail nobody else seems to have noticed',
      'writing up a theory',
    ],
    session: [
      ['{name} read old newspaper archives about {work} for two hours.',
       '{name} listened to a podcast about {work} with a notebook open.',
       '{name} made a list of everyone involved in {work}. It is long.'],
      ['{name} pinned three new printouts about {work} to the corkboard and joined them up with red string.',
       '{name} rebuilt the timeline of {work} from scratch.',
       '{name} drew a map of the town from {work} on the back of a takeaway menu.'],
      ['{name} spent an hour on one detail in {work} — a bus timetable from that year.',
       '{name} cross-referenced two witness statements about {work} and made a small noise.',
       '{name} re-listened to one witness interview about {work} five times, pen hovering.'],
      ['{name} wrote up a theory about {work}, all fourteen pages of it.',
       '{name} checked the theory about {work} against every source, one more time.',
       '{name} read the theory about {work} to the mirror, to see if it sounded mad. It does, a bit.'],
    ],
    bad: ['{name} found out a lead on {work} was a hoax and took down a whole section of string.',
          '{name} went down a rabbit hole about {work} that turned out to be about a different case entirely.'],
    milestone: [
      '{name} has read everything there is on {work}. Everything.',
      '{name} finished the timeline for {work}. The corkboard is now mostly string.',
      '{name} found something in {work} that nobody else seems to have noticed, and paced for an hour.',
    ],
    finish: '{name} finished a theory about {work}, emailed it to the podcast, and is now unbearable about it.',
    abandon: '{name} took down the corkboard for {work}. "Some things are meant to stay unsolved," apparently.',
    dusty: "{name}'s corkboard of red string and printouts has started to curl at the edges.",
    show: [
      "{name} tells you about {work}. You were not ready for how much there is. You ask one question and lose forty minutes.",
      "{name} walks you through the corkboard for {work}, string by string. It's unsettling how good at this they are.",
      "{name} shows you the detail they found in {work} — a bus timetable. You don't get it. Then you do, and it gives you a chill.",
      "{name} reads you the theory about {work}. It's convincing. You check the front door's locked afterwards.",
    ],
    skillGain: 8,
  },

  knitting: {
    interests: ['crafting'], wording: 'the',
    works: ['scarf', 'jumper', 'patchwork blanket', 'pair of mittens', 'tea cosy shaped like a sheep'],
    label: 'knitting {a_work}', thing: '{work}',
    done: 'finished {work}',
    activity: 'knitting', rooms: ['living_room', 'bedroom'],
    start: '{name} has taken up knitting and cast on {a_work}.',
    stages: [
      'the first few rows, most of them unpicked',
      'getting a rhythm; it looks like knitting now',
      'the fiddly bit — shaping, or a pattern that keeps going wrong',
      'the last stretch and the finishing',
    ],
    session: [
      ['{name} knitted six rows of {work} and unpicked four of them.',
       '{name} worked on {work}, counting stitches out loud.',
       '{name} watched a video on casting on, cast on {work} again, and got it right.'],
      ['{name} knitted a good long stretch of {work}, needles clicking.',
       '{name} worked on {work} in front of a podcast, fast now.',
       '{name} knitted row after row of {work} without looking down, which is showing off.'],
      ['{name} worked on the fiddly part of {work} with the pattern held very close.',
       '{name} unpicked a whole evening of {work} to fix one dropped stitch.',
       '{name} held {work} up against the pattern photo and frowned for a long time.'],
      ['{name} knitted the last stretch of {work}.',
       '{name} sewed in the loose ends on {work}, very carefully.',
       '{name} blocked {work} flat on a towel, very gently.'],
    ],
    bad: ['{name} dropped a stitch in {work}, tried to fix it, and made a hole the size of a coin.',
          '{name} tangled the wool for {work} into a knot that took the whole session.'],
    milestone: [
      '{name} got through a whole row of {work} without a single mistake.',
      '{name} measured {work} and it is more than halfway.',
      '{name} got past the hardest part of {work} and held it up to the light.',
    ],
    finish: '{name} cast off {work}. It is done, and it is soft, and it is only a little bit uneven.',
    abandon: '{name} put the half-knitted {noun} in a drawer, needles still in it.',
    dusty: "{name}'s knitting bag sits by the sofa, the {noun} poking out of it, untouched.",
    show: [
      "{name} holds up {work}: four rows, one of them wider than the others. \"It's rustic,\" they say.",
      "{name} shows you {work}. It looks like actual knitting now. They make you feel how soft it is.",
      "{name} is on the fiddly part of {work} and shushes you until the end of the row. Then they show you, very proud.",
      "{name} holds up {work}, nearly finished, and makes you guess how many hours it took. You guess low. You are told.",
    ],
    display: { room: 'living_room', line: "{name}'s knitted {noun} is draped over the arm of the sofa." },
    gifts: [
      { noun: 'scarf', given: 'a scarf, knitted in colours that look suspiciously like your favourites', short: 'scarf', item: 'handknit_scarf' },
      { noun: 'hat', given: 'a slouchy knitted hat, exactly your size', short: 'hat', item: 'handknit_hat' },
      { noun: 'pair of socks', given: 'a pair of thick knitted socks, the heels only slightly lumpy', short: 'socks', item: 'handknit_socks' },
    ],
    skillGain: 10,
  },

  sewing: {
    interests: ['fashion'], wording: 'the',
    works: ['dress from a vintage pattern', 'jacket, from scratch', 'patchwork denim jacket', 'pair of wide-leg trousers', 'thrifted suit, taken in to fit'],
    label: 'sewing {a_work}', thing: '{work}',
    done: 'finished {work}',
    activity: 'at the sewing machine', rooms: ['bedroom', 'study'],
    start: '{name} has dragged a sewing machine out of a cupboard and is making {a_work}.',
    stages: [
      'cutting the pattern, measuring twice and still getting it wrong',
      'the main seams; it has a shape now',
      'the hard parts — collar, zip, sleeves',
      'hemming and finishing',
    ],
    session: [
      ['{name} pinned the pattern for {work} to the fabric, unpinned it, and pinned it again.',
       '{name} cut out the pieces for {work}, measuring everything twice.',
       '{name} ironed the fabric for {work}, which apparently matters more than it sounds.'],
      ['{name} ran the main seams of {work} on the machine, a steady whirr for an hour.',
       '{name} tried on half of {work} and made adjustments with a mouth full of pins.',
       '{name} ran up a whole side seam of {work} without a single wobble.'],
      ['{name} set a sleeve into {work} and unpicked it, twice.',
       '{name} spent the whole session on the zip in {work}.',
       '{name} pinned the tricky part of {work} eleven times.'],
      ['{name} hemmed {work} by hand, very neatly.',
       '{name} pressed every seam in {work} flat with the iron.',
       '{name} sewed the last little details onto {work}, one careful thread at a time.'],
    ],
    bad: ['{name} sewed a seam on {work} inside out and said a word the machine did not deserve.',
          '{name} snapped a needle on {work} and called it a day.'],
    milestone: [
      '{name} finished cutting out {work} without a single wrong cut.',
      '{name} finished the main seams of {work}. It is recognisably a garment.',
      '{name} got the hard part of {work} to lie flat at last.',
    ],
    finish: '{name} finished {work} and wore it round the flat for the rest of the day.',
    abandon: '{name} folded the pieces of {work} into a bag and put the sewing machine back in the cupboard.',
    dusty: "Pinned pieces of {name}'s {noun} are draped over a chair, waiting.",
    show: [
      "{name} shows you the pattern for {work} and a lot of cut fabric. \"Trust the process.\"",
      "{name} holds {work} up against themselves. It has a shape! They twirl, slightly.",
      "{name} shows you the zip on {work}, which they redid three times. It's perfect. You are made to look at it closely.",
      "{name} tries on {work} for you. It fits like it came from somewhere expensive. They're trying hard not to look smug.",
    ],
    gifts: [
      { noun: 'shirt', given: 'a shirt, made to your measurements, which they apparently guessed', short: 'shirt', item: 'handmade_shirt' },
    ],
    skillGain: 10,
  },

  baking: {
    interests: ['cooking'], wording: 'the',
    works: ['sourdough loaf', 'batch of croissants', 'plum cake from an old family recipe', 'pork pie with a proper crust', 'three-tier sponge'],
    label: 'trying to master {a_work}', thing: '{work}',
    done: 'finally nailed {work}',
    activity: 'baking', rooms: ['kitchen'],
    start: '{name} has decided to master {a_work}, and has bought a lot of flour.',
    stages: [
      'first attempts; flat, dense or burnt',
      'edible now, but not what they are after',
      'chasing the one thing still wrong — the crumb, the rise, the layers',
      'nearly perfect; working on doing it every time',
    ],
    session: [
      ['{name} baked a first go at {work}. It came out flat, and got eaten anyway.',
       '{name} baked an attempt at {work} and set off the smoke alarm, briefly.',
       '{name} read four recipes for {work} and decided all of them were wrong.'],
      ['{name} baked another {noun}. Edible! Not right, but edible.',
       '{name} took notes on the last {noun} and tried again with less water.',
       '{name} weighed everything for {work} to the gram this time. Better. Still not right.'],
      ['{name} baked {work} again, cut it open, and stared at the inside for a long time.',
       '{name} spent the session on the dough for {work}, folding and waiting and folding.',
       '{name} baked {work} at a slightly different temperature and wrote the result in a notebook.'],
      ['{name} baked {work} and it looked like a photo of one.',
       '{name} baked {work} twice in a row to prove the last one was not luck.',
       '{name} baked {work} without the recipe open.'],
    ],
    bad: ['{name} forgot {work} in the oven. The smoke alarm remembered.',
          '{name} dropped {work} on the floor, face down, and needed a moment.'],
    milestone: [
      '{name} baked {a_work} that came out actually edible, and the flat was allowed some.',
      '{name} got the bake on {work} right for the first time — the flat smelled incredible.',
      '{name} cracked the hard part of {work} and took a photo of it from four angles.',
    ],
    finish: '{name} baked {work} — perfectly — and the flat demolished it inside an hour.',
    abandon: '{name} put the baking tins back on the top shelf. {work} has won.',
    dusty: "{name}'s baking tins are stacked on top of the fridge, gathering dust.",
    show: [
      "{name} makes you taste a first attempt at {work}. It's... dense. \"Honest opinion,\" they say. You give a kind one.",
      "{name} hands you a slice of the latest {noun}. It's good! They explain at length why it's not good enough.",
      "{name} shows you the inside of today's {noun} and asks you to look at the crumb. You look at the crumb. It's a crumb.",
      "{name} gives you a piece of {work}, still warm. It's genuinely excellent. They watch you eat it like a judge on a baking show.",
    ],
    skillGain: 10,
  },

  yoga: {
    interests: ['yoga'], wording: 'the',
    works: ['headstand', 'full splits', 'crow pose', 'wheel pose', 'forearm stand'],
    label: 'working toward {work}', thing: '{work}',
    done: 'can do {work} now',
    activity: 'doing yoga', rooms: ['gym', 'bedroom', 'living_room'],
    start: '{name} has decided that this is the year of {work}.',
    stages: [
      'nowhere near it; building the basics',
      'can get into it against a wall, for a second',
      'holding it for a few breaths, wobbling',
      'holding it clean; working on getting in and out gracefully',
    ],
    session: [
      ['{name} did an hour of drills toward {work}, mostly core, mostly groaning.',
       '{name} practised the steps toward {work} on the mat, slowly.',
       '{name} watched a slow-motion video of {work} and practised the first step twenty times.'],
      ['{name} got into {work} against the wall for a second, then collapsed, laughing.',
       '{name} drilled {work} with a pillow in the danger zone.',
       '{name} worked on {work} against the wall with a cushion underneath, just in case.'],
      ['{name} held {work} for three whole breaths.',
       '{name} worked on {work}, wobbling less every time.',
       '{name} held {work} long enough to breathe out, and laughed with relief.'],
      ['{name} held {work} clean, then did it again for the mirror.',
       '{name} flowed in and out of {work} like it was nothing.',
       '{name} moved in and out of {work} slowly, on purpose, which is harder.'],
    ],
    bad: ['{name} tried {work}, toppled sideways, and lay on the mat for a bit, contemplating things.',
          '{name} pulled something reaching for {work} and spent the session stretching it out.'],
    milestone: [
      '{name} got into {work} for the first time — for about half a second.',
      '{name} held {work} away from the wall.',
      '{name} held {work} for ten slow breaths.',
    ],
    finish: '{name} can do {work} now — clean, steady, and on request.',
    abandon: '{name} rolled up the yoga mat. {work} is a problem for another year.',
    dusty: "{name}'s yoga mat is rolled up in the corner, with a sock on it.",
    show: [
      "{name} shows you the drill for {work}. It looks easy. You try it. It is not easy.",
      "{name} goes up into {work} against the wall and comes straight down. \"Did you see it?\" You did, briefly.",
      "{name} holds {work} for three breaths and you count them out loud. They come down grinning.",
      "{name} goes into {work} like it's nothing and holds it while telling you about their day.",
    ],
    skillGain: 10,
  },

  strength: {
    interests: ['fitness', 'hiking'], wording: 'bare',
    works: ['one strict pull-up', 'a hundred push-ups in a row', 'a five-minute plank', 'a pistol squat on each leg', 'a freestanding handstand'],
    label: 'training toward {work}', thing: 'the training',
    done: 'did {work}',
    activity: 'exercising', rooms: ['gym', 'bedroom'],
    start: '{name} has set a goal: {work}. There is a chart on the wall.',
    stages: [
      'nowhere near; building up with the easy version',
      'getting stronger; halfway there on a good day',
      'close; the last bit is the hardest',
      'can almost do it; working on doing it properly',
    ],
    session: [
      ['{name} trained toward {work} with the easy version, complaining the whole time.',
       '{name} did an hour of sets toward {work} and marked the chart.',
       '{name} did the warm-up for {work} and declared it a workout in itself.'],
      ['{name} trained toward {work} and beat last week by a little.',
       '{name} did a set toward {work}, rested, and did it again.',
       '{name} added one more rep toward {work} and updated the chart with a flourish.'],
      ['{name} trained toward {work} and got agonisingly close.',
       '{name} spent the session on the last, hardest bit of {work}.',
       '{name} rested longer between sets toward {work} and did better for it.'],
      ['{name} nearly managed {work}, cleanly, twice.',
       '{name} practised {work} with perfect form, slowly.',
       '{name} filmed a set toward {work} to check the form.'],
    ],
    bad: ['{name} trained toward {work}, went backwards, and sulked at the chart.',
          '{name} tweaked a shoulder training for {work} and called it early.'],
    milestone: [
      '{name} can do the easy version of {work} now, no problem.',
      '{name} got halfway to {work} and wrote it on the chart in capitals.',
      '{name} got within a whisker of {work}.',
    ],
    finish: '{name} did {work}. Actually did it. The chart has a gold star on it now.',
    abandon: '{name} took the chart for {work} off the wall.',
    dusty: "{name}'s training chart hasn't been updated in a while.",
    show: [
      "{name} shows you the chart for {work}. It has a long way to go. They're weirdly cheerful about it.",
      "{name} shows you how far they've got toward {work} and makes you count. You count. It's impressive.",
      "{name} goes for {work} with you watching and gets this close. \"Next week,\" they say, red in the face.",
      "{name} does {work} — nearly perfectly — and then pretends it was easy.",
    ],
    skillGain: 8,
  },

  photos: {
    interests: ['photography'], wording: 'title',
    works: ['Doorways', 'Five in the Morning', 'Strangers’ Hands', 'The Last Corner Shops', 'Rain on Glass'],
    label: 'putting together a photo series, {work}', thing: 'the photo series',
    done: "finished the photo series, {work} (it's up in the hallway)",
    activity: 'editing photos', rooms: ['study', 'bedroom'],
    start: '{name} has started a photo series called {work}, and is out early with a camera most days.',
    stages: [
      'shooting; hundreds of photos, three keepers',
      'a dozen good ones; hunting for the rest',
      'editing; the colours are the hard part',
      'choosing and printing the final set',
    ],
    session: [
      ["{name} went through the day's shots for {work}. Three keepers out of two hundred.",
       '{name} sorted photos for {work} into "yes", "no" and "why did I take this".',
       '{name} backed up two thousand photos for {work} and deleted most of them.'],
      ['{name} added two new shots to {work} and took one out.',
       '{name} laid out the best photos for {work} on the floor, and moved them around.',
       '{name} printed contact sheets for {work} and circled the good ones in red.'],
      ['{name} spent an hour on the colour of one photo for {work}.',
       '{name} edited the {work} set to match, squinting at the screen.',
       '{name} matched the colours across {work}, one slider at a time.'],
      ['{name} picked the final photos for {work}, then un-picked one.',
       "{name} test-printed a photo from {work} and held it at arm's length.",
       '{name} put the photos for {work} in order and read them left to right like a sentence.'],
    ],
    bad: ['{name} realised half the shots for {work} are out of focus, and put the laptop down.',
          '{name} lost a whole afternoon of edits on {work} to a crash.'],
    milestone: [
      '{name} got a photo for {work} that is actually good. Like, really good.',
      '{name} has enough good shots for {work} now. Just.',
      '{name} finished editing {work}; the set finally looks like one thing.',
    ],
    finish: '{name} printed {work} and pinned the whole series up along the hallway.',
    abandon: '{name} moved the {work} photos into a folder and stopped carrying the camera.',
    dusty: "{name}'s camera sits on the shelf with its lens cap on.",
    show: [
      "{name} scrolls you through the shots for {work}. Mostly misses. Then one that stops you both.",
      "{name} lays out the best photos for {work} and asks which is your favourite. You pick one. They tell you it's everyone's favourite, a bit smugly.",
      "{name} shows you two versions of the same photo for {work}. You can't see the difference. They can.",
      "{name} shows you a test print from {work}. It's beautiful. They say \"it's fine\" and hold it very carefully.",
    ],
    display: { room: 'hallway_a', line: "{name}'s photo series, {work}, is pinned along the wall." },
    gifts: [
      { noun: 'photo', given: "a framed print of a photo they took of you laughing, which you don't remember them taking", short: 'photo', item: 'gift_photo_print' },
    ],
    skillGain: 10,
  },

  game_dev: {
    interests: ['coding'], wording: 'title',
    works: ['Tiny Landlord', 'Space Janitor', 'Frog Kingdom', 'Moth & Lamp', 'Dungeon Flatshare'],
    label: 'making a little video game, {work}', thing: '{work}',
    done: 'finished {work} and put it online',
    activity: 'coding a side project', rooms: ['study', 'bedroom'],
    start: '{name} is making a little video game called {work}. Evenings only. "It is small," apparently.',
    stages: [
      'a square moving around a screen',
      'something playable, held together with tape',
      'fixing bugs faster than making them, mostly',
      'polish — sounds, menus, the title screen',
    ],
    session: [
      ['{name} worked on {work} and got a square to move around the screen. Big day.',
       '{name} spent an hour on {work} reading documentation with a frown.',
       '{name} named every file in {work} very carefully and wrote no actual code.'],
      ['{name} added a feature to {work} and broke two others.',
       '{name} playtested {work} and laughed out loud at a bug.',
       '{name} drew the pixel art for one character in {work}. It has a hat.'],
      ['{name} fixed nine bugs in {work} and found six more.',
       '{name} worked on {work} late, muttering "why" at intervals.',
       '{name} made {work} crash on purpose, to find out why it crashes by accident.'],
      ['{name} made the title screen for {work}. It has music now.',
       '{name} tuned how {work} feels to play, over and over, for an hour.',
       '{name} added a credits screen to {work} with one name on it.'],
    ],
    bad: ['{name} broke {work} so badly it would not start, and went to bed.',
          '{name} spent the whole session on {work} hunting one bug, and did not find it.'],
    milestone: [
      '{name} has something playable in {work}, if you squint.',
      '{name} got {work} playable start to finish.',
      '{name} fixed the last big bug in {work} and said "yes!" loud enough to hear from the hall.',
    ],
    finish: '{name} finished {work} and put it online. Seven people have downloaded it, and one left a nice review.',
    abandon: '{name} closed {work} and started talking about "a new idea, a better one".',
    dusty: "A sticky note on {name}'s monitor just says \"FIX JUMP\".",
    show: [
      "{name} shows you {work}: a square that moves. \"Imagine it's a frog.\" You imagine it's a frog.",
      "{name} lets you play {work}. You break it within a minute. They're delighted, and take notes.",
      "{name} lets you play {work} again. It's actually fun. You play longer than you meant to.",
      "{name} watches you play {work}, silently mouthing along to the music they made. You get to the end. They pretend they weren't waiting for that.",
    ],
    skillGain: 12,
  },

  speedrun: {
    interests: ['gaming'], wording: 'title',
    works: ['Castle Vantablack', 'Moonhopper 64', 'Super Pickle Bros.', 'Gloomfall', 'Skyline Courier'],
    label: 'trying to speedrun {work} under a target time', thing: 'the {work} run',
    done: 'beat the target time on {work}',
    activity: 'playing games', rooms: ['game_room', 'living_room'],
    start: '{name} has decided to speedrun {work}, and has a spreadsheet of split times.',
    stages: [
      'learning the route',
      'practising the hard tricks one at a time',
      'full runs; dying at the same trick every time',
      'shaving seconds off',
    ],
    session: [
      ['{name} learned the route for {work}, one level at a time, with a guide open.',
       '{name} practised {work} and wrote down every split.',
       '{name} watched the world-record run of {work} with a notebook.'],
      ['{name} practised one trick in {work} for an hour, and landed it twice.',
       '{name} drilled the hardest jump in {work} until the controller creaked.',
       '{name} practised the first level of {work} until it could be done half asleep.'],
      ['{name} did full runs of {work} and died at the same trick every time.',
       '{name} reset {work} forty times in a row. Some sounds were made.',
       '{name} got to the last level of {work} for the first time, and panicked.'],
      ['{name} shaved four seconds off the {work} run.',
       '{name} did clean runs of {work} and swore very quietly at a one-second loss.',
       '{name} did runs of {work} against a stopwatch, muttering split times.'],
    ],
    bad: ['{name} put the controller down on the sofa, gently, and walked away from {work}.',
          '{name} had a run of {work} going brilliantly and died on the last jump.'],
    milestone: [
      '{name} learned the whole route through {work}.',
      '{name} landed every hard trick in {work} at least once.',
      '{name} finished a full run of {work} without dying once.',
    ],
    finish: '{name} beat the target time on {work}, screamed, and then went very quiet and happy.',
    abandon: '{name} deleted the {work} splits spreadsheet. It is just a game again.',
    dusty: "{name}'s split-time spreadsheet for {work} is still open on the laptop, untouched.",
    show: [
      "{name} shows you the route through {work}, which involves going through a wall on purpose. You have questions.",
      "{name} shows you the trick they've been practising in {work}. It takes six tries. The seventh is beautiful.",
      "{name} does a full run of {work} with you watching and dies at the usual place. \"You're bad luck,\" they say, and start again.",
      "{name} does a run of {work} for you, narrating every trick. It's weirdly thrilling. You're both holding your breath at the end.",
    ],
    skillGain: 8,
  },

  short_film: {
    interests: ['film'], wording: 'title',
    works: ['Laundry Day', 'The Last Bus', 'Nobody Waters the Plants', 'Two Keys', 'Static'],
    label: 'making a short film, {work}, on a phone', thing: 'the film',
    done: 'finished the short film, {work}',
    activity: 'editing a short film', rooms: ['study', 'bedroom'],
    start: '{name} is making a short film called {work}, shot on a phone. Anyone in the flat may be asked to hold a light.',
    stages: [
      'writing it and shooting it; a lot of takes',
      'a rough cut, too long by half',
      'cutting it down; the ending does not work yet',
      'sound and colour; the last polish',
    ],
    session: [
      ['{name} storyboarded {work} on sticky notes.',
       '{name} went through the takes for {work}, one by one.',
       '{name} wrote the shot list for {work} on the back of an envelope.'],
      ['{name} put together a rough cut of {work}. It is twice as long as it should be.',
       '{name} watched the rough cut of {work} with a notebook, wincing.',
       '{name} logged every take of {work} in a spreadsheet, colour-coded.'],
      ['{name} cut two minutes from {work}, and it got better.',
       '{name} tried five different endings for {work}.',
       '{name} watched {work} with the sound off to see if it still worked. Mostly.'],
      ['{name} worked on the sound in {work}, headphones on, eyes closed.',
       '{name} colour-graded {work} and made the whole flat look like a film.',
       '{name} made the title card for {work}, and it took an hour.'],
    ],
    bad: ['{name} watched {work} from the start and declared it "unwatchable".',
          '{name} lost an hour of editing on {work} and put the laptop down very carefully.'],
    milestone: [
      '{name} finished shooting {work}. Every shot is in the can.',
      '{name} got {work} down to a watchable length.',
      '{name} found the ending of {work}. It was the first take all along.',
    ],
    finish: '{name} finished {work} and held a screening in the living room. The popcorn was mandatory.',
    event: { emoji: '🎬', label: '{name}: screening of {work}', what: 'the screening', when: 'evening, in the living room', at: 1290, room: 'living_room' },
    abandon: '{name} closed the {work} project file. Film is a young person\'s game, apparently.',
    dusty: "The storyboard for {name}'s film is peeling off the wall, one sticky note at a time.",
    show: [
      "{name} shows you the storyboard for {work} and asks you to be in the background of a shot. You agree to hold a lamp.",
      "{name} shows you the rough cut of {work}. It's long. There's one shot in it that's genuinely beautiful and they know which one.",
      "{name} shows you two endings for {work} and asks which. You pick. They'd picked the other, and now they're not sure.",
      "{name} shows you {work}, nearly finished. The sound is lovely. You forget it was made in this flat.",
    ],
    skillGain: 10,
  },

  doorstop: {
    interests: ['reading'], wording: 'title',
    works: ['War and Peace', 'Middlemarch', 'Moby-Dick', 'Don Quixote', 'The Brothers Karamazov'],
    label: 'finally reading {work}, cover to cover', thing: '{work}',
    done: 'finished {work}, every single page',
    activity: 'reading', rooms: ['study', 'living_room', 'balcony', 'bedroom'],
    start: '{name} has decided to finally read {work}. The bookmark is at page one.',
    stages: [
      'the first hundred pages; still learning who everyone is',
      'deep in; has opinions about the characters',
      'the long slow middle',
      'the last stretch, reading faster',
    ],
    session: [
      ['{name} read forty pages of {work} and looked up three words.',
       '{name} read {work} with a list of characters on a sticky note.',
       '{name} read {work} with a pencil behind one ear, underlining things.'],
      ['{name} read {work} for two hours and gasped once.',
       '{name} read a big chunk of {work} and now has strong opinions about one of the characters.',
       '{name} read a long chunk of {work} and texted a friend "WHY would anyone do that".'],
      ['{name} pushed through the slow middle of {work}, one chapter at a time.',
       '{name} read {work} and fell asleep on it, briefly.',
       '{name} read {work} in short bursts, a chapter and a snack at a time.'],
      ['{name} read {work} fast, not wanting to stop.',
       '{name} read {work} all afternoon, nearly at the end now.',
       '{name} read the last hundred pages of {work} in one go.'],
    ],
    bad: ['{name} read the same page of {work} four times and gave up for the day.',
          '{name} opened {work}, read a paragraph, and picked up a phone instead.'],
    milestone: [
      '{name} got past the first hundred pages of {work}. It gets good, apparently.',
      '{name} is halfway through {work} and there is no going back.',
      '{name} got through the slow middle of {work} and is flying now.',
    ],
    finish: '{name} finished {work} — every page — and sat very still for a long time afterwards.',
    abandon: '{name} moved the bookmark in {work} to the back cover, as a joke, and put it on the shelf.',
    dusty: "{work} sits on the shelf with {name}'s bookmark stuck a third of the way in.",
    show: [
      "{name} tells you who everyone in {work} is so far. There are a lot of them. You lose track by the fourth cousin.",
      "{name} tells you what's happening in {work} and gets genuinely angry about one of the characters. You find yourself taking sides.",
      "{name} admits the middle of {work} is slow. Then they read you a paragraph so good you both go quiet.",
      "{name} won't tell you how {work} ends, because you might read it. You won't. They know. They still won't tell you.",
    ],
    skillGain: 6,
  },

  seedlings: {
    interests: ['gardening'], wording: 'bare',
    works: ['cherry tomatoes', 'chillies', 'strawberries', 'salad leaves', 'sugar snap peas'],
    label: 'growing {work} in pots', thing: 'the {work}',
    done: 'picked the first {work}',
    activity: 'tending seedlings', rooms: ['balcony', 'kitchen'],
    start: '{name} has planted {work} in pots, and checks on them every morning.',
    stages: [
      'seeds in soil; nothing to see yet',
      'seedlings; fragile and leggy',
      'real plants; fighting off pests',
      'flowers, and the first fruit coming',
    ],
    session: [
      ['{name} checked the pots of {work}, which still look like pots of soil.',
       '{name} watered the seed trays and turned them to the light, twice.',
       '{name} labelled the seed trays in very neat handwriting.'],
      ['{name} fussed over the seedlings with a tiny watering can.',
       '{name} repotted the seedlings into bigger pots, one at a time.',
       '{name} moved the seedlings two inches to the left, for the light.'],
      ['{name} picked greenfly off the {work} one at a time.',
       '{name} tied the {work} to little canes, and talked to them.',
       '{name} sprayed the {work} with something that smelled of garlic, for the aphids.'],
      ['{name} counted the flowers on the {work}.',
       '{name} checked the {work} for anything ripe. Nearly.',
       '{name} checked the {work} twice before breakfast.'],
    ],
    bad: ['{name} found the {work} wilted and spent the whole session trying to revive them.',
          '{name} overwatered the {work} and had to tip half the pots out.'],
    milestone: [
      '{name} found the first shoots of {work} coming up, and told everyone.',
      '{name} potted the seedlings on — real plants now.',
      '{name} spotted the first flowers on the {work}.',
    ],
    finish: '{name} harvested the first {work} and made everyone in the flat try one.',
    abandon: '{name} let the {work} go and stopped checking the pots.',
    dusty: "{name}'s pots of {work} are looking thirsty.",
    show: [
      "{name} shows you a pot of soil. \"There are {work} in there,\" they say, with total faith.",
      "{name} shows you the seedlings, very gently, like they might hear. They're tiny and determined.",
      "{name} walks you round the pots of {work}, pointing out every leaf something has chewed. You're introduced to the culprit.",
      "{name} shows you the flowers on the {work}. \"Soon,\" they say, like a threat.",
    ],
    display: { room: 'balcony', line: "{name}'s {work} are thriving in pots out here." },
    skillGain: 8,
  },

  birth_charts: {
    interests: ['astrology'], wording: 'bare',
    works: ['birth charts for everyone in the flat', 'year-ahead readings for everyone', 'compatibility charts for the whole flat'],
    label: 'drawing up {work}', thing: 'the charts',
    done: "finished {work} (they're on the fridge)",
    activity: 'drawing up birth charts', rooms: ['living_room', 'bedroom'],
    start: '{name} is drawing up {work}, and needs everyone\'s exact time of birth.',
    stages: [
      'gathering birth dates and times; chasing people for them',
      'drawing the charts',
      'interpreting them — the hard part',
      'writing it all up nicely',
    ],
    session: [
      ['{name} chased everyone round the flat for an exact birth time.',
       '{name} looked up rising signs for {work}, very seriously.',
       "{name} looked up the time the sun rose on everyone's birthday, for {work}."],
      ['{name} drew up another chart for {work}, compass and all.',
       '{name} worked on {work} surrounded by circles and symbols.',
       '{name} drew another chart for {work} and coloured in the houses.'],
      ['{name} sat over {work} making small "hm" noises.',
       '{name} worked on {work}, and looked worried about one of them.',
       '{name} read an astrology book for {work}, nodding grimly.'],
      ['{name} wrote up {work} in very neat handwriting.',
       '{name} decorated {work} with a gold pen.',
       '{name} tidied up {work}, adding little stars in the margins.'],
    ],
    bad: ['{name} got a birth time wrong and had to redo a whole chart.',
          '{name} decided Mercury was in retrograde and stopped for the day.'],
    milestone: [
      '{name} has everyone\'s birth time now. It took some chasing.',
      '{name} finished drawing up {work}.',
      '{name} finished interpreting the charts and has Thoughts about the flat.',
    ],
    finish: '{name} finished {work} and stuck them to the fridge. The flat has never been more thoroughly explained.',
    abandon: '{name} put the charts away. The stars will keep.',
    dusty: "{name}'s half-drawn charts are in a pile, weighed down by a crystal.",
    show: [
      "{name} asks for your exact time of birth. You don't know it. They look at you with deep pity.",
      "{name} shows you your chart — circles and lines so far. \"Oh,\" they say, looking at it. \"Oh, that explains a lot.\"",
      "{name} reads you a bit of your chart. It's weirdly accurate. They're not surprised.",
      "{name} shows you your finished chart, decorated in gold pen, and tells you who in the flat you're most compatible with. They're right, which is annoying.",
    ],
    display: { room: 'kitchen', line: "{name}'s charts are stuck to the fridge — one for everybody. Yours says a lot about you, apparently." },
    skillGain: 6,
  },

  standup: {
    interests: ['comedy'], wording: 'bare',
    works: ['a five-minute set', 'a set about living with roommates', 'a tight five', 'a set about growing up'],
    label: 'writing and rehearsing {work} for an open mic', thing: 'the set',
    done: 'did the open mic, and people actually laughed',
    activity: 'rehearsing a stand-up set', rooms: ['bedroom'],
    start: '{name} has signed up for an open mic and is writing {work}. Material may be drawn from life in the flat.',
    stages: [
      'writing jokes; most of them are notes that say "the fridge thing"',
      'a rough set; too long, some bits land',
      'cutting it down and finding the timing',
      'running it until it is automatic',
    ],
    session: [
      ['{name} wrote jokes for {work} in a notebook and laughed at exactly one of them.',
       '{name} paced around muttering bits for {work}.',
       '{name} wrote down everything funny anyone said at dinner, for {work}.'],
      ['{name} ran {work} out loud, timing it on a phone. Too long.',
       '{name} performed {work} to the mirror, and the mirror did not laugh.',
       '{name} tried the opening line of {work} in four different accents.'],
      ['{name} cut a joke from {work} and it hurt.',
       '{name} ran the same punchline from {work} ten different ways.',
       '{name} recorded {work} on a phone and listened back, wincing at the pauses.'],
      ['{name} ran {work} from the top, twice, word perfect.',
       '{name} performed {work} to an empty room with full commitment.',
       '{name} ran {work} pacing up and down, and nailed the ending.'],
    ],
    bad: ['{name} read back the jokes for {work} and said "who wrote this" in a small voice.',
          '{name} tried {work} out loud, heard it, and lay face down on the bed.'],
    milestone: [
      '{name} has enough material for {work}. Some of it is even funny.',
      '{name} got {work} down to time.',
      '{name} got the timing of {work} right — there is a pause now, and it is a good pause.',
    ],
    finish: '{name} did {work} at the open mic and got real laughs. The fridge bit killed.',
    event: { emoji: '🎤', label: '{name}: open mic', what: 'the open mic', when: 'evening, out', at: 1380 },
    abandon: '{name} dropped out of the open mic. "Comedy is dead," apparently.',
    dusty: "{name}'s joke notebook is lying face down on a chair.",
    show: [
      "{name} tries a joke from {work} on you. You laugh. They write down that you laughed, which is less funny.",
      "{name} does two minutes of {work} for you. One bit is about the flat. It's a bit too accurate.",
      "{name} does the same joke three ways and asks which is funniest. It's the second one. It's always the second one.",
      "{name} does the whole of {work} for you, pauses and all. You laugh properly, twice, and they look almost shy about it.",
    ],
    skillGain: 10,
  },

  language: {
    interests: ['travel'], wording: 'bare',
    works: ['Portuguese', 'Japanese', 'Italian', 'Korean', 'Spanish', 'Greek'],
    label: 'learning {work}, for a trip one day', thing: 'the {work} lessons',
    done: 'had a whole conversation in {work}',
    activity: 'practising a language', rooms: ['bedroom', 'balcony', 'kitchen'],
    start: '{name} has started learning {work}, for "the trip". There are flashcards everywhere.',
    stages: [
      'hello, thank you, and the numbers',
      'simple sentences, slowly, with a lot of pointing',
      'the grammar wall',
      'real conversations, with a partner on an app',
    ],
    session: [
      ['{name} practised {work} flashcards out loud.',
       '{name} did a {work} lesson and repeated "thank you" nine times.',
       '{name} practised {work} numbers by counting everything in sight.'],
      ['{name} practised {work} sentences with a lot of pointing at things.',
       '{name} labelled things around the flat in {work} with sticky notes.',
       '{name} wrote a shopping list in {work}.'],
      ['{name} hit the {work} grammar wall and stared at it for an hour.',
       '{name} did {work} grammar drills, sighing in two languages now.',
       '{name} conjugated verbs in {work} out loud, with feeling.'],
      ['{name} had a whole conversation in {work} with a stranger on an app, and laughed a lot.',
       '{name} watched a film in {work} with the subtitles off, mostly.',
       '{name} read a short story in {work}, looking up only four words.'],
    ],
    bad: ['{name} forgot every word of {work} from this week and closed the app.',
          '{name} got told off by a language app for a missed streak, and took it personally.'],
    milestone: [
      '{name} can count to a hundred in {work} now, and will.',
      '{name} ordered an imaginary coffee in {work} without looking anything up.',
      '{name} broke through the {work} grammar wall.',
    ],
    finish: '{name} had a real, twenty-minute conversation in {work} and came off the call glowing.',
    abandon: '{name} deleted the {work} app. The trip can happen in English.',
    dusty: "{name}'s {work} flashcards are in a pile with a rubber band round them.",
    show: [
      "{name} says \"hello\" to you in {work}, then \"thank you\", then \"where is the train station\". That's everything.",
      "{name} describes the room to you in {work}, pointing at each thing. You nod along. The lamp is apparently very important.",
      "{name} explains the {work} grammar rule that's ruining their life. You don't follow. You're very sympathetic.",
      "{name} talks to you in {work} for a whole minute. You understand nothing and everything. They're beaming.",
    ],
    skillGain: 8,
  },

  good_cause: {
    interests: ['volunteering'], wording: 'bare',
    works: ['a winter coat drive', 'a street clean-up', 'a bake sale for the food bank', 'a book swap for the building'],
    label: 'organising {work}', thing: 'the organising',
    done: 'pulled off {work}',
    activity: 'making calls and lists', rooms: ['living_room', 'study'],
    start: '{name} is organising {work}, and has already started a spreadsheet and a group chat.',
    stages: [
      'lists and a spreadsheet',
      'getting people on board; many emails',
      'the logistics — places, times, a van',
      'the final push; reminders to everyone',
    ],
    session: [
      ['{name} made lists for {work}. Then lists of the lists.',
       '{name} set up a spreadsheet for {work} with colour coding.',
       '{name} made a flyer for {work} and printed a test copy.'],
      ['{name} emailed half the neighbourhood about {work}.',
       '{name} made phone calls about {work}, very politely.',
       '{name} replied to every message about {work} in the group chat.'],
      ['{name} spent an hour on the phone about a van for {work}.',
       '{name} worked out where everything for {work} will go, down to the tables.',
       '{name} drew a floor plan for {work} with a ruler.'],
      ['{name} sent reminders about {work} to everyone, twice.',
       '{name} made signs for {work} with a big marker.',
       '{name} checked the list for {work} twice, like a very organised Santa.'],
    ],
    bad: ['{name} had a volunteer for {work} drop out and needed a minute.',
          '{name} discovered a double booking for {work} and spent the session fixing it.'],
    milestone: [
      '{name} has a plan for {work}. A real one, with dates.',
      '{name} got enough people signed up for {work}.',
      '{name} sorted out the logistics for {work}. There is a van.',
    ],
    finish: '{name} pulled off {work}. It went brilliantly, and there are photos.',
    event: { emoji: '🤝', label: '{name}: {work}', what: '{work}', when: 'all day, out', at: 1080 },
    abandon: '{name} handed {work} over to someone else in the group chat, and muted it.',
    dusty: "{name}'s clipboard for {work} is under a pile of post.",
    show: [
      "{name} shows you the spreadsheet for {work}. It's colour coded. You're asked to volunteer before you can leave.",
      "{name} tells you how many people are coming to {work} now. They're thrilled. You're signed up for an hour, somehow.",
      "{name} walks you through the plan for {work}, down to where the tables go. It's impressively thorough.",
      "{name} makes you promise to come to {work}. You promise. They write your name down, which makes it binding.",
    ],
    skillGain: 8,
  },
};

// A secret project (for you) is told without the work: the sessions, the
// roommate card and the Encourage line say only that there IS something.
const PROJECT_SECRET_LINES = {
  session: [
    '{name} was working on something and turned it face-down the second anyone looked.',
    '{name} spent an hour on a project that, apparently, nobody is allowed to see yet.',
    '{name} worked on something in secret, and hid it under a cushion at the first footstep.',
  ],
  show: "You ask {name} what they're working on. \"Nothing!\" Something disappears behind their back. It is clearly not nothing, and they are clearly delighted you asked.",
  label: "won't say what",
};

// OFFSCREEN_EVENTS' 'hobby' row ("{name} spent time on their {hobby}") drew
// the hobby from a fixed list that had nothing to do with the person — a
// politics-and-partying roommate could spend the evening on their knitting.
// projectNameTheHobby tells it with their real project instead, or, between
// projects, with one of these for a kind their own interests lead to. Text
// only: the draw (and so every other roll) is untouched.
const PROJECT_HOBBY_PHRASES = {
  guitar: 'guitar practice', dj: 'practising a DJ mix', painting: 'a new painting idea', novel: 'some writing',
  zine: 'notes for a zine', cold_case: 'an unsolved case online', knitting: 'some knitting', sewing: 'some mending and altering',
  baking: 'a new bake', yoga: 'a long yoga session', strength: 'a proper workout', photos: 'sorting through old photos',
  game_dev: 'a little coding side project', speedrun: 'an old favourite game', short_film: 'sketching out an idea for a short film',
  doorstop: 'a long novel', seedlings: 'repotting the plants', birth_charts: 'reading up on astrology',
  standup: 'jotting down jokes', language: 'a language app', good_cause: 'volunteer sign-ups',
};

// The finish, when you weren't in the room for it: a text in the maker's own
// voice (bible.speech.textingStyle, TEXTING_STYLES; `default` for none). Told
// with the kind's {done}, which fits every kind — the first version said
// "Finished {thing}! Come and see?", which read as "Finished one strict
// pull-up! Come and see?" and "Finished Portuguese!".
const PROJECT_FINISH_TEXTS = {
  default: ['Guess who {done}.', 'I {done}!'],
  terse: ['{Done}.', '{Done}. Finally.'],
  'emoji-heavy': ['I {done} 🎉🎉🎉', 'omg i {done} 😭✨'],
  'all-lowercase': ["i {done}. don't make a big deal of it", 'so. i {done}'],
  'properly-punctuated': ["I'm pleased to report that I {done}.", 'Some good news: I {done}.'],
  'stream-of-consciousness': ["ok so i {done} and i don't know what to do with my hands now", 'i {done}!! weeks!! i need to lie down'],
  'meme-laden': ['me: {done}. achievement unlocked', 'breaking: local roommate {done}'],
};

// --- Wording (pure) -------------------------------------------------------------------

function projHash(...parts) {
  return hashStr(parts.join('|'));
}

function projPick(list, ...salt) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list[projHash(...salt) % list.length];
}

function projKind(p) {
  return p && PROJECT_KINDS[p.kind] ? PROJECT_KINDS[p.kind] : null;
}

// The three ways a work reads mid-sentence (see the section header). A gift
// project's noun is the gift's.
function projWords(kind, work) {
  const w = String(work || '');
  if (kind?.wording === 'title') { const q = `‘${w}’`; return { work: q, a_work: q, noun: q }; }
  if (kind?.wording === 'bare') return { work: w, a_work: w, noun: w };
  const article = /^[aeiou]/i.test(w) ? 'an' : 'a';
  return { work: `the ${w}`, a_work: `${article} ${w}`, noun: w };
}

// Fills {work}/{a_work}/{noun}/{thing}/{done}/{Done}; every other brace —
// {name} above all — is left for formatEventText or the caller. {done} is the
// kind's first-person "what I just managed" ("did one strict pull-up"), with no
// pronoun in it so it reads after "I", "Guess who" and "local roommate" alike;
// {Done} is the same, opening a sentence.
function projFill(line, kind, work, extra) {
  const words = projWords(kind, work);
  const sub = (s) => String(s || '').replace(/\{(work|a_work|noun)\}/g, (m, k) => words[k]);
  const done = sub(kind?.done || 'finished {work}');
  const vars = { ...words, thing: sub(kind?.thing || '{work}'), done, Done: done.charAt(0).toUpperCase() + done.slice(1), ...(extra || {}) };
  return String(line || '').replace(/\{(work|a_work|noun|thing|done|Done|gift|n)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

function projName(gs, npcId) {
  return gs?.npcs?.[npcId]?.bible?.name || 'Your roommate';
}

// --- State ------------------------------------------------------------------------------

function projectsRead(gs) {
  return gs?.world?.projects || null;
}

function ensureProjects(gs) {
  if (!gs.world) gs.world = {};
  const w = gs.world.projects && typeof gs.world.projects === 'object' ? gs.world.projects : (gs.world.projects = {});
  if (!w.people || typeof w.people !== 'object') w.people = {};
  if (!Array.isArray(w.displayed)) w.displayed = [];
  return w;
}

function projPerson(gs, npcId) {
  return projectsRead(gs)?.people?.[npcId] || null;
}

function projActive(gs, npcId) {
  return projPerson(gs, npcId)?.active || null;
}

function projIsResident(gs, npcId) {
  return gs?.npcs?.[npcId]?.residency?.status === 'resident';
}

function projTemper(npc) {
  return npc?.bible?.temperament || {};
}

// The interests this person has that lead to some kind, in their own order.
function projInterestKinds(npc) {
  const out = [];
  for (const intr of npc?.bible?.interests || []) {
    const name = intr?.name;
    if (!name) continue;
    for (const [kindId, k] of Object.entries(PROJECT_KINDS)) {
      if (k.interests.includes(name)) out.push({ kindId, interest: name });
    }
  }
  return out;
}

// Which project comes next: a kind they're into, less likely if they just gave
// up on one, a little likelier if they finished one (they're on a roll). The
// work is one they haven't done yet (a kind's list comes round again once
// they've done them all). Pure.
function projectChooseNext(npc, npcId, person, day) {
  const options = projInterestKinds(npc);
  if (!options.length) return null;
  const history = person?.history || [];
  const last = history[history.length - 1];
  const rng = seededRng(hashStr(npcId), `proj_next_${day}_${history.length}`);
  const pick = weightedPick(rng, options, (o) => {
    let w = 1;
    if (history.some(h => h.kind === o.kindId && h.status === 'finished')) w *= 1.4;
    if (last && last.kind === o.kindId && last.status === 'abandoned') w *= 0.25;
    return w;
  });
  const kind = PROJECT_KINDS[pick.kindId];
  const done = new Set(history.filter(h => h.kind === pick.kindId).map(h => h.work));
  const fresh = kind.works.filter(wk => !done.has(wk));
  const pool = fresh.length ? fresh : kind.works;
  return { kindId: pick.kindId, interest: pick.interest, work: pool[Math.floor(rng() * pool.length)] };
}

// A new project record. `gift` is the index of the kind's gift this is secretly
// going to be, or null.
function projNewRecord(person, choice, day, npc) {
  const T = PROJECT_TUNING;
  person.count = (person.count || 0) + 1;
  const t = projTemper(npc);
  return {
    n: person.count, kind: choice.kindId, interest: choice.interest, work: choice.work,
    startedDay: day, stage: 0, stageSessions: 0, sessions: 0, bad: 0,
    engagement: Math.max(0, Math.min(1, T.startEngagement + T.opennessStart * (t.openness || 0))),
    lastDay: day, lastRoom: null, dustSince: null, encouragedDay: null, gift: null,
  };
}

function projStageNeed(kind, stage) {
  const list = Array.isArray(kind?.stageSessions) ? kind.stageSessions : PROJECT_TUNING.stageSessions;
  return list[Math.max(0, Math.min(list.length - 1, stage))];
}

// Start one: maybe secretly for the player, when the maker is fond enough of
// them and the kind makes something you can give.
function projectStart(gs, npcId, person, day, seeded) {
  const npc = gs.npcs[npcId];
  const choice = projectChooseNext(npc, npcId, person, day);
  if (!choice) { person.nextStartDay = null; return null; }
  const p = projNewRecord(person, choice, day, npc);
  const kind = PROJECT_KINDS[p.kind];
  const T = PROJECT_TUNING;
  if (!seeded && Array.isArray(kind.gifts) && kind.gifts.length && (npc.relPlayer?.affection || 0) >= T.giftAffection) {
    const r = seededRng(hashStr(npcId), `proj_gift_${p.n}`);
    if (r() < T.giftChance) {
      p.gift = Math.floor(r() * kind.gifts.length);
      p.work = kind.gifts[p.gift].noun;
    }
  }
  person.active = p;
  person.nextStartDay = null;
  return p;
}

// The first time the pass sees a resident: most are already partway into
// something, so day one isn't a flat of beginners.
function projSeedPerson(gs, w, npcId, day) {
  const T = PROJECT_TUNING;
  const person = w.people[npcId] = { active: null, history: [], nextStartDay: null, dayDone: day, count: 0 };
  const r = seededRng(hashStr(npcId), `proj_seed_${gs.meta?.seed || ''}`);
  if (r() < T.seedChance) {
    const p = projectStart(gs, npcId, person, day, true);
    if (p) {
      const kind = PROJECT_KINDS[p.kind];
      p.stage = T.seedStages[Math.floor(r() * T.seedStages.length)];
      p.stageSessions = Math.floor(r() * projStageNeed(kind, p.stage));
      for (let s = 0; s < p.stage; s++) p.sessions += projStageNeed(kind, s);
      p.sessions += p.stageSessions;
      // As if they'd been at it a session every other day or so.
      p.startedDay = day - Math.round(p.sessions * 1.8);
    }
  } else {
    const [a, b] = T.firstStartDays;
    person.nextStartDay = day + a + Math.floor(r() * (b - a + 1));
  }
  return person;
}

// --- The day (the tick pass) ---------------------------------------------------------

// One day's upkeep for one person, applied for day `d`: the novelty wears off
// a little (less for the conscientious), an idle yesterday or a low mood costs
// a little more; the determined pick a stalled project back up; long enough in
// the dust and it's over; nobody on a project starts the next one when it's
// time. Returns the events it produced. Pure hashes only — no rolls.
function projectDailyUpkeep(gs, npcId, person, d) {
  const T = PROJECT_TUNING;
  const npc = gs.npcs[npcId];
  const events = [];
  const p = person.active;
  if (p) {
    const c = projTemper(npc).conscientiousness || 0;
    p.engagement -= T.dailyFade * (1 - 0.6 * c);
    if (p.lastDay < d - 1) p.engagement -= T.idleDecay * (1 - 0.5 * c);
    if ((npc.mood ?? 0) < T.lowMood) p.engagement -= T.lowMoodDecay;
    if (p.engagement < T.workThreshold) {
      p.engagement += T.rebound * Math.max(0, c);
      if (p.dustSince == null) p.dustSince = d;
    }
    p.engagement = Math.max(0, Math.min(1, p.engagement));
    if (p.engagement >= T.workThreshold) p.dustSince = null;
    if (p.dustSince != null && d - p.dustSince >= T.abandonAfterDays) {
      const evt = projectAbandon(gs, npcId, person, d);
      if (evt) events.push(evt);
    }
  } else if (person.nextStartDay != null && d >= person.nextStartDay) {
    const started = projectStart(gs, npcId, person, d, false);
    if (started) {
      const kind = PROJECT_KINDS[started.kind];
      // Filed where the project will live (the kind's first room), not
      // wherever they happened to be standing — a new easel is news in the
      // living room, not in the bathroom they were brushing their teeth in.
      const home = kind.rooms[0] === 'bedroom' ? npc.residency?.room : kind.rooms[0];
      events.push({
        day: d, tick: getTickIndex(gs.meta.clock.minutes), roomId: home && ROOMS[home] ? home : null, npcId,
        type: 'project_started', moodDelta: 0.03, data: { project: started.kind },
        template: started.gift != null
          ? projPick(PROJECT_SECRET_LINES.session, npcId, started.n, 'start')
          : projFill(kind.start, kind, started.work),
        seenByPlayer: false,
      });
    }
  }
  return events;
}

function projRestDays(npcId, n, range) {
  const [a, b] = range;
  return a + (projHash(npcId, n, 'rest') % (b - a + 1));
}

// Into the history, with the next start scheduled.
function projClose(person, p, status, day, npcId, extra) {
  const T = PROJECT_TUNING;
  person.history = [...(person.history || []), { kind: p.kind, work: p.work, status, day, days: Math.max(1, day - p.startedDay), ...(extra || {}) }].slice(-T.historyCap);
  person.active = null;
  person.nextStartDay = day + projRestDays(npcId, p.n, status === 'finished' ? T.restAfterFinish : T.restAfterAbandon);
}

function projSkill(gs, npcId, interest, amount) {
  const intr = (gs.npcs?.[npcId]?.bible?.interests || []).find(i => i?.name === interest);
  if (intr) intr.skill = Math.max(0, Math.min(100, (typeof intr.skill === 'number' ? intr.skill : 0) + amount));
}

function projectAbandon(gs, npcId, person, day) {
  const p = person.active;
  const kind = projKind(p);
  if (!p || !kind) return null;
  projSkill(gs, npcId, p.interest, PROJECT_TUNING.skillOnAbandon);
  projClose(person, p, 'abandoned', day, npcId, p.gift != null ? { gift: true } : null);
  return {
    day, tick: getTickIndex(gs.meta.clock.minutes), roomId: p.lastRoom || null, npcId,
    type: 'project_abandoned', moodDelta: -0.06, data: { project: p.kind },
    template: p.gift != null
      ? '{name} quietly gave up on something, and would rather not talk about it.'
      : projFill(kind.abandon, kind, p.work),
    seenByPlayer: false,
  };
}

// The tick pass (sim.js resolveTick, after the TV). Seeds anyone new and runs
// each resident's upkeep once per day, on the first tick of it the pass sees
// (catching up any days it missed, up to a fortnight). Never decides whether
// anyone works on anything — the drive does — and rolls nothing on the tick rng.
// `tickEvents` (this tick's newEvents, optional) is read only to tell the
// off-screen 'hobby' row with the person's real project. `minutesThisTick`
// scales the chance that someone reacts to practice they can hear.
function resolveProjectsTick(gs, npcUpdates, activeNpcIds, tickEvents, minutesThisTick) {
  const out = { events: [] };
  const clock = gs?.meta?.clock;
  if (!clock) return out;
  const day = clock.day;
  const w = ensureProjects(gs);
  for (const id of activeNpcIds || []) {
    if (!projIsResident(gs, id)) continue;
    const person = w.people[id] || projSeedPerson(gs, w, id, day);
    if (typeof person.dayDone !== 'number' || person.dayDone >= day) { if (typeof person.dayDone !== 'number') person.dayDone = day; continue; }
    for (let d = Math.max(person.dayDone + 1, day - 13); d <= day; d++) {
      for (const evt of projectDailyUpkeep(gs, id, person, d)) out.events.push(evt);
    }
    person.dayDone = day;
  }
  projectNameTheHobby(gs, tickEvents);
  projectHearAboutIt(gs, tickEvents, day);
  for (const evt of projectPracticeNoise(gs, npcUpdates, activeNpcIds, day, clock.minutes, minutesThisTick || 30)) out.events.push(evt);
  for (const evt of projectShowsTonight(gs, npcUpdates, activeNpcIds, day, clock.minutes)) out.events.push(evt);
  return out;
}

// --- Booked dates (the user, 2026-09-24: "EVERYTHING that has a planned
// date/time should end up on the calendar") ----------------------------------
//
// A kind with an `event` books its date on reaching the final stage,
// PROJECT_TUNING.event.leadDays out (a project seeded already in its final
// stage books on its first tick). Never for a secret present. Mutates p.
function projBookEvent(p, kind, day) {
  if (!kind?.event || !p || p.gift != null || p.stage < 3 || typeof p.eventDay === 'number') return;
  p.eventDay = day + PROJECT_TUNING.event.leadDays;
}

// The show goes on: on (or, if the house slept through it, after) the booked
// day, from the kind's `at` minute — ready or not; three weeks of rehearsal
// or four days, it happens. The finish is the ordinary one (skill, the text
// if you weren't there and they like you), told where they are — or in the
// kind's own room if it's held at home (the screening, in the living room).
function projectShowsTonight(gs, npcUpdates, ids, day, minutes) {
  const events = [];
  const w = ensureProjects(gs);
  for (const id of ids || []) {
    if (!projIsResident(gs, id)) continue;
    const person = w.people[id];
    const p = person?.active;
    const kind = projKind(p);
    if (!kind?.event || p.gift != null) continue;
    projBookEvent(p, kind, day);
    if (typeof p.eventDay !== 'number' || day < p.eventDay || (day === p.eventDay && minutes < kind.event.at)) continue;
    const u = npcUpdates?.[id] || {};
    const npc = gs.npcs[id];
    const where = kind.event.room || (u.location !== undefined ? u.location : npc.location) || npc.residency?.room;
    const fin = projectFinish(gs, id, person, p, kind, where, day, getTickIndex(minutes));
    events.push(fin.event);
    if (fin.text && typeof processNpcImMessages === 'function') processNpcImMessages(gs, [{ npcId: id, text: fin.text }]);
  }
  return events;
}

// The calendar's rows (the Calendar app's Events tab, the Year grid's
// marks): every current roommate's booked show from today on, soonest first.
// Pure.
function projectCalendarEvents(gs) {
  const w = projectsRead(gs);
  const today = gs?.meta?.clock?.day || 1;
  const out = [];
  for (const [npcId, person] of Object.entries(w?.people || {})) {
    const p = person?.active;
    const kind = projKind(p);
    if (!kind?.event || p.gift != null || typeof p.eventDay !== 'number' || p.eventDay < today || !projIsResident(gs, npcId)) continue;
    out.push({ id: `proj_${npcId}_${p.n}`, day: p.eventDay, npcId, emoji: kind.event.emoji, when: kind.event.when,
      label: projFill(kind.event.label, kind, p.work).split('{name}').join(projName(gs, npcId)) });
  }
  return out.sort((a, b) => a.day - b.day || a.label.localeCompare(b.label));
}

// "🎤 Mira: open mic — Friday, 12th of Spring, Year 1 (evening, out)".
function projectEventRowLabel(row) {
  const date = typeof formatDate === 'function' ? formatDate(row.day) : `day ${row.day}`;
  return `${row.emoji} ${row.label} — ${date} (${row.when})`;
}

// Roommates keep each other going. The first chat of the day (npc_chat, the
// chat_with_roommate drive) between someone and a housemate with a project on
// the go lifts that project a little — never a secret present — and, if the
// chat raised no gossip topic, is told as the question it was ("Jonah asked
// Mira how things were going with the painting."), or, when it's the talker's
// own project, the monologue ("…told Mira all about the scarf."). Later chats
// that day keep their ordinary line: measured, rewriting every chat turned 63
// of 64 into project talk. Reads this tick's events; the chat itself was the
// drive's call. "Things were going" so the verb agrees with a plural thing
// (the cherry tomatoes, the charts).
function projectHearAboutIt(gs, tickEvents, day) {
  const T = PROJECT_TUNING;
  for (const evt of tickEvents || []) {
    if (!evt || evt.type !== 'npc_chat') continue;
    const a = evt.npcId, b = evt.data?.other;
    if (!projIsResident(gs, a) || !projIsResident(gs, b)) continue;
    const pb = projActive(gs, b), pa = projActive(gs, a);
    const whose = (pb && projKind(pb) && pb.gift == null) ? b : ((pa && projKind(pa) && pa.gift == null) ? a : null);
    if (!whose) continue;
    const p = projActive(gs, whose);
    const kind = projKind(p);
    if (p.chatDay === day) continue;
    p.chatDay = day;
    p.engagement = Math.min(1, p.engagement + T.chatEncourage);
    if (p.engagement >= T.workThreshold) p.dustSince = null;
    // Chats are rare (about one every two or three days a house) so nearly
    // every one is a day's first: tell only about half as project talk, from
    // a few lines, so "chatting in the living room" doesn't vanish.
    const h = projHash(a, b, day, evt.tick, 'chat');
    if (!evt.data?.topic && h % 2 === 0) {
      const pool = whose === b ? PROJECT_CHAT_LINES.asked : PROJECT_CHAT_LINES.told;
      evt.template = projFill(pool[(h >>> 1) % pool.length], kind, p.work);
      evt.data = { ...(evt.data || {}), projectTold: p.kind };
    }
  }
}

// --- Practice the flat can hear (the user asked for drama, 2026-09-24) -----
//
// A roommate at a noisy kind's activity (PROJECT_TUNING.noise.kinds: guitar,
// DJ) emits the 'practice' sound where they are, every tick they're at it,
// unless you've asked for quiet today. Anyone else awake who hears it
// (perceiveSignals: distance, doors, headphones) may react, once a day each:
// complain — through the wall, or to their face — or, if it's getting good
// and they like them, stop to listen. Everything reads the FINAL tick state
// and rolls its own seededRng stream.

// Event lines. {name} is the listener (opening the line, once), {other} the
// practiser; past tense and no they/their, because Chatter posts events in
// the first person.
const PROJECT_PRACTICE_LINES = {
  complain: [
    '{name} banged on the wall and yelled at {other}: "Same four bars! AGAIN!"',
    '{name} shouted through the wall at {other}: "Headphones exist!"',
    '{name} texted {other} a single word: "headphones".',
    '{name} yelled "some of us are trying to THINK" in the general direction of {other}.',
  ],
  escalate: [
    '{name} banged on the wall, and {other} answered by playing louder.',
    '{name} asked {other} to keep it down and got it turned UP in reply.',
  ],
  complainHere: [
    "{name} asked {other} to give it a rest, for everyone's sake.",
    '{name} put on headphones pointedly and stared at {other} until the playing stopped.',
  ],
  listen: [
    '{name} stopped outside the door to listen to {other} play for a minute.',
    '{name} caught a few bars of {other} practising and hummed along.',
    '{name} called "that sounds really good now!" through the wall to {other}.',
  ],
  listenHere: [
    '{name} sat and listened to {other} play for a while, and clapped at the end.',
    '{name} put everything down to listen to {other} play.',
  ],
};

// How loud this project is right now: the kind's noise × the stage's factor
// (the stop-start early stages are the worst). 0 for a quiet kind. Pure.
function projPracticeIntensity(p) {
  const N = PROJECT_TUNING.noise;
  const base = N.kinds[p?.kind] || 0;
  return Math.min(1, base * (N.stageFactor[Math.max(0, Math.min(3, p?.stage || 0))] || 1));
}

// How one roommate feels about another, from the cast web (directional). Pure.
function projFeelings(gs, fromId, toId) {
  const key = [fromId, toId].sort().join('|');
  const ax = gs?.world?.castWeb?.[key]?.axes?.[`${fromId}→${toId}`] || {};
  return { affection: ax.affection || 0, tension: ax.tension || 0 };
}

// Who is practising something noisy right now, where, and how loud: from the
// final tick state (npcUpdates over the npc record). Skips anyone you've asked
// for quiet today and any secret present. Pure.
function projPractisers(gs, npcUpdates, ids, day) {
  const out = [];
  for (const id of ids || []) {
    if (!projIsResident(gs, id)) continue;
    const p = projActive(gs, id);
    const kind = projKind(p);
    if (!kind || p.gift != null || p.hushedDay === day) continue;
    const u = npcUpdates?.[id] || {};
    const npc = gs.npcs[id];
    const location = u.location !== undefined ? u.location : npc.location;
    const activity = u.activity !== undefined ? u.activity : npc.activity;
    const intensity = projPracticeIntensity(p);
    if (location && activity === kind.activity && intensity > 0) out.push({ id, location, intensity, p });
  }
  return out;
}

// Emit, then let the flat react. Returns this tick's events.
function projectPracticeNoise(gs, npcUpdates, ids, day, minutes, minutesThisTick) {
  const N = PROJECT_TUNING.noise;
  const events = [];
  const practisers = projPractisers(gs, npcUpdates, ids, day);
  if (!practisers.length) return events;
  for (const pr of practisers) {
    if (typeof emitTransient === 'function') emitTransient(gs, { id: 'practice', roomId: pr.location, intensity: pr.intensity, sourceId: pr.id });
  }
  if (typeof perceiveSignals !== 'function') return events;
  const w = ensureProjects(gs);
  if (!w.heard || typeof w.heard !== 'object') w.heard = {};
  const tick = getTickIndex(minutes);
  const chance = chanceOverMinutes(N.reactChancePerMinute, minutesThisTick);
  for (const lid of ids || []) {
    if (!projIsResident(gs, lid) || w.heard[lid] === day || practisers.some(pr => pr.id === lid)) continue;
    const u = npcUpdates?.[lid] || {};
    const listener = gs.npcs[lid];
    const location = u.location !== undefined ? u.location : listener.location;
    const activity = u.activity !== undefined ? u.activity : listener.activity;
    if (!location || (typeof npcIsAsleep === 'function' && npcIsAsleep({ activity }))) continue;
    let heard = 0;
    for (const rec of perceiveSignals(gs, lid, location)) if (rec.signalId === 'practice' && rec.intensity > heard) heard = rec.intensity;
    if (heard < N.hearAt) continue;
    const r = seededRng(gs.meta?.seed, `proj_hear_${day}_${minutes}_${lid}`);
    if (r() >= chance) continue;
    // Who's playing: someone in this room first, else the loudest.
    const pr = practisers.find(x => x.location === location) || practisers.slice().sort((a, b) => b.intensity - a.intensity)[0];
    const here = pr.location === location;
    const t = projTemper(listener);
    const f = projFeelings(gs, lid, pr.id);
    const A = N.annoyance;
    const annoyance = A.base + (pr.p.stage <= 1 ? A.early : 0) - A.warmth * (t.warmth || 0) + A.volatility * (t.volatility || 0)
      + A.tension * f.tension - A.affection * f.affection + (minutes >= A.lateFrom ? A.lateNight : 0);
    // Across the open core there's no wall or door between them: drop the
    // lines that bang on one.
    const open = !here && projOpenPlan(location, pr.location);
    const pick = (list) => { const l = open ? list.filter(x => !/wall|door/.test(x)) : list; const use = l.length ? l : list; return use[Math.floor(r() * use.length)]; };
    const base = { day, tick, roomId: location, npcId: lid, seenByPlayer: false, data: { other: pr.id, project: pr.p.kind } };
    let evt = null;
    if (annoyance >= N.complainAt) {
      const defiant = !here && (projTemper(gs.npcs[pr.id]).assertiveness || 0) >= N.escalateAt;
      evt = { ...base, type: 'practice_complaint', moodDelta: -0.03,
        template: pick(here ? PROJECT_PRACTICE_LINES.complainHere : (defiant ? PROJECT_PRACTICE_LINES.escalate : PROJECT_PRACTICE_LINES.complain)) };
      const tension = defiant ? N.escalateTension : N.complainTension;
      if (typeof processNpcRelDeltas === 'function') processNpcRelDeltas(gs, [{ a: lid, b: pr.id, deltas: { tension } }, { a: pr.id, b: lid, deltas: { tension } }]);
      if (!defiant) pr.p.engagement = Math.max(0, pr.p.engagement - N.complainEngagement);
      projRemember(gs, npcUpdates, pr.id, day, `${projName(gs, lid)} complained about my practising${defiant ? ', so I played louder' : ''}.`, 'domestic', lid);
    } else if (pr.p.stage >= 2) {
      evt = { ...base, type: 'practice_listen', moodDelta: 0.03,
        template: pick(here ? PROJECT_PRACTICE_LINES.listenHere : PROJECT_PRACTICE_LINES.listen) };
      if (typeof processNpcRelDeltas === 'function') processNpcRelDeltas(gs, [{ a: lid, b: pr.id, deltas: { affection: N.listenAffection } }, { a: pr.id, b: lid, deltas: { affection: N.listenAffection } }]);
      pr.p.engagement = Math.min(1, pr.p.engagement + N.listenEngagement);
      projRemember(gs, npcUpdates, pr.id, day, `${projName(gs, lid)} stopped to listen to me practise. It sounded good.`, 'warmth', lid);
    }
    if (evt) { w.heard[lid] = day; events.push(evt); }
  }
  return events;
}

// Whether two rooms are the same open space: joined by open thresholds only
// (the kitchen, dining, living room, entry and both hallway mouths are one
// continuous space in this flat). Nothing to bang on between them. Pure.
function projOpenPlan(a, b) {
  if (!a || !b || a === b || typeof ROOM_THRESHOLDS !== 'object') return false;
  const seen = new Set([a]);
  const queue = [a];
  while (queue.length) {
    const r = queue.shift();
    for (const [k, v] of Object.entries(ROOM_THRESHOLDS)) {
      if (v !== 'open') continue;
      const [x, y] = k.split('|');
      const n = x === r ? y : (y === r ? x : null);
      if (!n || seen.has(n)) continue;
      if (n === b) return true;
      seen.add(n);
      queue.push(n);
    }
  }
  return false;
}

// A memory for someone other than an event's own subject, written so
// resolveBatch's rebuild keeps it: the tick's npcUpdates carry a pre-pass
// memory for anyone who acted this tick, and that copy would win the merge.
function projRemember(gs, npcUpdates, npcId, day, text, tag, otherId) {
  const npc = gs.npcs?.[npcId];
  if (!npc || typeof addMemoryEpisode !== 'function') return;
  const next = addMemoryEpisode(npc, day, text, MEMORY_IMPORTANCE.social, tag, [npcId, otherId].filter(Boolean));
  gs.npcs[npcId] = next;
  if (npcUpdates && npcUpdates[npcId]) npcUpdates[npcId].memory = next.memory;
}

// --- Yours: Bang on the Wall (from next door) / Ask for Quiet (in the room) ---

const PROJECT_HUSH_NOUNS = { guitar: { sound: 'The guitar', thing: 'guitar' }, dj: { sound: 'The beat', thing: 'controller' } };

// Who you'd be silencing: mode 'wall' — someone practising in ANOTHER room
// whose practice you can hear from here; mode 'here' — someone practising in
// this room. Not anyone you've already hushed today. Pure.
function projectHushTarget(gs, roomId, mode) {
  if (!roomId) return null;
  const day = gs?.meta?.clock?.day;
  const ids = Object.keys(gs.npcs || {}).filter(id => projIsResident(gs, id)).sort();
  const practisers = projPractisers(gs, null, ids, day).filter(pr => (mode === 'here' ? pr.location === roomId : pr.location !== roomId));
  if (!practisers.length) return null;
  if (mode === 'here') return practisers[0].id;
  if (typeof perceiveSignals !== 'function') return null;
  const heard = perceiveSignals(gs, 'player', roomId).filter(r => r.signalId === 'practice').reduce((m, r) => Math.max(m, r.intensity), 0);
  if (heard < PROJECT_TUNING.noise.hearAt) return null;
  return practisers.sort((a, b) => b.intensity - a.intensity)[0].id;
}

// Decided once in prepare: who, and the line. Pure.
function projectPlanHush(gs, roomId, mode) {
  const npcId = projectHushTarget(gs, roomId, mode);
  if (!npcId) return null;
  const p = projActive(gs, npcId);
  const nouns = PROJECT_HUSH_NOUNS[p.kind] || { sound: 'The noise', thing: 'it' };
  const name = projName(gs, npcId);
  // From the far side of a door you bang on the door; across the open core
  // (kitchen, dining, living room are one space) there's no wall to bang on,
  // so you shout; anywhere further off, it's the wall.
  const there = gs.npcs[npcId].location;
  const from = mode === 'here' ? null : ((typeof thresholdBetween === 'function' && thresholdBetween(roomId, there) === 'door') ? 'door' : (projOpenPlan(roomId, there) ? 'open' : null));
  const opener = from === 'door' ? `You bang on ${name}'s door.` : (from === 'open' ? 'You yell "Keep it DOWN!" across the flat.' : 'You bang on the wall.');
  const line = mode === 'here'
    ? `You ask ${name} to give it a rest for tonight. ${name} puts the ${nouns.thing} down, a bit stung.`
    : `${opener} ${nouns.sound} stops mid-bar. A long pause — then it starts up again, very, very quietly. ${name} heard you.`;
  return { npcId, mode, line };
}

// The PROJECT_HUSH effect's writer: quiet for the rest of the day, a knock to
// their heart, and they won't forget who asked.
function projectApplyHush(gs, npcId, mode) {
  const p = projActive(gs, npcId);
  const npc = gs?.npcs?.[npcId];
  if (!p || !npc) return false;
  const H = PROJECT_TUNING.noise.hush;
  const day = gs.meta.clock.day;
  if (p.hushedDay === day) return false;
  p.hushedDay = day;
  p.engagement = Math.max(0, p.engagement - H.engagement);
  let next = typeof applyRelDelta === 'function' ? applyRelDelta(npc, { tension: H.tension, affection: H.affection }, day) : npc;
  if (typeof addMemoryEpisode === 'function') {
    const text = mode === 'here' ? 'The player asked me to stop practising. Fair, probably. Still stung.' : 'The player told me to keep it down — loudly, mid-practice. Mortifying.';
    next = addMemoryEpisode(next, day, text, MEMORY_IMPORTANCE.social, 'domestic', ['player']);
  }
  gs.npcs[npcId] = next;
  return true;
}

// --- Jam Sessions (the user's name for joining in, 2026-09-24) -------------
//
// 45 minutes at it WITH them. Per kind: the player skill it trains, and two
// scenes — the early stages (0–1) and the late ones (2–3). {name} is the
// roommate (every occurrence is filled here), {work}/{noun} the project.
const PROJECT_JAM = {
  guitar: { skill: 'music', lines: [
    'You sit on the floor and {name} teaches you the three chords {work} is built on. Neither of you can change between them cleanly. It is the best half hour either of you has had all week.',
    '{name} plays {work} and you sing along, badly and then less badly. By the third time through you have found a harmony, and {name} cannot stop grinning.'] },
  dj: { skill: 'music', lines: [
    "{name} hands you the headphones and lets you try a transition. You trainwreck it spectacularly, and {name} has to sit down from laughing.",
    "You take turns on the decks, {name} running {work} and you on the effects button, and for a while {name}'s room is the best club in the city."] },
  painting: { skill: 'art', lines: [
    "You set up next to {name} with a spare brush and paint your own version of {work}. Yours is worse. {name} says it has 'energy'.",
    'You keep {name} company at the easel, handing over brushes and opinions. {name} takes about half of each, and {work} is better for it.'] },
  novel: { skill: 'writing', lines: [
    '{name} reads you a chapter of {work} and you talk it through for an hour — the characters, the twist, what happens to the dog. Nothing had better happen to the dog.',
    '{name} and you read the draft of {work} side by side, pencils out, arguing gently about commas. Three of your notes go in. {name} pretends the rest were already planned.'] },
  zine: { skill: 'writing', lines: [
    'You sit on the floor with {name}, a glue stick and a pile of old magazines, cutting out letters for {work}. You make a ransom note by accident.',
    'You help {name} lay out the last spreads of {work}. You suggest a headline. It goes in. You are unreasonably proud.'] },
  cold_case: { skill: 'focus', lines: [
    '{name} walks you through the {noun} at the corkboard and you play the sceptic. Then you notice something. Then you are both on the floor with the printouts.',
    'You and {name} test the theory about the {noun} out loud, back and forth, like detectives. It holds. You both go very quiet.'] },
  knitting: { skill: 'art', lines: [
    '{name} teaches you to cast on. Your first row is a disaster. Your second is only a mess. {name} is a very patient teacher.',
    'You knit a wobbly square of your own beside {name} and {work}. The needles click in stereo. It is the calmest you have felt in days.'] },
  sewing: { skill: 'art', lines: [
    'You hold pins while {name} fits the pattern for {work}, and learn more than you ever wanted to about grain lines.',
    '{name} fits {work} on you — for the proportions, apparently — and you stand very still, very carefully, full of pins.'] },
  baking: { skill: 'cooking', lines: [
    'You bake alongside {name}, a bowl each. Yours comes out flat. So does {name}\'s. You eat both and call it research.',
    'You and {name} work the dough together, taking turns, until the kitchen smells of it. {name} lets you be the one to take {work} out of the oven.'] },
  yoga: { skill: 'fitness', lines: [
    "You do the drills alongside {name} and discover muscles you did not know you had. Some of them hurt. {name} counts the breaths.",
    'You spot {name} going up into {work}, and then {name} spots you trying it. You manage a second. You will take it.'] },
  strength: { skill: 'fitness', lines: [
    'You train with {name}, taking turns and keeping count for each other. It is harder than it looks. Everything is.',
    'You spot {name} for a go at {work} and count out loud. {name} gets closer than ever, and you both yell.'] },
  photos: { skill: 'art', lines: [
    '{name} drags you round the flat hunting for a shot for {work} — the window, the stairwell, the kettle. You mostly hold things. It is fun anyway.',
    'You go through the prints for {work} with {name}, spread out on the floor, and argue about the order until it tells a story.'] },
  game_dev: { skill: 'tech', lines: [
    'You playtest {work} for {name}. You break it four times in ten minutes. {name} is delighted and takes notes.',
    '{name} watches you play {work}, pretending not to care. You get to the end. {name} cheers louder than you do.'] },
  speedrun: { skill: 'focus', lines: [
    "You keep the splits for {name}'s {work} practice, reading the times out like a race commentator. It makes the whole thing ten times more dramatic.",
    'You commentate a full run of {work} while {name} plays, completely over the top. {name} nearly misses a jump laughing.'] },
  short_film: { skill: 'art', lines: [
    'You hold a lamp, then a phone, then a very small part in {work}. You have one line. You say it wrong twice, and {name} keeps the second take anyway.',
    'You watch the cut of {work} with {name} and help find the ending. The room goes quiet at the last shot.'] },
  doorstop: { skill: 'writing', lines: [
    'You and {name} read {work} aloud, taking a character each. The voices get sillier as you go.',
    'You talk {work} through with {name} for an hour — who was right, who was wrong, who you would have been. Best book club in the building.'] },
  seedlings: { skill: 'focus', lines: [
    'You help {name} repot the seedlings and get soil everywhere. {name} names one after you. It is the smallest.',
    'You check the {work} with {name}, leaf by leaf, and find the first one nearly ripe. You both lean in like it might hear you.'] },
  birth_charts: { skill: 'social', lines: [
    '{name} sits you down for {work} and asks what time you were born. You do not know. A parent is texted. The answer is received with great seriousness.',
    '{name} reads you your chart properly. Some of it is uncanny. You pretend not to be impressed. {name} knows.'] },
  standup: { skill: 'social', lines: [
    "You are the test audience for {name}'s set. Some jokes land. Some really do not. You laugh at the right ones, which apparently is a skill.",
    '{name} runs the whole set for you, pauses and all. You laugh properly — the real kind — and then give notes, which are taken.'] },
  language: { skill: 'social', lines: [
    'You practise {work} with {name}, mostly pointing at things and saying them wrong together. You learn how to say "spoon".',
    'You hold a whole conversation in {work} with {name} — mostly {name}, some you. You order an entire imaginary dinner.'] },
  good_cause: { skill: 'social', lines: [
    'You help {name} make flyers and signs for {work}, markers everywhere. You are signed up for a shift before your first poster is dry.',
    'You work down the call list for {work} with {name}. By the end there is a van, a venue and one more volunteer: you.'] },
};

// Who in `roomId` you could jam with right now: a resident at their
// project's activity, not a secret present, not jammed with today, and not
// someone who can't stand you. Pure.
function projectJamTarget(gs, roomId) {
  if (!roomId) return null;
  const day = gs?.meta?.clock?.day;
  const J = PROJECT_TUNING.jam;
  for (const id of getPresentNpcIds(gs.npcs || {}, roomId).filter(x => projIsResident(gs, x)).sort()) {
    const npc = gs.npcs[id];
    const p = projActive(gs, id);
    const kind = projKind(p);
    if (!kind || p.gift != null || p.jamDay === day || npc.activity !== kind.activity || !PROJECT_JAM[p.kind]) continue;
    const rel = npc.relPlayer || {};
    if ((rel.tension || 0) - (rel.affection || 0) >= J.refuseAt) continue;
    return id;
  }
  return null;
}

// Decided once in prepare: who, which skill, and the scene. Pure.
function projectPlanJam(gs, roomId) {
  const npcId = projectJamTarget(gs, roomId);
  if (!npcId) return null;
  const p = projActive(gs, npcId);
  const kind = projKind(p);
  const jam = PROJECT_JAM[p.kind];
  const name = projName(gs, npcId);
  const line = projFill(jam.lines[p.stage >= 2 ? 1 : 0], kind, p.work).split('{name}').join(name);
  return { npcId, skill: jam.skill, line };
}

// The PROJECT_JAM effect's writer: heart, a step of progress (never past the
// end of a stage), warmth toward you, and a memory.
function projectApplyJam(gs, npcId) {
  const p = projActive(gs, npcId);
  const kind = projKind(p);
  const npc = gs?.npcs?.[npcId];
  if (!p || !kind || !npc) return false;
  const J = PROJECT_TUNING.jam;
  const day = gs.meta.clock.day;
  if (p.jamDay === day) return false;
  p.jamDay = day;
  p.engagement = Math.min(1, p.engagement + J.engagement);
  if (p.engagement >= PROJECT_TUNING.workThreshold) p.dustSince = null;
  const need = projStageNeed(kind, p.stage);
  if (p.stageSessions < need - 1) { p.stageSessions += 1; p.sessions += 1; }
  let next = typeof applyRelDelta === 'function' ? applyRelDelta(npc, { affection: J.affection, comfort: J.comfort }, day) : npc;
  if (typeof addMemoryEpisode === 'function') {
    next = addMemoryEpisode(next, day, `Had a jam session with the player on ${projFill('{thing}', kind, p.work)}. We should do that again.`, MEMORY_IMPORTANCE.social, 'warmth', ['player']);
  }
  gs.npcs[npcId] = next;
  return true;
}

// npc_chat told as project talk. {name} is the one who started the chat,
// {other} the housemate; {thing} is whose project it is — {other}'s when
// asked, {name}'s own when told.
const PROJECT_CHAT_LINES = {
  asked: [
    '{name} asked {other} how things were going with {thing}.',
    '{name} wanted a progress report on {thing}, and {other} gave a long one.',
    '{name} got {other} talking about {thing}.',
  ],
  told: [
    '{name} told {other} all about {thing}.',
    '{name} talked {other} through the latest on {thing}.',
  ],
};

// The off-screen 'hobby' event, told with what this person is actually into:
// their project (never named if it's your secret present), or between
// projects a hobby one of their own interests leads to. Rewrites the template
// in place and leaves the draw alone; an event with no resident, or a
// resident with no interest that leads anywhere, keeps its original line.
// No "their" in the new lines: Chatter tells events in the first person.
function projectNameTheHobby(gs, tickEvents) {
  for (const evt of tickEvents || []) {
    if (!evt || evt.type !== 'hobby' || evt.data?.project || !projIsResident(gs, evt.npcId)) continue;
    const p = projActive(gs, evt.npcId);
    const kind = projKind(p);
    let phrase = null;
    // The kind's `thing` ("the zine", "the training", "‘Harbour Lights’"),
    // not its label: a label carries asides ("making a zine, ‘Small Print’")
    // that read badly mid-sentence.
    if (kind && p.gift != null) phrase = 'a project nobody is allowed to see yet';
    else if (kind) phrase = projFill('{thing}', kind, p.work);
    else {
      const options = projInterestKinds(gs.npcs[evt.npcId]).map(o => PROJECT_HOBBY_PHRASES[o.kindId]).filter(Boolean);
      if (options.length) phrase = options[projHash(evt.npcId, evt.day, evt.tick, 'hobby') % options.length];
    }
    if (!phrase) continue;
    evt.template = `{name} spent some time on ${phrase}.`;
    evt.data = { ...(evt.data || {}), hobby: phrase, project: kind ? p.kind : null };
  }
}

// --- The drive (candidacy + resolver) -----------------------------------------------

// DRIVE_CANDIDACY.work_on_project (cognition.js): a resident at home with a
// project they're still into. Pure.
function projectDriveCandidate(npc, npcId, gs, ctx) {
  if (!ctx?.location || !projIsResident(gs, npcId)) return false;
  const p = projActive(gs, npcId);
  return !!(p && projKind(p) && p.engagement >= PROJECT_TUNING.workThreshold);
}

// Where they do it: stay if they're already somewhere the kind happens, else a
// room from its list (own bedroom for 'bedroom'), capacity-aware and weighted by
// the weather for the balcony — the moveToRoom rule resolveStandardDrive uses.
function projectPickRoom(gs, npc, kind, location, rng) {
  const own = npc.residency?.room;
  const rooms = kind.rooms.map(r => (r === 'bedroom' ? own : r)).filter(Boolean);
  if (location && rooms.includes(location)) return location;
  const candidates = rooms.filter(r => ROOMS[r] && (ROOMS[r].type !== 'bedroom' || r === own)
    && (typeof npcCommonRoomAccessible !== 'function' || npcCommonRoomAccessible(r) || r === own));
  const weighted = candidates.map(roomId => {
    const occ = getPresentNpcIds(gs.npcs, roomId).length;
    const w = occ >= (ROOMS[roomId].capacity || 1) ? 1 / SCENE.crowdAvoidanceWeight : 1;
    const wx = typeof roomWeatherWeight === 'function' ? roomWeatherWeight(gs, roomId) : 1;
    return { roomId, weight: w * wx };
  }).filter(c => c.weight > 0);
  if (weighted.length) return weightedPick(rng, weighted, c => c.weight).roomId;
  return own && ROOMS[own] ? own : location;
}

// How likely this session is to go nowhere. Pure.
function projBadChance(npc, p) {
  const B = PROJECT_TUNING.bad;
  const t = projTemper(npc);
  let v = B.base + (p.stage === 2 ? B.hardStage : 0) + B.volatility * (t.volatility || 0)
    - B.conscientiousness * (t.conscientiousness || 0) - ((npc.mood ?? 0) > 0.3 ? B.goodMood : 0);
  return Math.max(B.min, Math.min(B.max, v));
}

// The isProjectDrive resolver (drives.js evaluateDrives). One session: the
// drive's effects, the room, the activity, progress (or not), and the event —
// a milestone or the finish replaces the ordinary session line. Returns the
// shape the other custom resolvers return, or null (no project).
function tryWorkOnProject(npc, npcId, resolved, gs, rng, drive) {
  const person = projPerson(gs, npcId);
  const p = person?.active;
  const kind = projKind(p);
  if (!p || !kind) return null;
  const T = PROJECT_TUNING;
  const day = gs.meta.clock.day;
  const minutes = gs.meta.clock.minutes;
  const tick = getTickIndex(minutes);

  const effCtx = buildEffectContext(gs, [npcId], [npcId], {}, []);
  applyEffects((drive?.effects || []).map(eff => (eff.params && eff.params.who === 'self' ? { ...eff, params: { ...eff.params, who: npcId } } : eff)), effCtx);

  const room = projectPickRoom(gs, npc, kind, resolved.location, rng);
  const r = seededRng(hashStr(npcId), `proj_session_${p.n}_${p.sessions}_${p.bad}_${day}_${minutes}`);
  const bad = r() < projBadChance(npc, p);
  const secret = p.gift != null;
  const base = { day, tick, roomId: room, npcId, seenByPlayer: false, data: { project: p.kind } };
  const events = [];
  const imMessages = [];
  p.lastDay = day;
  p.lastRoom = room;

  if (bad) {
    p.bad += 1;
    p.engagement = Math.max(0, p.engagement - T.badSession * (1 + Math.max(0, projTemper(npc).volatility || 0)));
    events.push({ ...base, type: 'project_session', moodDelta: -0.02,
      template: secret ? projPick(PROJECT_SECRET_LINES.session, npcId, p.n, p.sessions, 'bad') : projFill(projPick(kind.bad, npcId, p.n, p.bad), kind, p.work) });
  } else {
    p.sessions += 1;
    p.stageSessions += 1;
    p.engagement = Math.min(1, p.engagement + T.goodSession);
    projBookEvent(p, kind, day);
    if (p.stageSessions >= projStageNeed(kind, p.stage)) {
      if (p.stage >= 3 && kind.event && p.gift == null) {
        // Ready, and the show is booked: keep rehearsing until the date —
        // the finish is the tick pass's, on the day (projectShowsTonight).
        p.stageSessions = projStageNeed(kind, p.stage);
        events.push({ ...base, type: 'project_session', moodDelta: drive?.eventMood || 0.03,
          template: projFill(projPick(kind.session[3], npcId, p.n, p.sessions), kind, p.work) });
      } else if (p.stage >= 3) {
        const fin = projectFinish(gs, npcId, person, p, kind, room, day, tick);
        events.push(fin.event);
        if (fin.text) imMessages.push({ npcId, text: fin.text });
      } else {
        const done = p.stage;
        p.stage += 1;
        p.stageSessions = 0;
        projBookEvent(p, kind, day);
        p.engagement = Math.min(1, p.engagement + T.milestone);
        projSkill(gs, npcId, p.interest, T.skillPerMilestone);
        events.push({ ...base, type: 'project_milestone', moodDelta: 0.08,
          template: secret ? projPick(PROJECT_SECRET_LINES.session, npcId, p.n, p.sessions) : projFill(kind.milestone[done], kind, p.work) });
      }
    } else {
      const lines = kind.session[p.stage] || kind.session[0];
      events.push({ ...base, type: 'project_session', moodDelta: drive?.eventMood || 0.03,
        template: secret ? projPick(PROJECT_SECRET_LINES.session, npcId, p.n, p.sessions) : projFill(projPick(lines, npcId, p.n, p.sessions), kind, p.work) });
    }
  }
  if (p.engagement >= T.workThreshold) p.dustSince = null;
  return { activityOverride: kind.activity, locationOverride: room && room !== resolved.location ? room : null, events, imMessages };
}

// Done. Skill for real, the work up on a wall (or on your bed, if it was for
// you all along), and a text if you weren't there for it and they like you.
function projectFinish(gs, npcId, person, p, kind, room, day, tick) {
  const T = PROJECT_TUNING;
  const w = ensureProjects(gs);
  const npc = gs.npcs[npcId];
  const player = gs.player || {};
  projSkill(gs, npcId, p.interest, kind.skillGain || 8);
  const gift = p.gift != null && Array.isArray(kind.gifts) ? kind.gifts[p.gift] : null;
  const base = { day, tick, npcId, seenByPlayer: false, data: { project: p.kind } };
  let event;
  if (gift) {
    const inPerson = player.location && player.location === room && player.flags?._vulnerableState !== 'sleeping';
    // The present is a real item in your bag — wearable if it's clothing,
    // a keepsake if not — through the same trusted SPAWN_ITEM the kitchen
    // uses, and straight into the bag even when you weren't there, the way
    // the gift drive's MOVE_ITEM already delivers (drives.js tryGiveGift).
    // meta.title makes it read "Hand-Knit Scarf: from Mira" (stackLabel).
    const giver = npc.bible?.name || 'a roommate';
    if (gift.item && ITEM_DEFS[gift.item]) {
      const meta = JSON.stringify({ title: `from ${giver}`, madeBy: npcId, handmade: true, madeDay: day });
      applyEffects([{ type: 'SPAWN_ITEM', params: { defId: gift.item, qty: '1', to: 'player', metaJson: meta } }], buildEffectContext(gs, [npcId], [npcId], {}, []));
    }
    event = { ...base, type: 'project_gift', moodDelta: 0.12, importance: MEMORY_IMPORTANCE.significant,
      roomId: inPerson ? room : 'bedroom_player',
      template: inPerson
        ? `{name} hands you ${gift.given}. "I made it. For you. Obviously." That's what the secret project was, all these weeks.`
        : `On your bed: ${gift.given}, and a scrap of paper that says "from {name}". So that's what the secret project was. You tuck it into your bag.` };
  } else {
    event = { ...base, type: 'project_finished', moodDelta: 0.15, roomId: room, template: projFill(kind.finish, kind, p.work) };
    if (kind.display && ROOMS[kind.display.room]) {
      w.displayed = [{ npcId, kind: p.kind, work: p.work, day, room: kind.display.room }, ...w.displayed].slice(0, T.maxDisplayed);
    }
  }
  projClose(person, p, 'finished', day, npcId, gift ? { gift: true } : null);
  let text = null;
  const there = player.location && player.location === room;
  if (!gift && !there && (npc.relPlayer?.affection || 0) >= T.shareAffection) {
    const style = npc.bible?.speech?.textingStyle;
    const pool = (style && PROJECT_FINISH_TEXTS[style]) || PROJECT_FINISH_TEXTS.default;
    text = projFill(projPick(pool, npcId, p.n, 'text'), kind, p.work);
    // "{done}." opens a sentence ("did one strict pull-up.") — capitalised,
    // except for someone who texts in lowercase on purpose.
    if (style !== 'all-lowercase') text = text.charAt(0).toUpperCase() + text.slice(1);
  }
  return { event, text };
}

// --- What the player sees -----------------------------------------------------------------

// The roommate card and Look Around: "practising guitar (‘Harbour Lights’)" for
// someone doing their project's activity; the activity unchanged otherwise. Pure.
function projectActivityLabel(gs, npcId, activity) {
  const p = projActive(gs, npcId);
  const kind = projKind(p);
  if (!kind || !activity || activity !== kind.activity) return activity;
  if (p.gift != null) return `${activity} (${PROJECT_SECRET_LINES.label})`;
  const words = projWords(kind, p.work);
  return `${activity} (${kind.wording === 'the' ? words.a_work : words.work})`;
}

// Look Around: finished work on display in this room (a current resident's, or
// anything made for you), and a project gathering dust where they last left it.
// Pure; returns lines with names filled.
function projectRoomLines(gs, roomId) {
  const w = projectsRead(gs);
  if (!w || !roomId) return [];
  const out = [];
  for (const d of w.displayed || []) {
    if (d.room !== roomId) continue;
    const kind = PROJECT_KINDS[d.kind];
    if (!kind) continue;
    const name = projName(gs, d.npcId);
    // A present from before they became real items (round 1 saves) still
    // reads where it was left; new presents go in your bag instead.
    if (d.gift) { if (d.gift.place) out.push(`The ${d.gift.short} ${name} made you is ${d.gift.place}.`); }
    else if (projIsResident(gs, d.npcId) && kind.display) out.push(projFill(kind.display.line, kind, d.work).replace('{name}', name));
  }
  for (const [npcId, person] of Object.entries(w.people || {})) {
    const p = person?.active;
    const kind = projKind(p);
    if (!kind || p.gift != null || p.dustSince == null || p.lastRoom !== roomId || !projIsResident(gs, npcId)) continue;
    const name = projName(gs, npcId);
    let line = projFill(kind.dusty, kind, p.work).replace('{name}', name);
    // Its owner is right here: they saw you look at it. (Asleep, they didn't.)
    const owner = gs.npcs[npcId];
    if (owner.location === roomId && !(typeof npcIsAsleep === 'function' && npcIsAsleep(owner))) {
      line += ' ' + PROJECT_SHEEPISH_LINES[projHash(npcId, p.n, gs.meta?.clock?.day, 'sheepish') % PROJECT_SHEEPISH_LINES.length].replace('{name}', name);
    }
    out.push(line);
  }
  return out;
}

// House notes (housenotes.js's houseNoteMotives asks, at the kitchen fridge):
// the reasons a project gives someone to write one, read from stored state
// like every other motive there, never invented — a finish in the last
// recentEventDays ("breaking news: local roommate did one strict pull-up"),
// or a bake in this kitchen today ("the oven is spoken for"). Never for a
// secret present. Pure.
function projectNoteMotives(gs, npcId, day) {
  const person = projPerson(gs, npcId);
  if (!person || !projIsResident(gs, npcId)) return [];
  const out = [];
  const recent = (typeof HOUSE_NOTE_TUNING === 'object' && HOUSE_NOTE_TUNING.recentEventDays) || 1;
  const last = (person.history || [])[person.history.length - 1];
  const lastKind = last && PROJECT_KINDS[last.kind];
  if (lastKind && last.status === 'finished' && !last.gift && typeof last.day === 'number' && last.day <= day && day - last.day <= recent) {
    const done = projFill('{done}', lastKind, last.work);
    out.push({ motive: 'project_done', vars: { done, Done: done.charAt(0).toUpperCase() + done.slice(1) } });
  }
  const p = person.active;
  if (p && p.kind === 'baking' && p.gift == null && p.lastDay === day && p.lastRoom === 'kitchen') {
    out.push({ motive: 'project_baking', vars: { work: projWords(PROJECT_KINDS.baking, p.work).work } });
  }
  return out;
}

// Look Around, with a dusty project's owner in the room. {name} is the owner.
const PROJECT_SHEEPISH_LINES = [
  '{name} sees you notice it and suddenly finds something else very interesting to look at.',
  '"I\'m getting back to that," {name} says, to nobody in particular.',
  '{name} follows your eyes to it, winces, and changes the subject.',
];

// [Project] for the NPC block (llm.js buildNpcBlockV2): what, how far, how they
// feel about it, whether you asked, and what came before. Residents only.
function projectPromptLine(gs, npcId) {
  if (!projIsResident(gs, npcId)) return null;
  const person = projPerson(gs, npcId);
  if (!person) return null;
  const day = gs?.meta?.clock?.day ?? 1;
  const name = projName(gs, npcId);
  const T = PROJECT_TUNING;
  const parts = [];
  const p = person.active;
  const kind = projKind(p);
  if (kind) {
    const daysIn = Math.max(1, day - p.startedDay);
    if (p.gift != null) {
      const gift = kind.gifts[p.gift];
      parts.push(`${name} is secretly making the player a present: ${gift.given} (${daysIn} days in, ${kind.stages[p.stage]}). They would be mortified to have it guessed and will deflect if asked what they're working on.`);
    } else {
      parts.push(`${name} is ${projFill(kind.label, kind, p.work)} (${daysIn} days in). Where it's at: ${kind.stages[p.stage]}.`);
      if (kind.event && typeof p.eventDay === 'number' && p.eventDay >= day) {
        const d = p.eventDay - day;
        parts.push(`The big day (${projFill(kind.event.what, kind, p.work)}) is ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`} — it's on the player's calendar.`);
      }
    }
    if (p.dustSince != null) parts.push(`Hasn't touched it in ${Math.max(1, day - p.lastDay)} days and is a bit sheepish about it.`);
    else if (p.engagement >= 0.7) parts.push('Fired up about it.');
    else if (p.bad >= 2 && p.engagement < 0.45) parts.push('Stuck and frustrated with it lately.');
    if (typeof p.encouragedDay === 'number' && day - p.encouragedDay <= 2) {
      parts.push(`The player asked about it ${p.encouragedDay === day ? 'today' : p.encouragedDay === day - 1 ? 'yesterday' : 'recently'}, and it meant something.`);
    }
  } else if (person.nextStartDay != null) {
    parts.push(`${name} is between projects at the moment.`);
  }
  const past = (person.history || []).slice(-2).reverse().map(h => {
    const k = PROJECT_KINDS[h.kind];
    if (!k) return null;
    if (h.gift) return h.status === 'finished' ? `made the player a gift (${k.gifts?.find(g => g.noun === h.work)?.short || h.work}) ${day - h.day} days ago` : null;
    const what = projFill(k.label, k, h.work);
    return h.status === 'finished' ? `finished ${what} ${day - h.day} days ago` : `gave up on ${what} ${day - h.day} days ago (a sore point)`;
  }).filter(Boolean);
  if (past.length) parts.push(`Before this: ${past.join('; ')}.`);
  if (!parts.length) return null;
  return `[Project]: ${parts.join(' ')}`;
}

// --- The player's Encourage (defs.actions.js's self.encourage_project) -------------------

// Who in `roomId` you could ask about their project today: a resident with one
// on the go you haven't asked about today, someone at it right now first. Pure.
function projectEncourageTarget(gs, roomId) {
  if (!roomId) return null;
  const day = gs?.meta?.clock?.day;
  const here = getPresentNpcIds(gs.npcs || {}, roomId).filter(id => projIsResident(gs, id)).sort();
  let best = null;
  for (const id of here) {
    const npc = gs.npcs[id];
    if (typeof npcIsAsleep === 'function' && npcIsAsleep(npc)) continue;
    const p = projActive(gs, id);
    const kind = projKind(p);
    if (!kind || p.encouragedDay === day) continue;
    const atIt = npc.activity === kind.activity;
    if (!best || (atIt && !best.atIt)) best = { npcId: id, atIt };
  }
  return best;
}

// Decided once in prepare, so the effect and the line can't disagree: who, and
// the line for where their project is right now (before the lift). Pure.
function projectPlanEncourage(gs, roomId) {
  const t = projectEncourageTarget(gs, roomId);
  if (!t) return null;
  const p = projActive(gs, t.npcId);
  const kind = projKind(p);
  const name = projName(gs, t.npcId);
  const day = gs.meta.clock.day;
  let line;
  if (p.gift != null) line = PROJECT_SECRET_LINES.show.replace('{name}', name);
  else if (p.dustSince != null) {
    const idle = Math.max(1, day - p.lastDay);
    line = `You ask ${name} about ${projWords(kind, p.work).work}. They wince — they haven't touched it in ${idle} day${idle === 1 ? '' : 's'}. But by the end of the conversation they're talking about it again, and there's a look on their face you haven't seen in a while.`;
  } else {
    const lead = t.atIt ? '' : `You ask ${name} how it's going. `;
    line = lead + projFill(kind.show[p.stage] || kind.show[0], kind, p.work).replace('{name}', name);
  }
  return { npcId: t.npcId, line };
}

// The PROJECT_ENCOURAGE effect's writer (effects.js): being asked about it
// genuinely helps — engagement, a little warmth toward you, and they remember.
function projectApplyEncourage(gs, npcId) {
  const p = projActive(gs, npcId);
  const kind = projKind(p);
  const npc = gs?.npcs?.[npcId];
  if (!p || !kind || !npc) return false;
  const T = PROJECT_TUNING;
  const day = gs.meta.clock.day;
  if (p.encouragedDay === day) return false;
  p.encouragedDay = day;
  p.engagement = Math.min(1, p.engagement + T.encourage.engagement);
  if (p.engagement >= T.workThreshold) p.dustSince = null;
  let next = typeof applyRelDelta === 'function' ? applyRelDelta(npc, { affection: T.encourage.affection }, day) : npc;
  const what = p.gift != null ? 'the thing I\'m making (they don\'t know it\'s for them)' : projFill('{thing}', kind, p.work);
  if (typeof addMemoryEpisode === 'function') {
    next = addMemoryEpisode(next, day, `The player asked how things were going with ${what} — and actually listened.`, MEMORY_IMPORTANCE.social, 'warmth', ['player']);
  }
  gs.npcs[npcId] = next;
  return true;
}
// ===== /SECTION: PROJECTS =====
