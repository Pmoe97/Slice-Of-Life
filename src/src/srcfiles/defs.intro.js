// ===== SECTION: DEFS.INTRO =====
// The opening cutscene, as data. `INTRO_BEATS` is the whole script; the
// player function lives in STUDIO (playIntroCutscene).
//
// --- Why these images are not generated ---
// Every other image in this game comes from root.generateImage against a
// prompt built from live state. These do not. They are PREGENERATED and
// identical for every player, hosted wherever `image` points, because the
// framing is the content: each shot is composed to obscure the protagonist —
// hands, silhouettes, over-the-shoulder, objects on tables — so that one set
// of art is truthful for every body the Player Design studio can build. A
// generated intro would have to draw the player, and drawing the player is
// exactly what these shots are designed to avoid.
//
// --- Filling in the art ---
// `image` is a URL string. Any origin works, and so does a data: URI, so the
// hosting decision stays open. A beat whose `image` is blank — or whose URL
// fails to load — renders as a text-only card and the sequence plays on. That
// is the DESIGNED degradation, not a fallback bolted on: the script has to be
// playable before the art exists, or the art blocks the feature.
//
// --- Interpolation ---
// `{name}` and `{surname}` resolve against the confirmed studio draft.
// `Julius {surname}` is the grandfather — his identity is derived from the
// player's rather than authored separately, which is why the studio asks for
// a surname at all.
//
// `speaker` labels who is talking: 'lawyer', 'player', or null for a caption
// or stage direction (rendered in italic, without a name).

// --- The art direction ---
//
// THEME: a small life, interrupted. The colour arc is the story — you do not
// start warm, you start grey, and the warmth is the promise at the end. Five
// grades across sixteen beats (see INTRO_ART.grades): the cramped fluorescent
// present, the chiaroscuro of the lawyer at the door, the overcast journey,
// the tower glowing gold as the one deliberate early warm beat, and finally
// the game's own palette arriving through dust.
//
// The arc is therefore NOT strictly monotonic, and that is authored rather
// than accidental: `promise` warms early and the elevator drops back to
// `passage` behind it. dev/verify/verify-intro.js asserts exactly that shape
// — coldest first, warmest last, and no step backwards except off a declared
// early-warm beat.
//
// FRAMING: anonymity by CONSTRUCTION, not by asking. Every shot is composed so
// there is no face to draw in the first place — six techniques, rotated, each
// tagged on the beat as `shot`:
//
//   SILHOUETTE  a dark shape against a brighter field; features lost to
//               contrast, not to a negative prompt
//   HANDS       forearms entering frame; sleeves and low-key light keep skin
//               tone ambiguous
//   POV         what the player sees, so the player is the camera
//   OBJECT      no person in frame at all
//   OTS         from behind, head cropped by the frame edge
//   EXTERIOR    landscape or architecture; no person
//
// The one honest limitation: HANDS shots do show skin. No framing eliminates
// that. The mitigation is sleeves plus low-key/rim lighting, which makes tone
// ambiguous rather than absent — it is a reduction, not a solution.
//
// STYLE IS DELIBERATELY NOT PART OF THE BEAT. Each beat's `prompt` carries
// subject and composition only. The look lives in INTRO_ART.styleTail, one
// swappable constant, because the game is getting a player-facing global style
// picker: the beats are permanent and the style is not. Regenerating this reel
// in a second style means editing ONE string and re-running the sixteen — not
// rewriting sixteen prompts. It is also why the framing above matters twice
// over: a high-contrast silhouette or a pair of hands sits credibly next to
// cel-shading, watercolour or photoreal alike, in a way a rendered face never
// would, so a shared reel stays defensible under a style it was not drawn for.

const INTRO_ART = {
  // THE SWAPPABLE HALF. Everything about how it looks, nothing about what it
  // shows. Today this tracks MENU_ART.styleTail's cel-shaded house look, minus
  // its "cozy" and "warm color grade" terms — the intro's grade is per-act and
  // supplied by INTRO_ART.grades, and "cozy" is the wrong register for the
  // first eleven beats entirely.
  styleTail: 'cel-shaded slice-of-life anime illustration, clean confident linework, '
    + 'cinematic composition, strong directional lighting, atmospheric depth, '
    + 'highly detailed background, subtle film grain, masterpiece, best quality',

  // MENU_ART's list (hands are the model's weak point and this reel is full of
  // them) plus the anonymity terms, which are the ones doing real work here:
  // a diffusion model's default behaviour is to centre a face, and every one
  // of these shots is a bet against that. 'child' is unconditional, as it is
  // everywhere else in this codebase.
  negativePrompt: 'face, facial features, visible face, portrait, headshot, looking at viewer, '
    + 'eye contact, front-facing person, character portrait, close-up on head, '
    + 'blurry, low quality, deformed, disfigured, bad anatomy, bad hands, bad fingers, '
    + 'mutated hands, malformed hands, poorly drawn hands, extra fingers, missing fingers, '
    + 'fused fingers, too many fingers, six fingers, extra digit, missing digit, '
    + 'extra limbs, extra arms, disconnected limbs, malformed limbs, bad proportions, '
    + 'text, watermark, signature, jpeg artifacts, oversaturated, flat colors, '
    + 'cropped, out of frame, child',

  // The colour arc, applied per beat via `grade`. This is the Stardew move:
  // the prologue is deliberately unlovely so that arriving somewhere golden —
  // even a filthy golden — lands as relief rather than as more of the same.
  grades: {
    // Beats 1-3. The life being left. Nothing here should look nice.
    cramped: 'cold desaturated palette, greenish fluorescent light, grey daylight through a dirty window, '
      + 'low contrast, claustrophobic framing, muted and joyless',
    // Beats 4-11. The lawyer. Near-black interior against a doorway too bright
    // to look into — the visual argument that this person is information you
    // cannot see the whole of.
    threshold: 'high-contrast chiaroscuro, near-black interior, blown-out white light from the doorway, '
      + 'deep shadows, hard rim lighting, dust motes suspended in the light beam',
    // Beats 12-15. The journey. Grey lifting, not yet warm.
    passage: 'overcast diffuse daylight, cool grey-blue palette, soft haze, '
      + 'muted colour slowly warming toward the horizon',
    // Beat 14 only. The building, deliberately warm. The journey's grey ends
    // here: the promise of the penthouse made visible on the stone before the
    // player ever steps inside. The one place the arc warms early.
    promise: 'warm golden late-afternoon sunlight, the carved stone glowing amber, '
      + 'rich but faded colour, hopeful and inviting, beautiful and badly neglected',
    // Beat 16. The game's real palette, arriving filthy. The warmth is genuine
    // and so is the neglect; the shot has to carry both or the premise breaks.
    arrival: 'warm golden afternoon light through grimy windows, dust hanging in sunbeams, '
      + 'rich but faded colour, peeling grandeur, beautiful and badly neglected',
  },
};

// Assemble a beat's full generation prompt: grade, subject, style. Kept as a
// function rather than sixteen pre-assembled strings for the same reason the
// style tail is one constant — change the tail or a grade and every prompt
// follows. Nothing in the shipped game calls this; it exists so the reel can
// be regenerated reproducibly, and `node -e` printing its output is how the
// sixteen prompts get out of the repo and into an image tool.
function buildIntroPrompt(beat) {
  if (!beat || !beat.prompt) return '';
  const grade = INTRO_ART.grades[beat.grade] || '';
  return [beat.prompt, grade, INTRO_ART.styleTail].filter(Boolean).join(', ') + '.';
}

const INTRO_BEATS = [
  {
    id: 'apartment',
    image: 'https://user.uploads.dev/file/bf30ef13d6df295b85bf02f350a2989d.jpg',
    shot: 'SILHOUETTE', grade: 'cramped',
    // The establishing shot has the hardest job in the reel: it must show the
    // protagonist without showing the protagonist. The hood does the work the
    // prompt once asked of a crop: up, it hides hair, profile and body shape
    // in one move, so the figure reads as anonymous rather than as a person
    // being kept hidden — which doubles as the thesis of the whole prologue,
    // that this life is unlit.
    prompt: 'A person wearing a grey hoodie with the hood pulled up, seen from absolutely directly behind, '
      + 'sitting at a computer desk at night, the camera looking straight at the back of the hood. '
      + 'The dark hooded back fills the center of the frame. '
      + 'The person is a completely featureless anonymous dark shape — no hair, no face, no profile, no skin, '
      + 'no hands, no body features visible anywhere, the hood and shoulders all the viewer can see. '
      + 'A bright computer screen faces the person directly in front of them, '
      + 'its pale glow haloing the silhouette from the edges. '
      + 'Instant noodle cups and energy drink cans on the cluttered desk, tangled cables, a sagging bookshelf, '
      + 'one small window showing only a brick wall an arm\'s length away',
    lines: [
      { speaker: null, text: 'A small apartment. One window, and it faces a wall.' },
      { speaker: null, text: 'You are at the keyboard, where you have been for hours.' },
    ],
  },
  {
    id: 'knock',
    image: 'https://user.uploads.dev/file/3b324d00d9a0e520922b4bb8444c9c12.jpg',
    shot: 'POV', grade: 'cramped',
    // Regenerated from a clean slate rather than composited: the previous pass
    // patched a window out of the door and the patch showed. The model draws a
    // window in almost every door, so the door is specified as a plain solid
    // apartment door with no glass, no window, no peephole light — said twice.
    prompt: 'Point-of-view shot from inside a small cramped apartment, looking straight down a short narrow '
      + 'entry hall at the closed front door. A completely plain solid apartment door with no window, '
      + 'no glass, no peephole light. Nobody in frame. '
      + 'Peeling paint on the walls, a loose security chain hanging down, a pile of unopened mail scattered on the floor. '
      + 'A hard sliver of cold hallway light spills under the door, broken by the dark shadow of a person standing on the other side',
    lines: [
      { speaker: null, text: 'Knock. Knock. Knock.' },
    ],
  },
  {
    id: 'knob',
    image: 'https://user.uploads.dev/file/af3b9d321c7a5fcfe7efd04046f40a7a.jpg',
    shot: 'HANDS', grade: 'cramped',
    // First HANDS shot, so it sets the convention the rest inherit: sleeve
    // pulled to the knuckles, light raking from one side. Both exist to keep
    // skin tone unreadable — see the limitation noted in the header. The
    // final image also picks a featureless modern lever bar for the hardware
    // so nothing in frame carries a style that could read as dated. The
    // anatomy is spelled out digit by digit — the model's default grip on a
    // lever bar comes out mangled.
    prompt: 'Extreme close-up of one human hand gripping a modern lever door handle from above. '
      + 'The handle a plain featureless horizontal stainless-steel bar bent at a clean right angle '
      + 'where it meets the door plate. Five separate normal fingers curl over the top of the bar, '
      + 'the thumb wraps around the far side of the bar, a natural relaxed grip, an anatomically correct '
      + 'hand with all five fingers clearly visible and correctly proportioned. '
      + 'A grey hoodie sleeve pulled over the wrist and the back of the hand so no skin shows above the knuckles, '
      + 'no body, shoulder or head in the frame. '
      + 'Raking side light leaves the hand in deep shadow, its skin tone unreadable. '
      + 'Cold desaturated palette, claustrophobic framing',
    lines: [
      { speaker: null, text: 'Your hand finds the knob.' },
    ],
  },
  {
    id: 'lawyer',
    image: 'https://user.uploads.dev/file/7bc8c42a08d30cc24f227e703c98af46.png',
    shot: 'SILHOUETTE', grade: 'threshold',
    // The image the whole prologue is built around. The lawyer is information
    // you cannot see the whole of — so they are drawn as pure contrast, and
    // the only detail that survives is the two discs of their glasses.
    prompt: 'View from inside a dark apartment through an open front door. '
      + 'Framed dead centre in the doorway stands a tall narrow figure in a long dark overcoat, '
      + 'rendered as a near-black featureless silhouette against blindingly bright hallway light behind them, '
      + 'a slim briefcase in one hand. '
      + 'The single detail that reads: two bright circular flares where their round spectacles catch the light. '
      + 'Backlit, no facial features visible at all',
    lines: [
      { speaker: null, text: 'A dark figure fills the doorway. Light catches their glasses and gives nothing else away.' },
      { speaker: 'lawyer', text: 'Hello. May I confirm that you are {name} {surname}?' },
      { speaker: 'player', text: '…Yes. That\'s me.' },
    ],
  },
  {
    id: 'will-intro',
    image: 'https://user.uploads.dev/file/1b046b2f1cf46765b44f5453a20b5bed.jpg',
    shot: 'OBJECT', grade: 'threshold',
    // Deliberately an object and not the lawyer again: two silhouette shots
    // back to back would read as one held frame rather than as a scene moving.
    prompt: 'Close-up of a worn leather briefcase opened flat on a small kitchen table, '
      + 'a thick sheaf of legal documents and a capped fountain pen inside, '
      + 'the lid casting a hard shadow across the contents. No people in frame. '
      + 'A shaft of bright light from off-frame falls across the papers',
    lines: [
      { speaker: 'lawyer', text: 'I am a representative of Zoro Zoro & Zoro. Our firm has the pleasure of representing the interests of the late Julius {surname}. I am here because you were named a beneficiary of his will.' },
    ],
  },
  {
    id: 'document',
    image: 'https://user.uploads.dev/file/b8b13905fb45e6264615e22fd1174a57.png',
    shot: 'OBJECT', grade: 'threshold',
    // THE ONE SHOT THAT DEPENDS ON LEGIBLE TEXT, and diffusion models are bad
    // at text — expect to composite the heading in afterwards. The body copy
    // is the opposite problem and needs no help: the script calls for
    // unreadable scribble, which is exactly what these models produce anyway.
    prompt: 'Overhead top-down shot of a formal legal document lying on a dark wood table, '
      + 'the heading "LAST WILL AND TESTAMENT" in large clear serif capitals across the top, '
      + 'the body beneath it dense illegible handwritten script trailing into meaningless scribble. '
      + 'An embossed wax seal in one corner, a fountain pen resting alongside. No people, no hands in frame',
    lines: [
      { speaker: null, text: 'A document lies open across the table. LAST WILL AND TESTAMENT, and beneath it, line after line you cannot read.' },
    ],
  },
  {
    id: 'holding',
    image: 'https://user.uploads.dev/file/0673f11543edf0518fdc123dde5274dd.jpg',
    shot: 'OTS', grade: 'threshold',
    // Moved off the hands-only convention to an over-the-shoulder framing:
    // the hood does the anonymity work (as in the apartment shot), and the
    // paper is drawn as the warmth the whole reel has been withholding — the
    // first golden thing in the threshold act.
    prompt: 'Three-quarters over-the-shoulder shot from behind the player, who wears a grey hoodie '
      + 'with the hood drawn tight, holding a single sheet of paper in both hands. '
      + 'Only the back of the hooded head (cut off by the frame edge), a shoulder and the hands are visible — no face. '
      + 'The paper glows warm golden, by far the brightest thing in the frame, its light spilling up onto the hands '
      + 'and the hoodie, against a cold blue-green-grey apartment in deep shadow',
    lines: [
      { speaker: null, text: 'It is heavier than paper should be.' },
      { speaker: 'lawyer', text: 'Your grandfather was quite a successful businessman. Unfortunately his fight against his illness consumed much of him, and much of his fortune. Still…' },
    ],
  },
  {
    id: 'pointing',
    image: 'https://user.uploads.dev/file/f1c33724446e5e9e2bb571dfb1390997.jpg',
    shot: 'OBJECT', grade: 'threshold',
    // The lawyer's hand, and a leather glove — which quietly solves the skin
    // tone problem for the one character who is not the player, and reinforces
    // that this person gives nothing away.
    prompt: 'Close-up of the document on the dark wood table, with a single gloved hand entering frame from the right, '
      + 'the index finger of a black leather glove resting deliberately on one paragraph. '
      + 'A dark overcoat sleeve and a plain cufflink at the wrist. '
      + 'Only the hand and forearm visible — no body, shoulder or head in frame',
    lines: [
      { speaker: 'lawyer', text: 'As you can see, he has left you his apartment in the city, as well as a small sum of cash.' },
      { speaker: 'lawyer', text: 'The apartment is a shadow of what it once was. Years of neglect and abuse have left it in an unfortunately sorry state.' },
      { speaker: 'lawyer', text: 'Your grandfather wished it go to you, in the hopes that you would be able to restore it. Breathe life back into it.' },
    ],
  },
  {
    id: 'keys',
    image: 'https://user.uploads.dev/file/9f0e45da6a4532e8691b604119b51f69.jpg',
    shot: 'HANDS', grade: 'threshold',
    // The keys are the brightest object in the reel, on purpose. This is the
    // hinge of the prologue and the only warm thing in the threshold act. The
    // pose that finally survived six rejected attempts: the hand reads as a
    // backlit dark shape, so its anatomy barely matters, while the keys lie
    // across the open palm and catch every watt of the raking light — which
    // reads, helpfully, as the moment the keys are passing into the player's
    // own hands.
    prompt: 'A black-gloved hand extended flat from a dark overcoat sleeve, palm up, '
      + 'the three silver keys lying across the open palm and fingers. '
      + 'Hard white light from off-frame rakes across the keys, which gleam brilliantly, '
      + 'the brightest objects in the frame. The glove is backlit and reads as a dark shape. '
      + 'Near-black interior, high-contrast chiaroscuro, dust motes hanging in the light beam',
    lines: [
      { speaker: null, text: 'A gloved hand holds out a set of keys. Silver, and brighter than anything else in the room.' },
    ],
  },
  {
    id: 'departure',
    image: 'https://user.uploads.dev/file/30639bec49d3dc8f26d348f8295b42ad.png',
    shot: 'SILHOUETTE', grade: 'threshold',
    // Mirrors the arrival shot deliberately: same doorway, same blown-out
    // light, figure reversed. The scene closes the frame it opened.
    prompt: 'View from inside the dark apartment toward the open front door. '
      + 'The tall coated figure is walking away from the viewer into the blindingly bright hallway, '
      + 'seen from behind as a receding near-black silhouette, briefcase in hand, '
      + 'already half dissolved into the glare. The doorway a hard white rectangle. '
      + 'No facial features, no face visible',
    lines: [
      { speaker: 'lawyer', text: 'Sorry — I must go. I have much work to do. I may be in touch in the future.' },
      { speaker: null, text: 'They step into the bright rectangle of the doorway and are gone.' },
    ],
  },
  {
    id: 'fist',
    image: 'https://user.uploads.dev/file/5ae356878ae47428d3bbc1572f95e0c3.jpg',
    shot: 'HANDS', grade: 'threshold',
    // Regenerated for the grip: the first pass held the keys in a loose, odd
    // clutch. The pass that worked keeps the ring and keys protruding from the
    // center of the fist between index and middle fingers, held in place by a
    // thumb crossing over the ring — a secure, unambiguous hold.
    prompt: 'Tight close-up of a single closed fist held at chest height, '
      + 'the fingers wrapped securely around a set of three modern silver keys, '
      + 'the key ring and the bow ends of the keys protruding firmly from the center of the fist '
      + 'between the index and middle fingers, knuckles tight, a grey hoodie sleeve at the wrist. '
      + 'A natural firm fist with all fingers clearly defined, correctly proportioned, no extra digits. '
      + 'Shot from the side against a dark out-of-focus interior. '
      + 'The keys catch a hard sliver of light. No head, face or shoulders in frame',
    lines: [
      { speaker: null, text: 'Your fist closes around the keys until the teeth bite.' },
    ],
  },
  {
    id: 'later',
    image: 'https://user.uploads.dev/file/60f06e02d9fccbb2d697e0b5381e72dd.jpg',
    caption: true,
    shot: 'EXTERIOR', grade: 'passage',
    // This one works genuinely well with NO art at all — a black title card is
    // a real cinematic device, and the cutscene's art-less layout centres the
    // text for exactly this. The prompt is here so it is a choice rather than
    // an absence; generate it or leave `image` blank, both are finished states.
    prompt: 'An empty two-lane road at grey dawn seen from a low angle, '
      + 'stretching away toward a hazy indistinct horizon. Utility poles receding into mist. '
      + 'No vehicles, no people, no buildings. Wide, still, and empty — negative space across the upper two thirds of the frame',
    lines: [
      { speaker: null, text: 'A few days later' },
    ],
  },
  {
    id: 'truck',
    image: 'https://user.uploads.dev/file/38ac992adb812c3c8bd7921d7a2da95d.jpg',
    shot: 'EXTERIOR', grade: 'passage',
    prompt: 'A small battered box moving truck driving away from the viewer down a highway, '
      + 'seen from behind and slightly to one side, its roller door strapped shut and the suspension sagging. '
      + 'A hazy city skyline rising ahead in the distance. Wide establishing shot, no people visible',
    lines: [
      { speaker: null, text: 'A moving truck works its way down the road, everything you own rattling in the back.' },
    ],
  },
  {
    id: 'building',
    image: 'https://user.uploads.dev/file/a82f60628255e2ad04e363c30901b646.jpg',
    shot: 'EXTERIOR', grade: 'promise',
    // The inheritance is a modern luxury tower, not a pre-war relic — the
    // grandeur is corporate glass and bronze, and the golden grade makes the
    // promise visible before the player ever steps inside. The few dark
    // windows and tarnished trim carry the "been left alone" half quietly.
    prompt: 'An ultra-tall modern luxury residential skyscraper seen from a dramatic low angle looking '
      + 'straight up its face, sleek corporate luxury architecture, floor-to-ceiling windows, '
      + 'a dark glass facade with bronze and gold accents, a few dark unlit windows and tarnished bronze '
      + 'trim hinting at age, but the bones are pure luxury. Imposing and refined in the same frame. No people',
    lines: [
      { speaker: null, text: 'The building is taller than you expected. Older, too — and it must have been magnificent once.' },
    ],
  },
  {
    id: 'elevator',
    image: 'https://user.uploads.dev/file/8009dadd98475c7b76b3bd45053bda34.png',
    shot: 'OBJECT', grade: 'passage',
    // Second text-dependent shot, and the reason the button reads "PH" rather
    // than "PENTHOUSE": two characters is inside what these models manage
    // reliably, and the narration says the word out loud anyway.
    prompt: 'Tight close-up of a sleek modern minimalist elevator control panel inside the car, '
      + 'a single vertical column of round floor buttons, the topmost button marked "PH" lit warm amber '
      + 'while every button below it stays dark. '
      + 'Brushed stainless steel and matte black, spotless. An inspection sticker in a clean frame. '
      + 'No people, no hands in frame',
    lines: [
      { speaker: null, text: 'Numbers climb on the elevator panel. The button at the top is already lit.' },
      { speaker: null, text: 'PENTHOUSE.' },
    ],
  },
  {
    id: 'entryway',
    image: 'https://user.uploads.dev/file/e4c055e03c3abbfd6c5f84231c1c3afa.jpg',
    shot: 'POV', grade: 'arrival',
    // The payoff, and the handoff: this is the first frame in the game's own
    // warm palette, and the last frame before the player takes control in this
    // very room. It has to be somewhere you would want to fix, not somewhere
    // you would want to leave.
    prompt: 'First-person point-of-view stepping through a just-opened door into a modern penthouse apartment. '
      + 'Very high ceilings, white walls with minor scuffs, floor-to-ceiling windows at the far end throwing long '
      + 'shafts of golden light, a pale wood floor, a stepladder, moving boxes and a few pieces of furniture '
      + 'draped in white dust sheets. Clean, empty, bare-bones but perfectly livable — really good bones, '
      + 'nothing broken, just waiting. No people in frame',
    lines: [
      { speaker: null, text: 'Not destroyed. But the air is stale, the paint is tired, and something somewhere is dripping.' },
      { speaker: 'player', text: 'Home sweet home, I guess.' },
    ],
  },
];

// ===== /SECTION: DEFS.INTRO =====
