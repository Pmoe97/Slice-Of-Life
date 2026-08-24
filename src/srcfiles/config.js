// ===== SECTION: CONFIG =====
// All tunable numbers, content flags, character schema, trait pools, schedule tables.
// Nothing magic outside this section.
// Apartment Expansion v2 — Mirrored H layout

// --- Content configuration: drama-first, mature themes not gated ---
const CONTENT_CONFIG = {
  tone: 'balanced',       // balanced|dramatic|comedic|romantic|intense
  contentFlags: {
    profanity: true,
    substance: true,
    romance: true,
    conflict: true,
    mature: true,         // no gating by design
  },
};

// --- Layout / rooms (The Mirrored H — 17 rooms) ---
// Bedrooms in the corners, two hallways (north/south) each with their own
// bathroom, common spaces bridging them. See src/ref/complete/apartment-expansion-plan.md
// for the full layout and adjacency graph.
// Floor plan + movement overhaul (src/ref/wip/floorplan-and-movement-plan.md).
// The hand-drawn plan is authoritative; the geometry below and in
// ROOM_LAYOUT/ROOM_THRESHOLDS came out of dev/mapper.html. Open that tool
// before editing any adjacency by hand — it is what proves every declared
// connection sits on a wall that actually exists.
//
// The shape, in one paragraph: an OPEN CORE (entry → living → dining →
// kitchen, with both hallways hanging off it, joined entirely by
// zero-threshold transitions) and every private room exactly one door off
// it. The east wing is the sole exception — behind one door at the Game
// Room, and internally looped.
//
// D3: bedroom ids keep their MEANING, not their position. `bedroom_1` moved
// from the south wing to the north; since `residency.room` stores the id,
// no save migration is needed and only `wing` changed.
const ROOMS = {
  // North wing — Hallway A. The good seats: the hallway opens onto the
  // Living Room, so these two are insulated from the kitchen.
  bedroom_player: { name: "Your Bedroom", capacity: 2, type: 'bedroom', isPlayer: true, wing: 'north' },
  bedroom_1:      { name: "Bedroom 1", capacity: 2, type: 'bedroom', wing: 'north' },
  hallway_a:      { name: "Hallway A", capacity: 4, type: 'common', wing: 'north' },
  bathroom_a:     { name: "Bathroom A", capacity: 1, type: 'common', wing: 'north' },

  // South wing — Hallway B. The cheap seats, and deliberately so (D7):
  // Hallway B opens onto the KITCHEN with no threshold between, so these
  // rooms sit downstream of cooking smell and clatter with one door in the
  // way. That asymmetry is the layout's, not an oversight.
  bedroom_2:      { name: "Bedroom 2", capacity: 2, type: 'bedroom', wing: 'south' },
  bedroom_3:      { name: "Bedroom 3", capacity: 2, type: 'bedroom', wing: 'south' },
  hallway_b:      { name: "Hallway B", capacity: 4, type: 'common', wing: 'south' },
  bathroom_b:     { name: "Bathroom B", capacity: 1, type: 'common', wing: 'south' },

  // The open core.
  entry:          { name: "Entry", capacity: 3, type: 'common', wing: 'center' },
  living_room:    { name: "Living Room", capacity: 6, type: 'common', wing: 'center' },
  dining:         { name: "Dining Room", capacity: 6, type: 'common', wing: 'center' },
  kitchen:        { name: "Kitchen", capacity: 4, type: 'common', wing: 'center' },

  // West service rooms — one door each, both off the open core.
  study:          { name: "Study", capacity: 2, type: 'common', wing: 'west' },
  laundry:        { name: "Laundry Room", capacity: 2, type: 'common', wing: 'west' },

  // East leisure wing. Entered ONLY through the Game Room (D14), which is
  // what makes that room a chokepoint everyone heading for the gym or the
  // pool passes through. Internally it is a circuit rather than a chain:
  // Game Room → Changing → Gym → Balcony → back, and Game Room → Pool →
  // Balcony → back.
  game_room:      { name: "Game Room", capacity: 4, type: 'common', wing: 'east' },
  changing_room:  { name: "Changing Room", capacity: 2, type: 'common', wing: 'east' },
  gym:            { name: "Gym", capacity: 2, type: 'common', wing: 'east' },
  balcony:        { name: "Balcony", capacity: 3, type: 'common', wing: 'east' },
  pool_room:      { name: "Pool Room", capacity: 4, type: 'common', wing: 'east' },
};

const COMMON_ROOMS = Object.keys(ROOMS).filter(id => ROOMS[id].type === 'common');
const ALL_ROOMS = Object.keys(ROOMS);

// A room's name with the right article in front of it. Eight narration sites
// wrote `the ${ROOMS[id].name}` by hand, which produced "the Your Bedroom"
// and "the Bedroom 2" — read past for a long time because the log rarely
// named a room, and impossible to miss once walking started narrating routes.
//
// Two names take no article: a designator name ("Bedroom 2", "Hallway B" —
// the number or letter makes it a proper noun) and the player's own room,
// which becomes possessive instead.
function roomPhrase(roomId) {
  const name = ROOMS[roomId]?.name || roomId;
  if (/^Your\b/.test(name)) return name.toLowerCase();
  if (/\s+([0-9]+|[A-Z])$/.test(name)) return name;
  return `the ${name}`;
}

// --- Room adjacency (The Mirrored H floor plan) ---
// First-class CONFIG constant — the authoritative spatial graph. Promoted
// from drives.js where it was only used for peep checks. isRoomAdjacent
// (drives.js) and the floor plan visual both read this.
// Symmetric: if A→B, B→A. Self-adjacency (A→A) is not listed.
// The MOVEMENT graph, and only the movement graph. `glass` edges are
// deliberately absent (D5): they carry sight and nothing else, and an NPC
// pathing through a window is precisely the bug that decision prevents.
// Generated by dev/mapper.html — regenerate there rather than hand-editing,
// so the map and this table cannot drift apart.
const ROOM_ADJACENCY_BASE = {
  bedroom_player: ['hallway_a'],
  hallway_a:      ['bedroom_player', 'bedroom_1', 'bathroom_a', 'living_room'],
  bedroom_1:      ['hallway_a'],
  gym:            ['changing_room', 'balcony'],
  bathroom_a:     ['hallway_a'],
  entry:          ['living_room'],
  living_room:    ['hallway_a', 'entry', 'dining', 'game_room'],
  changing_room:  ['game_room', 'gym'],
  game_room:      ['living_room', 'changing_room', 'balcony', 'pool_room'],
  balcony:        ['game_room', 'gym', 'pool_room'],
  pool_room:      ['game_room', 'balcony'],
  dining:         ['living_room', 'kitchen', 'study'],
  kitchen:        ['dining', 'laundry', 'hallway_b'],
  study:          ['dining'],
  laundry:        ['kitchen'],
  hallway_b:      ['kitchen', 'bedroom_2', 'bedroom_3', 'bathroom_b'],
  bathroom_b:     ['hallway_b'],
  bedroom_3:      ['hallway_b'],
  bedroom_2:      ['hallway_b'],
};

// --- Thresholds (floorplan plan, D4) ---
// What is actually BETWEEN two rooms. Adjacency says you can get there;
// this says what you pass through, which is a different question and the
// one the signal layer cares about.
//
//   'door'   a real door. Attenuates per channel, and can be locked.
//   'open'   a zero-threshold transition: NO WALL, NO BARRIER. The line
//            between the Kitchen and the Dining Room is imaginary — they
//            are one space with two names, and nothing is attenuated
//            crossing it.
//   'glass'  passes SIGHT only. Not in ROOM_ADJACENCY; not walkable.
//
// Keys are the two room ids SORTED and joined with '|'. Never index this
// directly — thresholdBetween(a, b) owns the sort so no caller has to.
const ROOM_THRESHOLDS_BASE = {
  'balcony|game_room':        'door',
  'balcony|gym':              'door',
  'balcony|pool_room':        'door',
  'bathroom_a|hallway_a':     'door',
  'bathroom_b|hallway_b':     'door',
  'bedroom_1|hallway_a':      'door',
  'bedroom_2|hallway_b':      'door',
  'bedroom_3|hallway_b':      'door',
  'bedroom_player|hallway_a': 'door',
  'changing_room|game_room':  'door',
  'changing_room|gym':        'door',
  'dining|study':             'door',
  'game_room|living_room':    'door',
  'game_room|pool_room':      'door',
  'kitchen|laundry':          'door',
  // The open core (D6). These five edges are why the apartment reads as one
  // continuous space with rooms hanging off it rather than as a corridor.
  'dining|kitchen':           'open',
  'dining|living_room':       'open',
  'entry|living_room':        'open',
  'hallway_a|living_room':    'open',
  'hallway_b|kitchen':        'open',   // D7: why the south wing is the cheap seats
  // The pool's glass wall is NOT here: D14 makes it an upgrade rather than a
  // starting condition, so it lives in STRUCTURAL_UPGRADES.pool_window below.
};

// --- Structural upgrades (floorplan plan Phase 6, D13) ---
// A structural upgrade EDITS THE GRAPH. That is what distinguishes it from
// the facility upgrades in FACILITY_DEFS, which move a quality number: these
// change what connects to what, what a crossing is made of, or what a room
// IS. The apartment's shape becomes something the player negotiates rather
// than inherits.
//
// Two of the five ADD a barrier. Upgrade systems almost always only open
// things up; being able to close your house down is a lever nobody uses and
// this layout hands it over for free — the open core is wonderful until you
// are trying to sleep next to the kitchen.
//
// `edits` is a list of graph operations applied in order:
//   { threshold: 'a|b', to: 'door' }   retype an existing crossing
//   { addEdge: 'a|b', as: 'glass' }    create one that was not there
//   { removeEdge: 'a|b' }              wall one up
//   { roomType: 'study', to: 'bedroom' }  change what a room is
const STRUCTURAL_UPGRADES = {
  // A PREFERENCE, not a fix — and the description says so, because it used
  // to say otherwise. This was sold as the cure for the south wing being
  // "the cheap seats", back when D7 priced the wing asymmetry into rent.
  // That pricing is gone (see D7): every bedroom here is equally desirable,
  // and what the south wing has is a sensory position, not a defect. You
  // might want to close it off. You might like being able to smell dinner
  // from bed. Both are legitimate, so this sells the choice rather than a
  // remedy.
  kitchen_hall_door: {
    id: 'kitchen_hall_door', label: 'Door onto Hallway B',
    room: 'kitchen', cost: 2200, durationDays: 3, reversible: true,
    desc: 'Frame and hang a door in the kitchen archway. The south bedrooms stop smelling breakfast — for better or worse.',
    edits: [{ threshold: 'hallway_b|kitchen', to: 'door' }],
  },
  // The showpiece. Sight only, never a door (D14) — the Game Room stays the
  // sole way into the east wing, because a chokepoint everyone passes through
  // is where unforced encounters happen.
  pool_window: {
    id: 'pool_window', label: 'Pool Viewing Wall',
    room: 'pool_room', cost: 9500, durationDays: 6,
    desc: 'Cut the living room wall through to the pool and glaze it. You see the water from the sofa; you still walk round.',
    edits: [{ addEdge: 'living_room|pool_room', as: 'glass' }],
  },
  // A fourth rentable room against losing an amenity — the most direct
  // economic decision in the set, and the one that speaks to the rent
  // pressure the whole game runs on.
  study_to_bedroom: {
    id: 'study_to_bedroom', label: 'Convert Study to Bedroom',
    room: 'study', cost: 7000, durationDays: 7,
    desc: 'Wardrobe, bed, a lock on the door. You lose the study; you gain a room that pays rent.',
    edits: [{ roomType: 'study', to: 'bedroom' }],
  },
  // Total privacy, bought at everyone else's expense. Seal Bathroom A off the
  // hallway and open it into the player's room: the north wing loses a
  // bathroom and the whole household starts queueing for Bathroom B.
  // Roommates SHOULD resent this, and an upgrade that raises tension is
  // exactly the kind this game should be able to sell you.
  ensuite: {
    id: 'ensuite', label: 'Private Ensuite',
    room: 'bathroom_a', cost: 5400, durationDays: 5,
    desc: 'Wall up the hallway door and cut through from your bedroom. Yours alone — and nobody else\'s any more.',
    edits: [
      { removeEdge: 'bathroom_a|hallway_a' },
      { addEdge: 'bathroom_a|bedroom_player', as: 'door' },
    ],
  },
  // The reversible one, and the only upgrade that is a preference rather
  // than a progression: close the acoustic core when you want to sleep,
  // open it when you want a party.
  dining_doors: {
    id: 'dining_doors', label: 'Dining Room Doors',
    room: 'dining', cost: 1600, durationDays: 2, reversible: true,
    desc: 'Hang double doors in the living room archway. Quieter nights, colder parties.',
    edits: [{ threshold: 'dining|living_room', to: 'door' }],
  },
};

// --- The live graph ---
// ROOM_ADJACENCY and ROOM_THRESHOLDS are the tables everything reads, and
// they are DERIVED: base layout plus whichever structural upgrades this save
// has built. Rebuilt IN PLACE rather than reassigned, so every existing
// reader (findPath, isRoomAdjacent, reachMultipliers, the renderer) keeps
// working untouched — there is no version of this that threads a gameState
// through all of them without touching thirty call sites.
const ROOM_ADJACENCY = {};
const ROOM_THRESHOLDS = {};

// Rebuild the live graph. `gameState` omitted = the base layout alone, which
// is what the tables hold at load time before any save exists.
function applyStructuralUpgrades(gameState) {
  for (const k of Object.keys(ROOM_ADJACENCY)) delete ROOM_ADJACENCY[k];
  for (const k of Object.keys(ROOM_THRESHOLDS)) delete ROOM_THRESHOLDS[k];
  for (const [room, ns] of Object.entries(ROOM_ADJACENCY_BASE)) ROOM_ADJACENCY[room] = ns.slice();
  Object.assign(ROOM_THRESHOLDS, ROOM_THRESHOLDS_BASE);
  // Room types are patched onto ROOMS the same way, and reset first so
  // reverting an upgrade actually reverts it.
  for (const [id, def] of Object.entries(ROOMS)) {
    if (def._baseType === undefined) def._baseType = def.type;
    def.type = def._baseType;
  }

  const flags = gameState?.world?.flags || {};
  for (const up of Object.values(STRUCTURAL_UPGRADES)) {
    if (!flags[`structural_${up.id}`]) continue;
    for (const edit of up.edits) {
      if (edit.threshold) {
        if (ROOM_THRESHOLDS[edit.threshold]) ROOM_THRESHOLDS[edit.threshold] = edit.to;
      } else if (edit.addEdge) {
        const [a, b] = edit.addEdge.split('|');
        ROOM_THRESHOLDS[edit.addEdge] = edit.as;
        // Glass is a threshold, never a route (D5) — it must not reach the
        // movement graph or NPCs will path through a window.
        if (edit.as !== 'glass') {
          if (!ROOM_ADJACENCY[a].includes(b)) ROOM_ADJACENCY[a].push(b);
          if (!ROOM_ADJACENCY[b].includes(a)) ROOM_ADJACENCY[b].push(a);
        }
      } else if (edit.removeEdge) {
        const [a, b] = edit.removeEdge.split('|');
        delete ROOM_THRESHOLDS[edit.removeEdge];
        ROOM_ADJACENCY[a] = (ROOM_ADJACENCY[a] || []).filter(n => n !== b);
        ROOM_ADJACENCY[b] = (ROOM_ADJACENCY[b] || []).filter(n => n !== a);
      } else if (edit.roomType && ROOMS[edit.roomType]) {
        ROOMS[edit.roomType].type = edit.to;
      }
    }
  }
  // SIGNALS derives its own edge list from ROOM_THRESHOLDS; it has to follow.
  if (typeof rebuildSignalEdges === 'function') rebuildSignalEdges();
  return { ROOM_ADJACENCY, ROOM_THRESHOLDS };
}

// Populate the live tables at load, before anything reads them.
applyStructuralUpgrades();

// The one accessor. Owns the sorted-key convention so a caller can ask in
// either direction and a rename can never leave half the table unreachable.
// Rooms that are not connected at all return null, which is distinct from
// 'open' — "no barrier" and "no connection" are opposite answers.
function thresholdBetween(a, b) {
  return ROOM_THRESHOLDS[[a, b].sort().join('|')] || null;
}

// --- Floor plan geometry (schematic, in a 500x660 space) ---
// A room is a LIST of [x, y, w, h] rects, not one box (D2). The Gym wraps
// around Bedroom 1 and the Living Room wraps under the Entry — both are
// genuinely L-shaped, and flattening them to single boxes is what made the
// old plan read as a pile of disconnected rectangles.
//
// Traced from the hand-drawn plan via dev/mapper.html. Adjacent rooms TILE:
// every edge in ROOM_ADJACENCY shares a real wall, asserted in
// dev/verify/verify-plan.js so the map and the graph cannot disagree.
const ROOM_LAYOUT = {
  bedroom_player: [[90,5,110,130]],
  hallway_a:      [[200,5,32,185]],
  bedroom_1:      [[232,5,123,115]],
  gym:            [[232,120,208,70], [355,30,85,90]],
  bathroom_a:     [[105,140,90,48]],
  entry:          [[40,190,125,50]],
  living_room:    [[165,190,160,165], [40,240,125,115]],
  changing_room:  [[325,190,85,42]],
  game_room:      [[325,232,85,78]],
  balcony:        [[415,190,55,120]],
  pool_room:      [[325,315,150,135]],
  dining:         [[40,355,170,95]],
  kitchen:        [[210,355,115,95]],
  study:          [[55,455,110,90]],
  laundry:        [[185,455,95,65]],
  hallway_b:      [[280,450,40,160]],
  bathroom_b:     [[320,450,90,40]],
  bedroom_3:      [[320,490,100,120]],
  bedroom_2:      [[165,520,115,110]],
};

// The schematic units above are ~5cm each: the plan spans 500 units across
// what a penthouse of this footprint would be, call it 25 metres. At an
// unhurried indoor walking pace (~1.4 m/s) that is a shade under 28 units
// per second, which is where WALK.unitsPerSecond comes from.
//
// It matters that this is DERIVED (D9). Walk time is the path's length in
// these units, not a per-room number somebody maintains — so the apartment's
// size is mechanically real and there is no table that can disagree with the
// map. Crossing the whole flat lands around 15-20 game-seconds; a step
// between neighbouring rooms is 3-6.
const WALK = {
  unitsPerSecond: 28,
  // Every doorway costs a beat regardless of distance — you slow down, you
  // handle a door. Keeps two tiny adjacent rooms from being free.
  secondsPerThreshold: { door: 1.5, open: 0.4, glass: Infinity },
  // A floor is never truly free even standing still; this is the floor on a
  // single move so a click always advances the clock a little.
  minSeconds: 1,
  // Phase 4 (continuous-behavior-engine): a walk to a stand-point this close
  // is a walk to where you already are — skip it and arrive instantly.
  arriveEpsilon: 2,
};

// --- Economy (luxury penthouse scale — see apartment-expansion-plan.md) ---
// --- Economy ---
// The rent model is the game's main pressure system, and it is
// deliberately NOT an even split. The player holds the lease: they owe the
// whole rent, and each roommate offsets at most a capped fraction of the
// total. So the numbers push toward the social sim rather than away from
// it — see src/ref/complete/economy-and-rent-plan.md for the full design.
//
// That cap is not fixed: it scales with how good the apartment is. Nobody
// pays penthouse rates for a wreck, and a fully restored place with every
// amenity working can command real money. This is what makes the upgrade
// system an investment rather than a drain (src/ref/complete/apartment-upgrades-plan.md).
//
// The arc, at $1900/week with the entry freelance rate (~$28-48/block after
// the 2026-08-17 audit's entry-pay bump, and energy capping a day at
// roughly 14 blocks):
//   solo, any state    → owes $1900/wk ≈ $271/day vs roughly $215-270/day
//                        earnable by grinding (focus is never a clean 1.0).
//                        Not quite payable, on purpose.
//   1 roommate, wreck  → owes $1748/wk. Barely moves the needle.
//   3 roommates, mid   → owes  $760/wk ≈ 5 blocks/day. Comfortable.
//   4 roommates, restored → breaks even.
//   7 roommates, restored → the apartment turns a profit and pays for
//                        itself. That is the intended end state: the
//                        game's thesis is that money problems are solved
//                        by people, so enough of them should solve it
//                        outright. The price is managing seven
//                        relationships, which is its own kind of hard.
const ECONOMY = {
  startingMoney: 3800,        // ≈2 weeks of solo rent — buys time, not safety
  rent: {
    total: 1900,
    playerShare: 0,          // computed at runtime by computeRent
    // The per-roommate ceiling, interpolated by apartment quality. No
    // agreement, relationship or personality may exceed the ceiling for
    // the apartment's current state — that cap is what stops one great
    // roommate from trivialising the early game.
    minRoommateShare: 0.08,  // apartment in disrepair
    maxRoommateShare: 0.30,  // fully restored, every amenity working
    // What a roommate contributes before any negotiated agreement exists.
    // Phase 8 (vocation plan): replaced as the per-roommate default by
    // `incomeShare` below — a roommate now contributes what their income (band ×
    // source) says they can, so income finally shows up in the rent the
    // economy-and-rent-plan calls the placeholder. defaultRoommateShare survives
    // as the fallback for an NPC with no readable occupation, and as the value
    // the true rent-agreement system (variable per roommate, driven by
    // relationship, income and personality) will override — see the plan doc.
    defaultRoommateShare: 0.15,
    // The per-roommate contribution fraction, derived from incomeBand ×
    // incomeSource (SIM's incomeRentShare). incomeBand says HOW MUCH, incomeSource
    // says from WHERE. The curve is centered on defaultRoommateShare for the
    // archetype (wage/mid) so a typical cast lands in the same pressure band as
    // the old flat 0.15; a broke roommate ('none' — Recently Laid Off,
    // Between Things) contributes nothing and pushes MORE onto the player, which is
    // exactly "money is running out"; 'self' (variable income) sits a touch
    // under the wage curve; 'means' covers what a wage earner of the same band
    // covers. Every value is still clamped to [0, ceiling] in computeRent, and
    // the ceiling (a property of the building, invariant 7) is unchanged — the
    // pressure that keeps solo living unsustainable is untouched.
    incomeShare: {
      wage:  { low: 0.10, mid: 0.15, high: 0.20 },
      self:  { low: 0.08, mid: 0.13, high: 0.18 },
      means: { low: 0.10, mid: 0.15, high: 0.20 },
      none:  { low: 0.00, mid: 0.00, high: 0.00 },
    },
    // Sharing a bedroom pays this fraction of what a private room commands.
    // Four bedrooms of two beds means a full house of 7 is entirely shared,
    // so this multiplier is what decides the end-state profit: at 0.8 a
    // restored full house clears ~$5.6k/mo, at 0.6 nearer ~$2.1k/mo. It
    // also keeps private rooms worth more, which gives converting space a
    // point.
    sharedRoomShareMultiplier: 0.8,
    // A `roomDesirability` block lived here and is DELETED (2026-08-14). It
    // priced the north/south wing asymmetry into rent. The intent is the
    // opposite: EVERY BEDROOM IN THIS APARTMENT IS EQUALLY DESIRABLE. The
    // rooms are large and the building has good bones, which is to say real
    // insulation — the south wing's position by the kitchen is a sensory
    // fact, not a defect, and it cuts both ways (they are first to know
    // about the bin, and first to smell dinner). See D7.
  },
  // Phase 7: the opening. The player starts alone in a wreck apartment
  // with starter money that covers roughly two weeks of solo rent. A
  // grace period pushes the first rent bill back so the opening isn't a
  // wall of bills on day one — the player has time to orient, find the
  // gig board, and start earning before the first charge lands.
  opening: {
    soloStart: true,        // generate 0 roommates at new-game
    rentGraceDays: 14,      // first rent bill deferred this many days
    firstBillDelay: 7,      // utility bills start after this many days
  },
  // workPayPerBlock/workEnergyCost were the old flat-rate doWork()'s
  // numbers — superseded by DEFS.COMPUTER's JOB_DEFS (P4), which carries
  // pay/energy cost per job rather than one flat rate. Deleted rather
  // than left dead.
  deliveryFee: 8,
  payPeriodDays: 7,          // rent due weekly
  // rentLatePenaltyMood (the old per-day direct mood subtraction) was
  // absorbed by MOOD_TARGET.stress.rentPenalty in Phase 5 — a steady target
  // drag while rentOwed > 0 instead of an ever-accumulating bar push.
  rentLateTensionPerDay: 0.02, // resident tension increase per day unpaid
};

// --- Investing (Phase 11) ---
// The economy plan says investing is "the accelerator for [apartment
// upgrades] rather than a parallel score." Idle surplus money should be
// working — a freelancer with $2k/mo surplus and $50k of renovations to
// fund needs a place to park money that grows faster than inflation.
//
// The model is deliberately simple: a few index funds with different
// risk/return profiles. Growth is computed at day-rollover, not per-tick
// (daily compounding at game speed would be silly). Returns are noisy —
// some days up, some down — but trend upward over time. The player can
// lose money in the short term, which is the risk that makes it a choice
// rather than a free button.
//
// This is NOT day trading. There's no stock picking, no watching the
// ticker, no selling at a profit. You buy fund shares, they grow (or
// shrink), you sell when you need the money for upgrades. The "skill"
// is patience and risk tolerance, not market timing.
const INVESTING = {
  // D8 — the financial year is DELIBERATELY NOT CALENDAR.daysPerYear. The
  // game year just shrank from 360 to 140 days (four 35-day seasons); tying
  // daily return to it would silently triple fund earnings (a $10k Index
  // position would earn ~$6.43/day instead of ~$2.50/day) — a 2.57x buff to
  // the upgrade-accelerator system, not a re-tune. 360 holds per-day returns
  // byte-identical to the pre-calendar-change game and keeps the real-world
  // return anchors (S&P, T-bills) legible. See the plan's D8.
  daysPerFinancialYear: 360,
  // Funds available to buy. `expectedReturn` is annual; daily return is
  // `expectedReturn / daysPerFinancialYear * (1 + noise)`. `volatility` is
  // the std dev of the daily noise term (0.01 = ±1% daily swing is common).
  funds: [
    {
      id: 'tbill', label: 'T-Bill Fund', desc: 'Government bonds. Slow, steady, boring. Your money is safe.',
      expectedReturn: 0.04,   // 4% annual — barely beats inflation
      volatility: 0.002,      // ±0.2% daily — almost no noise
      minInvest: 100,
    },
    {
      id: 'index', label: 'Index 500', desc: 'Tracks the top 500 companies. The default choice — diversified, reasonable return, reasonable risk.',
      expectedReturn: 0.09,   // 9% annual — historical S&P average
      volatility: 0.012,      // ±1.2% daily
      minInvest: 500,
    },
    {
      id: 'growth', label: 'Growth Tech', desc: 'Tech-focused high-growth fund. High returns, high volatility. Not for the faint of heart.',
      expectedReturn: 0.14,   // 14% annual — aggressive
      volatility: 0.025,      // ±2.5% daily — wild swings
      minInvest: 1000,
    },
  ],
  // Day-rollover growth: for each fund, daily return =
  // annual / daysPerFinancialYear ± noise. The noise is seeded per-day
  // per-fund so it's deterministic for a given save (no cheating by
  // reloading). Uses mulberry32 for a proper uniform PRNG, then Box-Muller
  // for a normal distribution.
  dailyReturn: function(annualReturn, volatility, day, fundId) {
    // Hash the fund+day into a 32-bit seed, then run mulberry32 for
    // two uniform samples. The previous version used modular arithmetic
    // on the raw hash, which collapsed to ~10,000 discrete values and
    // always produced positive z (every day was a gain).
    let seed = 2166136261;
    const s = fundId + '_' + day;
    for (let i = 0; i < s.length; i++) {
      seed = Math.imul(seed ^ s.charCodeAt(i), 16777619);
    }
    seed = seed >>> 0;
    // mulberry32 PRNG — two calls for two uniforms
    const rng = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const u1 = Math.max(1e-10, rng());
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return (annualReturn / INVESTING.daysPerFinancialYear) + z * volatility;
  },
  // Transaction fee — discourages rapid in-and-out.
  fee: 0.005, // 0.5% per buy/sell
};

// --- Bills (Phase 3) ---
// The cost stack. Each bill has a cadence, a split rule, and a cutoff
// consequence that reaches into a system other than money. Electric,
// water and gas are usage-metered (Phase 5): their `amount` field is the
// fallback when no meter data exists; `computeBillAmount` computes
// `base + Σ(meter × rate)` from `world.utilities` when meters are
// present. Rent is one entry here, keeping its asymmetric lease-split
// via `split:'lease'` — see src/ref/complete/economy-and-rent-plan.md. The grace
// period is how many days a bill can stay unpaid past its due day
// before the cutoff fires; the reconnection fee is what restoring
// service costs, so letting something lapse is a real setback rather
// than a free loan.
//
// cadenceDays: how often the bill posts. 7=weekly, 35=seasonal (once per
// season — every utility posts exactly twice per tax period, which is what
// keeps the internet deduction exact; see D5). Rent stays weekly.
// split: 'lease' (rent only — cap per roommate, player carries the gap),
//        'even' (split evenly among residents),
//        'personal' (player pays the whole thing — phone, insurance, taxes).
// cutoff: a utility id whose service cuts off when the bill is unpaid past
//         grace. Non-utility bills (insurance/phone/taxes) have no cutoff —
//         they just accumulate debt. 'rent' reuses the existing eviction
//         ladder in processRentForDay.
const BILL_DEFS = {
  rent: {
    id: 'rent', label: 'Rent', cadenceDays: 7, split: 'lease', amount: 0,
    graceDays: 7, reconnectionFee: 0, cutoff: 'rent',
  },
  electric: {
    // D7: 260 → 303 (×7/6 for the 30→35-day cycle — per-day parity, not a
    // difficulty change). cadenceDays 30→35 (D5): once per season.
    id: 'electric', label: 'Electric', cadenceDays: 35, split: 'even', amount: 303,
    graceDays: 5, reconnectionFee: 40, cutoff: 'power',
  },
  water: {
    id: 'water', label: 'Water / Sewer', cadenceDays: 35, split: 'even', amount: 152,
    graceDays: 5, reconnectionFee: 35, cutoff: 'water',
  },
  gas: {
    id: 'gas', label: 'Gas / Heat', cadenceDays: 35, split: 'even', amount: 163,
    graceDays: 5, reconnectionFee: 35, cutoff: 'gas',
  },
  internet: {
    id: 'internet', label: 'Internet', cadenceDays: 35, split: 'even', amount: 93,
    graceDays: 3, reconnectionFee: 25, cutoff: 'internet',
  },
  phone: {
    id: 'phone', label: 'Phone', cadenceDays: 35, split: 'personal', amount: 76,
    // Phase 5 (decision F): the phone bill now has a real cutoff — unpaid
    // past grace kills the phone's cellular service. The phone still works
    // on home wifi while the internet is up (degraded but survivable);
    // only a total loss (wifi AND cellular down) blocks online apps.
    graceDays: 10, reconnectionFee: 0, cutoff: 'phone',
  },
  insurance: {
    id: 'insurance', label: 'Renters Insurance', cadenceDays: 35, split: 'personal', amount: 29,
    graceDays: 15, reconnectionFee: 0, cutoff: null,
  },
};

// --- Autopay (BrineOS Phase 7) ---
// Opt-in per bill, default off. A successful autopay pays through the same
// payBill() path a manual click uses. A failed one (insufficient funds) is
// worse than a manual miss: it compounds a flat bounce fee onto the balance
// immediately rather than just sitting unpaid through the grace window —
// that asymmetry is the whole point (economy-and-rent-plan.md: income is
// lumpy, so a dry spell should be able to bite through autopay, not just
// around it). Flat, not scaled to the bill — real NSF fees don't scale
// either — and anchored to the existing reconnectionFee range above
// ($25-$40) rather than invented from nothing.
const AUTOPAY = {
  bounceFee: 30,
};

// --- Taxes (Phase 6) ---
// Quarterly estimated taxes — the highest-value mechanic in the economy
// plan. A large lumpy obligation every 70 days — end of Summer and end of
// Winter (D3 of the calendar plan) — that forces saving. See
// src/ref/complete/economy-and-rent-plan.md §Quarterly estimated taxes.
//
// The blended rate is one number (self-employment 15.3% + effective
// federal), not a bracket table — precision here is false precision.
// Deductions make other systems matter: Nile tech/electronics, a share
// of the internet bill, and Classes enrollment costs are all
// legitimately deductible for a freelancer.
const TAX_CONFIG = {
  rate: 0.27,              // blended self-employment + federal rate
  // Penalty for underpayment (owing more than was reserved/paid when the
  // tax period bills). Compounds — rolled into `unpaid` and accrues
  // interest each subsequent period, so ignoring taxes is a spiral, not a
  // flat fee. Interest applies to carried-forward unpaid balances.
  // Stays 0.08 (D4): it is a fraction of the SHORTFALL, which shrinks in
  // proportion to the period, so shorter periods net out to the same
  // dollars per day. Self-normalising — do not scale it.
  underpaymentPenalty: 0.08,   // 8% of the unpaid shortfall, one-time per period
  // Scaled 0.02 → 0.015 (D4): interest is a fraction of the CARRIED
  // BALANCE, which does not shrink with the period, so billing 1.286x
  // more often in playtime would compound 1.286x faster per day of play.
  // 0.02 × 70/90 = 0.0156, rounded to three decimals. The A3 harness
  // asserts the compounded total over three periods lands within 2% of
  // the old rate over the same number of days.
  interestRate: 0.015,        // 1.5% per 70-day tax period on carried-forward unpaid balance
  // How much of the internet bill is deductible each quarter (a
  // freelancer's home-office internet share). Applied automatically.
  internetDeductibleFraction: 0.5,
  // Item categories from Nile that count as business deductions.
  deductibleCategories: ['electronics', 'tool'],
  // Course skill ids whose enrollment costs are deductible (skill
  // training directly related to the freelancer's work — tech courses).
  deductibleSkillIds: ['tech'],
};

// Which utility a cutoff id maps to, for the requirement checkers and the
// bill dashboard. A cutoff status of 'off' on any of these blocks the
// systems listed in BILL_CUTOFF_EFFECTS. 'phone' is Phase 5 (decision F):
// the phone bill's cutoff kills cellular service, but the phone still
// works on home wifi — only wifi AND cellular both down blocks online
// apps on the phone.
const BILL_CUTOFF_IDS = ['power', 'water', 'gas', 'internet', 'phone', 'rent'];

// What each utility cutoff actually blocks. Phase 5 wired the app-gating
// fields up for real with a device dimension (COMPUTER's appBlockedReason,
// read by the gig/stream/browser handlers) and deleted the dead ones:
//   * `internet.blocksApps` — the online apps; the phone treats these as
//     blocked only when wifi AND cellular are both down (decision F).
//   * `power.blocksComputer` — a power cutoff kills the whole machine;
//     per-app blocksApps under power would be redundant since the computer
//     can't even open.
//   * `label` — used by the bills dashboard and rollover log messages.
//   * Action-level blocks (shower/dishes/laundry/cook) live in
//     ACTION_REQUIREMENT_CHECKERS (waterNotCutoff/gasNotCutoff), not here.
const BILL_CUTOFF_EFFECTS = {
  power: { label: 'Power is off', blocksComputer: true },
  internet: { label: 'Internet is down', blocksApps: ['work', 'stream', 'browser'] },
  phone: { label: 'Phone service is off' },
  water: { label: 'Water is off' },
  gas: { label: 'Gas is off' },
  rent: { label: 'Eviction risk' },
};

// --- Utility metering (Phase 5) ---
// Bills are a consequence of how the household lived, not a flat fee.
// `world.utilities` accumulates counters between billings; the monthly
// bill is `base + Σ(counter × rate)`. Both player and NPC actions meter —
// if only the player's actions counted, the bill couldn't tell the story
// of a roommate who takes 40-minute showers or leaves the heat cranked.
// See src/ref/complete/economy-and-rent-plan.md §Utilities.
//
// Each meter entry: `bill` = which BILL_DEFS bill it feeds, `rate` = $/unit,
// `unit` = a display label for the itemised breakdown. Meters reset to
// zero when the bill posts (every cadenceDays). `hvac` is special: its
// rate comes from the seasonal HVAC table below, since it dominates the
// bill and swings ~3× between summer/winter.
const UTILITY_METER = {
  // HVAC — the dominant line item. One "unit" = one day of heating or
  // cooling at the current thermostat setting. Rate is seasonal.
  hvac:            { bill: 'electric', rate: 0, unit: 'day', seasonal: true },
  // Water heating — gas or electric. One shower ≈ 17 gal heated.
  waterHeating:    { bill: 'gas', rate: 0.45, unit: 'shower' },
  // Showers — water volume. One shower ≈ 17 gal at $0.012/gal.
  showers:         { bill: 'water', rate: 0.20, unit: 'shower' },
  // Laundry — water + electric (dryer). One load ≈ 20 gal water.
  laundry:         { bill: 'water', rate: 0.24, unit: 'load' },
  // Dishes — water. One dish session ≈ 10 gal.
  dishes:          { bill: 'water', rate: 0.12, unit: 'session' },
  // Cooking — gas. One cook session ≈ 0.3 therms.
  cooking:         { bill: 'gas', rate: 0.36, unit: 'session' },
  // Devices — computer hours, console, gym equipment. Small but itemised
  // anyway — seeing "Computer 212h — $8" next to "Heat — $206" teaches
  // where money actually goes. One unit = one hour of device use.
  devices:         { bill: 'electric', rate: 0.04, unit: 'hour' },
};

// Seasonal HVAC rate per day, by season index (0=spring … 3=winter).
// Summer (cooling) and winter (heating) are the peaks; spring/autumn are
// mild. The thermostat setting multiplies this: setting 1.0 = baseline,
// higher = more heating/cooling. One "day" of HVAC is accumulated per
// day the household is occupied (always, for now).
const UTILITY_HVAC_SEASONAL = [
  2.2,  // spring — mild, low load
  6.8,  // summer — cooling peak
  2.2,  // autumn — mild
  8.5,  // winter — heating peak
];

// Thermostat: the household's current setting (1.0 = baseline). Higher
// means more heating in winter, more cooling in summer. The player can't
// change this yet (a household-decision UI is an open question in the
// plan); for now it's a fixed baseline that the meter reads.
const UTILITY_THERMOSTAT = 1.0;

// Base costs — the fixed per-cycle floor on each utility bill (the
// connection charge / infrastructure cost), added to the metered total.
// D7: scaled ×7/6 (25→29, 15→18, 12→14) for the 30→35-day cycle. These are
// posted per cycle, so NOT scaling them would be a silent per-day discount.
const UTILITY_BASE = {
  electric: 29,
  water: 18,
  gas: 14,
};

// --- Facilities / Apartment upgrades (Phase 4) ---
// A facility is an installable/repairable feature of a room. Each has a
// `room`, a `tier` (its current condition), a progression of `tiers` with
// costs, and a `qualityWeight` — its contribution to apartment quality
// (getApartmentQuality). A room is only its name once its defining
// facility reaches at least 'functional'. See src/ref/complete/apartment-upgrades-plan.md.
//
// tier values: 'absent' → 'broken' → 'functional' → 'upgraded'
// (some facilities skip 'absent' — a stove exists, it's just broken)
//
// `qualityValue` per tier: 0 (absent/broken), 0.5 (functional), 1.0 (upgraded)
// `cost` is what the player pays to advance TO that tier from the
// previous one. 'broken→functional' is a repair; 'functional→upgraded'
// is an upgrade.
// `durationDays` is how long that advance takes as a contracted
// renovation job (0 on starting tiers, which are never booked to).
// `residentCapacity` (bedroom facilities only) is reserved for the future
// room-sharing plan — see src/ref/complete/renovation-occupancy-overhaul-plan.md.
//
// `gatesActions`: action ids that require this facility to be at least
// 'functional'. Checked by the 'facilityFunctional' requirement checker.
// `gatesRecruitment`: if true, the room can't have a roommate until this
// facility is at least 'functional' (bedrooms only).
// --- Maintenance / decay (Phase 9) ---
// Facilities degrade with use, not merely with time. A facility's
// `condition` (0-100) starts at 100 when repaired/upgraded and drops by
// `decayPerUse` each time a gated action is performed. At 0, the facility
// drops a tier (upgraded→functional→broken). Repair restores condition
// AND/OR advances the tier. This is thematically identical to the
// usage-metered utilities: a full house degrades faster, which is the
// roommate-friction beat (someone who uses the gym daily is wearing out
// equipment everyone paid for).
//
// Decay must be SLOW — occasional, noticeable, attributable, not a chore
// treadmill. A typical action performed daily drops condition by ~1.5;
// at 100 condition that's ~67 uses (~9 weeks of daily use) before a tier
// drop. NPC use counts too (drives meter facilities), so a full house
// degrades facilities roughly 2-4x faster.
const MAINTENANCE = {
  startingCondition: 100,
  decayPerUse: 1.5,        // condition lost per gated action use
  repairCostPerPoint: 2,   // $ per condition point restored (cheap maintenance)
  tierDropThreshold: 0,    // condition at/below this drops a tier
  // NPC actions that meter facility decay (mapped to facility ids).
  // When an NPC performs one of these activities, the facility decays.
  // Keys MUST match actual DRIVE_DEFS keys (config.js) — a mismatch means
  // the drive fires but the facility silently never decays.
  npcDecayActions: {
    // 'shower' drive (not 'self_care') decays both bathroom plumbings.
    'shower': ['bathroom_a_plumbing', 'bathroom_b_plumbing'],
    'do_laundry': ['laundry_machines'],
    // Intimacy & Voyeurism Phase 6: the swim drive is gated on a working
    // pool the same way shower is gated on plumbing, and using it wears it
    // out — the pool is expensive to keep, which is the point.
    'swim': ['pool_systems'],
    // Vocation plan D17: the late-night pool session is facility-gated by
    // the same route rather than by a bespoke check in its candidacy —
    // scoreDrive already refuses any drive whose npcDecayActions facility
    // is not functional, so this one line IS the gate, and using the pool
    // for a shoot wears it out exactly as swimming does.
    'content_pool_session': ['pool_systems'],
    // NOTE: the old 'cook' drive (→ kitchen_stove) became Phase 8's 'eat'
    // drive, which deliberately does NOT map to a facility: a hungry NPC
    // raids the fridge/pantry/own bag, which needs no working stove, and
    // gating on the stove would starve everyone during the opening
    // disrepair. The player's self.cook action still decays the stove.
    // (This mapping was the stove-gate that kept the eat drive silent on
    // a save with a broken kitchen — see the Phase 8 handoff.)
    // NPCs who watch TV or play games degrade the living room / game room.
    // There's no dedicated 'game' drive; leisure-time use of these rooms
    // is covered by the 'seek_company' drive when it fires while an NPC
    // is in the living_room or game_room. We decay both facilities on
    // seek_company to approximate shared-area wear.
    'seek_company': ['living_room_entertainment', 'game_room_setup'],
  },
};

// --- Spoilage / rot (inventory overhaul Phase 4; food-decay overhaul) ---
// Food decays, and rot becomes a mess with consequences (D5/D6). One
// tuning surface for the whole model. Freshness is DERIVED from elapsed
// game time (invariant 5 — never a stored countdown): a stack's effective
// shelf life is `def.perishable.days × ROT.preservation[storageClass]`.
// The preservation multipliers used to live scattered on each container's
// own OBJECT_DEFS entry (fridge 4.0 / pantry 2.0 / bag 1.0 / doormat 0.75 /
// floor 0.5) — since food-overhaul Phase 1 (D18) they are consolidated
// into the one table below and containers reference a row by
// `container.storageClass` (see DEFS.WORLD's container block), closing the
// invariant-5 gap where two hand-maintained lists could drift. Moving a
// stack between containers recomputes its remaining life (ITEMS'
// retimeStack) rather than resetting it.
//
// Elapsed time is CONTINUOUS — `day + minutes/1440` (ITEMS' gameDaysNow),
// not `clock.day` alone. That was the whole bug the overhaul fixed: at
// whole-day resolution nothing aged at all inside a day and then aged a
// full day at once at rollover, so a 1-day takeout dish was Fresh right up
// to midnight and Rotten immediately after, never passing through the
// ladder the player was being shown.
//
// The ladder, in fraction of edible life consumed:
//   Fresh     just cooked or just delivered. An ABSOLUTE window
//             (`freshHours`), because "fresh" means recently made, not
//             "a fixed fraction of the way to the bin" — a stick of butter
//             is not fresh for two days just because it keeps for a month.
//   (none)    perfectly good, simply not fresh any more. Carries NO label,
//             which is the point: most food, most of the time, is fine.
//   Stale     been sitting out a while. Not bad. Not great.
//   Spoiled   still edible, and it costs you — reduced restore plus a mood
//             and energy hit (the food-poisoning beat, once per meal).
//   Rotten    NOT edible. It is refuse, and `graceDays` later it is a mess.
//
// A stack under `meta.frozen` (food-overhaul Phase 1, D17/D29) does not
// age at all while frozen — its freshness clock is pinned to the moment it
// was frozen and resumes only once it has fully thawed (see THAW_TUNING
// and ITEMS' thawProgress/freshnessOf).
//
// `def.perishable.days` is therefore the time from acquisition to ROTTEN at
// the 1.0 (room-temperature) baseline, not the time until it first looks
// iffy — the ingredient shelf lives in DEFS.WORLD were re-authored against
// that reading.
//
// The Rotten→mess conversion runs in the day-rollover spoilage pass (SIM's
// processSpoilageForDay) and feeds the EXISTING cleanliness machinery via
// each container def's `rotten_food` state (DEFS.WORLD), so the maid's
// cleanRoomObjects and the player's throw-out button clear it with no
// parallel mess system.
// A frozen stack thaws (leaves the frozen state) after this long at room
// temperature — anywhere that isn't refrigeration/freezing: carried in the
// bag, left on a counter, stored in the pantry (D29). Duration-based on
// purpose: the freezer is a planning tool, not a teleport.
const THAW_TUNING = { roomTempThawHours: 8 };

// The freezer's preservation multiplier. A frozen stack doesn't age AT ALL
// while under `meta.frozen` (D17) — the freshness clock is pinned — so this
// number is a floor (what a def that ignores the frozen state would see),
// not the real mechanism. The real mechanism lives in ITEMS' freshnessOf.
const FROZEN_PRESERVATION = 25;

const ROT = {
  graceDays: 3,                  // days a Rotten (inedible) stack sits there before it becomes a mess
  bagPreservation: 1.0,          // the player's bag is the neutral baseline (1.0 row of the preservation table)
  // The ONE owning preservation table (food-overhaul Phase 1, D18 —
  // design invariant 5). Containers reference a row by storageClass
  // (OBJECT_DEFS' container block); everything without one resolves to
  // the bag baseline. The multipliers used to live scattered on each
  // container's own OBJECT_DEFS entry and could drift from this table —
  // they live HERE now, one place to tune.
  preservation: {
    floor: 0.5,      // dropped on the bare floor, uncovered
    doormat: 0.8,    // covered indoor hallway — room temperature, merely uncovered
    bag: 1.0,        // the neutral baseline
    pantry: 2.5,     // a cool, dark cupboard
    fridge: 5.0,     // 4.0 → 5.0 (D18 — the ladder is gentler, not stricter)
    freezer: FROZEN_PRESERVATION,  // frozen stacks never age (D17); a floor, not the mechanism
  },
  freshHours: 6,                 // absolute Fresh window at the 1.0 baseline — "just made", not a fraction of shelf life
  // Fraction-of-life ladder (D18 — gentler than the 0.15/0.45/0.75 the
  // system shipped with: food spends more of its life plainly "good" and
  // only looks iffy near the end, which is when it actually is).
  stages: { good: 0.2, stale: 0.5, spoiled: 0.8 },  // Fresh/— < .2 | Stale .5 | Spoiled .8 | Rotten ≥ 1
  labels: { fresh: 'Fresh', good: '', stale: 'Stale', spoiled: 'Spoiled', rotten: 'Rotten' },
  // Two perishable stacks merge only when their freshness anchors are this
  // close. At whole-day resolution the test was anchor equality, which IS
  // this test at day resolution; with hours in play, exact equality would
  // split a single shopping trip into one stack per minute.
  mergeToleranceHours: 6,
  rottenMessGrime: 0.9,          // dirtyWhen grime a rot mess contributes via `rotten_food: 'rotten'` on the container
  // Eating past its best: Stale is a small ding, Spoiled restores half AND
  // costs mood and energy on top. The penalties are per eating event, not
  // per serving — one spoiled meal makes you sick once. Rotten has no entry
  // here because Rotten cannot be eaten at all (the picker filters it and
  // EFFECTS' applyEatItem refuses it).
  staleRestoreMultiplier: 0.9,
  spoiledRestoreMultiplier: 0.5,
  spoiledMoodPenalty: 0.05,
  spoiledEnergyPenalty: 10,
  // (Phase 5: the standing-in-a-smelly-room mood cost moved OUT of the
  // per-tick subtraction and INTO the mood target's comfort term —
  // MOOD_TARGET.comfort.odorPenalty — so it doesn't fight the easing.)
  clearMessMinutes: 5,           // game minutes the throw-out button pays
};

// --- Raw-food consequences (2026-08-20 playtest feedback) ---
// Eating a raw ingredient that's meant to be cooked (raw chicken, ground
// beef, bacon, eggs) is legal but ill-advised: it costs a small mood and
// energy ding per serving eaten raw — the quiet way of saying "that was
// supposed to go in a pan". Cooking transforms the ingredient into a
// plate, so only the eat-raw path ever reads this. The eat picker warns
// first (RENDER's buildPickRowContent) so the penalty never lands
// unannounced, and the narration names it too (DEFS.ACTIONS' eatNarration).
const RAW_FOOD = {
  moodPenalty: 0.03,   // per serving eaten raw
  energyPenalty: 5,    // per serving eaten raw
};

// --- Renovation jobs (src/ref/complete/renovation-occupancy-overhaul-plan.md) ---
// Tier purchases are timed, contracted jobs rather than instant clicks.
// v1 allows at most one active job at a time (locked decision #6); the
// array is shaped to hold more so a future system can raise the cap
// without a data-model change.
const MAX_CONCURRENT_JOBS = 1;

// Job stages are derived, not stored — a pure function of job + current
// day (see getRenovationJobStage in computer.js), matching the same
// derived-not-persisted pattern the tracker uses for the agenda.
const RENOVATION_STAGE_TEMPLATES = {
  repair:  ['Strip-out', 'Rebuild', 'Finish'],
  upgrade: ['Demo', 'Install', 'Detail work', 'Finish'],
  // Structural work (floorplan plan Phase 6) — walls come down or go up, so
  // the stages are the building's rather than a fitting's.
  structural: ['Survey', 'Demolition', 'Framing', 'Making good'],
};

// Construction-scene narration (Phase 3). Both pools are keyed by job type
// and indexed by STAGE — like RENOVATION_STAGE_TEMPLATES they are derived
// (never stored, never LLM): SCENE lines play when the player enters a
// room with an active job (see doMove, ui.js), PROGRESS lines play at day
// rollover when a job advances a stage (see processRenovationJobsForDay,
// ui.js). Counts intentionally match RENOVATION_STAGE_TEMPLATES.
const RENOVATION_SCENE_TEMPLATES = {
  repair: [
    'Two guys in paint-spattered coveralls are arguing about the trim. You step around the drop cloths.',
    'The place smells of joint compound and wet plaster. A sander drones behind the plastic sheeting.',
    'The crew is packing up — a few last touches, then this room is yours again.',
  ],
  upgrade: [
    'The room is gutted to the studs — a demo crew works under a cloud of drywall dust.',
    'Half the room is taped off in plastic. A worker runs cabling along the baseboard.',
    'Finishing touches everywhere — fresh caulk, wet paint, tools staged by the door.',
    'The crew is buffing out the details. It looks like a different room.',
  ],
};

// Stage-advance lines, indexed by the STAGE THAT JUST COMPLETED (so an
// advance into stage N uses pool[N-1]). The final completion has its own
// line in processRenovationJobsForDay, so these never cover the last stage.
const RENOVATION_PROGRESS_TEMPLATES = {
  repair: [
    'The crew on {label} has finished the strip-out — the rebuild is starting.',
    'The crew on {label} has finished the rebuild — they\'re on the finishing pass.',
  ],
  upgrade: [
    'The demo on {label} is done — the install crew is moving in.',
    'The install on {label} is done — detail work is underway.',
    'The crew on {label} has finished the detail work — they\'re on the final finish.',
  ],
};

// --- Contractor Friend (src/ref/complete/contractor-tutorial-overhaul-plan.md) ---
// The permanent, simulation-light contractor who performs every renovation
// job and texts the player. NEVER a resident: `createNpcFromBible(..., 'visitor')`
// gives them contributesRent=false and no room, and resolveTick skips
// 'visitor' entirely (no schedule, no needs decay, no location, no drives).
// They only "exist" via the IM thread, which buildGameState pre-seeds with
// a welcome message (Phase 1). Identity finalized in the Phase 1 character
// brief: DEL CONNORS — practical, ol'-coot old-timer, paternal and patient,
// sounds like he's helping you even when the bill says otherwise. The
// plumbing uses CONTRACTOR_ID as the stable key, so future identity changes
// are bible-only.
const CONTRACTOR_ID = 'contractor';
const CONTRACTOR_WELCOME_MESSAGE = "Hey — you're the one who inherited the old place. I looked after it for your grandfather for years, so I know every creak and leak in it. I do the RenoFix work now — text me whenever something needs looking at.";
const CONTRACTOR_BIBLE = {
  name: 'Del',
  // Discord feedback (2026-08-24): split out of the old single 'Del
  // Connors' string now that every bible carries a real surname field.
  // authoredFields protects both halves — approveCastAndStartGame already
  // skips prose expansion for CONTRACTOR_ID entirely, but this also keeps
  // dedupeCastNames from ever renaming Del out of a same-first-name
  // collision with a rolled cast member.
  surname: 'Connors',
  authoredFields: ['name', 'surname'],
  visual: '',
  genSeed: 20260804,
  age: 54,
  gender: 'male',
  physical: {
    heightBuild: 'stocky and broad-shouldered',
    hair: { color: 'salt-and-pepper', style: 'short', length: 'cropped', texture: 'thick' },
    eyes: { color: 'grey', shape: 'hooded' },
    skin: { tone: 'weathered', texture: 'leathery', ethnicity: '' },
    face: { shape: 'square', nose: 'broad', lips: 'thin', cheekbones: 'high', jawline: 'strong', ears: 'unremarkable' },
    body: { shape: 'solid', chestSize: 'barrel', buttSize: '', legs: 'sturdy', posture: 'slightly bowed from years on his knees' },
    distinguishingFeatures: ['calloused hands', 'a faded scar across one knuckle'],
    piercings: [],
    tattoos: [],
    fashion: 'carhartt coveralls and a worn ballcap',
    accessories: 'a tape measure on his belt and a pencil behind his ear',
    // Reserved for roadmap Plan 2 — authored now, consumed there.
    typicalAttire: { casual: 'flannel and work boots', work: 'coveralls', sleep: 't-shirt and sweatpants', formal: 'a clean button-down he clearly hates' },
    voice: { pitch: 'low', texture: 'gravelly', accent: 'working-class' },
    gait: 'deliberate, heavy-footed',
    scent: 'sawdust and coffee',
  },
  history: "Was the player's grandfather's contractor for over twenty years — the man who kept this crumbling building from actually falling down. He knows its rot firsthand: which walls have been re-framed, which pipes sing, which foundation crack the building manager swore was cosmetic. He watched the place slide into disrepair as the grandfather got older, and now he treats the player like the job his old friend left unfinished — part duty, part the closest thing he's got to a kid to pass it to. He'll get it sorted, and he'll sound like it's a favor he's doing you, because to him it is.",
  temperament: { warmth: 0.7, volatility: -0.15, openness: 0.45, conscientiousness: 0.85, assertiveness: 0.6, selfAwareness: 0.6 },
  personality: {
    traits: ['practical', 'patient', 'paternal'],
    coreTrait: 'practical',
    hiddenTrait: 'sentimental about the old house',
    quirks: ['gives advice whether or not it was asked for', 'refers to himself as "we" even when it is just him', 'talks up the expensive fix while grumbling about the price'],
    likes: ['good tools', 'honest work', 'strong coffee'],
    dislikes: ['cut corners', 'surprise inspections', 'haggling'],
  },
  occupation: { category: 'service', title: 'General Contractor', scheduleTemplate: 'irregular', incomeBand: 'high', hours: 'flexible' },
  interests: [
    { name: 'old buildings', tags: ['craft', 'indoor'], skill: 90 },
    { name: 'hand tools', tags: ['craft'], skill: 85 },
    { name: 'renovation', tags: ['craft', 'indoor'], skill: 95 },
  ],
  values: [
    { name: 'craftsmanship', opposition: 'cutting corners' },
    { name: 'straight talk', opposition: 'polite evasion' },
  ],
  baggage: "Walked away from a long partnership after his partner started cutting corners on a school renovation — he still won't work with him.",
  wound: "The grandfather's death hit him harder than he let on. The building was the last job they worked together.",
  want: "To leave the place better than he found it — and to get paid properly for doing it.",
  blindSpot: "Assumes everyone wants his advice as much as he wants to give it.",
  boundary: "No haggling. His price is his price; he'll walk rather than argue.",
  speech: { verbosity: 0.6, formality: 0.3, humorStyle: 'dry', profanityLevel: 0.2, verbalTics: ['says "yep" before answering', 'calls you "kid"'], textingStyle: 'helpful old-timer — sounds like he is doing you a favor even when the bill says otherwise', vocabularyLevel: 0.6, catchphrases: ['We\'ll get it sorted.', 'You don\'t have to fix that yet — but you will, and it\'s cheaper now.'] },
  scheduleTemplate: 'irregular',
  sketch: 'Salt-and-pepper contractor in coveralls, pencil behind the ear.',
  sampleLines: [
    'Yep — I remember this building when it had a working elevator.',
    'You don\'t have to fix that yet — but you will, and it\'s cheaper if we do it now.',
    'Your grandfather would\'ve laughed at the price of lumber these days.',
    'We\'ll get it sorted, kid. Don\'t you worry about the how.',
    'That\'s a ten-minute job. I\'ll take twenty and do it right.',
  ],
};

// Contractor memory seeds (contractor doc Phase 4 — banter depth). Pre-seeded
// into the Contractor's memory.facts at new-game setup (see buildGameState,
// sim.js) so LLM-backed IM replies have grounded material to draw from: what
// they knew about the grandfather, the apartment's real history, and their
// opinions on the place — same memory.facts mechanism as any other NPC.
// day 0 = shared history (never decays; see decayMemory). The live "what am I
// working on right now" fact is maintained separately by setContractorJobFact
// (computer.js) at booking / day-rollover / completion under the categories
// 'renovation_job' (one valid at a time) and 'renovation_done' (accumulates).
const CONTRACTOR_INITIAL_FACTS = [
  // What they knew about the grandfather — his contractor for 20+ years.
  { text: "The player's grandfather hired me as his contractor for over twenty years — I did every repair this building ever needed.", day: 0, importance: 0.9, category: 'history' },
  { text: "The grandfather trusted me with the keys to this place; I know its rot firsthand — which walls were re-framed, which pipes sing, which foundation crack the building manager swore was cosmetic.", day: 0, importance: 0.9, category: 'history' },
  { text: "The grandfather and I tore out the old water main and replaced it together one freezing weekend — he was down in the crawlspace himself, wouldn't trust it to anyone else.", day: 0, importance: 0.7, category: 'history' },
  { text: "The grandfather slowed down hard in his last few years and wouldn't let me take on the big jobs — that's when the place really started going downhill.", day: 0, importance: 0.8, category: 'history' },
  { text: "The grandfather's death hit me harder than I let on — this building was the last job we worked together, and it bothered me to watch it fall apart after.", day: 0, importance: 0.8, category: 'history' },
  { text: "I take on the player's RenoFix work because the grandfather would've wanted the place kept in the family and fixed right — that's the whole reason I'm still doing it.", day: 0, importance: 0.7, category: 'history' },
  // Opinions on the apartment — grounded in the game's starting disrepair.
  { text: "The building's bones are good brick, but the guts are shot — the spare bedrooms have sat empty for years because none of them lock or light.", day: 0, importance: 0.8, category: 'apartment' },
  { text: "The kitchen stove is the original — it's been a fire hazard since before the grandfather died.", day: 0, importance: 0.7, category: 'apartment' },
  { text: "Both bathrooms are decades of patch-job plumbing that was never done right the first time.", day: 0, importance: 0.7, category: 'apartment' },
  { text: "The building manager swore the foundation crack was cosmetic — it's not, but it's not collapsing either; it just needs watching.", day: 0, importance: 0.6, category: 'apartment' },
  { text: "The grandfather kept this place alive on his own money long after it stopped making sense — the disrepair isn't because nobody cared, it's because he ran out of gas.", day: 0, importance: 0.6, category: 'apartment' },
  { text: "The grandfather would've laughed at today's lumber prices.", day: 0, importance: 0.4, category: 'apartment' },
];

// --- Contractor tutorial (src/ref/complete/contractor-tutorial-overhaul-plan.md, Phase 3) ---
// The first job on an auxiliary bedroom is free — the one-time guided
// tutorial that doubles as the opening's "you inherited this" framing
// (src/ref/complete/game-opening-plan.md). Only the three NON-player bedrooms qualify:
// the player's own room starts functional (locked decision #3) and its
// Upgrade is a paid luxury. The single tutorialRenoUsed flag is consumed on
// the booking in bookRenovationJob — this is a flag, not a state machine.
const TUTORIAL_FREE_FACILITIES = ['bedroom_habitability_1', 'bedroom_habitability_2', 'bedroom_habitability_3'];

// One-shot milestone hint texts, keyed to world.flags.tutorial_<id> — each
// pool fires exactly once ever via fireContractorMilestone at its natural
// trigger point (RenoFix first opened, tutorial free job booked, tutorial
// free job complete, first paid job, first Upgrade job, first roommate,
// quality threshold). Deterministic template content — no LLM in ticks;
// live LLM replies only when the player texts back. Same derived-not-
// persisted flavor as RENOVATION_SCENE_TEMPLATES / RENOVATION_PROGRESS_TEMPLATES.
const CONTRACTOR_TUTORIAL_MILESTONES = {
  // First time RenoFix is opened — explains the board, points at the free
  // tutorial job (which is always still available: booking requires opening
  // RenoFix first, so the flag is unset on the very first open).
  renofixOpened: [
    "There she is — RenoFix. Every room's got a list of what's wrong with it, and my crew fixes 'em for a price. Start with a spare bedroom: that first one's on me, so you learn how it works before you're paying my rates.",
    "Yep, that's the whole place, warts and all. One job at a time, kid — the crew can't be everywhere. Book a spare bedroom repair first; I'll do that one free so you get the hang of it.",
    "That screen's the building's to-do list. The empty bedrooms are where you start — fix one up on my dime and you've got a room to rent out. After that, the meter runs.",
  ],
  // The free tutorial job was just booked — teaches what "day N of M" means.
  tutorialJobBooked: [
    "Good call. Job's in the book — it'll run a few days. You'll see it on RenoFix as 'day N of M' while it's underway, and the room's off-limits while we work, so don't book anything you need.",
    "You're on the schedule, kid. Watch the counter on RenoFix — 'day 1 of 3', then on up. When it hits the end, the room's yours again, good as new.",
    "Job's booked and the crew's got it. It'll tick through 'day N of M' on the RenoFix screen 'til it's done. Don't go in there while the dust is flying — that's a union rule.",
  ],
  // The free tutorial job completed — the "first one's on me" nudge.
  tutorialJobComplete: [
    "First one's on me — the rest, you're paying full price, so don't get used to it. That room's habitable now, and a habitable room is a room that pays rent. We'll get it sorted from here.",
    "There you go — done and done. That one was my treat so you'd know what you're paying for. Next one's at my going rate, and you'll hear about it on the invoice.",
    "She's shipshape, kid. One spare bedroom down, and you could fill the whole wing with paying roommates. Don't get comfortable with the freebie, though — the meter's running now.",
  ],
  // First paid job booked (any facility, either tier direction).
  firstPaidJobBooked: [
    "Yep, that one's on the meter — materials plus my labor, paid upfront. That's my going rate, and I don't haggle, but you're getting it done right the first time.",
    "Now you're spending real money, kid — good. That means you're serious about this place. Paid up front, no refunds, and you'll get professional work.",
    "Paying rates now, huh? Fair enough — that's the price of getting it done right. Money up front, that's how I do business. We'll get it sorted.",
  ],
  // First Upgrade-tier job booked (functional → upgraded).
  firstUpgradeJobBooked: [
    "Now that's a proper upgrade — not patching, making it better. A comfortable room commands real rent. Good instinct, kid.",
    "An upgrade, huh? That's where the money's at — a nicer room rents for a real share of the load. Takes a little longer, but it's worth every day.",
    "Upgrading instead of just patching — I like the way you think. Better rooms mean better rent, and nobody argues with a nice room. This one's worth the wait.",
  ],
  // First roommate moved in (acceptApplicant).
  firstRoommateMovedIn: [
    "So you've got a warm body splitting the rent — that's the game, kid. Keep fixing the place up and each new roommate pays more of the load. Don't let those empty rooms sit.",
    "First roommate's in the books. Every empty room is money walking out the door — get 'em fixed up and filled, and the rent splits get better as the building works again.",
    "Good — another roof on the bill. The more of this place actually works, the more they'll chip in. That's the whole trick right there.",
  ],
  // Apartment quality crossed CONTRACTOR_QUALITY_MILESTONE_THRESHOLD.
  qualityThreshold: [
    "Place is starting to turn a corner, I'll give it that. Your grandfather would've liked seeing it come back to life. Keep going — every room you fix raises what the whole building's worth.",
    "Yep, I can feel it — the place has a pulse again. All this fixing is adding up, kid. A building like this one pays back whatever you put into it.",
    "The building's waking up. Your granddad put twenty years into this place, and it's good to see someone carrying it on. Fix enough of it and it'll carry you.",
  ],
};

// Apartment quality at/above which the qualityThreshold milestone fires.
// Tunable during playtesting — a fresh wreck starts around 0.05, so this
// fires only after a few real repairs.
const CONTRACTOR_QUALITY_MILESTONE_THRESHOLD = 0.25;

// --- Visit spine (src/ref/complete/external-world-npcs-overhaul-plan.md, Phase 1) ---
// world.visits[] is the single source of truth for "who is onsite and why",
// written by every source (renovation jobs today; maid contracts, food
// orders, roommates' friends, player invitations in later phases) and read
// by one question: SIM's getActiveVisits. Records carry absolute-minute
// windows [startAbs, endAbs) (external-world retiming D1); these tuning
// values express the same windows in minutes-from-midnight so the sources
// can build those absolutes directly. The soft cap applies to ORGANIC
// visits only — paid/scheduled visits always honor their booking.
const VISIT_TUNING = {
  softCap: 3,               // concurrent visitors that triggers organic-visit deferral (Phase 6)
  // How many days a retired ('done'/'deferred') visit record is kept before
  // processVisitsForDay sweeps it. getActiveVisits only ever matches an
  // active window, so anything older is inert — but the array is written
  // into the save in full on every boundary, and without a sweep it grows
  // for the life of the playthrough. A week is plenty of slack for anything
  // that wants to look back at recent visits.
  retainDoneDays: 7,
  contractor: {
    startMinute: 540,       // 09:00 — Del's locked presence window (decision 10)
    endMinute: 990,         // 16:30 — weekday only, see isWeekend
  },
  // Purpose-derived activity strings, picked per tick with the tick's
  // seeded rng. The plan's example phrasing ("scrubbing the counters",
  // "running cable") — each purpose gets its own pool so the visitor's
  // activity matches why they're here.
  activities: {
    contractor: ['running cable', 'hanging drywall', 'sanding trim', 'painting the walls', 'fixing the wiring', 'repairing the frame', 'measuring up for trim'],
    // Invited guests and roommates' friends (Phases 2 and 6) — they're here
    // to be sociable, so the pool reads as hanging out rather than working.
    social: ['catching up', 'chatting', 'hanging out', 'laughing at something', 'lounging around'],
    maid: ['wiping down surfaces', 'running the vacuum', 'scrubbing the counters', 'folding things', 'carrying a laundry basket', 'working through the dishes'],
    // Food drivers (Phase 5) — they're at the door with a bag, not settling
    // in, so the pool reads as a handover in progress.
    delivery: ['holding a warm paper bag', 'checking the order slip', 'waiting by the door', 'balancing a stacked delivery bag'],
    // Escorts (Phase 7) — here on a booked appointment, present until the
    // session's window ends. The floor-plan/ambient reading stays suggestive
    // but PG: the explicit content lives in conversation, not in a room label.
    escort: ['waiting by the sofa', 'glancing at the door as you come in', 'settling in like the night has started', 'looking at you like they already know how this goes'],
    default: ['visiting', 'hanging around'],
  },
};

// --- Meal commitments (inventory overhaul Phase 7, D7) ---
// world.commitments[] is the resident-side sibling of world.visits[] — the
// schedule OVERRIDE that relocates an accepted NPC to the dining room for a
// shared meal (see SIM's resolveScheduleActivity). Each invitation is its
// own commitment record (one invitee), so inviting two people to the same
// dinner makes two records that the meal resolution unions. Acceptance is
// decided at invite time, not at the table: an NPC accepts when their
// schedule block at the proposed time is free (not work/commute/sleep) and
// their relationship toward the player clears a noise-blurred threshold —
// a roommate who dislikes you says no, and the reason they give is
// information.
const COMMITMENT_TUNING = {
  // Meal windows in minutes-of-day (RESTAURANT_DEFS.hours' own convention —
  // continuous-simulation roadmap C1: nothing that gates a decision branches
  // on a tick index). Offered as invite targets in exactly this order.
  mealSlots: [
    { id: 'breakfast', label: 'Breakfast', startMinute: 480, endMinute: 600 },  // 08:00-10:00
    { id: 'lunch', label: 'Lunch', startMinute: 780, endMinute: 900 },          // 13:00-15:00
    { id: 'dinner', label: 'Dinner', startMinute: 1140, endMinute: 1320 },      // 19:00-22:00
  ],
  // Day offsets 0..maxInviteAheadDays-1 are offered (today, +1, +2).
  maxInviteAheadDays: 3,
  // Acceptance curve (COMMITMENTS.respondToCommitment): acceptScore =
  // affection − tension×tensionPenaltyWeight, plus a seeded noise draw in
  // ±acceptNoiseRange; accept when the sum clears acceptThreshold. A
  // 0.5-affection roommate always accepts; a −0.3 one always declines;
  // the middle band is a per-save coin (seeded, so reloading never
  // renegotiates an answer).
  acceptThreshold: 0.0,
  acceptNoiseRange: 0.3,
  tensionPenaltyWeight: 0.8,
  // A commitment only overrides these template blocks — if the NPC would be
  // working, commuting, or asleep at the proposed time they can't attend,
  // and the refusal names the reason.
  busyBlocks: ['work', 'commute', 'commute_home', 'sleep'],
  // The "proper setting" bonus (D7): a meal during a scheduled commitment's
  // window was laid out properly — the player gets a mood impulse on top of
  // the food's own values even if nobody else showed, and every attendee
  // gets the comfort restore + mood bonus below.
  settingBonusMood: 0.04,
  attendeeComfortRestore: 8, // NPC comfort restored by a properly set meal
  attendeeMoodBonus: 0.03,   // NPC mood gain for sitting down to dinner
  // Relationship deltas per attendee (DEFS.ACTIONS' mealRelDelta):
  // delta = (relationshipBase + quality×relationshipQualityWeight)
  //        × attendanceMult × (1 + max(0, affection)×relationshipExistingWeight)
  // capped at relationshipCap per meal, with a small tension relief on top.
  relationshipBase: 0.02,
  relationshipQualityWeight: 0.04,
  relationshipExistingWeight: 0.5,
  relationshipCap: 0.05,
  relationshipTensionRelief: 0.01,
  attendanceMultFed: 1.0,
  // Someone who sat down and did NOT get fed. This multiplier already
  // existed and was already the right number; what it lacked was a way to
  // happen on purpose. set_meal used to serve ONE dish and cap the eaters at
  // its servings, so a 1-serving steak with three roommates at the table fed
  // the player and left three people sitting there — silently, with no way
  // for the player to have chosen otherwise. The spread (below) makes
  // catering a decision, and this the price of getting it wrong.
  attendanceMultPresent: 0.5,
  // --- The spread ---
  // A shared meal is several dishes laid out, not one item everybody somehow
  // shares. Servings pool across the whole spread and each person at the
  // table takes one, round-robin across the dishes so a table of four eating
  // pizza + fries + salad eats some of each rather than four slices of pizza.
  //
  // Quality (DEFS.ACTIONS' spreadQuality) is the table's BEST dish plus this
  // much per ADDITIONAL distinct dish: three dishes on the table genuinely is
  // a better dinner than one, and the relationship delta should be able to say
  // so. Bounded by the 0..1 clamp quality already has, so this cannot run
  // away. (Not the mean — averaging made adding a side dish score worse than
  // serving the centrepiece alone, which punished the exact behaviour the
  // spread exists to encourage.)
  spreadVarietyBonus: 0.08,
  // Not a rule about realism — a bound on the picker so one action can't
  // enqueue an unbounded pile of EAT_ITEM lines.
  maxSpreadDishes: 6,
  // How long a held/missed commitment record is kept before the rollover
  // sweep prunes it (same retention rationale as VISIT_TUNING.retainDoneDays).
  retainedDays: 7,
};

// What kinds of thing the household can agree to do together (initiative plan
// Phase 4, D8). commitments.js's header has anticipated a non-'meal' kind since
// it was written — "the same table later serves movie nights, chore agreements,
// and anything else the household agrees to do together" — and the proposal
// channel is the first caller to need one.
//
// `block` is what SIM's resolveScheduleActivity returns while the window is
// live, and it is the whole of what "the invitation binds" means: the resident
// is relocated to `roomId` and their template is overridden for the window.
// The meal entry restates the value that used to be hardcoded there, so the
// generalisation cannot change what a dinner does.
//
// `hangout` uses the EXISTING 'leisure' block rather than inventing one. A new
// block name would appear in no `timeOfDay` in DRIVE_DEFS, so the NPC would
// sit in the room scoring every drive at the out-of-band routine weight —
// effectively doing nothing for the window, which is a convincing description
// of a bug and an unconvincing one of company. Under
// 'leisure' they are in the room, at leisure, available. What there is to
// actually DO together is Phase 5's.
const COMMITMENT_KINDS = {
  meal: {
    block: 'meal',
    label: 'dinner',
    // What the floor plan and the scene lines say while the window is live.
    // Restates the string resolveTick used to hardcode inside its
    // `block === 'meal'` branch, so the generalisation moved it without
    // changing it.
    boundActivity: 'sitting down to dinner',
  },
  hangout: {
    block: 'leisure',
    label: 'time together',
    boundActivity: 'spending time together',
    // Where and when an NPC proposes one. One slot, deliberately: the evening
    // is when this cast is home and off-shift, and a proposal that could land
    // at four different times is a scheduling UI, not a beat.
    roomId: 'living_room',
    slots: [{ id: 'evening', startMinute: 1140, endMinute: 1260 }],  // 19:00-21:00
    // Today and tomorrow. Further out than that and the player has forgotten
    // by the time the window opens.
    maxAheadDays: 2,
  },
  // Vocation plan D18 (Phase 6): what accepting a creator's ask books.
  //
  // `roomId: 'own_bedroom'` is a sentinel resolved by OVERTURE's proposeTerms
  // to the PROPOSER's own room — the other two kinds name a fixed common room,
  // which is right for a dinner and wrong for this. One late slot, because
  // that is when this happens and a kind that could land at four different
  // times is a scheduling UI rather than a beat (the same reasoning `hangout`
  // records above).
  content_collab: {
    block: 'leisure',
    label: 'helping with a shoot',
    boundActivity: 'filming together',
    roomId: 'own_bedroom',
    slots: [{ id: 'late', startMinute: 1290, endMinute: 1410 }],  // 21:30-23:30
    maxAheadDays: 2,
  },
};

// --- Asks (asks-and-attachments-plan.md Phase 1) ---
// The deterministic decision spine for the conversation Request menu. Every
// ask draws seededRng(seed, 'ask_'+category+'_'+npcId+'_'+day+'_'+count) so
// the same save always gives the same answer (D1/D6) — the same convention
// COMMITMENT_TUNING/respondToCommitment uses. Each leaf picks its own
// primary axis; the curve shape (score = axis − tension×tensionPenaltyWeight,
// seeded noise in ±acceptNoiseRange, accept when the sum clears
// acceptThreshold) is shared so a Phase-1 ask reads like a meal invite to
// anyone who knows the codebase.
const ASK_TUNING = {
  acceptThreshold: 0.0,
  acceptNoiseRange: 0.3,
  tensionPenaltyWeight: 0.8,
  // The repeat ladder (D7, Phase 3): consecutive same-category asks within a
  // day escalate — the 2nd draws a small score penalty and NO relationship
  // delta, the 3rd+ a larger penalty AND a negative REL_DELTA (axis below,
  // capped by EFFECT_LIMITS.relDeltaCap). An accepted ask resets the counter.
  // resolveAsk (asks.js) reads the streak and applies all of this; the day
  // rollover sweep lives in sweepAskCounts.
  ladder: {
    secondAskPenalty: 0.05,
    thirdAskPenalty: 0.15,
    thirdAskRelDelta: -0.06,
    relAxis: 'trust',
    resetOnAccept: true,
  },
  loan: {
    defaultAmount: 40,
    amountFromFlavor: true,
    maxByPhase: { early: 20, familiar: 100, close: 300, intimate: 500 },
  },
  chore: {
    // Phase 6 — a tired NPC is less likely to do a favour right now.
    // Energy is the NPC's 0..100 need; the term is (energy-50)/50 ×
    // energyWeight, so a fully rested NPC gets +energyWeight and an
    // exhausted one −energyWeight (affection-neutral at the 50 midpoint).
    energyWeight: 0.2,
  },
  photo: {
    threshold: 'photo', // willingness act — the photo ask's gate (Phase 8)
  },
  // Scheduled asks (Phase 4, D8/D9): the free-slot probe (asks.js
  // freeSlotsFor) finds maximal contiguous runs of non-busy ticks
  // (work/commute/commute_home/sleep are hard blocks, COMMITMENT_TUNING
  // .busyBlocks), then splits each run into bookable windows of at most
  // chunkMinutes — an all-day free run must not pin the NPC for fifteen
  // hours. Anything shorter than minFreeWindowMinutes is a pop-in, not a
  // plan, and is dropped.
  schedule: {
    chunkMinutes: 120,
    minFreeWindowMinutes: 60,
  },
  // Phase 9 — a gift's relationship impact (asks.js ask_gift). The match is
  // deterministic (bible.interests / want / wound vs the item's curated +
  // lexical identity), and the delta follows the plan's rule exactly: a
  // match moves the needle, a miss does not. interest is the strongest
  // signal (they'll actually keep/use it); want/wound are close behind. A
  // miss is deliberately zero — no line is even emitted, so nothing moves.
  // relAxis is the plan's verification axis (relPlayer[affection]).
  gift: {
    relDeltas: { interest: 0.12, want: 0.10, wound: 0.10, miss: 0 },
    relAxis: 'affection',
  },
};

// Weekend rush (src/ref/complete/external-world-npcs-overhaul-plan.md, Phase 4). Del's
// crew works weekdays only, so a job's durationDays are WORKING days and a
// booking made late in the week stretches across the weekend. Paying the
// rush premium keeps them working through it, turning durationDays back
// into plain calendar days — money bought back time, which is the trade
// the whole economy is built on.
const RENOVATION_RUSH_MULTIPLIER = 1.6;

// --- The maid (src/ref/complete/external-world-npcs-overhaul-plan.md, Phase 3) ---
// The contract is alarm-shaped: a per-day grid where each selected weekday
// carries its own start/end time, bounded to the same 09:00-16:30 daytime
// window everyone works (locked decision 11). Priced per onsite HOUR and
// multiplied by each add-on, so the cost scales with both how often she
// comes and how much she does — "expensive quickly by design".
//
// Base scope is common areas only, mirroring SERVICE_DEFS.standard_cleaning's
// accessScope:'common'. The bedrooms add-on maps to accessScope:'all', which
// already carries the boundary-violation/suspicion consequences STEALTH
// models for letting someone into a resident's room.
const MAID_TUNING = {
  ratePerHour: 26,
  // Multiplicative, so stacking add-ons compounds rather than adds.
  addonRateMultipliers: { bedrooms: 1.35, laundry: 1.25, cooking: 1.40 },
  windowMinTick: 18,          // 09:00
  windowMaxTick: 33,          // 16:30
  minVisitTicks: 2,           // one hour minimum per booked day
  // Laundry throughput: the hamper is a 3-state fill (full → partial →
  // empty), and she works it down one step per this many onsite hours.
  // A week of neglect genuinely takes more than one short visit to clear.
  laundryHoursPerStep: 2,
  // Cooking: needs a real stretch onsite before any food gets left behind.
  cookingHoursRequired: 2,
  cookingMealsPerVisit: 2,
  cookingMealItems: ['meal_pasta', 'meal_soup', 'meal_stirfry', 'meal_salad'],
};

// --- Food delivery (src/ref/complete/external-world-npcs-overhaul-plan.md, Phase 5) ---
// A DoorDash-alike: the restaurant's prepMinutes plus travel is how long the
// food takes, and a real driver brings it. Everything here is per-ORDER
// tuning; per-restaurant numbers (prep time, delivery fee, hours, menu
// prices) live with the restaurant in RESTAURANT_DEFS (DEFS.COMPUTER).
const FOOD_TUNING = {
  // Travel on top of the kitchen's prep time. The seeded variance is what
  // makes two identical orders arrive at different times.
  travelMinutesBase: 20,
  travelMinutesVariance: 20,
  // Platform's cut, on top of the restaurant's own delivery fee. Ordering in
  // is meant to be visibly worse value than cooking (design invariant: money
  // pressure is the engine) — the fees are where that shows up.
  serviceFeeRate: 0.15,
  tipOptions: [0, 0.10, 0.18, 0.25],
  defaultTipPct: 0.18,
  // A generous tip is remembered by the person who carried it up the stairs.
  // Applied to the driver's relPlayer on handover — small, but it means the
  // regular who keeps showing up starts out warmer than a stranger.
  tipRelThreshold: 0.18,
  tipRelDelta: { trust: 0.04, affection: 0.04 },
  stiffRelDelta: { trust: -0.02, affection: -0.03 },
  // Drivers are a small persistent pool, not one throwaway NPC per order —
  // "everyone persists forever" (locked decision 5) plus repeat drivers is
  // what makes a delivery person someone you can actually get to know.
  driverPoolSize: 5,
  // The handover window, in minutes. Thirty — long enough that the player
  // can realistically be in the entry to catch the driver, but not absurdly
  // long.
  driverWindowMinutes: 30,
  // How far ahead a scheduled order can be placed, in minutes past the
  // earliest possible arrival.
  maxScheduleAheadMinutes: 360,
};

// QuickCart (grocery delivery, an Instacart parody): same shape as
// FOOD_TUNING, but a shopper works a whole list across a store rather than
// one kitchen firing one dish, so shopping time is deliberately longer than
// DoorDrop's prep — total shop+travel lands 50-100 min, inside "real
// Instacart is often 30-90 minutes." One store, one flat delivery fee (no
// per-restaurant deliveryFeeBase) — groceries are a necessity, priced
// lighter than Nile's flat $8 and DoorDrop's fee stack. No
// maxScheduleAheadMinutes/requestedAbs: a grocery run has no mealtime-style
// urgency to schedule around — order now, watch the ETA count down.
const GROCERY_TUNING = {
  shopMinutesBase: 30,
  shopMinutesVariance: 30,
  travelMinutesBase: 20,
  travelMinutesVariance: 20,
  deliveryFee: 5,
  serviceFeeRate: 0.10,
  tipOptions: [0, 0.10, 0.15, 0.20],
  defaultTipPct: 0.15,
  tipRelThreshold: 0.15,
  tipRelDelta: { trust: 0.04, affection: 0.04 },
  stiffRelDelta: { trust: -0.02, affection: -0.03 },
  shopperPoolSize: 5,
  shopperWindowMinutes: 30,
};

// --- Friends of roommates (src/ref/complete/external-world-npcs-overhaul-plan.md, Phase 6) ---
// Every resident carries a small deterministic circle of friends, stubbed at
// new-game and promoted to full bibles only when a visit is actually planned.
// How often someone hosts is a personality fact, not a global rate: warmth and
// openness are what make a household's social life busy or quiet (locked
// decision 13), so a high/high roommate fills the living room and a low/low one
// almost never has anyone over.
const FRIEND_TUNING = {
  circleMin: 2,
  circleMax: 4,
  // Per resident, per day. base + warmth·w + openness·w, clamped — a 0.9/0.9
  // host lands near 22%/day, a -0.9/-0.9 one at the floor.
  baseHostChance: 0.07,
  warmthWeight: 0.09,
  opennessWeight: 0.07,
  minHostChance: 0.01,
  maxHostChance: 0.30,
  // Evening, 2-4 hours. Deliberately after the 09:00-16:30 window every paid
  // service works, and after a day_shift resident's commute home (SCHEDULES:
  // work ends tick 34, evening starts 36) — a guest who arrives while their
  // host is still at the office would just stand in the living room alone.
  startMinuteMin: 1050,      // 17:30
  startMinuteMax: 1200,      // 20:00
  durationMinutesMin: 120,   // 2h
  durationMinutesMax: 240,   // 4h
  // The same friend doesn't turn up two days running.
  perFriendCooldownDays: 3,
};

// --- Escorts (external-world plan Phase 7) ---
// A persistent pre-generated roster of full NPCs, each with their own base
// rate and advertised service menu (decision 14). Booking is à la carte and
// per-service; the purchased set becomes the visit's dual enforcement.
// Escorts work evenings/nights — deliberately OUTSIDE the 09:00-16:30 window
// every other paid service works (locked decision 11) and after a
// day_shift resident's commute home — so the start-time select offers
// tonight (with a lead-time gap) and tomorrow's afternoon-evening window.
const ESCORT_TUNING = {
  rosterSize: 6,
  // Per-escort base rate (service rates are added on top), rolled
  // deterministically so the roster is stable across sessions.
  baseRateMin: 90,
  baseRateMax: 150,
  // Minimum lead time between booking and visit start — they have to get
  // there — and the floor for any visit's length.
  earliestLeadTicks: 2,
  minVisitTicks: 2,
  // Tonight's window: any start from now+lead up to this tick. A service's
  // duration caps the actual last start (the visit must fit inside the day).
  todayStartTickMax: 44,       // 22:00
  // Tomorrow's window, offered the day before.
  tomorrowStartTickMin: 30,    // 15:00
  tomorrowStartTickMax: 44,    // 22:00
};

// --- Move-in advocacy (src/ref/complete/external-world-npcs-overhaul-plan.md, Phase 8) ---
// External NPCs become residents when a resident (or the player) vouches for
// them in conversation and the player then runs the existing offer flow.
// "Strong relationship" is the gate on BOTH sides, per locked decision 15:
// a resident who advocates must genuinely be close to the person they're
// vouching for, and the acceptance gate requires the player OR some resident
// to be close to the incoming NPC. Thresholds are proposed defaults — tune
// during the Phase 8 playtest. castWeb axes are the NPC↔NPC relationship
// surface (applyNpcToNpcDelta); the phase levels are the same ladder
// deriveConversationPhase uses ('early' < 'familiar' < 'close' < 'intimate').
const MOVE_IN_TUNING = {
  // A resident vouching for someone must have at least this much bond with
  // them (castWeb, resident→target direction), AND be at least this
  // familiar with the player — "strong ties to both" (phase 8 verification).
  residentTrustMin: 0.3,
  residentAffectionMin: 0.3,
  advocatePlayerPhaseMin: 'familiar',
  // Acceptance-side eligibility: the player's own phase with the external
  // OR any resident's strong bond is enough to extend an offer.
  playerPhaseMin: 'close',
};

// Visitor drive allowlist (external-world plan Phase 1): while an external
// NPC resolves through an active visit, only these drives may fire —
// reacting to the player, plus the NPC-to-NPC social drives. Self-care and
// chore drives never run for a visitor: they have no needs to maintain (no
// decay) and no chores to do. Enforced in DRIVES' evaluateDrives alongside
// the renovation construction gate.
// Intimacy & Voyeurism Phase 14 (D3/D14): `intimate` joins the list so an
// OUTSIDE PARTNER who is visiting their committed resident can initiate the
// pair act themselves — symmetric initiation holds on the visit spine, not
// just among residents. (A visitor's solo masturbate stays blocked: they
// have no needs to service, and the pair act is the thing they came here
// for.)
const VISITOR_DRIVE_ALLOWLIST = ['react_to_player', 'seek_company', 'chat_with_roommate', 'intimate'];

// --- Outside partners (Intimacy & Voyeurism Phase 14, D14) -----------------
// The boyfriend/girlfriend who comes over and disappears to her room: some
// residents start in a committed/seeing relationship with someone who does
// NOT live in the apartment (ensureOutsidePartners, sim.js). The partner is
// a full external NPC on the visit spine — they visit on a cadence, follow
// their resident through the flat and into their bedroom, pair up through
// the Phase 13 intimate drive (D3/D13), and sext from afar when apart (the
// sext_partner drive). `partnerChance` is a per-resident probability
// evaluated deterministically (seeded rng), so the same world seed always
// ships the same couples; a resident who already holds a seeing/committed
// record never gains one.
const OUTSIDE_PARTNER_TUNING = {
  partnerChance: 0.35,
  // Visits.
  visitChancePerDay: 0.4,        // per resident per day, rolled at rollover
  visitCooldownDays: 3,          // min gap between visits
  windowStartMinute: 1080,       // 18:00 — partners come by in the evening
  windowEndMinute: 1290,         // 21:30 — latest arrival
  visitDurationMin: 150,
  visitDurationMax: 300,
  // The partner NPC's arrival state. Visitors have no needs decay
  // (external-world plan Phase 1), so their desire stat sits where it was
  // seeded — seed it mid-bar so either side of the pair is a plausible
  // initiator, not just the resident whose desire actually climbs.
  desireSeed: 55,
  // The castWeb axes a couple ships with (warm both ways, sated desire a
  // little below max): what makes the willingness gate open for the pair act
  // and the resident's `intimate` drive outrank solo masturbation the moment
  // they co-locate.
  warmAxes: { trust: 0.6, affection: 0.65, tension: -0.1, respect: 0.5, comfort: 0.7, desire: 0.6 },
  // The long-distance thread (sext_partner drive). Lines are mild, committed-
  // couple banter — deterministic content riding the existing IM thread, the
  // same content tier as AfterHours text, never a prompt string (D15).
  sext: {
    desireFloor: 45,             // drive candidacy door (alongside the partner existing & being away)
    desireGain: 6,               // texting makes it worse — appetite climbs toward the next visit
    moodGain: 0.03,
    cooldownMinutes: 600,
    warmDelta: { affection: 0.02, desire: 0.04 },   // castWeb sender → partner
    lines: [
      'Thinking about you. How was your day?',
      'Can\'t sleep. Wish you were here.',
      'What are you wearing right now? Asking for a friend.',
      'Come over soon. I have plans for you.',
      'This place is too quiet without you in it.',
      'Send me something to remember you by.',
      'I miss the way you smell when you walk in the door.',
      'I dreamed about you last night. The dream was not appropriate.',
    ],
  },
};

const FACILITY_DEFS = {
  // --- Bedroom: habitability (bed + door + light) ---
  // Split into four INDEPENDENT per-bedroom facilities (player + 3
  // auxiliary) by the renovation & occupancy overhaul — each bedroom is its
  // own project with its own tier, condition, and contracted job. The old
  // type-wide shared facility and its RenoFix "Bedrooms" grouping are gone.
  bedroom_habitability_player: {
    id: 'bedroom_habitability_player', label: 'Your Bedroom', room: 'bedroom_player',
    qualityWeight: 3, gatesRecruitment: false, // player's own room never gates recruitment
    appeal: { '*': 1.0 }, // everyone wants a habitable bedroom
    tiers: [
      { tier: 'broken', label: 'Uninhabitable', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'Bare mattress on the floor, no working light, door won\'t close.' },
      // Unused at runtime — the player starts at 'functional' (locked
      // decision #3). Kept for schema symmetry; cost 0 / 0 days because it
      // is never a reachable job target.
      { tier: 'functional', label: 'Habitable', qualityValue: 0.5, cost: 0, durationDays: 0, residentCapacity: 1,
        desc: 'A proper bed, working lamp, door that locks. Someone could live here.' },
      { tier: 'upgraded', label: 'Comfortable', qualityValue: 1.0, cost: 4000, durationDays: 4, residentCapacity: 2,
        desc: 'Quality mattress, blackout curtains, a real desk setup. A room worth renting.' },
    ],
  },
  bedroom_habitability_1: {
    id: 'bedroom_habitability_1', label: 'Bedroom 1', room: 'bedroom_1',
    qualityWeight: 3, gatesRecruitment: true,
    appeal: { '*': 1.0 },
    tiers: [
      { tier: 'broken', label: 'Uninhabitable', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'Bare mattress on the floor, no working light, door won\'t close.' },
      { tier: 'functional', label: 'Habitable', qualityValue: 0.5, cost: 800, durationDays: 3, residentCapacity: 1,
        desc: 'A proper bed, working lamp, door that locks. Someone could live here.' },
      { tier: 'upgraded', label: 'Comfortable', qualityValue: 1.0, cost: 4000, durationDays: 4, residentCapacity: 2,
        desc: 'Quality mattress, blackout curtains, a real desk setup. A room worth renting.' },
    ],
  },
  bedroom_habitability_2: {
    id: 'bedroom_habitability_2', label: 'Bedroom 2', room: 'bedroom_2',
    qualityWeight: 3, gatesRecruitment: true,
    appeal: { '*': 1.0 },
    tiers: [
      { tier: 'broken', label: 'Uninhabitable', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'Bare mattress on the floor, no working light, door won\'t close.' },
      { tier: 'functional', label: 'Habitable', qualityValue: 0.5, cost: 800, durationDays: 3, residentCapacity: 1,
        desc: 'A proper bed, working lamp, door that locks. Someone could live here.' },
      { tier: 'upgraded', label: 'Comfortable', qualityValue: 1.0, cost: 4000, durationDays: 4, residentCapacity: 2,
        desc: 'Quality mattress, blackout curtains, a real desk setup. A room worth renting.' },
    ],
  },
  bedroom_habitability_3: {
    id: 'bedroom_habitability_3', label: 'Bedroom 3', room: 'bedroom_3',
    qualityWeight: 3, gatesRecruitment: true,
    appeal: { '*': 1.0 },
    tiers: [
      { tier: 'broken', label: 'Uninhabitable', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'Bare mattress on the floor, no working light, door won\'t close.' },
      { tier: 'functional', label: 'Habitable', qualityValue: 0.5, cost: 800, durationDays: 3, residentCapacity: 1,
        desc: 'A proper bed, working lamp, door that locks. Someone could live here.' },
      { tier: 'upgraded', label: 'Comfortable', qualityValue: 1.0, cost: 4000, durationDays: 4, residentCapacity: 2,
        desc: 'Quality mattress, blackout curtains, a real desk setup. A room worth renting.' },
    ],
  },
  // --- Kitchen: stove ---
  kitchen_stove: {
    id: 'kitchen_stove', label: 'Kitchen Stove', room: 'kitchen',
    qualityWeight: 4, gatesActions: ['self.cook'],
    appeal: { 'cooking': 2.0, 'crafting': 0.5, '*': 0.5 },
    // D37 (2026-08-18, user decision): 'functional' is the DAY-ONE baseline
    // — the apartment starts with a working (shabby) cooktop so cooking is
    // playable immediately, flavored as a single countertop electric
    // burner. 'broken' survives only as a migration backstop: facility
    // decay floors at 'functional' (locked decision #5), so nothing in play
    // can ever re-break it. 'upgraded' (the gas range) is the paid RenoFix
    // goal, and the functional tier's zero cost/duration mark it as the
    // baseline rather than a purchasable upgrade.
    tiers: [
      { tier: 'broken', label: 'No Cooktop', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'No cooktop — the socket is dead and the coil is gone. No cooking until it\'s replaced.' },
      { tier: 'functional', label: 'Countertop Burner', qualityValue: 0.5, cost: 0, durationDays: 0,
        desc: 'A single countertop electric burner — one coil, slow to heat, quick to burn. Shabby, but it cooks.' },
      { tier: 'upgraded', label: 'Proper Range', qualityValue: 1.0, cost: 6000, durationDays: 6,
        desc: 'A real gas range with oven, exhaust hood, and room for multiple pots.' },
    ],
  },
  // --- Bathroom A: shower/plumbing ---
  bathroom_a_plumbing: {
    id: 'bathroom_a_plumbing', label: 'Bathroom A Plumbing', room: 'bathroom_a',
    qualityWeight: 3, gatesActions: ['self.shower'],
    appeal: { '*': 1.0 },
    tiers: [
      { tier: 'broken', label: 'No Hot Water', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'The shower dribbles cold water. Pipes are corroded.' },
      { tier: 'functional', label: 'Working Shower', qualityValue: 0.5, cost: 1200, durationDays: 4,
        desc: 'Hot water works, toilet flushes, sink drains. A functional bathroom.' },
      { tier: 'upgraded', label: 'Modern Bath', qualityValue: 1.0, cost: 5000, durationDays: 5,
        desc: 'Rainfall showerhead, new vanity, tiled floor. Actually nice.' },
    ],
  },
  // --- Bathroom B: shower/plumbing ---
  bathroom_b_plumbing: {
    id: 'bathroom_b_plumbing', label: 'Bathroom B Plumbing', room: 'bathroom_b',
    qualityWeight: 3, gatesActions: ['self.shower'],
    appeal: { '*': 1.0 },
    tiers: [
      { tier: 'broken', label: 'No Hot Water', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'The shower dribbles cold water. Pipes are corroded.' },
      { tier: 'functional', label: 'Working Shower', qualityValue: 0.5, cost: 1200, durationDays: 4,
        desc: 'Hot water works, toilet flushes, sink drains. A functional bathroom.' },
      { tier: 'upgraded', label: 'Modern Bath', qualityValue: 1.0, cost: 5000, durationDays: 5,
        desc: 'Rainfall showerhead, new vanity, tiled floor. Actually nice.' },
    ],
  },
  // --- Living room: TV/entertainment ---
  living_room_entertainment: {
    id: 'living_room_entertainment', label: 'Living Room Setup', room: 'living_room',
    qualityWeight: 2, gatesActions: ['self.watch_tv'],
    appeal: { 'film': 2.0, 'gaming': 1.5, 'partying': 1.0, 'comedy': 1.0, '*': 0.5 },
    tiers: [
      { tier: 'broken', label: 'No TV', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'A blank wall where a TV should be. The sofa faces nothing.' },
      { tier: 'functional', label: 'TV Setup', qualityValue: 0.5, cost: 600, durationDays: 3,
        desc: 'A TV mounted on the wall with a working streaming stick.' },
      { tier: 'upgraded', label: 'Home Theater', qualityValue: 1.0, cost: 3000, durationDays: 4,
        desc: 'Large TV, soundbar, proper seating arrangement. Movie night.' },
    ],
  },
  // --- Gym equipment ---
  gym_equipment: {
    id: 'gym_equipment', label: 'Gym Equipment', room: 'gym',
    qualityWeight: 2, gatesActions: ['self.workout'],
    appeal: { 'fitness': 2.0, 'yoga': 1.5, 'hiking': 1.0, '*': 0.2 },
    tiers: [
      { tier: 'broken', label: 'Broken Equipment', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'The treadmill motor is dead and the weights are rusted.' },
      { tier: 'functional', label: 'Working Gym', qualityValue: 0.5, cost: 2000, durationDays: 4,
        desc: 'A working treadmill, dumbbells, and a bench. You can get a workout in.' },
      { tier: 'upgraded', label: 'Full Gym', qualityValue: 1.0, cost: 8000, durationDays: 6,
        desc: 'Treadmill, weights, bench, rack, and a proper yoga corner.' },
    ],
  },
  // --- Changing room: plumbing and fixtures ---
  // The east wing's wet room. Its whole mechanical argument is CONDITIONAL
  // relief: it is a third place to get clean, but only worth using if you
  // are already on the pool side of the apartment, so it takes pressure off
  // the two contested bathrooms without flatly removing the contention that
  // makes a shared flat a shared flat. Modest qualityWeight for the same
  // reason — it is a convenience, not a showpiece.
  changing_fixtures: {
    id: 'changing_fixtures', label: 'Changing Room Fixtures', room: 'changing_room',
    qualityWeight: 1, gatesActions: ['self.shower'],
    appeal: { 'fitness': 1.5, 'yoga': 1.0, '*': 0.4 },
    tiers: [
      { tier: 'broken', label: 'Dead Plumbing', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'The shower runs brown for a minute and then not at all. Half the lockers are rusted shut.' },
      { tier: 'functional', label: 'Working Changing Room', qualityValue: 0.5, cost: 1800, durationDays: 3,
        desc: 'Hot water, a working drain, lockers that open. Somewhere to change that isn\'t a bathroom queue.' },
      { tier: 'upgraded', label: 'Spa Changing Room', qualityValue: 1.0, cost: 6500, durationDays: 5,
        desc: 'Rainfall shower, heated benches, proper ventilation and stacked towels.' },
    ],
  },
  // --- Pool room: liner, filtration, pump ---
  // The wing's flagship renovation and the single most expensive thing in
  // the apartment. A pool room is only a pool room in name until the water
  // system actually runs — until then it's a dry tiled basin with a torn
  // liner, sealed in a room with no working ventilation, which is exactly
  // the kind of inherited-wreck detail the opening is built on. Highest
  // qualityWeight of any facility: nothing else moves what a room commands
  // like a working pool.
  pool_systems: {
    id: 'pool_systems', label: 'Pool Systems', room: 'pool_room',
    qualityWeight: 5, gatesActions: ['self.swim'],
    appeal: { 'fitness': 2.0, 'yoga': 1.0, 'hiking': 0.5, '*': 1.2 },
    // Object states this facility OWNS, written when a job completes it
    // (UI's applyFacilityCompletionStates). `swimming_pool.water` was a
    // state the def described and nothing ever set — which is how a pool
    // whose own tier-0 line says "It holds no water" spent the whole game
    // emitting the smell of stagnant green water. The renovation is what
    // puts water in it, so the renovation is what says so.
    completionStates: { swimming_pool: { water: 'filled', clarity: 'clear' } },
    tiers: [
      { tier: 'broken', label: 'Derelict Pool', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'Torn liner, seized pump, filters packed with a decade of dried sludge. It holds no water, and the room smells of it.' },
      { tier: 'functional', label: 'Working Pool', qualityValue: 0.5, cost: 12000, durationDays: 8,
        desc: 'New liner, rebuilt pump, clean filtration. The water is clear and it circulates.' },
      { tier: 'upgraded', label: 'Heated Pool', qualityValue: 1.0, cost: 34000, durationDays: 12,
        desc: 'Heating, proper lighting, and a filtration system that runs itself. Swimmable year round.' },
    ],
  },
  // --- Laundry: washer/dryer ---
  laundry_machines: {
    id: 'laundry_machines', label: 'Laundry Machines', room: 'laundry',
    qualityWeight: 2, gatesActions: ['self.laundry'],
    appeal: { '*': 0.8 }, // everyone needs laundry
    tiers: [
      { tier: 'broken', label: 'Broken Machines', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'The washer doesn\'t drain and the dryer squeals. Useless.' },
      { tier: 'functional', label: 'Working Machines', qualityValue: 0.5, cost: 1800, durationDays: 3,
        desc: 'Washer and dryer both work. You can do laundry at home.' },
      { tier: 'upgraded', label: 'Laundry Suite', qualityValue: 1.0, cost: 4000, durationDays: 4,
        desc: 'Front-loaders, folding station, and a utility sink. Efficient.' },
    ],
  },
  // --- Game room ---
  game_room_setup: {
    id: 'game_room_setup', label: 'Game Room Setup', room: 'game_room',
    qualityWeight: 1, gatesActions: ['self.play_games'],
    appeal: { 'gaming': 2.0, 'comedy': 1.0, 'partying': 1.0, '*': 0.3 },
    tiers: [
      { tier: 'broken', label: 'Empty Room', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'A pool table with no felt and a TV with no console.' },
      { tier: 'functional', label: 'Game Room', qualityValue: 0.5, cost: 1000, durationDays: 3,
        desc: 'A working console, pool table refelted, some board games.' },
      { tier: 'upgraded', label: 'Entertainment Hub', qualityValue: 1.0, cost: 5000, durationDays: 5,
        desc: 'Multiple consoles, arcade cabinet, dartboard, the works.' },
    ],
  },
  // --- Study ---
  study_setup: {
    id: 'study_setup', label: 'Study Setup', room: 'study',
    qualityWeight: 1, gatesActions: ['self.study'],
    appeal: { 'reading': 2.0, 'writing': 2.0, 'coding': 1.5, 'politics': 1.0, 'true crime': 0.5, '*': 0.2 },
    tiers: [
      { tier: 'broken', label: 'Empty Study', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'A desk with a broken lamp and empty bookshelves.' },
      { tier: 'functional', label: 'Working Study', qualityValue: 0.5, cost: 500, durationDays: 2,
        desc: 'A proper desk, lamp, and stocked bookshelves. A quiet place to work.' },
      { tier: 'upgraded', label: 'Library Study', qualityValue: 1.0, cost: 3000, durationDays: 4,
        desc: 'Floor-to-ceiling shelves, leather armchair, reading nook.' },
    ],
  },
  // --- Kitchen: fridge/appliances (cosmetic + quality, no action gate) ---
  kitchen_appliances: {
    id: 'kitchen_appliances', label: 'Kitchen Appliances', room: 'kitchen',
    qualityWeight: 1, gatesActions: [],
    appeal: { 'cooking': 1.5, 'crafting': 0.5, '*': 0.3 },
    tiers: [
      { tier: 'broken', label: 'Old Fridge', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'The fridge hums loudly and the door seal is cracked.' },
      { tier: 'functional', label: 'Working Fridge', qualityValue: 0.5, cost: 800, durationDays: 2,
        desc: 'A quiet, efficient fridge with working seals.' },
      { tier: 'upgraded', label: 'Premium Kitchen', qualityValue: 1.0, cost: 4500, durationDays: 3,
        desc: 'Stainless steel fridge, dishwasher, and a coffee bar.' },
    ],
  },
  // --- Kitchen: freezer (food-overhaul Phase 1, D17) ---
  // The freezer is a working feature from day one ('functional' starting
  // tier, mirroring kitchen_appliances) — freezing and its thaw rules are
  // gameplay, not a purchase. The upgraded tier is a bigger/better chest
  // freezer; equipment tuning (capacity, burn rates) lands in Phase 6's
  // EQUIPMENT_DEFS pass, not here.
  kitchen_freezer: {
    id: 'kitchen_freezer', label: 'Freezer', room: 'kitchen',
    qualityWeight: 1, gatesActions: [],
    appeal: { 'cooking': 1.2, 'crafting': 0.3, '*': 0.2 },
    tiers: [
      { tier: 'broken', label: 'No Freezer', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'No freezer at all — nothing to keep frozen.' },
      { tier: 'functional', label: 'Working Freezer', qualityValue: 0.5, cost: 0, durationDays: 0,
        desc: 'An old chest freezer that hums along fine. Food keeps indefinitely in here.' },
      { tier: 'upgraded', label: 'Big Chest Freezer', qualityValue: 1.0, cost: 1200, durationDays: 2,
        desc: 'A roomy chest freezer with a separate quick-freeze drawer.' },
    ],
  },
  // --- Balcony (cosmetic, no action gate) ---
  balcony_setup: {
    id: 'balcony_setup', label: 'Balcony', room: 'balcony',
    qualityWeight: 1, gatesActions: [],
    appeal: { 'gardening': 2.0, 'yoga': 1.0, 'hiking': 0.5, 'photography': 0.5, '*': 0.3 },
    tiers: [
      { tier: 'broken', label: 'Bare Balcony', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'Empty concrete. The railing is rusted.' },
      { tier: 'functional', label: 'Set Up Balcony', qualityValue: 0.5, cost: 400, durationDays: 1,
        desc: 'A bistro table, some potted plants, cleaned railing.' },
      { tier: 'upgraded', label: 'Garden Balcony', qualityValue: 1.0, cost: 2500, durationDays: 3,
        desc: 'Potted garden, outdoor seating, string lights. A proper retreat.' },
    ],
  },
  // --- Entry / dining / hallways (cosmetic, no action gate) ---
  // These four rooms had no facility at all before the overhaul — no
  // quality contribution, no reno hook. One low-weight facility each, with
  // cheap and fast jobs (repair $200-600 / 1-2d, upgrade $1,000-2,500 /
  // 2-3d), consistent with the balcony/kitchen_appliances cosmetic pattern.
  entry_condition: {
    id: 'entry_condition', label: 'Entry', room: 'entry',
    qualityWeight: 1, gatesActions: [],
    appeal: { '*': 0.3 },
    tiers: [
      { tier: 'broken', label: 'Bare Entry', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'Cracked tile, a dead coat of paint, and a broken light fixture.' },
      { tier: 'functional', label: 'Tidy Entry', qualityValue: 0.5, cost: 300, durationDays: 1,
        desc: 'Fresh paint, a working light, and a mat that isn\'t threadbare.' },
      { tier: 'upgraded', label: 'Welcoming Foyer', qualityValue: 1.0, cost: 1200, durationDays: 2,
        desc: 'A console table, hooks for coats, and a shoe rack. Presentable.' },
    ],
  },
  dining_setup: {
    id: 'dining_setup', label: 'Dining Setup', room: 'dining',
    qualityWeight: 1, gatesActions: [],
    appeal: { 'cooking': 1.5, 'crafting': 0.5, '*': 0.4 },
    tiers: [
      { tier: 'broken', label: 'Empty Dining Room', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'A bare table with mismatched chairs and a bare bulb.' },
      { tier: 'functional', label: 'Set Up Dining Room', qualityValue: 0.5, cost: 400, durationDays: 2,
        desc: 'Matching chairs, a proper overhead light, and a table that seats six.' },
      { tier: 'upgraded', label: 'Host\'s Dining Room', qualityValue: 1.0, cost: 1500, durationDays: 2,
        desc: 'A big table, soft lighting, and room for a dinner party worth throwing.' },
    ],
  },
  hallway_a_upkeep: {
    id: 'hallway_a_upkeep', label: 'Hallway A Upkeep', room: 'hallway_a',
    qualityWeight: 1, gatesActions: [],
    appeal: { '*': 0.2 },
    tiers: [
      { tier: 'broken', label: 'Worn Hallway', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'Scuffed walls, a flickering fixture, and peeling baseboards.' },
      { tier: 'functional', label: 'Tidy Hallway', qualityValue: 0.5, cost: 250, durationDays: 1,
        desc: 'Clean walls, steady lighting, and baseboards that don\'t peel.' },
      { tier: 'upgraded', label: 'Polished Hallway', qualityValue: 1.0, cost: 1000, durationDays: 2,
        desc: 'Fresh paint, framed prints, and a runner that ties the wing together.' },
    ],
  },
  hallway_b_upkeep: {
    id: 'hallway_b_upkeep', label: 'Hallway B Upkeep', room: 'hallway_b',
    qualityWeight: 1, gatesActions: [],
    appeal: { '*': 0.2 },
    tiers: [
      { tier: 'broken', label: 'Worn Hallway', qualityValue: 0, cost: 0, durationDays: 0,
        desc: 'Scuffed walls, a flickering fixture, and peeling baseboards.' },
      { tier: 'functional', label: 'Tidy Hallway', qualityValue: 0.5, cost: 250, durationDays: 1,
        desc: 'Clean walls, steady lighting, and baseboards that don\'t peel.' },
      { tier: 'upgraded', label: 'Polished Hallway', qualityValue: 1.0, cost: 1000, durationDays: 2,
        desc: 'Fresh paint, framed prints, and a runner that ties the wing together.' },
    ],
  },
};

const FACILITY_LIST = Object.values(FACILITY_DEFS);

// Which facilities apply to a given room id. Post-overhaul each bedroom
// maps to its own independent habitability facility, and the entry /
// dining / hallway rooms each carry a cosmetic facility of their own.
const ROOM_FACILITIES = {
  bedroom_player: ['bedroom_habitability_player'],
  bedroom_1: ['bedroom_habitability_1'],
  bedroom_2: ['bedroom_habitability_2'],
  bedroom_3: ['bedroom_habitability_3'],
  kitchen: ['kitchen_stove', 'kitchen_appliances', 'kitchen_freezer'],
  bathroom_a: ['bathroom_a_plumbing'],
  bathroom_b: ['bathroom_b_plumbing'],
  living_room: ['living_room_entertainment'],
  gym: ['gym_equipment'],
  changing_room: ['changing_fixtures'],
  pool_room: ['pool_systems'],
  laundry: ['laundry_machines'],
  game_room: ['game_room_setup'],
  study: ['study_setup'],
  balcony: ['balcony_setup'],
  entry: ['entry_condition'],
  dining: ['dining_setup'],
  hallway_a: ['hallway_a_upkeep'],
  hallway_b: ['hallway_b_upkeep'],
};

// The starting tier for each facility in a new game. The apartment starts
// in disrepair — see src/ref/complete/game-opening-plan.md. The player's own bedroom
// starts 'functional' (habitable day one, not upgraded) while every other
// bedroom and most facilities start 'broken' — the first objective is
// making one auxiliary bedroom habitable so a roommate can move in.
// A few start 'functional' so the opening isn't completely paralyzed
// (kitchen_appliances: the fridge works, just old).
//
// 2026-08-17 audit (D6): BOTH bathrooms now start 'functional' too — the
// plumbing is a WORKING SHOWER (hot water, toilet, drains) at game start,
// not something special. The 2026-08-17 pass set them 'broken', which left
// the player with no way to wash for the entire early repair grind (and
// 'broken' shower tiers describe exactly what a new player was stuck
// with). 'functional' is deliberately NOT 'upgraded' (Modern Bath) — that
// stays a paid RenoFix goal. See bug-fix-audit-2026-08-17.md, finding B4.
//
// 2026-08-18 (D37, food-overhaul user decision): the stove joins that
// list — kitchen_stove now starts 'functional' as a single shabby
// countertop electric burner, because cooking is the food overhaul's
// day-one hook and a broken stove made it unreachable until the mid-game
// repair grind (the D7 starting-groceries day-one-cookable design wants
// the Cook chip live on day one). 'upgraded' (Proper Range) stays the paid
// RenoFix goal; 'broken' survives only as a migration backstop.
const FACILITY_STARTING_TIERS = {
  bedroom_habitability_player: 'functional',
  bedroom_habitability_1: 'broken',
  bedroom_habitability_2: 'broken',
  bedroom_habitability_3: 'broken',
  kitchen_stove: 'functional',
  kitchen_appliances: 'functional',
  kitchen_freezer: 'functional',
  bathroom_a_plumbing: 'functional',
  bathroom_b_plumbing: 'functional',
  living_room_entertainment: 'broken',
  gym_equipment: 'broken',
  pool_systems: 'broken',
  laundry_machines: 'broken',
  game_room_setup: 'broken',
  study_setup: 'broken',
  balcony_setup: 'broken',
  entry_condition: 'broken',
  dining_setup: 'broken',
  hallway_a_upkeep: 'broken',
  hallway_b_upkeep: 'broken',
};

// Sandbox mode house presets (Seasonal Calendar & Sandbox plan, D17). Data,
// not branches — a preset is just the { tier, condition } a sandbox start stamps
// onto every facility in `world.upgrades`. Three presets plus a per-facility
// custom override (defined in the UI, not here). `wreck` is today's baseline
// expressed as a special marker `useStartingTiers` — applySandboxPreset treats
// it as "leave each facility at FACILITY_STARTING_TIERS", never as a copy of
// that table, so the two can never drift. Structural upgrades are NOT part of any
// preset (five independent booleans; presets set none of them).
const SANDBOX_HOUSE_PRESETS = {
  wreck: { useStartingTiers: true },
  lived_in: { tier: 'functional', condition: 70 },
  restored: { tier: 'upgraded', condition: 100 },
};

// Sandbox Pre-Game Editor Overhaul Phase 4 (D7/D9): named economy bundles
// over four fields that already existed in the data model but had never had
// UI (defaultSandboxConfig, menu.js). Same shape and same file as
// SANDBOX_HOUSE_PRESETS above — data, not branches. "Custom" is never an
// entry here; it's the state SANDBOX_TABS.economy's presetRow shows when
// cfg.economy matches none of these (D8's live derivation,
// sandboxActiveDifficultyPreset in menu.js — never a stored flag).
// standard reproduces defaultSandboxConfig's own numbers exactly, so a fresh
// sandbox config shows "Standard" selected, not "Custom" the moment the
// screen opens. comfortable/tight are tuned relative to it: comfortable
// roughly 1.6x the starting money with a 50%-longer grace period and a paid
// tax reserve; tight roughly 0.6x the money with half the grace period and
// bills landing almost immediately — meaningfully tighter than the game's
// own default opening, not an arbitrary offset (see the plan's Open
// questions, now resolved here).
const SANDBOX_DIFFICULTY_PRESETS = {
  comfortable: { money: 6000, rentGraceDays: 21, billsStartDay: 14, taxReserve: 500 },
  standard: { money: ECONOMY.startingMoney, rentGraceDays: ECONOMY.opening.rentGraceDays, billsStartDay: ECONOMY.opening.firstBillDelay + 1, taxReserve: 0 },
  tight: { money: 2200, rentGraceDays: 7, billsStartDay: 3, taxReserve: 0 },
};

// Sandbox Pre-Game Editor Overhaul, Phase 1 (D1/D4): the tab table the whole
// screen renders from — Pattern B (SETTINGS_TABS' shape), extended with an
// optional `subtabs` array per top-level entry. A tab without `subtabs`
// renders its own `sections`/`rows` directly; one with `subtabs` renders a
// second-level strip and delegates to the active sub-tab's `sections`/
// `rows`. Player and Roommates carry no `sections` at all — both are bespoke
// content (D5), dispatched by id/`dynamicInstances` in menu.js rather than
// forced through the generic row shape. House's two sub-tabs stay empty
// stubs (bespoke content, filled by Phase 2's dispatch, not by data here).
// Economy's sections were filled in by Phase 4.
const SANDBOX_TABS = [
  { id: 'player', label: 'Player', icon: '🧍' },
  { id: 'roommates', label: 'Roommates', icon: '👥', dynamicInstances: true },
  { id: 'house', label: 'House', icon: '🏠',
    subtabs: [
      { id: 'layout', label: 'Layout', sections: [] },
      { id: 'facilities', label: 'Facilities', sections: [] },
    ] },
  { id: 'economy', label: 'Economy & Difficulty', icon: '💰',
    sections: [
      { title: 'Difficulty', rows: [
        { id: 'difficultyPreset', kind: 'presetRow', presets: 'SANDBOX_DIFFICULTY_PRESETS',
          label: 'Preset', desc: 'Stamps all four fields below at once. Edit any one by hand to go Custom.' },
      ] },
      { title: 'Starting conditions', rows: [
        { id: 'money', kind: 'number', field: 'economy.money', label: 'Starting money', min: 0, max: 20000 },
        { id: 'rentGraceDays', kind: 'slider', field: 'economy.rentGraceDays', label: 'Rent grace period (days)', min: 0, max: 30 },
        { id: 'billsStartDay', kind: 'slider', field: 'economy.billsStartDay', label: 'Bills start (day)', min: 1, max: 30 },
        { id: 'taxReserve', kind: 'number', field: 'economy.taxReserve', label: 'Starting tax reserve', min: 0, max: 20000 },
      ] },
      // F1 (Discord feedback, 2026-08-23): survival-pacing and cast-feel
      // sliders. Shared verbatim with New Game via GAMEPLAY_OPTIONS_SECTIONS
      // below — this array IS that constant, not a copy of it.
      { title: 'Needs', desc: 'How much day-to-day upkeep (energy, hygiene, hunger, mood) the game asks of you.', rows: [
        { id: 'needDecayScale', kind: 'slider', field: 'economy.needDecayScale', label: 'Need decay speed', min: 0, max: 2, step: 0.1,
          desc: '1× is the default pace. Lower is more forgiving, higher is harder. Ignored if decay is disabled below.' },
        { id: 'needDecayDisabled', kind: 'toggle', field: 'economy.needDecayDisabled', label: 'Disable need decay entirely',
          desc: 'Energy, hygiene, hunger and mood stay exactly where they start. Overrides the speed slider above.' },
      ] },
      { title: 'Cast disposition', desc: 'Soft biases on the people you live with — never override a hard no.', rows: [
        { id: 'dispositionSkew', kind: 'slider', field: 'economy.dispositionSkew', label: 'Cast warmth', min: -1, max: 1, step: 0.1,
          desc: 'Biases rolled roommates’ temperament — negative for a harsher cast, positive for a friendlier one. Hand-authored roommates are never overridden.' },
        { id: 'willingnessBaseline', kind: 'slider', field: 'economy.willingnessBaseline', label: 'NPC receptivity', min: -1, max: 1, step: 0.1,
          desc: 'A soft bias on how readily NPCs say yes to intimacy. Asleep, hostile, a stranger, or an active refusal always still blocks it, regardless of this slider.' },
      ] },
      // F5 (Discord feedback, 2026-08-24): same shared-array trick as Needs
      // above — this section is also sliced into GAMEPLAY_OPTIONS_SECTIONS,
      // so it's one row set for both Sandbox and New Game.
      { title: 'Phone battery', desc: 'How fast the phone drains on its own.', rows: [
        { id: 'phoneBatteryScale', kind: 'slider', field: 'economy.phoneBatteryScale', label: 'Battery drain speed', min: 0, max: 3, step: 0.1,
          desc: '1× is the default pace. Lower drains slower, higher drains faster. Ignored if Always Charged is on below.' },
        { id: 'phoneBatteryAlwaysCharged', kind: 'toggle', field: 'economy.phoneBatteryAlwaysCharged', label: 'Always Charged',
          desc: 'The phone never runs out of battery, plugged in or not. Overrides the drain slider above.' },
      ] },
    ] },
];

// F4 (Discord feedback, 2026-08-24): the cheat menu's tab rail. Unlike
// SANDBOX_TABS/SETTINGS_TABS this carries no `sections`/rows — every tab's
// content is live gameplay state (currentGameState.player/meta.clock/npcs/
// world), not a flat pre-game draft object, so each pane is bespoke-rendered
// in ui.js rather than run through the generic dot-path row system.
const CHEAT_TABS = [
  { id: 'player', label: 'Player', icon: '🧍' },
  { id: 'time', label: 'Time', icon: '🕐' },
  { id: 'npcs', label: 'NPCs', icon: '👥' },
  { id: 'world', label: 'World', icon: '🏠' },
];

// F1 (Discord feedback, 2026-08-23): the SAME array reference SANDBOX_TABS'
// economy tab uses for its last two sections — New Game's options screen
// (studio.js) renders these exact sections too, so the two flows can never
// drift on what "gameplay options" means. Sliced by title rather than
// hand-duplicated so adding a new gameplay-options row to the Sandbox tab
// above is automatically also a New Game option, with nothing to remember
// to update twice.
const GAMEPLAY_OPTIONS_SECTIONS = SANDBOX_TABS.find((t) => t.id === 'economy').sections
  .filter((s) => s.title === 'Needs' || s.title === 'Cast disposition' || s.title === 'Phone battery');

// --- Daily goals (quests), sourced from resident wants/wounds/interests ---
const QUEST_TEMPLATES = [
  { type: 'want', template: "Help {name} with something on their mind: {detail}", rewardMoney: 40, rewardRelation: { affection: 0.1 } },
  { type: 'wound', template: "Check in on {name} — they've been guarded about {detail} lately", rewardMoney: 20, rewardRelation: { trust: 0.1 } },
  { type: 'interest', template: "Bond with {name} over {detail}", rewardMoney: 15, rewardRelation: { affection: 0.05 } },
];

const QUEST_CONFIG = {
  maxActive: 3,
  expiryDays: 3,
  generateChancePerDay: 0.6,
};

// --- Needs ---
// Phase 5 (D1) re-based two of these: HUNGER is no longer a per-tick bar
// (no decayPerTick here — it's the hoursSinceLastMeal rhythm, see
// HUNGER_RHYTHM below) and MOOD is no longer a directly-written bar (no
// decayPerTick here — it eases toward MOOD_TARGET, see below). energy and
// hygiene stay per-tick rates, both scaled by NEEDS.idleDecayMultiplier
// while idling (D12).
// Heartbeat plan Phase 1 added a per-MINUTE form of every rate, meant to sit
// alongside the per-tick forms until Phase 2's heartbeat switched readers
// over to it. It never did: decayPlayerNeeds (SIM) instead kept the
// per-tick rate and multiplies it by a FRACTIONAL tick count
// (minutes/CLOCK.tickMinutes) — mathematically identical to rate/30*minutes,
// chosen to stay byte-exact with old saves on whole-30-min spans and avoid a
// second source of float drift — and applyNeedsHeartbeat's NPC path reads
// its own separate npc*PerMinute constants below, never these. The
// decayPerMinute fields this comment used to describe were dead from the
// day Phase 3 shipped; removed rather than wired up a second time, per the
// same dead-field-triage precedent as the NPC correctness plan's Phase 5
// (this audit's gap-fix).
const NEEDS = {
  // sleepRestore moved to the SLEEP block — energy recovered by sleeping is
  // now a function of hours actually slept, not a flat per-tick rate.
  energy:  { decayPerTick: 2,  max: 100, warnBelow: 20, workCost: 8 },
  // hunger has no decayPerTick since Phase 5 — the display value is derived
  // from HUNGER_RHYTHM; max/warnBelow keep serving the header bars (warnBelow
  // = "you should eat soon", ~14h since the last meal).
  hunger:  { max: 100, warnBelow: 20 },
  hygiene: { decayPerTick: 1,  max: 100, warnBelow: 25, washRestore: 60 },
  // Player mood lives on the same [-1, 1] scale as NPC mood (relPlayer
  // axes, castWeb axes, moodDelta application all assume -1..1). warnBelow
  // drives the header bar's low flag; the bar itself only moves via the
  // easing toward MOOD_TARGET in SIM's decayPlayerNeeds.
  mood:    { max: 1, warnBelow: -0.6 },
  // D12: minutes spent IDLING (the continuous clock's sim checkpoints —
  // TIME's runSimCheckpoint) decay needs at this fraction of the rate of
  // minutes spent acting. Sitting on the narration log must not punish you
  // like taking actions does.
  idleDecayMultiplier: 0.25,
  // NPC Overhaul Phase 6 — comfort + stimulation needs
  comfort:    { decayPerTick: 0.5, max: 100, warnBelow: 20, warnAbove: 80 },
  stimulation: { decayPerTick: 1,   max: 100, warnBelow: 20, warnAbove: 80 },
  // --- NPC need economy (correctness plan Phase 4, D10-D14) ---
  //
  // These rates were rebalanced because five of the six needs sat permanently
  // at a floor or a ceiling, which made needsLine (LLM) read almost
  // identically for every NPC on every turn, and made the drives gated on
  // them unreachable. The audit numbers, per 48-tick day, before:
  //
  //   hygiene     -48  vs +112 restore  → pinned at 100; `shower` (gate <30)
  //                                       could NEVER fire
  //   social      -96  vs +4/tick only when co-located → pinned near 0
  //   stimulation -48  vs leisure-block only, and no weekday shift template
  //                                       HAS a leisure block → pinned at 0
  //   hunger     -144  vs +72 passive    → chronically low
  //   comfort     -24  vs +3/tick but only with an upgraded facility → 0
  //   energy      -96  vs +90 on sleep   → roughly balanced (left alone)
  //
  // D10/D11: hunger and hygiene have NO passive restore any more. Both are
  // drive-serviced — the eat drive really consumes food from the fridge, and
  // showering is what makes you clean. A block-keyed passive restore was
  // doing the drive's job better than the drive could, which is why the
  // shower drive had been mechanically dead since it was written (and with
  // it the towel clothing state, NPC water metering, and a peep target).
  npcEnergyDecay: 2,
  npcEnergyDecayPerMinute: 2/30,
  // D11: 3 → 1.5. Tuned against measured drive throughput, not by feel: the
  // eat drive can only fire on non-transit ticks inside its timeOfDay set,
  // which works out to roughly one meal a day per NPC. At 2/tick a meal (which tops
  // out at NPC_INVENTORY.eatUntilHunger = 65) burned off in ~33 ticks and the
  // cast lived at an average hunger of 20.
  npcHungerDecay: 1.5,
  npcHungerDecayPerMinute: 1.5/30,
  npcHygieneDecay: 1,       // ~1 shower/day needed at 48 ticks (D10)
  npcHygieneDecayPerMinute: 1/30,
  npcSocialDecay: 1,        // D12: 2 → 1
  npcSocialDecayPerMinute: 1/30,
  // NPC Overhaul Phase 6 — NPC comfort + stimulation decay rates
  npcComfortDecay: 0.5,
  npcComfortDecayPerMinute: 0.5/30,
  npcStimulationDecay: 1,
  npcStimulationDecayPerMinute: 1/30,
  npcSocialMax: 100, // hunger/hygiene/energy each carry their own .max above; social has no player-facing counterpart, so its max lives here
  // NPC need restoration per tick, keyed to schedule block rather than
  // parsing activity strings (activity labels are flavor text, not a
  // structured need signal). Without these, NPC needs only ever decayed —
  // written but never read back into consequence.
  //
  // npcEatRestore and npcHygieneRestore are GONE (D10/D11) — deleting the
  // rates alongside the code that read them, so a future reader can't
  // reintroduce a passive restore by wiring up an orphaned constant.
  npcSleepRestore: 6,    // per tick while in the 'sleep' block
  npcSleepRestorePerMinute: 6/30,
  // A committed dinner (inventory overhaul Phase 7, D7) survives D11's
  // removal of passive hunger restore: a 'meal' block is an NPC actually
  // sitting down at the table, which is a real act with a real commitment
  // record behind it, not background topping-up.
  npcMealRestore: 12,    // per tick while in the 'meal' block
  npcMealRestorePerMinute: 12/30,
  npcSocialRestore: 5,   // D12: 4 → 5, per tick sharing a room with another resident
  npcSocialRestorePerMinute: 5/30,
  // NPC Overhaul Phase 6 — comfort + stimulation restore
  npcComfortRestore: 2,     // per tick in a comfortable room (living room with working entertainment, or an UPGRADED bedroom)
  npcComfortRestorePerMinute: 2/30,
  // D14: a small unconditional floor in the living room or your own bedroom,
  // regardless of upgrade tier. The upgrade incentive is preserved (2 vs 0.5);
  // what's removed is the pre-upgrade state where comfort could only ever
  // fall, so every NPC in a starting apartment read as permanently miserable.
  // 0.5 exactly cancels npcComfortDecay, so a comfortable room HOLDS comfort
  // rather than raising it — the facility upgrade is what actually restores.
  npcComfortBaselineRestore: 0.5,
  npcComfortBaselineRestorePerMinute: 0.5/30,
  npcComfortProximityBonus: 2, // extra comfort when sharing a room with a trusted NPC (comfort > 0.5 in castWeb)
  npcComfortProximityBonusPerMinute: 2/30,
  // D13: 4 → 2. The passive restore is deliberately smaller than the
  // seek_stimulation drive's +20, so the DRIVE is what relieves boredom and
  // the passive trickle only slows the slide. At 4/tick over the widened
  // block set the need pinned at ~84 and its drive never fired — the same
  // failure as the old hygiene ceiling, just in a different need.
  npcStimulationRestore: 2,
  npcStimulationRestorePerMinute: 2/30,
};

// --- Hunger rhythm (Phase 5, D1; food-overhaul Phase 2, D2/D3/D4) ---
// Hunger is a rhythm, not a treadmill. Phase 5's real state was
// hoursSinceLastMeal (game-hours since the last meal, advanced by
// decayPlayerNeeds and scaled by NEEDS.idleDecayMultiplier and
// SLEEP.hungerMultiplier). The food overhaul (Phase 2) keeps the rhythm and
// the 0-100 derived display but changes the inputs (D2/D3): the canonical
// real state is now the D3 FULLNESS WINDOW — fullnessRemainingHours /
// fullnessWindowHours, baseline game-hours — drained at a living metabolic
// rate (see METABOLISM) instead of a flat 5/hr. mealsToday still counts
// meals (reset at day rollover), now keyed to REAL meals (kcal ≥
// METABOLISM.minKcalForMeal, D4) rather than any positive hunger delta.
// player.hunger stays a DERIVED display value — recomputed by SIM's
// decayPlayerNeeds and whenever the player eats — so every existing reader
// (NEED_CONSEQUENCES, the LLM prompt's Hunger line, the header bars, NPC
// reactions) keeps working with no migration. The satiety mapping bottoms
// out at 0 exactly when the fullness window is exhausted (the old
// starveHours for legacy saves), which is what fires the existing
// NEED_CONSEQUENCES.hunger path. The band ladder carries the mechanical
// effects (mood penalty — see resolveMoodTarget). bandsHours is the legacy
// hour-keyed ladder, kept for the old single-arg satietyFrom/hungerBand
// call shape (migration and pre-overhaul readers).
const HUNGER_RHYTHM = {
  satietyStart: 90,     // display satiety with a full window ("just ate")
  satietyPerHour: 5,    // legacy: satiety = satietyStart - hours×perHour (old clock)
  starveHours: 18,      // legacy default window; the old hours-to-starve line
  mealsPerDayCap: 4,    // mealsToday saturates here (display/bonus hygiene)
  // Fraction-of-window-remaining ladder (Phase 2): a band is where you are
  // in your meal, not hours on an 18h clock. Remaining ≥ minFrac × window.
  bands: [
    { minFrac: 0.5,  key: 'satisfied',   label: 'Satisfied',   moodPenalty: 0 },
    { minFrac: 0.25, key: 'peckish',     label: 'Peckish',     moodPenalty: 0 },
    { minFrac: 0.1,  key: 'hungry',      label: 'Hungry',      moodPenalty: -0.02 },
    { minFrac: 0.001, key: 'very_hungry', label: 'Very hungry', moodPenalty: -0.05 },
    // No workPenalty flag here — a hungry mood flows into work output
    // transitively via the mood bar (COMPUTER's getWorkFocus reads
    // player.mood). A separate flag would be a second, silent tuning surface.
    { minFrac: 0, key: 'starving', label: 'Starving', moodPenalty: -0.08 },
  ],
  bandsHours: [
    { maxHours: 4, key: 'satisfied',   label: 'Satisfied',   moodPenalty: 0 },
    { maxHours: 8, key: 'peckish',     label: 'Peckish',     moodPenalty: 0 },
    { maxHours: 12, key: 'hungry',     label: 'Hungry',      moodPenalty: -0.02 },
    { maxHours: 18, key: 'very_hungry', label: 'Very hungry', moodPenalty: -0.05 },
    { maxHours: Infinity, key: 'starving', label: 'Starving', moodPenalty: -0.08 },
  ],
};

// --- Metabolism (food-overhaul Phase 2, D2/D3/D4) ---
// The hunger clock's living rate. D2: the flat 5/hr drain becomes a
// multiplier over the fullness window that ebbs with activity (exercise and
// gig work push decaying impulses into player.meta.activityEvents) and the
// PREVIOUS day's energy balance (deficit days run hot — hungrier sooner;
// surplus days run a hair cool). D3: meal size sets the window — ~1h of
// fullness per kcalPerFullnessHour kcal, with diminishing returns on feasts
// (fullnessTaperAt/Rate) and a hard cap so a feast can't outlast a day.
// D4: the daily ledger (kcalToday intake vs kcalBurnedToday expenditure,
// accumulated in SIM's decayPlayerNeeds) rolls at day rollover into a
// day-mode (energyBalance: deficit|balanced|surplus) that re-tunes the rate
// below, sleep recovery (deficitEnergyRestoreMult — see UI's doSleep) and a
// small persistent mood term (MOOD_TARGET.needsTerm). mealsToday is keyed to
// real meals (minKcalForMeal) instead of any positive hunger delta.
const METABOLISM = {
  baseRate: 1.0,               // D2 — the multiplier when idle and balanced
  minRate: 0.6,                // surplus + never below this floor
  maxRate: 2.5,
  kcalPerFullnessHour: 200,    // D3 — ~1h of fullness per 200 kcal (D3 says "approx 250"; 200 makes a 600-kcal home dinner a ~3h window and a 1000-kcal restaurant dinner the "fed for the evening" case)
  fullnessFloorWindow: 0.75,   // even a real bite feeds you at least this long (baseline h)
  fullnessTaperAt: 6,          // baseline h of window before diminishing returns kick in
  fullnessTaperRate: 0.5,      // beyond taperAt, extra kcal count at this fraction
  fullnessCapHours: 12,        // one meal's worth (plus carryover) can never exceed this
  activityHalfLifeDays: 0.5,   // an exercise impulse halves every half day (~gone by tomorrow)
  activityPruneBelow: 0.01,
  activityMaxTerm: 0.8,
  basalKcalPerHour: 75,        // D4 — basal expenditure (~1800 kcal/day)
  // The "activity meter" (D2/D4): per-action impulse (raises the rate while
  // it decays) and the explicit kcal credited to the ledger at the action.
  activities: {
    workout:   { impulse: 0.5,  kcal: 300 },
    swim:      { impulse: 0.45, kcal: 280 },
    workBlock: { impulse: 0.15, kcal: 60 },  // a gig block — active work, not a couch sit
  },
  deficitThresholdKcal: 300,   // burn − intake ≥ this → the NEXT day runs in deficit
  surplusThresholdKcal: 300,   // intake − burn ≥ this → the NEXT day runs in surplus
  deficitRateAdjust: 0.2,      // deficit day: hunger clock ×(1 + this)
  surplusRateAdjust: -0.1,     // surplus day: hunger clock ×(1 − this), floored at minRate
  deficitEnergyRestoreMult: 0.9,  // D4 — deficit slows sleep recovery
  surplusEnergyRestoreMult: 1.05,
  minKcalForMeal: 250,         // mealsToday counts only meals this big (D4)
};

// --- Plate instances (food-overhaul Phase 3, D5/D6/D25/D27/D28) ---
// The home-cooked meal as an INSTANCE (stack.meta.plate) rather than a
// fixed meal_* def: kcal and quality genuinely computed at cook time from
// the ingredients consumed (D5), a batch with servings (D6/D25), leftovers
// that rot on the normal ladder and reheat (D7), and the hot-vs-frozen
// mood rules (D27/D28). Phase 3's meal bonus resolves the parked open
// question: food-GROUP variety (starchy/protein/vegetable/...) — the
// plan's default — because it rewards a balanced plate without pretending
// to nutrition science (each ingredient def carries ONE `foodGroup`; the
// builder reads it through ITEMS' foodGroupOf). Quality here is a
// Phase-3-only approximation (base + ingredient quality + group variety);
// Phase 5's cooking engine owns real quality from Phase 5 on, and its
// computeGrade() replaces the placeholder ladder below. A plate is a
// SNAPSHOT (design invariant 1): none of this is ever re-derived at eat
// time — the numbers on the instance ARE the food.
const PLATE_TUNING = {
  groupBonusKcal: 100,        // D5 meal bonus per distinct food group beyond the first
  baseQuality: 0.5,           // quality floor of a home-cooked plate
  qualityFromFood: 0.8,       // contribution of the ingredients' shared foodQuality (DEFS.ACTIONS) reader
  qualityFromVariety: 0.07,   // per distinct food group beyond the first
  qualityMoodScale: 0.05,     // plate quality → per-serving mood impulse (0.05 × quality ≈ the meal_* 0.02–0.04 band)
  frozenEatenPenalty: 0.04,   // D28 — eating ordinary food still frozen costs this much mood per serving
  qualityCap: 0.95,
  // Component stage word per cooking method — Phase 3 recipes declare a
  // simple method (boil/fry/stir_fry/...); the stage on each plate
  // component reads THIS table so the shape Phase 5's engine fills is the
  // same shape Phase 3 already produces. (Phase 5: the engine overrides
  // stages for 'none' methods with the prep verb's stage word.)
  stagesByMethod: {
    boil: 'boiled', simmer: 'simmered', fry: 'fried', saute: 'sautéed',
    sear: 'seared', bake: 'baked', roast: 'roasted', stir_fry: 'stir-fried',
    steam: 'steamed', none: 'prepared',
  },
};

// --- Dishes & cookware (food-overhaul Phase 4, D9/D10/D11) ---
// Dish dirt is now per-TYPE and capacity-modeled. A kitchen surface holds a
// MAP of dirty counts (obj.dishes, e.g. { pot: 1, pan: 1, plate: 3 }), and
// each type claims a number of DISH UNITS (obj.dishUnits = Σ count×unit) in
// the sink/dishwasher — that unit count is what washing capacity is measured
// against (D11). DISH_DEFS is the SINGLE owning table for dish types;
// `sizeL` + `capabilities` are the D10 cookware-capability data declared
// here so Phase 5's cooking engine reads ONE table when it gates methods on
// what a pot can do (a recipe's `cookware` ids match these keys).
const DISH_DEFS = {
  plate:         { label: 'Plate',         unit: 1 },
  bowl:          { label: 'Bowl',          unit: 1 },
  cup:           { label: 'Cup',           unit: 1 },
  glass:         { label: 'Glass',         unit: 1 },
  fork:          { label: 'Fork',          unit: 1 },
  knife:         { label: 'Knife',         unit: 1 },
  cutting_board: { label: 'Cutting board', unit: 1 },
  pot:           { label: 'Pot',           unit: 3, sizeL: 5, capabilities: ['boil', 'simmer', 'steam'] },
  pan:           { label: 'Frying pan',    unit: 2, sizeL: 2, capabilities: ['fry', 'saute', 'sear'] },
  wok:           { label: 'Wok',           unit: 2, sizeL: 4, capabilities: ['stir_fry'] },
  baking_tray:   { label: 'Baking tray',   unit: 2, capabilities: ['bake', 'roast'] },
};

// Dish-producing rules (D9): what generates which dirty dishes, and when a
// dish-carrying surface reads as dirty. `cookFootprint` is keyed by recipe
// method; `prep` tools are added to EVERY cooked recipe (chopping/prep is
// where the knife and board come from — a no-cook meal like a sandwich
// dirties only those). `eatFootprint` is one solo eating event (self.eat),
// `setMealFootprint` is what ONE served eater at a set_meal table leaves.
// The 'clean'/'few'/'many' ladder is DERIVED from a surface's dish-unit
// count (ITEMS' dishLevelOf, thresholds below) — the maps are the world
// state, the ladder is never stored, so the dirty_dishes signal and room
// cleanliness can't desync from what actually got dirtied (the same
// derive-don't-mirror rule the rot signal follows).
const DISH_TUNING = {
  cookFootprint: {
    boil:     { pot: 1, pan: 1 },   // the boil pot + a pan for the sauce
    simmer:   { pot: 1 },
    fry:      { pan: 1 },
    stir_fry: { wok: 1 },
    bake:     { baking_tray: 1 },
    none:     {},                    // no cookware — prep tools only
  },
  prepFootprint: { knife: 1, cutting_board: 1 },
  eatFootprint: { plate: 1, fork: 1 },             // self.eat, per serving
  setMealFootprint: { plate: 1, cup: 1, fork: 1 }, // set_meal, per served eater
  sinkDirtyAtFew: 2,       // dish units ≥ this → derived 'few'
  sinkDirtyAtMany: 8,      // dish units ≥ this → derived 'many'
};

// Washing capacity (D11). Hand-wash clears a skill-scaled number of units
// per self.dishes action (4 base → 10 at max cleaning skill); the
// dishwasher clears capacityUnits per cycle and is busy for cycleMinutes —
// lazily completed against the continuous clock (cycleActiveUntilAbs, the
// same anchor pattern as THAW_TUNING — never a per-tick loop). The
// machine's per-tier numbers are EQUIPMENT_DEFS.dishwasher.tiers (Phase 6
// D12 — the single owning table, indexed by the kitchen_appliances
// FACILITY_DEFS ladder); this block holds the hand-wash/sink constants
// only. Sink capacity is deliberately PRESSURE-ONLY (D33): a full sink
// never blocks cooking, it just escalates the dirty_dishes signal and the
// room's cleanliness pressure.
const DISHWASH_TUNING = {
  sinkCapacityUnits: 14,
  handWashBaseUnits: 4,
  handWashMaxUnits: 10,       // at max cleaning skill
  handWashMinutesPerUnit: 2,
  dishwasherMinLoadUnits: 4,  // NPC cleaners only bother with the machine at this many units
};

// --- Equipment (food-overhaul Phase 6, D12/D13/D14) ---
// The kitchen's equipment as a table of tiers, each riding an existing
// FACILITY_DEFS (the RenoFix renovation pipeline) — EQUIPMENT_DEFS is the
// SINGLE owning definition for what a tier of that facility does to the
// cooking engine and the kitchen's throughput. cooking.js's
// equipmentState() composes the rows the current world.upgrades tier picks
// into one state object every engine reader already knows; nothing else in
// the engine reads these tables directly.
//   stove      (kitchen_stove ladder) — burners (parallel cooking / the
//              display), burnRiskMult (D13: a good range burns less),
//              tempPrecision (temperature control — a matched heat pays
//              more and a missed heat hurts less), autocookSteps (D14: how
//              many grade-steps an upgrade lowers the auto-cook threshold).
//   oven       (kitchen_stove ladder) — PRESENT only on the upgraded
//              Proper Range (D37: the day-one Countertop Burner has no
//              oven). Not a hard gate: bake/roast without an oven read as
//              a heat mismatch (improvising), so they stay possible but
//              rougher — D37's "cooking is playable day one" holds for the
//              starter kitchen.
//   mixer      (kitchen_appliances ladder) — unlocks the mixing verbs
//              (knead/whip/blend, D12) and processTimeMult scales mixing
//              step minutes (a stand mixer is faster).
//   dishwasher (kitchen_appliances ladder) — capacityUnits per cycle and
//              cycleMinutes; read by ITEMS' dishwasherCapacityUnits/
//              dishwasherCycleMinutes (the DISHWASH_TUNING.tiers of
//              Phase 4 live here now — one table, invariant 5).
//   microwave  (kitchen_appliances ladder) — present + reheatMinutes,
//              read by self.microwave's prepare (Phase 3's stove reheat is
//              the 10-min fallback; the microwave is 3/1 min by tier).
//   freezer    (kitchen_freezer ladder) — tier LABELS only. The actual
//              preservation number stays in ROT.preservation.freezer
//              (Phase 1, D18/D30 — the storage-class row is the owner);
//              this entry exists so equipment readers/renders can name the
//              freezer's tiers without a second copy of the number.
const EQUIPMENT_DEFS = {
  stove: {
    facility: 'kitchen_stove',
    tiers: [
      { tier: 'broken', burners: 0, burnRiskMult: 1.2, tempPrecision: 0, autocookSteps: 0 },
      { tier: 'functional', label: 'Countertop Burner', burners: 1, burnRiskMult: 1.0, tempPrecision: 0, autocookSteps: 0 },
      { tier: 'upgraded', label: 'Proper Range', burners: 4, burnRiskMult: 0.75, tempPrecision: 1, autocookSteps: 1 },
    ],
  },
  oven: {
    facility: 'kitchen_stove',
    tiers: [
      { tier: 'broken', present: false, tempPrecision: 0 },
      { tier: 'functional', present: false, tempPrecision: 0 },
      { tier: 'upgraded', present: true, tempPrecision: 1 },
    ],
  },
  mixer: {
    facility: 'kitchen_appliances',
    tiers: [
      { tier: 'broken', processTimeMult: 1.2, unlocks: [] },
      { tier: 'functional', label: 'Hand Mixer', processTimeMult: 1.0, unlocks: ['whisk', 'knead', 'blend'] },
      { tier: 'upgraded', label: 'Stand Mixer', processTimeMult: 0.8, unlocks: ['whisk', 'knead', 'blend'] },
    ],
  },
  dishwasher: {
    facility: 'kitchen_appliances',
    tiers: [
      { tier: 'broken', capacityUnits: 0, cycleMinutes: 0 },
      { tier: 'functional', capacityUnits: 8, cycleMinutes: 45 },
      { tier: 'upgraded', capacityUnits: 12, cycleMinutes: 40 },
    ],
  },
  microwave: {
    facility: 'kitchen_appliances',
    tiers: [
      { tier: 'broken', present: false, reheatMinutes: 0 },
      { tier: 'functional', label: 'Countertop Microwave', present: true, reheatMinutes: 3 },
      { tier: 'upgraded', label: 'Built-in Microwave', present: true, reheatMinutes: 1 },
    ],
  },
  freezer: {
    facility: 'kitchen_freezer',
    tiers: [
      { tier: 'broken', label: 'No Freezer' },
      { tier: 'functional', label: 'Working Freezer' },
      { tier: 'upgraded', label: 'Big Chest Freezer' },
    ],
  },
};

// --- Auto-cook (food-overhaul Phase 6, D14/D15) ---
// Cooking a recipe to a grade at or above its auto-cook threshold unlocks
// INSTANT cook for it forever (given ingredients on hand): ingredients are
// consumed, quality is rolled automatically, and the plate comes out at or
// above the threshold's quality floor — a mastered recipe is reliably
// reproduced. Equipment lowers the threshold: the stove's autocookSteps
// move it down the GRADES ladder (upgraded: A- → B, D14's worked example
// — a recipe already cooked to B unlocks under a better stove). 'A-' as
// the base is the deliberate bar: a tier-1 cook has to genuinely cook
// well once before autopilot opens (D15 — auto-cook is first-class, not
// the default).
const AUTO_COOK_TUNING = {
  baseGrade: 'A-',
};

// --- Cooking engine (food-overhaul Phase 5, D8/D14/D16) ---
// The interactive manual loop: verbs × ingredient stages × methods, with
// fats/seasonings as real reagents and an F–S+ grade at the end. COOK_TUNING
// is the single owning definition for the engine's numbers; METHODS (the
// D10 cookware-gated method table) and GRADES (the D14 ladder) are its
// vocabulary tables, all below. cooking.js is the pure consumer — Phase 6
// wires real EQUIPMENT_DEFS through its equipmentState() without touching
// any of these shapes.
const COOK_TUNING = {
  // Processing verbs (D16). `qualityBonus` is the edge a WELL-CHOSEN verb
  // gives (the ingredient's natural prep); a wrong verb earns only
  // `wrongVerbFraction` of it. `stage` is the plate-component stage word.
  // Mixing verbs (whisk/knead/blend) are gated on the kitchen's mixing
  // capability — Phase 5's tier-1 equipmentState ships them all; Phase 6
  // keys them off the mixer.
  processVerbs: {
    chop:  { label: 'Chop',  stage: 'chopped',  qualityBonus: 0.10 },
    slice: { label: 'Slice', stage: 'sliced',   qualityBonus: 0.10 },
    mince: { label: 'Mince', stage: 'minced',   qualityBonus: 0.10 },
    whisk: { label: 'Whisk', stage: 'whisked',  qualityBonus: 0.12 },
    knead: { label: 'Knead', stage: 'kneaded',  qualityBonus: 0.12 },
    blend: { label: 'Blend', stage: 'blended',  qualityBonus: 0.10 },
  },
  wrongVerbFraction: 0.25,    // a wrong-but-possible verb still earns a quarter of the fit bonus
  prepByGroup: { protein: 'chop', vegetable: 'chop', dairy: 'whisk', starchy: 'slice', sweet: 'blend', fat: 'slice' },
  mixingVerbs: ['whisk', 'knead', 'blend'],
  basicCookware: ['pot', 'pan', 'wok', 'baking_tray'],   // tier-1: the apartment owns its cookware
  prepMinutes: 3,             // per processing step
  mixMinutes: 4,              // per mixing step
  seasoningMinutes: 1,        // the add-salt rescue
  finishMinutesFrac: 0.5,     // the finish-cooking rescue takes half the method's time

  // Reagents (D8): the tiny-quantity pantry consumables cooking draws on.
  // `qtyPerUse` is what ONE cook consumes (a splash / a pinch), `kcalPerUse`
  // feeds the plate's kcal so a fried dish really carries its fat. `kind`:
  // 'fat' = richness (frying needs it, adds quality) or 'seasoning' =
  // flavor (the D8 taste gate — no flavor on a cooked dish = bland; too
  // much = overseasoned). Fats are CONSUMED, seasonings are TRANSFORMED
  // INTO the dish (effects.js TRANSFORM_ITEM — you'd never eat salt raw).
  reagents: {
    oil:    { label: 'Oil',    qtyPerUse: 1, kcalPerUse: 40, kind: 'fat', hint: 'a splash of oil' },
    butter: { label: 'Butter', qtyPerUse: 1, kcalPerUse: 50, kind: 'fat', hint: 'a knob of butter' },
    salt:   { label: 'Salt',   qtyPerUse: 1, kcalPerUse: 0,  kind: 'seasoning', hint: 'a pinch of salt' },
    spices: { label: 'Spices', qtyPerUse: 1, kcalPerUse: 4,  kind: 'seasoning', hint: 'a sprinkle of spices' },
    sugar:  { label: 'Sugar',  qtyPerUse: 1, kcalPerUse: 12, kind: 'seasoning', hint: 'a spoon of sugar' },
  },
  defaultSeasoning: ['salt'],  // the generic cook's habit — the interactive screen pre-ticks it
  fatQualityBonus: 0.04,       // a fat that fits the method (oil/butter) nudges quality

  // Step quality math. Pure — the seeded roll is the only non-constant term.
  stepBase: 0.55,              // a competent baseline processing step
  methodBase: 0.5,             // a competent baseline cook step
  skillQualityWeight: 0.5,     // (cookQuality − 0.5) × this — ±0.25 at the extremes
  freshQualityWeight: 0.12,    // (freshness factor − 1) × this — a stale batch dents every step
  rollSpread: 0.18,            // the seeded luck term, ±0.09
  heatFitBonus: 0.06,          // matching the method's burner
  heatMissPenalty: 0.05,       // wrong burner for the method
  // Phase 6 (D12/D13): equipment aids the cook in the moment. tempPrecision
  // (from EQUIPMENT_DEFS.stove/oven tiers) pays a small quality edge on a
  // MATCHED heat and shrinks the miss penalty + miss burn risk below — a
  // precision range forgives both directions. An oven-absent bake/roast
  // reads as a heat miss (improvising on the countertop), not a door.
  tempPrecisionBonus: 0.03,
  tempPrecisionMissFraction: 0.5,   // × the heat-miss penalty when precision > 0
  tempPrecisionBurnFraction: 0.6,   // × the heat-miss burn risk when precision > 0

  // Failure risk (D13/D15). All rolled from the plan seed — same (state,
  // seed) → same burnt chicken, forever. Tier-1 baselines; Phase 6's
  // equipmentState multiplies burnRisk.
  burnRiskBase: 0.16,
  heatMissBurnRisk: 0.08,
  timingBurn: { conservative: -0.05, standard: 0, bold: 0.12 },
  rawRiskBase: 0.10,           // undercooked — any cooked method
  timingRaw: { conservative: 0.12, standard: 0, bold: -0.06 },
  mushyRiskBase: 0.10,         // overcooked-soft — simmer/boil/steam/bake pushed hard
  skillFailureWeight: 0.25,    // (skill − 0.5) × this, subtracted from every risk
  minFailureChance: 0.02,

  // Failure consequences (D15). Every failure leaves the food EDIBLE — a
  // quality dent (and a mood sting at eat time for burnt) instead of
  // deletion. `qualityMult` multiplies the final plate quality; `flaw` is
  // the snapshot tag the pickers/narration read; `line` is the outcome
  // screen's flavor line. Rescue paths: bland → add salt/spice; raw →
  // finish cooking; burnt/overseasoned/mushy stand as they are.
  burnt:  { qualityMult: 0.55, kcalMult: 0.9, flaw: 'burnt', line: 'The edges came out charred.' },
  raw:    { qualityMult: 0.70, kcalMult: 1,   flaw: 'raw',   line: 'The middle is still undercooked.' },
  bland:  { qualityMult: 0.72, kcalMult: 1,   flaw: 'bland', line: 'It could use a pinch of salt.' },
  overseasoned: { qualityMult: 0.75, kcalMult: 1, flaw: 'overseasoned', line: 'The seasoning overpowers everything else.' },
  mushy:  { qualityMult: 0.82, kcalMult: 1,   flaw: 'mushy', line: 'It all went a little soft.' },
  burntMoodSting: 0.02,        // extra mood penalty per serving at eat time (EFFECTS, items.js)

  // The D8 taste gate: a cooked dish with NO flavor seasoning is bland;
  // piling flavor past the need is overseasoned. Flavor = seasoning-kind
  // reagents used. The base UI offers 0–2 (None/Salt/Spices/Both), so only
  // a rescue can push to `overseasonedAt`.
  seasoningNeedBase: 1,
  overseasonedAt: 3,

  // Final quality blend: the plate is HALF the recipe's ingredient story
  // (makePlate's D5 formula) and HALF how the cook actually went. A great
  // hand on a bland meal is still a bland meal.
  ingredientQualityWeight: 0.45,
  executionQualityWeight: 0.55,

  // Reagent kcal into the plate's total, capped so a heroic seasoning stack
  // can't double a plate's calories.
  reagentKcalCap: 120,
};

// D16's method table — the D10 cookware gate's other side. Each method
// names the cookware that can do it (a DISH_DEFS key), the burners/oven it
// wants, whether it needs fat, and how long it takes. cooking.js's
// planCook/resolveCookStep read THIS table; a recipe's `method` must name
// one of these keys. `needSizeL` is the D10 size floor (declared for the
// capacity model; tier-1 kitchens own the whole basic set).
const METHODS = {
  none:     { label: 'Assemble', cookware: null,        needSizeL: 0, oil: false, water: false, oven: false, burner: null,         timeMin: 8 },
  boil:     { label: 'Boil',     cookware: 'pot',        needSizeL: 3, oil: false, water: true,  oven: false, burner: 'high',       timeMin: 15 },
  simmer:   { label: 'Simmer',   cookware: 'pot',        needSizeL: 3, oil: false, water: true,  oven: false, burner: 'low',        timeMin: 30 },
  steam:    { label: 'Steam',    cookware: 'pot',        needSizeL: 3, oil: false, water: true,  oven: false, burner: 'medium',     timeMin: 20 },
  fry:      { label: 'Fry',      cookware: 'pan',        needSizeL: 2, oil: true,  water: false, oven: false, burner: 'medium-high', timeMin: 12 },
  saute:    { label: 'Sauté',    cookware: 'pan',        needSizeL: 2, oil: true,  water: false, oven: false, burner: 'medium-high', timeMin: 10 },
  sear:     { label: 'Sear',     cookware: 'pan',        needSizeL: 2, oil: true,  water: false, oven: false, burner: 'high',       timeMin: 8 },
  stir_fry: { label: 'Stir-fry', cookware: 'wok',        needSizeL: 3, oil: true,  water: false, oven: false, burner: 'high',       timeMin: 10 },
  bake:     { label: 'Bake',     cookware: 'baking_tray', needSizeL: 0, oil: false, water: false, oven: true,  burner: null,        timeMin: 35 },
  roast:    { label: 'Roast',    cookware: 'baking_tray', needSizeL: 0, oil: false, water: false, oven: true,  burner: null,        timeMin: 40 },
};

// D14's grade ladder — F through S+, replacing the Phase-3 placeholder
// gradeSteps. The B band deliberately still catches makePlate's ingredient-
// driven quality for a plain pasta (0.70), so pre-engine plates and the
// phase-3 regression battery keep their grades; computeGrade (cooking.js)
// is the one reader, gradeFromQuality (ITEMS) delegates to it.
const GRADES = [
  { min: 0.97, grade: 'S+' },
  { min: 0.92, grade: 'S' },
  { min: 0.87, grade: 'S-' },
  { min: 0.82, grade: 'A+' },
  { min: 0.77, grade: 'A' },
  { min: 0.72, grade: 'A-' },
  { min: 0.58, grade: 'B' },
  { min: 0.45, grade: 'C' },
  { min: 0.28, grade: 'D' },
  { min: 0,    grade: 'F' },
];

// --- NPC food culture (food-overhaul Phase 7, D23/D24) ------------------
// Per-NPC taste preferences: which foods an NPC loves/likes vs tolerates/
// dislikes. Tastes are a DERIVED-but-stable function of the character seed
// plus a few personality-trait anchors — no stored field, so old saves need
// no migration and the same save always reproduces the same tastes. They
// move set_meal outcomes (D23: relationship and mood deltas scale by how
// much the fed attendee actually likes what you cooked them), shape what an
// NPC auto-cooks (D24: hungry + bare fridge + cookable larder → they cook
// something they like), and break ties in the eat drive's food choice.
// taste.js is the single consumer.
const TASTE_TUNING = {
  likesPerNpc: 3,
  dislikesPerNpc: 2,
  // Keeps the taste draws on a different stream from every other genSeed
  // use (age, gender, the physical roll...), so tastes never correlate
  // with a body or a birth year. Any constant works; this one is not 0.
  seedSalt: 0x51AB0F,
  // The pool of tasteable entries. A `defId` entry matches that exact
  // ingredient; a `group` entry matches every def with that foodGroup.
  // Every defId here is one that can actually land in a plate's components
  // (makePlate) or sit on a reachable def-driven stack — a taste key that
  // matches nothing in play would be a dead draw.
  pool: [
    { key: 'eggs',         defId: 'eggs',         label: 'eggs' },
    { key: 'cheese',       defId: 'cheese',       label: 'cheese' },
    { key: 'bread',        defId: 'bread',        label: 'bread' },
    { key: 'pasta',        defId: 'pasta_dry',    label: 'pasta' },
    { key: 'rice',         defId: 'rice',         label: 'rice' },
    { key: 'chicken',      defId: 'chicken_raw',  label: 'chicken' },
    { key: 'beef',         defId: 'ground_beef',  label: 'beef' },
    { key: 'bacon',        defId: 'bacon',        label: 'bacon' },
    { key: 'potatoes',     defId: 'potatoes',     label: 'potatoes' },
    { key: 'tomato',       defId: 'tomato',       label: 'tomato' },
    { key: 'lettuce',      defId: 'lettuce',      label: 'lettuce' },
    { key: 'onion',        defId: 'onion',        label: 'onion' },
    { key: 'garlic',       defId: 'garlic',       label: 'garlic' },
    { key: 'tomato_sauce', defId: 'tomato_sauce', label: 'tomato sauce' },
    { key: 'sweets',       defId: 'sugar',        label: 'sweets' },
    { key: 'meat',         group: 'protein',      label: 'meat' },
    { key: 'vegetables',   group: 'vegetable',    label: 'vegetables' },
    { key: 'dairy',        group: 'dairy',        label: 'dairy' },
    { key: 'starches',     group: 'starchy',      label: 'starches' },
  ],
  // Personality-trait anchors: a trait that says something about food adds
  // (or forbids) a specific taste on top of the seed draw. Deliberately a
  // small hand-picked set — the same tastefulness rule as the eat drive's
  // no-temperamentWeights: hunger is hunger, personality belongs to what
  // you eat rather than to whether you eat.
  traitAnchors: {
    adventurous:     { likes: ['garlic', 'chicken', 'tomato'] },
    cautious:        { likes: ['bread', 'cheese', 'potatoes'] },
    impulsive:       { likes: ['bacon', 'sweets'] },
    lazy:            { likes: ['pasta', 'rice', 'bread'] },
    cynical:         { dislikes: ['sweets', 'bread'] },
    idealistic:      { likes: ['lettuce', 'tomato'] },
    nurturing:       { likes: ['eggs', 'cheese'] },
    materialistic:   { likes: ['beef', 'bacon'] },
    'thick-skinned': { likes: ['garlic', 'onion'] },
    competitive:     { likes: ['beef', 'eggs'] },
  },
  // The D23 outcome bands. `weight` orders a cook's recipe choices and the
  // eat drive's tie-breaks; `relMult`/`moodMult` scale a fed attendee's
  // set_meal relationship and mood deltas by what they actually got;
  // `label` and `reaction` are the narration words ("loves it" / "X lights
  // up — this is exactly their thing."). neutral's label/reaction are null:
  // an ordinary meal gets no callout, so the ones that get one are the
  // ones that matter.
  bands: {
    love:    { relMult: 1.5,  moodMult: 1.5,  weight: 3,   label: 'loves it', reaction: '{name} lights up — this is exactly their thing.' },
    like:    { relMult: 1.25, moodMult: 1.2,  weight: 2,   label: 'likes it', reaction: '{name} digs in happily.' },
    neutral: { relMult: 1.0,  moodMult: 1.0,  weight: 1,   label: null,       reaction: null },
    dislike: { relMult: 0.5,  moodMult: 0.5,  weight: 0.4, label: 'picks at it', reaction: '{name} picks at it politely.' },
    hate:    { relMult: 0.25, moodMult: 0.25, weight: 0.1, label: 'hates it',  reaction: '{name} soldiers through it with a brave face.' },
  },
};

// --- Mood target (Phase 5, D1) ---
// player.mood is no longer a directly-written bar. Every mood source is one
// of two things:
//  - a DECAYING IMPULSE into player.moodEvents (the eventTerm below) — this
//    is where every existing `ADJUST_NEED player mood +X` line lands
//    (effects.js applyAdjustNeed routes them here, syntax unchanged), so the
//    AfterHours +0.25 stays a real but temporary spike that fades over the
//    following day unless the target terms below support it;
//  - a persistent TARGET TERM (needs/social/comfort/stress) — a clean
//    apartment, food in your belly, and rent paid hold mood up; a mess, an
//    empty stomach, and overdue rent hold it down.
// player.mood EASES toward the combined target at easingPerTick per sim
// tick (~1 game day to converge). The only direct writer of player.mood is
// SIM's decayPlayerNeeds — see design invariant 6.
const MOOD_TARGET = {
  base: 0.1,                  // a functional baseline life is mildly positive
  easingPerTick: 0.05,        // fraction of the (target − current) gap closed per 30-min tick
  // eventTerm — the decaying impulse pool. Half-life 1 day: a +0.25 spike
  // contributes 0.25 the day of, ~0.125 the next, ~0.06 the day after.
  eventHalfLifeDays: 1,
  eventPruneBelow: 0.002,     // drop impulses once their contribution decays under this
  needsTerm: {
    // hunger band penalties live in HUNGER_RHYTHM.bands[].moodPenalty
    energyWarnFrac: 0.2,        // energy below this fraction of max → warn penalty
    energyWarnPenalty: -0.05,
    energyEmptyPenalty: -0.15,
    hygieneWarnPenalty: -0.05,  // below NEEDS.hygiene.warnBelow
    hygieneEmptyPenalty: -0.15,
    mealsWellFedCount: 2,       // mealsToday ≥ this → the well-fed bonus below
    mealsWellFedBonus: 0.03,
    mealsSkippedPenalty: -0.04, // evening with zero real meals all day
    mealsSkippedFromHour: 18,   // clock hour at which zero meals starts to nag
    // food-overhaul Phase 2 (D4): the ledger's day-mode is a small persistent
    // target term — deficit days drag, surplus days give a hair back.
    deficitMoodPenalty: -0.02,
    surplusMoodBonus: 0.01,
  },
  social: {
    affectionScale: 0.2,        // average resident affection (capped 0..1) × this → target
    // Phase 6 (D13): being with people you like pays. presencePerPerson is
    // the target bonus per liked resident physically in the player's room
    // (scaled by that resident's affection, hostile ones contribute 0),
    // capped so a full sofa can't out-earn a good day's living on its own.
    // activityScale sizes the shared-activity mood gain that actions add on
    // top of their own base when residents are present (watching TV together,
    // eating together — DEFS.ACTIONS reads it in presentResidentAffection).
    presencePerPerson: 0.04,
    presenceCap: 0.12,
    activityScale: 0.15,
  },
  comfort: {
    cleanlinessMid: 50,         // cleanliness == mid → neutral
    cleanlinessScale: 0.004,    // per cleanliness point from mid (±0.2 for a 100 vs 0 room)
    odorPenalty: -0.15,         // standing in a smelly room drags the target (absorbed ROT.odorMoodPenaltyPerTick)
    // Intimacy & Voyeurism Phase 19 (sound): a music signal the player can
    // actually hear is a small comfort term - scaled by arrived intensity,
    // capped. Headphones silence the read, and instead the wearer's own
    // music gives the flat term below.
    musicScale: 0.05,
    musicCap: 0.04,
    wornMusicTerm: 0.02,
  },
  stress: {
    rentPenalty: -0.25,         // while player.rentOwed > 0 (absorbed ECONOMY.rentLatePenaltyMood)
    burnoutScale: 0.5,          // getBurnoutMoodPenalty(player) × this
    billsPenaltyPerUnpaid: -0.02, // per bill with an outstanding balance
    billsMaxPenalty: -0.08,
  },
};

// --- Progress payouts (inventory overhaul Phase 6, D13) ---
// One-time decaying mood impulses on completing real things: a gig
// delivered, a lesson finished, rent paid, a quest done, a skill level, a
// good night's sleep, the place cleaned. These are the "dopamine hit"
// events the phase exists to spread across the game. All of them are small
// next to the +0.25 AfterHours spike and decay over a day like every
// impulse (MOOD_TARGET.eventHalfLifeDays), so no single event out-earns a
// good day's living. Pushed by the event sites directly (see the Phase 5
// rule: nothing writes player.mood — only pushMoodImpulse), never inline.
const MOOD_PAYOUTS = {
  workGigBase: 0.03,        // flat per delivered gig
  workGigPerDollar: 0.0005, // plus scaled by payout (a big gig feels bigger)
  workGigCap: 0.12,
  repTierUp: 0.15,          // crossing a gig reputation tier (the big milestone)
  courseLesson: 0.02,       // per lesson attended
  courseComplete: 0.08,     // on top, when the course finishes
  payRent: 0.06,            // paying down the whole balance
  questComplete: 0.10,      // a chain quest fully resolved
  skillLevelUp: 0.04,       // per skill level crossed
  goodSleep: 0.05,          // a full night on schedule, alarm-free
  cleanApartmentPerItem: 0.01, // housecleaning pass, scaled by how much there was to do
  cleanApartmentCap: 0.08,
};

// --- Need consequences (P7 gameplay loops). When a need hits 0, real
// mechanical effects fire — not just a red bar. These are checked every
// tick in decayPlayerNeeds (SIM) and applied through the same applyEffects
// pipeline as everything else. ---
// Phase 5 retune: hunger now reaches 0 exactly at
// HUNGER_RHYTHM.starveHours (18h since the last meal), so the starvation
// path below fires at the intended moment under the rhythm model; the mood
// penalties it applies are pushed as decaying impulses (see UI's
// processNeedConsequences), never written straight to the bar.
const NEED_CONSEQUENCES = {
  energy: {
    floor: 0,
    // Energy at 0 → actions are gated (see isActionExemptFromEnergyGate
    // in ui.js). The player can still travel and sleep, but nothing else.
    // No forced sleep/collapse — the user explicitly didn't want passing out.
    effect: 'gate_actions',
    logMessage: "You're completely exhausted. You need to sleep before you can do anything else.",
  },
  hunger: {
    floor: 0,
    // Hunger at 0 → mood penalty stacks, and after 3 ticks at 0, health
    // damage (modeled as a persistent mood floor reduction).
    effect: 'starvation',
    moodPenaltyPerTick: -0.02,
    healthThresholdTicks: 3,
    logMessage: "You're starving. Your mood drops and you can barely focus.",
    healthLogMessage: "You haven't eaten in too long. You feel genuinely weak.",
  },
  hygiene: {
    floor: 0,
    // Hygiene at 0 → NPCs react with disgust, tension rises, they avoid you.
    effect: 'filthy',
    tensionPerNpcPerTick: 0.01,
    affectionLossPerNpcPerTick: -0.005,
    logMessage: 'You smell terrible. Your roommates are giving you space.',
    npcReactionChance: 0.3,
    npcReactions: [
      '{name} wrinkles their nose as you walk by. "Maybe hit the shower?"',
      '{name} takes a step back. "No offense, but... wow."',
      '"Have you considered soap?" {name} asks, not entirely joking.',
      '{name} opens a window pointedly when you enter the room.',
    ],
  },
};

// --- Relationship consequences (P7). High tension has real mechanical
// effects, not just a number. An NPC past the tension threshold becomes
// harder to interact with and eventually considers moving out. ---
const REL_CONSEQUENCES = {
  tensionThreshold: 0.6,      // NPC starts avoiding you
  tensionHigh: 0.8,           // NPC refuses to talk, considers leaving
  tensionAvoidChance: 0.5,    // chance NPC leaves the room when you enter
  tensionRefuseTalkChance: 0.7, // chance NPC refuses to engage in conversation
  tensionMoveOutDay: 7,       // days at tensionHigh before NPC moves out
  affectionGiftThreshold: 0.3, // minimum affection for gift-giving to work
  // NPC Overhaul Phase 3.8 — comfort/desire thresholds
  comfortLow: 0.2,            // NPC avoids physical proximity, keeps conversations short
  comfortHigh: 0.7,           // NPC is physically relaxed around player, initiates casual touch
  desireHigh: 0.5,            // NPC flirts, notices player's body, longer eye contact
  desireHighComfortHigh: 0.7, // both needed for romantic/physical advances
  affectionHigh: 0.6,         // combined with desire+comfort for initiation
};

// --- Cold-shoulder (Intimacy & Voyeurism Phase 16, D2/D14) ------------------
// The cold-shoulder state: an NPC who is deeply hurt by something the player
// did stops engaging — no talk (severity-scaled refusal + room avoidance),
// no overtures and no player-directed drives (a cold NPC never crosses the
// room to reach you), and NO intimacy: the willingness function gains a HARD
// FLOOR (willingness.js), which is the fail-closed direction of invariant 1
// (a new floor, never a relaxed door). Recovery is slow and active — the
// player must pass reparation acts (gift + apology), each ratcheting one
// severity down per successful act, and time alone heals one step every
// `timeRecoveryDays` days. A max-severity cold-shoulder puts the resident at
// real move-out risk (the extended move-out trigger, D14). Never a system
// judgment: the flag is the hurt, and the prose is authored per severity (D2).
// The flag's shape is the data model's exactly: npc.flags._coldShoulder =
// { day, severity, reason } (+ a `repairs` day-stamp map + `healDay`).
const COLD_SHOULDER = {
  maxSeverity: 3,
  // --- Behavioral suppression by severity (rolled per talk attempt / room
  // entry, beside REL_CONSEQUENCES' own tension rolls). ---
  talkRefuseChance: { 1: 0.25, 2: 0.60, 3: 0.95 },
  avoidChance:      { 1: 0.10, 2: 0.35, 3: 0.70 },
  // severity >= this: no overtures, no player-directed drives. One number,
  // read by overture.js's scorer AND cognition.js's drive filter, so the two
  // can never disagree about what "cold" means.
  overtureSuppressedFrom: 1,
  // Player-directed drives suppressed by the same bar (see above).
  suppressedDrives: ['peep_player', 'snoop_phone', 'gift_to_player', 'react_to_player',
    // Intimacy & Voyeurism Phase 17 (D16/D13): the cold-shoulder is the
    // D13 line in its coldest form — an NPC who will not look at you does
    // not sneak into your bed either. The boundary attempt is suppressed
    // the same way every other player-directed drive is.
    'sneak_into_bed'],
  // --- Reparation (each successful act ratchets severity down one) ---
  minDaysBeforeRepair: 1,       // the hurt is fresh — nothing lands same-day
  giftCooldownDays: 2,          // one gift repair per window
  apologyCooldownDays: 2,       // one apology repair per window
  timeRecoveryDays: 4,          // time alone heals one severity per N days at full cold
  // A max-severity NPC will not hear an apology until something (a gift or
  // time) drops them to 2 — the coldest hurt needs a gesture first.
  apologyBlockedAboveSeverity: 3,
  // Per successful repair (gift/apology/time) — small, and the time path is
  // the same shape (advanceColdShoulderForDay applies it via this read).
  repairRelDeltas: { tension: -0.05, affection: 0.03 },
  // --- Move-out (extreme circumstances, D14) ---
  moveOutSeverity: 3,           // only max-severity cold puts the NPC at risk
  moveOutEarliestDay: 2,        // first day (after onset) the risk rolls
  moveOutChancePerDay: 0.35,    // per-day seeded roll while at max severity
  // (timeRecoveryDays 4 heals a severity-3 on day 4, so the risk window is
  // days 2-3: ~58% cumulative if the player does nothing, never a certainty,
  // and a day-1 gift removes it entirely — "a real chance of move-out", D14)
  // Severity assigned by cause (calibrated in Phase 16 — see the plan Handoff).
  // The caught-peek case is NOT here: its severity comes from the SHAMING
  // tier (cold/hostile perving is the D14 move-out-risk case, a close dynamic
  // is not even cold-shouldered — D2).
  causeSeverity: {
    public_infidelity: 2,       // learned the player was the other in their partner's cheating
  },
  // The player's apology beats (narrated by ui.doApologizeNpc; {name} is the
  // NPC, never the player — the narration is 2nd-person toward the player).
  apologyLines: [
    '{name} lets out a long breath. "Okay," they say. "I hear you."',
    'You apologize properly. {name} listens, arms crossed, then nods once — grudging, but real.',
    '"Thanks," {name} says quietly, not quite meeting your eyes. "I needed to hear that."',
    '{name} considers your apology for a long moment. "We\'ll see," they say — but they stay in the room.',
  ],
};

// --- Shaming (Intimacy & Voyeurism Phase 16, D2) ----------------------------
// The per-dynamic-tier reaction pools for uncalled-for perving (a caught peek
// at something sexual, a snooped room — and Phase 17's boundary layer will
// call this too). NOT a system judgment (invariant 8): the reaction is
// personality × relationship × context, resolved deterministically from the
// same dynamic read the peek caught-tables use (hostile tension / warm
// comfort-or-phase / near-stranger-cold) and narrated from authored pools. A
// stranger is mortified; a close dynamic turns it into a joke (D2). Each
// tier's `coldShoulderSeverity` is the cold-shoulder onset: uncalled-for
// perving at a cold dynamic is the D14 move-out-risk case, at a warm dynamic
// it is not even a cold shoulder.
const SHAMING = {
  hostileTension: 0.8,           // aligns with REL_CONSEQUENCES.tensionHigh
  warmComfort: 0.6,
  warmPhases: ['familiar', 'close', 'intimate'],
  tiers: {
    // Stranger/cold — mortified, harsh. The full "I have to live with you"
    // weight: the strongest tension spike + trust/affection crater, and the
    // cold-shoulder onset that puts a real move-out clock on the table.
    cold: {
      relDeltas: { tension: 0.25, affection: -0.2, trust: -0.15 },
      npcMood: -0.2, playerMood: -0.15, suspicion: 0.3,
      coldShoulderSeverity: 3,
    },
    // Familiar-but-not-close — angry, no room for jokes, but the hurt is not
    // yet the cold-shoulder move-out case.
    neutral: {
      relDeltas: { tension: 0.18 },
      npcMood: -0.1, playerMood: -0.08, suspicion: 0.25,
      coldShoulderSeverity: 2,
    },
    // Close/intimate — D2's playful reaction: the same act reads as comedy,
    // a little tension that reads as flirtation, no cold-shoulder at all.
    warm: {
      relDeltas: { tension: 0.06, affection: 0.05 },
      npcMood: 0.05, playerMood: 0.08, suspicion: 0.05,
      coldShoulderSeverity: 0,
    },
    // Hostile — cold rage on top of the existing tension.
    hostile: {
      relDeltas: { tension: 0.3, affection: -0.25, trust: -0.2 },
      npcMood: -0.25, playerMood: -0.2, suspicion: 0.35,
      coldShoulderSeverity: 3,
    },
  },
  // Reaction prose pools — deterministic pick per (tier, day, npc) via
  // seededRng in npc.js's pickShamingProse, mirroring PEEK_PROSE's pattern.
  // {name} is the caught NPC. Authored reactions, never a system judgment.
  prose: {
    cold: [
      '{name} stares at you, disgusted. "Get away from me. I mean it."',
      '{name} goes very still, then speaks low. "I know what you were doing. Don\'t ever let me catch you again."',
      '{name} shuts the door in your face. Through the wood: "I\'m telling the others what you are."',
      '{name} looks at you like something stuck to the floor. "I have to live here. With you. Do you even think?"',
    ],
    neutral: [
      '{name} shakes their head at you, jaw tight. "That\'s it. That\'s really it."',
      '"You need help," {name} says flatly, and walks past you like you\'re not there.',
      '{name} glares. "I\'m not telling you again. Keep away from my door."',
      '{name} is quiet for a long moment. "I don\'t know who you are right now," they say, and the cold in it is worse than shouting.',
    ],
    warm: [
      '{name} laughs, shaking their head. "Caught you. Should I charge admission?"',
      '{name} waggles a finger at you. "You\'re lucky you\'re cute."',
      '"Busted," {name} says, unbothered. "Just remember you saw nothing."',
      '{name} grins at you. "Couldn\'t resist, huh? I\'ll let it slide — this once."',
    ],
    hostile: [
      '{name} looks at you with real contempt. "Get out of my sight before I do something we both regret."',
      '"You\'re worse than a cockroach," {name} says, cold as anything. "You just keep coming back."',
      '{name} doesn\'t even raise their voice. "I will make your life here a living hell. That\'s a promise."',
      '{name} smiles without warmth. "Keep it up. See what happens."',
    ],
  },
};

// --- Relationship formation (intimacy-voyeurism Phase 12, D12/D14) ---------
// Read by relationships.js (the store + updateRelationshipsForDay + the
// resolveTick proximity accumulator). Formation is a slow cadence: each day a
// pair's accumulated co-location ticks (bedroom-weighted) are spent through
// the pairCompatibility temperature into `progress`; crossing a threshold
// with `progressionCooldownDays` elapsed advances status single → seeing →
// committed. Tuning values were set by the Phase 12 live calibration (see the
// plan Handoff); `pairCompatibility` weights are the formation temperature's
// own mix (castWeb dynamic, interests, values, temperament).
const RELATIONSHIP = {
  progressionCooldownDays: 3,    // minimum days between status transitions
  seeingThreshold: 0.5,          // progress at which single → seeing
  committedThreshold: 1.0,       // progress at which seeing → committed
  minCompatibilityForStart: 0.5, // pairs below this temperature never leave 'single'
  basePerDay: 0.02,              // baseline progress from household proximity alone
  decayPerDay: 0.015,            // progress lost each day while single (drift's pull-back)
  proximityPerTick: 0.03,        // progress gained per weighted 30-min co-location tick × temperature
  bedroomProximityBonus: 2,      // co-locating in a bedroom counts 2x (room-sharing is the strong signal)
  pairCompatibility: {
    base: 0.20,                  // everyone starts with some common ground
    sharedInterests: 0.15,       // capped shared-tag term
    sharedInterestPerTag: 0.05,  // ... one tag each
    valuesAligned: 0.15,         // share of non-opposed value pairs
    personality: 0.20,           // temperament similarity (computeCompatibility's normalisation)
    dynamic: 0.30,               // live castWeb axes — affection/desire/comfort pull, tension pushes
    dynamicTension: 0.5,         // tension subtraction coefficient within `dynamic`
  },
};

// --- The initiative gate (initiative plan Phase 2, D12/D13/D14) ------------
// Read by SIM's npcInitiativeGate(), which UI's checkRelConsequences calls.
//
// D12 — the authored gate above is a conjunction across three axes that all
// generate at 0, which makes "wanting someone you are not fond of"
// structurally unrepresentable: every path to an advance runs through
// affection >= 0.6 AND comfort >= 0.7. Desire stays load-bearing and unscaled;
// the affection and comfort FLOORS are scaled down by npcDisinhibition, so a
// disinhibited character reaches the gate on desire and a wholly inhibited one
// still needs the full authored conjunction. Two ways in, and the gate reports
// which was used as `tone` — 'warm' when the NPC clears the authored affection
// and comfort bars anyway, 'charged' when only the scaled ones. Phase 3 owes
// them different overtures, different narration and different facts.
//
// disinhibitionRelief 1.0 is the endpoint choice, not a rate: at 1.0 the
// floors run the full span from the authored value (disinhibition 0) to zero
// (disinhibition 1), so the two extremes are exactly "today's behaviour" and
// "desire alone". Anything below 1.0 leaves a floor nobody can ever clear on
// the charged path, which is the conflation D12 exists to remove. The measured
// cast spans 0.123..0.834 (mean 0.483), so nobody in practice sits at either
// end — see the plan Handoff.
const INITIATIVE_GATE = {
  disinhibitionRelief: 1.0,
  // D13 — the tensionHigh refusal is skipped for someone disinhibited enough
  // and wanting enough to cross the room anyway. Set against the measured
  // spread of npcDisinhibition over the generated cast (0.123..0.834, mean
  // 0.483): 0.60 is roughly its top third, so this is a minority of the cast
  // behaving differently rather than the tension model quietly ceasing to
  // apply. Recorded with what produced it — see the plan Handoff.
  tensionOverrideDisinhibition: 0.60,
};

// --- Multi-step quest chains (P7). Not just "talk to NPC" but a sequence
// of steps that build on each other. Each step has a type and completion
// condition. ---
const QUEST_CHAINS = [
  {
    id: 'care_package',
    title: 'Care Package for {name}',
    steps: [
      { type: 'cook', desc: 'Cook a meal for {name}' },
      { type: 'give_item', desc: 'Give the meal to {name}', itemCategory: 'meal' },
      { type: 'talk', desc: 'Check in with {name} about how they\'re doing' },
    ],
    rewardMoney: 80,
    rewardRelation: { affection: 0.15, trust: 0.1 },
  },
  {
    id: 'bonding_night',
    title: 'Bonding Night with {name}',
    steps: [
      // Not app-specific: checkChainQuestProgress doesn't check item
      // category for 'buy' steps, so any purchase from any shop app
      // satisfies this — QuickCart existing (drinks/food moved off Nile)
      // just made "from Nile" a false claim, not a logic problem.
      { type: 'buy', desc: 'Buy snacks or drinks' },
      { type: 'give_item', desc: 'Share with {name}', itemCategory: 'food' },
      { type: 'watch_tv', desc: 'Watch something together in the living room' },
      { type: 'talk', desc: 'Have a real conversation with {name}' },
    ],
    rewardMoney: 60,
    rewardRelation: { affection: 0.2, trust: 0.05 },
  },
  {
    id: 'apology',
    title: 'Make Things Right with {name}',
    steps: [
      { type: 'buy', desc: 'Buy a gift from Nile' },
      { type: 'give_item', desc: 'Give the gift to {name}', itemCategory: 'gift' },
      { type: 'talk', desc: 'Apologize to {name}' },
    ],
    rewardMoney: 30,
    rewardRelation: { tension: -0.2, trust: 0.1 },
  },
  {
    id: 'roommate_dinner',
    title: 'Cook Dinner for the House',
    steps: [
      { type: 'cook', desc: 'Cook a proper meal (not just a sandwich)' },
      { type: 'talk', desc: 'Invite {name} to eat together' },
      { type: 'talk', desc: 'Have a conversation over dinner with {name}' },
    ],
    rewardMoney: 100,
    rewardRelation: { affection: 0.1, respect: 0.1 },
  },
];

// --- Clock ---
const CLOCK = {
  ticksPerDay: 48,          // 30-min increments
  startMinutes: 8 * 60,    // 08:00
  phaseThresholds: {       // minutes from midnight
    early_morning: 300,    // 05:00
    morning: 420,          // 07:00
    midday: 720,           // 12:00
    afternoon: 900,        // 15:00
    evening: 1080,        // 18:00
    night: 1320,          // 22:00
  },
  phaseNames: {
    early_morning: 'Early Morning',
    morning: 'Morning',
    midday: 'Midday',
    afternoon: 'Afternoon',
    evening: 'Evening',
    night: 'Night',
  },
  tickMinutes: 30,
  // sleepTickStart/sleepTickEnd used to sit here as a fixed "sleeping
  // batch" window. Nothing read them (and sleepTickEnd's 336 was minutes
  // wearing a tick's name), and sleep is no longer a fixed window at all —
  // see SLEEP below.
  workBlocksMax: 16,       // max work blocks per day
};

// --- Sleep ---
// A night is 6-8 hours, scaled by how drained the player was when they
// went to bed: exhausted means a long night, near-rested means a short
// one. So the natural rhythm is bed around 22:00 and up around 06:00 —
// a player turning in at 22:00 on the typical 20-40 energy sleeps ~7.5h
// and wakes between 05:30 and 06:30.
//
// Energy recovered is proportional to hours ACTUALLY slept, not to the
// fact that sleep happened. That's what makes the planned alarm system
// mean something: waking early is a real cost (you come up short of 100),
// and "very drained + went to bed late" lands you short precisely because
// you needed the long night and didn't get it. See
// src/ref/sleep-and-alarm-plan.md.
const SLEEP = {
  minHours: 6,             // slept when energy is at max
  maxHours: 8,             // slept when energy is at zero
  // Energy per hour slept. maxHours * restorePerHour = 100, so a full
  // night from empty lands exactly at full, and anything shorter doesn't.
  restorePerHour: 12.5,
  // Design anchors for the alarm system and NPC schedules to agree with.
  naturalBedtimeHour: 22,
  naturalWakeHour: 6,
  // Phase 8: alarm system. The alarm caps the night — it can only
  // shorten sleep, never extend it. If the natural night would end
  // before the alarm, nothing happens. If it would run past, the player
  // is woken early and recovers only hoursActuallySlept × restorePerHour.
  alarmMinHour: 4,       // can't set earlier than 04:00 (no point)
  alarmMaxHour: 12,      // can't set later than noon (just sleep naturally)
  // 2026-08-17 audit (B3): the hunger clock runs at this fraction of its
  // waking rate while the player is asleep. Sleep metabolism slows — an
  // 8-hour night counts as ~4 hours of waking hunger, so a player who eats
  // dinner wakes "peckish" (~60 satiety) instead of "starving" (0-7%), which
  // is what every morning of the audit playthrough looked like. Skipping
  // dinner still costs you (dinner at 13:00 → wake at ~15 satiety), so the
  // rhythm's pressure survives; it just stops being a sleep tax.
  hungerMultiplier: 0.5,
};

// --- Burnout (Phase 8) ---
// Working near the energy ceiling day after day must have steep
// consequences. Grinding has to be possible but genuinely costly —
// otherwise the social solution to rent is optional flavour.
// consecutiveWorkDays tracks days above the workBlockThreshold; each
// such day raises burnoutLevel by burnoutPerWorkDay. Rest days (below
// threshold) reduce it by burnoutRecoveryPerRestDay. burnoutLevel scales
// a mood penalty and a work-pay penalty so grinding becomes
// progressively less profitable — the death-spiral is the feature.
const BURNOUT = {
  workBlockThreshold: 6,       // blocks/day above this counts as "high workload"
  burnoutPerWorkDay: 0.12,     // burnoutLevel added per consecutive high-work day
  burnoutRecoveryPerRestDay: 0.20, // burnoutLevel recovered per rest day
  maxBurnoutLevel: 1.0,       // cap at 100%
  moodPenaltyPerLevel: 0.4,   // mood subtracted at full burnout (scales linearly)
  workPayPenaltyPerLevel: 0.5, // work pay multiplied by (1 - level × this) at full burnout
};

// --- Energy levelling (Phase 8) ---
// Starting energy is lower than the absolute cap (NEEDS.energy.max) and
// grows over the game. This is the main early-game difficulty lever: a
// lower ceiling means fewer work blocks per day, making early rent harder
// and the pressure to recruit roommates sharper. Raised by sleep
// consistency (sleeping near the natural bedtime) and exercise.
const ENERGY = {
  startingMax: 70,             // the per-player ceiling at game start
  absoluteMax: 100,             // NEEDS.energy.max — the hard cap
  growthPerGoodSleep: 0.5,      // energyMax gained per night slept near bedtime
  growthPerWorkout: 1.0,        // energyMax gained per workout session
  goodSleepWindowHours: 2,     // within this many hours of naturalBedtime counts as "good"
};

// --- Calendar ---
// Four 35-day seasons: five 7-day weeks each, 140 days to the year, 20 weeks
// to the year. 35 % 7 === 0, so every season AND every year begins on the
// same weekday forever — the property the old 360-day year never had (its
// weekday drifted 3 days a year). Day 1 is a Sunday; see getWeekday.
//
// daysPerTaxPeriod is DELIBERATELY NOT daysPerSeason. Taxes bill twice a
// year — end of Summer (day 70) and end of Winter (day 140) — because a
// per-season lump is 2.57x smaller and 2.57x more frequent, which dissolves
// the saving-forcing function the mechanic exists for. See D3.
const CALENDAR = {
  daysPerSeason: 35,
  daysPerYear: 140,
  daysPerTaxPeriod: 70,
  seasons: ['spring', 'summer', 'autumn', 'winter'],
  seasonNames: { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' },
};
// DELETED: monthsPerYear, daysPerMonth, monthNames — a 35-day season has no
// months, and formatDate was their only reader.
// UNCHANGED: WEEKDAY_NAMES stays Monday-first. See D2.

// Weekday labels, indexed by getWeekday(day) (0=Mon .. 6=Sun). Promoted out
// of a local array inside formatDate when the maid's schedule grid needed
// the same names (external-world plan Phase 3) — one source, per the
// no-magic-outside-config rule.
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// --- Time Dilation ---
// Continuous clock: a rAF loop adds game-minutes based on the current
// context's timeScale. The NPC simulation runs at fixed checkpoints
// (every simCheckpointMinutes of accumulated game-time), not once per
// player action. Discrete actions (sleep, work blocks, cum) pause the
// continuous clock, advance a computed number of minutes in one batch,
// then resume — they call advanceAndResolveMinutes directly.
const TIME_DILATION = {
  // Each context's scale is a MULTIPLIER over real time, not a rate: 20
  // means one real second becomes 20 game-seconds. clockFrame converts it
  // with gameMinutes = realSeconds * (scale / 60), so 20x = 1/3
  // game-minute per real second = one game minute every 3 real seconds.
  scales: {
    idle: 20,           // standing around, menu navigation — 1 gm / 3 real-sec
    browsing: 10,       // computer browser, AfterHours grid — 1 gm / 6 real-sec
    masturbating: 3,    // slow, intimate — time crawls — 1 gm / 20 real-sec
    conversation: 1,    // talking to an NPC — one game-second per real second
    working: 25,        // work blocks — time flies — 1 gm / 2.4 real-sec
    sleeping: 0,        // special: skip-to-morning, not continuous
    // Intimacy & Voyeurism Phase 10 (D7): the peek/listen hold — one game-
    // minute per real second (60x), the plan's PEEK.tickMinutes cadence. The
    // session loop (peek.js) READS the clock this scale produces; it never
    // advances it itself (single clock owner — TIME's file header).
    peeking: 60,
  },
  // How often the NPC sim runs (in game-minutes of accumulated time).
  // 30 = same granularity as the old tick system. This is already the
  // floor on checkpoint frequency — a separate minCheckpointAccumulation
  // knob was declared here but never read by anything, so it's gone rather
  // than sitting around implying a guard that doesn't exist.
  simCheckpointMinutes: 30,
  // Needs heartbeat (needs-and-heartbeat-plan.md Phase 2, D1/D2): the decay /
  // restore cadence for NPC and player needs inside clockFrame's continuous
  // loop — one accumulator beside simCheckpointMinutes'. Phase 4 (tuning)
  // RETUNED the proposed 1 → 5 by live pass: 1/5/30-min chunking of the
  // closed form is byte-identical for every need, phone battery, and memory
  // over a full day (max NPC-need diff 0.0 even across checkpoint block
  // transitions; player mood diff 1.8e-6), so the cadence is a pure cost
  // trade — 5 fires 5× fewer calls (288 vs 1440/day) at identical outcomes,
  // yet stays far finer than the 30-min sim checkpoints that bound restore
  // staleness anyway. Anything finer than 5 buys nothing a reader can see
  // (needs surface as 5%-bucketed bars; decision reads happen at ≥30-gm
  // cadence). See locked decision D8 in needs-and-heartbeat-plan.md.
  HEARTBEAT_MINUTES: 5,
  // When the page is hidden (tab switch), freeze the clock so time
  // doesn't accumulate absurdly while away
  freezeWhenHidden: true,
};

// --- Phone (BrineOS Phase 2) ---
// The phone is a world OBJECT (defs.world.js) whose battery is
// flags.battery (0-100), advanced at sim checkpoints (every
// simCheckpointMinutes of game-time). It drains unless it is plugged into
// a room with power, in which case it charges AND meters the electric
// bill's `devices` meter — the player's own "NPC behaviour must show up
// on the bills" invariant applied to them. All numbers live here so
// battery feel is a config knob, not a code edit.
const PHONE = {
  startingBattery: 80,                 // % on first spawn
  batteryDrainPerCheckpoint: 2,        // % per 30 game-minutes ≈ 25h to empty
  batteryChargePerCheckpoint: 6,       // % per 30 game-minutes plugged in
  chargeMeterDevicesPerCheckpoint: 0.5, // hours of the `devices` meter per charging checkpoint
  // Heartbeat plan Phase 3: the per-MINUTE forms (= per-checkpoint / 30, a
  // pure conversion). The continuous path's heartbeat and the discrete
  // path's closed-form batch calls both read these (advancePhoneBattery);
  // the per-checkpoint fields above stay as the authored feel knobs.
  batteryDrainPerMinute: 2/30,
  batteryChargePerMinute: 6/30,
  chargeMeterDevicesPerMinute: 0.5/30,
};

// --- Camera (BrineOS Phase 8) ---
// A photo record is NOT the rendered blob (see landmine L10 in the plan) —
// it's a frozen prompt + seed that regenerates the identical image on
// demand, because the underlying blob cache (IMAGE_CACHE, shared across
// every scene/character image in the whole game, not just photos) can
// evict it at any time. rollCap is a SEPARATE, smaller cap: how many photo
// RECORDS the player keeps at all, oldest evicted — a deliberate memento
// limit distinct from the cache's storage-management eviction.
const CAMERA = {
  rollCap: 30,
};

// --- Tracker (BrineOS Phase 4) ---
// The phone's obligation tracker (see src/ref/BrineOS-The-Phone-plan.md §Phase
// 4): one pure derived pass turns game state into a flat list of entries.
// Nothing about an obligation is ever stored — world.phone.dismissed /
// .snoozed hold only the player's intent, keyed by the deterministic entry
// key. All thresholds below are the notification-feel knobs (no magic
// numbers in tracker.js).
const TRACKER = {
  // Entries with urgency >= this count as notifications (badge + the
  // Tracker's Notifications screen). Below it they appear only on the
  // Agenda.
  notifyThreshold: 60,
  // Urgency ladder by daysUntil (negative = already past, 0 = due today).
  // First matching row wins. Overdue always tops out at 100.
  urgencyByDaysUntil: [
    { maxDays: -1, urgency: 100 },
    { maxDays: 0, urgency: 90 },
    { maxDays: 3, urgency: 75 },
    { maxDays: 7, urgency: 55 },
    { maxDays: 14, urgency: 35 },
    { maxDays: 30, urgency: 20 },
  ],
  defaultUrgency: 10,
  // A paid-up recurring charge (utility bill, service visit) auto-posts —
  // there's nothing to act on until it lands, so cap its urgency so future
  // cycles never nag; only the unpaid posting becomes a notification.
  futureRecurringMaxUrgency: 30,
  // Rent escalation tiers, mirroring UI's processRentForDay (overdue 7/14).
  rentEscalationWarnAtDays: 7,
  rentEscalationCriticalAtDays: 14,
  // Date-less sources (no countdown — fixed urgencies).
  imUnreadUrgency: 25,      // per unread message
  imUnreadMax: 80,          // cap per thread
  courseUrgency: 15,
  facilityWarnUrgency: 35,
  facilityCriticalUrgency: 65,
  facilityWarnCondition: 40,
  facilityCriticalCondition: 20,
  highTensionUrgency: 75,
  // Snooze lengths offered on each notification (integer days).
  snoozeOptionsDays: [1, 3],
};

// --- Scene participation ---
const SCENE = {
  maxActiveNpcs: 2,        // hard cap, system invariant
  activeBibleContext: true,
  ambientSketchOnly: true,
  crowdAvoidanceWeight: 3, // multiplier applied to rooms at/above soft capacity
};

// ===================== SIGNALS (perception plan Phase 1) =====================
// A thing that happens or persists in a room emits a SIGNAL on a sense
// channel. The signal propagates outward along ROOM_ADJACENCY, attenuating per
// hop and attenuating harder through a door, and anyone in range — the player
// or an NPC, through the same query — may perceive it.
//
// Two kinds, and only two (plan D1):
//   STANDING signals are DERIVED from world state every time they're queried,
//     never stored. Rot in a container, dishes in a sink, grease on a stove.
//     Because they *are* the world, they cannot desynchronise from it: clear
//     the mess and the signal is simply no longer derivable. No cleanup path
//     exists because none can be needed.
//   TRANSIENT signals are emitted by an act at a moment and stored with a
//     decay — footsteps, a door closing, a shower running. Phase 3 builds
//     them; nothing here emits one yet.
//
// `running_water` was listed as a Phase 1 def in the plan and has moved to
// Phase 3. It cannot be standing: the shower object has a `power` state, but
// NOTHING in the codebase ever sets it to 'on', so a derived signal keyed to
// it would be unreachable — precisely the dead-emitter mistake RI1 exists to
// prevent. A running shower is a moment, not a persistent world fact.

const SIGNAL_DEFS = {
  rot: {
    channel: 'smell',
    salience: 0.75,
    phrases: {
      faint:  ['a faint sourness underneath everything', 'something in the air is very slightly off'],
      clear:  ['something in here has gone over', 'a sour, turned smell hangs in the room'],
      strong: ['the smell of rot is impossible to ignore', 'something has gone badly wrong in here, and you can smell it'],
    },
  },
  stale_laundry: {
    channel: 'smell',
    salience: 0.35,
    phrases: {
      faint:  ['a faint mustiness'],
      clear:  ['the warm, stale smell of a full laundry hamper'],
      strong: ['the laundry has been sitting long enough to announce itself'],
    },
  },
  grease: {
    channel: 'smell',
    salience: 0.4,
    phrases: {
      faint:  ['a trace of old cooking grease'],
      clear:  ['the stove has that burnt-on smell'],
      strong: ['scorched grease, thick enough to taste'],
    },
  },
  dirty_dishes: {
    channel: 'sight',
    salience: 0.5,
    phrases: {
      faint:  ['a couple of things sitting in the sink'],
      clear:  ['dishes stacked in the sink'],
      strong: ['the sink has disappeared under dishes'],
    },
  },
  // --- Phase 2 additions: one per remaining dirtyWhen-carrying object ---
  bathroom_grime: {
    channel: 'smell',
    salience: 0.55,
    phrases: {
      faint:  ['the bathroom could do with a wipe-down'],
      clear:  ['the sharp, unmistakable smell of a bathroom nobody has cleaned'],
      strong: ['the bathroom smells genuinely bad'],
    },
  },
  unmade_bed: {
    channel: 'sight',
    salience: 0.2,
    phrases: {
      faint:  ['the bed is unmade'],
      clear:  ['the bed is unmade, sheets shoved to one side'],
      strong: ['the bed looks slept in and abandoned'],
    },
  },
  clutter: {
    channel: 'sight',
    salience: 0.3,
    phrases: {
      faint:  ['a few things left out'],
      clear:  ['the surfaces have disappeared under clutter'],
      strong: ['there is nowhere clear to put anything down'],
    },
  },
  // A pool with water in it that nobody is filtering. Guarded on
  // `water: 'filled'` at the emitter (DEFS.WORLD's swimming_pool), because
  // these phrases are about WATER — the derelict basin has its own signal
  // below and its own, drier problem.
  stagnant_water: {
    channel: 'smell',
    salience: 0.6,
    phrases: {
      faint:  ['a faint chlorine-and-something-else smell off the water'],
      clear:  ['the pool has gone cloudy and it smells like it'],
      strong: ['the pool is green, and the smell carries'],
    },
  },
  // The tier-0 pool: torn liner, seized pump, dead filtration. It holds no
  // water, so it cannot smell like water — and it is INDOORS, on the top
  // floor of a building, so it cannot smell like leaves or rain either.
  // What a sealed, unventilated pool room actually gives you is damp: black
  // mould in the grout, the ghost of old chloramine that never left the
  // tiles, perished vinyl liner, and whatever has gone septic standing in
  // the drain — the one place in a "dry" pool that is never dry.
  derelict_pool: {
    channel: 'smell',
    salience: 0.5,
    phrases: {
      faint:  ['the flat, shut-up damp of a room nobody has aired out'],
      clear:  ['the empty pool smells of mildew and old chlorine'],
      strong: ['the pool basin reeks — black mould in the grout and something gone sour in the drain'],
    },
  },

  // A note is the highest-salience standing signal in the game, and that is
  // the point: it is the one piece of the apartment that is TRYING to get
  // your attention. Reading it collapses the intensity (see the `note` def in
  // defs.world.js), so it stops shouting once you have seen it without any
  // extra machinery — the state change IS the mechanism.
  note: {
    channel: 'sight',
    salience: 0.95,
    phrases: {
      faint:  ['a note, already read, still stuck up'],
      clear:  ['a note left out where you would see it'],
      strong: ['a note, propped up so you cannot miss it'],
    },
  },

  // --- TRANSIENT signals (Phase 3) ------------------------------------
  // Emitted by an act at a moment, stored on world.signals with a birth tick,
  // and fading at `decayPerTick`. The presence of that field is what marks a
  // def transient: standing signals are derived fresh every query and have no
  // decay, because the world state they read IS their persistence.
  //
  // Decay rates are in per-tick intensity, against a 30-minute tick. 0.5 means
  // a footstep is gone inside an hour; 0.05 means a cooking smell hangs around
  // most of an evening, which is exactly the difference between the two.
  footsteps: {
    channel: 'sound', salience: 0.5, decayPerTick: 0.5,
    phrases: {
      faint:  ['someone moving around, somewhere further off'],
      clear:  ['footsteps in the next room'],
      strong: ['footsteps, close — someone just walked past'],
    },
  },
  voices: {
    channel: 'sound', salience: 0.45, decayPerTick: 0.2,
    phrases: {
      faint:  ['the murmur of a conversation somewhere'],
      clear:  ['two people talking, not far off'],
      strong: ['a conversation going on right there'],
    },
  },
  door_close: {
    channel: 'sound', salience: 0.55, decayPerTick: 0.7,
    phrases: {
      faint:  ['a door somewhere in the apartment'],
      clear:  ['a door closing'],
      strong: ['a door shuts, close enough to feel it'],
    },
  },
  running_water: {
    channel: 'sound', salience: 0.4, decayPerTick: 0.25,
    phrases: {
      faint:  ['water running somewhere'],
      clear:  ['the shower is going'],
      strong: ['the shower is loud through the wall'],
    },
  },
  machine_running: {
    channel: 'sound', salience: 0.3, decayPerTick: 0.12,
    phrases: {
      faint:  ['a machine humming somewhere'],
      clear:  ['the washer is running'],
      strong: ['the washer is going, and it is not balanced'],
    },
  },
  // Cooking is the long one on purpose — a good smell that outlasts the meal
  // is one of the most domestic things a shared apartment has.
  cooking: {
    channel: 'smell', salience: 0.5, decayPerTick: 0.05,
    phrases: {
      faint:  ['a trace of something someone cooked earlier'],
      clear:  ['someone has been cooking, and it smelled good'],
      strong: ['whatever is on the stove smells genuinely good'],
    },
  },
  smoke: {
    channel: 'smell', salience: 0.85, decayPerTick: 0.08,
    phrases: {
      faint:  ['a whiff of something scorched'],
      clear:  ['the sharp smell of something burnt'],
      strong: ['burnt, badly — the kind of smell that sets off an alarm'],
    },
  },
  breakage: {
    channel: 'sound', salience: 0.9, decayPerTick: 0.6,
    phrases: {
      faint:  ['a clatter from somewhere in the apartment'],
      clear:  ['something hit the floor and broke'],
      strong: ['a crash, close — that was something breaking'],
    },
  },

  // --- THE EMOTIONAL CHANNEL (initiative plan Phase 1, D7) --------------
  // Transients like any other, and deliberately so: what makes these
  // different is only what emits them. Every signal above is emitted by an
  // ACT — a shower running, a door shutting. These are emitted by a MOOD
  // riding along on whatever act is already happening (`expresses` on a
  // DRIVE_DEFS entry), so an NPC's internal state leaks into a world the
  // player can hear. They propagate, attenuate and decay through Plan 1
  // unchanged; nothing here is a special case.
  //
  // Their intensities live in SIGNALS_EMIT with every other emission, and
  // are set so a sigh is a room-sized sound and a slammed cabinet is not —
  // see the note there for the arithmetic that places each one.
  sighing: {
    channel: 'sound', salience: 0.5, decayPerTick: 0.6,
    phrases: {
      faint:  ['someone let out a breath, somewhere close'],
      clear:  ['a long breath out, the kind that means something'],
      strong: ['a heavy sigh, right there in the room'],
    },
  },
  humming: {
    // The slow one of the three: a sigh is over the moment it happens, but
    // someone humming to themselves goes on for a while, which is exactly
    // the difference between noticing a mood and living alongside one.
    channel: 'sound', salience: 0.35, decayPerTick: 0.12,
    phrases: {
      faint:  ['someone humming, faintly, somewhere'],
      clear:  ['someone is humming to themselves'],
      strong: ['someone humming, close and unselfconscious'],
    },
  },
  cabinet_slam: {
    channel: 'sound', salience: 0.6, decayPerTick: 0.8,
    phrases: {
      faint:  ['a bang from somewhere in the apartment'],
      clear:  ['a cupboard door slammed harder than it needed to be'],
      strong: ['a cabinet slams, hard enough to rattle what is in it'],
    },
  },

  // --- The knock (initiative plan Phase 4) ------------------------------
  // The only signal in the table emitted by an OVERTURE rather than by an act
  // or a mood, and the only one aimed at a person: it lands in the room the
  // player is standing in, because that is where the door they are behind is.
  // Salience is above SCENE_READER.calloutSalience on purpose — 0.75 × the
  // emission below clears it, so a knock at your door gets its own block in
  // the scene rather than becoming one clause of the establishing passage.
  // Someone at your door IS the thing that stops you.
  knocking: {
    channel: 'sound', salience: 0.85, decayPerTick: 0.5,
    phrases: {
      faint:  ['a knock, somewhere — maybe not your door'],
      clear:  ['a knock at the door'],
      strong: ['a knock at your door, and whoever it is is still there'],
    },
  },

  // --- Intimacy (Intimacy & Voyeurism Phase 11, D9) ----------------------
  // The sound of intimacy — the trace the player's paired acts leave for the
  // ears of the household, and Phase 13's NPC drives will leave the same way.
  // Decay is slow (0.05/tick against 30-min ticks) so a single emission
  // carries through a 40-minute act: measured against the sound channel's
  // 0.5-per-hop attenuation and the 0.45 closed-unlocked-door factor, a
  // `moaningHigh` emission (0.9) arrives at ~0.20 in the adjacent room and
  // stays above the notice floor for over an hour of game time — long enough
  // for the door cue and the scene reader to say what is going on, short
  // enough that it does not follow the act around the whole floor plan.
  // `salience` sits just under SCENE_READER.calloutSalience (0.70) at full
  // strength (0.75 × 0.9 = 0.675): the loudest sex in the flat is a prominent
  // sensory line, never a scene-stopping callout.
  moaning: {
    channel: 'sound', salience: 0.75, decayPerTick: 0.05,
    phrases: {
      faint:  ['a soft, rhythmic sound from behind a door'],
      clear:  ['muffled sounds carrying through the wall — someone is not alone'],
      strong: ['sounds through the wall, unmistakable and unselfconscious'],
    },
  },

  // --- Music (Intimacy & Voyeurism Phase 19) ----------------------------
  // The apartment's soundscape: a STANDING signal derived from a sound
  // device's state (SOUND_DEVICE_DEFS -> OBJECT_DEFS emits), so a stereo left
  // on at volume 2 fills its room and carries to the neighbours all day.
  // Music is a comfort signal - it lifts the mood of everyone who can hear
  // it (through the same perceiveSignals query) - and very loud music
  // occasionally provokes a 'keep it down' beat. It is also the first thing
  // the headphones filter kills: a wearer hears none of it.
  music: {
    channel: 'sound', salience: 0.3,
    phrases: {
      faint:  ['a murmur of music somewhere, almost lost under everything'],
      clear:  ['music playing, not far off'],
      strong: ['music is playing, loud enough that you can feel the beat'],
    },
  },
};

// ===================== THE SCENE READER (Plan 2) =====================
// The main content area is a SCENE, not a log. A scene is room-scoped (D1):
// entering a room opens one, leaving files it to history. SCENE's
// composeScene builds it as a pure object; RENDER projects that object onto
// the DOM and holds no logic of its own.
const SCENE_READER = {
  // At or above this salience, a perceived signal stops being one clause in
  // the establishing passage and gets its own emphasised block (D11).
  //
  // Retuned from 0.55 to 0.70 after seeing it in the browser: at 0.55 an
  // unread note AND strong rot both called out at once, and two callouts in
  // one passage is exactly the "if everything shouts, nothing does" failure
  // the mechanism exists to avoid. Against Plan 1's salience table the
  // ceiling each signal can reach is `def.salience × maxIntensity`, so 0.70
  // admits precisely two things: an unread note (0.95 × 0.9 ≈ 0.86) and
  // something breaking (0.90 × 0.8 = 0.72). Those are the two events that
  // should genuinely stop you. Strong rot (0.75 × 0.8 = 0.60) stays a
  // prominent sensory line, which is the right weight for it.
  calloutSalience: 0.70,
  // How many sensory clauses the establishing passage carries. Records arrive
  // sorted by salience, so this keeps the strongest. Raised automatically
  // when there are more callouts than this — a callout must always also
  // appear in the passage (emphasis, not removal).
  maxSensoryLines: 3,
  historyScenes: 12,       // closed scenes offered in the collapsed drawer
  maxBeats: 40,            // beats rendered in one open scene
};

// Glyphs for the two peripheral-awareness surfaces (D8/D10): the moodle strip
// beside the scene, and the sensory icons on the floor plan. Channel picks the
// default; a signal distinctive enough to deserve its own overrides it. Band
// picks the opacity, so a faint smell and an overwhelming one are the same
// glyph at different weights — no new vocabulary, since channel and band are
// already on every perceived record.
//
// Emoji rather than an icon font because the footer status row already uses
// them (⚡🍔🚿😊), so this matches the house style rather than introducing a
// second one.
const SIGNAL_ICONS = {
  byChannel: { smell: '💨', sound: '🔊', sight: '👁' },
  bySignal: {
    note:            '📝',
    breakage:        '💥',
    smoke:           '🔥',
    cooking:         '🍳',
    running_water:   '🚿',
    machine_running: '🌀',
    footsteps:       '👣',
    voices:          '💬',
    rot:             '🦠',
    dirty_dishes:    '🍽',
    stagnant_water:  '💧',
    derelict_pool:   '🧫',
    // The emotional channel (initiative plan Phase 1). On the floor plan
    // these read as "someone in that room is having a day", which is the
    // information the signal carries and the reason it exists.
    sighing:         '😔',
    humming:         '🎵',
    cabinet_slam:    '💢',
    // Intimacy & Voyeurism Phase 11: "someone in that room is not alone".
    moaning:         '💕',
    // Intimacy & Voyeurism Phase 19: the soundscape.
    music:           '🎶',
  },
  bandOpacity: { faint: 0.35, clear: 0.7, strong: 1 },
  // Floor plan: at most this many glyphs per room, strongest first. A room
  // wallpapered in icons stops being readable as a map.
  maxPerRoom: 3,
};

// Overrides for the handful of ACTIVITY_TABLES / drive activityOverride
// strings that read badly in the default `${name} is ${activity}` frame
// (D5). Everything absent falls through to that default, which is correct for
// the large majority ("Hana is making coffee", "Marcus is reading in bed").
// `{name}` is the character.
//
// Expanding this is content work, not structure work — it can happen at any
// point after Phase 1 without touching a line of logic.
const PRESENCE_PHRASES = {
  'sleeping':         '{name} is asleep.',
  'skincare routine': '{name} is working through a skincare routine.',
  'at work':          '{name} is out at work.',
  'commuting':        '{name} is out.',
  'commuting home':   '{name} is on their way back.',
  'getting ready':    '{name} is getting ready to go out.',
  'hanging out':      '{name} is just hanging about.',
  'scrounging':       '{name} is picking through the cupboards.',
  'following a bad smell': '{name} is sniffing around for something.',
  'throwing out something that had gone off': '{name} is binning something that had gone off.',
  'washing up at the sink': '{name} is washing up at the sink.',
  'chatting with a roommate': '{name} is deep in conversation.',
  'looking for something to do': '{name} is drifting around, visibly bored.',
  // Intimacy & Voyeurism Phase 13: the pair acts' presence line must not
  // state the explicit activity — PRESENCE_PHRASES only substitutes {name},
  // and the scene layer reads it for anyone in the player's room.
  'masturbating': '{name} is alone in bed.',
  'masturbating in bed': '{name} is alone in bed.',
  'having sex': '{name} is in bed with someone.',
  'sex': '{name} is in bed with someone.',
  'quickie': '{name} is in bed with someone.',
  'making love': '{name} is in bed with someone.',
};

// --- Notes (perception plan Phase 4) ---
// The concrete case the whole perception plan was argued from: an endearing or
// passive-aggressive note on the fridge that draws your eye the moment you
// walk in. A note is an ordinary world object whose `read` state drives its
// own signal intensity, so "it stops shouting once you've seen it" needs no
// special-casing anywhere.
const NOTE_TUNING = {
  maxLength: 240,          // a note is a note, not a letter
  unreadIntensity: 0.9,    // sight, in-room — comfortably the loudest thing present
  // Still VISIBLE where you're standing, just no longer demanding. Measured:
  // at 0.2 an average attention of 0.30 gave 0.06 against the 0.08 sight
  // floor, so a read note vanished entirely rather than becoming background —
  // "it stops shouting" is the intent, not "it ceases to exist". 0.3 clears
  // the floor in-room and still falls in the `faint` band, and sight
  // attenuation means it reaches no further than before.
  readIntensity: 0.3,
  maxPerRoom: 4,           // a fridge covered in notes stops being a signal
  writeMinutes: 5,
};

// Authored note text for NPC-written notes, grouped by the reason someone
// would leave one. Roadmap R1: composed from authored phrases, never
// generated, so a note costs nothing and can never contradict the state that
// prompted it. `{name}` is the addressee.
//
// NOTHING WRITES THESE YET — notes are player-authored in Phase 4. The NPC
// side is roadmap Plan 5 (an NPC with an unresolved grievance or an open
// question leaves one instead of waiting to be clicked). Declared here with
// that consumer named, which is the one form of R8 exception the roadmap
// allows.
const NOTE_TEMPLATES = {
  chore_grievance: [
    "the dishes have been in the sink for three days. i'm not doing them again.",
    "whoever left the pan on the stove — it's your pan now. it lives there.",
    "bins. please. i've done it four weeks running.",
  ],
  thanks: [
    "thanks for sorting the boiler thing. genuinely. — {name}",
    "you didn't have to clean up last night but you did, so. thanks.",
  ],
  food: [
    "made too much, there's some in the fridge with your name on it. literally, i wrote your name on it.",
    "the milk is off. i've binned it. sorry.",
  ],
  logistics: [
    "rent's due friday and i get paid thursday, so don't panic when mine's late.",
    "landlord called about the window. i said we'd ring back.",
    "out till late — don't wait up.",
  ],
};

// Emission strengths for the acts that produce transient signals (Phase 3).
// Here rather than inline at each call site so "how loud is a footstep" is one
// tunable fact rather than a number buried in resolveTick.
const SIGNALS_EMIT = {
  // Measured against the case the plan exists for: someone striding past your
  // closed bedroom door must be audible from inside. At 0.5 that arrived at
  // 0.5 × 0.5 (one hop) × 0.45 (door) = 0.1125, which against an average
  // attention of 0.30 gave 0.034 — under the 0.04 sound floor by a hair, so
  // the headline case silently failed. 0.7 clears it.
  //
  // The gap between the two values is doing real work: someone PASSING
  // THROUGH is heard through a closed door, someone merely ARRIVING in the
  // next room is not. That difference is what makes footsteps informative
  // rather than ambient noise.
  footstepsTransit: 0.7,   // passing through on the way somewhere — louder
  footstepsArrive:  0.45,  // arriving and settling in
  shower:           0.85,
  laundry:          0.5,
  cookingDrive:     0.55,  // an NPC raiding the kitchen
  cookingAction:    0.7,   // the player actually cooking a recipe
  voices:           0.5,
  doorClose:        0.55,

  // --- The emotional channel (initiative plan Phase 1) -------------------
  // Placed by the propagation arithmetic rather than by feel, against the
  // sound channel's 0.5 per hop, its 0.45 unlocked-door factor applied at
  // BOTH ends of a hop (0.225 for a one-hop trip through a closed door) and
  // a noticeFloor of 0.04 against a typical attention of ~0.30 — so the bar
  // to be heard at all is an arrival of ~0.133.
  //
  // The brief was "noticeable in the room, not through a closed door":
  //   sighing 0.35 → in-room 0.350 HEARD, one open hop 0.175 marginal,
  //                  through a closed door 0.079 NOT HEARD.
  //   humming 0.30 → same shape, one step quieter.
  //   cabinetSlam 0.75 → through a closed unlocked door 0.169 HEARD, through
  //                  a LOCKED one 0.113 not. A slam is the one that reaches
  //                  you in another room; that is what makes it a slam
  //                  rather than a cupboard being closed. Louder than
  //                  doorClose above on purpose, for the same reason.
  sighing:          0.35,
  humming:          0.30,
  cabinetSlam:      0.75,

  // --- The knock (initiative plan Phase 4) -------------------------------
  // Emitted into the PLAYER's own room rather than the knocker's, so it
  // arrives undiminished — there is no hop and no door between a knock and
  // the person it is for. That makes the number a salience decision rather
  // than a propagation one: 0.85 × SIGNAL_DEFS.knocking's 0.85 salience =
  // 0.72, just above SCENE_READER.calloutSalience (0.70), which is the whole
  // point. A knock you can read past is a knock nobody answers.
  knocking:         0.85,

  // --- Intimacy (Intimacy & Voyeurism Phase 11, D9) ----------------------
  // How loud intimacy is. Placed by the propagation arithmetic like every
  // other sound: against 0.5-per-hop attenuation, the 0.45 closed-unlocked-
  // door factor and a 0.04 noticeFloor at ~0.3 attention, the bar to be
  // heard THROUGH a door from the adjacent room is an arrival of ~0.133, i.e.
  // an emission of ~0.59. So moaningLow is deliberately below that line — a
  // masturbating roommate is a room-local sound, heard from inside the room
  // but not through their door; moaningMed sits just above it (a quickie is
  // a muffled maybe-outside); moaningHigh is clearly audible through a closed
  // door, which is what makes sex a door cue and a desire source (D9).
  moaningLow:  0.5,
  moaningMed:  0.7,
  moaningHigh: 0.9,
};

// The mood bands the expression layer fires in (initiative plan Phase 1).
// Declared once and referenced from every `expresses` entry, because a band
// is a decision about the WHOLE layer's rate — how often the flat makes an
// emotional noise — and not something each drive should hold its own copy of.
// Phase 6 retunes the rate here, in one place.
//
// Set by measuring `npc.mood` where the expression layer actually reads it:
// 5,467 npc-tick calls to evaluateDrives over 12 households × 3 residents ×
// 7 in-game days. The distribution is min −0.53, p25 −0.06, median 0.07,
// p75 0.23, max 1.00, mean 0.109 — so mood is mildly positive most of the
// time and both tails are genuinely tails:
//
//   below −0.30   4.9% of npc-ticks      above  0.25  ~24%
//   below −0.10  19.5%                   above  0.30  20.2%
//   below −0.05  ~26%                    above  0.15  ~31%
//
// Then placed by SWEEPING the bands against the emission rate over the same
// population, because the mood distribution is only half the answer — the
// other half is the drive-fire rate, which caps this layer at 2.75 acts per
// NPC per day however wide the bands are:
//
//   veryLow  low   high | expressions per NPC per day | NPCs expressing (of 36)
//     −0.30 −0.15  0.25 | 0.353                       | 31
//     −0.20 −0.10  0.20 | 0.429                       | 33
//     −0.20 −0.05  0.15 | 0.607                       | 36
//     −0.20  0.00  0.10 | 0.698                       | 36
//
// The third row is the one below. It puts an emotional noise in a three-person
// flat about 1.8 times a day and reaches every resident inside a week, while
// keeping a real DEAD BAND (−0.05 .. 0.15, roughly p25..p60 — the ordinary
// middle of the distribution) where nobody is broadcasting anything. Going
// wider buys ~15% more at the cost of that band: at `low: 0`, "sighing" stops
// meaning "having a bad day" and starts meaning "is fractionally below
// neutral", which is where a texture turns into noise.
//
// `veryLow` is deliberately still a tail. A slammed cupboard lands ~0.11 times
// per household per day — about once every nine days — and that is the point:
// it has to stay rare or it stops meaning anything. It is the one band here
// that is set for MEANING rather than for rate.
const EXPRESSION_MOOD = {
  veryLow: -0.20,
  low:     -0.05,
  high:     0.15,
};

// Off-screen world events that make a noise or a smell (Phase 3). Keyed by
// the event `type` SIM's drawOffscreenEvent produces, so an event that
// already exists as fiction becomes something the household can actually
// sense. An event with no entry here is silent, which is most of them.
const EVENT_SIGNALS = {
  breakage:   { signal: 'breakage', intensity: 0.8 },
  burnt_food: { signal: 'smoke',    intensity: 0.75 },
  cooking:    { signal: 'cooking',  intensity: 0.6 },
};

const SIGNAL_TUNING = {
  // Stop propagating once a signal falls under this. Guards the walk and
  // keeps a strong source from technically reaching the whole apartment.
  floor: 0.05,
  // Ring-buffer size for TRANSIENT signals on world.signals (plan D11). A
  // backstop, not the primary control — decay is what normally keeps this
  // list short. The cap exists so a pathological stretch (every NPC moving
  // every tick through a long batched sleep) cannot grow the save without
  // limit. Declared in the plan and missing from the Phase 1 config, which
  // made `while (list.length > SIGNAL_TUNING.transientCap)` compare against
  // undefined and never trim anything.
  transientCap: 64,
  // Per adjacency hop, by channel (plan D5). These numbers are what make the
  // three channels feel different without any extra machinery: smell drifts,
  // sound carries less, sight essentially does not leave its room.
  attenuation: {
    smell: 0.55,
    sound: 0.50,
    sight: 0.10,
  },
  // Applied when a hop enters or leaves a room that HAS a door object (plan
  // D6). Keyed by what WORLD's getDoorState actually returns — the plan's
  // {open, closed, locked} was aspirational, since door objects only carry
  // `lock: ['unlocked','locked']` and nothing models a door standing open. A
  // room with no door object at all is unaffected, not multiplied by
  // `unlocked` — see SIGNALS' roomDoorFactor.
  //
  // PER CHANNEL, because a door does genuinely different things to the three
  // senses and a single factor got all three wrong at once: it blocks sight
  // outright, muffles sound, and barely troubles smell, which goes under it.
  // Measured, not assumed — a flat 0.35 made a running shower inaudible from
  // the hallway directly outside the bathroom, which is the exact example the
  // plan's thesis opens with.
  doorMultiplier: {
    smell: { unlocked: 0.60, locked: 0.50 },
    sound: { unlocked: 0.45, locked: 0.30 },
    sight: { unlocked: 0.05, locked: 0.02 },
  },
  // A GLASS threshold (floorplan plan D4) — the pool wall. Sound and smell
  // are stopped DEAD, which is what makes it a wall rather than a door;
  // sight passes completely unimpeded, because that is what glass is.
  //
  // sight: 1 rather than a fraction is deliberate. `attenuation.sight` is
  // already 0.10 a hop, so the pane does not need to dim anything for the
  // result to be modest — living-room-to-pool lands at 0.10 against a
  // noticeFloor of 0.08. At 0.85 it landed on 0.085, close enough to the
  // floor that a slightly inattentive observer would fail to see straight
  // through a window, which is not a thing. Distance dims the view here;
  // the glass does not.
  glassMultiplier: { smell: 0, sound: 0, sight: 1 },
  // An `open` threshold — a zero-threshold transition, no wall, no barrier.
  // Declared rather than left as a bare 1 so it reads as a decision in the
  // table alongside the other two, and so the day someone wants a beaded
  // curtain there is one number to change.
  openMultiplier: { smell: 1, sound: 1, sight: 1 },
  // Below this, after the perceiver's attention is applied, the signal is not
  // noticed. Attention GATES perception; it does not scale how intense the
  // thing seems (plan D8) — a keen observer notices faint things a dull one
  // misses, but both describe a strong smell as strong.
  noticeFloor: {
    smell: 0.05,
    sound: 0.04,
    sight: 0.08,
  },
  // Intensity bands for prose (plan D3). Phrase tables are keyed by BAND, not
  // by raw value, so retuning a number never means rewriting the writing.
  bands: { faint: 0.33, clear: 0.66 },
};

// --- Music devices & headphones (Intimacy & Voyeurism Phase 19) -----------
// The apartment's soundscape. A sound DEVICE (stereo/boombox/record player)
// is an OBJECT_DEFS entry whose 'emits' derives a STANDING 'music' signal
// from its 'volume' state while its 'power' is on - so a stereo left on
// fills the flat all day and goes silent the moment it is ejected. The
// mp3_player/headphones are WORN accessories (the wardrobe's accessory
// slot): 'blocksSound: true' marks one as deafening its wearer to every
// audio-channel signal (perceiveSignals filters them per perceiver - the
// player's and an NPC's reads share the one filter), which is the whole
// 'opt out of the apartment' lever: no music, no door cues, no moaning, no
// gossip-overheard. 'affords' are the ACTION_DEFS ids the device's "X >"
// submenu renders; 'musicByVolume' maps the volume STATE (a string enum,
// per the OBJECT_DEFS rule) to the music signal's standing intensity.
const SOUND_DEVICE_DEFS = {
  stereo: {
    label: 'Stereo', sourceObjDef: 'stereo',
    musicByVolume: { '0': 0, '1': 0.25, '2': 0.5, '3': 0.75 },
    affords: ['sound.play', 'sound.set_volume', 'sound.eject'],
  },
  boombox: {
    label: 'Boombox', sourceObjDef: 'boombox', portable: true,
    musicByVolume: { '0': 0, '1': 0.3, '2': 0.55, '3': 0.85 },
    affords: ['sound.play', 'sound.set_volume', 'sound.eject'],
  },
  record_player: {
    label: 'Record Player', sourceObjDef: 'hobby_record_player',
    musicByVolume: { '0': 0, '1': 0.2, '2': 0.45, '3': 0.7 },
    affords: ['sound.play', 'sound.set_volume', 'sound.eject'],
  },
  headphones: {
    label: 'Headphones', sourceItemDef: 'headphones', carried: true, blocksSound: true,
    npcMoodGainPerTick: 0.003,
  },
  mp3_player: {
    label: 'MP3 Player', sourceItemDef: 'mp3_player', carried: true, blocksSound: true,
    npcMoodGainPerTick: 0.004,
  },
  // Consumer tuning. All placed against the SOUND channel's 0.5-per-hop
  // attenuation and 0.45 unlocked-door factor: a volume-2 stereo (0.5)
  // reaches the adjacent room at ~0.11, one hop further at ~0.055.
  music: {
    // NPC per-tick (30 game-minute) mood lift from the LOUDEST perceived
    // music signal, scaled by its arrived intensity - in-room at volume 2
    // that is ~0.02/tick, through a closed door ~0.0045.
    npcMoodPerIntensity: 0.04,
    npcMoodCap: 0.03,
    // The player's mood-target term from the same read, scaled far smaller
    // (the target is an equilibrium, not a per-tick delta).
    playerMoodScale: 0.05,
    playerMoodCap: 0.04,
    // The wearer's own music term - the one sound that survives the filter.
    wornPlayerMoodTarget: 0.02,
    keepItDown: {
      threshold: 0.45,       // arrived intensity that starts provoking
      chancePerTick: 0.05,   // per awake loud-music NPC-tick
      npcMood: -0.04,        // the reaction's own mood swing
      lines: [
        '{name} bangs on the wall. "Keep it down in there!"',
        '{name} yells from the next room: "Turn that down!"',
        'A knock comes from the wall - {name}, signalling the volume knob to you.',
        '{name} shouts over the music, "Some of us are trying to read!"',
        '{name} pokes their head out and says "Music!" in a tone that is not a compliment.',
      ],
    },
  },
};

// --- Transient clothing states (correctness plan Phase 4) ---
// Clothing states that describe a passing moment rather than how someone is
// dressed. They survive exactly the tick that caused them and revert to
// 'dressed' on the next one, in resolveTick's pass 2 — 'sleepwear' was
// already handled this way inline; 'towel' was supposed to be and wasn't.
// A drive sets one via `setsClothing`; nothing needs to un-set it.
// Intimacy & Voyeurism Phase 5 adds 'changing' (the mid-change moment the
// caught-changing keyhole beat reads). The PLAYER's transient clothing
// reverts through the same list, applied in SIM's decayPlayerNeeds.
const TRANSIENT_CLOTHING = ['sleepwear', 'towel', 'changing'];

// --- Clothing state machine (Intimacy & Voyeurism Phase 5, D11) ---
// npc.clothing / player.clothing is a state machine, not a description:
//   dressed    — wearing the current outfit (the default)
//   changing   — mid-change; a vulnerable, catchable moment (Phase 6's
//                change_clothes drive sets it; player change_outfit may too)
//   nude       — fully naked and present (shower/pool/sex) — prompt-gated;
//                the intimate gate reads it as naked (NAKED_CLOTHING_STATES)
//   towel      — post-shower (transient; reverts via TRANSIENT_CLOTHING)
//   sleepwear  — in bed (transient; reverts via TRANSIENT_CLOTHING)
//   undressed  — the value that opens getPhysicalDescriptionForPrompt's
//                intimate branch (npc.js). MUST keep its exact meaning
//                (design invariant 4); 'nude' joins it at the gate rather
//                than ever replacing it.
const CLOTHING_STATES = ['dressed', 'changing', 'nude', 'towel', 'sleepwear', 'undressed'];

// The states that mean "nothing between this person and the room". The
// intimate-description gate (npc.js) reads THIS set rather than a bare
// `=== 'undressed'`, so a genuinely naked `nude` subject is described the
// same way as an `undressed` one. The gate's other two conditions (intimate
// opt-in + activeContentFlags) are untouched, so this can only ever make the
// gate MORE accurate about who is actually naked — the fail-closed direction.
const NAKED_CLOTHING_STATES = ['undressed', 'nude'];

// LLM-facing clothing prose — the strings clothingLabel (LLM) draws from.
// The physical describer (NPC's getPhysicalDescriptionForPrompt) keeps its
// own existing phrasings byte-identical and is extended inline.
const CLOTHING_STATE_PROSE = {
  dressed: 'dressed normally',
  changing: 'mid-change, caught between two outfits',
  nude: 'completely naked',
  towel: 'wrapped in a towel (just showered)',
  sleepwear: 'in sleepwear',
  undressed: 'undressed',
};

// Player-facing clothing prose — the bare phrase the scene reader's self-line
// and the floor-plan avatar caption show ("You're wrapped in a towel."), so
// the scene and the plan can never disagree about what state reads as what.
const CLOTHING_STATE_SCENE_TEXT = {
  changing: 'changing',
  nude: 'naked',
  towel: 'wrapped in a towel',
  sleepwear: 'in sleepwear',
  undressed: 'undressed',
};

// --- NPC wardrobe AI (Intimacy & Voyeurism Phase 6, D11) ---
// Two data tables the pure rules in NPC.js read; all numbers live here so the
// phase's tuning is one place. ACTIVITY_OUTFIT_TYPES maps an NPC ACTIVITY
// string to the OUTFIT_TYPES key it is dressed for — a swimmer in the pool
// wears swim gear, someone on the treadmill wears workout gear. Everything
// else dresses for the schedule block (NPC's outfitTypeForContext).
const ACTIVITY_OUTFIT_TYPES = {
  // Vocation plan D16 — content work is D14's stated exception: an at-home
  // work block normally resolves to 'daily', but this particular job does not
  // happen in a jumper. Activity wins over block in outfitTypeForContext, so
  // naming the activity here is the whole mechanism. The pool session dresses
  // as swimming does, and the deviancy/nude question stays where every other
  // nudity decision in the game is made (resolveTick pass 2).
  'filming': 'sexy',
  'filming by the pool': 'swim',
  'filming together': 'sexy',
  'exercising': 'workout',
  'working out': 'workout',
  'doing yoga': 'workout',
  'stretching': 'workout',
  'swimming laps': 'swim',
};

const NUDITY_TUNING = {
  // The deviancy read (D11's "hidden trait") is derived, never stored:
  // openness × assertiveness, each re-normalised to 0..1. A curious person
  // who also pushes for what they want is what swims nude; a curious
  // wallflower still doesn't. Derived means deterministic for a given cast
  // and needs no save migration.
  deviancyThreshold: 0.5,   // above this, an NPC is in the deviant pool
  nudeSwimChance: 0.4,      // per swim session (first nude-eligible tick),
                            // a deviant NPC swims nude
  // Showers are private — nudity there is not a deviancy question.
  nudeShower: true,
  // A worker with conscientiousness below this skips the work outfit and
  // goes to the office in whatever they had on.
  workDressConscientiousnessFloor: -0.4,
};

// The schedule blocks an NPC dresses for work (or the day) around. 'morning'
// only appears on workday templates (day_shift weekday), so treating it as
// getting-ready is safe for every schedule in SCHEDULES.
const WORK_BLOCKS = ['prep', 'commute', 'work', 'commute_home', 'morning'];

// --- Clothing effects (Intimacy & Voyeurism Phase 7, D11) ---
// Phase 4 defined the five stats (attraction/comfort/modesty/thermal/reveal);
// this table is where they MEAN something. All weights live here — the pure
// readers in NPC.js (clothingResponseToWearer / clothingWillingnessBias) and
// the aggregation in ITEMS (outfitStatSum / outfitHasTrait /
// outfitEffectiveReveal) are the ONLY consumers, so retuning is one number.
//
// Stat → formula (one reader per stat, never two competing readings):
//   attraction — the "attraction term": how good the outfit makes its wearer
//                look. Read as a [0,1] bias on observers' attraction response
//                (overture.js's affection motive today; Phase 9's willingness
//                reads the same shared value). Observer-independent: a well-
//                dressed person reads well-dressed to everyone.
//   reveal     — the "desire source": how much skin the outfit shows. Read as
//                a [0,1] bias on observers' desire response, gated by the
//                OBSERVER's own deviancy (the exhibition read — D11's hidden
//                trait): a deviant observer reads skin as invitation, a prude
//                reads nothing. Phase 8 spends this as real desire gain.
//   modesty    — cancels reveal (a modest fit reads non-inviting), through
//                the single modestyDampen number shared by every reader.
//   comfort    — prose flavor only ("dressed for comfort"); never enters the
//                attraction/desire/willingness math.
//   thermal    — prose flavor only (reserved for Phase 19's seasonal reads);
//                no reader today, by design.
const CLOTHING_EFFECTS = {
  // How strongly a modest outfit's sum cancels the reveal sum, everywhere.
  modestyDampen: 0.7,
  // The attraction term. weight scales the outfit's attraction-stat sum into
  // a [0,1] bias; cap bounds that bias before trait multipliers.
  attraction: { weight: 0.35, cap: 0.5 },
  // The desire source. weight scales the effectiveReveal into a [0,1] bias;
  // cap bounds it before the observer gate. min..max is the observer-deviancy
  // span: at deviancy 0 (a total prude) none of the reveal reads as desire,
  // at 1 the full weighted value does. Missing temperament → 0.25 (the
  // npcDeviancy floor), so an unshaped NPC is mildly receptive.
  reveal: { weight: 0.5, cap: 0.5 },
  desireObserver: { min: 0, max: 1 },
  // Trait multipliers on the attraction response — 'sexy'/'revealing' items
  // land harder on an observer, comfort-first outfits read as casual rather
  // than striking. Applied once per trait present anywhere in the outfit.
  traitAttraction: { sexy: 1.25, revealing: 1.15, comfortable: 0.9 },
  // The willingness term's wiring — Phase 9's willingness() function reads
  // these weights through clothingWillingnessBias. Declared now so the pure
  // reader exists before the function; nothing consumes it until Phase 9.
  // Both weights scale the SAME shared numbers the attraction/desire readers
  // produce, so a stat keeps exactly one meaning across every consumer.
  willingness: {
    attraction: { weight: 0.15, cap: 0.3 },
    reveal: { weight: 0.1, cap: 0.2 },
  },
  // Scene-prompt flavor thresholds (scene.js / llm.js). An outfit above the
  // bar gets prose ("dressed to impress"); below, silence — the "wearing the
  // nice top reads differently than the stained tee" rule as a number.
  // Calibrated (2026-08-16) against real composed outfits so the DEFAULT
  // daily fit is silent: basic_tee+jeans+sneakers sums ~0.25 attraction /
  // ~0.7 comfort, and must read as nothing; the work fit (button_up + dress
  // pants + dress shoes) sums ~0.65 and reads "dressed to impress"; a full
  // loungewear set sums ~1.6 comfort and reads "dressed for comfort".
  prose: {
    attractive: 0.4,    // outfitStatSum('attraction')
    revealing: 0.35,    // outfitEffectiveReveal
    comfy: 1.0,         // outfitStatSum('comfort')
  },
};

// --- Desire (Intimacy & Voyeurism Phase 8, D9/D12) ---
// Desire is a real need: the player carries it as a footer-bar need and every
// NPC carries it as a 0..100 stat on npc.needs.desire — a sibling of
// hunger/hygiene/energy, NOT the relPlayer.desire relationship AXIS (that is
// "how much they want the player specifically"; this is general arousal, and
// the two feed each other in later phases).
//
// Sources are exposure, with "strongest wins per tick": only the single
// strongest live source contributes per tick, so five showering roommates do
// not stack into an instant maxed bar. Release is intimacy (Phase 11). The
// player's decay + sources ride SIM's decayPlayerNeeds closed form; an NPC's
// ride the heartbeat (applyNeedsHeartbeat), so both respect the closed-form
// fast-forward rules with no per-tick loops of their own.
//
// Amounts are per TICK (30 game-minutes) — matching "strongest wins per
// tick" — and consumers scale by span/CLOCK.tickMinutes for partial spans.
// scoreCandidates reads the NPC stat through `utility.desire` as a BIAS term
// (never a gate — D12). It is a want, not a lack, which is exactly why
// `utility.need` (a depletion curve) must never appear alongside it on an
// entry: D5 stays intact (a depleted need never motivates an overture), and a
// high desire is the one thing that SHOULD.
const DESIRE = {
  player: { start: 20, max: 100, decayPerMinute: 0.05, warnBelow: 15 },
  npc:    { start: 10, max: 100, decayPerMinute: 0.04 },
  sources: [
    // Signal sources — perceived through the SAME perceiveSignals query the
    // rest of the game reads (attenuation, doors and attention already
    // applied), so desire only rises from what the perceiver can actually
    // sense. `moaning`'s producer is Phase 11's intimacy acts (they emit it
    // via `emitsSignal`), so it becomes live config the moment those land;
    // `nudity_present` has NO producer yet and stays absent (a def with no
    // emitter is dead config — RI1), arriving with whichever phase emits a
    // nude-NPC signal. `desireSource` already reads any future `s.signal`
    // generically.
    { signal: 'running_water', amount: 1.5 },  // showering in earshot
    { signal: 'moaning',       amount: 4 },    // intimacy in earshot (Phase 11's producer)
    { kind: 'flirted',         amount: 6 },    // flirtation target — a desire-motive overture landing
    { kind: 'peeked_at_sex',   amount: 8 },    // Phase 10's caught-in-the-act read
  ],
  // The clothing read (Phase 7's SHARED desire number): seeing someone in the
  // same room dressed invitingly gains `clothingResponseToWearer(observer,
  // wearer).desire × clothingScale` per tick — the handoff's "desire gain
  // from seeing someone dressed invitingly reads clothingResponseToWearer".
  // Observer deviancy already gates how much of a reveal reads as invitation.
  // Calibrated in Phase 8 verification: a maxed reveal for a deviant observer
  // (~0.5 desire) ≈ 1.5/tick — on par with hearing a shower, under hearing
  // someone get off.
  clothingScale: 3,
  // Intimacy release — applied by Phase 11's acts; declared here as the
  // tuning home now so the numbers have one owner. Positive AMOUNTS: the
  // effect strings carry the '-' (the act SATES, desire falls by this much).
  release: { masturbate: 40, sex: 100, quickie: 60 },
  // The scoreDrive bias term's curve: a candidate declaring
  // `utility.desire: DESIRE.scoring` gains
  // `weight × (need − above)/(max − above)` appeal — 0 at and below `above`,
  // `weight` at full desire. Declared on the desire-motive overtures today
  // (Phase 8's live intimacy candidates) and by the Phase 13 drives tomorrow.
  scoring: { above: 45, weight: 0.2 },
};

// --- Willingness (Intimacy & Voyeurism Phase 9, D13) ----------------------
// The ONLY door into an intimacy act (design invariant 1). A pure
// willingness() function in willingness.js reads this table; every act,
// drive and effect that touches intimacy evaluates it before anything
// happens. Returns [-1, 1]; `abortFloor` is the line between "soft no"
// (below an act's threshold — refused with prose, no effects) and "cannot
// fire at all" (below the floor — a HARD FLOOR returns exactly -1: asleep,
// hostile/tension-high, actively refusing, or a stranger with zero prior
// interaction). Phase 17's boundary acts are the sole exception, routed
// through their own narrow gate in that phase, never through a relaxed
// willingness.
//
// Term weights scale [0,1] contributions except mood, which is the raw
// [-1,1] mood axis (a genuinely miserable NPC drags the number down). The
// plan's proposed weights, tuned so the numbers do the plan's job: base
// -0.3 means nobody starts out consenting — the terms have to earn it. A
// neutral-but-acquainted NPC with middling desire in a private room sits
// around 0.4, below every paired act's bar; a warm, intimate-phase NPC
// clears even `sex`.
const WILLINGNESS = {
  // Any willingness below the abort floor is a hard no: the act may never
  // fire (design invariant 1). HARD FLOORS return exactly -1.
  abortFloor: 0,
  terms: {
    base: -0.3,
    attraction: 0.5,   // castWeb/relPlayer desire toward the initiator + their outfit
    desire: 0.4,       // npc.needs.desire / DESIRE.npc.max — general arousal
    mood: 0.2,         // raw npc.mood axis, [-1,1]
    phase: 0.35,       // conversationPhase ladder early→familiar→close→intimate
    personality: 0.2,  // openness + deviancy (both [0,1])
    context: 0.25,     // privacy: room class × door lock − people present
    history: 0.1,      // recency of last intimacy (sated) + recent refusals (cold)
    // F1 (Discord feedback, 2026-08-23): the New Game/Sandbox "receptivity"
    // slider — a per-save soft bias, [-1,1] via world.gameplayOptions.
    // willingnessBaseline. A term like every other one above: summed into
    // the score AFTER willingnessFloor's hard gate already ran, so it can
    // never make a floored NPC (asleep/hostile/stranger/lockout/cold-
    // shoulder) participate. Default weight keeps a baseline of 0 a total
    // no-op — existing saves/tests are unaffected until a player sets it.
    disposition: 0.3,
  },
  // Attraction composition: the relational "want them" axis — the desire
  // axis toward the initiator (relPlayer.desire for the player, castWeb
  // target→initiator for an NPC partner) — plus the initiator's outfit
  // through the SHARED clothingWillingnessBias (Phase 7). One meaning per
  // stat, observer-neutral on the outfit, exactly like every consumer.
  attraction: { axisWeight: 0.75, clothingWeight: 0.25 },
  personality: { opennessWeight: 0.5, deviancyWeight: 0.5 },
  context: {
    privateLocked: 1.0,       // bedroom/bathroom with the door locked
    privateUnlocked: 0.75,    // bedroom/bathroom, door open or unlocked
    shared: 0.4,              // a common room — anyone could walk in
    peoplePresentPenalty: 0.2, // subtracted once when someone else is in the room
  },
  history: {
    intimateRecencyDays: 1,      // intimacy within this many days is "recent"
    intimateRecencyPenalty: 0.4, // a just-sated target's appetite is down
    refusalWindowDays: 7,        // refusals inside this window still chill the target
    refusalPerRefusal: 0.15,     // each recent refusal's chill
    refusalLockoutDays: 1,       // the actively-refusing floor's default hold (days)
  },
  // Per-act consent bars: willingness >= threshold(act) means willing.
  // masturbate is solo — the floor is its only door, so threshold 0. The
  // letters the plan used (quickie q, sex s, share_shower t) are these.
  // `photo` (asks plan Phase 8) is the photo ask's bar — a selfie of
  // themselves is more intimate than a cuddle but far less than sex, so it
  // sits between them (0.35 < 0.4 < 0.45 default).
  thresholds: { default: 0.45, masturbate: 0, quickie: 0.5, sex: 0.6, share_shower: 0.45, cuddle: 0.35, photo: 0.4,
    // Code-review fix: content_collab's own `act` (config.js's content_collab
    // DRIVE_DEFS entry) needs a real threshold to be checked against — it
    // used to fall through to 'sex''s 0.6 because it had no act of its own.
    // Set between quickie and sex: being filmed together is a genuine,
    // significant ask, not a casual one, but it carries none of sex's
    // physical stakes, so it sits a notch under it.
    content: 0.55 },
  // The utility.willingness scoring bias (Phase 9) — utility.desire's bias
  // partner, declared on the SAME desire-motive overtures. `weight` scales
  // willingness() into scoreDrive appeal when the desire motive is live,
  // and a floored NPC is dropped from the candidate list entirely (design
  // invariant 1 — an NPC who would refuse an advance never starts flirting
  // one). `act` is the bar read for that "would they say yes at all" test.
  scoring: { weight: 0.15, act: 'default' },
};

// --- Intimacy acts (Intimacy & Voyeurism Phase 11, D3/D13) ---------------
// The tuning home for the player's intimacy verbs. The plan's
// INTIMACY_ACT_DEFS gave shapes and durations; the magnitudes below are the
// calibrated numbers its rows interpolate (defs.actions.js) — one owner, so
// retuning an act is editing one table, never N effect strings.
//
// Splits are deliberately two-sided: the player's effects land through the
// normal action pipeline (ADJUST_NEED player …), the partner's through the
// paired block (ACTIONS.resolvePairedAct, {target} substituted). Player mood
// gains are ADJUST_NEED player mood lines → day-scale mood impulses (the
// standard player-mood path); NPC mood gains are direct writes (MOOD_DELTA).
// Desire release reads DESIRE.release for the player and npcDesireRelease
// for the partner — the same sated appetite on both sides of the same act.
// Both are positive AMOUNTS; the effect strings apply them with a '-' prefix
// (ADJUST_NEED … desire -60), never a sign-carrying interpolation — the DSL
// parser splits on whitespace, so 'desire - -60' would read the '-' as the
// whole delta and the release would silently land as NaN.
const INTIMACY = {
  durationMinutes: { masturbate: 15, quickie: 10, sex: 40, cuddle: 25, share_shower: 15 },

  // Player side. share_shower's hygiene is a RESTORE (the shower washes); the
  // paired table below mirrors it for the partner.
  playerMoodGain:   { masturbate: 0.15, quickie: 0.25, sex: 0.35, cuddle: 0.3,  share_shower: 0.15 },
  playerEnergyCost: { masturbate: 3,    quickie: 6,    sex: 12,   cuddle: 0,    share_shower: 4 },
  playerHygieneCost:{ quickie: 5,       sex: 10,       cuddle: 0, masturbate: 0 },

  // Partner side (the target NPC).
  npcMoodGain:    { quickie: 0.15, sex: 0.2, cuddle: 0.2, share_shower: 0.1 },
  npcEnergyCost:  { quickie: 6,    sex: 12,  cuddle: 0,   share_shower: 4 },
  npcHygieneCost: { quickie: 5,    sex: 10,  cuddle: 0,   share_shower: 0 },
  // share_shower restores hygiene like the solo shower (NEEDS.hygiene.
  // washRestore) — kept here as the paired act's own home so the two showers
  // can be retuned independently.
  shareShowerRestore: 60,
  // The target's npc.needs.desire release. sex/quickie get the same sated
  // release the player gets (DESIRE.release); cuddle and share_shower are not
  // releases (the plan's effects say so) and are absent here.
  npcDesireRelease: { quickie: 60, sex: 100 },

  // The relPlayer axes the TARGET gains toward the player on a completed act,
  // applied via applyRelDelta (which re-derives intimacyLevel/conversationPhase).
  // `desire` here is the relPlayer AXIS — sated, so it drops — and is a
  // different store from npc.needs.desire above.
  relDeltas: {
    quickie:      { affection: 0.08, comfort: 0.06, trust: 0.04, desire: -0.25, tension: -0.05 },
    sex:          { affection: 0.15, comfort: 0.12, trust: 0.08, desire: -0.5,  tension: -0.1 },
    cuddle:       { affection: 0.12, comfort: 0.15, trust: 0.08, desire: -0.1,  tension: -0.1 },
    share_shower: { affection: 0.06, comfort: 0.1,  trust: 0.04, desire: -0.1,  tension: -0.03 },
  },

  // Which acts unmake the bed in the room (invariant 7 — an act leaves a
  // trace). Only the bed-act plan named; share_shower happens in the shower
  // and cuddle is not a bed-tangling act.
  leavesBedUnmade: ['quickie', 'sex'],
};

// --- NPC intimacy drives (Intimacy & Voyeurism Phase 13, D3/D13) ----------
// The candidacy doors for the two Phase 13 DRIVE_DEFS entries (masturbate /
// intimate, added below in DRIVE_DEFS). `masturbate` is SOLO — a private
// room and real desire is the whole gate, and a solo act has no other party
// for D13 to protect (the same assumption the player's own masturbate act
// makes). `intimate` is a PAIR act: private room, real desire, AND a
// co-located resident who clears the same resolveWillingnessGate the
// player's Make-a-Move reads — the only door into an intimacy act (design
// invariant 1), symmetric in both directions (D3). The per-act magnitudes
// live on the DRIVE_DEFS entries themselves (effects/emitsSignal/leaves/
// utility) exactly like every other drive; this table owns only the gates
// and the act name the willingness gate reads.
const NPC_INTIMACY = {
  masturbate: { desireThreshold: 30 },
  intimate:   { desireThreshold: 40, act: 'sex' },
};

// --- Content-creation work (vocation-and-lifestyle plan D17/D19) ----------
// The two dials the Phase 5/6 content drives read. Kept beside NPC_INTIMACY
// because they answer the same shape of question and should be tuned in view
// of each other.
const CONTENT_WORK_TUNING = {
  // D17. Who films by the pool at 11pm. Scored on npcDisinhibition — the same
  // [0,1] the adult-occupation floor uses (D8) — and set ABOVE that floor on
  // purpose: clearing the bar to do this work at all does not mean you are
  // the one who does it in a shared room where anyone could walk in. This is
  // the exhibitionist end of a population that is already selected.
  poolDisinhibitionFloor: 0.72,

  // D19. What a partner has to clear to be filmed WITH. Deliberately lower
  // than the pool floor: being in someone else's shoot in a private room is a
  // smaller step than filming yourself in a common one. It is a floor on top
  // of the willingness gate, never instead of it — design invariant 5.
  collabDisinhibitionFloor: 0.60,

  // D18. How warm the player's relationship must be before a creator asks for
  // help. High on purpose: the beat is worth something because it is a person
  // asking YOU, and it is worth nothing if it fires at acquaintance. Read
  // against relPlayer.affection, on the same [-1,1] scale the overture
  // scorer's other motive readers use.
  collabAskAffection: 0.55,
  // ...and they have to actually be comfortable, not merely fond. Tension
  // above this cancels the ask however high affection climbs.
  collabAskMaxTension: 0.2,
};

// --- Boundary acts (Intimacy & Voyeurism Phase 17, D13/D14) ----------------
// The tuning home for the Phase 17 boundary layer (BOUNDARY_ACT_DEFS + the
// narrow context gate live in boundary.js; this table owns the numbers).
// D13's line: these acts are RISK SYSTEMS, never a relaxed willingness. A
// sleeping-room act is an ATTEMPT — the target is asleep (the willingness
// function's own asleep floor returns -1, which is expected and recorded,
// never bypassed) — and every wake-up resolves consequences deterministically
// (Phase 16's shaming resolver at cold/neutral/hostile dynamics, the REAL
// willingness gate for a warm dynamic's accept/reciprocate branch). A three-
// way act (throuple / cuck) is NOT an exception at all: all three parties
// must clear the same resolveWillingnessGate the player's Make-a-Move and the
// Phase 13 pair drives read, and a single unwilling party refuses the whole
// act with that party's own voice.
const BOUNDARY = {
  // Discrete action durations (game-minutes) the player's boundary verbs
  // cost — the same chunked advance-and-resolve the discrete action pipeline
  // uses, never a real-tick loop.
  durationMinutes: { sleep_with: 30, sleep_watch: 10, throuple: INTIMACY.durationMinutes.sex },
  // --- Sleeping-room wake/catch risk curve (D13/D14) ---
  // Per-act × per-dynamic wake chance. The dynamic tiers are the shaming
  // tiers (resolveShamingTier): a stranger/hostile sleeper is near-certain to
  // wake ("at low dynamic a wake-up is near-certain", the plan's wording);
  // a warm close dynamic wakes seldom and, when it does, routes to the
  // accept/reciprocate branch. `stealthFactor` scales the player's
  // stealthSuccess skill off the base; `perceptionWeight` scales the
  // sleeper's own perception on. Pure data — the curve and the roll are
  // boundary.js.
  sleepRoom: {
    wakeChanceByDynamic: { cold: 0.92, neutral: 0.65, warm: 0.30, hostile: 0.95 },  // sleep_with
    watchWakeChance:     { cold: 0.75, neutral: 0.45, warm: 0.18, hostile: 0.85 },  // sleep_watch
    stealthFactor: 0.06,
    perceptionWeight: 0.15,
    // The player's need effects on a completed (uncaught) act — modest: you
    // settled in beside them or watched from the edge of the bed.
    sleepWith: {
      playerMood: 0.15, playerEnergy: 8,
      // The warm accept/reciprocate branch is a completed paired act: it
      // reuses INTIMACY's sex magnitudes so a reciprocated boundary act is
      // costed exactly like the Make-a-Move act it turned into.
      reciprocateDeltas: INTIMACY.relDeltas.sex,
    },
    watch: { playerMood: 0.08 },
    // The warm dynamic's "awake but not game" outcome: playful, no
    // cold-shoulder — the warm dynamic never shames. Applied by
    // applyBoundarySleepRoom's warmRefuse branch.
    warmRefuseDeltas: { tension: 0.05, affection: 0.02 },
    // The target's relPlayer axes when a caught wake-up happens at a cold/
    // neutral/hostile dynamic — the shaming resolver's own deltas carry the
    // bulk; this small extra is the "you woke me by getting in my bed" spike
    // that applies whatever the tier prose says.
    caughtTensionSpike: 0.08,
  },
  // --- Three-way acts (throuple / cuck, D14) ---
  // `cuck_dynamic` is the same all-three-willing act as a throuple, named by
  // configuration: when two of the three hold a committed/seeing record, the
  // couple's partner is "letting" the third in (the plan's consenting
  // configuration), and the narration + relationship history differ; the
  // GATE is identical — all three parties' willingness + desire.
  throuple: {
    desireFloor: 45,          // both NPC partners need real desire (the plan's "requires: two willing partners + desire")
    // castWeb warmth between the two NPC partners of a completed three-way.
    pairDeltas: { affection: 0.06, comfort: 0.05, trust: 0.03, desire: -0.25, tension: -0.05 },
    // Both partners' relPlayer deltas toward the player (INTIMACY.relDeltas.sex
    // is the paired-act number; the third participant earns a touch less).
    relDeltas: { affection: 0.10, comfort: 0.08, trust: 0.05, desire: -0.3, tension: -0.08 },
    // NPC-side needs/mood on a completed three-way — the INTIMACY.sex
    // magnitudes, one line per effect the paired block already models.
    npcEffects: [
      `ADJUST_NEED {target} energy -${INTIMACY.npcEnergyCost.sex}`,
      `ADJUST_NEED {target} hygiene -${INTIMACY.npcHygieneCost.sex}`,
      `ADJUST_NEED {target} desire -${INTIMACY.npcDesireRelease.sex}`,
      `MOOD_DELTA {target} +${INTIMACY.npcMoodGain.sex}`,
    ],
    playerEffects: [
      `ADJUST_NEED player desire -${DESIRE.release.sex}`,
      `ADJUST_NEED player mood +${INTIMACY.playerMoodGain.sex}`,
      `ADJUST_NEED player energy -${INTIMACY.playerEnergyCost.sex}`,
      `ADJUST_NEED player hygiene -${INTIMACY.playerHygieneCost.sex}`,
    ],
  },
  // --- The NPC-equivalent drive (symmetric initiation, D3/D13) -------------
  // "some NPCs attempt them back": a deviant, aroused NPC slips into the
  // sleeping player's room. Candidacy is the mirror of the player's own
  // sleep_with — deviancy + desire + a sleeping player behind an unlocked
  // door. The catch roll is a sneaky-NPC/dozing-player contest: silence is
  // the usual outcome (the player wakes to an unmade bed), being caught is a
  // real but minority outcome with relPlayer consequences.
  npcSneak: {
    deviancyFloor: 0.6,       // openness×assertiveness — the deviancy gate Phase 6's nude swim reads
    desireFloor: 50,
    // NPC stealth = (conscientiousness+1)/2 scaled + jitter; player
    // perception is its normal value × asleepFactor (they are asleep).
    stealthBase: 0.25, stealthJitter: 0.5, asleepPerceptionFactor: 0.4,
    // catchChance = clamp01(base + (playerPerception − npcStealth) × gapWeight)
    baseCatchChance: 0.3, perceptionGapWeight: 0.6,
    cooldownMinutes: 720,
    // NPC-side effects on a silent success — desire release (sated), a warm
    // blush of relPlayer affection/comfort toward the player.
    desireRelease: -40,
    moodGain: 0.05,
    relDeltas: { affection: 0.03, comfort: 0.05, desire: -0.15 },
    // The caught side: the NPC's own relPlayer axes toward the player take a
    // hit — getting caught creeping costs them their standing with you.
    caughtRelDeltas: { tension: 0.12, trust: -0.06, comfort: -0.08, affection: -0.03 },
    caughtSuspicion: 0.2,     // the NPC's suspicion of the player (boundary_violation) — they now watch YOU
    eventTemplateSilent: '{name} slipped into your bed while you were asleep.',
    eventTemplateCaught: '{name} got caught sneaking into your room.',
  },
};

// --- Pregnancy (Intimacy & Voyeurism Phase 18, D14/D16) --------------------
// The lifecycle record is world.pregnancies — an array of
// { parents: [ids], conceivedDay, dueDay, visibleFromDay, birthDay, announced }.
// The ONLY door in is a COMPLETED qualifying act: the act's own willingness
// gate has already proved both parties willing (invariant 1 sits upstream of
// this whole system) and the outcome is deterministic (D15 — data decides,
// prose narrates; no LLM call ever decides a conception). The D16 "trying"
// flag — relationship.trying for an NPC couple, player.flags._tryingWith for
// the player — buys the deliberate high chance per act; every other act is
// an unprotected fling on the base chance (there is no protection item in
// the game, so "unprotected" is simply the only mode). Term compresses to
// game days. After birth the BABY PRESENCE is a separate stamp
// (npc.flags._baby / player.flags._baby, written ONCE by the birth pass)
// so the "who is pregnant right now" read stays a single derived query over
// world.pregnancies while the post-birth presence lives where the mood/
// schedule/conversation systems already look.
const PREGNANCY = {
  termDays: 14,                // conception → birth, in game days (D16: compressed, tunable)
  visibleFromDay: 6,           // the bump reads from this day of the term (day 1 = conceivedDay)
  // Per-act odds on a completed qualifying act (both parties willing by the
  // act's own gate). Measured live in Phase 18: over 10 completed "trying"
  // acts, 0.35 gives P(≥1 conception) ≈ 0.987; the 0.08 base gives a fling
  // couple ~56% over the same 10 acts — real risk, not a guarantee.
  tryingChancePerAct: 0.35,
  baseChancePerAct: 0.08,
  qualifyingActs: ['sex'],     // ledgerAct / relationship-history kinds that can conceive
  // The "trying" flag's NPC side (D16's couple-level choice, emergent): a
  // COMMITTED couple with recent intimacy may start trying — a seeded
  // per-day roll at rollover, so pregnancy can happen without the player
  // orchestrating (D14: everything on by default, no new gating menu).
  trying: {
    chancePerDay: 0.06,
    recencyDays: 7,            // lastIntimateDay must sit within this window
  },
  // The baby presence (post-birth). No v1 parenting sim (D16) — presence
  // only: a daily mood note on the parents, a sleep-deprived energy cost on
  // the player, an offscreen "stayed in with the baby" event (drawn for
  // parents by drawOffscreenEvent), and a pinned memory fact on both parents
  // so conversation naturally acknowledges the new addition.
  baby: {
    offscreenEventWeight: 3,   // the "stayed in with the baby" OFFSCREEN_EVENTS row
    dailyMoodBoost: 0.04,      // per-day NPC parent mood delta
    playerMoodBoost: 0.06,     // per-day player mood impulse (new-baby joy)
    playerEnergyCost: 6,       // per-day player energy cost (sleep-deprived)
  },
  factCategory: 'pregnancy',
  factImportance: 0.8,         // = MEMORY_IMPORTANCE.significant — pinned, always in the prompt window
  factEmotionalTag: 'romance',
  // Birth narration pools — deterministic pick per (day, pair) via seededRng
  // in pregnancy.js (the PEEK_PROSE pattern). {name}/{other} are the parents.
  birthLines: [
    '{name} and {other}\'s baby arrived today — a loud, perfect, brand-new person who has already declared war on sleep.',
    'There was a small commotion in {name}\'s room before noon, and by evening the whole apartment had heard the news: {name} and {other} have a baby.',
    '{name} came downstairs looking exhausted and radiant, a bundle in their arms. The baby had arrived overnight — {other} wasn\'t far behind, beaming.',
    'A small, fierce cry cut through the morning. {name} and {other} are parents now.',
  ],
  // The "trying" emergence narration — logged the day a committed couple
  // decides to start trying.
  tryingLines: [
    '{name} and {other} are trying for a baby.',
    '{name} and {other} have decided to start a family — they\'re trying.',
    'There\'s a new hopeful energy around {name} and {other}: they\'re trying for a baby.',
  ],
};

// --- Memory importance (correctness plan Phase 3, D8) ---
// Every episode used to land at a hardcoded 0.5 regardless of where it came
// from, and eviction was pure FIFO — so an NPC generating 3-7 ambient events
// a day (laundry, naps, packages) pushed out the conversation the player
// actually cared about within a week of game time. `importance` was stored on
// every episode and never consulted when deciding what to forget, even though
// retrieveRelevantMemories already ranked BY it. The ranking function and the
// eviction function held two contradictory theories of what memory is.
//
// Source decides weight. EVENT_IMPORTANCE maps world-event types onto these
// bands; anything unlisted falls back to `ambient`, which is the safe
// direction — an unclassified background event should not outrank a
// conversation.
const MEMORY_IMPORTANCE = {
  ambient:        0.15,  // OFFSCREEN_EVENTS draws — laundry, naps, packages, shopping
  social:         0.30,  // drive-produced: npc_chat, eat, gift
  conversational: 0.50,  // LLM-proposed episodes; the default when unspecified
  significant:    0.80,  // grievance, confrontation, caught peeping, evidence, move-in
};

// World-event type → importance band. Read by UI's eventImportance(). A drive
// or event that sets its own `importance` on the event object wins over this
// table — this is only the fallback for events that don't declare one.
const EVENT_IMPORTANCE = {
  // Deliberate beats the player would remember being part of.
  evidence_discovered: 'significant',
  gift:                'significant',
  moveInOffer:         'significant',
  argument:            'significant',
  // Intimacy & Voyeurism Phase 13: a completed pair act is a real
  // relationship event — the first_sex/sex history entry, worth remembering.
  intimate:            'significant',
  // Intimacy & Voyeurism Phase 14: an infidelity the wronged party finds out
  // about is a defining household event, on par with a confrontation.
  cheating:            'significant',
  // Intimacy & Voyeurism Phase 17: a caught boundary act (NPC sneaking into
  // the sleeping player's room) is exactly the kind of thing that gets
  // remembered — the caught half of the symmetric boundary system.
  boundary:            'significant',
  // Intimacy & Voyeurism Phase 18: a birth is the household's defining
  // event for the season — on par with a couple committing.
  birth:               'significant',
  // Social contact — real, but not defining.
  // investigate_smell (perception plan Phase 5) sits here rather than in
  // `ambient`: finding the thing that had gone off and binning it is a real
  // domestic act with a consequence, not background like doing the laundry.
  investigate_smell:   'social',
  // Intimacy & Voyeurism Phase 19: a 'keep it down' beat is a real social
  // moment between neighbours, worth remembering.
  music_too_loud:      'social',
  npc_chat:            'social',
  eat:                 'social',
  guest:               'social',
  date:                'social',
  phone_call:          'social',
  good_news:           'social',
  bad_day:             'social',
  sick:                'social',
  // Everything else (cooking, cleaning, laundry, nap, package, breakage,
  // shopping, hobby, burnt_food, late_night_snack, repair, eat_fallback)
  // falls through to `ambient`.
};

// --- World-event type → emotional theme (initiative plan Phase 2, D15) ------
// The sibling of EVENT_IMPORTANCE, and read by the same writer: SIM's
// eventEmotionalTag(), which UI's advanceAndResolve calls when it turns a tick
// event into a memory episode.
//
// Why this table has to exist. Rumination's D7 repetition rule groups episodes
// by `emotionalTag`, and the ambient episode writer supplied none — so thirty
// background episodes a week per resident could never form a theme, and the
// whole belief tier was seeded by player conversation alone (the plan's
// Evidence). This is the ambient half of what the Chronicler already does for
// conversations.
//
// Every value MUST be an EMOTIONAL_WEIGHTS key: rumination groups on the tag
// string and derives the minted fact's `category` from it, so an invented word
// would file real episodes under a theme nothing else can weigh. verify-i2
// asserts that. An unlisted type gets NO tag, which is the safe direction — an
// untagged episode still carries `participants` and still feeds co-occurrence,
// it simply does not claim a theme it does not have. That is deliberate for
// nap / package / hobby / late_night_snack / sick: they are things that
// happened, not things that felt like anything.
const EVENT_EMOTION = {
  argument:            'argument',
  bad_day:             'failure',
  good_news:           'success',
  date:                'romance',
  intimate:            'romance',   // Intimacy & Voyeurism Phase 13: a pair act is a romance beat
  guest:               'warmth',
  phone_call:          'warmth',
  npc_chat:            'warmth',
  gift:                'warmth',
  breakage:            'embarrassment',
  burnt_food:          'embarrassment',
  // Intimacy & Voyeurism Phase 13: masturbation is a private moment that
  // landed on the event log — tagged embarrassment so a witnessed one can
  // form a theme, sitting in the same band as the other private beats.
  masturbate:          'embarrassment',
  // Intimacy & Voyeurism Phase 14: a caught infidelity is a fight-flavored
  // beat (the wronged party's episode tags 'argument'), so rumination's
  // repetition rule can group repeated betrayals into a theme.
  cheating:            'argument',
  // Intimacy & Voyeurism Phase 17: a boundary act surfaces as a secretive
  // beat — embarrassment groups repeated sneaking into themes the same way
  // caught masturbation does.
  boundary:            'embarrassment',
  // Intimacy & Voyeurism Phase 18: a birth is a warmth beat — the new-baby
  // episodes group into a family theme like a gift does.
  birth:               'warmth',
  // The chores. `domestic` is the lowest-weight tag in EMOTIONAL_WEIGHTS (0.3)
  // for exactly this reason — it is the most common theme in the flat and the
  // least worth repeating to anyone.
  cooking:             'domestic',
  cleaning:            'domestic',
  laundry:             'domestic',
  shopping:            'domestic',
  repair:              'domestic',
  investigate_smell:   'domestic',
  // Intimacy & Voyeurism Phase 19: music-too-loud beats group as argument
  // themes, like the other noise-driven irritations.
  music_too_loud:      'argument',
};

// --- Infidelity (Intimacy & Voyeurism Phase 14, D14) -----------------------
// An intimacy act that contradicts a relationship record (a participant holds
// a committed/seeing record with someone who is NOT the other participant).
// Deterministic authority (D15): the act itself went through the willingness
// gate exactly like any other; this is the CONSEQUENCE pass that runs after a
// completed act and decides what the wronged party experiences. The wronged
// party's jealousy is a reaction to LEARNING — deltas land when they witness
// the act (same-room or a perceived moan) or when the gossip fact reaches
// them (told_by/overheard through the transmission system) — never from thin
// air. The relationship record always gains a `cheat` history entry (Phase
// 16's breakup ladder reads it); the deltas/mood/grievance are the reaction.
const INFIDELITY = {
  // castWeb wronged→cheater axes on learning (the cheater's partner is
  // furious — affection/trust/desire crater, tension spikes).
  wrongedDeltas: { affection: -0.15, trust: -0.2, desire: -0.3, tension: 0.2 },
  // relPlayer wronged→player axes when the player was the "other".
  wrongedPlayerDeltas: { trust: -0.12, tension: 0.15 },
  wrongedMoodDelta: -0.2,
  // The gossip-transmissible fact: category + importance + emotionalTag drive
  // how eagerly it is raised (factRaiseScore) and how firmly it is held.
  factCategory: 'cheating',
  factImportance: 0.8,           // = MEMORY_IMPORTANCE.significant — pinned
  factEmotionalTag: 'argument',
  // Grievance on the wronged NPC toward the player, when the player was the
  // "other" — the Phase 16 confrontation/repair surface reads grievances.
  grievanceSeverity: 0.5,
  grievanceText: 'You slept with my partner. I heard about it.',
};

// --- Knowledge codex (Intimacy & Voyeurism Phase 15, D8) ------------------
// The per-character ledger's spendable verbs. Confront / Spread / Matchmake
// read player.ledger[npcId] (written by Phase 11's paired acts, Phase 14's
// infidelity pass and Phase 15's 'witnessed' writes) and are the ONLY
// consumers of the `spent` flag. Every outcome is DETERMINISTIC — codex.js
// resolves the reaction from relationship dynamic + willingness state and
// narrates it from authored pools; no LLM call decides anything (D15). None
// of the three verbs is an intimacy act: they move relPlayer axes, gossip
// facts and formation progress, never a consent gate (invariant 1's converse
// — these doors go sideways, not in).
const CONFRONT = {
  // The willingness read modulates the reaction TIER, it is never a door:
  // a floored NPC shifts DOWN a tier (hostile/stranger — they do not want
  // this conversation), a willing one shifts UP (they can own what they
  // did). `willingAct` is the bar the shift reads (the sex threshold).
  willingAct: 'sex',
  tierFloorShift: -1,
  tierWillingShift: 1,
  outcomes: {
    // stranger/cold — the verification's "confronting a stranger ... tension
    // spike + gossip": the accusation lands, the news leaks to whoever is
    // in earshot (cheating entries only).
    shame: {
      relDeltas: { tension: 0.12 },
      npcMood: -0.1,
      playerMood: 0,
      suspicion: 0.1,
      gossip: true,
    },
    // familiar/close — playful brush-off; the confrontation itself reads as
    // flirtation (a desire mark).
    tease: {
      relDeltas: { tension: 0.02, affection: 0.04 },
      npcMood: 0.05,
      playerMood: 0.02,
      suspicion: 0,
      gossip: false,
      desireMark: 'flirted',
    },
    // intimate — they engage with what they did; the confrontation rekindles
    // something (affection/desire/comfort up, tension down).
    engage: {
      relDeltas: { tension: -0.08, affection: 0.1, desire: 0.1, comfort: 0.05 },
      npcMood: 0.1,
      playerMood: 0.05,
      suspicion: 0,
      gossip: false,
      desireMark: 'flirted',
    },
  },
  // Reaction prose pools — deterministic pick per (outcome, day, npc) via
  // seededRng in codex.js, mirroring PEEK_PROSE's pattern. {name} is the
  // confronted NPC, {other} the act's third party when the entry names one.
  lines: {
    shame: [
      '{name} goes pale. "That\'s none of your business," they say, too loud.',
      '{name} flushes and stares at the floor. "You didn\'t see anything," they say, not looking at you.',
      '{name} freezes. "I don\'t know what you think you saw," they mutter, already backing away.',
      '{name} laughs, badly. "Oh, that? That\'s — that\'s not — " and the sentence dies in their throat.',
    ],
    tease: [
      '{name} grins, unbothered. "And? You want an invitation or a replay?"',
      '{name} rolls their eyes, but the corner of their mouth twitches. "Keep that up and people will talk."',
      '{name} shrugs. "So you\'ve got good taste. I already knew that."',
      '{name} laughs it off. "Between us, yeah? I\'d hate to have to make you swear on something."',
    ],
    engage: [
      '{name} looks at you for a long moment, then nods slowly. "Yeah. That happened. And?" The question hangs there, waiting on you.',
      '{name} doesn\'t flinch. "You saw that, huh." Their voice drops. "Good. I was starting to think you weren\'t paying attention."',
      '{name} holds your gaze. "You\'ve got me. So — what are you going to do about it?"',
      '{name} smiles, slow and deliberate. "Keep that between us and I\'ll owe you one. Better yet — keep it between us and I\'ll show you what you missed."',
    ],
  },
  // The player's own confronting lines — {other} when the entry names one.
  playerLines: {
    withOther: [
      'I saw you with {other}.',
      'You and {other}? Don\'t bother denying it.',
      'I know about {other}.',
      'Don\'t act surprised — I saw everything with {other}.',
    ],
    alone: [
      'I saw what you were up to.',
      'We both know what you did.',
      'I\'m not going to pretend I didn\'t see that.',
    ],
  },
};

const MATCHMAKE = {
  // Progress gained on a matchmake (0..1 clamp) — the Phase 12 pass's exact
  // fuel, injected ahead of the natural co-location drip. Tuned so one
  // matchmake is roughly two to three days of shared-room proximity.
  progressBoost: 0.25,
  // The pair must already read as compatible enough to sustain a match
  // (below the natural-start bar — a matchmake can nudge a pair from "almost"
  // to formation, but it cannot manufacture a spark from nothing).
  minCompatibilityForMatch: 0.35,
  // castWeb pair deltas applied BOTH ways on a match — pairCompatibility's
  // live `dynamic` term reads these, so the temperature rise is self-
  // consistent (the match both adds progress AND makes the pair read hotter).
  warmDeltas: { affection: 0.1, desire: 0.12, comfort: 0.05 },
  // The player's own reward for playing matchmaker — a respect bump from
  // both parties, applied via relPlayer.
  playerRelDeltas: { respect: 0.04 },
};

// --- Belief record (knowledge-gossip-memory-plan Phase 1, D1/D2/D3/D15/D18) ---
// The extended fact record: provenance says where a fact was learned,
// confidence how sure the NPC is it's true, salience how much they care
// right now, pinned protects what defines a relationship from eviction.
// Every number here is provisional until the plan's population measurement
// lands — see the plan Handoff for the measured verdict on maxFacts.
const BELIEF = {
  maxFacts: 60,                 // D15 — was MEMORY_BUDGET.maxFacts 40; 60 is provisional, measured in Phase 1 (see Handoff)
  hopAttenuation: 0.8,          // D2 — a told_by hop: confidence × 0.8
  confidenceFloor: 0.3,         // D2 — below this, still stored, never raised
  overheardAttenuation: 0.9,    // D18 — overheard: confidence × 0.9
  salienceDefault: 0.5,
  salienceDecayPerDay: 0.05,    // D2 — time drops salience (read at retrieval, Phase 1)
  salienceFloor: 0.02,
};

// D15 — the prompt's [Memories — facts] window. The facts tier used to join
// EVERY valid fact into the block, so raising the cap (40→60) would have cost
// context per conversation; this bounds what buildMemorySliceV2 renders:
// pinned + significant always, then the top keyword matches, then the most
// recent, capped at maxTotal. 60 is validated by measurement in Phase 1.
const FACT_DISPLAY = {
  always: true,                 // pinned + importance >= significant, always shown
  retrieved: 5,                 // top keyword matches
  recent: 8,                    // most-recent valid facts, after the above
  maxTotal: 20,
};

// D10 — emotional weight by tag (knowledge-gossip-memory-plan Phase 2).
// First reader is D6's eligibility score; rumination (Phase 3) is the
// second. The ORDERING is authored (grievance/argument/romance punch harder
// than domestic), the magnitudes are PROVISIONAL until the Phase 2 population
// run measures the gossip rate — see the plan Handoff.
const EMOTIONAL_WEIGHTS = {
  grievance: 0.9, argument: 0.85, romance: 0.8, embarrassment: 0.7,
  success: 0.6, failure: 0.6, warmth: 0.5, domestic: 0.3, default: 0.3,
};

// D5/D6 — transmission tuning (knowledge-gossip-memory-plan Phase 2).
// factsPerChat: how many facts a speaker raises per npc_chat (and how many an
// overhearing listener retains per exchange).
// recencyHalfLifeDays: D6's recency term — a fact's "worth raising" halves
// every this-many days since it was written.
// talkativenessBase: D6's probability floor. The chance a chat moves any fact
// scales from here up with speech.verbosity + temperament.assertiveness.
// Everything else is Phase 2-authored and PROVISIONAL until the 12x7x3
// population run records the gossip rate — see the plan Handoff.
const TRANSMISSION = {
  factsPerChat: 2,
  recencyHalfLifeDays: 3,
  talkativenessBase: 0.15,
  talkativenessVerbosity: 0.5,       // × (verbosity − 0.5)
  talkativenessAssertiveness: 0.2,   // × assertiveness
  raiseScoreRef: 0.5,                // P(raise) = talkativeness × score ÷ this; a fresh default-weight no-match fact scores 0.18
  relevanceNoMatch: 0.6,             // D4 — no interest match
  relevanceMatch: 1.0,               // D4 — category overlaps an interest tag
  relevanceStrong: 1.5,              // D4 — category matches an interest name
  biasNovel: 0.4,                    // D6 — openness → novel/secondhand facts
  biasSocial: 0.4,                   // D6 — warmth → social/relationship facts
  biasPractical: 0.4,                // D6 — conscientiousness → practical facts
  reWitnessBoost: 0.15,              // D2's up-route — hearing a held fact again
  practicalCategories: ['work', 'money', 'finance', 'home', 'apartment', 'house', 'rent', 'job', 'trades'],
  // Intimacy & Voyeurism Phase 14: `cheating` joins the social categories so
  // a scandal fact gets the warmth bias and is genuinely worth raising — the
  // "the fact spreads by next day" path of the plan's Phase 14 verification.
  socialCategories: ['relationship', 'romance', 'social', 'family', 'friendship', 'dating', 'cheating'],
};

// D7/D8/D9/D10 — rumination tuning (knowledge-gossip-memory-plan Phase 3).
// The deterministic half of rumination: D7 inference rules mint inferred
// facts from episode patterns; the D9 open-question lifecycle creates,
// grows, ages and retires questions. All of it runs inside resolveTick on a
// staggered per-NPC cadence (RUMINATION.intervalTicks), synchronous and
// LLM-free (R2). D8's LLM half does not exist in Phase 3 — it fires at the
// D13 bridge in Phase 4, on the player's time budget. Every number here is
// PROVISIONAL until the 12×7×3 population run records open-question
// occupancy and per-NPC-tick cost — see the plan Handoff.
const RUMINATION = {
  intervalTicks: 12,            // per-NPC cadence inside resolveTick (48 ticks/day), staggered by npcId hash
  inferenceWindowDays: 7,       // D7 — the co-occurrence/repetition window
  inferredConfidence: 0.5,      // D7 rule 1 — repeated shared episodes → "X and Y spend time together"
  inferredConfidenceRepeat: 0.4,// D7 rule 2 — repeated same-tag episodes → "this keeps happening"
  createThreshold: 0.6,         // D9 — questions form only on facts at/below this confidence (the plan's 0.6)
  createInterestFloor: 1.0,     // D9 — "finds it interesting" bar: factInterestRelevance no-match 0.6 + openness bonus
  opennessInterest: 0.8,        // D9 — openness × this added to appeal for secondhand/novel facts
  curiosityStart: 0.2,
  curiosityPerRun: 0.05,        // D9 — grown by emotionalWeight × max(0, openness) × this per pass
  curiosityCap: 1.0,
  raiseThreshold: 0.5,          // D13 — the bridge trips at this; its reader is Phase 4's topOpenQuestion (named consumer)
  expireAfterDays: 14,          // D9 — age past this and the question retires
  openQuestionCap: 3,           // D9 — bound per NPC
  maxTargets: 3,                // D9 — bound on `targets` (who holds a fact on the same category/topic)
};

// D7 rule 2's fact text, shared by the mint and the dedupe so the two cannot
// drift (initiative plan Phase 2, D25). RUMINATION's applyRepetitionRule keeps
// ONE fact per theme per NPC, and it recognises the ones it already wrote by
// this prefix plus the tag — see there for why exact-text dedupe was not
// enough once ambient episodes started carrying tags.
const REPETITION_FACT_PREFIX = 'This keeps happening — ';

// --- Conversation consequences (plan-x5, Phase 1) ---
// Plan X-5 splits the model that WRITES an NPC's dialogue from the models
// that judge what it did: the Assessor scores the relationship over a scene
// (D2), the Chronicler extracts knowledge over a day (D3). Everything here
// bounds what those two passes are allowed to say — the wire format, the
// window sizes, and the ceilings that stop an extractor minting permanent
// beliefs by omission.
//
// Every number is PROVISIONAL. Phase 4 sets them by measurement; what is
// below is arithmetic, and the arithmetic is recorded in the plan's Handoff
// so a later session can tell a measured number from a guessed one.
const X5 = {
  // D7 — integers on the wire, divided on ingestion. A malformed integer is
  // obvious; a malformed float is a plausible 10x error. deltaClamp /
  // deltaDivisor is the biggest single-window move: 10/50 = 0.20, so an axis
  // needs five judged windows at the ceiling to saturate, against the four
  // EXCHANGES the old inline +-0.3 float allowed.
  //
  // D27 — the divisor was 100 through Phases 1-3 and is set here by
  // measurement (measure-x5.js section 6, and see the plan Handoff). At 100 a
  // judge following the rubric took 57 windows to carry an NPC from stranger
  // to `familiar` and 141 to `intimate` — 19 and 47 in-game days for someone
  // getting a real share of the player's evening. The conversationPhase
  // ladder is the strongest single lever in the NPC block (see
  // PHASE_THRESHOLDS below) and at that rate it never moves during a normal
  // playthrough, so every housemate talks like a stranger forever. That is
  // the same bug Plan 0's D1/D2 fixed from the other direction, overshot.
  // At 50 the same judge reaches familiar in 29 windows (~10 days), close in
  // 57 (~19) and intimate in 90 (~30), which is a relationship arc a
  // playthrough can actually contain.
  //
  // HARD FLOOR: validateProposal rejects any single axis delta above 0.3, and
  // a proposal fails whole on one bad axis — so below deltaClamp/0.3 it is
  // precisely the LARGE judgements that stop landing while small ones apply,
  // silently inverting the scale. Never set this below 34 at deltaClamp 10.
  // verify-x1 asserts the clearance.
  deltaClamp: 10,
  deltaDivisor: 50,

  // The two window ceilings (D2/D3), in EXCHANGES — a player turn and the
  // dialogue it provoked, not lines. Both are bounded above by what
  // MEMORY_BUDGET.maxRecent can physically hold: at linesPerExchange
  // entries per turn, 40 / 4 = 10 exchanges is the most either pass can ever
  // see, so a threshold above that is a threshold that never fires. The
  // plan's first-pass numbers (8 / 24) were written before that arithmetic;
  // verify-x1 asserts the relationship rather than these values.
  linesPerExchange: 4,          // 1 player line + the writing prompt's "1-3 dialogue lines max"
  assessorMaxExchanges: 5,      // flush a long single-room scene early (D2)
  chroniclerMaxExchanges: 10,   // flush before day rollover if busy (D3) — must exceed the Assessor's

  // D11 — an extracted fact is an attributed CLAIM, never a truth. The
  // default sits at RUMINATION.createThreshold precisely so an unverified
  // thing the player said is open-question eligible the moment it lands:
  // that is the cold start this plan exists to close. The max is below
  // certainty (design invariant 3) so no conversation can mint a fact the
  // gossip layer will propagate as established.
  factConfidenceDefault: 0.6,
  factConfidenceMax: 0.9,

  // D12 — the pinning trap, from the other side. MEMORY_IMPORTANCE.significant
  // (0.8) grants `pinned`, and pinned facts never evict; Plan 4's Phase 1
  // measured every conversation fact pinning itself. An extracted fact may
  // declare that it matters more than small talk, and may never reach the
  // bar that makes it permanent. Must stay strictly below `significant`.
  factImportanceCeiling: 0.75,

  // What one window is allowed to write. Without these a chatty extractor
  // fills BELIEF.maxFacts (60) in three in-game days.
  maxFactsPerWindow: 4,
  maxEpisodesPerWindow: 2,
  maxGrievancesPerWindow: 2,
  maxParticipants: 4,
  maxTextLen: 240,
  maxCategoryLen: 40,

  // Bound on the transcript either prompt renders back to the model.
  transcriptMaxLines: 60,
};

// --- D10: labels in, integers out (plan-x5, Phase 2) ---
// The Assessor is shown where a relationship currently SITS as a bucketed
// word, never as a number. Mixing a raw axis scale with a +-deltaClamp answer
// scale in one prompt is what forces prior art into warnings like "NEVER
// output values like 50, 80 or 100" — that warning treats the symptom of
// showing two number scales and asking for one of them back.
//
// Shape: `cuts` is ascending and exactly one shorter than `labels`; a value
// below cuts[0] takes labels[0], above the last cut takes the last label.
// Read by x5AxisLabel (X5 section), which is the only consumer. The bands are
// authored to read as prose in a sentence ("trust: warming, tension: none"),
// not to align with PHASE_THRESHOLDS — that ladder buckets a composite, this
// buckets one axis at a time.
//
// `tension` is the odd one and is authored to LOOK odd: its low band is
// "none", because low tension is the good state (D9). Every other axis reads
// better as it rises.
const X5_AXIS_LABELS = {
  trust:     { cuts: [-0.5, -0.15, 0.15, 0.5], labels: ['wary', 'guarded', 'neutral', 'warming', 'trusting'] },
  affection: { cuts: [-0.5, -0.15, 0.15, 0.5], labels: ['cold', 'distant', 'neutral', 'fond', 'close'] },
  tension:   { cuts: [0.15, 0.4, 0.7],         labels: ['none', 'some friction', 'strained', 'hostile'] },
  respect:   { cuts: [-0.5, -0.15, 0.15, 0.5], labels: ['dismissive', 'unimpressed', 'neutral', 'regarded', 'admiring'] },
  comfort:   { cuts: [0.2, 0.5, 0.8],          labels: ['stiff', 'settling', 'easy', 'completely at ease'] },
  desire:    { cuts: [-0.15, 0.15, 0.4, 0.7],  labels: ['averse', 'none', 'a flicker', 'clear', 'strong'] },
};

// --- Relationship phase ladder (correctness plan Phase 2, D1/D2) ---
// intimacyLevel buckets into the conversationPhase the prompt turns into a
// behavioural directive ("You barely know them" vs "You're deeply
// connected") — the single strongest lever in the whole NPC block.
//
// The old formula was ((trust+1) + (affection+1) + comfort*2) / 4 * 50, which
// scored a brand-new NPC at 25 — already past the `familiar` gate at 20. The
// bottom rung was unreachable for anyone neutral: you had to score
// trust + affection + 2*comfort < -0.4, i.e. actively dislike the player, to
// read as a stranger. And since applyRelDelta re-derives on every call and
// the scene prompt requests a relationshipDeltas object every single turn,
// every NPC flipped to `familiar` on exchange one and started referencing
// shared history with someone they'd just met.
const PHASE_THRESHOLDS = {
  intimate: 70,
  close: 40,
  familiar: 20,
};

// --- IM prompt (correctness plan Phase 1, D7) ---
// How much of the REAL persisted thread (world.computer.apps.im.threads[id])
// buildImPrompt renders back to the model. Before this, an IM reply saw only
// the shared memory.recent buffer — so a forty-message text conversation was
// presented as five interleaved lines that also contained in-person dialogue.
const IM_PROMPT = {
  threadDepth: 12,         // trailing messages of the real thread shown to the model
};

// Demotion (active -> ambient) must always be narrated as an in-fiction
// beat, never a silent swap. {name} = the demoted NPC, {other} = whoever
// they're being displaced by (falls back to "you" if omitted).
const DEMOTION_BEATS = [
  '{name} turns back to their laptop.',
  '{name} drifts toward the kitchen.',
  '{name} gets absorbed in their phone.',
  '{name} wanders off, leaving you and {other} to talk.',
  '{name} settles back into what they were doing.',
];

// --- Image cache ---
const IMAGE_CACHE = {
  cap: 500,               // LRU max entries (D2, character-cutout-scene-rendering-plan: 200 -> 500 to hold the plate+cutout namespace split)
  resolutions: { bg: '768x512', char: '512x768', scene: { landscape: '768x512', portrait: '512x768' }, cutout: '512x768' },
};

// ===== CHARACTER CUTOUTS (character-cutout-scene-rendering-plan, Phase 1) =====
// Tuning for the cutout cleanup pipeline: RMBG-1.4's mask (via the
// text-to-image plugin's removeBackground:true) is soft and carries no color
// decontamination, so a straight port of persona-realm's specks cleanup
// (killParasitesSync) is not enough on its own — D14/D15 below are the
// amendments the plan's review pass added on top of the ported D5 algorithm.
const CUTOUT_TUNING = {
  bboxAlpha: 24,              // alpha-bbox threshold (persona-realm spriteBBox)
  speckAlpha: 20,             // foreground alpha in the cleanup
  speckAreaMax: 120,          // erase components smaller than this
  speckMainRatio: 0.85,       // ...and smaller than this share of the main
  borderMarginFrac: 0.02,     // border band: max(3, round(min(W,H)*this))
  removeBorderComponents: false, // D5: seated/edge poses may touch the frame
  closeRadius: 2,              // D15: dilate-then-erode radius (px) before
                                // component labeling — protects hair wisps/
                                // fingertips from being pruned as specks
  spillAlphaMax: 250,          // D14: pixels with speckAlpha < alpha < this
                                // are matte-edge pixels; their RGB gets
                                // decontaminated toward the subject's own
                                // opaque-pixel mean color
};

// D16 fallback defaults only — once a cutout has actually been generated,
// its real floor anchor is measured from its own alpha channel (cutoutBBox)
// at layout time, and these bottomFrac values are never consulted again for
// that (charId, pose) pair. scale is the base placement scale before the
// layout's own spread factor (D10); seedWord threads into the prompt.
const CUTOUT_POSES = {
  standing: { label: 'Standing', scale: 1.0,  bottomFrac: 0.06, seedWord: 'standing casually' },
  seated:   { label: 'Seated',   scale: 0.82, bottomFrac: 0.04, seedWord: 'seated' },
  lounging: { label: 'Lounging', scale: 0.90, bottomFrac: 0.03, seedWord: 'lounging' },
};
const CUTOUT_EXPRESSIONS = ['neutral', 'happy', 'talking'];

// --- Title-gallery slideshow (menu overhaul Phase 10) ---
// Adopts the reference games' two-layer crossfade + lazy 3-image buffer
// (src/ref/structural/perchance-menu-conventions.md §3.4–3.8) onto this game's image
// pipeline, with three deliberate fixes: bounded retries with exponential
// backoff (never the reference games' uncapped 500ms retry loop), caching
// through the shared LRU instead of multi-MB data-URLs in kv, and a hard
// cap on the menu's share of that cache (deviation 4). The trait lists and
// rating-tagged prompt assembly live in DEFS.MENU (deviation 2).
const MENU_SLIDESHOW = {
  intervalMs: 8000,          // auto-cycle cadence
  crossfadeMs: 1200,         // two-layer opacity transition length
  // Fast-fill target. Sized so that a pool emptied by a generation purge
  // (see IMAGE's MENU_GALLERY_GENERATION) becomes watchable in about a
  // minute rather than showing one repeated image while the 15s steady
  // pacer slowly catches up.
  bufferTarget: 6,
  fastFillMs: 800,           // gap between generations while below bufferTarget
  // The menu generates FOREVER, not just up to a target: once the fast fill
  // is done it keeps producing one image every steadyGenMs for as long as
  // the menu is open, and the ring prunes its own oldest beyond
  // maxPersistedImages. So the pool is always 100 fresh-ish images rather
  // than the same 3 forever. Paced (not back-to-back) because generation
  // costs real time and quota, and the slideshow only shows one per 8s.
  steadyGenMs: 15000,
  maxSessionImages: 100,     // in-memory session buffer cap — matches the ring,
                             // so everything saved is reachable via prev/next
  maxPersistedImages: 100,   // saved pool cap (the menu's share of the LRU): keeps
                             // generating, prunes the oldest saved menu images
                             // (deviation 4's ring + deleteCachedImage eviction)
  hydrateBatch: 8,           // blobs pulled from the LRU per background tick when
                             // rehydrating the session buffer from the ring
  retryMax: 4,               // generation retries before settling on the gradient
  retryBaseMs: 2000,         // first retry delay; doubles per attempt
  // Match the viewport's orientation so the contain-fit bars stay small.
  // There is deliberately no crop setting: images are shown whole
  // (object-fit: contain) and cached uncropped — see IMAGE's orientation
  // block for why trimming on the way into the cache was removed.
  resolutions: { landscape: '768x512', portrait: '512x768' },
};

// --- Character generation ---
// Quality thresholds live per-tier on CAST_CONSTRAINTS below (qualityThresholdSolo/
// Group were an earlier, now-superseded flat version — removed rather than left dead).
const CHAR_GEN = {
  maxAttempts: 50,          // constraint satisfaction attempts before relaxation;
                             // also the per-character reroll cap within one attempt
  minTemperamentSpread: 0.5,      // min average per-axis range (max-min) across the cast
  volatilityHighLowThreshold: 0.3, // cast must have one npc >= this and one <= -this
  constraintRelaxOrder: ['secret', 'obstructingWant', 'alliance', 'unresolvedConflict'],
  ageRange: [22, 34],       // default roll range for generated characters (Phase 0)
  // Gender weights for deterministic assignment. The five identity options
  // are first-class fields (bible.gender) used by RoomList filters. The
  // neutral pool covers names that read as gender-ambiguous regardless of
  // the assigned gender. Trans_male/trans_female reuse the male/female
  // pools (their name choice aligns with their gender, not birth sex);
  // futanari leans on the female pool.
  genderWeights: { female: 0.40, male: 0.40, futanari: 0.08, trans_male: 0.06, trans_female: 0.06 },
  // Discord feedback (2026-08-24): dramatically expanded from the original
  // 26-per-bucket pools (one name per letter) after a player hit two
  // genuinely distinct NPCs rolling the same first name and reading it as
  // one person split across rooms. rollUniqueName/dedupeCastNames (SIM) stop
  // that from reaching the player at all now, but a bigger pool matters
  // independently — the old pool made a collision likely with well under
  // the sqrt(26)~5 people the birthday paradox predicts, and Classifieds
  // applicants alone can roll dozens over a long playthrough.
  namePools: {
    first_f: ['Ava','Bianca','Camille','Daria','Elena','Fiona','Grace','Hana','Ivy','Jade','Kira','Lena','Mira','Nora','Olive','Priya','Quinn','Rosa','Sage','Tara','Uma','Vera','Willow','Xena','Yuki','Zara','Aisha','Beatrice','Chloe','Delphine','Esme','Freya','Giselle','Harriet','Imani','Jasmine','Keiko','Lucia','Maya','Naomi','Odette','Paloma','Renee','Selene','Talia','Ursula','Valentina','Winona','Ximena','Yasmin','Zoya','Adele','Bridget','Celeste','Dahlia','Eliza','Farrah','Georgia','Hazel','Inez','Juniper','Kendra','Liana','Marisol','Nadia','Opal','Petra','Queenie','Renata','Simone','Thea','Unity','Valeria','Wren','Xiomara','Yolanda','Zelda','Amara','Bettina','Cassia','Daphne','Emiko','Fatima','Gwendolyn','Helena','Ingrid','Juno','Kalinda','Liliana','Meredith','Nia','Ophelia','Perla','Rowena','Serafina','Tatum','Umeko','Vesper','Wilhelmina','Xandra','Yara','Zinnia','Alessandra','Belen','Chidinma','Dominika','Esperanza','Francesca','Guadalupe','Hyunwoo','Isadora','Josefina','Katarzyna','Larissa','Mabel','Noor','Ottilie','Pilar','Rin','Solveig','Toula','Uzoma','Vasilisa','Xochitl','Yevgenia','Zsofia','Anwen','Bree','Consuela','Dagny','Enid','Faustine','Gioia','Honora','Ilse','Jocasta','Kalani','Leilani','Muriel','Nkechi','Oriana','Perdita','Rosalind','Sunniva','Thandiwe','Undine','Viridiana','Wisteria','Xylia','Yumiko','Zephyrine','Anastasia','Brielle','Carmela','Diondra','Etta','Flora','Gemma','Henrietta','Ines','Jia','Kamilah','Leontyne','Marguerite','Neve','Octavia','Precious','Roisin','Saoirse','Trinh','Ulyana','Verity','Winifred','Xanthe','Yasemin','Zainab','Adaeze','Bilqis','Chiara','Delia','Esther','Fabienne','Genevieve','Hollis','Idalia','Jovana','Karolina','Liesl','Malaika','Nkem','Onome','Palesa','Ren','Sachiko','Thuy','Utako','Viola','Whitney','Yamileth','Zawadi'],
    first_m: ['Aiden','Bruno','Cole','Dexter','Eli','Felix','Gus','Hugo','Ian','Jonah','Kai','Leo','Marcus','Nico','Oscar','Pierce','Quinn','Rex','Sam','Theo','Umar','Victor','Wes','Xavier','Yusuf','Zane','Andres','Bertrand','Cedric','Damian','Ezra','Fernando','Gareth','Hendrik','Ignacio','Jasper','Kofi','Lachlan','Milo','Nasir','Omar','Percy','Rafael','Silas','Tobias','Uche','Vincenzo','Wyatt','Xiomar','Yannick','Zaid','Alessandro','Baptiste','Chike','Dimitri','Emeka','Farid','Gunnar','Hiroshi','Idris','Jamal','Kenji','Leandro','Mateo','Naoki','Osamu','Pablo','Quang','Ronan','Sten','Tarek','Ulrich','Valentin','Wilhelm','Xander','Yosef','Zoltan','Anders','Boris','Callum','Dashiell','Elias','Franco','Giorgio','Hamish','Ismail','Jerome','Kwame','Lorenzo','Magnus','Niall','Oisin','Petros','Ravi','Sebastian','Tomasz','Ulysses','Vidal','Wolfgang','Xiang','Yeshua','Zachariah','Adebayo','Basim','Cormac','Domenico','Eoin','Fyodor','Gustavo','Haruto','Ivo','Julen','Kiran','Lukas','Miroslav','Nnamdi','Otieno','Peio','Quentin','Rustam','Salvatore','Tao','Uwe','Vasco','Waylon','Xylander','Yaw','Zephyr','Amadou','Balthazar','Ciaran','Dermot','Erasmus','Ferran','Georges','Hakeem','Iwan','Januzaj','Kaito','Lennart','Mustafa','Nikolai','Obadiah','Prosper','Quinlan','Reza','Soren','Tarquin','Ulf','Vittorio','Waldemar','Xerxes','Yusufu','Zephaniah','Anton','Bram','Corwin','Declan','Emrys','Florin','Gideon','Han','Iker','Jarrah','Kasimir','Lior','Matteo','Nazir','Orlando','Pavel','Rohan','Roque','Stellan','Taro','Umberto','Viggo','Wendell','Xochitl','Yorick','Zephyros','Ansel','Byron','Caius','Diego','Ellery','Farouk','Godfrey','Hemi','Idowu','Javon','Kenzo','Laszlo','Mikael','Ngozi','Orion','Phineas','Raul','Stavros','Taavi','Uriel','Vitomir','Weston','Xolani','Yaakov','Zephyrin'],
    first_n: ['Alex','Blake','Casey','Devin','Ellis','Finley','Grey','Harper','Indigo','Jordan','Kit','Lane','Max','Noel','Orien','Phoenix','Quinn','River','Sky','Taylor','Val','Vex','Wren','Xio','Yves','Zion','Arden','Briar','Cypress','Dallas','Emery','Frankie','Gray','Hollis','Iris','Jules','Kai','Landry','Marlowe','Nova','Ocean','Peyton','Reese','Sage','Tatum','Ariel','Vesper','Winter','Xen','Yael','Zephyr','Ainsley','Bay','Clay','Dakota','Elliot','Fen','Glen','Haven','Ira','Jem','Kestrel','Lark','Merit','Nile','Onyx','Perry','Quill','Robin','Story','Tegan','Umi','Vale','Wilder','Xiomara','Yarrow','Zuri','Aspen','Brooks','Cove','Denali','Echo','Fable','Glade','Haze','Ily','Journey','Keo','Linden','Marsh','Nix','Ora','Pax','Quest','Ridge','Slate','Thorn','Ulani','Vesta','Wynn','Xylo','Yuki','Zaan','Arley','Berlin','Corey','Dune','Ember','Fallon','Gem','Halo','Ivory','Jaylen','Kerry','Lex','Milan','Nyx','Osiris','Palmer','Quinby','Remy','Sailor','True','Umber','Vega','Waverly','Xander','Yates','Zeal','Auden','Bexley','Cai','Dylan','Elm','Frey','Gale','Harlow','Indy','Jonquil','Kaylin','Larkin','Merritt','North','Oakley','Pilot','Reverie','Rune','Sable','Tarn','Urban','Vail','Wynter','Xiao','Yun','Zephyrine'],
  },
};

// Surnames. Shared by NPCs and the player alike (Discord feedback,
// 2026-08-24 — NPCs never had one before; "a roommate is 'Mira', not 'Mira
// Vance'" was the original design call, but the collision report above
// argues for real full identities, not just a bigger first-name pool).
// Kept beside CHAR_GEN rather than inside it: the player's roll
// (rollPlayerName, SIM) and the cast's both read this same table, and
// SURNAME_POOL predates CHAR_GEN.namePools existing for anything but first
// names, so it stays its own top-level constant rather than nested in.
const SURNAME_POOL = ['Ashford','Beckett','Calloway','Doyle','Ellery','Fairbanks','Grieves','Hollis','Ives','Jarrow','Keating','Lockhart','Marchetti','Novak','Oakes','Pemberton','Quimby','Rademacher','Sinclair','Thorne','Underhill','Vance','Whitlock','Yarrow','Zeller','Alvarez','Bishop','Castillo','Delacroix','Ekwueme','Fontaine','Garrity','Hargrove','Ishikawa','Jacoby','Kowalski','Lindqvist','Mercer','Nakamura','Okafor','Pruitt','Quintana','Rourke','Sorensen','Tremblay','Uzoma','Valdez','Winslow','Xu','Yamamoto','Zimmerman','Abernathy','Blackwood','Cassidy','Duarte','Espinoza','Fitzgerald','Greenwood','Halloran','Ionescu','Jimenez','Kirkland','Larsen','Montague','Nkemdirim','Oduya','Patterson','Quintero','Robledo','Suleiman','Trudeau','Utterback','Villareal','Wexford','Yeboah','Zaharia','Amundsen','Barrington','Chen','Delgado','Eriksson','Ferreira','Gallagher','Higgins','Iwata','Johansson','Kwan','Levesque','Marchand','Nowak','Ozturk','Pellegrini','Quijano','Rasmussen','Sato','Tanaka','Uwimana','Vasquez','Whitfield','Xiong','Yilmaz','Zubairi','Adeyemi','Baptiste','Chadwick','Devereux','Eldridge','Farrow','Gustafsson','Hendricks','Iyer','Jansen','Kimura','Leclerc','Malinowski','Neal','Ochoa','Petrov','Qadir','Reyes','Schneider','Tsang','Ubeda','Voss','Whitmore','Xuan','Yoon','Zamora','Ainsworth','Beaumont','Castellanos','Drummond','Ekstrom','Falkner','Giordano','Hartley','Isakov','Juarez','Kaplan','Lefebvre','Moreau','Nishimura','Oyelaran','Prescott','Quiroz','Radcliffe','Steranko','Torvik','Uddin','Verhoeven','Wiley','Xochitl','Yankova','Zawadzki','Albright','Blackburn','Cheung','Dovek','Eaton','Faulkner','Gibbons','Haaland','Ibsen','Jelinek','Kaczmarek','Landry','Meinhardt','Nilsson','Obrien','Palacios','Quach','Reinholt','Sundberg','Trask','Ulloa','Vandenberg','Whitaker','Xavier','Yeltsin','Zolnowski','Aoki','Bergstrom','Coelho','Diallo','Ehrlich','Feliciano','Gervais','Holloway','Ibarra','Jaramillo','Kessler','Laurent','Marchetto','Nagata','Ostrowski','Padgett','Quintanilla','Renner','Stavros','Templeton','Uwais','Vukovic','Wahlberg','Xiang','Yancey','Zellweger'];

// --- Canonical character schema ---
// Single authority. Every construction path returns through validateCharacter.
const CHARACTER_SCHEMA = {
  bible: {
    name:          { type: 'string', required: true, default: '', maxLength: 60 },
    // Discord feedback (2026-08-24): NPCs never had a surname before — only
    // the player did (rollPlayerName, SIM). Not required: an old save's NPCs
    // read as '' (rendered as first-name-only, same as before this existed)
    // rather than needing a migration pass.
    surname:       { type: 'string', required: false, default: '', maxLength: 60 },
    visual:        { type: 'string', required: false, default: '', maxLength: 400 }, // cached paragraph derived from physical (legacy)
    // Seasonal Calendar & Sandbox Plan (B1/D12): dotted paths the player
    // wrote by hand — 'name', 'physical', 'physical.hair.color', 'visual',
    // … mergeProseIntoBible (llm.js) skips any path it covers (a prefix
    // match: 'physical' protects every key under it). MUST be declared here,
    // in CHARACTER_SCHEMA, or validateCharacter strips it on the way in and
    // the lock is a no-op that looks like it works (the castWeb scar —
    // design invariant 3). Persisted with the bible: a later Character
    // Studio edit or prose re-expansion must honour it too.
    authoredFields: { type: 'array', required: false, default: [], maxItems: 20 },
    genSeed:       { type: 'number', required: true, default: 0 },                  // stable seed for image gen
    age:           { type: 'number', required: true, default: 25, range: [18, 60] },   // Phase 0: first-class age field for filtering/stubs
    gender:        { type: 'string', required: true, default: 'female', enum: ['male','female','futanari','trans_male','trans_female'] }, // Phase 0: filterable identity field
    species:       { type: 'string', required: false, default: 'human', enum: ['human','elf','orc','dwarf','tiefling','vampire','fae','catfolk','wolffolk','dragonborn'] }, // Settings & Pause Overhaul Phase 6 (D13): species from the Population tab's raceDist. The enum MUST stay in sync with RACES in defs.settings.js (a standing content lever — extending the pool is a data edit in BOTH places). default 'human' keeps every pre-overhaul NPC and authored character (Del) reading as a human.
    physical:      { type: 'object', required: false, default: {},                   // THE 25+ ITEM DESCRIPTION SECTION
      fields: {
        height:               { type: 'string', default: '' },
        build:                { type: 'string', default: '' },
        heightBuild:           { type: 'string', default: '' }, // cached "tall and lean"
        hair:                 { type: 'object', default: {},
          fields: { color: { type: 'string', default: '' }, style: { type: 'string', default: '' }, length: { type: 'string', default: '' }, texture: { type: 'string', default: '' } } },
        eyes:                 { type: 'object', default: {},
          fields: { color: { type: 'string', default: '' }, shape: { type: 'string', default: '' } } },
        skin:                 { type: 'object', default: {},
          fields: { tone: { type: 'string', default: '' }, texture: { type: 'string', default: '' }, ethnicity: { type: 'string', default: '' } } },
        face:                 { type: 'object', default: {},
          fields: { shape: { type: 'string', default: '' }, nose: { type: 'string', default: '' }, lips: { type: 'string', default: '' }, cheekbones: { type: 'string', default: '' }, jawline: { type: 'string', default: '' }, ears: { type: 'string', default: '' } } },
        body:                 { type: 'object', default: {},
          fields: { shape: { type: 'string', default: '' }, chestSize: { type: 'string', default: '' }, buttSize: { type: 'string', default: '' }, legs: { type: 'string', default: '' }, posture: { type: 'string', default: '' } } },
        distinguishingFeatures: { type: 'array', default: [] },
        piercings:            { type: 'array', default: [] },
        tattoos:              { type: 'array', default: [] },
        facialHair:           { type: 'string', default: '' },
        fashion:              { type: 'string', default: '' },
        accessories:          { type: 'string', default: '' },
        // RESERVED for roadmap Plan 2 (the scene reader). No reader today, but
        // unlike the fields Phase 5 pruned this one has real authored content
        // — Del Connors carries all four slots — and "what are they wearing
        // right now" is precisely the question the sensory layer will ask, off
        // the back of the existing `clothing` state machine. rollCastSlot no
        // longer emits four empty strings for it; the schema default covers a
        // generated NPC until something fills it.
        //
        // `genitals` was declared here and pruned once for having no producer
        // and no consumer. It is back, as part of `intimate` below, and this
        // time BOTH exist: generatePhysical (sim.js) rolls it for every
        // character, the Player Design studio authors it, and
        // getPhysicalDescriptionForPrompt (npc.js) reads it. If a future audit
        // finds the reader gone, prune it again — per RI6 the rule is the
        // rule.
        //
        // The undressed layer. One NESTED group rather than fields scattered
        // across `physical`, and that nesting is load-bearing: the describer
        // gates the whole group at one place (mature flag + explicit opt-in +
        // undressed) instead of remembering a gate per field. `body.chestSize`
        // above is untouched and still means the clothed silhouette —
        // `intimate.breasts` is a second level of detail for a second context,
        // not a replacement.
        //
        // `genitals` is an ARRAY of typed objects, discriminated on `type`,
        // specifically so one character can carry more than one set.
        //
        // `itemFields` is the UNION of every type's keys rather than a
        // per-type schema, because the existing validator walk
        // (resolveNpcFieldSpec → validateNpcItemObject, state.js) resolves an
        // array element against one flat `itemFields` map and nothing else.
        // Teaching it a second, type-dispatched shape would mean a second
        // validator for one field — and "the tab contents and the save
        // validator literally share one schema" is the invariant the
        // Character Studio rests on. Which keys actually APPLY to a type is
        // GENITAL_TYPE_FIELDS below, read by the roller, the describer and
        // the studio alike; normalizeGenitals (sim.js) is what strips the
        // inapplicable ones back out, so stored data stays clean without the
        // validator needing to know.
        intimate:             { type: 'object', default: {},
          fields: {
            breasts: { type: 'object', default: {},
              fields: { size: { type: 'string', default: '' }, shape: { type: 'string', default: '' }, areola: { type: 'string', default: '' }, nipples: { type: 'string', default: '' }, sensitivity: { type: 'string', default: '' } } },
            genitals: { type: 'array', default: [], maxItems: 4,
              itemFields: {
                type:        { type: 'string', required: true, enum: ['vagina', 'penis'] },
                hair:        { type: 'string', default: '' },
                sensitivity: { type: 'string', default: '' },
                description: { type: 'string', default: '', maxLength: 200 },
                labia:       { type: 'string', default: '' },   // vagina
                color:       { type: 'string', default: '' },   // vagina
                length:      { type: 'string', default: '' },   // penis
                girth:       { type: 'string', default: '' },   // penis
                cut:         { type: 'string', default: '' },   // penis
                balls:       { type: 'string', default: '' },   // penis
              } },
            bodyHair: { type: 'string', default: '' },
            // `preferences` is deliberately absent. It has no reader, and the
            // comment above is what happens to a field in that state. It
            // arrives with the intimacy layer that consumes it.
          }
        },
        typicalAttire:        { type: 'object', default: {},
          fields: { casual: { type: 'string', default: '' }, work: { type: 'string', default: '' }, sleep: { type: 'string', default: '' }, formal: { type: 'string', default: '' } } },
        voice:                { type: 'object', default: {},
          fields: { pitch: { type: 'string', default: '' }, texture: { type: 'string', default: '' }, accent: { type: 'string', default: '' } } },
        gait:                 { type: 'string', default: '' },
        scent:                { type: 'string', default: '' },
      }
    },
    history:       { type: 'string', required: true, default: '', maxLength: 600 },  // one paragraph
    temperament:   { type: 'object', required: true, default: {},
      fields: {
        warmth:           { type: 'number', range: [-1, 1] },
        volatility:       { type: 'number', range: [-1, 1] },
        openness:         { type: 'number', range: [-1, 1] },
        conscientiousness: { type: 'number', range: [-1, 1] },
        assertiveness:    { type: 'number', range: [-1, 1] },
        selfAwareness:    { type: 'number', range: [-1, 1] },
      }
    },
    personality:   { type: 'object', required: false, default: {},                   // NPC Overhaul — derived behavioral directives
      fields: {
        traits:       { type: 'array', default: [] },     // tag-style: ["reliable", "sarcastic"]
        coreTrait:    { type: 'string', default: '' },
        hiddenTrait:  { type: 'string', default: '' },
        quirks:       { type: 'array', default: [] },
        likes:        { type: 'array', default: [] },
        dislikes:     { type: 'array', default: [] },
      }
    },
    occupation:    { type: 'object', required: true, default: {},
      fields: {
        category:        { type: 'string', required: true },
        title:            { type: 'string', required: true },
        scheduleTemplate: { type: 'string', required: true },  // key into SCHEDULES
        incomeBand:       { type: 'string', required: true },   // low|mid|high
        hours:            { type: 'string', required: true },
        // --- vocation-and-lifestyle plan. Every one of these has a reader,
        // named beside it — RI6, and the stressProfile note directly below.
        // Defaults reproduce pre-plan behaviour exactly, which is why no save
        // migration is needed: an un-migrated NPC is on_site and waged, which
        // is what they already were.
        workMode:     { type: 'string', required: false, default: 'on_site' },  // D2  → SIM's npcIsOffsite
        incomeSource: { type: 'string', required: false, default: 'wage' },     // D20 → LLM's persona block
        officeDays:   { type: 'array',  required: false, default: [] },         // D4  → SIM's isOfficeDay
        workRoom:     { type: 'array',  required: false, default: [] },         // D5  → SIM's resolveHomeWorkPlacement
        workActivities: { type: 'array', required: false, default: [] },        // D5  → SIM's pickHomeWorkActivity
        contentWork:  { type: 'boolean', required: false, default: false },     // D16 → COGNITION's content drive candidacy
        // Phase 7 (lifestyle derivation): the idle pastimes this job's holder
        // reaches for in free time — drive ids from the isIdlePastime set
        // (read_book / watch_tv / scroll_phone). Empty = no lean, which is
        // the legacy/hand-authored default. → COGNITION's idlePastimePreferred
        // (the pastime term in scoreDrive). Field and reader ship together,
        // per RI6 and the stressProfile note directly below.
        idlePastimes: { type: 'array',  required: false, default: [] },
        // Phase 7 captured dimensions (spec'd in the vocation plan's "other
        // lifestyle dimensions" section). Each ships WITH its reader, per RI6 and
        // the stressProfile note — a field with no consumer is the one scar this
        // plan must not repeat. Defaults reproduce pre-plan behaviour exactly,
        // so no migration is needed.
        styleLean:    { type: 'array',  required: false, default: [] },   // styleTags (CLOTHING_DEFS vocab) → ITEMS composeOutfit's style-tag term (via NPC's npcOutfitForContext)
        foodLean:     { type: 'array',  required: false, default: [] },   // TASTE_TUNING.pool keys → TASTE's deriveNpcTaste (pushed through the same guarded `likes` slots as trait anchors)
        sleepRhythm: { type: 'string', required: false, default: 'regular' }, // early|regular|late|erratic → SIM's derived sleep-span adjustment (resolveScheduleActivity)
        spendingLean:{ type: 'string', required: false, default: 'neutral' }, // frugal|neutral|free_spender → LLM's occupationLivingClause (persona line only)
        // `stressProfile` was here, set on all 20 OCCUPATION_POOL entries and
        // read by nothing (correctness plan Phase 5). resolveTick's random-
        // event roll carries a comment claiming to be "weighted by stress +
        // low needs" and is in fact a flat `rng() < 0.15` — if that weighting
        // is ever built, reintroduce the field WITH its reader, per RI6.
      }
    },
    interests:     { type: 'array', required: true, default: [], maxItems: 3,
      itemFields: { name: { type: 'string', required: true }, tags: { type: 'array', default: [] }, skill: { type: 'number', range: [0, 100], default: 0 } } },
    values:         { type: 'array', required: true, default: [], maxItems: 2,
      itemFields: { name: { type: 'string', required: true }, opposition: { type: 'string', required: true } } },
    baggage:        { type: 'string', required: true, default: '', maxLength: 300 },
    wound:          { type: 'string', required: true, default: '', maxLength: 300 },
    want:           { type: 'string', required: true, default: '', maxLength: 300 },
    blindSpot:      { type: 'string', required: true, default: '', maxLength: 300 },
    boundary:       { type: 'string', required: true, default: '', maxLength: 300 },
    speech:         { type: 'object', required: true, default: {},
      fields: {
        verbosity:      { type: 'number', range: [0, 1] },
        formality:      { type: 'number', range: [0, 1] },
        humorStyle:     { type: 'string', default: 'dry' },
        profanityLevel:  { type: 'number', range: [0, 1] },
        verbalTics:     { type: 'array', default: [] },
        textingStyle:   { type: 'string', default: 'casual' },
        // Both of these were dead at the start of the correctness plan's
        // Phase 5 and are now WIRED (buildNpcBlockV2's [Speech] line) rather
        // than pruned. The triage nearly deleted them — until a completeness
        // grep found that Del Connors, the hand-authored contractor below,
        // carries a real vocabularyLevel of 0.6 and two genuinely good
        // catchphrases. Authored content with no consumer is a stronger
        // argument for wiring than for deleting.
        vocabularyLevel: { type: 'number', range: [0, 1], default: 0.5 },
        catchphrases:   { type: 'array', default: [] },
      }
    },
    scheduleTemplate: { type: 'string', required: true, default: 'standard' },
    sketch:         { type: 'string', required: true, default: '', maxLength: 120 }, // one-line cached sketch for ambient tier
    sampleLines:    { type: 'array', required: true, default: [], maxItems: 5 },
  },
  mutable: {
    bibleRevision:  { type: 'number', default: 0 },
    bibleChanges:   { type: 'array', default: [] },
    residency: { type: 'object', required: true, default: {},
      fields: {
        status:        { type: 'string', enum: ['resident','partner_of_resident','visitor','prospective','former'] },
        room:          { type: 'string', nullable: true },
        bed:           { type: 'string', nullable: true },
        partnerOf:     { type: 'string', nullable: true },
        since:         { type: 'number', default: 1 },
        contributesRent: { type: 'boolean', default: true },
        // Fraction of the TOTAL rent this roommate has agreed to cover,
        // clamped to ECONOMY.rent.maxRoommateShare by computeRent. Phase 8
        // (vocation plan): default is now null = "derive from income" via
        // SIM's incomeRentShare — a roommate pays what their incomeBand ×
        // incomeSource says, not a flat 0.15. A negotiated value (the future
        // agreement system) is written here explicitly and overrides the derivation.
        // See src/ref/complete/economy-and-rent-plan.md.
        rentShare:     { type: 'number', range: [0, 1], default: null, nullable: true },
      }
    },
    location:       { type: 'string', nullable: true },
    activity:       { type: 'string', default: '' },
    mood:           { type: 'number', range: [-1, 1], default: 0 },
    moodReason:     { type: 'string', default: '' },                       // NPC Overhaul — why they're in this mood
    schedule:       { type: 'object', default: {},                         // NPC Overhaul — current/next block tracking
      fields: { currentBlock: { type: 'string', default: '' }, nextBlock: { type: 'string', default: '' }, willReturnAt: { type: 'number', nullable: true } } },
    needs: { type: 'object', required: true, default: {},
      fields: {
        hunger:   { type: 'number', range: [0, 100], default: 50 },
        hygiene:  { type: 'number', range: [0, 100], default: 50 },
        energy:   { type: 'number', range: [0, 100], default: 50 },
        social:   { type: 'number', range: [0, 100], default: 50 },
        comfort:  { type: 'number', range: [0, 100], default: 50 },     // NPC Overhaul
        stimulation: { type: 'number', range: [0, 100], default: 50 },  // NPC Overhaul
        desire:  { type: 'number', range: [0, 100], default: 10 },      // Intimacy & Voyeurism Phase 8 (DESIRE.npc.start) — general arousal, distinct from relPlayer.desire (the axis)
      }
    },
    relPlayer: { type: 'object', required: true, default: {},
      fields: {
        trust:      { type: 'number', range: [-1, 1], default: 0 },
        affection:  { type: 'number', range: [-1, 1], default: 0 },
        tension:    { type: 'number', range: [-1, 1], default: 0 },
        respect:    { type: 'number', range: [-1, 1], default: 0 },
        comfort:    { type: 'number', range: [0, 1], default: 0 },           // NPC Overhaul
        desire:     { type: 'number', range: [-1, 1], default: 0 },           // NPC Overhaul
        intimacyLevel: { type: 'number', range: [0, 100], default: 0 },       // NPC Overhaul — derived
        conversationPhase: { type: 'string', enum: ['early', 'familiar', 'close', 'intimate'], default: 'early' }, // NPC Overhaul
        grievances: { type: 'array', default: [] },                           // NPC Overhaul
        firstMetDay: { type: 'number', default: 1 },                         // NPC Overhaul
        lastInteractionDay: { type: 'number', default: 1 },                 // NPC Overhaul
      }
    },
    memory: { type: 'object', required: true, default: {},
      fields: {
        facts:    { type: 'array', default: [],
          itemFields: { text: { type: 'string' }, day: { type: 'number' }, importance: { type: 'number' }, category: { type: 'string', default: 'other' }, valid: { type: 'boolean', default: true },
            // Belief record (knowledge-gossip-memory-plan Phase 1, D1/D2/D3/D10):
            // provenance = 'witnessed' | 'told_by:<npcId>' | 'overheard' | 'inferred';
            // confidence 0..1; salience 0..1; pinned per D3; emotionalTag is an
            // EMOTIONAL_WEIGHTS key (Phase 2 reads it).
            provenance: { type: 'string', default: 'witnessed' },
            confidence: { type: 'number', range: [0, 1], default: 1 },
            salience:   { type: 'number', range: [0, 1], default: 0.5 },
            pinned:     { type: 'boolean', default: false },
            emotionalTag: { type: 'string', default: '' },
            // Phase 3 (D9/D20): the stable per-fact id the open-question
            // lifecycle's factId reference points at. Assigned by
            // addMemoryFact from memory.nextFactId; never reused.
            factId:     { type: 'number' } } },
        episodes: { type: 'array', default: [],
          itemFields: { day: { type: 'number' }, text: { type: 'string' }, decay: { type: 'number', range: [0, 1] }, importance: { type: 'number' }, emotionalTag: { type: 'string', default: '' }, participants: { type: 'array', default: [] } } },
        summary:  { type: 'string', default: '' },
        summaryRevision: { type: 'number', default: 0 },                    // NPC Overhaul
        recent:  { type: 'array', default: [] },                            // NPC Overhaul — last ~10 exchanges
        // NPC Overhaul — anti-repetition. `lastJobMention`/`lastHobbyMention`
        // were here and are pruned (correctness plan Phase 5): both were
        // initialised to -1 on every NPC and never written or read again.
        // `recentTopics` does the same job generically and IS read, by
        // getStyleDirective.
        styleCounters: { type: 'object', default: {},
          fields: { total: { type: 'number', default: 0 }, sincePersonal: { type: 'number', default: 0 }, recentTopics: { type: 'array', default: [] } } },
        // Phase 3 (D9): the open-question records and the stable factId
        // counter they draw from. The lifecycle in rumination.js is the
        // record's reader; Phase 4's D13 bridge is its declared consumer.
        openQuestions: { type: 'array', default: [],
          itemFields: { topic: { type: 'string' }, factId: { type: 'number' }, curiosity: { type: 'number', range: [0, 1], default: 0.2 }, age: { type: 'number', default: 0 }, born: { type: 'number', default: 1 }, targets: { type: 'array', default: [] } } },
        nextFactId: { type: 'number', default: 1 },
      }
    },
    // `arcs` was here (correctness plan Phase 5): initialised to `[]` at
    // creation and referenced by nothing else in the codebase — no writer, no
    // reader, no roadmap plan claiming it. Character change over time is
    // roadmap Plan 4's territory and will want a shape designed against its
    // own needs, not this placeholder.
    // Contacts (external-world plan Phase 2): do you have this person's
    // number? Gates the IM contact list and invitations. Earned by asking
    // in conversation — hiring someone through a service never grants it.
    // Del is the sole day-one exception (seeded true at new-game setup).
    contactKnown:   { type: 'boolean', default: false },
    flags:           { type: 'object', default: {} },
  }
};

// --- Contacts (src/ref/complete/external-world-npcs-overhaul-plan.md, Phase 2) ---
// Asking for someone's number is a social beat, not a threshold check.
// Willingness is personality-weighted (locked decision 7): a warm, open
// person shares early; a guarded one needs real rapport first. The rapport
// score blends the relationship axes that actually mean "I like and trust
// you"; the requirement it must clear is lowered by temperament.
const CONTACT_TUNING = {
  baseRequired: 0.30,        // rapport a perfectly neutral-temperament NPC needs
  warmthWeight: 0.35,        // warm people hand it over sooner
  opennessWeight: 0.25,      // open people too, slightly less strongly
  retryCooldownDays: 2,      // days before you can ask again after a refusal
  // Residents already live with you — sharing a number is a formality, so
  // they clear a much lower bar than someone you just met.
  residentRequirementMultiplier: 0.4,
};

// --- Temperament axes pools (weighted) ---
const TEMPERAMENT_POOL = [
  // Each entry: { label, axis, value, weight }
  // Values drawn per-axis, not per-label; these are reference distributions
];

// --- Vocation tuning (vocation-and-lifestyle plan D2/D4/D7/D9) ------------
// The dials behind the work-mode model and the personality↔occupation draw.
//
// The affinity numbers are a FIRST PASS set by arithmetic against the pool's
// authored weights, not by measurement — the same honesty COGNITION's header
// carries. `adultDisinhibitionFloor` is the one hard gate in the whole roll
// (D9): below it an adult occupation scores weight 0 and cannot be drawn at
// all. Every other affinity is a multiplier clamped into
// [affinityFloor, affinityCeiling], so a mismatched draw is unlikely and
// never impossible — a shy accountant and a gregarious accountant are both
// real people, and a system that forbids one of them is a caricature
// generator.
const VOCATION_TUNING = {
  // D9. npcDisinhibition is [0,1] with 0.5 the perfectly average temperament,
  // so 0.62 is "meaningfully more forward than average" — roughly the top
  // third of a uniform cast. Per-occupation `affinity.disinhibitionFloor`
  // overrides this where a title wants to be stricter or looser.
  adultDisinhibitionFloor: 0.62,

  // Soft weights clamp here. The floor is deliberately NOT 0 (D9): a soft
  // affinity shifts odds, it does not forbid, and a 0 would quietly turn
  // every temperament weight into a second hard gate.
  affinityFloor: 0.15,
  affinityCeiling: 3.0,

  // D4. How many days a hybrid worker is in the office, and which days are
  // eligible. Indices are getWeekday's (0=Mon .. 6=Sun), so the pool is the
  // working week. Rolled once per NPC in rollCastSlot and stored on the
  // occupation — SCHEDULES only knows weekday/weekend and cannot express it.
  hybridOfficeDayCount: [2, 3],
  hybridOfficeDayPool: [0, 1, 2, 3, 4],

  // D2. A self-employed NPC is mostly home, but some weekdays the work is
  // elsewhere — a shoot, a client, a venue. Derived per NPC per day rather
  // than stored (pure function of identity and date, so no field, no
  // migration). ~1 gig day a week.
  selfEmployedGigDayChance: 0.2,
};

// --- Occupation pool with schedule templates, income, stress, hours ---
// Every entry is {category, title, scheduleTemplate, incomeBand, hours} as
// before, plus the vocation plan's fields. All of the new ones are OPTIONAL
// and every one of them has a reader — D23, and the `stressProfile` scar the
// bible schema still carries a note about:
//
//   workMode       (D2)  → npcIsOffsite            — on_site|hybrid|remote|self_employed|none
//   incomeSource   (D20) → the persona block       — wage|self|means|none
//   workRoom       (D5)  → resolveHomeWorkPlacement — ordered room preference
//   workActivities (D5)  → pickHomeWorkActivity     — overrides HOME_WORK_ACTIVITIES
//   affinity       (D7)  → occupationAffinity       — temperament weights + the D9 floor
//   traitAffinity  (D7)  → the personality draw     — multipliers on PERSONALITY_TRAITS_POOL
//
// An entry with none of them behaves exactly as it did before this plan,
// which is what let the pool grow one row at a time instead of in a flag day.
//
// ON THE AFFINITY NUMBERS. A temperament weight `w` on an axis multiplies the
// draw by `1 + w * axis`, and the axis is [-1,1] — so 0.5 means "half again as
// likely at the top of the range, half as likely at the bottom". They are
// authored to make a cast read as people, not to make any job unreachable:
// the ONLY hard gate in the whole system is `disinhibitionFloor` (D9), which
// exists so that a reserved, rule-bound character cannot be handed
// adult-industry work by a dice roll. Everything else is a lean.
const OCCUPATION_POOL = [
  // --- ON SITE ------------------------------------------------------------
  // The shift work, the trades, the jobs that are somewhere else by
  // definition. These are the pre-plan pool, mostly unchanged: an empty
  // flat during the day is still the common case, and it has to stay that
  // way or the whole "catch someone home" beat stops being worth anything.
  { category: 'tech',       title: 'QA Tester',                 scheduleTemplate: 'day_shift',     incomeBand: 'mid',  hours: '9-17',  workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['watch_tv', 'scroll_phone'], styleLean: ["casual","plain"], foodLean: ["pasta","bread"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { temperament: { conscientiousness: 0.45, openness: 0.1 } }, traitAffinity: { meticulous: 1.6, methodical: 1.5, perfectionist: 1.4 } },
  { category: 'food',       title: 'Line Cook',                 scheduleTemplate: 'evening_shift', incomeBand: 'low',  hours: '16-23', workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['watch_tv', 'scroll_phone'], styleLean: ["sturdy","plain"], foodLean: ["bacon","beef","pasta"], sleepRhythm: 'late', spendingLean: 'frugal',
    affinity: { temperament: { volatility: 0.25, assertiveness: 0.2, conscientiousness: 0.15 } }, traitAffinity: { intense: 1.5, blunt: 1.4, 'thick-skinned': 1.4 } },
  { category: 'food',       title: 'Barista',                   scheduleTemplate: 'morning_shift', incomeBand: 'low',  hours: '6-14',  workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["casual"], foodLean: ["eggs","dairy"], sleepRhythm: 'early', spendingLean: 'neutral',
    affinity: { temperament: { warmth: 0.4, openness: 0.15 } }, traitAffinity: { easygoing: 1.5, playful: 1.4, warm: 1.4 } },
  { category: 'food',       title: 'Pastry Chef',               scheduleTemplate: 'morning_shift', incomeBand: 'mid',  hours: '5-13',  workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['read_book', 'watch_tv'], styleLean: ["cozy"], foodLean: ["sweets","dairy"], sleepRhythm: 'early', spendingLean: 'neutral',
    affinity: { temperament: { conscientiousness: 0.5, warmth: 0.2 } }, traitAffinity: { perfectionist: 1.6, meticulous: 1.5, patient: 1.4 } },
  { category: 'health',     title: 'Nurse',                     scheduleTemplate: 'night_shift',   incomeBand: 'mid',  hours: '19-07', workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['read_book', 'watch_tv'], styleLean: ["soft","cozy"], foodLean: ["cheese","bread"], sleepRhythm: 'erratic', spendingLean: 'neutral',
    affinity: { temperament: { warmth: 0.5, conscientiousness: 0.4 } }, traitAffinity: { nurturing: 1.7, reliable: 1.5, 'thick-skinned': 1.3 } },
  { category: 'health',     title: 'Paramedic',                 scheduleTemplate: 'night_shift',   incomeBand: 'mid',  hours: '19-07', workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['watch_tv', 'scroll_phone'], styleLean: ["sturdy","plain"], foodLean: ["beef","potatoes"], sleepRhythm: 'erratic', spendingLean: 'frugal',
    affinity: { temperament: { assertiveness: 0.45, volatility: -0.2, warmth: 0.25 } }, traitAffinity: { 'thick-skinned': 1.6, protective: 1.5, stoic: 1.4 } },
  { category: 'service',    title: 'Retail Manager',            scheduleTemplate: 'day_shift',     incomeBand: 'mid',  hours: '10-19', workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['watch_tv', 'scroll_phone'], styleLean: ["professional","neutral"], foodLean: ["cheese","pasta"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { temperament: { assertiveness: 0.4, conscientiousness: 0.3 } }, traitAffinity: { diplomatic: 1.4, ambitious: 1.4, patient: 1.3 } },
  { category: 'service',    title: 'Bartender',                 scheduleTemplate: 'night_shift',   incomeBand: 'mid',  hours: '18-02', workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["sharp","edgy"], foodLean: ["bacon","cheese"], sleepRhythm: 'late', spendingLean: 'free_spender',
    affinity: { temperament: { warmth: 0.4, assertiveness: 0.3, openness: 0.25 } }, traitAffinity: { flirtatious: 1.5, playful: 1.5, sarcastic: 1.3 } },
  { category: 'education',  title: 'Teacher',                   scheduleTemplate: 'day_shift',     incomeBand: 'mid',  hours: '8-16',  workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['read_book', 'watch_tv'], styleLean: ["collared","soft"], foodLean: ["rice","vegetables"], sleepRhythm: 'early', spendingLean: 'neutral',
    affinity: { temperament: { warmth: 0.45, conscientiousness: 0.4 } }, traitAffinity: { patient: 1.6, nurturing: 1.5, idealistic: 1.3 } },
  { category: 'trades',     title: 'Electrician',               scheduleTemplate: 'day_shift',     incomeBand: 'mid',  hours: '7-15',  workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['watch_tv', 'scroll_phone'], styleLean: ["boots","sturdy"], foodLean: ["beef","potatoes"], sleepRhythm: 'early', spendingLean: 'frugal',
    affinity: { temperament: { conscientiousness: 0.45, volatility: -0.25 } }, traitAffinity: { practical: 1.7, methodical: 1.5, reliable: 1.4 } },
  { category: 'trades',     title: 'Plumber',                   scheduleTemplate: 'day_shift',     incomeBand: 'mid',  hours: '8-16',  workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['watch_tv', 'scroll_phone'], styleLean: ["sturdy","practical"], foodLean: ["beef","bread"], sleepRhythm: 'early', spendingLean: 'frugal',
    affinity: { temperament: { conscientiousness: 0.4, warmth: 0.15 } }, traitAffinity: { practical: 1.7, blunt: 1.4, reliable: 1.4 } },
  { category: 'trades',     title: 'Carpenter',                 scheduleTemplate: 'day_shift',     incomeBand: 'mid',  hours: '7-15',  workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['watch_tv', 'read_book'], styleLean: ["plaid","sturdy"], foodLean: ["beef","bread"], sleepRhythm: 'early', spendingLean: 'frugal',
    affinity: { temperament: { conscientiousness: 0.4, openness: 0.15 } }, traitAffinity: { practical: 1.6, patient: 1.4, understated: 1.3 } },
  { category: 'science',    title: 'Lab Researcher',            scheduleTemplate: 'day_shift',     incomeBand: 'mid',  hours: '9-17',  workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['read_book', 'scroll_phone'], styleLean: ["studious","neutral"], foodLean: ["vegetables","rice"], sleepRhythm: 'early', spendingLean: 'neutral',
    affinity: { temperament: { conscientiousness: 0.5, openness: 0.35, assertiveness: -0.15 } }, traitAffinity: { curious: 1.6, meticulous: 1.6, methodical: 1.4 } },
  { category: 'fitness',    title: 'Personal Trainer',          scheduleTemplate: 'morning_shift', incomeBand: 'mid',  hours: '6-14',  workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["sporty","practical"], foodLean: ["chicken","eggs","beef"], sleepRhythm: 'early', spendingLean: 'neutral',
    affinity: { temperament: { assertiveness: 0.45, warmth: 0.3, conscientiousness: 0.25 } }, traitAffinity: { competitive: 1.6, confident: 1.5, intense: 1.3 } },
  { category: 'hospitality', title: 'Hotel Concierge',          scheduleTemplate: 'evening_shift', incomeBand: 'low',  hours: '15-23', workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['read_book', 'scroll_phone'], styleLean: ["elegant","sharp"], foodLean: ["bread","cheese"], sleepRhythm: 'late', spendingLean: 'neutral',
    affinity: { temperament: { warmth: 0.4, conscientiousness: 0.35 } }, traitAffinity: { diplomatic: 1.6, patient: 1.4, secretive: 1.2 } },
  { category: 'security',   title: 'Night Security',            scheduleTemplate: 'night_shift',   incomeBand: 'low',  hours: '22-06', workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['read_book', 'watch_tv'], styleLean: ["sturdy","plain"], foodLean: ["eggs","potatoes"], sleepRhythm: 'late', spendingLean: 'frugal',
    affinity: { temperament: { warmth: -0.2, volatility: -0.3, assertiveness: 0.2 } }, traitAffinity: { stoic: 1.7, guarded: 1.5, independent: 1.4 } },

  // --- HYBRID -------------------------------------------------------------
  // In two or three days a week, home the rest (D4 rolls WHICH days per NPC).
  // These are the jobs where you learn a roommate's rhythm: they are reliably
  // gone on the same days and reliably underfoot on the others.
  { category: 'tech',       title: 'Software Developer',        scheduleTemplate: 'day_shift', incomeBand: 'high', hours: '9-17', workMode: 'hybrid', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'scroll_phone'], styleLean: ["minimal","plain"], foodLean: ["rice","pasta"], sleepRhythm: 'late', spendingLean: 'neutral',
    affinity: { temperament: { conscientiousness: 0.35, openness: 0.3, assertiveness: -0.1 } }, traitAffinity: { methodical: 1.5, curious: 1.4, independent: 1.3 } },
  { category: 'tech',       title: 'Product Manager',           scheduleTemplate: 'day_shift', incomeBand: 'high', hours: '9-18', workMode: 'hybrid', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['watch_tv', 'scroll_phone'], styleLean: ["minimal","collared"], foodLean: ["beef","rice"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { temperament: { assertiveness: 0.45, conscientiousness: 0.3, warmth: 0.2 } }, traitAffinity: { ambitious: 1.6, diplomatic: 1.4, competitive: 1.3 } },
  { category: 'finance',    title: 'Accountant',                scheduleTemplate: 'day_shift', incomeBand: 'high', hours: '9-17', workMode: 'hybrid', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'watch_tv'], styleLean: ["neutral","plain"], foodLean: ["potatoes","cheese"], sleepRhythm: 'regular', spendingLean: 'frugal',
    affinity: { temperament: { conscientiousness: 0.6, volatility: -0.3 } }, traitAffinity: { meticulous: 1.7, methodical: 1.6, cautious: 1.4 } },
  { category: 'finance',    title: 'Financial Analyst',         scheduleTemplate: 'day_shift', incomeBand: 'high', hours: '8-18', workMode: 'hybrid', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['scroll_phone', 'read_book'], styleLean: ["sharp","crisp"], foodLean: ["beef","rice"], sleepRhythm: 'regular', spendingLean: 'frugal',
    affinity: { temperament: { conscientiousness: 0.45, assertiveness: 0.35 } }, traitAffinity: { ambitious: 1.6, competitive: 1.5, materialistic: 1.3 } },
  { category: 'legal',      title: 'Paralegal',                 scheduleTemplate: 'day_shift', incomeBand: 'mid',  hours: '9-18', workMode: 'hybrid', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'watch_tv'], styleLean: ["collared","neutral"], foodLean: ["cheese","bread"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { temperament: { conscientiousness: 0.55, volatility: -0.2 } }, traitAffinity: { meticulous: 1.6, reliable: 1.4, patient: 1.3 } },
  { category: 'media',      title: 'Journalist',                scheduleTemplate: 'irregular', incomeBand: 'mid', hours: 'flexible', workMode: 'hybrid', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'scroll_phone'], styleLean: ["neutral","plain"], foodLean: ["rice","pasta"], sleepRhythm: 'erratic', spendingLean: 'neutral',
    affinity: { temperament: { openness: 0.45, assertiveness: 0.35, warmth: -0.1 } }, traitAffinity: { curious: 1.7, cynical: 1.4, blunt: 1.3 } },
  { category: 'health',     title: 'Therapist',                 scheduleTemplate: 'day_shift', incomeBand: 'mid',  hours: '9-17', workMode: 'hybrid', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'watch_tv'], styleLean: ["knit","soft"], foodLean: ["vegetables","rice"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { temperament: { warmth: 0.5, selfAwareness: 0.55, volatility: -0.25 } }, traitAffinity: { patient: 1.6, nurturing: 1.4, diplomatic: 1.4 } },
  { category: 'science',    title: 'Data Scientist',            scheduleTemplate: 'day_shift', incomeBand: 'high', hours: '9-17', workMode: 'hybrid', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'scroll_phone'], styleLean: ["plain","minimal"], foodLean: ["rice","pasta"], sleepRhythm: 'late', spendingLean: 'neutral',
    affinity: { temperament: { conscientiousness: 0.4, openness: 0.4, warmth: -0.1 } }, traitAffinity: { curious: 1.6, methodical: 1.5, understated: 1.3 } },
  { category: 'arts',       title: 'Art Director',              scheduleTemplate: 'day_shift', incomeBand: 'mid',  hours: '10-18', workMode: 'hybrid', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'watch_tv'], styleLean: ["minimal","bold"], foodLean: ["rice","vegetables"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { temperament: { openness: 0.5, assertiveness: 0.3 } }, traitAffinity: { creative: 1.7, perfectionist: 1.4, dramatic: 1.3 } },
  { category: 'education',  title: 'Grad Student',              scheduleTemplate: 'irregular', incomeBand: 'low', hours: 'flexible', workMode: 'hybrid', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'scroll_phone'], styleLean: ["studious","plain"], foodLean: ["pasta","starches"], sleepRhythm: 'erratic', spendingLean: 'frugal',
    affinity: { temperament: { openness: 0.45, conscientiousness: 0.2, volatility: 0.15 } }, traitAffinity: { curious: 1.6, anxious: 1.4, idealistic: 1.3 } },

  // --- REMOTE -------------------------------------------------------------
  // Never leave. These are the roommates who are simply THERE all day, which
  // is the largest single behavioural change this plan makes to the flat.
  { category: 'tech',       title: 'Backend Engineer',          scheduleTemplate: 'day_shift', incomeBand: 'high', hours: '10-18', workMode: 'remote', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'scroll_phone'], styleLean: ["plain","minimal"], foodLean: ["rice","pasta"], sleepRhythm: 'late', spendingLean: 'neutral',
    affinity: { temperament: { conscientiousness: 0.35, openness: 0.25, warmth: -0.25, assertiveness: -0.2 } }, traitAffinity: { independent: 1.6, guarded: 1.4, methodical: 1.4 } },
  { category: 'tech',       title: 'Cybersecurity Analyst',     scheduleTemplate: 'day_shift', incomeBand: 'high', hours: '9-17', workMode: 'remote', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'watch_tv'], styleLean: ["plain","edgy"], foodLean: ["beef","rice"], sleepRhythm: 'erratic', spendingLean: 'neutral',
    affinity: { temperament: { conscientiousness: 0.45, warmth: -0.3, openness: 0.2 } }, traitAffinity: { secretive: 1.7, guarded: 1.6, cautious: 1.4 } },
  { category: 'media',      title: 'Technical Writer',          scheduleTemplate: 'day_shift', incomeBand: 'mid',  hours: '9-17', workMode: 'remote', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'watch_tv'], styleLean: ["soft","neutral"], foodLean: ["bread","cheese"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { temperament: { conscientiousness: 0.5, assertiveness: -0.25 } }, traitAffinity: { meticulous: 1.6, understated: 1.5, patient: 1.3 } },
  { category: 'service',    title: 'Customer Support Rep',      scheduleTemplate: 'day_shift', incomeBand: 'low',  hours: '9-17', workMode: 'remote', incomeSource: 'wage', workRoom: ['bedroom', 'study'], idlePastimes: ['watch_tv', 'scroll_phone'], styleLean: ["casual","plain"], foodLean: ["eggs","bread"], sleepRhythm: 'regular', spendingLean: 'frugal',
    affinity: { temperament: { warmth: 0.35, volatility: -0.3 } }, traitAffinity: { patient: 1.7, 'thick-skinned': 1.4, easygoing: 1.3 } },
  { category: 'finance',    title: 'Bookkeeper',                scheduleTemplate: 'day_shift', incomeBand: 'mid',  hours: '9-16', workMode: 'remote', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'watch_tv'], styleLean: ["neutral","plain"], foodLean: ["potatoes","bread"], sleepRhythm: 'regular', spendingLean: 'frugal',
    affinity: { temperament: { conscientiousness: 0.6, openness: -0.15 } }, traitAffinity: { meticulous: 1.7, methodical: 1.5, reliable: 1.4 } },
  { category: 'education',  title: 'Online Tutor',              scheduleTemplate: 'evening_shift', incomeBand: 'low', hours: '15-22', workMode: 'remote', incomeSource: 'wage', workRoom: ['bedroom', 'study'], idlePastimes: ['read_book', 'watch_tv'], styleLean: ["casual","soft"], foodLean: ["eggs","rice"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { temperament: { warmth: 0.45, conscientiousness: 0.25 } }, traitAffinity: { patient: 1.6, nurturing: 1.5, generous: 1.3 } },
  { category: 'health',     title: 'Telehealth Counsellor',     scheduleTemplate: 'day_shift', incomeBand: 'mid',  hours: '9-17', workMode: 'remote', incomeSource: 'wage', workRoom: ['bedroom', 'study'], idlePastimes: ['read_book', 'watch_tv'], styleLean: ["soft","cozy"], foodLean: ["vegetables","rice"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { temperament: { warmth: 0.5, selfAwareness: 0.45 } }, traitAffinity: { nurturing: 1.6, patient: 1.5, sensitive: 1.3 } },
  { category: 'legal',      title: 'Contract Reviewer',         scheduleTemplate: 'day_shift', incomeBand: 'mid',  hours: '9-17', workMode: 'remote', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'watch_tv'], styleLean: ["neutral","collared"], foodLean: ["cheese","potatoes"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { temperament: { conscientiousness: 0.55, warmth: -0.2 } }, traitAffinity: { meticulous: 1.7, cautious: 1.5, guarded: 1.3 } },
  { category: 'arts',       title: 'UX Designer',               scheduleTemplate: 'day_shift', incomeBand: 'mid',  hours: '10-18', workMode: 'remote', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['scroll_phone', 'read_book'], styleLean: ["minimal","bold"], foodLean: ["rice","vegetables"], sleepRhythm: 'late', spendingLean: 'neutral',
    affinity: { temperament: { openness: 0.45, conscientiousness: 0.25 } }, traitAffinity: { creative: 1.6, curious: 1.4, perfectionist: 1.3 } },
  { category: 'science',    title: 'Research Assistant',        scheduleTemplate: 'day_shift', incomeBand: 'low',  hours: '9-17', workMode: 'remote', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'scroll_phone'], styleLean: ["studious","plain"], foodLean: ["rice","pasta"], sleepRhythm: 'early', spendingLean: 'frugal',
    affinity: { temperament: { openness: 0.4, conscientiousness: 0.3, assertiveness: -0.2 } }, traitAffinity: { curious: 1.6, anxious: 1.3, methodical: 1.3 } },
  { category: 'media',      title: 'Copy Editor',               scheduleTemplate: 'irregular', incomeBand: 'mid', hours: 'flexible', workMode: 'remote', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'watch_tv'], styleLean: ["soft","neutral"], foodLean: ["pasta","potatoes"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { temperament: { conscientiousness: 0.5, openness: 0.25, assertiveness: -0.2 } }, traitAffinity: { meticulous: 1.7, perfectionist: 1.5, understated: 1.3 } },
  { category: 'wellness',   title: 'Translator',                scheduleTemplate: 'irregular', incomeBand: 'mid', hours: 'flexible', workMode: 'remote', incomeSource: 'wage', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'watch_tv'], styleLean: ["minimal","soft"], foodLean: ["rice","vegetables"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { temperament: { openness: 0.45, conscientiousness: 0.35, assertiveness: -0.15 } }, traitAffinity: { meticulous: 1.5, curious: 1.4, independent: 1.3 } },

  // --- SELF EMPLOYED ------------------------------------------------------
  // Mostly home, some days out on a shoot or at a client (D2's gig days).
  // Their hours are their own, which makes them the least predictable
  // presence in the flat.
  { category: 'arts',       title: 'Freelance Illustrator',     scheduleTemplate: 'irregular', incomeBand: 'low', hours: 'flexible', workMode: 'self_employed', incomeSource: 'self', workRoom: ['study', 'bedroom'], idlePastimes: ['read_book', 'scroll_phone'], styleLean: ["edgy","bold"], foodLean: ["rice","pasta"], sleepRhythm: 'erratic', spendingLean: 'free_spender',
    affinity: { temperament: { openness: 0.55, conscientiousness: -0.15 } }, traitAffinity: { creative: 1.8, independent: 1.4, restless: 1.3 } },
  { category: 'arts',       title: 'Freelance Designer',        scheduleTemplate: 'irregular', incomeBand: 'mid', hours: 'flexible', workMode: 'self_employed', incomeSource: 'self', workRoom: ['study', 'bedroom'], idlePastimes: ['scroll_phone', 'read_book'], styleLean: ["minimal","bold"], foodLean: ["rice","pasta"], sleepRhythm: 'erratic', spendingLean: 'free_spender',
    affinity: { temperament: { openness: 0.5, assertiveness: 0.2 } }, traitAffinity: { creative: 1.7, independent: 1.4, perfectionist: 1.3 } },
  { category: 'media',      title: 'Podcaster',                 scheduleTemplate: 'irregular', incomeBand: 'low', hours: 'flexible', workMode: 'self_employed', incomeSource: 'self', workRoom: ['bedroom', 'study'], idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["casual","plain"], foodLean: ["pasta","bread"], sleepRhythm: 'late', spendingLean: 'neutral',
    affinity: { temperament: { openness: 0.45, assertiveness: 0.35, warmth: 0.2 } }, traitAffinity: { expressive: 1.7, curious: 1.4, dramatic: 1.3 } },
  { category: 'media',      title: 'Streamer',                  scheduleTemplate: 'evening_shift', incomeBand: 'low', hours: 'flexible', workMode: 'self_employed', incomeSource: 'self', workRoom: ['bedroom'], idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["street","bold"], foodLean: ["starches","pasta"], sleepRhythm: 'late', spendingLean: 'free_spender',
    affinity: { temperament: { openness: 0.45, assertiveness: 0.35, volatility: 0.25 } }, traitAffinity: { expressive: 1.7, playful: 1.5, restless: 1.3 } },
  { category: 'music',      title: 'Musician',                  scheduleTemplate: 'evening_shift', incomeBand: 'low', hours: 'flexible', workMode: 'self_employed', incomeSource: 'self', workRoom: ['bedroom'], idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["edgy","street"], foodLean: ["starches","rice"], sleepRhythm: 'erratic', spendingLean: 'free_spender',
    affinity: { temperament: { openness: 0.55, conscientiousness: -0.3, volatility: 0.2 } }, traitAffinity: { creative: 1.7, dramatic: 1.4, chaotic: 1.3 } },
  { category: 'music',      title: 'Music Producer',            scheduleTemplate: 'irregular', incomeBand: 'mid', hours: 'flexible', workMode: 'self_employed', incomeSource: 'self', workRoom: ['bedroom', 'study'], idlePastimes: ['scroll_phone', 'read_book'], styleLean: ["edgy","street"], foodLean: ["rice","starches"], sleepRhythm: 'erratic', spendingLean: 'free_spender',
    affinity: { temperament: { openness: 0.5, conscientiousness: 0.2 } }, traitAffinity: { creative: 1.6, perfectionist: 1.4, intense: 1.3 } },
  { category: 'fitness',    title: 'Yoga Instructor',           scheduleTemplate: 'morning_shift', incomeBand: 'low', hours: '6-13', workMode: 'self_employed', incomeSource: 'self', workRoom: ['gym', 'bedroom'], idlePastimes: ['read_book', 'scroll_phone'], styleLean: ["sporty","soft"], foodLean: ["rice","vegetables"], sleepRhythm: 'early', spendingLean: 'neutral',
    affinity: { temperament: { warmth: 0.45, selfAwareness: 0.45, volatility: -0.3 } }, traitAffinity: { spiritual: 1.7, patient: 1.5, easygoing: 1.4 } },
  { category: 'service',    title: 'Photographer',              scheduleTemplate: 'irregular', incomeBand: 'mid', hours: 'flexible', workMode: 'self_employed', incomeSource: 'self', workRoom: ['study', 'bedroom'], idlePastimes: ['scroll_phone', 'read_book'], styleLean: ["edgy","minimal"], foodLean: ["rice","vegetables"], sleepRhythm: 'erratic', spendingLean: 'neutral',
    affinity: { temperament: { openness: 0.5, warmth: 0.15 } }, traitAffinity: { creative: 1.6, curious: 1.4, patient: 1.3 } },
  { category: 'hospitality', title: 'Small Business Owner',     scheduleTemplate: 'day_shift', incomeBand: 'mid', hours: 'flexible', workMode: 'self_employed', incomeSource: 'self', workRoom: ['study', 'bedroom'], idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["collared","neutral"], foodLean: ["beef","potatoes"], sleepRhythm: 'early', spendingLean: 'neutral',
    affinity: { temperament: { assertiveness: 0.5, conscientiousness: 0.35 } }, traitAffinity: { ambitious: 1.7, stubborn: 1.4, practical: 1.3 } },
  { category: 'wellness',   title: 'Massage Therapist',         scheduleTemplate: 'day_shift', incomeBand: 'mid', hours: 'flexible', workMode: 'self_employed', incomeSource: 'self', workRoom: ['bedroom'], idlePastimes: ['read_book', 'watch_tv'], styleLean: ["soft","cozy"], foodLean: ["rice","vegetables"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { temperament: { warmth: 0.5, selfAwareness: 0.35, volatility: -0.25 } }, traitAffinity: { nurturing: 1.6, patient: 1.5, sensual: 1.3 } },

  // --- ADULT (one category, several titles — D10) -------------------------
  // `contentWork: true` (D16) marks the titles whose work is FILMED, AT HOME
  // — the ones the Phase 5 content drives fire for. It resolves the plan's
  // parked question in favour of a flag rather than `category === 'adult'`,
  // because the two are not the same set: an Exotic Dancer works a club, an
  // Escort works elsewhere, and a boutique owner works a shop. All three are
  // adult-industry and none of them films in the flat. A flag also leaves the
  // door open for a non-adult streamer later without widening a category
  // check into something it never meant.
  // Splitting these across adult_cam / adult_performance / adult_service
  // would eat three slots of the cast's category-uniqueness budget AND let
  // one draw lock out the others. One category, several titles, each with
  // its own floor.
  //
  // `disinhibitionFloor` is the D9 hard gate and the reason this block reads
  // the way it does: npcDisinhibition is a [0,1] derived from volatility,
  // openness and assertiveness, and below the floor these entries score
  // weight ZERO. A guarded, modest, rule-bound character cannot be handed
  // this work by an unlucky roll — which was the whole point of coupling
  // occupation to personality in the first place.
  { category: 'adult',      title: 'Cam Model',                 scheduleTemplate: 'irregular', incomeBand: 'mid', hours: 'flexible', workMode: 'self_employed', incomeSource: 'self', workRoom: ['bedroom'], contentWork: true, idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["evening","bold"], foodLean: ["starches","rice"], sleepRhythm: 'late', spendingLean: 'free_spender',
    affinity: { disinhibitionFloor: 0.62, temperament: { openness: 0.5, assertiveness: 0.4, warmth: 0.2 } },
    traitAffinity: { brazen: 3.2, teasing: 3.0, magnetic: 2.6, flirtatious: 2.6, sensual: 2.2, confident: 2.0, guarded: 0.2, conformist: 0.2, insecure: 0.4 } },
  { category: 'adult',      title: 'Adult Film Performer',      scheduleTemplate: 'irregular', incomeBand: 'mid', hours: 'flexible', workMode: 'self_employed', incomeSource: 'self', workRoom: ['bedroom'], contentWork: true, idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["bold","edgy"], foodLean: ["starches","beef"], sleepRhythm: 'erratic', spendingLean: 'free_spender',
    affinity: { disinhibitionFloor: 0.68, temperament: { openness: 0.55, assertiveness: 0.45, volatility: 0.2 } },
    traitAffinity: { brazen: 3.2, daring: 3.0, forward: 2.8, sensual: 2.4, confident: 2.2, magnetic: 2.0, guarded: 0.2, cautious: 0.25 } },
  { category: 'adult',      title: 'Exotic Dancer',             scheduleTemplate: 'night_shift', incomeBand: 'mid', hours: '20-04', workMode: 'on_site', incomeSource: 'wage', idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["bold","evening"], foodLean: ["lettuce","vegetables"], sleepRhythm: 'late', spendingLean: 'free_spender',
    affinity: { disinhibitionFloor: 0.60, temperament: { openness: 0.4, assertiveness: 0.45, warmth: 0.15 } },
    traitAffinity: { magnetic: 3.0, brazen: 2.8, confident: 2.4, teasing: 2.4, sensual: 2.0, 'thick-skinned': 1.6, guarded: 0.25 } },
  { category: 'adult',      title: 'Escort',                    scheduleTemplate: 'evening_shift', incomeBand: 'high', hours: 'flexible', workMode: 'self_employed', incomeSource: 'self', idlePastimes: ['scroll_phone', 'read_book'], styleLean: ["elegant","bold"], foodLean: ["lettuce","rice"], sleepRhythm: 'late', spendingLean: 'free_spender',
    affinity: { disinhibitionFloor: 0.66, temperament: { assertiveness: 0.45, selfAwareness: 0.35, openness: 0.35 } },
    traitAffinity: { magnetic: 3.0, forward: 2.8, sensual: 2.2, secretive: 2.0, confident: 2.0, diplomatic: 1.4, insecure: 0.3 } },
  { category: 'adult',      title: 'Premium Content Creator',   scheduleTemplate: 'irregular', incomeBand: 'mid', hours: 'flexible', workMode: 'self_employed', incomeSource: 'self', workRoom: ['bedroom'], contentWork: true, idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["evening","bold"], foodLean: ["starches","rice"], sleepRhythm: 'erratic', spendingLean: 'free_spender',
    affinity: { disinhibitionFloor: 0.58, temperament: { openness: 0.45, assertiveness: 0.3 } },
    traitAffinity: { teasing: 3.0, flirtatious: 2.8, sensual: 2.4, expressive: 2.0, playful: 1.8, guarded: 0.25 } },
  { category: 'adult',      title: 'Adult Boutique Owner',      scheduleTemplate: 'day_shift', incomeBand: 'mid', hours: '11-19', workMode: 'on_site', incomeSource: 'self', idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["bold","edgy"], foodLean: ["starches","pasta"], sleepRhythm: 'regular', spendingLean: 'neutral',
    affinity: { disinhibitionFloor: 0.52, temperament: { openness: 0.45, assertiveness: 0.3, warmth: 0.25 } },
    traitAffinity: { brazen: 2.2, playful: 1.9, blunt: 1.7, confident: 1.7, sensual: 1.6, practical: 1.3 } },

  // --- NO JOB (D3/D20/D21) -------------------------------------------------
  // Not an absent occupation — a workMode. The record stays fully populated
  // so every existing consumer (persona prompt, browse filter, the cast's
  // category-uniqueness rule) keeps working with no null handling.
  //
  // All five use `standard`, which already has NO work block, so nothing
  // opens a shift and the whole day is available to the drive scorer. That
  // makes an unemployed roommate the MOST present person in the flat, which
  // is the interesting half of the idea.
  //
  // `incomeSource` is what separates them: `means` has money arriving without
  // work, `none` is running out. Same empty calendar, completely different
  // person, and the persona block says which (Phase 4).
  { category: 'none',       title: 'Family Money',              scheduleTemplate: 'standard', incomeBand: 'high', hours: 'none', workMode: 'none', incomeSource: 'means', idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["elegant","classic"], foodLean: ["starches","beef"], sleepRhythm: 'late', spendingLean: 'free_spender',
    affinity: { temperament: { conscientiousness: -0.3, openness: 0.25, assertiveness: 0.2 } }, traitAffinity: { lazy: 1.6, materialistic: 1.5, easygoing: 1.4, 'passive-aggressive': 1.2 } },
  { category: 'none',       title: 'Living Off The Settlement', scheduleTemplate: 'standard', incomeBand: 'mid', hours: 'none', workMode: 'none', incomeSource: 'means', idlePastimes: ['watch_tv', 'scroll_phone'], styleLean: ["plain","neutral"], foodLean: ["starches","pasta"], sleepRhythm: 'erratic', spendingLean: 'frugal',
    affinity: { temperament: { volatility: 0.3, selfAwareness: 0.2, warmth: -0.15 } }, traitAffinity: { guarded: 1.6, cynical: 1.5, vulnerable: 1.4, restless: 1.3 } },
  { category: 'none',       title: 'Taking A Year',             scheduleTemplate: 'standard', incomeBand: 'mid', hours: 'none', workMode: 'none', incomeSource: 'means', idlePastimes: ['read_book', 'scroll_phone'], styleLean: ["soft","plain"], foodLean: ["starches","rice"], sleepRhythm: 'late', spendingLean: 'free_spender',
    affinity: { temperament: { openness: 0.5, selfAwareness: 0.35, conscientiousness: -0.2 } }, traitAffinity: { adventurous: 1.7, spiritual: 1.5, curious: 1.4, restless: 1.3 } },
  { category: 'none',       title: 'Recently Laid Off',         scheduleTemplate: 'standard', incomeBand: 'low', hours: 'none', workMode: 'none', incomeSource: 'none', idlePastimes: ['scroll_phone', 'watch_tv'], styleLean: ["plain","cozy"], foodLean: ["pasta","starches"], sleepRhythm: 'erratic', spendingLean: 'frugal',
    affinity: { temperament: { volatility: 0.35, selfAwareness: -0.15, assertiveness: -0.2 } }, traitAffinity: { anxious: 1.7, insecure: 1.5, restless: 1.4, cynical: 1.3 } },
  { category: 'none',       title: 'Between Things',            scheduleTemplate: 'standard', incomeBand: 'low', hours: 'none', workMode: 'none', incomeSource: 'none', idlePastimes: ['watch_tv', 'scroll_phone'], styleLean: ["plain","cozy"], foodLean: ["starches","bread"], sleepRhythm: 'erratic', spendingLean: 'frugal',
    affinity: { temperament: { conscientiousness: -0.35, volatility: 0.2 } }, traitAffinity: { lazy: 1.6, easygoing: 1.4, chaotic: 1.3, restless: 1.3 } },
];

// --- Schedule templates: [weekday/weekend] → tick → activity weight table ---
const SCHEDULES = {
  day_shift: {
    weekday: {  // 0-47 (30-min ticks)
      sleep:    [[0, 15, 1.0]],
      morning:  [[16, 18, 0.8], [18, 19, 0.5]],
      commute:  [[19, 20, 1.0]],
      work:     [[20, 34, 1.0]],
      commute_home: [[34, 35, 1.0]],
      evening:  [[36, 42, 0.6]],
      wind_down:[[42, 47, 0.8]],
    },
    weekend: {
      sleep:    [[0, 18, 0.9]],
      leisure:  [[18, 36, 0.7]],
      evening:  [[36, 47, 0.6]],
    }
  },
  morning_shift: {
    weekday: {
      sleep:    [[0, 10, 1.0]],
      prep:     [[10, 12, 0.8]],
      commute:  [[12, 13, 1.0]],
      work:     [[13, 28, 1.0]],
      commute_home: [[28, 29, 1.0]],
      evening:  [[30, 42, 0.6]],
      wind_down:[[42, 47, 0.8]],
    },
    weekend: {
      sleep:    [[0, 16, 0.9]],
      leisure:  [[16, 36, 0.7]],
      evening:  [[36, 47, 0.6]],
    }
  },
  evening_shift: {
    weekday: {
      sleep:    [[0, 16, 1.0]],
      leisure:  [[16, 31, 0.6]],
      prep:     [[31, 32, 0.8]],
      commute:  [[32, 33, 1.0]],
      work:     [[33, 45, 1.0]],
      commute_home: [[45, 46, 1.0]],
      wind_down:[[46, 47, 0.7]],
    },
    weekend: {
      sleep:    [[0, 20, 0.9]],
      leisure:  [[20, 40, 0.7]],
      evening:  [[40, 47, 0.6]],
    }
  },
  night_shift: {
    weekday: {
      work:     [[0, 14, 1.0]],
      commute_home: [[14, 15, 1.0]],
      sleep:    [[15, 38, 1.0]],
      evening:  [[38, 47, 0.6]],
    },
    weekend: {
      sleep:    [[0, 20, 0.9]],
      leisure:  [[20, 40, 0.7]],
      evening:  [[40, 47, 0.6]],
    }
  },
  irregular: {
    weekday: {
      sleep:    [[0, 14, 0.7]],
      work:     [[14, 30, 0.5]],
      leisure:  [[30, 42, 0.6]],
      wind_down:[[42, 47, 0.7]],
    },
    weekend: {
      sleep:    [[0, 16, 0.8]],
      leisure:  [[16, 36, 0.7]],
      evening:  [[36, 47, 0.6]],
    }
  },
  standard: {
    weekday: {
      sleep:    [[0, 15, 1.0]],
      morning:  [[16, 20, 0.6]],
      midday:   [[20, 32, 0.5]],
      evening:  [[32, 42, 0.6]],
      wind_down:[[42, 47, 0.8]],
    },
    weekend: {
      sleep:    [[0, 18, 0.9]],
      leisure:  [[18, 36, 0.7]],
      evening:  [[36, 47, 0.6]],
    }
  },
};

// --- Sleep-rhythm tuning (vocation plan's captured Dimension 3). The unit is
// sim ticks (30 min). Early/late shift the END of this NPC's template sleep
// window; erratic jitters it per day. The block name stays `sleep` (D1) — the
// NPC just occupies it for a different span, and the whole adjustment lives on the
// game's own clock, never the player's alarm system (that path is off-limits).
const SLEEP_RHYTHM = {
  earlyTicks: 2,      // 'early' wakes this many ticks before the template wake
  lateTicks: 2,       // 'late' sleeps this many ticks past the template wake
  erraticTicks: 2,    // 'erratic' jitters the wake boundary ±this many ticks/day
};

// --- Block time-of-day windows (continuous-behavior-engine Phase 3, D4) ---
// The canonical minutes-from-midnight ranges each schedule block occupies —
// the table the routine weight curve (COGNITION's driveTimeOfDayWeight) keys
// on. A drive's former `blockFilter` block names translate, per name, into
// real time ranges, so "morning" can score in-band at 09:00 and a soft
// penalty at 14:00 with no hard boundary anyone can catch fraying (D4).
//
// Authored rather than derived from SCHEDULES: the templates are shift-
// specific, and the union of every template's sleep window is most of the
// day, which is not a routine anyone would recognise. These are the
// canonical windows — when a block *feels like* it happens for a normal
// (day-shift / standard) schedule. The routine weight is about time of day,
// not about any one NPC's template: a night-shift worker's sleep still
// happens during the day, but the question "does 22:00 feel like wind-down"
// has one answer for everyone. Phase 6 owns the curve's shape; this table
// is the shape's data, and every name below appears as a schedule block
// somewhere in SCHEDULES (verify harnesses assert the union of block names
// used by drives stays inside it).
const BLOCK_TIME_OF_DAY = {
  sleep:        [[0, 420], [1260, 1440]],     // 00:00–07:00, 21:00–24:00
  morning:      [[300, 600]],                 // 05:00–10:00
  prep:         [[300, 480], [900, 1020]],    // 05:00–08:00, 15:00–17:00
  commute:      [[360, 600]],                 // 06:00–10:00
  work:         [[480, 1080]],                // 08:00–18:00
  commute_home: [[1020, 1140]],               // 17:00–19:00
  midday:       [[600, 960]],                 // 10:00–16:00
  evening:      [[960, 1320]],                // 16:00–22:00
  leisure:      [[360, 1080]],                // 06:00–18:00
  wind_down:    [[1200, 1440]],               // 20:00–24:00
  meal:         [[720, 900], [1080, 1260]],   // 12:00–15:00, 18:00–21:00
};

// --- Activity tables per schedule-block ---
const ACTIVITY_TABLES = {
  sleep:    ['sleeping'],
  morning:  ['making coffee', 'checking phone', 'eating cereal', 'doing yoga', 'reading news'],
  midday:   ['watching TV', 'reading', 'browsing laptop', 'snacking', 'on a phone call', 'exercising'],
  evening:  ['cooking', 'watching a show', 'playing games', 'drinking beer', 'listening to music', 'on a video call'],
  leisure:  ['reading', 'painting', 'playing guitar', 'scrolling social media', 'exercising', 'texting', 'crafting', 'gaming', 'working out', 'doing laundry', 'studying', 'swimming laps'],
  wind_down:['reading in bed', 'skincare routine', 'journaling', 'stretching', 'stepping outside'],
  work:     ['at work'],
  commute:  ['commuting'],
  commute_home: ['commuting home'],
  prep:     ['getting ready'],
  morning_shift: ['getting ready for work'],
};

// --- At-home work activities (vocation-and-lifestyle plan D5, Phase 3) -----
// ACTIVITY_TABLES.work is the single string 'at work', which is correct for
// someone who is GONE and says nothing about someone sitting at a desk in the
// next room. These are what a work block looks like when the worker never
// left: keyed by occupation category, overridable per occupation via
// `workActivities`.
//
// Every string here needs a PEEK_VIEW_ACT row too — a phrase the peek
// pipeline cannot name falls through to `_default` ("just in there"), which
// is how a whole new class of visible behaviour arrives invisible.
const HOME_WORK_ACTIVITIES = {
  tech:      ['on a video call', 'debugging something', 'in a standup', 'staring at a terminal', 'reviewing code'],
  arts:      ['sketching', 'on a video call', 'editing a draft', 'colour-matching something', 'at the drawing tablet'],
  media:     ['recording a take', 'editing audio', 'on a call with a source', 'writing up notes', 'chasing a quote'],
  finance:   ['on a video call', 'buried in a spreadsheet', 'reconciling something', 'on a client call'],
  education: ['marking papers', 'on a video call', 'reading a paper', 'writing lecture notes', 'buried in a chapter'],
  science:   ['reading a paper', 'crunching numbers', 'on a video call', 'writing up results'],
  legal:     ['reading a filing', 'drafting something', 'on a client call', 'buried in a contract'],
  health:    ['on a video call', 'writing up notes', 'on a client call'],
  service:   ['on a video call', 'answering emails', 'on the phone with a supplier'],
  music:     ['mixing a track', 'laying down a take', 'on headphones at the desk', 'writing something'],
  adult:     ['on a call', 'editing something', 'answering messages', 'planning a shoot'],
  _default:  ['on a video call', 'answering emails', 'at the laptop', 'on a call', 'working'],
};

// Map activity strings to preferred rooms. When an NPC's activity matches
// a key here, resolveRoomForActivity routes them to the preferred room
// instead of a random common room. Multiple activities can share a room.
const ACTIVITY_ROOM_PREFERENCES = {
  'exercising': 'gym',
  'swimming laps': 'pool_room',
  'working out': 'gym',
  'gaming': 'game_room',
  'playing games': 'game_room',
  'doing laundry': 'laundry',
  'studying': 'study',
  'reading': ['study', 'living_room', 'balcony'],
  'stepping outside': 'balcony',
  'cooking': 'kitchen',
  'making coffee': 'kitchen',
  'eating cereal': ['kitchen', 'dining'],
  'snacking': ['kitchen', 'dining'],
  'watching TV': 'living_room',
  'watching a show': 'living_room',
  'drinking beer': ['living_room', 'balcony'],
  'doing yoga': 'gym',
  'painting': ['living_room', 'study'],
  'playing guitar': ['living_room'],
  'crafting': 'living_room',
  'skincare routine': ['bathroom_a', 'bathroom_b'],
  'journaling': 'study',
  'stretching': 'gym',
  'browsing laptop': ['living_room', 'study'],
  'on a phone call': ['balcony', 'entry', 'hallway_a'],
  'on a video call': ['living_room', 'study'],
  'scrolling social media': ['living_room'],
  'texting': ['living_room', 'balcony'],
  'reading news': ['kitchen', 'living_room'],
  'reading in bed': null, // null = stay in bedroom
};

// --- Off-screen event tables (deterministic, no LLM) ---
const OFFSCREEN_EVENTS = [
  { type: 'cooking', weight: 4, text: '{name} cooked {dish} and left leftovers.', moodDelta: 0.05, dataFields: ['dish'] },
  { type: 'breakage', weight: 1, text: '{name} broke a {item} in the kitchen.', moodDelta: -0.1, dataFields: ['item'] },
  { type: 'bad_day', weight: 2, text: '{name} had a rough day at work.', moodDelta: -0.15, dataFields: [] },
  { type: 'guest', weight: 1, text: '{name} brought {guest} home.', moodDelta: 0.1, dataFields: ['guest'] },
  { type: 'argument', weight: 2, text: '{name} and {other} argued about {topic}.', moodDelta: -0.2, dataFields: ['other', 'topic'] },
  { type: 'repair', weight: 1, text: '{name} fixed the {item}.', moodDelta: 0.08, dataFields: ['item'] },
  { type: 'shopping', weight: 2, text: '{name} went grocery shopping.', moodDelta: 0.05, dataFields: [] },
  { type: 'good_news', weight: 2, text: '{name} got good news: {detail}.', moodDelta: 0.15, dataFields: ['detail'] },
  { type: 'cleaning', weight: 3, text: '{name} cleaned the {room}.', moodDelta: 0.05, dataFields: ['room'] },
  { type: 'sick', weight: 1, text: '{name} is coming down with something.', moodDelta: -0.1, dataFields: [] },
  // --- New events (P8) ---
  { type: 'date', weight: 1, text: '{name} went on a {date_desc} date.', moodDelta: 0.12, dataFields: ['date_desc'] },
  { type: 'hobby', weight: 2, text: '{name} spent time on their {hobby}.', moodDelta: 0.06, dataFields: ['hobby'] },
  { type: 'nap', weight: 2, text: '{name} took a long nap on the couch.', moodDelta: 0.04, dataFields: [] },
  { type: 'phone_call', weight: 2, text: '{name} had a long phone call with {caller}.', moodDelta: 0.03, dataFields: ['caller'] },
  { type: 'laundry', weight: 1, text: '{name} did a load of laundry.', moodDelta: 0.02, dataFields: [] },
  { type: 'burnt_food', weight: 1, text: '{name} burnt something in the kitchen — the smoke alarm went off.', moodDelta: -0.05, dataFields: [] },
  { type: 'package', weight: 1, text: '{name} got a package delivered.', moodDelta: 0.05, dataFields: [] },
  { type: 'late_night_snack', weight: 2, text: '{name} had a late-night snack raid on the fridge.', moodDelta: 0.02, dataFields: [] },
  // Intimacy & Voyeurism Phase 18 (D16): the baby-presence schedule note.
  // Drawn ONLY for a resident parent (drawOffscreenEvent appends it to the
  // pool when npc.flags._baby is set) — the parent stays home with the new
  // addition instead of living their old evening. `baby` gets its own
  // EVENT_EMOTION/EVENT_IMPORTANCE rows above.
  { type: 'baby', weight: 3, text: '{name} stayed in with the baby all evening — tiny socks everywhere, half-eaten meals, zero complaints.', moodDelta: 0.08, dataFields: [] },
];

const EVENT_FILL_DATA = {
  dish: ['pasta', 'stir-fry', 'soup', 'curry', 'tacos', 'salad', 'ramen'],
  item: ['mug', 'plate', 'lamp', 'mirror', 'vase', 'shelf'],
  guest: ['a friend', 'a date', 'a coworker', 'their sibling', 'a neighbor'],
  topic: ['chores', 'noise', 'bathroom time', 'groceries', 'rent', 'a mess', 'the thermostat'],
  room: ['kitchen', 'living room', 'bathroom', 'hallway', 'dining room', 'game room', 'gym', 'study', 'balcony', 'laundry room'],
  detail: ['a promotion opportunity', 'a new gig', 'a raise', 'an acceptance letter', 'a call back'],
  date_desc: ['great', 'terrible', 'awkward', 'surprisingly good', 'brief but sweet'],
  hobby: ['painting', 'guitar practice', 'writing', 'gaming', 'yoga', 'photography', 'knitting'],
  caller: ['their mom', 'an old friend', 'their boss', 'a sibling', 'someone from a dating app'],
};

// --- Interest pool (tagged) ---
const INTEREST_POOL = [
  { name: 'gaming',          tags: ['tech', 'indoor', 'sedentary'] },
  { name: 'cooking',         tags: ['domestic', 'creative', 'indoor'] },
  { name: 'music',           tags: ['creative', 'indoor', 'social'] },
  { name: 'fitness',         tags: ['active', 'outdoor', 'health'] },
  { name: 'reading',         tags: ['intellectual', 'indoor', 'sedentary'] },
  { name: 'art',             tags: ['creative', 'indoor', 'solitary'] },
  { name: 'politics',        tags: ['intellectual', 'social', 'argumentative'] },
  { name: 'film',            tags: ['media', 'indoor', 'sedentary'] },
  { name: 'gardening',       tags: ['domestic', 'outdoor', 'calm'] },
  { name: 'hiking',          tags: ['active', 'outdoor', 'health'] },
  { name: 'writing',         tags: ['creative', 'solitary', 'intellectual'] },
  { name: 'yoga',            tags: ['health', 'calm', 'indoor'] },
  { name: 'partying',        tags: ['social', 'nightlife', 'extrovert'] },
  { name: 'coding',         tags: ['tech', 'intellectual', 'indoor'] },
  { name: 'fashion',         tags: ['creative', 'social', 'indoor'] },
  { name: 'astrology',       tags: ['mystical', 'social', 'indoor'] },
  { name: 'photography',     tags: ['creative', 'outdoor', 'solitary'] },
  { name: 'comedy',          tags: ['social', 'creative', 'extrovert'] },
  { name: 'volunteering',    tags: ['social', 'altruistic', 'outdoor'] },
  { name: 'true crime',      tags: ['media', 'intellectual', 'indoor'] },
  { name: 'crafting',        tags: ['domestic', 'creative', 'indoor'] },
  { name: 'travel',          tags: ['outdoor', 'social', 'adventurous'] },
];

// --- Values pool (with opposition pairs) ---
const VALUES_POOL = [
  { name: 'honesty',         opposition: 'harmony' },
  { name: 'harmony',         opposition: 'honesty' },
  { name: 'independence',    opposition: 'connection' },
  { name: 'connection',     opposition: 'independence' },
  { name: 'ambition',       opposition: 'contentment' },
  { name: 'contentment',     opposition: 'ambition' },
  { name: 'order',           opposition: 'spontaneity' },
  { name: 'spontaneity',     opposition: 'order' },
  { name: 'loyalty',         opposition: 'freedom' },
  { name: 'freedom',         opposition: 'loyalty' },
  { name: 'tradition',       opposition: 'progress' },
  { name: 'progress',        opposition: 'tradition' },
  { name: 'privacy',         opposition: 'transparency' },
  { name: 'transparency',    opposition: 'privacy' },
  { name: 'kindness',        opposition: 'justice' },
  { name: 'justice',         opposition: 'kindness' },
];

// --- Baggage, wounds, wants, blind spots, boundaries pools ---
const BAGGAGE_POOL = [
  'grew up in a chaotic household and craves stability',
  'was the responsible one for younger siblings',
  'moved a lot as a kid and struggles to put down roots',
  'had a falling-out with family and is estranged',
  'was the funny kid who used humor to deflect conflict',
  'had a parent who was emotionally unavailable',
  'was a high achiever who burned out young',
  'grew up poor and is anxious about money',
  'was bullied and overcorrected into people-pleasing',
  'had a string of bad roommates and has trust issues',
  'was the mediator in every family fight',
  'lost a close friend and fears abandonment',
];

const WOUND_POOL = [
  'being told they are not enough',
  'being abandoned when they needed support',
  'being seen as selfish when they put themselves first',
  'being laughed at for caring about something',
  'being controlled by a partner',
  'being the last to know a secret',
  'being told they are too much, too intense',
  'being replaced by someone newer',
  'being accused of lying when telling the truth',
  'being told their feelings are irrational',
];

const WANT_POOL = [
  'to find a relationship that actually works',
  'to save enough to move out alone',
  'to build a creative career from nothing',
  'to repair a broken family relationship',
  'to be taken seriously at work',
  'to throw a party that makes people remember them',
  'to learn to be alone without being lonely',
  'to pay off debt by end of year',
  'to get a pet despite the no-pets lease',
  'to find a community that feels like home',
  'to quit a bad habit they are hiding',
  'to confront a roommate about something',
];

const BLINDSPOT_POOL = [
  'believes they are easy to live with (they are not)',
  'believes they do not care what others think (they do)',
  'believes they are the most responsible person in the room',
  'believes their humor brings people together (it sometimes alienates)',
  'believes they are over their ex',
  'believes they are independent (they are deeply dependent)',
  'believes they are a good listener (they wait to talk)',
  'believes they do not need help',
  'believes their anger is justified every time',
  'believes they are low-maintenance',
  'believes they are open-minded about everything',
  'believes their work does not define them (it does)',
];

// {text, category} rather than bare strings (P6) — 'room_access' is
// mechanically read by STEALTH to decide whether an entered bedroom's
// owner has a *specifically room-related* boundary (sharper reaction) or
// not (still real, generic). The other 11 stay 'other': the pool is now
// capable of carrying more categories (food/topic/schedule boundaries)
// without a shape change, but only room_access has a consumer this pass.
// Never mutates any NPC's frozen bible.boundary string — sim.js still
// draws that as plain prose from .text; this is a parallel lookup table.
const BOUNDARY_POOL = [
  { text: 'their bedroom is sacred space — do not enter without asking', category: 'room_access' },
  { text: 'no one touches their food in the fridge', category: 'other' },
  { text: 'do not bring up their ex, ever', category: 'other' },
  { text: 'they need quiet after 11pm, no exceptions', category: 'other' },
  { text: 'they will not be the one who calls the landlord', category: 'other' },
  { text: 'they decide who gets the parking spot', category: 'other' },
  { text: 'their workout time is non-negotiable', category: 'other' },
  { text: 'do not comment on how much they drink', category: 'other' },
  { text: 'their pet peeve is people leaving dishes in the sink', category: 'other' },
  { text: 'they will not cover rent for someone else twice', category: 'other' },
  { text: 'their music is not up for debate', category: 'other' },
  { text: 'do not ask about their family', category: 'other' },
];

// --- Speech profile pools ---
const HUMOR_STYLES = ['dry', 'sarcasm', 'goofy', 'dark', 'self-deprecating', 'absurdist', 'none'];
const VERBAL_TICS = ['like', 'you know', 'I mean', 'honestly', 'basically', 'right?', 'so yeah', 'anyway', 'literally', 'um', 'dude', 'okay so'];
const TEXTING_STYLES = ['terse', 'emoji-heavy', 'all-lowercase', 'properly-punctuated', 'stream-of-consciousness', 'meme-laden'];

// --- NPC Overhaul Phase 1: Physical description generation pools ---
// Seeded by genSeed for determinism. Each pool is a flat array of strings
// unless weighted (objects with { val, weight }). All pools are designed
// to compose into a coherent physical description.
const PHYS_POOL_HEIGHT = ['tall', 'average height', 'short', 'very tall', 'slightly below average'];
const PHYS_POOL_BUILD = ['slim', 'athletic', 'average', 'lean', 'curvy', 'stocky', 'wiry', 'muscular', 'petite', 'broad-shouldered'];
// Studio convenience ("Full body?" checkbox beside Build): each build maps
// to the equivalent option in every body field whose own vocabulary has
// one. Values are checked against the target field's pool when applied, so
// a mapping can never set an option the select doesn't offer.
const BUILD_FULL_BODY_LINK = {
  slim:     { 'physical.body.shape': 'willowy',         'physical.body.chestSize': 'small', 'physical.body.buttSize': 'small', 'physical.body.legs': 'slender', 'physical.body.posture': 'straight' },
  athletic: { 'physical.body.shape': 'athletic',        'physical.body.chestSize': 'medium', 'physical.body.buttSize': 'medium', 'physical.body.legs': 'muscular', 'physical.body.posture': 'straight' },
  average:  { 'physical.body.shape': 'rectangle',       'physical.body.chestSize': 'medium', 'physical.body.buttSize': 'medium', 'physical.body.legs': 'average', 'physical.body.posture': 'relaxed' },
  lean:     { 'physical.body.shape': 'rectangle',       'physical.body.chestSize': 'small', 'physical.body.buttSize': 'flat', 'physical.body.legs': 'slender', 'physical.body.posture': 'straight' },
  curvy:    { 'physical.body.shape': 'hourglass',       'physical.body.chestSize': 'large', 'physical.body.buttSize': 'rounded', 'physical.body.legs': 'slender', 'physical.body.posture': 'relaxed' },
  stocky:   { 'physical.body.shape': 'compact',         'physical.body.chestSize': 'broad', 'physical.body.buttSize': 'medium', 'physical.body.legs': 'stocky', 'physical.body.posture': 'straight' },
  wiry:     { 'physical.body.shape': 'athletic',        'physical.body.chestSize': 'small', 'physical.body.buttSize': 'small', 'physical.body.legs': 'slender', 'physical.body.posture': 'straight' },
  muscular: { 'physical.body.shape': 'inverted triangle', 'physical.body.chestSize': 'broad', 'physical.body.buttSize': 'medium', 'physical.body.legs': 'muscular', 'physical.body.posture': 'confident' },
  petite:   { 'physical.body.shape': 'compact',         'physical.body.chestSize': 'small', 'physical.body.buttSize': 'small', 'physical.body.legs': 'short', 'physical.body.posture': 'straight' },
  'broad-shouldered': { 'physical.body.shape': 'inverted triangle', 'physical.body.chestSize': 'broad', 'physical.body.buttSize': 'medium', 'physical.body.legs': 'average', 'physical.body.posture': 'confident' },
};
const PHYS_POOL_HAIR_COLOR = ['black', 'dark brown', 'brown', 'auburn', 'chestnut', 'blonde', 'dirty blonde', 'platinum blonde', 'red', 'ginger', 'grey', 'salt-and-pepper', 'bleached', 'dyed blue', 'dyed pink', 'dyed purple'];
const PHYS_POOL_HAIR_STYLE = ['straight', 'wavy', 'curly', 'coily', 'loc\'d', 'braided', 'slicked back', 'messy', 'tousled', 'swept back', 'undercut', 'buzzed', 'shaved'];
const PHYS_POOL_HAIR_LENGTH = ['short', 'ear-length', 'chin-length', 'shoulder-length', 'past the shoulders', 'very long', 'cropped', 'medium-length'];
const PHYS_POOL_HAIR_TEXTURE = ['fine', 'thick', 'coarse', 'silky', 'rough', 'soft'];
const PHYS_POOL_EYE_COLOR = ['brown', 'dark brown', 'hazel', 'green', 'blue', 'grey', 'amber', 'honey', 'violet', 'heterochromatic'];
const PHYS_POOL_EYE_SHAPE = ['almond-shaped', 'round', 'narrow', 'deep-set', 'wide-set', 'monolid', 'hooded', 'upturned', 'downturned'];
const PHYS_POOL_SKIN_TONE = ['pale', 'fair', 'light', 'olive', 'tan', 'golden brown', 'deep brown', 'dark', 'ebony', 'caramel', 'porcelain'];
const PHYS_POOL_SKIN_TEXTURE = ['smooth', 'freckled', 'clear', 'weathered', 'soft', 'rough'];
const PHYS_POOL_SKIN_ETHNICITY = ['Northern European', 'Mediterranean', 'East Asian', 'South Asian', 'Southeast Asian', 'African', 'Latino', 'Middle Eastern', 'Indigenous', 'mixed'];
const PHYS_POOL_FACE_SHAPE = ['oval', 'round', 'heart-shaped', 'square', 'long', 'diamond', 'oblong'];
const PHYS_POOL_NOSE = ['straight', 'aquiline', 'button', 'wide', 'narrow', 'upturned', 'hooked', 'flat'];
const PHYS_POOL_LIPS = ['full', 'thin', 'medium', 'pouty', 'wide', 'narrow', 'plump'];
const PHYS_POOL_CHEEKBONES = ['high', 'low', 'prominent', 'subtle', 'sharp', 'round'];
const PHYS_POOL_JAWLINE = ['strong', 'soft', 'angular', 'rounded', 'square', 'pointed'];
const PHYS_POOL_EARS = ['small', 'large', 'average', 'prominent', 'attached', 'pointed'];
const PHYS_POOL_BODY_SHAPE = ['hourglass', 'pear', 'apple', 'rectangle', 'inverted triangle', 'athletic', 'compact', 'willowy'];
const PHYS_POOL_CHEST_SIZE = ['small', 'medium', 'large', 'flat', 'broad'];
const PHYS_POOL_BUTT_SIZE = ['small', 'medium', 'large', 'flat', 'rounded'];
const PHYS_POOL_LEGS = ['long', 'short', 'average', 'slender', 'muscular', 'stocky'];
const PHYS_POOL_POSTURE = ['straight', 'slouched', 'relaxed', 'tense', 'confident', 'meek'];
const PHYS_POOL_FEATURES = ['glasses', 'a scar through the eyebrow', 'freckles across the nose', 'a birthmark on the neck', 'dark circles under the eyes', 'a crooked smile', 'dimples', 'a gap between the front teeth', 'a mole near the lip', 'laugh lines', 'a jagged scar on the jaw', 'tattoos on the forearm', 'a nose ring', 'stretch marks', 'a cleft chin', 'bushy eyebrows', 'a beauty mark', 'a missing tooth'];
// Player-requested (Discord, 2026-08-17): beards and mustaches as a real
// field, not a distinguishing-feature dice roll. 'clean-shaven' is the
// neutral default — the ROLLER gates how often a beard appears
// (appendFacialHairDraw's rng() < 0.4), and the describer skips the value
// entirely, so prose only speaks when there is hair to speak of.
const PHYS_POOL_FACIAL_HAIR = ['clean-shaven', 'light stubble', 'heavy stubble', 'a goatee', 'a mustache', 'a mustache and goatee', 'a short beard', 'a neat trimmed beard', 'a full beard', 'a bushy beard', 'a soul patch'];
const PHYS_POOL_PIERCING_LOC = ['earlobe', 'cartilage', 'nose', 'eyebrow', 'lip', 'tongue', 'navel', 'nipple'];
const PHYS_POOL_PIERCING_TYPE = ['stud', 'ring', 'barbell', 'hoop'];
const PHYS_POOL_TATTOO_STYLE = ['tribal', 'floral', 'geometric', 'script', 'traditional', 'minimalist', 'blackwork', 'watercolor'];
const PHYS_POOL_TATTOO_LOC = ['upper arm', 'forearm', 'shoulder', 'ribcage', 'back', 'ankle', 'wrist', 'neck', 'thigh'];
const PHYS_POOL_FASHION = ['casual hoodies and jeans', 'thrifted vintage', 'minimalist monochrome', 'bright patterns', 'comfort-first athleisure', 'smart-casual', 'bohemian layers', 'streetwear', 'preppy', 'goth-adjacent', 'workwear', 'flowy dresses'];
const PHYS_POOL_VOICE_PITCH = ['deep', 'baritone', 'low', 'tenor', 'medium', 'alto', 'high-pitched', 'soprano'];
const PHYS_POOL_VOICE_TEXTURE = ['smooth', 'raspy', 'clear', 'gravelly', 'soft', 'sharp', 'velvety', 'airy', 'nasal', 'hoarse', 'melodic', 'crisp'];
const PHYS_POOL_VOICE_ACCENT = [
  // American regionals — the full vowel geography, New York finally has
  // company (a player asked for Boston so the New Yorkers wouldn't have all
  // the fun; the fun is now shared).
  'neutral American', 'Boston', 'New York', 'Brooklyn', 'Chicago', 'Philadelphia',
  'Midwestern', 'Minnesota', 'Southern', 'slightly Southern', 'Texas drawl',
  'Appalachian', 'Cajun', 'Southern California', 'Pacific Northwest',
  // UK & Ireland
  'British', 'Cockney', 'Irish', 'Scottish',
  // The wider anglophone world
  'Australian', 'New Zealand', 'Canadian', 'Jamaican', 'South African', 'Nigerian',
  // International-inflected English
  'Indian', 'Filipino', 'Spanish-inflected', 'French-inflected', 'Italian', 'German',
  'Brazilian Portuguese', 'Mexican', 'Russian', 'Japanese', 'Korean',
];
const PHYS_POOL_GAIT = ['long confident strides', 'a slight slouch', 'quick short steps', 'a relaxed amble', 'an upright purposeful walk', 'a slight limp', 'bouncy steps'];
const PHYS_POOL_SCENT = ['faint bergamot', 'clean laundry', 'woody cologne', 'vanilla', 'coffee', 'cigarettes and leather', 'fresh soap', 'lavender', 'sandalwood', 'nothing distinctive', 'gunpowder and mint', 'cinnamon'];

// --- Intimate detail pools (player creation + intro plan, Phase 1) ---
// The undressed layer, mirroring the clothed pools above in every respect:
// flat string arrays, drawn by generatePhysical's same `pickPhys`, offered
// by the Player Design studio through the same one-table populate/read.
// Deliberately NOT a parallel vocabulary — `body.chestSize` above stays the
// CLOTHED silhouette every ordinary scene reads; these are only ever reached
// through getPhysicalDescriptionForPrompt's three-part gate (see npc.js).
const PHYS_POOL_BREAST_SIZE = ['flat', 'barely-there', 'small', 'modest', 'average', 'full', 'large', 'very large', 'heavy'];
const PHYS_POOL_BREAST_SHAPE = ['round', 'teardrop', 'bell-shaped', 'east-west', 'side-set', 'close-set', 'athletic', 'slender', 'pert'];
// Gender-gated breast vocabulary (intimacy fix): the feminine pool above is
// what female/futanari draws roll from; masculine genders (male, trans_male)
// draw from this set instead, so a randomly-rolled male can never land on
// "very large, teardrop" — arbitrarily girlish features belong to the studio,
// not to the roller. Same draw count either way (pickPhys per field), so a
// seed's rng sequence is unchanged by gender.
const PHYS_POOL_BREAST_SIZE_MASC = ['flat', 'barely-there', 'small', 'slight'];
const PHYS_POOL_BREAST_SHAPE_MASC = ['flat', 'broad', 'athletic', 'soft', 'slight'];

function breastPoolForGender(gender) {
  const masculine = gender === 'male' || gender === 'trans_male';
  return masculine
    ? { size: PHYS_POOL_BREAST_SIZE_MASC, shape: PHYS_POOL_BREAST_SHAPE_MASC }
    : { size: PHYS_POOL_BREAST_SIZE, shape: PHYS_POOL_BREAST_SHAPE };
}
const PHYS_POOL_BREAST_AREOLA = ['small and pale', 'small and pink', 'medium pink', 'medium dusky', 'wide and pale', 'wide and dark', 'dark brown', 'rosy'];
const PHYS_POOL_BREAST_NIPPLES = ['small', 'pert', 'puffy', 'prominent', 'inverted', 'wide', 'perpetually stiff'];
const PHYS_POOL_SENSITIVITY = ['low', 'muted', 'average', 'responsive', 'high', 'exquisite'];
const PHYS_POOL_BODY_HAIR = ['bare', 'waxed smooth', 'trimmed short', 'neatly kept', 'natural', 'full and untrimmed'];

// Per-type genital pools. `type` is the discriminator on each entry of the
// `genitals` array — the array shape is what lets one character carry more
// than one set (a futanari draw, or anything the player builds in the studio).
const PHYS_POOL_GENITAL_TYPES = ['vagina', 'penis'];
const PHYS_POOL_VULVA_LABIA = ['neat and tucked', 'prominent', 'full', 'asymmetric', 'delicate', 'plush'];
const PHYS_POOL_VULVA_COLOR = ['pale pink', 'rosy', 'dusky', 'deep pink', 'mauve', 'brown'];
const PHYS_POOL_PENIS_LENGTH = ['short', 'modest', 'average', 'above average', 'long', 'very long'];
const PHYS_POOL_PENIS_GIRTH = ['slim', 'average', 'thick', 'very thick'];
const PHYS_POOL_PENIS_CUT = ['circumcised', 'uncircumcised'];
const PHYS_POOL_PENIS_BALLS = ['small and tight', 'average', 'heavy', 'low-hanging'];

// Which keys of a `genitals` entry actually apply to which `type`, and the
// pool each one draws from. The schema's `itemFields` is the union of these
// (it has to be — see the comment there); THIS is the table that says what
// belongs where. Three readers, one table: rollGenitals (sim.js) draws from
// `pool`, normalizeGenitals (sim.js) strips anything absent here, and the
// Player Design studio builds the Intimate tab's rows from it. Adding a
// genital type means adding a row here plus its schema keys — nothing else.
const GENITAL_TYPE_FIELDS = {
  vagina: {
    labia:       { label: 'Labia',       pool: () => PHYS_POOL_VULVA_LABIA },
    color:       { label: 'Colour',      pool: () => PHYS_POOL_VULVA_COLOR },
    hair:        { label: 'Hair',        pool: () => PHYS_POOL_BODY_HAIR },
    sensitivity: { label: 'Sensitivity', pool: () => PHYS_POOL_SENSITIVITY },
    description: { label: 'Notes',       pool: null },   // free text
  },
  penis: {
    length:      { label: 'Length',      pool: () => PHYS_POOL_PENIS_LENGTH },
    girth:       { label: 'Girth',       pool: () => PHYS_POOL_PENIS_GIRTH },
    cut:         { label: 'Cut',         pool: () => PHYS_POOL_PENIS_CUT },
    balls:       { label: 'Testicles',   pool: () => PHYS_POOL_PENIS_BALLS },
    hair:        { label: 'Hair',        pool: () => PHYS_POOL_BODY_HAIR },
    sensitivity: { label: 'Sensitivity', pool: () => PHYS_POOL_SENSITIVITY },
    description: { label: 'Notes',       pool: null },   // free text
  },
};

// Default genital set per gender. A DEFAULT, not a constraint: the Player
// Design studio can add or remove any entry afterward, which is exactly how
// a player builds a body the five-value `gender` enum has no word for. The
// generated cast simply never overrides it, so `futanari` is the only NPC
// draw that carries two.
const GENDER_DEFAULT_GENITALS = {
  female:       ['vagina'],
  trans_female: ['vagina'],
  male:         ['penis'],
  trans_male:   ['penis'],
  futanari:     ['vagina', 'penis'],
};

// --- NPC Overhaul Phase 5: Personality generation pools ---
const PERSONALITY_TRAITS_POOL = [
  'reliable', 'sarcastic', 'anxious', 'ambitious', 'nurturing', 'guarded', 'impulsive', 'methodical',
  'flirtatious', 'stubborn', 'curious', 'cynical', 'idealistic', 'territorial', 'clingy', 'independent',
  'meticulous', 'chaotic', 'diplomatic', 'blunt', 'secretive', 'expressive', 'stoic', 'needy',
  'competitive', 'lazy', 'perfectionist', 'easygoing', 'intense', 'passive-aggressive', 'protective',
  'manipulative', 'vulnerable', 'confident', 'insecure', 'generous', 'selfish', 'patient', 'restless',
  'nostalgic', 'adventurous', 'cautious', 'rebellious', 'conformist', 'creative', 'practical', 'spiritual',
  'materialistic', 'sensitive', 'thick-skinned', 'loyal', 'fickle', 'honest', 'deceptive',
  'warm', 'cold', 'playful', 'serious', 'dramatic', 'understated',
  'sensual', 'brazen', 'teasing', 'forward', 'magnetic', 'daring',
];

const QUIRKS_POOL = [
  'always hums while cooking', "can't sleep without socks", 'collects mismatched mugs', 'talks to plants',
  'names their electronics', 'always late by exactly 7 minutes', 'has strong opinions about pizza toppings',
  'saves cardboard boxes', 'rereads the same book annually', 'pees with the bathroom door open',
  'organizes the spice rack alphabetically', 'keeps a journal but only writes in it at 3am',
  'uses a vintage flip phone', 'always has headphones in but nothing playing', 'refuses to use umbrellas',
  'sniffs food before eating it', 'makes lists for everything but never follows them',
  'sleeps with a fan on even in winter', 'has a playlist for every mood', 'collects interesting rocks',
  'always reads the terms and conditions', 'keeps expired condiments in the fridge',
  'talks in their sleep', 'never throws away gift bags', 'has a lucky pen they never use',
  'counts stairs when walking up them', 'always smells books before reading them',
  'keeps a running tally of how many coffees they have had', 'memorizes license plates out of habit',
  'wears mismatched socks on purpose', 'apologizes to inanimate objects',
  'narrates their actions under their breath', 'eats cereal dry', 'always sits with their back to the wall',
  'never buys matching towel sets', 'can quote entire movies from memory',
  'keeps every receipt in a shoebox', 'has a specific alarm for every day of the week',
  'always checks if the stove is off twice', 'prefers to eat standing up',
];

const LIKES_POOL = [
  'rainy mornings', 'the smell of fresh laundry', 'bad puns', 'thrift stores', 'loud music',
  'quiet mornings', 'fermented food', 'horror movies', 'gardening', 'deep conversations at 2am',
  'the sound of a kettle boiling', 'walking barefoot on grass', 'old bookstores', 'vinyl records',
  'spicy food', 'stargazing', 'swimming at night', 'making lists', 'cooking for other people',
  'the smell of rain on concrete', 'arranging flowers', 'bike rides at dusk', 'board games',
  'sketching strangers', 'singing in the shower', 'the first sip of coffee', 'rewatching comfort shows',
  'collecting sea glass', 'sleeping with the window open', 'lighting candles for no reason',
];

const DISLIKES_POOL = [
  'small talk', 'the sound of chewing', 'being touched unexpectedly', 'loud chewers', 'condescension',
  'wasting food', 'being interrupted', 'cold coffee', 'sticky counters', 'passive-aggressive notes',
  'when the toilet paper roll is empty', 'people who are late', 'the sound of nails on chalkboard',
  'being asked how they are doing', 'crowded grocery stores', 'small fonts', 'when someone eats their food',
  'unexpected visitors', 'the smell of boiled eggs', 'being told to calm down',
  'when the wifi is slow', 'people who do not use turn signals', 'the word moist',
  'overcooked pasta', 'being photographed', 'when a book adaptation gets it wrong',
  'empty fridge shelves', 'loud commercials', 'dishonesty disguised as politeness',
];

// --- Relational templates ---
const HOW_THEY_MET_POOL = [
  'answered the same Craigslist ad',
  'were college friends who needed a place',
  'met through a mutual friend who moved out',
  'were coworkers who found out they both needed housing',
  'were introduced at a party',
  'were the previous tenant\'s ex who stayed',
  'knew each other from the gym',
  'were friends of friends who hit it off',
];

const SHARED_BEAT_POSITIVE = [
  'covered for each other during a landlord inspection',
  'threw an impromptu birthday dinner that went surprisingly well',
  'helped each other move furniture up three flights of stairs',
  'shared a power outage with only candles and beer',
  'co-hosted a holiday dinner for friends together',
];

const SHARED_BEAT_NEGATIVE = [
  'had a screaming match over the thermostat that ended in a week of silence',
  'one ate the other\'s clearly-labeled leftovers and never admitted it',
  'a guest of one broke the other\'s prized possession',
  'one accused the other of borrowing clothes without asking',
  'one walked in on the other in a compromising moment',
];

// --- Cast constraints (tiered by resident count) ---
const CAST_CONSTRAINTS = {
  tier1: { // 1 resident
    requirements: ['strongWant', 'sharpWound', 'liveBlindSpot'],
    qualityThreshold: 0.6,
  },
  tier2: { // 2-3 residents
    // temperamentSpread (§7.1: axes must span a range; one high- and one
    // low-volatility character) is meaningless below 2 residents, so it
    // only appears from tier2 up.
    requirements: ['frictionPair', 'asymmetricRelationship', 'temperamentSpread'],
    qualityThreshold: 0.5,
  },
  tier3: { // 4+ residents
    requirements: ['unresolvedConflict', 'alliance', 'secret', 'obstructingWant', 'temperamentSpread'],
    qualityThreshold: 0.5,
  },
};

// --- Skills (full curves land in SKILLS, P3) — the stable id list EFFECTS
// and ACTIONS can validate against before that phase exists, so
// ADD_SKILL_XP has something real to check rather than a landmine. ---
const SKILL_IDS = ['cooking', 'cleaning', 'stealth', 'tech', 'fitness', 'social', 'art', 'writing', 'focus'];

// --- Flag key patterns. ADD_FLAG/CLEAR_FLAG validate against these rather
// than a fixed enum, since flag keys are often parameterized (e.g.
// "intruded_<room>" from a future sneak action) — a pattern still rules out
// the LLM inventing an arbitrary flag namespace. ---
const FLAG_PATTERNS = [
  /^noticed_.+$/,
  /^intruded_.+$/,
  /^met_.+$/,
  /^suspects_.+$/,
  /^told_.+$/,
  /^visited_.+$/,
];

// --- Effect vocabulary caps (EFFECTS enforces these against LLM-tier
// producers only — trusted producers like ACTIONS' own def.effects and,
// later, autonomy's DRIVE_DEFS are config-authored and bypass them; see
// EFFECTS' file header). Nothing magic outside CONFIG. ---
const EFFECT_LIMITS = {
  maxEffects: 6,
  maxPerType: 3,
  maxTotalNeedMagnitude: 40,
  maxTotalRelMagnitude: 0.6,
  maxSpendTimePerProposal: 1,
  needDeltaCap: 25,
  moodDeltaCap: 0.2,
  relDeltaCap: 0.3,
  moneyDeltaCap: 200,
  skillXpCap: 15,
  memoryTextMaxLength: 200,
  npcActivityMaxLength: 60,
  spendTimeMin: 1,
  spendTimeMax: 8,
  itemQtyCap: 10,
  objectConditionCap: 25,
  suspicionDeltaCap: 0.4,
  evidenceStrengthCap: 1,
};

// --- Stealth (P6): suspicion subjects, tuning, and narration text.
// Suspicion lives per-NPC as npc.suspicion[subject] (0..1), a sibling of
// relPlayer/flags, never the frozen bible. 'general' is a deliberately
// unused-for-now catch-all so a future non-boundary suspicion source
// (theft, a caught lie) doesn't need a config change to land. ---
const SUSPICION_SUBJECTS = ['boundary_violation', 'general'];

// Nothing magic outside CONFIG — every stealth number lives here.
const STEALTH_TUNING = {
  witnessedSuspicionDelta: 0.35,        // owner present, direct witness
  sneakCaughtSuspicionDelta: 0.15,      // owner absent, stealth roll failed
  housekeeperSuspicionDelta: 0.08,      // indirect, via accessScope:'all' cleaning
  matchedBoundaryMultiplier: 1.5,       // boundary.category === 'room_access' for this room's owner
  confrontThreshold: 0.5,               // npc.suspicion[subject] that triggers a deterministic confrontation line
  confrontDecayFactor: 0.5,             // suspicion multiplied by this after confronting, so it doesn't refire every talk
  witnessedTensionDelta: 0.1,           // REL_DELTA tension bump on direct witness
  sneakEvidenceStrength: 0.4,           // fixed strength trusted producers use for LEAVE_EVIDENCE
  baseEvidenceDiscoveryChance: 0.15,    // per-tick roll when the owner is in their own room
  evidenceStrengthDiscoveryFactor: 0.5, // added to base, scaled by evidence.strength
  // Phase 8 (NPC inventories): the player's room-search. SEARCHING an
  // NPC's room surfaces their possessions (free, like browsing a chest);
  // TAKING one costs game time and routes through the same
  // ADJUST_SUSPICION boundary_violation path as phone-snooping
  // (drives.js:400) — the owner in the room to catch you pays the full
  // witnessed delta, an absent owner the lesser take delta.
  searchTimeMinutes: 5,
  takeTimeMinutes: 1,
  possessionTakeSuspicionDelta: 0.2,
};

// F6 (Discord feedback, 2026-08-23/24): the player-side mirror of
// DRIVE_DEFS.snoop_phone (drives.js) — same witnessed-vs-not consequence
// shape as STEALTH_TUNING's room-search deltas above, since going through
// someone's phone is the same class of boundary violation as taking their
// stuff. sensitiveContentMultiplier scales it up for a boundary/photo find
// specifically — reading someone's stated hard limit or a private photo is
// a bigger violation than an aspirational want.
const PHONE_SNOOP_TUNING = {
  searchTimeMinutes: 5,
  // Unwitnessed path: a flat suspicion bump, same shape as room-search's
  // possessionTakeSuspicionDelta.
  unwitnessedSuspicionDelta: 0.2,
  sensitiveContentMultiplier: 1.5,
  // Witnessed path reuses npc.js's resolveShamingReaction/SHAMING tiers
  // wholesale (the same "caught doing something invasive" consequence
  // bundle boundary.js's caught-in-bed path uses) rather than a second
  // deltas table — sensitiveExtraTension is the one content-dependent
  // knob layered on top, mirroring BOUNDARY.sleepRoom.caughtTensionSpike's
  // own extra-tension-on-top-of-the-tier pattern.
  sensitiveExtraTension: 0.1,
};

// --- Peeping (P7 adult content). Tuning for the spy/peep action that lets
// the player observe NPCs in private states (showering, sleeping,
// undressed). This is a boundary-crossing action with its own suspicion
// and relationship consequences, separate from room-entry stealth. ---
const PEEP_TUNING = {
  suspicionDelta: 0.2,          // suspicion increase if caught
  tensionDelta: 0.15,          // rel tension increase if caught
  affectionCostIfCaught: -0.1, // rel affection decrease if caught
  stealthSkillFactor: 0.5,     // how much stealth skill reduces detection
  moodGain: 0.1,               // player mood gain from peeping
  detectionNpcAwake: 0.6,      // detection chance if NPC is awake
  detectionNpcAsleep: 0.1,     // detection chance if NPC is sleeping
  suspectedChance: 0.2,        // chance of a "someone might have noticed" near-miss when not caught
};

// Clothing states visible during peeping, by NPC activity
const PEEP_CLOTHING_DESC = {
  showering: 'through the crack in the bathroom door — {name} is in the shower, water running down their skin',
  sleeping: 'through the gap — {name} is asleep in bed, sheets tangled around them',
  undressed: 'through the crack — {name} is changing, clothes scattered on the floor',
  sleepwear: 'through the gap — {name} is in their sleepwear, relaxed and unguarded',
  towel: 'through the crack — {name} is standing with just a towel wrapped around them',
  // Intimacy & Voyeurism Phase 6 (D11): the two states Phase 5's machine
  // added, so the existing peep resolver reads them honestly — 'nude' is the
  // naked-in-scene state (nude swim / shower), 'changing' is the caught-
  // changing keyhole beat the change_clothes drive sets for exactly one tick.
  nude: 'through the gap — {name} is completely naked, skin bare in the dim room',
  changing: 'through the crack — {name} is mid-change, caught between two outfits, clothes half-on half-off',
  dressed: 'through the gap — {name} is just hanging out in their room',
};

// NPC reactions when they catch the player peeping
const PEEP_CAUGHT_TEMPLATES = [
  '"What the hell are you doing?" {name} demands, grabbing something to cover themselves.',
  '{name} spots you at the door. "Seriously? Get out."',
  '"Did you just — were you watching me?" {name}\'s face hardens.',
  '{name} sees the door move and catches you looking. The silence is lethal.',
];

// NPC reactions when they DON'T catch the player but sense something
const PEEP_SUSPECTED_TEMPLATES = [
  '{name} pauses, looking toward the door as if they heard something, then shrugs it off.',
  '{name} glances at the door briefly, frowning, before going back to what they were doing.',
];

// --- Peek & Listen (Intimacy & Voyeurism Phase 10, D6/D7) -----------------
// The timed real-time hold at a door. D7's "game minutes tick while the
// player watches": while a peek/listen session is active the continuous
// clock runs at TIME_DILATION.scales.peeking (60x = one game-minute per
// real second) — the SAME chunked closed-form semantics as every other
// clock advance, never a per-real-tick sim loop (the fast-forward rule).
// The session controller (peek.js) only READS the clock: each real second
// it re-derives the door cue + occupant state, accrues the risk ramp and
// rolls the catch. Deterministic throughout — seeded rng only, and no LLM
// call decides any boundary outcome (D15).
const PEEK = {
  realTickMs: 1000,          // the session loop's real-time cadence
  tickMinutes: 1,            // game-minutes per hold tick (1 gm per real second)
  // The risk ramp (D7). Per-tick increment:
  //   baseRisk + riskPerTick × ticksElapsed
  //     − stealthSuccess(player) × stealthBonus  — the planted curve's first reader
  //     − doorLocked × lockBonus                 — a locked door = a complacent occupant
  //     + getNpcPerception(occupant) × perceptionWeight
  baseRisk: 0.05,
  riskPerTick: 0.012,
  maxRisk: 1.0,
  stealthBonus: 0.04,
  lockBonus: 0.02,
  perceptionWeight: 0.15,
  // The caught roll each tick: maxCatchChance × riskAccum/(riskAccum + riskHalfway).
  // Monotone-saturating — a long hold is eventually caught, never certain in one tick.
  riskHalfway: 0.55,
  maxCatchChance: 0.9,
  // Safety cap: a hold nobody stops ends on its own (4 real minutes).
  maxHoldTicks: 240,
  // Player mood on a resolved watch (the thrill of the keyhole).
  moodGain: 0.1,
  // The one-shot desire mark (DESIRE.sources `peeked_at_sex` = 8) when the
  // watched act is sexual — the plan's "Phase 10's caught-in-the-act read".
  // Everything else (a shower, general nudity) rides the normal signal
  // sources through the heartbeat. Marked once per session on a sexual act
  // or an escalate/engage resolution.
  desireSource: 'peeked_at_sex',
  desireActs: ['masturbating', 'masturbating in bed', 'having sex', 'sex', 'quickie', 'making love'],
  // Image budget (the plan's D7 open question, resolved here): fresh
  // generations are capped per session and per day — the kv image cache is
  // the primary gate, this is the secondary one. Past either cap the lens
  // shows the last cached frame (or the shimmer + a shadows line) instead
  // of spending quota.
  imageBudget: { freshPerSession: 2, freshPerDay: 6 },
  listen: {
    // Same session, audio-only lines, and a shorter default hold — the
    // player is expected to pull away sooner from a door they can't see
    // through. The player can always hold longer; the cap is guidance.
    defaultHoldTicks: 15,
    maxAudibleSignals: 2,
  },
};

// The caught resolution (D7/D15). Per-NPC PERSONALITY outcome, decided
// deterministically and narrated from authored prose — some stop, some
// ignore, some escalate or engage once they know they are watched, some
// confront. The weight tables ARE the personality gate; the prose pools in
// PEEK_PROSE are the narration. No LLM call decides which outcome happens.
const PEEK_OUTCOMES = {
  // Dynamic gates that steer the weighted pick. `warm` = comfort above the
  // bar or a familiar/close/intimate phase; a near-stranger (all axes at
  // default, no grievances) or hostile-tension target reads `cold`.
  warmComfort: 0.6,
  warmPhases: ['familiar', 'close', 'intimate'],
  deviantThreshold: 0.55,     // npcDeviancy ≥ this opens the escalate/engage branch
  hostileTension: 0.8,        // aligns with REL_CONSEQUENCES.tensionHigh
  weightTables: {
    // { stop, ignore, escalate, engage, confront }
    warmDeviant: { stop: 1, ignore: 1, escalate: 3, engage: 2, confront: 0 },
    warm:        { stop: 2, ignore: 2, escalate: 1, engage: 2, confront: 0 },
    neutral:     { stop: 3, ignore: 3, escalate: 1, engage: 1, confront: 1 },
    cold:        { stop: 2, ignore: 2, escalate: 0, engage: 0, confront: 4 },
    hostile:     { stop: 1, ignore: 1, escalate: 0, engage: 0, confront: 6 },
  },
  // Per-outcome consequences, applied via the effects vocabulary (trusted
  // producer path — the caught resolution is deterministic, D15). tension/
  // affection are the occupant's relPlayer axes, suspicion is the boundary
  // subject, mood is the player's impulse.
  stop:     { tension: 0.10, suspicion: 0.10 },
  ignore:   { tension: 0.05 },
  escalate: { tension: 0.02, mood: 0.05 },
  engage:   { tension: 0.06, affection: 0.04, mood: 0.10 },
  confront: { tension: 0.20, suspicion: 0.25, affection: -0.15, mood: -0.05 },
};

// What a watched act is called in prose, and how explicit that can be. D15:
// an activity whose phrase is itself explicit (masturbating, sex) has a
// `safe` form used whenever the intimate gate is CLOSED — the same fail-
// closed split as getPhysicalDescriptionForPrompt's own. `explicit` is only
// reachable through the gate (mature flag + naked state) in image.js.
const PEEK_VIEW_ACT = {
  masturbating: { safe: 'lying in bed', explicit: 'masturbating' },
  'masturbating in bed': { safe: 'lying in bed', explicit: 'masturbating' },
  'having sex': { safe: 'in bed', explicit: 'having sex' },
  sex: { safe: 'in bed', explicit: 'having sex' },
  quickie: { safe: 'in bed', explicit: 'having a quickie' },
  showering: { safe: 'in the shower', explicit: 'in the shower' },
  changing: { safe: 'changing', explicit: 'changing' },
  sleeping: { safe: 'asleep in bed', explicit: 'asleep in bed' },
  napping: { safe: 'dozing', explicit: 'dozing' },
  'watching TV': { safe: 'watching TV', explicit: 'watching TV' },
  'reading': { safe: 'reading', explicit: 'reading' },
  'reading in bed': { safe: 'reading in bed', explicit: 'reading in bed' },
  'scrolling social media': { safe: 'on their phone', explicit: 'on their phone' },
  'playing games': { safe: 'playing games', explicit: 'playing games' },
  'doing yoga': { safe: 'doing yoga', explicit: 'doing yoga' },
  exercising: { safe: 'working out', explicit: 'working out' },
  // Vocation plan D16/D17 — content work. safe/explicit genuinely diverge
  // here, which is the whole reason PEEK_VIEW_ACT has two columns: at a
  // glance through a gap in a door this reads as someone set up with a light
  // and a camera, and only a real look tells you what is being filmed.
  filming:                  { safe: 'set up with a camera', explicit: 'filming themselves' },
  'filming by the pool':    { safe: 'by the pool with a camera set up', explicit: 'filming themselves at the pool' },
  'filming together':       { safe: 'in there with someone, a camera set up', explicit: 'filming with someone' },

  // Vocation plan D5/Phase 3 — the at-home workday. Every string in
  // HOME_WORK_ACTIVITIES needs a row here or peeking at a remote worker
  // returns `_default` ("just in there"), which is how a whole new class of
  // visible behaviour arrives invisible. Work is not a private act, so safe
  // and explicit read the same: there is nothing to soften.
  'on a video call':        { safe: 'on a video call', explicit: 'on a video call' },
  'debugging something':    { safe: 'hunched over a laptop', explicit: 'hunched over a laptop' },
  'in a standup':           { safe: 'on a call with their team', explicit: 'on a call with their team' },
  'staring at a terminal':  { safe: 'staring at a screen', explicit: 'staring at a screen' },
  'reviewing code':         { safe: 'reading something on a laptop', explicit: 'reading something on a laptop' },
  'sketching':              { safe: 'sketching', explicit: 'sketching' },
  'editing a draft':        { safe: 'editing something', explicit: 'editing something' },
  'colour-matching something': { safe: 'squinting at colour swatches', explicit: 'squinting at colour swatches' },
  'at the drawing tablet':  { safe: 'at a drawing tablet', explicit: 'at a drawing tablet' },
  'recording a take':       { safe: 'recording something', explicit: 'recording something' },
  'editing audio':          { safe: 'in headphones at a laptop', explicit: 'in headphones at a laptop' },
  'on a call with a source': { safe: 'on the phone', explicit: 'on the phone' },
  'writing up notes':       { safe: 'writing something up', explicit: 'writing something up' },
  'chasing a quote':        { safe: 'on the phone', explicit: 'on the phone' },
  'buried in a spreadsheet': { safe: 'buried in a spreadsheet', explicit: 'buried in a spreadsheet' },
  'reconciling something':  { safe: 'working through paperwork', explicit: 'working through paperwork' },
  'on a client call':       { safe: 'on a client call', explicit: 'on a client call' },
  'marking papers':         { safe: 'marking papers', explicit: 'marking papers' },
  'reading a paper':        { safe: 'reading a paper', explicit: 'reading a paper' },
  'writing lecture notes':  { safe: 'writing notes', explicit: 'writing notes' },
  'buried in a chapter':    { safe: 'buried in a book', explicit: 'buried in a book' },
  'crunching numbers':      { safe: 'working through numbers', explicit: 'working through numbers' },
  'writing up results':     { safe: 'writing something up', explicit: 'writing something up' },
  'reading a filing':       { safe: 'reading through documents', explicit: 'reading through documents' },
  'drafting something':     { safe: 'drafting something', explicit: 'drafting something' },
  'buried in a contract':   { safe: 'buried in paperwork', explicit: 'buried in paperwork' },
  'answering emails':       { safe: 'answering emails', explicit: 'answering emails' },
  'on the phone with a supplier': { safe: 'on the phone', explicit: 'on the phone' },
  'mixing a track':         { safe: 'mixing a track', explicit: 'mixing a track' },
  'laying down a take':     { safe: 'recording something', explicit: 'recording something' },
  'on headphones at the desk': { safe: 'in headphones at a desk', explicit: 'in headphones at a desk' },
  'writing something':      { safe: 'writing something', explicit: 'writing something' },
  'on a call':              { safe: 'on a call', explicit: 'on a call' },
  'editing something':      { safe: 'editing something', explicit: 'editing something' },
  'answering messages':     { safe: 'answering messages', explicit: 'answering messages' },
  'planning a shoot':       { safe: 'making notes on a laptop', explicit: 'making notes on a laptop' },
  'at the laptop':          { safe: 'at a laptop', explicit: 'at a laptop' },
  working:                  { safe: 'working', explicit: 'working' },
  _default: { safe: 'just in there', explicit: 'just in there' },
};

// The view line's clothing clause — what is worth saying about the state
// machine over and above the act phrase. Empty strings stay silent.
const PEEK_VIEW_CLOTHING = {
  nude: ', completely bare',
  undressed: ', undressed',
  towel: ', wrapped in a towel',
  sleepwear: ', in their sleepwear',
  changing: ', caught mid-change',
};

// Authored narration pools — varied (D4), never one repeated string. Seeded
// pick per (pool, room, day) exactly like the door-cue pools. {name} is the
// occupant, {door} the door label.
const PEEK_PROSE = {
  openPeek: [
    'You crouch to the keyhole of {door}.',
    'You lean down and press your eye to the keyhole of {door}.',
    'Kneeling at {door}, you put your eye to the keyhole.',
    'You slip into a crouch by {door} and peer through the keyhole.',
    'You bend low at {door}, one eye to the keyhole.',
  ],
  openListen: [
    'You press your ear to {door}.',
    'You lean in close to {door} and listen.',
    'You rest your head against {door}, listening.',
    'Quietly, you put your ear to {door}.',
    'You lean against the frame of {door}, ear to the wood.',
  ],
  empty: [
    'The light under {door} cuts out. Whoever was in there has gone.',
    'A door clicks somewhere beyond {door}. The room falls silent and dark.',
    'You hear footsteps retreat. The room behind {door} goes still.',
    'The light in there snaps off. {door} is silent now.',
    'Nothing moves behind {door} anymore. They must have slipped out.',
  ],
  dark: [
    'The light behind {door} dies. Whoever is in there is in the dark now.',
    'The keyhole goes black. You can hear them moving, but see nothing.',
    'The glow under {door} fades. You keep watching a dark room.',
    'Whoever is in there has turned out the light. The keyhole shows only black.',
    '{door} falls dark, but you can still hear someone inside.',
  ],
  shadows: [
    'The keyhole shows only shadows — the image is already burned into your memory, though.',
    'The scene behind the lens stays as it was. You watch the shadows hold still.',
    'The picture in the keyhole blurs to dark shapes. You hold your breath anyway.',
    "You can't get a clearer look — but what you've seen is enough.",
    'The lens has nothing new to show. You watch the shapes of it move.',
  ],
  viewFrames: [
    'Through the keyhole, {name} is {act}{state}.',
    'You watch {name}, {act}{state}.',
    'Through the brass circle, {name} is {act}{state}.',
    '{name} is {act}{state} — you can see them clearly through the keyhole.',
    'The keyhole frames {name}, {act}{state}.',
  ],
  listenSilent: [
    'Nothing but the hum of the building behind {door}.',
    'The room behind {door} is quiet.',
    'You hear nothing through {door} except the distant thrum of the apartment.',
    'Silence behind {door}. Not even a floorboard creaks.',
    'The walls are quiet. {door} gives up nothing.',
  ],
  stop_peek: [
    '{name} crosses to {door} and it clicks shut. The light under it snaps off.',
    'A shadow fills the keyhole, then {door} closes with a firm click.',
    '{name} looks straight at the door — you pull back just as it shuts.',
    "There's a soft thud against {door} from inside — they've pressed against it. The light goes out.",
    '{name} pauses, then {door} swings shut. End of show.',
  ],
  stop_listen: [
    'The room behind {door} goes quiet, then a door inside closes. They have noticed.',
    '{name} stops what they were doing. A pause. Then {door} is locked from inside.',
    'You hear footsteps approach {door} and stop. Then the lock clicks.',
    'A weight settles against {door} on the other side. They are leaning there, waiting for you to go.',
  ],
  ignore_peek: [
    '{name} glances at {door}, shrugs, and goes back to what they were doing.',
    'Your movement catches their eye for a second. They do not seem to care.',
    '{name} looks up at the door, frowns, and turns away.',
    'They notice the door shift — then continue, unbothered.',
  ],
  ignore_listen: [
    '{name} pauses mid-motion, tilts their head toward {door}, and carries on.',
    'You hear them pause, then the sounds resume — they did not think twice.',
    'A beat of stillness inside, then {name} continues what they were doing.',
  ],
  escalate_peek: [
    '{name} meets your eye through the keyhole — and holds it. Then they keep going, deliberately.',
    "They've noticed you. Their eyes find the door — and they continue, slower, on purpose.",
    '{name} catches you looking and does not stop. If anything, they are putting on a show.',
    'Your eyes meet. {name} gives you a look that says they know — and carries on.',
  ],
  escalate_listen: [
    'The sounds behind {door} change — sharper, more deliberate. They know you are there and they are not stopping.',
    '{name} makes sure you can hear it. The sounds continue, louder.',
    'A pause behind {door}, then the noises resume — this time for your benefit.',
  ],
  engage_peek: [
    '{door} swings open. {name} leans against the frame, looking at you. "You gonna stand there all night?"',
    'The door opens a crack, then wide. {name} watches you with an unreadable look.',
    '{name} opens {door} and leans out. "Enjoying the show?" There is no anger in their voice.',
    'The lock clicks, and {door} opens. {name} is standing there, calm. "You could have just knocked."',
  ],
  engage_listen: [
    '{door} swings open. {name} is standing there. "Were you listening?" They do not look mad.',
    'The door opens. {name} leans against the frame. "Could not hear well enough from out here?"',
    'A pause, then {door} opens. {name} looks at you, mildly amused.',
  ],
  confront_peek: [
    '{door} wrenches open. "{name}: What the hell are you doing?"',
    'The door flies open and {name} is right there, furious. "Are you spying on me?!"',
    '{name} catches you through the keyhole — the door slams open and they are livid. "Get lost!"',
    '"I knew it!" {name} yanks {door} open, face flushed with anger. "Out. Now."',
    '{name} opens the door just enough to glare at you. "What is WRONG with you?"',
  ],
  confront_listen: [
    '{door} rips open. "Were you LISTENING at my door?!" {name} is shaking with anger.',
    '{name} yanks {door} open. "Get away from my door, you creep."',
    'The door opens hard enough to shake the frame. {name} glares. "Haven\'t you got anything better to do?"',
    '"I can hear you out there!" {name} throws {door} open, furious.',
  ],
};

const EVIDENCE_KIND_TEXT = {
  browser_history: "{name} noticed the browser history on the computer looked off.",
  open_app: "{name} noticed an app had been left open that they didn't open.",
  personal_item: "{name} noticed their things had been gone through.",
  // BrineOS Phase 9 (9.4): a discovered, unlocked phone left somewhere.
  phone_contents: "{name} noticed their phone had been picked up and gone through.",
};

// Stored verbatim as memory-episode text (not re-templated at read time,
// unlike the narration-only BOUNDARY_CONFRONT_TEMPLATES below) — written
// in 2nd person since WITNESS.subjectRef is player-only this pass (see
// effects.js's validateWitnessSubject); no {name} placeholder needed.
const WITNESS_MEMORY_TEMPLATES = {
  certain: 'Saw you come out of their room without being asked in.',
  suspects: 'Has a feeling you were in their room when they weren\'t supposed to be.',
};

const BOUNDARY_CONFRONT_TEMPLATES = [
  '"Hey — were you in my room?" {name} asks, watching your face for the answer.',
  '"I know someone\'s been in my room," {name} says. "I just want to know it was you and not someone else."',
];

// --- D13's narration (initiative plan Phase 2) ----------------------------
// An NPC at tensionHigh normally refuses to talk. Someone disinhibited and
// wanting stays anyway (SIM's npcInitiativeGate → tensionOverride), and that
// needs a line: without one the player sees a refusal threshold that quietly
// stopped applying, which reads as the tension model being broken rather than
// as a character wanting two things at once. Charged, not warm — none of these
// says they have forgiven you.
const CHARGED_TENSION_TEMPLATES = [
  '{name} is still angry with you. They stay anyway, arms folded, waiting to see what you say.',
  '"I\'m not over it," {name} says flatly — and doesn\'t leave the room.',
  '{name} looks like they\'d rather be anywhere else. They don\'t go anywhere.',
];

// --- Room cleanliness, once WORLD derives it from object state instead of
// the old fixed initial value. baseline is used only when a room has no
// cleanliness-relevant objects (weight 0 across the board). ---
const CLEANLINESS = { baseline: 50 };

// --- Small numeric tuning for the registered apartment actions (ACTIONS/
// DEFS.ACTIONS), pulled out of doCook/doWatchTV/doRelax's old inline
// literals so nothing magic lives in the action bodies. ---
const ACTION_TUNING = {
  tvMoodGain: 0.1,
  tvMinutes: 30,           // Phase 6: Watch TV finally costs real time (was 1 min) and pays mood
  relaxMoodGain: 0.16,
  relaxEnergyGain: 5,
  dishesMoodGain: 0.05,
  // Phase 5: new room actions
  // Initiative plan Phase 5: these three entries had no `timeCost` at all, and
  // resolveTimeCost reads `timeCost.base` unconditionally — so Work Out, Play
  // Games and Study THREW out of executeAction rather than resolving. They are
  // three of the ten activities D17 makes shareable and a shared delta is
  // scaled by the minutes spent, so the phase could not carry them without
  // this. Sized against the siblings already in this table: a gym session runs
  // longer than a swim (30), a gaming session longer than hobby.console (30),
  // and studying is the longest sit of the three. verify-i5 asserts that EVERY
  // ACTION_DEFS entry declares a timeCost, which is the invariant rather than
  // these three instances.
  workoutMoodGain: 0.12,
  workoutMinutes: 45,
  workoutEnergyCost: 10,
  workoutHygieneCost: 8,
  gamesMoodGain: 0.1,
  gamesMinutes: 40,
  gamesEnergyCost: 3,
  // Swimming is the gym's opposite number: similar effort, but you come
  // out cleaner rather than needing a shower afterward.
  swimMoodGain: 0.18,
  swimEnergyCost: 9,
  swimHygieneGain: 10,
  studyMoodGain: 0.08,
  studyMinutes: 60,
  laundryMoodGain: 0.03,
  // Intimacy & Voyeurism Phase 5 (D11): Change Outfit — a real action with a
  // real (small) time cost, so the wardrobe can never become a free
  // stat-swap machine; sized below a shower, above a door lock.
  changeOutfitMinutes: 5,
  // Phase 6 (D13): free ambient actions — the ungated safety net that
  // guarantees the player always has a mood source on day one with no
  // renovation and no money spent. All cost zero money/items/facilities;
  // they still advance the clock like any action. Numbers live here, never
  // inline at the action def.
  napMinutes: 30,
  napMoodGain: 0.03,
  napEnergyGain: 15,
  balconyMinutes: 15,
  balconyMoodGain: 0.04,
  walkMinutes: 30,
  walkMoodGain: 0.05,
  listenMusicMinutes: 15,
  listenMusicMoodGain: 0.03,
  longShowerMinutes: 25,
  longShowerMoodGain: 0.05,
  longShowerHygieneGain: 20,
  // Phase 7 (D7): laying out and eating a proper shared meal takes a real
  // stretch of clock — longer than a solo bite (INVENTORY_TUNING
  // useTimeMinutes meal: 25), shorter than cooking a dish from scratch.
  setMealMinutes: 40,
  // Food-overhaul Phase 3 (D26/D27): the interim stove reheat — faster than
  // waiting out THAW_TUNING for a frozen batch, and the whole kitchen touch
  // that earns a betterHot plate its mood bonus at the table. Phase 6's
  // microwave replaces this as the fast reheat.
  reheatMinutes: 10,
};

// --- Shared activities (initiative plan Phase 5, D16/D17) ---
// D17: a shared activity is NOT a parallel `together.*` table. It is the same
// activity with somebody else in it, declared by a `shared` field on the
// ACTION_DEFS entry that already exists — ten config entries rather than ten
// more actions to keep in step with their solo twins. This holds the numbers
// those entries reference; ACTIONS' resolveSharedActivity is the reader.
//
// The whole of Plan 5 up to here is an NPC reaching for the player. This is
// the other direction: the player's own verbs finally being things you can do
// WITH someone rather than next to them.
const SHARED_ACTIVITY = {
  // An NPC standing in the room is only IN it with you if they are awake and
  // not busy with something that is plainly not this. A registry rather than an
  // inline string test because three inline copies of "is this NPC asleep"
  // already exist in this codebase (STEALTH, RENDER, UI) and two of them
  // disagree about the word — RENDER tests 'sleep' where the others test
  // 'napping'. Listing every spelling here is how this reader cannot be the
  // fourth copy to drift. Unknown activities fail OPEN (they participate),
  // which is the safe direction: the failure is a roommate counted as present
  // while they read a book, not a silent nothing-ever-happens.
  excludeActivities: ['sleeping', 'napping', 'sleep', 'showering'],

  // D16's relationship delta, expressed PER HOUR of shared time. The lever is
  // TIME, because time is what a shared activity actually is — so the
  // 15-minute verb and the 45-minute one pay the same per minute and the cheap
  // one is not the exploit. Three named rates rather than ten authored number
  // sets: what an entry declares is what KIND of togetherness it is, and the
  // numbers stay in one place for Phase 6 to move.
  //
  //   parallel      — in the same room doing the same thing, not much said
  //   companionable — the activity is the excuse to be in each other's company
  //   confiding     — quiet, side by side, the kind where people talk
  //
  // Only `confiding` moves trust, and that is the distinction the tier exists
  // to make: a walk is where something gets said that the gym is not.
  rates: {
    parallel:      { affection: 0.012, comfort: 0.012 },
    companionable: { affection: 0.020, comfort: 0.015 },
    confiding:     { affection: 0.020, comfort: 0.020, trust: 0.010 },
  },

  // D16's other half — small enough that shared time does not become the
  // dominant relationship lever. This is the structural guarantee rather than
  // an argument that the player will not grind it: minutes past the cap are
  // still shared time (the fact is still written, the narration still names
  // them) but buy no more relationship that day.
  //
  // At 150 the ceiling is 2.5 hours × 0.020 = 0.05 affection per NPC per day,
  // which is LESS THAN ONE judged conversation window at its ceiling
  // (X5.deltaClamp / X5.deltaDivisor = 0.20). A whole day of doing everything
  // together is worth less than one good talk, which is the ordering D16 asks
  // for. verify-i5 derives that comparison from both tables rather than
  // restating either number.
  dailyCreditMinutes: 150,

  // D16's first half — the witnessed fact. Written ONCE per activity per NPC:
  // the first evening in front of the TV together is the thing that gets
  // remembered, and the thirtieth is what the relationship delta is for.
  // That bounds this source at ten facts per NPC by construction (one per
  // shareable entry) against BELIEF.maxFacts 60, which is the same
  // bounded-rather-than-throttled property D24/D25 settled on in Phase 2.
  //
  // Deduplicated on EXACT TEXT, where D25's repetition rule needed a tag: the
  // text here is rendered deterministically from the entry's own `fact`
  // template and the NPC's name, so the same activity always produces the same
  // string. D25 could not do that because its exemplar episode changed daily.
  factImportance: 'social',      // a MEMORY_IMPORTANCE key — the band the refusal fact uses
  factConfidence: 0.9,           // first-hand: they were in the room (OVERTURE.refusalFactConfidence's reasoning)
  factCategory: 'relationship',
  factEmotionalTag: 'warmth',
};

// --- Hobby objects (inventory overhaul Phase 6, D13) ---
// One action per buyable hobby OBJECT_DEFS entry (DEFS.WORLD's hobby_*
// set). Tables are keyed by the OBJECT_DEFS id, so adding a hobby is one
// row in OBJECT_DEFS, one in ITEM_DEFS, one ACTION_DEFS entry (via
// createHobbyAction) and one row here — no other coupling.
const HOBBY_TUNING = {
  useMinutes: { hobby_guitar: 20, hobby_bookshelf: 25, hobby_record_player: 15, hobby_console: 30, hobby_sketchpad: 25, hobby_houseplant: 5 },
  moodGain:   { hobby_guitar: 0.07, hobby_bookshelf: 0.06, hobby_record_player: 0.05, hobby_console: 0.06, hobby_sketchpad: 0.08, hobby_houseplant: 0.04 },
  energyCost: { hobby_guitar: 3, hobby_bookshelf: 0, hobby_record_player: 0, hobby_console: 2, hobby_sketchpad: 2, hobby_houseplant: 0 },
};

// --- Inventory panel tuning (inventory overhaul Phase 1) ---
// Time costs for acting on items from the inventory panel, in game
// minutes. Acting from the bag must cost the same game time as the
// equivalent action chip (it goes through advanceAndResolveMinutes, never
// a free shortcut), so the panel can never become a way to sidestep the
// clock. `useTimeMinutes` is keyed by item category; Phase 3's item-driven
// eat action reuses the same table rather than declaring a second one.
// Phase 4 moved the freshness ladder and the bag-preservation baseline
// into the ROT block (one tuning surface for the whole spoilage model) —
// see ROT, which absorbs what was `freshnessThresholds`/`bagPreservation`
// here (the ladder itself is now ROT.stages + ROT.freshHours).
const INVENTORY_TUNING = {
  useTimeMinutes: { drink: 5, snack: 10, food: 10, meal: 25, _default: 10 },
  dropMinutes: 1,
  trashMinutes: 1,
  // Phase 2: one batch of container transfer verbs (take/put/take-all/
  // put-all) costs this much game time, applied once per batch through
  // advanceAndResolveMinutes — the same "act, then decay exactly once"
  // rule as the inventory verbs. Browsing a container is free, like
  // browsing the bag.
  containerVerbMinutes: 1,
  // Phase 6: unboxing and setting a hobby object in the room (inventory.place
  // → DESTROY_ITEM + SPAWN_OBJECT). A hobby purchase arrives as an item;
  // placing it is the last act and it costs the same kind of time as any
  // other inventory verb.
  placeMinutes: 5,
};

// --- NPC inventories (inventory overhaul Phase 8, D8) ---
// NPCs own things, seeded at creation from the character bible (job, income
// tier, interests) via NPC.seedNpcInventory (npc.js). Every id is a real
// ITEM_DEFS id — never a parallel representation (invariant 1). Key-item
// defs (apartment_keys/wallet/id_card/personal_phone) can't be taken by the
// player's room-search (stealth.js), so the stealable pressure is exactly
// the `beyond` items — the musician's guitar, the student's book.
const NPC_INVENTORY = {
  // Everyone's personal effects. All four are keyItem defs.
  baseKit: ['apartment_keys', 'wallet', 'id_card', 'personal_phone'],
  // One entry per OCCUPATION_POOL category — the thing their job puts in
  // their pocket, in order. A category with no entry skips this tier.
  byOccupation: {
    tech:      ['headphones'],
    food:      ['energy_drink'],
    health:    ['pain_reliever'],
    arts:      ['hobby_sketchpad'],
    service:   ['candle'],
    education: ['book'],
    finance:   ['book'],
    trades:    ['batteries', 'lightbulb'],
    media:     ['book'],
    legal:     ['book'],
    science:   ['book'],
  },
  // One possession that tracks income tier — what a snoop finds reads
  // differently for a high earner than for someone scraping by.
  byIncome: {
    high: ['wine'],
    mid:  ['chips'],
    low:  ['soda'],
  },
  // Interest names → a possession the NPC plausibly owns. The first
  // matching interest contributes one stack.
  byInterest: {
    gaming:      ['board_game'],
    music:       ['hobby_guitar'],
    reading:     ['book'],
    art:         ['hobby_sketchpad'],
    gardening:   ['hobby_houseplant'],
    cooking:     ['book'],
    fitness:     ['bottled_water'],
    photography: ['book'],
    coding:      ['phone_charger'],
    writing:     ['book'],
  },
  // A small personal snack stash so the hunger drive eats from the NPC's
  // OWN bag before touching the shared fridge (Phase 8 step 4). All
  // non-perishable so a bag-kept stash never rots.
  snackPool: ['granola_bar', 'chips', 'soda', 'instant_noodles', 'energy_drink'],
  snackCount: 2,
  // The eat drive keeps raiding sources until needs.hunger reaches this
  // or every reachable source is empty.
  eatUntilHunger: 65,
};

// --- NPC gift-giving (inventory overhaul Phase 8, D8) ---
// The gift_to_player drive makes a fond NPC hand the player something they
// own. Affection-gated + long cooldown (a gift is a gesture, not a drip),
// and only when they actually have a non-keyItem possession worth giving.
const NPC_GIFT_TUNING = {
  affectionThreshold: 0.35, // relPlayer.affection needed to even consider it
  // WAS 96, which meant "once per NPC per game" rather than the "~2 game days"
  // it says: a cooldown at or above CLOCK.ticksPerDay can never elapse against
  // a wrapped 0..47 stamp (D34 of the initiative plan, which found the same
  // defect on two of its own channels). Not this plan's drive, and fixed here
  // anyway because it is one number of the same broken class in the same file,
  // and because the class assertion in verify-i6 cannot be written while it
  // stands. Measured over 8 households x 3 residents x 7 days at affection
  // 0.9: one gift per 4.9 NPC-days at 20 against one per 15.3 at 96 — the
  // second figure being what "once, ever" looks like averaged out. A gesture,
  // not a drip, which is what the line below always intended.
  cooldownMinutes: 600,        // ~10 in-game hours between gift attempts
  baseChance: 0.02,         // per-tick probability once the gate passes
  // Categories the drive will gift, in preference order — the kinds of
  // thing you'd hand someone. Toiletries/cleaning/keys stay theirs.
  categoryOrder: ['gift', 'food', 'snack', 'drink', 'media', 'comfort'],
};

// --- Masturbation (Phase 3) ---
// The "Cum" action's effects and timing. Browsing AfterHours is free;
// masturbating slows time (TIME_DILATION.scales.masturbating = 3x); cumming
// is the discrete action that costs time and applies effects.
// The mood/energy/hygiene numbers are NOT here: they live in
// SITE_DEFS.afterhours.cumEffects (defs.computer.js) as effect-DSL lines,
// which is what doAfterHoursCum actually applies. They were duplicated
// here as moodGain/energyCost/hygieneCost and read by nothing — two
// tuning surfaces for one outcome, one of them silently inert.
// --- S4714: the game's random number generator (see ORBITAL) ---
// Real orbital elements for the fastest-known star in the galaxy, a member of
// the S-cluster whipping around Sagittarius A* (Peißker et al. 2020). Every
// random number the game draws is derived from propagating this orbit.
//
// The eccentricity is the whole reason it's fun: at e=0.985 the star's speed
// varies by a factor of ~130 over one orbit, from a few hundred km/s out at
// apoapsis to roughly 24,000 km/s — about 8% of lightspeed — as it slingshots
// through periapsis at 12.6 AU. Derived quantities (period, mean motion,
// periapsis speed) are computed from these in ORBITAL's s4714Elements rather
// than hard-coded, so changing a number here stays self-consistent.
const S4714_ORBIT = {
  semiMajorAxisAu: 840,      // ~12 year period against Sgr A*'s mass
  eccentricity: 0.985,       // periapsis 12.6 AU, apoapsis ~1670 AU
  centralMassSolar: 4.297e6, // Sagittarius A*
};

const MASTURBATION = {
  timeCostMinutes: 15,
  warmupSeconds: 3,
};

// --- AfterHours blend tuning (Site Expansion plan, Phase 1) ---
// Two real sources (Pornhub via superFetch, Eporner via direct fetch),
// blended into one seamless feed. Per-page counts are locked to Pornhub's
// webmasters page size — the API returns 30 videos per page (verified live
// 2026-08-05), and Eporner's per_page is set to match so both sources
// contribute equally. blendWeights is 50/50 as proposed; with equal page
// sizes it's effectively a no-op and the interleave does the work.
const AH_TUNING = {
  perPage: 30,                     // Pornhub webmasters page size (verified live); Eporner per_page matches
  searchTimeoutMs: 15000,          // cap on any single provider search call (hung requests must settle
                                   // so row/related fetches can degrade instead of hanging forever)
  blendWeights: { ph: 50, ep: 50 }, // proposed default — equal page sizes make this mostly a no-op
  dedupDurationTolerance: 0.10,    // ±10% duration match for cross-post dedup (plus a 5s floor)
  maxConsecutiveSameSource: 2,     // round-robin interleave run cap
  maxTotalPages: 50,               // cap on the stored total-pages number (both APIs report thousands)
  // Site Expansion Phase 2 — routed mini-site chrome. `routes` maps each
  // view to its fake address-bar path segment (home = bare root); `skeletonMs`
  // is the minimum display time for the browse skeleton so fast fetches don't
  // strobe the grid; `maxStack` caps the site's internal history stack.
  routes: {
    home:        { path: '',           label: 'Home' },
    category:    { path: 'category',   label: 'Category' },
    search:      { path: 'search',     label: 'Search' },
    player:      { path: 'watch',      label: 'Watch' },
    history:     { path: 'history',    label: 'History' },
    liked:       { path: 'liked',      label: 'Liked' },
    hotsingles:  { path: 'hotsingles', label: 'Hot Singles' },
    'hot-single': { path: 'hot-single', label: 'Hot Single' },
    '404':       { path: '',           label: 'Not Found' },
  },
  skeletonMs: 500,                   // minimum skeleton display time on browse fetches
  maxStack: 50,                      // cap on the site's internal history stack
  // Site Expansion Phase 3 — the player page's rails + seeded comments.
  relatedRowSize: 12,        // clips per "More Like This" / "Because you watched" row
  relatedKeywordsPerRow: 2,  // blended searches per related row (one per top keyword)
  upNextCount: 8,            // clips in the Up Next rail
  relatedStaleMs: 15000,     // a 'fetching' entry older than this is a dead fetch (orphaned
                             // at reload — world.computer persists wholesale in the save — or
                             // crashed mid-flight); the kick drops and refetches it instead of
                             // deadlocking the rail. Live fetches settle in ~1-3s, so 15s is
                             // comfortably one-sided.
  likedCap: 200,             // like-snapshot cap (Phase 6 persists the real list)
  historyCap: 100,           // world.afterHours.history cap (Phase 6; oldest dropped)
  searchHistoryCap: 20,      // world.afterHours.searchHistory cap (Phase 6; oldest dropped)
  toastMs: 3000,             // toast auto-dismiss delay (Phase 5 formalizes spawnToast)
  // Site Expansion Phase 5 — the campy ad network + live ticker.
  // `lifecycleMs` is the cadence of the SINGLE AfterHours lifecycle
  // interval that rotates ad slots and drifts the "watching now" counter
  // (started idempotently when the site renders/opens, self-clears on its
  // own tick once the site is no longer displayed — Locked decision 14).
  // The counter's baseline and the ads' rotation offsets are seeded
  // (deterministic per save); the per-tick drift is live animation only,
  // read back by renders as module state so re-renders never jump it.
  lifecycleMs: 3000,
  tickerDrift: { min: -380, max: 380 }, // per-tick delta for the live count
  tickerMinFloor: 500,                  // absolute floor the live count never dips below
  adRotateEveryTicks: 4,                // rotate ad slots every N lifecycle ticks (~12s),
                                        // so the visitor ad's countdown visibly counts down
                                        // (and resets on each re-show) before the ad rotates
  // Site Expansion Phase 4 — the homepage's discovery rows. `homeSections`
  // is the ordered row list; every section is just another blended search
  // (Locked decision 9), fetched by the fetchRow pipeline into
  // AFTERHOURS' module-level AH_rowCache. type 'carousel' renders as the big hero strip,
  // 'row' as a horizontal-scroll card row. `query: ''` means the site's
  // featured/default feed (no search term — matches the category browse's
  // 'featured' handling). `derived` sections compute their query at render
  // time (recommended = the top keyword across the session's watched
  // snapshots) and are skipped while there's nothing to derive from.
  homeSections: [
    { id: 'featured',    label: 'Featured',            type: 'carousel', query: '',          rowSize: 10 },
    { id: 'trending',    label: 'Trending Now',        type: 'row',      query: 'popular',   rowSize: 12 },
    { id: 'new',         label: 'New Releases',        type: 'row',      query: 'new',       rowSize: 12 },
    { id: 'top-rated',   label: 'Top Rated',           type: 'row',      query: 'top-rated', rowSize: 12 },
    { id: 'recommended', label: 'Recommended for You', type: 'row',      query: null, derived: true, rowSize: 12 },
  ],
  continueWatchingMax: 3,   // Continue Watching cards shown on home (session-only until Phase 6)
};

// --- AfterHours Site Expansion Phase 7 — Hot Singles ---
// The "Hot Singles in your area" section is a deterministic roster of FULL
// NPCs (the same createExternalNpc path escorts use — never vendor bots,
// external-world plan design invariant 6), generated from the world seed so
// the same save always shows the same six people. Unlike escorts this is
// NOT a paid service — "Say hi" is free and makes them ordinary NPCs (IM
// contact, invites over, romance, move-in all reuse existing machinery).
// `deviantSkew` is how far volatility/openness are re-rolled toward the
// high end at generation (Locked decision 19); `adultTraits` is the
// adult-leaning trait pool the deviant draw favours (a superset of
// PERSONALITY_TRAITS_POOL so validation everywhere stays green);
// `openingLines` is the seeded "Say hi" opener pool delivered as the first
// IM. The site-side profile copy (headlines/bios/interests) lives in
// afterhours.js as authored chrome, derived deterministically per npcId.
const AH_HOT_SINGLES_TUNING = {
  rosterSize: 6,             // deterministic slots hot_single_1..6
  deviantSkew: 0.35,         // how far the temperament re-roll pushes volatility/openness up
  adultTraits: [
    'flirtatious', 'confident', 'expressive', 'playful', 'impulsive', 'adventurous',
    'sensual', 'brazen', 'teasing', 'forward', 'magnetic', 'daring',
  ],
  openingLines: [
    'Heyyy. I saw you browsing AfterHours and figured I\'d skip the small talk.',
    'Okay, embarrassing, but you looked interesting. Wanna swap numbers?',
    'You like what you\'re watching? I can be way more interesting than a video.',
    'Hey. No weird stuff — I just noticed you. Coffee sometime?',
    'Not gonna lie, I was hoping you\'d find my profile.',
    'Hi. You already know my name. Here\'s the important part: I\'m fun.',
    'I never do this, but your profile made me laugh. So: hi.',
    'Heyy. I\'m in your area, and I\'m told that\'s a selling point.',
  ],
  // Phase 8: how strongly an NPC's baked `bible.deviantLevel` (0..1, absent
  // on cast roommates) amplifies the interruption volatility term. 0 = no
  // deviant effect; the multiplier applied to volatility is
  // `1 + weight * deviantLevel`, so weight 1.0 turns a 0.8-deviant Hot
  // Single into a 1.8x volatility factor (max 2x at deviant 1). Visible but
  // clampable — if playtest finds it obnoxious, dial it down and flag in
  // the Handoff.
  interruptionDeviantWeight: 1.0,
  // The published weighting BEHIND `bible.deviantLevel` — the temperament
  // mix COMPUTER's createExternalNpc bakes into every external NPC as
  // `clamp01(0.5 + 0.5 * Σ(axis × weight))`. It lived inline in that
  // function until the initiative plan's D11 needed the same number for the
  // roommate cast, who have no baked `deviantLevel` at all (measured null
  // for all 36 residents). SIM's npcDisinhibition is the shared reader; a
  // baked value still wins where one exists, so Hot Singles keep their
  // authored level and everyone else is scored on the same model rather
  // than on a second copy of these three numbers.
  //
  // Same reason npcCuriosity was extracted from two identical inline copies
  // in DRIVES: one definition, several callers, so they cannot drift.
  deviantWeights: { volatility: 0.4, openness: 0.35, assertiveness: 0.25 },
};

// --- Interruption (Phase 5): personality-driven, AI-generated
// "walked in on" events. Fires when the player cums while masturbating.
// Probability is rolled per eligible NPC (home, awake, not at work).
// Background pre-generation starts when the player enters the masturbating
// state so the bubble appears instantly if that NPC wins the roll.
const INTERRUPTION = {
  baseChance: 0.25,           // per eligible NPC per cum event
  doorMultiplier: { locked: 0.05, closed: 0.5, open: 1.0, unlocked: 1.0 },
  phaseMultiplier: {
    early_morning: 0.4, morning: 0.8, midday: 1.0,
    afternoon: 1.0, evening: 1.2, night: 0.3,
  },
  personalityWeights: {
    assertiveness: 0.3,       // high assert = more likely to enter
    conscientiousness: -0.4,  // high consc = less likely (respects doors)
    warmth: 0.15,            // high warmth = casual visitors
    volatility: 0.2,         // high vol = unpredictable movement
  },
  scheduleMultiplier: {
    commute_home: 1.5, morning: 1.3, leisure: 1.2,
    evening: 1.0, wind_down: 0.8, sleep: 0.1, work: 0,
    midday: 1.0, afternoon: 1.0, prep: 0.8,
  },
  // Vocation plan D13: the multiplier for an NPC who is home DURING their
  // work block (remote, hybrid-home, self-employed off a gig day). It stands
  // in for scheduleMultiplier.work, which is 0 because before this plan a
  // work block always meant the flat was empty of that person.
  //
  // 0.4 is a first pass, deliberately below the 1.2 of `leisure`: someone on
  // a call is present but occupied. Phase 3's verification measures the
  // event's overall rate against the pre-plan baseline and this is the dial
  // that holds it in band — if remote roommates make interruptions feel
  // constant, this number is the one to move.
  workingFromHomeMultiplier: 0.4,
  relationshipMultiplier: {
    highTension: 1.3, highAffection: 1.1, lowBoth: 0.8,
  },
  // Consequence tuning
  caughtTensionDelta: 0.15,       // base tension bump when caught
  caughtSuspicionDelta: 0.2,     // base suspicion bump when caught
  lockedTensionDelta: 0.03,       // minimal — they knocked, you had privacy
  sorryTensionReduction: 0.5,     // "Sorry!" reduces tension bump by this fraction
  ownItHighWarmthReduction: 0.5,  // high-warmth NPC reduces tension on "Own it"
  ownItLowWarmthIncrease: 1.5,   // low-warmth NPC increases tension on "Own it"
  ownItOpennessThreshold: 0.3,    // above this openness, "Own it" can reduce tension
};

// --- Work-block pay tuning (COMPUTER's work app). Focus scales pay by how
// rested/content the player is — a bad night or a bad mood costs money,
// not just narration. ---
const WORK_TUNING = {
  // 2026-08-17 audit (B5): floors raised — minEnergyFocus 0.4 → 0.55,
  // minMoodFocus 0.5 → 0.7. The old floors let focus collapse to 0.2 (a
  // 4-block gig ≈ 17 clicks) at low energy/mood, and even a NEUTRAL mood
  // scored 0.5 before any decay — the gig economy read as steep. A tired
  // player still works slower (progress ~0.385/click at the floor vs 1.0
  // fresh), but a gig no longer takes 5× its block count. See
  // bug-fix-audit-2026-08-17.md.
  minEnergyFocus: 0.55, maxEnergyFocus: 1.0,
  minMoodFocus: 0.7, maxMoodFocus: 1.0,
  // Phase 5 (decision F, 5.4): working from the phone is deliberately
  // worse — a config multiplier on top of focus, so phone gig progress is
  // slow and costs more energy per unit of progress (each block still
  // costs GIG_ENERGY_PER_BLOCK). The PC is where real throughput lives.
  phoneFocusMultiplier: 0.6,
};

// --- Tone / content directives. PROMPT injects these into every narrative
// prompt — closes the gap where CONTENT_CONFIG was captured at character
// creation and persisted to meta.contentConfig but never reached
// generation (see the former comment at ui.js's handleGenerateCast). ---
const TONE_PROFILES = {
  balanced: { styleDirective: 'Grounded, observational. Let moments breathe rather than escalating for effect.', escalationBias: 0.0, humorBias: 0.1 },
  dramatic: { styleDirective: 'Heighten subtext. Let silences and tension land heavy.', escalationBias: 0.3, humorBias: 0.0 },
  comedic: { styleDirective: 'Lean into the absurd and the awkward. Comic timing over gravity.', escalationBias: 0.0, humorBias: 0.5 },
  romantic: { styleDirective: 'Notice small gestures, proximity, and things left unsaid.', escalationBias: 0.1, humorBias: 0.15 },
  intense: { styleDirective: 'Raise the stakes. Keep conflict and consequence close to the surface.', escalationBias: 0.45, humorBias: 0.0 },
};

const CONTENT_DIRECTIVES = {
  profanity: { on: 'Characters may swear naturally when it fits their voice.', off: 'Avoid profanity.' },
  substance: { on: 'Drinking, smoking, and similar habits may appear naturally.', off: 'Keep substance use off-page.' },
  romance: { on: 'Romantic and physically intimate material may develop naturally between consenting characters.', off: 'Keep romantic content light and non-explicit.' },
  conflict: { on: 'Arguments and interpersonal conflict may escalate realistically.', off: 'Keep conflict low-key and quickly defused.' },
  mature: { on: 'Mature themes and adult situations are permitted when the scene calls for them — write them like an adult novel would, not a summary of one.', off: 'Keep content non-explicit; fade to black rather than describing explicit material.' },
};

// --- NPC Autonomy drives (P7). Data-driven definitions that fire during
// resolveTick as trusted-producer effects — zero LLM, deterministic.
// Each drive has: a need gate (when it fires), a weight (how often), an
// action (what it does), and optional conditions. Drives produce NPC
// effects via the same applyEffects pipeline, plus NPC-to-NPC IM texts,
// NPC reactions to player presence, and NPC chore behavior.
//
// Need gates use a threshold + direction: { need: 'hunger', op: 'below',
// threshold: 30 } fires when npc.needs.hunger < 30. Multiple gates = AND.
// weight is the per-tick probability the drive fires once gates pass.
// cooldownMinutes prevents the same drive from firing again too soon.
//
// --- `timeOfDay` (continuous-behavior-engine Phase 3, D4) ----------------
// The former `blockFilter` was a HARD gate: a drive whose current schedule
// block was not in the list was not even scored. D4 replaces the gate with
// a scoring weight — the drive stays reachable everywhere, but scores
// COGNITION.routineOutOfBand outside the time-of-day windows its declared
// blocks occupy and its `blockAppeal` multiplier inside them. Each name in
// `timeOfDay` maps to real minute ranges through BLOCK_TIME_OF_DAY (never a
// silently dropped name — the phase's verification greps every set). The
// same field on OVERTURE_DEFS entries is still a hard gate; that table's
// conversion belongs to npc-initiative-retiming-plan's D3.
//
// --- `utility` (npc-cognition-plan.md Phase 1) ---------------------------
// Every entry also carries a `utility` block, which is what cognition.js's
// scoreDrive reads:
//
//   utility: {
//     baseAppeal: 0.30,                                  // required — the floor this scores at
//     need:   { need: 'hygiene', below: 45 },            // rises as the need falls under `below` (D6)
//     signal: { signal: ['dirty_dishes'], scale: 0.8 },  // at the NPC's own attenuated intensity (D8)
//     temperamentWeights: { conscientiousness: 0.4 },    // 1 + Σ(axis × weight) (D7)
//     blockAppeal: { morning: 1.2 },                     // in-window multiplier, default 1 (D4)
//     holdMinutes: 60,                                   // required — how long the pursuit is held (D4; was holdTicks 2)
//   }
//
// `weight` IS RETIRED (D1, Phase 2). Selection is `utility.baseAppeal` scored
// against needs, signals, personality and schedule; nothing reads `weight` any
// more. The values are left in place as the historical record of what each
// drive's probability used to be — Phase 5 tunes `baseAppeal` against the
// measured action rate and the old numbers are the only thing to compare with.
//
// THE NEED GATES ARE GONE (D14, Phase 2). D6 turns a need gate into a score
// term: `utility.need` declares the point at which a need starts to matter and
// the contribution rises as the need falls below it. `sleep_recover` and
// `seek_comfort` were dead for the entire life of the drive system precisely
// because a threshold can sit outside the range its need ever reaches (energy
// floors at 28 against a gate of 20; comfort floors at exactly its gate of 40),
// and a curve cannot. Phase 1 could not delete them while `evaluateDrives` still
// selected on `gates`; Phase 2 replaced that selection and deleted them in the
// same edit.
//
// `gates` stays for the hard exclusions that are NOT preferences — the SIGNAL
// gates on `clean_common` and `investigate_smell`, which are about the action
// being possible at all. You cannot tidy mess you cannot perceive.
//
// --- `utility.temperamentWeights` (Phase 3) ------------------------------
// PERSONALITY IS AUTHORED HERE, and only here. `1 + Σ(temperament[axis] ×
// weight[axis])` scales a drive's whole appeal, which is the idiom
// INTERRUPTION.personalityWeights established and SNOOP_TUNING.chanceModifiers
// copied — deliberately not a third shape. cognition.js's scoreDrive is the one
// consumer; verify-c3 asserts there is no second.
//
// What the axes mean, as used across this table:
//   conscientiousness  chores and self-maintenance (+), napping and snooping (-)
//   warmth             seeking, keeping and giving to company (+)
//   assertiveness      being the one who starts it, rather than waiting (+)
//   openness           curiosity: novelty, other people's phones, odd smells (+)
//   volatility         restlessness and self-soothing (+)
//   selfAwareness      noticing your own state — its FIRST mechanical reader in
//                      the game is sleep_recover below (Plan 0's audit kept this
//                      axis because the character studio renders it; nothing has
//                      ever acted on it)
//
// Two rules the authoring follows, both learned from what the numbers do:
//
//  1. A weight is a preference, never a gate. The sum stays well inside
//     [-0.7, +0.7], so `1 + Σ` never approaches COGNITION.temperamentFloor and
//     the floor stays a safety net rather than a load-bearing clamp.
//  2. A drive whose `baseAppeal` sits just over COGNITION.actionThreshold has
//     no room for one. On those, ANY weight decides which half of the cast
//     never performs the drive at all, and where that line falls barely moves
//     with the weight's size — so it is a rate decision (Phase 5's
//     `baseAppeal` pass), not a personality one. `react_to_player` is the drive
//     this rules out; `do_laundry` is the one where the split is the point.
//
// --- `leaves` (Phase 4 — traces) ----------------------------------------
// The STANDING-signal counterpart of `emitsSignal`. `emitsSignal` declares
// the transient a drive makes; `leaves` declares the mess it makes, and the
// two are applied side by side in DRIVES (resolveStandardDrive next to the
// emission, tryEatFood next to its cooking smell). Shape:
//
//   leaves: { objDefId: { stateKey: steps } }
//
// `steps` (default 1) advances that object's state along its def-declared
// ladder — one level per `steps`, saturating at the last value — so repeated
// acts ACCUMULATE (clean → few → many) instead of resetting to a fixed value
// that would lie after the first meal. The resulting signal is DERIVED by
// SIGNALS' deriveStandingSignals from the dirty state, so a `leaves` trace
// needs no stored record and no cleanup path: clear the mess and the signal
// stops being derivable. Rooms' derived cleanliness is refreshed on the same
// D7 hook a player action that dirties an object uses, so an NPC-dirtied
// room stops reading clean to the cleanliness/mood systems.
//
// --- `expresses` (initiative plan Phase 1 — the expression layer) --------
// The third member of the footprint family, and the one that is about the
// PERSON rather than the act. `emitsSignal` is what the act sounds like,
// `leaves` is what it leaves behind, `expresses` is what the NPC's mood does
// to the room while they are doing it. All three are applied side by side in
// DRIVES so a drive's whole footprint reads in one place.
//
//   expresses: { signal: 'sighing', when: { mood: { below: -0.15 } },
//                intensity: SIGNALS_EMIT.sighing }
//
// or an ARRAY of those, in priority order — the FIRST rule whose condition
// holds is the one that fires, and at most one fires per act. Ordering is how
// a drive says "slam if it has been a genuinely bad day, otherwise sigh"
// without the two competing.
//
// D3: an expression RIDES ALONG. It is not a decision, it costs no tick, it
// sets no cooldown and it opens no pursuit — an NPC can sigh while doing
// laundry and cannot walk over to you while doing laundry. An expression that
// starts consuming a tick would break Plan 3's one-action-per-tick guarantee,
// and verify-i1 asserts it does not.
//
// `when` is REQUIRED and fails closed: an expression with no condition, or
// one naming a source DRIVES' EXPRESSION_SOURCES does not know, never fires.
// An unconditional noise is what `emitsSignal` is for. Phase 1 ships one
// source — `mood`, the only motivation source measured alive (see the plan's
// Evidence) — and the later phases add the rest as they make them live.
const DRIVE_DEFS = {
  eat: {
    // The `hunger below 35` gate that used to sit here is now utility.need
    // (D6/D14). Plan 0's D11 had raised it 25 → 35 because with no passive
    // hunger restore this drive is the only thing that feeds an NPC; the curve
    // starts higher still, at 45, for the same reason.
    gates: [], weight: 0.5,
    // 'wind_down' added and weight raised 0.3 → 0.5: a drive can only fire on
    // a tick where the NPC is neither asleep nor in transit, and NPCs move
    // rooms constantly during evening blocks, so the effective firing rate is
    // far below the nominal weight. Measured at 0.3 the cast averaged one meal
    // every three days.
    timeOfDay: ['morning', 'evening', 'wind_down', 'leisure', 'midday'],
    effects: [],
    // 8 → 14 in Phase 5, and it is a CONSEQUENCE of the cooldown rollover bug
    // fix (see isOnCooldown in drives.js), not a judgement about appetite: the
    // bug was silently suppressing 51.5% of all late-day cooldown stamps, so
    // when the wrap fix landed the raw eat rate overshot the target at ~35% of
    // all actions. The longer cooldown plus the base/block cuts below are the
    // measured compensation that brought the total back to the Phase 5 target.
    cooldownMinutes: 420,
    isEatDrive: true,
    // Phase 4 (traces): the standing-signal half of this drive's footprint.
    // A kitchen meal is the NPC's cooking — dishes in the sink, grease on
    // the stove, scraps in the bin. Applied ONLY on the from-kitchen path
    // (tryEatFood, right beside the cooking-smell emission): a snack eaten
    // out of their own bag leaves nothing perceivable, exactly like a bag
    // snack emits no cooking smell. The bin's fill is what gives an untouched
    // house a rot smell to investigate within a week (the fridge's own stock
    // rots on a month's timescale, preserved ×4).
    // Food-overhaul Phase 4 (D9): the sink footprint is a REAL dish map now
    // (plate + fork for the kitchen meal) — applyDriveLeaves adds the units
    // to the object's obj.dishes map instead of stepping the old abstract
    // clean→few→many ladder.
    leaves: {
      sink_kitchen: { dishes: { plate: 1, fork: 1 } },
      stove: { burner: 1 },
      trash_kitchen: { fill: 1 },
    },
    // The kitchen is where a mood has something to bang. Ordered: a really
    // bad day slams a cupboard, an ordinary good one hums over the stove,
    // and everything between the two is silent. Applied on the SAME
    // from-kitchen path as the cooking smell and the mess above — someone
    // eating crisps out of their own bag in their bedroom expresses nothing,
    // exactly as they emit nothing and leave nothing.
    expresses: [
      { signal: 'cabinet_slam', when: { mood: { below: EXPRESSION_MOOD.veryLow } }, intensity: SIGNALS_EMIT.cabinetSlam },
      { signal: 'humming',      when: { mood: { above: EXPRESSION_MOOD.high } },    intensity: SIGNALS_EMIT.humming },
    ],
    // Fallback (kitchen genuinely empty) keeps the old cook flavor.
    activityOverride: 'cooking',
    fallbackActivityOverride: 'scrounging',
    eventTemplate: '{name} made themselves something to eat.',
    fallbackEventTemplate: '{name} scrounged what was left in the cupboards.',
    eventMood: 0.03,
    // `below` sits above the old gate of 35 so that appetite ramps up before
    // the point the gate used to switch on — the whole shape of D6. Observed
    // hunger range 0..79, so this clears actionThreshold from roughly 26 down.
    //
    // No temperamentWeights, and none is coming: hunger is hunger, and personality
    // belongs to what you eat rather than to whether you do. verify-c1 uses this
    // entry as its control for "a drive with no weights is unaffected by
    // temperament", so it is also the table's proof that the term is opt-in.
    utility: {
      // baseAppeal 0.30 → 0.27 and the morning/evening blocks 1.2 → 1.05,
      // midday 1.1 → 1.0, all in Phase 5, all by measurement: with the cooldown
      // rollover bug fixed, eat's need curve alone put it at ~35% of all actions
      // (fire at hunger ≈ 42, and hunger sits at 0 for 58.8% of at-home calls —
      // a full belly does not dull the base term). The three changes together
      // bring eat to 27% of actions at the Phase 5 target rate. baseAppeal is
      // NOT zeroed because a sated NPC must still eat eventually: blockAppeal
      // and holdMinutes already vary meal size, and zeroing would make the drive
      // read as dead on the instrument.
      baseAppeal: 0.27,
      need: { need: 'hunger', below: 45 },
      holdMinutes: 60, // was holdTicks 2 — 2 × 30-min ticks
      blockAppeal: { morning: 1.05, midday: 1.0, evening: 1.05, wind_down: 0.8 },
    },
  },

  shower: {
    gates: [], weight: 0.3,   // was `hygiene below 30` — now utility.need (D14)
    // continuous-behavior-engine Phase 3 (D2): wraps self.shower for a real
    // object anchor (ACTION_ANCHOR_OBJS' 'shower') instead of room-centroid.
    // holdMinutes below still governs the commitment's HELD duration — only
    // the stand-point is borrowed, not self.shower's own (player-paced)
    // timeCost.
    actionId: 'self.shower',
    timeOfDay: ['morning', 'wind_down', 'leisure'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'hygiene', delta: 40 } }],
    activityOverride: 'showering',
    eventTemplate: '{name} took a shower.',
    eventMood: 0.02,
    cooldownMinutes: 300,
    // Singing in the shower, more or less. The running water is already the
    // loudest transient in the game (0.85), so this is not what tells you
    // someone is in there — it is what tells you how their day is going.
    expresses: { signal: 'humming', when: { mood: { above: EXPRESSION_MOOD.high } }, intensity: SIGNALS_EMIT.humming },
    // Showering makes the NPC undressed during the activity — see clothing state
    // Correctness plan Phase 4. `restoresClothing: true` used to sit here
    // alongside setsClothing, and the two cancelled each other out: both flags
    // came off the SAME driveResult in the SAME tick, so resolveTick set
    // clothing to 'towel' and then immediately overwrote it with 'dressed'
    // three lines later. The towel state was never observable by anything —
    // not the prompt, not the peep system, not the floor plan. Reversion is
    // now handled generically by TRANSIENT_CLOTHING on the NEXT tick, which
    // is what the old comment claimed was happening.
    setsClothing: 'towel',
    meters: [['showers', 1], ['waterHeating', 1]],
    emitsSignal: { signal: 'running_water', intensity: SIGNALS_EMIT.shower },
    // Observed hygiene range 0..69. Clears actionThreshold from roughly 35 down,
    // so a grubby NPC wants a shower before the old gate of 30 would have let
    // them have one.
    //
    // Phase 3: conscientiousness is where the grooming standard lives — a
    // fastidious NPC showers before they are grubby, a slovenly one waits until
    // the need does the arguing. Deliberately the same weight as wash_up, so
    // personality moves WHEN they wash and never which way they wash.
    //
    // 0.20 rather than the 0.25 the other self-care drives carry, and the
    // difference is measured: at 0.25 the morning multiplier takes a maximally
    // conscientious NPC to 0.406 with hygiene at 100, i.e. above actionThreshold
    // with nothing to wash off. A drive that clears the bar at a satisfied need
    // is a gate stuck open — the same defect verify-c1 pins for sleep_recover —
    // so the weight is capped where the need stays load-bearing for everybody.
    // verify-c3 asserts this for every drive that declares a need curve.
    utility: {
      baseAppeal: 0.25,
      need: { need: 'hygiene', below: 45 },
      temperamentWeights: { conscientiousness: 0.20 },
      holdMinutes: 30, // was holdTicks 1 — 1 × 30-min ticks
      blockAppeal: { morning: 1.3, wind_down: 1.1, leisure: 0.9 },
    },
  },
  // Correctness plan Phase 4 (D10 follow-on). The `shower` drive is
  // facility-gated on bathroom plumbing (MAINTENANCE.npcDecayActions), and
  // the apartment OPENS with its facilities broken — so for the whole early
  // game there is no shower. That was survivable while a passive block-keyed
  // restore existed; D10 deleted it, which would have left hygiene sliding to
  // zero with no recovery path at all during the exact stretch of the game
  // the player spends repairing the place.
  //
  // Washing at a sink needs no working plumbing fixture and is deliberately
  // worse than a shower: half the restore, a longer cooldown, a lower gate,
  // and no towel state or utility metering. Disrepair still costs you a
  // household of visibly grubby roommates — it just no longer bottoms out at
  // an unrecoverable zero where every NPC reads identically.

  wash_up: {
    gates: [], weight: 0.25,  // was `hygiene below 25` — now utility.need (D14)
    timeOfDay: ['morning', 'wind_down', 'leisure', 'evening'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'hygiene', delta: 20 } }],
    activityOverride: 'washing up at the sink',
    eventTemplate: '{name} washed up as best they could.',
    eventMood: -0.01,
    cooldownMinutes: 420,
    // The consolation-prize version of a shower, and it reads like one.
    expresses: { signal: 'sighing', when: { mood: { below: EXPRESSION_MOOD.low } }, intensity: SIGNALS_EMIT.sighing },
    // Deliberately worse than a shower in appeal as well as in effect, so an
    // NPC with a working bathroom prefers the shower and one without still has
    // a recovery path. Clears actionThreshold from roughly hygiene 25 down.
    utility: {
      baseAppeal: 0.20,
      need: { need: 'hygiene', below: 35 },
      temperamentWeights: { conscientiousness: 0.20 },   // as shower — see there
      holdMinutes: 30, // was holdTicks 1 — 1 × 30-min ticks
    },
  },

  sleep_recover: {
    // The `energy below 20` gate is deleted (D14). Energy is observed to range
    // 28..100 — it never once reached 20, so this drive fired zero times in 84
    // in-game days. That is the defect D6 exists to make structurally
    // impossible, not a threshold to nudge.
    gates: [],
    weight: 0.4,
    // continuous-behavior-engine Phase 3 (D2): wraps self.nap — a bed/sofa
    // anchor instead of room-centroid. holdMinutes below still governs the
    // held duration, not self.nap's own ACTION_TUNING.napMinutes.
    actionId: 'self.nap',
    timeOfDay: ['leisure', 'wind_down'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'energy', delta: 25 } }],
    activityOverride: 'napping',
    // No `leaves`. The obvious trace — napping in a bedroom leaves the bed
    // unmade — measured dead: 26 nap fires across 12 households × 7 days and
    // not one happened in a bedroom (the schedule parks NPCs in common rooms
    // at nap time). A trace that can never fire is the same defect class as a
    // drive nobody performs; the mechanism is generic, so if a future phase
    // puts NPCs in bedrooms during the day, this is one config line away.
    eventTemplate: '{name} crashed for a nap.',
    eventMood: 0.05,
    cooldownMinutes: 480,
    // Lying down at the end of a bad one. This drive and seek_comfort carry
    // the two lowest mean moods in the table (−0.015 and 0.006 against a cast
    // mean of 0.109), so the low band actually catches them.
    expresses: { signal: 'sighing', when: { mood: { below: EXPRESSION_MOOD.low } }, intensity: SIGNALS_EMIT.sighing },
    // D9, one of the two drives that could never fire. Energy is observed to
    // range 28..100 — it NEVER reaches the gate of 20 above, which is why this
    // fired zero times in 84 in-game days. `below: 50` makes the curve clear
    // actionThreshold from about energy 36 down, comfortably inside the range
    // the need actually occupies, while a rested NPC at 50+ scores 0.20 and
    // does not nap. The gate above is what Phase 2 deletes.
    // Phase 3: the two axes pull against each other on purpose. The disciplined
    // push through the afternoon slump (conscientiousness -); the self-aware
    // notice they are running on empty and lie down (selfAwareness +). This is
    // the FIRST mechanical reader `selfAwareness` has ever had — Plan 0's audit
    // kept the axis because the character studio renders it, which is an
    // argument for wiring rather than for deleting.
    utility: {
      baseAppeal: 0.20,
      need: { need: 'energy', below: 50 },
      temperamentWeights: { conscientiousness: -0.20, selfAwareness: 0.20 },
      holdMinutes: 90, // was holdTicks 3 — 3 × 30-min ticks
      blockAppeal: { wind_down: 1.2 },
    },
  },

  seek_company: {
    gates: [],   // was `social below 25` — now utility.need (D14)
    weight: 0.25,
    timeOfDay: ['leisure', 'evening', 'wind_down'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'social', delta: 15 } }],
    activityOverride: 'hanging out',
    eventTemplate: '{name} came out to the common area for some company.',
    eventMood: 0.04,
    cooldownMinutes: 180,
    moveToCommon: true,
    // Coming out to where the people are because the room you were in was
    // not helping. The sigh lands in the COMMON room they moved to, which is
    // where the player is most likely to be — this is the highest-traffic
    // carrier of the low band by some way.
    expresses: { signal: 'sighing', when: { mood: { below: EXPRESSION_MOOD.low } }, intensity: SIGNALS_EMIT.sighing },
    // Observed social range 0..100. Clears actionThreshold from about 36 down.
    //
    // Phase 3: warmth wants the company, assertiveness is what gets you off the
    // bed and into the room where it is. Weighted heavier than
    // chat_with_roommate on both, because this one costs something: you have to
    // go and find people rather than talk to whoever is already here.
    utility: {
      // baseAppeal 0.20 → 0.22 in Phase 5, by measurement: with the cooldown
      // bug fixed and eat retuned, seek_company had drifted to 10% of actions
      // and felt thin — social is a first-class need, and the 0.02 raise keeps
      // the need's champion drive visible without crowding the mix.
      baseAppeal: 0.22,
      need: { need: 'social', below: 50 },
      temperamentWeights: { warmth: 0.35, assertiveness: 0.20 },
      holdMinutes: 60, // was holdTicks 2 — 2 × 30-min ticks
      blockAppeal: { evening: 1.1, leisure: 1.1 },
    },
  },

  // --- Chore behavior ---

  clean_common: {
    // Perception plan Phase 5: gated on actually SEEING mess, rather than
    // firing on a bare weight roll wherever the NPC happened to be. Sight
    // doesn't propagate, so this can only fire in a room whose mess they are
    // standing in — which is also the room cleansRoom will clean. An NPC no
    // longer tidies a room that was already clean.
    gates: [{ signal: ['dirty_dishes', 'clutter', 'unmade_bed'], op: 'above', threshold: 0.25 }],
    weight: 0.35,
    timeOfDay: ['morning', 'leisure', 'wind_down'],
    effects: [],
    activityOverride: 'cleaning up',
    eventTemplate: '{name} tidied up the {room}.',
    eventMood: 0.03,
    cooldownMinutes: 600,
    cleansRoom: true,
    // Cleaning up after other people is the classic place for both halves of
    // this: the resentful bang and the contented pottering. Same ordering as
    // `eat` — the worse day wins where both could apply.
    expresses: [
      { signal: 'cabinet_slam', when: { mood: { below: EXPRESSION_MOOD.veryLow } }, intensity: SIGNALS_EMIT.cabinetSlam },
      { signal: 'humming',      when: { mood: { above: EXPRESSION_MOOD.high } },    intensity: SIGNALS_EMIT.humming },
    ],
    // The signal gate above STAYS a hard exclusion — you cannot tidy mess you
    // cannot perceive, and cleansRoom cleans the room the NPC is standing in.
    // `utility.signal` scores on top of it: the worse the mess looks, the more
    // it nags. Perceived intensity is already attenuated for this NPC (D8), so
    // an NPC across the flat is pulled less hard than one in the kitchen.
    //
    // The one drive that declared temperamentWeights in Phase 1, as the proof
    // that the D7 mechanism works end to end (verify-c1 asserts two NPCs
    // differing only in conscientiousness score it differently). Phase 3 authored
    // the rest of the table around it and added the warmth term the plan's own
    // data model sketched: tidying the common room is partly about the standard
    // you hold yourself to and partly about the people you share it with.
    utility: {
      baseAppeal: 0.20,
      signal: { signal: ['dirty_dishes', 'clutter', 'unmade_bed'], scale: 0.8 },
      temperamentWeights: { conscientiousness: 0.4, warmth: 0.1 },
      holdMinutes: 60, // was holdTicks 2 — 2 × 30-min ticks
      blockAppeal: { morning: 1.2 },
    },
  },

  do_laundry: {
    gates: [], weight: 0.05,
    // continuous-behavior-engine Phase 3 (D2): wraps self.laundry — the
    // washer's own object anchor (source:{kind:'object'}, so no decor-table
    // fallback needed) instead of room-centroid. holdMinutes below still
    // governs the held duration, not self.laundry's own timeCost.
    actionId: 'self.laundry',
    timeOfDay: ['morning', 'leisure'],
    effects: [],
    activityOverride: 'doing laundry',
    eventTemplate: '{name} started a load of laundry.',
    eventMood: 0.02,
    cooldownMinutes: 900,
    emptiesHamper: true,
    meters: [['laundry', 1], ['devices', 0.5]],
    emitsSignal: { signal: 'machine_running', intensity: SIGNALS_EMIT.laundry },
    // The plan's own example of the split: an NPC can hum WHILE doing
    // laundry, and cannot walk over to you while doing laundry.
    expresses: { signal: 'humming', when: { mood: { above: EXPRESSION_MOOD.high } }, intensity: SIGNALS_EMIT.humming },
    // No need and no signal drives this — laundry is a chore that simply wants
    // doing — so base appeal is the only lever and has to carry the whole
    // score. It clears actionThreshold in the morning block and not otherwise,
    // which makes laundry a morning job; the 900-minute cooldown is what keeps it
    // rare, rather than the near-zero weight it used to rely on.
    //
    // Phase 3: the purest chore in the table, and therefore the clearest place
    // for conscientiousness to show — nothing else motivates laundry, so the
    // whole of "does this person do it" is who they are. Because base × the
    // morning multiplier lands just over actionThreshold, the practical effect
    // is that roughly the conscientious half of the cast does laundry and the
    // other half does not. That split is the intended reading of "chores against
    // conscientiousness"; it barely moves with the size of the weight (see rule
    // 2 in the header), so the weight is set for a visible effect size rather
    // than to place the line.
    utility: {
      baseAppeal: 0.36,
      temperamentWeights: { conscientiousness: 0.35 },
      holdMinutes: 90, // was holdTicks 3 — 3 × 30-min ticks
      blockAppeal: { morning: 1.2, leisure: 0.85 },
    },
  },

  // --- Social: NPC-to-NPC interaction ---

  chat_with_roommate: {
    gates: [],   // was `social below 40` — now utility.need (D14)
    weight: 0.15,
    timeOfDay: ['leisure', 'evening', 'wind_down', 'morning'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'social', delta: 20 } }],
    activityOverride: 'chatting with a roommate',
    cooldownMinutes: 360,
    npcToNpc: true,
    emitsSignal: { signal: 'voices', intensity: SIGNALS_EMIT.voices },
    // Produces a small rel delta between the two NPCs
    relDelta: { trust: 0.02, affection: 0.02 },
    // A lower bar than seek_company: chatting to whoever is already here costs
    // nothing, where seeking company means going and finding it. Clears
    // actionThreshold from about social 41 down.
    //
    // Phase 3: the same pair as seek_company, scaled down for the same reason
    // the base is — there is nobody to go and find, they are standing right
    // there, so it takes less warmth and much less nerve.
    utility: {
      // baseAppeal 0.18 → 0.20 in Phase 5, by measurement — same session and
      // same reasoning as seek_company: social was underrepresented in the mix
      // after the cooldown fix retune. The lower-bar version stays 0.02 below
      // seek_company's 0.22, preserving the authored gradient.
      baseAppeal: 0.20,
      need: { need: 'social', below: 60 },
      temperamentWeights: { warmth: 0.30, assertiveness: 0.15 },
      holdMinutes: 60, // was holdTicks 2 — 2 × 30-min ticks
      blockAppeal: { evening: 1.1, leisure: 1.1 },
    },
  },

  // --- Social: NPC-to-player IM ---
  // GONE in the initiative plan's Phase 4, and deliberately not replaced here.
  // `text_player` is an OVERTURE_DEFS entry now (D8): the same act, scored by
  // the same scorer, but motivated by a reason the NPC actually has instead of
  // by a social need, and saying something about that reason instead of one of
  // seven strings about the wifi. The id had to leave this table or it would
  // have collided — candidateDef checks DRIVE_DEFS first, so a duplicate would
  // have silently made the overture unreachable.
  //
  // What it cost: an NPC who is simply LONELY no longer texts, because D5 keeps
  // `utility.need` off every overture. The in-person half of that need still
  // has `seek_company` and `chat_with_roommate`. See the plan's Phase 4 handoff
  // for the measured rate and the open question it parks.

  // --- Reactions to player presence ---

  react_to_player: {
    gates: [],
    weight: 0.2,
    timeOfDay: ['leisure', 'evening', 'wind_down', 'morning'],
    effects: [],
    cooldownMinutes: 240,
    reactsToPlayer: true,
    // Mood-gated: if NPC mood is low, they're more likely to be curt
    // If mood is high, they're warm. Effects are small rel deltas.
    moodThresholds: {
      low: -0.2,
      high: 0.3,
    },
    relDeltaLow: { tension: 0.01 },
    relDeltaHigh: { affection: 0.01 },
    // Acknowledging someone who just walked in is close to automatic, so this
    // sits above actionThreshold unconditionally — which is only safe because
    // Phase 2 gave it a candidacy condition (COGNITION's DRIVE_CANDIDACY): the
    // player has to actually be in the room. Without it this was a candidate on
    // every tick at a flat 0.42 and its resolver silently did nothing on almost
    // all of them, which cost a wasted weight roll before and would cost a whole
    // pursuit now.
    //
    // NO temperamentWeights, DELIBERATELY (Phase 3), and this is the one entry
    // where that is a decision rather than an absence. "Unconditionally" above
    // means base 0.42 against a threshold of 0.40 — 0.02 of headroom. A warmth
    // weight of any size therefore does not make cold NPCs greet you less; it
    // makes a third of the cast never greet you at all, and moving the weight
    // barely moves where that line falls. Whether a cold roommate looks up when
    // you walk in is worth having, but it is bought with `baseAppeal`, which is
    // Phase 5's lever. See the header's rule 2.
    utility: {
      baseAppeal: 0.42,
      holdMinutes: 30, // was holdTicks 1 — 1 × 30-min ticks
    },
  },

  // NPC Overhaul Phase 6 — comfort + stimulation drives

  seek_comfort: {
    // The `comfort below 40` gate is deleted (D14). Plan 0 had already moved it
    // once (25 → 40) for exactly this reason and it was still wrong: comfort is
    // observed to floor at EXACTLY 40 against a strict `<`, so the drive missed
    // by one unit and fired zero times in 84 in-game days. A threshold that has
    // to be re-guessed every rebalance is the wrong mechanism; the curve in
    // utility.need is the fix.
    gates: [],
    weight: 0.2,
    timeOfDay: ['leisure', 'wind_down', 'evening', 'morning'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'comfort', delta: 15 } }],
    activityOverride: 'relaxing',
    cooldownMinutes: 360,
    moveToComfort: true,
    eventTemplate: '{name} settles into the couch, looking comfortable.',
    eventMood: 0.03,
    // The sound of someone dropping onto a couch at the end of it. Pairs
    // with sleep_recover — same "stop and recover" pair Phase 3 authored the
    // temperament weights around, and they should sound the same.
    expresses: { signal: 'sighing', when: { mood: { below: EXPRESSION_MOOD.low } }, intensity: SIGNALS_EMIT.sighing },
    // D9, the other drive that could never fire. Comfort is observed to range
    // 40..74 against a gate of `below 40` with a STRICT `<` — the floor is
    // exactly the threshold, so it missed by one unit for the entire life of
    // the drive system. `below: 70` puts the curve properly inside the range:
    // it clears actionThreshold from about comfort 48 down, which is a real
    // slice of where comfort actually sits, and a contented NPC at 70 scores
    // its base and stays where they are. The gate above is what Phase 2 deletes.
    // Phase 3: self-soothing. A volatile NPC reaches for the couch when the day
    // has been a lot; a disciplined one is slower to decide they have earned it.
    // Same pairing as sleep_recover with the axes swapped around — both are
    // "stop and recover", and they should not read as the same person's habit.
    utility: {
      baseAppeal: 0.18,
      need: { need: 'comfort', below: 70 },
      temperamentWeights: { volatility: 0.25, conscientiousness: -0.15 },
      holdMinutes: 90, // was holdTicks 3 — 3 × 30-min ticks
      blockAppeal: { wind_down: 1.15, leisure: 1.1 },
    },
  },

  seek_stimulation: {
    gates: [],   // was `stimulation below 25` — now utility.need (D14)
    weight: 0.2,
    // D15: 'afternoon' is not a block any SCHEDULES template defines — it was
    // dead weight in this filter. The real block names are sleep/morning/
    // prep/commute/work/commute_home/midday/evening/leisure/wind_down/meal.
    timeOfDay: ['leisure', 'evening', 'wind_down', 'midday'],
    effects: [{ type: 'ADJUST_NEED', params: { who: 'self', need: 'stimulation', delta: 20 } }],
    activityOverride: 'looking for something to do',
    cooldownMinutes: 300,
    eventTemplate: '{name} seems restless, looking for something to occupy themselves.',
    eventMood: -0.02,
    // Restless and not enjoying it. `chat_with_roommate` is deliberately
    // silent by comparison: it already emits `voices`. (The other quiet one
    // used to be `text_player`, now an overture — someone on their phone.)
    expresses: { signal: 'sighing', when: { mood: { below: EXPRESSION_MOOD.low } }, intensity: SIGNALS_EMIT.sighing },
    // Observed stimulation range 0..67. Clears actionThreshold from about 34
    // down, so restlessness builds before it shows rather than switching on.
    //
    // Phase 3: the plan names this one specifically as openness's drive — an
    // open NPC goes looking for something new, an incurious one is content to
    // be bored. Volatility rides along at half the weight: restlessness is
    // partly curiosity and partly not sitting still.
    utility: {
      // baseAppeal 0.18 → 0.20 in Phase 5, by measurement — the restlessness
      // champion was being beaten to the punch by the same-term social drives;
      // the 0.02 raise restores stimulation's place in the mix (66/679 = 9.7%
      // at the Phase 5 measurement) without making the need curve redundant.
      baseAppeal: 0.20,
      need: { need: 'stimulation', below: 50 },
      temperamentWeights: { openness: 0.35, volatility: 0.20 },
      holdMinutes: 60, // was holdTicks 2 — 2 × 30-min ticks
      blockAppeal: { leisure: 1.1, evening: 1.05 },
    },
  },

  // --- Phase 6: NPC peeps on player during vulnerable states ---
  // Condition-gated by personality: high openness + low conscientiousness
  // (curious + boundary-willing), OR high affection toward the player
  // (attraction). Only fires when the player is in a vulnerable state
  // (masturbating, showering, sleeping, undressed) and in a private room.
  // Resolution is handled by resolveNpcPeep in stealth.js (called from
  // evaluateDrives when this drive fires), not by the standard drive
  // effects pipeline — the outcome depends on a stealth roll against
  // player perception and may produce a DOM-injected bubble.

  peep_player: {
    gates: [],
    weight: 0.0,              // actual chance computed in evaluateDrives via condition
    timeOfDay: ['leisure', 'evening', 'wind_down'],
    cooldownMinutes: 480,         // ~8 hours (matches NPC_PEEP_TUNING)
    effects: [],              // no standard effects — resolution is custom
    isPeepDrive: true,        // flag for evaluateDrives to dispatch to resolveNpcPeep
    // D10: the resolver keeps deciding WHAT happens (the stealth contest); the
    // scorer decides WHETHER, and DRIVES' canPeepPlayer decides whether it is
    // even possible — a vulnerable player, in an adjacent room, and an NPC
    // curious or attracted enough to try (D15).
    //
    // Phase 3: the weights are NPC_PEEP_TUNING.chanceModifiers' own numbers —
    // openness 0.3 and lowConscientiousness 0.25, the second written as the
    // signed weight this idiom takes. They cannot be referenced directly (that
    // table is declared below this one), so verify-c3 asserts the two agree
    // instead. Candidacy still asks whether an NPC is curious enough to try at
    // all (canPeepPlayer's npcCuriosity floor); this says how badly the ones who
    // are want to, which was a flat 0.45 for everybody before.
    utility: {
      baseAppeal: 0.45,
      temperamentWeights: { openness: 0.30, conscientiousness: -0.25 },
      holdMinutes: 30, // was holdTicks 1 — 1 × 30-min ticks
    },
  },
  // BrineOS Phase 9: same isPeepDrive dispatch shape, different resolver
  // (tryNpcSnoop). Any block works — unlike peeping (which needs the
  // player in a vulnerable state at a specific moment), a phone can be
  // found any time the NPC happens to be alone with it.

  snoop_phone: {
    gates: [],
    weight: 0.0,
    timeOfDay: null,
    cooldownMinutes: 480,
    effects: [],
    isSnoopDrive: true,
    // As peep_player. Candidacy is DRIVES' findSnoopablePhone (D15): an
    // unlocked, unread phone in the room the NPC is standing in, with the player
    // elsewhere. Before that condition existed this was a candidate on 100% of
    // npc-ticks and would have won 54% of them. The Phase 3 weights are
    // SNOOP_TUNING.chanceModifiers', which are deliberately the same numbers as
    // NPC_PEEP_TUNING's — same curiosity, same shape, one place to change it.
    utility: {
      baseAppeal: 0.45,
      temperamentWeights: { openness: 0.30, conscientiousness: -0.25 },
      holdMinutes: 30, // was holdTicks 1 — 1 × 30-min ticks
    },
  },
  // Perception plan Phase 5 — the proof-of-concept perception consumer, and
  // the first drive in the game motivated by something OUTSIDE the NPC. An
  // NPC who can smell rot goes and finds it; one who can't, doesn't. Whether
  // they can depends on distance, doors and their own attention, so two
  // roommates in the same flat genuinely differ on whether they notice.
  //
  // Weight 0 — resolution is custom (tryInvestigateSmell in DRIVES), because
  // acting on a smell needs the source room and object the perceived record
  // carries and the generic weight roll has neither.

  investigate_smell: {
    gates: [{ signal: 'rot', op: 'above', threshold: 0.2 }],
    weight: 0.0,
    timeOfDay: ['morning', 'midday', 'evening', 'leisure', 'wind_down'],
    cooldownMinutes: 180,
    effects: [],
    isInvestigateDrive: true,
    // The rot gate stays a hard exclusion: the resolver needs the source room
    // off the perceived record, and there is nothing to investigate without
    // one. `utility.signal` then scores how badly it reeks FROM HERE — the
    // strongest single expression of D8 in the table, because the same rot
    // scores differently for two roommates standing in different rooms.
    // Phase 3: going to find out what that smell is takes curiosity (openness)
    // and a willingness to be the one who deals with it (conscientiousness) —
    // the only entry in the table where those two point the same way, which is
    // what separates investigating a smell from snooping through a phone.
    utility: {
      baseAppeal: 0.15,
      signal: { signal: 'rot', scale: 0.9 },
      temperamentWeights: { openness: 0.25, conscientiousness: 0.20 },
      holdMinutes: 60, // was holdTicks 2 — 2 × 30-min ticks
    },
  },
  // Phase 8 (D8): a fond NPC hands the player something they own. Custom
  // resolution (tryGiveGift in DRIVES) — affection-gated, cooldowned, and
  // only when they actually have a non-keyItem possession worth gifting.
  // The item arrives in the player's bag via MOVE_ITEM.

  gift_to_player: {
    gates: [],
    weight: 0.0,              // actual chance computed in evaluateDrives
    timeOfDay: ['leisure', 'evening', 'wind_down', 'morning'],
    cooldownMinutes: NPC_GIFT_TUNING.cooldownMinutes, // single source of truth
    effects: [],
    isGiftDrive: true,
    // As peep_player. Candidacy is DRIVES' giftableStack (D15) — real fondness
    // AND a non-keyItem possession worth handing over. Phase 3 adds warmth on
    // top, alone: affection is already the candidacy condition, so what is left
    // to say is whether this is a person who expresses it by handing you things.
    utility: {
      baseAppeal: 0.45,
      temperamentWeights: { warmth: 0.35 },
      holdMinutes: 30, // was holdTicks 1 — 1 × 30-min ticks
    },
  },
  // --- NPC wardrobe AI (Intimacy & Voyeurism Phase 6, D11) ---
  // The VISIBLE beat of the outfit system. The outfit itself is derived
  // deterministically every tick (resolveTick pass 2, from NPC's pure
  // npcOutfitForContext: block/activity + wardrobe → type → items), so it can
  // never disagree with what the NPC is doing. This drive is where the
  // *changing* moment comes from: 'changing' is a TRANSIENT_CLOTHING state,
  // exactly one tick, which is the caught-changing keyhole beat Phase 10
  // reads. Candidacy (COGNITION's DRIVE_CANDIDACY) compares the outfit they
  // were wearing LAST tick (updates merge at batch end) against this tick's
  // block target, so it fires at transitions — waking still in yesterday's
  // daily fit, or landing home still dressed for the office — rather than on
  // loop, and never mid-activity. No effects, no meters, no signal —
  // changing clothes is quiet and leaves nothing behind.
  change_clothes: {
    gates: [], weight: 0.2,
    timeOfDay: ['morning', 'prep', 'evening', 'wind_down'],
    setsClothing: 'changing',
    activityOverride: 'changing clothes',
    eventTemplate: '{name} changed into something more comfortable.',
    eventMood: 0.01,
    cooldownMinutes: 240,
    // Fastidious people change; slovenly ones stay in yesterday's clothes.
    // baseAppeal × the morning/prep blockAppeal lands the fastidious half of
    // the cast just over actionThreshold at the start of the day and the
    // slovenly half below it — the same deliberate split do_laundry documents.
    utility: {
      baseAppeal: 0.30,
      temperamentWeights: { conscientiousness: 0.20 },
      blockAppeal: { morning: 1.4, prep: 1.5, evening: 1.3, wind_down: 1.3 },
    },
  },
  // The swim drive (Phase 6's "nude_swim variant" premise): swimming is a
  // deliberate, facility-gated behaviour rather than only a leisure-table
  // roll. Wraps self.swim for the pool object's anchor, exactly as shower
  // wraps self.shower. Nudity is decided SEPARATELY, in resolveTick pass 2,
  // by NPC's npcClothingForContext: the deviancy gate (deviancyThreshold ×
  // nudeSwimChance, NUDITY_TUNING) opens the naked swim for a high-deviancy
  // NPC, and the same rule covers leisure-rolled swimming — one gate, not a
  // second drive that could bypass it (design invariant 3).
  swim: {
    gates: [], weight: 0.15,
    actionId: 'self.swim',
    timeOfDay: ['leisure', 'midday', 'evening'],
    utility: {
      // Swimming is fun, not duty: openness pulls it up, conscientiousness
      // down (the pool is a luxury, not a chore).
      baseAppeal: 0.24,
      temperamentWeights: { openness: 0.15, conscientiousness: -0.10 },
      holdMinutes: 60, // was holdTicks 2 — 2 × 30-min ticks
      blockAppeal: { leisure: 1.2, midday: 1.1, evening: 1.0 },
    },
    activityOverride: 'swimming laps',
    eventTemplate: '{name} went for a swim.',
    eventMood: 0.05,
    cooldownMinutes: 900,
    // Heating and filtration cost real money — the pool shows up on the
    // bills exactly as the shower does. Gated through MAINTENANCE's
    // npcDecayActions (the pool must be functional to swim, and using it
    // wears it out).
    meters: [['devices', 1.5], ['waterHeating', 1]],
  },

  // Intimacy & Voyeurism Phase 13 (D3/D13): the solo half of "NPCs do it
  // too". Fires only in a private room (DRIVE_CANDIDACY reads isPrivateRoom)
  // with npc.needs.desire at the floor — a solo act has no other party for
  // D13 to protect, so the body's own urge is the whole gate (the same
  // assumption the player's own masturbate act makes). A standard drive:
  // effects on self (the desire release is DESIRE.release.masturbate — the
  // sated number the Phase 8 economy already owns), nudity while the act
  // lasts (setsClothing 'nude', kept 'nude' by pass-2's activity rule and
  // reverted by the same pass the moment the activity ends), a moaning
  // signal the neighbors can perceive (the Phase 8 desire source's first
  // NPC producer — the loop that builds desire toward the NEXT act), a long
  // cooldown so it reads as an occasional urge rather than a loop, and an
  // ambiguous event line so the off-screen log never states it outright.
  // Phase 10's peek already reads activity 'masturbating' + clothing 'nude'
  // (PEEK_VIEW_ACT/PEEK_VIEW_CLOTHING), so a masturbating NPC is peekable
  // and catchable exactly as the plan verifies.
  masturbate: {
    gates: [], weight: 0.25,
    timeOfDay: ['leisure', 'evening', 'wind_down'],
    effects: [
      { type: 'ADJUST_NEED', params: { who: 'self', need: 'desire', delta: -DESIRE.release.masturbate } },
      { type: 'MOOD_DELTA', params: { who: 'self', delta: 0.1 } },
    ],
    activityOverride: 'masturbating',
    setsClothing: 'nude',
    emitsSignal: { signal: 'moaning', intensity: SIGNALS_EMIT.moaningLow },
    eventTemplate: '{name} closed the door behind them for a while.',
    eventMood: 0.05,
    cooldownMinutes: 720,
    utility: {
      baseAppeal: 0.34,
      desire: DESIRE.scoring,
      holdMinutes: INTIMACY.durationMinutes.masturbate,
      blockAppeal: { leisure: 1.1, evening: 1.15, wind_down: 1.3 },
    },
  },

  // --- Content-creation work (vocation-and-lifestyle plan D16, Phase 5) ----
  // The shift an adult-industry creator actually works. A DRIVE, not a
  // schedule block: it is authored in exactly the shape `masturbate` and
  // `swim` are, so it inherits the private-room gate, the peek pipeline, the
  // commitment hold and the event log without any of them learning a new
  // concept. D1's rule — the block vocabulary is closed — is why this is not
  // a `content` block, and it costs nothing to obey.
  //
  // It fires DURING the occupation's work block (that is what the blockAppeal
  // says), which is what makes it work rather than a hobby. openHomeWorkCommitment
  // holds the ordinary at-home shift; this out-scores it when the conditions
  // are right, because the at-home shift is interruptible by design.
  //
  // NUDITY IS NOT SET HERE, and that is deliberate. resolveTick pass 2's
  // npcClothingForContext owns every nudity decision in the game through the
  // deviancyThreshold x nudeSwimChance gate; the `swim` drive's comment
  // records that a second gate was consciously not built because it would let
  // a drive bypass the first. `setsClothing: 'undressed'` states the working
  // state of a shoot, and the nude question stays where it lives.
  //
  // The event line is ambiguous on purpose — the off-screen log never states
  // an intimate act outright (the same rule `masturbate` follows). What you
  // get is a closed door and a light under it; the peek is where you learn
  // what is actually happening.
  content_session: {
    gates: [], weight: 0.30,
    isContentWorkDrive: true,
    timeOfDay: ['work', 'leisure', 'evening', 'wind_down'],
    effects: [
      { type: 'ADJUST_NEED', params: { who: 'self', need: 'desire', delta: -DESIRE.release.masturbate } },
      { type: 'MOOD_DELTA', params: { who: 'self', delta: 0.06 } },
    ],
    activityOverride: 'filming',
    setsClothing: 'undressed',
    emitsSignal: { signal: 'moaning', intensity: SIGNALS_EMIT.moaningLow },
    eventTemplate: '{name} shut the door and put a light on in there.',
    eventMood: 0.04,
    cooldownMinutes: 600,
    utility: {
      // Above masturbate's 0.34 because this is their JOB — it should beat an
      // ordinary at-home work tick during the work block rather than being a
      // rare mood. Desire feeds it (DESIRE.scoring) but is not required: the
      // candidacy door is the occupation, not the need.
      baseAppeal: 0.42,
      desire: DESIRE.scoring,
      holdMinutes: 90,
      blockAppeal: { work: 1.5, evening: 1.15, wind_down: 1.1, leisure: 1.0 },
    },
  },

  // D17 — the rare one. "A late-night pool session you might catch."
  //
  // Everything about the numbers here serves RARITY. Catching this has to
  // read as luck, or it stops being a thing you caught and becomes a thing
  // that happens. Base appeal sits just over COGNITION.actionThreshold (0.40)
  // so it needs its block bonus to clear the bar at all, and the 4-day
  // cooldown puts it at roughly once a fortnight per eligible NPC even when
  // conditions are perfect.
  //
  // Facility-gated exactly as `swim` is — same actionId, same meters, so the
  // pool must be functional and using it wears it out and shows on the bills.
  // Candidacy (COGNITION's DRIVE_CANDIDACY) adds the rest: content work, high
  // disinhibition, and an EMPTY pool room. The empty-room condition is what
  // makes it a private act in a common space, which is the whole appeal of
  // the beat and the reason it is worth walking in on.
  content_pool_session: {
    gates: [], weight: 0.08,
    isContentWorkDrive: true,
    actionId: 'self.swim',
    timeOfDay: ['wind_down', 'evening'],
    effects: [
      { type: 'ADJUST_NEED', params: { who: 'self', need: 'desire', delta: -DESIRE.release.masturbate } },
      { type: 'MOOD_DELTA', params: { who: 'self', delta: 0.09 } },
    ],
    activityOverride: 'filming by the pool',
    emitsSignal: { signal: 'splashing', intensity: SIGNALS_EMIT.moaningLow },
    eventTemplate: '{name} was down by the pool late, with the lights low.',
    eventMood: 0.06,
    cooldownMinutes: 20160,  // 14 days — THE rarity dial. Measured at 5760 this fired
                             // 1.25x per npc-week under ideal conditions, which is not a
                             // thing you catch, it is a thing that happens. See the plan.
    meters: [['devices', 1.5], ['waterHeating', 1]],
    utility: {
      baseAppeal: 0.30,
      desire: DESIRE.scoring,
      holdMinutes: 60,
      blockAppeal: { wind_down: 1.45, evening: 1.15 },
    },
  },

  // D19 — the couple session. Two people who work together, working.
  //
  // A VARIANT of `intimate`, not a new pair mechanism: `isIntimateDrive` sends
  // it through the identical resolver, which means it goes through
  // findIntimatePartner and resolveWillingnessGate exactly as the ordinary
  // pair act does. That is the whole design and it is design invariant 5 —
  // the willingness gate is never bypassed, extended, or special-cased. The
  // content conditions are added ON TOP of it in DRIVE_CANDIDACY, never
  // instead of it, and Phase 6's most important test is the one that forces
  // an unwilling partner into the room and asserts this stays non-candidate.
  //
  // Everything else it inherits for free: effects on both parties, castWeb
  // warmed both ways, both participants pinned by a commitment, the moan the
  // neighbours hear, the infidelity footprint if it contradicts a record.
  //
  // Code-review fixes (all in this entry, all consumed by tryIntimatePair):
  //   act — was previously absent, which meant tryIntimatePair fell back to
  //     NPC_INTIMACY.intimate.act ('sex') for this drive too: a filmed
  //     shoot triggered the same pregnancy roll and 'first_sex' relationship
  //     history as literal intercourse. 'content' is not in
  //     PREGNANCY.qualifyingActs, so neither consequence fires for it now —
  //     and it gets its own WILLINGNESS.thresholds entry rather than sex's.
  //   pairDeltas — was absent despite the comment above claiming castWeb
  //     warming was "inherited for free"; it wasn't, because
  //     tryIntimatePair's warming block is itself gated on `drive.pairDeltas`
  //     being present. Smaller than `intimate`'s across the board: this is a
  //     working collaboration, not a sexual encounter, so it earns real trust
  //     (the biggest single term) without the desire release full sex gets.
  //   leaves — `intimate` unmakes the bed it used (design invariant 7, "an
  //     act leaves a trace"); this drive borrows the same self.nap anchor
  //     (actionId) and left the same trace unset.
  content_collab: {
    gates: [], weight: 0.14,
    isIntimateDrive: true,
    isContentWorkDrive: true,
    act: 'content',
    actionId: 'self.nap',
    timeOfDay: ['work', 'evening', 'wind_down'],
    effects: [
      { type: 'ADJUST_NEED', params: { who: 'self', need: 'desire', delta: -DESIRE.release.sex } },
      { type: 'MOOD_DELTA', params: { who: 'self', delta: 0.1 } },
    ],
    pairDeltas: { affection: 0.06, comfort: 0.05, trust: 0.06, desire: -0.15, tension: -0.05 },
    leaves: { bed: { made: 1 } },
    activityOverride: 'filming together',
    setsClothing: 'undressed',
    emitsSignal: { signal: 'moaning', intensity: SIGNALS_EMIT.moaningHigh },
    eventTemplate: '{name} and someone else shut themselves in for a while.',
    eventMood: 0.05,
    cooldownMinutes: 2880,   // two days
    utility: {
      baseAppeal: 0.36,
      desire: DESIRE.scoring,
      holdMinutes: 90,
      blockAppeal: { work: 1.3, evening: 1.15, wind_down: 1.2 },
    },
  },

  // Intimacy & Voyeurism Phase 13 (D3/D13): the pair-act half. Custom
  // resolver (tryIntimatePair, drives.js), because a pair act touches TWO
  // NPCs — its effects run on both, its deltas are castWeb both ways, both
  // are pinned to the act by commitments, and both get the Phase 9 history
  // writers. Candidacy requires a private room, real desire, AND a
  // co-located resident who clears the willingness gate for `sex` — the
  // same gate and act the player's Make-a-Move reads, so an NPC can never
  // initiate what the player could not (symmetric initiation, D3; the only
  // door, invariant 1). The resolver mirrors resolvePairedAct's idioms
  // (partner effects, bed-unmade trace, noteIntimacy* writers) rather than
  // the shared-activity path — see the plan Handoff. `actionId` wraps
  // self.nap so the pair anchors on a real bed when one is in the room
  // (falling back to room-centroid), the same anchor borrow shower makes;
  // `leaves` unmakes that bed (invariant 7); `emitsSignal` is the loud moan
  // the plan's verification says neighbors hear; the 18h cooldown plus the
  // commitment pin make the couple's act a discrete event, not a loop.
  intimate: {
    gates: [], weight: 0.2,
    isIntimateDrive: true,
    // Code-review fix: `act` now lives on the DRIVE_DEFS entry itself,
    // alongside activityOverride/pairDeltas, and is what tryIntimatePair
    // (drives.js) reads for the willingness-gate check, the pregnancy roll,
    // and the relationship-history write — the same three consequences a
    // real "did these two have sex" question needs to answer consistently.
    // Before this field existed, tryIntimatePair hardcoded
    // NPC_INTIMACY.intimate.act for EVERY isIntimateDrive entry regardless
    // of which one fired, which is how content_collab (below) ended up
    // triggering real pregnancies from a filming session.
    act: 'sex',
    actionId: 'self.nap',
    timeOfDay: ['leisure', 'evening', 'wind_down'],
    // Applied to BOTH participants (who: 'self' = each) by tryIntimatePair.
    // energy/hygiene/mood reuse the Phase 11 target-NPC magnitudes so an
    // NPC partner of another NPC's act is costed exactly like the player's
    // partner; desire release is DESIRE.release.sex (the sated number).
    effects: [
      { type: 'ADJUST_NEED', params: { who: 'self', need: 'desire', delta: -DESIRE.release.sex } },
      { type: 'ADJUST_NEED', params: { who: 'self', need: 'energy', delta: -INTIMACY.npcEnergyCost.sex } },
      { type: 'ADJUST_NEED', params: { who: 'self', need: 'hygiene', delta: -INTIMACY.npcHygieneCost.sex } },
      { type: 'MOOD_DELTA', params: { who: 'self', delta: INTIMACY.npcMoodGain.sex } },
    ],
    // castWeb axes applied in BOTH directions by tryIntimatePair (the same
    // per-act magnitudes the plan's Phase 12 comment names — the couple
    // warms toward each other, sated desire drops, tension eases).
    pairDeltas: { affection: 0.10, comfort: 0.08, trust: 0.05, desire: -0.4, tension: -0.08 },
    leaves: { bed: { made: 1 } },
    activityOverride: 'having sex',
    emitsSignal: { signal: 'moaning', intensity: SIGNALS_EMIT.moaningHigh },
    eventTemplate: '{name} and {other} were alone together for a while.',
    eventMood: 0.05,
    cooldownMinutes: 1080,
    utility: {
      // Above masturbate's baseAppeal (0.34) so that when a WILLING partner
      // is present the pair act outranks the solo one — masturbation stays
      // the fallback for a high-desire NPC with nobody willing to join them.
      baseAppeal: 0.36,
      desire: DESIRE.scoring,
      holdMinutes: INTIMACY.durationMinutes.sex,
      blockAppeal: { leisure: 1.1, evening: 1.2, wind_down: 1.4 },
    },
  },

  // Intimacy & Voyeurism Phase 14 (D14): the long-distance thread. An NPC in
  // a committed/seeing relationship with an OUTSIDE partner (ensureOutside
  // Partners, sim.js — someone who doesn't live here) texts them when they
  // are apart: the flirty backchannel that keeps the couple warm and the
  // sender's desire climbing until the next visit. Custom resolver
  // (trySextPartner, drives.js) because the act reaches ANOTHER NPC's IM
  // thread rather than the world: it queues an NPC↔NPC message (drained by
  // SIM's processNpcImMessages into the partner's thread — the same thread
  // the player reads), raises the sender's desire (texting makes it worse),
  // warms the castWeb pair, and holds the sender for one tick. Candidacy
  // (DRIVE_CANDIDACY.sext_partner) requires the outside partner to exist,
  // real desire, and the partner to NOT be in the house right now — if
  // they're here, go be with them, don't text them.
  sext_partner: {
    gates: [], weight: 0.18,
    isSextDrive: true,
    timeOfDay: ['leisure', 'evening', 'wind_down'],
    effects: [
      { type: 'ADJUST_NEED', params: { who: 'self', need: 'desire', delta: OUTSIDE_PARTNER_TUNING.sext.desireGain } },
      { type: 'MOOD_DELTA', params: { who: 'self', delta: OUTSIDE_PARTNER_TUNING.sext.moodGain } },
    ],
    activityOverride: 'texting',
    eventTemplate: '{name} was texting someone.',
    eventMood: 0.02,
    cooldownMinutes: OUTSIDE_PARTNER_TUNING.sext.cooldownMinutes,
    utility: {
      baseAppeal: 0.3,
      desire: DESIRE.scoring,
      holdMinutes: CLOCK.tickMinutes,
      blockAppeal: { leisure: 1.05, evening: 1.15, wind_down: 1.2 },
    },
  },

  // Intimacy & Voyeurism Phase 17 (D13/D14): the NPC-equivalent boundary act
  // — \"some NPCs attempt them back\" (D13 symmetry). A deviant, aroused NPC
  // slips into the sleeping player's room and into their bed, the exact
  // mirror of the player's own sleep_with verb. Custom resolver
  // (trySneakIntoBed, boundary.js — the phase's own file): the sneak is a
  // stealth/perception contest (silence is the usual outcome; the player
  // wakes to an unmade bed), a caught attempt is the real but minority
  // outcome and lands relPlayer consequences + an event the player sees.
  // Weight 0 — candidacy is entirely DRIVE_CANDIDACY's (deviancy + desire +
  // a sleeping player behind an unlocked door), the peep_player pattern.
  // The willingness gate is NOT consulted for the target here for the same
  // reason it is not consulted in the player's own sleep_with: the player is
  // ASLEEP (the gate's own asleep floor returns -1 — expected), the act is
  // a risk attempt with consequences, never a completed intimacy act with a
  // participating target, and the player's locked door makes it impossible
  // (the one guard that always holds).
  sneak_into_bed: {
    gates: [], weight: 0.0,
    isBoundarySneakDrive: true,
    timeOfDay: ['evening', 'wind_down'],
    cooldownMinutes: BOUNDARY.npcSneak.cooldownMinutes,
    effects: [],
    eventTemplate: BOUNDARY.npcSneak.eventTemplateSilent,
    eventMood: 0.01,
    utility: {
      baseAppeal: 0.35,
      desire: DESIRE.scoring,
      holdMinutes: CLOCK.tickMinutes,
      blockAppeal: { evening: 1.1, wind_down: 1.3 },
    },
  },

  // --- Idle pastimes (vocation-and-lifestyle plan Phase 7) -----------------
  // The measured fix for the empty afternoon. The drive table had nothing
  // that appealed WITHOUT a need behind it, so once every need was met the
  // best candidate on an idle tick scored ~0.356 against
  // COGNITION.actionThreshold and the back half of a free day was nothing.
  // These clear the bar on APPEAL — deliberately, with no `utility.need` —
  // and their cooldowns bound the rate, so an at-home NPC fills the day
  // with visible life instead of staring at a wall. All three restore a
  // little stimulation and mood: they are the SOURCE of an idle afternoon,
  // not a response to an empty one (that response already exists — it is
  // seek_stimulation).
  //
  // Which one a person reaches for is the occupation's `idlePastimes` list
  // (D23: the field and this reader — COGNITION's idlePastimePreferred, the
  // `utility.pastimeWeight` term in scoreDrive — ship in the same phase). A
  // listed drive scores +pastimeWeight; an unlisted one still clears the
  // bar, so the lean tints without ever re-opening the empty afternoon. An
  // absent list scores every idle drive flat.
  //
  // No temperamentWeights, and that is a decision, not an absence: base ×
  // the personality multiplier at the wrong end of an axis would drop one of
  // these BELOW the bar and re-create the hole for half a cast. Personality
  // reaches idle behaviour through Phase 2's occupation affinity — a curious
  // draw is likelier to land a job whose pastimes suit it — not through a
  // second weight set here.
  read_book: {
    gates: [], weight: 0.3,
    isIdlePastime: true,
    timeOfDay: ['midday', 'leisure', 'evening', 'wind_down'],
    effects: [
      { type: 'ADJUST_NEED', params: { who: 'self', need: 'stimulation', delta: 12 } },
      { type: 'MOOD_DELTA', params: { who: 'self', delta: 0.02 } },
    ],
    activityOverride: 'reading',
    // Same rooms the schedule routes 'reading' to (ACTIVITY_ROOM_PREFERENCES).
    moveToRoom: ['study', 'living_room', 'balcony'],
    eventTemplate: '{name} curled up with a book for a while.',
    eventMood: 0.03,
    cooldownMinutes: 420,
    utility: {
      baseAppeal: 0.42,
      holdMinutes: 90,
      blockAppeal: { leisure: 1.1, wind_down: 1.2 },
      pastimeWeight: 0.06,
    },
  },

  watch_tv: {
    gates: [], weight: 0.3,
    isIdlePastime: true,
    timeOfDay: ['leisure', 'midday', 'evening', 'wind_down'],
    effects: [
      { type: 'ADJUST_NEED', params: { who: 'self', need: 'stimulation', delta: 12 } },
      { type: 'MOOD_DELTA', params: { who: 'self', delta: 0.02 } },
    ],
    activityOverride: 'watching TV',
    moveToRoom: ['living_room'],
    eventTemplate: '{name} put the TV on and sprawled across the couch.',
    eventMood: 0.03,
    cooldownMinutes: 420,
    // A screen on shows up on the bills, the same way a shower or a load of
    // laundry does (UTILITY_METER.devices — electric, per-hour).
    meters: [['devices', 0.5]],
    utility: {
      baseAppeal: 0.42,
      holdMinutes: 90,
      blockAppeal: { leisure: 1.1, evening: 1.1 },
      pastimeWeight: 0.06,
    },
  },

  scroll_phone: {
    gates: [], weight: 0.3,
    isIdlePastime: true,
    timeOfDay: ['leisure', 'midday', 'evening', 'wind_down'],
    effects: [
      { type: 'ADJUST_NEED', params: { who: 'self', need: 'stimulation', delta: 10 } },
      { type: 'MOOD_DELTA', params: { who: 'self', delta: 0.01 } },
    ],
    activityOverride: 'scrolling social media',
    moveToRoom: ['living_room', 'balcony', 'bedroom'],
    eventTemplate: '{name} scrolled through their phone for a while.',
    eventMood: 0.02,
    cooldownMinutes: 360,
    utility: {
      baseAppeal: 0.42,
      holdMinutes: 60,
      blockAppeal: { leisure: 1.1 },
      pastimeWeight: 0.06,
    },
  },
};

// --- NPC cognition: utility scoring (npc-cognition-plan.md, Phase 1) ---
// The dials the scorer in cognition.js reads. Every number here was a FIRST
// PASS set by arithmetic against the plan's Evidence, not by measurement.
// Phase 5 (2026-08-11) then measured against targetActionsPerTick and kept
// every COGNITION constant as-is — see the plan's Handoff for what was swept
// and why it stayed: actionThreshold was the first lever tried and the bug
// that made it look dead (the cooldown rollover in drives.js) was the real
// suppressor; once fixed, the rate landed on target without touching any of
// these. Raising actionThreshold would strand the five drives that carry no
// need curve (react_to_player/peep_player/snoop_phone/gift_to_player/
// do_laundry) below the bar, so 0.40 is load-bearing for Phase 3's
// authored above/below-bar design rather than a tuning artifact.
const COGNITION = {
  // Below this a candidate is not worth departing from the scheduled activity
  // for. Phase 1 authored every `baseAppeal` so that each drive clears this bar
  // somewhere in its need's OBSERVED range (not its theoretical 0..100) — that
  // is what verify-c1's reachability assertion pins, and it is the assertion
  // that would have caught `sleep_recover` sitting under an unreachable gate.
  actionThreshold: 0.40,
  breakMargin: 0.25,           // a challenger must beat the held pursuit by this (D5, Phase 2)

  // What a fully depleted need adds to a drive that declares `utility.need`.
  // 0.70 against a 0.40 threshold means a need at its `below` point motivates
  // nothing on its own and a need at zero outweighs any base appeal in the
  // table — hunger at 0 should beat wanting to do laundry.
  needWeight: 0.70,

  // A drive done recently, but no longer on cooldown, is less appealing than
  // one that is not. `recencyWindow` is in multiples of the drive's OWN
  // cooldownMinutes; the penalty applies between 1× and 2× it. Specified in the
  // plan as applying "within its own cooldown", which cannot happen — the
  // cooldown is a hard exclusion, so nothing inside it is ever scored. See
  // cognition.js's recencyMultiplier.
  // Phase 6 (continuous-behavior-engine tuning pass): 2 → 1.5. At 2×, eat's
  // suppression ran 14 in-game hours after a meal — past breakfast, which is
  // why the measured household ate only ~0.42 meals/day, almost always dinner
  // (a 13.5h-old meal still scored ×0.5 and lost to a shower at 08:00). At
  // 1.5× the penalty still stops grazing inside the cooldown's own stretch
  // (7-10.5h) but wears off before the next meal would naturally land. Measured
  // effect on the other drives is negligible (their need cycles are all longer
  // than their new windows); the meal rhythm was the only real consumer.
  recencyPenalty: 0.5,
  recencyWindow: 1.5,

  // D4 (continuous-behavior-engine Phase 3): the routine weight curve. A
  // drive's former `blockFilter` hard gate is now a multiplier evaluated at
  // the current minute-of-day: its declared `timeOfDay` blocks map through
  // BLOCK_TIME_OF_DAY to real windows, where it scores its `blockAppeal`
  // (default 1); outside them it scores `routineOutOfBand` instead of being
  // excluded. The ramp width is what makes the curve CONTINUOUS — the weight
  // fades linearly over `routineRampMinutes` on each side of a window edge
  // rather than stepping at a boundary, so nothing about the shape ever
  // depends on where a 30-minute tick boundary happened to land. Out-of-band
  // stays non-zero so a routine is a strong preference, never an
  // impossibility (a starving night-shift worker must still be able to eat).
  // Both numbers are tuning surface for Phase 6's live pass.
  routineOutOfBand: 0.25,
  routineRampMinutes: 30,

  // Floor on the D7 personality multiplier: an unlucky sum could otherwise take
  // `1 + Σ` negative, which would sort a drive below "do nothing" in a way no
  // author intended. INTERRUPTION does not clamp because its four weights are
  // small and fixed; this table is open for authoring, so it does.
  //
  // As authored in Phase 3 the worst case across all sixteen drives is 0.45
  // (seek_stimulation at openness -1, volatility -1), so this is a safety net
  // for future authoring and not a number any drive currently touches — which
  // is the invariant verify-c3 pins, because a table that reaches the floor is
  // one where two very different NPCs quietly score the same.
  temperamentFloor: 0.1,

  targetActionsPerTick: 0.25,  // D2 — measured 0.08 today; what Phase 5 tunes against
  alwaysBreak: {               // D5's short list (Phase 2)
    playerAddress: true,
    calloutSalience: 0.70,     // matches SCENE_READER.calloutSalience — one idea of "this stops you"
  },
  // Phase 5 (D6): the urgency thresholds the commitment interrupt scan
  // compares against. A need that has CROSSED below its bar since the
  // commitment opened (an edge, via the commitment's needsAtOpen snapshot)
  // releases the NPC and re-decides. Aligned with each need's warnBelow where
  // one exists (energy 20, hygiene 25, comfort 20, stimulation 20); hunger
  // and social, which carry no player-facing bar, get their own. The served
  // need of the held drive is excluded — an NPC napping because energy is low
  // must not be interrupted about energy. Tuning surface for Phase 6's pass.
  interruptUrgency: {
    hunger: 30, hygiene: 25, energy: 20, social: 25, comfort: 20, stimulation: 20,
  },
};

// --- Overtures (npc-initiative-plan.md Phase 3, D1/D2/D5/D9/D10) -----------
// The sibling table to DRIVE_DEFS, and deliberately the same SHAPE: a drive is
// something an NPC does to the WORLD, an overture is something they direct at a
// PERSON, and both are ranked by COGNITION's one scorer on one scale (D1).
// There is no second selection system that could disagree with `npc.commitment`
// about what an NPC is doing — scoreCandidates walks both tables and
// choosePursuit picks one winner, which is what makes design invariant 2
// ("one committed intent per NPC") true by construction rather than by care.
//
// D5 — needs do not motivate overtures. `utility.need` is absent on every entry
// here and `utility.motive` takes its place: the strongest of the entry's
// `motives` supplies a [0,1] strength and OVERTURE.motiveWeight scales it into
// appeal, exactly as COGNITION.needWeight scales a depleted need. A hungry NPC
// eats; a curious one asks.
const OVERTURE = {
  // What a maximally motivated overture adds to its `baseAppeal`. The
  // arithmetic this was authored against: 0.50 on a base of 0.30 tops out at
  // 0.80, which is above every ordinary chore in DRIVE_DEFS (0.10..0.45) and
  // BELOW a starving NPC's `eat` (0.27 + COGNITION.needWeight 0.70 = 0.97).
  // That ordering is D5 expressed as a number. Phase 6 owns the retune.
  motiveWeight: 0.50,

  // D10's floors, one per motive source, so a source that has technically moved
  // off zero does not immediately start crossing rooms. Each reuses a bar the
  // game already authored where one exists (README rule 5) rather than
  // inventing a parallel one:
  //   curiosity — RUMINATION.raiseThreshold, via npc.js's topOpenQuestion. The
  //     same bar Plan 4's D13 bridge raises a question at; a question worth
  //     mentioning in conversation is a question worth crossing a room for.
  //   affection — REL_CONSEQUENCES.affectionGiftThreshold, the existing "real
  //     fondness" bar that gates gift_to_player.
  //   desire    — npcInitiativeGate's `mayInitiate` (D12/D14), whole.
  //   grievance — this, the one source with no authored bar of its own.
  grievanceFloor: 0.3,         // matches addGrievance's own default severity

  // How long a pending overture waits before it lapses. Two ticks is one in-game
  // hour: long enough that the player can act between clock ticks, short enough
  // that an ignored overture is over before the NPC's next cooldown window.
  // Also the def's `utility.holdTicks`, read by openOverture.
  lapseTicks: 2,

  // How long before the same NPC may open another one. 360 minutes is six in-game
  // hours — the same order as RUMINATION.intervalTicks, which is the cadence at
  // which the curiosity source can produce a new reason to open at all.
  cooldownMinutes: 360,

  // --- Phase 4's three other channels -------------------------------------
  // Each cooldown is on the OVERTURE_DEFS entry and every one of them reads
  // from here, so "how often does this cast reach for the player" stays one
  // decision made in one place (D21).
  //
  // ALL THREE WERE RETUNED IN PHASE 6, AND TWO OF THEM WERE BROKEN (D34). Back
  // then a cooldown stamp was a 0..47 tick index that wrapped at midnight and
  // isOnCooldown compared a WRAPPED delta — a cooldown was not an elapsed
  // duration but a fixed daily clock window anchored at the stamp, and at or
  // above CLOCK.ticksPerDay that window never elapsed at all. Measured: at 48
  // and 96 an NPC proposed and knocked exactly ONCE per game. Every value here
  // was kept at or below 600 minutes, the largest value measured to keep every
  // entry live on every resident. The mechanism is now absolute-minute
  // (npc-initiative-retiming D2; isOnCooldown/setCooldown in drives.js) — the
  // wrap and its ceiling are gone, so a cooldown longer than a day is the same
  // check as a short one if a channel ever wants to retune for it.
  //
  // A text is the cheap channel — it costs the sender nothing and the player
  // can read it whenever — and that is exactly why it needed the retune most:
  // it is the only channel with no geometric limiter and an empty
  // do-not-disturb list (D9), so it was two thirds of every arm's volume and
  // reached a sleeping or absent player 4.5 times a day. 480 minutes is eight
  // in-game hours. Measured on 8 households x 3 residents x 7 days at
  // affection 0.9: texts 242 -> 72 and the whole cast 2.464 -> 1.405 per NPC
  // per day, with the in-person channels unmoved (approach 152 -> 144). On an
  // ABSENT player, where this is the only channel that can reach at all,
  // 1.464 -> 0.452 per NPC per day and 0 of 24 residents went silent.
  textCooldownMinutes: 480,
  // A knock is the most intrusive: they walked to a door you closed. Ten
  // in-game hours, so being knocked on twice in an evening is not a thing that
  // can happen. It wanted two days and the old wrapped stamp could not express
  // that (D34); the value stays where Phase 6 tuned it — this is a retiming,
  // not a rebalance. The rate is geometry-limited rather than cooldown-limited
  // in any case — measured 9 knocks at 12 ticks against 8 at 96, because the
  // channel needs the player behind a shut door and an NPC in the one adjoining
  // room.
  knockCooldownMinutes: 600,
  // A proposal books a piece of the player's future. It wanted a full day and
  // the old wrapped stamp could not have one (D34); 600 minutes (20 ticks) is
  // the largest working value, and the next step up is where the wrap starts
  // silencing residents outright — measured, 1 of 24 residents never proposed
  // at 20 against 4 of 24 at 24.
  proposeCooldownMinutes: 600,

  // --- D10, the refusal economy ------------------------------------------
  // A refusal costs a relationship delta AND is remembered, and BOTH halves
  // self-limit or the pair becomes a permanent grudge over a long game.
  // `refusalDiminish` is the geometric decay applied per prior refusal inside
  // `refusalWindowDays`: the second refusal moves half what the first did, the
  // third a quarter. The same scale multiplies the motive strength, which is
  // the other half of D10 — the NPC learns to STOP ASKING rather than learning
  // to hate you, and one function is both.
  refusalWindowDays: 3,
  refusalDiminish: 0.5,
  refusalDelta: { affection: -0.04, comfort: -0.03 },
  // The remembered half. Written through addMemoryFact, so it carries normal
  // provenance and confidence and decays like any other belief (D10).
  refusalFactImportance: 'social',   // a MEMORY_IMPORTANCE key
  refusalFactConfidence: 0.9,        // first-hand: they were standing right there
};

// D12 — the warm and charged paths must produce DIFFERENT overtures, different
// narration and different remembered facts, or the distinction never reaches
// the player. These two tables are the narration and the fact; the motive that
// won is the overture. `{name}` is the only substitution.
const OVERTURE_APPROACH_TEMPLATES = {
  warm: [
    '{name} crosses the room and stops in front of you.',
    '{name} comes over, and it looks like they want to say something.',
    '{name} drifts over and waits for you to look up.',
  ],
  charged: [
    '{name} crosses the room and stands closer than they need to.',
    '{name} comes over slowly, holding your eye the whole way.',
    '{name} stops in front of you, close enough that you have to look up.',
  ],
};

const OVERTURE_REFUSAL_FACTS = {
  warm: 'You walked away when {name} came over to talk.',
  charged: 'You walked away when {name} came over wanting you.',
};

// --- Phase 4's channels: what each one SAYS ---------------------------------
// D8's other three. The machinery is identical — same scorer, same motive
// readers, same record, same four named writers — so what actually
// distinguishes a text from a knock is the surface it arrives on and the words
// it arrives in. These are the words.

// The text channel (initiative plan Phase 4). This table is what `text_player`
// stopped pretending: it used to be seven strings picked at random with no
// relationship to anything the NPC knew or wanted ("the wifi is being weird
// again"), which is why it read as set dressing rather than as a person.
// Keyed by MOTIVE, so a text is about the reason it was sent.
//
// `{topic}` is filled from the record's motiveRef and is the same phrase the
// approach's opening line names. An entry that carries it is skipped when
// there is no topic to put in it, which is why every list must also carry at
// least one entry without one (verify-i4 asserts that — a motive whose whole
// list needed a topic would silently send nothing).
//
// `charged` sits beside the four motives rather than nesting under desire,
// exactly as OVERTURE_APPROACH_TEMPLATES is tone-keyed: 'charged' is reachable
// only through the desire gate (D12), so one flat lookup covers both.
const OVERTURE_TEXT_TEMPLATES = {
  curiosity: [
    'hey — been meaning to ask you about {topic}',
    'random but i keep thinking about {topic}',
    'you around later? something i want to ask you',
  ],
  grievance: [
    'can we talk about {topic} at some point',
    'not trying to start anything but {topic} is still bugging me',
    'we should talk. not urgent. but we should',
  ],
  affection: [
    'hey. hope today is being kind to you',
    'no reason. just thinking about you',
    'the flat is quiet without you in it',
  ],
  desire: [
    'thinking about you. that is the whole message',
    'are you coming home soon',
  ],
  charged: [
    'i keep thinking about you and it is not helping',
    'come home',
  ],
};

// The knock channel. Narrated in the scene the moment the record opens — the
// player is behind a closed door, so unlike an approach there is nobody to
// look up at, and the SIGNAL_DEFS 'knocking' transient is what carries it to
// anyone else in earshot. Tone-keyed for the same D12 reason as the approach.
const OVERTURE_KNOCK_TEMPLATES = {
  warm: [
    'A knock at your door. "{name} — you in there?"',
    'Three knocks, unhurried. It is {name}.',
    'A knock, then {name}\'s voice: "Got a second?"',
  ],
  charged: [
    'A knock at your door, and it is not a casual one. "{name}."',
    '{name} knocks once and waits, close enough to the door that you can hear them breathing.',
  ],
};

// The propose channel. The NPC is standing in front of you asking for a piece
// of your week. `{when}` and `{where}` come from the proposal terms on the
// record — a real day, a real window, a real room — because a proposal that
// cannot name when is a mood, not a plan.
const OVERTURE_PROPOSE_TEMPLATES = {
  warm: [
    '{name} comes over. "Are you around {when}? I thought we could just... be in the {where} at the same time for once."',
    '{name} stops in front of you. "{when}. The {where}. Nothing planned, just — you and me not doing anything separately."',
    '{name} drifts over. "Do you want to do something {when}? I will be in the {where} either way."',
  ],
};

// D10's remembered half, per channel where the default does not fit. The base
// OVERTURE_REFUSAL_FACTS above is written for someone you WALKED AWAY from;
// turning down a plan and not opening a door are different things to remember,
// and a fact tier that records all three identically is a fact tier that has
// stopped being information. Read through the def, which falls back to the
// tone-keyed base — so a channel that has nothing special to remember says
// nothing special.
const OVERTURE_PROPOSE_REFUSAL_FACTS = {
  warm: 'You said no when {name} asked to spend some time together.',
};

// Vocation plan D18 — the collab ask. Written as someone raising work with a
// person they trust, not as a proposition: the candidacy already required real
// affection and low tension, so by the time this is spoken the relationship
// has done the persuading and the line does not have to. `{when}` and
// `{where}` come from the proposal terms exactly as the hangout's do.
const OVERTURE_COLLAB_TEMPLATES = {
  warm: [
    '{name} finds you, a little more carefully than usual. "So — work thing. I could use another pair of hands {when}. Nothing you would not be comfortable with, and you can say no and we never mention it again."',
    '{name} leans in the doorway. "Can I ask you something work-related and weird? {when}, the {where}. I need someone I actually trust behind the camera."',
    '"Okay," {name} says, "hear me out." A pause. "{when}. I am shooting. It goes better with someone there, and I would rather it was you than anyone I would have to hire."',
  ],
  charged: [
    '{name} catches your eye and holds it. "{when}. I am working. You could be in it, if you wanted — or just there. Your call, and I mean that."',
  ],
};
const OVERTURE_COLLAB_REFUSAL_FACTS = {
  warm: 'You turned {name} down when they asked for help with their work — they took it well, but they asked once and have not since.',
  charged: 'You turned down what {name} offered. They have not brought it up again.',
};
const OVERTURE_KNOCK_REFUSAL_FACTS = {
  warm: 'You did not open the door when {name} knocked.',
  charged: 'You left {name} standing at your door.',
};

// D8's four channels. Phase 3 shipped `approach`; Phase 4 adds the other
// three, and they are new ENTRIES rather than new machinery — the same scorer
// ranks them, the same four named writers commit them, the same motive readers
// supply the reason. What each entry owes is its own candidacy and its own
// surface.
//
// The fields that differ between channels, and what reads each one:
//   proximity      — OVERTURE_PROXIMITY (overture.js). Where the NPC has to be
//                    standing, as a named predicate from a registry that fails
//                    closed. Replaces Phase 3's `requiresAdjacent` boolean
//                    (D29): three channels need three different answers, and
//                    'remote' also carries whether the player has to be in the
//                    flat at all — a text reaches someone who is out.
//   requires       — the do-not-disturb registry read the other way up: these
//                    states must be TRUE. A knock exists because the door is
//                    shut, so the state that BLOCKS an approach is the state
//                    that ENABLES a knock. One registry, two lists.
//   awaitsAnswer   — whether the overture leaves a pending record at all. An
//                    approach, a proposal and a knock are all questions and
//                    wait for an answer; a text is delivered and over. This is
//                    also what decides whether D27's hold applies, and it must
//                    stay false for `text` or an NPC would stand frozen for two
//                    ticks having sent a message.
//   waitAt         — 'player' (they came to you and stand in front of you) or
//                    'here' (they are at your door and stay on their side of
//                    it). Only meaningful when awaitsAnswer.
//   respond        — the two chips RENDER offers while the record is pending.
//                    Absent means the channel is answered by something the
//                    player already does: an approach is answered by doTalk and
//                    refused by doMove (D8), which is why Phase 3 needed no new
//                    surface and these two do.
//   sendsText / emitsSignal — what happens in the tick at the moment it is
//                    made. `emitsSignal` is the SAME field and shape a
//                    DRIVE_DEFS entry carries, with one difference that follows
//                    from what an overture is: it lands in the room the PLAYER
//                    is in, because an overture is aimed at a person.
//
// `proximity: 'adjacent'` on the approach is D26 unchanged: the phase's goal
// sentence is "an NPC crosses the room", and same-room means they were already
// standing there. isRoomAdjacent returns true for the same room too, so one
// predicate covers both and the walk is one tick. Two hops (a bedroom to the
// kitchen) is a journey, and a journey is the knock below.
const OVERTURE_DEFS = {
  approach_player: {
    channel: 'approach',
    motives: ['curiosity', 'grievance', 'affection', 'desire'],
    // Same field, same reader (COGNITION's isDriveCandidate) as a drive's.
    // Nobody crosses a room to open a conversation on their way out to work.
    blockFilter: ['leisure', 'evening', 'wind_down', 'morning'],
    cooldownMinutes: OVERTURE.cooldownMinutes,
    proximity: 'adjacent',
    // D9 — the gate is a do-not-disturb SET, not player idleness. Firing only
    // when the player is idle means NPCs never open at the moments that carry
    // weight; firing always is harassment at any rate. Every key here is
    // resolved by overture.js's OVERTURE_DND_SOURCES, which fails closed on an
    // unknown one exactly as D23's `when` clauses do.
    doNotDisturb: ['sleeping', 'showering', 'masturbating', 'in_conversation', 'locked_door'],
    awaitsAnswer: true,
    waitAt: 'player',
    // Same field and same reader as a drive's: what the floor plan and the
    // scene lines say this NPC is doing while the record is pending.
    activityOverride: 'waiting to talk to you',
    utility: {
      baseAppeal: 0.30,
      motive: { weight: OVERTURE.motiveWeight },
      holdTicks: OVERTURE.lapseTicks,
      // One axis, and the one that literally names the behaviour: how readily
      // this character opens. Disinhibition already differentiates the desire
      // path (D12) and openness already differentiates the curiosity one
      // (rumination grows curiosity by it), so a second copy of either here
      // would be double-counting.
      temperamentWeights: { assertiveness: 0.25 },
      // Intimacy & Voyeurism Phase 8 (D12): the DESIRE BIAS TERM — the one
      // thing D5's "needs do not motivate overtures" deliberately excepts.
      // `utility.need` stays absent (a depletion curve must never open a
      // conversation); `utility.desire` is a want, and a genuinely horny NPC
      // (high npc.needs.desire) is more likely to actually act on the desire
      // motive that won this overture. D12's bias term, never a gate; only
      // entries whose motives can carry 'desire' declare it.
      desire: DESIRE.scoring,
      // Intimacy & Voyeurism Phase 9 (D13): desire's bias PARTNER. Where
      // `utility.desire` rewards how much an NPC wants, `utility.willingness`
      // weights the same candidates by how game they actually are (their own
      // willingness toward an advance from the player — same function the
      // player's Make-a-Move and Phase 13's pair acts read). A floored NPC —
      // asleep, hostile, actively refusing, or a stranger — is dropped from
      // the candidate list entirely, so a desire-motive overture can never
      // fire for someone who would refuse an advance (design invariant 1).
      // Bias only, and only when the desire motive actually won.
      willingness: WILLINGNESS.scoring,
    },
  },

  // --- Phase 4: the text ---------------------------------------------------
  // Was a DRIVE with seven hardcoded strings and a `social` need gate. It is an
  // overture now (D8), which costs it the need — D5 keeps `utility.need` off
  // every entry in this table — and buys it a reason. What it texts about is
  // OVERTURE_TEXT_TEMPLATES keyed by the motive that won.
  //
  // The channel that reaches across the flat, and the only one that reaches
  // OUT of it: `proximity: 'remote'` is what lets an NPC text a player who is
  // not home, which is exactly the case the other three cannot cover. Its
  // do-not-disturb set is EMPTY on purpose and that is not an oversight — a
  // text is the channel that does not disturb. It waits in a thread until the
  // player looks.
  //
  // baseAppeal sits below the approach's so that an NPC who can walk over
  // walks over: at equal motive strength 0.22 + m loses to 0.30 + m every
  // time, and the two are only ever both candidates when the NPC is adjacent.
  // Out of adjacency the approach is not a candidate at all and this is what
  // is left, which is the behaviour without a single line deciding it.
  text_player: {
    channel: 'text',
    motives: ['curiosity', 'grievance', 'affection', 'desire'],
    blockFilter: ['leisure', 'evening', 'wind_down', 'work', 'morning'],
    cooldownMinutes: OVERTURE.textCooldownMinutes,
    proximity: 'remote',
    doNotDisturb: [],
    awaitsAnswer: false,
    sendsText: true,
    utility: {
      baseAppeal: 0.22,
      motive: { weight: OVERTURE.motiveWeight },
      // Texting is the low-nerve option — you do not have to be in the room or
      // catch anyone's eye — so assertiveness is weighted BELOW the approach's,
      // and warmth carries the rest. This is the split the old drive already
      // authored (warmth 0.25 / assertiveness 0.15 against the in-person
      // drives' assertiveness-first weighting); it survives the move.
      temperamentWeights: { warmth: 0.20, assertiveness: 0.10 },
      // Intimacy & Voyeurism Phase 8 (D12): the desire bias term — see
      // approach_player's note. A horny NPC is more likely to reach out by
      // text than to leave it alone.
      desire: DESIRE.scoring,
      // Intimacy & Voyeurism Phase 9 (D13): desire's bias partner — see
      // approach_player's note. A floored NPC never texts a desire motive.
      willingness: WILLINGNESS.scoring,
    },
  },

  // --- Phase 4: the proposal ----------------------------------------------
  // The only overture about the FUTURE. It books a real commitment record
  // through COMMITMENTS, so accepting binds the NPC's schedule exactly as a
  // dinner invitation does — the difference is who asked (D8).
  //
  // Motives: affection alone, and this is a decision rather than an omission
  // (D30). Curiosity and grievance are about a THING and are answered by
  // talking now, not by scheduling; and a charged proposal has no different
  // outcome to point at until Phase 5's shared activities exist, which makes
  // it exactly the tone-with-no-consequence D12 forbids. Warm only, one motive,
  // until there is something for the other tones to mean.
  //
  // baseAppeal is the highest in the table so that a proposal does not lose its
  // tick to a chore, and it still loses to a starving NPC's eat, which is D5's
  // ordering.
  //
  // Its ORIGINAL justification was "a day-long cooldown and one live motive
  // already make it scarce", and Phase 6 measured that false in both halves:
  // the day-long cooldown never elapsed at all (D34), so the observed scarcity
  // was the bug rather than the design. Swept at the working cooldown, this
  // number is NOT the lever — 0.20 / 0.24 / 0.28 / 0.34 give 0.381 / 0.405 /
  // 0.429 / 0.435 proposals per NPC per day, a 14% span, because a proposal is
  // rarely in competition when it is a candidate at all (it needs adjacency,
  // affection over the gift threshold, AND a free slot the proposer's own
  // schedule allows). The cooldown is the lever and it is set above. Left at
  // 0.34 deliberately: retuning a constant that does not move the number is
  // how a table acquires figures nobody can account for.
  propose_player: {
    channel: 'propose',
    motives: ['affection'],
    blockFilter: ['leisure', 'evening', 'wind_down'],
    cooldownMinutes: OVERTURE.proposeCooldownMinutes,
    proximity: 'adjacent',
    doNotDisturb: ['sleeping', 'showering', 'masturbating', 'in_conversation', 'locked_door'],
    awaitsAnswer: true,
    waitAt: 'player',
    activityOverride: 'waiting on your answer',
    // What accepting creates. The kind is a COMMITMENT_KINDS key, and the terms
    // (which day, which window, which room) are picked in the tick and carried
    // on the record — a proposal that could not name when would be a mood.
    proposes: { kind: 'hangout' },
    respond: { accept: 'Say yes to {name}', decline: 'Turn {name} down' },
    refusalFacts: OVERTURE_PROPOSE_REFUSAL_FACTS,
    utility: {
      baseAppeal: 0.34,
      motive: { weight: OVERTURE.motiveWeight },
      holdTicks: OVERTURE.lapseTicks,
      temperamentWeights: { assertiveness: 0.25, warmth: 0.15 },
    },
  },

  // --- Vocation plan D18 (Phase 6): the collab ask -------------------------
  // A creator asks the player to help with their work. A FIFTH ROW, not a
  // fifth channel: it rides `propose` because it is structurally a proposal —
  // stand in front of you, name a day and a room, wait for an answer, book a
  // commitment if you say yes — and everything channel-keyed (proximity, the
  // do-not-disturb registry, the waiting behaviour) already does the right
  // thing for it. What differs is what is being asked, and that is carried by
  // `arrivalTemplates` and `proposes`.
  //
  // The gate that matters is not here but in OVERTURE's OVERTURE_CANDIDACY:
  // content work, real affection, low tension. Motives are affection-only
  // deliberately — the other channels list desire and curiosity and grievance,
  // and NONE of those should be able to produce this ask. Being wanted is not
  // a reason to be asked to help at work, and being resented certainly is not.
  //
  // The long cooldown is the other half of the design. Asked once and turned
  // down, they take the refusal and let it lie (the refusal fact says exactly
  // that); the standard refusal economy then diminishes the motive on top.
  collab_ask: {
    channel: 'propose',
    motives: ['affection'],
    blockFilter: ['evening', 'wind_down'],
    cooldownMinutes: 4320,   // three days — this is not a thing you get asked twice a week
    proximity: 'adjacent',
    doNotDisturb: ['sleeping', 'showering', 'masturbating', 'in_conversation', 'locked_door'],
    awaitsAnswer: true,
    waitAt: 'player',
    activityOverride: 'waiting on your answer',
    proposes: { kind: 'content_collab' },
    arrivalTemplates: OVERTURE_COLLAB_TEMPLATES,
    respond: { accept: 'Tell {name} you are in', decline: 'Turn {name} down' },
    refusalFacts: OVERTURE_COLLAB_REFUSAL_FACTS,
    utility: {
      // Above propose_player's 0.34: by the time this is a candidate at all
      // the candidacy has already required a close, untroubled relationship
      // and the right job, so when the conditions are met it should actually
      // happen rather than lose every tick to an ordinary hangout proposal.
      baseAppeal: 0.40,
      motive: { weight: OVERTURE.motiveWeight },
      holdTicks: OVERTURE.lapseTicks,
      // Asking this takes nerve, and an unguarded person asks sooner.
      temperamentWeights: { assertiveness: 0.3, openness: 0.2 },
    },
  },

  // --- Phase 4: the knock --------------------------------------------------
  // The journey D26 named. Everything else in this table needs the player
  // reachable; this one needs them SHUT AWAY, which is why `locked_door` moves
  // from the do-not-disturb list to `requires`. It is the same registry entry
  // read the other way up, so the two lists can never disagree about what a
  // closed door is.
  //
  // `waitAt: 'here'` matters as much as the candidacy: a knocker who got pulled
  // into the player's room by the hold would have walked through the door they
  // were knocking on. They stay on their side and the record ages out there.
  //
  // The remaining do-not-disturb entries are the approach's minus the door. A
  // roommate who knows you are asleep and knocks anyway is the harassment D9
  // exists to prevent; someone walking in on a locked bathroom is
  // interruption.js's job and already modelled.
  knock_player: {
    channel: 'knock',
    motives: ['curiosity', 'grievance', 'affection', 'desire'],
    blockFilter: ['leisure', 'evening', 'wind_down', 'morning'],
    cooldownMinutes: OVERTURE.knockCooldownMinutes,
    proximity: 'outside',
    requires: ['locked_door'],
    doNotDisturb: ['sleeping', 'showering', 'masturbating', 'in_conversation'],
    awaitsAnswer: true,
    waitAt: 'here',
    activityOverride: 'waiting at your door',
    respond: { accept: 'Open the door for {name}', decline: 'Leave {name} at the door' },
    refusalFacts: OVERTURE_KNOCK_REFUSAL_FACTS,
    emitsSignal: { signal: 'knocking', intensity: SIGNALS_EMIT.knocking },
    utility: {
      // Below the approach's: crossing a room is ordinary and knocking on a
      // door someone shut is not, so it should take more wanting. The two are
      // never both candidates (one needs the door open, the other shut), so
      // this gradient is a statement about the bar rather than a tiebreak.
      baseAppeal: 0.26,
      motive: { weight: OVERTURE.motiveWeight },
      // Longer than the others. A knock is answered by crossing a room and
      // opening a door, which is more than glancing up, and two ticks is one
      // in-game hour of it going unanswered before it lapses.
      holdTicks: OVERTURE.lapseTicks + 1,
      temperamentWeights: { assertiveness: 0.30 },
      // Intimacy & Voyeurism Phase 8 (D12): the desire bias term — see
      // approach_player's note. A horny NPC shut outside your door is more
      // likely to knock on it than to walk away.
      desire: DESIRE.scoring,
      // Intimacy & Voyeurism Phase 9 (D13): desire's bias partner — see
      // approach_player's note. A floored NPC never knocks with a desire
      // motive.
      willingness: WILLINGNESS.scoring,
    },
  },
};

// --- NPC Peeping (Phase 6): the mirror of the player's peep system.
// NPCs with the right personality profile (high openness + low
// conscientiousness, or high affection toward the player) can attempt to
// peep on the player during vulnerable states. Most peeps are silent —
// the player never knows. If the player's perception beats the NPC's
// stealth, the player catches them and a bubble appears (reusing the
// Phase 5 interruption bubble system). ---
const NPC_PEEP_TUNING = {
  baseChance: 0.08,            // per-tick probability (after gates + condition)
  // The attempt cooldown is DRIVE_DEFS.peep_player.cooldownMinutes — that's
  // the one evaluateDrives enforces. A second copy lived here and was read
  // by nothing; the two could drift with no error.
  chanceModifiers: {
    openness: 0.3,            // high openness (curiosity) → more likely
    lowConscientiousness: 0.25, // low consc (boundary-willing) → more likely
    affection: 0.2,           // high affection (attraction) → more likely
  },
  // NPC stealth: (conscientiousness+1)*0.3 + rng*0.4 — methodical NPCs
  // are sneakier. Player perception must exceed this to catch them.
  perception: {
    base: 0.3,
    energyHighBonus: 0.15,    // +0.15 if energy > 70
    energyLowPenalty: 0.2,    // -0.2 if energy < 20
    moodLowPenalty: 0.1,      // -0.1 if mood < -0.5
    min: 0.05,
    max: 0.95,
    // Perception plan Phase 1 (D8): how hard temperament pushes an NPC's
    // general attention, in SIM's getNpcPerception. Raw npcCuriosity spans
    // [-0.3, +0.55] — applied undamped that clamped an incurious NPC to the
    // 0.05 floor, i.e. functionally blind to every signal in the game, and
    // sent a nosy one past the player's own ceiling. At 0.5 the cast spans
    // roughly 0.15-0.58 against a player's 0.30-0.45: real spread, nobody
    // blind, and being perceptive is a genuine character difference.
    npcCuriosityWeight: 0.5,
  },
  // Silent success consequences (player never knows)
  silentRelDelta: {
    positiveAffection: 0.03,  // if warmth > 0: quiet attraction build
    negativeTension: 0.02,   // if warmth < 0: awkward guilt
  },
  // Caught consequences (player catches NPC peeping). The per-response
  // deltas in NPC_PEEP_RESPONSES are what applyNpcPeepConsequences
  // actually applies — these two are the unused generic fallbacks, kept
  // only as the documented baseline the response numbers are tuned around.
  caughtTensionDelta: 0.12,
  caughtAffectionDelta: -0.05,
};

// --- Phone snooping (BrineOS Phase 9) ---
// The mirror of NPC_PEEP_TUNING's personality gate, reused deliberately
// (plan 9.2) rather than invented fresh — same curiosity math, same shape.
// No stealth/perception contest like peeping has: there's no equivalent of
// "the player catches them in the act", because by construction the player
// isn't in the room (decision C's 'elsewhere' case — the whole point is
// leaving the phone somewhere). Un-derived, so it needed its own block
// rather than reusing NPC_PEEP_TUNING directly.
const SNOOP_TUNING = {
  baseChance: 0.05,           // per-tick, after gates — slightly rarer than a peep attempt
  chanceModifiers: {
    openness: 0.3,
    lowConscientiousness: 0.25,
    affection: 0.2,
    // First mechanical use of personality.traits (previously prompt-flavour
    // only, plan 9.2) — a bounded modifier on top of the temperament
    // formula, not a second gate, so a "curious"-tagged NPC with dull
    // temperament numbers still needs the roll to clear minDrawn.
    curiousTrait: 0.15,
  },
  minDrawn: 0.15,              // below this, don't even roll (mirrors tryNpcPeep's 0.15/0.1 floor)
  // Evidence strength (9.5): scales with what's actually on the phone — a
  // roll of photos and open IM threads is a bigger find than an empty one.
  // richnessNormalizer caps the count that maxes out the bonus; tune here,
  // never inline.
  baseStrength: 0.3,
  richnessNormalizer: 6,
  richnessStrengthBonus: 0.5,
  // 'general' (SUSPICION_SUBJECTS) — currently read by nothing (confirmed:
  // ui.js's confrontation trigger hardcodes 'boundary_violation'), so this
  // is deliberately an inert signal for now: the snooping NPC now carries
  // private knowledge/guilt they didn't have before, available for a
  // future system to build on, not wired to today's confrontation flow.
  suspicionDelta: 0.15,
};

// Player response options when catching an NPC peeping
const NPC_PEEP_RESPONSES = {
  confront: {
    label: 'What are you doing?!',
    tensionDelta: 0.08,
    affectionDelta: -0.03,
  },
  invite: {
    label: '...come in.',
    // If NPC warmth > 0: relationship can shift romantically
    // If NPC warmth < 0: NPC flees awkwardly (handled in resolution)
    warmthThreshold: 0,
    positiveAffectionDelta: 0.08,
    positiveTensionDelta: -0.05,
    negativeTensionDelta: 0.05,
  },
  cold: {
    label: 'Get out.',
    tensionDelta: 0.15,
    affectionDelta: -0.08,
  },
};

// Per-NPC drive cooldown tracking (in-memory, reset on load)
// Stored as npc.flags._driveCooldowns = { driveId: absoluteMinute }
// (clockToAbsolute space — day*1440 + minutes, npc-initiative-retiming D2)
const DRIVE_COOLDOWN_KEY = '_driveCooldowns';

// --- Save system v2 (inventory overhaul Phase 9, D9/D10) ---
// VN-style multi-slot saves on kv (see STATE's SAVE_KEYS / captureSave).
// Slot model: 12 base manual slots (more are allocated on demand when the
// base grid is full), a 5-deep rotating autosave ring (oldest overwritten),
// one quicksave, one exit-save. Every record stores runId + parentSaveId +
// saveIndex so the branching-tree view is a later pure-UI addition (D9).
// The menu renders cards from kv.saveIndex (a lightweight summary list) and
// NEVER deserializes a payload to draw a card.
const GAME_VERSION = '0.12.0'; // bump whenever a save-affecting schema change ships

const SAVE_TUNING = {
  manualBaseSlots: 12,       // manual_0..manual_11; grow on demand above this
  autosaveDepth: 5,          // auto_0..auto_4, oldest overwritten first
  maxTotalSaves: 30,         // hard cap across all kinds (incl. grown manual slots)
  warnNearLimit: 3,          // warn in the save menu when fewer than this many slots are free
  // saveAtBoundary reasons that ALSO write a rotating autosave record. The
  // 30s timer is the autosave; every other boundary just flushes the live
  // folders (writing a full snapshot on ~60 different reasons would rotate
  // the ring mid-session and bury every meaningful point).
  recordReasons: ['timer'],
};

// ===== /SECTION: CONFIG =====
